import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import BudgetResumePanel from '../BudgetResumePanel';

describe('BudgetResumePanel', () => {
  const mockOnResume = vi.fn();

  beforeEach(() => {
    mockOnResume.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders with title and description', () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
      />
    );

    expect(screen.getByText(/exhausted/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /add more tokens/i })
    ).toBeInTheDocument();
  });

  test('shows validation error when budget < 500 tokens', async () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
      />
    );

    const input = screen.getByDisplayValue('');
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText(/at least 500/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    expect(resumeBtn).toBeDisabled();
  });

  test('shows validation error when budget > 200000 tokens', async () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
      />
    );

    const input = screen.getByDisplayValue('');
    fireEvent.change(input, { target: { value: '250000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText(/cannot exceed 200000/i)).toBeInTheDocument();
    });

    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    expect(resumeBtn).toBeDisabled();
  });

  test('enables resume button when budget is valid (>= 500)', async () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
      />
    );

    const input = screen.getByDisplayValue('');
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      const resumeBtn = screen.getByRole('button', { name: /resume/i });
      expect(resumeBtn).not.toBeDisabled();
    });
  });

  test('calls onResume with correct budget amount when resume button clicked', 
    async () => {
      mockOnResume.mockResolvedValue(undefined);

      render(
        <BudgetResumePanel
          runId="test-123"
          currentBudgetRemaining={0}
          onResume={mockOnResume}
        />
      );

      const input = screen.getByDisplayValue('');
      fireEvent.change(input, { target: { value: '5000' } });

      const resumeBtn = screen.getByRole('button', { name: /resume/i });
      fireEvent.click(resumeBtn);

      await waitFor(() => {
        expect(mockOnResume).toHaveBeenCalledWith(5000);
      });
    }
  );

  test('disables inputs during loading', async () => {
    const { rerender } = render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
        loading={false}
      />
    );

    rerender(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
        loading={true}
      />
    );

    const input = screen.getByDisplayValue('');
    const resumeBtn = screen.getByRole('button', { name: /resume/i });

    expect(input).toBeDisabled();
    expect(resumeBtn).toBeDisabled();
  });

  test('displays error message when provided', () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
        error="Network error. Please try again."
      />
    );

    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  test('slider updates number input value', async () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '50000' } });

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(50000);
  });

  test('calculates estimated run time with burn rate', () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        estimatedBurnRate={15}
        onResume={mockOnResume}
      />
    );

    const input = screen.getByDisplayValue('');
    fireEvent.change(input, { target: { value: '900' } });

    expect(screen.getByText(/~1h/i)).toBeInTheDocument();
  });

  test('displays current budget remaining', () => {
    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={1500}
        onResume={mockOnResume}
      />
    );

    expect(screen.getByText(/1,500 tokens remaining/i)).toBeInTheDocument();
  });

  test('cancel button calls onCancel when provided', async () => {
    const mockOnCancel = vi.fn();

    render(
      <BudgetResumePanel
        runId="test-123"
        currentBudgetRemaining={0}
        onResume={mockOnResume}
        onCancel={mockOnCancel}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(mockOnCancel).toHaveBeenCalled();
  });
});
