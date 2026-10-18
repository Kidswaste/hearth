"""(round 64, vstembed64) Serum 2 / Vital's own editor window inside Hearth's window (docs/upgrades/vstembed64.md).

Pedalboard's show_editor() opens a JUCE window titled "Pedalboard" and runs its message loop on the host's main thread
(audio keeps running on the worker + PortAudio threads). This module finds that window and puts it in Hearth:
- Windows: the window becomes a WS_CHILD of Hearth's BrowserWindow (SetParent; title bar and frame styles removed),
  is moved to the Sound desk's placeholder (client coordinates in physical pixels, sent by Hearth on layout changes),
  clipped to the part of the placeholder that is on screen (SetWindowRgn; an empty region hides it without closing it:
  pedalboard's loop ends when JUCE thinks the window is hidden), kept on top of Chromium's own child window, and put
  back where it belongs when the plugin resizes or moves it (a watcher, 6× a second).
- macOS (best effort, only when pyobjc's AppKit is installed in the audio runtime): a different process's window can't
  be a child of Hearth's window, so the editor is made borderless and kept aligned over the placeholder, ordered just
  above Hearth's window (its CGWindowID). Without pyobjc the editor stays a floating window (said in one line).
- Anywhere else, or when anything fails: the floating window, with one plain line saying why.
The backend is chosen once: the real Win32 layer, a fake one for tests (HEARTH_VST_FAKE_WIN32=1 with
dev/fixtures/fake-vst-py/fakewin32.py on PYTHONPATH), the Mac layer, or none.
"""
import os
import sys
import threading
import time

TITLE = 'Pedalboard'  # pedalboard's StandalonePluginWindow title (ExternalPlugin.h)


class Win32:
    """The few user32 / gdi32 calls the embedder needs (ctypes, no package)."""

    def __init__(self):
        import ctypes
        from ctypes import wintypes
        self.c, self.w = ctypes, wintypes
        u, g = ctypes.WinDLL('user32', use_last_error=True), ctypes.WinDLL('gdi32')
        self.u, self.g = u, g
        H = wintypes.HWND
        LONG_PTR = ctypes.c_ssize_t
        self.ENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, H, wintypes.LPARAM)
        u.EnumWindows.argtypes = [self.ENUM, wintypes.LPARAM]
        u.GetWindowThreadProcessId.argtypes = [H, ctypes.POINTER(wintypes.DWORD)]
        u.GetWindowThreadProcessId.restype = wintypes.DWORD
        for name in ('IsWindowVisible', 'IsWindow'):
            getattr(u, name).argtypes = [H]
        u.GetWindowTextW.argtypes = [H, wintypes.LPWSTR, ctypes.c_int]
        u.GetClassNameW.argtypes = [H, wintypes.LPWSTR, ctypes.c_int]
        u.GetClientRect.argtypes = [H, ctypes.POINTER(wintypes.RECT)]
        u.GetWindowRect.argtypes = [H, ctypes.POINTER(wintypes.RECT)]
        u.GetWindowLongPtrW.argtypes = [H, ctypes.c_int]
        u.GetWindowLongPtrW.restype = LONG_PTR
        u.SetWindowLongPtrW.argtypes = [H, ctypes.c_int, LONG_PTR]
        u.SetWindowLongPtrW.restype = LONG_PTR
        u.SetParent.argtypes = [H, H]
        u.SetParent.restype = H
        u.GetParent.argtypes = [H]
        u.GetParent.restype = H
        u.SetWindowPos.argtypes = [H, H, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
        u.SetWindowRgn.argtypes = [H, wintypes.HANDLE, wintypes.BOOL]
        u.RedrawWindow.argtypes = [H, ctypes.c_void_p, wintypes.HANDLE, wintypes.UINT]
        u.MapWindowPoints.argtypes = [H, H, ctypes.POINTER(wintypes.POINT), wintypes.UINT]
        g.CreateRectRgn.argtypes = [ctypes.c_int] * 4
        g.CreateRectRgn.restype = wintypes.HANDLE
        self.GWL_STYLE, self.GWL_EXSTYLE = -16, -20
        self.WS_CHILD, self.WS_POPUP, self.WS_CLIPSIBLINGS = 0x40000000, 0x80000000, 0x04000000
        self.FRAME = 0x00C00000 | 0x00040000 | 0x00080000 | 0x00020000 | 0x00010000  # caption, thickframe, sysmenu, min/max box
        self.EX_FRAME = 0x00040000 | 0x00000008 | 0x00000100 | 0x00000200  # appwindow, topmost, windowedge, clientedge
        self.saved = {}

    def hwnd(self, h):
        return self.w.HWND(h)

    def windows(self, pid):
        found = []

        def each(h, _):
            owner = self.w.DWORD()
            self.u.GetWindowThreadProcessId(h, self.c.byref(owner))
            if owner.value == pid and self.u.IsWindowVisible(h):
                title, cls = self.c.create_unicode_buffer(128), self.c.create_unicode_buffer(128)
                self.u.GetWindowTextW(h, title, 128)
                self.u.GetClassNameW(h, cls, 128)
                found.append({'hwnd': int(h or 0), 'title': title.value, 'cls': cls.value})
            return True
        self.u.EnumWindows(self.ENUM(each), 0)
        return found

    def alive(self, h):
        return bool(self.u.IsWindow(self.hwnd(h)))

    def client_size(self, h):
        r = self.w.RECT()
        self.u.GetClientRect(self.hwnd(h), self.c.byref(r))
        return r.right - r.left, r.bottom - r.top

    def position(self, h):
        """The window's top-left in its parent's client coordinates."""
        r = self.w.RECT()
        self.u.GetWindowRect(self.hwnd(h), self.c.byref(r))
        pt = (self.w.POINT * 1)(self.w.POINT(r.left, r.top))
        self.u.MapWindowPoints(None, self.u.GetParent(self.hwnd(h)), pt, 1)
        return pt[0].x, pt[0].y

    def adopt(self, h, parent):
        hw = self.hwnd(h)
        width, height = self.client_size(h)
        style = self.u.GetWindowLongPtrW(hw, self.GWL_STYLE)
        ex = self.u.GetWindowLongPtrW(hw, self.GWL_EXSTYLE)
        self.saved.setdefault(h, (style, ex))
        self.u.SetWindowLongPtrW(hw, self.GWL_STYLE, (style & ~(self.WS_POPUP | self.FRAME)) | self.WS_CHILD | self.WS_CLIPSIBLINGS)
        self.u.SetWindowLongPtrW(hw, self.GWL_EXSTYLE, ex & ~self.EX_FRAME)
        if not self.u.SetParent(hw, self.hwnd(parent)):
            self.u.SetWindowLongPtrW(hw, self.GWL_STYLE, style)
            self.u.SetWindowLongPtrW(hw, self.GWL_EXSTYLE, ex)
            raise OSError('SetParent failed (Windows error %d)' % self.c.get_last_error())
        # SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_SHOWWINDOW: the client area keeps the editor's own size
        self.u.SetWindowPos(hw, None, 0, 0, width, height, 0x0020 | 0x0010 | 0x0040)
        return width, height

    def release(self, h, screen_xy=None):
        hw = self.hwnd(h)
        style, ex = self.saved.pop(h, (None, None))
        self.u.SetParent(hw, None)
        if style is not None:
            self.u.SetWindowLongPtrW(hw, self.GWL_STYLE, style)
            self.u.SetWindowLongPtrW(hw, self.GWL_EXSTYLE, ex)
        self.u.SetWindowRgn(hw, None, True)
        x, y = screen_xy or (120, 120)
        self.u.SetWindowPos(hw, None, x, y, 0, 0, 0x0001 | 0x0020 | 0x0040)  # SWP_NOSIZE | FRAMECHANGED | SHOWWINDOW

    def to_screen(self, parent, x, y):
        pt = (self.w.POINT * 1)(self.w.POINT(x, y))
        self.u.MapWindowPoints(self.hwnd(parent), None, pt, 1)
        return pt[0].x, pt[0].y

    def place(self, h, x, y):
        # HWND_TOP (0), SWP_NOSIZE | SWP_NOACTIVATE: above Chromium's own child window, never stealing focus
        self.u.SetWindowPos(self.hwnd(h), self.hwnd(0), int(x), int(y), 0, 0, 0x0001 | 0x0010)

    def clip(self, h, region):
        """region: None = the whole window shows; (x, y, w, h) in the window's own coordinates; () = nothing shows."""
        if region is None:
            self.u.SetWindowRgn(self.hwnd(h), None, True)
            return
        x, y, w, hh = region if region else (0, 0, 0, 0)
        self.u.SetWindowRgn(self.hwnd(h), self.g.CreateRectRgn(int(x), int(y), int(x + w), int(y + hh)), True)  # the window owns it

    def redraw(self, h):
        self.u.RedrawWindow(self.hwnd(h), None, None, 0x0001 | 0x0080 | 0x0004)  # INVALIDATE | ALLCHILDREN | ERASE


class Mac:
    """Best effort on macOS with pyobjc (AppKit) in the runtime: borderless, aligned over the placeholder, ordered above
    Hearth's window. AppKit calls run on the host's main thread (the JUCE loop) through AppHelper.callAfter."""

    def __init__(self):
        import AppKit  # noqa: F401  (pyobjc-framework-Cocoa; not installed by Hearth's setup)
        from PyObjCTools import AppHelper
        self.AppKit, self.AppHelper = AppKit, AppHelper
        self.handles = {}
        self.origin = (0, 0)  # Hearth's content area, top-left, in screen points (top-left origin)
        self.scale = 1.0

    def _main(self, fn):
        done = threading.Event()
        out = {}

        def run():
            try:
                out['v'] = fn()
            except Exception as error:
                out['e'] = error
            finally:
                done.set()
        self.AppHelper.callAfter(run)
        if not done.wait(2):
            raise OSError('The editor window did not answer.')
        if 'e' in out:
            raise out['e']
        return out.get('v')

    def windows(self, pid):
        def find():
            found = []
            for w in self.AppKit.NSApp.windows():
                if w.isVisible():
                    self.handles[int(w.windowNumber())] = w
                    found.append({'hwnd': int(w.windowNumber()), 'title': str(w.title()), 'cls': 'NSWindow'})
            return found
        return self._main(find)

    def alive(self, h):
        return h in self.handles and bool(self._main(lambda: self.handles[h].isVisible()))

    def client_size(self, h):
        f = self._main(lambda: self.handles[h].contentRectForFrameRect_(self.handles[h].frame()))
        return int(f.size.width * self.scale), int(f.size.height * self.scale)

    def position(self, h):
        return None  # not tracked: the editor is a separate window (re-placed on every layout change instead)

    def adopt(self, h, parent):
        w = self.handles[h]
        size = self.client_size(h)

        def go():
            w.setStyleMask_(0)  # NSWindowStyleMaskBorderless
            w.setHasShadow_(False)
            w.orderWindow_relativeTo_(1, int(parent))  # NSWindowAbove Hearth's window
        self._main(go)
        self.parent = int(parent)
        return size

    def release(self, h, screen_xy=None):
        w = self.handles[h]
        self._main(lambda: (w.setStyleMask_(1 | 2 | 4), w.setHasShadow_(True), w.setAlphaValue_(1.0), w.setIgnoresMouseEvents_(False)))

    def to_screen(self, parent, x, y):
        return x, y

    def place(self, h, x, y):
        w = self.handles[h]
        ox, oy = self.origin

        def go():
            screen = self.AppKit.NSScreen.screens()[0].frame().size.height
            frame = w.frame()
            px, py = ox + x / self.scale, oy + y / self.scale
            w.setFrameOrigin_((px, screen - py - frame.size.height))
            w.orderWindow_relativeTo_(1, getattr(self, 'parent', 0))
        self._main(go)

    def clip(self, h, region):
        w = self.handles[h]
        hidden = region == ()
        self._main(lambda: (w.setAlphaValue_(0.0 if hidden else 1.0), w.setIgnoresMouseEvents_(hidden)))

    def redraw(self, h):
        w = self.handles[h]
        self._main(lambda: w.contentView().setNeedsDisplay_(True))


def backend():
    """(backend, reason): the real layer for this system, the test fake, or None with the plain reason."""
    if os.environ.get('HEARTH_VST_FAKE_WIN32') == '1':
        try:
            import fakewin32
            return fakewin32.Backend(), ''
        except Exception as error:
            return None, 'the test window layer is missing (%s)' % str(error)[:80]
    if sys.platform == 'win32':
        try:
            return Win32(), ''
        except Exception as error:
            return None, 'Windows refused the window calls (%s)' % str(error)[:80]
    if sys.platform == 'darwin':
        try:
            return Mac(), ''
        except Exception:
            return None, 'on the Mac the editor opens as its own window (placing it inside Hearth needs pyobjc in the audio runtime)'
    return None, 'this system can\'t place another program\'s window inside Hearth'


def dpi_aware():
    """Per-monitor DPI awareness for the host, like Electron's, so both sides count the same physical pixels. JUCE may
    have set it already (then this call fails quietly)."""
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))  # PER_MONITOR_AWARE_V2
    except Exception:
        pass


class Embedder:
    """One editor window: find it, take it into Hearth's window, place / clip / hide it, give it back (pop out)."""

    def __init__(self, layer, reason, pid=None):
        self.b, self.reason = layer, reason
        self.pid = pid or os.getpid()
        self.hwnd = None
        self.parent = None
        self.mode = 'closed'  # closed | opening | embedded | floating
        self.note = ''
        self.size = None  # the editor's own client size, physical pixels (the placeholder takes it)
        self.at = None  # wanted top-left in Hearth's client area
        self.region = None  # last clip applied
        self.visible = True
        self.clip_rect = None  # the part of the placeholder on screen (client px), None = all of it
        self.places = 0
        self.lock = threading.RLock()
        self.watching = False

    def state(self):
        out = {'mode': self.mode, 'size': list(self.size) if self.size else None, 'note': self.note, 'places': self.places,
               'embeddable': self.b is not None, 'why': '' if self.b else self.reason}
        if self.hwnd and hasattr(self.b, 'debug'):  # the test layer only: what the fake window looks like
            out['window'] = self.b.debug(self.hwnd)
        return out

    def find(self, timeout=4.0, known=(), stop=None):
        """The editor window pedalboard just opened in this process (title "Pedalboard"; else a new JUCE window)."""
        end = time.monotonic() + timeout
        while time.monotonic() < end and not (stop and stop()):
            wins = [w for w in self.b.windows(self.pid) if w['hwnd'] not in known]
            pick = next((w for w in wins if w['title'] == TITLE), None) or next((w for w in wins if w['cls'].startswith('JUCE')), None)
            if pick:
                return pick['hwnd']
            time.sleep(.01)
        return None

    def opened(self, embed, known=(), stop=None):
        """Called right after show_editor started: embed = {parent, x, y, clip, visible} or None (floating asked)."""
        with self.lock:
            self.mode, self.note = 'opening', ''
        if self.b is None:
            with self.lock:
                self.mode = 'floating'
                self.note = 'Opened in its own window: %s.' % self.reason if embed else ''
            return self.state()
        h = self.find(known=known, stop=stop)
        with self.lock:
            if h is None:
                self.mode, self.note = 'floating', ('The editor window didn\'t show up in time to be placed in Hearth; it is in its own window.' if embed else '')
                return self.state()
            self.hwnd = h
            if not embed:
                self.mode = 'floating'
                try:
                    self.size = tuple(self.b.client_size(h))
                except Exception:
                    pass
                return self.state()
        return self.embed(embed)

    def embed(self, embed):
        with self.lock:
            if not self.hwnd:
                raise ValueError('Open the editor first.')
            if not embed or not embed.get('parent'):
                self.mode, self.note = 'floating', 'Hearth\'s window couldn\'t be found, so the editor is in its own window.'
                return self.state()
            try:
                self.parent = int(embed['parent'])
                self.size = tuple(self.b.adopt(self.hwnd, self.parent))
                self.mode, self.note = 'embedded', ''
                self.region = 'unset'
                self.place(embed)
            except Exception as error:
                self.mode = 'floating'
                self.note = 'Couldn\'t place the editor inside Hearth (%s); it is in its own window.' % str(error)[:120]
                try:
                    self.b.release(self.hwnd)
                except Exception:
                    pass
            self.watch()
            return self.state()

    def place(self, job):
        """Layout from Hearth: x, y (placeholder top-left, client px), clip [x, y, w, h] = the part on screen (client px)
        or null when all of it shows, visible false = hidden (desk hidden, a menu / dialog over it, window too small)."""
        with self.lock:
            if self.mode != 'embedded' or not self.hwnd:
                return self.state()
            if isinstance(job.get('origin'), list) and hasattr(self.b, 'origin'):  # the Mac: Hearth's content origin moved
                self.b.origin = tuple(job['origin'][:2])
                self.b.scale = float(job.get('scale') or 1)
            if job.get('x') is not None:
                self.at = (int(job['x']), int(job['y']))
            self.visible = job.get('visible', self.visible) is not False
            if not self.at:
                return self.state()
            if 'clip' in job:
                self.clip_rect = job['clip']
            x, y = self.at
            w, h = self.size or (0, 0)
            clip = self.clip_rect
            if not self.visible:
                region = ()
            elif clip:
                cx, cy, cw, ch = (int(v) for v in clip[:4])
                ix, iy = max(cx, x), max(cy, y)
                iw, ih = min(cx + cw, x + w) - ix, min(cy + ch, y + h) - iy
                region = (ix - x, iy - y, iw, ih) if iw > 0 and ih > 0 else ()
                if region == (0, 0, w, h):
                    region = None
            else:
                region = None
            self.b.place(self.hwnd, x, y)
            if region != self.region:
                self.b.clip(self.hwnd, region)
                self.region = region
            self.places += 1
            return self.state()

    def watch(self):
        """The plugin may move / resize its own window (JUCE thinks it is still top-level): put it back, note new sizes."""
        if self.watching:
            return
        self.watching = True

        def loop():
            try:
                while self.hwnd and self.mode in ('embedded', 'floating'):
                    time.sleep(.16)
                    with self.lock:
                        if not self.hwnd:
                            break
                        if not self.b.alive(self.hwnd):
                            self.closed()
                            break
                        if self.mode != 'embedded':
                            continue
                        try:
                            size = tuple(self.b.client_size(self.hwnd))
                            if size != self.size and size[0] > 0:
                                self.size, self.region = size, 'unset'
                            pos = self.b.position(self.hwnd)
                            if self.at and pos is not None and tuple(pos) != tuple(self.at):
                                self.place({})
                        except Exception:
                            pass
            finally:
                self.watching = False
        threading.Thread(target=loop, daemon=True).start()

    def pop_out(self):
        with self.lock:
            if self.mode != 'embedded' or not self.hwnd:
                return self.state()
            try:
                screen = self.b.to_screen(self.parent, *(self.at or (40, 40)))
            except Exception:
                screen = None
            self.b.release(self.hwnd, screen)
            self.mode, self.region, self.note = 'floating', None, ''
            return self.state()

    def repaint(self):
        with self.lock:
            if self.hwnd:
                try:
                    self.b.redraw(self.hwnd)
                except Exception:
                    pass

    def closed(self):
        with self.lock:
            self.hwnd, self.mode, self.at, self.region, self.parent, self.clip_rect = None, 'closed', None, None, None, None
