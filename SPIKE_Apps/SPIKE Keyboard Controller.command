#!/bin/bash
cd "$(dirname "$0")/code" || exit 1
export TK_SILENCE_DEPRECATION=1
PY=".venv/bin/python"

# ---- interpreter selection ------------------------------------------------
# The ONLY thing that decides whether the UI actually paints on this Mac is
# the Tk version behind the running Python:
#   Tk >= 8.6  -> clean, crisp, fully-rendered dark window (what we want)
#   Tk  8.5    -> macOS Aqua renders these windows as a flat BLANK GRAY box
#                 (Apple's last-ever Aqua Tk). No code can paint over that —
#                 the *runtime* is what draws the pixels, not us.
#
# That is exactly the "blank gray window" you saw. Your normal `python3`
# (Apple Command Line Tools) is Tk 8.5. A Python from python.org, or any
# `python-tk`-enabled Homebrew Python, is Tk 8.6. So we prefer such an
# interpreter *first*; we re-use the project venv's already-installed
# bleak/pynput libraries via PYTHONPATH (no fresh download needed).

tk86() {
    local p
    for p in /Library/Frameworks/Python.framework/Versions/*/bin/python3 \
             /usr/local/bin/python3 /usr/bin/python3; do
        [ -x "$p" ] || continue
        if "$p" -c "import tkinter; raise SystemExit(0 if tkinter.TkVersion>=8.6 else 1)" >/dev/null 2>&1; then
            echo "$p"
            return 0
        fi
    done
    return 1
}

# Prints the venv's site-packages (where bleak/pynput already live), or nothing.
venv_site() {
    local sp
    for sp in .venv/lib/python*/site-packages; do
        if [ -d "$sp/bleak" ] && [ -d "$sp/pynput" ]; then
            echo "$sp"
            return 0
        fi
    done
    return 1
}

# ---- library check (decides if first-run setup is needed) ----------------
needs_setup() {
    [ -x "$PY" ] || return 0
    "$PY" -c "import bleak, pynput, tkinter" >/dev/null 2>&1 || return 0
    return 1
}

if needs_setup; then
    echo "First run only: setting up the Python environment..."

    PYHOST=""
    # Prefer a Tk >= 8.6 host so the venv it creates can actually render windows.
    if command -v python3 >/dev/null 2>&1 && \
       python3 -c "import tkinter; raise SystemExit(0 if tkinter.TkVersion>=8.6 else 1)" >/dev/null 2>&1; then
        PYHOST="python3"
    else
        for p in /Library/Frameworks/Python.framework/Versions/*/bin/python3 \
                 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
            [ -x "$p" ] || continue
            if "$p" -c "import tkinter; raise SystemExit(0 if tkinter.TkVersion>=8.6 else 1)" >/dev/null 2>&1; then
                PYHOST="$p"
                break
            fi
        done
    fi

    if [ -z "$PYHOST" ]; then
        echo ""
        if command -v python3 >/dev/null 2>&1 && python3 -c "import tkinter" >/dev/null 2>&1; then
            echo "This Mac's Python has a very old built-in GUI (Tk 8.5),"
            echo "which shows a blank gray window on this macOS."
            echo ""
            echo "Easiest fix - run this once in Terminal, then reopen:"
            echo ""
            echo "    python3 -m pip install --upgrade pyobjc-framework-Quartz bleak pynput"
            echo ""
            echo "Otherwise, a Python that already has a newer Tk built in:"
        else
            echo "This Mac's Python is missing its GUI toolkit (Tk),"
            echo "which this app needs for its window."
            echo ""
            if command -v brew >/dev/null 2>&1; then
                echo "Easiest fix - run this once in Terminal, then reopen:"
                echo ""
                echo "    brew install python-tk@3.13"
                echo ""
                echo "Otherwise, a Python that already has Tk built in:"
            else
                echo "Homebrew isn't installed on this Mac, so the easiest"
                echo "fix is a Python that already has Tk built in:"
            fi
        fi
        if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; print(sys.version_info[0:2])" >/dev/null 2>&1; then
            :
        fi
        echo ""
        echo "If macOS just popped up a window asking to install"
        echo "'command line developer tools', click Install and wait"
        echo "(it takes a few minutes)."
        if [ -n "$PYMAJMIN" ]; then
            echo ""
            echo "If not, run this once in Terminal, then reopen:"
            echo ""
            echo "    brew install python-tk@$PYMAJMIN"
            echo ""
            echo "Otherwise, a Python that already has Tk built in:"
        else
            echo ""
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
            echo ""
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

# Prefer running under a Tk >= 8.6 interpreter (so the window actually
# renders) while re-using the bleak/pynput already installed in this .venv —
# via PYTHONPATH. Zero downloads involved.
TK86INTERP="$(tk86 || true)"
VENSITE="$(venv_site || true)"
if [ -n "$TK86INTERP" ] && [ -n "$VENSITE" ] && \
   TK_SILENCE_DEPRECATION=1 PYTHONPATH="$VENSITE" "$TK86INTERP" \
     -c "import tkinter, bleak, pynput" >/dev/null 2>&1; then
    TK_SILENCE_DEPRECATION=1 PYTHONPATH="$VENSITE" "$TK86INTERP" main.py
    RC=$?
elif [ -x "$PY" ] && "$PY" -c "import bleak, pynput, tkinter" >/dev/null 2>&1; then
    "$PY" main.py
    RC=$?
else
    echo ""
    echo "Could not find a working Python to run the app."
    echo ""
    if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" >/dev/null 2>&1; then
        PYMAJMIN="$(python3 -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" 2>/dev/null)"
    else
        PYMAJMIN=""
    fi
    if [ -n "$PYMAJMIN" ]; then
        echo "Install a Python with a modern GUI from python.org, then"
        echo "double-click this file again:"
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
    read -r _
    exit 1
fi

if [ "$RC" -ne 0 ]; then
    echo ""
    echo "SPIKE Keyboard Controller hit a problem (exit code $RC)."
    echo "A screenshot of the text above helps fix it. Press Enter to close."
    read -r _
fi
exit "$RC"
