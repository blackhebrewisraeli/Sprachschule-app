import { useEffect, useMemo, useState } from 'react';
import {
  BORDER,
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACE,
} from '../../lib/theme';
import { Stack, Row, Grid } from '../ui/Layout';
import Button from '../ui/Button';
import SectionLabel from '../ui/SectionLabel';
import { Body, Meta } from '../ui/Text';
import { TIER_NAMES, tierName } from '../../lib/leagueTier.js';
import {
  fetchAdminUsers,
  fetchUserProgress,
  adjustUserXp,
  setUserLeagueTier,
} from '../../lib/adminApi.js';
import { AdminList, AdminListRow, AdminDetail } from './AdminList';
import { COMPACT_BUTTON, FIELD } from './adminStyles';

/**
 * God Mode — manual correction of one user's XP and league placement.
 *
 * SCOPE, and why it is this narrow: both controls write through the same lanes
 * the app already uses, so nothing here can produce a state the game could not
 * reach on its own. XP lands in `stats_daily.counters.bonusXp` for a single day
 * — the identical field a daily-goal bonus writes — and placement moves the
 * user's `league_members` row between cohorts the way join() would. Neither one
 * sets `weekly_xp` directly: that column is DERIVED, recomputed from
 * stats_daily on every progress event, so a hand-written value would survive
 * only until the user answered their next card.
 *
 * Every mutation is two-step (arm, then confirm), matching the block control
 * one tab over. An admin panel is exactly where a mis-click is least likely to
 * be noticed and most expensive.
 */

/** One read-only number from the server's after-picture. */
function Stat({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <SectionLabel style={{ marginBottom: SPACE[1] }}>{label}</SectionLabel>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.bold,
          lineHeight: 1.1,
          color: COLORS.ink,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function GodMode() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const [xpInput, setXpInput] = useState('');
  const [tierInput, setTierInput] = useState('0');
  const [armed, setArmed] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingUsers(true);
      try {
        const payload = await fetchAdminUsers();
        if (!active) return;
        setUsers(payload?.items ?? []);
      } catch (err) {
        if (!active) return;
        setError(err.message ?? 'Could not load users.');
        setUsers([]);
      } finally {
        if (active) setLoadingUsers(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // The whole roster is already in memory from one request, so the filter is a
  // local narrowing rather than a per-keystroke round trip to the admin lane.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.slice(0, 8);
    return users
      .filter((u) =>
        [u.email, u.handle, u.userId].some((v) => v && String(v).toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [users, query]);

  const pick = async (user) => {
    setSelected(user);
    setSnapshot(null);
    setArmed('');
    setNote('');
    setError('');
    setLoadingSnapshot(true);
    try {
      const payload = await fetchUserProgress(user.userId);
      setSnapshot(payload);
      setTierInput(String(payload?.league?.tier ?? 0));
    } catch (err) {
      setError(err.message ?? 'Could not load that user.');
    } finally {
      setLoadingSnapshot(false);
    }
  };

  // parseInt would accept "12abc" and Number('') is 0; neither is a number the
  // admin typed. An empty or malformed field must arm nothing.
  const delta = /^-?\d+$/.test(xpInput.trim()) ? Number(xpInput.trim()) : NaN;
  const deltaValid = Number.isInteger(delta) && delta !== 0;

  const run = async (key, fn, describe) => {
    if (armed !== key) {
      setArmed(key);
      setNote('');
      return;
    }
    setBusy(key);
    setError('');
    setNote('');
    try {
      const payload = await fn();
      setSnapshot(payload);
      setTierInput(String(payload?.league?.tier ?? 0));
      setArmed('');
      setNote(describe(payload));
    } catch (err) {
      setError(err.message ?? 'That change did not go through.');
    } finally {
      setBusy('');
    }
  };

  const onAdjustXp = () =>
    run(
      'xp',
      () => adjustUserXp(selected.userId, delta),
      (payload) =>
        payload.appliedDelta === delta
          ? `Applied ${delta > 0 ? '+' : ''}${delta} XP.`
          : `Applied ${payload.appliedDelta} XP — clamped, a day cannot go below zero.`
    );

  const onMoveLeague = () =>
    run(
      'league',
      () => setUserLeagueTier(selected.userId, Number(tierInput)),
      (payload) =>
        payload.moved
          ? `Moved to ${tierName(payload.league?.tier)}.`
          : `Already in ${tierName(payload.league?.tier)} — nothing to do.`
    );

  const label = selected ? (selected.email ?? selected.handle ?? selected.userId) : '';

  return (
    <Stack gap={5}>
      <Body tone="muted" size="sm" style={{ overflowWrap: 'anywhere' }}>
        Manual correction of one account. XP is written as a bonus on today, and a league move
        carries the week&rsquo;s XP across — neither touches a week that has already settled.
      </Body>

      <div>
        <SectionLabel as="label" htmlFor="god-mode-search">
          Find a user
        </SectionLabel>
        <input
          id="god-mode-search"
          data-ui="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="email, handle, or id"
          style={FIELD}
        />
      </div>

      {error ? (
        <Body tone="error" role="alert" style={{ overflowWrap: 'anywhere' }}>
          {error}
        </Body>
      ) : null}
      {loadingUsers ? <Meta>Loading users…</Meta> : null}
      {!loadingUsers && matches.length === 0 ? <Meta>No matching user.</Meta> : null}

      <AdminList>
        {matches.map((user, index) => (
          <AdminListRow key={user.userId} first={index === 0}>
            <Row gap={3} justify="space-between" align="flex-start">
              <Body style={{ overflowWrap: 'anywhere', margin: 0 }}>
                {user.email ?? user.userId}
              </Body>
              <Button
                variant={selected?.userId === user.userId ? 'primary' : 'secondary'}
                style={COMPACT_BUTTON}
                aria-pressed={selected?.userId === user.userId}
                onClick={() => pick(user)}
              >
                {selected?.userId === user.userId ? 'Selected' : 'Select'}
              </Button>
            </Row>
            <AdminDetail>
              {user.handle ? `@${user.handle} · ` : ''}
              {user.userId}
            </AdminDetail>
          </AdminListRow>
        ))}
      </AdminList>

      {selected ? (
        <Stack
          gap={5}
          style={{
            borderTop: BORDER.panel,
            paddingTop: SPACE[5],
          }}
        >
          <div>
            <SectionLabel>Editing</SectionLabel>
            <Body style={{ overflowWrap: 'anywhere', margin: 0 }}>{label}</Body>
          </div>

          {loadingSnapshot ? <Meta>Loading progress…</Meta> : null}

          {snapshot ? (
            <>
              <Grid columns={2} gap={4}>
                <Stat label="Total XP" value={snapshot.totalXp} />
                <Stat label="This week" value={snapshot.weeklyXp} />
                <Stat
                  label="League"
                  value={snapshot.league ? tierName(snapshot.league.tier) : '—'}
                />
                <Stat
                  label="Rank"
                  value={snapshot.league?.rank != null ? `#${snapshot.league.rank}` : 'Live'}
                />
              </Grid>

              {note ? (
                <Body
                  role="status"
                  size="sm"
                  style={{
                    fontFamily: FONTS.mono,
                    letterSpacing: LETTER_SPACING.wide,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {note}
                </Body>
              ) : null}

              <div>
                <SectionLabel as="label" htmlFor="god-mode-xp">
                  Adjust XP
                </SectionLabel>
                <Row gap={3} align="flex-end">
                  <input
                    id="god-mode-xp"
                    data-ui="input"
                    type="text"
                    inputMode="numeric"
                    value={xpInput}
                    onChange={(e) => {
                      setXpInput(e.target.value);
                      setArmed('');
                    }}
                    placeholder="e.g. 250 or -50"
                    style={{ ...FIELD, flex: '1 1 140px' }}
                  />
                  <Button
                    variant={armed === 'xp' ? 'danger' : 'secondary'}
                    style={COMPACT_BUTTON}
                    disabled={!deltaValid}
                    busy={busy === 'xp'}
                    onClick={onAdjustXp}
                  >
                    {armed === 'xp' ? 'Confirm XP' : 'Apply'}
                  </Button>
                </Row>
              </div>

              <div>
                <SectionLabel as="label" htmlFor="god-mode-tier">
                  Force league
                </SectionLabel>
                <Row gap={3} align="flex-end">
                  <select
                    id="god-mode-tier"
                    data-ui="input"
                    value={tierInput}
                    onChange={(e) => {
                      setTierInput(e.target.value);
                      setArmed('');
                    }}
                    style={{ ...FIELD, flex: '1 1 140px', cursor: 'pointer' }}
                  >
                    {TIER_NAMES.map((name, tier) => (
                      <option key={name} value={String(tier)}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant={armed === 'league' ? 'danger' : 'secondary'}
                    style={COMPACT_BUTTON}
                    disabled={snapshot.league?.settled}
                    busy={busy === 'league'}
                    onClick={onMoveLeague}
                  >
                    {armed === 'league' ? 'Confirm move' : 'Move'}
                  </Button>
                </Row>
                {snapshot.league?.settled ? (
                  <Meta style={{ display: 'block', marginTop: SPACE[2] }}>
                    This week has settled — placement is a finished record.
                  </Meta>
                ) : null}
                {!snapshot.league ? (
                  <Meta style={{ display: 'block', marginTop: SPACE[2] }}>
                    Not in a league this week. Moving them creates the membership.
                  </Meta>
                ) : null}
              </div>
            </>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
