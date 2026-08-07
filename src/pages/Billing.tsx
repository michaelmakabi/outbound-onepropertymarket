import { useEffect, useState } from 'react';
import { opm, billing, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { DollarSign, Check, AlertCircle, TrendingUp, CreditCard, Info, RefreshCw, FileText, Loader2, ExternalLink } from 'lucide-react';

const MODES = [
  { value: 'full_retail', label: 'Full retail (bill hard cost × multiplier)' },
  { value: 'margin_split', label: 'Margin split (bill the margin only)' },
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
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const load = () => opm.billingOverview().then((d: any) => { setRows(d.workspaces || []); setLedgerPopulated(!!d.ledger_populated); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Billing is restricted to super admins.</div>;
  if (loading) return <Spinner />;

  const sync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const r = await billing.ingestCalls();
      setSyncMsg(`Ledger synced — ${r.new} new event${r.new === 1 ? '' : 's'} booked, ${r.existing} already present.`);
      await load();
    } catch (e: any) { setSyncMsg(e?.message || 'Sync failed.'); } finally { setSyncing(false); }
  };

  // Prefer real ledger figures when present; fall back to the live estimate.
  const val = (r: any, k: string) => (r.ledger?.events > 0 ? r.ledger : r.estimate)[k] || 0;
  const totalHard = rows.reduce((s, r) => s + val(r, 'hard_cost'), 0);
  const totalRetail = rows.reduce((s, r) => s + (r.ledger?.events > 0 ? r.ledger.retail_price : r.estimate.retail_price || 0), 0);
  const totalMargin = rows.reduce((s, r) => s + (r.ledger?.events > 0 ? r.ledger.margin : r.estimate.margin || 0), 0);

  return (
    <div>
      <PageHead title="Billing" subtitle="Per-tenant rebilling — hard cost, your multiplier, retail, and margin"
        right={<button className="btn-ghost" disabled={syncing} onClick={sync}>{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync ledger from calls</button>} />

      {syncMsg && <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> {syncMsg}</div>}

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          {ledgerPopulated
            ? 'Figures reflect the booked cost ledger. Invoices are generated as Stripe drafts from the unbilled ledger — nothing is charged until you finalize a draft in Stripe.'
            : 'The cost ledger is empty. Click “Sync ledger from calls” to book priced calls into the ledger (idempotent). Until then, figures are a live estimate. No charges are ever issued from this screen.'}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="label flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Hard cost</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.money(totalHard)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Retail</div><div className="mt-1 text-2xl font-bold text-ink">{fmt.money(totalRetail)}</div></div>
        <div className="card p-4"><div className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Margin</div><div className={`mt-1 text-2xl font-bold ${totalMargin > 0 ? 'text-emerald-600' : 'text-ink'}`}>{fmt.money(totalMargin)}</div></div>
      </div>

      <div className="space-y-4">
        {rows.map((r) => <TenantCard key={r.workspace_slug} row={r} onChanged={load} />)}
        {rows.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">No billing workspaces configured yet.</div>}
      </div>
    </div>
  );
}

function TenantCard({ row, onChanged }: { row: any; onChanged: () => void }) {
  const [form, setForm] = useState({
    display_name: row.display_name || '', billing_mode: row.billing_mode, status: row.status,
    default_multiplier: String(row.default_multiplier ?? '1'), stripe_customer_id: row.stripe_customer_id || '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [action, setAction] = useState<'' | 'customer' | 'invoice'>('');
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const dirty = form.display_name !== (row.display_name || '') || form.billing_mode !== row.billing_mode ||
    form.status !== row.status || form.default_multiplier !== String(row.default_multiplier ?? '1') ||
    form.stripe_customer_id !== (row.stripe_customer_id || '');

  const mult = Number(form.default_multiplier) || 0;
  const hasLedger = row.ledger?.events > 0;
  const base = hasLedger ? row.ledger : row.estimate;
  // Live preview against the current multiplier (uses hard cost, which is multiplier-independent).
  const previewRetail = (base.hard_cost || 0) * mult;
  const previewMargin = previewRetail - (base.hard_cost || 0);
  const billable = hasLedger ? row.ledger.billable_amount : previewRetail;

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await opm.billingSetConfig({
        workspace_slug: row.workspace_slug, display_name: form.display_name,
        billing_mode: form.billing_mode, status: form.status,
        default_multiplier: Number(form.default_multiplier), stripe_customer_id: form.stripe_customer_id,
      });
      setSaved(true); setTimeout(() => setSaved(false), 1500); onChanged();
    } catch (e: any) { setErr(e?.message || 'Save failed.'); } finally { setBusy(false); }
  };

  const createCustomer = async () => {
    setActionMsg(null); setAction('customer');
    try {
      const r = await billing.createCustomer(row.workspace_slug);
      setActionMsg({ ok: true, text: `Stripe customer ${r.stripe_customer_id}${r.existed ? ' (already linked)' : ' created'}.` });
      onChanged();
    } catch (e: any) { setActionMsg({ ok: false, text: e?.message || 'Could not create customer.' }); } finally { setAction(''); }
  };
  const generateInvoice = async () => {
    if (!confirm(`Generate a DRAFT Stripe invoice for ${row.display_name || row.workspace_slug} from the unbilled ledger? This does not charge anyone — it creates a draft you finalize in Stripe.`)) return;
    setActionMsg(null); setAction('invoice');
    try {
      const r = await billing.generateInvoice(row.workspace_slug);
      if (r.nothing_to_bill) setActionMsg({ ok: true, text: 'Nothing unbilled to invoice.' });
      else setActionMsg({ ok: true, text: `Draft invoice ${r.stripe_invoice_id} for ${fmt.money(r.amount)} (${r.events} events, status ${r.status}).`, url: r.hosted_invoice_url });
      onChanged();
    } catch (e: any) { setActionMsg({ ok: false, text: e?.message || 'Could not generate invoice.' }); } finally { setAction(''); }
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-ink">{row.display_name || row.workspace_slug}</h3>
            <span className={`pill ${statusColor[form.status] || 'bg-slate-100 text-slate-600'}`}>{form.status}</span>
            {!hasLedger && <span className="pill bg-slate-100 text-slate-500">estimate</span>}
          </div>
          <div className="font-mono text-xs text-slate-400">{row.workspace_slug}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {(base.calls ?? base.events ?? 0).toLocaleString()} {hasLedger ? 'ledger events' : 'priced calls'}
        </div>
      </div>

      {/* money row */}
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-surface px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><div className="label">Hard cost</div><div className="text-lg font-bold text-ink">{fmt.money(base.hard_cost || 0)}</div></div>
        <div><div className="label">Retail @ {mult}×</div><div className="text-lg font-bold text-ink">{fmt.money(previewRetail)}</div></div>
        <div><div className="label">Margin</div><div className={`text-lg font-bold ${previewMargin > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{fmt.money(previewMargin)}</div></div>
        <div><div className="label">Billable</div><div className="text-lg font-bold text-ink">{fmt.money(billable)}</div></div>
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
          <input className="input w-full font-mono text-xs" placeholder="cus_… (or create one below)" value={form.stripe_customer_id} onChange={(e) => setForm({ ...form, stripe_customer_id: e.target.value })} /></label>
        <div className="flex items-end md:col-span-2 md:justify-end">
          {err && <span className="mr-3 flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {err}</span>}
          <button className="btn-primary disabled:opacity-50" disabled={!dirty || busy} onClick={save}>
            {saved ? <><Check className="h-4 w-4" /> Saved</> : busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Stripe actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {!row.stripe_customer_id
          ? <button className="btn-ghost" disabled={action === 'customer'} onClick={createCustomer}>{action === 'customer' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Create Stripe customer</button>
          : <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-slate-600"><CreditCard className="h-3.5 w-3.5" /> <span className="font-mono">{row.stripe_customer_id}</span></span>}
        <button className="btn-ghost" disabled={action === 'invoice' || !row.stripe_customer_id} onClick={generateInvoice} title={!row.stripe_customer_id ? 'Create a Stripe customer first' : ''}>
          {action === 'invoice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate draft invoice
        </button>
        {actionMsg && (
          <span className={`inline-flex items-center gap-1 text-xs ${actionMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {actionMsg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {actionMsg.text}
            {actionMsg.url && <a href={actionMsg.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-brand underline">view <ExternalLink className="h-3 w-3" /></a>}
          </span>
        )}
      </div>
    </div>
  );
}
