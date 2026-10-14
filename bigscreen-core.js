// Big screen, the pure parts (round 38, bigscreen): no files, no Electron, no window. Required by bigscreenmain.js and
// dev/bigscreen-test.js, and loaded in the window as BigCore (the size choices and the auto rule, for the setting).
//
//   · "Size of everything" (the whole window's zoom), per screen: Auto picks it from the screen's size in points (what
//     the system's own scaling left): a 4K monitor at 100 % gets 150 %, a laptop or a 4K at 200 % stays at 100 %.
//     A size you pick yourself is kept for that screen only (the laptop keeps its own).
//   · Full screen per screen: the big monitor reopens full screen, the laptop windowed (nativefeel's window memory keeps
//     each set of screens; this adds each screen on its own, for a set of screens not seen yet).
//   The screens are told apart by their kind (pixels and scale), so two identical monitors share their choices and a
//   screen whose id changed after a restart (Windows) keeps them.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BigCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const CHOICES = ['auto', 1, 1.25, 1.5, 1.75, 2]; // (the Appearance row; ⌘/Ctrl + / − go 60…200 % in tens)
  const MIN = 0.6; const MAX = 2;
  const KEEP = 12; // screens remembered per computer
  // the smallest window the app is laid out for, in CSS pixels at the chosen size (Auto never shrinks it below this)
  const ROOM = { width: 1280, height: 720 };

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  // a size the owner picked (or 'auto'), cleaned: numbers clamp to 60…200 % in 5 % steps
  function normal(v) {
    if (v === 'auto' || v == null || v === '') return 'auto';
    const n = num(v);
    if (!(n > 0)) return 'auto';
    return Math.round(Math.min(MAX, Math.max(MIN, n)) * 20) / 20;
  }

  // the screen in points ({ size | bounds, workArea, scaleFactor }) → its pixels, its scale, its "effective height":
  // the shorter of its height and a 16:9 height for its width, so an ultrawide (3440 × 1440) counts as 1440 high and a
  // portrait screen by its width
  function measure(d) {
    const s = d?.size || d?.bounds || {};
    const w = num(s.width); const h = num(s.height);
    const scale = num(d?.scaleFactor) > 0 ? num(d.scaleFactor) : 1;
    if (!(w > 0 && h > 0)) return null;
    const long = Math.max(w, h); const short = Math.min(w, h);
    return { w, h, scale, px: { w: Math.round(w * scale), h: Math.round(h * scale) }, eff: Math.min(short, long * 9 / 16), ratio: long / short };
  }
  // Auto: bigger where the system left a lot of points (text is tiny there); a screen the system already scales
  // (a Retina Mac, Windows at 150 / 200 %) has few points and stays at 100 %.
  const STEPS = [[1600, 1], [1950, 1.25], [2500, 1.5], [3100, 1.75], [Infinity, 2]];
  function autoZoom(d) {
    const m = measure(d);
    if (!m) return 1;
    let z = STEPS.find(([h]) => m.eff < h)[1];
    // never so big that a window filling the screen has less room than the app is laid out for
    const area = d.workArea && num(d.workArea.width) > 0 ? d.workArea : { width: m.w, height: m.h };
    z = Math.min(z, Math.max(1, Math.floor(Math.min(area.width / ROOM.width, area.height / ROOM.height) * 20) / 20));
    return z;
  }
  // what the window uses: the screen's own choice, else Auto
  function zoomFor(pref, d) { const p = normal(pref); return p === 'auto' ? autoZoom(d) : p; }
  // the next size for ⌘/Ctrl + (dir 1) / − (dir −1) from the size in use; 0 = back to Auto
  function step(current, dir) {
    if (!dir) return 'auto';
    const c = num(current) > 0 ? num(current) : 1;
    return normal(Math.round((c + dir * 0.1) * 10) / 10);
  }
  const label = (z) => `${Math.round(z * 100)} %`;

  // ---------- which screen ----------
  // its kind: pixels and scale ("3840x2160@1"), the same on every start and for its twin
  function sig(d) { const m = measure(d); return m ? `${m.px.w}x${m.px.h}@${+m.scale.toFixed(2)}` : 'unknown'; }
  const describe = (d) => { const m = measure(d); return m ? `${m.px.w} × ${m.px.h}${m.scale !== 1 ? ` at ${Math.round(m.scale * 100)} %` : ''}` : 'this screen'; };
  // how wide the window is, for its layout (CSS pixels at the size in use): 'wide' from 1800, 'huge' from 2560; an
  // ultrawide window (21:9 and wider) is 'ultra' too
  function band(width, height) {
    const w = num(width); const h = num(height);
    return { size: w >= 2560 ? 'huge' : w >= 1800 ? 'wide' : '', ultra: w > 0 && h > 0 && w / h >= 2.2 && w >= 1800 };
  }

  // ---------- memory (data/window.json, next to nativefeel's window places) ----------
  // machines[<computer>].screens = { <sig>: { zoom?, fullscreen?, at } }
  function screenOf(state, machine, d) { return state?.machines?.[machine]?.screens?.[sig(d)] || null; }
  function rememberScreen(state, machine, d, patch, now = Date.now()) {
    const s = state && typeof state === 'object' ? { ...state, machines: { ...(state.machines || {}) } } : { v: 2, machines: {} };
    const m = { ...(s.machines[machine] || {}) };
    const screens = { ...(m.screens || {}) };
    const k = sig(d);
    const next = { ...(screens[k] || {}), ...patch, at: now };
    if ('zoom' in patch) { const z = normal(patch.zoom); if (z === 'auto') delete next.zoom; else next.zoom = z; }
    if ('fullscreen' in patch) next.fullscreen = Boolean(patch.fullscreen);
    screens[k] = next;
    for (const old of Object.keys(screens).sort((a, b) => (screens[b].at || 0) - (screens[a].at || 0)).slice(KEEP)) delete screens[old];
    m.screens = screens;
    s.machines[machine] = m;
    return s;
  }
  // full screen for a window opening on screen d: what this screen did last, when the set of screens is new (a set seen
  // before keeps its own, nativefeel's); null = no opinion
  function fullscreenFor(state, machine, d, knownLayout) {
    if (knownLayout) return null;
    const e = screenOf(state, machine, d);
    return e && typeof e.fullscreen === 'boolean' ? e.fullscreen : null;
  }

  return { CHOICES, MIN, MAX, ROOM, normal, measure, autoZoom, zoomFor, step, label, sig, describe, band, screenOf, rememberScreen, fullscreenFor };
}));
