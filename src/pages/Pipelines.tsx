import { useEffect, useMemo, useState } from 'react';
import { StageIcon } from '../lib/statusIcons';
import type { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { PageHeader, LoadingBlock, EmptyState, KpiCard, SectionCard } from '../components/dash';
import { num, usd } from '../lib/format';
import { useWorkspace } from '../lib/workspace';
import {
  Plus, Trash2, GripVertical, LayoutGrid, Table as TableIcon, Columns3,
  Search, Calendar, Phone, MapPin, Layers, TrendingUp, Target, Activity, Pencil, X, DollarSign,
} from 'lucide-react';

type Stage = { id: number; name: string; color: string; sort_order: number; leadCount: number; valueSum?: number; icon?: string | null };
type Pipeline = { id: number; name: string; workspace?: string; sort_order?: number; stages: Stage[] };
type Lead = {
  lead_id: string; name: string; stage_id: number | null; pipeline_id: number;
  deal_price?: number | null; lead_source?: string | null; assigned_to?: string | null;
  property_ref?: string | null; tags?: string[]; created_at?: string | null; updated_at?: string | null;
  date_added?: string | null; attempts?: number; last_disposition?: string | null;
  phone?: string | null; phone_count?: number;
};

type ViewMode = 'board' | 'table' | 'grid';
type SortKey = 'name' | 'deal_price' | 'attempts' | 'created' | 'updated';
type RangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';
type DateBasis = 'added' | 'updated';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

/** Parse a date that may be 'YYYY-MM-DD' or ISO. Returns ms or null. */
function parseDate(v?: string | null): number | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Bare YYYY-MM-DD → treat as local midnight
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    return isNaN(t) ? null : t;
  }
  const t = new Date(s).getTime();
  return isNaN(t) ? null : t;
}

function addedMs(l: Lead): number | null {
  return parseDate(l.date_added) ?? parseDate(l.created_at);
}
function updatedMs(l: Lead): number | null {
  return parseDate(l.updated_at);
}

const PRESET_LABEL: Record<RangePreset, string> = {
  all: 'All time', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', custom: 'Custom',
};

export default function Pipelines() {
  const nav = useNavigate();
  const { active: activeWorkspace } = useWorkspace();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);

  // toolbar state
  const [view, setView] = useState<ViewMode>('board');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [basis, setBasis] = useState<DateBasis>('added');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [dateMenu, setDateMenu] = useState(false);

  // drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const loadPipelines = () =>
    opm.pipelines().then((d: any) => {
      const list: Pipeline[] = d.pipelines || [];
      setPipelines(list);
      setActive((a) => (a != null && list.some((p) => p.id === a) ? a : (list[0]?.id ?? null)));
    }).finally(() => setLoading(false));

  // Reload pipelines when the workspace changes.
  useEffect(() => { setLoading(true); loadPipelines(); /* eslint-disable-next-line */ }, [activeWorkspace]);

  const current = pipelines.find((p) => p.id === active) || null;

  // Load leads whenever the selected pipeline changes.
  useEffect(() => {
    if (active == null) { setLeads([]); return; }
    let cancelled = false;
    setLeadsLoading(true);
    opm.pipelineLeads(active)
      .then((d: any) => { if (!cancelled) setLeads(d.leads || []); })
      .catch(() => { if (!cancelled) setLeads([]); })
      .finally(() => { if (!cancelled) setLeadsLoading(false); });
    return () => { cancelled = true; };
  }, [active]);

  // ---- CRUD (unchanged behaviour) ----
  async function addPipeline() {
    const name = prompt('New pipeline name'); if (!name) return;
    await opm.savePipeline({ name, sort_order: pipelines.length }); loadPipelines();
  }
  async function delPipeline(id: number) {
    if (!confirm('Archive this pipeline?')) return;
    await opm.deletePipeline(id); setActive(null); loadPipelines();
  }
  async function addStage() {
    if (!current) return;
    const name = prompt('New stage name'); if (!name) return;
    await opm.saveStage({ pipeline_id: current.id, name, sort_order: current.stages.length }); loadPipelines();
  }
  async function renameStage(s: Stage) {
    const name = prompt('Rename stage', s.name); if (!name || name === s.name) return;
    await opm.saveStage({ id: s.id, name, color: s.color, sort_order: s.sort_order }); loadPipelines();
  }
  async function delStage(s: Stage) {
    if (!confirm(`Delete stage "${s.name}"? Leads in it keep their data but lose the stage.`)) return;
    await opm.deleteStage(s.id); loadPipelines();
  }

  // ---- date range window ----
  const range = useMemo<{ start: number | null; end: number | null } | null>(() => {
    if (preset === 'all') return null;
    if (preset === 'custom') {
      const start = customStart ? parseDate(customStart) : null;
      // Include the whole end day.
      const end = customEnd ? (parseDate(customEnd)! + 24 * 60 * 60 * 1000 - 1) : null;
      if (start == null && end == null) return null;
      return { start, end };
    }
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    return { start: Date.now() - days * 24 * 60 * 60 * 1000, end: null };
  }, [preset, customStart, customEnd]);

  const stageById = useMemo(() => {
    const m = new Map<number, Stage>();
    (current?.stages || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [current]);

  // ---- filtered leads (search + date range) ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (q) {
        const hay = [l.name, l.property_ref, l.phone, l.lead_source, l.assigned_to]
          .map((x) => String(x ?? '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (range) {
        const ms = basis === 'added' ? addedMs(l) : updatedMs(l);
        if (ms == null) return false; // missing dates excluded when a range is active
        if (range.start != null && ms < range.start) return false;
        if (range.end != null && ms > range.end) return false;
      }
      return true;
    });
  }, [leads, search, range, basis]);

  // ---- sorted (table/grid) ----
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = String(a.name ?? '').localeCompare(String(b.name ?? '')); break;
        case 'deal_price': cmp = (a.deal_price || 0) - (b.deal_price || 0); break;
        case 'attempts': cmp = (a.attempts || 0) - (b.attempts || 0); break;
        case 'created': cmp = (addedMs(a) || 0) - (addedMs(b) || 0); break;
        case 'updated': cmp = (updatedMs(a) || 0) - (updatedMs(b) || 0); break;
      }
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const filteredIds = useMemo(() => {
    // Board order = stage order, then leads within stage; other views use sorted order.
    if (view === 'board' && current) {
      const order: string[] = [];
      current.stages.forEach((s) => filtered.filter((l) => l.stage_id === s.id).forEach((l) => order.push(l.lead_id)));
      return order;
    }
    return sorted.map((l) => l.lead_id);
  }, [view, current, filtered, sorted]);

  const openRecord = (id: string) => nav(`/leads/${encodeURIComponent(id)}`, { state: { ids: filteredIds } });

  // ---- drag & drop ----
  async function moveTo(stageId: number, leadId: string) {
    if (!current) return;
    const lead = leads.find((l) => l.lead_id === leadId);
    if (!lead || lead.stage_id === stageId) return;
    // optimistic
    setLeads((prev) => prev.map((l) => (l.lead_id === leadId ? { ...l, stage_id: stageId } : l)));
    try {
      await opm.moveLead({ lead_id: leadId, pipeline_id: current.id, stage_id: stageId });
      loadPipelines();
    } catch {
      // reload on failure to resync
      if (active != null) {
        setLeadsLoading(true);
        opm.pipelineLeads(active).then((d: any) => setLeads(d.leads || [])).finally(() => setLeadsLoading(false));
      }
      loadPipelines();
    }
  }

  // ---- KPIs ----
  const kpis = useMemo(() => {
    const total = filtered.length;
    const value = filtered.reduce((a, l) => a + (l.deal_price || 0), 0);
    const attemptsSum = filtered.reduce((a, l) => a + (l.attempts || 0), 0);
    const avgAttempts = total ? attemptsSum / total : 0;
    // "won/positive" stage detection
    const posStage = (current?.stages || []).find((s) =>
      /won|closed|sold|deal|positive|complete/i.test(s.name));
    let posCount: number; let posLabel: string;
    if (posStage) {
      posCount = filtered.filter((l) => l.stage_id === posStage.id).length;
      posLabel = posStage.name;
    } else {
      posCount = filtered.filter((l) => (l.attempts || 0) > 0 || l.last_disposition).length;
      posLabel = 'Contacted';
    }
    const withDeal = filtered.filter((l) => (l.deal_price || 0) > 0).length;
    const avgDeal = withDeal ? value / withDeal : 0;
    const reachable = filtered.filter((l) => l.phone && String(l.phone).trim() !== '' && String(l.phone) !== '—').length;
    return { total, value, avgAttempts, posCount, posLabel, avgDeal, reachable };
  }, [filtered, current]);

  const activeDateCount = range ? filtered.length : filtered.length;

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Pipelines" description="Multi-view pipeline workspace — board, table & grid" showDate={false}
        actions={<button onClick={addPipeline} className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New pipeline</button>} />

      {/* pipeline pills */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pipelines.map((p) => (
          <button key={p.id} onClick={() => setActive(p.id)}
            className={cx('group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold',
              active === p.id ? 'bg-brand text-white' : 'bg-surface text-slate-600 hover:bg-line')}>
            {p.name}
            <span className={cx('rounded-full px-1.5 text-xs', active === p.id ? 'bg-white/20' : 'bg-white')}>{p.stages.reduce((s, x) => s + x.leadCount, 0)}</span>
            {active === p.id && <Trash2 className="h-3.5 w-3.5 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); delPipeline(p.id); }} />}
          </button>
        ))}
        {pipelines.length === 0 && <span className="text-sm text-slate-400">No pipelines yet.</span>}
      </div>

      {!current ? <EmptyState text="No pipeline selected." /> : (
        <>
          {/* KPI row */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Leads" value={num(kpis.total)} sub={range ? `in ${PRESET_LABEL[preset].toLowerCase()}` : 'in pipeline'} icon={Layers} accent="blue" />
            <KpiCard label="Pipeline value" value={usd(kpis.value)} sub="sum of deal price" icon={TrendingUp} accent="green" />
            <KpiCard label="Avg deal" value={kpis.avgDeal ? usd(kpis.avgDeal) : '—'} sub="per priced lead" icon={DollarSign} accent="green" />
            <KpiCard label={kpis.posLabel} value={num(kpis.posCount)} sub="leads" icon={Target} accent="amber" />
            <KpiCard label="Reachable" value={num(kpis.reachable)} sub="have a phone" icon={Phone} accent="blue" />
            <KpiCard label="Avg attempts" value={kpis.avgAttempts.toFixed(1)} sub="per lead" icon={Activity} accent="default" />
          </div>

          {/* toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* view toggle */}
            <div className="inline-flex items-center rounded-lg border border-line bg-white p-1">
              {([['board', 'Board', Columns3], ['table', 'Table', TableIcon], ['grid', 'Grid', LayoutGrid]] as [ViewMode, string, any][]).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setView(m)}
                  className={cx('inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition',
                    view === m ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface')}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {/* search */}
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, property, phone, source…"
                className="w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
            </div>

            {/* sort (table/grid) */}
            {view !== 'board' && (
              <div className="inline-flex items-center gap-1.5">
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-brand">
                  <option value="name">Name</option>
                  <option value="deal_price">Deal price</option>
                  <option value="attempts">Attempts</option>
                  <option value="created">Added date</option>
                  <option value="updated">Updated date</option>
                </select>
                <button onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))} title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
                  className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:border-brand">
                  {sortDir === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            )}

            {/* date range */}
            <div className="relative">
              <button onClick={() => setDateMenu((o) => !o)}
                className={cx('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold',
                  range ? 'border-brand text-brand' : 'border-line bg-white text-slate-600 hover:border-brand')}>
                <Calendar className="h-4 w-4" /> {PRESET_LABEL[preset]}
                <span className="text-[10px] font-normal text-slate-400">· {basis === 'added' ? 'Added' : 'Updated'}</span>
              </button>
              {dateMenu && (
                <div className="absolute z-30 mt-1 w-64 rounded-lg border border-line bg-white p-2 shadow-lg">
                  {/* basis toggle */}
                  <div className="mb-2 inline-flex w-full items-center rounded-md border border-line p-0.5 text-xs">
                    {(['added', 'updated'] as DateBasis[]).map((b) => (
                      <button key={b} onClick={() => setBasis(b)}
                        className={cx('flex-1 rounded px-2 py-1 font-semibold capitalize', basis === b ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface')}>{b}</button>
                    ))}
                  </div>
                  {(['all', '7d', '30d', '90d', 'custom'] as RangePreset[]).map((p) => (
                    <button key={p} onClick={() => { setPreset(p); if (p !== 'custom') setDateMenu(false); }}
                      className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface', preset === p && 'font-semibold text-brand')}>
                      {PRESET_LABEL[p]}
                    </button>
                  ))}
                  {preset === 'custom' && (
                    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
                      <label className="flex items-center justify-between gap-2 text-xs text-slate-500">Start
                        <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded border border-line px-2 py-1 text-sm" /></label>
                      <label className="flex items-center justify-between gap-2 text-xs text-slate-500">End
                        <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded border border-line px-2 py-1 text-sm" /></label>
                    </div>
                  )}
                  {range && (
                    <button onClick={() => { setPreset('all'); setCustomStart(''); setCustomEnd(''); }}
                      className="mt-2 flex w-full items-center gap-1.5 border-t border-line px-2 py-1.5 text-xs text-slate-500 hover:text-ink">
                      <X className="h-3.5 w-3.5" /> Clear range
                    </button>
                  )}
                </div>
              )}
            </div>

            <span className="ml-auto text-sm text-slate-500">
              {leadsLoading ? 'Loading leads…' : <><span className="font-bold text-ink">{num(activeDateCount)}</span> of {num(leads.length)} leads</>}
            </span>
          </div>

          {/* views */}
          {view === 'board' && (
            <BoardView
              current={current} filtered={filtered} dragId={dragId} dragOver={dragOver}
              setDragId={setDragId} setDragOver={setDragOver} moveTo={moveTo}
              openRecord={openRecord} onAddStage={addStage} onRenameStage={renameStage} onDelStage={delStage}
            />
          )}
          {view === 'table' && (
            <TableView rows={sorted} stageById={stageById} stages={current.stages} openRecord={openRecord}
              sortKey={sortKey} sortDir={sortDir} onSort={(k) => { if (k === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc')); else { setSortKey(k); setSortDir('desc'); } }}
              onMove={moveTo} leadsLoading={leadsLoading} />
          )}
          {view === 'grid' && (
            <GridView rows={sorted} stageById={stageById} openRecord={openRecord} leadsLoading={leadsLoading} />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ shared bits */

function StagePill({ stage }: { stage?: Stage }) {
  if (!stage) return <span className="pill bg-surface text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: `${stage.color}1a`, color: stage.color }}>
      <StageIcon name={stage.icon} color={stage.color} className="h-3.5 w-3.5" /> {stage.name}
    </span>
  );
}

function AttemptsBadge({ n }: { n?: number }) {
  if (!n || n <= 0) return null;
  return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{n}x attempts</span>;
}

function Tags({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.slice(0, 4).map((t, i) => <span key={i} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-slate-500">{t}</span>)}
    </div>
  );
}

function fmtDate(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';
}

/* ------------------------------------------------------------------ board */

function BoardView({
  current, filtered, dragId, dragOver, setDragId, setDragOver, moveTo, openRecord,
  onAddStage, onRenameStage, onDelStage,
}: {
  current: Pipeline; filtered: Lead[];
  dragId: string | null; dragOver: number | null;
  setDragId: Dispatch<SetStateAction<string | null>>; setDragOver: Dispatch<SetStateAction<number | null>>;
  moveTo: (stageId: number, leadId: string) => void; openRecord: (id: string) => void;
  onAddStage: () => void; onRenameStage: (s: Stage) => void; onDelStage: (s: Stage) => void;
}) {
  const stages = [...current.stages].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((s) => {
        const cards = filtered.filter((l) => l.stage_id === s.id);
        const value = cards.reduce((a, l) => a + (l.deal_price || 0), 0);
        return (
          <div key={s.id}
            onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
            onDragLeave={() => setDragOver((cur) => (cur === s.id ? null : cur))}
            onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(s.id, dragId); setDragId(null); setDragOver(null); }}
            className={cx('w-64 flex-none rounded-xl border bg-surface', dragOver === s.id ? 'border-brand ring-2 ring-brand/20' : 'border-line')}>
            <div className="border-b border-line px-3 py-2" style={{ borderTopColor: s.color, borderTopWidth: 3 }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <StageIcon name={s.icon} color={s.color} className="h-4 w-4 shrink-0" />
                  <button onClick={() => onRenameStage(s)} className="truncate text-sm font-bold text-ink hover:text-brand" title={s.name}>{s.name}</button>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{cards.length}</span>
                  <Pencil className="h-3.5 w-3.5 cursor-pointer text-slate-300 hover:text-brand" onClick={() => onRenameStage(s)} />
                  <Trash2 className="h-3.5 w-3.5 cursor-pointer text-slate-300 hover:text-red-500" onClick={() => onDelStage(s)} />
                </div>
              </div>
              <div className="mt-1 text-xs font-bold text-emerald-600">{value > 0 ? usd(value) : <span className="font-normal text-slate-300">$0</span>}</div>
            </div>
            <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto p-2">
              {cards.length === 0 && <div className="p-3 text-center text-xs text-slate-400">No leads</div>}
              {cards.map((l) => (
                <div key={l.lead_id} draggable
                  onDragStart={(e) => { setDragId(l.lead_id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragId(null); setDragOver(null); }}
                  onClick={() => openRecord(l.lead_id)}
                  className={cx('cursor-pointer rounded-lg border border-line bg-white p-2 text-left transition hover:border-brand/40', dragId === l.lead_id && 'opacity-40')}>
                  <div className="flex items-start gap-1">
                    <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">{l.name}</div>
                      {l.property_ref && <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" />{l.property_ref}</div>}
                      {l.phone && <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3 shrink-0" />{l.phone}</div>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {l.deal_price ? <span className="text-xs font-bold text-emerald-600">{usd(l.deal_price)}</span> : null}
                        <AttemptsBadge n={l.attempts} />
                      </div>
                      <Tags tags={l.tags} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <button onClick={onAddStage} className="h-10 w-72 flex-none rounded-xl border border-dashed border-line text-sm font-semibold text-slate-500 hover:border-brand hover:text-brand">
        <Plus className="mr-1 inline h-4 w-4" /> Add stage
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ table */

function TableView({
  rows, stageById, stages, openRecord, sortKey, sortDir, onSort, onMove, leadsLoading,
}: {
  rows: Lead[]; stageById: Map<number, Stage>; stages: Stage[];
  openRecord: (id: string) => void; sortKey: SortKey; sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void; onMove: (stageId: number, leadId: string) => void; leadsLoading: boolean;
}) {
  const head = (label: string, key?: SortKey, align?: 'right', cls?: string) => (
    <th className={cx('px-3 py-2.5 font-semibold whitespace-nowrap', align === 'right' && 'text-right', cls)}>
      {key ? (
        <button onClick={() => onSort(key)} className={cx('inline-flex items-center gap-1 hover:text-ink', sortKey === key ? 'text-ink' : 'text-slate-500')}>
          {label}{sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
        </button>
      ) : label}
    </th>
  );
  if (leadsLoading) return <LoadingBlock label="Loading leads…" />;
  if (rows.length === 0) return <EmptyState text="No leads match the current filters." />;
  return (
    <SectionCard title="Leads" description={`${num(rows.length)} shown`} className="overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {head('Name', 'name')}
              {head('Stage')}
              {head('Phone', undefined, undefined, 'hidden sm:table-cell')}
              {head('Property', undefined, undefined, 'hidden md:table-cell')}
              {head('Deal Price', 'deal_price', 'right')}
              {head('Attempts', 'attempts', 'right', 'hidden lg:table-cell')}
              {head('Source', undefined, undefined, 'hidden xl:table-cell')}
              {head('Assigned', undefined, undefined, 'hidden xl:table-cell')}
              {head('Added', 'created', undefined, 'hidden lg:table-cell')}
              {head('Updated', 'updated', undefined, 'hidden md:table-cell')}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.lead_id} onClick={() => openRecord(l.lead_id)} className="cursor-pointer border-b border-line/60 hover:bg-surface">
                <td className="px-3 py-2 font-semibold text-ink">{l.name}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <select value={l.stage_id ?? ''} onChange={(e) => onMove(Number(e.target.value), l.lead_id)}
                    className="w-full min-w-[150px] max-w-[210px] rounded-md border border-line bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-brand">
                    {l.stage_id == null && <option value="">—</option>}
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">{l.phone || '—'}</td>
                <td className="hidden max-w-[200px] truncate px-3 py-2 text-slate-600 md:table-cell" title={l.property_ref || ''}>{l.property_ref || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">{l.deal_price ? usd(l.deal_price) : '—'}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums text-slate-600 lg:table-cell">{l.attempts || 0}</td>
                <td className="hidden px-3 py-2 text-slate-600 xl:table-cell">{l.lead_source || '—'}</td>
                <td className="hidden px-3 py-2 text-slate-600 xl:table-cell">{l.assigned_to || '—'}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 lg:table-cell">{fmtDate(addedMs(l))}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 md:table-cell">{fmtDate(updatedMs(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ grid */

function GridView({
  rows, stageById, openRecord, leadsLoading,
}: { rows: Lead[]; stageById: Map<number, Stage>; openRecord: (id: string) => void; leadsLoading: boolean }) {
  if (leadsLoading) return <LoadingBlock label="Loading leads…" />;
  if (rows.length === 0) return <EmptyState text="No leads match the current filters." />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((l) => (
        <button key={l.lead_id} onClick={() => openRecord(l.lead_id)}
          className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3 text-left transition hover:border-brand/40 hover:shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="truncate text-sm font-bold text-ink">{l.name}</div>
            {l.deal_price ? <span className="shrink-0 text-sm font-bold text-emerald-600">{usd(l.deal_price)}</span> : null}
          </div>
          <StagePill stage={l.stage_id != null ? stageById.get(l.stage_id) : undefined} />
          {l.property_ref && <div className="flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" />{l.property_ref}</div>}
          {l.phone && <div className="flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3 shrink-0" />{l.phone}</div>}
          <div className="flex flex-wrap items-center gap-1.5">
            <AttemptsBadge n={l.attempts} />
            {l.lead_source && <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-slate-500">{l.lead_source}</span>}
          </div>
          <Tags tags={l.tags} />
        </button>
      ))}
    </div>
  );
}
