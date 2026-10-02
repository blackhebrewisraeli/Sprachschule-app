import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import {
  COLORS,
  FONT_BODY,
  FONT_MONO,
  FONT_SIZE,
  LETTER_SPACING,
  RADIUS,
  SPACE,
} from '../../lib/theme';
import Button from '../ui/Button';
import { isAiHistoryConfigured, listConversations, deleteConversation } from '../../lib/aiHistory';
import { useAiHistoryEnabled } from '../../lib/useAiHistoryEnabled';

// Saved tutor conversations: a collapsed "History" control that lists them,
// continues one in the live thread (reading it is the same view), and deletes
// one. Read from the server on open and held in memory only — nothing is cached
// on the device, so a signed-out learner on a shared device leaves no trace.
//
// Dark unless the build has the feature on. A guest sees one line pointing at
// sign-in; a signed-in learner who has not opted in still sees what is already
// saved, with a note that new conversations are not being kept.

// Pinned to English: the rest of the UI is English, and a browser in another
// script would otherwise drop right-to-left fragments into the meta line.
const dateOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const labelStyle = {
  fontFamily: FONT_MONO,
  fontSize: FONT_SIZE.tag,
  letterSpacing: LETTER_SPACING.caps,
  textTransform: 'uppercase',
  color: COLORS.mute,
};

const noteStyle = {
  margin: 0,
  fontFamily: FONT_BODY,
  fontSize: FONT_SIZE.sm,
  color: COLORS.inkSoft,
  overflowWrap: 'break-word',
};

export default function HistoryPanel({
  user,
  scenarios,
  continuableIds,
  onContinue,
  onDeleted,
  onSignIn,
}) {
  const { available, enabled } = useAiHistoryEnabled(user?.id);
  const [open, setOpen] = useState(false);
  // 'loading' | 'ready' | 'error' | 'offline'
  const [status, setStatus] = useState('loading');
  const [rows, setRows] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    setStatus('loading');
    try {
      setRows(await listConversations());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    if (open && available) void load();
  }, [open, available]);

  // Signing out or switching account closes the panel and drops what it held.
  useEffect(() => {
    if (!available) {
      setOpen(false);
      setRows([]);
      setConfirming(null);
      setMessage(null);
    }
  }, [available]);

  if (!isAiHistoryConfigured()) return null;

  if (!user) {
    return (
      <p style={noteStyle}>
        Sign in to keep your tutor conversations.
        {onSignIn && (
          <>
            {' '}
            <Button variant="secondary" size="sm" onClick={onSignIn}>
              Sign in
            </Button>
          </>
        )}
      </p>
    );
  }
  if (!available) return null;

  const nameOf = (id) => scenarios.find((s) => s.id === id)?.name ?? 'Conversation';
  const iconOf = (id) => scenarios.find((s) => s.id === id)?.icon;

  const handleContinue = async (row) => {
    setBusy(row.id);
    setMessage(null);
    const { ok } = await onContinue(row);
    setBusy(null);
    if (ok) setOpen(false);
    else setMessage('Could not open that conversation. Try again.');
  };

  const handleDelete = async (row) => {
    setBusy(row.id);
    setMessage(null);
    try {
      await deleteConversation(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onDeleted?.(row.id);
      setMessage('Conversation deleted.');
    } catch {
      setMessage('Could not delete that conversation. Try again.');
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <div style={{ minWidth: 0 }}>
      <button
        type="button"
        data-ui="button"
        aria-expanded={open}
        aria-controls="chat-history-panel"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...labelStyle,
          display: 'flex',
          alignItems: 'center',
          gap: SPACE[2],
          width: '100%',
          minHeight: 40,
          padding: `0 ${SPACE[3]}px`,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <History size={16} aria-hidden="true" />
        <span>History</span>
      </button>

      {open && (
        <div
          id="chat-history-panel"
          style={{
            marginTop: SPACE[2],
            display: 'grid',
            gap: SPACE[2],
            minWidth: 0,
          }}
        >
          {!enabled && (
            <p style={noteStyle}>
              New conversations are not being saved. Turn it on in Settings → Account.
            </p>
          )}
          {status === 'loading' && <p style={noteStyle}>Loading…</p>}
          {status === 'offline' && (
            <p style={noteStyle}>History is available when you are online.</p>
          )}
          {status === 'error' && (
            <div style={{ display: 'grid', gap: SPACE[2] }}>
              <p style={noteStyle}>Could not load your history.</p>
              <Button variant="secondary" size="sm" onClick={load}>
                Try again
              </Button>
            </div>
          )}
          {status === 'ready' && rows.length === 0 && (
            <p style={noteStyle}>No saved conversations yet.</p>
          )}
          {status === 'ready' && rows.length > 0 && (
            <ul
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: SPACE[2] }}
            >
              {rows.map((row) => {
                const name = nameOf(row.scenario_id);
                const when = dateOf(row.last_message_at);
                const canContinue = continuableIds.includes(row.scenario_id);
                return (
                  <li
                    key={row.id}
                    style={{
                      padding: SPACE[3],
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.md,
                      display: 'grid',
                      gap: SPACE[2],
                      minWidth: 0,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: FONT_BODY,
                          fontSize: FONT_SIZE.md,
                          color: COLORS.ink,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {iconOf(row.scenario_id) ? `${iconOf(row.scenario_id)} ` : ''}
                        {name}
                      </div>
                      <div style={{ ...labelStyle, marginTop: 2, overflowWrap: 'anywhere' }}>
                        {[when, `${row.message_count} messages`, String(row.level).toUpperCase()]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    {confirming === row.id ? (
                      <div role="group" aria-label={`Confirm deleting ${name} ${when}`}>
                        <p style={{ ...noteStyle, marginBottom: SPACE[2] }}>
                          Delete this conversation? This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap' }}>
                          <Button
                            variant="danger"
                            size="sm"
                            busy={busy === row.id}
                            onClick={() => handleDelete(row)}
                          >
                            Delete
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === row.id}
                            onClick={() => setConfirming(null)}
                          >
                            Keep it
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          busy={busy === row.id}
                          disabled={!canContinue || busy !== null}
                          aria-label={`Continue ${name} ${when}`}
                          onClick={() => handleContinue(row)}
                        >
                          Continue
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          aria-label={`Delete ${name} ${when}`}
                          onClick={() => {
                            setMessage(null);
                            setConfirming(row.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                    {!canContinue && (
                      <p style={noteStyle}>This scene is not available at your level.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div role="status" style={{ ...noteStyle, minHeight: message ? undefined : 0 }}>
            {message}
          </div>
        </div>
      )}
    </div>
  );
}
