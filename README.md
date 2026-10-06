# LocalTranscribe

A local-first Electron desktop app for real-time speech transcription — no cloud APIs, no data leaving your machine.

Captures system audio and/or microphone input, transcribes it with on-device speech models (Nemotron, Parakeet, Whisper and more), and shows a live timestamped transcript you can export or search.

## Features

- **Local transcription** — Nemotron, Parakeet, Whisper, Moonshine, SenseVoice and Canary run entirely on-device via `sherpa-onnx`
- **Word-by-word live text** — with Nemotron Streaming selected, words appear while you speak; other models transcribe each phrase as soon as you pause (Silero VAD)
- **Multi-source audio** — system audio, microphone, or both simultaneously
- **Language picker** — for multilingual models (Whisper Turbo, Canary, SenseVoice); defaults to English
- **Transcript history** — persistent sessions with search and export (TXT, SRT)
- **AI summaries** — optional auto-generated titles and summaries via Ollama
- **Voice-to-text shortcut** — configurable global hotkey (default: `Meta+V`)
- **Auto-pruning** — configurable session limits; starred sessions are exempt

## Platform status

| Platform | Status |
|---|---|
| macOS 14.2+ | Supported. Mic and system audio (Core Audio taps, no extra drivers). |
| macOS ≤ 14.1 | Mic works; system audio needs [BlackHole](https://github.com/ExistentialAudio/BlackHole). |
| Linux | Not yet verified. Needs PulseAudio or PipeWire with `pactl`; the bundled ffmpeg may lack PulseAudio input. |
| Windows | Audio capture is not implemented yet. |

Builds are unsigned until signing secrets are configured (see [RELEASING.md](RELEASING.md)): macOS shows an "unidentified developer" warning, Windows shows SmartScreen.

## Requirements (development)

- Node.js 22+
- pnpm 10
- [Ollama](https://ollama.com) (optional — for AI title/summary generation)

FFmpeg (via `ffmpeg-static`), the speech engine (via `sherpa-onnx-node`) and the Silero VAD model ship inside the app; speech models download from the in-app model picker and are checked against their published SHA-256.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start in development mode
pnpm dev
```

On first use, the app will prompt you to download a speech model. Nemotron Streaming (English) is recommended; Parakeet v2 is the most accurate English model if you don't need word-by-word text.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Build the app |
| `pnpm dist` | Package for the current platform (`dist:mac`, `dist:win`, `dist:linux` for a specific one) |
| `pnpm typecheck` | Run TypeScript type checks |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Unit tests in watch mode |
| `pnpm test:e2e` | End-to-end tests (requires a prior build) |
| `pnpm test:all` | Unit + E2E tests |

## Project Structure

```
src/
├── main/               # Electron main process
│   ├── audio/          # FFmpeg capture and device discovery
│   ├── transcription/  # Model catalog/downloads, worker process (VAD + sherpa-onnx)
│   ├── assistant/      # Ollama client and tool orchestration
│   ├── history/        # Session storage
│   ├── export/         # TXT and SRT export
│   ├── settings/       # Persistent settings
│   └── ipc/            # IPC channel handlers
├── preload/            # Secure IPC bridge
├── renderer/           # React UI
└── shared/             # Types shared between processes
```

## Architecture Notes

- Transcription runs in a forked worker process to keep the UI responsive. Capture streams 100 ms PCM frames to it; the worker either feeds a streaming model directly or cuts phrases with Silero VAD and decodes each one.
- The worker handles messages strictly in order (no parallel inference); when it falls more than a few seconds behind live audio, the UI says so.
- The model starts loading when the record screen opens, and audio captured before it's ready is buffered, not dropped.
- Native binaries (`sherpa-onnx`, `ffmpeg-static`, `audiotee`) are unpacked from ASAR so they can be loaded at runtime.
- The renderer communicates with the main process exclusively through the typed IPC bridge in `src/preload/`.

## Tech Stack

- **Electron 43** + **electron-vite**
- **React 18** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** + **Radix UI**
- **sherpa-onnx** (speech recognition: Nemotron Streaming, Parakeet, Whisper, Moonshine, SenseVoice, Canary; Silero VAD)
- **electron-updater** (auto-updates from GitHub Releases)
- **Ollama** (optional local LLM)
- **Vitest** (unit tests) + **Playwright** (E2E tests)
