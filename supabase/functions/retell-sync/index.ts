// One Property Market — Outbound: Retell sync engine (reads workspace keys from DB).
// Deployed to Supabase (verify_jwt=false). Pulls all workspaces from Retell v3 list-calls,
// normalizes, upserts into `calls`, discovers `agents`, updates `sync_state`.
// Triggered every 15 min by pg_cron (mode=incremental). mode=full re-pulls history.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RETELL_BASE_URL = 'https://api.retellai.com';
interface WorkspaceConfig { slug: string; display_name: string; api_key: string; status: string; }

async function retellFetch(apiKey: string, path: string, init?: RequestInit): Promise<any> {
  const maxAttempts = 4; let lastErr = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${RETELL_BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    if (res.ok) return res.json();
    const text = await res.text(); lastErr = `${res.status} ${text.slice(0, 200)}`;
    const transient = res.status === 429 || res.status >= 500 || res.status === 400;
    if (!transient || attempt === maxAttempts) throw new Error(`Retell API ${path} failed: ${lastErr}`);
    await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
  }
  throw new Error(`Retell API ${path} failed: ${lastErr}`);
}
function extractProductCosts(cc: any) {
  if (!cc || !Array.isArray(cc.product_costs)) return [];
  return cc.product_costs.map((p: any) => ({ product: String(p.product ?? 'unknown'), cost: Number(p.cost ?? 0), unit_price: Number(p.unit_price ?? 0) }));
}
const isTts = (n: string) => n.includes('tts') || n.includes('elevenlabs') || n.includes('playht') || n.includes('cartesia') || n.includes('deepgram');
const isLlm = (n: string) => (isTts(n) ? false : (n.includes('gpt') || n.includes('claude') || n.includes('gemini')));
function classifyProducts(products: any[]) {
  let llm: string | null = null, tts: string | null = null;
  for (const p of [...products].sort((a, b) => b.cost - a.cost)) { const name = p.product.toLowerCase(); if (!tts && isTts(name)) tts = p.product; if (!llm && isLlm(name)) llm = p.product; }
  return { llm, tts };
}
function deriveDisposition(raw: any, analysis: any): string {
  if (analysis?.in_voicemail === true) return 'voicemail_left';
  const dr = String(raw?.disconnection_reason ?? '').toLowerCase();
  switch (dr) {
    case 'voicemail_reached': return 'voicemail_left';
    case 'dial_no_answer': return 'no_answer';
    case 'dial_busy': return 'busy';
    case 'dial_failed': case 'invalid_destination': return 'failed';
    case 'ivr_reached': return 'ivr_reached';
    case 'user_declined': return 'not_interested';
    case 'user_hangup': return 'user_hangup';
    case 'agent_hangup': return analysis?.call_successful === true ? 'completed' : 'agent_hangup';
    case 'inactivity': return 'inactivity';
    case 'machine_detected': return 'voicemail_left';
    default: return dr ? dr : 'unlabeled';
  }
}
const normDisp = (s: string) => String(s).trim().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
function normalizeCall(raw: any, workspace: string) {
  const cc = raw.call_cost ?? {}; const analysis = raw.call_analysis ?? {}; const custom = analysis.custom_analysis_data ?? {};
  const products = extractProductCosts(cc); const { llm, tts } = classifyProducts(products);
  // Business disposition, enriched: explicit custom field → job captured → spam → derived Retell reason.
  const explicitRaw = [custom.disposition, custom.Disposition, custom.call_disposition, custom.callDisposition, custom.lead_status, custom.leadStatus, custom.lead_disposition]
    .find((v) => typeof v === 'string' && v.trim());
  const jobCaptured = custom.job_captured === true || custom.jobCaptured === true || custom.appointment_booked === true;
  const isSpam = custom.is_spam === true || custom.spam === true;
  let disposition: string; let source: string;
  if (explicitRaw) { disposition = normDisp(explicitRaw); source = 'explicit'; }
  else if (jobCaptured) { disposition = 'appointment_booked'; source = 'captured'; }
  else if (isSpam) { disposition = 'spam'; source = 'spam'; }
  else { disposition = deriveDisposition(raw, analysis); source = 'derived'; }
  return {
    call_id: String(raw.call_id ?? ''), workspace,
    agent_id: raw.agent_id ?? null, agent_name: raw.agent_name ?? null,
    agent_version: typeof raw.agent_version === 'number' ? raw.agent_version : null,
    call_type: raw.call_type ?? null, direction: raw.direction ?? null, call_status: raw.call_status ?? null,
    start_timestamp: typeof raw.start_timestamp === 'number' ? raw.start_timestamp : null,
    end_timestamp: typeof raw.end_timestamp === 'number' ? raw.end_timestamp : null,
    duration_seconds: Number(cc.total_duration_seconds ?? Math.round((raw.duration_ms ?? 0) / 1000)),
    combined_cost_cents: Number(cc.combined_cost ?? 0), product_costs: products,
    disposition, disposition_source: source,
    custom_data: (custom && typeof custom === 'object') ? custom : null,
    job_captured: jobCaptured, is_spam: isSpam,
    user_sentiment: analysis.user_sentiment ?? null,
    call_successful: typeof analysis.call_successful === 'boolean' ? analysis.call_successful : null,
    in_voicemail: typeof analysis.in_voicemail === 'boolean' ? analysis.in_voicemail : null,
    disconnection_reason: raw.disconnection_reason ?? null,
    from_number: raw.from_number ?? null, to_number: raw.to_number ?? null,
    llm_product: llm, tts_product: tts,
    recording_url: raw.recording_url ?? null, public_log_url: raw.public_log_url ?? null,
    transcript: typeof raw.transcript === 'string' ? raw.transcript : null,
    transcript_object: Array.isArray(raw.transcript_object) ? raw.transcript_object : null,
    call_summary: analysis.call_summary ?? null,
  };
}
async function fetchAllCalls(ws: WorkspaceConfig, onPage: (calls: any[]) => Promise<void>, opts: { newerThanMs?: number; maxPages?: number } = {}) {
  const pageSize = 1000; const maxPages = opts.maxPages ?? 1000;
  let upperMs: number | undefined; let total = 0; let newestMs: number | null = null; let stop = false; const seen = new Set<string>();
  for (let page = 0; page < maxPages && !stop; page++) {
    const body: any = { sort_order: 'descending', limit: pageSize };
    if (upperMs != null) body.filter_criteria = { start_timestamp: { type: 'number', op: 'lt', value: upperMs } };
    const resp = await retellFetch(ws.api_key, '/v3/list-calls', { method: 'POST', body: JSON.stringify(body) });
    const items: any[] = Array.isArray(resp?.items) ? resp.items : [];
    if (items.length === 0) break;
    const normalized: any[] = []; let minTs = Infinity;
    for (const it of items) {
      const n = normalizeCall(it, ws.slug);
      if (n.start_timestamp != null && n.start_timestamp < minTs) minTs = n.start_timestamp;
      if (n.start_timestamp && (newestMs === null || n.start_timestamp > newestMs)) newestMs = n.start_timestamp;
      if (opts.newerThanMs != null && n.start_timestamp != null && n.start_timestamp <= opts.newerThanMs) { stop = true; break; }
      if (seen.has(n.call_id)) continue; seen.add(n.call_id); normalized.push(n);
    }
    if (normalized.length > 0) { await onPage(normalized); total += normalized.length; }
    if (items.length < pageSize || !isFinite(minTs)) break;
    upperMs = minTs;
  }
  return { total, newestMs };
}
Deno.serve(async (req) => {
  const secret = Deno.env.get('SYNC_SECRET');
  if (secret && req.headers.get('x-sync-secret') !== secret) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const url = new URL(req.url);
  const mode = (url.searchParams.get('mode') === 'full' ? 'full' : 'incremental') as 'full' | 'incremental';
  const onlyWs = url.searchParams.get('workspace');
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let q = supabase.from('workspaces').select('slug, display_name, api_key, status');
  if (onlyWs) q = q.eq('slug', onlyWs);
  const { data: workspaces, error: wsErr } = await q;
  if (wsErr) return new Response(JSON.stringify({ error: wsErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  if (!workspaces || workspaces.length === 0) return new Response(JSON.stringify({ error: 'No workspaces configured.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const results: any[] = [];
  for (const ws of workspaces as WorkspaceConfig[]) {
    try {
      let newerThanMs: number | undefined;
      if (mode === 'incremental') { const { data } = await supabase.from('sync_state').select('newest_call_ms').eq('workspace', ws.slug).maybeSingle(); newerThanMs = data?.newest_call_ms ?? undefined; }
      const agentSeen = new Map<string, { name: string | null; ms: number }>();
      const { total, newestMs } = await fetchAllCalls(ws, async (page) => {
        const { error } = await supabase.from('calls').upsert(page, { onConflict: 'call_id' });
        if (error) throw new Error(error.message);
        for (const c of page) { if (c.agent_id) { const prev = agentSeen.get(c.agent_id); const ms = c.start_timestamp ?? 0; if (!prev || ms > prev.ms) agentSeen.set(c.agent_id, { name: c.agent_name, ms }); } }
      }, { newerThanMs });
      if (agentSeen.size > 0) {
        const rows = Array.from(agentSeen.entries()).map(([agent_id, v]) => ({ workspace: ws.slug, agent_id, agent_name: v.name, last_seen_ms: v.ms }));
        await supabase.from('agents').upsert(rows, { onConflict: 'workspace,agent_id' });
      }
      await supabase.from('sync_state').upsert({ workspace: ws.slug, last_synced_at: Date.now(), ...(newestMs != null ? { newest_call_ms: newestMs } : {}), last_status: `ok:${total}`, updated_at: new Date().toISOString() }, { onConflict: 'workspace' });
      results.push({ workspace: ws.slug, fetched: total, status: 'ok' });
    } catch (e) {
      const message = String((e as any)?.message ?? e).slice(0, 200);
      await supabase.from('sync_state').upsert({ workspace: ws.slug, last_status: `error:${message}`, updated_at: new Date().toISOString() }, { onConflict: 'workspace' });
      results.push({ workspace: ws.slug, fetched: 0, status: 'error', message });
    }
  }
  return new Response(JSON.stringify({ mode, results, totalFetched: results.reduce((s, r) => s + r.fetched, 0) }), { headers: { 'Content-Type': 'application/json' } });
});
