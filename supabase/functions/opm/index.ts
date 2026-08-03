// One Property Market — Outbound: Pitman leads / per-phone contacts / pipelines API.
// Isolated from the existing `api` function. Same opaque-bearer session auth.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, SVC);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const str = (k: string) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };
  const ws = str('workspace') || 'pitman';
  try {
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};

    if (action === 'pipelines') {
      const { data: pipes } = await client.from('opm_pipelines').select('*').eq('workspace', ws).eq('archived', false).order('sort_order');
      const { data: stages } = await client.from('opm_stages').select('*').order('sort_order');
      const { data: counts } = await client.from('opm_leads').select('stage_id').eq('workspace', ws);
      const cmap: Record<string, number> = {};
      for (const r of counts || []) if (r.stage_id) cmap[r.stage_id] = (cmap[r.stage_id] || 0) + 1;
      const out = (pipes || []).map((p: any) => ({ ...p, stages: (stages || []).filter((s: any) => s.pipeline_id === p.id).map((s: any) => ({ ...s, leadCount: cmap[s.id] || 0 })) }));
      return json({ pipelines: out });
    }
    if (action === 'save_pipeline' && req.method === 'POST') {
      if (body.id) { await client.from('opm_pipelines').update({ name: body.name, sort_order: body.sort_order }).eq('id', body.id); return json({ ok: true }); }
      const { data } = await client.from('opm_pipelines').insert({ workspace: ws, name: body.name, sort_order: body.sort_order || 0 }).select().maybeSingle();
      return json({ pipeline: data });
    }
    if (action === 'delete_pipeline' && req.method === 'POST') { await client.from('opm_pipelines').update({ archived: true }).eq('id', body.id); return json({ ok: true }); }
    if (action === 'save_stage' && req.method === 'POST') {
      if (body.id) { await client.from('opm_stages').update({ name: body.name, color: body.color, sort_order: body.sort_order }).eq('id', body.id); return json({ ok: true }); }
      const { data } = await client.from('opm_stages').insert({ pipeline_id: body.pipeline_id, name: body.name, color: body.color || '#64748b', sort_order: body.sort_order || 0 }).select().maybeSingle();
      return json({ stage: data });
    }
    if (action === 'delete_stage' && req.method === 'POST') { await client.from('opm_stages').delete().eq('id', body.id); return json({ ok: true }); }

    if (action === 'leads') {
      const pipeline_id = str('pipeline_id'); const stage_id = str('stage_id'); const search = str('search');
      let q = client.from('opm_leads').select('lead_id,name,crm_stage,pipeline_id,stage_id,lead_source,assigned_to,deal_price,property_ref,tags,updated_at').eq('workspace', ws).order('updated_at', { ascending: false }).limit(1000);
      if (pipeline_id) q = q.eq('pipeline_id', pipeline_id);
      if (stage_id) q = q.eq('stage_id', stage_id);
      if (search) q = q.ilike('name', `%${search}%`);
      const { data: leads } = await q;
      const ids = (leads || []).map((l: any) => l.lead_id);
      const counts: Record<string, { n: number; verified: number }> = {};
      if (ids.length) {
        const { data: cs } = await client.from('opm_contacts').select('lead_id,phone_verified').in('lead_id', ids);
        for (const c of cs || []) { const k = counts[c.lead_id] || { n: 0, verified: 0 }; k.n++; if (c.phone_verified) k.verified++; counts[c.lead_id] = k; }
      }
      return json({ leads: (leads || []).map((l: any) => ({ ...l, phoneCount: counts[l.lead_id]?.n || 0, verifiedCount: counts[l.lead_id]?.verified || 0 })) });
    }

    if (action === 'lead') {
      const id = str('id'); if (!id) return json({ error: 'id required' }, 400);
      const { data: lead } = await client.from('opm_leads').select('*').eq('lead_id', id).maybeSingle();
      if (!lead) return json({ error: 'not found' }, 404);
      const { data: contacts } = await client.from('opm_contacts').select('*').eq('lead_id', id).order('contact_kind').order('is_primary_number', { ascending: false });
      const { data: notes } = await client.from('opm_notes').select('*').eq('lead_id', id).order('ts', { ascending: false, nullsFirst: false }).order('id', { ascending: false });
      const { data: pipe } = lead.pipeline_id ? await client.from('opm_pipelines').select('name').eq('id', lead.pipeline_id).maybeSingle() : { data: null };
      const { data: stg } = lead.stage_id ? await client.from('opm_stages').select('name,color').eq('id', lead.stage_id).maybeSingle() : { data: null };
      const phones = (contacts || []).map((c: any) => String(c.phone).replace(/\D/g, '').slice(-10)).filter(Boolean);
      let calls: any[] = [];
      if (phones.length) {
        const { data: cc } = await client.from('calls').select('call_id,start_timestamp,to_number,from_number,disposition,duration_seconds,recording_url,call_summary').or(phones.map((p: string) => `to_number.ilike.%${p}%`).join(',')).limit(50);
        calls = cc || [];
      }
      return json({ lead: { ...lead, pipeline_name: pipe?.name || null, stage_name: stg?.name || null, stage_color: stg?.color || null }, contacts: contacts || [], notes: notes || [], calls });
    }

    if (action === 'move_lead' && req.method === 'POST') {
      await client.from('opm_leads').update({ stage_id: body.stage_id, pipeline_id: body.pipeline_id, updated_at: new Date().toISOString() }).eq('lead_id', body.lead_id);
      return json({ ok: true });
    }
    if (action === 'add_note' && req.method === 'POST') {
      const { data } = await client.from('opm_notes').insert({ lead_id: body.lead_id, author: user.name || 'User', note_date: new Date().toISOString().slice(0, 10), ts: new Date().toISOString(), body_text: body.text, body_html: (body.html || body.text), source: body.source || 'manual' }).select().maybeSingle();
      await client.from('opm_leads').update({ updated_at: new Date().toISOString() }).eq('lead_id', body.lead_id);
      return json({ note: data });
    }
    if (action === 'update_contact' && req.method === 'POST') {
      const patch: any = {};
      for (const k of ['phone_verified', 'is_primary_number', 'is_primary_contact', 'dialable', 'phone_channel', 'phone_label', 'do_not_call']) if (k in body) patch[k] = body[k];
      if (body.is_primary_number === true && body.lead_id) await client.from('opm_contacts').update({ is_primary_number: false }).eq('lead_id', body.lead_id);
      if (body.is_primary_contact === true && body.lead_id) await client.from('opm_contacts').update({ is_primary_contact: false }).eq('lead_id', body.lead_id);
      await client.from('opm_contacts').update(patch).eq('contact_id', body.contact_id);
      return json({ ok: true });
    }
    if (action === 'summary') {
      const { count: leadN } = await client.from('opm_leads').select('*', { count: 'exact', head: true }).eq('workspace', ws);
      const { count: cN } = await client.from('opm_contacts').select('*', { count: 'exact', head: true }).eq('workspace', ws);
      const { count: vN } = await client.from('opm_contacts').select('*', { count: 'exact', head: true }).eq('workspace', ws).eq('phone_verified', true);
      return json({ leads: leadN, contacts: cN, verified: vN });
    }
    return json({ error: 'unknown action: ' + action }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
