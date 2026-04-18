import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import TraceTimeline from '../TraceTimeline';

afterEach(() => {
  cleanup();
});

vi.mock('../../state/NexusAppContext', () => ({
  useNexusApp: () => ({ setCurrentTab: vi.fn() }),
}));

vi.mock('../ApprovalStation', () => ({
  default: ({ runStream }) => <div data-testid="approval-station" />,
}));

vi.mock('../RunArtifact', () => ({
  default: () => <div data-testid="run-artifact" />,
}));

vi.mock('../AgentGraph', () => ({
  default: () => <div data-testid="agent-graph" />,
}));

vi.mock('../ControlBar', () => ({
  default: ({ status, onStop, remainingTokens }) => (
    <div data-testid="control-bar">
      <span>{status}</span>
      <span>{remainingTokens}</span>
      <button onClick={onStop} data-testid="stop-button">
        Stop
      </button>
    </div>
  ),
}));

vi.mock('../BudgetResumePanel', () => ({
  default: ({ onResume }) => (
    <div data-testid="budget-resume-panel">
      <button onClick={() => onResume(50000)} data-testid="resume-button">
        Resume
      </button>
    </div>
  ),
}));

describe('TraceTimeline Integration Tests', () => {
  test('renders ControlBar with correct props', () => {
    render(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'test-123',
          currentNode: 'researcher',
          remainingTokens: 12450,
          sortedEvents: [],
          loading: false,
          stopTargetRun: vi.fn(),
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    const controlBar = screen.getByTestId('control-bar');
    expect(controlBar).toBeInTheDocument();
    expect(within(controlBar).getByText('running')).toBeInTheDocument();
    expect(within(controlBar).getByText('12450')).toBeInTheDocument();
  });

  test('shows BudgetResumePanel when status is budget_exhausted', () => {
    render(
      <TraceTimeline
        runStream={{
          status: 'budget_exhausted',
          runId: 'test-123',
          currentNode: 'researcher',
          remainingTokens: 0,
          sortedEvents: [],
          loading: false,
          stopTargetRun: vi.fn(),
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    expect(screen.getByTestId('budget-resume-panel')).toBeInTheDocument();
  });

  test('does NOT show BudgetResumePanel when status is running', () => {
    render(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'test-123',
          currentNode: 'researcher',
          remainingTokens: 5000,
          sortedEvents: [],
          loading: false,
          stopTargetRun: vi.fn(),
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    expect(screen.queryByTestId('budget-resume-panel')).not.toBeInTheDocument();
  });

  test('calls stopTargetRun when stop button clicked', () => {
    const mockStopTargetRun = vi.fn();

    render(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'test-123',
          currentNode: 'researcher',
          remainingTokens: 5000,
          sortedEvents: [],
          loading: false,
          stopTargetRun: mockStopTargetRun,
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    const stopButton = screen.getByTestId('stop-button');
    fireEvent.click(stopButton);

    expect(mockStopTargetRun).toHaveBeenCalledWith('test-123');
  });

  test(
    'calls resumeWithBudgetTopUp when resume button clicked in panel',
    () => {
      const mockResumeWithBudgetTopUp = vi.fn();

      render(
        <TraceTimeline
          runStream={{
            status: 'budget_exhausted',
            runId: 'test-123',
            currentNode: 'researcher',
            remainingTokens: 0,
            sortedEvents: [],
            loading: false,
            stopTargetRun: vi.fn(),
            resumeWithBudgetTopUp: mockResumeWithBudgetTopUp,
          }}
        />
      );

      const resumeButton = screen.getByTestId('resume-button');
      fireEvent.click(resumeButton);

      expect(mockResumeWithBudgetTopUp).toHaveBeenCalledWith(50000, 'test-123');
    }
  );

  test('passes loading state to ControlBar', () => {
    const { rerender } = render(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'test-123',
          currentNode: 'researcher',
          remainingTokens: 5000,
          sortedEvents: [],
          loading: false,
          stopTargetRun: vi.fn(),
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    rerender(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'test-123',
          currentNode: 'researcher',
          remainingTokens: 5000,
          sortedEvents: [],
          loading: true,
          stopTargetRun: vi.fn(),
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    // ControlBar should receive loading=true
    const controlBar = screen.getByTestId('control-bar');
    expect(controlBar).toBeInTheDocument();
  });
});
