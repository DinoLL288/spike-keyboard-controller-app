"""SPIKE Keyboard Controller - entry point.

Runs the tkinter GUI together with an asyncio event loop on the main thread
so Bluetooth operations never freeze the (lightweight, native) interface.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tkinter as tk
import traceback


def _ensure_tk() -> tk.Tk:
    """Create the root window, reporting a friendly error if we cannot."""
    try:
        return tk.Tk()
    except Exception:
        # No display / tkinter unavailable. On a desktop Mac this is rare.
        import tkinter.messagebox as mb

        try:
            mb.showerror(
                "SPIKE Keyboard Controller",
                "Could not create the application window.\n"
                "Make sure you are running this on macOS with a desktop "
                "session.",
            )
        except Exception:
            pass
        raise


def main() -> int:
    from console_helper import attach_console

    attach_console()

    from lego_hub import LegoSpikeHub
    from keyboard_controller import KeyboardController
    from gui import SpikeGui

    root = None
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        root = _ensure_tk()
    except Exception:
        loop.close()
        print("Cannot launch GUI. Exiting.")
        return 1

    try:
        sink = _make_log_sink()
        hub = LegoSpikeHub(log=sink)
        kb = KeyboardController()
        # The GUI realigns the callbacks to the actual hub/gui methods below.
        app = SpikeGui(root, loop, hub, kb)
        sink.set_gui(app)  # hub + bleak messages now also appear in the GUI log
        hub.on_attach = app.show_motors  # live motor-attachment readout

        # Route keyboard callbacks into the GUI (which then drives the hub).
        kb.set_callbacks(
            on_state=app.handle_key_state,
            on_stop=app.handle_stop,
            on_space=app.handle_space,
            on_quit=app.handle_quit,
        )

        try:
            app.run()
        except Exception:
            traceback.print_exc()
        finally:
            # Guarantee motors are stopped even if the UI threw.
            try:
                loop.run_until_complete(hub.disconnect())
            except Exception:
                pass
            kb.stop()
        return 0
    finally:
        loop.close()


def _noop(*args, **kwargs) -> None:
    return None


class _make_log_sink:
    """Hub log handler; prints to stdout (flushed) and also appends to the
    GUI log widget once the GUI exists."""

    _gui = None

    @classmethod
    def set_gui(cls, gui) -> None:
        cls._gui = gui

    def __call__(self, msg: str) -> None:
        try:
            print(f"HUB: {msg}", flush=True)
        except Exception:
            pass
        gui = _make_log_sink._gui
        if gui is not None:
            try:
                gui._log(msg)
            except Exception:
                pass


def _noop2(*args, **kwargs) -> None:
    return None


if __name__ == "__main__":
    sys.exit(main())
