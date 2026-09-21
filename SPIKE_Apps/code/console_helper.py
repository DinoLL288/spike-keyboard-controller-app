"""Console-mode helper for the packaged .app builds.

The desktop dev launchers (the *.command files) run the Python code inside a
real Terminal window. Packaged py2app .app bundles normally hide all printed
output. This helper recreates that dev feel inside the bundle: when enabled,
the app's stdout/stderr are also written to a live log file, and a Terminal
window opens that tails that file.

Enable it by creating an empty file named "console.txt" in either:
  - the folder that contains the .app (next to the app), or
  - ~/Library/Application Support/<App Name>/console.txt

(Or set the environment variable SPIKE_SHOW_CONSOLE=1.) Class copies that
never create the marker keep the normal, clean app behaviour.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import traceback
from pathlib import Path

ENV_ENABLED = "SPIKE_SHOW_CONSOLE"
ENV_ATTACHED = "SPIKE_CONSOLE_ATTACHED"
MARKER = "console.txt"


def bundle_root() -> Path | None:
    """The parent .app directory, found by walking up from sys.argv[0]."""
    try:
        argv0 = Path(sys.argv[0]).resolve()
    except Exception:
        return None
    for parent in (argv0, *argv0.parents):
        if parent.name.endswith(".app"):
            return parent
    return None


def _enabled() -> bool:
    if os.getenv(ENV_ENABLED) == "1":
        return True
    root = bundle_root()
    if root is not None:
        if (root.parent / MARKER).exists():
            return True
        app_support = (
            Path.home()
            / "Library"
            / "Application Support"
            / root.name[: -len(".app")]
        )
        if (app_support / MARKER).exists():
            return True
    return False


class _Tee:
    """Route writes to two streams (keep app output AND the console log)."""

    def __init__(self, primary, secondary):
        self._primary = primary
        self._secondary = secondary
        self._lock = threading.Lock()

    def write(self, data):
        with self._lock:
            try:
                self._primary.write(data)
            except Exception:
                pass
            try:
                self._secondary.write(data)
                self._secondary.flush()
            except Exception:
                pass
        try:
            return len(data)
        except Exception:
            return 0

    def flush(self):
        for stream in (self._primary, self._secondary):
            try:
                stream.flush()
            except Exception:
                pass

    def isatty(self) -> bool:
        return False


def attach_console() -> bool:
    """Chain a live Terminal window onto this app's stdout/stderr."""
    if os.getenv(ENV_ATTACHED):
        return False
    if sys.stdin is not None and sys.stdin.isatty() and os.getenv(ENV_ENABLED) != "1":
        return False
    if not _enabled():
        return False

    os.environ[ENV_ATTACHED] = "1"

    log_path = Path(tempfile.gettempdir()) / "spike-app-console.log"
    try:
        log_fh = open(log_path, "a", buffering=1)
    except Exception:
        log_fh = None

    if log_fh is not None:
        sys.stdout = _Tee(sys.stdout, log_fh)
        sys.stderr = _Tee(sys.stderr, log_fh)

        def _hook(exc_type, exc_value, exc_tb):
            traceback.print_exception(exc_type, exc_value, exc_tb)
            sys.stdout.flush()
            sys.stderr.flush()

        sys.excepthook = _hook
        print("=== app starting... (console attached) ===", flush=True)

    script = 'tell application "Terminal" to do script "clear; tail -f {}"'.format(
        log_path
    )
    try:
        subprocess.Popen(
            ["osascript", "-e", script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        pass
    return True