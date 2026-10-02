import { sendError } from '../../_lib/respond.js';
import { serviceClient } from '../../_lib/supabase.js';
import { settleLeague, currentPeriodStart } from '../../_lib/leagueLogic.js';

export default async function handler(req, res) {
  // Vercel Cron triggers a GET, so GET is the method that actually runs this in
  // production; POST stays for manual/curl runs. The guard deliberately sits
  // ABOVE nothing security-relevant — the CRON_SECRET check below is the only
  // thing protecting this endpoint, and it applies to both methods. Rejecting
  // GET here is what silently broke every scheduled settle since launch.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 'method_not_allowed', 'Method not allowed');
  }

  const secret = process.env.CRON_SECRET;
  const header = req.headers?.authorization ?? '';
  if (!secret || header !== `Bearer ${secret}`) {
    return sendError(res, 'unauthorized', 'Invalid cron secret.');
  }

  const db = serviceClient();
  if (!db) return sendError(res, 'server_error', 'Server is not configured.');

  // Same secret, same endpoint, second Vercel cron: the Hobby plan is at its
  // function cap, so the daily sweeps ride this route (?job=purge) instead of
  // getting their own file. It never touches league state. Each sweep runs
  // even if the other failed, so one broken RPC cannot stop the other's
  // retention clock; any failure still returns 500 so the cron shows red.
  if (req.query?.job === 'purge') {
    const purged = {};
    const failed = [];
    for (const [label, rpc] of [
      ['AI usage', 'purge_ai_usage'],
      ['AI conversations', 'purge_ai_conversations'],
    ]) {
      const { data, error } = await db.rpc(rpc);
      if (error) failed.push(label);
      else Object.assign(purged, data);
    }
    if (failed.length) {
      return sendError(res, 'server_error', `Failed to purge: ${failed.join(', ')}.`);
    }
    return res.status(200).json({ purged });
  }

  const period = currentPeriodStart();

  try {
    // Leagues from prior periods (period_start < current) — candidates to settle.
    const { data: leagues, error } = await db
      .from('leagues')
      .select('id, period_start')
      .lt('period_start', period);
    if (error) throw error;

    let settled = 0;
    let failed = 0;
    for (const league of leagues ?? []) {
      // Each league settles independently: one league's write failure must not
      // abort the rest of the run. A failed league is left for the next cron —
      // re-settlement is idempotent because we re-rank the FULL member set, so a
      // partial prior write is simply overwritten with the same deterministic
      // ranks rather than re-ranked among the leftovers.
      try {
        const { data: members, error: mErr } = await db
          .from('league_members')
          .select('user_id, weekly_xp, updated_at, rank')
          .eq('league_id', league.id);
        if (mErr) throw mErr;
        if (!members || members.length === 0) continue;

        // Idempotency: already fully settled (every member ranked) → skip.
        if (members.every((m) => m.rank != null)) continue;

        // One statement for the whole cohort. settleLeague stays the single
        // ranking implementation — it is shared with the client, which draws
        // the promotion/relegation dividers from it — and the RPC only applies
        // the result set, atomically per league.
        const results = settleLeague(members);
        const { error: upErr } = await db.rpc('apply_league_results', {
          p_league_id: league.id,
          p_results: results,
        });
        if (upErr) throw upErr;
        settled += 1;
      } catch {
        failed += 1;
      }
    }

    return res.status(200).json({ settled, failed });
  } catch {
    return sendError(res, 'server_error', 'Failed to settle leagues.');
  }
}
