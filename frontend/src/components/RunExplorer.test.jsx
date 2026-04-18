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
        minCostUsd=""
        setMinCostUsd={vi.fn()}
        maxCostUsd=""
        setMaxCostUsd={vi.fn()}
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
    expect(screen.getByText(/No runs yet/i)).toBeTruthy();
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
        minCostUsd=""
        setMinCostUsd={vi.fn()}
        maxCostUsd=""
        setMaxCostUsd={vi.fn()}
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

  it('renders local free cost and formatted dollar cost for runs', () => {
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
        minCostUsd=""
        setMinCostUsd={vi.fn()}
        maxCostUsd=""
        setMaxCostUsd={vi.fn()}
        recentRuns={[
          { run_id: 'run-free', status: 'completed', started_at: '2026-04-16T00:00:00Z', estimated_cost_usd: 0 },
          { run_id: 'run-paid', status: 'completed', started_at: '2026-04-16T00:00:00Z', estimated_cost_usd: 0.0042 },
        ]}
        runId=""
        onSelectRun={vi.fn()}
        runExplorerPage={1}
        setRunExplorerPage={vi.fn()}
        runExplorerTotal={2}
        perPage={12}
        onStopRun={vi.fn()}
        stoppingRunId=""
      />
    );

    expect(screen.getByText(/Local \(free\)/i)).toBeTruthy();
    expect(screen.getByText('$0.0042')).toBeTruthy();
  });

  it('updates minimum and maximum cost filters', () => {
    const setMinCostUsd = vi.fn();
    const setMaxCostUsd = vi.fn();
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
        minCostUsd=""
        setMinCostUsd={setMinCostUsd}
        maxCostUsd=""
        setMaxCostUsd={setMaxCostUsd}
        recentRuns={[]}
        runId=""
        onSelectRun={vi.fn()}
        runExplorerPage={1}
        setRunExplorerPage={setRunExplorerPage}
        runExplorerTotal={0}
        perPage={12}
        onStopRun={vi.fn()}
        stoppingRunId=""
      />
    );

    fireEvent.change(screen.getByLabelText(/minimum cost/i), { target: { value: '0.01' } });
    fireEvent.change(screen.getByLabelText(/maximum cost/i), { target: { value: '1.25' } });

    expect(setMinCostUsd).toHaveBeenCalledWith('0.01');
    expect(setMaxCostUsd).toHaveBeenCalledWith('1.25');
    expect(setRunExplorerPage).toHaveBeenCalledWith(1);
  });
});