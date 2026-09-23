import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search, type SearchHit } from '../lib/api';
import { Search, X, User, PhoneCall, GitBranch, Home, FileText, CalendarClock, Loader2 } from 'lucide-react';

// Universal type-ahead search across the active workspace: contacts, calls, pipelines, properties,
// contracts (LOIs) and appointments. Debounced; results grouped; each row deep-links to its record.
type Group = { key: string; label: string; icon: any; href: (h: SearchHit) => string };
const GROUPS: Group[] = [
  { key: 'contacts', label: 'Contacts', icon: User, href: (h) => `/leads/${encodeURIComponent(h.id)}` },
  { key: 'calls', label: 'Calls', icon: PhoneCall, href: (h) => `/calls/${encodeURIComponent(h.id)}` },
  { key: 'pipelines', label: 'Pipelines', icon: GitBranch, href: () => `/pipelines` },
  { key: 'properties', label: 'Properties', icon: Home, href: (h) => `/properties/${encodeURIComponent(h.id)}` },
  { key: 'contracts', label: 'Contracts / LOIs', icon: FileText, href: (h) => (h.lead_id ? `/leads/${encodeURIComponent(h.lead_id)}` : `/leads`) },
  { key: 'appointments', label: 'Appointments', icon: CalendarClock, href: () => `/calendar` },
];

export default function GlobalSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Record<string, SearchHit[]>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes({}); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      search.global(term).then((d) => { setRes(d.results || {}); setOpen(true); }).catch(() => setRes({})).finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click; focus with "/".
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); inputRef.current?.focus(); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  const total = useMemo(() => GROUPS.reduce((n, g) => n + ((res[g.key] || []).length), 0), [res]);
  const go = (href: string) => { setOpen(false); setQ(''); setRes({}); nav(href); };

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-sm focus-within:border-brand">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (total > 0) setOpen(true); }}
          placeholder="Search contacts, calls, pipelines, contracts&hellip;  ( / )"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
        />
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />}
        {!busy && q && <button onClick={() => { setQ(''); setRes({}); setOpen(false); }} className="shrink-0 rounded p-0.5 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1.5 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-xl">
          {total === 0 && !busy && <div className="px-3 py-6 text-center text-sm text-slate-400">No matches for &ldquo;{q.trim()}&rdquo;</div>}
          {GROUPS.map((g) => {
            const hits = res[g.key] || [];
            if (!hits.length) return null;
            const Icon = g.icon;
            return (
              <div key={g.key} className="mb-1 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
                {hits.map((h) => (
                  <button key={g.key + h.id} onClick={() => go(g.href(h))}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{h.title}</span>
                      {h.sub && <span className="block truncate text-xs text-slate-400">{h.sub}</span>}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
