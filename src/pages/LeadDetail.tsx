import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { opm } from '../lib/api';
import { LoadingBlock, EmptyState, AudioPlayer } from '../components/dash';
import { humanizeDisposition, dispositionColor } from '../lib/format';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Star, BadgeCheck, Phone, Smartphone,
  Sparkles, PenLine, Mail, MessageSquare, PhoneCall, User, DollarSign, GitBranch, Tag, Bot, Check, X, Loader2, History,
  Save, ChevronDown, FileText, Pencil, Plus, PhoneIncoming, PhoneOutgoing, Trash2, Home,
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
const durLabel = (s: any) => { const n = Math.round(Number(s) || 0); return `${Math.floor(n / 60)}m ${n % 60}s`; };

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
  const [callScope, setCallScope] = useState<'one' | 'primary' | 'all'>('one');
  const [calling, setCalling] = useState(false);

  // Full call history (incl. transcripts) for this record's numbers.
  const [leadCalls, setLeadCalls] = useState<any[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [openTx, setOpenTx] = useState<Set<string>>(new Set());
  // CRM structure for the inline Move editor + custom-field schema.
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  // Inline Move (pipeline/stage) editor.
  const [moveOpen, setMoveOpen] = useState(false);
  const [mp, setMp] = useState<any>('');
  const [ms, setMs] = useState<any>('');
  const [moving, setMoving] = useState(false);
  // Tag composer.
  const [tagInput, setTagInput] = useState('');
  // Custom-field draft + save state.
  const [customDraft, setCustomDraft] = useState<Record<string, any>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  // Full lead editing: name, address, background, and add-a-number.
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [addr, setAddr] = useState<{ Street: string; City: string; State: string; Zip: string }>({ Street: '', City: '', State: '', Zip: '' });
  const [bg, setBg] = useState('');
  const [addNumOpen, setAddNumOpen] = useState(false);
  const [newNum, setNewNum] = useState<{ phone: string; phone_label: string; contact_kind: string; related_name: string }>({ phone: '', phone_label: 'primary', contact_kind: 'owner', related_name: '' });

  const load = () => { setLoading(true); opm.lead(id).then(setData).finally(() => setLoading(false)); };
  const loadCalls = () => { setCallsLoading(true); opm.leadCalls(id).then((d) => setLeadCalls(d.calls || [])).catch(() => setLeadCalls([])).finally(() => setCallsLoading(false)); };
  useEffect(load, [id]);
  useEffect(loadCalls, [id]);
  useEffect(() => { if (!ids.length) opm.leads({}).then((d) => setIds((d.leads || []).map((l: any) => l.lead_id))).catch(() => {}); }, []);
  useEffect(() => {
    opm.pipelines().then((d) => setPipelines(d.pipelines || [])).catch(() => {});
    opm.customFields().then((d) => setCustomFields((d.fields || []).filter((f: any) => f.entity === 'lead'))).catch(() => {});
  }, []);
  // Seed the custom-field draft from the record once its data arrives / when we switch records.
  useEffect(() => {
    const L = data?.lead;
    setCustomDraft({ ...((L?.custom) || {}) });
    const a = (Array.isArray(L?.addresses) && L.addresses[0]) || {};
    setAddr({ Street: a.Street || '', City: a.City || '', State: a.State || '', Zip: a.Zip || '' });
    setBg(L?.background || '');
    setNameVal(L?.name || '');
    setMoveOpen(false); setEditName(false); setAddNumOpen(false);
  }, [data?.lead?.lead_id]);

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
  // newest first
  const notes = useMemo(() => [...rawNotes].sort((a, b) => noteTime(b) - noteTime(a)), [rawNotes]);
  const sortedCalls = useMemo(() => [...leadCalls].sort((a, b) => Number(b.start_timestamp || 0) - Number(a.start_timestamp || 0)), [leadCalls]);
  const owners = contacts.filter((c) => c.contact_kind !== 'relative');
  const relatives = contacts.filter((c) => c.contact_kind === 'relative');
  const parcel = lead?.parcel || {};
  const tags: string[] = Array.isArray(lead?.tags) ? lead.tags : [];

  async function patch(contact_id: string, b: any) {
    setData((d: any) => ({ ...d, contacts: d.contacts.map((c: any) => c.contact_id === contact_id ? { ...c, ...b } : (b.is_primary_number ? { ...c, is_primary_number: false } : c)) }));
    await opm.updateContact({ contact_id, lead_id: id, ...b }).catch(() => load());
  }
  // Optimistically patch the lead record and persist via updateLead; reload on failure.
  async function saveLead(p: Record<string, any>) {
    setData((d: any) => (d ? { ...d, lead: { ...d.lead, ...p } } : d));
    await opm.updateLead({ lead_id: id, ...p }).catch(() => load());
  }
  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(''); return; }
    saveLead({ tags: [...tags, t] });
    setTagInput('');
  }
  const removeTag = (t: string) => saveLead({ tags: tags.filter((x) => x !== t) });
  const saveName = () => { const v = nameVal.trim(); setEditName(false); if (v && v !== lead?.name) saveLead({ name: v }); };
  const saveAddr = () => { saveLead({ addresses: [addr] }); setToast('Address saved.'); setTimeout(() => setToast(''), 2500); };
  const saveBg = () => { saveLead({ background: bg }); setToast('Background saved.'); setTimeout(() => setToast(''), 2500); };
  async function addNumber() {
    const digits = newNum.phone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) { setToast('Enter a valid 10-digit number.'); setTimeout(() => setToast(''), 3000); return; }
    await opm.saveNumber({ lead_id: id, phone: digits, phone_label: newNum.phone_label, contact_kind: newNum.contact_kind, related_name: newNum.related_name }).catch(() => {});
    setNewNum({ phone: '', phone_label: 'primary', contact_kind: 'owner', related_name: '' }); setAddNumOpen(false); load();
  }
  const saveNumberEdit = async (contact_id: string, b: any) => { await opm.saveNumber({ lead_id: id, contact_id, ...b }).catch(() => {}); load(); };
  async function deleteNumber(contact_id: string) {
    if (!confirm('Delete this phone number from the lead?')) return;
    setData((d: any) => ({ ...d, contacts: d.contacts.filter((c: any) => c.contact_id !== contact_id) }));
    await opm.deleteContacts([contact_id]).catch(() => load());
  }
  async function saveCustom() {
    setSavingCustom(true);
    await saveLead({ custom: customDraft });
    setSavingCustom(false);
    setToast('Custom fields saved.');
    setTimeout(() => setToast(''), 3000);
  }
  function openMove() {
    setMp(lead?.pipeline_id ?? '');
    setMs(lead?.stage_id ?? '');
    setMoveOpen(true);
  }
  async function doMove() {
    if (!mp || !ms) return;
    setMoving(true);
    try { await opm.moveLead({ lead_id: id, pipeline_id: mp, stage_id: ms }); setMoveOpen(false); load(); }
    catch (e: any) { setToast('Move failed: ' + (e?.message || 'error')); setTimeout(() => setToast(''), 4000); }
    finally { setMoving(false); }
  }
  const toggleTx = (cid: string) => setOpenTx((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

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
  // Which numbers this launch will dial, honoring the scope selector. Dedup by phone,
  // skip do-not-call. Rotating caller IDs when more than one target.
  function callTargets(): string[] {
    const dial = (c: any) => !c.do_not_call && String(c.phone || '').replace(/\D/g, '').length >= 10;
    let list: any[];
    if (callScope === 'all') list = contacts.filter(dial);
    else if (callScope === 'primary') { const p = contacts.find((c) => c.is_primary_number) || contacts[0]; list = p && dial(p) ? [p] : []; }
    else list = contacts.filter((c) => c.phone === callTo);
    const seen = new Set<string>(); const out: string[] = [];
    for (const c of list) { const t = String(c.phone).replace(/\D/g, '').slice(-10); if (t.length === 10 && !seen.has(t)) { seen.add(t); out.push(c.phone); } }
    return out;
  }
  async function launchCall() {
    const targets = callTargets();
    if (!targets.length || !callFrom) return;
    setCalling(true);
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const from = targets.length > 1 ? DIAL_NUMBERS[i % DIAL_NUMBERS.length].v : callFrom;
        try {
          await opm.placeCall({ lead_id: id, to_number: targets[i], from_number: from, agent_id: DIAL_AGENT.id, workspace: '1propertymarket' });
          ok++;
        } catch { fail++; }
        if (i < targets.length - 1) await new Promise((res) => setTimeout(res, 8000)); // non-overlapping
      }
      setCallOpen(false);
      setToast(targets.length === 1 ? (ok ? `AI call launched to ${fmtNum(targets[0])} — Adrian is dialing now.` : 'Call failed.') : `Dialed ${ok}/${targets.length} number${targets.length === 1 ? '' : 's'}${fail ? ` (${fail} failed)` : ''}.`);
      setTimeout(() => setToast(''), 6000);
      load(); loadCalls();
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
  const movePipeline = pipelines.find((p) => String(p.id) === String(mp));
  const TABS = [
    { k: 'activity', label: 'Activity', n: notes.length },
    { k: 'notes', label: 'Notes', n: null },
    { k: 'calls', label: 'Calls', n: leadCalls.length },
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
            {editName ? (
              <div className="flex items-center gap-1">
                <input autoFocus value={nameVal} onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditName(false); setNameVal(lead.name || ''); } }}
                  className="input h-8 w-full max-w-xs text-base font-bold" />
                <button onClick={saveName} className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditName(false); setNameVal(lead.name || ''); }} className="rounded p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="group flex items-center gap-1.5">
                <div className="truncate text-lg font-bold leading-tight text-ink">{lead.name}</div>
                <button onClick={() => { setNameVal(lead.name || ''); setEditName(true); }} title="Edit name" className="shrink-0 rounded p-1 text-slate-300 transition hover:text-brand"><Pencil className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <StagePill name={lead.stage_name || lead.crm_stage} color={lead.stage_color} />
              <span className="text-xs text-slate-400">{lead.pipeline_name || 'Pitman Seller Pipeline'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat icon={DollarSign} label="Our Value" value={money(lead.deal_price)} />
            <Stat icon={GitBranch} label="Source" value={lead.lead_source || '—'} />
            <Stat icon={User} label="Assigned" value={lead.assigned_to || '—'} />
            <Stat icon={PhoneCall} label="Calls" value={`${leadCalls.length} · ${contacts.length}#`} />
          </div>
          <button onClick={openCallModal} title="Launch a live AI voice call to this lead" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:brightness-125"><Bot className="h-4 w-4" /> AI Call</button>
        </div>
      </div>

      {toast && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><Check className="h-4 w-4" /> {toast}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* LEFT column — dialing essentials only */}
        <div className="space-y-4">
          <Card title="Phone Numbers" count={owners.length}>
            <div className="space-y-2">{owners.map((c) => <PhoneRow key={c.contact_id} c={c} onPatch={patch} onSave={saveNumberEdit} onDelete={deleteNumber} />)}</div>
            {addNumOpen ? (
              <div className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface/60 p-2">
                <input value={newNum.phone} onChange={(e) => setNewNum((n) => ({ ...n, phone: e.target.value }))} placeholder="Phone number" className="input h-8 w-full text-xs" />
                <div className="flex gap-1.5">
                  <input value={newNum.phone_label} onChange={(e) => setNewNum((n) => ({ ...n, phone_label: e.target.value }))} placeholder="Label" className="input h-8 flex-1 text-xs" />
                  <select value={newNum.contact_kind} onChange={(e) => setNewNum((n) => ({ ...n, contact_kind: e.target.value }))} className="input h-8 flex-1 text-xs"><option value="owner">Owner</option><option value="relative">Relative</option></select>
                </div>
                {newNum.contact_kind === 'relative' && <input value={newNum.related_name} onChange={(e) => setNewNum((n) => ({ ...n, related_name: e.target.value }))} placeholder="Related person's name" className="input h-8 w-full text-xs" />}
                <div className="flex justify-end gap-1">
                  <button onClick={() => setAddNumOpen(false)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Cancel</button>
                  <button onClick={addNumber} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"><Plus className="h-3.5 w-3.5" /> Add</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddNumOpen(true)} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 text-xs font-semibold text-slate-500 transition hover:border-brand hover:text-brand"><Plus className="h-3.5 w-3.5" /> Add number</button>
            )}
          </Card>

          {relatives.length > 0 && (
            <Card title="Relationships" count={relatives.length}>
              <div className="space-y-2">{relatives.map((c) => <PhoneRow key={c.contact_id} c={c} onPatch={patch} onSave={saveNumberEdit} onDelete={deleteNumber} showRel />)}</div>
            </Card>
          )}

          <Card title="Details">
            {/* Pipeline / Stage + inline Move editor */}
            <div className="border-b border-dashed border-line py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 text-slate-500">Pipeline / Stage</span>
                <button onClick={() => (moveOpen ? setMoveOpen(false) : openMove())} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                  <GitBranch className="h-3 w-3" /> {moveOpen ? 'Close' : 'Move'}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StagePill name={lead.stage_name || lead.crm_stage} color={lead.stage_color} />
                <span className="text-xs text-slate-400">{lead.pipeline_name || '—'}</span>
              </div>
              {moveOpen && (
                <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface/60 p-2.5">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Pipeline</label>
                    <select value={mp} onChange={(e) => { setMp(e.target.value); const p = pipelines.find((x) => String(x.id) === e.target.value); setMs(p?.stages?.[0]?.id ?? ''); }} className="input w-full text-sm">
                      {pipelines.length === 0 && <option value="">Loading…</option>}
                      {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Stage</label>
                    <select value={ms} onChange={(e) => setMs(e.target.value)} className="input w-full text-sm">
                      {(movePipeline?.stages || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setMoveOpen(false)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Cancel</button>
                    <button onClick={doMove} disabled={moving || !mp || !ms} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
                      {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="border-b border-dashed border-line py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-slate-500"><Tag className="h-3 w-3" /> Tags</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.length === 0 && <span className="text-xs text-slate-400">No tags</span>}
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                    {t}
                    <button onClick={() => removeTag(t)} title="Remove tag" className="text-brand/60 hover:text-brand"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag + Enter"
                  className="input h-8 w-full text-xs"
                />
                <button onClick={addTag} disabled={!tagInput.trim()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-slate-500 transition hover:border-brand hover:text-brand disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Editable core rows */}
            <dl>
              <EditRow k="Our Value" type="number" value={lead.deal_price} display={money(lead.deal_price)} onSave={(v) => saveLead({ deal_price: v })} />
              <EditRow k="Listing price" type="number" value={lead.listing_price} display={money(lead.listing_price)} onSave={(v) => saveLead({ listing_price: v })} />
              <EditRow k="Assigned" value={lead.assigned_to} onSave={(v) => saveLead({ assigned_to: v })} />
              <EditRow k="Source" value={lead.lead_source} onSave={(v) => saveLead({ lead_source: v })} />
              <EditRow k="Property ref" value={lead.property_ref} onSave={(v) => saveLead({ property_ref: v })} />
              <EditRow k="Email" value={lead.emails?.[0]?.email || lead.emails?.[0] || ''} onSave={(v) => saveLead({ emails: v ? [v] : [] })} />
            </dl>

            {/* Property address (structured) */}
            <div className="mt-2 border-t border-line pt-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Home className="h-3 w-3" /> Property address</div>
              <input value={addr.Street} onChange={(e) => setAddr((a) => ({ ...a, Street: e.target.value }))} placeholder="Street" className="input h-8 w-full text-xs" />
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                <input value={addr.City} onChange={(e) => setAddr((a) => ({ ...a, City: e.target.value }))} placeholder="City" className="input h-8 text-xs" />
                <input value={addr.State} onChange={(e) => setAddr((a) => ({ ...a, State: e.target.value }))} placeholder="State" className="input h-8 text-xs" />
                <input value={addr.Zip} onChange={(e) => setAddr((a) => ({ ...a, Zip: e.target.value }))} placeholder="Zip" className="input h-8 text-xs" />
              </div>
              <div className="mt-1.5 flex justify-end">
                <button onClick={saveAddr} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"><Save className="h-3.5 w-3.5" /> Save address</button>
              </div>
            </div>

            {/* Background */}
            <div className="mt-2 border-t border-line pt-2">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Background</div>
              <textarea value={bg} onChange={(e) => setBg(e.target.value)} rows={3} placeholder="Notes about this lead…" className="input w-full text-xs" />
              <div className="mt-1.5 flex justify-end">
                <button onClick={saveBg} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"><Save className="h-3.5 w-3.5" /> Save background</button>
              </div>
            </div>

            {/* Custom fields */}
            {customFields.length > 0 && (
              <div className="mt-2 border-t border-line pt-2">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Custom Fields</div>
                <div className="space-y-2">
                  {customFields.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                      <label className="shrink-0 text-slate-500">{f.label}</label>
                      {f.field_type === 'bool' ? (
                        <input type="checkbox" checked={!!customDraft[f.field_key]} onChange={(e) => setCustomDraft((d) => ({ ...d, [f.field_key]: e.target.checked }))} className="h-4 w-4 accent-[#1f6feb]" />
                      ) : f.field_type === 'select' ? (
                        <select value={customDraft[f.field_key] ?? ''} onChange={(e) => setCustomDraft((d) => ({ ...d, [f.field_key]: e.target.value }))} className="input h-8 w-40 text-xs">
                          <option value="">—</option>
                          {(Array.isArray(f.options) ? f.options : String(f.options || '').split(',').map((s) => s.trim()).filter(Boolean)).map((o: string) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                          value={customDraft[f.field_key] ?? ''}
                          onChange={(e) => setCustomDraft((d) => ({ ...d, [f.field_key]: e.target.value }))}
                          className="input h-8 w-40 text-right text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-end">
                  <button onClick={saveCustom} disabled={savingCustom} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
                    {savingCustom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save custom fields
                  </button>
                </div>
              </div>
            )}

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
                callsLoading ? <LoadingBlock label="Loading call history…" /> :
                sortedCalls.length === 0 ? <EmptyState text="No dialer calls matched to this record's numbers yet." /> :
                <ol className="space-y-3">{sortedCalls.map((c) => {
                  const open = openTx.has(c.call_id);
                  const inbound = String(c.direction || '').toLowerCase().startsWith('in');
                  const color = dispositionColor(c.disposition || '');
                  return (
                    <li key={c.call_id} className="rounded-xl border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${inbound ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                            {inbound ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}{inbound ? 'Inbound' : 'Outbound'}
                          </span>
                          <span className="text-xs font-semibold text-ink">{c.start_timestamp ? new Date(Number(c.start_timestamp)).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</span>
                        </div>
                        {c.disposition && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}>{humanizeDisposition(c.disposition)}</span>
                            {c.disposition_source && <span className="text-[10px] uppercase tracking-wide text-slate-400">{c.disposition_source}</span>}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {c.agent_name && <span className="font-medium text-slate-600">{c.agent_name}</span>}
                        <span>{durLabel(c.duration_seconds)}</span>
                        {c.user_sentiment && <span className="rounded-full bg-surface px-2 py-0.5 font-semibold text-slate-600">{c.user_sentiment}</span>}
                        {(inbound ? c.from_number : c.to_number) && <span className="font-mono text-slate-400">{fmtNum(inbound ? c.from_number : c.to_number)}</span>}
                      </div>
                      {c.call_summary && <div className="mt-2 text-sm leading-relaxed text-slate-700">{c.call_summary}</div>}
                      {c.recording_url && <div className="mt-2"><AudioPlayer src={c.recording_url} /></div>}
                      {c.transcript && (
                        <div className="mt-2">
                          <button onClick={() => toggleTx(c.call_id)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                            <FileText className="h-3.5 w-3.5" /> {open ? 'Hide transcript' : 'Show transcript'} <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
                          </button>
                          {open && <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs leading-relaxed text-slate-700">{c.transcript}</div>}
                        </div>
                      )}
                    </li>
                  );
                })}</ol>
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
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                <label className="mb-1 block text-xs font-semibold text-slate-500">Who to dial</label>
                <select value={callScope} onChange={(e) => setCallScope(e.target.value as any)} className="input w-full">
                  <option value="one">Just one number</option>
                  <option value="primary">Primary number of this record</option>
                  <option value="all">Every number on this record ({contacts.filter((c) => !c.do_not_call && String(c.phone || '').replace(/\D/g, '').length >= 10).length})</option>
                </select>
              </div>
              {callScope === 'one' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Call this number</label>
                  <select value={callTo} onChange={(e) => setCallTo(e.target.value)} className="input w-full">
                    {contacts.map((c) => <option key={c.contact_id} value={c.phone}>{fmtNum(c.phone)} · {c.contact_kind === 'relative' ? (c.related_name || 'relative') : 'owner'}{c.phone_verified ? ' ✓' : ''}</option>)}
                  </select>
                </div>
              )}
              {callScope === 'all' && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Will place a separate AI call to each number on this record, one at a time (spaced so none overlap), rotating caller IDs.</div>}
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
                <button onClick={launchCall} disabled={calling || (callScope === 'one' && !callTo)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">{calling ? <><Loader2 className="h-4 w-4 animate-spin" /> Dialing…</> : <><PhoneCall className="h-4 w-4" /> {callScope === 'all' ? 'Launch Calls' : 'Launch Call'}</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StagePill({ name, color }: { name?: string; color?: string }) {
  if (!color) return <span className="pill bg-brand/10 text-brand">{name || '—'}</span>;
  return <span className="pill" style={{ backgroundColor: `${color}1a`, color }}>{name || '—'}</span>;
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

// Inline-editable Details row: click the pencil to edit, Enter/✓ to save, Esc/✗ to cancel.
function EditRow({ k, value, type = 'text', display, onSave }: { k: string; value: any; type?: 'text' | 'number'; display?: any; onSave: (v: any) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<any>(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = () => { setEditing(false); onSave(type === 'number' ? (v === '' ? null : Number(v)) : v); };
  const cancel = () => { setEditing(false); setV(value ?? ''); };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2 text-sm last:border-0">
      <span className="shrink-0 text-slate-500">{k}</span>
      {editing ? (
        <span className="flex items-center gap-1">
          <input autoFocus type={type} value={v} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
            className="input h-8 w-32 text-right text-sm" />
          <button onClick={commit} className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
          <button onClick={cancel} className="rounded p-1 text-slate-400 hover:bg-surface"><X className="h-3.5 w-3.5" /></button>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-right font-medium text-ink">{display ?? (value || '—')}</span>
          <button onClick={() => setEditing(true)} title={`Edit ${k}`} className="shrink-0 rounded p-1 text-slate-300 transition hover:text-brand"><Pencil className="h-3 w-3" /></button>
        </span>
      )}
    </div>
  );
}

function PhoneRow({ c, onPatch, onSave, onDelete, showRel }: { c: any; onPatch: (id: string, b: any) => void; onSave: (id: string, b: any) => void | Promise<void>; onDelete: (id: string) => void; showRel?: boolean }) {
  const isMobile = c.phone_channel === 'mobile';
  const [edit, setEdit] = useState(false);
  const [ph, setPh] = useState(String(c.phone || '').replace(/\D/g, '').slice(-10));
  const [label, setLabel] = useState(c.phone_label || '');
  const [rel, setRel] = useState(c.related_name || '');
  const openEdit = () => { setPh(String(c.phone || '').replace(/\D/g, '').slice(-10)); setLabel(c.phone_label || ''); setRel(c.related_name || ''); setEdit(true); };
  const save = () => { onSave(c.contact_id, { phone: ph, phone_label: label, ...(showRel ? { related_name: rel } : {}) }); setEdit(false); };
  return (
    <div className={`rounded-xl border p-2.5 transition ${c.is_primary_number ? 'border-brand bg-brand/5' : 'border-line hover:border-slate-300'}`}>
      {edit ? (
        <div className="space-y-1.5">
          <input value={ph} onChange={(e) => setPh(e.target.value)} placeholder="Phone number" className="input h-8 w-full text-xs" />
          <div className="flex gap-1.5">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="input h-8 flex-1 text-xs" />
            {showRel && <input value={rel} onChange={(e) => setRel(e.target.value)} placeholder="Related name" className="input h-8 flex-1 text-xs" />}
          </div>
          <div className="flex justify-end gap-1">
            <button onClick={() => setEdit(false)} className="rounded p-1 text-slate-400 hover:bg-surface"><X className="h-3.5 w-3.5" /></button>
            <button onClick={save} className="rounded p-1 text-emerald-600 hover:bg-emerald-50"><Check className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <a href={`tel:${c.phone}`} className="font-mono text-sm font-semibold text-brand hover:underline">{fmtNum(c.phone)}</a>
            <div className="flex items-center gap-0.5">
              <Link to={`/contacts/${encodeURIComponent(String(c.phone).replace(/\D/g, '').slice(-10))}`} title="View this number's full call history" className="rounded-md p-1 text-slate-300 transition hover:text-brand"><History className="h-4 w-4" /></Link>
              <button title={c.phone_verified ? 'Verified — click to unverify' : 'Mark verified'} onClick={() => onPatch(c.contact_id, { phone_verified: !c.phone_verified })} className={`rounded-md p-1 transition ${c.phone_verified ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}><BadgeCheck className="h-4 w-4" /></button>
              <button title="Set as primary number" onClick={() => onPatch(c.contact_id, { is_primary_number: true })} className={`rounded-md p-1 transition ${c.is_primary_number ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'}`}><Star className={`h-4 w-4 ${c.is_primary_number ? 'fill-amber-400' : ''}`} /></button>
              <button title="Edit number" onClick={openEdit} className="rounded-md p-1 text-slate-300 transition hover:text-brand"><Pencil className="h-4 w-4" /></button>
              <button title="Delete number" onClick={() => onDelete(c.contact_id)} className="rounded-md p-1 text-slate-300 transition hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${isMobile ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{isMobile ? <Smartphone className="h-3 w-3" /> : <Phone className="h-3 w-3" />}{c.phone_channel || 'other'}</span>
            {c.phone_label && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{c.phone_label}</span>}
            {c.phone_verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">✓ verified</span>}
            {c.is_primary_number && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">★ primary</span>}
            {showRel && c.related_name && <span className="text-slate-500">{c.related_name}{c.relation_type ? ` · ${c.relation_type}` : ''}</span>}
          </div>
        </>
      )}
    </div>
  );
}
