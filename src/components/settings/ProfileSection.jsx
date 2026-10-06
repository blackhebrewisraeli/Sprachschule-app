import { useState } from 'react';
import {
  BORDER,
  COLORS,
  FIELD,
  FONTS,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SHADOW,
  SPACE,
  TEXT,
} from '../../lib/theme';
import { Stack } from '../ui/Layout';
import Button from '../ui/Button';
import StatusNote from '../ui/StatusNote';
import SegmentedPicker from '../ui/SegmentedPicker';
import { updateProfile } from '../../lib/profile';
import AvatarPicker from './AvatarPicker';
import { AlertTriangle } from 'lucide-react';

// Personal details: first / middle / last name, a unique social handle, the
// avatar picture picker, and whether the profile is private. The name parts and
// the handle are intentionally distinct: the name is how the app addresses the
// learner (display_name is GENERATED from the parts, 20260924120000), while
// @handle is the stable identifier other learners see on leaderboards.
//
// First and last are REQUIRED here rather than on the columns: sign-up creates
// the row without a name, so this form is where one is supplied, and it will not
// save without both. The API holds the same rule for any name write.
//
// Avatar is a picture or a generated identicon — one identity surface, the
// picture picker. There is no emoji field.
//
// Handle and avatar are PROFILE fields here, not league fields, so they are not
// gated behind LEAGUES_ENABLED the way the old Stats editor gated them. Only
// the league standings readout stays behind that flag.
//
// Optimistic UI would be wrong: handle is UNIQUE, so the server can reject a
// value the form already shows. The stored row it returns is the source of
// truth, and it is what the fields are reset to on success.
const asForm = (profile) => ({
  first_name: profile?.first_name ?? '',
  middle_name: profile?.middle_name ?? '',
  last_name: profile?.last_name ?? '',
  handle: profile?.handle ?? '',
  is_private: Boolean(profile?.is_private),
});

const FORM_FIELDS = ['first_name', 'middle_name', 'last_name', 'handle', 'is_private'];

const VISIBILITY = [
  { key: 'public', label: 'Public' },
  { key: 'private', label: 'Private' },
];

const labelStyle = { ...TEXT.fieldLabel, marginBottom: SPACE[2] };

// Every text control is the native FIELD recipe with a more generous profile-
// editor inset and a recessed surface. The actual input owns the border and
// focus ring; a decorative wrapper around a borderless input made keyboard
// focus almost invisible and left the form feeling unfinished.
const fieldInput = {
  ...FIELD,
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  padding: `${SPACE[3]}px ${SPACE[4]}px`,
  background: COLORS.surface1,
  border: `1px solid ${COLORS.borderStrong}`,
  boxShadow: SHADOW.inset,
  lineHeight: LINE_HEIGHT.normal,
};

export default function ProfileSection({
  profile,
  userId,
  onSaved,
  onToast,
  save = updateProfile,
}) {
  const [form, setForm] = useState(() => asForm(profile));
  const [saved, setSaved] = useState(() => asForm(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Dirty-tracking keeps a unique-column write off the wire until a field
  // actually changed.
  const dirty = FORM_FIELDS.some((f) => form[f] !== saved[f]);

  const onField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const onSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const stored = await save({
        first_name: form.first_name,
        middle_name: form.middle_name,
        last_name: form.last_name,
        handle: form.handle,
        is_private: form.is_private,
      });
      // Reset to what the SERVER stored, not to what was typed.
      const next = asForm(stored);
      setForm(next);
      setSaved(next);
      onSaved?.(stored);
      onToast?.('Profile saved');
    } catch (err) {
      setError(err?.message ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack
      as="form"
      gap={5}
      data-testid="profile-editor"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // onSave reports its own failures through setError.
        if (!saving) void onSave();
      }}
      style={{ width: '100%', maxWidth: 640, marginInline: 'auto' }}
    >
      {/* The picker writes avatar_path on its own — it does not share this
          form's dirty-tracking, because an upload is a completed act rather
          than an edit waiting on Save. */}
      <AvatarPicker
        userId={userId}
        profile={profile}
        onSaved={onSaved}
        onToast={onToast}
        save={save}
      />

      <Stack gap={3}>
        {[
          ['first_name', 'First name', true],
          ['middle_name', 'Middle name (optional)', false],
          ['last_name', 'Last name', true],
        ].map(([field, label, required]) => (
          <label key={field} style={{ display: 'block' }}>
            <span style={labelStyle}>{label}</span>
            <input
              data-ui="field"
              value={form[field]}
              onChange={onField(field)}
              required={required}
              maxLength={40}
              autoComplete={
                {
                  first_name: 'given-name',
                  middle_name: 'additional-name',
                  last_name: 'family-name',
                }[field]
              }
              style={{ ...fieldInput, fontFamily: FONTS.body }}
            />
          </label>
        ))}

        <label style={{ display: 'block' }}>
          <span style={labelStyle}>Handle</span>
          <div style={{ position: 'relative' }}>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: SPACE[4],
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.lg,
                lineHeight: LINE_HEIGHT.normal,
                color: COLORS.mute,
                pointerEvents: 'none',
              }}
            >
              @
            </span>
            <input
              data-ui="field"
              value={form.handle}
              onChange={onField('handle')}
              placeholder="semion"
              maxLength={24}
              style={{ ...fieldInput, paddingLeft: SPACE[8], fontFamily: FONTS.mono }}
            />
          </div>
        </label>
      </Stack>

      <div
        style={{
          background: COLORS.surface1,
          border: BORDER.panel,
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.inset,
          padding: SPACE[4],
        }}
      >
        <span style={labelStyle}>Profile visibility</span>
        <SegmentedPicker
          ariaLabel="Profile visibility"
          options={VISIBILITY}
          activeKey={form.is_private ? 'private' : 'public'}
          onPick={(o) => setForm((prev) => ({ ...prev, is_private: o.key === 'private' }))}
        />
        <p
          style={{
            margin: `${SPACE[2]}px 0 0`,
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.sm,
            color: COLORS.mute,
          }}
        >
          Private hides you from Find People and shows others only your name, handle and picture.
        </p>
      </div>

      {error && (
        <StatusNote tone="error" icon={AlertTriangle}>
          {error}
        </StatusNote>
      )}

      <div>
        <Button type="submit" disabled={!dirty || saving} busy={saving} style={{ width: '100%' }}>
          Save profile
        </Button>
      </div>
    </Stack>
  );
}
