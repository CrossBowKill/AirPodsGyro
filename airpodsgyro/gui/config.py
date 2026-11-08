"""App configuration: %APPDATA%\\AirPodsGyro\\config.json (+ calibration.json next to it)."""

import json
import os
import sys

from core.pipeline import Settings

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def config_dir():
    base = os.environ.get("APPDATA") if sys.platform == "win32" else os.path.expanduser("~/.config")
    d = os.path.join(base or os.path.expanduser("~"), "AirPodsGyro")
    os.makedirs(d, exist_ok=True)
    return d


CONFIG_PATH = os.path.join(config_dir(), "config.json")
CALIB_PATH = os.path.join(config_dir(), "calibration.json")
LEGACY_CALIB = os.path.join(APP_DIR, "calibration.json")      # made by bridge.py on Linux

DEFAULT_SOURCE = "windriver" if sys.platform == "win32" else "bluez"

DEFAULTS = {
    "source": {"kind": DEFAULT_SOURCE, "addr": "auto", "replay_path": "", "replay_loop": True},
    "outputs": {"games": sys.platform == "win32", "dummy_trackir": True, "roll_sign": -1,
                "udp": False, "udp_host": "127.0.0.1", "udp_port": 4242},
    "hotkeys": {"recenter": "ctrl+alt+r", "pause": "ctrl+alt+p"},
    "autostart_tracking": True,
    "theme": "system",
    "minimize_to_tray": True,
    "settings": Settings().to_dict(),
}


def _merge(base, over):
    out = dict(base)
    for k, v in (over or {}).items():
        out[k] = _merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return _merge(DEFAULTS, json.load(f))
    except (OSError, ValueError):
        return _merge(DEFAULTS, {})


def save_config(cfg):
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, CONFIG_PATH)


def load_calibration():
    for path in (CALIB_PATH, LEGACY_CALIB):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            continue
    return None


def save_calibration(cal):
    with open(CALIB_PATH, "w", encoding="utf-8") as f:
        json.dump(cal, f, indent=2)
