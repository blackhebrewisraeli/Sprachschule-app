# App Store listing — English (U.S.)

Copy for App Store Connect. Every claim below is something the app ships
today; if a feature changes, change the copy with it. Apple's limits are in
brackets and the counts are checked, not estimated — re-run the check at the
bottom after editing.

## App Name [30]

**Deutsch: Learn German**

Alternates: `Deutsch — Learn German with AI` · `Deutsch: German with AI Tutor`

## Subtitle [30]

**AI tutor, chat & daily streaks**

Alternates: `Speak German with an AI tutor` · `Real conversations from day 1`

## Promotional Text [170]

Chat your way to real German. An AI tutor plays the barista, the check-in agent or a new friend, and corrects you as you go. New: four ways to translate.

## Description [4000]

Learn German by actually using it. Deutsch puts you in real conversations with an AI tutor from your very first day — and gives you just enough help to keep talking.

AN AI TUTOR THAT PLAYS ALONG
Order a coffee from a Berlin barista, check in at the airport, or meet someone new. Your tutor stays in character, answers in natural German at your level, and explains every correction in plain English. Stuck? Tap to build your reply from a word bank or fill in a single missing word, then graduate to writing freely as your confidence grows.

FIND YOUR LEVEL IN A MINUTE
A nine-question placement check puts you at A1, A2 or B1 — no account needed. Or skip it and start at the beginning.

PRACTICE THAT FITS THE WAY YOU LEARN
• Translate: assemble sentences from word tiles, pick or type the missing word, or translate freely and get AI grading that understands meaning, not just spelling. Switch the level of help any time.
• Vocabulary: spaced-repetition flashcards that bring words back right before you forget them, plus decks for grammar drills, your interests, and your own custom lists.
• Alphabet & listening: hear every letter and sound, and train your ear on the ones that are easy to confuse.
• Pronunciation guides: IPA for every word, and German speech at the tap of a button.

STAY MOTIVATED
• Earn XP as you practice and watch your level climb.
• Keep your daily streak alive — a streak freeze has your back on busy days.
• Three fresh daily quests and achievements to unlock.
• Join optional weekly leagues and climb from Bronze to Ruby.

MADE FOR REAL LIFE
• Try it before you sign up; create an account with a magic link or Google — no password to remember.
• Sign in to sync your progress across your phone, tablet and the web.
• Clean, focused design with light and dark modes.

Whether you're preparing for a move, a trip or an exam, or just want to finally understand the conversation around you, Deutsch turns a few minutes a day into German you can really use.

## Keywords [100]

`vocabulary,grammar,flashcards,conversation,speaking,beginner,A1,A2,B1,CEFR,language,translate,travel`

Name and subtitle words are indexed already, so they are not repeated here.
Competitor and exam-brand names are left out deliberately (App Review
Guideline 2.3.7).

## Checking the limits

```bash
node -e '
const md = require("fs").readFileSync("docs/store-metadata/app-store-listing.md", "utf8");
const section = (h) => md.split(`## ${h}`)[1].split("\n## ")[0].replace(/^ \[\d+\]\n/, "").trim();
const first = (s) => s.split("\n")[0].replace(/\*\*/g, "").replace(/`/g, "");
const rows = {
  "App Name (30)": first(section("App Name")),
  "Subtitle (30)": first(section("Subtitle")),
  "Promotional Text (170)": section("Promotional Text").replace(/\n/g, " "),
  "Description (4000)": section("Description"),
  "Keywords (100)": first(section("Keywords")),
};
for (const [k, v] of Object.entries(rows)) console.log(k, [...v].length);
'
```
