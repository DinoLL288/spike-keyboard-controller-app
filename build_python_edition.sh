#!/usr/bin/env bash
# Builds the PORTABLE PYTHON EDITION - a clean base folder with the
# double-click launcher, and a code/ subfolder with the program itself.
# Because nothing here is a .app bundle, macOS never applies Gatekeeper, so
# there is NO "cannot be verified" warning on files that arrive unstamped
# (e.g. the curl one-line install, or a USB stick).
#
#   ./build_python_edition.sh
#
# Output: dist/Python-Edition.zip
set -euo pipefail
cd "$(dirname "$0")"

REL="dist/Python Edition"
rm -rf "$REL"
mkdir -p "$REL/code"

# Root-level Python sources -> code/
for f in main.py config.py gui.py keyboard_controller.py lego_hub.py console_helper.py stats.py themes.py; do
    cp "$f" "$REL/code/"
done

find "$REL" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$REL" -name "*.pyc" -delete 2>/dev/null || true

# Launcher stays in the BASE folder; the rest of the docs go into code/
cp "release/python/SPIKE Keyboard Controller.command" "$REL/"
cp "release/python/install.sh" "$REL/code/"
cp "release/python/README.txt" "$REL/code/README.txt"
chmod +x "$REL/"*.command

# No marker file, so console-helper stays dormant in the packaged copies.
xattr -cr "$REL" 2>/dev/null || true

ZIP="$(pwd)/dist/Python-Edition.zip"
rm -f "$ZIP"
(cd "$REL" && zip -r -X "$ZIP" . -x "*.DS_Store" -x ".venv/*") >/dev/null

echo "==> Done:"
ls -lh "$ZIP" "$REL"
echo
echo "Test on this Mac: open the launcher from dist/Python Edition"