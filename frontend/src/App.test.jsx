import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App shell', () => {
  it('renders mission control header', () => {
    render(<App />);
    expect(screen.getByText(/Mission Control For Stateful Multi-Agent Operations/i)).toBeTruthy();
  });

  it('shows run explorer and approval workbench', () => {
    render(<App />);
    expect(screen.getAllByText(/Run Explorer/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Approval Workbench/i).length).toBeGreaterThan(0);
  });

  it('shows primary tabs for timeline graph artifacts', () => {
    render(<App />);
    expect(screen.getAllByRole('button', { name: /Timeline/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Graph/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Artifacts/i }).length).toBeGreaterThan(0);
  });
});
