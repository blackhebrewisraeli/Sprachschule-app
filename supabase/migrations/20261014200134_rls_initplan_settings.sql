-- R3: evaluate auth.uid() once per statement on settings, not once per row.
--
-- Supabase's performance linter (auth_rls_initplan) flags all four settings
-- policies: a bare `auth.uid()` can be re-evaluated for every candidate row,
-- while `(select auth.uid())` is an uncorrelated subquery that Postgres hoists
-- into an InitPlan and runs once. Every sync push upserts the user's settings
-- row.
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
-- table is unprotected. "update own rows" names BOTH clauses because ALTER
-- POLICY leaves any clause it does not name unchanged.

alter policy "select own rows" on public.settings
  using ((select auth.uid()) = user_id);
alter policy "insert own rows" on public.settings
  with check ((select auth.uid()) = user_id);
alter policy "update own rows" on public.settings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "delete own rows" on public.settings
  using ((select auth.uid()) = user_id);
