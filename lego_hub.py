"""LEGO SPIKE Hub BLE communication.

Supports BOTH families of LEGO SPIKE hubs, using the documented / reverse
engineered protocol that matches what the hub actually exposes:

* **SPIKE Prime / Robot Inventor** ("Hub 10" / "Hub 11") exposes the newer
  ``0000fd02-0000-...`` service (RX `0000fd02-0001-...`, TX
  `0000fd02-0002-...`). Motor control is done by uploading a small Python
  "bridge" program to the hub that listens on ``hub.config["module_tunnel"]``
  and receives compact text commands over a BLE *TunnelMessage*. This is
  implemented with a correct handshake (InfoRequest) and a fully response
  driven upload flow (following the official LEGO example client).

* **SPIKE Essential** and older Boost / Powered Up / Technic hubs expose the
  generic **LEGO Wireless Protocol v3** (LWP3) service
  ``00001623-1212-...`` with a single ``00001624-1212-...`` characteristic.
  Motors are controlled directly with *Port Output Command* (0x81) / *Write
  Direct Mode Data* (0x51) messages (no upload needed).

On connect we inspect the hub's GATT services and pick the right protocol, so
the same `LegoSpikeHub.drive(...)` call works on either hub.

Protocol references:
    https://lego.github.io/spike-prime-docs/                  (SPIKE Prime 3.x)
    https://lego.github.io/lego-ble-wireless-protocol-docs/   (LWP3)
    https://github.com/LEGO/spike-prime-docs/tree/main/examples/python
"""

from __future__ import annotations

import asyncio
import binascii
import struct
from typing import Callable, Optional

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice

import config

LOG_HANDLER = Callable[[str], None]


def _noop(msg: str) -> None:
    pass


class _HubLogger:
    def __init__(self, sink: LOG_HANDLER):
        self._sink = sink or _noop

    def info(self, msg: str) -> None:
        try:
            self._sink(msg)
        except Exception:
            pass


class DriveProfile:
    """Maps drive slots to physical motor ports.

    2WD: FRONT 1 = left motor, FRONT 2 = right motor (tank steering).
    4WD: FRONT 1 + FRONT 2 act as the 2WD LEFT/RIGHT pair, and BACK 1
    (left rear) + BACK 2 (right rear, optional) mirror the forward/backward
    component while the front pair keeps steering. A ``None`` back slot means
    the rear wheel is not independently driven.
    """

    def __init__(self, mode: str = config.DEFAULT_DRIVE_MODE,
                 front_ports=config.FRONT_SLOT_PORTS,
                 back_ports=config.BACK_SLOT_PORTS,
                 reversed_ports=config.REVERSED_PORTS):
        self.mode = mode
        self.front_ports = tuple(self._norm(p) for p in front_ports)
        self.back_ports = tuple(self._norm(p) for p in back_ports)
        self._reversed = {p for p in (self._norm(p) for p in (reversed_ports or ())) if p}

    @staticmethod
    def _norm(p):
        if p is None:
            return None
        return str(p).strip().upper()

    @property
    def left_ports(self) -> tuple[str, ...]:
        """Front-left motor(s); the tank-drive left side."""
        fp = self.front_ports
        return (fp[0],) if len(fp) and fp[0] else ()

    @property
    def right_ports(self) -> tuple[str, ...]:
        """Front-right motor(s); the tank-drive right side."""
        fp = self.front_ports
        return (fp[1],) if len(fp) > 1 and fp[1] else ()

    @property
    def all_ports(self) -> tuple[str, ...]:
        ports = [p for p in self.front_ports if p]
        if self.mode == "4WD":
            ports += [p for p in self.back_ports if p]
        return tuple(ports)

    @property
    def reversed_ports(self) -> tuple[str, ...]:
        return tuple(sorted(self._reversed))

    def is_reversed(self, port: str) -> bool:
        return str(port).strip().upper() in self._reversed

    def effective_speed(self, port: str, speed: int) -> int:
        """Speed for a port after its direction flip is applied."""
        if self.is_reversed(port):
            return -speed
        return speed

    def describe(self) -> str:
        front = ",".join(p or "-" for p in self.front_ports)
        txt = f"{self.mode} | front={front}"
        if self.mode == "4WD":
            back = ",".join(p or "-" for p in self.back_ports)
            txt += f" back={back}"
        rev = ",".join(self.reversed_ports)
        return txt + (f" reversed={rev}" if rev else "")

    def ports_for_side(self, side: str) -> tuple[str, ...]:
        return self.left_ports if side == "left" else self.right_ports


# ---------------------------------------------------------------------------
# SPIKE Prime 3.x COBS encode / decode (verified against official docs)
# ---------------------------------------------------------------------------
def cobs_encode(data: bytes) -> bytearray:
    buffer = bytearray()
    code_index = 0
    block = 0

    def begin_block():
        nonlocal code_index, block
        code_index = len(buffer)
        buffer.append(config.NO_DELIMITER)
        block = 1

    begin_block()
    for byte in data:
        if byte > config.DELIMITER:
            buffer.append(byte)
            block += 1
        if byte <= config.DELIMITER or block > config.MAX_BLOCK_SIZE:
            if byte <= config.DELIMITER:
                delimiter_base = byte * config.MAX_BLOCK_SIZE
                block_offset = block + config.COBS_CODE_OFFSET
                buffer[code_index] = delimiter_base + block_offset
            begin_block()
    buffer[code_index] = block + config.COBS_CODE_OFFSET
    return buffer


def cobs_decode(data: bytes) -> bytearray:
    buffer = bytearray()

    def unescape(code: int):
        if code == 0xFF:
            return None, config.MAX_BLOCK_SIZE + 1
        value, block = divmod(code - config.COBS_CODE_OFFSET, config.MAX_BLOCK_SIZE)
        if block == 0:
            block = config.MAX_BLOCK_SIZE
            value -= 1
        return value, block

    value, block = unescape(data[0])
    for byte in data[1:]:
        block -= 1
        if block > 0:
            buffer.append(byte)
            continue
        if value is not None:
            buffer.append(value)
        value, block = unescape(byte)
    return buffer


def pack_prime_message(data: bytes) -> bytes:
    buffer = cobs_encode(data)
    for i in range(len(buffer)):
        buffer[i] ^= config.XOR
    buffer.append(config.DELIMITER)
    return bytes(buffer)


def unpack_prime_frame(frame: bytes) -> Optional[bytes]:
    if not frame:
        return None
    start = 0
    if frame[0] == 0x01:
        start += 1
    if len(frame) <= start:
        return None
    if frame[-1] != 0x02:
        return None
    unframed = bytes(b ^ config.XOR for b in frame[start:-1])
    return bytes(cobs_decode(unframed))


def crc32_padded(data: bytes, seed: int = 0) -> int:
    """CRC32 as the hub computes it (4-byte alignment padding applied)."""
    remainder = len(data) % 4
    if remainder:
        data += b"\x00" * (4 - remainder)
    return binascii.crc32(data, seed) & 0xFFFFFFFF


# ---------------------------------------------------------------------------
# Device classification helpers
# ---------------------------------------------------------------------------
def classify_device(device: BLEDevice) -> str:
    name = (device.name or "").lower()
    if "spike" in name:
        return "spike"
    if any(k in name for k in config.HUB_NAME_KEYWORDS):
        return "hub"
    return "unknown"


# ---------------------------------------------------------------------------
# Main hub class
# ---------------------------------------------------------------------------
class LegoSpikeHub:
    """A single SPIKE hub connection plus a scanner.

    Auto-detects whether a connected hub speaks SPIKE Prime 3.x (fd02) or LWP3
    (Essential), then controls the motors accordingly. Always
    :meth:`disconnect` so motors are stopped before the link drops.
    """

    def __init__(self, log: Optional[LOG_HANDLER] = None,
                 profile: Optional[DriveProfile] = None):
        self._log = _HubLogger(log)
        self._profile = profile or DriveProfile()
        self._client: Optional[BleakClient] = None
        self._connected = False
        self._protocol: Optional[str] = None   # "lwp3" or "prime"
        # LWP3 / generic hub characteristic
        self._hub_char: Optional[str] = None
        # SPIKE Prime characteristics
        self._tx_char: Optional[str] = None
        self._rx_char: Optional[str] = None
        self._bridge_loaded = False
        self._max_packet_size = 200
        self._max_chunk_size = 128
        # Motor attachment report from the hub bridge ({port: device_id}).
        self._motors: dict[str, int] = {}
        # Optional callback -> GUI, fired when the attach report arrives.
        self.on_attach = None
        # Live hub telemetry from the bridge ({port: angle}, "b": battery %,
        # "t": temperature). Updated ~1 Hz while the bridge runs.
        self._state: dict = {}
        # Optional callback -> GUI, fired when a state report arrives.
        self.on_state = None
        # RX response tracking (message id -> Future)
        self._pending: dict[int, asyncio.Future] = {}
        self._outbox: asyncio.Queue[bytes] = asyncio.Queue()
        self._tx_task: Optional[asyncio.Task] = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def protocol(self) -> Optional[str]:
        return self._protocol

    @property
    def profile(self) -> DriveProfile:
        return self._profile

    def set_profile(self, profile: DriveProfile) -> None:
        self._profile = profile

    def set_log_sink(self, log: Optional[LOG_HANDLER]) -> None:
        self._log = _HubLogger(log)
        if self._client:
            # give the same handler to whatever bleak surfaces (noop)
            pass

    # -- scanning ----------------------------------------------------------
    async def scan(self, timeout: float = config.SCAN_TIMEOUT) -> list[dict]:
        found: list[dict] = []
        seen: set[str] = set()

        def on_detect(device: BLEDevice, adv):
            addr = device.address.lower()
            if addr in seen:
                return
            seen.add(addr)
            kind = classify_device(device)
            service_uuids = [u.lower() for u in adv.service_uuids]
            is_prime = config.SPIKE_SERVICE_UUID.lower() in service_uuids
            kind = "spike" if is_prime else kind
            found.append({
                "device": device,
                "name": device.name or "(unnamed)",
                "id": device.address,
                "kind": kind,
                "is_prime": is_prime,
            })

        self._log.info("Scanning for Bluetooth devices...")
        try:
            scanner = BleakScanner(on_detect)
            await scanner.start()
            await asyncio.sleep(timeout)
            await scanner.stop()
        except Exception as exc:
            self._log.info(f"Scan error: {exc}")

        order = {"spike": 0, "hub": 1, "unknown": 2}
        found.sort(key=lambda d: (order.get(d["kind"], 3), d["name"].lower()))
        for d in found:
            marker = {"spike": "[SPIKE]", "hub": "[HUB]", "unknown": "[unknown]"}[d["kind"]]
            self._log.info(f"Found {d['name']} {marker} ({d['id']})")
        return found

    # -- connection --------------------------------------------------------
    async def connect(self, device: BLEDevice) -> bool:
        await self.disconnect()
        self._log.info("Connecting...")
        try:
            # Hard cap so the UI can never hang on "Connecting..." forever.
            return await asyncio.wait_for(
                self._do_connect(device), timeout=config.CONNECT_TIMEOUT
            )
        except asyncio.TimeoutError:
            self._log.info(
                "Timed out connecting (is the Hub on and in range?)."
            )
            await self._force_cleanup()
            return False
        except Exception as exc:
            self._log.info(f"Could not connect to the Hub. ({exc})")
            await self._force_cleanup()
            return False

    async def _do_connect(self, device: BLEDevice) -> bool:
        try:
            self._client = BleakClient(device, timeout=config.CONNECT_TIMEOUT)
            await self._client.connect()

            services = self._client.services
            self._discover_chars(services)

            if self._hub_char:
                self._protocol = "lwp3"
            elif self._rx_char and self._tx_char:
                self._protocol = "prime"
            else:
                raise RuntimeError("Hub does not expose a known LEGO interface")

            self._connected = True
            self._bridge_loaded = False
            self._pending = {}
            self._outbox = asyncio.Queue()
            self._tx_task = asyncio.create_task(self._tx_loop())

            if self._protocol == "prime":
                if self._tx_char:
                    await self._client.start_notify(
                        self._tx_char, self._on_prime_data
                    )
                ok = await self._prepare_bridge()
                if not ok:
                    raise RuntimeError("Failed to install the motor bridge on the hub.")
                self._log.info(f"Connected to {device.name or 'Hub'} (SPIKE Prime)")
            else:
                self._log.info(f"Connected to {device.name or 'Hub'} (LWP3)")
            return True

        except asyncio.TimeoutError as exc:
            self._log.info(
                f"Timed out connecting to the Hub ({exc}). "
                "Is it on and in range?"
            )
            await self._force_cleanup()
            return False
        except Exception as exc:
            self._log.info(f"Could not connect to the Hub. ({exc})")
            await self._force_cleanup()
            return False

    def _discover_chars(self, services) -> None:
        self._hub_char = None
        self._rx_char = None
        self._tx_char = None
        for svc in services:
            su = svc.uuid.lower()
            for char in svc.characteristics:
                cu = char.uuid.lower()
                if su == config.LEGO_HUB_SERVICE_UUID.lower() or \
                   cu == config.LEGO_HUB_CHARACTERISTIC_UUID.lower():
                    self._hub_char = char.uuid
                if cu == config.SPIKE_RX_UUID.lower():
                    self._rx_char = char.uuid
                if cu == config.SPIKE_TX_UUID.lower():
                    self._tx_char = char.uuid

    # -- RX handler -------------------------------------------------------
    def _on_prime_data(self, _, data: bytearray) -> None:
        """Handle notifications from a SPIKE Prime hub (COBS framed)."""
        try:
            payload = unpack_prime_frame(bytes(data))
        except Exception:
            return
        if payload is None:
            return
        msg_type = payload[0]
        fut = self._pending.pop(msg_type, None)
        if fut is not None and not fut.done():
            fut.set_result(payload)
        elif msg_type == config.PRIME_MSG_CONSOLE:
            # console/log output from the bridge program, keep going
            try:
                text = bytes(payload[1:]).rstrip(b"\x00").decode("utf-8", "replace")
                if text:
                    self._log.info(f"hub> {text}")
            except Exception:
                pass
        elif msg_type in (config.PRIME_MSG_TUNNEL,
                          config.PRIME_MSG_TUNNEL_RESPONSE):
            # tunnel data sent BY the hub can arrive as either id (both have
            # been seen in the wild); decode text + check for attach reports
            self._handle_tunnel_payload(payload)

    def _handle_tunnel_payload(self, payload: bytes) -> None:
        """Decode a hub->app tunnel message and log / react to it.

        The official TunnelMessage carries `id + size u16 + payload`; some
        firmware versions omit the size field, so try both interpretations.
        """
        body = bytes(payload[1:])
        candidates = [body]
        if len(body) >= 2:
            sz = int.from_bytes(body[:2], "little")
            if 0 <= sz <= len(body) - 2:
                candidates.insert(0, body[2:2 + sz])
        for text in candidates:
            decoded = None
            try:
                decoded = text.rstrip(b"\x00").decode(
                    "utf-8", "replace").strip()
            except Exception:
                continue
            if not decoded:
                continue
            if decoded.startswith("attach:"):
                self._store_motors(decoded)
                break
            if decoded.startswith("state:"):
                self._store_state(decoded)
                break
            self._log.info(
                f"hub> tunnel0x{payload[0]:02x}: "
                f"raw={binascii.hexlify(body).decode()} text='{decoded}'"
            )
            break

    def _store_state(self, text: str) -> None:
        """Parse a `state:` report from the bridge (battery + motor angles).

        Arrives ~1 Hz, so it is handled silently (no log spam); the GUI gets
        the parsed dict via the :attr:`on_state` callback.
        """
        state: dict = {}
        for piece in text[len("state:"):].split(","):
            if "=" not in piece:
                continue
            key, _, raw = piece.partition("=")
            try:
                value = int(float(raw))
            except ValueError:
                continue
            key = key.strip().upper()
            if key == "B":
                state["battery"] = value
            elif key == "T":
                state["temperature"] = value
            elif len(key) == 1 and key in "ABCDEF":
                state[key] = value
        self._state = state
        cb = getattr(self, "on_state", None)
        if cb is not None:
            try:
                cb(state)
            except Exception:
                pass

    # -- hub motor-attachment reports --------------------------------------
    def _store_motors(self, text: str) -> None:
        """Parse an `attach:` report from the bridge and log what we found."""
        motors: dict[str, int] = {}
        for piece in text[len("attach:"):].split(","):
            if "=" not in piece:
                continue
            letter, _, raw = piece.partition("=")
            try:
                motors[letter.upper()] = int(raw)
            except ValueError:
                continue
        self._motors = motors
        attached = sorted(l for l, v in motors.items() if v > 0)
        if attached:
            self._log.info(
                "Motors detected: " + ", ".join(
                    f"{l} (id {motors[l]})" for l in attached))
        else:
            self._log.info("Motors detected: none")
        needed = set(self._profile.all_ports)
        missing = [p for p in sorted(needed) if motors.get(p, -1) <= 0]
        if missing:
            self._log.info(
                "Check motors: no device detected on configured port(s) "
                + ", ".join(missing) + " - plug in a motor and reconnect.")
        cb = getattr(self, "on_attach", None)
        if cb is not None:
            try:
                cb(motors)
            except Exception:
                pass

    # -- serialized writer -------------------------------------------------
    async def _tx_loop(self) -> None:
        while self._connected:
            try:
                item = self._outbox.get_nowait()
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.01)
                continue
            try:
                await self._write_frame(item)
            except Exception:
                pass

    def _write_packet_size(self) -> int:
        """Max bytes we can put in a single BLE write to the hub."""
        mtu = 0
        try:
            mtu = getattr(self._client, "mtu_size", 0) or 0
        except Exception:
            mtu = 0
        if mtu >= 23:
            return max(20, min(self._max_packet_size, mtu - 3))
        # Fallback: use the hub's advertised max packet size.
        return max(20, self._max_packet_size)

    async def _write_rx(self, data: bytes, response: bool = False) -> None:
        """Write a frame to a SPIKE Prime hub, split into BLE-sized packets."""
        if not self._client or not self._rx_char:
            return
        size = self._write_packet_size()
        for i in range(0, len(data), size):
            packet = data[i: i + size]
            await self._client.write_gatt_char(
                self._rx_char, packet, response=response)

    async def _write_frame(self, data: bytes) -> None:
        if not self._client:
            return
        if self._protocol == "lwp3" and self._hub_char:
            await self._client.write_gatt_char(self._hub_char, data, response=False)
        elif self._protocol == "prime" and self._rx_char:
            await self._write_rx(data)

    def _send(self, frame: bytes) -> None:
        if self._connected:
            self._outbox.put_nowait(frame)

    async def _send_now(self, data: bytes) -> None:
        """Write used for the bridge upload (write-without-response, like the
        official LEGO example)."""
        if self._connected and self._client and self._rx_char:
            await self._write_rx(data, response=False)

    def _prime_message(self, data: bytes) -> bytes:
        return pack_prime_message(data)

    async def _send_request(self, data: bytes, expected: int,
                            timeout: float = 4.0) -> Optional[bytes]:
        """Send a Prime message and wait for a response with `expected` id."""
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[expected] = fut
        try:
            await self._send_now(self._prime_message(data))
            return await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            self._pending.pop(expected, None)
            return None
        except Exception:
            self._pending.pop(expected, None)
            return None

    # -- SPIKE Prime bridge upload ----------------------------------------
    async def _prepare_bridge(self) -> bool:
        if self._bridge_loaded:
            return True

        self._log.info("Installing motor bridge on hub (step 1/5: handshake)...")

        # 1) InfoRequest -> get max packet / chunk sizes
        info = await self._send_request(b"\x00", config.PRIME_MSG_INFO_RESPONSE)
        if info is None or len(info) < 17:
            self._log.info("No InfoResponse from hub.")
            return False
        try:
            (_msg_id, rpc_major, rpc_minor, rpc_build, fw_major, fw_minor,
             fw_build, max_packet, max_message, max_chunk,
             prod_group) = struct.unpack("<BBBHBBHHHHH", info[:17])
            self._max_packet_size = max_packet or 200
            self._max_chunk_size = max_chunk or 128
            self._log.info(
                f"Hub info: fw {fw_major}.{fw_minor}.{fw_build} "
                f"max_packet={self._max_packet_size} "
                f"max_chunk={self._max_chunk_size}")
        except struct.error:
            pass

        # 2) Clear the program slot
        self._log.info("Bridge step 2/5: clearing program slot...")
        resp = await self._send_request(
            bytes([config.PRIME_MSG_CLEAR_SLOT, config.PROGRAM_SLOT]),
            config.PRIME_MSG_CLEAR_SLOT_RESPONSE)
        if resp is not None and resp[1] != 0x00:
            self._log.info("ClearSlot not acknowledged (slot may be empty).")

        # 3) Start file upload
        self._log.info("Bridge step 3/5: starting file upload...")
        script = config.HUB_BRIDGE_SCRIPT.encode("utf-8")
        full_crc = crc32_padded(script)
        name = b"program.py\x00"
        payload = bytearray([config.PRIME_MSG_START_FILE_UPLOAD])
        payload += name
        payload.append(config.PROGRAM_SLOT)
        payload += struct.pack("<I", full_crc)
        resp = await self._send_request(
            bytes(payload), config.PRIME_MSG_START_FILE_UPLOAD_RESPONSE)
        if resp is None or resp[1] != 0x00:
            self._log.info("StartFileUpload not acknowledged.")
            return False

        # 4) Transfer chunks (CHUNK_TIMEOUT allows for slow re-assembly)
        running_crc = 0
        total = (len(script) + self._max_chunk_size - 1) // self._max_chunk_size
        for i in range(0, len(script), self._max_chunk_size):
            idx = i // self._max_chunk_size
            self._log.info(f"Bridge step 4/5: uploading chunk {idx + 1}/{total}...")
            chunk = script[i:i + self._max_chunk_size]
            running_crc = crc32_padded(chunk, running_crc)
            payload = bytes([config.PRIME_MSG_TRANSFER_CHUNK]) + \
                struct.pack("<I", running_crc) + \
                struct.pack("<H", len(chunk)) + chunk
            for attempt in range(2):
                resp = await self._send_request(
                    payload, config.PRIME_MSG_TRANSFER_CHUNK_RESPONSE,
                    timeout=10.0)
                if resp is not None and resp[1] == 0x00:
                    break
                self._log.info(
                    f"Chunk {idx + 1} attempt {attempt + 1} not acknowledged; retrying.")
            else:
                self._log.info(f"Chunk transfer {idx + 1} failed.")
                return False

        # 5) Start the program
        self._log.info("Bridge step 5/5: starting program...")
        resp = await self._send_request(
            bytes([config.PRIME_MSG_PROGRAM_FLOW, 0x00, config.PROGRAM_SLOT]),
            config.PRIME_MSG_PROGRAM_FLOW_RESPONSE)
        if resp is None or resp[1] != 0x00:
            self._log.info("ProgramFlow not acknowledged.")
            return False

        await asyncio.sleep(0.5)
        self._bridge_loaded = True
        self._log.info("Motor bridge installed and running.")
        # Diagnose the tunnel: try several wire formats so one firmware round
        # tells us which (if any) actually reaches the on-hub callback.
        probes = {
            b"P1": bytes([config.PRIME_MSG_TUNNEL]) + \
                struct.pack("<H", 2) + b"P1",
            b"P2": bytes([config.PRIME_MSG_TUNNEL]) + b"P2",
            b"P3": bytes([config.PRIME_MSG_TUNNEL_RESPONSE]) + \
                struct.pack("<H", 2) + b"P3",
        }
        for name, payload in probes.items():
            self._send(self._prime_message(payload))
            self._log.info(f"Tunnel probe sent: {name.decode()}")
        # Ask the bridge to report which ports actually have devices attached.
        self._send(self._prime_tunnel(b"st?"))
        return True

    # -- motor commands ----------------------------------------------------
    @staticmethod
    def _port_letter(port) -> str:
        return str(port).strip().upper()

    @staticmethod
    def _encode_speed(speed: int) -> int:
        return max(-100, min(100, int(round(speed))))

    def _lwp3_motor_frame(self, port: str, speed: int) -> bytes:
        """LWP3 Port Output Command / Write Direct Mode Data for one motor."""
        pid = config.LWP3_PORT_IDS[port]
        header = config.LWP3_COMMON_HEADER_LEN
        mode = config.LWP3_MOTOR_MODE
        payload = bytes([pid,
                         config.LWP3_START_IMMEDIATE | config.LWP3_END_NO_ACTION,
                         config.LWP3_PORT_OUTPUT_WRITE_DIRECT_MODE_DATA,
                         mode,
                         speed & 0xFF])
        length = header + len(payload)
        frame = bytes([length, 0x00, config.LWP3_MSG_PORT_OUTPUT_CMD]) + payload
        return frame

    def _prime_tunnel(self, cmd: bytes) -> bytes:
        payload = bytes([config.PRIME_MSG_TUNNEL]) + \
            struct.pack("<H", len(cmd)) + cmd
        return self._prime_message(payload)

    async def start_motor(self, port, speed: int) -> None:
        letter = self._port_letter(port)
        speed = self._profile.effective_speed(letter,
                                              self._encode_speed(speed))
        if not self._connected or not self._protocol:
            return
        self._log.info(f"Motor command: {letter}={speed}")
        if self._protocol == "lwp3":
            self._send(self._lwp3_motor_frame(letter, speed))
        else:
            cmd = f"1{letter}{'+' if speed >= 0 else '-'}{abs(speed):03d}"
            self._send(self._prime_tunnel(cmd.encode("ascii")))

    async def stop_motor(self, port) -> None:
        await self.start_motor(port, 0)

    async def drive(self, left_speed: int, right_speed: int,
                    back_speed: Optional[int] = None) -> None:
        """Tank drive. Positive speed = forward on that side.

        FRONT 1 receives ``left_speed`` and FRONT 2 ``right_speed`` (the same
        2WD LEFT/RIGHT pair). In 4WD mode the BACK slots mirror the
        forward/backward ``back_speed`` component while the front pair keeps
        steering; in 2WD the back slots are not driven.
        """
        left_speed = self._encode_speed(left_speed)
        right_speed = self._encode_speed(right_speed)
        back_speed = self._encode_speed(back_speed) if back_speed is not None else 0
        if not self._connected or not self._protocol:
            return

        profile = self._profile
        slots = [(p, left_speed) for p in profile.left_ports]
        slots += [(p, right_speed) for p in profile.right_ports]
        if profile.mode == "4WD":
            slots += [(p, back_speed) for p in profile.back_ports if p]

        if self._protocol == "lwp3":
            for port, sp in slots:
                self._send(self._lwp3_motor_frame(
                    port, profile.effective_speed(port, sp)))
        else:
            parts = [(port, profile.effective_speed(port, sp))
                     for port, sp in slots]
            cmd = [str(len(parts))]
            for port, sp in parts:
                sign = "+" if sp >= 0 else "-"
                cmd.append(port)
                cmd.append(sign)
                cmd.append(f"{abs(sp):03d}")
            cmd_str = "".join(cmd).encode("ascii")
            self._send(self._prime_tunnel(cmd_str))
        self._log.info(
            "Motor command: " + " ".join(f"{p}={sp}" for p, sp in slots))

    async def stop(self) -> None:
        """Halt every motor port, not just the configured drive slots.

        Programs may spin motors on any of the hub's ports (A..F), so stopping
        only the drive pair leaves standalone motors running.
        """
        if not self._connected or not self._protocol:
            return
        profile = self._profile
        ports = list(dict.fromkeys(profile.all_ports + tuple(config.AVAILABLE_PORTS)))

        if self._protocol == "lwp3":
            for port in ports:
                self._send(self._lwp3_motor_frame(port, 0))
            return

        parts = []
        for port in ports:
            parts.append(port)
            parts.append("+")
            parts.append("000")
        cmd_str = "".join([str(len(parts) // 3)] + parts).encode("ascii")
        self._send(self._prime_tunnel(cmd_str))
        self._log.info("Motor command: " + " ".join(f"{p}=0" for p in ports))

    # -- disconnect --------------------------------------------------------
    async def _force_cleanup(self) -> None:
        was_connected = self._connected
        self._connected = False  # stop the tx loop and any queued sends NOW
        self._protocol = None

        if was_connected:
            try:
                await self._enqueue_stop()
            except Exception:
                pass

        if self._tx_task:
            self._tx_task.cancel()
            try:
                await self._tx_task
            except asyncio.CancelledError:
                pass  # CancelledError is BaseException, NOT caught by except Exception
            except Exception:
                pass
        self._tx_task = None
        self._outbox = asyncio.Queue()  # drop anything leftover

        if self._client:
            try:
                await asyncio.wait_for(self._client.disconnect(), timeout=5)
            except Exception:
                pass
        self._client = None
        self._bridge_loaded = False

    async def _enqueue_stop(self) -> None:
        """Best-effort motor stop without flaky awaits / noisy logs."""
        try:
            await self.drive(0, 0)
        except Exception:
            pass

    async def disconnect(self) -> None:
        """Tidy disconnect: stop the motors FIRST (while still connected),
        then tear the BLE connection down. Each phase is logged so the live
        log clearly shows where it gets stuck."""
        if self._connected:
            self._log.info("Disconnecting: stopping motors...")
            try:
                await self.drive(0, 0)
            except Exception:
                pass
            # give the tx loop a tick to flush the motor-stop frame
            await asyncio.sleep(0.05)
            self._log.info("Disconnecting: motors stopped.")

        if self._client and self._tx_char:
            try:
                await asyncio.wait_for(
                    self._client.stop_notify(self._tx_char), timeout=3)
                self._log.info("Disconnecting: notifications stopped.")
            except Exception:
                pass

        await self._force_cleanup()
        self._log.info("Disconnected.")

    async def __aenter__(self) -> "LegoSpikeHub":
        return self

    async def __aexit__(self, *exc) -> None:
        await self.disconnect()

    # -- diagnosis ---------------------------------------------------------
    async def enumerate_gatt(self, device: BLEDevice) -> list[dict]:
        client = BleakClient(device, timeout=config.CONNECT_TIMEOUT)
        await client.connect()
        try:
            rows = []
            for svc in client.services:
                for char in svc.characteristics:
                    props = ",".join(
                        p for p in (
                            "read", "write", "write_no_response",
                            "notify", "indicate",
                        ) if p in char.properties
                    )
                    rows.append({
                        "service": svc.uuid,
                        "char": char.uuid,
                        "props": props or "-",
                    })
            return rows
        finally:
            try:
                await client.disconnect()
            except Exception:
                pass