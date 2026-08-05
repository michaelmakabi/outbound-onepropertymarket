import { useEffect, useState } from 'react';
import { adminOps, workspaceStore, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { Building2, Users, PhoneCall, TrendingUp, Check, X, Pencil, LogIn, KeyRound, AlertCircle, Plus, Zap, Loader2, Phone, Bot } from 'lucide-react';

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', onboarding: 'bg-amber-100 text-amber-700',
  paused: 'bg-slate-100 text-slate-600', trial_expired: 'bg-orange-100 text-orange-700', closed: 'bg-red-100 text-red-700',
};

export default function Tenants() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any>(null);
  const [provision, setProvision] = useState<any>(null);

  const load = () => adminOps.tenantsList().then((d: any) => { setTenants(d.tenants || []); setUsers(d.users || []); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Tenants are restricted to super admins.</div>;
  if (loading) return <Spinner />;

  const jumpIn = (t: any) => { workspaceStore.set(t.crm_workspace); window.location.assign('/'); };

  const totalLeads = tenants.reduce((s, t) => s + (t.leads || 0), 0);
  const totalAgents = tenants.reduce((s, t) => s + (t.agents || 0), 0);
  const totalRetail = tenants.reduce((s, t) => s + (t.usage?.retail || 0), 0);
  const totalMargin = tenants.reduce((s, t) => s + (t.usage?.margin || 0), 0);
  const activeN = tenants.filter((t) => t.status === 'active').length;

  return (
    <div>
      <PageHead title="Tenants" subtitle="Every customer as one unified account — CRM, dialer, billing, and usage"
        right={<button className="btn-primary" onClick={() => setEdit({ slug: '', display_name: '', crm_workspace: '', dialer_slug: '', billing_slug: '', owner_user_id: '', status: 'onboarding', _new: true })}><Plus className="h-4 w-4" /> New tenant</button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card p-4"><div className="label flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Customers</div><div className="mt-1 text-2xl font-bold text-ink">{tenants.length}</div><div className="text-[11px] text-slate-400">{activeN} active</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Leads</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.int(totalLeads)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5" /> AI agents</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.int(totalAgents)}</div></div>
        <div className="card p-4"><div className="label">Retail usage</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.money(totalRetail)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Margin</div><div className={`mt-1 text-2xl font-bold ${totalMargin > 0 ? 'text-emerald-600' : 'text-ink'}`}>{fmt.money(totalMargin)}</div></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Retell</th>
              <th className="px-3 py-2.5 text-right">Leads</th>
              <th className="px-3 py-2.5 text-right">Agents</th>
              <th className="px-3 py-2.5 text-right">Users</th>
              <th className="px-3 py-2.5 text-right">Mult</th>
              <th className="px-3 py-2.5 text-right">Hard cost</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
              <th className="px-3 py-2.5 text-right">Unbilled</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.slug} className="border-t border-line hover:bg-surface">
                <td className="px-4 py-2.5">
                  <div className="font-semibold text-ink">{t.display_name || t.slug}</div>
                  <div className="font-mono text-[11px] text-slate-400">{t.slug}{t.crm_workspace !== t.slug && <span> · crm:{t.crm_workspace}</span>}</div>
                </td>
                <td className="px-3 py-2.5"><span className={`pill ${statusColor[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status}</span></td>
                <td className="px-3 py-2.5">{t.has_key ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><KeyRound className="h-3.5 w-3.5" /> key</span> : <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle className="h-3.5 w-3.5" /> none</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(t.leads)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(t.agents)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt.int(t.users)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{t.billing?.multiplier ?? '—'}×</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt.money(t.usage?.hard || 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmt.money(t.usage?.margin || 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt.money(t.usage?.unbilled || 0)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="Provision dialer (Retell)" onClick={() => setProvision(t)}><Zap className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="Jump into this account's CRM" onClick={() => jumpIn(t)}><LogIn className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="Edit" onClick={() => setEdit({ ...t, owner_user_id: t.owner_user_id || '' })}><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && <TenantModal t={edit} users={users} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {provision && <ProvisionModal t={provision} onClose={() => setProvision(null)} onDone={() => load()} />}
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
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><Zap className="h-5 w-5 text-brand" /> Provision dialer</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">Connect <span className="font-semibold text-ink">{t.display_name || t.slug}</span> to its own Retell subaccount. Paste the subaccount's API key — we'll discover its agents and phone numbers and wire up outbound dialing automatically.</p>

        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}

        <label className="block"><span className="label mb-1 block">Retell API key {t.has_key && <span className="ml-1 text-[10px] text-emerald-600">(key already on file — leave blank to keep it)</span>}</span>
          <input className="input w-full font-mono text-xs" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t.has_key ? '•••••• (keep existing)' : 'key_...'} /></label>

        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1" disabled={busy} onClick={() => run(false)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Discover only'}</button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => run(true)}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working…</> : <><Zap className="h-4 w-4" /> Save key & auto-wire</>}</button>
        </div>

        {res && (
          <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface p-3 text-sm">
            <div className="flex items-center gap-2">{res.has_key ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-red-500" />} <span className="font-semibold text-ink">Retell key</span> <span className="text-slate-500">{res.has_key ? 'on file' : 'missing'}</span></div>
            <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-slate-400" /> <span className="font-semibold text-ink">{res.agents?.length || 0}</span> <span className="text-slate-500">agent(s)</span></div>
            {res.agents?.length > 0 && <div className="pl-6 text-[11px] text-slate-500">{res.agents.map((a: any) => a.agent_name).join(', ')}</div>}
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> <span className="font-semibold text-ink">{res.numbers?.length || 0}</span> <span className="text-slate-500">phone number(s)</span></div>
            {res.numbers?.length > 0 && <div className="pl-6 font-mono text-[11px] text-slate-500">{res.numbers.join(', ')}</div>}
            <div className="flex items-center gap-2">{res.dialer_configured ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-500" />} <span className="font-semibold text-ink">Dialer routing</span> <span className="text-slate-500">{res.dialer_configured ? (res.wired ? `wired → ${res.wired_agent?.slice(0, 14)}… · ${res.wired_numbers} number(s)` : 'configured') : 'not configured'}</span></div>
            {res.retell_error && <div className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-600">Retell: {res.retell_error}</div>}
            {res.has_key && !res.agents?.length && <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">No agents found in this Retell subaccount yet — create one in Retell, then re-run.</div>}
            {res.has_key && res.agents?.length > 0 && !res.numbers?.length && <div className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">No phone numbers in this subaccount yet — buy/import one in Retell, then re-run.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function TenantModal({ t, users, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    slug: t.slug || '', display_name: t.display_name || '', crm_workspace: t.crm_workspace || '',
    dialer_slug: t.dialer_slug || '', billing_slug: t.billing_slug || '', owner_user_id: t.owner_user_id || '', status: t.status || 'onboarding',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !!t._new;

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await adminOps.tenantUpsert({
        slug: form.slug, display_name: form.display_name,
        crm_workspace: form.crm_workspace || form.slug, dialer_slug: form.dialer_slug || null,
        billing_slug: form.billing_slug || form.slug, status: form.status,
        owner_user_id: form.owner_user_id ? Number(form.owner_user_id) : null,
      });
      onSaved();
    } catch (e: any) { setErr(e?.message || 'Save failed'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-ink">{isNew ? 'New tenant' : `Edit ${t.display_name || t.slug}`}</h3><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button></div>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="space-y-3">
          <label className="block"><span className="label mb-1 block">Canonical slug</span><input className="input w-full font-mono text-xs" value={form.slug} disabled={!isNew} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme_realty" /></label>
          <label className="block"><span className="label mb-1 block">Display name</span><input className="input w-full" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label mb-1 block">CRM workspace</span><input className="input w-full font-mono text-xs" value={form.crm_workspace} onChange={(e) => setForm({ ...form, crm_workspace: e.target.value })} placeholder="= slug" /></label>
            <label className="block"><span className="label mb-1 block">Dialer slug (Retell)</span><input className="input w-full font-mono text-xs" value={form.dialer_slug} onChange={(e) => setForm({ ...form, dialer_slug: e.target.value })} placeholder="= slug" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label mb-1 block">Billing slug</span><input className="input w-full font-mono text-xs" value={form.billing_slug} onChange={(e) => setForm({ ...form, billing_slug: e.target.value })} placeholder="= slug" /></label>
            <label className="block"><span className="label mb-1 block">Status</span>
              <select className="input w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['active', 'onboarding', 'paused', 'trial_expired', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
          </div>
          <label className="block"><span className="label mb-1 block">Owner (company admin)</span>
            <select className="input w-full" value={form.owner_user_id} onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}>
              <option value="">— none —</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select></label>
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy || !form.slug} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create tenant' : <><Check className="h-4 w-4" /> Save changes</>}</button>
      </div>
    </div>
  );
}
