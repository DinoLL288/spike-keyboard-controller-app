#!/bin/bash
# Creates a new GitHub release with the rebuilt Python-Edition.zip.
TOKEN=$(git credential fill <<< $'protocol=https\nhost=github.com\n' | awk -F= '/^password=/{print $2}')
TAG="v2.2.4"

BODY=$(python3 - << 'PYEOF'
body = """## What's in this release

SPIKE Keyboard Controller + Block Studio, fresh from today's fixes.

### Fixed
- File picker greys out every file on macOS → removed the hidden accept-filter, so real SPIKE saves (`.llsp3`, `.sb3`, `.json`) are selectable again.
- Loading an official SPIKE save failed with `Cannot read properties of undefined (reading 'localOff')` → project.json lookup fixed in the desktop loader.

### Both apps
- **Block Studio** — drag-and-drop block coding for the SPIKE Prime: motors, movement, lights, sounds, sensors, loops, logic, variables, and even keyboard-driven blocks. Runs your program live on the hub over Bluetooth.
- **SPIKE Keyboard Controller** — drive your robot with W A S D. Press SCAN → pick your hub → CONNECT → drive. Space = stop, 1–9 = speed.
- Fully offline after a one-time setup. No LEGO app needed.

### One-line install
Open Terminal (Cmd+Space → "Terminal") and paste:

```
bash -c "$(curl -fsSL https://raw.githubusercontent.com/DinoLL288/spike-keyboard-controller/main/release/python/install.sh)"
```

It downloads the latest release, installs it to `~/Documents/SPIKE_Apps`, and clears any quarantine flags — so there is **no Apple "cannot verify" warning**, ever. Then just double-click `Block Studio.command` or `SPIKE Keyboard Controller.command`.

You can also grab the ZIP below, unzip it, and double-click the two `.command` files (a browser-downloaded copy may show one "Open Anyway" prompt on newer macOS).

### Notes
- First run does a ~1 minute setup (needs internet once); after that it's fully offline.
- On first keyboard use, macOS asks to enable **Input Monitoring** (Settings → Privacy & Security → Input Monitoring → enable Terminal). That is normal for any keyboard app — allow it once, done.
"""
print(body)
PYEOF
)

JSON=$(python3 -c "import json,sys; print(json.dumps({'tag_name': sys.argv[1], 'name': 'v2.2.4', 'body': sys.argv[2], 'draft': False, 'prerelease': False}))" "$TAG" "$BODY")

RESP=$(curl -s -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/DinoLL288/spike-keyboard-controller/releases \
  -d "$JSON" 2>/dev/null)

ID=$(echo "$RESP" | python3 -c "import json,sys; r=json.load(sys.stdin); print(r.get('id',''))")
echo "release id: $ID"
if [ -z "$ID" ]; then echo "$RESP" | head -20; exit 1; fi

curl -s -X POST -H "Authorization: token $TOKEN" -H "Content-Type: application/zip" \
  --data-binary @dist/Python-Edition.zip \
  "https://uploads.github.com/repos/DinoLL288/spike-keyboard-controller/releases/$ID/assets?name=Python-Edition.zip" \
  | python3 -c "import json,sys; a=json.load(sys.stdin); print('asset id:', a.get('id'), 'name:', a.get('name'), 'size:', a.get('size'))"

echo "Done: https://github.com/DinoLL288/spike-keyboard-controller/releases/tag/v2.2.4"