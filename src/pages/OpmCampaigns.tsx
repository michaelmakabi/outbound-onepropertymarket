import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm, testai, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';
import ImportWizard from '../components/ImportWizard';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { Radio, Plus, PhoneOutgoing, Users, CheckCircle2, Loader2, ChevronRight, ChevronLeft, DollarSign, Search, X, ArrowRight, ArrowLeft, Upload, ListFilter, AlertTriangle, Clock, Phone, Timer } from 'lucide-react';

// The Retell dialer workspace whose agents/keys place these outbound calls (matches the bulk launcher).
const DIAL_WORKSPACE = '1propertymarket';
const LEADS_PAGE_SIZE = 50;

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', launching: 'bg-blue-100 text-blue-700',
  dripping: 'bg-amber-100 text-amber-700', throttled: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700', paused: 'bg-slate-200 text-slate-600',
};

// Shared, generously-sized button styles for the launch wizard footer + actions.
const BTN_GHOST = 'inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-40';
const BTN_PRIMARY = 'inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-40';

// Guiding copy shown at the top of every wizard step so the user always knows what to do next.
const STEP_INTRO: { title: string; desc: string }[] = [
  { title: 'Choose a workspace', desc: 'Pick which workspace this campaign belongs to. Its leads, tags and analytics are all scoped here.' },
  { title: 'Pick your AI voice agent', desc: 'Select the AI agent that will place and handle every call in this campaign.' },
  { title: 'Build your call list', desc: 'Add leads with a smart list, search & select, or import a fresh file. Then choose how many numbers to dial per lead.' },
  { title: 'Name it & review', desc: 'Give the campaign a name and review the projected calls, cost and timing before you launch.' },
];

export default function OpmCampaigns() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const { workspaces } = useWorkspace();

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wsFilter, setWsFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [wizard, setWizard] = useState(false);
  const [dripBusy, setDripBusy] = useState(false);

  const wsName = useMemo(() => Object.fromEntries((workspaces || []).map((w: any) => [w.slug, w.display_name])), [workspaces]);

  const load = useCallback(() => {
    setLoading(true); setError('');
    opm.campaignsList({ workspace: wsFilter || undefined, from: from || undefined, to: to || undefined })
      .then((d: any) => setRows(d.campaigns || []))
      .catch((e: any) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [wsFilter, from, to]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let cost = 0, launched = 0, answered = 0, completed = 0;
    for (const c of rows) { const r = c.rollup || {}; cost += r.cost_cents || 0; launched += r.launched || 0; answered += r.answered || 0; completed += r.completed || 0; }
    return { cost, launched, answered, completed, count: rows.length };
  }, [rows]);

  const runDrip = async () => {
    setDripBusy(true);
    try { await opm.campaignDripRun(); await load(); } catch (e: any) { setError(String(e?.message || e)); } finally { setDripBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Campaigns" description="Every AI-calling campaign, its drip progress, cost and outcomes — in one place" showDate={false}
        actions={isSuper ? <button className="btn-primary" onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> New campaign</button> : undefined} />

      {error && <div className="card mb-5 border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Campaigns" value={num(totals.count)} icon={Radio} accent="blue" />
        <KpiCard label="Calls launched" value={num(totals.launched)} sub={`${num(totals.answered)} answered`} icon={PhoneOutgoing} accent="green" />
        <KpiCard label="Calls completed" value={num(totals.completed)} icon={CheckCircle2} accent="amber" />
        <KpiCard label="Total spend" value={fmt.money(totals.cost / 100)} sub="across shown campaigns" icon={DollarSign} />
      </div>

      {(isSuper || (workspaces || []).length > 1) && (
        <SectionCard title="Filters" description="Narrow campaigns by workspace and creation date" className="mb-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">Workspace
              <select value={wsFilter} onChange={(e) => setWsFilter(e.target.value)} className="input mt-1 block !py-1.5 text-sm">
                <option value="">{isSuper ? 'All workspaces' : 'All my workspaces'}</option>
                {(workspaces || []).map((w: any) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-1 block !py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500">To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-1 block !py-1.5 text-sm" />
            </label>
            {(wsFilter || from || to) && <button className="btn-ghost !py-1.5" onClick={() => { setWsFilter(''); setFrom(''); setTo(''); }}><X className="h-3.5 w-3.5" /> Clear</button>}
            {isSuper && <button className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-50" disabled={dripBusy} onClick={runDrip} title="Advance any due drip batches now">{dripBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneOutgoing className="h-3.5 w-3.5" />} Process drips</button>}
          </div>
        </SectionCard>
      )}

      <SectionCard title="All campaigns" description={loading ? 'Loading…' : `${rows.length} campaign${rows.length === 1 ? '' : 's'}`}>
        {loading ? <LoadingBlock label="Loading campaigns…" /> : rows.length === 0 ? <EmptyState text="No campaigns yet. Launch one from Contacts (select leads → Launch AI calls) or the New campaign wizard." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Campaign</th>
                  {isSuper && <th className="px-3 py-2">Workspace</th>}
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Progress</th>
                  <th className="px-3 py-2 text-right">Answered</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const r = c.rollup || {};
                  const total = r.total || c.total_leads || 0;
                  const launched = r.launched || c.launched_count || 0;
                  return (
                    <tr key={c.id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/campaigns/${c.id}`)}>
                      <td className="px-3 py-2.5"><span className="font-semibold text-ink">{c.name}</span><div className="text-[11px] text-slate-400">{c.slug}</div></td>
                      {isSuper && <td className="px-3 py-2.5 text-slate-600">{wsName[c.workspace] || c.workspace}</td>}
                      <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-600">{c.agent_name || '—'}</td>
                      <td className="px-3 py-2.5"><span className={`pill ${STATUS_PILL[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span>{c.status === 'throttled' ? <div className="text-[10px] text-orange-600">numbers maxed · resumes next day</div> : null}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{num(launched)} / {num(total)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-600">{num(r.answered || 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmt.money((r.cost_cents || 0) / 100)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2.5 text-right"><ChevronRight className="h-4 w-4 text-slate-300" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {wizard && <LaunchWizard workspaces={workspaces || []} onClose={() => setWizard(false)} onLaunched={(id) => { setWizard(false); load(); if (id) nav(`/campaigns/${id}`); }} />}
    </div>
  );
}

/* ---------------- Dialing policy (fixed, read-only) ---------------- */
function DialingPolicyCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Timer className="h-4 w-4 text-brand" /> Dialing policy</div>
      <ul className="space-y-1 text-xs text-slate-600">
        <li className="flex gap-2"><span className="text-brand">•</span> Calls are paced automatically — about <span className="font-semibold text-ink">1 call every 15 seconds</span>.</li>
        <li className="flex gap-2"><span className="text-brand">•</span> Dialing <span className="font-semibold text-ink">rotates across the agent's assigned numbers</span> to stay healthy.</li>
        <li className="flex gap-2"><span className="text-brand">•</span> Each number places at most <span className="font-semibold text-ink">100 calls per day</span>.</li>
        <li className="flex gap-2"><span className="text-brand">•</span> Calls only go out between <span className="font-semibold text-ink">9:00am and 8:00pm</span> in the lead's local time.</li>
        <li className="flex gap-2"><span className="text-brand">•</span> If every number is maxed for the day it <span className="font-semibold text-ink">auto-pauses and resumes the next morning</span> — no action needed.</li>
      </ul>
    </div>
  );
}

/* ---------------- Super-admin launch wizard ---------------- */
function LaunchWizard({ workspaces, onClose, onLaunched }: { workspaces: any[]; onClose: () => void; onLaunched: (id?: string) => void }) {
  const [step, setStep] = useState(0);
  const [ws, setWs] = useState('');
  const [agents, setAgents] = useState<{ agent_id: string; agent_name: string }[]>([]);
  const [agentId, setAgentId] = useState('');

  // Loaded leads for the chosen workspace (source for search+select and the calls estimate).
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);

  // Smart lists (saved views) for this workspace: id -> resolved { ids, count }.
  const [lists, setLists] = useState<any[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listMeta, setListMeta] = useState<Record<string, { ids: string[]; count: number }>>({});
  const [activeLists, setActiveLists] = useState<Set<number>>(new Set());

  // On-the-fly import.
  const [showImport, setShowImport] = useState(false);

  const [dialMode, setDialMode] = useState<'primary' | 'all_numbers'>('primary');
  const [name, setName] = useState('');

  // Pre-flight + projection.
  const [preflight, setPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [projection, setProjection] = useState<any>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);
  const [projectionErr, setProjectionErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Agents come from the shared dialer workspace (where the outbound keys + agents live).
  useEffect(() => { testai.agents(DIAL_WORKSPACE).then((d: any) => { const list = d.agents || []; setAgents(list); if (list.length) setAgentId(list[0].agent_id); }).catch(() => {}); }, []);

  const phoneCountById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) m[l.lead_id] = Number(l.phoneCount) || 0;
    return m;
  }, [leads]);

  // Fetch the workspace leads; returns the array so callers can diff (e.g. after an import).
  const fetchLeads = useCallback((slug: string): Promise<any[]> => {
    setLeadsLoading(true);
    return opm.leads({ workspace: slug }).then((d: any) => { const list = d.leads || []; setLeads(list); return list; }).catch(() => { setLeads([]); return []; }).finally(() => setLeadsLoading(false));
  }, []);

  // Load smart lists for the workspace and resolve each list's matching lead_ids (for count + union).
  const loadLists = useCallback((slug: string) => {
    setListsLoading(true); setLists([]); setListMeta({});
    opm.savedLists('crm', slug).then((d: any) => {
      const ls = d.lists || [];
      setLists(ls);
      ls.forEach((l: any) => {
        const cfg = l.config || {};
        opm.resolveSelection({
          workspace: slug,
          pipeline_id: cfg.pipelineId || undefined,
          stage_id: cfg.stageId || undefined,
          verified: cfg.verified || undefined,
          tags: Array.isArray(cfg.tags) ? (cfg.tags.length ? cfg.tags.join(',') : undefined) : (cfg.tags || undefined),
          search: cfg.search || undefined,
        }).then((r: any) => {
          const ids = r.lead_ids || [];
          setListMeta((m) => ({ ...m, [l.id]: { ids, count: ids.length } }));
        }).catch(() => setListMeta((m) => ({ ...m, [l.id]: { ids: [], count: 0 } })));
      });
    }).catch(() => setLists([])).finally(() => setListsLoading(false));
  }, []);

  const onPickWorkspace = (slug: string) => {
    setWs(slug); setSelected(new Set()); setActiveLists(new Set()); setSearch(''); setPage(1);
    setPreflight(null); setProjection(null);
    if (slug) { fetchLeads(slug); loadLists(slug); } else { setLeads([]); setLists([]); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.property_ref || '').toLowerCase().includes(q));
  }, [leads, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / LEADS_PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * LEADS_PAGE_SIZE, page * LEADS_PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search]);

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // "Select all N matching" — resolve the full search set server-side; fall back to the loaded page's filtered ids.
  const selectAllMatching = async () => {
    if (resolving) return;
    setResolving(true);
    try {
      const d = await opm.resolveSelection({ workspace: ws, search: search || undefined });
      const ids: string[] = d.lead_ids && d.lead_ids.length ? d.lead_ids : filtered.map((l) => l.lead_id);
      setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.add(id)); return n; });
    } catch {
      setSelected((s) => { const n = new Set(s); filtered.forEach((l) => n.add(l.lead_id)); return n; });
    } finally { setResolving(false); }
  };

  const toggleList = (l: any) => {
    const meta = listMeta[l.id];
    if (!meta) return;
    setActiveLists((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; });
    setSelected((s) => {
      const n = new Set(s);
      const on = !activeLists.has(l.id);
      if (on) meta.ids.forEach((id) => n.add(id)); else meta.ids.forEach((id) => n.delete(id));
      return n;
    });
  };

  // Import on the fly: snapshot current ids, let the user import into this workspace, then fold new leads in.
  const [importSnapshot, setImportSnapshot] = useState<Set<string>>(new Set());
  const openImport = () => { setImportSnapshot(new Set(leads.map((l) => l.lead_id))); setShowImport(true); };
  const afterImport = async () => {
    setShowImport(false);
    if (!ws) return;
    const list = await fetchLeads(ws);
    const added = list.map((l) => l.lead_id).filter((id) => !importSnapshot.has(id));
    if (added.length) setSelected((s) => { const n = new Set(s); added.forEach((id) => n.add(id)); return n; });
  };

  const estimatedCalls = useMemo(() => {
    if (dialMode === 'primary') return selected.size;
    let c = 0;
    selected.forEach((id) => { c += Math.max(1, phoneCountById[id] || 1); });
    return c;
  }, [selected, dialMode, phoneCountById]);

  const agentName = agents.find((a) => a.agent_id === agentId)?.agent_name || '';

  // On the Confirm step, pre-flight the agent+numbers and project calls/cost/duration.
  useEffect(() => {
    if (step !== 3 || !ws || !agentId || selected.size === 0) return;
    let cancelled = false;
    setPreflightLoading(true); setPreflight(null);
    opm.campaignPreflight({ workspace: ws, agent_id: agentId })
      .then((d: any) => { if (!cancelled) setPreflight(d); })
      .catch((e: any) => { if (!cancelled) setPreflight({ ok: false, issues: [String(e?.message || e)] }); })
      .finally(() => { if (!cancelled) setPreflightLoading(false); });
    return () => { cancelled = true; };
  }, [step, ws, agentId, selected.size]);

  useEffect(() => {
    if (step !== 3 || !ws || !agentId || selected.size === 0) return;
    let cancelled = false;
    setProjectionLoading(true); setProjection(null); setProjectionErr('');
    opm.campaignProjection({ workspace: ws, agent_id: agentId, lead_ids: [...selected], dial_mode: dialMode, timezone })
      .then((d: any) => { if (!cancelled) setProjection(d); })
      .catch((e: any) => { if (!cancelled) setProjectionErr(String(e?.message || e)); })
      .finally(() => { if (!cancelled) setProjectionLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ws, agentId, dialMode, selected.size]);

  const preflightOk = !!preflight?.ok;

  const launch = async () => {
    if (busy || !preflightOk) return;
    setErr(''); setBusy(true);
    try {
      const r = await opm.campaignLaunch({ workspace: ws, name: name.trim(), agent_id: agentId, agent_name: agentName, lead_ids: [...selected], dial_mode: dialMode, timezone });
      onLaunched(r?.campaign?.id);
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(false); }
  };

  const canNext = [!!ws, !!agentId, selected.size > 0, !!name.trim()][step];
  const steps = ['Workspace', 'Agent', 'Leads', 'Confirm'];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 sm:p-6" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-3xl p-7 shadow-2xl sm:p-9" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-light/50 text-brand"><Radio className="h-6 w-6" /></span>
            <div>
              <h3 className="text-2xl font-extrabold tracking-tight text-ink">New campaign</h3>
              <p className="mt-0.5 text-sm text-slate-500">Set up an AI-calling campaign in four quick steps.</p>
            </div>
          </div>
          {!busy && <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-surface"><X className="h-6 w-6" /></button>}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          {steps.map((s, i) => (
            <span key={s} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${i === step ? 'bg-brand text-white shadow-sm' : i < step ? 'bg-emerald-100 text-emerald-700' : 'border border-line bg-white text-slate-500'}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i === step ? 'bg-white/20 text-white' : i < step ? 'bg-emerald-200 text-emerald-800' : 'bg-surface text-slate-500'}`}>{i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</span>{s}
            </span>
          ))}
        </div>

        {/* Per-step guiding header */}
        <div className="mb-6 rounded-2xl border border-brand/15 bg-brand-light/20 px-5 py-4">
          <div className="text-lg font-bold text-ink">Step {step + 1} of {steps.length} — {STEP_INTRO[step].title}</div>
          <p className="mt-1 text-sm text-slate-600">{STEP_INTRO[step].desc}</p>
        </div>

        {err && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{err}</div>}

        {step === 0 && (
          <div>
            <label className="mb-2 block text-base font-bold text-ink">Workspace to launch for</label>
            <select autoFocus className="input !py-3.5 text-base" value={ws} onChange={(e) => onPickWorkspace(e.target.value)}>
              <option value="">Select a workspace…</option>
              {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
            </select>
            <p className="mt-3 text-sm text-slate-500">Leads, tagging and analytics all scope to this workspace. Calls are placed via the shared 1PropertyMarket dialer.</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <label className="mb-2 block text-base font-bold text-ink">AI voice agent</label>
            <select className="input !py-3.5 text-base" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {!agents.length && <option value="">Loading agents…</option>}
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
            </select>
            <p className="mt-3 text-sm text-slate-500">This agent's script, voice and assigned phone numbers will be used for every call in the campaign.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* Smart-list batch selection */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><ListFilter className="h-4 w-4 text-brand" /> Smart lists {listsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}</div>
              <p className="mb-2.5 text-xs text-slate-500">Tap a saved list to add everyone in it. Tap again to remove them.</p>
              {lists.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-3.5 text-sm text-slate-400">{listsLoading ? 'Loading saved lists…' : 'No saved smart lists in this workspace.'}</div>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {lists.map((l) => {
                    const meta = listMeta[l.id];
                    const on = activeLists.has(l.id);
                    return (
                      <button key={l.id} disabled={!meta} onClick={() => toggleList(l)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${on ? 'border-brand bg-brand text-white shadow-sm' : 'border-line bg-white text-slate-600 hover:bg-surface'}`}>
                        {on ? <CheckCircle2 className="h-4 w-4" /> : <ListFilter className="h-4 w-4" />}
                        {l.name}
                        <span className={`rounded-lg px-2 py-0.5 text-xs ${on ? 'bg-white/20' : 'bg-surface text-slate-500'}`}>{meta ? num(meta.count) : '…'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Search + select with pagination */}
            <div>
              <div className="mb-2 text-sm font-bold text-ink">Search &amp; select leads</div>
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads by name or property…" className="input w-full !py-3 pl-11 text-sm" />
                </div>
                <button className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-brand/30 bg-brand-light/40 px-4 py-3 text-sm font-semibold text-brand hover:bg-brand-light disabled:opacity-50" disabled={resolving || filtered.length === 0} onClick={selectAllMatching}>{resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {resolving ? 'Selecting…' : `Select all ${num(filtered.length)}`}</button>
                <button className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-line px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-surface" onClick={openImport}><Upload className="h-4 w-4" /> Import leads</button>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-line">
                {leadsLoading ? <div className="p-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : pageRows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No leads.</div> : pageRows.map((l) => (
                  <label key={l.lead_id} className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-0 hover:bg-surface">
                    <input type="checkbox" checked={selected.has(l.lead_id)} onChange={() => toggleSel(l.lead_id)} className="h-4 w-4 accent-[#1f6feb]" />
                    <span className="font-medium text-ink">{l.name || '(no name)'}</span>
                    <span className="text-xs text-slate-400">{l.property_ref || ''}</span>
                    <span className="ml-auto text-xs text-slate-400">{l.phoneCount || 0} #</span>
                  </label>
                ))}
              </div>
              {filtered.length > LEADS_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-end gap-2.5 text-sm text-slate-500">
                  <button className="rounded-xl border border-line p-2 hover:bg-surface disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
                  <span className="tabular-nums">Page {page} / {pageCount}</span>
                  <button className="rounded-xl border border-line p-2 hover:bg-surface disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </div>

            {/* Dial mode selector */}
            <div>
              <div className="mb-2 text-sm font-bold text-ink">How many numbers should we dial per lead?</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={() => setDialMode('primary')} className={`rounded-2xl border-2 p-5 text-left transition ${dialMode === 'primary' ? 'border-brand bg-brand-light/40 shadow-sm' : 'border-line hover:bg-surface'}`}>
                  <div className="flex items-center gap-2 text-base font-bold text-ink"><Phone className="h-5 w-5 text-brand" /> Primary number only</div>
                  <div className="mt-1.5 text-sm text-slate-500">One call per lead — dials each lead's primary dialable number.</div>
                </button>
                <button onClick={() => setDialMode('all_numbers')} className={`rounded-2xl border-2 p-5 text-left transition ${dialMode === 'all_numbers' ? 'border-brand bg-brand-light/40 shadow-sm' : 'border-line hover:bg-surface'}`}>
                  <div className="flex items-center gap-2 text-base font-bold text-ink"><PhoneOutgoing className="h-5 w-5 text-brand" /> All numbers on each lead</div>
                  <div className="mt-1.5 text-sm text-slate-500">Dials every dialable number — expands the total call count.</div>
                </button>
              </div>
            </div>

            {/* Live summary */}
            <div className="flex items-center gap-2.5 rounded-2xl bg-brand-light/30 px-5 py-4 text-base font-bold text-ink">
              <Users className="h-5 w-5 text-brand" />
              {num(selected.size)} lead{selected.size === 1 ? '' : 's'} selected · ~{num(estimatedCalls)} call{estimatedCalls === 1 ? '' : 's'} <span className="text-sm font-normal text-slate-500">({dialMode === 'all_numbers' ? 'all numbers' : 'primary only'})</span>{leadsLoading ? ' · loading…' : ''}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div><label className="mb-2 block text-base font-bold text-ink">Campaign name</label>
              <input autoFocus className="input !py-3.5 text-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miami Off-Market — August" />
              <p className="mt-2 text-sm text-slate-500">This is how the campaign appears in your dashboard and reports.</p></div>

            {/* Summary */}
            <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-5 text-base">
              <div className="flex justify-between"><span className="text-slate-500">Workspace</span><span className="font-semibold text-ink">{workspaces.find((w) => w.slug === ws)?.display_name || ws}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Agent</span><span className="font-semibold text-ink">{agentName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Leads</span><span className="font-semibold text-ink">{num(selected.size)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Dial mode</span><span className="font-semibold text-ink">{dialMode === 'all_numbers' ? 'All numbers on each lead' : 'Primary number only'}</span></div>
            </div>

            {/* Projection panel */}
            <ProjectionPanel loading={projectionLoading} error={projectionErr} projection={projection} fallbackCalls={estimatedCalls} numberCount={preflight?.number_count ?? (preflight?.numbers?.length ?? 0)} />

            {/* Fixed dialing policy */}
            <DialingPolicyCard />

            {/* Pre-flight gate */}
            {preflightLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking the agent's numbers…</div>
            ) : preflight && !preflightOk ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <div className="flex items-center gap-1.5 font-semibold text-red-700"><AlertTriangle className="h-4 w-4" /> Can't launch yet</div>
                <ul className="mt-1.5 space-y-1 text-xs text-red-600">
                  {(preflight.issues || ['This agent has no dialable numbers assigned.']).map((iss: string, i: number) => <li key={i} className="flex gap-1.5"><span>•</span> {iss}</li>)}
                </ul>
              </div>
            ) : preflight && preflightOk ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ready — {num(preflight.number_count || (preflight.numbers || []).length)} number{(preflight.number_count || (preflight.numbers || []).length) === 1 ? '' : 's'} assigned, agent reachable.</div>
            ) : null}
          </div>
        )}

        <div className="mt-7 flex items-center justify-between border-t border-line pt-6">
          <button className={BTN_GHOST} disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4" /> Back</button>
          {step < 3
            ? <button className={BTN_PRIMARY} disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next <ArrowRight className="h-4 w-4" /></button>
            : <button className="inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3 text-base font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-40" disabled={busy || !name.trim() || selected.size === 0 || preflightLoading || !preflightOk} onClick={launch}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOutgoing className="h-5 w-5" />} Launch {num(estimatedCalls)} call{estimatedCalls === 1 ? '' : 's'}</button>}
        </div>
      </div>

      {showImport && <ImportWizard onClose={afterImport} lockedWorkspace={ws || undefined} />}
    </div>
  );
}

/* ---------------- Projection panel (renders defensively) ---------------- */
function ProjectionPanel({ loading, error, projection, fallbackCalls, numberCount = 0 }: { loading: boolean; error: string; projection: any; fallbackCalls: number; numberCount?: number }) {
  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand-light/20 px-4 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Estimating calls, cost and duration…</div>;

  const calls = projection?.estimated_calls ?? fallbackCalls;
  const dur = projection?.estimated_duration || {};

  // Duration is derived from the dialing policy so it stays correct: each assigned number
  // places up to 100 calls/day, and the whole campaign is paced at 1 call / 15s inside the
  // 9am–8pm window (~2,640/day). Effective daily throughput is the smaller of the two.
  // e.g. 117 calls on 1 number = ceil(117 / 100) = 2 days (not 117).
  const CAP_PER_NUMBER = 100;
  const PACE_PER_DAY = Math.floor((11 * 3600) / 15); // 9am–8pm at 1 call / 15s
  const numbers = Math.max(0, Number(numberCount) || 0);
  const perDay = numbers > 0 ? Math.min(numbers * CAP_PER_NUMBER, PACE_PER_DAY) : 0;
  const computedDays = perDay > 0 && calls > 0 ? Math.max(1, Math.ceil(calls / perDay)) : null;
  const humanDuration = computedDays != null
    ? `about ${num(computedDays)} day${computedDays === 1 ? '' : 's'}`
    : (dur.human || null);
  const cr = projection?.cost_range || {};
  const dollars = (v: any) => (v && typeof v === 'object' ? v.billed_usd : v);
  const low = dollars(cr.low);
  const high = dollars(cr.high);
  const blended = dollars(cr.blended);
  const hasCost = low != null || high != null || blended != null;

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-light/20 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><PhoneOutgoing className="h-3.5 w-3.5" /> Projection <span className="font-normal text-slate-400">· estimate</span></div>
      <div className="text-lg font-extrabold text-ink">This campaign will place ~{num(calls)} call{calls === 1 ? '' : 's'}.</div>
      {humanDuration && <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Clock className="h-3.5 w-3.5 text-slate-400" /> Estimated to finish in <span className="font-semibold text-ink">{humanDuration}</span>.</div>}
      {error ? (
        <div className="mt-2 text-xs text-amber-600">Cost + timing estimate is unavailable right now — the campaign will still launch.</div>
      ) : hasCost ? (
        <div className="mt-2 text-sm text-slate-600">
          Estimated cost: <span className="font-semibold text-ink">{low != null ? fmt.money(low) : '—'}–{high != null ? fmt.money(high) : '—'}</span>{blended != null && <> (≈<span className="font-semibold text-ink">{fmt.money(blended)}</span>)</>}
          <div className="mt-1 text-[11px] text-slate-400">{cr.note || 'A range from all-no-answer (cheapest) to all-connected (priciest), based on your calling history. Final cost depends on real outcomes.'}</div>
        </div>
      ) : null}
    </div>
  );
}
