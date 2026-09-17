#!/bin/bash
# SPIKE Keyboard Controller - Python edition launcher (portable)
# Double-click to open. Works on any Mac, NO Apple verification needed.
# On the very first run it sets up its own private Python environment
# (needs internet for a minute). Every run after that is offline.
#
# This launcher stays in the base folder; the program code lives in ./code

cd "$(dirname "$0")/code" || exit 1
PY=".venv/bin/python"

needs_setup() {
    [ -x "$PY" ] || return 0
    "$PY" -c "import bleak, pynput" >/dev/null 2>&1 || return 0
    return 1
}

if needs_setup; then
    echo "First run only: setting up the Python environment..."
    if ! python3 -c "import sys" 2>/dev/null; then
        echo ""
        echo "Python 3 needs to be installed on this Mac."
        echo ""
        echo "If macOS just popped up a window asking to install"
        echo "'command line developer tools', click Install and wait"
        echo "(it takes a few minutes)."
        echo ""
        echo "If not, download Python free from:"
        echo "  https://www.python.org/downloads/"
        echo ""
        echo "After installing, double-click this file again."
        read -r _
        exit 1
    fi
    rm -rf .venv
    python3 -m venv .venv || { echo "Could not create the environment."; read -r _; exit 1; }
    ./.venv/bin/pip install --quiet --upgrade pip
    ./.venv/bin/pip install --quiet bleak pynput || {
        echo "Could not install the libraries. Check your internet connection.";
        read -r _; exit 1;
    }
    echo ""
fi

echo "Starting SPIKE Keyboard Controller..."
"./$PY" main.py
RC=$?
if [ "$RC" -ne 0 ]; then
    echo ""
    echo "SPIKE Keyboard Controller hit a problem (exit code $RC)."
    echo "A screenshot of the text above helps fix it. Press Enter to close."
    read -r _
fi
exit "$RC"