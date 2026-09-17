#!/bin/bash
# One-line installer for SPIKE Keyboard Controller (Python edition).
# Downloads and installs with no quarantine -> macOS never warns.

set -euo pipefail

DEST="$HOME/Documents/SPIKE_Apps"

echo "==== SPIKE Keyboard Controller (Python edition) ===="
echo "Downloading the latest release..."

REL_JSON="$(mktemp)"
curl -fsSL "https://api.github.com/repos/DinoLL288/spike-keyboard-controller-app/releases/latest" -o "$REL_JSON"

URL="$(python3 -c "import json; a=json.load(open('$REL_JSON'))['assets']; print([x['browser_download_url'] for x in a if x['name'].endswith('.zip')][0])")"

ZIP="$(mktemp -d)/Python-Edition.zip"
curl -fsSL -o "$ZIP" "$URL"

rm -rf "$DEST"
mkdir -p "$DEST"
unzip -o -q "$ZIP" -d "$DEST"

# Belt and braces: make sure no quarantine flag survived anywhere.
xattr -cr "$DEST" 2>/dev/null || true

echo ""
echo "Done! Installed to: $DEST"
echo ""
echo "Your app is right in that folder - just double-click:"
echo "   SPIKE Keyboard Controller.command"
echo ""
echo "First run of the app does a ~1 minute setup (needs internet)."
echo "That is it - no Apple warnings, no Settings step, ever."