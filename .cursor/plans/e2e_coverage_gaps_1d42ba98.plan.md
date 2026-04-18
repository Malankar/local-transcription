---
name: E2E coverage gaps
overview: Inventory of what existing Playwright Electron e2e already covers, versus main/renderer/IPC features and user flows that lack e2e (or are explicitly excluded). Includes feasibility notes per gap (easy Playwright vs. hard/OS-specific vs. blocked on missing UI/wiring).
todos:
  - id: export-srt-e2e
    content: Add library e2e for Export SRT (mirror TXT flow; assert file or IPC result if exposed)
    status: pending
  - id: history-prune-e2e
    content: Seed N sessions + change history settings; assert list pruning (optionally extend e2e IPC for bulk seed / fixed dates)
    status: pending
  - id: settings-restart-e2e
    content: "Optional: launchApp({ userDataDir }) reuse + relaunch to assert persisted settings"
    status: pending
  - id: record-modes-e2e
    content: "Optional: System/Mixed lifecycle tests with same skip pattern as Mic"
    status: pending
  - id: shortcut-live-wiring
    content: "Product fix first: preload/renderer subscribe to shortcut:voice-to-text + live UI if desired; then e2e"
    status: pending
isProject: false
---

# E2E coverage gap report (Playwright + Electron)

## How e2e runs today

- **Runner**: [`playwright.config.ts`](playwright.config.ts) → `e2e/*.spec.ts`, **workers: 1**, **120s** default timeout ([`models-settings.spec.ts`](e2e/models-settings.spec.ts) uses **300s** for downloads).
- **Launch**: [`e2e/fixtures/launchApp.ts`](e2e/fixtures/launchApp.ts) uses Playwright **`_electron.launch`** against [`out/main/index.js`](out/main/index.js), fresh `--user-data-dir` per run, sets **`E2E_QUIT_ON_LAST_WINDOW=1`** (enables [`e2e:seedHistoryMeeting`](src/main/ipc/handlers.ts) and **auto export path** in [`exportTranscript`](src/main/ipc/handlers.ts) — skips real `dialog.showSaveDialog` during e2e).

## Already covered (high level)

| Area | Specs | Notes |
|------|--------|--------|
| Smoke / shell | [`app-smoke.spec.ts`](e2e/app-smoke.spec.ts), [`navigation.spec.ts`](e2e/navigation.spec.ts) | Window, `#root`, Record/Library, Settings open/close |
| Auto-navigation | [`navigation-behavior.spec.ts`](e2e/navigation-behavior.spec.ts) | Record while capturing; post-meeting → Library when segments exist |
| Record gating | [`record-gating.spec.ts`](e2e/record-gating.spec.ts) | No model / incomplete sources copy; Settings link |
| Sources UI | [`record-sources.spec.ts`](e2e/record-sources.spec.ts) | System/Mic/Mixed + Refresh |
| Meeting lifecycle | [`record-meeting-lifecycle.spec.ts`](e2e/record-meeting-lifecycle.spec.ts) | Start/stop, timer, completion card / library list (**skips** if no model/mic/saved session) |
| Library empty | [`library-empty-list.spec.ts`](e2e/library-empty-list.spec.ts) | Fresh profile empty state |
| Library transcript | [`library-transcript.spec.ts`](e2e/library-transcript.spec.ts) | Summary, Copy → Copied!, **Export TXT**, Delete |
| Library assistant UI | [`library-assistant.spec.ts`](e2e/library-assistant.spec.ts) | Mock chat, session switch ([`ChatAssistant`](src/renderer/src/components/ChatAssistant.tsx) is **timeout mock**, not real IPC) |
| Seeded library | [`transcribe-to-library.spec.ts`](e2e/transcribe-to-library.spec.ts) | `e2eSeedHistoryMeeting` + preview in Quick Summary |
| Settings — General | [`settings-general.spec.ts`](e2e/settings-general.spec.ts) | Start hidden, launch startup, tray (Linux hint), idle unload select, shortcut capture UI, mute toggle |
| Settings — History | [`settings-history.spec.ts`](e2e/settings-history.spec.ts) | Session limit, auto-delete, keep starred — **UI only** (select/switch visible state) |
| Settings — Assistant flags | [`settings-assistant-integrations.spec.ts`](e2e/settings-assistant-integrations.spec.ts) | Provider select, external assistant + integrations toggles (**[`UiFeatureFlags`](src/shared/types.ts)** notes assistant IPC not wired) |
| Models | [`models-settings.spec.ts`](e2e/models-settings.spec.ts) | Card selection, cancel download alert, full download → Ready → Remove |

## Explicitly out of scope (documented in repo)

[`playwright.config.ts`](playwright.config.ts) comment lists **manual / OS integration** not covered: **tray** show/hide and **menu** actions, **global voice shortcut while unfocused**, **start-hidden / minimize-to-tray** launch, **single-instance**. These are **possible** with Playwright only in limited ways (e.g. tray/menu often need OS-specific automation or `electronApp.evaluate`); global shortcuts need **real key events outside** the window — flaky / environment-dependent.

---

## Gaps: what is not meaningfully tested in e2e

### 1. Library — Export SRT (and any VTT story)

- **UI**: [`TranscriptViewer`](src/renderer/src/components/TranscriptViewer.tsx) exposes **Export SRT** when `onExportSrt` is set; [`LibrarySurface`](src/renderer/src/components/LibrarySurface.tsx) wires it via `exportSessionSrt`.
- **e2e**: [`library-transcript.spec.ts`](e2e/library-transcript.spec.ts) only clicks **Export TXT**.
- **Playwright**: **Yes** — same pattern as TXT: click **Export SRT**, optionally read file from returned path if you add a small **`e2e`-only invoke** or assert via main-process log (today export writes to tmp under `E2E_QUIT_ON_LAST_WINDOW`).
- **VTT**: Main has [`export:vtt`](src/main/ipc/handlers.ts) / [`history:export:vtt`](src/main/ipc/handlers.ts) but **[`preload`](src/preload/index.ts)** and **[`LocalTranscribeApi`](src/shared/types.ts)** expose **no** `exportVtt` — **no renderer path**; e2e N/A until API + UI exist.

### 2. History pruning / session limit / auto-delete (behavior, not just controls)

- **Code**: [`settings:set`](src/main/ipc/handlers.ts) calls [`historyManager.pruneHistory`](src/main/history/HistoryManager.ts) when history-related keys change.
- **e2e**: Only verifies **dropdowns/switches** update in [`settings-history.spec.ts`](e2e/settings-history.spec.ts).
- **Playwright**: **Yes**, with setup cost: seed **multiple** sessions (repeat `e2eSeedHistoryMeeting` or extend IPC to bulk-seed), change **history limit** / **auto-delete**, assert **sidebar count** / specific sessions removed. May need **deterministic timestamps** (new handler or clock injection) for age-based policies.
- **Note**: Each `launchApp()` uses a **new** `userDataDir` — persistence **across restarts** is untested unless fixture reuses dir.

### 3. Settings persistence across app restart

- **e2e**: Never relaunches with same `userDataDir`.
- **Playwright**: **Yes** — extend [`launchApp`](e2e/fixtures/launchApp.ts) to accept optional **fixed** profile dir, set a setting, **close + relaunch**, assert value.

### 4. Record — audio modes and device combinations

- **e2e**: [`record-meeting-lifecycle.spec.ts`](e2e/record-meeting-lifecycle.spec.ts) clicks **Mic** tab then records; **System** / **Mixed** paths not exercised end-to-end.
- **Playwright**: **Yes** where devices exist; **No** guarantee on CI (no monitor/mic) — keep **conditional skip** like today.

### 5. Error surfaces (`capture:error`, failed `startCapture`)

- **Code**: [`RecordingContext`](src/renderer/src/contexts/RecordingContext.tsx) sets `errorMessage` on failure; [`RecordSurface`](src/renderer/src/components/RecordSurface.tsx) does not obviously surface all errors in snippet reviewed — worth checking if **toast / banner** exists for user-visible errors.
- **Playwright**: **Yes** if UI shows message — e.g. force **`capture:start`** error via **no model** (partially covered by gating copy, not necessarily `errorMessage` path) or inject via **`evaluate`** calling API with invalid state.

### 6. Status / processing UX (non-happy path)

- Stages like **`discovering`**, **`processing`**, chunk queue **error** ([`handlers` / `ChunkQueue`](src/main/transcription/ChunkQueue.ts) — non-fatal) are **not** asserted in e2e.
- **Playwright**: **Partially** — can assert **status text** if stable; **processing** may be **fast/flaky** without synthetic delay or mock engine.

### 7. “Live” capture profile + global shortcut **start**

- **Backend**: [`capture:profile`](src/main/audio/AudioCapture.ts) **`live`** vs **`meeting`**, [`TranscriptContext`](src/renderer/src/contexts/TranscriptContext.tsx) **`liveSegments`**.
- **UI**: [`RecordSurface`](src/renderer/src/components/RecordSurface.tsx) only calls **`startCapture('meeting')`** — **no live button**.
- **Main**: [`applyVoiceShortcut`](src/main/index.ts) on start sends **`shortcut:voice-to-text`** to renderer.
- **Renderer**: **No** `ipcRenderer.on('shortcut:voice-to-text')` / preload subscription — **shortcut start path appears unwired** (stop path may still run from main).
- **e2e**: **N/A** for live until UI + IPC wiring exist; shortcut e2e blocked by config + missing listener.

### 8. Dead / unused surface (unit tests only)

- **[`HistoryView`](src/renderer/src/components/HistoryView.tsx)** / **[`HistorySidebarArchive`](src/renderer/src/components/HistorySidebarArchive.tsx)**: **not imported** in [`AppShell`](src/renderer/src/components/AppShell.tsx) — e2e correctly ignores; **renderer unit tests** cover them.
- **`starHistorySession`**: IPC + preload exist; **no Library UI** calls it — feature **incomplete**; e2e should wait for UI or test only IPC via **`evaluate`**.

### 9. Import file

- **UI**: Disabled [**Import File**](src/renderer/src/components/RecordSurface.tsx) (“not available in this build”) — e2e already touches **disabled** state via [`record-gating.spec.ts`](e2e/record-gating.spec.ts).

### 10. Model idle unload (real time)

- **Main**: [`scheduleModelUnload`](src/main/index.ts) after **minutes**.
- **Playwright**: **Impractical** at real time; would need **test hook** (e.g. env to shorten interval) or **unit/integration** test in main process.

### 11. Real assistant / external providers

- **Types** say assistant is **UI-only** ([`UiFeatureFlags`](src/shared/types.ts)); **ChatAssistant** is **mock**. No real e2e until IPC + keys + network policy.

---

## Playwright feasibility summary

| Gap | Playwright feasible? |
|-----|----------------------|
| Export SRT in Library | Yes |
| Prune / limit / auto-delete behavior | Yes (with seed + maybe time control) |
| Settings persist across restart | Yes (reuse `userDataDir`) |
| System/Mixed recording | Yes if devices exist |
| Live profile + shortcut start | No until renderer wiring + UI |
| Tray / global shortcut unfocused | Hard / manual (as config says) |
| Model unload timer | Only with test hooks or non-e2e tests |
| VTT export | No UI/API in renderer yet |

---

## Skills (optional) for executing test work later

- **[`using-superpowers`](~/.agents/skills/using-superpowers/SKILL.md)** — habit: pick skills (`dispatching-parallel-agents`, `verification-before-completion`) before large multi-spec work.
- **[`dispatching-parallel-agents`](~/.agents/skills/dispatching-parallel-agents/SKILL.md)** — parallelize **independent** new specs (e.g. export SRT vs. settings persistence) **after** shared fixture changes land (today **workers: 1** is config-level; parallel agents still help author/review).
- **[`verification-before-completion`](~/.agents/skills/verification-before-completion/SKILL.md)** — run `pnpm test:e2e` (or targeted `playwright test e2e/foo.spec.ts`) before claiming coverage complete.

No code changes in this step; this is a read-only gap analysis aligned with the current tree.
