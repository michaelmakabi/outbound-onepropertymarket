import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { PageHead, Spinner, RangePicker, rangeToMs, EmptyState } from '../components/ui';
import { Search } from 'lucide-react';

const sentimentColor: Record<string, string> = { Positive: 'bg-emerald-100 text-emerald-700', Negative: 'bg-red-100 text-red-700', Neutral: 'bg-slate-100 text-slate-600' };

export default function CallHistory() {
  const nav = useNavigate();
  const [range, setRange] = useState('30');
  const [ws, setWs] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);
  useEffect(() => { setPage(1); }, [range, ws, search]);
  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToMs(range);
    const t = setTimeout(() => {
      api.calls({ start, end, workspace: ws || undefined, search: search || undefined, page, pageSize: 50 }).then(setData).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [range, ws, search, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHead title="Call History" subtitle={data ? `${fmt.int(data.total)} calls` : 'Loading…'}
        right={<div className="flex items-center gap-3">
          <select className="input w-auto" value={ws} onChange={(e) => setWs(e.target.value)}>
            <option value="">All workspaces</option>
            {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
          </select>
          <RangePicker value={range} onChange={setRange} />
        </div>} />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input className="input pl-9" placeholder="Search number, agent, disposition…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner /> : !data.items.length ? <EmptyState text="No calls match your filters." /> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-2.5 font-semibold">When</th><th className="px-3 py-2.5 font-semibold">Agent</th><th className="px-3 py-2.5 font-semibold">To</th><th className="px-3 py-2.5 font-semibold">Disposition</th><th className="px-3 py-2.5 font-semibold">Sentiment</th><th className="px-3 py-2.5 font-semibold">Dur</th><th className="px-3 py-2.5 font-semibold">Cost</th></tr>
              </thead>
              <tbody>
                {data.items.map((c: any) => (
                  <tr key={c.call_id} onClick={() => nav(`/calls/${c.call_id}`)} className="cursor-pointer border-t border-line hover:bg-surface">
                    <td className="px-5 py-2.5 whitespace-nowrap">{fmt.dateTime(c.start_timestamp)}</td>
                    <td className="px-3 py-2.5">{c.agent_name || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{c.to_number || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">{fmt.title(c.disposition)}</td>
                    <td className="px-3 py-2.5"><span className={`pill ${sentimentColor[c.user_sentiment] || 'bg-slate-100 text-slate-500'}`}>{c.user_sentiment || 'Unknown'}</span></td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.dur(c.duration_seconds)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.money((c.combined_cost_cents || 0) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
