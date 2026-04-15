import { useEffect, useMemo, useRef, useState } from 'react';
import { getRunStatus, getRunTimeline, getSystemMetrics, listRuns, resumeRun, resumeRunWithBudget, setAuthSessionPrefix, setAuthToken, stopRun, streamRun, uploadSources } from './lib/api';
import RunExplorer from './components/RunExplorer';
import MissionControl from './components/MissionControl';
import TraceTimeline from './components/TraceTimeline';
import SystemMetricsPanel from './components/SystemMetricsPanel';

function statusTone(status) {
  if (status === 'completed') return 'good';
  if (status === 'awaiting_human') return 'warn';
  if (status === 'failed' || status === 'stopped' || status === 'rejected' || status === 'timeout' || status === 'budget_exhausted') return 'danger';
  return 'accent';
}

function statusClass(status) {
  const tone = statusTone(status);
  if (tone === 'good') return 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30';
  if (tone === 'warn') return 'bg-amber-300/15 text-amber-100 ring-amber-200/30';
  if (tone === 'danger') return 'bg-rose-400/15 text-rose-200 ring-rose-300/30';
  return 'bg-cyan-400/15 text-cyan-200 ring-cyan-300/30';
}

function prettyStatus(status) {
  return String(status || 'idle').replaceAll('_', ' ');
}

function parseTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return Number.NaN;
  // Backend often returns naive ISO timestamps; treat them as UTC to avoid local timezone drift.
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text);
  const normalized = hasZone ? text : `${text}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Date.parse(text) : parsed;
}

function relativeTimeLabel(value) {
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

const PIPELINE_NODES = ['planner', 'researcher', 'analyst', 'writer', 'human_approval', 'critic', 'finalize'];
const TERMINAL_STATUSES = ['completed', 'failed', 'stopped', 'rejected', 'timeout', 'budget_exhausted'];
const STOPPABLE_STATUSES = ['created', 'running', 'awaiting_human'];

function sentenceCase(value) {
  const label = String(value || '').replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function AgentPipeline({ currentNode, status }) {
  const currentIndex = PIPELINE_NODES.indexOf(currentNode);

  return (
    <div className="mb-6 rounded-[24px] border border-white/15 bg-black/20 px-4 py-4 backdrop-blur-xl sm:px-5">
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {PIPELINE_NODES.map((node, index) => {
          const isActive = node === currentNode;
          const isCompleted = status === 'completed' || (currentIndex !== -1 && index < currentIndex);
          const isTerminalError = (status === 'failed' || status === 'stopped' || status === 'rejected') && isActive;

          let pillClass = 'bg-white/5 border border-white/15 text-white/40';
          if (status === 'completed' || isCompleted) {
            pillClass = 'bg-emerald-400/15 border border-emerald-300/30 text-emerald-200';
          } else if (isTerminalError) {
            pillClass = 'bg-rose-400/20 border border-rose-300/50 text-rose-200';
          } else if (isActive) {
            pillClass = 'bg-cyan-400/20 border border-cyan-300/50 text-cyan-100 animate-pulse';
          }

          return (
            <div key={node} className="flex min-w-max items-center gap-3">
              <span className={`whitespace-nowrap text-[11px] px-3 py-1 rounded-full ${pillClass}`}>
                {sentenceCase(node)}
              </span>
              {index < PIPELINE_NODES.length - 1 && <hr className="h-px w-8 border-white/10" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunMetrics({ status, sortedEvents, tokenBudget, remainingTokens }) {
  const { totalSteps, totalTokensUsed, nodesVisited, criticRevisionCycles } = useMemo(() => {
    const totalStepsValue = sortedEvents.length;
    const totalTokensUsedValue = Math.max(0, Number(tokenBudget || 0) - Number(remainingTokens || 0));
    const uniqueNodes = [];
    let criticEvents = 0;

    for (const evt of sortedEvents) {
      if (evt.node === 'critic') criticEvents += 1;
      if (!uniqueNodes.includes(evt.node)) uniqueNodes.push(evt.node);
    }

    return {
      totalSteps: totalStepsValue,
      totalTokensUsed: totalTokensUsedValue,
      nodesVisited: uniqueNodes,
      criticRevisionCycles: criticEvents > 0 ? criticEvents - 1 : 0,
    };
  }, [remainingTokens, sortedEvents, tokenBudget]);

  return (
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Total Steps</p>
        <p className="mt-2 text-3xl font-semibold text-white">{totalSteps}</p>
      </article>

      <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Total Tokens Used</p>
        <p className="mt-2 text-3xl font-semibold text-white">{totalTokensUsed}</p>
      </article>

      <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Critic Revision Cycles</p>
        <p className="mt-2 text-3xl font-semibold text-white">{criticRevisionCycles}</p>
      </article>

      <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Run Outcome</p>
        <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset capitalize ${statusClass(status)}`}>
          {prettyStatus(status)}
        </div>
        <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-white/50">Nodes Visited</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {nodesVisited.map((node) => (
            <span key={node} className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
              {node}
            </span>
          ))}
        </div>
      </article>
    </section>
  );
}

const GRAPH_EDGES = [
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

function safePct(used, total) {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function prettyDate(ts) {
  const ms = parseTimestamp(ts);
  if (Number.isNaN(ms)) return '-';
  return new Date(ms).toLocaleString();
}

function deriveSessionRole(token) {
  const value = String(token || '').trim();
  if (!value) return 'operator';

  try {
    const payloadPart = value.split('.')[1] || '';
    const payload = JSON.parse(atob(payloadPart));
    return String(payload.role || 'operator').toLowerCase();
  } catch {
    return 'admin';
  }
}

function textDiff(a, b) {
  const left = String(a || '').split('\n');
  const right = String(b || '').split('\n');
  const length = Math.max(left.length, right.length);
  const out = [];
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? '';
    const r = right[i] ?? '';
    if (l === r) {
      out.push(`  ${r}`);
    } else {
      if (l) out.push(`- ${l}`);
      if (r) out.push(`+ ${r}`);
    }
  }
  return out.join('\n');
}

export default function App() {
  const [objective, setObjective] = useState('Build a resilient launch strategy for a multi-agent platform.');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedContext, setUploadedContext] = useState('');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploading, setUploading] = useState(false);
  const [authToken, setAuthTokenValue] = useState('');
  const [sessionRole, setSessionRole] = useState('operator');
  const [highImpact, setHighImpact] = useState(true);
  const [tokenBudget, setTokenBudget] = useState(9000);
  const [runId, setRunId] = useState('');
  const [status, setStatus] = useState('idle');
  const [currentNode, setCurrentNode] = useState('-');
  const [initialTokenBudget, setInitialTokenBudget] = useState(null);
  const [remainingTokens, setRemainingTokens] = useState(null);
  const [events, setEvents] = useState([]);
  const [output, setOutput] = useState('');
  const [runDetails, setRunDetails] = useState(null);
  const [selectedNode, setSelectedNode] = useState('');
  const [inspectedEventSeq, setInspectedEventSeq] = useState(null);
  const [timelineVisibleCount, setTimelineVisibleCount] = useState(120);
  const [activeMainTab, setActiveMainTab] = useState('timeline');
  const [artifactTab, setArtifactTab] = useState('draft');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [budgetIncrease, setBudgetIncrease] = useState(4000);
  const [decisionAudit, setDecisionAudit] = useState([]);

  const [recentRuns, setRecentRuns] = useState([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(false);
  const [runExplorerTotal, setRunExplorerTotal] = useState(0);
  const [runExplorerPage, setRunExplorerPage] = useState(1);
  const [stoppingRunId, setStoppingRunId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [systemMetricsOpen, setSystemMetricsOpen] = useState(false);
  const [systemMetrics, setSystemMetrics] = useState({
    total_runs: 0,
    runs_by_status: {},
    avg_token_usage_per_run: 0,
    avg_steps_per_run: 0,
    runs_last_24h: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionState, setConnectionState] = useState('idle');
  const [lastUpdateAt, setLastUpdateAt] = useState(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastTransientError, setLastTransientError] = useState('');
  const runStartedAt = useRef(null);
  const runIdRef = useRef('');
  const lastSeqRef = useRef(0);
  const perPage = 12;

  function resolveRunId(candidate) {
    const raw = String(candidate || '').trim();
    if (!raw) return '';
    const exact = recentRuns.find((run) => String(run.run_id || '') === raw);
    if (exact) return String(exact.run_id);
    const expanded = recentRuns.find((run) => String(run.run_id || '').startsWith(raw));
    return expanded ? String(expanded.run_id) : raw;
  }

  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events]);
  const filteredEvents = useMemo(
    () => (selectedNode ? sortedEvents.filter((evt) => evt.node === selectedNode) : sortedEvents),
    [selectedNode, sortedEvents]
  );
  const visibleTimelineEvents = useMemo(() => filteredEvents.slice(Math.max(0, filteredEvents.length - timelineVisibleCount)), [filteredEvents, timelineVisibleCount]);
  const budgetBase = Number(initialTokenBudget ?? runDetails?.initial_token_budget ?? 0);
  const remaining = remainingTokens == null ? null : Number(remainingTokens);
  const usedTokens = remaining == null ? null : Math.max(0, budgetBase - remaining);
  const tokenUsage = usedTokens == null ? null : safePct(usedTokens, budgetBase);
  const effectiveSessionRole = useMemo(() => deriveSessionRole(authToken), [authToken]);
  const expectedNodePath = highImpact ? 'planner -> researcher -> analyst -> writer -> human_approval -> critic -> finalize' : 'planner -> researcher -> analyst -> writer -> critic -> finalize';
  const estimatedTokenCost = Math.max(1200, Math.floor(objective.trim().length * 4.2) + (highImpact ? 2200 : 1700));
  const budgetWarning = tokenBudget < estimatedTokenCost;
  const staleWarning = Boolean(lastUpdateAt && Date.now() - Date.parse(lastUpdateAt) > 45000 && status === 'running');
  const canRetryStream = Boolean(lastTransientError && runId);
  const canStart = !loading && !uploading && objective.trim().length > 4;
  const canStopCurrentRun = Boolean(runId && STOPPABLE_STATUSES.includes(String(status || '').toLowerCase()));

  function isAuthError(err) {
    return String(err?.message || err).includes('401');
  }

  useEffect(() => {
    setAuthToken(authToken);
    try {
      const payload = JSON.parse(atob(String(authToken || '').split('.')[1] || ''));
      setAuthSessionPrefix(String(payload.sub || payload.email || 'session'));
    } catch {
      setAuthSessionPrefix('session');
    }
  }, [authToken]);

  useEffect(() => {
    fetchRecentRuns();
    fetchSystemMetrics();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchRecentRuns();
        fetchSystemMetrics();
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  function onTokenChange(value) {
    setAuthTokenValue(value);
    setAuthToken(value);
    setSessionRole(deriveSessionRole(value));
  }

  function handleEvent(evt) {
    setLastUpdateAt(new Date().toISOString());
    if (evt.event === 'run_started') {
      runStartedAt.current = Date.now();
      runIdRef.current = evt.data.run_id || '';
      setRunId(evt.data.run_id);
      setStatus(evt.data.status);
      setCurrentNode(evt.data.current_node);
      setInitialTokenBudget(Number(evt.data.initial_token_budget ?? tokenBudget));
      if (evt.data.token_budget_remaining != null) setRemainingTokens(Number(evt.data.token_budget_remaining));
      return;
    }

    if (evt.event === 'timeline') {
      setStatus(evt.data.status);
      setCurrentNode(evt.data.current_node);
      if (evt.data.initial_token_budget != null) setInitialTokenBudget(Number(evt.data.initial_token_budget));
      if (evt.data.token_budget_remaining != null) setRemainingTokens(Number(evt.data.token_budget_remaining));
      setEvents((prev) => {
        const next = [...prev.filter((x) => x.seq !== evt.data.seq), evt.data];
        lastSeqRef.current = Math.max(lastSeqRef.current, Number(evt.data.seq || 0));
        return next.sort((a, b) => a.seq - b.seq);
      });
      return;
    }

    if (evt.event === 'awaiting_approval') {
      setStatus('awaiting_human');
      setCurrentNode('human_approval');
      return;
    }

    if (evt.event === 'run_finished') {
      if (evt.data.run_id) runIdRef.current = evt.data.run_id;
      setStatus(evt.data.status);
      setCurrentNode(evt.data.current_node);
      if (evt.data.initial_token_budget != null) setInitialTokenBudget(Number(evt.data.initial_token_budget));
      if (evt.data.token_budget_remaining != null) setRemainingTokens(Number(evt.data.token_budget_remaining));
      setOutput(evt.data.output || '');
    }
  }

  async function executeStreaming(task, retryTag = 'run') {
    setConnectionState('connecting');
    let attempts = 0;
    let done = false;
    while (!done && attempts < 3) {
      try {
        attempts += 1;
        setConnectionState('live');
        await task();
        done = true;
        setLastTransientError('');
      } catch (err) {
        const message = String(err.message || err);
        setLastTransientError(message);
        if (!message.includes('429') && !message.includes('5') && !message.toLowerCase().includes('network')) {
          throw err;
        }
        if (attempts >= 3) throw err;
        setReconnectCount((prev) => prev + 1);
        await reloadTimeline(runIdRef.current || runId);
      }
    }
    setConnectionState(retryTag === 'run' ? 'idle' : 'live');
  }

  async function startRun() {
    setLoading(true);
    setError('');
    setRunId('');
    runIdRef.current = '';
    setEvents([]);
    setOutput('');
    setRunDetails(null);
    setInitialTokenBudget(Number(tokenBudget));
    setRemainingTokens(Number(tokenBudget));
    setDecisionAudit([]);
    setSelectedNode('');
    setInspectedEventSeq(null);
    setLastTransientError('');

    try {
      await executeStreaming(
        () =>
          streamRun(
            {
              objective,
              high_impact: highImpact,
              token_budget: tokenBudget,
              uploaded_context: uploadedContext,
            },
            handleEvent
          ),
        'run'
      );
      const latestRunId = runIdRef.current || runId;
      if (latestRunId) await loadRunDetails(latestRunId);
    } catch (err) {
      setError(String(err.message || err));
      setConnectionState('degraded');
    } finally {
      setLoading(false);
    }
  }

  async function submitDecision(decision) {
    if (!runId || !reviewerNotes.trim()) {
      setError('Reviewer note is required before approve/reject.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const note = reviewerNotes.trim();
      setDecisionAudit((prev) => [...prev, { ts: new Date().toISOString(), decision, notes: note }]);
      await executeStreaming(
        () =>
          resumeRun(
            runId,
            {
              decision,
              reviewer: 'human_operator',
              notes: note,
            },
            handleEvent,
            { lastEventId: lastSeqRef.current || undefined }
          ),
        'resume'
      );
      await loadRunDetails(runId);
      setReviewerNotes('');
    } catch (err) {
      setError(String(err.message || err));
      setConnectionState('degraded');
    } finally {
      setLoading(false);
    }
  }

  async function resumeWithBudgetTopUp() {
    if (!runId) {
      setError('Select a run before resuming with more budget.');
      return;
    }
    const added = Number(budgetIncrease || 0);
    if (!Number.isFinite(added) || added < 500) {
      setError('Budget increase must be at least 500 tokens.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await executeStreaming(
        () =>
          resumeRunWithBudget(
            runId,
            { additional_budget: Math.floor(added) },
            handleEvent,
            { lastEventId: lastSeqRef.current || undefined }
          ),
        'resume'
      );
      await Promise.all([reloadTimeline(runId), loadRunDetails(runId)]);
    } catch (err) {
      setError(String(err.message || err));
      setConnectionState('degraded');
    } finally {
      setLoading(false);
    }
  }

  async function stopTargetRun(targetRunId = runId) {
    const resolvedRunId = resolveRunId(targetRunId);
    if (!resolvedRunId) {
      setError('Select a run before requesting stop.');
      return;
    }

    setStoppingRunId(resolvedRunId);
    setError('');
    try {
      await stopRun(resolvedRunId, { reason: 'Stopped from mission control UI.' });
      if (resolvedRunId === runId) {
        await Promise.all([reloadTimeline(resolvedRunId), loadRunDetails(resolvedRunId)]);
      }
      await fetchRecentRuns();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setStoppingRunId('');
    }
  }

  async function reloadTimeline(targetRunId = runId) {
    const resolvedRunId = resolveRunId(targetRunId);
    if (!resolvedRunId) return;
    try {
      const timeline = await getRunTimeline(resolvedRunId);
      runIdRef.current = resolvedRunId;
      if (resolvedRunId !== runId) setRunId(resolvedRunId);
      setEvents(timeline.events || []);
      setStatus(timeline.status || status);
      setCurrentNode(timeline.current_node || currentNode);
      setInitialTokenBudget(Number(timeline.initial_token_budget || 0));
      if (timeline.token_budget_remaining != null) setRemainingTokens(Number(timeline.token_budget_remaining));
      setLastUpdateAt(new Date().toISOString());
    } catch (err) {
      const message = String(err.message || err);
      if (message.includes('404')) {
        setError('Timeline sync failed: run not found. Please re-select a run from Run Explorer.');
        await fetchRecentRuns();
        return;
      }
      setError(message);
    }
  }

  async function loadRunDetails(targetRunId = runId) {
    const resolvedRunId = resolveRunId(targetRunId);
    if (!resolvedRunId) return;
    const details = await getRunStatus(resolvedRunId);
    runIdRef.current = resolvedRunId;
    if (resolvedRunId !== runId) setRunId(resolvedRunId);
    setRunDetails(details);
    setInitialTokenBudget(Number(details.initial_token_budget || 0));
    if (details.token_budget_remaining != null) setRemainingTokens(Number(details.token_budget_remaining));
    setOutput(details.final_output || details.output || '');
  }

  async function fetchRecentRuns() {
    setRecentRunsLoading(true);
    try {
      const payload = await listRuns({
        limit: perPage,
        offset: (runExplorerPage - 1) * perPage,
        search: searchText,
        status: statusFilter,
        startedFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : '',
        startedTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : '',
      });
      setRecentRuns(payload.runs || []);
      setRunExplorerTotal(Number(payload.total || 0));
    } catch (err) {
      if (isAuthError(err)) return;
      setError(String(err.message || err));
    } finally {
      setRecentRunsLoading(false);
    }
  }

  async function handleUploadFiles(fileList) {
    const files = Array.from(fileList || []);
    setUploadedFiles(files);
    if (files.length === 0) {
      setUploadedContext('');
      setUploadSummary('');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const payload = await uploadSources(files);
      setUploadedContext(String(payload.combined_context || ''));
      const names = (payload.files || []).map((entry) => entry.filename).join(', ');
      setUploadSummary(`Uploaded: ${names} (${payload.combined_chars || 0} chars context${payload.truncated ? ', truncated' : ''})`);
    } catch (err) {
      setUploadedContext('');
      setUploadedFiles([]);
      setUploadSummary('');
      setError(String(err.message || err));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    fetchRecentRuns();
  }, [runExplorerPage, searchText, statusFilter, dateFrom, dateTo]);

  const approvalRiskFlags = useMemo(() => {
    const flags = [];
    const critique = String(runDetails?.critique || '');
    if (critique && critique.toLowerCase().includes('revision needed')) flags.push('Critique requests revision');
    if ((usedTokens ?? 0) > budgetBase * 0.9 && budgetBase > 0) flags.push('Token burn above 90%');
    if (status === 'failed' || status === 'stopped' || status === 'rejected') flags.push(`Run status: ${status}`);
    return flags;
  }, [budgetBase, runDetails?.critique, status, usedTokens]);

  const artifactDraftHistory = useMemo(
    () => sortedEvents.filter((evt) => evt.event_type === 'draft_written').map((evt) => String(evt.data?.draft || evt.message || '')),
    [sortedEvents]
  );
  const previousDraft = artifactDraftHistory.length > 1 ? artifactDraftHistory[artifactDraftHistory.length - 2] : '';
  const latestDraft = String(runDetails?.draft || output || '');

  const nodeMetrics = useMemo(() => {
    const byNode = {};
    for (let i = 0; i < sortedEvents.length; i += 1) {
      const evt = sortedEvents[i];
      const nowMs = Date.parse(evt.ts || '');
      const nextMs = Date.parse(sortedEvents[i + 1]?.ts || '');
      const duration = !Number.isNaN(nowMs) && !Number.isNaN(nextMs) ? Math.max(0, Math.round((nextMs - nowMs) / 1000)) : 0;
      const burn = Number(evt.data?.tokens_used || 0);
      if (!byNode[evt.node]) byNode[evt.node] = { duration: 0, burn: 0 };
      byNode[evt.node].duration += duration;
      byNode[evt.node].burn += burn;
    }
    return byNode;
  }, [sortedEvents]);

  async function fetchSystemMetrics() {
    try {
      const payload = await getSystemMetrics();
      setSystemMetrics({
        total_runs: Number(payload.total_runs || 0),
        runs_by_status: payload.runs_by_status || {},
        avg_token_usage_per_run: Number(payload.avg_token_usage_per_run || 0),
        avg_steps_per_run: Number(payload.avg_steps_per_run || 0),
        runs_last_24h: Number(payload.runs_last_24h || 0),
      });
    } catch (err) {
      if (isAuthError(err)) return;
      setError(String(err.message || err));
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 pb-10 pt-8 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_6%_12%,rgba(238,138,79,0.22),transparent_34%),radial-gradient(circle_at_90%_8%,rgba(51,212,255,0.22),transparent_36%),radial-gradient(circle_at_40%_90%,rgba(255,77,109,0.18),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1600px]">
        <header className="mb-7 grid gap-4 rounded-[30px] border border-white/15 bg-white/8 p-6 shadow-[0_20px_60px_rgba(8,10,22,0.45)] backdrop-blur-2xl md:grid-cols-[1.7fr_1fr]">
          <div>
            <p className="mb-2 inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/80">
              Nexus Orchestrator
            </p>
            <h1 className="text-balance text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Mission Control For Stateful Multi-Agent Operations
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              Launch, supervise, and audit graph-executed research runs with checkpoint recovery, human approval gates, and live transition telemetry.
            </p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-white/60">Run Pulse</p>
            <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset capitalize backdrop-blur-xl ${statusClass(status)}`}>
              {prettyStatus(status)}
            </div>
            <div className="mt-4 space-y-2 text-sm text-white/85">
              <p><span className="text-white/50">Node:</span> {currentNode}</p>
              <p><span className="text-white/50">Run ID:</span> {runId || '-'}</p>
              <p><span className="text-white/50">Remaining:</span> {remainingTokens}</p>
              <p><span className="text-white/50">Metering:</span> {runDetails?.metering_mode || 'estimated'}</p>
              <p><span className="text-white/50">Quota:</span> {runDetails?.quota_daily_used ?? 0}/{runDetails?.quota_daily_limit ?? 0}</p>
            </div>
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-white/60">
                <span>Token usage</span>
                <span>{Math.round(tokenUsage)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-orange-300 to-rose-300 transition-all duration-500"
                  style={{ width: `${tokenUsage}%` }}
                />
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">System</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/85">
                <p><span className="text-white/50">Total runs:</span> {systemMetrics.total_runs}</p>
                <p><span className="text-white/50">Last 24h:</span> {systemMetrics.runs_last_24h}</p>
              </div>
            </div>
          </div>
        </header>

        <AgentPipeline currentNode={currentNode} status={status} />

        <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <RunExplorer
            searchText={searchText}
            setSearchText={setSearchText}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            recentRuns={recentRuns}
            runId={runId}
            onSelectRun={async (selectedRunId) => {
              setRunId(selectedRunId);
              runIdRef.current = selectedRunId;
              await Promise.all([reloadTimeline(selectedRunId), loadRunDetails(selectedRunId)]);
            }}
            runExplorerPage={runExplorerPage}
            setRunExplorerPage={setRunExplorerPage}
            runExplorerTotal={runExplorerTotal}
            perPage={perPage}
            relativeTimeLabel={relativeTimeLabel}
            prettyStatus={prettyStatus}
            onStopRun={stopTargetRun}
            stoppingRunId={stoppingRunId}
          />

          <div className="grid gap-5">
            <MissionControl
              objective={objective}
              onObjectiveChange={setObjective}
              authToken={authToken}
              onAuthTokenChange={onTokenChange}
              highImpact={highImpact}
              onHighImpactChange={setHighImpact}
              tokenBudget={tokenBudget}
              onTokenBudgetChange={setTokenBudget}
              uploadedFiles={uploadedFiles}
              uploadSummary={uploadSummary}
              uploading={uploading}
              error={error}
              sessionRole={effectiveSessionRole}
              canStart={canStart}
              onUploadFiles={handleUploadFiles}
              onStartMission={startRun}
              onSyncTimeline={reloadTimeline}
              runId={runId}
              loading={loading}
              expectedNodePath={expectedNodePath}
              estimatedTokenCost={estimatedTokenCost}
              currentRunTokenUsage={runDetails?.total_tokens_used ?? 0}
              budgetWarning={budgetWarning}
            />

            <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p className="mb-2">Run control</p>
              <button
                onClick={() => stopTargetRun(runId)}
                disabled={!canStopCurrentRun || stoppingRunId === runId}
                className="min-h-10 rounded-lg border border-rose-300/50 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {stoppingRunId === runId ? 'Stopping Run...' : 'Stop Current Run'}
              </button>

              {status === 'budget_exhausted' && (
                <div className="mt-3 border-t border-rose-200/25 pt-3">
                  <p className="mb-2 text-xs text-rose-100/90">Budget exhausted. Add tokens and resume this run.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={500}
                      step={500}
                      value={budgetIncrease}
                      onChange={(event) => setBudgetIncrease(Number(event.target.value))}
                      className="h-10 w-36 rounded-md border border-rose-300/40 bg-black/35 px-2 py-1 text-right text-sm text-rose-100"
                    />
                    <button
                      onClick={resumeWithBudgetTopUp}
                      disabled={loading}
                      className="min-h-10 rounded-lg border border-cyan-300/40 bg-cyan-400/20 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {loading ? 'Resuming...' : 'Resume With More Budget'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
              <p className="text-xs uppercase tracking-[0.16em] text-white/60">Human gate</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Approval Workbench</h2>

              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white/85">
                  <p>Current status: <span className="font-semibold capitalize">{prettyStatus(status)}</span></p>
                  <p className="mt-1">Draft under review: <span className="text-white/95">{runDetails?.draft ? 'Yes' : 'No'}</span></p>
                  <p className="mt-1">Latest checkpoint: seq {runDetails?.latest_checkpoint_seq ?? '-'} @ {prettyDate(runDetails?.latest_checkpoint_at)}</p>
                  <p className="mt-1">Critique notes: <span className="text-white/95">{runDetails?.critique || 'N/A'}</span></p>
                  <p className="mt-1">Key risk flags: {approvalRiskFlags.length ? approvalRiskFlags.join(' | ') : 'No immediate flags'}</p>
                </div>
                <textarea value={reviewerNotes} onChange={(e) => setReviewerNotes(e.target.value)} placeholder="Reviewer note (required)" className="h-24 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />

                <button
                  onClick={() => submitDecision('approve')}
                  disabled={loading || status !== 'awaiting_human' || !reviewerNotes.trim()}
                  className="min-h-11 w-full rounded-xl bg-emerald-300/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve And Resume
                </button>
                <button
                  onClick={() => submitDecision('reject')}
                  disabled={loading || status !== 'awaiting_human' || !reviewerNotes.trim()}
                  className="min-h-11 w-full rounded-xl bg-rose-300/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reject Run
                </button>
              </div>
              <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-white/55">Approval Audit Timeline</p>
                <div className="mt-2 space-y-1 text-xs text-white/80">
                  {decisionAudit.length === 0 && <p>No approval actions yet.</p>}
                  {decisionAudit.map((item, idx) => <p key={`${item.ts}-${idx}`}>{prettyDate(item.ts)} - {item.decision} - {item.notes}</p>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-4">
          <div className="flex flex-wrap gap-2">
            {['timeline', 'graph', 'artifacts'].map((tab) => (
              <button key={tab} onClick={() => setActiveMainTab(tab)} className={`rounded-lg px-3 py-1.5 text-sm ${activeMainTab === tab ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/5 text-white/70'}`}>
                {sentenceCase(tab)}
              </button>
            ))}
            <span className={`ml-auto rounded-full px-2 py-1 text-xs ${connectionState === 'live' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-amber-400/20 text-amber-100'}`}>Connection: {connectionState}</span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/70">Last update: {prettyDate(lastUpdateAt)}</span>
            {staleWarning && <span className="rounded-full bg-rose-400/20 px-2 py-1 text-xs text-rose-100">Stale data warning</span>}
            {canRetryStream && <button onClick={() => reloadTimeline()} className="rounded-lg border border-white/20 px-2 py-1 text-xs text-white">Retry sync</button>}
          </div>
        </section>

        {activeMainTab === 'timeline' && (
          <section className="mt-6 grid gap-5 lg:grid-cols-2">
            <TraceTimeline
              events={filteredEvents.slice(Math.max(0, filteredEvents.length - timelineVisibleCount))}
              runStartedAt={runStartedAt.current}
              loading={loading}
              inspectedEventSeq={inspectedEventSeq}
              onToggleInspectedEvent={(seq) => setInspectedEventSeq((prev) => (prev === seq ? null : seq))}
              hasMore={filteredEvents.length > visibleTimelineEvents.length}
              onLoadMore={() => setTimelineVisibleCount((prev) => prev + 120)}
            />

            <div className="rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
              <h3 className="text-xl font-semibold text-white">Final Narrative</h3>
              <p className="mt-1 text-sm text-white/65">Writer + critic output with checkpointed completion state.</p>
              <pre className="mt-4 min-h-[480px] whitespace-pre-wrap rounded-2xl border border-white/15 bg-black/40 p-4 text-sm leading-7 text-white/90">
                {output || 'The finalized output will appear after the graph reaches a terminal state.'}
              </pre>
            </div>
          </section>
        )}

        {activeMainTab === 'graph' && (
          <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-6">
            <h3 className="text-xl font-semibold text-white">Realtime Graph</h3>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {PIPELINE_NODES.map((node) => {
                const idx = PIPELINE_NODES.indexOf(node);
                const currentIdx = PIPELINE_NODES.indexOf(currentNode);
                const state = node === currentNode ? 'active' : idx < currentIdx || status === 'completed' ? 'completed' : (status === 'failed' || status === 'stopped' || status === 'rejected') && node === currentNode ? 'failed' : 'pending';
                const tone = state === 'active' ? 'border-cyan-300/60 bg-cyan-300/10 animate-pulse' : state === 'completed' ? 'border-emerald-300/50 bg-emerald-400/10' : state === 'failed' ? 'border-rose-300/50 bg-rose-400/10' : status === 'awaiting_human' && node === 'human_approval' ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/15 bg-white/5';
                return (
                  <button key={node} onClick={() => setSelectedNode(node)} className={`rounded-xl border p-4 text-left ${tone}`}>
                    <p className="text-sm font-semibold text-white">{sentenceCase(node)}</p>
                    <p className="mt-1 text-xs text-white/70">State: {state}</p>
                    <p className="mt-1 text-xs text-white/60">Token burn: {nodeMetrics[node]?.burn || 0}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white/75">
              <p>Edges: {GRAPH_EDGES.map(([a, b]) => `${a}->${b}`).join(' | ')}</p>
              <p className="mt-1">Active edge animation target: {currentNode}</p>
            </div>
          </section>
        )}

        {activeMainTab === 'artifacts' && (
          <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-6">
            <h3 className="text-xl font-semibold text-white">Approval-safe Artifacts</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['plan', 'Plan'],
                ['research_notes', 'Research Notes'],
                ['analysis', 'Analysis'],
                ['draft', 'Draft'],
                ['critique', 'Critique'],
                ['final_output', 'Final Output'],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setArtifactTab(key)} className={`rounded-lg px-3 py-1.5 text-sm ${artifactTab === key ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/5 text-white/70'}`}>{label}</button>
              ))}
            </div>
            <pre className="mt-4 min-h-[220px] whitespace-pre-wrap rounded-xl border border-white/15 bg-black/40 p-4 text-sm text-white/85">
              {artifactTab === 'research_notes'
                ? (runDetails?.research_notes || []).join('\n\n')
                : String(runDetails?.[artifactTab] || output || 'No artifact yet.')}
            </pre>
            <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-white/55">Changed Since Last Writer Pass</p>
              <p className="mt-1 text-xs text-white/80">{artifactDraftHistory.length > 1 ? 'Draft has revisions since previous writer pass.' : 'No draft revision history yet.'}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.12em] text-white/55">Simple Draft Diff</p>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/15 bg-black/40 p-2 text-xs text-white/80">{textDiff(previousDraft, latestDraft) || 'No diff yet.'}</pre>
            </div>
          </section>
        )}

        {TERMINAL_STATUSES.includes(status) && (
          <RunMetrics
            status={status}
            sortedEvents={sortedEvents}
            tokenBudget={budgetBase}
            remainingTokens={remaining ?? 0}
          />
        )}

        {TERMINAL_STATUSES.includes(status) && (
          <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-5">
            <h3 className="text-xl font-semibold text-white">Post-run Scorecard</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm text-white/85">
              <p>Completion reason: {status}</p>
              <p>Retries: {reconnectCount}</p>
              <p>Approvals: {decisionAudit.filter((x) => x.decision === 'approve').length}</p>
              <p>Estimated cost: {usedTokens ?? 0} tokens ({tokenUsage == null ? '--' : `${tokenUsage.toFixed(1)}%`})</p>
              <p>Revision cycles: {sortedEvents.filter((evt) => evt.node === 'critic').length}</p>
              <p>Checkpoint: {runDetails?.latest_checkpoint_seq ?? '-'}</p>
            </div>
          </section>
        )}

        <SystemMetricsPanel
          metrics={systemMetrics}
          loading={false}
          open={systemMetricsOpen}
          onToggle={() => setSystemMetricsOpen((prev) => !prev)}
        />

        <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">Recent Runs</h3>
              <p className="mt-1 text-sm text-white/65">Browse previous executions and load timeline history in one click.</p>
            </div>
            <button
              onClick={fetchRecentRuns}
              disabled={recentRunsLoading}
              className="min-h-10 rounded-xl border border-white/30 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {recentRunsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/15 bg-black/20">
            <div className="grid grid-cols-[0.9fr_0.7fr_2.5fr_0.7fr] gap-3 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.14em] text-white/55">
              <span>Run ID</span>
              <span>Status</span>
              <span>Objective</span>
              <span>Started</span>
            </div>

            {recentRuns.length === 0 && (
              <div className="px-4 py-5 text-sm text-white/50">No runs found yet.</div>
            )}

            {recentRuns.map((run) => (
              <button
                key={run.run_id}
                onClick={async () => {
                  setRunId(run.run_id);
                  runIdRef.current = run.run_id;
                  await Promise.all([reloadTimeline(run.run_id), loadRunDetails(run.run_id)]);
                }}
                className="grid w-full grid-cols-[0.9fr_0.7fr_2.5fr_0.7fr] gap-3 border-t border-white/10 px-4 py-3 text-left transition hover:bg-white/8"
              >
                <span className="text-sm font-medium text-cyan-100">{String(run.run_id || '').slice(0, 8)}</span>
                <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusClass(run.status)}`}>
                  {prettyStatus(run.status)}
                </span>
                <span className="text-sm text-white/80">{String(run.objective || '').slice(0, 60)}</span>
                <span className="text-sm text-white/60">{relativeTimeLabel(run.started_at)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
