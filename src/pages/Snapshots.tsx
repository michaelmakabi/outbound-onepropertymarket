import { useEffect, useState } from 'react';
import { opm } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { AgentClonePanel } from './AgentClone';
import { Copy, Columns3, Bot, ArrowRight, Check, AlertCircle, Loader2, RefreshCw, ListChecks, Tags } from 'lucide-react';

type Ws = { slug: string; display_name: string };
type Stage = { id: number; name: string; color: string; icon?: string | null };
type Pipeline = { id: number; name: string; sort_order: number; stages?: Stage[] };
type CField = { id: number; entity: string; field_key: string; label: string; field_type: string };

const PINNED = 'Standard 1PM Pipeline';

function ClonePipelinesPanel() {
  const [wss, setWss] = useState<Ws[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loadingPipes, setLoadingPipes] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fields, setFields] = useState<CField[]>([]);
  const [includeFields, setIncludeFields] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    opm.workspaces().then((d) => setWss(d.workspaces || [])).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const loadSource = (slug: string) => {
    setPipelines([]); setSelected(new Set()); setFields([]); setIncludeFields(false); setResult(null);
    if (!slug) return;
    setLoadingPipes(true); setErr('');
    Promise.all([opm.pipelinesFor(slug), opm.customFieldsFor(slug).catch(() => ({ fields: [] }))])
      .then(([p, f]) => {
        setPipelines(p.pipelines || []);
        setFields((f.fields || []) as CField[]);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoadingPipes(false));
  };

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clonable = pipelines.filter((p) => p.name !== PINNED);
  const allSelected = clonable.length > 0 && clonable.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(clonable.map((p) => p.id))));

  const canClone = source && target && source !== target && selected.size > 0 && !busy;

  const clone = async () => {
    setErr(''); setResult(null); setBusy(true);
    try {
      const r = await opm.clonePipelines({
        source_workspace: source,
        target_workspace: target,
        pipeline_ids: [...selected],
        include_custom_fields: includeFields,
      });
      setResult(r);
      setConfirmOpen(false);
    } catch (e: any) { setErr(e.message); setConfirmOpen(false); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      {wss.length < 2 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> You need at least two workspaces to copy pipelines between them.
        </div>
      )}

      <div className="card p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label mb-1 block">Copy from (source)</label>
            <select className="input w-full" value={source} onChange={(e) => { setSource(e.target.value); loadSource(e.target.value); }}>
              <option value="">Select a workspace…</option>
              {wss.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Copy into (target)</label>
            <select className="input w-full" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Select a workspace…</option>
              {wss.filter((w) => w.slug !== source).map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <label className="label flex items-center gap-2">Pipelines to copy {loadingPipes && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              {source && !loadingPipes && <button className="text-xs text-brand hover:underline" onClick={() => loadSource(source)}><RefreshCw className="mr-0.5 inline h-3 w-3" />refresh</button>}
            </label>
            {clonable.length > 0 && <button onClick={toggleAll} className="text-xs font-semibold text-brand hover:underline"><ListChecks className="mr-0.5 inline h-3.5 w-3.5" />{allSelected ? 'Clear' : 'Select all'}</button>}
          </div>

          {!source && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-slate-400">Pick a source workspace to see its pipelines.</div>}
          {source && !loadingPipes && pipelines.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-slate-400">No pipelines in this workspace.</div>}

          <div className="flex flex-col gap-2">
            {pipelines.map((p) => {
              const pinned = p.name === PINNED;
              const on = selected.has(p.id);
              return (
                <label key={p.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${pinned ? 'cursor-not-allowed border-line bg-surface opacity-70' : on ? 'cursor-pointer border-brand bg-brand/5' : 'cursor-pointer border-line hover:border-slate-300'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-brand" disabled={pinned} checked={on} onChange={() => toggle(p.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Columns3 className="h-4 w-4 shrink-0 text-slate-400" /> {p.name}
                      {pinned && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">pinned · already present</span>}
                    </div>
                    <div className="mt-0.5 pl-6 text-xs text-slate-400">{(p.stages || []).length} stage{(p.stages || []).length === 1 ? '' : 's'}{(p.stages || []).length ? ' · ' + (p.stages || []).slice(0, 6).map((s) => s.name).join(', ') : ''}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {fields.length > 0 && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 hover:border-slate-300">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={includeFields} onChange={(e) => setIncludeFields(e.target.checked)} />
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Tags className="h-4 w-4 text-slate-400" /> Also copy custom fields ({fields.length})</div>
              <div className="mt-0.5 text-xs text-slate-400">{fields.slice(0, 8).map((f) => f.label).join(', ')}{fields.length > 8 ? '…' : ''} — only fields missing in the target are added.</div>
            </div>
          </label>
        )}

        {err && <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" /> {err}</div>}

        <button className="btn-primary mt-5 w-full justify-center" disabled={!canClone} onClick={() => { setResult(null); setConfirmOpen(true); }}>
          <Copy className="h-4 w-4" /> Copy {selected.size || ''} pipeline{selected.size === 1 ? '' : 's'} <ArrowRight className="h-4 w-4" /> {wss.find((w) => w.slug === target)?.display_name || 'target'}
        </button>
      </div>

      {result && (
        <div className="mt-4 card border-emerald-200 p-5">
          <div className="flex items-center gap-2 font-bold text-emerald-700"><Check className="h-5 w-5" /> Copied {result.cloned} pipeline{result.cloned === 1 ? '' : 's'} into {wss.find((w) => w.slug === result.target)?.display_name || result.target}</div>
          <div className="mt-3 space-y-1 text-sm">
            {(result.results || []).map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                {r.status === 'cloned' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-slate-400" />}
                <span className="font-medium text-ink">{r.name}</span>
                {r.status === 'cloned' ? <span className="text-xs text-slate-500">· {r.stages} stage{r.stages === 1 ? '' : 's'}</span> : <span className="text-xs text-slate-400">· skipped ({r.reason})</span>}
              </div>
            ))}
          </div>
          {result.custom_fields_copied > 0 && <div className="mt-2 text-xs text-slate-500">+ {result.custom_fields_copied} custom field{result.custom_fields_copied === 1 ? '' : 's'} copied.</div>}
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2"><Copy className="h-5 w-5 text-brand" /><h3 className="text-base font-bold text-ink">Copy these pipelines?</h3></div>
            <div className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex justify-between py-0.5"><span className="text-slate-500">From</span><span className="font-semibold text-ink">{wss.find((w) => w.slug === source)?.display_name || source}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Into</span><span className="font-semibold text-ink">{wss.find((w) => w.slug === target)?.display_name || target}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Pipelines</span><span className="font-semibold text-ink">{selected.size}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Custom fields</span><span className="font-semibold text-ink">{includeFields ? fields.length : 0}</span></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Pipelines whose name already exists in the target are skipped. The pinned "{PINNED}" is never copied.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={clone}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Copying…</> : <><Copy className="h-4 w-4" /> Copy now</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Snapshots() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'agent' | 'pipelines'>('agent');

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Snapshots are restricted to super admins.</div>;

  return (
    <div>
      <PageHead title="Snapshots" subtitle="Copy assets from one workspace into another — clone a proven agent or copy pipelines & custom fields." />

      <div className="mb-5 inline-flex rounded-xl border border-line bg-white p-1">
        <button onClick={() => setTab('agent')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === 'agent' ? 'bg-brand text-white' : 'text-slate-500 hover:text-ink'}`}>
          <Bot className="h-4 w-4" /> Clone Agent
        </button>
        <button onClick={() => setTab('pipelines')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === 'pipelines' ? 'bg-brand text-white' : 'text-slate-500 hover:text-ink'}`}>
          <Columns3 className="h-4 w-4" /> Clone Pipelines
        </button>
      </div>

      {tab === 'agent' ? <AgentClonePanel embedded /> : <ClonePipelinesPanel />}
    </div>
  );
}
