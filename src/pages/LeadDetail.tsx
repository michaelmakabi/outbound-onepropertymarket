import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { opm, testai, fmt, team } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';
import { LoadingBlock, EmptyState, AudioPlayer } from '../components/dash';
import MentionThread, { Member } from '../components/MentionThread';
import { MessagesSquare } from 'lucide-react';
import { humanizeDisposition, dispositionColor, dispositionIconName } from '../lib/format';
import { StageIcon } from '../lib/statusIcons';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Star, BadgeCheck, Phone, Smartphone,
  Sparkles, PenLine, Mail, MessageSquare, PhoneCall, User, DollarSign, GitBranch, Tag, Bot, Check, X, Loader2, History,
  Save, ChevronDown, FileText, Pencil, Plus, PhoneIncoming, PhoneOutgoing, Trash2, Home, Users, UserCheck, Lock,
} from 'lucide-react';

const DIAL_AGENT = { id: 'agent_ee77a9e3c659964acc19d0be54', name: 'Adrian B (Aggressive) · OUTBOUND' };
// Retell workspace whose key places these outbound calls (also where its agents live).
const DIAL_WORKSPACE = '1propertymarket';
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

// Human labels for the append-only activity ledger (opm_activity_log).
const LEDGER_LABEL: Record<string, string> = {
  assign_lead: 'Set primary owner', add_follower: 'Added follower', remove_follower: 'Removed follower',
  note_create: 'Added a note', note_edit: 'Edited a note', note_delete: 'Deleted a note', stage_move: 'Moved stage',
};
function ledgerDetail(a: any): string {
  const d = a && a.detail && typeof a.detail === 'object' ? a.detail : {};
  const parts: string[] = [];
  if (d.primary_name) parts.push(String(d.primary_name));
  if (d.name && !d.primary_name) parts.push(String(d.name));
  if (d.to || d.stage) parts.push(String(d.to || d.stage));
  if (d.override) parts.push('override');
  return parts.join(' · ');
}
const NOTE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function LeadDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'activity' | 'notes' | 'calls' | 'property' | 'ledger' | 'details' | 'team'>('activity');
  const [ids, setIds] = useState<string[]>((location.state as any)?.ids || []);
  const [toast, setToast] = useState('');

  // ---- Phase 1 RBAC: role gating, assignment, activity ledger, note governance ----
  const { user: me } = useAuth();
  const isSuper = me?.role === 'super_admin';
  const { isStaff, ownsActive, roles, active } = useWorkspace();
  const canManageLead = isStaff || ownsActive || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);
  const [assignees, setAssignees] = useState<{ primary: any; followers: any[] }>({ primary: null, followers: [] });
  const [members, setMembers] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [editNoteId, setEditNoteId] = useState<any>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const flash = (m: string, ms = 3000) => { setToast(m); setTimeout(() => setToast(''), ms); };

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
  // Selectable AI voice agent for this launch (defaults to the outbound Adrian agent).
  const [agents, setAgents] = useState<{ agent_id: string; agent_name: string }[]>([]);
  const [agentId, setAgentId] = useState(DIAL_AGENT.id);

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

  // ---- Phase 4: internal team discussion (@mentions) — visible to everyone who can see the lead ----
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<Member[]>([]);

  const load = () => { setLoading(true); opm.lead(id).then(setData).finally(() => setLoading(false)); };
  const loadCalls = () => { setCallsLoading(true); opm.leadCalls(id).then((d) => setLeadCalls(d.calls || [])).catch(() => setLeadCalls([])).finally(() => setCallsLoading(false)); };
  const loadAssignees = () => opm.leadAssignees(id).then((d: any) => setAssignees({ primary: d.primary || null, followers: d.followers || [] })).catch(() => setAssignees({ primary: null, followers: [] }));
  const loadLedger = () => { setLedgerLoading(true); opm.activityLog(id).then((d: any) => setLedger(d.activity || [])).catch(() => setLedger([])).finally(() => setLedgerLoading(false)); };
  useEffect(load, [id]);
  useEffect(loadCalls, [id]);
  useEffect(() => { loadAssignees(); loadLedger(); }, [id]);
  // Assignable members (owner/admin/manager only) for the primary/follower pickers.
  useEffect(() => { if (canManageLead) opm.workspaceMembers().then((d: any) => setMembers(d.members || [])).catch(() => {}); }, [canManageLead]);
  // Team discussion: comments + the @mention member directory (available to all viewers).
  const loadComments = () => { setCommentsLoading(true); team.leadComments(id).then((d: any) => setComments(d.comments || [])).catch(() => setComments([])).finally(() => setCommentsLoading(false)); };
  useEffect(loadComments, [id]);
  useEffect(() => { opm.workspaceMembers().then((d: any) => setTeamMembers(d.members || [])).catch(() => {}); }, [id]);
  async function postComment(body: string, mentions: number[]) {
    await team.leadCommentAdd({ lead_id: id, body, mentions: mentions.length ? mentions : undefined });
    loadComments();
  }

  const assignErr = (e: any) => { const m = String(e?.message || ''); flash(/forbidden/i.test(m) ? 'You do not have permission to change assignments here.' : (m || 'Action failed.'), 4000); };
  async function changePrimary(userId: number | '') {
    try {
      if (userId === '') return;
      await opm.assignLead({ lead_id: id, primary_user_id: Number(userId) });
      await loadAssignees(); loadLedger(); load();
      flash('Primary owner updated.');
    } catch (e: any) { assignErr(e); }
  }
  async function addFollower(userId: number | '') {
    if (userId === '') return;
    try { await opm.addFollower({ lead_id: id, user_id: Number(userId) }); await loadAssignees(); loadLedger(); } catch (e: any) { assignErr(e); }
  }
  async function removeFollower(userId: number) {
    try { await opm.removeFollower({ lead_id: id, user_id: userId }); await loadAssignees(); loadLedger(); } catch (e: any) { assignErr(e); }
  }
  // ---- Note governance (author within 24h, or super_admin override) ----
  const noteCreatedMs = (n: any) => { if (n.created_at) { const t = new Date(n.created_at).getTime(); if (!isNaN(t)) return t; } return noteTime(n); };
  const noteOwn = (n: any) => !!me && n.author_user_id != null && Number(n.author_user_id) === Number(me.id);
  const noteWithin24 = (n: any) => Date.now() - noteCreatedMs(n) < NOTE_EDIT_WINDOW_MS;
  const noteNormallyEditable = (n: any) => noteOwn(n) && noteWithin24(n) && !n.locked;
  const noteEditable = (n: any) => noteNormallyEditable(n) || isSuper;
  const noteIsOverride = (n: any) => isSuper && !noteNormallyEditable(n);
  async function saveNoteEdit(n: any) {
    if (noteBusy) return;
    setNoteBusy(true);
    try {
      const r: any = await opm.updateNote({ id: n.id, text: editNoteText, html: editNoteText.replace(/\n/g, '<br>') });
      setEditNoteId(null); load(); loadLedger();
      flash(r?.override ? 'Override recorded — this edit was logged.' : 'Note updated.');
    } catch (e: any) { const m = String(e?.message || ''); flash(/forbidden/i.test(m) ? 'This note is locked.' : (m || 'Could not update note.'), 4000); }
    finally { setNoteBusy(false); }
  }
  async function deleteNoteById(n: any) {
    if (!confirm('Delete this note?')) return;
    try {
      const r: any = await opm.deleteNote(n.id);
      load(); loadLedger();
      flash(r?.override ? 'Override recorded — deletion logged.' : 'Note deleted.');
    } catch (e: any) { const m = String(e?.message || ''); flash(/forbidden/i.test(m) ? 'This note is locked.' : (m || 'Could not delete note.'), 4000); }
  }
  useEffect(() => { if (!ids.length) opm.leads({}).then((d) => setIds((d.leads || []).map((l: any) => l.lead_id))).catch(() => {}); }, []);
  // Load the dial workspace's agents so the launcher can pick which AI voice agent calls.
  useEffect(() => {
    testai.agents(DIAL_WORKSPACE).then((d) => {
      const list = d.agents || [];
      setAgents(list);
      if (list.length && !list.some((a: any) => a.agent_id === DIAL_AGENT.id)) setAgentId(list[0].agent_id);
    }).catch(() => {});
  }, []);
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
  // Most recent communication on this record — surfaced "in context" (left column) so the last
  // call's date, duration, disposition and a play-in-place recording show without opening the Calls tab.
  const lastCall = sortedCalls[0] || null;
  // Most recent AI-captured follow-up / appointment across this record's calls (evolved
  // post-call fields land in each call's custom_data). Surfaced on the record.
  const aiFollowUp = useMemo(() => {
    for (const c of sortedCalls) {
      const cd = (c.custom_data && typeof c.custom_data === 'object') ? c.custom_data : {};
      if (cd.follow_up_action || cd.follow_up_date || cd.appointment_datetime || cd.notes) {
        return { ...cd, when: c.start_timestamp, agent: c.agent_name };
      }
    }
    return null;
  }, [sortedCalls]);
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
    setBody(''); setSubject(''); setCallOutcome(''); setSaving(false); setTab('activity'); load(); loadLedger();
  }
  async function aiNote() {
    if (!body.trim()) return;
    setSaving(true);
    await opm.addNote({ lead_id: id, text: `✨ ${body}`, html: `✨ ${body}`.replace(/\n/g, '<br>'), source: 'ai' }).catch(() => {});
    setBody(''); setSaving(false); setTab('activity'); load(); loadLedger();
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
    if (!targets.length || !callFrom || !agentId) return;
    setCalling(true);
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const from = targets.length > 1 ? DIAL_NUMBERS[i % DIAL_NUMBERS.length].v : callFrom;
        try {
          await opm.placeCall({ lead_id: id, to_number: targets[i], from_number: from, agent_id: agentId, workspace: DIAL_WORKSPACE });
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

  if (loading) return <div className="mx-auto max-w-[1200px]"><LoadingBlock label="Loading lead…" /></div>;
  if (!lead) return <EmptyState text="Lead not found." />;

  const initials = (lead.name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('');
  const verifiedN = contacts.filter((c) => c.phone_verified).length;
  const parcelEntries = Object.entries(parcel).filter(([k, v]) => k !== 'is related' && k !== 'lat long' && v !== '' && v != null);
  const movePipeline = pipelines.find((p) => String(p.id) === String(mp));
  const TABS = [
    { k: 'activity', label: 'Activity', n: notes.length },
    { k: 'calls', label: 'Calls', n: leadCalls.length },
    { k: 'details', label: 'Details', n: null },
    { k: 'property', label: 'Property', n: null },
    { k: 'team', label: 'Team', n: comments.length },
    { k: 'ledger', label: 'History', n: ledger.length },
  ] as const;
  const activityList = tab === 'notes' ? notes.filter((n) => n.source !== 'call') : notes;

  return (
    <div className="mx-auto max-w-[1200px] text-sm">
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
            <Stat icon={User} label="Assigned" value={assignees.primary?.name || lead.assigned_to || '—'} />
            <Stat icon={PhoneCall} label="Calls" value={`${leadCalls.length} · ${contacts.length}#`} />
          </div>
          <button onClick={() => nav(`/leads/${encodeURIComponent(id)}/cue`)} title="Comping · Underwriting · Evaluation report for this property" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-brand hover:text-brand"><Home className="h-4 w-4" /> CUE Report</button>
          <button onClick={openCallModal} title="Launch a live AI voice call to this lead" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:brightness-125"><Bot className="h-4 w-4" /> AI Call</button>
        </div>
      </div>

      {toast && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><Check className="h-4 w-4" /> {toast}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
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

          {/* Last communication — in-context summary of the most recent call on this record. */}
          <Card title="Last communication">
            {callsLoading ? (
              <div className="py-2 text-xs text-slate-400">Loading…</div>
            ) : !lastCall ? (
              <div className="py-2 text-xs text-slate-400">No calls matched to this record yet.</div>
            ) : (() => {
              const inbound = String(lastCall.direction || '').toLowerCase().startsWith('in');
              const color = dispositionColor(lastCall.disposition || '');
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${inbound ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                      {inbound ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}{inbound ? 'Inbound' : 'Outbound'}
                    </span>
                    {lastCall.disposition && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}><StageIcon name={dispositionIconName(lastCall.disposition)} color={color} className="h-3 w-3" />{humanizeDisposition(lastCall.disposition)}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="font-semibold text-ink">{lastCall.start_timestamp ? new Date(Number(lastCall.start_timestamp)).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</span>
                    <span>{durLabel(lastCall.duration_seconds)}</span>
                    {lastCall.agent_name && <span className="font-medium text-slate-600">{lastCall.agent_name}</span>}
                  </div>
                  {lastCall.call_summary && <div className="text-xs leading-relaxed text-slate-600 line-clamp-3">{lastCall.call_summary}</div>}
                  {lastCall.recording_url && <AudioPlayer src={lastCall.recording_url} />}
                  <button onClick={() => setTab('calls')} className="text-xs font-semibold text-brand hover:underline">View all {leadCalls.length} call{leadCalls.length === 1 ? '' : 's'} →</button>
                </div>
              );
            })()}
          </Card>

          <Card title="Assignment">
            {/* Primary owner — mirrors the record's assigned_to; owner/admin/manager can change it. */}
            <div className="pb-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><UserCheck className="h-3 w-3" /> Primary owner</div>
              {canManageLead ? (
                <select value={assignees.primary?.user_id ?? ''} onChange={(e) => changePrimary(e.target.value === '' ? '' : Number(e.target.value))} className="input h-8 w-full text-sm">
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email || `User ${m.user_id}`}</option>)}
                  {assignees.primary && !members.some((m) => m.user_id === assignees.primary.user_id) && <option value={assignees.primary.user_id}>{assignees.primary.name || assignees.primary.email}</option>}
                </select>
              ) : (
                <div className="text-sm font-medium text-ink">{assignees.primary?.name || assignees.primary?.email || <span className="text-slate-400">Unassigned</span>}</div>
              )}
            </div>
            {/* Followers */}
            <div className="border-t border-dashed border-line pt-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Users className="h-3 w-3" /> Followers</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {assignees.followers.length === 0 && <span className="text-xs text-slate-400">No followers</span>}
                {assignees.followers.map((f) => (
                  <span key={f.user_id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {f.name || f.email || `User ${f.user_id}`}
                    {canManageLead && <button onClick={() => removeFollower(f.user_id)} title="Remove follower" className="text-slate-400 hover:text-red-500"><X className="h-3 w-3" /></button>}
                  </span>
                ))}
              </div>
              {canManageLead && (
                <select value="" onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; if (v) addFollower(Number(v)); }} className="input mt-1.5 h-8 w-full text-xs">
                  <option value="">+ Add follower…</option>
                  {members.filter((m) => m.user_id !== assignees.primary?.user_id && !assignees.followers.some((f) => f.user_id === m.user_id)).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email || `User ${m.user_id}`}</option>)}
                </select>
              )}
            </div>
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
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 pt-1">
              {TABS.map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-t-lg px-3 py-2.5 text-sm font-semibold transition ${tab === t.k ? 'border-b-2 border-brand text-ink' : 'text-slate-500 hover:text-ink'}`}>
                  {t.label}{t.n != null && <span className="ml-1 text-xs text-slate-400">{t.n}</span>}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'details' ? (
                <div className="space-y-0">
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
                </div>
              ) : tab === 'team' ? (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-100 text-indigo-600"><MessagesSquare className="h-4 w-4" /></span>
                    <div>
                      <h3 className="text-sm font-bold text-ink">Team discussion — internal</h3>
                      <p className="text-[11px] text-slate-500">Private to your workspace. The customer never sees this. @mention a teammate to notify them.</p>
                    </div>
                  </div>
                  <MentionThread members={teamMembers} messages={comments} loading={commentsLoading} onPost={postComment} heightClass="max-h-[520px]" placeholder="Discuss this lead with your team… type @ to mention a teammate" emptyText="No internal comments yet. Start the discussion — @mention a teammate to loop them in." />
                </div>
              ) : tab === 'property' ? (
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
                <>
                {aiFollowUp && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">AI-captured follow-up</div>
                    <div className="space-y-0.5 text-slate-700">
                      {aiFollowUp.appointment_datetime && <div><span className="font-semibold text-slate-500">Appointment:</span> {aiFollowUp.appointment_datetime}</div>}
                      {aiFollowUp.follow_up_action && <div><span className="font-semibold text-slate-500">Next action:</span> {aiFollowUp.follow_up_action}</div>}
                      {aiFollowUp.follow_up_date && <div><span className="font-semibold text-slate-500">Follow-up date:</span> {aiFollowUp.follow_up_date}</div>}
                      {aiFollowUp.notes && <div><span className="font-semibold text-slate-500">Notes:</span> {aiFollowUp.notes}</div>}
                    </div>
                  </div>
                )}
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
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${color}1a`, color }}><StageIcon name={dispositionIconName(c.disposition)} color={color} className="h-3 w-3" />{humanizeDisposition(c.disposition)}</span>
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
                      {c.custom_data && (c.custom_data.notes || c.custom_data.follow_up_action || c.custom_data.follow_up_date || c.custom_data.appointment_datetime) && (
                        <div className="mt-2 space-y-1 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-slate-700">
                          {c.custom_data.notes && <div><span className="font-semibold text-slate-500">Notes:</span> {c.custom_data.notes}</div>}
                          {c.custom_data.follow_up_action && <div><span className="font-semibold text-slate-500">Follow-up:</span> {c.custom_data.follow_up_action}</div>}
                          {c.custom_data.follow_up_date && <div><span className="font-semibold text-slate-500">Follow-up date:</span> {c.custom_data.follow_up_date}</div>}
                          {c.custom_data.appointment_datetime && <div><span className="font-semibold text-slate-500">Appointment:</span> {c.custom_data.appointment_datetime}</div>}
                        </div>
                      )}
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
                </>
              ) : tab === 'ledger' ? (
                ledgerLoading ? <LoadingBlock label="Loading activity…" /> :
                ledger.length === 0 ? <EmptyState text="No activity recorded yet — assignments, follower changes, stage moves and note edits will appear here." /> :
                <ol className="space-y-2">{ledger.map((a, i) => (
                  <li key={a.id || i} className="flex items-start gap-3 border-b border-dashed border-line pb-2 text-sm last:border-0">
                    <div className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface text-[9px] font-bold text-slate-500">{(a.actor_name || 'SY').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-ink">{a.actor_name || 'System'}</span>
                        <span className="text-slate-600">{LEDGER_LABEL[a.action] || fmt.title(a.action || '')}</span>
                        {ledgerDetail(a) && <span className="text-slate-400">· {ledgerDetail(a)}</span>}
                      </div>
                      <div className="text-xs text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</div>
                    </div>
                  </li>
                ))}</ol>
              ) : (
                activityList.length === 0 ? <EmptyState text="No activity yet — add a note, log a call, or record an email/text above." /> :
                <ol className="space-y-3">{activityList.map((n) => {
                  const text = cleanNote(n.body_html || n.body_text || '');
                  const editing = editNoteId === n.id;
                  return (
                    <li key={n.id} className="flex gap-3">
                      <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface text-[10px] font-bold text-slate-500">{(n.author || 'SY').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
                      <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface/50 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2"><span className="text-sm font-semibold text-ink">{n.author || 'System'}</span>{n.source && SOURCE_STYLE[n.source] && <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[n.source]}`}>{n.source}</span>}</div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-xs text-slate-400">{n.note_date || ''}</span>
                            {!editing && (noteEditable(n) ? (
                              <>
                                <button onClick={() => { setEditNoteId(n.id); setEditNoteText(text); }} title={noteIsOverride(n) ? 'Edit note (super-admin override — logged)' : 'Edit note'} className="rounded p-1 text-slate-300 transition hover:text-brand"><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => deleteNoteById(n)} title={noteIsOverride(n) ? 'Delete note (super-admin override — logged)' : 'Delete note'} className="rounded p-1 text-slate-300 transition hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                {noteIsOverride(n) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">override</span>}
                              </>
                            ) : (
                              <span title="Locked — editable only by the author within 24 hours" className="p-1 text-slate-300"><Lock className="h-3.5 w-3.5" /></span>
                            ))}
                          </div>
                        </div>
                        {editing ? (
                          <div>
                            <textarea autoFocus value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)} rows={3} className="input w-full resize-y text-sm" />
                            <div className="mt-1.5 flex items-center justify-end gap-1">
                              {noteIsOverride(n) && <span className="mr-auto text-[11px] font-semibold text-amber-600">Editing as super-admin override — this is logged.</span>}
                              <button onClick={() => setEditNoteId(null)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-white">Cancel</button>
                              <button onClick={() => saveNoteEdit(n)} disabled={noteBusy || !editNoteText.trim()} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{noteBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save</button>
                            </div>
                          </div>
                        ) : (
                          <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{text || <span className="text-slate-400">—</span>}</div>
                        )}
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
                {agents.length ? (
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="input w-full">
                    {!agents.some((a) => a.agent_id === agentId) && <option value="">Select an agent…</option>}
                    {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
                  </select>
                ) : (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 font-medium text-ink">{DIAL_AGENT.name}</div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Who to call</label>
                <div className="flex flex-wrap gap-1.5">
                  {([['one', 'This number'], ['primary', 'Primary only'], ['all', 'All numbers']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setCallScope(k)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${callScope === k ? 'border-brand bg-brand text-white' : 'border-line text-slate-600 hover:border-brand'}`}>{label}</button>
                  ))}
                </div>
              </div>
              {callScope === 'one' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Number</label>
                  <select value={callTo} onChange={(e) => setCallTo(e.target.value)} className="input w-full">
                    {contacts.filter((c) => String(c.phone || '').replace(/\D/g, '').length >= 10).map((c) => <option key={c.contact_id} value={c.phone}>{fmtNum(c.phone)}{c.is_primary_number ? ' · primary' : ''}{c.do_not_call ? ' · DNC' : ''}</option>)}
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
                <button onClick={launchCall} disabled={calling || !agentId || (callScope === 'one' && !callTo)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">{calling ? <><Loader2 className="h-4 w-4 animate-spin" /> Dialing…</> : <><PhoneCall className="h-4 w-4" /> {callScope === 'all' ? 'Launch Calls' : 'Launch Call'}</>}</button>
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
