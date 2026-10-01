import { it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../_lib/supabase.js', () => ({ serviceClient: vi.fn() }));
vi.mock('../../_lib/streakReminder.js', () => ({ runStreakReminders: vi.fn() }));

import handler from './streak-reminder.js';
import { serviceClient } from '../../_lib/supabase.js';
import { runStreakReminders } from '../../_lib/streakReminder.js';
import { FcmAuthError } from '../../_lib/fcm.js';
import { createRes } from '../../_lib/test-helpers.js';

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'sprachschule-test',
  client_email: 'push-sender@sprachschule-test.iam.gserviceaccount.com',
  private_key: 'unused-by-these-tests',
});
const OWNER = '11111111-1111-4111-8111-111111111111';

const req = ({ method = 'POST', token = 'push-secret', query = {} } = {}) => ({
  method,
  headers: { authorization: `Bearer ${token}` },
  query,
});

// Kept in variables: the run summary goes to console.log, and member access on
// `console` outside warn/error trips no-console.
let logSpy;
let errorSpy;

async function call(options) {
  const res = createRes();
  await handler(req(options), res);
  return res;
}

beforeEach(() => {
  vi.stubEnv('PUSH_CRON_SECRET', 'push-secret');
  vi.stubEnv('CRON_SECRET', 'league-secret');
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', SERVICE_ACCOUNT);
  serviceClient.mockReturnValue({});
  runStreakReminders.mockResolvedValue({ dryRun: false, due: 1, sent: 1, aborted: null });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it('rejects a method no scheduler uses (405)', async () => {
  expect((await call({ method: 'DELETE' })).statusCode).toBe(405);
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('rejects a wrong secret (401) before touching the database', async () => {
  expect((await call({ token: 'nope' })).statusCode).toBe(401);
  expect(serviceClient).not.toHaveBeenCalled();
});

// Same length as 'push-secret': only the constant-time compare can reject it.
it('rejects a wrong secret of the right length (401)', async () => {
  expect((await call({ token: 'push-secreT' })).statusCode).toBe(401);
  expect(serviceClient).not.toHaveBeenCalled();
});

it('rejects a request with no authorization header (401)', async () => {
  const res = createRes();
  await handler({ method: 'POST', headers: {}, query: {} }, res);
  expect(res.statusCode).toBe(401);
  expect(serviceClient).not.toHaveBeenCalled();
});

// The push secret also lives in Supabase Vault; the league settle secret must
// not open this endpoint, and this one must not be the league's.
it('does not accept the league CRON_SECRET', async () => {
  expect((await call({ token: 'league-secret' })).statusCode).toBe(401);
});

it('fails closed when PUSH_CRON_SECRET is unset', async () => {
  vi.stubEnv('PUSH_CRON_SECRET', '');
  expect((await call({ token: '' })).statusCode).toBe(401);
});

it.each(['POST', 'GET'])('runs on %s (pg_net posts; GET for manual runs)', async (method) => {
  const res = await call({ method });
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ dryRun: false, due: 1, sent: 1, aborted: null });
  expect(runStreakReminders).toHaveBeenCalledWith(
    expect.objectContaining({
      dryRun: false,
      onlyUserId: null,
      fcm: expect.objectContaining({
        send: expect.any(Function),
        accessToken: expect.any(Function),
      }),
    })
  );
});

it('dry run needs no Firebase credentials', async () => {
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
  runStreakReminders.mockResolvedValue({ dryRun: true, due: 0 });
  const res = await call({ query: { dryRun: '1' } });
  expect(res.statusCode).toBe(200);
  expect(runStreakReminders).toHaveBeenCalledWith(
    expect.objectContaining({ dryRun: true, fcm: null })
  );
});

it('refuses a real run without Firebase credentials, and claims nobody', async () => {
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '{"project_id":"only"}');
  const res = await call();
  expect(res.statusCode).toBe(500);
  expect(res.body.error.message).toBe('Push sender is not configured.');
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('answers 500 when the database lane is not configured', async () => {
  serviceClient.mockReturnValue(null);
  expect((await call()).statusCode).toBe(500);
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('accepts only a user id for ?only', async () => {
  expect((await call({ query: { only: 'someone' } })).statusCode).toBe(400);
  expect(runStreakReminders).not.toHaveBeenCalled();
  await call({ query: { only: OWNER } });
  expect(runStreakReminders).toHaveBeenCalledWith(expect.objectContaining({ onlyUserId: OWNER }));
});

it('answers 502 when the run was stopped by a fatal FCM error', async () => {
  runStreakReminders.mockResolvedValue({ dryRun: false, sent: 0, aborted: 'fatal' });
  const res = await call();
  expect(res.statusCode).toBe(502);
  expect(res.body.aborted).toBe('fatal');
});

it('answers 502 when Google refuses the service account', async () => {
  runStreakReminders.mockRejectedValue(new FcmAuthError('token exchange refused (HTTP 400)'));
  expect((await call()).statusCode).toBe(502);
});

it('answers 500 when the run itself fails', async () => {
  runStreakReminders.mockRejectedValue({ message: 'function does not exist' });
  expect((await call()).statusCode).toBe(500);
});

it('logs one structured summary line per run, and no token or secret', async () => {
  await call();
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(errorSpy).not.toHaveBeenCalled();
  const line = logSpy.mock.calls[0][0];
  expect(JSON.parse(line)).toMatchObject({ event: 'streak_reminder_run', sent: 1 });
  expect(line).not.toContain('push-secret');
});

it('logs a run stopped by a fatal FCM error as an error, with its codes', async () => {
  runStreakReminders.mockResolvedValue({
    dryRun: false,
    sent: 0,
    aborted: 'fatal',
    codes: { PERMISSION_DENIED: 1 },
  });
  await call();
  expect(logSpy).not.toHaveBeenCalled();
  expect(errorSpy).toHaveBeenCalledTimes(1);
  expect(JSON.parse(errorSpy.mock.calls[0][0])).toMatchObject({
    event: 'streak_reminder_run',
    aborted: 'fatal',
    codes: { PERMISSION_DENIED: 1 },
  });
});

// A dry run is the safe mode, so only an exact '1' may select it, and a typo
// must never fall through to a real send.
it.each([
  ['absent', undefined, false],
  ['1', '1', true],
])('dryRun %s selects dryRun=%s', async (_label, value, dryRun) => {
  await call({ query: value === undefined ? {} : { dryRun: value } });
  expect(runStreakReminders).toHaveBeenCalledWith(expect.objectContaining({ dryRun }));
});

it.each([
  ['true', 'true'],
  ['0', '0'],
  ['empty', ''],
  ['a repeated parameter', ['1', '1']],
])('rejects dryRun=%s (400) before touching the database', async (_label, value) => {
  const res = await call({ query: { dryRun: value } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error.message).toBe('dryRun must be 1.');
  expect(serviceClient).not.toHaveBeenCalled();
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('checks the secret before the dryRun value', async () => {
  expect((await call({ token: 'nope', query: { dryRun: 'true' } })).statusCode).toBe(401);
});
