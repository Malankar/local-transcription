/**
 * Hardcoded local assistant stack (Ollama). Users do not pick per-task models in UI.
 *
 * Title: small instruct model (Llama 3.2 3B — better specificity than 1B, still light).
 * Summary + transcript Q&A: Qwen 2.5 7B — stronger local answers vs 3B; needs more RAM/VRAM.
 *
 * @see https://ollama.com/library/llama3.2
 * @see https://ollama.com/library/qwen2.5
 */
export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

/** Title generation (fast, constrained decoding) */
export const ASSISTANT_OLLAMA_MODEL_TITLE = 'llama3.2:3b'

/** Summary + transcript Q&A */
export const ASSISTANT_OLLAMA_MODEL_CHAT = 'qwen2.5:7b'

/** Passed to Ollama `/api/chat` options for title jobs */
export const ASSISTANT_OLLAMA_TITLE_OPTIONS = {
  temperature: 0.1,
  num_predict: 48,
  top_p: 0.85,
  repeat_penalty: 1.2,
  /** Title must fail fast if Ollama is stuck so Library does not spin forever. */
  timeoutMs: 120_000,
} as const

/** Summary bullets */
export const ASSISTANT_OLLAMA_SUMMARY_OPTIONS = {
  temperature: 0.2,
  num_predict: 900,
  top_p: 0.9,
  repeat_penalty: 1.1,
  timeoutMs: 240_000,
} as const

/** Main assistant reply (longer generations). */
export const ASSISTANT_OLLAMA_CHAT_TIMEOUT_MS = 300_000

/** Tool-decision pass before optional web search. */
export const ASSISTANT_OLLAMA_TOOL_DECISION_TIMEOUT_MS = 90_000

export const ASSISTANT_OLLAMA_MODELS_TO_PULL = [
  { id: ASSISTANT_OLLAMA_MODEL_TITLE, role: 'Titles (fast)' },
  { id: ASSISTANT_OLLAMA_MODEL_CHAT, role: 'Summary & chat' },
] as const
