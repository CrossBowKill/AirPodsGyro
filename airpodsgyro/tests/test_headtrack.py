import math
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from core import headtrack as ht  # noqa: E402


def rot(axis, deg):
    ax = ht.vnorm(axis)
    h = math.radians(deg) / 2
    return (math.cos(h), ax[0] * math.sin(h), ax[1] * math.sin(h), ax[2] * math.sin(h))


def qmul(p, q):
    a, b, c, d = p
    e, f, g, h = q
    return (a * e - b * f - c * g - d * h, a * f + b * e + c * h - d * g,
            a * g - b * h + c * e + d * f, a * h + b * g - c * f + d * e)


def qconj(q):
    return (q[0], -q[1], -q[2], -q[3])


def head_quat(yaw, pitch, roll):
    """Head rotation in world (x=right, y=forward, z=up): Rz(yaw) Rx(pitch) Ry(roll)."""
    return qmul(qmul(rot((0, 0, 1), yaw), rot((1, 0, 0), pitch)), rot((0, 1, 0), roll))


class Rig:
    """Simulated bud: arbitrary mount in the ear, arbitrary world heading/frame of the AirPods."""

    def __init__(self, seed):
        rnd = random.Random(seed)
        self.mount = rot((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)), rnd.uniform(0, 180))
        self.world = rot((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)), rnd.uniform(0, 180))

    def q(self, yaw=0.0, pitch=0.0, roll=0.0, base_yaw=0.0):
        # body -> world(AirPods) = world_offset * head(world) * mount(body -> head)
        q = qmul(qmul(self.world, head_quat(base_yaw + yaw, pitch, roll)), self.mount)
        return q if q[0] >= 0 else tuple(-c for c in q)

    def gravity(self, yaw=0.0, pitch=0.0, roll=0.0):
        """Accelerometer 'up' (specific force) in body coordinates."""
        q = qmul(head_quat(yaw, pitch, roll), self.mount)          # body -> true world
        return tuple(ht.quat_to_mat(qconj(q))[i][2] for i in range(3))   # R^T * world-up


class TestHeadTrack(unittest.TestCase):
    def calibrated(self, rig, flip_gravity=False):
        g = rig.gravity()
        if flip_gravity:
            g = tuple(-c for c in g)
        return ht.solve_calibration(g, rig.q(), rig.q(pitch=-30), rig.q(yaw=30))

    def test_euler_roundtrip(self):
        for y, p, r in ((10, 0, 0), (0, 20, 0), (0, 0, -15), (40, -25, 12), (-70, 30, -20)):
            m = ht.quat_to_mat(head_quat(y, p, r))
            got = ht.euler_zxy(m)
            for a, b in zip(got, (y, p, r)):
                self.assertAlmostEqual(a, b, places=6)

    def test_recovers_head_angles_for_any_mount(self):
        for seed in range(25):
            rig = Rig(seed)
            tr = ht.HeadTracker(self.calibrated(rig))
            tr.update(rig.q())
            for y, p, r in ((25, 0, 0), (-40, 0, 0), (0, 15, 0), (0, -20, 0), (0, 0, 18), (35, -15, 10)):
                got = tr.update(rig.q(y, p, r))
                for a, b in zip(got, (y, p, r)):
                    self.assertAlmostEqual(a, b, places=4, msg=f"seed {seed} pose {(y, p, r)} got {got}")

    def test_gravity_sign_is_fixed_by_turn_left_pose(self):
        rig = Rig(3)
        tr = ht.HeadTracker(self.calibrated(rig, flip_gravity=True))
        tr.update(rig.q())
        got = tr.update(rig.q(20, 10, -5))
        for a, b in zip(got, (20, 10, -5)):
            self.assertAlmostEqual(a, b, places=4)

    def test_recenter_from_any_heading(self):
        rig = Rig(7)
        tr = ht.HeadTracker(self.calibrated(rig))
        tr.update(rig.q(base_yaw=90))          # user sits rotated 90 deg vs calibration
        got = tr.update(rig.q(yaw=10, pitch=5, base_yaw=90))
        self.assertAlmostEqual(got[0], 10, places=4)
        self.assertAlmostEqual(got[1], 5, places=4)
        tr.recenter()
        self.assertEqual(tuple(round(v, 6) for v in tr.update(rig.q(yaw=10, pitch=5, base_yaw=90))), (0, 0, 0))

    def test_rejects_bad_calibration(self):
        rig = Rig(1)
        with self.assertRaises(ValueError):           # did not move for "look down"
            ht.solve_calibration(rig.gravity(), rig.q(), rig.q(pitch=-3), rig.q(yaw=30))
        with self.assertRaises(ValueError):           # turned instead of nodding
            ht.solve_calibration(rig.gravity(), rig.q(), rig.q(yaw=-30), rig.q(yaw=30))

    def test_quat_from_att(self):
        self.assertIsNone(ht.quat_from_att((0, 0, 0)))
        q = ht.quat_from_att((-27536, 4496, 10960))
        self.assertAlmostEqual(sum(c * c for c in q), 1.0, places=9)
        self.assertIsNone(ht.HeadTracker({"up": (0, 0, 1), "right": (1, 0, 0)}).update(None))

    def test_quat_avg_handles_sign_flip(self):
        q = rot((1, 2, 3), 40)
        avg = ht.quat_avg([q, tuple(-c for c in q), q])
        self.assertAlmostEqual(abs(sum(a * b for a, b in zip(avg, q))), 1.0, places=9)


if __name__ == "__main__":
    unittest.main()
