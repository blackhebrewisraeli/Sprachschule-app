import LegalPage from './LegalPage';
import { TERMS_VERSION, lastUpdatedLine } from '../../lib/legalAcceptance';

/**
 * Terms of Service. As with the privacy policy, the wording is owner-approved
 * legal text (2026-10-06 store-submission revision) — treat it as a legal
 * text, not as UI copy to be tightened.
 *
 * Each clause carries its number in its heading ("1. Eligibility") so the
 * document stays navigable by heading.
 */
const SECTIONS = [
  {
    heading: '1. Eligibility',
    paragraphs: [
      'You must be at least 13 years old to use this app. By creating an account, you confirm that you meet this age requirement.',
    ],
  },
  {
    heading: '2. User Accounts',
    paragraphs: [
      "You are responsible for maintaining the security of your account. We reserve the right to suspend or terminate accounts that violate these terms or abuse the platform's systems.",
      'You sign in with a one-time email code or link, or with Apple, Google or GitHub, so anyone who can read your email or use that account can sign in as you. Keep them secure, and tell us at sprachschule.support@gmail.com if you think someone else has used your account.',
    ],
  },
  {
    heading: '3. Acceptable Use',
    paragraphs: ['When you use Deutsch Sprachschule, you agree not to:'],
    items: [
      { text: "break the law or infringe anyone else's rights;" },
      {
        text: 'harass, threaten or impersonate others, or use a handle, name, profile picture or other content that is hateful, sexually explicit or otherwise offensive;',
      },
      {
        text: 'cheat or manipulate XP, streaks or league standings, for example with scripts, bots or multiple accounts;',
      },
      {
        text: "try to get around usage limits, access other people's accounts or data, or probe, disrupt or overload our servers;",
      },
      {
        text: 'use the AI features to create unlawful or harmful content, or for purposes unrelated to learning;',
      },
      {
        text: 'copy, scrape, resell or reverse engineer the app, except where the law allows it.',
      },
    ],
  },
  {
    heading: '4. App Usage and Leagues',
    paragraphs: [
      'Deutsch Sprachschule includes gamified elements like Leagues and Streaks. We reserve the right to reset, modify, or adjust league standings, points, or progression logic at any time, especially during this pre-beta phase, to ensure a fair experience for all users.',
    ],
  },
  {
    heading: '5. User-Generated Content',
    paragraphs: [
      'If you upload an avatar or any other content, you must ensure you have the rights to use it. We reserve the right to remove any content that is deemed inappropriate, offensive, or infringing on copyright.',
      'You keep ownership of the content you create, such as your handle, name, profile picture, custom decks and messages. You give us a worldwide, non-exclusive, royalty-free licence to store, copy, display and process that content only as needed to run the app — for example, to show your profile to other learners or to send your messages to our AI provider for a reply. This licence ends when you delete the content or your account, except for copies kept for a limited time in backups, as described in our Privacy Policy.',
    ],
  },
  {
    heading: '6. Our Content and Intellectual Property',
    paragraphs: [
      'The app — including its software, design, the Deutsch Sprachschule name and logo, and the exercises, explanations and other learning material we create — belongs to us or our licensors and is protected by intellectual property laws. Some vocabulary and phrases come from open sources such as Wiktionary, Tatoeba, the Leipzig Corpora Collection and Wikivoyage, and remain available under their own open licences, which the app credits.',
      'We give you a personal, non-exclusive, non-transferable licence to use the app for your own non-commercial learning, in line with these Terms. We may end this licence if you break these Terms.',
    ],
  },
  {
    heading: '7. AI-Generated Content',
    paragraphs: [
      'Deutsch Sprachschule uses artificial intelligence to generate tutor replies, answer feedback and practice content. AI-generated content can be inaccurate.',
      'Use it as a learning aid, not as professional advice: do not rely on it alone for important matters such as official exams, translations of legal, medical or immigration documents, or decisions about your health, money or legal status. Do not enter sensitive personal information into the AI features.',
    ],
  },
  {
    heading: '8. Termination',
    paragraphs: [
      'You can stop using the app at any time, and delete your account in Profile → Settings → Account controls or as described at www.sprachschule-app.com/delete-account.',
      'We may suspend or close your account, or remove your content, if you seriously or repeatedly break these Terms, if the law requires it, or to protect other learners or the service. Where reasonable, we will tell you why. We may also change, suspend or discontinue the app or any feature; if we shut the app down, we will try to give you reasonable notice so you can download your data.',
      'Sections 6, 9, 10 and 11 continue to apply after your account is closed.',
    ],
  },
  {
    heading: '9. "As Is" Disclaimer',
    paragraphs: [
      'Deutsch Sprachschule is currently in a pre-beta stage. The service is provided "AS IS" and "AS AVAILABLE," without warranties of any kind.',
      'To the fullest extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy and non-infringement. We do not promise that the app will be uninterrupted, error-free or secure, that your progress will never be lost, or that using it will lead to any particular learning result.',
    ],
  },
  {
    heading: '10. Limitation of Liability',
    paragraphs: [
      'To the fullest extent permitted by law, we are not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of data, progress, streaks, XP, profits or goodwill, arising out of or relating to your use of, or inability to use, the app. Our total liability for any claim relating to the app is limited to the amount you paid us, if any, for the app in the 12 months before the claim.',
      'Some jurisdictions do not allow certain warranties to be excluded or liability to be limited, so some of these limitations may not apply to you. Nothing in these Terms limits any rights you have under consumer-protection laws that cannot be waived.',
    ],
  },
  {
    heading: '11. App Stores',
    paragraphs: [
      "If you downloaded the app from Apple's App Store or Google Play, these Terms are between you and us, not Apple or Google, and we — not they — are responsible for the app and its content. Apple and Google have no obligation to provide maintenance or support for the app and are not responsible for any claims relating to it. Your use of the app must also follow the store's own terms. Apple and its subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.",
    ],
  },
  {
    heading: '12. Changes to These Terms',
    paragraphs: [
      'We may update these Terms. When we do, we will update the "Last Updated" date and, for significant changes, ask you to accept the updated Terms before you continue using your account.',
    ],
  },
  {
    heading: '13. Privacy',
    paragraphs: [
      'Our Privacy Policy explains how we collect and use your information. You can read it at www.sprachschule-app.com/privacy.',
    ],
  },
  {
    heading: '14. Contact',
    paragraphs: [
      'Deutsch Sprachschule is operated by Shimon Esterkin. If you have questions about these Terms, contact us at sprachschule.support@gmail.com.',
    ],
  },
];

export default function TermsOfService({ onBack }) {
  return (
    <LegalPage
      title="Terms of Service"
      updated={lastUpdatedLine(TERMS_VERSION)}
      intro="By accessing or using Deutsch Sprachschule, you agree to be bound by these Terms of Service."
      sections={SECTIONS}
      onBack={onBack}
    />
  );
}
