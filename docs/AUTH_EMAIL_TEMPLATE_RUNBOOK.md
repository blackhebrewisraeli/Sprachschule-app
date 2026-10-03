# Auth email template — owner runbook

**Owner-only.** The sign-in template is version-controlled under
`supabase/templates/magic_link.html` and wired for local GoTrue via
`supabase/config.toml` (`[auth.email.template.magic_link]`). The **hosted**
Supabase project does **not** pick that file up automatically — Auth email
templates there are dashboard settings. Paste once after any template change
so production emails stay in sync with the repo.

Companion to Phase C of
`docs/superpowers/specs/2026-08-02-auth-overhaul-design.md`.

## Current production (Sprachschule)

Owner-applied 2026-09-18, body re-pasted 2026-10-03:

- **Magic Link** subject + body pasted from the repo template (6-digit
  code + link; footer says the code expires in five minutes). The
  2026-10-03 paste carries the "Deutsch · Sprachschule" brand (#424) and
  the "…to sign in on this device" line (#423); a test email confirmed it.
- **Email OTP / magic-link expiry** = 300 seconds (5 minutes). Repo
  `supabase/config.toml` `[auth.email] otp_expiry` matches. JWT expiry is
  unchanged.

Re-paste the template after any future `magic_link.html` edit — hosted
Auth does not read the file automatically.

**Brand (owner choice, 2026-10-03):** the email says `Deutsch · Sprachschule`,
matching the native app label and the deletion page. The 2026-09-30 rename to
`sprachschule-app` was reverted for this template before it was ever pasted.
"Sprachschule" in the heading above is the Supabase dashboard project label,
which is unchanged.

## Why this exists

B2 designed every sign-in email to carry **both** a magic link
(`{{ .ConfirmationURL }}`) and a 6-digit code (`{{ .Token }}`). When the
template lived only in the dashboard, it drifted: users sometimes got a link,
sometimes a code. The repo copy is the source of truth; this runbook is the
one-time (and on-change) sync into production.

## One-time / on-change: paste into the hosted dashboard

1. Open the production Supabase project → **Authentication** → **Email
   Templates**.
2. Select the **Magic Link** template (used for email OTP / magic-link
   sign-in).
3. Set the **Subject** to match `supabase/config.toml`:

   `Your sign-in code for Deutsch · Sprachschule`

4. Replace the **Body** with the full contents of
   `supabase/templates/magic_link.html` (HTML source). Confirm both of these
   GoTrue placeholders remain:
   - `{{ .Token }}` — 6-digit code (primary for the installed PWA)
   - `{{ .ConfirmationURL }}` — magic link (browser convenience)

5. Save.

## Verify (do not skip)

1. From the production app, request a sign-in email to a real inbox you
   control.
2. Confirm the message shows the **6-digit code** and a working **link**.
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
