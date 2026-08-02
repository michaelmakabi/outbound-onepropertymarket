import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, StatusDot } from '../components/dash';
import { usd, num, ratePct, secs, humanizeDisposition, humanizeProduct, dispositionColor, CAT_COLORS, TOOLTIP_STYLE } from '../lib/format';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ArrowLeft, PhoneCall, DollarSign, CalendarCheck, TrendingUp, Coins, Timer, Clock, Gauge } from 'lucide-react';

function Bars({ rows, labelKey, valueKey, fmtVal, color }: any) {
  const max = Math.max(1, ...rows.map((r: any) => r[valueKey]));
  if (!rows.length) return <EmptyState text="No data." />;
  return (
    <div className="space-y-2">
      {rows.slice(0, 10).map((r: any, i: number) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-44 truncate text-sm text-ink">{humanizeDisposition(String(r[labelKey]))}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full" style={{ width: `${(r[valueKey] / max) * 100}%`, background: color ? color(r[labelKey]) : '#1f6feb' }} />
          </div>
          <div className="w-20 text-right font-mono text-sm text-slate-500">{fmtVal(r[valueKey])}</div>
        </div>
      ))}
    </div>
  );
}

function ModelTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <EmptyState text="No data." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-3 py-2 font-semibold">Model</th><th className="px-3 py-2 text-right font-semibold">Calls</th><th className="px-3 py-2 text-right font-semibold">Spend</th><th className="px-3 py-2 text-right font-semibold">$/call</th><th className="px-3 py-2 text-right font-semibold">Success</th></tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.model} className="border-t border-line">
              <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs">{humanizeProduct(m.model)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(m.calls)}</td>
              <td className="px-3 py-2 text-right font-mono">{usd(m.costDollars)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-500">{usd(m.costPerCallDollars, { precise: true })}</td>
              <td className="px-3 py-2 text-right font-mono">{ratePct(m.successRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WorkspaceDetail() {
  const { slug } = useParams();
  const { startMs, endMs } = useFilters();
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.workspace({ slug, start: startMs, end: endMs }).then(setD).finally(() => setLoading(false));
  }, [slug, startMs, endMs]);

  const k = d?.kpis;

  return (
    <div>
      <Link to="/workspaces" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Workspaces</Link>
      <PageHeader
        title={d?.workspace?.display_name || slug || ''}
        description={d ? `${d.agentCount} agents · outbound analytics` : 'Loading…'}
        actions={d?.workspace && <StatusDot status={d.workspace.status} />}
      />

      {loading || !k ? <LoadingBlock /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Calls" value={num(k.totalCalls)} sub={`${num(k.connectedCalls)} connected`} icon={PhoneCall} accent="blue" />
            <KpiCard label="Spend" value={usd(k.totalCostDollars)} sub={`${usd(k.costPerCallDollars, { precise: true })}/call`} icon={DollarSign} accent="green" />
            <KpiCard label="Bookings" value={num(k.totalBookings)} sub={`${ratePct(k.bookingRate)} rate`} icon={CalendarCheck} accent="amber" />
            <KpiCard label="Success Rate" value={ratePct(k.successRate)} icon={TrendingUp} />
            <KpiCard label="Cost / Min" value={usd(k.costPerMinuteDollars, { precise: true })} icon={Timer} />
            <KpiCard label="Cost / Booking" value={k.totalBookings > 0 ? usd(k.costPerBookingDollars) : '—'} icon={Coins} accent="green" />
            <KpiCard label="Avg Duration" value={secs(k.avgCallDurationSeconds)} icon={Gauge} />
            <KpiCard label="Talk Time" value={`${num(k.totalDurationMinutes)}m`} icon={Clock} />
          </div>

          <SectionCard title="Spend & Volume Trend" description="Daily cost across this workspace">
            {d.timeSeries.length === 0 ? <EmptyState text="No time-series data." /> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={d.timeSeries} margin={{ left: -10, right: 8, top: 8 }}>
                  <defs><linearGradient id="wcost" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1f6feb" stopOpacity={0.28} /><stop offset="95%" stopColor="#1f6feb" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(x) => String(x).slice(5)} stroke="#e6eaf0" />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="#e6eaf0" tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n) => (n === 'costDollars' ? [usd(v), 'Cost'] : [num(v), 'Calls'])} />
                  <Area type="monotone" dataKey="costDollars" stroke="#1f6feb" strokeWidth={2.5} fill="url(#wcost)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Disposition Mix" description="Outcome distribution">
              {d.dispositions.length === 0 ? <EmptyState text="No dispositions." /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={d.dispositions.slice(0, 8)} dataKey="count" nameKey="disposition" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                      {d.dispositions.slice(0, 8).map((x: any) => <Cell key={x.disposition} fill={dispositionColor(x.disposition)} />)}
                    </Pie>
                    <Legend formatter={(v) => <span style={{ fontSize: 11, color: '#64748b' }}>{humanizeDisposition(String(v))}</span>} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, _n, p: any) => [`${num(v)} calls`, humanizeDisposition(p.payload.disposition)]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
            <SectionCard title="Sentiment" description="Caller sentiment breakdown"><Bars rows={d.sentiment} labelKey="sentiment" valueKey="count" fmtVal={num} /></SectionCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Agents by Volume" description="Top agents in this workspace"><Bars rows={d.agents} labelKey="agentName" valueKey="calls" fmtVal={num} /></SectionCard>
            <SectionCard title="Spend by Product" description="Cost by underlying product">
              <Bars rows={d.costByProduct} labelKey="product" valueKey="costDollars" fmtVal={usd} color={(name: string) => CAT_COLORS[d.costByProduct.find((p: any) => p.product === name)?.category] || '#1f6feb'} />
            </SectionCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="LLM Models" description="Language model performance"><ModelTable rows={d.llm} /></SectionCard>
            <SectionCard title="TTS Voices" description="Voice engine performance"><ModelTable rows={d.tts} /></SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
