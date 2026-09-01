import { useEffect, useMemo, useState } from 'react';
import { StageIcon, STAGE_ICON_NAMES } from '../lib/statusIcons';
import SmartLists from '../components/SmartLists';
import type { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { PageHeader, LoadingBlock, EmptyState, KpiCard, SectionCard } from '../components/dash';
import { num, usd } from '../lib/format';
import { useWorkspace } from '../lib/workspace';
import {
  Plus, Trash2, GripVertical, LayoutGrid, Table as TableIcon, Columns3,
  Search, Calendar, Phone, MapPin, Layers, TrendingUp, Target, Activity, Pencil, X, DollarSign, Filter, Check,
  PhoneIncoming, PhoneOutgoing, Clock, Bot, ChevronLeft, ChevronRight, Sliders,
} from 'lucide-react';

// Curated color palette for pipeline stages (Tailwind-ish hues). Stored as hex on each stage.
const STAGE_PALETTE = [
  '#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308',
  '#f59e0b', '#f97316', '#ef4444', '#e11d48', '#ec4899', '#a855f7', '#8b5cf6', '#6366f1',
  '#64748b', '#0f172a',
];
// Default stage set seeded when a user creates a brand-new pipeline (fully editable before save).
const DEFAULT_NEW_STAGES: { name: string; color: string; icon: string }[] = [
  { name: 'New Lead', color: '#2563eb', icon: 'UserPlus' },
  { name: 'Contacted', color: '#f59e0b', icon: 'PhoneForwarded' },
  { name: 'Appointment Set', color: '#8b5cf6', icon: 'CalendarCheck' },
  { name: 'Offer Sent', color: '#06b6d4', icon: 'Send' },
  { name: 'Won', color: '#22c55e', icon: 'Trophy' },
  { name: 'Lost', color: '#ef4444', icon: 'XCircle' },
];

type Stage = { id: number; name: string; color: string; sort_order: number; leadCount: number; valueSum?: number; icon?: string | null };
type Pipeline = { id: number; name: string; workspace?: string; sort_order?: number; stages: Stage[] };
type Lead = {
  lead_id: string; name: string; stage_id: number | null; pipeline_id: number;
  opportunity_id?: number;
  deal_price?: number | null; lead_source?: string | null; assigned_to?: string | null;
  property_ref?: string | null; tags?: string[]; created_at?: string | null; updated_at?: string | null;
  date_added?: string | null; attempts?: number; last_disposition?: string | null;
  phone?: string | null; phone_count?: number;
  last_call?: { call_id?: string; direction?: string; agent_name?: string | null; agent_id?: string | null; duration?: number; ts?: number; disposition?: string | null } | null;
};

type ViewMode = 'board' | 'table' | 'grid';
type SortKey = 'name' | 'deal_price' | 'attempts' | 'created' | 'updated';
type RangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';
type DateBasis = 'added' | 'updated';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

// The "Standard 1PM Pipeline" is pinned first, non-deletable and non-draggable in every workspace.
const PINNED_PIPELINE = 'Standard 1PM Pipeline';
const isPinnedPipeline = (p: Pipeline) => p.name === PINNED_PIPELINE;

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
  // Filters (stage / value / source / assigned) + saved smart-list config.
  const [stageFilter, setStageFilter] = useState<number[]>([]);
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [filterMenu, setFilterMenu] = useState(false);
  // Call-based filters (agent / call date / duration) + the agent list from the backend.
  const [agentFilter, setAgentFilter] = useState('');
  const [callStart, setCallStart] = useState('');
  const [callEnd, setCallEnd] = useState('');
  const [durMin, setDurMin] = useState('');
  const [durMax, setDurMax] = useState('');
  const [callAgents, setCallAgents] = useState<string[]>([]);

  // drag state (lead cards on the board)
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // drag state (reordering the pipeline pills)
  const [pipeDragId, setPipeDragId] = useState<number | null>(null);
  const [pipeDragOver, setPipeDragOver] = useState<number | null>(null);

  const loadPipelines = () =>
    opm.pipelines().then((d: any) => {
      const list: Pipeline[] = d.pipelines || [];
      setPipelines(list);
      setActive((a) => (a != null && list.some((p) => p.id === a) ? a : (list[0]?.id ?? null)));
    }).finally(() => setLoading(false));

  // Reload pipelines when the workspace changes.
  useEffect(() => { setLoading(true); loadPipelines(); /* eslint-disable-next-line */ }, [activeWorkspace]);

  const current = pipelines.find((p) => p.id === active) || null;
  // Render order: pinned "Standard 1PM Pipeline" always first, then the rest in their stored order.
  const orderedPipelines = useMemo(() => {
    const pinned = pipelines.filter(isPinnedPipeline);
    const rest = pipelines.filter((p) => !isPinnedPipeline(p));
    return [...pinned, ...rest];
  }, [pipelines]);
  // Distinct source / assigned values for the filter dropdowns.
  const sourceOptions = useMemo(() => [...new Set(leads.map((l) => l.lead_source).filter(Boolean) as string[])].sort(), [leads]);
  const assignedOptions = useMemo(() => [...new Set(leads.map((l) => l.assigned_to).filter(Boolean) as string[])].sort(), [leads]);
  const activeFilterCount = (stageFilter.length ? 1 : 0) + (valueMin || valueMax ? 1 : 0) + (sourceFilter ? 1 : 0) + (assignedFilter ? 1 : 0) + (agentFilter ? 1 : 0) + (callStart || callEnd ? 1 : 0) + (durMin || durMax ? 1 : 0);
  const clearFilters = () => { setStageFilter([]); setValueMin(''); setValueMax(''); setSourceFilter(''); setAssignedFilter(''); setAgentFilter(''); setCallStart(''); setCallEnd(''); setDurMin(''); setDurMax(''); };
  // Saved smart-list config: stages stored by NAME so a view is portable across pipelines that share stage names.
  const currentCfg = {
    view, search, sortKey, sortDir, preset, basis, customStart, customEnd,
    stageNames: stageFilter.map((id) => (current?.stages || []).find((s) => s.id === id)?.name).filter(Boolean) as string[],
    valueMin, valueMax, sourceFilter, assignedFilter, agentFilter, callStart, callEnd, durMin, durMax,
  };
  const applyCfg = (c: any) => {
    if (!c) return;
    if (c.view) setView(c.view);
    setSearch(c.search || '');
    if (c.sortKey) setSortKey(c.sortKey);
    if (c.sortDir) setSortDir(c.sortDir);
    if (c.preset) setPreset(c.preset);
    if (c.basis) setBasis(c.basis);
    setCustomStart(c.customStart || ''); setCustomEnd(c.customEnd || '');
    setStageFilter((Array.isArray(c.stageNames) ? c.stageNames : []).map((n: string) => (current?.stages || []).find((s) => s.name === n)?.id).filter((x: any) => x != null) as number[]);
    setValueMin(c.valueMin || ''); setValueMax(c.valueMax || '');
    setSourceFilter(c.sourceFilter || ''); setAssignedFilter(c.assignedFilter || '');
    setAgentFilter(c.agentFilter || ''); setCallStart(c.callStart || ''); setCallEnd(c.callEnd || '');
    setDurMin(c.durMin || ''); setDurMax(c.durMax || '');
  };

  // Load the OPPORTUNITIES on the selected pipeline (a contact can appear on several boards at once),
  // then enrich each card with its most-recent call from the shared last-calls map.
  useEffect(() => {
    if (active == null) { setLeads([]); return; }
    let cancelled = false;
    setLeadsLoading(true);
    Promise.all([opm.oppsBoard(active), opm.lastCallsMap().catch(() => ({ map: {} }))])
      .then(([d, lc]: any[]) => {
        if (cancelled) return;
        const map = (lc && lc.map) || {};
        const rows = (d.leads || []).map((l: any) => {
          const c = map[l.lead_id];
          return c ? { ...l, last_call: { ts: c.date ? new Date(c.date).getTime() : undefined, duration: c.duration_seconds, disposition: c.disposition, direction: c.direction, agent_name: c.agent_name || null } } : l;
        });
        setLeads(rows);
        setCallAgents([...new Set(rows.map((r: any) => r.last_call?.agent_name).filter(Boolean))] as string[]);
      })
      .catch(() => { if (!cancelled) setLeads([]); })
      .finally(() => { if (!cancelled) setLeadsLoading(false); });
    return () => { cancelled = true; };
  }, [active]);

  // Stage curation modals: single-stage editor (add/edit color+icon) + new-pipeline builder.
  const [stageEdit, setStageEdit] = useState<{ stage: Stage | null } | null>(null);
  const [newPipeOpen, setNewPipeOpen] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);

  // ---- CRUD ----
  function addPipeline() { setNewPipeOpen(true); }
  // Create a pipeline + its curated stages (color + icon) in order, then focus it.
  async function createPipeline(name: string, draft: { name: string; color: string; icon: string }[]) {
    setStageBusy(true);
    try {
      const r: any = await opm.savePipeline({ name, sort_order: pipelines.length });
      const pid = r?.pipeline?.id;
      if (pid) {
        for (let i = 0; i < draft.length; i++) {
          const d = draft[i];
          await opm.saveStage({ pipeline_id: pid, name: d.name, color: d.color, icon: d.icon, sort_order: i });
        }
      }
      setNewPipeOpen(false);
      await loadPipelines();
      if (pid) setActive(pid);
    } finally { setStageBusy(false); }
  }
  // Persist a single stage (create when no id, else update) with color + icon.
  async function submitStage(vals: { name: string; color: string; icon: string | null }) {
    if (!current) return;
    setStageBusy(true);
    try {
      const s = stageEdit?.stage;
      await opm.saveStage(s
        ? { id: s.id, name: vals.name, color: vals.color, icon: vals.icon, sort_order: s.sort_order }
        : { pipeline_id: current.id, name: vals.name, color: vals.color, icon: vals.icon, sort_order: current.stages.length });
      setStageEdit(null);
      loadPipelines();
    } finally { setStageBusy(false); }
  }
  // Reorder a stage left/right on the board and persist the new order.
  async function moveStage(s: Stage, dir: -1 | 1) {
    if (!current) return;
    const ordered = [...current.stages].sort((a, b) => a.sort_order - b.sort_order);
    const i = ordered.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    const reindexed = next.map((x, k) => ({ ...x, sort_order: k }));
    setPipelines((prev) => prev.map((p) => (p.id === current.id ? { ...p, stages: reindexed } : p))); // optimistic
    try { await opm.reorderStages(reindexed.map((x) => x.id)); } catch { loadPipelines(); }
  }
  async function delPipeline(id: number) {
    const p = pipelines.find((x) => x.id === id);
    if (p && isPinnedPipeline(p)) return; // pinned pipeline is non-deletable
    if (!confirm('Archive this pipeline?')) return;
    await opm.deletePipeline(id); setActive(null); loadPipelines();
  }
  // Drag-reorder the (non-pinned) pipelines: move `dragId` to `dropId`'s slot, persist, reload on failure.
  async function reorderPipelines(dragId: number, dropId: number) {
    if (dragId === dropId) return;
    const pinned = pipelines.filter(isPinnedPipeline);
    const rest = pipelines.filter((p) => !isPinnedPipeline(p));
    const from = rest.findIndex((p) => p.id === dragId);
    const to = rest.findIndex((p) => p.id === dropId);
    if (from < 0 || to < 0) return; // never move the pinned pipeline
    const next = [...rest];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const newList = [...pinned, ...next];
    setPipelines(newList); // optimistic
    try {
      await opm.reorderPipelines(newList.map((p) => p.id));
    } catch {
      loadPipelines(); // resync on failure
    }
  }
  function addStage() { if (current) setStageEdit({ stage: null }); }
  function renameStage(s: Stage) { setStageEdit({ stage: s }); }
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
    const vMin = valueMin.trim() === '' ? null : Number(valueMin);
    const vMax = valueMax.trim() === '' ? null : Number(valueMax);
    const stageSet = stageFilter.length ? new Set(stageFilter) : null;
    const cStart = callStart ? new Date(callStart + 'T00:00:00').getTime() : null;
    const cEnd = callEnd ? new Date(callEnd + 'T23:59:59').getTime() : null;
    const dMin = durMin.trim() === '' ? null : Number(durMin);
    const dMax = durMax.trim() === '' ? null : Number(durMax);
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
      if (stageSet && !(l.stage_id != null && stageSet.has(l.stage_id))) return false;
      if (vMin != null && (l.deal_price || 0) < vMin) return false;
      if (vMax != null && (l.deal_price || 0) > vMax) return false;
      if (sourceFilter && String(l.lead_source || '') !== sourceFilter) return false;
      if (assignedFilter && String(l.assigned_to || '') !== assignedFilter) return false;
      if (agentFilter && String(l.last_call?.agent_name || '') !== agentFilter) return false;
      if (cStart != null || cEnd != null) { const t = l.last_call?.ts || null; if (t == null) return false; if (cStart != null && t < cStart) return false; if (cEnd != null && t > cEnd) return false; }
      if (dMin != null && (l.last_call?.duration || 0) < dMin) return false;
      if (dMax != null && (l.last_call?.duration || 0) > dMax) return false;
      return true;
    });
  }, [leads, search, range, basis, stageFilter, valueMin, valueMax, sourceFilter, assignedFilter, agentFilter, callStart, callEnd, durMin, durMax]);

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
      // Move this pipeline's OPPORTUNITY independently; the lead's other pipeline positions are untouched.
      if (lead.opportunity_id != null) await opm.oppsMove({ opportunity_id: lead.opportunity_id, stage_id: stageId });
      else await opm.moveLead({ lead_id: leadId, pipeline_id: current.id, stage_id: stageId });
      loadPipelines();
    } catch {
      // reload on failure to resync
      if (active != null) {
        setLeadsLoading(true);
        opm.oppsBoard(active).then((d: any) => setLeads(d.leads || [])).finally(() => setLeadsLoading(false));
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
        {orderedPipelines.map((p) => {
          const pinned = isPinnedPipeline(p);
          return (
            <button key={p.id} onClick={() => setActive(p.id)}
              draggable={!pinned}
              onDragStart={pinned ? undefined : (e) => { setPipeDragId(p.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { setPipeDragId(null); setPipeDragOver(null); }}
              onDragOver={pinned ? undefined : (e) => { if (pipeDragId != null && pipeDragId !== p.id) { e.preventDefault(); setPipeDragOver(p.id); } }}
              onDragLeave={() => setPipeDragOver((c) => (c === p.id ? null : c))}
              onDrop={pinned ? undefined : (e) => { e.preventDefault(); if (pipeDragId != null) reorderPipelines(pipeDragId, p.id); setPipeDragOver(null); setPipeDragId(null); }}
              className={cx('group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold',
                active === p.id ? 'bg-brand text-white' : 'bg-surface text-slate-600 hover:bg-line',
                pipeDragId === p.id && 'opacity-40',
                pipeDragOver === p.id && 'ring-2 ring-brand/40',
                !pinned && 'cursor-grab')}>
              {!pinned && <GripVertical className={cx('h-3.5 w-3.5', active === p.id ? 'opacity-60' : 'opacity-40')} />}
              {p.name}
              <span className={cx('rounded-full px-1.5 text-xs', active === p.id ? 'bg-white/20' : 'bg-white')}>{p.stages.reduce((s, x) => s + x.leadCount, 0)}</span>
              {active === p.id && !pinned && <Trash2 className="h-3.5 w-3.5 opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); delPipeline(p.id); }} />}
            </button>
          );
        })}
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

            {/* Filters (stage / value / source / assigned) */}
            <div className="relative">
              <button onClick={() => setFilterMenu((o) => !o)}
                className={cx('inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold',
                  activeFilterCount ? 'border-brand text-brand' : 'border-line bg-white text-slate-600 hover:border-brand')}>
                <Filter className="h-4 w-4" /> Filters{activeFilterCount ? <span className="rounded-full bg-brand px-1.5 text-xs text-white">{activeFilterCount}</span> : null}
              </button>
              {filterMenu && (
                <div className="absolute left-0 z-40 mt-1 w-80 rounded-xl border border-line bg-white p-3 shadow-xl">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Stage</div>
                  <div className="mb-3 max-h-40 space-y-0.5 overflow-y-auto">
                    {(current?.stages || []).map((s) => {
                      const on = stageFilter.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => setStageFilter((f) => on ? f.filter((x) => x !== s.id) : [...f, s.id])}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface">
                          <span className={cx('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-slate-300')}>{on && <Check className="h-3 w-3" />}</span>
                          <StageIcon name={s.icon} color={s.color} className="h-3.5 w-3.5" />
                          <span className="truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Deal value</div>
                  <div className="mb-3 flex items-center gap-2">
                    <input value={valueMin} onChange={(e) => setValueMin(e.target.value)} type="number" placeholder="Min $" className="input h-8 flex-1 text-xs" />
                    <span className="text-slate-400">–</span>
                    <input value={valueMax} onChange={(e) => setValueMax(e.target.value)} type="number" placeholder="Max $" className="input h-8 flex-1 text-xs" />
                  </div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Source</div>
                  <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="input mb-3 h-8 w-full text-xs">
                    <option value="">Any source</option>
                    {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Assigned to</div>
                  <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="input h-8 w-full text-xs">
                    <option value="">Anyone</option>
                    {assignedOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <div className="my-2 border-t border-dashed border-line" />
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Last call agent</div>
                  <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="input mb-3 h-8 w-full text-xs">
                    <option value="">Any agent</option>
                    {callAgents.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Last call date</div>
                  <div className="mb-3 flex items-center gap-2">
                    <input type="date" value={callStart} onChange={(e) => setCallStart(e.target.value)} className="input h-8 flex-1 text-xs" />
                    <span className="text-slate-400">–</span>
                    <input type="date" value={callEnd} onChange={(e) => setCallEnd(e.target.value)} className="input h-8 flex-1 text-xs" />
                  </div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Call duration (seconds)</div>
                  <div className="flex items-center gap-2">
                    <input value={durMin} onChange={(e) => setDurMin(e.target.value)} type="number" placeholder="Min" className="input h-8 flex-1 text-xs" />
                    <span className="text-slate-400">–</span>
                    <input value={durMax} onChange={(e) => setDurMax(e.target.value)} type="number" placeholder="Max" className="input h-8 flex-1 text-xs" />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
                    <button onClick={clearFilters} className="text-xs font-semibold text-slate-500 hover:text-ink">Clear all</button>
                    <button onClick={() => setFilterMenu(false)} className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white hover:brightness-110">Done</button>
                  </div>
                </div>
              )}
            </div>

            {/* Shareable saved views */}
            <SmartLists page="pipeline" current={currentCfg} onApply={applyCfg} />

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
              onMoveStage={moveStage}
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

      {/* Single-stage editor (add / edit) - name, color, icon */}
      {stageEdit && (
        <StageEditor
          initial={stageEdit.stage ? { name: stageEdit.stage.name, color: stageEdit.stage.color, icon: stageEdit.stage.icon ?? null } : null}
          title={stageEdit.stage ? 'Edit stage' : 'New stage'}
          submitLabel={stageEdit.stage ? 'Save stage' : 'Add stage'}
          busy={stageBusy}
          onCancel={() => setStageEdit(null)}
          onSubmit={submitStage}
        />
      )}

      {/* New-pipeline builder - name + curated stages */}
      {newPipeOpen && (
        <NewPipelineModal busy={stageBusy} onCancel={() => setNewPipeOpen(false)} onCreate={createPipeline} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ stage curation modals */

// Reusable color + icon picker body (shared by the stage editor and the new-pipeline row editor).
function ColorIconPicker({ color, icon, onColor, onIcon }: { color: string; icon: string | null; onColor: (c: string) => void; onIcon: (i: string | null) => void }) {
  return (
    <>
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Color</div>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => onColor(c)} title={c}
              className={cx('h-7 w-7 rounded-full border-2 transition', color === c ? 'border-ink ring-2 ring-offset-1' : 'border-white')}
              style={{ background: c }}>
              {color === c && <Check className="mx-auto h-3.5 w-3.5 text-white" />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Icon</div>
        <div className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto rounded-lg border border-line p-2">
          {STAGE_ICON_NAMES.map((n) => (
            <button key={n} type="button" onClick={() => onIcon(icon === n ? null : n)} title={n}
              className={cx('grid h-8 w-8 place-items-center rounded-lg border transition', icon === n ? 'border-brand bg-brand/10' : 'border-transparent hover:bg-surface')}>
              <StageIcon name={n} color={color} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function StageEditor({ initial, title, submitLabel, busy, onCancel, onSubmit }: {
  initial: { name: string; color: string; icon: string | null } | null;
  title: string; submitLabel: string; busy?: boolean;
  onCancel: () => void; onSubmit: (v: { name: string; color: string; icon: string | null }) => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || STAGE_PALETTE[0]);
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-bold text-ink">{title}</div>
          <button onClick={onCancel} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Stage name</div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warm Lead" className="input h-10 w-full text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSubmit({ name: name.trim(), color, icon }); }} />
          </div>
          <ColorIconPicker color={color} icon={icon} onColor={setColor} onIcon={setIcon} />
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Preview</div>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `${color}1a`, color }}>
              <StageIcon name={icon} color={color} className="h-3.5 w-3.5" /> {name.trim() || 'Stage name'}
            </span>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface">Cancel</button>
          <button onClick={() => onSubmit({ name: name.trim(), color, icon })} disabled={!name.trim() || busy}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

type DraftStage = { name: string; color: string; icon: string };
function NewPipelineModal({ busy, onCancel, onCreate }: { busy?: boolean; onCancel: () => void; onCreate: (name: string, stages: DraftStage[]) => void }) {
  const [name, setName] = useState('');
  const [stages, setStages] = useState<DraftStage[]>(DEFAULT_NEW_STAGES.map((s) => ({ ...s })));
  const [editIdx, setEditIdx] = useState<number | null>(null); // index editing, or -1 to add
  const move = (i: number, dir: -1 | 1) => setStages((prev) => { const j = i + dir; if (j < 0 || j >= prev.length) return prev; const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = (i: number) => setStages((prev) => prev.filter((_, k) => k !== i));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-bold text-ink">New pipeline</div>
          <button onClick={onCancel} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pipeline name</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Disposition Pipeline" className="input h-10 w-full text-sm" />
        </div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Stages ({stages.length})</div>
          <button onClick={() => setEditIdx(-1)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line px-2 py-1 text-xs font-semibold text-slate-500 hover:border-brand hover:text-brand"><Plus className="h-3.5 w-3.5" /> Add stage</button>
        </div>
        <div className="space-y-1.5">
          {stages.length === 0 && <div className="rounded-lg border border-dashed border-line py-3 text-center text-xs text-slate-400">No stages yet - add at least one.</div>}
          {stages.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${s.color}1a`, color: s.color }}>
                <StageIcon name={s.icon} color={s.color} className="h-3.5 w-3.5" /> {s.name}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <button title="Up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-300 enabled:hover:text-brand disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5 rotate-90" /></button>
                <button title="Down" disabled={i === stages.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-300 enabled:hover:text-brand disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5 rotate-90" /></button>
                <button title="Edit" onClick={() => setEditIdx(i)} className="rounded p-1 text-slate-300 hover:text-brand"><Pencil className="h-3.5 w-3.5" /></button>
                <button title="Remove" onClick={() => remove(i)} className="rounded p-1 text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface">Cancel</button>
          <button onClick={() => onCreate(name.trim(), stages)} disabled={!name.trim() || stages.length === 0 || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
            <Sliders className="h-4 w-4" /> Create pipeline
          </button>
        </div>

        {editIdx !== null && (
          <StageEditor
            initial={editIdx >= 0 ? stages[editIdx] : null}
            title={editIdx >= 0 ? 'Edit stage' : 'New stage'}
            submitLabel={editIdx >= 0 ? 'Save' : 'Add'}
            onCancel={() => setEditIdx(null)}
            onSubmit={(v) => {
              const row: DraftStage = { name: v.name, color: v.color, icon: v.icon || 'Circle' };
              setStages((prev) => editIdx >= 0 ? prev.map((x, k) => (k === editIdx ? row : x)) : [...prev, row]);
              setEditIdx(null);
            }}
          />
        )}
      </div>
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
function fmtDur(s?: number | null): string {
  const n = Math.round(Number(s) || 0);
  if (n <= 0) return '0s';
  return n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`;
}

// Compact "last call" summary shown on pipeline cards + table (direction, when, agent, duration).
function LastCallLine({ lc }: { lc?: Lead['last_call'] }) {
  if (!lc) return null;
  const inbound = lc.direction === 'inbound';
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-500">
      <span className={cx('inline-flex items-center gap-0.5 font-semibold', inbound ? 'text-emerald-600' : 'text-sky-600')}>
        {inbound ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}{inbound ? 'In' : 'Out'}
      </span>
      {lc.ts ? <span className="inline-flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{fmtDate(lc.ts)}</span> : null}
      {lc.duration ? <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{fmtDur(lc.duration)}</span> : null}
      {lc.agent_name ? <span className="inline-flex min-w-0 items-center gap-0.5"><Bot className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{lc.agent_name}</span></span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ board */

function BoardView({
  current, filtered, dragId, dragOver, setDragId, setDragOver, moveTo, openRecord,
  onAddStage, onRenameStage, onDelStage, onMoveStage,
}: {
  current: Pipeline; filtered: Lead[];
  dragId: string | null; dragOver: number | null;
  setDragId: Dispatch<SetStateAction<string | null>>; setDragOver: Dispatch<SetStateAction<number | null>>;
  moveTo: (stageId: number, leadId: string) => void; openRecord: (id: string) => void;
  onAddStage: () => void; onRenameStage: (s: Stage) => void; onDelStage: (s: Stage) => void;
  onMoveStage: (s: Stage, dir: -1 | 1) => void;
}) {
  const stages = [...current.stages].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((s, si) => {
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
                <div className="flex shrink-0 items-center gap-0.5">
                  <span className="mr-0.5 rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{cards.length}</span>
                  <button title="Move stage left" disabled={si === 0} onClick={() => onMoveStage(s, -1)} className="rounded p-0.5 text-slate-300 enabled:hover:text-brand disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button title="Move stage right" disabled={si === stages.length - 1} onClick={() => onMoveStage(s, 1)} className="rounded p-0.5 text-slate-300 enabled:hover:text-brand disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                  <button title="Edit stage (name, color, icon)" onClick={() => onRenameStage(s)} className="rounded p-0.5 text-slate-300 hover:text-brand"><Pencil className="h-3.5 w-3.5" /></button>
                  <button title="Delete stage" onClick={() => onDelStage(s)} className="rounded p-0.5 text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
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
                      <LastCallLine lc={l.last_call} />
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
              {head('Last call', undefined, undefined, 'hidden lg:table-cell')}
              {head('Agent', undefined, undefined, 'hidden xl:table-cell')}
              {head('Duration', undefined, 'right', 'hidden xl:table-cell')}
              {head('Added', 'created', undefined, 'hidden 2xl:table-cell')}
              {head('Updated', 'updated', undefined, 'hidden md:table-cell')}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.lead_id} onClick={() => openRecord(l.lead_id)} className="cursor-pointer border-b border-line/60 hover:bg-surface">
                <td className="px-3 py-2 font-semibold text-ink">{l.name}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const cur = l.stage_id != null ? stageById.get(l.stage_id) : undefined;
                    return (
                      <div className="flex min-w-[150px] max-w-[210px] items-center gap-1.5 rounded-md border bg-white pl-2 pr-1"
                        style={cur ? { borderColor: `${cur.color}66` } : undefined}>
                        {cur && <StageIcon name={cur.icon} color={cur.color} className="h-3.5 w-3.5 shrink-0" />}
                        <select value={l.stage_id ?? ''} onChange={(e) => onMove(Number(e.target.value), l.lead_id)}
                          className="w-full bg-transparent py-1.5 text-xs font-semibold outline-none"
                          style={cur ? { color: cur.color } : undefined}>
                          {l.stage_id == null && <option value="">—</option>}
                          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    );
                  })()}
                </td>
                <td className="hidden px-3 py-2 text-slate-600 sm:table-cell">{l.phone || '—'}</td>
                <td className="hidden max-w-[200px] truncate px-3 py-2 text-slate-600 md:table-cell" title={l.property_ref || ''}>{l.property_ref || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-600">{l.deal_price ? usd(l.deal_price) : '—'}</td>
                <td className="hidden px-3 py-2 text-right tabular-nums text-slate-600 lg:table-cell">{l.attempts || 0}</td>
                <td className="hidden px-3 py-2 text-slate-600 xl:table-cell">{l.lead_source || '—'}</td>
                <td className="hidden px-3 py-2 text-slate-600 xl:table-cell">{l.assigned_to || '—'}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 lg:table-cell">
                  {l.last_call ? (
                    <span className="inline-flex items-center gap-1">
                      {l.last_call.direction === 'inbound' ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-600" /> : <PhoneOutgoing className="h-3.5 w-3.5 text-sky-600" />}
                      {fmtDate(l.last_call.ts || null)}
                    </span>
                  ) : '—'}
                </td>
                <td className="hidden max-w-[160px] truncate px-3 py-2 text-slate-600 xl:table-cell" title={l.last_call?.agent_name || ''}>{l.last_call?.agent_name || '—'}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500 xl:table-cell">{l.last_call?.duration ? fmtDur(l.last_call.duration) : '—'}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-slate-500 2xl:table-cell">{fmtDate(addedMs(l))}</td>
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
