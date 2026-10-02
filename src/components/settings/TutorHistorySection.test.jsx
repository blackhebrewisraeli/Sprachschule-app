import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The server is a set of answers: what the settings row says, and whether a
// write or a delete succeeds. aiHistory.js itself is covered in its own file.
const server = vi.hoisted(() => ({
  enabled: false,
  saveFails: false,
  deleteFails: false,
  saves: [],
  deletes: [],
}));

vi.mock('../../lib/auth.js', () => ({
  isAuthConfigured: () => true,
  getSupabase: async () => ({
    from: (table) => {
      const q = {
        select: () => q,
        eq: (col, val) => {
          q.filter = [col, val];
          return q;
        },
        upsert: async (row) => {
          server.saves.push(row);
          return server.saveFails ? { error: new Error('x') } : { error: null };
        },
        delete: () => ({
          eq: async (col, val) => {
            server.deletes.push([table, col, val]);
            return server.deleteFails ? { error: new Error('x') } : { error: null };
          },
        }),
        then: (resolve) => resolve({ data: [{ ai_history_enabled: server.enabled }], error: null }),
      };
      return q;
    },
  }),
}));

import TutorHistorySection from './TutorHistorySection';
import { resetAiHistoryState } from '../../lib/useAiHistoryEnabled';

const toggle = () => screen.findByRole('button', { name: /save my tutor conversations/i });

beforeEach(() => {
  vi.stubEnv('VITE_AI_HISTORY_ENABLED', 'true');
  Object.assign(server, { enabled: false, saveFails: false, deleteFails: false });
  server.saves = [];
  server.deletes = [];
  resetAiHistoryState();
});
afterEach(() => vi.unstubAllEnvs());

describe('availability', () => {
  it('renders nothing when the build has the feature off', () => {
    vi.stubEnv('VITE_AI_HISTORY_ENABLED', 'false');
    const { container } = render(<TutorHistorySection userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a guest', () => {
    const { container } = render(<TutorHistorySection userId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the switch', () => {
  it('says what is saved before any tap, and is off by default', async () => {
    render(<TutorHistorySection userId="u1" />);
    expect(
      screen.getByText(/what you write and what the tutor replies is saved to your account/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/off unless you turn it on/i)).toBeInTheDocument();
    const button = await toggle();
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    expect(server.saves).toEqual([]);
  });

  it('reflects an account that already opted in', async () => {
    server.enabled = true;
    render(<TutorHistorySection userId="u1" />);
    await waitFor(async () => expect(await toggle()).toHaveAttribute('aria-pressed', 'true'));
  });

  it('turns on only after the server confirms, writing just the flag', async () => {
    render(<TutorHistorySection userId="u1" />);
    await userEvent.click(await toggle());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saving is on/i));
    expect(server.saves).toEqual([{ user_id: 'u1', ai_history_enabled: true }]);
    expect(await toggle()).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays off, and says so, when the server refuses to turn it on', async () => {
    server.saveFails = true;
    render(<TutorHistorySection userId="u1" />);
    await userEvent.click(await toggle());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not update/i));
    expect(await toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('turning off applies at once and stays off even if the server write fails', async () => {
    server.enabled = true;
    render(<TutorHistorySection userId="u1" />);
    await waitFor(async () => expect(await toggle()).toHaveAttribute('aria-pressed', 'true'));
    server.saveFails = true;
    await userEvent.click(await toggle());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not update/i));
    expect(await toggle()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('deleting saved conversations', () => {
  it('asks first, then deletes only this learner’s conversations', async () => {
    render(<TutorHistorySection userId="u1" />);
    await userEvent.click(
      await screen.findByRole('button', { name: /delete all saved conversations/i })
    );
    expect(server.deletes).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/saved conversations deleted/i)
    );
    expect(server.deletes).toEqual([['ai_conversations', 'user_id', 'u1']]);
  });

  it('keeping them deletes nothing', async () => {
    render(<TutorHistorySection userId="u1" />);
    await userEvent.click(
      await screen.findByRole('button', { name: /delete all saved conversations/i })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep them' }));
    expect(server.deletes).toEqual([]);
    expect(
      screen.getByRole('button', { name: /delete all saved conversations/i })
    ).toBeInTheDocument();
  });

  it('reports a failed delete instead of claiming success', async () => {
    server.deleteFails = true;
    render(<TutorHistorySection userId="u1" />);
    await userEvent.click(
      await screen.findByRole('button', { name: /delete all saved conversations/i })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not delete/i));
  });
});
