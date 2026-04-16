---
name: minimal-ux-redesign
overview: Redesign the app into a minimal, useful two-surface experience (`Record`, `Library`) with stable navigation, local-first assistant summarization, and optional integrations/provider settings hidden behind toggles.
todos:
  - id: nav-2-surface
    content: Refactor navigation/app shell to two-surface model and remove forced redirects
    status: pending
  - id: record-flow-minimal
    content: Implement minimal Record surface with live flow, import secondary action, and post-stop summary
    status: pending
  - id: library-assistant
    content: Simplify Library and keep assistant summarization panel scoped to selected session
    status: pending
  - id: settings-gating
    content: Add/align settings toggles for integrations and assistant provider/local model behavior
    status: pending
  - id: main-ipc-contracts
    content: Align main process, preload APIs, and shared types with minimal-first UX contracts
    status: pending
  - id: tests-refresh
    content: Update renderer/main tests to assert new UX flow and feature gating
    status: pending
isProject: false
---

# Minimal UX Redesign Plan

## Goals
- Reduce cognitive load to a **2-surface product** while preserving core utility.
- Keep workflow predictable: no forced redirects.
- Support assistant summarization in a minimal way (local-first), with optional external provider/integration toggles in Settings.

## Locked Product Decisions
- Navigation: **2 surfaces only** — `Record` and `Library`.
- Stop behavior: stay on `Record` and show compact completion summary with link to `Library`.
- Scope: minimal core + assistant summarization; integrations/settings are optional and off by default.
- Assistant strategy: local model now, external provider later via Settings.

## UX & Information Architecture
- `Record` surface:
  - Single primary flow for live recording.
  - Secondary import action (same surface, no extra destination).
  - Live transcript/timer/status.
  - On stop: inline completion card + CTA to open saved transcript in `Library`.
- `Library` surface:
  - Session list + selected transcript.
  - Export/delete actions.
  - Assistant summary panel scoped to current session.
- `Settings`:
  - Advanced toggles for integrations and assistant provider/model settings.
  - Defaults: all optional external capabilities disabled.

## Implementation Strategy
1. Simplify navigation and remove auto-route side effects.
2. Reshape `Record` into single clear flow (record + import secondary).
3. Simplify `Library` default view and embed assistant summarization panel.
4. Gate integrations/provider features via Settings flags and hide entry points unless enabled.
5. Trim/align shared contracts and IPC for minimal-first behavior.
6. Update tests to reflect new UX and capability gating.

## Primary Files To Change
- Navigation and app shell:
  - [/home/avdhut/exp/local-transcription/src/renderer/src/components/AppShell.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/components/AppShell.tsx)
  - [/home/avdhut/exp/local-transcription/src/renderer/src/contexts/NavigationContext.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/contexts/NavigationContext.tsx)
- Record surface and recording state:
  - [/home/avdhut/exp/local-transcription/src/renderer/src/components/RecordingHubView.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/components/RecordingHubView.tsx)
  - [/home/avdhut/exp/local-transcription/src/renderer/src/contexts/RecordingContext.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/contexts/RecordingContext.tsx)
  - [/home/avdhut/exp/local-transcription/src/renderer/src/contexts/TranscriptContext.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/contexts/TranscriptContext.tsx)
- Library and assistant:
  - [/home/avdhut/exp/local-transcription/src/renderer/src/components/HistoryView.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/components/HistoryView.tsx)
  - [/home/avdhut/exp/local-transcription/src/renderer/src/components/HistorySessionAssistant.tsx](/home/avdhut/exp/local-transcription/src/renderer/src/components/HistorySessionAssistant.tsx)
- Main-process/API contracts and toggles:
  - [/home/avdhut/exp/local-transcription/src/main/ipc/handlers.ts](/home/avdhut/exp/local-transcription/src/main/ipc/handlers.ts)
  - [/home/avdhut/exp/local-transcription/src/main/index.ts](/home/avdhut/exp/local-transcription/src/main/index.ts)
  - [/home/avdhut/exp/local-transcription/src/shared/types.ts](/home/avdhut/exp/local-transcription/src/shared/types.ts)
  - [/home/avdhut/exp/local-transcription/src/preload/index.ts](/home/avdhut/exp/local-transcription/src/preload/index.ts)
- Integration toggles and defaults:
  - [/home/avdhut/exp/local-transcription/src/main/integrations/googleWorkspace/MeetingImportService.ts](/home/avdhut/exp/local-transcription/src/main/integrations/googleWorkspace/MeetingImportService.ts)

## Test Updates
- Renderer UX flows:
  - [/home/avdhut/exp/local-transcription/test/renderer/src/components/RecordingHubView.test.tsx](/home/avdhut/exp/local-transcription/test/renderer/src/components/RecordingHubView.test.tsx)
  - [/home/avdhut/exp/local-transcription/test/renderer/src/contexts/NavigationContext.test.tsx](/home/avdhut/exp/local-transcription/test/renderer/src/contexts/NavigationContext.test.tsx)
  - [/home/avdhut/exp/local-transcription/test/renderer/src/components/HistorySessionAssistant.test.tsx](/home/avdhut/exp/local-transcription/test/renderer/src/components/HistorySessionAssistant.test.tsx)
- Main and IPC:
  - [/home/avdhut/exp/local-transcription/test/main/ipc/handlers.test.ts](/home/avdhut/exp/local-transcription/test/main/ipc/handlers.test.ts)
  - [/home/avdhut/exp/local-transcription/test/main/index.test.ts](/home/avdhut/exp/local-transcription/test/main/index.test.ts)

## Acceptance Criteria
- App has exactly two primary navigation surfaces (`Record`, `Library`).
- Stopping recording does not force navigation; completion summary appears in place.
- Import file remains available but secondary on `Record`.
- Assistant summary is available in `Library` and works with local model path.
- External integrations/provider features are hidden unless enabled in Settings.
- Updated tests pass for navigation behavior, assistant visibility, and gating rules.