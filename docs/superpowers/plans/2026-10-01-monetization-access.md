# Monetization, Premium Access, Quotas and Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound what AI can cost per learner and per day on the server, sell an
optional Premium subscription on iOS and Android, and optionally fund the Free
tier with opt-in rewarded ads. Leagues, XP, streaks and the tutor stay as they
are.

**Architecture:**

- **Track A — quotas.** AI calls start carrying the learner's identity. One
  Postgres RPC atomically resolves the tier (from an `entitlements` table),
  consumes a per-UTC-day allowance and a per-tier pool, and returns the tier.
  The server then clamps the model to that tier. A failed upstream call is
  refunded.
- **Track B — payments.** RevenueCat webhooks and a sync endpoint refetch the
  subscriber and upsert `entitlements`.
- **Track C — ads.** A rewarded ad grants extra units only through
  Google-signed SSV callbacks, bound to a single-use nonce.

Track A ships alone, needs no new vendor, and runs on Vercel Hobby. Tracks B and
C each depend only on Track A, and both need Vercel Pro.

**Tech Stack:** Vercel Node functions (ESM, Node 24), supabase-js 2,
PostgreSQL/plpgsql, Vitest 4 + RTL, React 18, Capacitor 8.5 (SPM on iOS),
`@revenuecat/purchases-capacitor` 13.7 (Track B), `@capacitor-community/admob`
8.1 (Track C), and `node:crypto` for SSV.

**Spec:** `docs/superpowers/specs/2026-10-01-monetization-access-design.md`.
Read §6 (enforcement), §7 (purchases), §8 (ads) and §10 (data model) before any
task. Owner decisions **D1–D5** (spec §16) gate the tasks marked
**[GATED: Dn]**.

## Global Constraints

- **Agents never apply migrations.**
  - Never run `supabase db push`, `migration repair`, `db reset` or `db pull`
    against the linked project.
  - Never call MCP `apply_migration`, or `execute_sql` with writes.
  - Never use the SQL editor.
  - Migration files are written and RLS-tested against the **local** stack
    only (`supabase start` + `npm run test:rls`). The owner applies them after
    merge (spec §17 item 2).
- **Vercel function budget.**
  - Track A adds **no** file under `api/` outside `api/_lib/`, so the count stays
    at 12.
  - Tracks B and C each add one function (`api/v1/billing.js`,
    `api/v1/ads.js`) and may only merge **after the owner confirms Vercel Pro is
    active (D5)**.
  - The first of them deletes `api/_lib/functionBudget.test.js`.
- **New npm dependencies (exactly two):**
  - `@revenuecat/purchases-capacitor@^13.7.0` (Task B3);
  - `@capacitor-community/admob@^8.1.0` (Task C4).
  - Install with `npm install --legacy-peer-deps`.
- **Track independence.** Nothing under Track B imports a Track C module, and
  the reverse holds too. Both may import Track A modules.
- **UTC day.** Every allowance resets at 00:00 UTC. Never use a client or
  device time zone for quotas.
- **Starting numbers** (spec §6.1, copied verbatim; they change only through
  `src/lib/accessPolicy.js`):

  | Meter | Guest | Free | Premium |
  | ----- | ----- | ---- | ------- |
  | chat  | 10    | 20   | 150     |
  | grade | 40    | 150  | 300     |
  | deck  | 1     | 3    | 15      |
  - Pools per day: chat `{ guest: 2000, free: 20000 }`, grade
    `{ guest: 5000, free: 40000 }`, deck `{ guest: 200, free: 1000 }`.
  - Chat weights: fast 1, balanced 2, capable 4 (price ratios of Haiku 4.5,
    Sonnet 5.5 and Opus 5.5). Grade and deck cost 1.
  - Rewarded: `+5` chat units, at most `2` grants per user per UTC day.

- **Modes.** `AI_QUOTA_MODE` takes `off` (the default when unset), `shadow` or
  `enforce`. `AI_GUEST_ENABLED=false` is the guest kill switch and works in
  every mode.
- **Storage.**
  - Add only `deutsch-app-entitlement-v1`. Rename or migrate nothing.
  - Entitlement data never enters the synced `deutsch-app-state-v1` blob.
- **Engine rule.** No German strings or `'de'` branches in `src/lib/*` or
  `src/components/*`.
- **`src/` imported by `api/`.** `src/` modules that `api/` imports use explicit
  `.js` extensions.
- **Logging.** Never log user IDs, IPs, tokens, secrets, prompt text or AI
  replies. Structured log lines are
  `console.warn(JSON.stringify({ event, ...nonIdentifyingFields }))`.
- **Secrets.**
  - `RC_SECRET_API_KEY` and `RC_WEBHOOK_AUTH` are Vercel **Production**,
    **Sensitive**, and never `VITE_`.
  - RevenueCat SDK keys and AdMob unit IDs are public by design (`VITE_`).
- **Tests.**
  - Vitest with `globals: false`: import `{ describe, it, expect, vi, … }` from
    `'vitest'`.
  - Co-locate tests.
  - Server tests that use `node:crypto` start with
    `// @vitest-environment node`.
  - RLS tests live in `supabase/tests/rls/` and use `helpers.js`.
- **Verification per task.** `npm test`, `npm run lint` and
  `npm run format:check` pass. Touched Markdown passes `npx prettier --check`.
  Never use `--no-verify`.

## Review Focus

These five failure modes are the most likely to hurt a learner or the budget.
Each is pinned by a named test in its owning task.

1. **Concurrent calls at `limit − 1`:** exactly one succeeds, never two. Owner:
   Task A4, test `parallel consumes never overshoot`.
2. **The upstream fails after quota was consumed:** the units come back, so the
   learner is not charged for our failure. Owner: Task A7, test
   `refunds the units when the provider fails`.
3. **The quota store is down:** a degraded guest allowance applies to everyone,
   instead of unlimited spend or a hard outage. Owner: Task A5, test
   `RPC error degrades to the in-memory guest allowance`.
4. **A refunded or expired store subscription:** the learner loses Premium with
   no human action, while a sandbox purchase still grants it. Owner: Task B1,
   tests `refund ends premium now` and `sandbox still grants`.
5. **A replayed or tampered SSV callback, or a re-used nonce:** never a second
   grant. Owner: Task C1, test `same transaction twice grants once`, and Task C2,
   test `a changed parameter fails verification`.

## Dependency graph

```
A1 ─► A2 ─► A3 ─┐
                ├─► A6 ─► A7 ─► A8 ─► A9 ─► A10
A4 ─► A5 ───────┘                          │
                                           ├─► [D5 Pro] ─► B1 ─► B2 ─► B3 ─► B4 ─► B5
                                           └─► [D4, D5]  ─► C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6
B5 / C6 ─► R1 ─► R2 ─► R3 (release, last)
```

- A4 has no code dependency on A1–A3 and may be written in parallel.
- A5 needs A4's RPC names.
- Track R starts once the tracks it releases are merged.

## File map

| File                                                                                                                                                                | Task(s) | Responsibility                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| `src/lib/accessPolicy.js` (+test)                                                                                                                                   | A1      | Tiers, meters, limits, pools, weights, clamp, UTC reset (pure)  |
| `src/lib/ai-routing/catalog.js`                                                                                                                                     | A1 (D2) | `TIERS.free.maxCost` 2 → 1 only if D2 = (a)                     |
| `src/lib/authedFetch.js` (+test), `src/lib/claude.js` (+test), `docs/api/ai.md`                                                                                     | A2, A8  | Optional bearer on AI calls; typed quota error                  |
| `api/_lib/aiCaller.js` (+test)                                                                                                                                      | A3      | Optional-auth caller resolution                                 |
| `api/_lib/handler.js` (+test), `api/_lib/aiEndpoints.js`                                                                                                            | A3, A7  | AI chain: caller → burst → validate → consume → clamp → forward |
| `supabase/migrations/20261006120000_ai_access_quota.sql`, `supabase/tests/rls/ai-quota.test.js`                                                                     | A4      | Entitlements, usage, grants, cost; three RPCs                   |
| `api/_lib/aiQuota.js` (+test)                                                                                                                                       | A5      | RPC wrapper, modes, degraded fallback                           |
| `api/_lib/respond.js` (+test), `api/_lib/origin.js` (+test)                                                                                                         | A6      | `quota_exhausted` envelope; exposed quota headers               |
| `src/components/chat/QuotaNote.jsx` (+test), `src/components/ChatTab.jsx` (+test)                                                                                   | A8      | Inline exhaustion note                                          |
| `src/components/translate/TypingExercise.jsx` (+test), `src/components/VocabTab.jsx` (+test)                                                                        | A9      | Neutral limit messages                                          |
| `src/lib/accessTier.js`, `src/lib/useEntitlement.js` (+test), `src/lib/ai-routing/preference.js` (+test), `src/App.jsx`                                             | A10     | Server tier on the client; cache key                            |
| `api/_lib/revenuecat.js` (+test), `supabase/migrations/20261013120000_billing_events.sql`, `supabase/tests/rls/billing-events.test.js`                              | B1      | Subscriber fetch and mapping; event table                       |
| `api/_lib/billingEndpoints.js` (+test), `api/v1/billing.js`, `vercel.json`, `api/_lib/functionBudget.test.js` (delete)                                              | B2      | Webhook and sync                                                |
| `src/lib/purchases.js` (+test), `src/lib/clearUserState.js` (+test), `package.json`, lockfile, `.env.example`, native sync output                                   | B3      | RevenueCat SDK                                                  |
| `src/components/premium/PaywallSheet.jsx` (+test), `src/components/settings/PremiumSection.jsx` (+test), `src/components/settings/SettingsRoute.jsx`, `src/App.jsx` | B4      | Paywall, restore, manage                                        |
| `api/_lib/accountEndpoints.js` (+test), `src/components/settings/AccountSection.jsx` (+test)                                                                        | B5      | Deletion with a subscription                                    |
| `supabase/migrations/20261020120000_ad_rewards.sql`, `supabase/tests/rls/ad-rewards.test.js`                                                                        | C1      | Intents, grant RPC                                              |
| `api/_lib/admobSsv.js` (+test)                                                                                                                                      | C2      | ECDSA verification and key cache                                |
| `api/_lib/adsEndpoints.js` (+test), `api/v1/ads.js`, `vercel.json`                                                                                                  | C3      | SSV endpoint                                                    |
| `src/lib/ads.js` (+test), `package.json`, lockfile                                                                                                                  | C4      | Consent, eligibility, rewarded flow                             |
| `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml`, `package.json` (`build:mobile`), `.env.example`, native sync output                           | C5      | Native AdMob config                                             |
| `src/components/chat/QuotaNote.jsx` (+test), `src/components/settings/PrivacyChoicesRow.jsx` (+test), `src/components/settings/SettingsRoute.jsx`                   | C6      | Rewarded entry, Privacy choices                                 |
| `src/components/legal/*`, `src/lib/legalVersions.js`                                                                                                                | R1      | Owner-supplied copy L1–L5                                       |
| `docs/MONETIZATION_SETUP.md`, `docs/STORE_SUBMISSION_CHECKLIST.md`, `docs/BACKLOG.md`                                                                               | R2, R3  | Runbook, disclosures, QA script                                 |

---

# Track A — Server-enforced access and quotas

### Task A1: Access policy module

**Goal:** One pure module holds every number and rule that the server, the client
and the RPC calls share.

**Files:**

- Create: `src/lib/accessPolicy.js`
- Create: `src/lib/accessPolicy.test.js`
- Modify, **only if D2 = (a):** `src/lib/ai-routing/catalog.js` (`TIERS.free`),
  plus the matching assertions in `src/lib/ai-routing/router.test.js` and
  `preference.test.js`

**Interfaces:**

- Consumes: `MODELS`, `TIERS` from `src/lib/ai-routing/catalog.js`.
- Produces (exact names; later tasks import them):

```js
export const ACCESS_TIERS; // ['guest', 'free', 'premium']
export const METERS; // ['chat', 'grade', 'deck']
export const DAILY_LIMITS; // { chat: { guest, free, premium }, grade: {...}, deck: {...} }
export const DAILY_POOLS; // { chat: { guest, free }, grade: {...}, deck: {...} }
export const MODEL_WEIGHT_BY_PROFILE; // { fast: 1, balanced: 2, capable: 4 }
export const REWARDED_AD; // { meter: 'chat', units: 5, dailyCap: 2 }
export function routerTierFor(accessTier); // 'guest' | 'free' | 'pro'
export function unitsFor(meter, modelId); // integer ≥ 1
export function clampModel(modelId, accessTier); // a catalog model id
export function nextUtcReset(now = new Date()); // Date at the next 00:00 UTC
```

- [ ] **Step 1: Write the failing test** (`src/lib/accessPolicy.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { MODELS } from './ai-routing/catalog.js';
import {
  DAILY_LIMITS,
  DAILY_POOLS,
  REWARDED_AD,
  routerTierFor,
  unitsFor,
  clampModel,
  nextUtcReset,
} from './accessPolicy.js';

describe('accessPolicy', () => {
  it('carries the spec §6.1 starting numbers', () => {
    expect(DAILY_LIMITS.chat).toEqual({ guest: 10, free: 20, premium: 150 });
    expect(DAILY_LIMITS.grade).toEqual({ guest: 40, free: 150, premium: 300 });
    expect(DAILY_LIMITS.deck).toEqual({ guest: 1, free: 3, premium: 15 });
    expect(DAILY_POOLS.chat).toEqual({ guest: 2000, free: 20000 });
    expect(REWARDED_AD).toEqual({ meter: 'chat', units: 5, dailyCap: 2 });
  });

  it('maps premium to the router ceiling key pro', () => {
    expect(routerTierFor('premium')).toBe('pro');
    expect(routerTierFor('free')).toBe('free');
    expect(routerTierFor('guest')).toBe('guest');
    expect(routerTierFor('nonsense')).toBe('guest');
  });

  it('weights chat by model profile and charges 1 elsewhere', () => {
    expect(unitsFor('chat', MODELS.haiku.id)).toBe(1);
    expect(unitsFor('chat', MODELS.sonnet.id)).toBe(2);
    expect(unitsFor('chat', MODELS.opus.id)).toBe(4);
    expect(unitsFor('grade', MODELS.sonnet.id)).toBe(1);
    expect(unitsFor('deck', MODELS.opus.id)).toBe(1);
  });

  it('charges an unknown chat model the maximum weight (fail expensive)', () => {
    expect(unitsFor('chat', 'claude-made-up')).toBe(4);
  });

  it('clamps a guest to the cheapest model and keeps an in-tier pick', () => {
    expect(clampModel(MODELS.opus.id, 'guest')).toBe(MODELS.haiku.id);
    expect(clampModel(MODELS.haiku.id, 'guest')).toBe(MODELS.haiku.id);
    expect(clampModel(MODELS.opus.id, 'premium')).toBe(MODELS.opus.id);
  });

  it('clamps to the most capable model within the ceiling', () => {
    // Free's ceiling is whatever TIERS.free.maxCost says (D2) — derive, don't hardcode.
    const freeTop = clampModel(MODELS.opus.id, 'free');
    expect([MODELS.haiku.id, MODELS.sonnet.id]).toContain(freeTop);
  });

  it('resets at the next 00:00 UTC', () => {
    expect(nextUtcReset(new Date('2026-10-01T23:59:59Z')).toISOString()).toBe(
      '2026-10-02T00:00:00.000Z'
    );
    expect(nextUtcReset(new Date('2026-10-02T00:00:00Z')).toISOString()).toBe(
      '2026-10-03T00:00:00.000Z'
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/accessPolicy.test.js`
Expected: FAIL, `Failed to resolve import "./accessPolicy.js"`.

- [ ] **Step 3: Implement** `src/lib/accessPolicy.js`

```js
// Access policy — the single home of the numbers that bound AI spend.
// Pure and I/O-free, shared by api/ (quota enforcement) and the client (UI
// copy). Spec: docs/superpowers/specs/2026-10-01-monetization-access-design.md §6.
// The italic "starting values" in spec §6.1 are replaced HERE, from the
// shadow-week measurements, and nowhere else.
import { MODELS, TIERS } from './ai-routing/catalog.js';

export const ACCESS_TIERS = Object.freeze(['guest', 'free', 'premium']);
export const METERS = Object.freeze(['chat', 'grade', 'deck']);

export const DAILY_LIMITS = Object.freeze({
  chat: Object.freeze({ guest: 10, free: 20, premium: 150 }),
  grade: Object.freeze({ guest: 40, free: 150, premium: 300 }),
  deck: Object.freeze({ guest: 1, free: 3, premium: 15 }),
});

// Tier-wide daily ceilings. Premium has none: it is paid and identified.
export const DAILY_POOLS = Object.freeze({
  chat: Object.freeze({ guest: 2000, free: 20000 }),
  grade: Object.freeze({ guest: 5000, free: 40000 }),
  deck: Object.freeze({ guest: 200, free: 1000 }),
});

// Chat units per turn by the catalog profile — tracks price ratios (spec §4.9).
export const MODEL_WEIGHT_BY_PROFILE = Object.freeze({ fast: 1, balanced: 2, capable: 4 });
const MAX_WEIGHT = Math.max(...Object.values(MODEL_WEIGHT_BY_PROFILE));

export const REWARDED_AD = Object.freeze({ meter: 'chat', units: 5, dailyCap: 2 });

const ROUTER_TIER = Object.freeze({ guest: 'guest', free: 'free', premium: 'pro' });

export function routerTierFor(accessTier) {
  return ROUTER_TIER[accessTier] ?? 'guest';
}

const byId = (id) => Object.values(MODELS).find((m) => m.id === id) ?? null;

export function unitsFor(meter, modelId) {
  if (meter !== 'chat') return 1;
  const model = byId(modelId);
  return model ? (MODEL_WEIGHT_BY_PROFILE[model.profile] ?? MAX_WEIGHT) : MAX_WEIGHT;
}

export function clampModel(modelId, accessTier) {
  const ceiling = (TIERS[routerTierFor(accessTier)] ?? TIERS.guest).maxCost;
  const model = byId(modelId);
  if (model && model.cost <= ceiling) return modelId;
  const eligible = Object.values(MODELS)
    .filter((m) => m.cost <= ceiling)
    .sort((a, b) => b.capability - a.capability);
  return eligible[0].id;
}

export function nextUtcReset(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run src/lib/accessPolicy.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Apply D2, only if the owner chose (a)**

In `src/lib/ai-routing/catalog.js`, change
`free: Object.freeze({ maxCost: 2 })` to `free: Object.freeze({ maxCost: 1 })`.
Run `npx vitest run src/lib/ai-routing`, update each assertion that encoded
"free chat routes to Sonnet" so it expects Haiku, and say so in the commit body.
If D2 = (b), skip this step.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accessPolicy.js src/lib/accessPolicy.test.js
git commit -m "feat(access): shared access policy — limits, pools, weights, model clamp"
```

**Acceptance criteria:**

- The numbers equal Global Constraints.
- `clampModel` never returns a model above the tier ceiling.
- An unknown model is charged the maximum weight.

**Focused tests:** `npx vitest run src/lib/accessPolicy.test.js src/lib/ai-routing`

**Manual verification:** none, because the module is pure.

**Depends on:** D2 (Step 5 only). **Scope:** S, 2 files (+3 if D2 = a).

---

### Task A2: AI calls carry the learner's identity (client)

**Goal:** A signed-in learner's AI calls send their bearer token, and a guest's
send none. A 401 refreshes once. This ships **before** the server clamp (A3) so
signed-in chat is never downgraded (spec §6.3).

**Files:**

- Modify: `src/lib/authedFetch.js`, `src/lib/authedFetch.test.js`
- Modify: `src/lib/claude.js`, `src/lib/claude.test.js`
- Modify: `docs/api/ai.md` ("Request" section: optional `Authorization`)

**Interfaces:**

- Produces: `authedFetch(url, init = {}, { optional = false } = {})`.
  - When `optional` is true and there is no token, it performs a plain fetch
    with no header.
  - When there is a token, it behaves exactly as today: a 401 refreshes once and
    retries once, and a second 401 throws `SESSION_EXPIRED_MESSAGE`.
- `callClaude`'s signature is unchanged.

- [ ] **Step 1: Write the failing tests**

In `authedFetch.test.js`, add:

```js
it('optional mode sends no header when signed out', async () => {
  getAccessToken.mockResolvedValue(null);
  fetch.mockResolvedValue(new Response('{}', { status: 200 }));
  await authedFetch('/api/v1/ai/chat', { method: 'POST' }, { optional: true });
  expect(fetch.mock.calls[0][1].headers?.authorization).toBeUndefined();
});

it('optional mode still refreshes once on 401 when a token exists', async () => {
  getAccessToken.mockResolvedValue('old');
  refreshAccessToken.mockResolvedValue('new');
  fetch
    .mockResolvedValueOnce(new Response('{}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  const res = await authedFetch('/api/v1/ai/chat', {}, { optional: true });
  expect(res.status).toBe(200);
  expect(fetch.mock.calls[1][1].headers.authorization).toBe('Bearer new');
});

it('non-optional mode still throws without a token', async () => {
  getAccessToken.mockResolvedValue(null);
  await expect(authedFetch('/api/v1/account/profile')).rejects.toThrow('Please sign in again.');
});
```

Follow the file's existing mock style for `./auth.js` and global `fetch`.

In `claude.test.js`, add:

```js
it('sends the session token when signed in', async () => {
  // mock ./auth.js getAccessToken → 'tok'; fetch → 200 with a text block
  await callClaude('sys', 'hi');
  expect(fetch.mock.calls[0][1].headers.authorization).toBe('Bearer tok');
});

it('sends no Authorization header as a guest', async () => {
  // getAccessToken → null
  await callClaude('sys', 'hi');
  expect(fetch.mock.calls[0][1].headers.authorization).toBeUndefined();
});
```

- [ ] **Step 2: Run them and confirm they fail.**
      Run: `npx vitest run src/lib/authedFetch.test.js src/lib/claude.test.js`

- [ ] **Step 3: Implement**

`authedFetch.js`:

```js
export async function authedFetch(url, init = {}, { optional = false } = {}) {
  const target = apiUrl(url);
  const token = await getAccessToken();
  if (!token) {
    if (optional) return fetch(target, init);
    throw new Error('Please sign in again.');
  }
  // …unchanged send / refresh-once / retry body…
}
```

`claude.js`: replace the bare `fetch(apiUrl(ENDPOINTS[endpoint]), {...})` with
`authedFetch(ENDPOINTS[endpoint], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { optional: true })`,
and import `authedFetch` from `./authedFetch.js`. `authedFetch` already resolves
`apiUrl`.

`docs/api/ai.md`: under "Request", document the optional
`Authorization: Bearer <supabase access token>` header. Signed-in callers are
identified and keyed by account. Callers without the header are guests keyed by
IP. An invalid token gets `401 unauthorized`.

- [ ] **Step 4: Run and confirm they pass.** Then run the full `npm test`, because
      ChatTab, TypingExercise and VocabTab tests mock `callClaude` or `fetch`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/authedFetch.js src/lib/authedFetch.test.js src/lib/claude.js src/lib/claude.test.js docs/api/ai.md
git commit -m "feat(ai): send the session token on AI calls when signed in"
```

**Acceptance criteria:**

- Signed-in AI calls carry `Authorization`; guest calls carry none.
- There is one refresh-once implementation, not two.

**Focused tests:** the two files above.

**Manual verification:** `npm run dev:full`. Sign in, send a chat turn, and the
DevTools Network request has `authorization: Bearer …`. Sign out, send a turn,
and there is no header. The server ignores the header until A3, so behaviour is
otherwise unchanged.

**Depends on:** none. **Scope:** S, 5 files.

---

### Task A3: The server resolves the caller and clamps the model

**Goal:**

- The AI chain knows guest from user, and keys the burst limiter on the user
  when there is one.
- It clamps the requested model to the tier ceiling (guest / free), which closes
  F1.
- No database tier exists yet. Premium arrives in A7.

**Files:**

- Create: `api/_lib/aiCaller.js`, `api/_lib/aiCaller.test.js`
- Modify: `api/_lib/handler.js`, `api/_lib/handler.test.js`

**Interfaces:**

- Consumes: `clientKey` (`./ratelimit.js`), `serviceClient` (`./supabase.js`),
  `assertSignupAllowed` and `readServerSignupAllowlist`
  (`../../src/lib/signupAllowlist.js`), and `clampModel` (A1).
- Produces:
  `resolveCaller(req, client = serviceClient()) → Promise<{ kind: 'guest' | 'user', key: string, userId?: string, degraded?: boolean }>`.
  It throws `{ code, message }` with code `unauthorized` or
  `signup_not_allowed`.

- [ ] **Step 1: Write the failing test** (`api/_lib/aiCaller.test.js`)

```js
import { describe, it, expect, vi } from 'vitest';
import { resolveCaller } from './aiCaller.js';

const req = (authorization) => ({
  headers: { 'x-forwarded-for': '9.9.9.9', ...(authorization ? { authorization } : {}) },
});
const clientWith = (impl) => ({ auth: { getUser: vi.fn(impl) } });

describe('resolveCaller', () => {
  it('no header → guest keyed by IP', async () => {
    expect(await resolveCaller(req(), clientWith())).toEqual({ kind: 'guest', key: 'ip:9.9.9.9' });
  });

  it('valid token → user keyed by id', async () => {
    const c = clientWith(async () => ({
      data: { user: { id: 'u1', email: 'a@b.c' } },
      error: null,
    }));
    expect(await resolveCaller(req('Bearer t'), c)).toEqual({
      kind: 'user',
      userId: 'u1',
      key: 'user:u1',
    });
  });

  it('rejected token → 401 so the client refreshes', async () => {
    const c = clientWith(async () => ({ data: {}, error: { status: 401, name: 'AuthApiError' } }));
    await expect(resolveCaller(req('Bearer t'), c)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('GoTrue unreachable → degraded guest, not an outage', async () => {
    const c = clientWith(async () => ({
      data: {},
      error: { status: 0, name: 'AuthRetryableFetchError' },
    }));
    expect(await resolveCaller(req('Bearer t'), c)).toEqual({
      kind: 'guest',
      key: 'ip:9.9.9.9',
      degraded: true,
    });
  });

  it('a thrown getUser → degraded guest', async () => {
    const c = clientWith(async () => {
      throw new Error('ECONNRESET');
    });
    expect((await resolveCaller(req('Bearer t'), c)).degraded).toBe(true);
  });

  it('no data lane configured → degraded guest', async () => {
    expect((await resolveCaller(req('Bearer t'), null)).degraded).toBe(true);
  });

  it('malformed header → 401', async () => {
    await expect(resolveCaller(req('Basic x'), clientWith())).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });
});
```

In `handler.test.js`, add `vi.mock('./supabase.js', …)` the way
`auth-middleware.test.js` does, so `getUser` can be controlled, and add:

- `clamps a guest asking for Opus to Haiku`: assert the forwarded body's
  `model` is `claude-haiku-4-5-20251001`.
- `keeps a signed-in caller's in-tier model`: build the expected value with
  `clampModel(sonnetId, 'free')`, so the test holds under both D2 answers.
- `rejects a bad token with 401 before forwarding`: assert `fetch` was not
  called.

- [ ] **Step 2: Run them and confirm they fail.**
      Run: `npx vitest run api/_lib/aiCaller.test.js api/_lib/handler.test.js`

- [ ] **Step 3: Implement**

`api/_lib/aiCaller.js`:

```js
import { clientKey } from './ratelimit.js';
import { serviceClient } from './supabase.js';
import { assertSignupAllowed, readServerSignupAllowlist } from '../../src/lib/signupAllowlist.js';

// Optional identity for the AI lane. Unlike requireAuth, a missing header is a
// GUEST, and an auth OUTAGE degrades to a guest instead of a 401: only a token
// GoTrue actually rejected is the caller's problem (spec §6.3, §6.8).
const isOutage = (error) =>
  error?.name === 'AuthRetryableFetchError' || (error?.status ?? 0) >= 500;

export async function resolveCaller(req, client = serviceClient()) {
  const header = req.headers?.authorization ?? '';
  const guest = { kind: 'guest', key: clientKey(req) };
  if (!header) return guest;
  if (!header.startsWith('Bearer ')) {
    throw { code: 'unauthorized', message: 'Malformed authorization header.' };
  }
  if (!client) return { ...guest, degraded: true };

  let result;
  try {
    result = await client.auth.getUser(header.slice(7));
  } catch {
    return { ...guest, degraded: true };
  }
  const { data, error } = result ?? {};
  if (error) {
    if (isOutage(error)) return { ...guest, degraded: true };
    throw { code: 'unauthorized', message: 'Invalid or expired token.' };
  }
  if (!data?.user?.id) throw { code: 'unauthorized', message: 'Invalid or expired token.' };
  assertSignupAllowed(data.user, readServerSignupAllowlist(process.env));
  return { kind: 'user', userId: data.user.id, key: `user:${data.user.id}` };
}
```

In `handler.js`, add these after the provider-configured check:

```js
let caller;
try {
  caller = await resolveCaller(req);
} catch (err) {
  return sendError(res, err.code ?? 'unauthorized', err.message ?? 'Unauthorized.');
}
const limit = await checkRate(req, caller.key);
```

After `afterValidate`:

```js
const tier = caller.kind === 'user' ? 'free' : 'guest'; // A7 replaces this with the RPC's tier
const model = clampModel(safeBody.model, tier);
if (model !== safeBody.model) {
  console.warn(JSON.stringify({ event: 'model_clamped', from: safeBody.model, to: model, tier }));
  safeBody = { ...safeBody, model };
}
```

- [ ] **Step 4: Run the focused tests and the full `npm test`, and confirm they pass.**

- [ ] **Step 5: Commit**

```bash
git add api/_lib/aiCaller.js api/_lib/aiCaller.test.js api/_lib/handler.js api/_lib/handler.test.js
git commit -m "feat(ai): identify AI callers and clamp the model to the tier on the server"
```

**Acceptance criteria:**

- An anonymous request for Opus or Sonnet is forwarded as Haiku.
- A signed-in request keeps an in-tier model.
- A rejected token gets 401.
- A GoTrue outage is served as a degraded guest.
- The burst limiter keys on `user:<id>` for signed-in callers.

**Focused tests:** `npx vitest run api/_lib/aiCaller.test.js api/_lib/handler.test.js`

**Manual verification:** `npm run dev:full`.

- `curl -s -X POST localhost:3000/api/v1/ai/chat -H 'content-type: application/json' -d '{"model":"claude-sonnet-5-5","max_tokens":20,"messages":[{"role":"user","content":"hi"}]}'`.
  The response's `model` is the Haiku id.
- Signed-in chat in the browser still returns Balanced-quality replies (Network
  tab: request `model` equals response `model`).

**Depends on:** A1, A2 (A2 must already be merged). **Scope:** M, 4 files.

---

#### CHECKPOINT A-1 (after A1–A3)

- [ ] `npm test && npm run lint && npm run format:check` are green.
- [ ] Open the PR(s). A1–A3 may ship as one PR. Merge, and Vercel deploys.
- [ ] Production smoke test: signed-in chat replies normally, and the guest
      `curl` above shows Haiku. **Owner:** nothing to apply. Check that
      Vercel logs show no `model_clamped` coming from the real app; one would
      mean a client tier mismatch.

---

### Task A4: Track A migration — entitlements, usage, grants, cost

**Goal:** One migration with four tables and three RPCs, proven against the local
stack. **Written by an agent. Applied by the owner only.**

**Files:**

- Create: `supabase/migrations/20261006120000_ai_access_quota.sql`
- Create: `supabase/tests/rls/ai-quota.test.js`

**Interfaces (Produces, used verbatim by A5 and C1):**

- `consume_ai_quota(p_subject text, p_user uuid, p_meter text, p_units integer, p_limits jsonb, p_pool_limits jsonb, p_enforce boolean) → jsonb`
  returns `{ allowed, tier, limit, used, reason, wouldDeny }`.
- `refund_ai_quota(p_subject text, p_meter text, p_units integer, p_tier text) → void`
- `record_ai_cost(p_meter text, p_model text, p_tier text, p_input integer, p_output integer) → void`
- Tables:
  - `entitlements (user_id, source)`: authenticated may SELECT its own rows.
  - `ai_quota_grants`: authenticated may SELECT its own rows. The unique
    constraint `ai_quota_grants_source_ref` is on `(source, source_ref)`.
  - `ai_usage` and `ai_cost_daily`: server-only.

- [ ] **Step 1: Write the RLS test first** (`supabase/tests/rls/ai-quota.test.js`)

```js
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
    await admin.auth.admin.deleteUser(u.id);
    const { data } = await admin.from('entitlements').select('user_id').eq('user_id', u.id);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `supabase start` (Docker), then
      `npm run test:rls -- supabase/tests/rls/ai-quota.test.js`. It fails because
      the relations do not exist.

- [ ] **Step 3: Write the migration**
      `supabase/migrations/20261006120000_ai_access_quota.sql`

```sql
-- AI access: per-day quotas, tier pools, Premium entitlements, quota grants,
-- and an identifier-free daily cost roll-up.
--
-- DO NOT apply this to production from an agent. The owner applies it to
-- Sprachschule (xcnnlczvxmuwcqwychox) after merge through the Management API
-- procedure in docs/STORE_SUBMISSION_CHECKLIST.md item 1, then renames this
-- file to the recorded version in a PR. Never `db push`, `migration repair`,
-- MCP apply_migration, or the SQL editor.
--
-- Design: docs/superpowers/specs/2026-10-01-monetization-access-design.md §6, §10.
--
-- Threat model: the tier is decided HERE, from entitlements, never from the
-- request. Every RPC is service_role only; the Vercel AI lane is the only
-- caller. Learners may read their own entitlements and grants (UI), nothing else.

-- ── entitlements ───────────────────────────────────────────────────

create table public.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('manual', 'revenuecat')),
  tier text not null default 'premium' check (tier = 'premium'),
  product_id text,
  store text,
  environment text,
  expires_at timestamptz,
  will_renew boolean,
  billing_issue_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, source)
);

comment on table public.entitlements is
  'Premium grants. expires_at null = no expiry. Written by service_role only (RevenueCat webhook/sync, owner comps).';

alter table public.entitlements enable row level security;
create policy "read own entitlements"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;

-- ── usage counters (one day per subject) ───────────────────────────

create table public.ai_usage (
  subject text not null check (char_length(subject) between 3 and 80),
  meter text not null check (meter in ('chat', 'grade', 'deck')),
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (subject, meter, day)
);

alter table public.ai_usage enable row level security;
create policy "no client access" on public.ai_usage
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.ai_usage from anon, authenticated;
grant all on table public.ai_usage to service_role;

-- ── grants (rewarded ads, support goodwill) ────────────────────────

create table public.ai_quota_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  meter text not null check (meter in ('chat', 'grade', 'deck')),
  day date not null,
  units integer not null check (units between 1 and 50),
  source text not null check (source in ('rewarded_ad', 'support')),
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint ai_quota_grants_source_ref unique (source, source_ref)
);
create index ai_quota_grants_user_day_idx on public.ai_quota_grants (user_id, day);

alter table public.ai_quota_grants enable row level security;
create policy "read own grants"
  on public.ai_quota_grants for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.ai_quota_grants from anon, authenticated;
grant select on table public.ai_quota_grants to authenticated;
grant all on table public.ai_quota_grants to service_role;

-- ── daily cost roll-up (no user, no IP) ────────────────────────────

create table public.ai_cost_daily (
  day date not null,
  meter text not null,
  model text not null,
  tier text not null check (tier in ('guest', 'free', 'premium')),
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, meter, model, tier)
);

alter table public.ai_cost_daily enable row level security;
create policy "no client access" on public.ai_cost_daily
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.ai_cost_daily from anon, authenticated;
grant all on table public.ai_cost_daily to service_role;

-- ── consume ────────────────────────────────────────────────────────

create or replace function public.consume_ai_quota(
  p_subject text,
  p_user uuid,
  p_meter text,
  p_units integer,
  p_limits jsonb,
  p_pool_limits jsonb,
  p_enforce boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_tier text;
  v_limit integer;
  v_pool_limit integer;
  v_used integer;
  v_pool_used integer;
begin
  if p_meter is null or p_meter not in ('chat', 'grade', 'deck') then
    raise exception 'unknown meter' using errcode = '22023';
  end if;
  if p_units is null or p_units not between 1 and 10 then
    raise exception 'invalid units' using errcode = '22023';
  end if;
  if p_subject is null or char_length(p_subject) not between 3 and 80 then
    raise exception 'invalid subject' using errcode = '22023';
  end if;

  if p_user is null then
    v_tier := 'guest';
  elsif exists (
    select 1 from public.entitlements e
    where e.user_id = p_user and (e.expires_at is null or e.expires_at > now())
  ) then
    v_tier := 'premium';
  else
    v_tier := 'free';
  end if;

  v_limit := coalesce((p_limits ->> v_tier)::integer, 0);
  if v_tier = 'free' then
    v_limit := v_limit + coalesce((
      select sum(g.units)::integer from public.ai_quota_grants g
      where g.user_id = p_user and g.meter = p_meter and g.day = v_day
    ), 0);
  end if;
  v_pool_limit := (p_pool_limits ->> v_tier)::integer; -- null: no pool for this tier

  -- Earlier days are dead weight: drop this subject's, and pools older than 30 days.
  delete from public.ai_usage where subject = p_subject and day < v_day;
  delete from public.ai_usage
  where subject in ('pool:guest', 'pool:free') and day < v_day - 30;

  if p_enforce and v_limit < p_units then
    return jsonb_build_object('allowed', false, 'tier', v_tier, 'limit', v_limit,
      'used', null, 'reason', 'quota', 'wouldDeny', true);
  end if;

  insert into public.ai_usage as u (subject, meter, day, used)
  values (p_subject, p_meter, v_day, p_units)
  on conflict (subject, meter, day) do update
    set used = u.used + p_units
    where not p_enforce or u.used + p_units <= v_limit
  returning u.used into v_used;

  if v_used is null then
    return jsonb_build_object('allowed', false, 'tier', v_tier, 'limit', v_limit,
      'used', (select a.used from public.ai_usage a
               where a.subject = p_subject and a.meter = p_meter and a.day = v_day),
      'reason', 'quota', 'wouldDeny', true);
  end if;

  if v_pool_limit is not null then
    if not (p_enforce and v_pool_limit < p_units) then
      insert into public.ai_usage as u (subject, meter, day, used)
      values ('pool:' || v_tier, p_meter, v_day, p_units)
      on conflict (subject, meter, day) do update
        set used = u.used + p_units
        where not p_enforce or u.used + p_units <= v_pool_limit
      returning u.used into v_pool_used;
    end if;
    if v_pool_used is null then
      update public.ai_usage set used = used - p_units
      where subject = p_subject and meter = p_meter and day = v_day;
      return jsonb_build_object('allowed', false, 'tier', v_tier, 'limit', v_limit,
        'used', v_used - p_units, 'reason', 'pool', 'wouldDeny', true);
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'tier', v_tier, 'limit', v_limit,
    'used', v_used, 'reason', null,
    'wouldDeny', v_used > v_limit or (v_pool_limit is not null and v_pool_used > v_pool_limit));
end
$$;

-- ── refund ─────────────────────────────────────────────────────────

-- A request that consumed at 23:59:59 and fails after midnight refunds the new
-- day's row (a no-op if absent). Accepted: the window is one request long.
create or replace function public.refund_ai_quota(
  p_subject text, p_meter text, p_units integer, p_tier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_units is null or p_units not between 1 and 10 then
    raise exception 'invalid units' using errcode = '22023';
  end if;
  update public.ai_usage
  set used = greatest(used - p_units, 0)
  where day = (now() at time zone 'utc')::date
    and meter = p_meter
    and subject in (p_subject, 'pool:' || coalesce(p_tier, ''));
end
$$;

-- ── cost ───────────────────────────────────────────────────────────

create or replace function public.record_ai_cost(
  p_meter text, p_model text, p_tier text, p_input integer, p_output integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_cost_daily as c (day, meter, model, tier, calls, input_tokens, output_tokens)
  values ((now() at time zone 'utc')::date, p_meter, left(p_model, 80), p_tier, 1,
          greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0))
  on conflict (day, meter, model, tier) do update
    set calls = c.calls + 1,
        input_tokens = c.input_tokens + excluded.input_tokens,
        output_tokens = c.output_tokens + excluded.output_tokens;
end
$$;

revoke all on function public.consume_ai_quota(text, uuid, text, integer, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.refund_ai_quota(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.record_ai_cost(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(text, uuid, text, integer, jsonb, jsonb, boolean) to service_role;
grant execute on function public.refund_ai_quota(text, text, integer, text) to service_role;
grant execute on function public.record_ai_cost(text, text, text, integer, integer) to service_role;
```

- [ ] **Step 4: Run the RLS suite and confirm it passes.**
      Run `supabase db reset --local` (**local only**), then
      `npm run test:rls -- supabase/tests/rls/ai-quota.test.js`. Then run the
      whole `npm run test:rls`, because `policies.test.js`,
      `policy-initplan.test.js` and `server-only-tables.test.js` sweep every
      table. If one of them enumerates server-only tables explicitly, add
      `ai_usage` and `ai_cost_daily` to its list.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261006120000_ai_access_quota.sql supabase/tests/rls/ai-quota.test.js
git commit -m "feat(db): AI quota, entitlements, grants and daily cost — migration file only"
```

**Acceptance criteria:**

- Every test in `ai-quota.test.js` passes against the local stack.
- The existing RLS sweeps still pass.
- The file carries the DO-NOT-APPLY banner.

**Focused tests:** `npm run test:rls -- supabase/tests/rls/ai-quota.test.js`

**Manual verification:** with `supabase db diff --local` (read-only), confirm the
local schema shows the four tables and three functions. **Never** run any
`supabase` command against the linked project.

**Depends on:** none (it can be written in parallel with A1–A3).
**Scope:** L, 2 files (~260 lines SQL, ~190 lines test).

---

### Task A5: Quota service (RPC wrapper, modes, degraded fallback)

**Goal:** The handler gets a single object that knows the mode, calls the RPCs,
and degrades safely.

**Files:**

- Create: `api/_lib/aiQuota.js`, `api/_lib/aiQuota.test.js`

**Interfaces:**

- Consumes: `serviceClient` (`./supabase.js`), `MemoryStore` (`./ratelimit.js`),
  and `DAILY_LIMITS`, `DAILY_POOLS` (A1).
- Produces:

```js
export function quotaMode(env = process.env); // 'off' | 'shadow' | 'enforce'
export function createQuota({ client, env, memory, now } = {});
// → {
//   mode,
//   consume({ caller, meter, units }) → Promise<{ allowed, tier, limit, used, reason, wouldDeny, degraded }>,
//   refund({ caller, meter, units, tier }) → Promise<void>,          // never throws
//   recordCost({ meter, model, tier, usage }) → Promise<void>,      // never throws
// }
```

- [ ] **Step 1: Write the failing test** (`api/_lib/aiQuota.test.js`)

```js
import { describe, it, expect, vi } from 'vitest';
import { createQuota, quotaMode } from './aiQuota.js';
import { MemoryStore } from './ratelimit.js';

const guest = { kind: 'guest', key: 'ip:1.1.1.1' };
const user = { kind: 'user', userId: '00000000-0000-4000-8000-000000000001', key: 'user:x' };
const rpcClient = (impl) => ({ rpc: vi.fn(impl) });

describe('quotaMode', () => {
  it('defaults to off and accepts only the three values', () => {
    expect(quotaMode({})).toBe('off');
    expect(quotaMode({ AI_QUOTA_MODE: 'shadow' })).toBe('shadow');
    expect(quotaMode({ AI_QUOTA_MODE: 'ENFORCE' })).toBe('enforce');
    expect(quotaMode({ AI_QUOTA_MODE: 'yes' })).toBe('off');
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
    await q.refund({ caller: user, meter: 'chat', units: 1, tier: 'free' });
    await q.recordCost({ meter: 'chat', model: 'm', tier: 'free', usage: {} });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('passes subject, user, limits, pools and enforce to the RPC', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: true, tier: 'free', limit: 20, used: 1, reason: null, wouldDeny: false },
      error: null,
    }));
    const q = createQuota({ client, env: { AI_QUOTA_MODE: 'enforce' } });
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

  it('shadow mode serves even when the RPC would deny', async () => {
    const client = rpcClient(async () => ({
      data: { allowed: true, tier: 'free', limit: 20, used: 25, wouldDeny: true },
      error: null,
    }));
    const q = createQuota({ client, env: { AI_QUOTA_MODE: 'shadow' } });
    expect((await q.consume({ caller: user, meter: 'chat', units: 1 })).allowed).toBe(true);
    expect(client.rpc.mock.calls[0][1].p_enforce).toBe(false);
  });

  it('RPC error degrades to the in-memory guest allowance', async () => {
    const client = rpcClient(async () => ({ data: null, error: { message: 'down' } }));
    const q = createQuota({
      client,
      env: { AI_QUOTA_MODE: 'enforce' },
      memory: new MemoryStore(),
    });
    const results = [];
    for (let i = 0; i < 11; i += 1)
      results.push(await q.consume({ caller: user, meter: 'chat', units: 1 }));
    expect(results.slice(0, 10).every((r) => r.allowed && r.degraded && r.tier === 'guest')).toBe(
      true
    );
    expect(results[10]).toMatchObject({ allowed: false, degraded: true, reason: 'quota' });
  });

  it('a degraded caller never reaches the RPC', async () => {
    const client = rpcClient();
    const q = createQuota({ client, env: { AI_QUOTA_MODE: 'enforce' }, memory: new MemoryStore() });
    await q.consume({ caller: { ...guest, degraded: true }, meter: 'chat', units: 1 });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('AI_GUEST_ENABLED=false denies guests in every mode', async () => {
    for (const mode of ['off', 'shadow', 'enforce']) {
      const q = createQuota({
        client: rpcClient(),
        env: { AI_QUOTA_MODE: mode, AI_GUEST_ENABLED: 'false' },
      });
      expect(await q.consume({ caller: guest, meter: 'chat', units: 1 })).toMatchObject({
        allowed: false,
        reason: 'disabled',
        tier: 'guest',
      });
    }
  });

  it('refund and recordCost swallow errors', async () => {
    const client = rpcClient(async () => {
      throw new Error('boom');
    });
    const q = createQuota({ client, env: { AI_QUOTA_MODE: 'enforce' } });
    await expect(
      q.refund({ caller: user, meter: 'chat', units: 1, tier: 'free' })
    ).resolves.toBeUndefined();
    await expect(
      q.recordCost({
        meter: 'chat',
        model: 'm',
        tier: 'free',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `npx vitest run api/_lib/aiQuota.test.js`.

- [ ] **Step 3: Implement** `api/_lib/aiQuota.js`

```js
import { serviceClient } from './supabase.js';
import { MemoryStore } from './ratelimit.js';
import { DAILY_LIMITS, DAILY_POOLS } from '../../src/lib/accessPolicy.js';

// Billable product quota (spec §6.2) — distinct from the burst limiter.
// off: identity + clamp only. shadow: count, never deny. enforce: deny.
// On ANY quota-store failure every caller is a guest counted in this
// instance's memory: bounded spend, AI stays up (spec §6.8).
const DAY_MS = 24 * 60 * 60 * 1000;

export function quotaMode(env = process.env) {
  const mode = String(env.AI_QUOTA_MODE ?? '').toLowerCase();
  return mode === 'shadow' || mode === 'enforce' ? mode : 'off';
}

const subjectOf = (caller) => (caller.kind === 'user' ? `u:${caller.userId}` : caller.key);
const log = (event, fields = {}) => console.warn(JSON.stringify({ event, ...fields }));

export function createQuota({
  client = serviceClient(),
  env = process.env,
  memory = new MemoryStore(),
  now = Date.now,
} = {}) {
  const mode = quotaMode(env);
  const guestsOff = env.AI_GUEST_ENABLED === 'false';

  async function degraded(caller, meter, units) {
    log('quota_store_degraded', { meter });
    const dayStart = Math.floor(now() / DAY_MS) * DAY_MS;
    let used = 0;
    for (let i = 0; i < units; i += 1) {
      used = await memory.increment(`quota:${meter}:${caller.key}`, dayStart);
    }
    const limit = DAILY_LIMITS[meter].guest;
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
      return {
        allowed: false,
        tier: 'guest',
        limit: 0,
        used: 0,
        reason: 'disabled',
        wouldDeny: true,
      };
    }
    if (mode === 'off') {
      return {
        allowed: true,
        tier: caller.kind === 'user' ? 'free' : 'guest',
        limit: null,
        used: null,
        reason: null,
      };
    }
    if (caller.degraded || !client) return degraded(caller, meter, units);
    try {
      const { data, error } = await client.rpc('consume_ai_quota', {
        p_subject: subjectOf(caller),
        p_user: caller.kind === 'user' ? caller.userId : null,
        p_meter: meter,
        p_units: units,
        p_limits: DAILY_LIMITS[meter],
        p_pool_limits: DAILY_POOLS[meter],
        p_enforce: mode === 'enforce',
      });
      if (error || !data) throw new Error(error?.message ?? 'empty quota response');
      if (data.wouldDeny)
        log(mode === 'enforce' ? 'quota_denied' : 'quota_would_deny', {
          meter,
          tier: data.tier,
          reason: data.reason ?? 'quota',
        });
      return { ...data, allowed: mode === 'shadow' ? true : data.allowed, degraded: false };
    } catch {
      return degraded(caller, meter, units);
    }
  }

  async function refund({ caller, meter, units, tier }) {
    if (mode === 'off' || !client || caller.degraded || units < 1) return;
    try {
      await client.rpc('refund_ai_quota', {
        p_subject: subjectOf(caller),
        p_meter: meter,
        p_units: units,
        p_tier: tier,
      });
    } catch (err) {
      console.error('quota refund failed:', err.message);
    }
  }

  async function recordCost({ meter, model, tier, usage }) {
    if (mode === 'off' || !client) return;
    try {
      await client.rpc('record_ai_cost', {
        p_meter: meter,
        p_model: model,
        p_tier: tier,
        p_input: usage?.input_tokens ?? 0,
        p_output: usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.error('cost record failed:', err.message);
    }
  }

  return { mode, consume, refund, recordCost };
}
```

`supabase-js` `rpc` returns `{ data, error }` and does not throw for SQL errors;
the `try` covers network throws. A degraded result in shadow mode still reports
`allowed: true` (mode ≠ enforce).

- [ ] **Step 4: Run it and confirm it passes.**

- [ ] **Step 5: Commit**

```bash
git add api/_lib/aiQuota.js api/_lib/aiQuota.test.js
git commit -m "feat(ai): quota service — modes, RPC wrapper, degraded in-memory fallback"
```

**Acceptance criteria:**

- The tests pass.
- `off` makes zero RPC calls.
- A degraded store is bounded at the guest allowance per instance.
- `AI_GUEST_ENABLED=false` works in every mode.

**Focused tests:** `npx vitest run api/_lib/aiQuota.test.js`

**Manual verification:** none, because it is not wired in yet.

**Depends on:** A1, A4 (the RPC contract). **Scope:** M, 2 files.

---

### Task A6: Error envelope and exposed quota headers

**Goal:** `quota_exhausted` exists with details, and the native client can read
`X-Quota-*` headers cross-origin.

**Files:**

- Modify: `api/_lib/respond.js`, `api/_lib/respond.test.js`
- Modify: `api/_lib/origin.js`, `api/_lib/origin.test.js`

**Interfaces:**

- Produces:
  - `ERROR_CODES.quota_exhausted === 429`;
  - `sendError(res, code, message, extraHeaders = {}, details = {})`, where the
    body is `{ error: { code, message, ...details } }`;
  - CORS `Access-Control-Expose-Headers: Retry-After, X-Quota-Limit, X-Quota-Used, X-Quota-Reset, X-Quota-Tier`.

- [ ] **Step 1: Write the failing tests**

`respond.test.js`:

```js
it('quota_exhausted is a 429 carrying details', () => {
  const res = createRes(); // reuse the file's helper
  sendError(res, 'quota_exhausted', 'Daily AI limit reached.', {}, { meter: 'chat', limit: 20 });
  expect(res.statusCode).toBe(429);
  expect(res.body).toEqual({
    error: {
      code: 'quota_exhausted',
      message: 'Daily AI limit reached.',
      meter: 'chat',
      limit: 20,
    },
  });
});

it('details cannot overwrite code or message', () => {
  const res = createRes();
  sendError(res, 'bad_request', 'x', {}, { code: 'forged', message: 'forged' });
  expect(res.body.error).toMatchObject({ code: 'bad_request', message: 'x' });
});
```

`origin.test.js`: for a native origin, assert that
`Access-Control-Expose-Headers` contains `X-Quota-Reset` and still contains
`Retry-After`.

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement.**

In `respond.js`, add `quota_exhausted: 429` under `rate_limited`, with a comment:
"Distinct from rate_limited: the burst limiter is about floods; this is the daily
product allowance (spec §6.9)". Set
`res.status(...).json({ error: { ...details, code, message } })`. Spreading
`details` first keeps `code` and `message` authoritative.

In `origin.js`, set
`res.setHeader('Access-Control-Expose-Headers', 'Retry-After, X-Quota-Limit, X-Quota-Used, X-Quota-Reset, X-Quota-Tier')`.

- [ ] **Step 4: Run and confirm they pass.** Then run the full `npm test`, since
      many tests snapshot error bodies. The two-argument and four-argument call
      forms must stay byte-identical.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/respond.js api/_lib/respond.test.js api/_lib/origin.js api/_lib/origin.test.js
git commit -m "feat(api): quota_exhausted envelope and exposed X-Quota headers"
```

**Acceptance criteria:**

- Existing envelopes are unchanged.
- The new code is a 429 with details.
- The headers are exposed to the native origin.

**Focused tests:** `npx vitest run api/_lib/respond.test.js api/_lib/origin.test.js`

**Manual verification:** none.

**Depends on:** none. **Scope:** S, 4 files.

---

#### CHECKPOINT A-2 (after A4–A6)

- [ ] `npm test && npm run lint && npm run format:check` are green.
- [ ] `npm run test:rls` is green locally.
- [ ] Open a PR for A4–A6. Merging deploys code that nothing calls yet. The
      migration file is **not** applied by merging.
- [ ] **OWNER (after merge, before A7 is enabled beyond `off`):**
  - Apply `20261006120000_ai_access_quota.sql` with the Management API drill,
    then rename the file to the recorded version in a follow-up PR.
  - Verify read-only: the four tables exist, and the three functions are
    executable by `service_role` only.
  - Migration Drift goes green.

---

### Task A7: The handler enforces quotas

**Goal:** The full chain from spec §11: caller, burst limit, validate, consume,
clamp by the RPC's tier, forward, then refund or record cost, then quota
headers.

**Files:**

- Modify: `api/_lib/handler.js`, `api/_lib/handler.test.js`
- Modify: `api/_lib/aiEndpoints.js` (pass `meter: 'chat' | 'deck' | 'grade'`)
- Modify: `docs/api/ai.md` (new "Quotas" section: the error body, the headers,
  UTC reset, modes)

**Interfaces:**

- Consumes: `createQuota` (A5), `unitsFor`, `clampModel`, `nextUtcReset` (A1),
  `resolveCaller` (A3), and `sendError` with details (A6).
- Produces: `createAiHandler({ name, meter, rate, afterValidate, quota = createQuota() })`.
  Tests inject `quota`.

- [ ] **Step 1: Write the failing tests** (`handler.test.js`, using a fake quota)

```js
const fakeQuota = (consumeResult) => ({
  mode: 'enforce',
  consume: vi.fn(async () => consumeResult),
  refund: vi.fn(async () => {}),
  recordCost: vi.fn(async () => {}),
});

it('denies with quota_exhausted and never forwards', async () => {
  const quota = fakeQuota({ allowed: false, tier: 'free', limit: 20, used: 20, reason: 'quota' });
  const res = createRes();
  await createAiHandler({ ...wideOpen, meter: 'chat', quota })(postReq(), res);
  expect(res.statusCode).toBe(429);
  expect(res.body.error).toMatchObject({
    code: 'quota_exhausted',
    meter: 'chat',
    tier: 'free',
    limit: 20,
  });
  expect(res.body.error.resetsAt).toMatch(/T00:00:00\.000Z$/);
  expect(fetch).not.toHaveBeenCalled();
});

it('refunds the units when the provider fails', async () => {
  fetch.mockImplementationOnce(() => Promise.reject(new Error('socket')));
  const quota = fakeQuota({ allowed: true, tier: 'guest', limit: 10, used: 1 });
  const res = createRes();
  await createAiHandler({ ...wideOpen, meter: 'chat', quota })(postReq(), res);
  expect(res.statusCode).toBe(502);
  expect(quota.refund).toHaveBeenCalledWith(expect.objectContaining({ meter: 'chat', units: 1 }));
  expect(quota.recordCost).not.toHaveBeenCalled();
});

it('refunds on a non-2xx upstream status', async () => {
  fetch.mockImplementationOnce(() =>
    Promise.resolve({ status: 529, json: () => Promise.resolve({}) })
  );
  const quota = fakeQuota({ allowed: true, tier: 'guest', limit: 10, used: 1 });
  await createAiHandler({ ...wideOpen, meter: 'chat', quota })(postReq(), createRes());
  expect(quota.refund).toHaveBeenCalled();
});

it('clamps to the RPC tier and refunds the weight difference', async () => {
  const quota = fakeQuota({ allowed: true, tier: 'guest', limit: 10, used: 3 });
  const req = postReq({ body: { ...validBody(), model: 'claude-sonnet-5-5' } });
  await createAiHandler({ ...wideOpen, meter: 'chat', quota })(req, createRes());
  expect(quota.consume).toHaveBeenCalledWith(expect.objectContaining({ units: 2 }));
  expect(quota.refund).toHaveBeenCalledWith(expect.objectContaining({ units: 1 }));
  expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('claude-haiku-4-5-20251001');
});

it('records cost and sets quota headers on success', async () => {
  fetch.mockImplementationOnce(() =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve({ content: [], usage: { input_tokens: 10, output_tokens: 2 } }),
    })
  );
  const quota = fakeQuota({ allowed: true, tier: 'free', limit: 20, used: 4 });
  const res = createRes();
  await createAiHandler({ ...wideOpen, meter: 'chat', quota })(postReq(), res);
  expect(quota.recordCost).toHaveBeenCalledWith({
    meter: 'chat',
    model: 'claude-haiku-4-5-20251001',
    tier: 'free',
    usage: { input_tokens: 10, output_tokens: 2 },
  });
  expect(res.headers).toMatchObject({
    'X-Quota-Limit': '20',
    'X-Quota-Used': '4',
    'X-Quota-Tier': 'free',
  });
});

it('sets no quota headers in off mode', async () => {
  const quota = fakeQuota({ allowed: true, tier: 'guest', limit: null, used: null });
  const res = createRes();
  await createAiHandler({ ...wideOpen, meter: 'chat', quota })(postReq(), res);
  expect(res.headers['X-Quota-Limit']).toBeUndefined();
});
```

How `forwardToAnthropic` turns the mocked `fetch` into `{status, data}` is
already exercised by this file's existing tests. Follow their mock shape.

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement.** Replace the body of `createAiHandler` after
      validation with:

```js
const DENIAL_MESSAGES = {
  quota: 'Daily AI limit reached.',
  pool: 'AI is busy right now — please try again later.',
  disabled: 'AI features are paused for guests right now. Create a free account to keep going.',
};

// … after afterValidate:
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
  if (charged < units) await quota.refund({ caller, meter, units: units - charged, tier: q.tier });
}
safeBody = { ...safeBody, model };

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
```

Delete A3's provisional `const tier = caller.kind === 'user' ? 'free' : 'guest'`
block, which this replaces. In `aiEndpoints.js`, add `meter: 'chat'`,
`meter: 'deck'` and `meter: 'grade'` to the three `createAiHandler` calls.

- [ ] **Step 4: Run and confirm they pass.** Then run the full `npm test`
      (`endpoints.test.js` imports the three handlers).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/handler.js api/_lib/handler.test.js api/_lib/aiEndpoints.js docs/api/ai.md
git commit -m "feat(ai): enforce daily quotas with refund-on-failure and cost roll-up"
```

**Acceptance criteria:**

- A denial never forwards.
- A provider failure refunds.
- A clamp charges the clamped model's weight.
- Cost is recorded only on 2xx.
- Headers are present unless the mode is `off`.
- With `AI_QUOTA_MODE` unset, production behaviour equals A3.

**Focused tests:** `npx vitest run api/_lib/handler.test.js api/_lib/endpoints.test.js`

**Manual verification (local stack):**

1. Set `.env.local` to the local Supabase values and `AI_QUOTA_MODE=enforce`.
2. Run `npm run dev:full`. As a guest, send 11 chat turns; the 11th returns 429
   `quota_exhausted`.
3. Check `select * from ai_usage` locally: `used` = 10.
4. Check `select * from ai_cost_daily`: 10 calls.

**Depends on:** A3, A5, A6. **Scope:** M, 4 files.

---

### Task A8: Chat shows a quota note instead of an error

**Goal:** An exhausted learner sees an inline, honest note with the local reset
time and the next step, never "Entschuldigung, ein Fehler".

**Files:**

- Modify: `src/lib/claude.js`, `src/lib/claude.test.js` (add
  `QuotaExhaustedError` and the `onQuota` callback)
- Create: `src/components/chat/QuotaNote.jsx`, `src/components/chat/QuotaNote.test.jsx`
- Modify: `src/components/ChatTab.jsx`, `src/components/ChatTab.test.jsx`
- Modify: `src/App.jsx` (pass `onSignIn={requestSignIn}` to `ChatTab`; one prop)

**Interfaces:**

- Produces:

```js
// src/lib/claude.js
export class QuotaExhaustedError extends Error {
  // fields: meter, tier, limit, used, resetsAt (ISO string), rewardedEligible (boolean)
}
// callClaude(…, { …, onQuota }) — onQuota({ limit, used, resetsAt, tier }) after a successful call
// when X-Quota-Limit is present.
```

```jsx
// src/components/chat/QuotaNote.jsx
<QuotaNote error={QuotaExhaustedError} onSignIn={fn} onPremium={fn?} onRewarded={fn?} />
// onPremium is added by Track B (B4) and onRewarded by Track C (C6). Each button
// renders only when its callback is passed AND the error/tier allows it.
```

- [ ] **Step 1: Write the failing tests**

`claude.test.js`:

```js
it('throws QuotaExhaustedError with the server details on quota_exhausted', async () => {
  fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: 'quota_exhausted',
          message: 'Daily AI limit reached.',
          meter: 'chat',
          tier: 'free',
          limit: 20,
          used: 20,
          resetsAt: '2026-10-02T00:00:00.000Z',
          rewardedEligible: true,
        },
      }),
      { status: 429 }
    )
  );
  const err = await callClaude('s', 'u').catch((e) => e);
  expect(err).toBeInstanceOf(QuotaExhaustedError);
  expect(err).toMatchObject({ meter: 'chat', limit: 20, rewardedEligible: true });
});

it('a burst 429 (rate_limited) stays a plain Error', async () => {
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'slow' } }), {
      status: 429,
    })
  );
  expect(await callClaude('s', 'u').catch((e) => e)).not.toBeInstanceOf(QuotaExhaustedError);
});

it('reports quota headers through onQuota', async () => {
  const onQuota = vi.fn();
  fetch.mockResolvedValue(
    new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }] }), {
      status: 200,
      headers: {
        'X-Quota-Limit': '20',
        'X-Quota-Used': '4',
        'X-Quota-Reset': '2026-10-02T00:00:00.000Z',
        'X-Quota-Tier': 'free',
      },
    })
  );
  await callClaude('s', 'u', [], { onQuota });
  expect(onQuota).toHaveBeenCalledWith({
    limit: 20,
    used: 4,
    resetsAt: '2026-10-02T00:00:00.000Z',
    tier: 'free',
  });
});
```

`QuotaNote.test.jsx`:

- it renders "Daily AI limit reached" and a reset time formatted with
  `Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })`;
- a guest error (`tier: 'guest'`) shows "Create a free account" and calls
  `onSignIn`;
- a free error with no `onPremium`/`onRewarded` shows **no** buttons except the
  reset text;
- with `onPremium` passed and `tier: 'free'`, a "Get Premium" button calls it;
- with `onRewarded` passed and `rewardedEligible: false`, there is **no** ad
  button;
- a `reason`-less pool message (`message` "AI is busy…") is rendered verbatim;
- there is no colour literal (the colour guard catches this anyway).

`ChatTab.test.jsx`:

- when `callClaude` rejects with a `QuotaExhaustedError`, the conversation shows
  the `QuotaNote` (by role `note` and its text), **not** the "Entschuldigung"
  error bubble;
- the input stays enabled so the learner can read and scroll.

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement**

`claude.js`:

```js
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
// in callClaude's !response.ok branch, before the generic throw:
if (errorData?.error?.code === 'quota_exhausted') throw new QuotaExhaustedError(errorData.error);
// after a 2xx, before parsing content:
const limit = response.headers.get('X-Quota-Limit');
if (limit != null && typeof onQuota === 'function') {
  onQuota({
    limit: Number(limit),
    used: Number(response.headers.get('X-Quota-Used')),
    resetsAt: response.headers.get('X-Quota-Reset'),
    tier: response.headers.get('X-Quota-Tier'),
  });
}
```

`QuotaNote.jsx`:

- a `role="note"` block styled with tokens only (`COLORS`, `FONTS`, `SPACE`,
  `RADIUS` from `../../lib/theme`), and actions through `ui/Button`;
- the copy is English product chrome, like `TrialWall`.

`ChatTab.jsx`:

- keep a `quotaError` state; on `QuotaExhaustedError`, set it instead of
  appending `errorReply`;
- render `<QuotaNote error={quotaError} onSignIn={onSignIn} />` under the last
  message;
- clear it on the next successful send;
- accept the new prop `onSignIn = null`.

- [ ] **Step 4: Run and confirm they pass.** Run the full `npm test` too.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude.js src/lib/claude.test.js src/components/chat/QuotaNote.jsx src/components/chat/QuotaNote.test.jsx src/components/ChatTab.jsx src/components/ChatTab.test.jsx src/App.jsx
git commit -m "feat(chat): inline quota note with local reset time instead of an error bubble"
```

**Acceptance criteria:**

- A quota denial shows the note with the local reset time.
- A guest sees "Create a free account".
- No Premium or ad button appears until Tracks B and C pass their callbacks.
- A burst 429 behaves as today.

**Focused tests:** the four test files above.

**Manual verification:**

1. Run against the local stack in enforce mode (A7's manual setup).
2. Exhaust the guest chat allowance. The note appears with the local time,
   reachable at **375px and 320px** with no horizontal overflow (spec rule).
3. Check `scrollWidth - clientWidth === 0`.

**Depends on:** A7. **Scope:** M, 7 files.

---

### Task A9: Grading and deck generation tell the truth at the limit

**Goal:** A quota denial while grading shows a neutral "Daily checking limit
reached — resets at HH:MM" panel. It is never a "wrong" verdict and never says
"check your connection" (F9). Deck generation shows the same truth instead of
`alert('Could not generate deck — …')`.

**Files:**

- Modify: `src/components/translate/TypingExercise.jsx`, its test
- Modify: `src/components/VocabTab.jsx`, its test

**Interfaces:** consumes `QuotaExhaustedError` (A8).

- [ ] **Step 1: Write the failing tests**

TypingExercise:

```js
it('a quota denial is not a wrong answer', async () => {
  callClaude.mockRejectedValue(
    new QuotaExhaustedError({
      meter: 'grade',
      tier: 'free',
      resetsAt: '2026-10-02T00:00:00.000Z',
      message: 'Daily AI limit reached.',
    })
  );
  // type an answer and press Check (follow the file's existing helpers)
  expect(await screen.findByText(/daily checking limit reached/i)).toBeInTheDocument();
  expect(screen.queryByText(/check your connection/i)).toBeNull();
  expect(recordEvent).not.toHaveBeenCalled();
});
```

Also assert that the existing network-failure test still shows "check your
connection".

VocabTab: a deck generation rejected with `QuotaExhaustedError` shows an inline
message containing "Daily deck limit reached", and `window.alert` is not called.

- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.** In each `catch`, branch on
      `err instanceof QuotaExhaustedError` before the existing fallback. For the
      typing panel, set feedback with a new neutral `verdict: 'limit'` that
      `FeedbackPanel` renders as a note with no XP. If `FeedbackPanel` cannot
      take an unknown verdict, render a small inline note in `TypingExercise`
      instead and leave `FeedbackPanel` untouched.
- [ ] **Step 4: Run and confirm they pass. Run the full `npm test`.**
- [ ] **Step 5: Commit**

```bash
git add src/components/translate/TypingExercise.jsx src/components/translate/TypingExercise.test.jsx src/components/VocabTab.jsx src/components/VocabTab.test.jsx
git commit -m "fix(practice): a quota denial is never shown as a wrong answer or a network error"
```

**Acceptance criteria:**

- There is no "wrong" verdict, no XP change and no `recordEvent` on a quota
  denial.
- The network-failure path is unchanged.
- No `alert` on a deck quota denial.

**Focused tests:** the two test files above.

**Manual verification:** local enforce mode. Exhaust `grade` (lower
`DAILY_LIMITS.grade.guest` locally to 1 to make this quick, then revert). Confirm
the neutral panel appears at 320px.

**Depends on:** A8. **Scope:** S, 4 files.

---

### Task A10: The client learns its tier from the server

**Goal:**

- `useEntitlement` reads the learner's own `entitlements` rows (RLS), caches the
  tier in `deutsch-app-entitlement-v1`, and publishes it.
- `userTierOf` returns `'pro'` for Premium, so the model picker opens the
  ceiling.
- The dead `user.tier`/`user.plan` read is removed.

**Files:**

- Create: `src/lib/accessTier.js` (a leaf module with no imports, the same shape
  as `xpEntitlement.js`, so `preference.js` never pulls in React or supabase-js)
- Create: `src/lib/useEntitlement.js`, `src/lib/useEntitlement.test.js`
- Modify: `src/lib/ai-routing/preference.js`, `src/lib/ai-routing/preference.test.js`
- Modify: `src/App.jsx` (one hook call)

**Interfaces:**

- Produces:

```js
// src/lib/accessTier.js (leaf)
export function setAccessTier(tier); // module state, like xpEntitlement.js
export function getAccessTier(); // 'guest' | 'free' | 'premium' | null (unknown)
// src/lib/useEntitlement.js
export const ENTITLEMENT_CACHE_KEY = 'deutsch-app-entitlement-v1';
export function useEntitlement({ userId }); // → { tier, source, expiresAt, refresh }; calls setAccessTier
// userTierOf(user) → 'guest' | 'free' | 'pro' (pro iff user && getAccessTier() === 'premium')
```

- [ ] **Step 1: Write the failing tests**

`useEntitlement.test.js`. Mock `./auth.js` `getSupabase` so it returns a builder
`from().select().eq()` that resolves to `{ data, error }`.

- with no `userId`, `tier` is `'guest'` and nothing is fetched;
- an active row (`expires_at` null, or in the future) gives `'premium'` and the
  cache is written with `userId`;
- only expired rows, or no rows, give `'free'`;
- a fetch error gives the cached tier when it belongs to the same user and is
  under 7 days old, otherwise `null`. Like `fetchMyTokens`, a missing table means
  "unknown", never "premium";
- a cache for **another** user is ignored;
- `refresh()` re-reads;
- `getAccessTier()` mirrors the hook's latest tier.

`preference.test.js`:

```js
it('pro only when the server tier is premium', () => {
  setAccessTier('premium');
  expect(userTierOf({ id: 'u1' })).toBe('pro');
  setAccessTier('free');
  expect(userTierOf({ id: 'u1' })).toBe('free');
  setAccessTier('premium');
  expect(userTierOf(null)).toBe('guest');
});

it('ignores a forged user.plan', () => {
  setAccessTier('free');
  expect(userTierOf({ id: 'u1', plan: 'pro', tier: 'pro' })).toBe('free');
});
```

- [ ] **Step 2: Run and confirm they fail.**
- [ ] **Step 3: Implement.**
  - The hook follows `useTokenBalance`'s shape: an effect keyed on `userId` and
    a `live` flag.
  - Active means `rows.some((r) => r.expires_at == null || Date.parse(r.expires_at) > Date.now())`.
  - Wrap every `localStorage` access in `try`.
  - `preference.js` imports `getAccessTier` from `../accessTier.js`, and
    replaces `if (user.tier === 'pro' || user.plan === 'pro') return 'pro';`
    with `if (getAccessTier() === 'premium') return 'pro';`.
  - In `App.jsx`, call `useEntitlement({ userId: user?.id })` next to
    `useTokenBalance`, and refresh on `visibilitychange` to `visible`. Only one
    listener is needed.
- [ ] **Step 4: Run and confirm they pass.** Run the full `npm test`.
- [ ] **Step 5: Commit**

```bash
git add src/lib/accessTier.js src/lib/useEntitlement.js src/lib/useEntitlement.test.js src/lib/ai-routing/preference.js src/lib/ai-routing/preference.test.js src/App.jsx
git commit -m "feat(access): client reads its tier from server entitlements (hint only)"
```

**Acceptance criteria:**

- A manual Premium grant in the local database shows Balanced and Capable as
  selectable in the model popover after a refresh.
- A forged `plan` does nothing.
- Signing out clears the cache, because `clearUserLocalState` wipes non-theme
  keys. **Assert this** in `clearUserState.test.js` if it does not already sweep
  all keys.

**Focused tests:** `npx vitest run src/lib/useEntitlement.test.js src/lib/ai-routing/preference.test.js`

**Manual verification:**

1. Local stack: `insert into entitlements (user_id, source) values ('<local user>', 'manual')`.
2. Reload while signed in. The model popover allows Balanced, and the server
   headers show `X-Quota-Tier: premium` with limit 150.

**Depends on:** A4 (table), A7. **Scope:** M, 6 files.

---

#### CHECKPOINT A-3 (Track A done)

- [ ] `npm test && npm run lint && npm run format:check` are green.
      `npm run test:rls` is green locally.
- [ ] The A7–A10 PRs are merged. Production still runs `AI_QUOTA_MODE` unset, so
      it is `off`.
- [ ] **OWNER:**
  1. Set the Anthropic Console monthly spend limit and alerts (D5).
  2. Approve the L1 wording and publish it (Task R1 may carry just L1 early as
     its own tiny PR).
  3. Set `AI_QUOTA_MODE=shadow` on Production and redeploy.
  4. After ≥ 7 days, run the R2 runbook's cost queries and set the real numbers
     in `accessPolicy.js` (D2/D3). A one-line PR.
  5. Set `AI_QUOTA_MODE=enforce`.
- [ ] Track A is complete and useful on its own: AI spend is bounded and
      measured.

---

# Track B — Premium purchases (RevenueCat)

**[GATED: D1 = RevenueCat, D3 answered, D5 = Vercel Pro active.]** If D1 =
direct, stop: this track must be re-planned (spec §7.1, right column).

### Task B1: RevenueCat server client and the billing_events migration

**Goal:** Pure mapping from a RevenueCat subscriber to our entitlement row, plus
the dedupe table.

**Files:**

- Create: `api/_lib/revenuecat.js`, `api/_lib/revenuecat.test.js`
- Create: `supabase/migrations/20261013120000_billing_events.sql`,
  `supabase/tests/rls/billing-events.test.js`

**Interfaces:**

- Produces:

```js
export const RC_API = 'https://api.revenuecat.com/v1';
export const RC_ENTITLEMENT_ID = 'premium';
export async function fetchSubscriber(appUserId, { apiKey, fetchImpl = fetch } = {}); // → subscriber object; throws on non-2xx or timeout (10 s)
export async function deleteSubscriber(appUserId, { apiKey, fetchImpl = fetch } = {}); // → boolean; never throws
export function entitlementFromSubscriber(subscriber, now = new Date()); // → null | { product_id, store, environment, expires_at, will_renew, billing_issue_at }
export function candidateUserIds(event); // → string[] (UUIDs only, deduped)
export function isActive(row, now = new Date()); // expires_at null or > now
```

- [ ] **Step 1: Write the failing tests** (`api/_lib/revenuecat.test.js`, starting
      with `// @vitest-environment node`)

```js
const NOW = new Date('2026-10-10T12:00:00Z');
const sub = (over = {}) => ({
  entitlements: {
    premium: {
      expires_date: '2026-11-10T12:00:00Z',
      grace_period_expires_date: null,
      product_identifier: 'monthly',
    },
  },
  subscriptions: {
    monthly: {
      store: 'app_store',
      is_sandbox: false,
      unsubscribe_detected_at: null,
      billing_issues_detected_at: null,
      refunded_at: null,
      ...over,
    },
  },
});

it('active subscription → active row', () => {
  const row = entitlementFromSubscriber(sub(), NOW);
  expect(row).toMatchObject({
    product_id: 'monthly',
    store: 'app_store',
    environment: 'PRODUCTION',
    will_renew: true,
  });
  expect(isActive(row, NOW)).toBe(true);
});

it('cancelled but unexpired stays active, will_renew false', () => {
  const row = entitlementFromSubscriber(
    sub({ unsubscribe_detected_at: '2026-10-09T00:00:00Z' }),
    NOW
  );
  expect(isActive(row, NOW)).toBe(true);
  expect(row.will_renew).toBe(false);
});

it('grace period extends access', () => {
  const s = sub({ billing_issues_detected_at: '2026-10-09T00:00:00Z' });
  s.entitlements.premium.expires_date = '2026-10-09T00:00:00Z';
  s.entitlements.premium.grace_period_expires_date = '2026-10-25T00:00:00Z';
  const row = entitlementFromSubscriber(s, NOW);
  expect(isActive(row, NOW)).toBe(true);
  expect(row.billing_issue_at).toBe('2026-10-09T00:00:00Z');
});

it('expired → inactive row is kept, not deleted', () => {
  const s = sub();
  s.entitlements.premium.expires_date = '2026-10-01T00:00:00Z';
  expect(isActive(entitlementFromSubscriber(s, NOW), NOW)).toBe(false);
});

it('refund ends premium now', () => {
  const row = entitlementFromSubscriber(sub({ refunded_at: '2026-10-10T11:00:00Z' }), NOW);
  expect(row.expires_at).toBe('2026-10-10T11:00:00Z');
  expect(isActive(row, NOW)).toBe(false);
});

it('sandbox still grants, and says so', () => {
  const row = entitlementFromSubscriber(sub({ is_sandbox: true }), NOW);
  expect(isActive(row, NOW)).toBe(true);
  expect(row.environment).toBe('SANDBOX');
});

it('no premium entitlement → null', () => {
  expect(entitlementFromSubscriber({ entitlements: {}, subscriptions: {} }, NOW)).toBeNull();
});

it('candidateUserIds keeps UUIDs only', () => {
  const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
  expect(
    candidateUserIds({
      app_user_id: id,
      original_app_user_id: '$RCAnonymousID:abc',
      aliases: [id, 'junk'],
      transferred_to: [],
    })
  ).toEqual([id]);
});

it('fetchSubscriber sends the secret as a Bearer and throws on non-2xx', async () => {
  const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));
  await expect(fetchSubscriber('u', { apiKey: 'sk', fetchImpl })).rejects.toThrow();
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer sk');
});
```

RLS test (`billing-events.test.js`):

- service role inserts `{ event_id, user_id, type, environment }`;
- a duplicate `event_id` conflicts (`on conflict do nothing` returns no row);
- `authenticated` and `anon` cannot select or insert;
- deleting the user leaves the event row (no foreign key, by design, spec §10).

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement**

`entitlementFromSubscriber`:

```js
export function entitlementFromSubscriber(subscriber, now = new Date()) {
  const ent = subscriber?.entitlements?.[RC_ENTITLEMENT_ID];
  if (!ent) return null;
  const s = subscriber?.subscriptions?.[ent.product_identifier] ?? {};
  const latest = [ent.expires_date, ent.grace_period_expires_date].filter(Boolean).sort().at(-1);
  const neverExpires = ent.expires_date == null && ent.grace_period_expires_date == null;
  return {
    product_id: ent.product_identifier ?? null,
    store: s.store ?? null,
    environment: s.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
    expires_at: s.refunded_at ?? (neverExpires ? null : latest),
    will_renew: s.unsubscribe_detected_at == null && s.refunded_at == null,
    billing_issue_at: s.billing_issues_detected_at ?? null,
  };
}
```

ISO-8601 UTC strings sort lexically, so `sort()` is correct here.

Before merging, **re-check these field semantics** against the current
RevenueCat API docs (spec §4.7), and note in the PR body what was verified.

`fetchSubscriber` sends a GET to `${RC_API}/subscribers/${encodeURIComponent(id)}`
with `{ Authorization: 'Bearer ' + apiKey, Accept: 'application/json' }` and
`signal: AbortSignal.timeout(10000)`, and returns `(await res.json()).subscriber`.

Migration `20261013120000_billing_events.sql`:

- the same DO-NOT-APPLY banner as A4;
- table `billing_events (event_id text primary key check (char_length(event_id) between 1 and 200), user_id uuid, type text not null, environment text, received_at timestamptz not null default now())`;
- RLS enabled, with a `"no client access"` deny-all policy for anon and
  authenticated;
- revoke from anon and authenticated; grant all to `service_role`;
- comment: "No FK to auth.users on purpose: a refund audit outlives the account.
  No payload stored."

- [ ] **Step 4: Run and confirm they pass** (`npx vitest run api/_lib/revenuecat.test.js`
      and `npm run test:rls -- supabase/tests/rls/billing-events.test.js`).
- [ ] **Step 5: Commit**

```bash
git add api/_lib/revenuecat.js api/_lib/revenuecat.test.js supabase/migrations/20261013120000_billing_events.sql supabase/tests/rls/billing-events.test.js
git commit -m "feat(billing): RevenueCat subscriber mapping and billing_events table (file only)"
```

**Acceptance criteria:**

- Every lifecycle row in spec §7.7 has a passing test.
- Sandbox grants.
- Refund wins over a future expiry.

**Focused tests:** the two commands above.

**Manual verification:** none, because it is pure.

**Depends on:** Track A merged; D1. **Scope:** M, 4 files.

---

### Task B2: Billing endpoints — webhook and sync

**Goal:** RevenueCat can tell us about a change, and the app can ask us to
re-check. In both cases we refetch from RevenueCat, so neither path trusts a
payload.

**Files:**

- Create: `api/_lib/billingEndpoints.js`, `api/_lib/billingEndpoints.test.js`
- Create: `api/v1/billing.js`
- Modify: `vercel.json` (two rewrites)
- Delete: `api/_lib/functionBudget.test.js`. **Only after the owner confirms Pro
  (D5).** If Track C already deleted it, skip this.

**Interfaces:**

- Consumes: B1, `requireAuth`, `createRateLimiter`, `serviceClient`, `sendError`,
  `withCors`.
- Produces:
  - `webhookHandler(req, res)`;
  - `syncHandler(req, res)`, which responds `{ tier: 'premium' | 'free', expiresAt }`;
  - `applySubscriber(db, userId, subscriber, now)`, which upserts or deletes the
    `source='revenuecat'` row and returns the row or null. It ignores FK
    violation `23503` (a deleted user).
- Public URLs: `POST /api/v1/billing/revenuecat` and `POST /api/v1/billing/sync`.

- [ ] **Step 1: Write the failing tests** (`billingEndpoints.test.js`, starting
      with `// @vitest-environment node`)

Mock `./supabase.js` with an in-memory fake that records `from(table).upsert/delete/select/insert`
calls, and mock `./revenuecat.js` `fetchSubscriber`. Cases:

- `webhook rejects a wrong Authorization with 401 and fetches nothing` (use
  `vi.stubEnv('RC_WEBHOOK_AUTH', 'secret-value')`);
- `webhook 503 when RC env is unset`;
- `webhook refetches each candidate user and upserts the row`: assert the
  upsert payload `{ user_id, source: 'revenuecat', expires_at, environment, … }`;
- `an already-recorded event id returns 200 without refetching`: the fake
  `billing_events` select returns a row;
- `the event row is written only after a successful refetch`: `fetchSubscriber`
  rejects, so the response is 500 and no `billing_events` insert happens;
- `no premium entitlement deletes the revenuecat row`;
- `sync requires auth, refetches the caller only, and reports the tier`;
- `sync ignores any user id in the body`: the body carries another UUID, and
  `fetchSubscriber` is called with `auth.userId` only.

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement**

```js
// webhookHandler core
const expected = process.env.RC_WEBHOOK_AUTH;
if (!expected || !process.env.RC_SECRET_API_KEY)
  return sendError(res, 'server_error', 'Billing is not configured.');
const got = req.headers?.authorization ?? '';
const a = Buffer.from(got);
const b = Buffer.from(expected);
if (a.length !== b.length || !timingSafeEqual(a, b))
  return sendError(res, 'unauthorized', 'Bad webhook authorization.');
const event = req.body?.event;
if (!event?.id || !event?.type) return sendError(res, 'bad_request', 'Malformed event.');
const db = serviceClient();
const { data: seen } = await db
  .from('billing_events')
  .select('event_id')
  .eq('event_id', event.id)
  .maybeSingle();
if (seen) return res.status(200).json({ ok: true, duplicate: true });
const ids = candidateUserIds(event);
try {
  for (const id of ids) {
    const subscriber = await fetchSubscriber(id, { apiKey: process.env.RC_SECRET_API_KEY });
    await applySubscriber(db, id, subscriber, new Date());
  }
  await db.from('billing_events').upsert(
    {
      event_id: event.id,
      user_id: ids[0] ?? null,
      type: String(event.type).slice(0, 60),
      environment: event.environment ?? null,
    },
    { onConflict: 'event_id', ignoreDuplicates: true }
  );
} catch (err) {
  console.error(JSON.stringify({ event: 'rc_webhook', outcome: 'error', type: event.type }));
  return sendError(res, 'server_error', 'Webhook processing failed.');
}
console.warn(
  JSON.stringify({
    event: 'rc_webhook',
    outcome: 'ok',
    type: event.type,
    environment: event.environment ?? null,
  })
);
return res.status(200).json({ ok: true });
```

- `syncHandler`: POST only, `requireAuth`, then a user rate limit of
  `{ scope: 'billing.sync', windowMs: 3600000, max: 10 }`, then
  `fetchSubscriber(auth.userId)`, then `applySubscriber`. It responds with
  `{ tier: row && isActive(row) ? 'premium' : 'free', expiresAt: row?.expires_at ?? null }`.
- `api/v1/billing.js` dispatches on `req.query.op` (`revenuecat` or `sync`) and
  is wrapped in `withCors`, copying `api/v1/ai.js`.
- `vercel.json` rewrites:
  `{ "source": "/api/v1/billing/revenuecat", "destination": "/api/v1/billing?op=revenuecat" }`
  and `{ "source": "/api/v1/billing/sync", "destination": "/api/v1/billing?op=sync" }`.

- [ ] **Step 4: Run and confirm they pass. Run the full `npm test` and lint.**
- [ ] **Step 5: Commit**

```bash
git add api/_lib/billingEndpoints.js api/_lib/billingEndpoints.test.js api/v1/billing.js vercel.json
git rm api/_lib/functionBudget.test.js
git commit -m "feat(billing): RevenueCat webhook and authenticated sync (Vercel Pro)"
```

**Acceptance criteria:**

- A forged webhook changes nothing.
- A duplicate is a no-op 200.
- A failed refetch makes RevenueCat retry and is never silently recorded.
- Sync only ever re-checks the caller.

**Focused tests:** `npx vitest run api/_lib/billingEndpoints.test.js`

**Manual verification:** a deployed Preview. The owner sets the env vars on
Preview temporarily, or tests on Production after B-gate. Then:

1. Use RevenueCat dashboard → Integrations → Webhooks → **Send test event**. It
   returns 200, and Vercel logs show `rc_webhook ok`.
2. `curl -X POST …/api/v1/billing/revenuecat -H 'authorization: wrong'` returns 401.

**Depends on:** B1; D5 (Pro). **Scope:** M, 5 files.

---

#### CHECKPOINT B-1 (server billing)

- [ ] Green suite, and `npm run test:rls` green locally.
- [ ] **OWNER:**
  1. Apply `20261013120000_billing_events.sql` (Management API drill, then the
     rename PR).
  2. Create the RevenueCat project, link App Store Connect and Play, create the
     `premium` entitlement, the monthly and annual products, and the `default`
     offering.
  3. Set `RC_SECRET_API_KEY` and `RC_WEBHOOK_AUTH` (Production, Sensitive).
  4. Configure the webhook URL `https://deutsch-app-dusky.vercel.app/api/v1/billing/revenuecat`
     and the same `Authorization` value.
  5. Send a test event and get a 200.

---

### Task B3: RevenueCat SDK on native

**Goal:**

- The native app can identify the purchaser, list the offering, buy, restore,
  and ask the server to sync.
- The SDK is never loaded on the web or with the flag off.
- Sign-out logs the purchaser out.

**Files:**

- Modify: `package.json` (dependency, plus `build:mobile` pinning
  `VITE_PREMIUM_ENABLED=false`), `package-lock.json`
- Create: `src/lib/purchases.js`, `src/lib/purchases.test.js`
- Modify: `src/lib/clearUserState.js`, `src/lib/clearUserState.test.js`
- Modify: `.env.example` (document `VITE_PREMIUM_ENABLED`,
  `VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY`; all public)
- Generated by `npx cap sync` (commit as-is): `ios/App/CapApp-SPM/Package.swift`,
  `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`

**Interfaces:**

- Produces:

```js
export function isPremiumPurchasable(); // native && VITE_PREMIUM_ENABLED==='true' && platform key present
export async function initPurchases(); // Purchases.configure({ apiKey }) once; no-op otherwise
export async function identifyPurchaser(userId); // Purchases.logIn({ appUserID: userId })
export async function forgetPurchaser({ timeoutMs = 3000 } = {}); // logOut; bounded; never throws
export async function loadOffering(); // → { packages: [{ id, productId, title, priceString, period }] } | null
export async function buyPackage(packageId); // → { cancelled: boolean, synced: { tier, expiresAt } | null }
export async function restorePurchases(); // → { synced }
export async function syncEntitlement(); // POST /api/v1/billing/sync via authedFetch → { tier, expiresAt } | null
export async function managementUrl(); // → string | null (customerInfo.managementURL)
```

- [ ] **Step 1: Install**

```bash
npm install @revenuecat/purchases-capacitor@^13.7.0 --legacy-peer-deps
```

- [ ] **Step 2: Write the failing tests** (`purchases.test.js`). Mock
      `@revenuecat/purchases-capacitor` with `vi.mock`, `./nativeApp.js`
      `isNativeApp`, and `./authedFetch.js`.

- web (`isNativeApp` false): `isPremiumPurchasable()` is false, and
  `initPurchases` never imports the plugin. Assert the mock factory was not
  called;
- the flag off on native: false;
- `initPurchases` configures once with the platform's key (iOS vs Android via
  `nativePlatform()` from `./pushNotifications.js`), even when called twice;
- `buyPackage` calls `purchasePackage` with the package from the offering, then
  `syncEntitlement`;
- a user cancel (`userCancelled: true`, or the plugin's cancellation error code)
  returns `{ cancelled: true }` and does **not** sync;
- `forgetPurchaser` resolves within `timeoutMs` even if `logOut` hangs, and
  never throws;
- `syncEntitlement` returns null on a non-ok response, without throwing.

`clearUserState.test.js`: sign-out calls `forgetPurchaser` before `signOut`, in
the same pre-signout step as `forgetPushDevice`.

- [ ] **Step 3: Run and confirm they fail. Implement.**
  - Load the plugin with a dynamic import:
    `const { Purchases } = await import('@revenuecat/purchases-capacitor')`,
    the same pattern as `pushNotifications.js`.
  - Read keys from `import.meta.env.VITE_REVENUECAT_IOS_KEY` /
    `VITE_REVENUECAT_ANDROID_KEY`.
  - Add `forgetPurchaser()` to `clearUserState.js` next to `forgetPushDevice()`,
    so both run together while the session still exists.
- [ ] **Step 4: Run and confirm they pass.** Run the full `npm test`, then
      `npm run build`, and confirm the web bundle does not contain the plugin
      outside a lazy chunk (`grep -l purchases-capacitor dist/assets/*.js`).
- [ ] **Step 5: Native sync and commit**

```bash
npm run build && npx cap sync
git add package.json package-lock.json src/lib/purchases.js src/lib/purchases.test.js src/lib/clearUserState.js src/lib/clearUserState.test.js .env.example ios/App/CapApp-SPM/Package.swift android/capacitor.settings.gradle android/app/capacitor.build.gradle
git commit -m "feat(billing): RevenueCat SDK on native, behind VITE_PREMIUM_ENABLED"
```

**Acceptance criteria:**

- The web build is unchanged in behaviour.
- With the flag off, the native app is unchanged.
- Sign-out logs the purchaser out without delaying sign-out by more than 3 s.

**Focused tests:** `npx vitest run src/lib/purchases.test.js src/lib/clearUserState.test.js`

**Manual verification:**

1. Build with `VITE_PREMIUM_ENABLED=true`, using the RevenueCat **sandbox** SDK
   keys, on an iOS simulator with a StoreKit configuration file. Sign in.
2. `loadOffering()` (call it from a temporary DevTools console in the Safari Web
   Inspector) returns both packages.
3. Revert any temporary code.

**Depends on:** B2. **Scope:** M, ~7 files plus generated native files.

---

### Task B4: Paywall and Settings → Premium

**Goal:** The single place Premium is sold. It meets Apple Schedule 2 and Play
disclosure (spec §4.1, §4.3): restore, manage, and links to the Terms and the
Privacy Policy.

**Files:**

- Create: `src/components/premium/PaywallSheet.jsx`, `PaywallSheet.test.jsx`
- Create: `src/components/settings/PremiumSection.jsx`, `PremiumSection.test.jsx`
- Modify: `src/components/settings/SettingsRoute.jsx` (render `PremiumSection`
  in the Account section when `isPremiumPurchasable()`)
- Modify: `src/App.jsx`:
  - open the paywall from `QuotaNote`'s new `onPremium` (passed through
    `ChatTab`);
  - call `identifyPurchaser(user.id)` when the session resolves;
  - after any purchase or restore, call `useEntitlement().refresh()`;
  - at app start, when `customerInfo` says active but the cached tier is not
    Premium, call `syncEntitlement()` once.

**Interfaces:**

- Consumes: B3, A10 (`refresh`, `tier`), A8 (`QuotaNote` `onPremium`), and
  `DAILY_LIMITS` (A1) for the "what you get" copy.
- Produces: `<PaywallSheet open onClose onPurchased />` and
  `<PremiumSection tier onOpenPaywall />`.

- [ ] **Step 1: Write the failing tests**

`PaywallSheet.test.jsx`, with `../../lib/purchases.js` mocked:

- it lists each package's `title`, `priceString` and period ("per month", "per
  year");
- the "what you get" bullets are rendered **from `DAILY_LIMITS`**, not
  hard-coded. Assert the text contains `String(DAILY_LIMITS.chat.premium)`;
- it contains "Renews automatically until cancelled", and links whose `href`
  values are `/terms` and `/privacy`;
- "Restore purchases" calls `restorePurchases`;
- a successful `buyPackage` calls `onPurchased`;
- a cancelled purchase leaves the sheet open with no error;
- `loadOffering() === null` renders "Premium isn't available right now" and no
  buy button. This is the remote kill switch (spec §12.5);
- focus is trapped and returned with `useFocusTrap` (the existing pattern),
  Escape closes, and the sheet has `role="dialog"` with `aria-modal="true"`.

`PremiumSection.test.jsx`:

- when Premium: shows "Premium active" and "Manage subscription", which opens
  `managementUrl()` through `openAuthBrowser`/`Browser.open`, the existing
  external-open helper;
- when Free: a "Get Premium" button calls `onOpenPaywall`, and "Restore
  purchases" is present.

- [ ] **Step 2: Run and confirm they fail. Implement.** Build from `ui/`
      primitives and theme tokens only. Verify at **320px and 375px** with a
      populated account. A focus ring is required on every control.
- [ ] **Step 3: Run and confirm they pass. Run the full `npm test`.**
      `npm run audit:contrast` has a `MODALS` list (BACKLOG "Known gaps"): add
      the paywall to it.
- [ ] **Step 4: Commit**

```bash
git add src/components/premium src/components/settings/PremiumSection.jsx src/components/settings/PremiumSection.test.jsx src/components/settings/SettingsRoute.jsx src/App.jsx scripts/dev/audit-contrast.mjs
git commit -m "feat(premium): paywall and Settings → Premium with restore and manage"
```

**Acceptance criteria:**

- The Schedule 2 elements are present.
- Restore exists.
- An empty offering hides buying.
- Allowances shown come from `accessPolicy`.
- The contrast audit covers the paywall.

**Focused tests:** the two test files above.

**Manual verification:** an iOS **sandbox** account on TestFlight and a Play
license tester on internal testing. On both platforms:

1. Buy monthly. Within seconds, `X-Quota-Tier: premium` appears on the next chat
   turn, the popover allows Balanced, and there are no ad buttons.
2. Cancel in the store and confirm access continues until expiry.
3. Restore on a second device signed into the same account.
4. Restore while signed into a **different** account and confirm Premium moves
   there.
5. Refund (Apple sandbox: the refund-request flow; Play: refund from the order)
   and confirm Premium ends.

Screenshot each state at 320px.

**Depends on:** B3, A8, A10. **Scope:** L, 6–7 files.

---

### Task B5: Account deletion with an active subscription

**Goal:** Meet Apple's deletion guidance (spec §4.1), and drop the RevenueCat
identity on delete.

**Files:**

- Modify: `api/_lib/accountEndpoints.js`, its test (`deleteHandler`)
- Modify: `src/components/settings/AccountSection.jsx`, its test

**Interfaces:** consumes `deleteSubscriber` (B1), `managementUrl` (B3) and the
`tier` from A10.

- [ ] **Step 1: Write the failing tests**
  - Server: after the existing successful delete, `deleteSubscriber(userId)` is
    called once when `RC_SECRET_API_KEY` is set. When `deleteSubscriber`
    rejects or returns false, the account delete still returns success. The call
    happens **after** the auth user is deleted, so a RevenueCat failure can
    never block erasure.
  - Client: when `tier === 'premium'` and the purchase came from a store (an
    entitlement row with `source === 'revenuecat'`; extend `useEntitlement` to
    expose `source` if needed), the delete confirm step first shows "Your
    subscription is billed by the App Store / Google Play and continues until
    you cancel it" with a "Manage subscription" link. Confirm stays possible.
    Apple asks you to _request_ cancellation, not to block deletion.
- [ ] **Step 2: Run and confirm they fail. Implement. Run and confirm they pass.**
- [ ] **Step 3: Commit**

```bash
git add api/_lib/accountEndpoints.js api/_lib/accountEndpoints.test.js src/components/settings/AccountSection.jsx src/components/settings/AccountSection.test.jsx
git commit -m "feat(account): subscription notice before deletion; drop the RevenueCat identity"
```

**Acceptance criteria:** the notice appears only for store-backed Premium,
deletion never depends on RevenueCat, and the processor identity is deleted on a
best-effort basis.

**Focused tests:** the two test files above.

**Manual verification:** a sandbox subscriber deletes their account. The notice
appears, the account is deleted, and the RevenueCat dashboard no longer lists
the customer.

**Depends on:** B3, B4. **Scope:** S, 4 files.

---

#### CHECKPOINT B-2 (payments complete)

- [ ] Green suite. Every §7.7 lifecycle row has been exercised by hand on both
      platforms (B4's manual list).
- [ ] Track B is shippable **without** Track C. Go to Track R for release.

---

# Track C — Rewarded ads (independent of Track B)

**[GATED: D4 = go, D5 = Vercel Pro active.]** Track C needs Track A merged and the
Track A migration applied. It does **not** need anything from Track B.

### Task C1: Ad reward intents and the grant RPC

**Files:**

- Create: `supabase/migrations/20261020120000_ad_rewards.sql`
- Create: `supabase/tests/rls/ad-rewards.test.js`

**Interfaces (Produces):**

- `create_ad_reward_intent() → uuid`, for `authenticated` only, at most 10 per
  user per UTC day;
- `grant_rewarded_ad(p_nonce uuid, p_transaction_id text, p_units integer, p_daily_cap integer) → jsonb`
  returns `{ granted, units?, reason? }` with reason
  `duplicate | unknown_nonce | cap`. It is `service_role` only.

- [ ] **Step 1: Write the failing RLS test**

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

const admin = adminClient();
const grant = (nonce, tx, cap = 2) =>
  admin.rpc('grant_rewarded_ad', {
    p_nonce: nonce,
    p_transaction_id: tx,
    p_units: 5,
    p_daily_cap: cap,
  });

let user;
beforeAll(async () => {
  user = await createSignedInUser('ads');
});

const intent = async (u = user) => (await u.client.rpc('create_ad_reward_intent')).data;

describe('rewarded grants', () => {
  it('a fresh nonce grants 5 chat units once', async () => {
    const n = await intent();
    expect((await grant(n, `tx-${n}`)).data).toEqual({ granted: true, units: 5 });
    const { data } = await user.client.from('ai_quota_grants').select('units, meter, source');
    expect(data).toContainEqual({ units: 5, meter: 'chat', source: 'rewarded_ad' });
  });

  it('same transaction twice grants once', async () => {
    const n = await intent();
    await grant(n, `tx-dup-${n}`);
    expect((await grant(n, `tx-dup-${n}`)).data).toMatchObject({
      granted: false,
      reason: 'duplicate',
    });
  });

  it('a consumed nonce cannot be reused with a new transaction', async () => {
    const n = await intent();
    await grant(n, `tx-a-${n}`);
    expect((await grant(n, `tx-b-${n}`)).data).toMatchObject({
      granted: false,
      reason: 'unknown_nonce',
    });
  });

  it('an unknown nonce grants nothing', async () => {
    expect((await grant('00000000-0000-4000-8000-000000000000', 'tx-x')).data).toMatchObject({
      reason: 'unknown_nonce',
    });
  });

  it('the daily cap holds, including under concurrency', async () => {
    const u = await createSignedInUser('ads-cap');
    const nonces = await Promise.all([1, 2, 3, 4].map(() => intent(u)));
    const results = await Promise.all(nonces.map((n) => grant(n, `tx-cap-${n}`, 2)));
    expect(results.filter((r) => r.data?.granted).length).toBe(2);
  });

  it('intents are capped at 10 per user per day', async () => {
    const u = await createSignedInUser('ads-intents');
    for (let i = 0; i < 10; i += 1) await intent(u);
    expect((await u.client.rpc('create_ad_reward_intent')).error).not.toBeNull();
  });

  it('learners cannot grant themselves', async () => {
    const n = await intent();
    expect(
      (
        await user.client.rpc('grant_rewarded_ad', {
          p_nonce: n,
          p_transaction_id: 'self',
          p_units: 50,
          p_daily_cap: 99,
        })
      ).error
    ).not.toBeNull();
    expect((await anonClient().rpc('create_ad_reward_intent')).error).not.toBeNull();
  });

  it('intents are invisible to learners', async () => {
    expect((await user.client.from('ad_reward_intents').select('*')).data ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm it fails.** Then write the migration:

```sql
-- Rewarded-ad intents and the grant RPC. Track C of
-- docs/superpowers/specs/2026-10-01-monetization-access-design.md §8.5.
-- Requires 20261006120000_ai_access_quota.sql (ai_quota_grants).
--
-- DO NOT apply this to production from an agent. (Same drill as the Track A
-- migration: Management API, then rename to the recorded version.)
--
-- The nonce exists so Google never receives our user id: the SSV callback
-- carries only this single-use, meaningless UUID.

create table public.ad_reward_intents (
  nonce uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index ad_reward_intents_user_created_idx on public.ad_reward_intents (user_id, created_at desc);

alter table public.ad_reward_intents enable row level security;
create policy "no client access" on public.ad_reward_intents
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.ad_reward_intents from anon, authenticated;
grant all on table public.ad_reward_intents to service_role;

create or replace function public.create_ad_reward_intent()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_nonce uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.ad_reward_intents i
      where i.user_id = v_uid and i.created_at >= v_today) >= 10 then
    raise exception 'too many reward intents today' using errcode = 'P0001';
  end if;
  delete from public.ad_reward_intents
  where user_id = v_uid and created_at < now() - interval '1 day';
  insert into public.ad_reward_intents (user_id) values (v_uid) returning nonce into v_nonce;
  return v_nonce;
end
$$;

create or replace function public.grant_rewarded_ad(
  p_nonce uuid, p_transaction_id text, p_units integer, p_daily_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_user uuid;
  v_count integer;
begin
  if p_transaction_id is null or char_length(p_transaction_id) not between 1 and 200 then
    raise exception 'invalid transaction id' using errcode = '22023';
  end if;
  if p_units is null or p_units not between 1 and 50 then
    raise exception 'invalid units' using errcode = '22023';
  end if;

  if exists (select 1 from public.ai_quota_grants g
             where g.source = 'rewarded_ad' and g.source_ref = p_transaction_id) then
    return jsonb_build_object('granted', false, 'reason', 'duplicate');
  end if;

  select i.user_id into v_user
  from public.ad_reward_intents i
  where i.nonce = p_nonce and i.consumed_at is null and i.created_at > now() - interval '1 hour'
  for update;
  if v_user is null then
    return jsonb_build_object('granted', false, 'reason', 'unknown_nonce');
  end if;

  -- Serialise this user's grants so two different nonces cannot both pass the cap.
  perform pg_advisory_xact_lock(hashtext('ad_reward:' || v_user::text));

  update public.ad_reward_intents set consumed_at = now() where nonce = p_nonce;

  select count(*) into v_count from public.ai_quota_grants g
  where g.user_id = v_user and g.source = 'rewarded_ad' and g.day = v_day;
  if v_count >= p_daily_cap then
    return jsonb_build_object('granted', false, 'reason', 'cap');
  end if;

  insert into public.ai_quota_grants (user_id, meter, day, units, source, source_ref)
  values (v_user, 'chat', v_day, p_units, 'rewarded_ad', p_transaction_id)
  on conflict on constraint ai_quota_grants_source_ref do nothing;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'duplicate');
  end if;

  delete from public.ai_quota_grants
  where user_id = v_user and created_at < now() - interval '30 days';

  return jsonb_build_object('granted', true, 'units', p_units);
end
$$;

revoke all on function public.create_ad_reward_intent() from public, anon;
grant execute on function public.create_ad_reward_intent() to authenticated, service_role;
revoke all on function public.grant_rewarded_ad(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.grant_rewarded_ad(uuid, text, integer, integer) to service_role;
```

- [ ] **Step 3: Run `npm run test:rls` and confirm it passes**, including the
      Track A suite.
- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261020120000_ad_rewards.sql supabase/tests/rls/ad-rewards.test.js
git commit -m "feat(db): rewarded-ad intents and grant RPC (file only)"
```

**Acceptance criteria:**

- Duplicate, reused-nonce, cap and concurrency tests all pass.
- A learner cannot grant to themselves.

**Focused tests:** `npm run test:rls -- supabase/tests/rls/ad-rewards.test.js`

**Manual verification:** local stack only.

**Depends on:** A4 (merged and applied in production before C3 goes live); D4.
**Scope:** M, 2 files.

---

### Task C2: AdMob SSV signature verifier

**Files:**

- Create: `api/_lib/admobSsv.js`, `api/_lib/admobSsv.test.js` (with
  `// @vitest-environment node`)

**Interfaces:**

```js
export const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
export function splitSignedQuery(rawQuery); // → { message, signature, keyId } | null
export function createKeyCache({ fetchImpl = fetch, now = Date.now, ttlMs = 86_400_000 } = {}); // → { get(keyId) → Promise<KeyObject | null> }
export async function verifySsv(rawQuery, keyCache); // → { ok: true, params: URLSearchParams } | { ok: false, reason }
```

- [ ] **Step 1: Write the failing test**

```js
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createKeyCache, verifySsv, splitSignedQuery } from './admobSsv.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const keysJson = { keys: [{ keyId: 3335741209, pem, base64: '' }] };
const fetchImpl = vi.fn(async () => new Response(JSON.stringify(keysJson), { status: 200 }));

function signed(message, keyId = 3335741209) {
  const sig = sign('sha256', Buffer.from(message), {
    key: privateKey,
    dsaEncoding: 'der',
  }).toString('base64url');
  return `${message}&signature=${sig}&key_id=${keyId}`;
}
const MSG =
  'ad_network=5450213213286189855&ad_unit=1234567890&custom_data=6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b&reward_amount=1&reward_item=Reward&timestamp=1507770365237823&transaction_id=18fa792de1bca816048293fc71035638';

describe('verifySsv', () => {
  it('accepts a correctly signed callback and exposes its params', async () => {
    const r = await verifySsv(signed(MSG), createKeyCache({ fetchImpl }));
    expect(r.ok).toBe(true);
    expect(r.params.get('transaction_id')).toBe('18fa792de1bca816048293fc71035638');
  });

  it('a changed parameter fails verification', async () => {
    const tampered = signed(MSG).replace('reward_amount=1', 'reward_amount=9');
    expect((await verifySsv(tampered, createKeyCache({ fetchImpl }))).ok).toBe(false);
  });

  it('an unknown key id refetches once, then fails', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(keysJson), { status: 200 }));
    const cache = createKeyCache({ fetchImpl: f });
    expect((await verifySsv(signed(MSG, 1), cache)).ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(2); // initial load + one refetch for the unknown id
  });

  it('caches keys for the TTL', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(keysJson), { status: 200 }));
    const cache = createKeyCache({ fetchImpl: f });
    await verifySsv(signed(MSG), cache);
    await verifySsv(signed(MSG), cache);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('missing signature or key_id is rejected', () => {
    expect(splitSignedQuery(MSG)).toBeNull();
    expect(splitSignedQuery(`${MSG}&signature=abc`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm it fails. Implement.**
  - The signed message is the raw query up to `&signature=`. Google documents
    `signature` and `key_id` as the last two parameters.
  - `key_id` is read from the remainder.
  - Verify with
    `verify('sha256', Buffer.from(message), { key: createPublicKey(pem), dsaEncoding: 'der' }, Buffer.from(signature, 'base64url'))`.
  - Keys load into a `Map<keyId, KeyObject>` with `loadedAt`, refreshed after
    `ttlMs` or once on a miss.
  - A key-fetch failure returns `{ ok: false, reason: 'keys_unavailable' }`, so
    the handler answers 500 and Google retries.
- [ ] **Step 3: Run and confirm it passes.**
- [ ] **Step 4: Commit**

```bash
git add api/_lib/admobSsv.js api/_lib/admobSsv.test.js
git commit -m "feat(ads): AdMob SSV ECDSA verification with a 24h key cache"
```

**Acceptance criteria:**

- A tampered parameter, an unknown key, or a missing signature all fail.
- Keys are fetched once per TTL.

**Focused tests:** `npx vitest run api/_lib/admobSsv.test.js`

**Manual verification:** step 1 of C3's manual check (the AdMob test callback).

**Depends on:** none. **Scope:** S, 2 files.

---

### Task C3: SSV endpoint

**Files:**

- Create: `api/_lib/adsEndpoints.js`, `api/_lib/adsEndpoints.test.js`
- Create: `api/v1/ads.js`
- Modify: `vercel.json` (rewrite `/api/v1/ads/ssv` → `/api/v1/ads?op=ssv`)
- Delete: `api/_lib/functionBudget.test.js` (only if B2 has not already deleted
  it, and only after D5 is confirmed)

**Interfaces:** `ssvHandler(req, res, { keyCache, db } = {})`, which consumes C1
and C2, and `REWARDED_AD` (A1).

- [ ] **Step 1: Write the failing tests.** Mock `./admobSsv.js` and
      `./supabase.js`. Cases:

| Case                                      | Expected                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Non-GET                                   | 405                                                                                                                       |
| `ADMOB_REWARDED_AD_UNITS` unset           | 503 `server_error`                                                                                                        |
| `ADS_SSV_ENABLED=false`                   | 200 `{ granted: false, reason: 'disabled' }`, and the RPC is **not** called                                               |
| Bad signature                             | 403, RPC not called                                                                                                       |
| Keys unavailable                          | 500 (Google retries)                                                                                                      |
| Valid signature, unknown `ad_unit`        | 200 `{ granted: false, reason: 'ad_unit' }`                                                                               |
| Valid signature, `custom_data` not a UUID | 200 `{ granted: false, reason: 'custom_data' }`                                                                           |
| Valid signature, all good                 | RPC called with `{ p_nonce: custom_data, p_transaction_id, p_units: 5, p_daily_cap: 2 }`, returns 200 with the RPC result |
| RPC error                                 | 500                                                                                                                       |

Also assert that the log line contains `outcome` and never the nonce or the
transaction ID.

- [ ] **Step 2: Run and confirm they fail.**
  - Implement. The raw query is `(req.url ?? '').split('?')[1] ?? ''`.
  - Do **not** rebuild the query from `req.query`: re-serialisation breaks the
    signature.
  - The `ad_unit` allowlist comes from `process.env.ADMOB_REWARDED_AD_UNITS`
    (comma-separated, trimmed). When the owner sets it, confirm the exact format
    `ad_unit` carries by using AdMob's test callback.
- [ ] **Step 3: Run and confirm they pass. Run the full `npm test`.**
- [ ] **Step 4: Commit**

```bash
git add api/_lib/adsEndpoints.js api/_lib/adsEndpoints.test.js api/v1/ads.js vercel.json
git commit -m "feat(ads): verified rewarded-ad SSV endpoint (Vercel Pro)"
```

**Acceptance criteria:** only a Google-signed callback for our unit, carrying
one of our nonces, grants anything, and every terminal outcome stops Google's
retries.

**Focused tests:** `npx vitest run api/_lib/adsEndpoints.test.js`

**Manual verification (after the owner sets env and applies C1):**

1. AdMob console → the rewarded ad unit → Server-side verification → **Verify
   URL / test callback**. The handler returns 200 with `reason: 'unknown_nonce'`,
   which is expected because the test nonce is not ours, and the log shows
   `outcome: unknown_nonce`.
2. `curl "…/api/v1/ads/ssv?ad_unit=1&signature=x&key_id=1"` returns 403.

**Depends on:** C1, C2; D5. **Scope:** M, 4–5 files.

---

#### CHECKPOINT C-1 (server ads)

- [ ] Green suite, and RLS green locally.
- [ ] **OWNER:**
  1. Apply `20261020120000_ad_rewards.sql`, then the rename PR.
  2. Create the AdMob account, the app (iOS and Android) and the rewarded units,
     with the reward set to 1 and the item "Bonus". **The server ignores the
     amount.**
  3. Set the SSV URL to `https://deutsch-app-dusky.vercel.app/api/v1/ads/ssv`.
  4. Set `ADMOB_REWARDED_AD_UNITS` on Production.
  5. Publish the GDPR message for EEA, UK and CH.
  6. Register test devices.

---

### Task C4: Client ads module — consent, eligibility, rewarded flow

**Files:**

- Modify: `package.json`, `package-lock.json`
  (`npm install @capacitor-community/admob@^8.1.0 --legacy-peer-deps`)
- Create: `src/lib/ads.js`, `src/lib/ads.test.js`

**Interfaces:**

```js
export function adsConfigured(); // native && VITE_ADS_ENABLED==='true' && rewarded unit id for this platform
export async function initAds({ testing = !import.meta.env.PROD } = {});
// → { canRequestAds, privacyOptionsRequired }. Calls AdMob.initialize({
//   tagForUnderAgeOfConsent: true, tagForChildDirectedTreatment: false,
//   maxAdContentRating: MaxAdContentRating.ParentalGuidance,
//   initializeForTesting: testing, testingDevices }), then requestConsentInfo(),
// then showConsentForm() only when status === REQUIRED && isConsentFormAvailable.
// Idempotent per launch.
export function rewardedEligibility({ tier, signedIn, online, busy, grantsToday, canRequestAds });
// → { eligible, reason }; reasons: 'premium' | 'guest' | 'offline' | 'busy' | 'cap' | 'consent' | 'not_configured'
export async function watchRewarded({ createIntent, pollGrantsToday, timeoutMs = 10_000 });
// → { granted: boolean, units?: number, reason? }
export async function showPrivacyChoices();
```

- [ ] **Step 1: Write the failing tests.** Mock `@capacitor-community/admob`,
      `./nativeApp.js` and `./pushNotifications.js` (`nativePlatform`).

- `adsConfigured()` is false on the web, false with the flag off, and true on
  native with the flag and a unit ID;
- `initAds` passes TFUA `true`, TFCD `false` and `ParentalGuidance`, and never
  calls `requestTrackingAuthorization`. **Assert that explicitly: ATT is out of
  scope (spec §9.2);**
- `initAds` shows the consent form only for `REQUIRED` with a form available,
  and returns `canRequestAds` from the consent info;
- eligibility:
  - `tier: 'premium'` → `{ eligible: false, reason: 'premium' }`;
  - `tier: null` (unknown) → not eligible. **Premium never sees ads when the
    tier is unknown;**
  - guest → `'guest'`;
  - `busy: true` → `'busy'`;
  - `grantsToday >= REWARDED_AD.dailyCap` → `'cap'`;
  - `canRequestAds: false` → `'consent'`;
- `watchRewarded`:
  - calls `createIntent()` **before** `prepareRewardVideoAd`;
  - passes `{ adId, npa: true, ssv: { customData: nonce } }` and never `userId`;
  - after `showRewardVideoAd` resolves, it polls `pollGrantsToday()` until the
    count increases, and returns `{ granted: true, units: 5 }`;
  - on timeout it returns `{ granted: false, reason: 'pending' }`;
- a no-fill load error returns `{ granted: false, reason: 'no_fill' }` and never
  throws. This is the AdMob-console kill switch path.

- [ ] **Step 2: Run and confirm they fail. Implement.** Load the plugin with a
      dynamic import. Use the unit IDs from
      `import.meta.env.VITE_ADMOB_REWARDED_IOS` / `_ANDROID`.
- [ ] **Step 3: Run and confirm they pass.** `npm run build`, then confirm the
      plugin is absent from the web entry chunk.
- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/ads.js src/lib/ads.test.js
git commit -m "feat(ads): consent-first AdMob module with server-verified rewarded flow"
```

**Acceptance criteria:**

- It is non-personalized, carries TFUA, and never requests ATT.
- An unknown or Premium tier gets no ad.
- The nonce is never the user ID.
- No-fill degrades quietly.

**Focused tests:** `npx vitest run src/lib/ads.test.js`

**Manual verification:** C5.

**Depends on:** C3, A10. **Scope:** M, 4 files.

---

### Task C5: Native AdMob configuration

**Files:**

- Modify: `ios/App/App/Info.plist`:
  - `GADApplicationIdentifier` = Google's sample iOS app ID
    `ca-app-pub-3940256099942544~1458002511` until R3 swaps in the real one;
  - `SKAdNetworkItems` with Google's `cstr6suwn9.skadnetwork` plus the list from
    the AdMob iOS quick start;
  - **no** `NSUserTrackingUsageDescription`.
- Modify: `android/app/src/main/AndroidManifest.xml`: `<meta-data
android:name="com.google.android.gms.ads.APPLICATION_ID"
android:value="ca-app-pub-3940256099942544~3347511713"/>`.
- Modify: `package.json` `build:mobile`: pin `VITE_ADS_ENABLED=false` (and keep
  `VITE_PREMIUM_ENABLED=false`).
- Modify: `.env.example`: document `VITE_ADS_ENABLED`, `VITE_ADMOB_REWARDED_IOS`
  and `VITE_ADMOB_REWARDED_ANDROID`, with Google's test unit IDs as the
  documented defaults.
- Generated by `npx cap sync`: `ios/App/CapApp-SPM/Package.swift`,
  `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`.

- [ ] **Step 1: Extend the test.** `src/lib/buildMobileScript.test.js` asserts
      `build:mobile` pins `VITE_ADS_ENABLED=false` (it already guards other
      pins). Run it and confirm it fails. Implement, then confirm it passes.
- [ ] **Step 2: Native build check.** Run `npm run build && npx cap sync`, then
      build in Xcode and Android Studio. The app launches with **no crash at
      start**. On Android, a missing `APPLICATION_ID` crashes Google Mobile Ads
      at start, which is exactly what this step checks.
- [ ] **Step 3: Commit**

```bash
git add ios/App/App/Info.plist android/app/src/main/AndroidManifest.xml package.json .env.example src/lib/buildMobileScript.test.js ios/App/CapApp-SPM/Package.swift android/capacitor.settings.gradle android/app/capacitor.build.gradle
git commit -m "chore(native): AdMob app ids (Google sample ids) and SKAdNetwork; ads pinned off"
```

**Acceptance criteria:**

- Both apps start with ads pinned off and with them on (test IDs).
- There is no ATT usage string.

**Focused tests:** `npx vitest run src/lib/buildMobileScript.test.js`

**Manual verification:** both apps launch on device, and Xcode shows no
`GADInvalidInitializationException`.

**Depends on:** C4. **Scope:** S, 4 files plus generated native files.

---

### Task C6: The rewarded entry and Privacy choices

**Files:**

- Modify: `src/components/chat/QuotaNote.jsx`, its test (render the ad button
  when `onRewarded` is passed and eligible)
- Create: `src/components/settings/PrivacyChoicesRow.jsx`, its test
- Modify: `src/components/settings/SettingsRoute.jsx` (System section: render
  the row when `privacyOptionsRequired`)
- Modify: `src/components/ChatTab.jsx` (new `onBusyChange` prop, called when a
  turn starts and settles)
- Modify: `src/App.jsx`:
  - call `initAds()` once per launch when `adsConfigured()` and signed in;
  - pass `onRewarded` to `ChatTab` → `QuotaNote` **only** when
    `rewardedEligibility(...)` is eligible;
  - `pollGrantsToday` = a supabase-js select on `ai_quota_grants`
    (`source = 'rewarded_ad'`, `day = today UTC`), the learner's own rows only;
  - `busy` = a chat request in flight, or `trialWallUp`, or a celebration
    (`toasts.length > 0` or `streakBurst`), or placement or onboarding open.
    These are the same signals App already uses to hold the trial wall back.
    ChatTab reports its in-flight state up through a new
    `onBusyChange(boolean)` prop.

**Interfaces:** consumes C4 and A8.

- [ ] **Step 1: Write the failing tests**

`QuotaNote`:

- with `onRewarded` and `error.rewardedEligible`, it shows "Watch a short ad for
  +5". Clicking it calls `onRewarded`, and the button is disabled while pending;
- on `{ granted: true }` the note shows "+5 added" and offers "Continue";
- on `{ reason: 'pending' }` it shows "Your bonus will appear shortly";
- on `cap` or `no_fill` the button disappears with a calm line ("No ad available
  right now").

`PrivacyChoicesRow`: a labelled button ("Privacy choices") that calls
`showPrivacyChoices`, and is absent when not required.

App-level, in `App.test.jsx` with the ads module mocked:

- **Premium never gets `onRewarded`;**
- **the web never calls `initAds`;**
- **a guest never calls `initAds`.**

- [ ] **Step 2: Run and confirm they fail. Implement. Run and confirm they pass.**
      Verify at 320px and 375px. Add the rewarded state of `QuotaNote` to the
      contrast audit's driven surfaces, or record the gap in BACKLOG "Known gaps"
      if it cannot be driven without a native runtime.
- [ ] **Step 3: Commit**

```bash
git add src/components/chat/QuotaNote.jsx src/components/chat/QuotaNote.test.jsx src/components/settings/PrivacyChoicesRow.jsx src/components/settings/PrivacyChoicesRow.test.jsx src/components/settings/SettingsRoute.jsx src/components/ChatTab.jsx src/App.jsx src/App.test.jsx
git commit -m "feat(ads): opt-in rewarded entry in the quota note; Settings → Privacy choices"
```

**Acceptance criteria:**

- The only ad entry point is the exhausted-chat note.
- Premium, guests and the web never initialise ads.
- Privacy choices is reachable when UMP requires it.

**Focused tests:** the test files above.

**Manual verification:** an Android internal-testing build with
`VITE_ADS_ENABLED=true` and test IDs, on a registered test device, signed in as
Free with UMP debug geography EEA.

1. The consent form appears on first launch.
2. Exhaust chat, tap "Watch a short ad", and a test rewarded ad plays.
3. Within ~10 s you see "+5 added", and the next five turns work.
4. The third ad of the day is not offered.
5. Grant Premium manually. There is no ad button, and no ad SDK traffic after a
   relaunch.

Repeat on iOS. Record a screen capture for the PR.

**Depends on:** C4, C5, A8, A10. **Scope:** M, 8 files (small edits in four of them).

---

#### CHECKPOINT C-2 (ads complete)

- [ ] Green suite. The manual matrix above has passed on both platforms with
      test ads.
- [ ] Track C is shippable **without** Track B. Go to Track R.

---

# Track R — Legal, store and release (last)

### Task R1: Legal copy L1–L5 and version bumps

**Owner-supplied text only.** The agent pastes the approved copy verbatim and
pins it in tests, exactly as the 2026-09-29 legal work did.

**Files:**

- Modify: `src/components/legal/PrivacyPolicy.jsx`, its test
- Modify: `src/components/legal/TermsOfService.jsx`, its test
- Modify: `src/components/legal/DeleteAccountPage.jsx`, its test (L5)
- Modify: `src/lib/legalVersions.js` (bump per spec §9.5's batching: L1 with no
  bump if the owner agrees; L2+L4+L5 as one bump at the Premium release; L3 with
  the ads release)

- [ ] **Step 1:** Write tests pinning each approved sentence. The existing tests
      already assert copy; extend them. Run them and confirm they fail.
- [ ] **Step 2:** Paste the copy and bump the version(s). Run and confirm they
      pass.
- [ ] **Step 3: Commit**

```bash
git add src/components/legal src/lib/legalVersions.js
git commit -m "docs(legal): owner-approved purchase/ads/usage-limit copy; version bump"
```

**Acceptance criteria:**

- The copy matches the owner's text byte for byte.
- The re-acceptance gate fires for a version bump. The existing
  `useLegalAcceptance` tests cover this; run them.

**Focused tests:** `npx vitest run src/components/legal src/lib/legalAcceptance.test.js`

**Manual verification:** `/privacy`, `/terms` and `/delete-account` render at
320px, and a signed-in learner sees the acceptance gate after a bump.

**Depends on:** the owner's text, and the release it ships with.
**Scope:** S, 7 files.

---

### Task R2: Monetization runbook and store disclosures

**Files:**

- Create: `docs/MONETIZATION_SETUP.md`. The owner runbook, in order:
  1. Vercel Pro.
  2. Anthropic spend limit.
  3. The Track A migration and `AI_QUOTA_MODE`.
  4. The shadow-week SQL. Write these queries out in full:
     - **cost by day, tier, meter and model**:
       `select day, tier, meter, model, calls, input_tokens, output_tokens from ai_cost_daily order by day desc`,
       with a price table from spec §4.9 to multiply;
     - **average tokens per call**: `input_tokens / calls`;
     - **would-deny rate**: from the `quota_would_deny` log count against
       `calls`.
  5. RevenueCat, App Store Connect and Play product setup: product IDs, the
     subscription group, the Paid Apps agreement, tax and banking.
  6. AdMob setup: units, SSV URL, the GDPR message, test devices.
  7. Every env var from spec §12.1, with its scope.
  8. Sandbox testers.
  9. The kill-switch table (spec §12.5).
  10. The weekly metrics routine (spec §12.6).
- Modify: `docs/STORE_SUBMISSION_CHECKLIST.md`:
  - add rows for Purchases (RevenueCat) and AdMob data types;
  - "Contains ads";
  - the age-rating questionnaire (Advertising: yes);
  - subscription metadata (Schedule 2, Terms link);
  - App Review notes ("Premium requires an account; sandbox purchases are
    honoured").
- Modify: `docs/BACKLOG.md`: move "Monetization" from Blocked to In progress or
  shipped, as the tracks land.

- [ ] **Step 1:** Write the docs. Every command and query must run as written.
      Run each SQL against the **local** stack to prove the syntax.
- [ ] **Step 2:** `npx prettier --write` the touched docs, then
      `npx prettier --check docs/MONETIZATION_SETUP.md docs/STORE_SUBMISSION_CHECKLIST.md docs/BACKLOG.md`.
- [ ] **Step 3: Commit**

```bash
git add docs/MONETIZATION_SETUP.md docs/STORE_SUBMISSION_CHECKLIST.md docs/BACKLOG.md
git commit -m "docs(monetization): owner runbook, store disclosures, backlog truth"
```

**Acceptance criteria:**

- Every owner action in spec §17 has a numbered, executable step.
- Every SQL query parses on the local stack.

**Focused tests:** `npx prettier --check` on the three files.

**Manual verification:** a second reader (the owner) can follow the runbook
start to finish without asking a question. Record any question as a doc fix.

**Depends on:** the tracks being released. **Scope:** S, 3 files.

---

### Task R3: Release QA and staged rollout (owner-run; the agent verifies)

**No code.** This is the last step for each track.

- [ ] **Premium release (Stage B1).**
  1. TestFlight and Play internal testing with real product IDs and sandbox
     testers.
  2. Run B4's manual lifecycle list on both platforms. Record
     pass/fail per row in the PR or issue.
  3. Swap the build flags: `build:mobile` gets `VITE_PREMIUM_ENABLED=true`.
     **Land this as its own one-line PR.**
  4. Submit with Review notes.
  5. Use App Store phased release (7 days) and Play staged rollout
     10% → 50% → 100%.
  6. Watch RevenueCat events, `rc_webhook` logs and support mail for 48 h at each
     step.
- [ ] **Ads release (Stage C1).**
  1. Swap Google's sample app IDs for the real AdMob app IDs in
     `Info.plist`/`AndroidManifest.xml`, and the test unit IDs for the real ones
     in the build env.
  2. Run the C6 manual matrix once with the real units on a **registered test
     device** (test mode). Never click a live ad.
  3. `VITE_ADS_ENABLED=true` in `build:mobile`, as its own PR.
  4. Re-answer the store questionnaires (R2).
  5. Play staged rollout 10% → 100%, App Store phased release.
- [ ] **Agent verification after each stage:** the agent confirms:
  - Migration Drift is green;
  - `ai_cost_daily` totals for the past 7 days are within ±10% of the Anthropic
    Console;
  - there are no `quota_store_degraded` lines outside known incidents;
  - RevenueCat `SANDBOX` grants are excluded from revenue metrics.

  It reports the result to the owner with numbers.

- [ ] **Rollback:** see spec §12.5. Each switch is remote or redeploy-only. A bad
      native build is halted through phased-release pause or staged-rollout
      halt.

---

## Owner-only actions (consolidated; agents must never perform these)

| When                   | Action                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Before any track       | Answer D1–D5 (spec §16)                                                                                                |
| Checkpoint A-2         | Apply `20261006120000_ai_access_quota.sql` (Management API drill, then the rename PR)                                  |
| Checkpoint A-3         | Anthropic spend limit and alerts, L1 wording, `AI_QUOTA_MODE=shadow`, then the numbers PR, then `enforce`              |
| Before B2 or C3 merges | **Vercel Pro**                                                                                                         |
| Checkpoint B-1         | Apply `20261013120000_billing_events.sql`, the RevenueCat project, products and offering, the webhook, `RC_*` env vars |
| Checkpoint C-1         | Apply `20261020120000_ad_rewards.sql`, the AdMob account and units, the SSV URL, the GDPR message, `ADMOB_*` env vars  |
| R1                     | Supply and approve legal copy L1–L5, plus counsel review                                                               |
| R3                     | Store submissions, questionnaires, phased and staged rollouts, real-card refund test                                   |

**Agents never** run `supabase db push`, `migration repair`, `db reset` or
`db pull` against the linked project, call MCP `apply_migration` or write
`execute_sql`, use the SQL editor, set Vercel env vars, or touch the store,
RevenueCat or AdMob consoles.

## Proposed PR sequence

1. `docs/monetization-access-design` (this spec and plan, plus BACKLOG).
2. A1 + A2 + A3: identity and clamp.
3. A4 + A5 + A6: migration file, quota service, envelope.
4. A7: enforcement in the handler.
5. A8 + A9: quota UX.
6. A10: client tier.
7. Owner: migration, shadow, numbers PR, enforce.
8. B1 + B2: server billing (after Pro).
9. B3: SDK.
10. B4 + B5: paywall, settings, deletion.
11. R1 (L2/L4/L5) + R2.
12. R3 Premium release.
13. C1 + C2 + C3: server ads.
14. C4 + C5: client module and native config.
15. C6: entry and Privacy choices.
16. R1 (L3).
17. R3 ads release.

Tracks B and C may swap order or run in parallel after step 7.
