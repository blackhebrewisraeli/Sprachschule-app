# AI Tutor conversation history: release runbook (H7)

**Owner action.** All the code, the migration and the legal copy for saved tutor
conversations are merged and **dark**. Nothing is saved, and the Settings switch
and the History panel do not appear, until you do the steps below. This is the
last PR in the plan: `docs/superpowers/plans/2026-10-02-ai-tutor-conversation-history.md`.
Design: `docs/superpowers/specs/2026-10-02-ai-tutor-conversation-history-design.md`.

Two switches, both Vercel **Production** environment variables:

| Variable                  | Set to | Read where               | Effect                                                                                            |
| ------------------------- | ------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `AI_HISTORY_MODE`         | `on`   | the server (AI function) | Lets the chat handler save opted-in turns. Unset or anything else = nothing is written.           |
| `VITE_AI_HISTORY_ENABLED` | `true` | the build (**baked in**) | Shows Settings → Account → Tutor conversations and Chat → History. Unset = the UI does not exist. |

**Environment changes reach only new deployments, and the `VITE_` one is baked
in at build time.** One redeploy after setting both covers them.

Agents never apply migrations, never change Production settings and never touch
quota numbers or `AI_QUOTA_MODE`. Everything here is yours to run.

---

## 0. Do not start until all of these are true

| Check                                                                                                                 | How to confirm                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 to H6 and H4 are on `main`                                                                                         | `git log --oneline` shows #405, #406, #407, #408, #409, #411.                                                                                                         |
| The migration is applied to production                                                                                | Migration Drift is green on `main` (GitHub → Actions). Applied 2026-10-02 as `20261008120000 ai_conversation_history`.                                                |
| **The AI-quota shadow-week review is done** (decision Q6)                                                             | You have looked at `ai_cost_daily` and the would-deny rates after at least 7 days of `AI_QUOTA_MODE=shadow`, and you are not about to change quota numbers this week. |
| An Anthropic Console monthly spend limit is set                                                                       | Console → Limits. History adds no Anthropic cost of its own, but resume sends more history per turn (the 24-message window bounds it).                                |
| `main` is deployed to Production and its checks are green                                                             | Vercel → Deployments: Production is the latest `main` commit.                                                                                                         |
| You are ready for **every signed-in learner to see the "One more step" Terms and Privacy gate** at their next open    | #411 bumped `PRIVACY_VERSION` to `2026-10-03`. This already happened on merge, whatever you do here; see §5.                                                          |
| Counsel has reviewed the final Privacy Policy text (checklist item 3), if you want that before the feature is visible | `docs/STORE_SUBMISSION_CHECKLIST.md` item 3.                                                                                                                          |

If the shadow week is not finished, **stop**. The server change adds one RPC
round trip to the path being measured, and landing it mid-measurement muddies
the numbers (this is why #406 waited).

### 0.1 Read-only checks of production (Supabase SQL Editor or an agent with reads)

```sql
-- Objects exist, RLS on, no anon grants (expect: 2 tables, 1 column, 2 functions).
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('ai_conversations', 'ai_messages')) as tables,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'ai_history_enabled') as flag_col,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('append_ai_turn', 'purge_ai_conversations')) as fns,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('ai_conversations', 'ai_messages')
      and grantee = 'anon') as anon_grants;
```

Expect `2, 1, 2, 0`. The table counts before launch should also be `0` rows:
`select count(*) from public.ai_conversations;`.

---

## 1. Set the two variables

Vercel → the project → **Settings → Environment Variables**.

1. Add `AI_HISTORY_MODE` = `on`, environment **Production only**.
2. Add `VITE_AI_HISTORY_ENABLED` = `true`, environment **Production only**.
3. **Leave Preview and Development unset.** Previews talk to the same Supabase
   project (there is no staging one), so a Preview with history on would write
   real rows from unreviewed code.

Neither value is a secret; neither needs "Sensitive".

## 2. Redeploy Production

Vercel → **Deployments** → the latest Production deployment → **Redeploy**
(tick nothing that reuses the build cache, so the `VITE_` value is rebuilt in).
Wait for it to go green. Do not push a commit just to redeploy.

Confirm the new build carries the flag: open the site signed out, then signed
in; a signed-in account must show Settings → Account → **Tutor conversations**.
A signed-out visitor sees Chat → History's one-line "Sign in to keep your tutor
conversations".

If you do not see them, the redeploy used a stale build: redeploy again, or
check that the variable is on **Production** and spelled exactly.

---

## 3. Smoke test with a throwaway account

Use a new email you control, not your own learning account. Creating the
account and accepting the new terms is yours to do.

| #   | Do                                                                                     | Expect                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sign in with the throwaway email.                                                      | The Terms and Privacy gate appears; the policy shows **Last Updated: October 3, 2026** and the "Saved Tutor Conversations" item. Accept. |
| 2   | Settings → Account → **Tutor conversations**.                                          | The switch reads **off**. The text says it is off unless you turn it on, and mentions about 90 days.                                     |
| 3   | Chat, open a scene, send one message **before** turning it on.                         | No "Saved" mark. (Step 5 confirms nothing was stored.)                                                                                   |
| 4   | Turn the switch **on**.                                                                | "Saving is on. New tutor conversations are saved to your account."                                                                       |
| 5   | Run SQL check **A** below.                                                             | `0` rows for this user: the pre-consent turn was not saved.                                                                              |
| 6   | Start a new scene (change scenario), send 3 messages.                                  | "Saved" appears under the thread after each reply.                                                                                       |
| 7   | Run SQL check **A**.                                                                   | `1` conversation, `message_count` `8` (kickoff + opener + 3 pairs). `ai_messages` rows alternate user/assistant.                         |
| 8   | Chat → **History**.                                                                    | The conversation is listed with its scene, today's date, "8 messages". The pre-consent scene is not.                                     |
| 9   | On a **second browser or device**, sign in as the same user. History → **Continue**.   | The thread is rebuilt, correctly worded and graded; the kickoff is not visible. Send one more message: "Saved", count `10`.              |
| 10  | Create a second conversation (new scene, 1 message). History → **Delete** it, confirm. | It disappears. SQL check **A** shows one conversation.                                                                                   |
| 11  | Settings → **Delete all saved conversations**, confirm.                                | "Saved conversations deleted." SQL check **A** shows `0`.                                                                                |
| 12  | Make another saved conversation, then Settings → account **Export**.                   | The downloaded JSON has `data.aiConversations` and `data.aiMessages` with those rows.                                                    |
| 13  | Turn the switch **off**, send a message.                                               | No "Saved" mark. SQL check **A** is unchanged.                                                                                           |
| 14  | Delete the throwaway account (Settings → Account controls).                            | SQL check **B** shows `0` rows in both tables.                                                                                           |

SQL checks. Replace `THROWAWAY_EMAIL`; these read counts and shapes only, never
message text:

```sql
-- A: this user's saved conversations and message counts.
select c.id, c.scenario_id, c.level, c.message_count,
       (select count(*) from public.ai_messages m
         where m.user_id = c.user_id and m.conversation_id = c.id) as rows,
       c.last_message_at
  from public.ai_conversations c
  join auth.users u on u.id = c.user_id
 where u.email = 'THROWAWAY_EMAIL'
 order by c.last_message_at desc;

-- B: after deleting the account, expect 0 and 0.
select (select count(*) from public.ai_conversations) as conversations,
       (select count(*) from public.ai_messages) as messages;
```

(B counts the whole table, which is only `0` if no other learner has opted in
yet. Before real learners opt in, that is the case; after, count by the
throwaway's `user_id` captured at step 7 instead.)

**If any row of §3 does not match, switch it off (§6) before investigating.**

---

## 4. Verify the daily purge runs

The existing 03:30 UTC cron now also runs `purge_ai_conversations()`.

1. The morning after the release: Vercel → the project → **Logs**, filter the
   path `/api/v1/league/settle`, look at the `03:30 UTC` request with
   `job=purge`.
2. Expect status **200** and a body shaped like
   `{"purged":{"usage":…,"grants":…,"conversations":0,"messages":0}}`. It is
   `0` and `0` for the first 90 days, because nothing is old enough.
3. A **500** names the sweep that failed ("Failed to purge: AI conversations.").
   The other sweep still ran. Fix before the first conversations turn 90 days
   old; the retention promise in the policy depends on it.

---

## 5. What learners will see, and what to expect

- **Everyone signed in** sees the Terms and Privacy gate at their next open,
  because `PRIVACY_VERSION` changed. This is the re-consent from decision Q5.
  Expect a bump in `legal_acceptances` rows and a few support emails.
- **Nothing is saved for anyone** until they open Settings and turn the switch
  on. Default off is the whole privacy position. Adoption will be low at first.
- **Guests** see one line in Chat, "Sign in to keep your tutor conversations."
- **Native apps** (iOS and Android) get the feature only in a build that has
  `VITE_AI_HISTORY_ENABLED=true` baked in. Web is live after §2; a native
  release is a separate store build and the store privacy forms must be updated
  first (§7).

---

## 6. Rollback

Pick the smallest that stops the problem.

| Level                  | Do                                                                                                                          | Result                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Stop writing**    | `AI_HISTORY_MODE` = `off` (or delete it); redeploy Production.                                                              | The server saves nothing more. Learners can still list and delete what is already saved. The switch and History stay visible; a turn shows "Not saved". Cheapest, keeps the erasure path open. |
| **B. Hide everything** | Also `VITE_AI_HISTORY_ENABLED` = `false`; redeploy.                                                                         | No UI at all. **Learners can no longer delete their saved conversations from the app**; the data stays until the 90-day purge or account deletion. Use only if the UI itself is the problem.   |
| **C. Remove the data** | Owner only, SQL Editor: `delete from public.ai_conversations;` (everyone) or `... where user_id = '<uuid>';` (one learner). | Messages cascade. Irreversible. Needed for a deletion request while B is in force, or for an incident.                                                                                         |

The migration stays applied in every case; it is forward-only and inert when
nothing calls it. Never `migration repair` or drop the tables to "roll back".

---

## 7. After the release

1. **Store privacy forms (before the next native store submission):** Apple App
   Privacy "User Content → Other User Content" (linked, App Functionality, not
   tracking); Google Play Data safety "Messages → Other in-app messages"
   (collected, optional, deletable). Re-check the forms' current wording. The
   row is in `docs/STORE_SUBMISSION_CHECKLIST.md`.
2. **First month, watch size and failures:**

   ```sql
   select pg_size_pretty(pg_total_relation_size('public.ai_messages')) as messages_size,
          pg_size_pretty(pg_total_relation_size('public.ai_conversations')) as conversations_size,
          (select count(*) from public.settings where ai_history_enabled) as opted_in,
          (select count(*) from public.ai_conversations) as conversations,
          (select count(*) from public.ai_messages) as messages,
          (select min(last_message_at) from public.ai_conversations) as oldest;
   ```

   Sizing guide (design §12): about 25 KB per typical opted-in learner, 0.8 MB
   per learner at the 1,000-row cap. `oldest` must never be older than about 91
   days once the purge has had time to run.

3. **Server log events to search in Vercel Logs:** `ai_history_write_failed`
   (with `reason`: `timeout`, `rpc_error`, `rpc_threw`). A steady trickle means
   saves are failing silently for learners ("Not saved" shows); a burst means
   check Supabase health. The log never contains message text, user ids or
   conversation ids.
4. **Update `docs/BACKLOG.md`:** mark the feature released, with the date.
5. Decide, with the shadow-week numbers in hand, whether the 24-message context
   window (`HISTORY_WINDOW` in `src/lib/aiHistory.js`) should change.

## 8. Evidence to keep

Write these down in the release PR or a note; they are what you will be asked
for if a learner or a regulator asks what was live and when.

| Item                                                | Value (fill in) |
| --------------------------------------------------- | --------------- |
| Date and time `AI_HISTORY_MODE=on` took effect      |                 |
| Production deployment id and commit                 |                 |
| Smoke test (§3) passed, by whom, which throwaway    |                 |
| First 200 response of the purge with the new fields |                 |
| Privacy Policy version live (`PRIVACY_VERSION`)     | 2026-10-03      |
| Store privacy forms updated (date)                  |                 |

## Why each step is the way it is

- **Both flags, one redeploy:** the server flag alone saves nothing (no client
  sends a conversation), and the client flag alone shows a switch whose turns
  the server refuses ("Not saved"). Setting both and redeploying once avoids
  either half-state.
- **Production only:** previews share the production database.
- **Consent checked twice:** the app only sends a conversation when the learner
  opted in, and `append_ai_turn` re-reads the flag from `settings`. Turning it
  off in Settings takes effect on the next turn on every device.
- **No Anthropic change:** the request to Anthropic still carries no name,
  email or account id, which is what the policy says.
