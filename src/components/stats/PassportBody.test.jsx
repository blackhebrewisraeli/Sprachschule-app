import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PassportBody from './PassportBody';
import { ACHIEVEMENTS } from '../../lib/gamification';
import { COLORS } from '../../lib/theme.js';

const profile = (over = {}) => ({
  handle: 'Rival',
  avatar_path: null,
  join_year: 2026,
  tier: 1,
  total_xp: 420,
  longest_streak: 9,
  league_wins: 3,
  achievements: [],
  ...over,
});

const show = (over = {}, props = {}) =>
  render(<PassportBody profile={profile(over)} userId="u1" {...props} />);

// avatarFor composes an uploaded avatar's URL from VITE_SUPABASE_URL, and with
// no base it deliberately falls through to the next tier rather than rendering
// a broken image. That makes any test touching avatar_path depend on whether a
// .env happens to exist — it passed locally and failed in CI for exactly that
// reason. Stubbed here so the ENVIRONMENT is part of the fixture, not ambient.
afterEach(() => vi.unstubAllEnvs());
const withStorage = () => vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
const withoutStorage = () => vi.stubEnv('VITE_SUPABASE_URL', '');

describe('PassportBody — identity', () => {
  it('names the player and their tier', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Rival' })).toBeInTheDocument();
    expect(screen.getByText(/Silver/)).toBeInTheDocument();
  });

  it('shows the join YEAR, never a full date', () => {
    show();
    expect(screen.getByText(/seit 2026/)).toBeInTheDocument();
    // A precise join date is a fact about a stranger a leaderboard need not publish.
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('omits the join line entirely when the year is unknown', () => {
    show({ join_year: null });
    expect(screen.queryByText(/seit/)).not.toBeInTheDocument();
  });

  it('falls back to a name rather than rendering a blank heading', () => {
    show({ handle: null });
    expect(screen.getByRole('heading', { name: /Anonym/ })).toBeInTheDocument();
  });

  it('draws the avatar through the shared resolver', () => {
    show();
    expect(document.querySelector('[data-avatar="identicon"]')).toBeTruthy();
  });

  it('prefers an uploaded picture over the identicon', () => {
    withStorage();
    show({ avatar_path: 'u1/a.webp' });
    // Only asserts which TIER won; the URL itself is avatar.js's contract.
    expect(document.querySelector('[data-avatar="identicon"]')).toBeNull();
    expect(document.querySelector('[data-avatar="image"]')).toBeTruthy();
  });

  // The other half of the same rule, and the branch CI was actually running:
  // with no storage base an avatar_path cannot be turned into a URL, so the
  // card shows the identicon instead of an image that would never load.
  it('falls back to the identicon when no storage base is configured', () => {
    withoutStorage();
    show({ avatar_path: 'u1/a.webp' });
    expect(document.querySelector('[data-avatar="identicon"]')).toBeTruthy();
    expect(document.querySelector('[data-avatar="image"]')).toBeNull();
  });
});

describe('PassportBody — self vs competitor', () => {
  it('marks your own passport', () => {
    show({}, { isSelf: true });
    expect(screen.getByText(/this is you/i)).toBeInTheDocument();
  });

  // Caught in a real browser, not in jsdom: accentBlack is documented as
  // "identity chrome that must not invert with the theme" and is #1A1816 in
  // BOTH modes, so a pill using it vanished against the dark card. This guards
  // the token choice, because the symptom is only visible to an eye in dark
  // mode and no unit test renders a theme.
  it('marks you with a token that INVERTS, not the fixed identity black', () => {
    show({}, { isSelf: true });
    const pill = [...document.querySelectorAll('div')].find((d) => d.textContent === 'This is you');
    expect(pill).toBeTruthy();
    expect(pill.style.background).not.toBe(COLORS.accentBlack);
    expect(pill.style.background).toBe(COLORS.surface2);
  });

  it('does not mark someone else’s', () => {
    show();
    expect(screen.queryByText(/this is you/i)).not.toBeInTheDocument();
  });

  // The numbers must not depend on who is reading. A passport that showed
  // different FACTS to different viewers would be two components in one.
  it('shows the SAME figures either way', () => {
    const { unmount } = show({}, { isSelf: true });
    const mine = screen.getByText('420').textContent;
    unmount();
    show();
    expect(screen.getByText('420').textContent).toBe(mine);
  });
});

describe('PassportBody — stats', () => {
  it('shows lifetime XP, longest streak and league wins', () => {
    show();
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(screen.getByText('9d')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders zeros rather than blanks for a brand-new player', () => {
    show({ total_xp: 0, longest_streak: 0, league_wins: 0, join_year: null });
    expect(screen.getByText('0d')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });

  it('survives a row with the fields missing entirely', () => {
    render(<PassportBody profile={{ tier: 0 }} userId="u1" />);
    expect(screen.getByText('0d')).toBeInTheDocument();
  });
});

describe('PassportBody — badges', () => {
  const first = ACHIEVEMENTS[0];
  const second = ACHIEVEMENTS[1];

  it('renders an earned badge with its name', () => {
    show({ achievements: [first.id] });
    const badge = document.querySelector(`[data-badge="${first.id}"]`);
    expect(badge).toBeTruthy();
    expect(badge).toHaveTextContent(first.name);
  });

  it('counts them', () => {
    show({ achievements: [first.id, second.id] });
    expect(screen.getByText(/Abzeichen · 2/)).toBeInTheDocument();
  });

  it('keeps the order the endpoint sent — oldest earned first', () => {
    show({ achievements: [second.id, first.id] });
    const ids = [...document.querySelectorAll('[data-badge]')].map((n) =>
      n.getAttribute('data-badge')
    );
    expect(ids).toEqual([second.id, first.id]);
  });

  // An older client meeting a badge added after it shipped must not render a
  // blank chip with an empty name.
  it('skips an id it does not recognise', () => {
    show({ achievements: [first.id, 'badge-from-the-future'] });
    expect(document.querySelectorAll('[data-badge]')).toHaveLength(1);
    expect(screen.getByText(/Abzeichen · 1/)).toBeInTheDocument();
  });

  it('says so when there are none, and differently for yourself', () => {
    show({ achievements: [] });
    expect(screen.getByText(/noch keine abzeichen/i)).toBeInTheDocument();
  });

  it('encourages you on your own empty passport', () => {
    show({ achievements: [] }, { isSelf: true });
    expect(screen.getByText(/üben lohnt sich/i)).toBeInTheDocument();
  });

  it('tolerates a missing achievements array', () => {
    render(<PassportBody profile={{ tier: 0, handle: 'x' }} userId="u1" />);
    expect(screen.getByText(/noch keine abzeichen/i)).toBeInTheDocument();
  });

  // The emoji sits beside the name; announcing both would read as
  // "fire fire streak" to a screen reader.
  it('draws the badge medal, not the emoji, and hides it from assistive tech', () => {
    show({ achievements: [first.id] });
    const badge = document.querySelector(`[data-badge="${first.id}"]`);
    const medal = badge.querySelector(`svg[data-badge-icon="${first.id}"]`);
    expect(medal).not.toBeNull();
    expect(medal).toHaveAttribute('aria-hidden', 'true');
    expect(badge).not.toHaveTextContent(first.icon);
  });
});

// ── Polish ─────────────────────────────────────────────────────────────────
// The animations themselves live in injectGlobalStyles and are guarded there.
// What belongs here is that the right elements opt in, and — the part worth
// more than the effect — that opting in did not quietly turn decoration into a
// promise the card cannot keep.
describe('PassportBody — micro-interactions', () => {
  const first = ACHIEVEMENTS[0];

  it('lifts every earned badge on hover, not just the first', () => {
    show({ achievements: [first.id, ACHIEVEMENTS[1].id] });
    const chips = [...document.querySelectorAll('[data-badge]')];
    expect(chips).toHaveLength(2);
    expect(chips.every((c) => c.classList.contains('badge-chip'))).toBe(true);
  });

  // The chip is an <li> with no handler. A hover that looks like a button's
  // invites a click that does nothing, so the lift stops short of the two
  // things that actually say "control": the pointer cursor and a role.
  it('does not dress a badge up as something clickable', () => {
    show({ achievements: [first.id] });
    const chip = document.querySelector(`[data-badge="${first.id}"]`);
    expect(chip.style.cursor).toBe('');
    expect(chip).not.toHaveAttribute('role', 'button');
    expect(chip).not.toHaveAttribute('tabindex');
    expect(chip.querySelector('button')).toBeNull();
  });

  it('glows the self marker', () => {
    show({}, { isSelf: true });
    const pill = [...document.querySelectorAll('div')].find((d) => d.textContent === 'This is you');
    expect(pill).toHaveClass('self-glow');
  });

  // The glow is the accent; the pill's own legibility is the surface/border
  // pair chosen for it. Those must stay independent, or the marker becomes
  // unreadable for anyone whose browser is animating nothing.
  it('keeps the marker legible without the glow doing any work', () => {
    show({}, { isSelf: true });
    const pill = [...document.querySelectorAll('div')].find((d) => d.textContent === 'This is you');
    expect(pill.style.background).toBe(COLORS.surface2);
    expect(pill.style.color).toBe(COLORS.ink);
    // No inline box-shadow: the glow is the class's to own, and an inline one
    // would beat the reduced-motion rule that holds it at its dimmest frame.
    expect(pill.style.boxShadow).toBe('');
  });

  it('marks nobody else, so the glow cannot appear on a competitor', () => {
    show({ achievements: [first.id] });
    expect(document.querySelector('.self-glow')).toBeNull();
  });
});

// ── Display name (Social Profile v1 §7) ─────────────────────────────
describe('PassportBody identity', () => {
  const row = { handle: 'sam', tier: 0, total_xp: 10, longest_streak: 2, achievements: [] };

  it('leads with the display name and keeps the handle as the social identifier', () => {
    render(<PassportBody profile={{ ...row, display_name: 'Sam Vimes' }} userId="u1" />);
    expect(screen.getByRole('heading', { name: 'Sam Vimes' })).toBeInTheDocument();
    // The handle does not disappear when a display name exists — it is the
    // unique identifier, and a profile that shows only a chosen nickname
    // cannot be matched to the person on the leaderboard.
    expect(screen.getByText('@sam')).toBeInTheDocument();
  });

  it('falls back to the handle as the heading when no display name is set', () => {
    render(<PassportBody profile={{ ...row, display_name: null }} userId="u1" />);
    expect(screen.getByRole('heading', { name: 'sam' })).toBeInTheDocument();
    // …and then does NOT also print "@sam" underneath, which would be the same
    // word twice stacked.
    expect(screen.queryByText('@sam')).not.toBeInTheDocument();
  });

  it('falls all the way back to the anonymous label', () => {
    render(<PassportBody profile={{ ...row, handle: null }} userId="u1" />);
    expect(screen.getByRole('heading', { name: 'Anonym' })).toBeInTheDocument();
  });
});

// profiles.is_private (20260924120000). The API already withholds the metrics
// from anyone but the owner — this is what the card does with that answer. A
// locked passport must say so, not render the absent numbers as zeros: "0 XP"
// would be a false statement about the person.
describe('PassportBody — a private profile', () => {
  const locked = {
    display_name: 'Sam Vimes',
    handle: 'sam',
    avatar_path: null,
    is_private: true,
  };

  it('shows who they are and that the rest is private — no stats, no badges', () => {
    render(<PassportBody profile={locked} userId="u1" />);
    expect(screen.getByRole('heading', { name: 'Sam Vimes' })).toBeInTheDocument();
    expect(screen.getByText('@sam')).toBeInTheDocument();
    expect(screen.getByText(/this profile is private/i)).toBeInTheDocument();
    for (const absent of ['XP', 'Streak', 'Ligasiege', /Abzeichen/]) {
      expect(screen.queryByText(absent)).toBeNull();
    }
  });

  it('shows the owner their own full passport even while private', () => {
    show({ is_private: true }, { isSelf: true });
    expect(screen.getByText('XP')).toBeInTheDocument();
    expect(screen.queryByText(/this profile is private/i)).toBeNull();
  });
});
