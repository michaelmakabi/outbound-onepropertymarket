import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { testai } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { PageHead, Spinner } from '../components/ui';
import { PhoneOutgoing, Plus, Trash2, Play, X, Loader2, CheckCircle2, AlertCircle, Info, Save, Sparkles, User, Mail, MapPin, Phone, AlertTriangle, FileText } from 'lucide-react';

type Agent = { agent_id: string; agent_name: string };
type Num = { phone_number: string; pretty: string; nickname: string; outbound_agent_ids: string[] };
type Row = { id: number; key: string; value: string };
type Template = { id: number; workspace: string; name: string; agent_id: string | null; config: any };

// Ready-made mock-contact starters. Fully editable — pick one, then tweak any field.
const TEMPLATES: Record<string, { label: string; rows: [string, string][] }> = {
  negotiator: {
    label: 'Adrian — Negotiator',
    rows: [
      ['lead_name', 'Michael Test'],
      ['listing_address', '123 Ocean Drive, Miami'],
      ['lead_email', 'seller@example.com'],
      ['target_price', '1650000'],
      ['max_price', '1750000'],
      ['seller_asking', '1900000'],
      ['prior_offer', '1650000'],
      ['property_profile', '2-unit, delivered vacant, good bones, renovated 2019'],
      ['has_history', 'yes'],
      ['last_contact', '3 days ago — sent written offer'],
      ['prior_summary', 'Owner open at the right price; wants 1.9M, we are at 1.65M'],
      ['opening_line', "Hey Michael, it's Adrian with the BB Real Estate Fund — we spoke about the place on Ocean Drive. Caught you at an okay time?"],
    ],
  },
  coldcall: {
    label: 'Adrian — Cold Call',
    rows: [
      ['lead_name', 'Michael Test'],
      ['listing_address', '123 Ocean Drive, Miami'],
      ['lead_email', ''],
      ['property_profile', '2-unit multifamily, owner-occupied'],
      ['has_history', 'no'],
      ['opening_line', "Yeah, hi there — I'm calling about the property over on one-two-three Ocean Drive. Are you the owner?"],
    ],
  },
  blank: { label: 'Blank', rows: [['', '']] },
};

let ROW_ID = 1;
const toRows = (pairs: [string, string][]): Row[] => pairs.map(([key, value]) => ({ id: ROW_ID++, key, value }));

// Native "common" fields the creator recognises inside a prompt and surfaces first-class.
const NATIVE: { test: RegExp; label: string; icon: any }[] = [
  { test: /name/i, label: 'Name', icon: User },
  { test: /(phone|number|mobile|cell|tel)\b|phone/i, label: 'Phone', icon: Phone },
  { test: /e-?mail/i, label: 'Email', icon: Mail },
  { test: /(address|street|city|zip|state|location)/i, label: 'Address', icon: MapPin },
];
const nativeOf = (key: string) => NATIVE.find((n) => n.test.test(key)) || null;

export default function TestAI() {
  const { workspaces, active, loading: wsLoading } = useWorkspace();
  // Deep-link support: /test-ai?agent=<id> pre-selects an agent (e.g. the AI Agents "Test" button).
  // The workspace is ALWAYS the active tenant — you cannot test another tenant's agents from here.
  const [sp] = useSearchParams();
  const qpAgent = sp.get('agent') || '';
  const [workspace, setWorkspace] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [numbers, setNumbers] = useState<Num[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaErr, setMetaErr] = useState('');

  const [agentId, setAgentId] = useState('');
  const [fromNumber, setFromNumber] = useState(''); // '' = auto
  const [toNumber, setToNumber] = useState('');
  const [rows, setRows] = useState<Row[]>(() => toRows(TEMPLATES.negotiator.rows));

  // Prompt-aware variable detection for the selected agent.
  const [detectedVars, setDetectedVars] = useState<string[]>([]);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [promptErr, setPromptErr] = useState('');

  // Saved templates (persisted per workspace).
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string>('');
  const [showSave, setShowSave] = useState(false);
  const [tplName, setTplName] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Workspace is HARD-locked to the active tenant (kept in sync when the sidebar switcher changes it).
  useEffect(() => { setWorkspace(active || ''); }, [active]);

  // Load agents + caller-ID numbers whenever the workspace changes.
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    setLoadingMeta(true); setMetaErr(''); setAgents([]); setNumbers([]); setAgentId(''); setFromNumber('');
    Promise.all([testai.agents(workspace), testai.numbers(workspace)])
      .then(([a, n]) => {
        if (cancelled) return;
        const ags: Agent[] = a.agents || [];
        setAgents(ags);
        setNumbers(n.numbers || []);
        // Preselect the deep-linked agent if present, else the Adrian negotiator, else the first agent.
        const wanted = qpAgent ? ags.find((x) => x.agent_id === qpAgent) : null;
        const neg = ags.find((x) => /negotiat/i.test(x.agent_name));
        setAgentId((wanted || neg || ags[0])?.agent_id || '');
      })
      .catch((e) => { if (!cancelled) setMetaErr(e?.message || 'Failed to load workspace'); })
      .finally(() => { if (!cancelled) setLoadingMeta(false); });
    return () => { cancelled = true; };
  }, [workspace]);

  // Load saved templates for the workspace.
  const loadTemplates = () => {
    if (!workspace) return;
    testai.templates(workspace).then((d) => setTemplates(d.templates || [])).catch(() => {});
  };
  useEffect(() => { setTemplates([]); setSelectedTpl(''); loadTemplates(); }, [workspace]);

  // Read the selected agent's prompt and auto-detect its {{variables}}. The creator then
  // auto-curates any detected variable that isn't already a row (non-destructive — existing
  // rows and their values are kept).
  useEffect(() => {
    if (!workspace || !agentId) { setDetectedVars([]); setPromptErr(''); setPromptLoaded(false); return; }
    let cancelled = false;
    setPromptLoading(true); setPromptErr(''); setPromptLoaded(false);
    testai.agentPromptVars(workspace, agentId)
      .then((d) => {
        if (cancelled) return;
        const vars: string[] = d.variables || [];
        setDetectedVars(vars); setPromptLoaded(true);
        setRows((rs) => {
          const have = new Set(rs.map((r) => r.key.trim()).filter(Boolean));
          const additions = vars.filter((v) => !have.has(v)).map((v) => ({ id: ROW_ID++, key: v, value: '' }));
          if (!additions.length) return rs;
          const kept = rs.filter((r) => r.key.trim() || r.value.trim());
          return [...kept, ...additions];
        });
      })
      .catch((e) => { if (!cancelled) { setPromptErr(e?.message || 'Could not read this agent’s prompt'); setDetectedVars([]); setPromptLoaded(false); } })
      .finally(() => { if (!cancelled) setPromptLoading(false); });
    return () => { cancelled = true; };
  }, [workspace, agentId]);

  const dynamicVars = useMemo(() => {
    const o: Record<string, string> = {};
    for (const r of rows) { const k = r.key.trim(); if (k) o[k] = r.value; }
    return o;
  }, [rows]);

  // Variables the user typed that the agent's prompt never references (non-blocking warning).
  const unknownKeys = useMemo(() => {
    if (!promptLoaded || !detectedVars.length) return [] as string[];
    const set = new Set(detectedVars);
    return [...new Set(rows.map((r) => r.key.trim()).filter((k) => k && !set.has(k)))];
  }, [rows, detectedVars, promptLoaded]);

  const toDigits = toNumber.replace(/\D/g, '');
  const canCall = !!workspace && !!agentId && toDigits.length >= 10 && !placing;

  function applyStarter(key: string) { if (TEMPLATES[key]) { setRows(toRows(TEMPLATES[key].rows)); setSelectedTpl(''); } }
  function applySaved(id: string) {
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setSelectedTpl(id);
    const cfg = t.config || {};
    const pairs: [string, string][] = Array.isArray(cfg.rows) ? cfg.rows.map((r: any) => [String(r.key || ''), String(r.value || '')]) : [];
    setRows(toRows(pairs.length ? pairs : [['', '']]));
    if (typeof cfg.from_number === 'string') setFromNumber(cfg.from_number);
    if (t.agent_id) setAgentId(t.agent_id);
  }
  function setRow(id: number, patch: Partial<Row>) { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); }
  function addRow() { setRows((rs) => [...rs, { id: ROW_ID++, key: '', value: '' }]); }
  function addVar(key: string) { setRows((rs) => (rs.some((r) => r.key.trim() === key) ? rs : [...rs.filter((r) => r.key.trim() || r.value.trim()), { id: ROW_ID++, key, value: '' }])); }
  function removeRow(id: number) { setRows((rs) => rs.filter((r) => r.id !== id)); }
  function resetToPrompt() { setRows(toRows(detectedVars.length ? detectedVars.map((v) => [v, ''] as [string, string]) : [['', '']])); }

  async function saveTemplate() {
    if (!tplName.trim() || !workspace) return;
    setSavingTpl(true); setMetaErr('');
    try {
      const cfg = { rows: rows.filter((r) => r.key.trim()).map((r) => ({ key: r.key.trim(), value: r.value })), from_number: fromNumber };
      const r = await testai.saveTemplate({ workspace, name: tplName.trim(), agent_id: agentId || undefined, config: cfg });
      setTplName(''); setShowSave(false);
      loadTemplates();
      if (r?.template?.id) setSelectedTpl(String(r.template.id));
    } catch (e: any) { setMetaErr(e?.message || 'Save failed'); } finally { setSavingTpl(false); }
  }
  async function deleteTemplate(id: string) {
    try { await testai.deleteTemplate(Number(id)); if (selectedTpl === id) setSelectedTpl(''); loadTemplates(); } catch (e: any) { setMetaErr(e?.message || 'Delete failed'); }
  }

  async function placeCall() {
    setPlacing(true); setResult(null);
    try {
      const r = await testai.call({
        workspace,
        agent_id: agentId,
        to_number: toNumber,
        from_number: fromNumber || undefined,
        dynamic_variables: dynamicVars,
      });
      setConfirmOpen(false);
      setResult({ ok: true, msg: `Call launched to ${toNumber} — pick up, your phone should ring in a few seconds. (call ${r.call_id || 'queued'})` });
    } catch (e: any) {
      setConfirmOpen(false);
      setResult({ ok: false, msg: e?.message || 'Call failed' });
    } finally { setPlacing(false); }
  }

  const agentName = agents.find((a) => a.agent_id === agentId)?.agent_name || agentId;
  const activeName = workspaces.find((w) => w.slug === workspace)?.display_name || workspace || '—';

  if (wsLoading) return <Spinner label="Loading…" />;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHead
        title="Test AI"
        subtitle="Ring your own phone to hear any agent live. Pick an agent, punch in a number, tweak the mock contact, and call."
      />

      {result && (
        <div className={`mb-5 flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="font-medium">{result.msg}</span>
          <button onClick={() => setResult(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        {/* LEFT — who / where */}
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-ink">Call setup</h2>

          <label className="label">Workspace</label>
          <div className="input mt-1 flex items-center bg-surface font-semibold text-slate-600">{activeName}</div>
          <p className="mt-1 text-xs text-slate-400">Locked to your active workspace — switch workspaces from the sidebar to test a different tenant's agents.</p>

          <label className="label mt-4 block">Agent</label>
          <select className="input mt-1" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={loadingMeta || !agents.length}>
            {loadingMeta && <option>Loading…</option>}
            {!loadingMeta && !agents.length && <option value="">No agents in this workspace</option>}
            {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
          </select>

          <label className="label mt-4 block">Your phone number (the call rings this)</label>
          <input className="input mt-1" inputMode="tel" placeholder="(305) 555-0142" value={toNumber} onChange={(e) => setToNumber(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">A real outbound call is placed to this number. Use your own to test.</p>

          <label className="label mt-4 block">Caller ID (from)</label>
          <select className="input mt-1" value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} disabled={loadingMeta}>
            <option value="">Auto — use the agent's number</option>
            {numbers.map((n) => <option key={n.phone_number} value={n.phone_number}>{n.pretty}{n.nickname ? ` · ${n.nickname}` : ''}</option>)}
          </select>

          {metaErr && <p className="mt-3 text-xs font-semibold text-rose-600">{metaErr}</p>}

          <button
            className="btn-primary mt-6 w-full"
            disabled={!canCall}
            onClick={() => { setResult(null); setConfirmOpen(true); }}
          >
            <PhoneOutgoing className="h-4 w-4" /> Place test call
          </button>
        </div>

        {/* RIGHT — mock contact + template creator */}
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">Mock contact — dynamic variables</h2>
            <div className="flex items-center gap-2">
              <select className="input w-auto py-1.5 text-xs" value={selectedTpl}
                onChange={(e) => { const v = e.target.value; if (!v) return; if (v.startsWith('starter:')) applyStarter(v.slice(8)); else applySaved(v); }}>
                <option value="">Load template…</option>
                <optgroup label="Starters">
                  {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={`starter:${k}`}>{t.label}</option>)}
                </optgroup>
                {templates.length > 0 && (
                  <optgroup label="Saved">
                    {templates.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                  </optgroup>
                )}
              </select>
              <button onClick={() => { setShowSave((s) => !s); setTplName(''); }} className="btn-ghost py-1.5 text-xs" title="Save current variables as a reusable template">
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            </div>
          </div>

          {/* Save-as-template inline form */}
          {showSave && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-surface p-2.5">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <input autoFocus className="input flex-1 py-1.5 text-sm" placeholder="Template name (e.g. Miami cold-call)" value={tplName}
                onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTemplate(); }} />
              <button className="btn-primary py-1.5 text-xs" disabled={!tplName.trim() || savingTpl} onClick={saveTemplate}>
                {savingTpl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </button>
              <button className="btn-ghost py-1.5 text-xs" onClick={() => setShowSave(false)}><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* Delete control for the currently-selected saved template */}
          {selectedTpl && !selectedTpl.startsWith('starter:') && templates.some((t) => String(t.id) === selectedTpl) && (
            <div className="mb-3 flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 text-xs text-slate-500">
              <span>Editing from saved template: <b className="text-ink">{templates.find((t) => String(t.id) === selectedTpl)?.name}</b></span>
              <button onClick={() => deleteTemplate(selectedTpl)} className="inline-flex items-center gap-1 text-rose-500 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
            </div>
          )}

          {/* Prompt-aware variable panel */}
          <div className="mb-3 rounded-lg border border-line bg-surface p-2.5 text-xs">
            {promptLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading this agent's prompt…</div>}
            {!promptLoading && promptErr && <div className="flex items-start gap-1.5 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {promptErr} — you can still add variables manually.</div>}
            {!promptLoading && !promptErr && promptLoaded && (
              detectedVars.length ? (
                <>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-semibold text-ink"><Sparkles className="h-3.5 w-3.5 text-brand" /> {detectedVars.length} variable{detectedVars.length === 1 ? '' : 's'} in this agent's prompt</span>
                    <button onClick={resetToPrompt} className="text-brand hover:underline">Reset to prompt vars</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedVars.map((v) => {
                      const nat = nativeOf(v);
                      const used = rows.some((r) => r.key.trim() === v);
                      const Icon = nat?.icon;
                      return (
                        <button key={v} onClick={() => addVar(v)} title={used ? 'Already added' : 'Add to variables'}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono ${used ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-white text-slate-600 hover:border-brand hover:text-brand'}`}>
                          {Icon && <Icon className="h-3 w-3" />}{v}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-500"><Info className="h-3.5 w-3.5" /> No <code className="font-mono">{'{{variables}}'}</code> detected in this agent's prompt.</div>
              )
            )}
            {!promptLoading && !promptLoaded && !promptErr && (
              <div className="flex items-start gap-1.5 text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> These are the <code className="font-mono">{'{{variables}}'}</code> the agent reads on the call. Pick an agent to auto-detect them.</div>
            )}
          </div>

          {/* Non-blocking warning for variables not referenced in the prompt */}
          {unknownKeys.length > 0 && (
            <div className="mb-3 flex flex-col gap-0.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              {unknownKeys.map((k) => (
                <div key={k} className="flex items-center gap-1.5"><span aria-hidden>⚠</span> <span><code className="font-mono">{`{{${k}}}`}</code> isn't referenced in this agent's prompt.</span></div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const unknown = promptLoaded && detectedVars.length > 0 && r.key.trim() && !detectedVars.includes(r.key.trim());
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <input className={`input w-2/5 font-mono text-xs ${unknown ? 'border-amber-300' : ''}`} placeholder="variable" value={r.key} onChange={(e) => setRow(r.id, { key: e.target.value })} />
                  <input className="input flex-1" placeholder="value" value={r.value} onChange={(e) => setRow(r.id, { value: e.target.value })} />
                  <button onClick={() => removeRow(r.id)} className="shrink-0 rounded-lg border border-line bg-white p-2 text-slate-400 hover:text-rose-600" title="Remove"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
          <button onClick={addRow} className="btn-ghost mt-3 text-xs"><Plus className="h-3.5 w-3.5" /> Add variable</button>
        </div>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => !placing && setConfirmOpen(false)}>
          <div className="w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2"><PhoneOutgoing className="h-5 w-5 text-brand" /><h3 className="text-base font-bold text-ink">Place this test call?</h3></div>
            <div className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Agent</span><span className="font-semibold text-ink">{agentName}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Rings</span><span className="font-mono font-semibold text-ink">{toNumber}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Caller ID</span><span className="font-semibold text-ink">{fromNumber || 'Auto'}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Variables</span><span className="font-semibold text-ink">{Object.keys(dynamicVars).length}</span></div>
            </div>
            {unknownKeys.length > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {unknownKeys.length} variable{unknownKeys.length === 1 ? '' : 's'} not referenced in the prompt (harmless).</p>}
            <p className="mt-3 text-xs text-slate-500">This dials a real phone and uses live minutes. Make sure the number is yours.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" disabled={placing} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={placing} onClick={placeCall}>
                {placing ? <><Loader2 className="h-4 w-4 animate-spin" /> Calling…</> : <><Play className="h-4 w-4" /> Call now</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
