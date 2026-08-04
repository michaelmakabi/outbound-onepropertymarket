import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { UserPlus, ShieldCheck, X, Check, Pencil, KeyRound, Send, Copy, Clock, Eye } from 'lucide-react';

type Ws = { slug: string; display_name: string; status: string };
type AccessRow = { workspace: string; agent_mode: 'all' | 'only' | 'except'; agent_ids: string[] };

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

function StatusBadge({ u }: { u: any }) {
  if (u.disabled) return <span className="pill bg-red-100 text-red-700">Disabled</span>;
  if (!u.claimed_at) return <span className="pill bg-amber-100 text-amber-700">Pending invite</span>;
  return <span className="pill bg-emerald-100 text-emerald-700">Active</span>;
}

export default function UsersAdmin() {
  const { user: me, startImpersonation } = useAuth();
  const isSuper = me?.role === 'super_admin';
  const [users, setUsers] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<Ws[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [accessUser, setAccessUser] = useState<any>(null);
  const [reveal, setReveal] = useState<{ title: string; name?: string; username?: string; password: string; loginUrl?: string } | null>(null);

  const refresh = () => Promise.all([api.admin.users(), api.admin.userEvents()]).then(([u, e]) => { setUsers(u.users); setEvents(e.events); });
  useEffect(() => {
    Promise.all([api.admin.users(), api.admin.allWorkspaces(), api.admin.userEvents()]).then(([u, w, e]) => {
      setUsers(u.users); setWorkspaces(w.workspaces); setEvents(e.events);
    }).finally(() => setLoading(false));
  }, []);

  const canEdit = (u: any) => isSuper || u.role === 'user';

  const resetPw = async (u: any) => {
    if (!confirm(`Reset password for ${u.name}? A new temporary password will be generated.`)) return;
    const r = await api.admin.resetPassword({ id: u.id });
    setReveal({ title: `New password for ${u.name}`, name: u.name, username: u.username, password: r.password, loginUrl: 'https://outbound.1propertymarket.com/login' });
    refresh();
  };
  const resend = async (u: any) => {
    const r = await api.admin.resendInvite({ id: u.id });
    setReveal({ title: `Invite for ${u.name}`, name: u.name, username: r.username, password: r.password, loginUrl: r.loginUrl });
    refresh();
  };
  const impersonate = async (u: any) => {
    if (!confirm(`View the dashboard as ${u.name}? You'll act with exactly their access until you return to your own account.`)) return;
    try { await startImpersonation(u.id); } catch (e: any) { alert(e?.message || 'Could not start impersonation.'); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHead title="Users & Access" subtitle="Create logins and scope exactly what each person can see"
        right={isSuper && <button className="btn-primary" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> New user</button>} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Email</th>
              <th className="px-3 py-2.5 font-semibold">Role</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold">Last seen</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line hover:bg-surface">
                <td className="px-5 py-2.5 font-semibold text-ink">{u.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{u.username}</td>
                <td className="px-3 py-2.5"><span className="pill bg-brand-light text-brand">{u.role.replace('_', ' ')}</span></td>
                <td className="px-3 py-2.5"><StatusBadge u={u} /></td>
                <td className="px-3 py-2.5 text-slate-500">{u.claimed_at ? dt(u.last_signed_in) : '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {u.role === 'user' && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setAccessUser(u)} title="Scope access"><ShieldCheck className="h-3.5 w-3.5" /> Scope</button>}
                    {isSuper && u.id !== me?.id && u.role !== 'super_admin' && !u.disabled && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => impersonate(u)} title="View as this user"><Eye className="h-3.5 w-3.5" /></button>}
                    {canEdit(u) && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditUser(u)} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>}
                    {canEdit(u) && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => resetPw(u)} title="Reset password"><KeyRound className="h-3.5 w-3.5" /></button>}
                    {canEdit(u) && !u.claimed_at && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => resend(u)} title="Resend invite"><Send className="h-3.5 w-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500"><Clock className="h-3.5 w-3.5" /> Activity log</div>
        <div className="max-h-80 overflow-y-auto">
          {events.length === 0 ? <div className="px-5 py-6 text-center text-sm text-slate-400">No activity yet.</div> : (
            <table className="w-full text-sm">
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-400">{dt(e.created_at)}</td>
                    <td className="px-3 py-2"><span className="pill bg-slate-100 text-slate-600">{e.action.replace(/_/g, ' ')}</span></td>
                    <td className="px-3 py-2 text-slate-600"><b className="text-ink">{e.actor_name || 'system'}</b>{e.target_name && e.target_name !== e.actor_name ? ` → ${e.target_name}` : ''}{e.detail ? ` · ${e.detail}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {creating && <UserForm mode="create" isSuper={isSuper} onClose={() => setCreating(false)} onReveal={setReveal} onDone={() => { setCreating(false); refresh(); }} />}
      {editUser && <UserForm mode="edit" isSuper={isSuper} user={editUser} onClose={() => setEditUser(null)} onReveal={setReveal} onDone={() => { setEditUser(null); refresh(); }} />}
      {accessUser && <AccessEditor user={accessUser} workspaces={workspaces} onClose={() => setAccessUser(null)} />}
      {reveal && <RevealModal data={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function UserForm({ mode, isSuper, user, onClose, onDone, onReveal }: any) {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.username || '', password: '', role: user?.role || 'user', disabled: !!user?.disabled });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      if (mode === 'create') {
        const r = await api.admin.createUser({ name: form.name, email: form.email, password: form.password || undefined, role: form.role });
        onReveal({ title: `Invite for ${r.user.name}`, name: r.user.name, username: r.user.username, password: r.tempPassword || form.password, loginUrl: 'https://outbound.1propertymarket.com/login' });
      } else {
        await api.admin.updateUser({ id: user.id, name: form.name, email: form.email, role: isSuper ? form.role : undefined, disabled: form.disabled, password: form.password || undefined });
      }
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={mode === 'create' ? 'New user' : `Edit ${user.name}`} onClose={onClose}>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      <Field label="Full name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Email (this is their login)"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" /></Field>
      <Field label={mode === 'create' ? 'Password (leave blank to auto-generate an invite)' : 'New password (leave blank to keep current)'}>
        <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === 'create' ? 'Optional' : 'Unchanged'} />
      </Field>
      {isSuper && (
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">User (scoped access)</option>
            <option value="admin">Admin (sees everything)</option>
            <option value="super_admin">Super admin (manages users)</option>
          </select>
        </Field>
      )}
      {mode === 'edit' && (
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.disabled} onChange={(e) => setForm({ ...form, disabled: e.target.checked })} className="h-4 w-4 accent-[#1f6feb]" /> Account disabled (cannot sign in)
        </label>
      )}
      {mode === 'create' && form.role === 'user' && <p className="mb-4 text-xs text-slate-500">After creating, click <b>Scope</b> to choose which workspaces and agents they can see.</p>}
      <button className="btn-primary w-full" disabled={busy || !form.name || !form.email} onClick={submit}>{busy ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}</button>
    </Modal>
  );
}

function RevealModal({ data, onClose }: { data: any; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const copy = (k: string, v: string) => { navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1400); };
  const loginUrl = data.loginUrl || 'https://outbound.1propertymarket.com/login';
  const onboardMsg =
`Hi ${data.name || 'there'},

You've been given access to the 1PropertyMarket — Outbound dashboard.

Sign in here: ${loginUrl}
Username (your email): ${data.username || ''}
Temporary password: ${data.password}

After you sign in, you can change your password anytime under "My account" in the sidebar. Please keep these details private.

Thanks,
1PropertyMarket`;
  return (
    <Modal title={data.title} onClose={onClose} wide>
      <p className="mb-3 text-xs text-slate-500">No email is connected yet, so share these credentials directly. The user becomes “Active” once they sign in.</p>
      <div className="space-y-2">
        {data.username && <CopyRow label="Login" value={data.username} copied={copied === 'u'} onCopy={() => copy('u', data.username)} />}
        <CopyRow label="Password" value={data.password} copied={copied === 'p'} onCopy={() => copy('p', data.password)} mono />
        <CopyRow label="Login URL" value={loginUrl} copied={copied === 'l'} onCopy={() => copy('l', loginUrl)} />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="label">Ready-to-send onboarding message</label>
          <button className="btn-ghost !py-1 text-xs" onClick={() => copy('msg', onboardMsg)}>{copied === 'msg' ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy message</>}</button>
        </div>
        <textarea readOnly value={onboardMsg} rows={11} className="input text-xs" />
      </div>

      <button className="btn-primary mt-4 w-full" onClick={() => copy('msg', onboardMsg)}>{copied === 'msg' ? <><Check className="h-4 w-4" /> Copied onboarding message</> : <><Copy className="h-4 w-4" /> Copy onboarding message</>}</button>
    </Modal>
  );
}
function CopyRow({ label, value, copied, onCopy, mono }: any) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 py-2">
      <div className="min-w-0 flex-1"><div className="label">{label}</div><div className={`truncate text-sm text-ink ${mono ? 'font-mono' : ''}`}>{value}</div></div>
      <button className="rounded p-1.5 text-slate-400 hover:text-brand" onClick={onCopy}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
    </div>
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

  const toggleWs = (slug: string) => setRows((prev) => { const next = { ...prev }; if (next[slug]) delete next[slug]; else next[slug] = { workspace: slug, agent_mode: 'all', agent_ids: [] }; return next; });
  const loadAgents = async (slug: string) => { setExpanded(expanded === slug ? null : slug); if (!agentsByWs[slug]) { const d = await api.admin.workspaceAgents(slug); setAgentsByWs((p) => ({ ...p, [slug]: d.agents })); } };
  const setMode = (slug: string, mode: AccessRow['agent_mode']) => setRows((p) => ({ ...p, [slug]: { ...p[slug], agent_mode: mode } }));
  const toggleAgent = (slug: string, id: string) => setRows((p) => { const cur = p[slug]; const has = cur.agent_ids.includes(id); return { ...p, [slug]: { ...cur, agent_ids: has ? cur.agent_ids.filter((x) => x !== id) : [...cur.agent_ids, id] } }; });
  const save = async () => { setBusy(true); try { await api.admin.setAccess({ userId: user.id, access: Object.values(rows) }); setSaved(true); setTimeout(onClose, 700); } finally { setBusy(false); } };

  return (
    <Modal title={`Access — ${user.name}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-500">Pick the workspaces this user can open. For each, choose which agents they can see.</p>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {workspaces.map((w) => {
          const on = !!rows[w.slug]; const row = rows[w.slug];
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
                      <option value="all">All agents</option><option value="only">Only selected</option><option value="except">All except selected</option>
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
