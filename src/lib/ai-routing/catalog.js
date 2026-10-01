// Policy data for the AI router. Tune scores here; router.js only ranks
// what this file lists. Model ids are the routing contract: callClaude
// sends them, and api/_lib/validate.js allows the same set.
//
// Haiku's id is the production pin and the default when callClaude is
// invoked without a routingContext. Sonnet and Opus are family ids.
//
// Ids follow Anthropic's deprecation table
// (platform.claude.com/docs/en/about-claude/model-deprecations): a retired id
// fails every request. Moved 2026-10-01 off claude-opus-4-1 (retired
// 2026-08-05) and claude-sonnet-4-5 (retires 2026-11-30).
//
// `params` are Anthropic request fields the SERVER adds for that model
// (api/_lib/forward.js); the client cannot send them. Both 5.5 models think by
// default, and thinking counts toward max_tokens, which chat caps at 1000 for a
// short JSON reply. Sonnet 5.5 turns thinking off with `between_tools` (its
// `disabled` is a 400, and it is accepted only at effort high or below — the
// default). Opus 5.5 cannot turn thinking off, so it runs at low effort, which
// skips thinking on simple turns. Measured on the real tutor prompt: valid JSON
// on every turn, no thinking blocks, Sonnet 5.5 about twice as fast as 4.5.

export const COMPLEXITY_BUMP_AT = 0.7;
export const MAX_CAPABILITY = 3;
export const DEFAULT_TIER = 'guest';

export const MODELS = Object.freeze({
  haiku: Object.freeze({
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    capability: 1,
    cost: 1,
    latencyMs: 400,
    profile: 'fast',
  }),
  sonnet: Object.freeze({
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    capability: 2,
    cost: 2,
    latencyMs: 1200,
    profile: 'balanced',
    params: Object.freeze({ thinking: Object.freeze({ type: 'between_tools' }) }),
  }),
  opus: Object.freeze({
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    capability: 3,
    cost: 3,
    latencyMs: 2800,
    profile: 'capable',
    params: Object.freeze({ output_config: Object.freeze({ effort: 'low' }) }),
  }),
});

export const TASKS = Object.freeze({
  translation_check: Object.freeze({
    minCapability: 1,
    defaultLatencyMs: 800,
    maxTokens: 512,
  }),
  chat: Object.freeze({
    minCapability: 2,
    defaultLatencyMs: 2500,
    maxTokens: 1000,
  }),
  grammar_generation: Object.freeze({
    minCapability: 2,
    defaultLatencyMs: 4000,
    maxTokens: 1024,
  }),
  deck_generation: Object.freeze({
    minCapability: 2,
    defaultLatencyMs: 8000,
    maxTokens: 1024,
  }),
});

export const TIERS = Object.freeze({
  guest: Object.freeze({ maxCost: 1 }),
  free: Object.freeze({ maxCost: 2 }),
  pro: Object.freeze({ maxCost: 3 }),
});
