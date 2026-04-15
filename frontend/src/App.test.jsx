import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App shell', () => {
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
  });
});

