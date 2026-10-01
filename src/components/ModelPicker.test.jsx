import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelPicker from './ModelPicker';

describe('ModelPicker', () => {
  it('renders Auto / Fast / Balanced / Capable and marks the saved pick', () => {
    render(<ModelPicker value="fast" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Chat model' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auto/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /fast/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /balanced/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: /capable/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('reports the chosen id through onChange', async () => {
    const onChange = vi.fn();
    render(<ModelPicker value="auto" onChange={onChange} userTier="free" />);
    await userEvent.click(screen.getByRole('button', { name: /balanced/i }));
    expect(onChange).toHaveBeenCalledWith('balanced');
  });

  it('treats junk values as Auto', () => {
    render(<ModelPicker value="gpt-4o" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /auto/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names the fallback band when the pick exceeds the tier', () => {
    render(<ModelPicker value="balanced" userTier="guest" onChange={() => {}} />);
    expect(screen.getByText(/above your current plan/i)).toHaveTextContent('Fast');
  });

  it('hides the fallback caption when the pick fits', () => {
    render(<ModelPicker value="balanced" userTier="pro" onChange={() => {}} />);
    expect(screen.queryByText(/above your current plan/i)).not.toBeInTheDocument();
  });
});
