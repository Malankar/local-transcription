# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Electron app in dev mode (hot-reload renderer)
pnpm build        # compile all three targets via electron-vite
pnpm typecheck    # type-check renderer+preload (tsconfig.json) and main (tsconfig.node.json)
pnpm dist         # build then package into AppImage via electron-builder
```

There is no test suite. Typecheck is the primary static validation step.

## Architecture

This is a local-first Electron desktop app. Audio is captured via `ffmpeg`, transcribed locally using Whisper (via `@huggingface/transformers`), and displayed in a React renderer. No cloud APIs.

### Three-layer Electron structure

```
src/main/       — Node.js main process (audio, inference, IPC, logging)
src/preload/    — contextBridge (exposes window.api to renderer)
src/renderer/   — React UI (reads window.api only, no Node access)
src/shared/     — Types shared across all three layers
```

### Data flow

1. `SourceDiscovery` calls `pactl list sources short` (Linux) to enumerate PulseAudio devices.
2. User picks a source and mode (`system` | `mic` | `mixed`); main process starts `AudioCapture`.
3. `AudioCapture` spawns `ffmpeg` via `spawn()`, reads raw PCM from stdout, and buffers it into 5-second `Float32Array` chunks (`AudioChunk`).
4. Each chunk is enqueued in `ChunkQueue`, which processes them **sequentially** (one at a time — no parallel fanout).
5. `ChunkQueue` calls `WhisperEngine.transcribe()`, which forwards the chunk to a forked child process (`whisperWorker.ts`) via IPC using the `WorkerRequest`/`WorkerResponse` protocol.
6. The worker runs `@huggingface/transformers` ASR pipeline (model: `Xenova/whisper-small.en`, dtype `q8`, device `cpu`) and returns `TranscriptSegment[]`.
7. Segments are pushed to main-window state and sent to the renderer via `webContents.send('transcript:segment', segment)`.
8. The renderer subscribes through `window.api.onTranscriptSegment(...)` (set up in `src/preload/index.ts`).

### Key constraints

**`@huggingface/transformers` is ESM-only.** The main process output is CJS. Load it exclusively with `await import('@huggingface/transformers')` (dynamic import) — never `require()`.

**`onnxruntime-node` and `@huggingface/transformers` must never be bundled by Vite.** Both are listed in `rollupOptions.external` in `electron.vite.config.ts`. Vite's `externalizeDeps: true` alone is not sufficient — the explicit external list is the safety net.

**Sequential transcription queue is mandatory.** Parallel `onnxruntime-node` worker threads crash on some platforms. `ChunkQueue` enforces single-file processing via a `processing` flag.

**ASAR unpacking is required for packaging.** `electron-builder.yml` specifies `asarUnpack` for `onnxruntime-node`, `@huggingface/transformers`, and all `.node` binaries. Removing or narrowing this will cause the packaged app to fail at runtime even though dev mode works.

### Process execution rule

All external process invocations (`ffmpeg`, `pactl`) must use argument arrays: `spawn(cmd, args)`, `execFile(cmd, args)`, or `execFileSync(cmd, args)`. Source IDs and device names are user-facing values and must never be interpolated into a shell string.

### IPC channels

| Channel | Direction | Description |
|---|---|---|
| `sources:get` | invoke | Returns `AudioSource[]` from `SourceDiscovery` |
| `capture:start` | invoke | Starts `AudioCapture` with `CaptureStartOptions` |
| `capture:stop` | invoke | Stops capture |
| `export:txt` | invoke | Opens save dialog, writes plain text |
| `export:srt` | invoke | Opens save dialog, writes SRT |
| `transcript:segment` | push → renderer | Delivers a `TranscriptSegment` |
| `status` | push → renderer | Delivers `AppStatus` (stage + detail string) |
| `capture:error` | push → renderer | Delivers an error message string |

### Whisper worker protocol

`WhisperEngine` (main process) forks `whisperWorker.js` using `child_process.fork()` with `ELECTRON_RUN_AS_NODE=1`. Communication is typed via `WorkerRequest` / `WorkerResponse` in `src/main/transcription/workerProtocol.ts`. The worker lazily initializes the pipeline on first `initialize` request and remains alive for the session lifetime.

### Adding a new IPC channel

Touch exactly three files: `src/main/ipc/handlers.ts` (add `ipcMain.handle`), `src/preload/index.ts` (expose via `contextBridge`), `src/shared/types.ts` (add to `LocalTranscribeApi` and any payload types). Also use the `/ipc-channel` skill.

## Platform support

Linux (PulseAudio/PipeWire) is the primary target. `SourceDiscovery` dispatches to `LinuxSources`, `MacSources`, and `WindowsSources` stubs — macOS and Windows adapters are not yet implemented. `AudioCapture` uses `pulse` as the ffmpeg input format, which is Linux-only in the current implementation.

## Runtime prerequisites

- `ffmpeg` installed and on PATH
- `pactl` available (Linux — part of PulseAudio/PipeWire utils)
- Model weights are downloaded from Hugging Face on first run (~250 MB for `whisper-small.en`)

## Logs

Dev logs: `logs/localtranscribe.dev.log` (in project root).  
Packaged app logs: Electron's default `app.getPath('logs')` directory.
