# Push Sender (Daily Streak Reminder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once per local day, send one FCM push, in their own evening, to each
opted-in learner whose streak is alive through yesterday but who has not reached
today's goal yet.

**Architecture:** A Vercel Node function (`api/v1/push/streak-reminder.js`) does
the sending. It is triggered hourly by Supabase `pg_cron` + `pg_net`, because
Vercel Hobby crons run only once a day. One SQL RPC does three things in a
single statement: picks due learners in each device-reported IANA time zone,
claims them for that local day, and returns their devices. FCM HTTP v1 is
authenticated with a service-account JWT signed by `node:crypto`. The iOS app
switches to handing Capacitor an FCM token, so one API reaches both platforms.

**Tech Stack:** Vercel Node functions (ESM, Node 24), supabase-js 2,
PostgreSQL / plpgsql, Vitest 4, Capacitor 8, Swift, FCM HTTP v1. No new npm
dependency.

**Spec:** `docs/superpowers/specs/2026-10-01-push-sender-design.md`. Read §5
(time zones), §6 (eligibility), §12 (claims) and §13 (error table) before any
task.

## Global Constraints

- **FCM HTTP v1 is the only provider.** No `firebase-admin`,
  `google-auth-library` or any other new dependency. Auth uses stdlib
  `node:crypto` + `fetch`.
- **Vercel Hobby.** At most **12** deployable files under `api/` (non-`_`,
  non-`*.test.js`). No `vercel.json` cron may run more than once a day.
- **Production is off-limits.** Never apply a migration, run `db push`,
  `migration repair`, `db reset` or MCP `apply_migration`/`execute_sql`
  writes, set env vars, or call the production endpoint without `dryRun=1`.
  RLS tests run against the local stack only.
- **Reminder window.** 19:00–21:59 in the learner's zone
  (`startHour: 19`, `windowHours: 3`). At most one reminder per learner per
  local day.
- **Time zone.** The device reports
  `Intl.DateTimeFormat().resolvedOptions().timeZone`. The server stores it only
  if it is in `pg_catalog.pg_timezone_names` (1–64 characters), else `NULL`. A
  learner without a zone is **never** reminded; there is no default zone.
- **Tokens.** `user_devices` holds FCM registration tokens only. A raw 64-hex
  APNs token on `ios` is refused with `22023`.
- **Secrets.** `PUSH_CRON_SECRET` (never the league's `CRON_SECRET`) and
  `FIREBASE_SERVICE_ACCOUNT`, both Vercel Production-only. Never log tokens,
  user ids or secrets.
- **Constants.** `maxUsersPerRun: 1000`, `concurrency: 10`,
  `deadlineMs: 240000`, `maxDuration: 300`. Request timeout 10 s. One retry for
  transient failures, waiting at most 5 s.
- **Unchanged.**
  - No localStorage key renamed; `deutsch-app-push-device-v1` keeps
    `{token, userId, platform}`.
  - No German strings or `'de'` branches in `src/lib` / `src/components`.
  - `src/` modules imported by `api/` keep explicit `.js` extensions.
- **Tests.** Vitest `globals: false`: import `{ describe, it, expect, vi, … }`
  from `'vitest'`. Co-locate tests. Server tests that use `node:crypto`,
  `Response` or `AbortSignal.timeout` start with `// @vitest-environment node`.
- **Git.** One branch for the mission, work lands by PR, and `.husky/pre-commit`
  (lint-staged + full `npm test`) is never bypassed.

## Review Focus

The five inputs most likely to bite that the spec implies but does not spell
out. Each now has a test in the owning task:

1. **A DST-change day in the learner's zone.** The window and the midnight
   expiry must use that day's offset (Berlin, 2026-10-25). *Task 3: "first day
   of winter time".*
2. **Half-hour and 45-minute offset zones** (India, Nepal). The hour window must
   still open once. *Task 3: Kolkata.*
3. **Client-writable junk in `settings.data`.** A string goal or an array
   `frozenDays` must fall back to defaults, not throw and kill the tick.
   *Task 3: `junk-goal`.*
4. **The newest device reports no zone but an older one does.** Use the older
   device's real zone, and still ring every device. *Task 3: `newest-zoneless`.*
5. **A send that throws mid-run** (for example, the OAuth refresh fails). The
   run must stop and **release** the claims of learners not reached, not lose
   today's reminder. *Task 5: "a send that throws".*

## File map

| File                                                           | Task | Responsibility                                                                    |
| -------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------- |
| `api/chat.js`                                                  | 1    | **Deleted.** It becomes a rewrite                                                  |
| `vercel.json`                                                  | 1, 6 | `/api/chat` rewrite; `maxDuration` for the new function                            |
| `api/_lib/endpoints.test.js`                                   | 1    | Legacy alias now asserted as a rewrite                                             |
| `api/_lib/functionBudget.test.js`                              | 1    | Guards the 12-function cap                                                         |
| `docs/api/ai.md`                                               | 1    | Legacy-alias note                                                                  |
| `supabase/migrations/20261001120000_push_streak_reminders.sql` | 2, 3 | Zone column, register RPC v2, claims table, eligibility/claim RPC                  |
| `supabase/tests/rls/push-devices.test.js`                      | 2    | Zone + APNs-refusal behaviour of `register_push_device`                            |
| `src/lib/pushNotifications.js` (+ test)                        | 2, 7 | Sends `p_time_zone`; comment updates                                               |
| `supabase/tests/rls/streak-reminder.test.js`                   | 3    | Eligibility, claims, clocks, privilege                                             |
| `supabase/tests/rls/server-only-tables.test.js`, `policies.test.js`, `cascade.test.js` | 3    | Register the new server-only table                                                 |
| `api/_lib/fcm.js` (+ test)                                     | 4    | FCM OAuth, send, error classification                                              |
| `api/_lib/streakReminder.js` (+ test)                          | 5    | Message + run orchestration                                                        |
| `api/v1/push/streak-reminder.js` (+ test, + esm test)          | 6    | The cron endpoint                                                                  |
| `.env.example`                                                 | 6    | Documents the two new server variables                                             |
| `ios/App/App/AppDelegate.swift`                                | 7    | FCM token hand-off, guarded                                                        |
| `docs/MOBILE_PUSH_SETUP.md`, `docs/BACKLOG.md`                 | 8    | Owner runbook, backlog truth                                                       |
| `src/components/legal/PrivacyPolicy.jsx`, `src/components/settings/NotificationsSection.jsx`, `src/lib/legalVersions.js` (+ tests) | 9    | Copy approved 2026-10-01; ships only in the push-on release (D2)                   |

**Order.**

- Task 1 comes first.
- Task 3 needs Task 2 (same migration file).
- Task 5 needs Tasks 3 and 4.
- Task 6 needs Tasks 1, 4 and 5.
- Task 7 is independent.
- Task 8 comes after Tasks 1–7.
- Task 9 ships only in the release that turns push on (copy approved, D2).

**Branch.** Every task goes on **one feature branch**, for example
`feat/push-sender`, cut from up-to-date `main`. Push and open the PR after
Task 8.

---

### Task 1: Free a Vercel function slot

The project deploys exactly 12 functions, the Hobby cap. `api/chat.js` is a
legacy alias whose removal is long overdue. Turn it into a rewrite, which keeps
the URL and handler, and add a guard so a 13th file fails CI instead of the
deploy.

**Files:**

- Delete: `api/chat.js`
- Modify: `vercel.json` (rewrites)
- Modify: `api/_lib/endpoints.test.js`
- Create: `api/_lib/functionBudget.test.js`
- Modify: `docs/api/ai.md` ("Legacy alias" section)

**Interfaces:**

- Produces: `/api/chat` still reaches `chatHandler` via `api/v1/ai.js?op=chat`.
  One free function slot.

- [ ] **Step 1: Write the failing tests**

Replace `api/_lib/endpoints.test.js` entirely:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { chatHandler as chat, gradeHandler as grade, deckHandler as deck } from './aiEndpoints.js';

const { rewrites } = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('AI endpoints', () => {
  it('every route exports a handler function', () => {
    expect(typeof chat).toBe('function');
    expect(typeof grade).toBe('function');
    expect(typeof deck).toBe('function');
  });

  // /api/chat was a function file of its own (api/chat.js) until the push
  // sender needed its slot under the Hobby cap. A rewrite keeps the URL on the
  // same handler without costing a function.
  it('the legacy /api/chat URL is rewritten onto the v1 chat handler', () => {
    expect(rewrites).toContainEqual({ source: '/api/chat', destination: '/api/v1/ai?op=chat' });
  });
});
```

Create `api/_lib/functionBudget.test.js`:

```js
import { it, expect } from 'vitest';
import { readdirSync } from 'node:fs';

// Vercel deploys every .js file under api/ as its own function (except
// underscore-prefixed paths and the *.test.js files .vercelignore drops), and
// on the Hobby plan it refuses a deployment with more than 12. The account,
// progress, AI and admin lanes were each merged into one dispatcher to stay
// under that; this makes a 13th file fail CI instead of the deploy.
const HOBBY_FUNCTION_CAP = 12;

function deployedFunctions(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_')) return [];
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return deployedFunctions(path);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
  });
}

it('stays within the Hobby plan function cap', () => {
  const functions = deployedFunctions('api');
  expect(functions.length, functions.join('\n')).toBeLessThanOrEqual(HOBBY_FUNCTION_CAP);
});
```

- [ ] **Step 2: Run the tests; the rewrite test fails, and the budget test is shown to have teeth**

Run: `npx vitest run api/_lib/endpoints.test.js api/_lib/functionBudget.test.js`
Expected: `the legacy /api/chat URL is rewritten…` FAILS (no such rewrite). The
budget test PASSES (12 files).

Now prove the budget test can fail:

```bash
touch api/v1/zz-probe.js
npx vitest run api/_lib/functionBudget.test.js
rm api/v1/zz-probe.js
```

Expected: FAIL, "expected 13 to be less than or equal to 12". The probe is
removed afterwards.

- [ ] **Step 3: Implement**

`git rm api/chat.js`.

In `vercel.json`, add this line directly after the
`{ "source": "/api/v1/ai/grade", … }` rewrite:

```json
    { "source": "/api/chat", "destination": "/api/v1/ai?op=chat" },
```

In `docs/api/ai.md`, replace:

```
`POST /api/chat` → same handler as `/api/v1/ai/chat`. Kept for already-cached
PWA bundles; scheduled for removal one release cycle after B0 ships.
```

with:

```
`POST /api/chat` → same handler as `/api/v1/ai/chat`, through a `vercel.json`
rewrite to `/api/v1/ai?op=chat` (there has been no `api/chat.js` since
2026-10; its function slot went to the push sender). Kept for already-cached
PWA bundles.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run api/_lib/endpoints.test.js api/_lib/functionBudget.test.js api/v1/ai.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A api/chat.js vercel.json api/_lib/endpoints.test.js api/_lib/functionBudget.test.js docs/api/ai.md
git commit -m "refactor(api): serve legacy /api/chat by rewrite, guard the 12-function cap"
```

---

### Task 2: Device time-zone contract (migration part 1 + client)

The device reports its IANA zone on every register. The server validates it,
refuses raw APNs tokens, and purges any already stored.

**Files:**

- Create: `supabase/migrations/20261001120000_push_streak_reminders.sql`
- Modify: `supabase/tests/rls/push-devices.test.js`
- Modify: `src/lib/pushNotifications.js` (`saveToken`, new `deviceTimeZone`)
- Modify: `src/lib/pushNotifications.test.js`

**Interfaces:**

- Produces:
  - `public.user_devices.time_zone text` (nullable)
  - `public.register_push_device(p_token text, p_platform text, p_time_zone text default null)`
  - JS: `export function deviceTimeZone(): string | null` in
    `src/lib/pushNotifications.js`

- [ ] **Step 1: Write the failing RLS tests**

In `supabase/tests/rls/push-devices.test.js`:

- add `import { randomBytes } from 'node:crypto';` below the vitest import;
- make `ownerOf` select the zone: `.select('user_id, platform, updated_at, time_zone')`;
- append these blocks at the end of the file:

```js
describe('register_push_device: time zone (20261001120000)', () => {
  it('stores a zone the database knows', async () => {
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('tz-known'),
      p_platform: 'android',
      p_time_zone: 'Asia/Kolkata',
    });
    expect(error).toBeNull();
    expect((await ownerOf(token('tz-known'))).time_zone).toBe('Asia/Kolkata');
  });

  // An unknown name would make `at time zone` throw inside the sender's query
  // and fail every learner's reminder. The opt-in itself must still work.
  it('stores NULL for a name it does not know, without failing the opt-in', async () => {
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('tz-unknown'),
      p_platform: 'android',
      p_time_zone: 'Mars/Olympus_Mons',
    });
    expect(error).toBeNull();
    const row = await ownerOf(token('tz-unknown'));
    expect(row.user_id).toBe(A.id);
    expect(row.time_zone).toBeNull();
  });

  it('an older client that sends no zone clears the stale one (latest report wins)', async () => {
    const { error } = await A.client.rpc('register_push_device', {
      p_token: token('tz-known'),
      p_platform: 'android',
    });
    expect(error).toBeNull();
    expect((await ownerOf(token('tz-known'))).time_zone).toBeNull();
  });
});

describe('register_push_device: FCM tokens only (20261001120000)', () => {
  // A raw APNs device token is 32 bytes, sent as 64 hex characters. FCM's
  // HTTP v1 API cannot address one, so a build without the Firebase hand-off
  // must fail to opt in rather than store a token nothing can reach.
  it('refuses a raw APNs device token on ios', async () => {
    const raw = randomBytes(32).toString('hex');
    const { error } = await A.client.rpc('register_push_device', {
      p_token: raw,
      p_platform: 'ios',
      p_time_zone: 'Europe/Berlin',
    });
    expect(error).not.toBeNull();
    expect(error.code).toBe('22023');
    expect(await ownerOf(raw)).toBeNull();
  });

  it('accepts an FCM token on ios', async () => {
    const fcm = `${token('fcm-ios')}:APA91b${randomBytes(8).toString('hex')}`;
    const { error } = await A.client.rpc('register_push_device', {
      p_token: fcm,
      p_platform: 'ios',
      p_time_zone: 'Europe/Berlin',
    });
    expect(error).toBeNull();
    expect((await ownerOf(fcm)).time_zone).toBe('Europe/Berlin');
  });
});
```

- [ ] **Step 2: Run them to verify they fail (local stack)**

```bash
npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npx vitest run --config vitest.rls.config.js supabase/tests/rls/push-devices.test.js
```

Expected: FAIL. `ownerOf` errors on the missing `time_zone` column; the calls
with `p_time_zone` fail with PGRST202. (If Docker is unavailable, say so in the
task report. CI's required "RLS Policy Tests" job runs this suite.)

- [ ] **Step 3: Write migration part 1**

Create `supabase/migrations/20261001120000_push_streak_reminders.sql`:

```sql
-- Streak-reminder sender, the database half.
-- Design: docs/superpowers/specs/2026-10-01-push-sender-design.md (§5, §7, §12).
--
-- DO NOT apply this to production from an agent. The owner applies it to
-- Sprachschule (xcnnlczvxmuwcqwychox) after merge, with the Management API
-- procedure in docs/MOBILE_PUSH_SETUP.md §1, then runs
-- `notify pgrst, 'reload schema';`. Never `migration repair`, `db push`, or
-- MCP apply_migration. Requires 20260927120000_user_devices (applied).
--
-- ── Part 1: the device reports its time zone; tokens are FCM tokens ─────────
--
-- user_devices.time_zone is the IANA zone of the device's own clock, the zone
-- the client's todayKey() (src/lib/stats.js) uses to name the day an exercise
-- lands in. It is the only zone in which "today" means what the streak means.
-- It is re-reported on every register (every signed-in launch). A name the
-- database does not know is stored as NULL, and a device without a zone is
-- never reminded: no guessing, no default zone.
--
-- Tokens are FCM registration tokens on both platforms. The iOS app hands
-- Capacitor the FCM token (ios/App/App/AppDelegate.swift); a raw APNs device
-- token (32 bytes as 64 hex characters) is refused, and any already stored is
-- purged, because FCM's HTTP v1 API cannot address one. A purged device
-- re-registers with an FCM token on its next launch with a current build.

alter table public.user_devices add column if not exists time_zone text;

comment on column public.user_devices.time_zone is
  'IANA time zone the device reported on its last register (NULL = unknown). The sender evaluates "today" in this zone.';
comment on column public.user_devices.push_token is
  'FCM registration token (both platforms). Unique: a device rings for one account at a time.';
comment on column public.user_devices.platform is
  'ios or android. Diagnostic; one FCM message carries both platform blocks.';

delete from public.user_devices
 where platform = 'ios'
   and push_token ~ '^[0-9A-Fa-f]{64}$';

-- The 2-argument version must go: PostgREST cannot choose between it and a
-- 3-argument version with a default, and would reject every call. Older
-- clients calling with (p_token, p_platform) resolve to the new one.
drop function if exists public.register_push_device(text, text);

create or replace function public.register_push_device(
  p_token     text,
  p_platform  text,
  p_time_zone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_zone text := null;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 1 and 4096 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  if p_platform = 'ios' and p_token ~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'raw APNs token: this build cannot receive push' using errcode = '22023';
  end if;

  -- Validated, not trusted: the sender runs `at time zone` on this value.
  if p_time_zone is not null
     and char_length(p_time_zone) between 1 and 64
     and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
    v_zone := p_time_zone;
  end if;

  insert into public.user_devices (push_token, user_id, platform, time_zone)
  values (p_token, v_uid, p_platform, v_zone)
  on conflict (push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        time_zone = excluded.time_zone,
        updated_at = now();

  -- MAX_DEVICES = 10. Keep the most recently registered; the ones that fall
  -- off are the installs that have stopped launching.
  delete from public.user_devices d
   where d.user_id = v_uid
     and d.push_token in (
       select k.push_token
         from public.user_devices k
        where k.user_id = v_uid
        order by k.updated_at desc, k.push_token
        offset 10
     );
end
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated, service_role;
```

Apply it to the **local** stack only: `npx supabase db reset --local`, or
restart the stack. The local reset rebuilds from `supabase/migrations/`; never
run it against the linked project.

- [ ] **Step 4: Run the RLS tests to verify they pass**

Run: `npx vitest run --config vitest.rls.config.js supabase/tests/rls/push-devices.test.js`
Expected: PASS, including the older blocks. Their 2-argument calls still
resolve.

- [ ] **Step 5: Write the failing client tests**

In `src/lib/pushNotifications.test.js`:

1. Add `deviceTimeZone,` to the import list from `'./pushNotifications.js'`.
2. At the **end** of the top-level `beforeEach`, add:

```js
  // A fixed zone, so the RPC arguments are the same on every machine.
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
    return { resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }) };
  });
```

3. In the top-level `afterEach`, add `vi.restoreAllMocks();`.
4. In the three `toHaveBeenCalledWith('register_push_device', { … })`
   assertions (`asks, registers, and saves…`, `reports the platform…`,
   `re-registers an opted-in device…`), add `p_time_zone: 'Europe/Berlin',` as
   the last property.
5. Append:

```js
describe('deviceTimeZone', () => {
  // The same clock todayKey() reads. The server needs it to know when the
  // learner's day ends; locale and language are never consulted.
  it('reports the zone of the device clock', () => {
    Intl.DateTimeFormat.mockImplementation(function () {
      return { resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }) };
    });
    expect(deviceTimeZone()).toBe('Asia/Kolkata');
  });

  it('is null when the platform cannot say, and opting in still works', async () => {
    Intl.DateTimeFormat.mockImplementation(function () {
      throw new RangeError('no ICU data');
    });
    expect(deviceTimeZone()).toBeNull();
    goNative('android');
    pushOn();
    expect(await enablePush('u1')).toEqual({ ok: true });
    expect(backend.rpc).toHaveBeenCalledWith('register_push_device', {
      p_token: 'device-token-1',
      p_platform: 'android',
      p_time_zone: null,
    });
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/lib/pushNotifications.test.js`
Expected: FAIL. `deviceTimeZone` is not exported, and the RPC args lack
`p_time_zone`.

- [ ] **Step 7: Implement the client change**

In `src/lib/pushNotifications.js`, replace `saveToken`:

```js
function saveToken(token, platform) {
  return rpc('register_push_device', { p_token: token, p_platform: platform });
}
```

with:

```js
/**
 * The IANA zone of this device's clock, the one todayKey() (stats.js) uses to
 * name "today". The sender needs it to know when the learner's day ends
 * (docs/superpowers/specs/2026-10-01-push-sender-design.md §5). Never inferred
 * from locale. Null when the platform cannot say; the server then simply does
 * not remind this device.
 */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function saveToken(token, platform) {
  return rpc('register_push_device', {
    p_token: token,
    p_platform: platform,
    p_time_zone: deviceTimeZone(),
  });
}
```

- [ ] **Step 8: Run the client tests to verify they pass**

Run: `npx vitest run src/lib/pushNotifications.test.js src/components/settings`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261001120000_push_streak_reminders.sql supabase/tests/rls/push-devices.test.js src/lib/pushNotifications.js src/lib/pushNotifications.test.js
git commit -m "feat(push): devices report their time zone; user_devices holds FCM tokens only"
```

---

### Task 3: Claims table and the eligibility/claim RPC (migration part 2)

**Files:**

- Modify: `supabase/migrations/20261001120000_push_streak_reminders.sql`
  (append part 2)
- Create: `supabase/tests/rls/streak-reminder.test.js`
- Modify: `supabase/tests/rls/server-only-tables.test.js`,
  `supabase/tests/rls/policies.test.js`, `supabase/tests/rls/cascade.test.js`

**Interfaces:**

- Consumes: `user_devices.time_zone` (Task 2), `public.progress_day_xp(jsonb)`,
  `public.stats_daily`, `public.settings`, `public.profiles.blocked_at`.
- Produces:
  - Table `public.push_reminder_claims(user_id uuid, local_day date, claimed_at timestamptz)`,
    primary key `(user_id, local_day)`.
  - RPC `public.claim_streak_reminders(p_now timestamptz, p_start_hour integer, p_window_hours integer, p_default_goal integer, p_pack_id text, p_limit integer, p_only_user uuid default null, p_dry_run boolean default false)`
    returning setof `(user_id uuid, local_day date, expires_at timestamptz, push_token text)`,
    one row per device of each due (claimed) learner.
  - Via PostgREST, `local_day` arrives as `'YYYY-MM-DD'` and `expires_at` as an
    ISO string.

- [ ] **Step 1: Write the failing RLS tests**

Create `supabase/tests/rls/streak-reminder.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// claim_streak_reminders (20261001120000): who is due a streak reminder at a
// given instant, and the claim that makes it at most one per local day.
// Every call passes p_now, so nothing here depends on the real clock or on what
// other suites write for the current week.
//
// Requires the local stack: `supabase start` (Docker), then `npm run test:rls`.

const admin = adminClient();
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// 17:10Z on 2026-10-01 is 19:10 in Berlin (CEST): inside the 19–21 window.
// New York is at 13:10 and Kolkata at 22:40, both outside it.
const NOW = '2026-10-01T17:10:00Z';
const TODAY = '2026-10-01';
const YESTERDAY = '2026-09-30';

const PARAMS = {
  p_start_hour: 19,
  p_window_hours: 3,
  p_default_goal: 50,
  p_pack_id: 'de',
  p_limit: 10000,
};

const DUE_AT_NOW = [
  'due',
  'frozen-yesterday',
  'goal-20-at-risk',
  'junk-goal',
  'newest-zoneless',
  'two-devices',
];

// n correct A1 answers = 10n XP, the weight progress_day_xp uses.
const counters = (correct) => ({
  total: correct,
  bonusXp: 0,
  byTab: { chat: 0, alphabet: 0, vocab: correct, translate: 0 },
  byLevel: {
    a1: { correct, almost: 0, wrong: 0 },
    a2: { correct: 0, almost: 0, wrong: 0 },
    b1: { correct: 0, almost: 0, wrong: 0 },
  },
});

const users = {};

async function must(query) {
  const { error } = await query;
  if (error) throw error;
}

async function learner(label, { devices = [{ zone: 'Europe/Berlin' }], days = {}, settings = null, blocked = false } = {}) {
  const user = await createSignedInUser(`reminder-${label}`);
  const tokens = [];
  for (const [i, device] of devices.entries()) {
    const token = `reminder-${RUN}-${label}-${i}`;
    tokens.push(token);
    await must(
      admin.from('user_devices').insert({
        push_token: token,
        user_id: user.id,
        platform: 'android',
        time_zone: device.zone,
        updated_at: device.updatedAt ?? new Date(Date.now() + i * 1000).toISOString(),
      })
    );
  }
  for (const [day, correct] of Object.entries(days)) {
    await must(
      admin.from('stats_daily').insert({ user_id: user.id, pack_id: 'de', day, counters: counters(correct) })
    );
  }
  if (settings) await must(admin.from('settings').upsert({ user_id: user.id, data: settings }));
  if (blocked) {
    await must(admin.from('profiles').update({ blocked_at: new Date().toISOString() }).eq('user_id', user.id));
  }
  users[label] = { ...user, tokens };
}

async function claim(extra = {}) {
  const { data, error } = await admin.rpc('claim_streak_reminders', { p_now: NOW, ...PARAMS, ...extra });
  if (error) throw error;
  return data;
}

// Only the learners this file made; rows for other suites' users are ignored.
function ours(rows) {
  const ids = new Set(Object.values(users).map((u) => u.id));
  return rows.filter((row) => ids.has(row.user_id));
}

function labels(rows) {
  const byId = new Map(Object.entries(users).map(([label, u]) => [u.id, label]));
  return [...new Set(ours(rows).map((row) => byId.get(row.user_id)))].sort();
}

beforeAll(async () => {
  const atRisk = { [YESTERDAY]: 5, [TODAY]: 4 }; // 50 XP yesterday, 40 today
  await learner('due', { days: atRisk });
  await learner('done-today', { days: { [YESTERDAY]: 5, [TODAY]: 5 } });
  await learner('no-streak', { days: { [TODAY]: 1 } });
  await learner('frozen-yesterday', { settings: { frozenDays: { [YESTERDAY]: true } } });
  // Due ONLY because the learner's own goal (20) is read: under the default 50,
  // yesterday's 20 XP would not have counted.
  await learner('goal-20-at-risk', { days: { [YESTERDAY]: 2, [TODAY]: 1 }, settings: { goal: 20 } });
  // settings.data is client-writable: junk must fall back, never throw.
  await learner('junk-goal', { days: atRisk, settings: { goal: 'lots', frozenDays: ['nope'] } });
  await learner('new-york', { devices: [{ zone: 'America/New_York' }], days: atRisk });
  await learner('no-zone', { devices: [{ zone: null }], days: atRisk });
  await learner('blocked', { days: atRisk, blocked: true });
  await learner('two-devices', {
    devices: [
      { zone: 'America/New_York', updatedAt: '2026-09-01T00:00:00Z' },
      { zone: 'Europe/Berlin', updatedAt: '2026-09-30T00:00:00Z' },
    ],
    days: atRisk,
  });
  await learner('newest-zoneless', {
    devices: [
      { zone: 'Europe/Berlin', updatedAt: '2026-09-01T00:00:00Z' },
      { zone: null, updatedAt: '2026-09-30T00:00:00Z' },
    ],
    days: atRisk,
  });
  await learner('berlin-dst', { days: { '2026-10-24': 5, '2026-10-25': 0 } });
  await learner('kolkata', { devices: [{ zone: 'Asia/Kolkata' }], days: { [YESTERDAY]: 5 } });
}, 120000);

afterAll(async () => {
  for (const user of Object.values(users)) {
    await admin.from('push_reminder_claims').delete().eq('user_id', user.id);
    await admin.from('user_devices').delete().eq('user_id', user.id);
    await admin.from('stats_daily').delete().eq('user_id', user.id);
  }
});

describe('claim_streak_reminders: privilege and parameters', () => {
  it('anon cannot execute it', async () => {
    const { error } = await anonClient().rpc('claim_streak_reminders', { p_now: NOW, ...PARAMS, p_dry_run: true });
    expect(error).not.toBeNull();
  });

  it('a signed-in learner cannot execute it', async () => {
    const { error } = await users.due.client.rpc('claim_streak_reminders', {
      p_now: NOW,
      ...PARAMS,
      p_dry_run: true,
    });
    expect(error).not.toBeNull();
  });

  it('rejects a window that runs past midnight', async () => {
    const { error } = await admin.rpc('claim_streak_reminders', {
      p_now: NOW,
      ...PARAMS,
      p_start_hour: 22,
      p_window_hours: 3,
      p_dry_run: true,
    });
    expect(error?.code).toBe('22023');
  });
});

describe('claim_streak_reminders: who is due (dry run)', () => {
  it('selects exactly the learners whose streak is at risk in their own evening', async () => {
    expect(labels(await claim({ p_dry_run: true }))).toEqual(DUE_AT_NOW);
  });

  it('returns every device of a due learner, zone from the newest device that has one', async () => {
    const rows = ours(await claim({ p_dry_run: true }));
    for (const label of ['two-devices', 'newest-zoneless']) {
      const mine = rows.filter((row) => row.user_id === users[label].id);
      expect(mine.map((row) => row.push_token).sort()).toEqual([...users[label].tokens].sort());
      for (const row of mine) {
        expect(row.local_day).toBe(TODAY);
        // 2026-10-02 00:00 in Berlin (CEST, UTC+2)
        expect(new Date(row.expires_at).toISOString()).toBe('2026-10-01T22:00:00.000Z');
      }
    }
  });

  it('claims nothing on a dry run', async () => {
    const ids = Object.values(users).map((u) => u.id);
    const { data, error } = await admin.from('push_reminder_claims').select('user_id').in('user_id', ids);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('p_only_user ignores the hour window but not the streak rule', async () => {
    expect(labels(await claim({ p_dry_run: true, p_only_user: users['new-york'].id }))).toEqual(['new-york']);
    expect(labels(await claim({ p_dry_run: true, p_only_user: users['done-today'].id }))).toEqual([]);
  });
});

describe('claim_streak_reminders: claiming', () => {
  it('claims each due learner once per local day', async () => {
    expect(labels(await claim())).toEqual(DUE_AT_NOW);
    expect(labels(await claim())).toEqual([]);
  });

  it('a claim holds for the rest of the window', async () => {
    expect(labels(await claim({ p_now: '2026-10-01T19:55:00Z' }))).toEqual([]); // 21:55 Berlin
  });

  it('a released claim is picked up by the next tick', async () => {
    await must(admin.from('push_reminder_claims').delete().eq('user_id', users.due.id).eq('local_day', TODAY));
    expect(labels(await claim({ p_now: '2026-10-01T18:10:00Z' }))).toEqual(['due']);
  });

  it('prunes claims older than eight days on a real run', async () => {
    await must(
      admin
        .from('push_reminder_claims')
        .insert({ user_id: users['no-streak'].id, local_day: '2026-09-01', claimed_at: '2026-09-01T18:00:00Z' })
    );
    await claim();
    const { data } = await admin.from('push_reminder_claims').select('local_day').eq('user_id', users['no-streak'].id);
    expect(data).toEqual([]);
  });
});

describe('claim_streak_reminders: clocks', () => {
  it('uses the offset in force that day (Berlin, first day of winter time)', async () => {
    // 18:10Z on 2026-10-25 is 19:10 CET (UTC+1, the day the clocks went back).
    const rows = ours(await claim({ p_now: '2026-10-25T18:10:00Z', p_dry_run: true }));
    expect(labels(rows)).toEqual(['berlin-dst']);
    expect(new Date(rows[0].expires_at).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('opens the window once in a half-hour offset zone (Kolkata, UTC+5:30)', async () => {
    // 13:40Z is 19:10 IST.
    const rows = ours(await claim({ p_now: '2026-10-01T13:40:00Z', p_dry_run: true }));
    expect(labels(rows)).toEqual(['kolkata']);
    expect(new Date(rows[0].expires_at).toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });
});
```

Register the new table with the existing server-only guards:

- In `supabase/tests/rls/server-only-tables.test.js`:
  - add `'push_reminder_claims',` to `TABLES`;
  - add this line to `SERVICE_ROLE_DML`:

    ```js
      // 20261001120000: the sender claims, releases and prunes; never edits a claim.
      push_reminder_claims: ['SELECT', 'INSERT', 'DELETE'],
    ```

  - add `'push_reminder_claims.no client access',` to the sorted expected
    policy list, directly after `'progress_events_seen.no client access',`.
- In `supabase/tests/rls/policies.test.js`:
  - add to `SERVER_ONLY`:

    ```js
      push_reminder_claims: {
        insert: { user_id: null, local_day: '2026-10-01' },
        update: { local_day: '2026-10-02' },
        filterCol: 'local_day',
        filterVal: '2026-10-01',
      },
    ```

  - change
    `const OWNED_INSERT = new Set(['progress_events_seen', 'user_devices']);`
    to
    `const OWNED_INSERT = new Set(['progress_events_seen', 'user_devices', 'push_reminder_claims']);`.
- In `supabase/tests/rls/cascade.test.js`:
  - add `'push_reminder_claims',` to `USER_OWNED`;
  - add to the `seed` array:

    ```js
        admin.from('push_reminder_claims').insert({ user_id: userId, local_day: '2026-10-01' }),
    ```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --config vitest.rls.config.js supabase/tests/rls/streak-reminder.test.js supabase/tests/rls/server-only-tables.test.js supabase/tests/rls/policies.test.js supabase/tests/rls/cascade.test.js`
Expected: FAIL. The function and table do not exist.

- [ ] **Step 3: Append migration part 2**

Append to `supabase/migrations/20261001120000_push_streak_reminders.sql`:

```sql

-- ── Part 2: the claim, and who is due ──────────────────────────────────────
--
-- push_reminder_claims is NOT a notification history. One row means "this
-- learner's streak reminder for this local day is taken". The sender claims
-- BEFORE sending, in the same statement that selects the learner, so a
-- duplicated or overlapping tick (pg_cron and pg_net are at-least-once) finds
-- the row and sends nothing. A run that could not reach a learner releases the
-- row (the sender deletes it), so a later tick inside the window retries. Real
-- runs prune rows older than 8 days; account deletion cascades.

create table if not exists public.push_reminder_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_day  date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, local_day)
);

comment on table public.push_reminder_claims is
  'At most one streak reminder per learner per local day. Server-only; written by claim_streak_reminders and the sender.';

alter table public.push_reminder_claims enable row level security;

drop policy if exists "no client access" on public.push_reminder_claims;
create policy "no client access"
  on public.push_reminder_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- service_role too, then back exactly what the sender uses: a claim is
-- inserted, read and deleted, never edited (server-only-tables.test.js asserts
-- the withheld UPDATE).
revoke all on table public.push_reminder_claims from anon, authenticated, service_role;
grant select, insert, delete on table public.push_reminder_claims to service_role;

-- Due = opted in (a device row), a zone resolves (the newest device that
-- reports one), local hour in [p_start_hour, p_start_hour + p_window_hours),
-- not blocked, today's XP below the goal, and yesterday counted (XP at the goal
-- or a frozen day). The same rule as src/lib/streak.js, minus freeze
-- simulation (spec §6). The goal is settings.data.goal when it is a number in
-- [1, 1000], else p_default_goal (the sender passes DEFAULT_GOAL).
--
-- ponytail: resolving zones scans user_devices once per tick. That is fine to
-- ~1e5 devices; past that, precompute a UTC-offset bucket per device.
create or replace function public.claim_streak_reminders(
  p_now          timestamptz,
  p_start_hour   integer,
  p_window_hours integer,
  p_default_goal integer,
  p_pack_id      text,
  p_limit        integer,
  p_only_user    uuid default null,
  p_dry_run      boolean default false
)
returns table (user_id uuid, local_day date, expires_at timestamptz, push_token text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_now is null
     or p_start_hour is null or p_start_hour not between 0 and 23
     or p_window_hours is null or p_window_hours < 1
     or p_start_hour + p_window_hours > 24
     or p_default_goal is null or p_default_goal < 1
     or p_limit is null or p_limit not between 1 and 10000
     or p_pack_id is null then
    raise exception 'invalid reminder parameters' using errcode = '22023';
  end if;

  if not coalesce(p_dry_run, false) then
    delete from public.push_reminder_claims c
     where c.claimed_at < p_now - interval '8 days';
  end if;

  return query
  with zone as (
    select distinct on (d.user_id) d.user_id, d.time_zone
      from public.user_devices d
     where d.time_zone is not null
       and (p_only_user is null or d.user_id = p_only_user)
     order by d.user_id, d.updated_at desc, d.push_token
  ), due as (
    select z.user_id,
           z.time_zone,
           (p_now at time zone z.time_zone)::date as day
      from zone z
     where p_only_user is not null
        or extract(hour from (p_now at time zone z.time_zone))
             between p_start_hour and p_start_hour + p_window_hours - 1
  ), eligible as (
    select du.user_id, du.time_zone, du.day
      from due du
      left join public.settings s on s.user_id = du.user_id
      left join public.stats_daily t
        on t.user_id = du.user_id and t.pack_id = p_pack_id and t.day = du.day
      left join public.stats_daily y
        on y.user_id = du.user_id and y.pack_id = p_pack_id and y.day = du.day - 1
      -- Nested CASE, not AND: Postgres does not promise to evaluate the type
      -- test before the cast, and settings.data is client-writable ('lots').
      cross join lateral (
        select case
                 when jsonb_typeof(s.data -> 'goal') = 'number' then
                   case
                     when (s.data ->> 'goal')::numeric between 1 and 1000
                     then floor((s.data ->> 'goal')::numeric)::integer
                     else p_default_goal
                   end
                 else p_default_goal
               end as goal
      ) g
     where coalesce(public.progress_day_xp(t.counters), 0) < g.goal
       and (coalesce(public.progress_day_xp(y.counters), 0) >= g.goal
            or coalesce(s.data -> 'frozenDays' ->> to_char(du.day - 1, 'YYYY-MM-DD'), '') = 'true')
       and not exists (
             select 1 from public.profiles p
              where p.user_id = du.user_id and p.blocked_at is not null)
       and not exists (
             select 1 from public.push_reminder_claims c
              where c.user_id = du.user_id and c.local_day = du.day)
     order by du.user_id
     limit p_limit
  ), claimed as (
    insert into public.push_reminder_claims as c (user_id, local_day)
    select e.user_id, e.day
      from eligible e
     where not coalesce(p_dry_run, false)
    on conflict do nothing
    returning c.user_id, c.local_day
  ), chosen as (
    select cl.user_id, cl.local_day from claimed cl
    union all
    select e.user_id, e.day from eligible e where coalesce(p_dry_run, false)
  )
  select ch.user_id,
         ch.local_day,
         ((ch.local_day + 1)::timestamp at time zone e.time_zone) as expires_at,
         d.push_token
    from chosen ch
    join eligible e on e.user_id = ch.user_id
    join public.user_devices d on d.user_id = ch.user_id
   order by ch.user_id, d.push_token;
end
$$;

revoke all on function public.claim_streak_reminders(timestamptz, integer, integer, integer, text, integer, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_streak_reminders(timestamptz, integer, integer, integer, text, integer, uuid, boolean) to service_role;
```

Reset the **local** stack (`npx supabase db reset --local`).

- [ ] **Step 4: Run the RLS tests to verify they pass**

Run: `npx vitest run --config vitest.rls.config.js`
Expected: the whole RLS suite PASSES.

If one test fails, fix the SQL, not the test, unless the test contradicts spec
§6. Common snag: an "ambiguous column" error means a reference is unqualified;
qualify it with its alias.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261001120000_push_streak_reminders.sql supabase/tests/rls/
git commit -m "feat(push): claim_streak_reminders RPC and per-day reminder claims"
```

---

### Task 4: FCM HTTP v1 client

**Files:**

- Create: `api/_lib/fcm.js`
- Test: `api/_lib/fcm.test.js`

**Interfaces:**

- Produces:
  - `parseServiceAccount(raw: string | undefined): { projectId, clientEmail, privateKey } | null`
  - `signAssertion({ clientEmail, privateKey }, nowSeconds: number): string`
  - `classifyFcmError(status: number, body: object | null): { outcome: 'dead' | 'retry' | 'quota' | 'config' | 'fatal', code: string }`
  - `class FcmAuthError extends Error`
  - `createFcmClient({ serviceAccount, fetchImpl?, now?, sleep? }): { accessToken(): Promise<string>, send(message): Promise<{ outcome: 'sent' | 'dead' | 'retry' | 'quota' | 'config' | 'fatal', code?: string }> }`
  - `accessToken()` throws `FcmAuthError`. `send()` retries a `retry` outcome
    once and never throws for an HTTP or network failure. It rethrows
    `FcmAuthError` from `accessToken()`.

- [ ] **Step 1: Write the failing tests**

Create `api/_lib/fcm.test.js`:

```js
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  parseServiceAccount,
  signAssertion,
  classifyFcmError,
  createFcmClient,
  FcmAuthError,
} from './fcm.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const SA = {
  projectId: 'sprachschule-test',
  clientEmail: 'push-sender@sprachschule-test.iam.gserviceaccount.com',
  privateKey,
};
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const json = (body, status = 200, headers = {}) =>
  new Response(body === null ? 'not json' : JSON.stringify(body), { status, headers });

// FCM's error envelope: google.rpc.Status with an FcmError detail.
function fcmError(status, rpcStatus, errorCode, message = 'error', extraDetails = []) {
  const details = errorCode
    ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }]
    : [];
  return { error: { code: status, message, status: rpcStatus, details: [...details, ...extraDetails] } };
}

// Token endpoint always answers; FCM answers from `responses`, then 200s.
function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (url === TOKEN_URL) {
      return json({ access_token: `at-${calls.filter((c) => c.url === TOKEN_URL).length}`, expires_in: 3600 });
    }
    const next = queue.shift() ?? json({ name: 'projects/sprachschule-test/messages/1' });
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl, calls, tokenCalls: () => calls.filter((c) => c.url === TOKEN_URL).length };
}

describe('parseServiceAccount', () => {
  it('reads the three fields it needs from the downloaded key file', () => {
    const raw = JSON.stringify({
      type: 'service_account',
      project_id: 'p',
      private_key_id: 'ignored',
      private_key: 'k',
      client_email: 'e@p.iam.gserviceaccount.com',
    });
    expect(parseServiceAccount(raw)).toEqual({ projectId: 'p', clientEmail: 'e@p.iam.gserviceaccount.com', privateKey: 'k' });
  });

  it.each([[undefined], [''], ['{not json'], [JSON.stringify({ project_id: 'p' })]])(
    'reads %j as not configured',
    (raw) => {
      expect(parseServiceAccount(raw)).toBeNull();
    }
  );
});

describe('signAssertion', () => {
  it('signs an RS256 JWT Google can verify, scoped to FCM only', () => {
    const jwt = signAssertion(SA, 1790000000);
    const [header, claims, signature] = jwt.split('.');
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(claims)).toEqual({
      iss: SA.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URL,
      iat: 1790000000,
      exp: 1790003600,
    });
    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(verified).toBe(true);
  });
});

describe('access token', () => {
  it('exchanges a jwt-bearer grant and reuses the token until a minute before expiry', async () => {
    let clock = 1790000000000;
    const { fetchImpl, calls, tokenCalls } = fakeFetch();
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, now: () => clock });
    await fcm.send({ token: 't1' });
    await fcm.send({ token: 't2' });
    expect(tokenCalls()).toBe(1);
    const grant = new URLSearchParams(calls[0].init.body);
    expect(grant.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(grant.get('assertion').split('.')).toHaveLength(3);

    clock += 3600000 - 59000; // inside the one-minute margin
    await fcm.send({ token: 't3' });
    expect(tokenCalls()).toBe(2);
  });

  it('reports a refused exchange as FcmAuthError', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    await expect(fcm.accessToken()).rejects.toBeInstanceOf(FcmAuthError);
  });

  it('reports an unreachable token endpoint as FcmAuthError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    await expect(fcm.accessToken()).rejects.toBeInstanceOf(FcmAuthError);
  });
});

describe('send', () => {
  it('posts { message } to the project endpoint with the bearer token', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl });
    expect(await fcm.send({ token: 't1' })).toEqual({ outcome: 'sent' });
    const call = calls.find((c) => c.url !== TOKEN_URL);
    expect(call.url).toBe('https://fcm.googleapis.com/v1/projects/sprachschule-test/messages:send');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers.authorization).toBe('Bearer at-1');
    expect(JSON.parse(call.init.body)).toEqual({ message: { token: 't1' } });
  });

  it('retries a transient failure once, honouring Retry-After', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([json(fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'), 503, { 'retry-after': '2' })]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    expect((await fcm.send({ token: 't' })).outcome).toBe('sent');
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('caps the retry wait at five seconds', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([json(fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'), 503, { 'retry-after': '120' })]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    await fcm.send({ token: 't' });
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('gives up after one retry', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([
      json(fcmError(500, 'INTERNAL', 'INTERNAL'), 500),
      json(fcmError(500, 'INTERNAL', 'INTERNAL'), 500),
    ]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    expect((await fcm.send({ token: 't' })).outcome).toBe('retry');
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('treats a network failure or timeout as retryable, never as a throw', async () => {
    const { fetchImpl } = fakeFetch([new TypeError('socket hang up'), new DOMException('timed out', 'TimeoutError')]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep: async () => {} });
    expect(await fcm.send({ token: 't' })).toMatchObject({ outcome: 'retry', code: 'NETWORK' });
  });

  it('does not retry quota: FCM asks for at least a minute', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = fakeFetch([json(fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'), 429)]);
    const fcm = createFcmClient({ serviceAccount: SA, fetchImpl, sleep });
    expect((await fcm.send({ token: 't' })).outcome).toBe('quota');
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('classifyFcmError', () => {
  const tokenViolation = [
    { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token' }] },
  ];
  it.each([
    ['UNREGISTERED', 404, fcmError(404, 'NOT_FOUND', 'UNREGISTERED'), 'dead'],
    [
      'an invalid token (message)',
      400,
      fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token'),
      'dead',
    ],
    ['an invalid token (field)', 400, fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value', tokenViolation), 'dead'],
    ['an invalid payload', 400, fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at message.android.ttl'), 'fatal'],
    ['SENDER_ID_MISMATCH', 403, fcmError(403, 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH'), 'config'],
    ['THIRD_PARTY_AUTH_ERROR', 401, fcmError(401, 'UNAUTHENTICATED', 'THIRD_PARTY_AUTH_ERROR'), 'config'],
    ['our refused credentials', 401, fcmError(401, 'UNAUTHENTICATED', null), 'fatal'],
    ['a missing IAM role', 403, fcmError(403, 'PERMISSION_DENIED', null), 'fatal'],
    ['a wrong project id', 404, fcmError(404, 'NOT_FOUND', null), 'fatal'],
    ['QUOTA_EXCEEDED', 429, fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'), 'quota'],
    ['UNAVAILABLE', 503, fcmError(503, 'UNAVAILABLE', 'UNAVAILABLE'), 'retry'],
    ['INTERNAL', 500, fcmError(500, 'INTERNAL', 'INTERNAL'), 'retry'],
    ['an unparseable 502', 502, null, 'retry'],
  ])('classifies %s (HTTP %i)', (_label, status, body, outcome) => {
    expect(classifyFcmError(status, body).outcome).toBe(outcome);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run api/_lib/fcm.test.js`
Expected: FAIL with "Failed to resolve import ./fcm.js".

- [ ] **Step 3: Implement**

Create `api/_lib/fcm.js`:

```js
// Firebase Cloud Messaging HTTP v1, the only push provider (owner decision;
// docs/superpowers/specs/2026-10-01-push-sender-design.md §9, §13).
//
// Stdlib only: the OAuth token is a service-account JWT signed with node:crypto
// and exchanged at Google's token endpoint, so no Google SDK ships in the
// function bundle. HTTP v1 has no batch send; the caller bounds concurrency.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REQUEST_TIMEOUT_MS = 10000;
// Refresh this long before Google's expiry, so a token never dies mid-run.
const TOKEN_MARGIN_MS = 60000;
// One retry for a transient failure, waiting at most this long. Longer
// back-offs belong to the next hourly tick, not to a 300s function.
const MAX_RETRY_WAIT_MS = 5000;
const DEFAULT_RETRY_WAIT_MS = 1000;

/** Google refused (or could not be asked for) an access token. Nothing was sent. */
export class FcmAuthError extends Error {}

/**
 * FIREBASE_SERVICE_ACCOUNT holds the whole downloaded JSON key. Null when it is
 * absent or unusable, which callers treat as "not configured".
 */
export function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    const key = JSON.parse(raw);
    if (
      typeof key.project_id === 'string' &&
      typeof key.client_email === 'string' &&
      typeof key.private_key === 'string'
    ) {
      return { projectId: key.project_id, clientEmail: key.client_email, privateKey: key.private_key };
    }
  } catch {
    // unparseable: not configured
  }
  return null;
}

const base64url = (text) => Buffer.from(text, 'utf8').toString('base64url');

/** RFC 7523 assertion for Google's token endpoint, scoped to FCM only. */
export function signAssertion({ clientEmail, privateKey }, nowSeconds) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 })
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/**
 * One failed FCM response → what the sender does about it (spec §13).
 *   dead    this token will never work again: delete the row
 *   retry   transient: another attempt may succeed
 *   quota   FCM asks for >= 1 minute of backoff: stop the run
 *   config  Firebase-side setup (APNs key, wrong project): keep tokens, report
 *   fatal   our request or credentials are wrong: stop the run
 */
export function classifyFcmError(status, body) {
  const error = body?.error ?? {};
  const details = Array.isArray(error.details) ? error.details : [];
  const code =
    details.find((detail) => typeof detail?.errorCode === 'string')?.errorCode ??
    error.status ??
    `HTTP_${status}`;
  const aboutToken =
    /registration token/i.test(error.message ?? '') ||
    details.some((detail) =>
      (detail?.fieldViolations ?? []).some((violation) => violation?.field === 'message.token')
    );

  if (code === 'UNREGISTERED') return { outcome: 'dead', code };
  if (code === 'INVALID_ARGUMENT') return { outcome: aboutToken ? 'dead' : 'fatal', code };
  // Every token comes from this app's one Firebase project, so a mismatch means
  // the SERVER's credentials point elsewhere. Deleting would wipe live tokens.
  if (code === 'SENDER_ID_MISMATCH' || code === 'THIRD_PARTY_AUTH_ERROR') return { outcome: 'config', code };
  if (code === 'QUOTA_EXCEEDED' || status === 429) return { outcome: 'quota', code };
  if (status >= 500) return { outcome: 'retry', code };
  return { outcome: 'fatal', code };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createFcmClient({ serviceAccount, fetchImpl = fetch, now = Date.now, sleep = wait }) {
  let cached = null; // { token, expiresAt } — survives while the instance is warm

  async function accessToken() {
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now()) return cached.token;
    const assertion = signAssertion(serviceAccount, Math.floor(now() / 1000));
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new FcmAuthError(`token request failed: ${error?.name ?? 'error'}`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new FcmAuthError(`token exchange refused (HTTP ${response.status})`);
    }
    cached = { token: body.access_token, expiresAt: now() + (Number(body.expires_in) || 3600) * 1000 };
    return cached.token;
  }

  async function attempt(message) {
    const token = await accessToken();
    let response;
    try {
      response = await fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
    } catch {
      // Timeout or network: FCM may or may not have accepted it. A retry is
      // safe to show because the message carries a collapse key (spec §10).
      return { outcome: 'retry', code: 'NETWORK', retryAfterMs: null };
    }
    if (response.ok) return { outcome: 'sent' };
    const body = await response.json().catch(() => null);
    const seconds = Number(response.headers.get('retry-after'));
    return {
      ...classifyFcmError(response.status, body),
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
    };
  }

  async function send(message) {
    const first = await attempt(message);
    if (first.outcome === 'sent') return first;
    if (first.outcome !== 'retry') return { outcome: first.outcome, code: first.code };
    await sleep(Math.min(first.retryAfterMs ?? DEFAULT_RETRY_WAIT_MS, MAX_RETRY_WAIT_MS));
    const second = await attempt(message);
    return second.outcome === 'sent' ? second : { outcome: second.outcome, code: second.code };
  }

  return { accessToken, send };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run api/_lib/fcm.test.js`
Expected: PASS. The `'posts { message }…'` test expects exactly
`{ outcome: 'sent' }`, which is why `send` returns `first` untouched on
success.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/fcm.js api/_lib/fcm.test.js
git commit -m "feat(push): FCM HTTP v1 client with stdlib OAuth and error classification"
```

---

### Task 5: The reminder run

**Files:**

- Create: `api/_lib/streakReminder.js`
- Test: `api/_lib/streakReminder.test.js`

**Interfaces:**

- Consumes:
  - `claim_streak_reminders` rows `{ user_id, local_day, expires_at, push_token }`
    (Task 3);
  - `fcm.accessToken()` and `fcm.send(message)` from Task 4, whose outcomes
    are `'sent' | 'dead' | 'retry' | 'quota' | 'config' | 'fatal'`;
  - `DEFAULT_GOAL` from `src/lib/gameConfig.js`.
- Produces:
  - `REMINDER` constants;
  - `COPY { title, body }`;
  - `buildReminderMessage({ token, localDay, expiresAt: number(ms), now: number(ms) })`;
  - `runStreakReminders({ db, fcm, dryRun?, onlyUserId?, now?, config? }): Promise<Summary>`,
    where `Summary` is
    `{ dryRun, due, devices, sent, dead, failed, configErrors, released, devicesWithoutZone, aborted: null | 'quota' | 'fatal' | 'deadline' }`;
  - `fcm` may be `null` when `dryRun`;
  - it throws when the RPC errors or when `fcm.accessToken()` throws
    (`FcmAuthError`), in both cases before any claim.

- [ ] **Step 1: Write the failing tests**

Create `api/_lib/streakReminder.test.js`:

```js
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { REMINDER, COPY, buildReminderMessage, runStreakReminders } from './streakReminder.js';

const NOW = Date.parse('2026-10-01T17:10:00Z');
const MIDNIGHT_BERLIN = '2026-10-01T22:00:00+00:00';

const row = (userId, token, localDay = '2026-10-01', expiresAt = MIDNIGHT_BERLIN) => ({
  user_id: userId,
  local_day: localDay,
  expires_at: expiresAt,
  push_token: token,
});

// A supabase-js stand-in: rpc, a head count on user_devices, and thenable
// delete chains whose filters are recorded.
function fakeDb(rows = [], { rpcError = null, zoneless = 0 } = {}) {
  const deletes = [];
  const db = {
    rpc: vi.fn(async () => ({ data: rows, error: rpcError })),
    from: vi.fn((table) => ({
      select: vi.fn(() => ({ is: vi.fn(async () => ({ count: zoneless, error: null })) })),
      delete: vi.fn(() => {
        const call = { table, eq: {}, in: {} };
        deletes.push(call);
        const chain = {
          eq(column, value) {
            call.eq[column] = value;
            return chain;
          },
          in(column, values) {
            call.in[column] = values;
            return chain;
          },
          then(resolve) {
            resolve({ error: null });
          },
        };
        return chain;
      }),
    })),
  };
  return { db, deletes };
}

function fakeFcm(outcomes = {}, onSend = () => {}) {
  return {
    accessToken: vi.fn(async () => 'access-token'),
    send: vi.fn(async (message) => {
      onSend(message);
      const outcome = outcomes[message.token] ?? 'sent';
      if (outcome instanceof Error) throw outcome;
      return { outcome };
    }),
  };
}

const released = (deletes) =>
  deletes.filter((d) => d.table === 'push_reminder_claims').flatMap((d) => d.in.user_id);
const deletedTokens = (deletes) =>
  deletes.filter((d) => d.table === 'user_devices').flatMap((d) => d.in.push_token);

describe('buildReminderMessage', () => {
  const message = buildReminderMessage({
    token: 't',
    localDay: '2026-10-01',
    expiresAt: Date.parse(MIDNIGHT_BERLIN),
    now: NOW,
  });

  it('expires at the learner’s local midnight on both platforms', () => {
    expect(message.android.ttl).toBe('17400s'); // 17:10Z → 22:00Z
    expect(message.apns.headers['apns-expiration']).toBe(String(Date.parse(MIDNIGHT_BERLIN) / 1000));
  });

  it('collapses a duplicate delivery into one notification', () => {
    expect(message.android.collapse_key).toBe('streak_reminder');
    expect(message.android.notification.tag).toBe('streak_reminder');
    expect(message.apns.headers['apns-collapse-id']).toBe('streak_reminder');
  });

  it('carries the kind and the client’s own dateKey, as strings (FCM requires it)', () => {
    expect(message.data).toEqual({ kind: 'streak_reminder', dateKey: '2026-10-01' });
    expect(message.notification).toEqual({ title: COPY.title, body: COPY.body });
  });

  it('never asks for a TTL below a minute', () => {
    const late = buildReminderMessage({ token: 't', localDay: '2026-10-01', expiresAt: NOW - 1000, now: NOW });
    expect(late.android.ttl).toBe('60s');
  });
});

describe('runStreakReminders', () => {
  it('dry run counts who is due without authenticating, sending or claiming', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u1', 'b'), row('u2', 'c')], { zoneless: 3 });
    const summary = await runStreakReminders({ db, fcm: null, dryRun: true, now: () => NOW });
    expect(summary).toMatchObject({ dryRun: true, due: 2, devices: 3, sent: 0, devicesWithoutZone: 3, aborted: null });
    expect(db.rpc).toHaveBeenCalledWith('claim_streak_reminders', {
      p_now: '2026-10-01T17:10:00.000Z',
      p_start_hour: 19,
      p_window_hours: 3,
      p_default_goal: 50,
      p_pack_id: 'de',
      p_limit: 1000,
      p_only_user: null,
      p_dry_run: true,
    });
    expect(deletes).toEqual([]);
  });

  it('authenticates before claiming anyone', async () => {
    const { db } = fakeDb([row('u1', 'a')]);
    const fcm = fakeFcm();
    fcm.accessToken.mockRejectedValue(new Error('refused'));
    await expect(runStreakReminders({ db, fcm, now: () => NOW })).rejects.toThrow('refused');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('sends one message to every device of every claimed learner, and keeps the claims', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u1', 'b'), row('u2', 'c')]);
    const fcm = fakeFcm();
    const summary = await runStreakReminders({ db, fcm, now: () => NOW });
    expect(fcm.send.mock.calls.map(([m]) => m.token).sort()).toEqual(['a', 'b', 'c']);
    expect(summary).toMatchObject({ due: 2, devices: 3, sent: 3, released: 0, aborted: null });
    expect(deletes).toEqual([]);
  });

  it('deletes dead tokens but keeps tokens and claims on a config error', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b')]);
    const summary = await runStreakReminders({ db, fcm: fakeFcm({ a: 'dead', b: 'config' }), now: () => NOW });
    expect(deletedTokens(deletes)).toEqual(['a']);
    expect(released(deletes)).toEqual([]);
    expect(summary).toMatchObject({ dead: 1, configErrors: 1, sent: 0 });
  });

  it('releases the claim of a learner none of whose devices could be reached', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u2', 'c')]);
    const summary = await runStreakReminders({ db, fcm: fakeFcm({ a: 'retry', c: 'retry' }), now: () => NOW });
    expect(released(deletes)).toEqual(['u1']); // u2 got it on b
    const claimDelete = deletes.find((d) => d.table === 'push_reminder_claims');
    expect(claimDelete.eq.local_day).toBe('2026-10-01');
    expect(summary).toMatchObject({ sent: 1, failed: 2, released: 1 });
  });

  it('stops at a quota error and releases everyone not reached', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u3', 'c')]);
    const fcm = fakeFcm({ a: 'quota' });
    const summary = await runStreakReminders({ db, fcm, now: () => NOW, config: { ...REMINDER, concurrency: 1 } });
    expect(fcm.send).toHaveBeenCalledTimes(1);
    expect(summary.aborted).toBe('quota');
    expect(released(deletes).sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('stops starting new learners at the deadline', async () => {
    let clock = NOW;
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b'), row('u3', 'c')]);
    const fcm = fakeFcm({}, () => {
      clock += REMINDER.deadlineMs + 1000;
    });
    const summary = await runStreakReminders({ db, fcm, now: () => clock, config: { ...REMINDER, concurrency: 1 } });
    expect(summary).toMatchObject({ sent: 1, aborted: 'deadline' });
    expect(released(deletes).sort()).toEqual(['u2', 'u3']);
  });

  // Review focus 5: an exception mid-run must not strand today's claims.
  it('a send that throws stops the run as fatal and releases the claims', async () => {
    const { db, deletes } = fakeDb([row('u1', 'a'), row('u2', 'b')]);
    const fcm = fakeFcm({ a: new Error('token refresh failed') });
    const summary = await runStreakReminders({ db, fcm, now: () => NOW, config: { ...REMINDER, concurrency: 1 } });
    expect(summary.aborted).toBe('fatal');
    expect(released(deletes).sort()).toEqual(['u1', 'u2']);
  });

  it('passes the owner’s single-learner filter through', async () => {
    const { db } = fakeDb([]);
    await runStreakReminders({ db, fcm: fakeFcm(), onlyUserId: '11111111-1111-4111-8111-111111111111', now: () => NOW });
    expect(db.rpc.mock.calls[0][1].p_only_user).toBe('11111111-1111-4111-8111-111111111111');
    expect(db.rpc.mock.calls[0][1].p_dry_run).toBe(false);
  });

  it('surfaces an RPC error instead of reporting an empty run', async () => {
    const { db } = fakeDb([], { rpcError: { message: 'function does not exist' } });
    await expect(runStreakReminders({ db, fcm: fakeFcm(), now: () => NOW })).rejects.toMatchObject({
      message: 'function does not exist',
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run api/_lib/streakReminder.test.js`
Expected: FAIL with "Failed to resolve import ./streakReminder.js".

- [ ] **Step 3: Implement**

Create `api/_lib/streakReminder.js`:

```js
// The daily "streak at risk" reminder: who, what, and what to do with each
// FCM answer. docs/superpowers/specs/2026-10-01-push-sender-design.md §6–§14.
// The endpoint (api/v1/push/streak-reminder.js) only authenticates and calls
// runStreakReminders; everything with a rule in it lives here.
// .js extension required: this file runs under native Node ESM on Vercel.
import { DEFAULT_GOAL } from '../../src/lib/gameConfig.js';

export const REMINDER = {
  startHour: 19, // local time the window opens
  windowHours: 3, // 19:00–21:59; later ticks retry learners a failed tick released
  maxUsersPerRun: 1000,
  concurrency: 10,
  deadlineMs: 240000, // maxDuration is 300s; the rest is cleanup
  // The progress lane's pack id (progressHandlers.js defaults packId to it). A
  // data key, like card.de, not a German branch.
  packId: 'de',
};

// No streak number: the server does not re-derive freezes or length (spec §6),
// so the notification can never disagree with the app.
export const COPY = {
  title: 'Keep your streak alive',
  body: 'You haven’t reached today’s goal yet. A few minutes of practice keeps your streak going.',
};

const COLLAPSE = 'streak_reminder';

export function buildReminderMessage({ token, localDay, expiresAt, now }) {
  // After local midnight the reminder is false; never deliver it then.
  const ttlSeconds = Math.max(60, Math.floor((expiresAt - now) / 1000));
  return {
    token,
    notification: { title: COPY.title, body: COPY.body },
    data: { kind: COLLAPSE, dateKey: localDay },
    android: {
      ttl: `${ttlSeconds}s`,
      collapse_key: COLLAPSE,
      notification: { tag: COLLAPSE, default_sound: true },
    },
    apns: {
      headers: { 'apns-expiration': String(Math.floor(expiresAt / 1000)), 'apns-collapse-id': COLLAPSE },
      payload: { aps: { sound: 'default' } },
    },
  };
}

// A learner is done for today once any device ended in one of these: they got
// it, or nothing a later tick does could change the answer.
const SETTLED = new Set(['sent', 'dead', 'config']);
const STOPS_RUN = new Set(['quota', 'fatal']);

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function groupByUser(rows) {
  const users = new Map();
  for (const row of rows) {
    const user = users.get(row.user_id) ?? {
      localDay: row.local_day,
      expiresAt: Date.parse(row.expires_at),
      tokens: [],
    };
    user.tokens.push(row.push_token);
    users.set(row.user_id, user);
  }
  return users;
}

export async function runStreakReminders({
  db,
  fcm,
  dryRun = false,
  onlyUserId = null,
  now = Date.now,
  config = REMINDER,
}) {
  const started = now();
  const summary = {
    dryRun,
    due: 0,
    devices: 0,
    sent: 0,
    dead: 0,
    failed: 0,
    configErrors: 0,
    released: 0,
    devicesWithoutZone: 0,
    aborted: null,
  };

  // Credentials before claims: a run that cannot authenticate must leave every
  // learner unclaimed for the next tick.
  if (!dryRun) await fcm.accessToken();

  const { data: rows, error } = await db.rpc('claim_streak_reminders', {
    p_now: new Date(started).toISOString(),
    p_start_hour: config.startHour,
    p_window_hours: config.windowHours,
    p_default_goal: DEFAULT_GOAL,
    p_pack_id: config.packId,
    p_limit: config.maxUsersPerRun,
    p_only_user: onlyUserId,
    p_dry_run: dryRun,
  });
  if (error) throw error;

  // Devices the sender can never reach because they report no zone. A rise
  // here means a client stopped sending p_time_zone.
  const zoneless = await db
    .from('user_devices')
    .select('push_token', { count: 'exact', head: true })
    .is('time_zone', null);
  summary.devicesWithoutZone = zoneless.count ?? 0;

  const users = groupByUser(rows ?? []);
  summary.due = users.size;
  summary.devices = rows?.length ?? 0;
  if (dryRun) return summary;

  const queue = [...users];
  const deadTokens = [];
  const release = [];

  async function worker() {
    while (queue.length > 0) {
      const [userId, user] = queue.shift();
      if (!summary.aborted && now() - started > config.deadlineMs) summary.aborted = 'deadline';
      if (summary.aborted) {
        release.push({ userId, localDay: user.localDay });
        continue;
      }
      const outcomes = [];
      for (const token of user.tokens) {
        const message = buildReminderMessage({ token, localDay: user.localDay, expiresAt: user.expiresAt, now: now() });
        const { outcome } = await fcm.send(message).catch(() => ({ outcome: 'fatal' }));
        outcomes.push(outcome);
        if (outcome === 'sent') summary.sent += 1;
        else if (outcome === 'dead') {
          summary.dead += 1;
          deadTokens.push(token);
        } else if (outcome === 'config') summary.configErrors += 1;
        else summary.failed += 1;
        if (STOPS_RUN.has(outcome)) summary.aborted ??= outcome;
        if (summary.aborted) break;
      }
      if (!outcomes.some((outcome) => SETTLED.has(outcome))) {
        release.push({ userId, localDay: user.localDay });
      }
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, worker));

  // Small chunks: .in() filters travel in the URL. A failed delete is simply
  // retried the next time FCM reports the same token.
  for (const batch of chunks(deadTokens, 20)) {
    await db.from('user_devices').delete().in('push_token', batch);
  }

  const releaseByDay = new Map();
  for (const { userId, localDay } of release) {
    releaseByDay.set(localDay, [...(releaseByDay.get(localDay) ?? []), userId]);
  }
  for (const [localDay, userIds] of releaseByDay) {
    for (const batch of chunks(userIds, 100)) {
      const { error: releaseError } = await db
        .from('push_reminder_claims')
        .delete()
        .eq('local_day', localDay)
        .in('user_id', batch);
      if (!releaseError) summary.released += batch.length;
    }
  }

  return summary;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run api/_lib/streakReminder.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/streakReminder.js api/_lib/streakReminder.test.js
git commit -m "feat(push): streak reminder run: claims, bounded sends, release and cleanup"
```

---

### Task 6: The cron endpoint

**Files:**

- Create: `api/v1/push/streak-reminder.js`
- Test: `api/v1/push/streak-reminder.test.js`
- Test: `api/v1/push/esm-resolution.test.js`
- Modify: `vercel.json` (`functions`)
- Modify: `.env.example`

**Interfaces:**

- Consumes:
  - `runStreakReminders` (Task 5);
  - `createFcmClient`, `parseServiceAccount`, `FcmAuthError` (Task 4);
  - `serviceClient` (`api/_lib/supabase.js`);
  - `sendError` (`api/_lib/respond.js`).
- Produces:
  - `GET|POST /api/v1/push/streak-reminder[?dryRun=1][&only=<uuid>]` with
    `Authorization: Bearer <PUSH_CRON_SECRET>`;
  - 200 with the summary;
  - 502 when the run stopped `fatal` or Google refused the token;
  - 401 / 405 / 400 / 500 as in spec §8.

- [ ] **Step 1: Write the failing tests**

Create `api/v1/push/streak-reminder.test.js`:

```js
import { it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../_lib/supabase.js', () => ({ serviceClient: vi.fn() }));
vi.mock('../../_lib/streakReminder.js', () => ({ runStreakReminders: vi.fn() }));

import handler from './streak-reminder.js';
import { serviceClient } from '../../_lib/supabase.js';
import { runStreakReminders } from '../../_lib/streakReminder.js';
import { FcmAuthError } from '../../_lib/fcm.js';
import { createRes } from '../../_lib/test-helpers.js';

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'sprachschule-test',
  client_email: 'push-sender@sprachschule-test.iam.gserviceaccount.com',
  private_key: 'unused-by-these-tests',
});
const OWNER = '11111111-1111-4111-8111-111111111111';

const req = ({ method = 'POST', token = 'push-secret', query = {} } = {}) => ({
  method,
  headers: { authorization: `Bearer ${token}` },
  query,
});

async function call(options) {
  const res = createRes();
  await handler(req(options), res);
  return res;
}

beforeEach(() => {
  vi.stubEnv('PUSH_CRON_SECRET', 'push-secret');
  vi.stubEnv('CRON_SECRET', 'league-secret');
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', SERVICE_ACCOUNT);
  serviceClient.mockReturnValue({});
  runStreakReminders.mockResolvedValue({ dryRun: false, due: 1, sent: 1, aborted: null });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it('rejects a method no scheduler uses (405)', async () => {
  expect((await call({ method: 'DELETE' })).statusCode).toBe(405);
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('rejects a wrong secret (401) before touching the database', async () => {
  expect((await call({ token: 'nope' })).statusCode).toBe(401);
  expect(serviceClient).not.toHaveBeenCalled();
});

// The push secret also lives in Supabase Vault; the league settle secret must
// not open this endpoint, and this one must not be the league's.
it('does not accept the league CRON_SECRET', async () => {
  expect((await call({ token: 'league-secret' })).statusCode).toBe(401);
});

it('fails closed when PUSH_CRON_SECRET is unset', async () => {
  vi.stubEnv('PUSH_CRON_SECRET', '');
  expect((await call({ token: '' })).statusCode).toBe(401);
});

it.each(['POST', 'GET'])('runs on %s (pg_net posts; Vercel Cron would GET)', async (method) => {
  const res = await call({ method });
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ dryRun: false, due: 1, sent: 1, aborted: null });
  expect(runStreakReminders).toHaveBeenCalledWith(
    expect.objectContaining({
      dryRun: false,
      onlyUserId: null,
      fcm: expect.objectContaining({ send: expect.any(Function), accessToken: expect.any(Function) }),
    })
  );
});

it('dry run needs no Firebase credentials', async () => {
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '');
  runStreakReminders.mockResolvedValue({ dryRun: true, due: 0 });
  const res = await call({ query: { dryRun: '1' } });
  expect(res.statusCode).toBe(200);
  expect(runStreakReminders).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, fcm: null }));
});

it('refuses a real run without Firebase credentials, and claims nobody', async () => {
  vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', '{"project_id":"only"}');
  const res = await call();
  expect(res.statusCode).toBe(500);
  expect(res.body.error.message).toBe('Push sender is not configured.');
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('answers 500 when the database lane is not configured', async () => {
  serviceClient.mockReturnValue(null);
  expect((await call()).statusCode).toBe(500);
  expect(runStreakReminders).not.toHaveBeenCalled();
});

it('accepts only a user id for ?only', async () => {
  expect((await call({ query: { only: 'someone' } })).statusCode).toBe(400);
  expect(runStreakReminders).not.toHaveBeenCalled();
  await call({ query: { only: OWNER } });
  expect(runStreakReminders).toHaveBeenCalledWith(expect.objectContaining({ onlyUserId: OWNER }));
});

it('answers 502 when the run was stopped by a fatal FCM error', async () => {
  runStreakReminders.mockResolvedValue({ dryRun: false, sent: 0, aborted: 'fatal' });
  const res = await call();
  expect(res.statusCode).toBe(502);
  expect(res.body.aborted).toBe('fatal');
});

it('answers 502 when Google refuses the service account', async () => {
  runStreakReminders.mockRejectedValue(new FcmAuthError('token exchange refused (HTTP 400)'));
  expect((await call()).statusCode).toBe(502);
});

it('answers 500 when the run itself fails', async () => {
  runStreakReminders.mockRejectedValue({ message: 'function does not exist' });
  expect((await call()).statusCode).toBe(500);
});

it('logs one structured summary line per run, and no token or secret', async () => {
  await call();
  expect(console.log).toHaveBeenCalledTimes(1);
  const line = console.log.mock.calls[0][0];
  expect(JSON.parse(line)).toMatchObject({ event: 'streak_reminder_run', sent: 1 });
  expect(line).not.toContain('push-secret');
});
```

Create `api/v1/push/esm-resolution.test.js`:

```js
import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Same guard as api/v1/league/esm-resolution.test.js: Vercel runs functions
// under native Node ESM, which does not resolve extensionless relative imports
// the way Vitest does. Import the deployed module in a real node process.
it('api/v1/push/streak-reminder.js resolves all imports under native Node ESM', () => {
  expect(() =>
    execFileSync('node', ['--input-type=module', '-e', "await import('./api/v1/push/streak-reminder.js')"], {
      cwd: process.cwd(),
      stdio: 'pipe',
    })
  ).not.toThrow();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run api/v1/push`
Expected: FAIL. `./streak-reminder.js` does not exist.

- [ ] **Step 3: Implement**

Create `api/v1/push/streak-reminder.js`:

```js
import { timingSafeEqual } from 'node:crypto';
import { sendError } from '../../_lib/respond.js';
import { serviceClient } from '../../_lib/supabase.js';
import { createFcmClient, parseServiceAccount, FcmAuthError } from '../../_lib/fcm.js';
import { runStreakReminders } from '../../_lib/streakReminder.js';

// The daily streak reminder, one tick per hour.
// docs/superpowers/specs/2026-10-01-push-sender-design.md
//
// Called by Supabase pg_cron + pg_net (POST), because Vercel Hobby crons run at
// most once a day. GET is accepted too, so a Vercel Cron entry can drive it
// unchanged if the plan is ever upgraded. Setup: docs/MOBILE_PUSH_SETUP.md §6.
//
// PUSH_CRON_SECRET, not CRON_SECRET: a copy of this one lives in Supabase
// Vault, and a leak there must not also open league settlement.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretMatches(header, secret) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Kept across warm invocations, so the OAuth token is reused. Rebuilt when the
// env value changes (a new deployment always starts cold anyway).
let fcmClient = null;
let fcmClientSource;
function fcmFor(raw) {
  if (raw !== fcmClientSource) {
    const serviceAccount = parseServiceAccount(raw);
    fcmClient = serviceAccount ? createFcmClient({ serviceAccount }) : null;
    fcmClientSource = raw;
  }
  return fcmClient;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 'method_not_allowed', 'Method not allowed');
  }

  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || !secretMatches(req.headers?.authorization ?? '', secret)) {
    return sendError(res, 'unauthorized', 'Invalid cron secret.');
  }

  const dryRun = req.query?.dryRun === '1';
  const only = req.query?.only ?? null;
  if (only !== null && !UUID.test(only)) {
    return sendError(res, 'bad_request', 'only must be a user id.');
  }

  const db = serviceClient();
  if (!db) return sendError(res, 'server_error', 'Server is not configured.');

  const fcm = dryRun ? null : fcmFor(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!dryRun && !fcm) return sendError(res, 'server_error', 'Push sender is not configured.');

  const started = Date.now();
  try {
    const summary = await runStreakReminders({ db, fcm, dryRun, onlyUserId: only });
    // Counts only: never tokens, user ids or secrets.
    console.log(JSON.stringify({ event: 'streak_reminder_run', ...summary, ms: Date.now() - started }));
    return res.status(summary.aborted === 'fatal' ? 502 : 200).json(summary);
  } catch (error) {
    const auth = error instanceof FcmAuthError;
    console.error(
      JSON.stringify({ event: 'streak_reminder_run', error: auth ? 'fcm_auth' : 'run_failed', message: error?.message })
    );
    return sendError(res, auth ? 'upstream_error' : 'server_error', 'Streak reminder run failed.');
  }
}
```

In `vercel.json` `functions`, add this entry directly after the
`"api/v1/league/settle.js"` entry:

```json
    "api/v1/push/streak-reminder.js": {
      "maxDuration": 300
    },
```

In `.env.example`, directly after the `VITE_PUSH_ENABLED=false` line, add:

```
# Push SENDER (server-only). Vercel Production only, both Sensitive — never
# Preview (it must not ring real devices), never Development, never VITE_.
# Setup, schedule and smoke test: docs/MOBILE_PUSH_SETUP.md §6.
# PUSH_CRON_SECRET: >= 32 random chars; the SAME value lives in Supabase Vault
#   as push_cron_secret. Deliberately not CRON_SECRET (league settle).
# FIREBASE_SERVICE_ACCOUNT: the whole JSON key of a service account holding
#   ONLY the "Firebase Cloud Messaging API Admin" role.
# PUSH_CRON_SECRET=
# FIREBASE_SERVICE_ACCOUNT=
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run api/v1/push api/_lib/functionBudget.test.js`
Expected: PASS. The budget test counts 12 (the slot freed in Task 1 is used).

- [ ] **Step 5: Commit**

```bash
git add api/v1/push vercel.json .env.example
git commit -m "feat(push): hourly streak-reminder endpoint behind PUSH_CRON_SECRET"
```

---

### Task 7: iOS hands Capacitor an FCM token

**Files:**

- Modify: `ios/App/App/AppDelegate.swift`
- Modify: `src/lib/pushNotifications.test.js` (describe `native wiring`)
- Modify: `src/lib/pushNotifications.js` (header comment only)

**Interfaces:**

- Produces: on iOS, the plugin's `registration` event carries an FCM
  registration token (a string containing `:`). Without Firebase it emits
  `registrationError` instead, never a raw APNs token.

- [ ] **Step 1: Write the failing tests**

In `src/lib/pushNotifications.test.js`, inside `describe('native wiring', …)`,
replace the test `'forwards the APNs answer from the iOS app delegate to the plugin'`
with:

```js
  it('forwards the APNs answer from the iOS app delegate to the plugin', () => {
    const delegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
    expect(delegate).toMatch(
      /didRegisterForRemoteNotificationsWithDeviceToken[\s\S]*?\.capacitorDidRegisterForRemoteNotifications/
    );
    expect(delegate).toMatch(
      /didFailToRegisterForRemoteNotificationsWithError[\s\S]*?\.capacitorDidFailToRegisterForRemoteNotifications/
    );
  });

  // The sender speaks FCM only, and FCM cannot address a raw APNs token, so
  // the delegate trades it for an FCM token (register_push_device refuses the
  // raw one). Spec §9.
  it('hands the plugin an FCM token on iOS, never the raw APNs token', () => {
    const delegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
    expect(delegate).toMatch(/Messaging\.messaging\(\)\.apnsToken = deviceToken/);
    expect(delegate).toMatch(
      /Messaging\.messaging\(\)\.token[\s\S]*?\.capacitorDidRegisterForRemoteNotifications,\s*object: token/
    );
    expect(delegate).not.toMatch(/capacitorDidRegisterForRemoteNotifications,\s*object: deviceToken/);
  });

  // FirebaseApp.configure() without GoogleService-Info.plist is a fatal error
  // at launch, and the SPM package is added by the owner in Xcode. Both guards
  // keep a build without Firebase compiling and launching.
  it('configures Firebase only when the package is linked and the plist is bundled', () => {
    const delegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
    expect(delegate).toMatch(/#if canImport\(FirebaseMessaging\)/);
    expect(delegate).toMatch(
      /Bundle\.main\.path\(forResource: "GoogleService-Info", ofType: "plist"\) != nil[\s\S]*?FirebaseApp\.configure\(\)/
    );
    expect(delegate).toMatch(/PushSetupError\.firebaseNotConfigured/);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/pushNotifications.test.js -t "native wiring"`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

Replace `ios/App/App/AppDelegate.swift` entirely:

```swift
import UIKit
import Capacitor
#if canImport(FirebaseMessaging)
import FirebaseCore
import FirebaseMessaging
#endif

/// Why an iOS device could not produce a token the sender can use.
enum PushSetupError: LocalizedError {
    case firebaseNotConfigured
    case noFcmToken

    var errorDescription: String? {
        switch self {
        case .firebaseNotConfigured:
            return "Firebase is not configured in this build."
        case .noFcmToken:
            return "Firebase returned no registration token."
        }
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if canImport(FirebaseMessaging)
        // Only with the owner's GoogleService-Info.plist in the bundle:
        // FirebaseApp.configure() without it is a fatal error at launch.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        #endif
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // Push notifications: APNs answers registerForRemoteNotifications() here, on
    // the app delegate, and nowhere else. Without these forwards the Capacitor
    // plugin never hears back, so its 'registration' and 'registrationError'
    // events never fire and the web app's register() waits out its timeout.
    //
    // The sender speaks Firebase Cloud Messaging only, which cannot address a
    // raw APNs token. So the APNs token goes to Firebase, and the FCM
    // registration token it returns is what the plugin (and user_devices)
    // receive. Without Firebase configured there is no token the sender can
    // use: report a failure instead of passing the raw one on.
    // See docs/MOBILE_PUSH_SETUP.md.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
            Messaging.messaging().token { token, error in
                if let token = token {
                    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
                } else {
                    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                                    object: error ?? PushSetupError.noFcmToken)
                }
            }
            return
        }
        #endif
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                        object: PushSetupError.firebaseNotConfigured)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
```

In `src/lib/pushNotifications.js`, replace the first three lines of the header
comment:

```js
// Push notifications, the device half: ask the OS, get this device's token, and
// hand it to the server under the signed-in account. Sending is the server's
// job and is not built yet; this is the opt-in and the address book.
```

with:

```js
// Push notifications, the device half: ask the OS, get this device's FCM
// registration token (on iOS too: AppDelegate.swift trades the APNs token for
// one), and hand it to the server under the signed-in account together with the
// device's time zone. Sending is api/v1/push/streak-reminder.js; this is the
// opt-in and the address book.
```

- [ ] **Step 4: Run the tests, and compile the app without Firebase**

Run: `npx vitest run src/lib/pushNotifications.test.js`
Expected: PASS.

If Xcode is installed, prove the no-Firebase build still compiles (the owner
has not added the package yet):

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Expected: `** BUILD SUCCEEDED **`. If Xcode is not available, say so in the
task report. The owner's §21 on-device check is then the first compile.

- [ ] **Step 5: Commit**

```bash
git add ios/App/App/AppDelegate.swift src/lib/pushNotifications.js src/lib/pushNotifications.test.js
git commit -m "feat(ios): hand Capacitor the FCM token, guarded for builds without Firebase"
```

---

### Task 8: Owner runbook and backlog truth

**Files:**

- Modify: `docs/MOBILE_PUSH_SETUP.md`
- Modify: `docs/BACKLOG.md` (items 12 and 13)

**Interfaces:**

- Consumes: everything above. This task is documentation only.

- [ ] **Step 1: Update `docs/MOBILE_PUSH_SETUP.md`**

1. In the "What is built" table, replace this row:
   `| Device registry + RPCs … | supabase/migrations/20260927120000_user_devices.sql | Needs applying |`
   with:
   `| Device registry + RPCs | supabase/migrations/20260927120000_user_devices.sql, then 20261001120000_push_streak_reminders.sql (time zone, FCM-only tokens, claims) | First applied; second needs applying (§1) |`
2. Replace the "**Sending**" row with:
   `| Sender: daily streak reminder | api/v1/push/streak-reminder.js, api/_lib/streakReminder.js, api/_lib/fcm.js | Built, inert until §6 |`
3. Replace the paragraph starting "The switch collects tokens. Nothing sends to
   them until the sender exists." with:
   > The sender is built but inert until §6 is done: it needs Firebase
   > credentials, a cron secret and the Supabase schedule. Design:
   > `docs/superpowers/specs/2026-10-01-push-sender-design.md`.
4. At the end of §1, add:
   > **Then apply `supabase/migrations/20261001120000_push_streak_reminders.sql`
   > the same way,** with `--arg name push_streak_reminders`. After each apply:
   > `notify pgrst, 'reload schema';`. Then rename the repo file to the version
   > recorded in migration history, in a PR (as #383 did).
5. In §3, replace step 2's last two sentences ("Keep the `.p8`, its Key ID and
   your Team ID somewhere safe. The sender will need them. Nothing in the app
   does.") with:
   > Upload the `.p8` with its Key ID and your Team ID to Firebase → Project
   > settings → Cloud Messaging → Apple app configuration. One key covers
   > sandbox and production. The sender never holds it: FCM delivers to Apple
   > devices through APNs with this key.
6. In §3, add step 4:
   > 4. **Firebase on iOS.** In Firebase, add an iOS app with the bundle id of
   >    `ios/App`. Download `GoogleService-Info.plist` and add it to target
   >    **App** in Xcode. Then File → Add Package Dependencies →
   >    `https://github.com/firebase/firebase-ios-sdk` → product
   >    **FirebaseMessaging** on target **App**. Commit the project changes.
   >    Without both, `AppDelegate.swift` reports a registration failure
   >    instead of a token, and the switch says it could not turn on.
7. In §3, replace the paragraph "The iOS plugin returns a **raw APNs device
   token**, not an FCM token. That is why `user_devices` records `platform`: …"
   with:
   > With Firebase configured, `AppDelegate.swift` hands the plugin an **FCM
   > registration token**, the same kind Android returns. That is the only kind
   > the sender can address, and `register_push_device` refuses a raw APNs
   > token.
8. In "On-device check" step 2, change the query to:
   `select platform, time_zone, updated_at from public.user_devices where user_id = '<your id>';`
   Then add: "`time_zone` should be your phone's zone (for example
   `Europe/Berlin`). `NULL` means the build predates the sender and gets no
   reminders."
9. Add a new section before "## How it behaves". Copy the body of spec §19–§22
   verbatim (environment variables, setup steps 4–8 including the
   `cron.schedule` SQL block, the smoke test, the rollback table), adjusted
   only so that "§21" reads "the smoke test below". Use this heading and intro:

   ```markdown
   ## 6. The sender (streak reminders)

   **Owner action, after §1–§4.** One hourly tick from Supabase calls the
   Vercel function, which sends at most one "Keep your streak alive" per learner
   per day, between 19:00 and 21:59 in the learner's own time zone. Never run a
   non-dry-run call, the schedule, or the Vault/Vercel secret steps from an
   agent.
   ```

   Then add the observability queries from spec §17 under the subheading
   `### Is it working?`.

- [ ] **Step 2: Update `docs/BACKLOG.md`**

1. Item 12, status cell: replace
   `**Not done** — owner-only. Migration Drift reports it missing until applied. Procedure: `docs/MOBILE_PUSH_SETUP.md` §1`
   with:
   `**Applied** (migration history lists 20260927120000 user_devices; checked 2026-10-01). **Follow-on not done:** apply 20261001120000_push_streak_reminders.sql the same way — `docs/MOBILE_PUSH_SETUP.md` §1`
2. Item 13, description: replace `an APNs key for the future sender` with
   `the APNs key uploaded to Firebase, the Firebase iOS app + GoogleService-Info.plist + FirebaseMessaging package`.
   Status cell: replace `sending is not built yet` with
   `the sender is built and inert until docs/MOBILE_PUSH_SETUP.md §6 is done`.

- [ ] **Step 3: Verify the docs point at real things**

```bash
grep -n "streak-reminder\|push_streak_reminders\|PUSH_CRON_SECRET\|FIREBASE_SERVICE_ACCOUNT" docs/MOBILE_PUSH_SETUP.md docs/BACKLOG.md
ls api/v1/push/streak-reminder.js supabase/migrations/20261001120000_push_streak_reminders.sql
grep -rn "not built yet" docs/MOBILE_PUSH_SETUP.md docs/BACKLOG.md src/lib/pushNotifications.js
```

Expected: the first two commands find every name. The last finds nothing.

- [ ] **Step 4: Commit**

```bash
git add docs/MOBILE_PUSH_SETUP.md docs/BACKLOG.md
git commit -m "docs(push): owner runbook for the streak-reminder sender; backlog truth"
```

---

### Task 9 (SCHEDULED — only in the release that turns push on): Privacy and disclosure copy

**Gate.** The copy is **approved as written** (owner, 2026-10-01; spec §15). Per
D2, it merges **together with** the `PRIVACY_VERSION` bump in the release PR
that turns push on, and never earlier: a bump re-asks every signed-in learner
to accept. Do not start this task as part of Tasks 1–8. It must land before
`VITE_PUSH_ENABLED` flips, or in the same release, never after. The Terms of
Service do not change.

**Files:**

- Modify: `src/components/legal/PrivacyPolicy.jsx` (§2 push item, §5 closing
  sentence, §6 third item plus a new item, §7 paragraph, §8 second item)
- Modify: `src/components/legal/PrivacyPolicy.test.jsx`
- Modify: `src/components/settings/NotificationsSection.jsx` (`PUSH_SERVICE`,
  disclosure sentence)
- Modify: `src/components/settings/NotificationsSection.test.jsx`
- Modify: `src/lib/legalVersions.js` (`PRIVACY_VERSION`), plus every test pin of
  the privacy version

- [ ] **Step 1: Update the copy tests first**

In `PrivacyPolicy.test.jsx`, `'reproduces the approved copy verbatim'`:

- remove
  `'Apple Push Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on Android)',`;
- add:

  ```js
      'from Firebase Cloud Messaging by Google, which delivers notifications to iPhone and iPad through Apple Push Notification service.',
      "your device's time zone setting and a link to your account",
      'we check your recent activity against your daily goal.',
      'Firebase Cloud Messaging by Google, together with Apple Push Notification service on iPhone and iPad',
      "notification tokens (with your device's time zone) and acceptance records",
      'you a streak reminder are deleted automatically after about eight days.',
      'notification tokens, reminder records and acceptance records.',
      'and the time zone stored with it, from our database',
  ```

- in `'lists collection, providers, retention and choices as real lists'`,
  change `toHaveLength(24)` to `toHaveLength(25)` (the new §6 item).

In `NotificationsSection.test.jsx`:

- change `/save a notification token for this device to your account/i` to
  `/save a notification token and this device’s time zone to your account, so reminders arrive at a sensible local time/i`;
- rename `'names APNs on iOS and FCM on Android'` to
  `'names FCM, and APNs too on iOS'`, and change its iOS expectation to
  `/Firebase Cloud Messaging by Google and Apple Push Notification service/`.
  The Android expectation stays.

Run: `npx vitest run src/components/legal src/components/settings`
Expected: FAIL on the changed strings and the item count.

- [ ] **Step 2: Change the copy (verbatim, spec §15)**

In `src/components/legal/PrivacyPolicy.jsx`:

1. The `'Push Notifications (mobile app only):'` item's `text`:

   ```js
        text: "If you turn on push notifications, the app obtains a notification token for your device from Firebase Cloud Messaging by Google, which delivers notifications to iPhone and iPad through Apple Push Notification service. We store the token in our database, together with your device's platform, your device's time zone setting and a link to your account, so that we can send you streak reminders and league updates at a suitable local time. To decide whether you need a streak reminder, we check your recent activity against your daily goal.",
   ```

2. §5 `after[0]`:

   ```js
      'If you choose to use them, these services also receive data under their own privacy policies: Google or GitHub (if you sign in with them), and Firebase Cloud Messaging by Google, together with Apple Push Notification service on iPhone and iPad (if you turn on push notifications).',
   ```

3. §6: replace the third item (`'Account data — …'`) with these two items. The
   first needs double quotes for its apostrophe:

   ```js
      {
        text: "Account data — including your email, profile, learning data, problem reports, notification tokens (with your device's time zone) and acceptance records — is kept until you delete your account.",
      },
      {
        text: 'Records of the days on which we sent, or tried to send, you a streak reminder are deleted automatically after about eight days.',
      },
   ```

4. §7 paragraph: replace
   `problem reports, notification tokens and acceptance records. We also delete`
   with
   `problem reports, notification tokens, reminder records and acceptance records. We also delete`.
5. §8 second item: replace
   `the app deletes your device's notification token from our database and deactivates it on your device.`
   with
   `the app deletes your device's notification token, and the time zone stored with it, from our database and deactivates it on your device.`
   The rest of the item is unchanged.

In `src/components/settings/NotificationsSection.jsx`:

```js
const PUSH_SERVICE = {
  ios: 'Firebase Cloud Messaging by Google and Apple Push Notification service',
  android: 'Firebase Cloud Messaging by Google',
};
```

In the disclosure, replace
`then save a notification token for this device to your account.` with
`then save a notification token and this device’s time zone to your account, so reminders arrive at a sensible local time.`
Keep the curly apostrophe; the rest of the paragraph is unchanged.

In `src/lib/legalVersions.js`, set `PRIVACY_VERSION` to the push-on release
date (`'YYYY-MM-DD'`, the day that release PR merges). Leave `TERMS_VERSION`
unchanged.

Then update every test and fixture that pins the privacy version:
`grep -rn "PRIVACY_VERSION\|2026-09-29" src scripts`. Change only
privacy-version pins; the terms version stays `2026-09-29`.

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit (in the push-on release branch)**

```bash
git add src/components/legal src/components/settings src/lib/legalVersions.js src scripts
git commit -m "docs(legal): push copy names FCM on iOS, the stored time zone and reminder records"
```

---

## Final verification (before opening the PR)

Run every gate AGENTS.md names, plus the suites this mission touches:

```bash
npm test
npm run lint
npm run format:check
npx prettier --check api supabase/tests
npm run build
npx vitest run --config vitest.rls.config.js
```

Expected: all pass. The RLS suite needs the local stack. If Docker is
unavailable, state it in the PR; the required "RLS Policy Tests" CI job runs
it.

Then check scope and safety:

```bash
git diff --stat main...HEAD
grep -rn "firebase-admin\|google-auth-library" package.json
node -e "const f=require('fs');const n=(d)=>f.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name.startsWith('_')?[]:e.isDirectory()?n(d+'/'+e.name):e.name.endsWith('.js')&&!e.name.endsWith('.test.js')?[e.name]:[]);console.log(n('api').length)"
```

Expected:

- The diff stat lists only files from the File map.
- The grep finds nothing (no new dependency).
- The count prints `12`.

**PR body must include:**

- the owner steps from spec §20 and §23, verbatim;
- "Migration not applied; owner applies after merge";
- that Task 9 (approved copy + `PRIVACY_VERSION` bump) is deferred to the push-on release;
- that `VITE_PUSH_ENABLED` stays `false`.
