import { useEffect, useRef, useState } from 'react';
import { opm } from '../lib/api';
import { ListFilter, Plus, Trash2, Share2, Lock, Check, Loader2, X } from 'lucide-react';

// Server-backed, shareable saved views ("smart lists"). Unlike the localStorage SavedViews,
// these live per-workspace and can be shared with everyone who has access to the workspace.
export default function SmartLists<T extends object>({ page, current, onApply }: {
  page: string;
  current: T;
  onApply: (cfg: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(true);
  const [appliedId, setAppliedId] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => { setLoading(true); opm.savedLists(page).then((d: any) => setLists(d.lists || [])).catch(() => setLists([])).finally(() => setLoading(false)); };
  useEffect(() => { if (open) load(); }, [open, page]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try { await opm.saveList({ page, name: name.trim(), config: current, shared }); setName(''); load(); }
    catch (e) { /* surfaced by empty list */ } finally { setSaving(false); }
  };
  const remove = async (id: number) => { await opm.deleteList(id); load(); };
  const apply = (l: any) => { onApply(l.config as T); setAppliedId(l.id); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface" onClick={() => setOpen((o) => !o)}>
        <ListFilter className="h-3.5 w-3.5" /> Smart lists{lists.length ? ` (${lists.length})` : ''}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-line bg-white p-2 shadow-xl">
          <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Shared smart lists</div>
          {loading ? <div className="py-4 text-center text-slate-400"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div> : (
            <div className="mb-2 max-h-60 space-y-0.5 overflow-y-auto">
              {lists.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-slate-400">No saved lists yet.</div>}
              {lists.map((l) => (
                <div key={l.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface ${appliedId === l.id ? 'bg-brand-light/40' : ''}`}>
                  <button className="flex flex-1 items-center gap-1.5 text-left" onClick={() => apply(l)}>
                    {appliedId === l.id ? <Check className="h-3.5 w-3.5 text-brand" /> : (l.shared ? <Share2 className="h-3.5 w-3.5 text-slate-400" /> : <Lock className="h-3.5 w-3.5 text-slate-400" />)}
                    <span className="font-medium text-ink">{l.name}</span>
                    {!l.mine && <span className="rounded bg-surface px-1 py-0.5 text-[9px] font-semibold text-slate-400">shared</span>}
                  </button>
                  {l.can_edit && <button className="rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100" onClick={() => remove(l.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-line bg-surface p-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <input className="input flex-1 !py-1 text-sm" placeholder="Save current view as…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
              {name && <button className="rounded p-1 text-slate-400 hover:bg-white" onClick={() => setName('')}><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-3 w-3 accent-[#1f6feb]" /> Share with workspace</label>
              <button className="btn-primary !py-1 !px-2.5 text-xs" disabled={saving || !name.trim()} onClick={save}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5" /> Save</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
