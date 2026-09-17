#!/usr/bin/env bash
# Builds the SPIKE Keyboard Controller app, ad-hoc signs it (so macOS shows
# the friendly "Open Anyway" prompt instead of "Move to Bin"), and packages
# a ready-to-share ZIP.
#
#   ./build_release.sh
#
# Output: dist/SPIKE-Keyboard-Controller.zip
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building SPIKE Keyboard Controller.app"
./.venv/bin/python setup.py py2app >/tmp/kc_build.log 2>&1 || { tail -20 /tmp/kc_build.log; exit 1; }

echo "==> Ad-hoc signing (prevents the scary 'Move to Bin' Gatekeeper error)"
codesign --deep --force --sign - "dist/SPIKE Keyboard Controller.app"

echo "==> Assembling release folder"
REL="dist/Release"
rm -rf "$REL"
mkdir -p "$REL"
cp -R "dist/SPIKE Keyboard Controller.app" "$REL/"
cp release/README.txt  "$REL/README.txt"
cp release/Install.command  "$REL/Install.command"
chmod +x "$REL/Install.command"
# Make sure nothing inside carries a quarantine flag (belt and braces)
xattr -cr "$REL" 2>/dev/null || true

ZIP="$(pwd)/dist/SPIKE-Keyboard-Controller.zip"
rm -f "$ZIP"
(cd "$REL" && zip -r -X "$ZIP" . -x "*.DS_Store") >/dev/null

echo "==> Done:"
ls -lh "$ZIP" "$REL"