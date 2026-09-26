#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
FRONTEND_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TAURI_DIR="$FRONTEND_DIR/src-tauri"
ICON_SOURCE="$TAURI_DIR/icons/Sandbox.icon"
OUTPUT_DIR="$TAURI_DIR/icons/macos"

if [ "$(uname -s)" != "Darwin" ]; then
  exit 0
fi

if ! xcrun --find actool >/dev/null 2>&1; then
  echo "actool unavailable; using the checked-in macOS icon assets."
  exit 0
fi

mkdir -p "$OUTPUT_DIR"
xcrun actool \
  --errors \
  --warnings \
  --notices \
  --platform macosx \
  --minimum-deployment-target 10.13 \
  --app-icon Sandbox \
  --output-partial-info-plist "$OUTPUT_DIR/Info.plist" \
  --compile "$OUTPUT_DIR" \
  "$ICON_SOURCE"
