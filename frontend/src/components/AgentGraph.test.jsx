import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import AgentGraph from './AgentGraph';

let lastReactFlowProps;
let resizeObserverCallback;

const fitViewMock = vi.fn();

class ResizeObserverMock {
  constructor(callback) {
    resizeObserverCallback = callback;
  }

  observe() {}

  disconnect() {}
}

vi.mock('@xyflow/react', async () => {
  return {
    ReactFlow: ({ children, ...props }) => {
      lastReactFlowProps = props;
      return <div data-testid="mock-flow">{children}</div>;
    },
    Controls: (props) => <div data-testid="mock-controls" data-props={JSON.stringify(props)} />,
    Background: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    useReactFlow: () => ({ fitView: fitViewMock }),
  };
});

afterEach(() => cleanup());

beforeEach(() => {
  fitViewMock.mockReset();
  lastReactFlowProps = undefined;
  resizeObserverCallback = undefined;
  global.ResizeObserver = ResizeObserverMock;
});

describe('AgentGraph', () => {
  it('renders only the required workflow node labels', () => {
    render(
      <AgentGraph
        runStream={{
          sortedEvents: [
            { seq: 1, node: 'planner', type: 'node_start', data: { token_count: 120 } },
            { seq: 2, node: 'planner', type: 'node_end' },
            { seq: 3, node: 'writer', type: 'node_start', data: { token_count: 45 } },
          ],
        }}
      />
    );

    const labels = (lastReactFlowProps?.nodes || []).map((node) => node.data.label);
    expect(labels).toEqual([
      'Planner',
      'Researcher',
      'Analyst',
      'Writer',
      'Human Approval',
      'Refusal Gate',
      'Critic',
      'Finalizer',
    ]);
  });

  it('keeps the graph free of extra prose labels on edges', () => {
    render(<AgentGraph runStream={{ sortedEvents: [] }} />);

    expect((lastReactFlowProps?.edges || []).every((edge) => edge.label == null)).toBe(true);
  });

  it('marks the active node as running and completed nodes as done', () => {
    render(
      <AgentGraph
        runStream={{
          currentNode: 'writer',
          status: 'running',
          sortedEvents: [
            { seq: 1, node: 'planner', type: 'node_start' },
            { seq: 2, node: 'planner', type: 'node_end' },
            { seq: 3, node: 'researcher', type: 'node_start' },
            { seq: 4, node: 'researcher', type: 'node_end' },
          ],
        }}
      />
    );

    const writer = (lastReactFlowProps?.nodes || []).find((node) => node.id === 'writer');
    const planner = (lastReactFlowProps?.nodes || []).find((node) => node.id === 'planner');

    expect(planner.data.status).toBe('completed');
    expect(writer.data.status).toBe('running');
  });

  it('re-fits the viewport after the measured container size changes', async () => {
    const { container } = render(<AgentGraph runStream={{ sortedEvents: [] }} />);

    expect(fitViewMock).not.toHaveBeenCalled();

    Object.defineProperty(container.firstChild, 'clientWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(container.firstChild, 'clientHeight', {
      configurable: true,
      value: 900,
    });

    resizeObserverCallback?.();

    await vi.waitFor(() => {
      expect(fitViewMock).toHaveBeenCalled();
    });
  });
});
