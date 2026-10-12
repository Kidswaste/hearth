// The asset library's model (round 24, assets stream): no DOM, no IPC, Node-testable (dev/assets-test.js).
// One index of everything the owner makes with (textures / images, HDRIs, 3D models, fonts, sounds, LUTs, shaders,
// presets, videos), kept small in kv `assets` and stored by reference: an item is a file where it already lives, keyed
// by its content hash, so the same file found twice (a download and a copy in a watched folder) is one asset with a
// second place (`alt`), never two cards.
//   kinds:   KINDS, kindOf(path) → 'image' | 'hdri' | 'model' | 'font' | 'sound' | 'lut' | 'shader' | 'preset' | 'video' | null
//   index:   empty(), normalize(db), upsert(db, file, extra) → { item, added, dup }, forget, gone, setTags, toggleFav, touch
//   search:  parseQuery('brick kind:image tag:wall fav src:polyhaven'), search(db, q, { kind, tag, src, project, fav, sort })
//   sources: polyList / polyFiles / acgList / acgFiles turn the free libraries' JSON into result cards and file picks
// Record (short keys keep the kv file small): { h: hash, n: name, p: path, k: kind, x: ext, s: size, m: mtime,
//   src: folder | download | render | capture | polyhaven | ambientcg | import | file | lab, o: origin (app, folder, id),
//   tg: [tags], f: 1 favorite, t: 1 thumbnail cached | -1 none possible, tp: a thumbnail path made elsewhere (the Lab),
//   a: added, u: last used, i: { w, h, dur, maps, lic, clips… } small facts, alt: [other paths], g: 1 file gone }
const AssetsCore = (() => {
  const KINDS = {
    image: { label: 'Textures & images', one: 'image', icon: '🖼', re: /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|tga|svg|ktx2)$/i },
    hdri: { label: 'HDRIs', one: 'HDRI', icon: '🌅', re: /\.(hdr|exr)$/i },
    model: { label: '3D models', one: 'model', icon: '🧊', re: /\.(glb|gltf|fbx|obj|stl|ply|usdz)$/i },
    font: { label: 'Fonts', one: 'font', icon: '🔤', re: /\.(ttf|otf|woff2?)$/i },
    sound: { label: 'Sounds & songs', one: 'sound', icon: '🎵', re: /\.(wav|mp3|ogg|oga|m4a|flac|aac|aiff?|opus)$/i },
    lut: { label: 'LUTs', one: 'LUT', icon: '🎞', re: /\.(cube|3dl)$/i },
    shader: { label: 'Shaders', one: 'shader', icon: '◇', re: /\.(glsl|frag|fs|vert|isf|wgsl)$/i },
    preset: { label: 'Presets', one: 'preset', icon: '🎚', re: /\.(hpreset|hlook)$|(^|[\\/])[^\\/]*\.(preset|look)\.json$/i },
    video: { label: 'Videos', one: 'video', icon: '🎬', re: /\.(mp4|webm|mov|m4v|mkv)$/i },
  };
  const ORDER = ['image', 'hdri', 'model', 'font', 'sound', 'lut', 'shader', 'preset', 'video'];
  const SOURCES = { folder: 'Your folders', download: 'App downloads', render: 'Renders', capture: 'Captures', polyhaven: 'Poly Haven', ambientcg: 'ambientCG', import: 'Imported', file: 'Added by hand', lab: 'The Lab' };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const extOf = (p) => (/\.([^.\\/]+)$/.exec(base(p))?.[1] || '').toLowerCase();
  const stem = (p) => base(p).replace(/\.[^.]+$/, '');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
  function kindOf(p) {
    const s = String(p || '');
    if (KINDS.preset.re.test(s)) return 'preset'; // before images / anything else (a .look.json)
    for (const k of ORDER) if (k !== 'preset' && KINDS[k].re.test(s)) return k;
    return null;
  }
  // every extension the folder scan keeps (the main side's walk filters on it)
  const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'tga', 'svg', 'ktx2', 'hdr', 'exr', 'glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'usdz',
    'ttf', 'otf', 'woff', 'woff2', 'wav', 'mp3', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'aif', 'aiff', 'opus', 'cube', '3dl', 'glsl', 'frag', 'fs', 'vert', 'isf', 'wgsl', 'hpreset', 'hlook', 'json', 'mp4', 'webm', 'mov', 'm4v', 'mkv'];
  // a readable name from a file name: "brick_wall_02_diff_1k" → "brick wall 02", "Kenney-Future.ttf" → "Kenney Future"
  const nice = (p) => stem(p).replace(/^\d{10,}-/, '').replace(/[_-]+/g, ' ').replace(/\b(diff|diffuse|albedo|basecolor|color|col)\b/gi, '').replace(/\b\d+k\b/gi, '').replace(/\s+/g, ' ').trim() || stem(p);
  // tags from a file's name and folder: words of 3+ letters ("Textures/Brick/red_brick_1k.jpg" → brick, red)
  const STOP = new Set(['the', 'and', 'for', 'with', 'new', 'final', 'copy', 'untitled', 'download', 'downloads', 'users', 'user', 'home', 'desktop', 'documents', 'files', 'file', 'assets', 'asset', 'hearth', 'jpg', 'png', 'diff', 'diffuse', 'color', 'albedo', 'basecolor', 'mac', 'library', 'volumes', 'appdata', 'roaming', 'local']);
  function autoTags(p, root = '') {
    const rel = root && String(p).startsWith(root) ? String(p).slice(root.length) : String(p).split(/[\\/]/).slice(-3).join('/');
    const words = norm(rel.replace(/\.[^.\\/]+$/, '')).split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w));
    return [...new Set(words)].slice(0, 6);
  }
  const cleanTag = (t) => norm(t).replace(/^#/, '').replace(/[^a-z0-9 +.-]/g, '').replace(/\s+/g, '-').slice(0, 24);

  // ---------- the index ----------
  const empty = () => ({ v: 1, items: {}, folders: [] });
  function normalize(db) {
    const d = db && typeof db === 'object' ? db : {};
    const out = { v: 1, items: {}, folders: Array.isArray(d.folders) ? d.folders.filter((f) => f && f.p).map((f) => ({ p: String(f.p), on: f.on !== false, at: Number(f.at) || 0, n: Number(f.n) || 0 })) : [] };
    for (const [h, it] of Object.entries(d.items || {})) {
      if (!it || !it.p || !h) continue;
      out.items[h] = { ...it, h, k: it.k || kindOf(it.p) || 'image', n: it.n || nice(it.p), tg: Array.isArray(it.tg) ? it.tg.map(cleanTag).filter(Boolean) : [] };
    }
    return out;
  }
  const list = (db) => Object.values(db.items);
  const byPath = (db, p) => list(db).find((x) => x.p === p || (x.alt || []).includes(p)) || null;
  // add or refresh one file ({ p, s, m, h }): a known hash keeps its tags / favorite and gains this place as a second one
  function upsert(db, f, extra = {}) {
    if (!f || !f.p || !f.h) return { item: null, added: false, dup: false };
    const k = extra.k || kindOf(f.p);
    if (!k) return { item: null, added: false, dup: false };
    const at = extra.at || Date.now();
    const was = db.items[f.h];
    if (was) {
      let dup = false;
      if (was.p !== f.p) {
        if (was.g || extra.prefer) { if (!(was.alt || []).includes(was.p) && !was.g) was.alt = [...(was.alt || []), was.p].slice(-5); was.p = f.p; delete was.g; was.n = extra.n || was.n; } // its old place is gone: this one is the asset now
        else if (!(was.alt || []).includes(f.p)) { was.alt = [...(was.alt || []), f.p].slice(-5); dup = true; }
      } else delete was.g;
      if (f.s != null) was.s = f.s;
      if (f.m != null) was.m = f.m;
      if (extra.tg?.length) was.tg = [...new Set([...(was.tg || []), ...extra.tg.map(cleanTag).filter(Boolean)])].slice(0, 16);
      if (extra.i) was.i = { ...(was.i || {}), ...extra.i };
      if (extra.o && !was.o) was.o = extra.o;
      // a better source than "a folder" sticks (Poly Haven's page, an app's name)
      if (extra.src && (!was.src || was.src === 'folder' || was.src === 'file')) { was.src = extra.src; if (extra.o) was.o = extra.o; }
      return { item: was, added: false, dup };
    }
    const it = { h: f.h, n: extra.n || nice(f.p), p: f.p, k, x: extOf(f.p), s: f.s || 0, m: f.m || 0, src: extra.src || 'file', a: at, tg: [...new Set((extra.tg || autoTags(f.p, extra.root || '')).map(cleanTag).filter(Boolean))].slice(0, 16) };
    if (extra.o) it.o = extra.o;
    if (extra.i) it.i = extra.i;
    if (extra.f) it.f = 1;
    db.items[f.h] = it;
    return { item: it, added: true, dup: false };
  }
  function forget(db, h) { const had = Boolean(db.items[h]); delete db.items[h]; return had; }
  // a path that vanished: an alternate place is dropped; the main place falls back to an alternate, else the item is
  // forgotten (unless it has tags / a favorite: then it stays, faded, in case the drive comes back)
  function gone(db, p) {
    for (const it of list(db)) {
      if (it.alt?.includes(p)) { it.alt = it.alt.filter((x) => x !== p); if (!it.alt.length) delete it.alt; continue; }
      if (it.p !== p) continue;
      if (it.alt?.length) { it.p = it.alt.shift(); if (!it.alt.length) delete it.alt; continue; }
      if (it.f || (it.ut || 0) > 0) it.g = 1; else delete db.items[it.h];
    }
  }
  function setTags(it, tags, mode = 'set') {
    const t = (Array.isArray(tags) ? tags : String(tags || '').split(/[,\s]+/)).map(cleanTag).filter(Boolean);
    const cur = new Set(it.tg || []);
    if (mode === 'add') t.forEach((x) => cur.add(x));
    else if (mode === 'remove') t.forEach((x) => cur.delete(x));
    else { cur.clear(); t.forEach((x) => cur.add(x)); }
    it.tg = [...cur].slice(0, 16);
    it.ut = 1; // the owner touched its tags: kept even if the file goes away
    return it.tg;
  }
  // "+wall -red brick" → add wall, remove red, add brick
  function tagEdit(it, text) {
    const add = []; const rem = [];
    for (const w of String(text || '').split(/[,\s]+/).filter(Boolean)) (w.startsWith('-') ? rem : add).push(w.replace(/^[+-]/, ''));
    if (rem.length) setTags(it, rem, 'remove');
    if (add.length) setTags(it, add, 'add');
    return it.tg;
  }
  const toggleFav = (it, on = !it.f) => { if (on) it.f = 1; else delete it.f; return Boolean(it.f); };
  const touch = (it, at = Date.now()) => { it.u = at; return it; };

  // ---------- search ----------
  // words, plus filters: kind:hdri (or a kind word on its own: "hdri", "fonts"), tag:wall / #wall, src:polyhaven,
  // project:<name>, fav / ★, ext:cube
  const KIND_WORDS = { image: 'image', images: 'image', texture: 'image', textures: 'image', picture: 'image', pictures: 'image', photo: 'image', photos: 'image', hdri: 'hdri', hdris: 'hdri', hdr: 'hdri', sky: 'hdri', skies: 'hdri', environment: 'hdri',
    model: 'model', models: 'model', '3d': 'model', mesh: 'model', glb: 'model', font: 'font', fonts: 'font', typeface: 'font', sound: 'sound', sounds: 'sound', song: 'sound', songs: 'sound', audio: 'sound', sfx: 'sound', music: 'sound',
    lut: 'lut', luts: 'lut', grade: 'lut', shader: 'shader', shaders: 'shader', glsl: 'shader', preset: 'preset', presets: 'preset', video: 'video', videos: 'video', clip: 'video', clips: 'video' };
  function parseQuery(q) {
    const out = { words: [], kind: null, tags: [], src: null, project: null, fav: false, ext: null };
    for (const raw of String(q || '').trim().split(/\s+/).filter(Boolean)) {
      const w = norm(raw);
      let m;
      if ((m = /^(kind|type|k):(.+)$/.exec(w))) out.kind = KIND_WORDS[m[2]] || m[2];
      else if ((m = /^(tag|t):(.+)$/.exec(w)) || (m = /^#(.+)$/.exec(w))) out.tags.push(cleanTag(m[m.length - 1]));
      else if ((m = /^(src|source|from):(.+)$/.exec(w))) out.src = m[2];
      else if ((m = /^(project|proj|p):(.+)$/.exec(w))) out.project = m[2];
      else if ((m = /^ext:(.+)$/.exec(w))) out.ext = m[1].replace(/^\./, '');
      else if (w === 'fav' || w === 'favs' || w === 'favorites' || w === '★') out.fav = true;
      else if (!out.kind && KIND_WORDS[w] && !out.words.length) out.kind = KIND_WORDS[w];
      else out.words.push(w);
    }
    return out;
  }
  // a score per item: name words first, then tags, the origin, the folder; favorites and recent use lift it
  function score(it, words) {
    if (!words.length) return 1;
    const name = norm(it.n); const tags = (it.tg || []).join(' '); const where = norm(`${it.o || ''} ${it.p}`);
    let s = 0;
    for (const w of words) {
      if (name === w) s += 12; else if (name.startsWith(w) || name.includes(` ${w}`)) s += 8; else if (name.includes(w)) s += 5;
      else if ((it.tg || []).includes(w)) s += 6; else if (tags.includes(w)) s += 3;
      else if (where.includes(w)) s += 1;
      else return 0;
    }
    return s;
  }
  function search(db, q = '', o = {}) {
    const P = typeof q === 'object' && q ? q : parseQuery(q);
    const kind = o.kind || P.kind; const src = o.src || P.src; const fav = o.fav || P.fav;
    const tags = [...(P.tags || []), ...(o.tag ? [cleanTag(o.tag)] : [])];
    const inProject = o.inProject || null; // (item) → bool, given by the caller (projects live elsewhere)
    const now = o.now || Date.now();
    const out = [];
    for (const it of list(db)) {
      if (kind && it.k !== kind) continue;
      if (src && it.src !== src && norm(it.o || '') !== norm(src)) continue;
      if (fav && !it.f) continue;
      if (P.ext && it.x !== P.ext) continue;
      if (tags.length && !tags.every((t) => (it.tg || []).includes(t))) continue;
      if (inProject && !inProject(it)) continue;
      const s = score(it, P.words || []);
      if (!s) continue;
      const recent = it.u ? Math.max(0, 3 - (now - it.u) / 86400000 / 3) : 0; // used in the last ~9 days
      out.push({ it, s: s + (it.f ? 2 : 0) + recent - (it.g ? 5 : 0) });
    }
    const sort = o.sort || (P.words?.length ? 'best' : 'recent');
    const when = (it) => Math.max(it.u || 0, it.a || 0);
    out.sort(sort === 'name' ? (a, b) => a.it.n.localeCompare(b.it.n) : sort === 'size' ? (a, b) => (b.it.s || 0) - (a.it.s || 0) : sort === 'recent' ? (a, b) => when(b.it) - when(a.it) : (a, b) => b.s - a.s || when(b.it) - when(a.it));
    return out.map((x) => x.it);
  }
  function counts(db) {
    const c = { all: 0, fav: 0, gone: 0, dupes: 0 };
    for (const k of ORDER) c[k] = 0;
    for (const it of list(db)) { c.all += 1; c[it.k] = (c[it.k] || 0) + 1; if (it.f) c.fav += 1; if (it.g) c.gone += 1; if (it.alt?.length) c.dupes += 1; }
    return c;
  }
  // the tags in use, most common first (the filter chips)
  function topTags(db, n = 30, kind = null) {
    const m = new Map();
    for (const it of list(db)) if (!kind || it.k === kind) for (const t of it.tg || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([t, c]) => ({ t, c }));
  }
  const size = (n) => (!n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
  // a line about an item for a chat / a director (compact)
  const line = (it, i = null) => `${i != null ? `${i + 1}. ` : ''}${KINDS[it.k]?.icon || '▫'} ${it.n} · ${KINDS[it.k]?.one || it.k}${it.tg?.length ? ` · #${it.tg.slice(0, 4).join(' #')}` : ''}${it.f ? ' · ★' : ''}${it.g ? ' · (file gone)' : ''}`;
  // the lean form a director gets: an id it can hand back, the name, kind, a few tags
  const brief = (it) => ({ id: it.h.slice(0, 10), name: it.n, kind: it.k, ...(it.tg?.length ? { tags: it.tg.slice(0, 5) } : {}), ...(it.src && it.src !== 'folder' ? { from: SOURCES[it.src] || it.src } : {}), ...(it.g ? { gone: true } : {}) });
  const byId = (db, id) => { const s = String(id || '').toLowerCase(); return s.length >= 6 ? list(db).find((x) => x.h.startsWith(s)) || null : null; };

  // ---------- the free libraries (public APIs, CC0) ----------
  // Poly Haven: GET /assets?t=hdris|textures|models → { id: { name, categories, tags, download_count, thumbnail_url } }
  const PH_TYPES = { hdris: 'hdri', textures: 'image', models: 'model' };
  function polyList(json, q = '', type = 'hdris', n = 60) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return Object.entries(json || {}).map(([id, a]) => ({ id, ...a }))
      .filter((a) => !words.length || words.every((w) => norm(`${a.id} ${a.name} ${(a.tags || []).join(' ')} ${(a.categories || []).join(' ')}`).includes(w)))
      .sort((a, b) => (b.download_count || 0) - (a.download_count || 0)).slice(0, n)
      .map((a) => ({ source: 'polyhaven', type, kind: PH_TYPES[type] || 'image', id: a.id, name: a.name || a.id, tags: [...new Set([...(a.categories || []), ...(a.tags || [])])].map(cleanTag).filter(Boolean).slice(0, 8), preview: a.thumbnail_url || `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(a.id)}.png?width=256&height=256`, page: `https://polyhaven.com/a/${encodeURIComponent(a.id)}`, sizes: ['1k', '2k', '4k', '8k'] }));
  }
  // GET /files/<id> → the files to fetch for a size: [{ url, rel, size, role }] (rel: where it goes in the asset's folder)
  const MAPS = [['Diffuse', 'diff'], ['diffuse', 'diff'], ['Color', 'diff'], ['nor_gl', 'normal'], ['Normal', 'normal'], ['Rough', 'rough'], ['rough', 'rough'], ['AO', 'ao'], ['ao', 'ao'], ['Displacement', 'disp'], ['arm', 'arm']];
  function pickRes(byRes, res) {
    if (!byRes) return null;
    const order = ['1k', '2k', '4k', '8k', '16k'];
    if (byRes[res]) return byRes[res];
    const i = order.indexOf(res);
    for (let j = i - 1; j >= 0; j -= 1) if (byRes[order[j]]) return byRes[order[j]]; // the next one down
    return Object.values(byRes)[0] || null;
  }
  function polyFiles(files, type, res = '1k') {
    if (!files) return [];
    if (type === 'hdris') { const f = pickRes(files.hdri, res); const x = f?.hdr || f?.exr; return x?.url ? [{ url: x.url, rel: base(new URL(x.url, 'http://x').pathname), size: x.size || 0, role: 'main' }] : []; }
    if (type === 'models') {
      const g = pickRes(files.gltf, res)?.gltf;
      if (!g?.url) return [];
      return [{ url: g.url, rel: base(new URL(g.url, 'http://x').pathname), size: g.size || 0, role: 'main' }, ...Object.entries(g.include || {}).map(([rel, v]) => ({ url: v.url, rel, size: v.size || 0, role: 'part' }))];
    }
    const out = []; const seen = new Set();
    for (const [key, role] of MAPS) {
      if (seen.has(role) || !files[key]) continue;
      const f = pickRes(files[key], res); const x = f?.jpg || f?.png;
      if (!x?.url) continue;
      seen.add(role);
      out.push({ url: x.url, rel: base(new URL(x.url, 'http://x').pathname), size: x.size || 0, role: role === 'diff' ? 'main' : role });
    }
    return out;
  }
  // ambientCG: GET /api/v2/full_json?type=Material|HDRI&q=…&include=downloadData,imageData
  //   → { foundAssets: [{ assetId, displayName, tags, previewImage: { '256-PNG': url }, downloadFolders: { default:
  //     { downloadFiletypeCategories: { zip: { downloads: [{ attribute: '1K-JPG', downloadLink, fileName, size }] } } } } }] }
  const ACG_TYPES = { materials: 'Material', hdris: 'HDRI' };
  function acgList(json, type = 'materials') {
    return (json?.foundAssets || []).map((a) => {
      const pv = a.previewImage || {};
      return { source: 'ambientcg', type, kind: type === 'hdris' ? 'hdri' : 'image', id: a.assetId, name: a.displayName || a.assetId, tags: (a.tags || []).map(cleanTag).filter(Boolean).slice(0, 8),
        preview: pv['256-PNG'] || pv['256-JPG-FFFFFF'] || pv['512-PNG'] || Object.values(pv)[0] || '', page: `https://ambientcg.com/view?id=${encodeURIComponent(a.assetId)}`,
        sizes: [...new Set(acgDownloads(a).map((d) => String(d.attribute || '').split('-')[0].toLowerCase()).filter((s) => /^\d+k$/.test(s)))].sort((x, y) => parseInt(x, 10) - parseInt(y, 10)), raw: a };
    });
  }
  function acgDownloads(a) {
    const out = [];
    for (const folder of Object.values(a?.downloadFolders || {})) for (const cat of Object.values(folder?.downloadFiletypeCategories || {})) for (const d of cat?.downloads || []) out.push(d);
    return out;
  }
  // the download for a size: JPG maps for materials (smaller than PNG), the .hdr / .exr for skies
  function acgFile(a, res = '1k', type = 'materials') {
    const ds = acgDownloads(a);
    const R = String(res).toUpperCase();
    const want = type === 'hdris' ? [/HDR$/, /EXR$/, /./] : [/JPG$/, /PNG$/, /./];
    for (const re of want) { const d = ds.find((x) => String(x.attribute || '').toUpperCase().startsWith(`${R}-`) && re.test(String(x.attribute || '').toUpperCase())); if (d) return d; }
    for (const re of want) { const d = ds.filter((x) => re.test(String(x.attribute || '').toUpperCase())).sort((x, y) => parseInt(x.attribute, 10) - parseInt(y.attribute, 10))[0]; if (d) return d; }
    return null;
  }
  // which file of an unzipped material is which map ("Bricks076_1K-JPG_Color.jpg" → main)
  function mapRole(name) {
    const n = base(name).toLowerCase();
    if (/(_color|_albedo|_diff|_basecolor|diffuse)\b|_color\./.test(n)) return 'main';
    if (/normalgl|nor_gl|_normal(?!dx)/.test(n)) return 'normal';
    if (/normaldx/.test(n)) return 'normal-dx';
    if (/rough/.test(n)) return 'rough';
    if (/ambientocclusion|_ao[._]/.test(n)) return 'ao';
    if (/displacement|_disp|height/.test(n)) return 'disp';
    if (/metal/.test(n)) return 'metal';
    return null;
  }

  // ---------- LUTs (.cube): parsed for the thumbnail and for checks ----------
  function parseCube(text) {
    let n = 0; const data = []; let title = '';
    for (const raw of String(text || '').split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      let m;
      if ((m = /^TITLE\s+"?(.*?)"?$/i.exec(l))) title = m[1];
      else if ((m = /^LUT_3D_SIZE\s+(\d+)/i.exec(l))) n = Number(m[1]);
      else if (/^(DOMAIN_|LUT_1D)/i.test(l)) continue;
      else if (/^[-\d.eE+]+\s+[-\d.eE+]+\s+[-\d.eE+]+$/.test(l)) data.push(...l.split(/\s+/).map(Number));
    }
    if (!n || data.length < n * n * n * 3) return null;
    return { n, data, title };
  }
  // one color through the LUT (nearest entry: enough for a preview strip)
  function lutApply(L, r, g, b) {
    const n = L.n; const q = (v) => Math.max(0, Math.min(n - 1, Math.round(v * (n - 1))));
    const i = (q(r) + q(g) * n + q(b) * n * n) * 3;
    return [L.data[i], L.data[i + 1], L.data[i + 2]];
  }

  return { KINDS, ORDER, SOURCES, EXTS, KIND_WORDS, kindOf, extOf, base, stem, nice, norm, autoTags, cleanTag, empty, normalize, list, byPath, byId, upsert, forget, gone, setTags, tagEdit, toggleFav, touch,
    parseQuery, score, search, counts, topTags, size, line, brief, PH_TYPES, ACG_TYPES, polyList, polyFiles, acgList, acgDownloads, acgFile, mapRole, pickRes, parseCube, lutApply };
})();
if (typeof module !== 'undefined') module.exports = AssetsCore;
else window.AssetsCore = AssetsCore;
