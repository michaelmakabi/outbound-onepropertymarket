import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm, testai, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';
import LaunchWizard from '../components/LaunchWizard';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { Radio, Plus, PhoneOutgoing, Users, CheckCircle2, Loader2, ChevronRight, ChevronLeft, DollarSign, Search, X, ArrowRight, ArrowLeft, Upload, ListFilter, AlertTriangle, Clock, Phone, Timer, Info, Hash } from 'lucide-react';

const LEADS_PAGE_SIZE = 50;

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600', launching: 'bg-blue-100 text-blue-700',
  dripping: 'bg-amber-100 text-amber-700', throttled: 'bg-orange-100 text-orange-700',
  completed: 'bg-emerald-100 text-emerald-700', paused: 'bg-slate-200 text-slate-600',
  failed: 'bg-red-100 text-red-700', canceled: 'bg-slate-200 text-slate-500',
  scheduled: 'bg-indigo-100 text-indigo-700',
};

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

export default function OpmCampaigns() {
  const nav = useNavigate();
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const { workspaces, active, viewAll } = useWorkspace();
  // Scope the campaigns list to the active workspace unless viewing All Workspaces.
  const scopedWs = viewAll ? '' : (active || '');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wsFilter, setWsFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [wizard, setWizard] = useState(false);
  const [dripBusy, setDripBusy] = useState(false);

  // Retail pricing: campaign costs are stored as raw hard cost. A customer (or a super_admin
  // impersonating one) must see hard × their workspace's billing multiplier; true staff see raw cost.
  // `apply` is false for staff, true otherwise; `mult` is keyed by workspace slug.
  const [retail, setRetail] = useState<{ apply: boolean; mult: Record<string, number> }>({ apply: false, mult: {} });
  useEffect(() => { opm.retailMult().then((d: any) => setRetail({ apply: !!d?.apply, mult: d?.mult || {} })).catch(() => {}); }, []);
  const scaleCents = useCallback((cents: number, workspace: string) => (retail.apply ? Math.round((cents || 0) * (retail.mult[workspace] ?? 1)) : (cents || 0)), [retail]);

  const wsName = useMemo(() => Object.fromEntries((workspaces || []).map((w: any) => [w.slug, w.display_name])), [workspaces]);

  const load = useCallback(() => {
    setLoading(true); setError('');
    opm.campaignsList({ workspace: scopedWs || wsFilter || undefined, from: from || undefined, to: to || undefined })
      .then((d: any) => setRows(d.campaigns || []))
      .catch((e: any) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [wsFilter, from, to]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    let cost = 0, launched = 0, answered = 0, completed = 0;
    for (const c of rows) { const r = c.rollup || {}; cost += scaleCents(r.cost_cents || 0, c.workspace); launched += r.launched || 0; answered += r.answered || 0; completed += r.completed || 0; }
    return { cost, launched, answered, completed, count: rows.length };
  }, [rows, scaleCents]);

  const runDrip = async () => {
    setDripBusy(true);
    try { await opm.campaignDripRun(); await load(); } catch (e: any) { setError(String(e?.message || e)); } finally { setDripBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Campaigns" description="Every AI-calling campaign, its drip progress, cost and outcomes — in one place" showDate={false}
        actions={<button className="btn-primary" onClick={() => setWizard(true)}><Plus className="h-4 w-4" /> New campaign</button>} />

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
            {viewAll && (
              <label className="text-xs font-semibold text-slate-500">Workspace
                <select value={wsFilter} onChange={(e) => setWsFilter(e.target.value)} className="input mt-1 block !py-1.5 text-sm">
                  <option value="">{isSuper ? 'All workspaces' : 'All my workspaces'}</option>
                  {(workspaces || []).map((w: any) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
                </select>
              </label>
            )}
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
                      <td className="px-3 py-2.5"><span className={`pill ${STATUS_PILL[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span>{c.status === 'throttled' ? <div className="text-[10px] text-orange-600">numbers maxed · resumes next day</div> : null}{c.status === 'scheduled' && c.scheduled_at ? <div className="text-[10px] text-indigo-600">launches {new Date(c.scheduled_at).toLocaleString()}</div> : null}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{num(launched)} / {num(total)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-600">{num(r.answered || 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmt.money(scaleCents(r.cost_cents || 0, c.workspace) / 100)}</td>
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

      {wizard && <LaunchWizard workspaces={workspaces || []} lockedWorkspace={active || undefined} onClose={() => setWizard(false)} onLaunched={(id) => { setWizard(false); load(); if (id) nav(`/campaigns/${id}`); }} />}
    </div>
  );
}
