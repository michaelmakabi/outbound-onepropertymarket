import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { testai } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner, EmptyState } from '../components/ui';
import {
  Bot, PhoneIncoming, PhoneOutgoing, Handshake, ConciergeBell, ClipboardCheck,
  LayoutGrid, Table as TableIcon, Copy, Pencil, PlayCircle, Loader2, X, Save,
  CheckCircle2, AlertCircle, RefreshCw, Mic,
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

// Small helper: map a derived agent "type" to a lucide icon + colored avatar circle.
const TYPE_META: Record<string, { icon: any; ring: string; label: string }> = {
  negotiator: { icon: Handshake, ring: 'bg-amber-100 text-amber-700', label: 'Negotiator' },
  inbound: { icon: PhoneIncoming, ring: 'bg-sky-100 text-sky-700', label: 'Inbound' },
  outbound: { icon: PhoneOutgoing, ring: 'bg-emerald-100 text-emerald-700', label: 'Outbound' },
  concierge: { icon: ConciergeBell, ring: 'bg-violet-100 text-violet-700', label: 'Concierge' },
  qualifier: { icon: ClipboardCheck, ring: 'bg-indigo-100 text-indigo-700', label: 'Qualifier' },
  general: { icon: Bot, ring: 'bg-slate-100 text-slate-600', label: 'Assistant' },
};
const metaFor = (t: string) => TYPE_META[t] || TYPE_META.general;

export default function AiAgents() {
  const nav = useNavigate();
  const { active, activeName, loading: wsLoading } = useWorkspace();
  const { isAdmin } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [cloningId, setCloningId] = useState('');
  const [editing, setEditing] = useState<Agent | null>(null);

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
    // Reuse the Test AI launch path, pre-selecting this workspace + agent.
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

  if (wsLoading) return <Spinner label="Loading…" />;

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHead
        title="AI Agents"
        subtitle={`Your workspace's voice agents${activeName ? ` — ${activeName}` : ''}. Test them live, clone a copy, or edit the live prompt.`}
        right={
          <div className="flex items-center gap-2">
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
        <EmptyState text="No AI agents are assigned to this workspace yet." />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => {
            const meta = metaFor(a.type);
            const Icon = meta.icon;
            return (
              <div key={a.agent_id} className="card flex flex-col p-5">
                <div className="mb-3 flex items-start gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${meta.ring}`}><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{a.agent_name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.ring}`}>{meta.label}</span>
                      {!a.live && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">cached</span>}
                    </div>
                  </div>
                </div>
                <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">{a.description}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => testAgent(a)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90"><PlayCircle className="h-3.5 w-3.5" /> Test</button>
                  <button onClick={() => cloneAgent(a)} disabled={cloningId === a.agent_id} className="btn-ghost !py-1.5 text-xs">{cloningId === a.agent_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Clone</button>
                  {isAdmin && <button onClick={() => setEditing(a)} className="btn-ghost !py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
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
                          <button onClick={() => cloneAgent(a)} disabled={cloningId === a.agent_id} className="btn-ghost !py-1.5 text-xs">{cloningId === a.agent_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}</button>
                          {isAdmin && <button onClick={() => setEditing(a)} className="btn-ghost !py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /></button>}
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

      {editing && isAdmin && (
        <EditAgentModal
          workspace={active || ''}
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); flash(true, msg); load(); }}
          onError={(msg) => flash(false, msg)}
        />
      )}
    </div>
  );
}

function EditAgentModal({ workspace, agent, onClose, onSaved, onError }: {
  workspace: string; agent: Agent; onClose: () => void; onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [name, setName] = useState(agent.agent_name);
  const [voice, setVoice] = useState(agent.voice_id || '');
  const [prompt, setPrompt] = useState(agent.general_prompt || '');
  const [saving, setSaving] = useState(false);
  const promptEditable = !!agent.llm_id;

  const dirty = useMemo(() => (
    name.trim() !== agent.agent_name ||
    voice.trim() !== (agent.voice_id || '') ||
    (promptEditable && prompt !== (agent.general_prompt || ''))
  ), [name, voice, prompt, agent, promptEditable]);

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    const patch: any = { workspace, agent_id: agent.agent_id };
    if (name.trim() !== agent.agent_name) patch.name = name.trim();
    if (voice.trim() !== (agent.voice_id || '')) patch.voice_id = voice.trim();
    if (promptEditable && prompt !== (agent.general_prompt || '')) patch.general_prompt = prompt;
    try {
      const r = await testai.updateAgent(patch);
      onSaved(`Saved to Retell — updated ${(r.applied || []).join(', ') || 'agent'}.`);
    } catch (e: any) { onError(e?.message || 'Update failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-bold text-ink"><Pencil className="h-5 w-5 text-brand" /> Edit agent</div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <label className="label mt-1 block">Agent name</label>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />

        <label className="label mt-4 block flex items-center gap-1.5"><Mic className="h-3.5 w-3.5" /> Voice ID <span className="font-normal text-slate-400">(optional — Retell voice_id)</span></label>
        <input className="input mt-1 font-mono text-xs" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="e.g. 11labs-Adrian" />

        <label className="label mt-4 block">Prompt <span className="font-normal text-slate-400">(general_prompt — the description shown to customers is the first line)</span></label>
        {promptEditable ? (
          <textarea className="input mt-1 min-h-[220px] font-mono text-xs leading-relaxed" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="The agent's instructions…" />
        ) : (
          <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">This agent is a conversation-flow agent — its prompt isn't editable here. Name and voice still save.</div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-slate-400">Saving PATCHes the live agent in Retell for this workspace.</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost" disabled={saving}>Cancel</button>
            <button onClick={save} disabled={!dirty || saving} className="btn-primary">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save to Retell</>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
