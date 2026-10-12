// 🅰 Kinetic typography (round 25, type): type layers and lyric sync in the Lab, the hub side.
// - A type layer is plain layer code calling textLayer(P, opts) (drawn by tools/three-sandbox.html "kinetic type
//   layers": SDF glyphs or 3D extruded letters, in / out animations by glyph / word / line, paths, music reactions,
//   timed lyrics on the scene's clock). Its sliders are a normal tweak(): Save, Shuffle, keyframes, ♪ react-to work.
// - Presets (tools/three-type-data.js): one searchable picker (/type, right-click the preview › 🅰 Type, Ctrl/⌘+K, the
//   FX picker's "Type" category, /template type-<id>).
// - Lyrics (tools/three-type-lyrics.js): paste them or load an .lrc / .srt; untimed lines are aligned to the song
//   (the music analysis' onsets and beats), words too; /lyrics tap is the tap-along correction (Space at each line).
//   The lines live in the layer's code (opts.lyrics), so they're undoable and the time machine sees them; /lyrics
//   sequence puts them on the Lab sequence's Captions track.
// - Edits go through the layer's code. Chat: /type, /lyrics. Directors: three_do type { op } (one short entry in
//   three_do; the details on demand: three_do help type).
const LabType = (() => {
  const TD = TypeData; const LY = TypeLyrics;
  const info = new Map(); // layer id → the page's last type-info
  const D = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director : null);
  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const fmtNum = (n) => { const x = Math.round(Number(n) * 10000) / 10000; return Number.isFinite(x) ? String(x) : '0'; };
  const lit = (v) => (typeof v === 'number' ? fmtNum(v) : typeof v === 'boolean' ? String(v) : q(v));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const CALL = /(^|[^.\w$])textLayer\s*\(\s*P\s*[,)]/m;
  const isType = (code) => CALL.test(String(code || ''));

  // ---------- presets → layer code ----------
  function preset(q0) {
    const w = norm(q0);
    if (!w) return null;
    const L = TD.PRESETS;
    return L.find((p) => p.id === q0 || norm(p.id) === w || norm(p.name) === w) || L.find((p) => norm(p.name).startsWith(w) || norm(p.id).startsWith(w)) || L.find((p) => norm(`${p.name} ${p.cat} ${p.desc}`).includes(w)) || null;
  }
  function sliderLine(key, value) {
    const s = TD.SLIDERS[key];
    const v = value === undefined ? s.value : value;
    const parts = [`value: ${lit(v)}`];
    if (s.options) parts.push(`options: [${s.options.map(q).join(', ')}]`);
    if (s.min != null) parts.push(`min: ${fmtNum(s.min)}`, `max: ${fmtNum(s.max)}`);
    if (s.step) parts.push(`step: ${fmtNum(s.step)}`);
    parts.push(`label: ${q(s.label)}`, `group: ${q(s.group)}`);
    if (s.hint) parts.push(`hint: ${q(s.hint)}`);
    return `  ${key}: { ${parts.join(', ')} },`;
  }
  // the options as JSON, lyric lines one per row (still plain JSON: the hub reads them back)
  function optsText(o) {
    const { lyrics, ...rest } = o;
    const head = JSON.stringify(rest);
    if (!Array.isArray(lyrics)) return head;
    const rows = lyrics.map((x) => `  ${JSON.stringify(x)}`).join(',\n');
    return `${head.slice(0, -1)}${head === '{}' ? '' : ', '}"lyrics": [${rows ? `\n${rows}\n` : ''}]}`;
  }
  function codeFor(p, { name = null, sliders = {}, opts = {} } = {}) {
    const vals = { ...p.sliders, ...sliders };
    const o = { text: 'HEARTH', ...p.opts, ...opts };
    if (o.lyrics) delete o.text;
    const lyr = Array.isArray(o.lyrics);
    const keys = [...new Set([...TD.BASE, ...(o.mode === '3d' ? TD.P3D : []), ...(vals.path && vals.path !== 'line' ? TD.PPATH : []), ...(lyr ? TD.PLYR : []), ...Object.keys(vals)])].filter((k) => TD.SLIDERS[k]);
    for (const [k, v] of Object.entries(vals)) if (!TD.SLIDERS[k]) o[k] = v;
    const groups = [...new Set(keys.map((k) => TD.SLIDERS[k].group))];
    const lines = [
      `// 🅰 Type: ${name || p.name} (preset ${p.id}) · kinetic type: /type, /lyrics, three_do type.`,
      `// ${o.mode === '3d' ? '3D extruded letters (depth, bevel, material)' : 'crisp SDF text at any size'}; the sliders are live (♪ react-to, keyframes, Shuffle);`,
      '// the options at the end: text, mode 2d | 3d, font (family | google:Family | ref:<key>), lyrics [[start, end, "line", [word starts]]…]',
      'const P = tweak({',
      ...groups.flatMap((g) => keys.filter((k) => TD.SLIDERS[k].group === g).map((k) => sliderLine(k, vals[k]))),
      '});',
      '',
      `textLayer(P, ${optsText(o)});`,
    ];
    return `${lines.join('\n')}\n`;
  }
  function optsSpan(code) {
    const m = /(^|[^.\w$])textLayer\s*\(\s*P\s*,\s*/m.exec(code);
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
  function optsOf(code) {
    const sp = optsSpan(code);
    if (!sp) return {};
    try { return JSON.parse(sp.text); } catch { throw new Error('This layer\'s textLayer() options aren\'t plain JSON: edit them in the code.'); }
  }
  function setOpts(code, fn) {
    const sp = optsSpan(code);
    if (!sp) {
      if (!isType(code)) throw new Error('Not a type layer.');
      return code.replace(/(^|[^.\w$])textLayer\s*\(\s*P\s*\)/m, (m0, a) => { const o = {}; fn(o); return `${a}textLayer(P, ${optsText(o)})`; });
    }
    const o = optsOf(code); fn(o);
    return `${code.slice(0, sp.start)}${optsText(o)}${code.slice(sp.end)}`;
  }
  const keyRe = (k) => new RegExp(`^([ \\t]*${k}\\s*:\\s*\\{\\s*value\\s*:\\s*)('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|[^,}]+)`, 'm');
  const presetIdOf = (code) => /\(preset ([\w-]+)\)/.exec(String(code || ''))?.[1] || null;
  const sliderKeys = (code) => [...String(code).matchAll(/^[ \t]*(\w+)\s*:\s*\{\s*value\s*:/gm)].map((m) => m[1]).filter((k) => TD.SLIDERS[k]);
  const OPT_KEYS = ['text', 'mode', 'font', 'weight', 'points', 'seed', 'glyphs'];
  function sliderKey(key) {
    const k = String(key);
    return Object.keys(TD.SLIDERS).find((x) => x.toLowerCase() === k.toLowerCase()) || Object.keys(TD.SLIDERS).find((x) => norm(TD.SLIDERS[x].label) === norm(k)) || ({ in: 'inAnim', out: 'outAnim', by: 'unit', easing: 'ease', spacing: 'tracking', letterspacing: 'tracking' })[norm(k)] || null;
  }
  function setValue(code, key, value) {
    const k = sliderKey(key);
    if (!k) {
      if (OPT_KEYS.includes(key)) return { code: setOpts(code, (o) => { o[key] = value; }), key, value };
      throw new Error(`No type slider "${key}". Sliders: ${Object.keys(TD.SLIDERS).join(', ')}`);
    }
    const s = TD.SLIDERS[k];
    let v = value;
    if (s.options) { v = String(value); const hit = s.options.find((x) => norm(x) === norm(v)); if (!hit) throw new Error(`${s.label}: ${s.options.join(' | ')}`); v = hit; }
    else if (typeof s.value === 'string') { v = String(value); if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${s.label}: a color like #ff8800`); }
    else { v = Number(value); if (!Number.isFinite(v)) throw new Error(`${s.label}: a number (${s.min}–${s.max})`); v = Math.max(s.min, Math.min(s.max, v)); }
    const re = keyRe(k);
    if (re.test(code)) return { code: code.replace(re, (m0, a) => `${a}${lit(v)}`), key: k, value: v };
    const at = code.search(/^\}\);[ \t]*$/m);
    if (at < 0 || !/const P = tweak\(\{/.test(code)) throw new Error('This layer has no tweak({…}) block to add the slider to.');
    return { code: `${code.slice(0, at)}${sliderLine(k, v)}\n${code.slice(at)}`, key: k, value: v, added: true };
  }

  // ---------- reaching a layer (the scene on screen, or a chat's scene through the director's tools) ----------
  async function call(tool, args, ctx = {}) {
    const r = await HubBridge.call(tool, args, { chatId: ctx.chatId || null });
    if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`);
    return r.value;
  }
  const onScreen = (ctx = {}) => { if (!ctx.chatId || typeof ChatScenes === 'undefined') return true; const r = ChatScenes.routeThree('three_layers', ctx.chatId); return !r || r.sketchId === ThreeLab.scenes?.currentId(); };
  const isRow = (L) => /^type/.test(L.kind || '');
  async function target(ref, ctx = {}) {
    const v = await call('three_layers', {}, ctx);
    const pool = (v.layers || []).filter(isRow);
    if (!pool.length) throw new Error('No 🅰 type layer in this scene: /type <preset> adds one (/type list).');
    if (ref != null && ref !== '' && ref !== 'selected') {
      const r = String(ref).toLowerCase().replace(/^🅰\s*/, '');
      const hit = pool.find((L) => L.id === ref || L.name.toLowerCase() === String(ref).toLowerCase() || L.name.toLowerCase().replace(/^🅰\s*/, '') === r) || pool.find((L) => L.name.toLowerCase().includes(r));
      if (!hit) throw new Error(`No type layer "${ref}". Type layers: ${pool.map((L) => L.name).join(', ')}`);
      return hit;
    }
    return pool.find((L) => L.selected) || pool[pool.length - 1];
  }
  async function codeOf(L, ctx = {}) {
    if (onScreen(ctx) && D()) return D().codeOf(L.id).code;
    const v = await call('three_read_code', { layer: L.id, from: 1, to: 4000, force: true }, ctx);
    const txt = typeof v === 'string' ? v : String(v.code || '');
    return txt.split('\n').filter((ln) => !/^── /.test(ln)).map((ln) => ln.replace(/^\s*\d+\| /, '')).join('\n');
  }
  function stateOf(L, ctx = {}) {
    const errs = (D() && onScreen(ctx) ? D().report().errors : []).filter((e) => e.layer === L.name);
    const i = info.get(L.id);
    return { layer: L.name, ...(errs.length ? { errors: errs.map((e) => `line ${e.line ?? '?'}: ${e.message}`) } : {}), ...(i ? { mode: i.mode, font: i.font, glyphs: i.glyphs, ...(i.lines ? { lyricLines: i.lines } : {}), msPerFrame: Math.round(i.ms * 100) / 100 } : {}) };
  }
  async function apply(L, code, ctx = {}, wait = 1) { await call('three_update_layer', { layer: L.id, code, wait }, ctx); return stateOf(L, ctx); }
  const layerName = (n) => `🅰 ${String(n || 'Type').replace(/^🅰\s*/, '').replace(/\s+/g, ' ').slice(0, 36)}`;
  async function addLayer(code, name, ctx = {}, wait = 1.2) {
    const out = await call('three_add_layer', { name, code, wait }, ctx);
    const v = await call('three_layers', {}, ctx).catch(() => null);
    const row = v?.layers?.find((x) => x.name === (out.added || name));
    return row ? { ...stateOf(row, ctx), id: row.id } : { layer: out.added || name };
  }

  // ---------- the song: onsets, beats, sections from the Lab's analysis (for lyric alignment) ----------
  function music() {
    const P = ThreeLab.peek?.()?.player;
    if (!P?.loaded || P.isClock || !P.duration) return null;
    const a = P.analysis || {};
    let tl = {}; try { tl = P.timeline(); } catch { /* no map */ }
    return { duration: P.duration, bpm: P.bpm, bpb: P.beatsPerBar || 4, downbeat: P.downbeat ?? 0, beats: P.beatsIn(0, P.duration), onsets: a.onsets || {}, markers: tl.markers || {}, sections: (a.sections || []).map((s) => ({ start: s.start, end: s.end, label: s.label })), file: P.path };
  }

  // ---------- the operations (chat commands, the director's tool, the menus) ----------
  async function add(q0, { name = null, text = null, mode = null, font = null, sliders = {}, opts = {}, ctx = {}, replace = null } = {}) {
    const p = preset(q0 || 'title');
    if (!p) throw new Error(`No preset "${q0}". /type list shows them (${TD.PRESETS.length}).`);
    const o = { ...opts };
    if (text != null && text !== '') o.text = String(text).slice(0, 400);
    if (mode) o.mode = mode === '3d' ? '3d' : '2d';
    if (font) o.font = await fontRef(font);
    const nm = name || (o.text ? `${o.text.split('\n')[0].slice(0, 24)}` : p.name);
    const code = codeFor(p, { name: nm, sliders, opts: o });
    if (replace) { const L = await target(replace === true ? null : replace, ctx); return { ...(await apply(L, code, ctx)), from: p.name }; }
    return { ...(await addLayer(code, layerName(nm), ctx)), from: p.name };
  }
  async function edit(ref, fn, ctx = {}) {
    const L = await target(ref, ctx);
    const code = fn(await codeOf(L, ctx));
    return { L, ...(await apply(L, code, ctx)) };
  }
  async function set(ref, values, ctx = {}) {
    const done = [];
    const r = await edit(ref, (code) => {
      for (const [k, v] of Object.entries(values || {})) { const x = setValue(code, k, v); code = x.code; done.push(`${x.key} = ${typeof x.value === 'object' ? JSON.stringify(x.value) : x.value}${x.added ? ' (slider added)' : ''}`); }
      if (!done.length) throw new Error('set: { slider: value, … }');
      return code;
    }, ctx);
    return { ...r, L: undefined, set: done };
  }
  const anim = (ref, a = {}, ctx = {}) => set(ref, Object.fromEntries(Object.entries({ inAnim: a.in ?? a.inAnim, outAnim: a.out ?? a.outAnim, unit: a.unit ?? a.by, order: a.order, ease: a.ease, stagger: a.stagger, dur: a.dur, start: a.start, hold: a.hold, amount: a.amount }).filter(([, v]) => v != null && v !== '')), ctx);
  async function setPath(ref, kind, a = {}, ctx = {}) {
    const k = String(kind || 'line').toLowerCase();
    if (!TD.PATHS[k]) throw new Error(`Paths: ${Object.entries(TD.PATHS).map(([x, d]) => `${x} (${d})`).join(' · ')}`);
    const vals = { path: k, ...(a.size != null ? { pathSize: a.size } : {}), ...(a.offset != null ? { pathOffset: a.offset } : {}), ...(a.spin != null ? { pathSpin: a.spin } : {}) };
    return edit(ref, (code) => {
      for (const [x, v] of Object.entries(vals)) code = setValue(code, x, v).code;
      if (k === 'custom' && Array.isArray(a.points)) code = setOpts(code, (o) => { o.points = a.points; });
      return code;
    }, ctx).then((r) => ({ ...r, L: undefined, path: k }));
  }
  const setText = (ref, text, ctx = {}) => edit(ref, (code) => setOpts(code, (o) => { o.text = String(text ?? '').slice(0, 400); delete o.lyrics; }), ctx).then((r) => ({ ...r, L: undefined, text: String(text) }));
  // a font: a family name, "google:Name", an asset-library font (its name: becomes a reference of the scene), a .ttf path
  async function fontRef(f) {
    const s = String(f || '').trim();
    if (!s || /^(google|ref):/i.test(s) || /[,"']/.test(s)) return s;
    const path = /\.(ttf|otf|woff2?)$/i.test(s) ? s : null;
    let file = path;
    if (!file && typeof Assets !== 'undefined' && Assets.search) {
      try { await Assets.ready?.(); const hit = Assets.search(`kind:font ${s}`)?.[0]; if (hit?.p) file = hit.p; } catch { /* no library */ }
    }
    if (file) { const r = await ThreeLab.addReference(file); return `ref:${r.key}`; }
    return s;
  }
  const setFont = async (ref, f, ctx = {}) => { const v = await fontRef(f); return edit(ref, (code) => setOpts(code, (o) => { o.font = v; }), ctx).then((r) => ({ ...r, L: undefined, font: v })); };
  async function setMode(ref, mode, ctx = {}) {
    const m = mode === '3d' ? '3d' : '2d';
    return edit(ref, (code) => {
      code = setOpts(code, (o) => { o.mode = m; });
      if (m === '3d') for (const k of TD.P3D) if (!keyRe(k).test(code)) code = setValue(code, k, TD.SLIDERS[k].value).code;
      return code;
    }, ctx).then((r) => ({ ...r, L: undefined, mode: m }));
  }
  async function react(ref, a = {}, ctx = {}) {
    const off = a.off || a.kick === 'off';
    const vals = off ? { kickScale: 0, kickGlow: 0, kickJitter: 0, bassColor: 0, beatBounce: 0 } : {
      ...(a.kick != null ? { kickScale: a.kick === true ? 0.4 : a.kick, kickGlow: a.kick === true ? 0.8 : Math.min(2, Number(a.kick) * 2) } : {}),
      ...(a.bass != null ? { bassColor: a.bass === true ? 0.8 : a.bass } : {}),
      ...(a.jitter != null ? { kickJitter: a.jitter === true ? 0.6 : a.jitter } : {}),
      ...(a.bounce != null ? { beatBounce: a.bounce === true ? 0.5 : a.bounce } : {}),
      ...(a.letters != null ? { letterReact: a.letters === true ? 0.7 : a.letters } : {}),
    };
    if (!Object.keys(vals).length) Object.assign(vals, { kickScale: 0.4, kickGlow: 0.8, bassColor: 0.5, letterReact: 0.5 });
    return set(ref, vals, ctx);
  }
  // glyph-level: one glyph (its index, from 0) gets its own color / scale / place / turn
  const letter = (ref, i, vals, ctx = {}) => edit(ref, (code) => setOpts(code, (o) => { o.glyphs = { ...(o.glyphs || {}), [i]: { ...(o.glyphs?.[i] || {}), ...vals } }; }), ctx).then((r) => ({ ...r, L: undefined, glyph: i, ...vals }));
  async function infoOf(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const code = await codeOf(L, ctx);
    let o = {}; try { o = optsOf(code); } catch { /* hand-written */ }
    const ly = Array.isArray(o.lyrics) ? o.lyrics.length : 0;
    if (o.lyrics) o.lyrics = `${ly} lines`;
    return { ...stateOf(L, ctx), preset: presetIdOf(code), options: o, sliders: sliderKeys(code) };
  }
  function listText(filter = '') {
    const w = String(filter).toLowerCase().trim();
    const L = TD.PRESETS.filter((p) => !w || `${p.id} ${p.name} ${p.cat} ${p.desc}`.toLowerCase().includes(w));
    const cats = [...new Set(L.map((p) => p.cat))];
    return cats.map((c) => `**${c}**\n${L.filter((p) => p.cat === c).map((p) => `- \`/type ${p.id}\` ${p.name}: ${p.desc}`).join('\n')}`).join('\n') || 'No preset matches.';
  }
  // the word into ✦ particles (the particles stream's text emitter)
  async function toParticles(ref, ctx = {}) {
    if (typeof LabParticles === 'undefined') throw new Error('The particles aren\'t loaded');
    const L = await target(ref, ctx).catch(() => null);
    let o = {}; if (L) try { o = optsOf(await codeOf(L, ctx)); } catch { /* defaults */ }
    const text = Array.isArray(o.lyrics) ? (o.lyrics[0]?.[2] || 'HEARTH') : (o.text || 'HEARTH');
    const fam = o.font && !/^(ref|google):/i.test(o.font) ? o.font : null;
    return LabParticles.add('dissolve', { text, opts: fam ? { font: fam } : {}, ctx });
  }

  // ---------- lyrics ----------
  async function lyricsLayer(ref, ctx) { try { return await target(ref, ctx); } catch { return null; } }
  // set lyrics (pasted text, .lrc / .srt content) on the type layer (a new one in the look's preset when there's none),
  // aligned to the song when they have no times
  async function lyrics({ text, file = null, look = null, layer = null, align: doAlign = true, ctx = {} } = {}) {
    let src = text; let nameHint = '';
    if (file) { src = await window.hub.fs.read(file); nameHint = file; }
    if (!src || !String(src).trim()) throw new Error('Paste the lyrics (one line each), or give an .lrc / .srt file');
    const parsed = LY.parse(String(src), nameHint);
    if (!parsed.lines.length) throw new Error('No lyric lines in there');
    const m = music();
    let lines = parsed.lines; let how = parsed.timed ? `timed (${parsed.kind})` : 'untimed';
    if (m && doAlign) { const r = LY.align(lines, m); lines = r.lines; how = `${how} · ${r.how}`; }
    else if (!parsed.timed) { const r = LY.align(lines, { duration: Math.max(lines.length * 3 + 4, 20), bpm: 120 }); lines = r.lines; how = `${how} · no song: one line every few seconds`; }
    const L = layer ? await target(layer, ctx) : await lyricsLayer(null, ctx);
    const pk = LY.pack(lines);
    const lk = look && TD.LOOKS[look] ? look : null;
    if (L) {
      const code0 = await codeOf(L, ctx);
      let code = setOpts(code0, (o) => { o.lyrics = pk; delete o.text; });
      for (const k of TD.PLYR) if (!keyRe(k).test(code)) code = setValue(code, k, TD.SLIDERS[k].value).code;
      if (lk) code = setValue(code, 'look', lk).code;
      return { ...(await apply(L, code, ctx)), lines: lines.length, how, ...(m ? {} : { note: 'no song loaded: load one and /lyrics align' }) };
    }
    const p = preset(lk ? ({ fades: 'fades', karaoke: 'karaoke', oneword: 'oneword', scroll: 'scroll', type: 'typed', lines: 'lyric3d' })[lk] : 'karaoke');
    const r = await addLayer(codeFor(p, { name: 'Lyrics', opts: { lyrics: pk } }), layerName('Lyrics'), ctx);
    return { ...r, lines: lines.length, how, ...(m ? {} : { note: 'no song loaded: load one and /lyrics align' }) };
  }
  async function linesOf(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const o = optsOf(await codeOf(L, ctx));
    if (!Array.isArray(o.lyrics)) throw new Error(`"${L.name}" has no lyrics: /lyrics pastes some`);
    return { L, lines: LY.unpack(o.lyrics) };
  }
  async function writeLines(L, lines, ctx = {}) { const code = setOpts(await codeOf(L, ctx), (o) => { o.lyrics = LY.pack(lines); }); return apply(L, code, ctx, 0.6); }
  async function realign(ref, { from = null, to = null, keepTimes = false } = {}, ctx = {}) {
    const m = music();
    if (!m) throw new Error('Load the song first (the alignment uses its onsets and beats)');
    const { L, lines } = await linesOf(ref, ctx);
    const r = LY.align(keepTimes ? lines : lines.map((x) => ({ text: x.text })), m, { from, to });
    return { ...(await writeLines(L, r.lines, ctx)), lines: r.lines.length, how: r.how };
  }
  async function shift(ref, by, ctx = {}) {
    const dt = Number(by);
    if (!Number.isFinite(dt)) throw new Error('shift: seconds, e.g. 0.25 or -0.1');
    const { L, lines } = await linesOf(ref, ctx);
    return { ...(await writeLines(L, LY.shift(lines, dt), ctx)), shifted: dt };
  }
  async function exportLyrics(ref, fmt = 'lrc', ctx = {}) {
    const { L, lines } = await linesOf(ref, ctx);
    const text = fmt === 'srt' ? LY.toSRT(lines) : LY.toLRC(lines, { words: fmt === 'lrc-words' || fmt === 'words' });
    let p = null;
    try { const home = await window.hub.fs.home(); p = `${home}/Hearth lyrics/${L.name.replace(/[^\w -]+/g, '').trim() || 'lyrics'}.${fmt === 'srt' ? 'srt' : 'lrc'}`; await window.hub.fs.write(p, text); } catch { p = null; }
    return { layer: L.name, file: p, text: p ? undefined : text, lines: lines.length };
  }
  // the lines onto the Lab sequence's Captions track (each one a timed caption, styled by the sequence's caption look)
  async function toSequence(ref, ctx = {}) {
    const { lines } = await linesOf(ref, ctx);
    if (typeof ThreeSeq === 'undefined' || !ThreeSeq.captionsFromCues) throw new Error('The Lab sequence isn\'t loaded');
    const n = ThreeSeq.captionsFromCues(lines.map((x) => ({ a: x.a, b: x.b, text: x.text })));
    return { captions: n, note: 'on the sequence\'s Captions track (▤ Sequence)' };
  }

  // ---------- tap-along correction: Space at each line's start while the song plays ----------
  let tapState = null;
  function tapStrip() {
    const S = tapState; if (!S) return;
    const L = S.lines[S.i];
    const txt = L ? `🎤 Line ${S.i + 1}/${S.lines.length}: “${L.text.slice(0, 60)}” · Space when it starts` : `🎤 All ${S.lines.length} lines tapped · Enter keeps them`;
    if (S.el.firstChild?.textContent !== txt) S.el.firstChild.textContent = txt;
  }
  async function tapMode(ref = null, { play = true } = {}) {
    const c = await ThreeLab.cmd();
    const { L, lines } = await linesOf(ref);
    if (tapState) tapStop(false);
    const el0 = el('div', { class: 'type-tap', attrs: { role: 'status' } }, el('span', { text: '' }), el('span', { class: 'hint', text: ' ⌫ back · Enter keep · Esc cancel' }));
    Object.assign(el0.style, { position: 'fixed', top: '64px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '8px 14px', borderRadius: '10px', background: 'var(--panel, #16161c)', border: '1px solid var(--accent, #ff8c42)', font: '600 13px system-ui, sans-serif', color: 'var(--text, #f4ece0)', boxShadow: '0 4px 18px #0006', pointerEvents: 'auto' });
    document.body.append(el0);
    // start at the first line (a second before it) unless the song is already playing
    const P = c.player;
    tapState = { L, lines: lines.map((x) => ({ ...x, w: x.w ? x.w.slice() : null })), orig: lines, i: 0, tapped: new Set(), hist: [], el: el0, P };
    if (play && P?.loaded && !P.playing) { try { P.seek(Math.max(0, (lines[0]?.a ?? 1) - 1.5)); P.toggle(true); } catch { /* the player decides */ } }
    const onKey = (e) => {
      if (!tapState) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); tapAt(P?.time ?? 0); }
      else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); tapBack(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tapStop(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tapStop(false); }
    };
    addEventListener('keydown', onKey, true);
    tapState.off = () => removeEventListener('keydown', onKey, true);
    tapStrip();
    return { layer: L.name, lines: lines.length };
  }
  // a tap at song time t: line i starts there (snapped to an onset within 80 ms); the lines after it move with it
  function tapAt(t) {
    const S = tapState; if (!S || S.i >= S.lines.length) return null;
    S.hist.push(S.lines.map((x) => ({ ...x, w: x.w ? x.w.slice() : null })));
    LY.tap(S.lines, S.i, Number(t), music(), { tapped: S.tapped });
    S.tapped.add(S.i); S.i += 1;
    tapStrip();
    clearTimeout(S.wt); S.wt = setTimeout(() => { if (tapState === S) writeLines(S.L, S.lines).catch(() => {}); }, 250);
    return { line: S.i - 1, at: S.lines[S.i - 1].a };
  }
  function tapBack() { const S = tapState; if (!S || !S.hist.length) return; S.lines = S.hist.pop(); S.i = Math.max(0, S.i - 1); S.tapped.delete(S.i); tapStrip(); }
  async function tapStop(keep = true) {
    const S = tapState; if (!S) return null;
    tapState = null; S.off?.(); S.el.remove(); clearTimeout(S.wt);
    await writeLines(S.L, keep ? S.lines : S.orig).catch((e) => toast(e.message, { type: 'error' }));
    if (keep) toast(`🎤 ${S.tapped.size} line${S.tapped.size === 1 ? '' : 's'} retimed`, { timeout: 1800 });
    return { kept: keep, tapped: S.tapped.size, lines: S.lines };
  }

  // ---------- the picker: one searchable list ----------
  function picker({ replace = false } = {}) {
    const shade = el('div', { class: 'sh-shade', on: { pointerdown: (e) => { if (e.target === shade) shade.remove(); } } });
    const box = el('div', { class: 'sh-dlg sh-lib', attrs: { role: 'dialog', 'aria-label': 'Type presets' } });
    shade.append(box);
    shade.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); shade.remove(); } });
    document.body.append(shade);
    const input = el('input', { type: 'search', class: 'sh-search', placeholder: `Search ${TD.PRESETS.length} type presets (wave, glitch, chrome 3D, circle, karaoke…)`, attrs: { 'aria-label': 'Search type presets' } });
    const list = el('div', { class: 'sh-list', attrs: { role: 'listbox' } });
    box.append(el('div', { class: 'sh-head' }, el('b', { text: '🅰 Kinetic type' })), input, list, el('div', { class: 'hint', text: 'Enter adds a layer · Shift+Enter replaces the selected type layer · Esc closes' }));
    let rows = []; let at = 0;
    const go = (p, rep) => {
      shade.remove();
      const lyr = p.cat === 'Lyrics';
      const ask = lyr ? Modal.prompt('Lyrics: paste them (one line each) or an .lrc / .srt', { multiline: true, value: '', label: 'Lyrics' }) : Modal.prompt('Text', { value: p.opts.text || 'HEARTH', label: 'The words (/ or a new line starts a line)' });
      Promise.resolve(ask).then((txt) => {
        if (txt === null) return null;
        if (lyr) return lyrics({ text: txt, look: p.sliders.look });
        return add(p.id, { text: txt || null, replace: rep || replace ? true : null });
      }).then((r) => r && toast(`🅰 ${p.name}${r.how ? ` · ${r.lines} lines` : ''}${r.errors ? ` · ${r.errors[0]}` : ''}`, { timeout: 1800 })).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    };
    const draw = () => {
      const w = input.value.toLowerCase().trim();
      rows = TD.PRESETS.filter((p) => !w || `${p.name} ${p.cat} ${p.desc} ${p.id}`.toLowerCase().includes(w));
      at = Math.min(at, Math.max(0, rows.length - 1));
      list.replaceChildren(...rows.map((p, i) => el('button', { type: 'button', class: `sh-item${i === at ? ' on' : ''}`, attrs: { role: 'option' }, on: { click: (e) => go(p, e.shiftKey) } },
        el('b', { text: p.name }), el('span', { class: 'sh-cat', text: p.cat }), el('span', { class: 'hint', text: p.desc }))));
    };
    input.addEventListener('input', () => { at = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))); draw(); list.children[at]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && rows[at]) { e.preventDefault(); go(rows[at], e.shiftKey); }
    });
    draw();
    input.focus();
    return { close: () => shade.remove() };
  }
  async function pasteLyrics() {
    const t = await Modal.prompt('Lyrics: paste them (one line each), or an .lrc / .srt', { multiline: true, value: '', label: 'Lyrics' });
    if (t === null || !String(t).trim()) return null;
    return lyrics({ text: t });
  }
  async function loadLyricsFile() {
    const [p] = (await window.hub.openDialog({ title: 'Lyrics (.lrc, .srt, .txt)', filters: [{ name: 'Lyrics', extensions: ['lrc', 'srt', 'vtt', 'txt'] }] })) || [];
    return p ? lyrics({ file: p }) : null;
  }

  // ---------- menus ----------
  const quick = (p, ok) => () => p().then((r) => ok && toast(typeof ok === 'function' ? ok(r) : ok, { timeout: 1600 })).catch((e) => toast(e.message, { type: 'error' }));
  function layerMenu(L) {
    if (!L?.code || !isType(L.code)) return [];
    let o = {}; try { o = optsOf(L.code); } catch { /* hand-written */ }
    const lyr = Array.isArray(o.lyrics);
    const pick = (list, fn) => list.map((x) => [x, '', quick(() => fn(x), `🅰 ${x}`)]);
    return [['🅰 Type', `${o.mode === '3d' ? '3D' : '2D'}${lyr ? ` · ${o.lyrics.length} lyric lines` : ''}`, [
      ...(lyr ? [] : [['Text…', String(o.text || '').slice(0, 24), () => Promise.resolve(Modal.prompt('Text', { value: o.text || '', label: 'The words (/ or a new line starts a line)', multiline: true })).then((t) => t !== null && setText(L.id, t)).catch((e) => toast(e.message, { type: 'error' }))]]),
      ['In', '', pick(TD.ANIM_IDS, (x) => anim(L.id, { in: x }))],
      ['Out', '', pick(['none', ...TD.ANIM_IDS], (x) => anim(L.id, { out: x }))],
      ['By', 'glyph, word, line', pick(TD.UNITS, (x) => anim(L.id, { unit: x }))],
      ['Path', '', Object.keys(TD.PATHS).filter((x) => x !== 'custom').map((x) => [x, TD.PATHS[x], quick(() => setPath(L.id, x), `🅰 ${TD.PATHS[x]}`)])],
      [o.mode === '3d' ? 'Flat (2D)' : 'Extrude (3D)', '', quick(() => setMode(L.id, o.mode === '3d' ? '2d' : '3d'), o.mode === '3d' ? '🅰 2D' : '🅰 3D')],
      ...(o.mode === '3d' ? [['Material', '', pick(TD.MATERIALS, (x) => set(L.id, { material: x }))]] : []),
      ['♪ React to the music', 'scale + glow on kick, color on bass', quick(() => react(L.id, {}), '♪ reacting')],
      ...(lyr ? [['Lyric look', '', Object.keys(TD.LOOKS).map((x) => [x, TD.LOOKS[x], quick(() => set(L.id, { look: x }), `🅰 ${x}`)])], ['🎤 Tap along (fix the timing)…', 'Space at each line', () => tapMode(L.id).catch((e) => toast(e.message, { type: 'error' }))], ['Align to the song again', 'onsets, beats', quick(() => realign(L.id), (r) => `🅰 ${r.lines} lines · ${r.how}`)], ['To the sequence (captions)', '', quick(() => toSequence(L.id), (r) => `▤ ${r.captions} captions`)]] : [['Lyrics…', 'paste, .lrc, .srt', () => pasteLyrics().catch((e) => toast(e.message, { type: 'error' }))]]),
      ['✦ Into particles', 'the words as dust', quick(() => toParticles(L.id), '✦ the words in particles')],
      ['Replace with a preset…', '', () => picker({ replace: true })],
    ]]];
  }
  function previewItem() {
    return { label: '🅰 Type', hint: 'kinetic type, lyrics', items: () => [
      { label: '🅰 New type layer…', hint: `${TD.PRESETS.length} presets`, action: () => picker() },
      { label: 'Lyrics…', hint: 'paste, aligned to the song', action: () => pasteLyrics().then((r) => r && toast(`🅰 ${r.lines} lyric lines · ${r.how}`, { timeout: 2400 })).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Lyrics from a file…', hint: '.lrc · .srt', action: () => loadLyricsFile().then((r) => r && toast(`🅰 ${r.lines} lyric lines`, { timeout: 2000 })).catch((e) => toast(e.message, { type: 'error' })) },
      { label: '🎤 Tap along…', hint: 'fix the lyric timing', action: () => tapMode().catch((e) => toast(e.message, { type: 'error' })) },
    ] };
  }
  function onBox(msg) {
    if (msg.type !== 'type-info') return;
    info.set(msg.layer, msg);
    if (info.size > 64) info.delete(info.keys().next().value);
  }

  // ---------- the director's tool: three_do type { op } ----------
  const OPS = 'list {filter} | add {preset, text, mode: 2d|3d, font, sliders} | set {layer, values} | anim {layer, in, out, unit, order, ease, stagger, dur} | path {layer, kind, size, offset, spin, points} | text {layer, text} | font {layer, font} | mode {layer, mode} | letter {layer, index, color, scale, x, y, turn} | lyrics {layer?, text | file, look} | align {layer} | shift {layer, by} | react {layer, kick, bass, jitter, bounce, letters, off} | particles {layer} | export {layer, format: lrc|srt} | sequence {layer} | info {layer} | help';
  async function op(a = {}, ctx = {}) {
    const o = String(a.op || 'help');
    if (o === 'help') return TD.HELP;
    if (o === 'list') return TD.PRESETS.filter((p) => !a.filter || `${p.id} ${p.name} ${p.cat} ${p.desc}`.toLowerCase().includes(String(a.filter).toLowerCase())).map((p) => `${p.id}: ${p.name} (${p.cat}) ${p.desc}`).join('\n');
    if (o === 'add') return add(a.preset || a.id || 'title', { name: a.name, text: a.text, mode: a.mode, font: a.font, sliders: a.sliders || a.values || {}, opts: a.opts || {}, ctx, replace: a.replace || null });
    if (o === 'set') return set(a.layer, a.values || a.sliders || Object.fromEntries(Object.entries(a).filter(([k]) => !['op', 'cmd', 'layer'].includes(k))), ctx);
    if (o === 'anim') return anim(a.layer, a, ctx);
    if (o === 'path') return setPath(a.layer, a.kind || a.path, a, ctx);
    if (o === 'text') return setText(a.layer, a.text, ctx);
    if (o === 'font') return setFont(a.layer, a.font, ctx);
    if (o === 'mode') return setMode(a.layer, a.mode, ctx);
    if (o === 'letter') return letter(a.layer, Number(a.index ?? a.i ?? 0), Object.fromEntries(['color', 'scale', 'x', 'y', 'turn', 'alpha'].filter((k) => a[k] != null).map((k) => [k, a[k]])), ctx);
    if (o === 'lyrics') return lyrics({ text: a.text || a.lyrics, file: a.file || a.path || null, look: a.look, layer: a.layer || null, ctx });
    if (o === 'align') return realign(a.layer, { from: a.from ?? null, to: a.to ?? null }, ctx);
    if (o === 'shift') return shift(a.layer, a.by ?? a.value, ctx);
    if (o === 'react') return react(a.layer, a, ctx);
    if (o === 'particles') return toParticles(a.layer, ctx);
    if (o === 'export') return exportLyrics(a.layer, a.format || 'lrc', ctx);
    if (o === 'sequence') return toSequence(a.layer, ctx);
    if (o === 'info') return infoOf(a.layer, ctx);
    throw new Error(`type ops: ${OPS}`);
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_type'], async (tool, args, ctx) => {
    try { const v = await op(args, ctx); if (v && typeof v === 'object' && 'L' in v) delete v.L; return { ok: true, value: v }; } catch (err) { return { ok: false, error: err.message }; }
  });

  // ---------- presets in the FX picker / /template / three_add_layer {template} ----------
  if (typeof ThreeLayers !== 'undefined') {
    for (const p of TD.PRESETS) {
      const id = `type-${p.id}`;
      if (ThreeLayers.TEMPLATES.some((t) => t.id === id)) continue;
      ThreeLayers.TEMPLATES.push({ id, name: `🅰 ${p.name}`, cat: 'Type', desc: p.desc, tags: `type text kinetic typography ${p.cat.toLowerCase()} ${p.opts.mode || '2d'}`, get code() { return codeFor(p); } });
    }
  }

  // ---------- chat commands ----------
  const fmt = (r) => (typeof r === 'string' ? r : Object.entries(r).filter(([k, v]) => k !== 'L' && v !== undefined).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(' · ') : v && typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
  const said = (r) => `🅰 "${r.layer}"${r.from ? ` (${r.from})` : ''}${r.mode ? ` · ${r.mode}` : ''}${r.errors ? ` · ${r.errors[0]}` : ''}`;
  const lyrSaid = (r) => `🅰 "${r.layer}": ${r.lines} lyric lines · ${r.how}${r.note ? ` (${r.note})` : ''}`;
  function registerCommands() {
    if (typeof Commands === 'undefined') return;
    if (!Commands.get('type')) Commands.register({
      name: 'type', area: 'Three.js Lab', aliases: ['kinetic-type', 'text-layer'],
      args: '[<preset> [words] | text <words> | 3d <words> | in <anim> | out <anim> | by glyph|word|line | path <kind> | font <family|google:Name|asset> | material <kind> | set <slider> <value> | letter <n> <color> | react [kick|bass|off] | particles | list [word] | info | help]',
      desc: '🅰 Kinetic type: crisp text (or 3D extruded letters) animated in and out by letter / word / line, on paths, reacting to the music',
      examples: ['/type', '/type wave HELLO WORLD', '/type chrome3d DROP', '/type in glitch', '/type by word', '/type path circle', '/type font google:Anton', '/type react kick', '/type list 3d'],
      keywords: 'kinetic typography text title letters words glyphs sdf msdf 3d extrude bevel typewriter glitch scatter wave split-flap text on path circle lyrics',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^set\b/.test(w)) { const k = w.slice(3).trim(); return Object.keys(TD.SLIDERS).filter((x) => !k || x.toLowerCase().startsWith(k)).slice(0, 30).map((x) => ({ value: `set ${x} `, hint: TD.SLIDERS[x].label })); }
        if (/^(in|out)\b/.test(w)) { const v = w.split(/\s+/)[0]; return [...(v === 'out' ? ['none'] : []), ...TD.ANIM_IDS].map((x) => ({ value: `${v} ${x}`, hint: TD.ANIMS[x] || '' })).filter((x) => x.value.startsWith(w)); }
        if (/^path\b/.test(w)) return Object.keys(TD.PATHS).map((x) => ({ value: `path ${x}`, hint: TD.PATHS[x] })).filter((x) => x.value.startsWith(w));
        if (/^by\b/.test(w)) return TD.UNITS.map((x) => ({ value: `by ${x}` })).filter((x) => x.value.startsWith(w));
        if (/^material\b/.test(w)) return TD.MATERIALS.map((x) => ({ value: `material ${x}` })).filter((x) => x.value.startsWith(w));
        const verbs = [{ value: 'list', hint: `the ${TD.PRESETS.length} presets` }, { value: 'text ', hint: 'new words' }, { value: '3d ', hint: 'extruded letters' }, { value: 'in ', hint: 'the in animation' }, { value: 'out ', hint: 'the out animation' }, { value: 'by ', hint: 'glyph, word, line' }, { value: 'path ', hint: 'circle, arc, wave, spiral' }, { value: 'font ', hint: 'a family, google:Name, an asset font' }, { value: 'material ', hint: '3D: chrome, gold, glass…' }, { value: 'set ', hint: 'a slider' }, { value: 'letter ', hint: 'one letter: color / scale' }, { value: 'react', hint: '♪ kick, bass' }, { value: 'particles', hint: 'the words as ✦ dust' }, { value: 'info' }, { value: 'help' }];
        return [...TD.PRESETS.map((p) => ({ value: `${p.id} `, hint: `${p.name} · ${p.cat}` })), ...verbs].filter((x) => !w || x.value.startsWith(w)).slice(0, 40);
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const tail = rest.join(' ');
        const v = (verb || '').toLowerCase();
        if (!v) { await ThreeLab.cmd(); picker(); return null; }
        if (v === 'help') return `\`\`\`\n${TD.HELP}\n\`\`\``;
        if (v === 'list') return listText(tail);
        if (v === 'text' || v === 'words') { await ThreeLab.cmd(); try { return `🅰 "${(await setText(null, tail.replace(/\s*\/\s*/g, '\n'))).layer}": ${tail}`; } catch (e) { if (!/No 🅰 type layer/.test(e.message)) throw e; return said(await add('title', { text: tail || 'HEARTH' })); } }
        if (v === '3d') { await ThreeLab.cmd(); return said(await add('chrome3d', { text: tail || 'HEARTH' })); }
        if (v === '2d') return `🅰 "${(await setMode(null, '2d')).layer}" is flat`;
        if (v === 'in' || v === 'out') { const r = await anim(null, { [v]: tail }); return `🅰 "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'by' || v === 'unit') { const r = await anim(null, { unit: tail }); return `🅰 "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'path') { const [k, sz] = rest; const r = await setPath(null, k, sz ? { size: sz } : {}); return `🅰 "${r.layer}" ${TD.PATHS[r.path]}`; }
        if (v === 'font') { const r = await setFont(null, tail); return `🅰 "${r.layer}" in ${r.font}`; }
        if (v === 'material') { const r = await set(null, { material: tail }); return `🅰 "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'set') { const [k, ...vv] = rest; if (!k || !vv.length) return 'Usage: /type set <slider> <value> (/type help lists them)'; const r = await set(null, { [k]: vv.join(' ') }); return `🅰 "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'letter') { const [i, c2, sc] = rest; if (i == null) return 'Usage: /type letter <n> <#color> [scale]'; const r = await letter(null, Number(i), { ...(c2 ? { color: c2 } : {}), ...(sc ? { scale: Number(sc) } : {}) }); return `🅰 "${r.layer}": letter ${r.glyph}`; }
        if (v === 'react') { const k = rest[0]?.toLowerCase(); const r = await react(null, k === 'off' ? { off: true } : k === 'kick' ? { kick: true } : k === 'bass' ? { bass: true, letters: true } : k === 'jitter' ? { jitter: true } : {}); return `♪ "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'particles') { await ThreeLab.cmd(); const r = await toParticles(null); return `✦ "${r.layer}": the words in particles`; }
        if (v === 'info') return fmt(await infoOf(null));
        const p = preset(v);
        if (p) { await ThreeLab.cmd(); if (p.cat === 'Lyrics') { if (!tail) { await pasteLyricsFor(p); return null; } return lyrSaid(await lyrics({ text: tail, look: p.sliders.look })); } return said(await add(p.id, { text: tail || null })); }
        await ThreeLab.cmd(); return said(await add('title', { text: w }));
      },
    });
    if (!Commands.get('lyrics')) Commands.register({
      name: 'lyrics', area: 'Three.js Lab', aliases: ['lyric', 'karaoke'],
      args: '[paste | load [file] | <pasted lines> | look <fades|karaoke|oneword|scroll|type|lines> | align | tap | shift <s> | export [lrc|srt] | sequence | info]',
      desc: '🅰 Lyrics on the song: paste them or load an .lrc / .srt, lines (and words) aligned to the music, tap-along correction, lyric video looks',
      examples: ['/lyrics', '/lyrics load ~/song.lrc', '/lyrics look karaoke', '/lyrics tap', '/lyrics shift 0.2', '/lyrics export srt', '/lyrics sequence'],
      keywords: 'lyrics lrc srt karaoke lyric video sync align words tap timing captions subtitles song',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^look\b/.test(w)) return Object.keys(TD.LOOKS).map((x) => ({ value: `look ${x}`, hint: TD.LOOKS[x] })).filter((x) => x.value.startsWith(w));
        return [{ value: 'paste', hint: 'paste lines' }, { value: 'load ', hint: '.lrc · .srt · .txt' }, { value: 'look ', hint: 'karaoke, one word, scroll…' }, { value: 'align', hint: 'onto the song again' }, { value: 'tap', hint: '🎤 Space at each line' }, { value: 'shift ', hint: 'seconds (+ later)' }, { value: 'export ', hint: 'lrc · srt' }, { value: 'sequence', hint: 'captions track' }, { value: 'info' }].filter((x) => !w || x.value.startsWith(w));
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const tail = rest.join(' ');
        const v = (verb || '').toLowerCase();
        if (!v || v === 'paste') { await ThreeLab.cmd(); const r = await pasteLyrics(); return r ? lyrSaid(r) : null; }
        if (v === 'load') { await ThreeLab.cmd(); const r = tail ? await lyrics({ file: tail.replace(/^~(?=[\\/])/, await window.hub.fs.home()) }) : await loadLyricsFile(); return r ? lyrSaid(r) : null; }
        if (v === 'look') { const r = await set(null, { look: tail }); return `🅰 "${r.layer}": ${r.set.join(' · ')}`; }
        if (v === 'align') { const r = await realign(null); return `🅰 "${r.layer}": ${r.lines} lines · ${r.how}`; }
        if (v === 'tap') { const r = await tapMode(null); return `🎤 Tap along on "${r.layer}": Space at each line's start (⌫ back, Enter keeps, Esc cancels)`; }
        if (v === 'shift') { const r = await shift(null, tail); return `🅰 "${r.layer}": lyrics moved ${r.shifted > 0 ? '+' : ''}${r.shifted} s`; }
        if (v === 'export') { const r = await exportLyrics(null, (rest[0] || 'lrc').toLowerCase()); return r.file ? `🅰 ${r.lines} lines → ${r.file}` : `\`\`\`\n${r.text}\n\`\`\``; }
        if (v === 'sequence' || v === 'captions') { const r = await toSequence(null); return `▤ ${r.captions} captions ${r.note}`; }
        if (v === 'info') { const { L, lines } = await linesOf(null); return `🅰 "${L.name}": ${lines.length} lines\n${lines.slice(0, 12).map((x) => `- ${x.a.toFixed(2)}–${x.b.toFixed(2)} ${x.text}`).join('\n')}${lines.length > 12 ? '\n…' : ''}`; }
        await ThreeLab.cmd(); return lyrSaid(await lyrics({ text: w.replace(/\s*\/\s*/g, '\n') }));
      },
    });
  }
  async function pasteLyricsFor(p) {
    const t = await Modal.prompt('Lyrics: paste them (one line each), or an .lrc / .srt', { multiline: true, value: '', label: 'Lyrics' });
    if (t === null || !String(t).trim()) return null;
    return lyrics({ text: t, look: p.sliders.look });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: 🅰 Kinetic type (presets)…', () => ThreeLab.cmd().then(() => picker()));
    AppUI.addAction('Lab: 🅰 Lyrics (paste, aligned to the song)…', () => ThreeLab.cmd().then(() => pasteLyrics()).catch((e) => toast(e.message, { type: 'error' })));
    AppUI.addAction('Lab: 🎤 Tap along to fix the lyric timing', () => ThreeLab.cmd().then(() => tapMode()).catch((e) => toast(e.message, { type: 'error' })));
  }
  try { Keys.add({ area: 'Lab', keys: 'Space · ⌫ · Enter · Esc', what: '🎤 Lyrics tap-along (/lyrics tap): Space marks the next line\'s start, ⌫ goes back, Enter keeps, Esc cancels', when: () => Boolean(tapState) }); } catch { /* keys list optional */ }

  return { isType, preset, codeFor, optsOf, setOpts, setValue, onBox, layerMenu, previewItem, picker, op, add, set, anim, setPath, setText, setFont, setMode, react, letter, infoOf, lyrics, realign, shift, exportLyrics, toSequence, toParticles, tapMode, tapAt, tapBack, tapStop, music, info: (id) => info.get(id) || null, get tapping() { return tapState ? { i: tapState.i, n: tapState.lines.length } : null; }, OPS, PRESETS: TD.PRESETS };
})();
window.LabType = LabType;
