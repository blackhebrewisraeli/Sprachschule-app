// Mission copy for the German pack.
//
// src/lib/missions.js decides WHICH missions are open and returns data only —
// ids, counts and target tabs. This file is where those ids become words, which
// is what keeps the engine language-blind: a sentence in src/lib would be the
// exact regression the pack extraction was built to prevent.
//
// Each entry takes the mission and returns its line. The board renders the
// icon, the text and the destination; nothing here knows about styling.
// `icon` is a TaskIcon key (src/components/ui/TaskIcon.jsx), never an emoji —
// an emoji draws as a different picture on every OS.

const plural = (n, one, many) => (n === 1 ? one : many);

export const MISSIONS = {
  'srs-due': {
    icon: 'clock',
    text: (m) => `${m.count} ${plural(m.count, 'card is', 'cards are')} due`,
  },
  'streak-risk': {
    icon: 'flame',
    text: (m) => `Keep your ${m.count}-day streak alive`,
  },
  'goal-remaining': {
    icon: 'target',
    text: (m) => `${m.count} XP to today's goal`,
  },
  'revisit-wrong': {
    icon: 'undo',
    text: (m) => `Revisit ${m.count} ${plural(m.count, 'word', 'words')} you missed`,
  },
  'deck-unfinished': {
    icon: 'book',
    text: (m) => `${m.count} ${plural(m.count, 'card', 'cards')} left in your deck`,
  },
  'league-position': {
    icon: 'shield',
    // Deliberately not phrased in the second person. noPromptsInComponents
    // guards that opening phrase to stop AI prompt text drifting out of
    // src/lib/prompts.js; the guard is blunt on purpose, and rewording one UI
    // string is cheaper than blunting it further.
    text: () => 'In the drop zone — earn XP to stay up',
  },
  'badge-near': {
    icon: 'medal',
    // Avoids the word "next": the tutorial's own "Next →" control shares the
    // screen, and an accessible-name query for one would match both.
    text: () => 'One more session unlocks a badge',
  },
};

/** Section heading, and the label on each row's destination. */
export const MISSIONS_CHROME = {
  heading: 'Missionen',
  // Names the tab a mission sends you to. Keyed by tab id, so a mission never
  // has to carry a human-readable destination itself.
  tabNames: {
    home: 'Home',
    chat: 'Chat',
    alphabet: 'Alphabet',
    vocab: 'Vokabeln',
    translate: 'Übersetzen',
    stats: 'Statistik',
  },
  // Clearing the board is a win, so this reads as congratulation rather than
  // apology — an empty state is not an error.
  emptyTitle: 'Alles erledigt',
  emptyBody: 'Nothing due today. Practise anyway if you like.',
  errorBody: 'Your missions could not be worked out just now.',
};
