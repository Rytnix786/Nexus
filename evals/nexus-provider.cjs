const API_BASE = process.env.NEXUS_API_BASE_URL || 'http://localhost:8000';

function parseSse(text) {
  const events = [];
  const blocks = String(text || '').split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      continue;
    }

    let eventName = 'message';
    let dataPayload = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      }
      if (line.startsWith('data:')) {
        dataPayload += line.slice('data:'.length).trim();
      }
    }

    let data = dataPayload;
    try {
      data = JSON.parse(dataPayload);
    } catch (_err) {
      // Keep raw data as string when JSON parsing fails.
    }

    events.push({ event: eventName, data });
  }

  return events;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startRunAndGetRunId(apiBase, apiKey, payload) {
  // Generate JWT token for authentication
  const jwtSecret = process.env.JWT_SECRET || 'replace_with_strong_jwt_secret';
  const jwt = require('jsonwebtoken');
  
  const token = jwt.sign(
    { sub: `promptfoo-evaluator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, role: 'operator' },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  const response = await fetch(`${apiBase}/api/runs/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nexus API error: ${response.status} ${response.statusText} ${body}`);
  }

  if (!response.body) {
    throw new Error('Nexus stream response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let runId = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const events = parseSse(block + '\n\n');
        for (const evt of events) {
          if (evt.event === 'run_started' && evt.data && typeof evt.data === 'object') {
            runId = String(evt.data.run_id || '');
          }
          if (!runId && evt.event === 'run_finished' && evt.data && typeof evt.data === 'object') {
            runId = String(evt.data.run_id || '');
          }
          if (runId) {
            return runId;
          }
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch (_err) {
      // Ignore cancel errors.
    }
  }

  throw new Error('Unable to extract run_id from Nexus SSE stream');
}

async function pollRunUntilTerminal(apiBase, apiKey, runId, maxWaitMs = 180000) {
  const terminal = new Set(['completed', 'failed', 'stopped', 'rejected', 'timeout', 'budget_exhausted']);
  const startedAt = Date.now();
  let latest = null;

  // Generate JWT token for authentication
  const jwtSecret = process.env.JWT_SECRET || 'replace_with_strong_jwt_secret';
  const jwt = require('jsonwebtoken');
  
  const token = jwt.sign(
    { sub: `promptfoo-evaluator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, role: 'operator' },
    jwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

  while (Date.now() - startedAt < maxWaitMs) {
    const response = await fetch(`${apiBase}/api/runs/${runId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      latest = await response.json();
      const status = String(latest.status || '').toLowerCase();
      if (terminal.has(status)) {
        return latest;
      }
    }

    await sleep(3000);
  }

  if (latest) {
    return latest;
  }

  throw new Error(`Timed out waiting for run ${runId} to reach terminal status`);
}

function extractFinalOutput(events) {
  const runFinished = [...events].reverse().find((evt) => evt.event === 'run_finished' && evt.data && typeof evt.data === 'object');
  if (runFinished) {
    const status = String(runFinished.data.status || '').toLowerCase();
    const output = String(runFinished.data.output || '').trim();
    if (status === 'rejected' && !output.includes('INSUFFICIENT_CONTEXT')) {
      return 'INSUFFICIENT_CONTEXT: The available sources did not contain enough information to produce a reliable report.';
    }
    return output || `Run finished with status: ${status || 'unknown'}`;
  }

  const timelineLast = [...events].reverse().find((evt) => evt.event === 'timeline' && evt.data && typeof evt.data === 'object');
  if (timelineLast && timelineLast.data && timelineLast.data.message) {
    return String(timelineLast.data.message);
  }

  return 'No output returned from Nexus run stream';
}

module.exports = class NexusSseProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'nexus-sse-provider';
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const vars = (context && context.vars) || {};
    const apiKey = process.env.NEXUS_API_KEY || process.env.API_KEY || '';

    if (!apiKey) {
      return {
        error: 'Missing NEXUS_API_KEY or API_KEY environment variable',
        output: '',
      };
    }

    const payload = {
      objective: String(vars.objective || prompt || '').trim(),
      uploaded_context: String(vars.context || ''),
      high_impact: false,
      token_budget: 8000,
    };

    try {
      const runId = await startRunAndGetRunId(API_BASE, apiKey, payload);
      const run = await pollRunUntilTerminal(API_BASE, apiKey, runId, 180000);
      const status = String(run.status || '').toLowerCase();
      const output = String(run.final_output || run.output || '').trim();
      const normalizedOutput =
        status === 'rejected' && !output.includes('INSUFFICIENT_CONTEXT')
          ? 'INSUFFICIENT_CONTEXT: The available sources did not contain enough information to produce a reliable report.'
          : output || `Run finished with status: ${status || 'unknown'}`;

      return {
        output: normalizedOutput,
        metadata: {
          prompt,
          objective: payload.objective,
          runId,
          status,
          currentNode: String(run.current_node || ''),
          tokenBudgetRemaining: Number(run.token_budget_remaining || 0),
        },
      };
    } catch (err) {
      return {
        error: String(err && err.message ? err.message : err),
        output: '',
      };
    }
  }
};
