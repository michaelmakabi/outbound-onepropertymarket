import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { X, Check } from 'lucide-react';

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.updateProfile({ name: name !== user?.name ? name : undefined, password: password || undefined });
      setSaved(true); setTimeout(onClose, 800);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">My account</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>
        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="mb-3"><label className="label mb-1 block">Email (login)</label><input className="input bg-surface text-slate-500" value={user?.email || user?.username || ''} disabled /></div>
        <div className="mb-3"><label className="label mb-1 block">Full name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="mb-4"><label className="label mb-1 block">New password (leave blank to keep)</label><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Unchanged" /></div>
        <button className="btn-primary w-full" disabled={busy} onClick={save}>{saved ? <><Check className="h-4 w-4" /> Saved</> : busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
