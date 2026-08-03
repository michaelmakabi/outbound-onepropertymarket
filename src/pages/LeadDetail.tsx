import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { LoadingBlock, EmptyState } from '../components/dash';
import { ArrowLeft, Star, BadgeCheck, Phone, Smartphone, Sparkles } from 'lucide-react';

function fmtNum(n: string) {
  const d = (n || '').replace(/\D/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}
const money = (n: any) => (n ? `$${Number(n).toLocaleString('en-US')}` : '—');
const PARCEL_LABELS: Record<string, string> = {
  bbl: 'BBL', 'bldg sqft': 'Building SF', 'lot sqft': 'Lot SF', 'bldg front': 'Bldg Front', 'bldg depth': 'Bldg Depth',
  'lot front': 'Lot Front', 'lot depth': 'Lot Depth', neighborhood: 'Neighborhood', 'residential units': 'Res Units',
  'commercial units': 'Comm Units', stories: 'Stories', 'zoning districts': 'Zoning', 'tax class': 'Tax Class',
  'unused far': 'Unused FAR', 'corner lot': 'Corner Lot', 'main address': 'Parcel Address', 'vacant status': 'Vacant', borough: 'Borough',
};

export default function LeadDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'all' | 'notes' | 'calls'>('all');

  const load = () => { setLoading(true); opm.lead(id).then(setData).finally(() => setLoading(false)); };
  useEffect(load, [id]);

  const lead = data?.lead;
  const contacts: any[] = data?.contacts || [];
  const notes: any[] = data?.notes || [];
  const calls: any[] = data?.calls || [];
  const owners = contacts.filter((c) => c.contact_kind !== 'relative');
  const relatives = contacts.filter((c) => c.contact_kind === 'relative');

  async function patch(contact_id: string, body: any) {
    setData((d: any) => ({ ...d, contacts: d.contacts.map((c: any) => c.contact_id === contact_id ? { ...c, ...body } : (body.is_primary_number ? { ...c, is_primary_number: false } : c)) }));
    await opm.updateContact({ contact_id, lead_id: id, ...body }).catch(() => load());
  }
  async function addNote(source: 'manual' | 'ai') {
    if (!note.trim()) return;
    setSaving(true);
    const text = source === 'ai' ? `✨ ${note}` : note;
    await opm.addNote({ lead_id: id, text, html: text.replace(/\n/g, '<br>'), source }).catch(() => {});
    setNote(''); setSaving(false); load();
  }

  if (loading) return <LoadingBlock />;
  if (!lead) return <EmptyState text="Lead not found." />;

  const parcel = lead.parcel || {};
  const filteredActivity = tab === 'calls' ? [] : notes;

  return (
    <div>
      <button onClick={() => nav('/leads')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> All leads</button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_300px]">
        {/* LEFT */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-lg font-extrabold text-brand">{(lead.name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
              <div><div className="text-lg font-extrabold text-ink">{lead.name}</div><div className="text-xs text-slate-500">{lead.lead_source}</div></div>
            </div>
            <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Phone numbers</div>
            {owners.map((c) => <PhoneRow key={c.contact_id} c={c} onPatch={patch} />)}
            {lead.emails?.[0]?.email && <div className="mt-2 text-sm text-brand">{lead.emails[0].email}</div>}
            {lead.addresses?.[0] && <div className="text-xs text-slate-500">{lead.addresses[0].Street}, {lead.addresses[0].City} {lead.addresses[0].State} {lead.addresses[0].Zip}</div>}
          </div>

          {relatives.length > 0 && (
            <div className="card">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Relationships · {relatives.length} numbers</div>
              {relatives.map((c) => <PhoneRow key={c.contact_id} c={c} onPatch={patch} showRel />)}
            </div>
          )}

          <div className="card">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Details</div>
            <Detail k="Stage" v={<span className="pill bg-brand/10 text-brand">{lead.crm_stage || '—'}</span>} />
            <Detail k="Pipeline" v={`${lead.pipeline_name || '—'} · ${lead.stage_name || '—'}`} />
            <Detail k="Assigned to" v={lead.assigned_to || '—'} />
            <Detail k="Deal Price" v={money(lead.deal_price)} />
            <Detail k="Subject Property" v={lead.property_ref || '—'} />
            {lead.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{lead.tags.slice(0, 12).map((t: string) => <span key={t} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-slate-500">{t}</span>)}</div>}
          </div>

          {Object.keys(parcel).length > 0 && (
            <div className="card">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Custom fields · parcel</div>
              {Object.entries(parcel).filter(([k]) => k !== 'is related' && k !== 'lat long').map(([k, v]) => <Detail key={k} k={PARCEL_LABELS[k] || k} v={String(v)} />)}
            </div>
          )}
        </div>

        {/* CENTER */}
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="mb-2 flex gap-4 border-b border-line pb-2 text-sm font-semibold">
              <span className="text-brand">✍ Create Note</span><span className="text-slate-400">✉ Email</span><span className="text-slate-400">💬 Text</span><span className="text-slate-400">📞 Log Call</span>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note… (saved with your name + timestamp)" className="input min-h-[80px] w-full" />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => addNote('ai')} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" /> AI Note</button>
              <button onClick={() => addNote('manual')} disabled={saving} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Create Note</button>
            </div>
          </div>

          <div className="flex gap-4 px-1 text-xs font-semibold text-slate-500">
            <button className={tab === 'all' ? 'text-ink' : ''} onClick={() => setTab('all')}>All <b>{notes.length}</b></button>
            <button className={tab === 'notes' ? 'text-ink' : ''} onClick={() => setTab('notes')}>Notes</button>
            <button className={tab === 'calls' ? 'text-ink' : ''} onClick={() => setTab('calls')}>Calls <b>{calls.length}</b></button>
          </div>

          <div className="card">
            {tab === 'calls' ? (
              calls.length === 0 ? <EmptyState text="No dialer calls matched to this lead's numbers yet." /> :
              <ol className="flex flex-col gap-3">{calls.map((c) => (
                <li key={c.call_id} className="rounded-xl border border-line p-3">
                  <div className="flex justify-between text-sm"><span className="font-semibold">{c.disposition || 'Call'}</span><span className="text-slate-400">{c.to_number}</span></div>
                  {c.call_summary && <div className="mt-1 text-xs text-slate-600">{c.call_summary}</div>}
                  {c.recording_url && <audio controls src={c.recording_url} className="mt-2 h-8 w-full" />}
                </li>))}</ol>
            ) : (
              filteredActivity.length === 0 ? <EmptyState text="No notes yet." /> :
              <ol className="flex flex-col gap-3">{filteredActivity.map((n) => (
                <li key={n.id} className="flex gap-3">
                  <div className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface text-[10px] font-bold text-slate-500">{(n.author || 'SY').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}</div>
                  <div className="flex-1 rounded-xl border border-line bg-surface p-2.5">
                    <div className="flex justify-between"><span className="text-sm font-semibold text-ink">{n.author || 'System'}</span><span className="text-xs text-slate-400">{n.note_date || ''}{n.source && n.source !== 'import' ? ` · ${n.source}` : ''}</span></div>
                    <div className="mt-1 text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: n.body_html || n.body_text || '' }} />
                  </div>
                </li>))}</ol>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-4">
          <div className="card"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Deal</div>
            <Detail k="Property" v={lead.property_ref || '—'} /><Detail k="Stage" v={lead.stage_name || '—'} /><Detail k="Value" v={money(lead.deal_price)} /></div>
          <div className="card"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Files &amp; recordings</div>
            <div className="mt-1 text-xs text-slate-500">Dialer recordings + voice transcriptions auto-append here and to the call thread, matched to the number dialed.</div></div>
          {lead.disposition_flags && Object.keys(lead.disposition_flags).length > 0 && (
            <div className="card"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Last call disposition</div>
              {Object.entries(lead.disposition_flags).slice(0, 8).map(([k, v]) => <Detail key={k} k={k.replace('eve ', '')} v={String(v)} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: any }) {
  return <div className="flex items-start justify-between gap-3 border-b border-dashed border-line py-1.5 text-sm last:border-0"><span className="text-slate-500">{k}</span><span className="text-right font-medium text-ink">{v}</span></div>;
}

function PhoneRow({ c, onPatch, showRel }: { c: any; onPatch: (id: string, b: any) => void; showRel?: boolean }) {
  const isMobile = c.phone_channel === 'mobile';
  return (
    <div className={`mt-2 rounded-lg border p-2 ${c.is_primary_number ? 'border-brand bg-brand/5' : 'border-line'}`}>
      <div className="flex items-center justify-between gap-2">
        <a href={`tel:${c.phone}`} className="font-mono font-semibold text-brand">{fmtNum(c.phone)}</a>
        <div className="flex items-center gap-1">
          <button title="Toggle verified" onClick={() => onPatch(c.contact_id, { phone_verified: !c.phone_verified })} className={`rounded p-1 ${c.phone_verified ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-400'}`}><BadgeCheck className="h-4 w-4" /></button>
          <button title="Set primary number" onClick={() => onPatch(c.contact_id, { is_primary_number: true })} className={`rounded p-1 ${c.is_primary_number ? 'text-brand' : 'text-slate-300 hover:text-slate-400'}`}><Star className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${isMobile ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{isMobile ? <Smartphone className="h-3 w-3" /> : <Phone className="h-3 w-3" />}{c.phone_channel}</span>
        {c.phone_verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">✓ verified</span>}
        {c.is_primary_number && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-brand">★ primary</span>}
        {showRel && c.related_name && <span className="text-slate-500">{c.related_name}{c.relation_type ? ` · ${c.relation_type}` : ''}</span>}
        {!showRel && c.phone_label && <span className="text-slate-500">{c.phone_label}</span>}
      </div>
    </div>
  );
}
