import { sendError } from './respond.js';
import { originAllowed } from './origin.js';
import { validateAiBody } from './validate.js';
import { createRateLimiter, defaultStore } from './ratelimit.js';
import { forwardToProvider, isAnyProviderConfigured } from './forward.js';
import { resolveCaller } from './aiCaller.js';
import { createQuota } from './aiQuota.js';
import { clampModel, nextUtcReset, unitsFor } from '../../src/lib/accessPolicy.js';

// One factory builds every AI endpoint: same chain, per-endpoint quotas.
// Rate limiting runs before validation on purpose — malformed requests
// still consume quota, so garbage cannot be free.
//
// The caller is resolved BEFORE the limiter (unlike the account lane's IP
// limit, which runs before requireAuth) because a signed-in caller's limit is
// keyed on the account: a classroom behind one NAT shares one IP (spec §6.2).
// A token GoTrue rejects ends here with a 401 and never reaches upstream.
const DENIAL_MESSAGES = {
  quota: 'Daily AI limit reached.',
  pool: 'AI is busy right now — please try again later.',
  disabled: 'AI features are paused for guests right now. Create a free account to keep going.',
};

export function createAiHandler({
  name,
  meter,
  rate,
  afterValidate,
  quota = createQuota(),
  history = null,
}) {
  const checkRate = createRateLimiter({ ...rate, scope: name, store: defaultStore() });

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      return sendError(res, 'method_not_allowed', 'Method not allowed');
    }
    if (!originAllowed(req)) {
      return sendError(res, 'forbidden', 'Origin not allowed');
    }

    if (!isAnyProviderConfigured()) {
      return sendError(res, 'server_error', 'Server is not configured.');
    }

    let caller;
    try {
      caller = await resolveCaller(req);
    } catch (err) {
      return sendError(res, err.code ?? 'unauthorized', err.message ?? 'Unauthorized.');
    }

    const limit = await checkRate(req, caller.key);
    if (!limit.allowed) {
      return sendError(res, 'rate_limited', 'Too many requests — slow down.', {
        'Retry-After': String(limit.retryAfterSec),
      });
    }

    const result = validateAiBody(req.body);
    if (!result.ok) {
      return sendError(res, 'bad_request', result.message);
    }

    let safeBody = result.safeBody;
    if (typeof afterValidate === 'function') {
      const extra = afterValidate(result.safeBody, req.body);
      if (!extra.ok) {
        return sendError(res, 'bad_request', extra.message);
      }
      safeBody = extra.safeBody;
    }

    // Consume first, then clamp by the tier the RPC resolved (spec §6.4, §11):
    // the client's pick is a request, never an entitlement.
    const requested = safeBody.model;
    const units = unitsFor(meter, requested);
    const q = await quota.consume({ caller, meter, units });
    if (!q.allowed) {
      return sendError(
        res,
        'quota_exhausted',
        DENIAL_MESSAGES[q.reason] ?? DENIAL_MESSAGES.quota,
        {},
        {
          meter,
          tier: q.tier,
          limit: q.limit,
          used: q.used,
          resetsAt: nextUtcReset().toISOString(),
          rewardedEligible: meter === 'chat' && q.tier === 'free' && q.reason === 'quota',
        }
      );
    }

    const model = clampModel(requested, q.tier);
    let charged = units;
    if (model !== requested) {
      console.warn(
        JSON.stringify({ event: 'model_clamped', from: requested, to: model, tier: q.tier })
      );
      charged = unitsFor(meter, model);
      if (charged < units) {
        await quota.refund({ caller, meter, units: units - charged, tier: q.tier });
      }
      safeBody = { ...safeBody, model };
    }

    let upstream;
    try {
      upstream = await forwardToProvider(safeBody);
    } catch (err) {
      await quota.refund({ caller, meter, units: charged, tier: q.tier });
      console.error('AI lane upstream failure:', err.message);
      return sendError(res, 'upstream_error', 'Upstream request failed');
    }
    const { status, data } = upstream;
    if (status >= 200 && status < 300) {
      await quota.recordCost({ meter, model, tier: q.tier, usage: data?.usage });
      // Opt-in conversation history: after the reply exists and the cost is
      // recorded, never before. Best-effort and never throws; the header only
      // appears on requests that asked to save (spec 2026-10-02 §7).
      if (history) {
        const saved = await history.persist({ caller, rawBody: req.body, safeBody, data });
        if (saved !== undefined) res.setHeader('X-Conversation-Saved', saved ? '1' : '0');
      }
    } else {
      await quota.refund({ caller, meter, units: charged, tier: q.tier });
    }
    if (q.limit != null) {
      res.setHeader('X-Quota-Limit', String(q.limit));
      res.setHeader('X-Quota-Used', String(Math.max(0, (q.used ?? 0) - (units - charged))));
      res.setHeader('X-Quota-Reset', nextUtcReset().toISOString());
      res.setHeader('X-Quota-Tier', q.tier);
    }
    return res.status(status).json(data);
  };
}
