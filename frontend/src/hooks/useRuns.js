import { useState, useCallback } from 'react';
import { listRuns, getSystemMetrics } from '../lib/api';

function isAuthError(err) {
  return String(err?.message || err).includes('401');
}

export function useRuns(perPage = 12) {
  const [recentRuns, setRecentRuns] = useState([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(false);
  const [runExplorerTotal, setRunExplorerTotal] = useState(0);
  const [runExplorerPage, setRunExplorerPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState('');

  const [systemMetrics, setSystemMetrics] = useState({
    total_runs: 0,
    runs_by_status: {},
    avg_token_usage_per_run: 0,
    avg_steps_per_run: 0,
    runs_last_24h: 0,
  });

  const fetchRecentRuns = useCallback(async () => {
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
      setError('');
      return { ok: true, payload };
    } catch (err) {
      const message = String(err.message || err);
      setError(message);
      return { ok: false, authError: isAuthError(err), error: message };
    } finally {
      setRecentRunsLoading(false);
    }
  }, [runExplorerPage, searchText, statusFilter, dateFrom, dateTo, perPage]);

  const fetchSystemMetrics = useCallback(async () => {
    try {
      const payload = await getSystemMetrics();
      setSystemMetrics({
        total_runs: Number(payload.total_runs || 0),
        runs_by_status: payload.runs_by_status || {},
        avg_token_usage_per_run: Number(payload.avg_token_usage_per_run || 0),
        avg_steps_per_run: Number(payload.avg_steps_per_run || 0),
        runs_last_24h: Number(payload.runs_last_24h || 0),
      });
      setError('');
      return { ok: true, payload };
    } catch (err) {
      const message = String(err.message || err);
      setError(message);
      return { ok: false, authError: isAuthError(err), error: message };
    }
  }, []);

  const clearRecentRuns = useCallback(() => {
    setRecentRuns([]);
    setRunExplorerTotal(0);
    setRecentRunsLoading(false);
  }, []);

  const clearMetrics = useCallback(() => {
    setSystemMetrics({
      total_runs: 0,
      runs_by_status: {},
      avg_token_usage_per_run: 0,
      avg_steps_per_run: 0,
      runs_last_24h: 0,
    });
  }, []);

  const clearError = useCallback(() => setError(''), []);

  function resolveRunId(candidate) {
    const raw = String(candidate || '').trim();
    if (!raw) return '';
    const exact = recentRuns.find((run) => String(run.run_id || '') === raw);
    if (exact) return String(exact.run_id);
    const expanded = recentRuns.find((run) => String(run.run_id || '').startsWith(raw));
    return expanded ? String(expanded.run_id) : raw;
  }

  return {
    recentRuns,
    recentRunsLoading,
    runExplorerTotal,
    runExplorerPage,
    setRunExplorerPage,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    fetchRecentRuns,
    systemMetrics,
    fetchSystemMetrics,
    resolveRunId,
    error,
    setError,
    clearRecentRuns,
    clearMetrics,
    clearError,
  };
}
