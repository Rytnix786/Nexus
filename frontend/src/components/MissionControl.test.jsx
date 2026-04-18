import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MissionControl from './MissionControl';

const uploadSourcesMock = vi.fn();
const useNexusAppMock = vi.fn();

vi.mock('../lib/api', () => ({
  uploadSources: (...args) => uploadSourcesMock(...args),
}));

vi.mock('../state/NexusAppContext', () => ({
  useNexusApp: () => useNexusAppMock(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  uploadSourcesMock.mockReset();
});

describe('MissionControl', () => {
  it('uses Human Approval wording while keeping launch payload key highImpact', () => {
    const startRun = vi.fn();
    useNexusAppMock.mockReturnValue({
      runStream: { loading: false, error: '', startRun, sortedEvents: [], currentNode: '' },
    });

    render(<MissionControl runStream={{ loading: false, error: '', startRun }} authState={null} isDeveloperMode={false} />);

    expect(screen.getByRole('checkbox', { name: /Human Approval/i })).toBeTruthy();
    expect(screen.queryByText(/High Impact Graph Mode/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/What would you like Nexus to investigate\?/i), {
      target: { value: 'Audit migration plan' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Launch Run/i }));

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        highImpact: true,
      })
    );
  });

  it('updates helper copy based on whether human approval is enabled', () => {
    const startRun = vi.fn();
    useNexusAppMock.mockReturnValue({
      runStream: { loading: false, error: '', startRun, sortedEvents: [], currentNode: '' },
    });

    render(<MissionControl runStream={{ loading: false, error: '', startRun }} authState={null} isDeveloperMode={false} />);

    expect(screen.getByText(/Human approval checkpoint is required before critique/i)).toBeTruthy();

    const toggle = screen.getByRole('checkbox', { name: /Human Approval/i });
    fireEvent.click(toggle);

    expect(screen.getByText(/Run proceeds without a human approval checkpoint/i)).toBeTruthy();
  });
});
