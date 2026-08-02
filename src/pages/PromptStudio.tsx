import { useEffect, useMemo, useState } from 'react';
import { api, fmt } from '../lib/api';
import { saveBlob } from '../lib/download';
import { useFilters } from '../lib/filters';
import { PageHeader, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect } from '../components/dash';
import { humanizeDisposition, dispositionColor } from '../lib/format';
import { Wand2, Sparkles, PenLine, Copy, Check, Download, Loader2, KeyRound, Search } from 'lucide-react';

type Call = { call_id: string; agent_name: string | null; disposition: string; direction: string; start_timestamp: number | null; duration_seconds: number; user_sentiment: string | null; from_number: string | null; to_number: string | null };

export default function PromptStudio() {
  const { startMs, endMs } = useFilters();
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [mode, setMode] = useState<'new' | 'enhance'>('new');
  const [existingPrompt, setExistingPrompt] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [result, setResult] = useState<{ prompt: string; explanation: string; callsAnalyzed: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)).catch(() => {}); }, []);
  useEffect(() => {
    setLoadingCalls(true);
    api.calls({ workspace: ws || undefined, start: startMs, end: endMs, sort: 'when_desc', page: 1, pageSize: 200 })
      .then((r) => setCalls(r.items || [])).finally(() => setLoadingCalls(false));
  }, [ws, startMs, endMs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return calls.filter((c) => !q || [c.agent_name, c.disposition, c.from_number, c.to_number, c.call_id].some((f) => String(f || '').toLowerCase().includes(q)));
  }, [calls, search]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectVisible = () => setSelected((s) => { const n = new Set(s); filtered.slice(0, 40).forEach((c) => n.add(c.call_id)); return n; });
  const clearSel = () => setSelected(new Set());

  const run = async () => {
    setBusy(true); setErr(''); setNeedsKey(false); setResult(null);
    try {
      const r = await api.buildPrompt({ callIds: Array.from(selected).slice(0, 40), mode, existingPrompt: mode === 'enhance' ? existingPrompt : undefined, instructions });
      setResult(r);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('openai key')) setNeedsKey(true);
      setErr(msg);
    } finally { setBusy(false); }
  };
  const copy = () => { if (result) { navigator.clipboard.writeText(result.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <div>
      <PageHeader title="Prompt Studio" description="Curate or enhance an outbound agent prompt from real call transcripts"
        actions={<WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="1 · Pick reference calls" description={`${selected.size} selected · up to 40 analyzed`}
          action={<div className="flex gap-2">
            <button className="btn-ghost !py-1" onClick={selectVisible}>Select top 40</button>
            {selected.size > 0 && <button className="btn-ghost !py-1" onClick={clearSel}>Clear</button>}
          </div>}>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agent, disposition, number…" className="input w-full pl-8" />
          </div>
          {loadingCalls ? <LoadingBlock /> : filtered.length === 0 ? <EmptyState text="No calls in this range." /> : (
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-line">
              {filtered.map((c) => {
                const on = selected.has(c.call_id);
                return (
                  <label key={c.call_id} className={`flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-0 ${on ? 'bg-brand-light' : 'hover:bg-surface'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(c.call_id)} className="h-4 w-4 accent-brand" />
                    <span className="flex-1 truncate">
                      <span className="font-semibold text-ink">{c.agent_name || 'Agent'}</span>
                      <span className="ml-2 text-xs text-slate-400">{fmt.dateTime(c.start_timestamp)} · {fmt.dur(c.duration_seconds)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: dispositionColor(c.disposition) }} />
                      {humanizeDisposition(c.disposition)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="2 · Configure & generate" description="New prompt, or enhance one you paste in">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('new')} className={`flex items-start gap-2 rounded-xl border p-3 text-left ${mode === 'new' ? 'border-brand bg-brand-light' : 'border-line'}`}>
              <Sparkles className={`mt-0.5 h-4 w-4 ${mode === 'new' ? 'text-brand' : 'text-slate-400'}`} />
              <span><span className="block text-sm font-semibold text-ink">Create new</span><span className="block text-xs text-slate-500">Fresh prompt from these calls</span></span>
            </button>
            <button onClick={() => setMode('enhance')} className={`flex items-start gap-2 rounded-xl border p-3 text-left ${mode === 'enhance' ? 'border-brand bg-brand-light' : 'border-line'}`}>
              <PenLine className={`mt-0.5 h-4 w-4 ${mode === 'enhance' ? 'text-brand' : 'text-slate-400'}`} />
              <span><span className="block text-sm font-semibold text-ink">Enhance existing</span><span className="block text-xs text-slate-500">Improve a prompt you paste</span></span>
            </button>
          </div>

          {mode === 'enhance' && (
            <div className="mt-3">
              <label className="label mb-1 block">Existing agent prompt</label>
              <textarea value={existingPrompt} onChange={(e) => setExistingPrompt(e.target.value)} rows={6} className="input font-mono text-xs" placeholder="Paste the current agent system prompt here…" />
            </div>
          )}
          <div className="mt-3">
            <label className="label mb-1 block">Extra instructions (optional)</label>
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} className="input" placeholder="e.g. keep under 400 words, emphasize booking the demo" />
          </div>

          {needsKey ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              <div>Add <code className="font-mono">OPENAI_API_KEY</code> as a Supabase Edge Function secret, then retry — no redeploy needed.</div>
            </div>
          ) : err ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div> : null}

          <button className="btn-primary mt-4 w-full" disabled={busy || selected.size === 0 || (mode === 'enhance' && !existingPrompt.trim())} onClick={run}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing {selected.size} transcripts…</> : <><Wand2 className="h-4 w-4" /> {mode === 'new' ? 'Generate prompt' : 'Enhance prompt'}</>}
          </button>
          {selected.size === 0 && <p className="mt-2 text-center text-xs text-slate-400">Select at least one call to start.</p>}
        </SectionCard>
      </div>

      {result && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Analyzed {result.callsAnalyzed} call transcripts.</div>
          <SectionCard title="What changed & why" description="Reasoning behind the generated prompt">
            <div className="whitespace-pre-wrap text-sm text-slate-700">{result.explanation}</div>
          </SectionCard>
          <SectionCard title="Generated agent prompt" description="Copy into Retell / GHL"
            action={<div className="flex gap-2">
              <button className="btn-ghost !py-1" onClick={copy}>{copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}</button>
              <button className="btn-ghost !py-1" onClick={() => saveBlob(new Blob([result.prompt], { type: 'text/plain' }), 'agent-prompt.txt')}><Download className="h-3.5 w-3.5" /> .txt</button>
            </div>}>
            <textarea readOnly value={result.prompt} rows={16} className="input font-mono text-xs" />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
