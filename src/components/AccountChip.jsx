import { useState, useEffect, useRef } from 'react';
import { User, Settings as SettingsIcon, LogOut, Smile, PencilLine } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW, SPACE } from '../lib/theme';
import { isAuthConfigured } from '../lib/auth.js';
import { profileName } from '../lib/profile.js';
import Avatar from './ui/Avatar';

// Where a status lives. LOCAL ONLY, deliberately: `profiles` has no status
// column, and inventing one here would mean a migration, a patch-allowlist
// entry and a sync path for a decoration. It is per-device until that exists,
// which is the honest behaviour for something stored in localStorage — not a
// button that pretends to save.
const STATUS_KEY = 'deutsch-account-status';
const STATUS_MAX_LENGTH = 80;

function sanitizeStatus(raw) {
  if (typeof raw !== 'string') return '';

  return (
    raw
      .replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu, '')
      // `<` and `>` are Unicode Math Symbols (`\p{S}`), so the filter above
      // leaves them untouched — a status could otherwise carry a well-formed
      // HTML tag. Nothing today renders this value except `{status}` as plain
      // JSX text (React escapes it), so this is not fixing a live exploit; it
      // is removing the only two characters that could ever form one, in case
      // a future consumer renders it less carefully.
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, STATUS_MAX_LENGTH)
  );
}

function readStatus() {
  try {
    return sanitizeStatus(localStorage.getItem(STATUS_KEY));
  } catch {
    // Private mode, blocked site data: a missing status is not an error.
    return '';
  }
}

function writeStatus(value) {
  try {
    const safeValue = sanitizeStatus(value);
    if (safeValue) localStorage.setItem(STATUS_KEY, safeValue);
    else localStorage.removeItem(STATUS_KEY);
    return true;
  } catch {
    // Private mode, blocked site data, quota. There is nothing for a caller to
    // DO about it — the sheet still shows the status for this session — but the
    // outcome is reported rather than swallowed by an empty block, matching
    // hasStoredLevel's shape in levelPref.js.
    return false;
  }
}

// Header account affordance. Guest: a quiet "Sign in" link. Signed-in: an
// initial-in-a-circle that opens a small sheet (email · settings · sign out).
// Full management lives in the tabbed Settings route; this is the glance +
// escape.
//
// This sheet is the ONE door to Settings. Home's identity strip used to carry a
// "Settings →" link of its own, which made two Settings doors on the landing
// screen and none of them the account bubble; that link is gone.
//
// Profile and Settings are both here again. #314 removed the Profile row
// because both landed on the SAME tab — Profile on its overview view, Settings
// on the deeper one — so two names sat inches apart pointing at one place.
// That stopped being true when the Profile tab became one consolidated page
// and Settings became a route off it with its own back link: they are two
// destinations now, and the sheet names both.
//
// The sheet is also an identity surface rather than a bare popover. It was an
// email line and two text links — no avatar, no name, no grouping — while the
// profile row it needed was already being fetched for the Profile page.
//
// The sheet is a `dialog`, matching ThemeChip and StatusChip. It previously
// advertised `aria-haspopup="true"` — which means MENU — over a panel carrying
// no role at all, so a screen reader announced a menu, opened it, and found an
// unlabelled generic div. `role="menu"` would not have been the fix either:
// menu semantics want `menuitem` children and arrow-key traversal, and half of
// this panel is static text (the email). It is a small labelled panel with
// mixed content, which is what a non-modal dialog is for.
//
// Being honest about that also brings it inside the contrast gate, which
// discovers header sheets by `aria-haspopup="dialog"`. Its interior — the
// email line and the red "Sign out" — had never been contrast-audited,
// because a sheet that never opens contributes no pairings.

// One row of the grouped list. Every row is icon + label on the same recipe,
// which is what makes the sheet read as a menu rather than as three unrelated
// links; Sign out passes its own colour and nothing else.
const ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACE[2],
  width: '100%',
  background: 'none',
  border: 'none',
  color: COLORS.ink,
  fontFamily: FONTS.sans,
  fontSize: FONT_SIZE.tag,
  cursor: 'pointer',
  padding: `${SPACE[2]}px ${SPACE[1]}px`,
  textAlign: 'left',
  borderRadius: RADIUS.sm,
};

// Group separator. COLORS.mute is a foreground token being used as a rule on
// purpose: `border` is too faint to group anything at this size, and the point
// of the redesign was that the sheet had no visible structure at all.
const GROUP = {
  borderTop: `1px solid ${COLORS.mute}`,
  marginTop: SPACE[2],
  paddingTop: SPACE[2],
};

const STATUS_ACTION = {
  background: 'none',
  border: 'none',
  color: COLORS.mute,
  fontFamily: FONTS.mono,
  fontSize: FONT_SIZE.tag,
  cursor: 'pointer',
  padding: SPACE[1],
};

// `ariaLabel` is separate from the visible text on purpose. The Settings row
// reads "Settings" but answers to "Open settings", which is the name every
// existing test and the contrast gate already use — and "Open settings" printed
// in the menu would be an accessible name leaking into the UI.
function Row({ icon: Icon, label, ariaLabel, onClick, color = COLORS.ink }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      style={{ ...ROW, color }}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export default function AccountChip({
  user,
  profile = null,
  onSignIn,
  onSignOut,
  onOpenSettings,
  onOpenProfile,
  onEditProfile,
  pending = false,
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(() => readStatus());
  const [editingStatus, setEditingStatus] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // Escape and outside-click, the dismissal a dialog is expected to have and
  // the only two this sheet was missing. Same handling as its two siblings, so
  // the three header sheets behave alike rather than each having its own rules.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  // No auth backend configured → offer nothing to sign in to. WelcomeGate has
  // always checked this; this chip did not, so when the demo's Supabase project
  // stopped resolving (2026-08-01) the splash went clean while the header kept
  // offering a dead "Sign in". An already signed-in user still gets the chip, so
  // a session that outlives the config change keeps its way out.
  if (!user && !isAuthConfigured()) return null;

  if (!user) {
    return (
      <button
        type="button"
        // Sits directly on the charcoal masthead, which does not invert. The
        // default ink ring is near-black in light mode and invisible here.
        // data-focus-on-dark paints the ring in currentColor — accentBlackOn,
        // inherited from the header — the same shared attribute Toast uses.
        data-ui="button"
        data-focus-on-dark=""
        onClick={onSignIn}
        style={{
          background: 'none',
          border: 'none',
          // Inherits the masthead ink. Not COLORS.ink: that is near-black in
          // light mode and this button sits on the charcoal bar.
          color: 'inherit',
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.tag,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          cursor: 'pointer',
        }}
      >
        Sign in
      </button>
    );
  }

  const initial = (user.email?.[0] ?? '?').toUpperCase();
  const name = profileName(profile);
  const saveStatus = () => {
    const next = sanitizeStatus(draft);
    setStatus(next);
    writeStatus(next);
    setEditingStatus(false);
  };
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {pending && (
        <span
          aria-label="Sync pending"
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: COLORS.accentRed,
            // Ringed in the bar's own colour so the dot reads as separate from
            // the avatar beneath it. `paper` would be the page ground, which
            // is no longer what is behind this.
            border: `2px solid ${COLORS.accentBlack}`,
            zIndex: 1,
          }}
        />
      )}
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="dialog"
        aria-expanded={open}
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        // Own surface disc on the charcoal bar. An outset ink ring would paint
        // onto the masthead (1:1 in light); inset keeps it on the disc.
        data-ui="button"
        data-focus-inset=""
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          // Inverted onto its own surface, like the ring discs and StatBlock:
          // an `ink` fill is near-black in light mode and would disappear into
          // the charcoal bar. `ink` on `surface` is an audited pairing.
          background: COLORS.surface,
          color: COLORS.ink,
          border: 'none',
          fontFamily: FONTS.mono,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {initial}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Account"
          style={{
            position: 'absolute',
            right: 0,
            top: 40,
            background: COLORS.paper,
            // Carry the ink as well as the surface. The masthead sets
            // `color: accentBlackOn` for its charcoal bar and that INHERITS,
            // so a sheet that sets only a background renders on-charcoal ink
            // on light paper — the email line measured 1:1 in light.day, i.e.
            // literally invisible. Its siblings both set this; this one did
            // not, and nothing caught it because the sheet was never opened.
            color: COLORS.ink,
            border: `1px solid ${COLORS.ink}`,
            borderRadius: RADIUS.md,
            boxShadow: SHADOW.bar,
            padding: SPACE[2],
            width: 304,
            maxWidth: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            zIndex: 60,
          }}
        >
          {/* ── Identity ─────────────────────────────────────── */}
          <div
            data-testid="account-identity"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE[3],
              minWidth: 0,
              padding: SPACE[3],
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.surface2,
            }}
          >
            <Avatar profile={profile ?? {}} userId={user.id} size={64} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontWeight: FONT_WEIGHT.bold,
                  fontSize: FONT_SIZE.xl,
                  lineHeight: 1.15,
                  color: COLORS.ink,
                  overflowWrap: 'anywhere',
                }}
              >
                {name}
              </div>
              {profile?.handle && (
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: FONT_SIZE.ipa,
                    color: COLORS.inkSoft,
                    overflowWrap: 'anywhere',
                    marginTop: SPACE[1],
                  }}
                >
                  @{profile.handle}
                </div>
              )}
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: FONT_SIZE.label,
                  lineHeight: 1.35,
                  color: COLORS.mute,
                  overflowWrap: 'anywhere',
                  marginTop: SPACE[1],
                }}
              >
                {user.email}
              </div>
            </div>
          </div>

          {/* ── Status ───────────────────────────────────────────
              Local to this device until `profiles` has a column for it. */}
          <div style={{ marginTop: SPACE[3] }}>
            {editingStatus ? (
              <div style={{ display: 'flex', gap: SPACE[1], alignItems: 'center' }}>
                <input
                  aria-label="Status"
                  value={draft}
                  autoFocus
                  maxLength={STATUS_MAX_LENGTH}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    saveStatus();
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: FONTS.body,
                    fontSize: FONT_SIZE.tag,
                    color: COLORS.ink,
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.borderStrong}`,
                    borderRadius: RADIUS.sm,
                    padding: `${SPACE[1]}px ${SPACE[2]}px`,
                  }}
                />
                <button type="button" aria-label="Save" onClick={saveStatus} style={STATUS_ACTION}>
                  Save
                </button>
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => {
                    setStatus('');
                    writeStatus('');
                    setDraft('');
                    setEditingStatus(false);
                  }}
                  style={STATUS_ACTION}
                >
                  Clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={status ? 'Edit status' : 'Set status'}
                onClick={() => {
                  setDraft(status);
                  setEditingStatus(true);
                }}
                style={{
                  ...ROW,
                  border: `1px solid ${COLORS.borderStrong}`,
                  borderRadius: RADIUS.md,
                  color: status ? COLORS.ink : COLORS.mute,
                }}
              >
                <Smile size={14} aria-hidden="true" />
                <span style={{ overflowWrap: 'anywhere' }}>{status || 'Set status'}</span>
              </button>
            )}
          </div>

          {/* ── Destinations ─────────────────────────────────── */}
          <div style={GROUP}>
            <Row
              icon={User}
              label="Your profile"
              onClick={() => {
                setOpen(false);
                onOpenProfile?.();
              }}
            />
            <Row
              icon={PencilLine}
              label="Edit Profile"
              onClick={() => {
                setOpen(false);
                onEditProfile?.();
              }}
            />
            <Row
              icon={SettingsIcon}
              label="Settings"
              ariaLabel="Open settings"
              onClick={() => {
                setOpen(false);
                onOpenSettings?.();
              }}
            />
          </div>

          <div style={GROUP}>
            <Row icon={LogOut} label="Sign out" onClick={onSignOut} color={COLORS.red} />
          </div>
        </div>
      )}
    </div>
  );
}
