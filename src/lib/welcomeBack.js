// "Welcome back" — once per app session, for a signed-in learner who has
// already practised. Pure decision + a sessionStorage flag; no DOM.
//
// Signed-in only: an anonymous open already lands on the entry gate, so a
// second welcome straight after it would be the same greeting twice.
//
// Every input is "has the state ARRIVED", not "is it empty": on a fresh
// device level and XP come down with the first reconcile, and deciding before
// it lands would skip a returning learner or greet a new one. A brand-new
// learner (no XP yet) gets the first-run placement intro, which carries its
// own welcome, and the tutorial — never this on top of them. `tutorialDone`
// must be the flag as it stood when the app OPENED: the tour marks itself
// done on paint, so the live flag cannot tell "finished" from "on screen".

export const WELCOME_BACK_KEY = 'deutsch-welcome-back-shown';

/**
 * @param {{ authStatus: string, syncSettled: boolean, blocked: boolean,
 *   hasLevel: boolean, xp: number, tutorialDone: boolean, shown: boolean }} s
 */
export function shouldWelcomeBack(s) {
  return (
    s.authStatus === 'authenticated' &&
    s.syncSettled &&
    !s.blocked &&
    s.hasLevel &&
    s.xp > 0 &&
    s.tutorialDone &&
    !s.shown
  );
}

// sessionStorage, not localStorage: "once per visit", so closing the app and
// coming back tomorrow greets again, while a reload mid-session does not.
export function welcomedThisSession() {
  try {
    return sessionStorage.getItem(WELCOME_BACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomed() {
  try {
    sessionStorage.setItem(WELCOME_BACK_KEY, '1');
  } catch {
    // Storage blocked: the overlay still closes; it may greet again on reload.
  }
}
