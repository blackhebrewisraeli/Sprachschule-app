import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// user_devices is server-only (the Data API denials live in policies.test.js
// and server-only-tables.test.js). This suite covers the only way a browser
// writes it: register_push_device / unregister_push_device, 20260927120000.
//
// Requires the local stack: `supabase start` (Docker), then `npm run test:rls`.

const admin = adminClient();

// Unique per run so a re-run against a stack that kept the last run's rows
// cannot pass on leftovers.
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const token = (label) => `push-${RUN}-${label}`;

let A;
let B;

async function ownerOf(pushToken) {
  const { data, error } = await admin
    .from('user_devices')
    .select('user_id, platform, updated_at, time_zone')
    .eq('push_token', pushToken);
  if (error) throw error;
  return data[0] ?? null;
}

beforeAll(async () => {
  A = await createSignedInUser('push-a');
  B = await createSignedInUser('push-b');
});

afterAll(async () => {
  for (const user of [A, B]) {
    if (user?.id) await admin.from('user_devices').delete().eq('user_id', user.id);
  }
});

describe('register_push_device: privilege', () => {
  it('anon cannot execute it', async () => {
    const { error } = await anonClient().rpc('register_push_device', {
      p_token: token('anon'),
      p_platform: 'ios',
    });
    expect(error).not.toBeNull();
    expect(await ownerOf(token('anon'))).toBeNull();
  });

  it('anon cannot execute unregister either', async () => {
    const { error } = await anonClient().rpc('unregister_push_device', {
      p_token: token('anon'),
    });
    expect(error).not.toBeNull();
  });
});

describe('register_push_device: validation', () => {
  it.each([
    ['an unknown platform', { p_token: token('bad-platform'), p_platform: 'web' }],
    ['an empty token', { p_token: '', p_platform: 'ios' }],
    ['a missing token', { p_token: null, p_platform: 'android' }],
  ])('rejects %s', async (_label, args) => {
    const { error } = await A.client.rpc('register_push_device', args);
    expect(error).not.toBeNull();
    expect(error.code).toBe('22023');
  });
});

describe('register_push_device: ownership', () => {
  it('saves the token under the caller, never under an id the caller names', async () => {
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('shared'),
      p_platform: 'ios',
    });
    expect(error).toBeNull();
    const row = await ownerOf(token('shared'));
    expect(row.user_id).toBe(A.id);
    expect(row.platform).toBe('ios');
  });

  it('is idempotent for the same caller, and bumps updated_at', async () => {
    const before = await ownerOf(token('shared'));
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('shared'),
      p_platform: 'ios',
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from('user_devices')
      .select('push_token')
      .eq('push_token', token('shared'));
    expect(data).toHaveLength(1);
    const after = await ownerOf(token('shared'));
    expect(new Date(after.updated_at) >= new Date(before.updated_at)).toBe(true);
  });

  // One phone, two accounts: the last one to opt in is the one it rings for.
  it('moves a token to the next account that registers it on the device', async () => {
    const { error } = await B.client.rpc('register_push_device', {
      p_token: token('shared'),
      p_platform: 'ios',
    });
    expect(error).toBeNull();
    expect((await ownerOf(token('shared'))).user_id).toBe(B.id);
  });

  it('does not let A unregister a token that now belongs to B', async () => {
    const { error } = await A.client.rpc('unregister_push_device', {
      p_token: token('shared'),
    });
    expect(error).toBeNull();
    expect((await ownerOf(token('shared'))).user_id).toBe(B.id);
  });

  it('lets the owner unregister their own token', async () => {
    const { error } = await B.client.rpc('unregister_push_device', {
      p_token: token('shared'),
    });
    expect(error).toBeNull();
    expect(await ownerOf(token('shared'))).toBeNull();
  });
});

describe('register_push_device: per-account cap', () => {
  it('keeps the ten most recently registered devices', async () => {
    for (let i = 0; i < 12; i += 1) {
      const { error } = await A.client.rpc('register_push_device', {
        p_token: token(`cap-${String(i).padStart(2, '0')}`),
        p_platform: 'android',
      });
      expect(error).toBeNull();
    }
    const { data, error } = await admin
      .from('user_devices')
      .select('push_token')
      .eq('user_id', A.id)
      .like('push_token', token('cap-%'));
    expect(error).toBeNull();
    expect(data).toHaveLength(10);
    const kept = data.map((row) => row.push_token);
    // The two oldest fell off.
    expect(kept).not.toContain(token('cap-00'));
    expect(kept).not.toContain(token('cap-01'));
    expect(kept).toContain(token('cap-11'));
  });
});

describe('register_push_device: time zone (20261001120000)', () => {
  it('stores a zone the database knows', async () => {
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('tz-known'),
      p_platform: 'android',
      p_time_zone: 'Asia/Kolkata',
    });
    expect(error).toBeNull();
    expect((await ownerOf(token('tz-known'))).time_zone).toBe('Asia/Kolkata');
  });

  // An unknown name would make `at time zone` throw inside the sender's query
  // and fail every learner's reminder. The opt-in itself must still work.
  it('stores NULL for a name it does not know, without failing the opt-in', async () => {
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('tz-unknown'),
      p_platform: 'android',
      p_time_zone: 'Mars/Olympus_Mons',
    });
    expect(error).toBeNull();
    const row = await ownerOf(token('tz-unknown'));
    expect(row.user_id).toBe(A.id);
    expect(row.time_zone).toBeNull();
  });

  // Self-contained: it seeds its own zone, so it proves the clearing whether it
  // runs alone, reordered, or after the others.
  it('an older client that sends no zone clears the stale one (latest report wins)', async () => {
    const seeded = await A.client.rpc('register_push_device', {
      p_token: token('tz-cleared'),
      p_platform: 'android',
      p_time_zone: 'Europe/Berlin',
    });
    expect(seeded.error).toBeNull();
    expect((await ownerOf(token('tz-cleared'))).time_zone).toBe('Europe/Berlin');

    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('tz-cleared'),
      p_platform: 'android',
    });
    expect(error).toBeNull();
    expect((await ownerOf(token('tz-cleared'))).time_zone).toBeNull();
  });
});

describe('register_push_device: FCM tokens only (20261001120000)', () => {
  // A raw APNs device token is 32 bytes, sent as 64 hex characters. FCM's
  // HTTP v1 API cannot address one, so a build without the Firebase hand-off
  // must fail to opt in rather than store a token nothing can reach.
  it('refuses a raw APNs device token on ios', async () => {
    const raw = randomBytes(32).toString('hex');
    const { error } = await A.client.rpc('register_push_device', {
      p_token: raw,
      p_platform: 'ios',
      p_time_zone: 'Europe/Berlin',
    });
    expect(error).not.toBeNull();
    expect(error.code).toBe('22023');
    expect(await ownerOf(raw)).toBeNull();
  });

  it('accepts an FCM token on ios', async () => {
    const fcm = `${token('fcm-ios')}:APA91b${randomBytes(8).toString('hex')}`;
    const { error } = await A.client.rpc('register_push_device', {
      p_token: fcm,
      p_platform: 'ios',
      p_time_zone: 'Europe/Berlin',
    });
    expect(error).toBeNull();
    expect((await ownerOf(fcm)).time_zone).toBe('Europe/Berlin');
  });
});
