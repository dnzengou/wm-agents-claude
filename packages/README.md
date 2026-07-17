# packages/ — Distribution surfaces

The deployed core (Next.js frontend + Rust backend) lives in `worldmonitor-ui-components/` and `worldmonitor-core/`. This directory holds **additional install surfaces** that wrap or embed that core for different consumer types.

| Surface | Path | Audience | Status |
|---|---|---|---|
| **Chrome MV3 extension** | `chrome-ext/` | Power users wanting one-click toolbar access | ✅ scaffold ready, icons pending |
| **NPM SDK** | `terminal-sdk/` | Developers embedding the React component | ✅ `@worldmonitor/terminal@1.2.0` ready to publish |
| **Android APK (TWA)** | `twa/` | Mobile users (Google Play) | ✅ Bubblewrap manifest ready |
| **Desktop app (Tauri)** | `tauri/` | macOS / Windows / Linux (ARM64 + amd64) | ✅ build doc ready, scaffold via `npm create tauri-app` |

### What's NOT here (already on the deployed core)

- **PWA** → already at `worldmonitor-ui-components/public/{manifest.json,sw.js,icons/}` — installable from any modern browser
- **Multi-arch Docker** → already in root `Dockerfile` (Rust backend, amd64+arm64)
- **Vercel deployment** → already live at https://worldmonitor-core.vercel.app

### Distribution philosophy

The PWA is the canonical artifact. Every surface here is a thin wrapper around the live URL. This means:

- **One codebase, many install paths.** Push to Vercel; every surface updates.
- **No fragmentation.** The Chrome ext, the APK, and the desktop app all open the same PWA. Feature parity is automatic.
- **Tiny binaries.** Chrome ext ~5 KB, TWA APK ~6 MB, Tauri app ~10 MB.

### Build everything

```bash
# Chrome extension zip
bash packages/chrome-ext/build.sh

# NPM SDK
(cd packages/terminal-sdk && npm install && npm run build && npm pack)

# Android APK (requires JDK 17 + Android SDK)
(cd packages/twa && npx -p @bubblewrap/cli bubblewrap build)

# Tauri desktop (requires Rust + Node)
(cd packages/tauri && npm run tauri build)
```
