"""Theme system for the SPIKE Keyboard Controller.

Every window colour lives in a :class:`Theme`. ``default 1`` keeps the
original look exactly; the rest are generated dark palettes (readable on
screen, each with its own accent hue / tint) so any theme name in the list is
genuinely different but consistent with the layout.

The active theme is persisted to a small JSON file next to the repo, so it
survives restarts. ``themes.py`` is NOT part of the script uploaded to the
hub (only ``config.py`` is), so it is safe to grow here freely.
"""

from __future__ import annotations

import colorsys
import json
import os
from dataclasses import dataclass, field


# ------------------------------------------------------------------
# Model
# ------------------------------------------------------------------
@dataclass
class Theme:
    name: str
    group: str

    bg: str        # window background
    panel: str     # card / frame background
    panel2: str    # raised panel
    border: str    # subtle borders
    text: str
    muted: str
    cyan: str      # primary accent
    green: str
    amber: str
    red: str
    btn: str
    btn_hi: str
    btn_pr: str

    logbg: str
    logfg: str
    log_cmd: str
    log_err: str
    log_ok: str
    log_dim: str

    # specialised (connect / diagnose / handbrake / test / pad / lists)
    connect_bg: str
    connect_hi: str
    connect_pr: str
    connect_dis: str
    diag_bg: str
    diag_fg: str
    diag_hi: str
    diag_dis: str
    sel_bg: str            # selected item in the hub list
    banner_bg: str         # macOS accessibility notice
    banner_fg: str
    pad_down_bg: str       # on-screen WASD key while held
    space_bg: str
    space_fg: str
    space_hi: str
    space_on_bg: str       # handbrake engaged
    space_on_hi: str
    test_bg: str
    test_fg: str
    test_hi: str
    port_bg: str           # FRONT slot active motor
    port_hi: str
    port_fg: str
    rev_bg: str            # ⇄ REV slot active
    rev_hi: str
    rev_fg: str
    scan_dis: str          # disabled state for SCAN / layouts
    extra: dict = field(default_factory=dict)


# ------------------------------------------------------------------
# Colour helpers
# ------------------------------------------------------------------
def _hsl(h: float, s: float, l: float) -> str:
    """Hex colour from hue/saturation/lightness (H = 0..360)."""
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l, s)
    return "#{:02x}{:02x}{:02x}".format(
        int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def _seq(h: float, s: float, l: float, step: float, count: int = 8) -> list[str]:
    """A ramp of `count` tones ascending in lightness from a hue."""
    return [_hsl(h, s, min(0.95, l + step * i)) for i in range(count)]


def _make(hue: float, sec: float, lift: float, sat: float) -> Theme:
    """Build a full dark palette from a small signature.

    hue  : main accent hue (buttons, accents)
    sec  : secondary accent hue (green-ish / teal tints)
    lift : how much the chrome lifts off true black (0..~0.5)
    sat  : saturation of the accent colours (0..1)
    """
    # staggered tones along the main hue so layers read at a glance
    c2 = [min(0.95, x + lift * 0.25) for x in [0.045, 0.08, 0.11, 0.14,
                                               0.17, 0.23, 0.15, 0.03]]
    bg = _hsl(hue, 0.14 + sat * 0.10, c2[0])
    panel = _hsl(hue, 0.16 + sat * 0.10, c2[1])
    panel2 = _hsl(hue, 0.17 + sat * 0.10, c2[2])
    border = _hsl(hue, 0.16 + sat * 0.10, c2[7])
    btn = _hsl(hue, 0.15 + sat * 0.10, c2[3])
    btn_hi = _hsl(hue, 0.17 + sat * 0.12, c2[4])
    btn_pr = _hsl(hue, 0.18 + sat * 0.12, c2[5])
    # near-neutral text
    text = _hsl(hue, 0.10, 0.90)
    muted = _hsl(hue, 0.08, 0.58)
    cyan = _hsl(hue, sat, 0.62)
    green = _hsl(145, 0.55, 0.56)
    amber = _hsl(38, 0.80, 0.62)
    red = _hsl(0, 0.72, 0.62)
    logbg = _hsl(hue, 0.12, 0.035)
    logfg = _hsl(hue, 0.10, 0.74)
    return Theme(
        name="", group="",
        bg=bg, panel=panel, panel2=panel2, border=border,
        text=text, muted=muted, cyan=cyan, green=green, amber=amber, red=red,
        btn=btn, btn_hi=btn_hi, btn_pr=btn_pr,
        logbg=logbg, logfg=logfg,
        log_cmd=cyan, log_err=red, log_ok=green, log_dim=muted,
        connect_bg=_hsl(hue, 0.35, 0.34), connect_hi=_hsl(hue, 0.42, 0.45),
        connect_pr=_hsl(hue, 0.40, 0.24), connect_dis=_hsl(hue, 0.22, 0.20),
        diag_bg=_hsl(sec, 0.30, 0.26), diag_fg=_hsl(sec, 0.40, 0.85),
        diag_hi=_hsl(sec, 0.34, 0.37), diag_dis=_hsl(sec, 0.22, 0.18),
        sel_bg=_hsl(hue, 0.45, 0.32),
        banner_bg=_hsl(38, 0.35, 0.20), banner_fg=_hsl(40, 0.75, 0.74),
        pad_down_bg=_hsl(sec, 0.38, 0.30),
        space_bg=_hsl(0, 0.42, 0.26), space_fg=_hsl(0, 0.75, 0.84),
        space_hi=_hsl(0, 0.48, 0.34),
        space_on_bg=_hsl(0, 0.62, 0.33), space_on_hi=_hsl(0, 0.66, 0.44),
        test_bg=_hsl(150, 0.34, 0.28), test_fg=_hsl(150, 0.60, 0.86),
        test_hi=_hsl(150, 0.44, 0.38),
        port_bg=_hsl(150, 0.42, 0.28), port_hi=_hsl(150, 0.48, 0.38),
        port_fg=_hsl(150, 0.70, 0.86),
        rev_bg=_hsl(38, 0.48, 0.28), rev_hi=_hsl(38, 0.55, 0.38),
        rev_fg=_hsl(40, 0.80, 0.86),
        scan_dis=_hsl(hue, 0.16, 0.16),
    )


# ------------------------------------------------------------------
# Default ("default 1") - the exact original palette, untouched.
# ------------------------------------------------------------------
def default() -> Theme:
    t = Theme(
        name="default 1", group="★ Default",
        bg="#0d1017", panel="#141925", panel2="#1b2233", border="#242e45",
        text="#e9edf5", muted="#8b96ab",
        cyan="#00e5ff", green="#3ddc97", amber="#ffb054", red="#ff5c5c",
        btn="#232b3f", btn_hi="#2e3a55", btn_pr="#17203a",
        logbg="#080b12", logfg="#c9d2e0",
        log_cmd="#00e5ff", log_err="#ff5c5c", log_ok="#3ddc97",
        log_dim="#8b96ab",
        connect_bg="#1d5a86", connect_hi="#2471a6", connect_pr="#17486a",
        connect_dis="#173d56",
        diag_bg="#3b3554", diag_fg="#d9cfff", diag_hi="#4c4380",
        diag_dis="#2c2850",
        sel_bg="#124f7a", banner_bg="#3a2a12", banner_fg="#ffd9a0",
        pad_down_bg="#12364f",
        space_bg="#5a2d2d", space_fg="#ffd0d0", space_hi="#7a3a3a",
        space_on_bg="#8a1f1f", space_on_hi="#ab3333",
        test_bg="#1d5a3e", test_fg="#dffff0", test_hi="#27945f",
        port_bg="#1f5a34", port_hi="#2d8a4d", port_fg="#d8ffe9",
        rev_bg="#6b4a12", rev_hi="#a8731f", rev_fg="#ffe0a0",
        scan_dis="#26324f",
    )
    return t


# ------------------------------------------------------------------
# Theme catalogue: (name, group, hue, secondary_hue, lift, sat)
# ------------------------------------------------------------------
_SPECS: dict[str, list[tuple]] = {
    "🌸 Soft / Cute": [
        ("CuteBlossom", 340, 160, 0.10, 0.55),
        ("Bubblegum", 325, 180, 0.12, 0.60),
        ("Pastel", 270, 200, 0.08, 0.35),
        ("Cotton Candy", 300, 190, 0.14, 0.48),
        ("Lavender", 265, 210, 0.10, 0.45),
        ("Peach", 25, 160, 0.12, 0.55),
        ("Dreamy", 285, 170, 0.11, 0.40),
        ("Sweetheart", 350, 150, 0.13, 0.58),
        ("Soft Glow", 40, 190, 0.09, 0.35),
        ("Cloud", 210, 180, 0.07, 0.30),
        ("Powder Rose", 355, 200, 0.11, 0.32),
        ("Lemonade", 55, 180, 0.10, 0.42),
        ("Strawberry", 345, 130, 0.12, 0.62),
        ("Blossom Glow", 320, 170, 0.11, 0.50),
    ],
    "🌑 Dark / Sleek": [
        ("Midnight", 235, 190, 0.03, 0.25),
        ("Eclipse", 260, 200, 0.02, 0.20),
        ("Obsidian", 0, 140, 0.01, 0.10),
        ("Shadow", 220, 170, 0.02, 0.16),
        ("Noir", 250, 150, 0.0, 0.06),
        ("Carbon", 200, 180, 0.01, 0.12),
        ("Onyx", 330, 160, 0.01, 0.14),
        ("Nightfall", 245, 210, 0.04, 0.22),
        ("Dark Matter", 280, 170, 0.0, 0.08),
        ("Void", 260, 200, 0.0, 0.04),
        ("Ink", 225, 200, 0.01, 0.10),
        ("Dusk", 265, 160, 0.03, 0.18),
        ("Umbra", 280, 140, 0.0, 0.06),
        ("Slate Black", 210, 190, 0.02, 0.14),
    ],
    "💻 Techy / Futuristic": [
        ("Cyber", 190, 150, 0.07, 0.85),
        ("Neon", 160, 200, 0.08, 0.90),
        ("Circuit", 135, 190, 0.06, 0.75),
        ("Quantum", 215, 160, 0.07, 0.80),
        ("Matrix", 115, 170, 0.05, 0.70),
        ("Digital", 175, 205, 0.08, 0.82),
        ("Synth", 285, 160, 0.09, 0.85),
        ("Aurora", 210, 150, 0.08, 0.72),
        ("Hyper", 320, 180, 0.09, 0.88),
        ("Nova", 45, 200, 0.08, 0.85),
        ("Byte", 150, 210, 0.06, 0.78),
        ("Chip", 190, 140, 0.06, 0.72),
        ("Plasma", 300, 170, 0.08, 0.86),
        ("Hologram", 240, 190, 0.07, 0.70),
    ],
    "🌿 Nature": [
        ("Forest", 120, 160, 0.05, 0.48),
        ("Evergreen", 140, 170, 0.04, 0.45),
        ("Meadow", 90, 150, 0.06, 0.55),
        ("Ocean", 200, 170, 0.06, 0.58),
        ("Wildflower", 300, 120, 0.06, 0.50),
        ("Moss", 80, 160, 0.04, 0.40),
        ("Sunset", 20, 170, 0.08, 0.60),
        ("Alpine", 210, 190, 0.04, 0.35),
        ("Earth", 30, 150, 0.05, 0.45),
        ("Rainfall", 195, 160, 0.05, 0.40),
        ("Dune", 35, 160, 0.06, 0.35),
        ("Tide", 205, 150, 0.06, 0.50),
        ("Vine", 105, 175, 0.05, 0.45),
        ("Bamboo", 135, 185, 0.05, 0.42),
    ],
    "🧊 Minimal / Clean": [
        ("Pure", 210, 170, 0.06, 0.12),
        ("Clear", 190, 160, 0.07, 0.20),
        ("Simple", 0, 150, 0.05, 0.05),
        ("Mono", 0, 0, 0.05, 0.0),
        ("Slate", 220, 180, 0.05, 0.18),
        ("Frost", 200, 190, 0.08, 0.25),
        ("Linen", 40, 150, 0.06, 0.10),
        ("Paper", 50, 160, 0.07, 0.08),
        ("Neutral", 250, 170, 0.05, 0.10),
        ("Glass", 180, 200, 0.06, 0.22),
        ("Fog", 210, 170, 0.04, 0.08),
        ("Ice", 185, 190, 0.08, 0.18),
        ("Mercury", 0, 150, 0.02, 0.05),
        ("Pearl", 60, 180, 0.07, 0.12),
    ],
    "🔥 Bold / Energetic": [
        ("Inferno", 12, 45, 0.09, 0.95),
        ("Electric", 270, 200, 0.08, 0.90),
        ("Pulse", 330, 210, 0.08, 0.92),
        ("Ignite", 18, 150, 0.09, 0.90),
        ("Rush", 130, 200, 0.07, 0.88),
        ("Voltage", 60, 200, 0.08, 0.85),
        ("Blaze", 25, 10, 0.09, 0.92),
        ("Turbo", 220, 190, 0.07, 0.88),
        ("Impact", 350, 160, 0.08, 0.90),
        ("Surge", 165, 210, 0.07, 0.90),
        ("Sonic", 260, 190, 0.08, 0.90),
        ("Laser", 70, 210, 0.08, 0.88),
        ("Fuse", 340, 140, 0.08, 0.86),
        ("Thunder", 230, 200, 0.07, 0.85),
    ],
    "✨ Fancy / Premium": [
        ("Royal", 265, 200, 0.08, 0.75),
        ("Velvet", 320, 180, 0.08, 0.70),
        ("Prestige", 240, 190, 0.09, 0.55),
        ("Platinum", 205, 190, 0.08, 0.25),
        ("Luxe", 300, 45, 0.09, 0.65),
        ("Opal", 200, 170, 0.08, 0.35),
        ("Diamond", 210, 180, 0.09, 0.28),
        ("Silk", 275, 160, 0.08, 0.40),
        ("Gold", 42, 30, 0.08, 0.75),
        ("Imperial", 30, 300, 0.07, 0.60),
        ("Sapphire", 215, 200, 0.08, 0.60),
        ("Crimson", 350, 200, 0.07, 0.68),
        ("Emerald", 145, 210, 0.06, 0.55),
        ("Champagne", 50, 180, 0.08, 0.35),
    ],
    "🪐 Weird / Experimental": [
        ("Cosmic", 280, 170, 0.07, 0.85),
        ("Glitch", 315, 140, 0.09, 0.95),
        ("Flux", 150, 300, 0.08, 0.85),
        ("Paradox", 45, 320, 0.08, 0.80),
        ("Distortion", 340, 80, 0.09, 0.90),
        ("Gravity", 260, 200, 0.04, 0.60),
        ("Mirage", 190, 40, 0.08, 0.75),
        ("Chaos", 20, 250, 0.09, 0.95),
        ("Phantom", 300, 120, 0.05, 0.50),
        ("Dimension", 230, 60, 0.06, 0.80),
        ("Enigma", 205, 60, 0.05, 0.65),
        ("Abyss", 300, 90, 0.03, 0.45),
        ("Mixture", 60, 290, 0.07, 0.72),
        ("Anomaly", 330, 50, 0.09, 0.88),
    ],
}

THEMES: dict[str, Theme] = {}
THEMES["default 1"] = default()
for group, entries in _SPECS.items():
    for name, hue, sec, lift, sat in entries:
        t = _make(hue, sec, lift, sat)
        t.name = name
        t.group = group
        THEMES[name] = t
        THEMES[name].extra["spec"] = (hue, sec, lift, sat)


GROUPS = ["★ Default"] + list(_SPECS.keys())


def get(name: str) -> Theme:
    return THEMES.get(name, THEMES["default 1"])


# ------------------------------------------------------------------
# Persistence
# ------------------------------------------------------------------
def _state_file() -> str:
    home = os.path.expanduser("~")
    return os.path.join(home, ".spike_keyboard_controller_theme.json")


def load_active() -> str:
    try:
        with open(_state_file()) as fh:
            name = json.load(fh).get("theme", "default 1")
    except Exception:
        name = "default 1"
    return name if name in THEMES else "default 1"


def persist(name: str) -> None:
    try:
        with open(_state_file(), "w") as fh:
            json.dump({"theme": name}, fh)
    except Exception:
        pass


# Pre-resolved colours used by gui.py at import time.
ACTIVE: Theme = get(load_active())