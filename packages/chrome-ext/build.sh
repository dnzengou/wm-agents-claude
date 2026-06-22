#!/usr/bin/env bash
# Pack packages/chrome-ext into a Web-Store-ready zip.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[[ -z "$VERSION" ]] && VERSION="0.0.0"
ZIP="worldmonitor-chrome-ext-v${VERSION}.zip"
rm -f "$ZIP"

for f in icons/icon-16.png icons/icon-48.png icons/icon-128.png; do
  if [[ ! -f "$f" ]]; then
    echo "WARN: missing $f — loads unpacked but Web Store will reject."
  fi
done

if command -v zip >/dev/null 2>&1; then
  zip -r "$ZIP" . -x "*.zip" "build.sh" "README.md" >/dev/null
elif command -v 7z >/dev/null 2>&1; then
  7z a -tzip "$ZIP" . -xr!*.zip -xr!build.sh -xr!README.md >/dev/null
elif command -v powershell.exe >/dev/null 2>&1; then
  ABS_ZIP=$(cygpath -w "$(pwd)/$ZIP" 2>/dev/null || echo "$(pwd)/$ZIP")
  ABS_SRC=$(cygpath -w "$(pwd)" 2>/dev/null || pwd)
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path '${ABS_SRC}\manifest.json','${ABS_SRC}\background.js','${ABS_SRC}\icons' -DestinationPath '${ABS_ZIP}' -Force" >/dev/null
else
  echo "No zip/7z/powershell found."; exit 1
fi

echo "Packed: $(pwd)/$ZIP"
