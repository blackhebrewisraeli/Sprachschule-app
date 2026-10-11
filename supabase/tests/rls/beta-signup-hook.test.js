import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';
import { BETA_SIGNUP_DENIED_MESSAGE } from '../../../src/lib/signupAllowlist.js';

// 20261011120000: Supabase Auth's before-user-created hook admits only the
// addresses in private.beta_signup_allowlist. supabase/config.toml enables it
// on the local stack, so the end-to-end cases below go through the real
// GoTrue, which runs the hook as supabase_auth_admin — the grants are proven
// by a listed signup succeeding, not just read off the catalog.
//
// Fixture addresses use the reserved .test domain and are added and removed
// by this file; nothing real is ever listed.

const DB_URL = process.env.DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const HOOK = 'public.hook_restrict_signup_to_beta_allowlist';
const TABLE = 'private.beta_signup_allowlist';
const PASSWORD = 'test-password-123';
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const LISTED = `rls-beta-listed-${RUN}@example.test`;
const DENIED = {
  error: { http_code: 403, message: BETA_SIGNUP_DENIED_MESSAGE },
};

const admin = adminClient();

// -q: since PostgreSQL 15, psql prints a result for EVERY statement in a
// multi-statement -c string (BEGIN, ALTER TABLE, …), not just the last one.
// Quiet mode drops those command tags, so the output is only query rows.
function sql(q) {
  return execFileSync('psql', [DB_URL, '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], {
    encoding: 'utf8',
  }).trim();
}

// has_*_privilege()::text display is not a contract worth depending on.
function flag(expr) {
  return sql(`select case when (${expr}) then 't' else 'f' end`);
}

// An event as a SQL jsonb literal. Dollar-quoted so any JSON — including
// deliberately malformed shapes — passes through verbatim. One helper for every
// call site: hand-writing `$ev$` next to a template `${` is how one of them
// lost its closing `$`.
function jsonbArg(event) {
  return event === null ? 'null' : `$ev$${JSON.stringify(event)}$ev$::jsonb`;
}

// Calls the hook as postgres (the function owner) with an arbitrary event.
function hook(event) {
  return JSON.parse(sql(`select ${HOOK}(${jsonbArg(event)})::text`));
}

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === email);
    if (hit || data.users.length < 1000) return hit ?? null;
  }
}

beforeAll(() => {
  sql(`insert into ${TABLE} (email) values ('${LISTED}') on conflict do nothing`);
});

afterAll(async () => {
  const user = await findUserByEmail(LISTED);
  if (user) await admin.auth.admin.deleteUser(user.id);
  sql(`delete from ${TABLE} where email = '${LISTED}'`);
});

describe('beta allowlist: least privilege', () => {
  it('lives outside the Data API: the private schema is not exposed, even to the service role', async () => {
    const { error } = await admin.schema('private').from('beta_signup_allowlist').select('email');
    expect(error).not.toBeNull();
  });

  it('grants supabase_auth_admin exactly SELECT on the list and EXECUTE on the hook', () => {
    expect(flag(`has_schema_privilege('supabase_auth_admin', 'private', 'USAGE')`)).toBe('t');
    expect(flag(`has_table_privilege('supabase_auth_admin', '${TABLE}', 'SELECT')`)).toBe('t');
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(flag(`has_table_privilege('supabase_auth_admin', '${TABLE}', '${priv}')`), priv).toBe(
        'f'
      );
    }
    expect(flag(`has_function_privilege('supabase_auth_admin', '${HOOK}(jsonb)', 'EXECUTE')`)).toBe(
      't'
    );
  });

  it('gives anon, authenticated and service_role nothing on the list or the hook', () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(
          flag(`has_table_privilege('${role}', '${TABLE}', '${priv}')`),
          `${role} ${priv}`
        ).toBe('f');
      }
      expect(flag(`has_function_privilege('${role}', '${HOOK}(jsonb)', 'EXECUTE')`), role).toBe(
        'f'
      );
    }
  });

  it('keeps RLS on the list, with one read-only policy for supabase_auth_admin', () => {
    expect(flag(`(select relrowsecurity from pg_class where oid = '${TABLE}'::regclass)`)).toBe(
      't'
    );
    const policies = JSON.parse(
      sql(`select coalesce(json_agg(json_build_object('cmd', cmd, 'roles', roles)), '[]'::json)
             from pg_policies where schemaname = 'private' and tablename = 'beta_signup_allowlist'`)
    );
    expect(policies).toEqual([{ cmd: 'SELECT', roles: ['supabase_auth_admin'] }]);
  });

  it('is SECURITY INVOKER, so the grants above are what it runs with', () => {
    expect(flag(`(select prosecdef from pg_proc where oid = '${HOOK}(jsonb)'::regprocedure)`)).toBe(
      'f'
    );
  });

  it('cannot be called over REST by anon, a signed-in learner or the service role', async () => {
    const event = { user: { email: LISTED } };
    const learner = await createSignedInUser('beta-hook-rpc');
    for (const [who, client] of [
      ['anon', anonClient()],
      ['authenticated', learner.client],
      ['service_role', admin],
    ]) {
      const { error } = await client.rpc('hook_restrict_signup_to_beta_allowlist', { event });
      expect(error, who).not.toBeNull();
    }
  });
});

describe('beta allowlist: the hook decision', () => {
  it('admits a listed address', () => {
    expect(hook({ user: { email: LISTED } })).toEqual({});
  });

  it('normalises case and surrounding whitespace before comparing', () => {
    expect(hook({ user: { email: `  ${LISTED.toUpperCase()}\t` } })).toEqual({});
  });

  it.each([
    ['an unlisted address', { user: { email: `rls-unlisted-${RUN}@example.test` } }],
    ['a near miss (plus-address of a listed one)', { user: { email: LISTED.replace('@', '+x@') } }],
    ['no email', { user: { phone: '+15550100' } }],
    ['an empty email', { user: { email: '   ' } }],
    ['a null email', { user: { email: null } }],
    ['a non-string email', { user: { email: 42 } }],
    ['no user', { metadata: { name: 'before-user-created' } }],
    ['an array event', [LISTED]],
    ['a scalar event', LISTED],
    ['a null event', null],
  ])('refuses %s with the one stable message', (_label, event) => {
    expect(hook(event)).toEqual(DENIED);
  });

  it('fails closed when the lookup itself errors', () => {
    // Inside one uncommitted transaction (rolled back when psql exits): the
    // table vanishes, the lookup raises, and the listed address is refused.
    const out = sql(
      `begin; alter table ${TABLE} rename to beta_signup_allowlist_gone; ` +
        `select ${HOOK}(${jsonbArg({ user: { email: LISTED } })})::text`
    );
    expect(JSON.parse(out)).toEqual(DENIED);
    // And the rename really was rolled back.
    expect(flag(`to_regclass('${TABLE}') is not null`)).toBe('t');
  });

  it('refuses to store an address the hook could never match', () => {
    expect(() => sql(`insert into ${TABLE} (email) values (' Mixed@Example.test')`)).toThrow();
    expect(() => sql(`insert into ${TABLE} (email) values ('not-an-email')`)).toThrow();
  });
});

describe('beta allowlist: end to end through Supabase Auth', () => {
  it('refuses a password signup for an unlisted address and creates no user', async () => {
    const email = `rls-unlisted-signup-${RUN}@example.test`;
    const { data, error } = await anonClient().auth.signUp({ email, password: PASSWORD });
    expect(error?.status).toBe(403);
    expect(error?.message).toBe(BETA_SIGNUP_DENIED_MESSAGE);
    expect(data.user).toBeNull();
    // No auth.users row means no profile either: profiles.user_id references it.
    expect(await findUserByEmail(email)).toBeNull();
  });

  it('refuses a magic-link signup for an unlisted address the same way', async () => {
    const email = `rls-unlisted-otp-${RUN}@example.test`;
    const { error } = await anonClient().auth.signInWithOtp({ email });
    expect(error?.status).toBe(403);
    expect(error?.message).toBe(BETA_SIGNUP_DENIED_MESSAGE);
    expect(await findUserByEmail(email)).toBeNull();
  });

  it('admits a listed address: the user and their profile are created', async () => {
    const { data, error } = await anonClient().auth.signUp({ email: LISTED, password: PASSWORD });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(LISTED);
    const { data: profile } = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();
    expect(profile).toEqual({ user_id: data.user.id });
  });
});
