import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { billing } from '../lib/api';
import { Loader2, ShieldCheck, CreditCard, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { LOGO_FULL } from '../lib/logo';
import { BrandPanel } from './Login';

// Public, tokenized consent + manual card-capture page (/authorize/:token).
// Reuses the same signed agreement + Stripe card-capture flow as registration, but
// attaches the saved card to an existing workspace instead of provisioning a new account.
export default function Authorize() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') || '';
  const cancelled = params.get('cancelled') === '1';

  const [info, setInfo] = useState<{ display_name: string; agreement_version: string; agreement_text: string; completed: boolean } | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');
  // Identity / billing fields collected on the authorization form (no card PAN/CVV — the card is
  // captured separately via the tokenized processor flow).
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [memberId, setMemberId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Completion phase (returning from Stripe with a session_id).
  const [phase, setPhase] = useState<'form' | 'completing' | 'done'>(sessionId ? 'completing' : 'form');
  const [savedCard, setSavedCard] = useState<any>(null);
  const [authRecorded, setAuthRecorded] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    billing.cardLinkGet(token)
      .then((d: any) => {
        setInfo({ display_name: d.display_name, agreement_version: d.agreement_version, agreement_text: d.agreement_text, completed: !!d.completed });
        if (d.completed && !sessionId) setPhase('done');
      })
      .catch((e: any) => setLoadErr(e?.message || 'This link is not available.'));
  }, [token, sessionId]);

  // If Stripe redirected back with a session_id, finalize the card save.
  useEffect(() => {
    if (!sessionId || ran.current) return; ran.current = true;
    (async () => {
      try {
        const r = await billing.cardLinkComplete(token, sessionId);
        setSavedCard(r.card || null);
        setAuthRecorded(!!r.authorization_recorded || !!r.already);
        setPhase('done');
      } catch (e: any) {
        setError(e?.message || 'We could not confirm your card. Please try again.');
        setPhase('form');
      }
    })();
  }, [sessionId, token]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const detailsComplete = fullName.trim().length >= 2 && emailValid && billingAddress.trim().length >= 4 && memberId.trim().length >= 1;
  const canSubmit = !!info && agreed && signature.trim().length >= 2 && detailsComplete && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agreed || signature.trim().length < 2) {
      setError('Please read and accept the agreement, and type your full legal name to sign.');
      return;
    }
    if (!detailsComplete) {
      setError('Please complete your full name, a valid email, billing address, and member ID.');
      return;
    }
    setBusy(true);
    try {
      const r = await billing.cardLinkStart({
        token, signature_name: signature.trim(), agreement_accepted: true,
        full_name: fullName.trim(), email: email.trim(), billing_address: billingAddress.trim(), member_id: memberId.trim(),
      });
      window.location.assign(r.checkout_url);
    } catch (err: any) {
      setError(err?.message || 'Could not start secure card entry. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,460px)_1fr]">
      <BrandPanel
        heading={<>Authorize your<br /><span className="text-gradient">payment method.</span></>}
        sub="Review the agreement, sign, and securely add your card to your account."
        points={['Bank-grade, PCI-compliant card entry', 'Your typed name is your e-signature', 'Takes under two minutes']}
      />

      <div className="flex items-center justify-center bg-white px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        <div className="w-full max-w-3xl">
          <img src={LOGO_FULL} alt="1PropertyMarket" className="mb-8 h-12 w-auto object-contain lg:hidden" />

          {loadErr && <div className="card mx-auto max-w-xl p-12 text-center"><AlertCircle className="mx-auto mb-4 h-14 w-14 text-red-500" /><h1 className="text-2xl font-bold text-ink">Link unavailable</h1><p className="mt-2 text-base text-slate-600">{loadErr}</p></div>}

          {!loadErr && phase === 'completing' && (
            <div className="card mx-auto max-w-xl p-12 text-center"><Loader2 className="mx-auto mb-4 h-14 w-14 animate-spin text-brand" /><h1 className="text-2xl font-bold text-ink">Confirming your card…</h1><p className="mt-2 text-base text-slate-500">One moment while we save your payment method.</p></div>
          )}

          {!loadErr && phase === 'done' && (
            <div className="card mx-auto max-w-xl p-12 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
              <h1 className="text-2xl font-bold text-ink">You're all set!</h1>
              <p className="mt-2 text-base text-slate-600">
                {savedCard ? <>Your <span className="font-medium capitalize">{savedCard.brand}</span> ending in {savedCard.last4} is now on file{info?.display_name ? <> for {info.display_name}</> : null}.</> : <>Your card has been securely saved{info?.display_name ? <> for {info.display_name}</> : null}.</>}
              </p>
              {authRecorded && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                  <FileText className="h-4 w-4" /> Your signed authorization has been recorded.
                </p>
              )}
              <p className="mt-4 text-sm text-slate-400">You can close this page. There's nothing else to do.</p>
            </div>
          )}

          {!loadErr && phase === 'form' && (
            <>
              <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Authorize payment</h1>
              <p className="mt-3 text-lg text-slate-500">{info ? <>For <span className="font-semibold text-ink">{info.display_name}</span></> : 'Loading…'}</p>

              <form onSubmit={submit} className="mt-8">
                {cancelled && <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-700">Card entry was cancelled — you can try again below.</div>}
                {error && <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-base font-medium text-red-600">{error}</div>}

                <div className="mt-2 rounded-2xl border border-line bg-surface/60 p-5 sm:p-6">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <FileText className="h-4 w-4" /> Payment authorization &amp; terms{info?.agreement_version ? <span className="font-mono font-normal text-slate-400"> · {info.agreement_version}</span> : null}
                  </div>
                  <div className="max-h-[46vh] min-h-[320px] overflow-y-auto whitespace-pre-line rounded-xl border border-line bg-white p-5 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
                    {info ? info.agreement_text : 'Loading agreement…'}
                  </div>
                  <label className="mt-5 flex items-start gap-3 text-base leading-snug text-slate-600">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f6feb]" />
                    <span>I have read and agree to the Payment Authorization, Release of Liability &amp; Hold-Harmless, Indemnification, and Privacy &amp; Calling-Compliance Terms above. I am authorized to bind the Customer.</span>
                  </label>
                  <label className="mt-5 block">
                    <span className="label text-sm">Type your full legal name to sign</span>
                    <input className="input mt-2 !py-3 text-lg" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your full legal name" autoComplete="name" />
                  </label>
                  <p className="mt-2 text-xs leading-snug text-slate-400">Your typed name is your electronic signature (E-SIGN / UETA), recorded with the date, your IP address, and the exact terms shown.</p>
                </div>

                {/* Identity & billing details saved with the authorization. No card number/CVV here — the card is entered on the secure processor page. */}
                <div className="mt-5 rounded-2xl border border-line bg-surface/60 p-5 sm:p-6">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <ShieldCheck className="h-4 w-4" /> Your details
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="label text-sm">Full name</span>
                      <input className="input mt-2 !py-3" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" autoComplete="name" />
                    </label>
                    <label className="block">
                      <span className="label text-sm">Email</span>
                      <input className="input mt-2 !py-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label text-sm">Billing address</span>
                      <input className="input mt-2 !py-3" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="Street, city, state, ZIP" autoComplete="street-address" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label text-sm">Member ID</span>
                      <input className="input mt-2 !py-3" value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="Your member ID" />
                    </label>
                  </div>
                  <p className="mt-3 text-xs leading-snug text-slate-400">We save these details with your authorization. Your card number is never entered here — you'll enter it on the secure, PCI-compliant payment page in the next step.</p>
                </div>

                <button className="btn-primary btn-glow mt-7 w-full !py-4 text-base disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSubmit}>
                  {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Opening secure card entry…</> : <><CreditCard className="h-5 w-5" /> Agree &amp; enter card</>}
                </button>

                <div className="mt-4 flex items-start gap-2.5 text-sm text-slate-500">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>Your card is entered securely on our PCI-compliant payment page. You enter the card details yourself — nothing is charged without your authorization above.</span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
