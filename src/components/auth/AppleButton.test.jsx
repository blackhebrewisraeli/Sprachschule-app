import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { isAppleAuthConfigured } = vi.hoisted(() => ({
  isAppleAuthConfigured: vi.fn(() => true),
}));
vi.mock('../../lib/auth.js', () => ({ isAppleAuthConfigured }));

import AppleButton from './AppleButton';

describe('AppleButton', () => {
  beforeEach(() => {
    isAppleAuthConfigured.mockReturnValue(true);
  });

  it('names the provider in the same wording as Google and GitHub', () => {
    render(<AppleButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument();
  });

  // Decorative, ink-following mark, as for GitHub.
  it('carries the mark as a decorative, ink-following icon', () => {
    const { container } = render(<AppleButton onClick={() => {}} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(container.querySelector('img')).toBeNull();
  });

  // Button puts its children in one span (the busy fade), so flex and gap set
  // on the <button> never reached the mark: it sat on the text baseline,
  // touching the label. The row has to be laid out inside that span.
  it('lays the mark and label out as one centred row', () => {
    const { container } = render(<AppleButton onClick={() => {}} />);
    const row = container.querySelector('svg').parentElement;
    expect(row).toHaveStyle({ display: 'inline-flex', alignItems: 'center' });
    expect(row.style.gap).not.toBe('');
    expect(row).toHaveTextContent('Continue with Apple');
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AppleButton onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Apple' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Same contract as GoogleButton: `busy` blocks the second click WITHOUT
  // disabling, so the button keeps its place in the tab order.
  it('does not fire a second time while busy, and keeps its place in the tab order', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<AppleButton onClick={onClick} busy />);
    const button = screen.getByRole('button', { name: 'Continue with Apple' });

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();

    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('renders nothing when Apple is not configured', () => {
    isAppleAuthConfigured.mockReturnValue(false);
    const { container } = render(<AppleButton onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
