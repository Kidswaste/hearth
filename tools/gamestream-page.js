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
//              game reading obj.visible never sees a change.
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
    images: { streamed: 0, used: 0, fallback: 0, small: 0, failed: 0, decodeMs: 0 }, slices: { textures: 0, strips: 0, done: 0 }, frameMs: 16.7, holds: { n: 0, released: 0, capped: 0, maxMs: 0, frames: 0 }, uploads: 0, compiles: 0 };
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
    window.fetch = function (input, init) {
      const p = fetch0.call(this, input, init);
      if (!own && active()) {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        if (/^(blob|data):/i.test(url)) return p; // (a loader's own pieces: a model's pictures)
        const nm = nameOf(url); const rec = note(kindOf(nm), nm);
        p.then((r) => { rec.t1 = now(); rec.bytes = Number(r.headers.get('content-length')) || 0; }, () => { rec.t1 = now(); rec.failed = true; });
      }
      return p;
    };
  }
  const open0 = XMLHttpRequest.prototype.open; const send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url, ...rest) { this.__gsUrl = url; return open0.call(this, m, url, ...rest); };
  XMLHttpRequest.prototype.send = function (...a) {
    if (active() && this.__gsUrl) { const nm = nameOf(this.__gsUrl); const rec = note(kindOf(nm), nm); this.addEventListener('loadend', () => { rec.t1 = now(); rec.bytes = Number(this.getResponseHeader?.('content-length')) || 0; }, { once: true }); }
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
        if (res?.bmp) { bmps.set(img, { bmp: res.bmp, w: res.bmp.width, h: res.bmp.height, rec }); rec.smooth = 'decoded off the main thread'; rec.w = res.bmp.width; rec.h = res.bmp.height; setTimeout(() => drop(img), 30000); }
        if (res?.blob) {
          const u = URL.createObjectURL(res.blob);
          shown.set(img, raw);
          const free = () => { setTimeout(() => URL.revokeObjectURL(u), 0); img.removeEventListener('load', free); img.removeEventListener('error', free); };
          img.addEventListener('load', free); img.addEventListener('error', free);
          srcD.set.call(img, u);
        } else srcD.set.call(img, raw); // (couldn't fetch it: the browser loads it as it would have)
        for (const w of job.waiters.splice(0)) w();
      });
  }
  if (srcD?.set && compD?.get) {
    Object.defineProperty(IMG, 'src', {
      configurable: true, enumerable: srcD.enumerable,
      get() { const j = pend.get(this); if (j) return abs(j.raw); const s = shown.get(this); return s != null ? abs(s) : srcD.get.call(this); },
      set(v) {
        const j = pend.get(this); if (j) { j.cancel = true; pend.delete(this); for (const w of j.waiters.splice(0)) w(); }
        shown.delete(this); drop(this);
        if (v == null || v === '' || !active()) return srcD.set.call(this, v);
        if (!S.on) { const rec = note('picture', nameOf(abs(String(v)))); const done = () => { rec.t1 = now(); rec.w = this.naturalWidth; rec.h = this.naturalHeight; }; this.addEventListener('load', done, { once: true }); this.addEventListener('error', done, { once: true }); return srcD.set.call(this, v); }
        const raw = String(v); const href = abs(raw);
        let same = false; try { const u = new URL(href); same = u.origin === location.origin || u.protocol === 'blob:' || u.protocol === 'data:'; } catch { same = false; }
        if (!same && this.crossOrigin == null) return srcD.set.call(this, v); // (another site without CORS: can't read its bytes)
        return stream(this, raw, href);
      },
    });
    Object.defineProperty(IMG, 'complete', { configurable: true, enumerable: compD.enumerable, get() { return pend.has(this) ? false : compD.get.call(this); } });
    if (decode0) IMG.decode = function decode() { const j = pend.get(this); if (!j) return decode0.call(this); return new Promise((res) => j.waiters.push(res)).then(() => decode0.call(this)); };
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
    P.pixelStorei = function pixelStorei(p, v) { if (p === 0x9240) st(this).flip = Boolean(v); else if (p === 0x9241) st(this).premul = Boolean(v); else if (p === 0x9243) st(this).conv = v; return ps.call(this, p, v); };
    for (const m of ['texImage2D', 'texSubImage2D']) { const f = P[m]; if (typeof f === 'function') P[m] = function (...a) { const b = swap(this, a); if (slicing && intercept(this, m, a, b)) return undefined; return f.apply(this, a); }; }
    if (P === window.WebGL2RenderingContext?.prototype) {
      const gm = P.generateMipmap;
      P.generateMipmap = function generateMipmap(t) { if (slicing?.job.tex && t === this.TEXTURE_2D) { slicing.job.mips = true; return undefined; } return gm.call(this, t); };
    }
  }

  // ---------- objects added during play: shaders compiled before they're drawn, textures one per frame ----------
  const fresh = new Map(); // object → when it was added
  const held = new Set(); // { o, r, scene, progs, tex, t0, frames, rec }
  const rends = new Map(); // renderer → { scene, camera } it drew last
  const protos = new WeakSet(); const scenesSeen = new WeakSet();
  function hookAdd(scene) {
    if (scenesSeen.has(scene)) return; scenesSeen.add(scene);
    const O3 = Object.getPrototypeOf(Object.getPrototypeOf(scene)); // Scene → Object3D (the game's own three.js)
    if (!O3 || protos.has(O3) || typeof O3.add !== 'function' || typeof O3.traverse !== 'function') return;
    protos.add(O3);
    const add0 = O3.add;
    O3.add = function add(...objs) { const r = add0.apply(this, objs); if (S.active && S.on) for (const o of objs) if (o && o !== this && o.isObject3D && fresh.size < 4000) fresh.set(o, now()); return r; };
    const att0 = O3.attach;
    if (typeof att0 === 'function') O3.attach = function attach(o) { const r = att0.call(this, o); if (S.active && S.on && o?.isObject3D && fresh.size < 4000) fresh.set(o, now()); return r; };
  }
  const rootOf = (o) => { let x = o; for (let i = 0; i < 128 && x.parent; i += 1) x = x.parent; return x; };
  const isDrawn = (x) => x.isMesh || x.isPoints || x.isLine || x.isSprite;
  const matsOf = (x) => (Array.isArray(x.material) ? x.material : x.material ? [x.material] : []);
  const imgReady = (im) => im && !(im instanceof HTMLImageElement && (!im.complete || !im.naturalWidth)) && !(im instanceof HTMLVideoElement);
  const texPending = (P, t) => t?.isTexture && !t.isRenderTargetTexture && !t.isVideoTexture && !t.isDepthTexture && t.version > 0 && imgReady(t.image) && P.get(t).__version !== t.version;
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
  function take(r, scene, camera) {
    const P = r.properties; if (!P?.get) { fresh.clear(); return; }
    let k = 0; const t = now(); const claimed = new Set();
    for (const h of held) claimed.add(h.o);
    for (const [o, at] of fresh) {
      if (k++ > 2000) break;
      { let x = o.parent; let up = false; for (let i = 0; i < 128 && x; i += 1, x = x.parent) if (fresh.has(x)) { up = true; break; } if (up) { fresh.delete(o); continue; } } // (its parent was added too: handled with it)
      if (rootOf(o) !== scene) { if (t - at > 1000) fresh.delete(o); continue; } // (not in this scene: another renderer's, or not added yet)
      fresh.delete(o);
      if (o.visible === false) continue; // (shown later: the game's own choice; compiled when it shows)
      { let x = o; let mine = false; for (let i = 0; i < 128 && x; i += 1, x = x.parent) if (claimed.has(x)) { mine = true; break; } if (mine) continue; } // (a part of an object already held: a model's own nodes)
      const mats = new Set(); let lights = false;
      o.traverse((x) => { if (x.isLight) lights = true; if (isDrawn(x)) for (const m of matsOf(x)) mats.add(m); });
      const newMats = [...mats].filter((m) => !P.get(m).currentProgram);
      const tex = new Set();
      for (const m of mats) { for (const v of Object.values(m)) if (texPending(P, v)) tex.add(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (texPending(P, u?.value)) tex.add(u.value); }
      if (!newMats.length && !tex.size) continue;
      if (newMats.length) { try { if (lights) r.compile(scene, camera); else r.compile(o, camera, scene); S.compiles += newMats.length; } catch { /* drawn as before */ } }
      const progs = newMats.map((m) => P.get(m).currentProgram).filter(Boolean);
      const rec = note('object', label(o, [...tex, ...[...mats].map((m) => m.map).filter(Boolean)])); rec.mats = newMats.length; rec.tex = tex.size;
      const f = newMats.length ? fence(r.getContext?.()) : null;
      if (f) gpu.set(r.getContext(), { fence: fence(r.getContext()) });
      held.add({ o, r, scene, progs, tex: [...tex], t0: now(), frames: 0, rec, fence: f });
      claimed.add(o);
      S.holds.n += 1;
    }
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
        if (h.job) { const t0 = now(); try { while (h.job && !sliceStep(h.job, false) && now() - t0 < 3); if (h.job?.y >= h.job?.h) h.job = null; } catch { h.job = null; } uploaded = true; h.fence = fence(gl); if (h.fence) gpu.set(gl, { fence: fence(gl) }); } else {
          while (h.tex.length) {
            const tx = h.tex.shift(); if (!texPending(P, tx)) continue;
            const job = { t: tx, tex: null };
            slicing = gl?.fenceSync ? { job } : null;
            try { r.initTexture(tx); S.uploads += 1; } catch { /* drawn as before */ } finally { slicing = null; }
            if (job.tex) { S.slices.textures += 1; h.job = job; h.sliced = true; job.tex = P.get(tx).__webglTexture || job.tex; try { if (sliceStep(job, false)) h.job = null; } catch { h.job = null; } }
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
    r.render = function render(scene, camera) {
      const tn = now(); if (S.firstDraw == null) S.firstDraw = tn;
      if (e0.at) S.frameMs += (Math.min(250, tn - e0.at) - S.frameMs) * 0.05; e0.at = tn;
      if (!scene?.isObject3D) return r0.call(this, scene, camera);
      const e = rends.get(this); if (e && e.scene !== scene) { e.scene = scene; e.camera = camera; hookAdd(scene); } else if (e) e.camera = camera;
      if (!S.on || (!fresh.size && !held.size) || !active()) return r0.call(this, scene, camera);
      if (fresh.size) take(this, scene, camera);
      if (!held.size) return r0.call(this, scene, camera);
      stepHeld(this, scene);
      const hid = [];
      for (const h of held) if (h.r === this && h.o.visible) { h.o.visible = false; hid.push(h.o); }
      try { return r0.call(this, scene, camera); } finally { for (const o of hid) o.visible = true; }
    };
  }
  const dev = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());
  dev.addEventListener('observe', (e) => { const o = e.detail; if (o?.isWebGLRenderer) wrap(o); else if (o?.isScene) hookAdd(o); });

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
  };
})();
