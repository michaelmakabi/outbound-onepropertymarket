import { useEffect, useMemo, useState } from 'react';
import { notif, fmt } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner, EmptyState } from '../components/ui';
import { statusMeta } from '../lib/statuses';
import {
  Bell, ShieldAlert, Mail, MessageSquare, Save, Send, CheckCircle2, AlertCircle,
  Clock, Users, Radio, Phone, Loader2, XCircle, Info, Tag,
  UserPlus, PhoneMissed, Voicemail, PhoneForwarded, CalendarClock, PhoneOff, Ban,
  ThumbsDown, Footprints, Meh, Flame, CalendarCheck, Handshake, BadgeCheck, Trophy, Archive,
} from 'lucide-react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

// Resolve the status icon name (from statuses.ts) to a concrete lucide component.
const STATUS_ICONS: Record<string, any> = {
  UserPlus, PhoneMissed, Voicemail, PhoneForwarded, CalendarClock, PhoneOff, Ban,
  ThumbsDown, Footprints, Meh, Flame, CalendarCheck, Send, Handshake, BadgeCheck,
  XCircle, Trophy, Archive,
};

/* ------------------------------------------------------------------ types */

type Recipients = { primary: boolean; followers: boolean; manager: boolean };
type Settings = {
  enabled: boolean;
  channels: string[];
  positive_dispositions: string[];
  recipients: Recipients;
  mode: 'realtime' | 'digest';
  digest_cron: string;
  notifications_number: string | null;
};
type LogRow = {
  created_at: string | number; disposition?: string; channel?: string; status?: string; error?: string;
  recipient_name?: string; recipient_contact?: string; lead_name?: string; lead_id?: string; message?: string;
};
type TestResult = { status?: string; error?: string; to?: string };
type NumberOpt = { phone_number: string; nickname?: string };

const CHANNELS: { key: 'email' | 'sms'; label: string; icon: any; provider: string }[] = [
  { key: 'email', label: 'Email', icon: Mail, provider: 'Resend key' },
  { key: 'sms', label: 'SMS', icon: MessageSquare, provider: 'Twilio + staff phone numbers' },
];

const CADENCES: { key: 'hourly' | 'daily'; label: string; cron: string }[] = [
  { key: 'hourly', label: 'Hourly', cron: '0 * * * *' },
  { key: 'daily', label: 'Daily (1pm)', cron: '0 13 * * *' },
];

function defaultSettings(): Settings {
  return {
    enabled: false, channels: ['email'], positive_dispositions: [],
    recipients: { primary: true, followers: false, manager: true },
    mode: 'realtime', digest_cron: '0 13 * * *', notifications_number: null,
  };
}

/* ================================================================== page */

export default function Notifications() {
  const { active, activeName, isStaff, ownsActive, roles, loading: wsLoading } = useWorkspace();
  const { user, isAdmin } = useAuth();
  // Same management gate as Lead Routing: platform admin/staff, workspace owner, or owner/admin/manager role.
  const canManageClient = isAdmin || isStaff || ownsActive || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [canManage, setCanManage] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [catalog, setCatalog] = useState<string[]>([]);
  const [flags, setFlags] = useState<Record<string, any>>({});
  const [log, setLog] = useState<LogRow[]>([]);
  const [numbers, setNumbers] = useState<NumberOpt[]>([]);

  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function normalizeSettings(s: any): Settings {
    const d = defaultSettings();
    return {
      enabled: !!s?.enabled,
      channels: Array.isArray(s?.channels) ? s.channels : d.channels,
      positive_dispositions: Array.isArray(s?.positive_dispositions) ? s.positive_dispositions : [],
      recipients: {
        primary: s?.recipients?.primary ?? d.recipients.primary,
        followers: s?.recipients?.followers ?? d.recipients.followers,
        manager: s?.recipients?.manager ?? d.recipients.manager,
      },
      mode: s?.mode === 'digest' ? 'digest' : 'realtime',
      digest_cron: s?.digest_cron || d.digest_cron,
      notifications_number: s?.notifications_number ?? null,
    };
  }

  function load() {
    if (!canManageClient) { setLoading(false); setCanManage(false); return; }
    setLoading(true); setErr(null); setForbidden(false);
    notif.settingsGet(active || undefined)
      .then((d: any) => {
        if (d?.can_manage === false) { setCanManage(false); return; }
        setCanManage(true);
        setSettings(normalizeSettings(d?.settings));
        setCatalog(Array.isArray(d?.catalog) ? d.catalog : []);
        setFlags(d?.flags || {});
        // Companion reads are best-effort — a missing log/numbers shouldn't block the page.
        notif.logList(50, active || undefined).then((r: any) => setLog(r?.log || [])).catch(() => {});
        notif.workspaceNumbers(active || undefined).then((r: any) => {
          setNumbers(r?.numbers || []);
          setSettings((s) => (s.notifications_number == null && r?.current ? { ...s, notifications_number: r.current } : s));
        }).catch(() => {});
      })
      .catch((e: any) => {
        if (e?.status === 403 || /403|manager|owner|admin|forbidden/i.test(e?.message || '')) { setForbidden(true); setCanManage(false); }
        else setErr(e?.message || 'Could not load notification settings.');
      })
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [active, canManageClient]);

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const digestPending = !!(flags.digest_pending ?? flags.digest);

  function toggleChannel(ch: string) {
    set({ channels: settings.channels.includes(ch) ? settings.channels.filter((c) => c !== ch) : [...settings.channels, ch] });
  }
  function toggleDisposition(label: string) {
    const on = settings.positive_dispositions.includes(label);
    set({ positive_dispositions: on ? settings.positive_dispositions.filter((d) => d !== label) : [...settings.positive_dispositions, label] });
  }
  function setRecipient(key: keyof Recipients, v: boolean) { set({ recipients: { ...settings.recipients, [key]: v } }); }

  // Honest per-channel delivery state. Priority: an explicit test result → a backend "pending" flag → the latest log row.
  function channelState(ch: string): { state: 'live' | 'pending' | 'failed' | 'unknown'; detail?: string } {
    const t = testResults[ch];
    if (t?.status) {
      if (t.status === 'sent') return { state: 'live' };
      if (t.status === 'pending') return { state: 'pending', detail: t.error };
      return { state: 'failed', detail: t.error };
    }
    if (flags[`${ch}_pending`] || flags[`${ch}_ready`] === false) return { state: 'pending' };
    const row = log.find((l) => l.channel === ch && l.status);
    if (row?.status === 'pending') return { state: 'pending', detail: row.error };
    if (row && (row.status === 'failed' || row.status === 'error')) return { state: 'failed', detail: row.error };
    if (row?.status === 'sent') return { state: 'live' };
    return { state: 'unknown' };
  }

  async function runTest(ch: 'email' | 'sms') {
    setTesting((t) => ({ ...t, [ch]: true }));
    try {
      const r: any = await notif.test({ channel: ch, to_user_id: user?.id, to_email: ch === 'email' ? user?.email : undefined, workspace: active || undefined });
      setTestResults((tr) => ({ ...tr, [ch]: { status: r?.status, error: r?.error, to: r?.to } }));
      // A test writes a log row server-side — refresh the recent list.
      notif.logList(50, active || undefined).then((res: any) => setLog(res?.log || [])).catch(() => {});
    } catch (e: any) {
      setTestResults((tr) => ({ ...tr, [ch]: { status: 'failed', error: e?.message || 'Test failed' } }));
    } finally { setTesting((t) => ({ ...t, [ch]: false })); }
  }

  async function save() {
    setSaving(true); setErr(null);
    try {
      const payload: Settings = {
        ...settings,
        // Keep digest_cron coherent with mode; realtime doesn't need a cron but we preserve the last choice.
        digest_cron: settings.digest_cron || '0 13 * * *',
      };
      const r: any = await notif.settingsSave(payload, active || undefined);
      if (r?.settings) setSettings(normalizeSettings(r.settings));
      setSavedAt(Date.now());
    } catch (e: any) {
      setErr(/403|forbidden/i.test(e?.message || '') ? 'You do not have permission to save notification settings.' : (e?.message || 'Could not save settings.'));
    } finally { setSaving(false); }
  }

  if (wsLoading || loading) return <div><PageHead title="Notifications" subtitle={activeName} /><Spinner /></div>;

  if (!canManage || forbidden) {
    return (
      <div>
        <PageHead title="Notifications" subtitle={activeName} />
        <div className="card mx-auto mt-6 max-w-lg p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><ShieldAlert className="h-6 w-6 text-amber-600" /></div>
          <h2 className="text-lg font-bold text-ink">Managers only</h2>
          <p className="mt-1 text-sm text-slate-500">Notification settings are available to workspace owners, admins and managers. Ask an admin for access if you need to manage how your team is alerted about lead activity.</p>
        </div>
      </div>
    );
  }

  const currentCadence = CADENCES.find((c) => c.cron === settings.digest_cron)?.key || 'daily';

  return (
    <div>
      <PageHead
        title="Notifications"
        subtitle={`Alert your team when leads reach the dispositions that matter${activeName ? ` · ${activeName}` : ''}`}
        right={
          <div className="flex items-center gap-2">
            {savedAt && <span className="pill bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Saved</span>}
            <button onClick={save} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        }
      />

      {err && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" /> {err}</div>}

      <div className="space-y-5">
        {/* 1. Master toggle */}
        <section className="card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand"><Bell className="h-5 w-5" /></div>
              <div>
                <h3 className="text-sm font-bold text-ink">Notifications enabled</h3>
                <p className="text-xs text-slate-500">Master switch. When off, no notifications are sent for this workspace regardless of the settings below.</p>
              </div>
            </div>
            <Toggle on={settings.enabled} onChange={() => set({ enabled: !settings.enabled })} />
          </div>
        </section>

        <div className={cx('space-y-5 transition', !settings.enabled && 'opacity-60')}>
          {/* 2. Channels */}
          <section className="card p-4">
            <SectionHead icon={Radio} title="Channels" hint="How your team gets notified" />
            <div className="grid gap-3 sm:grid-cols-2">
              {CHANNELS.map((c) => {
                const on = settings.channels.includes(c.key);
                const st = channelState(c.key);
                return (
                  <div key={c.key} className={cx('rounded-lg border p-3', on ? 'border-brand/40 bg-brand-light/40' : 'border-line')}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <c.icon className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-bold text-ink">{c.label}</span>
                      </div>
                      <Toggle on={on} onChange={() => toggleChannel(c.key)} />
                    </div>
                    <div className="mt-2"><ChannelPill state={st.state} provider={c.provider} detail={st.detail} /></div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Which dispositions notify */}
          <section className="card p-4">
            <SectionHead icon={Tag} title="Which dispositions notify" hint="Pick the outcomes worth an alert" />
            {catalog.length === 0 ? (
              <div className="text-xs text-slate-400">No disposition catalog returned.</div>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold">{settings.positive_dispositions.length}</span> selected
                  <button onClick={() => set({ positive_dispositions: catalog.slice() })} className="ml-2 text-brand hover:underline">Select all</button>
                  <button onClick={() => set({ positive_dispositions: [] })} className="text-slate-400 hover:underline">Clear</button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {catalog.map((label) => {
                    const meta = statusMeta(label);
                    const on = settings.positive_dispositions.includes(label);
                    const Ic = (meta && STATUS_ICONS[meta.icon]) || Tag;
                    const color = meta?.color || '#94a3b8';
                    return (
                      <button key={label} type="button" onClick={() => toggleDisposition(label)}
                        className={cx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition',
                          on ? 'border-brand bg-brand-light' : 'border-line hover:border-brand/40')}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ backgroundColor: `${color}1a`, color }}>
                          <Ic className="h-3.5 w-3.5" />
                        </span>
                        <span className={cx('min-w-0 flex-1 truncate', on ? 'font-semibold text-ink' : 'text-slate-600')}>{label}</span>
                        {on && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* 4. Recipients */}
          <section className="card p-4">
            <SectionHead icon={Users} title="Recipients" hint="Who receives the alert" />
            <div className="grid gap-2 sm:grid-cols-3">
              <CheckRow label="Primary owner" desc="The rep who owns the lead" checked={settings.recipients.primary} onChange={(v) => setRecipient('primary', v)} />
              <CheckRow label="Followers" desc="Anyone following the lead" checked={settings.recipients.followers} onChange={(v) => setRecipient('followers', v)} />
              <CheckRow label="Manager / Owner" desc="Workspace manager & owner" checked={settings.recipients.manager} onChange={(v) => setRecipient('manager', v)} />
            </div>
          </section>

          {/* 5. Delivery mode */}
          <section className="card p-4">
            <SectionHead icon={Clock} title="Delivery mode" hint="Send instantly or batch into a digest" />
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeCard title="Realtime" desc="Send each notification the moment it happens" active={settings.mode === 'realtime'} onClick={() => set({ mode: 'realtime' })} />
              <ModeCard title="Digest" desc="Batch notifications and send on a schedule" active={settings.mode === 'digest'} onClick={() => set({ mode: 'digest' })} />
            </div>
            {settings.mode === 'digest' && (
              <div className="mt-3 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label">Cadence</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
                    {CADENCES.map((c) => (
                      <button key={c.key} type="button" onClick={() => set({ digest_cron: c.cron })}
                        className={cx('px-3 py-1.5 font-semibold', currentCadence === c.key ? 'bg-brand text-white' : 'bg-white text-slate-600')}>{c.label}</button>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-400">cron: {settings.digest_cron}</span>
                </div>
                {digestPending && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
                    <Info className="h-3.5 w-3.5 shrink-0" /> Digest flushing is coming soon — your cadence is saved, but batched sends aren't delivering yet.
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 6. Dedicated notifications number */}
          <section className="card p-4">
            <SectionHead icon={Phone} title="Dedicated notifications number" hint="The SMS sender number for this workspace" />
            {numbers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-surface px-3 py-2 text-xs text-slate-500">
                No workspace SMS numbers available yet. Once staff phone numbers are provisioned (Twilio), pick the sender here.
              </div>
            ) : (
              <label className="block max-w-sm">
                <span className="label">Send SMS from</span>
                <select value={settings.notifications_number ?? ''} onChange={(e) => set({ notifications_number: e.target.value || null })} className="input mt-1">
                  <option value="">Workspace default</option>
                  {numbers.map((n) => (
                    <option key={n.phone_number} value={n.phone_number}>{n.nickname ? `${n.nickname} — ${n.phone_number}` : n.phone_number}</option>
                  ))}
                </select>
              </label>
            )}
          </section>

          {/* 7. Test */}
          <section className="card p-4">
            <SectionHead icon={Send} title="Send a test" hint={`Fires a real notification to you${user?.name ? ` (${user.name})` : ''}`} />
            <div className="grid gap-3 sm:grid-cols-2">
              {CHANNELS.map((c) => {
                const r = testResults[c.key];
                const busy = !!testing[c.key];
                return (
                  <div key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                    <div className="flex items-center gap-2">
                      <c.icon className="h-4 w-4 text-slate-500" />
                      <span className="text-sm font-semibold text-ink">{c.label}</span>
                      {r && <TestBadge status={r.status} error={r.error} />}
                    </div>
                    <button onClick={() => runTest(c.key)} disabled={busy} className="btn-ghost !py-1.5 text-sm">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {busy ? 'Sending…' : 'Send test'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 8. Recent notifications */}
          <section className="card p-4">
            <SectionHead icon={Bell} title="Recent notifications" hint="Newest first" />
            {log.length === 0 ? (
              <EmptyState text="No notifications sent yet. Enable a channel, pick some dispositions, and they'll show up here." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Time</th><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Disposition</th>
                      <th className="px-3 py-2">Channel</th><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((l, i) => {
                      const meta = statusMeta(l.disposition || '');
                      return (
                        <tr key={i} className="border-b border-line/60">
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{fmtTime(l.created_at)}</td>
                          <td className="px-3 py-2 font-semibold text-ink">{l.lead_name || l.lead_id || '—'}</td>
                          <td className="px-3 py-2">
                            {l.disposition ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta?.color || '#94a3b8' }} />
                                <span className="text-slate-600">{l.disposition}</span>
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{l.channel === 'sms' ? 'SMS' : l.channel === 'email' ? 'Email' : (l.channel || '—')}</td>
                          <td className="px-3 py-2">
                            <div className="text-slate-700">{l.recipient_name || '—'}</div>
                            {l.recipient_contact && <div className="text-[11px] text-slate-400">{l.recipient_contact}</div>}
                          </td>
                          <td className="px-3 py-2"><LogStatus status={l.status} error={l.error} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ small UI bits */

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className={cx('relative h-5 w-9 shrink-0 rounded-full transition', on ? 'bg-brand' : 'bg-slate-300')}>
      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

function SectionHead({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-brand" />
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function ChannelPill({ state, provider, detail }: { state: 'live' | 'pending' | 'failed' | 'unknown'; provider: string; detail?: string }) {
  if (state === 'live') return <span className="pill bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Delivering</span>;
  if (state === 'pending') return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700" title={detail || ''}>
      <AlertCircle className="mr-1 h-3.5 w-3.5" /> Not yet delivering — needs provider setup ({provider})
    </span>
  );
  if (state === 'failed') return <span className="pill bg-red-100 text-red-700" title={detail || ''}><XCircle className="mr-1 h-3.5 w-3.5" /> Last attempt failed</span>;
  return <span className="pill bg-slate-100 text-slate-500"><Info className="mr-1 h-3.5 w-3.5" /> Delivery unverified — send a test</span>;
}

function TestBadge({ status, error }: { status?: string; error?: string }) {
  if (status === 'sent') return <span className="pill bg-emerald-100 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Sent</span>;
  if (status === 'pending') return <span className="pill bg-amber-100 text-amber-700" title={error || ''}><Clock className="mr-1 h-3 w-3" /> Pending — needs provider</span>;
  return <span className="pill bg-red-100 text-red-700" title={error || ''}><XCircle className="mr-1 h-3 w-3" /> {error ? 'Failed' : 'Failed'}</span>;
}

function LogStatus({ status, error }: { status?: string; error?: string }) {
  if (status === 'sent' || status === 'delivered') return <span className="pill bg-emerald-100 text-emerald-700">Sent</span>;
  if (status === 'pending') return <span className="pill bg-amber-100 text-amber-700" title={error || ''}>Pending</span>;
  if (status === 'failed' || status === 'error') return <span className="pill bg-red-100 text-red-700" title={error || ''}>Failed</span>;
  return <span className="pill bg-slate-100 text-slate-500">{status || '—'}</span>;
}

function CheckRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={cx('flex items-start gap-2 rounded-lg border p-3 text-left transition', checked ? 'border-brand bg-brand-light' : 'border-line hover:border-brand/40')}>
      <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-brand bg-brand text-white' : 'border-slate-300')}>
        {checked && <CheckCircle2 className="h-3 w-3" />}
      </span>
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-[11px] text-slate-500">{desc}</span>
      </span>
    </button>
  );
}

function ModeCard({ title, desc, active, onClick }: { title: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('flex items-start gap-2 rounded-lg border p-3 text-left transition', active ? 'border-brand bg-brand-light' : 'border-line hover:border-brand/40')}>
      <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-brand' : 'border-slate-300')}>
        {active && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      <span>
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-[11px] text-slate-500">{desc}</span>
      </span>
    </button>
  );
}

function fmtTime(v: string | number | undefined): string {
  if (v == null) return '—';
  const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  if (!isFinite(ms)) return String(v);
  return fmt.dateTime(ms);
}
