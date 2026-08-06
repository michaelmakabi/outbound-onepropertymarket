import { useEffect, useState } from 'react';
import { onboarding } from '../lib/onboarding';
import { Zap, Loader2, Check, AlertCircle } from 'lucide-react';

// Master on/off switch for automatic charging (super-admin). OFF by default.
// The scheduled sweep and "Run now" both charge each eligible customer's unbilled
// balance to their card on file — only while this is ON.
export default function AutoChargeBar() {
  const [s, setS] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => onboarding.autochargeSettings()
    .then((d: any) => { setS(d.settings); setRecent(d.recent || []); })
    .catch((e: any) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (!s) return null;

  const on = !!s.auto_charge_enabled;

  const toggle = async () => {
    const next = !on;
    if (next && !confirm('Turn ON automatic charging?\n\nEvery customer with a saved card and an unbilled balance will be charged automatically — on the daily run and whenever you click "Run charges now". You can switch this off at any time.')) return;
    setErr(''); setBusy(true);
    try { await onboarding.autochargeSet({ auto_charge_enabled: next }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const runNow = async () => {
    if (!confirm('Run a charge sweep right now?\n\nThis immediately charges every eligible customer their full unbilled balance to their card on file.')) return;
    setErr(''); setMsg(''); setRunning(true);
    try {
      const r = await onboarding.autochargeRunNow();
      setMsg(r.ran ? `Charged ${r.charged_count} customer(s) for $${(r.charged_total || 0).toFixed(2)}.` : `Nothing charged (${r.reason || 'disabled'}).`);
      await load();
    } catch (e: any) { setErr(e.message); } finally { setRunning(false); }
  };

  return (
    <div className="mb-5 card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><Zap className="h-5 w-5" /></span>
          <div>
            <div className="flex items-center gap-2 font-bold text-ink">Automatic charging {on ? <span className="pill bg-emerald-100 text-emerald-700">ON</span> : <span className="pill bg-slate-100 text-slate-500">OFF</span>}</div>
            <div className="text-xs text-slate-500">Daily at 07:00 UTC, charges each customer's unbilled balance (min ${Number(s.min_charge_amount).toFixed(2)}, {s.cooldown_hours}h cooldown) to the card on file. When off, nothing is charged automatically.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {on && <button className="btn-ghost" disabled={running} onClick={runNow}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Run charges now</button>}
          <button onClick={toggle} disabled={busy} title="Toggle automatic charging"
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>
      {err && <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {err}</div>}
      {msg && <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> {msg}</div>}
      {recent.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Recent charges:</span>
          {recent.slice(0, 6).map((r, i) => (
            <span key={i}>{r.workspace_slug} — {r.status === 'charged' ? <span className="text-emerald-700">${Number(r.amount || 0).toFixed(2)} ✓</span> : <span>{r.status}</span>}</span>
          ))}
        </div>
      )}
    </div>
  );
}
