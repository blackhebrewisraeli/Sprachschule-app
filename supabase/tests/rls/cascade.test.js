import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createSignedInUser } from './helpers.js';

// Deletion-completeness suite.
//
// api/v1/account/delete.js deletes the auth user and nothing else, because every
// user-owned table declares `references auth.users(id) on delete cascade`. That
// is the ONLY thing making the deletion complete — there is no longer an explicit
// per-table delete loop to fall back on (and the loop it replaced never covered
// `decks` anyway).
//
// This suite is the guard for that decision. If anyone adds a user-owned table
// without `on delete cascade`, or drops the constraint, the deletion silently
// starts leaving rows behind and THIS is the test that fails. The unit test in
// api/v1/account/delete.test.js can only prove the handler issues one call; only
// a real Postgres can prove that one call is sufficient.
//
// Requires the local stack: `supabase start` (Docker), then `npm run test:rls`.
// Deliberately outside `npm test` and the pre-commit hook.

// Every table that holds rows keyed to a user. `leagues` is excluded on purpose:
// it is shared competition scaffolding, not user-owned, and must SURVIVE the
// deletion of any one member.
const USER_OWNED = [
  'profiles',
  'srs_state',
  'stats_daily',
  'decks',
  'settings',
  'league_members',
  'progress_events_seen',
  'feedback',
  'token_ledger',
  'user_devices',
  'push_reminder_claims',
  'legal_acceptances',
  'ai_conversations',
  'ai_messages',
];

let admin;
let userId;
let leagueId;

beforeAll(async () => {
  admin = adminClient();
  const user = await createSignedInUser('cascade');
  userId = user.id;

  // A league to hang a membership off. Shared row, deliberately not user-owned.
  const { data: league, error: leagueErr } = await admin
    .from('leagues')
    .insert({ tier: 0, period_start: '2026-08-31' })
    .select()
    .single();
  if (leagueErr) throw leagueErr;
  leagueId = league.id;

  // Populate every user-owned table. `profiles` already exists via the
  // on_auth_user_created trigger, so it is updated rather than inserted.
  const seed = [
    admin
      .from('profiles')
      .update({ first_name: 'Cascade', last_name: 'Probe' })
      .eq('user_id', userId),
    admin.from('srs_state').insert({ user_id: userId, srs_key: 'greetings:Hallo', box: 2 }),
    admin
      .from('stats_daily')
      .insert({ user_id: userId, day: '2026-08-31', counters: { total: 1 } }),
    admin.from('decks').insert({ user_id: userId, deck_id: 'custom', name: 'My deck', cards: [] }),
    admin.from('settings').insert({ user_id: userId, data: { soundOn: true } }),
    admin.from('league_members').insert({
      league_id: leagueId,
      user_id: userId,
      handle: 'cascade-probe',
      weekly_xp: 10,
      period_start: '2026-08-31',
    }),
    admin.from('progress_events_seen').insert({
      user_id: userId,
      event_id: '11111111-1111-4111-8111-111111111111',
    }),
    admin.from('feedback').insert({
      user_id: userId,
      category: 'ui',
      message: 'cascade probe',
    }),
    admin
      .from('token_ledger')
      .insert({ user_id: userId, reason: 'daily_quest', idem_key: 'cascade-probe', delta: 10 }),
    admin
      .from('user_devices')
      .insert({ push_token: `cascade-probe-${userId}`, user_id: userId, platform: 'ios' }),
    admin.from('push_reminder_claims').insert({ user_id: userId, local_day: '2026-10-01' }),
    admin
      .from('legal_acceptances')
      .insert({ user_id: userId, terms_version: '2026-10-01', privacy_version: '2026-10-01' }),
    admin.from('ai_conversations').insert({
      user_id: userId,
      id: '22222222-2222-4222-8222-222222222222',
      scenario_id: 'cafe',
      level: 'a1',
    }),
  ];
  for (const q of seed) {
    const { error } = await q;
    if (error) throw error;
  }

  // A message needs its conversation to exist first (composite FK), so it
  // cannot ride the concurrent batch above.
  const { error: messageErr } = await admin.from('ai_messages').insert({
    user_id: userId,
    conversation_id: '22222222-2222-4222-8222-222222222222',
    seq: 1,
    role: 'user',
    content: 'cascade probe',
  });
  if (messageErr) throw messageErr;
});

describe('account deletion cascade', () => {
  // The fixture must actually be populated, or "zero rows afterwards" proves
  // nothing — an empty table looks identical to a perfectly cascaded one.
  it('every user-owned table holds a row BEFORE the delete', async () => {
    for (const table of USER_OWNED) {
      const { data, error } = await admin.from(table).select('user_id').eq('user_id', userId);
      expect(error, `${table} query failed`).toBeNull();
      expect(data?.length, `${table} fixture is empty — the test cannot fail`).toBeGreaterThan(0);
    }
  });

  it('deleting the auth user leaves zero rows in every user-owned table', async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    expect(error).toBeNull();

    for (const table of USER_OWNED) {
      const { data, error: readErr } = await admin
        .from(table)
        .select('user_id')
        .eq('user_id', userId);
      expect(readErr, `${table} query failed`).toBeNull();
      expect(data, `${table} still holds rows after the auth user was deleted`).toEqual([]);
    }
  });

  it('leaves the shared league row intact — it is not user-owned', async () => {
    const { data, error } = await admin.from('leagues').select('id').eq('id', leagueId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
