import LegalPage from './LegalPage';
import { lastUpdatedLine } from '../../lib/legalAcceptance';

/**
 * Account deletion — the public page Google Play's Data safety form links to.
 * Play requires it to name the app and developer, show how to request deletion
 * without the app, and say what is deleted and what is kept, for how long.
 * Owner-approved copy (2026-10-01), reproduced verbatim; the facts match the
 * Privacy Policy's sections 6 and 7.
 *
 * Not a versioned legal document: nobody accepts it, so editing it re-asks no
 * one. Bump the date below when the copy changes.
 */
const UPDATED = '2026-09-30';

const SECTIONS = [
  {
    heading: 'Delete it in the app',
    paragraphs: [
      'Sign in, go to Profile → Settings → Account controls, choose Delete account and confirm. Your account is deleted immediately and this cannot be undone.',
    ],
  },
  {
    heading: 'Ask us by email',
    paragraphs: [
      'Email sprachschule.support@gmail.com from the address you sign in with, with the subject "Account Deletion Request - Deutsch Sprachschule". If you sign in with Google or GitHub, use that account\'s email address.',
      'We may reply to confirm the request came from you. We will delete your account within 30 days and tell you when it is done.',
    ],
  },
  {
    heading: 'What is deleted',
    paragraphs: [
      'Your account and all data linked to it in our database: your email address and sign-in details, your profile and profile pictures, your learning data, problem reports you sent while signed in, notification tokens, and the record of which Terms and Privacy Policy versions you accepted.',
    ],
  },
  {
    heading: 'What is kept, and for how long',
    items: [
      { text: "Copies may remain for a limited time in our service providers' backups and logs." },
      {
        text: 'Usage-limit records are overwritten as new requests arrive; they are not currently deleted on a fixed schedule.',
      },
      {
        text: "Problem reports sent as a guest and error reports are not linked to your account, so we cannot find them to delete them; error reports expire under our error-monitoring provider's retention settings.",
      },
      {
        text: "Data stored on your own device is removed when you sign out, clear the app's data or uninstall the app.",
      },
    ],
  },
];

export default function DeleteAccountPage({ onBack }) {
  return (
    <LegalPage
      title="Delete your Deutsch Sprachschule account"
      updated={lastUpdatedLine(UPDATED)}
      intro="Deutsch Sprachschule is operated by Shimon Esterkin. You can delete your account and its data at any time — in the app, or by email without needing the app."
      sections={SECTIONS}
      onBack={onBack}
    />
  );
}
