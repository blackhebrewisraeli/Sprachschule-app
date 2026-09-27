import { COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT, RADIUS, SPACE } from '../lib/theme';
import { Stack } from './ui/Layout';
import InteractiveCard from './ui/InteractiveCard';
import TaskIcon from './ui/TaskIcon';
import { activePack } from '../packs';

// Row padding — same recipe as MissionBoard: three stops of vertical air so the
// copy, ratio and bar are not pressed against the pill's edge.
const ROW_PADDING = `${SPACE[3]}px ${SPACE[4]}px`;

// Same glyph column as MissionBoard: one line of copy tall, so the icon
// centres on the first line however far the text wraps.
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

// The daily-quest board on Home.
//
// A SIBLING of MissionBoard, not an extension of it. Missions rank by urgency
// under a shared cap, and folding quests into that list would let "practise in
// three sections" push `srs-due` off the board — strictly worse. Two
// derivations, two boards, one visual language.
//
// Rows are InteractiveCard for the same reason MissionBoard's are: it
// guarantees a real <button>, which is what fourteen league rows shipped as
// `<li onClick>` were not.
//
// Copy comes from the pack. This component knows quest IDS and nothing about
// German.
export default function QuestBoard({ quests = [], onGo }) {
  const copy = activePack.content.quests ?? {};
  const chrome = activePack.content.questsChrome ?? {};

  if (quests.length === 0) return null;

  const allDone = quests.every((q) => q.done);

  return (
    <section aria-labelledby="quests-heading" style={BOUNDED_BOARD}>
      <h2
        id="quests-heading"
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

      <ul style={{ ...BOUNDED_BOARD, listStyle: 'none', margin: 0, padding: 0 }}>
        <Stack gap={2} as="div" style={BOUNDED_BOARD}>
          {quests.map((quest) => {
            const entry = copy[quest.id];
            if (!entry) return null;
            const label = entry.text(quest);
            const destination = chrome.tabNames?.[quest.tab] ?? quest.tab;
            // The visible row shows "3 / 7"; a screen reader gets the sentence,
            // because a bare ratio read aloud is not a progress report.
            const progressText =
              chrome.progressLabel?.(quest) ?? `${quest.progress}/${quest.target}`;

            return (
              <li key={quest.id} style={BOUNDED_BOARD}>
                <InteractiveCard
                  onClick={() => onGo?.(quest.tab, quest)}
                  style={{ ...BOUNDED_BOARD, textAlign: 'left', padding: ROW_PADDING }}
                  aria-label={
                    quest.done
                      ? `${label} — ${chrome.doneLabel ?? 'done'}`
                      : `${label} — ${progressText} — go to ${destination}`
                  }
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
                    <span
                      aria-hidden="true"
                      style={{ ...ICON_SLOT, color: quest.done ? COLORS.green : ICON_SLOT.color }}
                    >
                      <TaskIcon name={quest.done ? 'done' : entry.icon} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <span
                        data-testid="quest-copy"
                        style={{
                          display: 'block',
                          minWidth: 0,
                          fontFamily: FONTS.body,
                          fontSize: FONT_SIZE.md,
                          fontWeight: FONT_WEIGHT.medium,
                          lineHeight: LINE_HEIGHT.normal,
                          color: quest.done ? COLORS.mute : COLORS.ink,
                          textDecoration: quest.done ? 'line-through' : 'none',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {label}
                      </span>
                      <span
                        aria-hidden="true"
                        data-testid="quest-progress"
                        style={{
                          display: 'block',
                          marginTop: SPACE[1],
                          fontFamily: FONTS.body,
                          fontSize: FONT_SIZE.sm,
                          fontWeight: FONT_WEIGHT.semibold,
                          lineHeight: LINE_HEIGHT.snug,
                          color: quest.done ? COLORS.green : COLORS.mute,
                        }}
                      >
                        {quest.progress} / {quest.target}
                      </span>
                    </div>
                  </div>

                  {/* A bounded bar, never a per-unit strip: a target scales with
                      the learner's activity, so a dot per card would grow
                      without limit — the same overflow that dragged the deck
                      progress row 54x wider than the viewport. */}
                  <div
                    aria-hidden="true"
                    style={{
                      marginTop: SPACE[2],
                      height: 6,
                      borderRadius: RADIUS.pill,
                      background: COLORS.track,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round((quest.progress / Math.max(1, quest.target)) * 100)}%`,
                        height: '100%',
                        // accentRed is the "the app is asking you for
                        // something" fill — not COLORS.red, which now means
                        // only *wrong*. There is no COLORS.accent.
                        background: quest.done ? COLORS.green : COLORS.accentRed,
                      }}
                    />
                  </div>
                </InteractiveCard>
              </li>
            );
          })}
        </Stack>
      </ul>

      {allDone && (
        <div
          style={{
            marginTop: SPACE[2],
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.tag,
            color: COLORS.mute,
          }}
        >
          {chrome.allDoneTitle} — {chrome.allDoneBody}
        </div>
      )}
    </section>
  );
}
