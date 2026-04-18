import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ControlBar from '../ControlBar';

describe('ControlBar', () => {
  const mockOnStop = vi.fn();

  beforeEach(() => {
    mockOnStop.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders status badge with correct text', () => {
    render(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  test('displays remaining tokens formatted with comma separator', () => {
    render(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={12450}
        onStop={mockOnStop}
      />
    );

    expect(screen.getByText(/12,450/i)).toBeInTheDocument();
  });

  test('displays correct status badge color for running status', () => {
    const { container } = render(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const statusBadge = container.querySelector('[class*="bg-blue-500"]');
    expect(statusBadge).toBeInTheDocument();
  });

  test('disables stop button when status is completed', () => {
    render(
      <ControlBar
        runId="test-123"
        status="completed"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('disables stop button when status is failed', () => {
    render(
      <ControlBar
        runId="test-123"
        status="failed"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('disables stop button when status is stopped', () => {
    render(
      <ControlBar
        runId="test-123"
        status="stopped"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('disables stop button when status is rejected', () => {
    render(
      <ControlBar
        runId="test-123"
        status="rejected"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('disables stop button when status is timeout', () => {
    render(
      <ControlBar
        runId="test-123"
        status="timeout"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('disables stop button when status is budget_exhausted', () => {
    render(
      <ControlBar
        runId="test-123"
        status="budget_exhausted"
        remainingTokens={0}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('enables stop button when status is running', () => {
    render(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).not.toBeDisabled();
  });

  test('enables stop button when status is awaiting_human', () => {
    render(
      <ControlBar
        runId="test-123"
        status="awaiting_human"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).not.toBeDisabled();
  });

  test('enables stop button when status is created', () => {
    render(
      <ControlBar
        runId="test-123"
        status="created"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).not.toBeDisabled();
  });

  test('calls onStop when stop button is clicked', async () => {
    mockOnStop.mockResolvedValue(undefined);

    render(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockOnStop).toHaveBeenCalledTimes(1);
    });
  });

  test('disables stop button during loading', () => {
    const { rerender } = render(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={5000}
        onStop={mockOnStop}
        loading={false}
      />
    );

    rerender(
      <ControlBar
        runId="test-123"
        status="running"
        remainingTokens={5000}
        onStop={mockOnStop}
        loading={true}
      />
    );

    const stopBtn = screen.getByRole('button', { name: /stop/i });
    expect(stopBtn).toBeDisabled();
  });

  test('displays status with correct icon for awaiting_human', () => {
    render(
      <ControlBar
        runId="test-123"
        status="awaiting_human"
        remainingTokens={5000}
        onStop={mockOnStop}
      />
    );

    expect(screen.getByText(/awaiting.*approval/i)).toBeInTheDocument();
  });

  test('displays status with correct icon for budget_exhausted', () => {
    render(
      <ControlBar
        runId="test-123"
        status="budget_exhausted"
        remainingTokens={0}
        onStop={mockOnStop}
      />
    );

    expect(screen.getByText(/budget.*exhausted/i)).toBeInTheDocument();
  });
});
