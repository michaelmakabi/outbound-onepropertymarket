import { useEffect, useState } from 'react';
import { agentTools } from '../lib/agents';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner } from '../components/ui';
import { Bot, Copy, ArrowRight, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

type Ws = { slug: string; display_name: string; connected: boolean; status: string | null };

export default function AgentClone() {
  const { user } = useAuth();
  const [wss, setWss] = useState<Ws[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [agents, setAgents] = useState<{ agent_id: string; agent_name: string }[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    agentTools.workspaces().then((d) => setWss(d.workspaces || [])).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const loadAgents = (slug: string) => {
    setAgents([]); setAgentId('');
    if (!slug) return;
    setLoadingAgents(true); setErr('');
    agentTools.listAgents(slug).then((d) => setAgents(d.agents || [])).catch((e) => setErr(e.message)).finally(() => setLoadingAgents(false));
  };

  const clone = async () => {
    setErr(''); setResult(null); setBusy(true);
    try {
      const r = await agentTools.clone({ source_workspace: source, target_workspace: target, source_agent_id: agentId, new_name: newName || undefined });
      setResult(r);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (user?.role !== 'super_admin') return <div className="py-16 text-center text-slate-400">Agent cloning is restricted to super admins.</div>;
  if (loading) return <Spinner />;

  const connected = wss.filter((w) => w.connected);
  const canClone = source && target && agentId && source !== target;

  return (
    <div>
      <PageHead title="Clone Agent" subtitle="Copy a proven agent's prompt and settings into a customer's Retell workspace" />

      <div className="mx-auto max-w-2xl">
        {connected.length < 2 && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> You need at least two workspaces with a Retell key connected (a source to clone from and a target to clone into). Connect keys under Customers → provision.
          </div>
        )}

        <div className="card p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-1 block">Clone from (source)</label>
              <select className="input w-full" value={source} onChange={(e) => { setSource(e.target.value); loadAgents(e.target.value); }}>
                <option value="">Select a workspace…</option>
                {connected.map((w) => <option key={w.slug} value={w.slug}>{w.display_name} ({w.slug})</option>)}
              </select>
            </div>
            <div>
              <label className="label mb-1 block">Clone into (target customer)</label>
              <select className="input w-full" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Select a workspace…</option>
                {connected.filter((w) => w.slug !== source).map((w) => <option key={w.slug} value={w.slug}>{w.display_name} ({w.slug})</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="label mb-1 flex items-center gap-2">Source agent {loadingAgents && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              {source && !loadingAgents && <button className="text-xs text-brand hover:underline" onClick={() => loadAgents(source)}><RefreshCw className="mr-0.5 inline h-3 w-3" />refresh</button>}
            </label>
            <select className="input w-full" value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={!source || loadingAgents}>
              <option value="">{source ? (agents.length ? 'Select an agent…' : 'No agents found') : 'Pick a source workspace first'}</option>
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
            </select>
          </div>

          <div className="mt-4">
            <label className="label mb-1 block">New agent name (optional)</label>
            <input className="input w-full" value={newName} placeholder="Defaults to “<source name> (clone)”" onChange={(e) => setNewName(e.target.value)} />
          </div>

          {err && <div className="mt-4 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" /> {err}</div>}

          <button className="btn-primary mt-5 w-full justify-center" disabled={!canClone || busy} onClick={clone}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Cloning…</> : <><Copy className="h-4 w-4" /> Clone agent <ArrowRight className="h-4 w-4" /> {target || 'target'}</>}
          </button>
        </div>

        {result && (
          <div className="mt-4 card border-emerald-200 p-5">
            <div className="flex items-center gap-2 font-bold text-emerald-700"><Check className="h-5 w-5" /> Agent cloned into {target}</div>
            <div className="mt-2 space-y-1 text-sm text-slate-600">
              <div><span className="text-slate-400">New agent:</span> <b className="text-ink">{result.agent_name}</b></div>
              <div className="font-mono text-xs"><span className="font-sans text-slate-400">agent_id:</span> {result.agent_id}</div>
              <div className="font-mono text-xs"><span className="font-sans text-slate-400">llm_id:</span> {result.llm_id}</div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Bot className="h-3.5 w-3.5" /> It now lives in the target workspace's Retell account — assign a number to it there to go live.</div>
          </div>
        )}
      </div>
    </div>
  );
}
