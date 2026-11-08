"""README screenshots of the real app, from a real Pro 3 recording (not mockups).

    .venv\\Scripts\\python airpodsgyro\\tests\\readme_shots.py

Writes docs/screenshots/*.png. Each live shot replays a few seconds of tools/capture-20261107-224116:
first the user looking straight ahead (the recenter pose), then a moment where they held a head turn, so
the head view shows a real pose. Settings go to a temp folder; the games output is on so the Game tile
shows its real waiting state (its registry keys are restored when the window closes).
"""

import csv
import json
import os
import sys
import tempfile

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT = os.path.dirname(APP)
CAP = os.path.join(ROOT, "tools", "capture-20261107-224116")
OUT = os.path.join(ROOT, "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

tmp = tempfile.mkdtemp(prefix="apg-readme-")
os.environ["APPDATA"] = tmp
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QT_QPA_FONTDIR", r"C:\Windows\Fonts")
os.environ.setdefault("QT_SCALE_FACTOR", "1.5")
os.makedirs(os.path.join(tmp, "AirPodsGyro"))

# held poses found in the recording (row index): turned right + looking down, turned left + looking up
POSES = {"dark": 12625, "light": 39300}
LEAD_IN, BEFORE, AFTER = 300, 200, 400


def clip(k, path):
    """Recenter pose (first rows) + the moment around row k, retimed to one continuous stream."""
    with open(os.path.join(CAP, "soak.csv"), newline="") as f:
        rows = list(csv.DictReader(f))
    picked = rows[:LEAD_IN] + rows[k - BEFORE:k + AFTER]
    t0, ts0 = float(picked[0]["host_t"]), int(picked[0]["ts_ns"])
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        for i, r in enumerate(picked):
            r = dict(r, host_t=f"{t0 + i * 0.01:.4f}", ts_ns=str(ts0 + i * 10_000_000))
            w.writerow(r)


sys.path.insert(0, APP)
from PySide6.QtCore import QEventLoop, QTimer  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

import gui.config as cfgmod  # noqa: E402
from gui import theme  # noqa: E402
from gui.calibration import CalibrationWizard  # noqa: E402
from gui.main_window import MainWindow  # noqa: E402

app = QApplication(sys.argv)


def wait(ms):
    loop = QEventLoop()
    QTimer.singleShot(ms, loop.quit)
    loop.exec()


with open(os.path.join(CAP, "calibration.json")) as f:
    cal = json.load(f)

for scheme, k in POSES.items():
    rec = os.path.join(tmp, f"clip-{scheme}.csv")
    clip(k, rec)
    with open(os.path.join(tmp, "AirPodsGyro", "config.json"), "w") as f:
        json.dump({"source": {"kind": "replay", "replay_path": rec, "replay_loop": False},
                   "outputs": {"games": True, "dummy_trackir": False, "udp": False},
                   "hotkeys": {"recenter": "", "pause": ""}, "theme": scheme}, f)
    cfgmod.save_calibration(cal)
    theme.apply(app, scheme)
    win = MainWindow(app)
    win.cfg["hotkeys"] = {"recenter": "ctrl+alt+r", "pause": "ctrl+alt+p"}   # shown in the hint, not registered
    win.hotkeys.clear()
    win._apply_hotkeys = lambda: None
    win.keys_hint.setText("Recenter Ctrl+Alt+R    Pause Ctrl+Alt+P")
    win.hk_error.setText("")
    win.resize(1100, 720)
    win.show()
    while not (win.pipeline and win.pipeline.status == "streaming"):
        wait(50)
    wait(int((LEAD_IN + BEFORE + 60) * 10))          # play up to just after the held pose begins
    print(scheme, "angles", [round(a, 1) for a in win.pipeline.snapshot()["angles"]])
    win.grab().save(os.path.join(OUT, f"live-{scheme}.png"))
    if scheme == "dark":
        win.nav.setCurrentRow(3)
        wait(200)
        win.grab().save(os.path.join(OUT, "games-dark.png"))
        win.nav.setCurrentRow(2)
        wait(200)
        win.grab().save(os.path.join(OUT, "axes-dark.png"))
        win.nav.setCurrentRow(0)
        wiz = CalibrationWizard(win.pipeline, win)
        wiz.show()
        wait(200)
        wiz.grab().save(os.path.join(OUT, "calibration-dark.png"))
        wiz.close()
    win.quit()
    app.processEvents()

for fn in sorted(os.listdir(OUT)):
    print(fn, os.path.getsize(os.path.join(OUT, fn)) // 1024, "KB")
