/**
 * Hardcoded local assistant stack (Ollama). Users do not pick per-task models in UI.
 *
 * Title: very small / fast instruct model (Meta Llama 3.2 1B — common Ollama name, ~1.3GB).
 * Summary + Library chat: same small instruct model with stronger text (Qwen 2.5 3B — good speed/quality on CPU/GPU).
 *
 * @see https://ollama.com/library/llama3.2
 * @see https://ollama.com/library/qwen2.5
 */
export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

/** Fast title generation */
export const ASSISTANT_OLLAMA_MODEL_TITLE = 'llama3.2:1b'

/** Summary + transcript Q&A (same model for both) */
export const ASSISTANT_OLLAMA_MODEL_CHAT = 'qwen2.5:3b'

export const ASSISTANT_OLLAMA_MODELS_TO_PULL = [
  { id: ASSISTANT_OLLAMA_MODEL_TITLE, role: 'Titles (fast)' },
  { id: ASSISTANT_OLLAMA_MODEL_CHAT, role: 'Summary & chat' },
] as const
