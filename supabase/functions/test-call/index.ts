// One Property Market — Outbound: TEST AI backend.
// Places a live test call to any number using any agent the caller can access, with a
// fully-editable mock contact. Standalone from `opm`/`api`; same opaque-bearer session
// auth. Reads each workspace's OWN Retell key from workspaces.api_key (service role).
//
// Deployed with verify_jwt=false (auth is the opaque bearer session, like `opm`/`api`).
//
// Actions:
//   GET  ?action=workspaces                -> workspaces the caller can access
//   GET  ?action=agents&workspace=<slug>   -> agents in that workspace (access-scoped)
//   GET  ?action=numbers&workspace=<slug>  -> caller-ID numbers in that workspace (from Retell)
//   POST ?action=call                      -> place an immediate outbound test call
//        body: { workspace, agent_id, to_number, from_number?, dynamic_variables?, metadata? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, SVC);
const RETELL = 'https://api.retellai.com';

async function getUser(client: any, req: Request) {
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

// Access model (mirrors the `api` function): super_admin/admin see everything; every
// other user is limited to their user_workspace_access rows, with per-agent scoping.
async function accessMap(client: any, user: any): Promise<Record<string, { mode: string; ids: string[] }> | 'ALL'> {
  if (user.role === 'super_admin' || user.role === 'admin' || user.id === 0) return 'ALL';
  const { data } = await client.from('user_workspace_access').select('workspace, agent_mode, agent_ids').eq('user_id', user.id);
  const map: Record<string, { mode: string; ids: string[] }> = {};
  for (const r of data || []) map[r.workspace] = { mode: r.agent_mode || 'all', ids: Array.isArray(r.agent_ids) ? r.agent_ids : [] };
  return map;
}
function canWorkspace(acc: any, slug: string) { return acc === 'ALL' || !!acc[slug]; }
function canAgent(acc: any, slug: string, agentId: string) {
  if (acc === 'ALL') return true;
  const r = acc[slug]; if (!r) return false;
  if (r.mode === 'only') return r.ids.includes(agentId);
  if (r.mode === 'except') return !r.ids.includes(agentId);
  return true;
}

async function wsKey(client: any, slug: string): Promise<string | null> {
  const { data } = await client.from('workspaces').select('api_key').eq('slug', slug).maybeSingle();
  return data?.api_key || null;
}
async function retell(key: string, path: string, method = 'GET', body?: any) {
  const res = await fetch(RETELL + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
// Normalize a US number to E.164 (+1XXXXXXXXXX). Leaves already-+ numbers as-is.
function e164(raw: string): string {
  const s = String(raw || '').trim();
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return '+' + d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const str = (k: string) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };
  try {
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const acc = await accessMap(client, user);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (action === 'workspaces') {
      const { data: all } = await client.from('workspaces').select('slug, display_name, status, sort_order').order('sort_order');
      const rows = (all || []).filter((w: any) => canWorkspace(acc, w.slug)).map((w: any) => ({ slug: w.slug, display_name: w.display_name || w.slug }));
      return json({ workspaces: rows });
    }

    if (action === 'agents') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const { data } = await client.from('agents').select('agent_id, agent_name, last_seen_ms').eq('workspace', slug).order('agent_name');
      const rows = (data || []).filter((a: any) => canAgent(acc, slug, a.agent_id))
        .map((a: any) => ({ agent_id: a.agent_id, agent_name: a.agent_name || a.agent_id }));
      return json({ agents: rows });
    }

    if (action === 'numbers') {
      const slug = str('workspace');
      if (!slug) return json({ error: 'workspace required' }, 400);
      if (!canWorkspace(acc, slug)) return json({ error: 'forbidden' }, 403);
      const key = await wsKey(client, slug);
      if (!key) return json({ error: 'workspace has no Retell key' }, 400);
      const r = await retell(key, '/list-phone-numbers');
      if (!r.ok) return json({ error: 'retell: ' + JSON.stringify(r.data) }, 502);
      const nums = (Array.isArray(r.data) ? r.data : []).map((n: any) => ({
        phone_number: n.phone_number,
        pretty: n.phone_number_pretty || n.phone_number,
        nickname: n.nickname || '',
        outbound_agent_ids: (n.outbound_agents || []).map((o: any) => o.agent_id),
      }));
      return json({ numbers: nums });
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

      // Resolve the caller-ID (from) number: use the one supplied, else prefer a
      // number whose outbound agent is the one being tested, else the first number.
      let from = body.from_number ? e164(body.from_number) : '';
      if (!from) {
        const rn = await retell(key, '/list-phone-numbers');
        const list = Array.isArray(rn.data) ? rn.data : [];
        if (!list.length) return json({ error: 'no phone numbers in this workspace to call from' }, 400);
        const match = list.find((n: any) => (n.outbound_agents || []).some((o: any) => o.agent_id === agentId));
        from = (match || list[0]).phone_number;
      }

      // Sanitize dynamic variables to strings (Retell requires string values).
      const dv: Record<string, string> = {};
      const src = body.dynamic_variables && typeof body.dynamic_variables === 'object' ? body.dynamic_variables : {};
      for (const [k, v] of Object.entries(src)) {
        if (v === undefined || v === null) continue;
        dv[k] = typeof v === 'string' ? v : String(v);
      }

      const payload: any = {
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
