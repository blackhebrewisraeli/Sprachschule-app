-- R4: evaluate auth.uid() once per statement on stats_daily, not once per row.
--
-- Supabase's performance linter (auth_rls_initplan) flags the one remaining
-- stats_daily policy: a bare `auth.uid()` can be re-evaluated for every
-- candidate row, while `(select auth.uid())` is an uncorrelated subquery that
-- Postgres hoists into an InitPlan and runs once. Every XP reader sums a
-- user's stats_daily rows.
--
-- Semantics are unchanged (spec §5.2,
-- docs/superpowers/specs/2026-10-14-supabase-performance-advisor-design.md):
-- auth.uid() is STABLE and reads only request.jwt.* settings, which PostgREST
-- fixes before the statement runs, so both forms yield the same value for
-- every row, NULL included.
--
-- ALTER POLICY, never DROP + CREATE, as in
-- 20260906000500_league_policy_initplan.sql: it swaps the expression in place,
-- keeping name, command, roles and permissive flag, with no window where the
-- table is unprotected. stats_daily stays read-only for clients: its insert,
-- update and delete policies were dropped in 20260925120000_stats_daily_read_only.sql,
-- and this statement neither adds nor widens any of them.

alter policy "select own rows" on public.stats_daily
  using ((select auth.uid()) = user_id);
