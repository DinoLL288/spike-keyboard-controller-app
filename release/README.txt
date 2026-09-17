============================================
  SPIKE Keyboard Controller
============================================

A macOS app I built from scratch for the LEGO SPIKE Prime hub.

  SPIKE Keyboard Controller ............... drive the robot with WASD

WHAT YOU NEED
  - Any Mac (Intel or Apple Silicon, macOS 12 or newer)
  - A LEGO SPIKE Prime hub with motors
  - That's it. No internet, no LEGO app, no installs.

HOW TO INSTALL  (pick one)

BEST FOR A CLASS — no popups at all:
  Copy this whole folder onto a USB stick (or a shared class drive),
  then copy the app onto each Mac. Apps that arrive by USB are NOT
  flagged, so they open with ZERO warnings, ZERO settings.

EASY WAY — run the installer:
  1. Double-click  Install.command
  2. A Terminal window opens; press Enter if asked
  3. The app is copied to your Applications folder, ready to go

MANUAL WAY — drag the app yourself:
  1. Drag "SPIKE Keyboard Controller.app" into your Applications
     folder (or just leave it here)
  2. Double-click the app to open it
  3. If macOS asks "is from an unidentified developer?":
        Right-click the app -> Open -> Open (once)
     (or: System Settings -> Privacy & Security -> click "Open Anyway")

WHY MACOS ASKS (the short answer)
Developer-only apps that I haven't paid Apple $99/year to officially
"notarize" show a warning the first time you open them. It is completely
harmless - my code is just notarization-signed. I HAVE ad-hoc signed
the app so you get the friendly "Open Anyway" prompt instead of the
scary "Move to Bin" message. The installer script above removes the
warning entirely.

HACK THAT SKIPS IT FOREVER
The warning is caused by a hidden "quarantine" flag macOS puts on
anything downloaded from the internet (or synced from a cloud drive).
Files copied straight from a USB stick or class file-server have NO
such flag - so they open with no warning at all, ever. Best move for
a classroom: hand out the app on a USB stick.

USING SPIKE KEYBOARD CONTROLLER
  - Open the app, press SCAN, pick your hub, press CONNECT
  - Drive with W A S D  (Space = stop, Q = quit)
  - Live terminal log shows every motor command

Problems? The hub is ON and next to the Mac. BLE range is short.

FOR DEVELOPERS — see the console like the dev launchers
The packaged app hides printed output (that's just how .app bundles work).
To make the app open a Terminal window with its live Python log instead,
create an empty file named  console.txt  in the same folder as the app.
Class copies without that file stay clean.