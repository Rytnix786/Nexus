import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Square,
  CircleDot,
  AlertCircle,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  PauseCircle,
} from 'lucide-react';

const STOPPABLE_STATUSES = ['running', 'awaiting_human', 'created'];

const STATUS_CONFIG = {
  running: {
    label: 'RUNNING',
    icon: CircleDot,
    color: 'bg-blue-500/20 text-blue-300',
    dotColor: 'bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,1)]',
  },
  created: {
    label: 'INITIALIZING',
    icon: CircleDot,
    color: 'bg-blue-500/20 text-blue-300',
    dotColor: 'bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,1)]',
  },
  awaiting_human: {
    label: 'AWAITING APPROVAL',
    icon: AlertCircle,
    color: 'bg-amber-500/20 text-amber-300',
    dotColor: 'bg-amber-400 shadow-[0_0_10px_rgba(251,146,60,1)]',
  },
  budget_exhausted: {
    label: 'BUDGET EXHAUSTED',
    icon: Zap,
    color: 'bg-red-500/20 text-red-300',
    dotColor: 'bg-red-400 shadow-[0_0_10px_rgba(239,68,68,1)]',
  },
  completed: {
    label: 'COMPLETED',
    icon: CheckCircle2,
    color: 'bg-emerald-500/20 text-emerald-300',
    dotColor: 'bg-emerald-400',
  },
  failed: {
    label: 'FAILED',
    icon: XCircle,
    color: 'bg-red-500/20 text-red-300',
    dotColor: 'bg-red-400',
  },
  stopped: {
    label: 'STOPPED',
    icon: PauseCircle,
    color: 'bg-slate-500/20 text-slate-400',
    dotColor: 'bg-slate-400',
  },
  rejected: {
    label: 'REJECTED',
    icon: XCircle,
    color: 'bg-rose-500/20 text-rose-300',
    dotColor: 'bg-rose-400',
  },
  timeout: {
    label: 'TIMEOUT',
    icon: Clock,
    color: 'bg-orange-500/20 text-orange-300',
    dotColor: 'bg-orange-400',
  },
};

export default function ControlBar({
  runId,
  status,
  remainingTokens,
  onStop,
  compact = false,
  showTokens = true,
  showStatusBadge = true,
  loading = false,
}) {
  const [isStoppingLocal, setIsStoppingLocal] = useState(false);
  const isStoppable = STOPPABLE_STATUSES.includes(status);
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.running;
  const StatusIcon = config.icon;

  async function handleStop() {
    if (isStoppable && !isStoppingLocal && !loading) {
      setIsStoppingLocal(true);
      try {
        await onStop();
      } finally {
        setIsStoppingLocal(false);
      }
    }
  }

  const formattedTokens = remainingTokens.toLocaleString('en-US');

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={
        'bg-gradient-to-r from-surface-container to-surface-container-low ' +
        'border-b border-outline-variant/20 px-6 py-3 flex items-center ' +
        'justify-between gap-4'
      }
    >
      {/* Left side: Status badge */}
      {showStatusBadge && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 px-3 py-1 rounded-full">
            {status === 'running' || status === 'created' ? (
              <div
                className={
                  'w-2 h-2 rounded-full ' + config.dotColor + ' animate-pulse'
                }
              />
            ) : (
              <div className={'w-2 h-2 rounded-full ' + config.dotColor} />
            )}
            <span
              className={
                'inline-flex items-center gap-2 text-sm font-medium ' +
                'uppercase tracking-widest ' +
                config.color
              }
            >
              <StatusIcon className="w-4 h-4" />
              {config.label}
            </span>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side: Tokens display + Stop button */}
      <div className="flex items-center gap-4">
        {showTokens && (
          <div className="text-right hidden sm:block">
            <p className="text-xs uppercase tracking-widest text-on-surface-variant
              font-label">
              Tokens Remaining
            </p>
            <p className="text-lg font-bold text-on-surface font-mono">
              {formattedTokens}
            </p>
          </div>
        )}

        {/* Stop Button */}
        {!compact && (
          <motion.button
            whileHover={
              isStoppable && !loading && !isStoppingLocal
                ? { scale: 1.05 }
                : {}
            }
            onClick={handleStop}
            disabled={!isStoppable || loading || isStoppingLocal}
            className={
              'flex items-center justify-center gap-2 px-4 py-2 ' +
              'rounded-lg font-headline font-semibold transition-all ' +
              'disabled:opacity-50 disabled:cursor-not-allowed ' +
              (isStoppable && !loading && !isStoppingLocal
                ? 'bg-error/20 hover:bg-error/30 text-error ' +
                  'hover:shadow-[0_0_15px_rgba(255,113,108,0.3)] ' +
                  'border border-error/50 hover:border-error/70'
                : 'bg-error/10 text-error/50 border border-error/20 ' +
                  'cursor-not-allowed')
            }
          >
            {isStoppingLocal ? (
              <div
                className="w-4 h-4 border-2 border-error border-t-transparent
                  rounded-full animate-spin"
              />
            ) : (
              <Square className="w-4 h-4 fill-current" />
            )}
            <span className="hidden sm:inline">STOP</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
