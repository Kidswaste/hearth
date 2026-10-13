// Chrome view, the pure part (round 31, chromeview stream): no DOM, no Electron, so dev/chromeview-test.js runs it in
// plain Node, and the same file is loaded by the hub (lazy group "chrome") and by app windows (apps-window.html).
// The owner: "open the chrome browser in the background… I should only interact with it to login, then I wanna do
// everything within the app". Hearth's Chrome runs out of sight; a Chrome view inside Hearth shows a page's frames
// (Page.startScreencast) and sends the owner's mouse and keys to it (Input.dispatch*). This file maps one to the other:
//   fit(viewW, viewH, frameW, frameH)        → where the frame is drawn in the view (letterboxed, never stretched)
//   toPage(x, y, view, meta)                 → a point in the view → the page's own CSS pixels (frame metadata aware)
//   modifiers(e), buttonName(b), buttonsMask(bits), Clicks (double / triple clicks), mouse(type, e, pt, n)
//   wheel(e, pt, pageH)                      → Input.dispatchMouseEvent mouseWheel (lines / pages → pixels)
//   keys(e, { mac, up })                     → Input.dispatchKeyEvent params (text for typed keys, ⌘ editing commands)
//   reserved(e, { mac })                     → keys Hearth keeps for itself (reload, back, close, the palette…)
//   frameSize(w, h, dpr, maxPixels)          → the screencast's size cap (device pixel ratio aware, area capped)
//   Pacer                                     → when to ack a frame (≤ maxFps, slower when drawing is slow)
//   signInPage(url, hosts), signInLeft(prev, url, hosts) → Google's / a site's sign-in page, and leaving it
//   cursorExpr(x, y), cursorOf(css)          → the page's cursor under the mouse, as a CSS cursor Hearth may show
//   address(url)                             → the address in plain words (host + path, no https://)
// Passwords never pass through here: Hearth sends key presses to a page like a keyboard would, and the sign-in itself
// happens in Chrome's own window.
(function (root) {
  const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
  const modifiers = (e = {}) => (e.altKey ? MOD.alt : 0) | (e.ctrlKey ? MOD.ctrl : 0) | (e.metaKey ? MOD.meta : 0) | (e.shiftKey ? MOD.shift : 0);
  const BUTTON = ['left', 'middle', 'right', 'back', 'forward'];
  const buttonName = (b) => BUTTON[b] || 'none';
  // DOM `buttons` bits (1 left, 2 right, 4 middle, 8 back, 16 forward) are the same bits CDP's `buttons` wants
  const buttonsMask = (bits) => Number(bits) & 31;

  // ---------- coordinates ----------
  // the frame drawn as large as fits, centred (a frame of another size shows while the page catches up with a resize)
  function fit(vw, vh, fw, fh) {
    if (!(vw > 0 && vh > 0 && fw > 0 && fh > 0)) return { x: 0, y: 0, w: Math.max(0, vw || 0), h: Math.max(0, vh || 0), scale: 1 };
    const scale = Math.min(vw / fw, vh / fh);
    const w = fw * scale; const h = fh * scale;
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h, scale };
  }
  // x, y: relative to the view's top-left, in CSS pixels. view: { w, h } (CSS pixels). meta: the frame's metadata
  // (deviceWidth / deviceHeight: the page's viewport in CSS pixels, offsetTop, pageScaleFactor) and its pixel size
  // (frameW / frameH). Returns the page point, or null outside the drawn frame (the letterbox bars).
  function toPage(x, y, view = {}, meta = {}) {
    const dw = meta.deviceWidth || view.w; const dh = meta.deviceHeight || view.h;
    if (!(dw > 0 && dh > 0)) return null;
    const box = fit(view.w, view.h, meta.frameW || dw, meta.frameH || dh);
    const fx = (x - box.x) / box.w; const fy = (y - box.y) / box.h;
    if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
    const r = (v) => Math.round(v * 100) / 100;
    return { x: r(Math.min(dw - 0.01, fx * dw)), y: r(Math.min(dh - 0.01, fy * dh - (meta.offsetTop || 0))) };
  }

  // ---------- the mouse ----------
  // double and triple clicks: the same button again, quickly, close by
  class Clicks {
    constructor({ ms = 500, px = 5 } = {}) { this.ms = ms; this.px = px; this.last = null; }
    press(button, x, y, t) {
      const l = this.last;
      const n = l && l.button === button && t - l.t <= this.ms && Math.abs(x - l.x) <= this.px && Math.abs(y - l.y) <= this.px ? Math.min(3, l.n + 1) : 1;
      this.last = { button, x, y, t, n };
      return n;
    }
    count() { return this.last?.n || 1; }
  }
  // type: mousePressed | mouseReleased | mouseMoved
  function mouse(type, e = {}, pt = { x: 0, y: 0 }, clickCount = 0) {
    const p = { type, x: pt.x, y: pt.y, modifiers: modifiers(e), buttons: buttonsMask(e.buttons || 0) };
    if (type === 'mouseMoved') p.button = p.buttons & 1 ? 'left' : p.buttons & 2 ? 'right' : p.buttons & 4 ? 'middle' : 'none';
    else { p.button = buttonName(e.button); p.clickCount = clickCount || 1; }
    return p;
  }
  // a wheel turn in pixels (deltaMode 1: lines of 40 px, 2: pages)
  function wheel(e = {}, pt = { x: 0, y: 0 }, pageH = 800) {
    const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? Math.max(100, pageH * 0.9) : 1;
    const clamp = (v) => Math.max(-4000, Math.min(4000, Math.round((Number(v) || 0) * k)));
    return { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: clamp(e.deltaX), deltaY: clamp(e.deltaY), modifiers: modifiers(e), button: 'none', buttons: 0 };
  }
  // wheel turns that come faster than frames add up into one
  const addWheel = (a, b) => (a ? { ...b, deltaX: Math.max(-4000, Math.min(4000, a.deltaX + b.deltaX)), deltaY: Math.max(-4000, Math.min(4000, a.deltaY + b.deltaY)) } : b);

  // ---------- the keyboard ----------
  // keys without a character of their own: what Chrome needs to know (windowsVirtualKeyCode, and Enter / Tab's text)
  const NAMED = {
    Enter: [13, '\r'], Tab: [9, '\t'], Backspace: [8], Escape: [27], Delete: [46], Insert: [45], Home: [36], End: [35], PageUp: [33], PageDown: [34],
    ArrowLeft: [37], ArrowUp: [38], ArrowRight: [39], ArrowDown: [40], Shift: [16], Control: [17], Alt: [18], Meta: [91], CapsLock: [20], ContextMenu: [93],
    F1: [112], F2: [113], F3: [114], F4: [115], F5: [116], F6: [117], F7: [118], F8: [119], F9: [120], F10: [121], F11: [122], F12: [123],
  };
  // on a Mac, ⌘ shortcuts are Chrome's menu commands, not key presses the page acts on: they're sent as editing commands
  const MAC_COMMANDS = { a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: 'undo' };
  function vk(e) {
    if (NAMED[e.key]) return NAMED[e.key][0];
    if (e.keyCode) return e.keyCode;
    const k = String(e.key || '');
    if (/^[a-z]$/i.test(k)) return k.toUpperCase().charCodeAt(0);
    if (/^[0-9]$/.test(k)) return k.charCodeAt(0);
    const m = /^(Key|Digit)(\w)$/.exec(String(e.code || ''));
    return m ? m[2].toUpperCase().charCodeAt(0) : 0;
  }
  // the character a key types (none with Ctrl / ⌘ held, none for named keys but Enter / Tab)
  function textOf(e, mac) {
    if (e.isComposing || e.key === 'Dead' || e.key === 'Process') return '';
    if (e.ctrlKey && !(e.altKey && !mac)) return ''; // (AltGr on Windows arrives as Ctrl+Alt: it types)
    if (e.metaKey) return '';
    if (NAMED[e.key]) return NAMED[e.key][1] || '';
    const k = String(e.key || '');
    return [...k].length === 1 ? k : '';
  }
  // the event(s) to send for one DOM keydown / keyup: [{ type, key, code, windowsVirtualKeyCode, modifiers, text?, … }]
  function keys(e = {}, { mac = false, up = false } = {}) {
    const base = { key: String(e.key || ''), code: String(e.code || ''), windowsVirtualKeyCode: vk(e), nativeVirtualKeyCode: vk(e), modifiers: modifiers(e), location: e.location || 0, autoRepeat: Boolean(e.repeat), isKeypad: e.location === 3 };
    if (up) return [{ type: 'keyUp', ...base }];
    const text = textOf(e, mac);
    const p = { type: text ? 'keyDown' : 'rawKeyDown', ...base };
    if (text) { p.text = text; p.unmodifiedText = text; }
    if (mac && e.metaKey && !e.ctrlKey && !e.altKey) {
      const k = String(e.key || '').toLowerCase();
      const cmd = k === 'z' && e.shiftKey ? 'redo' : MAC_COMMANDS[k];
      if (cmd) p.commands = [cmd];
    }
    return [p];
  }
  // keys Hearth keeps for itself even while the owner types in a Chrome view (they bubble to Hearth's own handlers):
  // reload, back / forward, close / hide, the address, Hearth's palette, a new chat, quitting, switching chats
  function reserved(e = {}, { mac = false } = {}) {
    const mod = mac ? e.metaKey : e.ctrlKey;
    const k = String(e.key || '').toLowerCase();
    if (e.key === 'F5' || e.key === 'F11' || e.key === 'F12') return true;
    if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return true;
    if (!mod) return false;
    if (e.shiftKey && k === 'enter') return true; // (send this page to the chat)
    return ['r', 'w', 'l', 't', 'n', 'q', 'k', 'f', ',', '[', ']', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(k);
  }

  // ---------- frames ----------
  // the screencast's size: the view's size × the screen's pixel ratio, its area capped (a 5K screen doesn't encode 5K
  // JPEGs 30 times a second: past maxPixels the frames come a little softer)
  function frameSize(w, h, dpr = 1, maxPixels = 2.4e6) {
    const W = Math.max(1, Math.round(w)); const H = Math.max(1, Math.round(h));
    let s = Math.max(0.5, Math.min(3, Number(dpr) || 1));
    if (W * H * s * s > maxPixels) s = Math.max(0.5, Math.sqrt(maxPixels / (W * H)));
    return { width: W, height: H, scale: Math.round(s * 100) / 100, maxWidth: Math.round(W * s), maxHeight: Math.round(H * s) };
  }
  // when to tell Chrome "next frame, please": not before 1/maxFps after the last one, later while drawing is slow (a busy
  // computer gets fewer frames instead of a queue), back to full speed once drawing is quick again
  class Pacer {
    constructor({ maxFps = 30, minFps = 8 } = {}) { this.maxFps = maxFps; this.minFps = minFps; this.fps = maxFps; this.lastAck = 0; this.drawMs = 0; this.frames = 0; }
    drawn(ms) {
      this.drawMs = this.drawMs ? this.drawMs * 0.8 + ms * 0.2 : ms;
      const budget = 1000 / this.fps;
      if (this.drawMs > budget * 0.6 && this.fps > this.minFps) this.fps = Math.max(this.minFps, Math.round(this.fps * 0.75));
      else if (this.drawMs < (1000 / this.maxFps) * 0.3 && this.fps < this.maxFps) this.fps = Math.min(this.maxFps, this.fps + 2);
    }
    // ms to wait before acking the frame that arrived now
    delay(now) { const gap = 1000 / this.fps; const d = this.lastAck ? Math.max(0, this.lastAck + gap - now) : 0; return Math.round(d); }
    acked(now) { this.lastAck = now; this.frames += 1; }
  }

  // ---------- sign-in ----------
  const hostOf = (u) => { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ''; } };
  const onHost = (url, hosts) => { const h = hostOf(url); return Boolean(h) && hosts.some((x) => h === x || h.endsWith(`.${x}`)); };
  const GOOGLE = ['accounts.google.com'];
  const GOOGLE_PATH = /\/(v\d\/)?signin\b|\/ServiceLogin|\/AccountChooser|\/InteractiveLogin|\/challenge\/|\/identifier|\/(v\d\/)?signin\/rejected|deniedsigninrejected/i;
  const SITE_PATH = /\/(log-?in|sign-?in|sign_in|auth\/(login|signin)|oauth2?\/authorize|sso)(\b|\/|$)/i;
  // a page that's Google's sign-in (or its "Couldn't sign you in"), or a site's own login page
  function signInPage(url, hosts = []) {
    const u = String(url || '');
    if (!/^https?:/i.test(u)) return null;
    if (onHost(u, [...GOOGLE, ...hosts])) { try { if (GOOGLE_PATH.test(new URL(u).pathname)) return /rejected|deniedsigninrejected/i.test(u) ? 'refused' : 'google'; } catch { return null; } }
    try { if (SITE_PATH.test(new URL(u).pathname)) return 'site'; } catch { return null; }
    return null;
  }
  // the sign-in finished: the page was on a sign-in page and now isn't (Google sends you on to the site)
  const signInLeft = (prev, url, hosts = []) => Boolean(signInPage(prev, hosts)) && /^https?:/i.test(String(url || '')) && !signInPage(url, hosts);

  // ---------- the cursor ----------
  // what the page shows under the mouse: its own cursor, else a hand on links, an I-beam on text you can type in
  const cursorExpr = (x, y) => `(() => { let n = document.elementFromPoint(${Number(x) || 0}, ${Number(y) || 0}); if (!n) return 'default'; while (n && n.shadowRoot && n.shadowRoot.elementFromPoint) { const m = n.shadowRoot.elementFromPoint(${Number(x) || 0}, ${Number(y) || 0}); if (!m || m === n) break; n = m; } const c = getComputedStyle(n).cursor; if (c && c !== 'auto') return c; if (n.closest('a[href],button,[role=button],label[for],select,summary')) return 'pointer'; if (n.closest('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable=""],[contenteditable=true]')) return 'text'; return 'default'; })()`;
  const CURSORS = new Set(['default', 'pointer', 'text', 'vertical-text', 'move', 'grab', 'grabbing', 'crosshair', 'wait', 'progress', 'help', 'not-allowed', 'no-drop', 'copy', 'alias', 'cell', 'context-menu', 'zoom-in', 'zoom-out', 'none', 'col-resize', 'row-resize', 'n-resize', 's-resize', 'e-resize', 'w-resize', 'ne-resize', 'nw-resize', 'se-resize', 'sw-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize', 'all-scroll']);
  // a page's cursor value, as one Hearth shows (a custom url(…) cursor → its fallback keyword)
  function cursorOf(css) {
    const parts = String(css || '').split(',').map((s) => s.trim().toLowerCase());
    const k = parts[parts.length - 1] || 'default';
    return CURSORS.has(k) ? k : 'default';
  }

  // ---------- plain words ----------
  function address(url) {
    try { const u = new URL(String(url)); if (!/^https?:$/.test(u.protocol)) return String(url); const p = `${u.pathname}${u.search}`; return `${u.hostname.replace(/^www\./, '')}${p === '/' ? '' : p}`; } catch { return String(url || ''); }
  }

  const api = { MOD, modifiers, buttonName, buttonsMask, fit, toPage, Clicks, mouse, wheel, addWheel, keys, reserved, vk, textOf, frameSize, Pacer, signInPage, signInLeft, hostOf, cursorExpr, cursorOf, address };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ChromeViewCore = api;
}(typeof window !== 'undefined' ? window : null));
