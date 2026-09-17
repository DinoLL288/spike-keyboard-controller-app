"""py2app build config - produces a distributable macOS .app bundle.

Build (from the repo root, in the venv):

    ./venv/bin/pip install py2app
    ./venv/bin/python setup.py py2app

The result lands in dist/ "SPIKE Keyboard Controller.app" - Python, tkinter
and all dependencies are bundled, so it runs on any modern Mac without
installing anything.

The bundle is unsigned/bypassing notarization: the first time someone opens
it, macOS asks - Right-click the app -> Open -> Open (once).
"""

from setuptools import setup

APP = ["main.py"]

OPTIONS = {
    "site_packages": True,  # include every installed dependency (safest)
    "includes": [
        # pynput picks its macOS backend dynamically; force them into the bundle
        "pynput._util.darwin",
        "pynput.keyboard._darwin",
        "pynput.mouse._darwin",
    ],
    "plist": {
        "CFBundleName": "SPIKE Keyboard Controller",
        "CFBundleDisplayName": "SPIKE Keyboard Controller",
        "CFBundleIdentifier": "com.dino2307.spike-keyboard-controller",
        "CFBundleShortVersionString": "1.2.0",
        "CFBundleVersion": "1.2.0",
        "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True,
    },
}

setup(
    name="SPIKE Keyboard Controller",
    app=APP,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)