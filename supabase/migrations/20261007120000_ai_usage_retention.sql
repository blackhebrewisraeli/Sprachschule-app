-- AI quota: bounded retention for identifier-linked rows.
--
-- consume_ai_quota only deletes a subject's old days when that SAME subject
-- makes another request, so a dormant account id or guest IP key stayed in
-- ai_usage forever. This adds a sweep that does not depend on the subject
-- coming back, run daily by the Vercel cron at /api/v1/league/settle?job=purge.
--
-- DO NOT apply this to production from an agent (see AGENTS.md). Forward-only:
-- 20261006120000_ai_access_quota.sql is already applied and is not edited.
--
-- Guarantee: after a sweep, ai_usage holds only today and yesterday (UTC) and
-- ai_quota_grants only the last 30 days. Yesterday is kept so a request that
-- straddles midnight can still refund. A row is therefore gone within 2 days
-- of its last use plus the cron's slack; the cron fires once a day.
--
-- Cost: no index on day. After the first sweep the table holds at most two
-- days of active subjects, so a daily sequential scan is cheaper than the
-- write amplification of a second index on the hot consume path.

create or replace function public.purge_ai_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_usage integer;
  v_grants integer;
begin
  delete from public.ai_usage where day < v_day - 1;
  get diagnostics v_usage = row_count;
  delete from public.ai_quota_grants where day < v_day - 30;
  get diagnostics v_grants = row_count;
  return jsonb_build_object('usage', v_usage, 'grants', v_grants);
end
$$;

revoke all on function public.purge_ai_usage() from public, anon, authenticated;
grant execute on function public.purge_ai_usage() to service_role;
