import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NexusAppProvider, useNexusApp } from './NexusAppContext';

const runsMock = {
  recentRuns: [],
  recentRunsLoading: false,
  runExplorerTotal: 0,
  runExplorerPage: 1,
  setRunExplorerPage: vi.fn(),
  searchText: '',
  setSearchText: vi.fn(),
  statusFilter: '',
  setStatusFilter: vi.fn(),
  dateFrom: '',
  setDateFrom: vi.fn(),
  dateTo: '',
  setDateTo: vi.fn(),
  systemMetrics: {
    total_runs: 0,
    runs_by_status: {},
    avg_token_usage_per_run: 0,
    avg_steps_per_run: 0,
    runs_last_24h: 0,
  },
  resolveRunId: vi.fn((value) => String(value || '')),
  error: '',
  setError: vi.fn(),
  clearRecentRuns: vi.fn(),
  clearMetrics: vi.fn(),
  clearError: vi.fn(),
  fetchRecentRuns: vi.fn(),
  fetchSystemMetrics: vi.fn(),
};

const runStreamMock = {
  runId: '',
  status: 'idle',
  currentNode: '-',
  sortedEvents: [],
  runDetails: null,
  canStopCurrentRun: false,
  stoppingRunId: '',
  startRun: vi.fn(),
  stopTargetRun: vi.fn(),
  selectRun: vi.fn(),
  resetRunState: vi.fn(),
};

vi.mock('../hooks/useRuns', () => ({
  useRuns: () => runsMock,
}));

vi.mock('../hooks/useRunStream', () => ({
  useRunStream: () => runStreamMock,
}));

function Harness() {
  const { authState, applyAuthToken } = useNexusApp();
  return (
    <div>
      <button type="button" onClick={() => void applyAuthToken('dev_nexus_valid')}>
        apply-token
      </button>
      <span data-testid="auth-status">{authState.status}</span>
    </div>
  );
}

describe('NexusAppProvider auth bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    runsMock.fetchRecentRuns.mockResolvedValue({ ok: true, payload: { runs: [], total: 0 } });
    runsMock.fetchSystemMetrics.mockResolvedValue({ ok: false, authError: true, error: 'Metrics failed: 401' });
  });

  it('keeps token accepted when run history loads but metrics endpoint returns 401', async () => {
    render(
      <NexusAppProvider>
        <Harness />
      </NexusAppProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /apply-token/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').textContent).toBe('ready');
    });
  });
});
