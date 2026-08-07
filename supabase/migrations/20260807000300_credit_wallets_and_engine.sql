-- Prepaid credit wallet layer for the SaaS full-retail billing model.

-- Per-account billing engine selector. Non-breaking: default preserves current sweep behavior.
alter table public.billing_workspaces
  add column if not exists billing_engine text not null default 'arrears_sweep';
alter table public.billing_workspaces
  drop constraint if exists billing_workspaces_billing_engine_chk;
alter table public.billing_workspaces
  add constraint billing_workspaces_billing_engine_chk
  check (billing_engine in ('prepaid_credits','arrears_sweep','split_margin'));

-- One prepaid wallet per workspace. 1 credit = $1.
create table if not exists public.credit_wallets (
  workspace_slug text primary key,
  balance_credits numeric(14,4) not null default 0,
  refill_mode text not null default 'manual',
  refill_threshold numeric(14,4) not null default 20,
  refill_amount numeric(14,4) not null default 100,
  low_balance_notified_at timestamptz,
  last_refill_at timestamptz,
  updated_by bigint,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint credit_wallets_refill_mode_chk check (refill_mode in ('manual','auto'))
);

-- Append-only wallet transaction log.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_slug text not null,
  delta numeric(14,4) not null,
  reason text not null,
  source_ref text,
  balance_after numeric(14,4) not null,
  meta jsonb,
  created_by bigint,
  created_at timestamptz not null default now(),
  constraint credit_ledger_reason_chk check (reason in ('topup','usage','signup_grant','adjustment','refund'))
);
create index if not exists credit_ledger_ws_idx on public.credit_ledger(workspace_slug, created_at desc);

-- Service-role-only (matches the rest of the billing tables: RLS on, no policy).
alter table public.credit_wallets enable row level security;
alter table public.credit_ledger enable row level security;
