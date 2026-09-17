# SPIKE Keyboard Controller

Drive a **LEGO SPIKE Prime** robot from your Mac keyboard (WASD) over Bluetooth, without the LEGO App.

This project is a from-scratch BLE radio + upload pipeline plus a full desktop GUI. It does not use any LEGO SDK on the computer — every protocol byte (COBS framing, CRC, file upload, motor bridge) is implemented here against the official, LEGO-published SPIKE Prime protocol docs.

## Try it in your browser — no install

The app runs as a plain web page (Web Bluetooth, no download):

- **Keyboard Controller**: https://dinoll288.github.io/spike-keyboard-controller-app/keyboard.html
- Landing page: https://dinoll288.github.io/spike-keyboard-controller-app/

Works in Chrome/Edge on any OS (and Safari 17+). Click **SCAN**, pick your Hub, then drive
(WASD + Space) — straight over the air, no computer software needed.

## Get the ready-to-run app (for friends / class) — ONE command, no warnings

On any Mac, open Terminal and paste this single line:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/DinoLL288/spike-keyboard-controller-app/main/release/python/install.sh)"
```

It installs **SPIKE Keyboard Controller** to `~/Documents/SPIKE_Apps`. The `.command` file sits right there — just double-click it. macOS never shows a "cannot verify" warning.

Why: web-browser downloads get a hidden quarantine stamp, so macOS 26 blocks even `.command` files. `curl` (used above) never stamps files, so nothing is ever checked. See `release/python/README.txt` for the full explainer.

## What it does

- Scans for the SPIKE Prime hub over BLE (`fd02` service), connects, and uploads a small MicroPython **motor bridge** program into program slot 0.
- The bridge listens on `hub.config["module_tunnel"]` and runs `motor.run(port, velocity)` for each motor command.
- Your keyboard (W, A, S, D + Space) or the on-screen WASD pad turns into tank-drive speeds: forward, reverse, left/right turn and diagonal combinations.
- Live terminal-style log shows the whole handshake, the bridge upload, hub console output, motor commands and errors in real time.
- **Motor check**: the hub reports which ports actually have devices attached (`device.device_id`), so you know the motors are plugged in before you drive.

## Requirements

- macOS
- A LEGO SPIKE Prime (or Robot Inventor) hub with motors plugged into the configured ports (default: `C` = left, `D` = right)
- Python 3.10+

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python main.py
```

Press **SCAN**, select your Hub, press **CONNECT**, check the **MOTOR CHECK** line, then drive with **W/A/S/D** (Space = stop, Q/Esc = quit).

Physical keyboard input works while the app window is focused; enabling macOS Accessibility input monitoring also allows it in the background. The on-screen pad always works.

## Key files

| File                 | Purpose |
|----------------------|---------|
| `main.py`            | Entry point, wiring the GUI, BLE hub and keyboard together |
| `gui.py`             | Dark-themed tkinter UI + live log + on-screen controller |
| `lego_hub.py`        | BLE protocol: COBS framing, SPIKE Prime file upload, tunnel commands |
| `keyboard_controller.py` | pynput keyboard listener → drive commands |
| `config.py`          | All tunables + the on-hub motor bridge MicroPython script |
| `diagnose_hub.py`    | Ad-hoc GATT inspection of a hub |
| `setup.py`           | py2app config for building a distributable macOS `.app` |
| `build_release.sh`   | Builds the `.app` bundle + release ZIP (requires py2app) |
| `build_python_edition.sh` | Builds the zero-warning Python-edition ZIP (the recommended shareable build) |
| `release/python/install.sh` | One-line installer script fetched by the terminal command above |

## Building for sharing

The recommended distributable is the **Python edition** — plain source + launcher so macOS never runs Gatekeeper on it:

```bash
./build_python_edition.sh        # -> dist/Python-Edition.zip
```

To also build the classic double-click `.app` bundle (these show the macOS "cannot verify" prompt on newest macOS unless notarized):

```bash
./.venv/bin/pip install py2app
./.venv/bin/python setup.py py2app   # SPIKE Keyboard Controller.app
./build_release.sh                   # + Install.command ZIP
```

## Protocol notes

- Hub: SPIKE Prime family, GATT service `0000fd02-...`, RX `...fd02-0001` (write-without-response), TX `...fd02-0002` (notify).
- Framing: COBS + `XOR 0x03` + delimiter `0x02` (`pack_prime_message`).
- Upload flow follows the official `spike-prime-docs` examples: InfoRequest → ClearSlot → StartFileUpload → TransferChunk (4-byte-padded CRC32) → ProgramFlow.
- Drive commands are sent as tunnel messages (`0x32`) with a compact ASCII payload, e.g. `2C+050D+050`.
- Hub↔app tunnel replies (`0x33`) carry `rdy` acks and `attach:` motor reports.