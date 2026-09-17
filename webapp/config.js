// Web port of config.py - all tunables + LEGO SPIKE BLE protocol constants.
// Values verified against the official LEGO-published SPIKE Prime docs:
//   https://lego.github.io/spike-prime-docs/
// and the LEGO Wireless Protocol 3.x specification.

const CONFIG = {
  APP_NAME: 'SPIKE Keyboard Controller',
  DEFAULT_SPEED_PERCENT: 50,
  DEFAULT_SPEED_STEP: 10,

  AVAILABLE_PORTS: ['A', 'B', 'C', 'D', 'E', 'F'],
  LEFT_SIDE_PORTS: ['C'],
  RIGHT_SIDE_PORTS: ['D'],
  FRONT_SLOT_PORTS: ['C', 'D'],
  BACK_SLOT_PORTS: ['B', null],
  DEFAULT_DRIVE_MODE: '2WD',
  REVERSED_PORTS: [],
  SPEED_MIN: 0,
  SPEED_MAX: 100,

  // ---- GATT ----
  SPIKE_SERVICE_UUID: '0000fd02-0000-1000-8000-00805f9b34fb',
  SPIKE_RX_UUID: '0000fd02-0001-1000-8000-00805f9b34fb',
  SPIKE_TX_UUID: '0000fd02-0002-1000-8000-00805f9b34fb',
  LEGO_HUB_SERVICE_UUID: '00001623-1212-efde-1623-785feabcd123',
  LEGO_HUB_CHARACTERISTIC_UUID: '00001624-1212-efde-1623-785feabcd123',

  // ---- LWP3 ----
  LWP3_MSG_PORT_OUTPUT_CMD: 0x81,
  LWP3_PORT_OUTPUT_WRITE_DIRECT_MODE_DATA: 0x51,
  LWP3_START_IMMEDIATE: 0x10,
  LWP3_END_NO_ACTION: 0x00,
  LWP3_MOTOR_MODE_SPEED: 0x01,
  LWP3_PORT_IDS: { A: 0x00, B: 0x01, C: 0x02, D: 0x03, E: 0x04, F: 0x05 },

  // ---- SPIKE 3.x framing ----
  DELIMITER: 0x02,
  NO_DELIMITER: 0xFF,
  MAX_BLOCK_SIZE: 84,
  COBS_CODE_OFFSET: 2,
  XOR: 0x03,
  PROGRAM_SLOT: 0,

  PRIME_MSG_INFO_RESPONSE: 0x01,
  PRIME_MSG_START_FILE_UPLOAD: 0x0C,
  PRIME_MSG_START_FILE_UPLOAD_RESPONSE: 0x0D,
  PRIME_MSG_TRANSFER_CHUNK: 0x10,
  PRIME_MSG_TRANSFER_CHUNK_RESPONSE: 0x11,
  PRIME_MSG_PROGRAM_FLOW: 0x1E,
  PRIME_MSG_PROGRAM_FLOW_RESPONSE: 0x1F,
  PRIME_MSG_CONSOLE: 0x21,
  PRIME_MSG_TUNNEL: 0x32,
  PRIME_MSG_TUNNEL_RESPONSE: 0x33,
  PRIME_MSG_CLEAR_SLOT: 0x46,
  PRIME_MSG_CLEAR_SLOT_RESPONSE: 0x47,

  CONNECT_TIMEOUT: 10000,
  SCAN_TIMEOUT: 5000,
};

// On-hub Python "motor bridge" script (identical to config.py).
CONFIG.HUB_BRIDGE_SCRIPT = `
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
    print(text)
    try:
        tunnel.send(text.encode())
    except Exception as e:
        print("tunnel.send err: " + repr(e))

def send_attach():
    bridge_send(attach_line())
    bridge_send("rdy")

def battery_pct():
    try:
        v = hub.battery.voltage()
        pct = int(round((v - 6000) / (8200 - 6000) * 100.0))
        return max(0, min(100, pct))
    except Exception:
        pass
    try:
        return int(hub.battery.mAh())
    except Exception:
        return -1

def battery_temp():
    try:
        return int(hub.battery.temperature())
    except Exception:
        return None

def motor_angle(letter):
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
        tunnel_send(state_line())
        last_state = now
    time.sleep_ms(20)
`;