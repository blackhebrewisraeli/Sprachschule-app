import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { adminClient } from './helpers.js';

// Catalog + service-role check for 20260918213000, 20260921210000,
// 20260923120000 and 20260927120000: rate_limits, progress_events_seen,
// profile_follows, token_ledger and user_devices stay RLS-on,
// server-only. Deny-all policies for anon/authenticated silence advisor 0008
// without granting Data API access. service_role keeps BYPASSRLS + the DML it
// actually uses, so the existing RPCs, admin cleanup and the profile
// endpoints still work.
//
// WHY psql AND NOT supabase-js for the catalog: pg_policies, pg_class, and
// table ACLs live in pg_catalog, which PostgREST does not expose. Data API
// denials for these tables live in policies.test.js.

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const TABLES = [
  'rate_limits',
  'progress_events_seen',
  'profile_follows',
  'token_ledger',
  'user_devices',
  'push_reminder_claims',
];
const CLIENT_ROLES = ['anon', 'authenticated'];
const DML = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

// service_role DML is per-table. A follow row is created or removed, never
// edited, so 20260921192802 grants profile_follows only select/insert/delete.
// Asserting a blanket four here would either fail or pressure the schema into
// a grant it deliberately withholds — so state the intent per table and assert
// the withheld privilege too, or "no UPDATE" would never be checked.
const SERVICE_ROLE_DML = {
  rate_limits: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  progress_events_seen: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  profile_follows: ['SELECT', 'INSERT', 'DELETE'],
  // 20260923120000 grants all; the award/spend RPCs run as the definer.
  token_ledger: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  // 20260927120000: the future sender reads by user and prunes dead tokens;
  // the register/unregister RPCs run as the definer.
  user_devices: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  // 20261001120000: the sender claims, releases and prunes; never edits a claim.
  push_reminder_claims: ['SELECT', 'INSERT', 'DELETE'],
};

function sql(q) {
  return execFileSync('psql', [DB_URL, '-At', '-c', q], { encoding: 'utf8' }).trim();
}

// has_table_privilege()::text is 'true'/'false' in SQL, but psql's boolean
// display is not a contract we want to depend on. Same helper as
// league-fn-grants.test.js.
function flag(expr) {
  return sql(`select case when (${expr}) then 't' else 'f' end`);
}

function queryJson(q) {
  return JSON.parse(sql(q));
}

describe('server-only tables: catalog (advisor 0008 hygiene)', () => {
  const tables = queryJson(`
    select coalesce(json_agg(json_build_object(
             'relname', c.relname,
             'rls', c.relrowsecurity,
             'force_rls', c.relforcerowsecurity
           ) order by c.relname), '[]'::json)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname in (${TABLES.map((t) => `'${t}'`).join(', ')});
  `);

  const policies = queryJson(`
    select coalesce(json_agg(json_build_object(
             'tablename', tablename,
             'policyname', policyname,
             'cmd', cmd,
             'roles', (select coalesce(json_agg(r order by r), '[]'::json)
                         from unnest(roles) as r),
             'qual', coalesce(qual, ''),
             'with_check', coalesce(with_check, '')
           ) order by tablename, policyname), '[]'::json)
      from pg_policies
     where schemaname = 'public'
       and tablename in (${TABLES.map((t) => `'${t}'`).join(', ')});
  `);

  it('inspected every server-only table — the denominator, not just the findings', () => {
    expect(tables.map((t) => t.relname).sort()).toEqual([...TABLES].sort());
    expect(tables).toHaveLength(TABLES.length);
  });

  it('keeps RLS enabled and does not FORCE it (service_role / postgres bypass)', () => {
    for (const t of tables) {
      expect(t.rls, `${t.relname} RLS`).toBe(true);
      expect(t.force_rls, `${t.relname} FORCE RLS`).toBe(false);
    }
  });

  it('has exactly one deny-all Data API policy per table, and no granting policy', () => {
    expect(policies.map((p) => `${p.tablename}.${p.policyname}`).sort()).toEqual([
      'profile_follows.no client access',
      'progress_events_seen.no client access',
      'push_reminder_claims.no client access',
      'rate_limits.no client access',
      'token_ledger.no client access',
      'user_devices.no client access',
    ]);
    for (const p of policies) {
      expect(p.cmd, `${p.tablename} cmd`).toBe('ALL');
      expect(p.roles, `${p.tablename} roles`).toEqual(['anon', 'authenticated']);
      expect(p.qual, `${p.tablename} USING`).toBe('false');
      expect(p.with_check, `${p.tablename} WITH CHECK`).toBe('false');
    }
  });

  it('revokes every DML privilege from anon and authenticated', () => {
    for (const table of TABLES) {
      for (const role of CLIENT_ROLES) {
        for (const priv of DML) {
          expect(
            flag(`has_table_privilege('${role}', 'public.${table}', '${priv}')`),
            `${role} ${priv} on ${table}`
          ).toBe('f');
        }
      }
    }
  });

  it('keeps the service_role DML each table actually uses', () => {
    for (const table of TABLES) {
      for (const priv of SERVICE_ROLE_DML[table]) {
        expect(
          flag(`has_table_privilege('service_role', 'public.${table}', '${priv}')`),
          `service_role ${priv} on ${table}`
        ).toBe('t');
      }
    }
  });

  it('withholds the DML a table has no use for (profile_follows rows are immutable)', () => {
    for (const table of TABLES) {
      const withheld = DML.filter((priv) => !SERVICE_ROLE_DML[table].includes(priv));
      for (const priv of withheld) {
        expect(
          flag(`has_table_privilege('service_role', 'public.${table}', '${priv}')`),
          `service_role ${priv} on ${table}`
        ).toBe('f');
      }
    }
  });
});

describe('server-only tables: service_role still writes', () => {
  it('can insert, read, and delete a rate_limits row (direct table, not only the RPC)', async () => {
    const admin = adminClient();
    const key = `hygiene:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
    const { error: insErr } = await admin
      .from('rate_limits')
      .insert({ key, window_start: 1, count: 1 });
    expect(insErr).toBeNull();

    const { data, error: selErr } = await admin.from('rate_limits').select('count').eq('key', key);
    expect(selErr).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].count).toBe(1);

    const { error: delErr } = await admin.from('rate_limits').delete().eq('key', key);
    expect(delErr).toBeNull();
  });
});
