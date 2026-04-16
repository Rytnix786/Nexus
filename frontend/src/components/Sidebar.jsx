import React from 'react';
import { LayoutGrid, Zap, History, Cpu, Settings, FileText, Activity, BookOpen, Boxes, ScrollText } from 'lucide-react';
import clsx from 'clsx';
import { prettyStatus, relativeTimeLabel } from './shared';
import { API_BASE } from '../lib/api';

export default function Sidebar({
  currentTab = 'dashboard',
  onTabChange,
  recentRuns = [],
  recentRunsLoading = false,
  selectedRunId = '',
  onSelectRun,
  authState = null,
  authToken = '',
}) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'active', label: 'Active Runs', icon: Zap },
    { id: 'results', label: 'Results', icon: ScrollText },
    { id: 'history', label: 'History', icon: History },
    { id: 'agents', label: 'Agent Pool', icon: Cpu },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'status', label: 'System Status', icon: Activity },
    { id: 'models', label: 'Models', icon: Boxes },
    { id: 'library', label: 'Library', icon: BookOpen },
  ];

  const visibleRuns = Array.isArray(recentRuns) ? recentRuns.slice(0, 6) : [];
  // Construct documentation URL - strip /api suffix if present, append /docs
  const apiBaseUrl = String(API_BASE || 'http://localhost:8000/api').trim();
  const baseUrl = apiBaseUrl.replace(/\/api\/?$/, '');
  const docsHref = `${baseUrl}/docs`;

  return (
    <aside className="fixed left-0 top-0 h-full w-72 flex flex-col gap-6 overflow-y-auto border-r border-[#46484e]/15 bg-[#0c0e13] p-6 pt-28">
      <div className="space-y-2 px-4">
        <h3 className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Orchestration</h3>
        <p className="text-[11px] text-on-surface-variant/80">
          {authState?.status === 'ready' ? 'History recovered from token.' : authState?.message || 'Connect with a token to recover run history.'}
        </p>
        {authToken && authState?.claims?.sub && (
          <p className="text-[11px] text-primary/90 truncate">{authState.claims.sub}</p>
        )}
      </div>

      <nav className="space-y-2">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-full transition-colors",
                isActive 
                  ? "bg-primary/20 text-primary border border-primary/40" 
                  : "text-[#f3f3fb]/60 hover:bg-[#23262d] hover:text-[#f3f3fb]"
              )}
            >
              <Icon className={clsx("w-5 h-5", isActive && "fill-primary/20")} />
              <span className="font-medium">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Run History</h4>
          {recentRunsLoading && <span className="text-[10px] text-primary">Syncing</span>}
        </div>
        {visibleRuns.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            {recentRunsLoading ? 'Loading previous runs...' : 'No saved runs yet.'}
          </p>
        ) : (
          <div className="space-y-2">
            {visibleRuns.map((run) => {
              const isActive = String(selectedRunId || '') === String(run.run_id || '');
              return (
                <button
                  key={run.run_id}
                  type="button"
                  onClick={() => typeof onSelectRun === 'function' && onSelectRun(run.run_id)}
                  className={clsx(
                    'w-full rounded-2xl border px-3 py-2 text-left transition-colors',
                    isActive ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-white">{String(run.run_id || '').slice(0, 12)}</p>
                      {run.objective && (
                        <p className="truncate text-[10px] text-on-surface-variant/80 mt-0.5">
                          {String(run.objective).length > 40 ? String(run.objective).slice(0, 37) + '…' : String(run.objective)}
                        </p>
                      )}
                      <p className="text-[10px] text-on-surface-variant">{prettyStatus(run.status)}</p>
                    </div>
                    <span className={clsx('rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest flex-shrink-0', isActive ? 'bg-primary/15 text-primary' : 'bg-white/5 text-white/60')}>
                      {run.status || 'unknown'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-on-surface-variant">{relativeTimeLabel(run.started_at)}</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-auto space-y-2">
        <button
          type="button"
          onClick={() => {
            window.open(docsHref, '_blank', 'noopener,noreferrer');
          }}
          className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-[#f3f3fb]/60 transition-colors hover:text-primary"
        >
          <FileText className="w-4 h-4 scale-75" />
          <span>Documentation</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('status')}
          className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-[#f3f3fb]/60 transition-colors hover:text-primary"
        >
          <Activity className="w-4 h-4 scale-75" />
          <span>System Status</span>
        </button>
      </div>
    </aside>
  );
}
