"""Main window: header with live status, sidebar navigation, Live page (stat tiles, head view, controls) and
settings pages; tray icon and global hotkeys. All colours and fonts come from gui/theme.py.
"""

import copy
import os
import sys

from PySide6.QtCore import QSize, Qt, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QDoubleSpinBox, QFileDialog, QFormLayout,
                               QGridLayout, QHBoxLayout, QLineEdit, QListWidget, QMainWindow, QMenu, QMessageBox,
                               QPushButton, QScrollArea, QSizePolicy, QSpinBox, QStackedWidget, QSystemTrayIcon,
                               QVBoxLayout, QWidget)

from core.pipeline import AXES, Pipeline, Settings
from core.transport import make_transport
from outputs.udp import UdpOutput

from . import config as cfgmod
from . import theme
from .calibration import CalibrationWizard
from .hotkeys import GlobalHotkeys
from .widgets import BAD, IDLE, OK, WARN, Badge, HeadView, StatTile, app_icon, card, label

SOURCES = (("windriver", "AirPods (Windows Bluetooth driver)"),
           ("bluez", "AirPods (Linux / BlueZ)"),
           ("replay", "Recording (replay a soak.csv)"))
STATE_LOOK = {"streaming": ("Streaming", OK), "connecting": ("Connecting", WARN), "stalled": ("Stalled", WARN),
              "reconnecting": ("Reconnecting", BAD), "error": ("Error", BAD), "ended": ("Recording ended", IDLE),
              "stopped": ("Stopped", IDLE), "idle": ("Stopped", IDLE)}
PID_NAMES = {"2027": "AirPods Pro 3", "2024": "AirPods Pro 2 (USB-C)", "2014": "AirPods Pro 2",
             "200e": "AirPods Pro", "2013": "AirPods 3"}
PAGES = ("Live", "Tuning", "Axes", "Games and output", "Source", "App")
THEMES = (("system", "Follow Windows"), ("dark", "Dark"), ("light", "Light"))


def page(title, intro=None):
    """A settings page: title, optional one-line intro, then a card the caller fills. Returns (widget, card layout)."""
    outer = QWidget()
    lay = QVBoxLayout(outer)
    lay.setContentsMargins(28, 24, 28, 24)
    lay.setSpacing(6)
    lay.addWidget(label(title, role="title", size=theme.SIZE["title"], weight=600, display=True))
    if intro:
        it = label(intro, role="muted")
        it.setWordWrap(True)
        lay.addWidget(it)
    lay.addSpacing(10)
    c = card()
    body = QVBoxLayout(c)
    body.setContentsMargins(20, 18, 20, 18)
    body.setSpacing(12)
    lay.addWidget(c)
    lay.addStretch(1)
    scroll = QScrollArea()
    scroll.setWidgetResizable(True)
    scroll.setWidget(outer)
    return scroll, body


def form():
    f = QFormLayout()
    f.setLabelAlignment(Qt.AlignLeft | Qt.AlignVCenter)
    f.setHorizontalSpacing(18)
    f.setVerticalSpacing(10)
    f.setFieldGrowthPolicy(QFormLayout.ExpandingFieldsGrow)
    return f


def row(f, text, field):
    """Form row whose label is vertically centred on the field (QFormLayout alone tops it on Fusion)."""
    lb = label(text)
    lb.setMinimumHeight(field.sizeHint().height())
    lb.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
    f.addRow(lb, field)


def pad_spin(s):
    """Fusion ignores style-sheet padding for spin-box text; set it on the inner line edit."""
    s.lineEdit().setTextMargins(6, 0, 0, 0)
    return s


def pretty_keys(combo):
    return "+".join(k.upper() if len(k) == 1 else k.capitalize() for k in combo.replace(" ", "").split("+"))


def hint(text):
    h = label(text, role="muted", size=theme.SIZE["small"])
    h.setWordWrap(True)
    return h


class MainWindow(QMainWindow):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self.cfg = cfgmod.load_config()
        self.calibration = cfgmod.load_calibration()
        self.settings = Settings.from_dict(self.cfg["settings"])
        self.pipeline = None
        self.outputs = []
        self.games_out = None
        self._last_state = None
        self._loading = True
        self.setWindowTitle("AirPodsGyro")
        self.setWindowIcon(app_icon())
        self.resize(980, 680)
        self.setMinimumSize(760, 560)

        self._build_menu()
        self._build_ui()
        self._build_tray()
        self.hotkeys = GlobalHotkeys(app)
        self.hotkeys.triggered.connect(self._on_hotkey)
        self._apply_hotkeys()

        self.save_timer = QTimer(self, singleShot=True, interval=600, timeout=self._save)
        self.poll = QTimer(self, interval=33, timeout=self._refresh)
        self.poll.start()
        self._loading = False
        self._rebuild_outputs()
        if self.cfg["autostart_tracking"]:
            self.start()
        self._refresh()

    # ================================================================== UI

    def _build_menu(self):
        m = self.menuBar().addMenu("&File")
        m.addAction(QAction("&Quit", self, shortcut=QKeySequence.Quit, triggered=self.quit))
        h = self.menuBar().addMenu("&Help")
        h.addAction(QAction("&About and licences", self, triggered=self._about))

    def _build_ui(self):
        root = QWidget()
        outer = QVBoxLayout(root)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        outer.addWidget(self._header())

        body = QHBoxLayout()
        body.setContentsMargins(0, 0, 0, 0)
        body.setSpacing(0)
        self.nav = QListWidget()
        self.nav.setProperty("role", "nav")
        self.nav.setFixedWidth(196)
        self.nav.addItems(PAGES)
        for i in range(self.nav.count()):
            self.nav.item(i).setSizeHint(QSize(0, 36))
        self.stack = QStackedWidget()
        for build in (self._page_live, self._page_tuning, self._page_axes, self._page_output, self._page_source,
                      self._page_app):
            self.stack.addWidget(build())
        self.nav.currentRowChanged.connect(self.stack.setCurrentIndex)
        self.nav.setCurrentRow(0)
        body.addWidget(self.nav)
        body.addWidget(self.stack, 1)
        outer.addLayout(body, 1)
        self.setCentralWidget(root)
        root.setFocusPolicy(Qt.StrongFocus)          # start without a focus ring; Tab moves into the controls
        root.setFocus()

    def _header(self):
        h = card("header")
        lay = QHBoxLayout(h)
        lay.setContentsMargins(20, 12, 20, 12)
        lay.setSpacing(12)
        icon = label()
        icon.setPixmap(app_icon().pixmap(26, 26))
        lay.addWidget(icon)
        lay.addWidget(label("AirPodsGyro", role="title", size=13, weight=600, display=True))
        lay.addSpacing(8)
        self.badge = Badge("Stopped")
        lay.addWidget(self.badge)
        self.detail = label("", role="muted")
        self.detail.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.detail.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        lay.addWidget(self.detail, 1)
        self.btn_start = QPushButton("Start tracking", clicked=self.toggle_tracking)
        self.btn_start.setProperty("role", "primary")
        self.btn_start.setMinimumWidth(132)
        lay.addWidget(self.btn_start)
        return h

    def _page_live(self):
        w = QWidget()
        lay = QVBoxLayout(w)
        lay.setContentsMargins(28, 24, 28, 24)
        lay.setSpacing(14)

        self.calib_notice = card("notice")
        nl = QHBoxLayout(self.calib_notice)
        nl.setContentsMargins(16, 10, 10, 10)
        self.calib_hint = label("")
        self.calib_hint.setWordWrap(True)
        nl.addWidget(self.calib_hint, 1)
        cal_now = QPushButton("Calibrate now", clicked=self.calibrate)
        cal_now.setProperty("role", "primary")
        nl.addWidget(cal_now)
        lay.addWidget(self.calib_notice)

        tiles = QHBoxLayout()
        tiles.setSpacing(12)
        self.tile_rate = StatTile("Data rate")
        self.tile_device = StatTile("AirPods")
        self.tile_drift = StatTile("Yaw drift correction")
        self.tile_game = StatTile("Game")
        for t in (self.tile_rate, self.tile_device, self.tile_drift, self.tile_game):
            tiles.addWidget(t)
        lay.addLayout(tiles)

        view = card()
        vl = QVBoxLayout(view)
        vl.setContentsMargins(16, 16, 16, 12)
        self.head = HeadView()
        vl.addWidget(self.head, 1)
        lay.addWidget(view, 1)

        controls = QHBoxLayout()
        controls.setSpacing(10)
        self.btn_recenter = QPushButton("Recenter", clicked=self.recenter)
        self.btn_pause = QPushButton("Pause output", checkable=True, toggled=self.set_paused)
        self.btn_calib = QPushButton("Calibrate…", clicked=self.calibrate)
        for b in (self.btn_recenter, self.btn_pause, self.btn_calib):
            controls.addWidget(b)
        controls.addStretch(1)
        self.keys_hint = label("", role="faint", size=theme.SIZE["small"])
        controls.addWidget(self.keys_hint)
        lay.addLayout(controls)

        # kept for compatibility with older code paths (facts now live in the tiles)
        self.lbl_rate = self.tile_rate.value
        self.lbl_device = self.tile_device.value
        self.lbl_drift = self.tile_drift.value
        self.lbl_game = self.tile_game.value
        return w

    def _spin(self, lo, hi, step, val, dec=2, suffix=""):
        s = QDoubleSpinBox()
        s.setRange(lo, hi)
        s.setSingleStep(step)
        s.setDecimals(dec)
        s.setValue(val)
        s.setSuffix(suffix)
        s.setMaximumWidth(160)
        pad_spin(s)
        s.valueChanged.connect(self._settings_changed)
        return s

    def _page_tuning(self):
        w, body = page("Tuning", "How the head movement is smoothed before it reaches the game.")
        st = self.settings
        f = form()
        self.sp_cutoff = self._spin(0.1, 10.0, 0.1, st.mincutoff, suffix=" Hz")
        self.sp_cutoff.setToolTip("Lower = steadier view when your head is still (adds a little lag).")
        self.sp_beta = self._spin(0.0, 1.0, 0.01, st.beta, dec=3)
        self.sp_beta.setToolTip("Higher = less lag on fast head turns.")
        row(f, "Smoothing at rest", self.sp_cutoff)
        row(f, "Speed response", self.sp_beta)
        body.addLayout(f)
        body.addWidget(hint("Lower smoothing values steady the view at rest; raise speed response if quick "
                            "glances feel late."))
        self.cb_drift = QCheckBox("Correct slow yaw drift (recommended)")
        self.cb_drift.setChecked(st.drift)
        self.cb_drift.setToolTip("The AirPods' heading slowly turns by itself (about 1 to 4° per minute). This "
                                 "removes it\nwhile your head is still, at most 6° per minute, so real head turns "
                                 "are untouched.")
        self.cb_drift.toggled.connect(self._settings_changed)
        body.addWidget(self.cb_drift)
        return w

    def _page_axes(self):
        w, body = page("Axes", "Gain, deadzone, limit and direction for each axis.")
        g = QGridLayout()
        g.setHorizontalSpacing(14)
        g.setVerticalSpacing(10)
        for c, h in enumerate(("", "Gain", "Deadzone", "Limit", "Invert")):
            g.addWidget(label(h, role="muted", size=theme.SIZE["small"]), 0, c)
        self.axis_widgets = {}
        for r, a in enumerate(AXES, start=1):
            ax = self.settings.axes[a]
            gain = self._spin(0.1, 10.0, 0.1, ax.gain, suffix="×")
            dz = self._spin(0.0, 20.0, 0.5, ax.deadzone, dec=1, suffix="°")
            lim = self._spin(5.0, 180.0, 5.0, ax.limit, dec=0, suffix="°")
            inv = QCheckBox()
            inv.setChecked(ax.invert)
            inv.toggled.connect(self._settings_changed)
            g.addWidget(label(a.capitalize(), weight=600), r, 0)
            for c, wd in enumerate((gain, dz, lim, inv), start=1):
                g.addWidget(wd, r, c)
            self.axis_widgets[a] = (gain, dz, lim, inv)
        g.setColumnStretch(5, 1)
        body.addLayout(g)
        body.addWidget(hint("Gain 2× means turning your head 45° turns the in-game view 90°, so you can still "
                            "see the screen while looking around."))
        return w

    def _page_output(self):
        w, body = page("Games and output", "Games see AirPodsGyro as TrackIR or FreeTrack; OpenTrack is optional.")
        o = self.cfg["outputs"]
        body.addWidget(label("Built-in TrackIR / FreeTrack", weight=600))
        self.cb_games = QCheckBox("Send head tracking to games")
        self.cb_games.setChecked(o["games"])
        self.cb_games.setEnabled(sys.platform == "win32")
        self.cb_dummy = QCheckBox("Run the TrackIR.exe helper (some games look for it)")
        self.cb_dummy.setChecked(o["dummy_trackir"])
        self.cb_roll = QCheckBox("Flip roll for games")
        self.cb_roll.setChecked(o["roll_sign"] == 1)
        for cb in (self.cb_games, self.cb_dummy, self.cb_roll):
            cb.toggled.connect(self._outputs_changed)
            body.addWidget(cb)
        body.addWidget(hint("Works with TrackIR games such as iRacing, MSFS 2020/2024, DCS, Assetto Corsa "
                            "Competizione and Euro Truck Simulator. Turn on TrackIR in the game's settings."))
        body.addSpacing(8)
        body.addWidget(label("OpenTrack (FreePIE UDP receiver)", weight=600))
        self.cb_udp = QCheckBox("Send to OpenTrack")
        self.cb_udp.setChecked(o["udp"])
        self.ed_host = QLineEdit(o["udp_host"])
        self.ed_host.setMaximumWidth(240)
        self.sp_port = QSpinBox()
        self.sp_port.setRange(1, 65535)
        self.sp_port.setValue(o["udp_port"])
        self.sp_port.setMaximumWidth(120)
        pad_spin(self.sp_port)
        self.cb_udp.toggled.connect(self._outputs_changed)
        self.ed_host.editingFinished.connect(self._outputs_changed)
        self.sp_port.valueChanged.connect(self._outputs_changed)
        body.addWidget(self.cb_udp)
        f = form()
        row(f, "Host", self.ed_host)
        row(f, "Port", self.sp_port)
        body.addLayout(f)
        self.out_error = label("", role="error")
        self.out_error.setWordWrap(True)
        body.addWidget(self.out_error)
        return w

    def _page_source(self):
        w, body = page("Source", "Where the head tracking comes from.")
        s = self.cfg["source"]
        f = form()
        self.cmb_source = QComboBox()
        for key, text in SOURCES:
            self.cmb_source.addItem(text, key)
        self.cmb_source.setCurrentIndex(max(0, [k for k, _ in SOURCES].index(s["kind"])))
        self.ed_addr = QLineEdit(s["addr"])
        self.ed_addr.setPlaceholderText("auto, or AA:BB:CC:DD:EE:FF")
        self.ed_addr.setMaximumWidth(260)
        self.ed_replay = QLineEdit(s["replay_path"])
        browse = QPushButton("Browse…", clicked=self._browse_replay)
        rec = QHBoxLayout()
        rec.addWidget(self.ed_replay, 1)
        rec.addWidget(browse)
        self.cb_loop = QCheckBox("Loop the recording")
        self.cb_loop.setChecked(s["replay_loop"])
        row(f, "Source", self.cmb_source)
        row(f, "AirPods address", self.ed_addr)
        rec_w = QWidget()
        rec_w.setLayout(rec)
        rec.setContentsMargins(0, 0, 0, 0)
        row(f, "Recording", rec_w)
        f.addRow("", self.cb_loop)
        body.addLayout(f)
        apply_btn = QPushButton("Apply and restart tracking", clicked=self._source_changed)
        apply_btn.setProperty("role", "primary")
        ar = QHBoxLayout()
        ar.addWidget(apply_btn)
        ar.addStretch(1)
        body.addLayout(ar)
        body.addWidget(hint("The Windows driver (driver\\install.ps1, needs test-signing mode) lets the AirPods "
                            "stream head tracking while still playing audio. Put both AirPods in before starting."))
        return w

    def _page_app(self):
        w, body = page("App", "Hotkeys work while a game has focus.")
        hk = self.cfg["hotkeys"]
        f = form()
        self.ed_hk_recenter = QLineEdit(hk["recenter"])
        self.ed_hk_pause = QLineEdit(hk["pause"])
        for e in (self.ed_hk_recenter, self.ed_hk_pause):
            e.setPlaceholderText("e.g. ctrl+alt+r, f9, ctrl+shift+home")
            e.setMaximumWidth(260)
            e.editingFinished.connect(self._hotkeys_changed)
        self.cmb_theme = QComboBox()
        for key, text in THEMES:
            self.cmb_theme.addItem(text, key)
        self.cmb_theme.setCurrentIndex([k for k, _ in THEMES].index(self.cfg.get("theme", "system")))
        self.cmb_theme.currentIndexChanged.connect(self._theme_changed)
        self.cmb_theme.setMaximumWidth(260)
        row(f, "Recenter", self.ed_hk_recenter)
        row(f, "Pause output", self.ed_hk_pause)
        row(f, "Appearance", self.cmb_theme)
        body.addLayout(f)
        self.hk_error = label("", role="error")
        self.hk_error.setWordWrap(True)
        body.addWidget(self.hk_error)
        self.cb_autostart = QCheckBox("Start tracking when the app opens")
        self.cb_autostart.setChecked(self.cfg["autostart_tracking"])
        self.cb_tray = QCheckBox("Closing the window keeps it running in the tray")
        self.cb_tray.setChecked(self.cfg["minimize_to_tray"])
        for cb in (self.cb_autostart, self.cb_tray):
            cb.toggled.connect(self._general_changed)
            body.addWidget(cb)
        where = hint(f"Settings are stored in {cfgmod.config_dir()}")
        where.setTextInteractionFlags(Qt.TextSelectableByMouse)
        body.addWidget(where)
        return w

    def _build_tray(self):
        self.tray = QSystemTrayIcon(app_icon(IDLE), self)
        menu = QMenu()
        menu.addAction("Show", self._show)
        menu.addAction("Recenter", self.recenter)
        self.tray_pause = menu.addAction("Pause output")
        self.tray_pause.setCheckable(True)
        self.tray_pause.toggled.connect(self.btn_pause.setChecked)
        menu.addSeparator()
        menu.addAction("Quit", self.quit)
        self.tray.setContextMenu(menu)
        self.tray.activated.connect(lambda r: self._show() if r == QSystemTrayIcon.Trigger else None)
        self.tray.setToolTip("AirPodsGyro")
        if QSystemTrayIcon.isSystemTrayAvailable():
            self.tray.show()

    # ================================================================== pipeline

    def _factory(self):
        s = self.cfg["source"]
        if s["kind"] == "replay":
            path = s["replay_path"]
            if not path or not os.path.exists(path):
                raise FileNotFoundError("choose a recording (soak.csv) on the Source page")
            return lambda: make_transport("replay", path=path, speed=1.0, loop=s["replay_loop"])
        kind = s["kind"]
        return lambda: make_transport(kind)

    def start(self):
        self.stop()
        try:
            factory = self._factory()
        except OSError as e:
            self._show_detail("error", str(e))
            return
        self.pipeline = Pipeline(factory, self.calibration, self.settings, self.outputs,
                                 addr=self.cfg["source"]["addr"] or "auto")
        self.pipeline.paused = self.btn_pause.isChecked()
        self.pipeline.start()

    def stop(self):
        if self.pipeline:
            self.pipeline.stop()
        self.pipeline = None

    def toggle_tracking(self):
        if self.pipeline and self.pipeline.running:
            self.stop()
        else:
            self.start()
        self._refresh()

    def recenter(self):
        if self.pipeline:
            self.pipeline.recenter()

    def set_paused(self, on):
        if self.pipeline:
            self.pipeline.paused = on
        self.btn_pause.setText("Output paused" if on else "Pause output")
        if self.tray_pause.isChecked() != on:
            self.tray_pause.setChecked(on)

    def calibrate(self):
        if not (self.pipeline and self.pipeline.running):
            self.start()
        dlg = CalibrationWizard(self.pipeline, self)
        if dlg.exec() and dlg.result:
            self.calibration = dlg.result
            cfgmod.save_calibration(dlg.result)
            self.pipeline.set_calibration(dlg.result)
            self.pipeline.recenter()

    def _rebuild_outputs(self):
        for out in self.outputs:
            out.close()
        self.outputs, self.games_out, errors = [], None, []
        o = self.cfg["outputs"]
        if o["games"]:
            try:
                from outputs.freetrack import FreeTrackOutput
                self.games_out = FreeTrackOutput(dummy_trackir=o["dummy_trackir"], roll_sign=o["roll_sign"])
                self.outputs.append(self.games_out)
            except OSError as e:
                errors.append(f"Games output: {e}")
        if o["udp"]:
            try:
                self.outputs.append(UdpOutput(o["udp_host"], int(o["udp_port"])))
            except OSError as e:
                errors.append(f"OpenTrack output: {e}")
        self.out_error.setText("\n".join(errors))
        if self.pipeline:
            self.pipeline.outputs = list(self.outputs)

    # ================================================================== settings changes

    def _settings_changed(self, *_):
        if self._loading:
            return
        st = copy.deepcopy(self.settings)
        st.mincutoff, st.beta, st.drift = self.sp_cutoff.value(), self.sp_beta.value(), self.cb_drift.isChecked()
        for a, (gain, dz, lim, inv) in self.axis_widgets.items():
            ax = st.axes[a]
            ax.gain, ax.deadzone, ax.limit, ax.invert = gain.value(), dz.value(), lim.value(), inv.isChecked()
        self.settings = st
        if self.pipeline:
            self.pipeline.set_settings(st)
        self.cfg["settings"] = st.to_dict()
        self.save_timer.start()

    def _outputs_changed(self, *_):
        if self._loading:
            return
        self.cfg["outputs"].update({"games": self.cb_games.isChecked(), "dummy_trackir": self.cb_dummy.isChecked(),
                                    "roll_sign": 1 if self.cb_roll.isChecked() else -1,
                                    "udp": self.cb_udp.isChecked(), "udp_host": self.ed_host.text().strip(),
                                    "udp_port": self.sp_port.value()})
        self._rebuild_outputs()
        self.save_timer.start()

    def _source_changed(self):
        self.cfg["source"].update({"kind": self.cmb_source.currentData(), "addr": self.ed_addr.text().strip() or "auto",
                                   "replay_path": self.ed_replay.text().strip(),
                                   "replay_loop": self.cb_loop.isChecked()})
        self._save()
        self.start()
        self.nav.setCurrentRow(0)

    def _browse_replay(self):
        path, _ = QFileDialog.getOpenFileName(self, "Choose a recording", self.ed_replay.text(), "Soak CSV (*.csv)")
        if path:
            self.ed_replay.setText(path)
            self.cmb_source.setCurrentIndex([k for k, _ in SOURCES].index("replay"))

    def _hotkeys_changed(self):
        self.cfg["hotkeys"] = {"recenter": self.ed_hk_recenter.text().strip(),
                               "pause": self.ed_hk_pause.text().strip()}
        self._apply_hotkeys()
        self.save_timer.start()

    def _apply_hotkeys(self):
        errors = self.hotkeys.set(self.cfg["hotkeys"])
        if hasattr(self, "hk_error"):
            names = {"recenter": "Recenter", "pause": "Pause output"}
            self.hk_error.setText("\n".join(
                f"{names.get(k, k)}: {pretty_keys(self.cfg['hotkeys'].get(k, ''))} {v}" for k, v in errors.items()))
        hk = self.cfg["hotkeys"]
        parts = [f"Recenter {pretty_keys(hk['recenter'])}" if hk.get("recenter") else "",
                 f"Pause {pretty_keys(hk['pause'])}" if hk.get("pause") else ""]
        if hasattr(self, "keys_hint"):
            self.keys_hint.setText("    ".join(p for p in parts if p))

    def _on_hotkey(self, name):
        if name == "recenter":
            self.recenter()
        elif name == "pause":
            self.btn_pause.toggle()

    def _general_changed(self, *_):
        self.cfg["autostart_tracking"] = self.cb_autostart.isChecked()
        self.cfg["minimize_to_tray"] = self.cb_tray.isChecked()
        self.save_timer.start()

    def _theme_changed(self, *_):
        self.cfg["theme"] = self.cmb_theme.currentData()
        theme.apply(self.app, self.cfg["theme"])
        self.setWindowIcon(app_icon())
        self._last_state = None                  # recolour badge and tray
        self.head.update()
        self._refresh()
        self.save_timer.start()

    def _save(self):
        try:
            cfgmod.save_config(self.cfg)
        except OSError as e:
            self.statusBar().showMessage(f"Could not save settings: {e}", 5000)

    # ================================================================== refresh

    def _show_detail(self, state, detail):
        text, status = STATE_LOOK.get(state, (state.capitalize(), IDLE))
        if state != self._last_state or self.badge.text() != text:
            self.badge.set_state(text, status)
        if self.detail.text() != detail:
            self.detail.setText(detail)
            self.detail.setToolTip(detail)
        if state != self._last_state:
            self._last_state = state
            self.tray.setIcon(app_icon(status if state != "streaming" else OK))
            self.tray.setToolTip(f"AirPodsGyro: {text}")

    def _set_running(self, running):
        if self.btn_start.property("running") != running:
            self.btn_start.setProperty("running", running)
            self.btn_start.setText("Stop tracking" if running else "Start tracking")
            self.btn_start.style().unpolish(self.btn_start)
            self.btn_start.style().polish(self.btn_start)

    def _refresh(self):
        pl = self.pipeline
        running = bool(pl and pl.running)
        self._set_running(running)
        if not pl:
            if self._last_state != "error":
                self._show_detail("stopped", "")
            self.head.set_angles(None, False)
            for t in (self.tile_rate, self.tile_device, self.tile_drift, self.tile_game):
                t.set("")
            self._calib_notice(self.calibration is not None)
            return
        snap = pl.snapshot()
        state = snap["status"] if running or snap["status"] in ("error", "ended") else "stopped"
        detail = "" if state == "streaming" else (snap["error"] or snap["detail"])
        self._show_detail(state, detail)
        streaming = running and state == "streaming"

        self.tile_rate.set(f"{snap['rate_hz']:.0f} Hz" if streaming else "", "100 Hz expected" if streaming else "")
        pid = snap.get("pid") or ""
        place = {"ear": "in ears", "out": "out of ears", "case": "in case"}.get(snap["place"] or "", "")
        name = PID_NAMES.get(pid, f"model {pid}" if pid and pid != "0000" else "")
        self.tile_device.set(name if running else "", place)
        if self.settings.drift and streaming:
            if snap["drift_learned_s"] >= 20:
                self.tile_drift.set(f"{snap['drift_rate_dpm']:+.1f}°/min", "removed while you hold still")
            else:
                self.tile_drift.set("Learning", "keep your head still a moment")
        else:
            self.tile_drift.set("Off" if not self.settings.drift else "", "")
        gname = self.games_out.game_name if self.games_out else ""
        if self.games_out:
            self.tile_game.set(gname or "Waiting", "connected" if gname else "start a TrackIR game")
        else:
            self.tile_game.set("Off", "game output is off")
        self.head.set_angles(snap["angles"], running and not pl.paused)
        self._calib_notice(snap["calibrated"])

    def _calib_notice(self, calibrated):
        visible = not calibrated
        if visible and not self.calib_hint.text():
            self.calib_hint.setText("Not calibrated yet. Calibrate once (about 20 seconds); the head view and "
                                    "game output start after that.")
        if not visible and self.calib_hint.text():
            self.calib_hint.setText("")
        self.calib_notice.setVisible(visible)

    # ================================================================== window

    def _show(self):
        self.showNormal()
        self.raise_()
        self.activateWindow()

    def closeEvent(self, e):
        if self.cfg["minimize_to_tray"] and self.tray.isVisible():
            self.hide()
            if not getattr(self, "_tray_told", False):
                self.tray.showMessage("AirPodsGyro", "Still tracking in the tray. Right-click the icon to quit.",
                                      app_icon(), 3000)
                self._tray_told = True
            e.ignore()
            return
        e.accept()
        self.quit()

    def quit(self):
        self.poll.stop()
        self.stop()
        for out in self.outputs:
            out.close()
        self.outputs = []
        self.hotkeys.clear()
        self._save()
        self.tray.hide()
        QApplication.instance().quit()

    def _about(self):
        QMessageBox.about(self, "About AirPodsGyro", (
            "<b>AirPodsGyro</b>: AirPods head tracking for racing and flight sims.<br><br>"
            "Built on:<ul>"
            "<li>mousepods by starman-tech (Apache-2.0): AirPods protocol research and code</li>"
            "<li>opentrack (ISC): NPClient / FreeTrack client DLLs, TrackIR.exe helper, games list</li>"
            "<li>Qt for Python / PySide6 (LGPL-3.0)</li></ul>"
            "Licence texts are in the licenses folder and next to each source file."))
