// ▶ Play's hitch map (round 63, hitchmap63): WHERE in the game it stutters. Runs INSIDE ▶ Play's game window, only when
// the owner turned the recording on (/playtest hitchmap on, or ▶ Play's right-click "Record the hitch map"); when it's
// off this script is not in the page at all (gamemodemain.js adds its tag only then, right after the budget's).
//   record    one frame callback of its own: per frame the frame's time (the gap between two frames) and where the
//             player and the camera were, written into one typed ring made once (8 numbers a frame, 2^17 frames ≈ 9 min
//             at 240 Hz, the oldest overwritten): no allocation per frame. Where the player is: window.game / __game /
//             gameState / GAME (.player, .position, or x / y / z), window.player, else an object named "player" in the
//             scene (looked for a few times only), else the camera; the camera: the Lab's window.__scenes, window.camera,
//             or the renderers loads during play saw. Looked up once a second, never per frame.
//   spikes    a frame ≥ 4× the usual and ≥ 3 refreshes (≥ 20 ms): one event to the preload (game-preload.js), which asks
//             the main side for a picture of the moment (playnotes62's capture: capturePage + one short read of what the
//             game saves). At most 4 a session, ≥ 2 s apart; after the first two only a new worst one.
//   cost      its own time (two clock reads around each frame callback) is a helper of ▶ Play's budget
//             (tools/playbudget-page.js: id 'hitch'): over the budget, the watch switches it off like the others. It must
//             stay under 0.05 ms a frame (dev/checks/hitchmap63.js).
//   after     hitchmapmain.js reads dump() once when the session ends (leave, Ctrl/⌘+P back to editing, /playtest
//             hitchmap off) and builds the map (hitchmap-core.js) main-side: nothing is computed here.
// window.__hearthHitch = { budget: { spent, pause, off }, line() → '● Hitch map 2:31', pub() → JSON, spike() → JSON,
//   dump() → JSON (the ring as base64), stop(by) } (tools/game-api.md).
(function () {
  // ---------- the pure part (dev/hitchmap-test.js) ----------
  const Rules = (() => {
    const COLS = 8; // the trace read after the session: t (ms since the recording started), dt (ms), the player's x y z, the camera's x y z
    const N = 1 << 17;
    const POS = 6; const STAGE = 16; // the ring keeps per frame its time and the one before it (Float64) + 6 positions (Float32)
    const MAX_SHOTS = 4; const SHOT_GAP = 2000; const SHOT_AFTER = 1500; // (no picture in the first 1.5 s of play: loading)
    // made once: t / l (this frame's time, the frame before's: the gap is worked out after the session, so nothing is
    // computed per frame) and p (positions, plus a 16-number staging area at its end: a matrix's elements are copied in
    // with set() and the position taken with copyWithin(): typed-array builtins, no number boxed on the way)
    function ring(n = N) { return { t: new Float64Array(n), l: new Float64Array(n), p: new Float32Array(n * POS + STAGE), st: n * POS, n, i: 0, len: 0, total: 0, wn: 0 }; }
    function advance(r) { r.i = r.i + 1 === r.n ? 0 : r.i + 1; if (r.len < r.n) r.len += 1; r.total += 1; }
    // one frame by value (tests; the page's frame callback writes the same slots itself)
    function push(r, t, last, px, py, pz, cx, cy, cz) {
      const i = r.i; const o = i * POS; const p = r.p;
      r.t[i] = t; r.l[i] = last; p[o] = px; p[o + 1] = py; p[o + 2] = pz; p[o + 3] = cx; p[o + 4] = cy; p[o + 5] = cz;
      advance(r);
    }
    // the trace, oldest first, 8 numbers a frame (once, after the session): [t − t0, t − the frame before, positions]
    function ordered(r, t0 = 0) {
      const out = new Float32Array(r.len * COLS); const start = r.len < r.n ? 0 : r.i;
      for (let j = 0; j < r.len; j += 1) {
        const i = (start + j) % r.n; const k = j * COLS; const o = i * POS;
        out[k] = r.t[i] - t0; out[k + 1] = r.t[i] - r.l[i];
        for (let q = 0; q < POS; q += 1) out[k + 2 + q] = r.p[o + q];
      }
      return out;
    }
    // the frame time a spike starts at: ≥ 4× the usual frame, ≥ 3 refreshes, ≥ 20 ms
    const spikeMs = (typical, hz) => Math.max(4 * (typical > 0 ? typical : 0), 3000 / (Number(hz) > 0 ? Number(hz) : 60), 20);
    // a picture for this spike? s = { n, last, worst } (taken so far, the last one's t, the biggest dt pictured)
    function shot(s, t, dt) {
      if (t < SHOT_AFTER || s.n >= MAX_SHOTS) return false;
      if (s.n && t - s.last < SHOT_GAP) return false;
      return s.n < 2 || dt > s.worst;
    }
    // the usual frame: a slow average that a spike barely moves (one frame of 10× counts as 3×)
    const typical = (typ, dt) => (typ > 0 ? typ + (Math.min(dt, typ * 3) - typ) * 0.02 : dt);
    const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    return { COLS, N, POS, MAX_SHOTS, SHOT_GAP, SHOT_AFTER, ring, advance, push, ordered, spikeMs, shot, typical, clock };
  })();
  if (typeof module === 'object' && module && module.exports) { module.exports = Rules; return; }
  if (window.__hearthHitch) return;

  // ---------- the page ----------
  const W = window;
  const Q = new URLSearchParams(((document.currentScript && document.currentScript.src) || '').split('?')[1] || '');
  const O = W.__hearthHitchOpts || {}; // (turned on mid-play: hitchmapmain.js puts the script in through executeJavaScript)
  const HZ = Number(Q.get('hz') || O.hz) || 60;
  const now = () => performance.now();
  const raf = W.requestAnimationFrame.bind(W); // (the real one: getting ready holds the game's frames)
  const R = Rules.ring(Number(O.n) > 0 ? Number(O.n) : Rules.N);
  // every number that changes per frame lives in a typed array (a fractional number in a closure variable is a new heap
  // number each time: gcchurn60)
  const T = new Float64Array(16);
  const SELF = 0; const LAST = 1; const TYP = 2; const T0 = 3; const RES = 4; const SHN = 5; const SHL = 6; const SHW = 7; const SPN = 8; const SPT = 9; const SPD = 10; const A0 = 12; const W0 = 13; const SPK = 14;
  T[SPK] = Infinity; // (no spike line until the first look at the usual frame)
  const WIN = 32; // frames between two looks at the usual frame (and, ≥ 1 s apart, where the player / camera are)
  const SHOTS = new Float64Array(Rules.MAX_SHOTS * 2); // [t, dt] of each spike pictured
  let on = true; let paused = false; let offBy = null; let offAt = 0;
  let P = null; let PE = null; let C = null; let CE = null; let camKey = ''; let posFrom = 'camera'; let namedTries = 0;
  const startedAt = Date.now();
  const playing = () => { const g = W.__gameReady; return g ? g.phase === 'playing' : now() > 3000; };

  // where the player and the camera are: looked up once a second (never per frame)
  const isObj = (o) => Boolean(o && typeof o === 'object' && o.isObject3D && o.matrixWorld && o.matrixWorld.elements);
  const isXYZ = (o) => Boolean(o && typeof o === 'object' && typeof o.x === 'number' && (typeof o.z === 'number' || typeof o.y === 'number'));
  function playerIn(g) {
    if (!g || typeof g !== 'object') return null;
    if (isObj(g.player)) return g.player;
    if (g.player && isXYZ(g.player.position)) return g.player.position;
    if (isXYZ(g.player)) return g.player;
    if (isObj(g.position) || isXYZ(g.position)) return g.position;
    if (isXYZ(g.pos)) return g.pos;
    return isXYZ(g) ? g : null;
  }
  function resolve(t) {
    T[RES] = t;
    let c = null; let ck = ''; let scene = null;
    try { const sc = W.__scenes; if (sc) for (const k in sc) { const v = sc[k]; if (v && v.camera && v.camera.isCamera) { c = v.camera; ck = k; scene = v.scene || null; break; } } } catch (e) { c = null; }
    if (!c) { try { if (W.camera && W.camera.isCamera) { c = W.camera; ck = 'camera'; } } catch (e) { c = null; } }
    if (!c) { try { const s = W.__gameStream; const r = s && s.renderers ? s.renderers() : null; if (r && r[0] && r[0].camera && r[0].camera.isCamera) { c = r[0].camera; scene = r[0].scene || null; } } catch (e) { c = null; } }
    C = c; CE = c && c.matrixWorld ? c.matrixWorld.elements : null; camKey = ck;
    let p = null;
    const names = ['game', '__game', 'gameState', 'GAME'];
    for (let i = 0; i < names.length && !p; i += 1) { try { p = playerIn(W[names[i]]); } catch (e) { p = null; } }
    if (!p) { try { if (isObj(W.player) || isXYZ(W.player)) p = W.player; } catch (e) { p = null; } }
    // an object called "player" in the scene: looked for 5 times at most (a whole-scene walk)
    if (!p && scene && namedTries < 5 && scene.getObjectByName) { namedTries += 1; try { p = scene.getObjectByName('player') || scene.getObjectByName('Player') || null; } catch (e) { p = null; } }
    P = p; PE = isObj(p) ? p.matrixWorld.elements : null;
    posFrom = p ? 'player' : 'camera';
  }

  // ---------- one frame ----------
  // Per frame: two stores of times, two builtin copies of positions, one compare. Everything else (the usual frame, the
  // spike line, where the player / camera are) is looked at once every 32 frames; the gaps are worked out after the session
  // (flags as booleans and each time read once: until the browser optimises this function, every fractional number it
  // reads or computes is a small allocation)
  let live = false; let skip = false; let started = false;
  function frame(t) {
    if (!on) return;
    raf(frame);
    const a = now();
    if (paused || !playing()) { live = false; T[SELF] += now() - a; return; }
    if (live && !skip) {
      const last = T[LAST];
      if (!started) { started = true; T[T0] = last; T[W0] = last; resolve(t); }
      if (R.wn >= WIN) look(t);
      const i = R.i; const o = i * 6; const p = R.p; const st = R.st;
      R.t[i] = t; R.l[i] = last;
      if (CE) { p.set(CE, st); p.copyWithin(o + 3, st + 12, st + 15); } else p.fill(0, o + 3, o + 6);
      if (PE) { p.set(PE, st); p.copyWithin(o, st + 12, st + 15); } else if (P) { p[o] = P.x; p[o + 1] = typeof P.y === 'number' ? P.y : 0; p[o + 2] = typeof P.z === 'number' ? P.z : 0; } else p.copyWithin(o, o + 3, o + 6);
      Rules.advance(R); R.wn += 1;
      if (t - last >= T[SPK]) spiked(t, last);
    }
    T[LAST] = t; live = true; skip = false;
    T[SELF] += now() - a;
  }
  // every 32 frames: the usual frame (their mean, at most twice the last one: a spike in them barely moves it), the line a
  // spike starts at, and (≥ 1 s apart) where the player and the camera are
  function look(t) {
    const mean = (t - T[W0]) / R.wn;
    T[TYP] = T[TYP] > 0 ? Math.min(mean, T[TYP] * 2) : mean;
    T[SPK] = Rules.spikeMs(T[TYP], HZ);
    T[W0] = t; R.wn = 0;
    if (t - T[RES] > 1000) resolve(t);
  }
  // a spike (rare): counted, and a picture asked for when the rules say so (≤ 4 a session)
  function spiked(t, last) {
    const rt = t - T[T0]; const dt = t - last;
    T[SPN] += 1; T[SPT] = rt; T[SPD] = dt;
    const k = T[SHN];
    if (Rules.shot({ n: k, last: T[SHL], worst: T[SHW] }, rt, dt)) {
      SHOTS[k * 2] = rt; SHOTS[k * 2 + 1] = dt; T[SHN] = k + 1; T[SHL] = rt; if (dt > T[SHW]) T[SHW] = dt;
      try { dispatchEvent(new Event('hearth-hitch')); } catch (e) { /* the preload asks for the picture */ }
    }
  }
  // a hidden window has no frames: the gap after it is not a hitch
  const onVis = () => { skip = true; live = false; };
  addEventListener('visibilitychange', onVis);
  raf(frame);

  function stop(by) {
    if (!on) return false;
    on = false; offBy = String(by || 'asked'); offAt = T[LAST] > 0 && T[T0] > 0 ? T[LAST] - T[T0] : 0;
    removeEventListener('visibilitychange', onVis);
    return true;
  }
  const secs = () => (R.len && T[T0] ? R.t[(R.i - 1 + R.n) % R.n] - T[T0] : 0);
  const line = () => (on ? `● Hitch map ${Rules.clock(secs())}` : offBy === 'watch' || offBy === 'ab' ? '○ Hitch map stopped (it cost the game frames)' : '');
  function pub() {
    const frames = R.total;
    return JSON.stringify({ on, paused, off: offBy, offAt: Math.round(offAt), frames, kept: R.len, secs: Math.round(secs() / 100) / 10, hz: HZ, spentMs: +T[SELF].toFixed(3), avgMs: frames ? +(T[SELF] / frames).toFixed(5) : null, typical: +T[TYP].toFixed(2), spikes: T[SPN], shots: T[SHN], camKey, posFrom, startedAt });
  }
  const spike = () => JSON.stringify({ t: T[SPT], dt: T[SPD], n: T[SPN], shots: T[SHN] });
  function dump() {
    const a = Rules.ordered(R, T[T0]);
    const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const shots = []; for (let k = 0; k < T[SHN]; k += 1) shots.push([SHOTS[k * 2], SHOTS[k * 2 + 1]]);
    return JSON.stringify({ v: 1, cols: Rules.COLS, n: R.len, total: R.total, hz: HZ, startedAt, t0: T[T0], cost: { ms: +T[SELF].toFixed(3), frames: R.total }, on, off: offBy, offAt: Math.round(offAt), camKey, posFrom, spikes: T[SPN], shots, data: btoa(s) });
  }
  Object.defineProperty(W, '__hearthHitch', { configurable: true, value: Object.freeze({
    // (▶ Play's budget, tools/playbudget-page.js: id 'hitch') its own time, stepped aside for the A/B, off for the session
    budget: { spent: () => T[SELF], pause: (p) => { paused = Boolean(p); live = false; }, off: (by) => stop(by || 'watch') },
    line, pub, spike, dump, stop, rules: Rules,
  }) });
}());
