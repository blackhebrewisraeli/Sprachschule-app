import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TutorialOverlay from './TutorialOverlay';
import { TUTORIAL_STEPS } from './tutorial/steps';
import { TUTORIAL_KEY, TUTORIAL_REPLAY_EVENT, replayTutorial } from '../lib/tutorialPref';
import { act } from '@testing-library/react';

const setViewport = (width, height = 800) => {
  for (const [key, value] of [
    ['innerWidth', width],
    ['innerHeight', height],
  ]) {
    Object.defineProperty(window, key, { writable: true, configurable: true, value });
  }
};

const asRect = ({ left, top, width, height }) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
});

// Anchors get their rects stubbed through the ref callback, which React runs
// during the commit's layout phase — i.e. before the overlay's own layout
// effect measures them. Stubbing after render would be too late.
function Harness({ rects = {}, missing = [], onDismiss, showOverlay = true }) {
  const status = useRef(null);
  const chat = useRef(null);
  const stats = useRef(null);
  const refs = { status, chat, stats };

  const attach = (id) => (node) => {
    refs[id].current = node;
    if (node && rects[id]) node.getBoundingClientRect = () => asRect(rects[id]);
  };

  const anchors = {};
  for (const id of Object.keys(refs)) {
    if (!missing.includes(id)) anchors[id] = refs[id];
  }

  return (
    <div>
      <button type="button" ref={attach('status')}>
        A1
      </button>
      <button type="button" ref={attach('chat')}>
        Chat
      </button>
      <button type="button" ref={attach('stats')}>
        Stats
      </button>
      {showOverlay && <TutorialOverlay anchors={anchors} onDismiss={onDismiss} />}
    </div>
  );
}

const DEFAULT_RECTS = {
  status: { left: 500, top: 8, width: 42, height: 42 },
  chat: { left: 200, top: 80, width: 90, height: 44 },
  stats: { left: 600, top: 80, width: 90, height: 44 },
};

const renderTour = (props = {}) => render(<Harness rects={DEFAULT_RECTS} {...props} />);

const dialog = () => screen.queryByRole('dialog', { name: /tutorial|walkthrough|tour/i });

describe('TutorialOverlay', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1280, 800);
  });

  // ── Appearing and not appearing ───────────────────────────────
  it('shows the first bubble to a user who has no dismissal flag stored', () => {
    renderTour();
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByText(TUTORIAL_STEPS[0].title)).toBeInTheDocument();
  });

  it('renders nothing at all once the dismissal flag is stored', () => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    renderTour();
    expect(dialog()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip tutorial/i })).not.toBeInTheDocument();
  });

  // ── First run only ────────────────────────────────────────────
  it('records the tour as seen as soon as it paints, before any click', () => {
    // The "tutorial on every app open" report. Recording only on dismissal
    // meant a reload, a closed tab, or following a link out all left the flag
    // unset — so the tour came back, and no amount of dismissing helped,
    // because the learner had never dismissed it.
    renderTour();
    expect(dialog()).toBeInTheDocument();
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe('true');
  });

  it('does not record anything when it never paints', () => {
    // Guard in the other direction: the flag must mean "was offered the tour",
    // so a run where the tour is already done must not rewrite it, and a run
    // where it never renders must not claim it was shown.
    localStorage.clear();
    renderTour({ showOverlay: false });
    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
  });

  // ── Replay from Settings ──────────────────────────────────────
  it('reopens on the replay event without a reload', async () => {
    renderTour();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(TUTORIAL_REPLAY_EVENT));
    });
    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByText(TUTORIAL_STEPS[0].title)).toBeInTheDocument();
  });

  it('restarts the replayed tour at step one', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(within(dialog()).getByText(TUTORIAL_STEPS[1].title)).toBeInTheDocument();

    await act(async () => {
      replayTutorial();
    });

    expect(within(dialog()).getByText(TUTORIAL_STEPS[0].title)).toBeInTheDocument();
  });

  it('reopens for a learner who had already seen it', async () => {
    // The pairing that makes mark-on-show safe: the tour is unreachable after
    // the first paint unless Settings can bring it back.
    localStorage.setItem(TUTORIAL_KEY, 'true');
    renderTour();
    expect(dialog()).not.toBeInTheDocument();

    await act(async () => {
      replayTutorial();
    });

    expect(dialog()).toBeInTheDocument();
  });

  // ── Dismissal ─────────────────────────────────────────────────
  it('unmounts and records the dismissal when Skip tutorial is clicked', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(screen.getByRole('button', { name: /skip tutorial/i }));

    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe('true');
  });

  it('offers Skip tutorial on every step, not just the first', async () => {
    const user = userEvent.setup();
    renderTour();
    for (let i = 0; i < TUTORIAL_STEPS.length - 1; i += 1) {
      expect(screen.getByRole('button', { name: /skip tutorial/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /next/i }));
    }
    expect(screen.getByRole('button', { name: /skip tutorial/i })).toBeInTheDocument();
  });

  it('walks through every step and finishes on Got it', async () => {
    const user = userEvent.setup();
    renderTour();

    for (let i = 0; i < TUTORIAL_STEPS.length - 1; i += 1) {
      expect(within(dialog()).getByText(TUTORIAL_STEPS[i].title)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    const last = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1];
    expect(within(dialog()).getByText(last.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(dialog()).not.toBeInTheDocument();
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe('true');
  });

  it('records the dismissal when Escape closes the tour', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.keyboard('{Escape}');

    expect(dialog()).not.toBeInTheDocument();
    // An exit that does not persist means the tour returns on the next reload,
    // which is the one thing the brief rules out.
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe('true');
  });

  it('notifies the host app once when the tour ends', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderTour({ onDismiss });
    await user.click(screen.getByRole('button', { name: /skip tutorial/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ── Accessibility ─────────────────────────────────────────────
  it('is a modal dialog that holds focus', async () => {
    renderTour();
    const panel = dialog();
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  // The tour takes focus so it is reachable without a mouse. It has to give it
  // back: dropping focus to <body> on dismiss makes a keyboard user restart from
  // the top of the page. The tour has no opener button of its own, so what it
  // restores to is whatever held focus when it appeared.
  it('returns focus to whatever held it when the tour is dismissed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness rects={DEFAULT_RECTS} showOverlay={false} />);

    const before = screen.getByRole('button', { name: 'Chat' });
    before.focus();
    expect(document.activeElement).toBe(before);

    rerender(<Harness rects={DEFAULT_RECTS} showOverlay />);

    // Guard against a false pass: if the tour never took focus, the restore
    // assertion below would hold trivially.
    expect(document.activeElement).not.toBe(before);
    expect(dialog()).toContainElement(document.activeElement);

    await user.keyboard('{Escape}');
    expect(dialog()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(before);
  });

  it('returns focus when the tour is finished rather than escaped', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness rects={DEFAULT_RECTS} showOverlay={false} />);
    const before = screen.getByRole('button', { name: 'Chat' });
    before.focus();

    rerender(<Harness rects={DEFAULT_RECTS} showOverlay />);
    await user.click(screen.getByRole('button', { name: /skip tutorial/i }));

    expect(dialog()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(before);
  });

  it('names the step it is on for assistive tech', () => {
    renderTour();
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
  });

  // ── Placement ─────────────────────────────────────────────────
  it('positions the bubble against the anchor for the current step', () => {
    renderTour();
    const bubble = screen.getByTestId('tutorial-bubble');
    // status anchor spans 500–542, so a 280px bubble centres at 521 → left 381.
    expect(Number.parseFloat(bubble.style.left)).toBeCloseTo(381, 0);
    expect(Number.parseFloat(bubble.style.top)).toBeGreaterThan(50);
  });

  it('re-measures against the next anchor when the step advances', async () => {
    const user = userEvent.setup();
    renderTour();
    const before = Number.parseFloat(screen.getByTestId('tutorial-bubble').style.left);
    await user.click(screen.getByRole('button', { name: /next/i }));
    const after = Number.parseFloat(screen.getByTestId('tutorial-bubble').style.left);
    expect(after).not.toBe(before);
  });

  it('still shows the bubble when its anchor is not on screen', () => {
    // The Chat anchor only exists while the nav is mounted. A tour that blanks
    // out is worse than one that loses its pointer.
    renderTour({ missing: ['status'] });
    expect(dialog()).toBeInTheDocument();
    const bubble = screen.getByTestId('tutorial-bubble');
    expect(Number.parseFloat(bubble.style.left)).toBeGreaterThanOrEqual(0);
  });

  it('cuts a spotlight out of the scrim so the anchor stays lit', () => {
    renderTour();
    const panels = screen.getAllByTestId('tutorial-scrim');
    expect(panels).toHaveLength(4);
  });

  // ── The 320px contract, end to end ────────────────────────────
  it('keeps every step inside a 320px viewport', async () => {
    const user = userEvent.setup();
    setViewport(320, 568);
    // Icon-only nav at bp.tiny: six ~45px buttons, the last flush against the
    // right edge, plus the status chip pinned to the header's right.
    render(
      <Harness
        rects={{
          status: { left: 262, top: 8, width: 42, height: 42 },
          chat: { left: 55, top: 60, width: 45, height: 44 },
          stats: { left: 265, top: 60, width: 45, height: 44 },
        }}
      />
    );

    for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) {
      const bubble = screen.getByTestId('tutorial-bubble');
      const left = Number.parseFloat(bubble.style.left);
      const width = Number.parseFloat(bubble.style.width);
      expect(left, `step ${i + 1} left edge`).toBeGreaterThanOrEqual(0);
      expect(left + width, `step ${i + 1} right edge`).toBeLessThanOrEqual(320);
      expect(left, `step ${i + 1} centred`).toBe(320 - left - width);
      if (i < TUTORIAL_STEPS.length - 1) {
        await user.click(screen.getByRole('button', { name: /next/i }));
      }
    }
  });
});
