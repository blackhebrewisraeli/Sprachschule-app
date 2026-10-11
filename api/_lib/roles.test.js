import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ADMIN_EMAILS,
  SYSTEM_ACCOUNT_EMAILS,
  INCLUDE_SYSTEM_ACCOUNTS_IN_STATS,
  normalizeEmail,
  verifiedEmailsFromUser,
  classifyAuthUser,
} from './roles.js';

const ADMIN = 'esterkinshimon712@gmail.com';
const OTHER = 'blackhebrewisraeli@gmail.com';

const confirmed = (email, extra = {}) => ({
  id: 'uid-1',
  email,
  email_confirmed_at: '2026-09-18T00:00:00Z',
  ...extra,
});

describe('allowlists', () => {
  it('grants admin and system classification to the same v1 mailbox, as two lists', () => {
    expect(ADMIN_EMAILS).toEqual([ADMIN]);
    expect(SYSTEM_ACCOUNT_EMAILS).toEqual([ADMIN]);
    expect(ADMIN_EMAILS).not.toContain(OTHER);
    expect(SYSTEM_ACCOUNT_EMAILS).not.toContain(OTHER);
  });

  it('keeps system accounts in stats and leagues', () => {
    expect(INCLUDE_SYSTEM_ACCOUNTS_IN_STATS).toBe(true);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail(`  ${ADMIN.toUpperCase()}  `)).toBe(ADMIN);
  });

  it('drops non-strings', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail({ email: ADMIN })).toBe('');
  });
});

describe('verifiedEmailsFromUser', () => {
  it('includes a confirmed primary email', () => {
    expect(verifiedEmailsFromUser(confirmed(ADMIN))).toEqual([ADMIN]);
  });

  it('omits an unconfirmed primary email', () => {
    expect(verifiedEmailsFromUser({ email: ADMIN, email_confirmed_at: null })).toEqual([]);
  });

  it('includes a verified Google identity even when the primary is unverified', () => {
    const user = {
      email: 'other@example.com',
      email_confirmed_at: null,
      identities: [
        {
          provider: 'google',
          identity_data: { email: ADMIN, email_verified: true },
        },
      ],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([ADMIN]);
  });

  // A password signup creates an email identity before the mailbox is proven;
  // the provider name is not evidence. A completed magic link sets
  // email_confirmed_at, which is (src/lib/verifiedEmails.test.js).
  it('does not treat an email-provider identity alone as verified', () => {
    const user = {
      email: ADMIN,
      email_confirmed_at: null,
      identities: [{ provider: 'email', identity_data: { email: ADMIN } }],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });

  it('ignores an unverified Google identity for the allowlist mailbox', () => {
    const user = {
      email: ADMIN,
      email_confirmed_at: null,
      identities: [
        {
          provider: 'google',
          identity_data: { email: ADMIN, email_verified: false },
        },
      ],
    };
    expect(verifiedEmailsFromUser(user)).toEqual([]);
  });

  it('ignores user_metadata and app_metadata emails', () => {
    const user = {
      email: OTHER,
      email_confirmed_at: '2026-09-18T00:00:00Z',
      user_metadata: { email: ADMIN, isAdmin: true },
      app_metadata: { admin_email: ADMIN, role: 'admin' },
    };
    expect(verifiedEmailsFromUser(user)).toEqual([OTHER]);
  });
});

describe('classifyAuthUser', () => {
  it('grants admin + system for a confirmed primary admin mailbox', () => {
    expect(classifyAuthUser(confirmed(ADMIN))).toEqual({
      isAdmin: true,
      isSystemAccount: true,
      emails: [ADMIN],
    });
  });

  it('grants the same authority for a Google identity with that mailbox', () => {
    const flags = classifyAuthUser({
      email: ADMIN,
      email_confirmed_at: '2026-09-18T00:00:00Z',
      identities: [{ provider: 'google', identity_data: { email: ADMIN, email_verified: true } }],
    });
    expect(flags.isAdmin).toBe(true);
    expect(flags.isSystemAccount).toBe(true);
  });

  it('grants the same authority once a magic link has confirmed that mailbox', () => {
    const flags = classifyAuthUser({
      email: ADMIN,
      email_confirmed_at: '2026-09-18T00:00:00Z',
      identities: [
        { provider: 'email', email: ADMIN, identity_data: { email: ADMIN, email_verified: true } },
      ],
    });
    expect(flags.isAdmin).toBe(true);
    expect(flags.isSystemAccount).toBe(true);
  });

  it('does not grant admin to an unconfirmed email identity for that mailbox', () => {
    const flags = classifyAuthUser({
      email: ADMIN,
      email_confirmed_at: null,
      identities: [
        { provider: 'email', email: ADMIN, identity_data: { email: ADMIN, email_verified: false } },
      ],
    });
    expect(flags.isAdmin).toBe(false);
    expect(flags.isSystemAccount).toBe(false);
  });

  it('does not grant admin to blackhebrewisraeli@gmail.com', () => {
    expect(classifyAuthUser(confirmed(OTHER))).toEqual({
      isAdmin: false,
      isSystemAccount: false,
      emails: [OTHER],
    });
  });

  it('does not grant admin to an unverified allowlist address', () => {
    expect(classifyAuthUser({ email: ADMIN }).isAdmin).toBe(false);
  });

  it('does not grant admin from metadata or a role claim', () => {
    const flags = classifyAuthUser({
      email: OTHER,
      email_confirmed_at: '2026-09-18T00:00:00Z',
      role: 'admin',
      user_metadata: { isAdmin: true, role: 'admin' },
      app_metadata: { role: 'admin', is_admin: true },
    });
    expect(flags.isAdmin).toBe(false);
    expect(flags.isSystemAccount).toBe(false);
  });

  it('returns no privileges for a missing user', () => {
    expect(classifyAuthUser(null)).toEqual({
      isAdmin: false,
      isSystemAccount: false,
      emails: [],
    });
  });
});

describe('classification is not an exclusion filter', () => {
  it('stats and league logic do not import the role module', () => {
    expect(readFileSync('src/lib/stats.js', 'utf8')).not.toMatch(
      /isSystemAccount|ADMIN_EMAILS|roles\.js/
    );
    expect(readFileSync('api/_lib/leagueLogic.js', 'utf8')).not.toMatch(
      /isSystemAccount|ADMIN_EMAILS|roles\.js/
    );
  });
});
