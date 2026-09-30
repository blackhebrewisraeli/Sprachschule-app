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
    expect(TERMS_VERSION).toBe('2026-09-29');
    render(<TermsOfService />);
    expect(screen.getByText('Last Updated: September 29, 2026')).toBeInTheDocument();
  });

  it('carries the eight numbered sections, in order', () => {
    render(<TermsOfService />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '1. Eligibility',
      '2. User Accounts',
      '3. App Usage and Leagues',
      '4. User-Generated Content',
      '5. "As Is" Disclaimer',
      '6. Changes to These Terms',
      '7. Privacy',
      '8. AI-Generated Content',
    ]);
  });

  it('never names the old brand', () => {
    const { container } = render(<TermsOfService />);
    expect(container.textContent).not.toMatch(/Deutsch App/);
  });

  it('reproduces the approved copy verbatim', () => {
    render(<TermsOfService />);
    for (const phrase of [
      'By accessing or using sprachschule-app, you agree to be bound by these Terms of Service.',
      'You must be at least 13 years old to use this app. By creating an account, you confirm that you meet this age requirement.',
      'sprachschule-app includes gamified elements like Leagues and Streaks.',
      'sprachschule-app is currently in a pre-beta stage.',
      'We may update these Terms. When we do, we will update the "Last Updated" date',
      'Our Privacy Policy explains how we collect and use your information.',
      'sprachschule-app uses artificial intelligence to generate tutor replies, answer feedback and practice content. AI-generated content can be inaccurate.',
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
