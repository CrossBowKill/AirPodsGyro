"""Calibration wizard: three held poses -> head frame (core.calibrate)."""

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QDialog, QDialogButtonBox, QHBoxLayout, QLabel, QProgressBar, QPushButton,
                               QVBoxLayout)

from core import calibrate

SETTLE_MS = 300      # ignore the moment the button is pressed
HOLD_MS = 800        # then average this long


class CalibrationWizard(QDialog):
    def __init__(self, pipeline, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Calibrate head tracking")
        self.setMinimumWidth(460)
        self.pipeline = pipeline
        self.poses = {}
        self.step = 0
        self.result = None

        self.title = QLabel()
        self.title.setStyleSheet("font-size: 15pt; font-weight: 600;")
        self.text = QLabel()
        self.text.setWordWrap(True)
        self.feedback = QLabel()
        self.feedback.setWordWrap(True)
        self.progress = QProgressBar()
        self.progress.setRange(0, len(calibrate.POSES))
        self.progress.setTextVisible(False)
        self.capture_btn = QPushButton("Hold it - capture")
        self.capture_btn.setDefault(True)
        self.capture_btn.clicked.connect(self.capture)
        buttons = QDialogButtonBox(QDialogButtonBox.Cancel)
        buttons.rejected.connect(self.reject)
        row = QHBoxLayout()
        row.addWidget(self.capture_btn)
        row.addStretch(1)
        row.addWidget(buttons)

        lay = QVBoxLayout(self)
        intro = QLabel("Sit as you do when playing, both AirPods in. Hold each pose still, then press "
                       "the button (or Enter). Recalibrate if you take an AirPod out and back in.")
        intro.setWordWrap(True)
        lay.addWidget(intro)
        lay.addSpacing(8)
        lay.addWidget(self.title)
        lay.addWidget(self.text)
        lay.addWidget(self.progress)
        lay.addWidget(self.feedback)
        lay.addStretch(1)
        lay.addLayout(row)
        self._show_step()

    def _show_step(self):
        key, text = calibrate.POSES[self.step]
        self.title.setText(f"Step {self.step + 1} of {len(calibrate.POSES)}")
        self.text.setText(text + ".")
        self.progress.setValue(self.step)

    def capture(self):
        if not self.pipeline.running or self.pipeline.status not in ("streaming", "stalled"):
            self.feedback.setText("No data from the AirPods yet. Start tracking first and wait until it "
                                  "shows Streaming.")
            return
        self.capture_btn.setEnabled(False)
        self.feedback.setText("Hold still…")
        QTimer.singleShot(SETTLE_MS, self.pipeline.begin_capture)
        QTimer.singleShot(SETTLE_MS + HOLD_MS, self._finish_capture)

    def _finish_capture(self):
        self.capture_btn.setEnabled(True)
        key, _ = calibrate.POSES[self.step]
        try:
            self.poses[key] = calibrate.pose_from_window(self.pipeline.end_capture())
        except calibrate.PoseError as e:
            self.feedback.setText(f"<span style='color:#cf222e'>{e}. Try again.</span>")
            return
        self.feedback.setText("")
        self.step += 1
        if self.step < len(calibrate.POSES):
            self._show_step()
            return
        try:
            self.result = calibrate.solve(self.poses, self.pipeline.session.pid if self.pipeline.session else "0000")
        except ValueError as e:
            self.feedback.setText(f"<span style='color:#cf222e'>Calibration failed: {e}.</span> "
                                  "Starting again from step 1.")
            self.poses, self.step = {}, 0
            self._show_step()
            return
        self.progress.setValue(len(calibrate.POSES))
        q = self.result["quality"]
        self.title.setText("Done")
        self.text.setText(f"Look-down {q['down_deg']}°, turn-left {q.get('left_yaw_deg', '?')}°. "
                          "Look at your screen and press Recenter whenever the view is off.")
        self.capture_btn.setText("Finish")
        self.capture_btn.clicked.disconnect()
        self.capture_btn.clicked.connect(self.accept)

    def keyPressEvent(self, e):
        if e.key() in (Qt.Key_Return, Qt.Key_Enter) and self.capture_btn.isEnabled():
            self.capture_btn.click()
            return
        super().keyPressEvent(e)
