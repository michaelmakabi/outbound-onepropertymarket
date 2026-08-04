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
  // skip-trace aware ingest: each lead = { ownerName, address, email, numbers:[{phone,label}], fields, raw }
  ingestLeads: (slug: string, leads: any[]) => call('leads.ingest', { method: 'POST', body: { slug, leads } }),
  resolveLead: (slug: string, phone: string) => call('lead.resolve', { method: 'POST', body: { slug, phone } }),
  listLeads: (slug: string) => call('leads.list', { params: { slug } }),
  verifyStatus: (slug: string) => call('verify.status', { params: { slug } }),
  verifyRun: (slug: string, limit = 200) => call('verify.run', { method: 'POST', body: { slug, limit } }),
  exportByLead: (slug: string) => call('export.byLead', { params: { slug } }),
  exportByNumber: (slug: string) => call('export.byNumber', { params: { slug } }),
  preview: (contactId: string) => call('dial.preview', { method: 'POST', body: { contact_id: contactId } }),
  testDial: (b: { phone: string; name?: string; address?: string }) => call('dial.test', { method: 'POST', body: b }),
  launch: (slug: string) => call('launch', { method: 'POST', body: { slug, confirm: true } }),
  monitor: (slug: string) => call('monitor', { params: { slug } }),
  createAgent: (b: any) => call('agent.create', { method: 'POST', body: b }),
};

// ---- skip-trace explosion --------------------------------------------------
// Real skip-trace lists put many phone numbers on one row (owner, relatives, tenants…),
// plus a mess of other columns. explodeSkipTrace turns each row into ONE property lead
// carrying N labelled numbers, preserving every other column as fields + the raw row.
const PHONE_COL_RE = /(phone|mobile|cell|tel|wireless|landline|voip|contact\s*number|ph\s*\d)/i;
const PHONE_META_RE = /(type|dnc|status|carrier|score|date|litig|verified|valid)/i;

function cleanLabel(header: string): string {
  const h = header.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  // drop bare "phone"/"number" noise but keep provenance like "Relative 2", "Owner", "Wireless 1"
  const stripped = h.replace(/\b(phone|number|no\.?)\b/gi, '').replace(/\s+/g, ' ').trim();
  const label = (stripped || h).replace(/\b\w/g, (m) => m.toUpperCase());
  return label || 'Contact';
}

function splitNumbers(value: string): string[] {
  return String(value || '')
    .split(/[;,/|\n]+/)
    .map((s) => s.trim())
    .filter((s) => (s.replace(/\D/g, '').length >= 7));
}

export interface SkipLead {
  ownerName: string; address: string; email: string;
  numbers: { phone: string; label: string }[];
  fields: Record<string, string>; raw: Record<string, string>;
}

export function explodeSkipTrace(headers: string[], rows: string[][], map: Record<string, string>): SkipLead[] {
  const ownerH = map.firstName || headers.find((h) => /owner|first\s*name|\bname\b/i.test(h)) || '';
  const addrH = map.address || '';
  const emailH = map.email || '';
  const phoneCols = headers.filter((h) => PHONE_COL_RE.test(h) && !PHONE_META_RE.test(h));
  const coreSet = new Set([ownerH, addrH, emailH, map.city, map.state, map.zip].filter(Boolean));
  const out: SkipLead[] = [];
  for (const r of rows) {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    const numbers: { phone: string; label: string }[] = [];
    for (const h of phoneCols) {
      const parts = splitNumbers(obj[h]);
      parts.forEach((p, idx) => numbers.push({ phone: p, label: cleanLabel(h) + (parts.length > 1 ? ` #${idx + 1}` : '') }));
    }
    if (!numbers.length) continue;
    const fields: Record<string, string> = {};
    for (const h of headers) {
      if (coreSet.has(h) || phoneCols.includes(h)) continue;
      if (obj[h]) fields[h] = obj[h];
    }
    out.push({ ownerName: ownerH ? obj[ownerH] : '', address: addrH ? obj[addrH] : '', email: emailH ? obj[emailH] : '', numbers, fields, raw: obj });
  }
  return out;
}

export function skipTraceStats(leads: SkipLead[]) {
  let numbers = 0; const byLabel: Record<string, number> = {};
  for (const l of leads) for (const n of l.numbers) { numbers++; byLabel[n.label] = (byLabel[n.label] || 0) + 1; }
  return { leads: leads.length, numbers, avg: leads.length ? (numbers / leads.length) : 0, byLabel };
}

// ---- xlsx download (SheetJS lazy-loaded from CDN, no bundled dependency) ----
export async function downloadSheet(filename: string, rows: any[], sheetName = 'Sheet1') {
  if (!rows.length) { alert('Nothing to export yet.'); return; }
  const XLSX: any = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const ws = XLSX.utils.json_to_sheet(rows);
  // auto-size columns to content for a clean, readable sheet
  const cols = Object.keys(rows[0]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.min(48, Math.max(c.length + 2, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

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
