# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project

SPIKE Keyboard Controller for macOS - a BLE keyboard controller for the LEGO SPIKE
Prime hub. Python (tkinter + bleak + pynput). See README.md.

## Commands

- Run the app: `./.venv/bin/python main.py` (launch via nohup if backgrounded)
- Test: no formal test suite. Verify with a syntax check + GUI smoke test:
  `./.venv/bin/python -c "import config, lego_hub, keyboard_controller, gui, main"`
- GUI smoke test used in development: `/tmp/gui_smoke.py`

## Git workflow (IMPORTANT)

This repo lives on GitHub at `https://github.com/DinoLL288/spike-keyboard-controller-app`
(remote `origin`, branch `main`).

After finishing any change, the user expects it published:
1. `git status` / `git diff` to review exactly what changed.
2. Stage only intended project files (never secrets, `.venv/`, `__pycache__/`,
   `.DS_Store`, logs).
3. Commit with a clear message summarizing what and why.
4. `git push` to `origin` `main`.

Regardless of how small the change is, publish it as a new push. Write the best
commit description you can.

Never commit the GitHub token or any credentials.

## Releases

- Publish releases only with explicit user sign-off.
- EVERY release announcement/notes MUST include the one-line install command:
  ```
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/DinoLL288/spike-keyboard-controller-app/main/release/python/install.sh)"
  ```
- The zip referenced by releases is built via `./build_python_edition.sh`
  (output: `dist/Python-Edition.zip`) and matched by `release/python/install.sh`,
  which always installs the latest release.

## Desktop / Web parity (IMPORTANT)

The controller exists in two places that must stay in sync:
- Desktop: the Python app (tkinter GUI via `main.py` + `gui.py`)
- Web: `webapp/` (deployed to GitHub Pages)

Rule: ANY change or bugfix made to one MUST be applied to the other too —
desktop changes are mirrored to web, and web changes are mirrored to desktop
(including keyboard behavior, hub protocol in `lego_hub.py`/`spike-hub.js`,
config in `config.py`/`config.js`, and UI layout). The ONLY exception is a
desktop-specific bug that the user explicitly says is desktop-only; otherwise
treat them as one codebase.