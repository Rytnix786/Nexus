import { render, screen } from '@testing-library/react';
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

afterEach(() => {
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
});