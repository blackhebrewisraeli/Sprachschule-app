import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('says what happened in a heading and offers the way home', async () => {
    const onHome = vi.fn();
    render(<NotFoundPage onHome={onHome} />);
    expect(screen.getByRole('main')).toHaveClass('entry-screen');
    expect(screen.getByRole('heading', { level: 1, name: /doesn't exist/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back to home/i }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
