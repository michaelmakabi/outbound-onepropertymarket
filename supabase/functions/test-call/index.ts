// One Property Market — Outbound: TEST AI backend.
// Places a live test call to any number using any agent the caller can access, with a
// fully-editable mock contact. Standalone from `opm`/`api`; same opaque-bearer session
// auth. Reads each workspace's OWN Retell key from workspaces.api_key (service role).
//
// Actions:
//   GET  ?action=workspaces                -> workspaces the caller can access
//   GET  ?action=agents&workspace=<slug>   -> agents in that workspace (LIVE from Retell + local, access-scoped)
//   GET  ?action=agents_detailed&workspace=<slug> -> agents with derived type, description, voice, prompt
//   GET  ?action=agent_full&workspace=<slug>&agent_id=<id> -> ALL editable agent + LLM fields (for the editor)
//   GET  ?action=list_voices&workspace=<slug>     -> Retell voices [{voice_id, voice_name, gender, preview_audio_url, provider, accent}]
//   GET  ?action=list_kbs&workspace=<slug>        -> Retell knowledge bases [{kb_id, name}]
//   GET  ?action=numbers&workspace=<slug>  -> caller-ID numbers in that workspace (from Retell)
//   GET  ?action=agent_prompt_vars&workspace=<slug>&agent_id=<id> -> general_prompt + detected {{vars}}
//   GET  ?action=list_templates&workspace=<slug>  -> saved Test-AI templates for that workspace
//   POST ?action=save_template             -> upsert a Test-AI template { id?, workspace, name, agent_id?, config }
//   POST ?action=delete_template           -> delete a template { id }
//   POST ?action=update_agent              -> (admin) push edits to Retell { workspace, agent_id, name?, general_prompt?, voice_id?, agent?{}, llm?{} }
//   POST ?action=clone_agent               -> copy an agent within the same workspace { workspace, agent_id, new_name? }
//   POST ?action=assign_number             -> (admin) bind a number's inbound+outbound agents as a matched pair { workspace, phone, outbound_agent_id, inbound_agent_id }
//   POST ?action=call                      -> place an immediate outbound test call
//        body: { workspace, agent_id, to_number, from_number?, dynamic_variables?, metadata? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const sb = () => createClient(Deno.env.get('SUPABASE_URL'), SVC);
const RETELL = 'https://api.retellai.com';

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

async function accessMap(client, user) {
  if (user.role === 'super_admin' || user.role === 'admin' || user.id === 0) return 'ALL';
  const { data } = await client.from('user_workspace_access').select('workspace, agent_mode, agent_ids').eq('user_id', user.id);
  const map = {};
  for (const r of data || []) map[r.workspace] = { mode: r.agent_mode || 'all', ids: Array.isArray(r.agent_ids) ? r.agent_ids : [] };
  return map;
}
function canWorkspace(acc, slug) { return acc === 'ALL' || !!acc[slug]; }
function canAgent(acc, slug, agentId) {
  if (acc === 'ALL') return true;
  const r = acc[slug]; if (!r) return false;
  if (r.mode === 'only') return r.ids.includes(agentId);
  if (r.mode === 'except') return !r.ids.includes(agentId);
  return true;
}

async function wsKey(client, slug) {
  const { data } = await client.from('workspaces').select('api_key').eq('slug', slug).maybeSingle();
  return data?.api_key || null;
}
async function retell(key, path, method = 'GET', body) {
  const res = await fetch(RETELL + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
function e164(raw) {
  const s = String(raw || '').trim();
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return '+' + d;
}

// ---- Agent-directory helpers (Feature: customer-facing AI Agents tab) ----
const pick = (obj, keys) => { const o = {}; for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) o[k] = obj[k]; return o; };
const DEFAULT_DESC = {
  negotiator: 'Negotiates price and terms and moves deals toward a close.',
  inbound: 'Answers inbound calls and handles or routes each caller.',
  outbound: 'Places outbound calls to prospect and qualify leads.',
  concierge: 'A friendly concierge that assists callers and books follow-ups.',
  qualifier: 'Screens and qualifies leads before hand-off.',
  general: 'A conversational AI voice agent for this workspace.',
};
function deriveAgentType(name, prompt) {
  const s = (String(name || '') + ' ' + String(prompt || '')).toLowerCase();
  if (/negotiat/.test(s)) return 'negotiator';
  if (/inbound|reception|front[-\s]?desk|answering\s+service/.test(s)) return 'inbound';
  if (/concierge|assistant|customer\s+care|customer\s+support|success/.test(s)) return 'concierge';
  if (/qualif|screen|intake|appointment|booking/.test(s)) return 'qualifier';
  if (/outbound|cold[-\s]?call|dial|prospect|sales|seller|acquisition/.test(s)) return 'outbound';
  return 'general';
}
function firstPromptLine(s) {
  const lines = String(s || '').replace(/\r/g, '').split('\n').map((x) => x.trim());
  for (const ln of lines) {
    if (!ln) continue;
    if (/^[#*\-=`>|]/.test(ln)) continue;
    const clean = ln.replace(/[#*`_>]/g, '').trim();
    if (clean.length >= 12) return clean.length > 180 ? clean.slice(0, 177) + '…' : clean;
  }
  return '';
}

// ---- Standard + evolved post-call analysis fields (platform default). ----
// Every agent should capture these so dispositions + follow-ups flow into the CRM.
// Applied ADDITIVELY: existing custom fields are preserved and never duplicated (match by name).
const STANDARD_STATUSES = ['New lead', 'No answer attempt 1', 'No answer attempt 2', 'No answer attempt 3', 'Voicemail left', 'Call back', 'Scheduled', 'Wrong number', 'Do not call', 'Not interested', 'Tire kicker', 'Possibly interested', 'Very interested', 'Appointment booked', 'Offer sent', 'Pending negotiation', 'Offer accepted', 'Rejected', 'Deal closed successfully', 'Deal canceled'];
const STD_POST_CALL = [
  { name: 'disposition', type: 'enum', description: 'Final call disposition. Pick the single best-matching standard status.', choices: STANDARD_STATUSES },
  { name: 'notes', type: 'string', description: 'Concise summary / notes from the call.' },
  { name: 'follow_up_action', type: 'string', description: 'The next follow-up action to take, if any (else empty).' },
  { name: 'follow_up_date', type: 'string', description: 'Follow-up date in ISO format YYYY-MM-DD, if any (else empty).' },
  { name: 'appointment_datetime', type: 'string', description: 'Appointment date-time in ISO 8601 YYYY-MM-DDTHH:MM, if an appointment was booked (else empty).' },
];
// Merge the standard+evolved fields into an agent's existing post_call_analysis_data.
function mergePostCall(existing) {
  const out = Array.isArray(existing) ? existing.map((f) => ({ ...f })) : [];
  const byName = {};
  for (const f of out) if (f && f.name) byName[f.name] = f;
  for (const sf of STD_POST_CALL) {
    if (!byName[sf.name]) { out.push({ ...sf }); continue; }
    // Ensure an existing `disposition` enum contains all 20 standard choices (union, additive).
    if (sf.name === 'disposition' && byName.disposition.type === 'enum') {
      const ch = Array.isArray(byName.disposition.choices) ? byName.disposition.choices : [];
      const missing = STANDARD_STATUSES.filter((c) => !ch.includes(c));
      if (missing.length) byName.disposition.choices = ch.concat(missing);
    }
  }
  return out;
}

// ---- Full-editor field whitelists (never include pricing fields) ----
// Agent-level fields go to /update-agent. LLM-level fields go to /update-retell-llm.
const AGENT_FIELDS = [
  'voice_id', 'voice_model', 'voice_speed', 'voice_temperature', 'volume', 'language',
  'responsiveness', 'interruption_sensitivity', 'enable_backchannel', 'backchannel_frequency',
  'backchannel_words', 'reminder_trigger_ms', 'reminder_max_count', 'ambient_sound',
  'ambient_sound_volume', 'normalize_for_speech', 'end_call_after_silence_ms',
  'max_call_duration_ms', 'begin_message_delay_ms', 'ring_duration_ms', 'stt_mode',
  'denoising_mode', 'boosted_keywords', 'webhook_url', 'post_call_analysis_data',
];
const LLM_FIELDS = ['general_prompt', 'begin_message', 'model', 'model_temperature', 'knowledge_base_ids'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const str = (k) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };
  try {
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const acc = await accessMap(client, user);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (action === 'workspaces') {
      const { data: all } = await client.from('workspaces').select('slug, display_name, status, sort_order').order('sort_order');
      const rows = (all || []).filter((w) => canWorkspace(acc, w.slug)).map((w) => ({ slug: w.slug, display_name: w.display_name || w.slug }));
      return json({ workspaces: rows });
    }

    if (action === 'agents') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const byId = {};
      const key = await wsKey(client, slug);
      let live_ok = false, live_error = null;
      if (key) {
        const r = await retell(key, '/list-agents');
        if (r.ok && Array.isArray(r.data)) {
          live_ok = true;
          for (const a of r.data) {
            const id = a.agent_id; if (!id) continue;
            const nm = a.agent_name || a.response_engine?.llm_id || id;
            byId[id] = { agent_id: id, agent_name: nm, voice_id: a.voice_id || null, language: a.language || null, live: true };
          }
        } else { live_error = r.data; }
      }
      const { data: localRows } = await client.from('agents').select('agent_id, agent_name').eq('workspace', slug);
      for (const a of localRows || []) { if (!byId[a.agent_id]) byId[a.agent_id] = { agent_id: a.agent_id, agent_name: a.agent_name || a.agent_id, live: false }; }
      const rows = Object.values(byId)
        .filter((a) => canAgent(acc, slug, a.agent_id))
        .sort((a, b) => String(a.agent_name).localeCompare(String(b.agent_name)));
      return json({ agents: rows, live: live_ok, ...(live_error ? { live_error } : {}) });
    }

    if (action === 'agents_detailed') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const key = await wsKey(client, slug);
      const byId = {};
      if (key) {
        const r = await retell(key, '/list-agents');
        if (r.ok && Array.isArray(r.data)) {
          for (const a of r.data) {
            const id = a.agent_id; if (!id) continue;
            byId[id] = {
              agent_id: id,
              agent_name: a.agent_name || id,
              voice_id: a.voice_id || null,
              language: a.language || null,
              llm_id: a.response_engine?.llm_id || null,
              engine_type: a.response_engine?.type || null,
              general_prompt: '',
              live: true,
            };
          }
        }
      }
      const { data: localRows } = await client.from('agents').select('agent_id, agent_name').eq('workspace', slug);
      for (const a of localRows || []) {
        if (!byId[a.agent_id]) byId[a.agent_id] = { agent_id: a.agent_id, agent_name: a.agent_name || a.agent_id, voice_id: null, language: null, llm_id: null, engine_type: null, general_prompt: '', live: false };
      }
      const list = Object.values(byId).filter((a) => canAgent(acc, slug, a.agent_id));
      if (key) {
        await Promise.all(list.map(async (a) => {
          if (!a.llm_id) return;
          const lr = await retell(key, '/get-retell-llm/' + a.llm_id);
          if (lr.ok) a.general_prompt = lr.data?.general_prompt || '';
        }));
      }
      for (const a of list) {
        a.type = deriveAgentType(a.agent_name, a.general_prompt);
        a.description = firstPromptLine(a.general_prompt) || DEFAULT_DESC[a.type] || DEFAULT_DESC.general;
      }
      list.sort((a, b) => String(a.agent_name).localeCompare(String(b.agent_name)));
      return json({ agents: list, live: !!key });
    }

    // ---- Full editable snapshot of ONE agent (agent settings + its LLM settings) ----
    if (action === 'agent_full') {
      const slug = str('workspace');
      const agentId = str('agent_id');
      if (!slug || !agentId) return json({ error: 'workspace and agent_id required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      if (!canAgent(acc, slug, agentId)) return json({ error: 'forbidden: agent' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const ar = await retell(key, '/get-agent/' + agentId);
      if (!ar.ok) return json({ error: 'retell get-agent: ' + JSON.stringify(ar.data) }, 502);
      const a = ar.data || {};
      const eng = a.response_engine || {};
      const llmId = eng.llm_id || null;
      const agentOut = { agent_id: agentId, agent_name: a.agent_name || agentId };
      for (const f of AGENT_FIELDS) if (a[f] !== undefined) agentOut[f] = a[f];
      let llmOut = null;
      if (llmId) {
        const lr = await retell(key, '/get-retell-llm/' + llmId);
        if (lr.ok) {
          llmOut = { llm_id: llmId };
          for (const f of LLM_FIELDS) if (lr.data?.[f] !== undefined) llmOut[f] = lr.data[f];
        }
      }
      return json({ ok: true, agent: agentOut, llm: llmOut, engine_type: eng.type || null, has_llm: !!llmId });
    }

    // ---- Voice catalog for the workspace (avatars + preview URLs) ----
    if (action === 'list_voices') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const r = await retell(key, '/list-voices');
      if (!r.ok) return json({ error: 'retell list-voices: ' + JSON.stringify(r.data) }, 502);
      const voices = (Array.isArray(r.data) ? r.data : []).map((v) => ({
        voice_id: v.voice_id,
        voice_name: v.voice_name || v.voice_id,
        gender: v.gender || null,
        accent: v.accent || null,
        provider: v.provider || null,
        age: v.age || null,
        avatar_url: v.avatar_url || null,
        preview_audio_url: v.preview_audio_url || null,
      }));
      return json({ voices });
    }

    // ---- Knowledge bases for the workspace ----
    if (action === 'list_kbs') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const r = await retell(key, '/list-knowledge-bases');
      if (!r.ok) return json({ error: 'retell list-knowledge-bases: ' + JSON.stringify(r.data) }, 502);
      const kbs = (Array.isArray(r.data) ? r.data : []).map((k) => ({
        kb_id: k.knowledge_base_id || k.kb_id,
        name: k.knowledge_base_name || k.name || (k.knowledge_base_id || k.kb_id),
      }));
      return json({ kbs });
    }

    if (action === 'numbers') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const r = await retell(key, '/list-phone-numbers');
      if (!r.ok) return json({ error: 'retell: ' + JSON.stringify(r.data) }, 502);
      const nums = (Array.isArray(r.data) ? r.data : []).map((n) => ({
        phone_number: n.phone_number,
        pretty: n.phone_number_pretty || n.phone_number,
        nickname: n.nickname || '',
        outbound_agent_ids: (n.outbound_agents || []).map((o) => o.agent_id),
        inbound_agent_ids: (n.inbound_agents || []).map((o) => o.agent_id),
        inbound_webhook_url: n.inbound_webhook_url || null,
      }));
      return json({ numbers: nums });
    }

    if (action === 'agent_prompt_vars') {
      const slug = str('workspace');
      const agentId = str('agent_id');
      if (!slug || !agentId) return json({ error: 'workspace and agent_id required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      if (!canAgent(acc, slug, agentId)) return json({ error: 'forbidden: agent' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const ar = await retell(key, '/get-agent/' + agentId);
      if (!ar.ok) return json({ error: 'retell: ' + JSON.stringify(ar.data) }, 502);
      const eng = ar.data?.response_engine || {};
      let prompt = '';
      const llmId = eng.llm_id || null;
      let raw = '';
      if (llmId) {
        const lr = await retell(key, '/get-retell-llm/' + llmId);
        if (lr.ok) { prompt = lr.data?.general_prompt || ''; raw = JSON.stringify(lr.data || {}); }
        else { raw = JSON.stringify(ar.data || {}); }
      } else if (eng.conversation_flow_id) {
        const cr = await retell(key, '/get-conversation-flow/' + eng.conversation_flow_id);
        if (cr.ok) { prompt = cr.data?.global_prompt || ''; raw = JSON.stringify(cr.data || {}); }
        else { raw = JSON.stringify(ar.data || {}); }
      } else {
        raw = JSON.stringify(ar.data || {});
      }
      const found = new Set();
      const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|[^}]*)?\}\}/g;
      let m;
      while ((m = re.exec(raw)) !== null) found.add(m[1]);
      const reserved = new Set(['current_time', 'current_date', 'current_timestamp', 'current_time_utc', 'current_agent_name']);
      const variables = [...found].filter((v) => !reserved.has(v)).sort();
      return json({ ok: true, agent_id: agentId, llm_id: llmId, general_prompt: prompt, variables, engine_type: eng.type || null });
    }

    if (action === 'list_templates') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const { data } = await client.from('test_templates').select('*').eq('workspace', slug).order('updated_at', { ascending: false });
      return json({ templates: data || [] });
    }
    if (action === 'save_template' && req.method === 'POST') {
      const slug = String(body.workspace || '').trim();
      const name = String(body.name || '').trim();
      if (!slug || !name) return json({ error: 'workspace and name required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const row = {
        workspace: slug, name,
        agent_id: body.agent_id ? String(body.agent_id) : null,
        config: (body.config && typeof body.config === 'object' && !Array.isArray(body.config)) ? body.config : {},
        updated_at: new Date().toISOString(),
      };
      if (body.id) {
        const { data, error } = await client.from('test_templates').update(row).eq('id', body.id).eq('workspace', slug).select().maybeSingle();
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, template: data });
      }
      const { data, error } = await client.from('test_templates').insert({ ...row, owner_user_id: user.id || null }).select().maybeSingle();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, template: data });
    }
    if (action === 'delete_template' && req.method === 'POST') {
      if (!body.id) return json({ error: 'id required' }, 400);
      const { data: t } = await client.from('test_templates').select('workspace').eq('id', body.id).maybeSingle();
      if (t && !canWorkspace(acc, t.workspace)) return json({ error: 'forbidden' }, 403);
      await client.from('test_templates').delete().eq('id', body.id);
      return json({ ok: true });
    }

    // ---- Admin: push edits to Retell using the workspace's own key ----
    if (action === 'update_agent' && req.method === 'POST') {
      if (!(user.role === 'admin' || user.role === 'super_admin' || user.id === 0)) return json({ error: 'forbidden: admin only' }, 403);
      const slug = String(body.workspace || '').trim();
      const agentId = String(body.agent_id || '').trim();
      if (!slug || !agentId) return json({ error: 'workspace and agent_id required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden: workspace' }, 403);
      if (!canAgent(acc, slug, agentId)) return json({ error: 'forbidden: agent' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);

      const applied = [];

      const agentPatch = {};
      if (typeof body.name === 'string' && body.name.trim()) agentPatch.agent_name = body.name.trim();
      if (typeof body.voice_id === 'string' && body.voice_id.trim()) agentPatch.voice_id = body.voice_id.trim();
      if (body.agent && typeof body.agent === 'object') {
        if (typeof body.agent.agent_name === 'string' && body.agent.agent_name.trim()) agentPatch.agent_name = body.agent.agent_name.trim();
        for (const f of AGENT_FIELDS) if (body.agent[f] !== undefined) agentPatch[f] = body.agent[f];
      }
      if (Object.keys(agentPatch).length) {
        const ur = await retell(key, '/update-agent/' + agentId, 'PATCH', agentPatch);
        if (!ur.ok) return json({ error: 'retell update-agent: ' + JSON.stringify(ur.data) }, 502);
        applied.push(...Object.keys(agentPatch));
        if (agentPatch.agent_name) await client.from('agents').update({ agent_name: agentPatch.agent_name }).eq('workspace', slug).eq('agent_id', agentId).then(() => {}, () => {});
      }

      const llmPatch = {};
      if (typeof body.general_prompt === 'string') llmPatch.general_prompt = body.general_prompt;
      if (body.llm && typeof body.llm === 'object') {
        for (const f of LLM_FIELDS) if (body.llm[f] !== undefined) llmPatch[f] = body.llm[f];
      }
      if (Object.keys(llmPatch).length) {
        const ar = await retell(key, '/get-agent/' + agentId);
        if (!ar.ok) return json({ error: 'retell get-agent: ' + JSON.stringify(ar.data) }, 502);
        const llmId = ar.data?.response_engine?.llm_id || null;
        if (!llmId) return json({ error: 'This agent has no editable LLM prompt (conversation-flow agent).' }, 400);
        const lr = await retell(key, '/update-retell-llm/' + llmId, 'PATCH', llmPatch);
        if (!lr.ok) return json({ error: 'retell update-retell-llm: ' + JSON.stringify(lr.data) }, 502);
        applied.push(...Object.keys(llmPatch));
      }

      if (!applied.length) return json({ error: 'nothing to update' }, 400);
      return json({ ok: true, agent_id: agentId, applied });
    }

    if (action === 'clone_agent' && req.method === 'POST') {
      const slug = String(body.workspace || '').trim();
      const agentId = String(body.agent_id || '').trim();
      if (!slug || !agentId) return json({ error: 'workspace and agent_id required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden: workspace' }, 403);
      if (!canAgent(acc, slug, agentId)) return json({ error: 'forbidden: agent' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const ar = await retell(key, '/get-agent/' + agentId);
      if (!ar.ok) return json({ error: 'retell get-agent: ' + JSON.stringify(ar.data) }, 502);
      const agent = ar.data || {};
      const llmId = agent?.response_engine?.llm_id || null;
      if (!llmId) return json({ error: 'This agent is not backed by a Retell LLM (cannot clone).' }, 400);
      const lr = await retell(key, '/get-retell-llm/' + llmId);
      if (!lr.ok) return json({ error: 'retell get-retell-llm: ' + JSON.stringify(lr.data) }, 502);
      const llmPayload = pick(lr.data, ['model', 'model_temperature', 'model_high_priority', 'general_prompt', 'begin_message', 'general_tools', 'states', 'starting_state', 'default_dynamic_variables', 'tool_call_strict_mode', 'knowledge_base_ids', 'start_speaker']);

      // Platform default: an INBOUND agent speaks first with "Hello" (unless it is a
      // business / customer-service type, or the caller explicitly opts out). Only fills
      // a blank greeting — never clobbers a real one carried over from the source.
      const newName = String(body.new_name || agent.agent_name || '');
      const type = deriveAgentType(newName, llmPayload.general_prompt);
      const isBusiness = body.business_type === true || body.customer_service === true || type === 'concierge';
      const wantInbound = type === 'inbound' || body.inbound === true;
      if (wantInbound && !isBusiness) {
        if (!llmPayload.begin_message || !String(llmPayload.begin_message).trim()) llmPayload.begin_message = 'Hello';
        llmPayload.start_speaker = 'agent';
      }

      const nl = await retell(key, '/create-retell-llm', 'POST', llmPayload);
      if (!nl.ok) return json({ error: 'retell create-retell-llm: ' + JSON.stringify(nl.data) }, 502);
      const agentPayload = {
        response_engine: { type: 'retell-llm', llm_id: nl.data.llm_id },
        agent_name: String(body.new_name || (agent.agent_name ? `${agent.agent_name} (copy)` : 'Cloned agent')),
        ...pick(agent, ['voice_id', 'voice_model', 'fallback_voice_ids', 'voice_temperature', 'voice_speed', 'volume', 'language', 'responsiveness', 'interruption_sensitivity', 'enable_backchannel', 'backchannel_frequency', 'backchannel_words', 'reminder_trigger_ms', 'reminder_max_count', 'ambient_sound', 'ambient_sound_volume', 'normalize_for_speech', 'end_call_after_silence_ms', 'max_call_duration_ms', 'begin_message_delay_ms', 'ring_duration_ms', 'stt_mode', 'pronunciation_dictionary']),
        // Inherit standard + evolved disposition/follow-up capture fields (additive).
        post_call_analysis_data: mergePostCall(agent.post_call_analysis_data),
      };
      if (!agentPayload.voice_id) return json({ error: 'Source agent has no voice_id; cannot clone.' }, 400);
      const na = await retell(key, '/create-agent', 'POST', agentPayload);
      if (!na.ok) return json({ error: 'retell create-agent: ' + JSON.stringify(na.data) }, 502);
      await client.from('agents').insert({ workspace: slug, agent_id: na.data.agent_id, agent_name: na.data.agent_name || agentPayload.agent_name }).then(() => {}, () => {});
      return json({ ok: true, agent_id: na.data.agent_id, agent_name: na.data.agent_name || agentPayload.agent_name, llm_id: nl.data.llm_id, inbound_default_applied: wantInbound && !isBusiness });
    }

    // ---- Admin: bind a number's inbound + outbound agents as a MATCHED PAIR. ----
    // Platform rule: a number that is an agent's outbound caller-ID must also be the
    // inbound number for the matching inbound agent. One number = exactly one use-case
    // pair (no cross-wiring). Uses Retell's weighted inbound_agents/outbound_agents.
    if (action === 'assign_number' && req.method === 'POST') {
      if (!(user.role === 'admin' || user.role === 'super_admin' || user.id === 0)) return json({ error: 'forbidden: admin only' }, 403);
      const slug = String(body.workspace || '').trim();
      const phone = e164(body.phone || '');
      const outboundId = String(body.outbound_agent_id || '').trim();
      const inboundId = String(body.inbound_agent_id || '').trim();
      if (!slug || !phone) return json({ error: 'workspace and phone required' }, 400);
      if (!outboundId && !inboundId) return json({ error: 'at least one of outbound_agent_id / inbound_agent_id required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden: workspace' }, 403);
      if (outboundId && !canAgent(acc, slug, outboundId)) return json({ error: 'forbidden: outbound agent' }, 403);
      if (inboundId && !canAgent(acc, slug, inboundId)) return json({ error: 'forbidden: inbound agent' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);

      const patch = {};
      if (outboundId) patch.outbound_agents = [{ agent_id: outboundId, agent_version: 0, weight: 1 }];
      if (inboundId) {
        patch.inbound_agents = [{ agent_id: inboundId, agent_version: 0, weight: 1 }];
        // Keep the inbound dynamic-variables lookup wired to this number.
        if (typeof body.inbound_webhook_url === 'string' && body.inbound_webhook_url.trim()) {
          patch.inbound_webhook_url = body.inbound_webhook_url.trim();
        }
      }
      const ur = await retell(key, '/update-phone-number/' + encodeURIComponent(phone), 'PATCH', patch);
      if (!ur.ok) return json({ error: 'retell update-phone-number: ' + JSON.stringify(ur.data) }, 502);
      return json({ ok: true, phone, inbound_agent_id: inboundId || null, outbound_agent_id: outboundId || null });
    }

    if (action === 'call' && req.method === 'POST') {
      const slug = String(body.workspace || '').trim();
      const agentId = String(body.agent_id || '').trim();
      const to = e164(body.to_number || '');
      if (!slug || !agentId || !to || to.length < 11) return json({ error: 'workspace, agent_id and a valid to_number are required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden: workspace' }, 403);
      if (!canAgent(acc, slug, agentId)) return json({ error: 'forbidden: agent' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);

      let from = body.from_number ? e164(body.from_number) : '';
      if (!from) {
        const rn = await retell(key, '/list-phone-numbers');
        const list = Array.isArray(rn.data) ? rn.data : [];
        if (!list.length) return json({ error: 'no phone numbers in this workspace to call from' }, 400);
        const match = list.find((n) => (n.outbound_agents || []).some((o) => o.agent_id === agentId));
        from = (match || list[0]).phone_number;
      }

      const dv = {};
      const src = body.dynamic_variables && typeof body.dynamic_variables === 'object' ? body.dynamic_variables : {};
      for (const [k, v] of Object.entries(src)) {
        if (v === undefined || v === null) continue;
        dv[k] = typeof v === 'string' ? v : String(v);
      }

      const payload = {
        from_number: from,
        to_number: to,
        override_agent_id: agentId,
        retell_llm_dynamic_variables: dv,
        metadata: { source: 'test-ai', test: true, tested_by: user.name || 'user', ...(body.metadata || {}) },
      };
      const r = await retell(key, '/v2/create-phone-call', 'POST', payload);
      if (!r.ok) return json({ error: 'retell: ' + JSON.stringify(r.data) }, 502);
      return json({ ok: true, call_id: r.data?.call_id || null, from_number: from, to_number: to, agent_id: agentId });
    }

    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
