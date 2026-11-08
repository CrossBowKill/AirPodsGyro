"""Built-in game output: FreeTrack 2.0 shared memory + TrackIR (NPClient) emulation, Windows only.

Games load opentrack's NPClient(64).dll / freetrackclient(64).dll (bundled in vendor/opentrack, ISC
licence), found through two HKCU registry keys. Those DLLs read the pose from the "FT_SharedMem"
mapping this class writes, so OpenTrack itself is not needed. Behaviour follows opentrack's
proto-ft/ftnoir_protocol_ft.cpp:

  * angles in radians; FreeTrack yaw + = left, pitch + = up, roll + = left
  * when a TrackIR game registers its ID (GameID), look up its 8-byte key in the games CSV, write
    it to `table`, then GameID2 = GameID and DataID = 0; otherwise DataID += 1 per frame
  * some games only talk to TrackIR when a process called TrackIR.exe runs: start opentrack's dummy

Our pose convention: yaw + = turn left, pitch + = look up, roll + = right ear down.
"""

import ctypes
import math
import os
import subprocess
import sys
from ctypes import wintypes

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(os.path.dirname(HERE), "vendor", "opentrack")
GAMES_CSV = os.path.join(VENDOR, "settings", "facetracknoir supported games.csv")

HEAP_NAME = "FT_SharedMem"
MUTEX_NAME = "FT_Mutext"
REG_FREETRACK = r"Software\Freetrack\FreetrackClient"
REG_NPCLIENT = r"Software\NaturalPoint\NATURALPOINT\NPClient Location"


class FTData(ctypes.Structure):
    _fields_ = [("DataID", ctypes.c_uint32), ("CamWidth", ctypes.c_int32), ("CamHeight", ctypes.c_int32)] + \
        [(n, ctypes.c_float) for n in ("Yaw", "Pitch", "Roll", "X", "Y", "Z",
                                       "RawYaw", "RawPitch", "RawRoll", "RawX", "RawY", "RawZ",
                                       "X1", "Y1", "X2", "Y2", "X3", "Y3", "X4", "Y4")]


class FTHeap(ctypes.Structure):
    _fields_ = [("data", FTData), ("GameID", ctypes.c_int32), ("table", ctypes.c_ubyte * 8),
                ("GameID2", ctypes.c_int32)]


# ----------------------------------------------------------------------------- games database


def parse_key(proto, key):
    """FTN_ID column -> 8-byte TrackIR table (zeros for unencrypted 'V160' games)."""
    if proto == "V160" or len(key) != 22:
        return bytes(8)
    try:
        b = bytes.fromhex(key)
    except ValueError:
        return bytes(8)
    # opentrack's sscanf order: fuzz2 fuzz0 t3 t2 t1 t0 t7 t6 t5 t4 fuzz1
    t = [0] * 8
    t[3], t[2], t[1], t[0], t[7], t[6], t[5], t[4] = b[2:10]
    return bytes(t)


def load_games(path=GAMES_CSV):
    """{international_id: (name, table bytes)}"""
    games = {}
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                cols = line.rstrip("\r\n").split(";")
                if len(cols) == 8 and cols[6].strip().isdigit():
                    games[int(cols[6])] = (cols[1], parse_key(cols[3], cols[7]))
    except OSError:
        pass
    return games


# ----------------------------------------------------------------------------- output


class FreeTrackOutput:
    name = "Games (TrackIR / FreeTrack)"

    def __init__(self, dll_dir=VENDOR, games_csv=GAMES_CSV, register=True, dummy_trackir=True,
                 roll_sign=-1):
        if sys.platform != "win32":
            raise OSError("FreeTrack/TrackIR output is Windows only")
        self.dll_dir, self.roll_sign = dll_dir, roll_sign
        self.games = load_games(games_csv)
        self.game_id = 0
        self.game_name = ""
        self._saved_reg = {}
        self._dummy = None
        self._open_mapping()
        if register:
            self._register()
        if dummy_trackir:
            self._start_dummy()

    # ------------------------------------------------------------------ shared memory

    def _open_mapping(self):
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateFileMappingW.restype = wintypes.HANDLE
        k32.CreateFileMappingW.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD,
                                           wintypes.DWORD, wintypes.LPCWSTR]
        k32.MapViewOfFile.restype = ctypes.c_void_p
        k32.MapViewOfFile.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
                                      ctypes.c_size_t]
        k32.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
        k32.CreateMutexW.restype = wintypes.HANDLE
        k32.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
        k32.CloseHandle.argtypes = [wintypes.HANDLE]
        self.k32 = k32
        INVALID_HANDLE_VALUE, PAGE_READWRITE, FILE_MAP_WRITE = wintypes.HANDLE(-1).value, 0x04, 0x0002
        size = ctypes.sizeof(FTHeap)
        self.h_map = k32.CreateFileMappingW(INVALID_HANDLE_VALUE, None, PAGE_READWRITE, 0, size, HEAP_NAME)
        if not self.h_map:
            raise OSError(ctypes.get_last_error(), "CreateFileMapping FT_SharedMem failed")
        self.view = k32.MapViewOfFile(self.h_map, FILE_MAP_WRITE, 0, 0, size)
        if not self.view:
            err = ctypes.get_last_error()
            k32.CloseHandle(self.h_map)
            raise OSError(err, "MapViewOfFile FT_SharedMem failed")
        self.h_mutex = k32.CreateMutexW(None, False, MUTEX_NAME)
        self.heap = FTHeap.from_address(self.view)
        self.heap.data.DataID = 1
        self.heap.data.CamWidth, self.heap.data.CamHeight = 100, 250
        self.heap.GameID2 = 0
        for i in range(8):
            self.heap.table[i] = 0

    # ------------------------------------------------------------------ registry + dummy

    def _register(self):
        import winreg
        path = self.dll_dir.replace("\\", "/").rstrip("/") + "/"
        for key in (REG_FREETRACK, REG_NPCLIENT):
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as k:
                try:
                    self._saved_reg[key] = winreg.QueryValueEx(k, "Path")[0]
                except OSError:
                    self._saved_reg[key] = None
                winreg.SetValueEx(k, "Path", 0, winreg.REG_SZ, path)

    def _restore_registry(self):
        import winreg
        for key, old in self._saved_reg.items():
            try:
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as k:
                    if old is None:
                        winreg.SetValueEx(k, "Path", 0, winreg.REG_SZ, "")
                    else:
                        winreg.SetValueEx(k, "Path", 0, winreg.REG_SZ, old)
            except OSError:
                pass
        self._saved_reg = {}

    def _start_dummy(self):
        exe = os.path.join(self.dll_dir, "TrackIR.exe")
        if os.path.exists(exe):
            try:
                self._dummy = subprocess.Popen([exe], cwd=self.dll_dir,
                                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            except OSError:
                self._dummy = None

    # ------------------------------------------------------------------ frames

    def send(self, yaw, pitch, roll):
        h = self.heap
        d = h.data
        y, p, r = math.radians(yaw), math.radians(pitch), self.roll_sign * math.radians(roll)
        d.Yaw, d.Pitch, d.Roll = y, p, r
        d.RawYaw, d.RawPitch, d.RawRoll = y, p, r
        gid = h.GameID
        if gid != self.game_id:
            name, table = self.games.get(gid, ("", bytes(8)))
            for i in range(8):
                h.table[i] = table[i]
            h.GameID2 = gid
            d.DataID = 0
            self.game_id = gid
            self.game_name = name or (f"unknown game {gid}" if gid else "")
        else:
            d.DataID = (d.DataID + 1) & 0xFFFFFFFF

    def close(self):
        if getattr(self, "view", None):
            d = self.heap.data
            d.Yaw = d.Pitch = d.Roll = 0.0
            self.heap = None
            self.k32.UnmapViewOfFile(self.view)
            self.view = None
        for h in ("h_map", "h_mutex"):
            if getattr(self, h, None):
                self.k32.CloseHandle(getattr(self, h))
                setattr(self, h, None)
        if self._saved_reg:
            self._restore_registry()
        if self._dummy and self._dummy.poll() is None:
            self._dummy.kill()
            self._dummy.wait(2)
        self._dummy = None
