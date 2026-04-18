import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import RunExplorer from '../RunExplorer';

afterEach(() => {
  cleanup();
});

vi.mock('../BudgetResumePanel', () => ({
  default: ({ runId, onResume, onCancel }) => (
    <div data-testid="budget-resume-panel">
      <span>{runId}</span>
      <button onClick={() => onResume(50000)} data-testid="resume-modal-button">
        Resume
      </button>
      <button onClick={onCancel} data-testid="cancel-modal-button">
        Cancel
      </button>
    </div>
  ),
}));

describe('RunExplorer Integration Tests', () => {
  const defaultProps = {
    searchText: '',
    setSearchText: vi.fn(),
    statusFilter: '',
    setStatusFilter: vi.fn(),
    dateFrom: '',
    setDateFrom: vi.fn(),
    dateTo: '',
    setDateTo: vi.fn(),
    runId: '',
    onSelectRun: vi.fn(),
    runExplorerPage: 1,
    setRunExplorerPage: vi.fn(),
    runExplorerTotal: 0,
    perPage: 10,
    onStopRun: vi.fn(),
    stoppingRunId: '',
    onResumeWithBudget: vi.fn(),
  };

  test('shows resume button only for budget_exhausted status', () => {
    const runs = [
      {
        run_id: 'run-budget-exhausted',
        status: 'budget_exhausted',
        started_at: '2025-04-18T10:00:00Z',
      },
      {
        run_id: 'run-running',
        status: 'running',
        started_at: '2025-04-18T10:05:00Z',
      },
      {
        run_id: 'run-completed',
        status: 'completed',
        started_at: '2025-04-18T10:10:00Z',
      },
    ];

    render(
      <RunExplorer {...defaultProps} recentRuns={runs} />
    );

    // Resume button should appear for budget_exhausted
    const addBudgetButtons = screen.getAllByText('+ Add Budget');
    expect(addBudgetButtons).toHaveLength(1);

    // Stop button should appear for running
    const stopButtons = screen.getAllByText('Stop Run');
    expect(stopButtons).toHaveLength(1);

    // No resume button for completed
    const completedStatuses = screen.getAllByText('completed');
    expect(completedStatuses.length).toBeGreaterThan(0);
  });

  test('shows BudgetResumePanel when resume button clicked', () => {
    const runs = [
      {
        run_id: 'test-run-123',
        status: 'budget_exhausted',
        started_at: '2025-04-18T10:00:00Z',
      },
    ];

    render(
      <RunExplorer {...defaultProps} recentRuns={runs} />
    );

    const addBudgetButton = screen.getByText('+ Add Budget');
    fireEvent.click(addBudgetButton);

    const panel = screen.getByTestId('budget-resume-panel');
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText('test-run-123')).toBeInTheDocument();
  });

  test('calls onResumeWithBudget when resume modal button clicked', () => {
    const mockOnResumeWithBudget = vi.fn();
    const runs = [
      {
        run_id: 'test-run-456',
        status: 'budget_exhausted',
        started_at: '2025-04-18T10:00:00Z',
      },
    ];

    render(
      <RunExplorer
        {...defaultProps}
        recentRuns={runs}
        onResumeWithBudget={mockOnResumeWithBudget}
      />
    );

    const addBudgetButton = screen.getByText('+ Add Budget');
    fireEvent.click(addBudgetButton);

    const resumeModalButton = screen.getByTestId('resume-modal-button');
    fireEvent.click(resumeModalButton);

    expect(mockOnResumeWithBudget).toHaveBeenCalledWith(50000, 'test-run-456');
  });

  test('closes BudgetResumePanel when cancel clicked', () => {
    const runs = [
      {
        run_id: 'test-run-789',
        status: 'budget_exhausted',
        started_at: '2025-04-18T10:00:00Z',
      },
    ];

    render(
      <RunExplorer {...defaultProps} recentRuns={runs} />
    );

    const addBudgetButton = screen.getByText('+ Add Budget');
    fireEvent.click(addBudgetButton);

    expect(screen.getByTestId('budget-resume-panel')).toBeInTheDocument();

    const cancelButton = screen.getByTestId('cancel-modal-button');
    fireEvent.click(cancelButton);

    expect(screen.queryByTestId('budget-resume-panel')).not.toBeInTheDocument();
  });

  test('can show both resume and stop buttons for different runs', () => {
    const runs = [
      {
        run_id: 'run-budget-exhausted',
        status: 'budget_exhausted',
        started_at: '2025-04-18T10:00:00Z',
      },
      {
        run_id: 'run-running',
        status: 'running',
        started_at: '2025-04-18T10:05:00Z',
      },
    ];

    render(
      <RunExplorer {...defaultProps} recentRuns={runs} />
    );

    const addBudgetButtons = screen.getAllByText('+ Add Budget');
    expect(addBudgetButtons).toHaveLength(1);

    const stopButtons = screen.getAllByText('Stop Run');
    expect(stopButtons).toHaveLength(1);
  });

  test('filters status correctly including budget_exhausted', () => {
    const runs = [
      {
        run_id: 'run-1',
        status: 'budget_exhausted',
        started_at: '2025-04-18T10:00:00Z',
      },
      {
        run_id: 'run-2',
        status: 'completed',
        started_at: '2025-04-18T10:05:00Z',
      },
    ];

    render(
      <RunExplorer {...defaultProps} recentRuns={runs} statusFilter="budget_exhausted" />
    );

    expect(screen.getByText('+ Add Budget')).toBeInTheDocument();
    expect(screen.getByDisplayValue('budget_exhausted')).toBeInTheDocument();
  });
});
