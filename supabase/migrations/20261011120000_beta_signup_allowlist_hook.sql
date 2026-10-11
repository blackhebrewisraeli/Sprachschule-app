-- Closed-beta admission at the Supabase Auth boundary.
--
-- Until now the beta allowlist lived only in the Vercel API
-- (SIGNUP_EMAIL_ALLOWLIST in requireAuth). Supabase Auth itself still created
-- an auth.users row — and, through handle_new_user, a profiles row — for ANY
-- address that finished a magic link or an OAuth round trip, and that session
-- could then write its own rows straight through the Data API. The gate moves
-- to the one step every signup passes: GoTrue's before-user-created hook, which
-- runs BEFORE the auth.users insert, so a refused address leaves no row at all.
--
-- Paths that call the hook (supabase/auth internal/api): password and OTP /
-- magic-link signup (signup.go — otp.go creates users through Signup), OAuth
-- and OIDC id-token sign-in (external.go, token_oidc.go), SAML, invites,
-- generated links, anonymous and web3 sign-in. The admin API's createUser
-- (admin.go) does NOT call it: the service role is already trusted, and the
-- RLS suite builds its fixtures that way.
--
-- APPLYING THIS FILE DOES NOT TURN THE GATE ON. The owner applies it, adds the
-- beta addresses, and only then enables the hook in the dashboard
-- (docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md). Enabled against an empty list it
-- refuses every new signup — fail-closed, but an outage all the same.

-- ── the list ───────────────────────────────────────────────────────
--
-- `private` is not one of the Data API's exposed schemas (supabase/config.toml
-- [api] schemas), so no client reaches this table over REST or GraphQL. The
-- grants below are explicit anyway, so that stays true if the schema is ever
-- exposed.
create table private.beta_signup_allowlist (
  email    text primary key,
  added_at timestamptz not null default now(),
  -- Stored exactly as the hook compares it. An address saved with capitals or
  -- stray whitespace would otherwise sit in the table and never match anyone.
  -- btrim() alone strips only spaces, hence the explicit set, the same in the
  -- hook below.
  constraint beta_signup_allowlist_email_normalized
    check (email = lower(btrim(email, E' \t\r\n')) and email like '_%@_%')
);

comment on table private.beta_signup_allowlist is
  'Closed-beta admission list read by public.hook_restrict_signup_to_beta_allowlist. Lowercase, trimmed addresses. Managed by the owner in SQL; the repository never seeds real addresses.';

alter table private.beta_signup_allowlist enable row level security;

revoke all on table private.beta_signup_allowlist from public, anon, authenticated, service_role;
grant usage on schema private to supabase_auth_admin;
grant select on table private.beta_signup_allowlist to supabase_auth_admin;

-- RLS applies to supabase_auth_admin, so the read needs a policy as well as
-- the grant. Read-only: Auth never writes this list.
create policy "auth admin reads the beta allowlist"
  on private.beta_signup_allowlist
  for select to supabase_auth_admin
  using (true);

-- ── the hook ───────────────────────────────────────────────────────
--
-- SECURITY INVOKER (the default), deliberately: Auth calls it as
-- supabase_auth_admin, which holds exactly the grants above. A definer function
-- would run as the owner and make those grants decorative.
create or replace function public.hook_restrict_signup_to_beta_allowlist(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- One answer for every refusal — unlisted, missing address, malformed event
  -- or an internal error — so a response never says which one it was. GoTrue
  -- forwards only the status and this message (a hook cannot set an error
  -- code), so the text must stay byte-identical to BETA_SIGNUP_DENIED_MESSAGE
  -- in src/lib/signupAllowlist.js, which is how the client recognises it.
  denied constant jsonb := jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Sign-up is invite-only during the beta.'
    )
  );
  v_email text;
begin
  v_email := lower(btrim(event -> 'user' ->> 'email', E' \t\r\n'));
  if v_email is null or v_email = '' then
    return denied;
  end if;
  if exists (
    select 1 from private.beta_signup_allowlist a where a.email = v_email
  ) then
    return '{}'::jsonb;
  end if;
  return denied;
exception
  -- Fail closed. A missing grant, a dropped table or a payload shape this code
  -- did not anticipate refuses the signup instead of waving it through.
  when others then
    return denied;
end
$$;

comment on function public.hook_restrict_signup_to_beta_allowlist(jsonb) is
  'Supabase Auth before-user-created hook: admits only addresses in private.beta_signup_allowlist. Fails closed. Executable by supabase_auth_admin only.';

revoke all on function public.hook_restrict_signup_to_beta_allowlist(jsonb)
  from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_signup_to_beta_allowlist(jsonb)
  to supabase_auth_admin;
