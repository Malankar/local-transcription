# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # start Electron app in dev mode (hot-reload renderer)
pnpm build        # compile all three targets via electron-vite
pnpm typecheck    # type-check renderer+preload (tsconfig.json) and main (tsconfig.node.json)
pnpm dist         # build then package into AppImage via electron-builder
```

```bash
pnpm test                        # run Vitest test suite
pnpm vitest run --coverage       # run tests with v8 coverage report
```

Tests live in `test/` mirroring `src/` structure (main, preload, renderer). Vitest with jsdom environment. Typecheck is also a static validation step.

## Architecture

This is a local-first Electron desktop app. Audio is captured via `ffmpeg`, transcribed locally using **whisper.cpp** through the **`nodejs-whisper`** package (with an optional **NVIDIA Parakeet v3** path via Python + NeMo), and displayed in a React renderer. No cloud APIs.

### Three-layer Electron structure

```
src/main/       — Node.js main process (audio, inference, IPC, logging)
src/preload/    — contextBridge (exposes window.api to renderer)
src/renderer/   — React UI (reads window.api only, no Node access)
src/shared/     — Types shared across all three layers
```

### Data flow

1. `SourceDiscovery` calls `pactl list sources short` (Linux) to enumerate PulseAudio devices.
2. User picks a source and mode (`system` | `mic` | `mixed`); main process starts `AudioCapture` with a **chunking profile** (`meeting` = longer windows, `live` = shorter windows tuned for responsiveness vs throughput).
3. `AudioCapture` spawns `ffmpeg` via `spawn()`, reads raw PCM from stdout, and buffers it into bounded windows (`AudioChunk` with `Float32Array` audio at 16 kHz mono).
4. Each chunk is enqueued in `ChunkQueue`, which processes them **sequentially** (one at a time — no parallel fanout). Optional pipeline metrics (queue depth, per-chunk transcribe duration) are logged from main.
5. `ChunkQueue` calls `WhisperEngine.transcribe()`, which forwards the chunk to a forked child process (`whisperWorker.ts`) via IPC using the `WorkerRequest`/`WorkerResponse` protocol.
6. The worker writes PCM to a temporary WAV, runs **whisper.cpp** via `nodewhisper` (or Parakeet’s Python server when that engine is selected), parses JSON / NeMo output into `TranscriptSegment[]`. Whisper may use **CUDA** when `AppSettings.preferGpuAcceleration` is on and the catalog model supports GPU; failures fall back to CPU for the worker lifetime.
7. Segments are pushed to main-window state and sent to the renderer via `webContents.send('transcript:segment', segment)`.
8. The renderer subscribes through `window.api.onTranscriptSegment(...)` (set up in `src/preload/index.ts`).

### Key constraints

**`nodejs-whisper` is loaded in the worker via dynamic `import()`** from compiled ESM-friendly output; keep it **external to Vite** for the main bundle (see `rollupOptions.external` in `electron.vite.config.ts`).

**Sequential transcription queue is mandatory.** `ChunkQueue` enforces single-file processing via a `processing` flag so only one chunk is decoded at a time.

**ASAR unpacking for native addons.** If packaging pulls in native Node addons (e.g. future ONNX stacks), ensure `electron-builder.yml` `asarUnpack` covers them; the current primary runtime is whisper.cpp via `nodejs-whisper`.

### Process execution rule

All external process invocations (`ffmpeg`, `pactl`, `python3` for Parakeet) must use argument arrays: `spawn(cmd, args)`, `execFile(cmd, args)`, or `execFileSync(cmd, args)`. Source IDs and device names are user-facing values and must never be interpolated into a shell string.

### IPC channels

| Channel | Direction | Description |
|---|---|---|
| `sources:get` | invoke | Returns `AudioSource[]` from `SourceDiscovery` |
| `capture:start` | invoke | Starts `AudioCapture` with `CaptureStartOptions` |
| `capture:stop` | invoke | Stops capture |
| `export:txt` | invoke | Opens save dialog, writes plain text |
| `export:srt` | invoke | Opens save dialog, writes SRT |
| `models:getSelection` | invoke | Returns `{ meeting, live }` model ids |
| `models:selectForProfile` | invoke | Sets model id for `meeting` or `live` profile |
| `transcript:segment` | push → renderer | Delivers a `TranscriptSegment` |
| `status` | push → renderer | Delivers `AppStatus` (stage + detail string) |
| `capture:error` | push → renderer | Delivers an error message string |

(See `src/main/ipc/handlers.ts` and `src/preload/index.ts` for the full set, including history and settings.)

### Whisper worker protocol

`WhisperEngine` (main process) forks `whisper-worker.js` using `child_process.fork()` with `ELECTRON_RUN_AS_NODE=1`. Communication is typed via `WorkerRequest` / `WorkerResponse` in `src/main/transcription/workerProtocol.ts`. The worker lazily initializes on first `initialize` request and remains alive until shutdown or main `dispose()`.

### Adding a new IPC channel

Touch exactly three files: `src/main/ipc/handlers.ts` (add `ipcMain.handle`), `src/preload/index.ts` (expose via `contextBridge`), `src/shared/types.ts` (add to `LocalTranscribeApi` and any payload types). Also use the `/ipc-channel` skill.

## Platform support

Linux (PulseAudio/PipeWire) is the primary target. `SourceDiscovery` dispatches to `LinuxSources`, `MacSources`, and `WindowsSources` stubs — macOS and Windows adapters are not yet implemented. `AudioCapture` uses `pulse` as the ffmpeg input format, which is Linux-only in the current implementation.

## Runtime prerequisites

- `ffmpeg` installed and on PATH
- `pactl` available (Linux — part of PulseAudio/PipeWire utils)
- GGML weights for whisper.cpp models are downloaded from Hugging Face (managed models) on first use; sizes range from ~75 MB (`tiny.en`) upward
- Optional: NVIDIA GPU + drivers for CUDA-backed whisper or Parakeet; Parakeet additionally requires Python 3 with NeMo ASR dependencies

## Logs

Dev logs: `logs/localtranscribe.dev.log` (in project root).  
Packaged app logs: Electron's default `app.getPath('logs')` directory.
