"""System-wide hotkeys (work while a game has focus). Windows: RegisterHotKey + WM_HOTKEY."""

import ctypes
import sys
from ctypes import wintypes

from PySide6.QtCore import QAbstractNativeEventFilter, QObject, Signal

MOD = {"alt": 0x0001, "ctrl": 0x0002, "shift": 0x0004, "win": 0x0008}
MOD_NOREPEAT = 0x4000
WM_HOTKEY = 0x0312
VK_NAMED = {f"f{i}": 0x6F + i for i in range(1, 25)}
VK_NAMED.update({"space": 0x20, "home": 0x24, "end": 0x23, "insert": 0x2D, "pause": 0x13,
                 "scrolllock": 0x91, "numpad0": 0x60, "numpad5": 0x65})


def parse(combo):
    """'ctrl+alt+r' -> (modifiers, virtual key). Raises ValueError."""
    mods, key = 0, None
    for part in combo.lower().replace(" ", "").split("+"):
        if part in MOD:
            mods |= MOD[part]
        elif part in VK_NAMED:
            key = VK_NAMED[part]
        elif len(part) == 1 and part.isalnum():
            key = ord(part.upper())
        else:
            raise ValueError(f"unknown key {part!r} in {combo!r}")
    if key is None:
        raise ValueError(f"no key in {combo!r}")
    return mods, key


class GlobalHotkeys(QObject, QAbstractNativeEventFilter):
    triggered = Signal(str)

    def __init__(self, app):
        QObject.__init__(self)
        QAbstractNativeEventFilter.__init__(self)
        self.ids = {}
        self.ok = sys.platform == "win32"
        if self.ok:
            self.user32 = ctypes.WinDLL("user32", use_last_error=True)
            self.user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
            self.user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
            app.installNativeEventFilter(self)

    def set(self, mapping):
        """mapping: {name: 'ctrl+alt+r'}. Returns {name: error text} for combos that failed."""
        self.clear()
        errors = {}
        if not self.ok:
            return {n: "global hotkeys are Windows only" for n in mapping}
        for i, (name, combo) in enumerate(mapping.items(), start=1):
            if not combo:
                continue
            try:
                mods, vk = parse(combo)
            except ValueError as e:
                errors[name] = f"is not a valid key ({e})"
                continue
            if self.user32.RegisterHotKey(None, i, mods | MOD_NOREPEAT, vk):
                self.ids[i] = name
            else:
                errors[name] = "is already used by another program"
        return errors

    def clear(self):
        if self.ok:
            for i in list(self.ids):
                self.user32.UnregisterHotKey(None, i)
        self.ids = {}

    def nativeEventFilter(self, event_type, message):
        if event_type == b"windows_generic_MSG":
            msg = wintypes.MSG.from_address(int(message))
            if msg.message == WM_HOTKEY and msg.wParam in self.ids:
                self.triggered.emit(self.ids[msg.wParam])
                return True, 0
        return False, 0
