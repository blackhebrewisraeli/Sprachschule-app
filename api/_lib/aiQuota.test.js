import { describe, it, expect, vi, afterEach } from 'vitest';
import { createQuota, quotaMode } from './aiQuota.js';
import { MemoryStore } from './ratelimit.js';

const guest = { kind: 'guest', key: 'ip:1.1.1.1' };
const user = { kind: 'user', userId: '00000000-0000-4000-8000-000000000001', key: 'user:x' };
const rpcClient = (impl) => ({ rpc: vi.fn(impl) });
const enforce = { AI_QUOTA_MODE: 'enforce' };

afterEach(() => vi.restoreAllMocks());

describe('quotaMode', () => {
  it('defaults to off and accepts only the three values', () => {
    expect(quotaMode({})).toBe('off');
    expect(quotaMode({ AI_QUOTA_MODE: 'off' })).toBe('off');
    expect(quotaMode({ AI_QUOTA_MODE: 'shadow' })).toBe('shadow');
    expect(quotaMode({ AI_QUOTA_MODE: 'ENFORCE' })).toBe('enforce');
    expect(quotaMode({ AI_QUOTA_MODE: 'yes' })).toBe('off');
    expect(quotaMode({ AI_QUOTA_MODE: '' })).toBe('off');
  });
});

describe('createQuota', () => {
  it('off mode never touches the database', async () => {
    const client = rpcClient();
    const q = createQuota({ client, env: {} });
    expect(await q.consume({ caller: user, meter: 'chat', units: 1 })).toMatchObject({
      allowed: true,
      tier: 'free',
      limit: null,
    });
    expect(await q.consume({ caller: guest, meter: 'chat', units: 1 })).toMatchObject({
      allowed: true,
      tier: 'guest',
    });
    await q.refund({ caller: user, meter: 'chat', units: 1, tier: 'free' });
    await q.recordCost({ meter: 'chat', model: 'm', tier: 'free', usage: {} });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('passes subject, user, limits, pools and enforce to the RPC', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: true, tier: 'free', limit: 20, used: 1, reason: null, wouldDeny: false },
      error: null,
    }));
    const q = createQuota({ client, env: enforce });
    await q.consume({ caller: user, meter: 'chat', units: 3 });
    expect(client.rpc).toHaveBeenCalledWith('consume_ai_quota', {
      p_subject: `u:${user.userId}`,
      p_user: user.userId,
      p_meter: 'chat',
      p_units: 3,
      p_limits: { guest: 10, free: 20, premium: 150 },
      p_pool_limits: { guest: 2000, free: 20000 },
      p_enforce: true,
    });
  });

  it('sends guests by key with a null user', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: true, tier: 'guest', limit: 10, used: 1 },
      error: null,
    }));
    await createQuota({ client, env: enforce }).consume({
      caller: guest,
      meter: 'grade',
      units: 1,
    });
    expect(client.rpc.mock.calls[0][1]).toMatchObject({
      p_subject: guest.key,
      p_user: null,
      p_meter: 'grade',
    });
  });

  it('enforce mode honors a denial from the RPC', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: false, tier: 'free', limit: 20, used: 20, reason: 'quota', wouldDeny: true },
      error: null,
    }));
    const r = await createQuota({ client, env: enforce }).consume({
      caller: user,
      meter: 'chat',
      units: 1,
    });
    expect(r).toMatchObject({ allowed: false, tier: 'free', reason: 'quota', degraded: false });
  });

  it('uses the database tier, never one the caller carries', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: true, tier: 'free', limit: 20, used: 1 },
      error: null,
    }));
    const r = await createQuota({ client, env: enforce }).consume({
      caller: { ...user, tier: 'premium' },
      meter: 'chat',
      units: 1,
      tier: 'premium',
    });
    expect(r.tier).toBe('free');
    expect(JSON.stringify(client.rpc.mock.calls[0][1])).not.toContain('"tier"');
  });

  it('shadow mode serves even when the RPC would deny', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: false, tier: 'free', limit: 20, used: 25, wouldDeny: true },
      error: null,
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = createQuota({ client, env: { AI_QUOTA_MODE: 'shadow' } });
    const r = await q.consume({ caller: user, meter: 'chat', units: 1 });
    expect(r).toMatchObject({ allowed: true, wouldDeny: true });
    expect(client.rpc.mock.calls[0][1].p_enforce).toBe(false);
  });

  it('RPC { data: null, error } degrades to the in-memory guest allowance', async () => {
    const client = rpcClient(async () => ({ data: null, error: { message: 'down' } }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = createQuota({ client, env: enforce, memory: new MemoryStore() });
    const results = [];
    for (let i = 0; i < 11; i += 1)
      results.push(await q.consume({ caller: user, meter: 'chat', units: 1 }));
    expect(results.slice(0, 10).every((r) => r.allowed && r.degraded && r.tier === 'guest')).toBe(
      true
    );
    expect(results[10]).toMatchObject({ allowed: false, degraded: true, reason: 'quota' });
  });

  it('a thrown network error degrades the same way', async () => {
    const client = rpcClient(async () => {
      throw new Error('ECONNRESET to db.internal');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = createQuota({ client, env: enforce, memory: new MemoryStore() });
    const r = await q.consume({ caller: guest, meter: 'deck', units: 1 });
    expect(r).toMatchObject({ allowed: true, degraded: true, tier: 'guest', limit: 1 });
    expect(await q.consume({ caller: guest, meter: 'deck', units: 1 })).toMatchObject({
      allowed: false,
      degraded: true,
    });
  });

  it('a malformed RPC payload degrades', async () => {
    const client = rpcClient(async () => ({ data: 'oops', error: null }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await createQuota({ client, env: enforce, memory: new MemoryStore() }).consume({
      caller: user,
      meter: 'chat',
      units: 1,
    });
    expect(r).toMatchObject({ degraded: true, tier: 'guest' });
  });

  it('a missing client degrades instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = createQuota({ client: null, env: enforce, memory: new MemoryStore() });
    expect(await q.consume({ caller: user, meter: 'chat', units: 1 })).toMatchObject({
      allowed: true,
      degraded: true,
    });
  });

  it('degraded shadow mode never denies', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = createQuota({
      client: null,
      env: { AI_QUOTA_MODE: 'shadow' },
      memory: new MemoryStore(),
    });
    for (let i = 0; i < 12; i += 1) {
      expect((await q.consume({ caller: guest, meter: 'chat', units: 1 })).allowed).toBe(true);
    }
  });

  it('the degraded allowance is bounded per day and counts units', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let t = Date.UTC(2026, 9, 2, 12);
    const q = createQuota({
      client: null,
      env: enforce,
      memory: new MemoryStore(),
      now: () => t,
    });
    expect((await q.consume({ caller: guest, meter: 'chat', units: 4 })).allowed).toBe(true);
    expect((await q.consume({ caller: guest, meter: 'chat', units: 4 })).allowed).toBe(true);
    expect((await q.consume({ caller: guest, meter: 'chat', units: 4 })).allowed).toBe(false);
    t += 24 * 60 * 60 * 1000;
    expect((await q.consume({ caller: guest, meter: 'chat', units: 4 })).allowed).toBe(true);
  });

  it('a degraded caller never reaches the RPC', async () => {
    const client = rpcClient();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const q = createQuota({ client, env: enforce, memory: new MemoryStore() });
    const r = await q.consume({ caller: { ...user, degraded: true }, meter: 'chat', units: 1 });
    expect(r).toMatchObject({ degraded: true, tier: 'guest' });
    await q.refund({ caller: { ...user, degraded: true }, meter: 'chat', units: 1, tier: 'guest' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('AI_GUEST_ENABLED=false denies guests in every mode, never users', async () => {
    for (const mode of ['off', 'shadow', 'enforce']) {
      const client = rpcClient(async () => ({
        data: { allowed: true, tier: 'free', limit: 20, used: 1 },
        error: null,
      }));
      const q = createQuota({ client, env: { AI_QUOTA_MODE: mode, AI_GUEST_ENABLED: 'false' } });
      expect(await q.consume({ caller: guest, meter: 'chat', units: 1 })).toMatchObject({
        allowed: false,
        reason: 'disabled',
        tier: 'guest',
      });
      expect(client.rpc).not.toHaveBeenCalled();
      expect((await q.consume({ caller: user, meter: 'chat', units: 1 })).allowed).toBe(true);
    }
  });

  it('refund and recordCost call the A4 RPCs', async () => {
    const client = rpcClient(async () => ({ data: null, error: null }));
    const q = createQuota({ client, env: enforce });
    await q.refund({ caller: user, meter: 'chat', units: 2, tier: 'free' });
    await q.recordCost({
      meter: 'chat',
      model: 'claude-x',
      tier: 'free',
      usage: { input_tokens: 5, output_tokens: 7 },
    });
    expect(client.rpc).toHaveBeenCalledWith('refund_ai_quota', {
      p_subject: `u:${user.userId}`,
      p_meter: 'chat',
      p_units: 2,
      p_tier: 'free',
    });
    expect(client.rpc).toHaveBeenCalledWith('record_ai_cost', {
      p_meter: 'chat',
      p_model: 'claude-x',
      p_tier: 'free',
      p_input: 5,
      p_output: 7,
    });
  });

  it('refund and recordCost swallow thrown and returned errors', async () => {
    for (const impl of [
      async () => {
        throw new Error('boom');
      },
      async () => ({ data: null, error: { message: 'boom' } }),
    ]) {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const q = createQuota({ client: rpcClient(impl), env: enforce });
      await expect(
        q.refund({ caller: user, meter: 'chat', units: 1, tier: 'free' })
      ).resolves.toBeUndefined();
      await expect(
        q.recordCost({ meter: 'chat', model: 'm', tier: 'free', usage: { input_tokens: 1 } })
      ).resolves.toBeUndefined();
    }
  });

  it('logs only structured non-identifying warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const secret = 'SECRET-DB-ERROR 10.0.0.9';
    const client = rpcClient(async () => {
      throw new Error(secret);
    });
    const q = createQuota({ client, env: enforce, memory: new MemoryStore() });
    await q.consume({ caller: user, meter: 'chat', units: 1 });
    await q.consume({ caller: guest, meter: 'chat', units: 1 });
    await q.refund({ caller: user, meter: 'chat', units: 1, tier: 'free' });
    await q.recordCost({ meter: 'chat', model: 'm', tier: 'free', usage: {} });
    const lines = [...warn.mock.calls, ...error.mock.calls, ...log.mock.calls].map((c) => c[0]);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(typeof line).toBe('string');
      expect(() => JSON.parse(line)).not.toThrow();
      for (const leak of [secret, 'SECRET', user.userId, user.key, '1.1.1.1', '10.0.0.9']) {
        expect(line).not.toContain(leak);
      }
    }
  });
});
