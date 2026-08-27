// Reusable dashboard toolkit for 1PropertyMarket — Outbound.
// Ported in spirit from retell-command-center's shadcn components, rebuilt in plain Tailwind.
import { ReactNode, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Loader2, LucideIcon, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown,
  Search, Check, X, RefreshCw, Bookmark, Plus, Play, Pause, Calendar as CalendarIcon,
  Filter, Trash2,
} from 'lucide-react';
import { useFilters, RangePreset } from '../lib/filters';
import { OUTCOME_ORDER, outcomeLabel, outcomeColor, num as fnum, pct as fpct } from '../lib/format';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ primitives */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" /> {label || 'Loading…'}
    </div>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {label ?? 'Loading live data…'}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="py-12 text-center text-sm text-slate-400">{text}</div>;
}

const ACCENTS: Record<string, string> = {
  green: 'text-emerald-600', blue: 'text-brand', amber: 'text-amber-600', red: 'text-red-600', default: 'text-ink',
};

export function KpiCard({
  label, value, sub, icon: Icon, accent = 'default', loading,
}: {
  label: string; value: string; sub?: string; icon?: LucideIcon;
  accent?: 'green' | 'blue' | 'amber' | 'red' | 'default'; loading?: boolean;
}) {
  const color = ACCENTS[accent] || ACCENTS.default;
  return (
    <div className="card flex flex-col gap-1.5 p-4 transition hover:border-brand/30">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        {Icon && <Icon className={cx('h-4 w-4', color)} />}
      </div>
      {loading ? (
        <Loader2 className="mt-1 h-6 w-6 animate-spin text-slate-300" />
      ) : (
        <span className={cx('text-2xl font-extrabold tracking-tight tabular-nums', color)}>{value}</span>
      )}
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

/** Business-outcome tiles (Booked / Scheduled / Interested / … ) built from the API `outcomes` array. */
export function OutcomeTiles({ outcomes, total }: { outcomes: { outcome: string; count: number; percentage: number; costDollars?: number }[]; total?: number }) {
  if (!outcomes || outcomes.length === 0) return null;
  const byKey = new Map(outcomes.map((o) => [o.outcome, o]));
  const denom = total ?? outcomes.reduce((s, o) => s + o.count, 0);
  const order = OUTCOME_ORDER.filter((o) => byKey.has(o));
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {order.map((key) => {
        const o = byKey.get(key)!;
        const color = outcomeColor(key);
        const perc = denom > 0 ? (o.count / denom) * 100 : 0;
        return (
          <div key={key} className="card flex flex-col gap-1 p-3" style={{ borderTopColor: color, borderTopWidth: 3 }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{outcomeLabel(key)}</span>
            <span className="text-xl font-extrabold tabular-nums text-ink">{fnum(o.count)}</span>
            <span className="text-[11px] font-medium" style={{ color }}>{fpct(perc)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SectionCard({
  title, description, action, children, className,
}: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('card p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={cx('h-2 w-2 rounded-full', active ? 'bg-emerald-500' : 'bg-amber-500')} />
      {active ? 'Active' : 'Trial expired'}
    </span>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button className="btn-ghost !py-1.5" onClick={onClick} disabled={loading}>
      <RefreshCw className={cx('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
    </button>
  );
}

/* ------------------------------------------------------------------ date range */

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: '7d', label: '7D' }, { key: '30d', label: '30D' }, { key: '90d', label: '90D' }, { key: 'all', label: 'All' },
];

export function DateRangePicker() {
  const { preset, setPreset, customStart, customEnd, setCustom } = useFilters();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(customStart);
  const [e, setE] = useState(customEnd);
  useEffect(() => { setS(customStart); setE(customEnd); }, [customStart, customEnd]);
  const apply = () => { if (s && e) { setCustom(s, e); setOpen(false); } };
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <div className="inline-flex items-center rounded-lg border border-line bg-white p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => { setPreset(p.key); setOpen(false); }}
            className={cx(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition',
              preset === p.key ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface',
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setOpen((o) => !o)}
          title="Custom date range"
          className={cx(
            'ml-0.5 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition',
            preset === 'custom' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface',
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {preset === 'custom' && customStart && customEnd ? `${customStart} → ${customEnd}` : 'Custom'}
        </button>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-line bg-white p-3 shadow-xl">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Custom date range</div>
            <label className="mb-2 block text-xs font-semibold text-slate-500">From
              <input type="date" value={s} max={e || undefined} onChange={(ev) => setS(ev.target.value)} className="input mt-1 block !py-1.5 text-sm" />
            </label>
            <label className="mb-3 block text-xs font-semibold text-slate-500">To
              <input type="date" value={e} min={s || undefined} onChange={(ev) => setE(ev.target.value)} className="input mt-1 block !py-1.5 text-sm" />
            </label>
            <div className="flex items-center justify-end gap-2">
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary !py-1.5 text-xs disabled:opacity-40" disabled={!s || !e} onClick={apply}>Apply</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PageHeader({
  title, description, actions, showDate = true,
}: { title: string; description?: string; actions?: ReactNode; showDate?: boolean }) {
  const { rangeLabel } = useFilters();
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500">
            {description}
            {showDate && <span className="text-slate-400"> · {rangeLabel}</span>}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {showDate && <DateRangePicker />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ click-outside popover */

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return { open, setOpen, ref };
}

/* ------------------------------------------------------------------ workspace select */

// Per-page workspace pickers are intentionally removed. The whole app is HARD-locked to the active
// workspace (see api.ts WS_SCOPED_ACTIONS) — you change scope only via the sidebar tenant switcher,
// so no screen can show another tenant's data. This component is now a no-op kept for call-site compat.
export function WorkspaceSelect(_props: { workspaces: { slug: string; display_name: string }[]; value: string; onChange: (v: string) => void }) {
  return null;
}

/* ------------------------------------------------------------------ multi-select */

export type MultiOption = { value: string; label: string; count?: number };

export function MultiSelect({
  options, value, onChange, placeholder = 'All', width = 210,
}: { options: MultiOption[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string; width?: number }) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const toggle = (v: string) => (selected.has(v) ? onChange(value.filter((x) => x !== v)) : onChange([...value, v]));
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const label = value.length === 0 ? placeholder : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? '1 selected') : `${value.length} selected`;

  return (
    <div className="relative" ref={ref} style={{ width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm"
      >
        <span className={cx('truncate', value.length === 0 && 'text-slate-400')}>{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          {value.length > 0 && <span className="pill bg-brand-light text-brand !px-1.5 !py-0">{value.length}</span>}
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] rounded-lg border border-line bg-white p-1 shadow-lg">
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full rounded-md border border-line py-1.5 pl-8 pr-2 text-sm outline-none" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {shown.length === 0 && <div className="px-2 py-3 text-center text-xs text-slate-400">No matches.</div>}
            {shown.map((o) => {
              const on = selected.has(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface">
                  <span className={cx('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-slate-300')}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {typeof o.count === 'number' && <span className="text-xs tabular-nums text-slate-400">{o.count.toLocaleString()}</span>}
                </button>
              );
            })}
          </div>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 flex w-full items-center gap-2 border-t border-line px-2 py-1.5 text-xs text-slate-500 hover:text-ink">
              <X className="h-3.5 w-3.5" /> Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ audio player */

export function AudioPlayer({ src, compact, onTime, seekRef }: { src?: string | null; compact?: boolean; onTime?: (t: number) => void; seekRef?: { current: ((t: number) => void) | null } }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const RATES = [1, 1.5, 2];

  // Expose an imperative seek() to the parent (e.g. click a transcript line to jump the audio there).
  useEffect(() => {
    if (!seekRef) return;
    seekRef.current = (t: number) => {
      const a = ref.current; if (!a) return;
      a.currentTime = t; setCur(t);
      a.play().then(() => setPlaying(true)).catch(() => {});
    };
    return () => { if (seekRef) seekRef.current = null; };
  }, [seekRef]);

  if (!src) return <span className="text-xs text-slate-300">No recording</span>;

  const fmtT = (s: number) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--:--');
  const toggle = (e: any) => {
    e.stopPropagation();
    const a = ref.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const cycleRate = (e: any) => {
    e.stopPropagation();
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next); if (ref.current) ref.current.playbackRate = next;
  };
  const seek = (e: any) => {
    e.stopPropagation();
    const a = ref.current; if (!a) return;
    a.currentTime = Number(e.target.value); setCur(a.currentTime);
  };

  return (
    <div className={cx('flex items-center gap-2', compact ? 'w-[210px]' : 'w-full')} onClick={(e) => e.stopPropagation()}>
      <audio ref={ref} src={src} preload="none"
        onTimeUpdate={(e) => { const t = (e.target as HTMLAudioElement).currentTime; setCur(t); onTime?.(t); }}
        onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration)}
        onEnded={() => setPlaying(false)} />
      <button onClick={toggle} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand hover:bg-brand hover:text-white">
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <input type="range" min={0} max={dur || 0} value={cur} onChange={seek} onClick={(e) => e.stopPropagation()}
        className="h-1 flex-1 cursor-pointer accent-[#1f6feb]" style={{ minWidth: compact ? 60 : 120 }} />
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">{fmtT(cur)}/{fmtT(dur)}</span>
      <button onClick={cycleRate} className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-brand hover:text-brand">{rate}×</button>
    </div>
  );
}

/* ------------------------------------------------------------------ column toggle + sort */

export type ColumnDef = { key: string; label: string; required?: boolean; sortKey?: string; align?: 'left' | 'right' };
export type SortState = { by: string; dir: 'asc' | 'desc' };

export function useColumnVisibility(pageKey: string, columns: ColumnDef[]) {
  const storageKey = `cols:${pageKey}`;
  const [hidden, setHidden] = useState<string[]>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(hidden)); }, [hidden, storageKey]);
  const isVisible = (key: string) => !hidden.includes(key) || !!columns.find((c) => c.key === key)?.required;
  const toggle = (key: string) => {
    if (columns.find((c) => c.key === key)?.required) return;
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };
  return { hidden, isVisible, toggle, setHidden };
}

export function ColumnToggleMenu({
  columns, isVisible, onToggle,
}: { columns: ColumnDef[]; isVisible: (k: string) => boolean; onToggle: (k: string) => void }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost !py-1.5" onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Columns
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-line bg-white p-1 shadow-lg">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Toggle columns</div>
          {columns.map((c) => (
            <button key={c.key} disabled={c.required} onClick={() => onToggle(c.key)} className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', c.required ? 'text-slate-300' : 'hover:bg-surface')}>
              <span className={cx('flex h-4 w-4 items-center justify-center rounded border', isVisible(c.key) ? 'border-brand bg-brand text-white' : 'border-slate-300')}>
                {isVisible(c.key) && <Check className="h-3 w-3" />}
              </span>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SortableHead({
  col, sort, onSort, children,
}: { col: ColumnDef; sort: SortState | null; onSort: (s: SortState) => void; children: ReactNode }) {
  const active = sort && col.sortKey && sort.by === col.sortKey;
  const handle = () => {
    if (!col.sortKey) return;
    if (!active) onSort({ by: col.sortKey, dir: 'desc' });
    else onSort({ by: col.sortKey, dir: sort!.dir === 'desc' ? 'asc' : 'desc' });
  };
  return (
    <th className={cx('px-3 py-2.5 font-semibold', col.align === 'right' && 'text-right')}>
      {col.sortKey ? (
        <button type="button" onClick={handle} className={cx('inline-flex items-center gap-1 transition hover:text-ink', col.align === 'right' && 'flex-row-reverse', active ? 'text-ink' : 'text-slate-500')}>
          {children}
          {active ? (sort!.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
        </button>
      ) : children}
    </th>
  );
}

/* ------------------------------------------------------------------ saved views (localStorage) */

export function SavedViews<T>({
  pageKey, current, onApply,
}: { pageKey: string; current: T; onApply: (cfg: T) => void }) {
  const storageKey = `views:${pageKey}`;
  const { open, setOpen, ref } = usePopover();
  const [views, setViews] = useState<{ name: string; cfg: T }[]>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const persist = (next: { name: string; cfg: T }[]) => { setViews(next); localStorage.setItem(storageKey, JSON.stringify(next)); };
  const save = () => {
    const name = window.prompt('Name this view:');
    if (!name) return;
    persist([...views.filter((v) => v.name !== name), { name, cfg: current }]);
    setOpen(false);
  };
  const remove = (name: string) => persist(views.filter((v) => v.name !== name));

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost !py-1.5" onClick={() => setOpen((o) => !o)}>
        <Bookmark className="h-3.5 w-3.5" /> Views{views.length ? ` (${views.length})` : ''}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-line bg-white p-1 shadow-lg">
          <button onClick={save} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-brand hover:bg-surface">
            <Plus className="h-3.5 w-3.5" /> Save current view
          </button>
          {views.length > 0 && <div className="my-1 border-t border-line" />}
          {views.map((v) => (
            <div key={v.name} className="flex items-center gap-1 rounded-md px-1 hover:bg-surface">
              <button onClick={() => { onApply(v.cfg); setOpen(false); }} className="flex-1 truncate px-1 py-1.5 text-left text-sm">{v.name}</button>
              <button onClick={() => remove(v.name)} className="rounded p-1 text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {views.length === 0 && <div className="px-2 py-2 text-center text-xs text-slate-400">No saved views yet.</div>}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------- per-column filter stack (GHL-style AND/OR) */

// One condition in the layered stack. `key` is a column key resolvable by the table's getValue.
export type FilterOp =
  | 'contains' | 'not_contains' | 'equals' | 'starts' | 'ends'
  | 'empty' | 'not_empty' | 'gt' | 'lt';
export type ColumnFilterCond = { id: string; key: string; op: FilterOp; value: string };
export type ColumnFilterState = { combinator: 'AND' | 'OR'; conds: ColumnFilterCond[] };

// Operators that need no value (a half-typed row with a value-op and empty value is treated as inactive).
const VALUELESS_OPS: FilterOp[] = ['empty', 'not_empty'];
const OP_LABEL: Record<FilterOp, string> = {
  contains: 'contains', not_contains: 'does not contain', equals: 'is exactly',
  starts: 'starts with', ends: 'ends with', empty: 'is empty', not_empty: 'is not empty',
  gt: '> (greater)', lt: '< (less)',
};
const OP_ORDER: FilterOp[] = ['contains', 'not_contains', 'equals', 'starts', 'ends', 'gt', 'lt', 'empty', 'not_empty'];

const condActive = (c: ColumnFilterCond) => !!c.key && (VALUELESS_OPS.includes(c.op) || c.value.trim() !== '');

// Evaluate one condition against a cell value produced by the table's getValue().
function evalCond(cell: string | number, c: ColumnFilterCond): boolean {
  const s = String(cell ?? '').toLowerCase();
  const v = c.value.trim().toLowerCase();
  switch (c.op) {
    case 'contains': return s.includes(v);
    case 'not_contains': return !s.includes(v);
    case 'equals': return s === v;
    case 'starts': return s.startsWith(v);
    case 'ends': return s.endsWith(v);
    case 'empty': return s === '';
    case 'not_empty': return s !== '';
    case 'gt': case 'lt': {
      const na = Number(cell), nb = Number(c.value);
      const numeric = !Number.isNaN(na) && !Number.isNaN(nb) && c.value.trim() !== '';
      const cmp = numeric ? (na - nb) : s.localeCompare(v);
      return c.op === 'gt' ? cmp > 0 : cmp < 0;
    }
    default: return true;
  }
}

// State + serializable value + a memoized predicate for a layered column-filter stack.
export function useColumnFilters<T>(getValue: (r: T, key: string) => string | number, initial?: ColumnFilterState) {
  const [combinator, setCombinator] = useState<'AND' | 'OR'>(initial?.combinator ?? 'AND');
  const [conds, setConds] = useState<ColumnFilterCond[]>(initial?.conds ?? []);
  const nextId = () => `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const add = (key = '') => setConds((cs) => [...cs, { id: nextId(), key, op: 'contains', value: '' }]);
  const update = (id: string, patch: Partial<ColumnFilterCond>) => setConds((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCond = (id: string) => setConds((cs) => cs.filter((c) => c.id !== id));
  const clear = () => setConds([]);
  const activeConds = useMemo(() => conds.filter(condActive), [conds]);
  const activeCount = activeConds.length;
  const predicate = useMemo(() => {
    if (activeConds.length === 0) return null as null | ((r: T) => boolean);
    return (r: T) => {
      const results = activeConds.map((c) => evalCond(getValue(r, c.key), c));
      return combinator === 'AND' ? results.every(Boolean) : results.some(Boolean);
    };
  }, [activeConds, combinator, getValue]);
  const apply = (s: ColumnFilterState | undefined | null) => { setCombinator(s?.combinator ?? 'AND'); setConds(s?.conds ?? []); };
  const state: ColumnFilterState = { combinator, conds };
  return { combinator, setCombinator, conds, setConds, add, update, removeCond, clear, predicate, activeCount, state, apply };
}

// Layered per-column filter UI: N stacked [column][operator][value] rows joined by AND / OR.
export function ColumnFilterStack({
  columns, ctrl,
}: { columns: ColumnDef[]; ctrl: ReturnType<typeof useColumnFilters<any>> }) {
  const { combinator, setCombinator, conds, add, update, removeCond, clear, activeCount } = ctrl;
  return (
    <div className="rounded-xl border border-line bg-surface/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Filter className="h-3.5 w-3.5" /> Column filters</span>
          {conds.length > 1 && (
            <div className="inline-flex overflow-hidden rounded-lg border border-line">
              {(['AND', 'OR'] as const).map((m) => (
                <button key={m} onClick={() => setCombinator(m)} className={cx('px-2.5 py-1 text-[11px] font-bold transition', combinator === m ? 'bg-brand text-white' : 'bg-white text-slate-500 hover:text-ink')}>{m}</button>
              ))}
            </div>
          )}
          {activeCount > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{activeCount} active</span>}
        </div>
        {conds.length > 0 && <button onClick={clear} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /> Clear all</button>}
      </div>

      {conds.length === 0 ? (
        <div className="text-xs text-slate-400">No column filters. Add one to search a specific field — stack several and combine them with AND / OR.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {conds.map((c, i) => {
            const valueless = VALUELESS_OPS.includes(c.op);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="w-9 shrink-0 text-[10px] font-bold uppercase text-slate-400">{i === 0 ? 'Where' : combinator}</span>
                <select value={c.key} onChange={(e) => update(c.id, { key: e.target.value })} className="input !py-1.5 text-sm">
                  <option value="">Select column…</option>
                  {columns.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
                </select>
                <select value={c.op} onChange={(e) => update(c.id, { op: e.target.value as FilterOp })} className="input !py-1.5 text-sm">
                  {OP_ORDER.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                </select>
                <input value={valueless ? '' : c.value} disabled={valueless} onChange={(e) => update(c.id, { value: e.target.value })} placeholder={valueless ? '—' : 'value'} className="input !py-1.5 text-sm disabled:bg-surface disabled:opacity-50" />
                <button onClick={() => removeCond(c.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => add()} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><Plus className="h-3.5 w-3.5" /> Add column filter</button>
    </div>
  );
}

/** Client-side searchable + sortable + column-toggle table state. */
export function useClientTable<T>({
  pageKey, columns, rows, getValue, initialSort, rowFilter,
}: {
  pageKey: string; columns: ColumnDef[]; rows: T[];
  getValue: (r: T, key: string) => string | number; initialSort?: SortState;
  rowFilter?: ((r: T) => boolean) | null;
}) {
  const { isVisible, toggle } = useColumnVisibility(pageKey, columns);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const searchKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = rowFilter ? rows.filter(rowFilter) : rows;
    if (!q) return base;
    return base.filter((r) => searchKeys.some((k) => String(getValue(r, k) ?? '').toLowerCase().includes(q)));
  }, [rows, search, searchKeys, getValue, rowFilter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = getValue(a, sort.by); const bv = getValue(b, sort.by);
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.dir === 'desc' ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sort, getValue]);

  return { rows: sorted, search, setSearch, sort, setSort, isVisible, toggle };
}
