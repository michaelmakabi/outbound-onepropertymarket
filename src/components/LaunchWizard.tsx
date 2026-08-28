// Shared AI-calling launch wizard. Used by BOTH the Campaigns page (New campaign) and the
// Contacts page (select leads → Launch AI calls). Four steps: Workspace → Agent → Leads → Confirm,
// including the "Primary number only" vs "All numbers per lead" dial-mode choice, agent + caller-ID
// panel, live projection (calls/cost/duration) and launch-now / schedule.
//
// When opened from Contacts, pass `lockedWorkspace` (the active tenant), `initialLeadIds` (the
// current selection) and `startStep={1}` so the user lands on the Agent step with their leads
// already chosen. The pre-seeded selection is preserved (never cleared on mount).
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { opm, testai, fmt } from '../lib/api';
import { num } from '../lib/format';
import { LOGO_MARK } from '../lib/logo';
import ImportWizard from './ImportWizard';
import {
  Radio, X, CheckCircle2, Loader2, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, Search, Upload,
  ListFilter, Users, Phone, PhoneOutgoing, Clock, AlertTriangle, Info, Hash, Timer, Plus, Sparkles,
} from 'lucide-react';

const LEADS_PAGE_SIZE = 50;

// Local now (+5 min) formatted for an <input type="datetime-local"> min attribute (prevents past times).
function minLocalDateTime() {
  const d = new Date(Date.now() + 5 * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Shared, generously-sized button styles for the launch wizard footer + actions.
const BTN_GHOST = 'inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-40';
const BTN_PRIMARY = 'inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-40';

// Guiding copy shown at the top of every wizard step so the user always knows what to do next.
const STEP_INTRO: { title: string; desc: string }[] = [
  { title: 'Choose a workspace', desc: 'Pick which workspace this campaign belongs to. Its leads, tags and analytics are all scoped here.' },
  { title: 'Pick your AI voice agent', desc: 'Select the AI agent that will place and handle every call in this campaign.' },
  { title: 'Build your call list', desc: 'Add leads with a smart list, search & select, or import a fresh file. Then choose how many numbers to dial per lead.' },
  { title: 'Name it & review', desc: 'Give the campaign a name, choose to launch now or schedule it, and review the projected calls, cost and timing.' },
];

// Narration for the branded launch overlay — each line explains a real thing happening behind the
// scenes as the campaign spins up. The final line is shown once the server confirms.
const LAUNCH_STEPS: { label: string; sub: string }[] = [
  { label: 'Validating your campaign', sub: 'Checking the agent, caller-ID numbers and dialer credit.' },
  { label: 'Reserving your caller-ID numbers', sub: 'Locking in the numbers this campaign will dial from.' },
  { label: 'Queuing your leads', sub: 'Ordering them East Coast first so everyone is called in-hours.' },
  { label: 'Starting the dialer', sub: 'Handing the batch to the AI agent to begin placing calls.' },
  { label: 'Campaign is live', sub: 'Taking you to the live campaign view…' },
];

export default function LaunchWizard({ workspaces, lockedWorkspace, initialLeadIds, initialName, startStep, onClose, onLaunched }: {
  workspaces: any[];
  lockedWorkspace?: string;
  initialLeadIds?: string[];
  initialName?: string;
  startStep?: number;
  onClose: () => void;
  onLaunched: (id?: string) => void;
}) {
  const [step, setStep] = useState(startStep ?? 0);
  const [ws, setWs] = useState(lockedWorkspace || '');
  const [agents, setAgents] = useState<{ agent_id: string; agent_name: string }[]>([]);
  const [agentId, setAgentId] = useState('');
  // Rich per-agent info (description/voice/type) for the "what does this agent do" tooltip, keyed by agent_id.
  const [agentInfo, setAgentInfo] = useState<Record<string, any>>({});
  // Caller-ID numbers assigned to this workspace's dialer + usage (most/last used) for the agent panel.
  const [numUsage, setNumUsage] = useState<{ phone: string; total_calls: number; last_used: string | null }[]>([]);

  // Loaded leads for the chosen workspace (source for search+select and the calls estimate).
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialLeadIds || []));
  const [resolving, setResolving] = useState(false);
  // The leads pre-seeded from the Contacts selection are the campaign's BASE TARGET. Anything the
  // user adds here (smart lists, "select all", import) is explicitly additive on top of them.
  const preseeded = useMemo(() => new Set(initialLeadIds || []), []); // eslint-disable-line react-hooks/exhaustive-deps
  const hasPreseed = preseeded.size > 0;
  // When pre-seeded, the "add more leads" tools are collapsed by default so the base target is the story.
  const [showAddMore, setShowAddMore] = useState(!hasPreseed);
  const addedBeyondPreseed = useMemo(() => {
    let c = 0; selected.forEach((id) => { if (!preseeded.has(id)) c++; }); return c;
  }, [selected, preseeded]);

  // Smart lists (saved views) for this workspace: id -> resolved { ids, count }.
  const [lists, setLists] = useState<any[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [listMeta, setListMeta] = useState<Record<string, { ids: string[]; count: number }>>({});
  const [activeLists, setActiveLists] = useState<Set<number>>(new Set());

  // On-the-fly import.
  const [showImport, setShowImport] = useState(false);

  const [dialMode, setDialMode] = useState<'primary' | 'all_numbers'>('primary');
  const [name, setName] = useState(initialName || '');
  // Launch timing: 'now' starts immediately; 'schedule' holds the campaign until scheduleAt.
  const [launchMode, setLaunchMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState(''); // <input type="datetime-local"> value (local time)

  // Pre-flight + projection.
  const [preflight, setPreflight] = useState<any>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [projection, setProjection] = useState<any>(null);
  const [projectionLoading, setProjectionLoading] = useState(false);
  const [projectionErr, setProjectionErr] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Form-style validation: which required field is missing, so we can outline it red and jump to it.
  const [invalidField, setInvalidField] = useState<'' | 'name' | 'leads' | 'agent' | 'preflight' | 'schedule'>('');
  const nameRef = useRef<HTMLInputElement>(null);
  // Branded launch overlay: an animated progress bar with a step-by-step "what's happening" narration.
  const [launchStep, setLaunchStep] = useState(0);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Agents come from THIS workspace's own dialer account (its Retell subaccount) — never the shared
  // 1PM account. We resolve the tenant's dialer routing first (dialer_slug + the agent configured to
  // actually place its calls), list that account's agents, and preselect the configured agent so the
  // wizard shows exactly the agents that will dial for this workspace.
  const loadAgents = useCallback((slug: string) => {
    if (!slug) { setAgents([]); setAgentId(''); setAgentInfo({}); setNumUsage([]); return; }
    // Rich agent descriptions (best-effort) so the wizard can explain what each agent does.
    const loadInfo = (s: string) => testai.agentsDetailed(s)
      .then((d: any) => { const m: Record<string, any> = {}; for (const a of d.agents || []) m[a.agent_id] = a; setAgentInfo(m); })
      .catch(() => setAgentInfo({}));
    opm.dialerConfig(slug).then((cfg: any) => {
      const dialerSlug = cfg?.dialer_slug || slug;
      const configured = cfg?.agent_id || '';
      loadInfo(dialerSlug);
      testai.agents(dialerSlug).then((d: any) => {
        const list = d.agents || [];
        setAgents(list);
        const pick = configured && list.some((a: any) => a.agent_id === configured) ? configured : (list[0]?.agent_id || '');
        setAgentId(pick);
      }).catch(() => { setAgents([]); setAgentId(''); });
    }).catch(() => {
      // No dialer config row — fall back to listing the workspace's own account directly.
      loadInfo(slug);
      testai.agents(slug).then((d: any) => { const list = d.agents || []; setAgents(list); if (list.length) setAgentId(list[0].agent_id); }).catch(() => { setAgents([]); setAgentId(''); });
    });
    // Caller-ID numbers + usage for this workspace's dialer (independent of which agent is picked).
    opm.campaignNumberUsage(slug).then((d: any) => setNumUsage(Array.isArray(d?.numbers) ? d.numbers : [])).catch(() => setNumUsage([]));
  }, []);

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
    loadAgents(slug);
    if (slug) { fetchLeads(slug); loadLists(slug); } else { setLeads([]); setLists([]); }
  };

  // Locked-workspace mode (Campaigns single-tenant, or Contacts launch): load the workspace's leads,
  // agents and smart lists on mount — but NEVER clear `selected`, which may be pre-seeded from a
  // Contacts selection.
  useEffect(() => {
    if (!lockedWorkspace) return;
    setWs(lockedWorkspace);
    loadAgents(lockedWorkspace);
    fetchLeads(lockedWorkspace);
    loadLists(lockedWorkspace);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Calls only go out 9am-8pm local, so a scheduled START must also fall inside that window.
  const BH_START = 9, BH_END = 20;
  const schedDate = scheduleAt ? new Date(scheduleAt) : null;
  const schedHour = schedDate ? schedDate.getHours() : null;
  const scheduleHourOk = schedHour == null || (schedHour >= BH_START && schedHour < BH_END);
  const scheduleFuture = !!scheduleAt && !!schedDate && schedDate.getTime() > Date.now();
  // When scheduling, require a valid FUTURE time that is also inside calling hours.
  const scheduleReady = launchMode === 'now' || (scheduleFuture && scheduleHourOk);

  const launch = async () => {
    if (busy) return;
    // Form-style validation: don't silently disable — point the user at exactly what's incomplete.
    if (!ws) { setInvalidField('agent'); setStep(0); return; }
    if (!agentId) { setInvalidField('agent'); setStep(1); return; }
    if (selected.size === 0) { setInvalidField('leads'); setStep(2); setErr('Add at least one lead before launching.'); return; }
    if (!name.trim()) {
      setInvalidField('name'); setStep(3);
      setTimeout(() => { nameRef.current?.focus(); nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 40);
      return;
    }
    if (!scheduleReady) { setInvalidField('schedule'); return; }
    if (!preflightOk) { setInvalidField('preflight'); return; }
    setErr(''); setInvalidField(''); setBusy(true); setLaunchStep(0);
    try {
      const payload: any = { workspace: ws, name: name.trim(), agent_id: agentId, agent_name: agentName, lead_ids: [...selected], dial_mode: dialMode, timezone };
      if (launchMode === 'schedule' && scheduleAt) payload.scheduled_at = new Date(scheduleAt).toISOString();
      const r = await opm.campaignLaunch(payload);
      // Let the final "Launching…" frame breathe for a beat so the transition doesn't feel abrupt.
      setLaunchStep(LAUNCH_STEPS.length - 1);
      await new Promise((res) => setTimeout(res, 500));
      onLaunched(r?.campaign?.id);
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(false); }
  };

  // Advance the branded launch narration while the request is in flight (purely cosmetic pacing).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLaunchStep((s) => Math.min(s + 1, LAUNCH_STEPS.length - 2)), 900);
    return () => clearInterval(t);
  }, [busy]);

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
            {lockedWorkspace ? (
              <div className="input !py-3.5 flex items-center bg-surface text-base font-semibold text-slate-700">{workspaces.find((w) => w.slug === lockedWorkspace)?.display_name || lockedWorkspace}</div>
            ) : (
              <select autoFocus className="input !py-3.5 text-base" value={ws} onChange={(e) => onPickWorkspace(e.target.value)}>
                <option value="">Select a workspace…</option>
                {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
              </select>
            )}
            <p className="mt-3 text-sm text-slate-500">{lockedWorkspace ? 'Locked to your active workspace — leads, tagging and analytics all scope here. Switch workspaces from the sidebar to launch for a different tenant.' : 'Leads, tagging and analytics all scope to this workspace. Calls are placed via this workspace’s configured dialer account.'}</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <label className="mb-2 block text-base font-bold text-ink">AI voice agent</label>
            <select className="input !py-3.5 text-base" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {!agents.length && <option value="">Loading agents…</option>}
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
            </select>
            <p className="mt-3 text-sm text-slate-500">These are the agents on this workspace’s own dialer account. Its script, voice and assigned phone numbers will be used for every call in the campaign.</p>

            {/* What this agent does — pulled from the AI Agents directory. */}
            {agentId && agentInfo[agentId] && (
              <div className="mt-4 rounded-2xl border border-brand/20 bg-brand-light/20 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><Info className="h-3.5 w-3.5" /> What this agent does</div>
                <div className="mt-1.5 text-sm leading-relaxed text-slate-700">{agentInfo[agentId].description || 'No description on file for this agent yet — open AI Agents to add one.'}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {agentInfo[agentId].type && <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-600">{agentInfo[agentId].type}</span>}
                  {agentInfo[agentId].voice_name && <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-600">Voice: {agentInfo[agentId].voice_name}</span>}
                </div>
              </div>
            )}

            {/* Which caller-ID numbers this agent will dial from + how heavily each has been used. */}
            <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Hash className="h-3.5 w-3.5" /> Numbers this agent dials from</div>
              {numUsage.length === 0 ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" /> No caller-ID numbers are assigned to this workspace yet — assign numbers before launching.</div>
              ) : (
                <>
                  <p className="mt-1.5 text-xs text-slate-500">Dialing rotates across these numbers to stay healthy. Ordered by most used; “last used” shows recent activity.</p>
                  <div className="mt-2.5 space-y-1.5">
                    {numUsage.slice(0, 8).map((n, i) => (
                      <div key={n.phone} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 font-mono text-slate-700">
                          {n.phone}
                          {i === 0 && n.total_calls > 0 && <span className="rounded bg-brand-light px-1.5 py-0.5 text-[10px] font-semibold text-brand">most used</span>}
                        </span>
                        <span className="text-xs text-slate-500">{num(n.total_calls)} call{n.total_calls === 1 ? '' : 's'}{n.last_used ? ` · last ${n.last_used}` : ' · never used'}</span>
                      </div>
                    ))}
                    {numUsage.length > 8 && <div className="text-xs text-slate-400">+ {numUsage.length - 8} more number{numUsage.length - 8 === 1 ? '' : 's'}</div>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* Base target: leads carried in from the Contacts selection. */}
            {hasPreseed && (
              <div className="rounded-2xl border-2 border-brand/30 bg-brand-light/30 p-5">
                <div className="flex items-center gap-2 text-base font-bold text-ink"><CheckCircle2 className="h-5 w-5 text-brand" /> Targeting {num(preseeded.size)} lead{preseeded.size === 1 ? '' : 's'} you selected</div>
                <p className="mt-1 text-sm text-slate-600">These are the exact contacts you picked — they're the campaign's target. You don't need to add anything else. If you'd like, you can <span className="font-semibold text-ink">also include more</span> leads below.{addedBeyondPreseed > 0 && <> You've added <span className="font-semibold text-brand">{num(addedBeyondPreseed)} more</span> so far.</>}</p>
                {!showAddMore && (
                  <button onClick={() => setShowAddMore(true)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-white px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand-light/40"><Plus className="h-4 w-4" /> Also include more leads (optional)</button>
                )}
              </div>
            )}

            {(showAddMore || !hasPreseed) && (<>
            {hasPreseed && (
              <div className="flex items-center gap-2 text-sm font-bold text-brand"><Sparkles className="h-4 w-4" /> Add more leads on top of your {num(preseeded.size)} selected <span className="ml-1 font-normal text-slate-400">— optional</span></div>
            )}
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
              {selected.size > 0 && (
                <div className="mt-2 text-xs text-slate-500">{num(selected.size)} lead{selected.size === 1 ? '' : 's'} selected in total (including any not shown on this page).</div>
              )}
            </div>
            </>)}

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
            <div><label className="mb-2 block text-base font-bold text-ink">Campaign name {invalidField === 'name' && <span className="ml-1 text-sm font-semibold text-red-600">— required</span>}</label>
              <input ref={nameRef} autoFocus className={`input !py-3.5 text-base ${invalidField === 'name' ? 'border-red-400 ring-2 ring-red-200 focus:border-red-400' : ''}`} value={name} onChange={(e) => { setName(e.target.value); if (invalidField === 'name') setInvalidField(''); }} placeholder="e.g. Miami Off-Market — August" />
              {invalidField === 'name'
                ? <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-600"><AlertTriangle className="h-4 w-4" /> Give your campaign a name so you can find it later.</p>
                : <p className="mt-2 text-sm text-slate-500">This is how the campaign appears in your dashboard and reports.</p>}</div>

            {/* Summary */}
            <div className="space-y-2.5 rounded-2xl border border-line bg-surface p-5 text-base">
              <div className="flex justify-between"><span className="text-slate-500">Workspace</span><span className="font-semibold text-ink">{workspaces.find((w) => w.slug === ws)?.display_name || ws}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Agent</span><span className="font-semibold text-ink">{agentName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Leads</span><span className="font-semibold text-ink">{num(selected.size)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Dial mode</span><span className="font-semibold text-ink">{dialMode === 'all_numbers' ? 'All numbers on each lead' : 'Primary number only'}</span></div>
            </div>

            {/* When to launch: now or scheduled */}
            <div>
              <div className="mb-2 text-base font-bold text-ink">When should this campaign start?</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setLaunchMode('now')} className={`rounded-2xl border-2 p-4 text-left transition ${launchMode === 'now' ? 'border-brand bg-brand-light/40 shadow-sm' : 'border-line hover:bg-surface'}`}>
                  <div className="flex items-center gap-2 text-base font-bold text-ink"><PhoneOutgoing className="h-5 w-5 text-brand" /> Launch now</div>
                  <div className="mt-1.5 text-sm text-slate-500">Start dialing right away (within the 9am–8pm window).</div>
                </button>
                <button type="button" onClick={() => setLaunchMode('schedule')} className={`rounded-2xl border-2 p-4 text-left transition ${launchMode === 'schedule' ? 'border-brand bg-brand-light/40 shadow-sm' : 'border-line hover:bg-surface'}`}>
                  <div className="flex items-center gap-2 text-base font-bold text-ink"><Clock className="h-5 w-5 text-brand" /> Schedule for later</div>
                  <div className="mt-1.5 text-sm text-slate-500">Pick a future date &amp; time — it starts automatically then.</div>
                </button>
              </div>
              {launchMode === 'schedule' && (
                <div className="mt-3 space-y-2">
                  <input type="datetime-local" className="input !py-3 text-base" value={scheduleAt} min={minLocalDateTime()} onChange={(e) => setScheduleAt(e.target.value)} />
                  <p className="text-xs text-slate-500">Your timezone: <span className="font-semibold text-ink">{timezone}</span> (auto-detected). Times are shown and scheduled in your local timezone.</p>
                  {scheduleAt && !scheduleHourOk ? (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Campaigns can only start between <span className="font-semibold">9:00 AM and 8:00 PM</span>. Please pick a start time inside that window.</span>
                    </div>
                  ) : scheduleAt && !scheduleFuture ? (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Please pick a start time in the future.</span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{scheduleAt ? `Starts ${new Date(scheduleAt).toLocaleString()}. Then leads dial East Coast first and move West — each person is called within their own 9am–8pm local window.` : 'Choose when the campaign should begin (between 9:00 AM and 8:00 PM). It stays idle until then, then starts on its own — you can cancel or launch it early anytime.'}</p>
                  )}
                </div>
              )}
            </div>

            {/* Projection panel */}
            <ProjectionPanel loading={projectionLoading} error={projectionErr} projection={projection} fallbackCalls={estimatedCalls} />

            {/* Fixed dialing policy */}
            <DialingPolicyCard />

            {/* Pre-flight gate */}
            {preflightLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking the agent's numbers and dialer credit…</div>
            ) : preflight && !preflightOk ? (
              <div className={`rounded-lg border p-3 text-sm ${invalidField === 'preflight' ? 'border-red-400 bg-red-50 ring-2 ring-red-200' : 'border-red-200 bg-red-50'}`}>
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
            : <button className="inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3 text-base font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-40" disabled={busy || preflightLoading} onClick={launch}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : launchMode === 'schedule' ? <Clock className="h-5 w-5" /> : <PhoneOutgoing className="h-5 w-5" />} {launchMode === 'schedule' ? 'Schedule campaign' : `Launch ${num(estimatedCalls)} call${estimatedCalls === 1 ? '' : 's'}`}</button>}
        </div>
      </div>

      {showImport && <ImportWizard onClose={afterImport} lockedWorkspace={ws || undefined} />}

      {busy && <LaunchOverlay step={launchStep} scheduled={launchMode === 'schedule'} calls={estimatedCalls} name={name.trim()} />}
    </div>
  );
}

/* ---------------- Branded launch overlay ---------------- */
// Full-screen branded cover shown while the campaign is spinning up: OPM logo, an animated progress
// bar, and a live step-by-step narration of what's happening behind the scenes.
function LaunchOverlay({ step, scheduled, calls, name }: { step: number; scheduled: boolean; calls: number; name: string }) {
  const pct = Math.round(((step + 1) / LAUNCH_STEPS.length) * 100);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md rounded-3xl p-9 text-center shadow-2xl">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-brand-light/50 p-3 ring-1 ring-brand/20">
          <img src={LOGO_MARK} alt="1PropertyMarket" className="h-full w-full animate-pulse object-contain" />
        </div>
        <h3 className="text-xl font-extrabold tracking-tight text-ink">{scheduled ? 'Scheduling your campaign' : 'Launching your campaign'}</h3>
        {name && <p className="mt-1 text-sm font-semibold text-brand">{name}</p>}

        {/* Progress bar */}
        <div className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-brand transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-right text-[11px] font-semibold text-slate-400">{pct}%</div>

        {/* Live step narration */}
        <div className="mt-4 space-y-2 text-left">
          {LAUNCH_STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3 py-2 transition ${active ? 'bg-brand-light/40' : ''}`}>
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-brand text-white' : 'bg-surface text-slate-300'}`}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                </span>
                <div>
                  <div className={`text-sm font-semibold ${done || active ? 'text-ink' : 'text-slate-400'}`}>{s.label}</div>
                  {active && <div className="text-xs text-slate-500">{s.sub}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-xs text-slate-400">{scheduled ? 'Almost done — saving your schedule.' : `Placing ~${num(calls)} call${calls === 1 ? '' : 's'}. This only takes a moment — please don't close this window.`}</p>
      </div>
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
        <li className="flex gap-2"><span className="text-brand">•</span> Leads are dialed <span className="font-semibold text-ink">East Coast first, then westward</span> — by area code, so each person is reached during their own local hours.</li>
        <li className="flex gap-2"><span className="text-brand">•</span> If every number is maxed for the day it <span className="font-semibold text-ink">auto-pauses and resumes the next morning</span> — no action needed.</li>
      </ul>
    </div>
  );
}

/* ---------------- Projection panel (renders defensively) ---------------- */
function ProjectionPanel({ loading, error, projection, fallbackCalls }: { loading: boolean; error: string; projection: any; fallbackCalls: number }) {
  if (loading) return <div className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand-light/20 px-4 py-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Estimating calls, cost and duration…</div>;

  const calls = projection?.estimated_calls ?? fallbackCalls;
  const dur = projection?.estimated_duration || {};
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
      {dur.human && <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Clock className="h-3.5 w-3.5 text-slate-400" /> Estimated to finish in <span className="font-semibold text-ink">{dur.human}</span>.</div>}
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
