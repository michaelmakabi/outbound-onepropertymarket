// Calendar / Booked Appointments. Shows appointments booked by the AI voice agents (via agent-live)
// and lets the team add / edit / cancel them by hand. First-party for now; a two-way email + calendar
// sync can plug in later. Scoped to the active workspace.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { calendar, Appointment } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, SlideOver } from '../components/dash';
import {
  CalendarDays, Plus, Clock, User, Phone, Mail, MapPin, Bot, Loader2, Save, Trash2,
  CheckCircle2, X, ExternalLink, StickyNote,
} from 'lucide-react';

const STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-slate-200 text-slate-500 line-through',
  no_show: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = { scheduled: 'Scheduled', completed: 'Completed', canceled: 'Canceled', no_show: 'No-show' };

// Format an ISO datetime for a datetime-local input (in the viewer's local time).
function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dayKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtDayHeading(iso: string) {
  const d = new Date(iso); const today = new Date(); const tmr = new Date(Date.now() + 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const rel = same(d, today) ? 'Today - ' : same(d, tmr) ? 'Tomorrow - ' : '';
  return rel + d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function fmtTime(iso?: string | null) { if (!iso) return ''; return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

const BLANK: Appointment = { starts_at: '', title: '', contact_name: '', phone: '', email: '', notes: '', status: 'scheduled' };

export default function Calendar() {
  const { active } = useWorkspace();
  const nav = useNavigate();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    calendar.list({}).then((d) => setAppts(d.appointments || [])).catch(() => setAppts([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load, active]);

  const now = Date.now();
  const filtered = useMemo(() => {
    let rows = appts.slice();
    if (range === 'upcoming') rows = rows.filter((a) => a.status !== 'canceled' && new Date(a.ends_at || a.starts_at).getTime() >= now - 3600000);
    else if (range === 'past') rows = rows.filter((a) => new Date(a.ends_at || a.starts_at).getTime() < now);
    rows.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    if (range === 'past') rows.reverse();
    return rows;
  }, [appts, range, now]);

  const grouped = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of filtered) { const k = dayKey(a.starts_at); (map[k] = map[k] || []).push(a); }
    return Object.entries(map);
  }, [filtered]);

  const kpis = useMemo(() => {
    const up = appts.filter((a) => a.status === 'scheduled' && new Date(a.starts_at).getTime() >= now);
    const byAi = appts.filter((a) => a.source === 'ai_agent').length;
    const wk = up.filter((a) => new Date(a.starts_at).getTime() < now + 7 * 86400000).length;
    return { upcoming: up.length, thisWeek: wk, byAi };
  }, [appts, now]);

  const openNew = () => { setErr(''); setEditing({ ...BLANK, starts_at: new Date(Date.now() + 3600000).toISOString() }); };
  const openEdit = (a: Appointment) => { setErr(''); setEditing({ ...a }); };

  const save = async () => {
    if (!editing) return;
    if (!editing.starts_at) { setErr('Pick a date and time.'); return; }
    setSaving(true); setErr('');
    try {
      const body: any = {
        id: editing.id, starts_at: editing.starts_at, ends_at: editing.ends_at || null,
        title: editing.title || null, contact_name: editing.contact_name || null,
        phone: editing.phone || null, email: editing.email || null, notes: editing.notes || null,
        lead_id: editing.lead_id || null, status: editing.status || 'scheduled',
      };
      await calendar.save(body);
      setEditing(null); load();
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setSaving(false); }
  };
  const cancel = async (a: Appointment) => {
    if (!a.id) return;
    setSaving(true);
    try { await calendar.cancel(a.id); setEditing(null); load(); }
    catch (e: any) { setErr(String(e?.message || e)); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="Calendar" showDate={false}
        description="Appointments booked by your AI agents and your team."
        actions={<button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-brand/90"><Plus className="h-4 w-4" /> New appointment</button>} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Upcoming" value={String(kpis.upcoming)} icon={CalendarDays} />
        <KpiCard label="Next 7 days" value={String(kpis.thisWeek)} icon={Clock} />
        <KpiCard label="Booked by AI" value={String(kpis.byAi)} icon={Bot} />
      </div>

      <SectionCard title="Appointments" action={
        <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 text-xs font-semibold">
          {(['upcoming', 'past', 'all'] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 capitalize transition ${range === r ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:bg-surface'}`}>{r}</button>
          ))}
        </div>
      }>
        {loading ? <LoadingBlock label="Loading appointments..." /> : grouped.length === 0 ? (
          <EmptyState text={range === 'upcoming' ? 'No upcoming appointments yet. When an AI agent books one, it shows up here.' : 'No appointments in this view.'} />
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(([k, rows]) => (
              <div key={k}>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><CalendarDays className="h-4 w-4 text-brand" /> {fmtDayHeading(rows[0].starts_at)} <span className="text-xs font-normal text-slate-400">- {rows.length}</span></div>
                <div className="flex flex-col gap-2">
                  {rows.map((a) => (
                    <button key={a.id} onClick={() => openEdit(a)} className="group flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 text-left transition hover:border-brand/40 hover:bg-surface">
                      <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-brand-light/40 px-2 py-1.5 text-brand">
                        <span className="text-sm font-extrabold leading-tight">{fmtTime(a.starts_at)}</span>
                        {a.ends_at && <span className="text-[10px] text-slate-400">{fmtTime(a.ends_at)}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-ink">{a.title || 'Appointment'}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[a.status || 'scheduled'] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[a.status || 'scheduled'] || a.status}</span>
                          {a.source === 'ai_agent' && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><Bot className="h-3 w-3" /> AI</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          {a.contact_name && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {a.contact_name}</span>}
                          {a.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {a.phone}</span>}
                          {a.notes && <span className="inline-flex items-center gap-1 truncate"><StickyNote className="h-3 w-3" /> {a.notes}</span>}
                        </div>
                      </div>
                      {a.lead_id && <span onClick={(e) => { e.stopPropagation(); nav(`/leads/${a.lead_id}`); }} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-brand-light hover:text-brand" title="Open lead"><ExternalLink className="h-4 w-4" /></span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SlideOver open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit appointment' : 'New appointment'} icon={CalendarDays}
        footer={editing ? (
          <div className="flex items-center justify-between gap-2">
            {editing.id ? <button onClick={() => cancel(editing)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-slate-500 hover:border-red-300 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Cancel appt</button> : <span />}
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
          </div>
        ) : undefined}>
        {editing && (
          <div className="flex flex-col gap-4">
            {err && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{err}</div>}
            {editing.source === 'ai_agent' && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><Bot className="h-4 w-4" /> Booked by an AI agent{editing.call_id ? ' on a call' : ''}.</div>}
            <Field label="Title" icon={CalendarDays}><input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Listing appointment - 123 Main St" className="fld" /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts" icon={Clock}><input type="datetime-local" value={toLocalInput(editing.starts_at)} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="fld" /></Field>
              <Field label="Ends" icon={Clock}><input type="datetime-local" value={toLocalInput(editing.ends_at)} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="fld" /></Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contact name" icon={User}><input value={editing.contact_name || ''} onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })} className="fld" /></Field>
              <Field label="Status" icon={CheckCircle2}>
                <select value={editing.status || 'scheduled'} onChange={(e) => setEditing({ ...editing, status: e.target.value as any })} className="fld">
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="no_show">No-show</option>
                  <option value="canceled">Canceled</option>
                </select>
              </Field>
              <Field label="Phone" icon={Phone}><input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="fld" /></Field>
              <Field label="Email" icon={Mail}><input value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="fld" /></Field>
            </div>
            <Field label="Notes" icon={StickyNote}><textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={4} className="fld resize-y" /></Field>
          </div>
        )}
      </SlideOver>

      <style>{`.fld{width:100%;border:1px solid var(--line,#e5e7eb);border-radius:0.75rem;background:#fff;padding:0.6rem 0.85rem;font-size:0.9rem;outline:none}.fld:focus{border-color:#1f6feb;box-shadow:0 0 0 2px rgba(31,111,235,.15)}`}</style>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: any }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}{label}</span>
      {children}
    </label>
  );
}
