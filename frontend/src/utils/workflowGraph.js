export const WORKFLOW_NODES = [
  { id: 'planner', label: 'Planner' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'analyst', label: 'Analyst' },
  { id: 'writer', label: 'Writer' },
  { id: 'human_approval', label: 'Human Approval' },
  { id: 'refusal', label: 'Refusal Gate' },
  { id: 'critic', label: 'Critic' },
  { id: 'finalize', label: 'Finalizer' },
];

export const WORKFLOW_EDGES = [
  { id: 'e-planner-researcher', source: 'planner', target: 'researcher' },
  { id: 'e-researcher-analyst', source: 'researcher', target: 'analyst' },
  { id: 'e-analyst-writer', source: 'analyst', target: 'writer' },
  { id: 'e-writer-human', source: 'writer', target: 'human_approval' },
  { id: 'e-writer-refusal', source: 'writer', target: 'refusal' },
  { id: 'e-writer-critic', source: 'writer', target: 'critic' },
  { id: 'e-human-finalize', source: 'human_approval', target: 'finalize' },
  { id: 'e-refusal-finalize', source: 'refusal', target: 'finalize' },
  { id: 'e-critic-finalize', source: 'critic', target: 'finalize' },
  { id: 'e-critic-writer', source: 'critic', target: 'writer', loopback: true },
];

const terminalFailureStatuses = new Set(['failed', 'error', 'timeout', 'stopped', 'rejected']);

function coerceNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getEventTokenCount(event) {
  const data = event?.data || {};
  return coerceNumber(
    data.token_count ??
      data.total_tokens ??
      data.tokens_used ??
      data.completion_tokens ??
      data?.usage?.total_tokens
  );
}

export function deriveNodeTokenTotals(sortedEvents = []) {
  const totals = {};
  for (const event of sortedEvents) {
    const nodeId = String(event?.node || '').trim();
    if (!nodeId) continue;
    totals[nodeId] = (totals[nodeId] || 0) + getEventTokenCount(event);
  }
  return totals;
}

export function deriveNodeStatuses(sortedEvents = [], runStatus = '') {
  const statuses = Object.fromEntries(WORKFLOW_NODES.map(({ id }) => [id, 'pending']));
  const latestEventByNode = new Map();

  for (const event of sortedEvents) {
    const nodeId = String(event?.node || '').trim();
    if (!nodeId) continue;
    latestEventByNode.set(nodeId, event);
  }

  for (const { id } of WORKFLOW_NODES) {
    const latestEvent = latestEventByNode.get(id);
    if (!latestEvent) continue;

    const eventType = String(latestEvent?.type || latestEvent?.event_type || '').toLowerCase();
    if (eventType.includes('error') || eventType.includes('failed')) {
      statuses[id] = 'failed';
    } else if (eventType.includes('start') || eventType.includes('running')) {
      statuses[id] = 'running';
    } else if (eventType.includes('end') || eventType.includes('completed') || eventType.includes('done')) {
      statuses[id] = 'completed';
    } else {
      statuses[id] = 'completed';
    }
  }

  if (terminalFailureStatuses.has(String(runStatus).toLowerCase())) {
    for (const nodeId of Object.keys(statuses)) {
      if (statuses[nodeId] === 'running') {
        statuses[nodeId] = 'failed';
      }
    }
  }

  return statuses;
}

export function deriveEdgeStatus(edge, nodeStatuses) {
  const sourceState = nodeStatuses[edge.source] || 'pending';
  const targetState = nodeStatuses[edge.target] || 'pending';

  if (sourceState === 'failed' || targetState === 'failed') return 'failed';
  if (sourceState === 'running' || targetState === 'running') return 'running';
  if (sourceState === 'completed' && targetState === 'completed') return 'completed';
  return 'pending';
}

export function getNodeStyle(status) {
  if (status === 'running') {
    return {
      background: 'linear-gradient(180deg, rgba(193,128,255,0.16), rgba(193,128,255,0.08))',
      border: '1px solid rgba(193,128,255,0.95)',
      color: '#eddcff',
      boxShadow: '0 0 0 1px rgba(193,128,255,0.20), 0 0 24px rgba(193,128,255,0.28)',
      opacity: 1,
    };
  }

  if (status === 'completed') {
    return {
      background: 'linear-gradient(180deg, rgba(0,229,255,0.12), rgba(0,229,255,0.05))',
      border: '1px solid rgba(0,229,255,0.9)',
      color: '#c8fbff',
      boxShadow: '0 0 0 1px rgba(0,229,255,0.12), 0 0 18px rgba(0,229,255,0.14)',
      opacity: 1,
    };
  }

  if (status === 'failed') {
    return {
      background: 'linear-gradient(180deg, rgba(255,113,108,0.14), rgba(255,113,108,0.05))',
      border: '1px solid rgba(255,113,108,0.95)',
      color: '#ffd2cf',
      boxShadow: '0 0 0 1px rgba(255,113,108,0.14), 0 0 18px rgba(255,113,108,0.16)',
      opacity: 1,
    };
  }

  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#a5adba',
    boxShadow: 'none',
    opacity: 0.72,
  };
}

export function getEdgeStyle(status, loopback = false) {
  const style = {
    stroke: 'rgba(104, 110, 124, 0.55)',
    strokeWidth: 1.6,
    opacity: 0.58,
  };

  if (status === 'running') {
    style.stroke = '#c180ff';
    style.strokeWidth = 2.4;
    style.opacity = 1;
    style.filter = 'drop-shadow(0 0 5px rgba(193,128,255,0.45))';
  } else if (status === 'completed') {
    style.stroke = '#00e5ff';
    style.strokeWidth = 2;
    style.opacity = 0.95;
    style.filter = 'drop-shadow(0 0 4px rgba(0,229,255,0.28))';
  } else if (status === 'failed') {
    style.stroke = '#ff716c';
    style.strokeWidth = 2;
    style.opacity = 0.95;
    style.filter = 'drop-shadow(0 0 4px rgba(255,113,108,0.24))';
  }

  if (loopback) {
    style.strokeDasharray = '6 6';
  }

  return style;
}
