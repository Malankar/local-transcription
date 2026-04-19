/** System prompt for session title LLM; keep in sync with tests in `titlePrompt.test.ts`. */
export const TITLE_SYSTEM_PROMPT =
  'You output ONLY a short meeting title: 4–10 words. Must name a concrete subject (product, team, decision, or deliverable). ' +
  'Ban vague-only titles: do not use alone words like "Discussion", "Meeting", "Update", "Session", "Chat", "Call", "Sync" without a specific topic. ' +
  'No quotes. No punctuation at the end. No explanation.'
