import { useCallback, useEffect, useMemo, useState } from 'react';
import { team, opm } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner, EmptyState, Kpi } from '../components/ui';
import MentionThread, { Member } from '../components/MentionThread';
import { humanizeDisposition, dispositionColor } from '../lib/format';
import {
  MessageSquare, BarChart3, SlidersHorizontal, Users, AlarmClock, Loader2, Save, CheckCircle2, Clock, Activity, ShieldAlert,
} from 'lucide-react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className={cx('relative h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-brand' : 'bg-slate-300')}>
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

/* ------------------------------------------------------------------ Feed */

function FeedTab({ members }: { members: Member[] }) {
  const { active } = useWorkspace();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    team.feedList({ limit: 100 }).then((d: any) => setMessages(d?.messages || [])).catch(() => setMessages([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load, active]);

  async function post(body: string, mentions: number[]) {
    await team.feedPost({ body, mentions: mentions.length ? mentions : undefined });
    load();
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-brand" /><h3 className="text-sm font-bold text-ink">Team channel</h3><span className="text-xs text-slate-400">Your workspace's internal status channel — everyone can post</span></div>
      <MentionThread
        members={members}
        messages={messages}
        loading={loading}
        onPost={post}
        newestFirst
        heightClass="max-h-[60vh]"
        placeholder="Share an update with the team… type @ to mention someone"
        emptyText="No messages yet. Start the conversation — post the first update."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Dashboard */

const AGING = [
  { k: 'd0_1', label: '0–1d', color: '#16a34a' },
  { k: 'd2_3', label: '2–3d', color: '#d97706' },
  { k: 'd4_7', label: '4–7d', color: '#ea580c' },
  { k: 'd8plus', label: '8d+', color: '#dc2626' },
] as const;

function fmtHours(h: any) {
  const n = Number(h);
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 1) return `${Math.round(n * 60)}m`;
  return `${n.toFixed(1)}h`;
}

function DispositionMix({ mix }: { mix: Record<string, number> | undefined }) {
  const entries = Object.entries(mix || {}).filter(([, v]) => Number(v) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length === 0) return <span className="text-xs text-slate-400">—</span>;
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  return (
    <div className="min-w-[140px]">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface">
        {entries.map(([k, v]) => <span key={k} title={`${humanizeDisposition(k)}: ${v}`} style={{ width: `${(Number(v) / total) * 100}%`, backgroundColor: dispositionColor(k) }} />)}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {entries.slice(0, 3).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dispositionColor(k) }} />{humanizeDisposition(k)} {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardTab() {
  const { active } = useWorkspace();
  const [data, setData] = useState<{ reps: any[]; totals: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    team.dashboard({}).then((d: any) => setData({ reps: d?.reps || [], totals: d?.totals || {} }))
      .catch((e: any) => setErr(e?.status === 403 ? 'forbidden' : (e?.message || 'Could not load the team dashboard.')))
      .finally(() => setLoading(false));
  }, [active]);

  if (loading) return <Spinner />;
  if (err === 'forbidden') return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><ShieldAlert className="h-6 w-6 text-amber-600" /></div>
      <h2 className="text-lg font-bold text-ink">Managers only</h2>
      <p className="mt-1 text-sm text-slate-500">The team dashboard is available to workspace owners, admins and managers.</p>
    </div>
  );
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>;

  const reps: any[] = data?.reps || [];
  const totals = data?.totals || {};
  if (reps.length === 0) return <EmptyState text="No reps to report on yet for this workspace." />;

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Reps" value={String(reps.length)} />
        <Kpi label="Open leads" value={String(totals.open_primary ?? reps.reduce((s, r) => s + (Number(r.open_primary) || 0), 0))} tone="brand" />
        <Kpi label="Assigned today" value={String(totals.assigned_today ?? reps.reduce((s, r) => s + (Number(r.assigned_today) || 0), 0))} tone="good" />
        <Kpi label="No-touch" value={String(totals.no_touch_count ?? reps.reduce((s, r) => s + (Number(r.no_touch_count) || 0), 0))} tone="warn" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Rep</th>
              <th className="px-3 py-2 text-right">Open</th>
              <th className="px-3 py-2 text-right">Today</th>
              <th className="px-3 py-2 text-right">In range</th>
              <th className="px-3 py-2">Aging</th>
              <th className="px-3 py-2 text-right">No-touch</th>
              <th className="px-3 py-2 text-right">Avg 1st resp</th>
              <th className="px-3 py-2">Disposition mix</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => {
              const noTouch = Number(r.no_touch_count) || 0;
              const ab = r.aging_buckets || {};
              return (
                <tr key={r.user_id} className="border-b border-line/60 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-ink">{r.name || `User ${r.user_id}`}</div>
                    {r.workspace_role && <div className="text-[11px] capitalize text-slate-400">{r.workspace_role}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink">{Number(r.open_primary) || 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{Number(r.assigned_today) || 0}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{Number(r.assigned_in_range) || 0}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {AGING.map((b) => {
                        const v = Number(ab[b.k]) || 0;
                        return (
                          <span key={b.k} title={`${b.label}: ${v}`} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: v ? `${b.color}1a` : '#f1f5f9', color: v ? b.color : '#94a3b8' }}>
                            {b.label} {v}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={cx('inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', noTouch > 0 ? 'bg-red-100 text-red-700' : 'text-slate-500')}>{noTouch}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{fmtHours(r.avg_first_response_hours)}</td>
                  <td className="px-3 py-2.5"><DispositionMix mix={r.disposition_mix} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Settings */

function SettingsTab() {
  const { active } = useWorkspace();
  const [settings, setSettings] = useState<{ pulse_hours: number; no_touch_hours: number; pulse_enabled: boolean }>({ pulse_hours: 24, no_touch_hours: 48, pulse_enabled: true });
  const [canManage, setCanManage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    team.settingsGet(active || undefined)
      .then((d: any) => {
        const s = d?.settings || {};
        setSettings({
          pulse_hours: Number(s.pulse_hours) || 24,
          no_touch_hours: Number(s.no_touch_hours) || 48,
          pulse_enabled: s.pulse_enabled !== false,
        });
        setCanManage(d?.can_manage !== false);
      })
      .catch((e: any) => { if (e?.status === 403) setCanManage(false); else setErr(e?.message || 'Could not load team settings.'); })
      .finally(() => setLoading(false));
  }, [active]);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const r: any = await team.settingsSave({ ...settings, workspace: active || undefined });
      if (r?.settings) setSettings((s) => ({ ...s, ...r.settings }));
      setSavedAt(Date.now());
    } catch (e: any) { setErr(/403|forbidden/i.test(e?.message || '') ? 'You do not have permission to change team settings.' : (e?.message || 'Could not save settings.')); }
    finally { setSaving(false); }
  }

  if (loading) return <Spinner />;
  if (!canManage) return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><ShieldAlert className="h-6 w-6 text-amber-600" /></div>
      <h2 className="text-lg font-bold text-ink">Managers only</h2>
      <p className="mt-1 text-sm text-slate-500">Team settings are managed by workspace owners and admins.</p>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <section className="card p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand"><Activity className="h-5 w-5" /></div>
            <div>
              <h3 className="text-sm font-bold text-ink">Team pulse</h3>
              <p className="text-xs text-slate-500">Periodic activity pings that keep reps on top of their open leads.</p>
            </div>
          </div>
          <Toggle on={settings.pulse_enabled} onChange={() => setSettings((s) => ({ ...s, pulse_enabled: !s.pulse_enabled }))} />
        </div>
      </section>

      <section className={cx('card p-4 transition', !settings.pulse_enabled && 'opacity-60')}>
        <div className="mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-brand" /><h3 className="text-sm font-bold text-ink">Pulse cadence</h3></div>
        <label className="block max-w-xs">
          <span className="label">Send a pulse every</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="number" min={1} value={settings.pulse_hours} onChange={(e) => setSettings((s) => ({ ...s, pulse_hours: Number(e.target.value) }))} className="input w-28" />
            <span className="text-sm text-slate-500">hours</span>
          </div>
        </label>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center gap-2"><AlarmClock className="h-4 w-4 text-amber-600" /><h3 className="text-sm font-bold text-ink">No-touch SLA</h3></div>
        <label className="block max-w-xs">
          <span className="label">Flag a lead as no-touch after</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="number" min={1} value={settings.no_touch_hours} onChange={(e) => setSettings((s) => ({ ...s, no_touch_hours: Number(e.target.value) }))} className="input w-28" />
            <span className="text-sm text-slate-500">hours without activity</span>
          </div>
        </label>
        <p className="mt-2 text-[11px] text-slate-400">Leads breaching this SLA surface as <span className="font-semibold">sla_no_touch</span> alerts in each rep's Notification Center.</p>
      </section>

      <div className="flex items-center justify-end gap-2">
        {savedAt && <span className="pill bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Saved</span>}
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Page */

export default function Team() {
  const { active, activeName, isStaff, ownsActive, roles } = useWorkspace();
  const { isAdmin } = useAuth();
  const canManage = isAdmin || isStaff || ownsActive || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);

  const [tab, setTab] = useState<'feed' | 'dashboard' | 'settings'>('feed');
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => { opm.workspaceMembers().then((d: any) => setMembers(d?.members || [])).catch(() => {}); }, [active]);

  const tabs = useMemo(() => {
    const base: [string, string, any][] = [['feed', 'Team Feed', MessageSquare]];
    if (canManage) { base.push(['dashboard', 'Dashboard', BarChart3]); base.push(['settings', 'Settings', SlidersHorizontal]); }
    return base;
  }, [canManage]);

  return (
    <div>
      <PageHead title="Team" subtitle={activeName ? `Collaborate with your workspace · ${activeName}` : 'Collaborate with your workspace'} />

      <div className="mb-5 inline-flex rounded-lg border border-line bg-white p-0.5">
        {tabs.map(([k, label, Ic]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={cx('inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition', tab === k ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface')}>
            <Ic className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'feed' && <FeedTab members={members} />}
      {tab === 'dashboard' && canManage && <DashboardTab />}
      {tab === 'settings' && canManage && <SettingsTab />}
    </div>
  );
}
