"""Built-in game output, verified from the game's side: opentrack's NPClient64.dll reads our shared memory.

Each DLL check runs in a child process because the DLL keeps per-process state (encryption is
decided once per process, like it is once per game launch).
"""

import json
import math
import os
import subprocess
import sys
import textwrap
import unittest

HERE = os.path.dirname(__file__)
APP = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, APP)
from outputs import freetrack as ft  # noqa: E402

NP_AXIS_MAX = 16383

CHILD = textwrap.dedent(r"""
    import ctypes, json, sys, time
    sys.path.insert(0, {app!r})
    from outputs.freetrack import FreeTrackOutput

    class Tir(ctypes.Structure):
        _fields_ = [("status", ctypes.c_short), ("frame", ctypes.c_short), ("cksum", ctypes.c_uint),
                    ("roll", ctypes.c_float), ("pitch", ctypes.c_float), ("yaw", ctypes.c_float),
                    ("tx", ctypes.c_float), ("ty", ctypes.c_float), ("tz", ctypes.c_float),
                    ("padding", ctypes.c_float * 9)]

    out = FreeTrackOutput(register=False, dummy_trackir=False)
    dll = ctypes.WinDLL({dll!r})
    dll.NP_RegisterProgramProfileID({game_id})      # what a TrackIR game does at start-up
    out.send(*{pose!r})                              # our pipeline writes a frame
    out.send(*{pose!r})
    tir = Tir()
    dll.NP_GetData(ctypes.byref(tir))
    print(json.dumps({{"raw": list(bytes(tir)), "game": out.game_name, "dataid": out.heap.data.DataID}}))
    out.close()
""")


def dehance(buf, table):
    """Inverse of NPClient's enhance(): undo the per-game TrackIR scrambling."""
    buf = bytearray(buf)
    ptr, var, size = 0, 0x88, len(buf)
    while size:
        size -= 1
        tmp = buf[size] ^ table[ptr] ^ var
        buf[size] = tmp
        var = (var + size + tmp) & 0xFF
        ptr = (ptr + 1) % len(table)
    return bytes(buf)


def read_via_npclient(game_id, pose):
    code = CHILD.format(app=APP, dll=os.path.join(ft.VENDOR, "NPClient64.dll"), game_id=game_id, pose=pose)
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise AssertionError(r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


class TestGamesDb(unittest.TestCase):
    def test_sims_present(self):
        games = ft.load_games()
        self.assertGreater(len(games), 500)
        self.assertEqual(games[14101][0], "iRacing")
        self.assertEqual(games[8150][0], "MS Flight Simulator 2020")
        self.assertEqual(games[8151][0], "MS Flight Simulator 2024")
        self.assertEqual(games[14101][1], bytes(8))           # V160: no scrambling

    def test_parse_key_order(self):
        # "00" fuzz2, "11" fuzz0, then t3 t2 t1 t0 t7 t6 t5 t4, then fuzz1
        self.assertEqual(ft.parse_key("V170", "0011" + "03020100" + "07060504" + "ff"), bytes(range(8)))
        self.assertEqual(ft.parse_key("V160", "0011" + "03020100" + "07060504" + "ff"), bytes(8))
        self.assertEqual(ft.parse_key("V170", "short"), bytes(8))


@unittest.skipUnless(sys.platform == "win32" and os.path.exists(os.path.join(ft.VENDOR, "NPClient64.dll")),
                     "Windows + vendored NPClient64.dll needed")
class TestNPClientReadsOurPose(unittest.TestCase):
    POSE = (20.0, -10.0, 5.0)        # yaw left 20, pitch down 10, right ear down 5

    def expected(self):
        y, p, r = (math.radians(a) * NP_AXIS_MAX / math.pi for a in self.POSE)
        return y, p, -r              # FreeTrack roll + = left

    def check(self, tir_bytes):
        import ctypes
        vals = ctypes.c_float * 3
        roll, pitch, yaw = vals.from_buffer_copy(tir_bytes[8:20])
        ey, ep, er = self.expected()
        self.assertAlmostEqual(yaw, ey, delta=0.5)
        self.assertAlmostEqual(pitch, ep, delta=0.5)
        self.assertAlmostEqual(roll, er, delta=0.5)
        self.assertEqual(int.from_bytes(tir_bytes[0:2], "little", signed=True), 0)     # status OK

    def test_unscrambled_game_msfs2020(self):
        res = read_via_npclient(8150, self.POSE)
        self.assertEqual(res["game"], "MS Flight Simulator 2020")
        self.assertEqual(res["dataid"], 1)                  # reset on game change, then +1
        self.check(bytes(res["raw"]))

    def test_scrambled_game(self):
        games = ft.load_games()
        gid = next(g for g, (_, t) in sorted(games.items()) if any(t))   # first game that needs the key
        res = read_via_npclient(gid, self.POSE)
        raw = bytes(res["raw"])
        with self.assertRaises(AssertionError):
            self.check(raw)                                  # scrambled as sent to the game
        self.check(dehance(raw, games[gid][1]))              # and correct once unscrambled


@unittest.skipUnless(sys.platform == "win32", "Windows only")
class TestRegistry(unittest.TestCase):
    def test_register_and_restore(self):
        import winreg

        def read(key):
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
                    return winreg.QueryValueEx(k, "Path")[0]
            except OSError:
                return None

        before = {k: read(k) for k in (ft.REG_FREETRACK, ft.REG_NPCLIENT)}
        out = ft.FreeTrackOutput(dummy_trackir=False)
        try:
            for k in before:
                self.assertEqual(read(k), ft.VENDOR.replace("\\", "/") + "/")
        finally:
            out.close()
        for k, v in before.items():
            self.assertEqual(read(k), v or "")


if __name__ == "__main__":
    unittest.main()
