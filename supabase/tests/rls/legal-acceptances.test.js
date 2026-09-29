import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// legal_acceptances: 20260929120000. Clients read their own rows; the only
// write path is accept_legal_terms, which acts as auth.uid().
// Requires the local stack: `supabase start`, then `npm run test:rls`.

const admin = adminClient();
const V = { p_terms_version: '2026-10-01', p_privacy_version: '2026-10-01' };
let A;
let B;

async function rowsFor(userId) {
  const { data, error } = await admin.from('legal_acceptances').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  A = await createSignedInUser('legal-a');
  B = await createSignedInUser('legal-b');
});

afterAll(async () => {
  for (const u of [A, B])
    if (u?.id) await admin.from('legal_acceptances').delete().eq('user_id', u.id);
});

describe('accept_legal_terms', () => {
  it('anon cannot execute it', async () => {
    const { error } = await anonClient().rpc('accept_legal_terms', V);
    // 42501, not just "an error": a missing function would also error.
    expect(error?.code).toBe('42501');
  });

  it('records a row for the caller with the server clock', async () => {
    const before = Date.now();
    const { data, error } = await A.client.rpc('accept_legal_terms', V);
    expect(error).toBeNull();
    const rows = await rowsFor(A.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ terms_version: '2026-10-01', privacy_version: '2026-10-01' });
    expect(new Date(data).getTime()).toBeGreaterThanOrEqual(before - 5000);
  });

  it('is idempotent and keeps the first accepted_at', async () => {
    const [first] = await rowsFor(A.id);
    const { data, error } = await A.client.rpc('accept_legal_terms', V);
    expect(error).toBeNull();
    expect(new Date(data).toISOString()).toBe(new Date(first.accepted_at).toISOString());
    expect(await rowsFor(A.id)).toHaveLength(1);
  });

  it.each([['not-a-date'], [''], [null]])('rejects version %j', async (bad) => {
    const { error } = await A.client.rpc('accept_legal_terms', { ...V, p_terms_version: bad });
    expect(error?.code).toBe('22023');
  });

  it("never writes another user's row", async () => {
    await B.client.rpc('accept_legal_terms', { ...V, p_terms_version: '2027-01-01' });
    expect((await rowsFor(A.id)).map((r) => r.terms_version)).not.toContain('2027-01-01');
  });
});

describe('legal_acceptances: direct table access', () => {
  it('A reads own rows only', async () => {
    const { data, error } = await A.client.from('legal_acceptances').select('user_id');
    expect(error).toBeNull();
    expect(data.every((r) => r.user_id === A.id)).toBe(true);
  });

  it('A cannot insert directly, even for itself', async () => {
    const { error } = await A.client
      .from('legal_acceptances')
      .insert({ user_id: A.id, terms_version: '2020-01-01', privacy_version: '2020-01-01' });
    expect(error?.code).toBe('42501');
  });

  it('A cannot backdate or delete its history', async () => {
    await A.client
      .from('legal_acceptances')
      .update({ accepted_at: '2000-01-01' })
      .eq('user_id', A.id);
    await A.client.from('legal_acceptances').delete().eq('user_id', A.id);
    const rows = await rowsFor(A.id);
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].accepted_at).getFullYear()).toBeGreaterThan(2000);
  });
});
