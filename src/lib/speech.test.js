import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// The native TTS plugin, shaped like the real one: Capacitor hands back a Proxy
// that turns ANY property into a native call. A plain object here hid a bug on
// the emulator: the plugin was resolved through a promise, which reads `.then`,
// which became a native "then()" call, and the promise never settled.
const tts = vi.hoisted(() => {
  const methods = { speak: vi.fn() };
  return new Proxy(methods, {
    get: (target, prop) =>
      prop in target
        ? target[prop]
        : () => Promise.reject(new Error(`"TextToSpeech.${String(prop)}()" is not implemented`)),
  });
});
vi.mock('@capacitor-community/text-to-speech', () => ({ TextToSpeech: tts }));

describe('speak', () => {
  let cancel;
  let speakFn;
  let getVoices;
  let lastUtterance;

  beforeEach(() => {
    vi.resetModules();
    cancel = vi.fn();
    speakFn = vi.fn();
    getVoices = vi.fn(() => [
      { lang: 'en-US', name: 'English' },
      { lang: 'de-DE', name: 'German' },
    ]);

    globalThis.SpeechSynthesisUtterance = vi.fn(function SpeechSynthesisUtterance(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.voice = null;
      lastUtterance = this;
    });

    window.speechSynthesis = { cancel, speak: speakFn, getVoices };
  });

  afterEach(() => {
    delete window.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
    lastUtterance = null;
  });

  it('cancels pending speech and defaults to the active pack locale', async () => {
    const { speak } = await import('./speech');
    const { activePack } = await import('../packs');
    speak('Guten Tag');
    expect(cancel).toHaveBeenCalled();
    expect(speakFn).toHaveBeenCalledWith(lastUtterance);
    expect(lastUtterance.text).toBe('Guten Tag');
    expect(lastUtterance.lang).toBe(activePack.meta.locale);
    expect(lastUtterance.rate).toBe(0.9);
    expect(lastUtterance.voice?.lang).toBe(activePack.meta.locale);
  });

  it('picks a voice matching the requested language, not the pack default', async () => {
    const { speak } = await import('./speech');
    speak('Hello', 'en-US');
    expect(lastUtterance.lang).toBe('en-US');
    expect(lastUtterance.voice?.lang).toBe('en-US');
  });

  it('leaves the voice unset when no voice matches the language', async () => {
    getVoices.mockReturnValue([{ lang: 'fr-FR', name: 'French' }]);
    const { speak } = await import('./speech');
    speak('Hola', 'es-ES');
    expect(lastUtterance.lang).toBe('es-ES');
    expect(lastUtterance.voice).toBeNull();
  });

  it('is a no-op when speechSynthesis is unavailable', async () => {
    delete window.speechSynthesis;
    const { speak } = await import('./speech');
    expect(() => speak('Hallo')).not.toThrow();
  });

  it('honours a custom speech rate', async () => {
    const { speak } = await import('./speech');
    speak('Langsam', 'de-DE', 0.5);
    expect(lastUtterance.rate).toBe(0.5);
  });

  describe('voice selection with several voices available', () => {
    // The real macOS list: novelty voices first, the standard one last. `.find`
    // takes array order and lands on "Eddy"; the pack asks for "Anna".
    const MANY = [
      { lang: 'en-US', name: 'Samantha' },
      { lang: 'de-DE', name: 'Eddy' },
      { lang: 'de-DE', name: 'Flo' },
      { lang: 'de-DE', name: 'Grandma' },
      { lang: 'de-DE', name: 'Anna' },
    ];

    it('prefers a voice the pack names over whatever comes first', async () => {
      getVoices.mockReturnValue(MANY);
      const { speak } = await import('./speech');
      speak('Wasser');
      expect(lastUtterance.voice.name).toBe('Anna');
    });

    it('walks the preference list in order', async () => {
      getVoices.mockReturnValue([
        { lang: 'de-DE', name: 'Eddy' },
        { lang: 'de-DE', name: 'Markus' },
      ]);
      const { speak } = await import('./speech');
      speak('Wasser');
      // 'Anna' is absent, so the next preference wins — not Eddy.
      expect(lastUtterance.voice.name).toBe('Markus');
    });

    it('skips novelty voices when the preferred name is localised away', async () => {
      // macOS renames the standard voice per OS language — "Anna" becomes "אנה"
      // on a Hebrew system — while the comedy voices keep English proper names.
      // An allowlist cannot match; avoiding the known novelty names can.
      getVoices.mockReturnValue([
        { lang: 'de-DE', name: 'Eddy (גרמנית (גרמניה))' },
        { lang: 'de-DE', name: 'Rocko (גרמנית (גרמניה))' },
        { lang: 'de-DE', name: 'אנה' },
      ]);
      const { speak } = await import('./speech');
      speak('Wasser');
      expect(lastUtterance.voice.name).toBe('אנה');
    });

    it('falls back to a default-flagged voice when no preference matches', async () => {
      // Both are novelty voices, so the denylist cannot help and the
      // default flag decides.
      getVoices.mockReturnValue([
        { lang: 'de-DE', name: 'Eddy' },
        { lang: 'de-DE', name: 'Rocko', default: true },
      ]);
      const { speak } = await import('./speech');
      speak('Wasser');
      expect(lastUtterance.voice.name).toBe('Rocko');
    });

    it("falls back to the first match — today's behaviour — as the last resort", async () => {
      getVoices.mockReturnValue([
        { lang: 'de-DE', name: 'Eddy' },
        { lang: 'de-DE', name: 'Flo' },
      ]);
      const { speak } = await import('./speech');
      speak('Wasser');
      expect(lastUtterance.voice.name).toBe('Eddy');
    });
  });
});

describe('capability detection', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete window.speechSynthesis;
  });

  it('reports no recognition support when neither constructor exists', async () => {
    const { isSpeechRecognitionSupported } = await import('./speech');
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it('detects the standard and the webkit-prefixed recognition constructors', async () => {
    const { isSpeechRecognitionSupported } = await import('./speech');
    window.SpeechRecognition = function SR() {};
    expect(isSpeechRecognitionSupported()).toBe(true);
    delete window.SpeechRecognition;

    window.webkitSpeechRecognition = function WSR() {};
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it('reports no synthesis support in a bare jsdom window', async () => {
    const { isSpeechSynthesisSupported } = await import('./speech');
    expect(isSpeechSynthesisSupported()).toBe(false);
  });

  // A stub that exists but cannot speak is not support. Treating presence alone
  // as support is how a half-shimmed environment gets a call it cannot serve.
  it('does not count a speechSynthesis object with no speak()', async () => {
    const { isSpeechSynthesisSupported } = await import('./speech');
    window.speechSynthesis = { getVoices: () => [] };
    expect(isSpeechSynthesisSupported()).toBe(false);
    window.speechSynthesis = { getVoices: () => [], speak: () => {} };
    expect(isSpeechSynthesisSupported()).toBe(true);
  });
});

describe('getGermanVoice', () => {
  afterEach(() => {
    delete window.speechSynthesis;
    vi.resetModules();
  });

  it('resolves null rather than throwing when synthesis is absent', async () => {
    const { getGermanVoice } = await import('./speech');
    await expect(getGermanVoice()).resolves.toBeNull();
  });

  it('returns a German voice that is already loaded', async () => {
    window.speechSynthesis = {
      speak: vi.fn(),
      getVoices: () => [
        { lang: 'en-US', name: 'English' },
        { lang: 'de-DE', name: 'Anna' },
      ],
    };
    const { getGermanVoice } = await import('./speech');
    expect((await getGermanVoice()).name).toBe('Anna');
  });

  // Chrome returns [] on the first call and announces the real list later. The
  // synchronous read in speak() misses that window entirely.
  it('waits for onvoiceschanged when the list starts empty', async () => {
    let voices = [];
    let fire;
    window.speechSynthesis = {
      speak: vi.fn(),
      getVoices: () => voices,
      addEventListener: (_type, cb) => {
        fire = cb;
      },
      removeEventListener: vi.fn(),
    };
    const { getGermanVoice } = await import('./speech');
    const pending = getGermanVoice();
    voices = [{ lang: 'de-DE', name: 'Anna' }];
    fire();
    expect((await pending).name).toBe('Anna');
  });

  it('falls back to the legacy onvoiceschanged property', async () => {
    let voices = [];
    const synth = { speak: vi.fn(), getVoices: () => voices, onvoiceschanged: null };
    window.speechSynthesis = synth;
    const { getGermanVoice } = await import('./speech');
    const pending = getGermanVoice();
    voices = [{ lang: 'de-DE', name: 'Petra' }];
    synth.onvoiceschanged();
    expect((await pending).name).toBe('Petra');
  });

  // A device with no voices never fires the event. Without the timeout every
  // awaiting caller would hang forever on an un-settled promise.
  it('gives up on the timeout instead of hanging when the event never fires', async () => {
    vi.useFakeTimers();
    window.speechSynthesis = {
      speak: vi.fn(),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const { getGermanVoice } = await import('./speech');
    const pending = getGermanVoice(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('resolves null when voices load but none are German', async () => {
    window.speechSynthesis = {
      speak: vi.fn(),
      getVoices: () => [{ lang: 'en-US', name: 'English' }],
      addEventListener: (_t, cb) => cb(),
      removeEventListener: vi.fn(),
    };
    const { getGermanVoice } = await import('./speech');
    await expect(getGermanVoice(10)).resolves.toBeNull();
  });
});

describe('speak resilience', () => {
  afterEach(() => {
    delete window.speechSynthesis;
    vi.resetModules();
  });

  it('is a no-op instead of throwing when synthesis is absent', async () => {
    const { speak } = await import('./speech');
    expect(() => speak('Hallo')).not.toThrow();
  });

  // Synthesis is a nicety on every screen that uses it. A driver that throws
  // must not take the surrounding render or click handler down with it.
  it('swallows a throwing speech driver', async () => {
    window.speechSynthesis = {
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'de-DE', name: 'Anna' }],
      speak: () => {
        throw new Error('speech-dispatcher unavailable');
      },
    };
    const { speak } = await import('./speech');
    expect(() => speak('Hallo')).not.toThrow();
  });

  it('survives getVoices returning undefined', async () => {
    window.speechSynthesis = { cancel: vi.fn(), getVoices: () => undefined, speak: vi.fn() };
    const { speak } = await import('./speech');
    expect(() => speak('Hallo')).not.toThrow();
  });
});

// Android's WebView has no speechSynthesis at all (probed 2026-10-17), so in the
// app every speak() was silent. There it goes to the OS engine instead.
describe('inside the native app', () => {
  let webSpeak;

  beforeEach(() => {
    vi.resetModules();
    tts.speak.mockReset().mockResolvedValue(undefined);
    webSpeak = vi.fn();
    // What Capacitor's bridge injects: the platform, and the plugins it has.
    window.Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'TextToSpeech',
    };
  });

  afterEach(() => {
    delete window.Capacitor;
    delete window.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  });

  it('speaks through the OS engine in the pack locale and drill rate, with no Web Speech', async () => {
    const { speak, canSpeak } = await import('./speech');
    const { activePack } = await import('../packs');
    expect(canSpeak()).toBe(true);
    speak('Guten Tag');
    await vi.waitFor(() =>
      expect(tts.speak).toHaveBeenCalledWith({
        text: 'Guten Tag',
        lang: activePack.meta.locale,
        rate: 0.9,
      })
    );
  });

  it('passes a caller-chosen language and rate through', async () => {
    const { speak } = await import('./speech');
    speak('Hello', 'en-US', 0.5);
    await vi.waitFor(() =>
      expect(tts.speak).toHaveBeenCalledWith({ text: 'Hello', lang: 'en-US', rate: 0.5 })
    );
  });

  // iOS's WKWebView does have speechSynthesis. With the plugin there, it must
  // not speak twice, once through each engine.
  it('leaves speechSynthesis alone when the plugin is there', async () => {
    window.speechSynthesis = { cancel: vi.fn(), getVoices: () => [], speak: webSpeak };
    const { speak } = await import('./speech');
    speak('Hallo');
    await vi.waitFor(() => expect(tts.speak).toHaveBeenCalledTimes(1));
    expect(webSpeak).not.toHaveBeenCalled();
  });

  // No engine, or the locale is not installed. Unhandled, this rejection would
  // fail the run, so the test passing is the assertion.
  it('drops an engine rejection instead of leaking it', async () => {
    tts.speak.mockRejectedValue(new Error('This language is not supported.'));
    const { speak } = await import('./speech');
    expect(() => speak('Hallo')).not.toThrow();
    await vi.waitFor(() => expect(tts.speak).toHaveBeenCalled());
  });

  it('falls back to speechSynthesis when the bridge has no TTS plugin', async () => {
    window.Capacitor.isPluginAvailable = () => false;
    window.speechSynthesis = { cancel: vi.fn(), getVoices: () => [], speak: webSpeak };
    globalThis.SpeechSynthesisUtterance = vi.fn(function SpeechSynthesisUtterance(text) {
      this.text = text;
    });
    const { speak, canSpeak } = await import('./speech');
    expect(canSpeak()).toBe(true);
    speak('Hallo');
    expect(webSpeak).toHaveBeenCalledTimes(1);
    expect(tts.speak).not.toHaveBeenCalled();
  });

  it('cannot speak with neither the plugin nor speechSynthesis', async () => {
    window.Capacitor.isPluginAvailable = () => false;
    const { canSpeak } = await import('./speech');
    expect(canSpeak()).toBe(false);
  });

  // Written by `npx cap update`. Without these the plugin is in package.json
  // and in no app, and the bridge reports it missing.
  it('ships the plugin in both native projects', () => {
    expect(readFileSync('android/capacitor.settings.gradle', 'utf8')).toContain(
      "include ':capacitor-community-text-to-speech'"
    );
    expect(readFileSync('android/app/capacitor.build.gradle', 'utf8')).toContain(
      "implementation project(':capacitor-community-text-to-speech')"
    );
    expect(readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8')).toContain(
      '.product(name: "CapacitorCommunityTextToSpeech", package: "CapacitorCommunityTextToSpeech")'
    );
  });
});

describe('canSpeak on the web', () => {
  afterEach(() => {
    delete window.speechSynthesis;
    vi.resetModules();
  });

  it('follows speechSynthesis and never loads the native plugin', async () => {
    const { canSpeak, speak } = await import('./speech');
    expect(canSpeak()).toBe(false);
    speak('Hallo');
    window.speechSynthesis = { getVoices: () => [], speak: () => {} };
    expect(canSpeak()).toBe(true);
    await Promise.resolve();
    expect(tts.speak).not.toHaveBeenCalled();
  });
});
