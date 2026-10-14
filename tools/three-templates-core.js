// 📐 My templates (round 35, labtemplates): the model. No DOM, no IPC, no tokens; loads in Node for the tests
// (dev/labtemplates-test.js). A template is any Lab scene kept as a reusable starting point: its layers, frame size,
// timeline and look, plus the FIELDS someone fills in when they start from it:
//   text     a type layer's words (textLayer(P, { text }) in its code)
//   palette  the scene's palette (its colors)
//   image · video · audio   a media slot: one of the scene's references (refs.<key> / refTexture('<key>')) or its song
//   number · color · bool · choice   a named slider (a tweak() control: its value is written into the layer's code)
// A field: { id, kind, label, value (the template's default), layer, layerName, key, min, max, step, int, options,
//   group, ref (a reference's key), where: 'ref' | 'song' }. Ids: 't:<layer>' · 'palette' · 'm:ref:<key>' · 'm:song' ·
//   's:<layer>|<key>'.
// The file (data/templates/<id>/template.json, next to thumb.jpg and files/ with its media) is portable JSON:
//   { format: 'hearth-template', v: 1, id, name, desc, at, updatedAt, made: { app, platform },
//     scene: { name, layers, palette, extras, refs: [{ key, name, kind, path }] }, fields: [field] }
// Paths to the template's own media are written "tpl:files/<name>" (resolve() → this computer's folder), so the
// folder can move between computers (sync) or travel in a .hearthpack.
//   extract(scene, { scan, live }) → fields · make(scene, fields, meta) → template · apply(t, values, { scan,
//   applyValues }) → scene · defaults(t) · coerce(field, v) · parseValues(t, text) · textOf / setText(code) ·
//   check(t) · tokenize / resolve · search(list, q) · sortNewest · describe(t) · slug · mediaKind
const TemplateCore = (() => {
  const FORMAT = 'hearth-template';
  const VERSION = 1;
  const TOKEN = 'tpl:';
  const LIMITS = { fields: 400, layers: 64, code: 1024 * 1024, name: 80, desc: 300, text: 2000, palette: 16 };
  const HEX = /^#[0-9a-f]{6}$/i;
  const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
  const clip = (s, n) => String(s ?? '').slice(0, n);
  const humanize = (k) => String(k || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

  // ---------- media ----------
  const KINDS = [['image', /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|tga|svg)$/i], ['video', /\.(mp4|webm|mov|m4v|mkv)$/i], ['audio', /\.(wav|mp3|ogg|oga|m4a|flac|aac|aiff?|opus)$/i]];
  const mediaKind = (p) => KINDS.find(([, re]) => re.test(String(p || '')))?.[0] || null;
  const MEDIA_KINDS = new Set(['image', 'video', 'audio']);
  const refKind = (r) => (r?.kind === 'sound' ? 'audio' : r?.kind);

  // ---------- a type layer's words: textLayer(P, { "text": "…" }) ----------
  const CALL = /(^|[^.\w$])textLayer\s*\(\s*P\s*,\s*/m;
  function optsSpan(code) {
    const m = CALL.exec(String(code || ''));
    if (!m) return null;
    const start = m.index + m[0].length;
    if (code[start] !== '{') return null;
    let depth = 0; let str = null;
    for (let i = start; i < code.length; i += 1) {
      const c = code[i];
      if (str) { if (c === '\\') i += 1; else if (c === str) str = null; continue; }
      if (c === '"' || c === "'" || c === '`') str = c;
      else if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') { depth -= 1; if (!depth) return { start, end: i + 1, text: code.slice(start, i + 1) }; }
    }
    return null;
  }
  // its text, or null (not a type layer, lyrics instead of text, options that aren't plain JSON)
  function textOf(code) {
    const sp = optsSpan(code);
    if (!sp) return null;
    try { const o = JSON.parse(sp.text); return typeof o.text === 'string' && !o.lyrics ? o.text : null; } catch { return null; }
  }
  function setText(code, text) {
    const sp = optsSpan(code);
    if (!sp) return code;
    let o;
    try { o = JSON.parse(sp.text); } catch { return code; }
    o.text = clip(text, LIMITS.text);
    return `${code.slice(0, sp.start)}${JSON.stringify(o)}${code.slice(sp.end)}`;
  }

  // ---------- fields from a scene ----------
  // scene: { name, layers: [{ id, name, code, … }], palette, extras: { media: { path } … }, refs: [{ key, name, kind, path }] }
  // scan(code) → { items } (ThreeTweaks.scan); live: { layerId: { key: value } } the sliders' values now (unsaved moves)
  function sliderField(L, it, live) {
    const v = live && it.key in live ? live[it.key] : it.orig;
    const f = { id: `s:${L.id}|${it.key}`, kind: it.kind, label: it.label || humanize(it.key), value: v, layer: L.id, layerName: L.name || '', key: it.key };
    if (it.kind === 'number' && it.range) Object.assign(f, { min: it.range.min, max: it.range.max, step: it.range.step });
    if (it.int) f.int = true;
    if (it.options) f.options = [...it.options];
    if (it.group) f.group = it.group;
    return f;
  }
  function extract(scene, { scan = null, live = {} } = {}) {
    const out = { text: [], media: [], palette: [], sliders: [] };
    const layers = (scene?.layers || []).filter((L) => L && !L.precomp);
    for (const L of layers) {
      const t = textOf(L.code);
      if (t != null) out.text.push({ id: `t:${L.id}`, kind: 'text', label: L.name || 'Text', value: t, layer: L.id, layerName: L.name || '' });
    }
    for (const r of scene?.refs || []) {
      const k = refKind(r);
      if (!MEDIA_KINDS.has(k) || !r.key) continue;
      out.media.push({ id: `m:ref:${r.key}`, kind: k, label: humanize(String(r.name || r.key).replace(/\.[^.]+$/, '')), value: r.path || '', where: 'ref', ref: r.key });
    }
    const song = scene?.extras?.media?.path;
    if (song && mediaKind(song) !== 'image') out.media.push({ id: 'm:song', kind: mediaKind(song) || 'audio', label: 'Song', value: song, where: 'song' });
    if (Array.isArray(scene?.palette) && scene.palette.length) out.palette.push({ id: 'palette', kind: 'palette', label: 'Palette', value: scene.palette.filter((c) => HEX.test(c)).slice(0, LIMITS.palette) });
    if (scan) {
      for (const L of layers) {
        let items = [];
        try { items = scan(String(L.code || '')).items || []; } catch { continue; }
        const seen = new Set();
        for (const it of items) {
          if (it.key == null || seen.has(it.key) || !['number', 'color', 'bool', 'choice'].includes(it.kind)) continue;
          seen.add(it.key);
          out.sliders.push(sliderField(L, it, live?.[L.id]));
        }
      }
    }
    // the order a form reads well in: words, pictures / sound, colors, then the sliders (colors first)
    const rank = (f) => (f.kind === 'color' ? 0 : f.kind === 'choice' ? 1 : f.kind === 'number' ? 2 : 3);
    out.sliders.sort((a, b) => rank(a) - rank(b));
    return [...out.text, ...out.media, ...out.palette, ...out.sliders];
  }
  // the sensible default: every field (all sliders, the palette, the text layers, the media slots)
  const defaultPick = (fields) => new Set(fields.map((f) => f.id));
  const isSlider = (f) => ['number', 'color', 'bool', 'choice'].includes(f.kind);
  const groupOf = (f) => (f.kind === 'text' ? 'text' : MEDIA_KINDS.has(f.kind) ? 'media' : f.kind === 'palette' ? 'palette' : 'sliders');

  // ---------- a template ----------
  const slug = (s) => (String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'template');
  const safeName = (s, n = LIMITS.name) => String(s || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) || 'My template';
  const newId = (name, now = Date.now()) => `${slug(name)}-${now.toString(36)}`;
  // the scene part kept in the file: no per-computer bits (MIDI mapping, selection, the song's place on the timeline)
  function sceneOf(scene) {
    const ex = clone(scene?.extras || {}) || {};
    delete ex.midi; delete ex.selectedLayer;
    return {
      name: safeName(scene?.name),
      layers: clone((scene?.layers || []).filter((L) => L && !L.precomp)).map((L) => ({ ...L, code: String(L.code || '') })),
      ...(Array.isArray(scene?.palette) && scene.palette.length ? { palette: scene.palette.filter((c) => HEX.test(c)).slice(0, LIMITS.palette) } : {}),
      extras: ex,
      refs: (scene?.refs || []).filter((r) => r?.key && r.path).map((r) => ({ key: r.key, name: r.name || r.key, kind: r.kind, path: r.path })),
    };
  }
  function make(scene, fields, meta = {}) {
    const now = meta.at || Date.now();
    const name = safeName(meta.name || scene?.name);
    return {
      format: FORMAT, v: VERSION, id: meta.id || newId(name, now), name, desc: clip(meta.desc, LIMITS.desc), at: now, updatedAt: now,
      made: { app: 'Hearth', platform: meta.platform || '' },
      scene: sceneOf(scene),
      fields: clone(fields || []).slice(0, LIMITS.fields),
    };
  }
  // a template as read from disk (or a pack), checked: → { ok, problems, t (cleaned) }
  function check(t) {
    const problems = [];
    if (!t || typeof t !== 'object' || t.format !== FORMAT) return { ok: false, problems: ['Not a Hearth template.'], t: null };
    if (Number(t.v) > VERSION) problems.push('It was made by a newer Hearth: update Hearth to use it.');
    const Ls = t.scene?.layers;
    if (!Array.isArray(Ls) || !Ls.length) problems.push('It has no layers.');
    else if (Ls.length > LIMITS.layers) problems.push(`It has ${Ls.length} layers: the most is ${LIMITS.layers}.`);
    else for (const L of Ls) if (typeof L?.code !== 'string' || L.code.length > LIMITS.code) problems.push('A layer\'s code is too big or not text.');
    if (!Array.isArray(t.fields)) problems.push('Its fields are missing.');
    if (problems.length) return { ok: false, problems: [...new Set(problems)], t: null };
    const c = clone(t);
    c.name = safeName(c.name); c.desc = clip(c.desc, LIMITS.desc);
    c.id = /^[\w-]{1,80}$/.test(String(c.id || '')) ? c.id : newId(c.name, Number(c.at) || Date.now());
    c.at = Number(c.at) || 0; c.updatedAt = Number(c.updatedAt) || c.at;
    c.fields = c.fields.filter((f) => f && typeof f.id === 'string' && typeof f.kind === 'string').slice(0, LIMITS.fields);
    c.scene.refs = Array.isArray(c.scene.refs) ? c.scene.refs : [];
    c.scene.extras = c.scene.extras && typeof c.scene.extras === 'object' ? c.scene.extras : {};
    return { ok: true, problems: [], t: c };
  }
  const defaults = (t) => Object.fromEntries((t?.fields || []).map((f) => [f.id, clone(f.value)]));

  // a value for a field, made safe (out of range → clamped, a bad color / option → the default)
  function coerce(f, v) {
    if (v === undefined || v === null) return clone(f.value);
    if (f.kind === 'number') {
      let n = Number(v);
      if (!Number.isFinite(n)) return f.value;
      if (Number.isFinite(f.min) && Number.isFinite(f.max)) n = Math.max(Math.min(f.min, f.max), Math.min(Math.max(f.min, f.max), n));
      return f.int ? Math.round(n) : Number(n.toPrecision(6));
    }
    if (f.kind === 'color') { const s = String(v).trim().toLowerCase(); const x = /^#?([0-9a-f]{3})$/.exec(s); if (x) return `#${[...x[1]].map((c) => c + c).join('')}`; const s6 = s.startsWith('#') ? s : `#${s}`; return HEX.test(s6) ? s6 : f.value; }
    if (f.kind === 'bool') return v === true || /^(true|on|yes|1)$/i.test(String(v));
    if (f.kind === 'choice') { const hit = (f.options || []).find((o) => String(o).toLowerCase() === String(v).toLowerCase()); return hit ?? f.value; }
    if (f.kind === 'text') return clip(v, LIMITS.text);
    if (f.kind === 'palette') { const cols = (Array.isArray(v) ? v : String(v).split(/[\s,]+/)).map((c) => coerce({ kind: 'color', value: null }, c)).filter(Boolean); return cols.length ? cols.slice(0, LIMITS.palette) : f.value; }
    if (MEDIA_KINDS.has(f.kind)) return String(v || '');
    return v;
  }

  // ---------- making a scene from a template ----------
  // values: { fieldId: value } (missing → the default). scan / applyValues: ThreeTweaks'. → { name, layers, palette,
  // extras, refs, changed: [field ids that differ from the default] }
  function apply(t, values = {}, { scan = null, applyValues = null, name = null } = {}) {
    const sc = clone(t.scene);
    const byId = new Map(t.fields.map((f) => [f.id, f]));
    const val = (f) => coerce(f, values[f.id]);
    const changed = t.fields.filter((f) => values[f.id] !== undefined && JSON.stringify(val(f)) !== JSON.stringify(f.value)).map((f) => f.id);
    // the sliders and the text: written into each layer's code (so the new scene IS its values, like Save)
    for (const L of sc.layers) {
      const mine = t.fields.filter((f) => f.layer === L.id);
      if (!mine.length) continue;
      const tf = mine.find((f) => f.kind === 'text');
      if (tf) L.code = setText(L.code, val(tf));
      const sl = mine.filter(isSlider);
      if (sl.length && scan && applyValues) {
        let items = [];
        try { items = scan(L.code).items || []; } catch { items = []; }
        const want = new Map(sl.map((f) => [f.key, val(f)]));
        const vals = items.map((it) => (it.key != null && want.has(it.key) ? want.get(it.key) : it.orig));
        if (items.some((it, i) => vals[i] !== it.orig)) L.code = applyValues(L.code, items, vals);
      }
    }
    // the palette
    const pf = byId.get('palette');
    if (pf) { const p = val(pf); if (p?.length) sc.palette = p; else delete sc.palette; }
    // the media: a reference keeps its key with a new file; the song is the scene's song
    for (const f of t.fields) {
      if (!MEDIA_KINDS.has(f.kind)) continue;
      const v = val(f);
      if (f.where === 'ref') {
        const r = sc.refs.find((x) => x.key === f.ref);
        if (r && v) { r.path = v; r.name = String(v).split(/[\\/]/).pop(); r.kind = mediaKind(v) || r.kind; } else if (r && !v) sc.refs = sc.refs.filter((x) => x !== r);
      } else if (f.where === 'song') {
        if (v) sc.extras.media = { ...(sc.extras.media || {}), path: v }; else delete sc.extras.media;
      }
    }
    return { name: safeName(name || t.name), layers: sc.layers, palette: sc.palette || null, extras: sc.extras || {}, refs: sc.refs || [], changed };
  }

  // values typed in a chat: JSON ({ "Title": "HELLO", "speed": 2 }) or key=value pairs ("title=HELLO, speed=2");
  // a key is a field's label, its slider key or its id (case and spaces ignored) → { values, unknown: [keys] }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  function fieldFor(t, k) {
    const n = norm(k);
    if (!n) return null;
    return t.fields.find((f) => f.id === k) || t.fields.find((f) => norm(f.label) === n) || t.fields.find((f) => f.key && norm(f.key) === n)
      || t.fields.find((f) => norm(`${f.layerName} ${f.label}`) === n) || (n === 'text' ? t.fields.find((f) => f.kind === 'text') : null)
      || (['song', 'music', 'audio'].includes(n) ? t.fields.find((f) => f.id === 'm:song') : null)
      || (['image', 'picture', 'photo', 'logo'].includes(n) ? t.fields.find((f) => f.kind === 'image') : null) || (n === 'video' ? t.fields.find((f) => f.kind === 'video') : null)
      || (['colors', 'colours'].includes(n) ? t.fields.find((f) => f.kind === 'palette') : null) || null;
  }
  function parseValues(t, text) {
    const s = String(text || '').trim();
    const values = {}; const unknown = [];
    if (!s) return { values, unknown };
    let pairs = [];
    if (s.startsWith('{')) {
      let o;
      try { o = JSON.parse(s); } catch { throw new Error('The values aren\'t valid JSON (e.g. {"Title": "HELLO", "Speed": 2}).'); }
      pairs = Object.entries(o || {});
    } else {
      const re = /([^=,]+?)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^,]*)/g;
      let m;
      while ((m = re.exec(s))) { let v = m[2].trim(); if (/^"/.test(v)) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } } else if (/^'/.test(v)) v = v.slice(1, -1); pairs.push([m[1].trim(), v]); }
    }
    for (const [k, v] of pairs) { const f = fieldFor(t, k); if (f) values[f.id] = coerce(f, v); else unknown.push(k); }
    return { values, unknown };
  }

  // ---------- tpl: tokens (the template's own media) ----------
  const walk = (v, fn, depth = 0) => {
    if (depth > 40) return v;
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, fn, depth + 1));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = walk(x, fn, depth + 1); return o; }
    return v;
  };
  // the media paths a template uses (its references, its song, its media fields' values)
  function mediaPaths(t) {
    const out = new Set();
    for (const r of t?.scene?.refs || []) if (r.path) out.add(r.path);
    if (t?.scene?.extras?.media?.path) out.add(t.scene.extras.media.path);
    for (const f of t?.fields || []) if (MEDIA_KINDS.has(f.kind) && f.value) out.add(f.value);
    return [...out].filter((p) => typeof p === 'string' && !p.startsWith(TOKEN));
  }
  // map: absolute path → 'files/<name>' (copied into the template's folder) → the template with tokens
  const tokenize = (t, map) => walk(t, (s) => (map.has(s) ? `${TOKEN}${map.get(s)}` : s));
  // a token → this computer's file, in the template's folder (dir, with its own separator)
  function resolve(t, dir) {
    const sep = /\\/.test(dir) && !/\//.test(dir) ? '\\' : '/';
    const base = String(dir).replace(/[\\/]+$/, '');
    return walk(t, (s) => {
      if (!s.startsWith(TOKEN)) return s;
      const rel = s.slice(TOKEN.length);
      if (!/^files\/[^/\\]+$/.test(rel) || rel.includes('..')) return '';
      return `${base}${sep}${rel.replace('/', sep)}`;
    });
  }
  // the other way: a resolved template's paths into its folder → tokens again (before writing it back)
  function unresolve(t, dir) {
    const base = String(dir).replace(/[\\/]+$/, '');
    return walk(t, (s) => {
      if (!s.startsWith(base)) return s;
      const rest = s.slice(base.length).replace(/^[\\/]/, '').replace(/\\/g, '/');
      return /^files\/[^/]+$/.test(rest) ? `${TOKEN}${rest}` : s;
    });
  }
  // unique plain names for the files copied in (two "logo.png" from different folders stay two)
  function fileNames(paths, taken = []) {
    const used = new Set(taken.map((n) => String(n).toLowerCase())); const out = new Map();
    for (const p of paths) {
      const b = String(p).split(/[\\/]/).pop().replace(/^\d{10,}-/, '').replace(/[<>:"|?*\u0000-\u001f\u007f]+/g, '_').replace(/^[.\s]+/, '').slice(0, 100) || 'file';
      const dot = b.lastIndexOf('.');
      const stem = dot > 0 ? b.slice(0, dot) : b; const ext = dot > 0 ? b.slice(dot) : '';
      let n = b; let i = 2;
      while (used.has(n.toLowerCase())) { n = `${stem} ${i}${ext}`; i += 1; }
      used.add(n.toLowerCase());
      out.set(p, `files/${n}`);
    }
    return out;
  }

  // ---------- the picker ----------
  const sortNewest = (list) => [...list].sort((a, b) => (b.updatedAt || b.at || 0) - (a.updatedAt || a.at || 0));
  function search(list, q) {
    const words = norm(q) ? String(q).toLowerCase().split(/\s+/).map(norm).filter(Boolean) : [];
    const sorted = sortNewest(list);
    if (!words.length) return sorted;
    const hay = (t) => norm(`${t.name} ${t.desc || ''} ${(t.fields || []).map((f) => f.label).join(' ')} ${(t.scene?.layers || []).map((L) => L.name).join(' ')}`);
    return sorted.filter((t) => words.every((w) => hay(t).includes(w)));
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  function describe(t) {
    const fs = t?.fields || [];
    const c = (fn) => fs.filter(fn).length;
    const parts = [c((f) => f.kind === 'text') ? plural(c((f) => f.kind === 'text'), 'text') : '', c((f) => MEDIA_KINDS.has(f.kind)) ? plural(c((f) => MEDIA_KINDS.has(f.kind)), 'media slot') : '',
      c((f) => f.kind === 'palette') ? 'palette' : '', c(isSlider) ? plural(c(isSlider), 'slider') : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'no fields: the scene as it is';
  }

  return { FORMAT, VERSION, TOKEN, LIMITS, extract, make, check, apply, defaults, coerce, parseValues, fieldFor, textOf, setText, defaultPick, isSlider, groupOf,
    mediaKind, mediaPaths, tokenize, resolve, unresolve, fileNames, search, sortNewest, describe, slug, safeName, newId, humanize, MEDIA_KINDS };
})();
if (typeof module !== 'undefined') module.exports = TemplateCore;
