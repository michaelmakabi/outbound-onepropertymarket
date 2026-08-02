import { useState } from 'react';
import { api } from '../lib/api';
import { saveBlob } from '../lib/download';
import { X, Wand2, Sparkles, PenLine, Copy, Check, Download, Loader2, KeyRound } from 'lucide-react';

export default function AiPromptModal({ callIds, onClose }: { callIds: string[]; onClose: () => void }) {
  const [mode, setMode] = useState<'new' | 'enhance'>('new');
  const [existingPrompt, setExistingPrompt] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [result, setResult] = useState<{ prompt: string; explanation: string; callsAnalyzed: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true); setErr(''); setNeedsKey(false); setResult(null);
    try {
      const r = await api.buildPrompt({ callIds, mode, existingPrompt: mode === 'enhance' ? existingPrompt : undefined, instructions });
      setResult(r);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('openai key')) setNeedsKey(true);
      setErr(msg);
    } finally { setBusy(false); }
  };

  const copy = () => { if (result) { navigator.clipboard.writeText(result.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><Wand2 className="h-5 w-5 text-brand" /> AI Agent Prompt from {callIds.length} calls</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>

        {!result ? (
          <div className="flex flex-col gap-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode('new')} className={`flex items-start gap-2 rounded-xl border p-3 text-left ${mode === 'new' ? 'border-brand bg-brand-light' : 'border-line'}`}>
                <Sparkles className={`mt-0.5 h-4 w-4 ${mode === 'new' ? 'text-brand' : 'text-slate-400'}`} />
                <span><span className="block text-sm font-semibold text-ink">Create new prompt</span><span className="block text-xs text-slate-500">Curate a fresh agent prompt from these calls</span></span>
              </button>
              <button onClick={() => setMode('enhance')} className={`flex items-start gap-2 rounded-xl border p-3 text-left ${mode === 'enhance' ? 'border-brand bg-brand-light' : 'border-line'}`}>
                <PenLine className={`mt-0.5 h-4 w-4 ${mode === 'enhance' ? 'text-brand' : 'text-slate-400'}`} />
                <span><span className="block text-sm font-semibold text-ink">Enhance existing prompt</span><span className="block text-xs text-slate-500">Improve a prompt using these transcripts</span></span>
              </button>
            </div>

            {mode === 'enhance' && (
              <div>
                <label className="label mb-1 block">Existing agent prompt</label>
                <textarea value={existingPrompt} onChange={(e) => setExistingPrompt(e.target.value)} rows={6} className="input font-mono text-xs" placeholder="Paste the current agent system prompt here…" />
              </div>
            )}
            <div>
              <label className="label mb-1 block">Extra instructions (optional)</label>
              <input value={instructions} onChange={(e) => setInstructions(e.target.value)} className="input" placeholder="e.g. keep it under 400 words, emphasize booking the demo" />
            </div>

            {needsKey ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <div>Add <code className="font-mono">OPENAI_API_KEY</code> as a Supabase Edge Function secret (Project → Edge Functions → Secrets), then retry — no redeploy needed.</div>
              </div>
            ) : err ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div> : null}

            <button className="btn-primary" disabled={busy || (mode === 'enhance' && !existingPrompt.trim())} onClick={run}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing {callIds.length} transcripts…</> : <><Wand2 className="h-4 w-4" /> {mode === 'new' ? 'Generate prompt' : 'Enhance prompt'}</>}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-y-auto">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Analyzed {result.callsAnalyzed} call transcripts.</div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label">What changed & why</label>
              </div>
              <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface/60 p-3 text-sm text-slate-700">{result.explanation}</div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label">Generated agent prompt</label>
                <div className="flex gap-2">
                  <button className="btn-ghost !py-1" onClick={copy}>{copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}</button>
                  <button className="btn-ghost !py-1" onClick={() => saveBlob(new Blob([result.prompt], { type: 'text/plain' }), 'agent-prompt.txt')}><Download className="h-3.5 w-3.5" /> .txt</button>
                </div>
              </div>
              <textarea readOnly value={result.prompt} rows={14} className="input font-mono text-xs" />
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setResult(null)}>← Back</button>
              <button className="btn-primary flex-1" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
