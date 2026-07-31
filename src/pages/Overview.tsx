import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { PageHead, Kpi, Spinner, RangePicker, rangeToMs, StatusPill } from '../components/ui';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

const CAT_COLORS: Record<string, string> = { LLM: '#1f6feb', TTS: '#7c3aed', Telephony: '#0891b2', 'Voice Engine': '#059669', Other: '#94a3b8' };

export default function Overview() {
  const [range, setRange] = useState('30');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToMs(range);
    api.overview({ start, end }).then(setData).finally(() => setLoading(false));
  }, [range]);

  if (loading) return <Spinner />;
  const k = data.kpis;

  return (
    <div>
      <PageHead title="Overview" subtitle="Outbound performance across all your workspaces" right={<RangePicker value={range} onChange={setRange} />} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Total Calls" value={fmt.int(k.totalCalls)} sub={`${fmt.int(k.connectedCalls)} connected`} />
        <Kpi label="Total Spend" value={fmt.money(k.totalCostDollars)} sub={`${fmt.money(k.costPerCallDollars)}/call`} />
        <Kpi label="Bookings" value={fmt.int(k.totalBookings)} sub={`${fmt.pct(k.bookingRate)} booking rate`} tone="good" />
        <Kpi label="Cost / Booking" value={fmt.money(k.costPerBookingDollars)} sub={`${fmt.money(k.costPerMinuteDollars)}/min`} tone="warn" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 label">Calls & Bookings over time</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.timeSeries}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1f6feb" stopOpacity={0.35} /><stop offset="100%" stopColor="#1f6feb" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={30} />
              <Tooltip />
              <Area type="monotone" dataKey="calls" stroke="#1f6feb" strokeWidth={2} fill="url(#g1)" />
              <Area type="monotone" dataKey="bookings" stroke="#059669" strokeWidth={2} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="mb-4 label">Spend by category</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.costByCategory} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} width={90} />
              <Tooltip formatter={(v: any) => fmt.money(v)} />
              <Bar dataKey="costDollars" radius={[0, 6, 6, 0]}>
                {data.costByCategory.map((c: any, i: number) => <Cell key={i} fill={CAT_COLORS[c.category] || '#94a3b8'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 label">Top dispositions</div>
          <div className="space-y-2">
            {data.topDispositions.map((d: any) => (
              <div key={d.disposition} className="flex items-center gap-3">
                <div className="w-40 truncate text-sm font-medium text-ink">{fmt.title(d.disposition)}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${d.percentage}%` }} />
                </div>
                <div className="w-16 text-right text-sm tabular-nums text-slate-500">{fmt.int(d.count)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3 label">Workspaces</div>
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-2 font-semibold">Workspace</th><th className="px-3 py-2 font-semibold">Calls</th><th className="px-3 py-2 font-semibold">Spend</th><th className="px-3 py-2 font-semibold">Bookings</th></tr>
            </thead>
            <tbody>
              {data.perWorkspace.map((w: any) => (
                <tr key={w.slug} className="border-t border-line hover:bg-surface">
                  <td className="px-5 py-2.5"><Link to={`/workspaces/${w.slug}`} className="font-semibold text-brand hover:underline">{w.display_name}</Link> <StatusPill status={w.status} /></td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt.int(w.kpis.totalCalls)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt.money(w.kpis.totalCostDollars)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt.int(w.kpis.totalBookings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
