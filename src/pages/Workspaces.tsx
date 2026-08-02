import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import { PageHeader, LoadingBlock, EmptyState, StatusDot, RefreshButton } from '../components/dash';
import { usd, num, ratePct } from '../lib/format';
import { ArrowUpRight } from 'lucide-react';

export default function Workspaces() {
  const { startMs, endMs } = useFilters();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setLoading(true);
    return api.overview({ start: startMs, end: endMs }).then((d) => setRows(d.perWorkspace)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [startMs, endMs]);

  return (
    <div>
      <PageHeader title="Workspaces" description="All connected Retell workspaces"
        actions={<RefreshButton loading={refreshing} onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} />

      {loading ? <LoadingBlock /> : !rows.length ? <EmptyState text="No workspaces available for your account." /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((w) => (
            <Link key={w.slug} to={`/workspaces/${w.slug}`} className="card group p-5 transition hover:border-brand/40 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="text-base font-bold text-ink">{w.display_name}</div>
                <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-brand" />
              </div>
              <div className="mt-1"><StatusDot status={w.status} /></div>
              <div className="mt-4 grid grid-cols-2 gap-y-3">
                <Stat label="Spend" value={usd(w.kpis.totalCostDollars)} />
                <Stat label="Calls" value={num(w.kpis.totalCalls)} />
                <Stat label="Bookings" value={num(w.kpis.totalBookings)} />
                <Stat label="Success" value={ratePct(w.kpis.successRate)} />
                <Stat label="Cost/Call" value={w.kpis.totalCalls > 0 ? usd(w.kpis.costPerCallDollars, { precise: true }) : '—'} />
                <Stat label="Cost/Booking" value={w.kpis.totalBookings > 0 ? usd(w.kpis.costPerBookingDollars) : '—'} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-mono text-sm font-bold text-ink">{value}</div>
    </div>
  );
}
