-- Security hardening (idempotent). Already applied to production; kept here for
-- repo/source-of-truth parity.
--
-- 1) Close anon exposure: every edge function uses the service-role key (bypasses
--    RLS) and the frontend never queries Postgres directly, so enabling RLS with
--    no policy locks out anon/authenticated without affecting the app.
alter table if exists public.opm_webhooks            enable row level security;
alter table if exists public.opm_webhook_deliveries  enable row level security;
alter table if exists public.crm_dialer_config       enable row level security;
alter table if exists public.tenants                  enable row level security;
alter table if exists public.pending_registrations   enable row level security;
alter table if exists public.workspace_custom_fields enable row level security;
alter table if exists public.saved_lists              enable row level security;

-- 2) Drop the redundant SECURITY DEFINER margin views (unused; opm / billing-run /
--    admin-ops all compute from cost_ledger inline).
drop view if exists public.v_margin_by_workspace;
drop view if exists public.v_margin_by_campaign;
drop view if exists public.v_margin_daily;
drop view if exists public.v_unbilled_by_workspace;

-- 3) Pin search_path on the billing helper functions (still used by billing-run).
alter function public.resolve_multiplier(text, text, text) set search_path = public, pg_temp;
alter function public.record_ledger_event(text, ledger_event_type, text, numeric, text, text, timestamptz) set search_path = public, pg_temp;
alter function public.ingest_call_batch(jsonb) set search_path = public, pg_temp;
