"""Main window: live status + head view, controls, settings tabs, tray icon, global hotkeys."""

import copy
import os
import sys

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QDoubleSpinBox, QFileDialog, QFormLayout,
                               QGridLayout, QGroupBox, QHBoxLayout, QLabel, QLineEdit, QMainWindow, QMenu,
                               QMessageBox, QPushButton, QSizePolicy, QSpinBox, QSystemTrayIcon, QTabWidget,
                               QVBoxLayout, QWidget)

from core.pipeline import AXES, Pipeline, Settings
from core.transport import make_transport
from outputs.udp import UdpOutput

from . import config as cfgmod
from .calibration import CalibrationWizard
from .hotkeys import GlobalHotkeys
from .widgets import BAD, IDLE, OK, WARN, Badge, HeadView, app_icon

SOURCES = (("windriver", "AirPods (Windows Bluetooth driver)"),
           ("bluez", "AirPods (Linux / BlueZ)"),
           ("replay", "Recording (replay a soak.csv)"))
STATE_LOOK = {"streaming": ("Streaming", OK), "connecting": ("Connecting", WARN), "stalled": ("Stalled", WARN),
              "reconnecting": ("Reconnecting", BAD), "error": ("Error", BAD), "ended": ("Recording ended", IDLE),
              "stopped": ("Stopped", IDLE), "idle": ("Stopped", IDLE)}
PID_NAMES = {"2027": "AirPods Pro 3", "2024": "AirPods Pro 2 (USB-C)", "2014": "AirPods Pro 2",
             "200e": "AirPods Pro", "2013": "AirPods 3"}


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
        self.resize(720, 640)

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
        quit_act = QAction("&Quit", self, shortcut=QKeySequence.Quit, triggered=self.quit)
        m.addAction(quit_act)
        h = self.menuBar().addMenu("&Help")
        h.addAction(QAction("&About and licences", self, triggered=self._about))

    def _build_ui(self):
        root = QWidget()
        lay = QVBoxLayout(root)

        top = QHBoxLayout()
        self.badge = Badge("Stopped")
        top.addWidget(self.badge)
        self.detail = QLabel()
        self.detail.setWordWrap(True)
        self.detail.setTextInteractionFlags(Qt.TextSelectableByMouse)
        top.addWidget(self.detail, 1)
        lay.addLayout(top)

        facts = QHBoxLayout()
        self.lbl_rate, self.lbl_device, self.lbl_drift, self.lbl_game = (QLabel() for _ in range(4))
        for w in (self.lbl_rate, self.lbl_device, self.lbl_drift, self.lbl_game):
            facts.addWidget(w)
            facts.addSpacing(14)
        facts.addStretch(1)
        lay.addLayout(facts)

        self.head = HeadView()
        lay.addWidget(self.head, 1)

        btns = QHBoxLayout()
        self.btn_start = QPushButton("Start tracking", clicked=self.toggle_tracking)
        self.btn_recenter = QPushButton("Recenter", clicked=self.recenter)
        self.btn_pause = QPushButton("Pause output", checkable=True, toggled=self.set_paused)
        self.btn_calib = QPushButton("Calibrate…", clicked=self.calibrate)
        for b in (self.btn_start, self.btn_recenter, self.btn_pause, self.btn_calib):
            btns.addWidget(b)
        btns.addStretch(1)
        lay.addLayout(btns)
        self.calib_hint = QLabel()
        self.calib_hint.setWordWrap(True)
        lay.addWidget(self.calib_hint)

        tabs = QTabWidget()
        tabs.addTab(self._tab_tracking(), "Tracking")
        tabs.addTab(self._tab_axes(), "Axes")
        tabs.addTab(self._tab_output(), "Games && output")
        tabs.addTab(self._tab_source(), "Source")
        tabs.addTab(self._tab_general(), "Hotkeys && app")
        tabs.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Maximum)
        lay.addWidget(tabs)
        self.setCentralWidget(root)

    def _spin(self, lo, hi, step, val, dec=2, suffix=""):
        s = QDoubleSpinBox()
        s.setRange(lo, hi)
        s.setSingleStep(step)
        s.setDecimals(dec)
        s.setValue(val)
        s.setSuffix(suffix)
        s.valueChanged.connect(self._settings_changed)
        return s

    def _tab_tracking(self):
        w = QWidget()
        f = QFormLayout(w)
        st = self.settings
        self.sp_cutoff = self._spin(0.1, 10.0, 0.1, st.mincutoff, suffix=" Hz")
        self.sp_cutoff.setToolTip("Lower = steadier view when your head is still (adds a little lag).")
        self.sp_beta = self._spin(0.0, 1.0, 0.01, st.beta, dec=3)
        self.sp_beta.setToolTip("Higher = less lag on fast head turns.")
        self.cb_drift = QCheckBox("Correct slow yaw drift (recommended)")
        self.cb_drift.setChecked(st.drift)
        self.cb_drift.setToolTip("The AirPods' heading slowly turns by itself (about 1-4°/min). This removes it\n"
                                 "while your head is still, at most 6°/min, so real head turns are untouched.")
        self.cb_drift.toggled.connect(self._settings_changed)
        f.addRow("Smoothing at rest", self.sp_cutoff)
        f.addRow("Speed response", self.sp_beta)
        f.addRow(self.cb_drift)
        return w

    def _tab_axes(self):
        w = QWidget()
        g = QGridLayout(w)
        for c, h in enumerate(("", "Gain", "Deadzone", "Limit", "Invert")):
            g.addWidget(QLabel(f"<b>{h}</b>"), 0, c)
        self.axis_widgets = {}
        for r, a in enumerate(AXES, start=1):
            ax = self.settings.axes[a]
            gain = self._spin(0.1, 10.0, 0.1, ax.gain, suffix="×")
            dz = self._spin(0.0, 20.0, 0.5, ax.deadzone, dec=1, suffix="°")
            lim = self._spin(5.0, 180.0, 5.0, ax.limit, dec=0, suffix="°")
            inv = QCheckBox()
            inv.setChecked(ax.invert)
            inv.toggled.connect(self._settings_changed)
            g.addWidget(QLabel(a.capitalize()), r, 0)
            for c, wd in enumerate((gain, dz, lim, inv), start=1):
                g.addWidget(wd, r, c)
            self.axis_widgets[a] = (gain, dz, lim, inv)
        hint = QLabel("Gain 2× means turning your head 45° turns the in-game view 90°, so you can still see "
                      "the screen while looking around.")
        hint.setWordWrap(True)
        g.addWidget(hint, len(AXES) + 1, 0, 1, 5)
        g.setRowStretch(len(AXES) + 2, 1)
        return w

    def _tab_output(self):
        w = QWidget()
        lay = QVBoxLayout(w)
        o = self.cfg["outputs"]
        games = QGroupBox("Games: built-in TrackIR / FreeTrack (no OpenTrack needed)")
        gf = QFormLayout(games)
        self.cb_games = QCheckBox("Send head tracking to games")
        self.cb_games.setChecked(o["games"])
        self.cb_games.setEnabled(sys.platform == "win32")
        self.cb_dummy = QCheckBox("Run the TrackIR.exe helper (some games look for it)")
        self.cb_dummy.setChecked(o["dummy_trackir"])
        self.cb_roll = QCheckBox("Flip roll for games")
        self.cb_roll.setChecked(o["roll_sign"] == 1)
        for cb in (self.cb_games, self.cb_dummy, self.cb_roll):
            cb.toggled.connect(self._outputs_changed)
            gf.addRow(cb)
        works = QLabel("Works with TrackIR games such as iRacing, MSFS 2020/2024, DCS, Assetto Corsa "
                       "Competizione, Euro Truck Simulator. Enable TrackIR in the game's settings.")
        works.setWordWrap(True)
        gf.addRow(works)
        udp = QGroupBox("OpenTrack (FreePIE UDP receiver), optional")
        uf = QFormLayout(udp)
        self.cb_udp = QCheckBox("Send to OpenTrack")
        self.cb_udp.setChecked(o["udp"])
        self.ed_host = QLineEdit(o["udp_host"])
        self.sp_port = QSpinBox()
        self.sp_port.setRange(1, 65535)
        self.sp_port.setValue(o["udp_port"])
        self.cb_udp.toggled.connect(self._outputs_changed)
        self.ed_host.editingFinished.connect(self._outputs_changed)
        self.sp_port.valueChanged.connect(self._outputs_changed)
        uf.addRow(self.cb_udp)
        uf.addRow("Host", self.ed_host)
        uf.addRow("Port", self.sp_port)
        self.out_error = QLabel()
        self.out_error.setWordWrap(True)
        self.out_error.setStyleSheet("color: #cf222e")
        lay.addWidget(games)
        lay.addWidget(udp)
        lay.addWidget(self.out_error)
        lay.addStretch(1)
        return w

    def _tab_source(self):
        w = QWidget()
        f = QFormLayout(w)
        s = self.cfg["source"]
        self.cmb_source = QComboBox()
        for key, label in SOURCES:
            self.cmb_source.addItem(label, key)
        self.cmb_source.setCurrentIndex(max(0, [k for k, _ in SOURCES].index(s["kind"])))
        self.ed_addr = QLineEdit(s["addr"])
        self.ed_addr.setPlaceholderText("auto, or AA:BB:CC:DD:EE:FF")
        self.ed_replay = QLineEdit(s["replay_path"])
        browse = QPushButton("Browse…", clicked=self._browse_replay)
        row = QHBoxLayout()
        row.addWidget(self.ed_replay, 1)
        row.addWidget(browse)
        self.cb_loop = QCheckBox("Loop the recording")
        self.cb_loop.setChecked(s["replay_loop"])
        apply_btn = QPushButton("Apply and restart tracking", clicked=self._source_changed)
        f.addRow("Source", self.cmb_source)
        f.addRow("AirPods address", self.ed_addr)
        f.addRow("Recording", row)
        f.addRow(self.cb_loop)
        f.addRow(apply_btn)
        note = QLabel("The Windows driver (driver\\install.ps1, needs test-signing mode) lets the AirPods stream "
                      "head tracking while still playing audio. Put both AirPods in before starting.")
        note.setWordWrap(True)
        f.addRow(note)
        return w

    def _tab_general(self):
        w = QWidget()
        f = QFormLayout(w)
        hk = self.cfg["hotkeys"]
        self.ed_hk_recenter = QLineEdit(hk["recenter"])
        self.ed_hk_pause = QLineEdit(hk["pause"])
        for e in (self.ed_hk_recenter, self.ed_hk_pause):
            e.setPlaceholderText("e.g. ctrl+alt+r, f9, ctrl+shift+home")
            e.editingFinished.connect(self._hotkeys_changed)
        self.hk_error = QLabel()
        self.hk_error.setStyleSheet("color: #cf222e")
        self.cb_autostart = QCheckBox("Start tracking when the app opens")
        self.cb_autostart.setChecked(self.cfg["autostart_tracking"])
        self.cb_tray = QCheckBox("Closing the window keeps it running in the tray")
        self.cb_tray.setChecked(self.cfg["minimize_to_tray"])
        for cb in (self.cb_autostart, self.cb_tray):
            cb.toggled.connect(self._general_changed)
        f.addRow("Recenter (works in-game)", self.ed_hk_recenter)
        f.addRow("Pause output (works in-game)", self.ed_hk_pause)
        f.addRow(self.hk_error)
        f.addRow(self.cb_autostart)
        f.addRow(self.cb_tray)
        where = QLabel(f"Settings are stored in {cfgmod.config_dir()}")
        where.setWordWrap(True)
        where.setTextInteractionFlags(Qt.TextSelectableByMouse)
        f.addRow(where)
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
                raise FileNotFoundError("choose a recording (soak.csv) in the Source tab")
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
            self.hk_error.setText("\n".join(f"{k}: {v}" for k, v in errors.items()))

    def _on_hotkey(self, name):
        if name == "recenter":
            self.recenter()
        elif name == "pause":
            self.btn_pause.toggle()

    def _general_changed(self, *_):
        self.cfg["autostart_tracking"] = self.cb_autostart.isChecked()
        self.cfg["minimize_to_tray"] = self.cb_tray.isChecked()
        self.save_timer.start()

    def _save(self):
        try:
            cfgmod.save_config(self.cfg)
        except OSError as e:
            self.statusBar().showMessage(f"Could not save settings: {e}", 5000)

    # ================================================================== refresh

    def _show_detail(self, state, detail):
        text, color = STATE_LOOK.get(state, (state.capitalize(), IDLE))
        self.badge.set_state(text, color)
        self.detail.setText(detail)
        if state != self._last_state:
            self._last_state = state
            self.tray.setIcon(app_icon(color if state != "streaming" else OK))
            self.tray.setToolTip(f"AirPodsGyro: {text}")

    def _refresh(self):
        pl = self.pipeline
        running = bool(pl and pl.running)
        self.btn_start.setText("Stop tracking" if running else "Start tracking")
        if not pl:
            if self._last_state != "error":
                self._show_detail("stopped", "")
            self.head.set_angles(None, False)
            return
        snap = pl.snapshot()
        state = snap["status"] if running or snap["status"] in ("error", "ended") else "stopped"
        detail = snap["error"] or snap["detail"]
        if state == "streaming":
            detail = ""
        self._show_detail(state, detail)
        self.lbl_rate.setText(f"<b>{snap['rate_hz']:.0f}</b> Hz" if running and state == "streaming" else "— Hz")
        pid = snap.get("pid") or ""
        place = {"ear": "in ears", "out": "out of ears", "case": "in case"}.get(snap["place"] or "", "")
        self.lbl_device.setText(" · ".join(x for x in (PID_NAMES.get(pid, f"model {pid}" if pid and pid != "0000" else ""),
                                                        place) if x))
        if self.settings.drift and state == "streaming":
            learned = snap["drift_learned_s"] >= 20
            self.lbl_drift.setText(f"drift {snap['drift_rate_dpm']:+.1f}°/min corrected" if learned
                                   else "drift: learning (keep still a moment)")
        else:
            self.lbl_drift.setText("")
        gname = self.games_out.game_name if self.games_out else ""
        self.lbl_game.setText(f"Game: <b>{gname}</b>" if gname else "")
        self.head.set_angles(snap["angles"], running and not pl.paused)
        if not snap["calibrated"]:
            self.calib_hint.setText("<b>Not calibrated yet.</b> Press Calibrate… once (it takes 20 seconds); "
                                    "the head view and game output start after that.")
        else:
            self.calib_hint.setText("")

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
            "Licence texts are in the vendor folder and next to each source file."))
