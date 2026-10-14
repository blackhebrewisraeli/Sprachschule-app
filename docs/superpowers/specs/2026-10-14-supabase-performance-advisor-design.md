# Supabase Performance Advisor follow-ups — design

**Status:** Design only. No migration file was created, and no schema,
configuration, deployment or production change was made. Every database change
below is a **proposal** for a future mission, and the owner applies each one
to production under the drill (§9).

Audit taken against `origin/main` at `78429486` (2026-10-14). Production
metadata was read through the Supabase MCP (`execute_sql` on catalog views,
`get_advisors`, `list_migrations`) at 2026-10-14 15:10–15:15 UTC.
Plan: `docs/superpowers/plans/2026-10-14-supabase-performance-advisor.md`.

**Labels used in this document**

- **VERIFIED IN REPO**: read from a tracked file at `78429486`. The path is cited.
- **VERIFIED IN PRODUCTION**: read from production catalog metadata or advisor
  output during this audit. No application or user rows were selected. Table
  sizes come from `pg_stat_user_tables.n_live_tup`, an estimate kept by the
  statistics collector, not from a `count(*)`.
- **OWNER CONFIRMATION REQUIRED**: the owner has to decide. No agent decides it.
- **BLOCKED / EXTERNAL DEPENDENCY**: cannot progress until something outside
  this repository changes.

---

## 1. Intent

**Goal.** Sort every Performance Advisor finding raised after the PostgreSQL
17.6 → 17.11 upgrade on 2026-10-14 into work that is safe to do now, work that
needs evidence first, and work that should not be done. For each schema change
that is worth making, record the exact proposed SQL, how to test it, and how to
roll it back.

**Success criteria.**

- Each of the 21 findings has one classification and the evidence behind it.
- Nothing is dropped because of statistics that cover a few hours of a freshly
  restarted database.
- Each future schema change is one migration in one PR, with focused RLS or
  database tests, applied by the owner.

## 2. Non-goals

- Creating migration files, changing schema, or applying anything. Agents never
  run `migration repair`, `db push`, `db pull` or `db reset`.
- Dropping any index in this design. §6 explains why the evidence is not there.
- Narrowing the 14 policies from `to public` to `to authenticated`. That is a
  different change. It is probably harmless, because `anon` holds no grant on
  these tables (§5.2), but it belongs in its own review and must not ride along
  with a performance rewrite.
- Security Advisor findings, query tuning outside the advisor's list, and
  the league settle scan (recorded in §7 as an observation only).
- Changing the `ai_conversations` retention design or the AI history release.

---

## 3. Verified advisor inventory

`get_advisors(type: performance)`. **VERIFIED IN PRODUCTION**, observed at
`2026-10-14T15:10:04Z`. The counts match `docs/BACKLOG.md`: 1 + 14 + 6.

| #   | Lint                           | Level | Object                                                        | Classification                              |
| --- | ------------------------------ | ----- | ------------------------------------------------------------- | ------------------------------------------- |
| 1   | `0001_unindexed_foreign_keys`  | INFO  | `public.feedback.feedback_handled_by_fkey`                    | Actionable (low priority)                   |
| 2   | `0003_auth_rls_initplan`       | WARN  | `public.srs_state`: `select own rows`                         | Actionable                                  |
| 3   | `0003_auth_rls_initplan`       | WARN  | `public.srs_state`: `insert own rows`                         | Actionable                                  |
| 4   | `0003_auth_rls_initplan`       | WARN  | `public.srs_state`: `update own rows`                         | Actionable                                  |
| 5   | `0003_auth_rls_initplan`       | WARN  | `public.srs_state`: `delete own rows`                         | Actionable                                  |
| 6   | `0003_auth_rls_initplan`       | WARN  | `public.decks`: `select own rows`                             | Actionable                                  |
| 7   | `0003_auth_rls_initplan`       | WARN  | `public.decks`: `insert own rows`                             | Actionable                                  |
| 8   | `0003_auth_rls_initplan`       | WARN  | `public.decks`: `update own rows`                             | Actionable                                  |
| 9   | `0003_auth_rls_initplan`       | WARN  | `public.decks`: `delete own rows`                             | Actionable                                  |
| 10  | `0003_auth_rls_initplan`       | WARN  | `public.settings`: `select own rows`                          | Actionable                                  |
| 11  | `0003_auth_rls_initplan`       | WARN  | `public.settings`: `insert own rows`                          | Actionable                                  |
| 12  | `0003_auth_rls_initplan`       | WARN  | `public.settings`: `update own rows`                          | Actionable                                  |
| 13  | `0003_auth_rls_initplan`       | WARN  | `public.settings`: `delete own rows`                          | Actionable                                  |
| 14  | `0003_auth_rls_initplan`       | WARN  | `public.stats_daily`: `select own rows`                       | Actionable                                  |
| 15  | `0003_auth_rls_initplan`       | WARN  | `public.profiles`: `select own profile`                       | Actionable                                  |
| 16  | `0005_unused_index`            | INFO  | `public.ai_conversations.ai_conversations_purge`              | Blocked by an external dependency           |
| 17  | `0005_unused_index`            | INFO  | `public.feedback.feedback_created_at_idx`                     | Requires more observation                   |
| 18  | `0005_unused_index`            | INFO  | `public.feedback.feedback_status_created_at_idx`              | Requires more observation                   |
| 19  | `0005_unused_index`            | INFO  | `public.feedback.feedback_user_id_idx`                        | False positive / accepted tradeoff (keep)   |
| 20  | `0005_unused_index`            | INFO  | `public.leagues.leagues_tier_period_idx`                      | False positive / accepted tradeoff (keep)   |
| 21  | `0005_unused_index`            | INFO  | `public.lessons.lessons_lookup_idx`                           | Owner confirmation required (after O1)      |

Production schema matches the repository for every object above.
`list_migrations` returns the same 41 migration names as
`supabase/migrations/` (**VERIFIED IN PRODUCTION**, **VERIFIED IN REPO**), and
each policy, foreign key and index definition read from the catalog matches the
migration that created it (cited per finding below).

---

## 4. Unindexed foreign key — `feedback_handled_by_fkey` (finding 1)

### Evidence

- **VERIFIED IN PRODUCTION.** The definition is
  `FOREIGN KEY (handled_by) REFERENCES auth.users(id) ON DELETE SET NULL`, with
  `confdeltype = 'n'` (SET NULL) and `confupdtype = 'a'` (no action). No index on
  `public.feedback` has `handled_by` as its leading column. The table has 4
  indexes: `feedback_pkey (id)`, `feedback_user_id_idx (user_id)`,
  `feedback_created_at_idx (created_at desc)` and
  `feedback_status_created_at_idx (status, created_at desc)`. It holds about 2
  rows.
- **VERIFIED IN REPO.** `supabase/migrations/20260918153000_user_roles.sql:16`
  adds the column. The comment on the column says it holds the admin who last
  marked the report handled and is NULL while open. Only `feedbackPatchHandler`
  in `api/_lib/adminEndpoints.js` writes it, through the service role.
- **VERIFIED IN REPO.** No query filters or joins on `handled_by`. The admin
  list (`api/_lib/adminEndpoints.js:91-98`) filters on `status` and orders by
  `created_at`.

### What the index would serve

Read queries never need it. The **delete path** does. Deleting any
`auth.users` row makes Postgres run the FK's referential action against
`feedback`, which in effect is
`UPDATE feedback SET handled_by = NULL WHERE handled_by = $1`. That happens for
every deleted account, not only an admin's, because Postgres cannot know in
advance whether the deleted user handled any report. Without an index that
statement is a sequential scan of `feedback`.

Account deletion is a shipped path (`api/v1/account/delete`). `feedback` has
no retention job, and guest rows (NULL `user_id`) are kept forever by design
(`20260916183000_feedback.sql` header). The table therefore only grows, and
each future account deletion scans all of it. The sibling foreign key
`feedback_user_id_fkey` (ON DELETE CASCADE) is already indexed for exactly this
reason; the feedback migration's comment says "Cascade deletes and the owner
read path both filter by user_id". `handled_by` is the same shape and is
missing the same index.

### Assessment

- **Benefit today: negligible.** About 2 rows, and account deletions are rare.
- **Cost: negligible.** `feedback` writes are user reports and admin triage, both
  rare. A b-tree on one uuid column of a tiny table costs a few kilobytes.
- **Classification: actionable, low priority.** The repository's own convention
  (index the FK that a delete path walks) and the production definition both
  support it. It is cheap, it can be reverted, and it clears the lint.

### Proposed migration (mission F1; not created)

```sql
-- feedback.handled_by references auth.users ON DELETE SET NULL, so every
-- account deletion looks up feedback rows by handled_by. Index it like
-- feedback_user_id_idx indexes the cascade on user_id.
create index feedback_handled_by_idx on public.feedback (handled_by);
```

The migration uses plain `create index`, not `concurrently`. The table holds a
handful of rows, so the SHARE lock lasts a moment. `create index concurrently`
also cannot run inside a transaction block, and it is unverified whether the
Management API migrations endpoint wraps the file in one (§10).

A partial index (`where handled_by is not null`) was considered and rejected.
It would be smaller, but whether the planner uses it for the parameterised RI
query, and whether lint 0001 accepts it, would both have to be proven. On a
table this size the saving is not worth that proof.

**Rollback:** `drop index public.feedback_handled_by_idx;` in a new migration.
No data changes either way.

---

## 5. RLS initplan warnings (findings 2–15)

### 5.1 Inventory (VERIFIED IN PRODUCTION, VERIFIED IN REPO)

All 14 policies are `PERMISSIVE` and apply to role `public`. Each compares
`auth.uid()` directly to `user_id`. They were created in
`supabase/migrations/20260611232000_user_tables.sql`, and their expressions
have never changed since. Later migrations only dropped siblings:
`20260925120000_stats_daily_read_only.sql` dropped stats_daily's
insert/update/delete, and `20261011120100_profiles_server_only_writes.sql`
dropped profiles' insert/update.

| Table         | Policy               | Cmd    | `USING`                 | `WITH CHECK`            |
| ------------- | -------------------- | ------ | ----------------------- | ----------------------- |
| `srs_state`   | `select own rows`    | SELECT | `(auth.uid() = user_id)` | —                      |
| `srs_state`   | `insert own rows`    | INSERT | —                       | `(auth.uid() = user_id)` |
| `srs_state`   | `update own rows`    | UPDATE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |
| `srs_state`   | `delete own rows`    | DELETE | `(auth.uid() = user_id)` | —                      |
| `decks`       | same four            |        | same                    | same                    |
| `settings`    | same four            |        | same                    | same                    |
| `stats_daily` | `select own rows`    | SELECT | `(auth.uid() = user_id)` | —                      |
| `profiles`    | `select own profile` | SELECT | `(auth.uid() = user_id)` | —                      |

Every other `public` policy that reads `auth.uid()` already uses the wrapped
form `( SELECT auth.uid() AS uid)`. That covers `ai_conversations`,
`ai_messages`, `ai_quota_grants`, `entitlements`, `feedback`,
`league_members`, `leagues` and `legal_acceptances` (**VERIFIED IN
PRODUCTION**). The repository has fixed this lint once before:
`20260906000500_league_policy_initplan.sql`, guarded by
`supabase/tests/rls/policy-initplan.test.js`.

### 5.2 Why the rewrite is semantically safe

The proposal replaces `auth.uid()` with `(select auth.uid())` and changes
nothing else: same operand order, same column, same command, same roles, same
permissive flag.

1. **`auth.uid()` is a pure read of request settings.** Its production
   definition (**VERIFIED IN PRODUCTION**) is `LANGUAGE sql STABLE`, and its
   body is
   `coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid`.
   It has no arguments and reads only those two settings.
2. **Those settings cannot change during a statement.** PostgREST sets them
   once per request transaction, before the statement runs. No migration in
   this repository calls `set_config` or writes `request.jwt.*`
   (**VERIFIED IN REPO**: `grep` over `supabase/migrations/`). The only
   non-internal triggers on these tables are `profiles_protect_blocked_at` and
   `profiles_protect_tokens` on `profiles` (**VERIFIED IN PRODUCTION**), and
   their functions come from repository migrations that do not touch those
   settings either.
3. **Both forms therefore yield the same value for every row.** The bare form may
   be evaluated once per candidate row, while the wrapped form is an
   uncorrelated scalar subquery that Postgres hoists into an InitPlan and
   evaluates once per statement execution. Plan caching inside PL/pgSQL does
   not change this, because an InitPlan is re-run each time the plan executes,
   not stored with the plan.
4. **The NULL case is unchanged.** With no `sub` claim (`anon`, or a request with
   no JWT), both forms produce NULL, `NULL = user_id` is NULL, the row is
   filtered out of SELECT/UPDATE/DELETE, and an INSERT/UPDATE `WITH CHECK`
   fails. In production `anon` also holds **no** privilege on any of the five
   tables (**VERIFIED IN PRODUCTION**, `information_schema.role_table_grants`), so
   it is refused before RLS is consulted.
5. **Callers that bypass RLS are unaffected.** `service_role` has `BYPASSRLS`.
   The SECURITY DEFINER functions run as the table owner `postgres`, and none
   of the five tables has `FORCE ROW LEVEL SECURITY` (`relforcerowsecurity = false`,
   **VERIFIED IN PRODUCTION**).

**Use `ALTER POLICY`, never `DROP` + `CREATE`.** `ALTER POLICY … USING (…)
WITH CHECK (…)` replaces only the expressions and keeps the name, command,
roles and permissive flag. A re-create could silently change any of those, for
example `to public` → `to authenticated`, or a PERMISSIVE policy that came back
RESTRICTIVE. This is the method `20260906000500` used. For the three
`update own rows` policies the statement must name **both** clauses, because
`ALTER POLICY` leaves any clause it does not name unchanged.

### 5.3 Where it matters

- **VERIFIED IN REPO.** `src/lib/sync.js:53,58,61,95` pull `srs_state`,
  `decks`, `settings` and `stats_daily` with an **unfiltered** `.select()`, so
  the SELECT policy alone limits each pull to the caller's rows. `srs_state`
  is the largest per-user table (about 65 rows in production now; it grows by
  one row per card a learner has reviewed).
- **VERIFIED IN REPO.** `src/lib/sync.js:172-177` push with `.upsert(...)`, which
  exercises the INSERT `WITH CHECK`, the UPDATE `USING` + `WITH CHECK`, and the
  SELECT policy on conflict.
- Every primary key on these tables leads with `user_id`
  (**VERIFIED IN PRODUCTION**). When the planner uses that index, the per-row
  cost is small. The gain shows on sequential scans and on large per-user
  sets, which the beta does not have yet. The change is still worth making:
  it is cheap, it is safe by §5.2, and §5.4 lets it be proven.

### 5.4 Tests required to prove authorization does not change

These run in `npm run test:rls` against the local stack. CI's **RLS Policy
Tests** job runs `supabase start`, which applies every repository migration,
and then the suite (`.github/workflows/ci.yml:226-294`).

1. **Catalog audit: the denominator and exact text.** Extend
   `supabase/tests/rls/policy-initplan.test.js` from the two league tables to
   **every** `public` policy whose `qual` or `with_check` mentions `auth.`.
   - Assert the full list of `(table, policy, cmd, roles, permissive)`, so a
     rewrite that changes roles or flags fails, and an empty query cannot pass.
   - For each migrated policy, assert the exact normalized text Postgres stores,
     `(( SELECT auth.uid() AS uid) = user_id)`, in `qual` and/or `with_check` as
     the command requires. This pins the column and operator, not only the
     absence of a bare call.
   - Keep a **known-offenders list** that starts with all 14 policies. The test
     fails if a listed policy is already wrapped (stale list) or an unlisted one
     is bare (regression), so each migration PR must shrink the list in the same
     diff.
2. **Behaviour: the existing cross-user suite must pass unchanged.**
   `supabase/tests/rls/policies.test.js` already covers A inserting its own
   row, A seeing none of B's rows, A being unable to insert as B, A updating
   and deleting zero of B's rows, deck tombstones, stats_daily being read-only,
   the profiles cases, and anon being denied on every user table.
   `profiles-write.test.js` and `cascade.test.js` must also stay green.
3. **Behaviour: add the two paths the app actually uses** (in
   `policies.test.js`, landed **before** any policy migration so they are green
   on the old policies first).
   - An **unfiltered** `select()` by A returns exactly A's rows, for
     `srs_state`, `decks` and `settings`. `stats_daily` and `profiles` already
     have this test (`policies.test.js:127`, `:165`).
   - `upsert` of A's own row succeeds and updates it. `upsert` of a row claiming
     B's `user_id` fails, and B's row is unchanged afterwards. This covers
     `srs_state`, `decks` and `settings`.
4. **Proof structure.** The behavioural tests from items 2 and 3 pass on `main`
   before the migration and in the migration's PR after it. The catalog test is
   the only test that changes, by removing entries from the known-offenders
   list.

---

## 6. Unused-index findings (16–21)

### 6.1 Why "unused" right now is not evidence for removal

`0005_unused_index` flags every non-unique, non-primary index whose
`pg_stat_user_indexes.idx_scan` is 0. That counter is cumulative from the last
statistics reset, and on 2026-10-14 it describes almost nothing:

- **The window is a few hours of a restarted, upgraded database.**
  **VERIFIED IN PRODUCTION:** `pg_postmaster_start_time()` is
  `2026-10-14 12:42:12 UTC`, and the advisor ran at `15:10:04 UTC`, about 2.5
  hours later. `pg_stat_database.stats_reset` is NULL, so no reset is recorded,
  but that column does not show whether the upgrade carried the counters over.
- **The counters look like the upgrade procedure, not traffic.**
  **VERIFIED IN PRODUCTION:** every `public` table reports the **same**
  `last_seq_scan` instant (`2026-10-14 12:40:53.611 UTC`), and every one was
  `ANALYZE`d at `12:41:44 UTC`. That is one process touching every table once,
  just before the restart. Since then the only recorded scan is a single
  sequential scan of `profiles` at `14:13 UTC`. The largest `idx_scan` on any
  table is 2. Primary keys that the app must use whenever it reads by key,
  such as `leagues_pkey` and `feedback_pkey`, also read 0; the advisor only
  stays quiet about them because it skips unique indexes. Whether the upgrade
  reset the statistics cannot be proven from catalog metadata (§10). Either
  way, the window is too short and the wrong shape.
- **The periodic jobs that use these indexes have not run in the window.**
  **VERIFIED IN REPO** (`vercel.json`): league settle runs Mondays at 00:00 UTC,
  and the purge sweep (`purge_ai_usage`, `purge_ai_conversations`) runs daily
  at 03:30 UTC. 2026-10-14 is a Wednesday, and the window ran 12:42–15:10 UTC.
  These schedules are Vercel crons, not database-side jobs: the `cron` schema
  does not exist in production (**VERIFIED IN PRODUCTION**).
- **Tiny tables never use an index.** **VERIFIED IN PRODUCTION**
  (`n_live_tup`): `feedback` ≈ 2 rows, `leagues` ≈ 12, `lessons` ≈ 4,
  `ai_conversations` = 0. At that size the planner picks a sequential scan
  whether or not an index exists, so `idx_scan = 0` says nothing about how the
  index behaves at the size it was built for.
- **Some readers are rare by design.** The admin feedback triage and account
  deletion (which walks FK-covering indexes) run when a person acts, not on a
  schedule.

**Evidence that would justify proposing a removal (all required):**

1. A recorded start of the observation window: `pg_postmaster_start_time()`,
   `pg_stat_database.stats_reset`, and each index's `idx_scan` /
   `last_idx_scan`. A later reading is compared against that start, and any
   restart or reset in between restarts the window.
2. At least **30 days** of normal production traffic after the upgrade,
   covering at least 4 Monday settles, at least 30 daily purges, and at least
   one admin feedback triage session. The owner confirms that the triage
   happened; agents do not read feedback rows.
3. The index backs no constraint, covers no foreign key, is not an exact match
   for a known access path in the repository, and is not on a table whose size
   would make the planner choose it.
4. **OWNER CONFIRMATION REQUIRED** for each removal, as its own migration and
   PR.

### 6.2 Per-index assessment

**16. `ai_conversations_purge` on `(last_message_at)`: BLOCKED / EXTERNAL DEPENDENCY.**

- **VERIFIED IN REPO.** `20261008120000_ai_conversation_history.sql:59-62`
  created it for the daily purge. `purge_ai_conversations()` (same file,
  `:247-267`) runs
  `delete from public.ai_conversations where last_message_at < now() - 90 days`,
  an exact range match, through the daily Vercel cron
  (`api/v1/league/settle.js?job=purge`).
- **VERIFIED IN PRODUCTION.** The table has 0 rows. AI conversation history is
  dark: `docs/BACKLOG.md` "Ready to execute" says neither switch exists in
  Vercel Production, and the release follows `docs/AI_HISTORY_RELEASE_RUNBOOK.md`.
- Usage cannot be observed until the feature ships and conversations become
  older than 90 days. Keep it. Re-assess only under O1 after the AI history
  release.

**17. `feedback_created_at_idx` on `(created_at desc)`: requires more observation.**

- **VERIFIED IN REPO.** `20260916183000_feedback.sql:44-46`, "Owner triage is
  newest-first". `feedbackGetHandler` (`api/_lib/adminEndpoints.js:91-97`)
  orders by `created_at desc` with a `limit`, and that is the unfiltered list.
- No admin triage is known to have happened in the window, and at about 2 rows
  the planner would not use the index anyway. Keep it. Re-assess under O1.

**18. `feedback_status_created_at_idx` on `(status, created_at desc)`: requires more observation.**

- **VERIFIED IN REPO.** `20260918153000_user_roles.sql:31-32`. It is the exact
  match for the filtered list (`.eq('status', …)` plus `order by created_at desc`,
  `adminEndpoints.js:98`).
- It does not make #17 redundant. On PostgreSQL 17, a b-tree led by `status`
  cannot return the **unfiltered** list in `created_at` order without a sort.
  Keep both. Re-assess under O1.

**19. `feedback_user_id_idx` on `(user_id)`: false positive / accepted tradeoff (keep).**

- **VERIFIED IN REPO.** `20260916183000_feedback.sql:40-42`. It covers
  `feedback_user_id_fkey … ON DELETE CASCADE`.
- **VERIFIED IN PRODUCTION.** That FK exists, and this is the only index led by
  `user_id`.
- Deleting it would trade an INFO `unused_index` for an INFO
  `unindexed_foreign_keys`, and would turn every account deletion's cascade into
  a sequential scan. Its scan count will stay near zero because account
  deletions are rare, and that is expected. Do not drop it.

**20. `leagues_tier_period_idx` on `(tier, period_start)`: false positive / accepted tradeoff (keep).**

- **VERIFIED IN REPO.** `20260627000000_leagues.sql:28`.
  `assign_user_to_bucket` (`20260923200000_assign_user_to_bucket.sql:73-83`)
  runs `where l.tier = v_tier and l.period_start = p_period` on every league
  placement, which is an exact match, **while holding a per-(tier, period)
  advisory lock**, so the lookup's speed bounds placement throughput. Nothing
  ever deletes `leagues` rows (`grep`), so the table grows every week.
- About 12 rows today means sequential scans. The index exists for the size the
  table will reach. Keep it.

**21. `lessons_lookup_idx` on `(course_code, level, tab, unit_number)`: OWNER CONFIRMATION REQUIRED (after O1).**

- **VERIFIED IN REPO.** `20260904120000_lessons.sql:22-24` says "The read path is
  always (course_code, level, tab) ordered by unit_number". The only reader,
  `api/v1/content/lessons.js:72-79`, filters `pack_id`, `course_code`, `level`
  and `tab` by equality and orders by `unit_number`. That is exactly what the
  unique index `lessons_pack_id_course_code_level_tab_unit_number_key` provides,
  and the seed (`scripts/seed-lessons/index.js:92`) needs that unique index for
  its `onConflict`. So `lessons_lookup_idx` looks **structurally redundant** for
  every query in the repository.
- That is repository evidence, not production-traffic evidence. The table is
  about 4 rows of seeded content, so removing the index saves about 16 KB and
  nothing else. This design does **not** propose removing it. After O1, the
  owner decides whether a cleanup migration is worth a PR.

---

## 7. Observation outside the advisor list (no work proposed)

`api/v1/league/settle.js:50-53` selects `leagues` with
`period_start < current period`. That filter is a range on the **second**
column of `leagues_tier_period_idx`, so the index cannot serve it, and
because leagues are never deleted, each weekly settle reads every league ever
created. This is not an advisor finding. It is recorded here so that O1 can
look at it, and no mission is proposed.

---

## 8. Risk and rollback

| Change                      | Risk                                                                                                     | Mitigation                                                                                                     | Rollback                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ALTER POLICY (R1–R5)        | A typo changes authorization (wrong column, a missing `WITH CHECK` on UPDATE, an altered role or flag)  | §5.4 catalog test pins the exact text, roles and flags. The behaviour tests pass before and after. One table per PR | A new migration with `alter policy … using (auth.uid() = user_id) …` restoring the old text. No data changes |
| ALTER POLICY, apply-time    | Takes an ACCESS EXCLUSIVE lock on the table for a moment                                                 | Tables are small, and the statement is catalog-only                                                           | n/a                                                                                  |
| `create index` (F1)         | SHARE lock blocks `feedback` writes while it builds                                                      | About 2 rows, so the build takes milliseconds                                                                  | A new migration with `drop index public.feedback_handled_by_idx`                     |
| Any index removal (not proposed) | Slow queries, or sequential-scan cascades at scale; it can only be undone by rebuilding            | §6.1 evidence bar and owner confirmation                                                                       | Recreate the index in a new migration                                                |

Rollbacks are forward migrations, applied under the same drill. Migration
history is never edited and never "repaired".

## 9. Production application (owner only)

Agents do not apply anything (AGENTS.md: "The MCP config points at
PRODUCTION"). For each merged migration, the owner uses the Management API
drill in `docs/MOBILE_PUSH_SETUP.md` §1: baseline `list_migrations`, then apply
the reviewed file from a clean checkout with a short-lived scoped PAT, then
verify, then `notify pgrst, 'reload schema'`. After that, **Migration Drift**
must be green, and if the recorded version differs from the filename, the repo
file is renamed in a PR. `migration repair`, `db push`, `db pull`, `db reset`,
the SQL editor for migrations, and MCP `apply_migration` are all forbidden.

Verification after each apply is read-only: `pg_policies` (or `pg_indexes`)
shows the expected text, and `get_advisors(performance)` shows the finding gone
with no new ones.

## 10. Statements that could not be verified

- Whether the 17.6 → 17.11 upgrade reset cumulative statistics. The catalog shows
  no recorded reset (`stats_reset` is NULL), and that column cannot tell a
  carried-over counter from a fresh one.
- What process produced the single `12:40:53.611 UTC` scan instant and the
  `12:41:44 UTC` analyze across all tables. The upgrade procedure is the likely
  source, but this is inferred.
- Whether the Management API migrations endpoint runs a file inside a
  transaction. This is why §4 avoids `concurrently`.
- Whether any admin triage, account deletion or league placement happened during
  the window. No row-level or log data was read.
- Whether the planner would use a partial index on `handled_by` for the RI
  query, and whether lint 0001 would accept it (§4; that option was not taken).
- Performance gains from the RLS rewrite at current production size. None were
  measured. §5.3 explains why the change is worth making anyway.
