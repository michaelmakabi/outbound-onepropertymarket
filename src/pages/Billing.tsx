import { useEffect, useState } from 'react';
import { opm, billing, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { DollarSign, Check, AlertCircle, TrendingUp, CreditCard, Info, RefreshCw, FileText, Loader2, ExternalLink, Package, Send, Copy, Calendar, Plus, Trash2, ShieldCheck, Download, Wallet } from 'lucide-react';

const INTERVALS = ['daily', 'weekly', 'monthly', 'annual'];

const MODES = [
  { value: 'full_retail', label: 'Usage credits (× multiplier)' },
  { value: 'subscription', label: 'Subscription' },
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
  const [plans, setPlans] = useState<any[]>([]);

  const load = () => opm.billingOverview().then((d: any) => { setRows(d.workspaces || []); setLedgerPopulated(!!d.ledger_populated); }).finally(() => setLoading(false));
  const loadPlans = () => billing.plansList().then((d: any) => setPlans(d.plans || [])).catch(() => {});
  useEffect(() => { load(); loadPlans(); }, []);

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

      <PlanManager plans={plans} onChanged={loadPlans} />

      <div className="space-y-4">
        {rows.map((r) => <TenantCard key={r.workspace_slug} row={r} plans={plans} onChanged={load} />)}
        {rows.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">No billing workspaces configured yet.</div>}
      </div>
    </div>
  );
}

// ---- Reusable subscription plans (Requirement 2) ----
const blankPlan = { id: '', name: '', interval: 'monthly', amount: '', setup_fee: '' };
function PlanManager({ plans, onChanged }: { plans: any[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blankPlan);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const edit = (p: any) => { setForm({ id: p.id, name: p.name, interval: p.interval, amount: String(p.amount ?? ''), setup_fee: String(p.setup_fee ?? '') }); setOpen(true); setErr(''); };
  const create = () => { setForm(blankPlan); setOpen(true); setErr(''); };

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await billing.planSave({ id: form.id || undefined, name: form.name.trim(), interval: form.interval, amount: Number(form.amount), setup_fee: Number(form.setup_fee || 0) });
      setOpen(false); setForm(blankPlan); onChanged();
    } catch (e: any) { setErr(e?.message || 'Could not save plan.'); } finally { setBusy(false); }
  };
  const del = async (p: any) => {
    if (!confirm(`Deactivate plan “${p.name}”? Existing subscriptions keep running; the plan just won't be assignable to new customers.`)) return;
    try { await billing.planDelete(p.id); onChanged(); } catch (e: any) { alert(e?.message || 'Could not delete plan.'); }
  };

  const activePlans = plans.filter((p) => p.active);
  return (
    <div className="card mb-5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2"><Package className="h-4 w-4 text-brand" /><h3 className="text-base font-bold text-ink">Subscription plans</h3><span className="pill bg-slate-100 text-slate-500">{activePlans.length} active</span></div>
        <button className="btn-ghost" onClick={create}><Plus className="h-4 w-4" /> New plan</button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Reusable named plans — assign any of these to a workspace below to put it on Subscription billing.</p>

      {activePlans.length === 0 && !open && <div className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-slate-400">No plans yet. Create one to start assigning subscriptions.</div>}

      {activePlans.length > 0 && (
        <div className="mb-3 divide-y divide-line rounded-lg border border-line">
          {activePlans.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div>
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="ml-2 text-slate-500">{fmt.money(p.amount)} / {p.interval}{Number(p.setup_fee) > 0 ? ` · ${fmt.money(p.setup_fee)} setup` : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-xs font-semibold text-brand hover:underline" onClick={() => edit(p)}>Edit</button>
                <button className="text-slate-400 hover:text-red-600" title="Deactivate" onClick={() => del(p)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="rounded-xl border border-line bg-surface/60 p-4">
          {err && <div className="mb-2 flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {err}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block"><span className="label mb-1 block">Plan name</span><input className="input w-full" value={form.name} placeholder="Starter" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="block"><span className="label mb-1 block">Interval</span><select className="input w-full" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>{INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
            <label className="block"><span className="label mb-1 block">Recurring amount ($)</span><input className="input w-full" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className="block"><span className="label mb-1 block">Setup fee ($, optional)</span><input className="input w-full" type="number" step="0.01" min="0" value={form.setup_fee} onChange={(e) => setForm({ ...form, setup_fee: e.target.value })} /></label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setOpen(false); setForm(blankPlan); }}>Cancel</button>
            <button className="btn-primary disabled:opacity-50" disabled={busy || !form.name.trim() || !(Number(form.amount) > 0)} onClick={save}>{busy ? 'Saving…' : form.id ? 'Save plan' : 'Create plan'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TenantCard({ row, plans, onChanged }: { row: any; plans: any[]; onChanged: () => void }) {
  const [form, setForm] = useState({
    display_name: row.display_name || '', billing_mode: row.billing_mode, status: row.status,
    default_multiplier: String(row.default_multiplier ?? '1'), stripe_customer_id: row.stripe_customer_id || '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [action, setAction] = useState<'' | 'customer' | 'invoice' | 'cardlink'>('');
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  // Subscription (Requirement 3) + plan assignment (Requirement 2)
  const [sub, setSub] = useState<any>(null);
  const [assignPlan, setAssignPlan] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [subMsg, setSubMsg] = useState('');
  // Consent + card link (Requirement 4)
  const [cardLink, setCardLink] = useState('');
  // Feature 1 — direct-pay capability (customer pays providers directly, no rebill)
  const [directPay, setDirectPay] = useState<boolean>(!!row.direct_pay_enabled);
  const [dpBusy, setDpBusy] = useState(false);
  // Feature 2 — signed authorization PDFs
  const [authDocs, setAuthDocs] = useState<any[]>([]);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState('');

  const isSubscription = form.billing_mode === 'subscription';

  const loadAuthDocs = async () => {
    try { const d = await billing.authorizationPdfList(row.workspace_slug); setAuthDocs(d.documents || []); }
    catch { /* non-fatal */ } finally { setAuthLoaded(true); }
  };
  useEffect(() => { loadAuthDocs(); }, [row.workspace_slug]);

  const toggleDirectPay = async () => {
    const next = !directPay;
    setDpBusy(true); setDirectPay(next);
    try { await billing.setDirectPay(row.workspace_slug, next); onChanged(); }
    catch (e: any) { setDirectPay(!next); alert(e?.message || 'Could not update direct-pay setting.'); }
    finally { setDpBusy(false); }
  };

  const generateAuthPdf = async () => {
    setAuthMsg(''); setGenBusy(true);
    try {
      await billing.authorizationPdf(row.workspace_slug);
      setAuthMsg('Authorization PDF generated.');
      await loadAuthDocs();
    } catch (e: any) { setAuthMsg(e?.message || 'Could not generate authorization PDF.'); }
    finally { setGenBusy(false); }
  };

  useEffect(() => {
    if (row.billing_mode === 'subscription') billing.subscriptionGet(row.workspace_slug).then((d: any) => setSub(d.subscription || null)).catch(() => {});
  }, [row.workspace_slug, row.billing_mode]);

  const activePlans = plans.filter((p) => p.active);
  const assign = async () => {
    if (!assignPlan) return;
    setSubMsg(''); setAssigning(true);
    try {
      const r = await billing.subscriptionAssign(row.workspace_slug, assignPlan);
      setSub(r.subscription || null);
      setSubMsg(r.stripe_wired ? 'Subscription created in Stripe and assigned.' : 'Plan assigned. Stripe subscription is pending — add a Stripe customer/card, then re-assign to activate billing.');
      onChanged();
    } catch (e: any) { setSubMsg(e?.message || 'Could not assign plan.'); } finally { setAssigning(false); }
  };
  const sendCardLink = async () => {
    setActionMsg(null); setAction('cardlink');
    try {
      const r = await billing.cardLinkCreate(row.workspace_slug);
      setCardLink(r.url);
      setActionMsg({ ok: true, text: 'Shareable consent + card link created.', url: r.url });
    } catch (e: any) { setActionMsg({ ok: false, text: e?.message || 'Could not create link.' }); } finally { setAction(''); }
  };

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

      {/* Subscription panel (Requirement 3) — plan line items when on Subscription billing */}
      {isSubscription && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><Package className="h-3.5 w-3.5" /> Subscription</div>
          {sub ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><div className="label">Plan</div><div className="text-sm font-bold text-ink">{sub.plan_name || sub.label || '—'}</div></div>
              <div><div className="label">Recurring</div><div className="text-sm font-bold text-ink">{fmt.money(sub.amount)} / {sub.interval}</div></div>
              <div><div className="label">Setup fee</div><div className="text-sm font-bold text-ink">{Number(sub.setup_fee) > 0 ? fmt.money(sub.setup_fee) : '—'}</div></div>
              <div><div className="label">Status</div><div className={`text-sm font-bold ${sub.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>{sub.status === 'pending_stripe' ? 'pending Stripe' : sub.status}</div></div>
              {sub.next_charge_at && <div className="col-span-2 sm:col-span-4 flex items-center gap-1 text-[11px] text-slate-500"><Calendar className="h-3 w-3" /> Next charge {new Date(sub.next_charge_at).toLocaleDateString()}</div>}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No plan assigned yet. Usage rebilling is disabled on Subscription — assign a plan to start recurring billing.</div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand/20 pt-3">
            <select className="input !py-1.5 max-w-[220px] text-sm" value={assignPlan} onChange={(e) => setAssignPlan(e.target.value)}>
              <option value="">{sub ? 'Change plan…' : 'Select a plan…'}</option>
              {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt.money(p.amount)}/{p.interval}</option>)}
            </select>
            <button className="btn-ghost" disabled={!assignPlan || assigning} onClick={assign}>{assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Assign plan</button>
            {activePlans.length === 0 && <span className="text-[11px] text-slate-400">Create a plan above first.</span>}
            {subMsg && <span className="text-[11px] text-slate-600">{subMsg}</span>}
          </div>
        </div>
      )}

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
        <button className="btn-ghost" disabled={action === 'cardlink'} onClick={sendCardLink} title="Generate a shareable consent + card-entry link for this customer">
          {action === 'cardlink' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send consent + card link
        </button>
        {cardLink && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs">
            <input readOnly value={cardLink} className="w-52 bg-transparent font-mono text-[11px] text-slate-600 outline-none" onFocus={(e) => e.target.select()} />
            <button className="text-brand hover:text-brand/70" title="Copy link" onClick={() => navigator.clipboard?.writeText(cardLink)}><Copy className="h-3.5 w-3.5" /></button>
          </span>
        )}
        {actionMsg && (
          <span className={`inline-flex items-center gap-1 text-xs ${actionMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {actionMsg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {actionMsg.text}
            {actionMsg.url && <a href={actionMsg.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-brand underline">view <ExternalLink className="h-3 w-3" /></a>}
          </span>
        )}
      </div>

      {/* Feature 1 — Direct pay (customer pays providers directly; not rebilled) */}
      <div className="mt-4 rounded-xl border border-line bg-surface/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <div>
              <div className="text-sm font-bold text-ink">Allow customer to pay directly (no rebill)</div>
              <p className="mt-0.5 max-w-xl text-xs text-slate-500">
                When on, certain items are paid by the customer directly to the provider/processor and are <span className="font-semibold text-ink">NOT rebilled</span> by us. This is additive to the billing mode above — usage credits and subscriptions are unaffected.
              </p>
            </div>
          </div>
          <button
            type="button" role="switch" aria-checked={directPay} disabled={dpBusy} onClick={toggleDirectPay}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${directPay ? 'bg-brand' : 'bg-slate-300'} ${dpBusy ? 'opacity-60' : ''}`}
            title={directPay ? 'Direct pay enabled' : 'Direct pay disabled'}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${directPay ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {directPay && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Direct pay is ON. Items marked as customer-paid are settled by the customer directly and should not be included in rebilled invoices. (Per-line direct/billed marking is a planned follow-up; today this is a workspace-level flag.)</span>
          </div>
        )}
      </div>

      {/* Feature 2 — Signed authorization PDFs */}
      <div className="mt-4 rounded-xl border border-line bg-surface/50 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck className="h-4 w-4 text-brand" /> Payment authorizations</div>
          <button className="btn-ghost" disabled={genBusy} onClick={generateAuthPdf} title="Generate a flattened PDF authorization from the signed agreement + card on file (brand + last 4 only)">
            {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate authorization PDF
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">Flattened, non-editable PDF records of the signed authorization. The card is referenced only by brand + last 4 — never the full number.</p>
        {authMsg && <div className="mb-2 text-xs text-slate-600">{authMsg}</div>}
        {!authLoaded ? (
          <div className="text-xs text-slate-400">Loading…</div>
        ) : authDocs.length === 0 ? (
          <div className="rounded-lg bg-surface px-3 py-3 text-center text-xs text-slate-400">No authorization PDFs yet.</div>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line">
            {authDocs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{doc.signer_name || '—'} <span className="ml-1 font-normal text-slate-400">· {doc.agreement_version || '—'}</span></div>
                  <div className="text-slate-500">
                    {doc.card_brand && doc.card_last4 ? <span className="capitalize">{doc.card_brand} ending {doc.card_last4} · </span> : null}
                    Signed {doc.signed_at ? new Date(doc.signed_at).toLocaleString() : '—'} · {doc.source}
                  </div>
                </div>
                {doc.signed_url
                  ? <a href={doc.signed_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"><Download className="h-3.5 w-3.5" /> Download</a>
                  : <span className="text-slate-400">link unavailable</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
