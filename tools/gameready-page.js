// ▶ Play, got ready (round 52, gameready): the part that runs inside an HTML game's own page, before the game's scripts
// (gamereadymain.js puts it first in the page's <head>). The game's files are never changed: this only watches and
// prepares what the game itself loads.
//   1. holds the game's frames (requestAnimationFrame) while it gets ready, behind a calm card
//   2. finds the game's three.js renderer and scenes through three's own devtools hook (__THREE_DEVTOOLS__)
//   3. waits until everything the game loads is in (fetch / XHR / pictures / image bitmaps / sounds decoded / videos at
//      their first frame) and lists every file it asked for (the scan, kept by Hearth for the next launch)
//   4. every texture at the graphics card's best anisotropy, uploaded now (initTexture); every shader compiled
//      (compileAsync, parallel), then a few warm frames under the card (lights / shadows / materials as they draw) and
//      anything new compiled again
//   5. the card goes, the game plays; what the GPU compiles / uploads in the first 5 s is counted and sent to Hearth
(() => {
  if (window.__gameReady) return;
  const host = window.__gameHost;
  const post = (m) => { try { host?.post({ source: 'gameready-page', ...m }); } catch { /* no host */ } };
  const now = () => performance.now();
  const realRAF = window.requestAnimationFrame.bind(window);
  const realTimeout = window.setTimeout.bind(window);
  const S = { held: true, queue: [], renderers: new Set(), scenes: new Set(), pend: 0, last: now(), gl: { compiles: 0, links: 0, uploads: 0, reuploads: 0 }, decoders: new Set(), t0: now(), title: document.title || 'the game', phase: 'ready' };
  window.__gameReady = S;
  // ---------- 1. the game's frames wait ----------
  window.requestAnimationFrame = (cb) => { if (!S.held) return realRAF(cb); S.queue.push(cb); return -S.queue.length; };
  function release() { if (!S.held) return; S.held = false; const q = S.queue.splice(0); for (const cb of q) realRAF(cb); }
  // ---------- 2. three.js tells us its renderers and scenes ----------
  const dev = window.__THREE_DEVTOOLS__ || (window.__THREE_DEVTOOLS__ = new EventTarget());
  dev.addEventListener('observe', (e) => {
    const o = e.detail;
    if (o?.isWebGLRenderer && !S.renderers.has(o)) {
      S.renderers.add(o);
      const r0 = o.render;
      o.render = function (scene, camera) { if (scene?.isObject3D) { S.scenes.add(scene); o.__grCam = camera; o.__grScene = scene; } return r0.call(this, scene, camera); };
    } else if (o?.isScene) S.scenes.add(o);
  });
  // ---------- GPU counters (what's compiled / uploaded, from the prototypes) ----------
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    const wrap = (m, fn) => { const f = P[m]; if (typeof f === 'function') P[m] = fn(f); };
    wrap('compileShader', (f) => function (sh) { S.gl.compiles += 1; return f.call(this, sh); });
    wrap('linkProgram', (f) => function (pr) { S.gl.links += 1; return f.call(this, pr); });
    wrap('activeTexture', (f) => function (u) { this.__grU = u; return f.call(this, u); });
    wrap('bindTexture', (f) => function (tg, tx) { (this.__grT ||= {})[this.__grU || 0] = tx; return f.call(this, tg, tx); });
    const up = (f) => function (...a) { const tx = this.__grT?.[this.__grU || 0]; if (tx && !tx.__grUp) { tx.__grUp = 1; S.gl.uploads += 1; } else S.gl.reuploads += 1; return f.apply(this, a); };
    for (const m of ['texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexImage3D']) wrap(m, up);
  }
  // ---------- 3. what the game loads ----------
  const busy = (p) => { S.pend += 1; S.last = now(); const done = () => { S.pend = Math.max(0, S.pend - 1); S.last = now(); }; Promise.resolve(p).then(done, done); return p; };
  const f0 = window.fetch; if (f0) window.fetch = function (...a) { const p = f0.apply(this, a); busy(p.then((r) => r.clone().arrayBuffer().catch(() => null))); return p; };
  const send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...a) { busy(new Promise((res) => this.addEventListener('loadend', res, { once: true }))); return send0.apply(this, a); };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (src?.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(v) { busy(new Promise((res) => { this.addEventListener('load', res, { once: true }); this.addEventListener('error', res, { once: true }); realTimeout(res, 30000); })); return src.set.call(this, v); } });
  const cib = window.createImageBitmap; if (cib) window.createImageBitmap = function (...a) { return busy(cib.apply(this, a)); };
  const AC = window.BaseAudioContext?.prototype; const dad = AC?.decodeAudioData;
  if (dad) AC.decodeAudioData = function (...a) { return busy(dad.apply(this, a)); };
  const files = new Map();
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { files.set(e.name, e.transferSize || e.encodedBodySize || 0); if (/meshopt_decoder|basis_transcoder|draco_(wasm_)?decoder/i.test(e.name)) S.decoders.add(/meshopt/i.test(e.name) ? 'meshopt' : /basis/i.test(e.name) ? 'ktx2' : 'draco'); } }).observe({ type: 'resource', buffered: true }); } catch { /* older */ }
  const videos = () => { const set = new Set(document.querySelectorAll('video')); for (const t of textures()) if (t.isVideoTexture && t.image) set.add(t.image); return [...set]; };
  async function settle(maxMs = 30000) {
    const t0 = now();
    while (now() - t0 < maxMs && !S.skip) {
      const vids = videos().filter((v) => (v.src || v.srcObject) && v.readyState < 2 && !v.error).length;
      const left = S.pend + vids;
      card(`loading${left ? ` · ${left} left` : ''}`, 10 + Math.min(30, (now() - t0) / 100));
      if (!left && S.renderers.size && now() - S.last > 350) break;
      if (!left && !S.renderers.size && now() - t0 > 6000) break; // no three.js here: nothing more to wait for
      await new Promise((r) => realTimeout(r, 50));
    }
    for (const v of videos()) if (v.readyState >= 2 && typeof v.requestVideoFrameCallback === 'function') await Promise.race([new Promise((r) => v.requestVideoFrameCallback(() => r())), new Promise((r) => realTimeout(r, 300))]);
  }
  // ---------- 4. textures and shaders ----------
  function textures() {
    const out = new Set();
    const take = (t) => { if (t?.isTexture && !t.isRenderTargetTexture && !t.isDepthTexture) out.add(t); };
    for (const sc of S.scenes) {
      take(sc.background); take(sc.environment);
      sc.traverse?.((o) => { for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { for (const v of Object.values(m)) take(v); if (m.uniforms) for (const u of Object.values(m.uniforms)) take(u?.value); } });
    }
    return [...out];
  }
  const dims = (t) => { const im = t.image; const m = t.mipmaps?.[0]; const w = im?.videoWidth || im?.naturalWidth || im?.width || m?.width || 0; const h = im?.videoHeight || im?.naturalHeight || im?.height || m?.height || 0; return { w, h }; };
  function inventory() {
    const tex = textures().map((t) => ({ ...dims(t), mips: t.generateMipmaps !== false || (t.mipmaps?.length || 0) > 1, compressed: Boolean(t.isCompressedTexture), cube: Boolean(t.isCubeTexture), video: Boolean(t.isVideoTexture), aniso: t.anisotropy || 1 }));
    let calls = 0; let triangles = 0; let programs = 0; let shadows = 0; let lights = 0;
    for (const r of S.renderers) { calls += r.info?.render?.calls || 0; triangles += r.info?.render?.triangles || 0; programs += r.info?.programs?.length || 0; }
    for (const sc of S.scenes) sc.traverse?.((o) => { if (o.isLight) { lights += 1; if (o.castShadow) shadows += 1; } });
    return { textures: tex, calls, triangles, programs, lights, shadows, videos: videos().length, files: [...files].map(([url, bytes]) => ({ url, bytes })).slice(0, 2000), decoders: [...S.decoders] };
  }
  function fakeCamera(r) {
    // compile() reads only the camera's layers: an Object3D of the game's own three.js with every layer on
    const sc = [...S.scenes][0]; if (!sc) return null;
    const O3 = Object.getPrototypeOf(sc.constructor); const c = new O3(); c.layers.enableAll(); return c;
  }
  async function compile(stage) {
    let done = 0; const list = [...S.renderers]; const total = list.length * Math.max(1, S.scenes.size);
    for (const r of list) {
      const cam = r.__grCam || [...S.scenes].map((s) => { let c = null; s.traverse?.((o) => { if (!c && o.isCamera) c = o; }); return c; }).find(Boolean) || fakeCamera(r);
      for (const sc of S.scenes) {
        if (S.skip) return;
        try { if (cam) await Promise.race([r.compileAsync ? r.compileAsync(sc, cam) : r.compile(sc, cam), new Promise((res) => realTimeout(res, 15000))]); } catch { /* the next frame compiles it */ }
        done += 1; card(`effects ${done}/${total}`, stage === 'again' ? 92 : 60 + 30 * (done / total));
      }
    }
  }
  function upload() {
    const list = textures(); let n = 0;
    for (const r of S.renderers) {
      const max = r.capabilities?.getMaxAnisotropy?.() || 1;
      for (const t of list) {
        if (S.skip) return n;
        // the best filtering the graphics card has, before the first upload (mipmapped pictures only; a video's next
        // frames would re-upload at no gain)
        if (!t.isVideoTexture && t.generateMipmaps !== false && (t.anisotropy || 1) < max) { const was = r.properties?.get?.(t)?.__webglTexture; t.anisotropy = max; if (was) t.needsUpdate = true; }
        const im = t.image;
        if (!im || (im instanceof HTMLImageElement && !im.complete) || (im instanceof HTMLVideoElement && im.readyState < 2)) continue;
        try { r.initTexture(t); n += 1; } catch { /* not ready */ }
        card(`textures ${n}/${list.length}`, 45 + 15 * (n / Math.max(1, list.length)));
      }
    }
    return n;
  }
  const frames = (n) => new Promise((res) => { let k = 0; const go = () => (++k >= n ? res() : realRAF(go)); realRAF(go); });
  // ---------- the card (in the game's own window, over the game) ----------
  let ui = null;
  function card(text, pct) {
    if (!ui) {
      const d = document.createElement('div'); d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0b0d12;color:#e8ecf3;font:14px system-ui,-apple-system,Segoe UI,sans-serif;transition:opacity .25s';
      const root = d.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>.c{width:min(420px,86vw);padding:22px 24px;border-radius:14px;background:#151a24;box-shadow:0 10px 40px #0008}.t{font-size:17px;font-weight:600;margin-bottom:8px}.l{opacity:.8;margin-bottom:12px;font-variant-numeric:tabular-nums}.b{height:4px;border-radius:2px;background:#ffffff1a;overflow:hidden}.b i{display:block;height:100%;background:#ff9a4d;transform-origin:left;transform:scaleX(0);transition:transform .2s}.r{display:flex;gap:10px;align-items:center;margin-top:16px}button{font:inherit;padding:7px 14px;border-radius:8px;border:0;background:#ff9a4d;color:#1a1208;font-weight:600;cursor:pointer}.e{opacity:.55;font-size:12px;margin-left:auto}</style><div class="c"><div class="t"></div><div class="l"></div><div class="b"><i></i></div><div class="r"><button type="button">Play now</button><span class="e">Esc to leave</span></div></div>';
      root.querySelector('button').onclick = () => { S.skip = true; };
      ui = { d, t: root.querySelector('.t'), l: root.querySelector('.l'), i: root.querySelector('.b i'), last: '' };
      (document.body || document.documentElement).append(d);
    }
    ui.t.textContent = `Getting ${S.title} ready…`;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const line = `${text} · ${p} %`;
    if (line !== ui.last) { ui.last = line; ui.l.textContent = line; ui.i.style.transform = `scaleX(${p / 100})`; if (text !== ui.sent || Math.abs(p - (ui.sentP || 0)) >= 5 || p === 100) { ui.sent = text; ui.sentP = p; post({ type: 'gr-progress', text, pct: p }); } }
  }
  // the game's own errors, for Hearth to say why a game didn't start (never changes anything)
  addEventListener('error', (e) => post({ type: 'gr-error', detail: e.target && e.target !== window ? `couldn't load ${String(e.target.src || e.target.href || e.target.tagName).split('/').slice(-2).join('/')}` : `${e.message || e.error || 'error'} ${e.filename ? `(${String(e.filename).split('/').pop()}:${e.lineno})` : ''}` }), true);
  addEventListener('unhandledrejection', (e) => post({ type: 'gr-error', detail: String(e.reason?.stack || e.reason || 'rejected').slice(0, 300) }));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.phase !== 'playing') { e.stopImmediatePropagation(); post({ type: 'gr-cancel' }); } }, true);
  // ---------- 5. play ----------
  function play() {
    if (S.phase === 'playing') return;
    S.phase = 'playing'; S.skip = true;
    release();
    if (ui) { ui.d.style.opacity = '0'; realTimeout(() => ui?.d.remove(), 260); }
    const c0 = { ...S.gl }; const t0 = now(); let n = 0;
    const tick = () => { n += 1; if (now() - t0 < 5000) realRAF(tick); };
    realRAF(tick);
    realTimeout(() => { S.first5 = { compiles: S.gl.compiles - c0.compiles, links: S.gl.links - c0.links, uploads: S.gl.uploads - c0.uploads, reuploads: S.gl.reuploads - c0.reuploads, frames: n }; post({ type: 'gr-first5', ...S.first5 }); }, 5000);
  }
  addEventListener('message', (e) => {
    const m = e.data; if (!m?.__gameready) return;
    if (m.type === 'gr-config') { S.configured = true; if (m.title) S.title = m.title; if (m.noPrep) S.noPrep = true; }
    else if (m.type === 'gr-play') play();
    else if (m.type === 'gr-count') post({ type: 'gr-count', ...S.gl, phase: S.phase });
  });
  async function prepare() {
    const t0 = now(); const g0 = { ...S.gl }; const ms = {};
    post({ type: 'gr-hello' });
    for (let i = 0; i < 20 && !S.configured; i += 1) await new Promise((r) => realTimeout(r, 25)); // the title / switches from Hearth
    if (S.noPrep) { play(); post({ type: 'gr-ready', noPrep: true }); return; }
    card('looking at its files', 2);
    let a = now(); await settle(); ms.assets = Math.round(now() - a);
    if (!S.renderers.size && !S.skip) {
      // a game that makes its renderer in its first frame: let one through under the card, then go on
      release(); S.held = true; await frames(2); await settle(8000);
    }
    a = now(); const up = upload(); ms.textures = Math.round(now() - a);
    a = now(); await compile(); ms.effects = Math.round(now() - a);
    // warm frames under the card: the game's own first frames draw (shadow maps, lights, post passes), then whatever
    // they showed that compile() didn't reach is compiled now
    if (!S.skip) {
      a = now(); card('warming up', 90);
      S.held = false; const q = S.queue.splice(0); for (const cb of q) realRAF(cb);
      await frames(4); await compile('again'); upload(); await frames(2); ms.warm = Math.round(now() - a);
    }
    const inv = inventory();
    post({ type: 'gr-ready', ms: Math.round(now() - t0), steps: ms, uploaded: up, gl: Object.fromEntries(Object.entries(S.gl).map(([k, v]) => [k, v - g0[k]])), inventory: inv, skipped: Boolean(S.skip) });
    card('ready', 100);
    play();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => realTimeout(prepare, 0)); else realTimeout(prepare, 0);
})();
