import { describe, it, expect } from 'vitest';
import {
  CHAT_IMPROV,
  chatKickoffMessage,
  chatSystemPrompt,
  chatVocabConstraint,
  chatServerConstraint,
  chatInterestBias,
  graderSystemPrompt,
  deckPrompts,
  sentencePrompts,
  SENTENCE_TOPICS,
} from './prompts';

const prompts = {
  persona: 'Anna',
  targetLanguage: 'German',
  levels: {
    a1: 'The learner is A1 BEGINNER. Use very simple German.',
    a2: 'The learner is A2 ELEMENTARY. Use natural but simple German.',
    b1: 'The learner is B1 INTERMEDIATE. Use natural German.',
  },
  exercises: {
    a1: 'A1 beginner (very simple sentences)',
    a2: 'A2 elementary (focus on articles and prepositions)',
    b1: 'B1 intermediate (complex grammar)',
  },
  deck: { cardExample: 'der Hund', ipaExample: '[deːɐ̯ hʊnt]' },
};

// The prompt's direct coverage. Check every part, not a sample.
describe('chatSystemPrompt', () => {
  const role = { name: 'Barista', brief: 'a friendly barista at a busy Berlin café.' };
  const base = { prompts, scenarioDesc: 'at a Berlin café', role, level: 'a1' };

  it('casts the AI as the scene role, not a tutor', () => {
    const out = chatSystemPrompt(base);
    expect(out).toContain('You are a friendly barista at a busy Berlin café.');
    expect(out).not.toContain('tutor named');
  });

  it('keeps the pack persona as the out-of-character coach', () => {
    expect(chatSystemPrompt(base)).toContain(
      "you are also Anna, the learner's warm and encouraging coach"
    );
  });

  it('falls back to the persona as a conversation partner without a role', () => {
    const out = chatSystemPrompt({ ...base, role: undefined });
    expect(out).toContain('You are Anna, a friendly conversation partner.');
    expect(out).not.toContain('undefined');
  });

  it('names the scene and the target language', () => {
    expect(chatSystemPrompt(base)).toContain(
      'This is a German conversation-practice scene: at a Berlin café.'
    );
  });

  it('forbids scripted replies', () => {
    expect(chatSystemPrompt(base)).toContain('never use stock phrases or follow a script');
  });

  it('includes the level pedagogy for the level given', () => {
    expect(chatSystemPrompt(base)).toContain('The learner is A1 BEGINNER');
    expect(chatSystemPrompt({ ...base, level: 'b1' })).toContain('The learner is B1 INTERMEDIATE');
    expect(chatSystemPrompt({ ...base, level: 'b1' })).not.toContain('A1 BEGINNER');
  });

  it.each(['fast', 'balanced', 'capable'])('carries only the %s improv register', (profile) => {
    const out = chatSystemPrompt({ ...base, profile });
    expect(out).toContain(CHAT_IMPROV[profile]);
    for (const other of Object.keys(CHAT_IMPROV).filter((p) => p !== profile)) {
      expect(out).not.toContain(CHAT_IMPROV[other]);
    }
  });

  it('uses the balanced register for a missing or unknown profile', () => {
    expect(chatSystemPrompt(base)).toContain(CHAT_IMPROV.balanced);
    expect(chatSystemPrompt({ ...base, profile: 'turbo' })).toContain(CHAT_IMPROV.balanced);
  });

  it('carries the engine JSON contract including the next suggestion', () => {
    const out = chatSystemPrompt(base);
    expect(out).toContain('You MUST always respond with strict JSON only');
    const keys = ['"de"', '"ipa"', '"en"', '"correction"', '"taskComplete"', '"next"'];
    for (const key of [...keys, '"blank"', '"distractors"']) {
      expect(out).toContain(key);
    }
  });

  it('never grades the opening line', () => {
    expect(chatSystemPrompt(base)).toContain('always null for your opening line');
  });

  it('adds the task sentence only when a task is given', () => {
    const withTask = chatSystemPrompt({ ...base, task: 'Order a coffee' });
    expect(withTask).toContain(`The learner's current task is: "Order a coffee"`);
    expect(chatSystemPrompt(base)).not.toContain('current task is');
  });

  // The level-key trap: cefrLevels is uppercase, components pass lowercase.
  // A mismatch does not throw — it interpolates the string "undefined".
  it('never emits the literal string undefined', () => {
    for (const level of ['a1', 'a2', 'b1', 'nope']) {
      expect(chatSystemPrompt({ ...base, level })).not.toContain('undefined');
    }
  });

  it('falls back to a1 pedagogy when the level key is missing', () => {
    expect(chatSystemPrompt({ ...base, level: 'nope' })).toContain('The learner is A1 BEGINNER');
  });

  it('includes the learned-vocab allowlist and the sparse starter note', () => {
    const learned = chatSystemPrompt({ ...base, vocab: ['hello', 'please'] });
    expect(learned).toContain("Stay within the learner's known vocabulary.");
    expect(learned).toContain('Prefer these terms: hello, please.');
    expect(learned).not.toContain('starter set');

    const sparse = chatSystemPrompt({
      ...base,
      vocab: ['hello'],
      sparse: true,
    });
    expect(sparse).toContain('small starter set');
    expect(sparse).toContain('hello');
  });

  it('still composes when the allowlist is empty', () => {
    const out = chatSystemPrompt({ ...base, vocab: [] });
    expect(out).toContain('no learned vocabulary yet');
    expect(out).not.toContain('undefined');
  });

  it('names enabled interest topics only when hints are supplied', () => {
    const biased = chatSystemPrompt({
      ...base,
      interestHints: ['sports and athletic activities'],
    });
    expect(biased).toContain('interest topics: sports and athletic activities');
    expect(biased).toContain('Do not force a topic');
    expect(chatSystemPrompt(base)).not.toContain('interest topics');
  });
});

describe('chatKickoffMessage', () => {
  it('is bracketed stage direction the model is told not to correct', () => {
    const kickoff = chatKickoffMessage();
    expect(kickoff.startsWith('[')).toBe(true);
    expect(kickoff).toContain('Open the scene in character');
    expect(kickoff).toContain('do not correct it');
  });
});

describe('chatVocabConstraint / chatServerConstraint', () => {
  it('describes function words without naming a language', () => {
    const out = chatVocabConstraint({ vocab: ['hello'] });
    expect(out).toContain('articles, pronouns, auxiliaries');
    expect(out).not.toMatch(/\bsein\b|\bhaben\b/);
  });

  it('pins the CEFR band on the server appendix', () => {
    const out = chatServerConstraint({ level: 'a1', vocab: ['hello'] });
    expect(out).toContain('Server constraint (authoritative)');
    expect(out).toContain('Learner CEFR band: a1');
    expect(out).toContain('hello');
    expect(out).not.toContain('undefined');
  });

  it('omits the interest bias when there are no hints', () => {
    expect(chatInterestBias()).toBe('');
    expect(chatInterestBias({ hints: [] })).toBe('');
    expect(chatInterestBias({ hints: ['  ', null] })).toBe('');
  });
});

describe('graderSystemPrompt', () => {
  it('names the target language on both sides of the translation', () => {
    const out = graderSystemPrompt({ prompts });
    expect(out).toContain('You are a German language grader');
    expect(out).toContain('translate an English sentence into German');
  });

  it('carries the three-verdict contract', () => {
    const out = graderSystemPrompt({ prompts });
    expect(out).toContain('"verdict": "correct" | "almost" | "wrong"');
    expect(out).toContain('"corrected"');
    expect(out).toContain('"message"');
    expect(out).toContain('Use "almost" if');
  });

  it('never emits the literal string undefined', () => {
    expect(graderSystemPrompt({ prompts })).not.toContain('undefined');
  });
});

describe('deckPrompts', () => {
  it('uses the pack card and IPA examples', () => {
    const { user } = deckPrompts({ prompts, topic: 'weather' });
    expect(user).toContain('der Hund');
    expect(user).toContain('[deːɐ̯ hʊnt]');
  });

  it('puts the topic in the user message and the shape in the system prompt', () => {
    const { system, user } = deckPrompts({ prompts, topic: 'weather' });
    expect(system).toContain('You generate German vocabulary flashcards');
    expect(user).toContain('on the topic: "weather"');
    expect(user).toContain('Generate exactly 10 German flashcards');
  });

  it('never emits the literal string undefined', () => {
    const { system, user } = deckPrompts({ prompts, topic: 'weather' });
    expect(system + user).not.toContain('undefined');
  });
});

describe('sentencePrompts', () => {
  const topic = SENTENCE_TOPICS[0];

  it('uses the pack exercise focus for the level', () => {
    expect(sentencePrompts({ prompts, level: 'a2', topic }).system).toContain(
      'A2 elementary (focus on articles and prepositions)'
    );
  });

  it('sets the batch in the given scene', () => {
    expect(sentencePrompts({ prompts, level: 'a1', topic: 'a rock concert' }).user).toContain(
      'scene: a rock concert'
    );
  });

  // Every Translate mode renders from one row shape, so every level asks for it.
  it.each(['a1', 'a2', 'b1'])('asks for the scaffold shape at %s', (level) => {
    const { user } = sentencePrompts({ prompts, level, topic });
    for (const key of ['"en"', '"de"', '"blank"', '"distractors"', '"note"']) {
      expect(user).toContain(key);
    }
    expect(user).toContain(`${level.toUpperCase()} level`);
  });

  it('never emits the literal string undefined at any level', () => {
    for (const level of ['a1', 'a2', 'b1']) {
      const { system, user } = sentencePrompts({ prompts, level, topic });
      expect(system + user).not.toContain('undefined');
    }
  });
});

describe('SENTENCE_TOPICS', () => {
  it('offers varied, non-empty, distinct scenes', () => {
    expect(SENTENCE_TOPICS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(SENTENCE_TOPICS).size).toBe(SENTENCE_TOPICS.length);
    for (const t of SENTENCE_TOPICS) expect(t.trim()).not.toBe('');
  });
});
