# Store legal consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **APPROVED 2026-09-29.** Owner accepted the spec's §5 copy as written and
> every §7 recommendation (D1 a, D2 b, D3 a, D4, D5 a, D6 pin). D7: operator
> Shimon Esterkin, effective date 2026-09-29, sign-in email provider Supabase
> Auth.
>
> **OWNER UPDATE 2026-09-30 (binding):** brand/project name `sprachschule-app`;
> official support/contact email `sprachschule.support@gmail.com` (legal/contact
> uses only — `esterkinshimon712@gmail.com` stays as the admin, allowlist,
> system-account and test identity); D1–D6 re-confirmed. Execution order:
> 2 → 1 → 3 → owner-update gate (absorbs Task 15) → 4 → … → 12 → 13 → 14.

**Goal:** Accurate Privacy Policy, a server-recorded versioned acceptance of the
Terms and Privacy Policy for every account, and a just-in-time push disclosure —
without changing Guest Mode.

**Architecture:** A `legal_acceptances` table written only by a
`SECURITY DEFINER` RPC bound to `auth.uid()`. A `useLegalAcceptance(user)` hook
decides `accepted | required | unknown`; `App.jsx` feeds every existing
`user` / `authStatus` consumer the gated values, so nothing syncs before a
record exists. A pre-auth checkbox on create surfaces records intent that the
hook consumes after the session lands; everything else meets a post-auth gate.

**Tech Stack:** React 18 + Vite 5, inline styles + `src/lib/theme.js` tokens,
Vitest + RTL (`globals: false`), Supabase (Postgres RLS, PostgREST RPC),
Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-09-29-store-legal-consent-design.md`

## Global Constraints

- Brand/project name: `sprachschule-app` (exact, lowercase, hyphenated) wherever the product name is human-facing brand copy or a declarative name field (spec §7 "Brand-name scope"). It replaces "Deutsch App" and "Deutsch · Sprachschule". Exception: the in-app "Deutsch." wordmark and `public/social-preview.png` (owner decision pending).
- Legal/support/contact email: `sprachschule.support@gmail.com`. Never replace `esterkinshimon712@gmail.com` where it is the admin, allowlist, system-account, test-identity or authorization email.
- Operational identifiers keep their names (document, never migrate): repo `deutsch-app`, Vercel URL `deutsch-app-dusky.vercel.app`, Supabase project `Sprachschule` / `xcnnlczvxmuwcqwychox`, bundle/application ID + URL scheme `com.sprachschule.deutsch`, every `deutsch-app-*` localStorage key, the Sentry project.
- Effective date of both documents: 2026-09-29 → `TERMS_VERSION = PRIVACY_VERSION = '2026-09-29'`; pages read `Last Updated: September 29, 2026`, rendered by `lastUpdatedLine(version)` — never typed by hand.
- Legal copy is reproduced **verbatim** from the owner-approved spec §5; tests pin it. No wording changes without approval.
- Consent label: `I agree to the Terms of Service and acknowledge the Privacy Policy.` — links to `/terms` and `/privacy`, unchecked by default.
- No existing localStorage key is renamed or migrated. New keys: `deutsch-app-legal-accepted-v1`, `deutsch-app-legal-intent-v1`.
- Intent TTL: 30 minutes (`INTENT_TTL_MS = 30 * 60 * 1000`).
- Versions are ISO dates `YYYY-MM-DD`; DB enforces `^\d{4}-\d{2}-\d{2}$`.
- Migration file only. **Never** apply it, `db push`, `migration repair`, or MCP `apply_migration` (AGENTS.md). MCP points at production.
- Do not enable `VITE_PUSH_ENABLED`, create a sender, or touch Firebase/APNs/Supabase/Vercel settings.
- Tests: import `{ describe, it, expect, vi, … }` from `'vitest'`; co-locate `*.test.js(x)`.
- Styling: inline styles, tokens only (`COLORS`, `SPACE`, `FONT_SIZE`, …). Grid tracks `minmax(0, 1fr)`. Verify 375px and 320px.
- Commits go through `.husky/pre-commit` (lint-staged + full `npm test`); never `--no-verify`. Run `npx husky` first if working in a fresh worktree.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Client ships before the migration is applied.** `select` on a missing table errors → hook reports `'unknown'` → every signed-in user silently stops syncing. Expected: no gate, local practice keeps working, and the owner checklist orders "apply migration" **before** merge. Test in Task 4 pins `'unknown'` never becoming `'accepted'` or `'required'` on a table-missing error.
2. **Two tabs.** Accepting in one tab must release the other without a reload. Task 4 listens for `storage` events on `deutsch-app-legal-accepted-v1`.
3. **Version bump while offline with an old hint.** The hint must not cover new versions; the learner stays local-only, never gated offline, never synced. Task 3 + Task 4 tests.
4. **320px consent row.** Two links inside a wrapping label; the checkbox row must stay ≥ 44px tall and the label text must toggle the box. Task 5 test.
5. **Decline after a guest session.** Signing out of the gate must keep guest progress when this device never synced the account. Task 10 test.

---

### Task 1: Pin the push flag off for native builds

**Files:**

- Modify: `package.json` (`scripts.build:mobile`)
- Create: `src/lib/buildMobileScript.test.js`
- Modify: `docs/MOBILE_PUSH_SETUP.md` (§4)

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/buildMobileScript.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// build:mobile pins every VITE_* flag a native build must not inherit from a
// local .env file. Push stays OFF until docs/STORE_SUBMISSION_CHECKLIST.md is done.
describe('build:mobile', () => {
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['build:mobile'];

  it('pins push notifications off', () => {
    expect(script).toMatch(/(^|\s)VITE_PUSH_ENABLED=false(\s|$)/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/lib/buildMobileScript.test.js`
Expected: FAIL (`VITE_PUSH_ENABLED=false` not found).

- [ ] **Step 3: Add the pin**

In `package.json`, insert `VITE_PUSH_ENABLED=false ` immediately after `VITE_GITHUB_AUTH_ENABLED=true ` in `build:mobile`.

In `docs/MOBILE_PUSH_SETUP.md` §4, replace the `.env.production.local` instruction with:

```markdown
`npm run build:mobile` pins `VITE_PUSH_ENABLED=false`, so no local env file can
turn push on by accident. Turn it on only after every push item in
`docs/STORE_SUBMISSION_CHECKLIST.md` is done: change that pin to `true` in
`package.json`, on a machine that has step 2's `google-services.json`, then
`npm run build:mobile`.
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/lib/buildMobileScript.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json src/lib/buildMobileScript.test.js docs/MOBILE_PUSH_SETUP.md
git commit -m "build(mobile): pin VITE_PUSH_ENABLED=false in build:mobile"
```

---

### Task 2: `legal_acceptances` table, RPC, RLS tests, export and cascade

**Files:**

- Create: `supabase/migrations/20260929120000_legal_acceptances.sql`
- Create: `supabase/tests/rls/legal-acceptances.test.js`
- Modify: `supabase/tests/rls/cascade.test.js` (`USER_OWNED` + a seeded row)
- Modify: `api/_lib/accountEndpoints.js` (`EXPORTED_TABLES`)
- Modify: `api/v1/account/export.test.js` (`USER_OWNED`)

**Interfaces:**

- Produces: table `public.legal_acceptances(user_id, terms_version, privacy_version, accepted_at)`; RPC `accept_legal_terms(p_terms_version text, p_privacy_version text) returns timestamptz`; export key `legalAcceptances`.

- [ ] **Step 1: Write the failing RLS suite**

```js
// supabase/tests/rls/legal-acceptances.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// legal_acceptances: 20260929120000. Clients read their own rows; the only
// write path is accept_legal_terms, which acts as auth.uid().
// Requires the local stack: `supabase start`, then `npm run test:rls`.

const admin = adminClient();
const V = { p_terms_version: '2026-10-01', p_privacy_version: '2026-10-01' };
let A;
let B;

async function rowsFor(userId) {
  const { data, error } = await admin.from('legal_acceptances').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  A = await createSignedInUser('legal-a');
  B = await createSignedInUser('legal-b');
});

afterAll(async () => {
  for (const u of [A, B]) if (u?.id) await admin.from('legal_acceptances').delete().eq('user_id', u.id);
});

describe('accept_legal_terms', () => {
  it('anon cannot execute it', async () => {
    const { error } = await anonClient().rpc('accept_legal_terms', V);
    expect(error).not.toBeNull();
  });

  it('records a row for the caller with the server clock', async () => {
    const before = Date.now();
    const { data, error } = await A.client.rpc('accept_legal_terms', V);
    expect(error).toBeNull();
    const rows = await rowsFor(A.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ terms_version: '2026-10-01', privacy_version: '2026-10-01' });
    expect(new Date(data).getTime()).toBeGreaterThanOrEqual(before - 5000);
  });

  it('is idempotent and keeps the first accepted_at', async () => {
    const [first] = await rowsFor(A.id);
    const { data, error } = await A.client.rpc('accept_legal_terms', V);
    expect(error).toBeNull();
    expect(new Date(data).toISOString()).toBe(new Date(first.accepted_at).toISOString());
    expect(await rowsFor(A.id)).toHaveLength(1);
  });

  it.each([['not-a-date'], [''], [null]])('rejects version %j', async (bad) => {
    const { error } = await A.client.rpc('accept_legal_terms', { ...V, p_terms_version: bad });
    expect(error?.code).toBe('22023');
  });

  it("never writes another user's row", async () => {
    await B.client.rpc('accept_legal_terms', { ...V, p_terms_version: '2027-01-01' });
    expect((await rowsFor(A.id)).map((r) => r.terms_version)).not.toContain('2027-01-01');
  });
});

describe('legal_acceptances: direct table access', () => {
  it('A reads own rows only', async () => {
    const { data, error } = await A.client.from('legal_acceptances').select('user_id');
    expect(error).toBeNull();
    expect(data.every((r) => r.user_id === A.id)).toBe(true);
  });

  it('A cannot insert directly, even for itself', async () => {
    const { error } = await A.client
      .from('legal_acceptances')
      .insert({ user_id: A.id, terms_version: '2020-01-01', privacy_version: '2020-01-01' });
    expect(error).not.toBeNull();
  });

  it('A cannot backdate or delete its history', async () => {
    await A.client.from('legal_acceptances').update({ accepted_at: '2000-01-01' }).eq('user_id', A.id);
    await A.client.from('legal_acceptances').delete().eq('user_id', A.id);
    const rows = await rowsFor(A.id);
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].accepted_at).getFullYear()).toBeGreaterThan(2000);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `supabase start && npm run test:rls -- legal-acceptances`
Expected: FAIL (relation / function does not exist). If Docker is unavailable, record that in the PR and continue; CI does not run this suite.

- [ ] **Step 3: Write the migration**

```sql
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
```

- [ ] **Step 4: Export + cascade guards**

In `api/_lib/accountEndpoints.js`, add to `EXPORTED_TABLES` after `token_ledger`:

```js
  // Which Terms/Privacy versions the learner accepted, and when. Their own
  // record, and the proof a data request most often asks for.
  legal_acceptances: 'legalAcceptances',
```

In `api/v1/account/export.test.js` and `supabase/tests/rls/cascade.test.js`, add `'legal_acceptances'` to `USER_OWNED`. In `cascade.test.js`'s population step, seed a row the same way the other tables are seeded:

```js
  {
    const { error } = await admin
      .from('legal_acceptances')
      .insert({ user_id: userId, terms_version: '2026-10-01', privacy_version: '2026-10-01' });
    if (error) throw error;
  }
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run api/v1/account/export.test.js` → PASS.
Run (stack up): `supabase db reset --local && npm run test:rls` → all suites PASS. (`--local` only; never against the linked project.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260929120000_legal_acceptances.sql supabase/tests/rls/legal-acceptances.test.js supabase/tests/rls/cascade.test.js api/_lib/accountEndpoints.js api/v1/account/export.test.js
git commit -m "feat(db): legal_acceptances table + accept_legal_terms RPC (file only, not applied)"
```

---

### Task 3: `legalAcceptance.js` — versions, hints, intent, server calls

**Files:**

- Create: `src/lib/legalAcceptance.js`
- Create: `src/lib/legalAcceptance.test.js`

**Interfaces:**

- Consumes: `getSupabase()` from `src/lib/auth.js`; RPC/table from Task 2.
- Produces:
  - `TERMS_VERSION: string`, `PRIVACY_VERSION: string` (`'2026-09-29'`, the approved effective date)
  - `LEGAL_ACCEPTED_KEY = 'deutsch-app-legal-accepted-v1'`, `LEGAL_INTENT_KEY = 'deutsch-app-legal-intent-v1'`, `INTENT_TTL_MS`
  - `hintCovers(userId: string): boolean`, `writeAcceptedHint(userId: string): void`
  - `recordIntent(now?: number): void`, `clearIntent(): void`, `hasValidIntent(now?: number): boolean`
  - `fetchAcceptances(userId: string): Promise<{ current: boolean, hasPrior: boolean }>` (throws on any error)
  - `acceptCurrentTerms(): Promise<void>` (throws on any error)

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/legalAcceptance.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const supa = vi.hoisted(() => ({ rows: [], selectError: null, rpcError: null, rpc: vi.fn() }));
vi.mock('./auth.js', () => ({
  getSupabase: async () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: supa.selectError ? null : supa.rows, error: supa.selectError }),
      }),
    }),
    rpc: async (...args) => {
      supa.rpc(...args);
      return { error: supa.rpcError };
    },
  }),
}));

import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  LEGAL_INTENT_KEY,
  INTENT_TTL_MS,
  hintCovers,
  writeAcceptedHint,
  recordIntent,
  clearIntent,
  hasValidIntent,
  fetchAcceptances,
  acceptCurrentTerms,
} from './legalAcceptance.js';

beforeEach(() => {
  localStorage.clear();
  supa.rows = [];
  supa.selectError = null;
  supa.rpcError = null;
  supa.rpc.mockClear();
});

describe('versions', () => {
  it('are ISO dates', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('accepted hint', () => {
  it('covers only the same user and the current versions', () => {
    writeAcceptedHint('u1');
    expect(hintCovers('u1')).toBe(true);
    expect(hintCovers('u2')).toBe(false);
  });

  it('does not cover an older version (a bump re-asks, even offline)', () => {
    localStorage.setItem(
      'deutsch-app-legal-accepted-v1',
      JSON.stringify({ userId: 'u1', terms: '2000-01-01', privacy: PRIVACY_VERSION })
    );
    expect(hintCovers('u1')).toBe(false);
  });

  it('treats garbage as absent', () => {
    localStorage.setItem('deutsch-app-legal-accepted-v1', '{nope');
    expect(hintCovers('u1')).toBe(false);
  });
});

describe('intent', () => {
  it('is valid within the TTL for the current versions', () => {
    recordIntent(1000);
    expect(hasValidIntent(1000 + INTENT_TTL_MS - 1)).toBe(true);
  });

  it('expires after the TTL', () => {
    recordIntent(1000);
    expect(hasValidIntent(1000 + INTENT_TTL_MS + 1)).toBe(false);
  });

  it('is invalid for other versions', () => {
    localStorage.setItem(
      LEGAL_INTENT_KEY,
      JSON.stringify({ terms: '2000-01-01', privacy: PRIVACY_VERSION, at: Date.now() })
    );
    expect(hasValidIntent()).toBe(false);
  });

  it('clearIntent removes it', () => {
    recordIntent();
    clearIntent();
    expect(hasValidIntent()).toBe(false);
  });
});

describe('server calls', () => {
  it('reports current when the pair is on record', async () => {
    supa.rows = [{ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }];
    await expect(fetchAcceptances('u1')).resolves.toEqual({ current: true, hasPrior: true });
  });

  it('reports prior-only for an older pair', async () => {
    supa.rows = [{ terms_version: '2000-01-01', privacy_version: '2000-01-01' }];
    await expect(fetchAcceptances('u1')).resolves.toEqual({ current: false, hasPrior: true });
  });

  it('throws on a read error (e.g. the table is not deployed yet)', async () => {
    supa.selectError = { code: 'PGRST205', message: 'relation not found' };
    await expect(fetchAcceptances('u1')).rejects.toBeTruthy();
  });

  it('accepts the current pair through the RPC', async () => {
    await acceptCurrentTerms();
    expect(supa.rpc).toHaveBeenCalledWith('accept_legal_terms', {
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
    });
  });

  it('throws when the RPC fails', async () => {
    supa.rpcError = { message: 'offline' };
    await expect(acceptCurrentTerms()).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './legalAcceptance.js'`)

Run: `npx vitest run src/lib/legalAcceptance.test.js`

- [ ] **Step 3: Implement**

```js
// src/lib/legalAcceptance.js
// Versioned acceptance of the Terms and Privacy Policy — language-blind.
//
// The AUTHORITY is public.legal_acceptances (20260929120000), written only by
// the accept_legal_terms RPC as auth.uid(). The two localStorage keys here are
// hints: one lets a known device skip the network, the other carries a ticked
// box across an OAuth redirect. Neither can make anyone "accepted" on its own
// except the device that already saw the server confirm it.
import { getSupabase } from './auth.js';

/** Effective dates of the documents in src/components/legal. Bumping either re-asks everyone. */
export const TERMS_VERSION = '2026-09-29';
export const PRIVACY_VERSION = '2026-09-29';

export const LEGAL_ACCEPTED_KEY = 'deutsch-app-legal-accepted-v1';
export const LEGAL_INTENT_KEY = 'deutsch-app-legal-intent-v1';
export const INTENT_TTL_MS = 30 * 60 * 1000;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the server is still the record; we just re-check next time.
  }
}

const isCurrent = (v) => v?.terms === TERMS_VERSION && v?.privacy === PRIVACY_VERSION;

export function hintCovers(userId) {
  const hint = read(LEGAL_ACCEPTED_KEY);
  return Boolean(userId) && hint?.userId === userId && isCurrent(hint);
}

export function writeAcceptedHint(userId) {
  write(LEGAL_ACCEPTED_KEY, { userId, terms: TERMS_VERSION, privacy: PRIVACY_VERSION });
}

export function recordIntent(now = Date.now()) {
  write(LEGAL_INTENT_KEY, { terms: TERMS_VERSION, privacy: PRIVACY_VERSION, at: now });
}

export function clearIntent() {
  try {
    localStorage.removeItem(LEGAL_INTENT_KEY);
  } catch {
    // nothing to clear
  }
}

export function hasValidIntent(now = Date.now()) {
  const intent = read(LEGAL_INTENT_KEY);
  return isCurrent(intent) && typeof intent.at === 'number' && now - intent.at <= INTENT_TTL_MS;
}

async function client() {
  const c = await getSupabase();
  if (!c) throw new Error('No backend configured.');
  return c;
}

export async function fetchAcceptances(userId) {
  const c = await client();
  const { data, error } = await c
    .from('legal_acceptances')
    .select('terms_version, privacy_version')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = data ?? [];
  return {
    current: rows.some(
      (r) => r.terms_version === TERMS_VERSION && r.privacy_version === PRIVACY_VERSION
    ),
    hasPrior: rows.length > 0,
  };
}

export async function acceptCurrentTerms() {
  const c = await client();
  const { error } = await c.rpc('accept_legal_terms', {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/legalAcceptance.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/lib/legalAcceptance.js src/lib/legalAcceptance.test.js
git commit -m "feat(legal): acceptance versions, local hints and server calls"
```

---

### Task 4: `useLegalAcceptance(user)` hook

**Files:**

- Create: `src/lib/useLegalAcceptance.js`
- Create: `src/lib/useLegalAcceptance.test.js`

**Interfaces:**

- Consumes: everything Task 3 produces.
- Produces: `useLegalAcceptance(user: {id}|null) → { status: 'none'|'checking'|'accepted'|'required'|'unknown', hasPrior: boolean, accept: () => Promise<{ ok: boolean }> }`

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/useLegalAcceptance.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  accept: vi.fn(),
}));
vi.mock('./legalAcceptance.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAcceptances: (...a) => api.fetch(...a),
  acceptCurrentTerms: (...a) => api.accept(...a),
}));

import { useLegalAcceptance } from './useLegalAcceptance.js';
import { writeAcceptedHint, recordIntent, hasValidIntent, LEGAL_ACCEPTED_KEY } from './legalAcceptance.js';

const U = { id: 'u1' };

beforeEach(() => {
  localStorage.clear();
  api.fetch.mockReset().mockResolvedValue({ current: false, hasPrior: false });
  api.accept.mockReset().mockResolvedValue(undefined);
});

describe('useLegalAcceptance', () => {
  it('is none without a user and never calls the server', () => {
    const { result } = renderHook(() => useLegalAcceptance(null));
    expect(result.current.status).toBe('none');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('trusts a matching hint with no network (returning user, known device)', () => {
    writeAcceptedHint('u1');
    const { result } = renderHook(() => useLegalAcceptance(U));
    expect(result.current.status).toBe('accepted');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('accepts from the server on a new device and writes the hint', async () => {
    api.fetch.mockResolvedValue({ current: true, hasPrior: true });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(localStorage.getItem(LEGAL_ACCEPTED_KEY)).toContain('u1');
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('consumes a valid intent: records and accepts, no gate', async () => {
    recordIntent();
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(api.accept).toHaveBeenCalledTimes(1);
    expect(hasValidIntent()).toBe(false);
  });

  it('requires acceptance with no record and no intent (OAuth from a sign-in surface)', async () => {
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(result.current.hasPrior).toBe(false);
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('ignores an expired intent', async () => {
    recordIntent(Date.now() - 31 * 60 * 1000);
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('flags an older acceptance as hasPrior (updated terms)', async () => {
    api.fetch.mockResolvedValue({ current: false, hasPrior: true });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(result.current.hasPrior).toBe(true);
  });

  it('goes unknown on a read error — never accepted, never required', async () => {
    api.fetch.mockRejectedValue({ code: 'PGRST205' });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('unknown'));
  });

  it('retries when the browser comes back online', async () => {
    api.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ current: true, hasPrior: true });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('unknown'));
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
  });

  it('releases a second tab when the first writes the hint', async () => {
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    writeAcceptedHint('u1');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LEGAL_ACCEPTED_KEY })));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
  });

  it('accept() records and flips to accepted', async () => {
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    let outcome;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.status).toBe('accepted');
  });

  it('accept() reports failure and stays required', async () => {
    api.accept.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    let outcome;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.status).toBe('required');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/useLegalAcceptance.test.js`

- [ ] **Step 3: Implement**

```js
// src/lib/useLegalAcceptance.js
import { useState, useEffect, useCallback } from 'react';
import {
  LEGAL_ACCEPTED_KEY,
  hintCovers,
  writeAcceptedHint,
  hasValidIntent,
  clearIntent,
  fetchAcceptances,
  acceptCurrentTerms,
} from './legalAcceptance.js';

/**
 * Where the signed-in account stands on the current Terms + Privacy versions.
 *
 *   none      no account — guests never touch any of this
 *   checking  asking the server
 *   accepted  on record (or this device already saw the server confirm it)
 *   required  no record for the current versions — App shows AcceptanceGate
 *   unknown   could not ask (offline, or the table is not deployed). Fails
 *             safe: App treats it like 'checking' — local practice only, no
 *             sync, no gate — and it retries on `online`.
 */
function initial(userId) {
  if (!userId) return { status: 'none', hasPrior: false };
  return hintCovers(userId) ? { status: 'accepted', hasPrior: true } : { status: 'checking', hasPrior: false };
}

export function useLegalAcceptance(user) {
  const userId = user?.id ?? null;
  const [state, setState] = useState(() => initial(userId));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState(initial(userId));
    if (!userId || hintCovers(userId)) return undefined;
    let active = true;
    const settle = (next) => active && setState(next);
    (async () => {
      try {
        const { current, hasPrior } = await fetchAcceptances(userId);
        if (current) {
          writeAcceptedHint(userId);
          return settle({ status: 'accepted', hasPrior: true });
        }
        if (hasValidIntent()) {
          await acceptCurrentTerms();
          clearIntent();
          writeAcceptedHint(userId);
          return settle({ status: 'accepted', hasPrior: true });
        }
        clearIntent();
        return settle({ status: 'required', hasPrior });
      } catch {
        return settle({ status: 'unknown', hasPrior: false });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  // Offline → retry when the network is back. Another tab accepted → re-check.
  useEffect(() => {
    if (!userId) return undefined;
    const retry = () => setAttempt((n) => n + 1);
    const onStorage = (e) => e.key === LEGAL_ACCEPTED_KEY && retry();
    window.addEventListener('online', retry);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const accept = useCallback(async () => {
    try {
      await acceptCurrentTerms();
      clearIntent();
      writeAcceptedHint(userId);
      setState({ status: 'accepted', hasPrior: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }, [userId]);

  return { ...state, accept };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/useLegalAcceptance.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/lib/useLegalAcceptance.js src/lib/useLegalAcceptance.test.js
git commit -m "feat(legal): useLegalAcceptance hook — accepted/required/unknown"
```

---

### Task 5: `LegalConsent` checkbox component

**Files:**

- Create: `src/components/auth/LegalConsent.jsx`
- Create: `src/components/auth/LegalConsent.test.jsx`

**Interfaces:**

- Produces: `<LegalConsent checked onChange(bool) invalid onNavigate(path) focusOnMount />`. `onNavigate` receives `'/terms'` or `'/privacy'` on a plain left click only.

- [ ] **Step 1: Write the failing tests**

```jsx
// src/components/auth/LegalConsent.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LegalConsent from './LegalConsent';

const LABEL = /I agree to the Terms of Service and acknowledge the Privacy Policy/;

describe('LegalConsent', () => {
  it('is a real, unchecked checkbox with an associated label', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} />);
    const box = screen.getByRole('checkbox', { name: LABEL });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('data-ui');
  });

  it('toggles from the keyboard', async () => {
    const onChange = vi.fn();
    render(<LegalConsent checked={false} onChange={onChange} onNavigate={() => {}} />);
    screen.getByRole('checkbox').focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('links to /terms and /privacy, each its own tab stop, without toggling', async () => {
    const onChange = vi.fn();
    const onNavigate = vi.fn();
    render(<LegalConsent checked={false} onChange={onChange} onNavigate={onNavigate} />);
    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(privacy).toHaveAttribute('href', '/privacy');
    await userEvent.tab();
    await userEvent.tab();
    expect(terms).toHaveFocus();
    await userEvent.tab();
    expect(privacy).toHaveFocus();
    await userEvent.click(terms);
    expect(onNavigate).toHaveBeenCalledWith('/terms');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves modifier clicks to the browser', async () => {
    const onNavigate = vi.fn();
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={onNavigate} />);
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('describes the error in text, not colour alone', () => {
    render(<LegalConsent checked={false} invalid onChange={() => {}} onNavigate={() => {}} />);
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/^Required:/);
    expect(box).toHaveAttribute('aria-describedby', alert.id);
  });

  it('keeps a 44px tap row even when the label wraps', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} />);
    const row = screen.getByRole('checkbox').closest('[data-consent-row]');
    expect(row).toHaveStyle({ minHeight: '44px' });
  });

  it('can take focus on mount (returning from a legal page)', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} focusOnMount />);
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/auth/LegalConsent.test.jsx`

- [ ] **Step 3: Implement**

```jsx
// src/components/auth/LegalConsent.jsx
import { useEffect, useId, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, SPACE } from '../../lib/theme';
import { Body } from '../ui/Text';

/** Minimum comfortable touch target, px — same constant WelcomeGate uses. */
const TAP_TARGET_MIN = 44;

/**
 * The account-terms checkbox. Copy is owner-approved legal copy (spec §5.3) —
 * reproduce, don't edit. A native checkbox + <label for>, so keyboard, screen
 * readers and a tap on the words all work without help. The links sit INSIDE
 * the label: activating a link follows it and does not toggle the box.
 *
 * Links navigate in-app (onNavigate → App.openLegal, pushState) on a plain
 * click, so the reader sees the bundled text — the version being accepted —
 * and the draft in App survives. Modifier clicks keep the browser default.
 */
export default function LegalConsent({ checked, onChange, invalid = false, onNavigate, focusOnMount = false }) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputRef = useRef(null);

  // An effect, not autoFocus: provider buttons in the same sheet autoFocus
  // during commit, and effects run after, so this wins when it should.
  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = (label, to) => (
    <a
      href={to}
      data-ui="link"
      style={{ color: COLORS.ink, textDecoration: 'underline' }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.(to);
      }}
    >
      {label}
    </a>
  );

  return (
    <div>
      <div
        data-consent-row=""
        style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE[3], minHeight: TAP_TARGET_MIN, minWidth: 0 }}
      >
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          data-ui="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={invalid ? errorId : undefined}
          style={{ width: 20, height: 20, margin: `${SPACE[1]}px 0 0`, flex: 'none', accentColor: COLORS.accent }}
        />
        <label
          htmlFor={id}
          style={{ fontFamily: FONTS.body, fontSize: FONT_SIZE.sm, color: COLORS.ink, minWidth: 0, overflowWrap: 'break-word' }}
        >
          I agree to the {link('Terms of Service', '/terms')} and acknowledge the{' '}
          {link('Privacy Policy', '/privacy')}.
        </label>
      </div>
      {invalid && (
        <Body id={errorId} role="alert" size="sm" tone="error" style={{ display: 'flex', gap: SPACE[2], marginTop: SPACE[2] }}>
          <AlertCircle size={16} aria-hidden="true" style={{ flex: 'none' }} />
          Required: tick the box to agree to the Terms of Service and acknowledge the Privacy Policy.
        </Body>
      )}
    </div>
  );
}
```

Check before committing: `COLORS.accent`, `FONT_SIZE.sm` and `TONE.error` exist in `src/lib/theme.js` / `src/components/ui/tone.js`; if `FONT_SIZE.sm` is named differently, use the token `Body size="sm"` resolves to. Run `npm run lint` — if `react-hooks/exhaustive-deps` is not an active rule, drop the disable comment.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/components/auth/LegalConsent.test.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/LegalConsent.jsx src/components/auth/LegalConsent.test.jsx
git commit -m "feat(auth): LegalConsent checkbox with in-app legal links"
```

---

### Task 6: `MagicLinkForm` — lifted draft and a start guard

**Files:**

- Modify: `src/components/auth/MagicLinkForm.jsx`
- Modify: `src/components/auth/MagicLinkForm.test.jsx`

**Interfaces:**

- Produces: `<MagicLinkForm heading onSuccess draft? onDraftChange? beforeStart? />`
  - `draft: { email: string, sent: boolean }` — controlled when given, local state otherwise (existing tests keep working).
  - `onDraftChange(patch: Partial<{email, sent}>)`.
  - `beforeStart(): boolean` — called before **send, resend and verify**; `false` aborts with no network call.

- [ ] **Step 1: Write the failing tests** (append to `MagicLinkForm.test.jsx`; it already mocks `../../lib/auth.js` with `signInWithMagicLink` / `verifyCode` spies — reuse those names)

```jsx
describe('MagicLinkForm — consent guard and lifted draft', () => {
  it('does not send when beforeStart refuses', async () => {
    render(<MagicLinkForm heading="Create your account" onSuccess={() => {}} beforeStart={() => false} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: /email me a sign-in code/i }));
    expect(signInWithMagicLink).not.toHaveBeenCalled();
  });

  it('sends when beforeStart allows', async () => {
    render(<MagicLinkForm heading="Create your account" onSuccess={() => {}} beforeStart={() => true} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.click(screen.getByRole('button', { name: /email me a sign-in code/i }));
    expect(signInWithMagicLink).toHaveBeenCalledWith('a@b.co');
  });

  it('re-checks before verifying the code', async () => {
    const beforeStart = vi.fn(() => true);
    render(
      <MagicLinkForm heading="x" onSuccess={() => {}} beforeStart={beforeStart} draft={{ email: 'a@b.co', sent: true }} onDraftChange={() => {}} />
    );
    beforeStart.mockReturnValue(false);
    await userEvent.type(screen.getByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));
    expect(verifyCode).not.toHaveBeenCalled();
  });

  it('renders from a lifted draft and reports edits upward', async () => {
    const onDraftChange = vi.fn();
    render(<MagicLinkForm heading="x" onSuccess={() => {}} draft={{ email: 'kept@b.co', sent: false }} onDraftChange={onDraftChange} />);
    expect(screen.getByLabelText('Email')).toHaveValue('kept@b.co');
    await userEvent.type(screen.getByLabelText('Email'), 'x');
    expect(onDraftChange).toHaveBeenLastCalledWith({ email: 'kept@b.cox' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/auth/MagicLinkForm.test.jsx`

- [ ] **Step 3: Implement** — replace the `sent`/`email` state and the three handlers:

```jsx
export default function MagicLinkForm({ heading, onSuccess, draft, onDraftChange, beforeStart = () => true }) {
  // Controlled when App passes a draft — it must survive a trip to /terms, which
  // unmounts this form (spec §6.6). Uncontrolled otherwise.
  const [localDraft, setLocalDraft] = useState({ email: '', sent: false });
  const { email, sent } = draft ?? localDraft;
  const update = onDraftChange ?? ((patch) => setLocalDraft((d) => ({ ...d, ...patch })));
  const setEmail = (value) => update({ email: value });
  const [code, setCode] = useState('');
  // …error / busy / cooldown state unchanged…

  const send = async () => {
    if (busy || !beforeStart()) return;
    setBusy(true);
    setError('');
    const { error: e } = await signInWithMagicLink(email.trim());
    setBusy(false);
    if (e) setError(humanAuthError(e));
    else update({ sent: true });
  };

  const resend = async () => {
    if (busy || resendCooldown > 0 || !beforeStart()) return;
    // …body unchanged…
  };

  const verify = async () => {
    if (busy || !beforeStart()) return;
    // …body unchanged…
  };
```

The email `<input>` keeps `value={email}` and `onChange={(e) => setEmail(e.target.value)}`; the `sent` branch now reads the lifted `sent`.

- [ ] **Step 4: Run — expect PASS (old and new tests)**

Run: `npx vitest run src/components/auth/MagicLinkForm.test.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/MagicLinkForm.jsx src/components/auth/MagicLinkForm.test.jsx
git commit -m "feat(auth): MagicLinkForm takes a lifted draft and a start guard"
```

---

### Task 7: `AuthSheet` — consent on the create sheet

**Files:**

- Modify: `src/components/auth/AuthSheet.jsx`
- Modify: `src/components/auth/AuthSheet.test.jsx`

**Interfaces:**

- Consumes: `LegalConsent` (Task 5), `MagicLinkForm` draft API (Task 6), `recordIntent` / `clearIntent` (Task 3).
- Produces: new AuthSheet props `draft: {email, sent, accepted}`, `onDraftChange(patch)`, `onNavigateLegal(path)`, `focusConsent: boolean`. `onGoogle` / `onGitHub` are only called after consent passes on the create sheet.

- [ ] **Step 1: Write the failing tests** (in `AuthSheet.test.jsx`; the file mocks `MagicLinkForm` — change the mock to expose `beforeStart`: `default: function MockForm({ heading, beforeStart }) { return <button data-testid="magic-link-form" onClick={() => beforeStart?.()}>{heading}</button>; }`, and add `recordIntent`/`clearIntent` spies via `vi.mock('../../lib/legalAcceptance.js', …)`)

```jsx
describe('AuthSheet — terms consent', () => {
  const draft = { email: '', sent: false, accepted: false };

  it('create sheet shows the unchecked consent; sign-in sheet does not', () => {
    const { rerender } = render(<AuthSheet open intent="create" draft={draft} onDraftChange={() => {}} onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /i agree/i })).not.toBeChecked();
    rerender(<AuthSheet open intent="signin" draft={draft} onDraftChange={() => {}} onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('unchecked: Google does not start, error shown, focus on the box', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    const onGoogle = vi.fn();
    render(<AuthSheet open intent="create" draft={draft} onDraftChange={() => {}} onGoogle={onGoogle} onClose={() => {}} onSuccess={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(onGoogle).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
    expect(screen.getByRole('checkbox')).toHaveFocus();
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it('checked: Google starts and the intent is recorded', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    const onGoogle = vi.fn();
    render(<AuthSheet open intent="create" draft={{ ...draft, accepted: true }} onDraftChange={() => {}} onGoogle={onGoogle} onClose={() => {}} onSuccess={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });

  it('unchecked: the email path is refused too', async () => {
    render(<AuthSheet open intent="create" draft={draft} onDraftChange={() => {}} onClose={() => {}} onSuccess={() => {}} />);
    await userEvent.click(screen.getByTestId('magic-link-form'));
    expect(recordIntent).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('sign-in sheet clears any stale intent and never blocks', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    const onGoogle = vi.fn();
    render(<AuthSheet open intent="signin" draft={draft} onDraftChange={() => {}} onGoogle={onGoogle} onClose={() => {}} onSuccess={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(clearIntent).toHaveBeenCalled();
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });

  it('ticking the box reports upward', async () => {
    const onDraftChange = vi.fn();
    render(<AuthSheet open intent="create" draft={draft} onDraftChange={onDraftChange} onClose={() => {}} onSuccess={() => {}} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onDraftChange).toHaveBeenCalledWith({ accepted: true });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/auth/AuthSheet.test.jsx`

- [ ] **Step 3: Implement** — inside `AuthSheet`, add props with defaults (`draft = EMPTY`, `onDraftChange = () => {}`, `onNavigateLegal`, `focusConsent = false`) and:

```jsx
import LegalConsent from './LegalConsent';
import { recordIntent, clearIntent } from '../../lib/legalAcceptance.js';

const EMPTY = { email: '', sent: false, accepted: false };

  const creating = intent === 'create';
  const [consentInvalid, setConsentInvalid] = useState(false);

  // One guard for every way to start an account flow from this sheet. On the
  // create sheet it refuses until the box is ticked and records the intent the
  // session-side hook consumes; on the sign-in sheet it clears any stale intent
  // so an abandoned create can never be credited to a later sign-in.
  const guard = () => {
    if (!creating) {
      clearIntent();
      return true;
    }
    if (!draft.accepted) {
      setConsentInvalid(true);
      sheetRef.current?.querySelector('input[type="checkbox"]')?.focus();
      return false;
    }
    recordIntent();
    return true;
  };
  const guarded = (fn) => () => guard() && fn?.();
```

Render `LegalConsent` at the top of the dialog body (above the provider block) when `creating`:

```jsx
{creating && (
  <div style={{ maxWidth: 360, margin: `0 auto ${SPACE[4]}px` }}>
    <LegalConsent
      checked={draft.accepted}
      onChange={(accepted) => {
        setConsentInvalid(false);
        onDraftChange({ accepted });
      }}
      invalid={consentInvalid}
      onNavigate={onNavigateLegal}
      focusOnMount={focusConsent}
    />
  </div>
)}
```

Pass `onClick={guarded(onGoogle)}` / `onClick={guarded(onGitHub)}` to the provider buttons, and `draft`, `onDraftChange`, `beforeStart={guard}` to `MagicLinkForm`. Reset `consentInvalid` to `false` when `open` flips true (same `wasOpenRef` render pass that captures the opener).

- [ ] **Step 4: Run — expect PASS (old and new tests)**

Run: `npx vitest run src/components/auth/AuthSheet.test.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/AuthSheet.jsx src/components/auth/AuthSheet.test.jsx
git commit -m "feat(auth): require terms consent on the create-account sheet"
```

---

### Task 8: `TrialWall` — consent on its provider buttons

**Files:**

- Modify: `src/components/TrialWall.jsx`
- Modify: `src/components/TrialWall.test.jsx`

**Interfaces:**

- Consumes: `LegalConsent`, `recordIntent`.
- Produces: TrialWall props `accepted: boolean`, `onAcceptedChange(bool)`, `onNavigateLegal(path)`, `focusConsent: boolean`. `onGoogle` / `onGitHub` fire only when `accepted`. "Create a free account" and "Sign in" are unchanged (the sheet they open has its own rule).

- [ ] **Step 1: Write the failing tests** (mock `../lib/auth.js` so `isGoogleAuthConfigured` returns true, and `../lib/legalAcceptance.js` with a `recordIntent` spy)

```jsx
describe('TrialWall — terms consent', () => {
  const base = { roundsUsed: 12, onCreateAccount: () => {}, onSignIn: () => {}, onNavigateLegal: () => {} };

  it('shows the unchecked consent above the provider button', () => {
    render(<TrialWall {...base} accepted={false} onAcceptedChange={() => {}} onGoogle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /i agree/i })).not.toBeChecked();
  });

  it('unchecked: Google does not start and the error is shown', async () => {
    const onGoogle = vi.fn();
    render(<TrialWall {...base} accepted={false} onAcceptedChange={() => {}} onGoogle={onGoogle} />);
    await userEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(onGoogle).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
  });

  it('checked: Google starts and the intent is recorded', async () => {
    const onGoogle = vi.fn();
    render(<TrialWall {...base} accepted onAcceptedChange={() => {}} onGoogle={onGoogle} />);
    await userEvent.click(screen.getByRole('button', { name: /google/i }));
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });

  it('Sign in stays one tap and never needs the box', async () => {
    const onSignIn = vi.fn();
    render(<TrialWall {...base} onSignIn={onSignIn} accepted={false} onAcceptedChange={() => {}} onGoogle={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/TrialWall.test.jsx`

- [ ] **Step 3: Implement** — below the "Create a free account to keep going…" paragraph, when `providerOn`:

```jsx
{providerOn && (
  <LegalConsent
    checked={accepted}
    onChange={(next) => {
      setConsentInvalid(false);
      onAcceptedChange(next);
    }}
    invalid={consentInvalid}
    onNavigate={onNavigateLegal}
    focusOnMount={focusConsent}
  />
)}
```

with `const [consentInvalid, setConsentInvalid] = useState(false);` and

```jsx
const startProvider = (fn) => () => {
  if (!accepted) {
    setConsentInvalid(true);
    return;
  }
  recordIntent();
  fn?.();
};
```

Pass `onClick={startProvider(onGoogle)}` / `onClick={startProvider(onGitHub)}` to the provider buttons. Keep `autoFocus` where it is. (Only rendered when a provider is on: with no provider the wall's only account action is the create sheet, which carries its own consent.)

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/components/TrialWall.test.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/TrialWall.jsx src/components/TrialWall.test.jsx
git commit -m "feat(trial): require terms consent before provider sign-up on the wall"
```

---

### Task 9: `AcceptanceGate` — the post-sign-in gate

> If the owner picks **D2 (a)**, drop the "Delete this account instead" block and its two tests.

**Files:**

- Create: `src/components/auth/AcceptanceGate.jsx`
- Create: `src/components/auth/AcceptanceGate.test.jsx`

**Interfaces:**

- Consumes: `LegalConsent`, `useFocusTrap`, `Button`, `Heading`, `Body`.
- Produces: `<AcceptanceGate hasPrior accepted onAcceptedChange(bool) onContinue(): Promise<{ok}> onSignOut() onDelete?(phrase): Promise<void> onNavigateLegal(path) focusConsent />`

- [ ] **Step 1: Write the failing tests**

```jsx
// src/components/auth/AcceptanceGate.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcceptanceGate from './AcceptanceGate';

const props = (over = {}) => ({
  hasPrior: false,
  accepted: false,
  onAcceptedChange: vi.fn(),
  onContinue: vi.fn(async () => ({ ok: true })),
  onSignOut: vi.fn(),
  onDelete: vi.fn(async () => {}),
  onNavigateLegal: vi.fn(),
  ...over,
});

describe('AcceptanceGate', () => {
  it('asks a new account for "One more step"', () => {
    render(<AcceptanceGate {...props()} />);
    expect(screen.getByRole('alertdialog', { name: 'One more step' })).toBeInTheDocument();
  });

  it('tells an older acceptance the terms were updated', () => {
    render(<AcceptanceGate {...props({ hasPrior: true })} />);
    expect(screen.getByRole('alertdialog', { name: "We've updated our terms" })).toBeInTheDocument();
  });

  it('unchecked: Continue refuses with a text error', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
  });

  it('checked: Continue records', async () => {
    const p = props({ accepted: true });
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('a failed save says so and stays', async () => {
    const p = props({ accepted: true, onContinue: vi.fn(async () => ({ ok: false })) });
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
  });

  it('Sign out declines', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('is not dismissible with Escape', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(p.onSignOut).not.toHaveBeenCalled();
  });

  it('delete needs the typed phrase', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this account instead/i }));
    const confirm = screen.getByRole('button', { name: /delete account/i });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type DELETE to confirm/i), 'DELETE');
    await userEvent.click(confirm);
    expect(p.onDelete).toHaveBeenCalledWith('DELETE');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/auth/AcceptanceGate.test.jsx`

- [ ] **Step 3: Implement**

```jsx
// src/components/auth/AcceptanceGate.jsx
import { useEffect, useId, useRef, useState } from 'react';
import { COLORS, RADIUS, SHADOW, SPACE, BORDER, FONTS, FONT_SIZE } from '../../lib/theme';
import useFocusTrap from '../../lib/useFocusTrap.js';
import Button from '../ui/Button';
import Heading from '../ui/Heading';
import { Body } from '../ui/Text';
import LegalConsent from './LegalConsent';

const DELETE_PHRASE = 'DELETE';

/**
 * Shown while a signed-in account has no acceptance record for the current
 * Terms + Privacy versions (useLegalAcceptance → 'required'). Copy is spec §5.4.
 * Not dismissible — like the callback error panel and the trial wall, its
 * actions are the way out: accept, sign out, or delete the account (the only
 * route to erasure for someone who will not accept, since Settings is behind
 * this gate).
 */
export default function AcceptanceGate({
  hasPrior,
  accepted,
  onAcceptedChange,
  onContinue,
  onSignOut,
  onDelete,
  onNavigateLegal,
  focusConsent = false,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');

  useFocusTrap(panelRef, true);
  useEffect(() => {
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
  }, []);

  const title = hasPrior ? "We've updated our terms" : 'One more step';
  const body = hasPrior
    ? 'Please review and accept the updated Terms of Service and Privacy Policy to keep using your account.'
    : 'Before you continue, please review and accept our Terms of Service and Privacy Policy.';

  const handleContinue = async () => {
    if (!accepted) {
      setInvalid(true);
      panelRef.current?.querySelector('input[type="checkbox"]')?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    const { ok } = await onContinue();
    setBusy(false);
    if (!ok) setFailed(true);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE[6],
        boxSizing: 'border-box',
        background: COLORS.scrim,
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          background: COLORS.paper,
          color: COLORS.ink,
          borderRadius: RADIUS.xl,
          padding: SPACE[6],
          maxWidth: 400,
          width: '100%',
          minWidth: 0,
          boxShadow: SHADOW.bar,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE[4],
        }}
      >
        <Heading level={2} size="lg" id={titleId}>
          {title}
        </Heading>
        <Body>{body}</Body>
        <LegalConsent
          checked={accepted}
          onChange={(next) => {
            setInvalid(false);
            onAcceptedChange(next);
          }}
          invalid={invalid}
          onNavigate={onNavigateLegal}
          focusOnMount={focusConsent}
        />
        {failed && (
          <Body role="alert" size="sm" tone="error">
            Couldn’t save your acceptance. Check your connection and try again.
          </Body>
        )}
        <Button onClick={handleContinue} busy={busy}>
          Continue
        </Button>
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
        {onDelete &&
          (!deleting ? (
            <button
              type="button"
              data-ui="button"
              onClick={() => setDeleting(true)}
              style={{ background: 'none', border: 'none', color: COLORS.ink, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONTS.body, fontSize: FONT_SIZE.sm, minHeight: 44 }}
            >
              Delete this account instead
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
              <Body size="sm">
                Type <strong>{DELETE_PHRASE}</strong> to confirm. This permanently deletes the account.
              </Body>
              <input
                aria-label={`Type ${DELETE_PHRASE} to confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                style={{ padding: '12px 14px', border: BORDER.standard, borderRadius: RADIUS.md, background: COLORS.card, color: COLORS.ink, fontFamily: FONTS.mono }}
              />
              <Button variant="danger" disabled={typed.trim() !== DELETE_PHRASE} onClick={() => onDelete(DELETE_PHRASE)}>
                Delete account
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
}
```

Before committing: confirm `Heading` forwards `id` (else wrap the title in an element with `id={titleId}`), that `BUTTON.danger` exists (AccountSection's delete button shows which variant to use — copy it), and that `Z` in theme has a slot above the callback landing (use it instead of the literal `80` if so).

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/components/auth/AcceptanceGate.test.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/AcceptanceGate.jsx src/components/auth/AcceptanceGate.test.jsx
git commit -m "feat(auth): AcceptanceGate for accounts without a current acceptance"
```

---

### Task 10: Wire it into `App.jsx` (gating, draft, decline, callback errors)

**Files:**

- Modify: `src/App.jsx`
- Modify: `src/components/auth/AuthCallbackLanding.jsx` (clear intent on error)
- Modify: `src/components/auth/AuthCallbackLanding.test.jsx`
- Modify: `src/App.test.jsx`

**Interfaces:**

- Consumes: Tasks 3–9.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing App tests**

At the top of `src/App.test.jsx`, next to the other hoisted mocks — defaulting to `'accepted'` so every existing test keeps its meaning:

```jsx
const legalMock = vi.hoisted(() => ({
  status: 'accepted',
  hasPrior: true,
  accept: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./lib/useLegalAcceptance', () => ({
  useLegalAcceptance: (user) =>
    user ? { status: legalMock.status, hasPrior: legalMock.hasPrior, accept: legalMock.accept } : { status: 'none', hasPrior: false, accept: legalMock.accept },
}));
```

Reset `legalMock.status = 'accepted'; legalMock.hasPrior = true;` in the file's existing `beforeEach`. Then add:

```jsx
describe('terms acceptance gate', () => {
  beforeEach(() => {
    authMock.configured = true;
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    syncMock.enabled = true;
  });

  it('holds sync, progress flush and league reads while acceptance is required', async () => {
    legalMock.status = 'required';
    legalMock.hasPrior = false;
    render(<App />);
    expect(await screen.findByRole('alertdialog', { name: 'One more step' })).toBeInTheDocument();
    expect(syncMock.start).not.toHaveBeenCalled();
    expect(progressFlushMock.start).not.toHaveBeenCalled();
    expect(leagueStandingMock.calls.every((id) => id == null)).toBe(true);
  });

  it('holds everything while the check is unknown, and shows no gate', () => {
    legalMock.status = 'unknown';
    render(<App />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(syncMock.start).not.toHaveBeenCalled();
    expect(progressFlushMock.start).not.toHaveBeenCalled();
  });

  it('starts sync once accepted (returning user: no gate)', async () => {
    legalMock.status = 'accepted';
    render(<App />);
    await waitFor(() => expect(syncMock.start).toHaveBeenCalledWith('u1'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('declining on a device that never synced keeps guest progress', async () => {
    legalMock.status = 'required';
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ srs: { k: { box: 2 } } }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(authSignOutMock).toHaveBeenCalled();
    expect(localStorage.getItem('deutsch-app-state-v1')).toContain('"box":2');
  });

  it('the gate links reach /terms and come back to a still-ticked box', async () => {
    legalMock.status = 'required';
    render(<App />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back to the app/i }));
    const box = await screen.findByRole('checkbox', { name: /i agree/i });
    expect(box).toBeChecked();
    expect(box).toHaveFocus();
  });
});

describe('create sheet keeps its draft across the legal pages', () => {
  beforeEach(() => {
    authMock.configured = true;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
  });

  it('email, tick and intent survive a trip to /privacy', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await userEvent.type(screen.getByLabelText('Email'), 'kept@b.co');
    await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back to the app/i }));
    expect(await screen.findByRole('dialog', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('kept@b.co');
    expect(screen.getByRole('checkbox', { name: /i agree/i })).toBeChecked();
  });

  it('dismissing the sheet clears the tick and the intent (no false acceptance)', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('button', { name: /close sign-in/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('checkbox', { name: /i agree/i })).not.toBeChecked();
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).toBeNull();
  });
});

describe('guest mode is unchanged by the terms work', () => {
  beforeEach(() => {
    authMock.configured = true;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
  });

  it('"Try it first — free" needs no checkbox and enters the app', async () => {
    render(<App />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /try it first/i }));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(syncMock.start).not.toHaveBeenCalled();
  });

  it('legal pages render on a cold load while signed out', () => {
    window.history.replaceState(null, '', '/terms');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    window.history.replaceState(null, '', '/#/privacy');
    render(<App />);
    expect(screen.getAllByRole('heading', { level: 1, name: 'Privacy Policy' }).length).toBeGreaterThan(0);
    window.history.replaceState(null, '', '/');
  });
});
```

The existing `guest trial wall`, `entry gate`, `sync engine wiring` and `progress flush wiring` blocks must pass **unchanged** — they are the guest non-regression proof. Do not edit them.

In `AuthCallbackLanding.test.jsx`, add (mocking `../../lib/legalAcceptance.js` with a `clearIntent` spy):

```jsx
it('an error callback clears any pending terms intent', () => {
  window.history.replaceState(null, '', '/?error=access_denied');
  render(<AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />);
  expect(clearIntent).toHaveBeenCalled();
  window.history.replaceState(null, '', '/');
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/App.test.jsx src/components/auth/AuthCallbackLanding.test.jsx`

- [ ] **Step 3: Implement in `App.jsx`**

Imports:

```js
import { useLegalAcceptance } from './lib/useLegalAcceptance';
import { recordIntent, clearIntent } from './lib/legalAcceptance';
import { loadSyncMeta } from './lib/sync/syncMeta';
import AcceptanceGate from './components/auth/AcceptanceGate';
```

Replace `const { user, status: authStatus, signupRejected } = useAuth();` with:

```js
  // Auth, gated on the terms (spec §6.4). Every consumer below — sync, the
  // progress flush, leagues, admin, push, the level boost, the trial wall and
  // the entry gate — reads the GATED values, so a signed-in account with no
  // acceptance record for the current versions behaves like a session that is
  // still restoring: nothing reaches the server until the record exists.
  const rawAuth = useAuth();
  const legal = useLegalAcceptance(rawAuth.user);
  const legalAccepted = legal.status === 'accepted';
  const user = legalAccepted ? rawAuth.user : null;
  const authStatus = rawAuth.user ? (legalAccepted ? 'authenticated' : 'loading') : rawAuth.status;
  const { signupRejected } = rawAuth;
```

Draft state, next to `authModal`:

```js
  const EMPTY_AUTH_DRAFT = { email: '', sent: false, accepted: false };
  const [authDraft, setAuthDraft] = useState(EMPTY_AUTH_DRAFT);
  const patchAuthDraft = (patch) => setAuthDraft((d) => ({ ...d, ...patch }));
  const closeAuthSheet = () => {
    setAuthModal(null);
    setAuthDraft(EMPTY_AUTH_DRAFT);
    clearIntent();
  };
```

`handleAuthDone` also calls `setAuthDraft(EMPTY_AUTH_DRAFT)`. `AuthSheet`'s `onClose` becomes `closeAuthSheet`.

OAuth entry points — the welcome screen's buttons are sign-in surfaces (D3), the create sheet and trial wall are create surfaces (their components already recorded the intent after consent):

```js
  const handleGoogle = () => {
    clearIntent();
    return startOAuth('google', signInWithGoogle);
  };
  const handleGitHub = () => {
    clearIntent();
    return startOAuth('github', signInWithGitHub);
  };
  const handleGoogleCreate = () => startOAuth('google', signInWithGoogle);
  const handleGitHubCreate = () => startOAuth('github', signInWithGitHub);
```

`WelcomeGate` keeps `handleGoogle`/`handleGitHub`. `AuthSheet` gets `onGoogle={authModal === 'create' ? handleGoogleCreate : handleGoogle}` (same for GitHub). `TrialWall` gets `handleGoogleCreate`/`handleGitHubCreate`. (AuthSheet's own guard already clears the intent on the sign-in sheet; `handleGoogle` clearing it again is harmless.)

Legal navigation from a consent control, with focus return:

```js
  const [focusConsent, setFocusConsent] = useState(false);
  const openLegalFromConsent = (to) => {
    setFocusConsent(true);
    openLegal(to);
  };
  // The consent control has mounted (and taken focus) in the commit that closed
  // the legal page; clear the flag so later renders do not steal focus again.
  useEffect(() => {
    if (!legalRoute && focusConsent) setFocusConsent(false);
  }, [legalRoute, focusConsent]);
```

Pass `onNavigateLegal={openLegalFromConsent}`, `focusConsent={focusConsent}` to `AuthSheet`, `TrialWall` and `AcceptanceGate`; pass `draft={authDraft}` and `onDraftChange={patchAuthDraft}` to `AuthSheet`; pass `accepted={authDraft.accepted}` and `onAcceptedChange={(accepted) => patchAuthDraft({ accepted })}` to `TrialWall` and `AcceptanceGate`.

Decline — keep guest progress when this device never synced the account:

```js
  // A device that has never completed a reconcile for this session still holds
  // only guest data (sync waits for acceptance), so a plain sign-out keeps it.
  // One that has synced holds the account's data and gets the full reset any
  // sign-out gets.
  const leaveAccount = () => (loadSyncMeta().lastSyncedAt ? signOutAndReset() : signOut());
```

`handleDelete` gains an optional second argument and ends with `await after();`:

```js
  const handleDelete = async (confirm, { after = signOutAndReset } = {}) => {
    // …body unchanged, except the final line:
    await after();
  };
```

Add the gate to `authOverlay` (so it renders in the gate, placement and main branches; legal routes still return first):

```jsx
      {rawAuth.user && legal.status === 'required' && (
        <AcceptanceGate
          hasPrior={legal.hasPrior}
          accepted={authDraft.accepted}
          onAcceptedChange={(accepted) => patchAuthDraft({ accepted })}
          onContinue={async () => {
            const result = await legal.accept();
            if (result.ok) setAuthDraft(EMPTY_AUTH_DRAFT);
            return result;
          }}
          onSignOut={leaveAccount}
          onDelete={(phrase) => handleDelete(phrase, { after: leaveAccount })}
          onNavigateLegal={openLegalFromConsent}
          focusConsent={focusConsent}
        />
      )}
```

`AuthCallbackLanding` keeps `status={rawAuth.status}` (unchanged success/timeout behaviour). Import `signOut` from `./lib/auth` if App does not already. `recordIntent` is not used by App directly — remove it from the import if lint flags it.

- [ ] **Step 4: Implement in `AuthCallbackLanding.jsx`**

```js
import { clearIntent } from '../../lib/legalAcceptance.js';
// …
  // A failed or cancelled callback ends the flow a ticked box was for. The
  // intent must not outlive it and be credited to some later sign-in.
  useEffect(() => {
    if (phase === 'error') clearIntent();
  }, [phase]);
```

- [ ] **Step 5: Run — expect PASS, then the full suite**

Run: `npx vitest run src/App.test.jsx src/components/auth/AuthCallbackLanding.test.jsx` → PASS
Run: `npm test` → PASS (every pre-existing test unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.test.jsx src/components/auth/AuthCallbackLanding.jsx src/components/auth/AuthCallbackLanding.test.jsx
git commit -m "feat(auth): gate synced use on a current terms acceptance"
```

---

### Task 11: Approved legal copy

> The owner approved spec §5.1/§5.2 **as written** on 2026-09-29, with the D7
> values filled in, and on 2026-09-30 changed the brand to `sprachschule-app`
> and the contact email to `sprachschule.support@gmail.com` (spec §7 "Owner
> update"). The code below is that approved text — reproduce it verbatim. The
> optional §5.2 "8. AI-Generated Content" clause was approved with the rest, so
> it ships. The brand change also rewrites three sentences in the EXISTING
> Terms (intro, §3, §5) — spec §5.2 lists them verbatim.

**Files:**

- Modify: `src/components/legal/LegalPage.jsx` (items without a term; paragraphs after a list)
- Modify: `src/components/legal/LegalPage.test.jsx`
- Modify: `src/components/legal/PrivacyPolicy.jsx`, `PrivacyPolicy.test.jsx`
- Modify: `src/components/legal/TermsOfService.jsx`, `TermsOfService.test.jsx`
- Modify: `src/lib/legalAcceptance.js`, `src/lib/legalAcceptance.test.js` (add `lastUpdatedLine`; the version constants already hold `'2026-09-29'`)

**Interfaces:**

- Consumes: `TERMS_VERSION`, `PRIVACY_VERSION`.
- Produces: `LegalPage` section shape `{ heading, paragraphs?, items?: {term?, text}[], after?: string[] }`; `lastUpdatedLine(version: 'YYYY-MM-DD') → 'Last Updated: <Month> <D>, <YYYY>'`.

- [ ] **Step 1: Write the failing tests**

`legalAcceptance.test.js` — add:

```js
import { lastUpdatedLine } from './legalAcceptance.js';

describe('lastUpdatedLine', () => {
  it('spells the effective date out in full', () => {
    expect(lastUpdatedLine('2026-09-29')).toBe('Last Updated: September 29, 2026');
  });

  it('does not zero-pad the day and never shifts it with the time zone', () => {
    expect(lastUpdatedLine('2027-01-05')).toBe('Last Updated: January 5, 2027');
  });
});
```

`LegalPage.test.jsx`:

```jsx
it('renders a term-less item and paragraphs after the list', () => {
  render(
    <LegalPage
      title="T"
      updated="U"
      sections={[{ heading: 'H', items: [{ text: 'plain item' }], after: ['closing words'] }]}
    />
  );
  const item = screen.getByText('plain item');
  expect(item.tagName).toBe('LI');
  expect(item.querySelector('strong')).toBeNull();
  expect(item.compareDocumentPosition(screen.getByText('closing words')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
```

`PrivacyPolicy.test.jsx` — replace the heading-list and verbatim tests:

```jsx
import { PRIVACY_VERSION } from '../../lib/legalAcceptance';

it('shows the effective date, derived from PRIVACY_VERSION', () => {
  expect(PRIVACY_VERSION).toBe('2026-09-29');
  render(<PrivacyPolicy />);
  expect(screen.getByText('Last Updated: September 29, 2026')).toBeInTheDocument();
});

it('carries the nine numbered sections, in order', () => {
  render(<PrivacyPolicy />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    '1. Who We Are',
    '2. Information We Collect',
    '3. How We Use Your Information',
    '4. What Other Learners Can See',
    '5. Service Providers',
    '6. How Long We Keep Your Data',
    '7. Exporting and Deleting Your Data',
    '8. Your Choices',
    '9. Changes to This Policy',
  ]);
});

it('ships no unfilled placeholder', () => {
  const { container } = render(<PrivacyPolicy />);
  expect(container.textContent).not.toMatch(/\[|\]/);
});

it('carries the current brand and contact, never the old ones', () => {
  const { container } = render(<PrivacyPolicy />);
  expect(container.textContent).not.toMatch(/Deutsch App/);
  expect(container.textContent).not.toMatch(/esterkinshimon712@gmail\.com/);
  expect(container.textContent).toMatch(/sprachschule\.support@gmail\.com/);
});

it('no longer makes the two claims the audit disproved', () => {
  const { container } = render(<PrivacyPolicy />);
  expect(container.textContent).not.toMatch(/scrubbed of personally identifiable information/);
  expect(container.textContent).not.toMatch(/performance monitoring\)/);
});

it('reproduces the approved copy verbatim', () => {
  render(<PrivacyPolicy />);
  for (const phrase of [
    'You can use sprachschule-app without an account.',
    'sprachschule-app is operated by Shimon Esterkin.',
    'contact us at sprachschule.support@gmail.com.',
    'is sent through our server to Anthropic, which generates the response.',
    'We do not send your name, email address or account ID with these requests.',
    'We configure Sentry not to attach your account ID or email address',
    'These tools do not use cookies.',
    'Apple Push Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on Android)',
    'Push notifications are optional',
    'a copy can remain in our database until your account is deleted.',
    'We do not sell your data or use it for targeted advertising.',
  ]) {
    expect(screen.getByText(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
  }
});
```

`TermsOfService.test.jsx` — replace the heading-list and verbatim tests (keep the file's other tests):

```jsx
import { TERMS_VERSION } from '../../lib/legalAcceptance';

it('shows the effective date, derived from TERMS_VERSION', () => {
  expect(TERMS_VERSION).toBe('2026-09-29');
  render(<TermsOfService />);
  expect(screen.getByText('Last Updated: September 29, 2026')).toBeInTheDocument();
});

it('carries the eight numbered sections, in order', () => {
  render(<TermsOfService />);
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
    '1. Eligibility',
    '2. User Accounts',
    '3. App Usage and Leagues',
    '4. User-Generated Content',
    '5. "As Is" Disclaimer',
    '6. Changes to These Terms',
    '7. Privacy',
    '8. AI-Generated Content',
  ]);
});

it('never names the old brand', () => {
  const { container } = render(<TermsOfService />);
  expect(container.textContent).not.toMatch(/Deutsch App/);
});

it('reproduces the approved copy verbatim', () => {
  render(<TermsOfService />);
  for (const phrase of [
    'By accessing or using sprachschule-app, you agree to be bound by these Terms of Service.',
    'You must be at least 13 years old to use this app. By creating an account, you confirm that you meet this age requirement.',
    'sprachschule-app includes gamified elements like Leagues and Streaks.',
    'sprachschule-app is currently in a pre-beta stage.',
    'We may update these Terms. When we do, we will update the "Last Updated" date',
    'Our Privacy Policy explains how we collect and use your information.',
    'sprachschule-app uses artificial intelligence to generate tutor replies, answer feedback and practice content. AI-generated content can be inaccurate.',
  ]) {
    expect(screen.getByText(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
  }
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/legal`

- [ ] **Step 3: Implement**

`legalAcceptance.js` — add, next to the version constants:

```js
/**
 * The page's "Last Updated" line, from a document version: '2026-09-29' →
 * 'Last Updated: September 29, 2026'. Derived, never typed, so the copy and the
 * version that re-asks acceptance cannot drift. UTC, so the day is the same in
 * every reader's time zone.
 */
export function lastUpdatedLine(version) {
  const date = new Date(`${version}T00:00:00Z`);
  const text = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return `Last Updated: ${text}`;
}
```

`LegalPage.jsx` — item key and term are optional; `after` renders below the list:

```jsx
                {section.items.map((item) => (
                  <Body as="li" key={item.term ?? item.text} style={{ color: COLORS.ink }}>
                    {item.term && <strong>{item.term}</strong>} {item.text}
                  </Body>
                ))}
              </Stack>
            )}
            {(section.after ?? []).map((text) => (
              <Body key={text}>{text}</Body>
            ))}
```

`PrivacyPolicy.jsx` — `updated` derives from the version; `SECTIONS` is §5.1:

```jsx
import LegalPage from './LegalPage';
import { PRIVACY_VERSION, lastUpdatedLine } from '../../lib/legalAcceptance';

const SECTIONS = [
  {
    heading: '1. Who We Are',
    paragraphs: [
      'sprachschule-app is operated by Shimon Esterkin. If you have questions about this policy or your data, contact us at sprachschule.support@gmail.com.',
    ],
  },
  {
    heading: '2. Information We Collect',
    items: [
      { term: 'Using the App as a Guest:', text: 'You can use sprachschule-app without an account. As a guest, your learning progress is stored only on your device and is not synced to our servers.' },
      { term: 'Account Information:', text: 'When you create an account or sign in — with a one-time email code or link, with Google, or with GitHub — we collect your email address to authenticate you and keep your progress in sync across devices. If you sign in with Google or GitHub, that service also shares the basic profile details it makes available to apps, such as your name, profile picture link and, for GitHub, your username; our authentication provider stores them with your account. For security, it also records technical information about each sign-in, such as your IP address and browser or device type. We also record which versions of our Terms of Service and this Privacy Policy you accepted, and when.' },
      { term: 'Profile Information:', text: 'Your account has a handle (username), created automatically when you sign up, which you can change. You can also add your first, middle and last name and a profile picture, and choose whether your profile is private.' },
      { term: 'Learning Data:', text: 'We store your vocabulary progress, exercise results, daily activity, streaks, XP, custom decks, preferences (such as your level, daily goal and interests) and in-app token history locally on your device. When you are signed in, we sync this data to our cloud database.' },
      { term: 'AI Features:', text: 'When you use an AI-powered feature — chatting with the tutor, having a written answer checked, generating practice sentences or creating a custom deck — the text you enter, together with the exercise or conversation context needed to respond, is sent through our server to Anthropic, which generates the response. We do not send your name, email address or account ID with these requests.' },
      { term: 'Voice Input:', text: "If you use voice input, speech recognition is performed by your browser or your device's operating system, which may send your audio to its provider (such as Google or Apple) under that provider's terms. The app receives only the resulting text." },
      { term: 'Problem Reports:', text: 'If you report a problem with an exercise, we store your message together with details of the exercise (such as the level, deck and item) and, if you are signed in, your account ID.' },
      { term: 'Error Reports:', text: 'When the website encounters an error, it sends a report to Sentry with technical details such as the error message, recent app events leading up to it, the page address, your browser type, language and time zone. We configure Sentry not to attach your account ID or email address, and we remove cookies and web-address parameters that could contain sign-in credentials before a report is sent. Sentry receives your IP address when a report is sent and may use it to estimate your approximate location. Sentry also receives an anonymous signal when the app starts, which we use to measure how often sessions end in an error.' },
      { term: 'Website Analytics:', text: 'On the website, we use Vercel Web Analytics and Vercel Speed Insights to understand how the site is used and how quickly it loads, such as pages visited, the referring site, device and browser type, approximate country and page-load measurements. These tools do not use cookies.' },
      { term: 'Usage Limits:', text: 'To protect the service from abuse, our server records your IP address (for AI features) or your account ID (for account features) together with a count of recent requests.' },
      { term: 'Push Notifications (mobile app only):', text: "If you turn on push notifications, the app obtains a notification token for your device from Apple Push Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on Android) and stores it in our database, together with your device's platform and a link to your account, so that we can send you streak reminders and league updates." },
    ],
  },
  {
    heading: '3. How We Use Your Information',
    paragraphs: [
      "Your data is used to provide the app's features: saving and syncing your progress, placing you in weekly leagues (Leagues), showing your profile to other learners, powering AI features, sending notifications you have turned on, fixing bugs, and protecting the service from abuse. We do not sell your data or use it for targeted advertising.",
    ],
  },
  {
    heading: '4. What Other Learners Can See',
    paragraphs: [
      'If you have an account, other signed-in learners in your league can see your handle, profile picture and weekly XP. Signed-in learners can also find you by name or handle, follow you, and view your profile: your name, handle, profile picture, the year you joined and your learning statistics (such as total XP, longest streak, league results, achievements and follower counts). If you make your profile private, you are hidden from search and your profile shows only your name, handle and profile picture. Profile pictures are stored at hard-to-guess web addresses that anyone who has the address can open.',
    ],
  },
  {
    heading: '5. Service Providers',
    paragraphs: ['We rely on the following services to run the app. They process data on our behalf:'],
    items: [
      { term: 'Supabase —', text: 'authentication, database and file storage' },
      { term: 'Vercel —', text: 'hosting the website and our server, and website analytics' },
      { term: 'Anthropic —', text: 'AI tutor responses, answer checking and practice content' },
      { term: 'Sentry —', text: 'error reports' },
      { term: 'Supabase Auth —', text: 'sending sign-in emails' },
    ],
    after: [
      'If you choose to use them, these services also receive data under their own privacy policies: Google or GitHub (if you sign in with them), and Apple Push Notification service or Firebase Cloud Messaging by Google (if you turn on push notifications).',
    ],
  },
  {
    heading: '6. How Long We Keep Your Data',
    items: [
      { text: "Guest data stays on your device until you clear the app's data or sign in, at which point it is added to your account." },
      { text: "Signing out removes your account's data from that device; only your light/dark theme choice stays." },
      { text: 'Account data — including your email, profile, learning data, problem reports, notification tokens and acceptance records — is kept until you delete your account.' },
      { text: 'Usage-limit records are overwritten as you make new requests; they are not currently deleted on a fixed schedule.' },
      { text: "Error reports, website analytics and data processed by our service providers are kept for limited periods under those providers' retention settings." },
    ],
  },
  {
    heading: '7. Exporting and Deleting Your Data',
    paragraphs: [
      "You can download a copy of your learning data, and permanently delete your account, in the app under Profile → Settings → Account controls. Deleting your account immediately and permanently removes your account and the data linked to it in our database, including your learning data, profile, problem reports, notification tokens and acceptance records. We also delete the profile pictures you uploaded; if any remain afterwards, contact us and we will remove them. Copies may remain for a limited time in our service providers' backups and logs. Problem reports you sent as a guest and error reports are not linked to your account.",
    ],
  },
  {
    heading: '8. Your Choices',
    items: [
      { term: 'Push notifications are optional', text: "and are not required to use the app. You can turn them off at any time in the app (Settings → Notifications) or in your device's settings." },
      { text: "When you turn notifications off in the app or sign out, the app deletes your device's notification token from our database and deactivates it on your device. If the app cannot reach our servers at that moment, the token is still deactivated on your device, but a copy can remain in our database until your account is deleted. If you turn notifications off in your device's settings instead, the app removes the token from our database the next time you open it while signed in. Deleting your account always deletes all of your notification tokens." },
      { text: 'You can edit your name, handle and profile picture, and make your profile private, in Settings.' },
    ],
  },
  {
    heading: '9. Changes to This Policy',
    paragraphs: [
      'When we change this policy, we will update the "Last Updated" date above. If the changes are significant, we will ask you to review and accept the updated policy in the app before you continue using your account.',
    ],
  },
];

export default function PrivacyPolicy({ onBack }) {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={lastUpdatedLine(PRIVACY_VERSION)}
      intro="Welcome to sprachschule-app. This Privacy Policy explains how we collect, use, and protect your information when you use our application."
      sections={SECTIONS}
      onBack={onBack}
    />
  );
}
```

(The spec's "**Push notifications are optional** and are not required…" bold lead is carried by the `term`.) The D7 values are already filled in; the "no unfilled placeholder" test guards against regressions.

`TermsOfService.jsx` — `updated={lastUpdatedLine(TERMS_VERSION)}` (import both from `../../lib/legalAcceptance`). Apply the brand update to the three existing sentences exactly as spec §5.2 lists them:

- `intro` → `By accessing or using sprachschule-app, you agree to be bound by these Terms of Service.`
- section 3 paragraph → `sprachschule-app includes gamified elements like Leagues and Streaks. We reserve the right to reset, modify, or adjust league standings, points, or progression logic at any time, especially during this pre-beta phase, to ensure a fair experience for all users.`
- section 5 paragraph → `sprachschule-app is currently in a pre-beta stage. The service is provided "AS IS" and "AS AVAILABLE," without warranties of any kind.`

Update the file's header comment so it says the copy is owner-supplied with the 2026-09-30 brand update. Then append the approved sections:

```jsx
  {
    heading: '6. Changes to These Terms',
    paragraphs: [
      'We may update these Terms. When we do, we will update the "Last Updated" date and, for significant changes, ask you to accept the updated Terms before you continue using your account.',
    ],
  },
  {
    heading: '7. Privacy',
    paragraphs: ['Our Privacy Policy explains how we collect and use your information.'],
  },
  {
    heading: '8. AI-Generated Content',
    paragraphs: [
      'sprachschule-app uses artificial intelligence to generate tutor replies, answer feedback and practice content. AI-generated content can be inaccurate.',
    ],
  },
```

`TERMS_VERSION` / `PRIVACY_VERSION` in `src/lib/legalAcceptance.js` already hold `'2026-09-29'` (Task 3) — confirm, do not change.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/components/legal src/lib/legalAcceptance.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/components/legal src/lib/legalAcceptance.js src/lib/legalAcceptance.test.js
git commit -m "docs(legal): owner-approved Privacy Policy and Terms, dated from their versions"
```

---

### Task 12: Push disclosure before the opt-in

**Files:**

- Modify: `src/lib/pushNotifications.js` (export `nativePlatform`)
- Modify: `src/lib/pushNotifications.test.js`
- Modify: `src/components/settings/NotificationsSection.jsx`
- Modify: `src/components/settings/NotificationsSection.test.jsx`

**Interfaces:**

- Produces: `export function nativePlatform(): 'ios' | 'android' | null` (already exists, module-private today).

- [ ] **Step 1: Write the failing tests**

`NotificationsSection.test.jsx` (it mocks `usePushNotifications`; add `vi.mock('../../lib/pushNotifications', async (o) => ({ ...(await o()), nativePlatform: () => platform.value }))` with a hoisted `platform = { value: 'ios' }`):

```jsx
describe('push disclosure', () => {
  it('shows the disclosure before any tap, and asks nothing on render', () => {
    render(<NotificationsSection userId="u1" />);
    expect(screen.getByText(/save a notification token for this device to your account/i)).toBeInTheDocument();
    expect(screen.getByText(/optional — the app works the same without them/i)).toBeInTheDocument();
    expect(hook.enable).not.toHaveBeenCalled();
  });

  it('names APNs on iOS and FCM on Android', () => {
    platform.value = 'ios';
    const { unmount } = render(<NotificationsSection userId="u1" />);
    expect(screen.getByText(/Apple Push Notification service/)).toBeInTheDocument();
    unmount();
    platform.value = 'android';
    render(<NotificationsSection userId="u1" />);
    expect(screen.getByText(/Firebase Cloud Messaging by Google/)).toBeInTheDocument();
  });

  it('the disclosure precedes the switch in reading order', () => {
    render(<NotificationsSection userId="u1" />);
    const text = screen.getByText(/save a notification token/i);
    const toggle = screen.getByRole('button', { name: /push notifications/i });
    expect(text.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('only the tap enables', async () => {
    render(<NotificationsSection userId="u1" />);
    await userEvent.click(screen.getByRole('button', { name: /push notifications: off/i }));
    expect(hook.enable).toHaveBeenCalledTimes(1);
  });
});
```

`pushNotifications.test.js` (if not already pinned):

```js
it('resumePushRegistration never requests permission', async () => {
  // …arrange a stored device for 'u1' and a plugin mock whose checkPermissions
  // returns 'prompt', as the file's existing resume tests do…
  await resumePushRegistration('u1');
  expect(plugin.requestPermissions).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/components/settings/NotificationsSection.test.jsx src/lib/pushNotifications.test.js`

- [ ] **Step 3: Implement**

`pushNotifications.js`: change `function nativePlatform()` to `export function nativePlatform()`.

`NotificationsSection.jsx`: replace the single "Streak reminders…" `Body` with the approved §5.5 text:

```jsx
import { usePushNotifications } from '../../lib/usePushNotifications';
import { nativePlatform } from '../../lib/pushNotifications';

const PUSH_SERVICE = {
  ios: 'Apple Push Notification service',
  android: 'Firebase Cloud Messaging by Google',
};

// …inside the component, before the Button:
      <Body size="sm" tone="soft" style={{ marginBottom: SPACE[3], overflowWrap: 'break-word' }}>
        Get streak reminders and league updates on this device. If you turn this on, we’ll ask for
        your permission, then save a notification token for this device to your account.
        Notifications are delivered through {PUSH_SERVICE[nativePlatform()] ?? PUSH_SERVICE.ios}.
        They’re optional — the app works the same without them — and you can turn them off here or
        in your device’s settings at any time.
      </Body>
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/components/settings/NotificationsSection.test.jsx src/lib/pushNotifications.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/lib/pushNotifications.js src/lib/pushNotifications.test.js src/components/settings/NotificationsSection.jsx src/components/settings/NotificationsSection.test.jsx
git commit -m "feat(push): just-in-time disclosure before the notification opt-in"
```

---

### Task 15: Owner-update gate — canonical brand across config and docs

> Owner brief `.superpowers/sdd/2026-09-29-store-legal-consent/owner-update-brief.md`
> (2026-09-30). Executes right after Task 3, before Task 4, as ONE commit with
> subject `chore(brand): apply canonical store legal identity`, which also carries
> the controller's already-made spec and plan edits. Declarative names and
> human-facing brand copy only — every identifier in Global Constraints stays.

**Files:**

- Modify: `package.json` (`name`), `package-lock.json` (root `"name"` and `packages[""].name` only — never `npm install`)
- Modify: `capacitor.config.ts` (`appName` only)
- Modify: `ios/App/App/Info.plist` (`CFBundleDisplayName` only)
- Modify: `android/app/src/main/res/values/strings.xml` (`app_name`, `title_activity_main` only)
- Modify: `index.html` (`<title>`, `apple-mobile-web-app-title`, `description`, and the `og:` / `twitter:` title, site-name and description tags that name the product)
- Modify: `vite.config.js` (PWA `manifest.name`, `manifest.short_name` only)
- Modify: `supabase/config.toml` (`[auth.email.template.magic_link] subject` only), `supabase/templates/magic_link.html` (product name in `<title>` and body)
- Modify: `store-metadata/app-store-listing.md` (root; EN + HE, both stores — brand mentions and the counts beside them; the search keyword `deutsch` stays), `docs/api/README.md` (H1)
- Modify: `docs/NATIVE_BUILD.md`, `docs/MOBILE_AUTH_SETUP.md`, `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`, `docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`, `docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`, `docs/MAINTENANCE_CHECKLIST.md`, `docs/store-metadata/app-store-listing.md`, `src/lib/theme.js` (header comment only)
- Create: `src/lib/nativeDisplayName.test.js`
- Include (already edited by the controller, do not rewrite): the spec and this plan

**Must NOT change:** `appId` / `package_name` / `custom_url_scheme` (`com.sprachschule.deutsch`); any URL (incl. `deutsch-app-dusky.vercel.app`, `og:url`, `og:image`, canonical); any localStorage key; env var names; the in-app "Deutsch." wordmark in `src/components`; `public/social-preview.png`; `README.md`; `docs/AUDIT_GERMAN_COUPLING.md` and every historical spec/plan; any `esterkinshimon712@gmail.com` use (all remaining ones are admin/allowlist/test identity).

**Interfaces:** none.

- [ ] **Step 1: Pre-check** — nothing reads the npm package name, and `src/brandAssets.test.js` expectations are known:

Run: `rg -n "npm_package_name|package\.json" vite.config.js scripts api src --glob '!**/*.test.*'` and `rg -n "og:title|og:site_name|<title>|apple-mobile-web-app-title" src/brandAssets.test.js`.
If a reader of the package name changes behaviour, STOP and report NEEDS_CONTEXT. If `brandAssets.test.js` pins the old titles, update those expectations in the same commit.

- [ ] **Step 2: Write the failing test**

```js
// src/lib/nativeDisplayName.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The name people see under the icon, in the tab and on install. `cap sync`
// does not copy capacitor.config.ts's appName into ios/ or android/ after
// `cap add`, so these drift unless something pins them together. The bundle
// ID is an identity, not a name: a new one is a new app in both stores.
const read = (path) => readFileSync(path, 'utf8');

describe('declared app name', () => {
  it('capacitor.config.ts', () => {
    expect(read('capacitor.config.ts')).toMatch(/appName:\s*'sprachschule-app'/);
  });

  it('iOS CFBundleDisplayName', () => {
    expect(read('ios/App/App/Info.plist')).toMatch(
      /<key>CFBundleDisplayName<\/key>\s*<string>sprachschule-app<\/string>/
    );
  });

  it('Android app_name and activity title', () => {
    const xml = read('android/app/src/main/res/values/strings.xml');
    expect(xml).toMatch(/<string name="app_name">sprachschule-app<\/string>/);
    expect(xml).toMatch(/<string name="title_activity_main">sprachschule-app<\/string>/);
  });

  it('web title and PWA manifest', () => {
    expect(read('index.html')).toMatch(/<title>sprachschule-app<\/title>/);
    expect(read('vite.config.js')).toMatch(/\bname:\s*'sprachschule-app'/);
    expect(read('vite.config.js')).toMatch(/short_name:\s*'sprachschule-app'/);
  });

  it('npm package name', () => {
    expect(JSON.parse(read('package.json')).name).toBe('sprachschule-app');
  });

  it('keeps the bundle / application ID', () => {
    expect(read('capacitor.config.ts')).toMatch(/appId:\s*'com\.sprachschule\.deutsch'/);
    expect(read('android/app/src/main/res/values/strings.xml')).toMatch(
      /<string name="package_name">com\.sprachschule\.deutsch<\/string>/
    );
  });
});
```

- [ ] **Step 3: Run — expect FAIL** (the bundle-ID test already passes)

Run: `npx vitest run src/lib/nativeDisplayName.test.js`

- [ ] **Step 4: Rename** — replace the product name with `sprachschule-app` in each listed spot. The product has appeared as "Deutsch App", "Deutsch · Sprachschule", "Deutsch. Sprachschule" and (as a name, not the language) "Deutsch.". Keep surrounding sentences; e.g. `Your sign-in code for Deutsch · Sprachschule` → `Your sign-in code for sprachschule-app`; the App Store listing's App Name → `**sprachschule-app**`, its alternates line → `Set by the owner on 2026-09-30; matches the home-screen display name.`, and its description's `Deutsch puts you…` / `Deutsch turns a few minutes…` → `sprachschule-app puts you…` / `sprachschule-app turns a few minutes…`. Run the listing's character-limit check (bottom of that file) and paste the output in the report.

- [ ] **Step 5: Verify**

- `rg -n "esterkinshimon712" docs/superpowers/specs/2026-09-29-store-legal-consent-design.md docs/superpowers/plans/2026-09-29-store-legal-consent.md` → only lines that describe it as the admin/allowlist identity (or the struck-through superseded answer).
- `rg -n "esterkinshimon712" api src .env.example docs/PRE_BETA_OWNER_CHECKLIST.md docs/api` → unchanged admin/allowlist/test uses.
- `rg -n "Deutsch App|Deutsch · Sprachschule|Deutsch\. Sprachschule"` over the Files list → no hits.
- `npx vitest run src/lib/nativeDisplayName.test.js src/lib/buildMobileScript.test.js src/brandAssets.test.js` → PASS; `npx prettier --write <changed files>`; `npm run format:check` → clean.

- [ ] **Step 6: Commit** (normal hook, never `--no-verify`)

```bash
git add <every file above, never ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/>
git commit -m "chore(brand): apply canonical store legal identity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Owner checklist for store submission

**Files:**

- Create: `docs/STORE_SUBMISSION_CHECKLIST.md`
- Modify: `docs/BACKLOG.md` (one pointer line in the owner-actions list)
- Modify: `docs/MOBILE_PUSH_SETUP.md` §4 (flip note) and §5 (point at the checklist; the policy copy now exists)

**Interfaces:** none.

- [ ] **Step 1: Write the checklist**

```markdown
# Store submission — owner checklist (sprachschule-app)

> **RELEASE GATE — do this before merging or deploying the terms-acceptance
> client.** Apply `supabase/migrations/20260929120000_legal_acceptances.sql` to
> the production Supabase project (item 1). Until the table exists, the client
> cannot confirm anyone's acceptance and every signed-in learner's sync pauses.
> The migration file being merged is NOT the migration being applied.

Code alone does not make the app compliant. Each item below needs an account or
a judgement only the owner has. Tick them in order: several gate the next.

## Before merging the terms-acceptance PR

1. **Apply `supabase/migrations/20260929120000_legal_acceptances.sql` to
   production FIRST.** Dashboard SQL editor on Sprachschule
   (`xcnnlczvxmuwcqwychox`). Never `db push`, `migration repair` or MCP
   `apply_migration`. If the client ships first, every signed-in learner's
   sync pauses (the app cannot confirm acceptance) until the table exists.
   Verify: `select count(*) from public.legal_acceptances;` returns 0 without
   error, then `notify pgrst, 'reload schema';`.
2. **Keep the email-provider line true.** The policy names Supabase Auth as the
   sender of sign-in emails (owner answer, 2026-09-29, re-confirmed
   2026-09-30). If a custom SMTP provider is ever configured under Supabase →
   Auth → SMTP Settings, add it to the policy's service-provider list and bump
   `PRIVACY_VERSION`.
3. **Have qualified counsel review** the final Privacy Policy and Terms,
   including international transfers, the minimum age (Terms say 13), and
   whether the optional AI clause is wanted.

## Store listings

4. **App Store Connect → App Privacy → Privacy Policy URL:**
   `https://deutsch-app-dusky.vercel.app/privacy`.
5. **Google Play Console → App content → Privacy policy:** same URL.
6. **Google Play → Data safety → account deletion URL:** a public page that
   explains how to delete an account (section 7 of `/privacy` does; Play may
   also ask for a way to request deletion without the app — the contact email
   covers it).
7. **Apple App Privacy answers** and **8. Google Data Safety answers** — draft
   below, taken from the audit in
   `docs/superpowers/specs/2026-09-29-store-legal-consent-design.md` §3. Check
   every line against the build you submit: the native app today has **no
   Sentry DSN** and **no Vercel Analytics**; if either changes, so do the
   answers.

| Data                                   | Collected by the native app? | Linked to identity | Purpose                      | Notes                                          |
| -------------------------------------- | ---------------------------- | ------------------ | ---------------------------- | ---------------------------------------------- |
| Email address                          | Yes                          | Yes                | App functionality            | Sign-in                                        |
| Name                                   | Yes (optional)               | Yes                | App functionality            | Profile; OAuth providers also share one        |
| Photos (profile picture)               | Yes (optional)               | Yes                | App functionality            | Public bucket, unguessable URL                 |
| User ID                                | Yes                          | Yes                | App functionality            |                                                |
| Other user content (problem reports)   | Yes                          | Yes when signed in | App functionality            |                                                |
| Text sent to AI features               | Sent to Anthropic via our server | No identifiers sent | App functionality     | Counsel: "collected" vs processed in real time |
| Product interaction / learning progress | Yes                         | Yes                | App functionality            | Synced when signed in                          |
| Device ID / push token                 | Only if push is enabled      | Yes                | App functionality            | Declare once push ships                        |
| Crash data                             | No (web only today)          | —                  | —                            | Re-answer if a DSN is added to native builds   |
| Audio                                  | Not by us                    | —                  | —                            | OS speech recognition; see item 11             |

## Before turning push on

9. Push is pinned **off** in `build:mobile`. Also remove
   `VITE_PUSH_ENABLED=true` from your local `.env.production.local`.
   Turn it on only when all of these are done: `user_devices` migration applied
   (`docs/MOBILE_PUSH_SETUP.md` §1); Firebase and APNs set up (§2–§3); the
   approved policy and disclosure are live; the on-device check in
   `docs/MOBILE_PUSH_SETUP.md` passes on a real iPhone and Android device. Then
   change the pin to `true`, rebuild, and update the App Privacy / Data Safety
   answers for the push token.

## Worth doing, not blocking

10. Sentry → Project Settings → Security & Privacy → **Prevent Storing of IP
    Addresses**.
11. Verify voice input in the native app. If the microphone prompt can appear,
    add `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`
    to `ios/App/App/Info.plist` and declare Audio Data.
12. Confirm Vercel still documents Web Analytics and Speed Insights as
    cookieless (the policy says so).
13. Decide whether GitHub sign-in should be on for the web
    (`VITE_GITHUB_AUTH_ENABLED` is unset in Vercel Production; the policy
    mentions GitHub because the apps use it).
14. Decide whether the in-app "Deutsch." wordmark and the rendered
    `public/social-preview.png` follow the new name. Both were left alone on
    purpose: the wordmark sits in a header whose 320px budget has ~10px of
    slack, so a longer name is a layout change, not a rename.
15. Update the production-side copies of the brand (owner-only settings; the
    repo copies are already renamed): Supabase → Auth → Email Templates →
    Magic Link subject and body (paste from `supabase/config.toml` and
    `supabase/templates/magic_link.html`, `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`);
    the Google OAuth consent-screen app name
    (`docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`); the GitHub OAuth application name
    (`docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`); and the App Store Connect / Play
    Console app name.

## Identifiers that keep the old name (by design)

The product is `sprachschule-app`, and the contact address is
`sprachschule.support@gmail.com`. These stable identifiers were NOT renamed,
because renaming them needs a migration or infrastructure change:

| Identifier | Value | Why it stays |
| --- | --- | --- |
| GitHub repository | `blackhebrewisraeli/deutsch-app` | Remotes, CI, Sonar, Vercel link |
| Vercel project / URL | `deutsch-app-dusky.vercel.app` | Supabase redirect allow-list, `build:mobile`, policy URL in the stores |
| Supabase project | `Sprachschule` (`xcnnlczvxmuwcqwychox`) | Project ref is baked into every client |
| Bundle / application ID, URL scheme | `com.sprachschule.deutsch` | Changing it makes a different app in both stores and breaks the auth callback |
| localStorage keys | `deutsch-app-*` (incl. `deutsch-app-legal-*`) | AGENTS.md: never rename or migrate a storage key |
| Admin / allowlist identity | `esterkinshimon712@gmail.com` | Authorization, not contact — `api/_lib/roles.js` |
| Sentry project | `javascript-react` (org `blackhebrewisraeli`) | Event history and alert rules |
```

- [ ] **Step 2: Pointers**

`docs/BACKLOG.md`, owner-actions list: `- **Store submission:** work through docs/STORE_SUBMISSION_CHECKLIST.md — item 1 (apply legal_acceptances) must happen before the terms PR merges.`

`docs/MOBILE_PUSH_SETUP.md` §5: replace the body with `The push wording is in the Privacy Policy (section 2, "Push Notifications") and in the Settings disclosure. Follow docs/STORE_SUBMISSION_CHECKLIST.md item 9 before turning push on.`

`docs/MOBILE_PUSH_SETUP.md` §4 (deferred minor from Task 1): add one sentence after the flip instruction — `Flip it in a release commit, only for a build machine that has google-services.json, and update src/lib/buildMobileScript.test.js in the same commit (it pins =false on purpose).`

`docs/BACKLOG.md` owner action #13 (deferred minor from Task 1): it still says to set `VITE_PUSH_ENABLED=true` in `.env.production.local`, which the `build:mobile` pin now overrides. Replace that instruction with `follow docs/MOBILE_PUSH_SETUP.md §4 and docs/STORE_SUBMISSION_CHECKLIST.md item 9`.

- [ ] **Step 3: Format and commit**

Run: `npx prettier --write docs/STORE_SUBMISSION_CHECKLIST.md docs/BACKLOG.md docs/MOBILE_PUSH_SETUP.md && npm run format:check`

```bash
git add docs/STORE_SUBMISSION_CHECKLIST.md docs/BACKLOG.md docs/MOBILE_PUSH_SETUP.md
git commit -m "docs: store-submission owner checklist"
```

---

### Task 14: Verification

**Files:** none (evidence goes in the PR body).

- [ ] **Step 1:** `npm test` → all pass. `npm run lint` → clean. `npm run format:check` → clean.
- [ ] **Step 2:** With Docker: `supabase start && supabase db reset --local && npm run test:rls` → all pass. Without Docker: say so in the PR.
- [ ] **Step 3: Browser pass** (`preview_start` the Vite dev server from `.claude/launch.json`; local `.env` points at the local stack, so sign-in needs `supabase start`):
  - At **375px** and **320px**: WelcomeGate (no checkbox, "Try it first — free" works), create sheet (consent row wraps without horizontal scroll: `document.documentElement.scrollWidth - document.documentElement.clientWidth === 0`), trial wall with a provider on, AcceptanceGate.
  - Keyboard only: Tab reaches checkbox → Terms link → Privacy link → first provider; Space toggles; focus ring visible on each.
  - Create sheet: type email, tick, open Privacy, Back → email + tick intact, focus on the checkbox.
  - Cold load `/terms`, `/privacy`, `/#/terms` signed out.
  - Screenshot each surface for the PR.
- [ ] **Step 4:** Confirm nothing touched production: `git diff origin/main --stat` shows only the files in this plan; no MCP write tools were called.
- [ ] **Step 5:** Open the PR with the owner-action order spelled out (migration first), and the premise findings P1–P13 from the spec.

---

## Self-review notes

- Owner update 2026-09-30 → Global Constraints (brand, contact email, preserved identifiers), Task 11 (copy + tests), Task 13 (release-gate banner, identifiers table, carried minors), Task 15 (native display names, package name, store listing).
- Spec §6.2 → Task 2; §6.1/§6.3 → Task 3; §6.4 → Tasks 4 + 10; §6.5 → Tasks 5, 7, 8, 9; §6.6 → Tasks 6, 7, 10; §6.7 rows → Task 4 (intent/hint/unknown/versions) and Task 10 (decline, dismiss, callback error, returning user); §6.8 → Task 10 guest block + untouched existing suites; §6.9 → Tasks 1, 12; §5 copy → Tasks 5, 9, 11, 12; checklist → Task 13; §6.10 table → Task 14 plus each task's tests.
- D1 (a) needs no code: existing accounts simply have no row, so the hook reports `required` on their next launch.
- Names used across tasks: `recordIntent`, `clearIntent`, `hasValidIntent`, `hintCovers`, `writeAcceptedHint`, `fetchAcceptances`, `acceptCurrentTerms`, `useLegalAcceptance → { status, hasPrior, accept }`, `LegalConsent({ checked, onChange, invalid, onNavigate, focusOnMount })`, `AcceptanceGate({ hasPrior, accepted, onAcceptedChange, onContinue, onSignOut, onDelete, onNavigateLegal, focusConsent })`.
