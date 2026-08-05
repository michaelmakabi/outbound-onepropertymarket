import { useEffect, useState } from 'react';
import { opm } from '../lib/api';
import { X, Plus, Trash2, Loader2, GripVertical } from 'lucide-react';

const TYPES = [
  { v: 'text', label: 'Text' }, { v: 'number', label: 'Number' }, { v: 'date', label: 'Date' },
  { v: 'select', label: 'Dropdown' }, { v: 'bool', label: 'Yes / No' },
];

// Per-workspace custom field manager. Fields attach to leads (properties) or contacts and
// then render as searchable columns. Owner/staff only (enforced server-side too).
export default function CustomFieldsModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>({ entity: 'lead', label: '', field_type: 'text', options: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => opm.customFields().then((d: any) => setFields(d.fields || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const add = async () => {
    setErr(''); if (!draft.label.trim()) { setErr('Field name is required.'); return; }
    setBusy(true);
    try {
      await opm.saveCustomField({
        entity: draft.entity, label: draft.label.trim(),
        field_key: draft.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        field_type: draft.field_type,
        options: draft.field_type === 'select' ? draft.options.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        sort_order: fields.length,
      });
      setDraft({ entity: 'lead', label: '', field_type: 'text', options: '' });
      await load(); onChanged?.();
    } catch (e: any) { setErr(e?.message || 'Could not save field.'); } finally { setBusy(false); }
  };

  const remove = async (id: number) => { await opm.deleteCustomField(id); await load(); onChanged?.(); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">Custom fields</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">Add fields unique to this workspace. They appear as columns you can search, sort, and filter by, and are captured on import.</p>

        {loading ? <div className="py-6 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (
          <div className="mb-4 space-y-1.5">
            {fields.length === 0 && <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-slate-400">No custom fields yet.</div>}
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <GripVertical className="h-3.5 w-3.5 text-slate-300" />
                <span className="font-semibold text-ink">{f.label}</span>
                <span className="font-mono text-[10px] text-slate-400">{f.field_key}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{f.entity === 'contact' ? 'Contact' : 'Property'}</span>
                <span className="rounded bg-brand-light/60 px-1.5 py-0.5 text-[10px] font-semibold text-brand">{TYPES.find((t) => t.v === f.field_type)?.label || f.field_type}</span>
                <button className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500" onClick={() => remove(f.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Add a field</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1"><span className="label mb-1 block">Field name</span><input className="input w-full" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Motivation" /></label>
            <label><span className="label mb-1 block">Attach to</span>
              <select className="input" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })}><option value="lead">Property</option><option value="contact">Contact</option></select></label>
            <label><span className="label mb-1 block">Type</span>
              <select className="input" value={draft.field_type} onChange={(e) => setDraft({ ...draft, field_type: e.target.value })}>{TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></label>
          </div>
          {draft.field_type === 'select' && <input className="input mt-2 w-full" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder="Comma-separated options: Hot, Warm, Cold" />}
          <button className="btn-primary mt-3" disabled={busy || !draft.label.trim()} onClick={add}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add field</>}</button>
        </div>
      </div>
    </div>
  );
}
