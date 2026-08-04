import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { opm } from '../lib/api';
import { useAuth } from '../lib/auth';
import ImportWizard from '../components/ImportWizard';
import {
  PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState, MultiSelect, SavedViews,
  ColumnDef, ColumnToggleMenu, SortableHead, useClientTable,
} from '../components/dash';
import { num } from '../lib/format';
import { Contact, PhoneCall, BadgeCheck, Search, X, Download, ChevronLeft, ChevronRight, Smartphone, Phone, PhoneOutgoing, Loader2, CheckCircle2, AlertCircle, Upload } from 'lucide-react';

const PAGE_KEY = 'opm-contacts';
const PAGE_SIZE = 50;

// AI dialing — Adrian B aggressive outbound agent + rotating caller IDs (matches LeadDetail launcher)
const DIAL_AGENT = { id: 'agent_ee77a9e3c659964acc19d0be54', name: 'Adrian B (Aggressive) · OUTBOUND' };
const DIAL_NUMBERS = ['+18563634757', '+18563634758', '+18563634759', '+18563634760', '+18563634761', '+18563634762'];

function fmtNum(n: string) {
  const d = (n || '').replace(/\D/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Contact', required: true, sortKey: 'name' },
  { key: 'phone', label: 'Phone', sortKey: 'phone' },
  { key: 'channel', label: 'Type', sortKey: 'channel' },
  { key: 'verified', label: 'Verified', sortKey: 'verified' },
  { key: 'kind', label: 'Role', sortKey: 'kind' },
  { key: 'property', label: 'Property / Address', sortKey: 'property' },
  { key: 'crm_stage', label: 'Stage', sortKey: 'crm_stage' },
  { key: 'lead_source', label: 'Source', sortKey: 'lead_source' },
  { key: 'assigned_to', label: 'Assigned', sortKey: 'assigned_to' },
];

type ViewCfg = { kind: string; channel: string[]; verified: string; search: string; sort: any };

export default function SellerContacts() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [allRows, setAllRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('');
  const [channel, setChannel] = useState<string[]>([]);
  const [verified, setVerified] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  // ---- Bulk AI caller ----
  const [callModal, setCallModal] = useState(false);
  const [callFrom, setCallFrom] = useState<'rotate' | string>('rotate');
  const [gapSec, setGapSec] = useState(8);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; ok: number; fail: number; current: string }>({ done: 0, total: 0, ok: 0, fail: 0, current: '' });
  const [callLog, setCallLog] = useState<{ name: string; phone: string; ok: boolean; err?: string }[]>([]);

  useEffect(() => { setLoading(true); opm.sellerContacts().then((d) => setAllRows(d.contacts || [])).finally(() => setLoading(false)); }, []);

  const channelOpts = useMemo(() => {
    const s = new Set<string>(); allRows.forEach((r) => s.add(r.phone_channel || 'other'));
    return Array.from(s).sort().map((c) => ({ value: c, label: c }));
  }, [allRows]);

  const preFiltered = useMemo(() => allRows.filter((r) => {
    if (kind && r.contact_kind !== kind) return false;
    if (channel.length && !channel.includes(r.phone_channel || 'other')) return false;
    if (verified === 'yes' && !r.phone_verified) return false;
    if (verified === 'no' && r.phone_verified) return false;
    return true;
  }), [allRows, kind, channel, verified]);

  const getValue = useCallback((r: any, key: string): string | number => {
    switch (key) {
      case 'name': return r.lead_name || r.name || '';
      case 'phone': return r.phone || '';
      case 'channel': return r.phone_channel || '';
      case 'verified': return r.phone_verified ? 1 : 0;
      case 'kind': return r.contact_kind || '';
      case 'property': return `${r.property_ref || ''} ${r.address || ''}`;
      case 'crm_stage': return r.crm_stage || '';
      case 'lead_source': return r.lead_source || '';
      case 'assigned_to': return r.assigned_to || '';
      default: return '';
    }
  }, []);

  const { rows, search, setSearch, sort, setSort, isVisible, toggle } = useClientTable<any>({
    pageKey: PAGE_KEY, columns: COLUMNS, rows: preFiltered, getValue, initialSort: { by: 'name', dir: 'asc' },
  });

  useEffect(() => { setPage(1); }, [kind, channel, verified, search, sort]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = !!kind || channel.length > 0 || !!verified || !!search;
  const verifiedCount = allRows.filter((r) => r.phone_verified).length;

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.contact_id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); if (allOnPage) pageRows.forEach((r) => n.delete(r.contact_id)); else pageRows.forEach((r) => n.add(r.contact_id)); return n; });
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const currentCfg: ViewCfg = { kind, channel, verified, search, sort };
  const applyView = (c: ViewCfg) => { setKind(c.kind || ''); setChannel(c.channel || []); setVerified(c.verified || ''); setSearch(c.search || ''); setSort(c.sort || null); };

  const exportCsv = () => {
    const cols = ['#', 'Name', 'Phone', 'Type', 'Verified', 'Role', 'Property', 'Address', 'Stage', 'Source', 'Assigned', 'LeadID'];
    const src = selected.size ? rows.filter((r) => selected.has(r.contact_id)) : rows;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')];
    src.forEach((r, i) => lines.push([i + 1, r.lead_name || r.name, r.phone, r.phone_channel, r.phone_verified ? 'yes' : 'no', r.contact_kind, r.property_ref, r.address, r.crm_stage, r.lead_source, r.assigned_to, r.lead_id].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  // Rows queued for AI dialing: selected, dialable, de-duplicated by phone number
  const callQueue = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => selected.has(r.contact_id)).filter((r) => {
      const p = (r.phone || '').replace(/\D/g, '');
      if (p.length < 10 || seen.has(p)) return false;
      seen.add(p); return true;
    });
  }, [rows, selected]);

  async function runBulkCalls() {
    if (running || callQueue.length === 0) return;
    setRunning(true);
    setCallLog([]);
    setProgress({ done: 0, total: callQueue.length, ok: 0, fail: 0, current: '' });
    const gap = Math.max(2, gapSec) * 1000;
    let ok = 0, fail = 0;
    for (let i = 0; i < callQueue.length; i++) {
      const r = callQueue[i];
      const name = r.lead_name || r.name || 'Unknown';
      const from = callFrom === 'rotate' ? DIAL_NUMBERS[i % DIAL_NUMBERS.length] : callFrom;
      setProgress((p) => ({ ...p, current: name }));
      try {
        await opm.placeCall({ lead_id: r.lead_id, to_number: r.phone, from_number: from, agent_id: DIAL_AGENT.id, workspace: '1propertymarket' });
        ok++;
        setCallLog((l) => [{ name, phone: r.phone, ok: true }, ...l]);
      } catch (e: any) {
        fail++;
        setCallLog((l) => [{ name, phone: r.phone, ok: false, err: e?.message || 'failed' }, ...l]);
      }
      setProgress((p) => ({ ...p, done: i + 1, ok, fail }));
      if (i < callQueue.length - 1) await new Promise((res) => setTimeout(res, gap)); // non-overlapping spacing
    }
    setProgress((p) => ({ ...p, current: '' }));
    setRunning(false);
  }

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Contacts" description="Every dialable phone number — owners and relationships, each its own record" showDate={false} />
        {isSuperAdmin && (
          <button className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-light/40 px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-light" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </button>
        )}
      </div>

      {showImport && <ImportWizard onClose={() => setShowImport(false)} />}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Dialable Contacts" value={num(allRows.length)} sub="one per phone number" icon={Contact} accent="blue" />
        <KpiCard label="Owners" value={num(allRows.filter((r) => r.contact_kind !== 'relative').length)} sub="primary sellers" icon={PhoneCall} accent="green" />
        <KpiCard label="Relationships" value={num(allRows.filter((r) => r.contact_kind === 'relative').length)} sub="linked numbers" icon={PhoneCall} accent="default" />
        <KpiCard label="Verified" value={num(verifiedCount)} sub="confirmed working" icon={BadgeCheck} accent="amber" />
      </div>

      <SectionCard title="Filters" description={`${total.toLocaleString()} contact${total === 1 ? '' : 's'} match`} className="mb-4"
        action={<div className="flex items-center gap-2">
          <SavedViews<ViewCfg> pageKey={PAGE_KEY} current={currentCfg} onApply={applyView} />
          <ColumnToggleMenu columns={COLUMNS} isVisible={isVisible} onToggle={toggle} />
        </div>}>
        <div className="flex flex-wrap items-center gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input !py-1.5 text-sm">
            <option value="">All roles</option><option value="owner">Owners</option><option value="relative">Relationships</option>
          </select>
          <MultiSelect options={channelOpts} value={channel} onChange={setChannel} placeholder="All types" width={150} />
          <select value={verified} onChange={(e) => setVerified(e.target.value)} className="input !py-1.5 text-sm">
            <option value="">Any status</option><option value="yes">Verified only</option><option value="no">Unverified</option>
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, address, source…" className="input w-[280px] pl-8" />
          </div>
          {hasFilters && <button className="btn-ghost !py-1.5" onClick={() => { setKind(''); setChannel([]); setVerified(''); setSearch(''); }}><X className="h-3.5 w-3.5" /> Clear</button>}
        </div>
      </SectionCard>

      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/50 px-4 py-2.5">
          <span className="text-sm font-semibold text-brand">{selected.size} selected</span>
          <span className="mx-1 h-4 w-px bg-brand/20" />
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90" onClick={() => { setCallLog([]); setProgress({ done: 0, total: 0, ok: 0, fail: 0, current: '' }); setCallModal(true); }}><PhoneOutgoing className="h-3.5 w-3.5" /> Launch AI calls</button>
          <button className="btn-ghost !py-1.5" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export selected</button>
          <button className="btn-ghost !py-1.5" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {callModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !running && setCallModal(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><PhoneOutgoing className="h-5 w-5 text-brand" /> Launch AI calls</h3>
              {!running && <button onClick={() => setCallModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>}
            </div>

            {progress.total === 0 ? (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  This will place <span className="font-bold text-ink">{callQueue.length}</span> live AI call{callQueue.length === 1 ? '' : 's'} to real sellers, one at a time, using <span className="font-semibold">{DIAL_AGENT.name}</span>. Each call carries the seller's property context, stage, and our assessed value. Calls are spaced so none overlap.
                </p>
                {callQueue.length !== selected.size && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {selected.size - callQueue.length} of your {selected.size} selected were skipped (no dialable number or duplicate phone).</div>
                )}
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-500">Caller ID
                    <select value={callFrom} onChange={(e) => setCallFrom(e.target.value)} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                      <option value="rotate">Rotate all {DIAL_NUMBERS.length} numbers</option>
                      {DIAL_NUMBERS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-500">Gap between calls
                    <select value={gapSec} onChange={(e) => setGapSec(Number(e.target.value))} className="input mt-1 w-full !py-1.5 text-sm text-ink">
                      <option value={8}>8 seconds</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option>
                    </select>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => setCallModal(false)}>Cancel</button>
                  <button disabled={callQueue.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" onClick={runBulkCalls}><PhoneOutgoing className="h-4 w-4" /> Start dialing {callQueue.length}</button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">{running ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin text-brand" /> Dialing {progress.current}…</span> : 'Done'}</span>
                    <span className="tabular-nums text-slate-500">{progress.done} / {progress.total}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-brand transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
                  <div className="mt-1.5 flex gap-3 text-xs"><span className="text-emerald-600">{progress.ok} placed</span>{progress.fail > 0 && <span className="text-red-500">{progress.fail} failed</span>}</div>
                </div>
                <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-line">
                  {callLog.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs last:border-0">
                      {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      <span className="font-medium text-ink">{c.name}</span><span className="font-mono text-slate-400">{fmtNum(c.phone)}</span>
                      {!c.ok && <span className="ml-auto truncate text-red-500">{c.err}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button disabled={running} className="btn-primary disabled:opacity-50" onClick={() => { setCallModal(false); if (!running) setSelected(new Set()); }}>{running ? 'Dialing…' : 'Close'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionCard title="All contacts" description={sort ? `Sorted by ${sort.by} (${sort.dir})` : 'Unsorted'}
        action={<div className="flex items-center gap-2 text-xs text-slate-500">
          <button className="btn-ghost !py-1.5" disabled={total === 0} onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</button>
          <button className="btn-ghost !p-1.5" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular-nums">Page {page} / {pageCount}</span>
          <button className="btn-ghost !p-1.5" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>}>
        {loading ? <LoadingBlock label="Loading contacts…" /> : total === 0 ? <EmptyState text="No contacts match these filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#1f6feb]" /></th>
                  <th className="px-2 py-2.5 text-right w-10">#</th>
                  {COLUMNS.filter((c) => isVisible(c.key)).map((c) => <SortableHead key={c.key} col={c} sort={sort} onSort={setSort}>{c.label}</SortableHead>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={r.contact_id} className="cursor-pointer border-t border-line hover:bg-surface" onClick={() => nav(`/leads/${encodeURIComponent(r.lead_id)}`)}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.contact_id)} onChange={() => toggleSel(r.contact_id)} className="h-3.5 w-3.5 accent-[#1f6feb]" /></td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs text-slate-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    {isVisible('name') && <td className="px-3 py-2.5"><div className="font-semibold text-ink">{r.lead_name || r.name}</div>{r.contact_kind === 'relative' && r.related_name && <div className="text-[10px] text-slate-400">{r.relation_type || 'relative'}</div>}</td>}
                    {isVisible('phone') && <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-brand">{fmtNum(r.phone)}</td>}
                    {isVisible('channel') && <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.phone_channel === 'mobile' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{r.phone_channel === 'mobile' ? <Smartphone className="h-3 w-3" /> : <Phone className="h-3 w-3" />}{r.phone_channel || 'other'}</span></td>}
                    {isVisible('verified') && <td className="px-3 py-2.5">{r.phone_verified ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><BadgeCheck className="h-3.5 w-3.5" />yes</span> : <span className="text-xs text-slate-300">—</span>}</td>}
                    {isVisible('kind') && <td className="px-3 py-2.5"><span className={`pill ${r.contact_kind === 'relative' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.contact_kind === 'relative' ? 'Relationship' : 'Owner'}</span></td>}
                    {isVisible('property') && <td className="max-w-[240px] px-3 py-2.5"><div className="truncate text-xs text-slate-700">{r.property_ref || '—'}</div>{r.address && <div className="truncate text-[10px] text-slate-400">{r.address}</div>}</td>}
                    {isVisible('crm_stage') && <td className="whitespace-nowrap px-3 py-2.5"><span className="pill bg-brand/10 text-brand">{r.crm_stage || '—'}</span></td>}
                    {isVisible('lead_source') && <td className="max-w-[150px] truncate px-3 py-2.5 text-xs text-slate-500">{r.lead_source || '—'}</td>}
                    {isVisible('assigned_to') && <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.assigned_to || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
