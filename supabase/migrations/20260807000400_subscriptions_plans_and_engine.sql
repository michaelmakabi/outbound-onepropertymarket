-- Direct retail + subscription model: service/subscription fees + reusable plan templates.

-- Add the direct_subscription engine (keep existing values).
alter table public.billing_workspaces drop constraint if exists billing_workspaces_billing_engine_chk;
alter table public.billing_workspaces add constraint billing_workspaces_billing_engine_chk
  check (billing_engine in ('prepaid_credits','arrears_sweep','split_margin','direct_subscription'));

-- Reusable subscription / service-fee plan templates (curated by admin, applied to accounts).
create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(14,4) not null,
  interval text not null default 'monthly',
  active boolean not null default true,
  created_by bigint,
  created_at timestamptz not null default now(),
  constraint billing_plans_interval_chk check (interval in ('one_time','monthly'))
);

-- Per-account subscription / service fees (from a plan or ad hoc).
create table if not exists public.account_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_slug text not null,
  plan_id uuid,
  label text not null,
  amount numeric(14,4) not null,
  interval text not null default 'monthly',
  status text not null default 'active',
  last_charged_at timestamptz,
  next_charge_at timestamptz,
  created_by bigint,
  created_at timestamptz not null default now(),
  constraint account_subscriptions_interval_chk check (interval in ('one_time','monthly')),
  constraint account_subscriptions_status_chk check (status in ('active','paused','canceled'))
);
create index if not exists account_subscriptions_ws_idx on public.account_subscriptions(workspace_slug);

alter table public.billing_plans enable row level security;
alter table public.account_subscriptions enable row level security;
