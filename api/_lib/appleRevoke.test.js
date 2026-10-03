import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';
import {
  readAppleConfig,
  buildClientSecret,
  revokeAppleToken,
  hasAppleIdentity,
} from './appleRevoke.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const ENV = {
  APPLE_SERVICES_ID: 'com.example.signin',
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
  APPLE_PRIVATE_KEY: PEM,
};

describe('readAppleConfig', () => {
  it('reads all four values and a PEM key', () => {
    expect(readAppleConfig(ENV)).toMatchObject({
      servicesId: 'com.example.signin',
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
    });
  });

  it('accepts a key whose newlines were flattened to \\n escapes', () => {
    const flat = { ...ENV, APPLE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') };
    expect(readAppleConfig(flat)).not.toBeNull();
  });

  it.each(['APPLE_SERVICES_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'])(
    'is null without %s',
    (name) => {
      expect(readAppleConfig({ ...ENV, [name]: '' })).toBeNull();
    }
  );

  it('is null for a key that does not parse', () => {
    expect(readAppleConfig({ ...ENV, APPLE_PRIVATE_KEY: 'not a key' })).toBeNull();
  });
});

describe('buildClientSecret', () => {
  const config = readAppleConfig(ENV);
  const jwt = buildClientSecret(config, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());

  it('carries the claims Apple documents', () => {
    expect(json(h)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    expect(json(c)).toEqual({
      iss: 'TEAM123456',
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      aud: 'https://appleid.apple.com',
      sub: 'com.example.signin',
    });
  });

  it('is signed ES256 in raw r||s form, verifiable with the public key', () => {
    const sig = Buffer.from(s, 'base64url');
    expect(sig).toHaveLength(64);
    expect(
      verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig)
    ).toBe(true);
  });
});

describe('revokeAppleToken', () => {
  const config = readAppleConfig(ENV);
  const reply = (status, body = {}) =>
    vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });

  it('posts the token as a refresh_token to Apple with our client credentials', async () => {
    const fetchImpl = reply(200);
    const result = await revokeAppleToken(config, 'r.token', { fetchImpl, now: 1_800_000_000 });
    expect(result).toEqual({ outcome: 'revoked' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const form = new URLSearchParams(init.body);
    expect(form.get('client_id')).toBe('com.example.signin');
    expect(form.get('token')).toBe('r.token');
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_secret').split('.')).toHaveLength(3);
  });

  it('treats invalid_grant as already revoked', async () => {
    const result = await revokeAppleToken(config, 't', {
      fetchImpl: reply(400, { error: 'invalid_grant' }),
    });
    expect(result).toEqual({ outcome: 'revoked' });
  });

  it('reports invalid_client as our configuration problem', async () => {
    const result = await revokeAppleToken(config, 't', {
      fetchImpl: reply(400, { error: 'invalid_client' }),
    });
    expect(result).toEqual({ outcome: 'config', status: 400, error: 'invalid_client' });
  });

  it.each([500, 503, 429])('retries later on a %i', async (status) => {
    expect(await revokeAppleToken(config, 't', { fetchImpl: reply(status) })).toEqual({
      outcome: 'transient',
    });
  });

  it('retries later when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await revokeAppleToken(config, 't', { fetchImpl })).toEqual({ outcome: 'transient' });
  });
});

describe('hasAppleIdentity', () => {
  it('finds Apple in provider, providers or identities', () => {
    expect(hasAppleIdentity({ app_metadata: { provider: 'apple' } })).toBe(true);
    expect(
      hasAppleIdentity({ app_metadata: { provider: 'email', providers: ['email', 'apple'] } })
    ).toBe(true);
    expect(hasAppleIdentity({ identities: [{ provider: 'apple' }] })).toBe(true);
  });

  it('is false for everyone else', () => {
    expect(hasAppleIdentity({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(
      false
    );
    expect(hasAppleIdentity({})).toBe(false);
    expect(hasAppleIdentity(null)).toBe(false);
  });
});
