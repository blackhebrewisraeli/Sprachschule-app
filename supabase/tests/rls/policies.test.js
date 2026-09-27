import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// Adversarial RLS suite: authenticated as user A, attempt every cross-user
// operation against user B through real PostgREST. Any success = RLS hole.

let A;
let B;

beforeAll(async () => {
  A = await createSignedInUser('a');
  B = await createSignedInUser('b');
});

// Per-table row factories — minimal valid rows owned by the given user.
const TABLES = [
  { name: 'srs_state', row: (uid) => ({ user_id: uid, srs_key: 'greetings:Hallo', box: 2 }) },
  {
    name: 'decks',
    row: (uid) => ({ user_id: uid, deck_id: 'custom', name: 'My deck', cards: [] }),
  },
  { name: 'settings', row: (uid) => ({ user_id: uid, data: { soundOn: true } }) },
];

for (const t of TABLES) {
  describe(`RLS: ${t.name}`, () => {
    it('A inserts an own row', async () => {
      const { error } = await A.client.from(t.name).insert(t.row(A.id));
      expect(error).toBeNull();
    });

    it('B inserts an own row (fixture for cross-user attempts)', async () => {
      const { error } = await B.client.from(t.name).insert(t.row(B.id));
      expect(error).toBeNull();
    });

    it("A cannot see B's rows", async () => {
      const { data, error } = await A.client.from(t.name).select('*').eq('user_id', B.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('A cannot insert a row claiming to be B', async () => {
      const { error } = await A.client.from(t.name).insert(t.row(B.id));
      expect(error).not.toBeNull();
    });

    it("A cannot update or delete B's rows (zero rows affected)", async () => {
      const { data: updated, error: updateError } = await A.client
        .from(t.name)
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', B.id)
        .select();
      expect(updateError).toBeNull();
      expect(updated).toEqual([]);

      const { data: deleted, error: deleteError } = await A.client
        .from(t.name)
        .delete()
        .eq('user_id', B.id)
        .select();
      expect(deleteError).toBeNull();
      expect(deleted).toEqual([]);
    });
  });
}

// Soft delete is an UPDATE, so the tombstone column rides the existing
// `update own rows` policy. This asserts that explicitly rather than assuming
// it: a hole here would let one learner erase another's deck.
describe('RLS: decks tombstones', () => {
  it('A can tombstone their OWN deck', async () => {
    const { data, error } = await A.client
      .from('decks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', A.id)
      .eq('deck_id', 'custom')
      .select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].deleted_at).not.toBeNull();
  });

  it("A cannot tombstone B's deck (zero rows affected)", async () => {
    const { data, error } = await A.client
      .from('decks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', B.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("B's deck is still live — the failed attempt changed nothing", async () => {
    const { data, error } = await B.client.from('decks').select('deleted_at').eq('user_id', B.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].deleted_at).toBeNull();
  });

  it('A cannot revive their deck INTO another user by tombstoning and reassigning', async () => {
    // with check (auth.uid() = user_id) guards the post-image, so a row cannot
    // be moved to another owner on its way through an update.
    const { data, error } = await A.client
      .from('decks')
      .update({ user_id: B.id, deleted_at: null })
      .eq('user_id', A.id)
      .select();
    expect(data ?? []).toEqual([]);
    if (error) expect(error).not.toBeNull();
  });
});

// Every XP reader sums stats_daily, so a client write is free XP. Since
// 20260925120000 the only writer is apply_progress_event behind the API
// (progress-event.test.js); clients keep SELECT on their own rows for sync.
describe('RLS: stats_daily (read-only for clients)', () => {
  const row = (uid) => ({ user_id: uid, day: '2026-06-12', counters: { total: 1 } });

  beforeAll(async () => {
    const { error } = await adminClient()
      .from('stats_daily')
      .insert([row(A.id), row(B.id)]);
    if (error) throw new Error(error.message);
  });

  it('A reads their own row', async () => {
    const { data, error } = await A.client.from('stats_daily').select('user_id');
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: A.id }]);
  });

  it("A cannot see B's row", async () => {
    const { data, error } = await A.client.from('stats_daily').select('*').eq('user_id', B.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('A cannot insert, update or delete even their OWN rows (no write grant)', async () => {
    const insert = await A.client
      .from('stats_daily')
      .insert({ ...row(A.id), day: '2026-06-13', counters: { bonusXp: 1000000 } });
    expect(insert.error?.code).toBe('42501');

    const update = await A.client
      .from('stats_daily')
      .update({ counters: { bonusXp: 1000000 } })
      .eq('user_id', A.id);
    expect(update.error?.code).toBe('42501');

    const del = await A.client.from('stats_daily').delete().eq('user_id', A.id);
    expect(del.error?.code).toBe('42501');
  });

  it("A's row is unchanged after the attempts", async () => {
    const { data } = await adminClient()
      .from('stats_daily')
      .select('day, counters')
      .eq('user_id', A.id);
    expect(data).toEqual([{ day: '2026-06-12', counters: { total: 1 } }]);
  });
});

describe('RLS: profiles', () => {
  it('the signup trigger created A their own profile, visible to A', async () => {
    const { data, error } = await A.client.from('profiles').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe(A.id);
  });

  it("A cannot see B's profile", async () => {
    const { data, error } = await A.client.from('profiles').select('*').eq('user_id', B.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("A cannot update B's profile (zero rows affected)", async () => {
    const { data, error } = await A.client
      .from('profiles')
      .update({ first_name: 'pwned' })
      .eq('user_id', B.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('A can still update an allowed column on their own row', async () => {
    const { error } = await A.client
      .from('profiles')
      .update({ first_name: 'Allowed' })
      .eq('user_id', A.id);
    expect(error).toBeNull();
  });
});

describe('RLS: leagues + league_members', () => {
  // Service-role fixtures: league LA holds A, league LB holds B. Clients are
  // read-only and RLS-scoped to leagues they belong to.
  let LA;
  let LB;

  beforeAll(async () => {
    const admin = adminClient();
    const { data: la, error: laErr } = await admin
      .from('leagues')
      .insert({ tier: 0, period_start: '2026-06-22' })
      .select('id')
      .single();
    if (laErr) throw new Error(laErr.message);
    LA = la.id;
    const { error: maErr } = await admin
      .from('league_members')
      .insert({ league_id: LA, user_id: A.id, handle: 'AAA01', period_start: '2026-06-22' });
    if (maErr) throw new Error(maErr.message);

    const { data: lb, error: lbErr } = await admin
      .from('leagues')
      .insert({ tier: 0, period_start: '2026-06-22' })
      .select('id')
      .single();
    if (lbErr) throw new Error(lbErr.message);
    LB = lb.id;
    const { error: mbErr } = await admin
      .from('league_members')
      .insert({ league_id: LB, user_id: B.id, handle: 'BBB01', period_start: '2026-06-22' });
    if (mbErr) throw new Error(mbErr.message);
  });

  it('A can read members of their own league (grant + RLS allow)', async () => {
    const { data, error } = await A.client.from('league_members').select('*').eq('league_id', LA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe(A.id);
  });

  it('A can read their own league row', async () => {
    const { data, error } = await A.client.from('leagues').select('*').eq('id', LA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(LA);
  });

  it("A cannot read another league's members (RLS denies)", async () => {
    const { data, error } = await A.client.from('league_members').select('*').eq('league_id', LB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('A cannot read a league they do not belong to', async () => {
    const { data, error } = await A.client.from('leagues').select('*').eq('id', LB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('A cannot insert a league_members row (no client write grant)', async () => {
    const { error } = await A.client
      .from('league_members')
      .insert({ league_id: LA, user_id: A.id, handle: 'HACK' });
    expect(error).not.toBeNull();
    expect(error.code).toBe('42501'); // permission denied — no insert grant
  });

  it('A cannot insert a league (no client write grant)', async () => {
    const { error } = await A.client
      .from('leagues')
      .insert({ tier: 1, period_start: '2026-06-22' });
    expect(error).not.toBeNull();
    expect(error.code).toBe('42501');
  });

  it('A cannot update or delete their own league_members row (read-only grant)', async () => {
    const { error: updErr } = await A.client
      .from('league_members')
      .update({ weekly_xp: 9999 })
      .eq('league_id', LA)
      .eq('user_id', A.id);
    expect(updErr).not.toBeNull();
    expect(updErr.code).toBe('42501');

    const { error: delErr } = await A.client
      .from('league_members')
      .delete()
      .eq('league_id', LA)
      .eq('user_id', A.id);
    expect(delErr).not.toBeNull();
    expect(delErr.code).toBe('42501');
  });

  it('anon is denied on both league tables at the privilege layer', async () => {
    const anon = anonClient();
    for (const table of ['leagues', 'league_members']) {
      const { data, error } = await anon.from(table).select('*');
      expect(error, `table ${table}`).not.toBeNull();
      expect(error.code, `table ${table}`).toBe('42501');
      expect(data, `table ${table}`).toBeNull();
    }
  });
});

describe('RLS: anonymous access', () => {
  it('a bare anon client is denied at the privilege layer on every user table', async () => {
    // anon holds no table grants at all (see the data_api_explicit_grants
    // migration), so the request fails before RLS is consulted.
    const anon = anonClient();
    for (const table of ['profiles', 'srs_state', 'stats_daily', 'decks', 'settings']) {
      const { data, error } = await anon.from(table).select('*');
      expect(error, `table ${table}`).not.toBeNull();
      expect(error.code, `table ${table}`).toBe('42501'); // permission denied
      expect(data, `table ${table}`).toBeNull();
    }
  });
});

const SERVER_ONLY = {
  rate_limits: {
    insert: { key: 'deny', window_start: 0, count: 1 },
    update: { count: 99 },
    filterCol: 'key',
    filterVal: 'deny',
  },
  progress_events_seen: {
    insert: { user_id: null, event_id: '00000000-0000-4000-8000-000000000000' },
    update: { event_id: '00000000-0000-4000-8000-000000000001' },
    filterCol: 'event_id',
    filterVal: '00000000-0000-4000-8000-000000000000',
  },
  user_devices: {
    insert: { user_id: null, push_token: 'deny-probe', platform: 'ios' },
    update: { platform: 'android' },
    filterCol: 'push_token',
    filterVal: 'deny-probe',
  },
};

// Tables whose insert fixture names its owner. Filled in with the signed-in
// caller for the authenticated pass, so a denial there cannot be blamed on a
// row claiming somebody else.
const OWNED_INSERT = new Set(['progress_events_seen', 'user_devices']);

async function expectEveryVerbDenied(client, table, spec) {
  const select = await client.from(table).select('*');
  expect(select.error, `${table} select`).not.toBeNull();
  expect(select.error.code, `${table} select`).toBe('42501');
  expect(select.data, `${table} select`).toBeNull();

  const insert = await client.from(table).insert(spec.insert);
  expect(insert.error, `${table} insert`).not.toBeNull();
  expect(insert.error.code, `${table} insert`).toBe('42501');

  const update = await client.from(table).update(spec.update).eq(spec.filterCol, spec.filterVal);
  expect(update.error, `${table} update`).not.toBeNull();
  expect(update.error.code, `${table} update`).toBe('42501');

  const del = await client.from(table).delete().eq(spec.filterCol, spec.filterVal);
  expect(del.error, `${table} delete`).not.toBeNull();
  expect(del.error.code, `${table} delete`).toBe('42501');
}

describe('RLS: server-only tables', () => {
  // rate_limits, progress_events_seen and user_devices are service-role only:
  // no grants for Data API roles, plus deny-all RLS policies (advisor 0008
  // hygiene). user_devices is written through its RPCs, push-devices.test.js.
  it('authenticated is denied every Data API verb', async () => {
    for (const [table, spec] of Object.entries(SERVER_ONLY)) {
      await expectEveryVerbDenied(A.client, table, {
        ...spec,
        insert: OWNED_INSERT.has(table) ? { ...spec.insert, user_id: A.id } : spec.insert,
      });
    }
  });

  it('anon is denied every Data API verb', async () => {
    const anon = anonClient();
    for (const [table, spec] of Object.entries(SERVER_ONLY)) {
      await expectEveryVerbDenied(anon, table, spec);
    }
  });
});
