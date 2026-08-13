-- Identity/billing fields collected on the public payment-authorization form
-- (full name, email, billing address, member ID) plus the card-on-file reference
-- (brand + last4 only). No PAN, no CVV. Written only by the service-role billing-run
-- edge function; RLS enabled with NO public policies (blocks anon/authenticated direct access).
create table if not exists public.authorization_contact_details (
  id uuid primary key default gen_random_uuid(),
  workspace_slug text not null,
  authorization_id uuid references public.card_authorizations(id) on delete set null,
  full_name text,
  email text,
  billing_address text,
  member_id text,
  card_brand text,
  card_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_auth_contact_details_workspace on public.authorization_contact_details(workspace_slug);
create index if not exists idx_auth_contact_details_authorization on public.authorization_contact_details(authorization_id);

alter table public.authorization_contact_details enable row level security;

comment on table public.authorization_contact_details is 'Identity/billing fields collected on the public payment-authorization form (full name, email, billing address, member ID) plus card-on-file reference (brand + last4 only). No PAN or CVV. Written only by service-role edge functions (billing-run); RLS enabled with no public policies blocks anon/authenticated direct access.';
