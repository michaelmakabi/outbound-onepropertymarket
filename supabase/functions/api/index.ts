// One Property Market — Outbound: unified data API (auth + analytics + granular access control)
// Ported from retell-command-center (tRPC/Express) to a single Supabase edge function.
// Custom bearer-token auth (opaque sessions). Access control enforced server-side:
// per-user workspace access + per-user agent scope (all | only | except).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3';

const RETELL_BASE_URL = 'https://api.retellai.com';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// ---------------- analytics (ported verbatim in spirit) ----------------
const BOOKING = ['appointment_booked','appointment_scheduled','booked','meeting_booked','demo_booked','transfer_to_sales','transferred'];
const isBooking = (d: string | null) => { if (!d) return false; const x = d.toLowerCase().trim(); return BOOKING.includes(x) || x.includes('appointment_booked') || x.includes('booked'); };
const cents = (c: number) => c / 100;

function computeKpis(calls: any[]) {
  const totalCalls = calls.length;
  const connectedCalls = calls.filter((c) => c.duration_seconds > 0).length;
  const totalCostCents = calls.reduce((s, c) => s + c.combined_cost, 0);
  const totalDurationSeconds = calls.reduce((s, c) => s + c.duration_seconds, 0);
  const totalBookings = calls.filter((c) => isBooking(c.disposition)).length;
  const successCount = calls.filter((c) => c.call_successful === true).length;
  const totalCostDollars = cents(totalCostCents);
  const totalDurationMinutes = totalDurationSeconds / 60;
  return {
    totalCalls, connectedCalls, totalCostCents, totalCostDollars,
    totalDurationSeconds, totalDurationMinutes, totalBookings,
    costPerCallDollars: totalCalls > 0 ? totalCostDollars / totalCalls : 0,
    costPerMinuteDollars: totalDurationMinutes > 0 ? totalCostDollars / totalDurationMinutes : 0,
    costPerBookingDollars: totalBookings > 0 ? totalCostDollars / totalBookings : 0,
    avgCallDurationSeconds: totalCalls > 0 ? totalDurationSeconds / totalCalls : 0,
    successRate: totalCalls > 0 ? successCount / totalCalls : 0,
    bookingRate: totalCalls > 0 ? totalBookings / totalCalls : 0,
  };
}
function categorizeProduct(product: string) {
  const p = product.toLowerCase();
  if (p.includes('twilio') || p.includes('telephony') || p.includes('sip')) return 'Telephony';
  if (p.includes('tts') || p.includes('elevenlabs') || p.includes('playht') || p.includes('cartesia')) return 'TTS';
  if (p.includes('gpt') || p.includes('claude') || p.includes('gemini') || p.includes('llm')) return 'LLM';
  if (p.includes('voice_engine') || p.includes('retell_voice')) return 'Voice Engine';
  return 'Other';
}
function costByCategory(calls: any[]) {
  const map = new Map<string, number>(); let total = 0;
  for (const c of calls) for (const p of (c.product_costs || [])) { const cat = categorizeProduct(p.product); map.set(cat, (map.get(cat) ?? 0) + p.cost); total += p.cost; }
  return Array.from(map.entries()).map(([category, cc]) => ({ category, costDollars: cents(cc), percentage: total > 0 ? (cc / total) * 100 : 0 })).sort((a, b) => b.costDollars - a.costDollars);
}
function costByProduct(calls: any[]) {
  const map = new Map<string, number>(); let total = 0;
  for (const c of calls) for (const p of (c.product_costs || [])) { map.set(p.product, (map.get(p.product) ?? 0) + p.cost); total += p.cost; }
  return Array.from(map.entries()).map(([product, cc]) => ({ product, category: categorizeProduct(product), costDollars: cents(cc), percentage: total > 0 ? (cc / total) * 100 : 0 })).sort((a, b) => b.costDollars - a.costDollars);
}
function dispositionStats(calls: any[]) {
  const map = new Map<string, { count: number; cost: number }>(); const total = calls.length;
  for (const c of calls) { const k = c.disposition ?? 'unlabeled'; const cur = map.get(k) ?? { count: 0, cost: 0 }; cur.count++; cur.cost += c.combined_cost; map.set(k, cur); }
  return Array.from(map.entries()).map(([disposition, v]) => ({ disposition, count: v.count, percentage: total > 0 ? (v.count / total) * 100 : 0, costDollars: cents(v.cost), avgCostPerCallDollars: v.count > 0 ? cents(v.cost) / v.count : 0 })).sort((a, b) => b.count - a.count);
}
// ---- business outcome taxonomy (Booked / Scheduled / Interested / Not Interested / Callback / No Contact / Wrong-Spam / Talked) ----
const OUTCOME_MAP: Record<string, string[]> = {
  booked: ['appointment_booked', 'booked', 'meeting_booked', 'demo_booked', 'job_captured', 'transfer_to_sales', 'transferred', 'job_booked', 'sale', 'won'],
  scheduled: ['appointment_scheduled', 'scheduled', 'callback_scheduled', 'call_scheduled'],
  interested: ['interested', 'send_more_info', 'warm', 'qualified'],
  not_interested: ['not_interested', 'do_not_call', 'not_qualified', 'declined', 'already_customer'],
  callback: ['call_back_later', 'callback', 'follow_up_needed', 'follow_up', 'call_back'],
  no_contact: ['no_answer', 'busy', 'voicemail_left', 'ivr_reached', 'inactivity', 'failed', 'telephony_provider_unavailable', 'sip_routing_error', 'error_user_not_joined', 'error_no_audio_received', 'no_valid_payment', 'max_duration_reached', 'dial_no_answer', 'dial_busy', 'dial_failed'],
  wrong_spam: ['wrong_number', 'spam', 'invalid_destination'],
};
function outcomeOf(d: string | null): string {
  const k = String(d || '').toLowerCase();
  for (const [cat, list] of Object.entries(OUTCOME_MAP)) if (list.includes(k)) return cat;
  if (k.includes('book') || k.includes('appoint')) return 'booked';
  if (k.includes('schedul')) return 'scheduled';
  if (k.includes('not_interest') || k.includes('declin')) return 'not_interested';
  if (k.includes('interest')) return 'interested';
  if (k.includes('call_back') || k.includes('callback') || k.includes('follow')) return 'callback';
  return 'talked';
}
const OUTCOME_ORDER = ['booked', 'scheduled', 'interested', 'callback', 'not_interested', 'no_contact', 'wrong_spam', 'talked'];
function outcomeStats(calls: any[]) {
  const map = new Map<string, { count: number; cost: number }>();
  for (const c of calls) { const o = outcomeOf(c.disposition); const cur = map.get(o) ?? { count: 0, cost: 0 }; cur.count++; cur.cost += c.combined_cost; map.set(o, cur); }
  const total = calls.length;
  return OUTCOME_ORDER.filter((o) => map.has(o)).map((o) => ({ outcome: o, count: map.get(o)!.count, percentage: total > 0 ? (map.get(o)!.count / total) * 100 : 0, costDollars: cents(map.get(o)!.cost) }));
}
function contactNumberOf(c: any): string | null {
  const n = String(c.direction || '').toLowerCase() === 'inbound' ? c.from_number : c.to_number;
  return n ? String(n) : null;
}
function sentimentStats(calls: any[]) {
  const map = new Map<string, number>(); const total = calls.length;
  for (const c of calls) { const k = c.user_sentiment ?? 'Unknown'; map.set(k, (map.get(k) ?? 0) + 1); }
  return Array.from(map.entries()).map(([sentiment, count]) => ({ sentiment, count, percentage: total > 0 ? (count / total) * 100 : 0 })).sort((a, b) => b.count - a.count);
}
function agentStats(calls: any[]) {
  const map = new Map<string, any[]>();
  for (const c of calls) { const k = c.agent_id ?? 'unknown'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c); }
  return Array.from(map.entries()).map(([agentId, g]) => { const k = computeKpis(g); return { agentId, agentName: g.find((x) => x.agent_name)?.agent_name ?? agentId, calls: k.totalCalls, costDollars: k.totalCostDollars, costPerCallDollars: k.costPerCallDollars, bookings: k.totalBookings, bookingRate: k.bookingRate, successRate: k.successRate, avgDurationSeconds: k.avgCallDurationSeconds, llmProduct: g.find((x) => x.llm_product)?.llm_product ?? null, ttsProduct: g.find((x) => x.tts_product)?.tts_product ?? null }; }).sort((a, b) => b.calls - a.calls);
}
function modelStats(calls: any[], pick: (c: any) => string | null) {
  const map = new Map<string, any[]>();
  for (const c of calls) { const k = pick(c) ?? 'unknown'; if (!map.has(k)) map.set(k, []); map.get(k)!.push(c); }
  return Array.from(map.entries()).map(([model, g]) => { const k = computeKpis(g); return { model, calls: k.totalCalls, costDollars: k.totalCostDollars, costPerCallDollars: k.costPerCallDollars, bookings: k.totalBookings, bookingRate: k.bookingRate, successRate: k.successRate }; }).sort((a, b) => b.calls - a.calls);
}
function dailySeries(calls: any[]) {
  const map = new Map<string, { calls: number; cost: number; bookings: number }>();
  for (const c of calls) { if (c.start_timestamp == null) continue; const date = new Date(c.start_timestamp).toISOString().slice(0, 10); const cur = map.get(date) ?? { calls: 0, cost: 0, bookings: 0 }; cur.calls++; cur.cost += c.combined_cost; if (isBooking(c.disposition)) cur.bookings++; map.set(date, cur); }
  return Array.from(map.entries()).map(([date, v]) => ({ date, calls: v.calls, costDollars: cents(v.cost), bookings: v.bookings })).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------- auth + scope ----------------
async function getUser(client: any, req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data: s } = await client.from('sessions').select('user_id, expires_at').eq('token', token).maybeSingle();
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) { await client.from('sessions').delete().eq('token', token); return null; }
  const { data: u } = await client.from('users').select('id, name, username, email, role, disabled').eq('id', s.user_id).maybeSingle();
  if (!u || u.disabled) return null;
  client.from('sessions').update({ last_seen_at: new Date().toISOString() }).eq('token', token).then(() => {});
  return u;
}
async function getScope(client: any, user: any) {
  if (user.role === 'admin' || user.role === 'super_admin') return { all: true, map: {} as Record<string, any> };
  const { data } = await client.from('user_workspace_access').select('workspace, agent_mode, agent_ids').eq('user_id', user.id);
  const map: Record<string, any> = {};
  for (const r of (data || [])) map[r.workspace] = { mode: r.agent_mode, ids: new Set((r.agent_ids || []) as string[]) };
  return { all: false, map };
}
function agentAllowed(scope: any, c: any) {
  if (scope.all) return true;
  const s = scope.map[c.workspace];
  if (!s) return false;
  if (s.mode === 'only') return s.ids.has(c.agent_id);
  if (s.mode === 'except') return !s.ids.has(c.agent_id);
  return true;
}
const LIGHT = 'call_id, workspace, agent_id, agent_name, call_type, direction, call_status, start_timestamp, end_timestamp, duration_seconds, combined_cost_cents, product_costs, disposition, disposition_source, user_sentiment, call_successful, in_voicemail, disconnection_reason, from_number, to_number, llm_product, tts_product, recording_url, public_log_url';

async function loadCalls(client: any, scope: any, opts: { workspace?: string | null; start?: number | null; end?: number | null; disposition?: string | null }) {
  let targetWs: string[] | null = null;
  if (!scope.all) { targetWs = Object.keys(scope.map); if (targetWs.length === 0) return []; }
  if (opts.workspace) targetWs = targetWs ? (targetWs.includes(opts.workspace) ? [opts.workspace] : []) : [opts.workspace];
  if (targetWs && targetWs.length === 0) return [];
  const out: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = client.from('calls').select(LIGHT).order('start_timestamp', { ascending: false }).range(from, from + pageSize - 1);
    if (targetWs) q = q.in('workspace', targetWs);
    if (opts.start != null) q = q.gte('start_timestamp', opts.start);
    if (opts.end != null) q = q.lte('start_timestamp', opts.end);
    if (opts.disposition) q = q.eq('disposition', opts.disposition);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data || []).map((r: any) => ({ ...r, combined_cost: r.combined_cost_cents, product_costs: r.product_costs || [] }));
    for (const r of rows) if (agentAllowed(scope, r)) out.push(r);
    if (!data || data.length < pageSize) break;
  }
  return out;
}

async function retellGetCall(apiKey: string, callId: string) {
  try {
    const res = await fetch(`${RETELL_BASE_URL}/v2/get-call/${encodeURIComponent(callId)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ---------------- OpenAI ----------------
function openaiKey(): string {
  let k = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI') || Deno.env.get('OPENAI_KEY') || Deno.env.get('OPEN_AI') || Deno.env.get('OPEN AI') || '';
  if (!k) { for (const [, v] of Object.entries(Deno.env.toObject())) { if (typeof v === 'string' && v.startsWith('sk-') && !v.startsWith('sk-ant') && v.length > 20) { k = v; break; } } }
  return k;
}
async function openaiJSON(key: string, sys: string, user: string): Promise<any> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  try { return JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { return {}; }
}

// ---------------- request handler ----------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const num = (k: string) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : Number(v); };
  const str = (k: string) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };

  try {
    // ---- public: login ----
    if (action === 'login') {
      const body = await req.json().catch(() => ({}));
      const username = String(body.username ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!username || !password) return json({ error: 'Username and password are required.' }, 400);
      const { data: u } = await client.from('users').select('*').eq('username', username).maybeSingle();
      if (!u || !u.password_hash) return json({ error: 'Invalid username or password.' }, 401);
      if (u.disabled) return json({ error: 'This account has been disabled.' }, 403);
      const ok = bcrypt.compareSync(password, u.password_hash);
      if (!ok) return json({ error: 'Invalid username or password.' }, 401);
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
      const expires = new Date(Date.now() + ONE_YEAR_MS).toISOString();
      await client.from('sessions').insert({ token, user_id: u.id, expires_at: expires });
      const upd: any = { last_signed_in: new Date().toISOString() };
      const firstClaim = !u.claimed_at;
      if (firstClaim) upd.claimed_at = new Date().toISOString();
      await client.from('users').update(upd).eq('id', u.id);
      if (firstClaim) await client.from('user_events').insert({ actor_id: u.id, actor_name: u.name, target_user_id: u.id, target_name: u.name, action: 'claimed', detail: 'First sign-in (invitation claimed)' });
      await client.from('user_events').insert({ actor_id: u.id, actor_name: u.name, target_user_id: u.id, target_name: u.name, action: 'login', detail: null });
      return json({ token, user: { id: u.id, name: u.name, username: u.username, email: u.email, role: u.role } });
    }

    // ---- everything below requires a valid session ----
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    if (action === 'logout') {
      const auth = req.headers.get('authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token) await client.from('sessions').delete().eq('token', token);
      return json({ success: true });
    }
    if (action === 'me') return json({ user });

    const scope = await getScope(client, user);

    // visible workspaces (respects scope)
    async function visibleWorkspaces() {
      const { data } = await client.from('workspaces').select('slug, display_name, status').order('sort_order');
      let list = data || [];
      if (!scope.all) list = list.filter((w: any) => scope.map[w.slug]);
      return list;
    }

    if (action === 'bootstrap') {
      return json({ user, workspaces: await visibleWorkspaces() });
    }

    if (action === 'overview') {
      const calls = await loadCalls(client, scope, { start: num('start'), end: num('end'), workspace: str('workspace') });
      const ws = await visibleWorkspaces();
      const byWs: Record<string, any[]> = {};
      for (const c of calls) { (byWs[c.workspace] ||= []).push(c); }
      const perWorkspace = ws.map((w: any) => ({ slug: w.slug, display_name: w.display_name, status: w.status, kpis: computeKpis(byWs[w.slug] || []) }));
      return json({ kpis: computeKpis(calls), perWorkspace, timeSeries: dailySeries(calls), topDispositions: dispositionStats(calls).slice(0, 8), costByCategory: costByCategory(calls), outcomes: outcomeStats(calls) });
    }

    if (action === 'workspace') {
      const slug = str('slug');
      if (!slug) return json({ error: 'slug required' }, 400);
      if (!scope.all && !scope.map[slug]) return json({ error: 'forbidden' }, 403);
      const calls = await loadCalls(client, scope, { workspace: slug, start: num('start'), end: num('end') });
      const { data: w } = await client.from('workspaces').select('slug, display_name, status').eq('slug', slug).maybeSingle();
      const { data: phones } = await client.from('agents').select('agent_id, agent_name').eq('workspace', slug);
      const agentStatsList = agentStats(calls);
      const numbers = new Set<string>();
      for (const c of calls) { const ours = String(c.direction || '').toLowerCase() === 'inbound' ? c.to_number : c.from_number; if (ours) numbers.add(ours); }
      return json({ workspace: w, kpis: computeKpis(calls), dispositions: dispositionStats(calls), sentiment: sentimentStats(calls), costByCategory: costByCategory(calls), costByProduct: costByProduct(calls), agents: agentStatsList, llm: modelStats(calls, (c) => c.llm_product), tts: modelStats(calls, (c) => c.tts_product), timeSeries: dailySeries(calls), agentCount: (phones || []).length, liveAgents: (phones || []).length, phoneNumbers: numbers.size, activeAgents: agentStatsList.length });
    }

    if (action === 'dispositions') {
      const calls = await loadCalls(client, scope, { workspace: str('workspace'), start: num('start'), end: num('end') });
      return json({ dispositions: dispositionStats(calls), outcomes: outcomeStats(calls), total: calls.length });
    }

    // ---------------- contacts: unique phone numbers with repeat-call threads ----------------
    if (action === 'contacts') {
      const calls = await loadCalls(client, scope, { workspace: str('workspace'), start: num('start'), end: num('end') });
      const map = new Map<string, any>();
      for (const c of calls) {
        const n = contactNumberOf(c); if (!n) continue;
        let e = map.get(n);
        if (!e) { e = { number: n, calls: 0, firstMs: c.start_timestamp, lastMs: c.start_timestamp, lastDisposition: c.disposition, spend: 0, booked: 0, agentName: c.agent_name, workspaces: new Set<string>() }; map.set(n, e); }
        e.calls++; e.spend += c.combined_cost; e.workspaces.add(c.workspace);
        if (outcomeOf(c.disposition) === 'booked') e.booked++;
        if ((c.start_timestamp || 0) > (e.lastMs || 0)) { e.lastMs = c.start_timestamp; e.lastDisposition = c.disposition; e.agentName = c.agent_name; }
        if ((c.start_timestamp || Infinity) < (e.firstMs || Infinity)) e.firstMs = c.start_timestamp;
      }
      let rows = Array.from(map.values()).map((e) => ({ number: e.number, calls: e.calls, firstMs: e.firstMs, lastMs: e.lastMs, lastDisposition: e.lastDisposition, spendDollars: cents(e.spend), booked: e.booked, agentName: e.agentName, workspaceCount: e.workspaces.size }));
      const minCalls = num('minCalls') || 1;
      rows = rows.filter((r) => r.calls >= minCalls);
      const search = (str('search') || '').toLowerCase();
      if (search) rows = rows.filter((r) => r.number.toLowerCase().includes(search));
      const sort = str('sort') || 'calls';
      rows.sort((a, b) => (sort === 'last' ? (b.lastMs || 0) - (a.lastMs || 0) : sort === 'spend' ? b.spendDollars - a.spendDollars : b.calls - a.calls || (b.lastMs || 0) - (a.lastMs || 0)));
      const totalContacts = rows.length;
      const repeatContacts = rows.filter((r) => r.calls > 1).length;
      const page = Math.max(1, num('page') || 1); const pageSize = Math.min(200, num('pageSize') || 50);
      return json({ contacts: rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), total: totalContacts, repeatContacts, page, pageSize });
    }

    if (action === 'contact') {
      const number = str('number');
      if (!number) return json({ error: 'number required' }, 400);
      const calls = await loadCalls(client, scope, {});
      const thread = calls.filter((c) => contactNumberOf(c) === number)
        .sort((a, b) => (b.start_timestamp || 0) - (a.start_timestamp || 0))
        .map((c) => ({ call_id: c.call_id, start_timestamp: c.start_timestamp, direction: c.direction, agent_name: c.agent_name, disposition: c.disposition, outcome: outcomeOf(c.disposition), duration_seconds: c.duration_seconds, combined_cost_cents: c.combined_cost, user_sentiment: c.user_sentiment, workspace: c.workspace, recording_url: c.recording_url }));
      return json({ number, calls: thread, outcomes: outcomeStats(calls.filter((c) => contactNumberOf(c) === number)) });
    }

    if (action === 'compare') {
      const calls = await loadCalls(client, scope, { start: num('start'), end: num('end') });
      const ws = await visibleWorkspaces();
      const byWs: Record<string, any[]> = {};
      for (const c of calls) (byWs[c.workspace] ||= []).push(c);
      return json({ workspaces: ws.map((w: any) => ({ slug: w.slug, display_name: w.display_name, status: w.status, kpis: computeKpis(byWs[w.slug] || []), sentiment: sentimentStats(byWs[w.slug] || []), topDispositions: dispositionStats(byWs[w.slug] || []).slice(0, 5) })) });
    }

    if (action === 'agents') {
      const calls = await loadCalls(client, scope, { workspace: str('workspace'), start: num('start'), end: num('end') });
      return json({ agents: agentStats(calls), llm: modelStats(calls, (c) => c.llm_product), tts: modelStats(calls, (c) => c.tts_product) });
    }

    if (action === 'calls') {
      const calls = await loadCalls(client, scope, { workspace: str('workspace'), start: num('start'), end: num('end') });
      const csv = (k: string) => { const v = str(k); return v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []; };
      const dispositions = csv('dispositions'); // multi-select
      const legacyDisp = str('disposition'); // back-compat single
      const dispSet = new Set([...dispositions, ...(legacyDisp ? [legacyDisp] : [])]);
      const directions = csv('directions');
      const dirSet = new Set(directions.map((d) => d.toLowerCase()));
      const search = (str('search') || '').toLowerCase();

      const minDuration = num('minDuration'); // seconds
      let filtered = calls;
      if (dispSet.size) filtered = filtered.filter((c) => dispSet.has(c.disposition));
      if (dirSet.size) filtered = filtered.filter((c) => dirSet.has(String(c.direction || '').toLowerCase()));
      if (minDuration != null) filtered = filtered.filter((c) => Number(c.duration_seconds || 0) >= minDuration);
      if (search) filtered = filtered.filter((c) => [c.from_number, c.to_number, c.agent_name, c.call_id, c.disposition].some((f) => String(f || '').toLowerCase().includes(search)));

      const sort = str('sort') || 'when_desc';
      const dir = sort.endsWith('_asc') ? 1 : -1;
      const key = sort.replace(/_(asc|desc)$/, '');
      const val = (c: any) => {
        switch (key) {
          case 'cost': return Number(c.combined_cost || 0);
          case 'duration': return Number(c.duration_seconds || 0);
          case 'disposition': return String(c.disposition || '');
          case 'agent': return String(c.agent_name || '');
          case 'direction': return String(c.direction || '');
          default: return Number(c.start_timestamp || 0); // when
        }
      };
      filtered.sort((a, b) => {
        const av = val(a); const bv = val(b);
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });

      const page = Math.max(1, num('page') || 1);
      const pageSize = Math.min(5000, num('pageSize') || 50);
      const startIdx = (page - 1) * pageSize;
      const pageItems = filtered.slice(startIdx, startIdx + pageSize);
      // attach call_summary for just this page (kept out of the shared analytics select for size)
      const ids = pageItems.map((c) => c.call_id);
      if (ids.length) {
        const { data: sums } = await client.from('calls').select('call_id, call_summary').in('call_id', ids);
        const map = new Map((sums || []).map((s: any) => [s.call_id, s.call_summary]));
        for (const it of pageItems) it.call_summary = map.get(it.call_id) ?? null;
      }
      return json({ items: pageItems, total: filtered.length, page, pageSize });
    }

    if (action === 'call') {
      const id = str('id');
      if (!id) return json({ error: 'id required' }, 400);
      const { data: row } = await client.from('calls').select('*').eq('call_id', id).maybeSingle();
      if (!row) return json({ error: 'not found' }, 404);
      const mapped = { ...row, combined_cost: row.combined_cost_cents, product_costs: row.product_costs || [] };
      if (!agentAllowed(scope, mapped)) return json({ error: 'forbidden' }, 403);
      // lazy transcript backfill from Retell if missing
      if (!row.transcript) {
        const { data: w } = await client.from('workspaces').select('api_key').eq('slug', row.workspace).maybeSingle();
        if (w?.api_key) {
          const raw = await retellGetCall(w.api_key, id);
          if (raw?.call_id) {
            const patch = { transcript: typeof raw.transcript === 'string' ? raw.transcript : null, transcript_object: Array.isArray(raw.transcript_object) ? raw.transcript_object : null, recording_url: raw.recording_url ?? row.recording_url, public_log_url: raw.public_log_url ?? row.public_log_url, call_summary: raw.call_analysis?.call_summary ?? row.call_summary };
            await client.from('calls').update(patch).eq('call_id', id);
            Object.assign(mapped, patch);
          }
        }
      }
      return json({ call: mapped });
    }

    // ---------------- usage analytics (admin) ----------------
    if (action === 'usage') {
      if (user.role !== 'admin' && user.role !== 'super_admin') return json({ error: 'forbidden' }, 403);
      const { data: users } = await client.from('users').select('id, name, username, role, disabled, last_signed_in, created_at').order('id');
      const { data: sessions } = await client.from('sessions').select('user_id, created_at, last_seen_at');
      const now = Date.now();
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      const byUser: Record<number, { sessions: number; lastSeen: number | null }> = {};
      const dayMap = new Map<string, number>();
      for (const s of (sessions || [])) {
        const b = (byUser[s.user_id] ||= { sessions: 0, lastSeen: null });
        b.sessions++;
        const seen = s.last_seen_at ? new Date(s.last_seen_at).getTime() : null;
        if (seen && (b.lastSeen == null || seen > b.lastSeen)) b.lastSeen = seen;
        if (s.created_at) { const day = new Date(s.created_at).toISOString().slice(0, 10); dayMap.set(day, (dayMap.get(day) ?? 0) + 1); }
      }
      const perUser = (users || []).map((u: any) => {
        const b = byUser[u.id] || { sessions: 0, lastSeen: u.last_signed_in ? new Date(u.last_signed_in).getTime() : null };
        return { id: u.id, name: u.name, username: u.username, role: u.role, disabled: u.disabled, sessions: b.sessions, lastSeen: b.lastSeen };
      }).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
      const activeUsers = perUser.filter((u) => u.lastSeen && now - u.lastSeen < WEEK).length;
      const loginSeries = Array.from(dayMap.entries()).map(([date, logins]) => ({ date, logins })).sort((a, b) => a.date.localeCompare(b.date));
      return json({ totalUsers: (users || []).length, activeUsers, totalSessions: (sessions || []).length, perUser, loginSeries });
    }

    // ---------------- self-service profile ----------------
    if (action === 'profile.update' && (req.method === 'POST' || req.method === 'PATCH')) {
      const body = await req.json().catch(() => ({}));
      const patch: any = { updated_at: new Date().toISOString() };
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
      if (typeof body.password === 'string' && body.password) patch.password_hash = bcrypt.hashSync(String(body.password), 10);
      const { error } = await client.from('users').update(patch).eq('id', user.id);
      if (error) return json({ error: error.message }, 400);
      await client.from('user_events').insert({ actor_id: user.id, actor_name: user.name, target_user_id: user.id, target_name: user.name, action: body.password ? 'reset_password' : 'update_profile', detail: 'Self-service' });
      return json({ success: true });
    }

    // ---------------- recording proxy (streams WAV bytes; used for MP3 conversion client-side) ----------------
    if (action === 'recording') {
      const id = str('id');
      if (!id) return json({ error: 'id required' }, 400);
      const { data: row } = await client.from('calls').select('workspace, agent_id, recording_url').eq('call_id', id).maybeSingle();
      if (!row || !row.recording_url) return json({ error: 'no recording' }, 404);
      if (!agentAllowed(scope, row)) return json({ error: 'forbidden' }, 403);
      const rec = await fetch(row.recording_url);
      if (!rec.ok) return json({ error: 'fetch failed' }, 502);
      const buf = await rec.arrayBuffer();
      return new Response(buf, { headers: { ...cors, 'Content-Type': rec.headers.get('content-type') || 'audio/wav' } });
    }

    // ---------------- AI: build / enhance agent prompt from call transcripts ----------------
    // ---------------- AI: campaign suggestions from recent performance ----------------
    if (action === 'ai.suggestions' && req.method === 'POST') {
      const apiKey = openaiKey();
      if (!apiKey) return json({ needsKey: true, error: 'OpenAI key not found. Add a secret named OPENAI_API_KEY (value sk-...).' }, 400);
      const body = await req.json().catch(() => ({}));
      const calls = await loadCalls(client, scope, { workspace: body.workspace || null, start: body.start ?? null, end: body.end ?? null });
      if (calls.length === 0) return json({ error: 'No calls in range.' }, 400);
      const ws = await visibleWorkspaces();
      const byWs: Record<string, any[]> = {};
      for (const c of calls) (byWs[c.workspace] ||= []).push(c);
      const perWs = ws.map((w: any) => ({ name: w.display_name, ...computeKpis(byWs[w.slug] || []) })).filter((w: any) => w.totalCalls > 0);
      const agentsTop = agentStats(calls).slice(0, 12).map((a) => ({ agent: a.agentName, calls: a.calls, bookings: a.bookings, bookingRate: a.bookingRate, successRate: a.successRate, costPerCall: a.costPerCallDollars }));
      const dispo = dispositionStats(calls).slice(0, 15);
      const outcomes = outcomeStats(calls);
      const kpis = computeKpis(calls);
      const facts = JSON.stringify({ kpis, outcomes, perWorkspace: perWs, topAgents: agentsTop, dispositions: dispo }, null, 0).slice(0, 60000);
      try {
        const out = await openaiJSON(apiKey,
          'You are a performance analyst for outbound voice-AI calling. You produce specific, numeric, actionable optimizations from campaign data. Never invent numbers not present in the data.',
          `Analyze this outbound-calling performance data and produce optimization suggestions. Return STRICT JSON: {"suggestions":[{"title":"...","severity":"high|medium|low","detail":"...","metric":"the number that justifies it"}]}. 6-10 suggestions, ranked by impact (budget shifts between workspaces by cost-per-booking, weak agents/scripts, disposition patterns, time-of-day if visible).\n\nDATA:\n${facts}`);
        await client.from('user_events').insert({ actor_id: user.id, actor_name: user.name, target_user_id: null, target_name: null, action: 'ai_suggestions', detail: `${calls.length} calls` });
        return json({ suggestions: Array.isArray(out.suggestions) ? out.suggestions : [], callsAnalyzed: calls.length });
      } catch (e) { return json({ error: String((e as any)?.message ?? e) }, 502); }
    }

    // ---------------- AI: executive report ----------------
    if (action === 'ai.report' && req.method === 'POST') {
      const apiKey = openaiKey();
      if (!apiKey) return json({ needsKey: true, error: 'OpenAI key not found. Add a secret named OPENAI_API_KEY (value sk-...).' }, 400);
      const body = await req.json().catch(() => ({}));
      const calls = await loadCalls(client, scope, { workspace: body.workspace || null, start: body.start ?? null, end: body.end ?? null });
      if (calls.length === 0) return json({ error: 'No calls in range.' }, 400);
      const ws = await visibleWorkspaces();
      const byWs: Record<string, any[]> = {};
      for (const c of calls) (byWs[c.workspace] ||= []).push(c);
      const perWs = ws.map((w: any) => ({ name: w.display_name, ...computeKpis(byWs[w.slug] || []) })).filter((w: any) => w.totalCalls > 0);
      const facts = JSON.stringify({ periodLabel: body.periodLabel || 'selected range', kpis: computeKpis(calls), outcomes: outcomeStats(calls), perWorkspace: perWs, series: dailySeries(calls) }).slice(0, 60000);
      try {
        const out = await openaiJSON(apiKey,
          'You are an operations analyst writing a crisp executive summary of an outbound calling program for a client. Use only the numbers provided. Be concrete.',
          `Write an executive report. Return STRICT JSON: {"report":"<markdown>"}. The markdown should include: a headline paragraph with the key KPIs; a "Wins" list (3); a "Risks" list (3); and a short per-workspace spotlight. Reference real numbers.\n\nDATA:\n${facts}`);
        await client.from('user_events').insert({ actor_id: user.id, actor_name: user.name, target_user_id: null, target_name: null, action: 'ai_report', detail: `${calls.length} calls` });
        return json({ report: out.report || '', callsAnalyzed: calls.length });
      } catch (e) { return json({ error: String((e as any)?.message ?? e) }, 502); }
    }

    if (action === 'ai.buildPrompt' && req.method === 'POST') {
      const apiKey = openaiKey();
      if (!apiKey) return json({ needsKey: true, error: 'OpenAI key not found. Add a secret named OPENAI_API_KEY (value sk-...).' }, 400);
      const body = await req.json().catch(() => ({}));
      const callIds: string[] = Array.isArray(body.callIds) ? body.callIds.slice(0, 40) : [];
      const mode = body.mode === 'enhance' ? 'enhance' : 'new';
      const existingPrompt = String(body.existingPrompt || '');
      const extra = String(body.instructions || '');
      if (callIds.length === 0) return json({ error: 'Select at least one call.' }, 400);

      const { data: rows } = await client.from('calls').select('call_id, agent_name, disposition, call_successful, user_sentiment, transcript, call_summary, direction').in('call_id', callIds);
      const allowed = (rows || []).filter((r: any) => agentAllowed(scope, r));
      if (allowed.length === 0) return json({ error: 'No accessible calls.' }, 403);

      let transcriptBlock = '';
      let used = 0;
      for (const r of allowed) {
        const t = r.transcript || r.call_summary || '';
        if (!t) continue;
        const snippet = String(t).slice(0, 3500);
        transcriptBlock += `\n\n=== CALL ${used + 1} | disposition: ${r.disposition || 'n/a'} | success: ${r.call_successful} | sentiment: ${r.user_sentiment || 'n/a'} ===\n${snippet}`;
        used++;
        if (transcriptBlock.length > 90000) break;
      }
      if (used === 0) return json({ error: 'None of the selected calls have transcripts yet. Open a few to backfill, then retry.' }, 400);

      const sys = 'You are an expert conversation designer for outbound voice AI agents (Retell/GHL). You analyze real call transcripts and produce production-ready agent system prompts. You are concrete, tactical, and you cite patterns you actually observed in the transcripts.';
      const task = mode === 'enhance'
        ? `Improve the EXISTING agent prompt below using lessons from the ${used} real call transcripts. Keep what works; fix what caused poor outcomes (hang-ups, no-answers, objections not handled). Preserve the agent's identity and offer.\n\n--- EXISTING PROMPT ---\n${existingPrompt || '(none provided — infer the current approach from the transcripts)'}\n`
        : `Write a NEW, complete outbound voice-agent system prompt, curated from patterns across the ${used} real call transcripts (opener, discovery, objection handling, booking/close, voicemail).`;
      const userMsg = `${task}\n${extra ? `\nAdditional instructions: ${extra}\n` : ''}\nReturn STRICT JSON with two keys: "prompt" (the full agent prompt as a single string) and "explanation" (a concise bulleted markdown string describing exactly what you changed/built and WHY, referencing observed patterns).\n\nTRANSCRIPTS:${transcriptBlock}`;

      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
          }),
        });
        if (!resp.ok) { const t = await resp.text(); return json({ error: `OpenAI error: ${t.slice(0, 200)}` }, 502); }
        const data = await resp.json();
        let parsed: any = {};
        try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { parsed = { prompt: data.choices?.[0]?.message?.content || '', explanation: '' }; }
        return json({ prompt: parsed.prompt || '', explanation: parsed.explanation || '', callsAnalyzed: used, mode });
      } catch (e) {
        return json({ error: String((e as any)?.message ?? e) }, 500);
      }
    }

    // ---------------- admin ----------------
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isSuper = user.role === 'super_admin';
    if (action.startsWith('admin.')) {
      if (!isAdmin) return json({ error: 'forbidden' }, 403);

      if (action === 'admin.users') {
        const { data } = await client.from('users').select('id, name, username, email, role, disabled, last_signed_in, created_at, claimed_at').order('id');
        return json({ users: data || [] });
      }
      if (action === 'admin.userEvents') {
        const { data } = await client.from('user_events').select('id, actor_name, target_name, action, detail, created_at').order('created_at', { ascending: false }).limit(100);
        return json({ events: data || [] });
      }
      if (action === 'admin.allWorkspaces') {
        const { data } = await client.from('workspaces').select('slug, display_name, status, sort_order').order('sort_order');
        return json({ workspaces: data || [] });
      }
      if (action === 'admin.workspaceAgents') {
        const slug = str('workspace');
        const { data } = await client.from('agents').select('agent_id, agent_name, last_seen_ms').eq('workspace', slug).order('last_seen_ms', { ascending: false });
        return json({ agents: data || [] });
      }
      if (action === 'admin.getAccess') {
        const uid = num('userId');
        const { data } = await client.from('user_workspace_access').select('workspace, agent_mode, agent_ids').eq('user_id', uid);
        return json({ access: data || [] });
      }
      if (req.method === 'POST' || req.method === 'PATCH') {
        const body = await req.json().catch(() => ({}));
        const logEvent = (targetId: number, targetName: string, act: string, detail: string | null) =>
          client.from('user_events').insert({ actor_id: user.id, actor_name: user.name, target_user_id: targetId, target_name: targetName, action: act, detail });
        const genPassword = () => 'OPM-' + crypto.randomUUID().slice(0, 8) + Math.floor(10 + Math.random() * 89);
        const loadTarget = async (id: number) => (await client.from('users').select('id, name, role, username').eq('id', id).maybeSingle()).data;

        if (action === 'admin.createUser') {
          if (!isSuper) return json({ error: 'super_admin required' }, 403);
          const email = String(body.email ?? body.username ?? '').trim().toLowerCase();
          const password = String(body.password ?? '') || genPassword();
          if (!email) return json({ error: 'email is required' }, 400);
          const hash = bcrypt.hashSync(password, 10);
          const role = ['user', 'admin', 'super_admin'].includes(body.role) ? body.role : 'user';
          const { data, error } = await client.from('users').insert({ open_id: 'cred_' + email, name: body.name || email, email, login_method: 'credential', role, username: email, password_hash: hash, disabled: false, claimed_at: null }).select('id, name, username, role').maybeSingle();
          if (error) return json({ error: error.message.includes('duplicate') ? 'A user with that email already exists.' : error.message }, 400);
          await logEvent(data.id, data.name, 'create_user', `Role: ${role} · invitation pending`);
          return json({ user: data, tempPassword: body.password ? undefined : password });
        }
        if (action === 'admin.updateUser') {
          const targetId = Number(body.id);
          const target = await loadTarget(targetId);
          if (!target) return json({ error: 'user not found' }, 404);
          // permissions: super edits anyone; admin edits only 'user' targets; nobody demotes/edits a super but a super
          if (!isSuper && (target.role !== 'user')) return json({ error: 'You can only edit standard users.' }, 403);
          const patch: any = { updated_at: new Date().toISOString() };
          const changes: string[] = [];
          if (body.name) { patch.name = body.name; changes.push('name'); }
          if (typeof body.email === 'string' && body.email.trim()) { const e = body.email.trim().toLowerCase(); patch.email = e; patch.username = e; changes.push('email'); }
          if (typeof body.disabled === 'boolean') { patch.disabled = body.disabled; changes.push(body.disabled ? 'disabled' : 'enabled'); }
          if (isSuper && body.role && ['user', 'admin', 'super_admin'].includes(body.role)) { patch.role = body.role; changes.push(`role→${body.role}`); }
          if (body.password) { patch.password_hash = bcrypt.hashSync(String(body.password), 10); changes.push('password'); }
          const { error } = await client.from('users').update(patch).eq('id', targetId);
          if (error) return json({ error: error.message }, 400);
          await logEvent(targetId, patch.name || target.name, 'update_user', changes.length ? `Updated: ${changes.join(', ')}` : 'No changes');
          return json({ success: true });
        }
        if (action === 'admin.resetPassword') {
          const targetId = Number(body.id);
          const target = await loadTarget(targetId);
          if (!target) return json({ error: 'user not found' }, 404);
          if (!isSuper && target.role !== 'user') return json({ error: 'You can only reset standard users.' }, 403);
          const password = String(body.password ?? '') || genPassword();
          await client.from('users').update({ password_hash: bcrypt.hashSync(password, 10), updated_at: new Date().toISOString() }).eq('id', targetId);
          await logEvent(targetId, target.name, 'reset_password', 'Password reset by admin');
          return json({ success: true, password: body.password ? undefined : password });
        }
        if (action === 'admin.resendInvite') {
          const targetId = Number(body.id);
          const target = await loadTarget(targetId);
          if (!target) return json({ error: 'user not found' }, 404);
          if (!isSuper && target.role !== 'user') return json({ error: 'Not allowed.' }, 403);
          const password = genPassword();
          await client.from('users').update({ password_hash: bcrypt.hashSync(password, 10), claimed_at: null, updated_at: new Date().toISOString() }).eq('id', targetId);
          await logEvent(targetId, target.name, 'resend_invite', 'Invitation reissued (temp password regenerated)');
          return json({ success: true, password, username: target.username, loginUrl: 'https://outbound.1propertymarket.com/login' });
        }
        if (action === 'admin.setAccess') {
          // body: { userId, access: [{ workspace, agent_mode, agent_ids }] }
          const uid = body.userId;
          const access = Array.isArray(body.access) ? body.access : [];
          await client.from('user_workspace_access').delete().eq('user_id', uid);
          if (access.length > 0) {
            const rows = access.map((a: any) => ({ user_id: uid, workspace: a.workspace, agent_mode: ['all', 'only', 'except'].includes(a.agent_mode) ? a.agent_mode : 'all', agent_ids: Array.isArray(a.agent_ids) ? a.agent_ids : [] }));
            const { error } = await client.from('user_workspace_access').insert(rows);
            if (error) return json({ error: error.message }, 400);
          }
          const tgt = await client.from('users').select('name').eq('id', uid).maybeSingle();
          await client.from('user_events').insert({ actor_id: user.id, actor_name: user.name, target_user_id: uid, target_name: tgt.data?.name || null, action: 'set_access', detail: `${access.length} workspace grant(s)` });
          return json({ success: true });
        }
      }
      return json({ error: 'unknown admin action' }, 404);
    }

    return json({ error: 'unknown action' }, 404);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
