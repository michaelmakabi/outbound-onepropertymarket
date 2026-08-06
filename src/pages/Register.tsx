import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { billing } from '../lib/api';
import { Loader2, ShieldCheck, CreditCard, ArrowLeft } from 'lucide-react';
import { LOGO_FULL } from '../lib/logo';
import { BrandPanel } from './Login';

export default function Register() {
  const [params] = useSearchParams();
  const cancelled = params.get('cancelled') === '1';
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await billing.register(form);
      // Hand off to Stripe's hosted, PCI-compliant page to capture the card.
      window.location.assign(r.checkout_url);
    } catch (err: any) {
      setError(err?.message || 'Could not start signup. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel
        heading={<>Put your outbound<br /><span className="text-gradient">on autopilot.</span></>}
        sub="Create your account in minutes. We set up your AI callers — you upload leads and watch the results."
        points={['Free to start — just verify your card', 'No monthly fees, pay as you go', 'We build & run it, done-for-you']}
      />

      <div className="flex items-center justify-center bg-white px-5 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
          <Link to="/" className="mb-6 inline-block lg:hidden">
            <img src={LOGO_FULL} alt="1PropertyMarket — home" className="h-10 w-auto object-contain" />
          </Link>
          <h1 className="text-2xl font-extrabold text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">AI outbound calling — pay only for what you use.</p>

          <form onSubmit={submit} className="mt-6">
            {cancelled && <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Card setup was cancelled — you can try again below.</div>}
            {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</div>}

            <label className="label">Full name</label>
            <input className="input mt-1 mb-3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus autoComplete="name" required />

            <label className="label">Company</label>
            <input className="input mt-1 mb-3" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Your business name" autoComplete="organization" />

            <label className="label">Work email</label>
            <input className="input mt-1 mb-3" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />

            <label className="label">Password</label>
            <input className="input mt-1 mb-4" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />

            <button className="btn-primary btn-glow w-full !py-2.5" disabled={busy || !form.name || !form.email || form.password.length < 8}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting secure checkout…</> : <><CreditCard className="h-4 w-4" /> Continue to add payment</>}
            </button>

            <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>Your card is entered securely on Stripe to verify your account. You're not charged today — it's pay-as-you-go, based on the calls you actually place.</span>
            </div>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account? <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
