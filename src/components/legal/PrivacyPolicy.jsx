import LegalPage from './LegalPage';
import { PRIVACY_VERSION, lastUpdatedLine } from '../../lib/legalAcceptance';

/**
 * Privacy Policy. The wording is supplied copy and is reproduced verbatim —
 * treat it as a legal text, not as UI copy to be tightened. Structure is the
 * only thing this file decides.
 */
const SECTIONS = [
  {
    heading: '1. Who We Are',
    paragraphs: [
      'sprachschule-app is operated by Shimon Esterkin. If you have questions about this policy or your data, contact us at sprachschule.support@gmail.com.',
    ],
  },
  {
    heading: '2. Information We Collect',
    items: [
      {
        term: 'Using the App as a Guest:',
        text: 'You can use sprachschule-app without an account. As a guest, your learning progress is stored only on your device and is not synced to our servers.',
      },
      {
        term: 'Account Information:',
        text: 'When you create an account or sign in — with a one-time email code or link, with Google, or with GitHub — we collect your email address to authenticate you and keep your progress in sync across devices. If you sign in with Google or GitHub, that service also shares the basic profile details it makes available to apps, such as your name, profile picture link and, for GitHub, your username; our authentication provider stores them with your account. For security, it also records technical information about each sign-in, such as your IP address and browser or device type. We also record which versions of our Terms of Service and this Privacy Policy you accepted, and when.',
      },
      {
        term: 'Profile Information:',
        text: 'Your account has a handle (username), created automatically when you sign up, which you can change. You can also add your first, middle and last name and a profile picture, and choose whether your profile is private.',
      },
      {
        term: 'Learning Data:',
        text: 'We store your vocabulary progress, exercise results, daily activity, streaks, XP, custom decks, preferences (such as your level, daily goal and interests) and in-app token history locally on your device. When you are signed in, we sync this data to our cloud database.',
      },
      {
        term: 'AI Features:',
        text: 'When you use an AI-powered feature — chatting with the tutor, having a written answer checked, generating practice sentences or creating a custom deck — the text you enter, together with the exercise or conversation context needed to respond, is sent through our server to Anthropic, which generates the response. We do not send your name, email address or account ID with these requests.',
      },
      {
        term: 'Saved Tutor Conversations (optional):',
        text: 'If you are signed in and turn on "Save my tutor conversations" in Settings, we store the conversations you have with the tutor — what you write and the tutor\'s replies — in our database, linked to your account, so that you can read them again, continue them on any device and delete them. This is off unless you turn it on, and we do not save a tutor conversation before you do. Conversations you have as a guest are never saved.',
      },
      {
        term: 'Voice Input:',
        text: "If you use voice input, speech recognition is performed by your browser or your device's operating system, which may send your audio to its provider (such as Google or Apple) under that provider's terms. The app receives only the resulting text.",
      },
      {
        term: 'Problem Reports:',
        text: 'If you report a problem with an exercise, we store your message together with details of the exercise (such as the level, deck and item) and, if you are signed in, your account ID.',
      },
      {
        term: 'Error Reports:',
        text: 'When the website encounters an error, it sends a report to Sentry with technical details such as the error message, recent app events leading up to it, the page address, your browser type, language and time zone. We configure Sentry not to attach your account ID or email address, and we remove cookies and web-address parameters that could contain sign-in credentials before a report is sent. Sentry receives your IP address when a report is sent and may use it to estimate your approximate location. Sentry also receives an anonymous signal when the app starts, which we use to measure how often sessions end in an error.',
      },
      {
        term: 'Website Analytics:',
        text: 'On the website, we use Vercel Web Analytics and Vercel Speed Insights to understand how the site is used and how quickly it loads, such as pages visited, the referring site, device and browser type, approximate country and page-load measurements. These tools do not use cookies.',
      },
      {
        term: 'Usage Limits:',
        text: 'To protect the service from abuse and to apply daily limits to AI features, our server records your IP address (if you use AI features without an account) or your account ID (if you are signed in), together with a count of your AI requests for the current day. Short-term request counters used to block bursts of traffic are kept alongside them.',
      },
      {
        term: 'Push Notifications (mobile app only):',
        text: "If you turn on push notifications, the app obtains a notification token for your device from Apple Push Notification service (on iPhone and iPad) or Firebase Cloud Messaging (on Android) and stores it in our database, together with your device's platform and a link to your account, so that we can send you streak reminders and league updates.",
      },
    ],
  },
  {
    heading: '3. How We Use Your Information',
    paragraphs: [
      "Your data is used to provide the app's features: saving and syncing your progress, placing you in weekly leagues (Leagues), showing your profile to other learners, powering AI features, sending notifications you have turned on, fixing bugs, and protecting the service from abuse. We do not sell your data or use it for targeted advertising. If you choose to save your tutor conversations, we use them only to show them back to you. We do not use them to train AI models, for advertising or to build profiles, and we do not read them except where needed to investigate abuse of the service or to respond to a legal request.",
    ],
  },
  {
    heading: '4. What Other Learners Can See',
    paragraphs: [
      'If you have an account, other signed-in learners in your league can see your handle, profile picture and weekly XP. Signed-in learners can also find you by name or handle, follow you, and view your profile: your name, handle, profile picture, the year you joined and your learning statistics (such as total XP, longest streak, league results, achievements and follower counts). If you make your profile private, you are hidden from search and your profile shows only your name, handle and profile picture. Profile pictures are stored at hard-to-guess web addresses that anyone who has the address can open.',
    ],
  },
  {
    heading: '5. Service Providers',
    paragraphs: [
      'We rely on the following services to run the app. They process data on our behalf:',
    ],
    items: [
      { term: 'Supabase —', text: 'authentication, database and file storage' },
      { term: 'Vercel —', text: 'hosting the website and our server, and website analytics' },
      {
        term: 'Anthropic —',
        text: 'AI tutor responses, answer checking and practice content',
      },
      { term: 'Sentry —', text: 'error reports' },
      { term: 'Supabase Auth —', text: 'sending sign-in emails' },
    ],
    after: [
      'If you choose to use them, these services also receive data under their own privacy policies: Google or GitHub (if you sign in with them), and Apple Push Notification service or Firebase Cloud Messaging by Google (if you turn on push notifications).',
    ],
  },
  {
    heading: '6. How Long We Keep Your Data',
    items: [
      {
        text: "Guest data stays on your device until you clear the app's data or sign in, at which point it is added to your account.",
      },
      {
        text: "Signing out removes your account's data from that device; only your light/dark theme choice stays.",
      },
      {
        text: 'Account data — including your email, profile, learning data, problem reports, notification tokens and acceptance records — is kept until you delete your account.',
      },
      {
        text: 'Saved tutor conversations are deleted automatically about 90 days after the last message in them. We keep at most 20 conversations of up to 50 messages each for your account; when you go past a limit, the oldest messages, or the conversation you used least recently, are removed.',
      },
      {
        text: 'Daily AI usage counts are deleted automatically once they are about two days old, and any daily AI limit grants after 30 days. Short-term burst-protection counters are overwritten as new requests arrive and are not deleted on a fixed schedule.',
      },
      {
        text: "Error reports, website analytics and data processed by our service providers are kept for limited periods under those providers' retention settings.",
      },
    ],
  },
  {
    heading: '7. Exporting and Deleting Your Data',
    paragraphs: [
      "You can download a copy of your learning data, including your saved tutor conversations, and permanently delete your account, in the app under Profile → Settings → Account controls. You can also delete one saved conversation, or all of them, without deleting your account: in Chat → History, or in Settings → Account → Tutor conversations. Deleting your account immediately and permanently removes your account and the data linked to it in our database, including your learning data, profile, problem reports, saved tutor conversations, notification tokens and acceptance records. We also delete the profile pictures you uploaded; if any remain afterwards, contact us and we will remove them. Copies may remain for a limited time in our service providers' backups and logs. Problem reports you sent as a guest and error reports are not linked to your account.",
    ],
  },
  {
    heading: '8. Your Choices',
    items: [
      {
        term: 'Push notifications are optional',
        text: "and are not required to use the app. You can turn them off at any time in the app (Settings → Notifications) or in your device's settings.",
      },
      {
        text: "When you turn notifications off in the app or sign out, the app deletes your device's notification token from our database and deactivates it on your device. If the app cannot reach our servers at that moment, the token is still deactivated on your device, but a copy can remain in our database until your account is deleted. If you turn notifications off in your device's settings instead, the app removes the token from our database the next time you open it while signed in. Deleting your account always deletes all of your notification tokens.",
      },
      {
        term: 'Saving tutor conversations is optional',
        text: 'and is off unless you turn it on. You can turn it off at any time in Settings → Account → Tutor conversations; new conversations stop being saved straight away. Conversations already saved stay until you delete them or they expire, as described above.',
      },
      {
        text: 'You can edit your name, handle and profile picture, and make your profile private, in Settings.',
      },
    ],
  },
  {
    heading: '9. Changes to This Policy',
    paragraphs: [
      'When we change this policy, we will update the "Last Updated" date above. If the changes are significant, we will ask you to review and accept the updated policy in the app before you continue using your account.',
    ],
  },
];

export default function PrivacyPolicy({ onBack }) {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={lastUpdatedLine(PRIVACY_VERSION)}
      intro="Welcome to sprachschule-app. This Privacy Policy explains how we collect, use, and protect your information when you use our application."
      sections={SECTIONS}
      onBack={onBack}
    />
  );
}
