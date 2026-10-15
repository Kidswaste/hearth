// The asset library (round 24, assets stream): one library of everything the owner makes with: textures and pictures,
// HDRIs, 3D models, fonts, sounds and songs, LUTs, shaders, presets (and videos), from the owner's watched folders,
// app downloads, renders and captures, and the free libraries built in (Poly Haven, ambientCG: assets-sources.js).
// Light by design: the index is a small kv file (`assets`, records with short keys, by content hash); files stay where
// they are (a copy only when the owner says Import); nothing is scanned at startup (watched folders are scanned the
// first time the library opens, then on changes and on idle); thumbnails are made only for the cards on screen, off
// the main thread (assets-thumb-worker.js), and cached on disk by hash.
//   Assets.ready() · add(paths, extra) · watch(folder) / unwatch · scan({ force }) · search(q, o) · get(h) · find(ref)
//   Assets.use(item, target, { at, agentId, ctx }) → where it went · targets(item) (the "Use in…" menu) · labDefault(item)
//   Assets.thumb(item) (a picture URL or null, asks for one) · onChange(fn) · op(args, ctx) (three_asset for directors)
// The browser (assets-ui.js), the free sources (assets-sources.js), commands and wiring (assets-cmds.js) sit on it.
const Assets = (() => {
  const C = AssetsCore;
  const KV = 'assets';
  const api = () => window.hub?.assets;
  const fileUrl = (p) => (!p ? '' : /^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const base = C.base;
  const debounce = (fn, ms) => { let t = 0; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  const need = async (...groups) => { for (const g of groups) { try { await window.Lazy?.load?.(g); } catch { /* not a lazy group here */ } } };

  // ---------- the index ----------
  let db = null; let loading = null; let dirs = null;
  const listeners = new Set();
  const emit = (why, data) => { for (const fn of listeners) { try { fn(why, data); } catch (err) { console.warn(err); } } };
  const save = debounce(() => { if (db) window.hub.kvSet(KV, db); }, 600);
  function changed(why = 'change', data = null) { save(); emit(why, data); }
  async function ready() {
    if (db) return db;
    loading ||= (async () => {
      db = C.normalize(await window.hub.kvGet(KV, null));
      try { dirs = await api()?.status(); } catch { dirs = null; }
      return db;
    })();
    return loading;
  }
  const all = () => (db ? C.list(db) : []);
  // files this computer doesn't have (the index syncs with your other computer, whose paths differ; a drive that's
  // unplugged): faded and not used, never deleted from the shared index (assets come back when the file does)
  const missing = new Set();
  const away = (it) => Boolean(it?.g || missing.has(it?.h));
  async function checkHere() {
    await ready();
    const items = all();
    const ex = await api().exists(items.map((x) => x.p)).catch(() => null);
    if (!ex) return 0;
    missing.clear();
    items.forEach((it, i) => { if (!ex[i]) missing.add(it.h); });
    if (missing.size) emit('edit');
    return missing.size;
  }
  const get = (h) => db?.items[h] || null;
  // an item from what a chat / a director / a command names: a hash (or its start), "#3" in the last list, a path, a name
  let lastList = [];
  function find(ref) {
    const s = String(ref ?? '').trim();
    if (!s || !db) return null;
    const k = /^#?(\d+)$/.exec(s);
    if (k && lastList[Number(k[1]) - 1]) return get(lastList[Number(k[1]) - 1]) || null;
    return get(s) || C.byId(db, s) || C.byPath(db, s) || C.search(db, s)[0] || null;
  }
  const remember = (items) => { lastList = items.map((x) => x.h); return items; };
  function search(q = '', o = {}) {
    if (!db) return [];
    const P = C.parseQuery(q);
    const proj = o.project || P.project;
    const inProject = proj ? projectTest(proj) : null;
    return C.search(db, P, { ...o, inProject });
  }

  // ---------- adding files (by reference) ----------
  const isAbs = (p) => /^([a-zA-Z]:[\\/]|\/)/.test(String(p || ''));
  // paths → hashed → in the index (a known hash gains this place; folders become watched folders)
  async function add(paths, extra = {}) {
    await ready();
    const list = (Array.isArray(paths) ? paths : [paths]).map(String).filter(isAbs);
    const out = [];
    const files = [];
    for (const p of list) {
      const st = await window.hub.fs.stat(p).catch(() => null);
      if (st?.isDir) { await watch(p); continue; }
      if (!C.kindOf(p) && !extra.k) continue;
      files.push(p);
    }
    if (!files.length) return out;
    const r = await api().hash(files);
    let dups = 0;
    for (const f of r?.files || []) {
      if (f.missing) continue;
      const u = C.upsert(db, f, extra);
      if (u.item) { out.push(u.item); if (u.dup) dups += 1; }
    }
    if (out.length) changed('add', { items: out, dups });
    return out;
  }

  // ---------- watched folders ----------
  let scanning = null; let lastScan = 0;
  const folders = () => db?.folders || [];
  async function watch(folder) {
    await ready();
    const p = String(folder || '').replace(/[\\/]+$/, '');
    if (!isAbs(p)) throw new Error('A folder path, please (or ＋ › Watch a folder… in the library).');
    if (!folders().some((f) => f.p === p)) db.folders.push({ p, on: true, at: 0, n: 0 });
    changed('folders');
    await scan({ only: [p], force: true });
    return db.folders.find((f) => f.p === p);
  }
  async function unwatch(folder, { forgetItems = false } = {}) {
    await ready();
    const f = folders().find((x) => x.p === folder || base(x.p).toLowerCase() === String(folder).toLowerCase());
    if (!f) return null;
    db.folders = folders().filter((x) => x !== f);
    if (forgetItems) for (const it of all()) if (it.src === 'folder' && it.p.startsWith(f.p) && !it.f && !it.ut) C.forget(db, it.h);
    api()?.watch(folders().filter((x) => x.on).map((x) => x.p));
    changed('folders');
    return f;
  }
  // walk + hash in the main process's worker; unchanged files (same size and time) aren't read again
  async function scan({ only = null, force = false } = {}) {
    await ready();
    if (scanning) return scanning;
    const want = folders().filter((f) => f.on && (!only || only.includes(f.p)) && (force || Date.now() - (f.at || 0) > 10 * 60000));
    if (!want.length) return { added: 0, removed: 0, folders: 0 };
    scanning = (async () => {
      const known = {};
      for (const it of all()) for (const p of [it.p, ...(it.alt || [])]) if (want.some((f) => p.startsWith(f.p))) known[p] = [it.s, it.m, it.h];
      const r = await api().scan({ roots: want.map((f) => f.p), known });
      if (!r?.ok) throw new Error(r?.error || 'The scan failed');
      const seen = new Set(); let added = 0; let removed = 0;
      for (const f of r.files) {
        seen.add(f.p);
        const u = C.upsert(db, f, { src: 'folder', o: base(f.root), root: f.root });
        if (u.added) added += 1;
      }
      // what was under these folders and isn't anymore (not after a capped scan: unseen ≠ gone)
      if (!r.skipped) for (const it of all()) for (const p of [it.p, ...(it.alt || [])]) if (want.some((f) => p.startsWith(`${f.p}`)) && !seen.has(p)) { C.gone(db, p); removed += 1; }
      for (const f of want) { f.at = Date.now(); f.n = r.files.filter((x) => x.root === f.p).length; }
      lastScan = Date.now();
      api()?.watch(folders().filter((x) => x.on).map((x) => x.p));
      changed('scan', { added, removed });
      return { added, removed, folders: want.length, skipped: r.skipped || 0 };
    })();
    try { return await scanning; } finally { scanning = null; }
  }
  // scanned on first open, on changes (debounced by the main side) and when the app is idle (at most hourly)
  let idleArmed = false;
  function armIdle() {
    if (idleArmed) return; idleArmed = true;
    const tick = () => {
      if (folders().some((f) => f.on) && Date.now() - lastScan > 60 * 60000 && !(window.Jank?.busy?.())) (window.requestIdleCallback || setTimeout)(() => scan().catch(() => {}), { timeout: 30000 });
      setTimeout(tick, 15 * 60000);
    };
    setTimeout(tick, 5 * 60000);
  }

  // ---------- projects (filters, "Add to project") ----------
  function projectTest(name) {
    const P = window.Projects;
    if (!P?.live) return () => false;
    const n = C.norm(name);
    const p = P.live().find((x) => C.norm(x.name) === n) || P.live().find((x) => C.norm(x.name).includes(n));
    if (!p) return () => false;
    const files = new Set(); const dirs0 = [];
    for (const x of p.items || []) if (['file', 'download', 'render', 'capture', 'folder'].includes(x.type) && typeof x.ref === 'string') { files.add(x.ref); if (x.type === 'folder' || !/\.[a-z0-9]{2,5}$/i.test(x.ref)) dirs0.push(x.ref); }
    return (it) => (it.pj || []).includes(p.id) || files.has(it.p) || dirs0.some((d) => it.p.startsWith(d));
  }
  async function toProject(it, projectId) {
    await need('projects');
    const p = window.Projects?.get?.(projectId);
    if (!p) throw new Error('No such project');
    Projects.add(p, 'file', it.p, it.n, { links: false });
    it.pj = [...new Set([...(it.pj || []), p.id])];
    changed('edit', { items: [it] });
    return p;
  }

  // ---------- thumbnails (lazy: only cards on screen ask; made off the main thread) ----------
  let worker = null; let wseq = 0; const wjobs = new Map(); let wIdle = 0;
  function rpc(msg, transfer = []) {
    if (worker === false) return Promise.reject(new Error('no worker'));
    if (!worker) {
      try { worker = new Worker('assets-thumb-worker.js'); } catch { worker = false; return Promise.reject(new Error('no worker')); }
      worker.onmessage = (e) => { const j = wjobs.get(e.data?.id); if (j) { wjobs.delete(e.data.id); j(e.data); } };
      worker.onerror = () => { for (const j of wjobs.values()) j({ ok: false, error: 'worker failed' }); wjobs.clear(); };
    }
    clearTimeout(wIdle);
    wIdle = setTimeout(() => { if (!wjobs.size && worker) { worker.terminate(); worker = null; } }, 30000); // freed when idle
    const id = ++wseq;
    return new Promise((resolve) => { wjobs.set(id, resolve); worker.postMessage({ ...msg, id }, transfer); });
  }
  const queue = []; const queued = new Set(); let running = 0;
  const thumbPath = (h) => (dirs?.thumbs ? `${dirs.thumbs.replace(/[\\/]+$/, '')}/${h}.webp` : null);
  function thumb(it, { ask = true } = {}) {
    if (!it) return null;
    if (it.tp) return fileUrl(it.tp);
    if (it.t === 1 && thumbPath(it.h)) return fileUrl(thumbPath(it.h));
    if (ask && !it.t && !away(it)) want(it);
    return null;
  }
  function want(it) {
    if (queued.has(it.h)) return;
    queued.add(it.h); queue.push(it.h);
    pump();
  }
  // forget what's queued but no longer on screen (a fast scroll past 2,000 cards asks only for the last screenful)
  function unwant(keep) { for (let i = queue.length - 1; i >= 0; i -= 1) if (!keep.has(queue[i])) { queued.delete(queue[i]); queue.splice(i, 1); } }
  function pump() {
    while (running < 2 && queue.length) {
      const h = queue.pop(); // the newest ask first: what's on screen now
      running += 1;
      const it = get(h);
      (it ? make(it) : Promise.resolve()).catch((err) => { if (it) { it.t = -1; it.te = String(err.message || err).slice(0, 80); } })
        .finally(() => { running -= 1; queued.delete(h); if (it) changed('thumb', { h }); setTimeout(pump, 0); });
    }
  }
  async function storeWebp(it, webp) {
    if (!webp) { it.t = -1; return; }
    await api().saveThumb(it.h, new Uint8Array(webp));
    it.t = 1;
  }
  async function bytes(p, max) { const b = await api().read(p, max); if (!b) throw new Error('unreadable or too big'); return b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b; }
  async function make(it) {
    const x = it.x;
    if (it.k === 'image') {
      if (x === 'svg') return storeWebp(it, await mainThreadPicture(fileUrl(it.p)));
      if (/^(tga|tiff?|ktx2)$/.test(x)) { it.t = -1; return null; }
      const b = await bytes(it.p, 80 * 1048576);
      const r = await rpc({ kind: 'image', bytes: b }, [b]);
      if (!r.ok) throw new Error(r.error);
      it.i = { ...(it.i || {}), ...r.info };
      return storeWebp(it, r.webp);
    }
    if (it.k === 'hdri') {
      if (x !== 'hdr') { it.t = -1; return null; }
      const b = await bytes(it.p, 120 * 1048576);
      const r = await rpc({ kind: 'hdr', bytes: b }, [b]);
      if (!r.ok) throw new Error(r.error);
      it.i = { ...(it.i || {}), ...r.info };
      return storeWebp(it, r.webp);
    }
    if (it.k === 'model') {
      // the Lab's own picture of the model (taken the first time it drew it: tools/three-models.js)
      const lab = await labThumb(it);
      if (lab) { it.tp = lab; return null; }
      if (x !== 'glb') { it.t = -1; return null; }
      const b = await bytes(it.p, 150 * 1048576);
      const r = await rpc({ kind: 'glb', bytes: b }, [b]);
      if (!r.ok) throw new Error(r.error);
      it.i = { ...(it.i || {}), ...r.info };
      if (!r.webp) { it.t = -1; it.lab = 1; return null; } // no picture inside: the Lab makes one when it's used
      return storeWebp(it, r.webp);
    }
    if (it.k === 'font') {
      const b = await bytes(it.p, 30 * 1048576);
      const r = await rpc({ kind: 'font', bytes: b }, [b]);
      if (!r.ok) throw new Error(r.error);
      if (r.info?.family) { it.i = { ...(it.i || {}), fam: r.info.family }; if (!it.rn) it.n = r.info.family; }
      return storeWebp(it, r.webp);
    }
    if (it.k === 'sound') {
      if (x === 'wav') {
        const b = await bytes(it.p, 200 * 1048576);
        const r = await rpc({ kind: 'wav', bytes: b }, [b]);
        if (!r.ok) throw new Error(r.error);
        it.i = { ...(it.i || {}), ...r.info };
        return storeWebp(it, r.webp);
      }
      const p = await decodedPeaks(it.p);
      it.i = { ...(it.i || {}), dur: p.dur };
      const r = await rpc({ kind: 'peaks', peaks: p.peaks }, [p.peaks.buffer]);
      if (!r.ok) throw new Error(r.error);
      return storeWebp(it, r.webp);
    }
    if (it.k === 'lut') {
      if (x !== 'cube') { it.t = -1; return null; }
      const text = await api().readText(it.p);
      const r = await rpc({ kind: 'lut', text });
      if (!r.ok) throw new Error(r.error);
      it.i = { ...(it.i || {}), ...r.info };
      return storeWebp(it, r.webp);
    }
    if (it.k === 'video') return storeWebp(it, await videoFrame(fileUrl(it.p)));
    // shaders and presets: their card shows their first line, no picture
    if (it.k === 'shader' || it.k === 'preset') {
      const t = await api().readText(it.p, 200000).catch(() => '');
      let first = firstLine(t);
      if (it.k === 'preset') { try { const j = JSON.parse(t); const n = Object.keys(j.values || j.sliders || j.set || {}).length; first = j.code ? 'a whole layer' : `${n} slider${n === 1 ? '' : 's'}${j.layer ? ` · from ${String(j.layer).replace(/^\W+\s*/, '')}` : ''}`; } catch { /* not JSON: its first line */ } }
      it.i = { ...(it.i || {}), first }; it.t = -1; return null;
    }
    it.t = -1;
    return null;
  }
  const firstLine = (t) => String(t || '').split('\n').map((l) => l.replace(/^\s*(\/\/+|\/\*+|\*|#)\s*/, '').trim()).find((l) => l && !/^[{}[\]]$/.test(l))?.slice(0, 80) || '';
  async function labThumb(it) {
    try {
      const lib = (window.ThreeModels ? await ThreeModels.library() : await window.hub.kvGet('lab3d-library', [])) || [];
      const m = lib.find((x) => x.thumb && (x.path === it.p || base(x.path) === base(it.p)));
      if (!m) return null;
      return /^data:/.test(m.thumb) ? null : m.thumb;
    } catch { return null; }
  }
  // a song decoded by the browser (MP3, M4A, OGG, FLAC: the decode runs off the main thread), peaks taken sparsely
  async function decodedPeaks(p) {
    const b = await bytes(p, 60 * 1048576);
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new AC(1, 2, 44100);
    const buf = await ctx.decodeAudioData(b);
    const d = buf.getChannelData(0); const n = 200; const per = Math.floor(d.length / n); const peaks = new Float32Array(n);
    const stride = Math.max(1, Math.floor(per / 48));
    for (let i = 0; i < n; i += 1) { let m = 0; for (let j = i * per; j < (i + 1) * per; j += stride) { const v = Math.abs(d[j]); if (v > m) m = v; } peaks[i] = m; }
    return { peaks, dur: +buf.duration.toFixed(2) };
  }
  async function mainThreadPicture(url) {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    const cv = new OffscreenCanvas(256, 256); const g = cv.getContext('2d');
    const w = img.naturalWidth || 256; const h = img.naturalHeight || 256; const k = Math.max(256 / w, 256 / h);
    g.fillStyle = '#14161b'; g.fillRect(0, 0, 256, 256); g.drawImage(img, (256 - w * k) / 2, (256 - h * k) / 2, w * k, h * k);
    return (await cv.convertToBlob({ type: 'image/webp', quality: 0.82 })).arrayBuffer();
  }
  async function videoFrame(url) {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
    try {
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('the video did not load')); setTimeout(() => j(new Error('slow video')), 8000); });
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
      await new Promise((r) => { v.onseeked = r; setTimeout(r, 3000); });
      const w = v.videoWidth || 256; const h = v.videoHeight || 256; const k = Math.max(256 / w, 256 / h);
      const cv = new OffscreenCanvas(256, 256); const g = cv.getContext('2d');
      g.drawImage(v, (256 - w * k) / 2, (256 - h * k) / 2, w * k, h * k);
      return (await cv.convertToBlob({ type: 'image/webp', quality: 0.8 })).arrayBuffer();
    } finally { v.removeAttribute('src'); v.load(); }
  }

  // ---------- using an asset somewhere ----------
  // Lab layers this file writes itself: a picture (texture) layer and a text layer in a font
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' ')}'`;
  const pictureCode = (key, name) => `// 🖼 ${String(name).replace(/[\r\n]+/g, ' ').slice(0, 80)}: a picture (refs.${key}) from the asset library, on a 2D layer.
const P = tweak({
  fit: { value: 'cover', options: ['cover', 'contain', 'stretch', 'tile'], label: 'Fit', group: 'Picture' },
  scale: { value: 1, min: 0.1, max: 4, label: 'Scale', group: 'Picture' },
  x: { value: 0, min: -1, max: 1, label: 'Left / right', group: 'Picture' },
  y: { value: 0, min: -1, max: 1, label: 'Up / down', group: 'Picture' },
  drift: { value: 0, min: -1, max: 1, label: 'Drift', group: 'Motion' },
  opacity: { value: 1, min: 0, max: 1, label: 'Opacity', group: 'Picture' },
  punch: { value: 0, min: 0, max: 1, label: 'Kick punch', group: 'Music', hint: '0 = calm' },
});
const cv = document.createElement('canvas');
cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
document.body.append(cv);
const g = cv.getContext('2d');
let W = 0; let H = 0;
const fit = () => { W = cv.width = Math.round(innerWidth * devicePixelRatio); H = cv.height = Math.round(innerHeight * devicePixelRatio); };
fit();
addEventListener('resize', fit);
const img = new Image();
img.src = refs.${key};
let kick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  kick = Math.max(kick * 0.88, audio.kick);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!img.complete || !img.naturalWidth) return;
  const iw = img.naturalWidth; const ih = img.naturalHeight;
  const k0 = P.fit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
  const s = k0 * P.scale * (1 + kick * P.punch * 0.15);
  const dx = (P.x + P.drift * now / 20000) * W; const dy = P.y * H;
  g.globalAlpha = P.opacity;
  if (P.fit === 'stretch') { g.drawImage(img, dx, dy, W * P.scale, H * P.scale); return; }
  if (P.fit === 'tile') {
    const tw = iw * P.scale * devicePixelRatio * 0.5; const th = ih * P.scale * devicePixelRatio * 0.5;
    for (let ty = ((dy % th) + th) % th - th; ty < H; ty += th) for (let tx = ((dx % tw) + tw) % tw - tw; tx < W; tx += tw) g.drawImage(img, tx, ty, tw, th);
    return;
  }
  g.drawImage(img, (W - iw * s) / 2 + dx, (H - ih * s) / 2 + dy, iw * s, ih * s);
}
requestAnimationFrame(frame);
`;
  const textCode = (key, name, words) => `// 🔤 ${String(name).replace(/[\r\n]+/g, ' ').slice(0, 80)}: text in a font from the asset library (refs.${key}).
const P = tweak({
  text: { value: ${q(words)}, options: [${q(words)}, 'HEARTH', 'NEW MUSIC', 'OUT NOW', 'MADE WITH HEARTH'], label: 'Text', group: 'Text' },
  size: { value: 0.16, min: 0.03, max: 0.6, label: 'Size', group: 'Text' },
  y: { value: 0.5, min: 0, max: 1, label: 'Position Y', group: 'Text' },
  tracking: { value: 0.02, min: -0.1, max: 0.5, label: 'Letter spacing', group: 'Text' },
  color: { value: '#ffffff', label: 'Color', group: 'Color' },
  glowColor: { value: '#ff8a3d', label: 'Glow color', group: 'Color' },
  glow: { value: 0, min: 0, max: 80, label: 'Glow', group: 'Look' },
  punch: { value: 0, min: 0, max: 1, label: 'Kick punch', group: 'Music', hint: '0 = calm' },
});
const face = new FontFace('AssetFont_${key}', 'url("' + refs.${key} + '")');
document.fonts.add(face);
face.load().catch((err) => console.error('The font did not load:', err?.message || err));
const cv = document.createElement('canvas');
cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
document.body.append(cv);
const g = cv.getContext('2d');
let W = 0; let H = 0;
const fit = () => { W = cv.width = Math.round(innerWidth * devicePixelRatio); H = cv.height = Math.round(innerHeight * devicePixelRatio); };
fit();
addEventListener('resize', fit);
let kick = 0;
function frame() {
  requestAnimationFrame(frame);
  kick = Math.max(kick * 0.88, audio.kick);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const s = Math.min(W, H) * P.size * (1 + kick * P.punch * 0.12);
  g.font = Math.round(s) + 'px "AssetFont_${key}", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = Math.round(s * P.tracking) + 'px';
  g.shadowColor = P.glowColor;
  g.shadowBlur = P.glow;
  g.fillStyle = P.color;
  g.fillText(P.text, W / 2, H * P.y);
}
requestAnimationFrame(frame);
`;
  async function lab() { await need('lab', 'apps'); return ThreeLab.cmd(); }
  async function labRef(p) { await lab(); return ThreeLab.addReference(p); }
  async function labLayers(ctx = {}) { const r = await HubBridge.call('three_layers', { report: 'full' }, { chatId: ctx.chatId || null }); return r?.ok ? r.value.layers || [] : []; }
  async function selectedLayer(ctx) { const ls = await labLayers(ctx); return ls.find((L) => L.selected) || null; }
  async function isShaderLayer(L) { if (!L) return false; try { return /\bshader\s*\(/.test(ThreeLab.director?.codeOf(L.id)?.code || ''); } catch { return false; } }
  async function addLayer(name, code, ctx = {}) {
    const r = await HubBridge.call('three_add_layer', { name, code, wait: 1.5 }, { chatId: ctx.chatId || null });
    if (!r?.ok) throw new Error(r?.error || 'The Lab didn\'t add the layer');
    return r.value?.added || name;
  }
  // the Lab's best use of each kind (a drop on the preview, a click on "Use")
  function labDefault(it) {
    return { image: 'picture', hdri: 'sky', model: 'model', font: 'text', sound: 'song', lut: 'lut', shader: 'shader', preset: 'preset', video: 'footage' }[it.k] || 'ref';
  }
  const LABEL = {
    picture: '🖼 A picture layer', channel: '◇ Into the selected shader', sky: '🌅 The sky (lights the model)', skylayer: '🌅 A sky layer of its own', model: '🧊 A model layer', replace: '⇄ Replace the selected model',
    clips: '🕺 Its animations on the model', text: '🔤 A text layer in this font', song: '♪ The Lab\'s song', footage: '🎞 The Lab\'s footage', sfx: '✸ A sound in the sequence', lut: '🎞 The grade (LUT)',
    shader: '◇ A shader layer', preset: '🎚 On the selected layer', ref: '📎 A reference of the scene', sequence: '▤ The sequence', board: '▦ The board', chat: '💬 This chat', reveal: 'Show the file',
  };
  // what "Use in…" offers for an item (the menu, /assets use, the director)
  function targets(it) {
    const lab0 = {
      image: ['picture', 'channel', 'ref', 'sequence'], hdri: ['sky', 'skylayer', 'ref'], model: ['model', 'replace', 'clips', 'ref'], font: ['text', 'ref'], sound: ['song', 'sfx', 'ref'],
      lut: ['lut', 'ref'], shader: ['shader', 'ref'], preset: ['preset'], video: ['footage', 'sequence', 'ref'],
    }[it.k] || ['ref'];
    return [...lab0, 'board', 'chat'];
  }
  async function use(it, target = null, o = {}) {
    if (!it) throw new Error('Which asset? (/assets find <words>, then /assets use #n)');
    if (away(it)) throw new Error(`${it.n} isn't on this computer (${it.p}).`);
    const t = target || labDefault(it);
    const p = it.p; const ctx = o.ctx || {};
    let what = '';
    switch (t) {
      case 'model': case 'replace': {
        await lab();
        const r = await ThreeModels.add(p, { name: it.n, source: C.SOURCES[it.src] || 'Assets', replace: t === 'replace' ? true : null, ctx });
        what = t === 'replace' ? `⇄ ${it.n} replaced ${r.replaced}` : `🧊 ${it.n} is a model layer`;
        break;
      }
      case 'clips': { await lab(); await ThreeModels.addClip(p, { ctx }); what = `🕺 ${it.n}'s animations are in the model's Clip slider`; break; }
      case 'sky': { await lab(); const r = await AppsLab.addHdri(p, { name: it.n }); what = `🌅 ${it.n} ${r?.sky || r?.layer ? `lights ${r.layer || 'the scene'}` : 'is the sky'}`; break; }
      case 'skylayer': { await lab(); await AppsLab.addHdri(p, { name: it.n, legacy: true }); what = `🌅 ${it.n} is a sky layer`; break; }
      case 'picture': {
        const sel = o.channel == null ? await selectedLayer(ctx).catch(() => null) : null;
        if (o.smart !== false && (await isShaderLayer(sel))) return use(it, 'channel', { ...o, layer: sel.id });
        const r = await labRef(p);
        const name = await addLayer(`🖼 ${it.n.slice(0, 40)}`, pictureCode(r.key, it.n), ctx);
        what = `🖼 ${it.n} is a picture layer (${name})`;
        break;
      }
      case 'channel': {
        const L = o.layer || (await selectedLayer(ctx))?.id;
        if (!L || !(await isShaderLayer({ id: L }))) throw new Error('Select a shader layer (◇) first: the picture goes into its iChannel.');
        const r = await labRef(p);
        const ch = o.channel ?? 0;
        const out = await LabShader.setChannel(L, 'image', ch, `ref:${r.key}`, ctx);
        what = `◇ ${it.n} → ${out?.set || `iChannel${ch}`}`;
        break;
      }
      case 'text': {
        const r = await labRef(p);
        const words = o.words || 'HEARTH';
        const name = await addLayer(`🔤 ${(it.i?.fam || it.n).slice(0, 40)}`, textCode(r.key, it.i?.fam || it.n, words), ctx);
        what = `🔤 ${name}: text in ${it.i?.fam || it.n}`;
        break;
      }
      case 'song': case 'footage': { await need('apps'); await Apps.route(p, 'lab-song', { name: it.n }); what = t === 'song' ? `♪ ${it.n} is the Lab's song` : `🎞 ${it.n} is in the Lab`; break; }
      case 'sfx': case 'sequence': {
        await lab();
        await ThreeSeq.add(t === 'sfx' ? { path: p, role: 'sfx' } : { path: p }, { at: o.at ?? null });
        what = `▤ ${it.n} is in the sequence`;
        break;
      }
      case 'lut': {
        // the grade's own LUT input when it's there (round 24, grade stream); else a reference the director can use
        const ev = new CustomEvent('hearth:asset-use', { detail: { kind: 'lut', path: p, name: it.n, handled: null } });
        dispatchEvent(ev);
        if (ev.detail.handled) { what = `🎞 ${it.n} grades the scene`; break; }
        if (typeof Commands !== 'undefined' && Commands.get('grade')) {
          await Commands.exec(`/grade lut ${p}`, o.agentId || H.claudeAgent?.()?.id);
          what = `🎞 ${it.n} grades the scene`;
          break;
        }
        const r = await labRef(p);
        what = `🎞 ${it.n} is the scene's reference ${r.key} (the grade reads LUTs from there)`;
        break;
      }
      case 'shader': {
        await lab();
        const text = await api().readText(p, 400000);
        if (!text) throw new Error('That shader file couldn\'t be read');
        await LabShader.addGlsl(text, { name: it.n.slice(0, 40), ctx });
        what = `◇ ${it.n} is a shader layer`;
        break;
      }
      case 'preset': {
        const text = await api().readText(p, 400000);
        let j; try { j = JSON.parse(text); } catch { throw new Error('That preset isn\'t JSON'); }
        await lab();
        if (j.code) { await addLayer(j.name || it.n, j.code, ctx); what = `🎚 ${it.n} is a layer`; break; }
        const set = j.values || j.sliders || j.set || j;
        const L = await selectedLayer(ctx);
        if (!L) throw new Error('Select a layer first: the preset sets its sliders.');
        const r = await HubBridge.call('three_sliders', { layer: L.id, set, report: 'full' }, { chatId: ctx.chatId || null });
        if (!r?.ok) throw new Error(r?.error || 'The sliders didn\'t take it');
        what = `🎚 ${it.n} on ${L.name} (${(r.value?.changed || Object.keys(set)).length || 0} sliders)`;
        break;
      }
      case 'ref': { const r = await labRef(p); what = `📎 ${it.n} is refs.${r.key} in the scene`; break; }
      case 'board': {
        await need('board');
        if (o.at && typeof Board !== 'undefined') { await Board.addFiles([p], o.at); what = `▦ ${it.n} is on the board`; break; }
        await Apps.route(p, 'board', { name: it.n });
        what = `▦ ${it.n} is on the board`;
        break;
      }
      case 'chat': {
        const ag = o.agentId ? H.agent(o.agentId) : (window.Apps?.chatAgent?.() || H.claudeAgent());
        if (!ag) throw new Error('No chat');
        if (o.activate !== false) activate(ag.id);
        // what the chat can open goes as it is (pictures, text-like files, any file when the agent has file access);
        // the rest (a font, a model, a sound) as its picture plus a line naming it and where it is
        const readable = it.k === 'image' && !/^(tga|tiff?|ktx2|svg)$/.test(it.x) || /^(glsl|frag|vert|json|svg)$/.test(it.x) || ag.workspace || (typeof Access !== 'undefined' && Access.isOn?.(ag.id));
        if (readable) await Native.attachPaths(ag.id, [p]);
        else {
          if (it.t === 1 && thumbPath(it.h)) Native.view(ag.id)?.attachments.push({ kind: 'image', name: `${it.n} · ${C.KINDS[it.k]?.one || it.k}`, path: thumbPath(it.h), preview: fileUrl(thumbPath(it.h)) });
          Native.insertDraft(ag.id, `${C.KINDS[it.k]?.icon || ''} ${it.n} (${C.KINDS[it.k]?.one || it.k}${it.tg?.length ? `, #${it.tg.slice(0, 4).join(' #')}` : ''}): ${p}\n`);
          Native.renderChips?.(ag.id);
        }
        what = `💬 ${it.n} is attached in ${ag.name}`;
        break;
      }
      case 'reveal': await window.hub.fs.reveal(p); return 'shown';
      default: throw new Error(`Use it in: ${targets(it).join(', ')}`);
    }
    C.touch(it);
    changed('use', { items: [it], target: t });
    return what;
  }
  // a preset asset made from the selected layer's sliders (the loop back: presets are assets too)
  async function savePreset(name = null, ctx = {}) {
    await lab();
    const L = await selectedLayer(ctx);
    if (!L) throw new Error('Select a layer first');
    const r = await HubBridge.call('three_sliders', { layer: L.id, report: 'full' }, { chatId: ctx.chatId || null });
    if (!r?.ok) throw new Error(r?.error || 'No sliders');
    const values = Object.fromEntries((r.value.sliders || []).map((s) => [s.key, s.value]));
    const nm = name || `${String(L.name).replace(/^\W+\s*/, '')} preset`;
    const p = await api().writePreset(nm, { kind: 'hearth-preset', name: nm, layer: L.name, values, at: Date.now() });
    const [it] = await add([p], { src: 'lab', o: L.name, n: nm, k: 'preset', tg: ['preset'] });
    return it;
  }
  // a copy into data/assets/<kind> (the owner asked: everything else stays where it is)
  async function importCopy(it) {
    const [np] = await api().import([it.p], it.k);
    if (!np) throw new Error('The copy failed');
    it.alt = [...new Set([...(it.alt || []), it.p])].slice(-5);
    it.p = np; it.src = 'import';
    changed('edit', { items: [it] });
    return np;
  }

  // ---------- the director's lean op: three_do asset { op } ----------
  const OPS = 'find {q, kind, limit} | use {id|q, as} | free {q, source: polyhaven|ambientcg, type: hdris|textures|models|materials} | get {source, id, type, size, use} | help';
  const HELP = `ASSET LIBRARY (three_do asset { op }): the owner's textures, HDRIs, 3D models, fonts, sounds, LUTs, shaders, presets (watched folders, app downloads, renders, captures, Poly Haven, ambientCG), by reference.
ops: ${OPS}.
find → [{id, name, kind, tags}] (q: words, kind:x, tag:y, fav); use {id, as}: as = picture | channel (selected shader's iChannel) | sky | skylayer | model | replace | clips | text {words} | song | footage | sfx | sequence | lut | shader | preset | ref | board; default by kind (image→picture, hdri→sky, model→model, font→text, sound→song, lut→lut). free searches the CC0 libraries without downloading; get downloads one into the library (size 1k|2k|4k; use: true also puts it in the scene).`;
  async function op(a = {}, ctx = {}) {
    await ready();
    const o = String(a.op || a.action || 'find').toLowerCase();
    if (o === 'help') return HELP;
    if (o === 'find' || o === 'list' || o === 'search') {
      const found = remember(search(String(a.q || a.query || '').trim(), { kind: a.kind ? C.KIND_WORDS[C.norm(a.kind)] || a.kind : null }));
      const n = Math.min(Number(a.limit) || 8, 20);
      return { found: found.slice(0, n).map(C.brief), ...(found.length > n ? { more: found.length - n } : {}), ...(found.length ? {} : { hint: 'Nothing in the library: try op free (Poly Haven, ambientCG).' }) };
    }
    if (o === 'use') {
      const it = find(a.id || a.q || a.item || '');
      if (!it) throw new Error(`No asset "${a.id || a.q || ''}" (op find first).`);
      return await use(it, a.as || a.target || null, { ctx, words: a.words, at: a.at, channel: a.channel, agentId: ctx.agentId || null, activate: false });
    }
    if (o === 'free' || o === 'get') {
      await need('assets');
      if (!window.AssetsFree) throw new Error('The free sources aren\'t loaded');
      if (o === 'free') { const r = await AssetsFree.search(a.q || a.query || '', { source: a.source, type: a.type }); return { results: r.slice(0, Math.min(Number(a.limit) || 8, 20)).map((x) => ({ source: x.source, id: x.id, name: x.name, type: x.type, tags: x.tags.slice(0, 4) })) }; }
      const it = await AssetsFree.get({ source: a.source || 'polyhaven', id: a.id, type: a.type, size: a.size || null });
      if (!it) throw new Error('The download failed');
      const used = a.use ? await use(it, a.as || null, { ctx, activate: false }) : null;
      return { asset: C.brief(it), ...(used ? { used } : {}) };
    }
    throw new Error(`asset ops: ${OPS}`);
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_asset'], async (_tool, args, ctx) => {
    try { return { ok: true, value: await op(args, ctx) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  return {
    ready, all, get, find, away, checkHere, missing, search, remember, add, watch, unwatch, scan, folders, armIdle, thumb, want, unwant, use, targets, labDefault, LABEL, savePreset, importCopy, toProject, projectTest,
    op, HELP, OPS, fileUrl, changed, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, get db() { return db; }, get dirs() { return dirs; }, pictureCode, textCode,
    _: { make, rpc, queue: () => queue.slice(), running: () => running },
  };
})();
window.Assets = Assets;
