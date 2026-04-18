import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TraceTimeline from './TraceTimeline';

vi.mock('../state/NexusAppContext', () => ({
  useNexusApp: () => ({ setCurrentTab: vi.fn() }),
}));

vi.mock('./ApprovalStation', () => ({
  default: () => <div data-testid="approval-station" />,
}));

vi.mock('./RunArtifact', () => ({
  default: () => <div data-testid="run-artifact" />,
}));

vi.mock('./AgentGraph', () => ({
  default: () => <div data-testid="agent-graph" />,
}));

vi.mock('./ControlBar', () => ({
  default: () => <div data-testid="control-bar" />,
}));

vi.mock('./BudgetResumePanel', () => ({
  default: () => <div data-testid="budget-resume-panel" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TraceTimeline', () => {
  it('renders the active run controls without throwing when the stop icon is shown', () => {
    render(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'run-123',
          currentNode: 'planner',
          canStopCurrentRun: true,
          stopTargetRun: vi.fn(),
          sortedEvents: [],
          loading: false,
        }}
      />
    );

    expect(screen.getByText(/Active Run:/i)).toBeTruthy();
    expect(screen.getByText(/planner/i)).toBeTruthy();
    expect(screen.getByTestId('agent-graph')).toBeTruthy();
  });

  it('shows a meaningful empty timeline state before events arrive', () => {
    render(
      <TraceTimeline
        runStream={{
          status: 'running',
          runId: 'run-empty',
          currentNode: 'planner',
          sortedEvents: [],
          loading: false,
          stopTargetRun: vi.fn(),
          resumeWithBudgetTopUp: vi.fn(),
        }}
      />
    );

    expect(screen.getByText(/No timeline events yet/i)).toBeTruthy();
    expect(screen.getByText(/Events will appear here as agents execute nodes/i)).toBeTruthy();
  });
});