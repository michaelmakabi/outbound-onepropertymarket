import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { billing, tokenStore, workspaceStore } from '../lib/api';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { LOGO_FULL } from '../lib/logo';

export default function RegisterComplete() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const sessionId = params.get('session_id') || '';
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true; // guard against double-invoke
    (async () => {
      if (!token) { setState('error'); setError('Missing registration reference.'); return; }
      try {
        const r = await billing.completeRegistration(token, sessionId);
        // Log the new user in and drop them into their fresh workspace.
        tokenStore.set(r.token);
        if (r.workspace) workspaceStore.set(r.workspace);
        setState('done');
        setTimeout(() => { window.location.assign('/'); }, 1400);
      } catch (err: any) {
        setState('error'); setError(err?.message || 'We could not finish setting up your account.');
      }
    })();
  }, [token, sessionId]);

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ink to-ink-soft px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex items-center justify-center rounded-2xl bg-white px-5 py-4 shadow-lg"><img src={LOGO_FULL} alt="1PropertyMarket" className="h-12 w-auto object-contain" /></div>
        </div>
        <div className="card p-8">
          {state === 'working' && <><Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-brand" /><h1 className="text-lg font-bold text-ink">Setting up your account…</h1><p className="mt-1 text-sm text-slate-500">Confirming your card and creating your workspace.</p></>}
          {state === 'done' && <><CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" /><h1 className="text-lg font-bold text-ink">You're all set!</h1><p className="mt-1 text-sm text-slate-500">Taking you to your dashboard…</p></>}
          {state === 'error' && <><AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-500" /><h1 className="text-lg font-bold text-ink">Something went wrong</h1><p className="mt-1 text-sm text-slate-600">{error}</p>
            <div className="mt-4 flex justify-center gap-2"><Link to="/register" className="btn-ghost">Start over</Link><Link to="/login" className="btn-primary">Sign in</Link></div></>}
        </div>
      </div>
    </div>
  );
}
