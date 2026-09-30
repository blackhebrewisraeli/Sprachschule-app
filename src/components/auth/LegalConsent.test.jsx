import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LegalConsent from './LegalConsent';

// Owner-approved legal copy (spec §5.3), pinned character for character: a
// clause dropped or a full stop lost must fail here, not slip past a substring.
const LABEL = 'I agree to the Terms of Service and acknowledge the Privacy Policy.';
// For association only. dom-accessibility-api puts a space before the full stop
// after the inline link ("Privacy Policy ."), so the exact string is pinned via
// textContent, not via the computed accessible name.
const LABEL_NAME = /^I agree to the Terms of Service and acknowledge the Privacy Policy/;
const ERROR =
  'Required: tick the box to agree to the Terms of Service and acknowledge the Privacy Policy.';

describe('LegalConsent', () => {
  it('is a real, unchecked checkbox with an associated label', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} />);
    const box = screen.getByRole('checkbox', { name: LABEL_NAME });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('data-ui');
    // `toHaveTextContent(string)` is a substring match; textContent is exact.
    expect(box.labels[0].textContent).toBe(LABEL);
  });

  it('toggles from the keyboard', async () => {
    const onChange = vi.fn();
    render(<LegalConsent checked={false} onChange={onChange} onNavigate={() => {}} />);
    screen.getByRole('checkbox').focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('links to /terms and /privacy, each its own tab stop, without toggling', async () => {
    const onChange = vi.fn();
    const onNavigate = vi.fn();
    render(<LegalConsent checked={false} onChange={onChange} onNavigate={onNavigate} />);
    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(privacy).toHaveAttribute('href', '/privacy');
    await userEvent.tab();
    await userEvent.tab();
    expect(terms).toHaveFocus();
    await userEvent.tab();
    expect(privacy).toHaveFocus();
    await userEvent.click(terms);
    expect(onNavigate).toHaveBeenCalledWith('/terms');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves modifier clicks to the browser', async () => {
    const onNavigate = vi.fn();
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={onNavigate} />);
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('describes the error in text, not colour alone', () => {
    render(<LegalConsent checked={false} invalid onChange={() => {}} onNavigate={() => {}} />);
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(ERROR);
    expect(box).toHaveAttribute('aria-describedby', alert.id);
  });

  // The label is what a tap on the words lands on, so it, not the row around
  // it, must be the 44px target. It stays a block so the text and both links
  // keep flowing inline.
  it('makes the label a 44px tap target even when it wraps', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} />);
    const label = screen.getByRole('checkbox').labels[0];
    expect(label).toHaveStyle({ display: 'block', minHeight: '44px' });
  });

  it('can take focus on mount (returning from a legal page)', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} focusOnMount />);
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });
});
