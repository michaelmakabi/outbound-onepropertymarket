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
  listing_intent: 'for_sale' | 'for_lease' | 'to_buy' | 'to_rent' | null;
  property_type: string | null;
  street: string | null; unit: string | null; city: string | null; state: string | null; zip: string | null; county: string | null;
  lat: number | null; lng: number | null;
  beds: number | null; baths: number | null; half_baths: number | null; sqft: number | null; lot_sqft: number | null;
  year_built: number | null; units: number | null; stories: number | null; parking: string | null; zoning: string | null;
  headline: string | null; description: string | null; public_description: string | null; private_notes: string | null;
  highlights: string[];
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
  { v: 'duplex', label: 'Duplex' },
  { v: 'triplex', label: 'Triplex' },
  { v: 'fourplex', label: 'Fourplex' },
  { v: 'apartment', label: 'Apartment Building' },
  { v: 'condo', label: 'Condo' },
  { v: 'co_op', label: 'Co-op' },
  { v: 'townhouse', label: 'Townhouse' },
  { v: 'land', label: 'Land / Lot' },
  { v: 'mixed_use', label: 'Mixed Use' },
  { v: 'commercial', label: 'Commercial' },
  { v: 'retail', label: 'Retail' },
  { v: 'office', label: 'Office' },
  { v: 'industrial', label: 'Industrial' },
  { v: 'warehouse', label: 'Warehouse' },
  { v: 'hospitality', label: 'Hotel / Motel' },
  { v: 'medical', label: 'Medical' },
  { v: 'self_storage', label: 'Self Storage' },
  { v: 'mobile_home', label: 'Mobile / Manufactured' },
  { v: 'farm_ranch', label: 'Farm / Ranch' },
  { v: 'new_construction', label: 'New Construction' },
  { v: 'special_purpose', label: 'Special Purpose' },
  { v: 'other', label: 'Other' },
];

// What the listing is for. A property record can sit on either side of a deal, so the intent
// pairs with the party it's associated with (seller/landlord = we hold it; buyer/tenant = we want it).
export const LISTING_INTENTS = [
  { v: 'for_sale', label: 'For Sale', hint: 'We are selling this - associate a seller.' },
  { v: 'for_lease', label: 'For Lease', hint: 'We are leasing this out - associate a landlord.' },
  { v: 'to_buy', label: 'To Buy', hint: 'A buyer is looking for this - associate a buyer.' },
  { v: 'to_rent', label: 'To Rent', hint: 'A tenant is looking for this - associate a tenant.' },
];

export const PARTY_ROLES = [
  'buyer', 'seller', 'tenant', 'landlord', 'broker', 'agent', 'vendor', 'attorney', 'owner_rep', 'lender', 'title', 'inspector', 'teammate', 'other',
];

// Extended specification fields stored inside the `specs` jsonb (so we don't need a column each).
// kind drives the input: money -> comma-formatted $, percent -> %, select -> dropdown, number/text plain.
export type SpecKind = 'number' | 'money' | 'percent' | 'text' | 'select';
export const SPEC_FIELDS: { key: string; label: string; kind: SpecKind; icon: string; options?: string[] }[] = [
  { key: 'lot_acres', label: 'Lot (acres)', kind: 'number', icon: 'Trees' },
  { key: 'garage_spaces', label: 'Garage spaces', kind: 'number', icon: 'Car' },
  { key: 'pool', label: 'Pool', kind: 'select', icon: 'Waves', options: ['', 'Yes', 'No'] },
  { key: 'basement', label: 'Basement', kind: 'select', icon: 'Layers', options: ['', 'Full', 'Partial', 'Finished', 'None'] },
  { key: 'heating', label: 'Heating', kind: 'text', icon: 'Flame' },
  { key: 'cooling', label: 'Cooling', kind: 'text', icon: 'Snowflake' },
  { key: 'roof', label: 'Roof', kind: 'text', icon: 'Home' },
  { key: 'exterior', label: 'Exterior', kind: 'text', icon: 'Building' },
  { key: 'flood_zone', label: 'Flood zone', kind: 'text', icon: 'Droplets' },
  { key: 'apn', label: 'Parcel / APN', kind: 'text', icon: 'Hash' },
  { key: 'hoa_fee', label: 'HOA (monthly)', kind: 'money', icon: 'Receipt' },
  { key: 'taxes_annual', label: 'Taxes (annual)', kind: 'money', icon: 'Landmark' },
  { key: 'gross_rent', label: 'Gross rent (monthly)', kind: 'money', icon: 'DollarSign' },
  { key: 'noi', label: 'NOI (annual)', kind: 'money', icon: 'TrendingUp' },
  { key: 'cap_rate', label: 'Cap rate', kind: 'percent', icon: 'Percent' },
  { key: 'occupancy', label: 'Occupancy', kind: 'percent', icon: 'Users' },
];

// Public host for listing teaser pages (Phase 2 pages are served from here).
export const PUBLIC_HOST = 'outbound.onepropertymarket.com';

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
  // Upload a logo / profile photo to the public media bucket. `data` is a data: URL (base64).
  // Returns { url } - store that in logo_url / photo_url.
  uploadImage: (body: { data: string; kind: 'logo' | 'photo'; content_type?: string }) =>
    call('image_upload', { method: 'POST', body }) as Promise<{ url: string; path: string }>,
};
