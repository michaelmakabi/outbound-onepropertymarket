// inbound-lookup — Retell inbound-call dynamic-variables webhook.
// Retell POSTs on an inbound call; we look the caller up by phone in the matching
// workspace and return the lead's fields as Retell dynamic variables so the inbound
// agent can greet the caller by name with full context. Called by Retell (not the
// app): auth is a shared secret in the ?secret= query param, NOT the app bearer.
//
// Request (Retell inbound webhook): { event:"call_inbound",
//   call_inbound:{ agent_id, from_number, to_number, ... } }  (we also accept flat).
// Response (Retell contract): { call_inbound:{ dynamic_variables:{...} } }.
// We ALSO echo a top-level dynamic_variables for forward/backward compatibility.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Shared secret gate (Retell has no bearer; we validate ?secret=). Keep in sync with
// the webhook URL wired onto the Pitman phone numbers.
const SHARED_SECRET = 'inl_Qs7Kd2Rn9Vp4Xt6Zb3Hm8Lf';

const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const sb = () => createClient(Deno.env.get('SUPABASE_URL'), SVC);

const norm10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10);
const s = (v: unknown) => (v == null ? '' : String(v));

// The exact dynamic-variable keys the inbound LLM prompts reference. Empty-string
// defaults keep the call working for unknown callers.
function emptyVars() {
  return {
    lead_name: '', lead_email: '', listing_address: '', property_profile: '',
    contact_fields: '', has_history: 'no', last_contact: '', prior_summary: '', history: '',
  } as Record<string, string>;
}

function addrOf(lead: any): string {
  const a = (lead?.addresses && lead.addresses[0]) || null;
  if (a && (a.Street || a.street)) {
    return `${a.Street || a.street}, ${a.City || a.city || ''} ${a.State || a.state || ''} ${a.Zip || a.zip || ''}`
      .replace(/\s+/g, ' ').trim().replace(/,\s*$/, '');
  }
  if (lead?.property_ref) return String(lead.property_ref);
  return '';
}

function propertyProfile(lead: any): string {
  const parts: string[] = [];
  const prop = lead?.property && typeof lead.property === 'object' ? lead.property : {};
  for (const [k, v] of Object.entries(prop)) {
    if (v == null || v === '' || (typeof v === 'object')) continue;
    parts.push(`${k.replace(/_/g, ' ')}: ${v}`);
  }
  if (lead?.listing_price) parts.push(`listing price: ${lead.listing_price}`);
  if (lead?.deal_price) parts.push(`deal price: ${lead.deal_price}`);
  return parts.join('; ');
}

function contactFields(lead: any, contact: any): string {
  const parts: string[] = [];
  if (lead?.lead_source) parts.push(`source: ${lead.lead_source}`);
  if (lead?.assigned_to) parts.push(`assigned to: ${lead.assigned_to}`);
  if (lead?.crm_stage) parts.push(`stage: ${lead.crm_stage}`);
  if (Array.isArray(lead?.tags) && lead.tags.length) parts.push(`tags: ${lead.tags.join(', ')}`);
  if (contact?.phone_label) parts.push(`number label: ${contact.phone_label}`);
  if (contact?.relation_type) parts.push(`relation: ${contact.relation_type}`);
  const custom = lead?.custom && typeof lead.custom === 'object' ? lead.custom : {};
  for (const [k, v] of Object.entries(custom)) {
    if (v == null || v === '' || typeof v === 'object') continue;
    parts.push(`${k.replace(/_/g, ' ')}: ${v}`);
  }
  if (lead?.background) parts.push(`background: ${String(lead.background).slice(0, 400)}`);
  return parts.join('; ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  // Secret gate (accept ?secret= or ?key=).
  const provided = url.searchParams.get('secret') || url.searchParams.get('key') || '';
  if (provided !== SHARED_SECRET) return json({ error: 'forbidden' }, 403);

  const vars = emptyVars();
  const respond = (extra: Record<string, unknown> = {}) =>
    json({ call_inbound: { dynamic_variables: vars }, dynamic_variables: vars, ...extra });

  try {
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
    const ci = (body && typeof body === 'object' && (body as any).call_inbound) || body || {};
    const fromNumber = (ci as any).from_number || (body as any).from_number || url.searchParams.get('from_number') || '';
    const toNumber = (ci as any).to_number || (body as any).to_number || url.searchParams.get('to_number') || '';
    const agentId = (ci as any).agent_id || (body as any).agent_id || url.searchParams.get('agent_id') || '';
    const fromTen = norm10(fromNumber);
    const toTen = norm10(toNumber);

    if (!fromTen) return respond({ matched: false, reason: 'no from_number' });

    const client = sb();

    // ---- Resolve the workspace this inbound call belongs to. ----
    // 1) to_number is one of a workspace's dialer from_numbers, or 2) agent_id matches a
    // dialer config's agent, else 3) fall back to a globally-unique contact match below.
    let workspace: string | null = null;
    const { data: dcs } = await client
      .from('crm_dialer_config')
      .select('crm_workspace, dialer_slug, agent_id, from_numbers');
    for (const d of dcs || []) {
      const nums = (d.from_numbers || []).map((n: string) => norm10(n));
      if (toTen && nums.includes(toTen)) { workspace = d.crm_workspace; break; }
    }
    if (!workspace && agentId) {
      for (const d of dcs || []) if (d.agent_id && d.agent_id === agentId) { workspace = d.crm_workspace; break; }
    }

    // ---- Look up the caller by phone. ----
    let contact: any = null;
    if (workspace) {
      const { data } = await client
        .from('opm_contacts')
        .select('contact_id,lead_id,workspace,name,email,phone,phone_label,related_name,relation_type,is_primary_number')
        .eq('workspace', workspace)
        .filter('phone', 'ilike', `%${fromTen}`)
        .order('is_primary_number', { ascending: false })
        .limit(5);
      contact = (data || [])[0] || null;
    }
    if (!contact) {
      // Fallback: global match. Accept only if it resolves to a single workspace (avoid
      // cross-tenant leakage).
      const { data } = await client
        .from('opm_contacts')
        .select('contact_id,lead_id,workspace,name,email,phone,phone_label,related_name,relation_type,is_primary_number')
        .filter('phone', 'ilike', `%${fromTen}`)
        .limit(20);
      const cands = (data || []).filter((c: any) => norm10(c.phone) === fromTen);
      const wsSet = new Set(cands.map((c: any) => c.workspace));
      if (workspace) {
        contact = cands.find((c: any) => c.workspace === workspace) || null;
      } else if (wsSet.size === 1 && cands.length) {
        contact = cands.sort((a: any, b: any) => (b.is_primary_number ? 1 : 0) - (a.is_primary_number ? 1 : 0))[0];
        workspace = contact.workspace;
      }
    }

    if (!contact) return respond({ matched: false, workspace, reason: 'no contact for number' });

    // ---- Load the lead record. ----
    const { data: lead } = await client
      .from('opm_leads')
      .select('lead_id,workspace,name,emails,addresses,property,property_ref,listing_price,deal_price,lead_source,assigned_to,crm_stage,tags,custom,background,disposition_flags')
      .eq('lead_id', contact.lead_id)
      .maybeSingle();

    vars.lead_name = s(lead?.name || contact.name || contact.related_name || '');
    const emails = Array.isArray(lead?.emails) ? lead!.emails : [];
    vars.lead_email = s(contact.email || (emails.length ? emails[0] : '') || '');
    vars.listing_address = addrOf(lead || {});
    vars.property_profile = propertyProfile(lead || {});
    vars.contact_fields = contactFields(lead || {}, contact);

    // ---- Prior call history (calls are logged under the CRM workspace + its dialer slugs). ----
    const callWs = new Set<string>();
    if (lead?.workspace) callWs.add(lead.workspace);
    if (workspace) callWs.add(workspace);
    for (const d of dcs || []) if (d.crm_workspace === (workspace || lead?.workspace) && d.dialer_slug) callWs.add(d.dialer_slug);

    // Gather this lead's phone numbers to match against calls.
    const { data: leadContacts } = await client
      .from('opm_contacts').select('phone').eq('lead_id', contact.lead_id);
    const tens = [...new Set([fromTen, ...((leadContacts || []).map((c: any) => norm10(c.phone)))].filter((t) => t.length === 10))];
    let calls: any[] = [];
    if (tens.length && callWs.size) {
      const orf = tens.flatMap((p) => [`to_number.ilike.%${p}`, `from_number.ilike.%${p}`]).join(',');
      const { data: cc } = await client
        .from('calls')
        .select('start_timestamp,direction,disposition,call_summary,agent_name,duration_seconds')
        .in('workspace', [...callWs])
        .or(orf)
        .order('start_timestamp', { ascending: false })
        .limit(25);
      calls = cc || [];
    }
    // Also fold in disposition_flags.last_ai_call as a prior summary source.
    const df = (lead?.disposition_flags && typeof lead.disposition_flags === 'object') ? lead.disposition_flags : {};

    if (calls.length) {
      vars.has_history = 'yes';
      const fmtTs = (t: any) => { const n = Number(t) || 0; return n ? new Date(n).toISOString().slice(0, 10) : ''; };
      const last = calls[0];
      vars.last_contact = `${fmtTs(last.start_timestamp)} ${last.direction || ''} — ${last.disposition || 'call'}`.trim();
      const priorSummarized = calls.find((c) => c.call_summary && String(c.call_summary).trim());
      vars.prior_summary = s(priorSummarized?.call_summary || df?.last_ai_call?.disposition || '');
      vars.history = calls.map((c) => {
        const bits = [fmtTs(c.start_timestamp), c.direction || '', c.disposition || '', c.call_summary ? String(c.call_summary).slice(0, 300) : '']
          .filter(Boolean).join(' | ');
        return `• ${bits}`;
      }).join('\n');
    } else if (df?.last_ai_call) {
      vars.has_history = 'yes';
      vars.prior_summary = s(df.last_ai_call.disposition || '');
      vars.last_contact = df.last_ai_call.ts ? new Date(Number(df.last_ai_call.ts)).toISOString().slice(0, 10) : '';
    }

    return respond({ matched: true, workspace, lead_id: contact.lead_id });
  } catch (e) {
    // Never break the call — return safe empty defaults on any error.
    return respond({ matched: false, error: String(e) });
  }
});
