# Store submission: privacy audit, terms acceptance, push disclosure — design

**Status:** APPROVED by the owner on 2026-09-29 — §5 copy as written, §7
answered (see the "Owner answers" block under the table). Original gating
note kept below for the record.

~~DRAFT, awaiting owner approval.~~ Nothing below was implemented before approval.
Three things need an explicit yes before any product code is written:

1. the proposed legal copy in §5 (Privacy Policy, Terms of Service, consent
   label, push disclosure, gate copy);
2. the decisions in §7 (D1–D7), especially D1 (existing accounts) and D2
   (declining the gate);
3. this spec as a whole, then the plan at
   `docs/superpowers/plans/2026-09-29-store-legal-consent.md`.

Audit taken against `origin/main` at `03543f91` (2026-09-29).

---

## 1. Intent

**What the owner asked for.** Prepare sprachschule-app (formerly "Deutsch App") for App Store and Google Play
submission: make the Privacy Policy true to what the code does, add a
server-recorded, versioned acceptance of the Terms and Privacy Policy at account
creation, and put a just-in-time disclosure in front of the push-notification
opt-in. Guest Mode, the trial wall and local-first storage must behave exactly
as they do today.

**Constraints (stated).** Passwordless only. OAuth cannot know new-vs-existing
before the callback. Legal copy is owner-supplied and changes only with
approval. No production mutation, no migration applied, no flag enabled, no
provider settings touched. A new table ships as a reviewed migration file plus
RLS tests, applied later by the owner.

**Success criteria.** Every factual sentence in the policy can be traced to
code or to an owner-confirmed fact; an account cannot reach synced use without a
server acceptance record for the current versions; returning users who already
accepted are never re-prompted; the guest path is byte-for-byte unchanged in
behaviour; push permission is never requested before the disclosure is on
screen and the learner taps to enable.

**Assumptions (mine — correct me).** The app's audience includes the EU (the
Sentry org is EU-hosted); "current versions" means both documents' versions
together; counsel review happens after this PR, not before it.

---

## 2. Premise check — where the brief and the code disagree

Per the repo's standing lesson, the brief's factual claims were checked before
designing on them. These did not hold, or were incomplete:

| #   | Brief / policy says                                         | Code says                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | "`VITE_PUSH_ENABLED` must remain off"                       | It is **on** for native builds from this machine: `.env.production.local` sets `VITE_PUSH_ENABLED=true`, and the bundles synced into `ios/App/App/public` and `android/.../assets/public` on 2026-09-27 inline it as `true`. An archive built from the current tree shows the Notifications switch with no disclosure, against an unapplied `user_devices` migration. `build:mobile` pins several `VITE_*` flags but not this one. |
| P2  | Policy: Sentry collects "crash reports and performance data" | Errors only. `observability.js` installs no tracing or replay. Sentry's default `browserSessionIntegration` sends an anonymous session-health ping per launch. **Performance data is collected — by Vercel Speed Insights**, which the policy does not mention.                                                                                                         |
| P3  | Policy: Sentry data "is scrubbed of PII before leaving your device" | Not provable. See §4.                                                                                                                                                                                                                                                                                                                                                 |
| P4  | Policy lists Supabase, Vercel, Sentry                       | Also in use: **Anthropic** (every AI feature, guests included), **Vercel Web Analytics + Speed Insights** (web only), the **SMTP provider** that sends sign-in emails (Resend per the B2 design; not verifiable from the repo), **Google/GitHub** OAuth, and — once push is on — **APNs/FCM**.                                                                          |
| P5  | Policy: sign-in "via Google or Magic Link"                  | GitHub is live in native builds (`build:mobile` pins `VITE_GITHUB_AUTH_ENABLED=true`); dark on the web only because Vercel Production lacks the flag.                                                                                                                                                                                                                  |
| P6  | Policy: nothing on IP addresses                              | The AI lane rate-limits by client IP and stores `ip:<address>` in `public.rate_limits` (Supabase). Rows are only pruned when the **same key** returns; there is no global expiry, so an address that never returns stays indefinitely.                                                                                                                                  |
| P7  | Policy: "delete your account and **all** associated data"   | The `auth.users` cascade removes every user-owned table (incl. feedback and push tokens). Not covered: avatar deletion is best-effort (failures swallowed, no retry); `rate_limits` rows; feedback sent as a guest; Sentry events; Supabase auth audit logs; provider logs and backups.                                                                                      |
| P8  | Brief: token removed "on successful opt-out, sign-out"      | Opt-out and sign-out run server delete **and** OS unregister; either succeeding counts as success. If the server call fails (offline), the row survives with a dead token and nothing prunes it (the sender that would is not built). OS-level disable is only noticed on the next signed-in launch.                                                                  |
| P9  | Policy: nothing on what others can see                      | Leagues show handle, avatar and weekly XP to the cohort. The passport shows name, handle, avatar, join year, tier, total XP, longest streak, league wins, follower counts and achievements to any signed-in learner; `is_private` reduces it to name, handle, avatar and removes the learner from search. The avatar bucket is **public** (unguessable URLs). |
| P10 | Policy: no feedback disclosure                               | In-exercise reports store free text + exercise context (+ `user_id` when signed in) in `public.feedback`; admins read them.                                                                                                                                                                                                                                             |
| P11 | Policy: no operator identity or contact                      | None anywhere in the app. Apple and Google both expect a reachable contact; the owner must supply it (not invented here).                                                                                                                                                                                                                                              |
| P12 | "Account creation must not proceed until acceptance"        | Impossible to guarantee at the identity layer for OAuth: GoTrue creates `auth.users`, and the `on_auth_user_created` trigger creates a `profiles` row (`learner_<hex>` handle), before the app regains control. The enforceable guarantee is: **no app data leaves the device and the account takes part in nothing until acceptance is recorded** (§6.4). |
| P13 | (not in brief)                                              | `ChatTab` uses the Web Speech API when present, but `ios/App/App/Info.plist` declares no microphone/speech usage strings. Out of scope; flagged for on-device verification before submission (§8).                                                                                                                                                                   |

Also verified true: Sentry is web-only today (the native `.env.production.local`
has no DSN); Vercel Analytics is web-only (its script path does not exist under
`capacitor://`); no ad SDKs; export excludes profile, league, feedback, push and
idempotency tables with stated reasons (`EXCLUDED_TABLES`).

---

## 3. Data-flow inventory

| Data                                                        | Stored where                                                                        | Leaves device → recipient                                                                 | Purpose                             | Deletion today                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Guest learning state (SRS, daily log, decks, prefs, trial)   | localStorage only                                                                   | No (sync is a no-op without a session)                                                    | Offline-first app                   | User clears site/app data; merged into the account on sign-in                                 |
| Email address                                                | Supabase Auth                                                                       | Supabase; SMTP provider (sign-in email)                                                    | Authentication                      | Account deletion                                                                              |
| OAuth identity (provider id, name, picture URL, GitHub username, all verified emails from GitHub) | Supabase Auth `raw_user_meta_data` / identities                                     | Google/GitHub → Supabase                                                                   | Authentication, account linking     | Account deletion. **Not used or displayed by the app.**                                       |
| Sign-in IP + user agent                                      | Supabase Auth sessions / audit log                                                  | Supabase                                                                                  | Security (GoTrue default)           | Sessions go with the account; audit log is Supabase-retained                                  |
| Handle (auto `learner_<hex>`), first/middle/last name, `is_private`, avatar | `profiles`; avatar in public `avatars` bucket                                        | Supabase; visible to other signed-in learners (P9); avatar URL fetchable by anyone holding it | Social features, leagues            | Cascade; avatar objects best-effort                                                           |
| Synced learning data (SRS, daily counters, decks, settings blob, learned words, token ledger, progress idempotency keys) | Supabase tables                                                                     | Supabase                                                                                  | Cross-device progress, leagues      | Cascade; export covers SRS, daily, decks, settings, token ledger                              |
| League membership, weekly XP                                 | `league_members`                                                                    | Visible to cohort                                                                         | Leagues                              | Cascade                                                                                       |
| Follows                                                      | `profile_follows`                                                                   | Counts visible on passport                                                                | Social                               | Cascade                                                                                       |
| AI prompts: chat turns, typed answers, deck topics, exercise context, level, interests | Not stored by us                                                                    | Our Vercel function → Anthropic. No user id, email or IP forwarded                        | AI tutor, grading, generation        | Anthropic retention per its API terms (owner to confirm)                                      |
| Voice input audio                                            | Not stored by us                                                                    | Browser/OS speech service (Google/Apple), not us; app gets text only                     | Dictation                            | n/a                                                                                           |
| Client IP (AI lane), user id (account lane)                  | `rate_limits`                                                                       | Supabase                                                                                  | Abuse limits                         | Pruned only when the same key returns (P6)                                                    |
| Feedback reports                                             | `feedback`                                                                          | Supabase; admins                                                                          | Fix content                          | Cascade for account reports; guest reports have no owner                                      |
| Error reports                                                | Sentry (EU)                                                                         | Web only today                                                                            | Debugging                            | Sentry retention; not linked to accounts                                                      |
| Web analytics + web vitals                                   | Vercel                                                                              | Web only                                                                                  | Usage + performance                  | Vercel retention                                                                              |
| Push token, platform, account link                           | `user_devices` (migration **not applied**); `deutsch-app-push-device-v1` locally    | APNs (iOS) / FCM (Android) issue it; Supabase stores it                                   | Streak reminders, league updates (sender **not built**) | Opt-out / sign-out (P8), OS-disable on next launch, cascade on deletion                       |
| Supabase session                                             | localStorage `sb-*-auth-token`                                                      | —                                                                                         | Staying signed in                    | Sign-out wipes all localStorage except theme                                                  |
| **New:** acceptance record                                   | `legal_acceptances` (§6.2)                                                          | Supabase                                                                                  | Proof of acceptance                  | Cascade; included in export                                                                   |

---

## 4. Sentry claim — verdict

`scrubEvent` (`src/lib/observability.js`) deletes `event.user`, request
cookies and query string, and strips `?…`/`#…` from the request URL and from
breadcrumb `url/to/from`. `sendDefaultPii: false`. That is real and worth
keeping. It does **not** cover, and so the policy cannot promise:

- **Exception messages and stack frames** — any text an error message embeds.
- **Breadcrumb messages** — `breadcrumbsIntegration` (default) records console
  output and clicked-element selectors, which can include `aria-label` text.
- **Request headers** — `httpContextIntegration` adds User-Agent and Referer.
- **Locale and time zone** — `cultureContextIntegration`.
- **IP address** — received by Sentry's servers with every request; the
  2026-08-18 delivery test showed Sentry deriving country/city from it even
  though `user.ip_address` was null.

Verdict: replace the sentence with the accurate description in §5.1, section
2 ("Error Reports"). An owner-side hardening option (Sentry → Project Settings →
Security & Privacy → "Prevent Storing of IP Addresses") is on the checklist; it
reduces what is kept but does not change what is sent, so the copy does not
depend on it.

---

## 5. Proposed legal copy — FOR OWNER APPROVAL

Copy in `[BRACKETS]` is a placeholder the owner must supply; nothing there is
invented. Everything else is a proposal: edit freely, and the implementation
will reproduce the approved text verbatim (tests pin it, as today).

### 5.1 Privacy Policy (full replacement)

**Updated line:** `Last Updated: September 29, 2026` — derived from `PRIVACY_VERSION = '2026-09-29'`, never typed by hand (owner brief, 2026-09-30)

**Intro (brand updated 2026-09-30; otherwise unchanged):** Welcome to sprachschule-app. This Privacy Policy explains how
we collect, use, and protect your information when you use our application.

**1. Who We Are**
sprachschule-app is operated by Shimon Esterkin. If you have questions about
this policy or your data, contact us at sprachschule.support@gmail.com.

**2. Information We Collect**

- **Using the App as a Guest:** You can use sprachschule-app without an account. As a
  guest, your learning progress is stored only on your device and is not synced
  to our servers.
- **Account Information:** When you create an account or sign in — with a
  one-time email code or link, with Google, or with GitHub — we collect your
  email address to authenticate you and keep your progress in sync across
  devices. If you sign in with Google or GitHub, that service also shares the
  basic profile details it makes available to apps, such as your name, profile
  picture link and, for GitHub, your username; our authentication provider
  stores them with your account. For security, it also records technical
  information about each sign-in, such as your IP address and browser or
  device type. We also record which versions of our Terms of Service and this
  Privacy Policy you accepted, and when.
- **Profile Information:** Your account has a handle (username), created
  automatically when you sign up, which you can change. You can also add your
  first, middle and last name and a profile picture, and choose whether your
  profile is private.
- **Learning Data:** We store your vocabulary progress, exercise results, daily
  activity, streaks, XP, custom decks, preferences (such as your level, daily
  goal and interests) and in-app token history locally on your device. When you
  are signed in, we sync this data to our cloud database.
- **AI Features:** When you use an AI-powered feature — chatting with the tutor,
  having a written answer checked, generating practice sentences or creating a
  custom deck — the text you enter, together with the exercise or conversation
  context needed to respond, is sent through our server to Anthropic, which
  generates the response. We do not send your name, email address or account ID
  with these requests.
- **Voice Input:** If you use voice input, speech recognition is performed by
  your browser or your device's operating system, which may send your audio to
  its provider (such as Google or Apple) under that provider's terms. The app
  receives only the resulting text.
- **Problem Reports:** If you report a problem with an exercise, we store your
  message together with details of the exercise (such as the level, deck and
  item) and, if you are signed in, your account ID.
- **Error Reports:** When the website encounters an error, it sends a report to
  Sentry with technical details such as the error message, recent app events
  leading up to it, the page address, your browser type, language and time
  zone. We configure Sentry not to attach your account ID or email address, and
  we remove cookies and web-address parameters that could contain sign-in
  credentials before a report is sent. Sentry receives your IP address when a
  report is sent and may use it to estimate your approximate location. Sentry
  also receives an anonymous signal when the app starts, which we use to measure
  how often sessions end in an error.
- **Website Analytics:** On the website, we use Vercel Web Analytics and Vercel
  Speed Insights to understand how the site is used and how quickly it loads,
  such as pages visited, the referring site, device and browser type,
  approximate country and page-load measurements. These tools do not use
  cookies.
- **Usage Limits:** To protect the service from abuse, our server records your
  IP address (for AI features) or your account ID (for account features)
  together with a count of recent requests.
- **Push Notifications (mobile app only):** If you turn on push notifications,
  the app obtains a notification token for your device from Apple Push
  Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on
  Android) and stores it in our database, together with your device's platform
  and a link to your account, so that we can send you streak reminders and
  league updates.

**3. How We Use Your Information**
Your data is used to provide the app's features: saving and syncing your
progress, placing you in weekly leagues (Leagues), showing your profile to other
learners, powering AI features, sending notifications you have turned on,
fixing bugs, and protecting the service from abuse. We do not sell your data or
use it for targeted advertising.

**4. What Other Learners Can See**
If you have an account, other signed-in learners in your league can see your
handle, profile picture and weekly XP. Signed-in learners can also find you by
name or handle, follow you, and view your profile: your name, handle, profile
picture, the year you joined and your learning statistics (such as total XP,
longest streak, league results, achievements and follower counts). If you make
your profile private, you are hidden from search and your profile shows only
your name, handle and profile picture. Profile pictures are stored at
hard-to-guess web addresses that anyone who has the address can open.

**5. Service Providers**
We rely on the following services to run the app. They process data on our
behalf:

- Supabase — authentication, database and file storage
- Vercel — hosting the website and our server, and website analytics
- Anthropic — AI tutor responses, answer checking and practice content
- Sentry — error reports
- Supabase Auth — sending sign-in emails

If you choose to use them, these services also receive data under their own
privacy policies: Google or GitHub (if you sign in with them), and Apple Push
Notification service or Firebase Cloud Messaging by Google (if you turn on push
notifications).

**6. How Long We Keep Your Data**

- Guest data stays on your device until you clear the app's data or sign in, at
  which point it is added to your account.
- Signing out removes your account's data from that device; only your light/dark
  theme choice stays.
- Account data — including your email, profile, learning data, problem reports,
  notification tokens and acceptance records — is kept until you delete your
  account.
- Usage-limit records are overwritten as you make new requests; they are not
  currently deleted on a fixed schedule.
- Error reports, website analytics and data processed by our service providers
  are kept for limited periods under those providers' retention settings.

**7. Exporting and Deleting Your Data**
You can download a copy of your learning data, and permanently delete your
account, in the app under Profile → Settings → Account controls. Deleting your
account immediately and permanently removes your account and the data linked to
it in our database, including your learning data, profile, problem reports,
notification tokens and acceptance records. We also delete the profile pictures
you uploaded; if any remain afterwards, contact us and we will remove them.
Copies may remain for a limited time in our service providers' backups and logs.
Problem reports you sent as a guest and error reports are not linked to your
account.

**8. Your Choices**

- **Push notifications are optional** and are not required to use the app. You
  can turn them off at any time in the app (Settings → Notifications) or in your
  device's settings.
- When you turn notifications off in the app or sign out, the app deletes your
  device's notification token from our database and deactivates it on your
  device. If the app cannot reach our servers at that moment, the token is still
  deactivated on your device, but a copy can remain in our database until your
  account is deleted. If you turn notifications off in your device's settings
  instead, the app removes the token from our database the next time you open it
  while signed in. Deleting your account always deletes all of your notification
  tokens.
- You can edit your name, handle and profile picture, and make your profile
  private, in Settings.

**9. Changes to This Policy**
When we change this policy, we will update the "Last Updated" date above. If the
changes are significant, we will ask you to review and accept the updated policy
in the app before you continue using your account.

> Two sentences above describe gaps rather than intended behaviour — "not
> currently deleted on a fixed schedule" (P6) and "a copy can remain … until
> your account is deleted" (P8). Both have small code fixes listed in §8; if the
> owner wants them fixed first, the copy gets shorter. Shipping the honest
> version now is the default.

### 5.2 Terms of Service (brand update to sections 1–5 and the intro, plus additions)

**Brand update (owner, 2026-09-30).** The supplied sections 1–5 and the intro
are otherwise unchanged; only the product name changes. The three affected
sentences become, verbatim:

- Intro: By accessing or using sprachschule-app, you agree to be bound by these
  Terms of Service.
- 3. App Usage and Leagues: sprachschule-app includes gamified elements like
  Leagues and Streaks. We reserve the right to reset, modify, or adjust league
  standings, points, or progression logic at any time, especially during this
  pre-beta phase, to ensure a fair experience for all users.
- 5. "As Is" Disclaimer: sprachschule-app is currently in a pre-beta stage. The
  service is provided "AS IS" and "AS AVAILABLE," without warranties of any
  kind.

**Additions:**

**6. Changes to These Terms** _(needed: the re-acceptance gate relies on it)_
We may update these Terms. When we do, we will update the "Last Updated" date
and, for significant changes, ask you to accept the updated Terms before you
continue using your account.

**7. Privacy** _(recommended)_
Our Privacy Policy explains how we collect and use your information.

**8. AI-Generated Content** _(optional — counsel's call)_
sprachschule-app uses artificial intelligence to generate tutor replies, answer
feedback and practice content. AI-generated content can be inaccurate.

### 5.3 Consent label (account creation and the acceptance gate)

> ☐ I agree to the [Terms of Service] and acknowledge the [Privacy Policy].

Both bracketed phrases are links to `/terms` and `/privacy`. Unchecked by
default. Error text when an account action is attempted unchecked (text + icon,
never colour alone):

> Required: tick the box to agree to the Terms of Service and acknowledge the
> Privacy Policy.

### 5.4 Acceptance gate copy (post-sign-in, §6.5)

- **No prior acceptance on record:** title "One more step"; body "Before you
  continue, please review and accept our Terms of Service and Privacy Policy.";
  primary "Continue"; secondary "Sign out"; tertiary (if D2 = b) "Delete this
  account instead".
- **Older version on record:** title "We've updated our terms"; body "Please
  review and accept the updated Terms of Service and Privacy Policy to keep using
  your account."; same actions.

### 5.5 Push disclosure (Settings → Notifications, shown before the switch)

Replaces today's single line "Streak reminders and league updates on this
device.":

> Get streak reminders and league updates on this device. If you turn this on,
> we'll ask for your permission, then save a notification token for this device
> to your account. Notifications are delivered through {Apple Push Notification
> service | Firebase Cloud Messaging by Google}. They're optional — the app
> works the same without them — and you can turn them off here or in your
> device's settings at any time.

`{…}` is chosen by the running platform. Denied / failed copy is unchanged.

---

## 6. Acceptance design

### 6.1 Versions

`src/lib/legalAcceptance.js` exports `TERMS_VERSION` and `PRIVACY_VERSION`,
each an ISO date (`'YYYY-MM-DD'`) equal to that document's effective date. Each
legal page renders its "Last Updated" line from its constant as
`Last Updated: <Month> <D>, <YYYY>` (`Last Updated: September 29, 2026`), and a
test pins it, so the text and the version cannot drift. Bumping either constant is the one
act that triggers re-acceptance (D4).

### 6.2 Server record — `public.legal_acceptances`

```sql
create table public.legal_acceptances (
  user_id          uuid not null references auth.users(id) on delete cascade,
  terms_version    text not null,
  privacy_version  text not null,
  accepted_at      timestamptz not null default now(),
  primary key (user_id, terms_version, privacy_version),
  constraint legal_acceptances_terms_version_format
    check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint legal_acceptances_privacy_version_format
    check (privacy_version ~ '^\d{4}-\d{2}-\d{2}$')
);
```

- RLS on. One policy: `authenticated` may **select** rows where
  `user_id = (select auth.uid())` (initplan form, per `20260906000500`).
- No insert/update/delete grant to `anon` or `authenticated`; `service_role`
  full.
- Writes go through one RPC, `accept_legal_terms(p_terms_version text,
p_privacy_version text) returns timestamptz`, `SECURITY DEFINER`,
  `search_path = ''`, executable by `authenticated` only. It raises `42501`
  without `auth.uid()`, `22023` on a malformed version, and does
  `insert … values (auth.uid(), $1, $2) on conflict do nothing`, returning the
  row's `accepted_at` (the original one on a repeat).

**Trust boundary.** The caller's identity comes from the verified JWT
(`auth.uid()`), never a parameter, so no one can write a row for another user.
The timestamp is the database clock, so nobody can backdate. There is no
update/delete path for clients and the RPC never overwrites, so the table is an
append-only history: the first acceptance of each version pair is permanent
until the account is deleted. The only client-supplied values are the version
strings. A learner who calls the RPC by hand can record acceptance of a version
they were not shown — which is still their own assertion about themselves, and
the date format bounds it to plausible identifiers.

**Rejected alternatives.**

- `settings.data` jsonb — client-written, last-write-wins merged, client
  timestamps: not auditable.
- `signInWithOtp({ options: { data } })` → `user_metadata` — client-writable
  later through `updateUser`, and OAuth has no equivalent.
- A trigger on `auth.users` — at creation there is nothing to record: an OAuth
  sign-up has not accepted anything yet.
- A server-side table of published versions checked by the RPC — stronger
  audit, but every copy change would then need an owner-applied migration.
  Listed as a later upgrade, not built.

**Also touched:** export gains `legal_acceptances → legalAcceptances`
(`EXPORTED_TABLES`; `export.test.js` enforces the split); `cascade.test.js`
gains the table; a new `supabase/tests/rls/legal-acceptances.test.js` covers
grants, RPC ownership, validation, idempotency and cross-user isolation.

### 6.3 Two local keys (hints, never authority)

Both new; no existing key is renamed or migrated. Both are wiped by sign-out
like everything else (`clearUserLocalState`).

- `deutsch-app-legal-accepted-v1` = `{ userId, terms, privacy }`. Written only
  after the server confirmed a row (read or RPC). Lets a returning user on a
  known device skip the network check, including offline.
- `deutsch-app-legal-intent-v1` = `{ terms, privacy, at }`. Written when a
  create flow **starts** with the box ticked; consumed once a session arrives.
  Expires after 30 minutes. Cleared when: a sign-in-surface flow starts, the
  auth sheet is dismissed, a callback reports an error, or it is consumed.

### 6.4 Client state machine — `useLegalAcceptance(user)`

```
no user ─────────────────────────────────────────────► 'none'
user + accepted-hint matches (user.id, current versions) ► 'accepted'
otherwise → select own rows from legal_acceptances:
   current pair present ─────────────────────────────► 'accepted' (write hint)
   absent + valid intent → RPC ok ───────────────────► 'accepted' (write hint, clear intent)
   absent, no valid intent ──────────────────────────► 'required' (+ hasPrior)
   network/RPC error ────────────────────────────────► 'unknown' (retry on `online`)
```

App gates on it at one choke point:

```js
const raw = useAuth();
const legal = useLegalAcceptance(raw.user);
const user = legal.status === 'accepted' ? raw.user : null;
const authStatus = raw.user ? (legal.status === 'accepted' ? 'authenticated' : 'loading') : raw.status;
```

Every existing consumer of `user` / `authStatus` in `App.jsx` (sync start,
progress flush, league rewards and standing, admin session, push resume, level
boost, trial wall, entry gate, profile) then sees a signed-out-but-not-anonymous
learner until acceptance — so **nothing is synced, flushed, joined or
registered** before a record exists. `'loading'` keeps the trial wall and entry
gate down, exactly as during today's session restore. `AuthCallbackLanding`
keeps receiving the raw status so its success/timeout behaviour is unchanged.

`'unknown'` fails safe: the learner keeps practising locally (queue and
localStorage as today), nothing reaches the server, and the check retries when
the browser reports `online` or on next launch. It never becomes `'accepted'`
without the hint or the server.

### 6.5 The two UI surfaces

**Pre-auth consent (`LegalConsent`)** — a native `<input type="checkbox"
data-ui="checkbox">` with an associated `<label>` containing two `<a href>`
links; `accentColor` from theme tokens; the global `[data-ui]` focus ring. It
renders on **create surfaces only** (D3): the auth sheet with
`intent === 'create'`, and the trial wall ("Create a free account"). Provider
buttons and "Email me a sign-in code" stay enabled and focusable; activating
one unticked does not start the flow, sets `aria-invalid` on the checkbox,
shows the §5.3 error (`role="alert"`, icon + "Required:" text) and moves focus
to the checkbox. "Verify code" re-checks, so unticking after sending cannot
complete a create.

**Post-auth `AcceptanceGate`** — a non-dismissible modal (focus-trapped, no
Escape, like the callback error panel and trial wall) shown while
`legal.status === 'required'`. It reuses `LegalConsent`; "Continue" is
guarded the same way and calls the RPC. Copy per §5.4, chosen by `hasPrior`.
Legal routes still render above everything, so its links work.

### 6.6 Keeping the draft across the legal pages

App already holds the auth intent (`authModal`). It additionally holds
`authDraft = { email, sent, accepted }`, passed down as controlled props to
the auth sheet, `MagicLinkForm`, the trial wall and the gate. A plain click on a
consent link calls the existing `openLegal` (pushState — no reload, works
offline, shows the bundled text, i.e. exactly the version being accepted);
the sheet unmounts but App state survives; Back (browser, the page's
"← Back", or Android's hardware back through the webview history) fires
`popstate`, the sheet re-renders with the same draft, and focus goes to the
consent checkbox. Modifier/middle clicks keep the browser default (new tab), so
the draft is untouched. The six-digit code is not lifted — it is on screen in
the learner's email — and neither is the resend cooldown. Dismissing the sheet
clears the draft and the intent, so reopening always starts unticked.

### 6.7 Behaviour matrix

| Case                                                                             | Result                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| New account via create sheet / trial wall, box ticked (email, Google or GitHub)  | Intent consumed after the session lands → RPC → accepted. No second prompt.                                                              |
| New account via welcome-screen provider buttons or the Sign-in sheet             | Session lands, no record, no intent → gate (§5.4 "One more step").                                                                       |
| Existing account, current versions accepted, **new device**                      | Server read finds the row → accepted, hint written. Never prompted.                                                                      |
| Existing account, current versions accepted, known device (offline or not)      | Hint matches → accepted with no network.                                                                                                 |
| Existing account accepted an older version                                       | Gate, "We've updated our terms".                                                                                                         |
| Existing account with no record (every account today)                            | D1.                                                                                                                                      |
| Gate: "Sign out" (decline)                                                       | No record written, nothing synced. If this device never synced this account (`syncMeta.lastSyncedAt` is null) → plain `signOut()`, guest progress kept. Otherwise → `signOutAndReset()`, as any sign-out. D2 decides whether "Delete this account instead" is also offered. |
| OAuth cancelled at the provider                                                  | Error callback (web URL or native event) clears the intent; the landing shows today's "cancelled" panel.                                |
| Tab closed / app killed mid-OAuth                                                | Intent survives in localStorage ≤ 30 min, so a cold-start native callback still consumes it; after that it is ignored → gate. Never a false acceptance: an intent exists only if the box was ticked on this device for these versions. |
| Box ticked, then sheet dismissed, then Sign in                                   | Dismiss cleared the intent; sign-in start clears it again → gate if the account has no record.                                          |
| Magic link opened in a different browser/device                                  | No intent there → gate on that device.                                                                                                   |
| Offline after sign-in, no hint                                                   | `'unknown'`: local-only, no gate, no wall; resolves when online.                                                                         |

### 6.8 Guest Mode non-regression

Unchanged by construction: `WelcomeGate`'s "Try it first — free" gets no
checkbox and no new code path; `raw.status === 'anonymous'` still drives the
entry gate and trial wall; sync stays a no-op without a session; the trial
derivation (`trial.js`) and its keys are untouched. The one timing change is
that sync and the progress-queue flush start after acceptance instead of at
session arrival — the same `pullAndMerge` and queue run, so guest progress
merges exactly as today, a few hundred milliseconds later (or after the gate).
Tests in the plan pin each item of the brief's guest list.

### 6.9 Push disclosure

`NotificationsSection` shows the §5.5 paragraph whenever the switch is shown,
above it, so it is on screen before the tap that calls `enablePush` (the only
caller of `requestPermissions`). `resumePushRegistration` only ever checks
permission; a test pins that. `build:mobile` gains `VITE_PUSH_ENABLED=false`
beside the other pinned flags, so no local env file can ship the switch before
the checklist is done; the owner flips that pin when it is.

### 6.10 Tests (brief's list → where)

| Brief requirement                                    | Test                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Unchecked blocks create actions                      | `AuthSheet.test`, `MagicLinkForm.test`, `TrialWall.test`, `AcceptanceGate.test`         |
| Checking permits the action                          | same files                                                                             |
| Links point to `/terms`, `/privacy`                  | `LegalConsent.test`                                                                    |
| Returning accepted user not blocked                  | `useLegalAcceptance.test` (hint + server-read paths), `App.test`                       |
| OAuth callback / new account cannot bypass           | `useLegalAcceptance.test` (no intent → required; stale/mismatched intent → required), `App.test` (sync/flush not started while required) |
| Versioning                                           | `legalAcceptance.test` (bump → required; hint for old versions ignored), RLS suite     |
| Close/reopen creates no false acceptance             | `AuthSheet.test`, `App.test` (dismiss clears draft + intent)                           |
| Guest Mode fully functional                          | `App.test` guest block, `WelcomeGate.test`, existing trial/sync suites unchanged        |
| Push never requested before disclosure/opt-in        | `NotificationsSection.test`, `pushNotifications.test`                                  |
| Legal pages reachable pre-auth and on cold load      | `App.test` (cold `/terms`, `/privacy`, `#/terms` while signed out and while gated)     |
| 375px / 320px                                        | Browser pass on the sheet, trial wall and gate at both widths (preview tool), recorded in the PR |
| RLS/grants                                           | `supabase/tests/rls/legal-acceptances.test.js`, `cascade.test.js`                       |

---

## 7. Decisions for the owner

| #   | Question                                                   | Options                                                                                                                                                                        | Recommendation                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Existing accounts (all have no record)                     | (a) Require acceptance of the current versions at their next launch (gate). (b) Grandfather: no gate for accounts created before a cut-off date — and no record for them.      | **(a).** Nobody has ever accepted anything (no checkbox existed), the new policy is materially different (Anthropic, visibility, IPs, push), and the user base is a handful of accounts. A back-filled "acceptance" would be a fabricated record.                  |
| D2  | Declining the gate                                         | (a) "Sign out" only. (b) "Sign out" plus "Delete this account instead", with the same typed-DELETE confirmation as Settings and the existing endpoint (a fresh sign-in satisfies its re-auth window). | **(b).** Someone who refuses the terms can never reach Settings, so without it they cannot erase the account they just created; both stores require in-app deletion.                                                                                              |
| D3  | Where the pre-auth checkbox appears                         | (a) Create surfaces only (create sheet + trial wall); welcome-screen provider buttons and the Sign-in sheet stay checkbox-free, with the gate catching new accounts. (b) Every surface that can start OAuth. (c) Remove provider buttons from the welcome screen. | **(a).** OAuth can't tell new from returning, so (b) makes every returning user tick a box they already accepted; (c) is a conversion change nobody asked for. The gate is the real guarantee either way.                                                            |
| D4  | Versions and re-acceptance                                  | Date-string version per document; any bump of either requires re-acceptance; typo fixes don't bump.                                                                           | **As stated.** Material-vs-editorial is decided by whether you bump.                                                                                                                                                                                                  |
| D5  | Magic-link "Sign in" with an unregistered email             | (a) Keep creating the account; the gate follows. (b) `shouldCreateUser: false` on the sign-in path.                                                                             | **(a).** (b) reveals whether an email is registered (an enumeration oracle) and still leaves OAuth needing the gate.                                                                                                                                                  |
| D6  | Push flag                                                   | Pin `VITE_PUSH_ENABLED=false` in `build:mobile` now; owner flips it after the checklist. Separately, remove `VITE_PUSH_ENABLED=true` from your local `.env.production.local`.  | **Pin it.** It is the only way the brief's "must remain off" is true for the next archive (P1).                                                                                                                                                                      |
| D7  | Placeholders                                                | Operator legal name, contact email, effective date(s), SMTP provider name.                                                                                                     | Owner supplies; implementation blocks on these.                                                                                                                                                                                                                       |

**Owner answers (2026-09-29):** D1 (a) require acceptance at next launch ·
D2 (b) Sign out + Delete account · D3 (a) create sheet + trial wall only ·
D4 one date-based version per document · D5 (a) create, then gate · D6 pin
`VITE_PUSH_ENABLED=false` in `build:mobile` · D7 operator Shimon Esterkin,
contact ~~esterkinshimon712@gmail.com~~ (superseded 2026-09-30 by
sprachschule.support@gmail.com), effective date 2026-09-29 (both
documents), sign-in email provider Supabase Auth. Versions:
`TERMS_VERSION = PRIVACY_VERSION = '2026-09-29'`.

**Owner update (2026-09-30), binding — supersedes the contact email above.**
Project and brand name `sprachschule-app` (every human-facing product-name
reference in the legal copy, store-submission docs and native display-name
config). Legal operator Shimon Esterkin. Official support/contact email
`sprachschule.support@gmail.com` — used ONLY where the address is the legal,
privacy, support or contact address; `esterkinshimon712@gmail.com` stays wherever
it is the admin, allowlist, system-account, test-identity or authorization
email. Effective date September 29, 2026 (ISO `2026-09-29`) for both documents.
Sign-in email provider Supabase Auth. D1–D6 re-confirmed as answered above.
Operational identifiers keep their existing names and are documented, not
migrated: repository `blackhebrewisraeli/deutsch-app`, Vercel project and URL
`deutsch-app-dusky.vercel.app`, Supabase project `Sprachschule`
(`xcnnlczvxmuwcqwychox`), bundle/application ID and URL scheme
`com.sprachschule.deutsch`, every `deutsch-app-*` localStorage key (including
the two new legal keys, which join that namespace), and the Sentry project.
Brand-name scope (owner brief, 2026-09-30): `sprachschule-app` replaces the
product name wherever it is human-facing brand copy or a declarative name field —
the legal copy; `package.json` / root `package-lock.json` entries;
`capacitor.config.ts` `appName`; iOS `CFBundleDisplayName`; Android `app_name`
/ `title_activity_main`; `index.html` title, description and social metadata;
the PWA manifest names; the magic-link email subject and template in the repo;
the App Store listing; and current native, auth and maintenance docs. Historical
specs and plans keep the name they recorded. The in-app "Deutsch." wordmark and
the rendered `public/social-preview.png` are left for a separate owner decision:
the wordmark sits in a header whose 320px budget has ~10px of slack, so a longer
name is a layout change, not a rename. Production-side copies (Supabase email
template, Google/GitHub OAuth app names) are owner actions in the checklist.

---

## 8. Out of scope — flagged, not built

- **Rate-limit IP retention (P6):** a global sweep of expired windows (e.g. in
  the weekly settle cron, or a bounded delete inside `increment_rate_limit`)
  would let §6 of the policy promise a retention period.
- **Push opt-out server gap (P8):** keep the local record when the server delete
  fails so the next launch retries it; lets §8 drop its caveat.
- **Avatar deletion retry (P7):** log/retry the swallowed storage failure.
- **iOS microphone strings (P13):** verify voice input on device;
  `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription` if it
  is reachable, plus an Audio Data line in Apple's App Privacy answers.
- **Server-side enforcement** of acceptance on write endpoints. The gate keeps
  the client from writing before acceptance; a tampered client only skips its
  own record.
- **Published-versions table** checked by the RPC (§6.2 alternatives).
