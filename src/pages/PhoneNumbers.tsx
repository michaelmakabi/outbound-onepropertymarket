import { useEffect, useMemo, useState, useCallback } from 'react';
import { tokenStore, workspaceStore } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { Phone, PhoneOutgoing, PhoneIncoming, Plus, Trash2, Loader2, CheckCircle2, X, Radio, Sparkles, ShoppingCart, UserCheck, Hash, AlertTriangle } from 'lucide-react';

// Self-contained client for the dedicated `opm-numbers` edge function (buy / remove / assign / list
// Retell numbers in bulk, + area-code suggestions). Scoped to the active workspace like the rest of the app.
const NUM_BASE =
  (import.meta as any).env?.VITE_OPMNUMBERS_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-numbers') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-numbers');

async function numCall(action: string, opts: { method?: string; body?: any } = {}) {
  const url = new URL(NUM_BASE);
  url.searchParams.set('action', action);
  const ws = workspaceStore.get();
  if (ws) url.searchParams.set('workspace', ws);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const fmtPhone = (p: string) => {
  const d = String(p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};

type Num = {
  phone_number: string; nickname: string; area_code: string;
  inbound_agent_id: string | null; outbound_agent_id: string | null;
  inbound_agent_name: string | null; outbound_agent_name: string | null;
  in_dialer: boolean;
};
type Agent = { agent_id: string; agent_name: string };

export default function PhoneNumbers() {
  const { activeName, active } = useWorkspace();
  const [numbers, setNumbers] = useState<Num[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');

  // Buy panel state.
  const [showBuy, setShowBuy] = useState(false);
  const [areaInput, setAreaInput] = useState('');
  const [perArea, setPerArea] = useState(1);
  const [buyNick, setBuyNick] = useState('');
  const [buyAgent, setBuyAgent] = useState('');
  const [addToDialer, setAddToDialer] = useState(true);
  const [suggests, setSuggests] = useState<{ area_code: string; count: number; pct: number }[] | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);

  // Assign panel state.
  const [assignAgent, setAssignAgent] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    numCall('list').then((d: any) => {
      setNumbers(d.numbers || []);
      setAgents(d.agents || []);
      setSelected(new Set());
    }).catch((e: any) => setError(String(e?.message || e))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load, active]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 6000); };

  const toggle = (p: string) => setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const allSelected = numbers.length > 0 && selected.size === numbers.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(numbers.map((n) => n.phone_number)));

  const kpis = useMemo(() => {
    const inDialer = numbers.filter((n) => n.in_dialer).length;
    const assigned = numbers.filter((n) => n.outbound_agent_id).length;
    const areas = new Set(numbers.map((n) => n.area_code).filter(Boolean)).size;
    return { total: numbers.length, inDialer, assigned, areas };
  }, [numbers]);

  const areaCodes = useMemo(() => [...new Set((areaInput.match(/\d{3}/g) || []))], [areaInput]);

  const runSuggest = async () => {
    setSuggestBusy(true);
    try { const d = await numCall('suggest_area_codes', { method: 'POST', body: { limit: 12 } }); setSuggests(d.suggestions || []); }
    catch (e: any) { setError(String(e?.message || e)); } finally { setSuggestBusy(false); }
  };
  const addSuggest = (ac: string) => setAreaInput((v) => (v.includes(ac) ? v : (v.trim() ? `${v.trim()}, ${ac}` : ac)));

  const doBuy = async () => {
    if (!areaCodes.length) { setError('Enter at least one 3-digit area code.'); return; }
    const totalCost = areaCodes.length * perArea;
    if (!window.confirm(`Buy ${totalCost} phone number${totalCost === 1 ? '' : 's'} (${areaCodes.join(', ')}) on ${activeName}'s Retell account? This purchases real numbers and bills that account.`)) return;
    setBusy('buy'); setError('');
    try {
      const d = await numCall('buy', { method: 'POST', body: { area_codes: areaCodes.map(Number), per_area: perArea, nickname: buyNick || undefined, outbound_agent_id: buyAgent || undefined, add_to_dialer: addToDialer } });
      flash(`Purchased ${d.purchased_count} number${d.purchased_count === 1 ? '' : 's'}${d.failures?.length ? ` · ${d.failures.length} failed` : ''}${addToDialer ? ' · added to campaign dialer' : ''}.`);
      if (d.failures?.length) setError(d.failures.map((f: any) => `${f.area_code}: ${f.error}`).join(' · '));
      setShowBuy(false); setAreaInput(''); setBuyNick('');
      load();
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); }
  };

  const doRemove = async () => {
    const list = [...selected];
    if (!list.length) return;
    if (!window.confirm(`Permanently release ${list.length} number${list.length === 1 ? '' : 's'} from ${activeName}'s Retell account? This cannot be undone and the numbers may not be re-buyable.`)) return;
    setBusy('remove'); setError('');
    try {
      const d = await numCall('remove', { method: 'POST', body: { numbers: list } });
      flash(`Released ${d.removed_count} number${d.removed_count === 1 ? '' : 's'}${d.failures?.length ? ` · ${d.failures.length} failed` : ''}.`);
      if (d.failures?.length) setError(d.failures.map((f: any) => `${f.phone_number}: ${f.error}`).join(' · '));
      load();
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); }
  };

  const doAssign = async (dialer?: 'add' | 'remove') => {
    const list = [...selected];
    if (!list.length) return;
    setBusy('assign'); setError('');
    try {
      const body: any = { numbers: list, outbound_agent_id: assignAgent || null };
      if (dialer) body.dialer = dialer;
      const d = await numCall('assign', { method: 'POST', body });
      const who = assignAgent ? (agents.find((a) => a.agent_id === assignAgent)?.agent_name || 'agent') : 'no agent (cleared)';
      flash(`Assigned ${d.updated_count} number${d.updated_count === 1 ? '' : 's'} → ${who}${dialer === 'add' ? ' · added to dialer' : dialer === 'remove' ? ' · removed from dialer' : ''}.`);
      if (d.failures?.length) setError(d.failures.map((f: any) => `${f.phone_number}: ${f.error}`).join(' · '));
      load();
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); }
  };

  const doDialer = async (dialer: 'add' | 'remove') => {
    const list = [...selected];
    if (!list.length) return;
    setBusy('dialer'); setError('');
    // Compute the next dialer set locally and replace it wholesale (independent of agent assignment).
    try {
      const current = numbers.filter((n) => n.in_dialer).map((n) => n.phone_number);
      const next = dialer === 'add' ? [...new Set([...current, ...list])] : current.filter((n) => !list.includes(n));
      const d = await numCall('set_dialer', { method: 'POST', body: { numbers: next } });
      flash(`Campaign dialer now uses ${d.dialer_from_numbers?.length ?? next.length} number${(d.dialer_from_numbers?.length ?? next.length) === 1 ? '' : 's'}.`);
      load();
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); }
  };

  return (
    <div>
      <PageHeader title="Phone Numbers" description={`Buy, assign and manage the calling numbers on ${activeName || 'this workspace'}'s dialer — in bulk`} showDate={false}
        actions={<button className="btn-primary" onClick={() => { setShowBuy((v) => !v); if (!suggests) runSuggest(); }}><Plus className="h-4 w-4" /> Buy numbers</button>} />

      {error && <div className="card mb-4 flex items-start gap-2 border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {notice && <div className="card mb-4 flex items-center gap-2 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Numbers on account" value={num(kpis.total)} icon={Phone} accent="blue" />
        <KpiCard label="In campaign dialer" value={num(kpis.inDialer)} sub="rotate on outbound" icon={Radio} accent="green" />
        <KpiCard label="Assigned to an agent" value={num(kpis.assigned)} icon={UserCheck} accent="amber" />
        <KpiCard label="Distinct area codes" value={num(kpis.areas)} icon={Hash} />
      </div>

      {showBuy && (
        <SectionCard title="Buy phone numbers" description="Purchase numbers in bulk by area code. Smart suggestions match the area codes of this workspace's own lead list." className="mb-4">
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand"><Sparkles className="h-3.5 w-3.5" /> Best-match area codes {suggestBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}</div>
              <p className="mb-2 text-xs text-slate-500">These area codes appear most in your leads — buying local numbers lifts pickup rates. Tap to add.</p>
              <div className="flex flex-wrap gap-2">
                {(suggests || []).length === 0 ? <span className="text-sm text-slate-400">{suggestBusy ? 'Scanning your leads…' : 'No lead phone data to analyze yet.'}</span> :
                  suggests!.map((s) => (
                    <button key={s.area_code} onClick={() => addSuggest(s.area_code)} className="inline-flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand-light/30 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light">
                      {s.area_code} <span className="rounded-md bg-white/60 px-1.5 text-xs text-slate-500">{num(s.count)} · {s.pct}%</span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-500">Area codes (comma-separated)
                <input value={areaInput} onChange={(e) => setAreaInput(e.target.value)} placeholder="e.g. 718, 917, 347" className="input mt-1 block !py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Numbers per area code
                <input type="number" min={1} max={20} value={perArea} onChange={(e) => setPerArea(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="input mt-1 block !py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Nickname (optional)
                <input value={buyNick} onChange={(e) => setBuyNick(e.target.value)} placeholder="e.g. Adrian Cold Caller" className="input mt-1 block !py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-500">Assign to agent (optional)
                <select value={buyAgent} onChange={(e) => setBuyAgent(e.target.value)} className="input mt-1 block !py-2.5 text-sm">
                  <option value="">— none —</option>
                  {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={addToDialer} onChange={(e) => setAddToDialer(e.target.checked)} className="h-4 w-4 accent-[#1f6feb]" />
              Add purchased numbers to the campaign dialer rotation
            </label>

            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={busy === 'buy' || !areaCodes.length} onClick={doBuy}>
                {busy === 'buy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Buy {areaCodes.length ? num(areaCodes.length * perArea) : ''} number{areaCodes.length * perArea === 1 ? '' : 's'}
              </button>
              <button className="btn-ghost" onClick={() => setShowBuy(false)}>Cancel</button>
              {areaCodes.length > 0 && <span className="text-xs text-slate-500">{areaCodes.length} area code{areaCodes.length === 1 ? '' : 's'} × {perArea} = {num(areaCodes.length * perArea)} numbers</span>}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-brand/30 bg-brand-light/20 px-4 py-3">
          <span className="text-sm font-bold text-ink">{num(selected.size)} selected</span>
          <div className="ml-2 flex items-center gap-2">
            <select value={assignAgent} onChange={(e) => setAssignAgent(e.target.value)} className="input !py-1.5 text-sm">
              <option value="">Assign to agent…</option>
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
            </select>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" disabled={busy === 'assign'} onClick={() => doAssign()}>
              {busy === 'assign' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Assign
            </button>
          </div>
          <span className="mx-1 h-5 w-px bg-brand/20" />
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-50" disabled={busy === 'dialer'} onClick={() => doDialer('add')}><Radio className="h-3.5 w-3.5 text-emerald-600" /> Add to dialer</button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-surface disabled:opacity-50" disabled={busy === 'dialer'} onClick={() => doDialer('remove')}><Radio className="h-3.5 w-3.5 text-slate-400" /> Remove from dialer</button>
          <span className="mx-1 h-5 w-px bg-brand/20" />
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={busy === 'remove'} onClick={doRemove}>
            {busy === 'remove' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Release
          </button>
          <button className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white" onClick={() => setSelected(new Set())} title="Clear selection"><X className="h-4 w-4" /></button>
        </div>
      )}

      <SectionCard title="Numbers on this workspace" description={loading ? 'Loading…' : `${numbers.length} number${numbers.length === 1 ? '' : 's'} on ${activeName}'s Retell account`}>
        {loading ? <LoadingBlock label="Loading phone numbers…" /> : numbers.length === 0 ? <EmptyState text="No phone numbers on this workspace's dialer account yet. Use “Buy numbers” to purchase some by area code." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[#1f6feb]" /></th>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">Nickname</th>
                  <th className="px-3 py-2">Outbound agent</th>
                  <th className="px-3 py-2">Inbound agent</th>
                  <th className="px-3 py-2">In dialer</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => (
                  <tr key={n.phone_number} className={`border-t border-line hover:bg-surface ${selected.has(n.phone_number) ? 'bg-brand-light/20' : ''}`}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(n.phone_number)} onChange={() => toggle(n.phone_number)} className="h-4 w-4 accent-[#1f6feb]" /></td>
                    <td className="px-3 py-2.5 font-mono text-ink">{fmtPhone(n.phone_number)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{n.area_code}</td>
                    <td className="px-3 py-2.5 text-slate-600">{n.nickname || '—'}</td>
                    <td className="px-3 py-2.5">{n.outbound_agent_name ? <span className="inline-flex items-center gap-1 text-slate-700"><PhoneOutgoing className="h-3.5 w-3.5 text-brand" /> {n.outbound_agent_name}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5">{n.inbound_agent_name ? <span className="inline-flex items-center gap-1 text-slate-700"><PhoneIncoming className="h-3.5 w-3.5 text-slate-400" /> {n.inbound_agent_name}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5">{n.in_dialer ? <span className="pill bg-emerald-100 text-emerald-700">In dialer</span> : <span className="pill bg-slate-100 text-slate-500">—</span>}</td>
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
