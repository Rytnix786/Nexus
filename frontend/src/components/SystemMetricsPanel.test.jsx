import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SystemMetricsPanel from './SystemMetricsPanel';

afterEach(cleanup);

describe('SystemMetricsPanel', () => {
  it('renders total spend widget using dollar formatting', () => {
    render(
      <SystemMetricsPanel
        open={true}
        loading={false}
        onToggle={vi.fn()}
        metrics={{
          total_runs: 3,
          runs_last_24h: 3,
          avg_token_usage_per_run: 1200,
          avg_steps_per_run: 4.2,
          runs_by_status: { completed: 3 },
          total_cost_usd: 0.0042,
        }}
      />
    );

    expect(screen.getByText(/Total Spend/i)).toBeTruthy();
    expect(screen.getByText('$0.0042')).toBeTruthy();
  });
});
