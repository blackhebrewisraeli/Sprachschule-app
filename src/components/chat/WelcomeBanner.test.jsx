import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomeBanner from './WelcomeBanner';

describe('WelcomeBanner', () => {
  it('explains the exercise model with a dismiss button', () => {
    render(<WelcomeBanner mobile={false} onDismiss={() => {}} />);
    expect(screen.getByText('WILLKOMMEN')).toBeInTheDocument();
    expect(screen.getByText(/Anna gives you a task each round/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GOT IT →' })).toBeInTheDocument();
  });

  it('points at tabs by their current names, not stale numbers', () => {
    // It said "Tabs 02–04 … 05 Stats" after Home took 01 and Stats became
    // Profile — both wrong, and invisible on the icon-only mobile nav anyway.
    const { container } = render(<WelcomeBanner mobile onDismiss={() => {}} />);
    const text = container.textContent;
    for (const tab of ['Alphabet', 'Vocab', 'Translate', 'Profile']) {
      expect(text).toContain(tab);
    }
    // Pins the space across the JSX comment between the two sentences.
    expect(text).toMatch(/real time\. Alphabet, Vocab and Translate add letter drills/);
    expect(text).not.toMatch(/\bStats\b/);
    expect(text).not.toMatch(/\b0[1-6]\b/);
  });

  it('calls onDismiss when the button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<WelcomeBanner mobile onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'GOT IT →' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
