import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm, testai, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { Radio, Plus, PhoneOutgoing, Users, CheckCircle2, Loader2, ChevronRight, DollarSign, Search, X, ArrowRight, ArrowLeft } from 'lucide-react';

// The Retell dialer workspace whose agents/keys place these outbound calls (matches the bulk launcher).
const DIAL_WORKSPACE = '1propertymarket';

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', launching: 'bg-blue-100 text-blue-700',
  dripping: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-slate-200 text-slate-600',
};

function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }

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
                      <td className="px-3 py-2.5"><span className={`pill ${STATUS_PILL[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span></td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{num(launched)} / {num(total)}{c.drip_batch ? <div className="text-[10px] text-amber-600">drip {c.drip_batch}/{c.drip_minutes}m</div> : null}</td>
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

/* ---------------- Super-admin launch wizard ---------------- */
function LaunchWizard({ workspaces, onClose, onLaunched }: { workspaces: any[]; onClose: () => void; onLaunched: (id?: string) => void }) {
  const [step, setStep] = useState(0);
  const [ws, setWs] = useState('');
  const [agents, setAgents] = useState<{ agent_id: string; agent_name: string }[]>([]);
  const [agentId, setAgentId] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [drip, setDrip] = useState(false);
  const [dripBatch, setDripBatch] = useState(25);
  const [dripMinutes, setDripMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Agents come from the shared dialer workspace (where the outbound keys + agents live).
  useEffect(() => { testai.agents(DIAL_WORKSPACE).then((d: any) => { const list = d.agents || []; setAgents(list); if (list.length) setAgentId(list[0].agent_id); }).catch(() => {}); }, []);

  const loadLeads = (slug: string) => {
    setLeadsLoading(true); setSelected(new Set());
    opm.leads({ workspace: slug }).then((d: any) => setLeads(d.leads || [])).catch(() => setLeads([])).finally(() => setLeadsLoading(false));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => (l.name || '').toLowerCase().includes(q) || (l.property_ref || '').toLowerCase().includes(q));
  }, [leads, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.lead_id));
  const toggleAllFiltered = () => setSelected((s) => { const n = new Set(s); if (allFilteredSelected) filtered.forEach((l) => n.delete(l.lead_id)); else filtered.forEach((l) => n.add(l.lead_id)); return n; });

  const agentName = agents.find((a) => a.agent_id === agentId)?.agent_name || '';
  const launch = async () => {
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const r = await opm.campaignLaunch({ workspace: ws, name: name.trim(), agent_id: agentId, agent_name: agentName, lead_ids: [...selected], drip_batch: drip ? dripBatch : null, drip_minutes: drip ? dripMinutes : null });
      onLaunched(r?.campaign?.id);
    } catch (e: any) { setErr(String(e?.message || e)); setBusy(false); }
  };

  const canNext = [!!ws, !!agentId, selected.size > 0, !!name.trim()][step];
  const steps = ['Workspace', 'Agent', 'Leads', 'Confirm'];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><Radio className="h-5 w-5 text-brand" /> New campaign</h3>
          {!busy && <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>}
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {steps.map((s, i) => (
            <span key={s} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${i === step ? 'bg-brand text-white' : i < step ? 'bg-emerald-100 text-emerald-700' : 'border border-line bg-white text-slate-500'}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">{i + 1}</span>{s}
            </span>
          ))}
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}

        {step === 0 && (
          <div>
            <label className="label mb-1 block">Workspace to launch for</label>
            <select autoFocus className="input" value={ws} onChange={(e) => { setWs(e.target.value); loadLeads(e.target.value); }}>
              <option value="">Select a workspace…</option>
              {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
            </select>
            <p className="mt-2 text-xs text-slate-500">Leads, tagging and analytics all scope to this workspace. Calls are placed via the shared 1PropertyMarket dialer.</p>
          </div>
        )}

        {step === 1 && (
          <div>
            <label className="label mb-1 block">AI voice agent</label>
            <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {!agents.length && <option value="">Loading agents…</option>}
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
            </select>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads by name or property…" className="input w-full pl-8 !py-1.5 text-sm" />
              </div>
              <button className="whitespace-nowrap rounded-lg border border-brand/30 bg-brand-light/40 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-light" onClick={toggleAllFiltered}>{allFilteredSelected ? 'Clear' : `Select all ${filtered.length}`}</button>
            </div>
            <div className="mb-2 text-xs text-slate-500">{selected.size} selected · {filtered.length} shown{leadsLoading ? ' · loading…' : ''}</div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
              {leadsLoading ? <div className="p-6 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : filtered.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No leads.</div> : filtered.slice(0, 500).map((l) => (
                <label key={l.lead_id} className="flex cursor-pointer items-center gap-2 border-b border-line px-3 py-1.5 text-sm last:border-0 hover:bg-surface">
                  <input type="checkbox" checked={selected.has(l.lead_id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(l.lead_id) ? n.delete(l.lead_id) : n.add(l.lead_id); return n; })} className="h-3.5 w-3.5 accent-[#1f6feb]" />
                  <span className="font-medium text-ink">{l.name || '(no name)'}</span>
                  <span className="text-xs text-slate-400">{l.property_ref || ''}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{l.phoneCount || 0} #</span>
                </label>
              ))}
            </div>
            {filtered.length > 500 && <p className="mt-1 text-[11px] text-amber-600">Showing first 500; "Select all" still selects all {filtered.length} matching.</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div><label className="label mb-1 block">Campaign name</label>
              <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miami Off-Market — August" /></div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={drip} onChange={(e) => setDrip(e.target.checked)} className="h-4 w-4 accent-[#1f6feb]" /> Drip the calls in batches</label>
            {drip && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-500">Batch size
                  <input type="number" min={1} className="input mt-1 !py-1.5 text-sm" value={dripBatch} onChange={(e) => setDripBatch(Math.max(1, Number(e.target.value) || 1))} /></label>
                <label className="text-xs font-semibold text-slate-500">Every N minutes
                  <input type="number" min={2} className="input mt-1 !py-1.5 text-sm" value={dripMinutes} onChange={(e) => setDripMinutes(Math.max(2, Number(e.target.value) || 2))} /></label>
              </div>
            )}
            <div className="rounded-lg bg-surface p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Workspace</span><span className="font-semibold text-ink">{workspaces.find((w) => w.slug === ws)?.display_name || ws}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Agent</span><span className="font-semibold text-ink">{agentName}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Leads</span><span className="font-semibold text-ink">{selected.size}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">First batch now</span><span className="font-semibold text-ink">{drip ? Math.min(dripBatch, selected.size) : selected.size} call{(drip ? Math.min(dripBatch, selected.size) : selected.size) === 1 ? '' : 's'}</span></div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4" /> Back</button>
          {step < 3
            ? <button className="btn-primary disabled:opacity-50" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next <ArrowRight className="h-4 w-4" /></button>
            : <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" disabled={busy || !name.trim() || selected.size === 0} onClick={launch}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOutgoing className="h-4 w-4" />} Launch {drip ? Math.min(dripBatch, selected.size) : selected.size} now</button>}
        </div>
      </div>
    </div>
  );
}
