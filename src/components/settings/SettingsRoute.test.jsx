import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsRoute from './SettingsRoute';
import { INTEREST_TOPICS } from '../../packs/de/interests';
import { FONTS } from '../../lib/theme';

// AccountSection branches on this, and it differs between a dev box and CI.
vi.mock('../../lib/auth.js', () => ({
  isAuthConfigured: () => true,
  // EmailSection reaches for these; the flow itself is tested in
  // EmailSection.test.jsx, so here they only need to exist.
  getAccessToken: vi.fn().mockResolvedValue(null),
  requestEmailChange: vi.fn(),
  verifyEmailChange: vi.fn(),
}));
vi.mock('../../lib/leagues', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, LEAGUES_ENABLED: true, updateHandle: vi.fn().mockResolvedValue({}) };
});
vi.mock('../../lib/profile', () => ({ updateProfile: vi.fn().mockResolvedValue({}) }));
// Whether this is the native app with push switched on. The section's own
// behaviour is NotificationsSection.test.jsx; here only its placement.
const { push } = vi.hoisted(() => ({ push: { available: false } }));
vi.mock('../../lib/pushNotifications', () => ({
  isPushAvailable: () => push.available,
  pushPermission: async () => 'prompt',
  readPushDevice: () => null,
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  nativePlatform: () => 'ios',
}));
const user = { id: 'u1', email: 'sam@example.com' };
const profile = { handle: 'sam' };

const renderRoute = (props = {}) =>
  render(
    <SettingsRoute
      user={user}
      profile={profile}
      level="a2"
      goal={50}
      onSignIn={() => {}}
      onSignOut={() => {}}
      onExport={() => {}}
      onDelete={() => {}}
      interestTopics={INTEREST_TOPICS}
      enabledInterests={[]}
      {...props}
    />
  );

const selectSection = async (userDriver, name) => {
  const picker = screen.getByRole('group', { name: 'Settings section' });
  await userDriver.click(within(picker).getByRole('button', { name }));
};

describe('SettingsRoute', () => {
  it('is an inline panel, not a modal dialog', () => {
    renderRoute();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /einstellungen/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close settings/i })).not.toBeInTheDocument();
  });

  it('opens on Account and keeps the other settings panels out of the document', () => {
    renderRoute();
    const picker = screen.getByRole('group', { name: 'Settings section' });
    expect(within(picker).getByRole('button', { name: 'Account' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('textbox', { name: /handle/i })).toBeInTheDocument();
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change email/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export my data/i })).toBeInTheDocument();
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retake placement/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Chat model' })).not.toBeInTheDocument();
  });

  it('switches between one Learning panel and one System panel', async () => {
    const u = userEvent.setup();
    renderRoute();
    const picker = screen.getByRole('group', { name: 'Settings section' });

    await u.click(within(picker).getByRole('button', { name: 'Learning' }));
    expect(screen.getByRole('button', { name: /retake placement/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Interest topics' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /handle/i })).not.toBeInTheDocument();

    await u.click(within(picker).getByRole('button', { name: 'System' }));
    expect(screen.getByRole('group', { name: 'Chat model' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear offline cache/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/appearance/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retake placement/i })).not.toBeInTheDocument();
  });

  it('uses the sans UI face and a compact scale for the Settings title', () => {
    renderRoute();
    const heading = screen.getByRole('heading', { name: /einstellungen/i });
    expect(heading).toHaveStyle({ fontFamily: FONTS.body, fontSize: '24px' });
  });

  it('hides the level switcher until the advanced override is opened', async () => {
    const u = userEvent.setup();
    renderRoute();
    await selectSection(u, 'Learning');
    expect(screen.queryByRole('radiogroup', { name: /level/i })).not.toBeInTheDocument();
    await u.click(screen.getByText(/override classification/i));
    expect(screen.getByRole('radiogroup', { name: /level/i })).toBeInTheDocument();
  });

  it('drives the level through the shared control', async () => {
    const u = userEvent.setup();
    const onLevelChange = vi.fn();
    renderRoute({ onLevelChange });
    await selectSection(u, 'Learning');
    await u.click(screen.getByText(/override classification/i));
    const group = screen.getByRole('radiogroup', { name: /level/i });
    await u.click(within(group).getByRole('radio', { name: /b1/i }));
    expect(onLevelChange).toHaveBeenCalledWith('b1');
  });

  it('persists the chosen level', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'a1', onLevelChange: () => {} });
    await selectSection(u, 'Learning');
    await u.click(screen.getByText(/override classification/i));
    const group = screen.getByRole('radiogroup', { name: /level/i });
    await u.click(within(group).getByRole('radio', { name: /a2/i }));
    expect(localStorage.getItem('deutsch-level')).toBe('a2');
  });

  it('offers a retake that calls through to the host', async () => {
    const u = userEvent.setup();
    const onRetakePlacement = vi.fn();
    renderRoute({ onRetakePlacement });
    await selectSection(u, 'Learning');
    await u.click(screen.getByRole('button', { name: /retake placement/i }));
    expect(onRetakePlacement).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/once you reach 500 XP/i)).toBeInTheDocument();
    expect(screen.getByText(/override classification/i)).toBeInTheDocument();
  });

  it('drives the daily goal', async () => {
    const u = userEvent.setup();
    const onGoalChange = vi.fn();
    renderRoute({ onGoalChange });
    await selectSection(u, 'Learning');
    const buttons = screen.getAllByRole('button');
    const goalButton = buttons.find((b) => /XP/i.test(b.textContent ?? ''));
    await u.click(goalButton);
    expect(onGoalChange).toHaveBeenCalled();
  });

  it('toggles sound', async () => {
    const u = userEvent.setup();
    const onSoundChange = vi.fn();
    renderRoute({ soundOn: false, onSoundChange });
    await selectSection(u, 'System');
    await u.click(screen.getByRole('button', { name: /sound: off/i }));
    expect(onSoundChange).toHaveBeenCalledTimes(1);
  });

  it('leaves Notifications out of a browser, where there is no push', async () => {
    const u = userEvent.setup();
    push.available = false;
    renderRoute();
    await selectSection(u, 'System');
    expect(screen.queryByRole('heading', { name: 'Notifications' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /push notifications/i })).not.toBeInTheDocument();
  });

  it('offers the push opt-in under System in the native app', async () => {
    const u = userEvent.setup();
    push.available = true;
    try {
      renderRoute();
      await selectSection(u, 'System');
      expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: /push notifications: off/i })
      ).toBeInTheDocument();
    } finally {
      push.available = false;
    }
  });

  it('toggles an interest topic through onInterestsChange', async () => {
    const u = userEvent.setup();
    const onInterestsChange = vi.fn();
    renderRoute({ enabledInterests: [], onInterestsChange });
    await selectSection(u, 'Learning');
    await u.click(screen.getByRole('button', { name: /sport/i }));
    expect(onInterestsChange).toHaveBeenCalledWith(['sport']);
  });

  it('picks a chat model through onPreferredModelChange', async () => {
    const u = userEvent.setup();
    const onPreferredModelChange = vi.fn();
    renderRoute({ preferredModel: 'auto', onPreferredModelChange });
    await selectSection(u, 'System');
    await u.click(screen.getByRole('button', { name: /fast/i }));
    expect(onPreferredModelChange).toHaveBeenCalledWith('fast');
  });
});

describe('SettingsRoute — Learning level', () => {
  it('names the level for a guest, with no bonus promised', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'a1' });
    await selectSection(u, 'Learning');
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.queryByText(/XP per answer/)).toBeNull();
  });

  it.each([
    ['a1', /Word tiles/, /Assemble the full sentence/],
    ['a2', /Fill the blanks/, /Select the missing words/],
    ['b1', /Free typing/, /AI-graded translation/],
  ])('describes the %s exercise mode', async (lvl, label, detail) => {
    const u = userEvent.setup();
    renderRoute({ level: lvl });
    await selectSection(u, 'Learning');
    const line = screen.getByText(/Translate exercises:/);
    expect(line).toHaveTextContent(label);
    expect(line).toHaveTextContent(detail);
  });

  // Case-transforming the descriptor mangled the acronym ("ai-graded").
  it('keeps the AI acronym uppercase in the B1 descriptor', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'b1' });
    await selectSection(u, 'Learning');
    expect(screen.getByText(/Translate exercises:/)).toHaveTextContent('AI-graded');
    expect(screen.queryByText(/ai-graded/)).toBeNull();
  });

  it('describes only the selected level, not all three', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'a1' });
    await selectSection(u, 'Learning');
    const line = screen.getByText(/Translate exercises:/);
    expect(line).not.toHaveTextContent(/AI-graded/);
    expect(line).not.toHaveTextContent(/missing words/);
  });

  it('names the level XP bonus for an account holder above A1', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'b1', levelBoost: true });
    await selectSection(u, 'Learning');
    expect(screen.getByText(/×1\.5 XP per answer/)).toBeInTheDocument();
  });

  it('promises no bonus to a guest', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'b1' });
    await selectSection(u, 'Learning');
    expect(screen.queryByText(/XP per answer/)).toBeNull();
  });

  it('names the level but promises no bonus for an A1 account holder', async () => {
    const u = userEvent.setup();
    renderRoute({ level: 'a1', levelBoost: true });
    await selectSection(u, 'Learning');
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.queryByText(/XP per answer/)).toBeNull();
  });
});

describe('SettingsRoute — Admin', () => {
  it('hides Admin for a regular signed-in user', () => {
    renderRoute();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('hides Admin for a guest even if leftover state claimed admin', () => {
    renderRoute({
      user: null,
      adminMe: { isAdmin: true, isSystemAccount: true, blocked: false },
    });
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('never renders Admin even when the server says isAdmin', () => {
    renderRoute({ adminMe: { isAdmin: true, isSystemAccount: true, blocked: false } });
    expect(screen.queryByText(/^Admin$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /feedback/i })).not.toBeInTheDocument();
  });

  it('shows a blocked banner without admin chrome', () => {
    renderRoute({ adminMe: { isAdmin: false, isSystemAccount: false, blocked: true } });
    expect(screen.getByText(/this account is blocked/i)).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});

describe('SettingsRoute — Hilfe', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('offers a non-admin learner a way to report an issue', async () => {
    // The acceptance report was "feedback is not discoverable on the test
    // account". Submitting was never admin-gated; the only entry point was a
    // small flag inside an exercise, so a learner anywhere else had none.
    const u = userEvent.setup();
    renderRoute();
    await selectSection(u, 'System');

    expect(screen.queryByText(/^Admin$/)).not.toBeInTheDocument();
    const report = screen.getByRole('button', { name: /report an issue/i });
    await u.click(report);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the report entry point for an admin too', async () => {
    const u = userEvent.setup();
    renderRoute({ adminMe: { isAdmin: true, isSystemAccount: true, blocked: false } });
    await selectSection(u, 'System');
    expect(screen.getByRole('button', { name: /report an issue/i })).toBeInTheDocument();
  });

  it('reopens the tutorial on request', async () => {
    const u = userEvent.setup();
    const { TUTORIAL_KEY } = await import('../../lib/tutorialPref');
    localStorage.setItem(TUTORIAL_KEY, 'true');
    renderRoute();
    await selectSection(u, 'System');

    await u.click(screen.getByRole('button', { name: /show tutorial/i }));

    // The flag is what a freshly-mounted overlay reads; the event is what a
    // mounted one hears. Settings has to do both.
    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
  });
});
