import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResultsPanel from './ResultsPanel';

const exportElementToPdfMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/pdfExport', () => ({
  exportElementToPdf: (...args) => exportElementToPdfMock(...args),
}));

vi.mock('../state/NexusAppContext', () => ({
  useNexusApp: () => ({ setCurrentTab: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ResultsPanel', () => {
  it('shows a degraded-output warning when a completed run contains refusal-like text', () => {
    render(
      <ResultsPanel
        recentRuns={[]}
        runStream={{
          runId: 'run-refusal-completed',
          status: 'completed',
          runDetails: {
            objective: 'Find policy details',
            final_output: 'INSUFFICIENT_CONTEXT: I cannot provide a reliable answer from available evidence.',
            status: 'completed',
            started_at: '2026-04-18T12:00:00Z',
            updated_at: '2026-04-18T12:05:00Z',
          },
        }}
        selectedResultRunId="run-refusal-completed"
        setSelectedResultRunId={vi.fn()}
        onSelectRun={vi.fn()}
      />
    );

    expect(screen.getByText(/Completed with degraded output warning/i)).toBeTruthy();
    expect(screen.getByText(/refusal-like language/i)).toBeTruthy();
  });

  it('does not show degraded-output warning for normal completed outputs', () => {
    render(
      <ResultsPanel
        recentRuns={[]}
        runStream={{
          runId: 'run-normal-completed',
          status: 'completed',
          runDetails: {
            objective: 'Create migration report',
            final_output: '# Summary\n\nSystem is healthy and rollout can proceed.',
            status: 'completed',
            started_at: '2026-04-18T12:00:00Z',
            updated_at: '2026-04-18T12:05:00Z',
          },
        }}
        selectedResultRunId="run-normal-completed"
        setSelectedResultRunId={vi.fn()}
        onSelectRun={vi.fn()}
      />
    );

    expect(screen.queryByText(/Completed with degraded output warning/i)).toBeNull();
  });

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

  it('exports the selected report using the shared PDF exporter', async () => {
    render(
      <ResultsPanel
        recentRuns={[]}
        runStream={{
          runId: 'run-1234567890ab',
          status: 'completed',
          runDetails: {
            objective: 'Test objective',
            final_output: '# Report\n\nThis is a generated report.',
            status: 'completed',
            started_at: '2026-04-18T12:00:00Z',
            updated_at: '2026-04-18T12:05:00Z',
          },
        }}
        selectedResultRunId="run-1234567890ab"
        setSelectedResultRunId={vi.fn()}
        onSelectRun={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Export PDF/i }));

    await waitFor(() => {
      expect(exportElementToPdfMock).toHaveBeenCalledTimes(1);
      expect(exportElementToPdfMock).toHaveBeenCalledWith(expect.any(Object), 'run-1234567890ab', 'nexus-report');
    });
  });
});
