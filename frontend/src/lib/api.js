const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
let runtimeToken = '';
let runtimeIdempotencyPrefix = '';

export function setAuthToken(token) {
  runtimeToken = (token || '').trim();
}

export function setAuthSessionPrefix(prefix) {
  runtimeIdempotencyPrefix = (prefix || '').trim();
}

function authHeaders(extra = {}) {
  const auth = runtimeToken ? { Authorization: `Bearer ${runtimeToken}` } : {};
  return {
    ...auth,
    ...extra,
  };
}

export async function getHealth() {
  const res = await fetch(`${API_BASE}/health`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function getRunStatus(runId) {
  const res = await fetch(`${API_BASE}/runs/${runId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Status failed: ${res.status}`);
  return res.json();
}

export async function getRunTimeline(runId) {
  const res = await fetch(`${API_BASE}/runs/${runId}/timeline`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Timeline failed: ${res.status}`);
  return res.json();
}

export async function stopRun(runId, payload = {}) {
  const res = await fetch(`${API_BASE}/runs/${runId}/stop`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await buildHttpError('Stop run failed', res);
  return res.json();
}

export async function listRuns({
  limit = 20,
  offset = 0,
  search = '',
  status = '',
  startedFrom = '',
  startedTo = '',
} = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (search.trim()) params.set('search', search.trim());
  if (status.trim()) params.set('status', status.trim());
  if (startedFrom) params.set('started_from', startedFrom);
  if (startedTo) params.set('started_to', startedTo);

  const res = await fetch(`${API_BASE}/runs?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`List runs failed: ${res.status}`);
  return res.json();
}

export async function getSystemMetrics() {
  const res = await fetch(`${API_BASE}/metrics`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Metrics failed: ${res.status}`);
  return res.json();
}

export async function uploadSources(files) {
  const form = new FormData();
  for (const file of files || []) {
    form.append('files', file);
  }
  const res = await fetch(`${API_BASE}/uploads`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

async function buildHttpError(prefix, res) {
  let detail = '';
  try {
    const payload = await res.json();
    detail = String(payload?.detail || '').trim();
  } catch {
    detail = '';
  }

  if (res.status === 401) {
    const hint = 'Provide a valid bearer credential in the token field (JWT or API_KEY).';
    return new Error(`${prefix}: ${res.status}${detail ? ` (${detail})` : ''}. ${hint}`);
  }

  return new Error(`${prefix}: ${res.status}${detail ? ` (${detail})` : ''}`);
}

export async function streamRun(payload, onEvent) {
  const idempotencyKey = `${runtimeIdempotencyPrefix || 'run'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${API_BASE}/runs/stream`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }),
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw await buildHttpError('Run start failed', res);
  await parseSse(res.body, onEvent);
}

export async function resumeRun(runId, payload, onEvent, options = {}) {
  const idempotencyKey = options.idempotencyKey || `${runtimeIdempotencyPrefix || 'resume'}-${runId}-${Date.now()}`;
  const res = await fetch(`${API_BASE}/runs/${runId}/resume/stream`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...(options.lastEventId ? { 'Last-Event-ID': String(options.lastEventId) } : {}),
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw await buildHttpError('Run resume failed', res);
  await parseSse(res.body, onEvent);
}

export async function resumeRunWithBudget(runId, payload, onEvent, options = {}) {
  const idempotencyKey = options.idempotencyKey || `${runtimeIdempotencyPrefix || 'resume-budget'}-${runId}-${Date.now()}`;
  const res = await fetch(`${API_BASE}/runs/${runId}/resume-budget/stream`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...(options.lastEventId ? { 'Last-Event-ID': String(options.lastEventId) } : {}),
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw await buildHttpError('Budget resume failed', res);
  await parseSse(res.body, onEvent);
}

async function parseSse(readableStream, onEvent) {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  function emitBlock(rawBlock) {
    const lines = rawBlock.split(/\r?\n/);
    let eventName = 'message';
    const dataLines = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;
    const payloadText = dataLines.join('\n');
    try {
      onEvent({ event: eventName, data: JSON.parse(payloadText) });
    } catch {
      // Ignore malformed payloads and keep streaming subsequent frames.
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const block = buffer.slice(0, boundaryIndex).replace(/\r/g, '');
      buffer = buffer.slice(boundaryIndex + 2);
      emitBlock(block);
      boundaryIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    emitBlock(buffer.replace(/\r/g, ''));
  }
}
