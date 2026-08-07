// Client for the prepaid-credits actions on the `onboarding` edge function (SaaS mode).
// Self-contained so it does not touch the large consent module. Reuses the app bearer token.
import { tokenStore } from './api';

const BASE =
  (import.meta as any).env?.VITE_ONBOARDING_BASE ||
  ((import.meta as any).env?.VITE_API_BASE
    ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/onboarding')
    : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/onboarding');

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
  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const credits = {
  wallet: (slug: string) => callFn('credits_wallet', { params: { slug } }),
  configSet: (b: any) => callFn('credits_config_set', { method: 'POST', body: b }),
  topup: (b: any) => callFn('credits_topup', { method: 'POST', body: b }),
  debitNow: (workspace_slug: string) => callFn('credits_debit_now', { method: 'POST', body: { workspace_slug } }),
  baseline: (workspace_slug: string) => callFn('credits_baseline', { method: 'POST', body: { workspace_slug } }),
};
