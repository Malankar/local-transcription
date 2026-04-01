---
name: ipc-channel
description: Scaffold a new IPC channel across main handlers, preload bridge, and shared types
disable-model-invocation: true
---

Add a new IPC channel named {{channel_name}} with the following steps:
1. Add handler in src/main/ipc/handlers.ts using ipcMain.handle('{{channel_name}}', ...)
2. Expose it in src/preload/index.ts via contextBridge
3. Add the type signature to src/shared/types.ts
4. Update src/renderer/src/types.ts if the renderer needs the new type

Ask for the channel name and payload/return types before proceeding.
