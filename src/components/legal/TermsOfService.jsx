import LegalPage from './LegalPage';
import { TERMS_VERSION, lastUpdatedLine } from '../../lib/legalAcceptance';

/**
 * Terms of Service. As with the privacy policy, the wording is owner-supplied
 * copy with the 2026-09-30 brand update and is reproduced verbatim.
 *
 * The source text numbers each clause with its heading on the same line
 * ("1. Eligibility: You must be…"). Splitting the label from the body keeps
 * the document navigable by heading without altering a word of it.
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
    ],
  },
  {
    heading: '3. App Usage and Leagues',
    paragraphs: [
      'sprachschule-app includes gamified elements like Leagues and Streaks. We reserve the right to reset, modify, or adjust league standings, points, or progression logic at any time, especially during this pre-beta phase, to ensure a fair experience for all users.',
    ],
  },
  {
    heading: '4. User-Generated Content',
    paragraphs: [
      'If you upload an avatar or any other content, you must ensure you have the rights to use it. We reserve the right to remove any content that is deemed inappropriate, offensive, or infringing on copyright.',
    ],
  },
  {
    heading: '5. "As Is" Disclaimer',
    paragraphs: [
      'sprachschule-app is currently in a pre-beta stage. The service is provided "AS IS" and "AS AVAILABLE," without warranties of any kind.',
    ],
  },
  {
    heading: '6. Changes to These Terms',
    paragraphs: [
      'We may update these Terms. When we do, we will update the "Last Updated" date and, for significant changes, ask you to accept the updated Terms before you continue using your account.',
    ],
  },
  {
    heading: '7. Privacy',
    paragraphs: ['Our Privacy Policy explains how we collect and use your information.'],
  },
  {
    heading: '8. AI-Generated Content',
    paragraphs: [
      'sprachschule-app uses artificial intelligence to generate tutor replies, answer feedback and practice content. AI-generated content can be inaccurate.',
    ],
  },
];

export default function TermsOfService({ onBack }) {
  return (
    <LegalPage
      title="Terms of Service"
      updated={lastUpdatedLine(TERMS_VERSION)}
      intro="By accessing or using sprachschule-app, you agree to be bound by these Terms of Service."
      sections={SECTIONS}
      onBack={onBack}
    />
  );
}
