"""Custom widgets drawn from the theme tokens: status pill, stat tile, card, live head view, app icon."""

import math

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QColor, QIcon, QPainter, QPainterPath, QPen, QPixmap
from PySide6.QtWidgets import QFrame, QLabel, QSizePolicy, QVBoxLayout, QWidget

from . import theme

# status names -> theme token
OK, WARN, BAD, IDLE = "ok", "warn", "bad", "idle"


def app_icon(state=None):
    """Round icon: head outline with a heading tick, filled with the accent (or a status colour for the tray)."""
    fill = theme.color(state) if state else theme.color("accent")
    ink = theme.color("on_accent") if not state else theme.color("on_status")
    icon = QIcon()
    for size in (16, 24, 32, 48, 64, 128, 256):
        pm = QPixmap(size, size)
        pm.fill(Qt.transparent)
        p = QPainter(pm)
        p.setRenderHint(QPainter.Antialiasing)
        m = size * 0.06
        p.setPen(Qt.NoPen)
        p.setBrush(fill)
        p.drawRoundedRect(QRectF(m, m, size - 2 * m, size - 2 * m), size * 0.24, size * 0.24)
        c = size / 2
        r = size * 0.2
        pen = QPen(ink, max(1.4, size * 0.075))
        pen.setCapStyle(Qt.RoundCap)
        p.setPen(pen)
        p.setBrush(Qt.NoBrush)
        p.drawEllipse(QPointF(c, c + size * 0.05), r, r * 1.15)
        p.drawLine(QPointF(c, c - r * 0.95), QPointF(c, size * 0.17))
        p.end()
        icon.addPixmap(pm)
    return icon


def card(role="card"):
    f = QFrame()
    f.setProperty("role", role)
    return f


def label(text="", role=None, size=None, weight=None, tabular=False, display=False):
    lb = QLabel(text)
    if role:
        lb.setProperty("role", role)
    if size or weight or tabular or display:
        lb.setFont(theme.font("display" if display else "ui", size=size, weight=weight, tabular=tabular))
    return lb


class Badge(QLabel):
    """Status pill: text on the status colour."""

    def __init__(self, text="", parent=None):
        super().__init__(text, parent)
        self.setAlignment(Qt.AlignCenter)
        self.setMinimumWidth(116)
        self.setFont(theme.font("ui", weight=600))
        self.set_state(text, IDLE)

    def set_state(self, text, status):
        t = theme.current()
        self.setText(text)
        self.setStyleSheet(f"QLabel {{ background: {t[status]}; color: {t['on_status']}; border-radius: 11px;"
                           f" padding: 3px 12px; }}")


class StatTile(QFrame):
    """A labelled live value, e.g. 'Data rate  100 Hz'. Shows a dash when there is nothing real to show."""

    def __init__(self, title, parent=None):
        super().__init__(parent)
        self.setProperty("role", "card")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        lay.setSpacing(2)
        self.title = label(title, role="muted", size=theme.SIZE["small"])
        self.value = label("—", role="value", size=theme.SIZE["value"], weight=600, tabular=True)
        self.sub = label("", role="faint", size=theme.SIZE["small"])
        for w in (self.title, self.value, self.sub):
            lay.addWidget(w)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def set(self, value, sub=""):
        value = value or "—"
        if self.value.text() != value:
            self.value.setText(value)
        if self.sub.text() != sub:
            self.sub.setText(sub)


class HeadView(QWidget):
    """Three dials: yaw from above, pitch from the side, roll from the front, with an arc for the angle."""

    LABELS = (("Yaw", "seen from above"), ("Pitch", "seen from the side"), ("Roll", "seen from the front"))

    def __init__(self, parent=None):
        super().__init__(parent)
        self.angles = None
        self.active = False
        self.setMinimumHeight(220)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)

    def set_angles(self, angles, active=True):
        self.angles, self.active = angles, active
        self.update()

    def paintEvent(self, _):
        t = theme.current()
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w = self.width() / 3
        text_h = 52
        r = max(24.0, min(w * 0.37, (self.height() - text_h - 24) / 2))
        yaw, pitch, roll = self.angles or (0.0, 0.0, 0.0)
        live = bool(self.active and self.angles)
        ink = QColor(t["accent"] if live else t["idle"])
        rot = (-yaw, -pitch, roll)       # screen rotation: yaw + = left (CCW from above), pitch + = up
        top = max(12.0, (self.height() - text_h - 2 * r) / 2)
        for i, ((name, sub), a, val) in enumerate(zip(self.LABELS, rot, (yaw, pitch, roll))):
            c = QPointF(w * i + w / 2, top + r)
            # dial face and ticks (every 10 degrees, longer every 30)
            p.setPen(Qt.NoPen)
            p.setBrush(QColor(t["sunken"]))
            p.drawEllipse(c, r, r)
            for deg in range(0, 360, 10):
                ang = math.radians(deg)
                inner = r * (0.86 if deg % 30 == 0 else 0.92)
                p.setPen(QPen(QColor(t["border_strong"] if deg % 30 == 0 else t["border"]), 1.2))
                p.drawLine(QPointF(c.x() + math.sin(ang) * inner, c.y() - math.cos(ang) * inner),
                           QPointF(c.x() + math.sin(ang) * r * 0.97, c.y() - math.cos(ang) * r * 0.97))
            # angle arc from the reference (12 o'clock) to the current angle
            if live and abs(a) > 0.2:
                pen = QPen(ink, max(3.0, r * 0.06))
                pen.setCapStyle(Qt.RoundCap)
                p.setPen(pen)
                box = QRectF(c.x() - r * 0.97, c.y() - r * 0.97, r * 1.94, r * 1.94)
                p.drawArc(box, 90 * 16, int(-max(-359.0, min(359.0, a)) * 16))
            p.save()
            p.translate(c)
            p.rotate(a)
            self._glyph(p, i, r, ink, t)
            p.restore()
            # value and caption
            p.setPen(QColor(t["text"] if live else t["muted"]))
            p.setFont(theme.font("ui", size=12, weight=600, tabular=True))
            text = f"{name}  {val:+.1f}°" if self.angles else f"{name}  —"
            p.drawText(QRectF(w * i, top + 2 * r + 10, w, 22), Qt.AlignCenter, text)
            p.setPen(QColor(t["faint"]))
            p.setFont(theme.font("ui", size=theme.SIZE["small"]))
            p.drawText(QRectF(w * i, top + 2 * r + 32, w, 18), Qt.AlignCenter, sub)
        p.end()

    @staticmethod
    def _glyph(p, kind, r, ink, t):
        p.setPen(QPen(ink, max(2.0, r * 0.035)))
        fill = QColor(ink)
        fill.setAlpha(36)
        p.setBrush(fill)
        if kind == 0:                                     # head from above, nose up
            p.drawEllipse(QPointF(0, 0), r * 0.40, r * 0.48)
            path = QPainterPath(QPointF(-r * 0.11, -r * 0.45))
            path.lineTo(0, -r * 0.64)
            path.lineTo(r * 0.11, -r * 0.45)
            p.drawPath(path)
            p.drawEllipse(QPointF(-r * 0.43, 0), r * 0.07, r * 0.13)
            p.drawEllipse(QPointF(r * 0.43, 0), r * 0.07, r * 0.13)
        elif kind == 1:                                   # head from the side, facing right
            p.drawEllipse(QPointF(0, 0), r * 0.43, r * 0.48)
            path = QPainterPath(QPointF(r * 0.41, -r * 0.08))
            path.lineTo(r * 0.58, r * 0.05)
            path.lineTo(r * 0.41, r * 0.12)
            p.drawPath(path)
            p.setPen(QPen(QColor(t["muted"]), 1.2, Qt.DashLine))
            p.drawLine(QPointF(r * 0.45, 0), QPointF(r * 0.84, 0))
        else:                                             # head from the front
            p.drawEllipse(QPointF(0, 0), r * 0.40, r * 0.50)
            p.drawEllipse(QPointF(-r * 0.45, 0), r * 0.07, r * 0.14)
            p.drawEllipse(QPointF(r * 0.45, 0), r * 0.07, r * 0.14)
            p.setPen(QPen(QColor(t["muted"]), 1.2, Qt.DashLine))
            p.drawLine(QPointF(-r * 0.84, 0), QPointF(-r * 0.56, 0))
            p.drawLine(QPointF(r * 0.56, 0), QPointF(r * 0.84, 0))
