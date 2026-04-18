import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import AgentGraph from './AgentGraph';

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: ({ nodes }) => (
      <div data-testid="mock-flow">
        {nodes.map((node) => (
          <div key={node.id} data-testid={`node-${node.id}`}>
            <span>{node.data.name}</span>
            <span>{node.data.status}</span>
            <span>{node.data.tokenUsage}</span>
          </div>
        ))}
      </div>
    ),
    MiniMap: () => null,
    Controls: () => null,
    Background: () => null,
  };
});

afterEach(cleanup);

describe('AgentGraph', () => {
  it('derives node status and token usage from timeline events', () => {
    render(
      <AgentGraph
        runStream={{
          currentNode: 'writer',
          status: 'running',
          sortedEvents: [
            { seq: 1, node: 'planner', event_type: 'plan_created', data: { tokens_used: 120 } },
            { seq: 2, node: 'researcher', event_type: 'research_completed', data: { total_tokens: 210 } },
            { seq: 3, node: 'writer', event_type: 'draft_written', data: { completion_tokens: 180 } },
          ],
        }}
      />
    );

    expect(screen.getByTestId('node-planner')).toHaveTextContent('completed');
    expect(screen.getByTestId('node-researcher')).toHaveTextContent('completed');
    expect(screen.getByTestId('node-writer')).toHaveTextContent('running');

    expect(screen.getByTestId('node-planner')).toHaveTextContent('120');
    expect(screen.getByTestId('node-researcher')).toHaveTextContent('210');
    expect(screen.getByTestId('node-writer')).toHaveTextContent('180');
  });

  it('marks active node as failed when run is terminal failure', () => {
    render(
      <AgentGraph
        runStream={{
          currentNode: 'analyst',
          status: 'failed',
          sortedEvents: [
            { seq: 1, node: 'planner', event_type: 'plan_created', data: { tokens_used: 80 } },
            { seq: 2, node: 'researcher', event_type: 'research_completed', data: { tokens_used: 90 } },
            { seq: 3, node: 'analyst', event_type: 'node_error', data: { tokens_used: 40 } },
          ],
        }}
      />
    );

    expect(screen.getByTestId('node-planner')).toHaveTextContent('completed');
    expect(screen.getByTestId('node-researcher')).toHaveTextContent('completed');
    expect(screen.getByTestId('node-analyst')).toHaveTextContent('failed');
  });
});
