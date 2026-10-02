# AI endpoints — `/api/v1/ai/*`

Three endpoints, one shared contract. The split exists for per-feature rate
quotas and future server-side prompt assembly without a breaking change.
Prompts are client-assembled and pack-owned (platform Phase 1.3).

| Endpoint                | Used by                                                            | Quota (B0 initial) |
| ----------------------- | ------------------------------------------------------------------ | ------------------ |
| `POST /api/v1/ai/chat`  | Anna conversation turns                                            | 20 req / 5 min     |
| `POST /api/v1/ai/grade` | Exercise lane: answer grading **and** exercise-sentence generation | 60 req / 5 min     |
| `POST /api/v1/ai/deck`  | Custom deck generation                                             | 5 req / hour       |

## Request (all endpoints)

```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 1000,
  "system": "optional system prompt",
  "messages": [{ "role": "user", "content": "..." }]
}
```

Headers: `Content-Type: application/json`, plus an **optional**
`Authorization: Bearer <supabase access token>`.

- With the header, the caller is a signed-in learner, identified and keyed by
  account. `callClaude` sends it whenever a session exists.
- Without it, the caller is a guest keyed by IP, as before.
- A token GoTrue rejects gets `401 unauthorized`, so the client refreshes once
  and retries (`authedFetch`'s rule). A malformed header is also `401`.
- If GoTrue is unreachable, the request is served as a guest instead of
  failing.
- The per-endpoint quota above keys on the account for signed-in callers and on
  the IP for guests.

`model` is a **catalog id**, not a learner preference id. The Chat picker stores
`preferredModel` (`auto` | `fast` | `balanced` | `capable`) on the existing
state blob; `callClaude` / `routeAiRequest` resolve it to one of:

- `claude-haiku-4-5-20251001` (Fast)
- `claude-sonnet-5-5` (Balanced)
- `claude-opus-5-5` (Capable)

The server clamps `model` to the caller's tier ceiling after validation
(`clampModel` in `src/lib/accessPolicy.js`). Guests and signed-in Free callers
are Fast-only, so a request for Sonnet or Opus is forwarded as Haiku, and the
response's `model` says so. Honest clients never notice, because the client
router applies the same ceiling.

Some rows carry `params`, Anthropic request fields that the **server** adds for
that model in `api/_lib/forward.js`. Today these are Sonnet 5.5's
`thinking: { type: "between_tools" }` and Opus 5.5's
`output_config: { effort: "low" }`, which keep both models from spending the
1,000-token chat budget on thinking. A client cannot send these fields: the
validator rebuilds the body from its allow-list.

Auto leaves the router in charge. The browser never sends API keys — only
these catalog ids, which `api/_lib/validate.js` allow-lists from the same
catalog. The server adapter (`api/_lib/forward.js`) looks up `provider` on the
row and forwards to Anthropic today. See
`docs/superpowers/specs/2026-09-18-multi-model-wrapper-design.md`.

Chat (`POST /api/v1/ai/chat` and the legacy `/api/chat` alias) also accepts:

```json
{
  "level": "a1",
  "vocab": ["Hallo", "Danke"]
}
```

`level` is a lowercase CEFR code (`a1` | `a2` | `b1`); unknown strings clamp
to `a1`, a non-string is `400`. `vocab` is a string array (trimmed, deduped,
capped); a non-array is `400`. Neither field is forwarded to Anthropic — the
handler folds a language-blind appendix into `system` so a client cannot raise
the band by rewriting the prompt alone. Grade and deck ignore these extras
(unknown fields are stripped).

Constraints (requests violating any → `400 bad_request`):

- `model` must be on the allow-list (`api/_lib/validate.js`)
- `max_tokens` clamped to 1024; non-numeric values default to 1000
- 1–100 messages; roles only `user`/`assistant`; string content
- ≤ 100,000 total characters (system + all message content)
- unknown fields are stripped, never forwarded

## Response

2xx: the provider Messages response (Anthropic today), passed through
unchanged. Non-2xx: see the envelope table in `README.md`; upstream errors pass
through with their status.

## Quotas

Each endpoint draws on a daily allowance per meter (`chat`, `deck`, `grade`)
that resets at 00:00 UTC. `AI_QUOTA_MODE` selects the behaviour:

| Mode      | Behaviour                                                     |
| --------- | ------------------------------------------------------------- |
| `off`     | Default when unset. No metering, no quota headers.            |
| `shadow`  | Metered and logged (`quota_would_deny`), never denied.        |
| `enforce` | Over-limit requests are denied. `AI_GUEST_ENABLED=false` too. |

A chat turn costs 1, 2 or 4 units by model weight. The requested model is
clamped to the tier the server resolves, and the units are re-priced to match.
A provider failure or non-2xx refunds the units; cost is recorded on 2xx only.

**Denial** — HTTP 429, no upstream call:

```json
{
  "error": {
    "code": "quota_exhausted",
    "message": "Daily AI limit reached.",
    "meter": "chat",
    "tier": "free",
    "limit": 20,
    "used": 20,
    "resetsAt": "2026-10-03T00:00:00.000Z",
    "rewardedEligible": true
  }
}
```

`quota_exhausted` is distinct from `rate_limited` (burst flood control, carries
`Retry-After`). Messages vary by cause: daily limit, shared pool, or guests
paused.

**Headers** on every non-denied response when metering is on:
`X-Quota-Limit`, `X-Quota-Used`, `X-Quota-Reset` (ISO UTC), `X-Quota-Tier`.
Native origins can read them cross-origin.

## Legacy alias

`POST /api/chat` → same handler as `/api/v1/ai/chat`, through a `vercel.json`
rewrite to `/api/v1/ai?op=chat` (there has been no `api/chat.js` since
2026-10; its function slot went to the push sender). Kept for already-cached
PWA bundles.
