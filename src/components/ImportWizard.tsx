import { useMemo, useState } from 'react';
import { opm } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { parseCsv, autoMatch, explodeSkipTrace, CANONICAL_FIELDS } from '../lib/dispatch';
import { UploadCloud, X, ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle, Building2, FileSpreadsheet, Users, Phone, Copy, Layers } from 'lucide-react';

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

// Smart import: auto-detects every phone column, consolidates + de-duplicates by number
// (both within the file and against existing records), and shows the cleanup before committing.
// When `lockedWorkspace` is set (a customer/company owner), the target is fixed to their tenant.
export default function ImportWizard({ onClose, lockedWorkspace }: { onClose: () => void; lockedWorkspace?: string }) {
  const { workspaces } = useWorkspace();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [tenantName, setTenantName] = useState('');
  const [parseErr, setParseErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');

  const slug = lockedWorkspace || slugify(tenantName);

  // Auto-detected phone columns (same heuristic the exploder uses).
  const phoneCols = useMemo(() => {
    const RE = /(phone|mobile|cell|tel|wireless|landline|voip|contact\s*number|ph\s*\d)/i;
    const META = /(type|dnc|status|carrier|score|date|litig|verified|valid)/i;
    return headers.filter((h) => RE.test(h) && !META.test(h));
  }, [headers]);

  const leads = useMemo(() => (headers.length ? explodeSkipTrace(headers, rows, map) : []), [headers, rows, map]);
  const records = useMemo(() => leads.map((l) => ({ name: l.ownerName, email: l.email, street: l.address, numbers: l.numbers, custom: l.fields })), [leads]);

  function onFile(file: File) {
    setParseErr('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers: hdr, rows: body } = parseCsv(String(reader.result || ''));
        if (!hdr.length || !body.length) { setParseErr('That file has no data rows.'); return; }
        setFileName(file.name); setHeaders(hdr); setRows(body); setMap(autoMatch(hdr));
        if (!tenantName && !lockedWorkspace) setTenantName(file.name.replace(/\.[^.]+$/, ''));
        setStep(2);
      } catch (e: any) { setParseErr(e?.message || 'Could not parse this CSV.'); }
    };
    reader.onerror = () => setParseErr('Could not read that file.');
    reader.readAsText(file);
  }

  const runPreview = async () => {
    setErr(''); setBusy(true); setPreview(null);
    try {
      const r = await opm.smartImport({ target_workspace: slug, records, mode: 'preview' });
      setPreview(r); setStep(3);
    } catch (e: any) { setErr(e?.message || 'Preview failed.'); } finally { setBusy(false); }
  };

  const runCommit = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await opm.smartImport({ target_workspace: slug, records, mode: 'commit' });
      setResult(r); setStep(4);
    } catch (e: any) { setErr(e?.message || 'Import failed.'); } finally { setBusy(false); }
  };

  const stepLabels = ['Upload', 'Map columns', 'Review & consolidate', 'Done'];
  const p = preview?.preview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !busy && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink"><FileSpreadsheet className="h-5 w-5 text-brand" /> Smart import</h3>
          {!busy && <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-surface"><X className="h-4 w-4" /></button>}
        </div>
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
          {step === 1 && (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-surface/50 px-6 py-12 text-center hover:border-brand/50 hover:bg-brand-light/30">
                <UploadCloud className="mb-3 h-10 w-10 text-brand" />
                <span className="text-sm font-semibold text-ink">Choose a CSV file</span>
                <span className="mt-1 text-xs text-slate-500">or drag it onto this box</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </label>
              <div className="mt-4 rounded-xl bg-surface px-4 py-3 text-xs text-slate-500">
                We handle messy lists automatically: a single row can carry many phone numbers (owner, relatives, tenants) and multiple people. We detect every number, keep each property as one record, de-duplicate by phone number, and consolidate duplicate names, addresses, and fields into one clean record.
              </div>
              {parseErr && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {parseErr}</div>}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                <span><span className="font-semibold text-ink">{fileName}</span> · {rows.length.toLocaleString()} rows · {headers.length} columns</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-light/60 px-2 py-0.5 font-semibold text-brand"><Phone className="h-3 w-3" /> {phoneCols.length} phone column{phoneCols.length === 1 ? '' : 's'} auto-detected</span>
              </div>
              {phoneCols.length === 0 && <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> No phone columns detected — records will import but won't be dialable.</div>}
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Tell us which columns are which (phones are detected automatically)</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CANONICAL_FIELDS.filter((f) => f.key !== 'phone').map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5">
                    <span className="text-sm text-ink">{f.label}</span>
                    <select value={map[f.key] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))} className="input max-w-[46%] !py-1 text-xs">
                      <option value="">— none —</option>
                      {headers.map((h, i) => <option key={i} value={h}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {phoneCols.length > 0 && (
                <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-[11px] text-slate-500">
                  Phone columns: {phoneCols.map((c) => <span key={c} className="mr-1 inline-block rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{c}</span>)}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">Import into</label>
              {lockedWorkspace ? (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-ink">{workspaces.find((w) => w.slug === lockedWorkspace)?.display_name || lockedWorkspace}</span>
                  <span className="font-mono text-[11px] text-slate-400">{lockedWorkspace}</span>
                </div>
              ) : (
                <div className="mb-4 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="e.g. Acme Realty" className="input flex-1" />
                  {slug && <span className="font-mono text-[11px] text-slate-400">{slug}</span>}
                </div>
              )}

              {!p ? (
                <div className="py-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Analyzing…</div>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Stat icon={Users} label="Property records" value={p.records_in} />
                    <Stat icon={Phone} label="Phone numbers" value={p.numbers_total} />
                    <Stat icon={Layers} label="Unique numbers" value={p.unique_numbers} accent="brand" />
                    <Stat icon={Copy} label="Duplicates collapsed" value={p.duplicates_in_upload} accent={p.duplicates_in_upload ? 'amber' : undefined} />
                    <Stat icon={CheckCircle2} label="Already on file" value={p.already_in_workspace} />
                    <Stat icon={Users} label="Two+ names / number" value={p.multi_name_numbers} accent={p.multi_name_numbers ? 'violet' : undefined} />
                  </div>
                  <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-slate-600">
                    We'll create <span className="font-bold text-ink">{p.new_numbers}</span> new dialable contact{p.new_numbers === 1 ? '' : 's'} from <span className="font-bold text-ink">{p.records_in - p.records_without_number}</span> propert{(p.records_in - p.records_without_number) === 1 ? 'y' : 'ies'}.
                    {p.already_in_workspace > 0 && <> {p.already_in_workspace} number{p.already_in_workspace === 1 ? '' : 's'} already exist and will be skipped (no duplicates).</>}
                    {p.records_without_number > 0 && <> {p.records_without_number} row{p.records_without_number === 1 ? '' : 's'} had no phone number.</>}
                  </div>
                  {preview?.sample?.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                      <table className="w-full text-xs">
                        <thead className="bg-surface text-left text-slate-500"><tr><th className="px-2.5 py-1.5">Number</th><th className="px-2.5 py-1.5">Name(s)</th><th className="px-2.5 py-1.5">Label</th><th className="px-2.5 py-1.5">New?</th></tr></thead>
                        <tbody>
                          {preview.sample.map((s: any) => (
                            <tr key={s.phone} className="border-t border-line">
                              <td className="px-2.5 py-1.5 font-mono text-slate-700">{s.phone}</td>
                              <td className="px-2.5 py-1.5">{s.names.join(', ') || <span className="text-slate-300">—</span>}{s.names.length > 1 && <span className="ml-1 rounded bg-violet-100 px-1 text-[9px] font-semibold text-violet-700">{s.names.length} names</span>}</td>
                              <td className="px-2.5 py-1.5 text-slate-500">{s.label || '—'}</td>
                              <td className="px-2.5 py-1.5">{s.existing ? <span className="text-slate-400">on file</span> : <span className="font-semibold text-emerald-600">new</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
              {err && <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {err}</div>}
            </div>
          )}

          {step === 4 && result && (
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <h4 className="text-lg font-bold text-ink">Import complete</h4>
              <p className="mt-1 text-sm text-slate-600">
                Added <span className="font-bold text-ink">{(result.committed?.contacts || 0).toLocaleString()}</span> dialable contact{result.committed?.contacts === 1 ? '' : 's'} across <span className="font-bold text-ink">{(result.committed?.leads || 0).toLocaleString()}</span> propert{result.committed?.leads === 1 ? 'y' : 'ies'} into <span className="font-mono font-semibold text-ink">{slug}</span>.
              </p>
              {result.stats?.duplicates_in_upload > 0 && <p className="mt-1 text-xs text-slate-500">{result.stats.duplicates_in_upload} duplicate number(s) were collapsed, {result.stats.already_in_workspace} already existed.</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <div>
            {step === 2 && <button className="btn-ghost" onClick={() => setStep(1)}><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
            {step === 3 && !busy && <button className="btn-ghost" onClick={() => setStep(2)}><ArrowLeft className="h-3.5 w-3.5" /> Back</button>}
          </div>
          <div className="flex gap-2">
            {step === 2 && <button className="btn-primary" disabled={busy} onClick={runPreview}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <>Review <ArrowRight className="h-3.5 w-3.5" /></>}</button>}
            {step === 3 && (
              <button disabled={!slug || busy || !p || p.new_numbers === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" onClick={runCommit}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <>Import {p?.new_numbers || 0} contacts</>}
              </button>
            )}
            {step === 4 && <button className="btn-primary" onClick={onClose}>Done</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: string }) {
  const color = accent === 'brand' ? 'text-brand' : accent === 'amber' ? 'text-amber-600' : accent === 'violet' ? 'text-violet-600' : 'text-ink';
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className={`mt-0.5 text-xl font-bold ${color}`}>{(value ?? 0).toLocaleString()}</div>
    </div>
  );
}
