import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect } from '../components/dash';
import { usd, num, humanizeDisposition, dispositionColor } from '../lib/format';
import { fmt } from '../lib/api';
import { Contact, Users, Repeat, Search, PhoneCall, ChevronRight } from 'lucide-react';

type Row = { number: string; calls: number; firstMs: number | null; lastMs: number | null; lastDisposition: string; spendDollars: number; booked: number; agentName: string | null; workspaceCount: number };

export default function Contacts() {
  const { startMs, endMs } = useFilters();
  const nav = useNavigate();
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'calls' | 'last' | 'spend'>('calls');
  const [repeatOnly, setRepeatOnly] = useState(false);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)).catch(() => {}); }, []);
  useEffect(() => {
    setLoading(true);
    api.contacts({ workspace: ws || undefined, start: startMs, end: endMs, sort, minCalls: repeatOnly ? 2 : 1, search: search || undefined, page: 1, pageSize: 200 })
      .then(setData).finally(() => setLoading(false));
  }, [ws, startMs, endMs, sort, repeatOnly, search]);

  const rows: Row[] = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const repeats = data?.repeatContacts ?? 0;
  const totalBooked = useMemo(() => rows.reduce((s, r) => s + r.booked, 0), [rows]);

  return (
    <div>
      <PageHeader title="Contacts" description="Every number is one profile — repeat calls threaded together"
        actions={<WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Unique Contacts" value={num(total)} sub="distinct phone numbers" icon={Users} accent="blue" />
        <KpiCard label="Repeat Contacts" value={num(repeats)} sub={total > 0 ? `${((repeats / total) * 100).toFixed(0)}% called 2+ times` : ''} icon={Repeat} accent="amber" />
        <KpiCard label="Booked (shown)" value={num(totalBooked)} sub="across listed contacts" icon={PhoneCall} accent="green" />
        <KpiCard label="Listed" value={num(rows.length)} sub="of matching contacts" icon={Contact} />
      </div>

      <SectionCard title="Contact profiles" description="Click a row to see the full call thread"
        action={<div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={repeatOnly} onChange={(e) => setRepeatOnly(e.target.checked)} className="h-3.5 w-3.5 accent-brand" /> Repeat only
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="input !py-1.5 text-sm">
            <option value="calls">Most calls</option>
            <option value="last">Most recent</option>
            <option value="spend">Highest spend</option>
          </select>
        </div>}>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phone number…" className="input w-[280px] pl-8" />
        </div>
        {loading ? <LoadingBlock /> : rows.length === 0 ? <EmptyState text="No contacts in this range." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2 text-right">Calls</th>
                  <th className="px-3 py-2">Last outcome</th>
                  <th className="px-3 py-2 text-right">Booked</th>
                  <th className="px-3 py-2 text-right">Spend</th>
                  <th className="px-3 py-2">Last called</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.number} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/contacts/${encodeURIComponent(r.number)}`)}>
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-semibold text-ink">{r.number}</span>
                      {r.calls > 1 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">×{r.calls}</span>}
                      {r.workspaceCount > 1 && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{r.workspaceCount} ws</span>}
                      {r.agentName && <div className="text-[11px] text-slate-400">{r.agentName}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{num(r.calls)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: dispositionColor(r.lastDisposition) }} />
                        {humanizeDisposition(r.lastDisposition)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.booked > 0 ? <span className="font-bold text-emerald-600">{r.booked}</span> : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{usd(r.spendDollars)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{fmt.dateTime(r.lastMs)}</td>
                    <td className="px-3 py-2.5 text-right"><ChevronRight className="h-4 w-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
