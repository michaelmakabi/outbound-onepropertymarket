-- ============================================================
-- Customer onboarding — card authorization + card capture
-- ------------------------------------------------------------
-- Three tables, all service-role only (RLS on, no policies); the `onboarding`
-- edge function is the only writer/reader and it strips sensitive fields.
--
-- Storage model:
--   * card_authorizations  — the signed consent record. NO raw card here.
--   * payment_methods      — non-sensitive reference (brand/last4/exp) + Stripe token.
--   * card_vault           — the full card, ENCRYPTED at rest with an app-held key
--                            (pgp-style; ciphertext produced in the edge function,
--                             key from the CARD_ENC_KEY secret — never stored in the DB).
--
-- CVV handling (deliberate): the CVV is needed only to key the card into Retell.
-- It is stored encrypted ONLY until `cvv_purge_after` (end of the onboarding
-- window), then a scheduled job nulls it. Flip nothing here to keep it forever —
-- that is an explicit, separate decision and is intentionally not the default.
-- ============================================================

-- ---- 1. Signed authorization / consent (the legally meaningful record) ----
create table if not exists public.card_authorizations (
  id                          uuid primary key default gen_random_uuid(),
  workspace_slug              text,                    -- ties to billing_workspaces / workspaces
  account_email               text,                    -- who the card belongs to
  signer_name                 text not null,           -- typed legal name
  authorization_text_version  text not null,           -- which consent wording they agreed to
  authorization_text_snapshot text not null,           -- exact text shown, frozen
  signature_image             text,                    -- data-URL of drawn signature (optional)
  signed_ip                   text,                    -- captured server-side
  signed_user_agent           text,
  pdf_url                     text,                    -- generated signed-authorization PDF (storage)
  signed_at                   timestamptz not null default now(),
  revoked_at                  timestamptz,             -- withdrawal is a timestamp, never a delete
  created_by                  bigint,                  -- admin user id (null if self-serve)
  created_at                  timestamptz not null default now()
);
alter table public.card_authorizations enable row level security;
create index if not exists card_auth_ws_idx on public.card_authorizations (workspace_slug);

-- ---- 2. Payment methods (non-sensitive; safe to read in admin UI) ----
create table if not exists public.payment_methods (
  id                       uuid primary key default gen_random_uuid(),
  workspace_slug           text not null,
  cardholder_name          text,
  brand                    text,                       -- Visa, Mastercard, ...
  last4                    text,
  exp_month                int,
  exp_year                 int,
  billing_address          jsonb,                      -- line1/city/state/postal/country
  stripe_payment_method_id text,                       -- Stripe token (SetupIntent result)
  stripe_setup_intent_id   text,
  authorization_id         uuid references public.card_authorizations(id) on delete set null,
  added_via                text not null default 'admin' check (added_via in ('self_serve','admin')),
  added_by                 bigint,
  is_default               boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
create index if not exists pm_ws_idx on public.payment_methods (workspace_slug);

-- ---- 3. Encrypted card vault (full card for manual Retell keying) ----
-- Ciphertext columns hold app-encrypted blobs (base64). The decryption key lives
-- ONLY in the edge function's CARD_ENC_KEY secret, never in the database.
create table if not exists public.card_vault (
  id                   uuid primary key default gen_random_uuid(),
  payment_method_id    uuid references public.payment_methods(id) on delete cascade,
  workspace_slug       text not null,
  pan_ciphertext       text not null,                  -- encrypted full card number
  cvv_ciphertext       text,                           -- encrypted CVV (purged after window)
  cvv_purge_after      timestamptz,                    -- when the scheduled job nulls the CVV
  exp_month            int,
  exp_year             int,
  keyed_into_retell_at timestamptz,                    -- set once your team keys it into Retell
  keyed_by             bigint,
  last_revealed_at     timestamptz,                    -- audit: last time full card was revealed
  created_at           timestamptz not null default now()
);
alter table public.card_vault enable row level security;
create index if not exists vault_ws_idx on public.card_vault (workspace_slug);
create index if not exists vault_cvv_purge_idx on public.card_vault (cvv_purge_after)
  where cvv_ciphertext is not null;

-- ---- Scheduled CVV purge: null out expired CVVs every 15 minutes ----
create extension if not exists pg_cron;
do $$
begin
  perform cron.schedule(
    'purge-expired-cvv',
    '*/15 * * * *',
    $cron$update public.card_vault
             set cvv_ciphertext = null
           where cvv_ciphertext is not null
             and cvv_purge_after is not null
             and cvv_purge_after < now();$cron$
  );
exception when others then
  -- cron.schedule may already exist or pg_cron unavailable in this env; ignore.
  null;
end $$;

comment on table public.card_vault is
  'Full card, app-encrypted. CVV is purged after cvv_purge_after by the purge-expired-cvv cron. Keeping CVV permanently is a deliberate, separate change — do not default to it.';
