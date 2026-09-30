import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsSection from './NotificationsSection';

// The device half (plugin, OS permission, RPC) is pushNotifications.test.js.
// Here it is a set of answers, so this file tests only what the learner sees.
const { push } = vi.hoisted(() => ({
  push: {
    available: true,
    permission: 'prompt',
    device: null,
    enable: null,
    disable: null,
    platform: 'ios',
  },
}));

vi.mock('../../lib/pushNotifications', () => ({
  isPushAvailable: () => push.available,
  pushPermission: async () => push.permission,
  readPushDevice: () => push.device,
  enablePush: (...args) => push.enable(...args),
  disablePush: (...args) => push.disable(...args),
  nativePlatform: () => push.platform,
}));

const toggle = () => screen.findByRole('button', { name: /push notifications/i });

beforeEach(() => {
  push.available = true;
  push.permission = 'prompt';
  push.device = null;
  push.enable = vi.fn(async () => ({ ok: true }));
  push.disable = vi.fn(async () => ({ ok: true }));
  push.platform = 'ios';
});

describe('push disclosure', () => {
  it('shows the disclosure before any tap, and asks nothing on render', () => {
    render(<NotificationsSection userId="u1" />);
    expect(
      screen.getByText(/save a notification token for this device to your account/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/optional — the app works the same without them/i)).toBeInTheDocument();
    expect(push.enable).not.toHaveBeenCalled();
  });

  it('names APNs on iOS and FCM on Android', () => {
    push.platform = 'ios';
    const { unmount } = render(<NotificationsSection userId="u1" />);
    expect(screen.getByText(/Apple Push Notification service/)).toBeInTheDocument();
    unmount();
    push.platform = 'android';
    render(<NotificationsSection userId="u1" />);
    expect(screen.getByText(/Firebase Cloud Messaging by Google/)).toBeInTheDocument();
  });

  it('the disclosure precedes the switch in reading order', async () => {
    render(<NotificationsSection userId="u1" />);
    const text = screen.getByText(/save a notification token/i);
    const button = await toggle();
    expect(text.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('only the tap enables', async () => {
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    expect(push.enable).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(push.enable).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsSection', () => {
  it('renders nothing in a browser', () => {
    push.available = false;
    const { container } = render(<NotificationsSection userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts off on a device that has not opted in', async () => {
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('Push notifications: off');
  });

  it('turning it on runs the permission flow for this account', async () => {
    const onToast = vi.fn();
    render(<NotificationsSection userId="u1" onToast={onToast} />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));

    await userEvent.click(button);

    expect(push.enable).toHaveBeenCalledWith('u1');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Push notifications: on');
    expect(screen.getByRole('status')).toHaveTextContent('Push notifications are on.');
    expect(onToast).toHaveBeenCalledWith('Push notifications are on.');
  });

  it('shows on for a device already registered to this account', async () => {
    push.permission = 'granted';
    push.device = { token: 't', userId: 'u1', platform: 'ios' };
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });

  // One phone, two accounts: the last one's opt-in is not this one's.
  it('shows off for a device registered to a different account', async () => {
    push.permission = 'granted';
    push.device = { token: 't', userId: 'someone-else', platform: 'ios' };
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('turning it off opts the device out', async () => {
    push.permission = 'granted';
    push.device = { token: 't', userId: 'u1', platform: 'ios' };
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(button);

    expect(push.disable).toHaveBeenCalledTimes(1);
    expect(push.enable).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Push notifications are off.');
  });

  it('says where to fix it when the learner refuses the prompt', async () => {
    push.enable = vi.fn(async () => ({ ok: false, reason: 'denied' }));
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(/allow them in your phone’s settings/i);
  });

  it('explains an OS-level block up front, and still lets them retry', async () => {
    push.permission = 'denied';
    render(<NotificationsSection userId="u1" />);
    expect(await screen.findByText(/blocked for this app/i)).toBeInTheDocument();
    const button = await toggle();
    expect(button).toBeEnabled();
  });

  it('keeps it off and says so when turning on fails', async () => {
    push.enable = vi.fn(async () => ({ ok: false, reason: 'failed' }));
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(/could not turn on/i);
  });

  it('keeps it on and says so when turning off fails', async () => {
    push.permission = 'granted';
    push.device = { token: 't', userId: 'u1', platform: 'ios' };
    push.disable = vi.fn(async () => ({ ok: false, reason: 'failed' }));
    render(<NotificationsSection userId="u1" />);
    const button = await toggle();
    await vi.waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/could not turn off/i);
  });

  // A token saved under nobody is a device the server can never address.
  it('asks a guest to sign in instead of prompting', async () => {
    render(<NotificationsSection userId={null} />);
    const button = await toggle();
    expect(button).toBeDisabled();
    expect(screen.getByText(/sign in to turn these on/i)).toBeInTheDocument();
  });
});
