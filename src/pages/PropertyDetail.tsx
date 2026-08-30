import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../lib/workspace';
import { listings, Property, Party, Branding, Profile, PROPERTY_TYPES, PARTY_ROLES } from '../lib/listings';
import { LoadingBlock } from '../components/dash';
import {
  ChevronLeft, Wand2, Save, Globe, Lock, Trash2, Plus, MapPin, ExternalLink, Building2,
  DollarSign, Users, ImagePlus, X, Loader2, Search, UserPlus, Archive, BadgeCheck, Shield,
} from 'lucide-react';

const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString());
const num = (v: any): number | null => { if (v === '' || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; };
const roleLabel = (r: string) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fullAddr = (p: Partial<Property>) => [p.street, p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const stateOf = (p: Partial<Property>) => String(p.state || '').trim().toUpperCase();
const mapsUrl = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
const googleUrl = (a: string) => `https://www.google.com/search?q=${encodeURIComponent(a)}`;
const propertySharkUrl = (a: string) => `https://www.propertyshark.com/mason/Property-Search/?q=${encodeURIComponent(a)}`;
const miamiDadeUrl = (a: string) => `https://www.miamidade.gov/Apps/PA/PropertySearch/#/?folio=&address=${encodeURIComponent(a)}`;
const slugCity = (p: Partial<Property>) => [p.city, p.state, p.zip].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function Input({ label, value, onChange, placeholder, type = 'text', className = '' }: { label: string; value: any; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
    </label>
  );
}
function Card({ title, icon: Icon, right, children, tone }: { title: string; icon?: any; right?: any; children: any; tone?: 'internal' }) {
  return (
    <div className={`card p-5 ${tone === 'internal' ? 'border-amber-300 bg-amber-50/40' : ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">{Icon && <Icon className="h-4 w-4 text-brand" />}{title}
          {tone === 'internal' && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900"><Shield className="h-3 w-3" />Internal only</span>}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

const blank: Partial<Property> = { title: '', status: 'off_market', visibility: 'private', property_type: 'single_family', media: [], specs: {} };

export default function PropertyDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const isNew = id === 'new';
  const { active, isStaff, roles } = useWorkspace();
  const wsAdmin = isStaff || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);

  const [p, setP] = useState<Partial<Property>>({ ...blank });
  const [parties, setParties] = useState<Party[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [listingUser, setListingUser] = useState<Profile | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (isNew) { setLoading(false); return; }
    setLoading(true);
    listings.get(id).then((d: any) => {
      setP(d.property); setParties(d.parties || []); setBranding(d.branding || null);
      setListingUser(d.listing_user || null); setCanEdit(!!d.can_edit);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [id, isNew]);
  useEffect(() => { load(); }, [load]);

  const set = (k: keyof Property, v: any) => setP((prev) => ({ ...prev, [k]: v }));
  const margin = useMemo(() => {
    const d = num(p.disposition_price), a = num(p.acquisition_price);
    if (d == null || a == null) return { abs: null as number | null, pct: null as number | null };
    return { abs: d - a, pct: a ? ((d - a) / a) * 100 : null };
  }, [p.disposition_price, p.acquisition_price]);

  const autofill = async () => {
    const addr = fullAddr(p) || (p.street || '');
    if (!addr) { setErr('Enter at least a street + city/state to look up.'); return; }
    setLooking(true); setErr(null); setMsg(null);
    try {
      const d: any = await listings.addressLookup(addr);
      const f = d.fields || {};
      setP((prev) => {
        const nx: any = { ...prev };
        for (const k of ['street', 'city', 'state', 'zip', 'county', 'lat', 'lng', 'beds', 'baths', 'half_baths', 'sqft', 'lot_sqft', 'year_built', 'units', 'stories', 'zoning', 'property_type']) {
          if (f[k] != null && (nx[k] == null || nx[k] === '')) nx[k] = f[k];
        }
        return nx;
      });
      setMsg('Auto-filled from RealEstateAPI. Review and adjust as needed.');
    } catch (e: any) { setErr(e.message || 'Lookup failed'); } finally { setLooking(false); }
  };

  const save = async () => {
    if (!p.title) { setErr('Give the listing a title first.'); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      if (isNew) {
        const d: any = await listings.create(p);
        nav(`/properties/${d.property.id}`, { replace: true });
      } else {
        const d: any = await listings.update({ ...p, id } as any);
        setP(d.property); setMsg('Saved.');
      }
    } catch (e: any) { setErr(e.message || 'Save failed'); } finally { setSaving(false); }
  };

  const togglePublish = async () => {
    if (isNew) return;
    setSaving(true);
    try {
      const d: any = p.visibility === 'public' ? await listings.unpublish(id) : await listings.publish(id);
      setP(d.property);
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };
  const doArchive = async () => {
    if (isNew || !confirm('Archive this listing? It will be hidden from the list (reversible).')) return;
    try { await listings.archive(id); nav('/properties'); } catch (e: any) { setErr(e.message); }
  };

  // media
  const addMedia = (type: 'image' | 'video') => set('media', [...(p.media || []), { url: '', type }] as any);
  const setMedia = (i: number, k: string, v: string) => set('media', (p.media || []).map((m, j) => (j === i ? { ...m, [k]: v } : m)) as any);
  const rmMedia = (i: number) => set('media', (p.media || []).filter((_, j) => j !== i) as any);

  if (loading) return <LoadingBlock label="Loading listing…" />;

  const addr = fullAddr(p);
  const st = stateOf(p);
  const publicUrl = branding?.firm_name || active ? `1propertymarket.com/${(branding?.firm_name || active || 'firm').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${slugCity(p) || 'city'}/${p.slug || 'listing'}` : '';

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button onClick={() => nav('/properties')} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-ink"><ChevronLeft className="h-4 w-4" /> Properties</button>
        <div className="flex items-center gap-2">
          {!isNew && <button onClick={doArchive} disabled={!canEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-50"><Archive className="h-4 w-4" /> Archive</button>}
          {!isNew && <button onClick={togglePublish} disabled={!canEdit || saving} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50 ${p.visibility === 'public' ? 'bg-slate-700' : 'bg-brand'}`}>{p.visibility === 'public' ? <><Lock className="h-4 w-4" /> Unpublish</> : <><Globe className="h-4 w-4" /> Publish</>}</button>}
          <button onClick={save} disabled={!canEdit || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {isNew ? 'Create listing' : 'Save'}</button>
        </div>
      </div>

      {(msg || err) && <div className={`mb-4 rounded-lg border p-3 text-sm ${err ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>{err || msg}</div>}
      {!canEdit && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">You have view-only access to this listing.</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          {/* Header */}
          <Card title="Listing" icon={Building2}>
            <div className="flex flex-col gap-3">
              <Input label="Title" value={p.title} onChange={(v) => set('title', v)} placeholder="e.g. Bergen St 3-Family — value-add" />
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Market status</span>
                  <select value={p.status} onChange={(e) => set('status', e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="off_market">Off-market</option><option value="on_market">On-market</option></select></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Visibility</span>
                  <select value={p.visibility} onChange={(e) => set('visibility', e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="private">Private</option><option value="public">Public</option></select></label>
                <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Type</span>
                  <select value={p.property_type || ''} onChange={(e) => set('property_type', e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">{PROPERTY_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></label>
              </div>
              {p.status === 'off_market' && <p className="text-xs text-amber-700">Off-market: the public teaser will hide the street address until a buyer is qualified and signs.</p>}
            </div>
          </Card>

          {/* Address + auto-fill */}
          <Card title="Address" icon={MapPin} right={<button onClick={autofill} disabled={looking} className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-light/40 px-3 py-1.5 text-sm font-bold text-brand disabled:opacity-50">{looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Auto-fill from address</button>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Input label="Street" value={p.street} onChange={(v) => set('street', v)} className="col-span-2 md:col-span-3" />
              <Input label="Unit" value={p.unit} onChange={(v) => set('unit', v)} />
              <Input label="City" value={p.city} onChange={(v) => set('city', v)} />
              <Input label="State" value={p.state} onChange={(v) => set('state', v)} />
              <Input label="ZIP" value={p.zip} onChange={(v) => set('zip', v)} />
              <Input label="County" value={p.county} onChange={(v) => set('county', v)} />
            </div>
            {addr && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={mapsUrl(addr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface"><MapPin className="h-3 w-3" /> Google Maps <ExternalLink className="h-3 w-3" /></a>
                {st === 'NY' && <a href={propertySharkUrl(addr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface">PropertyShark <ExternalLink className="h-3 w-3" /></a>}
                {st === 'FL' && <a href={miamiDadeUrl(addr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface">Miami-Dade <ExternalLink className="h-3 w-3" /></a>}
                <a href={googleUrl(addr)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface">Google <ExternalLink className="h-3 w-3" /></a>
              </div>
            )}
          </Card>

          {/* Specs */}
          <Card title="Specifications" icon={BadgeCheck}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Input label="Beds" value={p.beds} onChange={(v) => set('beds', v)} type="number" />
              <Input label="Baths" value={p.baths} onChange={(v) => set('baths', v)} type="number" />
              <Input label="Half baths" value={p.half_baths} onChange={(v) => set('half_baths', v)} type="number" />
              <Input label="Units" value={p.units} onChange={(v) => set('units', v)} type="number" />
              <Input label="Building sqft" value={p.sqft} onChange={(v) => set('sqft', v)} type="number" />
              <Input label="Lot sqft" value={p.lot_sqft} onChange={(v) => set('lot_sqft', v)} type="number" />
              <Input label="Year built" value={p.year_built} onChange={(v) => set('year_built', v)} type="number" />
              <Input label="Stories" value={p.stories} onChange={(v) => set('stories', v)} type="number" />
              <Input label="Parking" value={p.parking} onChange={(v) => set('parking', v)} />
              <Input label="Zoning" value={p.zoning} onChange={(v) => set('zoning', v)} />
            </div>
          </Card>

          {/* Narrative */}
          <Card title="Description" icon={Building2}>
            <div className="flex flex-col gap-3">
              <Input label="Headline (public teaser)" value={p.headline} onChange={(v) => set('headline', v)} placeholder="e.g. Cash-flowing 3-family in prime Prospect Heights" />
              <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Full description</span>
                <textarea value={p.description || ''} onChange={(e) => set('description', e.target.value)} rows={5} className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" placeholder="Condition, upside, financials, notes…" /></label>
            </div>
          </Card>

          {/* Media */}
          <Card title="Photos & videos" icon={ImagePlus} right={<div className="flex gap-2"><button onClick={() => addMedia('image')} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface"><Plus className="h-3 w-3" /> Image</button><button onClick={() => addMedia('video')} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface"><Plus className="h-3 w-3" /> Video</button></div>}>
            {(p.media || []).length === 0 ? <p className="text-xs text-slate-400">No media yet. Add image or video URLs — these appear on the public teaser.</p> : (
              <div className="flex flex-col gap-2">
                {(p.media || []).map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 rounded bg-slate-100 px-2 py-1 text-center text-[10px] font-bold uppercase text-slate-500">{m.type}</span>
                    <input value={m.url} onChange={(e) => setMedia(i, 'url', e.target.value)} placeholder="https://…" className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-brand" />
                    <input value={m.caption || ''} onChange={(e) => setMedia(i, 'caption', e.target.value)} placeholder="caption" className="w-32 rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
                    <button onClick={() => rmMedia(i)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Parties */}
          <PartiesCard propertyId={isNew ? null : id} parties={parties} reload={load} canEdit={canEdit} />
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-5">
          {/* Pricing — internal */}
          <Card title="Deal economics" icon={DollarSign} tone="internal">
            <div className="flex flex-col gap-3">
              <Input label="Acquisition price (buy)" value={p.acquisition_price} onChange={(v) => set('acquisition_price', v)} type="number" placeholder="Internal" />
              <div className="rounded-lg border border-amber-300 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase text-slate-500">Margin (internal)</div>
                <div className={`text-xl font-extrabold ${margin.abs == null ? 'text-slate-400' : margin.abs >= 0 ? 'text-green-700' : 'text-red-600'}`}>{margin.abs == null ? '—' : money(margin.abs)}{margin.pct != null && <span className="ml-2 text-sm font-bold text-slate-500">{margin.pct >= 0 ? '+' : ''}{margin.pct.toFixed(1)}%</span>}</div>
              </div>
              <div className="border-t border-amber-200 pt-3">
                <Input label="Disposition price (SELL — public)" value={p.disposition_price} onChange={(v) => set('disposition_price', v)} type="number" placeholder="Shown publicly" />
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-brand"><Globe className="h-3 w-3" /> This is the only price shown on the public listing.</p>
              </div>
            </div>
          </Card>

          {/* Assignment */}
          <Card title="Assignment" icon={Users}>
            <Input label="Assigned to (email/name)" value={p.assigned_to} onChange={(v) => set('assigned_to', v)} placeholder="agent@firm.com" />
            <p className="mt-1 text-[11px] text-slate-500">The assigned user owns this listing and their profile shows as the listing agent.</p>
          </Card>

          {/* Public link + branding preview */}
          <Card title="Public teaser" icon={Globe}>
            <div className="flex flex-col gap-2 text-sm">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Public URL (Phase 2)</div>
              <div className="break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{publicUrl}</div>
              <div className="flex items-center gap-2 rounded-lg border border-line p-2">
                {branding?.logo_url ? <img src={branding.logo_url} className="h-8 w-8 rounded object-contain" alt="" /> : <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-light text-brand"><Building2 className="h-4 w-4" /></div>}
                <div className="min-w-0"><div className="truncate text-sm font-bold text-ink">{branding?.firm_name || branding?.brand_name || active}</div>{branding?.license_number && <div className="text-[11px] text-slate-500">Lic. {branding.license_number}</div>}</div>
              </div>
              {listingUser && <div className="flex items-center gap-2 rounded-lg border border-line p-2">
                {listingUser.photo_url ? <img src={listingUser.photo_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Users className="h-4 w-4" /></div>}
                <div className="min-w-0"><div className="truncate text-sm font-bold text-ink">{listingUser.name}</div><div className="truncate text-[11px] text-slate-500">{listingUser.title || 'Listing agent'}</div></div>
              </div>}
              <p className="text-[11px] text-slate-400">Public teaser pages (lead capture + NDA e-sign) ship in Phase 2.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---- Parties (contacts + teammates with roles) ----
function PartiesCard({ propertyId, parties, reload, canEdit }: { propertyId: string | null; parties: Party[]; reload: () => void; canEdit: boolean }) {
  const [adding, setAdding] = useState<'contact' | 'team' | null>(null);
  const [role, setRole] = useState('buyer');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (adding === 'team' && members.length === 0) listings.members().then((d: any) => setMembers(d.members || [])).catch(() => {}); }, [adding]);
  useEffect(() => {
    if (adding !== 'contact') return;
    const t = setTimeout(() => { listings.searchContacts(q).then((d: any) => setResults(d.contacts || [])).catch(() => setResults([])); }, 250);
    return () => clearTimeout(t);
  }, [q, adding]);

  const addContact = async (c: any) => {
    if (!propertyId) return; setBusy(true);
    try { await listings.assignParty({ property_id: propertyId, role, contact_id: c.contact_id, lead_id: c.lead_id, name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' '), email: c.email, phone: c.phone }); setAdding(null); setQ(''); reload(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const addTeam = async (m: any) => {
    if (!propertyId) return; setBusy(true);
    try { await listings.assignParty({ property_id: propertyId, role, user_id: m.id, name: m.name, email: m.email }); setAdding(null); reload(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const remove = async (pid: string) => { setBusy(true); try { await listings.removeParty(pid); reload(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const changeRole = async (pid: string, r: string) => { try { await listings.updateParty({ id: pid, role: r }); reload(); } catch (e: any) { alert(e.message); } };

  return (
    <Card title="People on this property" icon={Users} right={canEdit && propertyId ? (
      <div className="flex gap-2">
        <button onClick={() => setAdding(adding === 'contact' ? null : 'contact')} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface"><Plus className="h-3 w-3" /> Contact</button>
        <button onClick={() => setAdding(adding === 'team' ? null : 'team')} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-surface"><UserPlus className="h-3 w-3" /> Teammate</button>
      </div>
    ) : undefined}>
      {!propertyId && <p className="text-xs text-amber-700">Create the listing first, then attach buyers, sellers, brokers and teammates.</p>}

      {adding && (
        <div className="mb-3 rounded-xl border border-line bg-surface p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase text-slate-500">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-sm">{PARTY_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
          </div>
          {adding === 'contact' ? (
            <>
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search contacts by name, phone, email…" className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand" /></div>
              <div className="mt-2 max-h-52 overflow-y-auto">
                {results.map((c) => (
                  <button key={c.contact_id} disabled={busy} onClick={() => addContact(c)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white">
                    <span className="min-w-0"><span className="block truncate font-semibold text-ink">{c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'}</span><span className="block truncate text-xs text-slate-500">{c.phone || c.email || ''}</span></span>
                    <Plus className="h-4 w-4 shrink-0 text-brand" />
                  </button>
                ))}
                {q && results.length === 0 && <p className="px-2 py-2 text-xs text-slate-400">No contacts found.</p>}
              </div>
            </>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              {members.map((m) => (
                <button key={m.id} disabled={busy} onClick={() => addTeam(m)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white">
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{m.name}</span><span className="block truncate text-xs text-slate-500">{m.title || m.workspace_role} · {m.email}</span></span>
                  <Plus className="h-4 w-4 shrink-0 text-brand" />
                </button>
              ))}
              {members.length === 0 && <p className="px-2 py-2 text-xs text-slate-400">No teammates in this workspace.</p>}
            </div>
          )}
        </div>
      )}

      {parties.length === 0 && !adding ? <p className="text-xs text-slate-400">No people attached yet.</p> : (
        <div className="flex flex-col divide-y divide-line">
          {parties.map((pt) => (
            <div key={pt.id} className="flex items-center gap-3 py-2">
              {pt.party_kind === 'user' && pt.user?.photo_url ? <img src={pt.user.photo_url} className="h-8 w-8 rounded-full object-cover" alt="" /> : <div className={`flex h-8 w-8 items-center justify-center rounded-full ${pt.party_kind === 'user' ? 'bg-brand-light text-brand' : 'bg-slate-100 text-slate-400'}`}><Users className="h-4 w-4" /></div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{pt.name || pt.user?.name || 'Unnamed'} {pt.party_kind === 'user' && <span className="ml-1 rounded bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand">Team</span>}</div>
                <div className="truncate text-xs text-slate-500">{pt.phone || pt.email || pt.user?.email || ''}</div>
              </div>
              {canEdit ? (
                <select value={pt.role} onChange={(e) => changeRole(pt.id, e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold">{PARTY_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
              ) : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{roleLabel(pt.role)}</span>}
              {canEdit && <button onClick={() => remove(pt.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
