#!/bin/bash
# SPIKE Keyboard Controller - Python edition launcher (portable)
# Double-click to open. Works on any Mac, NO Apple verification needed.
# On the very first run it sets up its own private Python environment
# (needs internet for a minute). Every run after that is offline.
#
# This launcher stays in the base folder; the program code lives in ./code

cd "$(dirname "$0")/code" || exit 1
export TK_SILENCE_DEPRECATION=1
PY=".venv/bin/python"

needs_setup() {
    [ -x "$PY" ] || return 0
    "$PY" -c "import bleak, pynput, tkinter" >/dev/null 2>&1 || return 0
    return 1
}

if needs_setup; then
    echo "First run only: setting up the Python environment..."

    PYHOST=""
    if command -v python3 >/dev/null 2>&1 && python3 -c "import tkinter" >/dev/null 2>&1; then
        PYHOST="python3"
    else
        for p in /Library/Frameworks/Python.framework/Versions/*/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
            [ -x "$p" ] || continue
            if "$p" -c "import tkinter" >/dev/null 2>&1; then
                PYHOST="$p"
                break
            fi
        done
    fi

    if [ -z "$PYHOST" ]; then
        echo ""
        if command -v python3 >/dev/null 2>&1; then
            PYMAJMIN="$(python3 -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" 2>/dev/null)"
        else
            PYMAJMIN=""
        fi
        if [ -n "$PYMAJMIN" ]; then
            echo "This Mac's Python is missing its GUI toolkit (Tk),"
            echo "which this app needs for its window."
            echo ""
            if command -v brew >/dev/null 2>&1; then
                echo "Easiest fix - run this once in Terminal, then reopen:"
                echo ""
                echo "    brew install python-tk@$PYMAJMIN"
                echo ""
                echo "Otherwise, a Python that already has Tk built in:"
            else
                echo "Homebrew isn't installed on this Mac, so the easiest"
                echo "fix is a Python that already has Tk built in:"
            fi
            echo "  https://www.python.org/downloads/"
        else
            echo "Python 3 needs to be installed on this Mac."
            echo ""
            echo "If macOS just popped up a window asking to install"
            echo "'command line developer tools', click Install and wait"
            echo "(it takes a few minutes)."
            echo ""
            echo "If not, download Python free from:"
        fi
        echo "  https://www.python.org/downloads/"
        echo ""
        echo "After installing, double-click this file again."
        read -r _
        exit 1
    fi

    rm -rf .venv
    "$PYHOST" -m venv .venv || { echo "Could not create the environment."; read -r _; exit 1; }
    ./.venv/bin/python -m ensurepip --upgrade >/dev/null 2>&1 || true
    ./.venv/bin/pip install --quiet --upgrade pip
    ./.venv/bin/pip install --quiet bleak pynput || {
        if ! ./.venv/bin/python -m pip --version >/dev/null 2>&1; then
            echo "This Mac's Python couldn't provide pip, so the libraries"
            echo "cannot be installed. Install Python from python.org, then"
            echo "double-click this file again:"
            echo "  https://www.python.org/downloads/"
            read -r _
            exit 1
        fi
        echo "Could not install the libraries. Check your internet connection.";
        read -r _;
        exit 1;
    }
    if ! ./.venv/bin/python -c "import tkinter" >/dev/null 2>&1; then
        echo ""
        echo "The Python environment was created, but Tk is still missing."
        echo "Run this once in Terminal, then reopen the app:"
        echo ""
        echo "    brew install python-tk@3.13"
        echo ""
        echo "(or download Python from https://www.python.org/downloads/)"
        read -r _
        exit 1
    fi
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