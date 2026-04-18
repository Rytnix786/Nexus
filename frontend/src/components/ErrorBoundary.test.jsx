import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ErrorBoundary from './ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Explodes() {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders panel-specific fallback when child throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary panel="trace-timeline" fallbackTitle="Active run timeline failed to render safely.">
        <Explodes />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Active run timeline failed to render safely/i)).toBeTruthy();
    expect(screen.getByText(/Panel: trace-timeline/i)).toBeTruthy();
    expect(errorSpy).toHaveBeenCalled();
  });
});
