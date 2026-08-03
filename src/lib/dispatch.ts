// Dispatch AI client — talks to the dispatch-api proxy on the 1PropertyMarket project.
// Reuses the same bearer token as the analytics API (proxy validates it server-side).
import { tokenStore } from './api';

const DISPATCH_BASE =
  (import.meta as any).env?.VITE_DISPATCH_API ||
  'https://sezigczgwezeecgobuqd.supabase.co/functions/v1/dispatch-api';

async function call(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(DISPATCH_BASE);
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

export const dispatch = {
  bootstrap: () => call('bootstrap'),
  saveCampaign: (b: any) => call('campaign.save', { method: 'POST', body: b }),
  getCampaign: (slug: string) => call('campaign.get', { params: { slug } }),
  deleteCampaign: (slug: string) => call('campaign.delete', { method: 'DELETE', body: { slug } }),
  createLeads: (slug: string, leads: any[]) => call('leads.create', { method: 'POST', body: { slug, leads } }),
  listLeads: (slug: string) => call('leads.list', { params: { slug } }),
  verifyStatus: (slug: string) => call('verify.status', { params: { slug } }),
  verifyRun: (slug: string, triggerTag?: string) => call('verify.run', { method: 'POST', body: { slug, triggerTag } }),
  preview: (contactId: string) => call('dial.preview', { method: 'POST', body: { contact_id: contactId } }),
  testDial: (b: { phone: string; name?: string; address?: string }) => call('dial.test', { method: 'POST', body: b }),
  launch: (slug: string) => call('launch', { method: 'POST', body: { slug, confirm: true } }),
  monitor: (slug: string) => call('monitor', { params: { slug } }),
  createAgent: (b: any) => call('agent.create', { method: 'POST', body: b }),
};

// ---- tiny robust CSV parser (handles quotes, commas, newlines in quotes) ----
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  const headers = (nonEmpty.shift() || []).map((h) => h.trim());
  return { headers, rows: nonEmpty };
}

export const CANONICAL_FIELDS = [
  { key: 'firstName', label: 'First name', required: true, hints: ['first', 'fname', 'name', 'owner'] },
  { key: 'phone', label: 'Phone', required: true, hints: ['phone', 'mobile', 'cell', 'number', 'tel'] },
  { key: 'address', label: 'Property address', required: false, hints: ['address', 'property', 'street', 'addr'] },
  { key: 'email', label: 'Email', required: false, hints: ['email', 'e-mail', 'mail'] },
  { key: 'city', label: 'City', required: false, hints: ['city', 'town'] },
  { key: 'state', label: 'State', required: false, hints: ['state', 'st', 'province'] },
  { key: 'zip', label: 'ZIP', required: false, hints: ['zip', 'postal', 'zipcode'] },
];

export function autoMatch(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of CANONICAL_FIELDS) {
    const hit = headers.find((h) => {
      const l = h.toLowerCase().trim();
      return !used.has(h) && f.hints.some((hint) => l === hint || l.includes(hint));
    });
    if (hit) { map[f.key] = hit; used.add(hit); }
  }
  return map;
}

export const LINE_TYPE_META: Record<string, { label: string; route: string; color: string }> = {
  mobile: { label: 'Mobile', route: 'Text-first, then call', color: '#16a34a' },
  landline: { label: 'Landline', route: 'Call-only', color: '#2563eb' },
  voip: { label: 'VoIP', route: 'Call-only', color: '#7c3aed' },
  other: { label: 'Other (verified)', route: 'Call-only', color: '#0d9488' },
  invalid: { label: 'Invalid / suppressed', route: 'Never dialed', color: '#dc2626' },
  unverified: { label: 'Unverified', route: 'Blocked until verified', color: '#94a3b8' },
};
