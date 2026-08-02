import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import {
  PageHeader, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable,
} from '../components/dash';
import { usd, num, ratePct, secs, humanizeProduct } from '../lib/format';
import { Search } from 'lucide-react';

type AgentRow = {
  agentId: string; agentName: string; calls: number; costDollars: number; costPerCallDollars: number;
  bookings: number; bookingRate: number; successRate: number; avgDurationSeconds: number; llmProduct: string; ttsProduct: string;
};

const AGENT_COLUMNS: ColumnDef[] = [
  { key: 'agentName', label: 'Agent', required: true, sortKey: 'agentName' },
  { key: 'calls', label: 'Calls', sortKey: 'calls', align: 'right' },
  { key: 'costDollars', label: 'Spend', sortKey: 'costDollars', align: 'right' },
  { key: 'costPerCallDollars', label: 'Cost/Call', sortKey: 'costPerCallDollars', align: 'right' },
  { key: 'bookings', label: 'Bookings', sortKey: 'bookings', align: 'right' },
  { key: 'bookingRate', label: 'Booking %', sortKey: 'bookingRate', align: 'right' },
  { key: 'successRate', label: 'Success %', sortKey: 'successRate', align: 'right' },
  { key: 'avgDurationSeconds', label: 'Avg Dur', sortKey: 'avgDurationSeconds', align: 'right' },
  { key: 'llmProduct', label: 'LLM' },
  { key: 'ttsProduct', label: 'TTS' },
];

function Leaderboard({ rows }: { rows: AgentRow[] }) {
  const getValue = useCallback((r: AgentRow, key: string) => (r as any)[key], []);
  const t = useClientTable<AgentRow>({ pageKey: 'agents', columns: AGENT_COLUMNS, rows, getValue, initialSort: { by: 'calls', dir: 'desc' } });
  if (!rows.length) return <EmptyState text="No agent activity in this range." />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={t.search} onChange={(e) => t.setSearch(e.target.value)} placeholder="Search agents…" className="input w-[240px] pl-8" />
        </div>
        <ColumnToggleMenu columns={AGENT_COLUMNS} isVisible={t.isVisible} onToggle={t.toggle} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>{AGENT_COLUMNS.filter((c) => t.isVisible(c.key)).map((c) => (
              <SortableHead key={c.key} col={c} sort={t.sort} onSort={t.setSort}>{c.label}</SortableHead>
            ))}</tr>
          </thead>
          <tbody>
            {t.rows.map((a) => (
              <tr key={a.agentId} className="border-t border-line hover:bg-surface">
                {t.isVisible('agentName') && <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold text-ink">{a.agentName}</td>}
                {t.isVisible('calls') && <td className="px-3 py-2.5 text-right font-mono">{num(a.calls)}</td>}
                {t.isVisible('costDollars') && <td className="px-3 py-2.5 text-right font-mono">{usd(a.costDollars)}</td>}
                {t.isVisible('costPerCallDollars') && <td className="px-3 py-2.5 text-right font-mono text-slate-500">{usd(a.costPerCallDollars, { precise: true })}</td>}
                {t.isVisible('bookings') && <td className="px-3 py-2.5 text-right font-mono">{num(a.bookings)}</td>}
                {t.isVisible('bookingRate') && <td className="px-3 py-2.5 text-right font-mono">{ratePct(a.bookingRate)}</td>}
                {t.isVisible('successRate') && <td className="px-3 py-2.5 text-right font-mono">{ratePct(a.successRate)}</td>}
                {t.isVisible('avgDurationSeconds') && <td className="px-3 py-2.5 text-right font-mono text-slate-500">{secs(a.avgDurationSeconds)}</td>}
                {t.isVisible('llmProduct') && <td className="max-w-[130px] truncate px-3 py-2.5 font-mono text-xs text-slate-500">{humanizeProduct(a.llmProduct)}</td>}
                {t.isVisible('ttsProduct') && <td className="max-w-[130px] truncate px-3 py-2.5 font-mono text-xs text-slate-500">{humanizeProduct(a.ttsProduct)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <EmptyState text="No data." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-3 py-2 font-semibold">Model</th><th className="px-3 py-2 text-right font-semibold">Calls</th><th className="px-3 py-2 text-right font-semibold">Spend</th><th className="px-3 py-2 text-right font-semibold">$/call</th><th className="px-3 py-2 text-right font-semibold">Booking %</th><th className="px-3 py-2 text-right font-semibold">Success %</th></tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.model} className="border-t border-line">
              <td className="max-w-[240px] truncate px-3 py-2 font-mono text-xs">{humanizeProduct(m.model)}</td>
              <td className="px-3 py-2 text-right font-mono">{num(m.calls)}</td>
              <td className="px-3 py-2 text-right font-mono">{usd(m.costDollars)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-500">{usd(m.costPerCallDollars, { precise: true })}</td>
              <td className="px-3 py-2 text-right font-mono">{ratePct(m.bookingRate)}</td>
              <td className="px-3 py-2 text-right font-mono">{ratePct(m.successRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Agents() {
  const { startMs, endMs } = useFilters();
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);
  useEffect(() => {
    setLoading(true);
    api.agents({ start: startMs, end: endMs, workspace: ws || undefined }).then(setD).finally(() => setLoading(false));
  }, [startMs, endMs, ws]);

  return (
    <div>
      <PageHeader title="Agents & Models" description="Performance by voice agent, LLM model, and TTS voice"
        actions={<WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />} />
      {loading || !d ? <LoadingBlock /> : (
        <div className="flex flex-col gap-5">
          <SectionCard title="Agent Leaderboard" description="Search, sort any column, toggle fields"><Leaderboard rows={d.agents} /></SectionCard>
          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="LLM Models" description="Cost & outcome by language model"><ModelTable rows={d.llm} /></SectionCard>
            <SectionCard title="TTS Voices" description="Cost & outcome by voice engine"><ModelTable rows={d.tts} /></SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
