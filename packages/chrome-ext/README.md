# WorldMonitor — Chrome Extension (MV3)

One-click access to https://worldmonitor-core.vercel.app/ from the browser toolbar.

## Install (unpacked, for development)

1. `chrome://extensions` → enable **Developer mode** (top right)
2. **Load unpacked** → select this folder (`packages/chrome-ext/`)
3. Pin the extension to the toolbar. Click → live terminal opens (re-uses tab if already open).

## Build a `.zip` for the Chrome Web Store

```bash
bash packages/chrome-ext/build.sh
# → packages/chrome-ext/worldmonitor-chrome-ext-v1.2.0.zip
```

## Icons

Required: `icons/icon-16.png`, `icon-48.png`, `icon-128.png`.
Generate from the project brand mark (`worldmonitor-ui-components/public/icons/icon-512.png`).
Quick path on macOS/Linux:

```bash
SRC=worldmonitor-ui-components/public/icons/icon-512.png
DEST=packages/chrome-ext/icons
for s in 16 48 128; do
  magick "$SRC" -resize ${s}x${s} "$DEST/icon-${s}.png"
done
```

## Permissions philosophy

The extension requests **zero permissions** and **zero host permissions**.
It is a launcher. All data lives on `worldmonitor-core.vercel.app` and is served
under the site's own CSP. The extension cannot read browsing history, page
content, or user data.

## Firefox / Edge

Manifest V3 also works in Edge (Chromium) and Firefox 109+. For Firefox:
add `"browser_specific_settings": { "gecko": { "id": "worldmonitor@yavro.dev" } }`
to `manifest.json` before submitting to AMO.
