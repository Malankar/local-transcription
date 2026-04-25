# Releasing LocalTranscribe

## Prerequisites

- GitHub repository with Actions enabled
- (Optional) Apple Developer Program membership (~$99/yr) for macOS signing + notarization
- (Optional) Windows code-signing certificate to suppress SmartScreen warnings

---

## Release flow

```
# 1. Bump version (updates package.json and creates a git tag)
pnpm version patch   # or minor / major

# 2. Push the tag — this triggers the GitHub Actions release workflow
git push origin --tags
```

The workflow builds on four parallel runners (mac-x64, mac-arm64, linux, windows),
uploads artifacts to a **draft** GitHub Release, and you publish it manually after
reviewing the artifacts.

---

## Local packaging (no upload)

```bash
pnpm dist:linux        # AppImage + deb → release/
pnpm dist:mac:x64      # DMG for Intel Macs (must run on macOS)
pnpm dist:mac:arm64    # DMG for Apple Silicon (must run on macOS)
pnpm dist:win          # NSIS installer (must run on Windows or macOS)
```

> `nodejs-whisper` is a native module — local packaging only works on the
> platform you are currently running on.

---

## App icon

Replace `build/icon.png` with a **1024 × 1024 px** PNG before your first release.
electron-builder auto-converts it to `.icns` (macOS) and `.ico` (Windows) on each
CI runner using platform-native tools.

To pre-generate `build/icon.icns` locally on macOS:

```bash
pnpm run icons
```

---

## GitHub Secrets required

Add these in **Settings → Secrets and variables → Actions** of your repository.

### All platforms

| Secret | Value |
|--------|-------|
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions — no setup needed |

---

### macOS signing (required for distribution outside the Mac App Store)

You need an **Apple Developer Program** account and a **Developer ID Application** certificate.

#### 1. Export your Developer ID certificate as a `.p12`

1. Open **Keychain Access** → My Certificates
2. Right-click **Developer ID Application: Your Name (TEAMID)** → Export
3. Save as `certificate.p12`, set a strong password

#### 2. Encode and add secrets

```bash
# Encode the certificate
base64 -i certificate.p12 | pbcopy   # copies to clipboard (macOS)
```

| Secret | Value |
|--------|-------|
| `CSC_LINK` | Base64-encoded content of `certificate.p12` |
| `CSC_KEY_PASSWORD` | Password you set when exporting the `.p12` |

#### 3. Notarization (flip `notarize: false → true` in `electron-builder.yml`)

Create an App Store Connect API key:

1. Go to [App Store Connect → Users and Access → Keys](https://appstoreconnect.apple.com/access/api)
2. Generate a new key with **Developer** role
3. Download the `.p8` file (only downloadable once)

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

| Secret | Value |
|--------|-------|
| `APPLE_API_KEY` | Base64-encoded `.p8` file content |
| `APPLE_API_KEY_ID` | 10-character Key ID shown in App Store Connect |
| `APPLE_API_ISSUER` | Issuer ID (UUID shown at the top of the Keys page) |

> **First-time notarization** can take up to 24 hours per Apple's queue. Subsequent
> submissions are usually faster.

---

### Windows code signing (optional)

Without a certificate, Windows Defender SmartScreen shows an "Unknown publisher"
warning. Unsigned builds still install and run correctly.

To sign, obtain a **Code Signing Certificate** from a CA (DigiCert, Sectigo, etc.)
and export it as a `.p12`.

| Secret | Value |
|--------|-------|
| `CSC_LINK` | Base64-encoded `.p12` (same env var as macOS, set per-platform in the workflow) |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |

---

## Enabling notarization

In `electron-builder.yml`, change:

```yaml
mac:
  notarize: false   # → true
```

All three `APPLE_API_KEY*` secrets must be set before flipping this switch.
