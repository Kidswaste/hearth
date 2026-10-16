// ▶ Play (round 52, gamemode), the pure part: no DOM, no Electron (gamemodemain.js requires it, the window loads it with
// the lazy group "gamemode", dev/gamemode-test.js checks it in Node). The shared shapes are in tools/game-api.md.
//   source(x)            a source descriptor { kind: 'lab' | 'html', id | path, title } from what the caller has
//   mergePlan(layers)    which Lab layers share ONE canvas / WebGL context in the game window, and why the others can't
//   route(scene)         'page' (the scene built as a standalone page, no Hearth in the loop) or 'live' (the Lab drives
//                        it through the Stage window), with the reason
//   pickDisplay(list, want)  the screen to play on: the one picked, else the biggest (then the fastest refresh)
//   fidelity(display)    "Max": the screen's own pixel ratio, antialias (MSAA), the fast GPU, no fps cap, its refresh
//   safePath(root, p)    a path inside the game's folder (the hearth-game: protocol never serves anything outside it)
//   remember(list, src)  the recent games, newest first (the last one is "Play <title>" next time)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
  function source(x) {
    if (!x) return null;
    if (typeof x === 'string') {
      const s = x.trim();
      if (/\.html?$/i.test(s) || /[\\/]/.test(s)) return source({ kind: 'html', path: s });
      return source({ kind: 'lab', id: s });
    }
    const kind = x.kind === 'html' || (!x.kind && x.path) ? 'html' : 'lab';
    if (kind === 'html') {
      const p = String(x.path || '');
      if (!p) return null;
      const title = x.title || base(p).replace(/\.html?$/i, '') || base(p.replace(/[\\/](index\.html?)?$/i, '')) || 'Game';
      return { kind, path: p, title: /^index$/i.test(title) ? base(p.replace(/[\\/]index\.html?$/i, '')) || 'Game' : title };
    }
    if (!x.id) return null;
    return { kind, id: String(x.id), title: x.title || 'Lab scene' };
  }
  const sameSource = (a, b) => Boolean(a && b && a.kind === b.kind && (a.kind === 'lab' ? a.id === b.id : a.path === b.path));
  function remember(list, src, max = 6) {
    const s = source(src);
    if (!s) return (list || []).slice(0, max);
    return [{ ...s, at: Date.now() }, ...(list || []).filter((x) => !sameSource(x, s))].slice(0, max);
  }

  // ---------- one canvas ----------
  // Bottom first (the Lab's order). A layer merges when it draws with its own three.js renderer straight to the
  // screen, plainly: normal blend, full opacity, not moved / scaled / turned, no keyframes, shown the whole time, no
  // crop / mask / soft edge, not a filter (filters read the picture below), no post-processing or render targets of its
  // own, not a precomp. The merged ones are the bottom run of such layers (a layer that keeps its own canvas sits on
  // top of them, so every layer above it keeps its own too, to keep the order). Hidden layers don't count.
  const HELPERS = /\b(motion|lab3d)\s*[.?[]|\b(visualizer|shapeLayer|particles|physics|typeLayer|kinetic)\s*\(/;
  const OWN_GL = /EffectComposer|RenderTarget\b|setRenderTarget|readRenderTargetPixels|copyFramebufferToTexture|preserveDrawingBuffer|\.getContext\s*\(|forceContextLoss/;
  const LOOK_KEYS = ['cropT', 'cropR', 'cropB', 'cropL', 'feather', 'blur', 'mask', 'bright', 'look'];
  function whyNot(L) {
    const code = String(L.code || '');
    if (L.precomp || L.card || L.pcOf) return 'a scene inside a scene';
    if (/\bfilter\s*\(/.test(code)) return 'a filter (it reads the layers below)';
    if (HELPERS.test(code)) return 'drawn by a Lab helper with its own canvas';
    if (!/new\s+(THREE\.)?WebGLRenderer\b/.test(code)) return 'draws without a three.js renderer of its own';
    if (OWN_GL.test(code)) return 'post-processing / its own GPU passes';
    if ((L.opacity ?? 1) !== 1) return 'see-through (opacity)';
    if ((L.blend || 'normal') !== 'normal') return `blend mode ${L.blend}`;
    if (L.x || L.y || (L.scale ?? 1) !== 1 || L.rotate) return 'moved, scaled or turned';
    if (L.keys && Object.values(L.keys).some((k) => Array.isArray(k) && k.length)) return 'animated by keyframes';
    if (L.in != null || L.out != null || L.fadeIn || L.fadeOut) return 'shows only part of the time';
    if (LOOK_KEYS.some((k) => L[k])) return 'cropped, masked or with effects';
    return '';
  }
  function mergePlan(layers) {
    const merge = []; const why = {}; let open = true;
    for (const L of layers || []) {
      if (!L || !L.id) continue;
      if (L.visible === false) { why[L.id] = 'hidden'; continue; }
      const r = whyNot(L);
      if (open && !r) { merge.push(L.id); continue; }
      why[L.id] = r || 'above a layer that keeps its own canvas';
      open = false;
    }
    // one layer alone: it is one canvas already (merged or not); say "merged" only when it saves something
    return { merge, why, contexts: (merge.length ? 1 : 0) + Object.entries(why).filter(([, w]) => w !== 'hidden').length };
  }
  // ---------- page or live ----------
  // The page (the scene built as a self-contained page, like ⇪ Publish, run in the game window) has the fewest moving
  // parts: no hub relaying anything, the song in the page. Live (the Lab drives the Stage window) only when the scene
  // needs the Lab while it plays: the camera, MIDI, the live sound, other scenes inside it.
  function route(scene) {
    const layers = scene?.layers || [];
    if (!layers.length) return { route: 'live', why: 'no layers with code' };
    if (layers.some((L) => L.precomp || L.card)) return { route: 'live', why: 'it has scenes inside it' };
    const code = layers.map((L) => String(L.code || '')).join('\n');
    if (/\bwebcam\s*[.?[]|\bcamIn\b|\bmotionIn\b/.test(code)) return { route: 'live', why: 'it uses the camera' };
    if (/\bmidi\b/i.test(code)) return { route: 'live', why: 'it listens to MIDI' };
    if (scene.live) return { route: 'live', why: 'it plays the live sound' };
    return { route: 'page', why: 'a standalone page: fewest moving parts' };
  }
  // ---------- screens ----------
  // list: [{ id, w, h (pixels), hz, scale, primary }]
  function pickDisplay(list, want) {
    const all = (list || []).filter(Boolean);
    if (!all.length) return null;
    const hit = want != null ? all.find((d) => String(d.id) === String(want)) : null;
    if (hit) return hit;
    return all.slice().sort((a, b) => (b.w * b.h - a.w * a.h) || ((b.hz || 0) - (a.hz || 0)) || (b.primary - a.primary))[0];
  }
  function fidelity(d) {
    return { level: 'max', pixelRatio: Number(d?.scale) || 1, antialias: true, msaa: true, powerPreference: 'high-performance', cap: 0, adapt: false, hz: Number(d?.hz) || 60 };
  }
  const hzLabel = (hz) => `${Math.round(Number(hz) || 60)} Hz`;
  // ---------- the protocol's files ----------
  function safePath(rootDir, urlPath, sep = '/') {
    let p;
    try { p = decodeURIComponent(String(urlPath || '').split(/[?#]/)[0]); } catch { return null; }
    if (/\0/.test(p)) return null;
    const parts = [];
    for (const seg of p.split(/[\\/]+/)) {
      if (!seg || seg === '.') continue;
      if (seg === '..' || /^[a-zA-Z]:$/.test(seg)) return null;
      parts.push(seg);
    }
    const r = String(rootDir).replace(/[\\/]+$/, '');
    return parts.length ? `${r}${sep}${parts.join(sep)}` : r;
  }
  const MIME = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', wasm: 'application/wasm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ktx2: 'image/ktx2', hdr: 'application/octet-stream', exr: 'application/octet-stream', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8' };
  const mimeOf = (p) => MIME[String(p).toLowerCase().split('.').pop()] || 'application/octet-stream';
  // the stats chip's line: "143 fps · 6.9 ms · 240 Hz · one canvas (3 layers)"
  function chipLine(s) {
    const parts = [`${Math.round(s.fps || 0)} fps`, `${(s.ms || 0).toFixed(1)} ms`];
    if (s.hz) parts.push(hzLabel(s.hz));
    if (s.how) parts.push(s.how);
    return parts.join(' · ');
  }
  return { source, sameSource, remember, mergePlan, whyNot, route, pickDisplay, fidelity, hzLabel, safePath, mimeOf, chipLine };
}));
