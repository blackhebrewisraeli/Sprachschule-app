import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// claim_streak_reminders (20261001120000): who is due a streak reminder at a
// given instant, and the claim that makes it at most one per local day.
// Every call passes p_now, so nothing here depends on the real clock or on what
// other suites write for the current week.
//
// Requires the local stack: `supabase start` (Docker), then `npm run test:rls`.

const admin = adminClient();
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// 17:10Z on 2026-10-01 is 19:10 in Berlin (CEST): inside the 19–21 window.
// New York is at 13:10 and Kolkata at 22:40, both outside it.
const NOW = '2026-10-01T17:10:00Z';
const TODAY = '2026-10-01';
const YESTERDAY = '2026-09-30';

const PARAMS = {
  p_start_hour: 19,
  p_window_hours: 3,
  p_default_goal: 50,
  p_pack_id: 'de',
  p_limit: 10000,
};

const DUE_AT_NOW = [
  'due',
  'frozen-yesterday',
  'goal-20-at-risk',
  'junk-goal',
  'newest-zoneless',
  'two-devices',
];

// n correct A1 answers = 10n XP, the weight progress_day_xp uses.
const counters = (correct) => ({
  total: correct,
  bonusXp: 0,
  byTab: { chat: 0, alphabet: 0, vocab: correct, translate: 0 },
  byLevel: {
    a1: { correct, almost: 0, wrong: 0 },
    a2: { correct: 0, almost: 0, wrong: 0 },
    b1: { correct: 0, almost: 0, wrong: 0 },
  },
});

const users = {};

async function must(query) {
  const { error } = await query;
  if (error) throw error;
}

async function learner(
  label,
  { devices = [{ zone: 'Europe/Berlin' }], days = {}, settings = null, blocked = false } = {}
) {
  const user = await createSignedInUser(`reminder-${label}`);
  const tokens = [];
  for (const [i, device] of devices.entries()) {
    const token = `reminder-${RUN}-${label}-${i}`;
    tokens.push(token);
    await must(
      admin.from('user_devices').insert({
        push_token: token,
        user_id: user.id,
        platform: 'android',
        time_zone: device.zone,
        updated_at: device.updatedAt ?? new Date(Date.now() + i * 1000).toISOString(),
      })
    );
  }
  for (const [day, correct] of Object.entries(days)) {
    await must(
      admin
        .from('stats_daily')
        .insert({ user_id: user.id, pack_id: 'de', day, counters: counters(correct) })
    );
  }
  if (settings) await must(admin.from('settings').upsert({ user_id: user.id, data: settings }));
  if (blocked) {
    await must(
      admin.from('profiles').update({ blocked_at: new Date().toISOString() }).eq('user_id', user.id)
    );
  }
  users[label] = { ...user, tokens };
}

async function claim(extra = {}) {
  const { data, error } = await admin.rpc('claim_streak_reminders', {
    p_now: NOW,
    ...PARAMS,
    ...extra,
  });
  if (error) throw error;
  return data;
}

// Only the learners this file made; rows for other suites' users are ignored.
function ours(rows) {
  const ids = new Set(Object.values(users).map((u) => u.id));
  return rows.filter((row) => ids.has(row.user_id));
}

function labels(rows) {
  const byId = new Map(Object.entries(users).map(([label, u]) => [u.id, label]));
  return [...new Set(ours(rows).map((row) => byId.get(row.user_id)))].sort();
}

beforeAll(async () => {
  const atRisk = { [YESTERDAY]: 5, [TODAY]: 4 }; // 50 XP yesterday, 40 today
  await learner('due', { days: atRisk });
  await learner('done-today', { days: { [YESTERDAY]: 5, [TODAY]: 5 } });
  await learner('no-streak', { days: { [TODAY]: 1 } });
  await learner('frozen-yesterday', { settings: { frozenDays: { [YESTERDAY]: true } } });
  // Due ONLY because the learner's own goal (20) is read: under the default 50,
  // yesterday's 20 XP would not have counted.
  await learner('goal-20-at-risk', {
    days: { [YESTERDAY]: 2, [TODAY]: 1 },
    settings: { goal: 20 },
  });
  // settings.data is client-writable: junk must fall back, never throw.
  await learner('junk-goal', { days: atRisk, settings: { goal: 'lots', frozenDays: ['nope'] } });
  await learner('new-york', { devices: [{ zone: 'America/New_York' }], days: atRisk });
  await learner('no-zone', { devices: [{ zone: null }], days: atRisk });
  await learner('blocked', { days: atRisk, blocked: true });
  await learner('two-devices', {
    devices: [
      { zone: 'America/New_York', updatedAt: '2026-09-01T00:00:00Z' },
      { zone: 'Europe/Berlin', updatedAt: '2026-09-30T00:00:00Z' },
    ],
    days: atRisk,
  });
  await learner('newest-zoneless', {
    devices: [
      { zone: 'Europe/Berlin', updatedAt: '2026-09-01T00:00:00Z' },
      { zone: null, updatedAt: '2026-09-30T00:00:00Z' },
    ],
    days: atRisk,
  });
  await learner('berlin-dst', { days: { '2026-10-24': 5, '2026-10-25': 0 } });
  await learner('kolkata', { devices: [{ zone: 'Asia/Kolkata' }], days: { [YESTERDAY]: 5 } });
}, 120000);

afterAll(async () => {
  for (const user of Object.values(users)) {
    await admin.from('push_reminder_claims').delete().eq('user_id', user.id);
    await admin.from('user_devices').delete().eq('user_id', user.id);
    await admin.from('stats_daily').delete().eq('user_id', user.id);
  }
});

describe('claim_streak_reminders: privilege and parameters', () => {
  it('anon cannot execute it', async () => {
    const { error } = await anonClient().rpc('claim_streak_reminders', {
      p_now: NOW,
      ...PARAMS,
      p_dry_run: true,
    });
    expect(error).not.toBeNull();
  });

  it('a signed-in learner cannot execute it', async () => {
    const { error } = await users.due.client.rpc('claim_streak_reminders', {
      p_now: NOW,
      ...PARAMS,
      p_dry_run: true,
    });
    expect(error).not.toBeNull();
  });

  it('rejects a window that runs past midnight', async () => {
    const { error } = await admin.rpc('claim_streak_reminders', {
      p_now: NOW,
      ...PARAMS,
      p_start_hour: 22,
      p_window_hours: 3,
      p_dry_run: true,
    });
    expect(error?.code).toBe('22023');
  });
});

describe('claim_streak_reminders: who is due (dry run)', () => {
  it('selects exactly the learners whose streak is at risk in their own evening', async () => {
    expect(labels(await claim({ p_dry_run: true }))).toEqual(DUE_AT_NOW);
  });

  it('returns every device of a due learner, zone from the newest device that has one', async () => {
    const rows = ours(await claim({ p_dry_run: true }));
    for (const label of ['two-devices', 'newest-zoneless']) {
      const mine = rows.filter((row) => row.user_id === users[label].id);
      expect(mine.map((row) => row.push_token).sort()).toEqual([...users[label].tokens].sort());
      for (const row of mine) {
        expect(row.local_day).toBe(TODAY);
        // 2026-10-02 00:00 in Berlin (CEST, UTC+2)
        expect(new Date(row.expires_at).toISOString()).toBe('2026-10-01T22:00:00.000Z');
      }
    }
  });

  it('claims nothing on a dry run', async () => {
    const ids = Object.values(users).map((u) => u.id);
    const { data, error } = await admin
      .from('push_reminder_claims')
      .select('user_id')
      .in('user_id', ids);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('p_only_user ignores the hour window but not the streak rule', async () => {
    expect(labels(await claim({ p_dry_run: true, p_only_user: users['new-york'].id }))).toEqual([
      'new-york',
    ]);
    expect(labels(await claim({ p_dry_run: true, p_only_user: users['done-today'].id }))).toEqual(
      []
    );
  });
});

describe('claim_streak_reminders: claiming', () => {
  it('claims each due learner once per local day', async () => {
    expect(labels(await claim())).toEqual(DUE_AT_NOW);
    expect(labels(await claim())).toEqual([]);
  });

  it('a claim holds for the rest of the window', async () => {
    expect(labels(await claim({ p_now: '2026-10-01T19:55:00Z' }))).toEqual([]); // 21:55 Berlin
  });

  it('a released claim is picked up by the next tick', async () => {
    await must(
      admin.from('push_reminder_claims').delete().eq('user_id', users.due.id).eq('local_day', TODAY)
    );
    expect(labels(await claim({ p_now: '2026-10-01T18:10:00Z' }))).toEqual(['due']);
  });

  it('prunes claims older than eight days on a real run', async () => {
    await must(
      admin
        .from('push_reminder_claims')
        .insert({
          user_id: users['no-streak'].id,
          local_day: '2026-09-01',
          claimed_at: '2026-09-01T18:00:00Z',
        })
    );
    await claim();
    const { data } = await admin
      .from('push_reminder_claims')
      .select('local_day')
      .eq('user_id', users['no-streak'].id);
    expect(data).toEqual([]);
  });
});

describe('claim_streak_reminders: clocks', () => {
  it('uses the offset in force that day (Berlin, first day of winter time)', async () => {
    // 18:10Z on 2026-10-25 is 19:10 CET (UTC+1, the day the clocks went back).
    const rows = ours(await claim({ p_now: '2026-10-25T18:10:00Z', p_dry_run: true }));
    expect(labels(rows)).toEqual(['berlin-dst']);
    expect(new Date(rows[0].expires_at).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('opens the window once in a half-hour offset zone (Kolkata, UTC+5:30)', async () => {
    // 13:40Z is 19:10 IST.
    const rows = ours(await claim({ p_now: '2026-10-01T13:40:00Z', p_dry_run: true }));
    expect(labels(rows)).toEqual(['kolkata']);
    expect(new Date(rows[0].expires_at).toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });
});
