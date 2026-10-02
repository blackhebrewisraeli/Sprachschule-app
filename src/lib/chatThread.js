// Pure helpers that turn the model's JSON replies and saved rows into the chat
// thread. They live outside ChatTab so a conversation resumed from history is
// rebuilt by exactly the code that renders a live one.

// The reply as the JSON object the prompt contracts for, fenced or not.
export const parseReply = (raw) => JSON.parse(raw.replace(/```json|```/g, '').trim());

export const errorReply = (err) => ({
  role: 'assistant',
  de: 'Entschuldigung, ein Fehler.',
  ipa: '[ɛntˈʃʊldɪɡʊŋ aɪ̯n ˈfeːlɐ]',
  en: 'Sorry — ' + err.message,
});

export const assistantTurn = (parsed) => ({
  role: 'assistant',
  de: parsed.de,
  ipa: parsed.ipa,
  en: parsed.en,
  next: parsed.next,
});

// What the model sees of a turn. Its own replies go back as the JSON it wrote,
// `next` included, so every example in its context keeps the full contract
// and it does not learn to drop the suggestion.
export const toHistory = (m) => ({
  role: m.role,
  content:
    m.role === 'user' ? m.de : JSON.stringify({ de: m.de, ipa: m.ipa, en: m.en, next: m.next }),
});

/**
 * Saved rows (ordered by seq) as the thread Chat renders.
 *
 * - A thread must start on a user turn, so leading assistant rows (a trimmed
 *   conversation can begin mid-way) are dropped.
 * - The scene kickoff stays as a hidden user turn, as it is live.
 * - Each reply is parsed exactly as it was live, and its `correction` is put
 *   back on the learner turn it answered. A reply that cannot be read renders
 *   the same apology a failed live turn does, never a crash.
 */
export function rowsToThread(rows) {
  const start = rows.findIndex((r) => r.role === 'user');
  if (start === -1) return [];
  const thread = [];
  for (const row of rows.slice(start)) {
    if (row.role === 'user') {
      thread.push(
        row.hidden
          ? { role: 'user', de: row.content, hidden: true }
          : { role: 'user', de: row.content }
      );
      continue;
    }
    let parsed;
    try {
      parsed = parseReply(row.content);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      thread.push(errorReply(new Error('this reply could not be read.')));
      continue;
    }
    for (let i = thread.length - 1; i >= 0; i -= 1) {
      if (thread[i].role === 'user') {
        // The scene kickoff is never graded, as live: the opener answers it.
        if (thread[i].hidden) break;
        thread[i] = { ...thread[i], graded: true, correction: parsed.correction || null };
        break;
      }
    }
    thread.push(assistantTurn(parsed));
  }
  return thread;
}
