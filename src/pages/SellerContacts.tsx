import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { opm, testai, tokenStore, workspaceStore } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import ImportWizard from '../components/ImportWizard';
import CustomFieldsModal from '../components/CustomFieldsModal';
import TagManagerModal from '../components/TagManagerModal';
import SmartLists from '../components/SmartLists';
import {
  PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, MultiSelect, SavedViews, AudioPlayer,
  ColumnDef, SortableHead, useClientTable, ColumnFilterStack, useColumnFilters, SlideOver, ToolbarButton, ColumnsDrawer,
} from '../components/dash';
import { num, dateTime, secs, humanizeDisposition, dispositionColor, dispositionIconName } from '../lib/format';
import { statusColor, statusIconName } from '../lib/statuses';
import { StageIcon } from '../lib/statusIcons';
import { Contact, Phone, BadgeCheck, Layers, Search, X, Download, ChevronLeft, ChevronRight, ChevronDown, Smartphone, PhoneOutgoing, Loader2, CheckCircle2, AlertCircle, Upload, Plus, SlidersHorizontal, Trash2, History, Star, UserCheck, Tag, Filter } from 'lucide-react';

const PAGE_KEY = 'opm-crm';
const PAGE_SIZE = 50;

// AI dialing — Adrian B aggressive outbound agent + rotating caller IDs (matches LeadDetail launcher)
const DIAL_AGENT = { id: 'agent_ee77a9e3c659964acc19d0be54', name: 'Adrian B (Aggressive) · OUTBOUND' };
// Retell workspace whose key places these outbound calls (also where its agents live).
const DIAL_WORKSPACE = '1propertymarket';
const DIAL_NUMBERS = ['+18563634757', '+18563634758', '+18563634759', '+18563634760', '+18563634761', '+18563634762'];

function fmtNum(n: string) {
  const d = (n || '').replace(/\D/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}
const digits10 = (n: string) => String(n || '').replace(/\D/g, '').slice(-10);

// Last-communication resolver (opm-campaign `last_calls`): lead_id -> most recent call
// { date, duration_seconds, recording_url, disposition, direction }. Scoped to the active workspace.
const CAMPAIGN_BASE =
  (import.meta as any).env?.VITE_OPMCAMPAIGN_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-campaign') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-campaign');
async function fetchLastCalls(): Promise<Record<string, any>> {
  const url = new URL(CAMPAIGN_BASE); url.searchParams.set('action', 'last_calls');
  const ws = workspaceStore.get(); if (ws) url.searchParams.set('workspace', ws);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = tokenStore.get(); if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(url.toString(), { method: 'POST', headers, body: JSON.stringify({}) });
  const d = await res.json().catch(() => ({}));
  return d.map || {};
}

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
  { key: 'last_comm', label: 'Last comm', sortKey: 'last_comm' },
  { key: 'last_duration', label: 'Duration', align: 'right', sortKey: 'last_duration' },
  { key: 'last_rec', label: 'Recording' },
  { key: 'last_disp', label: 'Last disposition', sortKey: 'last_disp' },
  { key: 'tags', label: 'Tags', sortKey: 'tags' },
];

type ViewCfg = { pipelineId: string; stageId: string; verified: string; tags: string[]; search: string; sort: any };

export default function SellerContacts() {
  const nav = useNavigate();
  const { isStaff, ownsActive, active, setActive, roles } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contactRows, setContactRows] = useState<any[]>([]);
  const [leadRows, setLeadRows] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [verified, setVerified] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // Last-interaction (most recent call) filters: date range (YYYY-MM-DD, inclusive) + direction.
  const [commFrom, setCommFrom] = useState('');
  const [commTo, setCommTo] = useState('');
  const [commDir, setCommDir] = useState(''); // '' | 'inbound' | 'outbound' | 'none' (never contacted)
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [showTags, setShowTags] = useState(false);
  // GHL-style tuck-away drawers for the filter + column controls (keeps the page compact).
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);

  // ---- Bulk AI caller → tracked Campaign ----
  const [callModal, setCallModal] = useState(false);
  // Selectable AI voice agent for this batch (defaults to the outbound Adrian agent).
  const [agents, setAgents] = useState<{ agent_id: string; agent_name: string }[]>([]);
  const [agentId, setAgentId] = useState(DIAL_AGENT.id);
  const [campaignName, setCampaignName] = useState('');
  const [drip, setDrip] = useState(false);
  const [dripBatch, setDripBatch] = useState(25);
  const [dripMinutes, setDripMinutes] = useState(30);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ id?: string; launched: number; total: number; pending: number; name: string } | null>(null);
  // Bumped after an import so the SmartLists dropdown remounts and picks up a freshly created list.
  const [smartKey, setSmartKey] = useState(0);
  // Select-all-across-pages: when set, `selected` holds the FULL server-resolved matching set.
  const [matchAll, setMatchAll] = useState(false);
  const [resolving, setResolving] = useState(false);

  // ---- Bulk assignment (owner/admin/manager) ----
  const [assignOpen, setAssignOpen] = useState(false);
  const [members, setMembers] = useState<{ user_id: number; name: string | null; email: string | null; workspace_role: string; lead_scope: string }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignToast, setAssignToast] = useState('');
  // Owner / admin / manager may reassign; scoped reps never see the control (server also enforces).
  const canAssign = isStaff || ownsActive || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);
  const openAssign = () => {
    setAssignUserId(null); setAssignOpen(true); setMembersLoading(true);
    opm.workspaceMembers().then((d: any) => setMembers(d.members || [])).catch(() => setMembers([])).finally(() => setMembersLoading(false));
  };
  async function doAssign() {
    if (assigning || !assignUserId || selected.size === 0) return;
    setAssigning(true);
    try {
      const r: any = await opm.assignLead({ lead_ids: [...selected], primary_user_id: assignUserId });
      const name = r?.primary_name || members.find((m) => m.user_id === assignUserId)?.name || 'user';
      const skipped = Array.isArray(r?.skipped) ? r.skipped.length : 0;
      setAssignToast(`Assigned ${r?.assigned ?? 0} record${(r?.assigned ?? 0) === 1 ? '' : 's'} to ${name}${skipped ? ` · ${skipped} skipped` : ''}.`);
      setAssignOpen(false); setSelected(new Set()); setMatchAll(false);
      await load();
      setTimeout(() => setAssignToast(''), 6000);
    } catch (e: any) {
      const msg = String(e?.message || '');
      window.alert(/forbidden/i.test(msg) ? 'You do not have permission to reassign leads in this workspace.' : (msg || 'Could not assign the selected records.'));
    } finally { setAssigning(false); }
  }

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      opm.sellerContacts().then((d) => setContactRows(d.contacts || [])).catch(() => setContactRows([])),
      opm.leads({}).then((d) => setLeadRows(d.leads || [])).catch(() => setLeadRows([])),
      opm.pipelines().then((d) => setPipelines(d.pipelines || [])).catch(() => setPipelines([])),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Once fresh lead data lands (import/assign/delete → load()), drop optimistic stage overrides.
  useEffect(() => { setStageOverrides({}); }, [leadRows]);

  const loadFields = useCallback(() => { opm.customFields().then((d: any) => setCustomFields(d.fields || [])).catch(() => setCustomFields([])); }, []);
  useEffect(() => { loadFields(); }, [loadFields]);

  // Last communication per record (date / duration / recording / disposition), for the new columns
  // and the lead-detail block. Re-fetched when the workspace changes or contacts (re)load.
  const [lastCalls, setLastCalls] = useState<Record<string, any>>({});
  useEffect(() => { fetchLastCalls().then(setLastCalls).catch(() => setLastCalls({})); }, [active, contactRows.length]);

  // Deep link from a campaign ("Show all leads for this campaign"): ?tag=campaign:<slug>&ws=<slug>.
  // Switch to that workspace (if allowed) and pre-apply the campaign tag filter, then clear the params.
  useEffect(() => {
    const tag = searchParams.get('tag'); const ws = searchParams.get('ws');
    if (!tag && !ws) return;
    if (ws && ws !== active) setActive(ws);
    if (tag) setTagFilter([tag]);
    setSearchParams({}, { replace: true });
  }, [searchParams, active, setActive, setSearchParams]);

  // Load the dial workspace's agents so the bulk launcher can pick which AI voice agent calls.
  useEffect(() => {
    testai.agents(DIAL_WORKSPACE).then((d) => {
      const list = d.agents || [];
      setAgents(list);
      if (list.length && !list.some((a: any) => a.agent_id === DIAL_AGENT.id)) setAgentId(list[0].agent_id);
    }).catch(() => {});
  }, []);

  const pipeName = useMemo(() => Object.fromEntries(pipelines.map((p) => [p.id, p.name])), [pipelines]);

  // Stage taxonomy: the "Standard 1PM Pipeline" is the canonical board whose 20 stages match the
  // call-disposition set 1:1 (see src/lib/statuses.ts). The Stage column renders + is edited against it,
  // so a lead's stage reads the same vocabulary as its Call History dispositions.
  const stdPipeline = useMemo(() => pipelines.find((p: any) => p.name === 'Standard 1PM Pipeline') || null, [pipelines]);
  const stdStages = useMemo<any[]>(() => (stdPipeline?.stages || []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [stdPipeline]);
  const stageNameById = useMemo(() => {
    const m: Record<string, string> = {};
    pipelines.forEach((p: any) => (p.stages || []).forEach((s: any) => { m[String(s.id)] = s.name; }));
    return m;
  }, [pipelines]);
  // Stages of a given pipeline (sorted). Used so the inline Stage selector offers the lead's OWN
  // pipeline's stages — a Pitman lead picks Pitman stages; a Standard lead picks the 20 standard ones.
  const stagesByPipeline = useMemo(() => {
    const m: Record<string, any[]> = {};
    pipelines.forEach((p: any) => { m[String(p.id)] = (p.stages || []).slice().sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)); });
    return m;
  }, [pipelines]);
  // Optimistic per-lead stage edits (applied over the loaded data until the next refresh).
  const [stageOverrides, setStageOverrides] = useState<Record<string, { id: number | null; name: string }>>({});
  // Resolve a record's current stage → { id, name } honoring any optimistic override, then stage_id, then legacy crm_stage text.
  const stageOf = useCallback((r: any): { id: number | null; name: string } => {
    const ov = stageOverrides[r.lead_id];
    if (ov) return ov;
    if (r.stage_id != null && stageNameById[String(r.stage_id)]) return { id: r.stage_id, name: stageNameById[String(r.stage_id)] };
    return { id: r.stage_id ?? null, name: r.crm_stage || '' };
  }, [stageOverrides, stageNameById]);
  const changeStage = useCallback(async (r: any, val: string) => {
    const stage_id = val ? Number(val) : null;
    const name = stage_id != null ? (stageNameById[val] || '') : '';
    // Move within the lead's OWN pipeline; fall back to the Standard pipeline when it has none.
    const pipeline_id = r.pipeline_id ?? stdPipeline?.id ?? null;
    const prev = stageOverrides[r.lead_id];
    setStageOverrides((s) => ({ ...s, [r.lead_id]: { id: stage_id, name } }));
    try {
      await opm.moveLead({ lead_id: r.lead_id, stage_id, pipeline_id });
    } catch (e: any) {
      setStageOverrides((s) => { const n = { ...s }; if (prev) n[r.lead_id] = prev; else delete n[r.lead_id]; return n; });
      window.alert(e?.message || 'Could not update the stage.');
    }
  }, [stageNameById, stdPipeline, stageOverrides]);

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

  // Inclusive [from 00:00, to 23:59:59.999] epoch bounds for the last-interaction date filter.
  const commFromMs = useMemo(() => (commFrom ? new Date(commFrom + 'T00:00:00').getTime() : null), [commFrom]);
  const commToMs = useMemo(() => (commTo ? new Date(commTo + 'T23:59:59.999').getTime() : null), [commTo]);

  const preFiltered = useMemo(() => records.filter((r) => {
    if (pipelineId && String(r.pipeline_id) !== pipelineId) return false;
    if (stageId && String(r.stage_id) !== stageId) return false;
    if (verified === 'yes' && !r.hasVerified) return false;
    if (verified === 'no' && r.hasVerified) return false;
    if (tagFilter.length && !tagFilter.every((t) => (r.tags || []).includes(t))) return false;
    // Last-interaction filters (most recent call for the record).
    if (commDir || commFromMs != null || commToMs != null) {
      const lc = lastCalls[r.lead_id];
      if (commDir === 'none') { if (lc) return false; }
      else {
        if (!lc || !lc.date) return false;
        if (commDir && commDir !== 'inbound' && commDir !== 'outbound') { /* ignore unknown */ }
        else if (commDir && (lc.direction || 'outbound') !== commDir) return false;
        const t = new Date(lc.date).getTime();
        if (commFromMs != null && t < commFromMs) return false;
        if (commToMs != null && t > commToMs) return false;
      }
    }
    return true;
  }), [records, pipelineId, stageId, verified, tagFilter, lastCalls, commDir, commFromMs, commToMs]);

  const getValue = useCallback((r: any, key: string): string | number => {
    switch (key) {
      case 'name': return r.lead_name || '';
      case 'numbers': return r.numbersCount || 0;
      case 'property': return `${r.property_ref || ''} ${r.address || ''}`;
      case 'crm_stage': return stageOf(r).name || '';
      case 'pipeline': return r.pipeline_name || '';
      case 'deal_price': return Number(r.deal_price) || 0;
      case 'lead_source': return r.lead_source || '';
      case 'assigned_to': return r.assigned_to || '';
      case 'tags': return (r.tags || []).join(' ');
      // Last-communication columns are sourced from the separate lastCalls map (keyed by lead_id).
      // Dates/durations return numbers so they SORT chronologically/numerically; disposition is text.
      case 'last_comm': { const lc = lastCalls[r.lead_id]; return lc?.date ? new Date(lc.date).getTime() : 0; }
      case 'last_duration': { const lc = lastCalls[r.lead_id]; return lc ? Number(lc.duration_seconds || 0) : -1; }
      case 'last_disp': { const lc = lastCalls[r.lead_id]; return lc?.disposition ? String(lc.disposition) : ''; }
      // hidden search-only key: every phone number's digits, so search matches phones too
      case '__phones': return (r.numbers || []).map((n: any) => (n.phone || '').replace(/\D/g, '')).join(' ');
      default: return key.startsWith('cf_lead_') ? cfValue(r, key) : '';
    }
  }, [cfValue, lastCalls, stageOf]);

  const visibleColumns = useMemo<ColumnDef[]>(() => [...COLUMNS, ...customCols], [customCols]);
  // Include a hidden "__phones" column so useClientTable's search also scans phone digits.
  const searchColumns = useMemo<ColumnDef[]>(() => [...visibleColumns, { key: '__phones', label: '' }], [visibleColumns]);

  // Per-column filter stack (GHL-style): choose any column, an operator, a value; stack several and
  // combine them with AND / OR. Filterable set = every column except the audio-only Recording cell.
  const filterCols = useMemo<ColumnDef[]>(() => visibleColumns.filter((c) => c.key !== 'last_rec'), [visibleColumns]);
  const colFilters = useColumnFilters<any>(getValue);

  const { rows, search, setSearch, sort, setSort, isVisible, toggle } = useClientTable<any>({
    pageKey: PAGE_KEY, columns: searchColumns, rows: preFiltered, getValue, initialSort: { by: 'name', dir: 'asc' }, rowFilter: colFilters.predicate,
  });

  useEffect(() => { setPage(1); setMatchAll(false); }, [pipelineId, stageId, verified, tagFilter, search, sort, commFrom, commTo, commDir, colFilters.conds, colFilters.combinator]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const orderedIds = useMemo(() => rows.map((r) => r.lead_id), [rows]);
  // Count of applied filters (excludes the always-visible toolbar search) → badge on the Filters button.
  const activeFilterCount = (pipelineId ? 1 : 0) + (stageId ? 1 : 0) + (verified ? 1 : 0) + tagFilter.length + ((commDir || commFrom || commTo) ? 1 : 0) + colFilters.activeCount;
  const clearAllFilters = () => { setPipelineId(''); setStageId(''); setVerified(''); setTagFilter([]); setCommFrom(''); setCommTo(''); setCommDir(''); colFilters.clear(); };

  const dialableNumbers = records.reduce((s, r) => s + r.numbersCount, 0);
  const verifiedNumbers = records.reduce((s, r) => s + r.verifiedCount, 0);
  const inPipeline = records.filter((r) => r.pipeline_id != null).length;

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.lead_id));
  const toggleAll = () => { setMatchAll(false); setSelected((s) => { const n = new Set(s); if (allOnPage) pageRows.forEach((r) => n.delete(r.lead_id)); else pageRows.forEach((r) => n.add(r.lead_id)); return n; }); };
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
    src.forEach((r, i) => lines.push([i + 1, r.lead_name, r.numbersCount, r.primary ? r.primary.phone : '', r.property_ref, r.address, stageOf(r).name, r.pipeline_name, r.deal_price || '', r.lead_source, r.assigned_to, (r.tags || []).join('; '), r.lead_id].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  // Lead ids currently selected for a campaign launch. campaign_launch resolves each lead's
  // primary dialable number server-side (skipping do-not-call), so we only pass ids here.
  const selectedLeadIds = useMemo(() => [...selected], [selected]);

  // "Select all N matching" — resolve the FULL filtered set server-side (not just the loaded page),
  // so launch/export operate on every matching record. Uses the same filters as the table.
  async function selectAllMatching() {
    if (resolving) return;
    setResolving(true);
    try {
      const d = await opm.resolveSelection({
        pipeline_id: pipelineId || undefined, stage_id: stageId || undefined,
        verified: verified || undefined, tags: tagFilter.length ? tagFilter.join(',') : undefined,
        search: search || undefined,
      });
      setSelected(new Set<string>(d.lead_ids || []));
      setMatchAll(true);
    } catch (e: any) {
      window.alert(e?.message || 'Could not resolve the full matching set.');
    } finally { setResolving(false); }
  }

  // Launch the selected leads as ONE tracked campaign (tags each lead, places the first batch,
  // and drips the rest if configured). Backend picks each lead's primary dialable number.
  async function launchCampaign() {
    if (launching || selectedLeadIds.length === 0 || !agentId || !campaignName.trim()) return;
    setLaunching(true); setLaunchResult(null);
    try {
      const agentName = agents.find((a) => a.agent_id === agentId)?.agent_name || DIAL_AGENT.name;
      const r = await opm.campaignLaunch({
        name: campaignName.trim(), agent_id: agentId, agent_name: agentName, lead_ids: selectedLeadIds,
        drip_batch: drip ? dripBatch : null, drip_minutes: drip ? dripMinutes : null,
      });
      setLaunchResult({ id: r?.campaign?.id, launched: r?.launched || 0, total: r?.total || selectedLeadIds.length, pending: r?.pending || 0, name: campaignName.trim() });
    } catch (e: any) {
      window.alert(e?.message || 'Could not launch the campaign.');
    } finally { setLaunching(false); }
  }

  // Everyone with a workspace in view can add contacts, import CSVs, and manage custom fields —
  // imports always target the workspace currently in view (never a phantom filename workspace).
  const canImport = isStaff || !!active;
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
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-surface" onClick={() => setShowTags(true)}>
              <Tag className="h-4 w-4" /> Manage tags
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

      {showImport && <ImportWizard onClose={() => { setShowImport(false); load(); setSmartKey((k) => k + 1); }} lockedWorkspace={active || undefined} />}
      {showAdd && <AddContactModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {showFields && <CustomFieldsModal onClose={() => setShowFields(false)} onChanged={loadFields} />}
      {showTags && <TagManagerModal onClose={() => setShowTags(false)} onChanged={() => load()} />}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Records" value={num(records.length)} sub="one per seller / property" icon={Contact} accent="blue" />
        <KpiCard label="Dialable Numbers" value={num(dialableNumbers)} sub="across all records" icon={Phone} accent="green" />
        <KpiCard label="Verified Numbers" value={num(verifiedNumbers)} sub="confirmed working" icon={BadgeCheck} accent="amber" />
        <KpiCard label="In a Pipeline" value={num(inPipeline)} sub="assigned to a board" icon={Layers} />
      </div>

      {/* Compact toolbar — filters + columns tuck away into right-side drawers (GHL-style). */}
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-2.5">
        <ToolbarButton icon={Filter} label="Filters" count={activeFilterCount} active={activeFilterCount > 0} onClick={() => setShowFilters(true)} />
        {activeFilterCount > 0 && <button className="text-xs font-semibold text-slate-400 hover:text-red-600" onClick={clearAllFilters}>Clear</button>}
        <span className="text-xs text-slate-500">{total.toLocaleString()} record{total === 1 ? '' : 's'}</span>
        <div className="relative ml-auto w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, property, phone, source…" className="input w-full pl-8 sm:w-[280px]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <SmartLists<ViewCfg> key={smartKey} page="crm" current={currentCfg} onApply={applyView} />
        <SavedViews<ViewCfg> pageKey={PAGE_KEY} current={currentCfg} onApply={applyView} />
        <ToolbarButton icon={SlidersHorizontal} label="Columns" onClick={() => setShowColumns(true)} />
      </div>

      {/* Filters drawer — every filter control stacked in a narrow panel instead of edge-to-edge. */}
      <SlideOver open={showFilters} onClose={() => setShowFilters(false)} title="Filters" subtitle={`${total.toLocaleString()} record${total === 1 ? '' : 's'} match`} icon={Filter}
        footer={<div className="flex items-center justify-between">
          <button className="btn-ghost !py-1.5" disabled={activeFilterCount === 0} onClick={clearAllFilters}><X className="h-3.5 w-3.5" /> Clear all</button>
          <button className="btn-primary !py-1.5" onClick={() => setShowFilters(false)}>Done</button>
        </div>}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="label mb-1 block">Pipeline</label>
            <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId(''); }} className="input w-full !py-1.5 text-sm">
              <option value="">All pipelines</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Stage</label>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="input w-full !py-1.5 text-sm">
              <option value="">All stages</option>
              {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.leadCount})</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Number status</label>
            <select value={verified} onChange={(e) => setVerified(e.target.value)} className="input w-full !py-1.5 text-sm">
              <option value="">Any number status</option><option value="yes">Has verified number</option><option value="no">No verified number</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Tags</label>
            <MultiSelect options={allTags} value={tagFilter} onChange={setTagFilter} placeholder="All tags" width={360} />
          </div>

          <div className="border-t border-line pt-4">
            <label className="label mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Last interaction</label>
            <select value={commDir} onChange={(e) => setCommDir(e.target.value)} className="input mb-2 w-full !py-1.5 text-sm">
              <option value="">Any interaction</option>
              <option value="outbound">Outbound (we called)</option>
              <option value="inbound">Inbound (they called)</option>
              <option value="none">Never contacted</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-500">From
                <input type="date" value={commFrom} onChange={(e) => setCommFrom(e.target.value)} disabled={commDir === 'none'} className="input mt-1 w-full !py-1.5 text-sm disabled:opacity-50" />
              </label>
              <label className="text-xs font-semibold text-slate-500">To
                <input type="date" value={commTo} onChange={(e) => setCommTo(e.target.value)} disabled={commDir === 'none'} className="input mt-1 w-full !py-1.5 text-sm disabled:opacity-50" />
              </label>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <ColumnFilterStack columns={filterCols} ctrl={colFilters} />
          </div>
        </div>
      </SlideOver>

      <ColumnsDrawer open={showColumns} onClose={() => setShowColumns(false)} columns={visibleColumns} isVisible={isVisible} onToggle={toggle} />

      {selected.size > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand-light/50 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-brand">{selected.size} selected{matchAll ? ' (all matching)' : ''}</span>
            <span className="mx-1 h-4 w-px bg-brand/20" />
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90" onClick={() => { setLaunchResult(null); setCampaignName(''); setCallModal(true); }}><PhoneOutgoing className="h-3.5 w-3.5" /> Launch AI calls</button>
            {canAssign && <button className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-white px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light" onClick={openAssign}><UserCheck className="h-3.5 w-3.5" /> Assign to…</button>}
            <button className="btn-ghost !py-1.5" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export selected</button>
            {canManage && <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={deleting} onClick={bulkDelete}>{deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete</button>}
            <button className="btn-ghost !py-1.5" onClick={() => { setMatchAll(false); setSelected(new Set()); }}>Clear</button>
          </div>
          {/* Select-all-across-pages: appears once the current page is fully checked and more rows match. */}
          {allOnPage && !matchAll && total > pageRows.length && (
            <div className="flex flex-wrap items-center gap-2 border-t border-brand/15 pt-2 text-sm">
              <span className="text-slate-600">All {pageRows.length} on this page selected.</span>
              <button className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline disabled:opacity-50" disabled={resolving} onClick={selectAllMatching}>{resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Select all {num(total)} matching</button>
            </div>
          )}
          {matchAll && (
            <div className="border-t border-brand/15 pt-2 text-sm text-slate-600">All {num(selected.size)} matching records are selected. <button className="font-semibold text-brand hover:underline" onClick={() => { setMatchAll(false); setSelected(new Set()); }}>Clear selection</button></div>
          )}
        </div>
      )}

      {callModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !launching && setCallModal(false)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><PhoneOutgoing className="h-5 w-5 text-brand" /> Launch AI calls as a campaign</h3>
              {!launching && <button onClick={() => setCallModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>}
            </div>

            {launchResult ? (
              <>
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Campaign "{launchResult.name}" launched</div>
                  <div className="mt-2 text-slate-600">{launchResult.launched} of {launchResult.total} call{launchResult.total === 1 ? '' : 's'} placed{launchResult.pending > 0 ? ` · ${launchResult.pending} queued for drip` : ''}. Each launched lead is tagged and tracked.</div>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => { setCallModal(false); setSelected(new Set()); setMatchAll(false); }}>Close</button>
                  {launchResult.id && <button className="btn-primary" onClick={() => nav(`/campaigns/${launchResult.id}`)}>View campaign</button>}
                </div>
              </>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  This launches a tracked campaign that places <span className="font-bold text-ink">{launching ? '' : selectedLeadIds.length}</span> live AI call{selectedLeadIds.length === 1 ? '' : 's'} to real sellers using <span className="font-semibold">{agents.find((a) => a.agent_id === agentId)?.agent_name || DIAL_AGENT.name}</span>. Each lead's primary number is dialed with its property context, and every lead is tagged <code className="rounded bg-surface px-1 text-[11px]">campaign:…</code>.
                </p>
                <label className="mb-3 block text-xs font-semibold text-slate-500">Campaign name
                  <input autoFocus value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Miami Off-Market — August" className="input mt-1 w-full !py-1.5 text-sm text-ink" />
                </label>
                <label className="mb-3 block text-xs font-semibold text-slate-500">AI voice agent
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                    {!agents.length && <option value={DIAL_AGENT.id}>{DIAL_AGENT.name}</option>}
                    {agents.length > 0 && !agents.some((a) => a.agent_id === agentId) && <option value="">Select an agent…</option>}
                    {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
                  </select>
                </label>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={drip} onChange={(e) => setDrip(e.target.checked)} className="h-4 w-4 accent-[#1f6feb]" /> Drip the calls in batches</label>
                {drip && (
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <label className="text-xs font-semibold text-slate-500">Batch size
                      <input type="number" min={1} value={dripBatch} onChange={(e) => setDripBatch(Math.max(1, Number(e.target.value) || 1))} className="input mt-1 w-full !py-1.5 text-sm text-ink" /></label>
                    <label className="text-xs font-semibold text-slate-500">Every N minutes
                      <input type="number" min={2} value={dripMinutes} onChange={(e) => setDripMinutes(Math.max(2, Number(e.target.value) || 2))} className="input mt-1 w-full !py-1.5 text-sm text-ink" /></label>
                  </div>
                )}
                <div className="mb-4 text-xs text-slate-400">{drip ? `First ${Math.min(dripBatch, selectedLeadIds.length)} call${Math.min(dripBatch, selectedLeadIds.length) === 1 ? '' : 's'} go out now; the rest drip automatically every ${dripMinutes} min.` : 'All calls are placed now. Leads without a dialable primary number are skipped.'}</div>
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setCallModal(false)}>Cancel</button>
                  <button disabled={launching || selectedLeadIds.length === 0 || !agentId || !campaignName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" onClick={launchCampaign}>{launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOutgoing className="h-4 w-4" />} Launch {drip ? Math.min(dripBatch, selectedLeadIds.length) : selectedLeadIds.length} now</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {assignToast && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {assignToast}</div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !assigning && setAssignOpen(false)}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><UserCheck className="h-5 w-5 text-brand" /> Assign to a team member</h3>
              {!assigning && <button onClick={() => setAssignOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>}
            </div>
            <p className="mb-3 text-sm text-slate-600">Set the <span className="font-semibold text-ink">primary owner</span> for the <span className="font-bold text-ink">{selected.size}</span> selected record{selected.size === 1 ? '' : 's'}{matchAll ? ' (all matching)' : ''}. This replaces any existing primary and is logged to each lead's activity.</p>
            {membersLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading team members…</div>
            ) : members.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface px-3 py-4 text-sm text-slate-500">No assignable members found for this workspace.</div>
            ) : (
              <label className="mb-4 block text-xs font-semibold text-slate-500">Primary owner
                <select value={assignUserId ?? ''} onChange={(e) => setAssignUserId(e.target.value ? Number(e.target.value) : null)} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                  <option value="">Select a member…</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email || `User ${m.user_id}`}{m.workspace_role && m.workspace_role !== 'member' ? ` · ${m.workspace_role}` : ''}</option>)}
                </select>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setAssignOpen(false)} disabled={assigning}>Cancel</button>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" disabled={assigning || !assignUserId || selected.size === 0} onClick={doAssign}>{assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Assign {selected.size} record{selected.size === 1 ? '' : 's'}</button>
            </div>
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
                        {isVisible('crm_stage') && (() => {
                          const st = stageOf(r);
                          const color = statusColor(st.name) || '#64748b';
                          // Offer the lead's OWN pipeline's stages (Pitman lead → Pitman stages);
                          // fall back to the Standard 20 when the lead has no pipeline yet.
                          const rowStages = stagesByPipeline[String(r.pipeline_id)] || stdStages;
                          const inRow = rowStages.some((s: any) => String(s.id) === String(st.id));
                          return (
                            <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1 hover:border-brand/40" title="Set stage">
                                <StageIcon name={statusIconName(st.name)} color={color} className="h-3.5 w-3.5 shrink-0" />
                                <select value={st.id != null ? String(st.id) : ''} onChange={(e) => changeStage(r, e.target.value)}
                                  className="max-w-[150px] cursor-pointer border-0 bg-transparent p-0 pr-4 text-xs font-semibold focus:outline-none focus:ring-0"
                                  style={{ color }}>
                                  <option value="">— No stage —</option>
                                  {/* Preserve the current stage as an option if it isn't in the listed set. */}
                                  {!inRow && st.name && <option value={st.id != null ? String(st.id) : ''}>{st.name}</option>}
                                  {rowStages.map((s: any) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                                </select>
                              </div>
                            </td>
                          );
                        })()}
                        {isVisible('pipeline') && <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{r.pipeline_name || '—'}</td>}
                        {isVisible('deal_price') && <td className="px-3 py-2.5 text-right">{r.deal_price ? `$${num(r.deal_price)}` : '—'}</td>}
                        {isVisible('lead_source') && <td className="max-w-[150px] truncate px-3 py-2.5 text-xs text-slate-500">{r.lead_source || '—'}</td>}
                        {isVisible('assigned_to') && <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.assigned_to || '—'}</td>}
                        {isVisible('last_comm') && (() => { const lc = lastCalls[r.lead_id]; return <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">{lc?.date ? <>{dateTime(lc.date)}{lc.direction && <span className="ml-1 text-[10px] text-slate-400">{lc.direction === 'inbound' ? '↙' : '↗'}</span>}</> : <span className="text-slate-300">—</span>}</td>; })()}
                        {isVisible('last_duration') && (() => { const lc = lastCalls[r.lead_id]; return <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-600">{lc ? secs(Number(lc.duration_seconds || 0)) : <span className="text-slate-300">—</span>}</td>; })()}
                        {isVisible('last_rec') && (() => { const lc = lastCalls[r.lead_id]; return <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>{lc?.recording_url ? <AudioPlayer src={lc.recording_url} compact /> : <span className="text-xs text-slate-300">—</span>}</td>; })()}
                        {isVisible('last_disp') && (() => { const lc = lastCalls[r.lead_id]; return <td className="whitespace-nowrap px-3 py-2.5">{lc?.disposition ? <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: dispositionColor(lc.disposition) }}><StageIcon name={dispositionIconName(lc.disposition)} color={dispositionColor(lc.disposition)} className="h-3.5 w-3.5" />{humanizeDisposition(lc.disposition)}</span> : <span className="text-xs text-slate-400">—</span>}</td>; })()}
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
