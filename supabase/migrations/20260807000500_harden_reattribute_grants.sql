-- reattribute_agent_ledger is SECURITY DEFINER (bypasses RLS) and reassigns billing
-- attribution between workspaces. It was executable by anon/authenticated, meaning anyone
-- with the public anon key could reassign a customer's billable usage via a PostgREST RPC.
-- Legitimate callers use the service role (edge functions), so restrict EXECUTE to that only.
revoke execute on function public.reattribute_agent_ledger(text, text, text) from anon, authenticated, public;
grant execute on function public.reattribute_agent_ledger(text, text, text) to service_role;
