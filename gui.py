"""SPIKE Keyboard Controller - modern dark GUI.

A slim, fast tkinter client for the SPIKE hub with a live, color-coded
terminal-style log that mirrors everything the console prints (BLE events,
hub console output, motor commands, errors).

Design notes:

* Single-threaded asyncio pattern: the GUI owns the event loop (created in
  main.py) and pumps it from a periodic ``after`` timer via
  ``run_until_complete(sleep(0))``, so BLE work never freezes the UI.
* All slow work runs as async tasks. The keyboard listener pushes callbacks
  onto an asyncio queue so pynput can never block the GUI thread.
* On a Mac without Accessibility permission the real keyboard does not work,
  so the UI also ships a clickable on-screen WASD pad + SPACE key.

Visual language: deep near-black panels, cyan/green/amber accents, monospace
log, glowing status LED, hover-reactive buttons.
"""

from __future__ import annotations

from __future__ import annotations

import asyncio
import time
import tkinter as tk
from tkinter import ttk
from typing import Optional

import config
import stats as _stats
import themes as _themes

# --------------------------------------------------------------------------
# Theme palette.
#
# All window colours live in a themes.Theme. The active theme is resolved at
# import time (`themes.ACTIVE`), and switching themes reassigns every one of
# these module globals before the UI is rebuilt, so all callbacks pick the
# new colours up automatically.
# --------------------------------------------------------------------------
THEME_NAME = ""

BG = PANEL = PANEL2 = BORDER = TEXT = MUTED = CYAN = "#000000"
GREEN = AMBER = RED = BTN = BTN_HI = BTN_PR = "#000000"
LOGBG = LOGFG = LOG_CMD = LOG_ERR = LOG_OK = LOG_DIM = "#000000"
CONNECT_BG = CONNECT_HI = CONNECT_PR = CONNECT_DIS = "#000000"
DIAG_BG = DIAG_FG = DIAG_HI = DIAG_DIS = "#000000"
SEL_BG = BANNER_BG = BANNER_FG = PAD_DOWN_BG = WHITE = "#000000"
SPACE_BG = SPACE_FG = SPACE_HI = SPACE_ON_BG = SPACE_ON_HI = "#000000"
TEST_BG = TEST_FG = TEST_HI = "#000000"
PORT_BG = PORT_HI = PORT_FG = REV_BG = REV_HI = REV_FG = SCAN_DIS = "#000000"


def _sync_theme(th: _themes.Theme) -> None:
    """Push a themes.Theme into every module-level colour global."""
    global THEME_NAME, BG, PANEL, PANEL2, BORDER, TEXT, MUTED, CYAN
    global GREEN, AMBER, RED, BTN, BTN_HI, BTN_PR
    global LOGBG, LOGFG, LOG_CMD, LOG_ERR, LOG_OK, LOG_DIM
    global CONNECT_BG, CONNECT_HI, CONNECT_PR, CONNECT_DIS
    global DIAG_BG, DIAG_FG, DIAG_HI, DIAG_DIS
    global SEL_BG, BANNER_BG, BANNER_FG, PAD_DOWN_BG, WHITE
    global SPACE_BG, SPACE_FG, SPACE_HI, SPACE_ON_BG, SPACE_ON_HI
    global TEST_BG, TEST_FG, TEST_HI
    global PORT_BG, PORT_HI, PORT_FG, REV_BG, REV_HI, REV_FG, SCAN_DIS
    THEME_NAME = th.name
    BG, PANEL, PANEL2, BORDER = th.bg, th.panel, th.panel2, th.border
    TEXT, MUTED = th.text, th.muted
    CYAN, GREEN, AMBER, RED = th.cyan, th.green, th.amber, th.red
    BTN, BTN_HI, BTN_PR = th.btn, th.btn_hi, th.btn_pr
    LOGBG, LOGFG = th.logbg, th.logfg
    LOG_CMD, LOG_ERR, LOG_OK, LOG_DIM = (th.log_cmd, th.log_err,
                                          th.log_ok, th.log_dim)
    CONNECT_BG, CONNECT_HI = th.connect_bg, th.connect_hi
    CONNECT_PR, CONNECT_DIS = th.connect_pr, th.connect_dis
    DIAG_BG, DIAG_FG, DIAG_HI, DIAG_DIS = (th.diag_bg, th.diag_fg,
                                           th.diag_hi, th.diag_dis)
    SEL_BG, BANNER_BG, BANNER_FG = th.sel_bg, th.banner_bg, th.banner_fg
    PAD_DOWN_BG, WHITE = th.pad_down_bg, "#ffffff"
    SPACE_BG, SPACE_FG, SPACE_HI = th.space_bg, th.space_fg, th.space_hi
    SPACE_ON_BG, SPACE_ON_HI = th.space_on_bg, th.space_on_hi
    TEST_BG, TEST_FG, TEST_HI = th.test_bg, th.test_fg, th.test_hi
    PORT_BG, PORT_HI, PORT_FG = th.port_bg, th.port_hi, th.port_fg
    REV_BG, REV_HI, REV_FG = th.rev_bg, th.rev_hi, th.rev_fg
    SCAN_DIS = th.scan_dis


_sync_theme(_themes.ACTIVE)


class FlatButton:
    """macOS-proof flat button (Frame + Label composite).

    Classic ``tk.Button`` on macOS paints a light Aqua overlay / white focus
    ring over custom colors whenever the app window is the active one, which
    washes the fill out (the "weird white shade" over e.g. the motor-port
    boxes). A Frame+Label composite honours ``bg``/``fg`` in every focus state,
    so the green/amber port meaning stays visible at all times.
    """

    def __init__(self, parent, text="", command=None,
                 font=("SF Pro Text", 10, "bold"),
                 bg=None, fg=None, activebg=None, activefg=None,
                 width=None, padx=6, pady=4):
        bg = PANEL2 if bg is None else bg
        fg = TEXT if fg is None else fg
        activebg = BTN_HI if activebg is None else activebg
        self._bg = bg
        self._fg = fg
        self._activebg = activebg
        self._activefg = activefg if activefg is not None else fg
        self._command = command
        self.frame = tk.Frame(parent, bg=bg, bd=0, relief="flat",
                              highlightthickness=0, cursor="hand2")
        self.label = tk.Label(self.frame, text=text, bg=bg, fg=fg,
                              font=font, cursor="hand2", highlightthickness=0)
        if width is not None:
            self.label.config(width=width)
        self.label.pack(fill="both", expand=True, padx=padx, pady=pady)
        if command is not None:
            self.frame.bind("<Button-1>", self._on_click)
            self.label.bind("<Button-1>", self._on_click)
        self.frame.bind("<Enter>", self._on_enter)
        self.frame.bind("<Leave>", self._on_leave)
        self.label.bind("<Enter>", self._on_enter)
        self.label.bind("<Leave>", self._on_leave)

    # -- helpers ----------------------------------------------------------
    def _on_click(self, _event=None) -> None:
        if self._command:
            self._command()

    def _on_enter(self, _event=None) -> None:
        self._fill(self._activebg, self._activefg)

    def _on_leave(self, _event=None) -> None:
        self._fill(self._bg, self._fg)

    def _fill(self, bg: str, fg: str) -> None:
        self.frame.config(bg=bg)
        self.label.config(bg=bg, fg=fg)

    # -- widget-compatible API (so existing callers keep working) ---------
    def config(self, **kw):
        bg = kw.pop("bg", kw.pop("background", None))
        fg = kw.pop("fg", kw.pop("foreground", None))
        if "activebackground" in kw:
            self._activebg = kw.pop("activebackground")
        if "activeforeground" in kw:
            self._activefg = kw.pop("activeforeground")
        if bg is not None:
            self._bg = bg
        if fg is not None:
            self._fg = fg
        if bg is not None or fg is not None:
            self._fill(self._bg, self._fg)
        return self.frame  # ignore everything else (state= etc.)

    configure = config

    def bind(self, seq, func, add=None) -> "FlatButton":
        for w in (self.frame, self.label):
            w.bind(seq, func, add=add)
        return self

    def cget(self, key):
        if key == "bg":
            return self._bg
        if key == "fg":
            return self._fg
        try:
            return self.frame.cget(key)
        except Exception:
            return None

    def pack(self, *a, **k):
        return self.frame.pack(*a, **k)

    def grid(self, *a, **k):
        return self.frame.grid(*a, **k)


class SpikeGui:
    """Everything drawn on screen plus the glue to the hub / keyboard."""

    def __init__(self, root: tk.Tk, loop, hub, keyboard_controller):
        self.root = root
        self.loop: asyncio.AbstractEventLoop = loop
        self.hub = hub
        self.kb = keyboard_controller

        self.speed = tk.IntVar(value=config.DEFAULT_SPEED_PERCENT)
        self.speed_step = tk.IntVar(value=config.DEFAULT_SPEED_STEP)
        self.connected = False
        self._devices = []

        self.stats = _stats.Stats()
        self._last_tick = time.monotonic()
        root.after(1000, self._stats_tick)

        # Live hub telemetry fed by the bridge's 1 Hz `state:` report.
        self._motor_angles: dict[str, int] = {}
        self._motor_rotation: dict[str, float] = {}
        self._last_angles: dict[str, int] = {}
        self._battery: int | None = None
        self._battery_temp: int | None = None
        self._motors_attached: dict[str, int] = {}
        self.hub.on_state = self._on_hub_state

        self._pad_held: set[str] = set()
        self._phys_keys: set[str] = set()
        self._last_axis: tuple[int, int, int] | None = None
        self._last_held: set[str] | None = None
        self._stop_engaged = False
        self._space_toggled_at = 0.0
        self._log_count = tk.StringVar(value="lines: 0")
        # Log lines are batched into the Text widget (~5x/sec max) so bursts
        # of hub/keyboard output never pin an older Mac to 100% CPU.
        self._log_pending: list[tuple[str, tuple]] = []
        self._log_flush_pending = False

        self.root.title(config.WINDOW_TITLE)
        self.root.geometry("720x900")
        self.root.minsize(620, 780)
        self.root.configure(bg=BG)

        self._build_style()
        self._build_ui()

        # Start the keyboard listener (non-blocking). If it did not start,
        # the macOS Accessibility permission is most likely missing.
        self.kb.start()
        if not self.kb.available:
            self._show_permission_banner()

        self._log(f"{config.APP_NAME} v{config.APP_VERSION} ready. Click SCAN to find your Hub.")
        self._pump_after()
        self._pulse()

        # Physical-key support without macOS Accessibility permission: tkinter
        # reports key events whenever THIS window has focus, no permission
        # needed. pynput stays attached too (it lets keys work even when the
        # window is not focused). Both sources feed one held-key model with
        # deduplication, so nothing double-fires.
        self.root.bind_all("<KeyPress>", self._on_tk_key, add="+")
        self.root.bind_all("<KeyRelease>", self._on_tk_key_release, add="+")
        self._quitting = False

    # ------------------------------------------------------------------ UI
    def _build_style(self) -> None:
        s = ttk.Style()
        try:
            s.theme_use("clam")
        except Exception:
            pass
        s.configure("TFrame", background=BG)
        s.configure("TLabel", background=BG, foreground=TEXT)
        s.configure("TLabelframe", background=BG, foreground=CYAN,
                    bordercolor=BORDER, relief="flat",
                    font=("SF Pro Text", 11, "bold"))
        s.configure("TLabelframe.Label", background=BG, foreground=CYAN)
        s.configure("TButton", background=BTN, foreground=TEXT,
                    bordercolor=BORDER, focuscolor=BTN,
                    lightcolor=BTN, darkcolor=BTN, padding=5)
        s.map("TButton",
              background=[("active", BTN_HI), ("pressed", BTN_PR)],
              foreground=[("disabled", MUTED)])
        s.configure("Accent.TButton", background=CONNECT_BG, foreground=WHITE)
        s.map("Accent.TButton",
              background=[("active", CONNECT_HI), ("pressed", CONNECT_PR)],
              foreground=[("disabled", MUTED)])
        s.configure("TRadiobutton", background=BG, foreground=TEXT)
        s.map("TRadiobutton", background=[("active", BG)])
        s.configure("TSeparator", background=BORDER)
        s.configure("TScale", background=BG, troughcolor=PANEL2,
                    borderwidth=1, lightcolor=BG, darkcolor=BG)
        s.configure("TSpinbox",
                    fieldbackground=PANEL2, background=BTN,
                    foreground=TEXT, arrowcolor=CYAN, bordercolor=BORDER,
                    lightcolor=BTN, darkcolor=BTN,
                    selectbackground=SEL_BG, selectforeground=WHITE)
        s.map("TSpinbox",
              fieldbackground=[("disabled", PANEL2)],
              foreground=[("disabled", MUTED)],
              arrowcolor=[("disabled", MUTED)])
        s.map("TScale",
              background=[("disabled", BG)],
              troughcolor=[("disabled", PANEL2)])
        s.configure("TNotebook", background=BG, borderwidth=0,
                    tabmargins=(4, 4, 4, 0))
        s.configure("TNotebook.Tab", background=BTN, foreground=MUTED,
                    padding=(14, 6), borderwidth=0,
                    font=("SF Pro Text", 10, "bold"))
        s.map("TNotebook.Tab",
              background=[("selected", PANEL2), ("active", BTN_HI)],
              foreground=[("selected", CYAN), ("active", TEXT)])

    def _card(self, parent, text: str) -> ttk.LabelFrame:
        card = ttk.LabelFrame(parent, text=text, padding=(10, 6))
        card.pack(fill="x", padx=12, pady=(6, 0))
        return card

    def _build_ui(self) -> None:
        self.status_var = tk.StringVar(value="DISCONNECTED")
        self.conn_detail_var = tk.StringVar(value="Not connected")

        # ---- Header ----------------------------------------------------
        head = tk.Frame(self.root, bg=BG)
        head.pack(fill="x", padx=14, pady=(14, 2))
        tk.Label(
            head, text="⬢", font=("Menlo", 26), bg=BG, fg=CYAN,
        ).pack(side="left", padx=(0, 8))
        title_box = tk.Frame(head, bg=BG)
        title_box.pack(side="left")
        tk.Label(
            title_box, text=config.APP_NAME, font=("SF Pro Display", 19, "bold"),
            bg=BG, fg=TEXT,
        ).pack(anchor="w")
        tk.Label(
            title_box, text="LEGO SPIKE  ·  WASD DRIVE  ·  BLE CONTROLLER",
            font=("SF Pro Text", 8, "bold"), bg=BG, fg=MUTED,
        ).pack(anchor="w")

        # theme picker (settings)
        pal = FlatButton(
            head, text="🎨", command=self._open_theme_picker,
            bg=BTN, fg=CYAN, activebg=BTN_HI, activefg=WHITE,
            padx=8, pady=2, width=2,
        )
        pal.pack(side="right", padx=(0, 10))

        # status LED
        led = tk.Label(head, text="●", font=("Helvetica", 18), bg=BG,
                       fg=RED)
        led.pack(side="right", padx=(8, 2))
        self._led = led
        tk.Label(head, textvariable=self.status_var,
                 font=("SF Pro Text", 10, "bold"), bg=BG, fg=RED).pack(
                     side="right")

        # ---- Permission banner -----------------------------------------
        self._perm_banner = tk.Label(
            self.root,
            text=(
                "⌨ Keyboard control needs macOS Accessibility permission:\n"
                "System Settings  →  Privacy & Security  →  Accessibility  → enable\n"
                "SPIKE Keyboard Controller (relaunch the app afterwards).\n"
                "Until then, use the on-screen WASD pad below."
            ),
            bg=BANNER_BG, fg=BANNER_FG, justify="left", wraplength=640,
            padx=12, pady=8, font=("SF Pro Text", 10),
        )

        # ---- Tabbed layout: CONTROLLER | STATS --------------------------
        # BOTH tabs stay permanently mapped (place + raise/lower). A plain
        # ttk.Notebook unmaps the hidden tab and remaps/re-lays-out the whole
        # thing on every switch - visible as a seconds-long blank freeze on
        # slower Macs. Lifting an already-laid-out frame is instant.
        tabbar = tk.Frame(self.root, bg=BG)
        tabbar.pack(fill="x", padx=12, pady=(6, 0))
        self._tabbar = tabbar
        self._tab_btns: dict[str, FlatButton] = {}
        for key, label in (("ctl", "▸  CONTROLLER"), ("sts", "◉  STATS")):
            b = FlatButton(
                tabbar, text=label, padx=12, pady=3,
                command=lambda k=key: self._show_tab(k),
            )
            b.pack(side="left", padx=(0, 8))
            self._tab_btns[key] = b

        content = tk.Frame(self.root, bg=BG)
        content.pack(fill="both", expand=True, padx=12, pady=(2, 4))
        self._content = content
        ctl_tab = tk.Frame(content, bg=BG)
        sts_tab = tk.Frame(content, bg=BG)
        for frame in (ctl_tab, sts_tab):
            frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        self._ctl_tab = ctl_tab
        self._sts_tab = sts_tab
        self._stats_visible = False
        ctl_tab.lift()
        self._paint_tabbar()

        # ---- Bluetooth card --------------------------------------------
        bl = self._card(ctl_tab, "◉  BLUETOOTH")
        self.device_list = tk.Listbox(
            bl, height=4, bg=PANEL2, fg=TEXT, selectbackground=SEL_BG,
            selectforeground=WHITE, highlightthickness=0, relief="flat",
            font=("SF Pro Text", 10),
        )
        self.device_list.pack(fill="x", pady=(4, 8))

        self._motors_var = tk.StringVar(value="MOTOR CHECK: —")
        self._motors_label = tk.Label(
            bl, textvariable=self._motors_var, bg=BG, fg=MUTED,
            font=("SF Pro Text", 9, "bold"), anchor="w",
        )
        self._motors_label.pack(fill="x", pady=(0, 4))

        btns = tk.Frame(bl, bg=BG)
        btns.pack(fill="x")
        for text, handler, accent, p, label in (
            ("SCAN", self._on_scan, False, None, "scan_btn"),
            ("CONNECT", self._on_connect, True, 8, "connect_btn"),
            ("DISCONNECT", self._on_disconnect, False, 8, "disconnect_btn"),
        ):
            fill = CONNECT_BG if accent else BTN
            hi = CONNECT_HI if accent else BTN_HI
            b = FlatButton(
                btns, text=text, command=handler,
                bg=fill, fg=WHITE, activebg=hi, activefg=WHITE,
                padx=12, pady=5,
            )
            b.pack(side="left", padx=(0 if p is None else p, 0))
            setattr(self, label, b)

        dg = FlatButton(
            btns, text="DIAGNOSE", command=self._on_diagnose,
            bg=DIAG_BG, fg=DIAG_FG, activebg=DIAG_HI,
            activefg=WHITE, padx=12, pady=5,
        )
        dg.pack(side="right")
        self.diagnose_btn = dg
        self._hover(btns)
        self._hover(bl)

        # connection detail line
        tk.Label(
            ctl_tab, textvariable=self.conn_detail_var, bg=BG, fg=MUTED,
            font=("SF Pro Text", 9),
        ).pack(anchor="w", padx=16, pady=(4, 0))

        # ---- Drive configuration ---------------------------------------
        drv = self._card(ctl_tab, "⚙  DRIVE CONFIG")

        self.drive_mode = tk.StringVar(value=config.DEFAULT_DRIVE_MODE)
        # FRONT 1 / FRONT 2 mirror the 2WD LEFT / RIGHT pair; BACK slots run
        # in 4WD only. BACK 2 is optional (None = not driven).
        self._front_set: dict[str, str | None] = {}
        self._back_set: dict[str, str | None] = {}
        self._slot_buttons: dict[str, FlatButton] = {}
        for key, defs in (("f1", config.FRONT_SLOT_PORTS[0]),
                          ("f2", config.FRONT_SLOT_PORTS[1]),
                          ("b1", config.BACK_SLOT_PORTS[0]),
                          ("b2", config.BACK_SLOT_PORTS[1])):
            if key.startswith("f"):
                self._front_set[key] = defs
            else:
                self._back_set[key] = defs
        self._left_buttons: dict[str, FlatButton] = {}
        self._right_buttons: dict[str, FlatButton] = {}
        self._back_rows: dict[str, tk.Frame] = {}
        self._rev_row: Optional[tk.Frame] = None
        self._back_rows: dict[str, tk.Frame] = {}

        mode_row = tk.Frame(drv, bg=BG)
        mode_row.pack(fill="x", pady=(2, 6))
        tk.Label(mode_row, text="WHEELS", bg=BG, fg=MUTED,
                 font=("SF Pro Text", 9, "bold")).pack(side="left")
        for val, txt in (("2WD", "2 WHEEL"), ("4WD", "4 WHEEL")):
            rb = FlatButton(
                mode_row, text=txt, padx=10, pady=3,
                command=lambda v=val: self._set_drive_mode(v),
            )
            rb.pack(side="left", padx=(8, 0))
            setattr(self, f"_rb_{val}", rb)
        self._refresh_mode_colors()

        self._build_slot_row(drv, "FRONT 1", "f1", self._front_set)
        self._build_slot_row(drv, "FRONT 2", "f2", self._front_set)
        self._build_slot_row(drv, "BACK 1", "b1", self._back_set,
                             back=True)
        self._build_slot_row(drv, "BACK 2", "b2", self._back_set,
                             back=True)

        self._reversed_set: set[str] = set()
        self._reverse_buttons: dict[str, FlatButton] = {}
        rev_row = tk.Frame(drv, bg=BG)
        rev_row.pack(fill="x", pady=(4, 0))
        tk.Label(rev_row, text="⇄ REV · ", bg=BG, fg=AMBER,
                 font=("SF Pro Text", 9, "bold")).pack(side="left", padx=(0, 6))
        for port in config.AVAILABLE_PORTS:
            btn = FlatButton(
                rev_row, text=port, width=3,
                command=lambda p=port: self._toggle_reverse(p),
            )
            btn.pack(side="left", padx=2)
            self._reverse_buttons[port] = btn
        self._rev_row = rev_row
        self._refresh_reverse_colors()

        self.drive_hint = tk.Label(
            drv, text="", bg=BG, fg=MUTED,
            font=("SF Pro Text", 9), anchor="w",
        )
        self.drive_hint.pack(fill="x", pady=(6, 2))
        self._validate_drive_ports()

        # ---- Controller (on-screen pad + speed) ------------------------
        ctl = self._card(ctl_tab, "⌨  CONTROLLER")
        pad = tk.Frame(ctl, bg=BG)
        pad.pack(pady=(4, 2))
        grid = [("", "W", ""), ("A", "S", "D")]
        for r, row in enumerate(grid):
            for c, ch in enumerate(row):
                if not ch:
                    tk.Label(pad, text="  ", bg=BG).grid(
                        row=r, column=c, padx=3, pady=2)
                    continue
                kb = FlatButton(
                    pad, text=ch, width=4,
                    font=("SF Pro Display", 20, "bold"),
                    bg=PANEL2, fg=CYAN, activebg=PAD_DOWN_BG,
                    activefg=WHITE, padx=8, pady=8,
                )
                kb.grid(row=r, column=c, padx=3, pady=2)
                kb.bind("<ButtonPress-1>", lambda e, k=ch.lower(): self._pad_press(k))
                kb.bind("<ButtonRelease-1>", lambda e, k=ch.lower(): self._pad_release(k))
                setattr(self, f"_pad_{ch.lower()}", kb)

        sp = FlatButton(
            ctl, text="SPACE = HANDBRAKE", command=self._toggle_stop,
            bg=SPACE_BG, fg=SPACE_FG, activebg=SPACE_HI,
            activefg=WHITE, padx=14, pady=5,
        )
        sp.pack(pady=(2, 8))
        self.space_btn = sp
        self._hover(ctl)

        speed_row = tk.Frame(ctl, bg=BG)
        speed_row.pack(fill="x", pady=(0, 4))
        tk.Label(speed_row, text="SPEED", bg=BG, fg=MUTED,
                 font=("SF Pro Text", 9, "bold")).pack(side="left", padx=(0, 10))
        self.speed_slider = ttk.Scale(
            speed_row, from_=0, to=100, orient="horizontal",
            command=self._on_speed_change,
        )
        self.speed_slider.set(self.speed.get())
        self.speed_slider.pack(side="left", fill="x", expand=True)
        tk.Label(speed_row, textvariable=self.speed, bg=BG,
                 fg=AMBER, font=("Menlo", 11, "bold"), width=4).pack(
                     side="left", padx=(8, 0))

        step_box = tk.Frame(speed_row, bg=BG)
        step_box.pack(side="left", padx=(12, 0))
        tk.Label(step_box, text="STEP", bg=BG, fg=MUTED,
                 font=("SF Pro Text", 8, "bold")).pack(side="left")
        step_spin = ttk.Spinbox(
            step_box, from_=1, to=50, width=3, textvariable=self.speed_step,
            command=self._on_step_change, font=("Menlo", 9),
            justify="center",
        )
        step_spin.pack(side="left", padx=(4, 0))
        self.step_spin = step_spin

        # Up/Down should always change SPEED - never move the caret / value of
        # the STEP box. Bind on the widget (runs before the class binding) and
        # signal "break" so the spinbox's own arrow handling is swallowed too.
        def _spin_arrow(sign: int):
            def handler(_e=None):
                self._nudge_speed(sign * self.speed_step.get())
                return "break"
            return handler

        self._spin_up = _spin_arrow(1)
        self._spin_down = _spin_arrow(-1)
        step_spin.bind("<Up>", self._spin_up)
        step_spin.bind("<KP_Up>", self._spin_up)
        step_spin.bind("<Down>", self._spin_down)
        step_spin.bind("<KP_Down>", self._spin_down)

        up = FlatButton(
            speed_row, text="▲", width=2,
            command=lambda: self._nudge_speed(self.speed_step.get()),
            bg=BTN, fg=CYAN, activebg=BTN_HI, activefg=WHITE,
            padx=6, pady=1,
        )
        up.pack(side="left", padx=(10, 2))
        down = FlatButton(
            speed_row, text="▼", width=2,
            command=lambda: self._nudge_speed(-self.speed_step.get()),
            bg=BTN, fg=CYAN, activebg=BTN_HI, activefg=WHITE,
            padx=6, pady=1,
        )
        down.pack(side="left")

        tm = tk.Frame(ctl, bg=BG)
        tm.pack(fill="x", pady=(2, 0))
        tk.Label(tm, text="TEST MOTORS (HOLD)", bg=BG, fg=MUTED,
                 font=("SF Pro Text", 8, "bold")).pack(side="left")
        tb = FlatButton(
            tm, text="TEST / HOLD", command=self._on_test_press,
            bg=TEST_BG, fg=TEST_FG, activebg=TEST_HI,
            activefg=WHITE, padx=14, pady=5,
        )
        tb.pack(side="right")
        tb.bind("<ButtonRelease-1>", self._on_test_release)
        self.test_btn = tb

        # ---- Live log terminal -----------------------------------------
        log = self._card(ctl_tab, "▸▸  LIVE LOG  (terminal output)")
        self.log_text = tk.Text(
            log, height=11, bg=LOGBG, fg=LOGFG, insertbackground=GREEN,
            state="disabled", wrap="word", relief="flat", highlightthickness=0,
            font=("Menlo", 9), padx=8, pady=6, spacing1=1, spacing3=1,
        )
        self.log_text.pack(fill="both", expand=True)
        self.log_text.tag_config("cmd", foreground=LOG_CMD)
        self.log_text.tag_config("err", foreground=LOG_ERR)
        self.log_text.tag_config("ok", foreground=LOG_OK)
        self.log_text.tag_config("dim", foreground=LOG_DIM)
        ttk.Separator(ctl_tab).pack(fill="x", padx=12, pady=(6, 0))

        self._build_stats_page(sts_tab)

        # ---- Footer
        foot = tk.Frame(self.root, bg=BG)
        foot.pack(fill="x", padx=16, pady=(4, 8))
        tk.Label(foot, text="W = forward   A/D = turn   S = reverse   SPACE = handbrake (toggle)   ↑/↓ = speed",
                 bg=BG, fg=MUTED, font=("SF Pro Text", 8)).pack(side="left")
        tk.Label(foot, textvariable=self._log_count, bg=BG, fg=MUTED,
                 font=("Menlo", 8)).pack(side="right")

    # ----------------------------------------------------------------- stats
    # -------------------------------------------------------------- STATS tab
    def _build_stats_page(self, parent) -> None:
        """STATS tab: hero battery gauge + live tiles, per-motor rotation
        cards (like the official SPIKE app) and session / all-time tallies."""
        self._stat_vars: dict[str, tk.StringVar] = {}
        self._tile_labels: dict[str, tk.Label] = {}
        self._motor_windows: dict[str, tk.Frame] = {}
        self._motor_angle_vars: dict[str, tk.StringVar] = {}
        self._motor_angle_labels: dict[str, tk.Label] = {}
        self._motor_spin_vars: dict[str, tk.StringVar] = {}
        self._motor_bars: dict[str, tk.Canvas] = {}
        self._motor_accent: dict[str, str] = {}

        # ---- HERO: battery gauge + live tiles ----------------------------
        hero = tk.Frame(parent, bg=BG)
        hero.pack(fill="x", padx=14, pady=(14, 4))

        gauge_box = tk.Frame(hero, bg=PANEL, padx=14, pady=10)
        gauge_box.pack(side="left", anchor="n")
        self._battery_canvas = tk.Canvas(
            gauge_box, width=128, height=132, bg=PANEL, highlightthickness=0)
        self._battery_canvas.pack()

        tiles = tk.Frame(hero, bg=BG)
        tiles.pack(side="left", fill="both", expand=True, padx=(10, 0))
        for key, label in (("live_conn", "CONNECTION"),
                           ("live_speed", "SPEED"),
                           ("live_theme", "THEME"),
                           ("live_temp", "HUB TEMP")):
            box = tk.Frame(tiles, bg=PANEL2, padx=14, pady=6)
            box.pack(fill="x", pady=(0, 6))
            tk.Label(box, text=label, bg=PANEL2, fg=MUTED,
                     font=("SF Pro Text", 8, "bold")).pack(anchor="w")
            var = tk.StringVar(value="—")
            self._stat_vars[key] = var
            val = tk.Label(box, textvariable=var, bg=PANEL2, fg=CYAN,
                           font=("Menlo", 12, "bold"), anchor="w")
            val.pack(fill="x")
            self._tile_labels[key] = val

        # ---- MOTOR ROTATION cards ----------------------------------------
        motor_card = ttk.LabelFrame(
            parent, text="◉  MOTOR ROTATION  ·  LIVE", padding=(10, 8))
        motor_card.pack(fill="x", padx=12, pady=(8, 0))
        self._motor_shell = motor_card
        mrow = tk.Frame(motor_card, bg=BG)
        mrow.pack(fill="x")
        self._motor_row = mrow
        for i, letter in enumerate("ABCDEF"):
            self._build_motor_card(mrow, letter, i % 2 == 0)
        self._motor_empty = tk.Label(motor_card, bg=BG, fg=MUTED,
                                     text="No motors detected yet — connect "
                                          "and spin a motor to track it here.",
                                     font=("SF Pro Text", 9))
        self._motor_empty.pack(fill="x", pady=(4, 2))

        # ---- TALLIES: session / all-time --------------------------------
        cols = tk.Frame(parent, bg=BG)
        cols.pack(fill="both", expand=True, padx=14, pady=(8, 2))
        sess_card = ttk.LabelFrame(cols, text="◷  THIS SESSION", padding=(12, 8))
        life_card = ttk.LabelFrame(cols, text="∞  ALL TIME", padding=(12, 8))
        sess_card.pack(side="left", fill="both", expand=True,
                       padx=(0, 6), pady=(6, 0))
        life_card.pack(side="right", fill="both", expand=True,
                       padx=(6, 0), pady=(6, 0))
        for card, rows in ((sess_card, _stats.SESSION_ROWS),
                           (life_card, _stats.LIFETIME_ROWS)):
            for idx, (key, label, fmt) in enumerate(rows):
                tint = PANEL if idx % 2 else BG
                row = tk.Frame(card, bg=tint, padx=8, pady=2)
                row.pack(fill="x", pady=1)
                tk.Label(row, text=label, bg=tint, fg=MUTED,
                         font=("SF Pro Text", 9), anchor="w"
                         ).pack(side="left")
                var = tk.StringVar(value="—")
                self._stat_vars[key] = var
                color = AMBER if fmt == "pct" else (GREEN if fmt == "time"
                                                    else CYAN)
                tk.Label(row, textvariable=var, bg=tint, fg=color,
                         font=("Menlo", 10, "bold"), anchor="e"
                         ).pack(side="right")
        tk.Label(parent, text="Session resets each run; all-time totals persist "
                              "across launches. Rotations are read from the "
                              "hub's own encoders.",
                 bg=BG, fg=MUTED, font=("SF Pro Text", 8)
                 ).pack(anchor="w", padx=16, pady=(4, 8))
        self._draw_battery_gauge()
        self._refresh_stats_page()

    def _build_motor_card(self, parent, letter: str, even: bool) -> None:
        """One live rotation card per port (angle + accumulated rotation)."""
        box = tk.Frame(parent, bg=PANEL2, padx=8, pady=8)
        box.pack(side="left", fill="both", expand=True, padx=(0, 6))
        self._motor_windows[letter] = box

        badge = tk.Frame(box, bg=PANEL2)
        badge.pack(anchor="w")
        dot = tk.Label(badge, text=letter, bg=CYAN, fg="#03121a", width=2,
                       font=("SF Pro Text", 11, "bold"))
        dot.pack(side="left")
        tk.Label(badge, text="  PORT", bg=PANEL2, fg=MUTED,
                 font=("SF Pro Text", 8, "bold")).pack(side="left")
        self._motor_accent[letter] = CYAN

        angle_var = tk.StringVar(value="0°")
        self._motor_angle_vars[letter] = angle_var
        angle_label = tk.Label(box, textvariable=angle_var, bg=PANEL2,
                               fg=dot.cget("bg"), font=("Menlo", 16, "bold"),
                               anchor="w")
        angle_label.pack(fill="x", pady=(2, 0))
        self._motor_angle_labels[letter] = angle_label

        spin_var = tk.StringVar(value="—")
        self._motor_spin_vars[letter] = spin_var
        tk.Label(box, textvariable=spin_var, bg=PANEL2, fg=MUTED,
                 font=("SF Pro Text", 8, "bold"), anchor="w"
                 ).pack(fill="x", pady=(1, 4))

        bar = tk.Canvas(box, height=8, bg=PANEL2, highlightthickness=0)
        bar.pack(fill="x")
        self._motor_bars[letter] = bar

    def _draw_battery_gauge(self) -> None:
        """Redraw the hub-charge ring on the hero canvas (no flicker: full
        redraw is a single small canvas at ~1 Hz)."""
        c = getattr(self, "_battery_canvas", None)
        if c is None or not c.winfo_exists():
            return
        c.delete("all")
        cx, cy, r, wgt = 64, 66, 44, 11
        pct = self._battery
        start, ext = 135.0, -270.0
        # track ring
        c.create_arc(cx - r, cy - r, cx + r, cy + r, start=start, extent=ext,
                     style="arc", outline=PANEL2, width=wgt)
        color = MUTED
        if pct is not None:
            color = GREEN if pct >= 50 else (AMBER if pct >= 20 else RED)
            frac = max(0.0, min(100, int(pct))) / 100.0
            if frac > 0:
                c.create_arc(cx - r, cy - r, cx + r, cy + r, start=start,
                             extent=ext * frac, style="arc", outline=color,
                             width=wgt)
        val_color = TEXT if pct is not None else MUTED
        c.create_text(cx, cy - 10, text=f"{pct}%" if pct is not None else "—",
                      fill=val_color, font=("Menlo", 26, "bold"))
        c.create_text(cx, cy + 14, text="HUB CHARGE", fill=MUTED,
                      font=("SF Pro Text", 8, "bold"))
        t = self._battery_temp
        c.create_text(cx, cy + 32, text=f"{t}°C" if t is not None else "",
                      fill=color, font=("SF Pro Text", 9, "bold"))

    def _refresh_stats_page(self) -> None:
        st = self.stats
        for key, _label, fmt in _stats.SESSION_ROWS:
            if key == "uptime":
                val = _stats.FORMAT["time"](st.uptime())
            else:
                val = _stats.FORMAT[fmt](st.sess.get(key, 0))
            var = self._stat_vars.get(key)
            if var is not None:
                var.set(val)
        for key, _label, fmt in _stats.LIFETIME_ROWS:
            var = self._stat_vars.get(key)
            if var is not None:
                var.set(_stats.FORMAT[fmt](st.life.get(key, 0)))
        try:
            conn = self.status_var.get()
            shown = "CONNECTED" if self.connected else (
                "CONNECTING..." if conn.startswith("CONNECT") else "OFFLINE")
        except Exception:
            shown = "OFFLINE"
        conn_color = GREEN if self.connected else (
            AMBER if shown == "CONNECTING..." else RED)
        self._set_tile("live_conn", shown, conn_color)
        self._set_tile("live_speed", f"{self.speed.get()}%", CYAN)
        self._set_tile("live_theme", THEME_NAME, AMBER)
        self._set_tile("live_temp",
                       f"{self._battery_temp}°C" if self._battery_temp is not None
                       else "—", MUTED)
        self._draw_battery_gauge()
        self._refresh_motor_cards()

    def _set_tile(self, key: str, text: str, color: str) -> None:
        var = self._stat_vars.get(key)
        if var is not None:
            var.set(text)
        label = self._tile_labels.get(key)
        if label is not None:
            try:
                label.config(fg=color)
            except Exception:
                pass

    def _refresh_motor_cards(self) -> None:
        """Update + show/hide the per-port rotation cards from telemetry.

        Pack/unpack only happens when the set of ACTIVE ports actually changes
        (not every frame) so live rotation updates never relayout the layout.
        """
        active_set: dict[str, bool] = {}
        for letter in "ABCDEF":
            active_set[letter] = (
                self._motors_attached.get(letter, 0) > 0
                or self._motor_angles.get(letter, 0) != 0
                or self._motor_rotation.get(letter, 0) > 0)
        prev = getattr(self, "_motor_active", None)
        if prev is None:
            prev = {l: True for l in "ABCDEF"}
        for letter in "ABCDEF":
            on = active_set[letter]
            col = self._motor_windows.get(letter)
            if col is None:
                continue
            if on != prev.get(letter, False):
                if on:
                    col.pack(side="left", fill="both", expand=True,
                             padx=(0, 6))
                else:
                    col.pack_forget()
            if not on:
                continue
            angle = self._motor_angles.get(letter, 0)
            self._motor_angle_vars[letter].set(f"{angle:,}°")
            rot = self._motor_rotation.get(letter, 0.0)
            self._motor_spin_vars[letter].set(
                f"↻ {int(round(rot)):,}° this run")
            fill = self._motor_accent.get(letter, CYAN)
            label = self._motor_angle_labels.get(letter)
            if label is not None:
                label.config(fg=fill)
            bar = self._motor_bars.get(letter)
            if bar is not None:
                self._redraw_motor_bar(bar, rot, fill, on)
        self._motor_active = active_set
        active = sum(1 for v in active_set.values() if v)
        empty = getattr(self, "_motor_empty", None)
        if empty is not None:
            if active:
                empty.pack_forget()
            else:
                empty.pack(fill="x", pady=(4, 2))

    def _redraw_motor_bar(self, canvas, rotation: float, color: str,
                          on: bool) -> None:
        """Tiny degree-of-rotation bar: fills over a fixed 720° span."""
        try:
            canvas.delete("all")
            w = max(1, int(canvas.winfo_width()))
        except Exception:
            return
        h = 8
        canvas.create_rectangle(0, 0, w, h, fill=PANEL, outline="")
        if on:
            frac = min(1.0, rotation / 720.0)
            canvas.create_rectangle(0, 0, max(2, int(w * frac)), h,
                                    fill=color, outline="")

    def _stats_tick(self) -> None:
        now = time.monotonic()
        dt = now - self._last_tick
        self._last_tick = now
        try:
            driving = bool(self._last_axis and self._last_axis != (0, 0, 0))
        except Exception:
            driving = False
        if dt > 0:
            if self.connected:
                self.stats.accu("connected_time", dt)
            if driving:
                self.stats.accu("driving_time", dt)
        self.stats.save()
        if getattr(self, "_stats_visible", False):
            # Refresh only while the STATS tab is on screen - touching the
            # widgets of a hidden tab forces a full-window relayout.
            try:
                self._refresh_stats_page()
            except Exception:
                pass
        self.root.after(1000, self._stats_tick)

    # ------------------------------------------------------------- telemetry
    def _paint_tabbar(self) -> None:
        """Highlight the active tab on the custom strip."""
        for key, btn in self._tab_btns.items():
            try:
                if not btn.winfo_exists():
                    continue
                active = (key == ("sts" if self._stats_visible else "ctl"))
                btn.config(bg=PANEL2 if active else BTN,
                           fg=CYAN if active else MUTED,
                           activebg=BTN_HI)
            except Exception:
                pass

    def _show_tab(self, key: str) -> None:
        """Switch tabs by raising the frame - both stay mapped, so no relayout
        cost and no "everything unloads" freeze on slower Macs."""
        if key == "sts":
            if not getattr(self, "_stats_visible", False):
                self._stats_visible = True
                self._sts_tab.lift()
                self._paint_tabbar()
                try:
                    self._refresh_stats_page()
                except Exception:
                    pass
        else:
            if getattr(self, "_stats_visible", True):
                self._stats_visible = False
                self._ctl_tab.lift()
                self._paint_tabbar()

    def _on_hub_state(self, state: dict) -> None:
        """Live 1 Hz telemetry from the hub bridge: battery + motor angles.

        Angles are cumulative degrees; the per-port delta each second is the
        rotation that motor actually did, accumulated into the stats (session
        + all-time) so "how much has each motor rotated" is tracked for real.
        """
        if "battery" in state:
            self._battery = state["battery"]
            self.stats.max("max_battery", state["battery"])
        if "temperature" in state:
            self._battery_temp = state["temperature"]
        for letter in "ABCDEF":
            if letter not in state:
                continue
            value = int(state[letter])
            self._motor_angles[letter] = value
            prev = self._last_angles.get(letter, value)
            self._last_angles[letter] = value
            delta = abs(value - prev)
            if delta > 36000:
                # angle counter reset / replaced motor: re-baseline WITHOUT
                # counting the spike, so later deltas stay meaningful.
                self._last_angles[letter] = value
                continue
            if delta:
                self._motor_rotation[letter] = (
                    self._motor_rotation.get(letter, 0.0) + delta)
                self.stats.accu("motor_rotation", delta)
                try:
                    self.stats.accu(f"rot_{letter}", delta)
                except Exception:
                    pass
        if getattr(self, "_stats_visible", False):
            try:
                self._refresh_stats_page()
            except Exception:
                pass

    def _hover(self, parent) -> None:
        """Subtle hover glow for tk.Buton groups."""
        def on_enter(e):
            try:
                e.widget.configure(bg=getattr(e.widget, "_hi", BTN_HI))
            except Exception:
                pass
        def on_leave(e):
            try:
                e.widget.configure(bg=e.widget._rest)
            except Exception:
                pass
        for child in parent.winfo_children():
            if isinstance(child, tk.Button):
                child._rest = child.cget("bg")
                base = child.cget("bg")
                child._hi = base if base.startswith("#2") and base != BTN else BTN_HI
                child.bind("<Enter>", on_enter)
                child.bind("<Leave>", on_leave)

    # --------------------------------------------------------------- themes
    def apply_theme(self, name: str) -> None:
        """Switch the active theme: recolour every global, persist the choice,
        then rebuild the window with the live state preserved."""
        _sync_theme(_themes.get(name))
        _themes.persist(name)
        self.stats.bump("theme_switches")
        self._rebuild_ui()
        try:
            if self._theme_win.winfo_exists():
                self._render_theme_dialog()
        except Exception:
            pass
        self._log(f"theme: {name} applied")

    def _rebuild_ui(self) -> None:
        """Recreate the whole window with the current theme while keeping the
        log text, device list, connection status and drive config intact."""
        try:
            self._flush_log()  # flush any batched lines before snapshotting
        except Exception:
            self._log_flush_pending = False
        try:
            log_text = self.log_text.get("1.0", "end-1c")
        except Exception:
            log_text = ""
        try:
            sel = self.device_list.curselection()
            dev_sel = int(sel[0]) if sel else None
        except Exception:
            dev_sel = None
        try:
            banner_shown = bool(self._perm_banner.winfo_manager())
        except Exception:
            banner_shown = False
        devices = list(getattr(self, "_devices", []))
        status = self.status_var.get()
        led_color = getattr(self, "led_color", RED)
        detail = self.conn_detail_var.get()
        connected = bool(getattr(self, "connected", False))
        drive_mode = self.drive_mode.get()
        front = dict(self._front_set)
        back = dict(self._back_set)
        reversed_set = set(self._reversed_set)
        speed = self.speed.get()
        step = self.speed_step.get()
        try:
            motors_text = self._motors_var.get()
            motors_fg = self._motors_label.cget("fg")
        except Exception:
            motors_text = "MOTOR CHECK: —"
            motors_fg = MUTED

        for w in list(self.root.winfo_children()):
            if w is getattr(self, "_theme_win", None):
                continue  # keep the theme picker (separate window) alive
            w.destroy()
        self.root.configure(bg=BG)
        self._build_style()
        self._devices = devices
        self._build_ui()

        # ---- restore live state ---------------------------------------
        self._fill_device_list(devices, dev_sel)
        if log_text:
            self.log_text.config(state="normal")
            self.log_text.delete("1.0", "end")
            self.log_text.insert("1.0", log_text)
            self.log_text.config(state="disabled")
            try:
                n = len(self.log_text.get("1.0", "end-1c").splitlines())
                self._log_count.set(f"lines: {n}")
            except Exception:
                pass
        self._set_status(status, led_color)
        self.conn_detail_var.set(detail)
        self.connected = connected
        self.drive_mode.set(drive_mode)
        self._refresh_mode_colors()
        self._front_set.update(front)
        self._back_set.update(back)
        for key in ("f1", "f2", "b1", "b2"):
            if key in self._slot_buttons:
                self._refresh_slot_colors(key)
        self._reversed_set = set(reversed_set)
        self._refresh_reverse_colors()
        self._apply_mode_rows()
        self._validate_drive_ports()
        self.speed.set(speed)
        try:
            self.speed_slider.set(speed)
        except Exception:
            pass
        self.speed_step.set(step)
        self._update_stop_button()
        try:
            self._motors_var.set(motors_text)
            self._motors_label.config(fg=motors_fg)
        except Exception:
            pass
        if banner_shown:
            self._show_permission_banner()
        self._show_pad_keys(self._phys_keys | self._pad_held)

    def _fill_device_list(self, devices, select_idx=None) -> None:
        self.device_list.delete(0, "end")
        for d in devices:
            kind = {"spike": "SPIKE", "hub": "HUB", "unknown": "UNKNOWN"}[
                d["kind"]]
            color = {"SPIKE": " ⬢", "HUB": " ·", "UNKNOWN": ""}[kind]
            self.device_list.insert(
                "end", f"{d['name']}  [{kind}]{color}  {d['id']}")
        if select_idx is not None and 0 <= select_idx < len(devices):
            self.device_list.selection_set(select_idx)

    def _open_theme_picker(self) -> None:
        win = getattr(self, "_theme_win", None)
        try:
            exists = win is not None and bool(win.winfo_exists())
        except Exception:
            exists = False
            win = None
            self._theme_win = None
        if exists:
            win.deiconify()
            win.lift()
            self._render_theme_dialog()
            return
        win = tk.Toplevel(self.root)
        win.title("🎨 Themes")
        win.configure(bg=BG)
        win.geometry("380x520+80+80")
        win.minsize(320, 360)
        win.transient(self.root)
        self._theme_win = win
        win.protocol("WM_DELETE_WINDOW", win.withdraw)
        win.bind("<MouseWheel>", self._on_theme_mousewheel, add="+")
        self._render_theme_dialog()

    def _on_theme_mousewheel(self, event) -> str:
        """Trackpad / mouse-wheel scrolling inside the theme picker.

        Bound on the Toplevel (one per window lifetime) and on the scrollable
        widgets themselves, so scrolling works wherever the pointer is. The
        current canvas is looked up live because it is rebuilt on every
        selection.
        """
        canvas = getattr(self, "_theme_canvas", None)
        if canvas is None or not canvas.winfo_exists():
            return "break"
        try:
            d = event.delta
        except AttributeError:
            d = 0
        if not d:
            return "break"
        units = -int(d)
        if abs(d) < 3:
            units *= 2  # macOS trackpad sends fine-grained deltas
        canvas.yview_scroll(units, "units")
        return "break"

    def _render_theme_dialog(self) -> None:
        win = getattr(self, "_theme_win", None)
        if win is None or not win.winfo_exists():
            return
        # remember where the list was scrolled to so a re-palette rebuild does
        # not fling the user back to the top
        old_y = None
        canvas = getattr(self, "_theme_canvas", None)
        if canvas is not None:
            try:
                if canvas.winfo_exists():
                    old_y = canvas.yview()[0]
            except Exception:
                pass
        for w in win.winfo_children():
            w.destroy()

        head = tk.Frame(win, bg=BG)
        head.pack(fill="x", padx=12, pady=(10, 2))
        tk.Label(head, text="🎨 Themes", bg=BG, fg=TEXT,
                 font=("SF Pro Text", 14, "bold")).pack(side="left")
        tk.Label(head, text=f"active: {THEME_NAME}", bg=BG, fg=CYAN,
                 font=("SF Pro Text", 9, "bold")).pack(side="right")

        canvas = tk.Canvas(win, bg=BG, highlightthickness=0, bd=0)
        vbar = tk.Scrollbar(win, orient="vertical", command=canvas.yview)
        body = tk.Frame(canvas, bg=BG)
        body.bind("<Configure>",
                  lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        win_id = canvas.create_window((0, 0), window=body, anchor="nw")
        canvas.configure(yscrollcommand=vbar.set)
        canvas.bind("<Configure>",
                    lambda e: canvas.itemconfigure(win_id, width=e.width))
        canvas.pack(side="left", fill="both", expand=True,
                    padx=(12, 0), pady=(2, 12))
        vbar.pack(side="right", fill="y", pady=(2, 12))
        self._theme_canvas = canvas
        # the canvas/widget-level binding "breaks" so it scrolls once, and the
        # Toplevel binding catches events raised over labels/other children
        canvas.bind("<MouseWheel>", self._on_theme_mousewheel, add="+")
        body.bind("<MouseWheel>", self._on_theme_mousewheel, add="+")

        for group in _themes.GROUPS:
            names = (["default 1"] if group == "★ Default" else
                     [n for n, t in _themes.THEMES.items()
                      if t.group == group])
            sec = tk.Frame(body, bg=BG)
            sec.pack(fill="x", pady=(6, 0))
            tk.Label(sec, text=group, bg=BG, fg=MUTED,
                     font=("SF Pro Text", 9, "bold"), anchor="w"
                     ).pack(fill="x")
            for name in names:
                active = name == THEME_NAME
                b = FlatButton(
                    sec, text=("● " + name if active else name),
                    command=lambda n=name: self.apply_theme(n),
                    bg=BTN_HI if active else BTN,
                    fg=CYAN if active else TEXT,
                    activebg=BTN_HI, activefg=WHITE,
                    padx=8, pady=3,
                )
                b.pack(fill="x", pady=1)
                b.frame.bind("<MouseWheel>", self._on_theme_mousewheel,
                              add="+")

        # put the list back exactly where the user had scrolled it to
        if old_y is not None:
            try:
                canvas.update_idletasks()
                canvas.yview_moveto(old_y)
            except Exception:
                pass

    # ---------------------------------------------------------------- log
    def _log(self, msg: str, cmd: bool = False) -> None:
        """Append one line to the live terminal log (color-coded).

        stdout mirroring is immediate (buffered, cheap); the Tk Text widget
        update is coalesced to ~5x/sec max so fast bursts don't trigger a Text
        layout / repaint per line.
        """
        lower = msg.lower()
        tag = "cmd" if cmd else (
            "err" if any(k in lower for k in (
                "error", "fail", "could not", "not acknowledged", "timed out",
                "invalid", "timeout")) else
            "ok" if any(k in lower for k in (
                "connected to", "installed and running", "rdy")) else
            "dim" if any(k in lower for k in (
                "scanning", "found", "not connected", "select", "no ")) else
            ""
        )
        ts = time.strftime("[%H:%M:%S] ")
        line = ts + msg + "\n"
        try:
            print(line, end="")  # mirror live log to stdout (buffered)
        except Exception:
            pass
        try:
            self._log_pending.append((line, (tag,) if tag else ()))
        except Exception:
            pass
        if not self._log_flush_pending:
            self._log_flush_pending = True
            self.root.after(200, self._flush_log)

    def _flush_log(self) -> None:
        """Push pending lines into the Text widget in one batched update."""
        self._log_flush_pending = False
        pending = getattr(self, "_log_pending", None)
        if not pending:
            return
        self._log_pending = []
        try:
            self.log_text.config(state="normal")
        except Exception:
            return
        try:
            for line, tags in pending:
                self.log_text.insert("end", line, tags)
            if len(self.log_text.get("1.0", "end-1c")) > 15000:
                self.log_text.delete("1.0", "200.0")
            # cheap line count: read the row of the "end" mark, no splitlines()
            try:
                n = int(self.log_text.index("end-1c").split(".")[0])
                self._log_count.set(f"lines: {n}")
            except Exception:
                pass
            self.log_text.see("end")
        finally:
            try:
                self.log_text.config(state="disabled")
            except Exception:
                pass

    def _pulse(self) -> None:
        """Slow LED pulse animation."""
        try:
            base = self.led_color
        except Exception:
            base = RED
        try:
            self._led.config(fg=base)
        except Exception:
            pass
        self.root.after(700, self._pulse)

    # ------------------------------------------------------------- events
    def _show_permission_banner(self) -> None:
        self._perm_banner.pack(
            fill="x", padx=12, pady=(4, 0), before=self._tabbar)

    def _on_scan(self) -> None:
        self.scan_btn.config(state="disabled", bg=SCAN_DIS)
        self.stats.bump("scans")
        self.loop.create_task(self._scan_async())

    async def _scan_async(self) -> None:
        try:
            devices = await self.hub.scan()
            self._devices = devices
            self._fill_device_list(devices)
            if devices:
                self.stats.bump("hubs_found", len(devices))
            else:
                self._log(
                    "No LEGO SPIKE Hub found. Make sure the Hub is turned on and nearby."
                )
        except Exception as exc:
            self._log(f"Scan error: {exc}")
        finally:
            self.scan_btn.config(state="normal", bg=BTN)

    def _on_connect(self) -> None:
        sel = self.device_list.curselection()
        if not sel:
            self._log("Select a hub from the list first.")
            return
        dev = self._devices[int(sel[0])]["device"]
        self.stats.bump("connect_attempts")
        self.connect_btn.config(state="disabled", bg=CONNECT_DIS)
        self.loop.create_task(self._connect_async(dev))

    async def _connect_async(self, dev) -> None:
        self._set_status("CONNECTING", AMBER)
        self.conn_detail_var.set("Connecting...")
        ok = await self.hub.connect(dev)
        self.connect_btn.config(state="normal", bg=CONNECT_BG)
        if ok:
            self.connected = True
            self.stats.bump("connect_ok")
            self._set_status("CONNECTED", GREEN)
            name = getattr(dev, "name", None) or "Hub"
            self.conn_detail_var.set(f"Connected to {name}")
            self.kb.reset_last()
        else:
            self.connected = False
            self.stats.bump("connect_fail")
            self._set_status("DISCONNECTED", RED)
            self.conn_detail_var.set("Disconnected")
            self._log("Could not connect to the Hub.")

    def _on_disconnect(self) -> None:
        if not self.connected:
            self._log("Already disconnected.")
            return
        self.disconnect_btn.config(state="disabled", bg=SCAN_DIS)
        self.loop.create_task(self._disconnect_async())

    async def _disconnect_async(self) -> None:
        try:
            self._log("Disconnecting...")
            await self.hub.disconnect()
        except Exception as exc:
            self._log(f"Disconnect error: {exc}")
        finally:
            self.connected = False
            self.kb.reset_last()
            self._set_status("DISCONNECTED", RED)
            self.conn_detail_var.set("Disconnected")
            self.disconnect_btn.config(state="normal", bg=BTN)

    def _on_diagnose(self) -> None:
        sel = self.device_list.curselection()
        if not sel:
            self._log("Select a hub to diagnose first.")
            return
        dev = self._devices[int(sel[0])]["device"]
        self.stats.bump("diagnostics")
        self.diagnose_btn.config(state="disabled", bg=DIAG_DIS)
        self.loop.create_task(self._diagnose_async(dev))

    async def _diagnose_async(self, dev) -> None:
        from diagnose_hub import diagnose_device

        await diagnose_device(dev, self._log)
        self.diagnose_btn.config(state="normal", bg=DIAG_BG)

    # ------------------------------------------------------------ pad keys
    def _target_key(self, sym: str) -> str | None:
        """Map a keysym to one of w/a/s/d (or None)."""
        s = sym.lower()
        return s if s in ("w", "a", "s", "d") else None

    def _on_tk_key(self, event) -> str | None:
        k = self._target_key(event.keysym)
        if k:
            if k not in self._phys_keys:
                self._log(f"key: {k} down")
                self.stats.bump(f"key_{k.upper()}")
                self._phys_keys.add(k)
                self._apply_held()
            return "break"
        vs = getattr(event, "keysym", "")
        if vs in ("Up", "KP_Up"):
            self._log(f"key: speed +{self.speed_step.get()}")
            self._nudge_speed(self.speed_step.get())
            return "break"
        if vs in ("Down", "KP_Down"):
            self._log(f"key: speed -{self.speed_step.get()}")
            self._nudge_speed(-self.speed_step.get())
            return "break"
        if vs == "space":
            self._toggle_stop()
            return "break"
        if vs in ("q", "Q", "Escape"):
            self.loop.create_task(self._quit_async())
            return "break"
        return None

    def _on_tk_key_release(self, event) -> None:
        k = self._target_key(event.keysym)
        if k and k in self._phys_keys:
            self._log(f"key: {k} up")
            self._phys_keys.discard(k)
            self._apply_held()

    # -------------------------------------------------------------------
    # Held-key model. Physical keys (tk or pynput) and the on-screen pad are
    # merged into one set; the effective drive vector and a deduplicated motor
    # send are derived from the UNION, so duplicate sources cannot double-fire.
    # -------------------------------------------------------------------
    def _command_for(self, held: set[str]) -> str:
        f = "w" in held
        b = "s" in held and not f
        l = "a" in held
        r = "d" in held and not l
        if f:
            if l: return "forward-left"
            if r: return "forward-right"
            return "forward"
        if b:
            if l: return "backward-left"
            if r: return "backward-right"
            return "backward"
        if l: return "left"
        if r: return "right"
        return "stop"

    def _axis_for(self, cmd: str, speed: int) -> tuple[int, int]:
        mapping = {
            "forward": (speed, speed),
            "backward": (-speed, -speed),
            "left": (-speed, speed),
            "right": (speed, -speed),
            "forward-left": (0, speed),
            "forward-right": (speed, 0),
            "backward-left": (0, -speed),
            "backward-right": (-speed, 0),
            "stop": (0, 0),
        }
        return mapping.get(cmd, mapping["stop"])

    def _send_axis(self, left: int, right: int, back: int = 0) -> None:
        if not self.connected:
            return
        if (left, right, back) == self._last_axis:
            return
        self._last_axis = (left, right, back)
        self.stats.bump("drive_commands")
        self._log(f"drive: L{left} R{right}" +
                  (f" B{back}" if back else ""))
        self.loop.create_task(self.hub.drive(left, right, back))
        # Turn the asyncio crank RIGHT NOW so the command leaves on the very
        # next beat instead of waiting for the next ~40 ms pump tick.
        self._kick()

    def _kick(self) -> None:
        """Advance the asyncio loop once, immediately.

        Lets a just-queued BLE send run on the next event-loop pass rather than
        waiting up to a full pump interval - keeps key presses feeling instant
        while the app itself stays on a light, low-CPU pump cadence.
        """
        try:
            self.loop.run_until_complete(asyncio.sleep(0))
        except RuntimeError:
            pass
        except Exception:
            pass

    def _apply_held(self) -> None:
        held = self._phys_keys | self._pad_held
        self._show_pad_keys(held)
        cmd = self._command_for(held)
        if cmd != "stop":
            self.stats.bump(cmd)
        if self._stop_engaged:
            # Handbrake overrides drive input and holds the robot still.
            self._last_held = None
            self._send_axis(0, 0, 0)
            return
        speed = self._current_speed()
        left, right = self._axis_for(cmd, speed)
        # BACK slots mirror only the forward/backward component: W=+speed,
        # S=-speed, otherwise 0 (steering from A/D changes nothing on the back).
        back = 0
        f = "w" in held
        b = "s" in held and not f
        if self.drive_mode.get() == "4WD":
            if f:
                back = speed
            elif b:
                back = -speed
        self._send_axis(left, right, back)
        if cmd != "stop":
            self._last_held = set(held)
        else:
            self._last_held = None

    def _pad_command(self) -> str:
        return self._command_for(self._pad_held)

    def _pad_press(self, key: str) -> None:
        btn = getattr(self, f"_pad_{key}")
        btn.configure(bg=PAD_DOWN_BG, fg=WHITE)
        self.stats.bump(f"key_{key.upper()}")
        self._pad_held.add(key)
        self._apply_held()

    def _pad_release(self, key: str) -> None:
        btn = getattr(self, f"_pad_{key}")
        btn.configure(bg=PANEL2, fg=CYAN)
        self._pad_held.discard(key)
        self._apply_held()

    def _toggle_stop(self) -> None:
        """Flip the handbrake.

        While pulled, drive commands are held at 0,0 (new key presses too);
        the currently-held keys are kept so that releasing the brake resumes
        driving the instant it is released. Pressing SPACE again releases it.
        """
        now = time.monotonic()
        if now - self._space_toggled_at < 0.3:
            return  # one press, one toggle (tk autorepeat / tk+pynput overlap)
        self._space_toggled_at = now

        self._stop_engaged = not self._stop_engaged
        self.stats.bump("space_pressed")
        if self._stop_engaged:
            self.stats.bump("handbrake_pulls")
            # Keep _phys_keys/_pad_held untouched: _apply_held() ignores them
            # while braking, but they drive again the moment the brake is off.
            self._last_held = None
            self._last_axis = (0, 0, 0)
            self._send_axis(0, 0, 0)
            self._log("HANDBRAKE: pulled  (SPACE again to release)")
        else:
            self.stats.bump("handbrake_releases")
            self._last_axis = None
            self._log("HANDBRAKE: released")
            self._apply_held()
        self._update_stop_button()

    def _update_stop_button(self) -> None:
        btn = self.space_btn
        if self._stop_engaged:
            btn.config(bg=SPACE_ON_BG, fg=WHITE, activebg=SPACE_ON_HI)
            btn.label.config(text="⏸ HANDBRAKE ON  (SPACE)")
        else:
            btn.config(bg=SPACE_BG, fg=SPACE_FG, activebg=SPACE_HI)
            btn.label.config(text="SPACE = HANDBRAKE")

    def _on_speed_change(self, val) -> None:
        self.speed.set(int(round(float(val))))
        self.stats.max("max_speed", self.speed.get())
        if self.connected:
            self.loop.create_task(self._reapply_last())

    def _on_step_change(self) -> None:
        # clamp whatever was typed into the STEP spinbox
        try:
            step = int(self.speed_step.get())
        except Exception:
            step = config.DEFAULT_SPEED_STEP
        self.speed_step.set(max(1, min(50, step)))

    def _nudge_speed(self, delta: int) -> None:
        """Change the drive speed by `delta`, clamped to the speed range."""
        try:
            step = int(delta)
        except Exception:
            step = 0
        current = self._current_speed()
        new = max(config.SPEED_MIN, min(config.SPEED_MAX, current + step))
        if new == current:
            return
        self.speed.set(new)
        self.stats.bump("arrows_up" if step > 0 else "arrows_down")
        self.stats.bump("speed_changes")
        self.stats.max("max_speed", new)
        try:
            self.speed_slider.set(new)
        except Exception:
            pass
        self._log(f"SPEED → {new}%  (step {self.speed_step.get()})")
        if self.connected:
            self.loop.create_task(self._reapply_last())

    # --------------------------------------------------- drive config
    def _build_slot_row(self, parent, label, key, store, back=False) -> None:
        """A slot row: a label + one per-motor toggle that picks which port
        drives that wheel. FRONT holding the 2WD pair; BACK drives rear wheels
        (toggled again = ghost/None = not driven)."""
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x", pady=(2, 0))
        color = AMBER if back else MUTED
        tk.Label(row, text=f"{label} ·", bg=BG, fg=color,
                 font=("SF Pro Text", 8, "bold")).pack(side="left", padx=(0, 4))
        btn = FlatButton(
            row, text="—", width=3, command=lambda k=key: self._toggle_slot(k),
        )
        btn.pack(side="left", padx=2)
        self._slot_buttons[key] = btn
        if back:
            self._back_rows[key] = row
            row.pack_forget()  # shown only when 4WD is active
        self._refresh_slot_colors(key)

    def _toggle_slot(self, key: str) -> None:
        """Cycle a slot's motor port: next available port, or None (ghost)."""
        if key in self._front_set:
            store = self._front_set
        elif key in self._back_set:
            store = self._back_set
        else:
            return
        current = store.get(key)
        used = set(self._front_set.values()) | set(self._back_set.values())
        ports = [p for p in config.AVAILABLE_PORTS if p not in used or p == current]
        try:
            idx = ports.index(current) if current in ports else -1
        except ValueError:
            idx = -1
        next_val = ports[idx + 1] if (idx + 1) < len(ports) else None
        store[key] = next_val
        self._refresh_slot_colors(key)
        self._validate_drive_ports()

    def _refresh_slot_colors(self, key: str) -> None:
        if key in self._front_set:
            store = self._front_set
            back = False
        elif key in self._back_set:
            store = self._back_set
            back = True
        else:
            return
        btn = self._slot_buttons[key]
        port = store.get(key)
        btn.config(bg=AMBER if back and port else (PORT_BG if port else PANEL2),
                   activebackground=PORT_HI if port else BTN_HI,
                   fg=PORT_FG if port else MUTED)
        btn.label.config(text=port if port else "—")

    def _set_drive_mode(self, val: str) -> None:
        self.drive_mode.set(val)
        self._refresh_mode_colors()
        self._apply_mode_rows()
        self._validate_drive_ports()

    def _apply_mode_rows(self) -> None:
        """BACK rows are only shown in 4WD (they are inert in 2WD)."""
        show = self.drive_mode.get() == "4WD"
        for row in self._back_rows.values():
            if show:
                row.pack(fill="x", pady=(2, 0), before=self._rev_row)
            else:
                row.pack_forget()

    def _refresh_mode_colors(self) -> None:
        for val in ("2WD", "4WD"):
            rb = getattr(self, f"_rb_{val}")
            active = val == self.drive_mode.get()
            rb.config(bg=BTN if active else BG, fg=CYAN if active else TEXT)

    def _toggle_reverse(self, port: str) -> None:
        if port in self._reversed_set:
            self._reversed_set.discard(port)
        else:
            self._reversed_set.add(port)
        self._refresh_reverse_colors()
        self._validate_drive_ports()
        if self.connected:
            self.loop.create_task(self._reapply_last())

    def _refresh_reverse_colors(self) -> None:
        for port, btn in self._reverse_buttons.items():
            rev = port in self._reversed_set
            btn.config(
                bg=REV_BG if rev else PANEL2,
                activebackground=REV_HI if rev else BTN_HI,
                fg=REV_FG if rev else TEXT,
            )

    def _validate_drive_ports(self) -> None:
        mode = self.drive_mode.get()
        f1 = self._front_set.get("f1")
        f2 = self._front_set.get("f2")
        b1 = self._back_set.get("b1")
        b2 = self._back_set.get("b2")
        used = [p for p in (f1, f2, b1, b2) if p]
        overlap = len(used) != len(set(used))
        needs_b1 = mode == "4WD"
        valid = f1 and f2 and (not needs_b1 or b1) and not overlap
        if not valid:
            reason = []
            if not f1:
                reason.append("FRONT 1 needs a motor")
            if not f2:
                reason.append("FRONT 2 needs a motor")
            if needs_b1 and not b1:
                reason.append("BACK 1 needs a motor")
            if overlap:
                reason.append("duplicate port")
            self.drive_hint.config(text="⚠  " + " · ".join(reason),
                                   fg=RED)
        else:
            parts = []
            for slot, port in (("F1", f1), ("F2", f2),
                               ("B1", b1), ("B2", b2)):
                if port:
                    parts.append(f"{slot}:{port}")
            reversed_txt = ""
            if self._reversed_set:
                reversed_txt = "   ⇄ UP:" + ",".join(sorted(self._reversed_set))
            self.drive_hint.config(
                text=f"DRIVING   {'   '.join(parts)}   ({mode}){reversed_txt}",
                fg=GREEN,
            )
            self._apply_drive_profile(f1, f2, b1, b2)

    def _apply_drive_profile(self, f1, f2, b1, b2) -> None:
        from lego_hub import DriveProfile

        profile = DriveProfile(
            mode=self.drive_mode.get(),
            front_ports=(f1, f2),
            back_ports=(b1, b2),
            reversed_ports=sorted(self._reversed_set),
        )
        self.hub.set_profile(profile)

    # ------------------------------------------------------------- status
    def _set_status(self, text: str, color: str) -> None:
        self.status_var.set(text)
        self.led_color = color
        try:
            self._led.config(fg=color)
        except Exception:
            pass

    # ------------------------------------------------------------ driving
    def _current_speed(self) -> int:
        return max(config.SPEED_MIN, min(config.SPEED_MAX, self.speed.get()))

    # Hidden keys for each drive command, so the on-screen pad can light up
    # even when the command came from the physical keyboard.
    _COMMAND_KEYS = {
        "forward": {"w"},
        "backward": {"s"},
        "left": {"a"},
        "right": {"d"},
        "forward-left": {"w", "a"},
        "forward-right": {"w", "d"},
        "backward-left": {"s", "a"},
        "backward-right": {"s", "d"},
    }

    def _show_pad_keys(self, keys) -> None:
        """Highlight the on-screen WASD keys matching a held-key set."""
        try:
            keys = set(keys)
        except Exception:
            keys = set()
        for k in ("w", "a", "s", "d"):
            held = k in keys
            btn = getattr(self, f"_pad_{k}")
            btn.configure(bg=PAD_DOWN_BG if held else PANEL2,
                          fg=WHITE if held else CYAN)

    def handle_key_state(self, state: dict):
        """Called by pynput when the drive vector changes (permission mode)."""
        keys = state.get("keys")
        if keys is None:
            keys = self._COMMAND_KEYS.get(state.get("command", "stop"), set())
        old = set(self._phys_keys)
        self._phys_keys = set(keys)
        for k in (self._phys_keys - old):
            if k in ("w", "a", "s", "d"):
                self.stats.bump(f"key_{k.upper()}")
        self._apply_held()
        return asyncio.sleep(0)

    def handle_stop(self):
        """Called when the last movement key is released (or on shutdown):
        stop the robot WITHOUT touching the handbrake state."""
        self._phys_keys.clear()
        self._pad_held.clear()
        self._show_pad_keys(set())
        self._last_held = None
        self._send_axis(0, 0, 0)
        return asyncio.sleep(0)

    def handle_space(self):
        self._toggle_stop()
        return asyncio.sleep(0)

    # ----------------------------------------------------- motor check
    def show_motors(self, motors: dict) -> None:
        """Live motor-attachment readout, fed by the hub's `attach:` report."""
        self.stats.bump("motor_checks")
        self._motors_attached = dict(motors)
        attached = sorted(l for l, v in motors.items() if v > 0)
        if attached:
            self._motors_var.set(
                "MOTOR CHECK: " + " ".join(f"{l}·{motors[l]}" for l in attached))
            self._motors_label.config(fg=GREEN)
        else:
            self._motors_var.set("MOTOR CHECK: none detected")
            self._motors_label.config(fg=RED)

    async def _reapply_last(self) -> None:
        if self.connected and self._last_held:
            self._apply_held()

    # ------------------------------------------------------------- test drive
    def _on_test_press(self, _event=None) -> None:
        if self.connected:
            self.stats.bump("test_spins")
            s = self._current_speed()
            self._log(f"TEST: spinning at speed {s}...")
            self.loop.create_task(self.hub.drive(s, s, s))
            self._kick()

    def _on_test_release(self, _event=None) -> None:
        if self.connected:
            self.loop.create_task(self.hub.drive(0, 0))
            self._kick()

    def _on_test_stop(self) -> None:
        if self.connected:
            self._log("STOP pressed.")
            self.loop.create_task(self.hub.drive(0, 0))
            self._kick()

    # ---------------------------------------------------------- keyboard
    def handle_quit(self):
        return self._quit_async()

    async def _quit_async(self) -> None:
        if self._quitting:
            return
        self._quitting = True
        self.stats.save(force=True)
        await self.hub.disconnect()
        self.kb.stop()
        try:
            self.root.after(50, self.root.destroy)
        except Exception:
            pass

    # -------------------------------------------------------------- pump
    def _pump_after(self) -> None:
        try:
            # Process ready asyncio callbacks without blocking the GUI.
            self.loop.run_until_complete(asyncio.sleep(0))
        except RuntimeError:
            pass
        # Adaptive cadence: run fast (~60 Hz) only while BLE traffic is in
        # flight (motor commands, responses); idle at ~25 Hz to stay light on
        # slower Macs. _kick() already fires the first command instantly, so
        # this just needs to be quick once there's actual work in the queue.
        delay = 16
        try:
            if self.connected and self.hub._outbox.empty():
                delay = 40
        except Exception:
            delay = 40
        self.root.after(delay, self._pump_after)

    def run(self) -> None:
        try:
            self.root.mainloop()
        finally:
            # Best-effort safety cleanup (stop motors) on window close.
            try:
                self.stats.save(force=True)
            except Exception:
                pass
            try:
                self.loop.run_until_complete(self.hub.disconnect())
                self.kb.stop()
            except Exception:
                try:
                    self.kb.stop()
                except Exception:
                    pass


def drv_bg(widget) -> str:
    """Background colour of a widget's parent card (used by radio toggles)."""
    for w in (widget, *widget.winfo_children(), widget.master):
        try:
            if str(w.cget("bg")).startswith("#"):
                return str(w.cget("bg"))
        except Exception:
            continue
    return PANEL