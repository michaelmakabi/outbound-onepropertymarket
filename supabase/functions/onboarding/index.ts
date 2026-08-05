// One Property Market — Outbound: customer onboarding + card authorization.
// Super-admin only. Custom bearer-token auth (same sessions model as /api).
//
// Sensitive-card design:
//   * Consent is stored in card_authorizations (no raw card).
//   * Full card is AES-GCM encrypted in the edge function (key = CARD_ENC_KEY,
//     a base64 32-byte secret) and only the ciphertext lands in card_vault.
//   * CVV is retained ONLY until cvv_purge_after (onboarding window), then a
//     scheduled job nulls it. Reveal returns the CVV only while it still exists.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto), CARD_ENC_KEY (base64 32B),
//      STRIPE_SECRET_KEY (or STRIPE_KEY / STRIPE), APP_BASE_URL (optional).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_BASE = Deno.env.get('APP_BASE_URL') || 'https://outbound.1propertymarket.com';
const CVV_WINDOW_DAYS = Number(Deno.env.get('CVV_WINDOW_DAYS') ?? '14');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// ---------------- auth (mirrors /api) ----------------
async function getUser(client: any, req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data: s } = await client.from('sessions').select('user_id, expires_at').eq('token', token).maybeSingle();
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const { data: u } = await client.from('users').select('id, name, username, role, disabled').eq('id', s.user_id).maybeSingle();
  if (!u || u.disabled) return null;
  return u;
}

// ---------------- AES-GCM encryption (app-held key) ----------------
function b64ToBytes(b64: string): Uint8Array { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function bytesToB64(bytes: Uint8Array): string { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
async function encKey(): Promise<CryptoKey> {
  const raw = Deno.env.get('CARD_ENC_KEY') || '';
  if (!raw) throw new Error('CARD_ENC_KEY secret is not set — cannot store card data.');
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error('CARD_ENC_KEY must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encrypt(plain: string): Promise<string> {
  const key = await encKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv, 0); out.set(ct, iv.length);
  return bytesToB64(out);
}
async function decrypt(b64: string): Promise<string> {
  const key = await encKey();
  const all = b64ToBytes(b64);
  const iv = all.slice(0, 12); const ct = all.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------------- Stripe (form-encoded REST) ----------------
function stripeKey(): string {
  return Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('STRIPE_KEY') || Deno.env.get('STRIPE') || '';
}
async function stripe(path: string, method = 'POST', form?: Record<string, string>) {
  const key = stripeKey();
  if (!key) throw new Error('Stripe secret key is not configured.');
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error (${res.status})`);
  return data;
}

async function ensureStripeCustomer(client: any, slug: string, email?: string): Promise<string> {
  const { data: ws } = await client.from('billing_workspaces').select('stripe_customer_id, display_name').eq('workspace_slug', slug).maybeSingle();
  if (ws?.stripe_customer_id) return ws.stripe_customer_id;
  const cust = await stripe('customers', 'POST', { name: ws?.display_name || slug, ...(email ? { email } : {}), 'metadata[workspace_slug]': slug });
  await client.from('billing_workspaces').update({ stripe_customer_id: cust.id, updated_at: new Date().toISOString() }).eq('workspace_slug', slug);
  return cust.id;
}

function audit(client: any, user: any, action: string, detail: string) {
  return client.from('billing_audit_log').insert({ actor_user_id: user.id, action, entity_type: 'onboarding', detail: { note: detail } }).then(() => {}, () => {});
}

// ---------------- handler ----------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const str = (k: string) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };

  try {
    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (user.role !== 'super_admin') return json({ error: 'Onboarding is restricted to super admins.' }, 403);

    const body = (req.method === 'POST' || req.method === 'PATCH') ? await req.json().catch(() => ({})) : {};

    // ---- list accounts (with onboarding status) ----
    if (action === 'accounts') {
      const { data: accounts } = await client.from('billing_workspaces').select('*').order('created_at', { ascending: false });
      const slugs = (accounts || []).map((a: any) => a.workspace_slug);
      const [{ data: auths }, { data: pms }] = await Promise.all([
        client.from('card_authorizations').select('workspace_slug, signer_name, signed_at, revoked_at').in('workspace_slug', slugs.length ? slugs : ['']),
        client.from('payment_methods').select('workspace_slug, brand, last4, added_via').in('workspace_slug', slugs.length ? slugs : ['']),
      ]);
      const authBy: Record<string, any> = {}; for (const a of (auths || [])) if (!a.revoked_at) authBy[a.workspace_slug] = a;
      const pmBy: Record<string, any> = {}; for (const p of (pms || [])) pmBy[p.workspace_slug] = p;
      const rows = (accounts || []).map((a: any) => ({
        ...a,
        has_authorization: !!authBy[a.workspace_slug],
        authorization: authBy[a.workspace_slug] || null,
        card_on_file: pmBy[a.workspace_slug] ? `${pmBy[a.workspace_slug].brand} ····${pmBy[a.workspace_slug].last4}` : null,
      }));
      return json({ accounts: rows });
    }

    // ---- account detail ----
    if (action === 'account') {
      const slug = str('slug') || body.slug;
      if (!slug) return json({ error: 'slug required' }, 400);
      const [{ data: ws }, { data: auth }, { data: pms }, { data: vault }, { data: retell }] = await Promise.all([
        client.from('billing_workspaces').select('*').eq('workspace_slug', slug).maybeSingle(),
        client.from('card_authorizations').select('*').eq('workspace_slug', slug).order('signed_at', { ascending: false }).limit(1).maybeSingle(),
        client.from('payment_methods').select('*').eq('workspace_slug', slug).order('created_at', { ascending: false }),
        client.from('card_vault').select('id, payment_method_id, exp_month, exp_year, cvv_ciphertext, cvv_purge_after, keyed_into_retell_at, last_revealed_at, created_at').eq('workspace_slug', slug),
        client.from('workspaces').select('slug, api_key').eq('slug', slug).maybeSingle(),
      ]);
      const vaultSafe = (vault || []).map((v: any) => ({ id: v.id, payment_method_id: v.payment_method_id, exp_month: v.exp_month, exp_year: v.exp_year, has_cvv: !!v.cvv_ciphertext, cvv_purge_after: v.cvv_purge_after, keyed_into_retell_at: v.keyed_into_retell_at, last_revealed_at: v.last_revealed_at }));
      return json({ workspace: ws, authorization: auth, payment_methods: pms || [], vault: vaultSafe, retell_connected: !!retell?.api_key });
    }

    // ---- create account (tenant) ----
    if (action === 'create_account') {
      const slug = String(body.workspace_slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!slug) return json({ error: 'A workspace slug is required (letters, numbers, - and _).' }, 400);
      const { data: existing } = await client.from('billing_workspaces').select('workspace_slug').eq('workspace_slug', slug).maybeSingle();
      if (existing) return json({ error: 'An account with that slug already exists.' }, 400);
      const { error } = await client.from('billing_workspaces').insert({
        workspace_slug: slug,
        display_name: body.display_name || slug,
        billing_mode: ['margin_split', 'full_retail', 'live_metered'].includes(body.billing_mode) ? body.billing_mode : 'full_retail',
        default_multiplier: Number(body.default_multiplier) >= 1 && Number(body.default_multiplier) <= 10 ? Number(body.default_multiplier) : 1.0,
        status: 'onboarding',
      });
      if (error) return json({ error: error.message }, 400);
      await audit(client, user, 'account_created', `${slug}`);
      return json({ ok: true, workspace_slug: slug });
    }

    // ---- save signed authorization / consent ----
    if (action === 'save_authorization') {
      const slug = body.workspace_slug;
      if (!slug || !body.signer_name || !body.authorization_text_snapshot) return json({ error: 'workspace, signer name, and consent text are required.' }, 400);
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
      const { data, error } = await client.from('card_authorizations').insert({
        workspace_slug: slug,
        account_email: body.account_email || null,
        signer_name: body.signer_name,
        authorization_text_version: body.authorization_text_version || 'v1',
        authorization_text_snapshot: body.authorization_text_snapshot,
        signature_image: body.signature_image || null,
        signed_ip: ip,
        signed_user_agent: req.headers.get('user-agent') || null,
        created_by: user.id,
      }).select('id').maybeSingle();
      if (error) return json({ error: error.message }, 400);
      await audit(client, user, 'authorization_signed', `${slug} · ${body.signer_name}`);
      return json({ ok: true, authorization_id: data.id });
    }

    // ---- Stripe SetupIntent link (hosted Checkout in setup mode) ----
    if (action === 'setup_link') {
      const slug = body.workspace_slug;
      if (!slug) return json({ error: 'workspace required' }, 400);
      const customer = await ensureStripeCustomer(client, slug, body.email);
      const session = await stripe('checkout/sessions', 'POST', {
        mode: 'setup', customer,
        'payment_method_types[0]': 'card',
        success_url: `${APP_BASE}/onboarding?slug=${encodeURIComponent(slug)}&setup=success`,
        cancel_url: `${APP_BASE}/onboarding?slug=${encodeURIComponent(slug)}&setup=cancel`,
      });
      await audit(client, user, 'setup_link_created', `${slug}`);
      return json({ ok: true, url: session.url, customer });
    }

    // ---- pull the card the customer saved via the Stripe link into payment_methods ----
    if (action === 'sync_stripe_card') {
      const slug = body.workspace_slug;
      const { data: ws } = await client.from('billing_workspaces').select('stripe_customer_id').eq('workspace_slug', slug).maybeSingle();
      if (!ws?.stripe_customer_id) return json({ error: 'No Stripe customer yet — create a setup link first.' }, 400);
      const list = await stripe(`payment_methods?customer=${ws.stripe_customer_id}&type=card`, 'GET');
      const pm = (list.data || [])[0];
      if (!pm) return json({ ok: true, found: false });
      await client.from('payment_methods').insert({
        workspace_slug: slug, cardholder_name: pm.billing_details?.name || null,
        brand: pm.card?.brand, last4: pm.card?.last4, exp_month: pm.card?.exp_month, exp_year: pm.card?.exp_year,
        billing_address: pm.billing_details?.address || null, stripe_payment_method_id: pm.id, added_via: 'self_serve', added_by: user.id,
      });
      await audit(client, user, 'card_synced', `${slug} · ${pm.card?.brand} ${pm.card?.last4}`);
      return json({ ok: true, found: true, brand: pm.card?.brand, last4: pm.card?.last4 });
    }

    // ---- team enters the full card (stored encrypted for manual Retell keying) ----
    if (action === 'save_card_manual') {
      const slug = body.workspace_slug;
      const pan = String(body.card_number || '').replace(/\s+/g, '');
      const cvv = String(body.cvv || '').trim();
      const exp_month = Number(body.exp_month), exp_year = Number(body.exp_year);
      if (!slug || pan.length < 12 || !exp_month || !exp_year) return json({ error: 'workspace, card number, and expiry are required.' }, 400);
      const brand = /^4/.test(pan) ? 'Visa' : /^5[1-5]/.test(pan) ? 'Mastercard' : /^3[47]/.test(pan) ? 'Amex' : /^6/.test(pan) ? 'Discover' : 'Card';
      const { data: pm, error: pmErr } = await client.from('payment_methods').insert({
        workspace_slug: slug, cardholder_name: body.cardholder_name || null,
        brand, last4: pan.slice(-4), exp_month, exp_year, billing_address: body.billing_address || null,
        added_via: 'admin', added_by: user.id, authorization_id: body.authorization_id || null,
      }).select('id').maybeSingle();
      if (pmErr) return json({ error: pmErr.message }, 400);
      const purge = new Date(Date.now() + CVV_WINDOW_DAYS * 86400000).toISOString();
      const { error: vErr } = await client.from('card_vault').insert({
        payment_method_id: pm.id, workspace_slug: slug,
        pan_ciphertext: await encrypt(pan),
        cvv_ciphertext: cvv ? await encrypt(cvv) : null,
        cvv_purge_after: cvv ? purge : null,
        exp_month, exp_year,
      });
      if (vErr) return json({ error: vErr.message }, 400);
      await audit(client, user, 'card_stored', `${slug} · ${brand} ${pan.slice(-4)} · CVV window ${CVV_WINDOW_DAYS}d`);
      return json({ ok: true, payment_method_id: pm.id, brand, last4: pan.slice(-4) });
    }

    // ---- one-time full-card reveal (to key into Retell) ----
    if (action === 'reveal_card') {
      const vaultId = body.vault_id;
      if (!vaultId) return json({ error: 'vault_id required' }, 400);
      const { data: v } = await client.from('card_vault').select('*').eq('id', vaultId).maybeSingle();
      if (!v) return json({ error: 'not found' }, 404);
      const pan = await decrypt(v.pan_ciphertext);
      const cvv = v.cvv_ciphertext ? await decrypt(v.cvv_ciphertext) : null;
      await client.from('card_vault').update({ last_revealed_at: new Date().toISOString() }).eq('id', vaultId);
      await audit(client, user, 'card_revealed', `vault ${vaultId}${cvv ? ' (with CVV)' : ' (CVV purged)'}`);
      return json({ ok: true, card_number: pan, cvv, exp_month: v.exp_month, exp_year: v.exp_year, cvv_available: !!cvv });
    }

    // ---- mark that the card has been keyed into Retell ----
    if (action === 'mark_keyed') {
      const vaultId = body.vault_id;
      if (!vaultId) return json({ error: 'vault_id required' }, 400);
      await client.from('card_vault').update({ keyed_into_retell_at: new Date().toISOString(), keyed_by: user.id }).eq('id', vaultId);
      await audit(client, user, 'card_keyed_into_retell', `vault ${vaultId}`);
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 404);
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});
