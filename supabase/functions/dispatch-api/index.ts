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
// Auth works two ways: (a) Account SID (AC…) + Auth Token, or (b) an API Key (SK…) + its Secret.
const TW_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_SID') || '';
const TW_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || Deno.env.get('TWILIO_TOKEN') || '';
const TW_API_KEY = Deno.env.get('TWILIO_API_KEY') || Deno.env.get('TWILIO_API_KEY_SID') || (TW_SID.startsWith('SK') ? TW_SID : '');
const TW_API_SECRET = Deno.env.get('TWILIO_API_SECRET') || Deno.env.get('TWILIO_API_KEY_SECRET') || Deno.env.get('TWILIO_ACCOUNT_CLIENT_SECRET') || '';
// Basic-auth username:password — prefer an API key when we have one + secret; else Account SID + Auth Token.
function twBasic(): string { return (TW_API_KEY && TW_API_SECRET) ? btoa(`${TW_API_KEY}:${TW_API_SECRET}`) : btoa(`${TW_SID}:${TW_TOKEN}`); }
function twConfigured(): boolean { return !!((TW_API_KEY && TW_API_SECRET) || (TW_SID && TW_TOKEN)); }

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
// --- skip-trace correlation helpers ---
// Every dialable number is its own GHL contact, tagged lead:<key> so all numbers on one
// property route back to a single master record in dispatch_lead_records.
function leadTag(key: string) { return `lead: ${key}`.toLowerCase(); }
function relTag(label: string) { return `rel: ${String(label || 'contact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`; }
function normLeadKey(address: string, owner: string) {
  const a = String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60);
  const o = String(owner || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  return a ? (o ? `${a}-${o}` : a) : o;
}
function leadKeyOf(ct: any): string { const t = tagsOf(ct).find((x) => x.startsWith('lead: ')); return t ? t.slice(6).trim() : ''; }
function digits10(p: string) { return String(p || '').replace(/\D/g, '').slice(-10); }

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
  const r = await fetch(url, { headers: { Authorization: `Basic ${twBasic()}` } });
  if (r.status === 404) return { valid: false, type: null, carrier: null }; // not a real/dialable number
  if (r.status === 401 || r.status === 403) throw new Error(`auth_${r.status}`); // bad credentials
  const j = await r.json().catch(() => ({} as any));
  if (!r.ok) throw new Error(`twilio_${r.status}:${String(j?.message || '').slice(0, 80)}`);
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
      return json({ user: { name: user.name, role: user.role, email: user.email }, pool, agents, campaigns: campaigns || [], workspaces, twilioConfigured: twConfigured(), ghlLocation: LOC });
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

    // ---- leads.create: simple one-contact-per-row path (kept for back-compat) ----
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
      return json({ total, resolved, unverified: buckets.unverified, buckets, pctResolved: total ? Math.round((resolved / total) * 100) : 0, twilioConfigured: twConfigured() });
    }

    // ---- verify.run: Twilio Lookup (Line Type Intelligence), concurrent. Mirrors each verdict +
    //      timestamp back onto the master lead record. Lookup v2 has no bulk endpoint, so throughput
    //      = concurrency: fan lookups out (only line_type_intelligence, no paid caller_name), then
    //      write to GHL through a gentler pool to respect GHL's rate limit. ----
    if (action === 'verify.run') {
      if (!twConfigured()) return json({ needsTwilio: true, error: 'Twilio is not configured. Add TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (or a Twilio API Key SID + Secret) as secrets on this Supabase project.' }, 400);
      const slug = str('slug').toLowerCase();
      const limit = Math.min(Number(body.limit) || 150, 500);
      const contacts = await searchByTag(campaignTag(slug), 2000);
      const pending = contacts.filter((c) => lineBucket(c).type === 'unverified' && String(c.phone || '').trim());
      const batch = pending.slice(0, limit);
      const tally: Record<string, number> = { mobile: 0, landline: 0, voip: 0, invalid: 0, unknown: 0 };
      let checked = 0, updated = 0, errors = 0, authError = '';

      async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
        let i = 0;
        const work = async () => { while (i < items.length && !authError) { const idx = i++; await fn(items[idx], idx); } };
        await Promise.all(Array.from({ length: Math.min(size, items.length) }, work));
      }

      // phase 1 — Twilio lookups, fanned out (network-bound)
      const looked: Array<{ valid: boolean; type: string | null; carrier: string | null } | null> = new Array(batch.length).fill(null);
      await pool(batch, 20, async (c, idx) => {
        try { looked[idx] = await twilioLineType(String(c.phone).trim()); }
        catch (e) { const m = String((e as any)?.message || e); if (m.startsWith('auth_')) { authError = m; return; } errors++; }
      });
      if (authError) return json({ authFailed: true, error: `Twilio authentication failed (${authError.replace('auth_', 'HTTP ')}). Check your Twilio secrets — use the Account SID (AC…) + Auth Token, or an API Key SID (SK…) + its Secret.` }, 400);

      // phase 2 — write verdicts into GHL + mirror onto the master record (throttled)
      await pool(batch, 5, async (c, idx) => {
        const res = looked[idx];
        if (!res) return; // lookup errored — leave unverified so it retries next run
        checked++;
        const val = twilioToFieldValue(res);
        if (val === 'Mobile') tally.mobile++; else if (val === 'Landline') tally.landline++; else if (val === 'VoIP') tally.voip++; else if (val === 'Invalid/Wrong') tally.invalid++; else tally.unknown++;
        await ghl(`/contacts/${c.id}`, { method: 'PUT', body: JSON.stringify({ customFields: [{ id: LINE_TYPE_FIELD, value: val }] }) });
        await ghl(`/contacts/${c.id}/tags`, { method: 'DELETE', body: JSON.stringify({ tags: ['line type: unverified'] }) }).catch(() => {});
        if (val === 'Invalid/Wrong') await ghl(`/contacts/${c.id}/tags`, { method: 'POST', body: JSON.stringify({ tags: ['do not text'] }) }).catch(() => {});
        const lk = leadKeyOf(c);
        if (lk) {
          const { data: rec } = await client.from('dispatch_lead_records').select('id, numbers').eq('campaign_slug', slug).eq('lead_key', lk).maybeSingle();
          if (rec) {
            const d10 = digits10(c.phone);
            const nums = (rec.numbers || []).map((n: any) => digits10(n.phone) === d10 ? { ...n, line_type: val, verified_at: new Date().toISOString() } : n);
            await client.from('dispatch_lead_records').update({ numbers: nums, updated_at: new Date().toISOString() }).eq('id', rec.id);
          }
        }
        updated++;
      });

      const remaining = Math.max(0, pending.length - updated);
      return json({ ok: true, provider: 'twilio', checked, updated, tally, remaining, errors });
    }

    // ---- leads.ingest: skip-trace aware. Each lead = one property (master record) carrying N phone
    //      numbers; we store the master in dispatch_lead_records AND explode every number into its own
    //      GHL contact tagged lead:<key> so Adrian dials each independently and results correlate back. ----
    if (action === 'leads.ingest') {
      const slug = String(body.slug || '').toLowerCase();
      if (!slug) return json({ error: 'campaign slug required' }, 400);
      const leads: any[] = Array.isArray(body.leads) ? body.leads : [];
      if (!leads.length) return json({ error: 'no leads' }, 400);
      let leadCount = 0, numCount = 0, added = 0, merged = 0, rejected = 0; const errors: string[] = [];
      for (let li = 0; li < Math.min(leads.length, 1000); li++) {
        const L = leads[li];
        const owner = L.ownerName || L.firstName || L.name || '';
        const address = L.address || '';
        const key = normLeadKey(address, owner) || `row${li}-${digits10((L.numbers?.[0]?.phone) || '') || li}`;
        const cleanNums = (Array.isArray(L.numbers) ? L.numbers : [])
          .map((n: any) => ({ phone: String(n.phone || '').trim(), label: n.label || 'Contact' }))
          .filter((n: any) => /^\+?\d[\d\s().-]{6,}$/.test(n.phone));
        // de-dupe numbers within the same lead by last-10 digits
        const seen = new Set<string>();
        const uniq = cleanNums.filter((n: any) => { const d = digits10(n.phone); if (seen.has(d)) return false; seen.add(d); return true; });
        if (!uniq.length) { rejected++; continue; }
        const numbersJson = uniq.map((n: any) => ({ phone: n.phone, label: n.label, line_type: null, verified_at: null, ghl_contact_id: null, status: 'active' }));
        await client.from('dispatch_lead_records').upsert({
          campaign_slug: slug, lead_key: key, owner_name: owner || null, address: address || null, email: L.email || null,
          raw: L.raw || {}, fields: L.fields || {}, numbers: numbersJson, notes: L.notes || null, updated_at: new Date().toISOString(),
        }, { onConflict: 'campaign_slug,lead_key' });
        leadCount++;
        const outNums = [...numbersJson];
        for (let i = 0; i < uniq.length; i++) {
          const n = uniq[i];
          const custom: any[] = [];
          if (address) custom.push({ id: ADDR_FIELDS[1], value: String(address) });
          const payload: any = {
            locationId: LOC, firstName: owner || undefined, email: i === 0 ? (L.email || undefined) : undefined, phone: n.phone,
            tags: [campaignTag(slug), leadTag(key), relTag(n.label), 'line type: unverified'],
            customFields: custom.length ? custom : undefined,
          };
          const r = await ghl('/contacts/upsert', { method: 'POST', body: JSON.stringify(payload) });
          if (r.ok) { const cid = r.json?.contact?.id || r.json?.id || null; outNums[i] = { ...outNums[i], ghl_contact_id: cid }; numCount++; if (r.json?.new === false || r.json?.contact?.dateUpdated) merged++; else added++; }
          else { rejected++; if (errors.length < 5) errors.push(`${n.phone}: ${r.status}`); }
          await new Promise((s) => setTimeout(s, 40));
        }
        await client.from('dispatch_lead_records').update({ numbers: outNums, updated_at: new Date().toISOString() }).eq('campaign_slug', slug).eq('lead_key', key);
      }
      await client.from('dispatch_campaigns').update({ lead_count: numCount, updated_at: new Date().toISOString() }).eq('slug', slug);
      return json({ ok: true, leads: leadCount, numbers: numCount, added, merged, rejected, errors });
    }

    // ---- lead.resolve: mark one number as the confirmed right person for its property, and retire
    //      the sibling numbers (stop dialing family/tenants once we've reached the owner). ----
    if (action === 'lead.resolve') {
      const slug = String(body.slug || '').toLowerCase();
      const phone = String(body.phone || '').trim();
      if (!slug || !phone) return json({ error: 'slug and phone required' }, 400);
      const d10 = digits10(phone);
      const { data: recs } = await client.from('dispatch_lead_records').select('*').eq('campaign_slug', slug);
      const targets = (recs || []).filter((r: any) => (r.numbers || []).some((n: any) => digits10(n.phone) === d10));
      if (!targets.length) return json({ error: 'no lead found for that number' }, 404);
      let confirmed = 0, retired = 0;
      for (const r of targets) {
        const nums = (r.numbers || []).map((n: any) => digits10(n.phone) === d10 ? { ...n, status: 'confirmed' } : { ...n, status: 'retired' });
        await client.from('dispatch_lead_records').update({ numbers: nums, confirmed_phone: phone, status: 'resolved', updated_at: new Date().toISOString() }).eq('id', r.id);
        for (const n of nums) {
          const cid = n.ghl_contact_id; if (!cid) continue;
          if (n.status === 'confirmed') { await ghl(`/contacts/${cid}/tags`, { method: 'POST', body: JSON.stringify({ tags: ['owner: confirmed'] }) }).catch(() => {}); confirmed++; }
          else {
            await ghl(`/contacts/${cid}/tags`, { method: 'POST', body: JSON.stringify({ tags: ['lead: not owner', 'do not text'] }) }).catch(() => {});
            await ghl(`/contacts/${cid}/tags`, { method: 'DELETE', body: JSON.stringify({ tags: [QUEUE_TAG] }) }).catch(() => {});
            retired++;
          }
        }
      }
      return json({ ok: true, leads: targets.length, confirmed, retired });
    }

    // ---- exports: two shapes of the same campaign data ----
    //      export.byLead   → one row per property, every number spread across phone_1..phone_N columns.
    //      export.byNumber → one row per number, all property context concatenated onto it.
    if (action === 'export.byLead' || action === 'export.byNumber') {
      const slug = str('slug').toLowerCase();
      const { data: recs } = await client.from('dispatch_lead_records').select('*').eq('campaign_slug', slug).order('created_at', { ascending: true });
      const { data: calls } = await client.from('ai_calls').select('to_number, disposition, call_status, duration_seconds, recording_url, started_at').eq('agent_id', ADRIAN_AGENT).order('started_at', { ascending: false }).limit(5000);
      const om = new Map<string, any>();
      for (const c of (calls || [])) { const k = digits10(c.to_number); if (k && !om.has(k)) om.set(k, c); } // first seen = most recent
      const outcome = (phone: string) => om.get(digits10(phone)) || null;

      if (action === 'export.byLead') {
        let maxN = 1; for (const r of (recs || [])) maxN = Math.max(maxN, (r.numbers || []).length);
        const rows = (recs || []).map((r: any) => {
          const row: any = { lead_key: r.lead_key, owner: r.owner_name || '', address: r.address || '', email: r.email || '', lead_status: r.status, confirmed_phone: r.confirmed_phone || '' };
          for (const [k, v] of Object.entries(r.fields || {})) row[k] = v;
          (r.numbers || []).forEach((n: any, i: number) => {
            const o = outcome(n.phone); const p = i + 1;
            row[`phone_${p}`] = n.phone; row[`phone_${p}_label`] = n.label || ''; row[`phone_${p}_type`] = n.line_type || 'unverified';
            row[`phone_${p}_verified_at`] = n.verified_at || ''; row[`phone_${p}_status`] = n.status || '';
            row[`phone_${p}_last_disposition`] = o ? (o.disposition || o.call_status || '') : ''; row[`phone_${p}_recording`] = o ? (o.recording_url || '') : '';
          });
          row.notes = r.notes || '';
          return row;
        });
        return json({ ok: true, view: 'by_lead', count: rows.length, maxNumbers: maxN, rows });
      }

      const rows: any[] = [];
      for (const r of (recs || [])) {
        for (const n of (r.numbers || [])) {
          const o = outcome(n.phone);
          const base: any = {
            phone: n.phone, relationship: n.label || '', line_type: n.line_type || 'unverified',
            textable: n.line_type === 'Mobile' ? 'yes' : (n.line_type ? 'no' : ''), verified_at: n.verified_at || '', number_status: n.status || 'active',
            owner: r.owner_name || '', address: r.address || '', email: r.email || '', lead_key: r.lead_key, lead_status: r.status, confirmed_phone: r.confirmed_phone || '',
            last_disposition: o ? (o.disposition || o.call_status || '') : '', last_call_at: o ? (o.started_at || '') : '', call_seconds: o ? (o.duration_seconds ?? '') : '', recording: o ? (o.recording_url || '') : '', notes: r.notes || '',
          };
          for (const [k, v] of Object.entries(r.fields || {})) if (!(k in base)) base[k] = v;
          rows.push(base);
        }
      }
      return json({ ok: true, view: 'by_number', count: rows.length, rows });
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
