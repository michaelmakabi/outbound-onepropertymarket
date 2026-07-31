import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api';
import { PageHead, Spinner, RangePicker, rangeToMs } from '../components/ui';

export default function Agents() {
  const [range, setRange] = useState('30');
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);
  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeToMs(range);
    api.agents({ start, end, workspace: ws || undefined }).then(setD).finally(() => setLoading(false));
  }, [range, ws]);

  return (
    <div>
      <PageHead title="Agents & Models" subtitle="Performance by voice agent, LLM, and TTS"
        right={<div className="flex items-center gap-3">
          <select className="input w-auto" value={ws} onChange={(e) => setWs(e.target.value)}>
            <option value="">All workspaces</option>
            {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
          </select>
          <RangePicker value={range} onChange={setRange} />
        </div>} />
      {loading || !d ? <Spinner /> : (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3 label">Agents</div>
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-2 font-semibold">Agent</th><th className="px-3 py-2 font-semibold">Calls</th><th className="px-3 py-2 font-semibold">Spend</th><th className="px-3 py-2 font-semibold">$/call</th><th className="px-3 py-2 font-semibold">Bookings</th><th className="px-3 py-2 font-semibold">Success</th><th className="px-3 py-2 font-semibold">LLM / TTS</th></tr>
              </thead>
              <tbody>
                {d.agents.map((a: any) => (
                  <tr key={a.agentId} className="border-t border-line hover:bg-surface">
                    <td className="px-5 py-2.5 font-semibold text-ink">{a.agentName}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.int(a.calls)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.money(a.costDollars)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.money(a.costPerCallDollars)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.int(a.bookings)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmt.pct(a.successRate)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{a.llmProduct || '—'} / {a.ttsProduct || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
