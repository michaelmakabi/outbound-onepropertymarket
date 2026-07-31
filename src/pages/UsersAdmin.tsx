import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { UserPlus, ShieldCheck, X, Check } from 'lucide-react';

type Ws = { slug: string; display_name: string; status: string };
type AccessRow = { workspace: string; agent_mode: 'all' | 'only' | 'except'; agent_ids: string[] };

export default function UsersAdmin() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'super_admin';
  const [users, setUsers] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<Ws[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [accessUser, setAccessUser] = useState<any>(null);

  const refresh = () => api.admin.users().then((d) => setUsers(d.users));
  useEffect(() => {
    Promise.all([api.admin.users(), api.admin.allWorkspaces()]).then(([u, w]) => {
      setUsers(u.users); setWorkspaces(w.workspaces);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHead title="Users & Access" subtitle="Create logins and scope exactly what each person can see"
        right={isSuper && <button className="btn-primary" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> New user</button>} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">Username</th><th className="px-3 py-2.5 font-semibold">Role</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold">Last seen</th><th className="px-3 py-2.5 font-semibold text-right">Access</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line hover:bg-surface">
                <td className="px-5 py-2.5 font-semibold text-ink">{u.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{u.username}</td>
                <td className="px-3 py-2.5"><span className="pill bg-brand-light text-brand">{u.role.replace('_', ' ')}</span></td>
                <td className="px-3 py-2.5">{u.disabled ? <span className="pill bg-red-100 text-red-700">Disabled</span> : <span className="pill bg-emerald-100 text-emerald-700">Active</span>}</td>
                <td className="px-3 py-2.5 text-slate-500">{u.last_signed_in ? fmt.dateTime(new Date(u.last_signed_in).getTime()) : '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  {u.role === 'user'
                    ? <button className="btn-ghost !py-1.5" onClick={() => setAccessUser(u)}><ShieldCheck className="h-4 w-4" /> Scope</button>
                    : <span className="text-xs text-slate-400">Sees everything</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && <CreateUser workspaces={workspaces} onClose={() => setCreating(false)} onDone={() => { setCreating(false); refresh(); }} />}
      {accessUser && <AccessEditor user={accessUser} workspaces={workspaces} onClose={() => setAccessUser(null)} />}
    </div>
  );
}

function CreateUser({ workspaces, onClose, onDone }: { workspaces: Ws[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'user' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(''); setBusy(true);
    try { await api.admin.createUser(form); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="New user" onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <Field label="Full name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Username"><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
      <Field label="Password"><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      <Field label="Role">
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="user">User (scoped access)</option>
          <option value="admin">Admin (sees everything)</option>
          <option value="super_admin">Super admin (manages users)</option>
        </select>
      </Field>
      <p className="mb-4 text-xs text-slate-500">After creating a “User”, click <b>Scope</b> to choose exactly which workspaces and agents they can see.</p>
      <button className="btn-primary w-full" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create user'}</button>
    </Modal>
  );
}

function AccessEditor({ user, workspaces, onClose }: { user: any; workspaces: Ws[]; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, AccessRow>>({});
  const [agentsByWs, setAgentsByWs] = useState<Record<string, any[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin.getAccess(user.id).then((d) => {
      const map: Record<string, AccessRow> = {};
      for (const r of d.access) map[r.workspace] = { workspace: r.workspace, agent_mode: r.agent_mode, agent_ids: r.agent_ids || [] };
      setRows(map);
    });
  }, [user.id]);

  const toggleWs = (slug: string) => {
    setRows((prev) => {
      const next = { ...prev };
      if (next[slug]) delete next[slug];
      else next[slug] = { workspace: slug, agent_mode: 'all', agent_ids: [] };
      return next;
    });
  };
  const loadAgents = async (slug: string) => {
    setExpanded(expanded === slug ? null : slug);
    if (!agentsByWs[slug]) {
      const d = await api.admin.workspaceAgents(slug);
      setAgentsByWs((p) => ({ ...p, [slug]: d.agents }));
    }
  };
  const setMode = (slug: string, mode: AccessRow['agent_mode']) => setRows((p) => ({ ...p, [slug]: { ...p[slug], agent_mode: mode } }));
  const toggleAgent = (slug: string, id: string) => setRows((p) => {
    const cur = p[slug]; const has = cur.agent_ids.includes(id);
    return { ...p, [slug]: { ...cur, agent_ids: has ? cur.agent_ids.filter((x) => x !== id) : [...cur.agent_ids, id] } };
  });
  const save = async () => {
    setBusy(true);
    try { await api.admin.setAccess({ userId: user.id, access: Object.values(rows) }); setSaved(true); setTimeout(onClose, 700); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Access — ${user.name}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-500">Pick the workspaces this user can open. For each, choose which agents they can see.</p>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {workspaces.map((w) => {
          const on = !!rows[w.slug];
          const row = rows[w.slug];
          return (
            <div key={w.slug} className={`rounded-xl border ${on ? 'border-brand/40 bg-brand-light/40' : 'border-line'} p-3`}>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggleWs(w.slug)} className="h-4 w-4 accent-[#1f6feb]" />
                  <span className="font-semibold text-ink">{w.display_name}</span>
                </label>
                {on && (
                  <div className="flex items-center gap-2">
                    <select className="input w-auto !py-1 text-xs" value={row.agent_mode} onChange={(e) => setMode(w.slug, e.target.value as any)}>
                      <option value="all">All agents</option>
                      <option value="only">Only selected</option>
                      <option value="except">All except selected</option>
                    </select>
                    {row.agent_mode !== 'all' && <button className="btn-ghost !py-1 text-xs" onClick={() => loadAgents(w.slug)}>{expanded === w.slug ? 'Hide' : 'Pick agents'} {row.agent_ids.length ? `(${row.agent_ids.length})` : ''}</button>}
                  </div>
                )}
              </div>
              {on && row.agent_mode !== 'all' && expanded === w.slug && (
                <div className="mt-3 grid max-h-40 grid-cols-1 gap-1 overflow-y-auto border-t border-line pt-3 sm:grid-cols-2">
                  {(agentsByWs[w.slug] || []).map((a) => (
                    <label key={a.agent_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white">
                      <input type="checkbox" checked={row.agent_ids.includes(a.agent_id)} onChange={() => toggleAgent(w.slug, a.agent_id)} className="h-3.5 w-3.5 accent-[#1f6feb]" />
                      <span className="truncate">{a.agent_name || a.agent_id}</span>
                    </label>
                  ))}
                  {!(agentsByWs[w.slug] || []).length && <span className="px-2 text-xs text-slate-400">No agents discovered yet.</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn-primary mt-4 w-full" disabled={busy} onClick={save}>{saved ? <><Check className="h-4 w-4" /> Saved</> : busy ? 'Saving…' : 'Save access'}</button>
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: any; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-lg' : 'max-w-sm'} p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: any }) {
  return <div className="mb-3"><label className="label mb-1 block">{label}</label>{children}</div>;
}
