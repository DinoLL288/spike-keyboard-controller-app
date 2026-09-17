#!/bin/bash
#
#  SPIKE Keyboard Controller - one-time installer
#
#  macOS adds a hidden "quarantine" flag to anything you download. That flag
#  is what makes Gatekeeper show warnings for apps from independent
#  developers. This script removes the flag and copies the app into your
#  Applications folder so it opens with no warnings.
#
#  If macOS asks whether to run this script, click "Open" / "Open Anyway".
cd "$(dirname "$0")" || exit 1

echo "____________________________________________"
echo "  Installing SPIKE Keyboard Controller"
echo "____________________________________________"
echo

if [ ! -d "SPIKE Keyboard Controller.app" ]; then
  echo "  (no app found - nothing to install)"
  exit 0
fi

rm -rf "/Applications/SPIKE Keyboard Controller.app"
cp -R "SPIKE Keyboard Controller.app" /Applications/ 2>/dev/null
xattr -dr com.apple.quarantine "/Applications/SPIKE Keyboard Controller.app" 2>/dev/null
xattr -cr "/Applications/SPIKE Keyboard Controller.app" 2>/dev/null
echo "  Installed  /Applications/SPIKE Keyboard Controller.app"

echo
echo "  Done! Open 'SPIKE Keyboard Controller'"
echo "  from your Applications folder."
echo
exit 0