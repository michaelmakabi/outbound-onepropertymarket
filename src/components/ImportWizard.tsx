import { useMemo, useState } from 'react';
import { opm } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { UploadCloud, X, ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle, Building2, FileSpreadsheet } from 'lucide-react';

// ---- Target fields the importer understands (backend `import_leads`) ----
type Field = { key: string; label: string; hint?: string; group: 'who' | 'phones' | 'property' | 'crm' };
const FIELDS: Field[] = [
  { key: 'name', label: 'Full name', group: 'who' },
  { key: 'first_name', label: 'First name', group: 'who' },
  { key: 'last_name', label: 'Last name', group: 'who' },
  { key: 'email', label: 'Email', group: 'who' },
  { key: 'phone', label: 'Phone (primary)', hint: 'required to dial', group: 'phones' },
  { key: 'phone2', label: 'Phone 2', group: 'phones' },
  { key: 'phone3', label: 'Phone 3', group: 'phones' },
  { key: 'street', label: 'Street', group: 'property' },
  { key: 'city', label: 'City', group: 'property' },
  { key: 'state', label: 'State', group: 'property' },
  { key: 'zip', label: 'Zip', group: 'property' },
  { key: 'property_ref', label: 'Property ref / APN', group: 'property' },
  { key: 'lead_source', label: 'Lead source', group: 'crm' },
  { key: 'assigned_to', label: 'Assigned to', group: 'crm' },
  { key: 'crm_stage', label: 'Stage', group: 'crm' },
  { key: 'listing_price', label: 'Listing price', group: 'crm' },
  { key: 'deal_price', label: 'Our value / deal price', group: 'crm' },
  { key: 'background', label: 'Notes / background', group: 'crm' },
];
const GROUPS: { key: Field['group']; label: string }[] = [
  { key: 'who', label: 'Contact' }, { key: 'phones', label: 'Phone numbers' },
  { key: 'property', label: 'Property' }, { key: 'crm', label: 'CRM' },
];

// Header aliases for auto-mapping (normalized: lowercased, alnum only).
const ALIASES: Record<string, string[]> = {
  name: ['name', 'fullname', 'ownername', 'contactname', 'owner', 'sellername'],
  first_name: ['first', 'firstname', 'fname', 'givenname'],
  last_name: ['last', 'lastname', 'lname', 'surname'],
  email: ['email', 'emailaddress', 'e'],
  phone: ['phone', 'phone1', 'primaryphone', 'mobile', 'cell', 'phonenumber', 'number', 'tel', 'telephone'],
  phone2: ['phone2', 'secondaryphone', 'altphone', 'phoneb', 'mobile2', 'cell2'],
  phone3: ['phone3', 'phonec', 'mobile3'],
  street: ['street', 'address', 'address1', 'streetaddress', 'propertystreet', 'mailingaddress', 'propertyaddress', 'addr'],
  city: ['city', 'town'],
  state: ['state', 'st', 'province'],
  zip: ['zip', 'zipcode', 'postal', 'postalcode', 'postcode'],
  property_ref: ['propertyref', 'apn', 'parcel', 'parcelid', 'propref', 'ref'],
  lead_source: ['source', 'leadsource'],
  assigned_to: ['assigned', 'assignedto', 'agent', 'owneruser', 'rep'],
  crm_stage: ['stage', 'status', 'crmstage', 'pipelinestage'],
  listing_price: ['listing', 'listingprice', 'listprice', 'askingprice', 'asking'],
  deal_price: ['deal', 'dealprice', 'offer', 'ourvalue', 'value', 'estimatedvalue'],
  background: ['notes', 'background', 'comment', 'comments', 'description'],
};
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Minimal RFC-4180-ish CSV parser (handles quotes, embedded commas/newlines, "" escapes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let field = ''; let i = 0; let inQ = false;
  text = text.replace(/^﻿/, ''); // strip BOM
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { cur.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.length && !(r.length === 1 && r[0].trim() === ''));
}

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
const BATCH = 200;

export default function ImportWizard({ onClose }: { onClose: () => void }) {
  const { workspaces, setActive } = useWorkspace();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({}); // field.key -> column index (-1 none)
  const [tenantName, setTenantName] = useState('');
  const [parseErr, setParseErr] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ leads: number; contacts: number; noPhone: number } | null>(null);
  const [importErr, setImportErr] = useState('');

  const slug = slugify(tenantName);
  const slugTaken = workspaces.some((w) => w.slug === slug);

  function onFile(file: File) {
    setParseErr('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const grid = parseCsv(String(reader.result || ''));
        if (grid.length < 2) { setParseErr('That file has no data rows.'); return; }
        const hdr = grid[0].map((h) => h.trim());
        const body = grid.slice(1);
        // auto-map
        const auto: Record<string, number> = {};
        const used = new Set<number>();
        for (const f of FIELDS) {
          const aliases = ALIASES[f.key] || [];
          let idx = hdr.findIndex((h, i) => !used.has(i) && aliases.includes(norm(h)));
          if (idx < 0) idx = hdr.findIndex((h, i) => !used.has(i) && aliases.some((a) => norm(h).includes(a) && a.length > 2));
          auto[f.key] = idx;
          if (idx >= 0) used.add(idx);
        }
        setFileName(file.name); setHeaders(hdr); setDataRows(body); setMapping(auto);
        if (!tenantName) setTenantName(file.name.replace(/\.[^.]+$/, ''));
        setStep(2);
      } catch (e: any) { setParseErr(e?.message || 'Could not parse this CSV.'); }
    };
    reader.onerror = () => setParseErr('Could not read that file.');
    reader.readAsText(file);
  }

  const mappedCount = Object.values(mapping).filter((i) => i >= 0).length;
  const phoneMapped = (mapping.phone ?? -1) >= 0;

  const preview = useMemo(() => {
    const build = (row: string[]) => {
      const o: Record<string, string> = {};
      for (const f of FIELDS) { const idx = mapping[f.key]; if (idx != null && idx >= 0) o[f.key] = (row[idx] || '').trim(); }
      return o;
    };
    return dataRows.slice(0, 5).map(build);
  }, [dataRows, mapping]);

  function buildAllRows() {
    return dataRows.map((row) => {
      const o: Record<string, string> = {};
      for (const f of FIELDS) { const idx = mapping[f.key]; if (idx != null && idx >= 0) { const v = (row[idx] || '').trim(); if (v) o[f.key] = v; } }
      return o;
    }).filter((o) => Object.keys(o).length > 0);
  }

  async function runImport() {
    setImportErr(''); setRunning(true);
    const all = buildAllRows();
    setProgress({ done: 0, total: all.length });
    let leads = 0, contacts = 0, noPhone = 0;
    try {
      for (let i = 0; i < all.length; i += BATCH) {
        const batch = all.slice(i, i + BATCH);
        const r = await opm.importLeads({ target_workspace: slug, rows: batch });
        leads += r.leads || 0; contacts += r.contacts || 0; noPhone += r.leads_without_phone || 0;
        setProgress({ done: Math.min(i + BATCH, all.length), total: all.length });
      }
      setResult({ leads, contacts, noPhone });
      setStep(4);
    } catch (e: any) {
      setImportErr(e?.message || 'Import failed.');
    } finally { setRunning(false); }
  }

  const stepLabels = ['Upload', 'Map columns', 'Confirm', 'Done'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !running && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><FileSpreadsheet className="h-5 w-5 text-brand" /> Import leads from CSV</h3>
          {!running && <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>}
        </div>
        {/* stepper */}
        <div className="flex items-center gap-1 px-5 pt-3 text-xs">
          {stepLabels.map((l, i) => (
            <div key={l} className="flex items-center gap-1">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-brand text-white' : 'bg-surface text-slate-400'}`}>{step > i + 1 ? '✓' : i + 1}</span>
              <span className={step === i + 1 ? 'font-semibold text-ink' : 'text-slate-400'}>{l}</span>
              {i < stepLabels.length - 1 && <span className="mx-1 h-px w-5 bg-line" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* STEP 1 — upload */}
          {step === 1 && (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-surface/50 px-6 py-12 text-center hover:border-brand/50 hover:bg-brand-light/30">
                <UploadCloud className="mb-3 h-10 w-10 text-brand" />
                <span className="text-sm font-semibold text-ink">Choose a CSV file</span>
                <span className="mt-1 text-xs text-slate-500">or drag it onto this box</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </label>
              <div className="mt-4 rounded-xl bg-surface px-4 py-3 text-xs text-slate-500">
                First row must be column headers. Each row becomes one lead; up to three phone columns become dialable contacts. We'll auto-match common columns and let you fix any before importing.
              </div>
              {parseErr && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {parseErr}</div>}
            </div>
          )}

          {/* STEP 2 — map columns */}
          {step === 2 && (
            <div>
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                <span><span className="font-semibold text-ink">{fileName}</span> · {dataRows.length.toLocaleString()} rows · {headers.length} columns</span>
                <span>{mappedCount} fields mapped</span>
              </div>
              {!phoneMapped && <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> No primary phone column mapped — those leads will import but won't be dialable.</div>}
              <div className="space-y-4">
                {GROUPS.map((g) => (
                  <div key={g.key}>
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {FIELDS.filter((f) => f.group === g.key).map((f) => (
                        <label key={f.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5">
                          <span className="text-sm text-ink">{f.label}{f.hint && <span className="ml-1 text-[10px] text-slate-400">({f.hint})</span>}</span>
                          <select value={mapping[f.key] ?? -1} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))} className="input max-w-[46%] !py-1 text-xs">
                            <option value={-1}>— none —</option>
                            {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3 — target + preview */}
          {step === 3 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Import into tenant</label>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="e.g. Acme Realty" className="input flex-1" />
              </div>
              {slug && (
                <div className="mt-1.5 text-xs text-slate-500">
                  Workspace slug: <span className="font-mono font-semibold text-ink">{slug || '—'}</span>
                  {slugTaken ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">existing tenant — rows will be added</span>
                    : <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">new tenant</span>}
                </div>
              )}
              <div className="mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Preview — first {preview.length} of {dataRows.length.toLocaleString()} rows</div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-xs">
                  <thead className="bg-surface text-left text-slate-500">
                    <tr>{FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => <th key={f.key} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">{f.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => <td key={f.key} className="max-w-[160px] truncate px-2.5 py-1.5 text-slate-700">{r[f.key] || <span className="text-slate-300">—</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importErr && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {importErr}</div>}
              {running && (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-ink">Importing…</span><span className="tabular-nums text-slate-500">{progress.done} / {progress.total}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-brand transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4 — done */}
          {step === 4 && result && (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <h4 className="text-lg font-bold text-ink">Import complete</h4>
              <p className="mt-1 text-sm text-slate-600">
                Added <span className="font-bold text-ink">{result.leads.toLocaleString()}</span> leads and <span className="font-bold text-ink">{result.contacts.toLocaleString()}</span> dialable contacts into <span className="font-mono font-semibold text-ink">{slug}</span>.
              </p>
              {result.noPhone > 0 && <p className="mt-1 text-xs text-amber-600">{result.noPhone.toLocaleString()} lead(s) had no valid phone and won't be dialable.</p>}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <div>
            {step === 2 && <button className="btn-ghost" onClick={() => setStep(1)}><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
            {step === 3 && !running && <button className="btn-ghost" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
          </div>
          <div className="flex gap-2">
            {step === 2 && <button className="btn-primary" onClick={() => setStep(3)}>Next <ArrowRight className="h-3.5 w-3.5" /></button>}
            {step === 3 && (
              <button disabled={!slug || running || dataRows.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" onClick={runImport}>
                {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <>Import {dataRows.length.toLocaleString()} rows</>}
              </button>
            )}
            {step === 4 && (
              <>
                <button className="btn-ghost" onClick={onClose}>Close</button>
                <button className="btn-primary" onClick={() => setActive(slug)}>Switch to this tenant <ArrowRight className="h-3.5 w-3.5" /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
