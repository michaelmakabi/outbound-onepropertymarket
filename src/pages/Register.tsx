import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { billing } from '../lib/api';
import { Loader2, ShieldCheck, CreditCard, ArrowLeft, FileText } from 'lucide-react';
import { LOGO_FULL } from '../lib/logo';
import { BrandPanel } from './Login';

export default function Register() {
  const [params] = useSearchParams();
  const cancelled = params.get('cancelled') === '1';
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '' });
  const [terms, setTerms] = useState<{ version: string; text: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    billing.terms().then((t: any) => setTerms({ version: t.version, text: t.text })).catch(() => {});
  }, []);

  const canSubmit =
    !!form.name.trim() && !!form.email.trim() && form.password.length >= 8 &&
    agreed && signature.trim().length >= 2 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agreed || signature.trim().length < 2) {
      setError('Please read and accept the agreement, and type your full legal name to sign.');
      return;
    }
    setBusy(true);
    try {
      const r = await billing.register({ ...form, agreement_accepted: true, signature_name: signature.trim() });
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

            {/* Payment authorization + release of liability + calling-compliance agreement (required) */}
            <div className="mt-2 rounded-xl border border-line bg-surface/60 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <FileText className="h-3.5 w-3.5" /> Payment authorization &amp; terms{terms?.version ? <span className="font-mono font-normal text-slate-400"> · {terms.version}</span> : null}
              </div>
              <div className="max-h-44 overflow-y-auto whitespace-pre-line rounded-lg border border-line bg-white p-3 text-[11px] leading-relaxed text-slate-600">
                {terms ? terms.text : 'Loading agreement…'}
              </div>
              <label className="mt-2.5 flex items-start gap-2 text-xs leading-snug text-slate-600">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1f6feb]" />
                <span>I have read and agree to the Payment Authorization, Release of Liability &amp; Hold-Harmless, Indemnification, and Privacy &amp; Calling-Compliance Terms above. I am authorized to bind the Customer.</span>
              </label>
              <label className="mt-2.5 block">
                <span className="label">Type your full legal name to sign</span>
                <input className="input mt-1" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full legal name" autoComplete="name" />
              </label>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-400">Your typed name is your electronic signature (E-SIGN / UETA), recorded with the date, your IP address, and the exact terms shown.</p>
            </div>

            <button className="btn-primary btn-glow mt-5 w-full !py-2.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSubmit}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting secure checkout…</> : <><CreditCard className="h-4 w-4" /> Agree &amp; continue to payment</>}
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
