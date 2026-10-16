// ▶ Play, got ready (round 52, gameready): the part that runs INSIDE ▶ Play's game window, first in the game's page
// (gamemodemain.js serves it on the game's own address and puts its tag at the top of the page's <head> when GameReady
// armed the window; the game's files are never changed). It shows the calm card over the window before the first frame
// ("Getting Clink ready… textures 40/120 · 80 %", Play now, Optimize for play, Esc) and prepares what the game loads:
//   a Lab scene (k=lab: the window's page is the Lab's player, data/game/<scene>/play.html): once the scene first drew
//     (behind the card), the player's own messages: ready-scan (everything in, textures at the best anisotropy, what it
//     costs), ready-prep (every shader compiled, every texture uploaded), ready-warm until two passes find nothing new
//   an HTML build (k=html): holds the game's frames (requestAnimationFrame) while it gets ready, finds its three.js
//     renderer and scenes through three's own devtools hook (__THREE_DEVTOOLS__), waits until everything it loads is in
//     (fetch / XHR / pictures / image bitmaps / sounds decoded / videos at their first frame), every texture at the best
//     anisotropy and uploaded (initTexture), every shader compiled (compileAsync), warm frames under the card, again
// Then the card goes and the first 5 s of play are counted (shaders compiled / textures uploaded: 0 / 0 when it worked).
// Hearth reads window.__gameReady.pub() through game:eval (tools/gameready.js) and answers the card's buttons with
// __gameReady.answer(…). Query: t = the title, k = lab | html, np = 1 (no getting ready: a check's "before"), opt = how
// many models could be optimized (the card offers Optimize for play), tx = (round 53, gametex) what the compressed
// textures save ("Textures: 640 MB → 160 MB of video memory"), shown on the card.
(() => {
  if (window.__gameReady) return;
  const Q = new URLSearchParams((document.currentScript?.src || '').split('?')[1] || '');
  const LAB = Q.get('k') === 'lab';
  const now = () => performance.now();
  const realRAF = window.requestAnimationFrame.bind(window);
  const realTimeout = window.setTimeout.bind(window);
  const sleep = (ms) => new Promise((r) => realTimeout(r, ms));
  const S = { mode: LAB ? 'lab' : 'html', title: Q.get('t') || document.title || 'the game', noPrep: Q.get('np') === '1', opt: Number(Q.get('opt')) || 0, tx: Q.get('tx') || '', phase: 'ready', pct: 0, text: '', t0: now(), cardAt: null, firstFrameAt: null, result: null, first5: null, want: null, wantN: 0, note: '', errors: [], skip: false, held: !LAB, queue: [], renderers: new Set(), scenes: new Set(), pend: 0, last: now(), gl: { compiles: 0, links: 0, uploads: 0, reuploads: 0 }, decoders: new Set() };
  window.__gameReady = S;
  // what Hearth reads (game:eval): plain data only
  S.pub = () => JSON.stringify({ tx: S.tx, mode: S.mode, phase: S.phase, pct: S.pct, text: S.text, cardAt: S.cardAt, firstFrameAt: S.firstFrameAt, result: S.result, first5: S.first5, want: S.want, wantN: S.wantN, errors: S.errors.slice(-5), card: Boolean(ui && ui.d.isConnected && !ui.d.dataset.out) });
  S.answer = (a) => answerCard(a || {});

  // ---------- the card (over the whole window, before anything draws) ----------
  let ui = null;
  function card(text, pct) {
    if (!ui) {
      const d = document.createElement('gameready-card'); d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#07080b;color:#eae0d5;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;transition:opacity .25s';
      const root = d.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>.c{width:min(440px,86vw);padding:22px 24px 16px;border-radius:14px;background:#15161c;border:1px solid #ffffff14;box-shadow:0 10px 40px #0008}.t{font-size:17px;font-weight:600;margin-bottom:4px}.l{color:#b8ada3;min-height:1.45em;font-variant-numeric:tabular-nums}.b{height:4px;margin:12px 0 6px;border-radius:2px;background:#ffffff14;overflow:hidden}.b i{display:block;height:100%;background:linear-gradient(90deg,#ff8a3d,#ffb45a);transform-origin:left;transform:scaleX(0);transition:transform .3s}.n{margin:8px 0 2px;color:#cfc4ba;font-size:13px}.k{margin:6px 0 0;padding:6px 8px;border-radius:6px;background:#000a;color:#ffd2a8;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;user-select:all;overflow-wrap:anywhere}[hidden]{display:none!important}.r{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #ffffff22;background:#ffffff0d;color:inherit;cursor:pointer}.m{background:#ff8a3d;border-color:#ff8a3d;color:#1a1206;font-weight:600}.e{margin-top:10px;color:#8f857c;font-size:12px}</style><div class="c"><div class="t"></div><div class="l"></div><div class="b"><i></i></div><div class="n" hidden></div><div class="k" hidden></div><div class="r"><button type="button" class="m">Play now</button><button type="button" class="o" hidden>Optimize for play</button></div><div class="e">Esc to leave</div></div>';
      const $ = (q) => root.querySelector(q);
      ui = { d, t: $('.t'), l: $('.l'), i: $('.b i'), n: $('.n'), k: $('.k'), m: $('.m'), o: $('.o'), last: '' };
      ui.t.textContent = `Getting ${S.title} ready…`;
      ui.m.onclick = () => { if (S.want === 'install-offer') { S.want = 'install'; S.wantN += 1; ui.m.textContent = 'Play now'; ui.n.textContent = 'Installing in its own window. When it says done, press ▶ Play again and Optimize.'; ui.k.hidden = true; ui.o.hidden = true; return; } S.skip = true; };
      ui.o.hidden = !S.opt;
      if (S.tx) { ui.n.hidden = false; ui.n.textContent = `${S.tx} (compressed copies)`; } // (round 53, gametex)
      if (S.opt) ui.o.title = `Compresses ${S.opt === 1 ? 'its 3D model' : `its ${S.opt} 3D models`} into Hearth's own cache (your files stay as they are)`;
      ui.o.onclick = () => { if (S.want === 'install-offer') { S.want = null; ui.k.hidden = true; ui.n.hidden = true; ui.m.textContent = 'Play now'; ui.o.textContent = 'Optimize for play'; return; } S.want = 'optimize'; S.wantN += 1; ui.o.hidden = true; ui.n.hidden = false; ui.n.textContent = 'Optimizing into Hearth\'s own cache…'; };
      (document.documentElement || document).appendChild(d);
      S.cardAt = now();
    }
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    const line = `${text} · ${p} %`;
    if (line !== ui.last) { ui.last = line; ui.l.textContent = line; ui.i.style.transform = `scaleX(${p / 100})`; S.pct = p; S.text = `Getting ${S.title} ready… ${line}`; }
  }
  function answerCard(a) {
    if (!ui) return;
    ui.n.hidden = false;
    if (a.kind === 'install') { S.want = 'install-offer'; ui.n.textContent = a.text ? `${a.text} Lighter 3D models need ${a.why || 'gltfpack'}. Hearth runs this in a Terminal window only when you press Install:` : `Optimizing needs ${a.why || 'gltfpack'}. Hearth runs this in a Terminal window only when you press Install:`; ui.k.hidden = false; ui.k.textContent = a.command; ui.m.textContent = 'Install'; ui.o.hidden = false; ui.o.textContent = 'Not now'; return; }
    S.want = null;
    ui.n.textContent = a.text || '';
  }
  function cardOut() { if (!ui || ui.d.dataset.out) return; ui.d.dataset.out = '1'; ui.d.style.opacity = '0'; realTimeout(() => ui?.d.remove(), 260); }
  if (!S.noPrep) card('looking at its files', 2);
  // the game's own errors, for Hearth to say why a game didn't start (never shown raw)
  addEventListener('error', (e) => { S.errors.push(e.target && e.target !== window ? `couldn't load ${String(e.target.src || e.target.href || e.target.tagName).split('/').slice(-2).join('/')}` : `${e.message || 'error'}${e.filename ? ` (${String(e.filename).split('/').pop()}:${e.lineno})` : ''}`); }, true);
  addEventListener('unhandledrejection', (e) => { S.errors.push(String(e.reason?.message || e.reason || 'rejected').slice(0, 300)); });

  // ================= a Lab scene: the Lab player's own preparing messages =================
  if (LAB) {
    const waits = new Set();
    let n = 0;
    addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.source !== 'three-sandbox') return;
      if (d.type === 'stack-drawn' && S.firstFrameAt == null) S.firstFrameAt = now();
      if (d.type === 'ready-progress' && d.id === 'gr' && S.phase === 'ready') {
        if (d.stage === 'assets') card(`loading ${d.done}/${d.total}`, 10 + 35 * (d.total ? d.done / d.total : 1));
        else if (d.stage === 'shaders') card(`effects ${d.done}/${d.total}`, 60 + 30 * (d.total ? d.done / d.total : 1));
      }
      for (const w of [...waits]) if (w.test(d)) { waits.delete(w); w.res(d); }
    });
    const ask = (m, type, ms = 30000) => new Promise((res) => { const w = { test: (d) => d.type === type && (d.id === m.id || type === 'ready-count'), res }; waits.add(w); realTimeout(() => { if (waits.delete(w)) res(null); }, ms); n += 1; window.postMessage({ target: 'three-sandbox', ...m }, '*'); });
    const count = () => ask({ type: 'ready-count', id: 'gr' }, 'ready-count', 4000);
    const until = async (fn, ms) => { const t = now(); while (now() - t < ms && !S.skip) { if (await fn()) return true; await sleep(100); } return false; };
    async function prepareLab() {
      const t0 = now(); const ms = {};
      // the scene starts behind the card; its first frame, then every layer drawing (the count steady for 0.6 s)
      await until(() => S.firstFrameAt != null || window.__hearthGame?.drawn, 60000);
      if (S.firstFrameAt == null && window.__hearthGame?.drawn) S.firstFrameAt = now();
      if (S.noPrep) return play();
      card('loading', 10);
      { let last = -1; let since = now(); const t = now();
        while (!S.skip && now() - t < 10000) { const c = await count(); const k = c?.renderers ?? 0; if (k !== last) { last = k; since = now(); } else if (k > 0 && now() - since > 600) break; await sleep(120); } }
      const g0 = await count();
      let a = now(); const scan = S.skip ? null : await ask({ type: 'ready-scan', id: 'gr' }, 'ready-scanned', 60000); ms.assets = Math.round(now() - a);
      const nTex = scan?.textures?.length || 0;
      if (!S.skip) card(`textures 0/${nTex}`, 45);
      a = now(); const prep = S.skip ? null : await ask({ type: 'ready-prep', id: 'gr' }, 'ready-prepped', 90000); ms.effects = Math.round(now() - a);
      if (!S.skip) card(`textures ${prep?.textures ?? nTex}/${nTex}`, 60);
      a = now(); const warm = [];
      for (let i = 0, quiet = 0; i < 6 && quiet < 2 && !S.skip; i += 1) {
        const w = await ask({ type: 'ready-warm', id: 'gr', n: 4 }, 'ready-warmed', 15000);
        warm.push(w?.gl || null);
        const g = w?.gl || {};
        quiet = (g.compiles || 0) + (g.links || 0) + (g.uploads || 0) === 0 ? quiet + 1 : 0;
        card('warming up', 90 + 3 * i);
        if (quiet < 2) await sleep(250);
      }
      ms.warm = Math.round(now() - a);
      const inv = S.skip ? scan : (await ask({ type: 'ready-scan', id: 'gr' }, 'ready-scanned', 15000)) || scan;
      const g1 = await count();
      S.result = { ms: Math.round(now() - t0), steps: ms, skipped: S.skip, prep: prep ? { compileMs: prep.compileMs, textures: prep.textures, renderers: prep.renderers, gl: prep.gl } : null, warm, gl: g0 && g1 ? { compiles: g1.compiles - g0.compiles, links: g1.links - g0.links, uploads: g1.uploads - g0.uploads, waitMs: Math.round((g1.waitMs || 0) - (g0.waitMs || 0)) } : null, total: g1 ? { compiles: g1.compiles, links: g1.links, uploads: g1.uploads, waitMs: Math.round(g1.waitMs || 0) } : null,
        inventory: inv ? { textures: (inv.textures || []).map((t) => ({ w: t.w, h: t.h, mips: t.mips, compressed: t.compressed, cube: t.cube, video: t.video, aniso: t.aniso })), calls: inv.calls, triangles: inv.triangles, programs: inv.programs, lights: inv.lights, shadows: inv.shadows, aniso: inv.aniso, renderers: inv.renderers } : null };
      if (!S.skip) card('ready', 100);
      await answered();
      play();
    }
    async function play() {
      if (S.phase === 'playing') return;
      S.phase = 'playing';
      cardOut();
      const c0 = await count();
      await sleep(5000);
      const c1 = await count();
      if (c0 && c1) S.first5 = { compiles: c1.compiles - c0.compiles, links: c1.links - c0.links, uploads: c1.uploads - c0.uploads, reuploads: c1.reuploads - c0.reuploads, lock: c1.lock, level: c1.level, shares: c1.shares, waitMs: Math.round((c1.waitMs || 0) - (c0.waitMs || 0)) };
    }
    realTimeout(() => prepareLab().catch((err) => { S.errors.push(String(err?.message || err)); play(); }), 0);
    return;
  }

  // ================= an HTML build =================
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
      o.render = function (scene, camera) { if (scene?.isObject3D) { S.scenes.add(scene); o.__grCam = camera; } if (S.firstFrameAt == null) S.firstFrameAt = now(); return r0.call(this, scene, camera); };
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
  const videos = () => { const set = new Set(document.querySelectorAll('video')); for (const t of textures()) if (t.isVideoTexture && t.image) set.add(t.image); return [...set]; };
  async function settle(maxMs = 30000) {
    const t0 = now();
    while (now() - t0 < maxMs && !S.skip) {
      const vids = videos().filter((v) => (v.src || v.srcObject) && v.readyState < 2 && !v.error).length;
      const left = S.pend + vids;
      card(`loading${left ? ` · ${left} left` : ''}`, 10 + Math.min(30, (now() - t0) / 100));
      if (!left && S.renderers.size && now() - S.last > 350) break;
      if (!left && !S.renderers.size && now() - t0 > 6000) break; // no three.js here: nothing more to wait for
      await sleep(50);
    }
    for (const v of videos()) if (v.readyState >= 2 && typeof v.requestVideoFrameCallback === 'function') await Promise.race([new Promise((r) => v.requestVideoFrameCallback(() => r())), sleep(300)]);
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
    return { textures: tex, calls, triangles, programs, lights, shadows, videos: videos().length };
  }
  function fakeCamera() {
    // compile() reads only the camera's layers: an Object3D of the game's own three.js with every layer on
    const sc = [...S.scenes][0]; if (!sc) return null;
    const O3 = Object.getPrototypeOf(sc.constructor); const c = new O3(); c.layers.enableAll(); return c;
  }
  async function compile(again) {
    let done = 0; const list = [...S.renderers]; const total = list.length * Math.max(1, S.scenes.size);
    for (const r of list) {
      const cam = r.__grCam || [...S.scenes].map((s) => { let c = null; s.traverse?.((o) => { if (!c && o.isCamera) c = o; }); return c; }).find(Boolean) || fakeCamera();
      for (const sc of S.scenes) {
        if (S.skip) return;
        try { if (cam) await Promise.race([r.compileAsync ? r.compileAsync(sc, cam) : r.compile(sc, cam), sleep(15000)]); } catch { /* the next frame compiles it */ }
        done += 1; card(`effects ${done}/${total}`, again ? 92 : 60 + 30 * (done / total));
      }
    }
  }
  function upload() {
    const list = textures(); let k = 0;
    for (const r of S.renderers) {
      const max = r.capabilities?.getMaxAnisotropy?.() || 1;
      for (const t of list) {
        if (S.skip) return k;
        // the best filtering the graphics card has, before the first upload (mipmapped pictures; not a video's frames)
        if (!t.isVideoTexture && t.generateMipmaps !== false && (t.anisotropy || 1) === 1 && max > 1) { /* (round 54: a game's own anisotropy is its choice) */ const was = r.properties?.get?.(t)?.__webglTexture; t.anisotropy = max; if (was) t.needsUpdate = true; }
        const im = t.image;
        if (!im || (im instanceof HTMLImageElement && !im.complete) || (im instanceof HTMLVideoElement && im.readyState < 2)) continue;
        try { r.initTexture(t); k += 1; } catch { /* not ready */ }
        card(`textures ${k}/${list.length}`, 45 + 15 * (k / Math.max(1, list.length)));
      }
    }
    return k;
  }
  const frames = (k) => new Promise((res) => { let i = 0; const go = () => (++i >= k ? res() : realRAF(go)); realRAF(go); });
  // ---------- 5. play ----------
  function play() {
    if (S.phase === 'playing') return;
    S.phase = 'playing'; S.skip = true;
    release();
    cardOut();
    const c0 = { ...S.gl }; const t0 = now(); let k = 0;
    const tick = () => { k += 1; if (now() - t0 < 5000) realRAF(tick); };
    realRAF(tick);
    realTimeout(() => { S.first5 = { compiles: S.gl.compiles - c0.compiles, links: S.gl.links - c0.links, uploads: S.gl.uploads - c0.uploads, reuploads: S.gl.reuploads - c0.reuploads, frames: k }; }, 5000);
  }
  async function prepareHtml() {
    if (S.noPrep) { play(); return; }
    const t0 = now(); const g0 = { ...S.gl }; const ms = {};
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
      await frames(4); await compile(true); upload(); await frames(2); ms.warm = Math.round(now() - a);
    }
    S.result = { ms: Math.round(now() - t0), steps: ms, uploaded: up, gl: Object.fromEntries(Object.entries(S.gl).map(([key, v]) => [key, v - g0[key]])), inventory: inventory(), skipped: Boolean(S.skip) };
    card('ready', 100);
    await answered();
    play();
  }
  // a pending Optimize / Install on the card is answered before the card goes (at most 2 minutes)
  async function answered() { const t = now(); while (S.want && S.want !== 'install-offer' && now() - t < 120000) await sleep(100); if (S.want === 'install-offer') { const t2 = now(); while (S.want === 'install-offer' && !S.skip && now() - t2 < 60000) await sleep(100); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => realTimeout(prepareHtml, 0)); else realTimeout(prepareHtml, 0);
})();
