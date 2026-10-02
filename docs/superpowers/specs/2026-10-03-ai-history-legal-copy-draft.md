# AI Tutor conversation history — proposed legal copy (H4 draft)

**Status:** DRAFT for owner approval. **Proposed text only.** Nothing in
`src/components/legal`, `legalVersions.js` or the store checklist was changed.
Per `PrivacyPolicy.jsx` the policy wording is owner-supplied legal text,
reproduced verbatim, so PR H4 applies exactly what you approve here and nothing
else. This is a drafting aid, not legal advice; the store checklist (item 3)
already asks for counsel review of the final policy.

Design: `docs/superpowers/specs/2026-10-02-ai-tutor-conversation-history-design.md`
§11. Plan: `docs/superpowers/plans/2026-10-02-ai-tutor-conversation-history.md`, H4.

**How to approve.** Reply "approved", or give edits to any numbered item. Items
are independent. H4 is the PR that merges the text; it must land **before** the
feature is switched on (`AI_HISTORY_MODE=on`, `VITE_AI_HISTORY_ENABLED=true`).

---

## 1. The facts the copy states (check each against what shipped)

Every claim below is something the code or database enforces today, so the
policy will not promise more than the system does.

| Claim in the copy                                       | Where it is true                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Off unless the learner turns it on                      | `settings.ai_history_enabled` defaults `false` (H1). The server re-checks it inside `append_ai_turn`; the app also sends nothing unless it is on (H5). |
| Signed-in learners only; guests never saved             | The write needs `caller.kind === 'user'` (H2); a guest or identity-degraded caller is never saved.                                                    |
| What is stored: what you write and the tutor's replies  | `ai_messages.content`, verbatim; the model's text only, no thinking blocks, no system prompt, no vocabulary list, no IP address (H1, H2).              |
| Linked to your account                                  | `user_id` on both tables, deleted by cascade with the account.                                                                                        |
| Read, continue and delete                               | History panel (H6): list, Continue, Delete one; Settings: Delete all (H5).                                                                            |
| At most 20 conversations, 50 messages each              | Enforced in SQL by `append_ai_turn` (oldest pair, then least recently active conversation, removed).                                              |
| Deleted about 90 days after the last message            | `purge_ai_conversations()` run by the existing daily cron (H1, H3). "About", because it is a daily job and a missed run delays it by a day.         |
| Included in the data export                             | `aiConversations` and `aiMessages` in `account/export` (H3).                                                                                          |
| Removed when the account is deleted                     | FK `on delete cascade`, asserted by the RLS cascade suite (H1).                                                                                       |
| Not used for training, advertising, profiling, analytics | No code reads the tables except the learner's own queries and the export; a guard test pins that (H3). Reading by us is a policy commitment, §3 below. |
| Anthropic still gets no name, email or account id       | Unchanged: the request to Anthropic carries none; only our own database keys the saved text by account.                                              |

---

## 2. Proposed changes to the Privacy Policy

Edits are against `src/components/legal/PrivacyPolicy.jsx`. Section numbers and
headings do not change.

### 2.1 Section 2 — new item, directly after "AI Features:"

> **Saved Tutor Conversations (optional):** If you are signed in and turn on
> "Save my tutor conversations" in Settings, we store the conversations you have
> with the tutor — what you write and the tutor's replies — in our database,
> linked to your account, so that you can read them again, continue them on any
> device and delete them. This is off unless you turn it on, and we do not save
> a tutor conversation before you do. Conversations you have as a guest are
> never saved.

### 2.2 Section 3 — append to the existing paragraph

> If you choose to save your tutor conversations, we use them only to show them
> back to you. We do not use them to train AI models, for advertising or to
> build profiles, and we do not read them except where needed to investigate
> abuse of the service or to respond to a legal request.

_Check:_ the last clause is a commitment about how you will behave, not a
technical guarantee (the service role can read the tables). Say if you want it
removed, or narrowed to "legal request" only.

### 2.3 Section 6 — new item, directly after the "Account data …" item

> Saved tutor conversations are deleted automatically about 90 days after the
> last message in them. We keep at most 20 conversations of up to 50 messages
> each for your account; when you go past a limit, the oldest messages, or the
> conversation you used least recently, are removed.

### 2.4 Section 7 — two edits to the one paragraph

Replace the first sentence:

> You can download a copy of your learning data, and permanently delete your
> account, in the app under Profile → Settings → Account controls.

with:

> You can download a copy of your learning data, including your saved tutor
> conversations, and permanently delete your account, in the app under Profile →
> Settings → Account controls. You can also delete one saved conversation, or
> all of them, without deleting your account: in Chat → History, or in Settings →
> Account → Tutor conversations.

and in the second sentence replace "…including your learning data, profile,
problem reports, notification tokens and acceptance records." with:

> …including your learning data, profile, problem reports, saved tutor
> conversations, notification tokens and acceptance records.

### 2.5 Section 8 — new item, after "Push notifications are optional"

> **Saving tutor conversations is optional** and is off unless you turn it on.
> You can turn it off at any time in Settings → Account → Tutor conversations;
> new conversations stop being saved straight away. Conversations already saved
> stay until you delete them or they expire, as described above.

### 2.6 Version

Bump `PRIVACY_VERSION` in `src/lib/legalVersions.js` to the date H4 merges. That
**re-asks every learner to accept** (decision Q5, approved). `TERMS_VERSION` does
not change: the Terms (§8, AI-Generated Content) already cover AI output and say
nothing about storage.

---

## 3. Proposed change to the delete-account page

`src/components/legal/DeleteAccountPage.jsx`, section "What is deleted". Insert
"saved tutor conversations," after "problem reports you sent while signed in,":

> … your profile and profile pictures, your learning data, problem reports you
> sent while signed in, **saved tutor conversations,** notification tokens, and
> the record of which Terms and Privacy Policy versions you accepted.

No change to "What is kept": deletion removes the conversations at once, so
there is nothing to add there. Bump that file's `UPDATED` date (it is not a
versioned document, so nobody is re-asked).

---

## 4. Store disclosures (owner, at submission)

Re-check each form's current wording when you submit; these are the lines to
add to `docs/STORE_SUBMISSION_CHECKLIST.md` (the table after item 8):

| Data                                           | Collected by the native app?  | Linked to identity | Purpose           | Notes                                                       |
| ---------------------------------------------- | ----------------------------- | ------------------ | ----------------- | ----------------------------------------------------------- |
| Other user content (saved tutor conversations) | Only if the learner opts in   | Yes                | App functionality | Off by default; deleted after ~90 days or with the account |

- **Apple App Privacy:** "User Content → Other User Content", linked to the user,
  purpose App Functionality, not used for tracking.
- **Google Play Data safety:** "Messages → Other in-app messages", collected,
  not shared (Anthropic is a processor acting for us), optional, deletable.
- The existing row "Text sent to AI features" stays; it describes the
  real-time request to Anthropic, which is unchanged.

---

## 5. Not legal copy, but must agree with it

The Settings switch (`TutorHistorySection.jsx`) already says the data is saved to
the account, that it is off by default, and that it can be turned off or
deleted. **Proposed addition** (a UI string, no approval round needed, but it
should match §2.3): "Saved conversations are deleted automatically after about 90
days without a new message." H4 adds it so the switch and the policy say the
same thing.

---

## 6. What H4 changes mechanically once you approve

- `PrivacyPolicy.jsx`: items 2.1–2.5 verbatim. The test that pins the list at
  **24** `<li>`s becomes **27** (three new items), plus assertions for the new
  strings.
- `legalVersions.js`: `PRIVACY_VERSION`; `DeleteAccountPage.jsx`: item 3 and
  `UPDATED`; their tests.
- `docs/STORE_SUBMISSION_CHECKLIST.md`: the §4 row.
- `TutorHistorySection.jsx`: the §5 sentence.
- No change to `AI_HISTORY_MODE`, `VITE_AI_HISTORY_ENABLED`, Vercel settings,
  quotas, migrations or production.

## 7. Questions only you can answer

1. **§2.2:** keep, narrow or drop the "we do not read them except … abuse or
   legal request" clause?
2. **§2.3:** "about 90 days" and the "20 conversations of up to 50 messages"
   figures are the approved Q3/Q4 numbers. Do you want the numbers in the policy
   at all? Leaving them out makes later tuning free of a version bump, at the
   cost of a vaguer promise ("for a limited time").
3. **Optional extra sentence for §2.1:** "Please do not write anything in a
   saved conversation that you would not want us to store." It adds friction but
   states the real risk (learners can type anything). Include or skip?
4. Counsel review (checklist item 3) of the final text before store submission.
