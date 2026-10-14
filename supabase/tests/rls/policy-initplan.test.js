import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Policies that call auth helpers must not accidentally add untracked,
// per-row auth.uid() evaluations.
//
// Supabase's performance linter calls this auth_rls_initplan. A bare
// `auth.uid()` can run for every candidate row; `(select auth.uid())` is
// hoisted into an InitPlan and runs once.
//
// WHY pg_policies AND NOT A SCAN OF THE MIGRATION FILES: a static scan cannot
// answer the question. The original policy in 20260627000000_leagues.sql
// contains a bare auth.uid() and always will — history is immutable. Only the
// live catalog knows which definition actually WON. This is a question about
// final state, so it has to be asked of the database.
//
// WHY psql AND NOT supabase-js: pg_policies lives in pg_catalog, which
// PostgREST does not expose, and exposing it would mean adding surface to
// production for a test's benefit. This suite already requires a local stack,
// so shelling out to psql adds no dependency the suite did not already have.

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const EXPECTED_POLICIES = [
  'ai_conversations.delete own conversations|DELETE|{authenticated}|PERMISSIVE',
  'ai_conversations.select own conversations|SELECT|{authenticated}|PERMISSIVE',
  'ai_messages.select own messages|SELECT|{authenticated}|PERMISSIVE',
  'ai_quota_grants.read own grants|SELECT|{authenticated}|PERMISSIVE',
  'decks.delete own rows|DELETE|{public}|PERMISSIVE',
  'decks.insert own rows|INSERT|{public}|PERMISSIVE',
  'decks.select own rows|SELECT|{public}|PERMISSIVE',
  'decks.update own rows|UPDATE|{public}|PERMISSIVE',
  'entitlements.read own entitlements|SELECT|{authenticated}|PERMISSIVE',
  'feedback.insert own feedback|INSERT|{anon,authenticated}|PERMISSIVE',
  'league_members.read my league rows|SELECT|{public}|PERMISSIVE',
  'leagues.read my leagues|SELECT|{public}|PERMISSIVE',
  'legal_acceptances.read own acceptances|SELECT|{authenticated}|PERMISSIVE',
  'profiles.select own profile|SELECT|{public}|PERMISSIVE',
  'settings.delete own rows|DELETE|{public}|PERMISSIVE',
  'settings.insert own rows|INSERT|{public}|PERMISSIVE',
  'settings.select own rows|SELECT|{public}|PERMISSIVE',
  'settings.update own rows|UPDATE|{public}|PERMISSIVE',
  'srs_state.delete own rows|DELETE|{public}|PERMISSIVE',
  'srs_state.insert own rows|INSERT|{public}|PERMISSIVE',
  'srs_state.select own rows|SELECT|{public}|PERMISSIVE',
  'srs_state.update own rows|UPDATE|{public}|PERMISSIVE',
  'stats_daily.select own rows|SELECT|{public}|PERMISSIVE',
];

// Bare auth.uid() calls that are KNOWN and scheduled for R1–R5
// (docs/superpowers/plans/2026-10-14-supabase-performance-advisor.md).
// Each R-mission deletes its table's entries in the same PR as its migration.
const KNOWN_OFFENDERS = ['profiles.select own profile'];

// Policies an R-mission has rewritten, pinned to their exact stored text so a
// rewrite cannot change the operand, the column, or which clause is set.
const OWN_ROW = '(( SELECT auth.uid() AS uid) = user_id)';
const REWRITTEN = {
  'decks.delete own rows': { qual: OWN_ROW, with_check: '' },
  'decks.insert own rows': { qual: '', with_check: OWN_ROW },
  'decks.select own rows': { qual: OWN_ROW, with_check: '' },
  'decks.update own rows': { qual: OWN_ROW, with_check: OWN_ROW },
  'settings.delete own rows': { qual: OWN_ROW, with_check: '' },
  'settings.insert own rows': { qual: '', with_check: OWN_ROW },
  'settings.select own rows': { qual: OWN_ROW, with_check: '' },
  'settings.update own rows': { qual: OWN_ROW, with_check: OWN_ROW },
  'srs_state.delete own rows': { qual: OWN_ROW, with_check: '' },
  'srs_state.insert own rows': { qual: '', with_check: OWN_ROW },
  'srs_state.select own rows': { qual: OWN_ROW, with_check: '' },
  'srs_state.update own rows': { qual: OWN_ROW, with_check: OWN_ROW },
  'stats_daily.select own rows': { qual: OWN_ROW, with_check: '' },
};

function queryPolicies() {
  // JSON rather than a delimited format: a USING clause may contain any
  // punctuation, so any separator could also appear inside a qual.
  //
  // A missing psql must FAIL here, never skip. A skipped audit and a clean
  // audit print the same thing, and only one of them means anything.
  const out = execFileSync(
    'psql',
    [
      DB_URL,
      '-At',
      '-c',
      `select coalesce(json_agg(json_build_object(
            'tablename', tablename,
            'policyname', policyname,
            'cmd', cmd,
            'roles', roles::text,
            'permissive', permissive,
            'qual', coalesce(qual, ''),
            'with_check', coalesce(with_check, '')
          ) order by tablename, policyname), '[]'::json)
         from pg_policies
        where schemaname = 'public'
          and (coalesce(qual, '') ~ 'auth\\.'
            or coalesce(with_check, '') ~ 'auth\\.');`,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(out.trim());
}

// Postgres re-prints a stored subselect as `( SELECT auth.uid() AS uid)`.
// Strip every such wrapped call; anything left is an unwrapped, per-row call.
const bareAuthCalls = (qual) =>
  qual.replace(/\(\s*SELECT\s+auth\.uid\(\)[^)]*\)/gi, '').match(/auth\.uid\(\)/g) ?? [];

describe('RLS policy auth helper audit', () => {
  const policies = queryPolicies();
  const leaguePolicies = policies.filter((p) =>
    ['leagues', 'league_members'].includes(p.tablename)
  );

  it('inspects the complete expected policy denominator', () => {
    // Zero findings and zero rows inspected print identically. State the
    // denominator so an empty result can never masquerade as a pass.
    expect(
      policies
        .map((p) => `${p.tablename}.${p.policyname}|${p.cmd}|${p.roles}|${p.permissive}`)
        .sort()
    ).toEqual(EXPECTED_POLICIES);
  });

  it('bare auth.uid() appears in exactly the known offenders', () => {
    const bare = policies
      .filter((p) => bareAuthCalls(p.qual).length + bareAuthCalls(p.with_check).length > 0)
      .map((p) => `${p.tablename}.${p.policyname}`)
      .sort();
    // Fails both ways: a new bare call (regression) or a fixed policy still
    // listed (stale list), so the list can only shrink deliberately.
    expect(bare).toEqual([...KNOWN_OFFENDERS].sort());
  });

  it('rewritten policies store exactly the wrapped expression', () => {
    for (const [name, expected] of Object.entries(REWRITTEN)) {
      const p = policies.find((q) => `${q.tablename}.${q.policyname}` === name);
      expect({ qual: p?.qual, with_check: p?.with_check }, name).toEqual(expected);
    }
  });

  it('wraps every auth.uid() call in a subselect', () => {
    const offenders = leaguePolicies
      .filter((p) => bareAuthCalls(p.qual).length > 0)
      .map((p) => `${p.tablename}.${p.policyname}: ${p.qual}`);
    expect(offenders).toEqual([]);
  });

  it('still routes membership through the private security-definer helper', () => {
    // The initplan fix must not accidentally inline the membership test and
    // reintroduce the RLS self-recursion that is_league_member exists to avoid.
    // public.is_league_member is gone (advisor 0029); the helper lives in
    // schema private, which PostgREST does not expose.
    for (const p of leaguePolicies) {
      expect(p.qual).toMatch(/private\.is_league_member\(/);
    }
  });
});
