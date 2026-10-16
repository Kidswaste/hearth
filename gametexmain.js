// ▶ Play, lighter textures (round 53, gametex): the main process' part, required by gamereadymain.js on first use
// (nothing of it loads at the start). Optimize for play compresses a game's pictures into KTX2 (Basis Universal) in
// Hearth's own cache, data/game-cache/tex/<key>.ktx2, keyed by the picture's content hash; the owner's files are only
// read. The encoder is WebAssembly bundled with Hearth (tools/basisu, the same on Mac and Windows, nothing to install),
// run in worker threads (tools/gametex-worker.js) so Hearth never stalls; each copy is decoded back and compared with
// the original's pixels, and kept only when it looks the same (tools/gametex-core.js verdict). Otherwise the original
// stays, and the result says so.
//   pictures(pics, { caps })     a Lab scene's pictures → copies (or "kept as it is: why"), the cache under its cap
//   glb(input, output, { caps }) the pictures inside a GLB → a copy of the GLB with KTX2 pictures (KHR_texture_basisu)
//   plan(pics, caps)             { map, report }: the copies ▶ Play uses (none when the graphics card takes no compressed
//                                format: then the originals load) and what they save
//   vendor(threeDir, version)    three.js' Basis transcoder next to ▶ Play's page (KTX2Loader loads the copies with it)
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./tools/gametex-core');

const o = { dataDir: path.join(__dirname, 'data'), appDir: __dirname, readIndex: null, saveIndex: null, trash: null, decode: null, platform: process.platform };
const init = (opts = {}) => Object.assign(o, opts);
const texDir = () => path.join(o.dataDir, 'game-cache', 'tex');
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// ---------- three.js' Basis transcoder (the worker's check; ▶ Play's page) ----------
const TRANSCODER = ['examples/jsm/libs/basis/basis_transcoder.js', 'examples/jsm/libs/basis/basis_transcoder.wasm'];
const threeDirs = (v) => [process.env.HEARTH_THREE_DIR, path.join(o.appDir, 'node_modules', 'three'), path.join(o.dataDir, 'deploy', `three@${v}`)].filter(Boolean);
async function transcoder(version = '0.186.1') {
  for (const d of threeDirs(version)) { const [js, wasm] = TRANSCODER.map((r) => path.join(d, ...r.split('/'))); if (exists(js) && exists(wasm)) return { js, wasm }; }
  // fetched once from the CDN the Lab itself loads three.js from (as ⇪ Publish / ▶ Play fetch three.js), kept in
  // data/deploy/three@<version>: the same library, never anything installed
  const dest = path.join(o.dataDir, 'deploy', `three@${version}`);
  for (const rel of TRANSCODER) {
    const url = `https://cdn.jsdelivr.net/npm/three@${version}/${rel}`;
    let res; try { const { net } = require('electron'); res = await (net?.fetch ? net.fetch(url) : fetch(url)); } catch { res = await fetch(url).catch(() => null); }
    if (!res?.ok) throw new Error(`Couldn't get three.js' texture decoder (${version}): offline? It is downloaded once and kept.`);
    const f = path.join(dest, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  return { js: path.join(dest, ...TRANSCODER[0].split('/')), wasm: path.join(dest, ...TRANSCODER[1].split('/')) };
}
async function vendor(threeDir, version) {
  const t = await transcoder(version);
  const d = path.join(threeDir, 'examples', 'jsm', 'libs', 'basis'); fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(t.js, path.join(d, 'basis_transcoder.js')); fs.copyFileSync(t.wasm, path.join(d, 'basis_transcoder.wasm'));
  return true;
}

// ---------- decoding a picture (the system's own decoder: Electron's nativeImage) ----------
// → { w, h, px: 4 bytes a pixel, premultiplied, bgra } or null. Which byte is red is read once from a known picture.
let order = null;
function nativeDecode(buf) {
  const { nativeImage } = require('electron');
  if (order == null) {
    // a 1×1 red PNG: BGRA puts 255 in byte 2
    const red = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
    const b = nativeImage.createFromBuffer(red).toBitmap(); order = b[2] > 200 && b[0] < 50 ? 'bgra' : 'rgba';
  }
  const im = nativeImage.createFromBuffer(buf);
  if (im.isEmpty()) return null;
  const { width: w, height: h } = im.getSize();
  return { w, h, px: new Uint8Array(im.toBitmap()), bgra: order === 'bgra', premul: true };
}
const decode = (buf) => { try { return (o.decode || nativeDecode)(buf); } catch { return null; } };

// ---------- the encoder threads (only while optimizing) ----------
let pool = null;
async function startPool() {
  if (pool) return pool;
  const { Worker } = require('worker_threads');
  const tr = await transcoder();
  const n = Math.max(1, Math.min(3, (os.cpus()?.length || 2) - 1));
  const list = [];
  for (let i = 0; i < n; i += 1) {
    const x = { w: new Worker(path.join(o.appDir, 'tools', 'gametex-worker.js'), { workerData: { encoder: path.join(o.appDir, 'tools', 'basisu', 'basis_encoder.mjs'), transcoder: tr } }), busy: 0, dead: false, waits: new Set() };
    // (round 54, fixes54) a thread that dies (out of memory on a huge picture) answers what it had with an error: the
    // pictures keep their originals and Optimize for play ends, instead of waiting for it forever
    x.w.on('error', () => {}); // (an error with no job waiting is not an uncaught one in Hearth's main process)
    x.w.on('exit', () => { x.dead = true; for (const f of [...x.waits]) f({ ok: false, error: 'the encoder stopped (a picture too big for it?)' }); });
    list.push(x);
  }
  pool = { list, seq: 0 };
  return pool;
}
function stopPool() { if (!pool) return; for (const x of pool.list) x.w.terminate().catch(() => {}); pool = null; }
function job(j) {
  const P = pool; const alive = P ? P.list.filter((w) => !w.dead) : [];
  if (!alive.length) return Promise.resolve({ ok: false, error: 'the encoder stopped' });
  const x = alive.reduce((a, b) => (b.busy < a.busy ? b : a));
  x.busy += 1; j.id = (P.seq += 1);
  return new Promise((res) => {
    let over = false;
    const done = (m) => { if (over) return; over = true; x.w.off('message', on); x.w.off('error', bad); x.waits.delete(done); x.busy -= 1; res(m); };
    const on = (m) => { if (m.id === j.id) done(m); };
    const bad = (e) => done({ ok: false, error: String(e?.message || e) });
    x.w.on('message', on); x.w.once('error', bad); x.waits.add(done);
    try { x.w.postMessage(j, [j.px.buffer]); } catch (err) { bad(err); }
  });
}
// one picture → the first encoding that looks the same, or why the original stays
async function encodeOne({ role = 'color', flip = false, png = null }, dec) {
  const tried = []; let why = 'it couldn\'t be compressed';
  for (const mode of C.modes(role)) {
    const r = await job({ px: dec.px.slice(), bgra: dec.bgra, premul: dec.premul, w: dec.w, h: dec.h, png, mode, role, flip, srgb: role === 'color' });
    if (!r.ok) { why = `the encoder couldn't take it (${r.error})`; continue; }
    tried.push({ mode, psnr: +r.q.psnr.toFixed(2) });
    const v = C.verdict(mode, r.q);
    if (v.ok) return { ok: true, mode, ktx2: r.ktx2, q: r.q, alpha: r.alpha, tried };
    why = v.why;
  }
  return { ok: false, why, tried };
}
const pngOf = (bytes, dec) => (bytes[0] === 0x89 && bytes[1] === 0x50 && C.hasAlpha(dec.px) ? new Uint8Array(bytes) : null);

// ---------- a Lab scene's pictures ----------
// pics: [{ path, hash, size, role, flip }]
async function pictures(pics = [], { caps = {}, progress = () => {} } = {}) {
  const I = o.readIndex(); I.tex ||= {};
  const r0 = C.checkTex(I, pics, o.platform);
  for (const e of r0.stale) { if (e.out && exists(e.out) && !(await o.trash(e.out))) continue; delete I.tex[e.key]; }
  const made = []; const kept = []; let done = 0;
  const todo = r0.missing.filter((p) => C.canEncode(p.path) || !(kept.push({ path: p.path, why: 'only PNG and JPEG pictures are compressed' })));
  if (todo.length) {
    await startPool();
    fs.mkdirSync(texDir(), { recursive: true });
    await Promise.all(todo.map(async (p) => {
      const key = C.texKey(p); const base = { src: p.path, hash: p.hash, role: p.role || 'color', flip: Boolean(p.flip), srcBytes: p.size || 0, at: Date.now(), used: Date.now() };
      let bytes = null; try { bytes = await fs.promises.readFile(p.path); } catch { /* gone */ }
      const dec = bytes && decode(bytes);
      if (!dec) { I.tex[key] = { ...base, keep: 'the picture couldn\'t be read' }; kept.push({ path: p.path, why: I.tex[key].keep }); return; }
      const res = await encodeOne({ role: base.role, flip: base.flip, png: pngOf(bytes, dec) }, dec);
      if (res.ok) {
        const out = path.join(texDir(), `${key}.ktx2`); const tmp = `${out}.part`;
        await fs.promises.writeFile(tmp, res.ktx2); await fs.promises.rename(tmp, out);
        I.tex[key] = { ...base, out, bytes: res.ktx2.length, w: dec.w, h: dec.h, mode: res.mode, alpha: res.alpha, psnr: +res.q.psnr.toFixed(2), mean: +res.q.mean.toFixed(3), tried: res.tried };
        made.push({ path: p.path, out, mode: res.mode, w: dec.w, h: dec.h, bytes: res.ktx2.length, psnr: I.tex[key].psnr, before: C.vramOf(dec.w, dec.h, 4), after: C.vramOf(dec.w, dec.h, C.bpp(res.mode, res.alpha, caps)) });
      } else {
        I.tex[key] = { ...base, keep: res.why, w: dec.w, h: dec.h, tried: res.tried };
        kept.push({ path: p.path, why: res.why, tried: res.tried });
      }
      o.saveIndex();
      progress({ done: (done += 1), total: todo.length, path: p.path });
    }));
  }
  const keep = C.checkTex(I, pics, o.platform).fresh.map((e) => e.key);
  for (const e of C.overTex(I, { keep })) { if (e.out && exists(e.out) && !(await o.trash(e.out))) continue; delete I.tex[e.key]; }
  o.saveIndex();
  return { made, ...plan(pics, caps), keptNow: kept }; // (kept: every picture whose original stays, this time or before)
}

// ---------- the pictures inside a GLB ----------
// → { replaced, images, items: [{ name, role, w, h, mode, psnr, before, after, kept, why }], report } (output written
// only when at least one picture was replaced)
async function glb(input, output, { caps = {} } = {}) {
  const u8 = new Uint8Array(await fs.promises.readFile(input));
  let g; try { g = C.parseGlb(u8); } catch { return { replaced: 0, images: 0, items: [] }; }
  const imgs = C.glbImages(g.json);
  if (!imgs.length) return { replaced: 0, images: 0, items: [] };
  await startPool();
  const repl = new Map(); const items = [];
  await Promise.all(imgs.map(async (im) => {
    const bytes = Buffer.from(C.viewBytes(g.json, g.bin, im.bufferView));
    const dec = decode(bytes);
    if (!dec) { items.push({ name: im.name, role: im.role, kept: true, why: 'the picture couldn\'t be read' }); return; }
    const res = await encodeOne({ role: im.role, flip: false, png: pngOf(bytes, dec) }, dec);
    const before = C.vramOf(dec.w, dec.h, 4);
    if (res.ok) { repl.set(im.index, res.ktx2); items.push({ name: im.name, role: im.role, w: dec.w, h: dec.h, mode: res.mode, psnr: +res.q.psnr.toFixed(2), before, after: C.vramOf(dec.w, dec.h, C.bpp(res.mode, res.alpha, caps)) }); }
    else items.push({ name: im.name, role: im.role, w: dec.w, h: dec.h, before, kept: true, why: res.why, tried: res.tried });
  }));
  if (repl.size) { const r = C.replaceGlbImages(g.json, g.bin, repl); await fs.promises.writeFile(output, C.writeGlb(r.json, r.bin)); }
  return { replaced: repl.size, images: imgs.length, items, report: C.report(items) };
}

// ---------- what ▶ Play uses ----------
function plan(pics = [], caps = {}) {
  const I = o.readIndex(); I.tex ||= {};
  for (const [k, e] of Object.entries(I.tex)) if (e.out && !exists(e.out)) delete I.tex[k];
  const r = C.checkTex(I, pics, o.platform);
  const now = Date.now(); for (const e of r.fresh) if (I.tex[e.key]) I.tex[e.key].used = now;
  return { map: C.texMap(I, pics, caps, o.platform), fresh: r.fresh.length, missing: r.missing.length, kept: r.kept.map((e) => ({ path: e.path, why: e.keep })), report: C.texReport(I, pics, caps, o.platform), any: Boolean(caps.any) };
}

module.exports = { init, pictures, glb, plan, vendor, transcoder, stopPool, _test: { encodeOne, startPool, decode } };
