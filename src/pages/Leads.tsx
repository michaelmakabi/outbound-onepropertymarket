import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { Users, PhoneCall, BadgeCheck, Search, ChevronRight, Filter } from 'lucide-react';

type Lead = {
  lead_id: string; name: string; crm_stage: string | null; pipeline_id: number | null; stage_id: number | null;
  lead_source: string | null; assigned_to: string | null; deal_price: number | null; property_ref: string | null;
  tags: string[]; phoneCount: number; verifiedCount: number;
};
type Pipeline = { id: number; name: string; stages: { id: number; name: string; color: string; leadCount: number }[] };

export default function Leads() {
  const nav = useNavigate();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [pipelineId, setPipelineId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    opm.pipelines().then((d) => setPipelines(d.pipelines || [])).catch(() => {});
    opm.summary().then(setSummary).catch(() => {});
  }, []);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      opm.leads({ pipeline_id: pipelineId || undefined, stage_id: stageId || undefined, search: search || undefined })
        .then((d) => setRows(d.leads || [])).finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [pipelineId, stageId, search]);

  const stages = useMemo(() => pipelines.find((p) => String(p.id) === pipelineId)?.stages || [], [pipelines, pipelineId]);

  return (
    <div>
      <PageHeader title="Leads" description="Pitman verified sellers — every phone is its own dialable record" showDate={false} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Leads" value={num(summary?.leads ?? 0)} sub="master seller records" icon={Users} accent="blue" />
        <KpiCard label="Dialable Contacts" value={num(summary?.contacts ?? 0)} sub="one per phone number" icon={PhoneCall} accent="green" />
        <KpiCard label="Verified Numbers" value={num(summary?.verified ?? 0)} sub="confirmed working" icon={BadgeCheck} accent="amber" />
        <KpiCard label="Pipelines" value={num(pipelines.length)} sub="acquisition & more" icon={Filter} />
      </div>

      <SectionCard title="All leads" description="Click a lead to open the full contact record"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }} className="input !py-1.5 text-sm">
              <option value="">All pipelines</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="input !py-1.5 text-sm" disabled={!pipelineId}>
              <option value="">All stages</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.leadCount})</option>)}
            </select>
          </div>
        }>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name…" className="input w-[280px] pl-8" />
        </div>
        {loading ? <LoadingBlock /> : rows.length === 0 ? <EmptyState text="No leads match these filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2 text-right">Numbers</th>
                  <th className="px-3 py-2 text-right">Verified</th>
                  <th className="px-3 py-2 text-right">Deal Price</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lead_id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/leads/${encodeURIComponent(r.lead_id)}`, { state: { ids: rows.map((x) => x.lead_id) } })}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-ink">{r.name}</div>
                      {r.property_ref && <div className="text-xs text-slate-500">{r.property_ref}</div>}
                    </td>
                    <td className="px-3 py-2.5"><span className="pill bg-brand/10 text-brand">{r.crm_stage || '—'}</span></td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.phoneCount}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{r.verifiedCount}</td>
                    <td className="px-3 py-2.5 text-right">{r.deal_price ? `$${num(r.deal_price)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.assigned_to || '—'}</td>
                    <td className="px-3 py-2.5 text-right"><ChevronRight className="h-4 w-4 text-slate-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
