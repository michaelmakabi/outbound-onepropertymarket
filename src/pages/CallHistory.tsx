import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useFilters } from '../lib/filters';
import {
  PageHeader, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect, MultiSelect, SavedViews,
  ColumnDef, ColumnToggleMenu, SortableHead, useColumnVisibility, SortState,
} from '../components/dash';
import { usd, secs, dateTime, humanizeDisposition, dispositionColor } from '../lib/format';
import { Search, X, ChevronLeft, ChevronRight, Mic, PhoneIncoming, PhoneOutgoing } from 'lucide-react';

const PAGE_SIZE = 50;
const PAGE_KEY = 'calls';

const COLUMNS: ColumnDef[] = [
  { key: 'rec', label: 'Rec', required: true },
  { key: 'when', label: 'When', sortKey: 'when' },
  { key: 'direction', label: 'Direction', sortKey: 'direction' },
  { key: 'contact', label: 'Contact', required: true },
  { key: 'agent', label: 'Agent', sortKey: 'agent' },
  { key: 'disposition', label: 'Disposition', sortKey: 'disposition' },
  { key: 'duration', label: 'Duration', sortKey: 'duration', align: 'right' },
  { key: 'cost', label: 'Cost', sortKey: 'cost', align: 'right' },
  { key: 'sentiment', label: 'Sentiment' },
];

const DIRECTION_OPTIONS = [{ value: 'inbound', label: 'Inbound' }, { value: 'outbound', label: 'Outbound' }];

function sentimentBadge(s: string | null) {
  if (!s) return null;
  const k = s.toLowerCase();
  const cls = k === 'positive' ? 'bg-emerald-100 text-emerald-700' : k === 'negative' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`pill ${cls}`}>{s}</span>;
}

type ViewCfg = { ws: string; dispositions: string[]; directions: string[]; search: string; sort: SortState | null; hidden: string[] };

export default function CallHistory() {
  const { startMs, endMs } = useFilters();
  const nav = useNavigate();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [ws, setWs] = useState('');
  const [dispositions, setDispositions] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>({ by: 'when', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [dispOptions, setDispOptions] = useState<{ value: string; label: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const { hidden, isVisible, toggle, setHidden } = useColumnVisibility(PAGE_KEY, COLUMNS);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);

  useEffect(() => {
    api.dispositions({ start: startMs, end: endMs, workspace: ws || undefined })
      .then((d) => setDispOptions((d.dispositions || []).map((x: any) => ({ value: x.disposition, label: humanizeDisposition(x.disposition), count: x.count }))));
  }, [startMs, endMs, ws]);

  useEffect(() => { setPage(1); }, [ws, dispositions, directions, search, sort, startMs, endMs]);

  useEffect(() => {
    setLoading(true);
    api.calls({
      start: startMs, end: endMs, workspace: ws || undefined,
      dispositions: dispositions.length ? dispositions : undefined,
      directions: directions.length ? directions : undefined,
      search: search || undefined,
      sort: sort ? `${sort.by}_${sort.dir}` : undefined,
      page, pageSize: PAGE_SIZE,
    }).then(setData).finally(() => setLoading(false));
  }, [startMs, endMs, ws, dispositions, directions, search, sort, page]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.items ?? [];
  const hasFilters = dispositions.length > 0 || directions.length > 0 || !!search;

  const currentCfg: ViewCfg = useMemo(() => ({ ws, dispositions, directions, search, sort, hidden }), [ws, dispositions, directions, search, sort, hidden]);
  const applyView = (cfg: ViewCfg) => {
    setWs(cfg.ws ?? ''); setDispositions(cfg.dispositions ?? []); setDirections(cfg.directions ?? []);
    setSearch(cfg.search ?? ''); setSearchInput(cfg.search ?? ''); setSort(cfg.sort ?? null); setHidden(cfg.hidden ?? []);
  };

  return (
    <div>
      <PageHeader title="Call History" description="Every call across your workspaces — click a row for the recording & transcript"
        actions={<WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />} />

      <SectionCard
        title="Filters"
        description={`${total.toLocaleString()} call${total === 1 ? '' : 's'} match the current filters`}
        className="mb-4"
        action={<div className="flex items-center gap-2">
          <SavedViews<ViewCfg> pageKey={PAGE_KEY} current={currentCfg} onApply={applyView} />
          <ColumnToggleMenu columns={COLUMNS} isVisible={isVisible} onToggle={toggle} />
        </div>}
      >
        <div className="flex flex-wrap items-center gap-3">
          <MultiSelect options={DIRECTION_OPTIONS} value={directions} onChange={setDirections} placeholder="All call types" width={170} />
          <MultiSelect options={dispOptions} value={dispositions} onChange={setDispositions} placeholder="All dispositions" width={210} />
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search phone or agent…" className="input w-[240px] pl-8" />
            </div>
            <button type="submit" className="btn-ghost !py-1.5">Search</button>
          </form>
          {hasFilters && (
            <button type="button" className="btn-ghost !py-1.5" onClick={() => { setDispositions([]); setDirections([]); setSearch(''); setSearchInput(''); }}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Calls"
        description={sort ? `Sorted by ${sort.by} (${sort.dir})` : 'Unsorted'}
        action={<div className="flex items-center gap-2 text-xs text-slate-500">
          <button className="btn-ghost !p-1.5" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular-nums">Page {page} / {pageCount}</span>
          <button className="btn-ghost !p-1.5" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>}
      >
        {loading ? <LoadingBlock label="Loading calls…" /> : rows.length === 0 ? <EmptyState text="No calls match the current filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{COLUMNS.filter((c) => isVisible(c.key)).map((c) => (
                  <SortableHead key={c.key} col={c} sort={sort} onSort={setSort}>{c.key === 'rec' ? '' : c.label}</SortableHead>
                ))}</tr>
              </thead>
              <tbody>
                {rows.map((c: any) => {
                  const inbound = c.direction === 'inbound';
                  const contact = inbound ? c.from_number : c.to_number;
                  return (
                    <tr key={c.call_id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/calls/${c.call_id}`)}>
                      {isVisible('rec') && <td className="px-3 py-2.5"><Mic className={`h-3.5 w-3.5 ${c.recording_url ? 'text-brand' : 'text-slate-300'}`} /></td>}
                      {isVisible('when') && <td className="whitespace-nowrap px-3 py-2.5 text-xs">{dateTime(c.start_timestamp)}</td>}
                      {isVisible('direction') && (
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            {inbound ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-600" /> : <PhoneOutgoing className="h-3.5 w-3.5 text-brand" />}
                            {inbound ? 'Inbound' : 'Outbound'}
                          </span>
                        </td>
                      )}
                      {isVisible('contact') && <td className="px-3 py-2.5 font-mono text-xs">{contact || '—'}</td>}
                      {isVisible('agent') && <td className="px-3 py-2.5 text-xs">{c.agent_name || '—'}</td>}
                      {isVisible('disposition') && (
                        <td className="px-3 py-2.5">
                          {c.disposition ? (
                            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: dispositionColor(c.disposition) }}>
                              <span className="h-2 w-2 rounded-full" style={{ background: dispositionColor(c.disposition) }} />
                              {humanizeDisposition(c.disposition)}
                            </span>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                      )}
                      {isVisible('duration') && <td className="px-3 py-2.5 text-right font-mono text-xs">{secs(Number(c.duration_seconds || 0))}</td>}
                      {isVisible('cost') && <td className="px-3 py-2.5 text-right font-mono text-xs">{usd(Number(c.combined_cost_cents || 0) / 100, { precise: true })}</td>}
                      {isVisible('sentiment') && <td className="px-3 py-2.5">{sentimentBadge(c.user_sentiment)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
