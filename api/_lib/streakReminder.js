// The daily "streak at risk" reminder: who, what, and what to do with each
// FCM answer. docs/superpowers/specs/2026-10-01-push-sender-design.md §6–§14.
// The endpoint (api/v1/push/streak-reminder.js) only authenticates and calls
// runStreakReminders; everything with a rule in it lives here.
// .js extension required: this file runs under native Node ESM on Vercel.
import { DEFAULT_GOAL } from '../../src/lib/gameConfig.js';

export const REMINDER = {
  startHour: 19, // local time the window opens
  windowHours: 3, // 19:00–21:59; later ticks retry learners a failed tick released
  maxUsersPerRun: 1000,
  // Most learners one claim_streak_reminders call may claim: PostgREST returns
  // at most max_rows (1000) rows and a learner has up to 10 devices. The SQL
  // refuses a larger p_limit; the run pages instead.
  batchSize: 100,
  concurrency: 10,
  deadlineMs: 240000, // maxDuration is 300s; the rest is cleanup
  // The progress lane's pack id (progressHandlers.js defaults packId to it). A
  // data key, like card.de, not a German branch.
  packId: 'de',
};

// No streak number: the server does not re-derive freezes or length (spec §6),
// so the notification can never disagree with the app.
export const COPY = {
  title: 'Keep your streak alive',
  body: 'You haven’t reached today’s goal yet. A few minutes of practice keeps your streak going.',
};

const COLLAPSE = 'streak_reminder';

export function buildReminderMessage({ token, localDay, expiresAt, now }) {
  // After local midnight the reminder is false; never deliver it then.
  const ttlSeconds = Math.max(60, Math.floor((expiresAt - now) / 1000));
  return {
    token,
    notification: { title: COPY.title, body: COPY.body },
    data: { kind: COLLAPSE, dateKey: localDay },
    android: {
      ttl: `${ttlSeconds}s`,
      collapse_key: COLLAPSE,
      notification: { tag: COLLAPSE, default_sound: true },
    },
    apns: {
      headers: {
        'apns-expiration': String(Math.floor(expiresAt / 1000)),
        'apns-collapse-id': COLLAPSE,
      },
      payload: { aps: { sound: 'default' } },
    },
  };
}

// A dead/config result is final for that device. It is final for the learner
// only when every device ended that way; a transient or untried second device
// must keep the learner eligible for the next tick.
const FINAL_WITHOUT_DELIVERY = new Set(['dead', 'config']);
const STOPS_RUN = new Set(['quota', 'fatal']);

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function groupByUser(rows) {
  const users = new Map();
  for (const row of rows) {
    const user = users.get(row.user_id) ?? {
      localDay: row.local_day,
      expiresAt: Date.parse(row.expires_at),
      tokens: [],
    };
    user.tokens.push(row.push_token);
    users.set(row.user_id, user);
  }
  return users;
}

export async function runStreakReminders({
  db,
  fcm,
  dryRun = false,
  onlyUserId = null,
  now = Date.now,
  config = REMINDER,
}) {
  const started = now();
  const summary = {
    dryRun,
    due: 0,
    devices: 0,
    sent: 0,
    dead: 0,
    failed: 0,
    configErrors: 0,
    released: 0,
    devicesWithoutZone: 0,
    aborted: null,
    // Every non-sent outcome by its FCM code (fixed enum strings, never tokens
    // or ids), so a misconfigured first run says why (spec §16).
    codes: {},
  };

  // Credentials before claims: a run that cannot authenticate must leave every
  // learner unclaimed for the next tick.
  if (!dryRun) await fcm.accessToken();

  // Devices the sender can never reach because they report no zone. A rise
  // here means a client stopped sending p_time_zone.
  const zoneless = await db
    .from('user_devices')
    .select('push_token', { count: 'exact', head: true })
    .is('time_zone', null);
  summary.devicesWithoutZone = zoneless.count ?? 0;

  const deadTokens = [];
  const release = [];

  async function claimBatch(limit) {
    const { data, error } = await db.rpc('claim_streak_reminders', {
      p_now: new Date(started).toISOString(),
      p_start_hour: config.startHour,
      p_window_hours: config.windowHours,
      p_default_goal: DEFAULT_GOAL,
      p_pack_id: config.packId,
      p_limit: limit,
      p_only_user: onlyUserId,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    return data ?? [];
  }

  async function sendTo(users) {
    const queue = [...users];
    async function worker() {
      while (queue.length > 0) {
        const [userId, user] = queue.shift();
        const outcomes = [];
        for (const token of user.tokens) {
          // Before every send, not only every learner: one device can take ~25 s
          // (FCM timeout, wait, retry), and a run that outlives maxDuration is
          // killed with its release list and dead-token deletes unwritten.
          if (!summary.aborted && now() - started > config.deadlineMs) summary.aborted = 'deadline';
          if (summary.aborted) break;
          const message = buildReminderMessage({
            token,
            localDay: user.localDay,
            expiresAt: user.expiresAt,
            now: now(),
          });
          const result = await fcm.send(message).catch(() => null);
          const outcome = result?.outcome ?? 'fatal';
          outcomes.push(outcome);
          if (outcome === 'sent') summary.sent += 1;
          else {
            const code = (result?.outcome ? result.code : 'SEND_THREW') ?? outcome;
            summary.codes[code] = (summary.codes[code] ?? 0) + 1;
            if (outcome === 'dead') {
              summary.dead += 1;
              deadTokens.push(token);
            } else if (outcome === 'config') summary.configErrors += 1;
            else summary.failed += 1;
          }
          if (STOPS_RUN.has(outcome)) summary.aborted ??= outcome;
        }
        const delivered = outcomes.includes('sent');
        const everyDeviceFinal =
          outcomes.length === user.tokens.length &&
          outcomes.every((outcome) => FINAL_WITHOUT_DELIVERY.has(outcome));
        if (!delivered && !everyDeviceFinal) {
          release.push({ userId, localDay: user.localDay });
        }
      }
    }
    await Promise.all(Array.from({ length: config.concurrency }, worker));
  }

  // Page through due learners, batchSize at a time. Claims are released only
  // after the whole run, so a later batch can never re-claim a learner this
  // run already failed to reach.
  let failed = false;
  let failure;
  try {
    let budget = config.maxUsersPerRun;
    while (budget > 0 && !summary.aborted) {
      if (now() - started > config.deadlineMs) {
        summary.aborted = 'deadline';
        break;
      }
      const limit = Math.min(config.batchSize, budget);
      const rows = await claimBatch(limit);
      const users = groupByUser(rows);
      summary.due += users.size;
      summary.devices += rows.length;
      budget -= users.size;
      // A dry run claims nothing, so asking again would return the same learners.
      if (dryRun || users.size === 0) break;
      await sendTo(users);
      if (users.size < limit) break; // the last page
    }
  } catch (error) {
    failed = true;
    failure = error;
  }
  // A dry run claims nothing, so it has nothing to release or clean up, but an
  // RPC error must still surface rather than read as "nothing due".
  if (dryRun) {
    if (failed) throw failure;
    return summary;
  }

  // Small chunks: .in() filters travel in the URL. A failed delete is simply
  // retried the next time FCM reports the same token.
  for (const batch of chunks(deadTokens, 20)) {
    await db.from('user_devices').delete().in('push_token', batch);
  }

  const releaseByDay = new Map();
  for (const { userId, localDay } of release) {
    releaseByDay.set(localDay, [...(releaseByDay.get(localDay) ?? []), userId]);
  }
  for (const [localDay, userIds] of releaseByDay) {
    for (const batch of chunks(userIds, 100)) {
      const { error: releaseError } = await db
        .from('push_reminder_claims')
        .delete()
        .eq('local_day', localDay)
        .in('user_id', batch);
      if (!releaseError) summary.released += batch.length;
    }
  }

  if (failed) throw failure;
  return summary;
}
