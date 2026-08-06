// Client for the `onboarding` edge function (super-admin: accounts, consent,
// card capture, encrypted vault reveal). Reuses the app's bearer token.
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

export const onboarding = {
  accounts: () => callFn('accounts'),
  account: (slug: string) => callFn('account', { params: { slug } }),
  createAccount: (b: any) => callFn('create_account', { method: 'POST', body: b }),
  saveAuthorization: (b: any) => callFn('save_authorization', { method: 'POST', body: b }),
  setupLink: (b: any) => callFn('setup_link', { method: 'POST', body: b }),
  syncStripeCard: (workspace_slug: string) => callFn('sync_stripe_card', { method: 'POST', body: { workspace_slug } }),
  saveCardManual: (b: any) => callFn('save_card_manual', { method: 'POST', body: b }),
  revealCard: (vault_id: string) => callFn('reveal_card', { method: 'POST', body: { vault_id } }),
  markKeyed: (vault_id: string) => callFn('mark_keyed', { method: 'POST', body: { vault_id } }),
};

// The canonical consent wording. Bump the version string whenever the text changes;
// the exact snapshot shown to the signer is frozen server-side at signing time.
// Replace with your attorney's exact approved language when finalized.
export const AUTHORIZATION_VERSION = 'v1';
export const AUTHORIZATION_TEXT = (company: string) =>
  `I authorize ${company} (One Property Market) to securely store my payment card on file — including the card number, expiration date, and security code (CVV) — and to charge it on a recurring basis for my outbound-calling usage and spend, including hard costs and applicable margins, until I revoke this authorization in writing. I understand and agree that my full card details are retained on file for this purpose, I confirm I am an authorized user of the card, the billing information I provided is accurate, and I accept mutual responsibility for this arrangement.`;
