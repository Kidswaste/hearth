// ▶ Play, loads during play (round 54, gamestream): the part that runs INSIDE ▶ Play's game window, in the head of every
// page it serves (gamemodemain.js puts its tag right after GameReady's; the game's files are never changed). Getting
// ready (tools/gameready-page.js) prepares what a game loads at the start; this is for what it loads LATER, while you
// play (a new level, a model, a 4K picture), so that doesn't freeze a frame:
//   pictures   a picture the game asks for during play (img.src = …: three's TextureLoader) is fetched and decoded into an
//              ImageBitmap off the main thread first; the <img> loads only once that's done (its load event comes a bit
//              later; img.src / img.complete / img.decode() answer as before), and when three uploads it, the WebGL
//              upload takes the decoded bitmap instead of decoding the picture on the main thread (only when the upload
//              is the usual kind: flipped, not premultiplied, no color conversion; anything else uploads as before)
//   objects    something added to a drawn scene during play (scene.add / attach: a model, a level) whose materials have
//              no shader yet is compiled at once without waiting (renderer.compile; with KHR_parallel_shader_compile the
//              graphics driver compiles in the background), and stays out of the picture until its shaders are ready
//              (at least 2 frames and until a fence says the graphics process is done, at most 1.5 s); its textures are uploaded one per frame meanwhile (initTexture), so
//              a model with five 2K textures costs five small frames instead of one long one. Only while drawing: the
//              game reading obj.visible never sees a change. (round 54 fix) What a game adds every frame (projectiles,
//              sparks, decals: materials of a kind already compiled, pictures already on the card) is left alone: no
//              compile, no hold, never hidden; a canvas / data / video texture the game rewrites is never re-sent here.
//   the log    what loaded during play (files, pictures, objects shown), with when and how it was smoothed, for the F
//              chip ("last: shader 84 ms · ship.glb") and the doctor ("ship.glb loaded mid-game at 5.0 s…"): the gameperf
//              probe reads window.__gameStream.report(t0) / near(a, b) / renderers().
// Query: off = 1 (Hearth's check "before", localStorage gamestream.test on the hub): the log only, nothing smoothed.
// window.__gameStream.pub() → JSON for checks.
(() => {
  if (window.__gameStream) return;
  const Q = new URLSearchParams((document.currentScript?.src || '').split('?')[1] || '');
  const now = () => performance.now();
  const S = { on: Q.get('off') !== '1', active: false, activeAt: null, firstDraw: null, parallel: null, loads: [],
    tick: 0, tickI: 0, images: { streamed: 0, used: 0, fallback: 0, small: 0, failed: 0, decodeMs: 0 }, slices: { textures: 0, strips: 0, done: 0 }, frameMs: 16.7, holds: { n: 0, released: 0, capped: 0, maxMs: 0, frames: 0 }, uploads: 0, compiles: 0 };
  // (round 55, playbudget) the main-thread time its hooks spend (ms, a running total: tools/playbudget-page.js reads it
  // once a second); a compile / upload it only does earlier than the game's own first draw would (MOVED) is the game's
  // work, not counted. S.paused: stepped aside for the budget's A/B; S.dead: switched off for this game
  // (round 60, gcchurn60) both in a Float64Array (T[0] = SP, T[1] = MOVED): a fractional number stored into a closure
  // variable is a new heap number each time, garbage every frame for the game's next minor GC
  const T = new Float64Array(2); const undo = [];
  const SMALL = 96 * 1024; // pictures under this decode fast enough where they are
  const CAP = 1500; const MIN_FRAMES = 2;
  const r1 = (x) => Math.round(x * 10) / 10;
  // playing: once Getting ready's card went (GameReady), or 1.5 s after the first frame (a page without it)
  function active() {
    if (S.active) return true;
    const gr = window.__gameReady;
    if (gr ? gr.phase === 'playing' : S.firstDraw != null && now() - S.firstDraw > 1500) { S.active = true; S.activeAt = now(); }
    return S.active;
  }

  // ---------- the log: what loads while playing ----------
  const nameOf = (url) => { try { const u = new URL(url, document.baseURI); if (u.protocol === 'data:') return 'an embedded picture'; if (u.protocol === 'blob:') return 'a picture made by the game'; return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname).slice(0, 48); } catch { return String(url).slice(0, 48); } };
  const kindOf = (name) => (/\.(glb|gltf|fbx|obj|stl|ply|drc|usdz?)$/i.test(name) ? 'model' : /\.(jpe?g|png|webp|avif|gif|ktx2?|basis|hdr|exr|dds|tga)$/i.test(name) ? 'picture' : /\.(mp3|ogg|wav|m4a|aac|flac|opus)$/i.test(name) ? 'sound' : /\.(bin)$/i.test(name) ? 'model data' : 'file');
  function note(kind, name) {
    const rec = { kind, name, t0: now(), t1: null, bytes: 0, smooth: '' };
    S.loads.push(rec); if (S.loads.length > 80) S.loads.shift();
    return rec;
  }
  let own = false; // (this script's own fetches aren't the game's)
  const fetch0 = window.fetch;
  if (fetch0) {
    const fw = window.fetch = function (input, init) {
      if (S.dead) return fetch0.call(this, input, init);
      const p = fetch0.call(this, input, init);
      // (round 55, fixes55) the log never throws into the game's fetch (an input whose String() throws, a header read)
      try {
        if (!own && active()) {
          const url = typeof input === 'string' ? input : input?.url || String(input);
          if (/^(blob|data):/i.test(url)) return p; // (a loader's own pieces: a model's pictures)
          const nm = nameOf(url); const rec = note(kindOf(nm), nm);
          p.then((r) => { rec.t1 = now(); try { rec.bytes = Number(r.headers.get('content-length')) || 0; } catch { /* fine */ } }, () => { rec.t1 = now(); rec.failed = true; });
        }
      } catch { /* the game's fetch, as it is */ }
      return p;
    };
    undo.push([window, 'fetch', fw, fetch0]);
  }
  const open0 = XMLHttpRequest.prototype.open; const send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...rest) { this.__gsUrl = url; return open0.call(this, m, url, ...rest); };
  XMLHttpRequest.prototype.send = function (...a) {
    try { if (!S.dead && active() && this.__gsUrl) { const nm = nameOf(String(this.__gsUrl)); const rec = note(kindOf(nm), nm); this.addEventListener('loadend', () => { rec.t1 = now(); try { rec.bytes = Number(this.getResponseHeader?.('content-length')) || 0; } catch { /* fine */ } }, { once: true }); } } catch { /* the game's request, as it is */ }
    return send0.apply(this, a);
  };

  // ---------- pictures: decoded off the main thread before the <img> loads ----------
  const IMG = HTMLImageElement.prototype;
  const srcD = Object.getOwnPropertyDescriptor(IMG, 'src');
  const compD = Object.getOwnPropertyDescriptor(IMG, 'complete');
  const decode0 = IMG.decode;
  const cib = window.createImageBitmap?.bind(window);
  const pend = new WeakMap(); // img → { raw, cancel, waiters } while its picture is fetched / decoded
  const shown = new WeakMap(); // img → the address the game set (its real src is then a blob: address of the same bytes)
  const bmps = new WeakMap(); // img → { bmp, w, h, rec }
  const abs = (raw) => { try { return new URL(raw, document.baseURI).href; } catch { return raw; } };
  function drop(img) { const b = bmps.get(img); if (b) { try { b.bmp.close(); } catch { /* fine */ } bmps.delete(img); } }
  function stream(img, raw, href) {
    const nm = nameOf(href); const rec = note('picture', nm);
    const job = { raw, cancel: false, waiters: [] };
    pend.set(img, job); S.images.streamed += 1;
    own = true; let p; try { p = fetch0.call(window, href, { credentials: img.crossOrigin === 'use-credentials' ? 'include' : 'same-origin' }); } finally { own = false; }
    p.then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(async (blob) => {
        rec.bytes = blob.size;
        if (job.cancel || !cib) return { blob, bmp: null };
        if (blob.size < SMALL) { S.images.small += 1; return { blob, bmp: null }; }
        const d0 = now();
        // the usual upload three asks for: flipped, straight alpha, no color conversion (r152+: NONE for sRGB and data)
        const bmp = await cib(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(() => null);
        S.images.decodeMs += now() - d0;
        return { blob, bmp };
      })
      .catch(() => { S.images.failed += 1; return null; })
      .then((res) => {
        if (job.cancel || pend.get(img) !== job) { try { res?.bmp?.close(); } catch { /* fine */ } return; }
        pend.delete(img);
        rec.t1 = now();
        // (round 55, fixes55) whatever happens here, the picture loads and every decode() waiting on it goes on (a throw
        // was an unhandled rejection the game's own error list showed, and an <img> that never loaded)
        try {
          if (res?.bmp) { bmps.set(img, { bmp: res.bmp, w: res.bmp.width, h: res.bmp.height, rec }); rec.smooth = 'decoded off the main thread'; rec.w = res.bmp.width; rec.h = res.bmp.height; setTimeout(() => drop(img), 30000); }
          if (res?.blob) {
            const u = URL.createObjectURL(res.blob);
            shown.set(img, raw);
            const free = () => { setTimeout(() => URL.revokeObjectURL(u), 0); img.removeEventListener('load', free); img.removeEventListener('error', free); };
            img.addEventListener('load', free); img.addEventListener('error', free);
            srcD.set.call(img, u);
          } else srcD.set.call(img, raw); // (couldn't fetch it: the browser loads it as it would have)
        } catch { shown.delete(img); drop(img); try { srcD.set.call(img, raw); } catch { /* the browser's own error event */ } }
        for (const w of job.waiters.splice(0)) { try { w(); } catch { /* fine */ } }
      });
  }
  if (srcD?.set && compD?.get) {
    Object.defineProperty(IMG, 'src', {
      configurable: true, enumerable: srcD.enumerable,
      get() { const j = pend.get(this); if (j) return abs(j.raw); const s = shown.get(this); return s != null ? abs(s) : srcD.get.call(this); },
      set(v) {
        // (round 55, fixes55) anything of Hearth's here that throws: the picture loads as the browser would load it
        let mine = false;
        try {
          const j = pend.get(this); if (j) { j.cancel = true; pend.delete(this); for (const w of j.waiters.splice(0)) w(); }
          shown.delete(this); drop(this);
          if (S.dead || v == null || v === '' || !active()) return srcD.set.call(this, v);
          if (!S.on) { const rec = note('picture', nameOf(abs(String(v)))); const done = () => { rec.t1 = now(); rec.w = this.naturalWidth; rec.h = this.naturalHeight; }; this.addEventListener('load', done, { once: true }); this.addEventListener('error', done, { once: true }); return srcD.set.call(this, v); }
          const raw = String(v); const href = abs(raw);
          let same = false; try { const u = new URL(href); same = u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:'; } catch { same = false; }
          if (!same && this.crossOrigin == null) return srcD.set.call(this, v); // (another site without CORS: can't read its bytes)
          mine = true;
          return stream(this, raw, href);
        } catch {
          if (mine) { pend.delete(this); shown.delete(this); }
          return srcD.set.call(this, v);
        }
      },
    });
    Object.defineProperty(IMG, 'complete', { configurable: true, enumerable: compD.enumerable, get() { return pend.has(this) ? false : compD.get.call(this); } });
    if (decode0) IMG.decode = function decode() { const j = pend.get(this); if (!j) return decode0.call(this); return new Promise((res) => j.waiters.push(res)).then(() => decode0.call(this)); };
    // (round 55, playbudget) off: these stay (a picture the game loaded through them keeps answering with its own address), passing straight through
  }
  // the WebGL upload takes the decoded bitmap (WebGL ignores the flip / premultiply settings for a bitmap: it was made
  // with the ones in effect, so it's only used when they match)
  const UNPACK = new WeakMap();
  const st = (gl) => { let s = UNPACK.get(gl); if (!s) { s = { flip: false, premul: false, conv: 0x9244 }; UNPACK.set(gl, s); } return s; };
  function swap(gl, a) {
    const i = a.length - 1; const src = a[i];
    if (!(src instanceof HTMLImageElement)) return null;
    const b = bmps.get(src); if (!b) return null;
    const s = st(gl);
    if (s.flip && !s.premul && s.conv === 0 && b.w === src.naturalWidth && b.h === src.naturalHeight) {
      a[i] = b.bmp; S.images.used += 1;
      if (!b.used) { b.used = true; setTimeout(() => { if (!b.slicing) drop(src); }, 3000); } // (kept a moment: a context restore uploads again)
      return b;
    }
    S.images.fallback += 1; b.rec.smooth = 'decoded on the main thread (an unusual upload)'; drop(src);
    return null;
  }
  // (held objects) a big picture uploads in strips, one strip a frame: during that initTexture three allocates the
  // texture (texStorage2D) and asks for the whole picture; the whole-picture call is let through empty and the
  // strips follow (WebGL 2 takes a sub-rectangle of a bitmap: UNPACK_SKIP_ROWS), the mipmaps once the last is in
  let slicing = null; // { job } while Hearth's own initTexture runs
  const SLICE_PX = 1 << 20; // a strip ≈ 4 MB (1M pixels); pictures of 2M pixels or more are sliced
  function intercept(gl, m, a, b) {
    if (!slicing || slicing.job.tex) return false;
    if (m === 'texSubImage2D' && a.length === 7 && a[0] === gl.TEXTURE_2D && a[1] === 0 && a[2] === 0 && a[3] === 0) {
      const src = a[6]; const bmp = src instanceof ImageBitmap ? src : b?.bmp || null;
      if (!bmp || bmp.width * bmp.height < 2 * SLICE_PX) return false;
      Object.assign(slicing.job, { gl, tex: gl.getParameter(gl.TEXTURE_BINDING_2D), format: a[4], type: a[5], bmp, w: bmp.width, h: bmp.height, y: 0, rows: Math.max(16, Math.floor(SLICE_PX / bmp.width)), mips: false, own: b });
      if (b) b.slicing = true;
      return true;
    }
    return false;
  }
  function sliceStep(job, all) {
    const { gl } = job;
    if (gl.isContextLost()) { job.y = job.h; return true; }
    const was = gl.getParameter(gl.TEXTURE_BINDING_2D); const skip = gl.getParameter(gl.UNPACK_SKIP_ROWS);
    gl.bindTexture(gl.TEXTURE_2D, job.tex);
    do {
      const n = Math.min(job.rows, job.h - job.y);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, job.y);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, job.y, job.w, n, job.format, job.type, job.bmp); // (through every wrapper: the F chip counts it)
      job.y += n;
    } while (all && job.y < job.h);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, skip);
    if (job.y >= job.h && job.mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, was);
    if (job.y >= job.h) { S.slices.done += 1; if (job.own) { job.own.slicing = false; } }
    S.slices.strips += 1;
    return job.y >= job.h;
  }

  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    const ps = P.pixelStorei;
    // (round 55, fixes55) every hook here lets the game's own GL call through when something of Hearth's throws (an
    // upload taken over half-way would leave a texture empty: the swap is undone then)
    P.pixelStorei = function pixelStorei(p, v) { try { if (p === 0x9240) st(this).flip = Boolean(v); else if (p === 0x9241) st(this).premul = Boolean(v); else if (p === 0x9243) st(this).conv = v; } catch { /* fine */ } return ps.call(this, p, v); };
    for (const m of ['texImage2D', 'texSubImage2D']) {
      const f = P[m];
      if (typeof f === 'function') {
        // (round 60, gcchurn60) a game's own uploads (a canvas / data texture rewritten every frame) go straight through:
        // only `apply` touches `arguments` (strict: the optimiser hands them on without making an object; `...a` made an
        // array on every upload); a picture can only be the 6th, 7th or 9th argument. The arguments are copied only for an
        // upload Hearth may change (a picture it decoded, or one of its own strips)
        const w = P[m] = function (a0, a1, a2, a3, a4, a5, a6, a7, a8) {
          'use strict';
          if (S.dead || (!slicing && !(a5 instanceof HTMLImageElement) && !(a6 instanceof HTMLImageElement) && !(a8 instanceof HTMLImageElement))) return f.apply(this, arguments);
          return slow.apply(this, arguments);
        };
        const slow = function () {
          const n = arguments.length; const src = arguments[n - 1];
          if (!slicing && !(src instanceof HTMLImageElement && bmps.has(src))) return f.apply(this, arguments);
          const a = new Array(n); for (let i = 0; i < n; i += 1) a[i] = arguments[i];
          const t0 = now(); let cut = false;
          try { const b = swap(this, a); cut = Boolean(slicing && intercept(this, m, a, b)); } catch { a[n - 1] = src; cut = false; }
          T[0] += now() - t0; // (round 55, playbudget: Hearth's part only)
          if (cut) return undefined;
          return f.apply(this, a);
        };
        undo.push([P, m, w, f]);
      }
    }
    if (P === window.WebGL2RenderingContext?.prototype) {
      const gm = P.generateMipmap;
      P.generateMipmap = function generateMipmap(t) { try { if (slicing?.job.tex && t === this.TEXTURE_2D) { slicing.job.mips = true; return undefined; } } catch { /* fine */ } return gm.call(this, t); };
    }
  }

  // ---------- objects added during play: shaders compiled before they're drawn, textures one per frame ----------
  // (round 60, gcchurn60) what was added since the last frame: kept lists (the objects, when each came: whole ms), in the
  // order they came, emptied by count. A Map here was rebuilt over and over by a game adding and dropping projectiles
  // every frame (its table grown, shrunk, rehashed: ≈ 350 bytes of garbage a frame). The same object added twice is
  // looked at once (the first time; the second finds its materials known)
  const FO = []; const FT = new Int32Array(4000); let FN = 0;
  const freshClear = () => { for (let i = 0; i < FN; i += 1) FO[i] = undefined; FN = 0; };
  const freshAdd = (o) => { if (FN < 4000) { FO[FN] = o; FT[FN] = S.tickI; FN += 1; } };
  const held = new Set(); // { o, r, scene, progs, tex, t0, frames, rec }
  const rends = new Map(); // renderer → { scene, camera } it drew last
  const protos = new WeakSet(); const scenesSeen = new WeakSet();
  function hookAdd(scene) {
    if (scenesSeen.has(scene)) return; scenesSeen.add(scene);
    const O3 = Object.getPrototypeOf(Object.getPrototypeOf(scene)); // Scene → Object3D (the game's own three.js)
    if (!O3 || protos.has(O3) || typeof O3.add !== 'function' || typeof O3.traverse !== 'function') return;
    protos.add(O3);
    const add0 = O3.add;
    // (round 60, gcchurn60) `arguments` only handed on (strict: the optimiser passes them through without making the object
    // each call); the object noted is the first: three's add(a, b, …) adds each one through this.add (this hook) again
    O3.add = function add(o) { 'use strict'; const r = add0.apply(this, arguments); try { if (S.active && S.on && !S.paused && o && o !== this && o.isObject3D) freshAdd(o); } catch { /* never in the game's way */ } return r; };
    const att0 = O3.attach;
    if (typeof att0 === 'function') O3.attach = function attach(o) { 'use strict'; const r = att0.apply(this, arguments); try { if (S.active && S.on && !S.paused && o?.isObject3D) freshAdd(o); } catch { /* never in the game's way */ } return r; };
    undo.push([O3, 'add', O3.add, add0]); if (typeof att0 === 'function') undo.push([O3, 'attach', O3.attach, att0]);
  }
  const rootOf = (o) => { let x = o; for (let i = 0; i < 128 && x.parent; i += 1) x = x.parent; return x; };
  const isDrawn = (x) => x.isMesh || x.isPoints || x.isLine || x.isSprite;
  const matsOf = (x) => (Array.isArray(x.material) ? x.material : x.material ? [x.material] : []);
  const imgReady = (im) => im && !(im instanceof HTMLImageElement && (!im.complete || !im.naturalWidth)) && !(im instanceof HTMLVideoElement);
  const progReady = (p) => { try { return !p.isReady || p.isReady(); } catch { return true; } };
  // a fence after the compile / upload commands: signaled once the graphics process has done them (WebGL 2; asked
  // without waiting: getSyncParameter is answered from Chromium's cache; never isSync, a round trip that waits).
  // Without KHR_parallel_shader_compile the driver links in order, so this is how a held object knows its first draw
  // won't wait on the link
  const fence = (gl) => { try { if (!gl?.fenceSync) return null; const f = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); return f; } catch { return null; } };
  const signaled = (gl, h) => { if (!h.fence) return true; try { if (!gl.isContextLost()) { if (gl.getSyncParameter(h.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return false; gl.deleteSync(h.fence); } } catch { /* lost: go on */ } h.fence = null; return true; };
  // the graphics process's last held job (a compile or an upload): the next upload waits for it, so the main thread
  // never blocks handing a big picture to a graphics process still busy linking a shader
  const gpu = new WeakMap(); // gl → { fence }
  // an object's name: its own, a part's, else what it shows ("the mesh with big.jpg")
  function label(o, tex) {
    if (o.name) return o.name.slice(0, 40);
    let nm = ''; o.traverse((x) => { if (!nm && x !== o && x.name) nm = x.name; });
    if (nm) return nm.slice(0, 40);
    for (const t of tex) { const im = t.image; if (im instanceof HTMLImageElement) return `the ${o.isMesh ? 'mesh' : 'object'} with ${nameOf(shown.get(im) ?? im.src)}`.slice(0, 48); }
    let m = null; o.traverse((x) => { if (!m && isDrawn(x)) m = matsOf(x)[0]; });
    return m ? `a new ${String(m.type || '').replace(/^Mesh|Material$/g, '').toLowerCase() || 'plain'} ${o.isMesh ? 'mesh' : 'object'}` : `a new ${o.type || 'object'}`;
  }
  // (round 54 fix) what three's program for a material depends on, roughly: the same kind → the same cached program.
  // Steady per-frame work (bullets, particles, sparks, decals a game adds every frame, often with a cloned material)
  // is a kind seen before: never compiled again, never held, never hidden. Too coarse a kind only means the game's own
  // first draw compiles it (as without Hearth); a new kind is compiled once, and held only if that made a new program.
  const SLOTS = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap', 'emissiveMap', 'envMap', 'lightMap', 'metalnessMap', 'roughnessMap', 'specularMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularColorMap', 'specularIntensityMap', 'transmissionMap', 'thicknessMap', 'anisotropyMap', 'gradientMap', 'matcap'];
  const strId = new Map(); const sid = (v) => { if (!v) return 0; let i = strId.get(v); if (i === undefined) { if (strId.size > 2000) strId.clear(); i = strId.size + 1; strId.set(v, i); } return i; };
  const bases = new WeakMap(); // a material class → three's Material.prototype (the one with the default program key)
  function base(m) {
    const P0 = Object.getPrototypeOf(m); if (!P0) return null;
    let b = bases.get(P0);
    if (b === undefined) { b = P0; while (b && !Object.prototype.hasOwnProperty.call(b, 'customProgramCacheKey')) b = Object.getPrototypeOf(b); b = b || null; bases.set(P0, b); }
    return b;
  }
  // (round 60, gcchurn60) the kind is two 26-bit hashes of the same parts, one number (no text built for every object a
  // game adds: a decal every few frames made ≈ 0.5 KB of strings each time). Two kinds differ when either hash does
  const KH = new Int32Array(2); const KF = new Float64Array(1); const KU = new Int32Array(KF.buffer);
  const khInt = (x) => {
    let a = KH[0]; let b = KH[1];
    a = Math.imul(a ^ x, 0x9e3779b1); a = Math.imul((a << 13) | (a >>> 19), 0x85ebca77);
    b = Math.imul(b ^ x, 0xc2b2ae3d); b = Math.imul((b << 15) | (b >>> 17), 0x27d4eb2f) ^ a;
    KH[0] = a; KH[1] = b;
  };
  const khStr = (v) => { const t = typeof v === 'string' ? v : String(v); khInt(t.length | 0x40000000); for (let i = 0; i < t.length; i += 1) khInt(t.charCodeAt(i)); };
  const khNum = (v) => { KF[0] = Number(v); khInt(KU[0]); khInt(KU[1]); };
  const khEnd = () => (KH[0] & 0x3ffffff) * 0x4000000 + (KH[1] & 0x3ffffff);
  function kindOfDraw(x, m) {
    KH[0] = 0x2545f491; KH[1] = 0x6c8e9cf5;
    khStr(m.type); if (typeof m.side === 'number') khNum(m.side); else khStr(m.side);
    khInt((m.vertexColors ? 1 : 0) | (m.alphaTest > 0 ? 2 : 0) | (m.alphaHash ? 4 : 0) | (m.premultipliedAlpha ? 8 : 0) | (m.flatShading ? 16 : 0) | (m.dithering ? 32 : 0) | (m.toneMapped === false ? 0 : 64) | (m.fog ? 128 : 0) | (m.transmission > 0 ? 256 : 0) | (m.clearcoat > 0 ? 512 : 0) | (m.sheen > 0 ? 1024 : 0) | (m.iridescence > 0 ? 2048 : 0) | (m.dispersion > 0 ? 4096 : 0) | (m.anisotropy > 0 ? 8192 : 0) | (m.sizeAttenuation ? 16384 : 0) | (m.wireframe ? 32768 : 0));
    for (let i = 0; i < SLOTS.length; i += 1) { const t = m[SLOTS[i]]; if (t) { khInt(0x100 + i); khInt(t.channel | 0); khInt((t.isCubeTexture ? 1 : 0) | (t.isVideoTexture ? 2 : 0)); if (typeof t.mapping === 'number') khNum(t.mapping); else khStr(t.mapping); } }
    if (m.isShaderMaterial) { khInt(0x200); khInt(sid(m.vertexShader)); khInt(sid(m.fragmentShader)); }
    { const b = base(m); if (b && (m.customProgramCacheKey !== b.customProgramCacheKey || m.onBeforeCompile !== b.onBeforeCompile)) { try { const c = m.customProgramCacheKey(); if (c) { khInt(0x300); khInt(sid(c)); } } catch { /* fine */ } } } // (three's own default: the same for every material: not asked, a function's text each time)
    if (m.defines) { for (const d in m.defines) { khInt(0x400); khStr(d); khStr(m.defines[d]); } }
    const g = x.geometry; const at = g?.attributes;
    if (at) { khInt(0x500); khInt((at.color ? 1 : 0) | (at.tangent ? 2 : 0) | (at.uv1 ? 4 : 0) | (at.uv2 ? 8 : 0) | (at.uv3 ? 16 : 0) | (at.normal ? 32 : 0)); }
    if (g.morphAttributes) for (const a in g.morphAttributes) { khInt(0x600); khStr(a); }
    khInt(0x700); khInt((x.isSkinnedMesh ? 1 : 0) | (x.isInstancedMesh ? 2 : 0) | (x.isInstancedMesh && x.instanceColor ? 4 : 0) | (x.isBatchedMesh ? 8 : 0) | (x.receiveShadow ? 16 : 0) | (x.isPoints ? 32 : x.isLine ? 64 : x.isSprite ? 128 : 0));
    return khEnd();
  }
  const known = new WeakMap(); // renderer → Set of kinds compiled (or found cached) already
  const BUDGET = 0.5; // ms a frame for what was added (a level dropping in is compiled at once: its kinds are new)
  // a texture that was never on the graphics card (a picture loaded during play). A texture already there that the game
  // updates (a canvas / data / video texture rewritten every frame) is the game's own steady work: never touched
  // (round 60, gcchurn60) three's properties.get() makes an entry for what it hasn't seen: asked only of what it has
  // (has(): r150+), so looking doesn't make the game's entries early
  const known3 = (P, x) => (typeof P.has === 'function' ? P.has(x) : true);
  const texNew = (P, t) => t?.isTexture && !t.isRenderTargetTexture && !t.isVideoTexture && !t.isDepthTexture && t.version > 0 && imgReady(t.image) && !(known3(P, t) && P.get(t).__webglTexture);
  // (round 60, gcchurn60) a kept set for what one added object brings (its materials, its new pictures): a list searched
  // by hand while small (a projectile: one material), a real Set past 32; emptied by count (a Set's clear() makes a new
  // table every time: several a frame for a game spawning projectiles). Insertion order as a Set's
  function kset() {
    const a = []; let n = 0; let big = null;
    return {
      get size() { return big ? big.size : n; },
      has(x) { if (big) return big.has(x); for (let i = 0; i < n; i += 1) if (a[i] === x) return true; return false; },
      add(x) { if (big) { big.add(x); return; } for (let i = 0; i < n; i += 1) if (a[i] === x) return; if (n < 32) { a[n] = x; n += 1; return; } big = new Set(); for (let i = 0; i < n; i += 1) big.add(a[i]); big.add(x); },
      clear() { for (let i = 0; i < n; i += 1) a[i] = undefined; n = 0; big = null; },
      each(f) { if (big) { for (const v of big) f(v); return; } for (let i = 0; i < n; i += 1) f(a[i]); },
      list() { return big ? [...big] : a.slice(0, n); },
    };
  }
  const NONE = new Set(); const MATS = kset(); const TEX = kset(); const WANT = []; let WN = 0;
  const L = { lights: 0, P: null, kinds: null };
  // the lights an added object brings are one more kind (their types, in order): hashed apart from the materials'
  // (kindOfDraw starts the shared hash afresh), kept here between lights
  const LH = new Int32Array(2);
  function look1(x) { // one node of an added object: its materials, and the kinds not compiled yet
    if (x.isLight) { const t = String(x.type); KH[0] = LH[0]; KH[1] = LH[1]; khStr(t); LH[0] = KH[0]; LH[1] = KH[1]; L.lights += 1; }
    if (!isDrawn(x)) return;
    const ms = x.material; if (!ms) return;
    if (Array.isArray(ms)) { for (let i = 0; i < ms.length; i += 1) if (ms[i]) mat1(x, ms[i]); } else mat1(x, ms);
  }
  // a geometry + material type that came 3 times in a row as a kind already compiled is steady work (a projectile the game
  // spawns all the time): not looked at again (one that differs is compiled by the game's own first draw, as without Hearth)
  // (round 60, gcchurn60) geometry → { t: its first material type, n: times in a row, more: Map(other type → times) |
  // null }: one small record per geometry (a Map each before: a game making a decal's geometry every few frames made one
  // Map per decal)
  const steady = new WeakMap();
  const stN = (s, type) => (s.t === type ? s.n : s.more ? (s.more.get(type) || 0) : 0);
  const stSet = (s, type, n) => { if (s.t === type) s.n = n; else (s.more || (s.more = new Map())).set(type, n); };
  function mat1(x, m) {
    if (MATS.has(m)) return; MATS.add(m);
    if (known3(L.P, m) && L.P.get(m).currentProgram) return;
    const g = x.geometry; const s = g ? steady.get(g) : null;
    if (s && stN(s, m.type) >= 3) return;
    const k = kindOfDraw(x, m);
    if (!L.kinds.has(k)) { WANT[WN] = k; WN += 1; if (s) stSet(s, m.type, 0); } else if (g) { if (!s) steady.set(g, { t: m.type, n: 1, more: null }); else stSet(s, m.type, stN(s, m.type) + 1); }
  }
  // one material's pictures never sent to the card (into TEX)
  function texOf(m) {
    const P = L.P;
    for (let i = 0; i < SLOTS.length; i += 1) { const v = m[SLOTS[i]]; if (texNew(P, v)) TEX.add(v); }
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (texNew(P, v)) TEX.add(v); }
  }
  // is x still in the list (not looked at yet in this pass, or kept for a later frame)? i: the pass's place, k: how many
  // it kept so far (moved to the front)
  const pending = (x, i, k) => { for (let j = 0; j < k; j += 1) if (FO[j] === x) return true; for (let j = i + 1; j < FN; j += 1) if (FO[j] === x) return true; return false; };
  const TK = { compiled: 0 }; // (the pass's count of compiles this frame)
  // (round 81, playchurn81) t: the render wrapper's own clock read (each read is a new boxed number: one fewer a frame)
  function take(r, scene, camera, t) {
    const P = r.properties; if (!P?.get) { freshClear(); return; }
    let claimed = held.size ? new Set() : NONE;
    if (held.size) for (const h of held) claimed.add(h.o);
    let kinds = known.get(r); if (!kinds) known.set(r, kinds = new Set());
    TK.compiled = 0; let k8 = 0; let k = 0;
    for (let i = 0; i < FN; i += 1) { // (FN read each time: what's added while this runs is looked at in this pass too)
      const o = FO[i]; const at = FT[i];
      if ((++k8 & 7) === 0 && now() - t > BUDGET) { k = 0; break; } // (a flood: the rest is drawn as the game draws it; nothing kept)
      if (!o.parent) continue; // (removed again before it was drawn: a short-lived object)
      { let x = o.parent; let up = false; for (let j = 0; j < 128 && x; j += 1, x = x.parent) if (pending(x, i, k)) { up = true; break; } if (up) continue; } // (its parent was added too: handled with it)
      if (rootOf(o) !== scene) { if (t - at <= 1000) { FO[k] = o; FT[k] = at; k += 1; } continue; } // (not in this scene: another renderer's, or not added yet)
      if (o.visible === false) continue; // (shown later: the game's own choice; compiled when it shows)
      if (claimed.size) { let x = o; let mine = false; for (let j = 0; j < 128 && x; j += 1, x = x.parent) if (claimed.has(x)) { mine = true; break; } if (mine) continue; } // (a part of an object already held: a model's own nodes)
      // (no allocation for steady work: the sets are kept and emptied by count; a bullet with no children skips the traverse)
      MATS.clear(); TEX.clear(); WN = 0; L.lights = 0; LH[0] = 0x3c6ef372; LH[1] = 0x5be0cd19; L.P = P; L.kinds = kinds;
      if (o.children.length) o.traverse(look1); else look1(o);
      const mats = MATS; const lights = L.lights > 0;
      if (lights) { KH[0] = LH[0]; KH[1] = LH[1]; khInt(L.lights); const lk = khEnd(); if (!kinds.has(lk)) { WANT[WN] = lk; WN += 1; } }
      mats.each(texOf);
      if (!WN && !TEX.size) continue; // (steady work: kinds seen before, its textures on the card already)
      const tex = new Set(TEX.list());
      let newMats = 0; let made = false;
      if (WN && TK.compiled < 4) {
        const n0 = r.info?.programs?.length ?? -1;
        const m0 = now(); try { if (lights) r.compile(scene, camera); else r.compile(o, camera, scene); TK.compiled += 1; } catch { /* drawn as before */ } T[1] += now() - m0;
        for (let j = 0; j < WN; j += 1) kinds.add(WANT[j]);
        if (kinds.size > 4000) kinds.clear();
        const n1 = r.info?.programs?.length ?? -1;
        made = n0 < 0 || n1 > n0; // (no new program: three had it cached; nothing to wait for)
        if (made) { newMats = mats.list().filter((m) => P.get(m).currentProgram).length; S.compiles += newMats; }
      }
      if (!made && !tex.size) continue;
      const ml = mats.list();
      const progs = made ? ml.map((m) => P.get(m).currentProgram).filter(Boolean) : [];
      const rec = note('object', label(o, [...tex, ...ml.map((m) => m.map).filter(Boolean)])); rec.mats = newMats; rec.tex = tex.size;
      const f = made ? fence(r.getContext?.()) : null;
      if (f) gpu.set(r.getContext(), { fence: fence(r.getContext()) });
      held.add({ o, r, scene, progs, tex: [...tex], t0: now(), frames: 0, rec, fence: f });
      if (claimed === NONE) claimed = new Set(); claimed.add(o);
      S.holds.n += 1;
    }
    // what's kept is at the front now; the rest (looked at, or a flood's remainder) is let go, as before
    for (let j = k; j < FN; j += 1) FO[j] = undefined;
    FN = k;
  }
  function stepHeld(r, scene) {
    const P = r.properties; const gl = r.getContext?.(); let uploaded = false;
    for (const h of held) {
      if (h.r !== r) continue;
      h.frames += 1;
      // its textures: one a frame for all held objects, each once the graphics process finished the last thing asked
      const done = signaled(gl, h);
      const g = gpu.get(gl); const idle = !g || signaled(gl, g);
      if (h.job && P.get(h.job.t).__webglTexture !== h.job.tex) h.job = null; // (disposed meanwhile)
      // its shaders linked (the fence): their first use (three reads the link status and the uniforms: round trips to
      // the graphics process) now, while nothing else is queued, instead of in the frame that first draws it
      if (done && !h.warm) { h.warm = true; if (!h.progs.every(progReady)) h.warm = false; else for (const p of h.progs) { try { p.getUniforms?.(); p.getAttributes?.(); } catch { /* drawn as before */ } } }
      if (done && idle && !uploaded) {
        if (h.job) { const t0 = now(); try { while (h.job && !sliceStep(h.job, false) && now() - t0 < 3); if (h.job?.y >= h.job?.h) h.job = null; } catch { h.job = null; } T[1] += now() - t0; uploaded = true; h.fence = fence(gl); if (h.fence) gpu.set(gl, { fence: fence(gl) }); } else {
          while (h.tex.length) {
            const tx = h.tex.shift(); if (!texNew(P, tx)) continue;
            const job = { t: tx, tex: null };
            slicing = gl?.fenceSync ? { job } : null;
            const m0 = now();
            try { r.initTexture(tx); S.uploads += 1; } catch { /* drawn as before */ } finally { slicing = null; }
            if (job.tex) { S.slices.textures += 1; h.job = job; h.sliced = true; job.tex = P.get(tx).__webglTexture || job.tex; try { if (sliceStep(job, false)) h.job = null; } catch { h.job = null; } }
            T[1] += now() - m0;
            uploaded = true; h.fence = fence(gl); if (h.fence) gpu.set(gl, { fence: fence(gl) }); break;
          }
        }
      }
      const gone = rootOf(h.o) !== scene;
      const ready = done && idle && h.warm && !h.fence && !h.job && !h.tex.length && h.frames >= MIN_FRAMES;
      const capped = now() - h.t0 > Math.max(CAP, 45 * S.frameMs) * (h.sliced ? 2.5 : 1); // (a slow computer's frames: 45 of them; strips going in: longer)
      if (h.job && (capped || gone)) { try { sliceStep(h.job, true); } catch { /* fine */ } h.job = null; } // (never shown half uploaded)
      if (gone || ready || capped) {
        held.delete(h);
        if (h.fence) { try { gl.deleteSync(h.fence); } catch { /* fine */ } }
        const ms = now() - h.t0;
        S.holds.released += 1; if (capped && !ready) S.holds.capped += 1; S.holds.maxMs = Math.max(S.holds.maxMs, Math.round(ms)); S.holds.frames += h.frames;
        h.rec.t1 = now(); h.rec.smooth = `shown after ${Math.round(ms)} ms (${h.rec.mats ? 'shaders compiled' : ''}${h.rec.mats && h.rec.tex ? ', ' : ''}${h.rec.tex ? `${h.rec.tex} texture${h.rec.tex > 1 ? 's' : ''} one per frame${h.sliced ? ', big ones in strips' : ''}` : ''}${capped && !ready ? '; the rest while drawing' : ''})`;
      }
    }
  }
  function wrap(r) {
    if (rends.has(r) || typeof r.render !== 'function') return;
    rends.set(r, { scene: null, camera: null });
    try { S.parallel ??= Boolean(r.extensions?.has?.('KHR_parallel_shader_compile')); } catch { /* fine */ }
    const r0 = r.render;
    const e0 = rends.get(r);
    // (round 55, fixes55) the game's render always runs, once: anything of Hearth's before it that throws (a material /
    // texture three's properties don't know, a fence on a lost context) is caught, the held objects let go (shown as
    // the game draws them) and the frame drawn as without Hearth. (round 55, playbudget) Hearth's part timed (SP; a
    // compile / upload only done earlier than the game's own first draw is MOVED, not counted); stepped aside (paused)
    // or switched off (dead): straight through
    const w = r.render = function render(scene, camera) {
      if (S.dead || S.paused) return r0.call(this, scene, camera);
      let hid = null; const tn = now(); T[1] = 0;
      try {
        S.tick = tn; S.tickI = tn | 0; if (S.firstDraw == null) S.firstDraw = tn; // (S.tick: when an object was added, to a frame: no clock read per add; S.tickI the same in whole ms, kept as is with each add)
        if (e0.at) S.frameMs += (Math.min(250, tn - e0.at) - S.frameMs) * 0.05; e0.at = tn;
        if (scene?.isObject3D) {
          const e = rends.get(this); if (e && e.scene !== scene) { e.scene = scene; e.camera = camera; hookAdd(scene); } else if (e) e.camera = camera;
          if (!S.active && S.on) active(); // (a game that loads nothing during play: what it adds is looked at all the same)
          if (S.on && S.active && (FN || held.size)) {
            if (FN) take(this, scene, camera, tn);
            if (held.size) {
              stepHeld(this, scene);
              for (const h of held) if (h.r === this && h.o.visible) { h.o.visible = false; (hid || (hid = [])).push(h.o); }
            }
          }
        }
      } catch {
        if (hid) for (const o of hid.splice(0)) o.visible = true;
        for (const h of held) if (h.r === this) { if (h.job) { try { sliceStep(h.job, true); } catch { /* lost */ } } held.delete(h); S.holds.released += 1; S.holds.capped += 1; } // (never shown half uploaded)
        freshClear();
      }
      T[0] += Math.max(0, now() - tn - T[1]);
      if (!hid || !hid.length) return r0.call(this, scene, camera);
      try { return r0.call(this, scene, camera); } finally { for (const o of hid) o.visible = true; }
    };
    undo.push([r, 'render', w, r0]);
  }
  const dev = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());
  dev.addEventListener('observe', (e) => { try { const o = e.detail; if (o?.isWebGLRenderer) wrap(o); else if (o?.isScene) hookAdd(o); } catch { /* the game plays as it is */ } }); // (dispatched inside the game's own constructors)

  // ---------- what Hearth reads ----------
  // near(a, b, hint): the load most likely behind a slow frame from a to b (performance.now ms); hint = { w, h } of the
  // biggest texture the frame uploaded, shader: it linked a program. A picture of that size (loaded in the last 6 s),
  // else a model that finished in the last 1.5 s (its pictures / materials), else a file, else an object shown then;
  // its name or ''
  function near(a, b, hint = {}) {
    let best = null; let score = 0;
    for (let i = S.loads.length - 1; i >= 0; i -= 1) {
      const l = S.loads[i];
      if (l.t0 > b) continue;
      const end = l.t1 ?? b; const age = a - end;
      const sized = hint.w && l.w === hint.w && hint.h <= l.h; // (a strip of it: its width)
      if (age > (sized || l.kind === 'object' ? 6000 : 1500)) continue;
      const k = sized ? 5 : l.kind === 'model' ? (hint.w || hint.shader ? 4 : 3) : l.kind === 'object' ? (hint.shader ? 3.5 : 1) : l.kind === 'picture' ? (hint.w ? 1.5 : 2) : 2;
      if (k > score || (k === score && l.t0 > best.t0)) { best = l; score = k; }
    }
    return best ? best.name : '';
  }
  window.__gameStream = {
    near,
    renderers: () => [...rends].map(([r, e]) => ({ renderer: r, scene: e.scene, camera: e.camera })),
    report: (t0 = 0) => ({ on: S.on, parallel: S.parallel, activeAt: S.activeAt == null ? null : Math.round(S.activeAt - t0), images: { ...S.images, decodeMs: Math.round(S.images.decodeMs) }, slices: { ...S.slices }, holds: { ...S.holds }, uploads: S.uploads,
      loads: S.loads.map((l) => ({ kind: l.kind, name: l.name, t: Math.round(l.t0 - t0), done: l.t1 == null ? null : Math.round(l.t1 - t0), mb: l.bytes ? r1(l.bytes / 1048576) : 0, ...(l.w ? { w: l.w, h: l.h } : {}), ...(l.mats ? { mats: l.mats } : {}), ...(l.tex ? { tex: l.tex } : {}), smooth: l.smooth || '' })) }),
    pub: () => JSON.stringify(window.__gameStream.report(0)),
    // (round 55, playbudget) tools/playbudget-page.js: its time, the A/B's step aside, and off for this game (what's held
    // is shown at once, a picture going in strips finishes first, its hooks out of the way)
    budget: {
      spent: () => T[0],
      pause: (on) => { S.paused = Boolean(on); },
      off: (by) => {
        if (S.dead) return false;
        S.dead = String(by || 'asked'); S.on = false; freshClear();
        for (const h of held) { if (h.job) { try { sliceStep(h.job, true); } catch { /* fine */ } } if (h.fence) { try { h.r.getContext().deleteSync(h.fence); } catch { /* fine */ } } }
        held.clear();
        for (const [o, m, w, base] of undo) { try { if (o[m] === w) o[m] = base; } catch { /* another wrapper on top: ours steps aside */ } }
        return true;
      },
    },
  };
})();
