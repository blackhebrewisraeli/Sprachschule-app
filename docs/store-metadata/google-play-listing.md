# Google Play listing — English (United States)

Copy for the Play Console Main store listing. Every product claim below must
remain true in the submitted Android build. Google Play's current limits are
30 characters for the app name, 80 for the short description and 4,000 for the
full description.

## App name [30]

**Deutsch Sprachschule**

This exact name also appears on the public account-deletion page, as required
by `docs/STORE_SUBMISSION_CHECKLIST.md` item 6.

## Short description [80]

**Learn German with an AI tutor, smart practice, vocabulary and daily streaks.**

## Full description [4000]

Turn a few minutes a day into German you can actually use. Deutsch
Sprachschule combines guided practice with an AI tutor, so you can build a
foundation and start having useful conversations from the beginning.

PRACTISE REAL CONVERSATIONS

Order a coffee from a Berlin barista, check in at the airport or meet someone
new. The AI tutor stays in character, replies in natural German at your level
and explains corrections in plain English. If you get stuck, build your answer
from a word bank, fill in a missing word or move on to free writing when you
feel ready.

FIND THE RIGHT STARTING POINT

Take a nine-question placement check for A1, A2 or B1, or skip it and begin at
the first level. No account is required to try the app.

BUILD EVERY LANGUAGE SKILL

• Translate with word tiles, multiple choice, fill-in-the-blank exercises and
free typing with AI-assisted grading.

• Review vocabulary with spaced-repetition flashcards and focused decks for
useful themes, grammar and your own interests.

• Learn the German alphabet and hear letters, words and pronunciation at the
tap of a button.

• Use IPA pronunciation guides to understand how unfamiliar words sound.

STAY MOTIVATED

• Earn XP, complete daily goals and watch your level grow.

• Build a daily streak and earn streak freezes for busy days.

• Complete three daily quests and unlock achievements.

• Join optional weekly leagues and progress from Bronze to Ruby.

LEARN YOUR WAY

Try the core experience before creating an account. Sign in with a magic link
or Google to sync progress across supported devices. Light and dark modes keep
the interface focused and comfortable throughout the day.

Whether you are preparing for travel, relocation or an exam—or simply want to
understand more German—Deutsch Sprachschule gives you structured practice and
room to speak for yourself.

## Store contact fields

- **Support email:** `sprachschule.support@gmail.com`
- **Website:** `https://www.sprachschule-app.com`
- **Privacy policy:** `https://www.sprachschule-app.com/privacy`
- **Account deletion:** `https://www.sprachschule-app.com/delete-account`

## Checking the limits

```bash
node -e '
const md = require("fs").readFileSync("docs/store-metadata/google-play-listing.md", "utf8");
const section = (h) => md.split(`## ${h}`)[1].split("\n## ")[0].replace(/^ \[\d+\]\n/, "").trim();
const first = (s) => s.split("\n")[0].replace(/\*\*/g, "");
const rows = {
  "App name (30)": first(section("App name")),
  "Short description (80)": first(section("Short description")),
  "Full description (4000)": section("Full description"),
};
for (const [label, value] of Object.entries(rows)) console.log(label, [...value].length);
'
```

## Sources

- [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en-en)
  — official field definitions and character limits; accessed 2026-10-01.
- [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842?hl=en)
  — title and description restrictions; accessed 2026-10-01.
- [Store-listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en-EN)
  — accurate, succinct copy and avoiding repetition; accessed 2026-10-01.
