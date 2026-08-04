import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import {
  PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, MultiSelect, SavedViews,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable,
} from '../components/dash';
import { num } from '../lib/format';
import { Users, PhoneCall, BadgeCheck, Search, X, Download, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const PAGE_KEY = 'opm-leads';
const PAGE_SIZE = 50;

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Lead', required: true, sortKey: 'name' },
  { key: 'property', label: 'Property / Address', sortKey: 'property' },
  { key: 'crm_stage', label: 'Stage', sortKey: 'crm_stage' },
  { key: 'pipeline', label: 'Pipeline', sortKey: 'pipeline' },
  { key: 'phoneCount', label: 'Numbers', sortKey: 'phoneCount', align: 'right' },
  { key: 'verifiedCount', label: 'Verified', sortKey: 'verifiedCount', align: 'right' },
  { key: 'deal_price', label: 'Deal Price', sortKey: 'deal_price', align: 'right' },
  { key: 'assigned_to', label: 'Assigned', sortKey: 'assigned_to' },
  { key: 'lead_source', label: 'Source', sortKey: 'lead_source' },
  { key: 'tags', label: 'Tags' },
];

type ViewCfg = { pipelineId: string; stageId: string; tags: string[]; search: string; sort: any };

export default function Leads() {
  const nav = useNavigate();
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    opm.pipelines().then((d) => setPipelines(d.pipelines || [])).catch(() => {});
    opm.summary().then(setSummary).catch(() => {});
    setLoading(true);
    opm.leads({}).then((d) => setAllRows(d.leads || [])).finally(() => setLoading(false));
  }, []);

  const pipeName = useMemo(() => Object.fromEntries(pipelines.map((p) => [p.id, p.name])), [pipelines]);
  const stages = useMemo(() => {
    if (pipelineId) return pipelines.find((p) => String(p.id) === pipelineId)?.stages || [];
    // no pipeline picked: show every stage that actually has leads
    return pipelines.flatMap((p: any) => (p.stages || [])).filter((s: any) => s.leadCount > 0);
  }, [pipelines, pipelineId]);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    allRows.forEach((r) => (r.tags || []).forEach((t: string) => s.add(t)));
    return Array.from(s).sort().map((t) => ({ value: t, label: t }));
  }, [allRows]);

  // pre-filter by pipeline/stage/tags before the client table does search+sort
  const preFiltered = useMemo(() => allRows.filter((r) => {
    if (pipelineId && String(r.pipeline_id) !== pipelineId) return false;
    if (stageId && String(r.stage_id) !== stageId) return false;
    if (tagFilter.length && !tagFilter.every((t) => (r.tags || []).includes(t))) return false;
    return true;
  }), [allRows, pipelineId, stageId, tagFilter]);

  const getValue = useCallback((r: any, key: string): string | number => {
    switch (key) {
      case 'name': return r.name || '';
      case 'property': return r.property_ref || '';
      case 'crm_stage': return r.crm_stage || '';
      case 'pipeline': return pipeName[r.pipeline_id] || '';
      case 'phoneCount': return r.phoneCount || 0;
      case 'verifiedCount': return r.verifiedCount || 0;
      case 'deal_price': return Number(r.deal_price) || 0;
      case 'assigned_to': return r.assigned_to || '';
      case 'lead_source': return r.lead_source || '';
      case 'tags': return (r.tags || []).join(' ');
      default: return '';
    }
  }, [pipeName]);

  const { rows, search, setSearch, sort, setSort, isVisible, toggle } = useClientTable<any>({
    pageKey: PAGE_KEY, columns: COLUMNS, rows: preFiltered, getValue, initialSort: { by: 'name', dir: 'asc' },
  });

  useEffect(() => { setPage(1); }, [pipelineId, stageId, tagFilter, search, sort]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allIds = rows.map((r) => r.lead_id);
  const hasFilters = !!pipelineId || !!stageId || tagFilter.length > 0 || !!search;

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.lead_id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allOnPage) pageRows.forEach((r) => n.delete(r.lead_id)); else pageRows.forEach((r) => n.add(r.lead_id)); return n; });
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const currentCfg: ViewCfg = { pipelineId, stageId, tags: tagFilter, search, sort };
  const applyView = (c: ViewCfg) => { setPipelineId(c.pipelineId || ''); setStageId(c.stageId || ''); setTagFilter(c.tags || []); setSearch(c.search || ''); setSort(c.sort || null); };

  const exportCsv = () => {
    const cols = ['#', 'Name', 'Property', 'Stage', 'Pipeline', 'Numbers', 'Verified', 'DealPrice', 'Assigned', 'Source', 'Tags', 'LeadID'];
    const src = selected.size ? rows.filter((r) => selected.has(r.lead_id)) : rows;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')];
    src.forEach((r, i) => lines.push([i + 1, r.name, r.property_ref, r.crm_stage, pipeName[r.pipeline_id] || '', r.phoneCount, r.verifiedCount, r.deal_price || '', r.assigned_to, r.lead_source, (r.tags || []).join('; '), r.lead_id].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const open = (id: string) => nav(`/leads/${encodeURIComponent(id)}`, { state: { ids: allIds } });

  return (
    <div>
      <PageHeader title="Leads" description="Pitman verified sellers — every phone is its own dialable record" showDate={false} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Leads" value={num(summary?.leads ?? allRows.length)} sub="master seller records" icon={Users} accent="blue" />
        <KpiCard label="Dialable Contacts" value={num(summary?.contacts ?? 0)} sub="one per phone number" icon={PhoneCall} accent="green" />
        <KpiCard label="Verified Numbers" value={num(summary?.verified ?? 0)} sub="confirmed working" icon={BadgeCheck} accent="amber" />
        <KpiCard label="Showing" value={num(total)} sub={hasFilters ? 'after filters' : 'all leads'} icon={Filter} />
      </div>

      <SectionCard title="Filters" description={`${total.toLocaleString()} lead${total === 1 ? '' : 's'} match`} className="mb-4"
        action={<div className="flex items-center gap-2">
          <SavedViews<ViewCfg> pageKey={PAGE_KEY} current={currentCfg} onApply={applyView} />
          <ColumnToggleMenu columns={COLUMNS} isVisible={isVisible} onToggle={toggle} />
        </div>}>
        <div className="flex flex-wrap items-center gap-3">
          <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }} className="input !py-1.5 text-sm">
            <option value="">All pipelines</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="input !py-1.5 text-sm">
            <option value="">All stages</option>
            {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.leadCount})</option>)}
          </select>
          <MultiSelect options={allTags} value={tagFilter} onChange={setTagFilter} placeholder="All tags" width={200} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, address, source, tags…" className="input w-[280px] pl-8" />
          </div>
          {hasFilters && <button className="btn-ghost !py-1.5" onClick={() => { setPipelineId(''); setStageId(''); setTagFilter([]); setSearch(''); }}><X className="h-3.5 w-3.5" /> Clear</button>}
        </div>
      </SectionCard>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/50 px-4 py-2.5">
          <span className="text-sm font-semibold text-brand">{selected.size} selected</span>
          <span className="mx-1 h-4 w-px bg-brand/20" />
          <button className="btn-ghost !py-1.5" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export selected</button>
          <button className="btn-ghost !py-1.5" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <SectionCard title="All leads" description={sort ? `Sorted by ${sort.by} (${sort.dir})` : 'Unsorted'}
        action={<div className="flex items-center gap-2 text-xs text-slate-500">
          <button className="btn-ghost !py-1.5" disabled={total === 0} onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</button>
          <button className="btn-ghost !p-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular-nums">Page {page} / {pageCount}</span>
          <button className="btn-ghost !p-1.5" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>}>
        {loading ? <LoadingBlock label="Loading leads…" /> : total === 0 ? <EmptyState text="No leads match these filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#1f6feb]" /></th>
                  <th className="px-2 py-2.5 text-right w-10">#</th>
                  {COLUMNS.filter((c) => isVisible(c.key)).map((c) => <SortableHead key={c.key} col={c} sort={sort} onSort={setSort}>{c.label}</SortableHead>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={r.lead_id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => open(r.lead_id)}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.lead_id)} onChange={() => toggleSel(r.lead_id)} className="h-3.5 w-3.5 accent-[#1f6feb]" /></td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs text-slate-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    {isVisible('name') && <td className="px-3 py-2.5"><div className="font-semibold text-ink">{r.name}</div></td>}
                    {isVisible('property') && <td className="max-w-[240px] truncate px-3 py-2.5 text-xs text-slate-600">{r.property_ref || '—'}</td>}
                    {isVisible('crm_stage') && <td className="whitespace-nowrap px-3 py-2.5"><span className="pill bg-brand/10 text-brand">{r.crm_stage || '—'}</span></td>}
                    {isVisible('pipeline') && <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{pipeName[r.pipeline_id] || '—'}</td>}
                    {isVisible('phoneCount') && <td className="px-3 py-2.5 text-right font-mono">{r.phoneCount}</td>}
                    {isVisible('verifiedCount') && <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{r.verifiedCount}</td>}
                    {isVisible('deal_price') && <td className="px-3 py-2.5 text-right">{r.deal_price ? `$${num(r.deal_price)}` : '—'}</td>}
                    {isVisible('assigned_to') && <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.assigned_to || '—'}</td>}
                    {isVisible('lead_source') && <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-slate-500">{r.lead_source || '—'}</td>}
                    {isVisible('tags') && <td className="max-w-[220px] px-3 py-2.5"><div className="flex flex-wrap gap-1">{(r.tags || []).slice(0, 4).map((t: string) => <span key={t} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-slate-500">{t}</span>)}{(r.tags || []).length > 4 && <span className="text-[10px] text-slate-400">+{r.tags.length - 4}</span>}</div></td>}
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
