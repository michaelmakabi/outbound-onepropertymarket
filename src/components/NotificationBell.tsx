import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { notif } from '../lib/api';
import { relTime } from '../lib/reltime';
import {
  Bell, Activity, AlarmClock, UserPlus, Users, AtSign, MessageSquare, CheckCheck, Settings, Loader2, Inbox,
} from 'lucide-react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

type Notification = {
  id: string | number; type?: string; title?: string; body?: string;
  lead_id?: string; link?: string; actor_name?: string; read_at?: string | null;
  created_at?: string | number; workspace?: string;
};

// Map a notification type to an icon (pulse/SLA get distinct treatment).
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

const POLL_MS = 45000;

export default function NotificationBell({ variant = 'topbar', panelClassName }: { variant?: 'topbar' | 'sidebar'; panelClassName?: string }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const refreshCount = useCallback(() => {
    notif.inboxUnreadCount().then((d: any) => setCount(Number(d?.count) || 0)).catch(() => {});
  }, []);

  const loadList = useCallback(() => {
    setLoading(true);
    notif.inboxList({ limit: 12 }).then((d: any) => setItems(d?.notifications || [])).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  // Poll the unread count on an interval and whenever the route changes.
  useEffect(() => { refreshCount(); }, [loc.pathname, refreshCount]);
  useEffect(() => {
    const id = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);
  // Close the panel on navigation.
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function openRow(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      notif.inboxMarkRead({ ids: [n.id] }).then(() => refreshCount()).catch(() => {});
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    const link = n.link || (n.lead_id ? `/leads/${n.lead_id}` : '');
    if (!link) return;
    if (/^https?:\/\//i.test(link)) window.location.assign(link);
    else nav(link);
  }

  async function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    setCount(0);
    try { await notif.inboxMarkRead({ all: true }); } catch {}
    refreshCount();
  }

  const panelPos = panelClassName || (variant === 'sidebar'
    ? 'fixed left-[72px] bottom-4'
    : 'fixed right-3 top-14');

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Notifications"
        className={cx(
          'relative inline-flex items-center justify-center rounded-lg transition',
          variant === 'sidebar'
            ? 'h-9 w-9 text-slate-300 hover:bg-white/10 hover:text-white'
            : 'h-9 w-9 text-ink hover:bg-surface',
        )}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cx('z-50 w-[380px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl', panelPos)}>
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-ink"><Bell className="h-4 w-4 text-brand" /> Notifications{count > 0 && <span className="pill bg-brand-light text-brand">{count} new</span>}</div>
              <button onClick={markAll} disabled={items.every((i) => i.read_at)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-brand disabled:opacity-40">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-400"><Inbox className="h-6 w-6 text-slate-300" /> You're all caught up.</div>
              ) : (
                items.map((n) => {
                  const { Icon, tone } = typeIcon(n.type);
                  const unread = !n.read_at;
                  return (
                    <button key={n.id} onClick={() => openRow(n)} className={cx('flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition hover:bg-surface', unread && 'bg-brand-light/30')}>
                      <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', tone)}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cx('min-w-0 flex-1 truncate text-sm', unread ? 'font-bold text-ink' : 'font-semibold text-slate-700')}>{n.title || 'Notification'}</span>
                          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                        </span>
                        {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-slate-400">{n.actor_name ? `${n.actor_name} · ` : ''}{relTime(n.created_at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
              <button onClick={() => { setOpen(false); nav('/notifications-center'); }} className="text-xs font-semibold text-brand hover:underline">See all</button>
              <button onClick={() => { setOpen(false); nav('/notifications-center?tab=prefs'); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-brand">
                <Settings className="h-3.5 w-3.5" /> Preferences
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
