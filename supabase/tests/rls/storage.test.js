import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// Adversarial suite for the avatars bucket.
//
// The unit tests can only prove the CLIENT builds a path of the right shape.
// Only a real Postgres can prove the policy rejects one that is not — and the
// bucket is PUBLIC, so a hole here is a hole anyone can walk through.
//
// The case worth the whole file is `renaming into another user's folder`. A
// policy written with `using` but no `with check` passes every other test here:
// ownership on SELECT, INSERT and DELETE all behave, and only the UPDATE path
// lets a learner move their own object into someone else's namespace and
// overwrite their avatar. Run this suite against such a policy and that one
// test is the only thing that fails.
//
// Listing is the other hole. The random filename is what keeps a public URL
// unguessable, and a SELECT open to everyone answers storage's list call with
// every user's folder and every filename in it.
//
// Requires the local stack: `supabase start` (Docker), then `npm run test:rls`.

const BUCKET = 'avatars';
const bytes = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' });

// The app reads other learners' avatars only through the public URL
// (src/lib/avatar.js), which a public bucket serves without consulting RLS, so
// every "is it still there?" check below asks that URL.
const publicStatus = async (path) => {
  const { data } = anonClient().storage.from(BUCKET).getPublicUrl(path);
  return (await fetch(data.publicUrl)).status;
};

let admin;
let alice;
let bob;
let alicePath;

beforeAll(async () => {
  admin = adminClient();
  alice = await createSignedInUser('storage-alice');
  bob = await createSignedInUser('storage-bob');

  alicePath = `${alice.id}/first.webp`;
  const { error } = await alice.client.storage.from(BUCKET).upload(alicePath, bytes(), {
    contentType: 'image/webp',
  });
  if (error) throw new Error(`fixture upload failed: ${error.message}`);
});

describe('avatars bucket configuration', () => {
  it('exists and is public', async () => {
    const { data, error } = await admin.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(data.public).toBe(true);
  });

  // The single most important line in the migration. An SVG in a public bucket
  // served from our own origin is stored XSS with a friendly extension.
  it('does NOT allow image/svg+xml', async () => {
    const { data } = await admin.storage.getBucket(BUCKET);
    expect(data.allowed_mime_types).not.toContain('image/svg+xml');
    expect(data.allowed_mime_types).toEqual(
      expect.arrayContaining(['image/webp', 'image/png', 'image/jpeg'])
    );
  });

  it('caps object size at 256 KB on the SERVER, not just in the client', async () => {
    const { data } = await admin.storage.getBucket(BUCKET);
    expect(data.file_size_limit).toBe(262144);
  });

  it('actually rejects an oversized upload', async () => {
    const big = new Blob([new Uint8Array(300 * 1024)], { type: 'image/webp' });
    const { error } = await alice.client.storage
      .from(BUCKET)
      .upload(`${alice.id}/too-big.webp`, big, { contentType: 'image/webp' });
    expect(error).not.toBeNull();
  });

  it('actually rejects an SVG upload', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {
      type: 'image/svg+xml',
    });
    const { error } = await alice.client.storage
      .from(BUCKET)
      .upload(`${alice.id}/x.svg`, svg, { contentType: 'image/svg+xml' });
    expect(error).not.toBeNull();
  });
});

describe('reading is public, listing is not', () => {
  it('lets a signed-out visitor fetch another user’s avatar by its public URL', async () => {
    // This is the requirement that made the bucket public: leaderboards render
    // avatars for people the viewer has no relationship with.
    expect(await publicStatus(alicePath)).toBe(200);
  });

  // The admin sees Alice's folder first, so an empty anonymous answer means
  // refused, not an empty bucket.
  it('refuses to list the bucket to a signed-out visitor', async () => {
    const seen = await admin.storage.from(BUCKET).list('', { search: alice.id });
    expect(seen.data.map((entry) => entry.name)).toEqual([alice.id]);

    const { data, error } = await anonClient().storage.from(BUCKET).list('', { limit: 1000 });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('refuses to list another user’s folder, signed out or signed in', async () => {
    const seen = await admin.storage.from(BUCKET).list(alice.id);
    expect(seen.data.map((entry) => entry.name)).toContain('first.webp');

    for (const client of [anonClient(), bob.client]) {
      const { data } = await client.storage.from(BUCKET).list(alice.id);
      expect(data).toEqual([]);
    }
  });

  it('still lets a user list their own folder', async () => {
    const { data, error } = await alice.client.storage.from(BUCKET).list(alice.id);
    expect(error).toBeNull();
    expect(data.map((entry) => entry.name)).toContain('first.webp');
  });
});

describe('writing is confined to your own folder', () => {
  it('lets a user upload into their own folder', async () => {
    const { error } = await bob.client.storage
      .from(BUCKET)
      .upload(`${bob.id}/mine.webp`, bytes(), { contentType: 'image/webp' });
    expect(error).toBeNull();
  });

  it('refuses an upload into someone else’s folder', async () => {
    const { error } = await bob.client.storage
      .from(BUCKET)
      .upload(`${alice.id}/intruder.webp`, bytes(), { contentType: 'image/webp' });
    expect(error).not.toBeNull();
  });

  it('refuses an upload at the bucket root, where there is no owner segment', async () => {
    const { error } = await bob.client.storage
      .from(BUCKET)
      .upload('rootless.webp', bytes(), { contentType: 'image/webp' });
    expect(error).not.toBeNull();
  });

  it('refuses to overwrite someone else’s object', async () => {
    const { error } = await bob.client.storage
      .from(BUCKET)
      .upload(alicePath, bytes(), { contentType: 'image/webp', upsert: true });
    expect(error).not.toBeNull();
  });

  it('refuses to delete someone else’s object', async () => {
    await bob.client.storage.from(BUCKET).remove([alicePath]);
    // remove() can report success with an empty result set, so the proof is
    // that the object is still downloadable afterwards.
    expect(await publicStatus(alicePath)).toBe(200);
  });

  // remove() needs SELECT on the row as well as DELETE, so this also proves the
  // own-folder read policy is wide enough for replacing an avatar.
  it('lets a user delete their own object', async () => {
    const path = `${bob.id}/disposable.webp`;
    await bob.client.storage.from(BUCKET).upload(path, bytes(), { contentType: 'image/webp' });
    const { data, error } = await bob.client.storage.from(BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data.map((entry) => entry.name)).toEqual([path]);
    expect(await publicStatus(path)).not.toBe(200);
  });

  // ── THE `with check` TEST ────────────────────────────────────────
  //
  // `using` alone would permit this: the row being updated IS Bob's, so the
  // USING clause passes. Only `with check` inspects what the row looks like
  // AFTERWARDS and refuses to let the name land in Alice's folder.
  it('refuses to RENAME an owned object into another user’s folder', async () => {
    const path = `${bob.id}/movable.webp`;
    await bob.client.storage.from(BUCKET).upload(path, bytes(), { contentType: 'image/webp' });

    const target = `${alice.id}/stolen.webp`;
    const { error } = await bob.client.storage.from(BUCKET).move(path, target);
    expect(error, 'move into another user folder must be refused').not.toBeNull();

    // And nothing landed there.
    expect(await publicStatus(target)).not.toBe(200);
  });

  it('allows a rename WITHIN your own folder', async () => {
    const from = `${bob.id}/rename-me.webp`;
    await bob.client.storage.from(BUCKET).upload(from, bytes(), { contentType: 'image/webp' });
    const { error } = await bob.client.storage.from(BUCKET).move(from, `${bob.id}/renamed.webp`);
    expect(error).toBeNull();
  });
});

describe('profiles.avatar_path', () => {
  it('exists and defaults to null', async () => {
    const { data, error } = await admin
      .from('profiles')
      .select('avatar_path')
      .eq('user_id', alice.id)
      .single();
    expect(error).toBeNull();
    expect(data.avatar_path).toBeNull();
  });

  it('is the only avatar column — avatar_emoji has been dropped', async () => {
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .eq('user_id', alice.id)
      .single();
    expect(error).toBeNull();
    expect(data).not.toHaveProperty('avatar_emoji');
  });
});
