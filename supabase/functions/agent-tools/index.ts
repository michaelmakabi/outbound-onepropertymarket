// One Property Market — Outbound: agent tools (super-admin).
// Clone a proven Retell agent (its LLM prompt/config) from a source workspace into
// a target customer's Retell workspace. Additive; does not touch billing/provisioning.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sb = () => createClient(Deno.env.get('SUPABASE_URL'), SVC);

async function getUser(client, req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  if (token === SVC) return { id: 0, role: 'super_admin', name: 'service' };
  const { data: s } = await client.from('sessions').select('user_id, expires_at').eq('token', token).maybeSingle();
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const { data: u } = await client.from('users').select('id, name, role, disabled').eq('id', s.user_id).maybeSingle();
  if (!u || u.disabled) return null;
  return u;
}

async function retell(key, path, method = 'GET', body) {
  const res = await fetch(`https://api.retellai.com/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_message || data?.message || `Retell ${path} (${res.status})`);
  return data;
}
const pick = (obj, keys) => { const o = {}; for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) o[k] = obj[k]; return o; };

// ---- Standard + evolved post-call analysis fields (platform default). ----
// Additive: existing custom fields are preserved; nothing is duplicated (match by name).
const STANDARD_STATUSES = ['New lead', 'No answer attempt 1', 'No answer attempt 2', 'No answer attempt 3', 'Voicemail left', 'Call back', 'Scheduled', 'Wrong number', 'Do not call', 'Not interested', 'Tire kicker', 'Possibly interested', 'Very interested', 'Appointment booked', 'Offer sent', 'Pending negotiation', 'Offer accepted', 'Rejected', 'Deal closed successfully', 'Deal canceled'];
const STD_POST_CALL = [
  { name: 'disposition', type: 'enum', description: 'Final call disposition. Pick the single best-matching standard status.', choices: STANDARD_STATUSES },
  { name: 'notes', type: 'string', description: 'Concise summary / notes from the call.' },
  { name: 'follow_up_action', type: 'string', description: 'The next follow-up action to take, if any (else empty).' },
  { name: 'follow_up_date', type: 'string', description: 'Follow-up date in ISO format YYYY-MM-DD, if any (else empty).' },
  { name: 'appointment_datetime', type: 'string', description: 'Appointment date-time in ISO 8601 YYYY-MM-DDTHH:MM, if an appointment was booked (else empty).' },
];
function mergePostCall(existing) {
  const out = Array.isArray(existing) ? existing.map((f) => ({ ...f })) : [];
  const byName = {};
  for (const f of out) if (f && f.name) byName[f.name] = f;
  for (const sf of STD_POST_CALL) {
    if (!byName[sf.name]) { out.push({ ...sf }); continue; }
    if (sf.name === 'disposition' && byName.disposition.type === 'enum') {
      const ch = Array.isArray(byName.disposition.choices) ? byName.disposition.choices : [];
      const missing = STANDARD_STATUSES.filter((c) => !ch.includes(c));
      if (missing.length) byName.disposition.choices = ch.concat(missing);
    }
  }
  return out;
}
function deriveAgentType(name, prompt) {
  const s = (String(name || '') + ' ' + String(prompt || '')).toLowerCase();
  if (/negotiat/.test(s)) return 'negotiator';
  if (/inbound|reception|front[-\s]?desk|answering\s+service/.test(s)) return 'inbound';
  if (/concierge|assistant|customer\s+care|customer\s+support|success/.test(s)) return 'concierge';
  if (/qualif|screen|intake|appointment|booking/.test(s)) return 'qualifier';
  if (/outbound|cold[-\s]?call|dial|prospect|sales|seller|acquisition/.test(s)) return 'outbound';
  return 'general';
}

async function keyFor(client, slug) {
  const { data } = await client.from('workspaces').select('slug, display_name, api_key').eq('slug', slug).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const str = (k) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };
  try {
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (user.role !== 'super_admin') return json({ error: 'forbidden: super admin only' }, 403);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    // Workspaces that have a Retell key (valid clone sources / targets).
    if (action === 'workspaces') {
      const { data } = await client.from('workspaces').select('slug, display_name, api_key, status').order('slug');
      const rows = (data || []).map((w) => ({ slug: w.slug, display_name: w.display_name || w.slug, connected: !!w.api_key, status: w.status }));
      return json({ workspaces: rows });
    }

    // Agents inside a workspace (for the source picker).
    if (action === 'list_agents') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      const w = await keyFor(client, slug);
      if (!w?.api_key) return json({ error: `Workspace ${slug} has no Retell key connected.` }, 400);
      const list = await retell(w.api_key, 'list-agents');
      const seen = new Set();
      const agents = [];
      for (const a of (Array.isArray(list) ? list : [])) {
        if (a.agent_id && !seen.has(a.agent_id)) { seen.add(a.agent_id); agents.push({ agent_id: a.agent_id, agent_name: a.agent_name || a.agent_id }); }
      }
      return json({ agents });
    }

    // Clone: copy source agent's LLM + agent config into the target workspace.
    if (action === 'clone_agent') {
      const source = String(body.source_workspace || '').trim();
      const target = String(body.target_workspace || '').trim();
      const agentId = String(body.source_agent_id || '').trim();
      if (!source || !target || !agentId) return json({ error: 'source_workspace, target_workspace, and source_agent_id are required.' }, 400);
      if (source === target) return json({ error: 'Source and target workspace must be different.' }, 400);
      const sw = await keyFor(client, source);
      const tw = await keyFor(client, target);
      if (!sw?.api_key) return json({ error: `Source workspace ${source} has no Retell key.` }, 400);
      if (!tw?.api_key) return json({ error: `Target workspace ${target} has no Retell key.` }, 400);

      const agent = await retell(sw.api_key, `get-agent/${encodeURIComponent(agentId)}`);
      const llmId = agent?.response_engine?.llm_id;
      if (!llmId) return json({ error: 'Source agent is not backed by a Retell LLM (nothing to clone).' }, 400);
      const llm = await retell(sw.api_key, `get-retell-llm/${encodeURIComponent(llmId)}`);

      const llmPayload = pick(llm, ['model', 'model_temperature', 'model_high_priority', 'general_prompt', 'begin_message', 'general_tools', 'states', 'starting_state', 'default_dynamic_variables', 'tool_call_strict_mode', 'knowledge_base_ids', 'start_speaker']);

      // Platform default: an INBOUND agent speaks first with "Hello" (unless business /
      // customer-service type, or caller opts out). Only fills a blank greeting.
      const newName = String(body.new_name || agent.agent_name || '');
      const type = deriveAgentType(newName, llmPayload.general_prompt);
      const isBusiness = body.business_type === true || body.customer_service === true || type === 'concierge';
      const wantInbound = type === 'inbound' || body.inbound === true;
      if (wantInbound && !isBusiness) {
        if (!llmPayload.begin_message || !String(llmPayload.begin_message).trim()) llmPayload.begin_message = 'Hello';
        llmPayload.start_speaker = 'agent';
      }

      const newLlm = await retell(tw.api_key, 'create-retell-llm', 'POST', llmPayload);

      const agentPayload = {
        response_engine: { type: 'retell-llm', llm_id: newLlm.llm_id },
        agent_name: String(body.new_name || (agent.agent_name ? `${agent.agent_name} (clone)` : 'Cloned agent')),
        ...pick(agent, ['voice_id', 'voice_model', 'fallback_voice_ids', 'voice_temperature', 'voice_speed', 'volume', 'language', 'responsiveness', 'interruption_sensitivity', 'enable_backchannel', 'backchannel_frequency', 'backchannel_words', 'reminder_trigger_ms', 'reminder_max_count', 'ambient_sound', 'ambient_sound_volume', 'normalize_for_speech', 'end_call_after_silence_ms', 'max_call_duration_ms', 'begin_message_delay_ms', 'ring_duration_ms', 'stt_mode', 'pronunciation_dictionary']),
        // Inherit standard + evolved disposition/follow-up capture fields (additive).
        post_call_analysis_data: mergePostCall(agent.post_call_analysis_data),
      };
      if (!agentPayload.voice_id) return json({ error: 'Source agent has no voice_id; cannot create the target agent.' }, 400);
      const newAgent = await retell(tw.api_key, 'create-agent', 'POST', agentPayload);

      await client.from('billing_audit_log').insert({ actor_user_id: user.id || null, action: 'agent_cloned', entity_type: 'agent', entity_ref: target, detail: { source, source_agent_id: agentId, target, new_agent_id: newAgent.agent_id, new_llm_id: newLlm.llm_id, name: agentPayload.agent_name, inbound_default_applied: wantInbound && !isBusiness } }).then(() => {}, () => {});
      return json({ ok: true, agent_id: newAgent.agent_id, agent_name: newAgent.agent_name || agentPayload.agent_name, llm_id: newLlm.llm_id, inbound_default_applied: wantInbound && !isBusiness });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
