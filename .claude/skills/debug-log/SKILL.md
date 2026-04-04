---
name: debug-log
description: Tail and triage the dev log — surfaces errors, warnings, and pipeline stage transitions from logs/localtranscribe.dev.log
---

Read the dev log at `logs/localtranscribe.dev.log` in the project root and produce a triage report.

## Steps

1. Read the entire log file (or last 500 lines if it is very large).

2. Parse each line as: `[<timestamp>] [<LEVEL>] <message> <json_context?>`

3. Output the following sections:

### Errors & Warnings
List every ERROR and WARN line with:
- Timestamp (time only, not date)
- Message
- Context JSON (pretty-printed, key fields only — skip noise like full version objects)

If none, say "No errors or warnings found."

### Pipeline Stages (last session)
Find the last Logger-initialized marker and show the sequence of `stage` values from status-update lines after it:
`idle → discovering → ready → initializing-model → capturing → processing → model-ready`

Highlight any stage that was skipped or repeated unexpectedly.

### Renderer Errors
List any `Renderer console message` entries where `level` is 3 (error) or where message contains "Error" or "Uncaught".

### Process Health Signals
Look for these patterns and report their status:
- `ffmpeg` spawn: did audio capture start successfully?
- `WhisperEngine`: did transformers.js import succeed? Did the pipeline initialize?
- Worker fork: any `ELECTRON_RUN_AS_NODE` or worker-related errors?
- Audio chunks: how many `Audio chunk captured` entries are in the last session?

### Summary
One paragraph: what likely went wrong (if anything), what succeeded, and what to investigate next.
