import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as allowlist from './signupAllowlist.js';
import {
  parseSignupAllowlist,
  signupAllowlistActive,
  userAllowedBySignupList,
  readServerSignupAllowlist,
  assertSignupAllowed,
  isBetaSignupDenial,
  BETA_SIGNUP_DENIED_MESSAGE,
  SIGNUP_NOT_ALLOWED_CODE,
  SIGNUP_NOT_ALLOWED_MESSAGE,
} from './signupAllowlist.js';

// Placeholder addresses only — never a real tester or owner mailbox.
const OWNER = 'owner@example.test';
const STRANGER = 'stranger@example.test';
const FRIEND = 'friend@example.test';

const HOOK_MIGRATION = 'supabase/migrations/20261011120000_beta_signup_allowlist_hook.sql';

const confirmed = (email, extra = {}) => ({
  id: 'uid-1',
  email,
  email_confirmed_at: '2026-09-18T00:00:00Z',
  ...extra,
});

describe('parseSignupAllowlist', () => {
  it('is empty for unset, empty, and whitespace-only values (gate off)', () => {
    expect(parseSignupAllowlist(undefined)).toEqual([]);
    expect(parseSignupAllowlist('')).toEqual([]);
    expect(parseSignupAllowlist('   ,  , ')).toEqual([]);
    expect(parseSignupAllowlist(null)).toEqual([]);
  });

  it('splits, trims, lowercases, and de-dupes', () => {
    expect(parseSignupAllowlist(` ${OWNER.toUpperCase()} , ${FRIEND} , ${OWNER} ,`)).toEqual([
      OWNER,
      FRIEND,
    ]);
  });
});

describe('signupAllowlistActive', () => {
  it('is false for an empty list and true once any address is present', () => {
    expect(signupAllowlistActive([])).toBe(false);
    expect(signupAllowlistActive([OWNER])).toBe(true);
  });
});

describe('userAllowedBySignupList — default off', () => {
  it('allows anyone, including a stranger and an unverified user', () => {
    expect(userAllowedBySignupList(confirmed(STRANGER), [])).toBe(true);
    expect(userAllowedBySignupList({ email: STRANGER }, [])).toBe(true);
    expect(userAllowedBySignupList(null, [])).toBe(true);
  });
});

describe('userAllowedBySignupList — closed list', () => {
  const list = parseSignupAllowlist(`${OWNER},${FRIEND}`);

  it('allows a verified listed mailbox', () => {
    expect(userAllowedBySignupList(confirmed(OWNER), list)).toBe(true);
    expect(userAllowedBySignupList(confirmed(FRIEND), list)).toBe(true);
  });

  it('denies a verified stranger', () => {
    expect(userAllowedBySignupList(confirmed(STRANGER), list)).toBe(false);
  });

  it('denies an unverified address even when it matches the list', () => {
    expect(userAllowedBySignupList({ email: OWNER }, list)).toBe(false);
  });

  it('denies an unconfirmed email-provider identity that matches the list', () => {
    const user = {
      email: OWNER,
      email_confirmed_at: null,
      identities: [{ provider: 'email', identity_data: { email: OWNER, email_verified: false } }],
    };
    expect(userAllowedBySignupList(user, list)).toBe(false);
  });

  it('allows a verified Google identity whose primary is unconfirmed', () => {
    const user = {
      email: STRANGER,
      email_confirmed_at: null,
      identities: [{ provider: 'google', identity_data: { email: OWNER, email_verified: true } }],
    };
    expect(userAllowedBySignupList(user, list)).toBe(true);
  });

  it('ignores user_metadata emails', () => {
    const user = {
      email: STRANGER,
      email_confirmed_at: '2026-09-18T00:00:00Z',
      user_metadata: { email: OWNER },
    };
    expect(userAllowedBySignupList(user, list)).toBe(false);
  });
});

describe('readServerSignupAllowlist', () => {
  it('reads SIGNUP_EMAIL_ALLOWLIST from the provided env', () => {
    expect(readServerSignupAllowlist({ SIGNUP_EMAIL_ALLOWLIST: OWNER })).toEqual([OWNER]);
    expect(readServerSignupAllowlist({ SIGNUP_EMAIL_ALLOWLIST: '' })).toEqual([]);
    expect(readServerSignupAllowlist({})).toEqual([]);
  });

  it('never falls back to a client (VITE_) variable', () => {
    expect(readServerSignupAllowlist({ VITE_SIGNUP_EMAIL_ALLOWLIST: OWNER })).toEqual([]);
  });
});

describe('no client-side copy of the list', () => {
  // The client list was inlined into the public bundle. Nothing may read it.
  it('exports no reader or pre-check for a bundled list', () => {
    expect(allowlist).not.toHaveProperty('readClientSignupAllowlist');
    expect(allowlist).not.toHaveProperty('typedEmailAllowedForSignup');
  });
});

describe('assertSignupAllowed', () => {
  it('does not throw when the list is open', () => {
    expect(() => assertSignupAllowed(confirmed(STRANGER), [])).not.toThrow();
  });

  it('throws signup_not_allowed for a closed-list miss, with human copy', () => {
    try {
      assertSignupAllowed(confirmed(STRANGER), [OWNER]);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({
        code: SIGNUP_NOT_ALLOWED_CODE,
        message: SIGNUP_NOT_ALLOWED_MESSAGE,
      });
    }
  });

  it('lets a listed mailbox through a closed list', () => {
    expect(() => assertSignupAllowed(confirmed(OWNER), [OWNER])).not.toThrow();
  });
});

describe('the Auth hook refusal', () => {
  // GoTrue relays only a status and the hook's message, so the message IS the
  // contract between the migration and the client.
  it('is the exact message the before-user-created hook returns', () => {
    const sql = readFileSync(HOOK_MIGRATION, 'utf8');
    expect(sql).toContain(`'message', '${BETA_SIGNUP_DENIED_MESSAGE}'`);
  });

  it('names no address and no reason, so it reveals nothing about the list', () => {
    expect(BETA_SIGNUP_DENIED_MESSAGE).not.toMatch(/@|list|error|not found|unknown/i);
  });

  it('is recognised in an SDK error message', () => {
    expect(isBetaSignupDenial(BETA_SIGNUP_DENIED_MESSAGE)).toBe(true);
    expect(isBetaSignupDenial(`AuthApiError: ${BETA_SIGNUP_DENIED_MESSAGE}`)).toBe(true);
  });

  it('is recognised in a decoded OAuth callback, where spaces arrive as +', () => {
    const query = new URLSearchParams({ error_description: BETA_SIGNUP_DENIED_MESSAGE }).toString();
    expect(isBetaSignupDenial(decodeURIComponent(query))).toBe(true);
  });

  it('is not confused with other failures', () => {
    expect(isBetaSignupDenial('Signups not allowed for otp')).toBe(false);
    expect(isBetaSignupDenial('Email link is invalid or has expired')).toBe(false);
    expect(isBetaSignupDenial(undefined)).toBe(false);
    expect(isBetaSignupDenial({ message: BETA_SIGNUP_DENIED_MESSAGE })).toBe(false);
  });
});
