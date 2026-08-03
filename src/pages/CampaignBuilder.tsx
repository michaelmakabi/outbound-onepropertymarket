import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dispatch, parseCsv, autoMatch, CANONICAL_FIELDS, LINE_TYPE_META } from '../lib/dispatch';
import { PageHeader, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import {
  ArrowLeft, Upload, ShieldCheck, Settings2, Rocket, Loader2, FileUp, UserPlus, Plus, Trash2,
  AlertTriangle, MapPin, Radio, PenLine, Sparkles, RefreshCw, PhoneCall,
} from 'lucide-react';

const STEPS = [
  { key: 'upload', label: 'Upload leads', icon: Upload },
  { key: 'verify', label: 'Verify line types', icon: ShieldCheck },
  { key: 'setup', label: 'Campaign setup', icon: Settings2 },
  { key: 'launch', label: 'Launch & monitor', icon: Rocket },
];

export default function CampaignBuilder() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [pool, setPool] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [c, b] = await Promise.all([dispatch.getCampaign(slug), dispatch.bootstrap()]);
      setCampaign(c.campaign); setPool(b.pool); setAgents(b.agents); setWorkspaces(b.workspaces || []);
    } catch (e: any) { setError(String(e?.message || e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [slug]);

  if (loading) return <LoadingBlock label="Loading campaign…" />;
  if (!campaign) return <div className="card p-10 text-center text-slate-400">{error || 'Campaign not found.'}</div>;

  return (
    <div>
      <button onClick={() => nav('/campaigns')} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand"><ArrowLeft className="h-4 w-4" /> All campaigns</button>
      <PageHeader title={campaign.name} description={`Adrian dialer · ${campaign.slug} · ${campaign.status}`} showDate={false} />

      {/* Stepper */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${i === step ? 'bg-brand text-white' : 'border border-line bg-white text-slate-600 hover:bg-surface'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${i === step ? 'bg-white/20' : 'bg-surface'}`}>{i + 1}</span>
            <s.icon className="h-4 w-4" /> {s.label}
          </button>
        ))}
      </div>

      {step === 0 && <UploadStep campaign={campaign} onDone={load} />}
      {step === 1 && <VerifyStep campaign={campaign} onChange={setCampaign} onNext={() => setStep(2)} />}
      {step === 2 && <SetupStep campaign={campaign} pool={pool} agents={agents} workspaces={workspaces} onSaved={(c) => { setCampaign(c); setStep(3); }} />}
      {step === 3 && <LaunchStep campaign={campaign} />}
    </div>
  );
}

/* ---------------- Step 1: Upload ---------------- */
function UploadStep({ campaign, onDone }: { campaign: any; onDone: () => void }) {
  const [mode, setMode] = useState<'csv' | 'single'>('csv');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2 flex gap-2">
        <button onClick={() => setMode('csv')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'csv' ? 'bg-brand text-white' : 'border border-line bg-white text-slate-600'}`}><FileUp className="h-4 w-4" /> CSV upload</button>
        <button onClick={() => setMode('single')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'single' ? 'bg-brand text-white' : 'border border-line bg-white text-slate-600'}`}><UserPlus className="h-4 w-4" /> Add one</button>
      </div>
      {mode === 'csv' ? <CsvUpload slug={campaign.slug} onDone={onDone} /> : <SingleAdd slug={campaign.slug} onDone={onDone} />}
    </div>
  );
}

function CsvUpload({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setError(''); setResult(null);
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    if (!headers.length) { setError('Could not parse any columns from that file.'); return; }
    setHeaders(headers); setRows(rows); setMap(autoMatch(headers));
  };

  const mappedLeads = useMemo(() => {
    const idx: Record<string, number> = {};
    for (const [field, header] of Object.entries(map)) idx[field] = headers.indexOf(header);
    return rows.map((r) => {
      const lead: any = { customFields: {} };
      for (const f of CANONICAL_FIELDS) { const i = idx[f.key]; if (i != null && i >= 0) lead[f.key] = (r[i] || '').trim(); }
      // extra unmapped columns → custom fields (context for the AI)
      const mappedHeaders = new Set(Object.values(map));
      headers.forEach((h, i) => { if (!mappedHeaders.has(h) && (r[i] || '').trim()) lead.customFields[h] = r[i].trim(); });
      if (lead.city || lead.state || lead.zip) lead.address = [lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
      return lead;
    }).filter((l) => l.phone);
  }, [rows, map, headers]);

  const submit = async () => {
    setBusy(true); setError('');
    try { const r = await dispatch.createLeads(slug, mappedLeads); setResult(r); onDone(); }
    catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(false); }
  };

  return (
    <SectionCard className="lg:col-span-2" title="CSV upload" description="Map your columns, preview, then push to GoHighLevel (tagged for this campaign, line type unverified)">
      {!headers.length ? (
        <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }} onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface/40 p-10 text-center">
          <FileUp className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-600">Drag & drop a .csv here, or</p>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Choose file</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <p className="mt-1 text-xs text-slate-400">Every extra column becomes AI context on the call — bring property details.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CANONICAL_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label mb-1 block">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                <select className="input" value={map[f.key] || ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">— none —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {!map.phone && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">Map a <b>Phone</b> column to continue.</div>}

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="bg-surface text-left uppercase tracking-wide text-slate-500">
                <tr>{CANONICAL_FIELDS.filter((f) => map[f.key]).map((f) => <th key={f.key} className="px-2 py-1.5">{f.label}</th>)}</tr>
              </thead>
              <tbody>
                {mappedLeads.slice(0, 20).map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    {CANONICAL_FIELDS.filter((f) => map[f.key]).map((f) => <td key={f.key} className="px-2 py-1.5 text-slate-700">{l[f.key] || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{num(mappedLeads.length)} rows with a phone number ready · showing first 20.</p>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          {result && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Added {result.added}, merged {result.merged}, rejected {result.rejected}.</div>}

          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => { setHeaders([]); setRows([]); setResult(null); }}>← Choose another file</button>
            <button className="btn-primary flex-1" disabled={busy || !map.phone || mappedLeads.length === 0} onClick={submit}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {num(mappedLeads.length)} leads…</> : <><Upload className="h-4 w-4" /> Add {num(mappedLeads.length)} leads to GoHighLevel</>}
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function SingleAdd({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [form, setForm] = useState<any>({ firstName: '', phone: '', address: '', email: '' });
  const [extras, setExtras] = useState<{ k: string; v: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async () => {
    setBusy(true); setMsg('');
    try {
      const customFields: any = {}; for (const e of extras) if (e.k.trim()) customFields[e.k.trim()] = e.v;
      const r = await dispatch.createLeads(slug, [{ ...form, customFields }]);
      setMsg(r.rejected ? 'Rejected — check the phone number format.' : 'Lead added.');
      if (!r.rejected) { setForm({ firstName: '', phone: '', address: '', email: '' }); setExtras([]); onDone(); }
    } catch (e: any) { setMsg(String(e?.message || e)); } finally { setBusy(false); }
  };
  return (
    <SectionCard className="lg:col-span-2" title="Add one lead" description="Creates the GoHighLevel contact, tagged for this campaign">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label mb-1 block">First name</label><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
        <div><label className="label mb-1 block">Phone *</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+13055551234" /></div>
        <div><label className="label mb-1 block">Property address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div><label className="label mb-1 block">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      </div>
      {extras.map((e, i) => (
        <div key={i} className="mt-2 flex gap-2">
          <input className="input" placeholder="Field name (e.g. Beds)" value={e.k} onChange={(ev) => setExtras((x) => x.map((y, j) => j === i ? { ...y, k: ev.target.value } : y))} />
          <input className="input" placeholder="Value" value={e.v} onChange={(ev) => setExtras((x) => x.map((y, j) => j === i ? { ...y, v: ev.target.value } : y))} />
          <button className="btn-ghost !px-2" onClick={() => setExtras((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setExtras((x) => [...x, { k: '', v: '' }])}><Plus className="h-3.5 w-3.5" /> Add another field</button>
      {msg && <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm text-slate-700">{msg}</div>}
      <button className="btn-primary mt-4 w-full" disabled={busy || !form.phone.trim()} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4" /> Add lead</>}</button>
    </SectionCard>
  );
}

/* ---------------- Step 2: Verify ---------------- */
function VerifyStep({ campaign, onChange, onNext }: { campaign: any; onChange: (c: any) => void; onNext: () => void }) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [triggerTag, setTriggerTag] = useState(campaign.validation_tag || 'verify: run linetype');
  const [savingTag, setSavingTag] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = triggerTag.trim() !== (campaign.validation_tag || '');

  const load = () => { setLoading(true); dispatch.verifyStatus(campaign.slug).then(setStatus).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [campaign.slug]);

  const saveTag = async () => {
    setSavingTag(true); setMsg('');
    try { const r = await dispatch.saveCampaign({ slug: campaign.slug, name: campaign.name, validation_tag: triggerTag.trim() }); onChange(r.campaign); setMsg('Trigger tag saved to this campaign.'); }
    catch (e: any) { setMsg(String(e?.message || e)); } finally { setSavingTag(false); }
  };

  const run = async () => {
    setRunning(true); setMsg('');
    try {
      if (dirty) { const r = await dispatch.saveCampaign({ slug: campaign.slug, name: campaign.name, validation_tag: triggerTag.trim() }); onChange(r.campaign); }
      const r = await dispatch.verifyRun(campaign.slug, triggerTag.trim() || undefined);
      setMsg(`Tagged ${r.triggerTagged} leads with "${r.triggerTag || '(none)'}" for GHL validation · stamped ${r.backfill?.labeled ?? 0} from existing signals.`); load();
    }
    catch (e: any) { setMsg(String(e?.message || e)); } finally { setRunning(false); }
  };

  const b = status?.buckets || {};
  const gateReady = status && status.total > 0 && status.unverified === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="card flex items-start gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <div><b>The gate:</b> no lead is dialed until its number is verified. Mobiles get text-first-then-call; landline/VoIP are call-only; invalid numbers are suppressed automatically by the dialer. Run verification, then advance once every lead has a resolved line type.</div>
      </div>

      <SectionCard title="Line-type breakdown" description="Live from GoHighLevel"
        action={<button className="btn-ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>}>
        {loading ? <LoadingBlock /> : !status || status.total === 0 ? <EmptyState text="No leads in this campaign yet — add leads in step 1." /> : (
          <>
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold text-ink">{status.pctResolved}% resolved</span><span className="text-slate-500">{num(status.resolved)}/{num(status.total)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${status.pctResolved}%` }} /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Line type</th><th className="px-3 py-2">Routing</th><th className="px-3 py-2 text-right">Count</th></tr></thead>
                <tbody>
                  {Object.entries(LINE_TYPE_META).map(([key, meta]) => (
                    <tr key={key} className="border-t border-line">
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />{meta.label}</span></td>
                      <td className="px-3 py-2.5 text-slate-500">{meta.route}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{num(b[key] || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Run verification" description="Stamps line-type signals into the Line Type field, and tags unverified leads to trigger this campaign's GoHighLevel Number Validation workflow ($0.005/record).">
        <label className="label mb-1 block">GHL validation trigger tag <span className="font-normal text-slate-400">— saved to this campaign</span></label>
        <div className="mb-2 flex gap-2">
          <input className="input flex-1" value={triggerTag} onChange={(e) => setTriggerTag(e.target.value)} placeholder="verify: run linetype" />
          <button className="btn-ghost" disabled={savingTag || !dirty} onClick={saveTag}>{savingTag ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save tag'}</button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          This is the durable handoff: the tag your GoHighLevel Number Validation workflow listens for. It's stored per campaign, so each campaign (in any workspace) can point at its own workflow. Leave blank to only stamp existing landline/wrong-number signals. Validation runs inside GoHighLevel; results flow back into the Line Type field and appear above.
          {campaign.validation_tag && <span className="mt-1 block">Currently saved: <code className="font-mono text-slate-600">{campaign.validation_tag}</code>{dirty && <span className="text-amber-600"> · unsaved change</span>}</span>}
        </p>
        {msg && <div className="mb-3 rounded-lg bg-surface px-3 py-2 text-sm text-slate-700">{msg}</div>}
        <button className="btn-primary" disabled={running} onClick={run}>{running ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</> : <><ShieldCheck className="h-4 w-4" /> Run verification</>}</button>
      </SectionCard>

      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${gateReady ? 'text-emerald-600' : 'text-amber-600'}`}>{gateReady ? 'All leads resolved — you can continue.' : 'Verify all leads (or suppress invalids) before launching.'}</span>
        <button className="btn-primary" disabled={!gateReady} onClick={onNext}>Continue to setup →</button>
      </div>
    </div>
  );
}

/* ---------------- Step 3: Setup ---------------- */
function SetupStep({ campaign, pool, agents, workspaces, onSaved }: { campaign: any; pool: any[]; agents: any[]; workspaces: any[]; onSaved: (c: any) => void }) {
  const [agentId, setAgentId] = useState(campaign.agent_id);
  const [workspace, setWorkspace] = useState(campaign.workspace || '');
  const [numbers, setNumbers] = useState<string[]>(campaign.numbers?.length ? campaign.numbers : pool.map((p) => p.number));
  const [cap, setCap] = useState(campaign.daily_cap);
  const [batch, setBatch] = useState(campaign.drip_batch);
  const [minutes, setMinutes] = useState(campaign.drip_minutes);
  const [wStart, setWStart] = useState(campaign.window_start);
  const [wEnd, setWEnd] = useState(campaign.window_end);
  const [tz, setTz] = useState(campaign.window_tz);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [buildOpen, setBuildOpen] = useState(false);
  const [customAgents, setCustomAgents] = useState<any[]>([]);
  const allAgents = [...agents, ...customAgents];

  const toggleNum = (n: string) => setNumbers((s) => s.includes(n) ? s.filter((x) => x !== n) : [...s, n]);
  const selAgent = allAgents.find((a) => a.id === agentId) || agents[0];

  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await dispatch.saveCampaign({
        slug: campaign.slug, name: campaign.name, agent_id: agentId, agent_name: selAgent?.name,
        workspace: workspace || null, numbers, daily_cap: Number(cap), drip_batch: Number(batch), drip_minutes: Number(minutes),
        window_start: wStart, window_end: wEnd, window_tz: tz, status: 'ready',
      });
      onSaved(r.campaign);
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(false); }
  };

  const dialsPerDay = numbers.length * Number(cap || 0);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Workspace" description="Scope this campaign to a workspace (label + organization). Optional — leave global if it spans all.">
        <select className="input w-auto min-w-[240px]" value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
          <option value="">Global (no specific workspace)</option>
          {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
        </select>
      </SectionCard>

      <SectionCard title="1 · Pick the AI agent" description="Pre-made Dispatch AI models — or build your own">
        <div className="grid gap-3 sm:grid-cols-2">
          {allAgents.map((a) => (
            <button key={a.id} onClick={() => setAgentId(a.id)} className={`flex flex-col gap-1 rounded-xl border p-3 text-left ${agentId === a.id ? 'border-brand bg-brand-light' : 'border-line hover:bg-surface'}`}>
              <div className="flex items-center gap-2"><Radio className={`h-4 w-4 ${agentId === a.id ? 'text-brand' : 'text-slate-400'}`} /><span className="text-sm font-bold text-ink">{a.name}</span>{a.premade && <span className="pill bg-emerald-100 text-emerald-700">Pre-made</span>}</div>
              {a.description && <span className="text-xs text-slate-500">{a.description}</span>}
              <span className="font-mono text-[10px] text-slate-400">{a.id}</span>
            </button>
          ))}
          <button onClick={() => setBuildOpen((o) => !o)} className="flex flex-col items-start justify-center gap-1 rounded-xl border border-dashed border-line p-3 text-left hover:bg-surface">
            <div className="flex items-center gap-2"><PenLine className="h-4 w-4 text-slate-400" /><span className="text-sm font-bold text-ink">Build your own</span></div>
            <span className="text-xs text-slate-500">Create a new Retell agent from a template</span>
          </button>
        </div>
        {buildOpen && <BuildAgent onCreated={(a) => { setCustomAgents((x) => [...x, a]); setAgentId(a.id); setBuildOpen(false); }} />}
      </SectionCard>

      <SectionCard title="2 · Numbers & rotation" description={`${numbers.length} selected · ~${num(dialsPerDay)} dials/day capacity`}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pool.map((p) => (
            <label key={p.number} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${numbers.includes(p.number) ? 'border-brand bg-brand-light' : 'border-line'}`}>
              <input type="checkbox" checked={numbers.includes(p.number)} onChange={() => toggleNum(p.number)} className="h-4 w-4 accent-brand" />
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span className="flex-1"><span className="font-mono text-ink">{p.number}</span><span className="ml-1 text-xs capitalize text-slate-400">{p.region}</span></span>
              <span className="text-xs text-slate-500">{p.used}/{p.cap}</span>
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="3 · Pace & limits" description="Throttle and calling window (TCPA/compliance is the customer's policy)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label mb-1 block">Daily cap per number</label><input type="number" className="input" value={cap} onChange={(e) => setCap(e.target.value)} />{Number(cap) > 100 && <p className="mt-1 text-xs text-amber-600">Above 100/number/day increases spam risk.</p>}</div>
          <div><label className="label mb-1 block">Drip batch size</label><input type="number" className="input" value={batch} onChange={(e) => setBatch(e.target.value)} /></div>
          <div><label className="label mb-1 block">Release every (minutes)</label><input type="number" className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
          <div><label className="label mb-1 block">Window start</label><input type="time" className="input" value={wStart} onChange={(e) => setWStart(e.target.value)} /></div>
          <div><label className="label mb-1 block">Window end</label><input type="time" className="input" value={wEnd} onChange={(e) => setWEnd(e.target.value)} /></div>
          <div><label className="label mb-1 block">Time zone</label>
            <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
              {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'].map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>
      </SectionCard>

      {error && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end"><button className="btn-primary" disabled={busy || numbers.length === 0} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save & continue to launch →</>}</button></div>
    </div>
  );
}

function BuildAgent({ onCreated }: { onCreated: (a: any) => void }) {
  const [form, setForm] = useState({ name: '', business: '', goal: '', opening: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    setBusy(true); setError('');
    try { const r = await dispatch.createAgent(form); onCreated({ id: r.agent_id, name: r.agent_name, premade: false, description: 'Custom agent' }); }
    catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label mb-1 block">Agent name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Maya" /></div>
        <div><label className="label mb-1 block">Business it represents</label><input className="input" value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="e.g. BB Real Estate Fund" /></div>
        <div className="sm:col-span-2"><label className="label mb-1 block">Goal of the call</label><input className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. qualify off-market sellers and book a call" /></div>
        <div className="sm:col-span-2"><label className="label mb-1 block">Opening line</label><input className="input" value={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.value })} placeholder="e.g. Hi, this is Maya calling about your property…" /></div>
      </div>
      {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <button className="btn-primary mt-3" disabled={busy || !form.name.trim()} onClick={create}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating agent…</> : <><Sparkles className="h-4 w-4" /> Create Retell agent</>}</button>
    </div>
  );
}

/* ---------------- Step 4: Launch & Monitor ---------------- */
function LaunchStep({ campaign }: { campaign: any }) {
  const [mon, setMon] = useState<any>(null);
  const [confirm, setConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [msg, setMsg] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);

  const load = () => dispatch.monitor(campaign.slug).then(setMon).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [campaign.slug]);

  const doLaunch = async () => {
    setLaunching(true); setMsg('');
    try { const r = await dispatch.launch(campaign.slug); setMsg(`Queued ${r.queued} leads · ${r.suppressed} suppressed · ${r.pending} still unverified · ${r.already} already in flight.`); setConfirm(false); load(); }
    catch (e: any) { setMsg(String(e?.message || e)); } finally { setLaunching(false); }
  };
  const runTest = async () => {
    setTesting(true); setTestMsg('');
    try { const r = await dispatch.testDial({ phone: testPhone.trim(), name: 'Test' }); setTestMsg(r.ok === false ? (r.reason || r.err || 'Test dial failed') : `Test call placed (call ${String(r.call_id || '').slice(-6)}).`); }
    catch (e: any) { setTestMsg(String(e?.message || e)); } finally { setTesting(false); }
  };

  const st = mon?.status || {}; const lt = mon?.lineTypes || {}; const pool = mon?.pool || [];
  const callable = (lt.mobile || 0) + (lt.landline || 0) + (lt.voip || 0) + (lt.other || 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"><Rocket className="h-5 w-5" /></div>
          <div>
            <div className="font-bold text-ink">Launch this campaign</div>
            <div className="text-sm text-slate-500">Tags {num(callable)} verified, callable leads for the dialer. Invalid numbers are never dialed.</div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setConfirm(true)} disabled={callable === 0}><Rocket className="h-4 w-4" /> Launch</button>
      </div>
      {msg && <div className="card bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[['Idle', st.idle, '#94a3b8'], ['Queued', st.queued, '#d97706'], ['Dialing', st.dialing, '#2563eb'], ['Completed', st.completed, '#16a34a'], ['Suppressed', st.suppressed, '#dc2626']].map(([label, v, c]) => (
          <div key={label as string} className="card p-3" style={{ borderTopColor: c as string, borderTopWidth: 3 }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label as string}</div>
            <div className="text-2xl font-extrabold tabular-nums text-ink">{num((v as number) || 0)}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Number rotation — today" description="Live usage vs daily cap" action={<button className="btn-ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pool.map((p: any) => (
            <div key={p.number} className="rounded-lg border border-line p-2.5">
              <div className="mb-1 flex items-center justify-between text-xs"><span className="font-mono text-ink">{p.number}</span><span className="text-slate-500">{p.used}/{p.cap}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${(p.used / p.cap) * 100}%`, background: p.used >= p.cap ? '#dc2626' : '#16a34a' }} /></div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent Adrian calls" description="Latest dispositions from the calling engine">
        {!mon?.recentCalls?.length ? <EmptyState text="No calls logged yet — they'll appear here as Adrian dials." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Disposition</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody>
                {mon.recentCalls.map((c: any, i: number) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-2 text-slate-500">{c.started_at ? new Date(c.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                    <td className="px-3 py-2 font-mono text-ink">{c.to_number || '—'}</td>
                    <td className="px-3 py-2">{c.disposition || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{c.call_status || c.disconnection_reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Test the agent" description="Place a single live call to a number you control (a real call will be made)">
        <div className="flex flex-wrap gap-2">
          <input className="input w-[220px]" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+1 your own number" />
          <button className="btn-ghost" disabled={testing || !testPhone.trim()} onClick={runTest}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />} Test call</button>
        </div>
        {testMsg && <div className="mt-2 text-sm text-slate-600">{testMsg}</div>}
      </SectionCard>

      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setConfirm(false)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-lg font-bold text-ink"><AlertTriangle className="h-5 w-5 text-amber-500" /> Launch campaign</div>
            <p className="mb-4 text-sm text-slate-600">This tags <b>{num(callable)}</b> verified, callable leads for the dialer. Adrian will place <b>real outbound calls</b> during your calling window, respecting the {pool.reduce((s: number, p: any) => s + p.cap, 0)}-dial daily cap. Suppressed/invalid numbers are never dialed.</p>
            {msg && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg}</div>}
            <div className="flex gap-2"><button className="btn-ghost flex-1" onClick={() => setConfirm(false)}>Cancel</button><button className="btn-primary flex-1" disabled={launching} onClick={doLaunch}>{launching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, launch'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
