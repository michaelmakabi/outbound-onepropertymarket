import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../lib/workspace';
import { listings, Property, Branding, Profile, PROPERTY_TYPES } from '../lib/listings';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, ToolbarButton, SlideOver } from '../components/dash';
import {
  Building2, Plus, Search, MapPin, LayoutGrid, Map as MapIcon, Home, DollarSign, Globe, Lock,
  SlidersHorizontal, X, Palette, UserCircle, Save, BedDouble, Bath, Ruler, Tag, BadgeCheck,
} from 'lucide-react';

const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString());
const moneyK = (n: number | null | undefined) => {
  if (n == null) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'K';
  return '$' + Math.round(v).toLocaleString();
};
const typeLabel = (v: string | null) => PROPERTY_TYPES.find((t) => t.v === v)?.label || (v ? v.replace(/_/g, ' ') : '—');
const fullAddr = (p: Property) => [p.street, p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');

// ---- dependency-free pin map (bounding-box scaled SVG, mirrors CueReport CompMap) ----
function PinMap({ items, onPick }: { items: Property[]; onPick: (p: Property) => void }) {
  const pts = items.filter((p) => p.lat != null && p.lng != null) as (Property & { lat: number; lng: number })[];
  if (!pts.length) return <EmptyState text="No listings have map coordinates yet. Add a property by address to place it on the map." />;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.15 || 0.02, padLng = (maxLng - minLng) * 0.15 || 0.02;
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
  const W = 1000, H = 520;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng || 1)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat || 1)) * H;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-[#eef2f6]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[520px] w-full">
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#dbe2ea" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />
        {pts.map((p) => {
          const on = p.status === 'on_market';
          const isH = hover === p.id;
          return (
            <g key={p.id} transform={`translate(${x(p.lng)},${y(p.lat)})`} className="cursor-pointer"
               onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => onPick(p)}>
              <circle r={isH ? 13 : 9} fill={on ? '#16a34a' : '#d97706'} fillOpacity={0.9} stroke="#fff" strokeWidth={2} />
              {p.disposition_price != null && (
                <g transform="translate(0,-16)">
                  <rect x={-26} y={-14} width={52} height={18} rx={9} fill="#0f172a" fillOpacity={isH ? 0.95 : 0.75} />
                  <text x={0} y={-1} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{moneyK(p.disposition_price)}</text>
                </g>
              )}
              {isH && (
                <g transform="translate(0,20)">
                  <rect x={-90} y={0} width={180} height={38} rx={6} fill="#0f172a" />
                  <text x={0} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{(p.title || 'Untitled').slice(0, 28)}</text>
                  <text x={0} y={30} textAnchor="middle" fontSize={10} fill="#cbd5e1">{[p.city, p.state].filter(Boolean).join(', ') || typeLabel(p.property_type)}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-2 flex gap-3 rounded-lg bg-white/90 px-3 py-1.5 text-[11px] font-semibold shadow">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" /> On-market</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" /> Off-market</span>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
    </label>
  );
}

// Larger, cleaner field for the side panels (bigger tap target + optional icon/hint).
function PInput({ label, value, onChange, placeholder, icon: Icon, hint, className = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; icon?: any; hint?: string; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15" />
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
function PanelSection({ title, children }: { title: string; children: any }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      {children}
    </div>
  );
}

// ---- Branding editor (admin) ----
function BrandingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [b, setB] = useState<Branding | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) listings.getBranding().then((d: any) => setB(d.branding || {})).catch(() => setB({} as any)); }, [open]);
  const set = (k: keyof Branding, v: string) => setB((p) => ({ ...(p as any), [k]: v }));
  const save = async () => { if (!b) return; setSaving(true); try { await listings.setBranding(b); onClose(); } catch (e: any) { alert(e.message); } finally { setSaving(false); } };
  const color = b?.primary_color && /^#?[0-9a-fA-F]{6}$/.test((b.primary_color || '').replace('#', '')) ? (b!.primary_color!.startsWith('#') ? b!.primary_color! : '#' + b!.primary_color) : '#0f766e';
  return (
    <SlideOver open={open} onClose={onClose} title="Workspace branding" icon={Palette} width="w-full sm:max-w-xl"
      footer={b ? <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save branding'}</button> : undefined}>
      {!b ? <LoadingBlock /> : (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-slate-500">Shown on every public listing page for this workspace — logo, firm name, license and contact details.</p>

          <PanelSection title="Brand">
            <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
              {b.logo_url ? <img src={b.logo_url} alt="logo" className="h-16 w-16 rounded-xl border border-line bg-white object-contain p-1" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line bg-white text-slate-300"><Building2 className="h-7 w-7" /></div>}
              <div className="min-w-0 flex-1"><PInput label="Logo URL" value={b.logo_url || ''} onChange={(v) => set('logo_url', v)} placeholder="https://…/logo.png" /></div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PInput label="Brand name" value={b.brand_name || ''} onChange={(v) => set('brand_name', v)} placeholder="1PropertyMarket" />
              <PInput label="Firm / company name" value={b.firm_name || ''} onChange={(v) => set('firm_name', v)} placeholder="Pitman Real Estate LLC" />
              <PInput label="License number" value={b.license_number || ''} onChange={(v) => set('license_number', v)} icon={BadgeCheck} placeholder="e.g. 10401234567" />
              <label className="flex flex-col gap-1.5"><span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Palette className="h-3.5 w-3.5 text-slate-400" />Primary color</span>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={(e) => set('primary_color', e.target.value)} className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-line bg-white p-1" />
                  <input value={b.primary_color || ''} onChange={(e) => set('primary_color', e.target.value)} placeholder="#0f766e" className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-brand" />
                </div></label>
            </div>
          </PanelSection>

          <PanelSection title="Contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PInput label="Website" value={b.website || ''} onChange={(v) => set('website', v)} icon={Globe} placeholder="firm.com" />
              <PInput label="Email" value={b.email || ''} onChange={(v) => set('email', v)} placeholder="hello@firm.com" />
              <PInput label="Phone" value={b.phone || ''} onChange={(v) => set('phone', v)} placeholder="(555) 555-5555" />
              <PInput label="Physical address" value={b.address || ''} onChange={(v) => set('address', v)} placeholder="123 Main St, City, ST" />
            </div>
          </PanelSection>
        </div>
      )}
    </SlideOver>
  );
}

// ---- My profile editor ----
function ProfilePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) listings.getProfile().then((d: any) => setP(d.profile || null)).catch(() => setP(null)); }, [open]);
  const set = (k: keyof Profile, v: string) => setP((prev) => ({ ...(prev as any), [k]: v }));
  const save = async () => { if (!p) return; setSaving(true); try { await listings.setProfile(p); onClose(); } catch (e: any) { alert(e.message); } finally { setSaving(false); } };
  return (
    <SlideOver open={open} onClose={onClose} title="My profile (shown on my listings)" icon={UserCircle} width="w-full sm:max-w-xl"
      footer={p ? <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save profile'}</button> : undefined}>
      {!p ? <LoadingBlock /> : (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-slate-500">Your details appear as the listing agent on properties assigned to you.</p>

          <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
            {p.photo_url ? <img src={p.photo_url} alt="me" className="h-16 w-16 rounded-full border border-line object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-line bg-white text-slate-300"><UserCircle className="h-8 w-8" /></div>}
            <div className="min-w-0 flex-1"><PInput label="Photo URL" value={p.photo_url || ''} onChange={(v) => set('photo_url', v)} placeholder="https://…/me.jpg" /></div>
          </div>

          <PanelSection title="Identity">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PInput label="Name" value={p.name || ''} onChange={(v) => set('name', v)} />
              <PInput label="Title" value={p.title || ''} onChange={(v) => set('title', v)} placeholder="Managing Broker" />
              <PInput label="Company / firm" value={p.company || ''} onChange={(v) => set('company', v)} />
              <PInput label="License number" value={p.license_number || ''} onChange={(v) => set('license_number', v)} icon={BadgeCheck} />
            </div>
          </PanelSection>

          <PanelSection title="Contact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PInput label="Direct phone" value={p.phone || ''} onChange={(v) => set('phone', v)} />
              <PInput label="Company phone" value={p.company_phone || ''} onChange={(v) => set('company_phone', v)} />
              <PInput label="Website" value={p.website || ''} onChange={(v) => set('website', v)} icon={Globe} />
              <PInput label="Physical address" value={p.address || ''} onChange={(v) => set('address', v)} />
            </div>
          </PanelSection>
        </div>
      )}
    </SlideOver>
  );
}

const empty = { status: '', visibility: '', property_type: '', state: '', city: '', min: '', max: '' };

export default function Properties() {
  const nav = useNavigate();
  const { active, isStaff, roles } = useWorkspace();
  const wsAdmin = isStaff || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);
  const [rows, setRows] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ ...empty });
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [sort, setSort] = useState('updated');
  const [brandOpen, setBrandOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    listings.list().then((d: any) => setRows(d.properties || [])).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [active]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let r = rows.slice();
    const t = q.toLowerCase().trim();
    if (t) r = r.filter((p) => [p.title, p.headline, p.street, p.city, p.state, p.zip, p.slug, typeLabel(p.property_type)].filter(Boolean).join(' ').toLowerCase().includes(t));
    if (f.status) r = r.filter((p) => p.status === f.status);
    if (f.visibility) r = r.filter((p) => p.visibility === f.visibility);
    if (f.property_type) r = r.filter((p) => p.property_type === f.property_type);
    if (f.state) r = r.filter((p) => (p.state || '').toLowerCase() === f.state.toLowerCase());
    if (f.city) r = r.filter((p) => (p.city || '').toLowerCase().includes(f.city.toLowerCase()));
    if (f.min) r = r.filter((p) => (p.disposition_price || 0) >= Number(f.min));
    if (f.max) r = r.filter((p) => (p.disposition_price || 0) <= Number(f.max));
    r.sort((a, b) => {
      if (sort === 'price_desc') return (b.disposition_price || 0) - (a.disposition_price || 0);
      if (sort === 'price_asc') return (a.disposition_price || 0) - (b.disposition_price || 0);
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });
    return r;
  }, [rows, q, f, sort]);

  const activeFilterCount = Object.values(f).filter(Boolean).length;
  const kpi = useMemo(() => {
    const on = filtered.filter((p) => p.status === 'on_market').length;
    const pub = filtered.filter((p) => p.visibility === 'public').length;
    const val = filtered.reduce((s, p) => s + (Number(p.disposition_price) || 0), 0);
    return { total: filtered.length, on, off: filtered.length - on, pub, val };
  }, [filtered]);

  const states = useMemo(() => [...new Set(rows.map((p) => p.state).filter(Boolean))].sort() as string[], [rows]);

  return (
    <div>
      <PageHeader title="Properties" description={`${rows.length} listing${rows.length === 1 ? '' : 's'} in this workspace`} showDate={false}
        actions={
          <>
            <ToolbarButton icon={UserCircle} label="My profile" onClick={() => setProfOpen(true)} />
            {wsAdmin && <ToolbarButton icon={Palette} label="Branding" onClick={() => setBrandOpen(true)} />}
            <button onClick={() => nav('/properties/new')} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand/90">
              <Plus className="h-4 w-4" /> Add property
            </button>
          </>
        } />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Listings" value={String(kpi.total)} icon={Building2} accent="blue" sub={activeFilterCount || q ? 'filtered' : undefined} />
        <KpiCard label="On-market" value={String(kpi.on)} icon={Home} accent="green" />
        <KpiCard label="Off-market" value={String(kpi.off)} icon={Lock} accent="amber" />
        <KpiCard label="Public" value={String(kpi.pub)} icon={Globe} accent="default" />
        <KpiCard label="Total disposition value" value={moneyK(kpi.val)} icon={DollarSign} accent="green" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, address, city…"
            className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand" />
        </div>
        <ToolbarButton icon={SlidersHorizontal} label="Filters" count={activeFilterCount} active={showFilters} onClick={() => setShowFilters((s) => !s)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand">
          <option value="updated">Recently updated</option>
          <option value="price_desc">Price: high → low</option>
          <option value="price_asc">Price: low → high</option>
          <option value="title">Title A–Z</option>
        </select>
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button onClick={() => setView('grid')} className={`inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold ${view === 'grid' ? 'bg-brand text-white' : 'bg-white text-slate-600'}`}><LayoutGrid className="h-4 w-4" /> Grid</button>
          <button onClick={() => setView('map')} className={`inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold ${view === 'map' ? 'bg-brand text-white' : 'bg-white text-slate-600'}`}><MapIcon className="h-4 w-4" /> Map</button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-4 lg:grid-cols-7">
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Status</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"><option value="">Any</option><option value="on_market">On-market</option><option value="off_market">Off-market</option></select></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Visibility</span>
            <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"><option value="">Any</option><option value="public">Public</option><option value="private">Private</option></select></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">Type</span>
            <select value={f.property_type} onChange={(e) => setF({ ...f, property_type: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"><option value="">Any</option>{PROPERTY_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold uppercase text-slate-500">State</span>
            <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"><option value="">Any</option>{states.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <Field label="City" value={f.city} onChange={(v) => setF({ ...f, city: v })} />
          <Field label="Min $" value={f.min} onChange={(v) => setF({ ...f, min: v })} type="number" />
          <Field label="Max $" value={f.max} onChange={(v) => setF({ ...f, max: v })} type="number" />
          {activeFilterCount > 0 && <button onClick={() => setF({ ...empty })} className="col-span-full inline-flex w-fit items-center gap-1 text-xs font-semibold text-slate-500 hover:text-ink"><X className="h-3 w-3" /> Clear filters</button>}
        </div>
      )}

      {loading ? <LoadingBlock label="Loading listings…" /> :
       err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> :
       filtered.length === 0 ? <EmptyState text={rows.length === 0 ? 'No listings yet. Click “Add property” to create your first one — you can auto-fill it from an address.' : 'No listings match your filters.'} /> :
       view === 'map' ? <SectionCard title="Map" description="Click a pin to open the listing"><PinMap items={filtered} onPick={(p) => nav(`/properties/${p.id}`)} /></SectionCard> :
       (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const cover = (p.media || []).find((m) => m.type === 'image')?.url;
            return (
              <button key={p.id} onClick={() => nav(`/properties/${p.id}`)} className="card group overflow-hidden text-left transition hover:border-brand/40 hover:shadow-md">
                <div className="relative h-40 w-full bg-slate-100">
                  {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-300"><Building2 className="h-10 w-10" /></div>}
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${p.status === 'on_market' ? 'bg-green-600' : 'bg-amber-600'}`}>{p.status === 'on_market' ? 'On-market' : 'Off-market'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.visibility === 'public' ? 'bg-brand text-white' : 'bg-slate-800/80 text-white'}`}>{p.visibility === 'public' ? 'Public' : 'Private'}</span>
                  </div>
                  {p.disposition_price != null && <span className="absolute bottom-2 right-2 rounded-lg bg-black/75 px-2 py-1 text-sm font-extrabold text-white">{money(p.disposition_price)}</span>}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-bold text-ink">{p.title || 'Untitled listing'}</div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                    <MapPin className="h-3 w-3 shrink-0" />{p.status === 'off_market' ? [p.city, p.state].filter(Boolean).join(', ') || 'Location hidden' : fullAddr(p) || '—'}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-600">
                    <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{typeLabel(p.property_type)}</span>
                    {p.beds != null && <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" />{p.beds}</span>}
                    {p.baths != null && <span className="flex items-center gap-1"><Bath className="h-3 w-3" />{p.baths}</span>}
                    {p.sqft != null && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{Math.round(p.sqft).toLocaleString()} sf</span>}
                    {(p.party_count || 0) > 0 && <span className="text-slate-400">· {p.party_count} contact{p.party_count === 1 ? '' : 's'}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <BrandingPanel open={brandOpen} onClose={() => setBrandOpen(false)} />
      <ProfilePanel open={profOpen} onClose={() => setProfOpen(false)} />
    </div>
  );
}
