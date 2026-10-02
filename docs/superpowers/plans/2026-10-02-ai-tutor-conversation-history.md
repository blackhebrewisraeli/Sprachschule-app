# AI Tutor Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional, opt-in, server-side conversation history for signed-in
learners: saved after each successful tutor reply, readable and deletable by the
learner only, purged after 90 days, covered by export and account deletion.

**Architecture:** Two RLS-isolated tables written only by a service-role RPC
(`append_ai_turn`) that the existing chat handler calls after a successful
upstream reply. The browser reads and deletes through PostgREST under RLS. The
consent flag is a `settings` column checked on both sides. Purge rides the
existing daily cron. No new Vercel function, no new cron.

**Spec:** `docs/superpowers/specs/2026-10-02-ai-tutor-conversation-history-design.md`.
Read §5 (schema), §6 (security), §7 (write path), §8 (limits) before any task.
Owner decisions **Q1–Q6** (spec §15) were **approved as recommended on
2026-10-02**. Remaining gates: H1 applied to production before H2/H3/H5; the
quota shadow-week review before H2 (Q6); owner-approved copy before H4.

## Global Constraints

- **Agents never apply migrations.** No `supabase db push`, `migration repair`,
  `db reset`, `db pull`, MCP `apply_migration`, or `execute_sql` with writes.
- **Forward-only:** add one new migration file; never edit an applied one.
- **No new file under `api/`** that Vercel deploys (12 / 12).
  `api/_lib/functionBudget.test.js` must stay green.
- **No new `vercel.json` cron.** Reuse `?job=purge`.
- **Do not rename or migrate any `localStorage` key.** History is never cached
  client-side.
- **Do not touch** quota numbers, `AI_QUOTA_MODE`, RevenueCat, AdMob, the custom
  domain, the Vercel fallback origin, `origin.js`, or CORS.
- **Legal copy changes only in H4, as owner-approved text.**
- **`AI_HISTORY_MODE` defaults to `off`.** Every PR before H7 ships inert.
- New `api/_lib` files import `src/` with explicit `.js` extensions.
- Each PR: `npm test`, `npm run lint`, `npm run format:check` green; branch from
  up-to-date `main`; never `--no-verify`.

## PR sequence

| PR  | Title                                     | Needs                                        | Ships inert?                                 |
| --- | ----------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| H0  | Design spec + this plan (docs only)       | —                                            | n/a                                          |
| H1  | Migration: tables, RLS, RPCs, consent col | Q1–Q4 answered                               | Yes (unused tables)                          |
| —   | **Owner applies H1 to production**        | H1 merged                                    | —                                            |
| H2  | Server write path in the chat handler     | H1 applied; **shadow-week review done (Q6)** | Yes (`AI_HISTORY_MODE` off)                  |
| H3  | Purge, export, deletion, admin guard      | H1 applied                                   | Yes                                          |
| H4  | Legal copy + store checklist (owner text) | Q5; owner-approved text                      | Copy only; **must merge before H7**          |
| H5  | Client data layer, toggle, context window | H1 applied                                   | Yes (toggle hidden unless mode on)           |
| H6  | History UI: list, open, continue, delete  | H5                                           | Yes                                          |
| H7  | Release: flip `AI_HISTORY_MODE=on`        | H2–H6 merged, owner steps                    | Owner action                                 |

H2 and H3 are independent after H1 and can be reviewed in parallel. H5 can start
as soon as H1 is applied, but H6 and H7 wait for H2.

---

## H0 — Design spec and plan (this PR)

- [x] Audit `ChatTab`, `claude.js`, `handler.js`, `validate.js`, export, delete, retention copy.
- [x] Write the spec and this plan.
- [x] Add the backlog row.
- [x] `npm run format:check`.

---

## H1 — Migration (forward-only) **[GATED: Q1–Q4]**

Files:

- Create: `supabase/migrations/<next timestamp after 20261007120000>_ai_conversation_history.sql`
- Create: `supabase/tests/rls/ai-history.test.js`
- Modify: `supabase/tests/rls/cascade.test.js` (add both tables to `USER_OWNED`)
- Modify: `supabase/tests/rls/server-only-tables.test.js` only if it enumerates tables

- [ ] **Step 1 — Failing RLS tests first** (`npm run test:rls`, needs `supabase start`):
  - A cannot `select`/`delete` B's rows; A can select/delete its own.
  - `authenticated` has no `insert`/`update` on either table; `anon` sees nothing.
  - `append_ai_turn` is not executable by `authenticated`/`anon`.
  - Consent flag false ⇒ `{saved:false}` and no rows.
  - Pair written atomically; `seq` strictly increasing; first row `user`, last `assistant`.
  - 26th pair trims the oldest pair (50-row cap holds, alternation holds).
  - 21st conversation evicts the least recently active.
  - Over-length content (`> 6000`) rejected by the `CHECK`.
  - `purge_ai_conversations()` deletes only `last_message_at < now() - 90 days`; messages cascade.
  - Deleting the auth user leaves zero rows (cascade).
- [ ] **Step 2 — Write the migration** per spec §5–§6: both tables, composite
      keys, both indexes, `settings.ai_history_enabled boolean not null default false`,
      RLS on in the same file, `(select auth.uid())` policies, explicit
      `grant select, delete ... to authenticated`, `revoke` for `anon`,
      `append_ai_turn` and `purge_ai_conversations` as `SECURITY DEFINER`,
      `set search_path = ''`, `revoke all ... from public, anon, authenticated`,
      `grant execute ... to service_role`. Header comment: **DO NOT apply from an
      agent**, with the guarantees (caps, 90 days).
- [ ] **Step 3 — Make the tests green**; check locally for no `rls_disabled` and
      no `function_search_path_mutable`.
- [ ] **Step 4 — Docs:** add the apply steps (spec §16) to the `docs/BACKLOG.md`
      owner table. `npm test`, `npm run lint`, `npm run format:check`.
- [ ] **Step 5 — PR.** Body states the file is **not applied** and lists the §16
      drill. **Owner applies it, then verifies, before H2/H3/H5 merge.**

---

## H2 — Server write path **[GATED: H1 applied, Q6]**

Files:

- Create: `api/_lib/aiHistory.js`, `api/_lib/aiHistory.test.js`
- Modify: `api/_lib/handler.js` (+ `handler.test.js`), `api/_lib/aiEndpoints.js`
- Modify: `docs/api/ai.md` (the contract: `conversation` block, `X-Conversation-Saved`)

- [ ] **Step 1 — Tests first** (spec §7, §17): `validateConversation` cases;
      persists only for a non-degraded `user` caller on 2xx; never for guests,
      denied, rate-limited, upstream-error or refunded turns; stores the last user
      message plus joined **text** blocks only (no thinking blocks, no earlier
      history); `AI_HISTORY_MODE` unset/`off` ⇒ RPC never called; RPC error or 2 s
      timeout ⇒ reply still `200`, no refund, header `0`; log line has no content,
      user id or conversation id.
- [ ] **Step 2 — `aiHistory.js`:** `modeOn(env)`, `validateConversation(raw, safeBody)`,
      `persistTurn({db, caller, conversation, safeBody, data, model})` calling
      `append_ai_turn` under a 2 s `Promise.race`.
- [ ] **Step 3 — Hook in `createAiHandler`:** an optional `persist` option used
      only by `chatHandler`, called after `recordCost` and before the response;
      sets `X-Conversation-Saved`. Order stays: consume → upstream → cost → persist.
- [ ] **Step 4 — Contract docs** and the 2,000-char rule.
- [ ] **Step 5 —** `api/v1/ai-esm-resolution.test.js` and `functionBudget.test.js` green.
- [ ] **Step 6 — PR.** Inert until the owner sets `AI_HISTORY_MODE=on`.

---

## H3 — Purge, export, deletion, admin guard **[GATED: H1 applied]**

Files:

- Modify: `api/v1/league/settle.js` (+ `settle.test.js`)
- Modify: `api/_lib/accountEndpoints.js` (+ `api/v1/account/export.test.js`)
- Modify: `api/_lib/adminEndpoints.test.js` (or add a guard test)

- [ ] **Step 1 — Purge:** in the `?job=purge` branch call `purge_ai_usage()` and
      `purge_ai_conversations()` independently; respond
      `200 {purged:{usage, grants, conversations, messages}}` and report a failure
      of either without skipping the other. Tests: both called; one failing still
      runs the other; the secret is still required.
- [ ] **Step 2 — Export:** add `ai_conversations: 'aiConversations'` and
      `ai_messages: 'aiMessages'` to `EXPORTED_TABLES`; read both in **500-row
      ranges** ordered `(conversation_id, seq)` until a short page. Test with
      1,000+ rows that nothing is truncated, and with the existing guard that every
      user-owned table is in exactly one of the two lists.
- [ ] **Step 3 — Deletion:** no handler change (cascade). The RLS suite from H1
      already asserts it; confirm `delete.test.js` still issues exactly one call.
- [ ] **Step 4 — Admin guard test:** fail if `adminEndpoints.js` or
      `adminGodMode.js` reference `ai_conversations` or `ai_messages`.
- [ ] **Step 5 — PR.**

---

## H4 — Legal copy **[GATED: owner-approved text, Q5]**

Files: `src/components/legal/PrivacyPolicy.jsx`, `DeleteAccountPage.jsx`
(+ their tests), `src/lib/legalVersions.js`, `docs/STORE_SUBMISSION_CHECKLIST.md`.

- [ ] **Step 1 —** The owner supplies or approves the text in spec §11.1.
- [ ] **Step 2 —** Apply items 1–5 verbatim; update the tests that pin the
      wording; bump `PRIVACY_VERSION` if Q5 is yes (the "Last Updated" line derives
      from it).
- [ ] **Step 3 —** Add the store privacy-form line (item 8) to the checklist.
- [ ] **Step 4 — PR.** Must merge **before** H7. It does not enable anything.

---

## H5 — Client data layer, toggle, context window **[GATED: H1 applied]**

Files:

- Create: `src/lib/aiHistory.js` (+ test): `listConversations`, `loadConversation`,
  `deleteConversation`, `deleteAllConversations`, over `getSupabase()`
- Modify: `src/lib/claude.js` (+ test): send `conversation: {id, scenario, kickoff}`
  only when enabled; read `X-Conversation-Saved`
- Modify: `src/lib/sync/adapters.js`, `src/lib/sync.js` (+ tests): carry
  `ai_history_enabled` as its **own column**, never inside `data`
- Modify: `src/components/chat/Composer.jsx`: `maxLength={2000}`
- Modify: the Settings → Account controls component: the toggle and the
  "also delete saved conversations?" dialog
- Modify: `src/components/ChatTab.jsx`: generate a `conversationId` per scene,
  thread it through `callOptions`, window the history sent to the model to the
  last 24 messages

- [ ] **Step 1 — Tests first:** an old client's settings upsert cannot erase the
      column; the flag round-trips across devices; guests never send `conversation`;
      the window keeps alternation and a leading `user`; toggling off stops sending
      immediately; delete-all calls the right query.
- [ ] **Step 2 — Implement.** Inline styles and `theme.js` tokens only.
- [ ] **Step 3 —** The **context window** is measured against shadow-week token
      numbers before merge; if the owner prefers no window, drop that sub-step and
      keep the 50-message cap as the only bound.
- [ ] **Step 4 — PR.** The toggle is hidden unless history is available, so an
      `off` environment never shows a dead control.

---

## H6 — History UI **[GATED: H5, H2 merged]**

Files: `src/components/chat/HistoryDrawer.jsx` (+ test), `ChatTab.jsx`,
`MessageList.jsx` only if resume needs a read-only mode.

- [ ] **Step 1 — Tests first:** list order and label; open renders identically to
      live (same `parseReply` path); a leading `assistant` row is dropped on resume;
      an unparsable assistant row renders the existing error reply, not a crash;
      continue starts a new `sceneRef`; delete-one confirms; delete-all; "Not saved"
      state; guest and offline states; sign-out clears memory.
- [ ] **Step 2 — Implement:** History control, list, read, **Continue**, delete.
      No `localStorage`. Focus returns to the opener; `aria-label` on icon buttons;
      visible focus.
- [ ] **Step 3 — Browser-verify** at 375 px and 320 px with a populated account
      (`bp.tiny`), light and dark.
- [ ] **Step 4 — PR.**

---

## H7 — Release (owner)

- [ ] H1 applied and verified (spec §16 steps 1–2); Supabase plan ceiling checked.
- [ ] H2–H6 merged; the daily purge response shows `conversations` and `messages`.
- [ ] H4 merged; store privacy forms updated.
- [ ] Set `AI_HISTORY_MODE=on` in Vercel Production; redeploy.
- [ ] Smoke test with a throwaway account: opt in, chat, reopen on a second
      browser, delete one, delete all, export, delete account; confirm zero rows.
- [ ] First month: watch `pg_total_relation_size('public.ai_messages')`.
- [ ] Rollback: `AI_HISTORY_MODE=off`. Reads and deletes keep working.

---

## Self-review

- Every spec requirement maps to a PR: schema, RLS and consent (H1), write path
  and abuse handling (H2), retention, export, deletion and admin (H3), legal
  (H4), multi-device, resume, limits and the cost window (H5–H6), release (H7).
- No PR adds an `api/` function or a cron; each says so in its gates.
- Order dependencies are explicit: H1 applied before H2/H3/H5; H4 before H7;
  Q6 before H2.
