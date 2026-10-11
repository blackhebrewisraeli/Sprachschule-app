import { describe, it, expect } from 'vitest';
import { normalizeEmail, verifiedEmailsFromUser } from './verifiedEmails.js';

// "Is this address proven?" feeds the API's signup gate and admin
// classification, so every way a user object can claim an address is pinned.
const ME = 'learner@example.test';
const OTHER = 'other@example.test';
const CONFIRMED_AT = '2026-10-11T00:00:00Z';

describe('verifiedEmailsFromUser — confirmed primary', () => {
  it('counts a primary address once Auth has confirmed it', () => {
    expect(verifiedEmailsFromUser({ email: ME, email_confirmed_at: CONFIRMED_AT })).toEqual([ME]);
  });

  it('counts a completed magic link: confirmed user plus its verified email identity', () => {
    const user = {
      email: ME,
      email_confirmed_at: CONFIRMED_AT,
      identities: [{ provider: 'email', identity_data: { email: ME, email_verified: true } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });

  it('normalises case and whitespace', () => {
    const user = { email: `  ${ME.toUpperCase()} `, email_confirmed_at: CONFIRMED_AT };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });
});

describe('verifiedEmailsFromUser — unconfirmed', () => {
  it('omits a primary address with no confirmation', () => {
    expect(verifiedEmailsFromUser({ email: ME, email_confirmed_at: null })).toEqual([]);
    expect(verifiedEmailsFromUser({ email: ME })).toEqual([]);
  });

  // A password signup creates exactly this shape before anyone proves they own
  // the mailbox. The provider name alone used to count as proof.
  it('does not treat an email-provider identity as proof on its own', () => {
    const user = {
      email: ME,
      email_confirmed_at: null,
      identities: [{ provider: 'email', identity_data: { email: ME, email_verified: false } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });

  it('does not treat an email identity with no verification flag as proof', () => {
    const user = { identities: [{ provider: 'email', email: ME, identity_data: { email: ME } }] };
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });
});

describe('verifiedEmailsFromUser — OAuth identities', () => {
  it('counts an identity the provider marks verified, even with an unconfirmed primary', () => {
    const user = {
      email: OTHER,
      email_confirmed_at: null,
      identities: [{ provider: 'google', identity_data: { email: ME, email_verified: true } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });

  it("accepts the string 'true' some providers send", () => {
    const user = {
      identities: [{ provider: 'apple', identity_data: { email: ME, email_verified: 'true' } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });

  it('omits an identity the provider marks unverified', () => {
    const user = {
      identities: [{ provider: 'github', identity_data: { email: ME, email_verified: false } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });

  it('de-duplicates the same address proven twice', () => {
    const user = {
      email: ME,
      email_confirmed_at: CONFIRMED_AT,
      identities: [{ provider: 'google', identity_data: { email: ME, email_verified: true } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });

  it('ignores metadata emails, which the user can edit', () => {
    const user = {
      email: ME,
      email_confirmed_at: CONFIRMED_AT,
      user_metadata: { email: OTHER, email_verified: true },
      app_metadata: { email: OTHER },
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });
});

describe('verifiedEmailsFromUser — malformed input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', ME],
    ['an empty object', {}],
  ])('returns nothing for %s', (_label, user) => {
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });

  it('skips identities that are not objects or carry no usable address', () => {
    const user = {
      identities: [
        null,
        'google',
        { provider: 'google' },
        { provider: 'google', identity_data: 'not an object', email_verified: true },
        { provider: 'google', identity_data: { email: 42, email_verified: true } },
        { provider: 'google', identity_data: { email: '   ', email_verified: true } },
      ],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });

  it('ignores an identities value that is not an array', () => {
    const user = {
      email: ME,
      email_confirmed_at: CONFIRMED_AT,
      identities: { provider: 'google', identity_data: { email: OTHER, email_verified: true } },
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ME]);
  });

  it('does not let a non-string primary through', () => {
    expect(
      verifiedEmailsFromUser({ email: { address: ME }, email_confirmed_at: CONFIRMED_AT })
    ).toEqual([]);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases strings and drops everything else', () => {
    expect(normalizeEmail(`  ${ME.toUpperCase()}  `)).toBe(ME);
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(7)).toBe('');
  });
});
