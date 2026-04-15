export const PIPELINE_NODES = ['planner', 'researcher', 'analyst', 'writer', 'human_approval', 'critic', 'finalize'];
export const TERMINAL_STATUSES = ['completed', 'failed', 'rejected', 'timeout', 'budget_exhausted'];
export const GRAPH_EDGES = [
  ['planner', 'researcher'],
  ['researcher', 'researcher'],
  ['researcher', 'analyst'],
  ['analyst', 'writer'],
  ['writer', 'human_approval'],
  ['writer', 'critic'],
  ['human_approval', 'critic'],
  ['critic', 'writer'],
  ['critic', 'finalize'],
];

export function statusTone(status) {
  if (status === 'completed') return 'good';
  if (status === 'awaiting_human') return 'warn';
  if (status === 'failed' || status === 'rejected' || status === 'timeout' || status === 'budget_exhausted') return 'danger';
  return 'accent';
}

export function statusClass(status) {
  const tone = statusTone(status);
  if (tone === 'good') return 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30';
  if (tone === 'warn') return 'bg-amber-300/15 text-amber-100 ring-amber-200/30';
  if (tone === 'danger') return 'bg-rose-400/15 text-rose-200 ring-rose-300/30';
  return 'bg-cyan-400/15 text-cyan-200 ring-cyan-300/30';
}

export function prettyStatus(status) {
  return String(status || 'idle').replaceAll('_', ' ');
}

export function formatElapsedSeconds(evt, runStartedAt) {
  const eventTimestamp = evt.ts ? Date.parse(evt.ts) : Number.NaN;
  if (runStartedAt && !Number.isNaN(eventTimestamp)) {
    const elapsed = Math.max(0, Math.round((eventTimestamp - runStartedAt) / 1000));
    return `+${elapsed}s`;
  }

  const fallbackSeconds = Math.max(0, Number(evt.seq || 1) - 1);
  return `+${fallbackSeconds}s`;
}

export function timelineEventStyles(eventType) {
  const styles = {
    plan_created: { pill: 'bg-purple-400/15 text-purple-200', border: 'border-l-purple-400/40' },
    research_completed: { pill: 'bg-blue-400/15 text-blue-200', border: 'border-l-blue-400/40' },
    analysis_done: { pill: 'bg-cyan-400/15 text-cyan-200', border: 'border-l-cyan-400/40' },
    draft_written: { pill: 'bg-amber-400/15 text-amber-200', border: 'border-l-amber-400/40' },
    critique_done: { pill: 'bg-orange-400/15 text-orange-200', border: 'border-l-orange-400/40' },
    human_checkpoint: { pill: 'bg-rose-400/15 text-rose-200', border: 'border-l-rose-400/40' },
    finalized: { pill: 'bg-emerald-400/15 text-emerald-200', border: 'border-l-emerald-400/40' },
    node_error: { pill: 'bg-red-500/20 text-red-200', border: 'border-l-red-500/50' },
  };

  return styles[eventType] || { pill: 'bg-white/10 text-white/70', border: 'border-l-white/20' };
}

export function parseTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return Number.NaN;
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text);
  const normalized = hasZone ? text : `${text}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Date.parse(text) : parsed;
}

export function prettyDate(ts) {
  const ms = parseTimestamp(ts);
  if (Number.isNaN(ms)) return '-';
  return new Date(ms).toLocaleString();
}

export function relativeTimeLabel(value) {
  const timestamp = parseTimestamp(value);
  if (Number.isNaN(timestamp)) return '-';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function sentenceCase(value) {
  const label = String(value || '').replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function safePct(used, total) {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, (used / total) * 100));
}