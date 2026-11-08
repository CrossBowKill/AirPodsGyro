"""Windows transport: the AAP L2CAP channel through our AirPodsL2cap.sys driver (driver/AirPodsL2cap).

The driver binds to the AirPods' Apple service device node and exposes a device interface:
  IOCTL_APL2_CONNECT     open L2CAP PSM 0x1001 (in-MTU 2582, encrypted link)
  ReadFile / WriteFile   one L2CAP packet each
  IOCTL_APL2_GET_INFO    state, AirPods address, MTUs, counters
Keep the constants below in sync with driver/AirPodsL2cap/public.h.
"""

import ctypes
import re
import struct
import sys
from ctypes import wintypes

from .base import Transport, TransportError

GUID_DEVINTERFACE_AIRPODS_L2CAP = "{6F3A2C41-8D7E-4B8A-9C51-2E7D14A9630B}"
IOCTL_APL2_GET_INFO = 0x222000
IOCTL_APL2_CONNECT = 0x222004
IOCTL_APL2_DISCONNECT = 0x222008
STATES = {0: "disconnected", 1: "connected", 2: "remote disconnected"}
INFO_FMT = "<IIQHHHHiIII"            # APL2_INFO, 48 bytes
CONNECT_FMT = "<HHI"                 # APL2_CONNECT_IN, 8 bytes
READ_SIZE = 4096

GENERIC_READ, GENERIC_WRITE = 0x80000000, 0x40000000
OPEN_EXISTING, FILE_FLAG_OVERLAPPED = 3, 0x40000000
ERROR_IO_PENDING, WAIT_TIMEOUT, WAIT_OBJECT_0 = 997, 0x102, 0
CM_GET_DEVICE_INTERFACE_LIST_PRESENT = 0
INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value


class GUID(ctypes.Structure):
    _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD), ("Data3", wintypes.WORD),
                ("Data4", ctypes.c_ubyte * 8)]

    @classmethod
    def parse(cls, s):
        h = s.strip("{}").replace("-", "")
        g = cls(int(h[0:8], 16), int(h[8:12], 16), int(h[12:16], 16))
        for i in range(8):
            g.Data4[i] = int(h[16 + 2 * i:18 + 2 * i], 16)
        return g


class OVERLAPPED(ctypes.Structure):
    _fields_ = [("Internal", ctypes.c_void_p), ("InternalHigh", ctypes.c_void_p), ("Offset", wintypes.DWORD),
                ("OffsetHigh", wintypes.DWORD), ("hEvent", wintypes.HANDLE)]


def _api():
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    cfg = ctypes.WinDLL("cfgmgr32")
    k32.CreateFileW.restype = wintypes.HANDLE
    k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                                wintypes.DWORD, wintypes.HANDLE]
    k32.CreateEventW.restype = wintypes.HANDLE
    k32.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
    for name in ("ReadFile", "WriteFile"):
        getattr(k32, name).argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                                       ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(OVERLAPPED)]
    k32.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p,
                                    wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(OVERLAPPED)]
    k32.GetOverlappedResult.argtypes = [wintypes.HANDLE, ctypes.POINTER(OVERLAPPED), ctypes.POINTER(wintypes.DWORD),
                                        wintypes.BOOL]
    k32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    k32.WaitForSingleObject.restype = wintypes.DWORD
    k32.CancelIoEx.argtypes = [wintypes.HANDLE, ctypes.POINTER(OVERLAPPED)]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    k32.ResetEvent.argtypes = [wintypes.HANDLE]
    cfg.CM_Get_Device_Interface_List_SizeW.argtypes = [ctypes.POINTER(wintypes.ULONG), ctypes.POINTER(GUID),
                                                       wintypes.LPCWSTR, wintypes.ULONG]
    cfg.CM_Get_Device_Interface_ListW.argtypes = [ctypes.POINTER(GUID), wintypes.LPCWSTR, ctypes.c_void_p,
                                                  wintypes.ULONG, wintypes.ULONG]
    return k32, cfg


def list_interfaces():
    """Device interface paths of AirPods with our driver loaded."""
    if sys.platform != "win32":
        return []
    _, cfg = _api()
    guid = GUID.parse(GUID_DEVINTERFACE_AIRPODS_L2CAP)
    n = wintypes.ULONG(0)
    if cfg.CM_Get_Device_Interface_List_SizeW(ctypes.byref(n), ctypes.byref(guid), None,
                                              CM_GET_DEVICE_INTERFACE_LIST_PRESENT) != 0 or n.value <= 1:
        return []
    buf = ctypes.create_unicode_buffer(n.value)
    if cfg.CM_Get_Device_Interface_ListW(ctypes.byref(guid), None, buf, n.value,
                                         CM_GET_DEVICE_INTERFACE_LIST_PRESENT) != 0:
        return []
    return [p for p in ctypes.wstring_at(buf, n.value).split("\0") if p]


def format_addr(a):
    return ":".join(f"{(a >> (8 * i)) & 0xFF:02X}" for i in range(5, -1, -1))


def parse_info(raw):
    v = struct.unpack(INFO_FMT, raw)
    return {"version": v[0], "state": STATES.get(v[1], v[1]), "addr": format_addr(v[2]), "psm": v[3],
            "in_mtu": v[4], "out_mtu": v[5], "last_status": f"0x{v[7] & 0xFFFFFFFF:08X}",
            "reads": v[8], "writes": v[9]}


class _Device:
    """One open handle to the driver, overlapped I/O."""

    def __init__(self, path):
        self.k32, _ = _api()
        self.path = path
        self.h = self.k32.CreateFileW(path, GENERIC_READ | GENERIC_WRITE, 0, None, OPEN_EXISTING,
                                      FILE_FLAG_OVERLAPPED, None)
        if self.h in (None, INVALID_HANDLE_VALUE):
            raise TransportError(f"cannot open the AirPodsGyro driver (error {ctypes.get_last_error()})")
        self._rd_ov = OVERLAPPED()
        self._rd_ov.hEvent = self.k32.CreateEventW(None, True, False, None)
        self._rd_buf = ctypes.create_string_buffer(READ_SIZE)
        self._rd_pending = False

    def _sync(self, fn, *args, timeout_ms=30000):
        ov = OVERLAPPED()
        ov.hEvent = self.k32.CreateEventW(None, True, False, None)
        try:
            n = wintypes.DWORD(0)
            if not fn(self.h, *args, ctypes.byref(n), ctypes.byref(ov)):
                err = ctypes.get_last_error()
                if err != ERROR_IO_PENDING:
                    raise TransportError(f"{fn.__name__} failed (error {err})")
                if self.k32.WaitForSingleObject(ov.hEvent, timeout_ms) == WAIT_TIMEOUT:
                    self.k32.CancelIoEx(self.h, ctypes.byref(ov))
                    self.k32.GetOverlappedResult(self.h, ctypes.byref(ov), ctypes.byref(n), True)
                    raise TransportError(f"{fn.__name__} timed out")
                if not self.k32.GetOverlappedResult(self.h, ctypes.byref(ov), ctypes.byref(n), True):
                    raise TransportError(f"{fn.__name__} failed (error {ctypes.get_last_error()})")
            return n.value
        finally:
            self.k32.CloseHandle(ov.hEvent)

    def ioctl(self, code, inbuf=b"", out_size=0, timeout_ms=30000):
        ib = ctypes.create_string_buffer(inbuf, len(inbuf)) if inbuf else None
        ob = ctypes.create_string_buffer(out_size) if out_size else None
        n = self._sync(self.k32.DeviceIoControl, code, ib, len(inbuf), ob, out_size, timeout_ms=timeout_ms)
        return ob.raw[:n] if ob else b""

    def info(self):
        return parse_info(self.ioctl(IOCTL_APL2_GET_INFO, out_size=struct.calcsize(INFO_FMT)))

    def write(self, data, timeout_ms=3000):
        buf = ctypes.create_string_buffer(bytes(data), len(data))
        return self._sync(self.k32.WriteFile, buf, len(data), timeout_ms=timeout_ms)

    def read(self, timeout_s):
        """One packet, or None on timeout (the read stays pending for the next call)."""
        if not self._rd_pending:
            self.k32.ResetEvent(self._rd_ov.hEvent)
            n = wintypes.DWORD(0)
            if self.k32.ReadFile(self.h, self._rd_buf, READ_SIZE, ctypes.byref(n), ctypes.byref(self._rd_ov)):
                return self._rd_buf.raw[:n.value]
            err = ctypes.get_last_error()
            if err != ERROR_IO_PENDING:
                raise TransportError(f"read failed (error {err}): link lost?")
            self._rd_pending = True
        if self.k32.WaitForSingleObject(self._rd_ov.hEvent, max(0, int(timeout_s * 1000))) == WAIT_TIMEOUT:
            return None
        self._rd_pending = False
        n = wintypes.DWORD(0)
        if not self.k32.GetOverlappedResult(self.h, ctypes.byref(self._rd_ov), ctypes.byref(n), False):
            raise TransportError(f"read failed (error {ctypes.get_last_error()}): link lost?")
        return self._rd_buf.raw[:n.value]

    def close(self):
        if self.h:
            if self._rd_pending:
                self.k32.CancelIoEx(self.h, ctypes.byref(self._rd_ov))
                n = wintypes.DWORD(0)
                self.k32.GetOverlappedResult(self.h, ctypes.byref(self._rd_ov), ctypes.byref(n), True)
                self._rd_pending = False
            self.k32.CloseHandle(self.h)          # the driver closes the L2CAP channel on handle close
            self.k32.CloseHandle(self._rd_ov.hEvent)
            self.h = None


class WinDriverTransport(Transport):
    def __init__(self, psm=0x1001, in_mtu=2582, channel_flags=0):
        if sys.platform != "win32":
            raise TransportError("the AirPodsGyro driver transport is Windows only")
        self.psm, self.in_mtu, self.flags = psm, in_mtu, channel_flags
        self.dev = None
        self.path = None
        self.info = {}

    def open(self, addr):
        paths = list_interfaces()
        if not paths:
            raise TransportError("AirPodsGyro driver not found: install it (driver/install.ps1) and pair the AirPods")
        last = None
        for path in paths:
            dev = _Device(path)
            try:
                info = dev.info()
                if addr not in ("auto", "", None) and info["addr"].upper() != addr.upper():
                    dev.close()
                    continue
                dev.ioctl(IOCTL_APL2_CONNECT, struct.pack(CONNECT_FMT, self.psm, self.in_mtu, self.flags))
                self.dev, self.path, self.info = dev, path, dev.info()
                return self.info["addr"]
            except TransportError as e:
                last = e
                dev.close()
        if last:
            raise TransportError(f"could not open the AirPods channel: {last} (are the AirPods connected?)")
        raise TransportError(f"no AirPods with address {addr} found")

    def product_id(self):
        m = re.search(r"PID&([0-9A-Fa-f]{4})", self.path or "")
        return m.group(1).lower() if m else "0000"

    def send(self, pkt):
        if not self.dev:
            raise TransportError("not open")
        self.dev.write(pkt)

    def recv(self, timeout):
        if not self.dev:
            raise TransportError("not open")
        pkt = self.dev.read(timeout)
        if pkt == b"":
            raise TransportError("channel closed")
        return pkt

    def close(self):
        if self.dev:
            try:
                self.dev.ioctl(IOCTL_APL2_DISCONNECT, timeout_ms=5000)
            except TransportError:
                pass
            self.dev.close()
        self.dev = None
