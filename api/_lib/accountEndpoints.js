import { createAccountHandler } from './accountHandler.js';
import { sendError } from './respond.js';
import { hasAppleIdentity, readAppleConfig, revokeAppleToken } from './appleRevoke.js';
export { REAUTH_MAX_AGE_SEC } from './authTime.js';
import { REAUTH_MAX_AGE_SEC } from './authTime.js';

// profileHandler, exportHandler and deleteHandler live in one file — not three
// api/v1/account/*.js files — because Vercel's Hobby plan caps a deployment at
// 12 Serverless Functions and this project was over. api/v1/account.js
// dispatches on req.method between the three (PATCH/GET/DELETE are distinct
// methods, so no action parameter is needed); see that file for the
// dispatcher and vercel.json for the rewrites that keep the documented
// /profile, /export and /delete URLs working.

// ---------------------------------------------------------------------------
// profile — PATCH
// ---------------------------------------------------------------------------
//
// Profile editing for the Settings page.
//
// Generalises api/v1/league/handle.js rather than sitting beside it. That
// endpoint already solved the two hard parts — mapping Postgres 23505 to a
// human "handle is taken", and re-syncing the handle DENORMALISED onto
// league_members so a rename actually reaches the standings. A second
// profile-patching endpoint that forgot the denormalisation is the predictable
// regression, so there is one writer and league/handle delegates to it.
//
// Client-direct writes are technically permitted (RLS grants `update own
// profile` to authenticated), but handle uniqueness and the denormalisation
// both need the server, so every profile write goes through here.
//
// Deliberately NOT re-auth gated: renaming yourself is not destructive, and
// gating it would make an ordinary edit demand a fresh sign-in. Changing the
// account's EMAIL is a different matter and is gated — see EmailSection.
//
// display_name was dropped from EDITABLE_FIELDS: it was writable here and
// populated on no account. The column remains, so an old client that still
// sends the field simply has it ignored by the allowlist rather than erroring.
// The former emoji column was dropped the same way, then removed from the
// table: an old client that still sends it is ignored, never an error.

/** Only these columns are writable. Anything else in the body is ignored. */
// display_name left this list for good in 20260924120000: it is now GENERATED
// from the three name parts, and the database refuses a write to it. Keeping it
// off the list is what turns a stale client's display_name into "ignored"
// rather than a 500.
//
// handle stays first: it is the unique social identifier and the only field
// here that is denormalised elsewhere (league_members).
export const EDITABLE_FIELDS = [
  'handle',
  'avatar_path',
  'first_name',
  'middle_name',
  'last_name',
  'is_private',
];

const NAME_FIELDS = ['first_name', 'middle_name', 'last_name'];

// Guards on the write path, not column constraints: the name parts are plain
// text. 40 each keeps the old display_name's per-field limit.
const MAX_LEN = { handle: 24, avatar_path: 200, first_name: 40, middle_name: 40, last_name: 40 };

/**
 * `avatar_path` is the one editable field that names something OUTSIDE this
 * row, so it needs a check the others do not.
 *
 * Storage RLS stops a learner writing an object into someone else's folder, but
 * this column is ordinary text: nothing in the database stops them SAYING their
 * avatar lives at another user's path and wearing that person's picture. The
 * path must therefore start with their own id — the same first-segment rule the
 * bucket policies enforce, applied to the pointer rather than the object.
 *
 * Clearing it (null) is always allowed: that is "remove my avatar".
 */
export function ownsAvatarPath(path, userId) {
  if (path === null || path === undefined) return true;
  if (typeof path !== 'string') return false;
  return path.startsWith(`${userId}/`) && !path.includes('..');
}

export function buildPatch(body) {
  const source = typeof body === 'string' ? safeParse(body) : body;
  const patch = {};
  for (const field of EDITABLE_FIELDS) {
    // BRANCH ON THE KEY, NOT THE VALUE. An explicit `null` is a request —
    // "remove my avatar" — and it is the only way AvatarPicker's "Remove
    // picture" can express itself, because there is no empty-string spelling of
    // an object path. The previous `typeof value !== 'string' → continue` swallowed
    // it, so the patch came out `{}` and every learner who tried to remove their
    // picture got "Nothing to update." Absent key = not mentioned; present-and-null
    // = clear it. Those are different questions and the code has to ask both.
    if (!Object.hasOwn(Object(source), field)) continue;
    const value = source[field];
    // The one non-text field, and NOT NULL: only a real boolean is a request.
    if (field === 'is_private') {
      if (typeof value === 'boolean') patch.is_private = value;
      continue;
    }
    if (value === null) {
      patch[field] = null;
      continue;
    }
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    // An empty string clears the field rather than storing "", so a learner can
    // remove a display name they no longer want.
    patch[field] = trimmed === '' ? null : trimmed;
  }
  return patch;
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tooLong(patch) {
  return EDITABLE_FIELDS.find((f) => typeof patch[f] === 'string' && patch[f].length > MAX_LEN[f]);
}

export const profileHandler = createAccountHandler({
  method: 'PATCH',
  ipRate: { windowMs: 60 * 60 * 1000, max: 60 },
  userRate: { windowMs: 60 * 60 * 1000, max: 30 },
  name: 'account.profile',
  failureMessage: 'Failed to update profile.',
  run: async ({ req, res, auth, db }) => {
    const patch = buildPatch(req.body);
    if (Object.keys(patch).length === 0) {
      return sendError(res, 'bad_request', 'Nothing to update.');
    }
    // Handles identify people on leaderboards and profile links. The database
    // now guarantees every profile has one, so clearing it is not a valid edit
    // (buildPatch turns whitespace into null before this check).
    if ('handle' in patch && patch.handle === null) {
      return sendError(res, 'bad_request', 'A handle is required.');
    }
    // First + last are required where a name is WRITTEN, not on the columns:
    // sign-up creates the row without one (handle_new_user), so a nameless
    // learner can still change their handle or go private. Any edit that does
    // touch a name part must leave both halves filled.
    if (NAME_FIELDS.some((f) => f in patch) && (!patch.first_name || !patch.last_name)) {
      return sendError(res, 'bad_request', 'First and last name are required.');
    }
    const over = tooLong(patch);
    if (over) {
      return sendError(res, 'bad_request', `That ${over.replace('_', ' ')} is too long.`);
    }
    if ('avatar_path' in patch && !ownsAvatarPath(patch.avatar_path, auth.userId)) {
      return sendError(res, 'bad_request', 'That avatar path is not yours.');
    }

    const { error } = await db.from('profiles').update(patch).eq('user_id', auth.userId);
    if (error) {
      if (error.code === '23505') return sendError(res, 'bad_request', 'That handle is taken.');
      throw error;
    }

    // handle is denormalised onto league_members, which is what the leaderboard
    // renders. Without this a rename never reaches the standings.
    if (typeof patch.handle === 'string') {
      await db.from('league_members').update({ handle: patch.handle }).eq('user_id', auth.userId);
    }

    // The server is the source of truth here — the client must not assume its
    // optimistic value survived, because a handle can be rejected as taken.
    const { data } = await db
      .from('profiles')
      .select(
        'handle, avatar_path, created_at, display_name, first_name, middle_name, last_name, is_private'
      )
      .eq('user_id', auth.userId)
      .maybeSingle();

    return res.status(200).json(data ?? patch);
  },
});

// ---------------------------------------------------------------------------
// export — GET
// ---------------------------------------------------------------------------
//
// Full data export. Shares the account lane's guards with delete: this endpoint
// returns the caller's entire dataset in one response, so an unlimited version
// is a bulk-read primitive for anyone holding a token.
//
// Deliberately NOT re-auth gated (§11 Q3, resolved 2026-08-30): export is
// non-destructive, the data is the caller's own, and the lane's rate limits
// already bound bulk pulls.

/**
 * Which user-owned tables the payload covers, and what each is called in it.
 *
 * Declared rather than inlined so export.test.js can assert this set against
 * the full list of user-owned tables. Before that guard existed, `decks` was
 * missing for two months: the cascade deleted it on account deletion while the
 * export quietly left it out, so "export my data" returned less than the
 * account actually held and nothing failed.
 */
export const EXPORTED_TABLES = {
  srs_state: 'srs',
  stats_daily: 'daily',
  decks: 'decks',
  settings: 'settings',
  // The learner's own token movements. Unlike progress_events_seen these are
  // not recoverable from anything else in the payload.
  token_ledger: 'tokenLedger',
  // Which Terms/Privacy versions the learner accepted, and when. Their own
  // record, and the proof a data request most often asks for.
  legal_acceptances: 'legalAcceptances',
  // Saved tutor conversations (opt-in). Read in pages: see PAGED below.
  ai_conversations: 'aiConversations',
  ai_messages: 'aiMessages',
};

/**
 * User-owned tables kept OUT of the payload, each for a stated reason. A table
 * appears here or in EXPORTED_TABLES — never in neither, which is how `decks`
 * went missing.
 */
export const EXCLUDED_TABLES = {
  // Identity the learner already sees and edits in Settings. Including it is
  // defensible and cheap; it is a payload-shape decision rather than a bug fix,
  // so it stays out until asked for.
  profiles: 'editable in Settings; pending a payload-shape decision',
  // Shared competition scaffolding rather than private learning data, and the
  // standings are already visible in the app.
  league_members: 'public competition data; pending a payload-shape decision',
  // Opaque idempotency tokens. The counters they protect already export as daily.
  progress_events_seen: 'idempotency keys for the progress RPC; counters already export as daily',
  // In-exercise bug reports for the owner. item_label can be the concealed
  // answer; the message is operational, not learning data.
  feedback: 'owner-facing exercise reports; item_label can be the concealed answer',
  // Device addresses for push, not learning data. A token is a credential for
  // reaching a device, and a download is exactly where it should not travel.
  user_devices: 'push tokens are device credentials, not learning data',
};

// `settings` is one row per user; everything else is a collection. Keeping the
// singular shape avoids changing what existing consumers already parse.
const SINGLE_ROW = new Set(['settings']);

// Tables that can hold more rows than PostgREST returns in one response
// (`max_rows`, 1000 by default), which would silently truncate the export. They
// are read in ranges, in a stable order, until a short page. A learner holds at
// most 20 x 50 = 1,000 message rows, so MAX_PAGES is a runaway guard, not a
// limit: hitting it fails the export rather than returning less than we hold.
const PAGED = { ai_conversations: ['id'], ai_messages: ['conversation_id', 'seq'] };
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

async function readTable(db, table, userId) {
  const order = PAGED[table];
  if (!order) return db.from(table).select('*').eq('user_id', userId);
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let q = db.from(table).select('*').eq('user_id', userId);
    for (const column of order) q = q.order(column);
    const { data, error } = await q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return { data: rows, error: null };
  }
  return { data: null, error: new Error(`${table} export exceeded ${MAX_PAGES} pages`) };
}

export const exportHandler = createAccountHandler({
  method: 'GET',
  ipRate: { windowMs: 60 * 60 * 1000, max: 20 },
  userRate: { windowMs: 60 * 60 * 1000, max: 10 },
  name: 'account.export',
  failureMessage: 'Failed to export data.',
  // A blocked account can still take a copy of their data.
  allowBlocked: true,
  run: async ({ res, auth, db }) => {
    const tables = Object.keys(EXPORTED_TABLES);

    const results = await Promise.all(tables.map((table) => readTable(db, table, auth.userId)));

    const data = {};
    results.forEach((result, index) => {
      if (result.error) throw result.error;
      const table = tables[index];
      const key = EXPORTED_TABLES[table];
      data[key] = SINGLE_ROW.has(table) ? (result.data?.[0] ?? null) : (result.data ?? []);
    });

    res.setHeader('Content-Disposition', 'attachment; filename="sprachschule-export.json"');
    return res.status(200).json({
      email: auth.email,
      exportedAt: new Date().toISOString(),
      data,
    });
  },
});

// ---------------------------------------------------------------------------
// delete — DELETE
// ---------------------------------------------------------------------------
//
// How recently the caller must have actually authenticated. Not how old their
// token is — see src/lib/authClaims.js for why those differ, and for the
// reasoning behind the 15 minutes.
//
// Re-exported rather than redefined: the email-change flow gates on the SAME
// window, and two copies of a security constant is one of them going stale.
// In practice almost every deletion hits the re-auth prompt, because amr only
// advances on a real sign-in and sessions here survive for weeks on refresh
// tokens.

// Typed rather than clicked. The two-step button it replaces guarded against a
// mis-click; it never established intent.
export const CONFIRM_PHRASE = 'DELETE';

// Vercel normally parses a JSON body, but a DELETE body is unusual enough in
// proxies and test harnesses that it can arrive as a raw string. Accept both
// rather than reading `undefined.confirm` off an unparsed payload.
function readConfirm(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)?.confirm;
    } catch {
      return undefined;
    }
  }
  return body?.confirm;
}

// Permanent account deletion.
//
// This endpoint deletes the auth user and NOTHING ELSE, on purpose.
//
// Every user-owned table declares `references auth.users(id) on delete cascade`
// — profiles, srs_state, stats_daily, decks, settings, league_members (see
// supabase/migrations/20260611232000_user_tables.sql and ..._leagues.sql). So
// removing the auth row already removes every row the user owns, in ONE
// server-side transaction that cannot half-apply.
//
// It used to delete srs_state, stats_daily and settings explicitly first, and
// only then call deleteUser. That was not merely redundant — it manufactured the
// exact failure B3's design forbade ("no silent half-deletes"): if the loop
// succeeded and deleteUser then failed, the user's learning data was destroyed
// while their account stayed live and signable-into. The loop also omitted
// `decks`, which was harmless precisely because the cascade — not the loop — is
// what makes the deletion complete.
//
// The invariant is enforced in two places: delete.test.js asserts this handler
// issues exactly one delete call and touches no table directly, and the RLS
// suite (npm run test:rls) asserts zero surviving rows across all six tables
// after a real deletion. If a future table is added without `on delete cascade`,
// the RLS suite is what fails.
/**
 * Delete everything under `avatars/<userId>/`. Best-effort; never throws.
 *
 * Listed rather than derived from profiles.avatar_path: the column names only
 * the CURRENT avatar, and a learner who changed theirs several times may have
 * left orphans behind when a `removeAvatar` call failed. The folder is the
 * complete answer; the column is not.
 */
export async function removeAvatarObjects(db, userId) {
  try {
    const { data, error } = await db.storage.from('avatars').list(userId);
    if (error || !data?.length) return 0;
    const paths = data.map((o) => `${userId}/${o.name}`);
    const { error: rmErr } = await db.storage.from('avatars').remove(paths);
    return rmErr ? 0 : paths.length;
  } catch {
    return 0;
  }
}

// The Apple refresh token rides in the body next to the confirm phrase. Only a
// string is accepted; anything else is treated as absent.
function readAppleToken(body) {
  let parsed = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
  }
  const token = parsed?.appleRefreshToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export const deleteHandler = createAccountHandler({
  method: 'DELETE',
  // Deleting is a once-ever action; the only legitimate repeat is a retry after
  // a transient failure.
  ipRate: { windowMs: 60 * 60 * 1000, max: 10 },
  userRate: { windowMs: 60 * 60 * 1000, max: 5 },
  name: 'account.delete',
  failureMessage: 'Failed to delete account.',
  recentAuthMaxAgeSec: REAUTH_MAX_AGE_SEC,
  // Right to erasure still applies when the account is blocked.
  allowBlocked: true,
  run: async ({ req, res, auth, db }) => {
    if (readConfirm(req.body) !== CONFIRM_PHRASE) {
      return sendError(res, 'bad_request', `Type ${CONFIRM_PHRASE} to confirm.`);
    }

    // Sign in with Apple: Apple requires the learner's token to be revoked when
    // they delete their account, and Supabase's deleteUser does not do it. It
    // runs BEFORE anything is erased, so a failure leaves the account intact
    // and the learner can simply retry; after deleteUser there is no way back
    // to the token. Order of precedence, deliberately:
    //   - erasure is never blocked by OUR misconfiguration (no env, or Apple
    //     rejecting our key): that is logged for the owner and the delete goes
    //     ahead;
    //   - a transient Apple failure fails the request so the learner retries;
    //   - a learner who signed in with Apple but sent no token is asked to sign
    //     in with Apple again (apple_token_required), since only that mints one.
    if (hasAppleIdentity(auth.user)) {
      const config = readAppleConfig();
      if (!config) {
        console.error(
          `account.delete: user ${auth.userId} has an Apple identity but APPLE_* is not configured; Apple token NOT revoked`
        );
      } else {
        const token = readAppleToken(req.body);
        if (!token) {
          return sendError(
            res,
            'apple_token_required',
            'Sign in with Apple again to finish deleting your account.'
          );
        }
        const result = await revokeAppleToken(config, token);
        if (result.outcome === 'transient') {
          throw new Error('Apple token revocation failed transiently');
        }
        if (result.outcome === 'config') {
          console.error(
            `account.delete: Apple rejected our credentials (status ${result.status}, ${result.error}); Apple token NOT revoked for user ${auth.userId}`
          );
        }
      }
    }

    // STORAGE IS NOT IN THE CASCADE. Every user-owned TABLE goes when the auth
    // row goes, but storage.objects is not in that foreign-key graph, so a
    // deleted account's avatar would stay in a PUBLIC bucket indefinitely —
    // still fetchable by anyone holding the URL, long after the person asked to
    // be forgotten. Nothing else in this handler would notice.
    //
    // Done BEFORE deleteUser, because afterwards there is no row left to tell
    // us which objects were theirs. Failures are swallowed on purpose: an
    // orphaned image must never block the deletion the person actually asked
    // for, and a half-delete is the one outcome this endpoint's design forbids.
    await removeAvatarObjects(db, auth.userId);

    const { error } = await db.auth.admin.deleteUser(auth.userId);
    if (error) throw error;
    return res.status(204).end();
  },
});
