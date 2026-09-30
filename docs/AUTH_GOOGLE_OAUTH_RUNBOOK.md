# Google OAuth ("Continue with Google") — owner runbook

**Owner-only.** Every step below is a dashboard action in Google Cloud,
Supabase or Vercel. None of them can be done from the repo, and nothing in the
codebase can verify them — the code ships dark until they are complete.

Status: **done, and live in production since 2026-08-17.** Kept as the
reference for re-running this elsewhere, and for the traps each step hides.

Companion to Phase D of
`docs/superpowers/specs/2026-08-02-auth-overhaul-design.md`.

## State today

**LIVE in production since 2026-08-17.** Steps 1–7 are complete, the consent
screen is **published**, and the §8 checks below have passed — including the
auto-link check, which is no longer an assumption (see that section).

Keep reading anyway if you are re-running this for another environment or
another project; the traps are all still true.

`isGoogleAuthConfigured()` is `isAuthConfigured() && VITE_GOOGLE_AUTH_ENABLED === 'true'`,
and `GoogleButton` renders `null` when that is false — so with the flag off
there is no Google affordance anywhere and no way to start a flow.

Turning it on takes **two** things, and neither works without the other:

1. The provider config in steps 1–6 below.
2. `VITE_GOOGLE_AUTH_ENABLED=true` **plus a redeploy** (step 7).

> **The Google Cloud console has moved.** These steps were written against the
> old layout; Google now presents the same settings under **Google Auth
> Platform**:
>
> | this runbook says | today's console |
> |---|---|
> | OAuth consent screen | **Branding** + **Audience** |
> | Credentials → OAuth client IDs | **Clients** |
> | Test users | **Audience** |
> | Scopes | **Data Access** |

## 1 · Google Cloud — OAuth consent screen

1. <https://console.cloud.google.com> → create or select a project.
2. **APIs & Services → OAuth consent screen**.
3. User type: **External**. (Internal requires a Google Workspace org.)
4. Fill in:
   - **App name** — `sprachschule-app`
   - **User support email** — your address
   - **Developer contact information** — your address
5. Save and continue through Scopes and Test users. The default scopes
   (`openid`, `email`, `profile`) are all Supabase needs — do not add more.

**Optional, and fine to defer:** uploading a logo and verifying the domain.
Both are only required to leave "Testing" mode and remove the unverified-app
interstitial. While in Testing, only accounts listed under **Test users** can
complete sign-in — add your own address there before verifying in step 8.

> **Do not upload a logo unless you mean it.** Google's publish dialog lists
> three verification triggers: more than 10 domains, **a logo**, or sensitive /
> restricted scopes. With none of them, publishing is instant and needs no
> review. Adding branding art later is what would drag this app into Google's
> verification queue.

### Publishing (needed before anyone but your test users can sign in)

**Audience → Publish app → Confirm.** The dialog warns the app becomes
available to any Google Account — that is the point. With only
`openid`/`email`/`profile` this takes effect immediately, the 100-user cap
stops applying, and the unverified-app interstitial goes away.

**Your own account proves nothing here**, because it is on the test-user list
and works either way. Verify with a different Google account in an incognito
window.

## 2 · Google Cloud — create the OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name it something recognisable (`deutsch-app web`).

## 3 · Authorized JavaScript origins

Add both:

- `https://deutsch-app-dusky.vercel.app` (production)
- `http://localhost:5173` (Vite dev server)

## 4 · Authorized redirect URI — the step people get wrong

Add **exactly** this:

```
https://xcnnlczvxmuwcqwychox.supabase.co/auth/v1/callback
```

**This is Supabase's callback, not the app's.** Google redirects to
*Supabase*, which completes the exchange and only then sends the browser on to
the app. Pasting the app's own origin here is the single most common mistake
and produces a `redirect_uri_mismatch` error at Google before Supabase is ever
reached.

The project ref (`xcnnlczvxmuwcqwychox`) is the one already in `.env.example`.

Then **Create**, and keep the **Client ID** and **Client secret** on screen for
the next step.

## 5 · Supabase — enable the Google provider

1. Supabase dashboard → the production project → **Authentication** →
   **Providers** → **Google**.
2. Toggle **Enable Sign in with Google**.
3. Paste the **Client ID** and **Client secret** from step 4.
4. Save.

Leave **Skip nonce checks** and **Allow users without an email** off. The
second one matters: the auto-link below keys on the email address, so a
provider response without one would defeat it.

> **Paste the real values, and check their shape.** A Client ID ends in
> `.apps.googleusercontent.com`; a secret starts with `GOCSPX-`. Anything else
> — a project name, a password — leaves the provider effectively unconfigured
> and produces this at `/auth/v1/authorize`:
>
> ```json
> {"code":400,"error_code":"validation_failed",
>  "msg":"Unsupported provider: provider is not enabled"}
> ```
>
> That error fires **before Supabase contacts Google**, so it masks any
> redirect-URI problem underneath. Fix the credentials first, then re-test;
> a `redirect_uri_mismatch` may be waiting behind it.

## 6 · Supabase — URL configuration

Same allow-list Phase C documented (`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`).
Google needs no additional entries, because `signInWithGoogle()` passes the
same `redirectTo` that the magic link passes as `emailRedirectTo` —
`window.location.origin` — deliberately, so there is one entry per environment
rather than two.

**Authentication → URL Configuration → Redirect URLs** must include:

- `https://deutsch-app-dusky.vercel.app`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

> **The browser comes back to the Site URL, not to where it started.** Testing
> the flow on a Vercel *preview* deployment still lands you on production once
> Supabase completes the exchange. The sign-in genuinely succeeded — the
> session is real and the account is correct — but the tab you end up in is not
> the one you left. Expect it, and read the result on production rather than
> assuming the preview build is broken.

## 7 · Vercel — the flag, then a redeploy

1. Vercel project → **Settings → Environment Variables**.
2. Add `VITE_GOOGLE_AUTH_ENABLED` = `true` to **Preview** and **Production**.
3. **Redeploy.**

> **Setting the variable is not enough.** Vite inlines `import.meta.env.*` at
> **build** time, so the value is baked into the bundle. Until a new build
> runs, the deployed app still contains `undefined` and the button stays
> hidden. This is the same trap that applies to `VITE_SYNC_ENABLED` and
> `VITE_LEAGUES_ENABLED`.

To try it locally first: put `VITE_GOOGLE_AUTH_ENABLED=true` in `.env.local`
(git-ignored) and restart `npm run dev`.

> **Check the deploy from the origin, not from your browser.** This app is a
> PWA, so its service worker will keep serving the previous bundle and make a
> correct deploy look like it failed — that happened in both directions on
> 2026-08-17. Confirm against the served bundle instead:
>
> ```bash
> curl -s "https://deutsch-app-dusky.vercel.app/?cb=$(date +%s)" | grep -o '/assets/index-[^"]*\.js'
> ```
>
> The hash must change after a redeploy; then fetch that file and grep it for
> `Continue with Google`. In a browser, unregister the service worker and clear
> caches first. Users are not stuck — they pick up the new bundle on the next
> service-worker update cycle.

## 8 · Verify (do not skip)

Run these against the deployed app, in a fresh browser profile.

- [ ] **Happy path.** Sign-in surface shows **Continue with Google** above the
      email form. Tap it → Google consent → land back in the app signed in,
      with the account chip showing your address.
- [ ] **Cancellation.** Start again and press **Cancel** / back out at the
      consent screen. The app must show **"Sign-in cancelled" — "No problem —
      you can try again whenever you like."** If it says *"That link
      expired"*, the callback reason is being misclassified — report it, do
      not work around it.
- [ ] **Email still works.** The 6-digit code flow is unchanged and still
      signs in.
- [ ] **Flag off is clean.** With the flag off (or before the redeploy) there
      is no Google button and no stray "or" divider on any surface.

### The auto-link check — VERIFIED 2026-08-17

- [x] Sign in with an **email code** first. Note the progress on the account.
- [x] Sign out.
- [x] Sign in with **Google, using the same email address**.
- [x] Confirm you land in **one** account — same user id, same progress — and
      not a second empty one.

**Result: Supabase attaches the Google identity to the existing user.** The
spec's §4 claim holds on this project. Measured against `auth.users` /
`auth.identities` on the hosted database rather than judged from the UI:

| user | created | identities |
|---|---|---|
| existing, signed up by email | 2026-06-19 | **2** — `email`, `google` |
| brand-new, arrived via Google | 2026-08-17 | 1 — `google` |

Same `user.id` before and after, so everything keyed to it — SRS state,
progress, league membership — survives. The app greets it with "Welcome back"
rather than running onboarding, which is a usable smoke signal: **onboarding
appearing for a returning address would mean the link failed.**

Re-run it with SQL if you ever need to be sure:

```sql
select u.id, u.created_at, count(i.id) as identity_count,
       string_agg(i.provider, ', ' order by i.provider) as providers
from auth.users u
left join auth.identities i on i.user_id = u.id
group by u.id, u.created_at order by u.created_at;
```

One caveat worth keeping: this was verified on **this** project with its
current identity-linking settings. It is a property of the hosted
configuration, not of the code, so re-check it if the project is ever
recreated or migrated.

If it ever produces **two** accounts, the flag should go back to `false` while
it is sorted out: Supabase's account-linking behaviour is configured under
**Authentication → Providers** / identity linking, and merging two real
accounts after the fact is far more painful than preventing the split.

## Closed signup (beta allowlist)

Do **not** disable the Google provider to lock beta. The optional env
allowlist in `docs/PRE_BETA_OWNER_CHECKLIST.md` §5 is the switch:
`SIGNUP_EMAIL_ALLOWLIST` + `VITE_SIGNUP_EMAIL_ALLOWLIST`, then redeploy.
Unset, signup stays open (production default). Google stays on.

## Rollback

Set `VITE_GOOGLE_AUTH_ENABLED=false` (or remove it) and redeploy. The button
disappears, `signInWithGoogle()` refuses even if a stale tab calls it, and
every surface returns to the email-only rendering. Nothing else in the app
depends on Google, and no stored data changes.

## Cost

None. Google Cloud OAuth clients and consent screens are free, and Supabase's
Google provider is included in the free tier. This was Decision 6 in the spec:
no paid component before the first public version.
