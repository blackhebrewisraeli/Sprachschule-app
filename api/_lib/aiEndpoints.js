import { createAiHandler } from './handler.js';
import { applyChatConstraints } from './chatConstraint.js';

// chatHandler, deckHandler and gradeHandler live in one file — not three
// api/v1/ai/*.js files — because Vercel's Hobby plan caps a deployment at 12
// Serverless Functions and this project was over. Unlike the account and
// progress lanes, all three AI endpoints are POST, so req.method cannot
// discriminate between them; api/v1/ai.js dispatches on req.query.op instead,
// which vercel.json's rewrites inject from the still-documented per-endpoint
// URLs. See that file for the dispatcher and vercel.json for the rewrites.
//
// Each handler keeps its own distinct rate config exactly as before — the
// per-endpoint quotas differ on purpose (deck is far tighter than grade) and
// collapsing them into one shared limiter would be a real regression.

// Anna conversation turns.
export const chatHandler = createAiHandler({
  name: 'ai.chat',
  meter: 'chat',
  rate: { windowMs: 5 * 60 * 1000, max: 20 },
  afterValidate: applyChatConstraints,
});

// Custom deck generation.
export const deckHandler = createAiHandler({
  name: 'ai.deck',
  meter: 'deck',
  rate: { windowMs: 60 * 60 * 1000, max: 5 },
});

// Exercise lane: answer/translation grading and exercise-sentence generation.
export const gradeHandler = createAiHandler({
  name: 'ai.grade',
  meter: 'grade',
  rate: { windowMs: 5 * 60 * 1000, max: 60 },
});
