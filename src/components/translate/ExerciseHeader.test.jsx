import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExerciseHeader from './ExerciseHeader';

const states = () =>
  [...screen.getByTestId('translate-progress').children].map((s) => s.dataset.state);

describe('ExerciseHeader', () => {
  it('draws one segment per sentence: right answers gold, the current one marked', () => {
    // Sentence 0 right, 1 missed, 2 right, 3 on screen.
    render(<ExerciseHeader level="a2" idx={3} total={10} correctAt={new Set([0, 2])} />);
    expect(states()).toEqual([
      'correct',
      'missed',
      'correct',
      'current',
      ...Array(6).fill('ahead'),
    ]);
    expect(screen.getByTestId('translate-level')).toHaveTextContent('A2');
    expect(screen.getByText('Exercise 4 of 10')).toBeInTheDocument();
    expect(screen.getByText('2 correct')).toBeInTheDocument();
  });

  it('counts only sentences already behind the learner', () => {
    // A stale entry at the current position must not be counted or painted.
    render(<ExerciseHeader level="a1" idx={1} total={10} correctAt={new Set([0, 1])} />);
    expect(states().slice(0, 2)).toEqual(['correct', 'current']);
    expect(screen.getByText('1 correct')).toBeInTheDocument();
  });

  it('says nothing about a score before the first answer', () => {
    render(<ExerciseHeader level="a1" idx={0} total={10} />);
    expect(screen.queryByText(/correct/)).toBeNull();
  });
});
