import { describe, it, expect, beforeAll } from 'vitest';
import {
  adminClient,
  createSignedInUser,
  TEST_SUPABASE_URL,
  TEST_SERVICE_ROLE_KEY,
} from './helpers.js';
import { createRes } from '../../../api/_lib/test-helpers.js';

// 20261011120100: profiles is written by the server only, and the API's
// avatar-ownership and handle-length rules are database constraints.
//
// Before it, a signed-in learner could PATCH /rest/v1/profiles directly and
// skip every check in api/_lib/accountEndpoints.js — point avatar_path into
// another learner's folder, store a handle of any length. This suite attacks
// that path field by field, proves the constraints hold even for the service
// role, and drives the real account API in-process against the same stack to
// show the legitimate path still works.

const admin = adminClient();
const COLUMNS = 'handle, avatar_path, first_name, middle_name, last_name, is_private';

let A;
let B;
let profileHandler;

async function readProfile(id) {
  const { data, error } = await admin.from('profiles').select(COLUMNS).eq('user_id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function tokenOf(user) {
  const { data } = await user.client.auth.getSession();
  return data.session.access_token;
}

async function callProfileApi(user, body) {
  const res = createRes();
  await profileHandler(
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${await tokenOf(user)}`, 'x-forwarded-for': '10.11.0.1' },
      body,
    },
    res
  );
  return res;
}

beforeAll(async () => {
  A = await createSignedInUser('profile-write-a');
  B = await createSignedInUser('profile-write-b');
  // api/_lib/supabase.js reads these when the handler first needs a client,
  // so they are set before the module graph is imported.
  process.env.SUPABASE_URL ||= TEST_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= TEST_SERVICE_ROLE_KEY;
  ({ profileHandler } = await import('../../../api/_lib/accountEndpoints.js'));
});

describe('profiles: direct Data API writes are refused', () => {
  // Thunks, because A and B only exist once beforeAll has run.
  const patches = [
    ['handle', () => ({ handle: 'direct_write' })],
    ['an over-long handle', () => ({ handle: 'x'.repeat(200) })],
    ['avatar_path in their own folder', () => ({ avatar_path: `${A.id}/direct.webp` })],
    ["avatar_path in another user's folder", () => ({ avatar_path: `${B.id}/stolen.webp` })],
    ['first_name', () => ({ first_name: 'Direct' })],
    ['middle_name', () => ({ middle_name: 'Direct' })],
    ['last_name', () => ({ last_name: 'Direct' })],
    ['is_private', () => ({ is_private: true })],
    ['blocked_at', () => ({ blocked_at: null })],
  ];

  it.each(patches)('A cannot update %s on their own row', async (_label, patch) => {
    const before = await readProfile(A.id);
    const { error } = await A.client.from('profiles').update(patch()).eq('user_id', A.id);
    expect(error?.code).toBe('42501');
    expect(await readProfile(A.id)).toEqual(before);
  });

  it("A cannot update B's row either", async () => {
    const before = await readProfile(B.id);
    const { error } = await A.client
      .from('profiles')
      .update({ avatar_path: `${A.id}/mine.webp`, handle: 'hijacked' })
      .eq('user_id', B.id);
    expect(error?.code).toBe('42501');
    expect(await readProfile(B.id)).toEqual(before);
  });

  it('A cannot insert or upsert a profile row', async () => {
    const { error: insertError } = await A.client
      .from('profiles')
      .insert({ user_id: A.id, handle: 'second_row' });
    expect(insertError?.code).toBe('42501');

    const { error: upsertError } = await A.client
      .from('profiles')
      .upsert({ user_id: A.id, handle: 'upserted', is_private: true });
    expect(upsertError?.code).toBe('42501');
  });

  it('A can still read their own row', async () => {
    const { data, error } = await A.client.from('profiles').select('user_id').eq('user_id', A.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: A.id }]);
  });
});

describe('profiles: constraints hold for every writer, service role included', () => {
  it("refuses an avatar_path in another user's folder", async () => {
    const { error } = await admin
      .from('profiles')
      .update({ avatar_path: `${B.id}/stolen.webp` })
      .eq('user_id', A.id);
    expect(error?.code).toBe('23514');
  });

  it('refuses traversal out of the own folder', async () => {
    const { error } = await admin
      .from('profiles')
      .update({ avatar_path: `${A.id}/../${B.id}/stolen.webp` })
      .eq('user_id', A.id);
    expect(error?.code).toBe('23514');
  });

  it('refuses a folder that only looks like the owner’s (no separator)', async () => {
    const { error } = await admin
      .from('profiles')
      .update({ avatar_path: `${A.id}x/pic.webp` })
      .eq('user_id', A.id);
    expect(error?.code).toBe('23514');
  });

  it('refuses a handle outside 1–24 characters', async () => {
    for (const handle of ['', 'h'.repeat(25)]) {
      const { error } = await admin.from('profiles').update({ handle }).eq('user_id', A.id);
      expect(error?.code, JSON.stringify(handle)).toBe('23514');
    }
  });

  it('accepts an own-folder avatar, a cleared avatar and a 24-character handle', async () => {
    const original = await readProfile(A.id);
    const handle = `h${A.id.replace(/-/g, '')}`.slice(0, 24);
    const { error } = await admin
      .from('profiles')
      .update({ avatar_path: `${A.id}/ok.webp`, handle })
      .eq('user_id', A.id);
    expect(error).toBeNull();

    const { error: clearError } = await admin
      .from('profiles')
      .update({ avatar_path: null, handle: original.handle })
      .eq('user_id', A.id);
    expect(clearError).toBeNull();
  });
});

describe('profiles: the authenticated account API still works', () => {
  it('edits handle, names, privacy and an own-folder avatar', async () => {
    const handle = `api_${A.id.slice(0, 8)}`;
    const res = await callProfileApi(A, {
      handle,
      first_name: 'Api',
      middle_name: 'Path',
      last_name: 'Writer',
      is_private: true,
      avatar_path: `${A.id}/api.webp`,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(await readProfile(A.id)).toEqual({
      handle,
      avatar_path: `${A.id}/api.webp`,
      first_name: 'Api',
      middle_name: 'Path',
      last_name: 'Writer',
      is_private: true,
    });
  });

  it("refuses another user's avatar folder with a 400, writing nothing", async () => {
    const before = await readProfile(A.id);
    const res = await callProfileApi(A, { avatar_path: `${B.id}/stolen.webp` });
    expect(res.statusCode).toBe(400);
    expect(await readProfile(A.id)).toEqual(before);
  });

  it('refuses an over-long handle with a 400, writing nothing', async () => {
    const before = await readProfile(A.id);
    const res = await callProfileApi(A, { handle: 'x'.repeat(25) });
    expect(res.statusCode).toBe(400);
    expect(await readProfile(A.id)).toEqual(before);
  });
});
