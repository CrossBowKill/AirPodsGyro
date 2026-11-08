# SPDX-License-Identifier: Apache-2.0
# Socket setup and device discovery adapted from mousepods (Copyright 2026 Matteo Gaudioso, starman-tech).
"""Linux/BlueZ transport: kernel L2CAP socket, encrypted (BT_SECURITY_MEDIUM), MTU 2582."""

import re
import select
import socket
import struct
import subprocess

from .. import protocol
from .base import Transport, TransportError

SOL_BLUETOOTH, BT_SECURITY, BT_SECURITY_MEDIUM = 274, 4, 2
SOL_L2CAP, L2CAP_OPTIONS = 6, 1
_MODALIAS = re.compile(r"Modalias: bluetooth:v004Cp([0-9A-F]{4})")


def _ctl(*args, timeout=5):
    try:
        return subprocess.run(["bluetoothctl", *args], capture_output=True, text=True, timeout=timeout).stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def apple_devices():
    """[(addr, name, pid, connected)] of paired Apple audio devices."""
    out = []
    for ln in _ctl("devices", "Paired").splitlines():
        m = re.match(r"Device ([0-9A-F:]{17}) (.*)", ln.strip())
        if m:
            info = _ctl("info", m.group(1))
            mod = _MODALIAS.search(info)
            if mod:
                out.append((m.group(1), m.group(2), mod.group(1).lower(), "Connected: yes" in info))
    return out


class BluezTransport(Transport):
    def __init__(self, auto_connect=True):
        if not hasattr(socket, "BTPROTO_L2CAP"):
            raise TransportError("this Python has no L2CAP sockets (Linux/BlueZ only)")
        self.auto_connect = auto_connect
        self.sock = None
        self.addr = None

    def _pick(self, addr):
        if addr != "auto":
            return addr
        devs = apple_devices()
        for d in devs:
            if d[3]:
                return d[0]
        if self.auto_connect:
            for d in devs:
                _ctl("connect", d[0], timeout=12)
                if "Connected: yes" in _ctl("info", d[0]):
                    return d[0]
        raise TransportError("no AirPods connected")

    def open(self, addr):
        self.addr = self._pick(addr)
        if self.auto_connect and "Connected: yes" not in _ctl("info", self.addr):
            _ctl("connect", self.addr, timeout=20)
        s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_SEQPACKET, socket.BTPROTO_L2CAP)
        try:
            s.setsockopt(SOL_BLUETOOTH, BT_SECURITY, struct.pack("BB", BT_SECURITY_MEDIUM, 0))
            opts = bytearray(s.getsockopt(SOL_L2CAP, L2CAP_OPTIONS, 12))
            struct.pack_into("<H", opts, 2, protocol.MTU)
            s.setsockopt(SOL_L2CAP, L2CAP_OPTIONS, bytes(opts))
        except OSError:
            pass
        s.settimeout(8)
        try:
            s.connect((self.addr, protocol.PSM))
        except OSError as e:
            s.close()
            raise TransportError(f"L2CAP connect to {self.addr} failed: {e}") from e
        s.settimeout(None)
        self.sock = s
        return self.addr

    def product_id(self):
        m = _MODALIAS.search(_ctl("info", self.addr)) if self.addr else None
        return m.group(1).lower() if m else "0000"

    def send(self, pkt):
        try:
            self.sock.send(pkt)
        except (OSError, AttributeError) as e:
            raise TransportError(f"send failed: {e}") from e

    def recv(self, timeout):
        if self.sock is None:
            raise TransportError("not open")
        try:
            r, _, _ = select.select([self.sock], [], [], timeout)
            if not r:
                return None
            pkt = self.sock.recv(8192)
        except OSError as e:
            raise TransportError(f"recv failed: {e}") from e
        if not pkt:
            raise TransportError("channel closed")
        return pkt

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except OSError:
                pass
        self.sock = None
