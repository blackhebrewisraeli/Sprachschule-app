import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GoalRing from './GoalRing';

describe('GoalRing', () => {
  it('shows the target glyph while in progress', () => {
    const { container } = render(<GoalRing pct={0.4} met={false} />);
    // An svg glyph, not the 🎯 emoji it replaced — that drew differently per OS.
    expect(container.querySelector('[data-task-icon="target"]')).not.toBeNull();
    expect(container).not.toHaveTextContent('🎯');
    expect(screen.getByTitle('Daily goal · 40%')).toBeInTheDocument();
  });
  it('shows a check when met', () => {
    render(<GoalRing pct={1} met />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByTitle('Daily goal reached!')).toBeInTheDocument();
  });
});
