"""Calibration helpers shared by the CLI and the GUI wizard.

The user holds three poses (look ahead, look down ~30 deg, turn left ~30 deg); each pose is a short
window of samples. headtrack.solve_calibration turns them into the head frame.
"""

import time

from . import headtrack as ht

POSES = (
    ("forward", "Look straight at your monitor"),
    ("down", "Look DOWN about 30 degrees (chin toward chest)"),
    ("left", "Look straight again, then turn your head LEFT about 30 degrees"),
)
MIN_SAMPLES = 20
MAX_GYRO_RANGE_DPS = 15.0


class PoseError(ValueError):
    pass


def pose_from_window(samples):
    """(gravity, quaternion) averaged over a held pose, or PoseError with a user-facing reason."""
    win = [s for s in samples if s.quat is not None]
    if len(win) < MIN_SAMPLES:
        raise PoseError(f"only {len(win)} samples - are the AirPods in your ears and streaming?")
    rng = max(max(s.gyro[k] for s in win) - min(s.gyro[k] for s in win) for k in range(3))
    if rng > MAX_GYRO_RANGE_DPS:
        raise PoseError(f"moving too much (gyro range {rng:.0f} deg/s) - hold still")
    g = tuple(sum(s.gravity[k] for s in win) / len(win) for k in range(3))
    return g, ht.quat_avg([s.quat for s in win])


def solve(poses, pid="0000"):
    """poses: {'forward': (g, q), 'down': (g, q), 'left': (g, q)} -> calibration dict to save."""
    g_fwd, q_fwd = poses["forward"]
    cal = ht.solve_calibration(g_fwd, q_fwd, poses["down"][1], poses["left"][1])
    cal.update({"pid": pid, "created": time.strftime("%Y-%m-%d %H:%M:%S")})
    return cal
