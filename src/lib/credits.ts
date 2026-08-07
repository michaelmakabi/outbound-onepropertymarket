// Client for the billing actions on the `onboarding` edge function (SaaS credits,
// subscriptions/service fees, refunds, plans). Self-contained; reuses the app bearer token.
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
  // Prepaid credits (SaaS)
  wallet: (slug: string) => callFn('credits_wallet', { params: { slug } }),
  configSet: (b: any) => callFn('credits_config_set', { method: 'POST', body: b }),
  topup: (b: any) => callFn('credits_topup', { method: 'POST', body: b }),
  debitNow: (workspace_slug: string) => callFn('credits_debit_now', { method: 'POST', body: { workspace_slug } }),
  baseline: (workspace_slug: string) => callFn('credits_baseline', { method: 'POST', body: { workspace_slug } }),
  // Refunds (admin)
  refund: (b: any) => callFn('refund', { method: 'POST', body: b }),
  // Subscriptions / service fees (Direct retail + subscription)
  subscriptions: (slug: string) => callFn('subscriptions', { params: { slug } }),
  subscriptionSet: (b: any) => callFn('subscription_set', { method: 'POST', body: b }),
  subscriptionDelete: (id: string) => callFn('subscription_delete', { method: 'POST', body: { id } }),
  subscriptionChargeNow: (id: string) => callFn('subscription_charge_now', { method: 'POST', body: { id } }),
  // Reusable plan templates
  plans: () => callFn('plans'),
  planCreate: (b: any) => callFn('plan_create', { method: 'POST', body: b }),
  planApply: (b: any) => callFn('plan_apply', { method: 'POST', body: b }),
};
