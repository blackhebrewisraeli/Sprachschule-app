import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

const admin = adminClient();
const LIMITS = { guest: 3, free: 4, premium: 6 };
const POOLS = { guest: 1000, free: 1000 };
const consume = (subject, user, opts = {}) =>
  admin.rpc('consume_ai_quota', {
    p_subject: subject,
    p_user: user,
    p_meter: opts.meter ?? 'chat',
    p_units: opts.units ?? 1,
    p_limits: opts.limits ?? LIMITS,
    p_pool_limits: opts.pools ?? POOLS,
    p_enforce: opts.enforce ?? true,
  });
const ip = () => `ip:test-${Date.now()}-${Math.random()}`;

let free;
let premium;

beforeAll(async () => {
  free = await createSignedInUser('quota-free');
  premium = await createSignedInUser('quota-premium');
  await admin
    .from('entitlements')
    .insert({ user_id: premium.id, source: 'manual', expires_at: null });
});

describe('consume_ai_quota', () => {
  it('counts a guest up to the limit, then denies without counting', async () => {
    const s = ip();
    for (let i = 1; i <= 3; i += 1) {
      const { data } = await consume(s, null);
      expect(data).toMatchObject({ allowed: true, tier: 'guest', used: i, limit: 3 });
    }
    const { data } = await consume(s, null);
    expect(data).toMatchObject({ allowed: false, reason: 'quota', used: 3 });
  });

  it('parallel consumes never overshoot', async () => {
    const s = ip();
    const results = await Promise.all(Array.from({ length: 8 }, () => consume(s, null)));
    expect(results.filter((r) => r.data?.allowed).length).toBe(3);
  });

  it('parallel consumes at limit-1 let exactly one through', async () => {
    const s = ip();
    for (let i = 0; i < 2; i += 1) await consume(s, null);
    const results = await Promise.all(Array.from({ length: 6 }, () => consume(s, null)));
    expect(results.filter((r) => r.data?.allowed).length).toBe(1);
    const { data } = await admin
      .from('ai_usage')
      .select('used')
      .eq('subject', s)
      .eq('meter', 'chat')
      .single();
    expect(data.used).toBe(3);
  });

  it('weights units', async () => {
    const s = ip();
    expect((await consume(s, null, { units: 3 })).data.used).toBe(3);
    expect((await consume(s, null, { units: 1 })).data).toMatchObject({ allowed: false });
  });

  it('shadow mode counts past the limit and flags wouldDeny', async () => {
    const s = ip();
    for (let i = 0; i < 3; i += 1) await consume(s, null, { enforce: false });
    const { data } = await consume(s, null, { enforce: false });
    expect(data).toMatchObject({ allowed: true, used: 4, wouldDeny: true });
  });

  it('resolves free and premium from entitlements', async () => {
    expect((await consume(`u:${free.id}`, free.id)).data.tier).toBe('free');
    expect((await consume(`u:${premium.id}`, premium.id)).data).toMatchObject({
      tier: 'premium',
      limit: 6,
    });
  });

  it('an expired entitlement is free', async () => {
    const u = await createSignedInUser('quota-expired');
    await admin
      .from('entitlements')
      .insert({ user_id: u.id, source: 'manual', expires_at: '2020-01-01T00:00:00Z' });
    expect((await consume(`u:${u.id}`, u.id)).data.tier).toBe('free');
  });

  it("adds today's grants to the free limit", async () => {
    const u = await createSignedInUser('quota-grant');
    const day = new Date().toISOString().slice(0, 10);
    await admin.from('ai_quota_grants').insert({
      user_id: u.id,
      meter: 'chat',
      day,
      units: 5,
      source: 'support',
      source_ref: `t-${u.id}`,
    });
    expect((await consume(`u:${u.id}`, u.id)).data.limit).toBe(9);
  });

  it('ignores grants for another day, meter or user', async () => {
    const u = await createSignedInUser('quota-grant-scope');
    const other = await createSignedInUser('quota-grant-other');
    const today = new Date().toISOString().slice(0, 10);
    const rows = [
      { user_id: u.id, meter: 'chat', day: '2020-01-01' },
      { user_id: u.id, meter: 'deck', day: today },
      { user_id: other.id, meter: 'chat', day: today },
    ].map((r, i) => ({
      ...r,
      units: 5,
      source: 'support',
      source_ref: `scope-${u.id}-${i}`,
    }));
    await admin.from('ai_quota_grants').insert(rows);
    expect((await consume(`u:${u.id}`, u.id)).data.limit).toBe(4);
  });

  it('a pool denial rolls back the subject increment', async () => {
    const s = ip();
    // Pool rows are global to the guest tier; use a meter-local tiny pool by
    // passing a limit below the pool's current value for today.
    const { data: before } = await admin
      .from('ai_usage')
      .select('used')
      .eq('subject', 'pool:guest')
      .eq('meter', 'deck')
      .maybeSingle();
    const poolNow = before?.used ?? 0;
    const { data } = await consume(s, null, {
      meter: 'deck',
      pools: { guest: poolNow, free: 1000 },
    });
    expect(data).toMatchObject({ allowed: false, reason: 'pool' });
    const { data: row } = await admin
      .from('ai_usage')
      .select('used')
      .eq('subject', s)
      .eq('meter', 'deck')
      .maybeSingle();
    expect(row?.used ?? 0).toBe(0);
  });

  it('rejects an unknown meter and silly units', async () => {
    expect((await consume(ip(), null, { meter: 'tts' })).error).not.toBeNull();
    expect((await consume(ip(), null, { units: 0 })).error).not.toBeNull();
    expect((await consume(ip(), null, { units: 11 })).error).not.toBeNull();
  });
});

describe('refund_ai_quota and record_ai_cost', () => {
  it('refunds subject and pool, flooring at zero', async () => {
    const s = ip();
    await consume(s, null);
    await admin.rpc('refund_ai_quota', {
      p_subject: s,
      p_meter: 'chat',
      p_units: 5,
      p_tier: 'guest',
    });
    const { data } = await admin
      .from('ai_usage')
      .select('used')
      .eq('subject', s)
      .eq('meter', 'chat')
      .single();
    expect(data.used).toBe(0);
  });

  it('accumulates daily cost without identifiers', async () => {
    const model = `test-model-${Date.now()}`;
    await admin.rpc('record_ai_cost', {
      p_meter: 'chat',
      p_model: model,
      p_tier: 'free',
      p_input: 100,
      p_output: 10,
    });
    await admin.rpc('record_ai_cost', {
      p_meter: 'chat',
      p_model: model,
      p_tier: 'free',
      p_input: 50,
      p_output: 5,
    });
    const { data } = await admin.from('ai_cost_daily').select('*').eq('model', model).single();
    expect(data).toMatchObject({ calls: 2, input_tokens: 150, output_tokens: 15 });
  });
});

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

describe('purge_ai_usage (bounded retention)', () => {
  const seed = (subject, day, used = 1) =>
    admin.from('ai_usage').insert({ subject, meter: 'chat', day, used });
  const exists = async (subject, day) =>
    (await admin.from('ai_usage').select('subject').eq('subject', subject).eq('day', day)).data
      .length === 1;

  it('deletes a dormant subject that never returns, keeps today and yesterday', async () => {
    const dormantUser = `u:${crypto.randomUUID()}`;
    const dormantIp = ip();
    const live = ip();
    await seed(dormantUser, daysAgo(2));
    await seed(dormantIp, daysAgo(400));
    await seed(live, daysAgo(0));
    await seed(live, daysAgo(1));
    const { data, error } = await admin.rpc('purge_ai_usage');
    expect(error).toBeNull();
    expect(data.usage).toBeGreaterThanOrEqual(2);
    expect(await exists(dormantUser, daysAgo(2))).toBe(false);
    expect(await exists(dormantIp, daysAgo(400))).toBe(false);
    expect(await exists(live, daysAgo(0))).toBe(true);
    expect(await exists(live, daysAgo(1))).toBe(true);
  });

  it('is idempotent and leaves quota consumption atomic afterwards', async () => {
    await admin.rpc('purge_ai_usage');
    const { data } = await admin.rpc('purge_ai_usage');
    expect(data).toEqual({ usage: 0, grants: 0 });
    const s = ip();
    const results = await Promise.all(Array.from({ length: 8 }, () => consume(s, null)));
    expect(results.filter((r) => r.data?.allowed).length).toBe(3);
  });

  it('a sweep racing consumes never loses or overshoots today', async () => {
    const s = ip();
    await seed(s, daysAgo(5));
    const runs = await Promise.all([
      ...Array.from({ length: 6 }, () => consume(s, null)),
      admin.rpc('purge_ai_usage'),
      admin.rpc('purge_ai_usage'),
    ]);
    expect(runs.slice(0, 6).filter((r) => r.data?.allowed).length).toBe(3);
    expect(runs.slice(6).every((r) => r.error === null)).toBe(true);
    expect(await exists(s, daysAgo(5))).toBe(false);
  });

  it('keeps grants for 30 days, then drops them', async () => {
    const u = await createSignedInUser('quota-grant-purge');
    const row = (day, ref) => ({
      user_id: u.id,
      meter: 'chat',
      day,
      units: 1,
      source: 'support',
      source_ref: `purge-${u.id}-${ref}`,
    });
    await admin.from('ai_quota_grants').insert([row(daysAgo(31), 'old'), row(daysAgo(30), 'edge')]);
    await admin.rpc('purge_ai_usage');
    const { data } = await admin.from('ai_quota_grants').select('day').eq('user_id', u.id);
    expect(data.map((g) => g.day)).toEqual([daysAgo(30)]);
  });

  it('is not callable by learners or anon', async () => {
    for (const client of [free.client, anonClient()]) {
      expect((await client.rpc('purge_ai_usage')).error).not.toBeNull();
    }
  });

  it('shadow still records past the limit and enforce still refunds after a sweep', async () => {
    await admin.rpc('purge_ai_usage');
    const shadow = ip();
    for (let i = 0; i < 4; i += 1) await consume(shadow, null, { enforce: false });
    const { data } = await consume(shadow, null, { enforce: false });
    expect(data).toMatchObject({ allowed: true, used: 5, wouldDeny: true });
    const s = ip();
    await consume(s, null);
    await admin.rpc('refund_ai_quota', {
      p_subject: s,
      p_meter: 'chat',
      p_units: 1,
      p_tier: 'guest',
    });
    expect((await consume(s, null)).data.used).toBe(1);
  });
});

describe('client access', () => {
  it('learners cannot execute any quota RPC', async () => {
    for (const client of [free.client, anonClient()]) {
      const { error } = await client.rpc('consume_ai_quota', {
        p_subject: 'x:attack',
        p_user: null,
        p_meter: 'chat',
        p_units: 1,
        p_limits: { guest: 999 },
        p_pool_limits: {},
        p_enforce: false,
      });
      expect(error).not.toBeNull();
    }
  });

  it('a learner reads only their own entitlements and grants, and cannot write them', async () => {
    const { data: own } = await premium.client.from('entitlements').select('user_id');
    expect(own.every((r) => r.user_id === premium.id)).toBe(true);
    const { data: others } = await free.client
      .from('entitlements')
      .select('user_id')
      .eq('user_id', premium.id);
    expect(others).toEqual([]);
    const { error } = await free.client
      .from('entitlements')
      .insert({ user_id: free.id, source: 'manual' });
    expect(error).not.toBeNull();
  });

  it('usage and cost tables are invisible to learners', async () => {
    expect((await free.client.from('ai_usage').select('*')).data ?? []).toEqual([]);
    expect((await free.client.from('ai_cost_daily').select('*')).data ?? []).toEqual([]);
  });

  it('deleting the user cascades entitlements and grants', async () => {
    const u = await createSignedInUser('quota-cascade');
    await admin.from('entitlements').insert({ user_id: u.id, source: 'manual' });
    await admin.from('ai_quota_grants').insert({
      user_id: u.id,
      meter: 'chat',
      day: new Date().toISOString().slice(0, 10),
      units: 1,
      source: 'support',
      source_ref: `cascade-${u.id}`,
    });
    await admin.auth.admin.deleteUser(u.id);
    for (const table of ['entitlements', 'ai_quota_grants']) {
      const { data, error } = await admin.from(table).select('user_id').eq('user_id', u.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });
});
