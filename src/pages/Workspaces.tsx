import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { PageHead, Spinner, StatusPill, EmptyState } from '../components/ui';
import { Building2, ChevronRight } from 'lucide-react';

export default function Workspaces() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.overview({}).then((d) => setRows(d.perWorkspace)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!rows.length) return <EmptyState text="No workspaces available for your account." />;

  return (
    <div>
      <PageHead title="Workspaces" subtitle="Every Retell-powered outbound workspace you can access" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((w) => (
          <Link key={w.slug} to={`/workspaces/${w.slug}`} className="card group p-5 transition hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand"><Building2 className="h-5 w-5" /></div>
              <StatusPill status={w.status} />
            </div>
            <div className="mt-3 text-base font-bold text-ink">{w.display_name}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><div className="text-lg font-extrabold text-ink">{fmt.int(w.kpis.totalCalls)}</div><div className="text-[11px] text-slate-400">Calls</div></div>
              <div><div className="text-lg font-extrabold text-ink">{fmt.money(w.kpis.totalCostDollars)}</div><div className="text-[11px] text-slate-400">Spend</div></div>
              <div><div className="text-lg font-extrabold text-ink">{fmt.int(w.kpis.totalBookings)}</div><div className="text-[11px] text-slate-400">Bookings</div></div>
            </div>
            <div className="mt-3 flex items-center justify-end text-xs font-semibold text-brand opacity-0 transition group-hover:opacity-100">Open <ChevronRight className="h-4 w-4" /></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
