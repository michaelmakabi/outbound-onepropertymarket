import { useEffect, useMemo, useState } from 'react';
import { opm } from '../lib/api';
import { X, Search, Tag, Pencil, Trash2, Check, Loader2, Lock, AlertCircle } from 'lucide-react';

type TagRow = { tag: string; cnt: number };

// Manage the workspace's tag vocabulary in one place: rename (edit) and delete tags across every
// record + saved list at once. Permissions are enforced server-side and reflected here — editing
// needs owner/admin/manager, deleting needs owner/admin (platform staff can do both).
export default function TagManagerModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true); setErr('');
    opm.tagsList()
      .then((d: any) => { setRows(Array.isArray(d.tags) ? d.tags : []); setCanEdit(!!d.can_edit); setCanDelete(!!d.can_delete); })
      .catch((e: any) => setErr(e?.message || 'Could not load tags.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => r.tag.toLowerCase().includes(s)) : rows;
  }, [rows, q]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };

  const startEdit = (tag: string) => { setEditing(tag); setDraft(tag); setErr(''); };

  const saveRename = async (from: string) => {
    const to = draft.trim();
    if (!to || to === from) { setEditing(null); return; }
    setBusy('rename:' + from); setErr('');
    try {
      const r: any = await opm.tagRename(from, to);
      flash(`Renamed "${from}" → "${to}" on ${Number(r.updated || 0).toLocaleString()} record${r.updated === 1 ? '' : 's'}.`);
      setEditing(null);
      load(); onChanged?.();
    } catch (e: any) { setErr(e?.message || 'Rename failed.'); } finally { setBusy(''); }
  };

  const del = async (tag: string) => {
    if (!window.confirm(`Delete the tag "${tag}" from every record and saved list in this workspace? This cannot be undone.`)) return;
    setBusy('del:' + tag); setErr('');
    try {
      const r: any = await opm.tagDelete(tag);
      flash(`Deleted "${tag}" from ${Number(r.removed_from || 0).toLocaleString()} record${r.removed_from === 1 ? '' : 's'}.`);
      load(); onChanged?.();
    } catch (e: any) { setErr(e?.message || 'Delete failed.'); } finally { setBusy(''); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card flex max-h-[88vh] w-full max-w-lg flex-col p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><Tag className="h-5 w-5 text-brand" /> Manage tags</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>

        <div className="border-b border-line px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tags…" className="input w-full !py-2 pl-9 text-sm" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {canEdit ? 'Rename a tag to update it everywhere it appears.' : <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> You can view tags but not edit them.</span>}
            {canDelete ? ' Deleting removes it from every record.' : ''}
          </p>
        </div>

        {err && <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"><AlertCircle className="h-4 w-4 shrink-0" /> {err}</div>}
        {toast && <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Check className="h-4 w-4 shrink-0" /> {toast}</div>}

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading tags…</div>
          ) : shown.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">{q ? 'No tags match your search.' : 'No tags in this workspace yet.'}</div>
          ) : (
            <div className="divide-y divide-line">
              {shown.map((r) => {
                const isEditing = editing === r.tag;
                const rowBusy = busy === 'rename:' + r.tag || busy === 'del:' + r.tag;
                return (
                  <div key={r.tag} className="flex items-center gap-2 px-2 py-2">
                    {isEditing ? (
                      <>
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveRename(r.tag); if (e.key === 'Escape') setEditing(null); }}
                          className="input flex-1 !py-1.5 text-sm" />
                        <button disabled={rowBusy} onClick={() => saveRename(r.tag)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50">{rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save</button>
                        <button disabled={rowBusy} onClick={() => setEditing(null)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-surface">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm text-ink"><span className="rounded bg-surface px-2 py-0.5 font-medium">{r.tag}</span></span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-400">{Number(r.cnt).toLocaleString()}</span>
                        {canEdit && <button title="Rename tag" disabled={rowBusy} onClick={() => startEdit(r.tag)} className="rounded-lg p-1.5 text-slate-400 hover:bg-surface hover:text-brand disabled:opacity-50"><Pencil className="h-4 w-4" /></button>}
                        {canDelete && <button title="Delete tag" disabled={rowBusy} onClick={() => del(r.tag)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">{busy === 'del:' + r.tag ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-slate-500">
          <span>{loading ? '' : `${rows.length.toLocaleString()} tag${rows.length === 1 ? '' : 's'}`}</span>
          <button onClick={onClose} className="btn-ghost !py-1.5">Done</button>
        </div>
      </div>
    </div>
  );
}
