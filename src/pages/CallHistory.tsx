import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, opm } from '../lib/api';
import { useFilters } from '../lib/filters';
import {
  PageHeader, SectionCard, LoadingBlock, EmptyState, WorkspaceSelect, MultiSelect, SavedViews, AudioPlayer,
  ColumnDef, ColumnToggleMenu, SortableHead, useColumnVisibility, SortState,
} from '../components/dash';
import AiPromptModal from '../components/AiPromptModal';
import { bulkDownload, downloadCallMp3 } from '../lib/download';
import { usd, secs, dateTime, humanizeDisposition, dispositionColor } from '../lib/format';
import { Search, X, ChevronLeft, ChevronRight, PhoneIncoming, PhoneOutgoing, Download, Clock, FileText, Wand2, Loader2, ArrowDownToLine } from 'lucide-react';

const PAGE_SIZE = 50;
const PAGE_KEY = 'calls';
const DURATIONS = [0, 30, 60, 120, 300];

const COLUMNS: ColumnDef[] = [
  { key: 'rec', label: 'Recording', required: true },
  { key: 'when', label: 'When', sortKey: 'when' },
  { key: 'direction', label: 'Direction', sortKey: 'direction' },
  { key: 'contact', label: 'Contact', required: true },
  { key: 'agent', label: 'Agent', sortKey: 'agent' },
  { key: 'disposition', label: 'Disposition', sortKey: 'disposition' },
  { key: 'summary', label: 'Summary / Transcript' },
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

type ViewCfg = { ws: string; dispositions: string[]; directions: string[]; minDuration: number; search: string; sort: SortState | null; hidden: string[] };

export default function CallHistory() {
  const { startMs, endMs } = useFilters();
  const nav = useNavigate();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [ws, setWs] = useState('');
  const [dispositions, setDispositions] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [minDuration, setMinDuration] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>({ by: 'when', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [dispOptions, setDispOptions] = useState<{ value: string; label: string; count: number }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAi, setShowAi] = useState(false);
  const [dlMenu, setDlMenu] = useState(false);
  const [dl, setDl] = useState<{ busy: boolean; done: number; total: number }>({ busy: false, done: 0, total: 0 });
  const [rowDl, setRowDl] = useState<string | null>(null);

  const { hidden, isVisible, toggle, setHidden } = useColumnVisibility(PAGE_KEY, COLUMNS);

  useEffect(() => { api.bootstrap().then((b) => setWorkspaces(b.workspaces)); }, []);
  useEffect(() => {
    api.dispositions({ start: startMs, end: endMs, workspace: ws || undefined })
      .then((d) => setDispOptions((d.dispositions || []).map((x: any) => ({ value: x.disposition, label: humanizeDisposition(x.disposition), count: x.count }))));
  }, [startMs, endMs, ws]);
  useEffect(() => { setPage(1); }, [ws, dispositions, directions, minDuration, search, sort, startMs, endMs]);

  const query = (over: any = {}) => ({
    start: startMs, end: endMs, workspace: ws || undefined,
    dispositions: dispositions.length ? dispositions : undefined,
    directions: directions.length ? directions : undefined,
    minDuration: minDuration || undefined,
    search: search || undefined,
    sort: sort ? `${sort.by}_${sort.dir}` : undefined,
    page, pageSize: PAGE_SIZE, ...over,
  });

  useEffect(() => {
    setLoading(true);
    api.calls(query()).then(setData).finally(() => setLoading(false));
  }, [startMs, endMs, ws, dispositions, directions, minDuration, search, sort, page]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows: any[] = data?.items ?? [];
  const hasFilters = dispositions.length > 0 || directions.length > 0 || !!search || minDuration > 0;

  // Enrich calls with the matched seller contact (name + property) from the OPM campaign data.
  const [resolveMap, setResolveMap] = useState<Record<string, any>>({});
  useEffect(() => {
    const nums = rows.map((c: any) => (c.direction === 'inbound' ? c.from_number : c.to_number)).filter(Boolean);
    if (!nums.length) { setResolveMap({}); return; }
    opm.resolve(nums).then((d) => setResolveMap(d.map || {})).catch(() => setResolveMap({}));
  }, [data]);
  const resolveInfo = (num: string) => resolveMap[String(num || '').replace(/\D/g, '').slice(-10)];
  const selectedCalls = () => Array.from(selected).map((id) => rows.find((r) => r.call_id === id) || { call_id: id });

  const currentCfg: ViewCfg = useMemo(() => ({ ws, dispositions, directions, minDuration, search, sort, hidden }), [ws, dispositions, directions, minDuration, search, sort, hidden]);
  const applyView = (cfg: ViewCfg) => {
    setWs(cfg.ws ?? ''); setDispositions(cfg.dispositions ?? []); setDirections(cfg.directions ?? []);
    setMinDuration(cfg.minDuration ?? 0); setSearch(cfg.search ?? ''); setSearchInput(cfg.search ?? '');
    setSort(cfg.sort ?? null); setHidden(cfg.hidden ?? []);
  };

  const openCall = (id: string) => nav(`/calls/${id}`, { state: { ids: rows.map((r) => r.call_id), total, offset: (page - 1) * PAGE_SIZE } });
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.call_id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allOnPage) rows.forEach((r) => n.delete(r.call_id)); else rows.forEach((r) => n.add(r.call_id)); return n; });

  const runBulk = async (audio: boolean, transcripts: boolean) => {
    setDlMenu(false);
    const calls = selectedCalls();
    setDl({ busy: true, done: 0, total: calls.length });
    try {
      await bulkDownload(calls, { audio, transcripts, onProgress: (done, t) => setDl({ busy: true, done, total: t }) });
    } finally { setDl({ busy: false, done: 0, total: 0 }); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.calls(query({ page: 1, pageSize: 5000 }));
      let items: any[] = all.items || [];
      if (selected.size) items = items.filter((c) => selected.has(c.call_id));
      const cols = ['When', 'Direction', 'Contact', 'Name', 'Property', 'Agent', 'Disposition', 'Duration(s)', 'Cost($)', 'Sentiment', 'Summary', 'CallID'];
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [cols.join(',')];
      for (const c of items) {
        const contact = c.direction === 'inbound' ? c.from_number : c.to_number;
        const info = resolveInfo(contact) || {};
        lines.push([c.start_timestamp ? new Date(c.start_timestamp).toISOString() : '', c.direction || '', contact || '', info.name || '', info.property_ref || '', c.agent_name || '', c.disposition || '', c.duration_seconds || 0, (Number(c.combined_cost_cents || 0) / 100).toFixed(3), c.user_sentiment || '', c.call_summary || '', c.call_id].map(esc).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `call-history-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  const rowDownload = async (c: any, e: any) => {
    e.stopPropagation();
    setRowDl(c.call_id);
    try { await downloadCallMp3(c); } catch (err) { alert('Download failed: ' + String((err as any)?.message || err)); } finally { setRowDl(null); }
  };

  const Chip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <button onClick={onClear} className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand-light px-2.5 py-1.5 text-xs font-semibold text-brand">{label} <X className="h-3 w-3" /></button>
  );

  return (
    <div>
      <PageHeader title="Call History" description="Every call across your workspaces — click a row for the recording & transcript"
        actions={<WorkspaceSelect workspaces={workspaces} value={ws} onChange={setWs} />} />

      <SectionCard title="Filters" description={`${total.toLocaleString()} call${total === 1 ? '' : 's'} match the current filters`} className="mb-4"
        action={<div className="flex items-center gap-2">
          <SavedViews<ViewCfg> pageKey={PAGE_KEY} current={currentCfg} onApply={applyView} />
          <ColumnToggleMenu columns={COLUMNS} isVisible={isVisible} onToggle={toggle} />
        </div>}>
        <div className="flex flex-wrap items-center gap-3">
          <MultiSelect options={DIRECTION_OPTIONS} value={directions} onChange={setDirections} placeholder="All call types" width={160} />
          <MultiSelect options={dispOptions} value={dispositions} onChange={setDispositions} placeholder="All dispositions" width={200} />
          <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <select className="bg-transparent text-sm outline-none" value={minDuration} onChange={(e) => setMinDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d === 0 ? 'Any duration' : `> ${d < 60 ? `${d}s` : `${d / 60}m`}`}</option>)}
            </select>
          </div>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search phone, agent, summary…" className="input w-[240px] pl-8" />
            </div>
            <button type="submit" className="btn-ghost !py-1.5">Search</button>
          </form>
          {hasFilters && <button type="button" className="btn-ghost !py-1.5" onClick={() => { setDispositions([]); setDirections([]); setMinDuration(0); setSearch(''); setSearchInput(''); }}><X className="h-3.5 w-3.5" /> Clear filters</button>}
        </div>
        {hasFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {directions.map((d) => <Chip key={d} label={d === 'inbound' ? 'Inbound' : 'Outbound'} onClear={() => setDirections(directions.filter((x) => x !== d))} />)}
            {dispositions.map((d) => <Chip key={d} label={humanizeDisposition(d)} onClear={() => setDispositions(dispositions.filter((x) => x !== d))} />)}
            {minDuration > 0 && <Chip label={`Duration > ${minDuration < 60 ? `${minDuration}s` : `${minDuration / 60}m`}`} onClear={() => setMinDuration(0)} />}
            {search && <Chip label={`“${search}”`} onClear={() => { setSearch(''); setSearchInput(''); }} />}
          </div>
        )}
      </SectionCard>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/50 px-4 py-2.5">
          <span className="text-sm font-semibold text-brand">{selected.size} selected</span>
          <span className="mx-1 h-4 w-px bg-brand/20" />
          <button className="btn-primary !py-1.5" onClick={() => setShowAi(true)}><Wand2 className="h-3.5 w-3.5" /> Build AI Prompt</button>
          <div className="relative">
            <button className="btn-ghost !py-1.5" disabled={dl.busy} onClick={() => setDlMenu((o) => !o)}>
              {dl.busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {dl.done}/{dl.total}…</> : <><ArrowDownToLine className="h-3.5 w-3.5" /> Download ▾</>}
            </button>
            {dlMenu && !dl.busy && (
              <div className="absolute z-30 mt-1 w-56 rounded-lg border border-line bg-white p-1 shadow-lg">
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface" onClick={() => runBulk(true, false)}>🎵 Audio only (MP3 zip)</button>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface" onClick={() => runBulk(false, true)}>📄 Transcripts only (zip)</button>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface" onClick={() => runBulk(true, true)}>📦 Audio + transcripts</button>
              </div>
            )}
          </div>
          <button className="btn-ghost !py-1.5" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <SectionCard title="Calls" description={`${sort ? `Sorted by ${sort.by} (${sort.dir})` : 'Unsorted'}`}
        action={<div className="flex items-center gap-2 text-xs text-slate-500">
          <button className="btn-ghost !py-1.5" disabled={exporting || total === 0} onClick={exportCsv}><Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}</button>
          <button className="btn-ghost !p-1.5" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular-nums">Page {page} / {pageCount}</span>
          <button className="btn-ghost !p-1.5" disabled={page >= pageCount || loading} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>}>
        {loading ? <LoadingBlock label="Loading calls…" /> : rows.length === 0 ? <EmptyState text="No calls match the current filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#1f6feb]" /></th>
                  {COLUMNS.filter((c) => isVisible(c.key)).map((c) => <SortableHead key={c.key} col={c} sort={sort} onSort={setSort}>{c.label}</SortableHead>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any) => {
                  const inbound = c.direction === 'inbound';
                  const contact = inbound ? c.from_number : c.to_number;
                  return (
                    <tr key={c.call_id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => openCall(c.call_id)}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.call_id)} onChange={() => toggleSel(c.call_id)} className="h-3.5 w-3.5 accent-[#1f6feb]" /></td>
                      {isVisible('rec') && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <AudioPlayer src={c.recording_url} compact />
                            {c.recording_url && (
                              <button title="Download MP3" onClick={(e) => rowDownload(c, e)} className="shrink-0 rounded p-1 text-slate-400 hover:text-brand">
                                {rowDl === c.call_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {isVisible('when') && <td className="whitespace-nowrap px-3 py-2.5 text-xs">{dateTime(c.start_timestamp)}</td>}
                      {isVisible('direction') && <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs">{inbound ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-600" /> : <PhoneOutgoing className="h-3.5 w-3.5 text-brand" />}{inbound ? 'Inbound' : 'Outbound'}</span></td>}
                      {isVisible('contact') && (() => { const info = resolveInfo(contact); return (
                        <td className="px-3 py-2.5">
                          <div className="whitespace-nowrap font-mono text-xs text-ink">{contact || '—'}</div>
                          {info?.name && <div className="text-xs font-semibold text-brand">{info.name}</div>}
                          {info?.property_ref && <div className="max-w-[200px] truncate text-[10px] text-slate-400">{info.property_ref}</div>}
                        </td>
                      ); })()}
                      {isVisible('agent') && <td className="max-w-[220px] truncate px-3 py-2.5 text-xs">{c.agent_name || '—'}</td>}
                      {isVisible('disposition') && <td className="whitespace-nowrap px-3 py-2.5">{c.disposition ? <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: dispositionColor(c.disposition) }}><span className="h-2 w-2 rounded-full" style={{ background: dispositionColor(c.disposition) }} />{humanizeDisposition(c.disposition)}</span> : <span className="text-xs text-slate-400">—</span>}</td>}
                      {isVisible('summary') && <td className="max-w-[280px] px-3 py-2.5">{c.call_summary ? <span className="flex items-center gap-1.5 text-xs text-slate-600"><FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{c.call_summary}</span></span> : <span className="text-xs text-slate-300">—</span>}</td>}
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

      {showAi && <AiPromptModal callIds={Array.from(selected)} onClose={() => setShowAi(false)} />}
    </div>
  );
}
