# sprachschule-app — Beta Maintenance Checklist

Run this smoke test after a production deployment, dependency update, or AI
model change. Use the [pre-beta owner checklist](PRE_BETA_OWNER_CHECKLIST.md)
for dashboard settings, migration application, and signup policy; those are
separate owner actions.

## Prepare

1. Record the deployment ID, date, browser, and result of each section. Open
   <https://www.sprachschule-app.com> with DevTools Console and Network open.
2. Use a **disposable browser profile** for the fresh-visitor pass. Clear that
   profile's site data and reload. Do not clear a learner's real progress.
3. Use a separate existing beta test account for signed-in checks. Keep its
   progress populated so the freeze indicator, long rank names, and sync path
   render.
4. Check desktop, **375px**, and **320px**. At each width, measure horizontal
   overflow with
   `document.documentElement.scrollWidth - document.documentElement.clientWidth`;
   expected result is `0`.

### What the automated audit already covers

`npm run audit:contrast` runs in CI and on a developer box (it builds and
serves its own stub-config target). Treat the surfaces below as machine-checked
for what the table says and only that: **text contrast against WCAG AA**
everywhere, and **horizontal fit** — element edges, and where noted
`scrollWidth - clientWidth` — on the surfaces that carry it. Spend the manual
passes on what it cannot see: audio, keyboard order, offline, and anything only
a human reads as wrong. The sync lane and leagues are covered by the signed-in
smoke below — but against a fixture, never against production, so a real round
trip is still a manual check.

| Surface                                          | Widths           | Contrast                             | Horizontal fit                | States                                                                                                  |
| ------------------------------------------------ | ---------------- | ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| All six tabs                                     | 1280 / 390 / 320 | yes                                  | no — contrast only            | guest, populated, 2 modes (light and dark)                                                              |
| Header sheets, all, opened by their triggers     | 1280 / 390 / 320 | yes                                  | element edges                 | 2 guest, 3 signed-in                                                                                    |
| Sign-in, trial wall, expired-link overlay        | 1280 / 390 / 320 | yes                                  | element edges                 | guest                                                                                                   |
| Chat → model popover                             | 1280 / 390 / 320 | yes, incl. the plan-fallback caption | element edges + page overflow | guest; opened by its accessible trigger, four choices asserted present when open and absent when closed |
| Profile → Settings                               | 320 / 375 / 1280 | yes                                  | element edges + page overflow | guest, and signed-in with a populated account                                                           |
| Profile → Leagues, profile card, account section | 390              | yes                                  | no — contrast only            | signed-in, stubbed standings                                                                            |

The run fails when a surface stops being reachable, not only when a colour is
wrong, and it prints how many of each it measured. A zero next to a surface in
that output means it was never reached — read it before trusting a clean run.

Not machine-checked: a label that breaks inside a word, an overlay not listed
in the script, anything behind a live network call, and `VitalsOverlay`.

### What the browser smokes already cover

Two more CI jobs walk the journey rather than measuring a surface.
`npm run smoke:learning-path` takes the guest path; `npm run
smoke:auth-learning-path` takes the half a guest can never reach. Both build
and serve their own target, and the signed-in one needs a **stub** Supabase
build — a real `VITE_SUPABASE_*` rejects its seeded session, so do not point
it at production.

The signed-in walk repeats every step below at **1280, 375 and 320**, so each
row is asserted three times against a differently sized shell.

| Step                       | What passing actually proves                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Session restore            | the seeded session satisfies `useAuth`; the chip renders and "Sign in" does not                                                         |
| Answer → sync              | **that** answer's event reaches the wire and is acked, not merely that a POST happened                                                  |
| Reload after a local wipe  | progress is rebuilt from the server, so the reconcile lane actually ran                                                                 |
| Profile → Leagues          | a ranked standings table with the caller highlighted and zone dividers — not the soft error line                                        |
| Account controls, sign-out | Export and Delete are present, the sheet shows the signed-in email, and sign-out returns to the guest shell with the session key cleared |
| Fit, at five points in the walk | Home, Vocab, after the reload, Leagues and the signed-out shell each measured for `scrollWidth - clientWidth`, a child spilling its parent, and a nav button clipping its own label |

Against a **fixture server**, so this says nothing about production PostgREST,
GoTrue or the AI lane. Delete is asserted by presence only — it is never
clicked.

Read its step lines, not only its exit code: the run aborts at the first
failure, so a missing `✓ narrow@320` means that width never ran rather than
that it passed. That is not hypothetical — the job was added after #311 gave
the Settings segmented control a second `aria-label="Account"`, which killed
the run at step 5 on the first viewport and left 375 and 320 unwalked while
the footer redesign (#312) landed on top of it and the suite stayed green.

The guest path and core practice work with no AI backend. Chat replies, custom
deck generation, and B1 translation grading require the deployed `/api/v1/ai/*`
functions. Local `npm run dev` does not serve those functions; use production or
`npm run dev:full` with the required credentials for the AI pass.

## 1. Fresh visitor and Home

| Action                                   | Expected                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Load the disposable profile              | Welcome screen offers **Try it first — free →**; account actions appear when auth is configured. No console error. |
| Continue as guest                        | **Find your level** offers a nine-question placement test. Complete it and choose **Continue**.                    |
| Finish or dismiss the first-run tutorial | Home opens with the identity card, missions, and quests. The tutorial does not restart on a normal reload.         |
| Inspect navigation                       | Six destinations: **Home, Chat, Alphabet, Vocab, Translate, Profile**.                                             |
| Reload                                   | The classified A1/A2/B1 level and local progress persist; placement does not reopen.                               |

If the Welcome screen or placement test is absent, first confirm the disposable
profile really has no site data. A returning account can receive its saved level
from sync and correctly skip placement.

## 2. Core practice without AI

| Action                                                                      | Expected                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alphabet → Quiz → press the play control, then answer                       | Sound follows the press; a correct or incorrect verdict appears, the score changes, and **Next round** advances. Nothing speaks automatically on load. |
| Alphabet → Browse → select a letter                                         | The A–Z plus Ä/Ö/Ü/ß grid renders; the selected letter has a detail panel and audio.                                                                   |
| Vocab → Practice → select a preset deck such as Greetings and answer a card | The verdict is shown, the queue advances or requeues, and learned progress updates.                                                                    |
| Vocab → Browse                                                              | A view-only deck table opens. It does not create or delete decks.                                                                                      |
| Translate at A1                                                             | Word tiles move into the answer, **Check** gives feedback, and Skip advances.                                                                          |
| Profile → Stats                                                             | XP, learned count, today's activity, and review data reflect the practice just completed. Reload and confirm the values persist.                       |

For A2 and B1, use test profiles already classified at those levels or
**Profile → Settings → Retake placement**. Do not use the advanced manual
override for this check. A2 uses fill-in-the-blanks; B1 uses free typing and AI
grading, so test B1 in section 3.

## 3. AI and feedback

Run these against production after an AI or model change. Avoid asserting exact
AI wording; check the request, response, and user-visible state.

| Action                                                             | Expected                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat → send a German message                                       | `/api/v1/ai/chat` succeeds; Anna responds. EN and IPA can be revealed on request. A correction, when returned, appears beside the learner's message. |
| Chat → change scenario | The scene character opens in role (e.g. a barista for Order Coffee) at the classified level, and the task resets. At A1 the composer shows word blocks built from the AI's suggestion. |
| Vocab → Custom → enter a topic and generate                        | `/api/v1/ai/deck` succeeds; a ten-card deck appears in the custom collection and can be practised.                                                   |
| Translate at B1 → submit an answer                                 | `/api/v1/ai/grade` succeeds; the verdict and corrected sentence or feedback appear.                                                                  |
| After feedback changes: submit a report from the beta test account | A success state appears. In the admin inbox, verify receipt and mark the test report handled. Its answer field is visible only to the admin.         |

If a request fails, record its status and the deployment ID. Check the Vercel
function log and [AI endpoint contract](api/ai.md), then verify the server-side
`ANTHROPIC_API_KEY` and the selected model in
`src/lib/ai-routing/catalog.js`. Do not put keys in a bug report. The legacy
`/api/chat` shim is not the route used by the app.

## 4. Signed-in account and sync

Use the existing beta test account; do not create or delete a real user just
for a smoke test.

| Action                                                          | Expected                                                                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sign in with Google, GitHub or Magic Link, whichever is enabled | Return to the app with the account chip visible; no silent failure or loop.                                            |
| Complete one practice answer, then reload                       | XP and learned progress persist. Profile → Settings → Account shows a recent sync when sync is enabled.                |
| Open Profile → Leagues, when the feature flag is enabled        | Standings load for a signed-in member; selecting a row opens the learner profile.                                      |
| Open Profile → Settings                                         | Profile, placement retake, interests, model preference, appearance, offline cache, and account controls are reachable. |
| Open the account chip                                           | Its Profile and Settings actions reach the correct view.                                                               |

If account or league controls are absent, check the deployed feature flags and
the [auth runbooks](AUTH_GOOGLE_OAUTH_RUNBOOK.md). A visible control alone does
not prove the Supabase round trip works. If a security migration has just been
applied, follow its specific verification steps in the
[owner checklist](PRE_BETA_OWNER_CHECKLIST.md#8-apply-pending-security-hardening-migrations).

## 5. Mobile, accessibility, and offline

Check **320px and 375px with a populated account**, then repeat the overflow
measurement on all six tabs, inside a Vocab drill, and with a header sheet open.
`npm run audit:contrast` already measures the six tabs for contrast at
1280 / 390 / 320, and Chat's model popover and Profile → Settings for contrast
AND horizontal fit (see the table under _Prepare_). It does **not** take a
per-tab overflow reading, so the tab-by-tab measurement below is still a human
step — as are the Vocab drill, the keyboard pass, and offline.

| Action                                                                                      | Expected                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Navigate the six icon-only tabs                                                             | Every destination is reachable and the document has `0` horizontal overflow.                                |
| Use keyboard Tab, Enter, and Space on navigation, Vocab mode tabs, sheets, and a league row | Focus remains visible; controls can be operated and focus returns when a sheet closes.                      |
| Load the app online once, then put the device genuinely offline and reload                  | The app shell and cached core vocab deck remain usable. AI calls are expected to fail offline.              |
| Return online and reload twice after a lexicon deployment                                   | Previously cached lexicon content converges to the new version; a returning profile matters for this check. |

Speech recognition depends on browser support for the Web Speech API. Audio
playback may require a direct press because browsers restrict autoplay.

## Finish and triage

- Record console errors, failed Network requests, viewport overflow values,
  and the first failed step. A passing build or rendered button is not proof
  that its production backend works.
- For a branch-side browser check, run `npm run smoke:learning-path` for guest
  practice and `npm run smoke:auth-learning-path` for the signed-in half — sync,
  leagues, account controls, at 1280 / 375 / 320. Both run in CI and both use an
  isolated local build; neither verifies production auth or AI. Run the
  signed-in one after any change to the masthead, the Settings route, or the
  league table, and read its step lines rather than its exit code alone.
- Run `npm run audit:contrast` after any change to colour tokens, type tiers,
  a popover, or the Settings route. It builds and serves its own target, so it
  needs no running dev server, and takes about two minutes. Read the coverage
  counts it prints, not only its exit code — `Chat model popover: opened and
measured in 6/6` and `Profile → Settings: 6/6 guest and 6/6 signed-in` are
  the denominators that separate "nothing is wrong" from "nothing was
  checked".
- Check the [uptime workflow](../.github/workflows/uptime.yml), Sentry issues,
  and Vercel function logs after deployment. Check the build log for a
  `SENTRY SOURCE-MAP UPLOAD FAILED` banner; source-map upload does not fail the
  build.
- If a new deployment reproducibly breaks a previously passing path, stop
  rollout or restore the last healthy Vercel deployment. Escalate database
  migration problems to the owner; do not run migration repair, push, pull, or
  reset against production.
- Record new code defects in the tracked backlog or a GitHub issue. Keep the
  [pre-beta owner checklist](PRE_BETA_OWNER_CHECKLIST.md) current when a hosted
  setting is verified or changed.
