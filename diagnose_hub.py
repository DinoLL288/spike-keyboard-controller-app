"""BLE diagnostic mode for the LEGO SPIKE Hub.

This is a DEVELOPMENT tool that exists so the hub's real BLE GATT layout can
be enumerated and verified instead of guessed. It never sends motor commands.

Two ways to use it:

1. As a standalone command line tool during development:

       python -m diagnose_hub                # scan + auto-diagnose first SPIKE hub
       python -m diagnose_hub "<name>"       # diagnose the hub whose name matches
       python -m diagnose_hub --id "<addr>"  # diagnose by BLE address

2. Through the GUI's [ Diagnose Hub ] button, which imports
   :func:`diagnose_device`.

Output shows, for every service and characteristic:

    service UUID
    characteristic UUID
    properties (read / write / write_no_response / notify / indicate)
"""

from __future__ import annotations

import argparse
import asyncio

from bleak import BleakClient
from bleak.backends.device import BLEDevice

import config


# Matches the GATT enumeration used by the GUI, kept here too so the
# diagnostic tool works standalone.
async def enumerate_gatt(device: BLEDevice) -> list[dict]:
    """Connect read-only and enumerate every service & characteristic."""
    client = BleakClient(device, timeout=config.CONNECT_TIMEOUT)
    await client.connect()
    try:
        # Force service discovery.
        services = client.services
        rows = []
        for svc in services:
            for char in svc.characteristics:
                props = []
                for p in (
                    "read",
                    "write",
                    "write_no_response",
                    "notify",
                    "indicate",
                ):
                    if p in char.properties:
                        props.append(p)
                rows.append(
                    {
                        "service": svc.uuid,
                        "char": char.uuid,
                        "props": ", ".join(props) if props else "-",
                    }
                )
        return rows
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


async def diagnose_device(device: BLEDevice, log) -> bool:
    """Enumerate a device's GATT layout and log it. Returns True on success."""
    log(f"Connecting to {device.name or device.address} for diagnosis...")
    try:
        rows = await enumerate_gatt(device)
        log(f"Enumerated {len(rows)} characteristic(s):")
        for row in rows:
            log(f"  service {row['service']}")
            log(f"    char  {row['char']}  [{row['props']}]")
        log("Diagnosis complete. No motor commands were sent.")
        return True
    except Exception as exc:
        log(f"Diagnosis failed: {exc}")
        return False


async def _run_cli(args, log) -> None:
    from lego_hub import LegoSpikeHub

    hub = LegoSpikeHub(log=log)
    devices = await hub.scan(timeout=config.SCAN_TIMEOUT)

    target = None
    if args.id:
        target = next((d for d in devices if d["id"].lower() == args.id.lower()), None)
        if target is None:
            log(f"No device found with id {args.id}")
            return
    elif args.name:
        target = next(
            (d for d in devices if args.name.lower() in d["name"].lower()), None
        )
        if target is None:
            log(f"No device found with name {args.name}")
            return
    else:
        # auto: prefer SPIKE, then hub, then first device
        target = devices[0] if devices else None

    if target is None:
        log("No LEGO SPIKE Hub found. Make sure the Hub is turned on and nearby.")
        return

    log(f"Diagnosing {target['name']} ({target['id']}) kind={target['kind']}")
    await diagnose_device(target["device"], log)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enumerate the BLE GATT layout of a LEGO SPIKE Hub (read-only)."
    )
    grp = parser.add_mutually_exclusive_group()
    grp.add_argument("name", nargs="?", default=None, help="Hub name to match")
    grp.add_argument("--id", default=None, help="BLE address to match")
    args = parser.parse_args()

    def log(msg: str) -> None:
        print(msg)

    asyncio.run(_run_cli(args, log))


if __name__ == "__main__":
    main()
