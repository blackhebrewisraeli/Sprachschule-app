# Backlog — deliberately-not-started work, and what needs a human

**Why this file is tracked.** The working queue lives in `CURSOR_TASKS.md`, which
is git-excluded (`.git/info/exclude`) and therefore exists on one machine only —
invisible to CI, to Cursor Cloud, and to a fresh checkout. Anything in it that
governs _future_ work rather than one mission belongs here instead, where it
follows the project. `CURSOR_TASKS.md` stays the scratch queue for in-flight
mission briefs; this file is the durable half.

Product decisions that constrain the architecture live in **`AGENTS.md`**, not
here — see the German-only decision under **Project** there.

---

## Blocked — needs a Claude Code spec + plan before anyone starts

Starting these without a written design means the implementing agent invents the
architecture, which is the expensive thing to undo. That is the whole reason
they are listed as blocked rather than "available".

| Item                                          | Notes                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI sub-project 3** — the illustration slice | What is left after the icon/OG slice shipped (see below): an in-app illustration set for the states `StatusNote` renders, and a wordmark lockup beyond the single-letter mark. Neither is needed for beta |
| **Auth Phase E** — phone/SMS OTP              | Deliberately deferred: the only auth component with a per-use cost                                                                                                                                        |

## Ready to execute

| Item                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Monetization Track A** — server-enforced AI quotas                                    | Plan: `docs/superpowers/plans/2026-10-01-monetization-access.md`, Tasks A1–A10. Spec: `docs/superpowers/specs/2026-10-01-monetization-access-design.md`. The owner reviews the spec first; only A1 Step 5 waits on decision D2. Track A is cost control, not commerce, so it runs on Vercel Hobby. **Track B (Premium) and Track C (rewarded ads) stay blocked** on D1, D3 and D4, and on Vercel Pro (D5): the Hobby plan forbids payment processing and ads |
| **AI Tutor conversation history** — optional server-side history for signed-in learners | Spec: `docs/superpowers/specs/2026-10-02-ai-tutor-conversation-history-design.md`. Plan: `docs/superpowers/plans/2026-10-02-ai-tutor-conversation-history.md` (PRs H1–H7). **Design only, awaiting owner answers Q1–Q6 (spec §15).** Not started: no migration, no code, no legal copy. H2 waits for the AI-quota shadow-week review; H4 (copy) must merge before the feature is switched on                                                                 |

## In review

Nothing in review.

## Recently shipped

### UI sub-project 3 — brand + sharing assets

**Shipped as the `feat/ui3-brand-assets` PR.** Design at
`docs/superpowers/specs/2026-09-20-brand-and-sharing-assets-design.md`, plan at
`docs/superpowers/plans/2026-09-20-brand-and-sharing-assets.md`.

The icon set and the OG image, which were the two slices of this item that beta
actually needs. The empty/error-state slice had already shipped as `StatusNote`;
the font slice shipped as #103.

**What was actually wrong** — all four found in the files, not assumed:

- **The icons were rendered from a font we do not ship.** `icon-base.svg` and
  `favicon.svg` drew the `D` with an SVG `<text>` asking for
  `Georgia, 'Times New Roman', serif`. Neither is vendored, so the letterform
  was whatever serif the rasterising machine had — the `pwa-512.png` on `main`
  is a Times D, a face that appears nowhere in the app's type system. The same
  input produced different artwork on different machines and nothing could see
  it. The mark is now constructed geometry (`scripts/gen-assets/mark.js`), and
  a test fails on any `<text>` or `font-family` in an icon source.
- **The icon palette was three dead literals.** `#16110b` (light `fg` used as a
  plane), `#FDF3C0` (the retired parchment ground) and `#D62828` (the
  pre-theme-arc red). None is reachable as a current token. The mark now reads
  `accent-black` / `accent-black-on` / `flag-red` from `themeTokens.js` — all
  three mode-independent, because an app icon has no theme.
- **There was no maskable icon.** The manifest declared `pwa-512.png` twice,
  once bare and once `maskable`. Declaring it is not drawing it: Android may
  crop to the central circle at 80%, and that artwork puts the `D`'s stem and
  the red dot outside it. `pwa-maskable-512.png` is a distinct bitmap, and both
  the generator and the test refuse a mark that does not clear the circle.
- **`index.html` had no sharing metadata at all**, and `docs/social-preview.png`
  sat in `docs/`, which the app does not serve — so no `og:image` could ever
  have pointed at it. The card itself still `@import`-ed Google Fonts (the CDN
  #103 removed), grounded on retired parchment, set its prose in Fraunces
  italic (prose moved to Plus Jakarta Sans on 2026-09-01) and drew its feature
  pills and tick in emoji and U+2713, none of which any vendored family covers
  — five more glyphs that came from the rasterising OS.

**Two decisions worth not re-deriving:**

- **Three mask contracts, so three geometries.** `any` is shown as authored and
  supplies its own rounded plane; `maskable` is full-bleed with the mark inside
  r = 40%; `apple-touch-icon` is full-bleed **square** because iOS always
  applies its own squircle and a baked radius would be rounded twice. One
  bitmap cannot serve all three, which is exactly the bug above.
- **The `D` is Fraunces, baked to outlines** — since 2026-09-27, on the
  owner's call. Until then it was constructed from lines and curves, because
  outlining a variable font needs a font-parsing dependency and embedding a
  subset would bloat a 32px favicon. Both objections are about render time, so
  the outlines are extracted once at authoring time instead:
  `scripts/gen-assets/extract-glyphs.py` (fontTools, outside the npm graph)
  writes `glyphs.js`, and everything downstream is still plain geometry with no
  `<text>` and no font. The favicon uses Fraunces' opsz 9 cut, because the
  display cut's hairlines vanish at 16px. Older notes saying the `D` is
  constructed are superseded by this one.

`npm run gen:assets` regenerates everything (Playwright, already a devDep).
`scripts/gen-icons.js` is deleted: it imported `sharp`, which its own header
admitted was not installed, so it could not be run.

**Not in this slice, and not needed for beta:** an in-app illustration set, a
wordmark lockup beyond the single-letter mark, a `.ico` bundle (every target
browser takes PNG or SVG), and any application UI change — not one file under
`src/components/` was touched. See owner action #9 for the one step nobody with
repo access can do.

### User roles + admin v1

**Shipped as #288.** Identity-based admin (verified email
`esterkinshimon712@gmail.com`), feedback inbox, and user block. Design at
`docs/superpowers/specs/2026-09-18-user-roles-design.md`, plan at
`docs/superpowers/plans/2026-09-18-user-roles.md`. System-account
classification is a separate label for the same mailbox; it does not exclude
anyone from stats or leagues. Admin does not raise AI quotas. Guest path
unchanged. Not in v1: shared content management, a full permissions UI.

Production has `20260918153000_user_roles.sql` (schema_migrations name
`user_roles`); Migration Drift is green. See owner action #5.

### UI sub-project 2 — the page skeleton

**Shipped as #179.** Design at
`docs/superpowers/specs/2026-08-28-ui-sub-project-2-layout-design.md`, plan at
`docs/superpowers/plans/2026-08-28-ui-sub-project-2-layout.md`.

`App.jsx`'s `<main>` and the six tabs now share one skeleton: `PageFrame`
decides the measure, both gutters and the safe-area composition in one place,
and the gap between a tab's `Hero` and its first block is `SPACE[8]` everywhere
it applies. Sub-project 1b's layout primitives finally have a real consumer —
before this, `PageFrame`, `Stack` and `Grid` had **zero**.

**Read the scope carefully before treating this as "the redesign done".** The
owner chose _consistency, not a new look_: the app should look as it did, on one
skeleton. The measured result was exactly that — a geometry probe over six tabs
× three widths found **three** differences in the whole app, all
`Alphabet.heroGap: 24 → 32`, which was the one stated intentional change. A
genuine visual redesign — new spacing scale, restructured screens, different
density — was **not attempted** and remains open work if anyone wants it.

Two decisions worth not re-deriving:

- **The measure stays 1400.** `PageFrame` shipped in 1b with a `maxWidth: 900`
  default that was a guess made with no consumer to check it against. Moving the
  app to it would have cut Chat's conversation column from 688px to 188px — the
  side columns are fixed, so the whole loss lands on the centre. The primitive
  moved to describe the app instead.
- **The bottom gutter is a plain value now — do not re-add an `env()` term.**
  `PageFrame` shipped in 1b with `paddingBottom: env(safe-area-inset-bottom, 0px)`,
  which is 0 on desktop, so adopting it naively would have silently removed 32px
  of clearance from every tab. Sub-project 2 first fixed that by _composing_ —
  `calc(gutter + env(...))`, so the inset could never replace the gutter. The
  review of that change then found the deeper problem: `index.html` has no
  `viewport-fit=cover`, so the inset resolved to 0 on every device anyway, and
  the whole term was inert. **#180 removed it**, and the test now asserts the
  bottom padding contains no `safe-area-inset` at all. Re-adding one is only
  correct alongside the `viewport-fit=cover` opt-in, which is a real visual
  change worth ~34px on notched iPhones.

**Known limits of the verification**, recorded so nobody reads more into it than
it proves. `scripts/dev/audit-layout.mjs` measures five properties — measure,
inline padding, bottom padding, the Hero gap, horizontal overflow — and nothing
else; colour, typography and z-order are outside it. All 18 rows are the **guest**
state, so Stats with real data, Vocab mid-drill and open modals are unmeasured.
`StatsTab` has **two** Heroes (Ligen at `:123`, Statistik at `:134`) and the probe
only ever reaches Statistik, so one of the app's six Heroes is never measured —
the rule already holds there, but the 18/18 denominator does not reveal the gap.

Downstream: the review of this work is what found the `viewport-fit=cover` gap
above. #180 then removed both inert declarations — `PageFrame`'s and an
`.entry-screen-foot` rule that no element in the app ever carried — and guards
the opt-in so the dead code cannot come back unnoticed.

### UI sub-project 1b — the primitive set

**Done.** Design at `docs/ui-primitives-spec.md`, plan at
`docs/superpowers/plans/2026-08-27-ui-primitives.md`, shipped as #166 (spec +
plan), #167–#173 (Tasks 1–7) and #176 (Task 8, alongside the toast close
button). `src/components/ui/` now holds twelve sources: the six that existed
plus `Heading`, `Text` (Body/Meta), `tone`, `Surface`, `InteractiveCard` and
`Layout` (Stack/Row/Grid/PageFrame).

Writing the spec against the code — rather than from first principles — is what
made this worth doing, because it turned up nine real defects that had nothing
to do with adding primitives:

- **`BUTTON.ghost` painted its label `COLORS.paper`**, the page-ground colour,
  so ghost text was invisible on any ground-coloured surface. It had zero
  consumers, which is exactly why no test had ever caught it.
- **Three hand-rolled `:focus-visible` recipes** with two different spellings,
  and no global rule at all — the other ~78 raw `<button>` elements had only the
  UA default.
- **The colour guard walked `.jsx` only** (five `.js` files under
  `src/components` were unscanned) and matched hex only, so `rgba()` and named
  colours sailed through.
- **`BUTTON.secondary` carried `flex: 1`** — a layout decision inside a colour
  token, which was stretching two buttons vertically in column containers.
- **`ui/Button` applied press styles after the caller's `style`**, so an
  override silently lost.
- **`GoogleButton` implemented busy as `disabled={busy}`** — on the component
  that carries `autoFocus` at two of its three call sites, so it dropped the
  user's focus to `<body>` at the moment they acted.
- **`FeedbackDialog` and `TutorialOverlay` never returned focus** to what opened
  them. Five of the seven dismissible surfaces already did.

Four guards now make the recurring structural mistakes unrepresentable rather
than remembered: colour literals in any notation, palette-layer imports inside
`ui/`, a bare `1fr` grid track, and a control nested inside an
`InteractiveCard`. Each was staged red against a fixture that could express the
failure before being trusted.

**The migration was deliberately NOT part of this.** Spec §12 makes it
opportunistic: new code uses the primitives, and a surface migrates when someone
is already editing it. So ~85 raw `<button>` elements and ~30 raw `fontSize`
literals remain on purpose — that is the policy, not an unfinished task. The two
exceptions were migrated: `UI.jsx`'s `Hero` / `SectionLabel` / `StatBlock` now
sit on the primitives (nine consumers, none of which needed a change), and the
three hand-rolled focus rings are gone.

### Known gap — the focus ring is invisible on ink-coloured planes

**Closed.** The global sheet now has a second ring, opted into with
`data-focus-on-dark`. Spec §10.1 and `FOCUS.onDark` document it. Controls on
ink-built planes (toast close, masthead Sign in, StatusChip trigger, alphabet
detail play) carry the attribute; chips that bring their own surface disc
(ThemeChip, signed-in AccountChip) use `data-focus-inset` instead, so the
default ink ring stays on the disc rather than painting onto charcoal. Toast's
scoped paper recipe is gone — one mechanism, not a per-component workaround.

### The charcoal masthead — `accentBlack`'s consumer

The masthead landed: the header is `COLORS.accentBlack` in both modes, carrying
the splash's black stripe into the app frame, with the wordmark on
`accentBlackOn` and its dot on `COLORS.flagRed` — the same token the splash
paints it with.

The design rule that made it cheap is worth keeping, because the obvious
approach does not work: **on the masthead, only brand text sits on the charcoal;
anything informational carries its own surface.** Painting the bar and re-inking
each control would have needed a mode-independent copy of every ring colour —
the XP arc falls to 2.21:1 on charcoal in light.night, the goal ring's red to
2.44:1. Giving `LevelBadge` and `GoalRing` a `surface` disc instead keeps every
already-audited pairing valid and adds no colour tokens. `StatBlock` and
`ThemeChip` needed no change at all: they already carried their own surfaces,
which is what suggested the rule.

One token was added — `accentBlackOnMuted` — because the tagline had nothing to
use: `fg-muted` is a dark brown in light mode. It is opaque rather than
`accentBlackOn` at alpha so `contrast.test.js` can assert it; alpha tokens are
excluded from that sweep and would go unchecked.

## Retired rather than left unused

Two tokens shipped in #131 and were deleted before gaining a consumer, which is
recorded here so nobody re-adds them reasoning from first principles:

- **`accentGold`** — `COLORS.gold` (the pack accent) already carries reward,
  streak, XP and level-up. A second gold had no rule to distinguish it.
- **`borderSubtle`** — in-card dividers use `COLORS.inkA10`/`inkA12`, ink at
  10-12% alpha, which composites correctly on every surface including the
  derived elevation steps. An opaque token cannot, so adopting it would have
  been a regression.

`COLORS.accentAlt` has sat unused since the theme arc began. One unused accent
in a palette is a rounding error; four is how a palette stops being trustworthy.

## Body sans — adopted

**Shipped as #221 (2026-09-01).** Plus Jakarta Sans is the body face;
Fraunces stays display; JetBrains Mono stays labels and IPA. `AGENTS.md`
records this. Do not flip body back to Fraunces as a drive-by.

The tradeoff that was weighed, so it does not need re-deriving: Fraunces is a
display serif with an `opsz` axis, and it was doing double duty as body copy at
13–15px, where its contrast modulation is what makes long prose feel dense. A
sans loosens paragraph texture in chat and exercise copy, and it makes the
display headings read as _deliberate_ rather than as the default.

Recently shipped: **`hasStoredLevel()` now means "has a _valid_ level"** (#121,
#123) — a device holding a corrupt level value used to skip the picker and
silently land on A1. Design kept at
`docs/superpowers/plans/2026-08-18-level-pref-validation.md`.

---

## Owner actions — nobody with repo access can do these

When returning from time away, walk `docs/PRE_BETA_OWNER_CHECKLIST.md` first
(key rotation, secret-scanning, Auth template/URLs, custom domain, signup
policy / allowlist enable after #294, leaked-password protection). The
table below is the durable queue; the checklist is the once-per-return
pass. The #290 then #293 migrations are **done** — applied and verified
2026-09-21, see checklist §8.

- **Store submission:** work through docs/STORE_SUBMISSION_CHECKLIST.md — item 1
  (apply legal_acceptances) must happen before the terms PR merges.

### Sentry source-map upload — needs a token only the account owner can mint

The build side is done and merged; it is dormant until this exists. Without it
Sentry shows minified stack traces, which is most of the way back to not having
the errors at all.

1. Sentry → **Settings → Auth Tokens → Create New Token**, scopes
   **`project:releases`** and **`org:read`**.
2. Vercel → project → **Settings → Environment Variables** → add
   **`SENTRY_AUTH_TOKEN`** to **Production and Preview**.
   - **Not** `VITE_SENTRY_AUTH_TOKEN`. Vite inlines every `VITE_*` var into the
     public bundle, so the prefix would publish a write-scoped credential.
3. Redeploy. Vite bakes build-time env at build time, so the variable alone
   changes nothing until a new build runs.

Verify it worked: the deploy's build log has no `SENTRY SOURCE-MAP UPLOAD
FAILED` banner, and the release in Sentry lists artifacts. A failed upload does
**not** fail the build — deliberately, so a Sentry outage cannot block a deploy
— which is exactly why the banner exists.

Note this widens the blast radius of a stored credential: unlike the read-only
token at `~/.config/deutsch-app/sentry-token`, this one can write. It lives only
in Vercel, never on disk in the repo.

Each needs the Supabase, Google Cloud or GitHub dashboard. Neither Claude Code nor Cursor
can complete or, in most cases, verify them; status below says how each was
checked so a stale entry is obvious.

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Paste `supabase/templates/magic_link.html` into the **hosted** project → Authentication → Email Templates → Magic Link. Local GoTrue reads it from `config.toml`; production does not.                                                                                                                                                                                                                                                                             | ✅ **Done** — owner applied the hosted template and 5-minute OTP expiry on 2026-09-18, as recorded in `docs/PRE_BETA_OWNER_CHECKLIST.md` §3. Re-paste after future template changes.                                                                                                                                       |
| 2   | Confirm hosted **URL Configuration** lists production plus `http://localhost:5173` and `http://127.0.0.1:5173`.                                                                                                                                                                                                                                                                                                                                                    | **Unverified from the repo** — hosted dashboard state                                                                                                                                                                                                                                                                      |
| 3   | Google OAuth client → Supabase Google provider → `VITE_GOOGLE_AUTH_ENABLED=true` on Preview + Production, **then redeploy**.                                                                                                                                                                                                                                                                                                                                       | ✅ **Done** — flag present in the production env, Google sign-in live since 2026-08-17. Procedure: `docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`                                                                                                                                                                                     |
| 4   | Apply `supabase/migrations/20260916183000_feedback.sql` to Sprachschule (`xcnnlczvxmuwcqwychox`) after that PR merges. Dashboard SQL editor. Never `migration repair`.                                                                                                                                                                                                                                                                                             | ✅ **Done** — table is live in production. `status` / `handled_*` arrived with action #5.                                                                                                                                                                                                                                  |
| 5   | Apply `supabase/migrations/20260918153000_user_roles.sql` to Sprachschule after the roles/admin PR merges. Dashboard SQL editor. Never `migration repair`. Adds `feedback.status` / `handled_*` and `profiles.blocked_at`, and narrows profile UPDATE grants. **Do not exclude system accounts from stats/leagues.**                                                                                                                                               | ✅ **Done** — applied 2026-09-18. Production has schema_migrations name `user_roles`; Migration Drift is green. Never `migration repair`. **Do not exclude system accounts from stats/leagues.**                                                                                                                           |
| 6   | Apply `supabase/migrations/20260918200000_revoke_is_league_member_execute.sql` to Sprachschule (**#290**, first). Dashboard SQL editor. Never `migration repair`. Moves `is_league_member` to schema `private` and retargets both league RLS policies (advisor 0029). Then confirm Stats → Ligen still loads for a signed-in user.                                                                                                                                 | ✅ **Done** — applied 2026-09-21. Verified via Migration Drift CI (green on `main` 2026-09-19/20, red 2026-09-18) + production read-only check: `is_league_member` lives only in `private`, both league policies retarget it, advisor 0029 clear. Never `migration repair`. Record: `docs/PRE_BETA_OWNER_CHECKLIST.md` §8a |
| 7   | Apply `supabase/migrations/20260918213000_server_only_rls_deny_policies.sql` to Sprachschule (**#293**, after #6 / the #290 migration). Dashboard SQL editor. Never `migration repair`. Adds deny-all RLS policies on `rate_limits` and `progress_events_seen` (advisor INFO 0008). Learners never hit these tables.                                                                                                                                               | ✅ **Done** — applied 2026-09-21, after #6. Verified via Migration Drift CI + production read-only check: both tables carry a `no client access` policy (`FOR ALL`, `USING false` / `WITH CHECK false`), advisor INFO 0008 clear. Never `migration repair`. Record: `docs/PRE_BETA_OWNER_CHECKLIST.md` §8b                 |
| 8   | Enable the closed-beta email allowlist via Vercel when you want signup locked (**after #294**). Set `SIGNUP_EMAIL_ALLOWLIST` and `VITE_SIGNUP_EMAIL_ALLOWLIST` on Production + Preview to the same list, then redeploy. Unset = open signup (current production default). Do not disable the Google provider.                                                                                                                                                      | **Not enabled** — owner-only. Code shipped as #294; production stays open until the vars are set. Procedure: `docs/PRE_BETA_OWNER_CHECKLIST.md` §5                                                                                                                                                                         |
| 9   | Upload `public/social-preview.png` to GitHub → repo **Settings → Social preview**. This is a repo setting, not a file in the tree: the `og:image` meta already serves the app's own link previews, but GitHub's card is set only through the dashboard and there is no API for it. The image is 1200x630, which is GitHub's 1.91:1 crop exactly. Re-upload after any `npm run gen:assets` that changes the card.                                                   | **Not done** — owner-only. The old `docs/social-preview.png` this replaces was never wired to anything                                                                                                                                                                                                                     |
| 10  | GitHub OAuth App → Supabase GitHub provider → `VITE_GITHUB_AUTH_ENABLED=true` on Preview + Production, **then redeploy**. The privacy-policy wording ("via Google or Magic Link") must be updated first — it is supplied legal copy, so the new text comes from the owner.                                                                                                                                                                                         | **Not started** — owner-only. Code ships dark behind the flag. Procedure: `docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`                                                                                                                                                                                                              |
| 11  | Add `com.sprachschule.deutsch://login-callback` to the hosted **URL Configuration → Redirect URLs** (keep every existing entry, leave the Site URL alone). Without it Supabase silently sends every sign-in started in the iOS / Android app to the website instead of back to the app.                                                                                                                                                                            | **Not done** — owner-only; blocks native sign-in. Procedure and on-device checks: `docs/MOBILE_AUTH_SETUP.md`                                                                                                                                                                                                              |
| 12  | Apply `supabase/migrations/20260927120000_user_devices.sql` to Sprachschule after the push PR merges; follow docs/MOBILE_PUSH_SETUP.md §1. The Management API procedure there applies the file and records migration history. Adds the server-only `user_devices` table and the `register_push_device` / `unregister_push_device` RPCs.                                                                                                                            | **Applied** (migration history lists 20260927120000 user_devices; checked 2026-10-01). **Follow-on not done:** apply 20261001120000_push_streak_reminders.sql the same way — `docs/MOBILE_PUSH_SETUP.md` §1                                                                                                                |
| 13  | Push notifications: Firebase project + `android/app/google-services.json`, the iOS **Push Notifications** capability in Xcode, the APNs key uploaded to Firebase, the Firebase iOS app + GoogleService-Info.plist + FirebaseMessaging package, then follow docs/MOBILE_PUSH_SETUP.md §4 and docs/STORE_SUBMISSION_CHECKLIST.md item 9. **Never enable push without `google-services.json`: Android crashes on register.**                                          | **Not started** — owner-only. App side ships dark behind the flag; the sender is built and inert until docs/MOBILE_PUSH_SETUP.md §6 is done. Procedure and on-device checks: `docs/MOBILE_PUSH_SETUP.md`                                                                                                                   |
| 14  | Monetization: answer D1–D5 in `docs/superpowers/specs/2026-10-01-monetization-access-design.md` §16. Upgrade Vercel to **Pro** before any purchase or ad goes live: Vercel's fair-use page restricts Hobby to non-commercial use, and names both payments and advertisements. Set an Anthropic Console monthly spend limit before `AI_QUOTA_MODE=shadow`. Apply each track's migration with the Management API drill; agents never apply them. Full list: spec §17 | **Not started** — owner-only. Decisions requested 2026-10-01                                                                                                                                                                                                                                                               |

Two traps worth keeping, both from #96:

- The redirect URI is **Supabase's** `/auth/v1/callback`, not the app origin.
  That is the step people get wrong.
- Vite inlines env at **build** time, so flipping a `VITE_*` flag changes nothing
  until a redeploy.

---

## Known gaps, recorded rather than fixed

- ~~**The contrast audit does not cover signed-in-only chrome.**~~ Closed: the
  audit now runs a signed-in pass (2 modes x 2 tones) over the AccountChip, the
  Stats account section, the league table and the profile card, using a seeded
  session and stubbed league responses. The freeze chip named in the original
  entry was never actually a gap — the existing seed yields two freezes, so the
  guest walk already rendered it.
- **The contrast gate covers header sheets, listed modals and Chat's model
  popover, not every overlay.**
  Header sheets are DISCOVERED (`header button[aria-haspopup="dialog"]`); full
  modals are LISTED, because reaching one is an app state rather than a button
  in a fixed place — but each entry opens the modal itself and the run fails if
  it does not appear, so a modal that stops being reachable reports that rather
  than dropping out silently. Covered today: the sign-in sheet, the trial wall,
  and `AuthCallbackLanding` (seeded via the real expired-magic-link query
  `?error=access_denied&error_code=otp_expired` — no live OAuth required; the
  error phase is the durable overlay, pending/success self-dismiss).
  `ProfileCard` is already reached by the signed-in pass. `ModelPopover` is
  neither a header sheet nor a modal — it is a non-modal popover in the PAGE
  BODY, so discovery scoped to `<header>` cannot see it and it is driven by
  name in `auditChatModelPopover`; the next body popover needs the same
  treatment, or it ships unmeasured. Not covered: `VitalsOverlay` (dev-only).
  Add new overlays to `MODALS`.
- ~~**League table rows are not keyboard reachable.**~~ Closed: each row is a
  real `<button>` inside the `<li>` (`data-ui="button"` + `data-focus-inset`),
  so Tab / Enter / Space open the profile card. The signed-in contrast pass
  clicks that button rather than the list item.
- **`card.de` is read directly by seven components.** Recorded as an accepted
  exception in `AGENTS.md`, not a defect. Do not "fix" it.
- ~~**`npm run audit:contrast` cannot complete locally, though CI runs it fine.**~~
  Closed: the script now provisions its own target. With no `AUDIT_BASE` it
  builds with stub Supabase config into `dist-audit/`, serves it, audits, and
  tears the server down — so `npm run audit:contrast` works on a developer box
  with a real `.env`, which it never did before. The cause was that a build
  carrying real `VITE_SUPABASE_*` rejects the seeded session the signed-in pass
  needs; CI passed only because it builds with stubs. Setting `AUDIT_BASE`
  still means "I am providing the server" and skips provisioning, which is the
  path CI takes. `AUDIT_SKIP_BUILD=1` reuses the last build and warns when
  `src/` is newer than it.

- ~~**The header-sheet layout check only covers the Appearance sheet.**~~
  Closed: the audit now DISCOVERS header sheets (`header
button[aria-haspopup="dialog"]`) instead of selecting one by its literal
  aria-label, drives each in turn, and colour-audits each one's interior while
  it is open — a closed sheet contributes no pairings, so the interiors were
  unaudited too. It also asserts its own coverage against `MIN_HEADER_SHEETS`
  and prints how many sheets it measured, because "0 findings" and "0 sheets
  checked" previously looked identical in the output. Proved with both
  controls: a deliberate clipping bug in the Status sheet is now caught across
  every mode/tone/viewport, and dropping a chip out of discovery fails the run
  with "expected at least 2 header sheets, found 1". AccountChip was brought
  into the same pattern afterwards — it had advertised `aria-haspopup="true"`
  (menu) over a panel with no role, so it was neither correct ARIA nor
  discoverable. Its sheet only exists with a session, so the floor is per-pass
  (2 guest / 3 signed-in) and the signed-in walk opens the sheets too.
  Opening it for the first time immediately found a real defect: the email line
  rendered at 1:1 in light mode, invisible, because the panel carried its own
  background but inherited the masthead's on-charcoal ink.
- ~~**Chat's model popover and Profile → Settings were outside the rendered
  audit.**~~ Closed: `npm run audit:contrast` now drives both.

  The popover is opened through its ACCESSIBLE trigger
  (`button[aria-haspopup="dialog"][aria-label^="Modell:"]`) in every guest
  combination — 2 modes × 3 viewports — piggybacking on the tab walk's visit to
  Chat, so it costs no extra navigation. Per combination it
  fails the run when the trigger or the dialog is missing rather than skipping
  quietly; asserts the four choices (Auto / Fast / Balanced / Capable) are
  present while open and ABSENT while closed, which is the whole point of
  collapsing the always-visible 2×2 grid out of Chat's tab order; checks
  `aria-expanded` in both states and that Escape dismisses; measures the dialog
  and every text node inside it against both viewport edges plus
  `scrollWidth - clientWidth`; and colour-audits the interior — including the
  plan-fallback caption, which is reached by picking a band above the guest
  tier and which no other pass can render, because every pass starts on `auto`.
  `sheetAnchor.placeSheet` is a pure function precisely because jsdom reports
  every rect as 0×0; this is the only place the clamp and the flip-above are
  asserted against a rendered box.

  Settings gets its own sweep at **320 / 375 / 1280** in both modes as a guest,
  and the signed-in pass now sweeps the same three widths with a populated
  seeded account rather than standing at 390. Both measure contrast, every
  element's edges against the viewport, and page overflow. Its own sweep rather
  than a fourth entry in `VIEWPORTS`: adding 375px to the matrix would re-walk
  six tabs, three modals and two header sheets at a width whose only open
  question is how one route reflows.

  Proved with eight controls, each failing the run with the surface and width
  named: a renamed trigger, a trigger whose click does nothing, the grid left
  mounted while the popover is closed, an unclamped placement, a dropped
  choice, a renamed SETTINGS segment, a 900px row on the route, and a 1.87:1
  hint. What it still cannot see: a label that breaks INSIDE a word (the
  `SPOR / T` tiles of #305 overflowed nothing), and any colour pairing a
  fixture does not render.

- ~~**The contrast audit sweeps a theme `tone` no code reads.**~~ Closed: the
  `TONES` loop is gone, and the script no longer writes `deutsch-theme-tone` at
  all. The Appearance picker lost its Day / Night tone in `d0a9bf3`
  (2026-08-24) — `THEME_TONE_KEY` and every tone accessor went with it, and
  `MODE_COLORS` collapsed from mode × tone to mode-only — but the audit kept
  sweeping both values for almost a month, so every guest combination and every
  signed-in combination ran twice over identical pixels.

  Measured before removing, not argued from a grep. Against the production
  build, with the mode held fixed, `day`, `night` and NO KEY AT ALL produce
  byte-identical readings of all 69 custom properties on `:root` and of the
  resolved colour / background / border of 55 text nodes on the Settings route.
  The control — light vs dark — moves both hashes, so the probe could see a
  palette change if there were one. An earlier version of that probe reported
  8 of 12 pairs differing; every one of those was the one-shot tutorial overlay
  or a randomised drill sentence, not colour, which is why the reading is taken
  on a deterministic surface with the tutorial dismissed.

  Guest combinations 72 → 36, signed-in 4 → 2, popover measurements 12 → 6,
  signed-in Settings 12 → 6. Runtime 3:30 → 1:54, measured on the same box. If a tone ever comes back,
  the loop comes back with it; the comment at `MODES` says so.

- ~~**Local `.env` holds a Sentry user token where a DSN belongs.**~~ No
  `VITE_SENTRY_DSN` assignment remains in `.env` or `.env.local` as checked
  2026-09-20, so the recorded `sntryu_`-as-DSN console warning is no longer a
  current local issue. Local Sentry remains off unless a real DSN is supplied.
  This check says nothing about today's Vercel setting; the owner action for
  production source-map upload is above.
- **No dedicated animated "streak at risk" cue, by decision.** #263 removed
  the duplicate header streak on Home, where `PersonalHub` shows the streak and
  the mission board carries the at-risk prompt. #267 removed the remaining
  header streak pills: `GoalStrip` shows streak and daily goal on the other
  tabs. The old `streakPulsing` path is gone. Do not add a pulse to
  `PersonalHub` as a drive-by; that would be a separate product decision and
  PR, weighed against the hub's other signals.
- ~~**The header streak is freeze-blind until the first progress event.**~~
  Closed: the mount hydrate now passes `frozenDays` into `currentStreak` the
  same way `deriveGame` does, so `stats.streak` counts freeze-rescued days on
  first load instead of waiting for `deutsch:progress`. Guarded by the App
  test that seeds a frozen-day gap, flushes the persist that used to overwrite
  the freeze-aware `applyProgress` write, and asserts Profile `STREAK N`. The
  one-argument miss was first corrected in #277; this entry stayed open
  because that PR's subject was the named-deck hop.
