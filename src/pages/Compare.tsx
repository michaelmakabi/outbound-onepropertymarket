import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import { PageHeader, SectionCard, LoadingBlock, EmptyState, StatusDot } from '../components/dash';
import { usd, num, ratePct, TOOLTIP_STYLE } from '../lib/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Compare() {
  const { startMs, endMs } = useFilters();
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.compare({ start: startMs, end: endMs }).then(setD).finally(() => setLoading(false));
  }, [startMs, endMs]);

  const chartData = useMemo(() => (d?.workspaces ?? []).map((w: any) => ({
    name: w.display_name.length > 14 ? w.display_name.slice(0, 13) + '…' : w.display_name,
    slug: w.slug, calls: w.kpis.totalCalls, spend: Number(w.kpis.totalCostDollars.toFixed(2)), bookings: w.kpis.totalBookings,
  })), [d]);

  return (
    <div>
      <PageHeader title="Compare Workspaces" description="Side-by-side outbound performance across all workspaces" />

      {loading || !d ? <LoadingBlock /> : d.workspaces.length === 0 ? <EmptyState text="No workspaces to compare." /> : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Calls by Workspace" description="Total outbound calls">
              <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 30)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={110} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [num(v), 'Calls']} />
                  <Bar dataKey="calls" fill="#1f6feb" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
            <SectionCard title="Spend by Workspace" description="Total cost">
              <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 30)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={110} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [usd(v), 'Spend']} />
                  <Bar dataKey="spend" fill="#059669" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          <SectionCard title="Full Comparison" description="Click a row to open a workspace">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Workspace</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Calls</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Spend</th>
                    <th className="px-3 py-2.5 text-right font-semibold">$/call</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Bookings</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Book rate</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Success</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.workspaces.map((w: any) => (
                    <tr key={w.slug} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/workspaces/${w.slug}`)}>
                      <td className="px-3 py-2.5 font-semibold text-ink">{w.display_name}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{num(w.kpis.totalCalls)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{usd(w.kpis.totalCostDollars)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">{usd(w.kpis.costPerCallDollars, { precise: true })}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{num(w.kpis.totalBookings)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{ratePct(w.kpis.bookingRate)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{ratePct(w.kpis.successRate)}</td>
                      <td className="px-3 py-2.5"><StatusDot status={w.status} /></td>
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
