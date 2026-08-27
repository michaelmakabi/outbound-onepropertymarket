import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testai } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { PageHead, Spinner, EmptyState } from '../components/ui';
import {
  Bot, PhoneIncoming, PhoneOutgoing, Handshake, ConciergeBell, ClipboardCheck,
  LayoutGrid, Table as TableIcon, Copy, Pencil, PlayCircle, Loader2, X,
  CheckCircle2, AlertCircle, RefreshCw, Phone, Plus,
} from 'lucide-react';

type Agent = {
  agent_id: string;
  agent_name: string;
  voice_id: string | null;
  language: string | null;
  llm_id: string | null;
  engine_type: string | null;
  general_prompt: string;
  type: string;
  description: string;
  live: boolean;
};

type ViewMode = 'grid' | 'table';

const TYPE_META: Record<string, { icon: any; ring: string; label: string }> = {
  negotiator: { icon: Handshake, ring: 'bg-amber-100 text-amber-700', label: 'Negotiator' },
  inbound: { icon: PhoneIncoming, ring: 'bg-sky-100 text-sky-700', label: 'Inbound' },
  outbound: { icon: PhoneOutgoing, ring: 'bg-emerald-100 text-emerald-700', label: 'Outbound' },
  concierge: { icon: ConciergeBell, ring: 'bg-violet-100 text-violet-700', label: 'Concierge' },
  qualifier: { icon: ClipboardCheck, ring: 'bg-indigo-100 text-indigo-700', label: 'Qualifier' },
  general: { icon: Bot, ring: 'bg-slate-100 text-slate-600', label: 'Assistant' },
};
const metaFor = (t: string) => TYPE_META[t] || TYPE_META.general;
const fmtNum = (n: string) => { const d = String(n || '').replace(/\D/g, '').replace(/^1/, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };

export default function AiAgents() {
  const nav = useNavigate();
  const { active, activeName, loading: wsLoading } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [cloningId, setCloningId] = useState('');

  // ---- Assign-numbers modal ----
  const [assignFor, setAssignFor] = useState<Agent | null>(null);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [numLoading, setNumLoading] = useState(false);
  const [numBusy, setNumBusy] = useState(false);
  const [sel, setSel] = useState<Record<string, { inbound: boolean; outbound: boolean }>>({});

  // ---- Create-agent modal ----
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  function editAgent(a: Agent) { nav(`/ai-agents/${encodeURIComponent(a.agent_id)}/edit`); }

  const load = () => {
    if (!active) return;
    setLoading(true); setErr('');
    testai.agentsDetailed(active)
      .then((d) => setAgents(d.agents || []))
      .catch((e) => setErr(e?.message || 'Failed to load agents'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (active) load(); /* eslint-disable-next-line */ }, [active]);

  function flash(ok: boolean, msg: string) { setToast({ ok, msg }); setTimeout(() => setToast(null), 5000); }

  function testAgent(a: Agent) {
    nav(`/test-ai?workspace=${encodeURIComponent(active || '')}&agent=${encodeURIComponent(a.agent_id)}`);
  }

  async function cloneAgent(a: Agent) {
    if (!active || cloningId) return;
    setCloningId(a.agent_id);
    try {
      const r = await testai.cloneAgent({ workspace: active, agent_id: a.agent_id });
      flash(true, `Cloned "${a.agent_name}" → ${r.agent_name}. It now lives in this workspace.`);
      load();
    } catch (e: any) { flash(false, e?.message || 'Clone failed'); }
    finally { setCloningId(''); }
  }

  // Open the assign-numbers modal for one agent: load the workspace's numbers + seed the
  // toggles from each number's current inbound/outbound binding to THIS agent.
  async function openAssign(a: Agent) {
    if (!active) return;
    setAssignFor(a); setNumLoading(true); setNumbers([]); setSel({});
    try {
      const d = await testai.numbers(active);
      const nums = d.numbers || [];
      setNumbers(nums);
      const seed: Record<string, { inbound: boolean; outbound: boolean }> = {};
      for (const n of nums) {
        seed[n.phone_number] = {
          inbound: (n.inbound_agent_ids || []).includes(a.agent_id),
          outbound: (n.outbound_agent_ids || []).includes(a.agent_id),
        };
      }
      setSel(seed);
    } catch (e: any) { flash(false, e?.message || 'Could not load numbers'); setAssignFor(null); }
    finally { setNumLoading(false); }
  }
  const toggleSel = (phone: string, role: 'inbound' | 'outbound') =>
    setSel((s) => ({ ...s, [phone]: { ...(s[phone] || { inbound: false, outbound: false }), [role]: !(s[phone]?.[role]) } }));

  async function saveAssign() {
    if (!assignFor || !active) return;
    setNumBusy(true);
    let ok = 0, fail = 0;
    try {
      for (const n of numbers) {
        const cur = sel[n.phone_number] || { inbound: false, outbound: false };
        if (!cur.inbound && !cur.outbound) continue; // only apply the numbers the user turned on
        try {
          await testai.assignNumber({
            workspace: active, phone: n.phone_number,
            ...(cur.outbound ? { outbound_agent_id: assignFor.agent_id } : {}),
            ...(cur.inbound ? { inbound_agent_id: assignFor.agent_id } : {}),
          });
          ok++;
        } catch { fail++; }
      }
      flash(fail === 0, fail === 0 ? `Assigned ${assignFor.agent_name} to ${ok} number${ok === 1 ? '' : 's'}.` : `Assigned ${ok}, ${fail} failed.`);
      setAssignFor(null);
    } finally { setNumBusy(false); }
  }

  async function createNew() {
    if (!active || creating || !newName.trim()) return;
    setCreating(true);
    try {
      const r = await testai.createAgent({ workspace: active, name: newName.trim(), general_prompt: newPrompt.trim() || undefined });
      flash(true, `Created "${r.agent_name}". Opening the editor…`);
      setNewOpen(false); setNewName(''); setNewPrompt('');
      load();
      nav(`/ai-agents/${encodeURIComponent(r.agent_id)}/edit`);
    } catch (e: any) { flash(false, e?.message || 'Could not create agent'); }
    finally { setCreating(false); }
  }

  if (wsLoading) return <Spinner label="Loading…" />;

  return (
    <div className="w-full">
      <PageHead
        title="AI Agents"
        subtitle={`Your workspace's voice agents${activeName ? ` — ${activeName}` : ''}. Create, edit, test, clone, and assign calling numbers.`}
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => { setNewName(''); setNewPrompt(''); setNewOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90"><Plus className="h-4 w-4" /> New agent</button>
            <button onClick={load} className="btn-ghost" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
            <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
              {([['grid', 'Grid', LayoutGrid], ['table', 'Table', TableIcon]] as [ViewMode, string, any][]).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setView(m)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === m ? 'bg-brand text-white' : 'text-slate-600 hover:bg-surface'}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {toast && (
        <div className={`mb-5 flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="font-medium">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-auto text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {err && <div className="mb-5 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"><AlertCircle className="h-4 w-4" /> {err}</div>}

      {loading ? <Spinner label="Loading agents…" /> : agents.length === 0 ? (
        <EmptyState text="No AI agents in this workspace yet — click “New agent” to create one." />
      ) : view === 'grid' ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {agents.map((a) => {
            const meta = metaFor(a.type);
            const Icon = meta.icon;
            return (
              <div key={a.agent_id} className="card flex flex-col p-6">
                <div className="mb-4 flex items-start gap-4">
                  <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${meta.ring}`}><Icon className="h-7 w-7" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold text-ink">{a.agent_name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.ring}`}>{meta.label}</span>
                      {!a.live && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">cached</span>}
                    </div>
                  </div>
                </div>
                <p className="mb-5 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500">{a.description}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => testAgent(a)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand/90"><PlayCircle className="h-4 w-4" /> Test</button>
                  <button onClick={() => editAgent(a)} className="btn-ghost text-sm"><Pencil className="h-4 w-4" /> Edit</button>
                  <button onClick={() => openAssign(a)} className="btn-ghost text-sm"><Phone className="h-4 w-4" /> Numbers</button>
                  <button onClick={() => cloneAgent(a)} disabled={cloningId === a.agent_id} className="btn-ghost text-sm">{cloningId === a.agent_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Clone</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Agent</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const meta = metaFor(a.type);
                  const Icon = meta.icon;
                  return (
                    <tr key={a.agent_id} className="border-t border-line align-middle">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${meta.ring}`}><Icon className="h-4 w-4" /></div>
                          <span className="font-semibold text-ink">{a.agent_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.ring}`}>{meta.label}</span></td>
                      <td className="px-4 py-3 max-w-[360px] text-xs text-slate-500"><span className="line-clamp-2">{a.description}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => testAgent(a)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"><PlayCircle className="h-3.5 w-3.5" /> Test</button>
                          <button onClick={() => editAgent(a)} className="btn-ghost !py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => openAssign(a)} className="btn-ghost !py-1.5 text-xs"><Phone className="h-3.5 w-3.5" /></button>
                          <button onClick={() => cloneAgent(a)} disabled={cloningId === a.agent_id} className="btn-ghost !py-1.5 text-xs">{cloningId === a.agent_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign-numbers modal */}
      {assignFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setAssignFor(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-bold text-ink"><Phone className="h-5 w-5 text-brand" /> Assign numbers</div>
              <button onClick={() => setAssignFor(null)} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Pick which of this workspace's numbers <span className="font-semibold text-ink">{assignFor.agent_name}</span> answers on (inbound) and dials from (outbound). Numbers with no outbound agent are flagged as available.</p>
            {numLoading ? <Spinner label="Loading numbers…" /> : numbers.length === 0 ? (
              <EmptyState text="No phone numbers on this workspace's account yet. Buy numbers on the Phone Numbers page first." />
            ) : (
              <div className="space-y-2">
                {numbers.map((n) => {
                  const s = sel[n.phone_number] || { inbound: false, outbound: false };
                  const available = !(n.outbound_agent_ids || []).length;
                  return (
                    <div key={n.phone_number} className="rounded-xl border border-line p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-ink">{fmtNum(n.phone_number)}</span>
                          {n.nickname && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{n.nickname}</span>}
                          {available && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">available</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => toggleSel(n.phone_number, 'outbound')} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${s.outbound ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line text-slate-600 hover:border-emerald-400'}`}><PhoneOutgoing className="h-3 w-3" /> Outbound</button>
                          <button onClick={() => toggleSel(n.phone_number, 'inbound')} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${s.inbound ? 'border-sky-500 bg-sky-500 text-white' : 'border-line text-slate-600 hover:border-sky-400'}`}><PhoneIncoming className="h-3 w-3" /> Inbound</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setAssignFor(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface">Cancel</button>
              <button onClick={saveAssign} disabled={numBusy || numLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{numBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save assignments</button>
            </div>
          </div>
        </div>
      )}

      {/* Create-agent modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => setNewOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-bold text-ink"><Bot className="h-5 w-5 text-brand" /> New AI agent</div>
              <button onClick={() => setNewOpen(false)} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Agent name</label>
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Adrian — Seller Outreach" className="input w-full text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Starting prompt <span className="font-normal text-slate-400">(optional — refine in the editor)</span></label>
                <textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} rows={4} placeholder="Describe how this agent should speak and what it should do on the call…" className="input w-full resize-y text-sm" />
              </div>
              <p className="text-[11px] text-slate-400">Creates the agent on this workspace's own voice account with the standard disposition + follow-up capture fields. It opens in the full editor so you can set voice, model and behavior.</p>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setNewOpen(false)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface">Cancel</button>
              <button onClick={createNew} disabled={creating || !newName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create agent</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
