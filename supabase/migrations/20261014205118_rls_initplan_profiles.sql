-- R5: evaluate auth.uid() once per statement on profiles, not once per row.
--
-- Supabase's performance linter (auth_rls_initplan) flags the last bare
-- policy in the schema: a bare `auth.uid()` can be re-evaluated for every
-- candidate row, while `(select auth.uid())` is an uncorrelated subquery that
-- Postgres hoists into an InitPlan and runs once. After this, no public policy
-- calls auth.uid() unwrapped, and policy-initplan.test.js keeps it that way.
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
-- table is unprotected. Client writes to profiles stay closed: the insert and
-- update policies were dropped in 20261011120100_profiles_server_only_writes.sql,
-- and this statement neither adds nor widens any of them.

alter policy "select own profile" on public.profiles
  using ((select auth.uid()) = user_id);
