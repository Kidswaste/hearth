// Packs (round 28, packs): a Lab scene, a sequence or a gallery item shared as ONE file, a .hearthpack. This is its
// model: no DOM, no IPC; it runs in the main process (packsmain.js reads / writes the files), in the window
// (tools/three-packs.js draws the cards) and in Node for the unit test (dev/packs-test.js).
// The file is a plain zip (anything that opens zips can look inside), written and read here with no dependency:
//   hearthpack.json   the manifest: what it is, who made it where and when, the scenes (layers, sliders, looks,
//                     keyframes, palette, frame size, timeline), the sequence, the LUTs, the song, the file list
//   thumb.jpg         its picture (optional)
//   files/<name>      everything it uses (textures, HDRIs, models, fonts, LUTs, footage, the song), one level,
//                     the JSON pointing at them as "hearthpack:files/<name>" (rewritten to this computer's paths)
// Safety: entry names are checked before anything is written (one level under files/, no "..", no absolute or drive
// paths, no backslashes, no control characters: no zip-slip), the target is checked to sit inside Hearth's own folder
// (inside()), sizes are capped (the pack, each file, the total once unpacked, the manifest, the number of files, the
// compression ratio: no zip bombs), and the manifest is validated (scenes, layers and code sizes) before the card shows.
//   zip:   crc32 · localHeader / centralHeader / endRecord (writing) · findEnd / readCentral (reading)
//   guard: entryOk(name) · safeBase(name) · inside(root, target, pathMod) · checkEntries(entries, size) · LIMITS
//   json:  isPathLike(s) · collectPaths(obj) · rewrite(obj, fn) · TOKEN · tokenOf(name) / entryOfToken(s)
//   manifest: makeManifest(o) · checkManifest(m, entries) · contents(m) · describe(m) · fmtSize · safeName
const PacksCore = (() => {
  const FORMAT = 'hearthpack';
  const VERSION = 1;
  const EXT = '.hearthpack';
  const MANIFEST = 'hearthpack.json';
  const THUMB = 'thumb.jpg';
  const TOKEN = 'hearthpack:';
  const KINDS = ['scene', 'sequence', 'gallery', 'template', 'recipe']; // (round 35, labtemplates) template: one of My templates, its fields in "template" · (round 39, labrecipes) recipe: recorded Lab steps in "recipe", no scene
  const MB = 1048576;
  const LIMITS = {
    pack: 1536 * MB, // the .hearthpack file itself
    entry: 600 * MB, // one file inside, unpacked
    total: 2048 * MB, // everything inside, unpacked
    entries: 400, // files inside
    manifest: 8 * MB,
    thumb: 2 * MB,
    ratio: 200, // unpacked ÷ packed for one deflated file (above: a zip bomb)
    scenes: 40, layers: 64, code: 1 * MB, // per scene, per layer
  };

  // ---------- zip ----------
  let table = null;
  function crc32(buf, crc = 0) {
    if (!table) { table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } }
    let c = (crc ^ 0xffffffff) >>> 0;
    for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const enc = (s) => new TextEncoder().encode(s);
  const dec = (u) => new TextDecoder('utf-8', { fatal: false }).decode(u);
  // DOS time / date of a JS date (zips keep local time, 2 s steps)
  function dosTime(d = new Date()) {
    const y = Math.max(1980, d.getFullYear());
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  // e: { name, method: 0 stored | 8 deflated, crc, csize, size, at: Date }
  function localHeader(e) {
    const n = enc(e.name); const t = dosTime(e.at);
    const b = new Uint8Array(30 + n.length); const v = new DataView(b.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, e.method, true);
    v.setUint16(10, t.time, true); v.setUint16(12, t.date, true); v.setUint32(14, e.crc >>> 0, true); v.setUint32(18, e.csize, true); v.setUint32(22, e.size, true);
    v.setUint16(26, n.length, true); v.setUint16(28, 0, true);
    b.set(n, 30);
    return b;
  }
  function centralHeader(e) {
    const n = enc(e.name); const t = dosTime(e.at);
    const b = new Uint8Array(46 + n.length); const v = new DataView(b.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(10, e.method, true);
    v.setUint16(12, t.time, true); v.setUint16(14, t.date, true); v.setUint32(16, e.crc >>> 0, true); v.setUint32(20, e.csize, true); v.setUint32(24, e.size, true);
    v.setUint16(28, n.length, true); v.setUint32(42, e.offset, true);
    b.set(n, 46);
    return b;
  }
  const COMMENT = `${FORMAT} v${VERSION}`;
  function endRecord(count, cdSize, cdOffset) {
    const c = enc(COMMENT);
    const b = new Uint8Array(22 + c.length); const v = new DataView(b.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, count, true); v.setUint16(10, count, true); v.setUint32(12, cdSize, true); v.setUint32(16, cdOffset, true); v.setUint16(20, c.length, true);
    b.set(c, 22);
    return b;
  }
  // the end record in the file's last bytes (tail: up to 64 KB + 22) → { count, cdSize, cdOffset, comment } | null
  function findEnd(tail, fileSize) {
    const v = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (v.getUint32(i, true) !== 0x06054b50) continue;
      const clen = v.getUint16(i + 20, true);
      if (i + 22 + clen !== tail.length) continue; // a signature inside the comment / data, not the real end
      const out = { count: v.getUint16(i + 10, true), cdSize: v.getUint32(i + 12, true), cdOffset: v.getUint32(i + 16, true), comment: dec(tail.subarray(i + 22, i + 22 + clen)) };
      if (out.cdOffset + out.cdSize > fileSize) return null;
      return out;
    }
    return null;
  }
  // the central directory's bytes → [{ name, method, crc, csize, size, offset, flags }]
  function readCentral(cd, count) {
    const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const out = [];
    let p = 0;
    for (let i = 0; i < count; i += 1) {
      if (p + 46 > cd.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('The pack is damaged (its file list is cut short)');
      const nlen = v.getUint16(p + 28, true); const xlen = v.getUint16(p + 30, true); const clen = v.getUint16(p + 32, true);
      out.push({ name: dec(cd.subarray(p + 46, p + 46 + nlen)), flags: v.getUint16(p + 8, true), method: v.getUint16(p + 10, true), crc: v.getUint32(p + 16, true), csize: v.getUint32(p + 20, true), size: v.getUint32(p + 24, true), offset: v.getUint32(p + 42, true) });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }
  // where an entry's data starts, from its local header (30 bytes)
  function dataStart(local, offset) {
    const v = new DataView(local.buffer, local.byteOffset, local.byteLength);
    if (v.getUint32(0, true) !== 0x04034b50) throw new Error('The pack is damaged (a file inside has no header)');
    return offset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
  }
  // already-compressed media are stored as they are; text-like files are deflated
  const STORE = /\.(png|jpe?g|webp|gif|avif|ktx2|mp3|m4a|aac|ogg|oga|opus|flac|mp4|m4v|mov|webm|mkv|woff2?|glb|zip|usdz)$/i;
  const methodFor = (name) => (STORE.test(name) ? 0 : 8);

  // ---------- the guard ----------
  // the only names a pack may hold: the manifest, its picture, and files/<one plain name>
  function entryOk(name) {
    if (typeof name !== 'string' || !name || name.length > 200) return false;
    if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(name)) return false; // control characters, backslashes, drive colons, Windows-reserved
    if (name === MANIFEST || name === THUMB) return true;
    const m = /^files\/([^/]+)$/.exec(name);
    if (!m) return false;
    const b = m[1];
    if (b === '.' || b === '..' || b.startsWith('.') || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(b) || /[ .]$/.test(b)) return false;
    return true;
  }
  // a plain file name for this computer (what a file inside is written as)
  const safeBase = (s, n = 120) => String(s || 'file').split(/[\\/]/).pop().replace(/[<>:"|?*\u0000-\u001f\u007f]+/g, '_').replace(/^[.\s]+/, '').replace(/[ .]+$/, '').slice(0, n) || 'file';
  const safeName = (s, n = 60) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').replace(/[ .]+$/, '').trim().slice(0, n) || 'Scene';
  // target sits inside root (both absolute; pathMod: Node's path, path.posix or path.win32)
  function inside(root, target, pathMod) {
    const rel = pathMod.relative(pathMod.resolve(root), pathMod.resolve(target));
    return Boolean(rel) && !rel.startsWith('..') && !pathMod.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..');
  }
  // every entry of a pack, checked before anything is read: → { ok, problems: [..], bytes (unpacked) }
  function checkEntries(entries, fileSize) {
    const problems = [];
    if (fileSize > LIMITS.pack) problems.push(`The pack is ${fmtSize(fileSize)}: the most Hearth opens is ${fmtSize(LIMITS.pack)}.`);
    if (entries.length > LIMITS.entries) problems.push(`It holds ${entries.length} files: the most is ${LIMITS.entries}.`);
    const seen = new Set();
    let total = 0;
    for (const e of entries) {
      if (!entryOk(e.name)) { problems.push(`"${String(e.name).slice(0, 80)}" isn't a name a pack may hold (it could write outside Hearth's folder).`); continue; }
      if (seen.has(e.name.toLowerCase())) problems.push(`"${e.name}" is in it twice.`);
      seen.add(e.name.toLowerCase());
      if (e.method !== 0 && e.method !== 8) problems.push(`"${e.name}" is packed in a way Hearth doesn't read.`);
      if (e.flags & 1) problems.push(`"${e.name}" is encrypted.`);
      if (e.size > LIMITS.entry) problems.push(`"${e.name}" is ${fmtSize(e.size)} unpacked: the most for one file is ${fmtSize(LIMITS.entry)}.`);
      if (e.method === 8 && e.size > e.csize * LIMITS.ratio + MB) problems.push(`"${e.name}" unpacks to far more than it weighs (a zip bomb?).`);
      if (e.method === 0 && e.size !== e.csize) problems.push(`"${e.name}" has two different sizes.`);
      if (e.offset + e.csize > fileSize) problems.push(`"${e.name}" runs past the end of the pack.`);
      total += e.size;
    }
    if (total > LIMITS.total) problems.push(`Unpacked it would be ${fmtSize(total)}: the most is ${fmtSize(LIMITS.total)}.`);
    const man = entries.find((e) => e.name === MANIFEST);
    if (!man) problems.push('It has no hearthpack.json: not a Hearth pack.');
    else if (man.size > LIMITS.manifest) problems.push('Its hearthpack.json is too big.');
    const th = entries.find((e) => e.name === THUMB);
    if (th && th.size > LIMITS.thumb) problems.push('Its picture is too big.');
    return { ok: !problems.length, problems: [...new Set(problems)].slice(0, 8), bytes: total };
  }

  // ---------- paths in the scene's JSON ----------
  const MEDIA = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|tga|svg|ktx2|hdr|exr|glb|gltf|fbx|obj|stl|ply|usdz|ttf|otf|woff2?|wav|mp3|ogg|oga|m4a|flac|aac|aiff?|opus|cube|3dl|glsl|frag|vert|mp4|webm|mov|m4v|mkv|json|csv|txt|bin|srt|vtt)$/i;
  // an absolute file path to something a scene can use ("/Users/x/a.png", "C:\\x\\a.mp3", "file:///…")
  function isPathLike(s) {
    if (typeof s !== 'string' || s.length < 4 || s.length > 1024 || /[\n\r\t]/.test(s)) return false;
    const p = s.replace(/^file:\/\/(localhost)?/i, '');
    if (!(/^\/[^/]/.test(p) || /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p))) return false;
    return MEDIA.test(p);
  }
  function walk(v, fn, depth = 0) {
    if (depth > 40) return v;
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, fn, depth + 1));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x, fn, depth + 1); return o; }
    return v;
  }
  function collectPaths(obj) { const out = new Set(); walk(obj, (s) => { if (isPathLike(s)) out.add(s); return s; }); return [...out]; }
  // every string through fn (a copy; the original stays)
  const rewrite = (obj, fn) => walk(obj, fn);
  const tokenOf = (entry) => `${TOKEN}${entry}`;
  const entryOfToken = (s) => (typeof s === 'string' && s.startsWith(TOKEN) ? s.slice(TOKEN.length) : null);
  // a unique files/<name> for each file (two "texture.png" from different folders stay two)
  function entryNames(paths) {
    const used = new Set(); const out = new Map();
    for (const p of paths) {
      const b = safeBase(String(p).replace(/^file:\/\/(localhost)?/i, ''), 100);
      const dot = b.lastIndexOf('.');
      const stem = dot > 0 ? b.slice(0, dot) : b; const ext = dot > 0 ? b.slice(dot) : '';
      let n = b; let i = 2;
      while (used.has(n.toLowerCase())) { n = `${stem} ${i}${ext}`; i += 1; }
      used.add(n.toLowerCase());
      out.set(p, `files/${n}`);
    }
    return out;
  }

  // ---------- the manifest ----------
  // o: { kind, name, desc, app, version, platform, at, scenes: [{ key, sketch, extras, refs }], sequence, luts, song }
  function makeManifest(o) {
    return {
      format: FORMAT, v: VERSION, kind: KINDS.includes(o.kind) ? o.kind : 'scene', name: safeName(o.name, 80), desc: String(o.desc || '').slice(0, 300),
      made: { app: o.app || 'Hearth', version: String(o.version || ''), platform: o.platform || '', at: o.at || Date.now() },
      scenes: o.scenes || [], sequence: o.sequence || null, luts: o.luts || [], song: o.song || null, files: o.files || [], missing: o.missing || [],
      ...(o.template ? { template: o.template } : {}),
      ...(o.recipe ? { recipe: o.recipe } : {}),
    };
  }
  const PLATFORM = { darwin: 'a Mac', win32: 'Windows', linux: 'Linux' };
  // the manifest as read from a pack, checked: → { ok, problems, m (cleaned) }
  function checkManifest(m, entries = null) {
    const problems = [];
    if (!m || typeof m !== 'object' || m.format !== FORMAT) return { ok: false, problems: ['Not a Hearth pack (its hearthpack.json says something else).'], m: null };
    if (!(Number(m.v) >= 1)) problems.push('Its version is unknown.');
    else if (Number(m.v) > VERSION) problems.push('It was made by a newer Hearth: update Hearth (⬆ Update) to open it.');
    if (!KINDS.includes(m.kind)) problems.push(`It is a "${String(m.kind).slice(0, 20)}", not a scene, sequence, gallery item or template.`);
    if (m.kind === 'template' && (!m.template || !Array.isArray(m.template.fields) || m.template.fields.length > 400)) problems.push('Its template fields are missing or too many.');
    // (round 39, labrecipes) a recipe: its steps (a layer step's code counts like a layer's), no scene needed
    if (m.kind === 'recipe' && (!m.recipe || !Array.isArray(m.recipe.steps) || !m.recipe.steps.length || m.recipe.steps.length > 300)) problems.push('Its recipe steps are missing or too many.');
    if (m.kind === 'recipe' && Array.isArray(m.recipe?.steps) && m.recipe.steps.some((x) => x?.code != null && (typeof x.code !== 'string' || x.code.length > LIMITS.code))) problems.push('A step of the recipe has code that\'s too big or not text.');
    const scenes = Array.isArray(m.scenes) ? m.scenes : [];
    if (!scenes.length && m.kind !== 'recipe') problems.push('It has no scene in it.');
    if (scenes.length > LIMITS.scenes) problems.push(`It has ${scenes.length} scenes: the most is ${LIMITS.scenes}.`);
    for (const s of scenes.slice(0, LIMITS.scenes)) {
      const Ls = s?.sketch?.layers;
      if (!s?.sketch || typeof s.sketch !== 'object') { problems.push('A scene in it is empty.'); continue; }
      if (Ls != null && !Array.isArray(Ls)) { problems.push(`"${safeName(s.sketch.name)}" has broken layers.`); continue; }
      const layers = Ls || [{ code: s.sketch.code }];
      if (layers.length > LIMITS.layers) problems.push(`"${safeName(s.sketch.name)}" has ${layers.length} layers: the most is ${LIMITS.layers}.`);
      for (const L of layers) if (typeof (L?.code ?? '') !== 'string' || String(L?.code || '').length > LIMITS.code) problems.push(`A layer of "${safeName(s.sketch.name)}" has code that's too big or not text.`);
    }
    // what the JSON points at must be in the pack
    const names = entries ? new Set(entries.map((e) => e.name)) : null;
    const dangling = [];
    const clean = rewrite(m, (s) => { const e = entryOfToken(s); if (e == null) return s; if (!entryOk(e) || (names && !names.has(e))) { dangling.push(e); return ''; } return s; });
    if (dangling.length) clean.missing = [...new Set([...(clean.missing || []), ...dangling.map((d) => String(d).split('/').pop())])].slice(0, 40);
    clean.name = safeName(clean.name, 80);
    clean.desc = String(clean.desc || '').slice(0, 300);
    return { ok: !problems.length, problems: [...new Set(problems)].slice(0, 8), m: clean };
  }

  // what's inside, counted (the cards)
  const KIND_OF = [['image', /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|tga|svg|ktx2)$/i], ['hdri', /\.(hdr|exr)$/i], ['model', /\.(glb|gltf|fbx|obj|stl|ply|usdz)$/i], ['font', /\.(ttf|otf|woff2?)$/i],
    ['lut', /\.(cube|3dl)$/i], ['video', /\.(mp4|webm|mov|m4v|mkv)$/i], ['sound', /\.(wav|mp3|ogg|oga|m4a|flac|aac|aiff?|opus)$/i], ['shader', /\.(glsl|frag|vert)$/i]];
  const kindOf = (name) => KIND_OF.find(([, re]) => re.test(name))?.[0] || 'data';
  function contents(m) {
    const out = { scenes: 0, layers: 0, sliders: 0, looks: 0, keys: 0, files: {}, song: Boolean(m?.song?.file && (m.files || []).some((f) => f.name === (entryOfToken(m.song.file) || m.song.file))), sequence: Boolean(m?.sequence), luts: (m?.luts || []).length, bytes: 0, count: 0 };
    for (const s of m?.scenes || []) {
      out.scenes += 1;
      const Ls = s.sketch?.layers || [{ code: s.sketch?.code || '' }];
      out.layers += Ls.length;
      for (const L of Ls) {
        out.sliders += (String(L.code || '').match(/\blabel\s*:\s*['"`]/g) || []).length;
        for (const ks of Object.values(L.keys || {})) out.keys += Array.isArray(ks) ? ks.length : 0;
      }
      const ex = s.extras || {};
      out.looks += (ex.looks || []).length;
      for (const l of Object.values(ex.layers || {})) out.looks += (l?.looks || []).length;
    }
    const songEntry = entryOfToken(m?.song?.file) || m?.song?.file;
    for (const f of m?.files || []) {
      if (songEntry && songEntry === f.name) { out.bytes += f.size || 0; continue; }
      const k = f.kind || kindOf(f.name);
      out.files[k] = (out.files[k] || 0) + 1;
      out.bytes += f.size || 0; out.count += 1;
    }
    if (m?.song?.file) out.count += 1;
    return out;
  }
  const WORDS = { image: ['texture', 'textures'], hdri: ['HDRI', 'HDRIs'], model: ['3D model', '3D models'], font: ['font', 'fonts'], lut: ['LUT', 'LUTs'], video: ['video', 'videos'], sound: ['sound', 'sounds'], shader: ['shader file', 'shader files'], data: ['data file', 'data files'] };
  const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;
  // plain lines for the card: what's inside
  function describe(m) {
    const c = contents(m);
    const lines = [];
    const what = m.kind === 'recipe' ? `A recipe of ${plural(m.recipe?.steps?.length || 0, ['step', 'steps'])} to replay on any Lab scene` : m.kind === 'template' ? `A template${m.template?.fields?.length ? ` with ${plural(m.template.fields.length, ['field', 'fields'])} to fill in` : ''}` : m.kind === 'sequence' ? `A sequence of ${plural(c.scenes, ['scene', 'scenes'])}` : c.scenes > 1 ? plural(c.scenes, ['scene', 'scenes']) : 'A Lab scene';
    if (m.kind === 'recipe') return [what, 'Steps only: effects, looks, sliders, music links, frame size… (a layer step carries its code)']; // (round 39, labrecipes)
    lines.push(`${what} · ${plural(c.layers, ['layer', 'layers'])}`);
    const tune = [c.sliders ? plural(c.sliders, ['slider', 'sliders']) : '', c.looks ? plural(c.looks, ['saved look', 'saved looks']) : '', c.keys ? plural(c.keys, ['keyframe', 'keyframes']) : ''].filter(Boolean);
    if (tune.length) lines.push(tune.join(' · '));
    const files = ['image', 'hdri', 'model', 'font', 'lut', 'video', 'sound', 'shader', 'data'].filter((k) => c.files[k]).map((k) => plural(c.files[k], WORDS[k]));
    if (c.song) files.push('the song');
    lines.push(files.length ? files.join(', ') : 'No files: just the code');
    if ((m.missing || []).length) lines.push(`${plural(m.missing.length, ['file', 'files'])} it used weren't packed (not on the computer it came from): ${m.missing.slice(0, 3).join(', ')}${m.missing.length > 3 ? '…' : ''}`);
    return lines;
  }
  function from(m) {
    const d = new Date(Number(m?.made?.at) || 0);
    const when = Number(m?.made?.at) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const plat = PLATFORM[m?.made?.platform] || '';
    return `Made with ${m?.made?.app || 'Hearth'}${m?.made?.version ? ` ${m.made.version}` : ''}${plat ? ` on ${plat}` : ''}${when ? ` · ${when}` : ''}`;
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
    if (n >= MB) return `${(n / MB).toFixed(n >= 100 * MB ? 0 : 1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  return { FORMAT, VERSION, EXT, MANIFEST, THUMB, TOKEN, KINDS, LIMITS, crc32, localHeader, centralHeader, endRecord, findEnd, readCentral, dataStart, methodFor, entryOk, safeBase, safeName, inside, checkEntries, isPathLike, collectPaths, rewrite, tokenOf, entryOfToken, entryNames, makeManifest, checkManifest, contents, describe, from, kindOf, fmtSize, COMMENT };
})();
if (typeof module !== 'undefined') module.exports = PacksCore;
