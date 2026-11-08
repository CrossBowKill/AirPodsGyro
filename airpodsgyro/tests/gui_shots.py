"""Screenshots of every screen in both themes, for visual review (not part of the unit suite).

    .venv\\Scripts\\python airpodsgyro\\tests\\gui_shots.py <out-dir>

Runs the real window headless against a recording, settings in a temp folder.
"""

import json
import os
import sys
import tempfile

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT = os.path.dirname(APP)
REC = os.path.join(ROOT, "tools", "capture-20261107-224116", "soak.csv")
out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
os.makedirs(out_dir, exist_ok=True)

tmp = tempfile.mkdtemp(prefix="apg-shots-")
os.environ["APPDATA"] = tmp
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QT_QPA_FONTDIR", r"C:\Windows\Fonts")
os.makedirs(os.path.join(tmp, "AirPodsGyro"))
with open(os.path.join(tmp, "AirPodsGyro", "config.json"), "w") as f:
    json.dump({"source": {"kind": "replay", "replay_path": REC, "replay_loop": True},
               "outputs": {"games": False, "udp": False}}, f)
sys.path.insert(0, APP)

from PySide6.QtCore import QEventLoop, QTimer  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

import gui.config as cfgmod  # noqa: E402

cfgmod.LEGACY_CALIB = os.path.join(tmp, "none.json")
from gui import theme  # noqa: E402
from gui.calibration import CalibrationWizard  # noqa: E402
from gui.main_window import MainWindow  # noqa: E402

app = QApplication(sys.argv)


def wait(ms):
    loop = QEventLoop()
    QTimer.singleShot(ms, loop.quit)
    loop.exec()


for scheme in ("dark", "light"):
    theme.apply(app, scheme)
    win = MainWindow(app)
    win.resize(1100, 720)
    win.show()
    wait(1500)
    win.grab().save(os.path.join(out_dir, f"{scheme}-live-uncalibrated.png"))
    for i, name in enumerate(("tuning", "axes", "output", "source", "app"), start=1):
        win.nav.setCurrentRow(i)
        wait(150)
        win.grab().save(os.path.join(out_dir, f"{scheme}-{name}.png"))
    win.nav.setCurrentRow(0)
    with open(os.path.join(ROOT, "tools", "capture-20261107-224116", "calibration.json")) as f:
        cal = json.load(f)
    win.calibration = cal
    win.pipeline.set_calibration(cal)
    wait(2500)
    win.grab().save(os.path.join(out_dir, f"{scheme}-live.png"))
    wiz = CalibrationWizard(win.pipeline, win)
    wiz.show()
    wait(200)
    wiz.grab().save(os.path.join(out_dir, f"{scheme}-wizard.png"))
    wiz.close()
    win.quit()
    app.processEvents()
print("saved to", out_dir)
