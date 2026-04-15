import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { streamRun, resumeRun, resumeRunWithBudget, stopRun, getRunTimeline, getRunStatus } from '../lib/api';

const STOPPABLE_STATUSES = ['created', 'running', 'awaiting_human'];

export function useRunStream({ resolveRunId, onFetchRecentRuns, isDeveloperMode = false }) {
  const [runId, setRunId] = useState('');
  const [status, setStatus] = useState('idle');
  const [currentNode, setCurrentNode] = useState('-');
  const [initialTokenBudget, setInitialTokenBudget] = useState(null);
  const [remainingTokens, setRemainingTokens] = useState(null);
  const [events, setEvents] = useState([]);
  const [output, setOutput] = useState('');
  const [runDetails, setRunDetails] = useState(null);
  const [decisionAudit, setDecisionAudit] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionState, setConnectionState] = useState('idle');
  const [lastUpdateAt, setLastUpdateAt] = useState(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastTransientError, setLastTransientError] = useState('');
  const [stoppingRunId, setStoppingRunId] = useState('');

  const runStartedAt = useRef(null);
  const runIdRef = useRef('');
  const lastSeqRef = useRef(0);
  const activeStreamControllerRef = useRef(null);
  const mountedRef = useRef(true);
  const autoBudgetTopUpRef = useRef(new Set());

  useEffect(() => () => {
    mountedRef.current = false;
    if (activeStreamControllerRef.current) {
      activeStreamControllerRef.current.abort();
      activeStreamControllerRef.current = null;
    }
  }, []);

  const resetRunState = useCallback(() => {
    if (activeStreamControllerRef.current) {
      activeStreamControllerRef.current.abort();
      activeStreamControllerRef.current = null;
    }
    runStartedAt.current = null;
    runIdRef.current = '';
    lastSeqRef.current = 0;
    setRunId('');
    setStatus('idle');
    setCurrentNode('-');
    setInitialTokenBudget(null);
    setRemainingTokens(null);
    setEvents([]);
    setOutput('');
    setRunDetails(null);
    setDecisionAudit([]);
    setLoading(false);
    setError('');
    setConnectionState('idle');
    setLastUpdateAt(null);
    setReconnectCount(0);
    setLastTransientError('');
    setStoppingRunId('');
    autoBudgetTopUpRef.current.clear();
  }, []);

  function handleEvent(evt) {
    if (!mountedRef.current || !evt || !evt.event) return;
    setLastUpdateAt(new Date().toISOString());
    if (evt.event === 'run_started') {
      runStartedAt.current = Date.now();
      runIdRef.current = evt.data.run_id || '';
      setRunId(evt.data.run_id);
      setStatus(evt.data.status);
      setCurrentNode(evt.data.current_node);
      if (evt.data.initial_token_budget != null) setInitialTokenBudget(Number(evt.data.initial_token_budget));
      if (evt.data.token_budget_remaining != null) setRemainingTokens(Number(evt.data.token_budget_remaining));
      return;
    }

    if (evt.event === 'timeline') {
      const nextStatus = String(evt.data.status || '');
      setStatus(nextStatus);
      setCurrentNode(evt.data.current_node);
      if (evt.data.initial_token_budget != null) setInitialTokenBudget(Number(evt.data.initial_token_budget));
      if (evt.data.token_budget_remaining != null) setRemainingTokens(Number(evt.data.token_budget_remaining));
      setEvents((prev) => {
        const next = [...prev.filter((x) => x.seq !== evt.data.seq), evt.data];
        lastSeqRef.current = Math.max(lastSeqRef.current, Number(evt.data.seq || 0));
        return next.sort((a, b) => a.seq - b.seq);
      });

      const timelineRunId = String(evt.data.run_id || runIdRef.current || runId || '').trim();
      if (timelineRunId) {
        runIdRef.current = timelineRunId;
        if (timelineRunId !== runId) setRunId(timelineRunId);
      }

      if (isDeveloperMode && nextStatus === 'budget_exhausted' && timelineRunId && !autoBudgetTopUpRef.current.has(timelineRunId)) {
        autoBudgetTopUpRef.current.add(timelineRunId);
        setLastTransientError('Developer mode: auto-resuming with larger budget.');
        void resumeWithBudgetTopUp(60000, timelineRunId);
      }
      return;
    }

    if (evt.event === 'awaiting_approval') {
      const awaitingRunId = String(evt.data?.run_id || runIdRef.current || runId || '').trim();
      if (awaitingRunId) {
        runIdRef.current = awaitingRunId;
        if (awaitingRunId !== runId) setRunId(awaitingRunId);
        void Promise.all([reloadTimeline(awaitingRunId), loadRunDetails(awaitingRunId)]);
      }
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
      if (evt.data.run_id) {
        void loadRunDetails(evt.data.run_id);
      }
    }
  }

  async function executeStreaming(task, retryTag = 'run') {
    if (activeStreamControllerRef.current) {
      activeStreamControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeStreamControllerRef.current = controller;
    setConnectionState('connecting');
    let attempts = 0;
    let done = false;
    while (!done && attempts < 3) {
      try {
        attempts += 1;
        setConnectionState('live');
        await task(controller.signal);
        done = true;
        setLastTransientError('');
      } catch (err) {
        if (controller.signal.aborted || !mountedRef.current) {
          return;
        }
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
    if (activeStreamControllerRef.current === controller) {
      activeStreamControllerRef.current = null;
    }
  }

  async function startRun({ objective, highImpact, tokenBudget, uploadedContext }) {
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
    setLastTransientError('');
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      await executeStreaming(
        (signal) =>
          streamRun(
            {
              objective,
              high_impact: highImpact,
              token_budget: tokenBudget,
              uploaded_context: uploadedContext,
            },
            handleEvent,
            { signal, idempotencyKey }
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

  async function submitDecision(decision, reviewerNotes) {
    const activeRunId = resolveRunId(runId) || resolveRunId(runIdRef.current) || runIdRef.current || runId;
    if (!activeRunId) {
      setError('Active run context is missing. Reload timeline and try again.');
      return;
    }
    if (!reviewerNotes.trim()) {
      setError('Reviewer note is required before approve/reject.');
      return;
    }
    setLoading(true);
    setError('');
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const note = reviewerNotes.trim();
      runIdRef.current = activeRunId;
      if (activeRunId !== runId) setRunId(activeRunId);
      setDecisionAudit((prev) => [...prev, { ts: new Date().toISOString(), decision, notes: note }]);
      await executeStreaming(
        (signal) =>
          resumeRun(
            activeRunId,
            {
              decision,
              reviewer: 'human_operator',
              notes: note,
            },
            handleEvent,
            { lastEventId: lastSeqRef.current || undefined, signal, idempotencyKey }
          ),
        'resume'
      );
      await loadRunDetails(activeRunId);
    } catch (err) {
      setError(String(err.message || err));
      setConnectionState('degraded');
    } finally {
      setLoading(false);
    }
  }

  async function resumeWithBudgetTopUp(budgetIncrease, targetRunId = runId) {
    const effectiveRunId = resolveRunId(targetRunId) || String(targetRunId || '').trim();
    if (!effectiveRunId) {
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
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      await executeStreaming(
        (signal) =>
          resumeRunWithBudget(
            effectiveRunId,
            { additional_budget: Math.floor(added) },
            handleEvent,
            { lastEventId: lastSeqRef.current || undefined, signal, idempotencyKey }
          ),
        'resume'
      );
      await Promise.all([reloadTimeline(effectiveRunId), loadRunDetails(effectiveRunId)]);
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
      if (onFetchRecentRuns) {
        await onFetchRecentRuns();
      }
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
        if (onFetchRecentRuns) await onFetchRecentRuns();
        return;
      }
      setError(message);
    }
  }

  async function loadRunDetails(targetRunId = runId) {
    const resolvedRunId = resolveRunId(targetRunId);
    if (!resolvedRunId) return;
    try {
      const details = await getRunStatus(resolvedRunId);
      runIdRef.current = resolvedRunId;
      if (resolvedRunId !== runId) setRunId(resolvedRunId);
      setRunDetails(details);
      setInitialTokenBudget(Number(details.initial_token_budget || 0));
      if (details.token_budget_remaining != null) setRemainingTokens(Number(details.token_budget_remaining));
      setOutput(details.final_output || details.output || '');
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function selectRun(targetRunId) {
    const resolvedRunId = resolveRunId(targetRunId);
    if (!resolvedRunId) return;
    setRunId(resolvedRunId);
    runIdRef.current = resolvedRunId;
    await Promise.all([reloadTimeline(resolvedRunId), loadRunDetails(resolvedRunId)]);
  }

  const canStopCurrentRun = Boolean(runId && STOPPABLE_STATUSES.includes(String(status || '').toLowerCase()));
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events]);

  return {
    runId,
    status,
    currentNode,
    initialTokenBudget,
    remainingTokens,
    events,
    sortedEvents,
    output,
    runDetails,
    decisionAudit,
    loading,
    error,
    setError,
    connectionState,
    lastUpdateAt,
    reconnectCount,
    lastTransientError,
    stoppingRunId,
    canStopCurrentRun,
    startRun,
    submitDecision,
    resumeWithBudgetTopUp,
    stopTargetRun,
    reloadTimeline,
    loadRunDetails,
    selectRun
    ,
    resetRunState
  };
}
