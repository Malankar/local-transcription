# LocalTranscribe

A local-first Electron desktop app for real-time speech transcription — no cloud APIs, no data leaving your machine.

Captures system audio and/or microphone input, transcribes it using OpenAI Whisper running locally, and shows a live timestamped transcript you can export or search.

## Features

- **Local transcription** — Whisper runs entirely on-device via `nodejs-whisper`
- **Multi-source audio** — system audio, microphone, or both simultaneously
- **Live and meeting modes** — streaming output or 4-second chunked capture
- **Transcript history** — persistent sessions with search and export (TXT, SRT)
- **AI summaries** — optional auto-generated titles and summaries via Ollama
- **Voice-to-text shortcut** — configurable global hotkey (default: `Meta+V`)
- **Auto-pruning** — configurable session limits; starred sessions are exempt

## Requirements

- Node.js 20+
- pnpm
- FFmpeg
- PulseAudio or PipeWire with `pactl` (Linux)
- [Ollama](https://ollama.com) (optional — for AI title/summary generation)

```bash
# Ubuntu/Debian
sudo apt install ffmpeg
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start in development mode
pnpm dev
```

On first use, the app will prompt you to download a Whisper model.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Build the app |
| `pnpm dist` | Package as a distributable (Linux AppImage) |
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
│   ├── transcription/  # Whisper engine, chunk queue, worker thread
│   ├── assistant/      # Ollama client and tool orchestration
│   ├── history/        # Session storage
│   ├── export/         # TXT and SRT export
│   ├── settings/       # Persistent settings
│   ├── dictation/      # Voice-to-text hotkey
│   └── ipc/            # IPC channel handlers
├── preload/            # Secure IPC bridge
├── renderer/           # React UI
└── shared/             # Types shared between processes
```

## Architecture Notes

- Transcription runs in a dedicated worker thread to keep the UI responsive.
- Audio chunks are processed through a sequential queue — parallel inference is avoided because ONNX/Whisper workers are not thread-safe.
- `nodejs-whisper` and native `.node` files are unpacked from ASAR at runtime so the native binaries remain accessible.
- The renderer communicates with the main process exclusively through the typed IPC bridge in `src/preload/`.

## Tech Stack

- **Electron 35** + **electron-vite**
- **React 18** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** + **Radix UI**
- **nodejs-whisper** (Whisper transcription)
- **Ollama** (optional local LLM)
- **Vitest** (unit tests) + **Playwright** (E2E tests)
