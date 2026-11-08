"""First live test of the Windows driver: open the AirPods channel, start head tracking, measure it.

    python airpodsgyro\\tools\\apl2_probe.py [--seconds 20] [--raw]

Prints what the driver sees (AirPods address, MTUs), then streams SensorDataWX through the same
Session the app uses and reports rate, gaps, and whether the quaternion moves when you move your head.
Play music on the AirPods while it runs to check audio keeps working.
"""

import argparse
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.session import Session  # noqa: E402
from core.transport import windriver  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=20)
    ap.add_argument("--raw", action="store_true", help="hex-dump the first packets")
    args = ap.parse_args()

    paths = windriver.list_interfaces()
    print(f"driver interfaces: {len(paths)}")
    for p in paths:
        d = windriver._Device(p)
        try:
            print(" ", p)
            print("  ", d.info())
        finally:
            d.close()
    if not paths:
        print("-> driver not installed or AirPods not paired/connected. Run driver\\install.ps1 (admin).")
        return 1

    raw_left = 8 if args.raw else 0

    class Tap(windriver.WinDriverTransport):
        def recv(self, timeout):
            nonlocal raw_left
            pkt = super().recv(timeout)
            if pkt and raw_left:
                raw_left -= 1
                print(f"   rx {len(pkt):4d} B  {pkt[:48].hex(' ')}")
            return pkt

    tr_ref = {}

    def factory():
        tr_ref["t"] = Tap()
        return tr_ref["t"]

    st = Session(factory, on_status=lambda s, d="": print(f"[{s}] {d}"))
    t_end = first = None
    q_first = q_last = None
    try:
        for s in st.samples():
            now = time.monotonic()
            if first is None:
                first, t_end = now, now + args.seconds
                print("streaming - move your head around")
            if s.quat:
                q_first = q_first or s.quat
                q_last = s.quat
            if now >= t_end:
                break
    except KeyboardInterrupt:
        pass
    finally:
        st.stop()
    stats = st.stats()
    dur = (time.monotonic() - first) if first else 0
    print("\nresult:", stats)
    if first and dur > 0:
        print(f"rate: {stats['samples'] / dur:.1f} Hz over {dur:.1f} s")
        if q_first and q_last:
            dot = abs(sum(a * b for a, b in zip(q_first, q_last)))
            print(f"head moved {math.degrees(2 * math.acos(min(1.0, dot))):.0f} deg between first and last sample")
    if "t" in tr_ref and tr_ref["t"].info:
        print("channel:", tr_ref["t"].info)
    ok = stats["samples"] > 0
    print("VERDICT:", "SUCCESS - head tracking works through the Windows driver" if ok else "no sensor data")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
