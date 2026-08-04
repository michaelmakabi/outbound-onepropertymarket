import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { opm } from '../lib/api';
import { LoadingBlock, EmptyState } from '../components/dash';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Star, BadgeCheck, Phone, Smartphone,
  Sparkles, PenLine, Mail, MessageSquare, PhoneCall, User, DollarSign, GitBranch, Tag, Bot, Check, X, Loader2,
} from 'lucide-react';

const DIAL_AGENT = { id: 'agent_ee77a9e3c659964acc19d0be54', name: 'Adrian B (Aggressive) · OUTBOUND' };
const DIAL_NUMBERS = [
  { v: '+17184070959', label: 'Adrian NYC 1 · (718) 407-0959' },
  { v: '+13475727425', label: 'Adrian NYC 2 · (347) 572-7425' },
  { v: '+19295127448', label: 'Adrian NYC 3 · (929) 512-7448' },
  { v: '+17862446185', label: 'Adrian Miami 3 · (786) 244-6185' },
  { v: '+17868827159', label: 'Adrian Miami 4 · (786) 882-7159' },
  { v: '+19544668132', label: 'Adrian · (954) 466-8132' },
];

function fmtNum(n: string) {
  const d = (n || '').replace(/\D/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}
const money = (n: any) => (n ? `$${Number(n).toLocaleString('en-US')}` : '—');

function cleanNote(raw: string): string {
  if (!raw) return '';
  let s = raw;
  try { const ta = document.createElement('textarea'); ta.innerHTML = s; s = ta.value; ta.innerHTML = s; s = ta.value; } catch {}
  s = s.replace(/<span[^>]*data-user-id=[^>]*>(.*?)<\/span>/gi, '@$1');
  s = s.replace(/<hr\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').replace(/^[\s\n]+|[\s\n]+$/g, '');
  return s;
}
function noteTime(n: any): number {
  if (n.ts) { const t = new Date(n.ts).getTime(); if (!isNaN(t)) return t; }
  const m = String(n.note_date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]).getTime();
  return (n.id || 0) * 1000;
}
const PARCEL_LABELS: Record<string, string> = {
  bbl: 'BBL', 'bldg sqft': 'Building SF', 'lot sqft': 'Lot SF', 'bldg front': 'Bldg Front', 'bldg depth': 'Bldg Depth',
  'lot front': 'Lot Front', 'lot depth': 'Lot Depth', neighborhood: 'Neighborhood', 'residential units': 'Res Units',
  'commercial units': 'Comm Units', stories: 'Stories', 'zoning districts': 'Zoning', 'tax class': 'Tax Class',
  'unused far': 'Unused FAR', 'corner lot': 'Corner Lot', 'main address': 'Parcel Address', 'vacant status': 'Vacant', borough: 'Borough',
};
const SOURCE_STYLE: Record<string, string> = {
  call: 'bg-sky-100 text-sky-700', email: 'bg-violet-100 text-violet-700', text: 'bg-emerald-100 text-emerald-700',
  ai: 'bg-fuchsia-100 text-fuchsia-700',
};
const COMPOSE_TABS = [
  { k: 'note', label: 'Note', icon: PenLine },
  { k: 'email', label: 'Email', icon: Mail },
  { k: 'text', label: 'Text', icon: MessageSquare },
  { k: 'call', label: 'Log Call', icon: PhoneCall },
] as const;
const CALL_OUTCOMES = ['Connected', 'No Answer', 'Voicemail', 'Callback Scheduled', 'Wrong Number', 'Not Interested'];

export default function LeadDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'activity' | 'notes' | 'calls' | 'property'>('activity');
  const [ids, setIds] = useState<string[]>((location.state as any)?.ids || []);
  const [toast, setToast] = useState('');

  const [mode, setMode] = useState<'note' | 'email' | 'text' | 'call'>('note');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  // AI call launcher
  const [callOpen, setCallOpen] = useState(false);
  const [callFrom, setCallFrom] = useState(DIAL_NUMBERS[0].v);
  const [callTo, setCallTo] = useState('');
  const [calling, setCalling] = useState(false);

  const load = () => { setLoading(true); opm.lead(id).then(setData).finally(() => setLoading(false)); };
  useEffect(load, [id]);
  useEffect(() => { if (!ids.length) opm.leads({}).then((d) => setIds((d.leads || []).map((l: any) => l.lead_id))).catch(() => {}); }, []);

  const idx = ids.indexOf(id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;
  const goto = (t: string | null) => { if (t) nav(`/leads/${encodeURIComponent(t)}`, { state: { ids } }); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === 'TEXTAREA' || t === 'INPUT' || t === 'SELECT') return;
      if (e.key === 'ArrowLeft') goto(prevId);
      if (e.key === 'ArrowRight') goto(nextId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevId, nextId, ids]);

  const lead = data?.lead;
  const contacts: any[] = data?.contacts || [];
  const rawNotes: any[] = data?.notes || [];
  const calls: any[] = data?.calls || [];
  // newest first
  const notes = useMemo(() => [...rawNotes].sort((a, b) => noteTime(b) - noteTime(a)), [rawNotes]);
  const owners = contacts.filter((c) => c.contact_kind !== 'relative');
  const relatives = contacts.filter((c) => c.contact_kind === 'relative');
  const parcel = lead?.parcel || {};

  async function patch(contact_id: string, b: any) {
    setData((d: any) => ({ ...d, contacts: d.contacts.map((c: any) => c.contact_id === contact_id ? { ...c, ...b } : (b.is_primary_number ? { ...c, is_primary_number: false } : c)) }));
    await opm.updateContact({ contact_id, lead_id: id, ...b }).catch(() => load());
  }
  async function saveActivity() {
    const srcMap: Record<string, string> = { note: 'manual', email: 'email', text: 'text', call: 'call' };
    let text = body.trim();
    if (mode === 'call') { if (!callOutcome) return; text = `☎ ${callOutcome}${text ? ` — ${text}` : ''}`; }
    else if (mode === 'email') { if (!text && !subject.trim()) return; text = `✉ ${subject ? `${subject}: ` : ''}${text}`; }
    else if (mode === 'text') { if (!text) return; text = `💬 ${text}`; }
    if (!text) return;
    setSaving(true);
    await opm.addNote({ lead_id: id, text, html: text.replace(/\n/g, '<br>'), source: srcMap[mode] }).catch(() => {});
    setBody(''); setSubject(''); setCallOutcome(''); setSaving(false); setTab('activity'); load();
  }
  async function aiNote() {
    if (!body.trim()) return;
    setSaving(true);
    await opm.addNote({ lead_id: id, text: `✨ ${body}`, html: `✨ ${body}`.replace(/\n/g, '<br>'), source: 'ai' }).catch(() => {});
    setBody(''); setSaving(false); setTab('activity'); load();
  }
  function aiCallBrief() {
    const primary = contacts.find((c) => c.is_primary_number) || contacts[0];
    const addr = lead.addresses?.[0];
    const brief = [
      `SELLER: ${lead.name}`,
      `PROPERTY: ${lead.property_ref || '—'}${addr ? `  |  ${addr.Street}, ${addr.City} ${addr.State} ${addr.Zip}` : ''}`,
      `PIPELINE/STAGE: ${lead.pipeline_name || 'Pitman'} · ${lead.stage_name || lead.crm_stage || '—'}`,
      `OUR VALUE: ${money(lead.deal_price)}`,
      `PRIMARY #: ${primary ? fmtNum(primary.phone) : '—'} (${primary?.phone_channel || 'unknown'})`,
      `PARCEL: ${Object.entries(parcel).filter(([k, v]) => v && k !== 'lat long' && k !== 'is related').map(([k, v]) => `${PARCEL_LABELS[k] || k} ${v}`).join(' · ')}`,
      '',
      'CALL HISTORY / NOTES (newest first):',
      ...notes.slice(0, 12).map((n) => `• [${n.note_date || ''}] ${n.author || 'System'}: ${cleanNote(n.body_html || n.body_text || '').replace(/\n/g, ' ')}`),
    ].join('\n');
    try { navigator.clipboard.writeText(brief); } catch {}
    setToast('AI call brief copied — this context is what the voice agent ingests on dial.');
    setTimeout(() => setToast(''), 4000);
  }
  function openCallModal() {
    const primary = contacts.find((c) => c.is_primary_number) || contacts[0];
    setCallTo(primary ? primary.phone : '');
    setCallOpen(true);
  }
  async function launchCall() {
    if (!callTo || !callFrom) return;
    setCalling(true);
    try {
      const r = await opm.placeCall({ lead_id: id, to_number: callTo, from_number: callFrom, agent_id: DIAL_AGENT.id, workspace: '1propertymarket' });
      setCallOpen(false);
      setToast(r.call_id ? `AI call launched to ${fmtNum(callTo)} — Adrian is dialing now.` : 'Call request sent.');
      setTimeout(() => setToast(''), 5000);
      load();
    } catch (e: any) {
      setToast('Call failed: ' + (e?.message || 'error'));
      setTimeout(() => setToast(''), 6000);
    } finally { setCalling(false); }
  }

  if (loading) return <div className="mx-auto max-w-[1400px]"><LoadingBlock label="Loading lead…" /></div>;
  if (!lead) return <EmptyState text="Lead not found." />;

  const initials = (lead.name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('');
  const verifiedN = contacts.filter((c) => c.phone_verified).length;
  const parcelEntries = Object.entries(parcel).filter(([k, v]) => k !== 'is related' && k !== 'lat long' && v !== '' && v != null);
  const TABS = [
    { k: 'activity', label: 'Activity', n: notes.length },
    { k: 'notes', label: 'Notes', n: null },
    { k: 'calls', label: 'Calls', n: calls.length },
    { k: 'property', label: 'Property & Details', n: null },
  ] as const;
  const activityList = tab === 'notes' ? notes.filter((n) => n.source !== 'call') : notes;

  return (
    <div className="mx-auto max-w-[1400px] text-sm">
      {/* top bar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={() => nav('/leads', { state: { ids } })} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-brand"><ArrowLeft className="h-4 w-4" /> All leads</button>
        <div className="flex items-center gap-2">
          {idx >= 0 && ids.length > 0 && <span className="text-xs tabular-nums text-slate-400">{idx + 1} of {ids.length}</span>}
          <button onClick={() => goto(prevId)} disabled={!prevId} title="Previous (←)" className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
          <button onClick={() => goto(nextId)} disabled={!nextId} title="Next (→)" className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition enabled:hover:border-brand enabled:hover:text-brand disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* identity + deal strip */}
      <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-base font-extrabold text-brand">{initials}</div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold leading-tight text-ink">{lead.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="pill bg-brand/10 text-brand">{lead.stage_name || lead.crm_stage || '—'}</span>
              <span className="text-xs text-slate-400">{lead.pipeline_name || 'Pitman Seller Pipeline'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={DollarSign} label="Our Value" value={money(lead.deal_price)} />
            <Stat icon={GitBranch} label="Source" value={lead.lead_source || '—'} />
            <Stat icon={User} label="Assigned" value={lead.assigned_to || '—'} />
            <Stat icon={Phone} label="Numbers" value={`${contacts.length} · ${verifiedN}✓`} />
          </div>
          <button onClick={openCallModal} title="Launch a live AI voice call to this lead" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:brightness-125"><Bot className="h-4 w-4" /> AI Call</button>
        </div>
      </div>

      {toast && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><Check className="h-4 w-4" /> {toast}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* LEFT column — dialing essentials only */}
        <div className="space-y-4">
          <Card title="Phone Numbers" count={owners.length}>
            <div className="space-y-2">{owners.map((c) => <PhoneRow key={c.contact_id} c={c} onPatch={patch} />)}</div>
            {lead.emails?.[0]?.email && <div className="mt-3 flex items-center gap-1.5 text-sm text-brand"><Mail className="h-3.5 w-3.5" /> {lead.emails[0].email}</div>}
            {lead.addresses?.[0] && <div className="mt-1 text-xs text-slate-500">{lead.addresses[0].Street}, {lead.addresses[0].City} {lead.addresses[0].State} {lead.addresses[0].Zip}</div>}
          </Card>

          {relatives.length > 0 && (
            <Card title="Relationships" count={relatives.length}>
              <div className="space-y-2">{relatives.map((c) => <PhoneRow key={c.contact_id} c={c} onPatch={patch} showRel />)}</div>
            </Card>
          )}

          <Card title="Details">
            <dl>
              <Row k="Stage" v={<span className="pill bg-brand/10 text-brand">{lead.stage_name || lead.crm_stage || '—'}</span>} />
              <Row k="Pipeline" v={lead.pipeline_name || '—'} />
              <Row k="Assigned" v={lead.assigned_to || '—'} />
              <Row k="Our Value" v={money(lead.deal_price)} />
              <Row k="Property" v={lead.property_ref || '—'} />
              <Row k="Source" v={lead.lead_source || '—'} />
            </dl>
            <button onClick={() => setTab('property')} className="mt-2 text-xs font-semibold text-brand hover:underline">View all property & parcel data →</button>
          </Card>
        </div>

        {/* RIGHT column */}
        <div className="space-y-4">
          {/* composer */}
          <div className="rounded-2xl border border-line bg-white">
            <div className="flex items-center gap-1 border-b border-line px-2 pt-2">
              {COMPOSE_TABS.map((t) => (
                <button key={t.k} onClick={() => setMode(t.k)} className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-semibold transition ${mode === t.k ? 'bg-brand/5 text-brand' : 'text-slate-500 hover:text-ink'}`}>
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
            <div className="space-y-2 p-3">
              {mode === 'email' && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="input w-full text-sm" />}
              {mode === 'call' && (
                <div className="flex flex-wrap gap-1.5">
                  {CALL_OUTCOMES.map((o) => <button key={o} onClick={() => setCallOutcome(o)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${callOutcome === o ? 'border-brand bg-brand text-white' : 'border-line text-slate-600 hover:border-brand'}`}>{o}</button>)}
                </div>
              )}
              <textarea value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={mode === 'note' ? 'Add a note… (saved with your name + timestamp)' : mode === 'email' ? 'Email body — logged to the timeline' : mode === 'text' ? 'Text message — logged to the timeline' : 'Call notes (optional)'}
                className="input min-h-[80px] w-full resize-y text-sm" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{mode === 'note' ? 'Saved as a note' : mode === 'call' ? 'Logs a call activity' : `Logs ${mode === 'email' ? 'an email' : 'a text'} touch`}</span>
                <div className="flex gap-2">
                  {mode === 'note' && <button onClick={aiNote} disabled={saving || !body.trim()} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> AI Note</button>}
                  <button onClick={saveActivity} disabled={saving} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{saving ? 'Saving…' : COMPOSE_TABS.find((t) => t.k === mode)!.label}</button>
                </div>
              </div>
            </div>
          </div>

          {/* tabbed panel */}
          <div className="rounded-2xl border border-line bg-white">
            <div className="flex items-center gap-1 border-b border-line px-2 pt-1">
              {TABS.map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-t-lg px-3 py-2.5 text-sm font-semibold transition ${tab === t.k ? 'border-b-2 border-brand text-ink' : 'text-slate-500 hover:text-ink'}`}>
                  {t.label}{t.n != null && <span className="ml-1 text-xs text-slate-400">{t.n}</span>}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'property' ? (
                parcelEntries.length === 0 ? <EmptyState text="No property data on this lead." /> : (
                  <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                    {parcelEntries.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2 text-sm">
                        <span className="text-slate-500">{PARCEL_LABELS[k] || k}</span>
                        <span className="text-right font-medium text-ink">{String(v)}</span>
                      </div>
                    ))}
                  </dl>
                )
              ) : tab === 'calls' ? (
                calls.length === 0 ? <EmptyState text="No dialer calls matched to this lead's numbers yet." /> :
                <ol className="space-y-3">{calls.map((c) => (
                  <li key={c.call_id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink">{c.disposition || 'Call'}</span><span className="font-mono text-xs text-slate-400">{fmtNum(c.to_number || '')}</span></div>
                    {c.call_summary && <div className="mt-1 text-sm text-slate-600">{c.call_summary}</div>}
                    {c.recording_url && <audio controls src={c.recording_url} className="mt-2 h-8 w-full" />}
                  </li>))}</ol>
              ) : (
                activityList.length === 0 ? <EmptyState text="No activity yet — add a note, log a call, or record an email/text above." /> :
                <ol className="space-y-3">{activityList.map((n) => {
                  const text = cleanNote(n.body_html || n.body_text || '');
                  return (
                    <li key={n.id} className="flex gap-3">
                      <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface text-[10px] font-bold text-slate-500">{(n.author || 'SY').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
                      <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface/50 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><span className="text-sm font-semibold text-ink">{n.author || 'System'}</span>{n.source && SOURCE_STYLE[n.source] && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[n.source]}`}>{n.source}</span>}</div>
                          <span className="shrink-0 text-xs text-slate-400">{n.note_date || ''}</span>
                        </div>
                        <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{text || <span className="text-slate-400">—</span>}</div>
                      </div>
                    </li>
                  );
                })}</ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {callOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setCallOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-bold text-ink"><Bot className="h-5 w-5 text-brand" /> Launch AI Call</div>
              <button onClick={() => setCallOpen(false)} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">AI Voice Agent</label>
                <div className="rounded-lg border border-line bg-surface px-3 py-2 font-medium text-ink">{DIAL_AGENT.name}</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Call this number</label>
                <select value={callTo} onChange={(e) => setCallTo(e.target.value)} className="input w-full">
                  {contacts.map((c) => <option key={c.contact_id} value={c.phone}>{fmtNum(c.phone)} · {c.contact_kind === 'relative' ? (c.related_name || 'relative') : 'owner'}{c.phone_verified ? ' ✓' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">From (caller ID)</label>
                <select value={callFrom} onChange={(e) => setCallFrom(e.target.value)} className="input w-full">
                  {DIAL_NUMBERS.map((n) => <option key={n.v} value={n.v}>{n.label}</option>)}
                </select>
              </div>
              <div className="rounded-lg bg-surface p-2.5 text-xs text-slate-500">Adrian receives this seller's property, parcel data, our value, and the full note history (newest first) as live context on the call. The call is logged to the timeline.</div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={aiCallBrief} className="text-xs font-semibold text-slate-500 hover:text-brand">Copy context brief</button>
              <div className="flex gap-2">
                <button onClick={() => setCallOpen(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface">Cancel</button>
                <button onClick={launchCall} disabled={calling || !callTo} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">{calling ? <><Loader2 className="h-4 w-4 animate-spin" /> Dialing…</> : <><PhoneCall className="h-4 w-4" /> Launch Call</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="rounded-xl border border-line bg-surface/50 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-0.5 truncate text-sm font-bold text-ink" title={String(value)}>{value}</div>
    </div>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {title}{count != null && <span className="rounded-full bg-surface px-1.5 text-[10px] text-slate-500">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2 text-sm last:border-0"><span className="shrink-0 text-slate-500">{k}</span><span className="truncate text-right font-medium text-ink">{v}</span></div>;
}

function PhoneRow({ c, onPatch, showRel }: { c: any; onPatch: (id: string, b: any) => void; showRel?: boolean }) {
  const isMobile = c.phone_channel === 'mobile';
  return (
    <div className={`rounded-xl border p-2.5 transition ${c.is_primary_number ? 'border-brand bg-brand/5' : 'border-line hover:border-slate-300'}`}>
      <div className="flex items-center justify-between gap-2">
        <a href={`tel:${c.phone}`} className="font-mono text-sm font-semibold text-brand hover:underline">{fmtNum(c.phone)}</a>
        <div className="flex items-center gap-0.5">
          <button title={c.phone_verified ? 'Verified — click to unverify' : 'Mark verified'} onClick={() => onPatch(c.contact_id, { phone_verified: !c.phone_verified })} className={`rounded-md p-1 transition ${c.phone_verified ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}><BadgeCheck className="h-4 w-4" /></button>
          <button title="Set as primary number" onClick={() => onPatch(c.contact_id, { is_primary_number: true })} className={`rounded-md p-1 transition ${c.is_primary_number ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'}`}><Star className={`h-4 w-4 ${c.is_primary_number ? 'fill-amber-400' : ''}`} /></button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${isMobile ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{isMobile ? <Smartphone className="h-3 w-3" /> : <Phone className="h-3 w-3" />}{c.phone_channel || 'other'}</span>
        {c.phone_verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">✓ verified</span>}
        {c.is_primary_number && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">★ primary</span>}
        {showRel && c.related_name && <span className="text-slate-500">{c.related_name}{c.relation_type ? ` · ${c.relation_type}` : ''}</span>}
      </div>
    </div>
  );
}
