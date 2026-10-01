// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { REMINDER, COPY, buildReminderMessage, runStreakReminders } from './streakReminder.js';

const NOW = Date.parse('2026-10-01T17:10:00Z');
const MIDNIGHT_BERLIN = '2026-10-01T22:00:00+00:00';

const row = (userId, token, localDay = '2026-10-01', expiresAt = MIDNIGHT_BERLIN) => ({
  user_id: userId,
  local_day: localDay,
  expires_at: expiresAt,
  push_token: token,
});

// A supabase-js stand-in: rpc, a head count on user_devices, and thenable
// delete chains whose filters are recorded.
function fakeDb(rows = [], { rpcError = null, zoneless = 0 } = {}) {
  const deletes = [];
  const db = {
    rpc: vi.fn(async () => ({ data: rows, error: rpcError })),
    from: vi.fn((table) => ({
      select: vi.fn(() => ({ is: vi.fn(async () => ({ count: zoneless, error: null })) })),
      delete: vi.fn(() => {
        const call = { table, eq: {}, in: {} };
        deletes.push(call);
        const chain = {
          eq(column, value) {
            call.eq[column] = value;
            return chain;
          },
          in(column, values) {
            call.in[column] = values;
            return chain;
          },
          then(resolve) {
            resolve({ error: null });
          },
        };
        return chain;
      }),
    })),
  };
  return { db, deletes };
}

function fakeFcm(outcomes = {}, onSend = () => {}) {
  return {
    accessToken: vi.fn(async () => 'access-token'),
    send: vi.fn(async (message) => {
      onSend(message);
      // A bare string is an outcome; { outcome, code } carries an FCM code too.
      const result = outcomes[message.token] ?? 'sent';
      if (result instanceof Error) throw result;
      return typeof result === 'string' ? { outcome: result } : result;
    }),
  };
}

const released = (deletes) =>
  deletes.filter((d) => d.table === 'push_reminder_claims').flatMap((d) => d.in.user_id);
const deletedTokens = (deletes) =>
  deletes.filter((d) => d.table === 'user_devices').flatMap((d) => d.in.push_token);

describe('buildReminderMessage', () => {
  const message = buildReminderMessage({
    token: 't',
    localDay: '2026-10-01',
    expiresAt: Date.parse(MIDNIGHT_BERLIN),
    now: NOW,
  });

  it("expires at the learner's local midnight on both platforms", () => {
    expect(message.android.ttl).toBe('17400s'); // 17:10Z → 22:00Z
    expect(message.apns.headers['apns-expiration']).toBe(
      String(Date.parse(MIDNIGHT_BERLIN) / 1000)
    );
  });

  it('collapses a duplicate delivery into one notification', () => {
    expect(message.android.collapse_key).toBe('streak_reminder');
    expect(message.android.notification.tag).toBe('streak_reminder');
    expect(message.apns.headers['apns-collapse-id']).toBe('streak_reminder');
  });

  it("carries the kind and the client's own dateKey, as strings (FCM requires it)", () => {
    expect(message.data).toEqual({ kind: 'streak_reminder', dateKey: '2026-10-01' });
    expect(message.notification).toEqual({ title: COPY.title, body: COPY.body });
  });

  it('notification text uses correct quotation marks', () => {
    expect(message.notification).toEqual({
      title: 'Keep your streak alive',
      body: 'You haven’t reached today’s goal yet. A few minutes of practice keeps your streak going.',
    });
    expect(COPY.body).not.toContain("'");
    expect(COPY.body.match(/’/g)).toHaveLength(2);
  });

  it('never asks for a TTL below a minute', () => {
    const late = buildReminderMessage({
      token: 't',
      localDay: '2026-10-01',
      expiresAt: NOW - 1000,
      now: NOW,
    });
    expect(late.android.ttl).toBe('60s');
  });
});

describe('runStreakReminders', () => {
  it('dry run counts who is due without authenticating, sending or claiming', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u1', 'b'), row('u2', 'c')], {
      zoneless: 3,
    });
    const summary = await runStreakReminders({ db, fcm: null, dryRun: true, now: () => NOW });
    expect(summary).toMatchObject({
      dryRun: true,
      due: 2,
      devices: 3,
      sent: 0,
      devicesWithoutZone: 3,
      aborted: null,
    });
    expect(db.rpc).toHaveBeenCalledWith('claim_streak_reminders', {
      p_now: '2026-10-01T17:10:00.000Z',
      p_start_hour: 19,
      p_window_hours: 3,
      p_default_goal: 50,
      p_pack_id: 'de',
      p_limit: 100,
      p_only_user: null,
      p_dry_run: true,
    });
    expect(deletes).toEqual([]);
  });

  it('authenticates before claiming anyone', async () => {
    const { db } = fakeDb([row('u1', 'a')]);
    const fcm = fakeFcm();
    fcm.accessToken.mockRejectedValue(new Error('refused'));
    await expect(runStreakReminders({ db, fcm, now: () => NOW })).rejects.toThrow('refused');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('sends one message to every device of every claimed learner, and keeps the claims', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u1', 'b'), row('u2', 'c')]);
    const fcm = fakeFcm();
    const summary = await runStreakReminders({ db, fcm, now: () => NOW });
    expect(fcm.send.mock.calls.map(([m]) => m.token).sort()).toEqual(['a', 'b', 'c']);
    expect(summary).toMatchObject({ due: 2, devices: 3, sent: 3, released: 0, aborted: null });
    expect(deletes).toEqual([]);
  });

  it('deletes dead tokens but keeps tokens and claims on a config error', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b')]);
    const summary = await runStreakReminders({
      db,
      fcm: fakeFcm({ a: 'dead', b: 'config' }),
      now: () => NOW,
    });
    expect(deletedTokens(deletes)).toEqual(['a']);
    expect(released(deletes)).toEqual([]);
    expect(summary).toMatchObject({ dead: 1, configErrors: 1, sent: 0 });
  });

  it.each(['dead', 'config'])(
    'releases a learner when one device is %s but another can be retried',
    async (finalOutcome) => {
      const { db, deletes } = fakeDb([row('u1', 'a'), row('u1', 'b')]);
      await runStreakReminders({
        db,
        fcm: fakeFcm({ a: finalOutcome, b: 'retry' }),
        now: () => NOW,
      });
      expect(released(deletes)).toEqual(['u1']);
      expect(deletedTokens(deletes)).toEqual(finalOutcome === 'dead' ? ['a'] : []);
    }
  );

  it('releases the claim of a learner none of whose devices could be reached', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u2', 'c')]);
    const summary = await runStreakReminders({
      db,
      fcm: fakeFcm({ a: 'retry', c: 'retry' }),
      now: () => NOW,
    });
    expect(released(deletes)).toEqual(['u1']); // u2 got it on b
    const claimDelete = deletes.find((d) => d.table === 'push_reminder_claims');
    expect(claimDelete.eq.local_day).toBe('2026-10-01');
    expect(summary).toMatchObject({ sent: 1, failed: 2, released: 1 });
  });

  it('stops at a quota error and releases everyone not reached', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u3', 'c')]);
    const fcm = fakeFcm({ a: 'quota' });
    const summary = await runStreakReminders({
      db,
      fcm,
      now: () => NOW,
      config: { ...REMINDER, concurrency: 1 },
    });
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(summary.aborted).toBe('quota');
    expect(released(deletes).sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('stops starting new learners at the deadline', async () => {
    let clock = NOW;
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u3', 'c')]);
    const fcm = fakeFcm({}, () => {
      clock += REMINDER.deadlineMs + 1000;
    });
    const summary = await runStreakReminders({
      db,
      fcm,
      now: () => clock,
      config: { ...REMINDER, concurrency: 1 },
    });
    expect(summary).toMatchObject({ sent: 1, aborted: 'deadline' });
    expect(released(deletes).sort()).toEqual(['u2', 'u3']);
  });

  // Each device can take ~25 s (FCM timeout + wait + retry), so a check only
  // between learners lets a multi-device learner started just before the
  // deadline overrun maxDuration and lose the whole run's cleanup (spec §12).
  it('checks the deadline before every send, not only between learners', async () => {
    let clock = NOW;
    const { db, deletes } = fakeDb([
      row('u1', 'a'),
      row('u2', 'b'),
      row('u2', 'c'),
      row('u2', 'd'),
      row('u2', 'e'),
    ]);
    const fcm = fakeFcm({ b: 'retry', c: 'retry', d: 'retry', e: 'retry' }, (message) => {
      // u1 eats all but the last second; each of u2's attempts then takes 25 s.
      clock += message.token === 'a' ? REMINDER.deadlineMs - 1000 : 25_000;
    });
    const summary = await runStreakReminders({
      db,
      fcm,
      now: () => clock,
      config: { ...REMINDER, concurrency: 1 },
    });
    expect(fcm.send.mock.calls.map(([m]) => m.token)).toEqual(['a', 'b']);
    expect(summary).toMatchObject({ sent: 1, failed: 1, aborted: 'deadline', released: 1 });
    expect(released(deletes)).toEqual(['u2']); // one 'retry' is no settled outcome
  });

  // Review focus 5: an exception mid-run must not strand today's claims.
  it('a send that throws stops the run as fatal and releases the claims', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b')]);
    const fcm = fakeFcm({ a: new Error('token refresh failed') });
    const summary = await runStreakReminders({
      db,
      fcm,
      now: () => NOW,
      config: { ...REMINDER, concurrency: 1 },
    });
    expect(summary.aborted).toBe('fatal');
    expect(released(deletes).sort()).toEqual(['u1', 'u2']);
  });

  it("passes the owner's single-learner filter through", async () => {
    const { db } = fakeDb([]);
    await runStreakReminders({
      db,
      fcm: fakeFcm(),
      onlyUserId: '11111111-1111-4111-8111-111111111111',
      now: () => NOW,
    });
    expect(db.rpc.mock.calls[0][1].p_only_user).toBe('11111111-1111-4111-8111-111111111111');
    expect(db.rpc.mock.calls[0][1].p_dry_run).toBe(false);
  });

  it('surfaces an RPC error instead of reporting an empty run', async () => {
    const { db } = fakeDb([], { rpcError: { message: 'function does not exist' } });
    await expect(runStreakReminders({ db, fcm: fakeFcm(), now: () => NOW })).rejects.toMatchObject({
      message: 'function does not exist',
    });
  });

  it('a dry run still surfaces an RPC error', async () => {
    const { db } = fakeDb([], { rpcError: { message: 'function does not exist' } });
    await expect(
      runStreakReminders({ db, fcm: null, dryRun: true, now: () => NOW })
    ).rejects.toMatchObject({ message: 'function does not exist' });
  });

  // PostgREST returns at most 1000 rows from an RPC and a learner has up to 10
  // devices, so one call may claim at most batchSize learners (the SQL refuses
  // more). A run pages until a batch comes back short.
  it('pages through batches until a batch comes back short', async () => {
    const pages = [
      [row('u1', 'a'), row('u2', 'b')],
      [row('u3', 'c'), row('u4', 'd')],
      [row('u5', 'e')],
    ];
    const { db } = fakeDb();
    db.rpc.mockImplementation(async () => ({ data: pages.shift() ?? [], error: null }));
    const summary = await runStreakReminders({
      db,
      fcm: fakeFcm(),
      now: () => NOW,
      config: { ...REMINDER, batchSize: 2 },
    });
    expect(db.rpc.mock.calls.map(([, args]) => args.p_limit)).toEqual([2, 2, 2]);
    expect(summary).toMatchObject({ due: 5, devices: 5, sent: 5, aborted: null });
  });

  it('stops paging at maxUsersPerRun', async () => {
    const { db } = fakeDb();
    db.rpc.mockImplementation(async (_fn, args) => {
      const call = db.rpc.mock.calls.length;
      return {
        data: Array.from({ length: args.p_limit }, (_, i) => row(`u${call}-${i}`, `t${call}-${i}`)),
        error: null,
      };
    });
    const summary = await runStreakReminders({
      db,
      fcm: fakeFcm(),
      now: () => NOW,
      config: { ...REMINDER, batchSize: 2, maxUsersPerRun: 5 },
    });
    expect(db.rpc.mock.calls.map(([, args]) => args.p_limit)).toEqual([2, 2, 1]);
    expect(summary).toMatchObject({ due: 5, sent: 5 });
  });

  it('a dry run asks once: it claims nothing, so asking again would repeat the batch', async () => {
    const { db } = fakeDb([row('u1', 'a'), row('u2', 'b')]);
    await runStreakReminders({
      db,
      fcm: null,
      dryRun: true,
      now: () => NOW,
      config: { ...REMINDER, batchSize: 2 },
    });
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('stops paging once the deadline has passed, without claiming another batch', async () => {
    let clock = NOW;
    const { db } = fakeDb();
    db.rpc.mockImplementation(async () => ({
      data: [row('u1', 'a'), row('u2', 'b')],
      error: null,
    }));
    const fcm = fakeFcm({}, () => {
      clock += REMINDER.deadlineMs / 2 + 1000;
    });
    const summary = await runStreakReminders({
      db,
      fcm,
      now: () => clock,
      config: { ...REMINDER, batchSize: 2, concurrency: 1 },
    });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ sent: 2, aborted: 'deadline' });
  });

  it('releases what it could not reach even when a later page fails, then rethrows', async () => {
    const pages = [[row('u1', 'a'), row('u2', 'b')], new Error('page 2 failed')];
    const { db, deletes } = fakeDb();
    db.rpc.mockImplementation(async () => {
      const next = pages.shift();
      if (next instanceof Error) throw next;
      return { data: next, error: null };
    });
    const fcm = fakeFcm({ a: 'retry', b: 'dead' });
    await expect(
      runStreakReminders({
        db,
        fcm,
        now: () => NOW,
        config: { ...REMINDER, batchSize: 2, concurrency: 1 },
      })
    ).rejects.toThrow('page 2 failed');
    expect(released(deletes)).toEqual(['u1']);
    expect(deletedTokens(deletes)).toEqual(['b']);
  });

  // Spec §16 promises counts and FCM error codes: without them a misconfigured
  // first run only says "failed: 3" and nothing about why.
  it('counts every non-sent outcome by its FCM code', async () => {
    const { db } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u3', 'c'), row('u4', 'd')]);
    const summary = await runStreakReminders({
      db,
      fcm: fakeFcm({
        a: { outcome: 'dead', code: 'UNREGISTERED' },
        b: { outcome: 'config', code: 'THIRD_PARTY_AUTH_ERROR' },
        c: { outcome: 'retry', code: 'NETWORK' },
        d: 'retry', // no code: the outcome names it
      }),
      now: () => NOW,
      config: { ...REMINDER, concurrency: 1 },
    });
    expect(summary.codes).toEqual({
      UNREGISTERED: 1,
      THIRD_PARTY_AUTH_ERROR: 1,
      NETWORK: 1,
      retry: 1,
    });
  });

  it('codes stays empty when everything is sent', async () => {
    const { db } = fakeDb([row('u1', 'a')]);
    const summary = await runStreakReminders({ db, fcm: fakeFcm(), now: () => NOW });
    expect(summary.codes).toEqual({});
  });

  it('reports a throwing send as SEND_THREW, never its message', async () => {
    const { db } = fakeDb([row('u1', 'a')]);
    const fcm = fakeFcm({ a: new Error('token abc123 refused') });
    const summary = await runStreakReminders({ db, fcm, now: () => NOW });
    expect(summary.codes).toEqual({ SEND_THREW: 1 });
    expect(JSON.stringify(summary)).not.toContain('abc123');
  });

  it('reports a malformed send result as SEND_THREW too', async () => {
    const { db } = fakeDb([row('u1', 'a')]);
    const fcm = fakeFcm();
    fcm.send.mockImplementation(async () => undefined);
    const summary = await runStreakReminders({ db, fcm, now: () => NOW });
    expect(summary.codes).toEqual({ SEND_THREW: 1 });
  });

  it('treats a malformed send result as fatal', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b')]);
    const fcm = fakeFcm();
    fcm.send.mockImplementation(async (message) => {
      if (message.token === 'a') return undefined;
      return { outcome: 'sent' };
    });
    const summary = await runStreakReminders({ db, fcm, now: () => NOW });
    expect(summary.aborted).toBe('fatal');
    expect(released(deletes)).toEqual(['u1']);
  });
});
