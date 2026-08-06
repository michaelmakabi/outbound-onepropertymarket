-- ============================================================
-- Customer onboarding — card authorization + card capture
-- ------------------------------------------------------------
-- Three tables, all service-role only (RLS on, no policies); the `onboarding`
-- edge function is the only writer/reader and it strips sensitive fields.
--
--   * card_authorizations  — the signed consent record. NO raw card here.
--   * payment_methods      — non-sensitive reference (brand/last4/exp) + Stripe token.
--   * card_vault           — the full card, ENCRYPTED at rest with an app-held key
--                            (AES-GCM; ciphertext produced in the edge function,
--                             key from the CARD_ENC_KEY secret — never stored in the DB).
--
-- Card + CVV retention: kept ON FILE for the life of the account under the
-- customer's signed authorization and mutual-responsibility consent (reviewed
-- and approved by counsel). Stored encrypted at rest as defense-in-depth.
-- ============================================================

-- ---- 1. Signed authorization / consent (the legally meaningful record) ----
create table if not exists public.card_authorizations (
  id                          uuid primary key default gen_random_uuid(),
  workspace_slug              text,
  account_email               text,
  signer_name                 text not null,
  authorization_text_version  text not null,
  authorization_text_snapshot text not null,
  signature_image             text,
  signed_ip                   text,
  signed_user_agent           text,
  pdf_url                     text,
  signed_at                   timestamptz not null default now(),
  revoked_at                  timestamptz,
  created_by                  bigint,
  created_at                  timestamptz not null default now()
);
alter table public.card_authorizations enable row level security;
create index if not exists card_auth_ws_idx on public.card_authorizations (workspace_slug);

-- ---- 2. Payment methods (non-sensitive; safe to read in admin UI) ----
create table if not exists public.payment_methods (
  id                       uuid primary key default gen_random_uuid(),
  workspace_slug           text not null,
  cardholder_name          text,
  brand                    text,
  last4                    text,
  exp_month                int,
  exp_year                 int,
  billing_address          jsonb,
  stripe_payment_method_id text,
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

-- ---- 3. Encrypted card vault (full card kept on file for Retell keying + rebilling) ----
-- Ciphertext columns hold app-encrypted blobs (base64). The decryption key lives
-- ONLY in the edge function's CARD_ENC_KEY secret, never in the database.
create table if not exists public.card_vault (
  id                   uuid primary key default gen_random_uuid(),
  payment_method_id    uuid references public.payment_methods(id) on delete cascade,
  workspace_slug       text not null,
  pan_ciphertext       text not null,                  -- encrypted full card number
  cvv_ciphertext       text,                           -- encrypted CVV, kept on file with consent
  exp_month            int,
  exp_year             int,
  keyed_into_retell_at timestamptz,                    -- set once your team keys it into Retell
  keyed_by             bigint,
  last_revealed_at     timestamptz,                    -- audit: last time full card was revealed
  created_at           timestamptz not null default now()
);
alter table public.card_vault enable row level security;
create index if not exists vault_ws_idx on public.card_vault (workspace_slug);

comment on table public.card_vault is
  'Full card + CVV, app-encrypted, kept on file for the life of the account under the customer''s signed authorization and mutual-responsibility consent.';
