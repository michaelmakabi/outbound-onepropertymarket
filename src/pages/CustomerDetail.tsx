import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { adminOps, workspaceStore, fmt, opm } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Spinner, KpiCard, SectionCard, EmptyState, LoadingBlock } from '../components/dash';
import { UsersAndAccess, type Ws } from '../components/UsersAndAccess';
import { StageIcon } from '../lib/statusIcons';
import { dispositionColor, humanizeDisposition } from '../lib/format';
import { statusIconName } from '../lib/statuses';
import { ArrowLeft, Building2, Users, PhoneCall, Bot, KeyRound, AlertCircle, LogIn, Layers, TrendingUp, DollarSign, Loader2, PhoneIncoming, PhoneOutgoing, Voicemail, Clock3, Gauge } from 'lucide-react';

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', onboarding: 'bg-amber-100 text-amber-700',
  paused: 'bg-slate-100 text-slate-600', trial_expired: 'bg-orange-100 text-orange-700', closed: 'bg-red-100 text-red-700',
};
const TABS = [['overview', 'Overview'], ['users', 'Users & access'], ['agents', 'Agents'], ['activity', 'Activity']] as const;

export default function CustomerDetail() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => { adminOps.tenantDetail(slug).then(setD).catch((e) => setErr(e?.message || 'Failed to load')).finally(() => setLoading(false)); };
  useEffect(() => { setLoading(true); load(); }, [slug]);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Customers are restricted to super admins.</div>;
  if (loading) return <Spinner />;
  if (err || !d?.tenant) return <div className="py-16 text-center text-slate-400">{err || 'Customer not found.'} <button className="ml-2 text-brand hover:underline" onClick={() => nav('/tenants')}>Back to Customers</button></div>;

  const t = d.tenant;
  const jumpIn = () => { workspaceStore.set(t.crm_workspace); window.location.assign('/'); };
  const setTab = (x: string) => setSp(x === 'overview' ? {} : { tab: x });

  return (
    <div>
      <button className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-ink" onClick={() => nav('/tenants')}><ArrowLeft className="h-4 w-4" /> Customers</button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-ink">{t.display_name || t.slug}</h1><span className={`pill ${statusColor[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span></div>
          <div className="mt-1 font-mono text-[11px] text-slate-400">{t.slug}{t.crm_workspace !== t.slug && <span> · crm:{t.crm_workspace}</span>}{t.dialer_slug && t.dialer_slug !== t.slug && <span> · dialer:{t.dialer_slug}</span>}{t.billing_slug !== t.slug && <span> · billing:{t.billing_slug}</span>}</div>
        </div>
        <button className="btn-ghost" onClick={jumpIn}><LogIn className="h-4 w-4" /> Jump into CRM</button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Leads" value={fmt.int(d.totals.leads)} onClick={() => setTab('activity')} />
        <Stat icon={<PhoneCall className="h-3.5 w-3.5" />} label="Calls" value={fmt.int(d.totals.calls)} onClick={() => setTab('activity')} />
        <Stat icon={<Layers className="h-3.5 w-3.5" />} label="Contacts" value={fmt.int(d.totals.contacts)} onClick={() => setTab('activity')} />
        <Stat icon={<Bot className="h-3.5 w-3.5" />} label="Agents" value={fmt.int(d.totals.agents)} onClick={() => setTab('agents')} />
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Users" value={fmt.int(d.totals.users)} onClick={() => setTab('users')} />
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Margin" value={fmt.money(d.usage?.margin || 0)} accent={(d.usage?.margin || 0) > 0} />
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <button key={k} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-ink'}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview d={d} />}
      {tab === 'users' && (
        <UsersAndAccess
          scopeWorkspaces={(d.workspaces || []).map((w: any): Ws => ({ slug: w.workspace, display_name: w.workspace === t.crm_workspace ? (t.display_name || w.workspace) : w.workspace }))}
          scopedEmails={(d.users || []).map((u: any) => u.email).filter(Boolean)}
          primaryWorkspace={t.crm_workspace}
          onChanged={load}
        />
      )}
      {tab === 'agents' && <AgentsTab d={d} onReload={load} />}
      {tab === 'activity' && <ActivityTab d={d} />}
    </div>
  );
}

function Stat({ icon, label, value, onClick, accent }: any) {
  const inner = (<><div className="label flex items-center gap-1.5">{icon} {label}</div><div className={`mt-1 text-2xl font-bold ${accent ? 'text-emerald-600' : 'text-ink'}`}>{value}</div></>);
  return onClick
    ? <button className="card p-4 text-left transition hover:border-brand hover:shadow-sm" onClick={onClick}>{inner}</button>
    : <div className="card p-4">{inner}</div>;
}

function Overview({ d }: any) {
  const t = d.tenant;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-ink"><Building2 className="h-4 w-4 text-slate-400" /> Workspaces</div>
        <p className="mb-3 text-xs text-slate-500">This customer is one account spanning the workspace(s) below. Metrics on the Customers list are the sum across all of them.</p>
        <div className="space-y-2">
          {d.workspaces.map((w: any) => (
            <div key={w.workspace} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <div>
                <div className="font-mono text-xs font-semibold text-ink">{w.workspace}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{w.role} · {fmt.int(w.leads)} leads · {fmt.int(w.calls)} calls · {fmt.int(w.agents)} agents</div>
              </div>
              {w.has_key ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><KeyRound className="h-3.5 w-3.5" /> dialer key</span> : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><AlertCircle className="h-3.5 w-3.5" /> no key</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-ink"><DollarSign className="h-4 w-4 text-slate-400" /> Billing & usage</div>
        <dl className="space-y-2 text-sm">
          <Row k="Billing workspace" v={<span className="font-mono text-xs">{t.billing_slug}</span>} />
          <Row k="Mode" v={d.billing?.mode || '—'} />
          <Row k="Multiplier" v={`${d.billing?.multiplier ?? '—'}×`} />
          <Row k="Stripe customer" v={<span className="font-mono text-[11px]">{d.billing?.stripe_customer_id || '— not linked —'}</span>} />
          <div className="my-2 border-t border-line" />
          <Row k="Hard cost" v={fmt.money(d.usage?.hard || 0)} />
          <Row k="Retail" v={fmt.money(d.usage?.retail || 0)} />
          <Row k="Margin" v={<span className="font-semibold text-emerald-600">{fmt.money(d.usage?.margin || 0)}</span>} />
          <Row k="Unbilled" v={fmt.money(d.usage?.unbilled || 0)} />
        </dl>
      </div>
    </div>
  );
}
function Row({ k, v }: any) { return <div className="flex items-center justify-between"><dt className="text-slate-500">{k}</dt><dd className="text-ink">{v}</dd></div>; }

function AgentsTab({ d, onReload }: any) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  if (!d.agents.length) return <div className="card p-8 text-center text-sm text-slate-400">No agents connected in this customer's workspaces yet.</div>;

  const customers = d.customers || [];
  const shared = d.agents.some((a: any) => !a.bills_here);

  const assign = async (a: any, billing_slug: string) => {
    if (billing_slug === a.billing_slug) return;
    setMsg(''); setBusy(a.agent_id);
    try {
      const r: any = await adminOps.agentBillingSet({ dialer_workspace: a.workspace, agent_id: a.agent_id, agent_name: a.agent_name, billing_slug, reattribute: true });
      const owner = customers.find((c: any) => c.billing_slug === billing_slug)?.display_name || billing_slug;
      setMsg(`Moved “${a.agent_name}” → ${owner}. Re-attributed ${r.reattributed} unbilled event(s).`);
      onReload && onReload();
    } catch (e: any) { setMsg(e?.message || 'Assignment failed'); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Each agent's call costs bill to the customer set here. When two customers share one voice workspace, assign each agent to whoever it works for — costs (and any future invoice) route accordingly. Only unbilled usage is re-attributed; invoiced usage never moves.</p>
      {shared && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Some agents in this account bill to a different customer — those rows are highlighted below.</div>}
      {msg && <div className="rounded-lg bg-brand-light/40 px-3 py-2 text-xs text-brand">{msg}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2.5">Agent</th><th className="px-3 py-2.5">Workspace</th><th className="px-3 py-2.5 text-right">Calls</th><th className="px-3 py-2.5 text-right">Hard cost</th><th className="px-3 py-2.5">Bills to</th></tr>
          </thead>
          <tbody>
            {d.agents.map((a: any) => (
              <tr key={a.agent_id} className={`border-t border-line hover:bg-surface ${!a.bills_here ? 'bg-amber-50/50' : ''}`}>
                <td className="px-4 py-2.5"><div className="font-semibold text-ink">{a.agent_name}</div><div className="font-mono text-[11px] text-slate-400">{a.agent_id}</div></td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{a.workspace}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink">{fmt.int(a.calls)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt.money(a.hard_cost || 0)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <select className="input !py-1 !text-xs max-w-[190px]" value={a.billing_slug} disabled={busy === a.agent_id} onChange={(e) => assign(a, e.target.value)}>
                      {customers.map((c: any) => <option key={c.billing_slug} value={c.billing_slug}>{c.display_name}</option>)}
                    </select>
                    {busy === a.agent_id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : a.billing_mapped ? <span title="Explicitly assigned" className="text-[10px] font-semibold text-brand">set</span> : <span title="Default owner" className="text-[10px] text-slate-300">auto</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Activity tab: rich workspace call analytics (computed from `calls`) ---------------- */

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '7d', label: '7D', days: 7 }, { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 }, { key: 'all', label: 'All', days: null },
];

function ActivityTab({ d }: any) {
  const slugs = useMemo<string[]>(() => [...new Set((d.workspaces || []).map((w: any) => w.workspace).filter(Boolean))] as string[], [d.workspaces]);
  const [range, setRange] = useState('30d');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!slugs.length) { setLoading(false); return; }
    setLoading(true); setError('');
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const from = days != null ? Date.now() - days * 86400000 : undefined;
    opm.workspaceActivity({ workspace: slugs.join(','), from })
      .then(setData).catch((e: any) => setError(String(e?.message || e))).finally(() => setLoading(false));
  }, [slugs, range]);
  useEffect(() => { load(); }, [load]);

  const k = data?.kpis || {};
  const recent: any[] = data?.recent || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Live call analytics across this customer's workspace{slugs.length === 1 ? '' : 's'} ({slugs.join(', ') || '—'}), computed from the calls table.</p>
        <div className="inline-flex items-center rounded-lg border border-line bg-white p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${range === r.key ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {loading ? <LoadingBlock label="Loading activity…" /> : !slugs.length ? <EmptyState text="No workspaces linked to this customer yet." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total calls" value={fmt.int(k.total || 0)} sub={`${fmt.int(k.inbound || 0)} in · ${fmt.int(k.outbound || 0)} out`} icon={PhoneCall} accent="blue" />
            <KpiCard label="Pickup rate" value={fmt.pct(k.pickup_rate || 0)} sub={`${fmt.int(k.answered || 0)} answered`} icon={Gauge} accent="green" />
            <KpiCard label="Voicemail rate" value={fmt.pct(k.voicemail_rate || 0)} sub={`${fmt.int(k.voicemail || 0)} voicemails`} icon={Voicemail} accent="amber" />
            <KpiCard label="Avg call length" value={fmt.dur(k.avg_duration_seconds || 0)} sub={`${fmt.int(k.not_connected || 0)} not connected`} icon={Clock3} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total cost" value={fmt.money((k.total_cost_cents || 0) / 100)} sub="hard cost across calls" icon={DollarSign} accent="blue" />
            <KpiCard label="Avg cost / call" value={fmt.money((k.avg_cost_cents || 0) / 100)} sub="per billed call" icon={DollarSign} />
            <KpiCard label="Inbound" value={fmt.int(k.inbound || 0)} icon={PhoneIncoming} accent="green" />
            <KpiCard label="Outbound" value={fmt.int(k.outbound || 0)} icon={PhoneOutgoing} accent="amber" />
          </div>

          {(k.daily || []).length > 1 && (
            <SectionCard title="Call volume trend" description={`${(k.daily || []).length} active day${(k.daily || []).length === 1 ? '' : 's'}`}>
              <MiniTrend daily={k.daily || []} />
            </SectionCard>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Dispositions" description="Outcome, calls, and cost per disposition">
              {(k.dispositions || []).length === 0 ? <EmptyState text="No completed calls in this range." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="px-3 py-2">Disposition</th><th className="px-3 py-2 text-right">Count</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Share</th></tr>
                    </thead>
                    <tbody>
                      {(k.dispositions || []).map((row: any) => {
                        const color = dispositionColor(row.disposition);
                        return (
                          <tr key={row.disposition} className="border-t border-line">
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                                <StageIcon name={statusIconName(row.disposition) || undefined} color={color} />
                                {humanizeDisposition(row.disposition)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{fmt.int(row.count)}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmt.money((row.cost_cents || 0) / 100)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{k.total ? `${((row.count / k.total) * 100).toFixed(0)}%` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Agents used" description="Calls and cost per AI agent">
              {(k.agents || []).length === 0 ? <EmptyState text="No agent activity in this range." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="px-3 py-2">Agent</th><th className="px-3 py-2 text-right">Calls</th><th className="px-3 py-2 text-right">Cost</th></tr>
                    </thead>
                    <tbody>
                      {(k.agents || []).map((a: any) => (
                        <tr key={a.agent_id} className="border-t border-line">
                          <td className="px-3 py-2"><div className="flex items-center gap-1.5 font-medium text-ink"><Bot className="h-3.5 w-3.5 text-slate-400" /> {a.agent_name || a.agent_id}</div></td>
                          <td className="px-3 py-2 text-right font-mono">{fmt.int(a.count)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt.money((a.cost_cents || 0) / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Recent activity" description={`Latest ${recent.length} call${recent.length === 1 ? '' : 's'}`}>
            {recent.length === 0 ? <EmptyState text="No recent calls." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Dir</th><th className="px-3 py-2">Agent</th><th className="px-3 py-2">Disposition</th><th className="px-3 py-2 text-right">Length</th><th className="px-3 py-2 text-right">Cost</th></tr>
                  </thead>
                  <tbody>
                    {recent.map((c: any) => (
                      <tr key={c.call_id} className="border-t border-line hover:bg-surface">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{fmt.dateTime(Number(c.start_timestamp) || null)}</td>
                        <td className="px-3 py-2">{c.direction === 'inbound' ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-500" /> : <PhoneOutgoing className="h-3.5 w-3.5 text-amber-500" />}</td>
                        <td className="max-w-[150px] truncate px-3 py-2 text-slate-600">{c.agent_name || '—'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 text-slate-700">
                            <StageIcon name={statusIconName(c.disposition) || undefined} color={dispositionColor(c.disposition || '')} />
                            {humanizeDisposition(c.disposition)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmt.dur(c.duration_seconds || 0)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmt.money((Number(c.combined_cost_cents) || 0) / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

// Lightweight SVG bar trend for daily call volume (no chart dep needed here).
function MiniTrend({ daily }: { daily: { date: string; count: number }[] }) {
  const max = Math.max(1, ...daily.map((x) => x.count));
  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {daily.map((x) => (
        <div key={x.date} className="flex flex-1 flex-col items-center justify-end" title={`${x.date}: ${x.count}`}>
          <div className="w-full rounded-t bg-brand/70 transition hover:bg-brand" style={{ height: `${Math.max(3, (x.count / max) * 104)}px` }} />
        </div>
      ))}
    </div>
  );
}
