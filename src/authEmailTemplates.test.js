import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// An address GoTrue has never confirmed gets the "Confirm signup" email, not
// "Magic Link", whenever confirmations are on (the hosted project). Native and
// installed-PWA testers can only sign in with the 6-digit code, so a first-time
// tester is stuck unless BOTH templates carry it. Local GoTrue reads these from
// supabase/config.toml; the hosted dashboard is a manual paste of the same file
// (docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md).
//
// Relative paths, matching src/safeArea.test.js: vitest runs from the repo root.

const CONFIG = readFileSync('supabase/config.toml', 'utf8').split('\n');

/** `key = value` pairs of one `[section]` (values as strings), or null if absent. */
function tomlSection(name) {
  const start = CONFIG.indexOf(`[${name}]`);
  if (start === -1) return null;
  const out = {};
  for (const line of CONFIG.slice(start + 1)) {
    if (line.startsWith('[')) break;
    const m = line.match(/^(\w+)\s*=\s*(?:"([^"]*)"|(\S+))/);
    if (m) out[m[1]] = m[2] ?? m[3];
  }
  return out;
}

const SIGN_IN = 'auth.email.template.magic_link';
const SIGN_UP = 'auth.email.template.confirmation';

describe('auth email templates', () => {
  it.each([SIGN_IN, SIGN_UP])('[%s] sends the code, the link, the brand and the expiry', (name) => {
    const section = tomlSection(name);
    expect(section, `[${name}] is missing from supabase/config.toml`).not.toBeNull();
    const html = readFileSync(section.content_path, 'utf8');
    expect(html).toMatch(/\{\{\s*\.Token\s*\}\}/);
    expect(html).toMatch(/\{\{\s*\.ConfirmationURL\s*\}\}/);
    expect(html).toContain('Deutsch · Sprachschule');
    expect(html).toContain('This code expires in five minutes.');
  });

  it('Confirm signup sends exactly the Magic Link subject and body', () => {
    expect(tomlSection(SIGN_UP)).toEqual(tomlSection(SIGN_IN));
  });

  it('"five minutes" in the footer is the configured OTP expiry', () => {
    expect(tomlSection('auth.email').otp_expiry).toBe('300');
  });
});

// Local sign-in emails land in the CLI's mail catcher. Its section is
// [local_smtp]; [inbucket] is the deprecated name that CI's pinned CLI
// (2.114.0) still accepts but warns about.
describe('local mail catcher config', () => {
  it('uses [local_smtp] with the same values [inbucket] had', () => {
    expect(tomlSection('inbucket')).toBeNull();
    expect(tomlSection('local_smtp')).toEqual({ enabled: 'true', port: '54324' });
  });
});
