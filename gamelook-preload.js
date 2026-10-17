// ▶ Play's look (round 54, gamelook): the game at its best on this screen, without touching what the game chose and
// without costing smoothness. A second preload of the game window's session (persist:hearth-game, registered by
// gamemodemain.js), sandboxed like game-preload.js: it puts gameLookPage() in the game's own world before its scripts.
// What it does, through three.js's own devtools hook (each renderer and scene it makes), before any texture is uploaded
// or any shader compiled (it runs ahead of render / compile / compileAsync / initTexture), and again when new ones come:
//   - textures: the graphics card's best anisotropy (sharp at grazing angles) on every mipmapped texture the game left
//     at 1, also the ones it loads later (Texture.DEFAULT_ANISOTROPY, when the game left it at 1). Both looks.
//   - (Best) colour pictures in their real colour space: a picture in a colour slot (map, emissive, specular colour, sheen
//     colour, an LDR background / environment) that the game left with no colour space is sRGB (three.js otherwise
//     reads it as linear: washed-out colours). Only with three.js's colour management on (outputColorSpace 'srgb').
//   - (Best) shadow maps matched to the screen: a light the game left at three.js's 512² gets the screen's size (its
//     long edge in pixels, nearest power of two, 1024–2048; point lights half, at most 1024: six faces). The game's own filter and
//     softness are kept (three.js r182+ PCF is already soft: 5 taps, the game's radius).
//   - (Best) a smoothness guard: once the game plays, if frames miss the screen's refresh, the shadow maps step down
//     toward the game's own size while that measurably helps (≥ 8 % per step); if it doesn't, they go back up (not the
//     cost). Nothing else is changed while playing.
// Never changed: the game's tone mapping, output colour space, shadow type / radius, pixel ratio, any value it set itself
// (a game's later write always wins: Hearth decides once per texture / light, at first sight).
// Wide colour / HDR: the screen's support is reported (doctor); three.js renders sRGB-mastered colours, which the system
// already shows exactly on a P3 / XDR / HDR screen, so nothing is converted (that would only re-tint the game).
// window.__gameLook = { report(), text(), settle(), renderers() } (tools/game-api.md).
function gameLookPage(o) {
  if (window.__gameLook || !o || o.look === 'off') return;
  const BEST = o.look !== 'balanced';
  const HZ = Number(o.hz) || 60;
  const realRAF = window.requestAnimationFrame.bind(window); const realTimeout = window.setTimeout.bind(window);
  const now = () => performance.now();
  const wait = (ms) => new Promise((r) => realTimeout(r, ms));
  const COLOUR = ['map', 'emissiveMap', 'specularColorMap', 'sheenColorMap'];
  const SLOTS = [...COLOUR, 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'displacementMap', 'alphaMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'sheenRoughnessMap', 'specularIntensityMap', 'specularMap', 'transmissionMap', 'thicknessMap', 'anisotropyMap', 'gradientMap', 'matcap'];
  const mm = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const dpr = window.devicePixelRatio || 1;
  const R = { look: BEST ? 'best' : 'balanced', three: null, renderers: 0, frames: 0,
    aniso: { max: 0, sharp: 0, set: 0, kept: 0, later: false }, colour: 0,
    shadows: { lights: 0, set: 0, kept: 0, from: 0, to: 0, now: 0 }, guard: BEST ? 'waiting' : 'off', guardMs: null,
    cost: { sweeps: 0, ms: 0, max: 0, playMax: 0, wholes: 0 }, // (playMax: the most a frame after the first look spent here; wholes: whole-scene looks in one go)
    screen: { w: Math.round(screen.width * dpr), h: Math.round(screen.height * dpr), wide: mm('(color-gamut: p3)'), hdr: mm('(dynamic-range: high)') } };
  const rs = new Set(); const scenes = new Set();
  const state = new WeakMap(); // renderer → { at: WeakMap(scene → last look), n }
  const doneA = new WeakSet(); const doneC = new WeakSet(); const doneL = new WeakSet();
  const raised = []; // { sh, point, set }
  let TexC = null; let target = 0; let guarding = null;
  // (round 55, playbudget) the main-thread time its hooks spend (ms, running total: tools/playbudget-page.js reads it
  // once a second), stepped aside for the budget's A/B (PAUSE) or switched off for this game (OFF)
  let SP = 0; let PAUSE = false; let OFF = null; const undo = [];

  const maxA = (r) => { let m = 1; try { m = r.capabilities.getMaxAnisotropy() || 1; } catch (e) { /* no extension */ } if (m > R.aniso.max) R.aniso.max = m; return m; };
  const uploaded = (r, t) => { try { const p = r.properties && r.properties.get ? r.properties.get(t) : null; return Boolean(p && p.__webglTexture); } catch (e) { return false; } };
  // three.js filters anisotropically only with mipmaps (LinearMipmapLinear / NearestMipmapLinear) and a smooth magFilter
  const mipped = (t) => t.magFilter !== 1003 && (t.minFilter === 1008 || t.minFilter === 1005) && (t.generateMipmaps !== false || (t.mipmaps && t.mipmaps.length > 1));
  // the game's Texture class: every texture made from now on at the best anisotropy, unless the game set its own default
  function klass(t, max) {
    let C = t.constructor;
    while (C && C !== Function.prototype && !Object.prototype.hasOwnProperty.call(C, 'DEFAULT_ANISOTROPY')) C = Object.getPrototypeOf(C);
    TexC = C && C.DEFAULT_ANISOTROPY !== undefined ? C : false;
    if (TexC && TexC.DEFAULT_ANISOTROPY === 1 && max > 1) { TexC.DEFAULT_ANISOTROPY = max; R.aniso.later = true; }
  }
  function tex(r, t, colour, max) {
    if (!t || !t.isTexture) return;
    if (TexC === null) klass(t, max);
    if (t.isRenderTargetTexture || t.isDepthTexture || t.isFramebufferTexture) return;
    if (BEST && colour && !doneC.has(t) && !t.isCubeTexture) {
      doneC.add(t);
      if (t.colorSpace === '' && t.type === 1009 && !t.isDataTexture && !t.isCompressedTexture && r.outputColorSpace === 'srgb') {
        t.colorSpace = 'srgb'; R.colour += 1;
        if (uploaded(r, t)) t.needsUpdate = true; // (one that came in between two looks: sent once more, in its real colours)
      }
    }
    if (doneA.has(t)) return;
    doneA.add(t);
    if (t.isVideoTexture || !mipped(t) || max <= 1) return;
    const a = t.anisotropy || 1;
    if (a >= max) { R.aniso.sharp += 1; return; }
    if (a !== 1) return; // the game's own (2, 4, 8…)
    if (uploaded(r, t)) { R.aniso.kept += 1; return; } // (on the GPU already: sending it again mid-play would hitch)
    t.anisotropy = max; R.aniso.set += 1; R.aniso.sharp += 1;
  }
  function mat(r, m, max) {
    for (let i = 0; i < SLOTS.length; i += 1) { const v = m[SLOTS[i]]; if (v) tex(r, v, i < COLOUR.length, max); }
    const u = m.uniforms;
    if (u) for (const k in u) { const v = u[k] && u[k].value; if (v && v.isTexture) tex(r, v, false, max); }
  }
  // ---------- shadows ----------
  // (round 54 fix) at most 2048² (a point light: 1024², it draws its six faces): past that the picture barely changes
  // (three's soft PCF blurs the texels away) while every shadow-casting light redraws the scene into a map four times
  // bigger (a 4K screen got a 4096² sun + spot and a 2048² point light: 58 M shadow texels drawn and cleared a frame)
  const CAP = 2048; const CAP_POINT = 1024;
  function shadowSize(r) {
    let maxTex = 4096; try { maxTex = r.capabilities.maxTextureSize || 4096; } catch (e) { /* fine */ }
    const long = Math.max(R.screen.w, R.screen.h) || 1024;
    return Math.min(CAP, maxTex, Math.max(1024, 2 ** Math.round(Math.log2(long))));
  }
  function setSize(x, s) {
    const sh = x.sh; const v = x.point ? Math.max(512, Math.min(CAP_POINT, s / 2)) : s;
    if (x.set && (sh.mapSize.x !== x.set || sh.mapSize.y !== x.set)) return; // the game changed it since: its choice
    if (sh.mapSize.x === v && sh.mapSize.y === v) return;
    sh.mapSize.set(v, v); x.set = v;
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    if (sh.mapPass) { sh.mapPass.dispose(); sh.mapPass = null; }
  }
  function light(r, L) {
    const sh = L.shadow;
    if (!sh || !sh.mapSize || doneL.has(sh)) return;
    doneL.add(sh); R.shadows.lights += 1;
    if (!BEST) return;
    if (sh.mapSize.x !== 512 || sh.mapSize.y !== 512) { R.shadows.kept += 1; return; } // the game chose its size
    if (!target) target = shadowSize(r);
    const size = R.shadows.now || target;
    const x = { sh, point: Boolean(L.isPointLight), set: 0 };
    raised.push(x); setSize(x, size);
    R.shadows.set += 1; R.shadows.from = 512; R.shadows.to = target; R.shadows.now = size;
  }
  // ---------- a look at a scene: all of it before its first frame; then what the game adds, before it's drawn; and a
  // slow walk in the background (≤ 0.15 ms a frame; a new walk every 2 s, or when textures came in) for a picture a
  // game puts on a material it had already. (round 54 fix: never a whole-scene sweep inside one frame while playing: at
  // 240 Hz a sweep once a second was a hitch a second, and a sweep every frame when a game makes textures as it plays)
  const visit = (r, ob, max) => {
    if (ob.isLight && ob.castShadow) light(r, ob);
    const m = ob.material;
    if (m) { if (Array.isArray(m)) { for (const x of m) if (x) mat(r, x, max); } else mat(r, m, max); }
  };
  const cost = (ms) => { R.cost.sweeps += 1; R.cost.ms += ms; if (ms > R.cost.max) R.cost.max = ms; };
  function sweep(r, root) {
    const t0 = now(); const max = maxA(r);
    try {
      if (root.isScene) { R.cost.wholes += 1; tex(r, root.background, true, max); tex(r, root.environment, true, max); }
      root.traverse((ob) => visit(r, ob, max));
    } catch (e) { /* a scene changing under us: the next look */ }
    cost(now() - t0);
  }
  // what the game adds (Object3D.add / attach of its own three.js, found from the first scene drawn)
  const adds = []; const protos = new WeakSet(); const doneO = new WeakSet();
  function hookAdd(scene) {
    const O3 = Object.getPrototypeOf(Object.getPrototypeOf(scene));
    if (!O3 || protos.has(O3) || typeof O3.add !== 'function') return;
    protos.add(O3);
    const add0 = O3.add;
    // (round 55, fixes55) the game's own add / attach always runs and returns; what Hearth notes can never throw into it
    O3.add = function add() { const res = add0.apply(this, arguments); try { if (!PAUSE && !OFF && adds.length < 4000) for (let i = 0; i < arguments.length; i += 1) { const o = arguments[i]; if (o && o !== this && o.isObject3D) adds.push(o); } } catch (e) { /* never in the game's way */ } return res; };
    const att0 = O3.attach;
    if (typeof att0 === 'function') O3.attach = function attach() { const res = att0.apply(this, arguments); try { const o = arguments[0]; if (!PAUSE && !OFF && o && o.isObject3D && adds.length < 4000) adds.push(o); } catch (e) { /* never in the game's way */ } return res; };
    undo.push([O3, 'add', O3.add, add0]); if (typeof att0 === 'function') undo.push([O3, 'attach', O3.attach, att0]);
  }
  function before(r, scene, force) {
    if (!scene || !scene.isObject3D) return;
    if (!scene.isScene) { if (!doneO.has(scene)) { doneO.add(scene); sweep(r, scene); } return; } // (compile(object, camera, scene))
    let k = state.get(r); if (!k) state.set(r, k = { at: new WeakMap(), n: -1, walk: null, f: 0 });
    const t = now(); const n = (r.info && r.info.memory && r.info.memory.textures) | 0;
    const last = k.at.get(scene);
    if (last === undefined || force) { // the first look: all of it, before anything is uploaded or compiled
      k.n = n; k.at.set(scene, t);
      hookAdd(scene); sweep(r, scene);
      if (BEST && raised.length && !guarding) guarding = guard();
      else if (R.guard === 'waiting' && !raised.length) R.guard = 'none';
      return;
    }
    if (adds.length) { // what the game added since, before its first frame (a bullet: a few µs; a level: its own size)
      const t0 = now(); const max = maxA(r);
      try { for (let i = 0; i < adds.length; i += 1) { const o = adds[i]; if (doneO.has(o)) continue; doneO.add(o); if (o.children.length) o.traverse((ob) => visit(r, ob, max)); else visit(r, o, max); } } catch (e) { /* fine */ }
      adds.length = 0; cost(now() - t0);
      if (BEST && raised.length && !guarding) guarding = guard();
    }
    k.f += 1; // (frames as well as seconds: on a slow frame rate the walk stays a small share of the frames)
    if (!k.walk && ((t - last >= 2000 && k.f >= 240) || (n !== k.n && t - last >= 1000 && k.f >= 120))) { k.f = 0; k.n = n; k.at.set(scene, t); k.walk = { scene, stack: [scene], bg: true }; }
    if (k.walk && k.walk.scene === scene) walk(r, k);
    const fd = now() - t; if (fd > R.cost.playMax) R.cost.playMax = +fd.toFixed(3);
  }
  function walk(r, k) {
    const w = k.walk; const t0 = now(); const max = maxA(r);
    try {
      if (w.bg) { w.bg = false; tex(r, w.scene.background, true, max); tex(r, w.scene.environment, true, max); }
      let i = 0;
      while (w.stack.length) {
        const ob = w.stack.pop(); visit(r, ob, max);
        const c = ob.children; for (let j = 0; j < c.length; j += 1) w.stack.push(c[j]);
        if ((++i & 31) === 0 && now() - t0 > 0.15) break;
      }
    } catch (e) { w.stack.length = 0; }
    if (!w.stack.length) k.walk = null;
    cost(now() - t0);
  }
  function hook(r) {
    if (!r || rs.has(r)) return;
    rs.add(r); R.renderers = rs.size;
    for (const m of ['render', 'compile', 'compileAsync']) {
      const base = r[m];
      if (typeof base !== 'function') continue;
      try {
        const w = r[m] = function (scene) {
          if (!PAUSE && !OFF) { const a = now(); try { before(this, scene); } catch (e) { /* never in the game's way */ } SP += now() - a; }
          try { if (m === 'render') R.frames += 1; } catch (e) { /* fine */ }
          return base.apply(this, arguments);
        };
        undo.push([r, m, w, base]);
      } catch (e) { /* a renderer the game froze: as it is */ }
    }
    // (GameReady sends a game's textures up before compiling: its scenes are looked at first, so colours are known)
    const it = r.initTexture;
    if (typeof it === 'function') try { const w = r.initTexture = function (t) { if (!PAUSE && !OFF) { const a = now(); try { for (const sc of scenes) before(this, sc); tex(this, t, false, maxA(this)); } catch (e) { /* fine */ } SP += now() - a; } return it.apply(this, arguments); }; undo.push([r, 'initTexture', w, it]); } catch (e) { /* as it is */ }
  }
  // ---------- the guard: smooth first ----------
  function gaps(n) { // the median gap between frames the game drew (rAF), n of them (4 s at most)
    return new Promise((res) => {
      const g = []; let last = 0; let f0 = R.frames; const t0 = now();
      const f = (t) => {
        if (last && R.frames !== f0) g.push(t - last);
        f0 = R.frames; last = t;
        if (g.length >= n || now() - t0 > 4000) { g.sort((a, b) => a - b); res(g.length ? +g[g.length >> 1].toFixed(2) : null); } else realRAF(f);
      };
      realRAF(f);
    });
  }
  // (round 54 fix) quicker (60 frames a measurement: a quarter second at 240 Hz), and it keeps watching: every 5 s while
  // the shadows are above the game's own size, 60 frames; frames missing the refresh again (a heavier scene later) → a
  // step down, kept only if it helps. A size that didn't help is never tried again (a game with its own frame cap would
  // otherwise get its shadow maps made again every few seconds for nothing)
  const noGain = new Set();
  async function down(size, g, budget) {
    let verdict = 'not-shadows'; // (said once it's decided: settle() waits for it)
    while (size / 2 >= 512 && !noGain.has(size / 2)) {
      const next = size / 2;
      for (const x of raised) setSize(x, next);
      await wait(200);
      const g2 = await gaps(60);
      R.guardMs.steps.push([next, g2]);
      if (g2 == null || g2 > g * 0.92) { noGain.add(next); for (const x of raised) setSize(x, size); break; } // no real gain: the shadows weren't what's slow
      size = next; g = g2; verdict = 'lowered';
      if (g <= budget * 1.2) break;
    }
    return { size, verdict };
  }
  async function guard() {
    R.guard = 'measuring';
    // after GameReady's card (it holds the game's frames while it gets ready), then half a second of play
    for (let i = 0; i < 240; i += 1) { let ph = null; try { ph = window.__gameReady ? JSON.parse(window.__gameReady.pub()).phase : 'playing'; } catch (e) { ph = 'playing'; } if (ph === 'playing') break; await wait(250); }
    await wait(500);
    const budget = 1000 / HZ; const g = await gaps(60);
    R.guardMs = { budget: +budget.toFixed(2), steps: [[R.shadows.now, g]] };
    if (g == null || g <= budget * 1.2) R.guard = 'fits';
    else { const d = await down(R.shadows.now, g, budget); R.shadows.now = d.size; R.guard = d.verdict; }
    while (raised.length) { // the watch
      await wait(5000);
      if (R.shadows.now <= 512 || noGain.has(R.shadows.now / 2)) continue;
      const g2 = await gaps(60);
      if (g2 == null || g2 <= budget * 1.25) continue;
      if (R.guardMs.steps.length < 40) R.guardMs.steps.push([R.shadows.now, g2]);
      const d = await down(R.shadows.now, g2, budget);
      R.shadows.now = d.size; if (d.verdict === 'lowered') R.guard = 'lowered';
    }
  }
  // ---------- what was done, in plain words ----------
  function text() {
    if (OFF) return `${BEST ? 'Best' : 'Balanced'} look: turned off for this game (it was costing frames)`;
    const p = [];
    if (R.aniso.sharp) p.push(`textures ${R.aniso.max}× sharp (${R.aniso.sharp})`);
    if (BEST) {
      if (R.colour) p.push(`true colour on ${R.colour} picture${R.colour === 1 ? '' : 's'}`);
      if (R.shadows.set && R.shadows.now > R.shadows.from) p.push(`shadows ${R.shadows.from} → ${R.shadows.now}${R.guard === 'lowered' ? ' (lowered to stay smooth)' : ''}`);
      else if (R.shadows.set) p.push('shadows as the game sets them (bigger ones cost smoothness here)');
      else if (R.shadows.kept) p.push('shadows as the game sets them');
    } else p.push('shadows and colours as the game sets them');
    return `${BEST ? 'Best' : 'Balanced'} look: ${p.length ? p.join(' · ') : 'nothing to change (the game sets its own)'}`;
  }
  const settle = () => new Promise((res) => { const t0 = now(); const f = () => (R.guard === 'waiting' || R.guard === 'measuring') && now() - t0 < 30000 ? realTimeout(f, 200) : res(JSON.parse(JSON.stringify(R))); f(); });
  // ---------- three.js tells us its renderers and scenes ----------
  const dev = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());
  // (round 55, fixes55) three dispatches these from inside the game's own `new WebGLRenderer()` / scene: a throw here
  // would show as the game's error (and in GameReady's "why it didn't start")
  dev.addEventListener('register', (e) => { try { const v = e.detail && e.detail.revision; if (v) R.three = String(v); } catch (er) { /* fine */ } });
  dev.addEventListener('observe', (e) => {
    try {
      const d = e.detail;
      if (d && d.isWebGLRenderer) hook(d);
      else if (d && d.isScene) { scenes.add(d); if (scenes.size > 32) scenes.delete(scenes.values().next().value); }
    } catch (er) { /* the game plays as it is */ }
  });
  Object.defineProperty(window, '__gameLook', { configurable: true, value: Object.freeze({
    report: () => { if (!R.three && window.__THREE__) R.three = String(window.__THREE__); return JSON.parse(JSON.stringify(R)); },
    text, settle, renderers: () => [...rs],
    // (round 55, playbudget) tools/playbudget-page.js: its time, the A/B's step aside, the picture (shadow maps) on / at
    // the game's own size for the A/B's graphics measure, and off for this game (hooks out of the way, shadows back)
    budget: Object.freeze({
      spent: () => SP,
      pause: (on) => { PAUSE = Boolean(on); if (PAUSE) adds.length = 0; },
      picture: (on) => { if (OFF || !raised.length || !R.shadows.now || R.shadows.now <= 512) return false; for (const x of raised) setSize(x, on ? R.shadows.now : 512); return true; },
      off: (by) => {
        if (OFF) return false;
        OFF = String(by || 'asked'); R.off = OFF; adds.length = 0;
        for (const x of raised) setSize(x, 512); // (the game's own size: the guard stops with them)
        raised.length = 0; R.guard = 'off'; R.shadows.now = 512;
        for (const [o, m, w, base] of undo) { try { if (o[m] === w) o[m] = base; } catch (e) { /* the game's own wrapper on top: ours steps aside */ } }
        return true;
      },
    }),
  }) });
}

if (typeof module === 'object' && module.exports && typeof process === 'object' && process.type !== 'renderer') module.exports = { gameLookPage };
else {
  try {
    const { contextBridge, webFrame } = require('electron');
    const arg = (process.argv || []).find((a) => a.startsWith('--hearth-game='));
    let I = {}; try { I = JSON.parse(decodeURIComponent(arg ? arg.slice(14) : '%7B%7D')); } catch { I = {}; }
    const o = { look: I.look || 'best', hz: I.hz || 60 };
    if (o.look !== 'off') {
      try { if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: gameLookPage, args: [o] }); else throw new Error('old'); } catch { webFrame.executeJavaScript(`(${gameLookPage.toString()})(${JSON.stringify(o)})`); }
    }
  } catch { /* the game plays as it is */ }
}
