// Shared "Users & access" surface. Rendered by BOTH the global Users & Access page
// (src/pages/UsersAdmin.tsx) and the customer detail "Users & access" tab
// (src/pages/CustomerDetail.tsx). Pass `scopeWorkspaces` to run it scoped to one
// customer's workspace(s): the user list is filtered to that workspace's members and
// the access editor / new-user flow pre-target that workspace. All create / edit /
// reset / invite / scope / view logic is shared so the two surfaces never drift.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, opm } from '../lib/api';
import { listings } from '../lib/listings';
import { audit, type AuditEvent } from '../lib/audit';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from './ui';
import {
  UserPlus, ShieldCheck, X, Check, Pencil, KeyRound, Send, Copy, Clock, Eye,
  Search, Download, ChevronLeft, ChevronRight, Filter, ArrowUpDown, RefreshCw,
} from 'lucide-react';

export type Ws = { slug: string; display_name: string; status?: string };
type LeadScope = 'all' | 'assigned';
type ListingScope = 'own' | 'all';
type AccessRow = { workspace: string; agent_mode: 'all' | 'only' | 'except'; agent_ids: string[]; lead_scope: LeadScope; listing_scope: ListingScope };

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
// Compact relative time ("3m", "5h", "2d") for the activity feed.
const rel = (s: string | null) => {
  if (!s) return '';
  const d = Date.now() - new Date(s).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days < 30 ? `${days}d ago` : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const titleize = (s: string) => (s || '').replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Category → pill colors, so the eye can scan the feed by type at a glance.
const CAT_STYLE: Record<string, string> = {
  auth: 'bg-sky-100 text-sky-700',
  admin: 'bg-violet-100 text-violet-700',
  account: 'bg-indigo-100 text-indigo-700',
  ai: 'bg-fuchsia-100 text-fuchsia-700',
  navigation: 'bg-slate-100 text-slate-600',
  campaign: 'bg-amber-100 text-amber-700',
  pipeline: 'bg-blue-100 text-blue-700',
  assignment: 'bg-teal-100 text-teal-700',
  disposition: 'bg-emerald-100 text-emerald-700',
  contact: 'bg-cyan-100 text-cyan-700',
  note: 'bg-lime-100 text-lime-700',
  import: 'bg-orange-100 text-orange-700',
  agent: 'bg-purple-100 text-purple-700',
  call: 'bg-rose-100 text-rose-700',
  crm: 'bg-slate-100 text-slate-600',
  system: 'bg-slate-100 text-slate-500',
  other: 'bg-slate-100 text-slate-500',
};
const catStyle = (c: string | null) => CAT_STYLE[(c || 'other').toLowerCase()] || CAT_STYLE.other;

// Turn an event into a readable one-liner. Prefers plain detail text, then interprets
// the structured detail_json emitted by the CRM log (stage changes, assignments, campaigns…).
function describe(ev: AuditEvent): string {
  if (ev.detail_text) return ev.detail_text;
  const d = ev.detail_json || {};
  switch (ev.action) {
    case 'stage_change': return `Stage ${d.from_stage_id ?? '?'} → ${d.to_stage_id ?? '?'}${d.from_pipeline_id !== d.to_pipeline_id ? ` (pipeline ${d.from_pipeline_id}→${d.to_pipeline_id})` : ''}`;
    case 'assign_lead': return d.primary_name ? `Assigned to ${d.primary_name}` : 'Lead assignment updated';
    case 'campaign_launch': return `${d.name || 'Campaign'} · ${d.dialable ?? d.total ?? 0} dialable of ${d.total ?? 0}`;
    case 'note_added': return `Note added${d.chars ? ` (${d.chars} chars)` : ''}`;
    case 'page_view': return '';
    default: break;
  }
  const keys = Object.keys(d);
  if (!keys.length) return '';
  return keys.slice(0, 4).map((k) => `${k}: ${typeof d[k] === 'object' ? JSON.stringify(d[k]) : d[k]}`).join(' · ');
}

function StatusBadge({ u }: { u: any }) {
  if (u.disabled) return <span className="pill bg-red-100 text-red-700">Disabled</span>;
  if (!u.claimed_at) return <span className="pill bg-amber-100 text-amber-700">Pending invite</span>;
  return <span className="pill bg-emerald-100 text-emerald-700">Active</span>;
}

// Sortable column header for the users table.
function SortTh({ k, label, sort, onSort, className }: { k: string; label: string; sort: { by: string; dir: 'asc' | 'desc' }; onSort: (k: string) => void; className?: string }) {
  const active = sort.by === k;
  return (
    <th className={`px-3 py-2.5 font-semibold ${className || ''}`}>
      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(k)} title={`Sort by ${label}`}>
        {label}<ArrowUpDown className={`h-3 w-3 ${active ? 'text-brand' : 'text-slate-300'}`} />
      </button>
    </th>
  );
}
// Compact labelled <select> for the activity filter bar.
function FilterSelect({ value, onChange, children, title }: { value: string; onChange: (v: string) => void; children: any; title?: string }) {
  return <select title={title} className="input w-auto !py-1.5 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>;
}

export function UsersAndAccess({
  scopeWorkspaces, scopedEmails, primaryWorkspace, onChanged,
}: {
  // When provided → customer-scoped mode. Undefined → global (all users, all workspaces).
  scopeWorkspaces?: Ws[];
  // Emails of the users that belong to this customer's workspace(s) (from tenant_detail).
  scopedEmails?: string[];
  // Workspace a newly created (or edited) scoped user is granted by default.
  primaryWorkspace?: string;
  // Notify the parent (e.g. reload tenant_detail) after membership/access changes.
  onChanged?: () => void;
}) {
  const scoped = !!scopeWorkspaces;
  const { user: me, startImpersonation } = useAuth();
  const isSuper = me?.role === 'super_admin';
  const [users, setUsers] = useState<any[]>([]);
  const [allWs, setAllWs] = useState<Ws[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [accessUser, setAccessUser] = useState<any>(null);
  const [reveal, setReveal] = useState<{ title: string; name?: string; username?: string; password: string; loginUrl?: string } | null>(null);
  // Lead-visibility scope per user (keyed by email), surfaced as a badge. Scoped mode only —
  // lead_scope lives per (user, workspace), so we read the customer's primary workspace members.
  const [scopeByEmail, setScopeByEmail] = useState<Record<string, LeadScope>>({});

  // ---- users table controls (client-side; the user list is small) ----
  const [uSearch, setUSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [uSort, setUSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({ by: 'name', dir: 'asc' });
  const toggleSort = (by: string) => setUSort((s) => (s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: 'asc' }));

  // ---- unified activity feed (user_events + CRM log) via the /audit function ----
  const wsInList = scoped ? (scopeWorkspaces || []).map((w) => w.slug) : undefined;
  const PAGE = 25;
  const emptyFacets = { actions: [] as string[], categories: [] as string[], workspaces: [] as string[], entities: [] as string[], actors: [] as { id: number; name: string }[] };
  const [feed, setFeed] = useState<{ events: AuditEvent[]; total: number; facets: typeof emptyFacets }>({ events: [], total: 0, facets: emptyFacets });
  const [feedLoading, setFeedLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [af, setAf] = useState({ q: '', category: '', evt: '', actor: '', ws: '', from: '', to: '' });
  const [qDebounced, setQDebounced] = useState('');
  const searchTimer = useRef<any>(null);
  const setFilter = (patch: Partial<typeof af>) => { setAf((a) => ({ ...a, ...patch })); setOffset(0); };
  const resetFilters = () => { setAf({ q: '', category: '', evt: '', actor: '', ws: '', from: '', to: '' }); setQDebounced(''); setOffset(0); };

  const scopeWsSlug = primaryWorkspace || scopeWorkspaces?.[0]?.slug || null;
  const loadScopes = async () => {
    if (!scoped || !scopeWsSlug) return;
    try {
      const d: any = await opm.workspaceMembers(scopeWsSlug);
      const m: Record<string, LeadScope> = {};
      for (const mem of (d.members || [])) if (mem.email) m[String(mem.email).toLowerCase()] = (mem.lead_scope === 'assigned' ? 'assigned' : 'all');
      setScopeByEmail(m);
    } catch { /* non-fatal */ }
  };

  const dayMs = (v: string, end?: boolean) => (v ? new Date(v + (end ? 'T23:59:59.999' : 'T00:00:00')).getTime() : undefined);
  const buildQuery = () => ({
    q: qDebounced || undefined,
    category: af.category || undefined,
    evt: af.evt || undefined,
    actor: af.actor || undefined,
    ws: !scoped && af.ws ? af.ws : undefined,
    ws_in: scoped ? wsInList : undefined,
    from: dayMs(af.from), to: dayMs(af.to, true),
  });
  const loadFeed = async (ofs: number) => {
    setFeedLoading(true);
    try { const d = await audit.events({ ...buildQuery(), limit: PAGE, offset: ofs }); setFeed(d as any); }
    catch { setFeed({ events: [], total: 0, facets: emptyFacets }); }
    finally { setFeedLoading(false); }
  };

  const refresh = async () => {
    const u = await api.admin.users(); setUsers(u.users);
    if (scoped) { onChanged?.(); loadScopes(); }
    setOffset(0); loadFeed(0);
  };
  useEffect(() => {
    Promise.all([api.admin.users(), api.admin.allWorkspaces()])
      .then(([u, w]) => { setUsers(u.users); setAllWs(w.workspaces); })
      .finally(() => setLoading(false));
    loadScopes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Debounce the free-text search box before it hits the server.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setQDebounced(af.q.trim()); setOffset(0); }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [af.q]);
  // Reload the feed whenever a filter or the page changes.
  useEffect(() => { loadFeed(offset); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [offset, qDebounced, af.category, af.evt, af.actor, af.ws, af.from, af.to]);

  const exportCsv = async () => {
    try {
      const d = await audit.events({ ...buildQuery(), limit: 1000, offset: 0 });
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const head = ['time', 'category', 'action', 'actor', 'workspace', 'target', 'entity', 'details'];
      const lines = [head.join(',')].concat((d.events || []).map((e: AuditEvent) => [
        new Date(e.created_at).toISOString(), e.category || '', e.action, e.actor_name || '', e.workspace || '',
        e.target_name || '', e.entity_type && e.entity_id ? `${e.entity_type}:${e.entity_id}` : '', describe(e),
      ].map(esc).join(',')));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `platform-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    } catch { alert('Could not export right now — please try again.'); }
  };

  // Which users to show. Scoped → only users whose login/email is a member of this customer's workspace(s).
  const emailSet = useMemo(() => new Set((scopedEmails || []).map((x) => (x || '').toLowerCase())), [scopedEmails]);
  const shownUsers = useMemo(
    () => (scoped ? users.filter((u) => emailSet.has(String(u.username || u.email || '').toLowerCase())) : users),
    [users, scoped, emailSet],
  );
  // Search + role/status filter + sort, applied client-side over the (small) user list.
  const filteredUsers = useMemo(() => {
    let list = shownUsers;
    const q = uSearch.trim().toLowerCase();
    if (q) list = list.filter((u) => `${u.name || ''} ${u.username || ''} ${u.email || ''}`.toLowerCase().includes(q));
    if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    if (statusFilter) list = list.filter((u) => statusFilter === 'disabled' ? u.disabled : statusFilter === 'pending' ? (!u.disabled && !u.claimed_at) : statusFilter === 'active' ? (!u.disabled && !!u.claimed_at) : true);
    const dir = uSort.dir === 'asc' ? 1 : -1;
    const val = (u: any) => {
      switch (uSort.by) {
        case 'email': return (u.username || '').toLowerCase();
        case 'role': return u.role || '';
        case 'status': return u.disabled ? '2' : (!u.claimed_at ? '1' : '0');
        case 'last': return u.last_signed_in ? new Date(u.last_signed_in).getTime() : 0;
        default: return (u.name || '').toLowerCase();
      }
    };
    return [...list].sort((a, b) => { const av = val(a), bv = val(b); return av < bv ? -dir : av > bv ? dir : 0; });
  }, [shownUsers, uSearch, roleFilter, statusFilter, uSort]);
  // Workspaces the access editor operates on (scoped → just this customer's).
  const editorWorkspaces = scoped ? (scopeWorkspaces as Ws[]) : allWs;

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

  // Scoped new user: after create, auto-grant this workspace so they appear in the list, then open Scope.
  const afterCreate = scoped && primaryWorkspace
    ? async (created: any) => { try { await api.admin.setAccess({ userId: created.id, access: [{ workspace: primaryWorkspace, agent_mode: 'all', agent_ids: [] }] }); } catch { /* ignore */ } }
    : undefined;

  if (loading) return <Spinner />;

  const newUserBtn = isSuper && <button className="btn-primary" onClick={() => setCreating(true)}><UserPlus className="h-4 w-4" /> New user</button>;

  return (
    <div>
      {scoped ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Logins scoped to this customer. Create a new login, set each person's agent <b>Scope</b>, edit details, reset their password, resend an invite, or view the dashboard as them.</p>
          {newUserBtn}
        </div>
      ) : (
        <PageHead title="Users & Access" subtitle="Create logins and scope exactly what each person can see" right={newUserBtn} />
      )}

      {/* Users table controls: search + role + status */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={uSearch} onChange={(e) => setUSearch(e.target.value)} placeholder="Search users…" className="input w-full pl-8 sm:w-[240px]" />
        </div>
        <FilterSelect value={roleFilter} onChange={setRoleFilter} title="Role">
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super admin</option>
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={setStatusFilter} title="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending invite</option>
          <option value="disabled">Disabled</option>
        </FilterSelect>
        <span className="text-xs text-slate-400">{filteredUsers.length} of {shownUsers.length}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortTh k="name" label="Name" sort={uSort} onSort={toggleSort} className="!px-5" />
              <SortTh k="email" label="Email" sort={uSort} onSort={toggleSort} />
              <SortTh k="role" label="Role" sort={uSort} onSort={toggleSort} />
              <SortTh k="status" label="Status" sort={uSort} onSort={toggleSort} />
              <SortTh k="last" label="Last seen" sort={uSort} onSort={toggleSort} />
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">{shownUsers.length === 0 ? (scoped ? 'No users have access to this customer yet. Create one to get started.' : 'No users yet.') : 'No users match these filters.'}</td></tr>
            )}
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-t border-line hover:bg-surface">
                <td className="px-5 py-2.5 font-semibold text-ink">{u.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{u.username}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="pill bg-brand-light text-brand">{u.role.replace('_', ' ')}</span>
                    {scoped && (() => {
                      const s = scopeByEmail[String(u.username || u.email || '').toLowerCase()];
                      if (!s) return null;
                      return <span className={`pill ${s === 'assigned' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`} title="Lead visibility">{s === 'assigned' ? 'Assigned only' : 'All leads'}</span>;
                    })()}
                  </div>
                </td>
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

      {/* ---------------- Platform activity (unified audit feed) ---------------- */}
      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Clock className="h-3.5 w-3.5" /> Platform activity
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{feed.total.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => loadFeed(offset)} title="Refresh"><RefreshCw className={`h-3.5 w-3.5 ${feedLoading ? 'animate-spin' : ''}`} /></button>
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={exportCsv} title="Export current view to CSV"><Download className="h-3.5 w-3.5" /> Export</button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/40 px-5 py-2.5">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={af.q} onChange={(e) => setAf((a) => ({ ...a, q: e.target.value }))} placeholder="Search activity…" className="input w-full pl-8 sm:w-[220px] !py-1.5 text-xs" />
          </div>
          <FilterSelect value={af.category} onChange={(v) => setFilter({ category: v })} title="Category">
            <option value="">All categories</option>
            {feed.facets.categories.map((c) => <option key={c} value={c}>{titleize(c)}</option>)}
          </FilterSelect>
          <FilterSelect value={af.evt} onChange={(v) => setFilter({ evt: v })} title="Action">
            <option value="">All actions</option>
            {feed.facets.actions.map((a) => <option key={a} value={a}>{titleize(a)}</option>)}
          </FilterSelect>
          <FilterSelect value={af.actor} onChange={(v) => setFilter({ actor: v })} title="User">
            <option value="">All users</option>
            {feed.facets.actors.map((a) => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </FilterSelect>
          {!scoped && (
            <FilterSelect value={af.ws} onChange={(v) => setFilter({ ws: v })} title="Workspace">
              <option value="">All workspaces</option>
              {feed.facets.workspaces.map((w) => <option key={w} value={w}>{w}</option>)}
            </FilterSelect>
          )}
          <input type="date" value={af.from} onChange={(e) => setFilter({ from: e.target.value })} title="From date" className="input w-auto !py-1.5 text-xs" />
          <span className="text-xs text-slate-400">→</span>
          <input type="date" value={af.to} onChange={(e) => setFilter({ to: e.target.value })} title="To date" className="input w-auto !py-1.5 text-xs" />
          {(af.q || af.category || af.evt || af.actor || af.ws || af.from || af.to) && (
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={resetFilters}><X className="h-3.5 w-3.5" /> Clear</button>
          )}
        </div>

        <div className="max-h-[520px] overflow-x-auto overflow-y-auto">
          {feedLoading && feed.events.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">Loading activity…</div>
          ) : feed.events.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">No activity matches these filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Where</th>
                  <th className="px-3 py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {feed.events.map((e) => {
                  const desc = describe(e);
                  const ip = e.detail_json?.ip;
                  const imp = e.detail_json?.impersonator;
                  return (
                    <tr key={e.uid} className="border-t border-line align-top hover:bg-surface">
                      <td className="whitespace-nowrap px-5 py-2 text-xs text-slate-500" title={dt(e.created_at)}>{rel(e.created_at)}</td>
                      <td className="px-3 py-2"><span className={`pill ${catStyle(e.category)}`}>{titleize(e.category || 'other')}</span></td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-ink">{titleize(e.action)}</td>
                      <td className="px-3 py-2 text-slate-700">
                        <div className="font-semibold text-ink">{e.actor_name || 'system'}</div>
                        {imp && <div className="text-[10px] text-amber-600">via {imp}</div>}
                        {e.target_name && e.target_name !== e.actor_name && <div className="text-[11px] text-slate-500">→ {e.target_name}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                        {e.workspace && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{e.workspace}</span>}
                        {e.entity_type && e.entity_id && <div className="mt-0.5 font-mono text-[10px] text-slate-400">{e.entity_type}:{e.entity_id}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {desc || <span className="text-slate-300">—</span>}
                        {ip && <span className="ml-1 font-mono text-[10px] text-slate-400">· {ip}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-xs text-slate-500">
          <span>{feed.total === 0 ? 'No results' : `${offset + 1}–${Math.min(offset + PAGE, feed.total)} of ${feed.total.toLocaleString()}`}</span>
          <div className="flex items-center gap-1">
            <button className="btn-ghost !px-2 !py-1 text-xs disabled:opacity-40" disabled={offset === 0 || feedLoading} onClick={() => setOffset(Math.max(0, offset - PAGE))}><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
            <button className="btn-ghost !px-2 !py-1 text-xs disabled:opacity-40" disabled={offset + PAGE >= feed.total || feedLoading} onClick={() => setOffset(offset + PAGE)}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      {creating && <UserForm mode="create" isSuper={isSuper} afterCreate={afterCreate} onClose={() => setCreating(false)} onReveal={setReveal} onDone={() => { setCreating(false); refresh(); }} />}
      {editUser && <UserForm mode="edit" isSuper={isSuper} user={editUser} onClose={() => setEditUser(null)} onReveal={setReveal} onDone={() => { setEditUser(null); refresh(); }} />}
      {accessUser && <AccessEditor user={accessUser} workspaces={editorWorkspaces} onClose={() => setAccessUser(null)} onSaved={refresh} />}
      {reveal && <RevealModal data={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function UserForm({ mode, isSuper, user, afterCreate, onClose, onDone, onReveal }: any) {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.username || '', password: '', role: user?.role || 'user', disabled: !!user?.disabled });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      if (mode === 'create') {
        const r = await api.admin.createUser({ name: form.name, email: form.email, password: form.password || undefined, role: form.role });
        if (afterCreate) await afterCreate(r.user);
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
      {mode === 'create' && form.role === 'user' && <p className="mb-4 text-xs text-slate-500">After creating, click <b>Scope</b> to choose which workspaces and agents they can see, and set their <b>Lead visibility</b> (all leads vs only assigned).</p>}
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

function AccessEditor({ user, workspaces, onClose, onSaved }: { user: any; workspaces: Ws[]; onClose: () => void; onSaved?: () => void }) {
  const [rows, setRows] = useState<Record<string, AccessRow>>({});
  const [agentsByWs, setAgentsByWs] = useState<Record<string, any[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, ls] = await Promise.all([
        api.admin.getAccess(user.id),
        listings.userScopes(user.id).then((r: any) => r.scopes || {}).catch(() => ({})),
      ]);
      const map: Record<string, AccessRow> = {};
      for (const r of d.access) map[r.workspace] = { workspace: r.workspace, agent_mode: r.agent_mode, agent_ids: r.agent_ids || [], lead_scope: r.lead_scope === 'assigned' ? 'assigned' : 'all', listing_scope: (ls as any)[r.workspace] === 'all' ? 'all' : 'own' };
      setRows(map);
    })();
  }, [user.id]);

  const toggleWs = (slug: string) => setRows((prev) => { const next = { ...prev }; if (next[slug]) delete next[slug]; else next[slug] = { workspace: slug, agent_mode: 'all', agent_ids: [], lead_scope: 'all', listing_scope: 'own' }; return next; });
  const setLeadScope = (slug: string, scope: LeadScope) => setRows((p) => ({ ...p, [slug]: { ...p[slug], lead_scope: scope } }));
  const setListingScope = (slug: string, scope: ListingScope) => setRows((p) => ({ ...p, [slug]: { ...p[slug], listing_scope: scope } }));
  const loadAgents = async (slug: string) => { setExpanded(expanded === slug ? null : slug); if (!agentsByWs[slug]) { const d = await api.admin.workspaceAgents(slug); setAgentsByWs((p) => ({ ...p, [slug]: d.agents })); } };
  const setMode = (slug: string, mode: AccessRow['agent_mode']) => setRows((p) => ({ ...p, [slug]: { ...p[slug], agent_mode: mode } }));
  const toggleAgent = (slug: string, id: string) => setRows((p) => { const cur = p[slug]; const has = cur.agent_ids.includes(id); return { ...p, [slug]: { ...cur, agent_ids: has ? cur.agent_ids.filter((x) => x !== id) : [...cur.agent_ids, id] } }; });
  // NOTE: rows carries the user's FULL access set (loaded above), so saving preserves grants to
  // workspaces outside `workspaces` — scoping the editor never wipes other customers' access.
  const save = async () => {
    setBusy(true);
    try {
      await api.admin.setAccess({ userId: user.id, access: Object.values(rows) });
      // listing_scope lives on user_workspace_access but is persisted via opm-listings (setAccess
      // re-inserts rows at the default 'own'), so apply each workspace's chosen scope afterward.
      await Promise.all(Object.values(rows).map((r) =>
        listings.setUserScope({ user_id: user.id, workspace: r.workspace, listing_scope: r.listing_scope }).catch(() => {})
      ));
      setSaved(true); onSaved?.(); setTimeout(onClose, 700);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`Access — ${user.name}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-500">Pick the workspaces this user can open. For each, choose which agents they can see and their lead visibility.</p>
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
              {on && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className="text-xs font-semibold text-slate-500">Lead visibility</span>
                  <select className="input w-auto !py-1 text-xs" value={row.lead_scope} onChange={(e) => setLeadScope(w.slug, e.target.value as LeadScope)}>
                    <option value="all">All leads (manager / owner)</option>
                    <option value="assigned">Only assigned leads (rep)</option>
                  </select>
                  <span className="text-[11px] text-slate-400">{row.lead_scope === 'assigned' ? 'Sees only leads where they are primary or a follower.' : 'Sees every lead in this workspace.'}</span>
                  <span className="ml-2 text-xs font-semibold text-slate-500">Listing visibility</span>
                  <select className="input w-auto !py-1 text-xs" value={row.listing_scope} onChange={(e) => setListingScope(w.slug, e.target.value as ListingScope)}>
                    <option value="own">Only their own listings</option>
                    <option value="all">All listings in workspace</option>
                  </select>
                  <span className="text-[11px] text-slate-400">{row.listing_scope === 'all' ? 'Sees every property listing in this workspace.' : 'Sees only listings assigned to them or where they are a party.'}</span>
                </div>
              )}
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
      <div className={`card w-full ${wide ? 'max-w-lg' : 'max-w-sm'} mx-4 max-h-[90vh] overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
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
