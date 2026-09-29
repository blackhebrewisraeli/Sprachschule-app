import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LegalConsent from './LegalConsent';

const LABEL = /I agree to the Terms of Service and acknowledge the Privacy Policy/;

describe('LegalConsent', () => {
  it('is a real, unchecked checkbox with an associated label', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} />);
    const box = screen.getByRole('checkbox', { name: LABEL });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('data-ui');
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
    expect(alert).toHaveTextContent(/^Required:/);
    expect(box).toHaveAttribute('aria-describedby', alert.id);
  });

  it('keeps a 44px tap row even when the label wraps', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} />);
    const row = screen.getByRole('checkbox').closest('[data-consent-row]');
    expect(row).toHaveStyle({ minHeight: '44px' });
  });

  it('can take focus on mount (returning from a legal page)', () => {
    render(<LegalConsent checked={false} onChange={() => {}} onNavigate={() => {}} focusOnMount />);
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });
});
