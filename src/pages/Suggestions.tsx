import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import { PageHeader, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect } from '../components/dash';
import { Sparkles, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

type Suggestion = { title: string; severity: 'high' | 'medium' | 'low'; detail: string; metric?: string };

const SEV: Record<string, { label: string; cls: string; dot: string }> = {
  high: { label: 'High impact', cls: 'bg-red-50 text-red-700', dot: '#dc2626' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-700', dot: '#d97706' },
  low: { label: 'Low', cls: 'bg-slate-100 text-slate-600', dot: '#94a3b8' },
};

export default function Suggestions() {
  const { startMs, endMs } = useFilters();
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [analyzed, setAnalyzed] = useState<number | null>(null);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)).catch(() => {}); }, []);

  const run = async () => {
    setBusy(true); setError(''); setNeedsKey(false);
    try {
      const r = await api.aiSuggestions({ workspace: ws || null, start: startMs, end: endMs });
      setItems(Array.isArray(r.suggestions) ? r.suggestions : []);
      setAnalyzed(r.callsAnalyzed ?? null);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/openai key/i.test(msg)) setNeedsKey(true);
      setError(msg);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="AI Suggestions" description="LLM-generated campaign optimizations from your live call data"
        actions={<>
          <WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Analyzing…' : 'Generate'}
          </button>
        </>} />

      {needsKey && (
        <div className="card mb-5 flex items-center gap-3 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Add an OpenAI API key (secret <code className="mx-1 font-mono">OPENAI_API_KEY</code>) in the Supabase backend to enable AI features.
        </div>
      )}
      {error && !needsKey && <div className="card mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {busy ? <LoadingBlock label="Analyzing your calls…" /> : items.length === 0 ? (
        <SectionCard title="Ready when you are" description="Pick a workspace (or leave as all) and click Generate">
          <EmptyState text="No suggestions yet — click Generate to analyze the selected range." />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-4">
          {analyzed != null && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>{items.length} suggestions · analyzed {analyzed.toLocaleString()} calls</span>
              <button className="inline-flex items-center gap-1.5 text-brand hover:underline" onClick={run}><RefreshCw className="h-3.5 w-3.5" /> Regenerate</button>
            </div>
          )}
          {items.map((s, i) => {
            const sev = SEV[s.severity] || SEV.low;
            return (
              <div key={i} className="card p-5" style={{ borderLeftColor: sev.dot, borderLeftWidth: 4 }}>
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold text-ink">{s.title}</h3>
                  <span className={`pill shrink-0 ${sev.cls}`}>{sev.label}</span>
                </div>
                <p className="text-sm text-slate-700">{s.detail}</p>
                {s.metric && <div className="mt-2 inline-block rounded-md bg-surface px-2 py-1 font-mono text-xs text-slate-600">{s.metric}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
