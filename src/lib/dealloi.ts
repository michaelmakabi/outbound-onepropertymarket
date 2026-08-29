// Deal-terms negotiation tracker + LOI document/share helpers. Kept in their own small module (rather
// than the large api.ts) so the profile screen can import them directly. Same opaque-bearer auth.
import { tokenStore } from './api';

const BASE = (name: string) =>
  ((import.meta as any).env?.VITE_API_BASE
    ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, `/${name}`)
    : `https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/${name}`);

async function fnCall(base: string, action: string | null, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(base);
  if (action) url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(opts.params || {})) { if (v === undefined || v === null || v === '') continue; url.searchParams.set(k, String(v)); }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get(); if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url.toString(), { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const TERMS = BASE('opm-terms');
const LOI = BASE('opm-loi');
const LOIVIEW = BASE('opm-loi-view');

export type TermSide = 'ours' | 'theirs';

// Current ours/theirs + delta + full dated history for a lead.
export const dealTerms = (leadId: string) => fnCall(TERMS, 'get', { method: 'POST', body: { lead_id: leadId } });
// Append a new dated terms entry (the customer's counter, or a manual update of our position).
export const dealTermsAdd = (leadId: string, entry: { side: TermSide; price?: any; down_payment?: any; closing_days?: any; inspection_days?: any; note?: string; source?: string }) =>
  fnCall(TERMS, 'add', { method: 'POST', body: { lead_id: leadId, ...entry } });
// Versioned LOI documents (each generation, timestamped + attributed).
export const loiDocuments = (leadId: string) => fnCall(LOI, 'documents', { params: { lead_id: leadId } });
// Email compose metadata: { subject, intro, share_url } for the latest LOI (compose + secure link).
export const loiEmailMeta = (leadId: string) => fnCall(LOIVIEW, null, { method: 'POST', body: { lead_id: leadId } });
