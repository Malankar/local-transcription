/**
 * Hardcoded local assistant stack (Ollama). Users do not pick per-task models in UI.
 *
 * Title: small instruct model (Llama 3.2 3B — better specificity than 1B, still light).
 * Summary + transcript Q&A: Qwen 2.5 7B — stronger local answers vs 3B; needs more RAM/VRAM.
 * Thinking mode: Qwen 3 8B — hybrid thinking/non-thinking model; supports Ollama `think` param.
 *
 * @see https://ollama.com/library/llama3.2
 * @see https://ollama.com/library/qwen2.5
 * @see https://ollama.com/library/qwen3
 * @see https://docs.ollama.com/capabilities/thinking
 */
export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

/** Title generation (fast, constrained decoding) */
export const ASSISTANT_OLLAMA_MODEL_TITLE = 'llama3.2:3b'

/** Summary + transcript Q&A (standard, non-thinking) */
export const ASSISTANT_OLLAMA_MODEL_CHAT = 'qwen2.5:7b'

/**
 * Thinking-mode Q&A. Must be a hybrid model that supports Ollama's `think` parameter
 * (i.e. thinking can be toggled on/off — NOT a thinking-only model like qwen3:8b-instruct
 * which ignores `think: false`).
 *
 * qwen3:8b is the recommended choice: it supports `/think` and `/no_think` and responds
 * well to `think: true` via the chat API.
 */
export const ASSISTANT_OLLAMA_MODEL_CHAT_THINKING = 'qwen3:8b'

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

export const ASSISTANT_OLLAMA_MODELS_TO_PULL = [
  { id: ASSISTANT_OLLAMA_MODEL_TITLE, role: 'Titles (fast)' },
  { id: ASSISTANT_OLLAMA_MODEL_CHAT, role: 'Summary & chat' },
  { id: ASSISTANT_OLLAMA_MODEL_CHAT_THINKING, role: 'Thinking mode (Q&A)' },
] as const
