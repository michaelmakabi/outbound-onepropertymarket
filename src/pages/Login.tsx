import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Radio, Loader2 } from 'lucide-react';

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
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ink to-ink-soft px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-lg">
            <Radio className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-extrabold text-white">One Property Market</h1>
          <p className="text-sm text-slate-400">Outbound — campaign command center</p>
        </div>
        <form onSubmit={submit} className="card p-6">
          {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</div>}
          <label className="label">Username</label>
          <input className="input mt-1 mb-4" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          <label className="label">Password</label>
          <input className="input mt-1 mb-5" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">Private tool · authorized users only</p>
      </div>
    </div>
  );
}
