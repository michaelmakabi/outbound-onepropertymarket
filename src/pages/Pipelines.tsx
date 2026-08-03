import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { PageHeader, LoadingBlock, EmptyState } from '../components/dash';
import { Plus, Trash2, GripVertical } from 'lucide-react';

type Stage = { id: number; name: string; color: string; sort_order: number; leadCount: number };
type Pipeline = { id: number; name: string; stages: Stage[] };

export default function Pipelines() {
  const nav = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | null>(null);

  const load = () => opm.pipelines().then((d) => {
    setPipelines(d.pipelines || []);
    setActive((a) => a ?? (d.pipelines?.[0]?.id ?? null));
  }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const current = pipelines.find((p) => p.id === active);

  async function addPipeline() {
    const name = prompt('New pipeline name'); if (!name) return;
    await opm.savePipeline({ name, sort_order: pipelines.length }); load();
  }
  async function delPipeline(id: number) {
    if (!confirm('Archive this pipeline?')) return;
    await opm.deletePipeline(id); setActive(null); load();
  }
  async function addStage() {
    if (!current) return;
    const name = prompt('New stage name'); if (!name) return;
    await opm.saveStage({ pipeline_id: current.id, name, sort_order: current.stages.length }); load();
  }
  async function renameStage(s: Stage) {
    const name = prompt('Rename stage', s.name); if (!name || name === s.name) return;
    await opm.saveStage({ id: s.id, name, color: s.color, sort_order: s.sort_order }); load();
  }
  async function delStage(s: Stage) {
    if (!confirm(`Delete stage "${s.name}"? Leads in it keep their data but lose the stage.`)) return;
    await opm.deleteStage(s.id); load();
  }

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Pipelines" description="Create and manage pipelines & stages — mirrors your GHL Pitman seller opportunities" showDate={false}
        actions={<button onClick={addPipeline} className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New pipeline</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pipelines.map((p) => (
          <button key={p.id} onClick={() => setActive(p.id)}
            className={`group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${active === p.id ? 'bg-brand text-white' : 'bg-surface text-slate-600 hover:bg-line'}`}>
            {p.name} <span className={`rounded-full px-1.5 text-xs ${active === p.id ? 'bg-white/20' : 'bg-white'}`}>{p.stages.reduce((s, x) => s + x.leadCount, 0)}</span>
            {active === p.id && <Trash2 className="h-3.5 w-3.5 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); delPipeline(p.id); }} />}
          </button>
        ))}
      </div>

      {!current ? <EmptyState text="No pipeline selected." /> : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {current.stages.map((s) => (
            <div key={s.id} className="w-64 flex-none rounded-xl border border-line bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2" style={{ borderTopColor: s.color, borderTopWidth: 3 }}>
                <div className="flex items-center gap-1.5"><GripVertical className="h-3.5 w-3.5 text-slate-300" />
                  <button onClick={() => renameStage(s)} className="text-sm font-bold text-ink">{s.name}</button></div>
                <div className="flex items-center gap-1"><span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{s.leadCount}</span>
                  <Trash2 className="h-3.5 w-3.5 cursor-pointer text-slate-300 hover:text-red-500" onClick={() => delStage(s)} /></div>
              </div>
              <StageLeads pipelineId={current.id} stageId={s.id} onOpen={(id) => nav(`/leads/${encodeURIComponent(id)}`)} />
            </div>
          ))}
          <button onClick={addStage} className="h-10 w-64 flex-none rounded-xl border border-dashed border-line text-sm font-semibold text-slate-500 hover:border-brand hover:text-brand"><Plus className="mr-1 inline h-4 w-4" /> Add stage</button>
        </div>
      )}
    </div>
  );
}

function StageLeads({ pipelineId, stageId, onOpen }: { pipelineId: number; stageId: number; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { opm.leads({ pipeline_id: pipelineId, stage_id: stageId }).then((d) => setRows(d.leads || [])).finally(() => setLoaded(true)); }, [pipelineId, stageId]);
  if (!loaded) return <div className="p-3 text-xs text-slate-400">Loading…</div>;
  if (rows.length === 0) return <div className="p-3 text-xs text-slate-400">No leads</div>;
  return (
    <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-2">
      {rows.slice(0, 50).map((r) => (
        <button key={r.lead_id} onClick={() => onOpen(r.lead_id)} className="rounded-lg border border-line bg-white p-2 text-left hover:border-brand/40">
          <div className="text-sm font-semibold text-ink">{r.name}</div>
          {r.property_ref && <div className="truncate text-xs text-slate-500">{r.property_ref}</div>}
          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{r.phoneCount} #</span><span className="text-emerald-600">{r.verifiedCount} ✓</span>{r.deal_price ? <span>${Number(r.deal_price).toLocaleString()}</span> : null}</div>
        </button>
      ))}
      {rows.length > 50 && <div className="p-1 text-center text-[10px] text-slate-400">+{rows.length - 50} more</div>}
    </div>
  );
}
