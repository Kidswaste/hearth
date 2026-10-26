"""(round 64, vstembed64) A fake Win32 window layer for tests on a computer without Windows: the same calls
creative-vst-embed.py makes on the real user32 (find the editor window by process, SetParent into Hearth's window,
move, clip with a region, hand back), on an in-memory table of windows. The fake pedalboard's show_editor() opens a
window here when HEARTH_VST_FAKE_WIN32=1. Never used by the app itself.

Each window: {hwnd, pid, title, cls, w, h (client size), x, y (in its parent's client area, or the screen), parent,
child (WS_CHILD set, frame styles off), region (None = all of it shows, () = nothing, (x, y, w, h)), z (0 = on top),
shown (the control values the 'editor' displays), repaints, calls}."""
import threading

_lock = threading.RLock()
_windows = {}
_next = [0x1A00]
LOG = []  # every call, newest last (capped)


def _log(*call):
    LOG.append(call)
    del LOG[:-400]


def create(pid, title='Pedalboard', cls='JUCE_7f3a2c10', w=880, h=560):
    with _lock:
        _next[0] += 4
        hwnd = _next[0]
        _windows[hwnd] = {'hwnd': hwnd, 'pid': pid, 'title': title, 'cls': cls, 'w': w, 'h': h, 'x': 200, 'y': 160, 'parent': 0,
                          'child': False, 'region': None, 'z': 0, 'shown': {}, 'repaints': 0, 'visible': True}
        _log('create', hwnd)
        return hwnd


def destroy(hwnd):
    with _lock:
        _windows.pop(hwnd, None)
        _log('destroy', hwnd)


def alive(hwnd):
    return hwnd in _windows


def show_values(hwnd, values):
    with _lock:
        w = _windows.get(hwnd)
        if w is not None and w['shown'] != values:
            w['shown'] = dict(values)
            w['repaints'] += 1


def snapshot():
    with _lock:
        return {h: {k: (dict(v) if isinstance(v, dict) else v) for k, v in w.items()} for h, w in _windows.items()}


def resize(hwnd, w, h):
    """The plugin resizing its own window (e.g. Serum 2's zoom menu); JUCE also moves it where it thinks it is."""
    with _lock:
        win = _windows[hwnd]
        win['w'], win['h'], win['x'], win['y'] = w, h, 300, 240


class Backend:
    """The interface creative-vst-embed.Embedder uses (the real one is embedding.Win32)."""

    def windows(self, pid):
        with _lock:
            return [{'hwnd': w['hwnd'], 'title': w['title'], 'cls': w['cls']} for w in _windows.values()
                    if w['pid'] == pid and w['visible'] and not w['parent']]

    def alive(self, h):
        return h in _windows

    def client_size(self, h):
        with _lock:
            w = _windows[h]
            return w['w'], w['h']

    def position(self, h):
        with _lock:
            w = _windows[h]
            return w['x'], w['y']

    def adopt(self, h, parent):
        with _lock:
            w = _windows[h]
            if not parent or int(parent) == 13 or w['cls'] == 'JUCE_refuse':  # a test's window / editor that refuses
                raise OSError('SetParent failed (Windows error 1400)')
            w['parent'], w['child'] = int(parent), True
            _log('adopt', h, int(parent))
            return w['w'], w['h']

    def release(self, h, screen_xy=None, hidden=False):
        with _lock:
            w = _windows.get(h)
            if w is None:
                return
            w['parent'], w['child'], w['region'] = 0, False, None
            if hidden:  # (vstfix70) handed back hidden, right before the editor closes
                w['visible'] = False
            if screen_xy:
                w['x'], w['y'] = screen_xy
            _log('release-hidden' if hidden else 'release', h)

    def to_screen(self, parent, x, y):
        return x + 50, y + 80  # Hearth's client area at (50, 80) on the fake screen

    def place(self, h, x, y):
        with _lock:
            w = _windows[h]
            w['x'], w['y'], w['z'] = int(x), int(y), 0
            _log('place', h, int(x), int(y))

    def clip(self, h, region):
        with _lock:
            _windows[h]['region'] = None if region is None else tuple(region)
            _log('clip', h, region)

    def redraw(self, h):
        with _lock:
            if h in _windows:
                _windows[h]['repaints'] += 1

    def debug(self, h):
        """What a test can see through the host's live-status: the editor window (a few of the values it shows)."""
        with _lock:
            w = _windows.get(h)
            if w is None:
                return None
            return {**{k: v for k, v in w.items() if k != 'shown'}, 'shown': dict(list(w['shown'].items())[:400]),
                    'calls': len([c for c in LOG if len(c) > 1 and c[1] == h])}
