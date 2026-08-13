import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { notif } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner, EmptyState } from '../components/ui';
import { relTime } from '../lib/reltime';
import {
  Bell, Activity, AlarmClock, UserPlus, Users, AtSign, MessageSquare, CheckCheck,
  Inbox, SlidersHorizontal, Mail, Smartphone, ShieldCheck, Loader2, Save, CheckCircle2, Settings2,
} from 'lucide-react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

function typeIcon(type?: string) {
  const t = String(type || '').toLowerCase();
  if (t === 'pulse') return { Icon: Activity, tone: 'text-violet-600 bg-violet-100' };
  if (t === 'sla_no_touch' || t.includes('no_touch') || t.includes('sla')) return { Icon: AlarmClock, tone: 'text-amber-600 bg-amber-100' };
  if (t.includes('assign')) return { Icon: UserPlus, tone: 'text-brand bg-brand-light' };
  if (t.includes('follow')) return { Icon: Users, tone: 'text-sky-600 bg-sky-100' };
  if (t.includes('mention')) return { Icon: AtSign, tone: 'text-emerald-600 bg-emerald-100' };
  if (t.includes('comment') || t.includes('feed') || t.includes('message')) return { Icon: MessageSquare, tone: 'text-indigo-600 bg-indigo-100' };
  return { Icon: Bell, tone: 'text-slate-600 bg-slate-100' };
}

type Notification = {
  id: string | number; type?: string; title?: string; body?: string;
  lead_id?: string; link?: string; actor_name?: string; read_at?: string | null;
  created_at?: string | number; workspace?: string;
};
type Prefs = { muted: string[]; email: boolean; inapp: boolean };
type CatalogItem = { type: string; label: string };

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className={cx('relative h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-brand' : 'bg-slate-300')}>
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export default function NotificationCenter() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { active } = useWorkspace();
  const { isAdmin } = useAuth();
  const { isStaff, ownsActive, roles } = useWorkspace();
  const canManageWorkspace = isAdmin || isStaff || ownsActive || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);

  const tab = sp.get('tab') === 'prefs' ? 'prefs' : 'inbox';
  const setTab = (t: 'inbox' | 'prefs') => { const n = new URLSearchParams(sp); if (t === 'prefs') n.set('tab', 'prefs'); else n.delete('tab'); setSp(n, { replace: true }); };

  // ---- Inbox ----
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(25);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadInbox = useCallback(() => {
    setLoading(true);
    notif.inboxList({ limit, unread_only: unreadOnly }).then((d: any) => setItems(d?.notifications || [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, [limit, unreadOnly]);
  useEffect(() => { loadInbox(); }, [loadInbox]);

  async function openRow(n: Notification) {
    if (!n.read_at) {
      notif.inboxMarkRead({ ids: [n.id] }).catch(() => {});
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    const link = n.link || (n.lead_id ? `/leads/${n.lead_id}` : '');
    if (!link) return;
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else nav(link);
  }
  async function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    try { await notif.inboxMarkRead({ all: true }); } catch {}
    loadInbox();
  }
  const anyUnread = items.some((i) => !i.read_at);

  // ---- Preferences ----
  const [prefs, setPrefs] = useState<Prefs>({ muted: [], email: true, inapp: true });
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setPrefsLoading(true);
    notif.myPrefsGet(active || undefined)
      .then((d: any) => {
        const p = d?.prefs || {};
        setPrefs({ muted: Array.isArray(p.muted) ? p.muted : [], email: p.email !== false, inapp: p.inapp !== false });
        setCatalog(Array.isArray(d?.catalog) ? d.catalog : []);
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, [active]);

  const isOn = (type: string) => !prefs.muted.includes(type); // opt-out: everything on unless muted
  function toggleType(type: string) {
    setPrefs((p) => ({ ...p, muted: p.muted.includes(type) ? p.muted.filter((m) => m !== type) : [...p.muted, type] }));
  }
  async function savePrefs() {
    setSaving(true);
    try { await notif.myPrefsSave(prefs, active || undefined); setSavedAt(Date.now()); } catch {} finally { setSaving(false); }
  }
  const onCount = useMemo(() => catalog.filter((c) => isOn(c.type)).length, [catalog, prefs.muted]);

  return (
    <div>
      <PageHead
        title="Notification Center"
        subtitle="Your personal inbox and alert preferences"
        right={
          <div className="flex items-center gap-2">
            {canManageWorkspace && (
              <button onClick={() => nav('/notifications')} className="btn-ghost !py-1.5 text-sm" title="Workspace-level notification rules (managers)">
                <Settings2 className="h-4 w-4" /> Workspace rules
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-5 inline-flex rounded-lg border border-line bg-white p-0.5">
        {([['inbox', 'Inbox', Inbox], ['prefs', 'Preferences', SlidersHorizontal]] as const).map(([k, label, Ic]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cx('inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition', tab === k ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface')}>
            <Ic className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'inbox' ? (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setUnreadOnly(false)} className={cx('rounded-full px-3 py-1 text-xs font-semibold', !unreadOnly ? 'bg-brand text-white' : 'bg-surface text-slate-600')}>All</button>
              <button onClick={() => setUnreadOnly(true)} className={cx('rounded-full px-3 py-1 text-xs font-semibold', unreadOnly ? 'bg-brand text-white' : 'bg-surface text-slate-600')}>Unread</button>
            </div>
            <button onClick={markAll} disabled={!anyUnread} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-brand disabled:opacity-40">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState text={unreadOnly ? 'No unread notifications.' : "No notifications yet. Pulses, mentions, assignments and SLA pings will show up here."} />
          ) : (
            <>
              <ul>
                {items.map((n) => {
                  const { Icon, tone } = typeIcon(n.type);
                  const unread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button onClick={() => openRow(n)} className={cx('flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition hover:bg-surface', unread && 'bg-brand-light/30')}>
                        <span className={cx('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full', tone)}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={cx('min-w-0 flex-1 truncate text-sm', unread ? 'font-bold text-ink' : 'font-semibold text-slate-700')}>{n.title || 'Notification'}</span>
                            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                          </span>
                          {n.body && <span className="mt-0.5 block text-xs text-slate-500">{n.body}</span>}
                          <span className="mt-1 block text-[11px] text-slate-400">{n.actor_name ? `${n.actor_name} · ` : ''}{relTime(n.created_at)}{n.workspace ? ` · ${n.workspace}` : ''}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {items.length >= limit && (
                <div className="p-3 text-center">
                  <button onClick={() => setLimit((l) => l + 25)} className="btn-ghost !py-1.5 text-sm">Load more</button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {prefsLoading ? (
            <Spinner />
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="text-sm text-emerald-800">
                  <span className="font-bold">Everything is on by default.</span> You'll receive every alert type unless you switch it off here. {onCount} of {catalog.length} types are currently on.
                </div>
              </div>

              {/* Master channels */}
              <section className="card p-4">
                <div className="mb-3 flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-brand" /><h3 className="text-sm font-bold text-ink">Channels</h3><span className="text-xs text-slate-400">How you receive alerts</span></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={cx('flex items-center justify-between rounded-lg border p-3', prefs.inapp ? 'border-brand/40 bg-brand-light/40' : 'border-line')}>
                    <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-slate-500" /><span className="text-sm font-bold text-ink">In-app</span></div>
                    <Toggle on={prefs.inapp} onChange={() => setPrefs((p) => ({ ...p, inapp: !p.inapp }))} />
                  </div>
                  <div className={cx('flex items-center justify-between rounded-lg border p-3', prefs.email ? 'border-brand/40 bg-brand-light/40' : 'border-line')}>
                    <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500" /><span className="text-sm font-bold text-ink">Email</span></div>
                    <Toggle on={prefs.email} onChange={() => setPrefs((p) => ({ ...p, email: !p.email }))} />
                  </div>
                </div>
              </section>

              {/* Per-type toggles */}
              <section className="card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-brand" /><h3 className="text-sm font-bold text-ink">Notification types</h3></div>
                  <div className="flex items-center gap-2 text-xs">
                    <button onClick={() => setPrefs((p) => ({ ...p, muted: [] }))} className="font-semibold text-brand hover:underline">Turn all on</button>
                    <button onClick={() => setPrefs((p) => ({ ...p, muted: catalog.map((c) => c.type) }))} className="font-semibold text-slate-400 hover:underline">Mute all</button>
                  </div>
                </div>
                {catalog.length === 0 ? (
                  <div className="text-xs text-slate-400">No notification types available.</div>
                ) : (
                  <div className="divide-y divide-line/70">
                    {catalog.map((c) => {
                      const { Icon, tone } = typeIcon(c.type);
                      const on = isOn(c.type);
                      return (
                        <div key={c.type} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full', tone)}><Icon className="h-3.5 w-3.5" /></span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-ink">{c.label}</span>
                              <span className="block text-[11px] text-slate-400">{on ? 'On — you get these' : 'Muted'}</span>
                            </span>
                          </div>
                          <Toggle on={on} onChange={() => toggleType(c.type)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="flex items-center justify-end gap-2">
                {savedAt && <span className="pill bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Saved</span>}
                <button onClick={savePrefs} disabled={saving} className="btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Saving…' : 'Save preferences'}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
