import { serviceClient } from './supabase.js';
import { MemoryStore } from './ratelimit.js';
import { DAILY_LIMITS, DAILY_POOLS } from '../../src/lib/accessPolicy.js';

// Billable product quota (spec §6.2) — distinct from the burst limiter.
// off: identity + clamp only. shadow: count, never deny. enforce: deny.
// On ANY quota-store failure every caller is a guest counted in this
// instance's memory: bounded spend, AI stays up (spec §6.8).
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_UNITS = 10; // the consume_ai_quota RPC rejects anything outside 1..10

export function quotaMode(env = process.env) {
  const mode = String(env.AI_QUOTA_MODE ?? '').toLowerCase();
  return mode === 'shadow' || mode === 'enforce' ? mode : 'off';
}

const subjectOf = (caller) => (caller.kind === 'user' ? `u:${caller.userId}` : caller.key);
// Never pass identifiers, tokens, prompts, or raw errors in here.
const log = (event, fields = {}) => console.warn(JSON.stringify({ event, ...fields }));

export function createQuota({
  client = serviceClient(),
  env = process.env,
  memory = new MemoryStore(),
  now = Date.now,
} = {}) {
  const mode = quotaMode(env);
  const guestsOff = env.AI_GUEST_ENABLED === 'false';

  async function degraded(caller, meter, units, reason) {
    log('quota_store_degraded', { meter, mode, reason });
    const dayStart = Math.floor(now() / DAY_MS) * DAY_MS;
    let used = 0;
    for (let i = 0; i < units; i += 1) {
      used = await memory.increment(`quota:${meter}:${caller.key}`, dayStart);
    }
    const limit = DAILY_LIMITS[meter]?.guest ?? 0;
    const over = used > limit;
    return {
      allowed: mode !== 'enforce' || !over,
      tier: 'guest',
      limit,
      used,
      reason: over ? 'quota' : null,
      wouldDeny: over,
      degraded: true,
    };
  }

  async function consume({ caller, meter, units }) {
    if (guestsOff && caller.kind !== 'user') {
      log('quota_guest_disabled', { meter, tier: 'guest', mode });
      return {
        allowed: false,
        tier: 'guest',
        limit: 0,
        used: 0,
        reason: 'disabled',
        wouldDeny: true,
        degraded: false,
      };
    }
    if (mode === 'off') {
      return {
        allowed: true,
        tier: caller.kind === 'user' ? 'free' : 'guest',
        limit: null,
        used: null,
        reason: null,
        wouldDeny: false,
        degraded: false,
      };
    }
    const n = Math.min(MAX_UNITS, Math.max(1, Math.trunc(Number(units)) || 1));
    if (caller.degraded || !client) return degraded(caller, meter, n, 'no_store');
    try {
      const { data, error } = await client.rpc('consume_ai_quota', {
        p_subject: subjectOf(caller),
        p_user: caller.kind === 'user' ? caller.userId : null,
        p_meter: meter,
        p_units: n,
        p_limits: DAILY_LIMITS[meter],
        p_pool_limits: DAILY_POOLS[meter],
        p_enforce: mode === 'enforce',
      });
      if (error || !data || typeof data !== 'object' || typeof data.allowed !== 'boolean') {
        return degraded(caller, meter, n, 'rpc_error');
      }
      if (data.wouldDeny)
        log(mode === 'enforce' ? 'quota_denied' : 'quota_would_deny', {
          meter,
          tier: data.tier,
          mode,
          reason: data.reason ?? 'quota',
        });
      return {
        ...data,
        allowed: mode === 'shadow' ? true : data.allowed,
        wouldDeny: Boolean(data.wouldDeny),
        degraded: false,
      };
    } catch {
      return degraded(caller, meter, n, 'rpc_threw');
    }
  }

  async function refund({ caller, meter, units, tier }) {
    if (mode === 'off' || !client || caller.degraded || !(units >= 1)) return;
    try {
      const { error } = await client.rpc('refund_ai_quota', {
        p_subject: subjectOf(caller),
        p_meter: meter,
        p_units: Math.min(MAX_UNITS, Math.trunc(units)),
        p_tier: tier,
      });
      if (error) log('quota_refund_failed', { meter, tier, mode, reason: 'rpc_error' });
    } catch {
      log('quota_refund_failed', { meter, tier, mode, reason: 'rpc_threw' });
    }
  }

  async function recordCost({ meter, model, tier, usage }) {
    if (mode === 'off' || !client) return;
    try {
      const { error } = await client.rpc('record_ai_cost', {
        p_meter: meter,
        p_model: model,
        p_tier: tier,
        p_input: usage?.input_tokens ?? 0,
        p_output: usage?.output_tokens ?? 0,
      });
      if (error) log('quota_cost_failed', { meter, tier, mode, reason: 'rpc_error' });
    } catch {
      log('quota_cost_failed', { meter, tier, mode, reason: 'rpc_threw' });
    }
  }

  return { mode, consume, refund, recordCost };
}
