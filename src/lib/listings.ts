// Properties / Listings API client (opm-listings edge function). Kept in its own small module
// (like dealloi.ts) rather than the large api.ts. Same opaque-bearer session auth + active-workspace
// scoping used everywhere else. Powers the Properties tab: listings CRUD, contact/teammate parties
// with roles, RealEstateAPI address auto-fill, per-workspace branding, and the user profile block.
import { tokenStore, workspaceStore } from './api';

const BASE =
  (import.meta as any).env?.VITE_OPMLISTINGS_BASE ||
  ((import.meta as any).env?.VITE_API_BASE
    ? String((import.meta as any).env.VITE_API_BASE).replace(/\/api$/, '/opm-listings')
    : 'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/opm-listings');

async function call(action: string, opts: { method?: string; params?: Record<string, any>; body?: any } = {}) {
  const url = new URL(BASE);
  url.searchParams.set('action', action);
  const ws = workspaceStore.get();
  if (ws) url.searchParams.set('workspace', ws);
  for (const [k, v] of Object.entries(opts.params || {})) { if (v === undefined || v === null || v === '') continue; url.searchParams.set(k, String(v)); }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get(); if (token) headers['Authorization'] = `Bearer ${token}`;
  const method = opts.method || 'GET';
  const body = method === 'GET' ? undefined : JSON.stringify({ ...(ws ? { workspace: ws } : {}), ...(opts.body || {}) });
  const res = await fetch(url.toString(), { method, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.detail || `Request failed (${res.status})`);
  return data;
}

export type Property = {
  id: string; workspace: string; title: string;
  status: 'on_market' | 'off_market'; visibility: 'public' | 'private';
  property_type: string | null;
  street: string | null; unit: string | null; city: string | null; state: string | null; zip: string | null; county: string | null;
  lat: number | null; lng: number | null;
  beds: number | null; baths: number | null; half_baths: number | null; sqft: number | null; lot_sqft: number | null;
  year_built: number | null; units: number | null; stories: number | null; parking: string | null; zoning: string | null;
  headline: string | null; description: string | null;
  acquisition_price: number | null; disposition_price: number | null; margin: number | null;
  media: { url: string; type: 'image' | 'video'; caption?: string }[];
  specs: Record<string, any>;
  slug: string | null; share_token: string; assigned_to: string | null;
  created_by: string | null; created_at: string; updated_at: string; published_at: string | null;
  archived?: boolean; party_count?: number;
};

export type Party = {
  id: string; property_id: string; party_kind: 'contact' | 'user'; role: string;
  contact_id: string | null; lead_id: string | null; user_id: number | null;
  name: string | null; email: string | null; phone: string | null; is_primary: boolean; note: string | null;
  user?: { id: number; name: string; email: string; title?: string; company?: string; photo_url?: string } | null;
};

export type Branding = {
  workspace: string; brand_name?: string | null; firm_name?: string | null; license_number?: string | null;
  website?: string | null; email?: string | null; phone?: string | null; address?: string | null;
  logo_key?: string | null; logo_url?: string | null; primary_color?: string | null;
};

export type Profile = {
  id: number; name: string; email: string; phone?: string | null; title?: string | null; company?: string | null;
  website?: string | null; license_number?: string | null; address?: string | null; company_phone?: string | null; photo_url?: string | null;
};

export const PROPERTY_TYPES = [
  { v: 'single_family', label: 'Single Family' },
  { v: 'multi_family', label: 'Multi Family' },
  { v: 'condo', label: 'Condo' },
  { v: 'townhouse', label: 'Townhouse' },
  { v: 'land', label: 'Land' },
  { v: 'commercial', label: 'Commercial' },
  { v: 'mixed_use', label: 'Mixed Use' },
  { v: 'other', label: 'Other' },
];

export const PARTY_ROLES = [
  'buyer', 'seller', 'tenant', 'landlord', 'broker', 'agent', 'vendor', 'attorney', 'owner_rep', 'lender', 'title', 'inspector', 'teammate', 'other',
];

export const listings = {
  list: (params?: Record<string, any>) => call('list', { params }),
  get: (id: string) => call('get', { params: { id } }),
  create: (body: Partial<Property>) => call('create', { method: 'POST', body }),
  update: (body: Partial<Property> & { id: string }) => call('update', { method: 'POST', body }),
  publish: (id: string) => call('publish', { method: 'POST', body: { id } }),
  unpublish: (id: string) => call('unpublish', { method: 'POST', body: { id } }),
  archive: (id: string) => call('archive', { method: 'POST', body: { id } }),
  unarchive: (id: string) => call('unarchive', { method: 'POST', body: { id } }),
  addressLookup: (address: string) => call('addressLookup', { method: 'POST', body: { address } }),
  assignParty: (body: Partial<Party> & { property_id: string; role: string }) => call('assignParty', { method: 'POST', body }),
  updateParty: (body: Partial<Party> & { id: string }) => call('updateParty', { method: 'POST', body }),
  removeParty: (id: string) => call('removeParty', { method: 'POST', body: { id } }),
  searchContacts: (q: string) => call('searchContacts', { params: { q } }),
  members: () => call('members', {}),
  userScopes: (userId: number) => call('userScopes', { params: { user_id: userId } }),
  setUserScope: (body: { user_id: number; workspace: string; listing_scope: 'own' | 'all' }) =>
    call('setUserScope', { method: 'POST', params: { workspace: body.workspace }, body }),
  getBranding: () => call('branding', {}),
  setBranding: (body: Partial<Branding>) => call('setBranding', { method: 'POST', body }),
  getProfile: () => call('profile', {}),
  setProfile: (body: Partial<Profile>) => call('setProfile', { method: 'POST', body }),
};
