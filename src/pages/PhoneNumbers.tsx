import { useEffect, useMemo, useState, useCallback } from 'react';
import { tokenStore, workspaceStore } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { LOGO_MARK } from '../lib/logo';
import { PageHeader, KpiCard, SectionCard, LoadingBlock, EmptyState } from '../components/dash';
import { num } from '../lib/format';
import { areaCodeTz } from '../lib/timezones';
import { Phone, PhoneOutgoing, PhoneIncoming, Plus, Trash2, Loader2, CheckCircle2, X, Radio, Sparkles, ShoppingCart, UserCheck, Hash, AlertTriangle, Info, ArrowRight, Lightbulb } from 'lucide-react';

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

// Live progress for the multi-area-code buy (orchestrated one area code at a time so the user sees
// real progress instead of one long opaque spinner).
type BuyProgress = { done: number; total: number; current: string; purchased: number; phase: string };
// Failed area codes that CAN be filled from a nearby area code — surfaced for the user to approve.
type Replacement = { area_code: string; count: number; nearby: string[] };
// Target of the assign modal: a single number (per-row) or the whole current selection (bulk).
type AssignTarget = { numbers: string[]; label: string };

const KEEP = '';        // "keep current" — the field is omitted from the request
const CLEAR = '__clear__'; // explicitly clear the binding (sends null)

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
  // Opt-in: skip the approval step and auto-substitute the nearest available area code.
  const [allowNearby, setAllowNearby] = useState(false);
  const [suggests, setSuggests] = useState<{ area_code: string; count: number; pct: number }[] | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [buyProgress, setBuyProgress] = useState<BuyProgress | null>(null);
  const [replacements, setReplacements] = useState<Replacement[] | null>(null);

  // Assign modal state (shared by the per-row and bulk paths).
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [outSel, setOutSel] = useState<string>(KEEP);
  const [inSel, setInSel] = useState<string>(KEEP);
  const [assignDialer, setAssignDialer] = useState(true);

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
  const agentName = (id: string | null) => agents.find((a) => a.agent_id === id)?.agent_name || id || '';

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

  // Buy one area code at a time so the progress bar reflects real work. Aggregates purchased + failures.
  const runBuy = async (specs: { area_code: number; per_area: number }[], allowNear: boolean, phaseLabel: string) => {
    const purchased: any[] = []; const failures: any[] = [];
    setBuyProgress({ done: 0, total: specs.length, current: '', purchased: 0, phase: phaseLabel });
    for (let i = 0; i < specs.length; i++) {
      const sp = specs[i];
      setBuyProgress({ done: i, total: specs.length, current: String(sp.area_code), purchased: purchased.length, phase: phaseLabel });
      try {
        const d = await numCall('buy', { method: 'POST', body: { area_codes: [sp.area_code], per_area: sp.per_area, nickname: buyNick || undefined, outbound_agent_id: buyAgent || undefined, add_to_dialer: addToDialer, allow_nearby: allowNear } });
        (d.purchased || []).forEach((p: any) => purchased.push(p));
        (d.failures || []).forEach((f: any) => failures.push(f));
      } catch (e: any) {
        failures.push({ area_code: String(sp.area_code), error: String(e?.message || e), no_availability: false, nearby: [] });
      }
      setBuyProgress({ done: i + 1, total: specs.length, current: String(sp.area_code), purchased: purchased.length, phase: phaseLabel });
    }
    setBuyProgress(null);
    return { purchased, failures };
  };

  const doBuy = async () => {
    if (!areaCodes.length) { setError('Enter at least one 3-digit area code.'); return; }
    const totalCost = areaCodes.length * perArea;
    const confirmMsg = allowNearby
      ? `Buy ${totalCost} number${totalCost === 1 ? '' : 's'} for ${areaCodes.join(', ')} on ${activeName}'s account? If an area code has no numbers available, a number from the nearest available area code is bought instead. This purchases real numbers and bills that account.`
      : `Buy ${totalCost} phone number${totalCost === 1 ? '' : 's'} (${areaCodes.join(', ')}) on ${activeName}'s Retell account? This purchases real numbers and bills that account.`;
    if (!window.confirm(confirmMsg)) return;
    setBusy('buy'); setError(''); setReplacements(null);
    try {
      const specs = areaCodes.map((ac) => ({ area_code: Number(ac), per_area: perArea }));
      const { purchased, failures } = await runBuy(specs, allowNearby, 'Buying your numbers');
      const subs = purchased.filter((p) => p.substituted).length;
      if (purchased.length) flash(`Purchased ${purchased.length} number${purchased.length === 1 ? '' : 's'}${subs ? ` (${subs} from a nearby area code)` : ''}${addToDialer ? ' · added to campaign dialer' : ''}.`);

      // Any area code that came up empty but has nearby inventory → offer replacements to approve
      // (unless the user already opted into auto-substitution).
      const approvable = allowNearby ? [] : failures.filter((f) => f.no_availability && (f.nearby || []).length);
      if (approvable.length) {
        const grouped: Record<string, Replacement> = {};
        for (const f of approvable) {
          if (!grouped[f.area_code]) grouped[f.area_code] = { area_code: f.area_code, count: 0, nearby: f.nearby || [] };
          grouped[f.area_code].count++;
        }
        setReplacements(Object.values(grouped));
        setError('');
      } else if (failures.length) {
        setError(`Couldn't buy ${failures.length} number${failures.length === 1 ? '' : 's'}: ${[...new Set(failures.map((f) => `${f.area_code} (${f.error})`))].join(' · ')}`);
      }
      if (purchased.length && !failures.length) { setShowBuy(false); setAreaInput(''); setBuyNick(''); }
      load();
    } catch (e: any) { setError(String(e?.message || e)); } finally { setBusy(''); }
  };

  // The user approved buying replacements for the area codes that had no inventory.
  const approveReplacements = async () => {
    if (!replacements?.length) return;
    setBusy('buy'); setError('');
    try {
      const specs = replacements.map((r) => ({ area_code: Number(r.area_code), per_area: r.count }));
      const { purchased, failures } = await runBuy(specs, true, 'Buying replacement numbers');
      const subs = purchased.filter((p) => p.substituted).length;
      if (purchased.length) flash(`Bought ${purchased.length} replacement number${purchased.length === 1 ? '' : 's'}${subs ? ` from nearby area codes` : ''}.`);
      if (failures.length) setError(`Still couldn't fill ${failures.length}: ${[...new Set(failures.map((f) => f.area_code))].join(', ')} have no nearby inventory right now.`);
      setReplacements(null);
      if (purchased.length) { setShowBuy(false); setAreaInput(''); setBuyNick(''); }
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

  // Open the assign modal for a single row, pre-seeding the selects with its current bindings.
  const openAssignRow = (n: Num) => {
    setAssignTarget({ numbers: [n.phone_number], label: fmtPhone(n.phone_number) });
    setOutSel(n.outbound_agent_id || KEEP);
    setInSel(n.inbound_agent_id || KEEP);
    setAssignDialer(!n.in_dialer);
  };
  // Open the assign modal for the whole current selection (bulk) — selects start at "keep current".
  const openAssignBulk = () => {
    if (!selected.size) return;
    setAssignTarget({ numbers: [...selected], label: `${selected.size} selected number${selected.size === 1 ? '' : 's'}` });
    setOutSel(KEEP); setInSel(KEEP); setAssignDialer(true);
  };

  const saveAssign = async () => {
    if (!assignTarget) return;
    const changingAgents = outSel !== KEEP || inSel !== KEEP;
    if (!changingAgents && !assignDialer) { setError('Pick an outbound and/or inbound agent to assign.'); return; }
    setBusy('assign'); setError('');
    try {
      const parts: string[] = [];
      let updatedCount = assignTarget.numbers.length;
      let failures: any[] = [];
      if (changingAgents) {
        // Agent change (+ optional dialer add) goes through the assign action (per-number PATCH).
        const body: any = { numbers: assignTarget.numbers };
        if (outSel !== KEEP) { body.outbound_agent_id = outSel === CLEAR ? null : outSel; parts.push(outSel === CLEAR ? 'cleared outbound' : `outbound → ${agentName(outSel)}`); }
        if (inSel !== KEEP) { body.inbound_agent_id = inSel === CLEAR ? null : inSel; parts.push(inSel === CLEAR ? 'cleared inbound' : `inbound → ${agentName(inSel)}`); }
        if (assignDialer) { body.dialer = 'add'; parts.push('added to dialer'); }
        const d = await numCall('assign', { method: 'POST', body });
        updatedCount = d.updated_count ?? updatedCount; failures = d.failures || [];
      } else {
        // Dialer-only change: merge these numbers into the current dialer set (assign needs an agent field).
        const current = numbers.filter((n) => n.in_dialer).map((n) => n.phone_number);
        await numCall('set_dialer', { method: 'POST', body: { numbers: [...new Set([...current, ...assignTarget.numbers])] } });
        parts.push('added to dialer');
      }
      flash(`Updated ${updatedCount} number${updatedCount === 1 ? '' : 's'}${parts.length ? ` · ${parts.join(' · ')}` : ''}.`);
      if (failures.length) setError(failures.map((f: any) => `${f.phone_number}: ${f.error}`).join(' · '));
      setAssignTarget(null);
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

      {/* Replacement-approval panel: failed area codes that can be filled from a nearby one. */}
      {replacements && replacements.length > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-800"><AlertTriangle className="h-4 w-4" /> Some area codes had no numbers available</div>
          <p className="mt-1 text-sm text-amber-700">We couldn't buy {num(replacements.reduce((s, r) => s + r.count, 0))} number{replacements.reduce((s, r) => s + r.count, 0) === 1 ? '' : 's'} in {replacements.map((r) => r.area_code).join(', ')}. We can buy the same amount from the nearest available area code instead — approve and we'll grab them now.</p>
          <div className="mt-3 space-y-2">
            {replacements.map((r) => (
              <div key={r.area_code} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{r.area_code}</span>
                <span className="text-slate-500">× {r.count} needed</span>
                <ArrowRight className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-slate-500">nearest:</span>
                {(r.nearby.slice(0, 5)).map((ac) => <span key={ac} className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{ac}</span>)}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button className="btn-primary" disabled={busy === 'buy'} onClick={approveReplacements}>{busy === 'buy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve &amp; buy {num(replacements.reduce((s, r) => s + r.count, 0))} replacement{replacements.reduce((s, r) => s + r.count, 0) === 1 ? '' : 's'}</button>
            <button className="btn-ghost" disabled={busy === 'buy'} onClick={() => setReplacements(null)}>No thanks</button>
          </div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Numbers on account" value={num(kpis.total)} icon={Phone} accent="blue" />
        <KpiCard label="In campaign dialer" value={num(kpis.inDialer)} sub="rotate on outbound" icon={Radio} accent="green" />
        <KpiCard label="Assigned to an agent" value={num(kpis.assigned)} icon={UserCheck} accent="amber" />
        <KpiCard label="Distinct area codes" value={num(kpis.areas)} icon={Hash} />
      </div>

      {showBuy && (
        <SectionCard title="Buy phone numbers" description="Purchase numbers in bulk by area code. Smart suggestions match the area codes of this workspace's own lead list." className="mb-4">
          <div className="space-y-4">
            {/* Tips */}
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 rounded-xl border border-brand/20 bg-brand-light/20 p-3 text-[11px] text-slate-600">
              <span className="flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Local area codes lift pickup rates — buy where your leads live.</span>
              <span className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-brand" /> If an area code is sold out, we'll offer nearby replacements to approve.</span>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand"><Sparkles className="h-3.5 w-3.5" /> Best-match area codes {suggestBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}</div>
              <p className="mb-2 text-xs text-slate-500">These area codes appear most in your leads. Tap to add. (If a code has no numbers available, we'll suggest nearby ones here.)</p>
              <div className="flex flex-wrap gap-2">
                {(suggests || []).length === 0 ? <span className="text-sm text-slate-400">{suggestBusy ? 'Scanning your leads…' : 'No lead phone data to analyze yet.'}</span> :
                  suggests!.map((s) => (
                    <button key={s.area_code} onClick={() => addSuggest(s.area_code)} className="inline-flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand-light/30 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light">
                      {s.area_code}{s.count > 0 && <span className="rounded-md bg-white/60 px-1.5 text-xs text-slate-500">{num(s.count)} · {s.pct}%</span>}
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
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={allowNearby} onChange={(e) => setAllowNearby(e.target.checked)} className="h-4 w-4 accent-[#1f6feb]" />
              Auto-buy from the nearest available area code without asking me first
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
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50" disabled={busy === 'assign'} onClick={openAssignBulk}>
            <UserCheck className="h-3.5 w-3.5" /> Assign to agents…
          </button>
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
                  <th className="px-3 py-2">Time zone</th>
                  <th className="px-3 py-2">Nickname</th>
                  <th className="px-3 py-2">Outbound agent</th>
                  <th className="px-3 py-2">Inbound agent</th>
                  <th className="px-3 py-2">In dialer</th>
                  <th className="px-3 py-2 text-right">Assign</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => (
                  <tr key={n.phone_number} className={`border-t border-line hover:bg-surface ${selected.has(n.phone_number) ? 'bg-brand-light/20' : ''}`}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(n.phone_number)} onChange={() => toggle(n.phone_number)} className="h-4 w-4 accent-[#1f6feb]" /></td>
                    <td className="px-3 py-2.5 font-mono text-ink">{fmtPhone(n.phone_number)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{n.area_code}</td>
                    <td className="px-3 py-2.5">{(() => { const tz = areaCodeTz(n.area_code || n.phone_number); return tz ? <span title={`${tz.label} Time · ${tz.iana}`} className="pill bg-slate-100 text-slate-600">{tz.abbr}</span> : <span className="text-slate-400">—</span>; })()}</td>
                    <td className="px-3 py-2.5 text-slate-600">{n.nickname || '—'}</td>
                    <td className="px-3 py-2.5">{n.outbound_agent_name ? <span className="inline-flex items-center gap-1 text-slate-700"><PhoneOutgoing className="h-3.5 w-3.5 text-brand" /> {n.outbound_agent_name}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">available</span>}</td>
                    <td className="px-3 py-2.5">{n.inbound_agent_name ? <span className="inline-flex items-center gap-1 text-slate-700"><PhoneIncoming className="h-3.5 w-3.5 text-slate-400" /> {n.inbound_agent_name}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5">{n.in_dialer ? <span className="pill bg-emerald-100 text-emerald-700">In dialer</span> : <span className="pill bg-slate-100 text-slate-500">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => openAssignRow(n)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand/40 hover:text-brand"><UserCheck className="h-3.5 w-3.5" /> Assign</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Branded buy-progress overlay */}
      {buyProgress && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md rounded-3xl p-9 text-center shadow-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-brand-light/50 p-3 ring-1 ring-brand/20">
              <img src={LOGO_MARK} alt="1PropertyMarket" className="h-full w-full animate-pulse object-contain" />
            </div>
            <h3 className="text-xl font-extrabold tracking-tight text-ink">{buyProgress.phase}</h3>
            <p className="mt-1 text-sm text-slate-500">Purchasing real numbers on {activeName}'s account — this can take a few seconds each.</p>
            <div className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-brand transition-all duration-500 ease-out" style={{ width: `${Math.round((buyProgress.done / Math.max(1, buyProgress.total)) * 100)}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{buyProgress.current ? <>Area code <span className="font-mono text-ink">{buyProgress.current}</span></> : 'Starting…'}</span>
              <span>{buyProgress.done} / {buyProgress.total} area codes</span>
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {num(buyProgress.purchased)} number{buyProgress.purchased === 1 ? '' : 's'} secured so far</div>
            <p className="mt-5 text-xs text-slate-400">Please keep this window open until it finishes.</p>
          </div>
        </div>
      )}

      {/* Assign modal (per-row or bulk) — outbound and/or inbound, each independently */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={() => busy !== 'assign' && setAssignTarget(null)}>
          <div className="card w-full max-w-lg rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-bold text-ink"><UserCheck className="h-5 w-5 text-brand" /> Assign to agents</div>
              <button onClick={() => setAssignTarget(null)} className="rounded p-1 text-slate-400 hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500">Setting agents for <span className="font-semibold text-ink">{assignTarget.label}</span>.</p>

            {/* Tips */}
            <div className="mb-4 space-y-1.5 rounded-xl border border-brand/20 bg-brand-light/20 p-3 text-[11px] text-slate-600">
              <div className="flex items-start gap-1.5"><PhoneOutgoing className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> <span><span className="font-semibold text-ink">Outbound</span> = the agent that places calls from this number (used by campaigns).</span></div>
              <div className="flex items-start gap-1.5"><PhoneIncoming className="mt-0.5 h-3 w-3 shrink-0 text-sky-600" /> <span><span className="font-semibold text-ink">Inbound</span> = the agent that answers when someone calls it back. Set either or both.</span></div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-ink"><PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600" /> Outbound agent</label>
                <select value={outSel} onChange={(e) => setOutSel(e.target.value)} className="input w-full !py-2.5 text-sm">
                  <option value={KEEP}>Keep current outbound agent</option>
                  <option value={CLEAR}>Clear — no outbound agent</option>
                  {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-ink"><PhoneIncoming className="h-3.5 w-3.5 text-sky-600" /> Inbound agent</label>
                <select value={inSel} onChange={(e) => setInSel(e.target.value)} className="input w-full !py-2.5 text-sm">
                  <option value={KEEP}>Keep current inbound agent</option>
                  <option value={CLEAR}>Clear — no inbound agent</option>
                  {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={assignDialer} onChange={(e) => setAssignDialer(e.target.checked)} className="h-4 w-4 accent-[#1f6feb]" />
                Also add {assignTarget.numbers.length === 1 ? 'this number' : 'these numbers'} to the campaign dialer rotation
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setAssignTarget(null)} className="btn-ghost">Cancel</button>
              <button onClick={saveAssign} disabled={busy === 'assign'} className="btn-primary">{busy === 'assign' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save assignment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
