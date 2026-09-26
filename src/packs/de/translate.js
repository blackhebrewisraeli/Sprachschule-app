// German translation exercise banks, one per CEFR level. Every row names the
// word its gap exercises practise — `blank` (+ `distractors`), or at A2 the
// first of its `blanks` — so Translate can render it in any input mode.

export const TRANSLATE_SENTENCES_A1 = [
  {
    en: 'I drink water.',
    de: 'Ich trinke Wasser.',
    words: ['Ich', 'trinke', 'Wasser.'],
    blank: 'trinke',
    distractors: ['esse', 'laufe'],
    note: 'Subject–Verb–Object word order',
  },
  {
    en: 'The cat is big.',
    de: 'Die Katze ist groß.',
    words: ['Die', 'Katze', 'ist', 'groß.'],
    blank: 'groß',
    distractors: ['klein', 'der'],
    note: 'Nominative: die Katze (feminine)',
  },
  {
    en: 'He eats bread.',
    de: 'Er isst Brot.',
    words: ['Er', 'isst', 'Brot.'],
    blank: 'isst',
    distractors: ['trinkt', 'Wasser'],
    note: 'isst = 3rd person singular of essen',
  },
  {
    en: 'We go home.',
    de: 'Wir gehen nach Hause.',
    words: ['Wir', 'gehen', 'nach', 'Hause.'],
    blank: 'nach',
    distractors: ['fahren', 'in'],
    note: 'nach Hause = direction; zu Hause = location',
  },
  {
    en: 'She reads a book.',
    de: 'Sie liest ein Buch.',
    words: ['Sie', 'liest', 'ein', 'Buch.'],
    blank: 'liest',
    distractors: ['schreibt', 'das'],
    note: 'ein Buch — neuter accusative, no change from nominative',
  },
  {
    en: 'The dog is small.',
    de: 'Der Hund ist klein.',
    words: ['Der', 'Hund', 'ist', 'klein.'],
    blank: 'klein',
    distractors: ['groß', 'die'],
    note: 'Nominative: der Hund (masculine)',
  },
  {
    en: 'I am tired.',
    de: 'Ich bin müde.',
    words: ['Ich', 'bin', 'müde.'],
    blank: 'bin',
    distractors: ['hungrig', 'habe'],
    note: 'sein (to be): ich bin',
  },
  {
    en: 'The house is red.',
    de: 'Das Haus ist rot.',
    words: ['Das', 'Haus', 'ist', 'rot.'],
    blank: 'rot',
    distractors: ['blau', 'der'],
    note: 'das Haus — neuter noun',
  },
  {
    en: 'They drink coffee.',
    de: 'Sie trinken Kaffee.',
    words: ['Sie', 'trinken', 'Kaffee.'],
    blank: 'trinken',
    distractors: ['essen', 'Tee'],
    note: 'trinken = 3rd person plural; same form as infinitive',
  },
  {
    en: 'I have a cat.',
    de: 'Ich habe eine Katze.',
    words: ['Ich', 'habe', 'eine', 'Katze.'],
    blank: 'eine',
    distractors: ['einen', 'Hund'],
    note: 'eine — feminine accusative (no change from nominative)',
  },
];

/**
 * A2 sentences — fill-in-the-blanks.
 * template: string with ___ markers for each blank (in order)
 * blanks: [{ word: correct answer, distractors: [wrong options] }]
 */
export const TRANSLATE_SENTENCES_A2 = [
  {
    en: 'I have a big dog.',
    de: 'Ich habe einen großen Hund.',
    template: 'Ich habe ___ ___ Hund.',
    blanks: [
      { word: 'einen', distractors: ['ein', 'eine'] },
      { word: 'großen', distractors: ['große', 'großes'] },
    ],
    note: 'Accusative masculine: einen + weak adjective ending -en',
  },
  {
    en: 'She goes to school.',
    de: 'Sie geht in die Schule.',
    template: 'Sie geht ___ ___ Schule.',
    blanks: [
      { word: 'in', distractors: ['zu', 'nach'] },
      { word: 'die', distractors: ['der', 'das'] },
    ],
    note: 'in + accusative (movement into); die Schule is feminine',
  },
  {
    en: 'I am drinking a coffee.',
    de: 'Ich trinke einen Kaffee.',
    template: 'Ich trinke ___ Kaffee.',
    blanks: [{ word: 'einen', distractors: ['ein', 'eine'] }],
    note: 'Accusative masculine indefinite article: einen',
  },
  {
    en: 'The child plays with the ball.',
    de: 'Das Kind spielt mit dem Ball.',
    template: 'Das Kind spielt mit ___ Ball.',
    blanks: [{ word: 'dem', distractors: ['der', 'den'] }],
    note: 'mit + dative; der Ball → dem Ball',
  },
  {
    en: 'He works in a hospital.',
    de: 'Er arbeitet in einem Krankenhaus.',
    template: 'Er arbeitet in ___ Krankenhaus.',
    blanks: [{ word: 'einem', distractors: ['einen', 'ein'] }],
    note: 'in + dative (location); das Krankenhaus → einem Krankenhaus',
  },
  {
    en: 'We are going to the cinema.',
    de: 'Wir gehen ins Kino.',
    template: 'Wir gehen ___ Kino.',
    blanks: [{ word: 'ins', distractors: ['im', 'zum'] }],
    note: 'ins = in + das (contraction for neuter accusative)',
  },
  {
    en: 'She gives the book to her friend.',
    de: 'Sie gibt ihrem Freund das Buch.',
    template: 'Sie gibt ___ Freund das Buch.',
    blanks: [{ word: 'ihrem', distractors: ['ihren', 'ihrer'] }],
    note: 'Dative masculine possessive: ihrem',
  },
  {
    en: 'The red car is fast.',
    de: 'Das rote Auto ist schnell.',
    template: 'Das ___ Auto ist schnell.',
    blanks: [{ word: 'rote', distractors: ['roten', 'roter'] }],
    note: 'After definite article das (neuter): adjective ending -e',
  },
  {
    en: 'I am going to my friend.',
    de: 'Ich gehe zu meinem Freund.',
    template: 'Ich gehe zu ___ Freund.',
    blanks: [{ word: 'meinem', distractors: ['meinen', 'mein'] }],
    note: 'zu + dative masculine: meinem',
  },
  {
    en: 'They are eating at the restaurant.',
    de: 'Sie essen im Restaurant.',
    template: 'Sie essen ___ Restaurant.',
    blanks: [{ word: 'im', distractors: ['in das', 'ins'] }],
    note: 'im = in + dem (dative, location not movement)',
  },
];

/**
 * B1 sentences — free typing, AI-graded.
 * de: the expected correct translation (shown in feedback)
 * note: grammar concept to highlight in feedback
 */
export const TRANSLATE_SENTENCES_B1 = [
  {
    en: 'Yesterday I went to the market and bought vegetables.',
    de: 'Gestern bin ich zum Markt gegangen und habe Gemüse gekauft.',
    blank: 'bin',
    distractors: ['habe', 'war'],
    note: 'Perfekt with sein (movement) and haben',
  },
  {
    en: 'If I had more time, I would learn more German.',
    de: 'Wenn ich mehr Zeit hätte, würde ich mehr Deutsch lernen.',
    blank: 'hätte',
    distractors: ['habe', 'hatte'],
    note: 'Konjunktiv II: hätte / würde + infinitive',
  },
  {
    en: 'The woman whose bag was stolen is at the police station.',
    de: 'Die Frau, deren Tasche gestohlen wurde, ist auf der Polizeistation.',
    blank: 'deren',
    distractors: ['dessen', 'die'],
    note: 'Relative clause with genitive: deren',
  },
  {
    en: 'She told me that she would come tomorrow.',
    de: 'Sie sagte mir, dass sie morgen kommen würde.',
    blank: 'dass',
    distractors: ['das', 'ob'],
    note: 'Indirect speech with Konjunktiv I/II; dass pushes verb to end',
  },
  {
    en: 'He has been living in Berlin for three years.',
    de: 'Er wohnt seit drei Jahren in Berlin.',
    blank: 'seit',
    distractors: ['für', 'vor'],
    note: 'German uses present tense + seit for ongoing actions',
  },
  {
    en: 'I need to finish this report before the meeting.',
    de: 'Ich muss diesen Bericht vor dem Meeting fertigstellen.',
    blank: 'dem',
    distractors: ['den', 'der'],
    note: 'Modal verb müssen + infinitive at end; vor + dative',
  },
  {
    en: 'The children who are playing outside are very loud.',
    de: 'Die Kinder, die draußen spielen, sind sehr laut.',
    blank: 'spielen',
    distractors: ['spielt', 'spiele'],
    note: 'Relative clause: die (nominative plural)',
  },
  {
    en: 'Despite the rain, we enjoyed the walk.',
    de: 'Trotz des Regens haben wir den Spaziergang genossen.',
    blank: 'des',
    distractors: ['dem', 'den'],
    note: 'trotz + genitive; Perfekt with haben',
  },
  {
    en: 'Could you please tell me where the nearest pharmacy is?',
    de: 'Könnten Sie mir bitte sagen, wo die nächste Apotheke ist?',
    blank: 'Könnten',
    distractors: ['Können', 'Konnten'],
    note: 'Polite Konjunktiv II: könnten; indirect question with verb-final',
  },
  {
    en: 'I would have called you if I had known your number.',
    de: 'Ich hätte dich angerufen, wenn ich deine Nummer gewusst hätte.',
    blank: 'hätte',
    distractors: ['habe', 'würde'],
    note: 'Conditional perfect: hätte + past participle',
  },
];

// ─── Chat Tab — Guided Tasks ──────────────────────────────────────────────────
