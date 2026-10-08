import { useState } from 'react';
import { COLORS, FONTS, FONT_SIZE, SPACE, RADIUS } from '../../lib/theme';
import Button from '../ui/Button';
import { Body, Meta } from '../ui/Text';
import { Stack } from '../ui/Layout';
import { isAuthConfigured } from '../../lib/auth.js';

// Mirrors CONFIRM_PHRASE in api/v1/account/delete.js. The server is the
// authority — this only decides when the button stops being disabled.
export const DELETE_CONFIRM_PHRASE = 'DELETE';

function formatRelativeSync(ms) {
  if (!ms) return null;
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// Account management: sign out, last-synced, export, danger zone.
//
// Identity (email, handle, avatar) deliberately does NOT live here. It used to
// carry its own Handle and Avatar inputs alongside ProfileSection's, so one
// server row had two editors and two local states. Worse, these two started
// EMPTY rather than loading the stored values, so saving without retyping sent
// blank strings — and the endpoint treats an empty string as "clear this
// field", which quietly wiped the learner's handle. One writer per field.
export default function AccountSection({
  user,
  onSignIn,
  onSignOut,
  onExport,
  onDelete,
  lastSyncedAt = null,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [exporting, setExporting] = useState(false);

  // See AccountChip: with no auth backend configured there is nothing to sign in
  // to, so don't advertise it. A signed-in user still gets the full section.
  if (!user && !isAuthConfigured()) return null;

  // Centred: it sits under the Profile subsection's centred guest note, and a
  // left-aligned prompt there read as a second, misaligned block.
  if (!user) {
    return (
      <Stack gap={3} align="center" style={{ fontFamily: FONTS.body, textAlign: 'center' }}>
        {/* A sentence, so it is set as one. This shipped as 10px mono at the
            muted ink — the label recipe, worn by prose. */}
        <Body size="sm" tone="soft">
          Sign in to sync your progress across devices.
        </Body>
        <Button onClick={onSignIn}>Sign in to sync →</Button>
      </Stack>
    );
  }

  // Trim before comparing: phone keyboards add a trailing space after an
  // autocapitalised word, and blocking on invisible whitespace reads as a bug.
  // The trimmed phrase is what gets sent, so the server still sees it exactly.
  const confirmArmed = typed.trim() === DELETE_CONFIRM_PHRASE;

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport?.();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      {/* This one IS a meta readout, so it keeps the label face — but from the
          token, with the tracking and the uppercase that make 10px mono
          readable, rather than a partial hand copy of it. */}
      {lastSyncedAt != null && (
        <Meta as="div" style={{ marginBottom: SPACE[2] }}>
          Last synced · {formatRelativeSync(lastSyncedAt)}
        </Meta>
      )}
      <Button variant="secondary" onClick={onSignOut} style={{ marginBottom: SPACE[4] }}>
        Sign out
      </Button>

      <div style={{ marginBottom: SPACE[3] }}>
        <Button
          variant="secondary"
          onClick={handleExport}
          disabled={exporting}
          aria-label="Export my data"
        >
          {exporting ? 'Exporting…' : 'Export my data'}
        </Button>
      </div>

      {/* Danger Zone */}
      <div
        style={{
          border: `1px solid ${COLORS.red}`,
          borderRadius: RADIUS.md,
          padding: SPACE[4],
          marginTop: SPACE[4],
        }}
      >
        {/* Authored in sentence case and uppercased by the label recipe, so
            a screen reader reads "Danger zone" instead of spelling it. */}
        <Meta as="div" tone="error" style={{ marginBottom: SPACE[2] }}>
          Danger zone
        </Meta>
        <Body size="sm" style={{ marginBottom: SPACE[3] }}>
          Permanently delete your account and all data. This cannot be undone.
        </Body>
        {!confirmDelete ? (
          <Button
            variant="danger"
            aria-label="Delete account"
            onClick={() => setConfirmDelete(true)}
          >
            Delete account
          </Button>
        ) : (
          <div>
            <Body size="sm" tone="error" style={{ marginBottom: SPACE[2] }}>
              This erases all your progress and cannot be undone. Type{' '}
              <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm.
            </Body>
            {/* No visible label: the sentence above IS the instruction, and a
                second "Confirm" caption would have to be repeated inside the
                aria-label to satisfy Label in Name. */}
            <input
              aria-label={`Type ${DELETE_CONFIRM_PHRASE} to confirm`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck="false"
              style={{
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.base,
                padding: `${SPACE[1]}px ${SPACE[2]}px`,
                borderRadius: RADIUS.sm,
                border: `1px solid ${COLORS.red}`,
                background: 'transparent',
                color: COLORS.ink,
                width: '100%',
                marginBottom: SPACE[2],
              }}
            />
            <div style={{ display: 'flex', gap: SPACE[2] }}>
              {/* Disabled until the phrase matches, so the destructive control
                  cannot be reached by muscle memory alone. */}
              <Button
                variant="danger"
                aria-label={`Permanently delete my account`}
                disabled={!confirmArmed}
                onClick={async () => {
                  try {
                    await onDelete?.(DELETE_CONFIRM_PHRASE);
                  } catch {
                    // Leave the phrase typed. The usual rejection here is
                    // reauth_required, and retrying after signing in again
                    // should be one click rather than a re-type.
                  }
                }}
              >
                Permanently delete
              </Button>
              {/* `flex: 1` is explicit now that BUTTON.secondary no longer
                  carries it — this Cancel used to fill the rest of the confirm
                  row beside the destructive action. */}
              <Button
                variant="secondary"
                aria-label="Cancel"
                style={{ flex: 1 }}
                onClick={() => {
                  setConfirmDelete(false);
                  setTyped('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
