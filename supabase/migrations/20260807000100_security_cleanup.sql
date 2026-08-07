-- Security cleanup. Idempotent; already applied to production via MCP, committed for reproducibility.
alter table if exists public.opm_webhooks           enable row level security;
alter table if exists public.opm_webhook_deliveries enable row level security;
alter table if exists public.crm_dialer_config      enable row level security;
alter table if exists public.tenants                enable row level security;
alter table if exists public.pending_registrations  enable row level security;
alter table if exists public.workspace_custom_fields enable row level security;
alter table if exists public.saved_lists            enable row level security;

drop view if exists public.v_margin_by_workspace;
drop view if exists public.v_margin_by_campaign;
drop view if exists public.v_margin_daily;
drop view if exists public.v_unbilled_by_workspace;

do $$
begin
  alter function public.resolve_multiplier(text, text, text) set search_path = public, pg_temp;
exception when undefined_function then null; end $$;
do $$
begin
  alter function public.record_ledger_event(text, ledger_event_type, text, numeric, text, text, timestamptz) set search_path = public, pg_temp;
exception when undefined_function then null; end $$;
do $$
begin
  alter function public.ingest_call_batch(jsonb) set search_path = public, pg_temp;
exception when undefined_function then null; end $$;
