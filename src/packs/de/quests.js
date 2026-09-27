// Daily-quest copy for the German pack.
//
// src/lib/quests.js decides WHICH quests a day holds and how far along they
// are, and returns data only — ids, targets and progress. This file is where
// those ids become words, exactly as missions.js does for the mission board. A
// sentence in src/lib would be the regression the pack extraction exists to
// prevent.
//
// Each entry takes the quest and returns its line. The board renders the icon,
// the text and the progress; nothing here knows about styling. `icon` is a
// TaskIcon key (src/components/ui/TaskIcon.jsx), never an emoji.

const plural = (n, one, many) => (n === 1 ? one : many);

export const QUESTS = {
  'answer-cards': {
    icon: 'cards',
    text: (q) => `Answer ${q.target} ${plural(q.target, 'card', 'cards')}`,
  },
  'get-correct': {
    icon: 'target',
    text: (q) => `Get ${q.target} ${plural(q.target, 'answer', 'answers')} right`,
  },
  'practise-tabs': {
    icon: 'compass',
    text: (q) => `Practise in ${q.target} different sections`,
  },
  'focus-chat': {
    icon: 'chat',
    text: (q) => `${q.target} ${plural(q.target, 'round', 'rounds')} in Chat`,
  },
  'focus-alphabet': {
    icon: 'alphabet',
    text: (q) => `${q.target} ${plural(q.target, 'round', 'rounds')} in Alphabet`,
  },
  'focus-vocab': {
    icon: 'book',
    text: (q) => `${q.target} ${plural(q.target, 'card', 'cards')} in Vokabeln`,
  },
  'focus-translate': {
    icon: 'translate',
    text: (q) => `${q.target} ${plural(q.target, 'sentence', 'sentences')} in Übersetzen`,
  },
};

export const QUESTS_CHROME = {
  heading: 'Tagesaufgaben',
  // Shown when every quest is done — the board stays, so the day reads as
  // finished rather than empty.
  allDoneTitle: 'Alles geschafft',
  allDoneBody: 'Neue Aufgaben gibt es morgen.',
  // Names the tab a quest sends you to, keyed by tab id — a quest never carries
  // a human-readable destination itself.
  tabNames: {
    home: 'Home',
    chat: 'Chat',
    alphabet: 'Alphabet',
    vocab: 'Vokabeln',
    translate: 'Übersetzen',
    stats: 'Statistik',
  },
  // Progress is rendered as "3 / 7"; the separator is punctuation, but the
  // accessible phrasing around it is language.
  progressLabel: (q) => `${q.progress} of ${q.target} done`,
  doneLabel: 'done',
};
