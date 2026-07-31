import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api';
import { PageHead, Spinner, RangePicker, rangeToMs, StatusPill } from '../components/ui';

export default function Compare() {
  const [range, setRange] = useState('30');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToMs(range);
    api.compare({ start, end }).then(setD).finally(() => setLoading(false));
  }, [range]);

  if (loading || !d) return <Spinner />;

  return (
    <div>
      <PageHead title="Compare Workspaces" subtitle="Side-by-side outbound performance" right={<RangePicker value={range} onChange={setRange} />} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-5 py-2.5 font-semibold">Workspace</th><th className="px-3 py-2.5 font-semibold">Calls</th><th className="px-3 py-2.5 font-semibold">Spend</th><th className="px-3 py-2.5 font-semibold">$/call</th><th className="px-3 py-2.5 font-semibold">Bookings</th><th className="px-3 py-2.5 font-semibold">Book rate</th><th className="px-3 py-2.5 font-semibold">Success</th></tr>
          </thead>
          <tbody>
            {d.workspaces.map((w: any) => (
              <tr key={w.slug} className="border-t border-line hover:bg-surface">
                <td className="px-5 py-2.5 font-semibold text-ink">{w.display_name} <StatusPill status={w.status} /></td>
                <td className="px-3 py-2.5 tabular-nums">{fmt.int(w.kpis.totalCalls)}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt.money(w.kpis.totalCostDollars)}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt.money(w.kpis.costPerCallDollars)}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt.int(w.kpis.totalBookings)}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt.pct(w.kpis.bookingRate)}</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt.pct(w.kpis.successRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
