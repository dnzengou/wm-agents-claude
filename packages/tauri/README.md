# WorldMonitor — Desktop App (Tauri)

Native desktop app wrapping the live PWA https://worldmonitor-core.vercel.app/.
Targets macOS (arm64 + amd64), Windows (amd64), and Linux (amd64 + arm64) from a single Rust codebase.

## Why Tauri over Electron

| | Tauri | Electron |
|---|---|---|
| Bundle size | ~10 MB | ~150 MB |
| Memory at idle | ~40 MB | ~200 MB |
| Native APIs | Rust crates | Node.js bindings |
| ARM64 macOS | First-class | First-class |
| ARM64 Linux | First-class | Manual |

## Scaffold

```bash
cd packages/tauri
npm create tauri-app@latest -- --template vanilla --identifier app.yavro.worldmonitor --name worldmonitor
# Then edit src-tauri/tauri.conf.json to:
#   - set windows[0].url = "https://worldmonitor-core.vercel.app"
#   - set windows[0].title = "WorldMonitor"
#   - set bundle.targets = ["dmg","msi","deb","appimage"]
```

## Build for current host

```bash
cd worldmonitor
npm install
npm run tauri build
# Outputs in src-tauri/target/release/bundle/
```

## Build for ARM64 macOS from amd64 host

```bash
rustup target add aarch64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin
```

## Build for ARM64 Linux

```bash
rustup target add aarch64-unknown-linux-gnu
npm run tauri build -- --target aarch64-unknown-linux-gnu
```

## CI

Add a `.github/workflows/desktop.yml` matrix job over `[macos-latest, ubuntu-latest, windows-latest]` to produce signed installers on every tag push. Mirrors the existing multi-arch Docker pipeline in `.github/workflows/ci.yml`.
