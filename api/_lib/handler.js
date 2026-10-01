import { sendError } from './respond.js';
import { originAllowed } from './origin.js';
import { validateAiBody } from './validate.js';
import { createRateLimiter, defaultStore } from './ratelimit.js';
import { forwardToProvider, isAnyProviderConfigured } from './forward.js';
import { resolveCaller } from './aiCaller.js';
import { clampModel } from '../../src/lib/accessPolicy.js';

// One factory builds every AI endpoint: same chain, per-endpoint quotas.
// Rate limiting runs before validation on purpose — malformed requests
// still consume quota, so garbage cannot be free.
//
// The caller is resolved BEFORE the limiter (unlike the account lane's IP
// limit, which runs before requireAuth) because a signed-in caller's limit is
// keyed on the account: a classroom behind one NAT shares one IP (spec §6.2).
// A token GoTrue rejects ends here with a 401 and never reaches upstream.
export function createAiHandler({ name, rate, afterValidate }) {
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

    // The tier ceiling, enforced here and not only in the client router (spec
    // §6.4). No entitlement lookup exists yet, so a signed-in caller is Free.
    const tier = caller.kind === 'user' ? 'free' : 'guest';
    const model = clampModel(safeBody.model, tier);
    if (model !== safeBody.model) {
      console.warn(
        JSON.stringify({ event: 'model_clamped', from: safeBody.model, to: model, tier })
      );
      safeBody = { ...safeBody, model };
    }

    try {
      const { status, data } = await forwardToProvider(safeBody);
      return res.status(status).json(data);
    } catch (err) {
      console.error('AI lane upstream failure:', err.message);
      return sendError(res, 'upstream_error', 'Upstream request failed');
    }
  };
}
