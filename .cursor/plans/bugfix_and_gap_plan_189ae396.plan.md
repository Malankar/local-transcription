---
name: Bugfix and gap plan
overview: Severity-labeled backlog of concrete bugs and gaps found in code/logs, with a recommended implementation order. Duplicate history AI resume will move to main-process startup once (your choice); other items are ordered by impact.
todos:
  - id: resume-startup
    content: Move scheduleResumePendingHistoryEnrichment to app.whenReady (once); remove from history:list; optional enrichmentInFlight race fix
    status: completed
  - id: tray-linux-png
    content: "Fix Linux tray: PNG/ICNS fallback so icon is not empty"
    status: completed
  - id: electron-upgrade
    content: Plan/execute Electron 39.x (or chosen) upgrade with native dep validation
    status: completed
  - id: prod-csp
    content: Add packaged-renderer CSP; keep dev permissive if needed for Vite
    status: completed
  - id: sources-debounce
    content: (Optional) Single-flight or debounce getSources in RecordingContext for Strict Mode
    status: completed
  - id: segment-filter
    content: (Optional) Filter hallucinated whisper segments before emit/history
    status: completed
isProject: false
---

# Bug and gap remediation plan

## How this was stress-tested (grill-me style)

- **Coupling**: Side effect on `history:list` ([`src/main/ipc/handlers.ts`](src/main/ipc/handlers.ts) ~186–193) interacts with renderer lifecycle; React 18 Strict Mode ([`src/renderer/src/main.tsx`](src/renderer/src/main.tsx)) double-invokes `useEffect` → duplicate IPC → duplicate logs (see [`logs/localtranscribe.dev.log`](logs/localtranscribe.dev.log) duplicate `Resuming pending history AI enrichment` at same ms).
- **Race**: [`enrichmentInFlight`](src/main/assistant/enrichHistorySession.ts) checks `has` then `add` without atomicity → two parallel `enrichHistorySessionAfterSave` can still slip through in theory; startup-once resume reduces parallel entry points.
- **Security vs dev UX**: CSP warning is dev-centric; packaged app note in Electron docs still means prod CSP deserves an explicit pass.

---

## Severity rubric

| Level           | Meaning                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| **P0 Critical** | Wrong data, crash loop, or security hole in default path                |
| **P1 High**     | Reliable duplicate work, user-visible failure, or notable security debt |
| **P2 Medium**   | UX/perf/correctness edge cases, noisy logs, maintainability             |
| **P3 Low**      | Polish, cosmetic, or rare-environment issues                            |

---

## Backlog (labeled)

### P1 — Duplicate / misplaced history enrichment resume

- **Symptom**: Same log line twice on load; unnecessary Ollama queue pressure.
- **Cause**: `scheduleResumePendingHistoryEnrichment` inside `ipcMain.handle('history:list')` + Strict Mode double `listHistory` from [`HistoryContext.tsx`](src/renderer/src/contexts/HistoryContext.tsx).
- **Fix (your choice: startup once)**:
  1. Call `scheduleResumePendingHistoryEnrichment` exactly once after app is ready and core services exist (e.g. in [`src/main/index.ts`](src/main/index.ts) inside `app.whenReady()` after `registerIpcHandlers`, when `mainWindow` may still be null — pass `() => mainWindow` like handlers do, or run after first window create if you need a window for broadcasts; **note**: enrichment uses `mainWindow` for `webContents.send` — on startup window may exist shortly after; align with existing `getMainWindow` pattern).
  2. Remove the call from [`history:list`](src/main/ipc/handlers.ts) handler (or replace with no-op comment).
  3. Optional hardening: tighten `enrichmentInFlight` with “check-and-set” in one step (e.g. if already in set before async work, return immediately) to close TOCTOU between lines 185–188 in [`enrichHistorySession.ts`](src/main/assistant/enrichHistorySession.ts).

### P1 — Electron 35.x end-of-support (platform security / maintenance)

- **Evidence**: [`plan.md`](plan.md) states 34/35 EOL; app logs show `electron 35.4.0`.
- **Fix**: Plan upgrade to supported line (plan suggests **39.x** as next conservative target). Scope: `electron`, `electron-vite`, rebuild native deps (`onnxruntime-node`, whisper stack), CI matrix.

### P2 — Content Security Policy (renderer)

- **Symptom**: Dev log shows Electron CSP warning (`unsafe-eval` / missing CSP).
- **Fix**: Define CSP for **packaged** build; keep dev relaxed if required for Vite HMR. Touch window creation in [`src/main/index.ts`](src/main/index.ts) (`session` or `webPreferences` + `headers` per Electron security doc).

### P2 — Linux tray icon reports `iconEmpty: true`

- **Symptom**: [`createTrayIcon`](src/main/index.ts) uses SVG data URL; log line `Tray icon created` with `iconEmpty: true` suggests Linux may not decode SVG tray assets reliably.
- **Fix**: Use PNG/ICNS assets for tray on Linux (or platform-specific branch), keep template image behavior on macOS.

### P2 — Duplicate audio source discovery on load

- **Symptom**: Log shows `discovering` → `ready` twice back-to-back (same pattern as Strict Mode double effects).
- **Fix**: If annoying: debounce or single-flight `getSources()` in [`RecordingContext.tsx`](src/renderer/src/contexts/RecordingContext.tsx), or accept as dev-only noise.

### P3 — Whisper hallucination / junk segments

- **Symptom**: e.g. segment with `textLength: 1` (`"1"`) and zero-duration edge timestamps in log.
- **Fix**: Post-filter segments before emit or before history save (e.g. drop `\d`-only or below min length); tune to avoid dropping valid short words.

### P3 — Log rotation truncates instead of rotating

- **Behavior**: [`AppLogger.ts`](src/main/logging/AppLogger.ts) clears file when &gt; 5MB — data loss vs rotate-to-archive.
- **Fix**: Optional rename to `.1` / cap count — only if you want forensic history.

---

## Suggested implementation order

1. **P1** startup-only `scheduleResumePendingHistoryEnrichment` + remove from `history:list` (+ optional `enrichmentInFlight` atomicity).
2. **P2** tray PNG on Linux (quick UX win).
3. **P1** Electron upgrade (larger PR; schedule when you have test time).
4. **P2** CSP for production build.
5. **P2/P3** renderer debounce for sources; whisper segment filter.

---

## Gaps → single clarifying questions (only where product choice matters)

| Gap             | Question (if you revisit later)       | Recommended default                                                      |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Junk segments   | Minimum text length or regex to drop? | Drop only pure-numeric / single-char noise after merge, not normal words |
| Log retention   | Truncate vs rotate files?             | Rotate with retention cap if you need postmortems                        |
| Electron target | 39 vs 41?                             | **39.x** per existing plan bias                                          |

No further user input required for the **resume** item — you chose **startup once**.

---

## Verification

- After moving resume: single `Resuming pending history AI enrichment` per cold start; pending sessions still reach `ready`.
- After tray fix: `iconEmpty: false` on Linux or visible tray icon.
- Run existing Vitest suite + manual smoke: capture → history save → enrichment.
