import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSeeMore } from '../../lib/useSeeMore';
import SeeMoreToggle from './SeeMoreToggle';

// jsdom does no layout: every scroll/client size is 0. Stub the two heights
// so "the clamp cut it" is a fact the test chooses.
const stubHeights = (scrollHeight, clientHeight) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
};

afterEach(() => {
  delete HTMLElement.prototype.scrollHeight;
  delete HTMLElement.prototype.clientHeight;
});

function Clamped({ lines = 2 }) {
  const more = useSeeMore(lines, 'text');
  return (
    <div>
      <p id="t" data-testid="text" ref={more.ref} style={more.clamp}>
        A long piece of text
      </p>
      <SeeMoreToggle state={more} controls="t" />
    </div>
  );
}

describe('useSeeMore + SeeMoreToggle', () => {
  it('offers nothing when the clamp did not cut the text', () => {
    stubHeights(40, 40);
    render(<Clamped />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('text').style.WebkitLineClamp).toBe('2');
  });

  it('expands cropped text in place and collapses it again', async () => {
    const user = userEvent.setup();
    stubHeights(120, 40);
    render(<Clamped />);

    const toggle = screen.getByRole('button', { name: /see more/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 't');

    await user.click(toggle);
    expect(screen.getByTestId('text').style.WebkitLineClamp).toBe('');
    expect(screen.getByRole('button', { name: /see less/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    await user.click(screen.getByRole('button', { name: /see less/i }));
    expect(screen.getByTestId('text').style.WebkitLineClamp).toBe('2');
  });

  it('clamps a single line with an ellipsis rather than a line box', () => {
    stubHeights(20, 20);
    render(<Clamped lines={1} />);
    expect(screen.getByTestId('text')).toHaveStyle({
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  });
});
