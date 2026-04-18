import { afterEach, describe, expect, it, vi } from 'vitest';

import { listRuns, setAuthToken } from './api';

afterEach(() => {
  vi.restoreAllMocks();
  setAuthToken('');
});

describe('listRuns', () => {
  it('sends min and max cost filters when provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ runs: [], total: 0 }),
    });

    await listRuns({
      limit: 10,
      offset: 20,
      minCostUsd: '0.0012',
      maxCostUsd: '0.1200',
    });

    const requestedUrl = String(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl).toContain('min_cost_usd=0.0012');
    expect(requestedUrl).toContain('max_cost_usd=0.1200');
  });
});
