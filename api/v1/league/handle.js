import { sendError } from '../../_lib/respond.js';
import { serviceClient } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth-middleware.js';
import { withCors } from '../../_lib/origin.js';

async function handler(req, res) {
  if (req.method !== 'PATCH') return sendError(res, 'method_not_allowed', 'Method not allowed');

  let auth;
  try {
    auth = await requireAuth(req);
  } catch (err) {
    return sendError(res, err.code ?? 'server_error', err.message ?? 'Unexpected error.');
  }

  const { handle } = req.body ?? {};
  const patch = {};
  if (typeof handle === 'string') patch.handle = handle.trim();
  if (Object.keys(patch).length === 0) return sendError(res, 'bad_request', 'Nothing to update.');

  const db = serviceClient();
  if (!db) return sendError(res, 'server_error', 'Server is not configured.');

  const { error } = await db.from('profiles').update(patch).eq('user_id', auth.userId);
  if (error) {
    if (error.code === '23505') return sendError(res, 'bad_request', 'That handle is taken.');
    // profiles_handle_length (20261011120100): the database holds the 1–24
    // rule this route never checked itself.
    if (error.code === '23514') {
      return sendError(res, 'bad_request', 'A handle must be 1–24 characters.');
    }
    return sendError(res, 'server_error', 'Failed to update profile.');
  }

  // handle is denormalized onto league_members (what the leaderboard renders), so
  // keep it in sync — otherwise a rename never reaches the standings.
  if (typeof patch.handle === 'string') {
    await db.from('league_members').update({ handle: patch.handle }).eq('user_id', auth.userId);
  }

  return res.status(200).json({ handle: patch.handle ?? null });
}

export default withCors(handler);
