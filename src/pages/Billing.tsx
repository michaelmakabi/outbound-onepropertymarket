import { useEffect, useState } from 'react';
import { opm, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { DollarSign, Check, AlertCircle, TrendingUp, CreditCard, Info } from 'lucide-react';

const MODES = [
  { value: 'full_retail', label: 'Full retail (bill hard cost × multiplier)' },
  { value: 'margin_split', label: 'Margin split' },
  { value: 'live_metered', label: 'Live metered' },
];
const STATUSES = ['onboarding', 'active', 'paused', 'closed'];
const statusColor: Record<string, string> = {
  onboarding: 'bg-amber-100 text-amber-700', active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-slate-100 text-slate-600', closed: 'bg-red-100 text-red-700',
};

export default function Billing() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerPopulated, setLedgerPopulated] = useState(false);

  const load = () => opm.billingOverview().then((d: any) => { setRows(d.workspaces || []); setLedgerPopulated(!!d.ledger_populated); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Billing is restricted to super admins.</div>;
  if (loading) return <Spinner />;

  const totalEstHard = rows.reduce((s, r) => s + (r.estimate?.hard_cost || 0), 0);
  const totalEstRetail = rows.reduce((s, r) => s + (r.estimate?.retail_price || 0), 0);
  const totalEstMargin = rows.reduce((s, r) => s + (r.estimate?.margin || 0), 0);

  return (
    <div>
      <PageHead title="Billing" subtitle="Per-tenant rebilling — hard cost, your multiplier, retail, and margin" />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          {ledgerPopulated
            ? 'Figures below combine the billed cost ledger with a live estimate from priced calls.'
            : 'The cost ledger isn’t receiving events yet, so figures are a live estimate computed directly from priced calls (hard cost × each tenant’s multiplier). No charges are issued from this screen — invoicing to Stripe is a separate, deliberate step.'}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="label flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Hard cost (est.)</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.money(totalEstHard)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Retail (est.)</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.money(totalEstRetail)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Margin (est.)</div><div className={`mt-1 text-2xl font-bold ${totalEstMargin > 0 ? 'text-emerald-600' : 'text-ink'}`}>{fmt.money(totalEstMargin)}</div></div>
      </div>

      <div className="space-y-4">
        {rows.map((r) => <TenantCard key={r.workspace_slug} row={r} onSaved={load} />)}
        {rows.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">No billing workspaces configured yet.</div>}
      </div>
    </div>
  );
}

function TenantCard({ row, onSaved }: { row: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    display_name: row.display_name || '', billing_mode: row.billing_mode, status: row.status,
    default_multiplier: String(row.default_multiplier ?? '1'), stripe_customer_id: row.stripe_customer_id || '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const dirty = form.display_name !== (row.display_name || '') || form.billing_mode !== row.billing_mode ||
    form.status !== row.status || form.default_multiplier !== String(row.default_multiplier ?? '1') ||
    form.stripe_customer_id !== (row.stripe_customer_id || '');

  const mult = Number(form.default_multiplier) || 0;
  const est = row.estimate || { hard_cost: 0, retail_price: 0, margin: 0, calls: 0 };
  // Recompute retail/margin live as the multiplier is edited, so the impact is visible before saving.
  const previewRetail = est.hard_cost * mult;
  const previewMargin = previewRetail - est.hard_cost;

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await opm.billingSetConfig({
        workspace_slug: row.workspace_slug, display_name: form.display_name,
        billing_mode: form.billing_mode, status: form.status,
        default_multiplier: Number(form.default_multiplier), stripe_customer_id: form.stripe_customer_id,
      });
      setSaved(true); setTimeout(() => setSaved(false), 1500); onSaved();
    } catch (e: any) { setErr(e?.message || 'Save failed.'); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-ink">{row.display_name || row.workspace_slug}</h3>
            <span className={`pill ${statusColor[form.status] || 'bg-slate-100 text-slate-600'}`}>{form.status}</span>
          </div>
          <div className="font-mono text-xs text-slate-400">{row.workspace_slug}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {est.calls.toLocaleString()} priced calls
          {row.ledger?.events > 0 && <span> · {row.ledger.events.toLocaleString()} ledger events</span>}
        </div>
      </div>

      {/* money row */}
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl bg-surface px-4 py-3">
        <div><div className="label">Hard cost</div><div className="text-lg font-bold text-ink">{fmt.money(est.hard_cost)}</div></div>
        <div><div className="label">Retail @ {mult}×</div><div className="text-lg font-bold text-ink">{fmt.money(previewRetail)}</div></div>
        <div><div className="label">Margin</div><div className={`text-lg font-bold ${previewMargin > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{fmt.money(previewMargin)}</div></div>
      </div>

      {/* config row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="block"><span className="label mb-1 block">Display name</span>
          <input className="input w-full" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
        <label className="block"><span className="label mb-1 block">Billing mode</span>
          <select className="input w-full" value={form.billing_mode} onChange={(e) => setForm({ ...form, billing_mode: e.target.value })}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select></label>
        <label className="block"><span className="label mb-1 block">Multiplier</span>
          <input className="input w-full" type="number" step="0.05" min="0" value={form.default_multiplier} onChange={(e) => setForm({ ...form, default_multiplier: e.target.value })} /></label>
        <label className="block"><span className="label mb-1 block">Status</span>
          <select className="input w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
        <label className="block md:col-span-2"><span className="label mb-1 block">Stripe customer ID</span>
          <input className="input w-full font-mono text-xs" placeholder="cus_… (optional)" value={form.stripe_customer_id} onChange={(e) => setForm({ ...form, stripe_customer_id: e.target.value })} /></label>
        <div className="flex items-end md:col-span-2 md:justify-end">
          {err && <span className="mr-3 flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {err}</span>}
          <button className="btn-primary disabled:opacity-50" disabled={!dirty || busy} onClick={save}>
            {saved ? <><Check className="h-4 w-4" /> Saved</> : busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
