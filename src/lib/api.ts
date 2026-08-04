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
  savePipeline: (b: any) => opmCall('save_pipeline', { method: 'POST', body: b }),
  deletePipeline: (id: number) => opmCall('delete_pipeline', { method: 'POST', body: { id } }),
  saveStage: (b: any) => opmCall('save_stage', { method: 'POST', body: b }),
  deleteStage: (id: number) => opmCall('delete_stage', { method: 'POST', body: { id } }),
  leads: (p: any) => opmCall('leads', { params: p }),
  sellerContacts: (p: any = {}) => opmCall('contacts', { params: p }),
  resolve: (phones: string[]) => opmCall('resolve', { params: { phones: phones.join(',') } }),
  placeCall: (b: any) => opmCall('place_call', { method: 'POST', body: b }),
  lead: (id: string) => opmCall('lead', { params: { id } }),
  moveLead: (b: any) => opmCall('move_lead', { method: 'POST', body: b }),
  addNote: (b: any) => opmCall('add_note', { method: 'POST', body: b }),
  updateContact: (b: any) => opmCall('update_contact', { method: 'POST', body: b }),
  // Import a batch of mapped rows into a (possibly new) CRM tenant. Super-admin only.
  // Pass workspace:'' so the active-tenant param is NOT injected — target_workspace governs.
  importLeads: (b: { target_workspace: string; rows: any[]; allow_pitman?: boolean }) =>
    opmCall('import_leads', { method: 'POST', params: { workspace: '' }, body: b }),
  // Billing console (super-admin). Global, so suppress the active-tenant param.
  billingOverview: () => opmCall('billing_overview', { params: { workspace: '' } }),
  billingSetConfig: (b: any) => opmCall('billing_set_config', { method: 'POST', params: { workspace: '' }, body: b }),
};

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
  numbers: (workspace: string) => testaiCall('numbers', { params: { workspace } }),
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
