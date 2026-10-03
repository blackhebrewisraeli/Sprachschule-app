// In-app screenshot driver. capture.mjs injects this file, preceded by
// `window.__SHOTS__ = { host, device, transport }`, into the COPIED web bundle only
// (ios/App/App/public, android/.../assets/public), then restores the bundle.
// It never enters src/ or a store build.
//
// Protocol with the host (capture.mjs):
//   /next          → { done: true } | { job }  — the next scene to shoot
//   /job   {id}    → { job }                    — after the seeding reload
//   /ready {id}    → host takes the native screenshot, then answers
//   /fail  {id, error}
// Transport: HTTP to 127.0.0.1 on iOS; on Android (which refuses cleartext
// HTTP) a DevTools binding, `__shotsCall`, that the host installs and answers
// through `__shotsReplies`.
// Every scene starts from a clean, seeded localStorage and a reload, so no
// scene inherits another's state.
(function shotsDriver() {
  const cfg = window.__SHOTS__;
  if (!cfg || window.__SHOTS_RUNNING__) return;
  window.__SHOTS_RUNNING__ = true;
  const PENDING = 'shots:pending';

  const viaHttp = async (path, body) => {
    const res = await fetch(`${cfg.host}${path}?device=${encodeURIComponent(cfg.device)}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };
  const replies = (window.__shotsReplies = window.__shotsReplies || {});
  let seq = 0;
  const viaCdp = async (path, body) => {
    await waitFor(() => typeof window.__shotsCall === 'function', 'the capture host', 60000);
    return new Promise((resolve) => {
      const id = ++seq;
      replies[id] = (reply) => {
        delete replies[id];
        resolve(reply);
      };
      window.__shotsCall(JSON.stringify({ id, path, body: body ?? null }));
    });
  };
  const api = cfg.transport === 'cdp' ? viaCdp : viaHttp;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  async function waitFor(fn, what, timeoutMs = 20000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(150);
    }
  }

  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (el) => !!el && el.getClientRects().length > 0;
  // A control by its accessible name: aria-label first, then its text. Tab
  // buttons read "Chat" on phones and "02 Chat" on wide layouts.
  function control(name, { exact = true } = {}) {
    const want = norm(name);
    const els = [...document.querySelectorAll('button, [role="tab"], a')].filter(visible);
    const named = (el) => norm(el.getAttribute('aria-label') || el.innerText);
    return (
      els.find((el) => named(el) === want) ||
      (!exact && els.find((el) => named(el).includes(want))) ||
      els.find((el) => norm(el.innerText).split(' ').slice(-1)[0] === want) ||
      null
    );
  }
  const click = async (name, opts) => {
    const el = await waitFor(() => control(name, opts), `"${name}"`, opts?.timeoutMs);
    el.click();
    await sleep(500);
    return el;
  };
  // React tracks value through the native setter; assigning .value directly
  // would be overwritten on the next render.
  function setValue(el, value) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
    );
  }
  const pageText = () => document.body.innerText;

  async function enterApp() {
    // A guest sees the welcome gate on every launch.
    const gate = await waitFor(
      () => control('Try it first', { exact: false }) || control('Home'),
      'the welcome gate or the app'
    );
    if (norm(gate.innerText).includes('try it first')) {
      gate.click();
      await waitFor(() => control('Home'), 'the app shell');
    }
    await sleep(600);
  }

  const SCENES = {
    async home() {
      await click('Home');
      window.scrollTo(0, 0);
    },

    async alphabet(job) {
      await click('Alphabet');
      await click('Browse', { exact: false });
      const tile = await click(`Select letter ${job.scene.letter} for details`);
      // The detail opens below the grid. Put the selected tile near the top so
      // the frame shows it with its detail panel and audio control beneath.
      await waitFor(
        () => document.querySelector('button[aria-label^="Play pronunciation"]'),
        'the letter audio control'
      );
      // The header and tab bar are sticky: measure where they end rather than
      // guessing, or the tile slides under them.
      const navBottom = control('Home').getBoundingClientRect().bottom;
      window.scrollTo(0, tile.getBoundingClientRect().top + window.scrollY - navBottom - 24);
    },

    async vocab(job) {
      await click('Vocab');
      // The card's German term is on screen; its English meaning is one of the
      // choices. Pick the choice the pack says is right.
      const pick = await waitFor(() => {
        const text = pageText();
        const choices = [...document.querySelectorAll('button')].filter(visible);
        for (const [de, en] of Object.entries(job.answers.vocab)) {
          if (!text.includes(de)) continue;
          const hit = choices.find((b) => norm(b.innerText) === norm(en));
          if (hit) return hit;
        }
        return null;
      }, 'a vocab card with a known answer');
      pick.click();
      await waitFor(() => /correct/i.test(pageText()), 'the graded card');
    },

    async translate(job) {
      await click('Translate');
      const mode = control('Fill the blanks');
      if (mode) {
        mode.click();
        await sleep(500);
      }
      const [en, words] = await waitFor(
        () => Object.entries(job.answers.translate).find(([e]) => pageText().includes(e)),
        'a translate prompt with a known answer'
      );
      const select = await waitFor(() => document.querySelector('select'), 'the blank');
      // Fill the first blank only: a partly completed exercise, not yet checked.
      setValue(select, words[0]);
      if (select.value !== words[0])
        throw new Error(`blank did not take "${words[0]}" for "${en}"`);
    },

    async chat(job) {
      await click('Chat');
      await click('Order Coffee scenario', { exact: false });
      const replies = () =>
        [...document.querySelectorAll('button[aria-label]')].filter((b) =>
          /^play .* response audio$/i.test(b.getAttribute('aria-label'))
        ).length;
      // The scene opener comes from the real AI flow.
      await waitFor(() => replies() >= 1 && !control('Try again'), 'the scene opener', 60000);
      const typeInstead = control('Type instead');
      if (typeInstead) {
        typeInstead.click();
        await sleep(400);
      }
      const input = await waitFor(
        () => document.querySelector('input[aria-label="Chat message in German"]'),
        'the chat input'
      );
      setValue(input, job.scene.message);
      await sleep(200);
      await click('Send chat message');
      await waitFor(() => replies() >= 2, 'the tutor reply', 90000);
      // The correction cue on the learner turn (InlineCorrection), not the
      // EN / IPA disclosures, which are collapsed buttons too.
      const cue = await waitFor(
        () =>
          [...document.querySelectorAll('button[aria-expanded="false"][aria-controls]')].find((b) =>
            norm(b.innerText).startsWith('needs a fix')
          ),
        'a correction on the learner turn',
        30000
      );
      cue.click();
      await waitFor(() => cue.getAttribute('aria-expanded') === 'true', 'the expanded correction');
      await sleep(400);
      cue.scrollIntoView({ block: 'center' });
    },
  };

  async function run() {
    const pendingId = sessionStorage.getItem(PENDING);
    if (!pendingId) {
      const next = await api('/next');
      if (next.done) return;
      localStorage.clear();
      for (const [k, v] of Object.entries(next.job.seed)) localStorage.setItem(k, v);
      sessionStorage.setItem(PENDING, next.job.scene.id);
      location.reload();
      return;
    }
    sessionStorage.removeItem(PENDING);
    const { job } = await api('/job', { id: pendingId });
    try {
      await enterApp();
      await SCENES[job.scene.id](job);
      await document.fonts.ready;
      await frames();
      await sleep(job.settleMs ?? 900);
      await api('/ready', { id: job.scene.id });
    } catch (err) {
      await api('/fail', { id: job.scene.id, error: String(err?.message ?? err) });
    }
    // Next scene: clean slate.
    run();
  }

  // Let the app mount first; the driver only ever clicks what a user could.
  setTimeout(() => run().catch((err) => api('/fail', { id: 'driver', error: String(err) })), 1500);
})();
