// Reusable dashboard toolkit for One Property Market — Outbound.
// Ported in spirit from retell-command-center's shadcn components, rebuilt in plain Tailwind.
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, LucideIcon, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown,
  Search, Check, X, RefreshCw, Bookmark, Plus,
} from 'lucide-react';
import { useFilters, RangePreset } from '../lib/filters';

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
  const { preset, setPreset } = useFilters();
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-white p-0.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => setPreset(p.key)}
          className={cx(
            'rounded-md px-3 py-1.5 text-xs font-semibold transition',
            preset === p.key ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface',
          )}
        >
          {p.label}
        </button>
      ))}
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

export function WorkspaceSelect({
  workspaces, value, onChange,
}: { workspaces: { slug: string; display_name: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input w-auto min-w-[200px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All workspaces (global)</option>
      {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
    </select>
  );
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

/** Client-side searchable + sortable + column-toggle table state. */
export function useClientTable<T>({
  pageKey, columns, rows, getValue, initialSort,
}: {
  pageKey: string; columns: ColumnDef[]; rows: T[];
  getValue: (r: T, key: string) => string | number; initialSort?: SortState;
}) {
  const { isVisible, toggle } = useColumnVisibility(pageKey, columns);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const searchKeys = useMemo(() => columns.map((c) => c.key), [columns]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchKeys.some((k) => String(getValue(r, k) ?? '').toLowerCase().includes(q)));
  }, [rows, search, searchKeys, getValue]);

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
