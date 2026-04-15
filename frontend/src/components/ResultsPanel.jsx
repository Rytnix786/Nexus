import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, FileText, ChevronRight, Loader2,
  Download, Copy, Printer, Share2, Check, AlertTriangle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { getRunStatus, getRunTimeline } from '../lib/api';
import { prettyStatus, relativeTimeLabel, parseTimestamp, statusClass } from './shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runDuration(run) {
  if (!run) return null;
  const start = parseTimestamp(run.started_at);
  const end = parseTimestamp(run.updated_at);
  if (isNaN(start) || isNaN(end)) return null;
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

function tokenPct(run) {
  const used = Number(run?.total_tokens_used ?? run?.prompt_tokens_total ?? 0);
  const budget = Number(run?.initial_token_budget ?? 0);
  if (!budget) return null;
  return Math.min(100, Math.round((used / budget) * 100));
}

// ─── Clipboard with fallback ──────────────────────────────────────────────────

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return { ok: true }; } catch { /* fall through */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return { ok };
  } catch { return { ok: false }; }
}

async function shareOrCopyLink(runId, objective) {
  const url = `${window.location.origin}${window.location.pathname}?run=${runId}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Nexus Research Report', text: objective || '', url });
      return { ok: true, method: 'native' };
    } catch (e) {
      if (String(e).includes('AbortError')) return { ok: true, method: 'cancelled' };
    }
  }
  const result = await copyToClipboard(url);
  return { ...result, method: 'clipboard-link' };
}

// ─── Async PDF export ─────────────────────────────────────────────────────────

async function exportToPdf(contentRef, runId) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const el = contentRef.current;
  if (!el) throw new Error('Content not mounted');
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#0c0e13', logging: false });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pw) / canvas.width;
  let left = imgH;
  let y = 0;
  pdf.addImage(imgData, 'PNG', 0, y, pw, imgH);
  left -= ph;
  while (left > 0) {
    y -= ph;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, y, pw, imgH);
    left -= ph;
  }
  pdf.save(`nexus-report-${String(runId || 'export').slice(0, 12)}.pdf`);
}

// ─── Toast hook ───────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };
  return { toast, show };
}

// ─── Sub-tabs definition ─────────────────────────────────────────────────────

const ARTIFACT_TABS = [
  { id: 'final_output', label: 'Report' },
  { id: 'plan', label: 'Plan' },
  { id: 'research_notes', label: 'Research' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'critique', label: 'Critique' },
];

function getArtifactContent(runDetails, tabId) {
  if (!runDetails) return '';
  if (tabId === 'research_notes') {
    const notes = runDetails.research_notes;
    if (Array.isArray(notes)) return notes.join('\n\n') || '';
    return String(notes || '');
  }
  return String(runDetails[tabId] || '');
}

// ─── StatusIcon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }) {
  const s = String(status || '');
  if (s === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (s === 'rejected' || s === 'failed' || s === 'timeout') return <XCircle className="w-4 h-4 text-rose-400" />;
  if (s === 'budget_exhausted') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  return <Clock className="w-4 h-4 text-on-surface-variant" />;
}

// ─── ResultsPanel ─────────────────────────────────────────────────────────────

export default function ResultsPanel({
  recentRuns = [],
  runStream = {},
  selectedResultRunId = '',
  setSelectedResultRunId,
  onSelectRun,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [loadedDetails, setLoadedDetails] = useState(null);   // runDetails fetched for the selected run
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [activeTab, setActiveTab] = useState('final_output');

  // Button states
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const contentRef = useRef(null);
  const { toast, show: showToast } = useToast();

  // ── Completed runs list ────────────────────────────────────────────────────
  const terminalStatuses = ['completed', 'rejected', 'failed', 'timeout', 'budget_exhausted'];
  const completedRuns = Array.isArray(recentRuns)
    ? recentRuns.filter((r) => terminalStatuses.includes(String(r?.status || '')))
    : [];

  // If the active runStream just completed, include it even if not in recentRuns yet
  const liveRunId = runStream?.runId;
  const liveStatus = runStream?.status;
  const liveIsComplete = liveRunId && terminalStatuses.includes(String(liveStatus || ''));
  const runListIds = new Set(completedRuns.map((r) => r.run_id));
  const liveRunEntry = liveIsComplete && !runListIds.has(liveRunId) ? {
    run_id: liveRunId,
    status: liveStatus,
    objective: runStream.runDetails?.objective || '',
    started_at: runStream.runDetails?.started_at || null,
  } : null;

  const displayRuns = liveRunEntry
    ? [liveRunEntry, ...completedRuns]
    : completedRuns;

  // Auto-select the first run if nothing is selected
  useEffect(() => {
    if (!selectedResultRunId && displayRuns.length > 0) {
      const firstId = displayRuns[0]?.run_id;
      if (firstId && typeof setSelectedResultRunId === 'function') {
        setSelectedResultRunId(firstId);
      }
    }
  }, [displayRuns, selectedResultRunId, setSelectedResultRunId]);

  // ── Fetch run details when selection changes ───────────────────────────────
  useEffect(() => {
    if (!selectedResultRunId) {
      setLoadedDetails(null);
      setDetailsError('');
      return;
    }

    // If this is the live run, use runStream data directly (no fetch needed)
    if (selectedResultRunId === liveRunId && runStream.runDetails) {
      setLoadedDetails(runStream.runDetails);
      setDetailsError('');
      return;
    }

    let cancelled = false;
    setLoadingDetails(true);
    setDetailsError('');
    setLoadedDetails(null);

    async function load() {
      try {
        // Fetch run status and timeline in parallel
        const [statusData, timelineData] = await Promise.allSettled([
          getRunStatus(selectedResultRunId),
          getRunTimeline(selectedResultRunId),
        ]);

        if (cancelled) return;

        const runData = statusData.status === 'fulfilled' ? statusData.value : null;
        const events = timelineData.status === 'fulfilled'
          ? (Array.isArray(timelineData.value?.events) ? timelineData.value.events : [])
          : [];

        // Reconstruct artifact fields from timeline events
        const artifacts = {};
        for (const evt of events) {
          const d = evt?.data || {};
          if (d.plan) artifacts.plan = d.plan;
          if (d.analysis) artifacts.analysis = d.analysis;
          if (d.draft) artifacts.draft = d.draft;
          if (d.critique) artifacts.critique = d.critique;
          if (d.final_output) artifacts.final_output = d.final_output;
        }

        const finalOutput = runData?.final_output || artifacts.final_output || runData?.output || '';

        setLoadedDetails({
          ...runData,
          ...artifacts,
          final_output: finalOutput,
          events,
        });
      } catch (err) {
        if (cancelled) return;
        setDetailsError(String(err?.message || err));
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [selectedResultRunId, liveRunId, runStream.runDetails]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const details = loadedDetails;
  const output = getArtifactContent(details, activeTab);
  const selectedRun = displayRuns.find((r) => r?.run_id === selectedResultRunId) || null;
  const objective = String(details?.objective || selectedRun?.objective || '');
  const duration = runDuration(details || selectedRun);
  const pct = tokenPct(details);

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (copying || !output) return;
    setCopying(true);
    const result = await copyToClipboard(output);
    setCopying(false);
    if (result.ok) {
      setCopied(true);
      showToast('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('Copy failed — clipboard access denied', 'error');
    }
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    if (!selectedResultRunId) return;
    const result = await shareOrCopyLink(selectedResultRunId, objective);
    if (result.ok && result.method === 'clipboard-link') showToast('Link copied to clipboard');
    else if (!result.ok) showToast('Share failed', 'error');
  };

  const handleExportPdf = async () => {
    if (exporting || !output) return;
    setExporting(true);
    try {
      await exportToPdf(contentRef, selectedResultRunId);
      showToast('PDF downloaded');
    } catch (err) {
      showToast(`PDF failed: ${String(err?.message || err).slice(0, 60)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleMarkdownExport = () => {
    if (!output) return;
    const blob = new Blob([output], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-report-${String(selectedResultRunId || 'export').slice(0, 12)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Markdown file downloaded');
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (displayRuns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full pb-20 text-on-surface-variant gap-4 animate-slide-in">
        <FileText className="w-16 h-16 text-on-surface-variant/30" />
        <h2 className="text-2xl font-headline font-bold text-on-surface">No completed runs yet</h2>
        <p className="text-sm max-w-sm text-center">
          Start a run from the Orchestrator. When it completes, your report will appear here.
        </p>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 overflow-hidden animate-slide-in">

      {/* ── Left column: run picker ──────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 h-full overflow-y-auto custom-scrollbar border-r border-outline-variant/15 bg-[#0c0e13] p-4 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant px-2 mb-3">
          Completed Runs
          <span className="ml-2 text-primary">{displayRuns.length}</span>
        </h3>
        {displayRuns.map((run) => {
          if (!run?.run_id) return null;
          const isSelected = run.run_id === selectedResultRunId;
          return (
            <button
              key={run.run_id}
              type="button"
              onClick={() => {
                if (typeof setSelectedResultRunId === 'function') setSelectedResultRunId(run.run_id);
                setActiveTab('final_output');
              }}
              className={clsx(
                'w-full rounded-2xl border px-3 py-3 text-left transition-all',
                isSelected
                  ? 'border-primary/40 bg-primary/10 shadow-[0_0_12px_rgba(0,229,255,0.08)]'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <StatusIcon status={run.status} />
                <span className={clsx('rounded-full px-2 py-0.5 text-[9px] uppercase tracking-widest font-bold ring-1', statusClass(run.status))}>
                  {prettyStatus(run.status)}
                </span>
                {isSelected && <ChevronRight className="w-3 h-3 text-primary ml-auto" />}
              </div>
              <p className="text-[11px] font-mono text-white/60">{String(run.run_id).slice(0, 16)}</p>
              {run.objective && (
                <p className="text-[11px] text-on-surface mt-1 line-clamp-2">
                  {String(run.objective).length > 60 ? String(run.objective).slice(0, 57) + '…' : String(run.objective)}
                </p>
              )}
              <p className="text-[10px] text-on-surface-variant mt-1">{relativeTimeLabel(run.started_at)}</p>
            </button>
          );
        })}
      </aside>

      {/* ── Right column: report viewer ──────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* ── Report header ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex flex-wrap items-start justify-between gap-4 px-8 pt-6 pb-4 border-b border-outline-variant/15 print:hidden">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <h1 className="text-xl font-headline font-bold text-on-surface truncate">
                {objective || 'Research Report'}
              </h1>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-on-surface-variant">
              {selectedResultRunId && (
                <span className="font-mono">{String(selectedResultRunId).slice(0, 16)}</span>
              )}
              {duration && <span>· {duration}</span>}
              {pct !== null && (
                <span>
                  · <span className={pct > 90 ? 'text-rose-300' : 'text-primary'}>{pct}% budget used</span>
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            <button
              onClick={handleCopy}
              disabled={copying || !output}
              title="Copy text"
              className="p-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-40"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handlePrint}
              title="Print"
              className="p-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleShare}
              title="Share link"
              className="p-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleMarkdownExport}
              disabled={!output}
              title="Download .md"
              className="p-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-40 text-[10px] font-bold px-3"
            >
              .md
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting || !output}
              title="Export PDF"
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-[#005762] rounded-xl font-bold font-headline text-sm hover:shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] justify-center"
            >
              {exporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
              ) : (
                <><Download className="w-4 h-4" />Export PDF</>
              )}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={clsx(
            'mx-8 mt-3 flex-shrink-0 px-4 py-2 rounded-xl text-sm border animate-slide-in',
            toast.type === 'error'
              ? 'bg-rose-500/10 border-rose-400/30 text-rose-200'
              : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
          )}>
            {toast.msg}
          </div>
        )}

        {/* Sub-tab bar */}
        <div className="flex-shrink-0 flex gap-1 px-8 pt-3 print:hidden">
          {ARTIFACT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-1.5 rounded-full text-xs font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Scrollable report body ────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-8 py-6">

          {/* Loading state */}
          {loadingDetails && (
            <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Loading report…</p>
            </div>
          )}

          {/* Error state */}
          {!loadingDetails && detailsError && (
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-200 text-sm">
              <p className="font-bold mb-1">Failed to load run details</p>
              <p className="font-mono text-xs">{detailsError}</p>
            </div>
          )}

          {/* Refusal badge */}
          {!loadingDetails && !detailsError && details && selectedRun?.status === 'rejected' && (
            <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-200 text-sm">Refused — Insufficient Evidence</p>
                <p className="text-amber-100/70 text-xs mt-1">
                  The Analyst determined the retrieved sources were below the quality threshold.
                  The system returned <code className="font-mono">INSUFFICIENT_CONTEXT</code> instead of generating a hallucinated answer.
                </p>
              </div>
            </div>
          )}

          {/* Empty artifact state */}
          {!loadingDetails && !detailsError && !output && (
            <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant gap-2">
              <FileText className="w-8 h-8 opacity-30" />
              <p className="text-sm">No content for this artifact yet.</p>
            </div>
          )}

          {/* Report content */}
          {!loadingDetails && !detailsError && output && (
            <div
              ref={contentRef}
              className="glass-panel border border-outline-variant/20 rounded-[2rem] p-10 bg-surface-container-low shadow-xl report-content"
            >
              <div className="prose prose-invert prose-p:text-on-surface prose-headings:text-primary prose-a:text-secondary max-w-none font-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .report-content { display: block !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
