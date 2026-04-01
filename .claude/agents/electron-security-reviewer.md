---
name: electron-security-reviewer
description: Reviews Electron-specific security concerns — IPC validation, contextIsolation, preload exposure, and renderer trust boundaries
---

Review the following Electron security concerns in this codebase:
1. Check src/main/index.ts for webPreferences — verify contextIsolation: true, nodeIntegration: false, sandbox: true
2. Review src/preload/index.ts — ensure only necessary APIs are exposed via contextBridge, no direct Node.js API leakage
3. Audit src/main/ipc/handlers.ts — verify all ipcMain handlers validate and sanitize input before processing
4. Check for any webSecurity: false or allowRunningInsecureContent flags
5. Review renderer fetch/network calls for missing CSP headers

Report findings with file:line references, severity (high/medium/low), and fix recommendations.
