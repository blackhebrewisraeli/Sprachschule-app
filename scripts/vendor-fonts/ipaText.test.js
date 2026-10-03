// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ipaText } from './ipaText.js';

describe('ipaText', () => {
  it('collects every character under an `ipa` key, however nested', () => {
    const text = ipaText(
      { decks: { d: [{ de: 'Tür', ipa: '[tyːɐ̯]' }] } },
      { w: { ipa: '/ˈʃtʁaːsə/' } }
    );
    for (const ch of 'tyːɐ̯[]/ˈʃʁas') expect(text, ch).toContain(ch);
  });

  it('ignores every other field, so prose never widens the IPA face', () => {
    expect(ipaText({ de: 'Grüße', en: 'greetings', note: 'ü', ipa: '[ə]' })).toBe('[]ə');
  });

  it('is deduplicated and sorted, keeping the space but no other whitespace', () => {
    expect(ipaText({ ipa: 'b a  b\t\n' }, [{ ipa: 'a\u032f' }])).toBe(' ab\u032f');
  });

  it('is empty when there is no phonetic content', () => {
    expect(ipaText({}, [], null)).toBe('');
  });
});
