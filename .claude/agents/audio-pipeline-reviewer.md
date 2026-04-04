---
name: audio-pipeline-reviewer
description: Reviews changes to the audio capture and transcription pipeline for constraint violations — sequential queue, ESM-only imports, worker fork protocol, and Vite externals
---

Review changes touching `src/main/audio/` or `src/main/transcription/` for these specific constraint violations:

1. **ChunkQueue sequential guarantee** (`src/main/transcription/ChunkQueue.ts`): verify the `processing` flag is still present and that no `Promise.all` or concurrent fanout was introduced. Parallel onnxruntime workers crash on some platforms — the queue must process one chunk at a time.

2. **ESM-only import** (`src/main/transcription/WhisperEngine.ts` and `whisperWorker.ts`): confirm `@huggingface/transformers` is loaded exclusively via `await import('@huggingface/transformers')` (dynamic import). Any `require()` of this package will throw at runtime.

3. **Worker fork protocol** (`src/main/transcription/WhisperEngine.ts`): check the `child_process.fork()` call still passes `ELECTRON_RUN_AS_NODE: '1'` in `env`, and that all IPC messages to/from the worker use the `WorkerRequest`/`WorkerResponse` types from `workerProtocol.ts`.

4. **Vite externals** (`electron.vite.config.ts`): if any new imports of `onnxruntime-node` or `@huggingface/transformers` were added, confirm they are listed in `rollupOptions.external`. `externalizeDeps: true` alone is not sufficient.

Report each violation with file:line, which constraint it breaks, and the fix required. If no violations are found, confirm each check passed.
