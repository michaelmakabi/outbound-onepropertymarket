import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminOps, workspaceStore, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { Building2, Users, PhoneCall, TrendingUp, Check, X, Pencil, LogIn, KeyRound, AlertCircle, Plus, Zap, Loader2, Phone, Bot, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, HelpCircle, DollarSign, Layers, ShieldCheck } from 'lucide-react';

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', onboarding: 'bg-amber-100 text-amber-700',
  paused: 'bg-slate-100 text-slate-600', trial_expired: 'bg-orange-100 text-orange-700', closed: 'bg-red-100 text-red-700',
};

type SortKey = 'name' | 'status' | 'leads' | 'calls' | 'agents' | 'users' | 'mult' | 'margin' | 'unbilled';

export default function Tenants() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);
  const [provision, setProvision] = useState<any>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'leads', dir: 'desc' });
  const [showHelp, setShowHelp] = useState(false);

  const load = () => adminOps.tenantsList().then((d: any) => { setTenants(d.tenants || []); setUsers(d.users || []); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = tenants.filter((t) => statusFilter === 'all' || t.status === statusFilter);
    if (needle) rows = rows.filter((t) => [t.display_name, t.slug, t.crm_workspace, t.dialer_slug, t.billing_slug, ...(t.workspaces || [])].filter(Boolean).some((s: string) => String(s).toLowerCase().includes(needle)));
    const val = (t: any, k: SortKey) => {
      switch (k) {
        case 'name': return (t.display_name || t.slug || '').toLowerCase();
        case 'status': return t.status || '';
        case 'mult': return t.billing?.multiplier ?? 0;
        case 'margin': return t.usage?.margin || 0;
        case 'unbilled': return t.usage?.unbilled || 0;
        default: return t[k] || 0;
      }
    };
    return [...rows].sort((a, b) => {
      const av = val(a, sort.key), bv = val(b, sort.key);
      const c = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.dir === 'asc' ? c : -c;
    });
  }, [tenants, q, statusFilter, sort]);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Customers are restricted to super admins.</div>;
  if (loading) return <Spinner />;

  const jumpIn = (t: any) => { workspaceStore.set(t.crm_workspace); window.location.assign('/'); };
  const openDetail = (t: any, tab?: string) => nav(`/tenants/${t.slug}${tab ? `?tab=${tab}` : ''}`);
  const toggleSort = (key: SortKey) => setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'status' ? 'asc' : 'desc' });

  const totalLeads = filtered.reduce((s, t) => s + (t.leads || 0), 0);
  const totalCalls = filtered.reduce((s, t) => s + (t.calls || 0), 0);
  const totalAgents = filtered.reduce((s, t) => s + (t.agents || 0), 0);
  const totalMargin = filtered.reduce((s, t) => s + (t.usage?.margin || 0), 0);
  const activeN = tenants.filter((t) => t.status === 'active').length;

  const SortTh = ({ label, k, align = 'right' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => (
    <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none hover:text-ink`} onClick={() => toggleSort(k)}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>{label}{sort.key === k ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
    </th>
  );
  // clickable metric cell — drills into that customer's detail scope
  const MetricCell = ({ t, tab, children, cls = '' }: any) => (
    <td className={`px-3 py-2.5 text-right tabular-nums ${cls}`}>
      <button className="rounded px-1.5 py-0.5 font-medium text-ink hover:bg-brand-light/50 hover:text-brand" onClick={(e) => { e.stopPropagation(); openDetail(t, tab); }}>{children}</button>
    </td>
  );

  return (
    <div>
      <PageHead title="Customers" subtitle="Every customer as one unified account — CRM, dialer, billing, and usage"
        right={<div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setShowHelp((v) => !v)}><HelpCircle className="h-4 w-4" /> How this works</button>
          <button className="btn-primary" onClick={() => setEdit({ slug: '', display_name: '', crm_workspace: '', dialer_slug: '', billing_slug: '', owner_user_id: '', status: 'onboarding', _new: true })}><Plus className="h-4 w-4" /> New customer</button>
        </div>} />

      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card p-4"><div className="label flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Customers</div><div className="mt-1 text-2xl font-bold text-ink">{tenants.length}</div><div className="text-[11px] text-slate-400">{activeN} active</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Leads</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.int(totalLeads)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5" /> Calls</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.int(totalCalls)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> AI agents</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.int(totalAgents)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Margin</div><div className={`mt-1 text-2xl font-bold ${totalMargin > 0 ? 'text-emerald-600' : 'text-ink'}`}>{fmt.money(totalMargin)}</div></div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-full pl-9" placeholder="Search customers, workspaces…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {['active', 'onboarding', 'paused', 'trial_expired', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-slate-400">{filtered.length} of {tenants.length}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortTh label="Customer" k="name" align="left" />
              <SortTh label="Status" k="status" align="left" />
              <th className="px-3 py-2.5">Dialer</th>
              <SortTh label="Leads" k="leads" />
              <SortTh label="Calls" k="calls" />
              <SortTh label="Agents" k="agents" />
              <SortTh label="Users" k="users" />
              <SortTh label="Mult" k="mult" />
              <SortTh label="Margin" k="margin" />
              <SortTh label="Unbilled" k="unbilled" />
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.slug} className="border-t border-line hover:bg-surface cursor-pointer" onClick={() => openDetail(t)}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-ink">{t.display_name || t.slug} <ChevronRight className="h-3.5 w-3.5 text-slate-300" /></div>
                  <div className="font-mono text-[11px] text-slate-400">{t.slug}{t.crm_workspace !== t.slug && <span> · crm:{t.crm_workspace}</span>}{t.dialer_slug && t.dialer_slug !== t.slug && <span> · dial:{t.dialer_slug}</span>}</div>
                </td>
                <td className="px-3 py-2.5"><span className={`pill ${statusColor[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span></td>
                <td className="px-3 py-2.5">{t.has_key ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><KeyRound className="h-3.5 w-3.5" /> key</span> : <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle className="h-3.5 w-3.5" /> none</span>}</td>
                <MetricCell t={t} tab="activity">{fmt.int(t.leads)}</MetricCell>
                <MetricCell t={t} tab="activity">{fmt.int(t.calls)}</MetricCell>
                <MetricCell t={t} tab="agents">{fmt.int(t.agents)}</MetricCell>
                <MetricCell t={t} tab="users">{fmt.int(t.users)}</MetricCell>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.billing?.multiplier ?? '—'}×</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmt.money(t.usage?.margin || 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt.money(t.usage?.unbilled || 0)}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="Provision dialer" onClick={() => setProvision(t)}><Zap className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="Jump into this account's CRM" onClick={() => jumpIn(t)}><LogIn className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="Edit" onClick={() => setEdit({ ...t, owner_user_id: t.owner_user_id || '' })}><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">No customers match your search.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <TenantModal t={edit} users={users} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {provision && <ProvisionModal t={provision} onClose={() => setProvision(null)} onDone={() => load()} />}
    </div>
  );
}

// Plain-language explainer of the model for super admins — what each concept is and how billing works.
function HelpPanel({ onClose }: { onClose: () => void }) {
  const Concept = ({ icon, title, children }: any) => (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-1.5 flex items-center gap-2 font-bold text-ink">{icon} {title}</div>
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );
  return (
    <div className="mb-5 rounded-2xl border border-brand/20 bg-brand-light/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><HelpCircle className="h-5 w-5 text-brand" /> How the model works</h3>
        <button className="rounded-lg p-1 text-slate-400 hover:bg-white" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-slate-600">A <span className="font-semibold text-ink">customer</span> is one paying account. Everything they use lives inside the workspace we provision for them, and all of that usage bills back to them automatically. Here's each piece:</p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Concept icon={<Building2 className="h-4 w-4 text-brand" />} title="Customer">
          The company that pays. One customer = one unified account. Create one with <span className="font-semibold">New customer</span>; everything below hangs off it.
        </Concept>
        <Concept icon={<Layers className="h-4 w-4 text-brand" />} title="Workspace">
          The private space we provision for a customer. It has three roles that are usually the same ID: <span className="font-semibold">CRM</span> (their leads &amp; contacts), <span className="font-semibold">dialer</span> (the voice account that places calls &amp; holds their agents), and <span className="font-semibold">billing</span> (where usage is totaled). Legacy accounts like 1PM split these — that's why you'll see <span className="font-mono text-[11px]">crm:pitman</span> under it.
        </Concept>
        <Concept icon={<Bot className="h-4 w-4 text-brand" />} title="Agents">
          The AI callers inside a customer's workspace. Whichever agent a customer uses — original or cloned — its calls belong to that customer.
        </Concept>
        <Concept icon={<ShieldCheck className="h-4 w-4 text-brand" />} title="Users & agent scope">
          The people who log into a customer's account. Each user can be given access to all agents, only certain agents, or all-except some — shown plainly as “can use / cannot use” on the customer's page.
        </Concept>
        <Concept icon={<DollarSign className="h-4 w-4 text-brand" />} title="Billing follows the customer">
          Every call's cost books to the customer whose workspace it ran in — automatically, no matter which agent placed it. It's <span className="font-semibold">pay-as-you-go</span>: usage is metered, marked up by the customer's multiplier, and collected on drafts. <span className="font-semibold text-ink">Nothing is ever auto-charged</span> — invoices stay drafts until you deliberately send them.
        </Concept>
        <Concept icon={<Zap className="h-4 w-4 text-brand" />} title="Shared voice account (rare)">
          If two customers ever share <span className="italic">one</span> voice account, open a customer → <span className="font-semibold">Agents</span> and set each agent's “Bills to.” Only then does per-agent routing kick in; otherwise everything follows the workspace above.
        </Concept>
      </div>
      <p className="mt-4 text-xs text-slate-500">Tip: click any customer row — or a Leads / Calls / Agents / Users number — to drill into that account's detail, users, agents, and activity.</p>
    </div>
  );
}

function ProvisionModal({ t, onClose, onDone }: any) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<any>(null);

  const run = async (auto_wire: boolean) => {
    setErr(''); setBusy(true);
    try {
      const r = await adminOps.provisionTenant({ slug: t.slug, api_key: apiKey.trim() || undefined, auto_wire });
      setRes(r.provision);
      onDone();
    } catch (e: any) { setErr(e?.message || 'Provisioning failed'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><Zap className="h-5 w-5 text-brand" /> Provision dialer</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">Connect <span className="font-semibold text-ink">{t.display_name || t.slug}</span> to its own voice-platform subaccount. Paste the subaccount's API key — we'll discover its agents and phone numbers and wire up outbound dialing automatically.</p>

        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}

        <label className="block"><span className="label mb-1 block">Voice-platform API key {t.has_key && <span className="ml-1 text-[10px] text-emerald-600">(key already on file — leave blank to keep it)</span>}</span>
          <input className="input w-full font-mono text-xs" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t.has_key ? '•••••• (keep existing)' : 'key_...'} /></label>

        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1" disabled={busy} onClick={() => run(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Discover only'}</button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => run(true)}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Zap className="h-4 w-4" /> Save key & auto-wire</>}</button>
        </div>

        {res && (
          <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface p-3 text-sm">
            <div className="flex items-center gap-2">{res.has_key ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-red-500" />} <span className="font-semibold text-ink">Dialer key</span> <span className="text-slate-500">{res.has_key ? 'on file' : 'missing'}</span></div>
            <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-slate-400" /> <span className="font-semibold text-ink">{res.agents?.length || 0}</span> <span className="text-slate-500">agent(s)</span></div>
            {res.agents?.length > 0 && <div className="pl-6 text-[11px] text-slate-500">{res.agents.map((a: any) => a.agent_name).join(', ')}</div>}
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> <span className="font-semibold text-ink">{res.numbers?.length || 0}</span> <span className="text-slate-500">phone number(s)</span></div>
            {res.numbers?.length > 0 && <div className="pl-6 font-mono text-[11px] text-slate-500">{res.numbers.join(', ')}</div>}
            <div className="flex items-center gap-2">{res.dialer_configured ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-500" />} <span className="font-semibold text-ink">Dialer routing</span> <span className="text-slate-500">{res.dialer_configured ? (res.wired ? `wired → ${res.wired_agent?.slice(0, 14)}… · ${res.wired_numbers} number(s)` : 'configured') : 'not configured'}</span></div>
            {res.retell_error && <div className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-600">Dialer: {res.retell_error}</div>}
            {res.has_key && !res.agents?.length && <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">No agents found in this subaccount yet — create one on the voice platform, then re-run.</div>}
            {res.has_key && res.agents?.length > 0 && !res.numbers?.length && <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">No phone numbers in this subaccount yet — buy/import one, then re-run.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

function TenantModal({ t, users, onClose, onSaved }: any) {
  const [form, setForm] = useState<any>({
    slug: t.slug || '', display_name: t.display_name || '', crm_workspace: t.crm_workspace || '',
    dialer_slug: t.dialer_slug || '', billing_slug: t.billing_slug || '', owner_user_id: t.owner_user_id || '', status: t.status || 'onboarding', _slugTouched: false,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !!t._new;
  const [adv, setAdv] = useState(!isNew && !!((form.crm_workspace && form.crm_workspace !== form.slug) || (form.dialer_slug && form.dialer_slug !== form.slug) || (form.billing_slug && form.billing_slug !== form.slug)));

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const s = isNew ? slugify(form.slug) : form.slug;
      await adminOps.tenantUpsert({
        slug: s, display_name: form.display_name,
        crm_workspace: (adv && form.crm_workspace) || s, dialer_slug: (adv && form.dialer_slug) || s,
        billing_slug: (adv && form.billing_slug) || s, status: form.status,
        owner_user_id: form.owner_user_id ? Number(form.owner_user_id) : null,
      });
      onSaved();
    } catch (e: any) { setErr(e?.message || 'Save failed'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-ink">{isNew ? 'New customer' : `Edit ${t.display_name || t.slug}`}</h3><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button></div>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="label mb-1 block">Company name</span><input className="input w-full" value={form.display_name} autoFocus onChange={(e) => setForm({ ...form, display_name: e.target.value, ...(isNew && !form._slugTouched ? { slug: slugify(e.target.value) } : {}) })} placeholder="Acme Realty" /></label>
          <label className="block"><span className="label mb-1 block">Workspace ID {isNew && <span className="text-[10px] text-slate-400">(one ID for CRM, dialing &amp; billing)</span>}</span><input className="input w-full font-mono text-xs" value={form.slug} disabled={!isNew} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value), _slugTouched: true })} placeholder="acme_realty" /></label>
          <label className="block"><span className="label mb-1 block">Status</span>
            <select className="input w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['active', 'onboarding', 'paused', 'trial_expired', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <label className="block"><span className="label mb-1 block">Owner (company admin)</span>
            <select className="input w-full" value={form.owner_user_id} onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}>
              <option value="">— none —</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select></label>

          {!adv ? (
            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => setAdv(true)}>Advanced mapping ▸</button>
          ) : (
            <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
              <div className="text-[11px] font-semibold text-slate-500">Advanced mapping — only needed when this customer's CRM, dialer, or billing IDs differ from the workspace ID.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <label className="block"><span className="label mb-1 block">CRM</span><input className="input w-full font-mono text-[11px]" value={form.crm_workspace} onChange={(e) => setForm({ ...form, crm_workspace: e.target.value })} placeholder="= id" /></label>
                <label className="block"><span className="label mb-1 block">Dialer</span><input className="input w-full font-mono text-[11px]" value={form.dialer_slug} onChange={(e) => setForm({ ...form, dialer_slug: e.target.value })} placeholder="= id" /></label>
                <label className="block"><span className="label mb-1 block">Billing</span><input className="input w-full font-mono text-[11px]" value={form.billing_slug} onChange={(e) => setForm({ ...form, billing_slug: e.target.value })} placeholder="= id" /></label>
              </div>
            </div>
          )}
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy || !form.slug} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create customer' : <><Check className="h-4 w-4" /> Save changes</>}</button>
      </div>
    </div>
  );
}
