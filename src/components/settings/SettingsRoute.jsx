import { useState } from 'react';
import { Lock } from 'lucide-react';
import { FONTS, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING, SPACE, TEXT } from '../../lib/theme';
import { Stack } from '../ui/Layout';
import Heading from '../ui/Heading';
import Surface from '../ui/Surface';
import StatusNote from '../ui/StatusNote';
import SegmentedPicker from '../ui/SegmentedPicker';
import { Body } from '../ui/Text';
import LevelSwitcher from '../ui/LevelSwitcher';
import Button from '../ui/Button';
import GoalPicker from '../gamification/GoalPicker';
import AppearancePicker from '../AppearancePicker';
import AccountSection from './AccountSection';
import EmailSection from './EmailSection';
import ProfileSection from './ProfileSection';
import OfflineCacheSection from './OfflineCacheSection';
import NotificationsSection from './NotificationsSection';
import TutorHistorySection from './TutorHistorySection';
import InterestPicker from './InterestPicker';
import ModelPicker from '../ModelPicker';
import FeedbackDialog from '../FeedbackDialog';
import { replayTutorial } from '../../lib/tutorialPref';
import { isPushAvailable } from '../../lib/pushNotifications';
import { isAiHistoryConfigured } from '../../lib/aiHistory';
import { userTierOf } from '../../lib/ai-routing/preference.js';
import { getThemeModeForUI, setThemePreference } from '../../lib/themeMode';
import { isAuthConfigured } from '../../lib/auth.js';
import { writeLevel, LEVEL_NAMES, LEVEL_MODES } from '../../lib/levelPref';
import { PLACEMENT_OFFER_XP } from '../../lib/placementOffer';
import { LEVEL_MULTIPLIERS } from '../../lib/gameConfig';

const SETTINGS_SECTIONS = [
  { key: 'account', label: 'Account' },
  { key: 'learning', label: 'Learning' },
  { key: 'system', label: 'System' },
];

const titleStyle = {
  fontFamily: FONTS.body,
  fontSize: FONT_SIZE['3xl'],
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.tight,
  lineHeight: 1.2,
};

const subsectionTitleStyle = {
  fontFamily: FONTS.body,
  fontWeight: FONT_WEIGHT.semibold,
  letterSpacing: LETTER_SPACING.normal,
};

function Hint({ children }) {
  return (
    <Body size="sm" tone="soft" style={{ overflowWrap: 'anywhere' }}>
      {children}
    </Body>
  );
}

function Field({ label, hint, children }) {
  return (
    <Stack gap={2}>
      <div style={TEXT.subhead}>{label}</div>
      {hint ? <Hint>{hint}</Hint> : null}
      {children}
    </Stack>
  );
}

function Subsection({ title, children, centered = false }) {
  return (
    <section style={centered ? { width: '100%', maxWidth: 680, marginInline: 'auto' } : undefined}>
      <Heading level={3} size="sm" style={{ ...subsectionTitleStyle, marginBottom: SPACE[3] }}>
        {title}
      </Heading>
      {children}
    </section>
  );
}

function SettingsPanel({ title, children, maxWidth, ...rest }) {
  const titleId = `settings-${title.toLowerCase()}-title`;
  return (
    <section
      aria-labelledby={titleId}
      style={{ width: '100%', maxWidth, marginInline: maxWidth ? 'auto' : undefined }}
      {...rest}
    >
      <Heading
        id={titleId}
        level={2}
        size="lg"
        style={{ ...subsectionTitleStyle, marginBottom: SPACE[3] }}
      >
        {title}
      </Heading>
      <Surface elevation={1} padding={4}>
        {children}
      </Surface>
    </section>
  );
}

export default function SettingsRoute({
  user,
  profile,
  adminMe,
  onProfileSaved,
  onToast,
  level,
  onLevelChange,
  onRetakePlacement,
  goal,
  onGoalChange,
  soundOn = false,
  onSoundChange,
  interestTopics = [],
  enabledInterests = [],
  onInterestsChange,
  preferredModel = 'auto',
  onPreferredModelChange,
  levelBoost = false,
  onSignIn,
  onSignOut,
  onExport,
  onDelete,
  lastSyncedAt,
}) {
  const [activeSection, setActiveSection] = useState('account');
  const [themeMode, setThemeMode] = useState(() => getThemeModeForUI());
  const [showLevelOverride, setShowLevelOverride] = useState(false);
  const [reporting, setReporting] = useState(false);

  return (
    <div>
      <Heading level={1} size="xl" style={{ ...titleStyle, marginBottom: SPACE[4] }}>
        Einstellungen
      </Heading>

      <SegmentedPicker
        options={SETTINGS_SECTIONS}
        activeKey={activeSection}
        onPick={({ key }) => setActiveSection(key)}
        ariaLabel="Settings section"
      />

      <div style={{ marginTop: SPACE[6] }}>
        {activeSection === 'account' && (
          <SettingsPanel title="Account" maxWidth={900} data-testid="settings-account-panel">
            <Stack gap={6}>
              {adminMe?.blocked ? (
                <Body size="sm" style={{ overflowWrap: 'anywhere' }}>
                  This account is blocked. You can still export or delete your data below.
                </Body>
              ) : null}

              {user ? (
                <>
                  <Subsection title="Profile" centered>
                    <ProfileSection
                      profile={profile}
                      userId={user.id}
                      onSaved={onProfileSaved}
                      onToast={onToast}
                    />
                  </Subsection>

                  <Subsection title="Email">
                    <EmailSection user={user} onToast={onToast} onReauth={onSignIn} />
                  </Subsection>

                  {/* Dark until VITE_AI_HISTORY_ENABLED is set; signed-in only. */}
                  {isAiHistoryConfigured() && (
                    <Subsection title="Tutor conversations">
                      <TutorHistorySection userId={user.id} onToast={onToast} />
                    </Subsection>
                  )}
                </>
              ) : (
                // A guest has no row to write. This used to render the whole
                // editor anyway — picture upload, name fields, handle,
                // visibility and a Save that stayed grey with no reason given
                // — then an "Email" heading over nothing, since EmailSection
                // returns null without a user. One locked note says what the
                // fields are for instead. It carries no button: the sign-in
                // is Account controls, directly below, and a second one here
                // would be a duplicate control.
                <Subsection title="Profile">
                  <StatusNote icon={Lock} data-testid="settings-profile-locked">
                    {isAuthConfigured()
                      ? 'Your name, handle, picture and email belong to an account. Sign in below to set them.'
                      : 'Your name, handle, picture and email belong to an account.'}
                  </StatusNote>
                </Subsection>
              )}

              <Subsection title="Account controls">
                <AccountSection
                  user={user}
                  onSignIn={onSignIn}
                  onSignOut={onSignOut}
                  onExport={onExport}
                  onDelete={onDelete}
                  lastSyncedAt={lastSyncedAt}
                />
              </Subsection>
            </Stack>
          </SettingsPanel>
        )}

        {activeSection === 'learning' && (
          <SettingsPanel title="Learning">
            <Stack gap={6}>
              <Subsection title="Practice level">
                <Stack gap={5}>
                  <Button variant="secondary" onClick={onRetakePlacement}>
                    Retake placement
                  </Button>
                  <Hint>
                    The learner path for changing practice level. Also suggested on Home once you
                    reach {PLACEMENT_OFFER_XP} XP.
                  </Hint>
                  <Body size="sm" tone="soft" style={{ overflowWrap: 'anywhere' }}>
                    <strong>{LEVEL_NAMES[level] ?? ''}</strong>
                    {levelBoost && (LEVEL_MULTIPLIERS[level] ?? 1) > 1
                      ? ` · ×${LEVEL_MULTIPLIERS[level]} XP per answer`
                      : ''}
                  </Body>
                  {LEVEL_MODES[level] && (
                    <Hint>
                      Translate exercises: <strong>{LEVEL_MODES[level].label}</strong> —{' '}
                      {LEVEL_MODES[level].detail}.
                    </Hint>
                  )}
                  <details
                    open={showLevelOverride}
                    onToggle={(event) => setShowLevelOverride(event.currentTarget.open)}
                  >
                    <summary
                      style={{
                        ...TEXT.label,
                        cursor: 'pointer',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      Advanced — override classification
                    </summary>
                    {showLevelOverride && (
                      <Stack gap={3} style={{ marginTop: SPACE[3] }}>
                        <Hint>
                          Writes CEFR without a placement test. Learners should retake placement.
                          This override exists for sync debugging and tests.
                        </Hint>
                        <LevelSwitcher
                          value={level}
                          onChange={(next) => {
                            writeLevel(next);
                            onLevelChange?.(next);
                          }}
                        />
                      </Stack>
                    )}
                  </details>
                </Stack>
              </Subsection>

              <Subsection title="Daily goal">
                <GoalPicker goal={goal} onPick={onGoalChange} />
              </Subsection>

              {interestTopics.length > 0 && (
                <Subsection title="Interessen">
                  <Field
                    label="Topics"
                    hint="Optional topical vocabulary. Enabled decks appear under Interests in Vocab Practice."
                  >
                    <InterestPicker
                      topics={interestTopics}
                      enabled={enabledInterests}
                      onChange={onInterestsChange}
                    />
                  </Field>
                </Subsection>
              )}
            </Stack>
          </SettingsPanel>
        )}

        {activeSection === 'system' && (
          <SettingsPanel title="System">
            <Stack gap={6}>
              <Subsection title="KI-Modell">
                <Field
                  label="Chat model"
                  hint="Used for Chat with Anna. Auto keeps the current router. Fast / Balanced / Capable pick a band when your plan allows it."
                >
                  <ModelPicker
                    value={preferredModel}
                    onChange={onPreferredModelChange}
                    userTier={userTierOf(user)}
                  />
                </Field>
              </Subsection>

              <Subsection title="Sound">
                <Button
                  variant="secondary"
                  aria-pressed={soundOn}
                  onClick={onSoundChange}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {soundOn ? '🔊 Sound: on' : '🔇 Sound: off'}
                </Button>
              </Subsection>

              {/* Native app only. A browser has no Capacitor push, so the
                  subsection is left out rather than shown switched off. */}
              {isPushAvailable() && (
                <Subsection title="Notifications">
                  <NotificationsSection userId={user?.id} onToast={onToast} />
                </Subsection>
              )}

              <Subsection title="Appearance">
                <AppearancePicker
                  mode={themeMode}
                  onPick={(preference) => {
                    setThemePreference(preference);
                    setThemeMode(preference);
                  }}
                />
              </Subsection>

              <Subsection title="Offline cache">
                <OfflineCacheSection onToast={onToast} />
              </Subsection>

              <Subsection title="Help">
                <Stack gap={5}>
                  <div>
                    <Button variant="secondary" onClick={() => setReporting(true)}>
                      Report an issue
                    </Button>
                    <div style={{ marginTop: SPACE[2] }}>
                      <Hint>
                        Something wrong with a word, a translation or the app itself? Tell us here.
                        Inside an exercise, the flag icon reports that exact card.
                      </Hint>
                    </div>
                  </div>
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        replayTutorial();
                        onToast?.('Tutorial reopened');
                      }}
                    >
                      Show tutorial
                    </Button>
                    <div style={{ marginTop: SPACE[2] }}>
                      <Hint>Replay the short walkthrough of the header, Chat and Profile.</Hint>
                    </div>
                  </div>
                </Stack>
              </Subsection>
            </Stack>
          </SettingsPanel>
        )}
      </div>

      {reporting && (
        <FeedbackDialog
          context={{ surface: 'settings', level }}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
