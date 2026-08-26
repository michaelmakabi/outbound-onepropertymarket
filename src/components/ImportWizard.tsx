import { useMemo, useState } from 'react';
import { opm } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { parseCsv, autoMatch, explodeSkipTrace, CANONICAL_FIELDS } from '../lib/dispatch';
import { UploadCloud, X, ArrowRight, ArrowLeft, CheckCircle2, Loader2, AlertCircle, Building2, FileSpreadsheet, Users, Phone, Copy, Layers, Tag } from 'lucide-react';

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

// Shared button styles — intentionally large & tappable.
const BTN_GHOST = 'inline-flex items-center gap-2 rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-surface disabled:opacity-50';
const BTN_PRIMARY = 'inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50';

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
  // Auto smart-list: every import is saved as a named smart list so the batch is instantly usable
  // (tap it in Contacts or the campaign wizard). Defaults from the file name; the user can rename it.
  const [listName, setListName] = useState('');
  // Optional extra tags the user wants applied to every imported lead (on top of the automatic
  // City/State/Zip/County/Type tags). Comma-separated free text → array.
  const [extraTagsRaw, setExtraTagsRaw] = useState('');
  const extraTags = useMemo(
    () => extraTagsRaw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20),
    [extraTagsRaw],
  );

  const slug = lockedWorkspace || slugify(tenantName);

  // Auto-detected phone columns (same heuristic the exploder uses).
  const phoneCols = useMemo(() => {
    const RE = /(phone|mobile|cell|tel|wireless|landline|voip|contact\s*number|ph\s*\d)/i;
    const META = /(type|dnc|status|carrier|score|date|litig|verified|valid)/i;
    return headers.filter((h) => RE.test(h) && !META.test(h));
  }, [headers]);

  const leads = useMemo(() => (headers.length ? explodeSkipTrace(headers, rows, map) : []), [headers, rows, map]);
  const records = useMemo(() => leads.map((l) => ({ name: l.ownerName, email: l.email, street: l.address, numbers: l.numbers, custom: l.fields })), [leads]);

  // Accepts CSV/TSV/text AND Excel (.xls/.xlsx/.xlsm/.ods). Spreadsheets are converted to CSV in the
  // browser via SheetJS (loaded on demand), so any format the user has works without a pre-convert.
  async function onFile(file: File) {
    setParseErr('');
    const finish = (csvText: string) => {
      try {
        const { headers: hdr, rows: body } = parseCsv(csvText);
        if (!hdr.length || !body.length) { setParseErr('That file has no data rows.'); return; }
        setFileName(file.name); setHeaders(hdr); setRows(body); setMap(autoMatch(hdr));
        const base = file.name.replace(/\.[^.]+$/, '').trim();
        if (!tenantName && !lockedWorkspace) setTenantName(base);
        if (!listName) { const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); setListName(`${base || 'Imported leads'} · ${stamp}`); }
        setStep(2);
      } catch (e: any) { setParseErr(e?.message || 'Could not parse this file.'); }
    };
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) {
      try {
        const buf = await file.arrayBuffer();
        // Variable specifier keeps TS from resolving the URL module; @vite-ignore keeps Vite from bundling it.
        const sheetjsUrl = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
        const XLSX: any = await import(/* @vite-ignore */ sheetjsUrl);
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        finish(XLSX.utils.sheet_to_csv(sheet));
      } catch (_e) {
        setParseErr('Could not read that spreadsheet in the browser. Please export it as CSV and upload that.');
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => finish(String(reader.result || ''));
    reader.onerror = () => setParseErr('Could not read that file.');
    reader.readAsText(file);
  }

  const runPreview = async () => {
    setErr(''); setBusy(true); setPreview(null);
    try {
      const r = await opm.smartImport({ target_workspace: slug, records, mode: 'preview', list_name: listName.trim() || undefined, extra_tags: extraTags });
      setPreview(r); setStep(3);
    } catch (e: any) { setErr(e?.message || 'Preview failed.'); } finally { setBusy(false); }
  };

  const runCommit = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await opm.smartImport({ target_workspace: slug, records, mode: 'commit', list_name: listName.trim() || undefined, extra_tags: extraTags });
      setResult(r); setStep(4);
    } catch (e: any) { setErr(e?.message || 'Import failed.'); } finally { setBusy(false); }
  };

  const stepLabels = ['Upload', 'Map columns', 'Review & consolidate', 'Done'];
  const STEP_INTRO: Record<number, { title: string; desc: string }> = {
    1: { title: 'Upload your lead list', desc: 'Drop in a CSV of your leads. Messy exports are welcome — we clean them up for you.' },
    2: { title: 'Map your columns', desc: 'Confirm which columns hold the name, email and address. Phone numbers are detected for you.' },
    3: { title: 'Review & consolidate', desc: 'Here’s exactly what we’ll create, with duplicates removed. Nothing is saved until you confirm.' },
    4: { title: 'All done', desc: 'Your contacts are in and ready to call.' },
  };
  const p = preview?.preview;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={() => !busy && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-line bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-7 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-light text-brand"><FileSpreadsheet className="h-6 w-6" /></span>
            <div>
              <h3 className="text-2xl font-extrabold leading-tight text-ink">Smart import</h3>
              <p className="text-sm text-slate-500">Turn any spreadsheet into clean, dialable contacts</p>
            </div>
          </div>
          {!busy && <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-surface"><X className="h-5 w-5" /></button>}
        </div>

        {/* Stepper */}
        <div className="flex flex-wrap items-center gap-1.5 px-7 pt-5 text-sm">
          {stepLabels.map((l, i) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-brand text-white' : 'bg-surface text-slate-400'}`}>{step > i + 1 ? '✓' : i + 1}</span>
              <span className={step === i + 1 ? 'font-bold text-ink' : 'text-slate-400'}>{l}</span>
              {i < stepLabels.length - 1 && <span className="mx-1.5 h-px w-8 bg-line" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {/* Per-step guidance */}
          {STEP_INTRO[step] && (
            <div className="mb-5">
              <h4 className="text-lg font-bold text-ink">{STEP_INTRO[step].title}</h4>
              <p className="mt-1 text-sm text-slate-500">{STEP_INTRO[step].desc}</p>
            </div>
          )}

          {step === 1 && (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-line bg-surface/50 px-8 py-16 text-center transition hover:border-brand/50 hover:bg-brand-light/30">
                <UploadCloud className="mb-4 h-16 w-16 text-brand" />
                <span className="text-xl font-bold text-ink">Choose a file</span>
                <span className="mt-1.5 text-sm text-slate-500">CSV or Excel (.csv, .xlsx, .xls) — or drag it onto this box</span>
                <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white">Browse files</span>
                <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </label>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-surface px-5 py-4 text-sm leading-relaxed text-slate-500">
                <Layers className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <span>We handle messy lists automatically: a single row can carry many phone numbers (owner, relatives, tenants) and multiple people. We detect every number, keep each property as one record, de-duplicate by phone number, and consolidate duplicate names, addresses, and fields into one clean record.</span>
              </div>
              {parseErr && <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"><AlertCircle className="h-4 w-4" /> {parseErr}</div>}
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                <span><span className="font-semibold text-ink">{fileName}</span> · {rows.length.toLocaleString()} rows · {headers.length} columns</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light/60 px-3 py-1 text-xs font-semibold text-brand"><Phone className="h-3.5 w-3.5" /> {phoneCols.length} phone column{phoneCols.length === 1 ? '' : 's'} auto-detected</span>
              </div>
              {phoneCols.length === 0 && <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700"><AlertCircle className="h-4 w-4 shrink-0" /> No phone columns detected — records will import but won't be dialable.</div>}
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Match your columns (phones are detected automatically)</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CANONICAL_FIELDS.filter((f) => f.key !== 'phone').map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                    <span className="text-sm font-semibold text-ink">{f.label}</span>
                    <select value={map[f.key] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))} className="input max-w-[52%] !py-2 text-sm">
                      <option value="">— none —</option>
                      {headers.map((h, i) => <option key={i} value={h}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {phoneCols.length > 0 && (
                <div className="mt-4 rounded-xl bg-surface px-4 py-3 text-xs text-slate-500">
                  Phone columns: {phoneCols.map((c) => <span key={c} className="mr-1 inline-block rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{c}</span>)}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Import into</label>
              {lockedWorkspace ? (
                <div className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  <span className="text-sm font-semibold text-ink">{workspaces.find((w) => w.slug === lockedWorkspace)?.display_name || lockedWorkspace}</span>
                  <span className="font-mono text-[11px] text-slate-400">{lockedWorkspace}</span>
                </div>
              ) : (
                <div className="mb-5 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="e.g. Acme Realty" className="input flex-1 !py-2.5" />
                  {slug && <span className="font-mono text-[11px] text-slate-400">{slug}</span>}
                </div>
              )}

              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Save as smart list</label>
              <div className="mb-5 flex items-center gap-2">
                <Layers className="h-5 w-5 text-slate-400" />
                <input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Miami Off-Market · Aug" className="input flex-1 !py-2.5" />
              </div>
              <p className="-mt-3 mb-5 text-xs text-slate-500">These leads are tagged and saved as a smart list you can open in Contacts or drop straight into a campaign. Leave blank to skip.</p>

              {/* Auto-tags + optional extra tags */}
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">Tags</label>
              <div className="mb-2 flex items-start gap-2">
                <Tag className="mt-2.5 h-5 w-5 shrink-0 text-slate-400" />
                <div className="flex-1">
                  <input value={extraTagsRaw} onChange={(e) => setExtraTagsRaw(e.target.value)} placeholder="Add your own tags, comma-separated (e.g. Hot list, Absentee owner)" className="input w-full !py-2.5" />
                  <p className="mt-1.5 text-xs text-slate-500">Every lead is <span className="font-semibold text-slate-600">auto-tagged</span> by city, state, ZIP, county and property type. Add any extra tags here to make the list more specific.</p>
                </div>
              </div>
              {(() => {
                const autoFromPreview: string[] = Array.isArray(preview?.auto_tags) ? preview.auto_tags : [];
                const shown = [...new Set([...(listName.trim() ? [listName.trim()] : []), ...extraTags, ...autoFromPreview])].slice(0, 40);
                return shown.length ? (
                  <div className="mb-5 flex flex-wrap gap-1.5">
                    {shown.map((t) => {
                      const isExtra = extraTags.includes(t) || t === listName.trim();
                      return <span key={t} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${isExtra ? 'bg-brand-light text-brand' : 'bg-surface text-slate-600'}`}>{t}</span>;
                    })}
                  </div>
                ) : <div className="mb-5" />;
              })()}

              {!p ? (
                <div className="py-10 text-center text-sm text-slate-400"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" /> Analyzing…</div>
              ) : (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Stat icon={Users} label="Property records" value={p.records_in} />
                    <Stat icon={Phone} label="Phone numbers" value={p.numbers_total} />
                    <Stat icon={Layers} label="Unique numbers" value={p.unique_numbers} accent="brand" />
                    <Stat icon={Copy} label="Duplicates collapsed" value={p.duplicates_in_upload} accent={p.duplicates_in_upload ? 'amber' : undefined} />
                    <Stat icon={CheckCircle2} label="Already on file" value={p.already_in_workspace} />
                    <Stat icon={Users} label="Two+ names / number" value={p.multi_name_numbers} accent={p.multi_name_numbers ? 'violet' : undefined} />
                  </div>
                  <div className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm leading-relaxed text-slate-600">
                    We'll create <span className="font-bold text-ink">{p.new_numbers}</span> new dialable contact{p.new_numbers === 1 ? '' : 's'} from <span className="font-bold text-ink">{p.records_in - p.records_without_number}</span> propert{(p.records_in - p.records_without_number) === 1 ? 'y' : 'ies'}.
                    {p.already_in_workspace > 0 && <> {p.already_in_workspace} number{p.already_in_workspace === 1 ? '' : 's'} already exist and will be skipped (no duplicates).</>}
                    {p.records_without_number > 0 && <> {p.records_without_number} row{p.records_without_number === 1 ? '' : 's'} had no phone number.</>}
                  </div>
                  {preview?.sample?.length > 0 && (
                    <div className="mt-4 overflow-x-auto rounded-xl border border-line">
                      <table className="w-full text-sm">
                        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Number</th><th className="px-3 py-2">Name(s)</th><th className="px-3 py-2">Label</th><th className="px-3 py-2">New?</th></tr></thead>
                        <tbody>
                          {preview.sample.map((s: any) => (
                            <tr key={s.phone} className="border-t border-line">
                              <td className="px-3 py-2 font-mono text-slate-700">{s.phone}</td>
                              <td className="px-3 py-2">{s.names.join(', ') || <span className="text-slate-300">—</span>}{s.names.length > 1 && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700">{s.names.length} names</span>}</td>
                              <td className="px-3 py-2 text-slate-500">{s.label || '—'}</td>
                              <td className="px-3 py-2">{s.existing ? <span className="text-slate-400">on file</span> : <span className="font-semibold text-emerald-600">new</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
              {err && <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"><AlertCircle className="h-4 w-4 shrink-0" /> {err}</div>}
            </div>
          )}

          {step === 4 && result && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-11 w-11 text-emerald-500" /></div>
              <h4 className="text-2xl font-extrabold text-ink">Import complete</h4>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                Added <span className="font-bold text-ink">{(result.committed?.contacts || 0).toLocaleString()}</span> dialable contact{result.committed?.contacts === 1 ? '' : 's'} across <span className="font-bold text-ink">{(result.committed?.leads || 0).toLocaleString()}</span> propert{result.committed?.leads === 1 ? 'y' : 'ies'} into <span className="font-mono font-semibold text-ink">{slug}</span>.
              </p>
              {result.stats?.duplicates_in_upload > 0 && <p className="mt-1.5 text-xs text-slate-500">{result.stats.duplicates_in_upload} duplicate number(s) were collapsed, {result.stats.already_in_workspace} already existed.</p>}
              {result.list?.name && (
                <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand-light/30 px-4 py-3 text-sm font-semibold text-brand">
                  <Layers className="h-4 w-4" /> Saved as smart list “{result.list.name}” ({(result.list.count || 0).toLocaleString()} leads)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-7 py-4">
          <div>
            {step === 2 && <button className={BTN_GHOST} onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</button>}
            {step === 3 && !busy && <button className={BTN_GHOST} onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</button>}
          </div>
          <div className="flex gap-2">
            {step === 2 && <button className={BTN_PRIMARY} disabled={busy} onClick={runPreview}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <>Review <ArrowRight className="h-4 w-4" /></>}</button>}
            {step === 3 && (
              <button disabled={!slug || busy || !p || p.new_numbers === 0} className={BTN_PRIMARY} onClick={runCommit}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><CheckCircle2 className="h-4 w-4" /> Import {p?.new_numbers || 0} contacts</>}
              </button>
            )}
            {step === 4 && <button className={BTN_PRIMARY} onClick={onClose}>Done</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: string }) {
  const color = accent === 'brand' ? 'text-brand' : accent === 'amber' ? 'text-amber-600' : accent === 'violet' ? 'text-violet-600' : 'text-ink';
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-4 w-4" /> {label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${color}`}>{(value ?? 0).toLocaleString()}</div>
    </div>
  );
}
