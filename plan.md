# LocalTranscribe — Implementation Plan

## Goal

Build a local-first Electron desktop app that:

- captures system audio and/or mic audio
- transcribes locally with Whisper via `@huggingface/transformers`
- shows live transcript output
- exports TXT and SRT
- avoids cloud APIs entirely

Primary target for MVP: Linux desktop first, specifically Pop!_OS / PipeWire, while keeping the code layout ready for macOS and Windows adapters later.

---

## Compatibility Baseline (researched, early 2026)

### Electron status as of April 1, 2026

Currently supported stable Electron majors:

| Version | Node.js | Chromium | Released | Support ends |
|---|---|---|---|---|
| `41.1.0` | `24.14.0` | `146` | Mar 10, 2026 | Aug 25, 2026 |
| `40.8.5` | `24.14.0` | `144` | Jan 13, 2026 | Jun 30, 2026 |
| `39.8.5` | `22.22.1` | `142` | Oct 28, 2025 | May 5, 2026 |

Important context:

- Electron `34.x` and `35.x` are end-of-support now.
- They are still attractive for this project because they have more established Electron + `transformers.js` examples and avoid the newer Node 24 runtime line.
- The official Hugging Face Electron example currently tracks a newer Electron release, but that example follows upstream latest rather than a conservative compatibility target.

### Practical choice for this project

This plan intentionally uses:

- `electron@35.4.0`
- `electron-vite@5.0.0`
- `@huggingface/transformers@3.8.1`

Why:

- Electron `35.x` gives us a proven, well-documented compatibility point.
- `@huggingface/transformers@3.8.1` has more battle-tested Electron usage than `4.x`.
- `onnxruntime-node` on Electron `40/41` means Node 24 territory, which is not the safest place to begin unless we specifically validate it.

If we later want the lowest still-supported stable Electron line, the next upgrade target should be Electron `39.x`.

---

## Exact Versions

```json
{
  "dependencies": {
    "electron": "35.4.0",
    "@huggingface/transformers": "3.8.1"
  },
  "devDependencies": {
    "electron-vite": "5.0.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.6.0",
    "electron-builder": "^25.0.0",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1"
  }
}
```

Notes:

- `onnxruntime-node@1.21.0` comes in automatically through `@huggingface/transformers@3.8.1`.
- Do not add `onnxruntime-node` directly unless we deliberately need to override its version.
- `@huggingface/transformers` is ESM-only.

---

## Why This Stack

| Decision | Why |
|---|---|
| `@huggingface/transformers@3.8.1` | Best balance of Electron stability and Whisper support in early 2026 |
| Electron `35.4.0` | Conservative compatibility target for ONNX native runtime use |
| `electron-vite@5.0.0` | Current stable major, with dependency externalization built in |
| Main-process inference | Matches how Electron is detected by `transformers.js`, so `onnxruntime-node` is the correct backend |
| ffmpeg capture | Reliable cross-platform audio ingestion path |
| In-memory PCM chunks | No temp WAV churn between capture and transcription |

---

## Known Compatibility Rules

These are non-optional for this stack:

| Concern | Required handling |
|---|---|
| `@huggingface/transformers` is ESM-only | Use dynamic `await import('@huggingface/transformers')` from the Electron main process if the build output remains CJS |
| `onnxruntime-node` uses native `.node` binaries | Keep it external; do not bundle it into Vite output |
| Electron packaging with ASAR | Unpack `onnxruntime-node` and `.node` files into `app.asar.unpacked` |
| `electron-vite@5` | `externalizeDepsPlugin` is deprecated; use `build.externalizeDeps` and explicit `rollupOptions.external` safety net |
| pnpm layout | Add `shamefully-hoist=true` in `.npmrc` to avoid dependency resolution friction |
| Electron main process runtime | Keep output as CJS for now; load `transformers` with dynamic import |
| Parallel worker thread use with `onnxruntime-node` on Electron | Avoid parallel worker spawning; process chunks sequentially |

---

## Important Runtime Notes

### 1. Electron environment detection in `transformers.js`

There is an upstream issue where Electron is treated like Node.js. For this app that is fine, because our inference runs in the Electron main process and we want the Node backend, not renderer WebGPU.

### 2. `onnxruntime-node` and `electron-rebuild`

We generally should not need `electron-rebuild` for `onnxruntime-node` here because it ships prebuilt N-API binaries and ONNX Runtime documents Electron support for modern versions.

The real production failure mode is usually not ABI mismatch. It is this:

- the native `.node` binary gets packed into ASAR
- the packaged app fails to load the runtime

So the packaging config matters more than rebuilding.

### 3. Worker-thread crash risk

There is a known Electron + `onnxruntime-node` crash pattern when multiple Node worker threads are spawned in parallel on Windows. The safe MVP approach is:

- no parallel worker fanout
- sequential transcription queue
- conservative ONNX session settings if we later expose them:
  - `enableMemPattern: false`
  - `intraOpNumThreads: 1`

For the first version, our queue should stay single-file, single-worker, sequential.

---

## Recommended Scaffold

```bash
pnpm create @quick-start/electron@latest local-transcription --template react-ts
cd local-transcription
pnpm install
pnpm add electron@35.4.0
pnpm add @huggingface/transformers@3.8.1
```

If the scaffold prompts interactively:

- framework: `React`
- language: `TypeScript`
- updater plugin: `No`
- GitHub Actions workflow: `No`

---

## Required Config Files

### `.npmrc`

```ini
shamefully-hoist=true
```

### `electron.vite.config.ts`

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        // Safety net: keep native-runtime packages out of the bundle.
        external: [
          '@huggingface/transformers',
          'onnxruntime-node',
        ],
        output: {
          format: 'cjs',
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
})
```

Notes:

- `externalizeDepsPlugin` is intentionally not used.
- `electron-vite@5` externalizes dependencies by default, but we still list the critical runtime packages explicitly.
- Keeping main output as CJS is the least risky option for this app.

### `electron-builder.yml`

```yaml
appId: com.local-transcription.app
productName: LocalTranscribe
asar: true
asarUnpack:
  - "node_modules/onnxruntime-node/**"
  - "node_modules/@huggingface/transformers/**"
  - "**/*.node"
linux:
  target: AppImage
```

This `asarUnpack` block is mandatory for production packaging.

---

## Project Layout

```text
local-transcription/
├── .npmrc
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── electron.vite.config.ts
├── electron-builder.yml
└── src/
    ├── main/
    │   ├── index.ts
    │   ├── audio/
    │   │   ├── AudioCapture.ts
    │   │   ├── SourceDiscovery.ts
    │   │   └── sources/
    │   │       ├── LinuxSources.ts
    │   │       ├── MacSources.ts
    │   │       └── WindowsSources.ts
    │   ├── transcription/
    │   │   ├── WhisperEngine.ts
    │   │   └── ChunkQueue.ts
    │   └── ipc/
    │       └── handlers.ts
    ├── preload/
    │   └── index.ts
    └── renderer/
        ├── index.html
        └── src/
            ├── App.tsx
            ├── main.tsx
            ├── env.d.ts
            └── types.ts
```

---

## Architecture Decisions

### Audio capture

- use `ffmpeg`
- capture raw PCM from stdout
- normalize to `Float32Array`
- feed Whisper in-memory

### Inference

- run Whisper in the Electron main process
- load `@huggingface/transformers` with dynamic import
- keep one initialized inference pipeline
- process chunks sequentially

### UI

- React renderer
- IPC bridge through preload
- transcript list with timestamps
- export TXT / SRT after capture stops

---

## Safe Process Execution Rule

Do not use `child_process.exec()` for anything that includes user-derived values like source IDs, device names, or CLI arguments.

Preferred patterns:

- `spawn(command, args)`
- `execFile(command, args)`
- `execFileSync(command, args)`

Reason:

- avoids shell interpolation
- avoids command injection risk
- works better for ffmpeg and pactl-style argument arrays

For this codebase, every external process invocation should be argument-array based.

---

## Implementation Steps

## Step 0 — Prerequisites

```bash
node --version
pnpm --version
ffmpeg -version
pactl --version
```

Target expectations:

- Node `20.19+` or `22.12+` for `electron-vite@5`
- `ffmpeg` installed
- `pactl` available on Linux

Linux install if needed:

```bash
sudo apt install ffmpeg
```

## Step 1 — Shared types

Create transcript and audio-source types once and share them between renderer and main.

```ts
export type AudioSourceMode = 'system' | 'mic' | 'mixed'

export interface AudioSource {
  id: string
  label: string
  isMonitor: boolean
}

export interface TranscriptSegment {
  id: string
  startMs: number
  endMs: number
  text: string
  timestamp: Date
}
```

## Step 2 — Source discovery

Linux first:

- use `pactl list sources short`
- classify `.monitor` sources as system-output captures
- classify the rest as mic inputs

Use `execFileSync('pactl', ['list', 'sources', 'short'])`, not shell commands.

macOS and Windows can remain adapter stubs initially.

## Step 3 — Audio capture

Build an `AudioCapture` class that:

- launches `ffmpeg` with `spawn()`
- reads `stdout`
- chunks PCM into fixed 5-second windows
- converts `s16le` to `Float32Array`
- emits chunk events

Linux modes:

- `system`: monitor source
- `mic`: mic source
- `mixed`: monitor + mic via `amix`

All ffmpeg arguments must be built as string arrays.

## Step 4 — Whisper engine

Build a `WhisperEngine` class that:

- lazy-loads `@huggingface/transformers` via dynamic import
- initializes one ASR pipeline
- uses CPU backend in the Electron main process
- returns timestamped transcript chunks

Recommended starting model:

- `Xenova/distil-whisper-small.en`

Reason:

- good CPU tradeoff
- English-first
- smaller and faster than larger Whisper variants

## Step 5 — Sequential queue

Build a FIFO `ChunkQueue` that:

- accepts audio chunks
- processes one chunk at a time
- emits transcript segments back to the window

This is both simpler and safer for `onnxruntime-node`.

## Step 6 — IPC handlers

Expose handlers for:

- `sources:get`
- `capture:start`
- `capture:stop`
- `export:txt`
- `export:srt`

Also forward events for:

- model status
- capture errors
- transcript segment delivery

## Step 7 — Main process wiring

Main process responsibilities:

- create the browser window
- instantiate capture, engine, and queue
- register IPC handlers
- shut down cleanly

## Step 8 — Preload API

Expose a narrow `window.api` surface:

- get sources
- start capture
- stop capture
- export TXT
- export SRT
- subscribe to transcript updates
- subscribe to status and error events

## Step 9 — Renderer

The MVP renderer should provide:

- source selection
- capture mode selector
- start / stop control
- loading state while model initializes
- transcript list
- clear transcript button
- export buttons

No design polish requirement yet; functionality first.

---

## Example `WhisperEngine` pattern

```ts
type HFPipeline = (
  audio: Float32Array,
  options: { sampling_rate: number; return_timestamps: boolean }
) => Promise<{ chunks?: Array<{ timestamp: [number, number]; text: string }> }>

export class WhisperEngine {
  private pipe: HFPipeline | null = null

  async initialize(): Promise<void> {
    const { pipeline } = await import('@huggingface/transformers')

    this.pipe = await pipeline(
      'automatic-speech-recognition',
      'Xenova/distil-whisper-small.en',
      {
        dtype: 'q8',
        device: 'cpu',
      }
    ) as unknown as HFPipeline
  }

  async transcribe(audio: Float32Array) {
    if (!this.pipe) throw new Error('WhisperEngine not initialized')

    return this.pipe(audio, {
      sampling_rate: 16000,
      return_timestamps: true,
    })
  }
}
```

This is the key interoperability pattern:

- main build stays CJS
- `transformers` stays external
- runtime uses dynamic import

---

## Verification Checklist

After implementation, verify:

1. `pnpm dev` launches the Electron window.
2. Linux source discovery shows real monitor and mic devices.
3. First capture triggers model download and initialization.
4. Transcript text appears after the first audio chunk finishes processing.
5. Stop capture terminates ffmpeg cleanly.
6. TXT export writes plain transcript text.
7. SRT export writes valid timestamps.
8. Packaged app still works and does not fail to load `onnxruntime-node`.

Packaging check is critical because dev mode can work while the packaged app fails if `asarUnpack` is wrong.

---

## Risks To Watch

| Risk | Mitigation |
|---|---|
| Electron `35.x` is out of support | Accept for MVP compatibility; upgrade to `39.x` later once the app is stable |
| Packaged app fails to load ONNX runtime | Keep `onnxruntime-node` unpacked via `asarUnpack` |
| Vite accidentally bundles runtime deps | Explicit `rollupOptions.external` entries |
| ESM/CJS mismatch in main process | Dynamic `import()` for `@huggingface/transformers` |
| Slow CPU transcription | Start with `distil-whisper-small.en`; keep chunking sequential and model conservative |
| `onnxruntime-node` thread instability | No parallel worker fanout in MVP |

---

## Final Recommendation

For the first build, stay conservative:

- Electron `35.4.0`
- `electron-vite@5.0.0`
- `@huggingface/transformers@3.8.1`
- main-process inference
- CJS main output plus dynamic `import()`
- externalized native dependencies
- mandatory ASAR unpacking
- sequential transcription queue

This is the lowest-risk path to getting a working local transcription desktop app shipped quickly.
