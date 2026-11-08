"""Transports for the AAP channel. make_transport() picks one by name."""

from .base import Transport, TransportError  # noqa: F401


def make_transport(kind, **kw):
    """kind: 'bluez' (Linux), 'replay' (needs path=...), 'windriver' (Windows driver, Phase 5)."""
    if kind == "bluez":
        from .bluez import BluezTransport
        return BluezTransport(**kw)
    if kind == "replay":
        from .replay import ReplayTransport
        return ReplayTransport(kw.pop("path"), **kw)
    if kind == "windriver":
        from .windriver import WinDriverTransport
        return WinDriverTransport(**kw)
    raise ValueError(f"unknown transport {kind!r}")
