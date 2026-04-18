import React, { useRef, useState } from 'react';
import { Download, Share2, Printer, CheckCircle2, Copy, Check, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportElementToPdf } from '../lib/pdfExport';

// ─── Clipboard write with permission fallback ─────────────────────────────────
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // Permission denied or clipboard unavailable — fall through to execCommand.
    }
  }
  // Legacy fallback: create a transient textarea and use execCommand.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    if (success) return { ok: true };
    return { ok: false, reason: 'execCommand returned false' };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

// ─── Share with fallback to copy URL ────────────────────────────────────────
async function shareOrCopyLink(title, text, runId) {
  const url = `${window.location.origin}${window.location.pathname}?run=${runId}`;
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: 'native' };
    } catch (err) {
      // User cancelled share dialog — not an error worth surfacing.
      if (String(err).includes('AbortError')) return { ok: true, method: 'cancelled' };
    }
  }
  // Fallback: copy deep-link URL to clipboard.
  const result = await copyToClipboard(url);
  return { ...result, method: 'clipboard-link' };
}

// ─── Toast state hook ─────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null); // { message, type: 'success'|'error' }
  const show = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };
  return { toast, show };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function RunArtifact({ runStream = {} }) {
  const runId = String(runStream.runId || '');
  const runDetails = runStream.runDetails || null;
  const output = String(
    runStream.output ||
    runDetails?.output ||
    runDetails?.final_output ||
    ''
  );
  const objective = String(runDetails?.objective || '');

  const contentRef = useRef(null);
  const { toast, show: showToast } = useToast();

  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Copy handler ────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (copying) return;
    setCopying(true);
    const result = await copyToClipboard(output);
    setCopying(false);
    if (result.ok) {
      setCopied(true);
      showToast('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } else {
      showToast('Copy failed — check clipboard permissions', 'error');
    }
  };

  // ── Print handler ───────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  // ── Share handler ───────────────────────────────────────────────────────────
  const handleShare = async () => {
    const result = await shareOrCopyLink(
      `Nexus Research Report`,
      objective || 'Research report from Nexus AI',
      runId,
    );
    if (result.ok && result.method === 'clipboard-link') {
      showToast('Link copied to clipboard');
    } else if (!result.ok) {
      showToast('Share failed — check permissions', 'error');
    }
  };

  // ── PDF export handler ──────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportElementToPdf(contentRef, runId, 'nexus-report');
      showToast('PDF downloaded');
    } catch (err) {
      showToast(`PDF failed: ${String(err?.message || err).slice(0, 60)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-8 animate-slide-in print:p-0">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap print:hidden">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-headline font-bold text-on-surface">Mission Complete</h1>
              {objective && (
                <p className="text-on-surface-variant font-body text-sm mt-1 max-w-lg">
                  {objective.length > 100 ? objective.slice(0, 97) + '…' : objective}
                </p>
              )}
              <p className="text-on-surface-variant font-label text-xs uppercase tracking-widest mt-1">
                Run: {runId || '—'}
              </p>
            </div>
          </div>

          {/* ── Action buttons ─────────────────────────────────────────────── */}
          <div className="flex gap-3 flex-shrink-0 flex-wrap">
            {/* Copy */}
            <button
              onClick={handleCopy}
              disabled={copying || !output}
              title="Copy report text"
              className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-40 relative"
            >
              {copied ? (
                <Check className="w-5 h-5 text-emerald-400" />
              ) : copying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>

            {/* Print */}
            <button
              onClick={handlePrint}
              title="Print report"
              className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Printer className="w-5 h-5" />
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              title="Share report link"
              className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPdf}
              disabled={exporting || !output}
              title="Export as PDF"
              className="flex items-center gap-2 px-6 py-3 bg-primary text-[#005762] rounded-xl font-bold font-headline hover:shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Export PDF
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Toast notification ───────────────────────────────────────────── */}
        {toast && (
          <div
            className={`mb-6 px-5 py-3 rounded-xl text-sm font-medium border transition-all animate-slide-in ${
              toast.type === 'error'
                ? 'bg-rose-500/10 border-rose-400/30 text-rose-200'
                : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* ── Report content ────────────────────────────────────────────────── */}
        <div
          ref={contentRef}
          className="glass-panel border border-outline-variant/20 rounded-[2.5rem] p-12 relative overflow-hidden bg-surface-container-low shadow-2xl report-content"
        >
          <div className="absolute top-0 right-0 p-6 flex gap-2 print:hidden">
            <div className="px-3 py-1 bg-surface-container rounded-full text-xs font-label text-on-surface-variant border border-outline-variant/10">
              v1.2
            </div>
            <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-label border border-emerald-500/30">
              Final Verified
            </div>
          </div>

          {output ? (
            <div className="prose prose-invert prose-p:text-on-surface prose-headings:text-primary prose-a:text-secondary max-w-none font-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p className="text-sm">Loading report…</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Print-only styles ──────────────────────────────────────────────── */}
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
