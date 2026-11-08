"""Head orientation from the AirPods' own attitude quaternion (SensorDataWX block bytes 20..25).

The AirPods fuse gyro + accelerometer on-board and report an attitude quaternion q (body -> world)
in every 58-byte sensor block. Head angles are the rotation of the bud *relative to a recenter pose*,
expressed in a head frame learned once by calibration:

    x = right  (pitch axis, + = look up)
    y = forward (roll axis, + = right ear down)
    z = up     (yaw axis,  + = turn left)

The bud sits rigidly in the ear, so the head frame is constant in bud (body) coordinates. Taking the
relative rotation R0^T R in the reference body frame makes the result independent of the AirPods'
world frame (whose yaw origin drifts and whose axes we never need to know).

Pure functions only; no Bluetooth here, so everything is unit-testable.
"""

import math

# ----------------------------------------------------------------------------- vectors / matrices


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def vnorm(a):
    n = math.sqrt(vdot(a, a))
    if n < 1e-9:
        raise ValueError("zero-length vector")
    return (a[0] / n, a[1] / n, a[2] / n)


def mat_T(m):
    return tuple(tuple(m[j][i] for j in range(3)) for i in range(3))


def mat_mul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


# ----------------------------------------------------------------------------- quaternions (w, x, y, z)


def quat_from_att(att):
    """Q15 vector part (3 x int16) -> unit quaternion (w, x, y, z) with w >= 0, or None if invalid."""
    x, y, z = (c / 32768.0 for c in att)
    n2 = x * x + y * y + z * z
    if not 0.01 < n2 < 1.01:
        return None
    return (math.sqrt(max(0.0, 1.0 - n2)), x, y, z)


def quat_to_mat(q):
    w, x, y, z = q
    return ((1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)),
            (2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)),
            (2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)))


def quat_avg(qs):
    """Average of nearby unit quaternions (sign-aligned component mean, renormalised)."""
    ref = qs[0]
    acc = [0.0, 0.0, 0.0, 0.0]
    for q in qs:
        s = 1.0 if sum(a * b for a, b in zip(q, ref)) >= 0 else -1.0
        for i in range(4):
            acc[i] += s * q[i]
    n = math.sqrt(sum(c * c for c in acc))
    return tuple(c / n for c in acc)


def rotation_axis_angle(m):
    """Rotation matrix -> (unit axis, angle in degrees). Axis is None for ~zero rotation."""
    c = max(-1.0, min(1.0, (m[0][0] + m[1][1] + m[2][2] - 1.0) / 2.0))
    ang = math.degrees(math.acos(c))
    v = (m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1])
    n = math.sqrt(vdot(v, v))
    return (None if n < 1e-6 else (v[0] / n, v[1] / n, v[2] / n)), ang


# ----------------------------------------------------------------------------- head frame


def head_basis(up, right):
    """Orthonormal head frame (rows x=right, y=forward, z=up) in body coordinates."""
    z = vnorm(up)
    x = vnorm(tuple(r - vdot(right, z) * zc for r, zc in zip(right, z)))
    y = vcross(z, x)
    return (x, y, z)


def euler_zxy(m):
    """M = Rz(yaw) Rx(pitch) Ry(roll) -> (yaw, pitch, roll) in degrees."""
    pitch = math.asin(max(-1.0, min(1.0, m[2][1])))
    yaw = math.atan2(-m[0][1], m[1][1])
    roll = math.atan2(-m[2][0], m[2][2])
    return math.degrees(yaw), math.degrees(pitch), math.degrees(roll)


def relative_angles(r0, r, basis):
    """Head yaw/pitch/roll (deg) of body rotation r relative to reference r0 (both body -> world)."""
    rel = mat_mul(mat_T(r0), r)            # rotation in reference body coordinates
    bt = basis                              # rows = head axes in body coords  -> body-to-head
    return euler_zxy(mat_mul(mat_mul(bt, rel), mat_T(bt)))


def solve_calibration(g_forward, q_forward, q_down, q_left=None):
    """Learn the head frame from three held poses.

    g_forward: accelerometer gravity (body coords) while looking straight ahead (sign does not matter)
    q_forward, q_down, q_left: attitude quaternions while looking ahead / looking down / turned left.
    Returns dict(up, right, quality) to store; raises ValueError if the poses are unusable.
    """
    r0 = quat_to_mat(q_forward)
    up = vnorm(g_forward)
    axis, ang = rotation_axis_angle(mat_mul(mat_T(r0), quat_to_mat(q_down)))
    if axis is None or ang < 10.0:
        raise ValueError(f"look-down pose only {ang:.0f} deg from forward (need >= 10)")
    right = tuple(-c for c in axis)          # looking down = rotation about -right
    if abs(vdot(vnorm(right), up)) > 0.8:
        raise ValueError("look-down rotation is almost about the vertical - did you turn instead of nod?")
    quality = {"down_deg": round(ang, 1), "down_axis_vs_up": round(abs(vdot(axis, up)), 3)}
    if q_left is not None:
        basis = head_basis(up, right)
        yaw, _, _ = relative_angles(r0, quat_to_mat(q_left), basis)
        if abs(yaw) < 10.0:
            raise ValueError(f"turn-left pose only {yaw:.0f} deg of yaw (need >= 10)")
        if yaw < 0:                          # accelerometer gave 'down' instead of 'up': flip
            up = tuple(-c for c in up)
        quality["left_yaw_deg"] = round(abs(yaw), 1)
    basis = head_basis(up, right)
    return {"up": list(basis[2]), "right": list(basis[0]), "quality": quality}


class HeadTracker:
    """Feeds quaternions, returns head angles relative to the last recenter."""

    def __init__(self, calib):
        self.basis = head_basis(calib["up"], calib["right"])
        self.r0 = None
        self.want_recenter = True

    def recenter(self):
        self.want_recenter = True

    def update(self, q):
        if q is None:
            return None
        r = quat_to_mat(q)
        if self.want_recenter or self.r0 is None:
            self.r0, self.want_recenter = r, False
        return relative_angles(self.r0, r, self.basis)
