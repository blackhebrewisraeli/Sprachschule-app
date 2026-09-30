import { timingSafeEqual } from 'node:crypto';
import { sendError } from '../../_lib/respond.js';
import { serviceClient } from '../../_lib/supabase.js';
import { createFcmClient, parseServiceAccount, FcmAuthError } from '../../_lib/fcm.js';
import { runStreakReminders } from '../../_lib/streakReminder.js';

// The daily streak reminder, one tick per hour.
// docs/superpowers/specs/2026-10-01-push-sender-design.md
//
// Called by Supabase pg_cron + pg_net (POST), because Vercel Hobby crons run at
// most once a day. GET is accepted too, so a Vercel Cron entry can drive it
// unchanged if the plan is ever upgraded. Setup: docs/MOBILE_PUSH_SETUP.md §6.
//
// PUSH_CRON_SECRET, not CRON_SECRET: a copy of this one lives in Supabase
// Vault, and a leak there must not also open league settlement.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretMatches(header, secret) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Kept across warm invocations, so the OAuth token is reused. Rebuilt when the
// env value changes (a new deployment always starts cold anyway).
let fcmClient = null;
let fcmClientSource;
function fcmFor(raw) {
  if (raw !== fcmClientSource) {
    const serviceAccount = parseServiceAccount(raw);
    fcmClient = serviceAccount ? createFcmClient({ serviceAccount }) : null;
    fcmClientSource = raw;
  }
  return fcmClient;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 'method_not_allowed', 'Method not allowed');
  }

  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || !secretMatches(req.headers?.authorization ?? '', secret)) {
    return sendError(res, 'unauthorized', 'Invalid cron secret.');
  }

  const dryRun = req.query?.dryRun === '1';
  const only = req.query?.only ?? null;
  if (only !== null && !UUID.test(only)) {
    return sendError(res, 'bad_request', 'only must be a user id.');
  }

  const db = serviceClient();
  if (!db) return sendError(res, 'server_error', 'Server is not configured.');

  const fcm = dryRun ? null : fcmFor(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!dryRun && !fcm) return sendError(res, 'server_error', 'Push sender is not configured.');

  const started = Date.now();
  try {
    const summary = await runStreakReminders({ db, fcm, dryRun, onlyUserId: only });
    // Counts only: never tokens, user ids or secrets.
    console.log(
      JSON.stringify({ event: 'streak_reminder_run', ...summary, ms: Date.now() - started })
    );
    return res.status(summary.aborted === 'fatal' ? 502 : 200).json(summary);
  } catch (error) {
    const auth = error instanceof FcmAuthError;
    console.error(
      JSON.stringify({
        event: 'streak_reminder_run',
        error: auth ? 'fcm_auth' : 'run_failed',
        message: error?.message,
      })
    );
    return sendError(res, auth ? 'upstream_error' : 'server_error', 'Streak reminder run failed.');
  }
}
