# GitHub OAuth ("Continue with GitHub") — owner runbook

**Owner-only.** Every step below is a dashboard action in GitHub, Supabase or
Vercel. None of them can be done from the repo, and nothing in the codebase can
verify them — the code ships dark until they are complete.

Status: **not started.** The code is merged behind `VITE_GITHUB_AUTH_ENABLED`,
which is unset everywhere, so no surface shows a GitHub button today.

Sibling of `docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`. Most of Google's traps apply
here too; this file repeats the ones that matter and adds GitHub's own.

## State today

`isGitHubAuthConfigured()` is `isAuthConfigured() && VITE_GITHUB_AUTH_ENABLED === 'true'`,
and `GitHubButton` renders `null` when that is false — so with the flag off
there is no GitHub affordance anywhere and no way to start a flow.
`signInWithGitHub()` checks the same thing, so a stale tab cannot start one
either.

The flag is **independent of Google's**. Either provider can be on alone, both
can be on together, and turning one off never touches the other.

Turning it on takes **three** things, and none works without the others:

1. The provider config in steps 1–3 below.
2. The privacy-policy wording in step 0.
3. `VITE_GITHUB_AUTH_ENABLED=true` **plus a redeploy** (step 4).

## Where the button appears

| Surface                         | Google off, GitHub on              | Both on                                                                          |
| ------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Welcome gate                    | GitHub above create / sign in      | Google, then GitHub                                                              |
| Sign-in sheet                   | GitHub above the "or" divider      | Google, then GitHub, one shared divider                                          |
| Trial wall (guest trial is out) | GitHub in the single provider slot | **Google only.** GitHub is one tap away: "Create a free account" opens the sheet |

The trial wall has room for one provider on purpose: at 320px a fourth action
turns it into a menu (`TrialWall.test.jsx` pins the count at three).

## 0 · Privacy policy — before anything else

`src/components/legal/PrivacyPolicy.jsx` says _"When you sign in (via Google or
Magic Link)…"_. That text is supplied legal copy, reproduced verbatim and pinned
by `PrivacyPolicy.test.jsx`, so an agent will not reword it on its own.

Supply the new wording (for example, _"via Google, GitHub or Magic Link"_) and
have it landed in a PR — copy and test together — **before** step 4. Flipping
the flag first would offer a sign-in method the published policy does not
mention.

## 1 · GitHub — register an OAuth App

1. <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
   (Under an organisation instead: the org's **Settings → Developer settings**.
   Either works; pick whoever should own the credential long-term.)
2. Fill in:
   - **Application name** — `sprachschule-app`. Users see it on the
     authorize screen.
   - **Homepage URL** — `https://deutsch-app-dusky.vercel.app`
   - **Authorization callback URL** — exactly this:

     ```
     https://xcnnlczvxmuwcqwychox.supabase.co/auth/v1/callback
     ```

   - **Enable Device Flow** — leave **off**.

3. **Register application.**

> **It is an _OAuth App_, not a _GitHub App_.** They sit side by side under
> Developer settings and look alike. Supabase's GitHub provider speaks the OAuth
> App flow.

> **The callback is Supabase's, not the app's** — the same trap as Google's
> step 4. GitHub redirects to _Supabase_, which completes the exchange and only
> then sends the browser on to the app. Pasting the app's own origin produces
> _"The redirect_uri is not associated with this application"_ at GitHub.

> **GitHub allows one callback URL per OAuth App.** That is fine here, because
> every environment goes through the one hosted Supabase project. It only
> matters if you want GitHub sign-in against the **local** Docker stack: that
> needs a second OAuth App whose callback is
> `http://127.0.0.1:54321/auth/v1/callback`. Optional; nothing requires it.

## 2 · GitHub — client secret

1. On the new app's page, copy the **Client ID**.
2. **Generate a new client secret** and copy it **immediately**. GitHub shows it
   once. Lose it and you generate another; the old one keeps working until you
   delete it.

Do not paste either into chat, a ticket or a commit.

## 3 · Supabase — enable the GitHub provider

1. Supabase dashboard → the production project → **Authentication** →
   **Sign In / Providers** → **GitHub**.
2. Toggle **Enable Sign in with GitHub**.
3. Paste the **Client ID** and **Client secret** from steps 1–2.
4. Save.

Leave **Allow users without an email** off. The auto-link and the optional
signup allowlist both key on the email address, and a GitHub account with no
verified email would slip past both.

**No scopes to add, and no Redirect URL entries.** Supabase asks GitHub for
`user:email` by itself, which is enough to read a _private_ primary address.
`signInWithGitHub()` passes the same `redirectTo` as Google and the magic link —
`window.location.origin` — so the URL allow-list from
`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md` already covers it.

> If `/auth/v1/authorize?provider=github` answers
> `{"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`,
> step 3 did not save, or the credentials are wrong. That error fires before
> Supabase contacts GitHub, so it hides any callback-URL mistake behind it —
> fix it first, then re-test.

## 4 · Vercel — the flag, then a redeploy

1. Vercel project → **Settings → Environment Variables**.
2. Add `VITE_GITHUB_AUTH_ENABLED` = `true` to **Preview** and **Production**.
3. **Redeploy.**

Vite inlines `import.meta.env.*` at **build** time. Until a new build runs, the
deployed bundle still says `undefined` and the button stays hidden.

To try it locally first: `VITE_GITHUB_AUTH_ENABLED=true` in `.env.local`
(git-ignored), pointed at the hosted project, then restart `npm run dev`.

Check the deploy from the origin, not your browser — the service worker keeps
serving the previous bundle:

```bash
curl -s "https://deutsch-app-dusky.vercel.app/?cb=$(date +%s)" | grep -o '/assets/index-[^"]*\.js'
```

The hash must change. Do **not** grep the bundle for `Continue with GitHub`
as proof: the button is statically imported, so that string ships in every
build, flag on or off — only the flag check around it changes. Confirm by
looking instead: a fresh profile (or unregister the service worker and clear
caches first), open the sign-in sheet, see the button.

## 5 · Verify (do not skip)

Against the deployed app, in a fresh browser profile.

- [ ] **Happy path.** The sign-in sheet shows **Continue with GitHub** above
      the email form. Tap it → GitHub's authorize screen (shows the app name from
      step 1) → **Authorize** → back in the app, signed in, account chip showing
      your address.
- [ ] **Cancellation.** Start again and press **Cancel** on GitHub's authorize
      screen. The app must show **"Sign-in cancelled"**, not _"That link
      expired"_. (`auth.test.js` pins the URL GitHub's cancel produces.)
- [ ] **Google and email still work**, if Google is on.
- [ ] **Flag off is clean.** Before the redeploy, or with the flag back off,
      there is no GitHub button, and — with Google also off — no stray "or"
      divider.

### Account linking — check it, do not assume it

Supabase links a GitHub sign-in to an existing account **when the GitHub
account's verified primary email is the same address**. Google's auto-link was
verified on this project on 2026-08-17; GitHub's has not been, and it is a
property of the hosted configuration, not of the code.

- [ ] Sign in with an **email code** (or Google) using address _A_. Note the
      progress.
- [ ] Sign out.
- [ ] Sign in with a **GitHub account whose primary, verified email is _A_**.
- [ ] Confirm **one** account — same user id, same progress. "Welcome back"
      rather than onboarding is the quick tell.

Then confirm it in SQL (the same query as the Google runbook):

```sql
select u.id, u.created_at, count(i.id) as identity_count,
       string_agg(i.provider, ', ' order by i.provider) as providers
from auth.users u
left join auth.identities i on i.user_id = u.id
group by u.id, u.created_at order by u.created_at;
```

The linked user should list `email, github` (or `email, github, google`).

**Expect a second account when the addresses differ.** Many people's GitHub
primary email is a work address, not the one they used here.
That is not a linking failure — the link keys on the email — but it will look
like "my progress is gone" to the learner. If it bites, the fix is for them to
sign in with the method they started with; merging two real accounts after the
fact is far more painful than preventing the split.

### Allowlist check — only if `VITE_SIGNUP_EMAIL_ALLOWLIST` is set

The allowlist trusts an address only when the identity marks it verified
(`src/lib/verifiedEmails.js`). Confirm the GitHub identity carries that:

```sql
select provider, identity_data->>'email' as email,
       identity_data->>'email_verified' as verified
from auth.identities where provider = 'github';
```

`verified` must read `true`. If it does not, an allowlisted learner signing in
with GitHub is rejected — turn the flag back off and report it.

## Rollback

Set `VITE_GITHUB_AUTH_ENABLED=false` (or remove it) and redeploy. The button
disappears from every surface, `signInWithGitHub()` refuses even from a stale
tab, and the surfaces return to their Google-only (or email-only) rendering.
No stored data changes. Learners who signed up through GitHub keep their
account: their address is on it, so the email code still reaches it.

Leave the Supabase provider and the OAuth App in place during a rollback unless
the credential itself is the problem; re-enabling is then just the flag.

## Cost

None. GitHub OAuth Apps are free, and Supabase's GitHub provider is in the free
tier.
