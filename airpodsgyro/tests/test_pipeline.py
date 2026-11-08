"""Pipeline end to end on a real recording: thread, outputs, recenter, settings, calibration helpers."""

import json
import os
import sys
import time
import unittest

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, ".."))
from core import calibrate  # noqa: E402
from core import protocol as p  # noqa: E402
from core.pipeline import AxisSettings, Pipeline, Settings, shape  # noqa: E402
from core.transport.replay import ReplayTransport  # noqa: E402

SOAK = os.path.join(ROOT, "tools", "capture-20261107-224116")


class Collect:
    def __init__(self):
        self.frames = []

    def send(self, y, p_, r):
        self.frames.append((y, p_, r))


class TestShape(unittest.TestCase):
    def test_shape(self):
        self.assertEqual(shape(10.0, AxisSettings(gain=2.0, deadzone=1.0)), 18.0)
        self.assertEqual(shape(-0.5, AxisSettings(deadzone=1.0)), 0.0)
        self.assertEqual(shape(10.0, AxisSettings(invert=True)), -10.0)
        self.assertEqual(shape(100.0, AxisSettings(gain=3.0, limit=90)), 90.0)

    def test_settings_roundtrip(self):
        s = Settings(mincutoff=0.8, drift=False)
        s.axes["pitch"].invert = True
        s2 = Settings.from_dict(json.loads(json.dumps(s.to_dict())))
        self.assertEqual(s2.to_dict(), s.to_dict())
        self.assertEqual(Settings.from_dict({"unknown": 1, "axes": {"yaw": {"gain": 2, "bogus": 0}}}).axes["yaw"].gain, 2)


class TestCalibrateHelpers(unittest.TestCase):
    def test_pose_window_checks(self):
        still = [p.Sample(0, 0, (0.1, 0, 0), (0, 0, 1000), (1, 0, 0, 0))] * 30
        g, q = calibrate.pose_from_window(still)
        self.assertEqual(g, (0, 0, 1000))
        with self.assertRaises(calibrate.PoseError):
            calibrate.pose_from_window(still[:5])
        moving = still + [p.Sample(0, 0, (40, 0, 0), (0, 0, 1000), (1, 0, 0, 0))]
        with self.assertRaises(calibrate.PoseError):
            calibrate.pose_from_window(moving)


@unittest.skipUnless(os.path.exists(os.path.join(SOAK, "soak.csv")), "recording not present")
class TestPipelineReplay(unittest.TestCase):
    def test_runs_and_outputs(self):
        with open(os.path.join(SOAK, "calibration.json")) as f:
            cal = json.load(f)
        out = Collect()
        pl = Pipeline(lambda: ReplayTransport(os.path.join(SOAK, "soak.csv"), speed=0), cal, outputs=[out])
        pl.start()
        pl.thread.join(120)
        snap = pl.snapshot()
        self.assertIsNone(snap["error"])
        self.assertEqual(snap["status"], "stopped")
        self.assertGreater(len(out.frames), 59000)
        self.assertEqual(snap["stats"]["samples"], 60107)
        self.assertAlmostEqual(snap["rate_hz"], 100, delta=5)
        self.assertLess(snap["drift_rate_dpm"], -0.5)            # learned the Pro 3 drift

    def test_live_controls(self):
        out = Collect()
        pl = Pipeline(lambda: ReplayTransport(os.path.join(SOAK, "soak.csv"), speed=4.0), None, outputs=[out])
        pl.start()
        time.sleep(1.0)
        self.assertEqual(out.frames, [])                  # no calibration -> no output, but samples flow
        self.assertGreater(len(pl.recent), 100)
        g, q = calibrate.pose_from_window(list(pl.recent)[-60:])
        with open(os.path.join(SOAK, "calibration.json")) as f:
            pl.set_calibration(json.load(f))
        time.sleep(0.5)
        self.assertTrue(out.frames)
        pl.recenter()
        time.sleep(0.3)
        self.assertLess(max(abs(v) for v in pl.angles), 5.0)
        pl.paused = True
        n = len(out.frames)
        time.sleep(0.3)
        self.assertEqual(len(out.frames), n)
        pl.stop()
        self.assertFalse(pl.running)
        self.assertEqual(pl.snapshot()["status"], "stopped")


if __name__ == "__main__":
    unittest.main()
