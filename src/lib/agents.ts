// Client for the `agent-tools` edge function (super-admin: clone a Retell agent
// from a source workspace into a target customer's workspace). Reuses the app token.
import { tokenStore } from './api';

const BASE =
  (import.meta as any).env?.VITE_AGENTTOOLS_BASE ||
  ((import.meta as any).env?.VITE_API_BASE
    ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/agent-tools')
    : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/agent-tools');

async function callFn(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(BASE);
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

export const agentTools = {
  workspaces: () => callFn('workspaces'),
  listAgents: (workspace: string) => callFn('list_agents', { params: { workspace } }),
  clone: (b: { source_workspace: string; target_workspace: string; source_agent_id: string; new_name?: string }) =>
    callFn('clone_agent', { method: 'POST', body: b }),
};
