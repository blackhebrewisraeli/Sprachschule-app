import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrivacyPolicy from './PrivacyPolicy';
import { PRIVACY_VERSION } from '../../lib/legalAcceptance';

describe('PrivacyPolicy', () => {
  it('renders the document title', () => {
    render(<PrivacyPolicy />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('shows the effective date, derived from PRIVACY_VERSION', () => {
    expect(PRIVACY_VERSION).toBe('2026-10-06');
    render(<PrivacyPolicy />);
    expect(screen.getByText('Last Updated: October 6, 2026')).toBeInTheDocument();
  });

  it('carries the ten numbered sections, in order', () => {
    render(<PrivacyPolicy />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '1. Who We Are',
      '2. Information We Collect',
      '3. How We Use Your Information',
      '4. What Other Learners Can See',
      '5. Service Providers',
      '6. How Long We Keep Your Data',
      '7. Your Right to Access and Delete Your Data',
      '8. Your Choices',
      '9. Children',
      '10. Changes to This Policy',
    ]);
  });

  it('ships no unfilled placeholder', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(/\[|\]/);
  });

  it('carries the current brand and contact, never the old ones', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(/Deutsch App/);
    expect(container.textContent).not.toMatch(/esterkinshimon712@gmail\.com/);
    expect(container.textContent).toMatch(/sprachschule\.support@gmail\.com/);
    expect(container.textContent).toMatch(/www\.sprachschule-app\.com/);
    // The domain is the only place the old product name may still appear.
    expect(container.textContent.replaceAll('sprachschule-app.com', '')).not.toMatch(
      /sprachschule-app/
    );
  });

  it('no longer makes the two claims the audit disproved', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(/scrubbed of personally identifiable information/);
    expect(container.textContent).not.toMatch(/performance monitoring\)/);
  });

  it('reproduces the approved copy verbatim', () => {
    render(<PrivacyPolicy />);
    for (const phrase of [
      'You can use Deutsch Sprachschule without an account.',
      'is operated by Shimon Esterkin.',
      'or with Apple, Google or GitHub — we collect your email address',
      'a private relay address that forwards to you',
      'If we introduce paid subscriptions or advertising in the future, we will update this policy',
      'You can ask us at any time for a copy of your data, to correct it, or to delete your account',
      "deleting your account also asks Apple to revoke our app's access to your Apple ID",
      'as described at www.sprachschule-app.com/delete-account',
      'We will delete your account within 30 days',
      'not intended for children under 13',
      'contact us at sprachschule.support@gmail.com.',
      'is sent through our server to Anthropic, which generates the response.',
      'We do not send your name, email address or account ID with these requests.',
      'We configure Sentry not to attach your account ID or email address',
      'These tools do not use cookies.',
      'Apple Push Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on Android)',
      'Push notifications are optional',
      'a copy can remain in our database until your account is deleted.',
      'We do not sell your data or use it for targeted advertising.',
      'we store the conversations you have with the tutor',
      'This is off unless you turn it on, and we do not save a tutor conversation before you do.',
      'Conversations you have as a guest are never saved.',
      'We do not use them to train AI models, for advertising or to build profiles',
      'Saved tutor conversations are deleted automatically about 90 days after the last message in them.',
      'We keep at most 20 conversations of up to 50 messages each for your account',
      'including your saved tutor conversations, and permanently delete your account',
      'in Chat → History, or in Settings → Account → Tutor conversations',
      'problem reports, saved tutor conversations, notification tokens and acceptance records',
      'new conversations stop being saved straight away',
    ]) {
      expect(
        screen.getByText(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      ).toBeInTheDocument();
    }
  });

  it('lists collection, providers, retention and choices as real lists', () => {
    render(<PrivacyPolicy />);
    expect(screen.getAllByRole('listitem')).toHaveLength(27);
    for (const term of ['Account Information:', 'Learning Data:', 'Error Reports:']) {
      expect(screen.getByText(term)).toBeInTheDocument();
    }
  });

  it('passes its back control through', async () => {
    const onBack = vi.fn();
    render(<PrivacyPolicy onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the app' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
