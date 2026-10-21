# Auth email template — owner runbook

**Owner-only.** The sign-in template is version-controlled under
`supabase/templates/magic_link.html` and wired for local GoTrue via
`supabase/config.toml`, for **two** Auth templates that share that one file:
`[auth.email.template.magic_link]` and `[auth.email.template.confirmation]`
(dashboard name: **Confirm signup**). The **hosted** Supabase project does
**not** pick that file up automatically — Auth email templates there are
dashboard settings. Paste into both after any template change so production
emails stay in sync with the repo. `src/authEmailTemplates.test.js` pins the
wiring, the placeholders, and that both entries stay identical.

Companion to Phase C of
`docs/superpowers/specs/2026-08-02-auth-overhaul-design.md`.

## Current production (Sprachschule)

Owner-applied 2026-09-18, body re-pasted 2026-10-03 and again after #484
(confirmed 2026-10-22):

- **Magic Link** subject + body pasted from the repo template (one-time
  code + link; footer says the code expires in five minutes). The
  2026-10-03 paste carries the "Deutsch · Sprachschule" brand (#424) and
  the "…to sign in on this device" line (#423); a test email confirmed it.
- **Email OTP length** = 8 digits hosted (owner-reported 2026-10-16); the
  local `supabase/config.toml` `otp_length` is 6. The app does not control
  it, so the template, the sign-in screen and these docs name no length:
  "one-time code". The hosted Magic Link body carries that wording: a
  sign-in email to an existing account on 2026-10-22 read "Enter this
  one-time code in the app" above an 8-digit code. The re-paste date was not
  recorded.
- **Email OTP / magic-link expiry** = 300 seconds (5 minutes). Repo
  `supabase/config.toml` `[auth.email] otp_expiry` matches. JWT expiry is
  unchanged.
- **Confirm signup**: **pasted and saved by the owner on 2026-10-21.** On
  2026-10-22 the hosted body matched `supabase/templates/magic_link.html` byte
  for byte; the subject was not checked. The remaining proof is a first-time
  address that has never had an Auth account; testing an existing account
  exercises Magic Link instead. Status:

  | Part                                                                                     | Who        | Status                |
  | ---------------------------------------------------------------------------------------- | ---------- | --------------------- |
  | `[auth.email.template.confirmation]` in `config.toml` + `src/authEmailTemplates.test.js` | repository | **Done** (2026-10-15) |
  | Paste subject + body into the hosted **Confirm signup** template ("Paste" below)         | owner      | **Done (2026-10-21)** |
  | New invited tester receives a working code and link ("Verify: Confirm signup" below)     | owner      | **Not done**          |

Re-paste the template after any future `magic_link.html` edit — into **both**
Magic Link and Confirm signup. Hosted Auth does not read the file
automatically.

**Brand (owner choice, 2026-10-03):** the email says `Deutsch · Sprachschule`,
matching the native app label and the deletion page. The 2026-09-30 rename to
`sprachschule-app` was reverted for this template before it was ever pasted.
"Sprachschule" in the heading above is the Supabase dashboard project label,
which is unchanged.

## Why this exists

B2 designed every sign-in email to carry **both** a magic link
(`{{ .ConfirmationURL }}`) and a one-time code (`{{ .Token }}`). When the
template lived only in the dashboard, it drifted: users sometimes got a link,
sometimes a code. The repo copy is the source of truth; this runbook is the
one-time (and on-change) sync into production.

**Why Confirm signup gets the same body.** `signInWithOtp` does not always
send the Magic Link template. For an address GoTrue has never confirmed, and
while the hosted Email provider's **Confirm email** setting is on, it signs
the address up and sends **Confirm signup** instead (supabase/auth
`internal/api/magic_link.go`, the `isNewUser` branch). From the tester's side
that is still "send me a sign-in code", so it gets the same subject and body.
Nothing else differs:

- `{{ .Token }}` and `{{ .ConfirmationURL }}` are available in every Auth
  template (Supabase "Email Templates" docs).
- The app verifies with `verifyOtp({ type: 'email' })` (`src/lib/auth.js`),
  which GoTrue checks against the signup token first, then the magic-link
  token (`internal/api/verify.go`).
- Both tokens expire on the same Email OTP expiry (`otp_expiry`, 300 seconds
  hosted), so the "five minutes" footer is true for both.

Do not turn **Confirm email** off to work around this: that changes sign-up
behaviour and is out of scope for this runbook.

## One-time / on-change: paste into the hosted dashboard

Do this for **Magic Link** and for **Confirm signup**. The subject and body are
the same for both.

1. Open the production Supabase project → **Authentication** → **Email
   Templates**.
2. Select the template: **Magic Link** (sign-in for a confirmed address), then
   repeat from here for **Confirm signup** (sign-in for a first-time address).
3. Set the **Subject** to match `supabase/config.toml`:

   `Your sign-in code for Deutsch · Sprachschule`

4. Replace the **Body** with the full contents of
   `supabase/templates/magic_link.html` (HTML source). Confirm both of these
   GoTrue placeholders remain:
   - `{{ .Token }}` — one-time code (primary for the installed PWA)
   - `{{ .ConfirmationURL }}` — magic link (browser convenience)

5. Save.

## Verify: Confirm signup (new invited tester, do not skip)

A code or link is single-use, and once an address has signed in it gets Magic
Link from then on. So checking both the code and the link of Confirm signup
needs **two** addresses that have never signed in. Plus-addresses of a mailbox
you control work (`you+cs1@…`, `you+cs2@…`): the allowlist matches the exact
string.

1. Invite both addresses with step 3 of `docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`
   (owner-only production write).
2. Code: in the native app or the installed PWA, request a sign-in email for
   the first address. The email must show the subject
   `Your sign-in code for Deutsch · Sprachschule`, the "Deutsch · Sprachschule"
   brand, a **one-time code**, a link, and the **five minutes** footer. Enter the
   code in the app: it must sign in.
3. Link: request a sign-in email for the second address, and open its link in
   a browser: it must sign in and land back in the app.
4. If either email has a different subject or no code, the Confirm signup
   paste did not save. Repeat the paste.
5. Afterwards, remove the two test rows (`delete` line under step 3 of the
   allowlist runbook) and handle their accounts as step 7 there describes.

## Verify: Magic Link (existing account, do not skip)

1. From the production app, request a sign-in email to a real inbox you
   control.
2. Confirm the message shows the **one-time code** and a working **link**.
3. Enter the code in the installed PWA; separately open the link in a
   browser — both should sign in.
4. Confirm the footer says the code expires in **five minutes** (matches
   hosted OTP expiry of 300 seconds).
5. Optional: the uptime auth monitor still only asserts the OTP round trip;
   it does **not** scrape email bodies. Body checks stay manual until that
   is extended.

## Local development

`supabase start` loads the template from `config.toml` automatically. No
dashboard step for local GoTrue.

### Redirect allow-list (Vite on :5173)

Local Auth must redirect back to the Vite dev server, not the default GoTrue
`:3000` site:

| Setting                    | Value                                            |
| -------------------------- | ------------------------------------------------ |
| `site_url`                 | `http://localhost:5173`                          |
| `additional_redirect_urls` | `http://localhost:5173`, `http://127.0.0.1:5173` |

These live in `supabase/config.toml` and apply to local `supabase start` only.
For the **hosted** project, set the same origins (plus production) under
**Authentication → URL Configuration**:

- Site URL → production origin (`https://www.sprachschule-app.com`)
- Redirect URLs → production origin, the provider fallback
  `https://deutsch-app-dusky.vercel.app`, `http://localhost:5173`, and
  `http://127.0.0.1:5173` (exact match — no wildcards for the local pair)

`signInWithMagicLink` already passes `emailRedirectTo: window.location.origin`,
so the allow-list must include whichever origin the browser is on.

## Out of scope here

- Resend / SMTP credentials (already wired in B2.3).
- Google OAuth (Phase D) and phone/SMS OTP (Phase E).
- Guest trial wall (separate mission after Phase C).
