import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(1, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))

import tkinter as tk

from model import Program
from ui import App


def main() -> None:
    root = tk.Tk()
    root.geometry("920x720+70+70")
    root.update()
    loop = asyncio.new_event_loop()
    app = App(root, loop)
    prog = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "programs", "demo.json")
    app.program = Program.from_json(open(prog).read())
    app._redraw_program()

    async def pump() -> None:
        while True:
            try:
                root.update()
            except tk.TclError:
                return
            await asyncio.sleep(0.03)

    loop.run_until_complete(pump())


if __name__ == "__main__":
    main()