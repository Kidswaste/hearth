// Native feel, the pure parts (round 36, nativefeel): no files, no Electron, no window. Required by nativefeelmain.js
// and dev/nativefeel-test.js, and loaded as a plain script in the window (NativeCore: the light / dark pairs).
//
//   · Window memory: where the window was, per computer and per screen layout (the Mac on its own, the Mac with the
//     studio monitor, the PC with two screens…), restored only where it can be seen: a window whose screen is gone
//     (a monitor unplugged, the laptop alone) comes back centred on a screen that is there, never off-screen.
//     window.json stays on each computer (sync-merge.js LOCAL_FILES) and keeps each computer's own entries (a data
//     folder carried to the other computer doesn't put the window where the first computer's screens were).
//   · Menus: the Mac's app / Edit / View / Window / Help menus, Windows' menu bar (hidden, Alt shows it). Keys Hearth's
//     page already handles are shown in the menu but not taken from the page (registerAccelerator: false).
//   · The taskbar badge (Windows' overlay icon) drawn in code, like the app icon.
//   · Light / dark: which look follows the computer's light or dark mode (pairs of looks).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NativeCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const DEFAULT = { width: 1480, height: 940 };
  const MIN = { width: 760, height: 480 }; // (main.js minWidth / minHeight)
  const KEEP_LAYOUTS = 8; // screen layouts remembered per computer (the oldest goes)
  const KEEP_MACHINES = 4;

  // ---------- screens ----------
  const rect = (r) => (r && [r.x, r.y, r.width, r.height].every(Number.isFinite) ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null);
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const areaOf = (d) => rect(d.workArea) || rect(d.bounds);
  // "this set of screens": ids, places, sizes and scales (a screen moved or rescaled is another layout)
  function layoutKey(displays) {
    return (displays || []).map((d) => { const b = rect(d.bounds) || { x: 0, y: 0, width: 0, height: 0 }; return `${d.id}@${b.x},${b.y},${b.width}x${b.height}*${+(d.scaleFactor || 1).toFixed(2)}`; }).sort().join('|') || 'none';
  }
  // the screen that shows most of r (else the one nearest its middle)
  function displayFor(r, displays) {
    let best = null; let most = 0;
    for (const d of displays) { const o = overlap(r, areaOf(d)); if (o > most) { most = o; best = d; } }
    if (best) return best;
    const cx = r.x + r.width / 2; const cy = r.y + r.height / 2;
    let near = Infinity;
    for (const d of displays) { const a = areaOf(d); const dx = Math.max(a.x - cx, 0, cx - (a.x + a.width)); const dy = Math.max(a.y - cy, 0, cy - (a.y + a.height)); const n = dx * dx + dy * dy; if (n < near) { near = n; best = d; } }
    return best;
  }
  // Can the owner grab it? The title strip (its top 32 px, less the corners) shows at least 120 px wide on one screen,
  // and its top isn't above that screen's work area (under the Mac's menu bar, or above a screen's top edge).
  function grabbable(b, displays) {
    const strip = { x: b.x + 24, y: b.y, width: Math.max(1, b.width - 48), height: 32 };
    return displays.some((d) => {
      const a = areaOf(d);
      const w = Math.min(strip.x + strip.width, a.x + a.width) - Math.max(strip.x, a.x);
      return w >= Math.min(120, strip.width) && b.y >= a.y - 1 && b.y + 24 <= a.y + a.height;
    });
  }
  // centred on a screen, at most its work area (a window saved on a bigger screen fits a smaller one)
  function centreOn(d, size) {
    const a = areaOf(d);
    const width = Math.max(Math.min(MIN.width, a.width), Math.min(size.width || DEFAULT.width, a.width));
    const height = Math.max(Math.min(MIN.height, a.height), Math.min(size.height || DEFAULT.height, a.height));
    return { x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + (a.height - height) / 2), width, height };
  }

  // Where the window opens: a remembered entry ({ bounds, maximized, fullscreen, displayId }) placed on the screens
  // there are now. → { bounds, maximized, fullscreen, displayId, rescued } (rescued: it was moved back on screen)
  function place(entry, displays, primaryId) {
    const list = (displays || []).filter((d) => areaOf(d));
    const primary = list.find((d) => d.id === primaryId) || list[0];
    if (!primary) return { bounds: entry?.bounds ? rect(entry.bounds) : null, maximized: Boolean(entry?.maximized), fullscreen: Boolean(entry?.fullscreen), displayId: null, rescued: false };
    const b = rect(entry?.bounds);
    const flags = { maximized: Boolean(entry?.maximized), fullscreen: Boolean(entry?.fullscreen) };
    if (!b) { const d = primary; return { bounds: centreOn(d, DEFAULT), ...flags, displayId: d.id, rescued: false }; }
    if (grabbable(b, list)) {
      // on screen; a window taller / wider than its screen now (the scale went up) is brought inside it
      const d = displayFor(b, list); const a = areaOf(d);
      if (b.width <= a.width && b.height <= a.height) return { bounds: b, ...flags, displayId: d.id, rescued: false };
      const width = Math.max(Math.min(MIN.width, a.width), Math.min(b.width, a.width)); const height = Math.max(Math.min(MIN.height, a.height), Math.min(b.height, a.height));
      const x = Math.min(Math.max(b.x, a.x), a.x + a.width - width); const y = Math.min(Math.max(b.y, a.y), a.y + a.height - height);
      return { bounds: { x, y, width, height }, ...flags, displayId: d.id, rescued: true };
    }
    // its screen is gone (or it was dragged out of reach): the screen it was on if that one is still there, else the
    // nearest, else the main one; centred, at its own size when that fits
    const d = list.find((x) => x.id === entry.displayId) || displayFor(b, list) || primary;
    return { bounds: centreOn(d, b), ...flags, displayId: d.id, rescued: true };
  }

  // ---------- the file (data/window.json) ----------
  // { v: 2, machines: { '<platform>:<host>': { last: '<layout>', layouts: { '<layout>': { bounds, maximized, fullscreen, displayId, scale, at } } } } }
  // The round-≤35 file ({ x, y, width, height, maximized }) is read as this computer's 'legacy' layout.
  function read(raw, machine) {
    const s = raw && typeof raw === 'object' ? raw : {};
    if (s.v === 2 && s.machines && typeof s.machines === 'object') return { v: 2, machines: { ...s.machines } };
    const out = { v: 2, machines: {} };
    const b = rect(s);
    if (b && machine) out.machines[machine] = { last: 'legacy', layouts: { legacy: { bounds: b, maximized: Boolean(s.maximized), fullscreen: false, at: 0 } } };
    return out;
  }
  // this computer's entry for this layout; else (a layout not seen yet) the newest one that shows on these screens as it
  // was (the laptop's own place when the monitor isn't there), else its last one, else none
  function pick(state, machine, layout, displays) {
    const m = state?.machines?.[machine];
    if (!m?.layouts) return null;
    if (m.layouts[layout]) return m.layouts[layout];
    const list = (displays || []).filter((d) => areaOf(d));
    if (list.length) {
      const fits = Object.values(m.layouts).filter((e) => { const b = rect(e?.bounds); return b && !place(e, list, list[0].id).rescued; }).sort((a, b) => (b.at || 0) - (a.at || 0));
      if (fits[0]) return fits[0];
    }
    return m.layouts[m.last] || null;
  }
  function remember(state, machine, layout, entry, now = Date.now()) {
    const s = read(state, machine);
    const m = { ...(s.machines[machine] || {}), last: layout, layouts: { ...(s.machines[machine]?.layouts || {}) } }; // (round 38: other keys, bigscreen's screens, kept)
    m.layouts[layout] = { ...entry, at: now };
    const keys = Object.keys(m.layouts).sort((a, b) => (m.layouts[b].at || 0) - (m.layouts[a].at || 0));
    for (const k of keys.slice(KEEP_LAYOUTS)) delete m.layouts[k];
    s.machines[machine] = m;
    const ms = Object.keys(s.machines).sort((a, b) => newest(s.machines[b]) - newest(s.machines[a]));
    for (const k of ms.slice(KEEP_MACHINES)) delete s.machines[k];
    return s;
  }
  const newest = (m) => Math.max(0, ...Object.values(m?.layouts || {}).map((e) => e.at || 0));

  // ---------- the Mac: double-click on the title area (System Settings → Desktop & Dock) ----------
  function macDoubleClick(pref) {
    const p = String(pref || '').toLowerCase();
    if (p === 'minimize') return 'minimize';
    if (p === 'none' || p === 'no action') return 'none';
    return 'zoom'; // 'Maximize' (the default, also when never set) and 'Fill'
  }

  // ---------- menus ----------
  // o: { platform, appName, act: { settings, keys, devtools, report, focusMain } } → an Electron menu template.
  // On the Mac the menu takes the keys first (⌘C / ⌘V need an Edit menu to work at all); on Windows the page sees a key
  // first, so a key Hearth already handles is only shown (registerAccelerator: false): never handled twice.
  function menuTemplate(o) {
    const mac = o.platform === 'darwin';
    const name = o.appName || 'Hearth';
    const a = o.act || {};
    const show = (label, accelerator, click) => ({ label, accelerator, registerAccelerator: false, click });
    const view = { label: 'View', submenu: [
      { role: 'togglefullscreen' }, // ⌃⌘F on the Mac, F11 on Windows
      { type: 'separator' },
      show('Bigger', 'CmdOrCtrl+=', () => a.zoom?.(1)), show('Smaller', 'CmdOrCtrl+-', () => a.zoom?.(-1)), show('Automatic size', 'CmdOrCtrl+0', () => a.zoom?.(0)), // (round 38, bigscreen: everything's size, per screen)
      { type: 'separator' },
      { label: 'Developer tools', accelerator: mac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => a.devtools?.() },
    ] };
    const help = { role: 'help', submenu: [
      show('Keyboard shortcuts', 'CmdOrCtrl+/', () => a.keys?.()),
      { label: 'Report a problem…', click: () => a.report?.() },
    ] };
    if (mac) {
      return [
        { label: name, submenu: [
          { role: 'about', label: `About ${name}` },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'Cmd+,', click: () => a.settings?.() },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', label: `Hide ${name}` }, { role: 'hideOthers' }, { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: `Quit ${name}` }, // ⌘Q: saves land first (main.js before-quit)
        ] },
        { role: 'editMenu' },
        view,
        { role: 'windowMenu' }, // Minimize ⌘M, Zoom, Bring All to Front
        help,
      ];
    }
    // Windows (and Linux): hidden until Alt is pressed; Alt+F4 closes the window as everywhere on Windows (with
    // "Closing the window keeps Hearth running" it stays in the tray); Exit quits for real
    return [
      { label: '&File', submenu: [
        show('Settings', 'Ctrl+,', () => a.settings?.()),
        { type: 'separator' },
        show('Close window', 'Alt+F4', () => a.close?.()),
        { label: 'Exit', click: () => a.quit?.() },
      ] },
      { label: '&Edit', submenu: ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'separator', 'selectAll'].map((r) => (r === 'separator' ? { type: 'separator' } : { role: r, registerAccelerator: false })) },
      { ...view, label: '&View' },
      { label: '&Window', submenu: [{ role: 'minimize' }, show('Keep on top', 'Ctrl+Shift+T', () => a.onTop?.())] },
      { ...help, label: '&Help' },
    ];
  }
  // every accelerator a template registers (what the menu takes from the page), for the keys check
  function takenKeys(template) {
    const out = [];
    const walk = (items) => { for (const it of items || []) { if (it.accelerator && it.registerAccelerator !== false) out.push(it.accelerator); if (Array.isArray(it.submenu)) walk(it.submenu); } };
    walk(template);
    return out;
  }

  // ---------- the taskbar badge (Windows' overlay icon: replies that finished while Hearth was in the background) ----------
  const GLYPH = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000' };
  const badgeText = (n) => (n > 9 ? '9+' : String(Math.max(1, Math.floor(n) || 1)));
  // RGBA pixels of a size × size badge: an ember disc, white digits (a 3×5 font), anti-aliased edge
  function badgeRgba(n, size = 16) {
    const px = new Uint8Array(size * size * 4);
    const text = badgeText(n);
    const s = Math.max(1, Math.floor(size / (text.length > 1 ? 16 : 8)));
    const tw = (text.length * 4 - 1) * s; const th = 5 * s;
    const ox = Math.round((size - tw) / 2); const oy = Math.round((size - th) / 2);
    const r = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const cover = Math.max(0, Math.min(1, r - Math.hypot(x + 0.5 - r, y + 0.5 - r) + 0.5));
        if (!cover) continue;
        let c = [228, 87, 15]; // ember
        const gx = Math.floor((x - ox) / s); const gy = Math.floor((y - oy) / s);
        const ch = gx >= 0 && gy >= 0 && gy < 5 ? text[Math.floor(gx / 4)] : null;
        if (ch && gx % 4 < 3 && GLYPH[ch][gy * 3 + (gx % 4)] === '1') c = [255, 255, 255];
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = Math.round(255 * cover);
      }
    }
    return px;
  }

  // ---------- light / dark: which look follows the computer ----------
  // A look and its partner of the other kind (Forgeheart ↔ Forge Light…); a look without one pairs with Forge Light
  // (dark) or Forgeheart (light).
  const PAIRS = { forgeheart: 'forge-light', classic: 'parchment', swirl: 'parchment', 'chrome-forge': 'chrome-light', 'frost-steel': 'frost-light', midnight: 'light', graphite: 'light', contrast: 'light', 'hc-forge': 'forge-light', ironclad: 'parchment', 'gold-leaf': 'parchment', 'ash-copper': 'parchment' };
  const BACK = { 'forge-light': 'forgeheart', 'chrome-light': 'chrome-forge', parchment: 'classic', 'frost-light': 'frost-steel', light: 'midnight' };
  // themes: AppUI.THEMES ({ id: { scheme } }) → { dark, light }
  function followPair(current, themes) {
    const t = themes?.[current];
    const ok = (id) => Boolean(themes?.[id]);
    if (!t) return { dark: ok('forgeheart') ? 'forgeheart' : null, light: ok('forge-light') ? 'forge-light' : null };
    if (t.scheme === 'light') return { light: current, dark: [BACK[current], 'forgeheart'].find(ok) || null };
    return { dark: current, light: [PAIRS[current], 'forge-light'].find(ok) || null };
  }
  const followTarget = (pair, osDark) => (pair ? (osDark ? pair.dark : pair.light) || null : null);

  // ---------- crisp canvases: a new screen scale ----------
  // A WebGL renderer's own pixel ratio after the page's devicePixelRatio went from `from` to `to`: a sketch that drew at
  // the full ratio follows it; one that capped it (Math.min(devicePixelRatio, 2)) or fixed it (1) keeps its cap.
  function nextRatio(base, from, to) {
    if (!(base > 0) || !(to > 0)) return base;
    if (!(from > 0) || base >= from - 1e-3) return to;
    return Math.min(base, to);
  }

  return { DEFAULT, MIN, layoutKey, displayFor, grabbable, centreOn, place, read, pick, remember, macDoubleClick, menuTemplate, takenKeys, badgeText, badgeRgba, PAIRS, followPair, followTarget, nextRatio };
}));
