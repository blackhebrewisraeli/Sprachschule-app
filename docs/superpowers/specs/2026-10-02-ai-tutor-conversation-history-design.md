# AI Tutor conversation history — design

**Status:** APPROVED 2026-10-02 — owner approved Q1–Q6 as recommended (§15). Design only until H1 starts.

Original status: DRAFT for owner approval. Docs only. No application code, migration,
legal copy, environment variable or production resource was changed while
writing this. Six decisions in §15 need an answer before PR H1 starts. The legal
copy in §11 is **proposed text**; it ships only as owner-approved text (PR H4).

Audit taken against `origin/main` at `5f84284a` (2026-10-02).
Plan: `docs/superpowers/plans/2026-10-02-ai-tutor-conversation-history.md`.
Production was read once, read-only, for sizing (§12): the database is 14 MB with
3 `settings` rows. Nothing was written.

---

## 1. Intent

Today the tutor (Anna) forgets everything the moment the learner leaves Chat.
This design adds **optional, server-side conversation history** for signed-in
learners so a conversation can be reviewed, resumed on another device, and
deleted.

**Success criteria.**

1. A signed-in learner who opts in can reopen a past conversation on any device.
2. Nobody else can read, write or delete it — not another learner, not an old or
   tampered client, not the admin console.
3. Storage is bounded per learner and in time. Nothing lives forever.
4. Delete conversation, delete all, export and delete account each provably cover
   it.
5. A guest, or a learner who did not opt in, sees today's behaviour exactly.
6. It costs no new Vercel function and no new cron.

**Non-goals.** Sharing or publishing a conversation; search across history;
analytics or training on stored text; an admin viewer; storing the system prompt;
syncing in-progress scene state (task index, scaffold stage); offline writing;
real-time cross-device updates; changing any existing `localStorage` key;
touching quota numbers, `AI_QUOTA_MODE`, RevenueCat or AdMob.

---

## 2. Premise check — the brief against the code

| #   | Claim                                              | Verdict                | Evidence and nuance                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Chat is stateless server-side                      | **True**               | `ChatTab.jsx` keeps `messages` in `useState`. Each turn `callClaude` POSTs the whole thread (`messages`, up to `MAX_MESSAGES = 100`, `MAX_TOTAL_CHARS = 100000`). Nothing is stored anywhere, not even `localStorage`.                                                                                                                                                   |
| P2  | A thread is one scene                              | **True**               | Changing scenario or level calls `openScene()`, which replaces the thread. So **one conversation = one scene session**.                                                                                                                                                                                                                                                 |
| P3  | The system prompt is client-built                  | **True**               | `systemPromptFor()` builds it from pack prompts, scenario, level, **the learner's learned-word allowlist** and interest hints. The server only appends `chatServerConstraint`. It is rebuilt every turn from current state.                                                                                                                                              |
| P4  | A turn carries a hidden opener                     | **True**               | `openScene()` sends `chatKickoffMessage()` as a `hidden` user turn; the model's opener is the first visible message. Assistant turns are JSON `{de, ipa, en, next, correction, taskComplete}`; the user turn's `correction` comes back in the **next** reply.                                                                                                            |
| P5  | AI calls already carry identity                    | **True (since A3)**    | `callClaude` uses `authedFetch(..., { optional: true })`; `resolveCaller` returns `{kind:'user', userId}` or a guest. A GoTrue outage **degrades to guest** (`degraded: true`) — persistence must treat that as "cannot save".                                                                                                                                           |
| P6  | The AI lane runs in one function                   | **True**               | `api/v1/ai.js` dispatches on `?op=`; the handler chain lives in `api/_lib/handler.js`. A success hook there is the single place a reply exists server-side.                                                                                                                                                                                                             |
| P7  | Vercel function budget is full                     | **True: 12 / 12**      | `api/_lib/functionBudget.test.js` fails CI on a 13th file. Count: account, admin, ai, content/lessons, league ×5 (handle, join, profile, refresh, settle), progress, push/streak-reminder, social.                                                                                                                                                                       |
| P8  | A reusable cron exists                             | **True**               | `vercel.json` runs `/api/v1/league/settle?job=purge` daily at 03:30 UTC, which calls `purge_ai_usage()` behind `CRON_SECRET`. A second RPC joins that branch; `vercel.json` does not change.                                                                                                                                                                             |
| P9  | Export and deletion already have a guard           | **True**               | `EXPORTED_TABLES` / `EXCLUDED_TABLES` in `accountEndpoints.js` (a table in neither fails `export.test.js`); `supabase/tests/rls/cascade.test.js` lists every user-owned table. Both must learn the new tables.                                                                                                                                                          |
| P10 | The export cannot carry this volume as written     | **New finding**        | `exportHandler` runs one unpaged `select('*')` per table. PostgREST's `max_rows` (1000 locally) silently truncates it, and a Vercel response is capped at 4.5 MB. §8.4 pages the new tables and sizes the caps to fit.                                                                                                                                                  |
| P11 | The Privacy Policy is silent on conversation storage | **True, and it matters** | §3 says text is "sent through our server to Anthropic" and says nothing about keeping it. §6 lists retention for AI **usage counts** only. §7 and `DeleteAccountPage` enumerate what deletion removes. Each needs a line (§11).                                                                                                                                         |
| P12 | Settings sync is an explicit allowlist             | **True**               | `src/lib/sync/adapters.js` maps each key by hand, so a new key inside `settings.data` is erased by an older client's next push (the reason `learned_by_deck` is a column, `20260830030000`). The opt-in flag must be a **column** (§6.3).                                                                                                                                |

---

## 3. Recommendation

**Ship it, narrowly, opt-in, and gated behind a server kill switch.**

| Question                | Recommendation                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Who can persist?        | **Signed-in learners only, and only after turning it on.** Default **off**.                            |
| Guests?                 | Ephemeral in-memory only. Identical to today. A guest sees one line: "Sign in to keep conversations".  |
| Where is it stored?     | Two Postgres tables, RLS-isolated, written **only by the server** after a successful reply.            |
| How much?               | 20 conversations × 50 messages per learner; user message ≤ 2,000 characters.                           |
| How long?               | **90 days after the last message**, purged daily by the existing cron.                                 |
| What is not stored?     | The system prompt, the vocabulary allowlist, the model's thinking blocks, IP addresses.                |
| Existing storage keys?  | **Unchanged.** No history is cached in `localStorage` (a shared device must not keep a signed-out learner's chats). |
| Release control         | `AI_HISTORY_MODE` (`off` default, `on`): server env, flipped by the owner, no rebuild.                 |

**Why opt-in rather than on-by-default.** Anna's chat is the first place the app
would keep **free text a learner typed**, which can contain anything they choose
to say (names, workplaces, a health aside). Consent as the lawful basis is then
simple, withdrawable and honest, the Privacy Policy stays true for everyone who
never turns it on, and the owner can ship the feature without re-papering the
whole user base. The cost is lower adoption; that is the right trade for a first
version and reversible (§15, Q2).

**Why ship at all.** The value is real for a tutor: reread corrections, continue
a scene on the phone that began on the laptop. The risk is bounded by the caps,
the retention, and the kill switch. The cost is small: no new function, no new
cron, one migration, a Settings toggle and a drawer.

**Timing.** Do not land the handler change (PR H2) during the AI-quota shadow
week. It touches `api/_lib/handler.js`, the path being measured, and adds a
round trip after the upstream call. H1, H4 drafting and this design are safe
earlier. See the plan's sequencing.

---

## 4. Product behaviour

1. **Settings → Account controls → "Save my tutor conversations"** (signed-in
   only). Off by default. Turning it **on** records consent; turning it **off**
   stops saving at once and asks "Also delete the conversations already saved?"
   (default: keep, so a mis-tap loses nothing; a second button deletes all).
2. **Chat** gets a **History** control (signed-in and opted-in). It opens a list:
   scenario name, level, date, message count, newest first. Open → read, and
   **Continue** resumes in Chat. Each row has **Delete conversation** (confirm).
3. **While a conversation is live and saving**, a quiet "Saved" mark appears
   after each reply. If a turn could **not** be saved (§8.2) it says "Not saved"
   once; the conversation itself keeps working.
4. **Guests** see no toggle and no list. A single line points to sign-in.
5. **Sign-out** clears everything held in memory. **Offline** the list says
   "History is available when you are online." Nothing is cached on the device.

---

## 5. Data model

Two tables, both `references auth.users(id) on delete cascade` (the account
deletion mechanism, `accountEndpoints.js`). The key is **composite with
`user_id`**, so a client-supplied conversation id can never collide with, probe
or hijack another learner's row: isolation holds by construction, not by a check.

```sql
create table public.ai_conversations (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  id              uuid        not null,                 -- client-generated, scoped by user_id
  scenario_id     text        not null check (char_length(scenario_id) between 1 and 40),
  level           text        not null check (level in ('a1','a2','b1')),
  message_count   smallint    not null default 0 check (message_count between 0 and 50),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index ai_conversations_recent on public.ai_conversations (user_id, last_message_at desc);
create index ai_conversations_purge  on public.ai_conversations (last_message_at);

create table public.ai_messages (
  user_id         uuid        not null,
  conversation_id uuid        not null,
  seq             integer     not null,                 -- monotonic, never reused
  role            text        not null check (role in ('user','assistant')),
  content         text        not null check (char_length(content) between 1 and 6000),
  hidden          boolean     not null default false,   -- the scene kickoff
  model           text,                                 -- assistant rows: model that answered
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id, seq),
  foreign key (user_id, conversation_id)
    references public.ai_conversations (user_id, id) on delete cascade
);
```

Plus one column on `settings`:
`ai_history_enabled boolean not null default false` — a column, not a key inside
`data` (§2 P12). An old client's upsert never names it, so it can neither erase
nor set it.

**Decisions inside the schema.**

- **`content` is verbatim.** A user row stores exactly what the learner typed. An
  assistant row stores the model's **text blocks joined**, the JSON string the
  prompt contracts for. The client re-parses it with the same `parseReply` it
  uses live, so a resumed thread renders identically. Thinking blocks are
  dropped (as `callClaude` already does).
- **No title column.** The list label is derived: scenario name + date. A
  derived title would store a snippet of free text for no benefit.
- **Hidden kickoff is stored** as a `hidden = true` user row (~60 chars of
  pack-owned constant). Resume is then a plain map over rows, and the model sees
  what it saw live.
- **System prompt: omitted, deliberately.** It embeds the learned-word allowlist
  and interest hints (more personal data, and 80 terms every time), it is rebuilt
  from current state on every turn so a stored copy would never be replayed, and
  it is pack-owned and language-blind. Storing `scenario_id` + `level` is enough
  to rebuild it. There is therefore **no prompt versioning**: a resumed
  conversation continues under the _current_ prompt, which is the behaviour
  learners already get mid-session when their vocabulary changes.
- **Invariant:** a conversation's rows alternate `user`, `assistant`, begin with
  `user` and end with `assistant`. Turns are written as an atomic pair (§7), and
  trimming (§8.3) removes whole pairs, so a resumed history is always a valid
  Anthropic message list.

---

## 6. Security: isolation and grants

### 6.1 RLS

Both tables: RLS on, in the same migration that creates them (the
`ensure_rls` event trigger enforces it). Policies use the initplan form
`(select auth.uid())`, per `20260906000500_league_policy_initplan`.

| Operation | Client (`authenticated`)                               | Server (`service_role`) |
| --------- | ------------------------------------------------------ | ----------------------- |
| SELECT    | own rows: `user_id = (select auth.uid())`              | yes                     |
| DELETE    | own rows (same predicate)                              | yes                     |
| INSERT    | **none** — no policy, no grant                         | yes                     |
| UPDATE    | **none** — no policy, no grant                         | yes                     |
| `anon`    | nothing; explicit deny-all policy and `revoke all`     | —                       |

Grants are explicit (`grant select, delete ... to authenticated`), per
`20260612201311_data_api_explicit_grants`. **A client can never forge, edit or
backdate a stored turn.** It can only read and delete its own.

### 6.2 Reads and deletes go straight to PostgREST

The browser already talks to Supabase with RLS for sync (`srs_state`, `decks`).
List, load and delete need **no Vercel function**:

- list: `from('ai_conversations').select(...).order('last_message_at', {ascending:false}).limit(20)`
- load: `from('ai_messages').select(...).eq('conversation_id', id).order('seq')` (≤ 50 rows)
- delete one: `from('ai_conversations').delete().eq('id', id)` (messages cascade)
- delete all: `from('ai_conversations').delete().eq('user_id', uid)`

### 6.3 Consent is checked on **both** sides

The client sends a `conversation` block only when the learner opted in. The
server **also** reads `settings.ai_history_enabled` inside the write RPC (same
transaction, primary-key read). **Off on either side means not saved.** This
closes the sync-lag window where the toggle is off locally but the row has not
reached the server, and a tampered client cannot opt a learner in.

### 6.4 `append_ai_turn` (SECURITY DEFINER, service role only)

`append_ai_turn(p_user_id, p_conversation, p_scenario, p_level, p_user_text,
p_hidden, p_assistant_text, p_model)`; `set search_path = ''`;
`revoke all ... from public, anon, authenticated`; `grant execute ... to
service_role` (the `consume_ai_quota` pattern). Inside one transaction it:

1. returns `{saved:false, reason:'disabled'}` if the consent flag is false;
2. upserts the conversation row `on conflict (user_id,id)` and locks it
   `for update`, which serialises two devices writing to one conversation;
3. inserts the user row and the assistant row at `seq = next, next+1`;
4. trims the oldest **pairs** while `message_count > 50`;
5. if the learner now has more than 20 conversations, deletes the least recently
   active ones;
6. updates `message_count`, `last_message_at`; returns `{saved:true, ...}`.

Every limit is enforced **in SQL**, so a bug in the handler cannot exceed them.

---

## 7. Write path (server)

The write lives where the reply exists: the chat handler.

```
client ── POST /api/v1/ai/chat  { model, system, messages, level, vocab,
                                  conversation?: { id, scenario, kickoff? } }
  resolveCaller → rate limit → validate → afterValidate(applyChatConstraints
                                          + validateConversation)
  quota.consume → clamp model → forwardToProvider
  2xx → quota.recordCost → persistTurn()   ← NEW, best-effort
  respond (+ header X-Conversation-Saved: 1 | 0)
```

- **`validateConversation`** (new, in `afterValidate`): `id` is a UUID,
  `scenario` ≤ 40 chars, and the last message is a `user` message of ≤ 2,000
  characters. An invalid block is **ignored with `X-Conversation-Saved: 0`**,
  never a 400: a persistence mistake must not break a learner's chat.
- **`persistTurn`** runs only when **all** hold: `AI_HISTORY_MODE === 'on'`,
  `caller.kind === 'user'` and not `caller.degraded`, the upstream status is 2xx,
  and the reply has non-empty text. It stores **the last user message from the
  request and the reply it just received**, never earlier history from the
  request. A client therefore cannot smuggle a forged "assistant" turn into
  storage.
- **Failure is soft.** The RPC runs under a 2-second timeout, errors are logged
  as `{event:'ai_history_write_failed', reason}` with **no content, no user id**,
  and the reply is returned regardless. A persistence failure never refunds
  quota and never turns a good answer into an error.
- **Not persisted:** a denied turn (`quota_exhausted`, `rate_limited`,
  `unauthorized`), an `upstream_error`, and a refunded call. They produce no
  reply, so there is no pair to write. The learner's message is still on screen,
  but is not in history; the next successful turn's user message is stored.
- **Order matters:** consume quota → upstream → record cost → persist → respond.
  Persistence cannot run before the upstream call without storing questions that
  were never answered.

The response header (`X-Conversation-Saved`) follows the existing precedent of
the `X-Quota-*` headers; the body stays the untouched provider payload.

---

## 8. Limits, retention and the read/export shape

### 8.1 Limits

| Limit                          | Value        | Why                                                                                                                                               |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages per conversation      | 50           | ~25 turns. Rolling: oldest **pairs** drop (§8.3). Also bounds input tokens on resume (§10).                                                       |
| Conversations per learner      | 20           | Least recently active evicted on the 21st. The UI says so before it happens.                                                                      |
| User message                   | 2,000 chars  | Enforced by the Composer (`maxLength`) and by the server for saved turns. Today the only bound is 100k total per request.                         |
| Assistant message              | 6,000 chars  | `CHECK` ceiling. `max_tokens` is capped at 1,024 (~4k chars), so a real reply never reaches it; an over-length reply is simply not saved.         |
| Rows per learner               | ≤ 1,000      | 20 × 50. A hard bound, not a typical value.                                                                                                       |
| Worst-case export              | ≈ 4 MB       | 500 × 6,000 + 500 × 2,000 chars. Under Vercel's 4.5 MB response cap; **typical is under 1 MB** (§12).                                             |

### 8.2 Pagination

- **List:** one page of 20 (the cap). No cursor needed.
- **Open a conversation:** one request, ≤ 50 rows ordered by `seq`.
- **Export:** the two new tables are read in **500-row ranges** until a short
  page, never one unpaged `select('*')` (P10). Messages are ordered by
  `(conversation_id, seq)` so pages are stable. `conversations` is 20 rows.

### 8.3 Trimming

Trim by pair so the §5 invariant holds. When a 51st-and-52nd row arrive, the
oldest `user` + `assistant` pair is deleted. After many turns the first stored
row is mid-conversation, which is fine: the model is fed a window, not the whole
scene (§10).

### 8.4 Retention and purge

- **Rule:** delete a conversation, and its messages by cascade, **90 days after
  `last_message_at`**.
- **Mechanism:** `purge_ai_conversations()` (SECURITY DEFINER, service role),
  called from the **existing** daily job `GET /api/v1/league/settle?job=purge`
  right after `purge_ai_usage()`. `vercel.json` is **unchanged**. The two calls
  are independent: one failing is reported and does not stop the other (today a
  failure of the first would end the request).
- **Guarantee, stated precisely:** a conversation is gone no later than **91
  days** after its last message, plus cron slack of a few hours. This is the
  figure the Privacy Policy states (§11).
- **Cost:** `ai_conversations_purge` is a plain index on `last_message_at`; the
  delete touches only expired rows. Unlike `ai_usage`, this table is not on a
  hot per-request path, so the index is worth its write cost.

---

## 9. Multi-device, offline and concurrency

- **Source of truth is the server.** The device holds a conversation only in
  React state. There is no `localStorage` copy and no new storage key.
- **Saving needs the network anyway** (the reply that triggers it is an online
  call), so there is **no offline write queue** and no sync conflict class.
- **Two devices on one conversation:** the row lock in `append_ai_turn` orders
  their turns. A device that did not see the other's turns sends a thinner
  history to the model; it may get a less informed reply, but nothing is lost or
  corrupted. No realtime push; the other device sees new turns when it reopens
  the conversation. Accepted: this is a tutor, not a chat room.
- **Resume:** the client loads rows, drops a leading `assistant` row if any,
  maps them with `toHistory`, restores `scaffold` from the last reply's `next`,
  and starts a **new `sceneRef`**. Task index and progression stage are **not**
  restored (they are session state, §1 non-goals): a resumed conversation
  restarts at the scenario's first task and the level's starting stage.
- **Sign-out / account switch:** clear history state; reload on the next
  sign-in. The `settings.ai_history_enabled` column follows the account, not the
  device.

---

## 10. Interaction with AI quotas and cost

**Quota.** Persistence adds **no meter, no unit, no allowance**. The chat turn
is metered exactly as before, once, before the upstream call. A denied or
refunded turn stores nothing. Listing, opening and deleting are PostgREST reads
and are not AI calls: they cost no quota and do not touch `ai_usage`.

**Cost accounting.** `quota.recordCost` still records the model's real tokens.
Persistence has **no Anthropic cost**. Its own cost is one RPC per saved turn
(~10–30 ms, inside the existing 30 s function) and Postgres storage (§12).

**The real cost lever is resume.** Measured 2026-10-01 (monetization spec §6.10):
input grows ~250 tokens per turn. Today a thread dies when the learner leaves, so
an old conversation never gets expensive. A resumed 25-turn conversation would
send ~6k tokens of history on every turn. Two guards:

1. The 50-message rolling cap bounds history at ~25 turns.
2. PR H5 adds a **context window** on the client: at most the last **24**
   messages go to the model, for live and resumed threads alike. At that window
   a turn costs about its 9th-turn price (~$0.0045 Haiku, ~$0.009 Sonnet 5.5),
   inside the existing §6.10 model. This is a cost decision, not a persistence
   decision, and is listed in the plan so it is measured against shadow-week
   numbers before it ships.

Opt-in persistence does not change `rewardedEligible` or any quota header.

---

## 11. Privacy, GDPR and legal copy

**Roles and basis.** The operator is the controller. Storing conversations is
processing the learner **asks for** by switching the toggle on: the lawful basis
is **consent** (Art. 6(1)(a)), freely withdrawable in the same place. Anthropic
remains the processor for generating replies and still receives no name, email or
account id; that sentence in the policy stays true, because only our database
keys by account id.

| Right            | How it is met                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Access, portability | `account/export` gains `aiConversations` and `aiMessages` (§8.2).                                           |
| Erasure          | Delete conversation, **Delete all**, and account deletion (cascade). Backups follow the policy's existing line. |
| Withdraw consent | Toggle off stops writes immediately (§6.3); optional delete-all in the same dialog.                            |
| Minimisation     | Opt-in; caps; 90-day retention; no prompt, vocabulary, IP or thinking stored.                                  |
| Purpose limit    | Used only to show the learner their own history. Not used for analytics, training, moderation queues or the admin console. |
| Rectification    | Not applicable; a transcript is a record. Delete is offered instead.                                           |

**Incidental sensitive data.** A learner may type anything. Opt-in, short
retention, a delete control and "no staff viewer" are the mitigations; a full
DPIA is not warranted at this scale, but the owner should read this section.
Support access: the service role can technically read rows. The policy commits
to reading them only to investigate abuse or answer a legal request, and the
admin endpoints must never select these tables (a test asserts it, plan H3).

**Age.** The Terms already require 13+; nothing here changes that.

### 11.1 Required copy changes (proposed text; owner-approved only)

Quoted text is **proposed**. Existing wording is in `PrivacyPolicy.jsx` and
`DeleteAccountPage.jsx`.

1. **§3 "AI Features"** — append:
   > "If you are signed in and turn on **Save my tutor conversations** in
   > Settings, we also store the conversations you have with the tutor — what you
   > wrote and what the tutor replied — in our database, linked to your account,
   > so you can read, continue and delete them. This is off unless you turn it
   > on."
2. **§6 Retention** — new item:
   > "Saved tutor conversations are deleted automatically 90 days after your last
   > message in them, and at the latest within 91 days. We keep at most 20
   > conversations of up to 50 messages each; older ones are removed as new ones
   > are saved."
3. **§7 Exporting and Deleting** — add "saved tutor conversations" to the
   export list, and to the deletion list ("…learning data, profile, problem
   reports, **saved tutor conversations**, notification tokens…"). Add: "You can
   also delete one conversation, or all of them, from Chat → History or Settings,
   without deleting your account."
4. **§8 Your Choices** — add the toggle and that turning it off stops saving.
5. **`DeleteAccountPage` "What is deleted"** — add "saved tutor conversations".
6. **§2 data-use sentence** — "powering AI features" already covers it; no change.
7. **`PRIVACY_VERSION`** — bump (`legalVersions.js`). That re-asks acceptance via
   `legal_acceptances` for **every** learner; see Q5.
8. **Store listings** (owner): Apple's privacy details gain "User Content → Other
   User Content" linked to the user for App Functionality; Google Play's Data
   safety form gains in-app messages. Re-check both forms' current wording at
   submission; `docs/STORE_SUBMISSION_CHECKLIST.md` gets the line (plan H4).

**Order is a hard rule:** the copy PR (H4) merges **before** the feature can be
switched on, exactly as the terms PR waited on `legal_acceptances` (#382).
`AI_HISTORY_MODE` stays `off` until then.

---

## 12. Sizing

Production (read-only, 2026-10-02): **14 MB** database, 3 `settings` rows. A
saved turn is two rows of roughly 100 B (user) and 600 B (assistant JSON) plus
keys and index entries, so **~1 KB per turn**.

| Profile                          | Rows          | Approx. size |
| -------------------------------- | ------------- | ------------ |
| Typical opted-in learner         | ~40           | ~25 KB       |
| Heavy learner                    | 1,000 (cap)   | ~0.8 MB      |
| 1,000 typical opted-in learners  |               | ~25 MB       |
| 1,000 heavy (not realistic)      |               | ~0.8 GB      |

The cap bounds the unrealistic row; retention bounds the realistic one. The owner
should check the Supabase plan's database ceiling before turning the flag on and
watch `pg_total_relation_size('public.ai_messages')` for the first month (plan
H6).

---

## 13. Abuse and prompt injection

- **Cross-user injection is impossible:** nothing a learner stores is shown to or
  fed to another learner. No sharing, no public surface, no admin viewer.
- **Self-injection** (a learner stores text that tries to steer the model on
  resume) only affects that learner's own session, and the client can already
  send any history in a request today (`validateAiBody` accepts any
  `assistant`-role message). Persistence adds no power; storage only ever holds
  the user's own last message and the server's own reply (§7).
- **Rendering:** stored content is shown as React text, never as HTML. The
  existing chat renderer already does this; history reuses it.
- **Storage exhaustion:** bounded by the SQL caps, the chat rate limit
  (20 / 5 min per caller), and the daily quota. Creating many conversations
  evicts the oldest; it cannot grow the table.
- **Squatting / probing ids:** the composite key makes another learner's id a
  different key. A foreign id simply creates your own row.
- **Replay and duplicates:** a manual re-send after a lost response saves a
  second pair. No dedupe key: a deliberate re-send _is_ a new turn, and the
  client does not auto-retry.
- **Logs:** the persistence path logs outcome and reason only — never content,
  user id, conversation id or IP.
- **Kill switch:** `AI_HISTORY_MODE=off` stops all writes without a deploy. Reads
  and deletes stay available, so a learner can always remove what is stored.

---

## 14. Platform constraints

- **Function budget (12 / 12):** no new file under `api/`. Writes ride
  `api/v1/ai.js` → `handler.js`; reads and deletes go direct to PostgREST; export
  stays in `api/v1/account.js`; purge stays in `api/v1/league/settle.js`.
  `functionBudget.test.js` must stay green in every PR.
- **Cron:** the daily `?job=purge` job is reused. `vercel.json` is untouched.
- **ESM rule:** any new `api/_lib` file imports `src/` modules with explicit
  `.js` extensions and imports nothing extensionless (`ai-esm-resolution.test.js`).
- **Custom domain and fallback origin:** nothing here adds an origin, redirect,
  CORS entry or absolute URL. `originAllowed` is untouched; both
  `www.sprachschule-app.com` and `deutsch-app-dusky.vercel.app` keep working.
- **Migrations:** forward-only, one new file. Existing migrations are not edited.
  The owner applies it (§16); agents never do.

---

## 15. Owner decisions

**Resolved 2026-10-02: the owner approved every recommendation below (Q1–Q6).**

| #   | Decision                                                | Recommendation                                           | If you choose otherwise                                                                                   |
| --- | ------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Q1  | Ship server-side history at all?                        | **Yes, staged** (§3).                                    | "No" closes this; nothing else in the repo depends on it.                                                 |
| Q2  | Opt-in (default off) or on by default?                  | **Opt-in.**                                              | On-by-default needs a stronger basis (legitimate interest + notice) and rewrites §11.1 item 1.            |
| Q3  | Retention                                               | **90 days idle.**                                        | 30 = tighter copy, less continuity; 180 = more storage and a longer promise. One constant in one function. |
| Q4  | Caps                                                    | **20 conversations × 50 messages, 2,000-char message.**  | Raising either grows the export past 4.5 MB (§8.1) and needs the export redesigned.                       |
| Q5  | Bump `PRIVACY_VERSION` (re-asks everyone to accept)?    | **Yes.** It is a new category of stored data, and the bump is the repo's mechanism for proving notice. | No bump means the feature ships under an unchanged "Last Updated" and no re-consent; weaker on notice.    |
| Q6  | Land the handler PR after the quota shadow-week review? | **Yes.**                                                 | Landing earlier adds latency and a changed code path to the very week being measured.                     |

Also owner-only, not decisions: confirm the Supabase plan's database ceiling
(§12), update the store privacy forms (§11.1 item 8), and apply the migration
(§16).

---

## 16. Owner-only production steps

Agents do not do these (AGENTS.md; `.mcp.json` points at production).

1. **After H1 merges:** apply `supabase/migrations/<ts>_ai_conversation_history.sql`
   with the Management API drill in `docs/MOBILE_PUSH_SETUP.md` §1 (baseline
   `list_migrations` → apply → verify tables, policies, grants, RPC ACLs →
   `notify pgrst, 'reload schema'`). It records history under the file's own
   version. Never `migration repair`, `db push`, `db reset` or `db pull`.
2. **Verify** `Migration Drift` is green, the advisors show no new
   `rls_disabled` or `function_search_path_mutable`, and `ai_conversations`,
   `ai_messages` carry no `anon` privileges.
3. **After H2/H3 deploy** with `AI_HISTORY_MODE` unset (inert): confirm the daily
   purge response now reports `conversations` and `messages`.
4. **After H4 (legal copy) merges:** update the store privacy forms.
5. **Release:** set `AI_HISTORY_MODE=on` in Vercel Production, redeploy. Roll back
   by setting it to `off`.

---

## 17. Test strategy

- **Unit:** `validateConversation` (valid, bad uuid, oversize, missing); the
  handler persists only on 2xx, never for guests, degraded callers, denied or
  refunded turns; a persistence failure still returns the reply and does not
  refund; `AI_HISTORY_MODE=off` writes nothing; no log line contains content.
- **RLS suite (`npm run test:rls`):** user A cannot select, delete or insert
  user B's rows; `authenticated` cannot insert or update; `anon` sees nothing;
  `append_ai_turn` is not executable by `authenticated`; trimming keeps the
  alternation invariant; the 21st conversation evicts the oldest; the consent
  flag off ⇒ `saved:false`; purge removes only rows older than 90 days;
  `cascade.test.js` lists both tables and finds zero rows after deletion.
- **Export:** both tables appear in `EXPORTED_TABLES`; 1,000 rows export
  complete (paging), not truncated.
- **Admin:** a test fails if any `adminEndpoints` / `adminGodMode` query names
  the new tables.
- **Client:** the toggle, list, open, continue, delete-one, delete-all, the
  "Not saved" state, guest and offline states; verified at 375 px and 320 px with
  a populated account.
- **Budget:** `functionBudget.test.js` unchanged and green.
