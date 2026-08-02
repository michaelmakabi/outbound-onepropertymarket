import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import {
  PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, RefreshButton, StatusDot,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable, OutcomeTiles,
} from '../components/dash';
import { usd, num, ratePct, secs, humanizeDisposition, dispositionColor, CAT_COLORS, TOOLTIP_STYLE } from '../lib/format';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { PhoneCall, DollarSign, CalendarCheck, Clock, TrendingUp, Coins, Timer, Search } from 'lucide-react';

type WsRow = {
  slug: string; display_name: string; status: string;
  calls: number; spend: number; costPerCall: number; bookings: number; costPerBooking: number; successRate: number;
};

const WS_COLUMNS: ColumnDef[] = [
  { key: 'display_name', label: 'Workspace', required: true, sortKey: 'display_name' },
  { key: 'calls', label: 'Calls', sortKey: 'calls', align: 'right' },
  { key: 'spend', label: 'Spend', sortKey: 'spend', align: 'right' },
  { key: 'costPerCall', label: 'Cost/Call', sortKey: 'costPerCall', align: 'right' },
  { key: 'bookings', label: 'Bookings', sortKey: 'bookings', align: 'right' },
  { key: 'costPerBooking', label: 'Cost/Booking', sortKey: 'costPerBooking', align: 'right' },
  { key: 'successRate', label: 'Success', sortKey: 'successRate', align: 'right' },
  { key: 'status', label: 'Status' },
];

function WorkspaceTable({ raw }: { raw: any[] }) {
  const nav = useNavigate();
  const rows: WsRow[] = useMemo(() => raw.map((w) => ({
    slug: w.slug, display_name: w.display_name, status: w.status,
    calls: w.kpis.totalCalls, spend: w.kpis.totalCostDollars, costPerCall: w.kpis.costPerCallDollars,
    bookings: w.kpis.totalBookings, costPerBooking: w.kpis.costPerBookingDollars, successRate: w.kpis.successRate,
  })), [raw]);
  const getValue = useCallback((r: WsRow, key: string) => (r as any)[key], []);
  const t = useClientTable<WsRow>({ pageKey: 'overview-workspaces', columns: WS_COLUMNS, rows, getValue, initialSort: { by: 'spend', dir: 'desc' } });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={t.search} onChange={(e) => t.setSearch(e.target.value)} placeholder="Search workspaces…" className="input w-[240px] pl-8" />
        </div>
        <ColumnToggleMenu columns={WS_COLUMNS} isVisible={t.isVisible} onToggle={t.toggle} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>{WS_COLUMNS.filter((c) => t.isVisible(c.key)).map((c) => (
              <SortableHead key={c.key} col={c} sort={t.sort} onSort={t.setSort}>{c.label}</SortableHead>
            ))}</tr>
          </thead>
          <tbody>
            {t.rows.map((w) => (
              <tr key={w.slug} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/workspaces/${w.slug}`)}>
                {t.isVisible('display_name') && <td className="px-3 py-2.5 font-semibold text-ink">{w.display_name}</td>}
                {t.isVisible('calls') && <td className="px-3 py-2.5 text-right font-mono">{num(w.calls)}</td>}
                {t.isVisible('spend') && <td className="px-3 py-2.5 text-right font-mono">{usd(w.spend)}</td>}
                {t.isVisible('costPerCall') && <td className="px-3 py-2.5 text-right font-mono text-slate-500">{w.calls > 0 ? usd(w.costPerCall, { precise: true }) : '—'}</td>}
                {t.isVisible('bookings') && <td className="px-3 py-2.5 text-right font-mono">{num(w.bookings)}</td>}
                {t.isVisible('costPerBooking') && <td className="px-3 py-2.5 text-right font-mono text-slate-500">{w.bookings > 0 ? usd(w.costPerBooking) : '—'}</td>}
                {t.isVisible('successRate') && <td className="px-3 py-2.5 text-right font-mono">{ratePct(w.successRate)}</td>}
                {t.isVisible('status') && <td className="px-3 py-2.5"><StatusDot status={w.status} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Overview() {
  const { startMs, endMs } = useFilters();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setLoading(true);
    return api.overview({ start: startMs, end: endMs }).then(setData).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [startMs, endMs]);

  const g = data?.kpis;

  return (
    <div>
      <PageHeader title="Global Overview" description="Aggregate outbound performance across all your workspaces"
        actions={<RefreshButton loading={refreshing} onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} />

      {loading ? <LoadingBlock /> : !g ? <EmptyState text="No data available." /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Spend" value={usd(g.totalCostDollars)} sub={`${num(g.totalDurationMinutes)} min talk time`} icon={DollarSign} accent="green" />
            <KpiCard label="Total Calls" value={num(g.totalCalls)} sub={`${num(g.connectedCalls)} connected`} icon={PhoneCall} accent="blue" />
            <KpiCard label="Bookings" value={num(g.totalBookings)} sub={`${ratePct(g.bookingRate)} booking rate`} icon={CalendarCheck} accent="amber" />
            <KpiCard label="Success Rate" value={ratePct(g.successRate)} sub={`Avg ${secs(g.avgCallDurationSeconds)} / call`} icon={TrendingUp} />
            <KpiCard label="Cost / Call" value={usd(g.costPerCallDollars, { precise: true })} icon={Coins} />
            <KpiCard label="Cost / Minute" value={usd(g.costPerMinuteDollars, { precise: true })} icon={Timer} />
            <KpiCard label="Cost / Booking" value={g.totalBookings > 0 ? usd(g.costPerBookingDollars) : '—'} icon={CalendarCheck} accent="green" />
            <KpiCard label="Talk Time" value={`${num(g.totalDurationMinutes)}m`} sub="across all calls" icon={Clock} />
          </div>

          {data.outcomes && data.outcomes.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-ink">Business Outcomes</h3>
                <span className="text-xs text-slate-500">GHL disposition taxonomy · {num(g.totalCalls)} calls</span>
              </div>
              <OutcomeTiles outcomes={data.outcomes} total={g.totalCalls} />
            </div>
          )}

          <SectionCard title="Spend & Volume Trend" description="Daily total cost and call volume">
            {data.timeSeries.length === 0 ? <EmptyState text="No time-series data in this range." /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.timeSeries} margin={{ left: -10, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="cost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1f6feb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#1f6feb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => String(d).slice(5)} stroke="#e6eaf0" />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e6eaf0" tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name) => (name === 'costDollars' ? [usd(value), 'Cost'] : [num(value), 'Calls'])} />
                  <Area type="monotone" dataKey="costDollars" stroke="#1f6feb" strokeWidth={2.5} fill="url(#cost)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Disposition Mix" description="Outcome distribution across all calls">
              {data.topDispositions.length === 0 ? <EmptyState text="No dispositions." /> : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={data.topDispositions} dataKey="count" nameKey="disposition" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} animationDuration={500}>
                      {data.topDispositions.map((d: any) => <Cell key={d.disposition} fill={dispositionColor(d.disposition)} />)}
                    </Pie>
                    <Legend formatter={(v) => <span style={{ fontSize: 11, color: '#64748b' }}>{humanizeDisposition(String(v))}</span>} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, _n, p: any) => [`${num(value)} calls · ${usd(p.payload.costDollars)}`, humanizeDisposition(p.payload.disposition)]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Cost by Product Category" description="LLM · TTS · Telephony · Voice Engine">
              {data.costByCategory.length === 0 ? <EmptyState text="No cost data." /> : (
                <div className="flex flex-col gap-3 pt-2">
                  {data.costByCategory.map((c: any) => (
                    <div key={c.category}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-ink">{c.category}</span>
                        <span className="font-mono text-slate-500">{usd(c.costDollars)} · {c.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, background: CAT_COLORS[c.category] || '#1f6feb' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Workspaces" description="Search, sort any column, toggle fields · click a row to drill in">
            <WorkspaceTable raw={data.perWorkspace} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
