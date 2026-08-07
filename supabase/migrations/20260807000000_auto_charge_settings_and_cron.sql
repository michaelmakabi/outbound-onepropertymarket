-- Master toggle + guarded daily sweep for automatic charging. OFF by default.
-- Idempotent: safe to re-run. Already applied to production via MCP; committed here
-- so a clean rebuild reproduces it.
create table if not exists public.billing_settings (
  id                  int primary key default 1,
  auto_charge_enabled boolean not null default false,
  min_charge_amount   numeric(10,2) not null default 1.00,
  cooldown_hours      int not null default 20,
  cron_secret         text not null,
  updated_by          bigint,
  updated_at          timestamptz not null default now(),
  constraint billing_settings_singleton check (id = 1)
);
alter table public.billing_settings enable row level security;

create table if not exists public.autocharge_log (
  id               uuid primary key default gen_random_uuid(),
  workspace_slug   text not null,
  amount           numeric(10,2),
  events           int,
  stripe_invoice_id text,
  local_invoice_id uuid,
  status           text,
  detail           text,
  created_at       timestamptz not null default now()
);
alter table public.autocharge_log enable row level security;
create index if not exists autocharge_log_ws_idx on public.autocharge_log (workspace_slug, created_at desc);

do $$
declare v_secret text;
begin
  insert into public.billing_settings (id, cron_secret)
    values (1, encode(gen_random_bytes(24), 'hex'))
    on conflict (id) do nothing;
  select cron_secret into v_secret from public.billing_settings where id = 1;

  begin perform cron.unschedule('autocharge-daily'); exception when others then null; end;
  perform cron.schedule(
    'autocharge-daily',
    '0 7 * * *',
    format($f$select net.http_post(url:=%L, headers:=%L::jsonb)$f$,
      'https://sehrlbmatklgghrvyxes.supabase.co/functions/v1/onboarding?action=autocharge_run&key=' || v_secret,
      '{"Content-Type":"application/json"}')
  );
exception when others then
  -- pg_cron/pg_net may be unavailable in some environments; ignore so the migration still applies.
  null;
end $$;
