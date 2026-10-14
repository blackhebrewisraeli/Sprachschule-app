import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Every foreign key on a public table must have an index that can serve it.
//
// Deleting a referenced row (an auth.users account, a league) makes Postgres
// run the FK's ON DELETE action against the referencing table, in effect
// `... where <fk col 1> = $1 [and <fk col 2> = $2 ...]`. Without an index whose
// leading columns are the FK's columns, that is a sequential scan for every
// deleted row. Supabase's performance advisor reports it as
// 0001_unindexed_foreign_keys; this asks the same question of the local stack,
// so a new FK without its index fails here instead of turning up later as an
// advisor finding. (The advisor is looser on INCLUDE columns and partial
// indexes and stricter on column order; see `covered` below.)
//
// psql for the reason policy-initplan.test.js gives: pg_constraint and pg_index
// live in pg_catalog, which PostgREST does not expose.

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// Audits the foreign keys of one schema. `fixture`, when given, runs first in
// the same psql session, inside a transaction that is rolled back, so the
// regression below can audit throwaway temp tables and leave nothing behind.
function auditForeignKeys(namespace, fixture) {
  // A missing psql must FAIL here, never skip. A skipped audit and a clean
  // audit print the same thing, and only one of them means anything.
  //
  // `covered`: some valid index has the FK's N columns as its first N KEY
  // columns, in any order. The referential action constrains every FK column
  // by equality, so a btree on (b, a) seeks an FK on (a, b) on both columns,
  // just as one on (a, b) does. Both sides are compared as sorted arrays,
  // equal only when the index's first N columns are exactly the FK's, none
  // missing and none extra. Only the first N count: an index on (x, a, b)
  // cannot seek without x. Advisor 0001 compares in declaration order, so it
  // may still flag a reordered index that this audit accepts.
  //
  // indkey also lists INCLUDE columns after the keys, so an index on (a)
  // include (b) would match an FK on (a, b) without being able to look up b;
  // indnkeyatts is the count of real key columns. A partial index does not
  // count: whether the planner uses one for the referential action's query is
  // unproven (spec §4 of
  // docs/superpowers/specs/2026-10-14-supabase-performance-advisor-design.md).
  const audit = `select coalesce(json_agg(json_build_object(
            'tablename', t.relname,
            'constraint', c.conname,
            'columns', (select array_agg(a.attname order by k.ord)
                          from unnest(c.conkey) with ordinality as k(attnum, ord)
                          join pg_attribute a
                            on a.attrelid = c.conrelid and a.attnum = k.attnum),
            'covered', exists (
              select 1
                from pg_index i
               where i.indrelid = c.conrelid
                 and i.indisvalid
                 and i.indpred is null
                 and i.indnkeyatts >= cardinality(c.conkey)
                 and array(select k
                             from unnest((string_to_array(i.indkey::text, ' ')::smallint[])
                                         [1:cardinality(c.conkey)]) as k
                            order by k)
                     = array(select k from unnest(c.conkey) as k order by k))
          ) order by t.relname, c.conname), '[]'::json)
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
        where c.contype = 'f'
          and t.relnamespace = ${namespace}`;
  // -q drops the BEGIN / CREATE TABLE / ROLLBACK tags, leaving only the JSON.
  const sql = fixture ? `begin; ${fixture} ${audit}; rollback;` : audit;
  const out = execFileSync('psql', [DB_URL, '-qAt', '-c', sql], { encoding: 'utf8' });
  return JSON.parse(out.trim());
}

describe('every public foreign key has an index that can serve it', () => {
  const fks = auditForeignKeys(`'public'::regnamespace`);

  it('inspected every public foreign key — the denominator, not just the findings', () => {
    // Zero findings and zero foreign keys inspected print identically. State
    // the denominator so an empty result can never masquerade as a pass. A new
    // foreign key is added here on purpose, together with its index.
    expect(fks.map((fk) => `${fk.tablename}.${fk.constraint}`).sort()).toEqual([
      'ai_conversations.ai_conversations_user_id_fkey',
      'ai_messages.ai_messages_user_id_conversation_id_fkey',
      'ai_quota_grants.ai_quota_grants_user_id_fkey',
      'decks.decks_user_id_fkey',
      'entitlements.entitlements_user_id_fkey',
      'feedback.feedback_handled_by_fkey',
      'feedback.feedback_user_id_fkey',
      'league_members.league_members_league_id_fkey',
      'league_members.league_members_user_id_fkey',
      'legal_acceptances.legal_acceptances_user_id_fkey',
      'profile_follows.profile_follows_followed_id_fkey',
      'profile_follows.profile_follows_follower_id_fkey',
      'profiles.profiles_user_id_fkey',
      'progress_events_seen.progress_events_seen_user_id_fkey',
      'push_reminder_claims.push_reminder_claims_user_id_fkey',
      'settings.settings_user_id_fkey',
      'srs_state.srs_state_user_id_fkey',
      'stats_daily.stats_daily_user_id_fkey',
      'token_ledger.token_ledger_user_id_fkey',
      'user_devices.user_devices_user_id_fkey',
    ]);
  });

  it('indexes the columns of every foreign key as the leading columns of an index', () => {
    const uncovered = fks
      .filter((fk) => !fk.covered)
      .map((fk) => `${fk.tablename}.${fk.constraint} (${fk.columns.join(', ')})`);
    expect(uncovered).toEqual([]);
  });

  it('accepts the FK columns in any order, but only as the leading key columns', () => {
    // Real temp tables rather than hand-written catalog rows, so the audit is
    // checked against how Postgres actually encodes indkey and indnkeyatts.
    const fixture = auditForeignKeys(
      'pg_my_temp_schema()',
      `create temp table fk_parent (a int, b int, primary key (a, b));
       create temp table reordered (a int, b int, foreign key (a, b) references fk_parent);
       create index on reordered (b, a);
       create temp table with_include (a int, b int, foreign key (a, b) references fk_parent);
       create index on with_include (a) include (b);
       create temp table other_leading (x int, a int, b int, foreign key (a, b) references fk_parent);
       create index on other_leading (x, a, b);
       create temp table partial_index (a int, b int, foreign key (a, b) references fk_parent);
       create index on partial_index (a, b) where a > 0;`
    );
    expect(
      Object.fromEntries(
        fixture.map((fk) => [
          `${fk.tablename}.${fk.constraint} (${fk.columns.join(', ')})`,
          fk.covered,
        ])
      )
    ).toEqual({
      'other_leading.other_leading_a_b_fkey (a, b)': false,
      'partial_index.partial_index_a_b_fkey (a, b)': false,
      'reordered.reordered_a_b_fkey (a, b)': true,
      'with_include.with_include_a_b_fkey (a, b)': false,
    });
  });
});
