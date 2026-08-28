// Platform audit / activity feed client — talks to the standalone `audit` edge function
// (unified user_events + CRM activity). Kept in its own module so the huge api.ts stays untouched.
import { tokenStore, workspaceStore } from './api';

const AUDIT_BASE =
  (import.meta as any).env?.VITE_AUDIT_BASE ||
  ((import.meta as any).env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/audit') : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/audit');

export type AuditEvent = {
  uid: string; src: string; created_at: string; actor_id: number | null; actor_name: string | null;
  action: string; category: string | null; workspace: string | null; target_name: string | null;
  entity_type: string | null; entity_id: string | null; detail_text: string | null; detail_json: any;
};
export type AuditQuery = {
  q?: string; evt?: string; category?: string; entity?: string; actor?: number | string;
  ws?: string; ws_in?: string[]; from?: number; to?: number; limit?: number; offset?: number;
};

async function auditCall(action: string, opts: { method?: string; body?: any; params?: Record<string, any> } = {}) {
  const url = new URL(AUDIT_BASE);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const audit = {
  events: (q: AuditQuery = {}): Promise<{ events: AuditEvent[]; total: number; limit: number; offset: number; facets: { actions: string[]; categories: string[]; workspaces: string[]; entities: string[]; actors: { id: number; name: string }[] } }> =>
    auditCall('events', { params: { ...q, ws_in: q.ws_in && q.ws_in.length ? q.ws_in : undefined } }),
  // Fire-and-forget movement beacon. Never rejects — tracking must not disturb the UI.
  track: (b: { path?: string; label?: string; workspace?: string | null; event?: 'page_view' | 'action'; entity_type?: string; entity_id?: string; ref?: string }) =>
    auditCall('track', { method: 'POST', body: b }).catch(() => undefined),
};

// Log a discrete user action (button-driven) with actor attribution — used at key mutation sites
// (agent create/edit, number assign, imports, …) so the activity feed shows WHO did WHAT.
export function trackAction(label: string, opts: { workspace?: string | null; entity_type?: string; entity_id?: string } = {}) {
  try { audit.track({ event: 'action', label, workspace: opts.workspace ?? workspaceStore.get(), entity_type: opts.entity_type, entity_id: opts.entity_id, path: `action:${label}` }); } catch { /* ignore */ }
}
