import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { adminOps, workspaceStore, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';
import { ArrowLeft, Building2, Users, PhoneCall, Bot, KeyRound, AlertCircle, LogIn, Check, Ban, ShieldCheck, Crown, Layers, TrendingUp, DollarSign } from 'lucide-react';

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

  useEffect(() => { setLoading(true); adminOps.tenantDetail(slug).then(setD).catch((e) => setErr(e?.message || 'Failed to load')).finally(() => setLoading(false)); }, [slug]);

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
      {tab === 'users' && <UsersTab d={d} />}
      {tab === 'agents' && <AgentsTab d={d} />}
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

function UsersTab({ d }: any) {
  if (!d.users.length) return <div className="card p-8 text-center text-sm text-slate-400">No users have access to this customer's workspaces yet.</div>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Each user's agent scope is shown explicitly — the agents they <span className="font-semibold text-emerald-600">can</span> use and the ones they <span className="font-semibold text-red-500">cannot</span>. Scope is set per workspace on the user's access record.</p>
      {d.users.map((u: any, i: number) => (
        <div key={i} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-ink">{u.name}</div>
              {u.workspace_role === 'owner' && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"><Crown className="h-3 w-3" /> owner</span>}
              {u.role && <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{u.role}</span>}
              {u.disabled && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">disabled</span>}
            </div>
            <div className="font-mono text-[11px] text-slate-400">{u.email} · ws:{u.workspace}</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 font-semibold text-slate-600"><ShieldCheck className="h-3.5 w-3.5" /> mode: {u.agent_mode}</span>
            <span className="text-emerald-600">{u.allowed_count} allowed</span>
            <span className="text-slate-300">·</span>
            <span className="text-red-500">{u.blocked_count} blocked</span>
          </div>
          {u.agent_mode === 'all' ? (
            <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" /> Full access — can use every agent in this account ({u.allowed_count}).</div>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600"><Check className="h-3 w-3" /> Can use</div>
                <div className="flex flex-wrap gap-1">{u.allowed_agents.length ? u.allowed_agents.map((a: any) => <span key={a.agent_id} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">{a.agent_name}</span>) : <span className="text-[11px] text-slate-400">none</span>}</div>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-red-500"><Ban className="h-3 w-3" /> Cannot use</div>
                <div className="flex flex-wrap gap-1">{u.blocked_agents.length ? u.blocked_agents.map((a: any) => <span key={a.agent_id} className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-600">{a.agent_name}</span>) : <span className="text-[11px] text-slate-400">none</span>}</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AgentsTab({ d }: any) {
  if (!d.agents.length) return <div className="card p-8 text-center text-sm text-slate-400">No agents connected in this customer's workspaces yet.</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-4 py-2.5">Agent</th><th className="px-3 py-2.5">Workspace</th><th className="px-3 py-2.5 text-right">Calls</th></tr>
        </thead>
        <tbody>
          {d.agents.map((a: any) => (
            <tr key={a.agent_id} className="border-t border-line hover:bg-surface">
              <td className="px-4 py-2.5"><div className="font-semibold text-ink">{a.agent_name}</div><div className="font-mono text-[11px] text-slate-400">{a.agent_id}</div></td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{a.workspace}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink">{fmt.int(a.calls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityTab({ d }: any) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-4 py-2.5">Workspace</th><th className="px-3 py-2.5">Role</th><th className="px-3 py-2.5 text-right">Leads</th><th className="px-3 py-2.5 text-right">Contacts</th><th className="px-3 py-2.5 text-right">Calls</th><th className="px-3 py-2.5 text-right">Agents</th></tr>
        </thead>
        <tbody>
          {d.workspaces.map((w: any) => (
            <tr key={w.workspace} className="border-t border-line hover:bg-surface">
              <td className="px-4 py-2.5 font-mono text-xs font-semibold text-ink">{w.workspace}</td>
              <td className="px-3 py-2.5 text-slate-500">{w.role}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(w.leads)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(w.contacts)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(w.calls)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(w.agents)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-line bg-surface/50 font-semibold">
            <td className="px-4 py-2.5 text-ink">Total</td><td></td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(d.totals.leads)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(d.totals.contacts)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(d.totals.calls)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(d.totals.agents)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
