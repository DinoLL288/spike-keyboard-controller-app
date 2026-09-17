"""Central configuration for the SPIKE Keyboard Controller.

All tunable values and LEGO SPIKE BLE protocol constants live here.
The protocol values below are taken from the official, LEGO-published
SPIKE Prime / Essential protocol documentation:

    https://lego.github.io/spike-prime-docs/

and the LEGO Wireless Protocol 3.0.00 specification:

    https://lego.github.io/lego-ble-wireless-protocol-docs/

They have been verified against the SPIKE App 3.x connection flow.
"""

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
APP_NAME = "SPIKE Keyboard Controller"
APP_VERSION = "1.2.0"
WINDOW_TITLE = "SPIKE Keyboard Controller"

DEFAULT_SPEED_PERCENT = 50          # default motor speed (0 - 100)

# Amount that the ↑/↓ arrow keys (and on-screen ▲/▼) change the speed by.
DEFAULT_SPEED_STEP = 10             # percent per key press

# ---------------------------------------------------------------------------
# Motor / drive configuration
# ---------------------------------------------------------------------------
# AVAILABLE_PORTS are the physical motor ports a SPIKE hub exposes.
AVAILABLE_PORTS = ("A", "B", "C", "D", "E", "F")

# Default drive profile: 2-wheel drive.
#   LEFT_SIDE_PORTS  = motors that power the left side
#   RIGHT_SIDE_PORTS = motors that power the right side
# A "side" may have one motor (2-wheel drive) or two motors (4-wheel drive).
# The DEFAULT uses motor C for the left side and motor D for the right side.
LEFT_SIDE_PORTS = ("C",)
RIGHT_SIDE_PORTS = ("D",)

# 4WD drive slots. FRONT 1 and FRONT 2 are the front-left / front-right motors
# (identical to the 2WD LEFT / RIGHT pair). BACK 1 and BACK 2 drive the rear;
# all back motors mirror the forward/backward command while steering stays on
# the front pair. BACK 2 is OPTIONAL: None means that wheel is simply not
# driven (e.g. the rear wheels share one shaft / one port).
FRONT_SLOT_PORTS = ("C", "D")
BACK_SLOT_PORTS = ("B", None)

# Labels shown in the GUI for the drive-config choices.
DRIVE_MODES = {
    "2WD": {
        "label": "2 Wheel Drive",
        "ports_per_side": 1,
        "default_left": ("C",),
        "default_right": ("D",),
    },
    "4WD": {
        "label": "4 Wheel Drive",
        "ports_per_side": 2,
        "default_left": ("C",),
        "default_right": ("D",),
    },
}

# Whether the drive is 2WD or 4WD ("2WD" or "4WD").
DEFAULT_DRIVE_MODE = "2WD"

# Motor ports whose direction is flipped (mounting compensation). A motor
# listed here runs at the NEGATED speed, so "forward" physically drives it the
# other way. Empty by default; toggled per-motor from the GUI.
REVERSED_PORTS: tuple = ()

# ---------------------------------------------------------------------------
# Whatever you change in the GUI speed slider is clamped to this range.
# ---------------------------------------------------------------------------
SPEED_MIN = 0
SPEED_MAX = 100

# ---------------------------------------------------------------------------
# LEGO SPIKE BLE GATT UUIDs (verified, official)
#
# The SPIKE hub exposes a single service with two characteristics. All values
# come from the official SPIKE Prime protocol docs -> "Setting up the
# connection".
# ---------------------------------------------------------------------------
SPIKE_SERVICE_UUID = "0000fd02-0000-1000-8000-00805F9B34FB"
SPIKE_RX_UUID = "0000fd02-0001-1000-8000-00805F9B34FB"   # write to hub
SPIKE_TX_UUID = "0000fd02-0002-1000-8000-00805F9B34FB"   # notify from hub

# Legacy "generic LEGO hub" service (used by Boost / Powered Up hubs and
# the SPIKE Essential hub "Hub 11"). This is the LEGO Wireless Protocol v3
# (LWP3) interface.
LEGO_HUB_SERVICE_UUID = "00001623-1212-EFDE-1623-785FEABCD123"
LEGO_HUB_CHARACTERISTIC_UUID = "00001624-1212-EFDE-1623-785FEABCD123"

# BLE company identifier assigned to LEGO System A/S by the Bluetooth SIG.
LEGO_COMPANY_ID = 0x0397  # 919 decimal

# ---------------------------------------------------------------------------
# LWP3 (LEGO Wireless Protocol v3) constants - used by SPIKE Essential and
# older Boost / Powered Up / Technic hubs.
#
# Verified against the official LEGO Wireless Protocol 3.0.00 specification:
# https://lego.github.io/lego-ble-wireless-protocol-docs/
# and the pybricksdev reference implementation.
# ---------------------------------------------------------------------------
LWP3_COMMON_HEADER_LEN = 3

# Message types (downstream).
LWP3_MSG_PORT_OUTPUT_CMD = 0x81      # Port Output Command
LWP3_MSG_HUB_PROPERTY = 0x01         # Hub Property
LWP3_MSG_HUB_ACTION = 0x02           # Hub Action

# Port Output Command sub-commands.
LWP3_PORT_OUTPUT_WRITE_DIRECT_MODE_DATA = 0x51   # WriteDirectModeData

# Startup and Completion info bits.
LWP3_START_IMMEDIATE = 0x10           # Execute immediately (no buffer)
LWP3_END_NO_ACTION = 0x00             # No specific end action

# Motor modes on the SPIKE Essential / Powered Up motors.
LWP3_MOTOR_MODE_POWER = 0x00          # POWER (% , int8) - direct PWM
LWP3_MOTOR_MODE_SPEED = 0x01          # SPEED (%, int8) - regulated speed

# Which motor mode to use by default. SPEED (0x01) gives regulated, smooth
# movement; POWER (0x00) is the most widely supported fallback.
LWP3_MOTOR_MODE = LWP3_MOTOR_MODE_SPEED

# LWP3 hub property identifiers.
LWP3_PROP_HUB_KIND = 0x0A             # HUB Property value for "hub kind"
LWP3_PROP_NAME = 0x01                 # Advertising Name

# LWP3 port id assignments (A..F == 0x00..0x05).
LWP3_PORT_IDS = {
    "A": 0x00, "B": 0x01, "C": 0x02,
    "D": 0x03, "E": 0x04, "F": 0x05,
}

# ---------------------------------------------------------------------------
# Device name heuristics for showing the user what is likely a LEGO hub.
# ---------------------------------------------------------------------------
HUB_NAME_KEYWORDS = ("hub", "spike", "technic", "lego", "mindstorms", "boost")

# ---------------------------------------------------------------------------
# Bluetooth scan settings
# ---------------------------------------------------------------------------
SCAN_TIMEOUT = 5.0            # seconds
CONNECT_TIMEOUT = 10.0        # seconds
# How long between key re-press repeats before we stop re-sending a command
# that has not changed. (We only send a command when the target state changes.)
COMMAND_DEDUPE = True

# ---------------------------------------------------------------------------
# SPIKE protocol message encoding constants (verified, from official docs)
# ---------------------------------------------------------------------------
DELIMITER = 0x02
NO_DELIMITER = 0xFF
MAX_BLOCK_SIZE = 84
COBS_CODE_OFFSET = 2
XOR = 0x03

# Program slot used when uploading the on-hub motor listener script.
PROGRAM_SLOT = 0

# SPIKE Prime protocol message ids (verified from official docs:
# https://lego.github.io/spike-prime-docs/messages.html )
PRIME_MSG_INFO_RESPONSE = 0x01
PRIME_MSG_START_FILE_UPLOAD = 0x0C
PRIME_MSG_START_FILE_UPLOAD_RESPONSE = 0x0D
PRIME_MSG_TRANSFER_CHUNK = 0x10
PRIME_MSG_TRANSFER_CHUNK_RESPONSE = 0x11
PRIME_MSG_PROGRAM_FLOW = 0x1E
PRIME_MSG_PROGRAM_FLOW_RESPONSE = 0x1F
PRIME_MSG_CONSOLE = 0x21
PRIME_MSG_TUNNEL = 0x32
PRIME_MSG_TUNNEL_RESPONSE = 0x33
PRIME_MSG_CLEAR_SLOT = 0x46
PRIME_MSG_CLEAR_SLOT_RESPONSE = 0x47

# Command message used to quit the on-hub listener script cleanly.
QUIT_TOKEN = b"bye.bye.AB"

# ---------------------------------------------------------------------------
# On-hub Python "motor bridge" script.
#
# The official SPIKE 3.x firmware does NOT accept direct `motor.run()`
# commands over BLE. Instead you upload a small Python program that listens
# on the `hub.config["module_tunnel"]` and interprets a compact text command.
#
# Command format (ASCII):
#     {count}{port}{sign}{3 digits} ...  repeated `count` times
# e.g. "2C+050D+050"       -> C at +50%, D at +50%      (2-wheel drive)
# e.g. "4C+050B+050D+050A+050" -> C,B,D,A all +50%      (4-wheel drive)
# The 3-digit value is multiplied by 10 on the hub to get deg/s.
#
# The hub replies after each command so we can throttle our writes and
# detect errors. It also sends an `attach:` report (from the official
# `device` module) listing every port's LPF-2 device id so the app can verify
# that the motors are actually plugged in. `st?` re-triggers that report.
# While the bridge runs it also broadcasts a `state:` report once a second
# (battery %, temperature and each attached motor's rotation in degrees) so
# the app can show live "how much has each motor rotated" + "how much charge".
#
# Device ids are small positive integers for a connected device and <= 0 for
# an empty port.
# ---------------------------------------------------------------------------
HUB_BRIDGE_SCRIPT = r'''
from hub import port
import motor
import device
import hub
import time

print("bridge starting")

tunnel = None
try:
    tunnel = hub.config["module_tunnel"]
    print("tunnel ok")
except Exception as e:
    print("tunnel err: " + repr(e))
    raise SystemExit(1)

PORTS = {
    "A": port.A,
    "B": port.B,
    "C": port.C,
    "D": port.D,
    "E": port.E,
    "F": port.F,
}

def attached(p):
    # firmware 1.8.149 has no device.device_id (AttributeError); return -1 and
    # stay quiet - attachment ids are informational only, never gate the motors
    try:
        return device.device_id(p)
    except Exception:
        return -1

def attach_line():
    parts = []
    for letter in "ABCDEF":
        parts.append(letter + "=" + str(attached(PORTS[letter])))
    return "attach:" + ",".join(parts)

def bridge_send(text):
    print(text)  # console echo: ALWAYS visible on the app side
    try:
        tunnel.send(text.encode())
    except Exception as e:
        print("tunnel.send err: " + repr(e))

def send_attach():
    bridge_send(attach_line())
    bridge_send("rdy")

def battery_pct():
    # SPIKE Li-ion battery: ~6.0 V empty, ~8.2 V full (measured via voltage).
    try:
        v = hub.battery.voltage()
        pct = int(round((v - 6000) / (8200 - 6000) * 100.0))
        return max(0, min(100, pct))
    except Exception:
        pass
    try:
        return int(hub.battery.mAh())  # fallback: raw remaining capacity
    except Exception:
        return -1

def battery_temp():
    try:
        return int(hub.battery.temperature())
    except Exception:
        return None

def motor_angle(letter):
    # Try every known SPIKE runtime API; the moment one works we keep it.
    try:
        return int(getattr(hub.motor, letter).angle())
    except Exception:
        pass
    try:
        return int(motor.angle(PORTS[letter]))
    except Exception:
        pass
    try:
        return int(PORTS[letter].motor.angle())
    except Exception:
        pass
    return 0

def state_line():
    parts = ["b=" + str(battery_pct())]
    t = battery_temp()
    if t is not None:
        parts.append("t=" + str(t))
    for letter in "ABCDEF":
        parts.append(letter + "=" + str(motor_angle(letter)))
    return "state:" + ",".join(parts)

def tunnel_send(text):
    # tunnel-only send: the app receives it as a TunnelMessage. The console
    # echo is skipped so 1 Hz state reports do not flood the app log.
    try:
        tunnel.send(text.encode())
    except Exception as e:
        print("tunnel.send err: " + repr(e))

def receive_tunnel_message(data):
    try:
        print("cmd: " + repr(data))
        if data == b"bye.bye.AB":
            print("bye")
            quit()
        if data == b"st?":
            send_attach()
            return
        if data == b"b?":
            tunnel_send(state_line())
            return
        if data in (b"P1", b"P2", b"P3"):
            bridge_send("got:" + chr(data[0]))
            return

        ran = []
        i = 0
        if len(data) >= 1:
            count = int(chr(data[0]))
            i = 1
            for _ in range(count):
                if i + 5 > len(data):
                    break
                p = chr(data[i])
                sign = 1 if chr(data[i + 1]) == "+" else -1
                value = int(chr(data[i + 2]) + chr(data[i + 3]) + chr(data[i + 4])) * 10
                i += 5
                if p in PORTS:
                    try:
                        motor.run(PORTS[p], sign * value)
                        ran.append(p + ("+" if sign > 0 else "-"))
                    except Exception as e:
                        print("motor err {}: {}".format(p, repr(e)))

        if ran:
            # tunnel messages always reach the app; use them as the
            # confirmation that the motors really were commanded
            bridge_send("run:" + "".join(ran))
        else:
            bridge_send("rdy")
    except Exception as e:
        print("receive err: " + repr(e))

try:
    tunnel.callback(receive_tunnel_message)
    print("callback ok")
except Exception as e:
    print("callback err: " + repr(e))

try:
    print("dir: " + repr(sorted(a for a in dir(tunnel) if not a.startswith("__"))))
except Exception as e:
    print("dir err: " + repr(e))

send_attach()
last_state = time.ticks_ms()
while True:
    now = time.ticks_ms()
    if now < last_state or now - last_state >= 1000:
        # 1 Hz telemetry: battery + motor rotations, tunnel-only (no console)
        tunnel_send(state_line())
        last_state = now
    time.sleep_ms(20)
'''
