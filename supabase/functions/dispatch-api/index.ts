// Dispatch AI — orchestration proxy for the outbound calling engine (Retell "Adrian" + GHL MTIP 2.0).
// Deployed on the 1PropertyMarket project (sezigczgwezeecgobuqd), co-located with adrian-dialer,
// dial_numbers/dial_counters, pick_dial_number, retell_agents. verify_jwt=false; custom auth.
//
// Secrets stay server-side: DIAL_SECRET (dialer), GHL_PIT (GoHighLevel PIT), TWILIO_* (Lookup).
// Auth: the browser presents the SAME bearer token it uses for the analytics API; we validate it by
// calling that API's ?action=me and require an admin/super_admin. Leads live in GHL; campaign configs
// live in dispatch_campaigns (this project, RLS-on, service-role only).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GHLB = 'https://services.leadconnectorhq.com', GV = '2021-07-28';
const LOC = Deno.env.get('GHL_LOCATION_ID') || '0EGiH3UWUq06uTO3U90A';
const DIAL_BASE = 'https://sezigczgwezeecgobuqd.supabase.co/functions/v1/adrian-dialer';
const DIAL_SECRET = Deno.env.get('DIAL_SECRET') || 'bb-adrian-dial-9x27';
const ADRIAN_AGENT = Deno.env.get('ADRIAN_AGENT_ID') || 'agent_ee77a9e3c659964acc19d0be54';
const RETELL_KEY = Deno.env.get('RETELL_API_KEY') || 'key_ecb90512a65f3aea88c243d5816e';
const ANALYTICS_API = Deno.env.get('ANALYTICS_API') || 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api';
const AUTH_ME = ANALYTICS_API + '?action=me';
// Twilio Lookup v2 — Line Type Intelligence (number verification).
const TW_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_SID') || '';
const TW_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || Deno.env.get('TWILIO_TOKEN') || '';

const LINE_TYPE_FIELD = 'uyXHlCAuHq2y7jRHMiwg';
const ADDR_FIELDS = ['yUXrLod4dbSPWmnCbaSH', 'LHfGDHAAofUr7o85ci5a'];
const QUEUE_TAG = 'adrian: call now';
const DIALING_TAG = 'adrian: dialing';
const DONE_TAGS = ['adrian: called', 'adrian: completed', 'adrian: done'];
const SKIP_TAG = 'adrian: skipped bad number';
const SUPPRESS_VALUES = ['invalid', 'wrong', 'not a valid'];
const NO_CALL_TAGS = ['wrong number', 'wrong number buyer', 'do not call', 'invalid number'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// ---------------- GHL ----------------
const ghH = () => {
  const p = Deno.env.get('GHL_PIT') || Deno.env.get('GHL_PID');
  if (!p) throw new Error('GHL token (GHL_PIT) not configured on this project.');
  return { Authorization: `Bearer ${p}`, Version: GV, 'Content-Type': 'application/json', Accept: 'application/json' };
};
async function ghl(path: string, init: RequestInit = {}, tries = 3): Promise<{ ok: boolean; status: number; json: any }> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(GHLB + path, { ...init, headers: { ...ghH(), ...(init.headers || {}) } });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 700 * (i + 1))); continue; }
      const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
      return { ok: r.ok, status: r.status, json: j };
    } catch { await new Promise((s) => setTimeout(s, 500 * (i + 1))); }
  }
  return { ok: false, status: 0, json: null };
}
function cfArr(ct: any) { return ct.customFields || ct.customField || []; }
function cfVal(f: any) { const v = f?.value ?? f?.fieldValue ?? f?.fieldValueString ?? f?.selectedOptions; if (Array.isArray(v)) return v.join(', '); return v == null ? '' : String(v).trim(); }
function fieldVal(ct: any, ids: string[]) { const cf = cfArr(ct); for (const id of ids) { const f = (cf || []).find((x: any) => x.id === id || x.customFieldId === id); const v = f ? cfVal(f) : ''; if (v) return v; } return ''; }
function tagsOf(ct: any): string[] { return (ct.tags || []).map((x: any) => String(x).toLowerCase()); }

// bucket a Line Type value + tags → routing category
function lineBucket(ct: any): { type: string; route: string } {
  const raw = fieldVal(ct, [LINE_TYPE_FIELD]).toLowerCase();
  const tags = tagsOf(ct);
  const has = (v: string) => raw.includes(v) || tags.includes(v);
  if (SUPPRESS_VALUES.some((v) => raw.includes(v)) || NO_CALL_TAGS.some((t) => tags.includes(t)) || tags.includes('do not text'))
    return { type: 'invalid', route: 'suppress' };
  if (has('landline')) return { type: 'landline', route: 'call' };
  if (has('voip')) return { type: 'voip', route: 'call' };
  if (raw.includes('mobile') || raw.includes('cell')) return { type: 'mobile', route: 'text_then_call' };
  if (raw) return { type: 'other', route: 'call' };
  return { type: 'unverified', route: 'pending' };
}
function leadStatusOf(ct: any): string {
  const tags = tagsOf(ct);
  if (tags.includes(SKIP_TAG)) return 'suppressed';
  if (DONE_TAGS.some((t) => tags.includes(t))) return 'completed';
  if (tags.includes(DIALING_TAG)) return 'dialing';
  if (tags.includes(QUEUE_TAG)) return 'queued';
  return 'idle';
}
function campaignTag(slug: string) { return `campaign: ${slug}`.toLowerCase(); }

async function searchByTag(tag: string, cap = 500): Promise<any[]> {
  const out: any[] = []; let page = 1;
  while (out.length < cap) {
    const body = { locationId: LOC, page, pageLimit: 100, filters: [{ field: 'tags', operator: 'eq', value: tag }] };
    const r = await ghl('/contacts/search', { method: 'POST', body: JSON.stringify(body) });
    const cs = r.json?.contacts || [];
    out.push(...cs);
    if (cs.length < 100) break;
    page++;
    if (page > 20) break;
  }
  return out.slice(0, cap);
}

// ---------------- Twilio Lookup: Line Type Intelligence ----------------
async function twilioLineType(phone: string): Promise<{ valid: boolean; type: string | null; carrier: string | null }> {
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`;
  const auth = btoa(`${TW_SID}:${TW_TOKEN}`);
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (r.status === 404) return { valid: false, type: null, carrier: null }; // not a real/dialable number
  const j = await r.json().catch(() => ({} as any));
  const lti = j.line_type_intelligence || {};
  return { valid: j.valid !== false, type: lti.type || null, carrier: lti.carrier_name || null };
}
// Map a Twilio line type → the GHL "Line Type" field value the dialer reads (it suppresses invalid/wrong).
function twilioToFieldValue(res: { valid: boolean; type: string | null }): string {
  if (!res.valid) return 'Invalid/Wrong';
  const t = String(res.type || '').toLowerCase();
  if (t === 'mobile') return 'Mobile';
  if (t === 'landline') return 'Landline';
  if (t === 'fixedvoip' || t === 'nonfixedvoip') return 'VoIP';
  if (t === 'voicemail' || t === 'pager') return 'Invalid/Wrong'; // not a person to reach
  return 'Unknown'; // valid + callable (tollFree/premium/uan/personal/unknown)
}

// ---------------- dialer proxy ----------------
async function dialer(body: any, mode?: string): Promise<any> {
  const u = new URL(DIAL_BASE); u.searchParams.set('key', DIAL_SECRET); if (mode) u.searchParams.set('mode', mode);
  const r = await fetch(u.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}

// ---------------- auth ----------------
async function requireAdmin(req: Request): Promise<{ ok: true; user: any } | { ok: false; res: Response }> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return { ok: false, res: json({ error: 'unauthorized' }, 401) };
  try {
    const r = await fetch(AUTH_ME, { headers: { Authorization: auth } });
    if (!r.ok) return { ok: false, res: json({ error: 'unauthorized' }, 401) };
    const d = await r.json();
    const role = d?.user?.role;
    if (role !== 'admin' && role !== 'super_admin') return { ok: false, res: json({ error: 'Admin access required for campaign management.' }, 403) };
    return { ok: true, user: d.user };
  } catch { return { ok: false, res: json({ error: 'auth check failed' }, 502) }; }
}

// ---------------- number pool ----------------
async function numberPool(dialCampaign: string) {
  const client = sb();
  const today = new Date().toISOString().slice(0, 10);
  const { data: nums } = await client.from('dial_numbers').select('number, region, active, daily_cap').eq('campaign', dialCampaign).order('region');
  const { data: cnts } = await client.from('dial_counters').select('number, count').eq('day', today);
  const usage = new Map((cnts || []).map((c: any) => [c.number, c.count]));
  return (nums || []).map((n: any) => ({ number: n.number, region: n.region, active: n.active, cap: n.daily_cap, used: usage.get(n.number) || 0, remaining: Math.max(0, n.daily_cap - (usage.get(n.number) || 0)) }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const client = sb();

  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.res;
  const user = gate.user;

  const body: any = (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') ? await req.json().catch(() => ({})) : {};
  const str = (k: string) => url.searchParams.get(k) || (body as any)[k] || '';

  try {
    // ---- bootstrap: pool + agents + field map + campaigns + the admin's visible workspaces ----
    if (action === 'bootstrap') {
      const { data: campaigns } = await client.from('dispatch_campaigns').select('*').order('created_at', { ascending: false });
      const pool = await numberPool('pitman');
      const agents = [
        { id: ADRIAN_AGENT, name: 'Adrian — Off-Market Seller Acquisition', premade: true, description: 'Warm cold-call acquisition agent with deep discovery, rebuttals, price ladder, appraisal pivot and written-offer close. Published & live.' },
      ];
      let workspaces: any[] = [];
      try {
        const wr = await fetch(ANALYTICS_API + '?action=bootstrap', { headers: { Authorization: req.headers.get('authorization') || '' } });
        if (wr.ok) { const wd = await wr.json(); workspaces = wd?.workspaces || []; }
      } catch { /* non-fatal */ }
      return json({ user: { name: user.name, role: user.role, email: user.email }, pool, agents, campaigns: campaigns || [], workspaces, twilioConfigured: !!(TW_SID && TW_TOKEN), ghlLocation: LOC });
    }

    // ---- campaigns CRUD ----
    if (action === 'campaign.save') {
      const slug = String(body.slug || body.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return json({ error: 'name required' }, 400);
      const row: any = {
        name: body.name || slug, slug, owner_email: user.email || null,
        agent_id: body.agent_id || ADRIAN_AGENT, agent_name: body.agent_name || 'Adrian — Off-Market Seller Acquisition',
        dial_campaign: body.dial_campaign || 'pitman', numbers: Array.isArray(body.numbers) ? body.numbers : [],
        daily_cap: Number(body.daily_cap) || 100, drip_batch: Number(body.drip_batch) || 25, drip_minutes: Number(body.drip_minutes) || 15,
        window_start: body.window_start || '09:00', window_end: body.window_end || '19:00', window_tz: body.window_tz || 'America/New_York',
        status: body.status || 'draft', updated_at: new Date().toISOString(),
      };
      if (body.workspace !== undefined) row.workspace = body.workspace || null;
      const { data, error } = await client.from('dispatch_campaigns').upsert(row, { onConflict: 'slug' }).select('*').maybeSingle();
      if (error) return json({ error: error.message }, 400);
      return json({ campaign: data });
    }
    if (action === 'campaign.get') {
      const { data } = await client.from('dispatch_campaigns').select('*').eq('slug', str('slug')).maybeSingle();
      if (!data) return json({ error: 'not found' }, 404);
      return json({ campaign: data });
    }
    if (action === 'campaign.delete') {
      await client.from('dispatch_campaigns').delete().eq('slug', str('slug'));
      return json({ ok: true });
    }

    // ---- leads.create: upsert one or many GHL contacts, tag campaign + unverified ----
    if (action === 'leads.create') {
      const slug = String(body.slug || '').toLowerCase();
      if (!slug) return json({ error: 'campaign slug required' }, 400);
      const rows: any[] = Array.isArray(body.leads) ? body.leads : [];
      if (rows.length === 0) return json({ error: 'no leads' }, 400);
      let added = 0, merged = 0, rejected = 0; const errors: string[] = [];
      for (const L of rows.slice(0, 2000)) {
        const phone = String(L.phone || '').trim();
        if (!/^\+?\d[\d\s().-]{6,}$/.test(phone)) { rejected++; continue; }
        const custom: any[] = [];
        if (L.address) custom.push({ id: ADDR_FIELDS[1], value: String(L.address) });
        const extra = L.customFields && typeof L.customFields === 'object' ? L.customFields : {};
        for (const [k, v] of Object.entries(extra)) { if (v != null && String(v).trim()) custom.push({ key: k, field_value: String(v) }); }
        const payload: any = {
          locationId: LOC, firstName: L.firstName || L.first_name || L.name || undefined,
          email: L.email || undefined, phone,
          tags: [campaignTag(slug), 'line type: unverified'],
          customFields: custom.length ? custom : undefined,
        };
        const r = await ghl('/contacts/upsert', { method: 'POST', body: JSON.stringify(payload) });
        if (r.ok) { if (r.json?.new === false || r.json?.contact?.dateUpdated) merged++; else added++; }
        else { rejected++; if (errors.length < 5) errors.push(`${phone}: ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`); }
        await new Promise((s) => setTimeout(s, 40));
      }
      await client.from('dispatch_campaigns').update({ lead_count: (added + merged), updated_at: new Date().toISOString() }).eq('slug', slug);
      return json({ added, merged, rejected, errors });
    }

    // ---- leads.list ----
    if (action === 'leads.list') {
      const slug = str('slug').toLowerCase();
      if (!slug) return json({ error: 'slug required' }, 400);
      const contacts = await searchByTag(campaignTag(slug), 500);
      const leads = contacts.map((c: any) => {
        const b = lineBucket(c);
        return { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.contactName || 'Unknown', phone: c.phone || '', email: c.email || '', lineType: b.type, route: b.route, status: leadStatusOf(c) };
      });
      return json({ leads, total: leads.length });
    }

    // ---- verify.status: line-type breakdown for the campaign ----
    if (action === 'verify.status') {
      const slug = str('slug').toLowerCase();
      const contacts = await searchByTag(campaignTag(slug), 500);
      const buckets: Record<string, number> = { mobile: 0, landline: 0, voip: 0, invalid: 0, other: 0, unverified: 0 };
      for (const c of contacts) buckets[lineBucket(c).type]++;
      const total = contacts.length;
      const resolved = total - buckets.unverified;
      return json({ total, resolved, unverified: buckets.unverified, buckets, pctResolved: total ? Math.round((resolved / total) * 100) : 0, twilioConfigured: !!(TW_SID && TW_TOKEN) });
    }

    // ---- verify.run: verify each unverified number via Twilio Lookup (Line Type Intelligence) and
    //      write the result into the GHL "Line Type" field the dialer reads. Resumable (batch by limit). ----
    if (action === 'verify.run') {
      if (!TW_SID || !TW_TOKEN) return json({ needsTwilio: true, error: 'Twilio is not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN as secrets on this Supabase project.' }, 400);
      const slug = str('slug').toLowerCase();
      const limit = Math.min(Number(body.limit) || 150, 400);
      const contacts = await searchByTag(campaignTag(slug), 1000);
      const pending = contacts.filter((c) => lineBucket(c).type === 'unverified');
      const batch = pending.slice(0, limit);
      const tally: Record<string, number> = { mobile: 0, landline: 0, voip: 0, invalid: 0, unknown: 0 };
      let checked = 0, updated = 0, errors = 0;
      for (const c of batch) {
        const phone = String(c.phone || '').trim();
        if (!phone) { errors++; continue; }
        let res; try { res = await twilioLineType(phone); } catch { errors++; continue; }
        checked++;
        const val = twilioToFieldValue(res);
        if (val === 'Mobile') tally.mobile++; else if (val === 'Landline') tally.landline++; else if (val === 'VoIP') tally.voip++; else if (val === 'Invalid/Wrong') tally.invalid++; else tally.unknown++;
        await ghl(`/contacts/${c.id}`, { method: 'PUT', body: JSON.stringify({ customFields: [{ id: LINE_TYPE_FIELD, value: val }] }) });
        await ghl(`/contacts/${c.id}/tags`, { method: 'DELETE', body: JSON.stringify({ tags: ['line type: unverified'] }) }).catch(() => {});
        if (val === 'Invalid/Wrong') await ghl(`/contacts/${c.id}/tags`, { method: 'POST', body: JSON.stringify({ tags: ['do not text'] }) }).catch(() => {});
        updated++;
        await new Promise((s) => setTimeout(s, 60));
      }
      const remaining = Math.max(0, pending.length - updated);
      return json({ ok: true, provider: 'twilio', checked, updated, tally, remaining, errors });
    }

    // ---- dialer passthroughs ----
    if (action === 'dial.preview') {
      const r = await dialer({ mode: 'preview', contact_id: str('contact_id') });
      return json(r.body, r.status);
    }
    if (action === 'dial.test') {
      const phone = String(body.phone || '').trim();
      if (!phone) return json({ error: 'phone required' }, 400);
      const r = await dialer({ phone, name: body.name || 'Test', address: body.address || '' });
      return json(r.body, r.status);
    }

    // ---- launch: tag verified, callable, non-suppressed leads with the queue tag (GHL drip → dialer) ----
    if (action === 'launch') {
      if (!body.confirm) return json({ error: 'confirmation required', needsConfirm: true }, 400);
      const slug = str('slug').toLowerCase();
      const contacts = await searchByTag(campaignTag(slug), 1000);
      let queued = 0, suppressed = 0, pending = 0, already = 0;
      for (const c of contacts) {
        const b = lineBucket(c);
        if (b.route === 'suppress') { suppressed++; continue; }
        if (b.route === 'pending') { pending++; continue; }
        const st = leadStatusOf(c);
        if (st === 'queued' || st === 'dialing' || st === 'completed') { already++; continue; }
        await ghl(`/contacts/${c.id}/tags`, { method: 'POST', body: JSON.stringify({ tags: [QUEUE_TAG] }) });
        queued++; await new Promise((s) => setTimeout(s, 40));
      }
      await client.from('dispatch_campaigns').update({ status: 'running', launched_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('slug', slug);
      return json({ ok: true, queued, suppressed, pending, already });
    }

    // ---- monitor: number usage + lead status counts + recent calls ----
    if (action === 'monitor') {
      const slug = str('slug').toLowerCase();
      const { data: camp } = await client.from('dispatch_campaigns').select('*').eq('slug', slug).maybeSingle();
      const pool = await numberPool(camp?.dial_campaign || 'pitman');
      const contacts = await searchByTag(campaignTag(slug), 1000);
      const status: Record<string, number> = { idle: 0, queued: 0, dialing: 0, completed: 0, suppressed: 0 };
      const lineTypes: Record<string, number> = { mobile: 0, landline: 0, voip: 0, invalid: 0, other: 0, unverified: 0 };
      for (const c of contacts) { status[leadStatusOf(c)]++; lineTypes[lineBucket(c).type]++; }
      const { data: recent } = await client.from('ai_calls').select('call_id, to_number, disposition, call_status, disconnection_reason, agent_name, started_at')
        .eq('agent_id', ADRIAN_AGENT).order('started_at', { ascending: false }).limit(25);
      return json({ campaign: camp || null, pool, status, lineTypes, total: contacts.length, recentCalls: recent || [] });
    }

    // ---- build-your-own agent (Retell create-agent from a template) ----
    if (action === 'agent.create') {
      const name = String(body.name || '').trim();
      if (!name) return json({ error: 'name required' }, 400);
      const prompt = `You are ${name}, a friendly, professional outbound voice agent representing ${body.business || 'our company'}. ` +
        `Your goal on every call: ${body.goal || 'have a helpful conversation and book interested prospects.'} ` +
        `Open the call with: "${body.opening || `Hi, this is ${name}. Do you have a quick moment?`}" ` +
        `Be warm, listen actively, handle objections gracefully, and never be pushy.`;
      const llmResp = await fetch('https://api.retellai.com/create-retell-llm', {
        method: 'POST', headers: { Authorization: `Bearer ${RETELL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ general_prompt: prompt, model: 'gpt-4o' }),
      });
      const llm = await llmResp.json().catch(() => ({}));
      if (!llmResp.ok || !llm.llm_id) return json({ error: `Retell LLM create failed: ${JSON.stringify(llm).slice(0, 200)}` }, 502);
      const agResp = await fetch('https://api.retellai.com/create-agent', {
        method: 'POST', headers: { Authorization: `Bearer ${RETELL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_name: name, response_engine: { type: 'retell-llm', llm_id: llm.llm_id }, voice_id: body.voice_id || '11labs-Adrian' }),
      });
      const ag = await agResp.json().catch(() => ({}));
      if (!agResp.ok || !ag.agent_id) return json({ error: `Retell agent create failed: ${JSON.stringify(ag).slice(0, 200)}` }, 502);
      return json({ agent_id: ag.agent_id, agent_name: name, llm_id: llm.llm_id });
    }

    return json({ error: 'unknown action' }, 404);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
