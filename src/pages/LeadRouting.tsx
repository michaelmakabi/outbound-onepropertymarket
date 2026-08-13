import { useEffect, useMemo, useState } from 'react';
import { opm, fmt } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { useAuth } from '../lib/auth';
import { PageHead, Spinner, EmptyState } from '../components/ui';
import {
  Plus, Trash2, GripVertical, Pencil, X, Check, ShieldAlert, Play, Wand2, Users,
  Waypoints, Clock, Target, ChevronDown, AlertCircle, Zap, Hand,
} from 'lucide-react';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ vocabulary */

// Fields with live data today vs sparse/empty (surfaced as a subtle hint — never disabled).
const FIELDS: { value: string; label: string; hasData: boolean }[] = [
  { value: 'state', label: 'State', hasData: true },
  { value: 'city', label: 'City', hasData: true },
  { value: 'zip', label: 'ZIP', hasData: true },
  { value: 'price', label: 'Price', hasData: true },
  { value: 'lead_source', label: 'Lead source', hasData: true },
  { value: 'tag', label: 'Tag', hasData: true },
  { value: 'disposition', label: 'Disposition', hasData: true },
  { value: 'stage', label: 'Stage', hasData: true },
  { value: 'property_type', label: 'Property type', hasData: false },
  { value: 'campaign', label: 'Campaign', hasData: false },
  { value: 'language', label: 'Language', hasData: false },
  { value: 'custom', label: 'Custom field…', hasData: true },
];

const OPS: { value: string; label: string; symbol: string }[] = [
  { value: 'equals', label: 'equals', symbol: 'is' },
  { value: 'not_equals', label: 'not equals', symbol: 'is not' },
  { value: 'in', label: 'is any of', symbol: 'in' },
  { value: 'contains', label: 'contains', symbol: 'contains' },
  { value: 'gt', label: 'greater than', symbol: '>' },
  { value: 'lt', label: 'less than', symbol: '<' },
  { value: 'between', label: 'between', symbol: 'between' },
  { value: 'exists', label: 'exists', symbol: 'exists' },
];
const OP_SYMBOL: Record<string, string> = Object.fromEntries(OPS.map((o) => [o.value, o.symbol]));

const METHODS: { value: string; label: string; desc: string; kind: 'single' | 'weighted' | 'pool' }[] = [
  { value: 'round_robin', label: 'Round robin', desc: 'Evenly cycle a pool of reps', kind: 'pool' },
  { value: 'weighted', label: 'Weighted', desc: 'Distribute by per-rep weight', kind: 'weighted' },
  { value: 'load_balanced', label: 'Load balanced', desc: 'Send to the least-loaded rep', kind: 'pool' },
  { value: 'claim', label: 'Claim (first come)', desc: 'Offer to a pool; first to claim wins', kind: 'pool' },
  { value: 'direct', label: 'Direct', desc: 'Always assign one rep', kind: 'single' },
];
const METHOD_META = (m: string) => METHODS.find((x) => x.value === m) || METHODS[0];

// Auto today: new_lead + manual. The rest are wired but manual-only for now.
const RUN_ON: { value: string; label: string; auto: boolean }[] = [
  { value: 'new_lead', label: 'New lead', auto: true },
  { value: 'manual', label: 'Manual run', auto: true },
  { value: 'import', label: 'Import', auto: false },
  { value: 'inbound', label: 'Inbound', auto: false },
  { value: 'disposition_change', label: 'Disposition change', auto: false },
];

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

/* ------------------------------------------------------------------ types */

type Cond = { field: string; op: string; value?: any };
type Target = { user_id: number; name?: string; weight?: number };
type Rule = {
  id?: string | number; name: string; active: boolean; method: string;
  sort_order?: number; run_on: string[]; daily_cap?: number | null;
  respect_hours?: boolean; hours?: any; fallback_user_id?: number | null; fallback_name?: string | null;
  targets: Target[]; match: { logic: 'AND' | 'OR'; conditions: Cond[] }; created_at?: string;
};
type Member = { user_id: number; name: string; email?: string; role?: string; workspace_role?: string; lead_scope?: string; disabled?: boolean };
type Stat = { user_id: number; name: string; open_primary: number; assigned_today: number };
type PlanRow = {
  lead_id: string; lead_name?: string; matched_rule?: string | null; rule_id?: string | number | null;
  method?: string | null; assignee_user_id?: number | null; assignee_name?: string | null; reason?: string | null; pool?: any;
};

const DAYS = [['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]] as const;
const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

function newRule(): Rule {
  return {
    name: '', active: true, method: 'round_robin', run_on: ['new_lead'],
    daily_cap: null, respect_hours: false,
    hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', tz: LOCAL_TZ },
    fallback_user_id: null, targets: [], match: { logic: 'AND', conditions: [] },
  };
}

/* ------------------------------------------------------------------ condition summary */

function fieldLabel(f: string): string {
  if (f?.startsWith('custom.')) return f.slice(7);
  return FIELDS.find((x) => x.value === f)?.label || fmt.title(f || '');
}
function valueLabel(c: Cond): string {
  if (c.op === 'exists') return '';
  const v = c.value;
  const asMoney = (x: any) => (isFinite(Number(x)) ? fmt.money(Number(x)) : String(x));
  if (Array.isArray(v)) return (c.field === 'price' ? v.map(asMoney) : v).join(c.op === 'between' ? ' – ' : ', ');
  if (c.field === 'price') return asMoney(v);
  return String(v ?? '');
}
function summarize(rule: Rule): string {
  const cs = rule.match?.conditions || [];
  if (cs.length === 0) return 'Matches all leads';
  const join = rule.match.logic === 'OR' ? ' OR ' : ' · ';
  return cs.map((c) => `${fieldLabel(c.field)} ${OP_SYMBOL[c.op] || c.op} ${valueLabel(c)}`.trim()).join(join);
}

/* ================================================================== page */

export default function LeadRouting() {
  const { active, activeName, isStaff, ownsActive, roles, loading: wsLoading } = useWorkspace();
  const { isAdmin } = useAuth();
  const canManage = isAdmin || isStaff || ownsActive || (active ? ['owner', 'admin', 'manager'].includes(roles[active] || '') : false);

  const [rules, setRules] = useState<Rule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);

  // drag-reorder state (rule cards)
  const [dragId, setDragId] = useState<string | number | null>(null);
  const [dragOver, setDragOver] = useState<string | number | null>(null);

  function load() {
    if (!canManage) { setLoading(false); return; }
    setLoading(true); setErr(null); setForbidden(false);
    Promise.all([
      opm.routingRulesList().catch((e: any) => { if (/403|manager|owner|admin|forbidden/i.test(e?.message || '')) setForbidden(true); throw e; }),
      opm.workspaceMembers().catch(() => ({ members: [] })),
      opm.routingStats().catch(() => ({ stats: [] })),
    ])
      .then(([r, m, s]: any[]) => {
        setRules((r.rules || []).slice().sort((a: Rule, b: Rule) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
        setMembers(m.members || []);
        setStats(s.stats || []);
      })
      .catch((e: any) => { if (!forbidden) setErr(e?.message || 'Could not load routing rules.'); })
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [active, canManage]);

  const memberName = (id?: number | null) => (id == null ? '' : members.find((m) => m.user_id === id)?.name || `#${id}`);

  async function toggleActive(rule: Rule) {
    const next = { ...rule, active: !rule.active };
    setRules((rs) => rs.map((r) => (r.id === rule.id ? next : r))); // optimistic
    try { await opm.routingRuleSave(toPayload(next), active || undefined); }
    catch (e: any) { setRules((rs) => rs.map((r) => (r.id === rule.id ? rule : r))); window.alert(e?.message || 'Could not update the rule.'); }
  }
  async function delRule(rule: Rule) {
    if (!confirm(`Delete rule “${rule.name || 'Untitled'}”?`)) return;
    const prev = rules;
    setRules((rs) => rs.filter((r) => r.id !== rule.id));
    try { if (rule.id != null) await opm.routingRuleDelete(rule.id); }
    catch (e: any) { setRules(prev); window.alert(e?.message || 'Could not delete the rule.'); }
  }
  async function reorder(dragKey: string | number, dropKey: string | number) {
    if (dragKey === dropKey) return;
    const from = rules.findIndex((r) => r.id === dragKey);
    const to = rules.findIndex((r) => r.id === dropKey);
    if (from < 0 || to < 0) return;
    const next = [...rules];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRules(next); // optimistic
    try { await opm.routingRulesReorder(next.map((r) => r.id!).filter((x) => x != null), active || undefined); }
    catch { load(); }
  }
  async function onSaved(saved: Rule) {
    setEditing(null);
    // Merge the server's canonical rule back in (names/ids resolved) then refresh stats.
    setRules((rs) => {
      const exists = rs.some((r) => r.id === saved.id);
      return exists ? rs.map((r) => (r.id === saved.id ? saved : r)) : [...rs, saved];
    });
    opm.routingStats().then((s: any) => setStats(s.stats || [])).catch(() => {});
  }

  if (wsLoading || loading) return <div><PageHead title="Lead Routing" subtitle={activeName} /><Spinner /></div>;

  if (!canManage || forbidden) {
    return (
      <div>
        <PageHead title="Lead Routing" subtitle={activeName} />
        <div className="card mx-auto mt-6 max-w-lg p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><ShieldAlert className="h-6 w-6 text-amber-600" /></div>
          <h2 className="text-lg font-bold text-ink">Managers only</h2>
          <p className="mt-1 text-sm text-slate-500">Lead routing is available to workspace owners, admins and managers. Ask an admin for access if you need to manage how new leads are assigned.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        title="Lead Routing"
        subtitle={`Automatically assign new leads to the right rep${activeName ? ` · ${activeName}` : ''}`}
        right={<button onClick={() => setEditing(newRule())} className="btn-primary"><Plus className="h-4 w-4" /> New rule</button>}
      />

      {err && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" /> {err}</div>}

      {/* Stats strip — per-rep load balance */}
      <StatsStrip stats={stats} />

      {/* Rules list */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Waypoints className="h-3.5 w-3.5" /> Rules <span className="font-normal normal-case text-slate-400">· evaluated top-to-bottom; first match wins · drag to reorder</span>
        </div>
        {rules.length === 0 ? (
          <EmptyState text="No routing rules yet. Create one to start auto-assigning leads." />
        ) : (
          <div className="space-y-2">
            {rules.map((rule, i) => (
              <RuleCard
                key={rule.id ?? i} rule={rule} index={i} memberName={memberName}
                dragId={dragId} dragOver={dragOver}
                setDragId={setDragId} setDragOver={setDragOver} onReorder={reorder}
                onToggle={() => toggleActive(rule)} onEdit={() => setEditing(rule)} onDelete={() => delRule(rule)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Simulator */}
      <Simulator rules={rules} />

      {editing && (
        <RuleBuilder
          initial={editing} members={members} workspace={active || undefined}
          onClose={() => setEditing(null)} onSaved={onSaved}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ payload shaping */

function toPayload(r: Rule): any {
  const conditions = (r.match?.conditions || [])
    .filter((c) => c.field && c.op)
    .map((c) => (c.op === 'exists' ? { field: c.field, op: c.op } : { field: c.field, op: c.op, value: c.value }));
  const kind = METHOD_META(r.method).kind;
  const targets = (r.targets || []).map((t) => (kind === 'weighted' ? { user_id: t.user_id, weight: Number(t.weight) || 1 } : { user_id: t.user_id }));
  return {
    id: r.id, name: r.name?.trim(), active: r.active, method: r.method,
    sort_order: r.sort_order, run_on: r.run_on,
    daily_cap: r.daily_cap === null || r.daily_cap === undefined || (r.daily_cap as any) === '' ? null : Number(r.daily_cap),
    respect_hours: !!r.respect_hours,
    hours: r.respect_hours ? r.hours : undefined,
    fallback_user_id: r.fallback_user_id || null,
    targets,
    match: { logic: r.match?.logic || 'AND', conditions },
  };
}

/* ------------------------------------------------------------------ stats strip */

function StatsStrip({ stats }: { stats: Stat[] }) {
  if (!stats || stats.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Users className="h-3.5 w-3.5" /> Rep load</div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {stats.map((s) => (
          <div key={s.user_id} className="card min-w-[160px] flex-none p-3">
            <div className="truncate text-sm font-bold text-ink" title={s.name}>{s.name}</div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div><div className="text-xl font-extrabold tabular-nums text-brand">{fmt.int(s.open_primary)}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Open</div></div>
              <div className="text-right"><div className="text-xl font-extrabold tabular-nums text-emerald-600">{fmt.int(s.assigned_today)}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Today</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rule card */

function RuleCard({
  rule, index, memberName, dragId, dragOver, setDragId, setDragOver, onReorder, onToggle, onEdit, onDelete,
}: {
  rule: Rule; index: number; memberName: (id?: number | null) => string;
  dragId: string | number | null; dragOver: string | number | null;
  setDragId: (v: string | number | null) => void; setDragOver: (v: string | number | null) => void;
  onReorder: (a: string | number, b: string | number) => void;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const meta = METHOD_META(rule.method);
  const key = rule.id ?? index;
  const targets = rule.targets || [];
  return (
    <div
      draggable
      onDragStart={(e) => { setDragId(key); e.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => { setDragId(null); setDragOver(null); }}
      onDragOver={(e) => { if (dragId != null && dragId !== key) { e.preventDefault(); setDragOver(key); } }}
      onDragLeave={() => setDragOver(dragOver === key ? null : dragOver)}
      onDrop={(e) => { e.preventDefault(); if (dragId != null) onReorder(dragId, key); setDragOver(null); setDragId(null); }}
      className={cx('card flex items-start gap-3 p-3 transition',
        dragId === key && 'opacity-40', dragOver === key && 'ring-2 ring-brand/40', !rule.active && 'bg-surface')}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <GripVertical className="h-4 w-4 cursor-grab text-slate-300" />
        <span className="rounded bg-surface px-1.5 text-[10px] font-bold text-slate-400">{index + 1}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-ink">{rule.name || <span className="text-slate-400">Untitled rule</span>}</span>
          <span className="pill bg-brand-light text-brand">{meta.label}</span>
          {(rule.daily_cap ?? null) != null && <span className="pill bg-surface text-slate-500"><Target className="mr-1 h-3 w-3" /> cap {rule.daily_cap}/day</span>}
          {rule.respect_hours && <span className="pill bg-surface text-slate-500"><Clock className="mr-1 h-3 w-3" /> hours</span>}
        </div>

        <div className="mt-1 text-xs text-slate-500">{summarize(rule)}</div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {targets.length === 0 && <span className="text-xs text-slate-400">No targets</span>}
          {targets.map((t) => (
            <span key={t.user_id} className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-slate-600">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/10 text-[9px] font-bold text-brand">{initials(t.name || memberName(t.user_id))}</span>
              {t.name || memberName(t.user_id)}
              {meta.kind === 'weighted' && <span className="text-[10px] font-semibold text-slate-400">×{t.weight ?? 1}</span>}
            </span>
          ))}
          {(rule.fallback_user_id ?? null) != null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-slate-500">
              fallback: {rule.fallback_name || memberName(rule.fallback_user_id)}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {(rule.run_on || []).map((r) => {
            const meta2 = RUN_ON.find((x) => x.value === r);
            return <span key={r} className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {meta2?.auto ? <Zap className="h-2.5 w-2.5 text-emerald-500" /> : <Hand className="h-2.5 w-2.5 text-slate-400" />}{meta2?.label || r}</span>;
          })}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <button onClick={onToggle} title={rule.active ? 'Active — click to pause' : 'Paused — click to activate'}
          className={cx('relative h-5 w-9 rounded-full transition', rule.active ? 'bg-brand' : 'bg-slate-300')}>
          <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', rule.active ? 'left-[18px]' : 'left-0.5')} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-surface hover:text-brand" title="Edit"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-surface hover:text-red-500" title="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function initials(name?: string): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

/* ------------------------------------------------------------------ rule builder modal */

function RuleBuilder({
  initial, members, workspace, onClose, onSaved,
}: { initial: Rule; members: Member[]; workspace?: string; onClose: () => void; onSaved: (r: Rule) => void }) {
  const [rule, setRule] = useState<Rule>(() => JSON.parse(JSON.stringify(initial)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = METHOD_META(rule.method);
  const activeMembers = useMemo(() => members.filter((m) => !m.disabled), [members]);

  const set = (patch: Partial<Rule>) => setRule((r) => ({ ...r, ...patch }));
  const setMatch = (patch: Partial<Rule['match']>) => setRule((r) => ({ ...r, match: { ...r.match, ...patch } }));

  function addCondition() { setMatch({ conditions: [...rule.match.conditions, { field: 'state', op: 'equals', value: '' }] }); }
  function updateCondition(i: number, c: Cond) { setMatch({ conditions: rule.match.conditions.map((x, idx) => (idx === i ? c : x)) }); }
  function removeCondition(i: number) { setMatch({ conditions: rule.match.conditions.filter((_, idx) => idx !== i) }); }

  function toggleTarget(m: Member) {
    const on = rule.targets.some((t) => t.user_id === m.user_id);
    if (meta.kind === 'single') { set({ targets: on ? [] : [{ user_id: m.user_id, name: m.name }] }); return; }
    set({ targets: on ? rule.targets.filter((t) => t.user_id !== m.user_id) : [...rule.targets, { user_id: m.user_id, name: m.name, weight: 1 }] });
  }
  function setWeight(id: number, w: string) { set({ targets: rule.targets.map((t) => (t.user_id === id ? { ...t, weight: Number(w) || 0 } : t)) }); }
  function toggleRunOn(v: string) { set({ run_on: rule.run_on.includes(v) ? rule.run_on.filter((x) => x !== v) : [...rule.run_on, v] }); }
  function toggleDay(d: number) {
    const days: number[] = rule.hours?.days || [];
    set({ hours: { ...rule.hours, days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() } });
  }

  async function save() {
    if (!rule.name.trim()) { setError('Give the rule a name.'); return; }
    if (rule.targets.length === 0 && (rule.fallback_user_id ?? null) == null) { setError('Pick at least one target (or a fallback assignee).'); return; }
    setSaving(true); setError(null);
    try {
      const { rule: saved } = await opm.routingRuleSave(toPayload(rule), workspace);
      onSaved(saved || { ...rule });
    } catch (e: any) {
      setError(/403|forbidden/i.test(e?.message || '') ? 'You do not have permission to save routing rules.' : (e?.message || 'Could not save the rule.'));
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 py-8" onClick={onClose}>
      <div className="card w-full max-w-2xl p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-bold text-ink">{rule.id != null ? 'Edit rule' : 'New routing rule'}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-surface hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {/* Name + active */}
          <div className="flex items-end gap-3">
            <label className="flex-1">
              <span className="label">Rule name</span>
              <input autoFocus value={rule.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. High-value NY leads → senior team" className="input mt-1" />
            </label>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-semibold text-slate-600">
              <button type="button" onClick={() => set({ active: !rule.active })}
                className={cx('relative h-5 w-9 rounded-full transition', rule.active ? 'bg-brand' : 'bg-slate-300')}>
                <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', rule.active ? 'left-[18px]' : 'left-0.5')} />
              </button>
              Active
            </label>
          </div>

          {/* Conditions */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Conditions</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
                {(['AND', 'OR'] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setMatch({ logic: l })}
                    className={cx('px-3 py-1 font-semibold', rule.match.logic === l ? 'bg-brand text-white' : 'bg-white text-slate-600')}>{l}</button>
                ))}
              </div>
            </div>
            {rule.match.conditions.length === 0 && (
              <div className="mb-2 rounded-lg border border-dashed border-line bg-surface px-3 py-2 text-xs text-slate-500">No conditions — this rule <b>matches all leads</b>.</div>
            )}
            <div className="space-y-2">
              {rule.match.conditions.map((c, i) => (
                <ConditionRow key={i} c={c} onChange={(nc) => updateCondition(i, nc)} onRemove={() => removeCondition(i)} />
              ))}
            </div>
            <button type="button" onClick={addCondition} className="btn-ghost mt-2 !py-1.5 text-sm"><Plus className="h-4 w-4" /> Add condition</button>
          </section>

          {/* Method + targets */}
          <section>
            <span className="label">Assignment method</span>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {METHODS.map((m) => (
                <button key={m.value} type="button" onClick={() => set({ method: m.value, targets: m.kind === 'single' ? rule.targets.slice(0, 1) : rule.targets })}
                  className={cx('rounded-lg border p-2 text-left transition', rule.method === m.value ? 'border-brand bg-brand-light' : 'border-line hover:border-brand/40')}>
                  <div className="text-sm font-bold text-ink">{m.label}</div>
                  <div className="text-[11px] text-slate-500">{m.desc}</div>
                </button>
              ))}
            </div>

            <div className="mt-3">
              <span className="label">{meta.kind === 'single' ? 'Assign to' : 'Target pool'}</span>
              {activeMembers.length === 0 && <div className="mt-1 text-xs text-slate-400">No assignable members in this workspace.</div>}
              <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
                {activeMembers.map((m) => {
                  const t = rule.targets.find((x) => x.user_id === m.user_id);
                  const on = !!t;
                  return (
                    <div key={m.user_id} className={cx('flex items-center gap-2 rounded-md px-2 py-1.5', on && 'bg-brand-light')}>
                      <button type="button" onClick={() => toggleTarget(m)} className="flex flex-1 items-center gap-2 text-left">
                        <span className={cx('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-slate-300', meta.kind === 'single' && 'rounded-full')}>{on && <Check className="h-3 w-3" />}</span>
                        <span className="text-sm text-ink">{m.name}</span>
                        {m.workspace_role && <span className="text-[10px] uppercase text-slate-400">{m.workspace_role}</span>}
                      </button>
                      {on && meta.kind === 'weighted' && (
                        <label className="flex items-center gap-1 text-xs text-slate-500">weight
                          <input type="number" min={0} value={t?.weight ?? 1} onChange={(e) => setWeight(m.user_id, e.target.value)} className="input h-7 w-16 !px-2 !py-1 text-xs" /></label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Guardrails */}
          <section className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Daily cap per rep</span>
              <input type="number" min={0} value={rule.daily_cap ?? ''} onChange={(e) => set({ daily_cap: e.target.value === '' ? null : Number(e.target.value) })} placeholder="No cap" className="input mt-1" />
            </label>
            <label>
              <span className="label">Fallback assignee</span>
              <select value={rule.fallback_user_id ?? ''} onChange={(e) => set({ fallback_user_id: e.target.value === '' ? null : Number(e.target.value) })} className="input mt-1">
                <option value="">None</option>
                {activeMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
                <button type="button" onClick={() => set({ respect_hours: !rule.respect_hours })}
                  className={cx('relative h-5 w-9 rounded-full transition', rule.respect_hours ? 'bg-brand' : 'bg-slate-300')}>
                  <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', rule.respect_hours ? 'left-[18px]' : 'left-0.5')} />
                </button>
                Respect business hours
              </label>
              {rule.respect_hours && (
                <div className="mt-2 rounded-lg border border-line p-3">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {DAYS.map(([label, d]) => {
                      const on = (rule.hours?.days || []).includes(d);
                      return <button key={d} type="button" onClick={() => toggleDay(d)}
                        className={cx('rounded-md px-2 py-1 text-xs font-semibold', on ? 'bg-brand text-white' : 'bg-surface text-slate-500')}>{label}</button>;
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-1 text-slate-500">From <input type="time" value={rule.hours?.start || '09:00'} onChange={(e) => set({ hours: { ...rule.hours, start: e.target.value } })} className="input h-8 w-auto !py-1" /></label>
                    <label className="flex items-center gap-1 text-slate-500">To <input type="time" value={rule.hours?.end || '17:00'} onChange={(e) => set({ hours: { ...rule.hours, end: e.target.value } })} className="input h-8 w-auto !py-1" /></label>
                    <label className="flex items-center gap-1 text-slate-500">TZ <input value={rule.hours?.tz || LOCAL_TZ} onChange={(e) => set({ hours: { ...rule.hours, tz: e.target.value } })} className="input h-8 w-44 !py-1 text-xs" /></label>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Run on */}
          <section>
            <span className="label">Run on</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {RUN_ON.map((r) => {
                const on = rule.run_on.includes(r.value);
                return (
                  <button key={r.value} type="button" onClick={() => toggleRunOn(r.value)}
                    className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold', on ? 'border-brand bg-brand-light text-brand' : 'border-line bg-white text-slate-500')}>
                    {r.auto ? <Zap className="h-3 w-3 text-emerald-500" /> : <Hand className="h-3 w-3 text-slate-400" />}
                    {r.label}
                    {!r.auto && <span className="text-[9px] font-normal text-slate-400">manual for now</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400"><Zap className="mr-0.5 inline h-3 w-3 text-emerald-500" /> auto triggers today · <Hand className="mx-0.5 inline h-3 w-3 text-slate-400" /> wired but manual-only for now.</p>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <div className="text-sm text-red-600">{error}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save rule'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ condition row */

function ConditionRow({ c, onChange, onRemove }: { c: Cond; onChange: (c: Cond) => void; onRemove: () => void }) {
  const isCustom = c.field?.startsWith('custom.');
  const baseField = isCustom ? 'custom' : c.field;
  const isPrice = c.field === 'price';
  const isState = c.field === 'state';
  const fieldMeta = FIELDS.find((f) => f.value === baseField);

  const onFieldChange = (v: string) => {
    if (v === 'custom') onChange({ ...c, field: 'custom.', value: '' });
    else onChange({ ...c, field: v, value: c.op === 'between' ? ['', ''] : c.op === 'in' ? [] : '' });
  };
  const onOpChange = (op: string) => {
    let value: any = c.value;
    if (op === 'between') value = Array.isArray(c.value) ? c.value : ['', ''];
    else if (op === 'in') value = Array.isArray(c.value) ? c.value : (c.value ? [c.value] : []);
    else if (op === 'exists') value = undefined;
    else value = Array.isArray(c.value) ? (c.value[0] ?? '') : (c.value ?? '');
    onChange({ ...c, op, value });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/50 p-2">
      <select value={baseField} onChange={(e) => onFieldChange(e.target.value)} className="input h-9 w-auto min-w-[130px] !py-1">
        {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}{!f.hasData ? ' (no data yet)' : ''}</option>)}
      </select>

      {isCustom && (
        <input value={c.field.slice(7)} onChange={(e) => onChange({ ...c, field: `custom.${e.target.value}` })} placeholder="key" className="input h-9 w-28 !py-1" />
      )}

      <select value={c.op} onChange={(e) => onOpChange(e.target.value)} className="input h-9 w-auto min-w-[120px] !py-1">
        {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* value editor */}
      {c.op === 'exists' ? (
        <span className="px-1 text-xs italic text-slate-400">has any value</span>
      ) : c.op === 'between' ? (
        <div className="flex items-center gap-1">
          <input type={isPrice ? 'number' : 'text'} value={(Array.isArray(c.value) ? c.value[0] : '') ?? ''} onChange={(e) => onChange({ ...c, value: [e.target.value, Array.isArray(c.value) ? c.value[1] : ''] })} placeholder="min" className="input h-9 w-24 !py-1" />
          <span className="text-slate-400">–</span>
          <input type={isPrice ? 'number' : 'text'} value={(Array.isArray(c.value) ? c.value[1] : '') ?? ''} onChange={(e) => onChange({ ...c, value: [Array.isArray(c.value) ? c.value[0] : '', e.target.value] })} placeholder="max" className="input h-9 w-24 !py-1" />
        </div>
      ) : c.op === 'in' ? (
        isState ? (
          <StateMulti value={Array.isArray(c.value) ? c.value : []} onChange={(v) => onChange({ ...c, value: v })} />
        ) : (
          <input value={Array.isArray(c.value) ? c.value.join(', ') : (c.value ?? '')} onChange={(e) => onChange({ ...c, value: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="comma, separated, values" className="input h-9 min-w-[180px] flex-1 !py-1" />
        )
      ) : isState ? (
        <select value={c.value ?? ''} onChange={(e) => onChange({ ...c, value: e.target.value })} className="input h-9 w-auto min-w-[100px] !py-1">
          <option value="">state…</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input type={isPrice ? 'number' : 'text'} value={c.value ?? ''} onChange={(e) => onChange({ ...c, value: e.target.value })}
          placeholder={isPrice ? 'amount' : 'value'} className="input h-9 min-w-[140px] flex-1 !py-1" />
      )}

      {fieldMeta && !fieldMeta.hasData && <span className="text-[10px] text-amber-500">no data yet</span>}
      <button type="button" onClick={onRemove} className="ml-auto rounded p-1 text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
    </div>
  );
}

function StateMulti({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="input flex h-9 min-w-[160px] items-center justify-between !py-1">
        <span className={cx('truncate', value.length === 0 && 'text-slate-400')}>{value.length ? value.join(', ') : 'states…'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 grid max-h-56 w-64 grid-cols-5 gap-1 overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-xl">
            {US_STATES.map((s) => (
              <button key={s} type="button" onClick={() => toggle(s)}
                className={cx('rounded px-1 py-1 text-xs font-semibold', value.includes(s) ? 'bg-brand text-white' : 'bg-surface text-slate-600 hover:bg-line')}>{s}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ simulator */

function Simulator({ rules }: { rules: Rule[] }) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState('');
  const [limit, setLimit] = useState(200);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [resolving, setResolving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRules = rules.filter((r) => r.active).length;

  async function simulate() {
    setResolving(true); setError(null); setPlan(null); setApplied(null);
    try {
      const sel = await opm.resolveSelection({ search: search || undefined, tags: tags.trim() ? tags.split(',').map((s) => s.trim()).filter(Boolean).join(',') : undefined });
      const ids = (sel.lead_ids || []).slice(0, limit);
      setLeadIds(ids);
      if (ids.length === 0) { setPlan([]); return; }
      const res = await opm.runRules({ lead_ids: ids, dry_run: true, trigger: 'manual' });
      setPlan(res.plan || []);
    } catch (e: any) {
      setError(e?.message || 'Could not simulate routing.');
    } finally { setResolving(false); }
  }
  async function apply() {
    if (leadIds.length === 0) return;
    if (!confirm(`Apply assignments to ${leadIds.length} lead${leadIds.length === 1 ? '' : 's'}? This will change lead ownership.`)) return;
    setApplying(true); setError(null);
    try {
      const res = await opm.runRules({ lead_ids: leadIds, dry_run: false, trigger: 'manual' });
      setApplied(res.assigned ?? (res.results?.length || 0));
    } catch (e: any) {
      setError(e?.message || 'Could not apply assignments.');
    } finally { setApplying(false); }
  }

  const assignable = plan?.filter((p) => p.assignee_user_id != null).length || 0;
  const pooled = plan?.filter((p) => p.assignee_user_id == null && (p.pool || p.method === 'claim')).length || 0;
  const unassigned = plan?.filter((p) => p.assignee_user_id == null && !(p.pool || p.method === 'claim')).length || 0;

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-bold text-ink">Simulator</h3>
        <span className="text-xs text-slate-400">Preview assignments before applying — dry-run changes nothing</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1">
          <span className="label">Search leads</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name, phone, property…" className="input mt-1" />
        </label>
        <label className="min-w-[140px]">
          <span className="label">Tags</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" className="input mt-1" />
        </label>
        <label>
          <span className="label">Limit</span>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="input mt-1 w-auto">
            {[50, 200, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={simulate} disabled={resolving} className="btn-ghost"><Play className="h-4 w-4" /> {resolving ? 'Simulating…' : 'Simulate'}</button>
      </div>

      {activeRules === 0 && <div className="mt-2 text-xs text-amber-600">No active rules — every lead will fall through to fallback/unassigned.</div>}
      {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" /> {error}</div>}

      {plan && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="pill bg-emerald-100 text-emerald-700">{assignable} assignable</span>
            {pooled > 0 && <span className="pill bg-amber-100 text-amber-700">{pooled} claimable / pool</span>}
            {unassigned > 0 && <span className="pill bg-surface text-slate-500">{unassigned} unassigned</span>}
            <span className="ml-auto text-xs text-slate-400">{plan.length} lead{plan.length === 1 ? '' : 's'} simulated (dry run)</span>
            {applied == null ? (
              <button onClick={apply} disabled={applying || assignable === 0} className="btn-primary"><Check className="h-4 w-4" /> {applying ? 'Applying…' : `Apply assignments (${assignable})`}</button>
            ) : (
              <span className="pill bg-emerald-600 text-white"><Check className="mr-1 h-3.5 w-3.5" /> Assigned {applied}</span>
            )}
          </div>

          {plan.length === 0 ? (
            <EmptyState text="No leads matched that filter." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line bg-surface text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Matched rule</th><th className="px-3 py-2">Method</th><th className="px-3 py-2">Assignee</th><th className="px-3 py-2">Reason</th></tr>
                </thead>
                <tbody>
                  {plan.map((p, i) => {
                    const pool = p.assignee_user_id == null && (p.pool || p.method === 'claim');
                    const none = p.assignee_user_id == null && !pool;
                    return (
                      <tr key={p.lead_id ?? i} className="border-b border-line/60">
                        <td className="px-3 py-2 font-semibold text-ink">{p.lead_name || p.lead_id}</td>
                        <td className="px-3 py-2 text-slate-600">{p.matched_rule || <span className="text-slate-400">— no match —</span>}</td>
                        <td className="px-3 py-2">{p.method ? <span className="pill bg-brand-light text-brand">{METHOD_META(p.method).label}</span> : '—'}</td>
                        <td className="px-3 py-2">
                          {p.assignee_name ? <span className="font-medium text-ink">{p.assignee_name}</span>
                            : pool ? <span className="pill bg-amber-100 text-amber-700">claimable / pool</span>
                            : none ? <span className="pill bg-slate-100 text-slate-500">unassigned</span> : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{p.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
