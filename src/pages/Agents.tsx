import { useEffect, useState, useCallback } from 'react';
import { api, opm } from '../lib/api';
import { useFilters } from '../lib/filters';
import { useWorkspace } from '../lib/workspace';
import {
  PageHeader, SectionCard, LoadingBlock, EmptyState,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable,
} from '../components/dash';
import { usd, num, ratePct, secs, humanizeProduct } from '../lib/format';
import { Search, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';

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

// ---- Reliability: per-workspace Retell "Stable Server" opt-in. When ON, this tenant's outbound
// campaign calls + the pre-launch credit probe route through Retell's stable cluster (delayed
// feature rollouts = fewer surprises mid-campaign). The cluster must first be enabled on the Retell
// account by Retell support ($0.02/min surcharge); this toggle only controls which host we call.
function StableServerCard() {
  const { active, activeName, viewAll } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (viewAll) { setLoading(false); return; }
    setLoading(true); setErr(null);
    opm.dialerConfig().then(setCfg).catch((e) => setErr(String(e?.message || e))).finally(() => setLoading(false));
  }, [active, viewAll]);

  const on = !!cfg?.stable_server;

  const toggle = async () => {
    if (saving || viewAll) return;
    const next = !on;
    setSaving(true); setErr(null);
    try {
      const r = await opm.setStableServer(next);
      setCfg((c: any) => ({ ...(c || {}), stable_server: !!r?.stable_server }));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally { setSaving(false); }
  };

  return (
    <SectionCard title="Reliability — Stable Server"
      description="Route this workspace's calls through Retell's stable cluster for steadier, delayed-rollout reliability">
      {viewAll ? (
        <div className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-slate-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>Stable Server is configured per workspace. Pick a specific workspace in the sidebar switcher to turn it on or off.</span>
        </div>
      ) : loading ? (
        <LoadingBlock label="Loading reliability settings…" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${on ? 'text-emerald-600' : 'text-slate-400'}`} />
              <div>
                <div className="text-sm font-semibold text-ink">Stable Server routing {on ? 'ON' : 'OFF'} for {activeName || active}</div>
                <div className="text-xs text-slate-500">
                  {cfg?.has_config
                    ? (on
                        ? 'Outbound calls + pre-launch checks for this workspace are sent to stable.retellai.com.'
                        : 'Calls use the standard Retell endpoint. Turn on for delayed-rollout stability.')
                    : 'No dialer routing is configured for this workspace yet — set up its agent + numbers first.'}
                </div>
              </div>
            </div>
            <button
              type="button" role="switch" aria-checked={on}
              disabled={saving || !cfg?.has_config}
              onClick={toggle}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
              {saving && <Loader2 className="absolute -right-6 h-3.5 w-3.5 animate-spin text-slate-400" />}
            </button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Before turning this on:</span> the Stable Server cluster must be enabled on this workspace's Retell account by Retell support, and it adds a <span className="font-semibold">$0.02/min surcharge</span> on calls. This toggle only changes which Retell host we route to — it does not enable the cluster itself.
          </div>
          {err && <div className="text-xs font-medium text-red-600">{err}</div>}
        </div>
      )}
    </SectionCard>
  );
}

function Leaderboard({ rows }: { rows: AgentRow[] }) {
  const getValue = useCallback((r: AgentRow, key: string) => (r as any)[key], []);
  const t = useClientTable<AgentRow>({ pageKey: 'agents', columns: AGENT_COLUMNS, rows, getValue, initialSort: { by: 'calls', dir: 'desc' } });
  if (!rows.length) return <EmptyState text="No agent activity in this range." />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input value={t.search} onChange={(e) => t.setSearch(e.target.value)} placeholder="Search agents…" className="input w-full pl-8 sm:w-[240px]" />
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
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.agents({ start: startMs, end: endMs }).then(setD).finally(() => setLoading(false));
  }, [startMs, endMs]);

  return (
    <div>
      <PageHeader title="Agents & Models" description="Performance by voice agent, LLM model, and TTS voice" />
      <div className="mb-5"><StableServerCard /></div>
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
