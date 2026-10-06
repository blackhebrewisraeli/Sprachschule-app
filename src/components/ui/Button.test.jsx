import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
  // The hover brightening lives in the global sheet (inline styles cannot
  // hover). With no filter in the transition list it snapped on and off.
  it('eases its hover brightening instead of snapping', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).style.transition).toMatch(/filter/);
  });

  it('renders its children as the accessible label', () => {
    render(<Button>CHECK</Button>);
    expect(screen.getByRole('button', { name: 'CHECK' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>GO</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        GO
      </Button>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('dims and disables the button when disabled', () => {
    render(<Button disabled>GO</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveStyle({ opacity: '0.45' });
  });

  it('falls back to the primary variant for an unknown variant (no crash)', () => {
    render(<Button variant="does-not-exist">X</Button>);
    expect(screen.getByRole('button', { name: 'X' })).toBeInTheDocument();
  });

  it('forwards extra props (e.g. type) to the underlying button', () => {
    render(<Button type="submit">SEND</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('marks itself for the global focus and hover rules', () => {
    render(<Button variant="go">GO</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('data-ui', 'button');
    expect(btn).toHaveAttribute('data-variant', 'go');
  });

  // The old recipe painted the label COLORS.paper — the PAGE GROUND colour — so
  // ghost text was invisible on any ground-coloured surface. It had zero
  // consumers, which is exactly why no test ever caught it.
  it('paints the ghost variant in ink, not in the page ground colour', () => {
    render(<Button variant="ghost">SKIP</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveStyle({ color: 'var(--c-fg)' });
    expect(btn).not.toHaveStyle({ color: 'var(--c-ground)' });
  });

  it('makes the icon variant square', () => {
    render(
      <Button variant="icon" aria-label="Appearance">
        *
      </Button>
    );
    const btn = screen.getByRole('button', { name: 'Appearance' });
    // 32x32 — the measured header fit. Not 44: the header's functional cluster
    // is a constant 287px and the spare width at 320px is ~10px, so three 32px
    // chips cannot become three 44px chips. 32 clears WCAG 2.2 SC 2.5.8 (24px).
    expect(btn).toHaveStyle({ width: '32px', height: '32px' });
  });

  it('shrinks the icon variant at size="sm"', () => {
    render(
      <Button variant="icon" size="sm" aria-label="Close">
        x
      </Button>
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveStyle({
      width: '28px',
      height: '28px',
    });
  });

  // An icon-only button with no accessible name is an unnamed control. This
  // cannot be a runtime throw — that would crash a production screen over a
  // copy mistake — so it is a development-time warning plus this test, which is
  // what actually stops one landing.
  it('warns in development when the icon variant has no accessible name', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Button variant="icon">*</Button>);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('aria-label'));
    warn.mockRestore();
  });

  it('does not warn when the icon variant is labelled', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Button variant="icon" aria-label="Appearance">
        *
      </Button>
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('sets aria-busy when busy', () => {
    render(<Button busy>SAVE</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  // The defect this prevents: a disabled element leaves the tab order, so a
  // button that disables itself at the moment it is activated takes the user's
  // focus position with it — focus falls to <body> and keyboard context is lost.
  // GoogleButton did exactly this via `disabled={busy}`.
  it('stays focusable and enabled while busy', () => {
    render(<Button busy>SAVE</Button>);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('does not fire onClick while busy', async () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        SAVE
      </Button>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its children rendered while busy, so the width does not jump', () => {
    render(<Button busy>SAVE</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('SAVE');
  });

  // aria-busy alone is not a visible affordance — a sighted user watching a
  // button that looks unchanged taps it again.
  it('shows a visible spinner while busy, hidden from the a11y tree', () => {
    render(<Button busy>SAVE</Button>);
    const spinner = screen.getByRole('button').querySelector('[data-ui="spinner"]');
    expect(spinner).not.toBeNull();
    // aria-busy on the button is the announcement; the glyph must not be read.
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows no spinner when not busy', () => {
    render(<Button>SAVE</Button>);
    expect(screen.getByRole('button').querySelector('[data-ui="spinner"]')).toBeNull();
  });

  // Merge order: { ...recipe, ...stateStyles, ...style }. The old order applied
  // press styles AFTER the caller's style, so an override silently lost.
  it("lets the caller's style win over the resting recipe", () => {
    render(<Button style={{ borderRadius: 3 }}>GO</Button>);
    expect(screen.getByRole('button')).toHaveStyle({ borderRadius: '3px' });
  });

  it("lets the caller's style win over the press state", async () => {
    render(<Button style={{ transform: 'rotate(45deg)' }}>GO</Button>);
    const btn = screen.getByRole('button');
    await userEvent.pointer({ target: btn, keys: '[MouseLeft>]' });
    expect(btn).toHaveStyle({ transform: 'rotate(45deg)' });
  });
});
