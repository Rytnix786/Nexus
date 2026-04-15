import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RunExplorer from './RunExplorer';

afterEach(cleanup);

describe('RunExplorer', () => {
  it('renders an empty state without crashing when no runs are available', () => {
    render(
      <RunExplorer
        searchText=""
        setSearchText={vi.fn()}
        statusFilter=""
        setStatusFilter={vi.fn()}
        dateFrom=""
        setDateFrom={vi.fn()}
        dateTo=""
        setDateTo={vi.fn()}
        recentRuns={[]}
        runId=""
        onSelectRun={vi.fn()}
        runExplorerPage={1}
        setRunExplorerPage={vi.fn()}
        runExplorerTotal={0}
        perPage={12}
        onStopRun={vi.fn()}
        stoppingRunId=""
      />
    );

    expect(screen.getByText(/Run Explorer/i)).toBeTruthy();
    expect(screen.getByText(/No runs available yet/i)).toBeTruthy();
  });

  it('invokes selection and paging callbacks', () => {
    const onSelectRun = vi.fn();
    const setRunExplorerPage = vi.fn();

    render(
      <RunExplorer
        searchText=""
        setSearchText={vi.fn()}
        statusFilter=""
        setStatusFilter={vi.fn()}
        dateFrom=""
        setDateFrom={vi.fn()}
        dateTo=""
        setDateTo={vi.fn()}
        recentRuns={[{ run_id: 'run-1', status: 'completed', started_at: '2026-04-16T00:00:00Z' }]}
        runId=""
        onSelectRun={onSelectRun}
        runExplorerPage={1}
        setRunExplorerPage={setRunExplorerPage}
        runExplorerTotal={24}
        perPage={12}
        onStopRun={vi.fn()}
        stoppingRunId=""
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /run-1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    expect(onSelectRun).toHaveBeenCalledWith('run-1');
    expect(setRunExplorerPage).toHaveBeenCalled();
  });
});