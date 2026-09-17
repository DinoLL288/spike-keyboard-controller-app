"""Keyboard control layer built on pynput.

Tracks the state of the movement keys (W/A/S/D) and Space so that:

* a press starts movement,
* the movement is maintained while a key is held (we do NOT re-send the same
  command repeatedly - only when the effective command changes),
* combinations such as W+A, S+D are supported (the drive vector is derived
  from the current set of pressed *primary* movement keys),
* releasing all movement keys stops both motors.

Only W/A/S/D/Space/Q are observed. The listener runs fully asynchronously on
the main thread's event loop so it never blocks the GUI, and starts/stops are
coordinated through an asyncio queue so callbacks are safe to invoke from the
pynput threads.

Permission: pynput's keyboard listener on macOS requires Accessibility
("Input Monitoring") permission. If it fails to start, the GUI surfaces a
clear message telling the user where to enable it.
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Optional

from pynput import keyboard

# Pieces of the keyboard a robot can be doing at any instant.
_KEYS = {
    "w": "forward",
    "s": "backward",
    "a": "left",
    "d": "right",
}


class KeyboardController:
    """Monitors the keyboard and turns key state into drive requests."""

    def __init__(
        self,
        on_state: Optional[Callable[[dict], Awaitable[None]]] = None,
        on_stop: Optional[Callable[[], Awaitable[None]]] = None,
        on_space: Optional[Callable[[], Awaitable[None]]] = None,
        on_quit: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        self._on_state = on_state or self._default_handler
        self._on_stop = on_stop or self._default_handler
        self._on_space = on_space or self._default_handler
        self._on_quit = on_quit or self._default_handler
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listener: Optional[keyboard.Listener] = None
        self._running = False
        self._pressed: set[str] = set()
        self._last_command: Optional[str] = None
        self._cb_queue: asyncio.Queue = asyncio.Queue()
        self._cb_task: Optional[asyncio.Task] = None

    @staticmethod
    async def _default_handler(*args, **kwargs) -> None:
        return None

    def set_callbacks(
        self,
        on_state: Optional[Callable[[dict], Awaitable[None]]] = None,
        on_stop: Optional[Callable[[], Awaitable[None]]] = None,
        on_space: Optional[Callable[[], Awaitable[None]]] = None,
        on_quit: Optional[Callable[[], Awaitable[None]]] = None,
    ) -> None:
        """Attach (or replace) the callbacks that handle drive state changes,
        stop requests, SPACE presses and quit requests."""
        if on_state is not None:
            self._on_state = on_state
        if on_stop is not None:
            self._on_stop = on_stop
        if on_space is not None:
            self._on_space = on_space
        if on_quit is not None:
            self._on_quit = on_quit
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listener: Optional[keyboard.Listener] = None
        self._running = False
        self._pressed: set[str] = set()
        self._has_permission = False
        self._last_command: Optional[str] = None
        self._cb_queue: asyncio.Queue = asyncio.Queue()
        self._cb_task: Optional[asyncio.Task] = None

    # -- lifecycle ---------------------------------------------------------
    @property
    def available(self) -> bool:
        """True if the keyboard listener is actually active."""
        return self._running

    def start(self) -> None:
        """Start the pynput listener. Returns immediately (non-blocking)."""
        self._loop = asyncio.get_event_loop()
        self._cb_task = self._loop.create_task(self._callback_loop())
        try:
            self._listener = keyboard.Listener(
                on_press=self._on_press, on_release=self._on_release
            )
            self._listener.start()
            self._running = True
        except Exception:
            # No permission or pynput failed; mark unavailable.
            self._running = False

    def stop(self) -> None:
        self._running = False
        self._pressed.clear()
        if self._listener:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None
        if self._cb_task:
            self._cb_task.cancel()

    async def shutdown(self) -> None:
        """Stop the listener and ensure motors are stopped."""
        if self._running:
            try:
                await self._on_stop()
            except Exception:
                pass
        self.stop()

    # -- internal: callback marshalling ------------------------------------
    async def _callback_loop(self) -> None:
        while True:
            item = await self._cb_queue.get()
            try:
                result = item
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                pass

    def _dispatch(self, coro) -> None:
        if coro is None:
            return
        try:
            self._cb_queue.put_nowait(coro)
        except Exception:
            pass

    # -- key handlers (called by pynput threads) ---------------------------
    def _on_press(self, key) -> None:
        char = self._key_char(key)
        if char is None:
            return
        if char == "q":
            # Queue is safe from any thread because it's an asyncio primitive
            # only touched inside the callback task.
            self._dispatch(self._on_quit())
            return
        if char == "space":
            self._dispatch(self._on_space())
            return
        if char in _KEYS:
            if char not in self._pressed:
                self._pressed.add(char)
                self._dispatch(self._recompute())

    def _on_release(self, key) -> None:
        char = self._key_char(key)
        if char is None or char not in _KEYS:
            return
        if char in self._pressed:
            self._pressed.discard(char)
            if self._pressed:
                self._dispatch(self._recompute())
            else:
                self._dispatch(self._on_stop())

    @staticmethod
    def _key_char(key) -> Optional[str]:
        try:
            if key is None:
                return None
            if isinstance(key, keyboard.KeyCode):
                c = key.char
                if c is None:
                    return None
                return c.lower()
            if key == keyboard.Key.space:
                return "space"
            # Ignore modifier/special keys entirely.
            return None
        except Exception:
            return None

    # -- drive vector ------------------------------------------------------
    async def _recompute(self) -> None:
        """Compute current drive vector and push it (deduplicated)."""
        forward = "w" in self._pressed
        backward = "s" in self._pressed and not forward
        left = "a" in self._pressed
        right = "d" in self._pressed and not left

        # Start neutral, then apply combinations.
        command = "stop"
        if forward:
            command = "forward"
            if left:
                command = "forward-left"
            elif right:
                command = "forward-right"
        elif backward:
            command = "backward"
            if left:
                command = "backward-left"
            elif right:
                command = "backward-right"
        else:
            if left:
                command = "left"
            elif right:
                command = "right"

        if command == self._last_command:
            return  # nothing changed -> send nothing
        self._last_command = command
        await self._on_state({"command": command, "keys": set(self._pressed)})

    def reset_last(self) -> None:
        """Forget the remembered command (e.g. after a stop/quit)."""
        self._last_command = None
