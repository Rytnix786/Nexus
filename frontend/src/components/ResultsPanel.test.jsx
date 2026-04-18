import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResultsPanel from './ResultsPanel';

vi.mock('../state/NexusAppContext', () => ({
  useNexusApp: () => ({ setCurrentTab: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResultsPanel', () => {
  it('shows a meaningful no-runs empty state with clear action', () => {
    render(
      <ResultsPanel
        recentRuns={[]}
        runStream={{}}
        selectedResultRunId=""
        setSelectedResultRunId={vi.fn()}
        onSelectRun={vi.fn()}
      />
    );

    expect(screen.getByText(/No completed runs yet/i)).toBeTruthy();
    expect(screen.getByText(/Start a run from the Orchestrator/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start a Run/i })).toBeTruthy();
  });
});
