import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { isGitHubAuthConfigured } = vi.hoisted(() => ({
  isGitHubAuthConfigured: vi.fn(() => true),
}));
vi.mock('../../lib/auth.js', () => ({ isGitHubAuthConfigured }));

import GitHubButton from './GitHubButton';

describe('GitHubButton', () => {
  beforeEach(() => {
    isGitHubAuthConfigured.mockReturnValue(true);
  });

  it('names the provider in the same wording as Google', () => {
    render(<GitHubButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeInTheDocument();
  });

  // The label already names the provider, so the mark stays silent. And it
  // follows the button's ink rather than carrying a colour of its own —
  // otherwise it disappears against one of the two themes.
  it('carries the mark as a decorative, ink-following icon', () => {
    const { container } = render(<GitHubButton onClick={() => {}} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(container.querySelector('img')).toBeNull();
  });

  // Button puts its children in one span (the busy fade), so flex and gap set
  // on the <button> never reached the mark: it sat on the text baseline,
  // touching the label. The row has to be laid out inside that span.
  it('lays the mark and label out as one centred row', () => {
    const { container } = render(<GitHubButton onClick={() => {}} />);
    const row = container.querySelector('svg').parentElement;
    expect(row).toHaveStyle({ display: 'inline-flex', alignItems: 'center' });
    expect(row.style.gap).not.toBe('');
    expect(row).toHaveTextContent('Continue with GitHub');
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GitHubButton onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Same contract as GoogleButton: `busy` blocks the second click WITHOUT
  // disabling, so the button keeps its place in the tab order.
  it('does not fire a second time while busy, and keeps its place in the tab order', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GitHubButton onClick={onClick} busy />);
    const button = screen.getByRole('button', { name: 'Continue with GitHub' });

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();

    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('renders nothing when GitHub is not configured', () => {
    isGitHubAuthConfigured.mockReturnValue(false);
    const { container } = render(<GitHubButton onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
