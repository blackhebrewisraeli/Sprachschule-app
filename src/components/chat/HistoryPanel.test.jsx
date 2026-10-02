import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fake = vi.hoisted(() => ({
  configured: true,
  available: true,
  enabled: true,
  rows: [],
  listError: false,
  deleteError: false,
  deleted: [],
}));

vi.mock('../../lib/aiHistory', () => ({
  isAiHistoryConfigured: () => fake.configured,
  listConversations: vi.fn(async () => {
    if (fake.listError) throw new Error('x');
    return fake.rows;
  }),
  deleteConversation: vi.fn(async (id) => {
    if (fake.deleteError) throw new Error('x');
    fake.deleted.push(id);
  }),
}));
vi.mock('../../lib/useAiHistoryEnabled', () => ({
  useAiHistoryEnabled: () => ({ available: fake.available, enabled: fake.enabled }),
}));

import HistoryPanel from './HistoryPanel';
import { listConversations } from '../../lib/aiHistory';

const SCENARIOS = [
  { id: 'coffee', name: 'Order Coffee', icon: '☕' },
  { id: 'airport', name: 'Airport', icon: '✈️' },
];
const ROWS = [
  {
    id: 'c1',
    scenario_id: 'coffee',
    level: 'a1',
    message_count: 6,
    last_message_at: '2026-10-02T10:00:00Z',
  },
  {
    id: 'c2',
    scenario_id: 'airport',
    level: 'a2',
    message_count: 4,
    last_message_at: '2026-10-01T10:00:00Z',
  },
];

const setup = (props = {}) => {
  const onContinue = vi.fn(async () => ({ ok: true }));
  const onDeleted = vi.fn();
  render(
    <HistoryPanel
      user={{ id: 'u1' }}
      scenarios={SCENARIOS}
      continuableIds={['coffee']}
      onContinue={onContinue}
      onDeleted={onDeleted}
      {...props}
    />
  );
  return { onContinue, onDeleted };
};
const openPanel = () => userEvent.click(screen.getByRole('button', { name: 'History' }));

beforeEach(() => {
  Object.assign(fake, {
    configured: true,
    available: true,
    enabled: true,
    rows: ROWS,
    listError: false,
    deleteError: false,
    deleted: [],
  });
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('availability', () => {
  it('renders nothing when the build has the feature off', () => {
    fake.configured = false;
    const { container } = render(
      <HistoryPanel user={{ id: 'u1' }} scenarios={[]} continuableIds={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('points a guest at sign-in and loads nothing', async () => {
    const onSignIn = vi.fn();
    render(<HistoryPanel user={null} scenarios={[]} continuableIds={[]} onSignIn={onSignIn} />);
    expect(screen.getByText(/sign in to keep your tutor conversations/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(listConversations).not.toHaveBeenCalled();
  });

  it('is collapsed and reads nothing until opened', () => {
    setup();
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(listConversations).not.toHaveBeenCalled();
  });
});

describe('the list', () => {
  it('shows each saved conversation with its scene, date and size', async () => {
    setup();
    await openPanel();
    expect(await screen.findByText(/Order Coffee/)).toBeInTheDocument();
    expect(screen.getByText(/6 messages · A1/)).toBeInTheDocument();
    expect(screen.getByText(/Airport/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('says so when nothing is saved yet', async () => {
    fake.rows = [];
    setup();
    await openPanel();
    expect(await screen.findByText(/no saved conversations yet/i)).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    fake.listError = true;
    setup();
    await openPanel();
    expect(await screen.findByText(/could not load your history/i)).toBeInTheDocument();
    fake.listError = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Order Coffee/)).toBeInTheDocument();
  });

  it('does not call the server while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    setup();
    await openPanel();
    expect(screen.getByText(/available when you are online/i)).toBeInTheDocument();
    expect(listConversations).not.toHaveBeenCalled();
  });

  it('still lists what is saved when saving is off, and says new ones are not kept', async () => {
    fake.enabled = false;
    setup();
    await openPanel();
    expect(await screen.findByText(/Order Coffee/)).toBeInTheDocument();
    expect(screen.getByText(/new conversations are not being saved/i)).toBeInTheDocument();
  });
});

describe('continue', () => {
  it('hands the row to Chat and closes the panel', async () => {
    const { onContinue } = setup();
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: /continue order coffee/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith(ROWS[0]));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'History' })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    );
  });

  it('stays open and says so when the conversation could not be opened', async () => {
    const { onContinue } = setup();
    onContinue.mockResolvedValue({ ok: false });
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: /continue order coffee/i }));
    expect(await screen.findByText(/could not open that conversation/i)).toBeInTheDocument();
  });

  it('cannot continue a scene that is not available at the learner’s level', async () => {
    setup();
    await openPanel();
    expect(await screen.findByRole('button', { name: /continue airport/i })).toBeDisabled();
    expect(screen.getByText(/not available at your level/i)).toBeInTheDocument();
  });
});

describe('delete', () => {
  it('asks first; keeping it deletes nothing', async () => {
    setup();
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: /delete order coffee/i }));
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(fake.deleted).toEqual([]);
    expect(screen.getByText(/Order Coffee/)).toBeInTheDocument();
  });

  it('deletes one conversation, removes it, and tells Chat', async () => {
    const { onDeleted } = setup();
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: /delete order coffee/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(fake.deleted).toEqual(['c1']));
    expect(onDeleted).toHaveBeenCalledWith('c1');
    expect(screen.queryByText(/Order Coffee/)).toBeNull();
    expect(screen.getByText(/Airport/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/conversation deleted/i);
  });

  it('keeps the row and says so when the delete fails', async () => {
    fake.deleteError = true;
    const { onDeleted } = setup();
    await openPanel();
    await userEvent.click(await screen.findByRole('button', { name: /delete order coffee/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/could not delete that conversation/i)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText(/Order Coffee/)).toBeInTheDocument();
  });
});
