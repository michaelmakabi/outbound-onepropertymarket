import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import { PageHeader, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect } from '../components/dash';
import { FileBarChart, Loader2, AlertTriangle, Copy, Check, Download } from 'lucide-react';

// Minimal, safe markdown → HTML (headings, bold, bullet/numbered lists, paragraphs). No raw HTML passthrough.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = md.replace(/\r/g, '').split('\n');
  let html = ''; let list: 'ul' | 'ol' | null = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; const sz = ['text-xl', 'text-lg', 'text-base', 'text-sm'][lvl - 1]; html += `<h${lvl} class="mt-4 mb-2 font-bold text-ink ${sz}">${inline(h[2])}</h${lvl}>`; }
    else if (ul) { if (list !== 'ul') { closeList(); html += '<ul class="my-2 ml-5 list-disc space-y-1">'; list = 'ul'; } html += `<li class="text-sm text-slate-700">${inline(ul[1])}</li>`; }
    else if (ol) { if (list !== 'ol') { closeList(); html += '<ol class="my-2 ml-5 list-decimal space-y-1">'; list = 'ol'; } html += `<li class="text-sm text-slate-700">${inline(ol[1])}</li>`; }
    else if (line === '') { closeList(); }
    else { closeList(); html += `<p class="my-2 text-sm leading-relaxed text-slate-700">${inline(line)}</p>`; }
  }
  closeList();
  return html;
}

export default function Reports() {
  const { startMs, endMs, rangeLabel } = useFilters();
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [report, setReport] = useState('');
  const [analyzed, setAnalyzed] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)).catch(() => {}); }, []);

  const run = async () => {
    setBusy(true); setError(''); setNeedsKey(false);
    try {
      const r = await api.aiReport({ workspace: ws || null, start: startMs, end: endMs, periodLabel: rangeLabel });
      setReport(r.report || ''); setAnalyzed(r.callsAnalyzed ?? null);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/openai key/i.test(msg)) setNeedsKey(true);
      setError(msg);
    } finally { setBusy(false); }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const download = () => {
    const blob = new Blob([report], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `1propertymarket-report-${new Date().toISOString().slice(0, 10)}.md`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <PageHeader title="Reports" description="AI-written executive summary of your outbound program"
        actions={<>
          <WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
            {busy ? 'Writing…' : 'Generate report'}
          </button>
        </>} />

      {needsKey && (
        <div className="card mb-5 flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Add an OpenAI API key (secret <code className="mx-1 font-mono">OPENAI_API_KEY</code>) in the Supabase backend to enable AI features.
        </div>
      )}
      {error && !needsKey && <div className="card mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {busy ? <LoadingBlock label="Writing your report…" /> : !report ? (
        <SectionCard title="Executive report" description="Pick a range and workspace, then generate">
          <EmptyState text="No report yet — click Generate report." />
        </SectionCard>
      ) : (
        <SectionCard title="Executive report" description={analyzed != null ? `${rangeLabel} · ${analyzed.toLocaleString()} calls analyzed` : rangeLabel}
          action={<div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={copy}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn-ghost" onClick={download}><Download className="h-4 w-4" /> .md</button>
          </div>}>
          <div dangerouslySetInnerHTML={{ __html: mdToHtml(report) }} />
        </SectionCard>
      )}
    </div>
  );
}
