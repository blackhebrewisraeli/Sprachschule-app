import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteAccountPage from './DeleteAccountPage';

// Google Play's account-deletion URL (store checklist item 6). Play requires the
// page to name the app and developer, show how to request deletion without the
// app, and say what is deleted and what is kept, for how long. Owner-approved
// copy, 2026-10-01; these pin the facts a reviewer checks.
describe('DeleteAccountPage', () => {
  it('names the app and its operator', () => {
    const { container } = render(<DeleteAccountPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Delete your Deutsch Sprachschule account' })
    ).toBeInTheDocument();
    expect(container.textContent).toContain('Deutsch Sprachschule is operated by Shimon Esterkin.');
  });

  it('shows its own date', () => {
    render(<DeleteAccountPage />);
    expect(screen.getByText('Last Updated: October 6, 2026')).toBeInTheDocument();
  });

  it('carries the four sections, in order', () => {
    render(<DeleteAccountPage />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Delete it in the app',
      'Ask us by email',
      'What is deleted',
      'What is kept, and for how long',
    ]);
  });

  it('gives the in-app path and the email route, with its subject and deadline', () => {
    const { container } = render(<DeleteAccountPage />);
    const text = container.textContent;
    expect(text).toContain('Profile → Settings → Account controls, choose Delete account');
    expect(text).toContain(
      'Email sprachschule.support@gmail.com from the address you sign in with'
    );
    expect(text).toContain('"Account Deletion Request - Deutsch Sprachschule"');
    expect(text).toContain('We will delete your account within 30 days');
  });

  // A Hide My Email address can receive but not send, so "write from the
  // address you sign in with" alone would lock these learners out.
  it('gives Apple relay users an email route, and says it cannot revoke Apple access', () => {
    const { container } = render(<DeleteAccountPage />);
    const text = container.textContent;
    expect(text).toContain('If you sign in with Apple, Google or GitHub');
    expect(text).toContain('write from any address and include your private relay address');
    expect(text).toContain('@privaterelay.appleid.com');
    expect(text).toContain('We will confirm the request by writing to that relay address');
    expect(text).toContain("Deleting by email cannot revoke our app's access to your Apple ID");
    expect(text).toContain("then also revokes our app's access to your Apple ID");
  });

  it('says what is deleted and what is kept', () => {
    const { container } = render(<DeleteAccountPage />);
    const text = container.textContent;
    expect(text).toContain('your email address and sign-in details');
    expect(text).toContain('saved tutor conversations');
    expect(text).toContain('Copies may remain for a limited time');
    expect(text).toContain('Daily AI usage counts are deleted automatically');
  });

  it('never uses the internal name or an unfilled placeholder', () => {
    const { container } = render(<DeleteAccountPage />);
    expect(container.textContent).not.toContain('sprachschule-app');
    expect(container.textContent).not.toMatch(/\[|\]/);
  });

  it('Back returns to the app', async () => {
    const onBack = vi.fn();
    render(<DeleteAccountPage onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the app' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
