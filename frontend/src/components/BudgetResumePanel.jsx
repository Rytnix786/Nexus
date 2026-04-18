import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, AlertCircle, Check } from 'lucide-react';

export default function BudgetResumePanel({
  runId,
  currentBudgetRemaining,
  estimatedBurnRate,
  onResume,
  onCancel,
  loading = false,
  error = '',
  successMessage = '',
  minBudgetIncrease = 500,
  maxBudgetIncrease = 200000,
  showEstimate = true,
}) {
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  function validateBudget(value) {
    const num = parseInt(value, 10) || 0;
    if (num < minBudgetIncrease) {
      return `Budget increase must be at least ${minBudgetIncrease}`;
    }
    if (num > maxBudgetIncrease) {
      return `Budget increase cannot exceed ${maxBudgetIncrease}`;
    }
    return '';
  }

  function handleBudgetChange(e) {
    const value = e.target.value;
    setBudgetInput(value);
    const error = validateBudget(value);
    setBudgetError(error);
  }

  function handleSliderChange(e) {
    const value = e.target.value;
    setBudgetInput(value);
    const error = validateBudget(value);
    setBudgetError(error);
  }

  function handleBlur() {
    setShowValidation(true);
  }

  function calculateEstimatedRunTime(budget, burnRate) {
    if (!burnRate || burnRate <= 0) return null;
    const minutes = Math.round(budget / burnRate);
    if (minutes < 60) return `~${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `~${hours}h`;
  }

  function handleResume() {
    if (budgetError || !budgetInput) return;
    const amount = parseInt(budgetInput, 10);
    onResume(amount);
  }

  const isDisabled = !!budgetError || !budgetInput || loading;
  const estimatedTime = calculateEstimatedRunTime(
    parseInt(budgetInput, 10) || 0,
    estimatedBurnRate
  );

  const formattedRemainingTokens = currentBudgetRemaining.toLocaleString('en-US');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, x: 100 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: 20, x: 100 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
      className={
        'fixed bottom-0 right-0 w-96 bg-surface-container-low ' +
        'border-l border-t border-outline-variant/30 shadow-2xl p-6 ' +
        'rounded-tl-2xl z-50 max-h-96 overflow-y-auto custom-scrollbar'
      }
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-headline font-bold text-primary mb-2">
          💰 Add More Tokens
        </h3>
        <p className="text-sm text-on-surface-variant">
          Your run has exhausted its allocated tokens. Add more tokens below to
          continue execution.
        </p>
      </div>

      {/* Current Status */}
      <div className="mb-6 text-sm text-on-surface-variant">
        <p>Current Status: {formattedRemainingTokens} tokens remaining</p>
        {estimatedBurnRate && (
          <p>Estimated burn rate: {estimatedBurnRate} tokens/min</p>
        )}
      </div>

      {/* Budget Input Section */}
      <div className="mb-6">
        <label className="block text-xs uppercase tracking-widest text-primary
          mb-3 font-label">
          Add Budget
        </label>

        {/* Slider */}
        <div className="mb-4">
          <input
            type="range"
            min={minBudgetIncrease}
            max={maxBudgetIncrease}
            step="500"
            value={budgetInput || minBudgetIncrease}
            onChange={handleSliderChange}
            onBlur={handleBlur}
            disabled={loading}
            className="w-full h-2 bg-surface rounded-lg appearance-none
              cursor-pointer accent-primary disabled:opacity-50
              disabled:cursor-not-allowed"
          />
        </div>

        {/* Text Input */}
        <input
          type="number"
          min={minBudgetIncrease}
          max={maxBudgetIncrease}
          value={budgetInput}
          onChange={handleBudgetChange}
          onBlur={handleBlur}
          disabled={loading}
          placeholder={minBudgetIncrease.toString()}
          className={
            'w-full px-4 py-2 rounded-lg bg-surface-container-lowest ' +
            'border text-on-surface placeholder-on-surface-variant ' +
            'font-mono text-sm transition-colors disabled:opacity-50 ' +
            'disabled:cursor-not-allowed ' +
            (budgetError && showValidation
              ? 'border-error focus:ring-2 focus:ring-error/50'
              : 'border-outline-variant/30 focus:border-primary ' +
                'focus:ring-2 focus:ring-primary/30')
          }
        />

        {/* Validation Message */}
        <AnimatePresence>
          {budgetError && showValidation && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-sm text-error mt-2 flex items-center gap-1"
            >
              <AlertCircle className="w-4 h-4" />
              {budgetError}
            </motion.p>
          )}
          {!budgetError && budgetInput && showValidation && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-sm text-emerald-400 mt-2 flex items-center gap-1"
            >
              <Check className="w-4 h-4" />
              Valid (min: {minBudgetIncrease.toLocaleString()}, max:{' '}
              {maxBudgetIncrease.toLocaleString()})
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Estimated Runtime */}
      {estimatedTime && showEstimate && (
        <div
          className="mb-6 p-3 rounded-lg bg-primary/10 border ' +
          'border-primary/20 text-sm text-primary"
        >
          <p>
            <strong>Estimated runtime:</strong> {estimatedTime} (at{' '}
            {estimatedBurnRate} tokens/min)
          </p>
        </div>
      )}

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mb-4 p-3 rounded-lg bg-error/10 border border-error/30
              text-sm text-error flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Message */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mb-4 p-3 rounded-lg bg-emerald-500/10 border
              border-emerald-500/30 text-sm text-emerald-300 flex
              items-start gap-2"
          >
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-3 mt-8">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant
            hover:bg-surface-container-high transition-colors disabled:opacity-50
            disabled:cursor-not-allowed font-label text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleResume}
          disabled={isDisabled}
          className={
            'flex-1 px-4 py-2 rounded-lg font-headline font-bold ' +
            'text-sm transition-all disabled:opacity-50 ' +
            'disabled:cursor-not-allowed flex items-center justify-center gap-2 ' +
            (isDisabled
              ? 'bg-primary/30 text-primary/50 cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 text-on-primary ' +
                'hover:shadow-[0_0_20px_rgba(0,229,255,0.3)]')
          }
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent
              rounded-full animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Resume & Continue
        </button>
      </div>
    </motion.div>
  );
}
