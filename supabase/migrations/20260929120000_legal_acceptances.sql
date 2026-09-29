-- supabase/migrations/20260929120000_legal_acceptances.sql
--
-- Versioned acceptance of the Terms of Service and Privacy Policy.
--
-- DO NOT apply this to production from an agent. The owner applies it to
-- Sprachschule (xcnnlczvxmuwcqwychox) BEFORE the client that reads it is
-- merged — docs/STORE_SUBMISSION_CHECKLIST.md. Never `migration repair`,
-- `db push`, or MCP apply_migration.
--
-- Trust boundary: identity comes from auth.uid(), the time from the database
-- clock. Clients may read their own rows and write only through
-- accept_legal_terms, which never updates or deletes, so each row is permanent
-- history until the account is deleted (cascade).

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

comment on table public.legal_acceptances is
  'One row per (user, terms version, privacy version) the user accepted. Written only by accept_legal_terms.';

alter table public.legal_acceptances enable row level security;

drop policy if exists "read own acceptances" on public.legal_acceptances;
create policy "read own acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;
grant select, insert, update, delete on table public.legal_acceptances to service_role;

create or replace function public.accept_legal_terms(p_terms_version text, p_privacy_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$'
     or p_privacy_version is null or p_privacy_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid version' using errcode = '22023';
  end if;

  insert into public.legal_acceptances (user_id, terms_version, privacy_version)
  values (v_uid, p_terms_version, p_privacy_version)
  on conflict do nothing;

  select a.accepted_at into v_at
    from public.legal_acceptances a
   where a.user_id = v_uid
     and a.terms_version = p_terms_version
     and a.privacy_version = p_privacy_version;
  return v_at;
end
$$;

revoke all on function public.accept_legal_terms(text, text) from public, anon;
grant execute on function public.accept_legal_terms(text, text) to authenticated, service_role;
