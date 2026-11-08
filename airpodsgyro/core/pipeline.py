"""Pipeline: session -> drift compensation -> head angles -> response -> smoothing -> outputs.

Runs in its own thread. The GUI reads `snapshot()` on a timer and calls recenter(), set_settings(),
set_calibration() from its own thread; those only swap references or set flags, so no locks are
needed around the hot path. Works without a calibration (angles are then None) so the calibration
wizard can use the live samples.
"""

import collections
import copy
import math
import threading
import time
from dataclasses import dataclass, field

from . import headtrack as ht
from .drift import DriftCompensator
from .filters import OneEuro
from .session import Session

AXES = ("yaw", "pitch", "roll")


@dataclass
class AxisSettings:
    gain: float = 1.0          # output degrees per head degree
    deadzone: float = 0.0      # degrees, soft (output starts at 0 after the deadzone)
    invert: bool = False
    limit: float = 180.0       # clamp output (degrees)


@dataclass
class Settings:
    interval_us: int = 10000
    mincutoff: float = 1.5     # OneEuro: lower = smoother at rest
    beta: float = 0.05         # OneEuro: higher = less lag on fast moves
    drift: bool = True
    axes: dict = field(default_factory=lambda: {a: AxisSettings() for a in AXES})

    def to_dict(self):
        d = dict(self.__dict__)
        d["axes"] = {a: dict(s.__dict__) for a, s in self.axes.items()}
        return d

    @classmethod
    def from_dict(cls, d):
        s = cls()
        for k, v in (d or {}).items():
            if k == "axes":
                for a, av in v.items():
                    if a in s.axes:
                        s.axes[a] = AxisSettings(**{kk: vv for kk, vv in av.items()
                                                    if kk in AxisSettings.__dataclass_fields__})
            elif hasattr(s, k):
                setattr(s, k, v)
        return s


def shape(v, ax):
    if abs(v) <= ax.deadzone:
        v = 0.0
    else:
        v = math.copysign(abs(v) - ax.deadzone, v)
    v *= ax.gain * (-1 if ax.invert else 1)
    return max(-ax.limit, min(ax.limit, v))


class Pipeline:
    def __init__(self, transport_factory, calibration=None, settings=None, outputs=(), addr="auto"):
        self.factory, self.addr = transport_factory, addr
        self.settings = settings or Settings()
        self.outputs = list(outputs)
        self.tracker = ht.HeadTracker(calibration) if calibration else None
        self.drift = DriftCompensator(enabled=self.settings.drift)
        self.filters = [OneEuro(self.settings.mincutoff, self.settings.beta) for _ in AXES]
        self.recent = collections.deque(maxlen=400)      # raw samples, for the calibration wizard
        self.session = None
        self.thread = None
        self.status, self.detail = "idle", ""
        self.raw_angles = self.angles = None
        self.paused = False
        self._rate_n, self._rate_t, self.rate_hz = 0, None, 0.0
        self.error = None
        self._capture = None

    # ------------------------------------------------------------------ control (any thread)

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.session = Session(self.factory, self.addr, self.settings.interval_us, on_status=self._on_status)
        self.thread = threading.Thread(target=self._run, name="airpodsgyro-pipeline", daemon=True)
        self.thread.start()

    def stop(self, timeout=3.0):
        if self.session:
            self.session.stop()
        if self.thread:
            self.thread.join(timeout)
        self.thread = None

    @property
    def running(self):
        return bool(self.thread and self.thread.is_alive())

    def recenter(self):
        if self.tracker:
            self.tracker.recenter()
        for f in self.filters:
            f.reset()

    def set_calibration(self, calibration):
        self.tracker = ht.HeadTracker(calibration) if calibration else None
        for f in self.filters:
            f.reset()

    def set_settings(self, settings):
        settings = copy.deepcopy(settings)
        self.drift.enabled = settings.drift
        if (settings.mincutoff, settings.beta) != (self.settings.mincutoff, self.settings.beta):
            for f in self.filters:
                f.mincutoff, f.beta = settings.mincutoff, settings.beta
        self.settings = settings

    def set_outputs(self, outputs):
        old, self.outputs = self.outputs, list(outputs)
        for o in old:
            if o not in self.outputs and hasattr(o, "close"):
                o.close()

    def begin_capture(self):
        """Start collecting raw samples (for a calibration pose). end_capture() returns them."""
        self._capture = []

    def end_capture(self):
        cap, self._capture = self._capture, None
        return cap or []

    def snapshot(self):
        s = self.session
        return {
            "status": self.status, "detail": self.detail, "rate_hz": round(self.rate_hz, 1),
            "angles": self.angles, "raw_angles": self.raw_angles, "calibrated": self.tracker is not None,
            "still": self.drift.still, "drift_rate_dpm": round(self.drift.rate_dpm, 2),
            "drift_offset_deg": round(self.drift.offset_deg, 2), "drift_learned_s": self.drift.rate_weight_s,
            "place": s.place if s else None,
            "pid": s.pid if s else None, "stats": s.stats() if s else {}, "error": self.error,
        }

    # ------------------------------------------------------------------ worker

    def _on_status(self, state, detail=""):
        self.status, self.detail = state, detail

    def _run(self):
        last_ts = None
        try:
            for smp in self.session.samples():
                self.recent.append(smp)
                cap = self._capture
                if cap is not None:
                    cap.append(smp)
                self._count_rate(smp.host_t)
                dt = (smp.ts_ns - last_ts) / 1e9 if last_ts else 0.0
                last_ts = smp.ts_ns
                q = self.drift.update(smp.quat, smp.gyro, smp.gravity, dt)
                tracker = self.tracker
                if tracker is None or q is None:
                    continue
                raw = tracker.update(q)
                if raw is None:
                    continue
                self.raw_angles = raw
                st = self.settings
                fdt = dt if 0.0 < dt < 0.2 else st.interval_us / 1e6
                out = tuple(f(shape(v, st.axes[a]), fdt) for f, v, a in zip(self.filters, raw, AXES))
                self.angles = out
                if not self.paused:
                    for o in self.outputs:
                        o.send(*out)
        except Exception as e:          # keep the GUI alive; show the error there
            self.error = f"{type(e).__name__}: {e}"
            self.status = "error"

    def _count_rate(self, t):
        if self._rate_t is None:
            self._rate_t = t
        self._rate_n += 1
        if t - self._rate_t >= 1.0:
            self.rate_hz = self._rate_n / (t - self._rate_t)
            self._rate_n, self._rate_t = 0, t
