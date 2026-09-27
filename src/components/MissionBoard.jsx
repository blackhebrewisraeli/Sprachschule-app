import { COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT, SPACE } from '../lib/theme';
import { Stack } from './ui/Layout';
import InteractiveCard from './ui/InteractiveCard';
import StatusNote from './ui/StatusNote';
import TaskIcon from './ui/TaskIcon';
import { activePack } from '../packs';
import { ListChecks } from 'lucide-react';

// Row padding for Home's mission/quest pills. The earlier one-stop (4px)
// vertical inset hugged the two text lines so tightly that the rows read as
// cramped; three stops of vertical air and four of inline give the copy room
// without growing into InteractiveCard's full deck-tile inset.
const ROW_PADDING = `${SPACE[3]}px ${SPACE[4]}px`;

// The glyph's column: exactly one line of the row's copy tall, so the icon
// centres on the first line of text however far the copy wraps below it.
const ICON_SLOT = {
  display: 'flex',
  alignItems: 'center',
  height: FONT_SIZE.md * LINE_HEIGHT.normal,
  color: COLORS.inkSoft,
};

const BOUNDED_BOARD = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
};

// The open-tasks board on Home.
//
// Rows are InteractiveCard, never a Surface with onClick: it guarantees a real
// <button>, which is what fourteen league rows shipped as `<li onClick>` were
// not — unreachable by Tab and invisible to a screen reader, through a green
// 1,600-test suite.
//
// Copy comes from the pack. This component knows mission IDS and nothing about
// German, which is what keeps src/components language-blind.
export default function MissionBoard({ missions = [], onGo }) {
  const copy = activePack.content.missions ?? {};
  const chrome = activePack.content.missionsChrome ?? {};

  return (
    <section aria-labelledby="missions-heading" style={BOUNDED_BOARD}>
      <h2
        id="missions-heading"
        style={{
          fontFamily: FONTS.display,
          fontSize: FONT_SIZE.lg,
          fontWeight: FONT_WEIGHT.bold,
          lineHeight: 1.2,
          color: COLORS.ink,
          margin: `0 0 ${SPACE[3]}px`,
        }}
      >
        {chrome.heading}
      </h2>

      {missions.length === 0 ? (
        <StatusNote tone="empty" icon={ListChecks}>
          {chrome.emptyTitle} — {chrome.emptyBody}
        </StatusNote>
      ) : (
        // A real list, so a screen reader announces how many tasks are open.
        <ul style={{ ...BOUNDED_BOARD, listStyle: 'none', margin: 0, padding: 0 }}>
          <Stack gap={2} as="div" style={BOUNDED_BOARD}>
            {missions.map((mission) => {
              const entry = copy[mission.id];
              if (!entry) return null;
              const label = entry.text(mission);
              const destination = chrome.tabNames?.[mission.tab] ?? mission.tab;
              return (
                <li key={mission.id} style={BOUNDED_BOARD}>
                  <InteractiveCard
                    onClick={() => onGo?.(mission.tab, mission)}
                    style={{ ...BOUNDED_BOARD, textAlign: 'left', padding: ROW_PADDING }}
                    // The visible row reads "[clock] 12 cards are due · Vokabeln",
                    // but an icon-only glyph carries no name, so the control
                    // gets an explicit one naming where it goes.
                    aria-label={`${label} — go to ${destination}`}
                  >
                    <div
                      style={{
                        display: 'grid',
                        // minmax(0, 1fr), never a bare 1fr: a 1fr track keeps
                        // min-width auto and pushes the page wider than the
                        // viewport instead of letting the text shrink.
                        gridTemplateColumns: 'auto minmax(0, 1fr)',
                        alignItems: 'start',
                        columnGap: SPACE[3],
                        ...BOUNDED_BOARD,
                      }}
                    >
                      <span aria-hidden="true" style={ICON_SLOT}>
                        <TaskIcon name={entry.icon} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <span
                          data-testid="mission-copy"
                          style={{
                            display: 'block',
                            minWidth: 0,
                            fontFamily: FONTS.body,
                            fontSize: FONT_SIZE.md,
                            fontWeight: FONT_WEIGHT.medium,
                            lineHeight: LINE_HEIGHT.normal,
                            color: COLORS.ink,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {label}
                        </span>
                        <span
                          data-testid="mission-destination"
                          aria-hidden="true"
                          style={{
                            display: 'block',
                            marginTop: SPACE[1],
                            fontFamily: FONTS.body,
                            fontSize: FONT_SIZE.sm,
                            fontWeight: FONT_WEIGHT.semibold,
                            lineHeight: LINE_HEIGHT.snug,
                            color: COLORS.mute,
                          }}
                        >
                          {destination} →
                        </span>
                      </div>
                    </div>
                  </InteractiveCard>
                </li>
              );
            })}
          </Stack>
        </ul>
      )}
    </section>
  );
}
