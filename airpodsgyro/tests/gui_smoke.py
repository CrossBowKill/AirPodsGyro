"""GUI smoke test (not part of the unit suite; needs PySide6).

    .venv\\Scripts\\python airpodsgyro\\tests\\gui_smoke.py [screenshot.png]

Runs the real MainWindow headless against a recording, with APPDATA pointed at a temp folder:
start -> streaming -> calibrate through the wizard -> output frames -> recenter -> settings persist.
"""

import json
import os
import sys
import tempfile

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ROOT = os.path.dirname(APP)
REC = os.path.join(ROOT, "tools", "capture-20261107-224116", "soak.csv")

tmp = tempfile.mkdtemp(prefix="apg-gui-")
os.environ["APPDATA"] = tmp
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.makedirs(os.path.join(tmp, "AirPodsGyro"))
with open(os.path.join(tmp, "AirPodsGyro", "config.json"), "w") as f:
    json.dump({"source": {"kind": "replay", "replay_path": REC, "replay_loop": True},
               "outputs": {"games": False, "udp": True, "udp_port": 4260}}, f)
sys.path.insert(0, APP)

from PySide6.QtCore import QEventLoop, QTimer  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

import gui.config as cfgmod  # noqa: E402

cfgmod.LEGACY_CALIB = os.path.join(tmp, "none.json")     # start uncalibrated
from gui.calibration import CalibrationWizard  # noqa: E402
from gui.main_window import MainWindow  # noqa: E402

app = QApplication(sys.argv)


def wait(ms):
    loop = QEventLoop()
    QTimer.singleShot(ms, loop.quit)
    loop.exec()


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        global failed
        failed = True


failed = False
win = MainWindow(app)
win.show()
wait(1500)
snap = win.pipeline.snapshot()
check(snap["status"] == "streaming", f"streams from the recording (status={snap['status']})")
check(not snap["calibrated"] and "Not calibrated" in win.calib_hint.text(), "asks for calibration")
check(win.badge.text() == "Streaming", f"badge shows Streaming ({win.badge.text()})")

# Calibration wizard, driven like a user would (the recording is still at its start: head still)
wiz = CalibrationWizard(win.pipeline, win)
wiz.show()
for step in range(3):
    wiz.capture_btn.click()
    wait(1400)
    if step < 2:
        check(wiz.step == step + 1, f"wizard pose {step + 1} captured ({wiz.feedback.text() or 'ok'})")
# held poses all look the same at the start of the recording, so solving must be refused, not crash
check(wiz.result is None and "failed" in wiz.feedback.text().lower(),
      f"wizard refuses identical poses ({wiz.feedback.text()[:70]})")
wiz.close()

# install the real calibration from that recording session, as the wizard would on success
with open(os.path.join(ROOT, "tools", "capture-20261107-224116", "calibration.json")) as f:
    cal = json.load(f)
win.calibration = cal
cfgmod.save_calibration(cal)
win.pipeline.set_calibration(cal)
wait(800)
snap = win.pipeline.snapshot()
check(snap["angles"] is not None, f"head angles flow after calibration {snap['angles']}")
win.recenter()
wait(300)
check(max(abs(a) for a in win.pipeline.snapshot()["angles"]) < 3, "recenter brings the view to ~0")

win.sp_cutoff.setValue(0.9)
win.axis_widgets["yaw"][0].setValue(2.0)
wait(900)
with open(cfgmod.CONFIG_PATH) as f:
    saved = json.load(f)
check(saved["settings"]["mincutoff"] == 0.9 and saved["settings"]["axes"]["yaw"]["gain"] == 2.0,
      "settings saved to config.json")
check(win.pipeline.settings.axes["yaw"].gain == 2.0, "settings applied live")

win.btn_pause.setChecked(True)
check(win.pipeline.paused and win.tray_pause.isChecked(), "pause syncs button, tray and pipeline")
win.btn_pause.setChecked(False)

if len(sys.argv) > 1:
    win.resize(760, 680)
    wait(400)
    win.grab().save(sys.argv[1])
    print("screenshot", sys.argv[1])

win.toggle_tracking()
wait(300)
check(win.pipeline is None and win.badge.text() == "Stopped", "stop tracking")
win.quit()
print("RESULT", "FAIL" if failed else "PASS")
sys.exit(1 if failed else 0)
