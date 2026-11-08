# SPDX-License-Identifier: Apache-2.0
# Adapted from mousepods (airpods_mouse_controller.py), Copyright 2026 Matteo Gaudioso (starman-tech),
# https://github.com/starman-tech/mousepods. Changes: transport-independent, Pro 3 SensorDataWX path only,
# English comments, block encoder for replay/tests.
"""Apple AAP (RTBuddy) protocol for AirPods Pro 3 head tracking (SensorDataWX, service 16).

Nothing here touches Bluetooth: packets go in and out as bytes through a Transport
(see core/transport). Channel: L2CAP PSM 0x1001, encrypted link, MTU 2582.
"""

import math
import struct
from collections import namedtuple

PSM = 0x1001
MTU = 2582            # with the Linux default MTU (672) the AirPods do not announce their sensors

H = bytes.fromhex
HDR = b"\x04\x00\x04\x00"
PKT_HANDSHAKE = H("00000400010002000000000000000000")
PKT_FEATURES = H("040004004d00d700000000000000")
PKT_NOTIFICATIONS = H("040004000f00ffffffff")
WX_PREFIX = H("04000400170000001000")
RHID_PREFIX = H("04000400170000080000")
SVC_ACTIVITY, SVC_DEVMOTION6 = 0x0E, 0x10
RHID_CONNECT = 0
GYRO_DPS_PER_LSB = 0.122
BLOCK_LEN = 58

# The opening sequence (packet, pause in seconds after sending it).
OPEN_SEQUENCE = ((PKT_HANDSHAKE, 0.3), (PKT_FEATURES, 0.15), (PKT_NOTIFICATIONS, 0.15))

Sample = namedtuple("Sample", "host_t ts_ns gyro gravity quat")
"""One sensor block. gyro: deg/s (body). gravity: body, ~1000 = 1 g. quat: (w,x,y,z) body->world or None."""


# ----------------------------------------------------------------------------- outgoing packets


def stream_packet(seq, svc, interval_us):
    """SensorDataWX: start (interval > 0) or stop (interval 0) one sensor service."""
    body = bytes([0x08, seq & 0x7F, 0x42, 0x0B, 0x08, svc, 0x10, 0x02, 0x1A, 0x05, 0x01]) + \
        struct.pack("<I", int(interval_us))
    return WX_PREFIX + struct.pack("<H", len(body)) + body


def rhid_host_connect(gen):
    """RemoteHID HostConnect. The Pro 3 needs it after starting the stream (as mousepods does)."""
    body = bytes([0, gen & 0xFF, 0, 0]) + struct.pack("<I", (4 & 0x3FF) << 7 | (RHID_CONNECT << 17))
    return RHID_PREFIX + struct.pack("<H", len(body)) + body


class Commands:
    """Keeps the sequence counters; returns the packet lists to send (with pauses)."""

    def __init__(self):
        self.seq = 0x40
        self.gen = 0

    def _stream(self, svc, interval_us):
        self.seq = (self.seq + 1) & 0x7F
        return stream_packet(self.seq, svc, interval_us)

    def _host_connect(self):
        self.gen = (self.gen + 1) & 0xFF
        return rhid_host_connect(self.gen)

    def start_tracking(self, interval_us):
        """Same order as mousepods' AAPClient.start_tracking for SensorDataWX (Pro 2/3/4)."""
        return [(self._stream(SVC_ACTIVITY, 40000), 0.25),
                (self._stream(SVC_DEVMOTION6, interval_us), 0.0),
                (self._stream(SVC_ACTIVITY, 0), 0.0),
                (self._host_connect(), 0.0)]

    def stop_tracking(self):
        """Clean stop. Without it the buds can stay stuck and the next client gets no data."""
        return [(self._stream(SVC_DEVMOTION6, 0), 0.0), (self._stream(SVC_ACTIVITY, 0), 0.05)]


# ----------------------------------------------------------------------------- incoming packets


def _varint(b, i):
    v = shift = 0
    while i < len(b):
        c = b[i]
        i += 1
        v |= (c & 0x7F) << shift
        if not c & 0x80:
            return v, i
        shift += 7
    raise ValueError("varint")


def pb_fields(buf):
    """Minimal protobuf reader: yields (field, value)."""
    i = 0
    while i < len(buf):
        key, i = _varint(buf, i)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = _varint(buf, i)
        elif wt == 2:
            n, i = _varint(buf, i)
            v = buf[i:i + n]
            i += n
        elif wt == 5:
            v, i = buf[i:i + 4], i + 4
        elif wt == 1:
            v, i = buf[i:i + 8], i + 8
        else:
            return
        yield f, v


def motion_blocks(pkt):
    """58-byte sensor blocks of one SensorDataWX packet (often several per packet)."""
    if len(pkt) < 12 or pkt[:10] != WX_PREFIX:
        return []
    n = struct.unpack_from("<H", pkt, 10)[0]
    out = []
    try:
        for f, v in pb_fields(pkt[12:12 + n]):
            if f == 7 and isinstance(v, (bytes, bytearray)):
                svc = blk = None
                for f2, v2 in pb_fields(v):
                    if f2 == 1:
                        svc = v2
                    elif f2 == 3:
                        blk = v2
                if blk is not None and len(blk) >= 50 and svc in (SVC_ACTIVITY, SVC_DEVMOTION6, 15):
                    out.append(bytes(blk))
    except ValueError:
        pass
    return out


def ear_place(pkt):
    """Packet type 0x06 -> 'ear' | 'out' | 'case'."""
    if len(pkt) < 8 or pkt[:4] != HDR or pkt[4] != 0x06:
        return None
    a, b = pkt[6], pkt[7]
    if 0 in (a, b):
        return "ear"
    if 1 in (a, b):
        return "out"
    if 2 in (a, b):
        return "case"
    return "out"


def quat_from_att(att):
    """Q15 vector part (3 x int16) -> unit quaternion (w, x, y, z) with w >= 0, or None if invalid."""
    x, y, z = (c / 32768.0 for c in att)
    n2 = x * x + y * y + z * z
    if not 0.01 < n2 < 1.01:
        return None
    return (math.sqrt(max(0.0, 1.0 - n2)), x, y, z)


def parse_block(blk, host_t=0.0):
    """58-byte block -> Sample (timestamp ns, gyro deg/s, gravity, on-board attitude quaternion)."""
    ts = struct.unpack_from("<Q", blk, 1)[0]
    w = struct.unpack_from("<hhh", blk, 26)
    g = struct.unpack_from("<hhh", blk, 44)
    q = quat_from_att(struct.unpack_from("<hhh", blk, 20))
    k = GYRO_DPS_PER_LSB
    return Sample(host_t, ts, (w[0] * k, w[1] * k, w[2] * k), (float(g[0]), float(g[1]), float(g[2])), q)


# ----------------------------------------------------------------------------- encoder (replay / tests)


def _i16(v):
    return max(-32768, min(32767, int(round(v))))


def encode_block(ts_ns, gyro, gravity, quat):
    """Inverse of parse_block (fields we use only; other bytes zero)."""
    blk = bytearray(BLOCK_LEN)
    struct.pack_into("<Q", blk, 1, int(ts_ns))
    if quat is not None:
        w, x, y, z = quat
        if w < 0:
            x, y, z = -x, -y, -z
        struct.pack_into("<hhh", blk, 20, _i16(x * 32768), _i16(y * 32768), _i16(z * 32768))
    struct.pack_into("<hhh", blk, 26, *(_i16(c / GYRO_DPS_PER_LSB) for c in gyro))
    struct.pack_into("<hhh", blk, 44, *(_i16(c) for c in gravity))
    return bytes(blk)


def _pb_varint(v):
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _pb_bytes(field, data):
    return _pb_varint(field << 3 | 2) + _pb_varint(len(data)) + data


def encode_wx_packet(blocks, svc=SVC_DEVMOTION6):
    """Wrap sensor blocks into one SensorDataWX packet, as the AirPods send them."""
    body = b"".join(_pb_bytes(7, _pb_varint(1 << 3) + _pb_varint(svc) + _pb_bytes(3, b)) for b in blocks)
    return WX_PREFIX + struct.pack("<H", len(body)) + body
