"""Session over transports: clean start/stop, reconnect, and a full replay of a real Pro 3 recording."""

import csv
import json
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, ".."))
from core import headtrack as ht  # noqa: E402
from core import protocol as p  # noqa: E402
from core.session import Session  # noqa: E402
from core.transport.base import TransportError  # noqa: E402
from core.transport.replay import ReplayTransport  # noqa: E402

SOAK2 = os.path.join(ROOT, "tools", "soak-20261107-225643")
CAPTURE = os.path.join(ROOT, "tools", "capture-20261107-224116")
CALIB = os.path.join(ROOT, "airpodsgyro", "calibration.json")


def rows(n, dt=0.01, quat=(1.0, 0.0, 0.0, 0.0)):
    return [(i * dt, int(i * dt * 1e9), (0.0, 0.0, 0.0), (0.0, 0.0, 1000.0), quat) for i in range(n)]


class TestSession(unittest.TestCase):
    def test_start_and_clean_stop(self):
        tr = ReplayTransport(rows(50), speed=0)
        st = Session(lambda: tr)
        got = list(st.samples())
        self.assertEqual(len(got), 50)
        self.assertEqual(st.stats()["samples"], 50)
        cmd = p.Commands()
        expected_start = [x for x, _ in p.OPEN_SEQUENCE] + [x for x, _ in cmd.start_tracking(10000)]
        self.assertEqual(tr.sent[:len(expected_start)], expected_start)
        self.assertEqual(tr.sent[len(expected_start):], [x for x, _ in cmd.stop_tracking()])
        self.assertFalse(tr.is_open)

    def test_stop_from_consumer_sends_clean_stop(self):
        tr = ReplayTransport(rows(500), speed=0)
        st = Session(lambda: tr)
        for i, _ in enumerate(st.samples()):
            if i == 9:
                st.stop()
        self.assertLess(st.n, 500)
        last = tr.sent[-2]
        self.assertEqual(last[-4:], b"\x00\x00\x00\x00")       # svc 16 interval 0
        self.assertFalse(tr.is_open)

    def test_reconnects_after_link_loss(self):
        made = []

        def factory():
            made.append(1)
            if len(made) == 1:
                raise TransportError("simulated: AirPods out of range")
            return ReplayTransport(rows(20), speed=0)

        events = []
        st = Session(factory, backoff=0.01, on_status=lambda s, d="": events.append(s))
        self.assertEqual(len(list(st.samples())), 20)
        self.assertEqual(st.reconnects, 1)
        self.assertIn("reconnecting", events)
        self.assertEqual(events[-1], "stopped")

    def test_gap_accounting(self):
        r = rows(10) + [(t + 0.3, ts, w, g, q) for t, ts, w, g, q in rows(10, )]
        st = Session(lambda: ReplayTransport(r, speed=0))
        list(st.samples())
        self.assertEqual(st.stats()["gaps"], {">200ms": 1})


@unittest.skipUnless(os.path.exists(os.path.join(SOAK2, "soak.csv")) and os.path.exists(CALIB),
                     "recorded soak not present")
class TestReplayRecordedSoak(unittest.TestCase):
    """The new code path reproduces the Linux run: same samples, gaps and head angles."""

    def test_soak2_matches_original_run(self):
        csv_path = os.path.join(SOAK2, "soak.csv")
        with open(os.path.join(SOAK2, "soak-summary.json")) as f:
            want = json.load(f)
        with open(CALIB) as f:
            tracker = ht.HeadTracker(json.load(f))
        with open(csv_path, newline="") as f:
            recorded = [r["yaw"] and (float(r["yaw"]), float(r["pitch"]), float(r["roll"])) for r in csv.DictReader(f)]

        st = Session(lambda: ReplayTransport(csv_path, speed=0))
        worst = 0.0
        compared = 0
        for i, s in enumerate(st.samples()):
            ang = tracker.update(s.quat)
            if ang and recorded[i]:
                worst = max(worst, max(abs(a - b) for a, b in zip(ang, recorded[i]) if abs(b) < 170))
                compared += 1
        got = st.stats()
        for k in ("samples", "gaps", "max_gap_ms", "invalid_quat"):
            self.assertEqual(got[k], want[k], k)
        self.assertGreater(compared, 40000)
        self.assertLess(worst, 0.1, "head angles differ from the original run")


if __name__ == "__main__":
    unittest.main()
