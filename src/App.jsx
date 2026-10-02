import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
  BookOpen,
  MessageSquare,
  Type,
  Languages,
  Home,
  Shield,
  Search,
  Snowflake,
} from 'lucide-react';
import { COLORS, FONT_DISPLAY, FONT_MONO, FONT_BODY, RADIUS, SHADOW, Z } from './lib/theme';
import { loadState, saveState } from './lib/storage';
import { stampSettings } from './lib/settingsStamp';
import { readLevel, LEVEL_CHANGE_EVENT, hasStoredLevel } from './lib/levelPref';
import { shouldOpenPlacement } from './lib/placementGate';
import { applyDefaultPlacement } from './lib/placement';
import { SessionGuardContext, useSessionGuardValue } from './lib/sessionGuard';
import { getReviewItems, todayKey, TABS } from './lib/stats';
import { trialStatus } from './lib/trial';
import { getDueCount } from './lib/srs';
import {
  totalXp,
  todayXp,
  levelFromXp,
  score,
  goalProgress,
  earnedAchievements,
  gamificationContext,
  ACHIEVEMENTS,
  DEFAULT_GOAL,
} from './lib/gamification';
import { setSoundEnabled, playLevelUp, playAchievement, playGoalMet } from './lib/sound';
import {
  currentStreak,
  bestStreakFromHistory,
  crossedMilestone,
  reconcile,
  freezesAvailable,
  multiplier,
} from './lib/streak';
import { activePack } from './packs';
const { decks: PRESET_DECKS, interestTopics } = activePack.content;
import { sanitizeEnabledInterests } from './lib/interests';
import { AUTO_MODEL, sanitizePreferredModel } from './lib/ai-routing/preference.js';
import HomeTab from './components/HomeTab';
import SettingsRoute from './components/settings/SettingsRoute';
import AppFooter from './components/AppFooter';
import AdminTab from './components/admin/AdminTab';
import { deriveMissions } from './lib/missions';
import { deriveQuests, questHistory } from './lib/quests';
import { deckProgressFor } from './lib/deckProgress';
import {
  shouldStartPlacementOffer,
  readPlacementOffer,
  recordPlacementOfferShown,
  recordPlacementOfferDismissed,
} from './lib/placementOffer';
import { readDecks, upsertDeck, deleteDeck, liveDecks, CUSTOM_DECK_ID } from './lib/customDecks';
import {
  readLearnedByDeck,
  markLearnedIn,
  forgetDeck,
  learnedCountOf,
  backfillFromSrs,
} from './lib/learnedWords';
import { useLeagueStanding } from './lib/useLeagueStanding';
import { useAdminSession } from './lib/useAdminSession.js';

// Settings lives inside the Profile tab. The hash keeps that view deep-linkable
// and reload-safe; the separate seventh nav slot is reserved for verified admins.
const SETTINGS_HASH = '#/settings';
// The create-account draft App holds so it survives a trip to /terms or
// /privacy (spec §6.6). The six-digit code is not part of it.
const EMPTY_AUTH_DRAFT = { email: '', sent: false, accepted: false };
import { fetchMyProfile } from './lib/profile';
import { useTokenBalance } from './lib/useTokenBalance';
import ChatTab from './components/ChatTab';
import AlphabetTab from './components/AlphabetTab';
import VocabTab from './components/VocabTab';
import TranslateTab from './components/TranslateTab';
import StatsTab from './components/StatsTab';
import PracticeLane from './components/PracticeLane';
import WelcomeGate from './components/WelcomeGate';
import PlacementTest from './components/PlacementTest';
import TrialWall from './components/TrialWall';
import AuthSheet from './components/auth/AuthSheet';
import AuthCallbackLanding from './components/auth/AuthCallbackLanding';
import AcceptanceGate from './components/auth/AcceptanceGate';
import AccountChip from './components/AccountChip';
import ThemeChip from './components/ThemeChip';
import SearchModal from './components/social/SearchModal';
import {
  useAuth,
  getAccessToken,
  isAuthConfigured,
  mayHaveSession,
  signInWithGoogle,
  signInWithGitHub,
  signOut,
  humanAuthError,
} from './lib/auth';
import { signOutAndReset } from './lib/clearUserState';
import { useLegalAcceptance } from './lib/useLegalAcceptance';
import { clearIntent } from './lib/legalAcceptance';
import { loadSyncMeta } from './lib/sync/syncMeta';
import { isNativeApp, hideLaunchScreen } from './lib/nativeApp';
import { resumePushRegistration } from './lib/pushNotifications';
import { SYNC_ENABLED, start, stop, markDirty, loadRemoteDaily } from './lib/sync';
import { startProgressFlush, stopProgressFlush, scheduleFlush } from './lib/progressQueue';
import { setLevelBoostEnabled } from './lib/xpEntitlement';
import { useSyncStatus } from './lib/useSyncStatus';
import { useLeagueRewards } from './lib/useLeagueRewards';
import Confetti from './components/ui/Confetti';
import Button from './components/ui/Button';
import ToastStack from './components/ui/Toast';
import { PageFrame } from './components/ui/Layout';
import StatusChip from './components/StatusChip';
import GoalStrip from './components/gamification/GoalStrip';
import TutorialOverlay from './components/TutorialOverlay';
import { Analytics } from '@vercel/analytics/react';
import PrivacyPolicy from './components/legal/PrivacyPolicy';
import TermsOfService from './components/legal/TermsOfService';
import DeleteAccountPage from './components/legal/DeleteAccountPage';
import { currentLegalRoute } from './lib/legalRoute';
import { useWindowWidth, isMobile, isTiny, isTablet, bp } from './lib/useWindowWidth';
import { apiUrl } from './lib/apiUrl';

export default function App() {
  const [tab, setTab] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === SETTINGS_HASH ? 'stats' : 'home'
  );
  const [stats, setStats] = useState({ streak: 0, learnedCount: 0, lastVisit: null });
  const [learnedWords, setLearnedWords] = useState({});
  // Generated decks live here rather than inside VocabTab, which unmounts on
  // every tab switch. Hydrated from the blob below, so a deck survives a tab
  // switch, a reload, and a signed-out session alike.
  const [decks, setDecks] = useState({});
  // Deck-scoped mastery. `learnedWords` stays alongside it as the legacy flat
  // map: reads fall back to it, and writes still mirror into it so a device on
  // an older app version keeps working. See lib/learnedWords.js.
  const [learnedByDeck, setLearnedByDeck] = useState({});
  const [enabledInterests, setEnabledInterests] = useState([]);
  const [preferredModel, setPreferredModel] = useState(AUTO_MODEL);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [streakBurst, setStreakBurst] = useState(false);

  // Lift the native launch screen once the first commit is in the DOM. An
  // effect rather than main.jsx's double-rAF: Android keeps the whole content
  // view from drawing while its launch screen is up, and rAF is not promised
  // to tick in a webview that is not being drawn — a rAF-gated hide could end
  // up waiting on itself. A no-op on the web; see hideLaunchScreen.
  useEffect(() => {
    void hideLaunchScreen();
  }, []);

  // ── First-run walkthrough anchors ─────────────────────────────
  // The overlay measures these three nodes to place its bubbles. They are refs
  // rather than a context registry because the targets are all rendered right
  // here — a provider would be indirection with one consumer.
  const statusAnchorRef = useRef(null);
  const chatAnchorRef = useRef(null);
  const statsAnchorRef = useRef(null);
  const tutorialAnchors = { status: statusAnchorRef, chat: chatAnchorRef, stats: statsAnchorRef };

  // ── Gamification ──────────────────────────────────────────────
  // Derived from storage, refreshed on every `deutsch:progress` event.
  const prevLevelRef = useRef(null);
  const prevStreakRef = useRef(null);
  // `userId` is a PARAMETER, not a closure read: this runs as the useState
  // initializer during the first render, before useAuth() and userIdRef exist
  // further down the component. Reading either from here is a TDZ crash.
  const deriveGame = (userId = null) => {
    const s = loadState() ?? {};
    const daily = s.daily ?? {};
    const goalXp = s.gamification?.goal ?? DEFAULT_GOAL;
    const frozenDays = s.gamification?.frozenDays ?? {};
    const streakNow = currentStreak(daily, goalXp, todayKey(), frozenDays);
    return {
      lvl: levelFromXp(totalXp(daily)),
      goal: goalProgress(todayXp(daily, todayKey()), goalXp),
      streak: streakNow,
      freezes: freezesAvailable(s, todayKey(), { userId }),
      mult: multiplier(streakNow),
      // Guest-trial status rides along here so it refreshes with everything
      // else: applyProgress re-runs deriveGame on every `deutsch:progress`
      // event and on window focus. No extra effect, no extra listener.
      trial: trialStatus(daily, s.gamification),
    };
  };
  const [game, setGame] = useState(() => deriveGame(null));

  // Celebration toasts (level-up / achievement / goal-met).
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const pushToasts = (items) => {
    setToasts((cur) => [
      ...cur,
      ...items.map((it) => {
        const id = ++toastIdRef.current;
        if (it.kind === 'ach') {
          const a = ACHIEVEMENTS.find((x) => x.id === it.id);
          return {
            id,
            badge: it.id,
            title: a?.name ?? 'Achievement',
            sub: 'Achievement freigeschaltet',
          };
        }
        return { id, icon: it.icon, badge: it.badge, title: it.title, sub: it.sub };
      }),
    ]);
  };
  const dismissToast = (id) => setToasts((cur) => cur.filter((t) => t.id !== id));

  // Recompute gamification on every progress event; fire toasts for new wins.
  // First run silently backfills already-earned badges/level (no toast flood).
  useEffect(() => {
    function applyProgress() {
      const s = loadState() ?? {};
      const g = s.gamification ?? {
        goal: DEFAULT_GOAL,
        soundOn: false,
        achievements: {},
        lastGoalMet: null,
        bestStreak: 0,
      };
      const ctx = gamificationContext(
        s,
        questHistory({ daily: s.daily, userId: userIdRef.current })
      );
      const lvlInfo = levelFromXp(totalXp(s.daily ?? {}));
      const earned = earnedAchievements(ctx);
      const tKey = todayKey();
      const goal = goalProgress(todayXp(s.daily ?? {}, tKey), g.goal);

      const firstRun = prevLevelRef.current === null;
      const nextG = { ...g, achievements: { ...g.achievements } };
      const newToasts = [];
      // Did this run WRITE a toast dedup key (a badge id, or today's goal day)?
      // Those two fields are what stop the celebration firing twice, and this
      // function is their only writer — see the stamp below.
      let ledgerChanged = false;

      if (firstRun) {
        for (const id of earned)
          if (!(id in nextG.achievements)) {
            nextG.achievements[id] = Date.now();
            ledgerChanged = true;
          }
        if (goal.met && nextG.lastGoalMet !== tKey) {
          nextG.lastGoalMet = tKey;
          ledgerChanged = true;
        }
        prevLevelRef.current = lvlInfo.level;
      } else {
        if (lvlInfo.level > prevLevelRef.current) {
          newToasts.push({
            kind: 'level',
            title: `Level ${lvlInfo.level}`,
            sub: lvlInfo.rankName,
            icon: 'star',
          });
        }
        prevLevelRef.current = lvlInfo.level;
        for (const id of earned) {
          if (!(id in nextG.achievements)) {
            nextG.achievements[id] = Date.now();
            ledgerChanged = true;
            newToasts.push({ kind: 'ach', id });
          }
        }
        if (goal.met && nextG.lastGoalMet !== tKey) {
          nextG.lastGoalMet = tKey;
          ledgerChanged = true;
          newToasts.push({
            kind: 'goal',
            title: 'Tagesziel erreicht!',
            sub: `${goal.target} XP`,
            icon: 'target',
          });
        }
      }

      // Day-rollover reconcile: spend freezes to bridge missed days (once/day).
      const prevFrozen = g.frozenDays ?? {};
      const hadReconciled = g.lastReconcileDay != null;
      if (g.lastReconcileDay !== tKey) {
        const rec = reconcile(s, tKey, { userId: userIdRef.current });
        nextG.frozenDays = rec.frozenDays;
        nextG.lastReconcileDay = rec.lastReconcileDay;
      } else {
        nextG.frozenDays = prevFrozen;
      }
      const frozenDays = nextG.frozenDays;
      const freezeSpent =
        hadReconciled && Object.keys(frozenDays).length > Object.keys(prevFrozen).length;

      const tStreak = currentStreak(s.daily ?? {}, g.goal, tKey, frozenDays);
      const histBest = bestStreakFromHistory(s.daily ?? {}, g.goal, frozenDays);
      const prevBest = g.bestStreak ?? 0;
      // First run seeds the record from history or the prior (login-era) streak
      // so it isn't "lost" when the streak switches to practice-based.
      nextG.bestStreak = firstRun
        ? Math.max(prevBest, histBest, s.stats?.streak ?? 0)
        : Math.max(prevBest, histBest, tStreak);
      if (freezeSpent) {
        newToasts.push({
          kind: 'freeze',
          title: 'Freeze genutzt',
          sub: 'Streak gerettet',
          icon: 'snowflake',
        });
      }

      if (firstRun) {
        prevStreakRef.current = tStreak;
      } else {
        const prevStreak = prevStreakRef.current ?? 0;
        if (tStreak > prevStreak) {
          newToasts.push({
            kind: 'streak',
            title: `Streak → ${tStreak}`,
            sub: 'gesichert!',
            icon: 'flame',
          });
          if (tStreak > prevBest) {
            newToasts.push({
              kind: 'record',
              title: 'Neuer Rekord!',
              sub: `${tStreak} Tage`,
              icon: 'trophy',
            });
          }
          const milestone = crossedMilestone(prevStreak, tStreak);
          if (milestone) {
            newToasts.push({
              kind: 'milestone',
              title: `${milestone}-Tage-Streak!`,
              sub: 'Meilenstein',
              icon: 'zap',
            });
          }
          const boost = multiplier(tStreak);
          if (boost > multiplier(prevStreak)) {
            newToasts.push({
              kind: 'boost',
              title: `×${boost} XP-Boost!`,
              sub: 'Multiplikator',
              icon: 'rocket',
            });
          }
        }
        prevStreakRef.current = tStreak;
      }
      setStats((prev) => ({ ...prev, streak: tStreak }));

      saveState({ ...s, gamification: nextG });
      // The write above is the whole reason the toasts stop repeating, and it
      // used to go no further than localStorage: no stamp, so the blob kept
      // whatever settingsUpdatedAt some earlier unrelated write had left and
      // lost the settings LWW to the server; no markDirty, so nothing pushed it
      // before the next reconcile handed the ledger back the way the server
      // still had it. Both holes had to be open for the badge toasts to come
      // back on every focus — closing either one alone leaves a race.
      //
      // Stamped only when a dedup key actually moved. Stamping on every focus
      // would make this device win the whole-row LWW on fields it never
      // touched, which is precisely the 2026-08-24 level regression.
      if (ledgerChanged) {
        stampSettings();
        markDirty();
      }
      setSoundEnabled(!!nextG.soundOn);
      setGame(deriveGame(userIdRef.current));

      if (newToasts.length) {
        pushToasts(newToasts);
        setStreakBurst(true);
        setTimeout(() => setStreakBurst(false), 1600);
        if (nextG.soundOn) {
          newToasts.forEach((t) => {
            if (t.kind === 'level') playLevelUp();
            else if (t.kind === 'ach') playAchievement();
            else if (t.kind === 'goal') playGoalMet();
            else if (
              t.kind === 'streak' ||
              t.kind === 'record' ||
              t.kind === 'milestone' ||
              t.kind === 'freeze' ||
              t.kind === 'boost'
            )
              playGoalMet();
          });
        }
      }
    }

    applyProgress();
    window.addEventListener('deutsch:progress', applyProgress);
    window.addEventListener('focus', applyProgress);
    return () => {
      window.removeEventListener('deutsch:progress', applyProgress);
      window.removeEventListener('focus', applyProgress);
    };
  }, []);
  const width = useWindowWidth();
  const mobile = isMobile(width);
  const tiny = isTiny(width);
  // The nav's labels need their own breakpoint, well above `mobile`. The
  // buttons are `flex: 1` with `minWidth: 0`, so they all take an equal share
  // and the widest label sets the floor: "Translate" stops fitting once a
  // button drops under ~131px, i.e. under ~858px of viewport. `mobile` flips
  // at 640, so across 640-858 the label overflowed its own button into the
  // next one's — and because minWidth is 0 the nav never widened and never
  // scrolled, so it rendered as text on top of text rather than as an
  // overflow. Nothing that watches for sideways scroll can catch that.
  //
  // bp.tablet (900) rather than a new ~858 constant: the measurement is taken
  // against Fraunces and a fallback serif can set wider, so the headroom is
  // deliberate — at 900 the tightest label clears its button by only 6px.
  // Icons carry the same aria-labels either way; this is the "decoration
  // gives way" rule the wordmark already follows.
  const navIconOnly = isTablet(width);

  // Auth, gated on the terms (spec §6.4). Every consumer below — sync, the
  // progress flush, leagues, admin, push, the level boost, the trial wall and
  // the entry gate — reads the GATED values, so a signed-in account with no
  // acceptance record for the current versions behaves like a session that is
  // still restoring: nothing reaches the server until the record exists. Only
  // AuthCallbackLanding reads the raw status, so its success/timeout behaviour
  // is unchanged.
  const rawAuth = useAuth();
  const legal = useLegalAcceptance(rawAuth.user);
  const legalAccepted = legal.status === 'accepted';
  const user = legalAccepted ? rawAuth.user : null;
  let authStatus = rawAuth.status;
  if (rawAuth.user) {
    authStatus = legalAccepted ? 'authenticated' : 'loading';
  }
  const { signupRejected } = rawAuth;
  const acceptanceGateUp = Boolean(rawAuth.user) && legal.status === 'required';
  const adminSession = useAdminSession(user);
  const isAdmin = Boolean(user && adminSession.me?.isAdmin);
  useEffect(() => {
    if (tab === 'admin' && adminSession.status !== 'loading' && !isAdmin) {
      setTab('stats');
    }
  }, [adminSession.status, isAdmin, tab]);
  // applyProgress is registered once (empty deps) but needs the CURRENT user to
  // reconstruct quest history — a stale closure would evaluate quest badges
  // against the guest seed while the board shows the signed-in one. A ref keeps
  // them agreeing without re-subscribing the listener on every auth change.
  const userIdRef = useRef(null);
  userIdRef.current = user?.id ?? null;
  // Freezes are now account-derived, and the first render is always the guest
  // value (deriveGame's initializer cannot see auth). Re-derive when the account
  // settles or changes, or a learner who signs in sees a stale ❄️ until their
  // next answer.
  useEffect(() => {
    setGame(deriveGame(userIdRef.current));
  }, [user?.id]);
  const syncStatus = useSyncStatus();
  // Claim any league-winner rewards on load (not just when the Leagues tab
  // opens), and celebrate a fresh win with a toast. Gated on the first
  // reconcile the same way the placement gate is: the already-claimed set
  // lives in server settings, so claiming before it lands re-pays every past
  // win to anyone who cleared site data or signed in on a new device.
  useLeagueRewards(
    user?.id,
    (count, xp) =>
      pushToasts([
        {
          kind: 'league',
          title: count > 1 ? `${count} Ligen gewonnen!` : 'Liga gewonnen!',
          sub: `+${xp} XP · Liga-Meister`,
          badge: 'leagueChampion',
        },
      ]),
    { syncEnabled: SYNC_ENABLED, syncSettled: syncStatus.settled }
  );
  // The caller's live league standing, for the league-position mission and
  // Home's Top 3 preview. Two cohort reads plus three best-effort profile GETs,
  // and no writes — deliberately NOT the full leaderboard's join+refresh path,
  // which would write to the database on every app open. Null when leagues are
  // off, when signed out, or when this week has no membership.
  const leagueStanding = useLeagueStanding(user?.id);
  // Dismissal is component state, not storage: the gate is a property of "is
  // there a session", so it comes back on the next load for anyone without one.
  const [gateDismissed, setGateDismissed] = useState(false);
  const [authModal, setAuthModal] = useState(null); // 'create' | 'signin' | null
  // Shared by the create sheet, the trial wall and the acceptance gate. Patches
  // merge FUNCTIONALLY: MagicLinkForm reports `{ sent: true }` after an await,
  // by which time a spread over the render-time value would be stale.
  const [authDraft, setAuthDraft] = useState(EMPTY_AUTH_DRAFT);
  const patchAuthDraft = (patch) => setAuthDraft((d) => ({ ...d, ...patch }));
  const setDraftAccepted = (accepted) => patchAuthDraft({ accepted });
  // Ending the sheet's flow resets its draft, so reopening always starts
  // unticked. While the acceptance gate is up the sheet is only a re-auth
  // detour on top of it, and the tick belongs to the gate, so it survives.
  const resetAuthDraft = () =>
    setAuthDraft((d) => ({ ...EMPTY_AUTH_DRAFT, accepted: acceptanceGateUp && d.accepted }));
  // Dismissing the sheet also drops the intent, so none is left to credit a
  // later sign-in.
  const closeAuthSheet = () => {
    setAuthModal(null);
    resetAuthDraft();
    clearIntent();
  };
  const [searchOpen, setSearchOpen] = useState(false);

  const handleGuest = () => {
    setGateDismissed(true);
  };
  const handleAuthDone = () => {
    setAuthModal(null);
    resetAuthDraft();
    setGateDismissed(true);
    // Nothing reads this key any more; kept because AGENTS.md forbids removing
    // or migrating a storage key.
    localStorage.setItem('deutsch-onboarded', '1');
  };
  // Opens the shared AuthSheet in-place — no WelcomeGate round-trip.
  //
  // The guard's false side is deliberately untested, not overlooked: every
  // route to requestSignIn is already gated on the same flag. AuthCallbackLanding
  // and AuthSheet both return null when auth is unconfigured, trialWallUp
  // requires isAuthConfigured(), and AccountChip / AccountSection render their
  // sign-in affordance only for a signed-out user — which cannot coexist with
  // an unconfigured backend, since a session can only come from one. Reaching
  // this line would mean constructing a state the app cannot enter, and the
  // test would assert nothing except that the line is green.
  const requestSignIn = () => {
    if (!isAuthConfigured()) return;
    setAuthModal('signin');
  };

  // One entry point per provider for all three surfaces — the sheet, the gate
  // and the trial wall each render the same buttons and call these. On the web
  // a successful start sends the tab to the provider, so `busy` is deliberately
  // never cleared there: the page is going away, and clearing it would
  // re-enable the button for the moment before it does. The native app never
  // leaves. The provider opens in the system browser and the sign-in call
  // settles once that browser closes, signed in or backed out, so the button
  // must come back.
  //
  // ONE in-flight value across providers, not a flag each: a tap on Google and
  // then on GitHub must not start two round trips racing to redirect the tab.
  // It holds which provider is in flight so only that button shows the spinner.
  const [oauthBusy, setOAuthBusy] = useState(null); // 'google' | 'github' | null
  const startOAuth = async (provider, signIn) => {
    if (oauthBusy) return;
    setOAuthBusy(provider);
    const { error } = await signIn();
    if (error || isNativeApp()) setOAuthBusy(null);
    if (error) showToast(humanAuthError(error));
  };
  // The welcome screen's buttons and the Sign-in sheet are sign-in surfaces
  // (spec D3): a stale intent from an abandoned create must not ride along.
  // The create sheet and the trial wall record the intent themselves, after
  // the box is ticked, and use the *Create variants.
  const handleGoogle = () => {
    clearIntent();
    return startOAuth('google', signInWithGoogle);
  };
  const handleGitHub = () => {
    clearIntent();
    return startOAuth('github', signInWithGitHub);
  };
  const handleGoogleCreate = () => startOAuth('google', signInWithGoogle);
  const handleGitHubCreate = () => startOAuth('github', signInWithGitHub);
  const googleBusy = oauthBusy === 'google';
  const gitHubBusy = oauthBusy === 'github';

  // Preferences write LOCAL state and let the existing reconcile push them.
  // Writing Supabase directly here would bypass the LWW merge that PR #151
  // added after a stale device clobbered a correct server-side value.
  const handleGoalChange = (xp) => {
    const current = loadState() ?? {};
    const gamification = {
      ...(current.gamification ?? { soundOn: false, achievements: {}, lastGoalMet: null }),
      goal: xp,
    };
    saveState({ ...current, gamification });
    stampSettings();
    window.dispatchEvent(new CustomEvent('deutsch:progress'));
  };

  const handleSoundToggle = () => {
    const current = loadState() ?? {};
    const cur = current.gamification ?? {
      goal: DEFAULT_GOAL,
      soundOn: false,
      achievements: {},
      lastGoalMet: null,
    };
    const gamification = { ...cur, soundOn: !cur.soundOn };
    saveState({ ...current, gamification });
    stampSettings();
    setSoundEnabled(!!gamification.soundOn);
    window.dispatchEvent(new CustomEvent('deutsch:progress'));
  };

  const handleInterestsChange = (next) => {
    const enabled = sanitizeEnabledInterests(next, interestTopics);
    const current = loadState() ?? {};
    saveState({ ...current, enabledInterests: enabled });
    stampSettings();
    setEnabledInterests(enabled);
    window.dispatchEvent(new CustomEvent('deutsch:progress'));
  };

  const handlePreferredModelChange = (next) => {
    const preferred = sanitizePreferredModel(next);
    const current = loadState() ?? {};
    saveState({ ...current, preferredModel: preferred });
    stampSettings();
    setPreferredModel(preferred);
    window.dispatchEvent(new CustomEvent('deutsch:progress'));
  };

  const showToast = (title) => pushToasts([{ kind: 'info', title, sub: '', icon: 'info' }]);

  // supabase.auth.signOut() can revoke the local session (header → SIGN IN)
  // and still return { error } on a failed server call. Skipping the hard
  // navigation in that case left XP / streak / the nav badge mounted.
  // signOutAndReset owns the load-bearing order — signOut settles, then the
  // storage wipe, then the exact document load. No React reset, no early return.
  const handleSignOut = () => signOutAndReset();
  // Declining the terms. A device that has never completed a reconcile still
  // holds only guest data (sync waits for acceptance), so a plain sign-out
  // keeps it; one that has synced holds the account's data and gets the full
  // reset any sign-out gets. The plain branch wipes nothing, so it drops the
  // ticked-box intent and the draft itself — neither may carry over to the
  // next account or the next create sheet.
  const leaveAccount = () => {
    if (loadSyncMeta().lastSyncedAt) return signOutAndReset();
    clearIntent();
    setAuthDraft(EMPTY_AUTH_DRAFT);
    return signOut();
  };

  const handleExport = async () => {
    const token = await getAccessToken();
    if (!token) {
      showToast('Please sign in again.');
      return;
    }
    try {
      const res = await fetch(apiUrl('/api/v1/account/export'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sprachschule-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Export failed — try again.');
    }
  };

  // Throws on every failure path so AccountSection keeps the typed phrase armed:
  // the common rejection is reauth_required, and re-typing DELETE after signing
  // in again would be pure friction.
  const handleDelete = async (confirm, { after = signOutAndReset } = {}) => {
    const token = await getAccessToken();
    if (!token) {
      showToast('Please sign in again.');
      throw new Error('no_token');
    }

    const res = await fetch(apiUrl('/api/v1/account/delete'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm }),
    });

    if (!res.ok) {
      // reauth_required shares 401 with unauthorized, so branch on the code:
      // the session is fine, it just wasn't proven recently enough to erase an
      // account. Send them through the same AuthSheet and let them retry.
      const code = await res
        .clone()
        .json()
        .then((b) => b?.error?.code)
        .catch(() => null);
      if (code === 'reauth_required') {
        showToast('Please sign in again to confirm deletion.');
        requestSignIn();
      } else {
        showToast('Could not delete account — try again.');
      }
      throw new Error(code ?? 'delete_failed');
    }

    // signOutAndReset owns the load-bearing order — signOut settles first, then
    // local state is wiped (theme preserved) and the document hard-reloads.
    // This path used to clear localStorage before signing out, which is the
    // same ordering bug that once left XP on screen under a SIGN IN header.
    // The acceptance gate passes `leaveAccount` instead, so a device that never
    // synced keeps its guest progress.
    await after();
  };

  useEffect(() => {
    if (!SYNC_ENABLED || !user?.id) {
      stop();
      return;
    }
    start(user.id);
    return () => stop();
  }, [user?.id]);

  useEffect(() => {
    if (!SYNC_ENABLED || !user?.id) return;
    const onProgress = () => markDirty();
    window.addEventListener('deutsch:progress', onProgress);
    return () => window.removeEventListener('deutsch:progress', onProgress);
  }, [user?.id]);

  // Push tokens rotate without warning and only surface on the next register(),
  // so a device already opted in re-registers on each signed-in launch. Never
  // prompts, never throws, and does nothing on the web or before opt-in.
  useEffect(() => {
    if (user?.id) void resumePushRegistration(user.id);
  }, [user?.id]);

  // Progress RPC flush is gated on a JWT, not VITE_SYNC_ENABLED. Sync off
  // must not strand answers now that the daily upsert is gone.
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      stopProgressFlush();
      return;
    }
    startProgressFlush({ getAccessToken, loadRemoteDaily });
    const onProgress = () => scheduleFlush(500);
    window.addEventListener('deutsch:progress', onProgress);
    return () => {
      window.removeEventListener('deutsch:progress', onProgress);
      stopProgressFlush();
    };
  }, [authStatus]);

  // The per-level XP multiplier is an account benefit. Driven off authStatus
  // rather than `user` so a sign-out turns it off in the same render.
  useEffect(() => {
    setLevelBoostEnabled(authStatus === 'authenticated');
  }, [authStatus]);

  // Onboarding + level
  const [level, setLevel] = useState(readLevel);
  // Placement is OPTIONAL. A first-time learner is offered it once — already
  // default-classified at A1, so skipping or abandoning it still leaves a level
  // behind. Anyone with a stored CEFR code never meets it unasked; they retake
  // from Settings / StatusChip or from the 500 XP Home suggestion.
  //
  // TWO SOURCES, DELIBERATELY SEPARATE.
  //   `retakePlacement` — the learner ASKED. It outranks everything and is the
  //     only way a learner who already has a level ever sees the test again.
  //   `autoPlacement`   — the engine decided they have no level. Governed by
  //     shouldOpenPlacement, which refuses to answer until auth has resolved
  //     and (for a signed-in account) the first sync reconcile has finished,
  //     because the CEFR code may still be on its way down from the server.
  //
  // Keeping them apart is what stops a level arriving mid-retake from yanking
  // the test out from under someone who is halfway through it.
  const [retakePlacement, setRetakePlacement] = useState(false);
  // Seeded rather than left false so the no-backend case (local dev, CI, the
  // README demo with VITE_SUPABASE_* absent) does not flash the app shell for a
  // frame before deciding. With auth unconfigured there is no session to wait
  // for and no server to pull a level from, so the answer is already final.
  const [autoPlacement, setAutoPlacement] = useState(
    () => !isAuthConfigured() && !hasStoredLevel()
  );
  // Bumped by LEVEL_CHANGE_EVENT so the gate re-decides the moment a level
  // lands. `level` alone is not enough: it starts at the a1 default, so a
  // server value of a1 would move storage without moving this component.
  const [levelTick, setLevelTick] = useState(0);
  useEffect(() => {
    const bump = () => setLevelTick((n) => n + 1);
    window.addEventListener(LEVEL_CHANGE_EVENT, bump);
    return () => window.removeEventListener(LEVEL_CHANGE_EVENT, bump);
  }, []);
  useEffect(() => {
    setAutoPlacement(
      shouldOpenPlacement({
        hasLevel: hasStoredLevel(),
        authStatus,
        syncEnabled: SYNC_ENABLED,
        syncSettled: syncStatus.settled,
      })
    );
  }, [authStatus, user?.id, syncStatus.settled, levelTick]);
  // `firstRunPlacement` — the gate fired and the test has actually PAINTED, so
  //     the learner has been default-classified (applyDefaultPlacement) and is
  //     looking at an optional test. Sticky until they finish or skip: once the
  //     default lands, `autoPlacement` goes false (they now HAVE a level), and
  //     without this the screen would vanish out from under them.
  const [firstRunPlacement, setFirstRunPlacement] = useState(false);
  const showPlacement = retakePlacement || autoPlacement || firstRunPlacement;
  const closePlacement = useCallback(() => {
    setRetakePlacement(false);
    setAutoPlacement(false);
    setFirstRunPlacement(false);
  }, []);
  // One-shot, dismissible Home invite once the learner has earned
  // PLACEMENT_OFFER_XP. A suggestion, never a block. Session-visible until
  // dismissed; `shownAt` on the blob (synced) stops it coming back next load.
  const [placementOfferVisible, setPlacementOfferVisible] = useState(false);

  useEffect(() => {
    if (showPlacement || !hasStoredLevel()) return;
    // Empty local state is not absence: after a storage wipe `daily` and
    // `placementOffer.shownAt` both come back on the first reconcile. Deciding
    // before it lands would re-invite a learner who already dismissed this.
    if (authStatus === 'loading') return;
    if (authStatus === 'authenticated' && SYNC_ENABLED && !syncStatus.settled) return;
    const xp = totalXp(loadState()?.daily ?? {});
    if (shouldStartPlacementOffer({ xp, offer: readPlacementOffer() })) {
      setPlacementOfferVisible(true);
    }
  }, [game, showPlacement, authStatus, syncStatus.settled]);

  useEffect(() => {
    if (tab !== 'home' || !placementOfferVisible || showPlacement) return;
    recordPlacementOfferShown();
  }, [tab, placementOfferVisible, showPlacement]);

  // ── Legal routes ────────────────────────────────────────────────────────
  //
  // Checked BEFORE the entry gate and the placement test, because a compliance
  // page has to be readable by someone who has not signed up — they are
  // deciding whether to, and the terms are part of that decision. Gating them
  // behind the gate would hide them from exactly the right reader.
  const [legalRoute, setLegalRoute] = useState(currentLegalRoute);
  useEffect(() => {
    const onNav = () => setLegalRoute(currentLegalRoute());
    // popstate covers Back/Forward; hashchange covers the #/privacy fallback
    // form, which does not fire popstate in every browser.
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, []);
  const openLegal = useCallback((to) => {
    // pushState, so an ordinary click never round-trips to the server and the
    // page works even where no SPA rewrite is configured.
    window.history.pushState(null, '', to);
    setLegalRoute(currentLegalRoute());
    window.scrollTo(0, 0);
  }, []);
  const closeLegal = useCallback(() => {
    // back() keeps the history stack honest when the reader arrived by link
    // from inside the app; a cold visit has nothing to go back to, so fall
    // through to the app root instead of trapping them on the page.
    if (window.history.length > 1) window.history.back();
    else window.history.pushState(null, '', '/');
    setLegalRoute(null);
  }, []);
  // A consent link opens the page through here, so the checkbox it came from
  // takes focus again when the reader comes back (spec §6.6).
  const [focusConsent, setFocusConsent] = useState(false);
  const openLegalFromConsent = (to) => {
    setFocusConsent(true);
    openLegal(to);
  };
  // The consent control has mounted (and taken focus) in the commit that closed
  // the legal page; clear the flag so later renders do not steal focus again.
  useEffect(() => {
    if (!legalRoute && focusConsent) setFocusConsent(false);
  }, [legalRoute, focusConsent]);

  // Settings lives inside the Profile tab (id still `stats`). The hash keeps
  // the deep link; it is not a seventh nav tab. The WelcomeGate still wins
  // while it is up — a guest who has not entered the app cannot skip it by
  // arriving on `#/settings`.
  const [profileView, setProfileView] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === SETTINGS_HASH ? 'settings' : 'stats'
  );
  const clearSettingsHash = () => {
    if (typeof window !== 'undefined' && window.location.hash === SETTINGS_HASH) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };
  const setSettingsHash = () => {
    if (typeof window !== 'undefined' && window.location.hash !== SETTINGS_HASH) {
      window.location.hash = SETTINGS_HASH;
    }
  };
  const openSettings = () => {
    setTab('stats');
    setProfileView('settings');
    setSettingsHash();
  };
  // The sheet's other destination. It is the same TAB as Settings but no
  // longer the same place: `stats` is the consolidated profile page, and
  // `settings` is the route off it. Clearing the hash matters — without it a
  // learner who opened Settings, went to the profile and reloaded would land
  // back in Settings.
  const openProfile = () => {
    setTab('stats');
    setProfileView('stats');
    clearSettingsHash();
  };
  const handleProfileView = (next) => {
    setProfileView(next);
    if (next === 'settings') setSettingsHash();
    else clearSettingsHash();
  };
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === SETTINGS_HASH) {
        setTab('stats');
        setProfileView('settings');
      } else {
        setProfileView((cur) => (cur === 'settings' ? 'stats' : cur));
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The learner's own profile row — an own-row select the existing RLS policy
  // already permits, so no endpoint is involved. A failure is swallowed on
  // purpose: Home greets with or without a profile, and the landing tab must
  // not fall over because a name could not be read.
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setProfile(null);
      return undefined;
    }
    fetchMyProfile(user.id)
      .then((row) => {
        if (!cancelled) setProfile(row);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  const sessionGuard = useSessionGuardValue();

  // `level` is held here and prop-drilled into every tab, so any writer that
  // is not this component (sync pulling a level from another device, the
  // placement test, a future caller of writeLevel) would move localStorage and
  // leave the tabs rendering the old level. levelPref fires this on every write.
  useEffect(() => {
    const onLevelChange = (e) => {
      const next = e.detail?.level;
      if (next) setLevel(next);
    };
    window.addEventListener(LEVEL_CHANGE_EVENT, onLevelChange);
    return () => window.removeEventListener(LEVEL_CHANGE_EVENT, onLevelChange);
  }, []);

  useEffect(() => {
    const s = loadState();
    if (s) {
      setLearnedWords(s.learnedWords || {});
      setDecks(readDecks(s));
      // Attribute existing flat keys to the decks their SRS rows name. Additive
      // and idempotent, so running it on every load is safe and picks up keys
      // that arrived from an older device since the last one.
      setLearnedByDeck(
        backfillFromSrs({
          learnedWords: s.learnedWords,
          srs: s.srs,
          learnedByDeck: readLearnedByDeck(s),
        }).learnedByDeck
      );
      setEnabledInterests(sanitizeEnabledInterests(s.enabledInterests, interestTopics));
      setPreferredModel(sanitizePreferredModel(s.preferredModel));
      const today = todayKey();
      const goal = s.gamification?.goal ?? DEFAULT_GOAL;
      // Same fourth argument as deriveGame. Omitting it defaults frozenDays to
      // {} and stats.streak ignores freeze-rescued days; applyProgress then
      // writes the freeze-aware value, and this hydrate overwrites it.
      const frozenDays = s.gamification?.frozenDays ?? {};
      const streak = currentStreak(s.daily ?? {}, goal, today, frozenDays);
      const learnedCount = learnedCountOf(
        backfillFromSrs({
          learnedWords: s.learnedWords,
          srs: s.srs,
          learnedByDeck: readLearnedByDeck(s),
        }).learnedByDeck,
        s.learnedWords
      );
      setStats({ streak, learnedCount, lastVisit: today });
    } else {
      setStats({ streak: 0, learnedCount: 0, lastVisit: todayKey() });
    }
  }, []);

  // The learned count is DERIVED, not incremented. During the transition the
  // same word can sit in the flat map and under one or more decks, so counting
  // keys would report it two or three times; learnedCountOf counts distinct
  // words. Returning the same object when the count is unchanged keeps this
  // from retriggering the persist effect below on every render.
  useEffect(() => {
    const count = learnedCountOf(learnedByDeck, learnedWords);
    setStats((s) => (s.learnedCount === count ? s : { ...s, learnedCount: count }));
  }, [learnedByDeck, learnedWords]);

  useEffect(() => {
    if (stats.lastVisit) {
      // Merge into existing state — recordEvent (from stats.js) writes a
      // `daily` field we must not clobber, and `markLearned` stamps
      // `settingsUpdatedAt`. The `{ ...current }` spread preserves both, so
      // this must stay a merge (never a replacement) or settings LWW breaks.
      const current = loadState() ?? {};
      saveState({ ...current, stats, learnedWords, decks, learnedByDeck });
    }
  }, [stats, learnedWords, decks, learnedByDeck]);

  // Review feed click handler — switches tab, then drops `reviewTarget` so
  // the destination can pre-load the item. Must NOT writeLevel: a leftover
  // B1 translate item used to reclassify an A1 learner into free typing.
  const openPlacement = () => setRetakePlacement(true);
  const dismissPlacementOffer = useCallback(() => {
    recordPlacementOfferDismissed();
    setPlacementOfferVisible(false);
  }, []);
  const acceptPlacementOffer = useCallback(() => {
    recordPlacementOfferDismissed();
    setPlacementOfferVisible(false);
    setRetakePlacement(true);
  }, []);
  const handleReview = (item) => {
    setReviewTarget(item);
    setTab(item.tab);
  };

  const clearReviewTarget = () => setReviewTarget(null);

  // Home recommendations, missions, and quests. The second argument is the
  // task payload already built by deriveMissions — including `deckId` when
  // the hop is "continue this deck". VocabTab already opens a named deck
  // through `reviewTarget.context` (the Stats review path); this reuses that
  // slot rather than adding a second navigator.
  const goToTab = (target, task) => {
    if (typeof task?.deckId === 'string' && task.deckId) {
      setReviewTarget({ tab: target, context: task.deckId });
    }
    setTab(target);
  };

  // Sets, never toggles. This flipped (`!prev[word]`) until 2026-08-30, and
  // advanceQueue re-queues on AGAIN — so answering a card correctly, pressing
  // AGAIN, and answering it correctly again UN-learned the word. Every VocabTab
  // test missed it because the test host modelled the intended behaviour
  // (`[id]: true`) rather than this one.
  //
  // Learning is monotonic here: nothing in the app is meant to un-learn a word,
  // and `learnedWords` is union-merged across devices, so a `false` written on
  // one device is discarded by the next sync anyway.
  // Sets, never toggles. This flipped (`!prev[word]`) until 2026-08-30, and a
  // rebuilt queue brings a card round again — so answering it correctly twice
  // UN-learned the word.
  //
  // Writes BOTH maps on purpose. The scoped one is the real record; the flat
  // mirror is what keeps a device on an older app version working, since it
  // reads only `learnedWords`. The mirror is what a later epic removes once no
  // old clients remain.
  const markLearned = (deckId, word) => {
    if (!word) return;
    setLearnedByDeck((prev) => markLearnedIn(prev, deckId, word));
    setLearnedWords((prev) => (prev[word] ? prev : { ...prev, [word]: true }));
    stampSettings();
  };

  const tabs = [
    { id: 'home', label: 'Home', icon: Home, num: '01' },
    { id: 'chat', label: 'Chat', icon: MessageSquare, num: '02' },
    { id: 'alphabet', label: 'Alphabet', icon: Type, num: '03' },
    { id: 'vocab', label: 'Vocab', icon: BookOpen, num: '04' },
    { id: 'translate', label: 'Translate', icon: Languages, num: '05' },
    { id: 'stats', label: 'Profile', icon: User, num: '06' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: Shield, num: '07' }] : []),
  ];

  // Stats nav badge — count of wrong items + due vocab cards.
  // Read fresh from storage on every render so it reflects exercises taken in
  // other tabs since the last App re-render. Cheap (single localStorage hit).
  const liveState = loadState() ?? {};
  const attentionCount =
    getReviewItems(liveState.items ?? {}).length +
    getDueCount(liveState.srs ?? {}, PRESET_DECKS, Date.now());

  // One pass over history, shared by both context calls below.
  const questCtx = questHistory({ daily: liveState.daily, userId: user?.id });

  // Open missions for Home. Every input is already on hand here, and
  // deriveMissions is pure — it decides WHICH missions are open and returns
  // ids and counts, never copy, so no German reaches src/lib.
  //
  // `decks` is a pure derivation over state App already holds (learnedWords is
  // already synced inside settings.data.learnedWords), so it needs no query.
  // `league` comes from two RLS-scoped reads; it stays null when leagues are
  // off, when signed out, or when this week has no membership — in which case
  // the mission simply does not fire.
  const deckRows = deckProgressFor({ decks: PRESET_DECKS, learnedWords, learnedByDeck });

  const missions = deriveMissions({
    srsDue: getDueCount(liveState.srs ?? {}, PRESET_DECKS, Date.now()),
    goal: game.goal,
    streak: game.streak,
    reviewItems: getReviewItems(liveState.items ?? {}),
    decks: deckRows,
    league: leagueStanding,
    achievements: ACHIEVEMENTS,
    achievementCtx: gamificationContext(liveState, questCtx),
    earned: earnedAchievements(gamificationContext(liveState, questCtx)).map((a) => a.id),
    now: new Date(),
    lastTab: TABS.includes(tab) ? tab : 'chat',
  });

  // A generated deck replaces the single custom slot, matching today's UX —
  // the deck now outlives the component that made it. The write goes through
  // the persist effect above rather than saveState directly, so it keeps the
  // blob's single-writer discipline.
  // deckId is a PARAMETER now, defaulted to the historic single slot so this
  // refactor changes no behaviour. Phase 3 passes newDeckId() instead, which is
  // the whole of "many decks" at this call site.
  const handleDeckGenerated = ({ deckId = CUSTOM_DECK_ID, name, cards }) => {
    setDecks((prev) => upsertDeck(prev, { deckId, name, cards }));
    // Tell the sync engine there is something to push. Every other write that
    // matters announces itself this way (handleGoalChange, recordEvent), and
    // markDirty listens for it — without this the deck would sit locally until
    // some UNRELATED progress event or a tab refocus happened to flush it.
    window.dispatchEvent(new CustomEvent('deutsch:progress'));
  };

  // Removing a deck writes a TOMBSTONE rather than dropping the entry. A plain
  // delete is invisible to an upsert-only sync engine, so the other device
  // would push its copy straight back on the next pull.
  const handleDeckDeleted = (deckId = CUSTOM_DECK_ID) => {
    setDecks((prev) => deleteDeck(prev, deckId));
    // The deck is gone, so its scoped mastery is meaningless. The flat mirror
    // stays: it is union-merged and shared with every other deck.
    setLearnedByDeck((prev) => forgetDeck(prev, deckId));
    window.dispatchEvent(new CustomEvent('deutsch:progress'));
  };

  // Today's quests. Pure: the set is a function of (user, day) and the progress
  // a read over `daily`, so nothing is stored and nothing syncs.
  const quests = deriveQuests({
    userId: user?.id,
    todayKey: todayKey(),
    daily: liveState.daily,
  });
  // Server-held balance; each completed quest pays once (see useTokenBalance).
  const tokens = useTokenBalance({ userId: user?.id, quests, todayKey: todayKey() });

  const settingsPanel = (
    <SettingsRoute
      user={user}
      profile={profile}
      adminMe={adminSession.me}
      onProfileSaved={setProfile}
      onToast={(title) => pushToasts([{ kind: 'info', title, sub: '', icon: 'done' }])}
      level={level}
      onLevelChange={setLevel}
      onRetakePlacement={openPlacement}
      goal={loadState()?.gamification?.goal ?? DEFAULT_GOAL}
      onGoalChange={handleGoalChange}
      soundOn={loadState()?.gamification?.soundOn ?? false}
      onSoundChange={handleSoundToggle}
      interestTopics={interestTopics}
      enabledInterests={enabledInterests}
      onInterestsChange={handleInterestsChange}
      preferredModel={preferredModel}
      onPreferredModelChange={handlePreferredModelChange}
      levelBoost={authStatus === 'authenticated'}
      onSignIn={requestSignIn}
      onSignOut={handleSignOut}
      onExport={handleExport}
      onDelete={handleDelete}
      lastSyncedAt={syncStatus.lastSyncedAt}
    />
  );

  // The guest trial is spent: block earning new progress, leave everything
  // else reachable. Every clause is load-bearing —
  //   • isAuthConfigured — a wall with no sign-in behind it is PR #79's
  //     dead-affordance bug again.
  //   • 'anonymous' only — never for a signed-in user, and never while
  //     'loading', or a returning account sees the wall flash before their
  //     session resolves.
  //   • practice tab only — Stats is the escape hatch, so it is never walled.
  //   • no celebration running — the designed peak fires on the very round
  //     that completes the first daily goal, i.e. the round that pushes the
  //     "Tagesziel erreicht!" toast and the confetti burst. Waiting for both
  //     to clear lets the celebration play in full; the wall lands after it,
  //     before the next round can start.
  const trialWallUp =
    isAuthConfigured() &&
    authStatus === 'anonymous' &&
    game.trial.exhausted &&
    TABS.includes(tab) &&
    toasts.length === 0 &&
    !streakBurst;

  // `loading` is the first render for everyone, and useAuth settles in an
  // effect — i.e. after paint. Without the mayHaveSession() clause a guest sees
  // one frame of the app before the gate; with it, a device holding no token
  // gets the gate on the first paint and a device that might have a session
  // renders the app and never blinks.
  const sessionUnresolved = authStatus === 'loading' && !mayHaveSession();
  const showGate =
    !gateDismissed && isAuthConfigured() && (authStatus === 'anonymous' || sessionUnresolved);

  // Default-classify at the moment the optional test first PAINTS — not when
  // the gate decides. Waiting for the paint matters: a guest on the welcome
  // gate who picks "Sign in" instead must not be stamped A1 before their own
  // account's level has had a chance to arrive. From here on the learner has a
  // level, so the gate can never fire for them again, whatever they do next.
  const placementPainting = autoPlacement && !retakePlacement && !showGate && !legalRoute;
  useEffect(() => {
    if (!placementPainting) return;
    applyDefaultPlacement();
    setFirstRunPlacement(true);
  }, [placementPainting]);

  // Rendered by the gate, placement and main branches alike; the legal routes
  // return first so the consent links work from every surface below.
  const authOverlay = (
    <>
      <AuthCallbackLanding
        status={rawAuth.status}
        signupRejected={signupRejected}
        onSignedIn={handleAuthDone}
        onRequestNew={requestSignIn}
      />
      <AuthSheet
        open={Boolean(authModal)}
        intent={authModal ?? 'signin'}
        onClose={closeAuthSheet}
        onSuccess={handleAuthDone}
        onGoogle={authModal === 'create' ? handleGoogleCreate : handleGoogle}
        googleBusy={googleBusy}
        onGitHub={authModal === 'create' ? handleGitHubCreate : handleGitHub}
        gitHubBusy={gitHubBusy}
        draft={authDraft}
        onDraftChange={patchAuthDraft}
        onNavigateLegal={openLegalFromConsent}
        focusConsent={focusConsent}
        // A delete from the gate can demand a fresh sign-in; the sheet for it
        // must stack above the gate, not open hidden behind its scrim.
        zIndex={acceptanceGateUp ? Z.modal + 1 : undefined}
      />
      {acceptanceGateUp && (
        <AcceptanceGate
          hasPrior={legal.hasPrior}
          accepted={authDraft.accepted}
          onAcceptedChange={setDraftAccepted}
          onContinue={async () => {
            const result = await legal.accept();
            if (result.ok) setAuthDraft(EMPTY_AUTH_DRAFT);
            return result;
          }}
          onSignOut={leaveAccount}
          // handleDelete has already toasted any failure; it rethrows only so
          // AccountSection keeps its typed phrase armed, and the gate keeps its
          // own, so the rejection ends here rather than going unhandled.
          onDelete={(phrase) => handleDelete(phrase, { after: leaveAccount }).catch(() => {})}
          onNavigateLegal={openLegalFromConsent}
          focusConsent={focusConsent}
        />
      )}
    </>
  );

  if (legalRoute === 'privacy') return <PrivacyPolicy onBack={closeLegal} />;
  if (legalRoute === 'terms') return <TermsOfService onBack={closeLegal} />;
  if (legalRoute === 'delete-account') return <DeleteAccountPage onBack={closeLegal} />;

  if (showGate) {
    return (
      <>
        <WelcomeGate
          onGuest={handleGuest}
          onAuth={(intent) => setAuthModal(intent)}
          onGoogle={handleGoogle}
          googleBusy={googleBusy}
          onGitHub={handleGitHub}
          gitHubBusy={gitHubBusy}
        />
        {authOverlay}
      </>
    );
  }

  if (showPlacement) {
    return (
      <>
        <PlacementTest
          onComplete={closePlacement}
          onCancel={closePlacement}
          firstRun={!retakePlacement}
        />
        {authOverlay}
      </>
    );
  }

  return (
    // Practice tabs register their in-flight state here; the header's status
    // control reads it before restarting anything. Wraps the whole tree so
    // the reader (header) and the writers (tabs) share one registry.
    <SessionGuardContext.Provider value={sessionGuard}>
      <div
        style={{
          minHeight: '100vh',
          position: 'relative',
          background: COLORS.paper,
          color: COLORS.ink,
          fontFamily: FONT_BODY,
          backgroundImage: `radial-gradient(circle at 1px 1px, ${COLORS.inkSoftA08} 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      >
        {streakBurst && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none' }}>
            <Confetti count={40} />
          </div>
        )}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        {/* ── Header ───────────────────────────────────────────── */}
        <header
          style={{
            borderBottom: `1px solid ${COLORS.border}`,
            boxShadow: SHADOW.bar,
            // Inset-top is added to the existing padding so the charcoal bar
            // paints under the status bar / Dynamic Island and the chips stay
            // below it. Nav's sticky `top` below includes the same inset, or
            // it would slide under a taller header.
            paddingTop: `calc(${mobile ? 12 : 20}px + env(safe-area-inset-top, 0px))`,
            paddingBottom: mobile ? 12 : 20,
            paddingLeft: `calc(${mobile ? 10 : 32}px + env(safe-area-inset-left, 0px))`,
            paddingRight: `calc(${mobile ? 10 : 32}px + env(safe-area-inset-right, 0px))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            // The masthead is the flag's black stripe carried into the app frame,
            // so it holds its charcoal in both modes rather than following the
            // page ground. `color` is set here and inherited: everything on this
            // bar is either brand text on the charcoal, or a control carrying its
            // own surface (StatusChip, ThemeChip, AccountChip).
            background: COLORS.accentBlack,
            color: COLORS.accentBlackOn,
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          {/* Dropped below 360px: a real year-long streak renders level 30 + "365"
            + a freeze chip + SIGN IN, which ran 34px past a 320px viewport, and
            each of those is the only surface for its signal (the freeze count
            appears nowhere else in the app). The wordmark is the one decorative
            item here, so it gives way instead.

            No minWidth: 0 on this block either — letting it shrink below its
            content made the nowrap wordmark spill over the level badge instead
            of pushing width: "over: 0" by overlap, which reads as a rendering
            bug. It scales via font-size instead. */}
          {!tiny && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  // Scales with the viewport between 360px and 640px.
                  fontSize: mobile ? 'min(26px, 6.5vw)' : 36,
                  whiteSpace: 'nowrap',
                  fontWeight: 900,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                }}
              >
                {/* Same dot the splash paints, and the same token: brand red,
                  not the error token. Large text, so 3:1 applies. */}
                Deutsch<span style={{ color: COLORS.flagRed }}>.</span>
              </div>
              {/* Tagline waits for bp.wide alongside the chat's
                third column: appearing at 640 it left the header 2px wider than
                the viewport, which is small but is still sideways scroll. */}
              {width >= bp.wide && (
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    color: COLORS.accentBlackOnMuted,
                    textTransform: 'uppercase',
                  }}
                >
                  Sprachschule × Est. {new Date().getFullYear()}
                </div>
              )}
            </div>
          )}

          {/* marginLeft auto: once the wordmark drops, this cluster is the only
            flex child and space-between would start-align it. AccountChip's
            sheet is `right: 0` and 200px wide — it assumes the chip is at the
            trailing edge. Hiding the Home streak shortened the cluster enough
            that a signed-in Account sheet measured left: -34 at 390px. */}
          <div
            style={{
              display: 'flex',
              gap: mobile ? 6 : 16,
              alignItems: 'center',
              flexShrink: 0,
              marginLeft: 'auto',
            }}
          >
            {/* One control for both "levels": the earned XP one and the chosen
              CEFR one. They stay distinct inside the sheet, under their own
              headings — see StatusChip. */}
            {/* A wrapper, not a ref forwarded into StatusChip: the chip is one
              of three non-modal header popovers under a guard test, and giving
              the walkthrough a handle on it is not worth reopening that. */}
            <span ref={statusAnchorRef} data-tutorial-anchor="status" style={{ display: 'flex' }}>
              <StatusChip
                level={level}
                onRetakePlacement={openPlacement}
                xpLevel={game.lvl.level}
                progress={game.lvl.progress}
                rank={game.lvl.rankName}
                xpIntoLevel={game.lvl.xpIntoLevel}
                xpToNext={game.lvl.xpToNext}
                size={mobile ? 42 : 52}
              />
            </span>
            {game.freezes > 0 && (
              <span
                role="img"
                aria-label={`${game.freezes} streak freeze${game.freezes > 1 ? 's' : ''} held`}
                title={`${game.freezes} streak freeze${game.freezes > 1 ? 's' : ''} held`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  fontFamily: FONT_MONO,
                  fontSize: mobile ? 12 : 14,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                <Snowflake size={mobile ? 14 : 16} aria-hidden="true" />
                {game.freezes}
              </span>
            )}
            {/* Both social endpoints require auth (see socialEndpoints.js), so
                a signed-out box could only ever produce an error — same gate
                UserSearch used when it lived inline in the Profile tab. */}
            {user && (
              <Button
                variant="icon"
                aria-label="Search people"
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} aria-hidden="true" />
              </Button>
            )}
            <ThemeChip />
            <AccountChip
              user={user}
              profile={profile}
              onSignIn={requestSignIn}
              onSignOut={handleSignOut}
              onOpenSettings={openSettings}
              onOpenProfile={openProfile}
              pending={syncStatus.pending}
            />
          </div>
        </header>

        {/* ── Nav ──────────────────────────────────────────────── */}
        <nav
          style={{
            display: 'flex',
            gap: mobile ? 6 : 8,
            paddingTop: mobile ? 8 : 12,
            paddingBottom: mobile ? 8 : 12,
            paddingLeft: `calc(${mobile ? 10 : 16}px + env(safe-area-inset-left, 0px))`,
            paddingRight: `calc(${mobile ? 10 : 16}px + env(safe-area-inset-right, 0px))`,
            background: COLORS.paper,
            borderBottom: `1px solid ${COLORS.border}`,
            position: 'sticky',
            top: `calc(${mobile ? 53 : 81}px + env(safe-area-inset-top, 0px))`,
            zIndex: 49,
            boxShadow: SHADOW.bar,
          }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                ref={
                  t.id === 'chat' ? chatAnchorRef : t.id === 'stats' ? statsAnchorRef : undefined
                }
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'stats') {
                    if (profileView === 'settings') setSettingsHash();
                  } else {
                    clearSettingsHash();
                  }
                }}
                aria-label={t.label}
                aria-current={active ? 'page' : undefined}
                style={{
                  flex: 1,
                  // minWidth: 0 is the flex counterpart of the minmax(0, 1fr) rule
                  // in AGENTS.md — `flex: 1` leaves min-width at auto, so these
                  // buttons refused to shrink below their label and pushed the nav
                  // 28px past a 640px viewport, on every tab.
                  minWidth: 0,
                  padding: navIconOnly ? '12px 6px' : '14px 18px',
                  background: active ? COLORS.ink : 'transparent',
                  color: active ? COLORS.paper : COLORS.ink,
                  border: 'none',
                  borderRadius: RADIUS.md,
                  boxShadow: active ? SHADOW.press(COLORS.press) : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: navIconOnly ? 'center' : 'flex-start',
                  gap: 10,
                  position: 'relative',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = COLORS.paperDeep;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                {navIconOnly ? (
                  // Icon only, until the labels have room — see navIconOnly.
                  <Icon size={20} />
                ) : (
                  <>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        opacity: 0.6,
                        letterSpacing: '0.1em',
                      }}
                    >
                      {t.num}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_DISPLAY,
                        fontSize: 20,
                        fontWeight: 600,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {t.label}
                    </span>
                  </>
                )}
                {t.id === 'stats' && !active && attentionCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: navIconOnly ? 4 : 8,
                      right: navIconOnly ? 4 : 8,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      background: COLORS.red,
                      color: COLORS.paper,
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                      borderRadius: 9,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {attentionCount > 9 ? '9+' : attentionCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Main ─────────────────────────────────────────────── */}
        {/* The measure, both gutters and the inline/bottom safe-area insets
            live in PageFrame. `gutter` covers the inline edges and the top
            (inset-top is owned by the sticky masthead above). The 32px
            bottom is PageFrame's bottomGutter default, composed with
            inset-bottom so home-indicator clearance cannot replace it. */}
        <PageFrame as="main" gutter={mobile ? 4 : 8}>
          {/* Home owns its daily-goal ring in PersonalHub. Every other tab uses
            the strip as its single daily-goal surface, at every viewport. */}
          {tab !== 'home' && (
            <GoalStrip
              streak={game.streak}
              current={game.goal.current}
              target={game.goal.target}
              mult={game.mult}
            />
          )}
          {tab === 'home' && (
            <HomeTab
              score={score(liveState.daily ?? {})}
              learnedCount={stats.learnedCount ?? 0}
              goalPct={game.goal.pct}
              goalMet={game.goal.met}
              streak={game.streak}
              user={user}
              profile={profile}
              cefrLevel={level}
              missions={missions}
              quests={quests}
              league={leagueStanding}
              onGoToTab={goToTab}
              showPlacementOffer={placementOfferVisible}
              onRetakePlacement={acceptPlacementOffer}
              onDismissPlacementOffer={dismissPlacementOffer}
            />
          )}
          {/* The four practice tabs share one positioned wrapper so the trial
            wall can scrim THEM and nothing else. A position: fixed modal would
            take the header and nav with it, and the wall is explicitly not
            allowed to: Stats and settings stay reachable while it is up. */}
          {TABS.includes(tab) && (
            <div style={{ position: 'relative' }}>
              {/* Server-driven units, additive over the bundled pack. With no
                units for this (level, tab) the lane renders its children and
                NOTHING else, so with an unseeded `lessons` table every tab
                below is byte-identical to what it was. With units, the tab's
                own content moves into the lane's collapsible. */}
              <PracticeLane level={level} tab={tab}>
                {tab === 'chat' && (
                  <ChatTab
                    level={level}
                    mobile={mobile}
                    wide={width >= bp.wide}
                    learnedWords={learnedWords}
                    learnedByDeck={learnedByDeck}
                    enabledInterests={enabledInterests}
                    preferredModel={preferredModel}
                    onPreferredModelChange={handlePreferredModelChange}
                    user={user}
                    onSignIn={requestSignIn}
                  />
                )}
                {tab === 'alphabet' && (
                  <AlphabetTab
                    level={level}
                    mobile={mobile}
                    reviewTarget={reviewTarget?.tab === 'alphabet' ? reviewTarget : null}
                    onReviewConsumed={clearReviewTarget}
                  />
                )}
                {tab === 'vocab' && (
                  <VocabTab
                    learnedWords={learnedWords}
                    learnedByDeck={learnedByDeck}
                    markLearned={markLearned}
                    level={level}
                    mobile={mobile}
                    reviewTarget={reviewTarget?.tab === 'vocab' ? reviewTarget : null}
                    onReviewConsumed={clearReviewTarget}
                    customDecks={liveDecks(decks)}
                    onDeckGenerated={handleDeckGenerated}
                    onDeckDeleted={handleDeckDeleted}
                    enabledInterests={enabledInterests}
                  />
                )}
                {tab === 'translate' && (
                  <TranslateTab
                    // Keyed by level so a switch REMOUNTS rather than mutating a
                    // live session. The exercise banks are differently shaped per
                    // level (A1 rows carry `words`, A2 `template`), so any scheme
                    // that keeps the old state for even one commit hands the wrong
                    // row to the wrong exercise component and throws. Remounting
                    // is also what already happens on every tab switch — this tab
                    // is conditionally rendered — so the level switch now matches
                    // the lifecycle the component was always written against.
                    // Removing this key resurrects the A1 -> A2 crash; the
                    // "restarts the exercise set" test in App.test.jsx is the guard.
                    key={level}
                    level={level}
                    mobile={mobile}
                    reviewTarget={reviewTarget?.tab === 'translate' ? reviewTarget : null}
                    onReviewConsumed={clearReviewTarget}
                  />
                )}
              </PracticeLane>
              {trialWallUp && (
                <TrialWall
                  roundsUsed={game.trial.roundsUsed}
                  mobile={mobile}
                  onCreateAccount={() => setAuthModal('create')}
                  onSignIn={requestSignIn}
                  onGoogle={handleGoogleCreate}
                  googleBusy={googleBusy}
                  onGitHub={handleGitHubCreate}
                  gitHubBusy={gitHubBusy}
                  // Both halves, always: with either missing the wall falls
                  // back to its pre-consent one-tap provider path.
                  accepted={authDraft.accepted}
                  onAcceptedChange={setDraftAccepted}
                  onNavigateLegal={openLegalFromConsent}
                  focusConsent={focusConsent}
                />
              )}
            </div>
          )}
          {tab === 'stats' && (
            <StatsTab
              mobile={mobile}
              onReview={handleReview}
              user={user}
              profile={profile}
              tokens={tokens}
              onSignIn={requestSignIn}
              view={profileView}
              onViewChange={handleProfileView}
              settingsPanel={settingsPanel}
            />
          )}
          {tab === 'admin' && isAdmin && <AdminTab me={adminSession.me} />}
        </PageFrame>

        {/* ── Footer ────────────────────────────────────────────────
            Strap, legal links and credit are one row, and AppFooter owns both
            the row and the <footer> element itself — see the note there for
            why the row needs a single owner. */}
        <AppFooter mobile={mobile} onNavigate={openLegal} />

        {/* Only reachable past the entry gate, which early-returns above — so a
          brand-new account meets the gate first and the tour on the frame after
          it, never both at once. */}
        <TutorialOverlay anchors={tutorialAnchors} />

        {!isNativeApp() && <Analytics />}
        {authOverlay}
        {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} mobile={mobile} />}
      </div>
    </SessionGuardContext.Provider>
  );
}
