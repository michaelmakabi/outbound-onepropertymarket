import { useEffect, useState } from 'react';
import { credits } from '../lib/credits';
import { Repeat, Plus, Play, Trash2, Package } from 'lucide-react';

// Direct retail + subscription: 1PM charges a service/subscription fee (one-time or monthly).
// Retell bills the customer for usage directly; this panel only handles 1PM's own fee.
// Every charge here adds a 3% card-processing fee automatically (server-side).
export default function SubscriptionsPanel({ slug }: { slug: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [nsub, setNsub] = useState({ label: '', amount: '', interval: 'monthly' });
  const [nplan, setNplan] = useState({ name: '', amount: '', interval: 'monthly' });
  const [applyPlan, setApplyPlan] = useState('');

  const load = () => { setErr(''); credits.subscriptions(slug).then(setD).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); }, [slug]);

  if (err) return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>;
  if (!d) return <div className="text-sm text-slate-400">Loading subscriptions…</div>;

  const addSub = async () => {
    if (!nsub.label || !(Number(nsub.amount) > 0)) { setErr('Enter a label and positive amount.'); return; }
    setBusy(true); setErr('');
    try { await credits.subscriptionSet({ workspace_slug: slug, label: nsub.label, amount: Number(nsub.amount), interval: nsub.interval }); setNsub({ label: '', amount: '', interval: 'monthly' }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const chargeNow = async (sub: any) => {
    if (!window.confirm(`Charge ${sub.label} now: $${Number(sub.amount).toFixed(2)} + 3% processing fee on the card on file?`)) return;
    setBusy(true); setErr('');
    try { const r = await credits.subscriptionChargeNow(sub.id); alert(`Charged $${r.base} + $${r.fee} fee = $${r.total}.`); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const cancel = async (sub: any) => {
    if (!window.confirm(`Cancel subscription "${sub.label}"?`)) return;
    setBusy(true); setErr('');
    try { await credits.subscriptionDelete(sub.id); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const createPlan = async () => {
    if (!nplan.name || !(Number(nplan.amount) > 0)) { setErr('Enter a plan name and positive amount.'); return; }
    setBusy(true); setErr('');
    try { await credits.planCreate({ name: nplan.name, amount: Number(nplan.amount), interval: nplan.interval }); setNplan({ name: '', amount: '', interval: 'monthly' }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const doApplyPlan = async () => {
    if (!applyPlan) return;
    setBusy(true); setErr('');
    try { await credits.planApply({ workspace_slug: slug, plan_id: applyPlan }); setApplyPlan(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400">Retell bills the customer for usage directly; 1PM charges only the service/subscription fee below. Every charge adds a 3% processing fee automatically.</div>

      {/* Current subscriptions */}
      <div className="rounded-xl border border-line">
        <div className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Service fees on this account</div>
        {(d.subscriptions || []).filter((s: any) => s.status !== 'canceled').length === 0
          ? <div className="px-4 py-6 text-center text-sm text-slate-400">No subscription or service fees yet.</div>
          : (
            <div className="divide-y divide-line">
              {d.subscriptions.filter((s: any) => s.status !== 'canceled').map((s: any) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <span className="font-semibold text-ink">{s.label}</span>
                    <span className="ml-2 text-slate-500">${Number(s.amount).toFixed(2)} · {s.interval === 'monthly' ? 'monthly' : 'one-time'}{s.interval === 'monthly' && s.next_charge_at ? ` · next ${new Date(s.next_charge_at).toLocaleDateString()}` : ''}{s.last_charged_at ? ` · last ${new Date(s.last_charged_at).toLocaleDateString()}` : ''}</span>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => chargeNow(s)}><Play className="h-3.5 w-3.5" /> Charge now</button>
                    <button className="btn-ghost !py-1 text-xs text-red-600" disabled={busy} onClick={() => cancel(s)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Add a fee */}
      <div className="rounded-xl border border-line p-4">
        <div className="mb-3 inline-flex items-center gap-1.5 font-bold text-ink"><Repeat className="h-4 w-4" /> Add a service fee</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Label (e.g. Account servicing)" value={nsub.label} onChange={(e) => setNsub({ ...nsub, label: e.target.value })} />
          <input className="input" type="number" step="1" min="0" placeholder="Amount $" value={nsub.amount} onChange={(e) => setNsub({ ...nsub, amount: e.target.value })} />
          <select className="input" value={nsub.interval} onChange={(e) => setNsub({ ...nsub, interval: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="one_time">One-time</option>
          </select>
        </div>
        <button className="btn-primary mt-3" disabled={busy} onClick={addSub}><Plus className="h-4 w-4" /> Add fee</button>
      </div>

      {/* Reusable plans */}
      <div className="rounded-xl border border-line p-4">
        <div className="mb-3 inline-flex items-center gap-1.5 font-bold text-ink"><Package className="h-4 w-4" /> Reusable plans</div>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <select className="input max-w-xs" value={applyPlan} onChange={(e) => setApplyPlan(e.target.value)}>
            <option value="">Apply a saved plan…</option>
            {(d.plans || []).map((p: any) => <option key={p.id} value={p.id}>{p.name} — ${Number(p.amount).toFixed(2)}/{p.interval === 'monthly' ? 'mo' : 'once'}</option>)}
          </select>
          <button className="btn-ghost" disabled={busy || !applyPlan} onClick={doApplyPlan}>Apply to account</button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="New plan name" value={nplan.name} onChange={(e) => setNplan({ ...nplan, name: e.target.value })} />
          <input className="input" type="number" step="1" min="0" placeholder="Amount $" value={nplan.amount} onChange={(e) => setNplan({ ...nplan, amount: e.target.value })} />
          <select className="input" value={nplan.interval} onChange={(e) => setNplan({ ...nplan, interval: e.target.value })}>
            <option value="monthly">Monthly</option>
            <option value="one_time">One-time</option>
          </select>
        </div>
        <button className="btn-ghost mt-3" disabled={busy} onClick={createPlan}><Plus className="h-4 w-4" /> Save as reusable plan</button>
      </div>
    </div>
  );
}
