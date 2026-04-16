import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setAuthToken } from '../lib/api';
import { decodeJwtPayload, isJwtExpired, isJwtLikeToken } from '../lib/jwt';
import { useRunStream } from '../hooks/useRunStream';
import { useRuns } from '../hooks/useRuns';

const STORAGE_KEYS = {
  authToken: 'nexus.authToken',
  authTokenDraft: 'nexus.authTokenDraft',
  currentTab: 'nexus.currentTab',
  selectedRunId: 'nexus.selectedRunId',
};

const DEFAULT_AUTH_STATE = {
  status: 'idle',
  message: '',
  claims: null,
  tokenShape: 'none',
};

const NexusAppContext = createContext(null);

function readStorage(key) {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in hardened UI flow.
  }
}

function clearStorage(key) {
  writeStorage(key, '');
}

function pickPreferredRun(recentRuns, storedRunId) {
  const runs = Array.isArray(recentRuns) ? recentRuns : [];
  if (storedRunId) {
    const exact = runs.find((run) => String(run.run_id || '') === storedRunId);
    if (exact) return String(exact.run_id || '');
  }

  const active = runs.find((run) => ['created', 'running', 'awaiting_human', 'budget_exhausted'].includes(String(run.status || '').toLowerCase()));
  if (active) return String(active.run_id || '');

  return String(runs[0]?.run_id || '');
}

export function NexusAppProvider({ children }) {
  const [currentTab, setCurrentTabState] = useState(() => readStorage(STORAGE_KEYS.currentTab) || 'dashboard');
  const [authToken, setAuthTokenState] = useState(() => readStorage(STORAGE_KEYS.authToken));
  const [authTokenDraft, setAuthTokenDraftState] = useState(() => readStorage(STORAGE_KEYS.authTokenDraft) || readStorage(STORAGE_KEYS.authToken));
  const [authState, setAuthState] = useState(DEFAULT_AUTH_STATE);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [selectedResultRunId, setSelectedResultRunId] = useState('');
  const restoreAttemptRef = useRef('');

  const runs = useRuns();
  const isDeveloperMode = useMemo(() => {
    const active = String(authToken || '').trim();
    const draft = String(authTokenDraft || '').trim();
    return active.startsWith('dev_nexus_') || draft.startsWith('dev_nexus_');
  }, [authToken, authTokenDraft]);
  const runStream = useRunStream({
    resolveRunId: runs.resolveRunId,
    onFetchRecentRuns: runs.fetchRecentRuns,
    isDeveloperMode,
  });

  const resetRunHistory = useCallback(() => {
    runs.clearRecentRuns();
    runs.clearMetrics();
    runs.clearError();
    runStream.resetRunState();
  }, [runs, runStream]);

  const setAuthTokenDraft = useCallback((value) => {
    const nextValue = String(value || '');
    setAuthTokenDraftState(nextValue);
    writeStorage(STORAGE_KEYS.authTokenDraft, nextValue);
  }, []);

  const setCurrentTab = useCallback((tab) => {
    const nextTab = String(tab || 'dashboard');
    setCurrentTabState(nextTab);
    writeStorage(STORAGE_KEYS.currentTab, nextTab);
  }, []);

  const applyAuthToken = useCallback(async (nextToken) => {
    const token = String(nextToken || '').trim();

    if (!token) {
      setAuthToken('');
      setAuthTokenDraft('');
      setAuthTokenState('');
      setAuthState(DEFAULT_AUTH_STATE);
      clearStorage(STORAGE_KEYS.authToken);
      clearStorage(STORAGE_KEYS.selectedRunId);
      resetRunHistory();
      return { ok: true, authMode: 'none' };
    }

    const jwtLike = isJwtLikeToken(token);
    const claims = jwtLike ? decodeJwtPayload(token) : null;
    if (jwtLike && !claims) {
      setAuthToken('');
      setAuthTokenState('');
      clearStorage(STORAGE_KEYS.authToken);
      clearStorage(STORAGE_KEYS.selectedRunId);
      setAuthState({ status: 'invalid', message: 'The supplied JWT could not be decoded.', claims: null, tokenShape: 'jwt' });
      resetRunHistory();
      return { ok: false, authMode: 'jwt', reason: 'invalid' };
    }

    if (claims && isJwtExpired(claims)) {
      setAuthToken('');
      setAuthTokenState('');
      clearStorage(STORAGE_KEYS.authToken);
      clearStorage(STORAGE_KEYS.selectedRunId);
      setAuthState({ status: 'expired', message: 'The supplied JWT is expired.', claims, tokenShape: 'jwt' });
      resetRunHistory();
      return { ok: false, authMode: 'jwt', reason: 'expired' };
    }

    setAuthState({
      status: 'loading',
      message: jwtLike ? 'Loading run history from JWT.' : 'Loading run history from bearer token.',
      claims,
      tokenShape: jwtLike ? 'jwt' : 'opaque',
    });
    // Use the candidate token immediately so validation requests are authenticated.
    setAuthToken(token);
    writeStorage(STORAGE_KEYS.authToken, token);
    setAuthTokenDraft(token);

    const runsResult = await runs.fetchRecentRuns();
    const metricsResult = await runs.fetchSystemMetrics();

    if (runsResult?.authError) {
      setAuthToken('');
      setAuthTokenState('');
      clearStorage(STORAGE_KEYS.authToken);
      clearStorage(STORAGE_KEYS.selectedRunId);
      setAuthState({
        status: 'unauthorized',
        message: 'Token was rejected by the API.',
        claims,
        tokenShape: jwtLike ? 'jwt' : 'opaque',
      });
      resetRunHistory();
      return { ok: false, authMode: jwtLike ? 'jwt' : 'opaque', reason: 'unauthorized' };
    }

    // Metrics is optional - don't fail auth flow if metrics endpoint fails
    const metricsWarning = metricsResult?.forbiddenRole
      ? ' Metrics endpoint is restricted for this role.'
      : '';

    if (!runsResult?.ok) {
      setAuthToken(token);
      setAuthTokenState(token);
      setAuthState({
        status: 'ready',
        message: `Bearer token accepted, but run history could not be restored.${metricsWarning}`,
        claims,
        tokenShape: jwtLike ? 'jwt' : 'opaque',
      });
      return { ok: true, authMode: jwtLike ? 'jwt' : 'opaque', reason: 'history_sync_failed' };
    }

    setAuthToken(token);
    setAuthTokenState(token);
    setAuthState({
      status: 'ready',
      message: `${jwtLike ? 'JWT accepted. History restored.' : 'Bearer token accepted. History restored.'}${metricsWarning}`,
      claims,
      tokenShape: jwtLike ? 'jwt' : 'opaque',
    });
    return { ok: true, authMode: jwtLike ? 'jwt' : 'opaque' };
  }, [resetRunHistory, runs]);

  const selectRun = useCallback(async (runId) => {
    const resolvedRunId = runs.resolveRunId(runId);
    if (!resolvedRunId) return;
    writeStorage(STORAGE_KEYS.selectedRunId, resolvedRunId);
    await runStream.selectRun(resolvedRunId);
    setCurrentTab('active');
  }, [runs.resolveRunId, runStream, setCurrentTab]);

  const startRun = useCallback(async (payload) => {
    setCurrentTab('dashboard');
    await runStream.startRun(payload);
    if (runStream.runId) writeStorage(STORAGE_KEYS.selectedRunId, runStream.runId);
  }, [runStream, setCurrentTab]);

  const appValue = useMemo(() => ({
    currentTab,
    setCurrentTab,
    authToken,
    authTokenDraft,
    isDeveloperMode,
    setAuthTokenDraft,
    authState,
    applyAuthToken,
    recentRuns: runs.recentRuns,
    recentRunsLoading: runs.recentRunsLoading,
    runExplorerTotal: runs.runExplorerTotal,
    runExplorerPage: runs.runExplorerPage,
    setRunExplorerPage: runs.setRunExplorerPage,
    searchText: runs.searchText,
    setSearchText: runs.setSearchText,
    statusFilter: runs.statusFilter,
    setStatusFilter: runs.setStatusFilter,
    dateFrom: runs.dateFrom,
    setDateFrom: runs.setDateFrom,
    dateTo: runs.dateTo,
    setDateTo: runs.setDateTo,
    systemMetrics: runs.systemMetrics,
    systemMetricsLoading: runs.systemMetricsLoading,
    refreshSystemMetrics: runs.fetchSystemMetrics,
    resolveRunId: runs.resolveRunId,
    runsError: runs.error,
    runStream,
    selectRun,
    startRun,
    bootstrapped,
    selectedResultRunId,
    setSelectedResultRunId,
  }), [
    applyAuthToken,
    authState,
    authToken,
    authTokenDraft,
    bootstrapped,
    currentTab,
    isDeveloperMode,
    runs.dateFrom,
    runs.dateTo,
    runs.error,
    runs.recentRuns,
    runs.recentRunsLoading,
    runs.resolveRunId,
    runs.runExplorerPage,
    runs.runExplorerTotal,
    runs.searchText,
    runs.setDateFrom,
    runs.setDateTo,
    runs.setRunExplorerPage,
    runs.setSearchText,
    runs.setStatusFilter,
    runs.statusFilter,
    runs.systemMetricsLoading,
    runs.systemMetrics,
    runs.fetchSystemMetrics,
    runStream,
    selectRun,
    selectedResultRunId,
    setCurrentTab,
    startRun,
  ]);

  useEffect(() => {
    if (bootstrapped) return;
    setBootstrapped(true);
    if (authToken) {
      void applyAuthToken(authToken);
    }
  }, [applyAuthToken, authToken, bootstrapped]);

  useEffect(() => {
    if (authTokenDraft) {
      writeStorage(STORAGE_KEYS.authTokenDraft, authTokenDraft);
    }
  }, [authTokenDraft]);

  useEffect(() => {
    if (authState.status !== 'ready') return;
    if (runStream.runId) return;
    const preferredRunId = pickPreferredRun(runs.recentRuns, readStorage(STORAGE_KEYS.selectedRunId));
    if (!preferredRunId || restoreAttemptRef.current === preferredRunId) return;
    restoreAttemptRef.current = preferredRunId;
    void selectRun(preferredRunId);
  }, [authState.status, runStream.runId, runs.recentRuns, selectRun]);

  useEffect(() => {
    if (authState.status !== 'ready') return;
    void runs.fetchRecentRuns();
  }, [
    authState.status,
    runs.fetchRecentRuns,
    runs.runExplorerPage,
    runs.searchText,
    runs.statusFilter,
    runs.dateFrom,
    runs.dateTo,
  ]);

  // Auto-navigate to the Results tab when a run finishes
  useEffect(() => {
    if (runStream.status === 'completed' && runStream.runId) {
      setSelectedResultRunId(runStream.runId);
      setCurrentTab('results');
    }
  }, [runStream.status, runStream.runId, setCurrentTab]);

  useEffect(() => {
    if (runStream.runId) {
      writeStorage(STORAGE_KEYS.selectedRunId, runStream.runId);
    }
  }, [runStream.runId]);

  return <NexusAppContext.Provider value={appValue}>{children}</NexusAppContext.Provider>;
}

export function useNexusApp() {
  const context = useContext(NexusAppContext);
  if (!context) {
    throw new Error('useNexusApp must be used within NexusAppProvider');
  }
  return context;
}