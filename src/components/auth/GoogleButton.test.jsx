import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { isGoogleAuthConfigured } = vi.hoisted(() => ({
  isGoogleAuthConfigured: vi.fn(() => true),
}));
vi.mock('../../lib/auth.js', () => ({ isGoogleAuthConfigured }));

import GoogleButton from './GoogleButton';

describe('GoogleButton', () => {
  beforeEach(() => {
    isGoogleAuthConfigured.mockReturnValue(true);
  });

  // Google's brand terms want this exact wording alongside the mark.
  it('renders Google’s required label', () => {
    render(<GoogleButton onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  // The mark is decorative — the label already names the provider, so a second
  // announcement would just be noise.
  it('carries the mark as a decorative image, not a themed icon', () => {
    const { container } = render(<GoogleButton onClick={() => {}} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/google-g.svg');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('alt', '');
  });

  // Button puts its children in one span (the busy fade), so flex and gap set
  // on the <button> never reached the mark: it sat on the text baseline,
  // touching the label. The row has to be laid out inside that span.
  it('lays the mark and label out as one centred row', () => {
    const { container } = render(<GoogleButton onClick={() => {}} />);
    const row = container.querySelector('img').parentElement;
    expect(row).toHaveStyle({ display: 'inline-flex', alignItems: 'center' });
    expect(row.style.gap).not.toBe('');
    expect(row).toHaveTextContent('Continue with Google');
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GoogleButton onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // A redirect takes a beat; a double-tap must not start two round trips.
  //
  // This used to assert `toBeDisabled()`. That was the defect: a disabled
  // element leaves the tab order, so the button took the user's focus position
  // with it at the moment they acted and dropped them at <body>. It is also the
  // button that carries autoFocus on two of its three call sites. The guard now
  // lives in Button's `busy`, which blocks the second click WITHOUT disabling.
  it('does not fire a second time while busy, and keeps its place in the tab order', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GoogleButton onClick={onClick} busy />);
    const button = screen.getByRole('button', { name: 'Continue with Google' });

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();

    // The point of the change: focus can still be on it, and still land on it.
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  // No dead affordance: the guard is in the component so no call site can
  // forget it.
  it('renders nothing when Google is not configured', () => {
    isGoogleAuthConfigured.mockReturnValue(false);
    const { container } = render(<GoogleButton onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
