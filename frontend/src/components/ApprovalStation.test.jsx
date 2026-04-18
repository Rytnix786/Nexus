import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ApprovalStation from './ApprovalStation';

describe('ApprovalStation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T06:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows elapsed pause duration and warning after 10 minutes', () => {
    render(
      <ApprovalStation
        runStream={{
          runId: 'run-1',
          sortedEvents: [
            {
              event_type: 'awaiting_human',
              data: { created_at: '2026-04-18T05:49:30Z' },
            },
          ],
          runDetails: { draft: 'Draft' },
          submitDecision: vi.fn(),
        }}
      />
    );

    expect(screen.getByText(/Paused for 10:30/i)).toBeTruthy();
    expect(screen.getByText(/pending for more than 10 minutes/i)).toBeTruthy();
  });

  it('forwards explicit reason when rejecting', () => {
    const submitDecision = vi.fn();
    render(
      <ApprovalStation
        runStream={{
          runId: 'run-1',
          sortedEvents: [],
          runDetails: { draft: 'Draft' },
          submitDecision,
        }}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Looks good to me/i), { target: { value: 'Factual errors in sections 2 and 4' } });
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(submitDecision).toHaveBeenCalledWith(
      'reject',
      'Factual errors in sections 2 and 4',
      'Factual errors in sections 2 and 4'
    );
  });
});
