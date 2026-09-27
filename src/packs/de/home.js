// Chrome copy for the Home dashboard.
//
// Lives in the pack for the same reason the mission and quest copy does: the
// Home components know structure — a hub, two promoted cards, a grouped
// section — and nothing about German. A heading authored in src/components
// would be exactly the coupling the pack extraction was built to prevent.

export const HOME_CHROME = {
  /** Heading over the two promoted quick actions, above the fold. */
  recommendedHeading: 'Recommended for you',

  /**
   * Shown in place of a real mission when fewer than two are open.
   *
   * These are full rows rather than ids, because they are NOT missions:
   * lib/missions.js only emits a mission when there is something concrete to
   * report, so there is no id for "nothing is due, practise anyway". A card
   * still has to appear — two cards is the layout — so the pack authors them
   * outright, with the same { icon, text, tab } shape a resolved mission has.
   *
   * The two land on DIFFERENT practice tabs on purpose. Both labels could
   * plausibly point at Vokabeln, but two cards side by side sending the reader
   * to one place reads as a bug, so each names the tab it actually describes:
   * Übersetzen is the exercise surface, Vokabeln the vocabulary one.
   */
  recommendedFallbacks: [
    { id: 'continue-quiz', icon: 'graduation', text: 'Continue Quiz', tab: 'translate' },
    { id: 'review-vocab', icon: 'book', text: 'Review Vocab', tab: 'vocab' },
  ],

  /**
   * Groups the two open-task boards — Missionen and Tagesaufgaben — under one
   * day-scoped heading, so Home reads as "who you are · what to do next ·
   * what's left today" rather than as four unrelated stacks.
   */
  todayHeading: 'Heute',
  todaySub: 'What is still open today.',
};
