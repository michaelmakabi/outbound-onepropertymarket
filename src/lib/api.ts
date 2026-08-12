// API client for the 1PropertyMarket — Outbound data function (Supabase edge function).
// Override at build time with VITE_API_BASE if you ever move the backend.
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api';

const TOKEN_KEY = 'opm_outbound_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function call(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (username: string, password: string) => call('login', { method: 'POST', body: { username, password } }),
  me: () => call('me'),
  logout: () => call('logout', { method: 'POST' }),
  bootstrap: () => call('bootstrap'),
  overview: (p: any) => call('overview', { params: p }),
  workspace: (p: any) => call('workspace', { params: p }),
  dispositions: (p: any) => call('dispositions', { params: p }),
  compare: (p: any) => call('compare', { params: p }),
  agents: (p: any) => call('agents', { params: p }),
  calls: (p: any) => call('calls', { params: p }),
  call: (id: string) => call('call', { params: { id } }),
  contacts: (p: any) => call('contacts', { params: p }),
  contact: (number: string) => call('contact', { params: { number } }),
  usage: () => call('usage'),
  updateProfile: (b: any) => call('profile.update', { method: 'PATCH', body: b }),
  buildPrompt: (b: any) => call('ai.buildPrompt', { method: 'POST', body: b }),
  aiSuggestions: (b: any) => call('ai.suggestions', { method: 'POST', body: b }),
  aiReport: (b: any) => call('ai.report', { method: 'POST', body: b }),
  admin: {
    users: () => call('admin.users'),
    userEvents: () => call('admin.userEvents'),
    allWorkspaces: () => call('admin.allWorkspaces'),
    workspaceAgents: (workspace: string) => call('admin.workspaceAgents', { params: { workspace } }),
    getAccess: (userId: number) => call('admin.getAccess', { params: { userId } }),
    createUser: (b: any) => call('admin.createUser', { method: 'POST', body: b }),
    updateUser: (b: any) => call('admin.updateUser', { method: 'PATCH', body: b }),
    resetPassword: (b: any) => call('admin.resetPassword', { method: 'POST', body: b }),
    impersonate: (id: number) => call('admin.impersonate', { method: 'POST', body: { id } }),
    resendInvite: (b: any) => call('admin.resendInvite', { method: 'POST', body: b }),
    setAccess: (b: any) => call('admin.setAccess', { method: 'POST', body: b }),
  },
};

// ---- OPM leads / pipelines API (separate `opm` edge function) ----
const OPM_BASE =
  (import.meta as any).env?.VITE_OPM_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm');

// Active CRM workspace (tenant) — set by the WorkspaceProvider; injected into every opm call.
const WS_KEY = 'opm_active_workspace';
let activeWorkspace: string | null = localStorage.getItem(WS_KEY);
export const workspaceStore = {
  get: () => activeWorkspace,
  set: (w: string | null) => { activeWorkspace = w; if (w) localStorage.setItem(WS_KEY, w); else localStorage.removeItem(WS_KEY); },
};

async function opmCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPM_BASE);
  url.searchParams.set('action', action);
  // Scope every CRM call to the active tenant (backend still defaults to pitman if absent).
  if (activeWorkspace && !(opts.params && 'workspace' in opts.params)) url.searchParams.set('workspace', activeWorkspace);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const opm = {
  workspaces: () => opmCall('workspaces'),
  summary: () => opmCall('summary'),
  pipelines: () => opmCall('pipelines'),
  // Snapshots: list a specific workspace's pipelines/custom fields (source picker), and clone across.
  pipelinesFor: (workspace: string) => opmCall('pipelines', { params: { workspace } }),
  customFieldsFor: (workspace: string) => opmCall('custom_fields', { params: { workspace } }),
  clonePipelines: (b: { source_workspace: string; target_workspace: string; pipeline_ids: number[]; include_custom_fields: boolean }) =>
    opmCall('clone_pipelines', { method: 'POST', params: { workspace: '' }, body: b }),
  savePipeline: (b: any) => opmCall('save_pipeline', { method: 'POST', body: b }),
  deletePipeline: (id: number) => opmCall('delete_pipeline', { method: 'POST', body: { id } }),
  // Persist a new pipeline order (ordered array of pipeline ids for the active workspace).
  // The pinned "Standard 1PM Pipeline" is always forced first server-side regardless of position.
  reorderPipelines: (ids: number[]) => opmCall('reorder_pipelines', { method: 'POST', body: { ids } }),
  saveStage: (b: any) => opmCall('save_stage', { method: 'POST', body: b }),
  deleteStage: (id: number) => opmCall('delete_stage', { method: 'POST', body: { id } }),
  leads: (p: any) => opmCall('leads', { params: p }),
  // Fast record-centric contacts list — served by opm-ext (parallelized; ~1s vs ~26s on `opm`).
  sellerContacts: (p: any = {}) => opmExtCall('contacts', { params: p }),
  resolve: (phones: string[]) => opmCall('resolve', { params: { phones: phones.join(',') } }),
  placeCall: (b: any) => opmCall('place_call', { method: 'POST', body: b }),
  lead: (id: string) => opmCall('lead', { params: { id } }),
  moveLead: (b: any) => opmCall('move_lead', { method: 'POST', body: b }),
  addNote: (b: any) => opmCall('add_note', { method: 'POST', body: b }),
  updateContact: (b: any) => opmCall('update_contact', { method: 'POST', body: b }),
  // Import a batch of mapped rows into a (possibly new) CRM tenant.
  // Pass workspace:'' so the active-tenant param is NOT injected — target_workspace governs.
  importLeads: (b: { target_workspace: string; rows: any[]; allow_pitman?: boolean }) =>
    opmCall('import_leads', { method: 'POST', params: { workspace: '' }, body: b }),
  // Smart import: consolidate/dedupe by phone. mode:'preview' returns stats only; 'commit' writes.
  smartImport: (b: { target_workspace: string; records: any[]; mode: 'preview' | 'commit' }) =>
    opmCall('smart_import', { method: 'POST', params: { workspace: '' }, body: b }),
  addContact: (b: any) => opmCall('add_contact', { method: 'POST', body: b }),
  customFields: () => opmCall('custom_fields'),
  saveCustomField: (b: any) => opmCall('save_custom_field', { method: 'POST', body: b }),
  deleteCustomField: (id: number) => opmCall('delete_custom_field', { method: 'POST', body: { id } }),
  // Billing console (super-admin). Global, so suppress the active-tenant param.
  billingOverview: () => opmCall('billing_overview', { params: { workspace: '' } }),
  billingSetConfig: (b: any) => opmCall('billing_set_config', { method: 'POST', params: { workspace: '' }, body: b }),
  // Smart lists + bulk actions (companion `opm-ext` function).
  savedLists: (page: string) => opmExtCall('saved_lists', { params: { page } }),
  saveList: (b: { id?: number; page: string; name: string; config: any; shared?: boolean }) => opmExtCall('save_list', { method: 'POST', body: b }),
  deleteList: (id: number) => opmExtCall('delete_list', { method: 'POST', body: { id } }),
  deleteContacts: (contact_ids: string[]) => opmExtCall('delete_contacts', { method: 'POST', body: { contact_ids } }),
  // Record detail: full call history (incl. transcript) + edit a lead's record fields.
  leadCalls: (lead_id: string) => opmExtCall('lead_calls', { params: { lead_id } }),
  updateLead: (b: { lead_id: string; [k: string]: any }) => opmExtCall('update_lead', { method: 'POST', body: b }),
  // Add or edit a phone number on an existing lead (owner/staff).
  saveNumber: (b: { lead_id: string; contact_id?: string; phone?: string; [k: string]: any }) => opmExtCall('save_number', { method: 'POST', body: b }),
  // Rich per-pipeline lead list (created/updated dates, attempts) for table/grid/date-range views.
  pipelineLeads: (pipeline_id: number | string) => opmExtCall('pipeline_leads', { params: { pipeline_id } }),
  backfillCallContacts: (workspace: string, commit: boolean) => opmExtCall('backfill_call_contacts', { method: 'POST', params: { workspace: '' }, body: { workspace, commit } }),
  // ---- Campaign management (opm campaign_* actions on the MAIN project) ----
  // Resolve the FULL matching lead_id set for the current Contacts filters (server-side select-all).
  resolveSelection: (p: { workspace?: string; pipeline_id?: string; stage_id?: string; verified?: string; tags?: string; search?: string }) => opmCall('resolve_selection', { params: p }),
  // Create a tracked campaign, tag its leads (campaign:<slug>), and launch the first batch of AI calls.
  campaignLaunch: (b: { workspace?: string; name: string; agent_id: string; agent_name?: string; lead_ids: string[]; drip_batch?: number | null; drip_minutes?: number | null }) =>
    opmCall('campaign_launch', { method: 'POST', params: b.workspace ? { workspace: b.workspace } : undefined, body: b }),
  // Campaigns visible to the caller (own workspaces; super_admin all) + per-campaign cost/disposition rollup.
  // The workspace key is always present (possibly undefined) so the active-tenant param is NOT auto-injected —
  // an unset workspace means "all my workspaces" (customer) or "all workspaces" (super_admin).
  campaignsList: (p: { workspace?: string; from?: string; to?: string } = {}) => opmCall('campaigns_list', { params: { workspace: p.workspace, from: p.from, to: p.to } }),
  // One campaign + its leads + KPIs (cost, pickup, voicemail, disposition breakdown) computed from `calls`.
  campaignDetail: (id: string) => opmCall('campaign_detail', { params: { id } }),
  // Super-admin: manually advance any due drip batches (same processor pg_cron calls every 2 min).
  campaignDripRun: () => opmCall('campaign_drip_run', { method: 'POST' }),
  // Rich workspace call analytics (volume, dispositions, agents, cost, pickup/voicemail, duration,
  // daily trend, recent) computed from `calls`. `workspace` may be a comma-joined slug list;
  // from/to are epoch-ms bounds on start_timestamp. Authorized per the caller's workspace access.
  workspaceActivity: (p: { workspace: string; from?: number; to?: number }) =>
    opmCall('workspace_activity', { params: { workspace: p.workspace, from: p.from, to: p.to } }),
};

// companion `opm-ext` edge function — shares OPM auth + active-workspace scoping.
const OPMEXT_BASE =
  (import.meta as any).env?.VITE_OPMEXT_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-ext') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-ext');

async function opmExtCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMEXT_BASE);
  url.searchParams.set('action', action);
  if (activeWorkspace && !(opts.params && 'workspace' in opts.params)) url.searchParams.set('workspace', activeWorkspace);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---- Test AI (separate `test-call` edge function) — place live test calls ----
const TESTAI_BASE =
  (import.meta as any).env?.VITE_TESTAI_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/test-call') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/test-call');

async function testaiCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(TESTAI_BASE);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const testai = {
  workspaces: () => testaiCall('workspaces'),
  agents: (workspace: string) => testaiCall('agents', { params: { workspace } }),
  // Rich per-agent directory (derived type, description, voice, prompt) for the AI Agents tab.
  agentsDetailed: (workspace: string) => testaiCall('agents_detailed', { params: { workspace } }),
  // Full editable snapshot of one agent (agent settings + its LLM settings) for the editor page.
  agentFull: (workspace: string, agent_id: string) => testaiCall('agent_full', { params: { workspace, agent_id } }),
  // Retell voice catalog for the workspace (avatars + preview URLs) — powers the voice picker.
  listVoices: (workspace: string) => testaiCall('list_voices', { params: { workspace } }),
  // Retell knowledge bases for the workspace — powers the KB multi-select.
  listKbs: (workspace: string) => testaiCall('list_kbs', { params: { workspace } }),
  // Admin/owner: push edits to the live Retell agent (browser never sees the key). Accepts the
  // legacy flat fields plus the full editor's grouped agent {} / llm {} payloads.
  updateAgent: (b: { workspace: string; agent_id: string; name?: string; general_prompt?: string; voice_id?: string; agent?: Record<string, any>; llm?: Record<string, any> }) =>
    testaiCall('update_agent', { method: 'POST', body: b }),
  // Clone an agent within the same workspace (any user with access to that agent).
  cloneAgent: (b: { workspace: string; agent_id: string; new_name?: string }) =>
    testaiCall('clone_agent', { method: 'POST', body: b }),
  numbers: (workspace: string) => testaiCall('numbers', { params: { workspace } }),
  // Prompt-aware variable detection: returns the agent's general_prompt + detected {{vars}} (browser never sees the Retell key).
  agentPromptVars: (workspace: string, agent_id: string) => testaiCall('agent_prompt_vars', { params: { workspace, agent_id } }),
  // Reusable Test-AI templates, keyed by workspace.
  templates: (workspace: string) => testaiCall('list_templates', { params: { workspace } }),
  saveTemplate: (b: { id?: number; workspace: string; name: string; agent_id?: string; config: any }) => testaiCall('save_template', { method: 'POST', body: b }),
  deleteTemplate: (id: number) => testaiCall('delete_template', { method: 'POST', body: { id } }),
  call: (b: { workspace: string; agent_id: string; to_number: string; from_number?: string; dynamic_variables?: Record<string, string> }) =>
    testaiCall('call', { method: 'POST', body: b }),
};

// ---- Billing operations (separate `billing-run` edge function; super-admin) ----
const BILLING_BASE =
  (import.meta as any).env?.VITE_BILLING_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/billing-run') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/billing-run');

async function billingCall(action: string, opts: { method?: string; body?: any } = {}) {
  const url = new URL(BILLING_BASE);
  url.searchParams.set('action', action);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'POST', headers, body: opts.body ? JSON.stringify(opts.body) : '{}' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const billing = {
  ingestCalls: () => billingCall('ingest_calls'),
  createCustomer: (workspace_slug: string, email?: string) => billingCall('create_customer', { body: { workspace_slug, email } }),
  generateInvoice: (workspace_slug: string) => billingCall('generate_invoice', { body: { workspace_slug } }),
  // Public self-serve signup (no auth). register returns a Stripe Checkout URL for card capture;
  // completeRegistration provisions the account after the card is saved and logs the user in.
  register: (b: { name: string; email: string; company?: string; password: string; agreement_accepted: boolean; signature_name: string }) => billingCall('register', { body: b }),
  terms: () => billingGet('terms'),
  completeRegistration: (token: string, session_id?: string) => billingCall('complete_registration', { body: { token, session_id } }),
  // Customer self-serve account portal (any authenticated user; scoped to their own tenant).
  myAccount: () => billingGet('my_account'),
  portal: () => billingCall('portal'),
  // Subscription plan manager (super-admin).
  plansList: () => billingGet('plans_list'),
  planSave: (b: { id?: string; name: string; interval: string; amount: number; setup_fee?: number; active?: boolean }) => billingCall('plan_save', { body: b }),
  planDelete: (id: string) => billingCall('plan_delete', { body: { id } }),
  subscriptionAssign: (workspace: string, plan_id: string) => billingCall('subscription_assign', { body: { workspace, plan_id } }),
  subscriptionGet: (workspace: string) => billingGet('subscription_get', { workspace }),
  // Forward-facing consent + manual card capture link.
  cardLinkCreate: (workspace: string) => billingCall('card_link_create', { body: { workspace } }),
  cardLinkGet: (token: string) => billingGet('card_link_get', { token }),
  cardLinkStart: (b: { token: string; signature_name: string; agreement_accepted: boolean }) => billingCall('card_link_start', { body: b }),
  cardLinkComplete: (token: string, session_id?: string) => billingCall('card_link_complete', { body: { token, session_id } }),
  // Feature 1 — direct-pay capability (super-admin). Toggle whether the customer pays providers directly (no rebill).
  setDirectPay: (workspace: string, enabled: boolean) => billingCall('set_direct_pay', { body: { workspace, enabled } }),
  // Feature 2 — signed authorization PDF (super-admin). Generate/list/fetch flattened PDF records (card = brand+last4 only).
  authorizationPdf: (workspace: string) => billingCall('authorization_pdf', { body: { workspace } }),
  authorizationPdfList: (workspace: string) => billingGet('authorization_pdf_list', { workspace }),
  authorizationPdfGet: (id: string) => billingGet('authorization_pdf_get', { id }),
};

// GET helper for authenticated billing reads (my_account).
async function billingGet(action: string, params?: Record<string, string>) {
  const url = new URL(BILLING_BASE);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---- Super-admin ops (separate `admin-ops` edge function): webhooks + dialer routing + provisioning ----
const ADMINOPS_BASE =
  (import.meta as any).env?.VITE_ADMINOPS_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/admin-ops') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/admin-ops');

async function adminOpsCall(action: string, opts: { method?: string; body?: any; params?: Record<string, string> } = {}) {
  const url = new URL(ADMINOPS_BASE);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.params || {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const adminOps = {
  tenantsList: () => adminOpsCall('tenants_list'),
  tenantDetail: (slug: string) => adminOpsCall('tenant_detail', { params: { slug } }),
  agentBillingSet: (b: { dialer_workspace: string; agent_id: string; agent_name?: string; billing_slug: string; reattribute?: boolean }) => adminOpsCall('agent_billing_set', { method: 'POST', body: b }),
  tenantUpsert: (b: any) => adminOpsCall('tenant_upsert', { method: 'POST', body: b }),
  provisionTenant: (b: any) => adminOpsCall('provision_tenant', { method: 'POST', body: b }),
  webhooksList: () => adminOpsCall('webhooks_list'),
  webhooksSave: (b: any) => adminOpsCall('webhooks_save', { method: 'POST', body: b }),
  webhooksDelete: (id: number) => adminOpsCall('webhooks_delete', { method: 'POST', body: { id } }),
  webhooksTest: (id: number) => adminOpsCall('webhooks_test', { method: 'POST', body: { id } }),
  dialerList: () => adminOpsCall('dialer_list'),
  dialerSet: (b: any) => adminOpsCall('dialer_set', { method: 'POST', body: b }),
};

// ---- Public homepage "talk to our AI" demo caller (no auth) ----
const DEMOCALL_BASE =
  (import.meta as any).env?.VITE_DEMOCALL_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/demo-call') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/demo-call');

export const demo = {
  call: async (b: { use_case: string; name: string; phone: string; email?: string; consent: boolean }) => {
    const res = await fetch(DEMOCALL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
  },
};

// Fetch a call recording via the backend proxy (bypasses CORS) as a Blob.
export async function fetchRecordingBlob(callId: string): Promise<Blob> {
  const base = (import.meta as any).env?.VITE_API_BASE || 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api';
  const url = new URL(base);
  url.searchParams.set('action', 'recording');
  url.searchParams.set('id', callId);
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Recording fetch failed (${res.status})`);
  return res.blob();
}

// ---- formatting helpers ----
export const fmt = {
  money: (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  int: (n: number) => (n || 0).toLocaleString('en-US'),
  pct: (n: number) => `${((n || 0) * 100).toFixed(1)}%`,
  dur: (s: number) => {
    s = Math.round(s || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  },
  dateTime: (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'),
  title: (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
};
