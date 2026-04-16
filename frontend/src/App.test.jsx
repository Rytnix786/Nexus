import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import App from './App';

describe('App shell', () => {
  beforeEach(() => {
    // Mock window.open for documentation link
    global.window.open = vi.fn();
  });

  it('renders the hardened shell and supports navigation without crashing', () => {
    window.localStorage.clear();
    render(<App />);
    expect(screen.getByText(/Nexus AI/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Launch Run/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Run History/i })).toBeTruthy();

    // Multiple History buttons exist (navbar + sidebar), click sidebar version
    fireEvent.click(screen.getAllByRole('button', { name: /History/i })[1]);
    expect(screen.getByText(/Run Explorer/i)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Models/i })[1]);
    expect(screen.getByText(/Language Models/i)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /Library/i })[1]);
    expect(screen.getByText(/Knowledge Library/i)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /System Status/i })[0]);
    expect(screen.getByText(/System Metrics/i)).toBeTruthy();

    // Documentation is now a button that opens in a new window
    const docsButton = screen.getByRole('button', { name: /Documentation/i });
    expect(docsButton).toBeTruthy();
    fireEvent.click(docsButton);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/docs'),
      '_blank',
      'noopener,noreferrer'
    );
  });
});

