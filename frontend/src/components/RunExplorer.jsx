import { formatDollars, prettyStatus, relativeTimeLabel } from './shared';

import React, { useState } from 'react';
import BudgetResumePanel from './BudgetResumePanel';

export default function RunExplorer({
  searchText,
  setSearchText,
  statusFilter,
  setStatusFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  minCostUsd,
  setMinCostUsd,
  maxCostUsd,
  setMaxCostUsd,
  recentRuns,
  runId,
  onSelectRun,
  runExplorerPage,
  setRunExplorerPage,
  runExplorerTotal,
  perPage,
  onStopRun,
  stoppingRunId,
  onResumeWithBudget,
}) {
  const stoppableStatuses = ['created', 'running', 'awaiting_human'];
  const [selectedResumeRunId, setSelectedResumeRunId] = useState(null);
  const runs = Array.isArray(recentRuns) ? recentRuns : [];

  return (
    <aside className="rounded-[28px] border border-white/15 bg-black/30 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <h3 className="text-lg font-semibold text-white">Run Explorer</h3>
      <div className="mt-3 grid gap-2">
        <input value={searchText} onChange={(e) => { setRunExplorerPage(1); setSearchText(e.target.value); }} placeholder="Search run id/objective" className="h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white" />
        <select
          value={statusFilter}
          onChange={(e) => { setRunExplorerPage(1); setStatusFilter(e.target.value); }}
          className="h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white"
        >
          <option value="" className="bg-white text-slate-900">All statuses</option>
          {['created', 'running', 'awaiting_human', 'completed', 'failed', 'stopped', 'rejected', 'timeout', 'budget_exhausted'].map((item) => (
            <option key={item} value={item} className="bg-white text-slate-900">
              {item}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={dateFrom} onChange={(e) => { setRunExplorerPage(1); setDateFrom(e.target.value); }} className="h-10 rounded-lg border border-white/20 bg-white/5 px-2 text-xs text-white" />
          <input type="date" value={dateTo} onChange={(e) => { setRunExplorerPage(1); setDateTo(e.target.value); }} className="h-10 rounded-lg border border-white/20 bg-white/5 px-2 text-xs text-white" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            step="0.0001"
            value={minCostUsd}
            onChange={(e) => { setRunExplorerPage(1); setMinCostUsd(e.target.value); }}
            placeholder="Min $"
            className="h-10 rounded-lg border border-white/20 bg-white/5 px-2 text-xs text-white"
            aria-label="Minimum cost"
          />
          <input
            type="number"
            min="0"
            step="0.0001"
            value={maxCostUsd}
            onChange={(e) => { setRunExplorerPage(1); setMaxCostUsd(e.target.value); }}
            placeholder="Max $"
            className="h-10 rounded-lg border border-white/20 bg-white/5 px-2 text-xs text-white"
            aria-label="Maximum cost"
          />
        </div>
      </div>
      <div className="mt-4 max-h-[560px] space-y-2 overflow-auto">
        {runs.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-4 text-sm text-white/80">
            {String(searchText || statusFilter || dateFrom || dateTo || minCostUsd || maxCostUsd).trim() ? (
              <>
                <p className="font-semibold text-white">No runs match current filters</p>
                <p className="mt-1 text-white/60">Try widening date range, clearing status, or expanding the cost bounds.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-white">No runs yet</p>
                <p className="mt-1 text-white/60">Start a run from Mission Control and it will appear here.</p>
              </>
            )}
          </div>
        )}
        {runs.map((run) => {
          const canStop = stoppableStatuses.includes(String(run.status || '').toLowerCase());
            const canResume = String(run.status || '').toLowerCase() === 'budget_exhausted';
          const isStopping = stoppingRunId === run.run_id;

          return (
            <div key={run.run_id} className={`rounded-lg border px-3 py-2 ${runId === run.run_id ? 'border-cyan-300/60 bg-cyan-300/10' : 'border-white/10 bg-white/5'}`}>
              <button onClick={() => onSelectRun(run.run_id)} className="w-full text-left">
                <p className="text-xs text-cyan-100">{String(run.run_id || '').slice(0, 12)}</p>
                <p className="text-[11px] text-white/75">{prettyStatus(run.status)}</p>
                <p className="mt-1 text-[11px] text-white/75">{formatDollars(run.estimated_cost_usd)}</p>
                <p className="mt-1 text-xs text-white/55">{relativeTimeLabel(run.started_at)}</p>
              </button>
                {canResume && (
                  <button
                    onClick={() => setSelectedResumeRunId(run.run_id)}
                    className="mt-2 w-full rounded border border-emerald-400/50 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-400/20 transition-colors"
                  >
                    + Add Budget
                  </button>
                )}
              {canStop && (
                <button
                  onClick={() => {
                    console.log('[RunExplorer] Stop button clicked for run:', run.run_id, run);
                    onStopRun(run.run_id);
                  }}
                  disabled={isStopping}
                  className="mt-2 w-full rounded border border-rose-300/50 bg-rose-400/10 px-2 py-1 text-[11px] text-rose-100 disabled:opacity-50"
                >
                  {isStopping ? 'Stopping...' : 'Stop Run'}
                </button>
              )}
            </div>
          );
        })}
      </div>
        {/* BudgetResumePanel Modal */}
        {selectedResumeRunId && (
          <BudgetResumePanel
            runId={selectedResumeRunId}
            currentBudgetRemaining={0}
            onResume={(amount) => {
              if (onResumeWithBudget) {
                onResumeWithBudget(amount, selectedResumeRunId);
              }
              setSelectedResumeRunId(null);
            }}
            onCancel={() => setSelectedResumeRunId(null)}
          />
        )}
      <div className="mt-3 flex items-center justify-between text-xs text-white/70">
        <button onClick={() => setRunExplorerPage((p) => Math.max(1, p - 1))} className="rounded border border-white/20 px-2 py-1" disabled={runExplorerPage <= 1}>Prev</button>
        <span>Page {runExplorerPage} / {Math.max(1, Math.ceil(runExplorerTotal / perPage))}</span>
        <button onClick={() => setRunExplorerPage((p) => p + 1)} className="rounded border border-white/20 px-2 py-1" disabled={runExplorerPage >= Math.max(1, Math.ceil(runExplorerTotal / perPage))}>Next</button>
      </div>
    </aside>
  );
}
