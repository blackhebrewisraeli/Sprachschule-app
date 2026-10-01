// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  parseServiceAccount,
  signAssertion,
  classifyFcmError,
  createFcmClient,
  FcmAuthError,
} from './fcm.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const SA = {
  projectId: 'sprachschule-test',
  clientEmail: 'push-sender@sprachschule-test.iam.gserviceaccount.com',
  privateKey,
};
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const json = (body, status = 200, headers = {}) =>
  new Response(body === null ? 'not json' : JSON.stringify(body), { status, headers });

// FCM's error envelope: google.rpc.Status with an FcmError detail.
function fcmError(status, rpcStatus, errorCode, message = 'error', extraDetails = []) {
  const details = errorCode
    ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }]
    : [];
  return {
    error: { code: status, message, status: rpcStatus, details: [...details, ...extraDetails] },
  };
}

// Token endpoint always answers; FCM answers from `responses`, then 200s.
function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (url === TOKEN_URL) {
      return json({
        access_token: `at-${calls.filter((c) => c.url === TOKEN_URL).length}`,
        expires_in: 3600,
      });
    }
    const next = queue.shift() ?? json({ name: 'projects/sprachschule-test/messages/1' });
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl, calls, tokenCalls: () => calls.filter((c) => c.url === TOKEN_URL).length };
}

describe('parseServiceAccount', () => {
  it('reads the three fields it needs from the downloaded key file', () => {
    const raw = JSON.stringify({
      type: 'service_account',
      project_id: 'p',
      private_key_id: 'ignored',
      private_key: 'k',
      client_email: 'e@p.iam.gserviceaccount.com',
    });
    expect(parseServiceAccount(raw)).toEqual({
      projectId: 'p',
      clientEmail: 'e@p.iam.gserviceaccount.com',
      privateKey: 'k',
    });
  });

  it.each([[undefined], [''], ['{not json'], [JSON.stringify({ project_id: 'p' })]])(
    'reads %j as not configured',
    (raw) => {
      expect(parseServiceAccount(raw)).toBeNull();
    }
  );
});

describe('signAssertion', () => {
  it('signs an RS256 JWT Google can verify, scoped to FCM only', () => {
    const jwt = signAssertion(SA, 1790000000);
    const [header, claims, signature] = jwt.split('.');
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: SA.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URL,
      iat: 1790000000,
      exp: 1790003600,
    });
    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(verified).toBe(true);
  });
});

describe('access token', () => {
  it('exchanges a jwt-bearer grant and reuses the token until a minute before expiry', async () => {
    let clock = 1790000000000;
    const { fetchImpl, calls, tokenCalls } = fakeFetch();
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, now: () => clock });
    await fcm.send({ token: 't1' });
    await fcm.send({ token: 't2' });
    expect(tokenCalls()).toBe(1);
    const grant = new URLSearchParams(calls[0].init.body);
    expect(grant.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(grant.get('assertion').split('.')).toHaveLength(3);

    clock += 3600000 - 59000; // inside the one-minute margin
    await fcm.send({ token: 't3' });
    expect(tokenCalls()).toBe(2);
  });

  it('reports a refused exchange as FcmAuthError', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    await expect(fcm.accessToken()).rejects.toBeInstanceOf(FcmAuthError);
  });

  // Google's token endpoint answers with a short enumerated `error` (RFC 6749
  // §5.2). Naming it is what tells an owner the key is revoked or the clock is
  // off, without a human having to guess from "HTTP 400".
  it('names Google’s enumerated error when the exchange is refused', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    const error = await fcm.accessToken().catch((e) => e);
    expect(error).toBeInstanceOf(FcmAuthError);
    expect(error.message).toBe('token exchange refused (HTTP 400, invalid_grant)');
  });

  it.each([
    ['free text', { error: 'Bearer ya29.leaky-token was refused' }],
    ['an upper-case value', { error: 'INVALID_GRANT' }],
    ['an object', { error: { message: 'detail', status: 'X' } }],
    ['a very long value', { error: 'a'.repeat(500) }],
    ['no error field', { error_description: 'Invalid JWT Signature.' }],
    ['a non-JSON body', null],
  ])('never echoes %s from a refused exchange', async (_label, body) => {
    const fetchImpl = vi.fn(async () => json(body, 400));
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    const error = await fcm.accessToken().catch((e) => e);
    expect(error.message).toBe('token exchange refused (HTTP 400)');
  });

  it('reports an unreachable token endpoint as FcmAuthError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    await expect(fcm.accessToken()).rejects.toBeInstanceOf(FcmAuthError);
  });

  it('reports an unusable private key as FcmAuthError, without sending anything', async () => {
    const fetchImpl = vi.fn();
    const fcm = createFcmClient({
      serviceAccount: { ...SA, privateKey: 'k' },
      fetchImpl,
    });
    const error = await fcm.accessToken().catch((e) => e);
    expect(error).toBeInstanceOf(FcmAuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(error.message).not.toContain('k');
  });

  it('reports a null token response as FcmAuthError', async () => {
    const fetchImpl = vi.fn(async () => new Response('null', { status: 200 }));
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    await expect(fcm.accessToken()).rejects.toBeInstanceOf(FcmAuthError);
  });

  it('send() rethrows FcmAuthError instead of reporting an outcome', async () => {
    const fcm = createFcmClient({
      serviceAccount: { ...SA, privateKey: 'k' },
      fetchImpl: vi.fn(),
    });
    await expect(fcm.send({ token: 't' })).rejects.toBeInstanceOf(FcmAuthError);
  });
});

describe('send', () => {
  it('posts { message } to the project endpoint with the bearer token', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    expect(await fcm.send({ token: 't1' })).toEqual({ outcome: 'sent' });
    const call = calls.find((c) => c.url !== TOKEN_URL);
    expect(call.url).toBe('https://fcm.googleapis.com/v1/projects/sprachschule-test/messages:send');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers.authorization).toBe('Bearer at-1');
    expect(JSON.parse(call.init.body)).toEqual({ message: { token: 't1' } });
  });

  it('retries a transient failure once, honouring Retry-After', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([
      json(fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'), 503, { 'retry-after': '2' }),
    ]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    expect((await fcm.send({ token: 't' })).outcome).toBe('sent');
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('caps the retry wait at five seconds', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([
      json(fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'), 503, { 'retry-after': '120' }),
    ]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    await fcm.send({ token: 't' });
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('gives up after one retry', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([
      json(fcmError(500, 'INTERNAL', 'INTERNAL'), 500),
      json(fcmError(500, 'INTERNAL', 'INTERNAL'), 500),
    ]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    expect((await fcm.send({ token: 't' })).outcome).toBe('retry');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('treats a network failure or timeout as retryable, never as a throw', async () => {
    const { fetchImpl } = fakeFetch([
      new TypeError('socket hang up'),
      new DOMException('timed out', 'TimeoutError'),
    ]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep: async () => {} });
    expect(await fcm.send({ token: 't' })).toMatchObject({ outcome: 'retry', code: 'NETWORK' });
  });

  it('does not retry quota: FCM asks for at least a minute', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([
      json(fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'), 429),
    ]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    expect((await fcm.send({ token: 't' })).outcome).toBe('quota');
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('classifyFcmError', () => {
  const tokenViolation = [
    {
      '@type': 'type.googleapis.com/google.rpc.BadRequest',
      fieldViolations: [{ field: 'message.token' }],
    },
  ];
  it.each([
    ['UNREGISTERED', 404, fcmError(404, 'NOT_FOUND', 'UNREGISTERED'), 'dead'],
    [
      'an invalid token (message)',
      400,
      fcmError(
        400,
        'INVALID_ARGUMENT',
        'INVALID_ARGUMENT',
        'The registration token is not a valid FCM registration token'
      ),
      'dead',
    ],
    [
      'an invalid token (field)',
      400,
      fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value', tokenViolation),
      'dead',
    ],
    [
      'an invalid payload',
      400,
      fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at message.android.ttl'),
      'fatal',
    ],
    ['SENDER_ID_MISMATCH', 403, fcmError(403, 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH'), 'config'],
    [
      'THIRD_PARTY_AUTH_ERROR',
      401,
      fcmError(401, 'UNAUTHENTICATED', 'THIRD_PARTY_AUTH_ERROR'),
      'config',
    ],
    ['our refused credentials', 401, fcmError(401, 'UNAUTHENTICATED', null), 'fatal'],
    ['a missing IAM role', 403, fcmError(403, 'PERMISSION_DENIED', null), 'fatal'],
    ['a wrong project id', 404, fcmError(404, 'NOT_FOUND', null), 'fatal'],
    ['QUOTA_EXCEEDED', 429, fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'), 'quota'],
    ['UNAVAILABLE', 503, fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'), 'retry'],
    ['INTERNAL', 500, fcmError(500, 'INTERNAL', 'INTERNAL'), 'retry'],
    ['an unparseable 502', 502, null, 'retry'],
  ])('classifies %s (HTTP %i)', (_label, status, body, outcome) => {
    expect(classifyFcmError(status, body).outcome).toBe(outcome);
  });
});
