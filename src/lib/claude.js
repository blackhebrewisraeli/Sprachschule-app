// Claude API client. Every environment calls our versioned serverless API —
// the key never exists in the browser. Locally, `npm run dev:full`
// (vercel dev) serves the same functions that run in production;
// plain `npm run dev` has no /api routes, so AI features fail politely.
// Contract: docs/api/ai.md.
//
// Model + token budget come from routeAiRequest. A missing routingContext
// is treated as guest chat so today's callers keep the cheap Haiku baseline.
// preferredModel on that context is an optional learner override; auto/junk
// leave the automatic pick. The POST still sends a catalog model id — never
// a vendor key.
//
// A signed-in learner's calls carry their session token so the server can
// identify them; a guest's carry none (spec §6.3, authedFetch optional mode).

import { routeAiRequest } from './ai-routing/router.js';
import { authedFetch } from './authedFetch.js';

const ENDPOINTS = {
  chat: '/api/v1/ai/chat',
  grade: '/api/v1/ai/grade',
  deck: '/api/v1/ai/deck',
};

const DEFAULT_ROUTING_CONTEXT = { taskType: 'chat' };

function routingContextFor(routingContext) {
  if (!routingContext || typeof routingContext !== 'object' || Array.isArray(routingContext)) {
    return DEFAULT_ROUTING_CONTEXT;
  }
  return { ...DEFAULT_ROUTING_CONTEXT, ...routingContext };
}

// The daily product allowance is spent (HTTP 429, code quota_exhausted). Not a
// failure to retry: callers show the learner when it resets. A burst 429
// (rate_limited) stays a plain Error.
export class QuotaExhaustedError extends Error {
  constructor(detail) {
    super(detail.message || 'Daily AI limit reached.');
    this.name = 'QuotaExhaustedError';
    Object.assign(this, {
      meter: detail.meter,
      tier: detail.tier,
      limit: detail.limit,
      used: detail.used,
      resetsAt: detail.resetsAt,
      rewardedEligible: !!detail.rewardedEligible,
    });
  }
}

export const callClaude = async (
  systemPrompt,
  userMessage,
  conversationHistory = [],
  { endpoint = 'chat', routingContext, level, vocab, onQuota } = {}
) => {
  const messages = [...conversationHistory, { role: 'user', content: userMessage }];
  const { model, maxTokens } = routeAiRequest(routingContextFor(routingContext));

  const body = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  };
  // Chat extras are validated/clamped server-side and never forwarded to
  // Anthropic as fields — only folded into the system prompt. Grade/deck
  // omit them so a leaked allowlist cannot hitch a ride on those quotas.
  if (endpoint === 'chat') {
    if (level != null) body.level = level;
    if (Array.isArray(vocab)) body.vocab = vocab;
  }

  const response = await authedFetch(
    ENDPOINTS[endpoint],
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { optional: true }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData?.error?.code === 'quota_exhausted') {
      throw new QuotaExhaustedError(errorData.error);
    }
    const detail = errorData?.error?.message || JSON.stringify(errorData);
    console.error('Claude API error:', response.status, detail);
    throw new Error(`API call failed (${response.status}): ${detail}`);
  }

  // Optional chaining: the headers exist only when metering is on, and a few
  // callers' fetch doubles carry none.
  const limit = response.headers?.get('X-Quota-Limit');
  if (limit != null && typeof onQuota === 'function') {
    onQuota({
      limit: Number(limit),
      used: Number(response.headers.get('X-Quota-Used')),
      resetsAt: response.headers.get('X-Quota-Reset'),
      tier: response.headers.get('X-Quota-Tier'),
    });
  }

  const data = await response.json();
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
};
