// Billing line-item breakdown (dedicated `opm-billing-breakdown` edge function).
// Returns per-workspace cost_ledger aggregates split by event_type (AI Calls, AI Call Analysis, …).
// Admins get all workspaces; a regular user gets only their own. Powers the stacked line-item view
// on the admin Billing page and the customer Account page.
import { tokenStore } from './api';

const OPMBREAKDOWN_BASE =
  (import.meta as any).env?.VITE_API_BASE
    ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-billing-breakdown')
    : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-billing-breakdown';

export async function billingBreakdown(params: { workspace?: string } = {}) {
  const url = new URL(OPMBREAKDOWN_BASE);
  if (params.workspace) url.searchParams.set('workspace', params.workspace);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as { workspaces: Record<string, { total: any; line_items: any[] }>; admin?: boolean };
}
