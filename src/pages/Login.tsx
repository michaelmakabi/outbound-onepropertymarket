import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Loader2, ArrowLeft, PhoneCall, CheckCircle2, Sparkles } from 'lucide-react';
import { LOGO_FULL } from '../lib/logo';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <BrandPanel
        heading={<>Welcome back to<br /><span className="text-gradient">your command center.</span></>}
        sub="Sign in to see today's calls, outcomes, and pipelines — all in one place."
        points={['Live calls, recordings & transcripts', 'Automatic dispositions & pipelines', 'Results that tell you what to do next']}
      />

      {/* Form */}
      <div className="flex items-center justify-center bg-white px-5 py-10">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
          <Link to="/" className="mb-6 inline-block lg:hidden">
            <img src={LOGO_FULL} alt="1PropertyMarket — home" className="h-10 w-auto object-contain" />
          </Link>
          <h1 className="text-2xl font-extrabold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back — let's get to work.</p>

          <form onSubmit={submit} className="mt-6">
            {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</div>}
            <label className="label">Username</label>
            <input className="input mt-1 mb-4" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            <label className="label">Password</label>
            <input className="input mt-1 mb-5" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button className="btn-primary btn-glow w-full !py-2.5" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-500">
            New here? <Link to="/register" className="font-semibold text-brand hover:underline">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Shared animated brand panel for the auth pages.
export function BrandPanel({ heading, sub, points }: { heading: React.ReactNode; sub: string; points: string[] }) {
  return (
    <div className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-aurora absolute -left-16 -top-20 h-96 w-96 rounded-full bg-brand/40 blur-[110px]" />
        <div className="animate-aurora-2 absolute -right-10 bottom-0 h-96 w-96 rounded-full bg-[#8f6bff]/30 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>
      <Link to="/" className="relative flex items-center gap-2.5 transition hover:opacity-90" title="Back to homepage">
        <img src={LOGO_FULL} alt="1PropertyMarket — home" className="h-9 w-auto object-contain" />
        <span className="text-sm font-extrabold tracking-tight">1PropertyMarket <span className="text-brand">Outbound</span></span>
      </Link>
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white/90 backdrop-blur"><Sparkles className="h-3.5 w-3.5 text-brand" /> Done-for-you AI calling</span>
        <h2 className="mt-4 text-4xl font-extrabold leading-tight">{heading}</h2>
        <p className="mt-4 max-w-md text-slate-300">{sub}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => <li key={p} className="flex items-center gap-2.5 text-sm text-slate-200"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> {p}</li>)}
        </ul>
      </div>
      <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white"><PhoneCall className="h-5 w-5" /></div>
        <div className="text-sm text-slate-200"><span className="font-bold text-white">Calls running 24/7</span><br /><span className="text-slate-400">recorded, transcribed & dispositioned for you</span></div>
      </div>
    </div>
  );
}
