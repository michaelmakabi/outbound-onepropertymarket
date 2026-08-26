import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { PageHeader, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { usd, num } from '../lib/format';
import {
  ArrowLeft, RefreshCw, Loader2, MapPin, DollarSign, TrendingUp, Home, Ruler,
  Building2, Landmark, ShieldAlert, BadgeCheck, User, FileText, AlertTriangle,
} from 'lucide-react';

// ---- small helpers -------------------------------------------------------
const n = (v: any): number | null => { const x = Number(String(v ?? '').replace(/[^0-9.-]/g, '')); return isFinite(x) && String(v ?? '').trim() !== '' ? x : null; };
const money = (v: any) => { const x = n(v); return x == null ? '—' : usd(x); };
const money0 = (v: any) => { const x = n(v); return x == null ? '—' : usd(Math.round(x)); };
const int = (v: any) => { const x = n(v); return x == null ? '—' : num(Math.round(x)); };
const dateStr = (v: any) => { if (!v) return '—'; const d = new Date(v); return isNaN(+d) ? String(v) : d.toLocaleDateString(); };

function KV({ k, v, strong }: { k: string; v: any; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <span className="text-xs text-slate-500">{k}</span>
      <span className={`text-right text-sm ${strong ? 'font-bold text-ink' : 'font-medium text-ink'}`}>{v ?? '—'}</span>
    </div>
  );
}

function Flag({ on, label, tone = 'amber' }: { on: any; label: string; tone?: 'red' | 'amber' | 'green' | 'slate' }) {
  const active = on === true || on === 'true' || on === 1;
  const tones: Record<string, string> = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    slate: 'bg-slate-100 text-slate-500 border-line',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${active ? tones[tone] : 'border-line bg-white text-slate-300'}`}>
      {active ? <BadgeCheck className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
      {label}
    </span>
  );
}

// ---- comps SVG mini-map (no external tiles/deps) -------------------------
function CompMap({ subject, comps }: { subject: { lat: number | null; lng: number | null }; comps: any[] }) {
  const pts = comps
    .map((c) => ({ lat: n(c.latitude), lng: n(c.longitude), c }))
    .filter((p) => p.lat != null && p.lng != null) as { lat: number; lng: number; c: any }[];
  const sLat = subject.lat, sLng = subject.lng;
  const all = [...pts.map((p) => ({ lat: p.lat, lng: p.lng })), ...(sLat != null && sLng != null ? [{ lat: sLat, lng: sLng }] : [])];
  if (all.length < 2) return <EmptyState text="Not enough geocoded comparables to map." />;
  const lats = all.map((a) => a.lat), lngs = all.map((a) => a.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const W = 640, H = 380, pad = 34;
  const padLat = (maxLat - minLat) * 0.12 || 0.004, padLng = (maxLng - minLng) * 0.12 || 0.004;
  const x = (lng: number) => pad + ((lng - (minLng - padLng)) / ((maxLng + padLng) - (minLng - padLng))) * (W - pad * 2);
  const y = (lat: number) => pad + (1 - (lat - (minLat - padLat)) / ((maxLat + padLat) - (minLat - padLat))) * (H - pad * 2);
  const now = Date.now();
  const recency = (c: any) => { const d = c.lastSaleDate ? new Date(c.lastSaleDate).getTime() : 0; const months = d ? (now - d) / (1000 * 3600 * 24 * 30) : 999; return months <= 6 ? '#059669' : months <= 12 ? '#0ea5e9' : '#94a3b8'; };
  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px] rounded-xl border border-line bg-[#f6f8fb]">
          {[0.25, 0.5, 0.75].map((f) => (<line key={'h' + f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke="#e6ebf2" />))}
          {[0.25, 0.5, 0.75].map((f) => (<line key={'v' + f} y1={pad} y2={H - pad} x1={pad + f * (W - pad * 2)} x2={pad + f * (W - pad * 2)} stroke="#e6ebf2" />))}
          {sLat != null && sLng != null && pts.map((p, i) => (
            <line key={'l' + i} x1={x(sLng)} y1={y(sLat)} x2={x(p.lng)} y2={y(p.lat)} stroke="#cbd5e1" strokeDasharray="2 3" />
          ))}
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={x(p.lng)} cy={y(p.lat)} r={7} fill={recency(p.c)} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} />
              <title>{`${p.c.address?.address || 'Comp'} — ${money0(p.c.lastSaleAmount)} · ${dateStr(p.c.lastSaleDate)} · ${p.c.distance ?? '?'} mi`}</title>
            </g>
          ))}
          {sLat != null && sLng != null && (
            <g>
              <circle cx={x(sLng)} cy={y(sLat)} r={11} fill="#1f6feb" stroke="#fff" strokeWidth={2.5} />
              <circle cx={x(sLng)} cy={y(sLat)} r={4} fill="#fff" />
              <title>Subject property</title>
            </g>
          )}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-brand" /> Subject</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: '#059669' }} /> Sold ≤6 mo</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: '#0ea5e9' }} /> ≤12 mo</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: '#94a3b8' }} /> Older</span>
      </div>
    </div>
  );
}

export default function CueReport() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    opm.cueGet(id).then((d: any) => setReport(d.report)).catch((e: any) => setError(String(e?.message || e))).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true); setError('');
    try { const d: any = await opm.cueGenerate(id); setReport(d.report); }
    catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  };

  const subj = report?.subject || {};
  const pi = subj.propertyInfo || {};
  const lot = subj.lotInfo || {};
  const tax = subj.taxInfo || {};
  const own = subj.ownerInfo || {};
  const avm = report?.avm || {};
  const rent = report?.rent || {};
  const comps: any[] = Array.isArray(report?.comps) ? report.comps : [];
  const dealPrice = n(report?.meta?.deal_price);

  const compStats = useMemo(() => {
    const psf = comps.map((c) => { const s = n(c.squareFeet), v = n(c.lastSaleAmount) ?? n(c.estimatedValue); return s && v ? v / s : null; }).filter((x): x is number => x != null).sort((a, b) => a - b);
    const sales = comps.map((c) => n(c.lastSaleAmount)).filter((x): x is number => x != null);
    const med = (a: number[]) => a.length ? a[Math.floor(a.length / 2)] : null;
    return { medPsf: med(psf), avgSale: sales.length ? sales.reduce((s, x) => s + x, 0) / sales.length : null };
  }, [comps]);

  const rentMid = n(rent.fmrTwoBedroom);
  const grossYield = rentMid && avm.value ? (rentMid * 12) / avm.value : null;
  const spread = dealPrice && avm.value ? avm.value - dealPrice : null;

  if (loading) return <LoadingBlock label="Loading CUE report…" />;

  return (
    <div>
      <button onClick={() => nav(`/leads/${encodeURIComponent(id)}`)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> Back to lead</button>
      <PageHeader title="CUE Report" showDate={false}
        description={report ? `${report.address} · Comping · Underwriting · Evaluation${report.meta?.generated_at ? ` · updated ${new Date(report.meta.generated_at).toLocaleString()}` : ''}` : 'Comping · Underwriting · Evaluation'}
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-50" disabled={busy} onClick={generate}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {report ? 'Refresh data' : 'Generate report'}
          </button>
        } />

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!report ? (
        <SectionCard title="No CUE report yet" description="Pull comps, valuation, and evaluation data for this property.">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MapPin className="h-8 w-8 text-slate-300" />
            <p className="max-w-md text-sm text-slate-500">Generate a Comping · Underwriting · Evaluation report from live property records — comparable sales, an AVM value range, HUD rents, ownership, and deal indicators.</p>
            <button className="btn-primary" disabled={busy} onClick={generate}>{busy ? <><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Pulling data…</> : 'Generate CUE report'}</button>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {/* Evaluation hero — AVM range */}
          <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#0a2e73] to-[#1f6feb] p-6 text-white">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">CUE Underwriting AVM · Estimated Value</div>
                <div className="mt-1 text-4xl font-extrabold">{money0(avm.value)}</div>
                <div className="mt-1 text-sm text-white/80">Range {money0(avm.low)} – {money0(avm.high)}</div>
              </div>
              <div className="flex flex-wrap gap-6 text-right">
                <div><div className="text-[11px] uppercase text-white/60">Subject est. value</div><div className="text-xl font-bold">{money0(subj.estimatedValue)}</div></div>
                <div><div className="text-[11px] uppercase text-white/60">Est. equity</div><div className="text-xl font-bold">{money0(subj.estimatedEquity)}{subj.equityPercent != null ? ` · ${int(subj.equityPercent)}%` : ''}</div></div>
                {dealPrice != null && <div><div className="text-[11px] uppercase text-white/60">Deal price</div><div className="text-xl font-bold">{money0(dealPrice)}</div></div>}
              </div>
            </div>
            {/* range bar with deal + subject markers */}
            {avm.low != null && avm.high != null && avm.high > avm.low && (
              <div className="mt-5">
                <div className="relative h-2 rounded-full bg-white/25">
                  {(() => {
                    const lo = avm.low, hi = avm.high, at = (x: number) => `${Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100))}%`;
                    return (<>
                      <div className="absolute -top-0.5 h-3 w-3 -translate-x-1/2 rounded-full bg-white" style={{ left: at(avm.value) }} title="AVM" />
                      {dealPrice != null && <div className="absolute -top-0.5 h-3 w-3 -translate-x-1/2 rounded-full bg-emerald-300 ring-2 ring-white/40" style={{ left: at(dealPrice) }} title="Deal price" />}
                    </>);
                  })()}
                </div>
                {spread != null && (
                  <div className="mt-2 text-sm text-white/85">
                    {spread >= 0
                      ? <>Deal is <b>{money0(Math.abs(spread))}</b> below AVM — potential built-in equity.</>
                      : <>Deal is <b>{money0(Math.abs(spread))}</b> above AVM — priced over model value.</>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-line bg-white p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500"><DollarSign className="h-3.5 w-3.5" /> Last sale</div><div className="mt-1 text-xl font-extrabold text-ink">{money0(subj.lastSalePrice)}</div><div className="text-xs text-slate-400">{dateStr(subj.lastSaleDate)}</div></div>
            <div className="rounded-xl border border-line bg-white p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500"><Landmark className="h-3.5 w-3.5" /> Mortgage bal.</div><div className="mt-1 text-xl font-extrabold text-ink">{money0(subj.openMortgageBalance ?? subj.estimatedMortgageBalance)}</div><div className="text-xs text-slate-400">{subj.freeClear ? 'Free & clear' : 'Est. balance'}</div></div>
            <div className="rounded-xl border border-line bg-white p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500"><Home className="h-3.5 w-3.5" /> HUD rent (2BR)</div><div className="mt-1 text-xl font-extrabold text-ink">{money0(rentMid)}</div><div className="text-xs text-slate-400">Fair market rent{rent.fmrYear ? ` · ${rent.fmrYear}` : ''}</div></div>
            <div className="rounded-xl border border-line bg-white p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500"><TrendingUp className="h-3.5 w-3.5" /> Gross yield</div><div className="mt-1 text-xl font-extrabold text-ink">{grossYield != null ? `${(grossYield * 100).toFixed(1)}%` : '—'}</div><div className="text-xs text-slate-400">2BR rent ÷ AVM</div></div>
          </div>

          {/* Underwriting grid */}
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="Property" description="Physical characteristics">
              <KV k="Type" v={pi.propertyUse || subj.propertyType} />
              <KV k="Bedrooms" v={int(pi.bedrooms)} />
              <KV k="Bathrooms" v={int(pi.bathrooms)} />
              <KV k="Living area" v={pi.livingSquareFeet ? `${int(pi.livingSquareFeet)} sqft` : '—'} />
              <KV k="Lot size" v={lot.lotSquareFeet || pi.lotSquareFeet ? `${int(lot.lotSquareFeet || pi.lotSquareFeet)} sqft` : '—'} />
              <KV k="Year built" v={pi.yearBuilt || '—'} />
              <KV k="Stories / units" v={`${pi.stories || '—'} / ${pi.unitsCount || '—'}`} />
              <KV k="Zoning" v={lot.zoning || '—'} />
              <KV k="APN" v={lot.apn || '—'} />
            </SectionCard>
            <SectionCard title="Tax & underwriting" description="Assessment & financing">
              <KV k="Assessed value" v={money0(tax.assessedValue)} />
              <KV k="Market value" v={money0(tax.marketValue)} />
              <KV k="Land / improvement" v={`${money0(tax.assessedLandValue)} / ${money0(tax.assessedImprovementValue)}`} />
              <KV k="Tax amount" v={`${money0(tax.taxAmount)}${tax.year ? ` (${tax.year})` : ''}`} />
              <KV k="AVM value" v={money0(avm.value)} strong />
              <KV k="Est. equity" v={`${money0(subj.estimatedEquity)}${subj.equityPercent != null ? ` · ${int(subj.equityPercent)}%` : ''}`} />
              <KV k="Mortgage balance" v={money0(subj.openMortgageBalance)} />
              <KV k="Est. payment" v={money0(subj.estimatedMortgagePayment)} />
              <KV k="Last sale" v={`${money0(subj.lastSalePrice)} · ${dateStr(subj.lastSaleDate)}`} />
            </SectionCard>
            <SectionCard title="Ownership" description="Owner & occupancy">
              <KV k="Owner" v={own.owner1FullName || [own.owner1FirstName, own.owner1LastName].filter(Boolean).join(' ') || '—'} />
              <KV k="Company" v={own.companyName || '—'} />
              <KV k="Occupancy" v={own.ownerOccupied ? 'Owner-occupied' : (own.absenteeOwner ? 'Absentee' : '—')} />
              <KV k="Ownership length" v={own.ownershipLength ? `${own.ownershipLength} mo` : '—'} />
              <KV k="Mailing address" v={typeof own.mailAddress === 'object' ? (own.mailAddress?.label || own.mailAddress?.address || '—') : (own.mailAddress || '—')} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Flag on={subj.absenteeOwner} label="Absentee" tone="amber" />
                <Flag on={subj.corporateOwned} label="Corporate" tone="amber" />
                <Flag on={subj.outOfStateAbsenteeOwner} label="Out-of-state" tone="amber" />
              </div>
            </SectionCard>
          </div>

          {/* Evaluation indicators */}
          <SectionCard title="Evaluation indicators" description="Distress, equity & market signals from public records">
            <div className="flex flex-wrap gap-2">
              <Flag on={subj.highEquity} label="High equity" tone="green" />
              <Flag on={subj.freeClear} label="Free & clear" tone="green" />
              <Flag on={subj.vacant} label="Vacant" tone="red" />
              <Flag on={subj.preForeclosure} label="Pre-foreclosure" tone="red" />
              <Flag on={subj.auction} label="Auction" tone="red" />
              <Flag on={subj.taxLien} label="Tax lien" tone="red" />
              <Flag on={subj.lien} label="Lien" tone="red" />
              <Flag on={subj.bankOwned} label="Bank-owned (REO)" tone="red" />
              <Flag on={subj.inherited} label="Inherited" tone="amber" />
              <Flag on={subj.death} label="Death record" tone="amber" />
              <Flag on={subj.mlsActive} label="MLS active" tone="slate" />
              <Flag on={subj.cashBuyer} label="Cash buyer" tone="slate" />
              <Flag on={subj.floodZone} label={`Flood zone${subj.floodZoneDescription ? ' · ' + subj.floodZoneDescription : ''}`} tone="amber" />
            </div>
            {rent.medianIncome && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4 text-slate-400" /> Median income <b className="text-ink">{money0(rent.medianIncome)}</b></span>
                <span className="inline-flex items-center gap-1.5"><Home className="h-4 w-4 text-slate-400" /> FMR 1–4BR <b className="text-ink">{money0(rent.fmrOneBedroom)} · {money0(rent.fmrTwoBedroom)} · {money0(rent.fmrThreeBedroom)} · {money0(rent.fmrFourBedroom)}</b></span>
                {rent.hudAreaName && <span className="text-slate-400">{rent.hudAreaName}</span>}
              </div>
            )}
          </SectionCard>

          {/* Comping */}
          <SectionCard title={`Comparable sales · ${comps.length}`} description={`Within 1.5 mi${compStats.medPsf ? ` · median ${usd(Math.round(compStats.medPsf))}/sqft` : ''}${compStats.avgSale ? ` · avg sale ${money0(compStats.avgSale)}` : ''}`}>
            {comps.length === 0 ? <EmptyState text="No comparable sales returned for this property." /> : (
              <div className="space-y-4">
                <CompMap subject={report.meta?.subject_latlng || { lat: null, lng: null }} comps={comps} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Address</th>
                        <th className="px-3 py-2 text-right">Dist</th>
                        <th className="px-3 py-2 text-right">Bd/Ba</th>
                        <th className="px-3 py-2 text-right">SqFt</th>
                        <th className="px-3 py-2 text-right">Last sale</th>
                        <th className="px-3 py-2 text-right">Date</th>
                        <th className="px-3 py-2 text-right">Est. value</th>
                        <th className="px-3 py-2 text-right">$/sqft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comps.map((c, i) => {
                        const s = n(c.squareFeet), sale = n(c.lastSaleAmount);
                        const psf = s && sale ? sale / s : null;
                        return (
                          <tr key={c.id || i} className="border-t border-line">
                            <td className="px-3 py-2 font-medium text-ink">{c.address?.address || c.address?.street || '—'}
                              {(c.absenteeOwner || c.vacant || c.preForeclosure) && <span className="ml-1.5 align-middle text-[10px] text-amber-600">{c.vacant ? '· vacant' : c.preForeclosure ? '· pre-fcl' : '· absentee'}</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-500">{c.distance != null ? `${Number(c.distance).toFixed(2)}mi` : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono">{int(c.bedrooms)}/{int(c.bathrooms)}</td>
                            <td className="px-3 py-2 text-right font-mono">{int(c.squareFeet)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-ink">{money0(c.lastSaleAmount)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{dateStr(c.lastSaleDate)}</td>
                            <td className="px-3 py-2 text-right font-mono">{money0(c.estimatedValue)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-500">{psf != null ? usd(Math.round(psf)) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          <p className="flex items-center gap-1.5 px-1 text-xs text-slate-400"><FileText className="h-3.5 w-3.5" /> Data from RealEstateAPI · valuations are automated estimates for screening, not appraisals.</p>
        </div>
      )}
    </div>
  );
}
