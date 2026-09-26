import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArrowUp } from 'lucide-react';
import { LeagueDivider, LeaguePanel, LeagueRow } from './LeagueTable';
import { COLORS } from '../../lib/theme';

const member = (id, xp) => ({ user_id: id, handle: id, weekly_xp: xp, profile: null });

function inPanel(children) {
  return render(
    <LeaguePanel title="Rangliste" listLabel="standings">
      {children}
    </LeaguePanel>
  );
}

// Both rules below were measured by the rendered-contrast audit
// (scripts/dev/audit-contrast.mjs), which runs in CI against the real build.
describe('LeagueTable contrast', () => {
  it('sets the podium row’s XP in full ink, every other row in subtle ink', () => {
    // Subtle ink on dark mode's goldSoft measured 2.37:1.
    inPanel(
      <>
        <LeagueRow rank={1} member={member('a', 900)} />
        <LeagueRow rank={2} member={member('b', 800)} />
      </>
    );
    expect(screen.getByText('900 XP').style.color).toBe(COLORS.ink);
    expect(screen.getByText('800 XP').style.color).toBe(COLORS.inkSoft);
  });

  it('keeps a zone divider’s colour off its label text', () => {
    // Success green on the recessed panel measured 4.32:1 in light mode.
    const { container } = inPanel(
      <LeagueDivider text="Promotion" color={COLORS.green} icon={ArrowUp} />
    );
    const divider = container.querySelector('[data-league-divider]');
    expect(divider.style.color).toBe(COLORS.inkSoft);
    // The colour survives on the non-text marks: the arrow and the rules.
    expect(divider.querySelector('svg')).toHaveAttribute('stroke', COLORS.green);
    expect(divider.firstElementChild.style.background).toBe(COLORS.green);
    expect(divider).toHaveTextContent('Promotion');
  });
});
