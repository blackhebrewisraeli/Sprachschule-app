-- AI Tutor conversation history: two RLS-isolated tables, one server-only write
-- RPC, one purge RPC, and the learner's opt-in flag.
--
-- DO NOT apply this to production from an agent (see AGENTS.md). The owner
-- applies it to Sprachschule (xcnnlczvxmuwcqwychox) after merge, with the drill
-- in docs/superpowers/specs/2026-10-02-ai-tutor-conversation-history-design.md
-- §16. Forward-only: no existing migration is edited. Nothing in the app calls
-- any of this yet; the table stays empty until AI_HISTORY_MODE is switched on.
--
-- Design: docs/superpowers/specs/2026-10-02-ai-tutor-conversation-history-design.md
--
-- Guarantees (every one is enforced here, in SQL, not in a handler):
--   * a learner reads and deletes only their own conversations;
--   * a client can NEVER insert or update a conversation or a message, nor
--     delete a single message: only the server writes, so a stored turn cannot
--     be forged, edited or backdated, and a thread always alternates
--     user / assistant, starts with a user row and ends with an assistant row;
--   * at most 20 conversations per learner and 50 messages per conversation;
--   * nothing is saved unless settings.ai_history_enabled is true;
--   * a conversation is purged 90 days after its last message.
--
-- Keys are composite with user_id, so a client-supplied conversation id can
-- never collide with, probe or hijack another learner's row.

-- ── consent flag ───────────────────────────────────────────────────

-- A column, not a key inside settings.data: the client's settingsToRow is an
-- explicit allowlist, so an older app version would erase any new key from
-- `data` on its next push. An old client's upsert never names this column, so
-- it can neither erase nor set it (see 20260830030000_learned_by_deck.sql).
alter table public.settings
  add column if not exists ai_history_enabled boolean not null default false;

comment on column public.settings.ai_history_enabled is
  'Learner opted in to saving tutor conversations. Default false. Checked again by append_ai_turn, so a client cannot opt itself in by claiming it.';

-- ── conversations ──────────────────────────────────────────────────

create table public.ai_conversations (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  id              uuid        not null,
  scenario_id     text        not null,
  level           text        not null,
  message_count   smallint    not null default 0,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint ai_conversations_scenario_check
    check (char_length(scenario_id) between 1 and 40),
  constraint ai_conversations_level_check
    check (level in ('a1', 'a2', 'b1')),
  constraint ai_conversations_count_check
    check (message_count between 0 and 50)
);

-- The learner's list, newest first, and the cap's eviction order.
create index ai_conversations_recent
  on public.ai_conversations (user_id, last_message_at desc);
-- The daily purge. Unlike ai_usage this table is not on a hot per-request
-- path, so the index is worth its write cost.
create index ai_conversations_purge
  on public.ai_conversations (last_message_at);

comment on table public.ai_conversations is
  'Saved tutor conversations. Written only by append_ai_turn (service role); learners read and delete their own.';

-- ── messages ───────────────────────────────────────────────────────

create table public.ai_messages (
  user_id         uuid        not null,
  conversation_id uuid        not null,
  seq             integer     not null,
  role            text        not null,
  content         text        not null,
  hidden          boolean     not null default false,
  model           text,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id, seq),
  foreign key (user_id, conversation_id)
    references public.ai_conversations (user_id, id) on delete cascade,
  constraint ai_messages_role_check check (role in ('user', 'assistant')),
  constraint ai_messages_content_check check (char_length(content) between 1 and 6000)
);

comment on table public.ai_messages is
  'Verbatim turns of a saved conversation. user_id is denormalised so RLS, export and the account-deletion cascade need no join.';
comment on column public.ai_messages.seq is
  'Monotonic within a conversation and never reused. Trimming deletes the oldest rows, so the first stored seq can be greater than 1.';
comment on column public.ai_messages.hidden is
  'The scene kickoff the model saw but the learner did not.';

-- ── RLS ────────────────────────────────────────────────────────────

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "no anon access" on public.ai_conversations;
create policy "no anon access" on public.ai_conversations
  for all to anon using (false) with check (false);
drop policy if exists "no anon access" on public.ai_messages;
create policy "no anon access" on public.ai_messages
  for all to anon using (false) with check (false);

-- (select auth.uid()) is evaluated once per statement, not per row
-- (20260906000500_league_policy_initplan.sql).
drop policy if exists "select own conversations" on public.ai_conversations;
create policy "select own conversations" on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));
-- Deleting a conversation cascades to its messages.
drop policy if exists "delete own conversations" on public.ai_conversations;
create policy "delete own conversations" on public.ai_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "select own messages" on public.ai_messages;
create policy "select own messages" on public.ai_messages
  for select to authenticated using (user_id = (select auth.uid()));
-- No delete policy on messages: deleting one row would break the
-- user/assistant alternation. The cascade from a conversation needs none.

revoke all on table public.ai_conversations from anon, authenticated;
revoke all on table public.ai_messages from anon, authenticated;
grant select, delete on table public.ai_conversations to authenticated;
grant select on table public.ai_messages to authenticated;
grant all on table public.ai_conversations to service_role;
grant all on table public.ai_messages to service_role;

-- ── append one turn ────────────────────────────────────────────────

-- One user message and the reply to it, written as an atomic pair. Called by
-- the chat handler after a successful upstream reply, as the service role
-- (auth.uid() is null there, hence p_user). Soft outcomes return
-- {saved:false, reason}; a malformed call raises 22023.
create or replace function public.append_ai_turn(
  p_user           uuid,
  p_conversation   uuid,
  p_scenario       text,
  p_level          text,
  p_user_text      text,
  p_hidden         boolean,
  p_assistant_text text,
  p_model          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_next integer;
  v_count integer;
  v_excess integer;
begin
  if p_user is null or p_conversation is null then
    raise exception 'missing user or conversation' using errcode = '22023';
  end if;
  if p_scenario is null or char_length(p_scenario) not between 1 and 40 then
    raise exception 'invalid scenario' using errcode = '22023';
  end if;
  if p_level is null or p_level not in ('a1', 'a2', 'b1') then
    raise exception 'invalid level' using errcode = '22023';
  end if;
  if p_user_text is null or char_length(p_user_text) not between 1 and 2000 then
    raise exception 'invalid user text' using errcode = '22023';
  end if;
  if p_assistant_text is null or char_length(p_assistant_text) not between 1 and 6000 then
    raise exception 'invalid assistant text' using errcode = '22023';
  end if;

  -- Consent is checked here as well as on the client: off on either side
  -- means not saved, so sync lag cannot save a turn after an opt-out.
  select s.ai_history_enabled into v_enabled
    from public.settings s
   where s.user_id = p_user;
  if v_enabled is not true then
    return jsonb_build_object('saved', false, 'reason', 'disabled');
  end if;

  insert into public.ai_conversations (user_id, id, scenario_id, level)
  values (p_user, p_conversation, p_scenario, p_level)
  on conflict (user_id, id) do nothing;

  -- Serialises two devices writing to one conversation. An existing
  -- conversation keeps the scenario and level it was created with.
  perform 1
     from public.ai_conversations c
    where c.user_id = p_user and c.id = p_conversation
      for update;

  select coalesce(max(m.seq), 0) + 1 into v_next
    from public.ai_messages m
   where m.user_id = p_user and m.conversation_id = p_conversation;

  insert into public.ai_messages (user_id, conversation_id, seq, role, content, hidden)
  values (p_user, p_conversation, v_next, 'user', p_user_text, coalesce(p_hidden, false));
  insert into public.ai_messages (user_id, conversation_id, seq, role, content, model)
  values (p_user, p_conversation, v_next + 1, 'assistant', p_assistant_text, p_model);

  -- Keep at most 50 rows by dropping the OLDEST ones. Rows only ever arrive
  -- in pairs, so the excess is even and whole pairs go, which keeps the
  -- thread starting on a user row.
  select count(*) into v_count
    from public.ai_messages m
   where m.user_id = p_user and m.conversation_id = p_conversation;
  v_excess := v_count - 50;
  if v_excess > 0 then
    delete from public.ai_messages m
     where m.user_id = p_user
       and m.conversation_id = p_conversation
       and m.seq in (
         select o.seq from public.ai_messages o
          where o.user_id = p_user and o.conversation_id = p_conversation
          order by o.seq
          limit v_excess
       );
    v_count := 50;
  end if;

  update public.ai_conversations c
     set message_count = v_count, last_message_at = now()
   where c.user_id = p_user and c.id = p_conversation;

  -- At most 20 conversations: the least recently active go first.
  delete from public.ai_conversations c
   where c.user_id = p_user
     and c.id not in (
       select k.id from public.ai_conversations k
        where k.user_id = p_user
        order by k.last_message_at desc, k.id
        limit 20
     );

  return jsonb_build_object('saved', true, 'seq', v_next + 1, 'message_count', v_count);
end
$$;

revoke all on function public.append_ai_turn(uuid, uuid, text, text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.append_ai_turn(uuid, uuid, text, text, text, boolean, text, text)
  to service_role;

-- ── purge ──────────────────────────────────────────────────────────

-- Run daily by the Vercel cron at /api/v1/league/settle?job=purge (wired in a
-- later PR). A conversation is deleted 90 days after its last message, so it
-- is gone within 91 days plus the cron's slack; the messages cascade.
create or replace function public.purge_ai_conversations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_messages integer;
  v_conversations integer;
begin
  select count(*) into v_messages
    from public.ai_messages m
    join public.ai_conversations c
      on c.user_id = m.user_id and c.id = m.conversation_id
   where c.last_message_at < v_cutoff;
  delete from public.ai_conversations where last_message_at < v_cutoff;
  get diagnostics v_conversations = row_count;
  return jsonb_build_object('conversations', v_conversations, 'messages', v_messages);
end
$$;

revoke all on function public.purge_ai_conversations() from public, anon, authenticated;
grant execute on function public.purge_ai_conversations() to service_role;
