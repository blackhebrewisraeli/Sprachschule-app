import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuotaNote from './QuotaNote';
import { QuotaExhaustedError } from '../../lib/claude';

const RESET = '2026-10-02T00:00:00.000Z';
const quotaError = (over = {}) =>
  new QuotaExhaustedError({
    message: 'Daily AI limit reached.',
    meter: 'chat',
    tier: 'free',
    limit: 20,
    used: 20,
    resetsAt: RESET,
    rewardedEligible: true,
    ...over,
  });

describe('QuotaNote', () => {
  it('renders the limit message and the local reset time', () => {
    render(<QuotaNote error={quotaError()} />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Daily AI limit reached');
    const time = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(RESET));
    expect(note).toHaveTextContent(time);
  });

  it('offers a guest the free account and calls onSignIn', async () => {
    const onSignIn = vi.fn();
    render(<QuotaNote error={quotaError({ tier: 'guest' })} onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole('button', { name: /Create a free account/ }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('shows no buttons for a free learner when no callbacks are passed', () => {
    render(<QuotaNote error={quotaError()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows Get Premium for free when onPremium is passed', async () => {
    const onPremium = vi.fn();
    render(<QuotaNote error={quotaError()} onPremium={onPremium} />);
    await userEvent.click(screen.getByRole('button', { name: 'Get Premium' }));
    expect(onPremium).toHaveBeenCalledOnce();
  });

  it('shows no ad button when the error is not rewarded-eligible', () => {
    render(<QuotaNote error={quotaError({ rewardedEligible: false })} onRewarded={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a pool message verbatim', () => {
    render(<QuotaNote error={quotaError({ message: 'AI is busy right now — try later.' })} />);
    expect(screen.getByRole('note')).toHaveTextContent('AI is busy right now — try later.');
  });
});
