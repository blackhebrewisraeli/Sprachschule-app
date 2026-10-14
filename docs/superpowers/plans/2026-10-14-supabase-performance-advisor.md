# Supabase Performance Advisor Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the 14 `auth_rls_initplan` warnings and the one
`unindexed_foreign_keys` finding without changing who can read or write what.
Leave the six `unused_index` findings alone until production traffic gives
durable evidence.

**Architecture:** One schema change per migration, and one migration per PR.
A test-only PR lands first and sets the baseline. Each RLS PR then rewrites
one table's policies in place with `ALTER POLICY` and shrinks a
known-offenders list in the same diff. The FK index is its own PR. The
unused-index work is a read-only observation mission. Production application
is always the owner's step, under the drill.

**Tech stack:** PostgreSQL 17 (Supabase), plain SQL migrations, Vitest RLS suite
(`npm run test:rls`, local stack via `supabase start`, psql for catalog reads).
No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-14-supabase-performance-advisor-design.md`.
Read §5.2 (why the rewrite is safe), §5.4 (required tests) and §6.1 (the
evidence bar for removing an index) before any mission.

## Global constraints

- **Production is off-limits to agents.** Never run `supabase migration repair`,
  `db push`, `db pull` or `db reset`, never call MCP `apply_migration`, and never
  run an `execute_sql` write. Reads and advisors are fine. Never select
  application or user rows.
- **One schema change per migration, and one migration per PR.** Never fold two
  missions into one PR.
- **`ALTER POLICY` only.** Never `DROP POLICY` + `CREATE POLICY` for these
  rewrites. For `update own rows`, name **both** `USING` and `WITH CHECK`.
- **Change only the expression.** Keep the operand order
  `(select auth.uid()) = user_id`. Do not change roles (`public`), command or
  the permissive flag.
- **No index is dropped by this plan.** L1 exists only as a conditional slot.
- **Migration filenames.** `<14-digit UTC timestamp>_<name>.sql`, later than
  every existing migration on `main` at the time of writing. The version
  recorded in production must equal the filename (`docs/MOBILE_PUSH_SETUP.md`
  §1); if it does not, rename the file in a follow-up PR.
- **Verification for every PR:** `npm test`, `npm run lint`,
  `npm run format:check`, `git diff --check`, and a green **RLS Policy Tests** CI
  job. Run `npm run test:rls` locally as well when Docker is available.
- **Branch** from an up-to-date `origin/main` (`git switch -c <branch> origin/main`).
  Never commit to `main`, and never use `--no-verify`.

## Mission map

| Mission | Kind                 | Depends on                    | Status                                              |
| ------- | -------------------- | ----------------------------- | --------------------------------------------------- |
| P0      | Tests only           | none                          | **Ready**                                           |
| R1      | Migration + test     | P0 merged                     | Ready after P0                                      |
| R2      | Migration + test     | P0 merged                     | Ready after P0                                      |
| R3      | Migration + test     | P0 merged                     | Ready after P0                                      |
| R4      | Migration + test     | P0 merged                     | Ready after P0                                      |
| R5      | Migration + test     | P0 merged                     | Ready after P0                                      |
| F1      | Migration + test     | none                          | **Ready** (low priority)                            |
| O1      | Read-only docs       | 30 days after 2026-10-14      | **Observational**, earliest 2026-11-13              |
| B1      | Read-only docs       | AI history release            | **Blocked / external dependency**                   |
| L1      | Migration (optional) | O1 + owner confirmation       | **Owner confirmation required**, not scheduled      |

R1–R5 are independent of one another. They all edit the same
known-offenders list, so merge them one at a time and rebase each on `main`
before merging. Recommended order, by hot-path value: R1, R2, R3, R4, R5.

---

## P0: RLS baseline tests (no migration)

**Branch:** `test/rls-initplan-baseline`
**Files:** `supabase/tests/rls/policy-initplan.test.js`,
`supabase/tests/rls/policies.test.js`

The point of P0 is to have every behavioural assertion green on the
**current** policies before any policy changes. A later RLS PR cannot then
smuggle in a behaviour change alongside a test change.

- [ ] **Step 1: Widen the catalog audit.** In `policy-initplan.test.js`, replace
      the `LEAGUE_TABLES` filter with every `public` policy whose `qual` or
      `with_check` matches `auth\.`. Return `tablename`, `policyname`, `cmd`,
      `roles::text`, `permissive`, `coalesce(qual,'')` and
      `coalesce(with_check,'')` as JSON. Keep psql and the "missing psql must
      FAIL" rule.
- [ ] **Step 2: Assert the denominator.** Compare the sorted
      `table.policy|cmd|roles|permissive` list with an explicit expected array.
      Build it from the local stack. At `78429486` production has 23 such
      policies: the 14 in spec §5.1, plus 9 already-wrapped ones on the eight
      tables that section names. A count is not enough; list them.
- [ ] **Step 3: Add the known-offenders ratchet.**

```js
// Bare auth.uid() calls that are KNOWN and scheduled for R1–R5
// (docs/superpowers/plans/2026-10-14-supabase-performance-advisor.md).
// Each R-mission deletes its table's entries in the same PR as its migration.
const KNOWN_OFFENDERS = [
  'decks.delete own rows',
  'decks.insert own rows',
  'decks.select own rows',
  'decks.update own rows',
  'profiles.select own profile',
  'settings.delete own rows',
  'settings.insert own rows',
  'settings.select own rows',
  'settings.update own rows',
  'srs_state.delete own rows',
  'srs_state.insert own rows',
  'srs_state.select own rows',
  'srs_state.update own rows',
  'stats_daily.select own rows',
];

it('bare auth.uid() appears in exactly the known offenders', () => {
  const bare = policies
    .filter((p) => bareAuthCalls(p.qual).length + bareAuthCalls(p.with_check).length > 0)
    .map((p) => `${p.tablename}.${p.policyname}`)
    .sort();
  // Fails both ways: a new bare call (regression) or a fixed policy still
  // listed (stale list), so the list can only shrink deliberately.
  expect(bare).toEqual([...KNOWN_OFFENDERS].sort());
});
```

- [ ] **Step 4: Keep the league assertions** (`private.is_league_member(`) as they
      are.
- [ ] **Step 5: Add an unfiltered-read test** to the `TABLES` loop in
      `policies.test.js` (`srs_state`, `decks`, `settings`). It mirrors
      `src/lib/sync.js:53-61`, which pulls with no `user_id` filter.
      `stats_daily` and `profiles` already have one: `A reads their own row`
      (`:127`) and `the signup trigger created A their own profile` (`:165`)
      both select with no filter.

```js
it('an unfiltered select returns only A’s own rows', async () => {
  const { data, error } = await A.client.from(t.name).select('user_id');
  expect(error).toBeNull();
  expect(data.length).toBeGreaterThan(0);
  expect(data.every((r) => r.user_id === A.id)).toBe(true);
});
```

- [ ] **Step 6: Add upsert tests** to the `TABLES` loop (`srs_state`, `decks`,
      `settings`). They mirror `src/lib/sync.js:172-177`. An upsert of A's own
      row succeeds and the value changes. An upsert of `t.row(B.id)` by A returns
      an error. A service-role read of B's row afterwards shows it unchanged.
- [ ] **Step 7: Verify.** `npm run test:rls` locally if Docker is available. The
      CI **RLS Policy Tests** job must be green. Then `npm test`, `npm run lint`,
      `npm run format:check` and `git diff --check`.
- [ ] **Step 8: PR** `test(rls): baseline initplan audit and sync-path policy tests`.
      Say that it contains no migration and no behaviour change.

---

## R1–R5: one table's policies per PR

Every R-mission has the same shape. Only the table and the statements differ.

**Branch:** `fix/rls-initplan-<table>`
**Files:** `supabase/migrations/<ts>_rls_initplan_<table>.sql` (new) and
`supabase/tests/rls/policy-initplan.test.js`

- [ ] **Step 1:** Rebase on `origin/main` and confirm P0 (and any earlier R-mission)
      has merged.
- [ ] **Step 2: Write the migration.** Start with a header comment that cites spec
      §5.2 and `20260906000500_league_policy_initplan.sql`, then the
      statements below.
- [ ] **Step 3: Update the test.** Delete the table's entries from
      `KNOWN_OFFENDERS`. Add an exact-text assertion for each of them: `qual`
      and/or `with_check` equals `(( SELECT auth.uid() AS uid) = user_id)`, and
      the clause the command does not use stays `''`.
- [ ] **Step 4: Verify.** `npm run test:rls` locally if possible. The CI **RLS
      Policy Tests** job must be green with **no change** to `policies.test.js`,
      `profiles-write.test.js` or `cascade.test.js`. Then `npm test`,
      `npm run lint`, `npm run format:check` and `git diff --check`.
- [ ] **Step 5: PR** `perf(rls): evaluate auth.uid() once per statement on <table>`.
      Include the owner-only steps below verbatim, and do not apply anything.
- [ ] **Step 6 (owner only, after merge):** Run the drill in `docs/MOBILE_PUSH_SETUP.md`
      §1 for this one file. Then do a read-only check of `pg_policies` for the
      table, confirm that `get_advisors(performance)` shows `auth_rls_initplan`
      down by the table's count with no new finding, and confirm Migration Drift
      is green.

**Rollback (any R-mission):** a new migration that runs the same `alter policy`
statements with `auth.uid()` in place of `(select auth.uid())`, applied under
the same drill.

### R1: `srs_state` (4 policies, the largest per-user table)

```sql
alter policy "select own rows" on public.srs_state
  using ((select auth.uid()) = user_id);
alter policy "insert own rows" on public.srs_state
  with check ((select auth.uid()) = user_id);
alter policy "update own rows" on public.srs_state
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "delete own rows" on public.srs_state
  using ((select auth.uid()) = user_id);
```

Advisor delta: −4.

### R2: `decks` (4 policies)

The four statements are identical to R1's, with `public.decks`. Advisor delta: −4.
The deck tombstone tests in `policies.test.js` (`RLS: decks tombstones`) must
stay green, because tombstoning is an UPDATE through `update own rows`.

### R3: `settings` (4 policies)

The four statements are identical to R1's, with `public.settings`. Advisor delta:
−4. `ai-history.test.js` must stay green: it upserts `settings` as the user
(`:278`).

### R4: `stats_daily` (1 policy, read-only table)

```sql
alter policy "select own rows" on public.stats_daily
  using ((select auth.uid()) = user_id);
```

Advisor delta: −1. The `RLS: stats_daily (read-only for clients)` block must
stay green.

### R5: `profiles` (1 policy)

```sql
alter policy "select own profile" on public.profiles
  using ((select auth.uid()) = user_id);
```

Advisor delta: −1. `profiles-write.test.js` and the `RLS: profiles` block must
stay green. After R5, `KNOWN_OFFENDERS` is empty. Keep the test and the empty
array, so any future bare call fails.

---

## F1: index `feedback.handled_by` (low priority)

**Branch:** `perf/feedback-handled-by-index`
**Files:** `supabase/migrations/<ts>_feedback_handled_by_index.sql` (new),
`supabase/tests/rls/feedback.test.js`, and
`supabase/tests/rls/fk-indexes.test.js` (new)

- [ ] **Step 1: Write the migration** (spec §4), using plain `create index`, not
      `concurrently`:

```sql
-- feedback.handled_by references auth.users ON DELETE SET NULL, so every
-- account deletion looks up feedback rows by handled_by. Index it like
-- feedback_user_id_idx indexes the cascade on user_id.
create index feedback_handled_by_idx on public.feedback (handled_by);
```

- [ ] **Step 2: Add an FK coverage audit** in `fk-indexes.test.js`. Use psql, in
      the same style as `policy-initplan.test.js`. For every foreign key on a
      `public` table, assert that some index's leading columns equal the FK's
      columns. List the FKs it inspected as the denominator, so an empty result
      fails.
- [ ] **Step 3: Pin the delete behaviour** in `feedback.test.js`. Create user H.
      Use the service role to insert a feedback row owned by A and mark it
      `status = 'handled'`, `handled_by = H`. Delete H through the admin auth
      API. A's row must still exist with `handled_by IS NULL` and
      `status = 'handled'`. This is unchanged `ON DELETE SET NULL` behaviour,
      now served by the index.
- [ ] **Step 4: Verify** with the same commands as the R-missions.
- [ ] **Step 5: PR** `perf(db): index feedback.handled_by for account deletion`,
      with the owner-only steps included.
- [ ] **Step 6 (owner only, after merge):** Run the drill. Then do a read-only
      check of `pg_indexes` for `feedback_handled_by_idx`, confirm that
      `get_advisors(performance)` no longer lists `unindexed_foreign_keys`,
      expect `unused_index` to gain `feedback_handled_by_idx` (that is expected
      and correct, spec §6.1), and confirm Migration Drift is green.

**Rollback:** a new migration with `drop index public.feedback_handled_by_idx;`.

---

## O1: unused-index observation (read-only, earliest 2026-11-13)

**Branch:** `docs/supabase-advisor-o1-reading`
**Files:** the spec only (append a dated section)

O1 creates no migration and drops nothing.

- [ ] **Step 1:** Wait until at least 30 days after 2026-10-14. Confirm with the
      owner that at least one admin feedback triage session took place. Agents
      do not read feedback rows to check this.
- [ ] **Step 2: Read the window's start**, read-only:

```sql
select pg_postmaster_start_time() as postmaster_start,
       (select stats_reset from pg_stat_database
         where datname = current_database()) as db_stats_reset,
       now() as now;
```

If `postmaster_start` is later than about 4 weeks ago, or `stats_reset` is set
within the window, the window is too short. Record that and stop.

- [ ] **Step 3: Read index and table statistics.** Use catalog views only, never
      `count(*)` on application tables:

```sql
select s.relname as tbl, s.indexrelname as idx, s.idx_scan, s.last_idx_scan,
       pg_get_indexdef(s.indexrelid) as def
  from pg_stat_user_indexes s
 where s.schemaname = 'public'
 order by s.relname, s.indexrelname;

select relname, n_live_tup, seq_scan, idx_scan, last_autoanalyze
  from pg_stat_user_tables
 where schemaname = 'public'
 order by relname;
```

- [ ] **Step 4:** Run `get_advisors(performance)` and record the full output.
- [ ] **Step 5: Classify each `unused_index` finding** against the four criteria
      in spec §6.1. `feedback_user_id_idx` and, after F1,
      `feedback_handled_by_idx` are FK-covering indexes and are never removal
      candidates. Look again at the `leagues` settle scan (spec §7) using the
      `leagues` size.
- [ ] **Step 6: PR** a dated "O1 reading" section in the spec, with a decision
      table. Any removal candidate becomes an **OWNER CONFIRMATION REQUIRED**
      item, not a migration.

## B1: `ai_conversations_purge` (blocked)

**BLOCKED / EXTERNAL DEPENDENCY.** AI conversation history is dark. The release
follows `docs/AI_HISTORY_RELEASE_RUNBOOK.md`, which is owner-only and gated on
the AI-quota shadow-week review. Until then the table is empty and the daily
purge cannot use any index. Once the feature is live and the table is no longer
tiny, re-run the O1 steps for this index. Until then the default is to keep it:
it is the exact match for `purge_ai_conversations()`.

## L1: `lessons_lookup_idx` (conditional, not scheduled)

**OWNER CONFIRMATION REQUIRED.** The repository shows the index is redundant for
the only read path (spec §6.2 #21). Removal saves about 16 KB on a 4-row
content table. Schedule it only if O1 shows no use **and** the owner asks for
the cleanup. If scheduled, it follows the R-mission shape: one migration
(`drop index public.lessons_lookup_idx;`), one PR, the
`supabase/tests/rls/lessons.test.js` content-read tests green, and the owner
applies it under the drill. Rollback recreates the index with its original
definition from `20260904120000_lessons.sql`.

---

## Owner-only actions (summary)

1. After each of R1–R5 and F1 merges, apply that one file with the drill
   (`docs/MOBILE_PUSH_SETUP.md` §1). Then verify read-only, check the advisor
   delta, and confirm Migration Drift is green.
2. For O1: confirm that an admin feedback triage session happened during the
   window.
3. For B1: the AI history release, which is already owner-gated
   (`docs/AI_HISTORY_RELEASE_RUNBOOK.md`).
4. For L1: decide whether the cleanup is wanted after reading O1.
