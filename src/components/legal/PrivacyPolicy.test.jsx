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
    expect(PRIVACY_VERSION).toBe('2026-09-29');
    render(<PrivacyPolicy />);
    expect(screen.getByText('Last Updated: September 29, 2026')).toBeInTheDocument();
  });

  it('carries the nine numbered sections, in order', () => {
    render(<PrivacyPolicy />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '1. Who We Are',
      '2. Information We Collect',
      '3. How We Use Your Information',
      '4. What Other Learners Can See',
      '5. Service Providers',
      '6. How Long We Keep Your Data',
      '7. Exporting and Deleting Your Data',
      '8. Your Choices',
      '9. Changes to This Policy',
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
  });

  it('no longer makes the two claims the audit disproved', () => {
    const { container } = render(<PrivacyPolicy />);
    expect(container.textContent).not.toMatch(/scrubbed of personally identifiable information/);
    expect(container.textContent).not.toMatch(/performance monitoring\)/);
  });

  it('reproduces the approved copy verbatim', () => {
    render(<PrivacyPolicy />);
    for (const phrase of [
      'You can use sprachschule-app without an account.',
      'sprachschule-app is operated by Shimon Esterkin.',
      'contact us at sprachschule.support@gmail.com.',
      'is sent through our server to Anthropic, which generates the response.',
      'We do not send your name, email address or account ID with these requests.',
      'We configure Sentry not to attach your account ID or email address',
      'These tools do not use cookies.',
      'Apple Push Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on Android)',
      'Push notifications are optional',
      'a copy can remain in our database until your account is deleted.',
      'We do not sell your data or use it for targeted advertising.',
    ]) {
      expect(
        screen.getByText(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      ).toBeInTheDocument();
    }
  });

  it('lists collection, providers, retention and choices as real lists', () => {
    render(<PrivacyPolicy />);
    expect(screen.getAllByRole('listitem')).toHaveLength(24);
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
