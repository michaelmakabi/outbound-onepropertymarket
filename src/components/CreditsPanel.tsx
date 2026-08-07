import { useEffect, useState } from 'react';
import { credits } from '../lib/credits';
import { Wallet, RefreshCw, Plus, Gauge, Play, FlagOff, AlertCircle } from 'lucide-react';

// Prepaid-credits (SaaS mode) management for one account. Rendered inside the
// Onboarding account drawer. All money-moving actions are admin-initiated with a confirm.
const ENGINES = [
  { v: 'prepaid_credits', label: 'Prepaid credits (SaaS)', hint: 'Customer prepays credits; usage debits them; card charged only to top up.' },
  { v: 'arrears_sweep', label: 'Arrears sweep', hint: 'Usage accrues; card charged in arrears by the daily auto-charge sweep.' },
  { v: 'split_margin', label: 'Split (margin only)', hint: 'Card lives in Retell (Retell charges cost); 1PM charges margin only.' },
];

export default function CreditsPanel({ slug }: { slug: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(null);

  const load = () => {
    setErr('');
    credits.wallet(slug).then((r) => {
      setD(r);
      setForm({
        billing_engine: r.billing_engine,
        multiplier: String(r.multiplier ?? 1),
        refill_mode: r.wallet?.refill_mode || 'manual',
        refill_threshold: String(r.wallet?.refill_threshold ?? 20),
        refill_amount: String(r.wallet?.refill_amount ?? 100),
      });
    }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [slug]);

  if (err) return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>;
  if (!d || !form) return <div className="text-sm text-slate-400">Loading credits…</div>;

  const bal = Number(d.wallet?.balance_credits ?? 0);
  const pend = d.pending_usage || { events: 0, hard_cost: 0, retail: 0 };
  const mult = Number(form.multiplier) || 1;
  const projectedRetail = Number(pend.hard_cost) * mult;

  const saveConfig = async () => {
    setBusy(true); setErr('');
    try {
      await credits.configSet({
        workspace_slug: slug,
        billing_engine: form.billing_engine,
        multiplier: Number(form.multiplier),
        refill_mode: form.refill_mode,
        refill_threshold: Number(form.refill_threshold),
        refill_amount: Number(form.refill_amount),
      });
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const topUp = async () => {
    const v = window.prompt('Charge the card on file and add this many credits ($1 = 1 credit):', String(form.refill_amount || 100));
    if (!v) return;
    const amount = Number(v);
    if (!(amount > 0)) { setErr('Enter a positive amount.'); return; }
    if (!window.confirm(`Charge the card on file $${amount.toFixed(2)} and add ${amount} credits?`)) return;
    setBusy(true); setErr('');
    try { const r = await credits.topup({ workspace_slug: slug, amount }); alert(`Charged $${amount.toFixed(2)} · new balance ${r.balance} credits.`); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const grant = async () => {
    const v = window.prompt('Add/remove credits WITHOUT charging a card (e.g. 25 to comp, -10 to correct):', '');
    if (!v) return;
    const g = Number(v);
    if (!g) return;
    setBusy(true); setErr('');
    try { await credits.configSet({ workspace_slug: slug, grant_credits: g, grant_note: 'admin manual adjustment' }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const runDebit = async () => {
    if (!window.confirm('Debit current pending usage from this account’s credit balance now? (If auto-refill is on and the master toggle is on, a low balance may trigger a card charge.)')) return;
    setBusy(true); setErr('');
    try { const r = await credits.debitNow(slug); const res = (r.results || [])[0]; alert(res ? `Debited ${res.debited} credits (${res.events} events). Balance ${res.balance}.` : 'Nothing to debit.'); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const baseline = async () => {
    if (!window.confirm(`Mark all ${pend.events} of this account’s current unbilled events as already settled (NO charge), so prepaid credits start clean from now?`)) return;
    setBusy(true); setErr('');
    try { const r = await credits.baseline(slug); alert(`Settled ${r.settled_events} historical events. Credits now start from zero usage.`); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* Balance + pending */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line p-3">
          <div className="label flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Credit balance</div>
          <div className={`text-2xl font-extrabold ${bal < 0 ? 'text-red-600' : 'text-ink'}`}>{bal.toFixed(2)}</div>
          <div className="text-xs text-slate-400">1 credit = $1</div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="label">Pending usage (not yet debited)</div>
          <div className="text-2xl font-extrabold text-ink">${Number(pend.hard_cost).toFixed(2)}</div>
          <div className="text-xs text-slate-400">{pend.events} events · Retell cost</div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="label">Would debit at {mult}×</div>
          <div className="text-2xl font-extrabold text-brand">${projectedRetail.toFixed(2)}</div>
          <div className="text-xs text-slate-400">retail = cost × multiplier</div>
        </div>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-line p-4">
        <div className="mb-3 inline-flex items-center gap-1.5 font-bold text-ink"><Gauge className="h-4 w-4" /> Billing engine & pricing</div>
        <div className="mb-3">
          <label className="label mb-1 block">Engine</label>
          <select className="input" value={form.billing_engine} onChange={(e) => setForm({ ...form, billing_engine: e.target.value })}>
            {ENGINES.map((en) => <option key={en.v} value={en.v}>{en.label}</option>)}
          </select>
          <div className="mt-1 text-xs text-slate-400">{ENGINES.find((e) => e.v === form.billing_engine)?.hint}</div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label mb-1 block">Multiplier (× Retell cost)</label>
            <input className="input" type="number" step="0.05" min="0.1" max="100" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} />
          </div>
          <div>
            <label className="label mb-1 block">Refill mode</label>
            <select className="input" value={form.refill_mode} onChange={(e) => setForm({ ...form, refill_mode: e.target.value })}>
              <option value="manual">Manual top-ups only</option>
              <option value="auto">Auto-refill at threshold</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label mb-1 block">Refill at &lt;</label>
              <input className="input" type="number" step="1" min="0" value={form.refill_threshold} onChange={(e) => setForm({ ...form, refill_threshold: e.target.value })} disabled={form.refill_mode !== 'auto'} />
            </div>
            <div>
              <label className="label mb-1 block">Top-up amt</label>
              <input className="input" type="number" step="1" min="0" value={form.refill_amount} onChange={(e) => setForm({ ...form, refill_amount: e.target.value })} disabled={form.refill_mode !== 'auto'} />
            </div>
          </div>
        </div>
        {form.refill_mode === 'auto' && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Auto-refill charges the card on file automatically. It only fires while the master auto-charge toggle (top of this page) is ON.
          </div>
        )}
        <button className="btn-primary mt-3" disabled={busy} onClick={saveConfig}>{busy ? 'Saving…' : 'Save billing settings'}</button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={busy} onClick={topUp}><Plus className="h-4 w-4" /> Charge card & add credits</button>
        <button className="btn-ghost" disabled={busy} onClick={grant}><Wallet className="h-4 w-4" /> Adjust credits (no charge)</button>
        <button className="btn-ghost" disabled={busy} onClick={runDebit}><Play className="h-4 w-4" /> Debit usage now</button>
        <button className="btn-ghost" disabled={busy || !pend.events} onClick={baseline}><FlagOff className="h-4 w-4" /> Start from now ({pend.events})</button>
        <button className="btn-ghost" disabled={busy} onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      {/* Ledger */}
      <div className="rounded-xl border border-line">
        <div className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Credit ledger</div>
        {(d.ledger || []).length === 0 ? <div className="px-4 py-6 text-center text-sm text-slate-400">No credit activity yet.</div> : (
          <div className="max-h-64 overflow-y-auto divide-y divide-line">
            {d.ledger.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <span className={`font-semibold ${Number(l.delta) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(l.delta) < 0 ? '' : '+'}{Number(l.delta).toFixed(2)}</span>
                  <span className="ml-2 text-slate-500">{l.reason}{l.meta?.events ? ` · ${l.meta.events} events` : ''}{l.meta?.auto ? ' · auto' : ''}</span>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>bal {Number(l.balance_after).toFixed(2)}</div>
                  <div>{new Date(l.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
