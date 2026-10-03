# sprachschule-app API — conventions

The REST half of the **developer interface** (the other half is the database
contract, arriving in phase B1). Spec:
`docs/superpowers/specs/2026-06-10-backend-architecture-design.md`.

- **Base path:** `/api/v1/` — breaking changes mean `/api/v2/`; shipped `/v1`
  contracts stay stable.
- **Auth:** none in B0. Phase B2 adds optional Supabase JWTs (anonymous-first).
- **Error envelope** — every non-2xx produced by our functions:

  ```json
  { "error": { "code": "<machine_code>", "message": "<human text>" } }
  ```

  | code                 | HTTP | meaning                                            |
  | -------------------- | ---- | -------------------------------------------------- |
  | `bad_request`        | 400  | body failed validation                             |
  | `unauthorized`       | 401  | reserved for B2 (JWT auth)                         |
  | `reauth_required`    | 401  | valid token, but the action needs a fresh sign-in  |
  | `apple_token_required` | 401 | Apple learner deleting an account without an Apple token: sign in with Apple again |
  | `forbidden`          | 403  | Origin present but not allow-listed                |
  | `signup_not_allowed` | 403  | valid token, email not on `SIGNUP_EMAIL_ALLOWLIST` |
  | `method_not_allowed` | 405  | only POST is accepted                              |
  | `rate_limited`       | 429  | quota exceeded — honor `Retry-After` (seconds)     |
  | `upstream_error`     | 502  | Anthropic unreachable / network failure            |
  | `server_error`       | 500  | missing server configuration or unexpected failure |

  Upstream Anthropic **error responses pass through unchanged** (their own
  `{ "type": "error", "error": { ... } }` shape and status).

- **CORS** is granted only to the native app's origins (`capacitor://localhost`,
  `https://localhost`), by `withCors` in `api/_lib/origin.js`: the preflight is
  answered `204`, the origin is echoed, and `Retry-After` is exposed. The web
  app calls `/api` same-origin and needs none.

- **Rate limits** are per client IP in B0 (per user id once B2 ships JWTs),
  fixed windows, best-effort per function instance until B1's durable store.
