"""Visual system: tokens (colours, fonts, sizes), a Qt palette and one app-wide style sheet built from them.

Every colour and font in the GUI comes from here: widgets read TOKENS via current(), the style sheet is
generated from the same dict. Two schemes (graphite dark, paper light), following Windows by default.
"""

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFont, QPalette

SCHEMES = {
    "dark": {
        "bg": "#111317", "surface": "#181b21", "raised": "#1f232b", "sunken": "#0d0f12",
        "border": "#2a2f38", "border_strong": "#3a404b",
        "text": "#e8eaee", "muted": "#9aa1ad", "faint": "#6b7280",
        "accent": "#f2a33a", "accent_hover": "#f7b65c", "accent_pressed": "#d98b22", "on_accent": "#14110b",
        "accent_soft": "#3a2a12",
        "ok": "#35b36f", "warn": "#e0a400", "bad": "#e5534b", "idle": "#59606b", "on_status": "#ffffff",
        "focus": "#f2a33a", "selection": "#3a2a12",
    },
    "light": {
        "bg": "#f3f4f6", "surface": "#ffffff", "raised": "#f8f9fb", "sunken": "#eceef1",
        "border": "#dde0e5", "border_strong": "#c4c9d1",
        "text": "#15171b", "muted": "#5b616c", "faint": "#8a909a",
        "accent": "#c46f00", "accent_hover": "#d67f0c", "accent_pressed": "#a85f00", "on_accent": "#ffffff",
        "accent_soft": "#fbecd7",
        "ok": "#1f8f52", "warn": "#a87a00", "bad": "#c93a33", "idle": "#7a808a", "on_status": "#ffffff",
        "focus": "#c46f00", "selection": "#fbecd7",
    },
}

FONTS = {
    "ui": ["Segoe UI Variable Text", "Segoe UI", "Inter", "Helvetica Neue", "Arial"],
    "display": ["Segoe UI Variable Display", "Segoe UI Semibold", "Segoe UI", "Arial"],
}
SIZE = {"base": 10, "small": 9, "title": 15, "value": 18, "radius": 8, "radius_small": 6}

_current = {"scheme": "dark", "tokens": SCHEMES["dark"]}


def current():
    return _current["tokens"]


def scheme():
    return _current["scheme"]


def color(name):
    return QColor(current()[name])


def font(role="ui", size=None, weight=None, tabular=False):
    f = QFont()
    f.setFamilies(FONTS[role])
    f.setPointSizeF(size or SIZE["base"])
    if weight:
        f.setWeight(QFont.Weight(weight))
    if tabular:
        try:                                    # Qt >= 6.7: tabular figures so live numbers do not jitter
            f.setFeature(QFont.Tag("tnum"), 1)
        except (AttributeError, TypeError):
            pass
    return f


def resolve(choice, app):
    """'system' | 'dark' | 'light' -> 'dark' | 'light'."""
    if choice in SCHEMES:
        return choice
    try:
        return "light" if app.styleHints().colorScheme() == Qt.ColorScheme.Light else "dark"
    except AttributeError:
        return "dark"


def apply(app, choice="system"):
    name = resolve(choice, app)
    t = SCHEMES[name]
    _current.update(scheme=name, tokens=t)
    app.setStyle("Fusion")                      # predictable base for the style sheet on every Windows build
    app.setFont(font("ui"))
    pal = QPalette()
    roles = {
        QPalette.Window: "bg", QPalette.WindowText: "text", QPalette.Base: "sunken",
        QPalette.AlternateBase: "raised", QPalette.Text: "text", QPalette.Button: "raised",
        QPalette.ButtonText: "text", QPalette.Highlight: "accent", QPalette.HighlightedText: "on_accent",
        QPalette.ToolTipBase: "raised", QPalette.ToolTipText: "text", QPalette.PlaceholderText: "faint",
        QPalette.Mid: "border_strong", QPalette.Midlight: "border", QPalette.Dark: "sunken",
        QPalette.Link: "accent",
    }
    for role, key in roles.items():
        pal.setColor(role, QColor(t[key]))
    pal.setColor(QPalette.Disabled, QPalette.Text, QColor(t["faint"]))
    pal.setColor(QPalette.Disabled, QPalette.WindowText, QColor(t["faint"]))
    pal.setColor(QPalette.Disabled, QPalette.ButtonText, QColor(t["faint"]))
    app.setPalette(pal)
    app.setStyleSheet(stylesheet(t))
    return name


def stylesheet(t):
    r, rs = SIZE["radius"], SIZE["radius_small"]
    return f"""
QWidget {{ color: {t['text']}; }}
QMainWindow, QDialog {{ background: {t['bg']}; }}
QToolTip {{ background: {t['raised']}; color: {t['text']}; border: 1px solid {t['border_strong']};
            padding: 6px 8px; border-radius: {rs}px; }}

/* surfaces */
QFrame[role="header"] {{ background: {t['surface']}; border-bottom: 1px solid {t['border']}; }}
QFrame[role="card"] {{ background: {t['surface']}; border: 1px solid {t['border']}; border-radius: {r}px; }}
QFrame[role="notice"] {{ background: {t['accent_soft']}; border: 1px solid {t['accent']}; border-radius: {r}px; }}
QLabel[role="title"] {{ color: {t['text']}; }}
QLabel[role="muted"] {{ color: {t['muted']}; }}
QLabel[role="faint"] {{ color: {t['faint']}; }}
QLabel[role="error"] {{ color: {t['bad']}; }}
QLabel[role="value"] {{ color: {t['text']}; }}

/* navigation */
QListWidget[role="nav"] {{ background: {t['bg']}; border: none; border-right: 1px solid {t['border']};
                          padding: 10px 8px; outline: 0; }}
QListWidget[role="nav"]::item {{ padding: 0 12px; margin: 1px 0; border-radius: {rs}px; color: {t['muted']}; }}
QListWidget[role="nav"]::item:hover {{ background: {t['raised']}; color: {t['text']}; }}
QListWidget[role="nav"]::item:selected {{ background: {t['accent_soft']}; color: {t['text']}; }}
QListWidget[role="nav"]::item:selected:focus {{ border: 1px solid {t['focus']}; }}

/* buttons */
QPushButton {{ background: {t['raised']}; color: {t['text']}; border: 1px solid {t['border_strong']};
              border-radius: {rs}px; padding: 7px 14px; min-height: 18px; }}
QPushButton:hover {{ border-color: {t['muted']}; }}
QPushButton:pressed {{ background: {t['sunken']}; }}
QPushButton:checked {{ background: {t['accent_soft']}; border-color: {t['accent']}; }}
QPushButton:disabled {{ color: {t['faint']}; border-color: {t['border']}; }}
QPushButton:focus {{ border: 1px solid {t['focus']}; }}
QPushButton[role="primary"] {{ background: {t['accent']}; color: {t['on_accent']}; border: 1px solid {t['accent']};
                              font-weight: 600; padding: 8px 18px; }}
QPushButton[role="primary"]:hover {{ background: {t['accent_hover']}; border-color: {t['accent_hover']}; }}
QPushButton[role="primary"]:pressed {{ background: {t['accent_pressed']}; }}
QPushButton[role="primary"]:focus {{ border: 2px solid {t['text']}; }}
QPushButton[role="primary"][running="true"] {{ background: {t['raised']}; color: {t['text']};
                                               border: 1px solid {t['border_strong']}; font-weight: 600; }}
QPushButton[role="primary"][running="true"]:hover {{ border-color: {t['bad']}; color: {t['bad']}; }}
QPushButton[role="primary"][running="true"]:focus {{ border: 1px solid {t['focus']}; }}

/* inputs */
QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox {{ background: {t['sunken']}; color: {t['text']};
    border: 1px solid {t['border_strong']}; border-radius: {rs}px; padding: 5px 8px; min-height: 20px;
    selection-background-color: {t['selection']}; selection-color: {t['text']}; }}
QLineEdit:hover, QSpinBox:hover, QDoubleSpinBox:hover, QComboBox:hover {{ border-color: {t['muted']}; }}
QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, QComboBox:focus {{ border: 1px solid {t['focus']}; }}
QLineEdit:disabled, QSpinBox:disabled, QDoubleSpinBox:disabled, QComboBox:disabled {{ color: {t['faint']}; }}
QSpinBox::up-button, QDoubleSpinBox::up-button, QSpinBox::down-button, QDoubleSpinBox::down-button {{
    width: 18px; border: none; background: transparent; }}
QComboBox::drop-down {{ border: none; width: 22px; }}
QComboBox QAbstractItemView {{ background: {t['raised']}; color: {t['text']}; border: 1px solid {t['border_strong']};
    selection-background-color: {t['accent_soft']}; selection-color: {t['text']}; outline: 0; padding: 4px; }}

QCheckBox {{ spacing: 8px; }}
QCheckBox::indicator {{ width: 16px; height: 16px; border-radius: 4px; border: 1px solid {t['border_strong']};
                       background: {t['sunken']}; }}
QCheckBox::indicator:hover {{ border-color: {t['muted']}; }}
QCheckBox::indicator:checked {{ background: {t['accent']}; border-color: {t['accent']}; }}
QCheckBox::indicator:disabled {{ background: {t['raised']}; border-color: {t['border']}; }}
QCheckBox::indicator:focus {{ border: 1px solid {t['focus']}; }}
QCheckBox::indicator:checked:focus {{ border: 2px solid {t['text']}; }}

QProgressBar {{ background: {t['border']}; border: none; border-radius: 3px; max-height: 6px; }}
QProgressBar::chunk {{ background: {t['accent']}; border-radius: 3px; }}

QMenuBar {{ background: {t['surface']}; color: {t['muted']}; }}
QMenuBar::item:selected {{ background: {t['raised']}; color: {t['text']}; }}
QMenu {{ background: {t['raised']}; color: {t['text']}; border: 1px solid {t['border_strong']}; padding: 4px; }}
QMenu::item {{ padding: 6px 18px; border-radius: 4px; }}
QMenu::item:selected {{ background: {t['accent_soft']}; }}
QMenu::separator {{ height: 1px; background: {t['border']}; margin: 4px 6px; }}

QScrollArea {{ background: transparent; border: none; }}
QScrollArea > QWidget > QWidget {{ background: transparent; }}
QScrollBar:vertical {{ background: transparent; width: 10px; margin: 2px; }}
QScrollBar::handle:vertical {{ background: {t['border_strong']}; border-radius: 4px; min-height: 30px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
QStatusBar {{ background: {t['surface']}; color: {t['muted']}; }}
"""
