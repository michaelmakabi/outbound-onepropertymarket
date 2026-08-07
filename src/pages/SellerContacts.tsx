import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { opm } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import ImportWizard from '../components/ImportWizard';
import CustomFieldsModal from '../components/CustomFieldsModal';
import SmartLists from '../components/SmartLists';
import {
  PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, MultiSelect, SavedViews,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable,
} from '../components/dash';
import { num } from '../lib/format';
import { Contact, Phone, BadgeCheck, Layers, Search, X, Download, ChevronLeft, ChevronRight, ChevronDown, Smartphone, PhoneOutgoing, Loader2, CheckCircle2, AlertCircle, Upload, Plus, SlidersHorizontal, Trash2, History, Star } from 'lucide-react';

const PAGE_KEY = 'opm-crm';
const PAGE_SIZE = 50;

// AI dialing — Adrian B aggressive outbound agent + rotating caller IDs (matches LeadDetail launcher)
const DIAL_AGENT = { id: 'agent_ee77a9e3c659964acc19d0be54', name: 'Adrian B (Aggressive) · OUTBOUND' };
const DIAL_NUMBERS = ['+18563634757', '+18563634758', '+18563634759', '+18563634760', '+18563634761', '+18563634762'];

function fmtNum(n: string) {
  const d = (n || '').replace(/\D/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}
const digits10 = (n: string) => String(n || '').replace(/\D/g, '').slice(-10);

// Record-level columns (grain = lead_id). Dynamic LEAD custom fields are appended after these.
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Record', required: true, sortKey: 'name' },
  { key: 'numbers', label: 'Numbers', sortKey: 'numbers', align: 'right' },
  { key: 'property', label: 'Property / Address', sortKey: 'property' },
  { key: 'crm_stage', label: 'Stage', sortKey: 'crm_stage' },
  { key: 'pipeline', label: 'Pipeline', sortKey: 'pipeline' },
  { key: 'deal_price', label: 'Deal Price', sortKey: 'deal_price', align: 'right' },
  { key: 'lead_source', label: 'Source', sortKey: 'lead_source' },
  { key: 'assigned_to', label: 'Assigned', sortKey: 'assigned_to' },
  { key: 'tags', label: 'Tags' },
];

type ViewCfg = { pipelineId: string; stageId: string; verified: string; tags: string[]; search: string; sort: any };

export default function SellerContacts() {
  const nav = useNavigate();
  const { isStaff, ownsActive, active } = useWorkspace();
  const [contactRows, setContactRows] = useState<any[]>([]);
  const [leadRows, setLeadRows] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [verified, setVerified] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);

  // ---- Bulk AI caller ----
  const [callModal, setCallModal] = useState(false);
  const [callFrom, setCallFrom] = useState<'rotate' | string>('rotate');
  const [callScope, setCallScope] = useState<'primary' | 'all'>('primary');
  const [gapSec, setGapSec] = useState(8);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; ok: number; fail: number; current: string }>({ done: 0, total: 0, ok: 0, fail: 0, current: '' });
  const [callLog, setCallLog] = useState<{ name: string; phone: string; ok: boolean; err?: string }[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      opm.sellerContacts().then((d) => setContactRows(d.contacts || [])).catch(() => setContactRows([])),
      opm.leads({}).then((d) => setLeadRows(d.leads || [])).catch(() => setLeadRows([])),
      opm.pipelines().then((d) => setPipelines(d.pipelines || [])).catch(() => setPipelines([])),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadFields = useCallback(() => { opm.customFields().then((d: any) => setCustomFields(d.fields || [])).catch(() => setCustomFields([])); }, []);
  useEffect(() => { loadFields(); }, [loadFields]);

  const pipeName = useMemo(() => Object.fromEntries(pipelines.map((p) => [p.id, p.name])), [pipelines]);

  // ---- Build record-centric rows keyed by lead_id ----
  // Group the per-number contact rows under their lead, then merge in the per-record
  // fields from opm.leads() (deal_price, tags, pipeline, stage). Records that exist in
  // leads() but carry no contacts are still included so nothing is lost.
  const records = useMemo<any[]>(() => {
    const byLead: Record<string, any> = {};
    for (const c of contactRows) {
      const id = c.lead_id;
      if (!byLead[id]) {
        byLead[id] = {
          lead_id: id,
          lead_name: c.lead_name || c.name || '',
          property_ref: c.property_ref || '',
          address: c.address || '',
          crm_stage: c.crm_stage || '',
          pipeline_id: c.pipeline_id ?? null,
          assigned_to: c.assigned_to || '',
          lead_source: c.lead_source || '',
          lead_custom: c.lead_custom || {},
          numbers: [],
          altSet: new Set<string>(),
          workspace_count: 0,
          deal_price: 0,
          tags: [] as string[],
          stage_id: null,
        };
      }
      const rec = byLead[id];
      rec.numbers.push(c);
      rec.workspace_count = Math.max(rec.workspace_count, c.workspace_count || 0);
      if (Array.isArray(c.alt_names)) c.alt_names.forEach((a: string) => rec.altSet.add(a));
    }

    // Merge / add from the per-record leads() feed.
    for (const l of leadRows) {
      const id = l.lead_id;
      let rec = byLead[id];
      if (!rec) {
        rec = byLead[id] = {
          lead_id: id,
          lead_name: l.name || '',
          property_ref: l.property_ref || '',
          address: '',
          crm_stage: l.crm_stage || '',
          pipeline_id: null,
          assigned_to: l.assigned_to || '',
          lead_source: l.lead_source || '',
          lead_custom: {},
          numbers: [],
          altSet: new Set<string>(),
          workspace_count: 0,
          deal_price: 0,
          tags: [],
          stage_id: null,
        };
      }
      rec.deal_price = Number(l.deal_price) || 0;
      rec.tags = Array.isArray(l.tags) ? l.tags : [];
      rec.stage_id = l.stage_id ?? rec.stage_id;
      if (l.pipeline_id != null) rec.pipeline_id = l.pipeline_id; // prefer leads' pipeline
      if (!rec.lead_name) rec.lead_name = l.name || '';
      if (!rec.crm_stage) rec.crm_stage = l.crm_stage || '';
      if (!rec.assigned_to) rec.assigned_to = l.assigned_to || '';
      if (!rec.lead_source) rec.lead_source = l.lead_source || '';
      if (!rec.property_ref) rec.property_ref = l.property_ref || '';
    }

    return Object.values(byLead).map((rec: any) => {
      const numbersCount = rec.numbers.length;
      const verifiedCount = rec.numbers.filter((n: any) => n.phone_verified).length;
      const primary = rec.numbers.find((n: any) => n.is_primary_number) || rec.numbers[0] || null;
      return {
        ...rec,
        numbersCount,
        verifiedCount,
        hasMobile: rec.numbers.some((n: any) => n.phone_channel === 'mobile'),
        hasVerified: verifiedCount > 0,
        primary,
        alt_names: Array.from(rec.altSet),
        pipeline_name: rec.pipeline_id != null ? (pipeName[rec.pipeline_id] || '') : '',
      };
    });
  }, [contactRows, leadRows, pipeName]);

  // LEAD custom fields render as extra searchable/sortable columns after the built-ins.
  const customCols = useMemo<ColumnDef[]>(() => customFields.filter((cf) => cf.entity === 'lead').map((cf) => ({
    key: `cf_lead_${cf.field_key}`, label: cf.label, sortKey: `cf_lead_${cf.field_key}`,
  })), [customFields]);

  const cfValue = useCallback((r: any, key: string): string => {
    const m = key.match(/^cf_lead_(.+)$/);
    if (!m) return '';
    const v = (r.lead_custom || {})[m[1]];
    return v === undefined || v === null ? '' : String(v);
  }, []);

  const stages = useMemo(() => {
    if (pipelineId) return pipelines.find((p) => String(p.id) === pipelineId)?.stages || [];
    return pipelines.flatMap((p: any) => (p.stages || [])).filter((s: any) => s.leadCount > 0);
  }, [pipelines, pipelineId]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => (r.tags || []).forEach((t: string) => s.add(t)));
    return Array.from(s).sort().map((t) => ({ value: t, label: t }));
  }, [records]);

  const preFiltered = useMemo(() => records.filter((r) => {
    if (pipelineId && String(r.pipeline_id) !== pipelineId) return false;
    if (stageId && String(r.stage_id) !== stageId) return false;
    if (verified === 'yes' && !r.hasVerified) return false;
    if (verified === 'no' && r.hasVerified) return false;
    if (tagFilter.length && !tagFilter.every((t) => (r.tags || []).includes(t))) return false;
    return true;
  }), [records, pipelineId, stageId, verified, tagFilter]);

  const getValue = useCallback((r: any, key: string): string | number => {
    switch (key) {
      case 'name': return r.lead_name || '';
      case 'numbers': return r.numbersCount || 0;
      case 'property': return `${r.property_ref || ''} ${r.address || ''}`;
      case 'crm_stage': return r.crm_stage || '';
      case 'pipeline': return r.pipeline_name || '';
      case 'deal_price': return Number(r.deal_price) || 0;
      case 'lead_source': return r.lead_source || '';
      case 'assigned_to': return r.assigned_to || '';
      case 'tags': return (r.tags || []).join(' ');
      // hidden search-only key: every phone number's digits, so search matches phones too
      case '__phones': return (r.numbers || []).map((n: any) => (n.phone || '').replace(/\D/g, '')).join(' ');
      default: return key.startsWith('cf_lead_') ? cfValue(r, key) : '';
    }
  }, [cfValue]);

  const visibleColumns = useMemo<ColumnDef[]>(() => [...COLUMNS, ...customCols], [customCols]);
  // Include a hidden "__phones" column so useClientTable's search also scans phone digits.
  const searchColumns = useMemo<ColumnDef[]>(() => [...visibleColumns, { key: '__phones', label: '' }], [visibleColumns]);

  const { rows, search, setSearch, sort, setSort, isVisible, toggle } = useClientTable<any>({
    pageKey: PAGE_KEY, columns: searchColumns, rows: preFiltered, getValue, initialSort: { by: 'name', dir: 'asc' },
  });

  useEffect(() => { setPage(1); }, [pipelineId, stageId, verified, tagFilter, search, sort]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const orderedIds = useMemo(() => rows.map((r) => r.lead_id), [rows]);
  const hasFilters = !!pipelineId || !!stageId || !!verified || tagFilter.length > 0 || !!search;

  const dialableNumbers = records.reduce((s, r) => s + r.numbersCount, 0);
  const verifiedNumbers = records.reduce((s, r) => s + r.verifiedCount, 0);
  const inPipeline = records.filter((r) => r.pipeline_id != null).length;

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.lead_id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allOnPage) pageRows.forEach((r) => n.delete(r.lead_id)); else pageRows.forEach((r) => n.add(r.lead_id)); return n; });
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const currentCfg: ViewCfg = { pipelineId, stageId, verified, tags: tagFilter, search, sort };
  const applyView = (c: ViewCfg) => { setPipelineId(c.pipelineId || ''); setStageId(c.stageId || ''); setVerified(c.verified || ''); setTagFilter(c.tags || []); setSearch(c.search || ''); setSort(c.sort || null); };

  const selectedRecords = useMemo(() => rows.filter((r) => selected.has(r.lead_id)), [rows, selected]);

  // ---- Bulk delete ----
  const canManage = isStaff || ownsActive;
  const [deleting, setDeleting] = useState(false);
  const bulkDelete = async () => {
    if (deleting || selectedRecords.length === 0) return;
    const ids = selectedRecords.flatMap((r) => r.numbers.map((n: any) => n.contact_id)).filter(Boolean);
    if (!window.confirm(`Delete ${selectedRecords.length} record${selectedRecords.length === 1 ? '' : 's'} and their ${ids.length} phone number${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      for (let i = 0; i < ids.length; i += 500) await opm.deleteContacts(ids.slice(i, i + 500));
      setSelected(new Set());
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'Could not delete records.');
    } finally { setDeleting(false); }
  };

  const exportCsv = () => {
    const cols = ['#', 'Name', 'Numbers', 'Primary Phone', 'Property', 'Address', 'Stage', 'Pipeline', 'DealPrice', 'Source', 'Assigned', 'Tags', 'LeadID'];
    const src = selected.size ? rows.filter((r) => selected.has(r.lead_id)) : rows;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')];
    src.forEach((r, i) => lines.push([i + 1, r.lead_name, r.numbersCount, r.primary ? r.primary.phone : '', r.property_ref, r.address, r.crm_stage, r.pipeline_name, r.deal_price || '', r.lead_source, r.assigned_to, (r.tags || []).join('; '), r.lead_id].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  // Numbers queued for AI dialing. Scope decides which numbers on each selected record
  // get dialed: primary → the record's primary line only; all → every number. Always
  // dedup by 10-digit phone, skip do-not-call and anything shorter than 10 digits.
  const callQueue = useMemo(() => {
    const candidates: any[] = [];
    for (const rec of selectedRecords) {
      if (callScope === 'primary') { if (rec.primary) candidates.push(rec.primary); }
      else candidates.push(...rec.numbers);
    }
    const seen = new Set<string>();
    return candidates.filter((n) => {
      if (!n || n.do_not_call) return false;
      const p = (n.phone || '').replace(/\D/g, '');
      if (p.length < 10) return false;
      const key = p.slice(-10);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [selectedRecords, callScope]);

  async function runBulkCalls() {
    if (running || callQueue.length === 0) return;
    setRunning(true);
    setCallLog([]);
    setProgress({ done: 0, total: callQueue.length, ok: 0, fail: 0, current: '' });
    const gap = Math.max(2, gapSec) * 1000;
    let ok = 0, fail = 0;
    for (let i = 0; i < callQueue.length; i++) {
      const r = callQueue[i];
      const name = r.lead_name || r.name || 'Unknown';
      const from = callFrom === 'rotate' ? DIAL_NUMBERS[i % DIAL_NUMBERS.length] : callFrom;
      setProgress((p) => ({ ...p, current: name }));
      try {
        await opm.placeCall({ lead_id: r.lead_id, to_number: r.phone, from_number: from, agent_id: DIAL_AGENT.id, workspace: '1propertymarket' });
        ok++;
        setCallLog((l) => [{ name, phone: r.phone, ok: true }, ...l]);
      } catch (e: any) {
        fail++;
        setCallLog((l) => [{ name, phone: r.phone, ok: false, err: e?.message || 'failed' }, ...l]);
      }
      setProgress((p) => ({ ...p, done: i + 1, ok, fail }));
      if (i < callQueue.length - 1) await new Promise((res) => setTimeout(res, gap)); // non-overlapping spacing
    }
    setProgress((p) => ({ ...p, current: '' }));
    setRunning(false);
  }

  // Staff can import into any tenant; a company owner can import into their own tenant only.
  const canImport = isStaff || ownsActive;
  const colSpan = 3 + visibleColumns.filter((c) => isVisible(c.key)).length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Contacts" description="Every seller record — its property, dialable numbers, pipeline and deal, in one place" showDate={false} />
        {canImport && (
          <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-surface" onClick={() => setShowFields(true)}>
              <SlidersHorizontal className="h-4 w-4" /> Custom fields
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-surface" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add contact
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-light/40 px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-light" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </button>
          </div>
        )}
      </div>

      {showImport && <ImportWizard onClose={() => setShowImport(false)} lockedWorkspace={!isStaff && ownsActive ? (active || undefined) : undefined} />}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {showFields && <CustomFieldsModal onClose={() => setShowFields(false)} onChanged={loadFields} />}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Records" value={num(records.length)} sub="one per seller / property" icon={Contact} accent="blue" />
        <KpiCard label="Dialable Numbers" value={num(dialableNumbers)} sub="across all records" icon={Phone} accent="green" />
        <KpiCard label="Verified Numbers" value={num(verifiedNumbers)} sub="confirmed working" icon={BadgeCheck} accent="amber" />
        <KpiCard label="In a Pipeline" value={num(inPipeline)} sub="assigned to a board" icon={Layers} />
      </div>

      <SectionCard title="Filters" description={`${total.toLocaleString()} record${total === 1 ? '' : 's'} match`} className="mb-4"
        action={<div className="flex items-center gap-2">
          <SmartLists<ViewCfg> page="crm" current={currentCfg} onApply={applyView} />
          <SavedViews<ViewCfg> pageKey={PAGE_KEY} current={currentCfg} onApply={applyView} />
          <ColumnToggleMenu columns={visibleColumns} isVisible={isVisible} onToggle={toggle} />
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
          <select value={verified} onChange={(e) => setVerified(e.target.value)} className="input !py-1.5 text-sm">
            <option value="">Any number status</option><option value="yes">Has verified number</option><option value="no">No verified number</option>
          </select>
          <MultiSelect options={allTags} value={tagFilter} onChange={setTagFilter} placeholder="All tags" width={180} />
          <div className="relative w-full sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, property, address, phone, source…" className="input w-full sm:w-[300px] pl-8" />
          </div>
          {hasFilters && <button className="btn-ghost !py-1.5" onClick={() => { setPipelineId(''); setStageId(''); setVerified(''); setTagFilter([]); setSearch(''); }}><X className="h-3.5 w-3.5" /> Clear</button>}
        </div>
      </SectionCard>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/50 px-4 py-2.5">
          <span className="text-sm font-semibold text-brand">{selected.size} selected</span>
          <span className="mx-1 h-4 w-px bg-brand/20" />
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90" onClick={() => { setCallLog([]); setProgress({ done: 0, total: 0, ok: 0, fail: 0, current: '' }); setCallModal(true); }}><PhoneOutgoing className="h-3.5 w-3.5" /> Launch AI calls</button>
          <button className="btn-ghost !py-1.5" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export selected</button>
          {canManage && <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={deleting} onClick={bulkDelete}>{deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete</button>}
          <button className="btn-ghost !py-1.5" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {callModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !running && setCallModal(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><PhoneOutgoing className="h-5 w-5 text-brand" /> Launch AI calls</h3>
              {!running && <button onClick={() => setCallModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>}
            </div>

            {progress.total === 0 ? (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  This will place <span className="font-bold text-ink">{callQueue.length}</span> live AI call{callQueue.length === 1 ? '' : 's'} to real sellers, one at a time, using <span className="font-semibold">{DIAL_AGENT.name}</span>. Each call carries the seller's property context, stage, and our assessed value. Calls are spaced so none overlap.
                </p>
                <label className="mb-3 block text-xs font-semibold text-slate-500">Numbers to dial
                  <select value={callScope} onChange={(e) => setCallScope(e.target.value as any)} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                    <option value="primary">Primary number of each record</option>
                    <option value="all">Every number on each record</option>
                  </select>
                </label>
                <div className="mb-3 text-xs text-slate-400">A record can hold several phone numbers. Choose whether to reach just the primary line or every number on it.</div>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-500">Caller ID
                    <select value={callFrom} onChange={(e) => setCallFrom(e.target.value)} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                      <option value="rotate">Rotate all {DIAL_NUMBERS.length} numbers</option>
                      {DIAL_NUMBERS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-500">Gap between calls
                    <select value={gapSec} onChange={(e) => setGapSec(Number(e.target.value))} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                      <option value={8}>8 seconds</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option>
                    </select>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setCallModal(false)}>Cancel</button>
                  <button disabled={callQueue.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" onClick={runBulkCalls}><PhoneOutgoing className="h-4 w-4" /> Start dialing {callQueue.length}</button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">{running ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Dialing {progress.current}…</span> : 'Done'}</span>
                    <span className="tabular-nums text-slate-500">{progress.done} / {progress.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-brand transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                  <div className="mt-1.5 flex gap-3 text-xs"><span className="text-emerald-600">{progress.ok} placed</span>{progress.fail > 0 && <span className="text-red-500">{progress.fail} failed</span>}</div>
                </div>
                <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-line">
                  {callLog.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs last:border-0">
                      {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      <span className="font-medium text-ink">{c.name}</span><span className="font-mono text-slate-400">{fmtNum(c.phone)}</span>
                      {!c.ok && <span className="ml-auto truncate text-red-500">{c.err}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button disabled={running} className="btn-primary disabled:opacity-50" onClick={() => { setCallModal(false); if (!running) setSelected(new Set()); }}>{running ? 'Dialing…' : 'Close'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionCard title="All records" description={sort ? `Sorted by ${sort.by} (${sort.dir})` : 'Unsorted'}
        action={<div className="flex items-center gap-2 text-xs text-slate-500">
          <button className="btn-ghost !py-1.5" disabled={total === 0} onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</button>
          <button className="btn-ghost !p-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular-nums">Page {page} / {pageCount}</span>
          <button className="btn-ghost !p-1.5" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>}>
        {loading ? <LoadingBlock label="Loading records…" /> : total === 0 ? <EmptyState text="No records match these filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="w-8 px-3 py-2.5"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#1f6feb]" /></th>
                  <th className="w-10 px-2 py-2.5 text-right">#</th>
                  {visibleColumns.filter((c) => isVisible(c.key)).map((c) => <SortableHead key={c.key} col={c} sort={sort} onSort={setSort}>{c.label}</SortableHead>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const isOpen = expanded.has(r.lead_id);
                  return (
                    <Fragment key={r.lead_id}>
                      <tr className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/leads/${encodeURIComponent(r.lead_id)}`, { state: { ids: orderedIds } })}>
                        <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <button title={isOpen ? 'Hide numbers' : 'Show numbers'} onClick={() => toggleExpand(r.lead_id)} className="rounded p-0.5 text-slate-400 hover:bg-brand-light hover:text-brand">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                        </td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.lead_id)} onChange={() => toggleSel(r.lead_id)} className="h-3.5 w-3.5 accent-[#1f6feb]" /></td>
                        <td className="px-2 py-2.5 text-right font-mono text-xs text-slate-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        {isVisible('name') && <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-ink">{r.lead_name || '—'}</span>
                            <span className="inline-flex items-center rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{r.numbersCount} #</span>
                            {r.primary && <span title="Has a primary number" className="text-amber-500"><Star className="h-3 w-3 fill-amber-400" /></span>}
                            {r.workspace_count > 1 && <span title={`Appears in ${r.workspace_count} workspaces`} className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold text-indigo-700"><Layers className="h-2.5 w-2.5" /> {r.workspace_count} WS</span>}
                          </div>
                          {r.alt_names.length > 0 && <div className="text-[10px] text-violet-500">also: {r.alt_names.join(', ')}</div>}
                        </td>}
                        {isVisible('numbers') && <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs text-slate-600">{r.numbersCount} · <span className="text-emerald-600">{r.verifiedCount}✓</span></td>}
                        {isVisible('property') && <td className="max-w-[240px] px-3 py-2.5"><div className="truncate text-xs text-slate-700">{r.property_ref || '—'}</div>{r.address && <div className="truncate text-[10px] text-slate-400">{r.address}</div>}</td>}
                        {isVisible('crm_stage') && <td className="whitespace-nowrap px-3 py-2.5"><span className="pill bg-brand/10 text-brand">{r.crm_stage || '—'}</span></td>}
                        {isVisible('pipeline') && <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{r.pipeline_name || '—'}</td>}
                        {isVisible('deal_price') && <td className="px-3 py-2.5 text-right">{r.deal_price ? `$${num(r.deal_price)}` : '—'}</td>}
                        {isVisible('lead_source') && <td className="max-w-[150px] truncate px-3 py-2.5 text-xs text-slate-500">{r.lead_source || '—'}</td>}
                        {isVisible('assigned_to') && <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.assigned_to || '—'}</td>}
                        {isVisible('tags') && <td className="max-w-[220px] px-3 py-2.5"><div className="flex flex-wrap gap-1">{(r.tags || []).slice(0, 4).map((t: string) => <span key={t} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-slate-500">{t}</span>)}{(r.tags || []).length > 4 && <span className="text-[10px] text-slate-400">+{r.tags.length - 4}</span>}</div></td>}
                        {customCols.filter((c) => isVisible(c.key)).map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{cfValue(r, c.key) || '—'}</td>)}
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-line bg-surface/40">
                          <td colSpan={colSpan} className="px-4 py-3">
                            {r.numbers.length === 0 ? <div className="text-xs text-slate-400">No phone numbers on this record.</div> : (
                              <div className="space-y-1.5">
                                {r.numbers.map((n: any) => (
                                  <div key={n.contact_id} className="flex flex-wrap items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                                    <a href={`tel:${n.phone}`} className="font-mono font-semibold text-brand hover:underline">{fmtNum(n.phone)}</a>
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${n.phone_channel === 'mobile' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{n.phone_channel === 'mobile' ? <Smartphone className="h-3 w-3" /> : <Phone className="h-3 w-3" />}{n.phone_channel || 'other'}</span>
                                    {n.phone_verified && <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><BadgeCheck className="h-3.5 w-3.5" />verified</span>}
                                    {n.is_primary_number && <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600"><Star className="h-3 w-3 fill-amber-400" /> primary</span>}
                                    {n.do_not_call && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Do not call</span>}
                                    {(n.contact_kind === 'relative' && n.relation_type) && <span className="text-[10px] text-violet-500">{n.relation_type}</span>}
                                    <Link to={`/contacts/${encodeURIComponent(digits10(n.phone))}`} title="View this number's full call history" className="ml-auto inline-flex items-center gap-1 text-slate-400 transition hover:text-brand"><History className="h-3.5 w-3.5" /> History</Link>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// One-at-a-time manual add: creates a property + a single dialable contact in the active workspace.
function AddContactModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', street: '', city: '', state: '', zip: '', property_ref: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr(''); setBusy(true);
    try { await opm.addContact(form); onSaved(); }
    catch (e: any) { setErr(e?.message || 'Could not add contact.'); } finally { setBusy(false); }
  };
  const f = (k: string, label: string, ph = '', cls = '') => (
    <label className={`block ${cls}`}><span className="label mb-1 block">{label}</span>
      <input className="input w-full" value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph} /></label>
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-bold text-ink"><Plus className="h-5 w-5 text-brand" /> Add contact</h3><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button></div>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">{f('name', 'Name', 'Jane Owner')}{f('phone', 'Phone', '(561) 555-0000')}</div>
          {f('email', 'Email', 'jane@example.com')}
          {f('street', 'Street address', '123 Main St')}
          <div className="grid grid-cols-3 gap-2">{f('city', 'City')}{f('state', 'State')}{f('zip', 'ZIP')}</div>
          {f('property_ref', 'Property ref / APN')}
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy || (!form.name && form.phone.replace(/\D/g, '').length < 10)} onClick={save}>{busy ? 'Saving…' : <><Plus className="h-4 w-4" /> Add contact</>}</button>
      </div>
    </div>
  );
}
