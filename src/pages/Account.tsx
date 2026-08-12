import { useEffect, useState } from 'react';
import { billing, fmt } from '../lib/api';
import { PageHead, Spinner } from '../components/ui';
import { CreditCard, Receipt, TrendingUp, Calendar, ExternalLink, ShieldCheck, AlertCircle, Loader2, Package } from 'lucide-react';

const invStatusColor: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700', open: 'bg-amber-100 text-amber-700',
  draft: 'bg-slate-100 text-slate-600', void: 'bg-slate-100 text-slate-500', uncollectible: 'bg-red-100 text-red-700',
};

export default function Account() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalMsg, setPortalMsg] = useState('');

  useEffect(() => {
    billing.myAccount()
      .then((d: any) => setWorkspaces(d.workspaces || []))
      .catch((e: any) => setErr(e?.message || 'Could not load your account.'))
      .finally(() => setLoading(false));
  }, []);

  const openPortal = async () => {
    setPortalBusy(true); setPortalMsg('');
    try {
      const r = await billing.portal();
      if (r?.url) window.location.assign(r.url);
      else setPortalMsg('Could not open the billing portal.');
    } catch (e: any) {
      setPortalMsg(e?.message || 'Could not open the billing portal.');
    } finally { setPortalBusy(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHead title="Account & Billing" subtitle="Your usage, invoices, and payment method" />

      {err && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      {!err && workspaces.length === 0 && (
        <div className="card p-8 text-center text-slate-500">
          Your billing account isn't set up yet. Please contact support to get started.
        </div>
      )}

      {workspaces.map((w) => (
        <div key={w.workspace_slug} className="mb-6">
          {workspaces.length > 1 && <h2 className="mb-3 text-sm font-bold text-ink">{w.display_name}</h2>}

          {/* usage KPIs */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="label flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> This month</div>
              <div className="mt-1 text-2xl font-bold text-ink">{fmt.money(w.usage?.month || 0)}</div>
              <div className="text-[11px] text-slate-400">usage so far this month</div>
            </div>
            <div className="card p-4">
              <div className="label flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Current balance</div>
              <div className="mt-1 text-2xl font-bold text-ink">{fmt.money(w.usage?.unbilled || 0)}</div>
              <div className="text-[11px] text-slate-400">not yet invoiced</div>
            </div>
            <div className="card p-4">
              <div className="label flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" /> Lifetime usage</div>
              <div className="mt-1 text-2xl font-bold text-ink">{fmt.money(w.usage?.total || 0)}</div>
              <div className="text-[11px] text-slate-400">{fmt.int(w.usage?.events || 0)} calls billed</div>
            </div>
          </div>

          {/* subscription (when on a recurring plan) */}
          {w.subscription && (
            <div className="card mb-4 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand"><Package className="h-3.5 w-3.5" /> Your plan</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><div className="label">Plan</div><div className="text-sm font-bold text-ink">{w.subscription.plan_name || '—'}</div></div>
                <div><div className="label">Recurring</div><div className="text-sm font-bold text-ink">{fmt.money(w.subscription.amount)} / {w.subscription.interval}</div></div>
                {Number(w.subscription.setup_fee) > 0 && <div><div className="label">Setup fee</div><div className="text-sm font-bold text-ink">{fmt.money(w.subscription.setup_fee)}</div></div>}
                <div><div className="label">Status</div><div className={`text-sm font-bold ${w.subscription.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>{w.subscription.status === 'pending_stripe' ? 'pending' : w.subscription.status}</div></div>
              </div>
              {w.subscription.next_charge_at && <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><Calendar className="h-3 w-3" /> Next charge {new Date(w.subscription.next_charge_at).toLocaleDateString()}</div>}
            </div>
          )}

          {/* payment method */}
          <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface"><CreditCard className="h-5 w-5 text-brand" /></div>
              <div>
                <div className="text-sm font-semibold text-ink">Payment method</div>
                {w.card ? (
                  <div className="text-[13px] text-slate-500">
                    <span className="font-medium capitalize">{w.card.brand}</span> ending in {w.card.last4} · expires {String(w.card.exp_month).padStart(2, '0')}/{w.card.exp_year}
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[13px] text-amber-600"><AlertCircle className="h-3.5 w-3.5" /> No card on file</div>
                )}
              </div>
            </div>
            {w.can_manage_billing ? (
              <button className="btn-primary" onClick={openPortal} disabled={portalBusy}>
                {portalBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening…</> : <><CreditCard className="h-4 w-4" /> {w.card ? 'Update card' : 'Add card'}</>}
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">Only your account owner can change the payment method.</span>
            )}
          </div>
          {portalMsg && <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{portalMsg}</div>}

          {/* invoices */}
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Invoices & transactions</div>
            {w.invoices && w.invoices.length > 0 ? (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Invoice</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {w.invoices.map((i: any) => (
                    <tr key={i.id} className="border-t border-line hover:bg-surface">
                      <td className="px-4 py-2.5 font-medium text-ink">{i.number || i.id.slice(-8)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{fmt.dateTime(i.created)}</td>
                      <td className="px-3 py-2.5"><span className={`pill ${invStatusColor[i.status] || 'bg-slate-100 text-slate-600'}`}>{i.status}</span></td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-ink">{fmt.money(i.total)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {i.hosted_invoice_url && <a href={i.hosted_invoice_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">View <ExternalLink className="h-3 w-3" /></a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-slate-400">No invoices yet. Usage accrues here and is invoiced periodically.</div>
            )}
          </div>
        </div>
      ))}

      <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span>Your card is stored securely with Stripe. Billing is based on actual calls placed. Card updates open Stripe's secure, hosted billing portal.</span>
      </div>
    </div>
  );
}
