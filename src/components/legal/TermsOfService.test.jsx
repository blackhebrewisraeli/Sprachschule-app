import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TermsOfService from './TermsOfService';
import { TERMS_VERSION } from '../../lib/legalAcceptance';

describe('TermsOfService', () => {
  it('renders the document title', () => {
    render(<TermsOfService />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('shows the effective date, derived from TERMS_VERSION', () => {
    expect(TERMS_VERSION).toBe('2026-10-06');
    render(<TermsOfService />);
    expect(screen.getByText('Last Updated: October 6, 2026')).toBeInTheDocument();
  });

  it('carries the fourteen numbered sections, in order', () => {
    render(<TermsOfService />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '1. Eligibility',
      '2. User Accounts',
      '3. Acceptable Use',
      '4. App Usage and Leagues',
      '5. User-Generated Content',
      '6. Our Content and Intellectual Property',
      '7. AI-Generated Content',
      '8. Termination',
      '9. "As Is" Disclaimer',
      '10. Limitation of Liability',
      '11. App Stores',
      '12. Changes to These Terms',
      '13. Privacy',
      '14. Contact',
    ]);
  });

  it('never names the old brand', () => {
    const { container } = render(<TermsOfService />);
    expect(container.textContent).not.toMatch(/Deutsch App/);
    expect(container.textContent.replaceAll('sprachschule-app.com', '')).not.toMatch(
      /sprachschule-app/
    );
    expect(container.textContent).toMatch(/sprachschule\.support@gmail\.com/);
  });

  it('reproduces the approved copy verbatim', () => {
    render(<TermsOfService />);
    for (const phrase of [
      'By accessing or using Deutsch Sprachschule, you agree to be bound by these Terms of Service.',
      'You must be at least 13 years old to use this app. By creating an account, you confirm that you meet this age requirement.',
      'Deutsch Sprachschule includes gamified elements like Leagues and Streaks.',
      'Deutsch Sprachschule is currently in a pre-beta stage.',
      'cheat or manipulate XP, streaks or league standings',
      'You keep ownership of the content you create',
      'remain available under their own open licences',
      'not as professional advice',
      'We may suspend or close your account, or remove your content',
      'Our total liability for any claim relating to the app is limited to the amount you paid us',
      'Apple and its subsidiaries are third-party beneficiaries of these Terms',
      'We may update these Terms. When we do, we will update the "Last Updated" date',
      'Our Privacy Policy explains how we collect and use your information.',
      'Deutsch Sprachschule uses artificial intelligence to generate tutor replies, answer feedback and practice content. AI-generated content can be inaccurate.',
    ]) {
      expect(
        screen.getByText(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      ).toBeInTheDocument();
    }
  });

  it('states the minimum age, which is the clause most likely to be edited by accident', () => {
    render(<TermsOfService />);
    expect(screen.getByText(/at least 13 years old/)).toBeInTheDocument();
  });

  it('passes its back control through', async () => {
    const onBack = vi.fn();
    render(<TermsOfService onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the app' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
