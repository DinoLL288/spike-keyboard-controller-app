"""Session + lifetime statistics for the SPIKE Keyboard Controller.

Counters live in two dictionaries:

* ``life`` - totals across every launch, persisted to a small JSON file
  (``~/.spike_keyboard_controller_stats.json``).
* ``sess`` - the current run only, reset at startup.

Time-based figures (connected time, driving time, uptime) accumulate from a
1-second GUI tick; everything else is bumped at the moment the event happens.
"""

from __future__ import annotations

import json
import os
import time

LIFETIME_FILE = os.path.expanduser("~/.spike_keyboard_controller_stats.json")
_SAVE_EVERY = 5.0  # seconds between disk writes


def _fmt_dur(sec: float) -> str:
    sec = max(0, int(round(sec)))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m {s:02d}s"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def _fmt_count(n) -> str:
    return f"{int(n):,}"


def _fmt_pct(n) -> str:
    return f"{int(n)}%"


def _fmt_deg(n) -> str:
    return f"{int(round(float(n))):,}°"


# Row spec: (stats key, display label, formatter name).
# `uptime` is computed live and not a real counter key.
FORMAT = {
    "count": _fmt_count,
    "time": _fmt_dur,
    "pct": _fmt_pct,
    "deg": _fmt_deg,
}

SESSION_ROWS = [
    ("uptime", "Uptime", "time"),
    ("connect_ok", "Connects", "count"),
    ("connected_time", "Time connected", "time"),
    ("driving_time", "Time driving", "time"),
    ("drive_commands", "Drive commands", "count"),
    ("handbrake_pulls", "Handbrake pulls", "count"),
    ("handbrake_releases", "Handbrake releases", "count"),
    ("max_speed", "Fastest speed", "pct"),
    ("speed_changes", "Speed changes", "count"),
    ("test_spins", "Motor tests", "count"),
    ("motor_rotation", "Motor rotation", "deg"),
    ("key_W", "W / forward keys", "count"),
    ("key_A", "A / left keys", "count"),
    ("key_S", "S / reverse keys", "count"),
    ("key_D", "D / right keys", "count"),
    ("arrows_up", "Speed up presses", "count"),
    ("arrows_down", "Speed down presses", "count"),
    ("space_pressed", "Space presses", "count"),
]

LIFETIME_ROWS = [
    ("sessions", "App launches", "count"),
    ("scans", "Bluetooth scans", "count"),
    ("hubs_found", "Hubs discovered", "count"),
    ("connect_attempts", "Connect attempts", "count"),
    ("connect_ok", "Connects", "count"),
    ("connect_fail", "Connect failures", "count"),
    ("connected_time", "Time connected (all time)", "time"),
    ("driving_time", "Time driving (all time)", "time"),
    ("drive_commands", "Drive commands (all time)", "count"),
    ("forward", "Forward runs", "count"),
    ("backward", "Reverse runs", "count"),
    ("left", "Left turns", "count"),
    ("right", "Right turns", "count"),
    ("handbrake_pulls", "Handbrake pulls (all time)", "count"),
    ("handbrake_releases", "Handbrake releases (all time)", "count"),
    ("test_spins", "Motor tests (all time)", "count"),
    ("motor_rotation", "Motor rotation (all time)", "deg"),
    ("max_battery", "Highest charge seen", "pct"),
    ("theme_switches", "Theme switches", "count"),
    ("motor_checks", "Attachment checks", "count"),
    ("diagnostics", "Diagnostics run", "count"),
]


class Stats:
    def __init__(self) -> None:
        self.life: dict = self._load()
        self.life["app_starts"] = self._val("app_starts") + 1
        self.life["sessions"] = self._val("sessions") + 1
        self.sess: dict = {}

        self._boot = time.time()
        self._last_save = 0.0
        self.save(force=True)

    # -- persistence -----------------------------------------------------
    def _load(self) -> dict:
        try:
            with open(LIFETIME_FILE) as fh:
                data = json.load(fh)
            return dict(data)
        except Exception:
            return {}

    def save(self, force: bool = False) -> None:
        now = time.time()
        if not force and now - self._last_save < _SAVE_EVERY:
            return
        self._last_save = now
        try:
            with open(LIFETIME_FILE, "w") as fh:
                json.dump(self.life, fh, sort_keys=True)
        except Exception:
            pass

    def _val(self, key: str, default=0):
        try:
            return self.life.get(key, default)
        except Exception:
            return default

    # -- counters --------------------------------------------------------
    def bump(self, key: str, n: int = 1) -> None:
        self.sess[key] = self.sess.get(key, 0) + n
        self.life[key] = self.life.get(key, 0) + n
        self.save()

    def max(self, key: str, val) -> None:
        if val > self.life.get(key, 0):
            self.life[key] = val
        if val > self.sess.get(key, 0):
            self.sess[key] = val
        self.save()

    def accu(self, key: str, seconds: float) -> None:
        self.life[key] = self.life.get(key, 0.0) + seconds
        self.sess[key] = self.sess.get(key, 0.0) + seconds

    def counter(self, key: str) -> int:
        return int(self.sess.get(key, 0))

    def lifetime(self, key: str) -> int:
        return int(self.life.get(key, 0))

    def uptime(self) -> float:
        return time.time() - self._boot