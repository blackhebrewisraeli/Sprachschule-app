import { describe, it, expect, vi, beforeEach } from 'vitest';

const supa = vi.hoisted(() => ({ rows: [], selectError: null, rpcError: null, rpc: vi.fn() }));
vi.mock('./auth.js', () => ({
  getSupabase: async () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: supa.selectError ? null : supa.rows, error: supa.selectError }),
      }),
    }),
    rpc: async (...args) => {
      supa.rpc(...args);
      return { error: supa.rpcError };
    },
  }),
}));

import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  LEGAL_INTENT_KEY,
  INTENT_TTL_MS,
  hintCovers,
  writeAcceptedHint,
  recordIntent,
  clearIntent,
  hasValidIntent,
  fetchAcceptances,
  acceptCurrentTerms,
} from './legalAcceptance.js';

beforeEach(() => {
  localStorage.clear();
  supa.rows = [];
  supa.selectError = null;
  supa.rpcError = null;
  supa.rpc.mockClear();
});

describe('versions', () => {
  it('are ISO dates', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('accepted hint', () => {
  it('covers only the same user and the current versions', () => {
    writeAcceptedHint('u1');
    expect(hintCovers('u1')).toBe(true);
    expect(hintCovers('u2')).toBe(false);
  });

  it('does not cover an older version (a bump re-asks, even offline)', () => {
    localStorage.setItem(
      'deutsch-app-legal-accepted-v1',
      JSON.stringify({ userId: 'u1', terms: '2000-01-01', privacy: PRIVACY_VERSION })
    );
    expect(hintCovers('u1')).toBe(false);
  });

  it('does not cover a partial version bump (privacy only)', () => {
    localStorage.setItem(
      'deutsch-app-legal-accepted-v1',
      JSON.stringify({ userId: 'u1', terms: TERMS_VERSION, privacy: '2000-01-01' })
    );
    expect(hintCovers('u1')).toBe(false);
  });

  it('treats garbage as absent', () => {
    localStorage.setItem('deutsch-app-legal-accepted-v1', '{nope');
    expect(hintCovers('u1')).toBe(false);
  });
});

describe('intent', () => {
  it('is valid within the TTL for the current versions', () => {
    recordIntent(1000);
    expect(hasValidIntent(1000 + INTENT_TTL_MS - 1)).toBe(true);
  });

  it('expires after the TTL', () => {
    recordIntent(1000);
    expect(hasValidIntent(1000 + INTENT_TTL_MS + 1)).toBe(false);
  });

  it('is invalid for other versions', () => {
    localStorage.setItem(
      LEGAL_INTENT_KEY,
      JSON.stringify({ terms: '2000-01-01', privacy: PRIVACY_VERSION, at: Date.now() })
    );
    expect(hasValidIntent()).toBe(false);
  });

  it('is invalid for a partial version bump (privacy only)', () => {
    localStorage.setItem(
      LEGAL_INTENT_KEY,
      JSON.stringify({ terms: TERMS_VERSION, privacy: '2000-01-01', at: Date.now() })
    );
    expect(hasValidIntent()).toBe(false);
  });

  it('clearIntent removes it', () => {
    recordIntent();
    clearIntent();
    expect(hasValidIntent()).toBe(false);
  });
});

describe('server calls', () => {
  it('reports current when the pair is on record', async () => {
    supa.rows = [{ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }];
    await expect(fetchAcceptances('u1')).resolves.toEqual({ current: true, hasPrior: true });
  });

  it('reports prior-only for an older pair', async () => {
    supa.rows = [{ terms_version: '2000-01-01', privacy_version: '2000-01-01' }];
    await expect(fetchAcceptances('u1')).resolves.toEqual({ current: false, hasPrior: true });
  });

  it('reports prior-only for a partial version bump (privacy only)', async () => {
    supa.rows = [{ terms_version: TERMS_VERSION, privacy_version: '2000-01-01' }];
    await expect(fetchAcceptances('u1')).resolves.toEqual({ current: false, hasPrior: true });
  });

  it('throws on a read error (e.g. the table is not deployed yet)', async () => {
    supa.selectError = { code: 'PGRST205', message: 'relation not found' };
    await expect(fetchAcceptances('u1')).rejects.toBeTruthy();
  });

  it('accepts the current pair through the RPC', async () => {
    await acceptCurrentTerms();
    expect(supa.rpc).toHaveBeenCalledWith('accept_legal_terms', {
      p_terms_version: TERMS_VERSION,
      p_privacy_version: PRIVACY_VERSION,
    });
  });

  it('throws when the RPC fails', async () => {
    supa.rpcError = { message: 'offline' };
    await expect(acceptCurrentTerms()).rejects.toBeTruthy();
  });
});
