import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { PageHead, Kpi, Spinner, RangePicker, rangeToMs, StatusPill } from '../components/ui';
import { ArrowLeft } from 'lucide-react';

function Bars({ rows, labelKey, valueKey, fmtVal }: any) {
  const max = Math.max(1, ...rows.map((r: any) => r[valueKey]));
  return (
    <div className="space-y-2">
      {rows.slice(0, 10).map((r: any, i: number) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-44 truncate text-sm text-ink">{fmt.title(String(r[labelKey]))}</div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-brand" style={{ width: `${(r[valueKey] / max) * 100}%` }} /></div>
          <div className="w-20 text-right text-sm tabular-nums text-slate-500">{fmtVal(r[valueKey])}</div>
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceDetail() {
  const { slug } = useParams();
  const [range, setRange] = useState('30');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToMs(range);
    api.workspace({ slug, start, end }).then(setD).finally(() => setLoading(false));
  }, [slug, range]);

  if (loading) return <Spinner />;
  const k = d.kpis;

  return (
    <div>
      <Link to="/workspaces" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Workspaces</Link>
      <PageHead
        title={d.workspace?.display_name || slug || ''}
        subtitle={`${d.agentCount} agents · outbound analytics`}
        right={<div className="flex items-center gap-3"><StatusPill status={d.workspace?.status || 'active'} /><RangePicker value={range} onChange={setRange} /></div>}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Calls" value={fmt.int(k.totalCalls)} sub={`${fmt.int(k.connectedCalls)} connected`} />
        <Kpi label="Spend" value={fmt.money(k.totalCostDollars)} sub={`${fmt.money(k.costPerCallDollars)}/call`} />
        <Kpi label="Bookings" value={fmt.int(k.totalBookings)} sub={fmt.pct(k.bookingRate)} tone="good" />
        <Kpi label="Avg Duration" value={fmt.dur(k.avgCallDurationSeconds)} sub={`${fmt.money(k.costPerMinuteDollars)}/min`} tone="warn" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5"><div className="mb-3 label">Dispositions</div><Bars rows={d.dispositions} labelKey="disposition" valueKey="count" fmtVal={fmt.int} /></div>
        <div className="card p-5"><div className="mb-3 label">Sentiment</div><Bars rows={d.sentiment} labelKey="sentiment" valueKey="count" fmtVal={fmt.int} /></div>
        <div className="card p-5"><div className="mb-3 label">Agents by volume</div><Bars rows={d.agents} labelKey="agentName" valueKey="calls" fmtVal={fmt.int} /></div>
        <div className="card p-5"><div className="mb-3 label">Spend by product</div><Bars rows={d.costByProduct} labelKey="product" valueKey="costDollars" fmtVal={fmt.money} /></div>
      </div>
    </div>
  );
}
