// One Property Market — Outbound: customer onboarding + card authorization + billing.
// Super-admin only (except autocharge_run / credits_debit_run, which the guarded cron
// calls with a secret key).
// Card storage: full card + CVV AES-GCM encrypted (CARD_ENC_KEY), kept on file under the
// customer's signed authorization + mutual-responsibility consent.
//
// Billing engines (per account, billing_workspaces.billing_engine):
//   arrears_sweep   — usage accrues; card charged in arrears by autocharge_run (default).
//   prepaid_credits — SaaS mode: customer prepays credits ($1 = 1 credit); usage debits
//                     credits at (Retell hard_cost x per-account multiplier); card charged
//                     only to top up (manual or auto-refill). Handled by credits_debit_run.
//   split_margin    — card lives in Retell (Retell charges cost); 1PM charges margin only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_BASE = Deno.env.get('APP_BASE_URL') || 'https://outbound.1propertymarket.com';
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};
const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const sb = () => createClient(Deno.env.get('SUPABASE_URL'), SVC);
const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

async function getUser(client, req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  if (token === SVC) return { id: 0, role: 'super_admin', name: 'service' };
  const { data: s } = await client.from('sessions').select('user_id, expires_at').eq('token', token).maybeSingle();
  if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
  const { data: u } = await client.from('users').select('id, name, username, role, disabled').eq('id', s.user_id).maybeSingle();
  if (!u || u.disabled) return null;
  return u;
}

// ---------------- AES-GCM encryption ----------------
function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function bytesToB64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
async function encKey() {
  const raw = Deno.env.get('CARD_ENC_KEY') || '';
  if (!raw) throw new Error('CARD_ENC_KEY secret is not set — cannot store card data.');
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error('CARD_ENC_KEY must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encrypt(plain) {
  const key = await encKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv, 0); out.set(ct, iv.length);
  return bytesToB64(out);
}
async function decrypt(b64) {
  const key = await encKey();
  const all = b64ToBytes(b64);
  const iv = all.slice(0, 12); const ct = all.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------------- Stripe ----------------
function stripeKey() {
  return Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('STRIPE_KEY') || Deno.env.get('STRIPE') || '';
}
async function stripe(path, method = 'POST', form) {
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
async function ensureStripeCustomer(client, slug, email) {
  const { data: ws } = await client.from('billing_workspaces').select('stripe_customer_id, display_name').eq('workspace_slug', slug).maybeSingle();
  if (ws?.stripe_customer_id) return ws.stripe_customer_id;
  const cust = await stripe('customers', 'POST', { name: ws?.display_name || slug, ...(email ? { email } : {}), 'metadata[workspace_slug]': slug });
  await client.from('billing_workspaces').update({ stripe_customer_id: cust.id, updated_at: new Date().toISOString() }).eq('workspace_slug', slug);
  return cust.id;
}
// Charge the default card on file for a one-off amount (used by credit top-ups / refills).
// Returns { ok, invoice_id?, error? }. Never throws.
async function chargeCardOnFile(client, bw, amountDollars, description) {
  try {
    const cents = Math.round(Number(amountDollars) * 100);
    if (!bw?.stripe_customer_id) return { ok: false, error: 'no_customer' };
    if (cents < 50) return { ok: false, error: 'below_stripe_minimum' };
    let pm = null;
    try { const cust = await stripe(`customers/${bw.stripe_customer_id}`, 'GET'); pm = cust?.invoice_settings?.default_payment_method; } catch (_e) { /* below */ }
    if (!pm) return { ok: false, error: 'no_card_on_file' };
    await stripe('invoiceitems', 'POST', { customer: bw.stripe_customer_id, amount: String(cents), currency: 'usd', description });
    const inv = await stripe('invoices', 'POST', { customer: bw.stripe_customer_id, collection_method: 'charge_automatically', auto_advance: 'false', 'metadata[workspace_slug]': bw.workspace_slug, 'metadata[kind]': 'credit_topup' });
    const fin = await stripe(`invoices/${inv.id}/finalize`, 'POST');
    let paid = fin;
    if (fin.status !== 'paid') { try { paid = await stripe(`invoices/${inv.id}/pay`, 'POST'); } catch (e) { return { ok: false, error: String(e?.message ?? e), invoice_id: inv.id }; } }
    if (paid.status === 'paid') return { ok: true, invoice_id: paid.id };
    return { ok: false, error: paid.status || 'unpaid', invoice_id: paid.id };
  } catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
}
function audit(client, user, action, detail) {
  return client.from('billing_audit_log').insert({ actor_user_id: user.id, action, entity_type: 'onboarding', detail: { note: detail } }).then(() => {}, () => {});
}

// ---------------- Credit wallet helpers ----------------
async function getOrCreateWallet(client, slug) {
  const { data } = await client.from('credit_wallets').select('*').eq('workspace_slug', slug).maybeSingle();
  if (data) return data;
  const { data: created } = await client.from('credit_wallets').insert({ workspace_slug: slug }).select('*').maybeSingle();
  return created || { workspace_slug: slug, balance_credits: 0, refill_mode: 'manual', refill_threshold: 20, refill_amount: 100 };
}
async function fetchUnbilledUsage(client, slug) {
  const rows = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await client.from('cost_ledger').select('id,hard_cost').eq('workspace_slug', slug).is('billed_invoice_id', null).gt('hard_cost', 0).range(f, f + 999);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

// ---------------- Automatic charging (arrears sweep) ----------------
async function autochargeRun(client, url, req) {
  const key = url.searchParams.get('key');
  const { data: st } = await client.from('billing_settings').select('*').eq('id', 1).maybeSingle();
  const viaCron = !!(key && st && key === st.cron_secret);
  if (!viaCron) {
    const u = await getUser(client, req);
    if (!u || u.role !== 'super_admin') return json({ error: 'unauthorized' }, 401);
  }
  if (!st) return json({ ok: true, ran: false, reason: 'no_settings' });
  if (!st.auto_charge_enabled) return json({ ok: true, ran: false, reason: 'auto_charge_disabled' });
  if (!stripeKey()) return json({ ok: false, ran: false, reason: 'no_stripe_key' });

  const minAmt = Number(st.min_charge_amount || 1);
  const cooldownMs = Number(st.cooldown_hours || 20) * 3600000;
  const log = (bw, amount, events, invId, localId, status, detail) =>
    client.from('autocharge_log').insert({ workspace_slug: bw.workspace_slug, amount, events, stripe_invoice_id: invId, local_invoice_id: localId, status, detail }).then(() => {}, () => {});

  // Only arrears-sweep accounts. Prepaid-credit accounts bill through credits_debit_run,
  // and split-margin accounts are charged by Retell directly — never sweep them here.
  const { data: bws } = await client.from('billing_workspaces').select('*').eq('status', 'active').eq('billing_engine', 'arrears_sweep');
  const results = [];
  for (const bw of bws || []) {
    if (!bw.stripe_customer_id) { results.push({ ws: bw.workspace_slug, status: 'skipped_no_customer' }); continue; }
    const { data: last } = await client.from('autocharge_log').select('created_at').eq('workspace_slug', bw.workspace_slug).eq('status', 'charged').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (last && (Date.now() - new Date(last.created_at).getTime()) < cooldownMs) { results.push({ ws: bw.workspace_slug, status: 'skipped_cooldown' }); continue; }
    const unbilled = [];
    for (let f = 0; ; f += 1000) {
      const { data } = await client.from('cost_ledger').select('id,billable_amount').eq('workspace_slug', bw.workspace_slug).is('billed_invoice_id', null).gt('billable_amount', 0).range(f, f + 999);
      unbilled.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const amount = Math.round(unbilled.reduce((s, r) => s + Number(r.billable_amount || 0), 0) * 100) / 100;
    if (amount < minAmt || Math.round(amount * 100) < 50) { results.push({ ws: bw.workspace_slug, status: 'skipped_below_min', amount }); continue; }
    let pm = null;
    try { const cust = await stripe(`customers/${bw.stripe_customer_id}`, 'GET'); pm = cust?.invoice_settings?.default_payment_method; } catch (_e) { /* below */ }
    if (!pm) { await log(bw, amount, unbilled.length, null, null, 'skipped_no_card', null); results.push({ ws: bw.workspace_slug, status: 'skipped_no_card', amount }); continue; }
    const localId = crypto.randomUUID();
    try {
      await stripe('invoiceitems', 'POST', { customer: bw.stripe_customer_id, amount: String(Math.round(amount * 100)), currency: 'usd', description: `${bw.display_name || bw.workspace_slug} — AI calling usage (${unbilled.length} events)` });
      const inv = await stripe('invoices', 'POST', { customer: bw.stripe_customer_id, collection_method: 'charge_automatically', auto_advance: 'false', 'metadata[workspace_slug]': bw.workspace_slug, 'metadata[local_invoice_id]': localId });
      const fin = await stripe(`invoices/${inv.id}/finalize`, 'POST');
      let paid = fin;
      if (fin.status !== 'paid') { try { paid = await stripe(`invoices/${inv.id}/pay`, 'POST'); } catch (e) { paid = { id: inv.id, status: 'payment_failed', _err: String(e?.message ?? e) }; } }
      if (paid.status === 'paid') {
        const ids = unbilled.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 500) await client.from('cost_ledger').update({ billed_invoice_id: localId }).in('id', ids.slice(i, i + 500));
        await log(bw, amount, unbilled.length, paid.id, localId, 'charged', null);
        results.push({ ws: bw.workspace_slug, status: 'charged', amount, invoice: paid.id });
      } else {
        await log(bw, amount, unbilled.length, paid.id, null, 'failed', paid._err || paid.status);
        results.push({ ws: bw.workspace_slug, status: 'failed', amount, detail: paid._err || paid.status });
      }
    } catch (e) {
      await log(bw, amount, unbilled.length, null, null, 'failed', String(e?.message ?? e));
      results.push({ ws: bw.workspace_slug, status: 'failed', amount, detail: String(e?.message ?? e) });
    }
  }
  const charged = results.filter((r) => r.status === 'charged');
  return json({ ok: true, ran: true, via: viaCron ? 'cron' : 'manual', charged_count: charged.length, charged_total: Math.round(charged.reduce((s, r) => s + (r.amount || 0), 0) * 100) / 100, results });
}

// ---------------- Prepaid credits sweep (SaaS mode) ----------------
// Debits credits for usage on prepaid_credits accounts, then auto-refills the card if the
// wallet is set to auto and the master auto-charge toggle is on. `dry_run=1` computes the
// debit and refill decision WITHOUT touching balances, the ledger, or the card.
async function creditsDebitRun(client, url, req) {
  const key = url.searchParams.get('key');
  const dry = url.searchParams.get('dry_run') === '1';
  const onlySlug = url.searchParams.get('slug');
  const { data: st } = await client.from('billing_settings').select('*').eq('id', 1).maybeSingle();
  const viaCron = !!(key && st && key === st.cron_secret);
  if (!viaCron) {
    const u = await getUser(client, req);
    if (!u || u.role !== 'super_admin') return json({ error: 'unauthorized' }, 401);
  }
  const masterOn = !!st?.auto_charge_enabled;
  let q = client.from('billing_workspaces').select('*').eq('status', 'active').eq('billing_engine', 'prepaid_credits');
  if (onlySlug) q = q.eq('workspace_slug', onlySlug);
  const { data: bws } = await q;
  const results = [];
  for (const bw of bws || []) {
    const mult = Number(bw.default_multiplier || 1);
    const unbilled = await fetchUnbilledUsage(client, bw.workspace_slug);
    const hard = unbilled.reduce((s, r) => s + Number(r.hard_cost || 0), 0);
    const debit = round4(hard * mult);
    const wallet = await getOrCreateWallet(client, bw.workspace_slug);
    let balance = round4(wallet.balance_credits || 0);
    const batchId = crypto.randomUUID();
    let debited = 0;
    if (debit > 0 && unbilled.length) {
      debited = debit;
      if (!dry) {
        balance = round4(balance - debit);
        await client.from('credit_ledger').insert({ workspace_slug: bw.workspace_slug, delta: -debit, reason: 'usage', source_ref: batchId, balance_after: balance, meta: { events: unbilled.length, multiplier: mult, hard_cost: round4(hard) } });
        await client.from('credit_wallets').update({ balance_credits: balance, updated_at: new Date().toISOString() }).eq('workspace_slug', bw.workspace_slug);
        const ids = unbilled.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 500) await client.from('cost_ledger').update({ billed_invoice_id: batchId }).in('id', ids.slice(i, i + 500));
      } else {
        balance = round4(balance - debit);
      }
    }
    // Auto-refill decision.
    let refill = null;
    const wantRefill = wallet.refill_mode === 'auto' && balance < Number(wallet.refill_threshold || 0);
    if (wantRefill) {
      const amt = Number(wallet.refill_amount || 0);
      if (!masterOn) refill = { skipped: 'master_toggle_off', would_charge: amt };
      else if (!(amt >= 0.5)) refill = { skipped: 'amount_below_min', would_charge: amt };
      else if (!stripeKey()) refill = { skipped: 'no_stripe_key', would_charge: amt };
      else if (dry) refill = { would_charge: amt };
      else {
        const r = await chargeCardOnFile(client, bw, amt, `${bw.display_name || bw.workspace_slug} — automatic credit top-up`);
        if (r.ok) {
          balance = round4(balance + amt);
          await client.from('credit_ledger').insert({ workspace_slug: bw.workspace_slug, delta: amt, reason: 'topup', source_ref: r.invoice_id, balance_after: balance, meta: { auto: true } });
          await client.from('credit_wallets').update({ balance_credits: balance, last_refill_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('workspace_slug', bw.workspace_slug);
          refill = { charged: amt, invoice: r.invoice_id };
        } else refill = { error: r.error, would_charge: amt };
      }
    }
    results.push({ ws: bw.workspace_slug, events: unbilled.length, hard_cost: round4(hard), multiplier: mult, debited, balance, refill });
  }
  return json({ ok: true, ran: true, dry_run: dry, via: viaCron ? 'cron' : 'manual', results });
}

// ---------------- handler ----------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const client = sb();
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const str = (k) => { const v = url.searchParams.get(k); return v == null || v === '' ? null : v; };

  try {
    if (action === 'autocharge_run') return await autochargeRun(client, url, req);
    if (action === 'credits_debit_run') return await creditsDebitRun(client, url, req);

    const user = await getUser(client, req);
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (user.role !== 'super_admin') return json({ error: 'Onboarding is restricted to super admins.' }, 403);

    const body = (req.method === 'POST' || req.method === 'PATCH') ? await req.json().catch(() => ({})) : {};

    if (action === 'autocharge_settings') {
      const { data: st } = await client.from('billing_settings').select('auto_charge_enabled, min_charge_amount, cooldown_hours, updated_at').eq('id', 1).maybeSingle();
      const { data: recent } = await client.from('autocharge_log').select('workspace_slug, amount, status, stripe_invoice_id, created_at').order('created_at', { ascending: false }).limit(25);
      return json({ settings: st || { auto_charge_enabled: false, min_charge_amount: 1, cooldown_hours: 20 }, recent: recent || [] });
    }
    if (action === 'autocharge_set') {
      const patch = { updated_by: user.id, updated_at: new Date().toISOString() };
      if (typeof body.auto_charge_enabled === 'boolean') patch.auto_charge_enabled = body.auto_charge_enabled;
      if (body.min_charge_amount != null && Number(body.min_charge_amount) >= 0.5) patch.min_charge_amount = Number(body.min_charge_amount);
      if (body.cooldown_hours != null && Number(body.cooldown_hours) >= 0) patch.cooldown_hours = Math.round(Number(body.cooldown_hours));
      const { error } = await client.from('billing_settings').update(patch).eq('id', 1);
      if (error) return json({ error: error.message }, 400);
      await audit(client, user, 'autocharge_settings_changed', JSON.stringify(patch));
      return json({ ok: true });
    }

    // ---- Prepaid credits (SaaS mode) ----
    if (action === 'credits_wallet') {
      const slug = str('slug') || body.slug;
      if (!slug) return json({ error: 'slug required' }, 400);
      const wallet = await getOrCreateWallet(client, slug);
      const { data: bw } = await client.from('billing_workspaces').select('billing_engine, default_multiplier, display_name, stripe_customer_id').eq('workspace_slug', slug).maybeSingle();
      const { data: ledger } = await client.from('credit_ledger').select('*').eq('workspace_slug', slug).order('created_at', { ascending: false }).limit(50);
      const unbilled = await fetchUnbilledUsage(client, slug);
      const hard = unbilled.reduce((s, r) => s + Number(r.hard_cost || 0), 0);
      const mult = Number(bw?.default_multiplier || 1);
      return json({
        wallet, ledger: ledger || [],
        billing_engine: bw?.billing_engine || 'arrears_sweep',
        multiplier: mult,
        pending_usage: { events: unbilled.length, hard_cost: round4(hard), retail: round4(hard * mult) },
      });
    }
    if (action === 'credits_config_set') {
      const slug = body.workspace_slug;
      if (!slug) return json({ error: 'workspace required' }, 400);
      const wsPatch = { updated_at: new Date().toISOString() };
      if (['prepaid_credits', 'arrears_sweep', 'split_margin'].includes(body.billing_engine)) wsPatch.billing_engine = body.billing_engine;
      if (body.multiplier != null && Number(body.multiplier) >= 0.1 && Number(body.multiplier) <= 100) wsPatch.default_multiplier = Number(body.multiplier);
      if (Object.keys(wsPatch).length > 1) await client.from('billing_workspaces').update(wsPatch).eq('workspace_slug', slug);
      await getOrCreateWallet(client, slug);
      const wPatch = { updated_by: user.id, updated_at: new Date().toISOString() };
      if (['manual', 'auto'].includes(body.refill_mode)) wPatch.refill_mode = body.refill_mode;
      if (body.refill_threshold != null && Number(body.refill_threshold) >= 0) wPatch.refill_threshold = Number(body.refill_threshold);
      if (body.refill_amount != null && Number(body.refill_amount) >= 0) wPatch.refill_amount = Number(body.refill_amount);
      if (Object.keys(wPatch).length > 2) await client.from('credit_wallets').update(wPatch).eq('workspace_slug', slug);
      if (body.grant_credits != null && Number(body.grant_credits) !== 0) {
        const w = await getOrCreateWallet(client, slug);
        const bal = round4(Number(w.balance_credits || 0) + Number(body.grant_credits));
        await client.from('credit_ledger').insert({ workspace_slug: slug, delta: Number(body.grant_credits), reason: 'adjustment', balance_after: bal, created_by: user.id, meta: { note: body.grant_note || 'manual adjustment' } });
        await client.from('credit_wallets').update({ balance_credits: bal, updated_at: new Date().toISOString() }).eq('workspace_slug', slug);
      }
      await audit(client, user, 'credits_config_changed', `${slug} · ${JSON.stringify({ ...wsPatch, ...wPatch, grant: body.grant_credits })}`);
      return json({ ok: true });
    }
    if (action === 'credits_topup') {
      const slug = body.workspace_slug;
      const amount = Number(body.amount);
      if (!slug || !(amount > 0)) return json({ error: 'workspace and a positive amount are required.' }, 400);
      const { data: bw } = await client.from('billing_workspaces').select('*').eq('workspace_slug', slug).maybeSingle();
      if (!bw) return json({ error: 'account not found' }, 404);
      if (!stripeKey()) return json({ error: 'Stripe is not configured.' }, 400);
      const r = await chargeCardOnFile(client, bw, amount, `${bw.display_name || slug} — credit top-up`);
      if (!r.ok) return json({ error: `Charge failed: ${r.error}`, detail: r.error }, 400);
      const w = await getOrCreateWallet(client, slug);
      const bal = round4(Number(w.balance_credits || 0) + amount);
      await client.from('credit_ledger').insert({ workspace_slug: slug, delta: amount, reason: 'topup', source_ref: r.invoice_id, balance_after: bal, created_by: user.id, meta: { manual: true } });
      await client.from('credit_wallets').update({ balance_credits: bal, last_refill_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('workspace_slug', slug);
      await audit(client, user, 'credits_topup', `${slug} · $${amount} · ${r.invoice_id}`);
      return json({ ok: true, invoice_id: r.invoice_id, balance: bal });
    }
    if (action === 'credits_debit_now') {
      const slug = body.workspace_slug;
      if (!slug) return json({ error: 'workspace required' }, 400);
      const u2 = new URL(url.toString()); u2.searchParams.set('slug', slug); u2.searchParams.delete('dry_run');
      return await creditsDebitRun(client, u2, req);
    }
    if (action === 'credits_baseline') {
      // "Start credits from now": mark all current unbilled usage as already settled
      // WITHOUT charging anything, so switching an existing account to prepaid credits
      // does not retroactively debit months of historical usage.
      const slug = body.workspace_slug;
      if (!slug) return json({ error: 'workspace required' }, 400);
      const unbilled = await fetchUnbilledUsage(client, slug);
      const marker = crypto.randomUUID();
      const ids = unbilled.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 500) await client.from('cost_ledger').update({ billed_invoice_id: marker }).in('id', ids.slice(i, i + 500));
      await audit(client, user, 'credits_baseline', `${slug} · settled ${ids.length} historical events (no charge)`);
      return json({ ok: true, settled_events: ids.length, marker });
    }

    if (action === 'accounts') {
      const { data: accounts } = await client.from('billing_workspaces').select('*').order('created_at', { ascending: false });
      const slugs = (accounts || []).map((a) => a.workspace_slug);
      const inList = slugs.length ? slugs : [''];
      const [{ data: auths }, { data: pms }, { data: wallets }] = await Promise.all([
        client.from('card_authorizations').select('workspace_slug, signer_name, signed_at, revoked_at').in('workspace_slug', inList),
        client.from('payment_methods').select('workspace_slug, brand, last4, added_via').in('workspace_slug', inList),
        client.from('credit_wallets').select('workspace_slug, balance_credits, refill_mode').in('workspace_slug', inList),
      ]);
      const authBy = {}; for (const a of (auths || [])) if (!a.revoked_at) authBy[a.workspace_slug] = a;
      const pmBy = {}; for (const p of (pms || [])) pmBy[p.workspace_slug] = p;
      const wBy = {}; for (const w of (wallets || [])) wBy[w.workspace_slug] = w;
      const rows = (accounts || []).map((a) => ({
        ...a,
        has_authorization: !!authBy[a.workspace_slug],
        authorization: authBy[a.workspace_slug] || null,
        card_on_file: pmBy[a.workspace_slug] ? `${pmBy[a.workspace_slug].brand} ····${pmBy[a.workspace_slug].last4}` : null,
        credit_balance: wBy[a.workspace_slug] ? Number(wBy[a.workspace_slug].balance_credits) : null,
        refill_mode: wBy[a.workspace_slug]?.refill_mode || null,
      }));
      return json({ accounts: rows });
    }

    if (action === 'account') {
      const slug = str('slug') || body.slug;
      if (!slug) return json({ error: 'slug required' }, 400);
      const [{ data: ws }, { data: auth }, { data: pms }, { data: vault }, { data: retell }] = await Promise.all([
        client.from('billing_workspaces').select('*').eq('workspace_slug', slug).maybeSingle(),
        client.from('card_authorizations').select('*').eq('workspace_slug', slug).order('signed_at', { ascending: false }).limit(1).maybeSingle(),
        client.from('payment_methods').select('*').eq('workspace_slug', slug).order('created_at', { ascending: false }),
        client.from('card_vault').select('id, payment_method_id, exp_month, exp_year, cvv_ciphertext, keyed_into_retell_at, last_revealed_at, created_at').eq('workspace_slug', slug),
        client.from('workspaces').select('slug, api_key').eq('slug', slug).maybeSingle(),
      ]);
      const vaultSafe = (vault || []).map((v) => ({ id: v.id, payment_method_id: v.payment_method_id, exp_month: v.exp_month, exp_year: v.exp_year, has_cvv: !!v.cvv_ciphertext, keyed_into_retell_at: v.keyed_into_retell_at, last_revealed_at: v.last_revealed_at }));
      return json({ workspace: ws, authorization: auth, payment_methods: pms || [], vault: vaultSafe, retell_connected: !!retell?.api_key });
    }

    if (action === 'create_account') {
      const slug = String(body.workspace_slug || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!slug) return json({ error: 'A workspace slug is required (letters, numbers, - and _).' }, 400);
      const { data: existing } = await client.from('billing_workspaces').select('workspace_slug').eq('workspace_slug', slug).maybeSingle();
      if (existing) return json({ error: 'An account with that slug already exists.' }, 400);
      const { error } = await client.from('billing_workspaces').insert({
        workspace_slug: slug,
        display_name: body.display_name || slug,
        billing_mode: ['margin_split', 'full_retail', 'live_metered'].includes(body.billing_mode) ? body.billing_mode : 'full_retail',
        billing_engine: ['prepaid_credits', 'arrears_sweep', 'split_margin'].includes(body.billing_engine) ? body.billing_engine : 'arrears_sweep',
        default_multiplier: Number(body.default_multiplier) >= 0.1 && Number(body.default_multiplier) <= 100 ? Number(body.default_multiplier) : 1.0,
        status: 'onboarding',
      });
      if (error) return json({ error: error.message }, 400);
      await audit(client, user, 'account_created', `${slug}`);
      return json({ ok: true, workspace_slug: slug });
    }

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
      const { error: vErr } = await client.from('card_vault').insert({
        payment_method_id: pm.id, workspace_slug: slug,
        pan_ciphertext: await encrypt(pan),
        cvv_ciphertext: cvv ? await encrypt(cvv) : null,
        exp_month, exp_year,
      });
      if (vErr) return json({ error: vErr.message }, 400);
      await audit(client, user, 'card_stored', `${slug} · ${brand} ${pan.slice(-4)} · on file`);
      return json({ ok: true, payment_method_id: pm.id, brand, last4: pan.slice(-4) });
    }

    if (action === 'reveal_card') {
      const vaultId = body.vault_id;
      if (!vaultId) return json({ error: 'vault_id required' }, 400);
      const { data: v } = await client.from('card_vault').select('*').eq('id', vaultId).maybeSingle();
      if (!v) return json({ error: 'not found' }, 404);
      const pan = await decrypt(v.pan_ciphertext);
      const cvv = v.cvv_ciphertext ? await decrypt(v.cvv_ciphertext) : null;
      await client.from('card_vault').update({ last_revealed_at: new Date().toISOString() }).eq('id', vaultId);
      await audit(client, user, 'card_revealed', `vault ${vaultId}`);
      return json({ ok: true, card_number: pan, cvv, exp_month: v.exp_month, exp_year: v.exp_year, cvv_available: !!cvv });
    }

    if (action === 'mark_keyed') {
      const vaultId = body.vault_id;
      if (!vaultId) return json({ error: 'vault_id required' }, 400);
      await client.from('card_vault').update({ keyed_into_retell_at: new Date().toISOString(), keyed_by: user.id }).eq('id', vaultId);
      await audit(client, user, 'card_keyed_into_retell', `vault ${vaultId}`);
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 404);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
