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
  let ws = str('workspace') || 'pitman';
  try {
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};

    // ---- workspace access resolution (multi-tenancy spine) ----
    const isStaff = user.role === 'super_admin' || user.role === 'admin';
    let allowedWs: string[];
    const roleMap: Record<string, string> = {};
    if (isStaff) {
      const [{ data: lw }, { data: tn }, { data: bw }] = await Promise.all([
        client.from('opm_leads').select('workspace').limit(5000),
        client.from('tenants').select('slug,crm_workspace'),
        client.from('billing_workspaces').select('workspace_slug'),
      ]);
      const wsset = new Set<string>(['pitman']);
      for (const r of lw || []) if (r.workspace) wsset.add(r.workspace);
      for (const t of tn || []) { if (t.slug) wsset.add(t.slug); if (t.crm_workspace) wsset.add(t.crm_workspace); }
      for (const b of bw || []) if (b.workspace_slug) wsset.add(b.workspace_slug);
      allowedWs = [...wsset];
    } else {
      const { data: acc } = await client.from('user_workspace_access').select('workspace, workspace_role').eq('user_id', user.id);
      allowedWs = (acc || []).map((a: any) => a.workspace);
      for (const a of acc || []) roleMap[a.workspace] = a.workspace_role || 'member';
    }
    const requestedWs = str('workspace');
    if (requestedWs) {
      if (!isStaff && !allowedWs.includes(requestedWs)) return json({ error: 'forbidden: no access to workspace ' + requestedWs }, 403);
      ws = requestedWs;
    } else {
      ws = allowedWs.includes('pitman') ? 'pitman' : (allowedWs[0] || 'pitman');
    }

    if (action === 'workspaces') {
      const [{ data: names }, { data: tnames }, { data: bnames }] = await Promise.all([
        client.from('workspaces').select('slug,display_name'),
        client.from('tenants').select('slug,crm_workspace,display_name'),
        client.from('billing_workspaces').select('workspace_slug,display_name'),
      ]);
      const nmap: Record<string, string> = {};
      for (const n of names || []) if (n.display_name) nmap[n.slug] = n.display_name;
      for (const t of tnames || []) { if (t.display_name) { if (t.crm_workspace && !nmap[t.crm_workspace]) nmap[t.crm_workspace] = t.display_name; if (t.slug && !nmap[t.slug]) nmap[t.slug] = t.display_name; } }
      for (const b of bnames || []) if (b.display_name && !nmap[b.workspace_slug]) nmap[b.workspace_slug] = b.display_name;
      const pretty = (s: string) => nmap[s] || s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      const list = allowedWs.map((slug) => ({ slug, display_name: pretty(slug) }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
      return json({ workspaces: list, active: ws, is_staff: isStaff, roles: roleMap });
    }

    if (action === 'pipelines') {
      const { data: pipes } = await client.from('opm_pipelines').select('*').eq('workspace', ws).eq('archived', false).order('sort_order');
      const { data: stages } = await client.from('opm_stages').select('*').order('sort_order');
      const { data: counts } = await client.from('opm_leads').select('stage_id,deal_price').eq('workspace', ws);
      const cmap: Record<string, number> = {}; const vmap: Record<string, number> = {};
      for (const r of counts || []) if (r.stage_id) { cmap[r.stage_id] = (cmap[r.stage_id] || 0) + 1; vmap[r.stage_id] = (vmap[r.stage_id] || 0) + (Number(r.deal_price) || 0); }
      const out = (pipes || []).map((p: any) => ({ ...p, stages: (stages || []).filter((s: any) => s.pipeline_id === p.id).map((s: any) => ({ ...s, leadCount: cmap[s.id] || 0, valueSum: vmap[s.id] || 0 })) }));
      return json({ pipelines: out });
    }
    if (action === 'save_pipeline' && req.method === 'POST') {
      if (body.id) { await client.from('opm_pipelines').update({ name: body.name, sort_order: body.sort_order }).eq('id', body.id); return json({ ok: true }); }
      const { data } = await client.from('opm_pipelines').insert({ workspace: ws, name: body.name, sort_order: body.sort_order || 0 }).select().maybeSingle();
      return json({ pipeline: data });
    }
    if (action === 'delete_pipeline' && req.method === 'POST') { await client.from('opm_pipelines').update({ archived: true }).eq('id', body.id); return json({ ok: true }); }
    if (action === 'reorder_pipelines' && req.method === 'POST') {
      // Persist a new pipeline order for the caller's workspace. Body: { ids: number[] } (desired order).
      // The pinned "Standard 1PM Pipeline" is never moved — it stays most-negative (-1000) so it sorts first.
      const ids = Array.isArray(body.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : [];
      if (!ids.length) return json({ error: 'ids required' }, 400);
      // Scope to this workspace's live pipelines; also lets us protect the pinned one by name.
      const { data: pipes } = await client.from('opm_pipelines').select('id,name').eq('workspace', ws).eq('archived', false);
      const byId: Record<number, any> = {};
      for (const p of pipes || []) byId[p.id] = p;
      let order = 0;
      for (const id of ids) {
        const p = byId[id];
        if (!p) continue;                          // ignore ids that aren't this workspace's pipelines
        if (p.name === 'Standard 1PM Pipeline') continue; // never touch the pinned sentinel
        await client.from('opm_pipelines').update({ sort_order: order }).eq('id', id).eq('workspace', ws);
        order++;
      }
      // Force the pinned pipeline to remain first (most-negative) regardless of the submitted order.
      await client.from('opm_pipelines').update({ sort_order: -1000 }).eq('workspace', ws).eq('name', 'Standard 1PM Pipeline');
      return json({ ok: true });
    }
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
      let leadQ = client.from('opm_leads').select('*').eq('lead_id', id);
      if (!isStaff) leadQ = leadQ.eq('workspace', ws);
      const { data: lead } = await leadQ.maybeSingle();
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
      for (const k of ['phone_verified', 'is_primary_number', 'is_primary_contact', 'dialable', 'phone_channel', 'phone_label', 'do_not_call', 'name', 'related_name', 'relation_type']) if (k in body) patch[k] = body[k];
      if (body.custom && typeof body.custom === 'object') patch.custom = body.custom;
      if (Array.isArray(body.alt_names)) patch.alt_names = body.alt_names;
      if (body.is_primary_number === true && body.lead_id) await client.from('opm_contacts').update({ is_primary_number: false }).eq('lead_id', body.lead_id);
      if (body.is_primary_contact === true && body.lead_id) await client.from('opm_contacts').update({ is_primary_contact: false }).eq('lead_id', body.lead_id);
      await client.from('opm_contacts').update(patch).eq('contact_id', body.contact_id);
      return json({ ok: true });
    }
    if (action === 'contacts') {
      const kind = str('kind');
      const cs: any[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        let q = client.from('opm_contacts').select('contact_id,lead_id,name,first_name,last_name,phone,phone_channel,phone_verified,is_primary_number,do_not_call,contact_kind,related_name,relation_type,alt_names,custom').eq('workspace', ws).order('lead_id').range(from, from + 999);
        if (kind) q = q.eq('contact_kind', kind);
        const { data } = await q;
        if (!data || !data.length) break;
        cs.push(...data);
        if (data.length < 1000) break;
      }
      const leadIds = [...new Set((cs || []).map((c: any) => c.lead_id))];
      const lmap: Record<string, any> = {};
      for (let i = 0; i < leadIds.length; i += 200) {
        const chunk = leadIds.slice(i, i + 200);
        const { data: ls } = await client.from('opm_leads').select('lead_id,name,property_ref,crm_stage,pipeline_id,stage_id,assigned_to,lead_source,addresses,custom').in('lead_id', chunk);
        for (const l of ls || []) lmap[l.lead_id] = l;
      }
      // multi-workspace marker: same phone number present in more than one workspace
      const phones10 = [...new Set((cs || []).map((c: any) => String(c.phone).replace(/\D/g, '').slice(-10)).filter((p: string) => p.length === 10))];
      const multiWs: Record<string, Set<string>> = {};
      for (let i = 0; i < phones10.length; i += 150) {
        const chunk = phones10.slice(i, i + 150);
        const orf = chunk.map((p) => `phone.ilike.%${p}`).join(',');
        const { data: others } = await client.from('opm_contacts').select('phone,workspace').or(orf).limit(4000);
        for (const o of others || []) { const t = String(o.phone).replace(/\D/g, '').slice(-10); if (t.length === 10) (multiWs[t] ||= new Set()).add(o.workspace); }
      }
      const out = (cs || []).map((c: any) => {
        const l = lmap[c.lead_id] || {};
        const a = (l.addresses && l.addresses[0]) || {};
        const addr = a.Street ? `${a.Street}, ${a.City || ''} ${a.State || ''} ${a.Zip || ''}`.replace(/\s+/g, ' ').trim() : '';
        const t = String(c.phone).replace(/\D/g, '').slice(-10);
        const wsCount = multiWs[t] ? multiWs[t].size : 1;
        return { ...c, lead_name: l.name || c.name, property_ref: l.property_ref || '', crm_stage: l.crm_stage || '', pipeline_id: l.pipeline_id || null, assigned_to: l.assigned_to || '', lead_source: l.lead_source || '', address: addr, lead_custom: l.custom || {}, workspace_count: wsCount };
      });
      return json({ contacts: out });
    }
    if (action === 'add_contact' && req.method === 'POST') {
      // one-at-a-time manual add: create a lead + a single dialable contact, with custom fields.
      const phone = String(body.phone || '').replace(/\D/g, '');
      const name = String(body.name || '').trim();
      if (!name && phone.length < 10) return json({ error: 'name or a valid phone is required' }, 400);
      const lid = 'man_' + crypto.randomUUID();
      const addr = { Street: (body.street || '').trim(), City: (body.city || '').trim(), State: (body.state || '').trim(), Zip: (body.zip || '').trim() };
      const hasAddr = addr.Street || addr.City || addr.State || addr.Zip;
      const { error: le } = await client.from('opm_leads').insert({ lead_id: lid, workspace: ws, name: name || '(no name)', lead_source: body.lead_source || 'Manual', property_ref: body.property_ref || null, addresses: hasAddr ? [addr] : [], emails: body.email ? [String(body.email).trim()] : [], custom: (body.custom && typeof body.custom === 'object') ? body.custom : {}, date_added: new Date().toISOString().slice(0, 10) });
      if (le) return json({ error: le.message }, 400);
      if (phone.length >= 10) {
        await client.from('opm_contacts').insert({ contact_id: 'manc_' + crypto.randomUUID(), lead_id: lid, workspace: ws, name: name || null, phone: phone.slice(-10), phone_channel: 'unknown', phone_label: 'primary', phone_verified: false, is_primary_number: true, is_primary_contact: true, do_not_call: false, contact_kind: 'owner', dialable: true, custom: {} });
      }
      return json({ ok: true, lead_id: lid });
    }
    if (action === 'resolve') {
      const phonesParam = str('phones') || '';
      const uniq = [...new Set(phonesParam.split(',').map((p: string) => p.replace(/\D/g, '').slice(-10)).filter((p: string) => p.length === 10))];
      if (!uniq.length) return json({ map: {} });
      const orf = uniq.map((p) => `phone.ilike.%${p}`).join(',');
      const { data: cs } = await client.from('opm_contacts').select('phone,lead_id,name,contact_kind,related_name,relation_type').eq('workspace', ws).or(orf).limit(3000);
      const leadIds = [...new Set((cs || []).map((c: any) => c.lead_id))];
      const lmap: Record<string, any> = {};
      for (let i = 0; i < leadIds.length; i += 200) {
        const chunk = leadIds.slice(i, i + 200);
        const { data: ls } = await client.from('opm_leads').select('lead_id,name,property_ref,addresses').in('lead_id', chunk);
        for (const l of ls || []) lmap[l.lead_id] = l;
      }
      const map: Record<string, any> = {};
      for (const c of cs || []) {
        const ten = String(c.phone).replace(/\D/g, '').slice(-10);
        if (map[ten]) continue;
        const l = lmap[c.lead_id] || {};
        const a = (l.addresses && l.addresses[0]) || {};
        map[ten] = { name: c.contact_kind === 'relative' ? (c.related_name || l.name) : (l.name || c.name), lead_id: c.lead_id, kind: c.contact_kind, property_ref: l.property_ref || '', address: a.Street ? `${a.Street}, ${a.City || ''} ${a.State || ''} ${a.Zip || ''}`.replace(/\s+/g, ' ').trim() : '' };
      }
      return json({ map });
    }

    // ---- per-workspace custom field registry (dynamic columns / search / filter) ----
    if (action === 'custom_fields') {
      const { data } = await client.from('workspace_custom_fields').select('*').eq('workspace', ws).order('sort_order');
      return json({ fields: data || [] });
    }
    if (action === 'save_custom_field' && req.method === 'POST') {
      if (!isStaff && roleMap[ws] !== 'owner') return json({ error: 'forbidden: owner only' }, 403);
      const key = String(body.field_key || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!key || !body.label) return json({ error: 'field_key and label required' }, 400);
      const row: any = { workspace: ws, entity: body.entity === 'contact' ? 'contact' : 'lead', field_key: key, label: String(body.label).trim(), field_type: ['text', 'number', 'date', 'select', 'bool'].includes(body.field_type) ? body.field_type : 'text', options: Array.isArray(body.options) ? body.options : [], sort_order: Number(body.sort_order) || 0 };
      if (body.id) { await client.from('workspace_custom_fields').update(row).eq('id', body.id).eq('workspace', ws); return json({ ok: true, id: body.id }); }
      const { data, error } = await client.from('workspace_custom_fields').upsert(row, { onConflict: 'workspace,entity,field_key' }).select('id').maybeSingle();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, id: data?.id });
    }
    if (action === 'delete_custom_field' && req.method === 'POST') {
      if (!isStaff && roleMap[ws] !== 'owner') return json({ error: 'forbidden: owner only' }, 403);
      await client.from('workspace_custom_fields').delete().eq('id', body.id).eq('workspace', ws);
      return json({ ok: true });
    }

    if (action === 'place_call' && req.method === 'POST') {
      const { data: dcfg } = await client.from('crm_dialer_config').select('dialer_slug,agent_id,from_numbers').eq('crm_workspace', ws).maybeSingle();
      const wsSlug = dcfg?.dialer_slug || body.workspace || '1propertymarket';
      if (!isStaff && !allowedWs.includes(wsSlug) && !allowedWs.includes(ws)) return json({ error: 'forbidden: no access to dialer workspace ' + wsSlug }, 403);
      const { data: wrow } = await client.from('workspaces').select('api_key').eq('slug', wsSlug).maybeSingle();
      const key = wrow?.api_key;
      if (!key) return json({ error: 'No dialer key configured for workspace ' + wsSlug }, 400);
      if (!body.to_number) return json({ error: 'to_number required' }, 400);
      const nums = Array.isArray(dcfg?.from_numbers) ? dcfg!.from_numbers.filter(Boolean) : [];
      const fromNumber = nums.length ? nums[Math.floor(Math.random() * nums.length)] : body.from_number;
      const agentId = dcfg?.agent_id || body.agent_id;
      if (!fromNumber || !agentId) return json({ error: 'from_number and agent_id required — configure dialer routing for tenant ' + ws }, 400);
      let vars: any = body.variables || {};
      if (body.lead_id) {
        const { data: lead } = await client.from('opm_leads').select('*').eq('lead_id', body.lead_id).eq('workspace', ws).maybeSingle();
        const { data: nts } = await client.from('opm_notes').select('author,note_date,body_text,body_html,ts').eq('lead_id', body.lead_id).order('ts', { ascending: false, nullsFirst: false }).limit(10);
        const parcel = lead?.parcel || {}; const addr = (lead?.addresses && lead.addresses[0]) || {};
        vars = {
          seller_name: lead?.name || '', property_ref: lead?.property_ref || '',
          property_address: addr.Street ? `${addr.Street}, ${addr.City || ''} ${addr.State || ''} ${addr.Zip || ''}`.replace(/\s+/g, ' ').trim() : '',
          stage: lead?.crm_stage || '', our_value: lead?.deal_price ? String(lead.deal_price) : '',
          parcel_summary: Object.entries(parcel).filter(([k, v]) => v && k !== 'lat long' && k !== 'is related').map(([k, v]) => `${k}: ${v}`).join('; ').slice(0, 1500),
          notes_summary: (nts || []).map((n: any) => `[${n.note_date || ''}] ${n.author || ''}: ${String(n.body_text || n.body_html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').trim()}`).join(' | ').slice(0, 2500),
          ...vars,
        };
      }
      const payload = { from_number: fromNumber, to_number: body.to_number, override_agent_id: agentId, retell_llm_dynamic_variables: vars, metadata: { source: 'opm-app', lead_id: body.lead_id || null, launched_by: user.name || '', crm_workspace: ws } };
      const rr = await fetch('https://api.retellai.com/v2/create-phone-call', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const rj = await rr.json().catch(() => ({}));
      if (!rr.ok) return json({ error: 'Dialer error: ' + (rj?.message || rr.status), detail: rj }, 502);
      if (body.lead_id) {
        const line = `☎ AI call launched → ${body.to_number}`;
        await client.from('opm_notes').insert({ lead_id: body.lead_id, author: user.name || 'User', note_date: new Date().toISOString().slice(0, 10), ts: new Date().toISOString(), body_text: line, body_html: line, source: 'call', call_id: rj?.call_id || null });
        await client.from('opm_leads').update({ updated_at: new Date().toISOString() }).eq('lead_id', body.lead_id);
      }
      return json({ ok: true, call_id: rj?.call_id || null, from_number: fromNumber });
    }

    // ---- CSV import (simple): create leads + contacts under a CRM tenant ----
    if (action === 'import_leads' && req.method === 'POST') {
      const target = String(body.target_workspace || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
      if (!target) return json({ error: 'target_workspace required' }, 400);
      if (isStaff) {
        if (target === 'pitman' && body.allow_pitman !== true) return json({ error: 'refusing to import into pitman without allow_pitman' }, 400);
      } else {
        let ownsTarget = roleMap[target] === 'owner';
        if (!ownsTarget) {
          const { data: ts } = await client.from('tenants').select('slug,crm_workspace,dialer_slug,billing_slug');
          for (const [wsSlug, role] of Object.entries(roleMap)) {
            if (role !== 'owner') continue;
            const t = (ts || []).find((x: any) => x.slug === wsSlug || x.crm_workspace === wsSlug || x.dialer_slug === wsSlug || x.billing_slug === wsSlug);
            if (t && (t.crm_workspace === target || t.slug === target)) { ownsTarget = true; break; }
          }
        }
        if (!ownsTarget) return json({ error: 'forbidden: you can only import into your own workspace' }, 403);
        if (target === 'pitman') return json({ error: 'forbidden' }, 403);
      }
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json({ error: 'no rows provided' }, 400);
      if (rows.length > 500) return json({ error: 'max 500 rows per batch' }, 400);
      const numOrNull = (v: any) => { const s = String(v ?? '').replace(/[^0-9.\-]/g, ''); if (!s.trim()) return null; const n = Number(s); return isFinite(n) ? n : null; };
      const clean = (v: any) => { const s = String(v ?? '').trim(); return s ? s : null; };
      const leadRows: any[] = []; const contactRows: any[] = []; let leadsWithoutPhone = 0;
      for (const r of rows) {
        const first = clean(r.first_name) || ''; const last = clean(r.last_name) || '';
        const name = clean(r.name) || `${first} ${last}`.trim();
        const lid = 'imp_' + crypto.randomUUID();
        const addr = { Street: clean(r.street) || '', City: clean(r.city) || '', State: clean(r.state) || '', Zip: clean(r.zip) || '' };
        const hasAddr = addr.Street || addr.City || addr.State || addr.Zip;
        leadRows.push({
          lead_id: lid, workspace: target, name: name || '(no name)', first_name: first || null, last_name: last || null,
          lead_source: clean(r.lead_source) || 'CSV import', assigned_to: clean(r.assigned_to), crm_stage: clean(r.crm_stage),
          property_ref: clean(r.property_ref), listing_price: numOrNull(r.listing_price), deal_price: numOrNull(r.deal_price),
          addresses: hasAddr ? [addr] : [], emails: clean(r.email) ? [clean(r.email)] : [],
          background: clean(r.background), date_added: new Date().toISOString().slice(0, 10),
        });
        let primarySet = false;
        const phoneCols = [r.phone, r.phone2, r.phone3];
        for (let pi = 0; pi < phoneCols.length; pi++) {
          const digits = String(phoneCols[pi] ?? '').replace(/\D/g, '');
          if (digits.length < 10) continue;
          const isPrimary = !primarySet; primarySet = true;
          contactRows.push({
            contact_id: 'impc_' + crypto.randomUUID(), lead_id: lid, workspace: target,
            name: name || null, first_name: first || null, last_name: last || null, email: clean(r.email),
            phone: digits, phone_channel: 'unknown', phone_label: pi === 0 ? 'primary' : `phone${pi + 1}`,
            phone_verified: false, is_primary_number: isPrimary, is_primary_contact: isPrimary, do_not_call: false,
            contact_kind: 'owner', dialable: true,
          });
        }
        if (!primarySet) leadsWithoutPhone++;
      }
      const chunkInsert = async (tbl: string, arr: any[]) => {
        for (let i = 0; i < arr.length; i += 200) {
          const { error } = await client.from(tbl).insert(arr.slice(i, i + 200));
          if (error) throw new Error(`${tbl}: ${error.message}`);
        }
      };
      await chunkInsert('opm_leads', leadRows);
      if (contactRows.length) await chunkInsert('opm_contacts', contactRows);
      return json({ ok: true, workspace: target, leads: leadRows.length, contacts: contactRows.length, leads_without_phone: leadsWithoutPhone });
    }

    // ---- SMART IMPORT: consolidate + dedupe messy lists into clean records ----
    if (action === 'smart_import' && req.method === 'POST') {
      const target = String(body.target_workspace || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
      if (!target) return json({ error: 'target_workspace required' }, 400);
      if (isStaff) {
        if (target === 'pitman' && body.allow_pitman !== true) return json({ error: 'refusing to import into pitman without allow_pitman' }, 400);
      } else {
        let ownsTarget = roleMap[target] === 'owner';
        if (!ownsTarget) {
          const { data: ts } = await client.from('tenants').select('slug,crm_workspace,dialer_slug,billing_slug');
          for (const [wsSlug, role] of Object.entries(roleMap)) {
            if (role !== 'owner') continue;
            const t = (ts || []).find((x: any) => x.slug === wsSlug || x.crm_workspace === wsSlug || x.dialer_slug === wsSlug || x.billing_slug === wsSlug);
            if (t && (t.crm_workspace === target || t.slug === target)) { ownsTarget = true; break; }
          }
        }
        if (!ownsTarget) return json({ error: 'forbidden: you can only import into your own workspace' }, 403);
        if (target === 'pitman') return json({ error: 'forbidden' }, 403);
      }
      const records: any[] = Array.isArray(body.records) ? body.records : [];
      if (!records.length) return json({ error: 'no records provided' }, 400);
      if (records.length > 2000) return json({ error: 'max 2000 records per batch' }, 400);
      const mode = body.mode === 'commit' ? 'commit' : 'preview';
      const norm = (p: any) => String(p ?? '').replace(/\D/g, '').slice(-10);
      const clean = (v: any) => { const s = String(v ?? '').trim(); return s ? s : null; };
      const numOrNull = (v: any) => { const s = String(v ?? '').replace(/[^0-9.\-]/g, ''); if (!s.trim()) return null; const n = Number(s); return isFinite(n) ? n : null; };
      const nameOf = (r: any) => (clean(r.name) || `${clean(r.first_name) || ''} ${clean(r.last_name) || ''}`.trim() || '').trim();

      const existing = new Map<string, any>();
      for (let from = 0; ; from += 1000) {
        const { data } = await client.from('opm_contacts').select('contact_id,lead_id,name,phone,alt_names').eq('workspace', target).range(from, from + 999);
        for (const c of data || []) { const t = norm(c.phone); if (t.length === 10 && !existing.has(t)) existing.set(t, c); }
        if (!data || data.length < 1000) break;
      }

      const cleaned = records.map((r, idx) => ({ r, idx, nums: (Array.isArray(r.numbers) ? r.numbers : []).map((n: any) => ({ t: norm(n.phone), label: String(n.label || '').trim() })).filter((n: any) => n.t.length === 10) }));
      const phoneMap = new Map<string, { names: Set<string>; emails: Set<string>; label: string; firstIdx: number }>();
      let numbersTotal = 0;
      for (const c of cleaned) {
        const nm = nameOf(c.r);
        for (const n of c.nums) {
          numbersTotal++;
          let e = phoneMap.get(n.t);
          if (!e) { e = { names: new Set(), emails: new Set(), label: n.label, firstIdx: c.idx }; phoneMap.set(n.t, e); }
          if (nm) e.names.add(nm);
          if (clean(c.r.email)) e.emails.add(String(c.r.email).trim());
        }
      }
      const uniqueNumbers = phoneMap.size;
      let existingMatches = 0, multiName = 0;
      for (const [t, e] of phoneMap) { if (existing.has(t)) existingMatches++; if (e.names.size > 1) multiName++; }
      const stats = {
        records_in: records.length, numbers_total: numbersTotal, unique_numbers: uniqueNumbers,
        duplicates_in_upload: numbersTotal - uniqueNumbers, already_in_workspace: existingMatches,
        new_numbers: uniqueNumbers - existingMatches, multi_name_numbers: multiName,
        records_without_number: cleaned.filter((c) => c.nums.length === 0).length,
      };

      if (mode === 'preview') {
        const sample = [...phoneMap].slice(0, 12).map(([t, e]) => ({ phone: t, names: [...e.names], label: e.label, existing: existing.has(t) }));
        return json({ ok: true, preview: stats, sample });
      }

      const isRelLabel = (l: string) => /relativ|relation|associate|possible|spouse|other|tenant|occupant/i.test(l);
      const leadRows: any[] = []; const contactRows: any[] = []; const leadIdByIdx: Record<number, string> = {};
      for (const c of cleaned) {
        const willCreate = c.nums.some((n: any) => !existing.has(n.t) && phoneMap.get(n.t)!.firstIdx === c.idx);
        if (!willCreate) continue;
        const lid = 'imp_' + crypto.randomUUID(); leadIdByIdx[c.idx] = lid;
        const r = c.r;
        const addr = { Street: clean(r.street) || '', City: clean(r.city) || '', State: clean(r.state) || '', Zip: clean(r.zip) || '' };
        const hasAddr = addr.Street || addr.City || addr.State || addr.Zip;
        leadRows.push({
          lead_id: lid, workspace: target, name: nameOf(r) || '(no name)', first_name: clean(r.first_name), last_name: clean(r.last_name),
          lead_source: clean(r.lead_source) || 'Smart import', assigned_to: clean(r.assigned_to), crm_stage: clean(r.crm_stage),
          property_ref: clean(r.property_ref), listing_price: numOrNull(r.listing_price), deal_price: numOrNull(r.deal_price),
          addresses: hasAddr ? [addr] : [], emails: clean(r.email) ? [clean(r.email)] : [],
          background: clean(r.background), custom: (r.custom && typeof r.custom === 'object' && !Array.isArray(r.custom)) ? r.custom : {},
          date_added: new Date().toISOString().slice(0, 10),
        });
      }
      const primaryByLead = new Set<string>();
      for (const [t, e] of phoneMap) {
        if (existing.has(t)) continue;
        const lid = leadIdByIdx[e.firstIdx]; if (!lid) continue;
        const names = [...e.names]; const primary = names[0] || null; const rel = isRelLabel(e.label);
        const isFirst = !primaryByLead.has(lid); if (isFirst) primaryByLead.add(lid);
        contactRows.push({
          contact_id: 'impc_' + crypto.randomUUID(), lead_id: lid, workspace: target,
          name: primary, alt_names: names.slice(1), phone: t, phone_channel: 'unknown',
          phone_label: e.label || 'primary', phone_verified: false, is_primary_number: isFirst, is_primary_contact: isFirst,
          do_not_call: false, contact_kind: rel ? 'relative' : 'owner', related_name: rel ? primary : null, dialable: true, custom: {},
        });
      }
      const chunkInsert = async (tbl: string, arr: any[]) => {
        for (let i = 0; i < arr.length; i += 200) { const { error } = await client.from(tbl).insert(arr.slice(i, i + 200)); if (error) throw new Error(`${tbl}: ${error.message}`); }
      };
      await chunkInsert('opm_leads', leadRows);
      if (contactRows.length) await chunkInsert('opm_contacts', contactRows);
      return json({ ok: true, committed: { leads: leadRows.length, contacts: contactRows.length }, stats });
    }

    // ---- Billing console (super-admin, read + config only; NO live charging) ----
    if (action === 'billing_overview') {
      if (user.role !== 'super_admin') return json({ error: 'forbidden: super admin only' }, 403);
      const { data: bws } = await client.from('billing_workspaces').select('*').order('display_name');
      const slugs = (bws || []).map((b: any) => b.workspace_slug).filter(Boolean);
      const lmap: Record<string, any> = {};
      const { data: ledger } = await client.from('cost_ledger').select('workspace_slug,hard_cost,retail_price,margin,billable_amount,occurred_at,billed_invoice_id');
      for (const r of ledger || []) {
        const k = (lmap[r.workspace_slug] ||= { hard: 0, retail: 0, margin: 0, billable: 0, unbilled: 0, n: 0, last: null });
        k.hard += Number(r.hard_cost || 0); k.retail += Number(r.retail_price || 0);
        k.margin += Number(r.margin || 0); k.billable += Number(r.billable_amount || 0); k.n++;
        if (!r.billed_invoice_id) k.unbilled += Number(r.billable_amount || 0);
        if (r.occurred_at && (!k.last || r.occurred_at > k.last)) k.last = r.occurred_at;
      }
      const emap: Record<string, any> = {};
      if (slugs.length) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await client.from('calls').select('workspace,combined_cost_cents').in('workspace', slugs).range(from, from + 999);
          if (error) break;
          for (const c of data || []) { const k = (emap[c.workspace] ||= { hard: 0, n: 0 }); k.hard += Number(c.combined_cost_cents || 0) / 100; k.n++; }
          if (!data || data.length < 1000) break;
        }
      }
      const rows = (bws || []).map((b: any) => {
        const mult = Number(b.default_multiplier || 1);
        const led = lmap[b.workspace_slug] || { hard: 0, retail: 0, margin: 0, billable: 0, unbilled: 0, n: 0, last: null };
        const est = emap[b.workspace_slug] || { hard: 0, n: 0 };
        const estRetail = est.hard * mult; const estMargin = estRetail - est.hard;
        return {
          ...b,
          ledger: { hard_cost: led.hard, retail_price: led.retail, margin: led.margin, billable_amount: led.billable, unbilled_amount: led.unbilled, events: led.n, last_event: led.last },
          estimate: { hard_cost: est.hard, retail_price: estRetail, margin: estMargin, calls: est.n },
        };
      });
      return json({ workspaces: rows, ledger_populated: (ledger || []).length > 0 });
    }
    if (action === 'billing_set_config' && req.method === 'POST') {
      if (user.role !== 'super_admin') return json({ error: 'forbidden: super admin only' }, 403);
      const slug = String(body.workspace_slug || '').trim();
      if (!slug) return json({ error: 'workspace_slug required' }, 400);
      const patch: any = { updated_at: new Date().toISOString() };
      if (typeof body.display_name === 'string' && body.display_name.trim()) patch.display_name = body.display_name.trim();
      if (body.billing_mode && ['margin_split', 'full_retail', 'live_metered'].includes(body.billing_mode)) patch.billing_mode = body.billing_mode;
      if (body.default_multiplier != null && isFinite(Number(body.default_multiplier))) {
        const m = Number(body.default_multiplier);
        if (m < 0 || m > 100) return json({ error: 'multiplier out of range' }, 400);
        patch.default_multiplier = m;
      }
      if (body.status && ['onboarding', 'active', 'paused', 'closed'].includes(body.status)) patch.status = body.status;
      if ('stripe_customer_id' in body) patch.stripe_customer_id = body.stripe_customer_id ? String(body.stripe_customer_id).trim() : null;
      const { data: existing } = await client.from('billing_workspaces').select('id').eq('workspace_slug', slug).maybeSingle();
      let created = false;
      if (existing) {
        const { error } = await client.from('billing_workspaces').update(patch).eq('workspace_slug', slug);
        if (error) return json({ error: error.message }, 400);
      } else {
        created = true;
        const { error } = await client.from('billing_workspaces').insert({ workspace_slug: slug, display_name: patch.display_name || slug, ...patch });
        if (error) return json({ error: error.message }, 400);
      }
      await client.from('billing_audit_log').insert({ actor_user_id: user.id || null, action: created ? 'create_workspace' : 'update_config', entity_type: 'billing_workspace', entity_ref: slug, detail: patch });
      return json({ ok: true, created });
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
