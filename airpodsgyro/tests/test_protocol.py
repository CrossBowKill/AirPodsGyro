"""core.protocol must speak exactly what mousepods (proven on the Pro 3) sends and parses."""

import os
import struct
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "mousepods-main"))
from core import protocol as p  # noqa: E402

try:
    import airpods_mouse_controller as mp  # noqa: E402  (reference implementation, unmodified)
except ImportError:  # pragma: no cover
    mp = None


class FakeSock:
    def __init__(self):
        self.out = []

    def send(self, pkt):
        self.out.append(bytes(pkt))


@unittest.skipIf(mp is None, "mousepods-main not found")
class TestMatchesMousepods(unittest.TestCase):
    def ref_client(self):
        c = mp.AAPClient("00:00:00:00:00:00", False, 10000)
        c.sock = FakeSock()
        return c

    def test_constants(self):
        for name in ("PKT_HANDSHAKE", "PKT_FEATURES", "PKT_NOTIFICATIONS", "WX_PREFIX", "RHID_PREFIX"):
            self.assertEqual(getattr(p, name), getattr(mp, name), name)
        self.assertEqual(p.MTU, mp.IOS_MTU)

    def test_start_tracking_bytes(self):
        ref = self.ref_client()
        mp.time.sleep, saved = (lambda s: None), mp.time.sleep
        try:
            ref.start_tracking()
        finally:
            mp.time.sleep = saved
        mine = [pkt for pkt, _ in p.Commands().start_tracking(10000)]
        self.assertEqual(mine, ref.sock.out)

    def test_stop_bytes(self):
        ref = self.ref_client()
        ref.seq = 0x40
        ref.stream(mp.SVC_DEVMOTION6, 0)
        mine = p.Commands().stop_tracking()[0][0]
        self.assertEqual(mine, ref.sock.out[0])

    def test_parse_matches(self):
        blk = p.encode_block(123456789000, (12.2, -3.66, 0.0), (756, 626, 278), (0.6, 0.48, -0.6, 0.24))
        ts, w, g = mp.parse_block(blk)
        s = p.parse_block(blk)
        self.assertEqual((s.ts_ns, s.gyro, s.gravity), (ts, w, g))
        self.assertEqual(s.quat, mp.quat_from_att(struct.unpack_from("<hhh", blk, 20)))
        pkt = p.encode_wx_packet([blk, blk])
        self.assertEqual(mp.motion_blocks(pkt), [blk, blk])


class TestCodec(unittest.TestCase):
    def test_roundtrip(self):
        q = (0.5, 0.5, -0.5, 0.5)
        blk = p.encode_block(42, (1.22, 2.44, -3.66), (1000, -20, 3), q)
        self.assertEqual(len(blk), p.BLOCK_LEN)
        s = p.parse_block(blk, host_t=7.0)
        self.assertEqual((s.host_t, s.ts_ns, s.gravity), (7.0, 42, (1000.0, -20.0, 3.0)))
        for a, b in zip(s.gyro, (1.22, 2.44, -3.66)):
            self.assertAlmostEqual(a, b, places=6)
        for a, b in zip(s.quat, q):
            self.assertAlmostEqual(a, b, places=4)

    def test_negative_w_is_flipped(self):
        s = p.parse_block(p.encode_block(0, (0, 0, 0), (0, 0, 0), (-0.5, -0.5, 0.5, -0.5)))
        for a, b in zip(s.quat, (0.5, 0.5, -0.5, 0.5)):
            self.assertAlmostEqual(a, b, places=4)

    def test_missing_quat_and_foreign_packets(self):
        self.assertIsNone(p.parse_block(p.encode_block(0, (0, 0, 0), (0, 0, 0), None)).quat)
        self.assertEqual(p.motion_blocks(b"\x04\x00\x04\x00\x06\x00\x00\x01"), [])
        self.assertEqual(p.motion_blocks(p.WX_PREFIX + b"\x05\x00\xff\xff"), [])   # corrupt: no crash

    def test_many_blocks_per_packet(self):
        blks = [p.encode_block(i, (i, 0, 0), (0, 0, 1000), None) for i in range(40)]
        self.assertEqual(p.motion_blocks(p.encode_wx_packet(blks)), blks)

    def test_ear_place(self):
        self.assertEqual(p.ear_place(p.HDR + bytes([0x06, 0, 0, 1])), "ear")
        self.assertEqual(p.ear_place(p.HDR + bytes([0x06, 0, 2, 2])), "case")
        self.assertEqual(p.ear_place(p.HDR + bytes([0x06, 0, 1, 2])), "out")
        self.assertIsNone(p.ear_place(p.WX_PREFIX))


if __name__ == "__main__":
    unittest.main()
