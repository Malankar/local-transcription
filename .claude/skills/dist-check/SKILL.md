---
name: dist-check
description: Build the Electron app and verify the AppImage output for common ASAR/native module packaging issues
disable-model-invocation: true
---

Run `pnpm dist` from the project root, then verify the output:

1. Confirm an AppImage exists in `dist/` — report its name and size (`ls -lh dist/*.AppImage`).
2. Check that `onnxruntime-node` and `@huggingface/transformers` appear in the unpacked ASAR directory (`dist/linux-unpacked/resources/app.asar.unpacked/`) — if either is missing, the packaged app will fail at runtime.
3. Look for any `.node` binaries that are inside the ASAR itself (not in `app.asar.unpacked`) — these will fail to load when packaged. Report them as errors.
4. Print a short pass/fail summary for each check.

If `pnpm dist` fails, show the last 30 lines of output and identify whether the failure is in the build step or the packaging step.
