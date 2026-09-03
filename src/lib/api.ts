// API client for the 1PropertyMarket - Outbound data function (Supabase edge function).
// Override at build time with VITE_API_BASE if you ever move the backend.
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/api';

const TOKEN_KEY = 'opm_outbound_token';

// The AI's on-call identity for a campaign - what it says when a prospect asks "who is this?",
// "what company?", or "how'd you get my number?". Reusable per workspace; falls back to the generic
// Adrian / BB Real Estate persona when a campaign leaves it unset.
export interface AgentIdentity {
  id?: string;
  workspace?: string;
  label?: string;
  agent_name?: string | null;
  company_name?: string | null;
  company_blurb?: string | null;
  caller_context?: string | null;
  phone?: string | null;
  website?: string | null;
  is_default?: boolean;
  created_by_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

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
  // HARD workspace lock: force tenant-scoped analytics actions onto the active workspace, overriding
  // whatever a page passed. Keeps every screen single-tenant; scope changes only via the sidebar switcher.
  if (WS_SCOPED_ACTIONS.has(action) && activeWorkspace) url.searchParams.set('workspace', activeWorkspace);
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

// Active CRM workspace (tenant) - set by the WorkspaceProvider; injected into every opm call.
const WS_KEY = 'opm_active_workspace';
let activeWorkspace: string | null = localStorage.getItem(WS_KEY);
export const workspaceStore = {
  get: () => activeWorkspace,
  set: (w: string | null) => { activeWorkspace = w; if (w) localStorage.setItem(WS_KEY, w); else localStorage.removeItem(WS_KEY); },
};

// Tenant-scoped analytics actions on the shared `api` function. When a workspace is active these are
// HARD-locked to it, so no page can surface another tenant's data. Super-admins change scope by
// switching the active workspace in the sidebar - never via per-page pickers (which are being removed).
const WS_SCOPED_ACTIONS = new Set(['overview', 'workspace', 'dispositions', 'agents', 'calls', 'contacts', 'contact']);

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

// ---- Campaign control plane (dedicated `opm-campaign` edge function): drip + preflight + lifecycle. ----
// Split out of `opm` so the drip processor + pause/resume/cancel + credit-aware preflight can evolve
// independently. Shares the same opaque-bearer auth + active-workspace scoping as opmCall.
const OPMCAMPAIGN_BASE =
  (import.meta as any).env?.VITE_OPMCAMPAIGN_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-campaign') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-campaign');

async function opmCampaignCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMCAMPAIGN_BASE);
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

// ---- CRM write helpers open to all workspace members (dedicated `opm-import` function): smart import
// + custom-field management. Split out of `opm` so these are no longer owner-only. Shares OPM auth +
// active-workspace scoping. ----
const OPMIMPORT_BASE =
  (import.meta as any).env?.VITE_OPMIMPORT_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-import') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-import');

async function opmImportCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMIMPORT_BASE);
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

// ---- CUE report engine (dedicated `opm-cue` function): Comping - Underwriting - Evaluation.
// Pulls subject + comps + AVM + HUD rents from RealEstateAPI and caches per lead. `cueGet` is a free
// cached read; `cueGenerate` hits the paid API. Shares OPM auth + active-workspace scoping. ----
const OPMCUE_BASE =
  (import.meta as any).env?.VITE_OPMCUE_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-cue') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-cue');

async function opmCueCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMCUE_BASE);
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

// ---- Opportunities (dedicated `opm-opps` function): a contact can hold one opportunity per
// pipeline. The Standard 1PM opportunity is always call-driven; custom-pipeline opportunities move
// independently. Shares OPM auth + active-workspace scoping. ----
const OPMOPPS_BASE =
  (import.meta as any).env?.VITE_OPMOPPS_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-opps') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-opps');

async function opmOppsCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMOPPS_BASE);
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

// ---- LOI engine (dedicated `opm-loi` function): editable Letter-of-Intent draft per lead, exported
// to PDF; sending advances the Standard opportunity to "Offer sent". Shares OPM auth. ----
const OPMLOI_BASE =
  (import.meta as any).env?.VITE_OPMLOI_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-loi') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-loi');

async function opmLoiCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMLOI_BASE);
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

export const opm = {
  workspaces: () => opmCall('workspaces'),
  // CUE report (Comping - Underwriting - Evaluation) for a lead's property.
  cueGet: (leadId: string) => opmCueCall('cue_get', { params: { lead_id: leadId } }),
  // LOI (Letter of Intent) - draft/generate/save/send an offer letter for a lead.
  loiGet: (leadId: string) => opmLoiCall('get', { params: { lead_id: leadId } }),
  loiGenerate: (leadId: string, fields: any) => opmLoiCall('generate', { method: 'POST', body: { lead_id: leadId, fields } }),
  loiSave: (leadId: string, fields: any, body_text: string) => opmLoiCall('save', { method: 'POST', body: { lead_id: leadId, fields, body_text } }),
  loiSend: (leadId: string, fields: any, body_text: string) => opmLoiCall('send', { method: 'POST', body: { lead_id: leadId, fields, body_text } }),
  cueGenerate: (leadId: string) => opmCueCall('cue_generate', { method: 'POST', body: { lead_id: leadId } }),
  // Opportunities - a contact can live in several pipelines at once (one opportunity per pipeline).
  oppsBoard: (pipeline_id: number | string) => opmOppsCall('board', { params: { pipeline_id } }),
  oppsForLead: (leadId: string) => opmOppsCall('for_lead', { params: { lead_id: leadId } }),
  oppsMove: (b: { opportunity_id: number; stage_id: number | null }) => opmOppsCall('move', { method: 'POST', body: b }),
  oppsAdd: (b: { lead_id: string; pipeline_id: number; stage_id?: number | null }) => opmOppsCall('add', { method: 'POST', body: b }),
  oppsRemove: (opportunity_id: number) => opmOppsCall('remove', { method: 'POST', body: { opportunity_id } }),
  // Most-recent-call map (lead_id -> last call) for the active workspace - enriches board cards.
  lastCallsMap: () => opmCampaignCall('last_calls', { method: 'POST', body: {} }),
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
  // Stage curation lives on opm-stages so color + ICON persist (legacy opm save_stage dropped icon).
  saveStage: (b: any) => opmStageCall('save_stage', { method: 'POST', body: b }),
  deleteStage: (id: number) => opmStageCall('delete_stage', { method: 'POST', body: { id } }),
  reorderStages: (ids: number[]) => opmStageCall('reorder_stages', { method: 'POST', body: { ids } }),
  // Verify a captured email is deliverable (free MX + syntax + disposable check). Persists the
  // status onto the lead when lead_id is passed. Returns { deliverable, status, reason, suggestion? }.
  verifyEmail: (email: string, lead_id?: string) =>
    opmVerifyCall({ email, ...(lead_id ? { lead_id } : {}) }) as Promise<{ email: string; deliverable: boolean; status: 'deliverable' | 'risky' | 'undeliverable' | 'unknown'; reason: string; suggestion?: string }>,
  leads: (p: any) => opmCall('leads', { params: p }),
  // Fast record-centric contacts list - served by opm-ext (parallelized; ~1s vs ~26s on `opm`).
  sellerContacts: (p: any = {}) => opmExtCall('contacts', { params: p }),
  resolve: (phones: string[]) => opmCall('resolve', { params: { phones: phones.join(',') } }),
  placeCall: (b: any) => opmCall('place_call', { method: 'POST', body: b }),
  lead: (id: string) => opmCall('lead', { params: { id } }),
  moveLead: (b: any) => opmCall('move_lead', { method: 'POST', body: b }),
  addNote: (b: any) => opmCall('add_note', { method: 'POST', body: b }),
  updateContact: (b: any) => opmCall('update_contact', { method: 'POST', body: b }),
  // Import a batch of mapped rows into a (possibly new) CRM tenant.
  // Pass workspace:'' so the active-tenant param is NOT injected - target_workspace governs.
  importLeads: (b: { target_workspace: string; rows: any[]; allow_pitman?: boolean }) =>
    opmCall('import_leads', { method: 'POST', params: { workspace: '' }, body: b }),
  // Smart import: consolidate/dedupe by phone. mode:'preview' returns stats only; 'commit' writes.
  // Served by the dedicated `opm-import` function so ANY workspace member can import (not just owners).
  // On commit, an optional list_name tags every imported lead and auto-creates a saved smart list.
  smartImport: (b: { target_workspace: string; records: any[]; mode: 'preview' | 'commit'; list_name?: string; extra_tags?: string[] }) =>
    opmImportCall('import_smart', { method: 'POST', body: b }),
  addContact: (b: any) => opmCall('add_contact', { method: 'POST', body: b }),
  customFields: () => opmCall('custom_fields'),
  // Custom-field management - served by `opm-import` so any workspace member can manage the account's fields.
  saveCustomField: (b: any) => opmImportCall('custom_field_save', { method: 'POST', body: b }),
  deleteCustomField: (id: number) => opmImportCall('custom_field_delete', { method: 'POST', body: { id } }),
  // ---- Tag vocabulary management (opm-import; role-gated server-side) ----
  // tagsList returns { tags:[{tag,cnt}], can_edit, can_delete } for the active workspace.
  // rename/add need owner/admin/manager; delete needs owner/admin (or platform staff).
  tagsList: () => opmImportCall('tags_list', { method: 'POST', body: {} }),
  tagRename: (from: string, to: string) => opmImportCall('tag_rename', { method: 'POST', body: { from, to } }),
  tagDelete: (tag: string) => opmImportCall('tag_delete', { method: 'POST', body: { tag } }),
  tagAdd: (tag: string, lead_ids: string[]) => opmImportCall('tag_add', { method: 'POST', body: { tag, lead_ids } }),
  // Billing console (super-admin). Global, so suppress the active-tenant param.
  billingOverview: () => opmCall('billing_overview', { params: { workspace: '' } }),
  billingSetConfig: (b: any) => opmCall('billing_set_config', { method: 'POST', params: { workspace: '' }, body: b }),
  // Smart lists + bulk actions (companion `opm-ext` function).
  savedLists: (page: string, workspace?: string) => opmExtCall('saved_lists', { params: { page, ...(workspace ? { workspace } : {}) } }),
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
  // ---- Phase 1 RBAC / lead distribution (companion `opm-ext`) ----
  // Assignable users for the active workspace (or a specific one). Owner/admin/manager use this to pick a primary/follower.
  workspaceMembers: (workspace?: string) => opmExtCall('workspace_members', workspace ? { params: { workspace } } : {}),
  // Set/replace the PRIMARY assignee for one lead or many (bulk). Owner/admin only (server-enforced; 403 otherwise).
  assignLead: (b: { workspace?: string; lead_id?: string; lead_ids?: string[]; primary_user_id: number }) => opmExtCall('assign_lead', { method: 'POST', body: b }),
  // Add / remove a follower on a lead (owner/admin only).
  addFollower: (b: { workspace?: string; lead_id: string; user_id: number }) => opmExtCall('add_follower', { method: 'POST', body: b }),
  removeFollower: (b: { workspace?: string; lead_id: string; user_id: number }) => opmExtCall('remove_follower', { method: 'POST', body: b }),
  // Primary + followers for one lead (visible to anyone who can see the lead).
  leadAssignees: (lead_id: string, workspace?: string) => opmExtCall('lead_assignees', { params: { lead_id, ...(workspace ? { workspace } : {}) } }),
  // Append-only audit ledger for one lead (newest first).
  activityLog: (lead_id: string, workspace?: string) => opmExtCall('activity_log', { params: { lead_id, ...(workspace ? { workspace } : {}) } }),
  // Note governance: edit / delete (author within 24h, or super_admin override). Server enforces; may 403.
  updateNote: (b: { id: number | string; text?: string; html?: string }) => opmExtCall('update_note', { method: 'POST', body: b }),
  deleteNote: (id: number | string) => opmExtCall('delete_note', { method: 'POST', body: { id } }),
  // ---- Campaign management (opm campaign_* actions on the MAIN project) ----
  // Resolve the FULL matching lead_id set for the current Contacts filters (server-side select-all).
  resolveSelection: (p: { workspace?: string; pipeline_id?: string; stage_id?: string; verified?: string; tags?: string; search?: string }) => opmCall('resolve_selection', { params: p }),
  // Create a tracked campaign, tag its leads (campaign:<slug>), and launch the first batch of AI calls.
  campaignLaunch: (b: { workspace?: string; name: string; agent_id: string; agent_name?: string; lead_ids: string[]; dial_mode?: 'primary' | 'all_numbers'; timezone?: string; drip_batch?: number | null; drip_minutes?: number | null }) =>
    opmCall('campaign_launch', { method: 'POST', params: b.workspace ? { workspace: b.workspace } : undefined, body: b }),
  // Pre-flight the launch: confirms the agent has assigned/dialable numbers, is callable, AND that the
  // dialer account has credit (live probe). Returns { ok, numbers, number_count, agent_ok, credit_ok,
  // credit_reason, credit_message, issues[] }. Block Launch when !ok and show issues. Served by opm-campaign.
  campaignPreflight: (b: { workspace?: string; agent_id: string }) =>
    opmCampaignCall('campaign_preflight', { method: 'POST', params: b.workspace ? { workspace: b.workspace } : undefined, body: b }),
  // Attach disposition metadata (kind + assigned listing) to a campaign right after it's created.
  // The drip reads these off the campaign row to inject the listing's context into every buyer call.
  campaignSetMeta: (b: { id: string; campaign_kind?: 'acquisition' | 'disposition'; property_id?: string | null; workspace?: string; timezone?: string; window_start_hour?: number; window_end_hour?: number; window_days?: number[]; scheduled_at?: string | null; agent_identity?: AgentIdentity | null }) =>
    opmCampaignCall('campaign_set_meta', { method: 'POST', params: b.workspace ? { workspace: b.workspace } : undefined, body: b }),
  // ---- Dynamic agent identity (opm-campaign): the AI's on-call name / company / blurb / caller-context.
  // Injected as {{agent_name}}/{{company_name}}/{{company_blurb}}/{{caller_context}} into every campaign
  // call so a team can run as their own brand or the generic Adrian / BB Real Estate persona. ----
  identityList: (workspace?: string) =>
    opmCampaignCall('identity_list', { params: workspace ? { workspace } : undefined }) as Promise<{ profiles: AgentIdentity[]; generic: AgentIdentity }>,
  // Front-load a "my company" identity from the caller's saved user + workspace-branding details.
  identityPrefill: (workspace?: string) =>
    opmCampaignCall('identity_prefill', { params: workspace ? { workspace } : undefined }) as Promise<{ generic: AgentIdentity; prefill: AgentIdentity; has_company: boolean }>,
  // Save (or update, when id is passed) a reusable identity profile for the workspace.
  identitySave: (b: AgentIdentity & { workspace?: string }) =>
    opmCampaignCall('identity_save', { method: 'POST', params: b.workspace ? { workspace: b.workspace } : undefined, body: b }) as Promise<{ ok: boolean; profile: AgentIdentity }>,
  identityDelete: (id: string, workspace?: string) =>
    opmCampaignCall('identity_delete', { method: 'POST', params: workspace ? { workspace } : undefined, body: { id } }),
  // Caller-ID numbers assigned to a workspace's dialer + usage (total calls, last used), most-used first.
  // Powers the launch wizard's "which numbers this agent uses" panel. Served by opm-campaign.
  campaignNumberUsage: (workspace?: string) =>
    opmCampaignCall('number_usage', { method: 'POST', params: workspace ? { workspace } : undefined, body: workspace ? { workspace } : {} }),
  // Projected calls / duration / cost range for a chosen lead set + dial mode (render defensively).
  // Pass lead_ids[] (preferred) or count. Returns { estimated_calls, numbers, daily_throughput,
  // estimated_duration:{days,finish_local,human}, cost_range:{low,blended,high,*.billed_usd,basis,note} }.
  campaignProjection: (b: { workspace?: string; agent_id: string; lead_ids?: string[]; count?: number; dial_mode: 'primary' | 'all_numbers'; timezone?: string }) =>
    opmCall('campaign_projection', { method: 'POST', params: b.workspace ? { workspace: b.workspace } : undefined, body: b }),
  // Campaigns visible to the caller (own workspaces; super_admin all) + per-campaign cost/disposition rollup.
  // The workspace key is always present (possibly undefined) so the active-tenant param is NOT auto-injected -
  // an unset workspace means "all my workspaces" (customer) or "all workspaces" (super_admin).
  campaignsList: (p: { workspace?: string; from?: string; to?: string } = {}) => opmCall('campaigns_list', { params: { workspace: p.workspace, from: p.from, to: p.to } }),
  // One campaign + its leads + KPIs (cost, pickup, voicemail, disposition breakdown) computed from `calls`.
  campaignDetail: (id: string) => opmCall('campaign_detail', { params: { id } }),
  // Retail multiplier map for the caller (opm-campaign). Campaign costs are stored as raw hard cost;
  // customers (and a super_admin impersonating one) must see hard x the workspace's billing multiplier,
  // while true platform staff see the raw cost. Returns { apply:boolean, mult:{ [workspace]:number } }:
  // `apply` is false for staff (show true cost) and true otherwise. Applied client-side on the campaign
  // pages so we didn't have to re-emit the large `opm` function.
  retailMult: () => opmCampaignCall('retail_mult'),
  // Super-admin: manually advance any due drip batches (same processor pg_cron calls every minute). Served by opm-campaign.
  campaignDripRun: () => opmCampaignCall('campaign_drip_run', { method: 'POST' }),
  // ---- Campaign lifecycle controls (opm-campaign): pause / resume / cancel a running campaign. ----
  // pause -> stops new calls (resumable). resume -> re-enters the drip. cancel -> terminal (marks remaining
  // pending leads canceled). In-flight calls already handed to the dialer cannot be recalled.
  campaignPause: (id: string) => opmCampaignCall('campaign_pause', { method: 'POST', body: { id } }),
  campaignResume: (id: string) => opmCampaignCall('campaign_resume', { method: 'POST', body: { id } }),
  campaignCancel: (id: string) => opmCampaignCall('campaign_cancel', { method: 'POST', body: { id } }),
  // Resolve phone numbers -> matched CRM contact { name, email, lead_id, property_ref } (last-10 keyed),
  // scoped to the active workspace. Powers the name/email + lead link on Call History and Call Detail.
  resolveContacts: (phones: string[]) => opmCampaignCall('resolve_contacts', { method: 'POST', body: { phones } }),
  // Reliability: read / toggle Retell "Stable Server" routing for a workspace. When ON, that tenant's
  // outbound calls + preflight probe route through Retell's stable cluster. The toggle only changes
  // routing - the stable cluster must first be enabled on that Retell account by Retell support.
  dialerConfig: (workspace?: string) => opmCampaignCall('dialer_config', workspace ? { params: { workspace } } : {}),
  setStableServer: (on: boolean, workspace?: string) => opmCampaignCall('set_stable_server', { method: 'POST', ...(workspace ? { params: { workspace } } : {}), body: { stable_server: on } }),
  // Rich workspace call analytics (volume, dispositions, agents, cost, pickup/voicemail, duration,
  // daily trend, recent) computed from `calls`. `workspace` may be a comma-joined slug list;
  // from/to are epoch-ms bounds on start_timestamp. Authorized per the caller's workspace access.
  workspaceActivity: (p: { workspace: string; from?: number; to?: number }) =>
    opmCall('workspace_activity', { params: { workspace: p.workspace, from: p.from, to: p.to } }),

  // ---- Lead routing engine (companion `opm-ext` routing_* actions; owner/admin/manager only - server 403s otherwise) ----
  // Ordered list of routing rules for the active workspace (or a specific one).
  routingRulesList: (workspace?: string) => opmExtCall('routing_rules_list', workspace ? { params: { workspace } } : {}),
  // Create/update one rule. Server returns the persisted rule (with id, sort_order, resolved target/fallback names).
  routingRuleSave: (rule: any, workspace?: string) => opmExtCall('routing_rule_save', { method: 'POST', body: { ...(workspace ? { workspace } : {}), rule } }),
  // Delete a rule by id.
  routingRuleDelete: (id: string | number) => opmExtCall('routing_rule_delete', { method: 'POST', body: { id } }),
  // Persist a new rule order (ordered array of rule ids).
  routingRulesReorder: (ids: (string | number)[], workspace?: string) => opmExtCall('routing_rules_reorder', { method: 'POST', body: { ...(workspace ? { workspace } : {}), ids } }),
  // Simulate (dry_run:true -> {plan}) or apply (dry_run:false -> {assigned, results}) rules over a lead set.
  runRules: (b: { lead_ids: string[]; dry_run: boolean; trigger?: string; workspace?: string }) => opmExtCall('run_rules', { method: 'POST', body: b }),
  // Per-rep load snapshot (open primary leads + assigned today) for the balance strip.
  routingStats: (workspace?: string) => opmExtCall('routing_stats', workspace ? { params: { workspace } } : {}),
};

// ---- Calendar / Booked Appointments (dedicated `opm-calendar` edge function). AI agents book via
// agent-live; this is the human-facing list/create/edit/cancel. Shares OPM auth + active-workspace scoping. ----
export interface Appointment {
  id?: string; workspace?: string; lead_id?: string | null; contact_name?: string | null;
  phone?: string | null; email?: string | null; title?: string | null;
  starts_at: string; ends_at?: string | null; timezone?: string | null;
  status?: 'scheduled' | 'completed' | 'canceled' | 'no_show'; source?: string; agent_id?: string | null;
  call_id?: string | null; notes?: string | null; created_at?: string; updated_at?: string;
}
const OPMCAL_BASE =
  (import.meta as any).env?.VITE_OPMCAL_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-calendar') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-calendar');

async function opmCalCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMCAL_BASE);
  url.searchParams.set('action', action);
  if (activeWorkspace && !(opts.params && 'workspace' in opts.params)) url.searchParams.set('workspace', activeWorkspace);
  for (const [k, v] of Object.entries(opts.params || {})) { if (v === undefined || v === null || v === '') continue; url.searchParams.set(k, String(v)); }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---- Pipeline STAGE curation (dedicated `opm-stages` edge function). Persists color + ICON
// (the legacy opm save_stage dropped icon) and supports reordering. Same OPM auth + workspace scope. ----
const OPMSTAGE_BASE =
  (import.meta as any).env?.VITE_OPMSTAGE_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-stages') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-stages');

async function opmStageCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMSTAGE_BASE);
  url.searchParams.set('action', action);
  if (activeWorkspace && !(opts.params && 'workspace' in opts.params)) url.searchParams.set('workspace', activeWorkspace);
  for (const [k, v] of Object.entries(opts.params || {})) { if (v === undefined || v === null || v === '') continue; url.searchParams.set(k, String(v)); }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---- Email deliverability verifier (dedicated `email-verify` edge function). Free MX + syntax +
// disposable check today; a paid mailbox-level provider can slot in later. Session-authed. ----
const OPMVERIFY_BASE =
  (import.meta as any).env?.VITE_OPMVERIFY_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/email-verify') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/email-verify');

async function opmVerifyCall(body: { email: string; lead_id?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(OPMVERIFY_BASE, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const calendar = {
  // Appointments in a date range (ISO bounds) for the active workspace, soonest first.
  list: (p: { from?: string; to?: string; status?: string; workspace?: string } = {}) =>
    opmCalCall('appt_list', { params: p }) as Promise<{ appointments: Appointment[] }>,
  save: (b: Partial<Appointment> & { starts_at?: string }) =>
    opmCalCall('appt_save', { method: 'POST', body: b }) as Promise<{ ok: boolean; appointment: Appointment }>,
  cancel: (id: string) => opmCalCall('appt_delete', { method: 'POST', body: { id } }),
};

// ---- Notifications (Phase 3) - dedicated `opm-notif` edge function; shares OPM auth + active-workspace scoping. ----
const OPMNOTIF_BASE =
  (import.meta as any).env?.VITE_OPMNOTIF_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-notif') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-notif');

async function opmNotifCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMNOTIF_BASE);
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
  if (!res.ok) {
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const notif = {
  // ---- Per-user Notification Center (inbox + personal mute prefs) - for ALL users. ----
  // The caller's own recent notifications (optionally a single workspace, unread-only, limited).
  inboxList: (p: { workspace?: string; limit?: number; unread_only?: boolean } = {}) =>
    opmNotifCall('inbox_list', { params: { ...(p.workspace ? { workspace: p.workspace } : {}), ...(p.limit ? { limit: p.limit } : {}), ...(p.unread_only ? { unread_only: true } : {}) } }),
  // Unread badge count for the bell.
  inboxUnreadCount: () => opmNotifCall('inbox_unread_count'),
  // Mark specific ids read, or all of the caller's notifications read.
  inboxMarkRead: (b: { ids?: (string | number)[]; all?: boolean }) => opmNotifCall('inbox_mark_read', { method: 'POST', body: b }),
  // Personal notification prefs (opt-out model): { prefs:{muted:[],email,inapp}, catalog:[{type,label}], model:'opt-out' }.
  myPrefsGet: (workspace?: string) => opmNotifCall('my_notif_prefs_get', workspace ? { params: { workspace } } : {}),
  myPrefsSave: (prefs: { muted: string[]; email: boolean; inapp: boolean }, workspace?: string) =>
    opmNotifCall('my_notif_prefs_save', { method: 'POST', body: { ...(workspace ? { workspace } : {}), prefs } }),

  // Current notification settings + capability flags + the 20-status catalog for the disposition picker.
  settingsGet: (workspace?: string) => opmNotifCall('notif_settings_get', workspace ? { params: { workspace } } : {}),
  // Persist settings (owner/admin/super only - server 403s otherwise).
  settingsSave: (settings: any, workspace?: string) => opmNotifCall('notif_settings_save', { method: 'POST', body: { ...(workspace ? { workspace } : {}), settings } }),
  // Fire a test notification to the current user (or an explicit target). status may be 'sent' or 'pending'.
  test: (b: { channel: 'email' | 'sms'; to_user_id?: number; to_email?: string; workspace?: string }) =>
    opmNotifCall('notif_test', { method: 'POST', body: b }),
  // Recent delivery log (newest first).
  logList: (limit = 50, workspace?: string) => opmNotifCall('notif_log_list', { params: { limit, ...(workspace ? { workspace } : {}) } }),
  // Dedicated-number picker source (workspace SMS numbers + the current selection).
  workspaceNumbers: (workspace?: string) => opmNotifCall('workspace_numbers', workspace ? { params: { workspace } } : {}),
};

// ---- Phase 4 team collaboration - dedicated `opm-team` edge function; shares OPM auth + active-workspace scoping. ----
const OPMTEAM_BASE =
  (import.meta as any).env?.VITE_OPMTEAM_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-team') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-team');

async function opmTeamCall(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(OPMTEAM_BASE);
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
  if (!res.ok) {
    const err: any = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const team = {
  // ---- Per-lead internal comment thread (@mentions) - visible to anyone who can see the lead. ----
  leadComments: (lead_id: string, workspace?: string) => opmTeamCall('lead_comments_list', { params: { lead_id, ...(workspace ? { workspace } : {}) } }),
  leadCommentAdd: (b: { lead_id: string; body: string; mentions?: number[]; workspace?: string }) => opmTeamCall('lead_comment_add', { method: 'POST', body: b }),
  // ---- Workspace internal status channel. ----
  feedList: (p: { limit?: number; workspace?: string } = {}) => opmTeamCall('team_feed_list', { params: { ...(p.limit ? { limit: p.limit } : {}), ...(p.workspace ? { workspace: p.workspace } : {}) } }),
  feedPost: (b: { body: string; mentions?: number[]; workspace?: string }) => opmTeamCall('team_feed_post', { method: 'POST', body: b }),
  // ---- Team settings (pulse cadence / no-touch SLA). settingsGet returns { settings, can_manage }; save is owner/admin. ----
  settingsGet: (workspace?: string) => opmTeamCall('team_settings_get', workspace ? { params: { workspace } } : {}),
  settingsSave: (b: { pulse_hours?: number; no_touch_hours?: number; pulse_enabled?: boolean; workspace?: string }) => opmTeamCall('team_settings_save', { method: 'POST', body: b }),
  // ---- Manager dashboard (owner/admin/manager) - per-rep KPIs + totals. May 403 for reps. ----
  dashboard: (p: { from?: string; to?: string; workspace?: string } = {}) => opmTeamCall('team_dashboard', { params: { ...(p.from ? { from: p.from } : {}), ...(p.to ? { to: p.to } : {}), ...(p.workspace ? { workspace: p.workspace } : {}) } }),
};

// companion `opm-ext` edge function - shares OPM auth + active-workspace scoping.
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

// ---- Test AI (separate `test-call` edge function) - place live test calls ----
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
  // Retell voice catalog for the workspace (avatars + preview URLs) - powers the voice picker.
  listVoices: (workspace: string) => testaiCall('list_voices', { params: { workspace } }),
  // Retell knowledge bases for the workspace - powers the KB multi-select.
  listKbs: (workspace: string) => testaiCall('list_kbs', { params: { workspace } }),
  // Admin/owner: push edits to the live Retell agent (browser never sees the key). Accepts the
  // legacy flat fields plus the full editor's grouped agent {} / llm {} payloads.
  updateAgent: (b: { workspace: string; agent_id: string; name?: string; general_prompt?: string; voice_id?: string; agent?: Record<string, any>; llm?: Record<string, any> }) =>
    testaiCall('update_agent', { method: 'POST', body: b }),
  // Clone an agent within the same workspace (any user with access to that agent).
  cloneAgent: (b: { workspace: string; agent_id: string; new_name?: string }) =>
    testaiCall('clone_agent', { method: 'POST', body: b }),
  numbers: (workspace: string) => testaiCall('numbers', { params: { workspace } }),
  // Bind a number's inbound and/or outbound agent (from the AI Agents page or Phone Numbers page).
  assignNumber: (b: { workspace: string; phone: string; inbound_agent_id?: string; outbound_agent_id?: string; inbound_webhook_url?: string }) =>
    testaiCall('assign_number', { method: 'POST', body: b }),
  // Create a brand-new agent from scratch (open to any workspace member with access).
  createAgent: (b: { workspace: string; name?: string; general_prompt?: string; voice_id?: string; begin_message?: string; language?: string; agent?: Record<string, any>; llm?: Record<string, any> }) =>
    testaiCall('create_agent', { method: 'POST', body: b }),
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
  // Identity/billing fields (full_name, email, billing_address, member_id) are saved against the
  // authorization for this token. No PAN/CVV - the card itself is captured via the tokenized processor flow.
  cardLinkStart: (b: { token: string; signature_name: string; agreement_accepted: boolean; full_name?: string; email?: string; billing_address?: string; member_id?: string }) => billingCall('card_link_start', { body: b }),
  cardLinkComplete: (token: string, session_id?: string) => billingCall('card_link_complete', { body: { token, session_id } }),
  // Feature 1 - direct-pay capability (super-admin). Toggle whether the customer pays providers directly (no rebill).
  setDirectPay: (workspace: string, enabled: boolean) => billingCall('set_direct_pay', { body: { workspace, enabled } }),
  // Feature 2 - signed authorization PDF (super-admin). Generate/list/fetch flattened PDF records (card = brand+last4 only).
  authorizationPdf: (workspace: string) => billingCall('authorization_pdf', { body: { workspace } }),
  authorizationPdfList: (workspace: string) => billingGet('authorization_pdf_list', { workspace }),
  authorizationPdfGet: (id: string) => billingGet('authorization_pdf_get', { id }),
  // Saved authorization contact details (full name, email, billing address, member ID + card brand/last4). Admin/owner.
  authDetailsList: (workspace: string) => billingGet('auth_details_list', { workspace }),
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
  dateTime: (ms: number | null) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'),
  title: (s: string) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
};
