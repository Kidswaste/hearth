// ▶ Game performance (round 52, gameperf): what runs INSIDE the game page. GamePerf (tools/gameperf.js) sends this
// function's text to the page (`(${GamePerfProbe})(opts)`: the Lab preview through its eval, a ▶ Play window through
// executeJavaScript, or gamemode's preload at document start: the earliest moment sees every renderer and shader).
// It uses nothing outside itself. Installed once per page as window.__gamePerf:
//   · always (while attached): per frame one timestamp, the game's frame-callback time, time inside renderer.render,
//     the JS heap (exact since main.js asks for precise memory info), shader compiles / texture uploads (timed by
//     wrapping those rare WebGL calls), long animation frames (with the game's function names), page mutations.
//     About a microsecond or two per frame and no DOM writes: the chip costs ~0 while hidden (dev/checks/gameperf.js).
//   · the chip (F, off by default): fps, frame time, a 2-second frame-time graph with the display's refresh line,
//     renderer.info (calls, triangles, programs, textures, geometries), graphics memory estimates, and GC pauses /
//     shader compiles / texture uploads / long tasks / layout marked on the graph; the last stutter named.
//   · report(): the session's numbers (GamePerfCore.summarize reads them) + the scene looked at once (instancing
//     groups, transparency, shadows and whether anything moves, textures, pixel ratio, antialias, tone mapping…)
//   · tryLive({pr, aniso, tone, color, shadowType, shadowSize}) / undoLive(): a setting tried on the running game only
//     (the owner's click; gone on reload). The game's own files are never touched from here.
//   · hearthPerf.use({renderer, scene, camera}): a game whose three.js lives in a module hands it over (opt-in).
// eslint-disable-next-line no-unused-vars
const GamePerfProbe = function gamePerfProbe(opts) {
  const W = window;
  if (W.__gamePerf) { W.__gamePerf.setOpts(opts || {}); return W.__gamePerf.version; }
  const O = Object.assign({ key: false, hz: 0, attribute: null, chip: false, label: '' }, opts || {});
  const now = () => performance.now();
  const N = 4096; // frames kept (≈ 17 s at 240 Hz, 68 s at 60 Hz)
  const R = { t: new Float64Array(N), dt: new Float32Array(N), work: new Float32Array(N), render: new Float32Array(N), flags: new Uint8Array(N), calls: new Uint32Array(N), i: 0, n: 0 };
  const F_GC = 1; const F_SH = 2; const F_TX = 4; const F_LONG = 8; const F_LAY = 16; const F_SLOW = 32;
  const S = { on: true, t0: now(), frames: 0, sumDt: 0, slow: [], bytes: 0, gcs: 0, heap: 0, self: 0, selfN: 0, layoutMs: 0, mutations: 0,
    shaders: { n: 0, ms: 0, late: [] }, textures: { n: 0, ms: 0, mb: 0, late: [] }, long: [], lastStutter: null, warm: 1500 };
  // this frame so far (finished at the next frame's first callback)
  let cur = { ts: -1, work: 0, render: 0, sh: 0, tx: 0, txB: 0, txW: 0, txH: 0, calls: 0, tris: 0, flags: 0, fn: '', links: 0, shL: null, txL: null, self: 0 };
  // what measuring costs per frame (its own µs), the last 256 frames: the median is the honest number on a busy computer
  const SELF = new Float32Array(256); const CHIP = new Float32Array(256);
  const med = (a, n) => { const k = Math.min(256, n); if (!k) return 0; const s = Array.from(a.subarray(0, k)).sort((x, y) => x - y); return s[k >> 1]; };
  let lastTs = -1;
  const hasMem = Boolean(performance.memory); let heapAt = 0; // (a read costs ≈ 13 µs: at most every 16 ms)
  const renderers = new Set(); const scenes = new Map(); // renderer → { scene, camera, layer }
  let attributeFn = null;
  try { if (O.attribute) attributeFn = new Function(`return (${O.attribute})`)(); } catch { attributeFn = null; }

  // ---------- one frame ends: kept in the rings; a slow one kept with its details ----------
  function finish(ts) {
    if (lastTs > 0 && cur.ts > 0) {
      const dt = ts - lastTs;
      let flags = cur.flags;
      if (hasMem && (ts - heapAt >= 16 || ts < heapAt)) { heapAt = ts; const h = performance.memory.usedJSHeapSize; if (S.heap) { if (h < S.heap - 65536) { flags |= F_GC; S.gcs += 1; } else if (h > S.heap) S.bytes += h - S.heap; } S.heap = h; }
      const i = R.i; R.t[i] = ts; R.dt[i] = dt; R.work[i] = cur.work; R.render[i] = cur.render; R.calls[i] = cur.calls;
      S.frames += 1; S.sumDt += dt;
      const budget = 1000 / (O.hz || 60);
      if (dt > budget * 1.5) {
        flags |= F_SLOW;
        const f = { t: Math.round(ts - S.t0), dt: Math.round(dt * 10) / 10, work: r1(cur.work), render: r1(cur.render), shaderMs: r1(cur.sh), texMs: r1(cur.tx), gc: Boolean(flags & F_GC), fn: cur.fn || null, at: ts - dt };
        if (cur.links) f.links = cur.links;
        if (cur.txB >= 1048576) f.texMB = Math.round(cur.txB / 104857.6) / 10;
        if (cur.tx) f.detail = cur.txW ? `${cur.txW}×${cur.txH} texture` : `${Math.round(cur.txB / 1048576)} MB uploaded`;
        if (S.slow.length < 600) S.slow.push(f); else { let k = 0; for (let j = 1; j < S.slow.length; j += 1) if (S.slow[j].dt < S.slow[k].dt) k = j; if (S.slow[k].dt < f.dt) S.slow[k] = f; }
        if (attributeFn) { try { S.lastStutter = { ...attributeFn(f, budget), at: ts }; } catch { /* fine */ } }
      }
      if (cur.shL) cur.shL.stall = r1(Math.max(cur.shL.ms, dt - 1000 / (O.hz || 60)));
      if (cur.txL) cur.txL.stall = r1(Math.max(cur.txL.ms, dt - 1000 / (O.hz || 60)));
      R.flags[i] = flags; R.i = (i + 1) % N; R.n = Math.min(N, R.n + 1);
      SELF[S.selfN % 256] = cur.self;
      if (cur.tris) S.tris = cur.tris;
      if (cur.calls) S.calls = cur.calls;
    }
    lastTs = ts;
    cur.ts = ts; cur.work = 0; cur.render = 0; cur.sh = 0; cur.tx = 0; cur.txB = 0; cur.txW = 0; cur.txH = 0; cur.calls = 0; cur.tris = 0; cur.flags = 0; cur.fn = ''; cur.links = 0; cur.shL = null; cur.txL = null; cur.self = 0;
    S.selfN += 1;
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  const frameOf = (ts) => { if (ts !== cur.ts && S.on) finish(ts); };

  // ---------- the game's frame callbacks: timed, named ----------
  const RAF = W.requestAnimationFrame;
  const wrapRAF = function requestAnimationFrame(cb) {
    if (typeof cb !== 'function') return RAF.call(W, cb);
    return RAF.call(W, (ts) => {
      if (!S.on) return cb(ts);
      const a = now();
      frameOf(ts);
      const t0 = now(); S.self += t0 - a; cur.self += t0 - a;
      try { return cb(ts); } finally { const t1 = now(); const d = t1 - t0; cur.work += d; if (d > 2 && !cur.fn) cur.fn = loopName(cb); const e = now() - t1; S.self += e; cur.self += e; }
    });
  };
  // three's setAnimationLoop calls its own onAnimationFrame: the game's function is the one handed to setAnimationLoop
  const loopName = (cb) => { const n = cb.name || ''; if (n && n !== 'onAnimationFrame' && n !== 'bound ') return n; for (const r of renderers) if (r.__gpLoop) return r.__gpLoop; return n === 'onAnimationFrame' ? 'the setAnimationLoop callback' : n; };
  W.requestAnimationFrame = wrapRAF;
  // our own frame mark: catches frames whose game callbacks came first, and keeps the chip drawn
  const own = (ts) => { if (!alive) return; const a = now(); frameOf(ts); RAF.call(W, own); const e = now() - a; S.self += e; cur.self += e; if (chip) drawChip(ts); };
  let alive = true;
  RAF.call(W, own);

  // ---------- renderers: render() timed, renderer.info read, the scene it draws remembered ----------
  function track(r, scene, camera, layer) {
    if (!r || !r.isWebGLRenderer && typeof r.render !== 'function') return;
    if (scene) scenes.set(r, { scene, camera, layer: layer ?? r.__layer ?? null });
    if (renderers.has(r)) return;
    renderers.add(r);
    try { wrapGL(r.getContext?.(), true); } catch { /* fine */ }
    const orig = r.render;
    if (typeof orig === 'function' && !orig.__gp) {
      const w = function render(sc, cam) {
        if (!S.on) return orig.call(this, sc, cam);
        const t0 = now();
        try { return orig.call(this, sc, cam); } finally {
          const t1 = now(); cur.render += t1 - t0;
          const i = this.info?.render; if (i) { cur.calls += i.calls || 0; cur.tris += i.triangles || 0; }
          if (sc && sc.isScene !== false) { const e = scenes.get(this); if (!e || e.scene !== sc) scenes.set(this, { scene: sc, camera: cam, layer: this.__layer ?? null }); }
          const e = now() - t1; S.self += e; cur.self += e;
        }
      };
      w.__gp = orig;
      try { r.render = w; } catch { /* read-only */ }
    }
    const sal = r.setAnimationLoop;
    if (typeof sal === 'function' && !sal.__gp) {
      const w2 = function setAnimationLoop(cb) { if (cb?.name) this.__gpLoop = cb.name; return sal.call(this, cb); };
      w2.__gp = sal;
      try { r.setAnimationLoop = w2; } catch { /* fine */ }
    }
  }
  // where renderers are found: the Lab's __scenes, three's devtools hook (renderers / scenes made from now on), a
  // game's opt-in, and globals (a classic-script game)
  function discover() {
    try { const sc = W.__scenes; if (sc) for (const [name, v] of Object.entries(sc)) track(v.renderer, v.scene, v.camera, v.renderer?.__layer ?? name); } catch { /* fine */ }
    try { for (const k of Object.keys(W)) { if (k.startsWith('__') || k === 'hearthPerf') continue; const v = W[k]; if (v && typeof v === 'object' && v.isWebGLRenderer) track(v); } } catch { /* fine */ }
  }
  const lonelyScenes = new Set();
  const onObserve = (e) => { const d = e.detail; if (d?.isWebGLRenderer) track(d); else if (d?.isScene) lonelyScenes.add(d); };
  if (typeof W.__THREE_DEVTOOLS__ === 'undefined') {
    try { const et = new EventTarget(); et.addEventListener('observe', onObserve); W.__THREE_DEVTOOLS__ = et; } catch { /* fine */ }
  } else { try { W.__THREE_DEVTOOLS__.addEventListener?.('observe', onObserve); } catch { /* fine */ } } // (round 54: ▶ Play's look made it first)
  try { for (const r of W.__gameLook?.renderers?.() || []) track(r); } catch { /* fine */ } // (round 54, gamelook: the renderers it saw from the start)
  discover();
  const discT = setInterval(() => { if (S.on) discover(); }, 1000);

  // ---------- shader compiles and texture uploads: the rare WebGL calls, timed ----------
  const glOrig = [];
  const texBytes = (m, a) => {
    let w = 0; let h = 0;
    if (m === 'compressedTexImage2D') { const d = a[6]; return { b: d?.byteLength || 0, w: a[3], h: a[4] }; }
    if (m === 'texStorage2D') return { b: 0, w: a[3], h: a[4] };
    if (a.length >= 8 && typeof a[3] === 'number' && typeof a[4] === 'number' && (m === 'texImage2D' || m === 'texImage3D')) { w = a[3]; h = a[4]; }
    else if (m === 'texSubImage2D' && a.length >= 9 && typeof a[4] === 'number') { w = a[4]; h = a[5]; }
    else { const s = a[a.length - 1]; if (s && typeof s === 'object') { w = s.videoWidth || s.naturalWidth || s.displayWidth || s.width || 0; h = s.videoHeight || s.naturalHeight || s.displayHeight || s.height || 0; } }
    return { b: w * h * 4, w, h };
  };
  // P: a context prototype, or one context whose own methods stand in front of it (the Lab's program cache)
  function wrapGL(P, own) {
    if (!P) return;
    const one = (m, kind) => {
      if (own && !Object.prototype.hasOwnProperty.call(P, m)) return;
      const f = P[m];
      if (typeof f !== 'function' || f.__gp) return;
      const w = function (...a) {
        if (!S.on) return f.apply(this, a);
        const t0 = now();
        try { return f.apply(this, a); } finally {
          const ms = now() - t0;
          const t = Math.round(t0 - S.t0); const late = t0 - S.t0 > S.warm;
          // (the GPU process may do the work after the call returns: the frame it lands in is marked, and how late
          // that frame came is kept with the event as its stall)
          if (kind === 'sh') {
            cur.sh += ms; cur.flags |= F_SH;
            if (m === 'linkProgram') { S.shaders.n += 1; cur.links += 1; }
            S.shaders.ms += ms;
            if (late && (m === 'linkProgram' || ms > 1)) { const L = S.shaders.late; if (cur.shL) cur.shL.ms = r1(cur.shL.ms + ms); else if (L.length < 100) { cur.shL = { t, ms: r1(ms) }; L.push(cur.shL); } }
          } else {
            const { b, w: tw, h: th } = texBytes(m, a);
            cur.tx += ms; cur.txB += b; if (tw * th > cur.txW * cur.txH) { cur.txW = tw; cur.txH = th; }
            if (ms > 0.5 || b >= 1048576) cur.flags |= F_TX;
            S.textures.n += 1; S.textures.ms += ms; S.textures.mb += b / 1048576;
            if (late && (ms > 2 || b >= 1048576)) { if (cur.txL) { cur.txL.ms = r1(cur.txL.ms + ms); cur.txL.mb = Math.round(((cur.txL.mb * 1048576 + b) / 1048576) * 10) / 10; if (tw * th > cur.txL.w * cur.txL.h) { cur.txL.w = tw; cur.txL.h = th; } } else if (S.textures.late.length < 200) { cur.txL = { t, ms: r1(ms), w: tw, h: th, mb: Math.round((b / 1048576) * 10) / 10 }; S.textures.late.push(cur.txL); } }
          }
        }
      };
      w.__gp = f;
      P[m] = w; glOrig.push([P, m, f]);
    };
    for (const m of ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'getActiveUniform', 'getActiveAttrib', 'getUniformLocation', 'getAttribLocation']) one(m, 'sh');
    for (const m of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compressedTexImage2D', 'texStorage2D', 'generateMipmap']) one(m, 'tx');
  }
  wrapGL(W.WebGLRenderingContext?.prototype); wrapGL(W.WebGL2RenderingContext?.prototype);
  for (const r of renderers) { try { wrapGL(r.getContext?.(), true); } catch { /* fine */ } } // (found before the wrappers existed)

  // ---------- long animation frames (≥ 50 ms): the script that ran, by its own name; layout inside them ----------
  let loaf = null;
  try {
    loaf = new PerformanceObserver((list) => {
      if (!S.on) return;
      for (const e of list.getEntries()) {
        const lay = e.styleAndLayoutStart > 0 ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0;
        let top = null; let forced = 0;
        for (const s of e.scripts || []) { forced += s.forcedStyleAndLayoutDuration || 0; if (!top || s.duration > top.duration) top = s; }
        S.layoutMs += lay + forced;
        if (lay + forced > 4) markAt(e.startTime + e.duration, F_LAY);
        if (top && top.duration > 30) {
          const fn = top.sourceFunctionName || (/^(?:FrameRequestCallback|TimerHandler|EventListener)/.test(top.invoker || '') ? '' : top.invoker || '') || '';
          if (S.long.length < 100) S.long.push({ t: Math.round(e.startTime - S.t0), ms: Math.round(top.duration), fn: fn === 'onAnimationFrame' ? loopName({ name: '' }) || fn : fn, url: String(top.sourceURL || '').split(/[\\/]/).pop().slice(0, 60) });
          markAt(e.startTime + e.duration, F_LONG);
          for (const f of S.slow) if (Math.abs(f.at - e.startTime) < e.duration + 20 && !f.longMs) { f.longMs = Math.round(top.duration); if (fn) f.longFn = fn; f.layoutMs = r1(lay + forced); }
        }
      }
    });
    loaf.observe({ type: 'long-animation-frame', buffered: false });
  } catch { loaf = null; }
  function markAt(ts, flag) { for (let k = 0; k < Math.min(R.n, 8); k += 1) { const i = (R.i - 1 - k + N) % N; if (R.t[i] - R.dt[i] <= ts + 1) { R.flags[i] |= flag; return; } } }

  // ---------- the page around the game changing (a game window should change nothing but its canvas) ----------
  let mo = null;
  try {
    mo = new MutationObserver((recs) => { if (!S.on) return; let n = 0; for (const r of recs) if (!chipEl || (r.target !== chipEl && !chipEl.contains(r.target))) n += 1; S.mutations += n; });
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
  } catch { mo = null; }

  // ---------- the chip ----------
  let chip = false; let chipEl = null; let g = null; let textAt = 0; let lines = ['', '', ''];
  const CW = 260; const CH = 112;
  function chipOn(on) {
    chip = on == null ? !chip : Boolean(on);
    if (chip && !chipEl) {
      chipEl = document.createElement('canvas');
      const k = W.devicePixelRatio || 1;
      chipEl.width = CW * k; chipEl.height = CH * k;
      chipEl.style.cssText = `position:fixed;top:8px;right:8px;width:${CW}px;height:${CH}px;z-index:2147483647;pointer-events:none;border-radius:6px;will-change:transform`;
      chipEl.dataset.gameperf = 'chip';
      g = chipEl.getContext('2d'); g.scale(k, k);
    }
    if (chip) { (document.body || document.documentElement).append(chipEl); textAt = 0; } else chipEl?.remove();
    return chip;
  }
  const COL = [[F_GC, '#b98cff'], [F_SH, '#ff9a3c'], [F_TX, '#4aa3ff'], [F_LONG, '#ff4d5e'], [F_LAY, '#ffd84a']];
  function drawChip(ts) {
    const t0 = now();
    const budget = 1000 / (O.hz || 60);
    if (ts - textAt > 250) { textAt = ts; lines = chipText(budget); }
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(12,12,16,0.78)'; g.fillRect(0, 0, CW, CH);
    g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#e8e8ee';
    g.fillText(lines[0], 6, 14); g.fillStyle = '#a9a9b8'; g.fillText(lines[1], 6, 28); g.fillText(lines[2], 6, 42);
    // the last 2 s: one bar per frame, height = frame time (top = 3 budgets), the refresh line at one budget
    const gy = 50; const gh = CH - gy - 4; const span = 2000; const left = ts - span;
    const y = (ms) => gy + gh - Math.min(gh, (ms / (budget * 3)) * gh);
    g.strokeStyle = 'rgba(120,255,160,0.8)'; g.beginPath(); g.moveTo(0, y(budget) + 0.5); g.lineTo(CW, y(budget) + 0.5); g.stroke();
    for (let k = 0; k < R.n; k += 1) {
      const i = (R.i - 1 - k + N) % N;
      const t = R.t[i]; if (t < left) break;
      const x = ((t - R.dt[i] - left) / span) * CW; const w = Math.max(1, (R.dt[i] / span) * CW - 0.5);
      const fl = R.flags[i]; let c = R.dt[i] > budget * 1.5 ? '#ff6b6b' : '#7fd1ff';
      for (const [f, cc] of COL) if (fl & f) { c = cc; break; }
      g.fillStyle = c; const yy = y(R.dt[i]); g.fillRect(x, yy, w, gy + gh - yy);
      if (fl & (F_GC | F_SH | F_TX | F_LONG | F_LAY)) { g.fillRect(x, gy - 3, Math.max(2, w), 2); }
    }
    const e = now() - t0; S.chipMs = (S.chipMs || 0) + e; CHIP[(S.chipN || 0) % 256] = e; S.chipN = (S.chipN || 0) + 1;
  }
  function chipText(budget) {
    let n = 0; let sum = 0; let worst = 0; const until = (R.t[(R.i - 1 + N) % N] || 0) - 500;
    for (let k = 0; k < R.n; k += 1) { const i = (R.i - 1 - k + N) % N; if (R.t[i] < until) break; n += 1; sum += R.dt[i]; worst = Math.max(worst, R.dt[i]); }
    const fps = n ? Math.round((n * 1000) / sum) : 0;
    const info = infoNow();
    const st = S.lastStutter && (R.t[(R.i - 1 + N) % N] - S.lastStutter.at) < 5000 ? ` · last: ${S.lastStutter.cause} ${Math.round(S.lastStutter.ms)} ms` : '';
    return [
      `${fps} fps · ${n ? (sum / n).toFixed(1) : '–'} ms (worst ${worst.toFixed(1)}) · ${O.hz || 60} Hz = ${budget.toFixed(1)} ms`,
      info ? `${fmt(info.calls)} calls · ${fmt(info.tris)} tris · ${info.programs} prog · ${info.textures} tex · ${info.geometries} geo` : 'three.js renderer not found yet',
      info ? `GPU ≈ ${Math.round(info.gpuMB)} MB${st}` : st.slice(3),
    ];
  }
  const fmt = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : String(x));
  let infoCache = null; let infoAt = 0;
  function infoNow() {
    if (!renderers.size) return null;
    if (infoCache && now() - infoAt < 1000) { infoCache.calls = S.calls || infoCache.calls; infoCache.tris = S.tris || infoCache.tris; return infoCache; }
    let programs = 0; let textures = 0; let geometries = 0;
    for (const r of renderers) { const i = r.info; if (!i) continue; programs += i.programs?.length || 0; textures += i.memory?.textures || 0; geometries += i.memory?.geometries || 0; }
    const sc = sceneInfo(true);
    infoCache = { calls: S.calls || 0, tris: S.tris || 0, programs, textures, geometries, gpuMB: sc.texMB + sc.geoMB + sc.bufMB };
    infoAt = now();
    return infoCache;
  }

  // ---------- the scene, looked at once (report, the chip every second while shown) ----------
  function sceneInfo(light) {
    const out = { meshes: 0, transparent: 0, lights: 0, texMB: 0, geoMB: 0, bufMB: 0, instancing: [], merge: [], textures: [], post: false, shadows: null };
    const geo = new Set(); const tex = new Map(); const groups = new Map(); const byMat = new Map();
    const shadowLights = []; let casters = 0;
    const seenScenes = new Set();
    const list = [...scenes.values()];
    for (const s of lonelyScenes) if (![...scenes.values()].some((e) => e.scene === s)) list.push({ scene: s });
    for (const e of list) {
      const sc = e.scene; if (!sc || seenScenes.has(sc) || typeof sc.traverse !== 'function') continue;
      seenScenes.add(sc);
      sc.traverse((o) => {
        if (o.isLight) { out.lights += 1; if (o.castShadow && o.shadow) shadowLights.push(o); return; }
        if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
        out.meshes += 1;
        if (o.castShadow) casters += 1;
        const g0 = o.geometry; if (g0 && !geo.has(g0)) { geo.add(g0); for (const a of Object.values(g0.attributes || {})) out.geoMB += (a.array?.byteLength || 0) / 1048576; if (g0.index) out.geoMB += (g0.index.array?.byteLength || 0) / 1048576; }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.transparent && o.visible) out.transparent += 1;
          if (!light) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'envMap', 'bumpMap', 'displacementMap', 'lightMap', 'specularMap']) { const t = m[k]; if (t?.isTexture && !tex.has(t)) tex.set(t, k); }
          else for (const k of ['map', 'normalMap', 'roughnessMap', 'envMap']) { const t = m[k]; if (t?.isTexture && !tex.has(t)) tex.set(t, k); }
        }
        if (!light && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.visible && g0 && mats.length === 1 && mats[0]) {
          const k = `${g0.uuid}|${mats[0].uuid}`; const gr = groups.get(k) || { n: 0, name: o.name || g0.type || '', mat: mats[0].type, layer: e.layer ?? null }; gr.n += 1; groups.set(k, gr);
          const km = mats[0].uuid; const gm = byMat.get(km) || { n: 0, mat: mats[0].type, name: mats[0].name || '' }; gm.n += 1; byMat.set(km, gm);
        }
      });
    }
    for (const [t, slot] of tex) {
      const im = t.image || t.source?.data; const w = im?.videoWidth || im?.naturalWidth || im?.width || 0; const h = im?.videoHeight || im?.naturalHeight || im?.height || 0;
      const b = w * h * (t.isCompressedTexture ? 1 : 4) * (t.generateMipmaps === false ? 1 : 1.33) * (t.isCubeTexture || Array.isArray(t.image) ? 6 : 1);
      out.texMB += b / 1048576;
      if (!light) out.textures.push({ w, h, name: t.name || slot, aniso: t.anisotropy || 1 });
    }
    for (const r of renderers) { const c = r.domElement; if (c) out.bufMB += (c.width * c.height * 4 * 3) / 1048576; }
    out.texMB = Math.round(out.texMB); out.geoMB = Math.round(out.geoMB * 10) / 10; out.bufMB = Math.round(out.bufMB);
    if (light) return out;
    out.instancing = [...groups.values()].filter((x) => x.n >= 10).sort((a, b) => b.n - a.n).slice(0, 5);
    out.merge = [...byMat.values()].filter((x) => x.n >= 20).sort((a, b) => b.n - a.n).slice(0, 3);
    out.textures = out.textures.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 12);
    // the main renderer: the one that draws the most
    let main = null; let most = -1;
    for (const r of renderers) { const c = (r.info?.render?.calls || 0) + (r.domElement?.width || 0) / 1e4; if (c > most) { most = c; main = r; } }
    if (main) {
      const gl = main.getContext?.();
      const attrs = gl?.getContextAttributes?.() || {};
      const c = main.domElement;
      out.pr = Math.round((main.__basePR ?? main.getPixelRatio?.() ?? 1) * 100) / 100;
      out.prNow = Math.round((main.getPixelRatio?.() ?? 1) * 100) / 100;
      out.dpr = W.devicePixelRatio || 1;
      out.layer = main.__layer ?? scenes.get(main)?.layer ?? null;
      out.buffer = [c?.width || 0, c?.height || 0];
      out.screen = [screen.width, screen.height];
      out.aa = Boolean(attrs.antialias);
      out.toneMapping = main.toneMapping ?? null;
      out.colorSpace = main.outputColorSpace ?? (main.outputEncoding === 3001 ? 'srgb' : main.outputEncoding != null ? 'linear' : null);
      const sm = main.shadowMap;
      if (sm) out.shadows = { enabled: Boolean(sm.enabled), type: sm.type, everyFrame: Boolean(sm.enabled && sm.autoUpdate !== false && !sm.__gate?.on), casters, lights: shadowLights.slice(0, 6).map((l) => ({ type: l.type, size: l.shadow.mapSize?.x || 512 })) };
      const maxA = main.capabilities?.getMaxAnisotropy?.() || 1;
      out.aniso = { max: maxA, low: out.textures.filter((t) => t.aniso < maxA).length };
      out.programs = main.info?.programs?.length || 0;
      out.calls = S.calls || main.info?.render?.calls || 0; out.tris = S.tris || main.info?.render?.triangles || 0;
    }
    out.renderers = renderers.size;
    return out;
  }
  // whether lights / shadow casters move: their world matrices now vs a moment ago
  function motion() {
    const sig = (pick) => { let a = 0; for (const e of scenes.values()) e.scene?.traverse?.((o) => { if (pick(o)) { const m = o.matrixWorld.elements; a += m[12] * 1.3 + m[13] * 1.7 + m[14] * 2.3 + m[0] + m[5] * 1.1 + m[10] * 1.9 + m[1] * 0.7; } }); return a; };
    return { l: sig((o) => o.isLight && o.castShadow), c: sig((o) => o.castShadow && !o.isLight) };
  }
  let mot0 = null; let mot0At = 0;
  const motT = setInterval(() => { if (S.on && !mot0 && scenes.size) { mot0 = motion(); mot0At = now(); } }, 700);

  // ---------- live tries (the owner's click; nothing saved) ----------
  const undoLive = [];
  function tryLive(o = {}) {
    const done = [];
    for (const r of renderers) {
      if (o.pr != null) { const was = r.getPixelRatio(); r.setPixelRatio(o.pr); undoLive.push(() => r.setPixelRatio(was)); done.push('pr'); }
      if (o.tone) { const was = r.toneMapping; r.toneMapping = 4; undoLive.push(() => { r.toneMapping = was; }); done.push('tone'); }
      if (o.color) { const was = r.outputColorSpace; if (was !== undefined) { r.outputColorSpace = 'srgb'; undoLive.push(() => { r.outputColorSpace = was; }); done.push('color'); } }
      if (o.shadowType != null && r.shadowMap) { const was = r.shadowMap.type; r.shadowMap.type = o.shadowType; r.shadowMap.needsUpdate = true; undoLive.push(() => { r.shadowMap.type = was; r.shadowMap.needsUpdate = true; }); done.push('shadowType'); }
    }
    if (o.aniso || o.shadowSize || o.tone || o.color || o.shadowType != null) {
      for (const e of scenes.values()) e.scene?.traverse?.((obj) => {
        if (o.shadowSize && obj.isLight && obj.castShadow && obj.shadow && obj.shadow.mapSize.x < o.shadowSize) { const was = obj.shadow.mapSize.x; obj.shadow.mapSize.set(o.shadowSize, o.shadowSize); obj.shadow.map?.dispose(); obj.shadow.map = null; undoLive.push(() => { obj.shadow.mapSize.set(was, was); obj.shadow.map?.dispose(); obj.shadow.map = null; }); }
        const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        for (const m of mats) {
          if (o.tone || o.color || o.shadowType != null) m.needsUpdate = true;
          if (o.aniso) for (const k of ['map', 'normalMap', 'roughnessMap']) { const t = m[k]; if (t?.isTexture && t.anisotropy < o.aniso) { const was = t.anisotropy; t.anisotropy = o.aniso; t.needsUpdate = true; undoLive.push(() => { t.anisotropy = was; t.needsUpdate = true; }); } }
        }
      });
      if (o.aniso) done.push('aniso'); if (o.shadowSize) done.push('shadowSize');
    }
    return done;
  }
  function undoAll() { let n = 0; while (undoLive.length) { try { undoLive.pop()(); n += 1; } catch { /* gone */ } } return n; }

  // ---------- the session ----------
  function start() {
    S.t0 = now(); S.frames = 0; S.sumDt = 0; S.slow = []; S.bytes = 0; S.gcs = 0; S.self = 0; S.selfN = 0; S.layoutMs = 0; S.mutations = 0; S.chipMs = 0; S.chipN = 0;
    S.shaders = { n: 0, ms: 0, late: [] }; S.textures = { n: 0, ms: 0, mb: 0, late: [] }; S.long = []; S.lastStutter = null; S.on = true;
    R.n = 0; R.i = 0; mot0 = null; heapAt = 0; S.heap = 0; return true;
  }
  function report() {
    discover();
    const n = Math.min(R.n, S.frames);
    const dts = []; const works = []; const renders = [];
    for (let k = n - 1; k >= 0; k -= 1) { const i = (R.i - 1 - k + N) % N; dts.push(r1(R.dt[i])); works.push(r1(R.work[i])); renders.push(r1(R.render[i])); }
    const sc = sceneInfo(false);
    if (sc.shadows && mot0) { const m = motion(); sc.shadows.lightsMove = Math.abs(m.l - mot0.l) > 1e-6; sc.shadows.castersMove = Math.abs(m.c - mot0.c) > 1e-6; sc.shadows.watchedMs = Math.round(now() - mot0At); }
    return {
      v: 1, label: O.label, hz: O.hz || 0, dur: Math.round(S.sumDt), frames: S.frames, dts, works, renders,
      slow: S.slow.map(({ at, ...f }) => f),
      alloc: { bytes: S.bytes, gcs: S.gcs, precise: hasMem },
      shaders: { n: S.shaders.n, ms: Math.round(S.shaders.ms), late: S.shaders.late.slice(0, 30) },
      textures: { n: S.textures.n, ms: Math.round(S.textures.ms), mb: Math.round(S.textures.mb), late: S.textures.late.slice(0, 30) },
      long: S.long.slice(0, 40), layout: { ms: Math.round(S.layoutMs), mutations: S.mutations },
      scene: sc, self: { perFrameUs: Math.round(med(SELF, S.selfN) * 10000) / 10, chipUs: Math.round(med(CHIP, S.chipN || 0) * 1000), chip, inDom: Boolean(chipEl?.isConnected) },
    };
  }
  function detach() {
    alive = false; S.on = false; chipOn(false);
    clearInterval(discT); clearInterval(motT);
    try { loaf?.disconnect(); mo?.disconnect(); } catch { /* fine */ }
    if (W.requestAnimationFrame === wrapRAF) W.requestAnimationFrame = RAF;
    for (const [P, m, f] of glOrig) if (P[m]?.__gp === f) P[m] = f;
    for (const r of renderers) { if (r.render?.__gp) r.render = r.render.__gp; if (r.setAnimationLoop?.__gp) r.setAnimationLoop = r.setAnimationLoop.__gp; }
    undoAll(); delete W.__gamePerf; return true;
  }
  // F toggles the chip in a ▶ Play window (not in the Lab preview, where F may be the scene's own key)
  const onKey = (e) => {
    if (!O.key || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'f' && e.key !== 'F')) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    chipOn();
  };
  addEventListener('keydown', onKey, true);

  const api = {
    version: 1, chip: chipOn, start, report, detach, tryLive, undoLive: undoAll, use: (o = {}) => { track(o.renderer, o.scene, o.camera, o.layer); return true; },
    setOpts: (o) => { Object.assign(O, o); if (o.attribute) { try { attributeFn = new Function(`return (${o.attribute})`)(); } catch { /* fine */ } } if (o.chip != null) chipOn(o.chip); },
    state: () => ({ on: S.on, frames: S.frames, renderers: renderers.size, chip, hz: O.hz }),
    // dev/checks/gameperf.js: what measuring costs per frame, run n times in a row (no scheduling noise: a busy test
    // computer pre-empts real frames); the session starts again afterwards
    bench: (n = 2000) => {
      const noop = () => 0; let best = Infinity; let ts = lastTs > 0 ? lastTs : now();
      for (let run = 0; run < 5; run += 1) {
        const t0 = now();
        for (let k = 0; k < n; k += 1) { ts += 4.17; const a = now(); frameOf(ts); const b = now(); S.self += b - a; cur.self += b - a; try { noop(ts); } finally { const t1 = now(); cur.work += t1 - b; S.self += now() - t1; } }
        best = Math.min(best, ((now() - t0) / n) * 1000);
      }
      start(); lastTs = -1; cur.ts = -1; heapAt = 0; S.heap = 0;
      return Math.round(best * 100) / 100;
    },
    // what the probe costs per frame, hidden and shown (real frames: noisy on a busy computer)
    cost: () => ({ perFrameUs: med(SELF, S.selfN) * 1000, meanUs: S.selfN ? (S.self / S.selfN) * 1000 : 0, chipUs: med(CHIP, S.chipN || 0) * 1000, frames: S.frames, inDom: Boolean(chipEl?.isConnected) }),
  };
  W.__gamePerf = api;
  // the game's own opt-in (the ▶ Play window API): hearthPerf.use({ renderer, scene, camera })
  if (!W.hearthPerf) W.hearthPerf = { use: api.use };
  if (O.chip) chipOn(true);
  return api.version;
};
if (typeof module !== 'undefined') module.exports = GamePerfProbe;
