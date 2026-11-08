"""Session: keeps one AirPods head-tracking stream alive over any Transport.

Opens the AAP channel, starts SensorDataWX, restarts the stream after a stall, reconnects with
backoff after a link loss, and always sends a clean stop on shutdown (svc 16 -> 0). If the stream is
left running the buds can stay stuck and the next client gets no data.

Ported from bridge.Stream (Linux prototype) so the GUI, the CLI and the tests share it.
"""

import collections
import threading
import time

from . import protocol
from .transport.base import TransportError

STALL_S = 2.0

# Status values passed to on_status(state, detail)
CONNECTING, STREAMING, STALLED, RECONNECTING, STOPPED, ENDED = (
    "connecting", "streaming", "stalled", "reconnecting", "stopped", "ended")


class Session:
    def __init__(self, transport_factory, addr="auto", interval_us=10000, on_status=None,
                 backoff=2.0, max_backoff=20.0):
        """transport_factory: callable returning a fresh Transport (a new one per reconnect)."""
        self.factory, self.addr, self.interval_us = transport_factory, addr, interval_us
        self.backoff0, self.max_backoff = backoff, max_backoff
        self.on_status = on_status or (lambda state, detail="": None)
        self.tr = None
        self.cmd = protocol.Commands()
        self.pid = "0000"
        self.connected_addr = None
        self.place = None                 # 'ear' | 'out' | 'case' (from packet 0x06)
        self._stop = threading.Event()
        self.n = self.restarts = self.reconnects = self.bad_quat = 0
        self.gaps = collections.Counter()  # '>50ms', '>200ms', '>1s'
        self.max_gap = 0.0
        self.last_t = None

    # ------------------------------------------------------------------ link

    def _send_all(self, seq):
        for pkt, pause in seq:
            self.tr.send(pkt)
            if pause and not self.tr.simulated:
                time.sleep(pause)

    def _open(self):
        self.on_status(CONNECTING, self.addr)
        self.tr = self.factory()
        self.connected_addr = self.tr.open(self.addr)
        self.pid = self.tr.product_id()
        self._send_all(protocol.OPEN_SEQUENCE)
        self._send_all(self.cmd.start_tracking(self.interval_us))
        self.on_status(STREAMING, f"{self.connected_addr} model {self.pid}")

    def _close(self):
        tr, self.tr = self.tr, None
        if tr is None:
            return
        try:
            for pkt, pause in self.cmd.stop_tracking():
                tr.send(pkt)
                if pause and not tr.simulated:
                    time.sleep(pause)
        except (OSError, TransportError):
            pass
        finally:
            tr.close()

    def stop(self):
        """Ask samples() to end; the generator sends the clean stop on its way out. Thread-safe."""
        self._stop.set()

    @property
    def stopped(self):
        return self._stop.is_set()

    # ------------------------------------------------------------------ data

    def samples(self):
        """Yield protocol.Sample until stop() is called or a recording ends."""
        backoff = self.backoff0
        try:
            while not self._stop.is_set():
                try:
                    if self.tr is None:
                        self._open()
                        backoff = self.backoff0
                        last_data = last_kick = self.tr.now()
                    pkt = self.tr.recv(0.2)
                    now = self.tr.now()
                    if pkt:
                        place = protocol.ear_place(pkt)
                        if place:
                            self.place = place
                        for blk in protocol.motion_blocks(pkt):
                            s = protocol.parse_block(blk, now)
                            self.bad_quat += s.quat is None
                            self._account(now)
                            last_data = now
                            yield s
                    if now - last_data > STALL_S and now - last_kick > STALL_S:
                        self.restarts += 1
                        last_kick = now
                        self.on_status(STALLED, f"no sensor data for {now - last_data:.1f}s, restarting stream")
                        self._send_all(self.cmd.start_tracking(self.interval_us))
                except EOFError:
                    self.on_status(ENDED, "end of recording")
                    return
                except (OSError, TransportError) as e:
                    if self._stop.is_set():
                        return
                    try:
                        self._close()
                    except (OSError, TransportError):
                        self.tr = None
                    self.reconnects += 1
                    self.last_t = None
                    self.on_status(RECONNECTING, f"{e}; retrying in {backoff}s")
                    if self._stop.wait(backoff):
                        return
                    backoff = min(backoff * 2, self.max_backoff)
        finally:
            self._close()
            self.on_status(STOPPED, "")

    def _account(self, now):
        self.n += 1
        if self.last_t is not None:
            gap = now - self.last_t
            self.max_gap = max(self.max_gap, gap)
            for lim, key in ((1.0, ">1s"), (0.2, ">200ms"), (0.05, ">50ms")):
                if gap > lim:
                    self.gaps[key] += 1
                    break
        self.last_t = now

    def stats(self):
        return {"samples": self.n, "gaps": dict(self.gaps), "max_gap_ms": round(self.max_gap * 1000),
                "stream_restarts": self.restarts, "reconnects": self.reconnects, "invalid_quat": self.bad_quat}
