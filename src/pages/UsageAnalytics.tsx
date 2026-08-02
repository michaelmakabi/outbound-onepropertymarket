import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num, dateTime, TOOLTIP_STYLE } from '../lib/format';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, UserCheck, Activity } from 'lucide-react';

export default function UsageAnalytics() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.usage().then(setD).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <PageHeader title="Usage Analytics" description="Who is signing in, how often, and when" showDate={false} />
      {loading || !d ? <LoadingBlock /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Total Users" value={num(d.totalUsers)} icon={Users} accent="blue" />
            <KpiCard label="Active (7 days)" value={num(d.activeUsers)} icon={UserCheck} accent="green" />
            <KpiCard label="Total Sessions" value={num(d.totalSessions)} icon={Activity} accent="amber" />
          </div>

          <SectionCard title="Logins Over Time" description="Sessions created per day">
            {d.loginSeries.length === 0 ? <EmptyState text="No login history yet." /> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={d.loginSeries} margin={{ left: -10, right: 8, top: 8 }}>
                  <defs><linearGradient id="logins" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1f6feb" stopOpacity={0.28} /><stop offset="95%" stopColor="#1f6feb" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(x) => String(x).slice(5)} stroke="#e6eaf0" />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e6eaf0" allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [num(v), 'Logins']} />
                  <Area type="monotone" dataKey="logins" stroke="#1f6feb" strokeWidth={2.5} fill="url(#logins)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="Per-User Activity" description="Sessions and last seen, by user">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">Username</th><th className="px-3 py-2.5 font-semibold">Role</th><th className="px-3 py-2.5 text-right font-semibold">Sessions</th><th className="px-3 py-2.5 font-semibold">Last seen</th></tr>
                </thead>
                <tbody>
                  {d.perUser.map((u: any) => (
                    <tr key={u.id} className="border-t border-line hover:bg-surface">
                      <td className="px-3 py-2.5 font-semibold text-ink">{u.name}{u.disabled && <span className="pill ml-2 bg-red-100 text-red-700">Disabled</span>}</td>
                      <td className="px-3 py-2.5 text-slate-500">{u.username}</td>
                      <td className="px-3 py-2.5"><span className="pill bg-brand-light text-brand">{String(u.role).replace('_', ' ')}</span></td>
                      <td className="px-3 py-2.5 text-right font-mono">{num(u.sessions)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{u.lastSeen ? dateTime(u.lastSeen) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
