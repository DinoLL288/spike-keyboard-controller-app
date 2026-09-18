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

# A modern Tk (8.6+) is required. Apple's old system Tk 8.5 opens blank
# or crashes for many apps; python.org and Homebrew python-tk ship 8.6+.
tk_ok() {
    "$1" -c "import tkinter, sys; sys.exit(0 if tkinter.TkVersion >= 8.6 else 1)" >/dev/null 2>&1
}

needs_setup() {
    [ -x "$PY" ] || return 0
    "$PY" -c "import bleak, pynput, tkinter" >/dev/null 2>&1 || return 0
    "$PY" -c "import tkinter, sys; sys.exit(0 if tkinter.TkVersion >= 8.6 else 1)" >/dev/null 2>&1 || return 0
    return 1
}

if needs_setup; then
    echo "First run only: setting up the Python environment..."

    PYHOST=""
    if command -v python3 >/dev/null 2>&1 && tk_ok python3; then
        PYHOST="python3"
    else
        for p in /Library/Frameworks/Python.framework/Versions/*/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
            [ -x "$p" ] || continue
            if tk_ok "$p"; then
                PYHOST="$p"
                break
            fi
        done
    fi

    if [ -z "$PYHOST" ]; then
        echo ""
        PYMAJMIN=""
        TKV=""
        if command -v python3 >/dev/null 2>&1; then
            PYMAJMIN="$(python3 -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" 2>/dev/null)"
            TKV="$(python3 -c "import tkinter; print(tkinter.TkVersion)" 2>/dev/null)"
        fi
        if [ -n "$TKV" ]; then
            echo "This Mac's Python draws its windows with Apple's old,"
            echo "deprecated Tk $TKV, which is known to open blank or crash."
            echo ""
            echo "Please install Python from python.org (it includes a"
            echo "modern Tk), then double-click this file again:"
            echo "  https://www.python.org/downloads/"
            if command -v brew >/dev/null 2>&1; then
                echo ""
                echo "Or update Tk for the Python you already have:"
                echo "    brew install python-tk@$PYMAJMIN"
            fi
        elif [ -n "$PYMAJMIN" ]; then
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
            echo "  https://www.python.org/downloads/"
        fi
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
    if ! tk_ok "$PY"; then
        echo ""
        echo "The Python environment was created, but its Tk window toolkit"
        echo "is missing or too old (this app needs Tk 8.6 or newer)."
        echo "Install Python from https://www.python.org/downloads/ and reopen."
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
