// ▶ Play, Quality: auto (round 72, labfps72): the game's resolution follows its frame rate.
// The owner: "Play does look best but the framerate is abysmal". ▶ Play draws at the screen's own pixel ratio with
// MSAA (round 52, max fidelity) and never touched the resolution, so a heavy scene on a big high-refresh screen could
// only drop frames. Now, when the game's frames miss the screen's refresh because the graphics card has too many
// pixels to draw, the game draws a little fewer of them (85 %, then 75 %, then 67 % of the screen's pixel size in each
// direction; the window stays full screen and sharp text / the F chip are untouched) and goes back up a step at a time
// when there's room. A step down that doesn't measurably help (the game's own code is the limit, not the pixels) is
// undone at once, and that game isn't stepped down again for a while (doubling: 30 s, 60 s… then not this play).
// (Frames come at whole refreshes, so a step that shows no gain yet is followed by the next one down before giving up.)
// "Full" (the F chip's Quality button, Hearth's ▶ Play right-click › Quality, /game quality full) keeps every pixel.
//
// How (a second preload of the game session, like gamelook-preload.js, in the game's own world before its scripts):
//   - the scale lives in window.devicePixelRatio as the game's code reads it (the real ratio × the scale): three.js'
//     setPixelRatio(devicePixelRatio), a Lab scene's renderers (the 'three' shim asks globalThis.devicePixelRatio) and a
//     game's own resize code all agree; on a step every renderer three.js told us about is given the new ratio once
//     (its drawing buffer made again at the new size, between two frames);
//   - nothing runs every frame: a 24-frame look every second (the gaps between the game's frames), only while it plays
//     (after Getting ready's card and its first 2 s), never while the window is hidden;
//   - the decisions are qualityCore() below (pure: dev/labfps72-test.js runs it in Node).
// window.__gameQuality = { state(), line(), set('auto' | 'full'), renderers() } (tools/game-api.md).

// <quality-core> (pure)
function qualityCore(opt = {}) {
  const SCALES = opt.scales || [1, 0.85, 0.75, 0.67];
  const MISS = opt.miss ?? 1.2; // a look misses when its median gap is over 1.2 × the refresh
  const ROOM = opt.room ?? 1.1; // a look has room when 90 % of its gaps are within 1.1 × the refresh
  const GAIN = opt.gain ?? 0.92; // a step down has to bring the median under 92 % of what it was
  const UP0 = opt.upWait ?? 8000; const UP_MAX = opt.upMax ?? 64000; const HOLD0 = opt.hold ?? 30000;
  const S = { level: 0, slow: 0, good: 0, at: -1e9, pend: null, upWait: UP0, holdUntil: 0, hold: HOLD0, noGain: 0, off: false, downs: 0, ups: 0, undone: 0, why: '' };
  // one look: { med, p90 } gaps in ms against the refresh's frame time (budget, ms) at `now` (ms).
  // → { step: -1 (lower) | +1 (higher) | 0, level, scale, why }
  function feed(look, budget, now) {
    const med = Number(look?.med); const p90 = Number(look?.p90);
    if (!(med > 0) || !(budget > 0)) return out(0, '');
    const miss = med > budget * MISS; const room = p90 > 0 && p90 <= budget * ROOM;
    // the first look after a step: was it worth it?
    if (S.pend) {
      const p = S.pend; S.pend = null;
      if (p.dir < 0) {
        if (med <= p.before * GAIN || !miss) { S.noGain = 0; S.hold = HOLD0; return out(0, 'helped'); }
        // no gain yet: frames come at whole refreshes (vsync), so one step can be too small to show; the next one down
        // is tried, from the same start (a game whose pixels are the cost gets there)
        if (S.level < SCALES.length - 1) { S.pend = p; S.level += 1; S.at = now; S.downs += 1; return out(-1, 'trying'); }
        // down to the floor and no gain: the pixels weren't what's slow; back to where it started, and left alone for a
        // while (longer each time; after 3 such tries, for the rest of this play)
        S.level = p.from; S.at = now; S.undone += 1; S.noGain += 1;
        S.holdUntil = S.noGain >= 3 ? Infinity : now + S.hold; S.hold = Math.min(HOLD0 * 4, S.hold * 2);
        S.slow = 0; S.good = 0;
        return out(+1, S.noGain >= 3 ? 'not-pixels-stop' : 'not-pixels');
      }
      if (miss) { S.level = p.from; S.at = now; S.upWait = Math.min(UP_MAX, S.upWait * 2); S.slow = 0; S.good = 0; S.downs += 1; return out(-1, 'up-missed'); }
    }
    if (S.off) return out(0, 'full');
    if (miss) {
      S.good = 0; S.slow += 1;
      if ((S.slow >= 2 || med > budget * 2) && S.level < SCALES.length - 1 && now >= S.holdUntil) {
        S.pend = { dir: -1, from: S.level, before: med };
        S.level += 1; S.at = now; S.slow = 0; S.downs += 1;
        return out(-1, 'missed');
      }
      return out(0, now < S.holdUntil ? 'held' : 'missing');
    }
    S.slow = 0;
    if (room) S.good += 1; else S.good = 0;
    if (S.level > 0 && S.good >= 3 && now - S.at >= S.upWait) {
      S.pend = { dir: +1, from: S.level, before: med };
      S.level -= 1; S.at = now; S.good = 0; S.ups += 1;
      return out(+1, 'room');
    }
    return out(0, 'fits');
  }
  function out(step, why) { if (why) S.why = why; return { step, level: S.level, scale: SCALES[S.level], why }; }
  return {
    SCALES, feed,
    get level() { return S.level; },
    get scale() { return SCALES[S.level]; },
    // 'full': back to every pixel at once and no steps; 'auto': steps again (from full)
    mode(m) { S.off = m === 'full'; if (S.off) { S.level = 0; S.pend = null; } S.slow = 0; S.good = 0; S.holdUntil = 0; S.noGain = 0; S.hold = HOLD0; return S.level; },
    state: () => ({ level: S.level, scale: SCALES[S.level], mode: S.off ? 'full' : 'auto', downs: S.downs, ups: S.ups, undone: S.undone, held: S.holdUntil > 0 && S.holdUntil !== Infinity ? Math.round(S.holdUntil) : S.holdUntil === Infinity ? 'this play' : 0, upWait: S.upWait, why: S.why }),
  };
}
// </quality-core>

function gameQualityPage(o) {
  if (window.__gameQuality || !o) return;
  const HZ = Number(o.hz) || 60; const BUDGET = 1000 / HZ;
  const EVERY = 1000; const N = 24;
  const realRAF = window.requestAnimationFrame.bind(window); const realTimeout = window.setTimeout.bind(window);
  const now = () => performance.now();
  const core = qualityCore();
  core.mode(o.quality === 'full' ? 'full' : 'auto');
  const SP = new Float64Array(2); // [0] ms spent here (looks + steps), [1] looks taken
  const log = []; // the last steps: [t, scale, why, median before]
  // ---------- the scale, where the game's code reads it ----------
  const d0 = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio') || Object.getOwnPropertyDescriptor(Window.prototype, 'devicePixelRatio');
  const real = d0 && d0.get ? () => d0.get.call(window) : () => 1;
  let scale = core.scale;
  try { Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => real() * scale }); } catch (e) { return; }
  // ---------- three.js tells us its renderers (as it tells gamelook-preload.js) ----------
  const rs = new Set();
  const dev = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());
  dev.addEventListener('observe', (e) => { try { const d = e.detail; if (d && d.isWebGLRenderer) rs.add(d); } catch (er) { /* the game plays as it is */ } });
  const renderers = () => {
    const all = new Set(rs);
    try { for (const r of (window.__gameLook && window.__gameLook.renderers()) || []) all.add(r); } catch (e) { /* fine */ }
    try { for (const r of (window.__rdyLive && window.__rdyLive()) || []) all.add(r); } catch (e) { /* fine */ }
    return [...all].filter((r) => r && typeof r.setPixelRatio === 'function' && !(r.domElement && r.domElement.__glDead));
  };
  function apply(next) {
    if (next === scale) return 0;
    scale = next;
    let n = 0;
    for (const r of renderers()) { try { r.setPixelRatio(window.devicePixelRatio); n += 1; } catch (e) { /* gone */ } }
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* fine */ } // (a game's own resize code reads the ratio again)
    return n;
  }
  // ---------- the looks ----------
  const phase = () => { try { return window.__gameReady ? JSON.parse(window.__gameReady.pub()).phase : 'playing'; } catch (e) { return 'playing'; } };
  let playingSince = 0;
  function look() {
    return new Promise((res) => {
      const g = []; let last = 0; const t0 = now();
      const f = (t) => {
        const a = now();
        if (last) g.push(t - last);
        last = t;
        SP[0] += now() - a;
        if (g.length >= N || now() - t0 > 4000) { g.sort((x, y) => x - y); res(g.length >= 6 ? { med: g[g.length >> 1], p90: g[Math.min(g.length - 1, Math.floor(g.length * 0.9))], n: g.length } : null); } else realRAF(f);
      };
      realRAF(f);
    });
  }
  let busy = false;
  async function tick() {
    realTimeout(tick, EVERY);
    if (busy || document.hidden) { playingSince = document.hidden ? 0 : playingSince; return; }
    if (phase() !== 'playing') { playingSince = 0; return; }
    if (!playingSince) { playingSince = now(); return; }
    if (now() - playingSince < 2000) return; // (the first 2 s of play: the game settles, gamelook's first look)
    busy = true;
    try {
      const L = await look(); SP[1] += 1;
      if (!L) return;
      const a = now();
      const v = core.feed(L, BUDGET, now());
      if (v.step) { const n = apply(v.scale); log.push([Math.round(now()), v.scale, v.why, +L.med.toFixed(2), n]); if (log.length > 20) log.shift(); }
      SP[0] += now() - a;
    } finally { busy = false; }
  }
  realTimeout(tick, EVERY);
  const pct = () => `${Math.round(scale * 100)} %`;
  function line() {
    const s = core.state();
    if (s.mode === 'full') return 'Quality full';
    if (s.held === 'this play' && s.level === 0) return 'Quality auto · 100 % (the game\'s own work is the limit, not its pixels)';
    return `Quality auto · ${pct()}`;
  }
  Object.defineProperty(window, '__gameQuality', { configurable: true, value: Object.freeze({
    state: () => ({ ...core.state(), scale, hz: HZ, budget: +BUDGET.toFixed(2), renderers: renderers().length, ratio: +window.devicePixelRatio.toFixed(3), real: real(), spentMs: +SP[0].toFixed(2), looks: SP[1], log: log.slice() }),
    line,
    set: (m) => { core.mode(m === 'full' ? 'full' : 'auto'); apply(core.scale); return line(); },
    renderers: () => renderers().length,
  }) });
}

if (typeof module === 'object' && module.exports && typeof process === 'object' && process.type !== 'renderer') module.exports = { qualityCore, gameQualityPage };
else {
  try {
    const { contextBridge, webFrame } = require('electron');
    const arg = (process.argv || []).find((a) => a.startsWith('--hearth-game='));
    let I = {}; try { I = JSON.parse(decodeURIComponent(arg ? arg.slice(14) : '%7B%7D')); } catch { I = {}; }
    const o = { quality: I.quality === 'full' ? 'full' : 'auto', hz: I.hz || 60 };
    const src = `${qualityCore.toString()}\n(${gameQualityPage.toString()})(${JSON.stringify(o)});`;
    try { if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: new Function(src) }); else throw new Error('old'); } catch { webFrame.executeJavaScript(src); } // eslint-disable-line no-new-func
  } catch { /* the game plays at full resolution */ }
}
