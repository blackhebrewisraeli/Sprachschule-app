# Native text-to-speech — design

**Status:** implemented in the same PR as this spec.

## 1. Problem

`src/lib/speech.js` `speak()` uses the Web Speech API. Android's WebView does
not implement it: in the Capacitor app (WebView 133, Android 16 emulator,
probed over CDP on 2026-10-17) `window.speechSynthesis` and
`SpeechSynthesisUtterance` are both `undefined`. `speak()` returns early when
synthesis is missing, so nothing errors and nothing plays. Every pronunciation
button is mute on every Android device, and the Alphabet "listen, then pick the
letter" quiz cannot be played. The UI hides none of it.

The same gap exists on the web wherever a page runs inside an Android WebView,
for example a social app's in-app browser.

## 2. Decision

**Inside the native app, `speak()` goes to the OS speech engine through
`@capacitor-community/text-to-speech`. The web keeps `speechSynthesis`.**

Plugin checks (8.0.2, published 2026-06-15):

- peer `@capacitor/core >=8.0.0`; Android `minSdk 24`, `compileSdk 36`; iOS 15
  via SPM. The same floor as this app.
- MIT. Android: `android.speech.tts.TextToSpeech`; iOS: `AVSpeechSynthesizer`.
- Android manifest adds only `<queries><intent android.intent.action.TTS_SERVICE/></queries>`,
  which lets the app see the installed engine under package visibility. No
  permission.
- iOS: no Info.plist usage string, no privacy-manifest required-reason API.

Routing lives in `speech.js` and nowhere else, so all four callers
(AlphabetTab, VocabTab's Hören drill, MessageBubble, InlineCorrection) move at
once:

- `isNativeApp()` and the bridge reports the `TextToSpeech` plugin → the plugin,
  `{ text, lang, rate }`. `lang` is still `activePack.meta.locale` and `rate`
  is still 0.9. The plugin's default queue strategy flushes, which is the
  native counterpart of the `cancel()` before every web utterance.
- Otherwise → `speechSynthesis`, unchanged.
- The plugin is a dynamic import, the same pattern `nativeApp.js` uses, so the
  web bundle never loads it.
- A rejection (no engine, language not installed) is swallowed. Speech is a
  nicety everywhere except two places, and those are gated (§3).

No German in `src/lib`: the locale comes from the pack, and the plugin is named
by its registered id. Voice choice on native is the OS default voice for the
locale. The macOS novelty-voice denylist is a Web Speech workaround and does not
apply to the native engines.

## 3. Gating audio-only UI

New export `canSpeak()`: true when the native plugin is registered, or when
`speechSynthesis` exists. Read during render.

| Surface                                    | When `canSpeak()` is false                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Alphabet quiz                              | No Quiz mode: Browse only, no mode toggle, Hero copy drops "test your ear".     |
| Alphabet browse detail                     | No play button. The letter and word still show.                                 |
| Vocab Hören drill                          | The PLAY button becomes a line saying audio is unavailable on this device.      |
| Chat message speaker, correction "HEAR IT" | Hidden.                                                                         |

**Known ceiling.** The gate is per platform, not per device. A phone whose TTS
engine lacks the locale still shows the controls, and the plugin rejects
silently. Probing `isLanguageSupported` at startup races Android's async engine
init and would hide working audio, which is worse. Upgrade path: probe on first
tap and call `openInstall()` when the language is missing.

Hören decks stay listed in the deck pickers and in Home recommendations on a
platform without speech. Hiding them touches four surfaces for a platform the
shipped app no longer has; the in-card line covers the rest.

## 4. iOS

`isNativeApp()` is true on iOS too, so iOS also takes the plugin path. WebKit
ships `speechSynthesis` in WKWebView, so iOS was probably not mute. This was not
probed on a TestFlight build in this change. Either way, one native path means
both platforms use the OS engine directly, and the WebKit voice-list quirks
(empty first `getVoices()`, localised names) stop mattering inside the app.

## 5. Store privacy

No change to either form. Synthesis is output: the app hands the OS engine a
string that is already on screen and receives nothing back. The app asks for no
permission and records no audio. `Audio` stays "Not by us".

If the user's engine has no offline voice for the locale, Google's engine may
fetch a network voice. That is the OS engine's own behaviour under the user's
settings, the same as the OS speech recognition line in the checklist.

## 6. Verification

- `npm test`, `npm run lint`, `npm run format:check`.
- `speech.test.js` pins routing, fallback, swallowed rejection, and the plugin
  in both native projects (`capacitor.settings.gradle`,
  `capacitor.build.gradle`, `Package.swift`), all written by `npx cap update`.
- On-device steps are in the PR description.
