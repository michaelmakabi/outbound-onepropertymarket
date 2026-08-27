import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import {
  PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable, OutcomeTiles,
} from '../components/dash';
import { usd, num, pct, humanizeDisposition, dispositionColor, TOOLTIP_STYLE } from '../lib/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PieChart, ListChecks, PhoneOff, CheckCircle2, Search } from 'lucide-react';

type Row = { disposition: string; count: number; percentage: number; costDollars: number; avgCostPerCallDollars: number };

const COLUMNS: ColumnDef[] = [
  { key: 'disposition', label: 'Disposition', required: true, sortKey: 'disposition' },
  { key: 'count', label: 'Count', sortKey: 'count', align: 'right' },
  { key: 'percentage', label: 'Share', sortKey: 'percentage', align: 'right' },
  { key: 'costDollars', label: 'Total Cost', sortKey: 'costDollars', align: 'right' },
  { key: 'avgCostPerCallDollars', label: 'Avg / call', sortKey: 'avgCostPerCallDollars', align: 'right' },
];

const isPositive = (d: string) => /appointment|booked|transfer|interested|completed/.test(d.toLowerCase()) && !d.toLowerCase().includes('not_interested');
const isNoContact = (d: string) => /no_answer|busy|voicemail|inactivity|failed/.test(d.toLowerCase());

// The full disposition vocabulary that should ALWAYS be visible (even at zero) on every account:
// the 20 Standard 1PM pipeline statuses, plus the standard dispositions the voice platform (Retell)
// reports natively. Actual call counts are merged in; any not seen in the range render as 0.
const STANDARD_1PM = [
  'new_lead', 'no_answer_attempt_1', 'no_answer_attempt_2', 'no_answer_attempt_3', 'voicemail_left',
  'call_back', 'scheduled', 'wrong_number', 'do_not_call', 'not_interested', 'tire_kicker',
  'possibly_interested', 'very_interested', 'appointment_booked', 'offer_sent', 'pending_negotiation',
  'offer_accepted', 'rejected', 'deal_closed_successfully', 'deal_canceled',
];
const RETELL_STANDARD = [
  'no_answer', 'busy', 'failed', 'ivr_reached', 'user_hangup', 'agent_hangup', 'completed',
  'inactivity', 'machine_detected', 'voicemail_reached', 'spam', 'unlabeled',
];
const CANONICAL_DISPOSITIONS = [...new Set([...STANDARD_1PM, ...RETELL_STANDARD])];

function DispTable({ rows }: { rows: Row[] }) {
  const getValue = useCallback((r: Row, key: string) => (r as any)[key], []);
  const t = useClientTable<Row>({ pageKey: 'dispositions', columns: COLUMNS, rows, getValue, initialSort: { by: 'count', dir: 'desc' } });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={t.search} onChange={(e) => t.setSearch(e.target.value)} placeholder="Search dispositions…" className="input w-full sm:w-[240px] pl-8" />
        </div>
        <ColumnToggleMenu columns={COLUMNS} isVisible={t.isVisible} onToggle={t.toggle} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>{COLUMNS.filter((c) => t.isVisible(c.key)).map((c) => (
              <SortableHead key={c.key} col={c} sort={t.sort} onSort={t.setSort}>{c.label}</SortableHead>
            ))}</tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.disposition} className="border-t border-line hover:bg-surface">
                {t.isVisible('disposition') && (
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="mt-0.5 h-2.5 w-2.5 rounded-full" style={{ background: dispositionColor(r.disposition) }} />
                      <span className="flex flex-col leading-tight">
                        <span className="font-semibold text-ink">{humanizeDisposition(r.disposition)}</span>
                        <span className="font-mono text-[10px] text-slate-400">{r.disposition}</span>
                      </span>
                    </span>
                  </td>
                )}
                {t.isVisible('count') && <td className="px-3 py-2.5 text-right font-mono">{num(r.count)}</td>}
                {t.isVisible('percentage') && <td className="px-3 py-2.5 text-right font-mono text-slate-500">{pct(r.percentage)}</td>}
                {t.isVisible('costDollars') && <td className="px-3 py-2.5 text-right font-mono">{usd(r.costDollars)}</td>}
                {t.isVisible('avgCostPerCallDollars') && <td className="px-3 py-2.5 text-right font-mono text-slate-500">{usd(r.avgCostPerCallDollars, { precise: true })}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dispositions() {
  const { startMs, endMs } = useFilters();
  const [ws, setWs] = useState('');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);
  useEffect(() => {
    setLoading(true);
    api.dispositions({ start: startMs, end: endMs, workspace: ws || undefined }).then(setD).finally(() => setLoading(false));
  }, [startMs, endMs, ws]);

  const actualRows: Row[] = d?.dispositions ?? [];
  // Always surface the full canonical vocabulary — merge in zero-count rows for anything not seen.
  const rows: Row[] = useMemo(() => {
    const seen = new Set(actualRows.map((r) => r.disposition));
    const zeros = CANONICAL_DISPOSITIONS.filter((s) => !seen.has(s))
      .map((s) => ({ disposition: s, count: 0, percentage: 0, costDollars: 0, avgCostPerCallDollars: 0 }));
    return [...actualRows, ...zeros];
  }, [actualRows]);
  // Chart shows only dispositions that actually have calls (top 12) — zero rows would clutter it.
  const chartData = useMemo(() => actualRows.filter((r) => r.count > 0).slice(0, 12).map((r) => ({ ...r, name: humanizeDisposition(r.disposition) })), [actualRows]);
  const positive = actualRows.filter((r) => isPositive(r.disposition)).reduce((s, r) => s + r.count, 0);
  const noContact = actualRows.filter((r) => isNoContact(r.disposition)).reduce((s, r) => s + r.count, 0);
  const activeTypes = actualRows.filter((r) => r.count > 0).length;
  const total = d?.total ?? 0;

  return (
    <div>
      <PageHeader title="Disposition Analytics" description="Outcome distribution with cost attribution"
        actions={<WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />} />

      {loading || !d ? <LoadingBlock /> : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Calls" value={num(total)} icon={PhoneOff} accent="blue" />
            <KpiCard label="Disposition Types" value={num(activeTypes)} sub={`of ${num(rows.length)} tracked`} icon={ListChecks} />
            <KpiCard label="Positive Outcomes" value={num(positive)} sub="booked / transfer / interested" icon={CheckCircle2} accent="green" />
            <KpiCard label="No Contact" value={num(noContact)} sub="no answer / voicemail / busy" icon={PieChart} accent="amber" />
          </div>

          {d.outcomes && d.outcomes.length > 0 && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-ink">Business Outcomes</h3>
                <span className="text-xs text-slate-500">Bookings · scheduled · interested · not interested · …</span>
              </div>
              <OutcomeTiles outcomes={d.outcomes} total={total} />
            </div>
          )}

          <SectionCard title="Disposition Volume" description="Top outcomes by call count">
            {chartData.length === 0 ? <EmptyState text="No dispositions in this range." /> : (
              <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 34)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 24 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={150} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, _n, p: any) => [`${num(v)} calls · ${usd(p.payload.costDollars)}`, 'Calls']} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {chartData.map((r) => <Cell key={r.disposition} fill={dispositionColor(r.disposition)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="All Dispositions" description="Every standard 1PM + voice-platform disposition — search, sort, toggle fields">
            {rows.length === 0 ? <EmptyState text="No dispositions in this range." /> : <DispTable rows={rows} />}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
