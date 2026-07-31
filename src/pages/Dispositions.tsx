import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api';
import { PageHead, Spinner, RangePicker, rangeToMs } from '../components/ui';

export default function Dispositions() {
  const [range, setRange] = useState('30');
  const [ws, setWs] = useState<string>('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);
  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToMs(range);
    api.dispositions({ start, end, workspace: ws || undefined }).then(setD).finally(() => setLoading(false));
  }, [range, ws]);

  return (
    <div>
      <PageHead title="Dispositions" subtitle="Outcome breakdown across outbound calls"
        right={<div className="flex items-center gap-3">
          <select className="input w-auto" value={ws} onChange={(e) => setWs(e.target.value)}>
            <option value="">All workspaces</option>
            {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
          </select>
          <RangePicker value={range} onChange={setRange} />
        </div>} />
      {loading || !d ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-2.5 font-semibold">Disposition</th><th className="px-3 py-2.5 font-semibold">Count</th><th className="px-3 py-2.5 font-semibold">Share</th><th className="px-3 py-2.5 font-semibold">Spend</th><th className="px-3 py-2.5 font-semibold">Avg / call</th></tr>
            </thead>
            <tbody>
              {d.dispositions.map((r: any) => (
                <tr key={r.disposition} className="border-t border-line hover:bg-surface">
                  <td className="px-5 py-2.5 font-semibold text-ink">{fmt.title(r.disposition)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt.int(r.count)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{r.percentage.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt.money(r.costDollars)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmt.money(r.avgCostPerCallDollars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
