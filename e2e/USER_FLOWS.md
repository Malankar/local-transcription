# E2E user flows (Playwright + Electron)

Reference map: **what each spec file exercises** from a product/user perspective. Implementation lives under `e2e/*.spec.ts`; launcher and env in `e2e/fixtures/launchApp.ts`.

**Runner notes** (see `playwright.config.ts`): workers `1`, long timeouts; some specs are `@slow` or skip when no model/mic/system device. **Not automated here**: tray/menu, global shortcut while unfocused, start-hidden cold launch, single-instance lock.

| Spec | User flow |
|------|-----------|
| `app-smoke.spec.ts` | App opens: window title, `#root`, switch Record ↔ Library, open Settings dialog and dismiss. |
| `navigation.spec.ts` | Same shell navigation smoke: Record surface, Library empty state, Settings open/close. |
| `navigation-behavior.spec.ts` | While recording: Library tab still shows in-progress; after stop, lands on Library / “Recording saved” when capture produced segments (skips if no model/mic). |
| `record-gating.spec.ts` | Without a local model: Start Recording disabled + copy; with model: incomplete sources message; Import File disabled; can open Settings from gating. |
| `record-sources.spec.ts` | Record surface: switch Mic / System / Mixed, Refresh sources. |
| `record-meeting-lifecycle.spec.ts` | Mic path: Start → timer moves → Stop → saved card or Library list (skips if model/devices/session save unavailable). |
| `record-system-mixed-lifecycle.spec.ts` | System-only and Mixed sources: same start/stop → Library happy path when devices allow (conditional skip). |
| `library-empty-list.spec.ts` | Fresh profile: Library shows “No saved sessions yet.” |
| `library-transcript.spec.ts` | Seeded session: Quick Summary, Copy → “Copied!”, Export TXT + delete back to empty; Export SRT writes auto e2e path with valid cue timestamps + seed line in file. |
| `transcribe-to-library.spec.ts` | `e2eSeedHistoryMeeting`: session appears in sidebar with label, Quick Summary shows preview text. |
| `library-assistant.spec.ts` | Library: mock assistant chat send/receive; switching session clears chat (stub assistant, not real network). |
| `library-ai-title-loader.spec.ts` | After seed, Library shows “Generating recording title” then title settles (`E2E_ASSISTANT_DELAY_MS`). |
| `library-history-prune.spec.ts` | Settings History: lower **session limit** → oldest meetings removed from disk + sidebar after reload; **Keep latest N** auto-delete → same; **NEW**: with **Keep starred recordings** on, star oldest via API → limit prune drops only non-starred overflow so **six** sessions remain and oldest marker still present. |
| `settings-general.spec.ts` | General: Start hidden toggle, launch at startup, tray hint (Linux), idle-unload dropdown, shortcut capture row, mute toggle interactions as asserted in spec. |
| `settings-history.spec.ts` | History section: session limit combobox, auto-delete combobox, keep-starred switch — **UI state only** (no prune behavior). |
| `settings-assistant-integrations.spec.ts` | Assistant provider + external assistant + integrations toggles (feature-flag UI; backend not wired). |
| `settings-persist-restart.spec.ts` | Toggle Start hidden, quit app, relaunch with **same** `userDataDir`, assert switch + `getSettings()` still on. |
| `models-settings.spec.ts` | Models section: select card, cancel download dialog, full download to Ready, Remove model. |

## New flow (this batch)

- **Starred session exempt from session-limit prune**: User keeps “Keep starred recordings” enabled (default), stars the oldest meeting (today via `starHistorySession` in e2e; Library UI for star may come later), lowers session limit — expect one fewer deletion than unstarred case so starred content remains in Library.
