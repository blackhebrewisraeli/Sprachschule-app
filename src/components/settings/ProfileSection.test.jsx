import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSection from './ProfileSection';

// Named by default: every save sends the whole form, and First/Last are
// required, so a nameless fixture could not save at all. The nameless case has
// its own test below.
const profile = { handle: 'sam', first_name: 'Sam', last_name: 'Vimes' };
const profileWithPicture = { ...profile, avatar_path: 'u1/old.webp' };

const handleField = () => screen.getByRole('textbox', { name: /handle/i });
const firstField = () => screen.getByRole('textbox', { name: /first name/i });
const middleField = () => screen.getByRole('textbox', { name: /middle name/i });
const lastField = () => screen.getByRole('textbox', { name: /last name/i });
const saveButton = () => screen.getByRole('button', { name: /save profile/i });

describe('ProfileSection', () => {
  it('centres a polished editor with tactile fields and a full-width save action', () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);

    expect(screen.getByTestId('profile-editor')).toHaveStyle({
      width: '100%',
      maxWidth: '640px',
      marginInline: 'auto',
    });
    expect(firstField()).toHaveAttribute('data-ui', 'field');
    expect(firstField().style.padding).toBe('12px 16px');
    expect(firstField().style.borderRadius).toBe('14px');
    expect(firstField().style.boxShadow).toContain('inset');
    expect(screen.getByTestId('avatar-picker')).toHaveStyle({
      borderRadius: '16px',
      padding: '16px',
    });
    expect(saveButton()).toHaveStyle({ width: '100%' });
  });

  it('shows the current handle', () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(handleField()).toHaveValue('sam');
  });

  it('edits first, middle and last name separately from the unique handle', () => {
    render(<ProfileSection profile={{ ...profile, middle_name: 'Q' }} save={vi.fn()} />);
    expect(firstField()).toHaveValue('Sam');
    expect(middleField()).toHaveValue('Q');
    expect(lastField()).toHaveValue('Vimes');
    expect(handleField()).toHaveValue('sam');
    expect(screen.getByText('@', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });

  it('marks first and last name required, and middle name optional', () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(firstField()).toBeRequired();
    expect(lastField()).toBeRequired();
    expect(middleField()).not.toBeRequired();
  });

  // Sign-up creates the profile with no name (most accounts have none), so
  // the form is where a name gets supplied — and it cannot be skipped.
  it('will not save without a first and last name, and says why', async () => {
    const save = vi.fn();
    render(<ProfileSection profile={{ handle: 'sam' }} save={save} />);
    await userEvent.type(handleField(), '!');
    await userEvent.click(saveButton());

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(/first and last name are required/i)).toBeInTheDocument();
  });

  it('offers no Avatar emoji field', () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(screen.queryByText(/avatar emoji/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /avatar/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('🦊')).not.toBeInTheDocument();
  });

  it('starts with an empty form when there is no profile row yet', () => {
    render(<ProfileSection profile={null} save={vi.fn()} />);
    expect(handleField()).toHaveValue('');
  });

  // App fetches the row AFTER the session settles, so a cold load of
  // #/settings mounts this form with no profile. Seeded only at mount, every
  // field stayed blank once the row arrived.
  it('fills the form when the profile row arrives after mount', () => {
    const { rerender } = render(<ProfileSection profile={null} save={vi.fn()} />);
    rerender(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(firstField()).toHaveValue('Sam');
    expect(lastField()).toHaveValue('Vimes');
    expect(handleField()).toHaveValue('sam');
    expect(saveButton()).toBeDisabled();
  });

  it('does not reseed when the profile object changes but its values do not', async () => {
    const { rerender } = render(<ProfileSection profile={profile} save={vi.fn()} />);
    await userEvent.clear(firstField());
    await userEvent.type(firstField(), 'Samuel');

    rerender(<ProfileSection profile={{ ...profile }} save={vi.fn()} />);
    expect(firstField()).toHaveValue('Samuel');
  });

  // Typed before the row landed: the edit is kept, and every untouched field
  // takes the row's value. Keeping the whole blank form instead would have
  // sent handle: '' on Save, which the endpoint reads as "clear my handle".
  it('keeps a field typed before the row arrived and fills the rest', async () => {
    const { rerender } = render(<ProfileSection profile={null} save={vi.fn()} />);
    await userEvent.type(firstField(), 'Samuel');
    rerender(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(firstField()).toHaveValue('Samuel');
    expect(lastField()).toHaveValue('Vimes');
    expect(handleField()).toHaveValue('sam');
    expect(saveButton()).toBeEnabled();
  });

  // A UNIQUE column makes a pointless round trip worse than merely wasteful.
  it('keeps Save disabled until the handle actually changes', async () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(saveButton()).toBeDisabled();
    await userEvent.type(handleField(), '!');
    expect(saveButton()).toBeEnabled();
  });

  it('disables Save again once the value is typed back to what it was', async () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    await userEvent.type(handleField(), '!');
    expect(saveButton()).toBeEnabled();
    await userEvent.keyboard('{Backspace}');
    expect(saveButton()).toBeDisabled();
  });

  it('sends every field and reports success', async () => {
    const save = vi.fn().mockResolvedValue(profile);
    const onToast = vi.fn();
    render(<ProfileSection profile={{ handle: 'sam' }} save={save} onToast={onToast} />);
    await userEvent.type(firstField(), 'Sam');
    await userEvent.type(middleField(), 'Q');
    await userEvent.type(lastField(), 'Vimes');
    await userEvent.clear(handleField());
    await userEvent.type(handleField(), 'semion');
    await userEvent.click(saveButton());

    expect(save).toHaveBeenCalledWith({
      first_name: 'Sam',
      middle_name: 'Q',
      last_name: 'Vimes',
      handle: 'semion',
      is_private: false,
    });
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/saved/i));
  });

  it('switches the profile to private and saves it', async () => {
    const save = vi.fn().mockResolvedValue({ ...profile, is_private: true });
    render(<ProfileSection profile={profile} save={save} />);
    const group = screen.getByRole('group', { name: /profile visibility/i });
    expect(within(group).getByRole('button', { name: 'Public' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // What private MEANS is on screen, not left to the word.
    expect(screen.getByText(/hides you from find people/i)).toBeInTheDocument();

    await userEvent.click(within(group).getByRole('button', { name: 'Private' }));
    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ is_private: true }));
    expect(within(group).getByRole('button', { name: 'Private' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  // The server owns handle uniqueness, so what it stored — not what was typed —
  // is what the form must end up showing.
  it('resets the handle to what the SERVER stored, not what was typed', async () => {
    const save = vi.fn().mockResolvedValue({ ...profile, handle: 'sam' });
    render(<ProfileSection profile={profile} save={save} />);
    await userEvent.clear(handleField());
    await userEvent.type(handleField(), 'wanted');
    await userEvent.click(saveButton());

    expect(handleField()).toHaveValue('sam');
    expect(saveButton()).toBeDisabled();
  });

  it('surfaces a taken handle inline and keeps the typed value for editing', async () => {
    const save = vi.fn().mockRejectedValue(new Error('That handle is taken.'));
    render(<ProfileSection profile={profile} save={save} />);
    await userEvent.clear(handleField());
    await userEvent.type(handleField(), 'taken');
    await userEvent.click(saveButton());

    expect(screen.getByText(/that handle is taken/i)).toBeInTheDocument();
    expect(handleField()).toHaveValue('taken');
    expect(saveButton()).toBeEnabled();
  });

  it('reports the saved row upward so the rest of the app can follow', async () => {
    const stored = { ...profile, handle: 'stored' };
    const onSaved = vi.fn();
    render(
      <ProfileSection
        profile={profile}
        save={vi.fn().mockResolvedValue(stored)}
        onSaved={onSaved}
      />
    );
    await userEvent.type(handleField(), '!');
    await userEvent.click(saveButton());
    expect(onSaved).toHaveBeenCalledWith(stored);
  });

  // Handle and picture controls are profile fields here, not league fields,
  // so they are present whether or not leagues are switched on.
  it('offers handle and picture controls without depending on the leagues flag', () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(handleField()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload a picture/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/choose an avatar image/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /avatar emoji/i })).not.toBeInTheDocument();
  });

  it('offers Remove picture when an uploaded avatar exists', () => {
    render(<ProfileSection profile={profileWithPicture} save={vi.fn()} />);
    expect(screen.getByRole('button', { name: /remove picture/i })).toBeInTheDocument();
  });

  it('hides Remove picture when there is no uploaded avatar', () => {
    render(<ProfileSection profile={profile} save={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /remove picture/i })).not.toBeInTheDocument();
  });
});
