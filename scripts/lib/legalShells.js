// Static HTML shells for the three compliance routes.
//
// The app is client-rendered, so a cold GET of /delete-account used to return
// the generic app shell: <title>sprachschule-app</title> and an empty #root.
// Anything that reads the page without running JavaScript (a store-review
// crawler, a link unfurler, a text browser) saw no app name, no developer and
// no deletion steps, which is exactly what Google Play's account-deletion
// check looks for. These shells give each route its own title, description,
// canonical URL and a <noscript> statement of the facts, in the same HTML the
// server sends. The real page is unchanged: the same bundle loads and the
// router renders the full text on top.
//
// The privacy policy and terms are supplied legal copy, so their shells carry
// only a pointer, never a summary. The deletion page repeats just the facts
// Google requires; legalShells.test.js pins each against DeleteAccountPage.jsx
// so the two cannot drift.
const ORIGIN = 'https://www.sprachschule-app.com';
const CONTACT = 'sprachschule.support@gmail.com';

export const LEGAL_SHELLS = {
  privacy: {
    path: '/privacy',
    title: 'Privacy Policy — Deutsch Sprachschule',
    description: 'How Deutsch Sprachschule collects, uses and protects your information.',
    noscript: [
      'Privacy Policy — Deutsch Sprachschule',
      `Deutsch Sprachschule is operated by Shimon Esterkin. This page needs JavaScript to show the full policy. Questions: ${CONTACT}.`,
    ],
  },
  terms: {
    path: '/terms',
    title: 'Terms of Service — Deutsch Sprachschule',
    description: 'The terms for using Deutsch Sprachschule.',
    noscript: [
      'Terms of Service — Deutsch Sprachschule',
      `Deutsch Sprachschule is operated by Shimon Esterkin. This page needs JavaScript to show the full terms. Questions: ${CONTACT}.`,
    ],
  },
  'delete-account': {
    path: '/delete-account',
    title: 'Delete your Deutsch Sprachschule account',
    description:
      'How to delete your Deutsch Sprachschule account and its data, in the app or by email.',
    noscript: [
      'Delete your Deutsch Sprachschule account',
      'Deutsch Sprachschule is operated by Shimon Esterkin. You can delete your account and its data at any time — in the app, or by email without needing the app.',
      'In the app: sign in, go to Profile → Settings → Account controls, choose Delete account and confirm.',
      `By email: write to ${CONTACT} from the address you sign in with, with the subject "Account Deletion Request - Deutsch Sprachschule". We will delete your account within 30 days and tell you when it is done.`,
      'If you hid your email when signing in with Apple, write from any address and include your private relay address (it ends in @privaterelay.appleid.com); we will confirm by writing to it.',
      'This page needs JavaScript to show what is deleted and what is kept, and for how long.',
    ],
  },
};

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Replace the content attribute of the tag identified by `marker`, failing
// loudly if index.html changed shape: a silent no-op would ship the generic
// shell again with nothing to say so.
function setMeta(html, marker, value) {
  const re = new RegExp(`(${marker}[^>]*?content=")[^"]*(")`, 's');
  if (!re.test(html)) throw new Error(`legalShells: index.html has no ${marker}`);
  return html.replace(re, `$1${escapeHtml(value)}$2`);
}

/** index.html with one route's own head metadata and noscript statement. */
export function renderLegalShell(indexHtml, route) {
  const shell = LEGAL_SHELLS[route];
  if (!shell) throw new Error(`legalShells: unknown route ${route}`);
  const url = `${ORIGIN}${shell.path}`;
  let html = indexHtml;
  if (!/<title>[^<]*<\/title>/.test(html))
    throw new Error('legalShells: index.html has no <title>');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(shell.title)}</title>`);
  html = setMeta(html, 'name="description"', shell.description);
  html = setMeta(html, 'property="og:title"', shell.title);
  html = setMeta(html, 'property="og:description"', shell.description);
  html = setMeta(html, 'property="og:url"', url);
  html = setMeta(html, 'name="twitter:title"', shell.title);
  html = setMeta(html, 'name="twitter:description"', shell.description);
  const canonical = /(<link rel="canonical" href=")[^"]*(")/;
  if (!canonical.test(html)) throw new Error('legalShells: index.html has no canonical link');
  html = html.replace(canonical, `$1${url}$2`);

  const [heading, ...paragraphs] = shell.noscript;
  const body = `<noscript><main><h1>${escapeHtml(heading)}</h1>${paragraphs
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('')}</main></noscript>`;
  if (!/<div id="root">/.test(html)) throw new Error('legalShells: index.html has no #root');
  return html.replace('<div id="root">', `${body}<div id="root">`);
}
