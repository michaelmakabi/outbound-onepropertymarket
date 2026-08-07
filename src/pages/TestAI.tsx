import { useEffect, useMemo, useState } from 'react';
import { testai } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { PageHead, Spinner } from '../components/ui';
import { PhoneOutgoing, Plus, Trash2, Play, X, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';

type Agent = { agent_id: string; agent_name: string };
type Num = { phone_number: string; pretty: string; nickname: string; outbound_agent_ids: string[] };
type Row = { id: number; key: string; value: string };

// Ready-made mock-contact templates. Fully editable — pick one, then tweak any field.
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

export default function TestAI() {
  const { workspaces, active, loading: wsLoading } = useWorkspace();
  const [workspace, setWorkspace] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [numbers, setNumbers] = useState<Num[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaErr, setMetaErr] = useState('');

  const [agentId, setAgentId] = useState('');
  const [fromNumber, setFromNumber] = useState(''); // '' = auto
  const [toNumber, setToNumber] = useState('');
  const [rows, setRows] = useState<Row[]>(() => toRows(TEMPLATES.negotiator.rows));

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Default the workspace selector to the active tenant.
  useEffect(() => { if (!workspace && active) setWorkspace(active); }, [active, workspace]);

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
        // Preselect the Adrian negotiator if present, else the first agent.
        const neg = ags.find((x) => /negotiat/i.test(x.agent_name));
        setAgentId((neg || ags[0])?.agent_id || '');
      })
      .catch((e) => { if (!cancelled) setMetaErr(e?.message || 'Failed to load workspace'); })
      .finally(() => { if (!cancelled) setLoadingMeta(false); });
    return () => { cancelled = true; };
  }, [workspace]);

  const dynamicVars = useMemo(() => {
    const o: Record<string, string> = {};
    for (const r of rows) { const k = r.key.trim(); if (k) o[k] = r.value; }
    return o;
  }, [rows]);

  const toDigits = toNumber.replace(/\D/g, '');
  const canCall = !!workspace && !!agentId && toDigits.length >= 10 && !placing;

  function applyTemplate(key: string) { if (TEMPLATES[key]) setRows(toRows(TEMPLATES[key].rows)); }
  function setRow(id: number, patch: Partial<Row>) { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); }
  function addRow() { setRows((rs) => [...rs, { id: ROW_ID++, key: '', value: '' }]); }
  function removeRow(id: number) { setRows((rs) => rs.filter((r) => r.id !== id)); }

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
          <select className="input mt-1" value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
            {workspaces.length === 0 && <option value="">No workspaces</option>}
            {workspaces.map((w) => <option key={w.slug} value={w.slug}>{w.display_name}</option>)}
          </select>

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

        {/* RIGHT — mock contact */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">Mock contact — dynamic variables</h2>
            <select className="input w-auto py-1.5 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = ''; } }}>
              <option value="">Load template…</option>
              {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </div>
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface p-2.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            These are the <code className="font-mono">{'{{variables}}'}</code> the agent reads on the call. Edit any value, add your own, or clear rows you don't need.
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <input className="input w-2/5 font-mono text-xs" placeholder="variable" value={r.key} onChange={(e) => setRow(r.id, { key: e.target.value })} />
                <input className="input flex-1" placeholder="value" value={r.value} onChange={(e) => setRow(r.id, { value: e.target.value })} />
                <button onClick={() => removeRow(r.id)} className="shrink-0 rounded-lg border border-line bg-white p-2 text-slate-400 hover:text-rose-600" title="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
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
