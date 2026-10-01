# Monetization, premium access, trial limits and in-app advertising — design

**Status:** DRAFT for owner approval. Planning only. No application code, SDK,
migration, environment variable or production resource was changed while
writing this. Five decisions in §16 need an explicit answer before any track
starts. The legal copy (§9.5) is approved separately, as owner-supplied text.

Audit taken against `origin/main` at `95f54865` (2026-10-01).
Plan: `docs/superpowers/plans/2026-10-01-monetization-access.md`.
Platform rules were read from primary sources on **2026-10-01** (§19). They
change often, so re-check every row of §4 before store submission.

---

## 1. Intent

**Goal.** Give the app a sustainable cost and revenue model:

- server-enforced AI allowances that bound what any caller can spend;
- an optional paid **Premium** subscription on iOS and Android;
- an optional, opt-in advertising lane on the native apps.

The free learning loop, the guest trial, the AI tutor and gamification keep
working as they do today.

**Constraints (stated in the brief).**

- No client-only enforcement.
- The AI tutor and gamification are not redesigned.
- Payments and advertising must be able to ship independently.
- Agents never apply migrations.
- QA and store release come last.

**Success criteria.**

1. No caller can make the server spend more than a known daily amount on AI.
   That holds for a guest, a free account, a Premium account, a tampered client
   or a script. The amount is computable from §6.10.
2. Premium status is decided on the server, from the purchase provider. A client
   that claims Premium gets nothing it did not pay for.
3. A refund, revocation or expiry removes Premium without anyone acting by hand.
4. Premium users never see an ad.
5. No ad appears while a learner is answering, mid-conversation, in placement
   or during onboarding.
6. Each of the three tracks (quotas, payments, ads) can be switched off without a
   new app build (§12.5).

**Non-goals.**

- Web billing in the MVP (§7.9).
- Selling tokens or any consumable.
- "Save your streak" for an ad or a payment (§8.6).
- Personalized ads.
- Ads on the web.
- League or XP advantages for payers.
- A remote-config service.
- A client analytics SDK.

---

## 2. Premise check — the brief against the code

Every "current fact" the brief listed was verified, not assumed.

| #   | Brief says                                     | Verdict                            | Evidence and nuance                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Guest Trial Wall exists, derived from activity | **True**                           | `src/lib/trial.js` derives `exhausted` from the daily log, with no storage key of its own. The "designed peak" is all four practice tabs sampled **and** a first daily goal (`TRIAL_REQUIRES`). **It is client-only:** clearing site data resets it. It works as a conversion nudge. It cannot enforce anything.                                                       |
| P2  | Backstop is 60 rounds                          | **True**                           | `TRIAL_ROUND_CAP = 60` in `src/lib/gameConfig.js:15`. The designed peak usually fires first.                                                                                                                                                                                                                                                                           |
| P3  | Wall requires an account, not payment          | **True**                           | `TrialWall.jsx` offers Google / GitHub / "Create a free account" / "I already have an account". It cannot be dismissed. Stats stays reachable.                                                                                                                                                                                                                         |
| P4  | AI routes have endpoint-specific rate limits   | **True, with three gaps**          | `api/_lib/aiEndpoints.js`: chat 20/5 min, deck 5/h, grade 60/5 min. (a) The key is **IP only**: `callClaude` sends no bearer token, so the server cannot tell who is calling. (b) The limiter **fails open** on store errors (`ratelimit.js:84`). (c) These are abuse limits over short windows. Nothing bounds a day.                                                 |
| P5  | Supabase token balance and ledger exist        | **True**                           | `20260923120000_token_economy.sql`: a starting grant of 5000, `award_tokens` (daily quest, 10 tokens, 3 per UTC day), and `spend_tokens`, which **nothing calls**. The tokens are not money and are not tied to AI.                                                                                                                                                    |
| P6  | No entitlement/subscription system, no ad SDK  | **True, plus one stub**            | No store plugin and no ad SDK in `package.json`. `userTierOf()` (`src/lib/ai-routing/preference.js:38`) reads `user.tier` / `user.plan`, which nothing ever sets, so `'pro'` is unreachable.                                                                                                                                                                           |
| F1  | (not in brief) Model tier ceiling              | **Client-only**                    | Guest → Haiku, signed-in → up to Sonnet, Pro → Opus: this ceiling exists only in the client router. `api/_lib/validate.js` accepts **all three models from any anonymous caller**. A `curl` can ask for the most expensive model at the IP rate limit.                                                                                                                 |
| F2  | (not in brief) Model catalog health            | **Broken / about to break**        | `claude-opus-4-1` (the "Capable" choice) was **retired 2026-08-05**. `claude-sonnet-4-5` was **deprecated 2026-09-30 and retires 2026-11-30**. Signed-in chat routes to Sonnet today, so it stops working on 2026-11-30 unless the catalog moves. This is out of scope here and filed as an urgent BACKLOG item (§18). It also caps what Premium can honestly promise. |
| F3  | (not in brief) Hosting plan                    | **Blocks revenue**                 | Vercel Hobby is "restricted to non-commercial personal use only". Payment processing **and** "the inclusion of advertisements" are named as commercial (§4.8). **Vercel Pro is mandatory before any purchase or ad goes live.** Pro also lifts the function cap: Hobby is framework-dependent and this repo hits 12, Pro is unlimited.                                 |
| F4  | (not in brief) Function budget                 | **12 / 12 used**                   | `api/_lib/functionBudget.test.js` guards the Hobby cap. Track A adds **no** function. Tracks B and C each add one, which is why they are gated on Pro (F3).                                                                                                                                                                                                            |
| F5  | (not in brief) Privacy Policy                  | **Contradicts the plan**           | The approved policy says "We do not sell your data or use it for targeted advertising". That stays true with non-personalized ads. It also says usage limits record "your IP address (for AI features)", which becomes false the moment AI quotas key on accounts. It names no purchase processor and no ad network. See §9.5.                                         |
| F6  | (not in brief) Native build                    | **SPM, Capacitor 8.5.2**           | iOS uses Swift Package Manager (`ios/App/CapApp-SPM/Package.swift`, iOS 15). Android uses minSdk 24 and compileSdk 36. Every candidate plugin ships a `Package.swift` (§4.6). The Google Mobile Ads SDK needs minSdk ≥ 24, compileSdk ≥ 35 and iOS ≥ 13. Both platforms meet that.                                                                                     |
| F7  | (not in brief) Who is tier-sensitive           | **Only chat**                      | `TypingExercise`, `generateSentences` and `VocabTab` hard-code `userTier: 'guest'`, so grading, sentence generation and deck generation always run on Haiku. Only `ChatTab` passes the learner's tier.                                                                                                                                                                 |
| F8  | (not in brief) Minimum age                     | **13**                             | Terms of Service §1: "You must be at least 13 years old". Nothing collects age.                                                                                                                                                                                                                                                                                        |
| F9  | (not in brief) Failed grading                  | **Shows "wrong", records nothing** | `TypingExercise` turns any AI error into a "wrong" panel that reads "check your connection", but it does not call `recordEvent`. If quota exhaustion takes this path, the learner is told they are wrong and offline when neither is true. Track A fixes the copy (§6.9).                                                                                              |

---

## 3. Current architecture in one paragraph

The app is local-first. Practice, SRS, streaks, quests and freezes are computed
from the localStorage state blob, and freezes are derived, never stored. Signed-in
learners sync through `/api/v1/progress`. The server writes `stats_daily` and
derives league weekly XP from progress events. The AI lane is one Vercel function
(`api/v1/ai.js`). It dispatches `chat` / `grade` / `deck`, applies origin and IP
rate limits, validates the body against the model catalog, and forwards to
Anthropic. Identity on the server comes from `requireAuth()` (`auth.getUser`),
which today only the account, progress, league, social and admin lanes call.
Supabase RLS guards user tables, and server-only tables carry deny-all policies.

---

## 4. Platform requirements (primary sources, read 2026-10-01)

### 4.1 Apple App Store Review Guidelines

- **3.1.1:** "If you want to unlock features or functionality within your app
  … you must use in-app purchase." This covers premium AI allowances and the
  removal of ads. Also: "you should make sure you have a restore mechanism for
  any restorable in-app purchases."
- **3.1.2(a):** auto-renewable subscriptions "must provide ongoing value", last
  at least seven days, and be "available across all of the user's devices".
  Free trials are configured in App Store Connect.
- **3.1.2(c):** "Before asking a customer to subscribe, you should clearly
  describe what the user will get for the price" and meet **Schedule 2**: title,
  length, price, and links to Terms and Privacy at the point of purchase.
- **3.1.3(b) Multiplatform services:** users may access subscriptions acquired
  elsewhere "provided those items are also available as in-app purchases within
  the app". A later web purchase is therefore allowed, as long as the same
  product exists as IAP.
- **3.1.1(a):** in the **United States storefront**, buttons and external links
  to other purchase methods are allowed without an entitlement. That matters only
  if web billing ever ships.
- **2.5.18 Advertising:**
  - ads must suit the app's age rating;
  - users must be able to see the targeting information;
  - no targeting on sensitive data;
  - interstitials must clearly be ads and have an easily accessible close/skip.
- **3.2.2(x):** apps "may otherwise incentivize users to take specific actions
  within apps (e.g. … watching an ad)". **Rewarded ads are allowed.**
- **5.1.1(v):** apps without significant account-based features must work
  without login. Account deletion is mandatory. This app already meets both.
- **5.1.2:** sharing personal data needs permission, "including with
  third-party AI" (already covered by the legal-consent work). **Tracking needs
  ATT permission.** An app "may not require users to enable system
  functionalities (e.g. … tracking) … or receive monetary or other
  compensation". **A rewarded grant must never depend on the ATT answer.**
- **Account deletion with a subscription:** "notify them that their billing will
  continue through Apple and request that they cancel their subscription before
  continuing". Use `showManageSubscriptions` or
  `https://apps.apple.com/account/subscriptions`.
- **Age ratings:** the questionnaire now asks about **advertising** and
  user-generated content. Ratings are 4+, 9+, 13+, 16+ and 18+.
- **Commission:** the Small Business Program charges 15% (≤ USD 1M proceeds in
  the prior year).

### 4.2 Apple ATT ("User Privacy and Data Use")

- Tracking means linking data from this app with other companies' data "for
  targeted advertising or advertising measurement purposes". Sharing with data
  brokers also counts.
- Without permission the IDFA is all zeros. An app may not use a different
  identifier to track instead.
- An explanation before the system prompt is allowed. Gating or incentivising
  the ATT answer is **prohibited**.
- **Consequence for this design:** if the app never tracks, it never shows the
  ATT prompt, and that is the MVP (§9.2).

### 4.3 Google Play Payments policy and billing

- Play Billing is required for digital features, **including "an ad-free version
  of an app or new features"**.
- Steering users to other payment methods is prohibited outside the enrolled
  programs. Since the March 2026 settlement there is a **US external content
  links program**, and service fees for it apply from 2026-10-01.
- Subscriptions must disclose price, billing cycle and renewal terms. They must
  give "sustained or recurring value", not a one-time benefit.
- **Fees** (effective 2026-06-30 for the US, EEA and UK; see the June 2026 Play
  announcement):
  - auto-renewing subscriptions: **10% service fee + 5% Play billing fee**;
  - first USD 1M on new installs: 10% + 5%;
  - other markets: 15% on the first USD 1M until the rollout reaches them.
- A purchase must be **acknowledged within three days**, or it is refunded and
  the entitlement revoked. Google "strongly recommend[s]" verifying purchases on
  a secure backend.
- `obfuscatedAccountId` binds a purchase to the app's user.
- **Billing Library 8+** has been required for new apps and updates since
  2026-08-31.
- **RTDN** arrives over Cloud Pub/Sub and carries only a token. The backend must
  call `purchases.subscriptionsv2.get`.

### 4.4 Google Play Ads and Families

- Interstitials "that show unexpectedly" are disallowed, including "at the
  beginning of a level or during the beginning of a content segment".
- Full-screen ads must be closeable after **15 seconds**. Opted-in rewarded ads
  are exempt.
- The **Families policy does not apply to apps that target 13+ only.** A
  mixed-audience app would need a neutral age screen and Families
  Self-Certified Ads SDKs. Our Terms say 13+.

### 4.5 Google AdMob, UMP and GDPR

- EEA, UK and Switzerland users need a Google-certified CMP. **The UMP SDK is
  IAB TCF v2.3 certified.**
- Without TCF Purpose 1 consent, **limited ads** serve: no personalization, no
  frequency capping, IP used only for delivery.
- UMP calls:
  - `requestConsentInfoUpdate` on **every launch**;
  - `loadAndShowConsentFormIfRequired`;
  - `canRequestAds()` before any ad request (it is false until the update runs);
  - a **privacy-options entry point** when `getPrivacyOptionsRequirementStatus`
    says it is required.
- Request tags:
  - **TFUA** (`tagForUnderAgeOfConsent`) disables personalized ads **and**
    third-party ad vendors;
  - **TFCD** handles COPPA child-directed treatment, and wins if both are set;
  - `maxAdContentRating` takes G / PG / T / MA.
- **Rewarded SSV:**
  - Google calls our URL with `ad_network, ad_unit, custom_data, key_id,
reward_amount, reward_item, signature, timestamp, transaction_id` (plus
    `user_id` when set);
  - the signature is **ECDSA / SHA-256** over every parameter except
    `signature` and `key_id`;
  - keys come from `gstatic.com/admob/reward/verifier-keys.json`, cached
    ≤ 24 h;
  - a failed callback is retried up to five times at one-second intervals;
  - callbacks may arrive after the ad closes.
- **Data the SDK collects** (Play disclosure guidance): IP address (approximate
  location), product interactions, diagnostics, and device or account
  identifiers (advertising ID, app set ID).
- **Test IDs:**

  | Platform | Rewarded                                 | Sample app ID                            |
  | -------- | ---------------------------------------- | ---------------------------------------- |
  | Android  | `ca-app-pub-3940256099942544/5224354917` | `ca-app-pub-3940256099942544~3347511713` |
  | iOS      | `ca-app-pub-3940256099942544/1712485313` | `ca-app-pub-3940256099942544~1458002511` |

  Clicking live ads without test mode risks the AdMob account.

### 4.6 Capacitor 8 plugins (npm registry and GitHub, 2026-10-01)

| Package                           | Version | Peer / SPM                                                 | Wraps                                                        | Maintenance                                                  |
| --------------------------------- | ------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `@revenuecat/purchases-capacitor` | 13.7.0  | `@capacitor/core >=8.0.0`, ships `Package.swift`           | `purchases-hybrid-common` 19.5.0 (StoreKit 2 + Play Billing) | Published 2026-10-01. Repo pushed 2026-10-01; 20 open issues |
| `@capacitor-community/admob`      | 8.1.0   | depends on `@capacitor/core ^8.0.0`, ships `Package.swift` | GMA iOS 13.6.0 + UMP 3.1.x; `play-services-ads` + UMP        | Repo pushed 2026-10-01; 41 open issues                       |
| `@capgo/native-purchases`         | 8.8.1   | `>=8.0.0`, ships `Package.swift`                           | StoreKit 2 / Play Billing directly                           | Published 2026-09-22                                         |
| `cordova-plugin-purchase`         | 13.18.0 | Cordova plugin, no Capacitor peer                          | StoreKit / Play Billing                                      | Published 2026-07-16                                         |

The AdMob plugin exposes:

- `initialize({ tagForUnderAgeOfConsent, tagForChildDirectedTreatment,
maxAdContentRating, initializeForTesting, testingDevices })`;
- `requestConsentInfo` / `showConsentForm` / `showPrivacyOptionsForm`;
- `requestTrackingAuthorization`, which we **do not call**;
- rewarded `ssv: { userId | customData }`;
- a per-request `npa` flag.

### 4.7 RevenueCat

- **Free up to USD 2,500 monthly tracked revenue, then 1%.** Webhooks and the
  REST API are included.
- **Webhooks:**
  - authenticated by a configured `Authorization` header value, with optional
    HMAC;
  - must answer `200` within 60 s;
  - retried 5× (5, 10, 20, 40, 80 min);
  - events carry `id` and `environment` (`SANDBOX` / `PRODUCTION`).
  - RevenueCat **recommends calling `GET /subscribers` after any webhook**
    instead of interpreting each event type.
- **App user IDs:** use a non-guessable UUID, never an email. `logIn` merges
  the anonymous purchaser into the custom ID.
- **Subscriber fields:** `entitlements.<id>.expires_date` /
  `grace_period_expires_date`, and per subscription `unsubscribe_detected_at`,
  `billing_issues_detected_at`, `refunded_at`, `is_sandbox`, `store`.

### 4.8 Vercel

- **Fair use: "Hobby teams are restricted to non-commercial personal use only."**
- Commercial use includes "any method of requesting or processing payment" and
  "the inclusion of advertisements". Donations are exempt.
- Functions per deployment: Hobby is framework-dependent (this repo hits 12),
  Pro is unlimited.

### 4.9 Anthropic (cost inputs)

Base price per million tokens, input / output:

| Model      | Price     | Status                                |
| ---------- | --------- | ------------------------------------- |
| Haiku 4.5  | $1 / $5   | Active, not retired before 2026-10-15 |
| Sonnet 4.5 | $3 / $15  | Deprecated, retires 2026-11-30        |
| Sonnet 5.5 | $2 / $10  | The named replacement for Sonnet 4.5  |
| Opus 4.1   | $15 / $75 | Retired 2026-08-05                    |
| Opus 4.8   | $5 / $25  | The named replacement for Opus 4.1    |

A prompt-cache read costs 0.1× input.

---

## 5. Access tiers

| Tier        | Who                                             | How the server knows                                                                  |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Guest**   | No session. Web, PWA or native.                 | No `Authorization` header. Keyed by client IP, as today.                              |
| **Free**    | Signed-in account without an active entitlement | A verified JWT (`auth.getUser`) and no active `entitlements` row.                     |
| **Premium** | Signed-in account with an active entitlement    | A verified JWT **and** an `entitlements` row with `expires_at` null or in the future. |

**There is no separate ad-supported tier.** Ads are a property of the **Free tier
on native builds** when the ads track is on (§8.1). A separate tier would add a
fourth row to every table below and buy nothing: the only extra thing ads unlock
is a bounded allowance top-up, which is just a grant against the Free tier.

**Premium never sees ads.** Premium has no free trial in the MVP unless the owner
picks one under D3. Store introductory offers are configured in the store
consoles, and RevenueCat represents them as an active entitlement, so no code
changes.

**Naming.** The product name is **Premium**. The router's existing ceiling key
`'pro'` (`src/lib/ai-routing/catalog.js` `TIERS`) stays as it is, and one mapping
function translates between them (`premium → 'pro'`). Renaming the router key
would touch the catalog, router and preference modules and their tests for no
behavioural change.

---

## 6. Entitlement matrix and usage enforcement

### 6.1 The matrix

Allowances are **per UTC day** (§6.5). Numbers in _italics_ are starting values
that Phase A's shadow week (§12.4) replaces with measured ones before
enforcement turns on.

| Capability                                                               | Guest                                        | Free (signed in)                                                                       | Premium                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Non-AI practice: vocab MC, alphabet, A1 tiles, A2 blanks, SRS, placement | Until the trial wall, which is **unchanged** | Unlimited                                                                              | Unlimited                                                                                     |
| **AI tutor chat** (units/day)                                            | _10_ units, Fast model only                  | _20_ units, Fast only (D2), **+5 per verified rewarded ad, ≤ 2 ads/day**               | _150_ units. Fast costs 1 unit/turn, Balanced 3 (Capable 5 once the catalog has a live model) |
| Tutor model choice                                                       | Fast                                         | Fast (D2: or Balanced at 3 units/turn)                                                 | Fast, Balanced (Capable after the catalog refresh)                                            |
| **AI grading + sentence generation** (calls/day)                         | _40_                                         | _150_                                                                                  | _300_                                                                                         |
| **Custom deck generation** (generations/day)                             | _1_                                          | _3_                                                                                    | _15_                                                                                          |
| Custom decks held                                                        | 8 (`MAX_CUSTOM_DECKS`, unchanged)            | 8                                                                                      | 8: a legibility limit, not a cost, so not a selling point                                     |
| Streaks, freezes, streak multiplier, quests, achievements                | As today                                     | As today                                                                               | **Identical**: no paid freezes, no paid repair                                                |
| Leagues                                                                  | Need an account (as today)                   | Yes                                                                                    | **Identical**: no XP boost, no league advantage                                               |
| Level XP multiplier (`xpEntitlement.js`)                                 | No (as today)                                | Yes                                                                                    | Yes (same)                                                                                    |
| Tokens                                                                   | —                                            | Quest awards as today                                                                  | Same. **Tokens are never sold or spent on AI.**                                               |
| **Ads**                                                                  | None                                         | Native only, opt-in rewarded (MVP). Interstitial and banner later, behind flags (§8.2) | **Never**                                                                                     |
| Sync, profile, push                                                      | —                                            | As today                                                                               | As today                                                                                      |
| **Offline**                                                              | Non-AI practice works, AI unavailable        | Same                                                                                   | Same. The Premium badge reads from the cached entitlement (§7.8)                              |

Why it is cut this way:

- **AI is the only meaningful marginal cost.** Practice, sync and leagues cost
  close to nothing per learner, so gating them would earn little and damage
  the core loop and the brand ("Accounts are optional", "Motivation without
  pressure").
- **Premium sells more of the expensive thing** (tutor turns and stronger
  models) plus no ads. It never sells progress. A paid learner and a free
  learner on the same league ladder compete on practice alone, which keeps the
  store listing's "League XP comes only from graded practice" true.

### 6.2 Two different controls

| Control                       | Purpose                                               | Window                | Keyed by                                               | On store failure                                                 | Lives in                     |
| ----------------------------- | ----------------------------------------------------- | --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------- |
| **Abuse rate limit** (exists) | Burst and flood protection; garbage costs quota       | Minutes (5 min / 1 h) | `user:<id>` when signed in (**new**), else `ip:<addr>` | **Fail open** (unchanged, B1 decision: availability first)       | `api/_lib/ratelimit.js`      |
| **Product quota** (new)       | Bounds what the product gives away; the billable unit | UTC day               | `u:<uuid>` or `ip:<addr>`, plus a per-tier pool        | **Degraded mode**: in-memory guest allowance for everyone (§6.8) | `consume_ai_quota` RPC (§10) |

The abuse limiter runs first, so a flood never reaches the database. The quota
runs after validation, so a malformed body costs no quota. Keying the abuse
limiter on `user:<id>` for signed-in callers fixes a real fairness bug: a
classroom behind one NAT shares one IP.

### 6.3 Identity on AI requests

- **Client:** `callClaude` sends `Authorization: Bearer <access token>` whenever
  a session exists and nothing otherwise. On a 401 it refreshes once and retries,
  reusing `authedFetch`'s refresh-once rule through a new `{ optional: true }`
  mode instead of a second copy of that rule.
- **Server:** `resolveCaller(req)` returns one of:
  - `{ kind: 'guest', key: 'ip:<addr>' }` when there is no header;
  - `{ kind: 'user', userId }` when `auth.getUser` succeeds;
  - a **401** when GoTrue rejects the token, so the client refreshes;
  - `{ kind: 'guest', degraded: true }` when GoTrue is **unreachable** (network
    or 5xx). That request is then handled as a guest.
- The allowlist gate in `requireAuth` applies unchanged.
- **Ship order matters.** The client change ships first (Task A2). If the server
  clamp (Task A3) shipped first, signed-in chat would be downgraded to guest for
  one deploy. No native build is in users' hands yet, so web is the only stale
  client to worry about, and Vercel deploys web and server together.

### 6.4 Model ceiling, enforced on the server

The server clamps `safeBody.model` to the caller's tier ceiling **after**
validation and **before** forwarding:

- the requested model is kept if its catalog `cost ≤ TIERS[routerTier].maxCost`;
- otherwise it is replaced by the most capable model within the ceiling.

Honest clients never notice: the client router already applies the same ceiling.
A tampered client gets the cheaper model silently, and a `model_clamped` log line
is written. Grading, sentence generation and deck generation already pin
`'guest'`, so they stay on Haiku.

### 6.5 Meters, units and the reset boundary

- **Meters = endpoints:** `chat`, `grade`, `deck`. Today's three handlers map one
  to one, so no request needs reclassifying.
- **Units:**
  - a chat turn consumes the model's **weight**: Fast (Haiku) 1, Balanced
    (Sonnet) 3, Capable 5;
  - grade and deck consume 1.
  - Weights follow price ratios (§4.9), so one daily number bounds spend whatever
    model the learner picks. The UI shows "about N turns left" for the selected
    model.
- **The reset is UTC midnight for everyone.**
  - The web has no trustworthy time zone for the server: `user_devices.time_zone`
    exists only for native push devices.
  - A client-supplied zone would let a learner hop zones to spend two days in
    one.
  - UTC is what `award_tokens` already uses.
  - The client shows the **local** time of the next reset, for example "Resets
    at 02:00", computed from the `X-Quota-Reset` header.
- **No monthly pool in the MVP.** Daily caps already bound a month at 31× the
  daily maximum (§6.10). A monthly pool adds a second boundary and an "out until
  the 1st" cliff, which is the worst UX in this space.

### 6.6 Atomic consumption, refund, and the idempotency stance

**Consume** runs as one `security definer` RPC, service-role only, before the
upstream call. It:

1. resolves the tier from `entitlements`;
2. adds today's grants (rewarded ads, support goodwill) to the Free limit;
3. increments the subject row with
   `insert … on conflict do update … where used + units <= limit returning used`.

A row lock serialises concurrent requests, so parallel calls cannot overshoot.
Pool rows are incremented the same way, and a pool denial rolls back the
subject increment in the same transaction.

**Refund** runs when the upstream call fails: the provider throws, or returns a
non-2xx status. A unit is then given back with `used = greatest(used - units, 0)`.
A function that dies between consume and refund loses the learner one unit. That
fails closed, and it is acceptable.

**No client idempotency key for AI quota (deliberate).**

- `callClaude` never retries automatically, so there is no retry to dedupe.
- A key that is "already paid" must either be served again or rejected.
  - Served again, it becomes a free-call oracle: replay the key and get unlimited
    calls, bounded only by the burst limit.
  - Rejected, it gives the lost-response case the same outcome as having no key.
- Consume and refund inside one server request is exactly-once on the success
  path.

**Idempotency where it does matter:**

- RevenueCat events dedupe on `event.id` (§7.4);
- AdMob SSV dedupes on `transaction_id`, plus a single-use nonce (§8.5);
- grants are unique on `(source, source_ref)`.

**Shadow mode.** `AI_QUOTA_MODE=shadow` increments unconditionally and returns
`would_deny`, so the counters measure **real demand beyond the limits**. A
shadow-mode counter that stopped at the limit would hide exactly the number
the owner needs.

### 6.7 Budget protection, layered

| Layer | Control                                                                                                         | Bounds                                         |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1     | Burst limit per IP or user (exists; re-keyed by user)                                                           | Floods and scripted loops                      |
| 2     | Body validation: `max_tokens ≤ 1024`, ≤ 100 messages, ≤ 100k chars (exists)                                     | Cost per call                                  |
| 3     | **Server model ceiling** (new)                                                                                  | The most expensive model a tier can reach      |
| 4     | **Daily quota per subject** (new)                                                                               | One learner's day                              |
| 5     | **Daily pool per tier**: guest pool and free pool (new). Premium has no pool, because it is paid and identified | Guests rotating IPs and farmed free accounts   |
| 6     | **Kill switches:** `AI_GUEST_ENABLED=false`, `AI_QUOTA_MODE`, or unset `ANTHROPIC_API_KEY` (§12.5)              | Anything else, within a redeploy (~1 min)      |
| 7     | **Anthropic Console monthly spend limit** (owner action)                                                        | The absolute ceiling, enforced by the provider |

Starting pools (italic, tuned after shadow): guest _2,000_ chat units, _5,000_
grade and _200_ deck per day; free _20,000_ / _40,000_ / _1,000_. Layer 7 is the
only one that holds even if our own code is wrong, which is why it is an owner
action before Phase A enforcement.

### 6.8 Failure modes

| Failure                                    | Behaviour                                                                                                                                                                                                           | Why                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Supabase DB unreachable (quota RPC errors) | **Degraded mode:** every caller is treated as **guest**, counted by the existing in-process `MemoryStore` at the guest allowance, with a `quota_store_degraded` log. Premium users get guest limits for the outage. | Fail-open would turn an outage into unlimited spend; fail-closed would take AI down with the DB. Per-instance memory bounds spend. |
| GoTrue unreachable                         | The caller is handled as a degraded guest, as above                                                                                                                                                                 | Same reasoning                                                                                                                     |
| GoTrue rejects the token                   | **401**. The client refreshes once and retries (existing rule)                                                                                                                                                      | An expired token is not an outage                                                                                                  |
| Anthropic error / timeout                  | Refund the units. 502 as today                                                                                                                                                                                      | The learner is not charged for our failure                                                                                         |
| RevenueCat API down during a webhook       | 500, so RevenueCat retries 5× over ~2.5 h. The entitlement keeps its last `expires_at`                                                                                                                              | The row only ever moves on fresh data                                                                                              |
| RevenueCat down at a renewal moment        | `expires_at` passes and the user is Free until the webhook or a client `sync` lands. On app start, the client calls `sync` when the device SDK says active but the server says not                                  | A server-side "tolerance window" would also delay refunds                                                                          |
| Store down                                 | The purchase fails on device. Nothing changes server-side                                                                                                                                                           | —                                                                                                                                  |
| AdMob SSV late or lost                     | No grant until a valid SSV arrives. The client polls its grants for ~10 s, then says "your bonus will appear shortly"                                                                                               | A grant only exists once Google has signed for it                                                                                  |

### 6.9 Error contract

- A new code **`quota_exhausted` → 429**, kept distinct from the burst limiter's
  `rate_limited`.
- Body:
  `{ error: { code, message, meter, tier, limit, used, resetsAt, rewardedEligible } }`.
- Every successful AI response carries `X-Quota-Limit`, `X-Quota-Used`,
  `X-Quota-Reset` (ISO UTC) and `X-Quota-Tier`. The native app is cross-origin,
  so `withCors` exposes those headers.
- `callClaude` throws a typed `QuotaExhaustedError`.
- The UI:
  - **Chat:** an inline note in the conversation, not a blocking sheet. It shows
    the reset time, "Watch a short ad for +5" (Free, native, ads on, cap not
    reached), "Get Premium" (native, Premium on) or "Create a free account"
    (guest).
  - **Grading:** a neutral panel, "Daily checking limit reached — resets at
    HH:MM". It is never a "wrong" verdict and never says "check your connection"
    (F9).
  - **Deck generation:** the same message in place of today's `alert`.

The **trial wall is untouched**. It stays an account wall, never a paywall.

### 6.10 Cost model (estimates until shadow mode measures them)

**Assumed shapes:** a chat turn is about 3,000 input and 300 output tokens; an
answer check about 500 / 150; a sentence batch about 700 / 700; a deck about
500 / 1,000. Phase A records real tokens per meter, model and tier in
`ai_cost_daily` before any number is locked.

| Call                                                | Haiku 4.5 | Sonnet 4.5 | Sonnet 5.5 |
| --------------------------------------------------- | --------- | ---------- | ---------- |
| Chat turn                                           | $0.0045   | $0.0135    | $0.009     |
| Answer check                                        | $0.0013   | —          | —          |
| Sentence batch                                      | $0.0042   | —          | —          |
| Deck generation                                     | $0.0055   | —          | —          |
| Worst single call (100k chars ≈ 25k in + 1,024 out) | $0.030    | $0.090     | $0.060     |

| Tier (starting allowances)        | Worst case per day (every allowance maxed, assumed shapes) | Heavy but realistic day       |
| --------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| Guest (10 / 40 / 1)               | ~$0.22 per IP; all guests together ≤ pool (~$30)           | ~$0.05                        |
| Free (20 + 10 from ads / 150 / 3) | ~$0.78                                                     | ~$0.15                        |
| Premium (150 units / 300 / 15)    | ~$1.95 (chat capped at ~$0.68 whatever the model)          | ~$0.25–0.45 ($7–14 per month) |

**What the table says, plainly:**

- **A daily-active Premium learner who uses Balanced chat heavily can cost more
  than a ~€5/month subscription returns after VAT and store fees** (§16, D3).
- Three levers fix this, and none of them redesigns the tutor:
  1. move Balanced to Sonnet 5.5, which the catalog refresh must do anyway (F2);
  2. prompt caching on the chat system prompt and history (cache reads cost 0.1×
     input), a separate AI-lane mission;
  3. price Premium from the measured shadow-week numbers, not from these
     estimates.
- **One rewarded ad buys ~5 Fast turns ≈ $0.02.** The design assumes that is
  roughly what one rewarded view earns. AdMob publishes no eCPM guarantee, so
  this is an assumption to check against the AdMob report after a month (§12.6).

### 6.11 Trial limits, restated

There are now two separate mechanisms with separate jobs:

- the **guest trial wall** (client, activity-derived, an account wall) converts
  guests into accounts;
- the **guest AI quota** (server, IP-keyed, plus the guest pool) bounds what
  guests cost.

Neither replaces the other, and the wall's 60-round backstop and designed peak
are not changed. A guest who clears site data resets the wall, but not the
server quota or the pool.

---

## 7. Purchase architecture

### 7.1 Decision: RevenueCat, not direct StoreKit / Play Billing (D1)

| Concern                                                              | RevenueCat                                                                                                                                                                          | Direct (StoreKit 2 + Play Billing + our own verification)                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipt/JWS validation                                               | Done by RevenueCat                                                                                                                                                                  | We verify Apple JWS chains (x5c up to Apple's root) and call `purchases.subscriptionsv2.get` with a Google service account                                                             |
| Server notifications                                                 | **One** webhook, one shape, retried 5×. We refetch the subscriber, so event order never matters                                                                                     | **Two** pipelines: App Store Server Notifications v2 (JWS, retried at 1/12/24/48/72 h, not retried in sandbox) and RTDN over a **Cloud Pub/Sub** push subscription (a new GCP surface) |
| Acknowledgement (Play, 3 days)                                       | SDK                                                                                                                                                                                 | Ours: a missed ack auto-refunds                                                                                                                                                        |
| Grace, billing retry, refunds, revocations, upgrades, family sharing | Folded into one `expires_date` / `grace_period_expires_date` per entitlement                                                                                                        | A state machine per store                                                                                                                                                              |
| Capacitor 8 + SPM                                                    | `@revenuecat/purchases-capacitor` 13.7.0                                                                                                                                            | `@capgo/native-purchases` 8.8.1 (no server side), or `cordova-plugin-purchase` (Cordova bridge)                                                                                        |
| Later web billing                                                    | RevenueCat Web Billing lands on the same entitlement                                                                                                                                | Stripe plus a third reconciliation path                                                                                                                                                |
| Cost                                                                 | 0 under $2.5k MTR, then 1%                                                                                                                                                          | 0, paid in engineering time and ongoing correctness risk                                                                                                                               |
| Lock-in and privacy                                                  | A new processor (app user ID = Supabase UUID, purchase data, device data). Our `entitlements` table is provider-neutral (`source` column), so a later migration replaces one writer | No new processor                                                                                                                                                                       |

**Recommendation: RevenueCat.**

- For a solo-maintained app, the direct path means two signature-verification
  stacks, a GCP Pub/Sub endpoint, and a subscription state machine per store.
  That is the most expensive kind of code to get subtly wrong, because the
  failure is "a payer loses access" or "a refunder keeps it".
- RevenueCat's "refetch on every webhook" model collapses all of it into one
  idempotent upsert.
- The 1% fee only starts above $2.5k a month, and by then it is cheap insurance.

### 7.2 Products

- **One entitlement:** `premium`.
- **Two auto-renewable products** in one subscription group / base plan family:
  monthly and annual (D3).
- No consumables, no lifetime purchase, no token packs in the MVP.
- Product IDs are fixed at setup (§17), for example
  `com.sprachschule.deutsch.premium.monthly` and `.annual`.
- The same products are attached to a RevenueCat **Offering** named `default`.
  The paywall renders whatever that offering holds. That is our remote control
  over what is for sale (§12.5).

### 7.3 Account binding

- **Purchase requires a signed-in account.**
- The SDK is configured on app start. `Purchases.logIn(user.id)` runs on
  sign-in (session resolved), and `Purchases.logOut()` runs in `signOut`'s
  pre-signout step, next to `forgetPushDevice`.
- The app user ID is the **Supabase UUID**: non-guessable, never an email, as
  RevenueCat recommends.
- **Why not guest purchases?**
  - Premium is enforced on the server, per account.
  - It must reach the web (3.1.2(a), "available across all of the user's
    devices").
  - A guest has no server identity that could carry it.
- **Review risk, stated honestly.** The guidelines do not forbid requiring an
  account before an IAP (5.1.1(v) only requires the app to work without login,
  and it does). App Review has been known to question register-before-purchase
  for content that is not account-based. Our answer: Premium _is_ an
  account-based, cross-platform server entitlement.
- **Fallback if rejected:** configure RevenueCat with an anonymous ID for
  guests, allow the purchase, and require account creation right afterwards to
  activate it. The aliasing rules in §4.7 merge the purchase into the new
  account. This is noted, not built.

### 7.4 Server source of truth

**Tables (§10):**

- `entitlements (user_id, source)`: written only by the service role. Learners
  can read their own rows.
- `billing_events (event_id)`: a dedupe and audit trail. It stores the event
  ID, user, type, environment and received-at, **never the payload**.

**Webhook** (`POST /api/v1/billing/revenuecat`):

1. Compare `Authorization` to `RC_WEBHOOK_AUTH` with `timingSafeEqual`. A
   mismatch gets 401.
2. Collect candidate user IDs: `app_user_id`, `original_app_user_id`,
   `aliases[]`, `transferred_from[]` and `transferred_to[]`. Keep only UUIDs;
   anonymous `$RCAnonymousID:` values are ignored.
3. Insert into `billing_events`, `on conflict do nothing`. If the event was seen
   before, answer **200** at once.
4. For each user, `GET /v1/subscribers/{id}` with `RC_SECRET_API_KEY`, then map
   (§7.7) and upsert, or delete the `source='revenuecat'` row.
5. Return 200. Any RevenueCat or database error returns 500, so RevenueCat
   retries.

**Tier resolution** happens inside `consume_ai_quota`, a single primary-key
probe on `entitlements`: Premium if any row has `expires_at is null or
expires_at > now()`. `source='manual'` rows hold owner comps and test grants;
Track A ships them, so Premium limits can be tested end to end before any store
exists. A manual grant and a store subscription coexist without overwriting each
other.

### 7.5 `POST /api/v1/billing/sync` (authenticated)

The server asks RevenueCat about the **caller's own** user ID and upserts. It
runs:

- right after a purchase or restore succeeds on device, so a webhook lag never
  shows a payer Free limits;
- on app start when the device SDK's `customerInfo` and the cached server tier
  disagree.

The client never says _what_ it owns, only "please re-check me". It is
burst-limited at 10 per hour per user.

### 7.6 Restore purchases

Settings → Premium has **"Restore purchases"**. It calls
`Purchases.restorePurchases()` and then `sync`.

RevenueCat's restore behaviour stays at its default, "transfer to new App User
ID". Restoring on another account moves Premium there. A `TRANSFER` event then
refetches both accounts, and the old one loses Premium, which is the correct
outcome.

### 7.7 Lifecycle mapping (from the refetched subscriber)

`premium` is active when `max(expires_date, grace_period_expires_date)` is null or
in the future **and** the backing subscription has `refunded_at = null`. The
implementer re-checks these field semantics against the current RevenueCat
docs.

| Store event                                  | What RevenueCat's subscriber shows              | Our row                                      |
| -------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Purchase, renewal, uncancel                  | Future `expires_date`                           | Upsert, active                               |
| Cancel (auto-renew off)                      | `unsubscribe_detected_at` set, still future     | Active until expiry, `will_renew=false`      |
| Billing issue, inside grace                  | `billing_issues_detected_at`, future grace date | Active through grace, `billing_issue_at` set |
| Grace over / account hold / expiry           | Past dates                                      | Row kept with past `expires_at`, so inactive |
| Refund / revocation (family sharing removed) | `refunded_at` set, or expiry moved to now       | Inactive immediately                         |
| Sandbox (TestFlight, review, license tester) | `is_sandbox: true`                              | **Granted**, with `environment='SANDBOX'`    |

**Sandbox purchases grant Premium in production on purpose.**

- App Review buys in the sandbox against the production build.
- Refusing sandbox would make the IAP look broken and invite a rejection.
- Only TestFlight users, reviewers and Play license testers can make a sandbox
  purchase.
- Metrics filter on `environment`.

### 7.8 Local entitlement cache (a hint, never authority)

- `useEntitlement(user)` reads the learner's own rows through supabase-js and RLS.
- It caches `{ userId, tier, expiresAt, fetchedAt }` in a **new** key,
  `deutsch-app-entitlement-v1`. This adds a key; no existing key is renamed.
- Sign-out already wipes every non-theme key.
- The cache is used **only** for:
  - hiding ads;
  - the Premium badge and paywall state;
  - the model picker's ceiling.
- A cache older than 7 days, or for another user, is ignored.
- **The server never reads it.** A forged cache can hide ads on the forger's own
  phone, which costs us an impression, and it can unlock a model picker whose
  choice the server then clamps.
- Like `xpEntitlement.js`, it never rides the synced `deutsch-app-state-v1` blob.

### 7.9 Web billing (later, not MVP)

- Premium bought on a phone already works on the web, because the entitlement is
  server-side.
- Selling on the web adds:
  - a payment processor;
  - **tax as merchant of record.** The stores collect EU VAT; Stripe, which
    backs RevenueCat Web Billing, does not, so the owner would register for VAT
    OSS. A merchant-of-record provider avoids that.
  - a third reconciliation path;
  - US-only link-out rules in both stores.
- Phase 3 evaluates RevenueCat Web Billing against a merchant-of-record provider
  once there is demand.

### 7.10 Account deletion with an active subscription

- The delete flow checks the cached tier. When Premium came from a store, the
  flow shows Apple's required notice: billing continues until the learner
  cancels. It links to "Manage subscription" (the RevenueCat `managementURL`,
  falling back to `apps.apple.com/account/subscriptions` or Play's
  subscriptions page) **before** the confirm step.
- Server-side, `deleteHandler` makes a best-effort
  `DELETE /v1/subscribers/{id}` call to RevenueCat, so the processor drops the
  identity. The cascade removes our rows.
- If the learner later restores on a new account, the purchase moves there.

---

## 8. Advertising architecture

### 8.1 Who can see an ad

All of these must hold:

1. native build (`isNativeApp()`);
2. `VITE_ADS_ENABLED`;
3. signed in;
4. cached tier is not Premium;
5. UMP finished, and `canRequestAds()` is true;
6. online.

**Guests never see ads in the MVP.**

- A guest is a first impression, and the trial wall is the conversion moment.
- An ad before it costs conversions that are worth more than the impression.
- A guest has no identity, so it cannot hold a rewarded grant.

**No ads on the web** in any phase. AdSense on a learning PWA is a different
product, and "Website Analytics … do not use cookies" is a promise the policy
keeps.

### 8.2 Formats and placements

| Format                | MVP                                                         | Placement                                                                                                                                             | Caps                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rewarded** (opt-in) | **Yes**                                                     | Only inside the chat quota note, when Free chat units are exhausted: "Watch a short ad for +5". Never auto-played, never a pre-roll                   | ≤ **2 grants per UTC day** (server-enforced). The button disappears at the cap. One ad loaded at a time                                                      |
| Interstitial          | No. Phase 3, behind `VITE_ADS_INTERSTITIAL`, owner approval | Only at a learner-initiated natural end: after **tapping Done** on a finished deck run or lesson summary, before the next screen                      | ≥ 10 min apart, ≤ 3 per day, none in the first 3 days after signup, none in a learner's first session of the day, closeable (Apple 2.5.18; Play's 15 s rule) |
| Banner (adaptive)     | No. Phase 3, owner approval                                 | Stats tab only, below the content, in a **reserved slot** sized by the plugin's `SizeChanged` event, so nothing reflows and nothing covers navigation | One at a time. Removed on tab change                                                                                                                         |
| App-open              | **Never**                                                   | —                                                                                                                                                     | —                                                                                                                                                            |

**Preserving the premium visual design.**

- The MVP has no persistent ad surface at all.
- The rewarded entry is one tertiary-styled action inside an existing note,
  built from theme tokens (`ui/Button` `variant="secondary"`). AdMob's own
  full-screen ad UI appears only after the learner taps it.
- A native banner would be an OS view laid over the webview. With a 320px
  budget and safe-area insets, an unreserved banner covers the nav. That is why
  the Phase 3 banner is Stats-only and slot-reserved.

### 8.3 Never interrupting learning — hard rules

The client ad module enforces these, and its tests pin them. `showAd()` refuses
(returns `{ shown: false, reason }`) when any of these holds:

- an exercise has an answer typed, selected or pending grading;
- an AI request is in flight;
- placement or onboarding is open;
- the trial wall, a celebration (`toasts.length > 0`, `streakBurst`) or any
  modal sheet is up;
- the app is backgrounded;
- the last full-screen ad closed less than 10 minutes ago (interstitials only).

A rewarded ad is shown **only** as the direct result of tapping its button.

### 8.4 Frequency caps, consolidated

- Rewarded: 2 grants per UTC day, enforced on the server. A client copy only
  hides the button.
- Interstitial (Phase 3): 1 per 10 min, 3 per day, enforced on the client, with
  the reason in §8.3.

Server caps exist only where a reward is granted, because that is where money
moves. An interstitial grants nothing, so its caps are UX caps.

### 8.5 Rewarded flow, verification and idempotency

1. The client taps "Watch a short ad", then calls the `create_ad_reward_intent()`
   RPC (authenticated, through supabase-js; **no Vercel function**). It gets back
   a fresh `nonce` (UUID). The RPC refuses after 10 intents per user per day.
2. `prepareRewardVideoAd({ adId, npa: true, ssv: { customData: nonce } })`, then
   `showRewardVideoAd()`.
3. Google calls `GET /api/v1/ads/ssv?…`. The handler then:
   - verifies the **ECDSA SHA-256 signature** over the raw query before
     `&signature=`, using the key named by `key_id` (keys cached ≤ 24 h, refetched
     once on an unknown `key_id`);
   - checks that `ad_unit` is one of `ADMOB_REWARDED_AD_UNITS`;
   - parses `custom_data` as a UUID.
4. The `grant_rewarded_ad(nonce, transaction_id, units, daily_cap)` RPC
   (service role):
   - finds the intent: unconsumed, under 1 hour old, owned by a user;
   - rejects a duplicate `transaction_id` (grants are unique on
     `(source, source_ref)`);
   - enforces the daily cap;
   - inserts `ai_quota_grants(user, 'chat', today, 5, 'rewarded_ad', transaction_id)`;
   - marks the intent consumed.
5. The handler answers **200** for granted, duplicate, capped, or an unknown or
   expired nonce, because a retry cannot change any of those. It answers **403**
   for a bad signature, **400** when malformed, and **500** on a database error,
   which Google retries.
6. The client polls its own grants for today (RLS select-own) for ~10 s and shows
   "+5 added".

**Why a nonce instead of SSV `user_id`?** Passing our Supabase UUID would give
Google a stable identifier for each learner, joinable with its ad data. The nonce
is single-use and means nothing outside our database, which keeps us clearly
outside Apple's "tracking" definition.

**We ignore `reward_amount`.** The server decides the units, the same principle
as `award_tokens` deciding amounts.

### 8.6 "Save your streak" for an ad — not offered

**Verdict: no, in the MVP, and not recommended later in this form.**

1. **It breaks a design invariant.** Freezes are _derived_ by
   `simulateFreezes` from `daily`, with no stored inventory ("which is why a
   freeze needs no stored inventory", `streak.js`). An ad-granted repair
   needs a server-stored, server-verified record, plus merge rules across
   devices. That is a gamification redesign the brief rules out.
2. **It leaks into competition.** The streak drives `MULTIPLIER_TIERS` (up to
   2.0×). An ad that preserves a streak preserves an XP multiplier, so watching
   ads would buy league XP. That is pay-to-win in the one place the listing
   promises otherwise.
3. **It monetizes loss aversion** at the moment a learner is most vulnerable, in
   a product whose stated tone is "Motivation without pressure".

The freeze economy stays earn-only: 7-day runs and quest completions. If the owner
ever wants it, the fair form is a once-per-30-days repair that **does not restore
the multiplier**, designed as its own gamification spec.

### 8.7 Premium never sees ads

- **Client:** every ad entry point checks `tier !== 'premium'`. If the cached
  tier is unknown, the device SDK's `customerInfo` is checked before loading an
  ad. Unknown or offline means no ad.
- **Server:** `grant_rewarded_ad` is harmless for Premium (Premium ignores
  grants). The rewarded button is never rendered for Premium, because Premium
  never hits the Free chat limit.

### 8.8 Plugin

`@capacitor-community/admob` 8.1.0 (§4.6):

- the only maintained Capacitor 8 AdMob plugin with SPM, UMP, SSV `customData`,
  `npa`, TFUA and `maxAdContentRating` in one package;
- `@capgo/capacitor-admob` 8.1.19 is a fallback with the same peer range.

---

## 9. Privacy and store compliance

### 9.1 GDPR and EEA consent

- UMP runs on **every app launch** for eligible learners (§8.1 conditions 1–4)
  before any ad request: `requestConsentInfo()`, then `showConsentForm()` when
  required, then `canRequestAds`.
- The AdMob console's GDPR message targets "Countries subject to GDPR (EEA, UK
  and Switzerland)".
- No consent means **limited ads**. That is fine: nothing personalized is
  requested anyway.
- When UMP says one is required, Settings → System gains a **"Privacy choices"**
  row that calls `showPrivacyOptionsForm()`.
- Consent is per device and stored by UMP natively. It survives sign-out, which
  is correct: consent belongs to the person at the device, not the account.

### 9.2 ATT sequencing on iOS

**The MVP never calls `requestTrackingAuthorization`, adds no
`NSUserTrackingUsageDescription`, and never tracks.**

- Ads are non-personalized (`npa: true`), so the IDFA has no use.
- Asking for ATT for no benefit would be dishonest, and it would add a prompt
  whose refusal changes nothing.

If personalization ever ships (Phase 3, an owner decision with counsel):

- the order is **UMP consent → AdMob IDFA explainer → ATT prompt**;
- ATT is never gated or incentivised (§4.2);
- rewarded grants must not depend on the answer (5.1.2).

### 9.3 Personalized and non-personalized ads

**MVP: non-personalized everywhere.**

- `npa: true` on every request;
- `tagForUnderAgeOfConsent: true` globally;
- `maxAdContentRating: 'PG'`.

TFUA also drops third-party ad vendors, which costs some fill and some revenue.
In return we never need an age gate in the EEA, where the age of digital consent
reaches 16 in some member states, Germany among them. We collect no age, and the
Terms allow 13+.

### 9.4 Age assumptions and child-directed treatment

- The audience is **13+** (Terms §1). `tagForChildDirectedTreatment: false`.
- Play target audience: 13–15, 16–17 and 18+. The Families policy does not
  apply (§4.4). Apple's Kids Category is not used.
- **If the owner ever lowers the age floor below 13, ads must be re-designed**:
  a neutral age screen, Families Self-Certified SDKs, TFCD and COPPA review.
- The age-rating questionnaire is re-answered with **Advertising: yes** (Apple
  and Play), with `maxAdContentRating` matched to the resulting rating. PG suits
  a 9+ or 13+ rating.

### 9.5 Privacy Policy and Terms (copy is owner-supplied; listed, not written)

| #   | Change                                                                                                                                                                                                                      | Ships with                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| L1  | "Usage Limits": AI features record **your account ID** when signed in (IP for guests), with a daily count. Records are kept for the current day only                                                                        | Before `AI_QUOTA_MODE=shadow` |
| L2  | **Purchases**: RevenueCat added as a processor (account ID, purchase and subscription status, device and store data). Apple / Google process payment. How to restore and cancel                                             | Premium release               |
| L3  | **Advertising** (native, Free tier): Google AdMob, the data from §4.5, non-personalized only, consent via the in-app message, Privacy choices. "We do not sell your data or use it for targeted advertising" **stays true** | Ads release                   |
| L4  | Terms: subscription terms (auto-renew, cancel in the store, refunds per store, Premium contents may change with notice). Allowances are a fair-use service, not a promise of unlimited AI                                   | Premium release               |
| L5  | Delete-account page: mention cancelling store subscriptions                                                                                                                                                                 | Premium release               |

**Version bumps re-ask every learner** (`legalVersions.js`), so batch them.

- L1 is a factual edit. The owner decides whether it is "significant" (§9 of the
  policy) and therefore re-prompts.
- **Recommended:** L1 without a bump, and L2 + L4 + L5 as one bump at the
  Premium release.
- L3 is a second bump only if ads ship after Premium.

### 9.6 Store disclosures

- **Apple App Privacy:**
  - Purchases → Purchase History, linked, App Functionality (through
    RevenueCat);
  - Identifiers / Usage Data / Diagnostics → collected by the AdMob SDK for
    **Third-Party Advertising**, not used for tracking.
  - Re-check against Google's App Store data-disclosure guidance for the shipped
    SDK version.
- **Play Data safety:**
  - Purchase history;
  - the AdMob set (IP or approximate location, app interactions, diagnostics,
    device or other IDs);
  - **"Contains ads": yes.**
- **Subscription metadata:**
  - App Store Connect subscription group, display names, Review screenshot of
    the paywall, Terms (EULA) link in the description;
  - Play base plans and offers.
- `docs/STORE_SUBMISSION_CHECKLIST.md` gains these rows in Task R2.

### 9.7 Analytics without sensitive content

No client analytics SDK is added. Everything is counted on the server, and **no
prompt text, AI reply, email or IP ever leaves the row it was counted in**.

| Signal                               | Where                                              | Contains                                                      |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| Daily cost                           | `ai_cost_daily (day, meter, model, tier)`          | Calls, input tokens, output tokens. **No user, no IP**        |
| Would-deny / denied                  | `ai_usage` (one day of rows) + log `quota_denied`  | Subject key, meter, used. Log lines carry meter and tier only |
| Clamp / degraded                     | Logs `model_clamped`, `quota_store_degraded`       | From/to model, tier                                           |
| Revenue, conversions, churn, refunds | RevenueCat dashboard; `billing_events` (type, env) | No payload stored                                             |
| Ad revenue, fill, impressions        | AdMob console                                      | Google's own reporting                                        |
| Rewarded grants                      | `ai_quota_grants` (30-day retention)               | User, units, transaction ID                                   |

Log lines never include user IDs, tokens or secrets (the push-sender rule).

---

## 10. Data model

Three migrations, one per track, so each ships without the others. **Agents
write the files. Only the owner applies them** (AGENTS.md, and the drill in
`docs/STORE_SUBMISSION_CHECKLIST.md` item 1).

**Track A — `<ts>_ai_access_quota.sql`**

- `entitlements (user_id uuid → auth.users on delete cascade, source text check in ('manual','revenuecat'), tier text check = 'premium', product_id text, store text, environment text, expires_at timestamptz, will_renew bool, billing_issue_at timestamptz, updated_at timestamptz default now(), primary key (user_id, source))`
  - RLS: `select own` for `authenticated`. Inserts and updates are revoked from
    `anon` and `authenticated`.
- `ai_usage (subject text, meter text, day date, used int ≥ 0, primary key (subject, meter, day))`
  - Server-only, deny-all RLS.
  - A subject's older days are deleted on its next consume. Pool rows go after
    30 days.
- `ai_quota_grants (id identity, user_id → auth.users cascade, meter text, day date, units int 1–50, source text check in ('rewarded_ad','support'), source_ref text, created_at, unique (source, source_ref))`
  - RLS: `select own`. No client writes.
  - Rows older than 30 days are deleted by the grant RPC.
- `ai_cost_daily (day date, meter text, model text, tier text, calls int, input_tokens bigint, output_tokens bigint, primary key (day, meter, model, tier))`
  - Server-only, deny-all.
- RPCs, all `security definer`, `search_path=''`, service-role only:
  - `consume_ai_quota(p_subject text, p_user uuid, p_meter text, p_units int, p_limits jsonb, p_pool_limits jsonb, p_enforce boolean) → jsonb`
  - `refund_ai_quota(p_subject text, p_meter text, p_units int, p_tier text) → void`
  - `record_ai_cost(p_meter text, p_model text, p_tier text, p_input int, p_output int) → void`

**Track B — `<ts>_billing_events.sql`**

- `billing_events (event_id text primary key, user_id uuid, type text, environment text, received_at timestamptz default now())`
  - Server-only, deny-all. Rows deleted after 400 days.
  - No foreign key, so a deletion does not erase the refund audit. It holds no
    payload and no personal data beyond the UUID.

**Track C — `<ts>_ad_rewards.sql`**

- `ad_reward_intents (nonce uuid primary key default gen_random_uuid(), user_id → auth.users cascade, created_at, consumed_at)`
  - Server-only, deny-all.
- `create_ad_reward_intent() → uuid`: `authenticated`, at most 10 per user per
  UTC day.
- `grant_rewarded_ad(p_nonce uuid, p_transaction_id text, p_units int, p_daily_cap int) → jsonb`:
  service-role only.

Each migration's header carries the same "DO NOT apply from an agent" banner as
`20260923120000_token_economy.sql`. Each ships with an RLS test file under
`supabase/tests/rls/`.

---

## 11. Server modules and endpoints

| Module                                               | Track | Role                                                                                                                                                  |
| ---------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/accessPolicy.js`                            | A     | Pure: tiers, meters, starting limits and pools, model weights, ceiling clamp, next UTC reset. Shared by `api/` and the client (`.js` imports)         |
| `api/_lib/aiCaller.js`                               | A     | `resolveCaller(req)`: optional bearer → user, guest, 401, or degraded guest                                                                           |
| `api/_lib/aiQuota.js`                                | A     | `consume` / `refund` / `recordCost` over the RPCs, with the in-memory degraded fallback                                                               |
| `api/_lib/handler.js` (modified)                     | A     | Chain: method → origin → configured → **caller** → burst (user or IP) → validate → **consume** → **clamp** → forward → **refund or record** → headers |
| `api/_lib/revenuecat.js`                             | B     | `fetchSubscriber`, `deleteSubscriber`, `entitlementFromSubscriber(sub, now)` (pure)                                                                   |
| `api/_lib/billingEndpoints.js` + `api/v1/billing.js` | B     | `op=revenuecat` (webhook), `op=sync` (authenticated)                                                                                                  |
| `api/_lib/admobSsv.js`                               | C     | Signature verification with `node:crypto` and a key cache                                                                                             |
| `api/_lib/adsEndpoints.js` + `api/v1/ads.js`         | C     | `op=ssv`                                                                                                                                              |

Public URLs are kept by `vercel.json` rewrites, following the existing pattern:
`/api/v1/billing/revenuecat`, `/api/v1/billing/sync`, `/api/v1/ads/ssv`.

---

## 12. Rollout

### 12.1 Flags

| Flag                                                     | Where                          | Default        | Effect                                                                                                           |
| -------------------------------------------------------- | ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AI_QUOTA_MODE`                                          | Vercel (server)                | `off`          | `off`: identity and model clamp only; nothing recorded. `shadow`: count and measure, never deny. `enforce`: deny |
| `AI_GUEST_ENABLED`                                       | Vercel (server)                | `true`         | `false`: guests get `quota_exhausted` (reason `disabled`) on every AI call                                       |
| `RC_WEBHOOK_AUTH`, `RC_SECRET_API_KEY`                   | Vercel Production (Sensitive)  | unset          | Unset: billing endpoints answer 503                                                                              |
| `ADMOB_REWARDED_AD_UNITS`, `ADS_SSV_ENABLED`             | Vercel Production              | unset / `true` | Unset units: the SSV endpoint answers 503. `ADS_SSV_ENABLED=false`: 200 without granting                         |
| `VITE_PREMIUM_ENABLED`                                   | Build (`build:mobile` pins it) | `false`        | Paywall, Settings → Premium, RevenueCat SDK init. Native only                                                    |
| `VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY` | Build                          | unset          | RevenueCat **public** SDK keys, public by design like the Supabase anon key                                      |
| `VITE_ADS_ENABLED`                                       | Build (`build:mobile` pins it) | `false`        | Ad module init, UMP, rewarded entry. Native only                                                                 |
| `VITE_ADMOB_REWARDED_IOS`, `VITE_ADMOB_REWARDED_ANDROID` | Build                          | test IDs       | Ad unit IDs, which are public                                                                                    |
| `VITE_ADS_INTERSTITIAL`, `VITE_ADS_BANNER`               | Build                          | `false`        | Phase 3 only                                                                                                     |

The AdMob **app IDs** live in `Info.plist` (`GADApplicationIdentifier`) and
`AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`). Their test
values are Google's sample app IDs (§4.5), replaced at release.

### 12.2 Sandbox and test purchases

- **iOS:** use a StoreKit configuration file in Xcode for local runs, then
  sandbox Apple accounts on device. TestFlight uses the sandbox and accelerated
  renewal.
- **Android:** Play Console license testers on the internal testing track, with
  Google's test cards.
- **RevenueCat:** sandbox events (`environment: SANDBOX`) arrive at the same
  production webhook and grant Premium tagged `SANDBOX` (§7.7).
- Every lifecycle row in §7.7 is exercised on both platforms before release.
  Task R3 holds the script.

### 12.3 Test ads

- Development and internal builds use Google's demo unit IDs (§4.5) **and**
  `initializeForTesting: true` with the testers' device IDs.
- UMP is tested with debug geography EEA, through the plugin's consent request
  options.
- SSV is tested with the AdMob console's **test callback** against
  `/api/v1/ads/ssv` before any real unit is created.
- Never tap a live ad on a non-test device.

### 12.4 Staged rollout

| Stage | What                                                                                                                             | Gate to the next stage                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0    | Track A merged, `AI_QUOTA_MODE=off`. Identity and clamp are live                                                                 | No chat regression for signed-in users. `model_clamped` ≈ 0 from the real client                                                                               |
| A1    | Owner applies the Track A migration and sets the Anthropic spend limit. L1 is live. `AI_QUOTA_MODE=shadow`                       | **≥ 7 days.** The owner reviews `ai_cost_daily` (cost per call per meter and model) and would-deny rates, then fixes the numbers in `accessPolicy.js` (D2, D3) |
| A2    | `AI_QUOTA_MODE=enforce`                                                                                                          | Denial rate as predicted. No support spike after a week                                                                                                        |
| B0    | Vercel Pro active (D5). Track B merged, `VITE_PREMIUM_ENABLED=false`                                                             | Sandbox purchase → webhook → Premium limits, end to end on both platforms                                                                                      |
| B1    | Premium build: TestFlight and Play internal → App Store **phased release** (7 days) and Play **staged rollout** 10% → 50% → 100% | Refund and restore tested in production with a real card, then refunded                                                                                        |
| C0    | Track C merged, `VITE_ADS_ENABLED=false`                                                                                         | Test-ad rewarded flow and SSV grant end to end; UMP EEA debug form                                                                                             |
| C1    | Ads build: Play staged rollout 10% → 100%, App Store phased release                                                              | Impressions, fill and grant rate look sane in the AdMob and `ai_quota_grants` counts                                                                           |

### 12.5 Kill switches (none needs a new app build)

| To stop             | Do                                                                                                                                                         | Takes effect               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| All AI spend        | Unset `ANTHROPIC_API_KEY`, or rotate it in the Anthropic Console                                                                                           | Next request / redeploy    |
| Guest AI            | `AI_GUEST_ENABLED=false`                                                                                                                                   | Redeploy (~1 min)          |
| Quota denials (bug) | `AI_QUOTA_MODE=shadow`                                                                                                                                     | Redeploy                   |
| New purchases       | Empty the RevenueCat `default` offering. The paywall shows "Premium isn't available right now". Optionally remove products from sale in the store consoles | Next paywall open (remote) |
| Ads                 | Pause the ad units in the AdMob console (no fill, handled as "no ad available")                                                                            | Minutes (remote)           |
| Rewarded grants     | `ADS_SSV_ENABLED=false`                                                                                                                                    | Redeploy                   |

### 12.6 Observability and cost metrics

- The owner runbook (Task R2) carries a **weekly SQL**:
  - cost by day, tier, meter and model from `ai_cost_daily` × the §4.9 price
    table;
  - average tokens per call;
  - the share of Premium users at their cap;
  - grants per day.
- Anthropic Console usage and spend alerts are the provider-side truth. Compare
  them with `ai_cost_daily`. A gap means calls that bypassed the quota path.
- Vercel logs (Pro retention) hold `quota_denied`, `quota_store_degraded`,
  `model_clamped`, `rc_webhook`, `ssv` and `billing_sync`, all
  structured, all free of IDs and content.
- Revenue: RevenueCat for net revenue, MRR and churn; AdMob for ad revenue.
  Their sum minus the Anthropic and Vercel bills is the number the owner tracks
  monthly.

---

## 13. Security threat model

| Threat                                      | Control                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client claims Premium (cache, header, body) | Tier only from `entitlements` inside the quota RPC. The client cache is never read by the server                                                         |
| Client requests an expensive model          | Server clamp (§6.4)                                                                                                                                      |
| Parallel requests overshoot the quota       | Single-statement conditional upsert under a row lock                                                                                                     |
| Guest rotates IPs                           | Guest pool plus the provider spend limit                                                                                                                 |
| Farmed free accounts                        | Free pool, magic-link friction, the signup allowlist if needed                                                                                           |
| Forged RevenueCat webhook                   | Constant-time `Authorization` compare. The payload is never trusted, because state is refetched from RevenueCat with a secret key                        |
| Replayed webhook                            | `billing_events` primary key. The refetch is idempotent anyway                                                                                           |
| Forged or replayed SSV callback             | ECDSA verification with Google's keys, ad-unit allowlist, unique `transaction_id`, single-use nonce under 1 h old, daily cap                             |
| Someone else's nonce used to grant to them  | A nonce is unguessable (UUIDv4) and bound server-side to the user who created it. The grant goes to that user, never to a caller-named one               |
| Secret leakage                              | `RC_SECRET_API_KEY` and `RC_WEBHOOK_AUTH` are Vercel Sensitive, Production only, never `VITE_`. RevenueCat SDK keys and ad unit IDs are public by design |
| Learner content in logs or analytics        | §9.7: counters and tokens only                                                                                                                           |

---

## 14. MVP and later phases

**MVP (recommended)** = Track A + Track B + Track R. Track C ships when its owner
gate (D4) clears. It is independent and may follow by weeks.

| Phase               | Contents                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (MVP)**         | Identity on AI calls, server model clamp, quotas (off → shadow → enforce), pools, cost metrics, quota UX, manual Premium grants, client entitlement hook. **Needs no new vendor and no Vercel Pro**: it is cost control, not commerce |
| **B (MVP)**         | RevenueCat, monthly + annual Premium, webhook + sync, paywall, restore, manage, deletion notice                                                                                                                                       |
| **C (independent)** | Rewarded-only ads: UMP, non-personalized, SSV grants, Privacy choices                                                                                                                                                                 |
| **R (last)**        | Legal copy, store disclosures, runbook, QA script, staged release                                                                                                                                                                     |
| 3 (later)           | Interstitials at natural breaks and a Stats banner (each needs owner approval), web billing, a Capable-tier weight once the catalog has a live Opus-class model, prompt caching (an AI-lane mission), personalization (with counsel)  |

**Tradeoffs the MVP accepts.**

- **No web purchase.** Web learners can only buy Premium on a phone, which
  lowers web conversion. In exchange there is no VAT registration and no third
  reconciliation path.
- **Account required to buy.** It is simpler and correct for a cross-platform
  entitlement. There is a small review risk, with a known fallback (§7.3).
- **Rewarded-only ads earn little.** In exchange no persistent ad surface
  touches the design, and the ads track can be dropped entirely with no loss to
  the MVP.
- **UTC resets.** One rule everywhere, at the cost of a reset at an odd local
  hour, which the UI states.
- **Degraded mode treats Premium as guest during a Supabase outage.** Spend
  stays bounded, but payers get fewer turns during an outage.
- **Shadow week before enforcement.** Revenue protection is delayed by about a
  week. In exchange the prices come from data, not from §6.10's guesses.

---

## 15. Rules preserved

- No localStorage key renamed. One key added: `deutsch-app-entitlement-v1`.
- No German strings or `'de'` branches in `src/lib` / `src/components`. Ad copy
  is product chrome in English, like `TrialWall`.
- `src/` modules imported by `api/` use explicit `.js` extensions.
- The guest path is unchanged until `AI_QUOTA_MODE=enforce`. After that, guests
  see the same app with a daily AI allowance.
- Leagues, XP, quests, freezes, streak multipliers and tokens behave identically
  for every tier.
- Migrations are written by agents and **applied by the owner only**.

---

## 16. Owner decisions (need an explicit answer)

| #      | Decision                                                                                                                                                                                                                                                         | Recommendation                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Purchase backend: **RevenueCat** (new processor, 1% above $2.5k MTR) or **direct StoreKit 2 + Play Billing** (two verification stacks, Pub/Sub, our own state machine)                                                                                           | RevenueCat (§7.1)                                                                                                                                    |
| **D2** | Free tutor model and starting allowances: **(a)** Free chat on Fast (Haiku), 20 turns/day, Balanced becomes a Premium perk (one constant: `TIERS.free.maxCost` 2 → 1); or **(b)** keep Balanced for Free at 3 units/turn (about 6 turns/day) or raise Free units | (a). Final numbers after the shadow week                                                                                                             |
| **D3** | Premium products and price: monthly + annual, a launch price, and whether the annual plan gets a 7-day free trial. §6.10 shows a heavy Balanced user can cost $7–14/month before prompt caching                                                                  | Monthly + annual. Price set **after** the shadow week. Starting point to test: €6.99 / €49.99, trial on annual only                                  |
| **D4** | Ads track: go or no-go, and scope                                                                                                                                                                                                                                | Go, **rewarded-only, non-personalized, signed-in Free users on native**, shipped after Premium. No interstitials or banners without a later decision |
| **D5** | Spend approvals and timing: **Vercel Pro** (mandatory for any purchase or ad, §4.8) before Tracks B/C deploy, and the **Anthropic Console monthly spend limit** value before Stage A1                                                                            | Approve Pro before Track B's first PR merges. Spend limit ≈ 2× the measured monthly cost                                                             |

Approving the legal copy (§9.5 L1–L5) is an owner **action**, not a design
decision. The text comes from the owner, with counsel review, as for the previous
legal work.

---

## 17. Owner-only actions (agents must never perform)

1. Answer D1–D5.
2. **Apply each migration** (Track A, B, C) through the Management API procedure
   in `docs/STORE_SUBMISSION_CHECKLIST.md` item 1, and rename the file to the
   recorded version in a PR. Never use `db push`, `migration repair`, MCP
   `apply_migration`, or the SQL editor.
3. Set the Anthropic Console spend limit and alerts.
4. Set the Vercel env vars in §12.1 and flip `AI_QUOTA_MODE`.
5. Upgrade Vercel to Pro.
6. Create the RevenueCat project, link App Store Connect (an App Store Connect API
   key or in-app purchase key) and Play (service-account JSON), create the
   entitlement, products and offering, and configure the webhook URL and
   `Authorization` value.
7. Create the subscription group and products in App Store Connect, and the base
   plans in Play Console. Sign the Paid Apps agreement and set up tax and banking
   in both stores.
8. Create the AdMob account and app and the rewarded ad units, set the SSV
   callback URL, publish the GDPR message (EEA, UK, CH), and register test devices.
9. Supply and approve the legal copy L1–L5. Have counsel review it.
10. Re-answer App Privacy, Data safety, "Contains ads" and the age-rating
    questionnaires.
11. Run the release QA script on real devices and manage the phased and staged
    rollouts.
12. **Separately and urgently:** greenlight the AI catalog refresh (F2), since
    signed-in chat breaks on 2026-11-30 without it.

---

## 18. Out of scope, and known gaps

- **AI catalog refresh** (F2): Sonnet 4.5 → Sonnet 5.5, and Opus 4.1 → a live
  Opus or no "Capable" option. It is its own mission and is filed in BACKLOG.
  Premium's "Balanced" promise rides on it.
- **Prompt caching** on the AI lane, the largest cost lever (§6.10). It is its
  own mission.
- Web billing, interstitials, banners and personalization (Phase 3).
- **Sign in with Apple:** not part of this design. Whether guideline 4.8 applies
  to the existing Google and GitHub sign-in is a store-submission question, not a
  monetization one.
- Token economy sinks: tokens stay decoupled from money and AI (§6.1).
- **Data retention promise.** The policy's "usage-limit records … not currently
  deleted on a fixed schedule" stays true for `rate_limits`. `ai_usage` is
  cleaned daily, which L1 can say.

---

## 19. Sources (all accessed 2026-10-01)

- Apple App Review Guidelines — https://developer.apple.com/app-store/review/guidelines/
- Apple User Privacy and Data Use (ATT) — https://developer.apple.com/app-store/user-privacy-and-data-use/
- Apple Small Business Program — https://developer.apple.com/app-store/small-business-program/
- Apple, Offering account deletion in your app — https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple, Responding to App Store Server Notifications — https://developer.apple.com/documentation/appstoreservernotifications/responding-to-app-store-server-notifications
- Apple age ratings — https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/
- Google Play Payments policy — https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play US external content links program — https://support.google.com/googleplay/android-developer/answer/16470497
- Google Play expanded billing choice (June 2026) — https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
- Google Play service fees — https://support.google.com/googleplay/android-developer/answer/112622
- Play Billing integration (acknowledgement, Billing Library 8) — https://developer.android.com/google/play/billing/integrate
- Play RTDN reference — https://developer.android.com/google/play/billing/rtdn-reference
- Google Play Ads policy — https://support.google.com/googleplay/android-developer/answer/9857753
- Google Play Families policy — https://support.google.com/googleplay/android-developer/answer/9893335
- AdMob EEA/UK/CH consent (UMP, TCF) — https://support.google.com/admob/answer/10113207
- AdMob limited ads — https://support.google.com/admob/answer/10105530
- AdMob IDFA explainer / ATT — https://support.google.com/admob/answer/10115027
- UMP SDK (Android) — https://developers.google.com/admob/android/privacy
- AdMob targeting (TFCD/TFUA/max rating) — https://developers.google.com/admob/android/targeting
- AdMob rewarded SSV — https://developers.google.com/admob/android/ssv
- AdMob Play data disclosure — https://developers.google.com/admob/android/privacy/play-data-disclosure
- AdMob test ads — https://developers.google.com/admob/android/test-ads and https://developers.google.com/admob/ios/test-ads
- AdMob quick start (sample app IDs, SDK minimums) — https://developers.google.com/admob/android/quick-start and https://developers.google.com/admob/ios/quick-start
- RevenueCat pricing — https://www.revenuecat.com/pricing/
- RevenueCat webhooks — https://www.revenuecat.com/docs/integrations/webhooks
- RevenueCat identifying customers — https://www.revenuecat.com/docs/customers/identifying-customers
- RevenueCat REST API v1 — https://www.revenuecat.com/docs/api-v1
- npm registry: `@revenuecat/purchases-capacitor`, `@capacitor-community/admob`, `@capgo/native-purchases`, `cordova-plugin-purchase` (`npm view`, `npm pack --dry-run`); GitHub API for `capacitor-community/admob` and `RevenueCat/purchases-capacitor`
- Vercel fair use (commercial usage) — https://vercel.com/docs/limits/fair-use-guidelines
- Vercel limits — https://vercel.com/docs/limits
- Anthropic pricing — https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic model deprecations — https://platform.claude.com/docs/en/about-claude/model-deprecations
