// 🎵 Music visualizers (round 50, labvisualizers): one click, a visualizer layer that moves with the song. The hub side.
// - One picker (＋ Add › 🎵 Music visualizer…, a 🎵 layer's right-click, Lab search, Find anything, /visualizer): 17
//   looks as live previews on a 120 BPM demo song (spectrum bars, circular spectrum, mirrored bars, waveform line,
//   waveform ring, oscilloscope, radial burst on kick, pulsing rings, particle fountain on bass, starfield, tunnel, audio
//   terrain, breathing blob, VU meters, spectrogram strip, beat flash, logo bounce), and one row of controls: what it
//   listens to (the whole song, bass, mids, highs, the kick, the snare, the beat, the voice or the drums once the song is
//   split), sensitivity, smoothing, glow, size and place (the layer's own Scale / Move: the ✥ handles on the picture move
//   it the same way), the colors from the scene's palette, and the picture the logo bounce shows (drop one on the picker).
// - A look is an ordinary layer: its code is a tweak() block + visualizer(P, { preset }) (drawn by the preview page:
//   tools/three-sandbox.html "music visualizers", the math and shaders in tools/three-vis-core.js), so it is saved with
//   the scene, its 📐 templates, 📜 recipes and packs; Save / Shuffle / keyframes / ♪ Move with the music work on its
//   sliders; a render is the preview, frame for frame (the song's own track and hits, no live analyser).
// - Every change made here is one undo step (↶ in the picker, Ctrl/⌘+Z while it is open, /visualizer undo).
const LabVis = (() => {
  const C = VisCore;
  const PRESETS = C.PRESETS;
  const LIST = ['whole', 'bass', 'mids', 'highs', 'kick', 'snare', 'beat', 'vocals', 'drums'];
  const PLACES = { middle: [0, 0], bottom: [0, 28], top: [0, -28], left: [-25, 0], right: [25, 0] };
  const undoStack = []; // [{ label, layer, name, before, after, added, settings, ctx }]
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(v));

  // ---------- the scene on screen (or a chat's scene, through the director's tools) ----------
  async function call(tool, args, ctx = {}) {
    const r = await HubBridge.call(tool, args, { chatId: ctx.chatId || null });
    if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`);
    return r.value;
  }
  async function layers(ctx = {}) {
    const v = !ctx.chatId && ThreeLab.director?.layers ? ThreeLab.director.layers() : await call('three_layers', {}, ctx);
    return Array.isArray(v?.layers) ? v.layers : [];
  }
  async function codeOf(id, ctx = {}) {
    if (!ctx.chatId && ThreeLab.director) return ThreeLab.director.codeOf(id).code;
    const v = await call('three_read_code', { layer: id, from: 1, to: 4000, force: true }, ctx);
    const txt = typeof v === 'string' ? v : String(v.code || '');
    return txt.split('\n').filter((ln) => !/^── /.test(ln)).map((ln) => ln.replace(/^\s*\d+\| /, '')).join('\n');
  }
  const isVis = (code) => LabVisHook.isVis(code);
  const presetOf = (code) => { const m = /\bvisualizer\s*\(\s*P\s*,\s*\{[^}]*\bpreset\s*:\s*'([\w-]+)'/.exec(String(code || '')); return m ? C.preset(m[1]) : null; };
  // the 🎵 layer a change goes to: the one named, else the selected one, else the top one
  async function visLayer(ref, ctx = {}) {
    const rows = await layers(ctx);
    const pool = [];
    for (const L of rows) { try { if (isVis(await codeOf(L.id, ctx))) pool.push(L); } catch { /* gone */ } }
    if (!pool.length) return null;
    if (ref) { const r = String(ref).toLowerCase(); return pool.find((L) => L.id === ref || L.name.toLowerCase() === r) || pool.find((L) => L.name.toLowerCase().includes(r.replace(/^🎵\s*/, ''))) || null; }
    return pool.find((L) => L.selected) || pool[pool.length - 1];
  }
  async function write(L, code, label, ctx = {}) {
    const before = await codeOf(L.id, ctx);
    if (before === code) return { layer: L.name, id: L.id, same: true };
    await call('three_update_layer', { layer: L.id, code, wait: 0.8 }, ctx);
    push({ label, layer: L.id, name: L.name, before, after: code, ctx });
    return { layer: L.name, id: L.id };
  }
  function push(u) { undoStack.push(u); if (undoStack.length > 60) undoStack.shift(); paintUndo(); }
  async function undo() {
    const u = undoStack.pop();
    paintUndo();
    if (!u) return { none: true };
    if (u.added) { await call('three_remove_layer', { layer: u.layer }, u.ctx).catch(() => null); return { undone: u.label, layer: u.name }; }
    if (u.settings) { await call('three_update_layer', { layer: u.layer, settings: u.settings }, u.ctx); return { undone: u.label, layer: u.name }; }
    const now = await codeOf(u.layer, u.ctx).catch(() => null);
    if (now == null) throw new Error(`"${u.name}" isn't in this scene any more`);
    await call('three_update_layer', { layer: u.layer, code: u.before, wait: 0.6 }, u.ctx);
    return { undone: u.label, layer: u.name };
  }

  // ---------- presets → layer code ----------
  // c: the picker's controls { listen, sens, smooth, glow, bars, colors: [c1, c2, c3], image }
  function values(p, c = {}) {
    const d = p.defaults;
    const col = Array.isArray(c.colors) && c.colors.length ? [0, 1, 2].map((i) => c.colors[i % c.colors.length]) : p.colors;
    return { listen: LIST.includes(c.listen) ? c.listen : d.listen, sens: c.sens ?? d.sens, smooth: c.smooth ?? d.smooth, bars: c.bars ?? d.bars, glow: c.glow ?? d.glow, size: c.size ?? 1, c1: col[0], c2: col[1], c3: col[2] };
  }
  function codeFor(p, c = {}) {
    const v = values(p, c);
    const img = p.image && c.image ? `, image: ${q(String(c.image))}` : '';
    return `// 🎵 ${p.name}: ${p.desc.toLowerCase()} (a music visualizer: ＋ Add › 🎵 Music visualizer…, /visualizer)
const P = tweak({
  listen: { value: ${q(v.listen)}, options: [${LIST.map(q).join(', ')}], label: 'Listens to', group: 'Music' },
  sens: { value: ${+v.sens}, min: 0, max: 3, step: 0.05, label: 'Sensitivity', group: 'Music' },
  smooth: { value: ${+v.smooth}, min: 0, max: 1, step: 0.01, label: 'Smoothing', group: 'Music' },
  bars: { value: ${+v.bars}, min: 2, max: 64, step: 1, label: 'Bars', group: 'Look' },
  glow: { value: ${+v.glow}, min: 0, max: 2, step: 0.01, label: 'Glow', group: 'Look' },
  size: { value: ${+v.size}, min: 0.2, max: 3, step: 0.01, label: 'Size', group: 'Look' },
  c1: { value: ${q(v.c1)}, label: 'Color 1', group: 'Colors' },
  c2: { value: ${q(v.c2)}, label: 'Color 2', group: 'Colors' },
  c3: { value: ${q(v.c3)}, label: 'Color 3', group: 'Colors' },
});
visualizer(P, { preset: ${q(p.id)}${img} });
`;
  }
  // one value of the tweak block (or the picture) in a 🎵 layer's code
  function setValue(code, key, v) {
    if (key === 'image') return code.replace(/(\bvisualizer\s*\(\s*P\s*,\s*\{[^}]*?)(,\s*image\s*:\s*'[^']*')?(\s*\}\s*\))/, (m, a, b, z) => `${a}${v ? `, image: ${q(String(v))}` : ''}${z}`);
    const re = new RegExp(`^([ \\t]*${key}\\s*:\\s*\\{\\s*value\\s*:\\s*)('[^']*'|[-\\d.e]+)`, 'm');
    if (!re.test(code)) throw new Error(`This visualizer has no "${key}"`);
    return code.replace(re, (m, a) => `${a}${typeof v === 'number' ? +v.toFixed(4) : q(String(v))}`);
  }

  // add a layer in a look, or turn a 🎵 layer into it (its listening, colors and picture kept unless the controls say)
  async function apply(qq, { layer = null, controls = {}, ctx = {} } = {}) {
    const p = typeof qq === 'object' && qq ? qq : C.preset(qq || 'bars');
    if (!p) throw new Error(`No visualizer "${qq}". /visualizer list shows the ${PRESETS.length}.`);
    const c = { ...controls };
    const L = layer ? await visLayer(layer === true ? null : layer, ctx) : null;
    if (layer && !L) throw new Error('No 🎵 visualizer layer to change in this scene');
    if (L) {
      const old = await codeOf(L.id, ctx);
      const get = (k) => { const m = new RegExp(`^[ \\t]*${k}\\s*:\\s*\\{\\s*value\\s*:\\s*('[^']*'|[-\\d.e]+)`, 'm').exec(old); return m ? (m[1][0] === "'" ? m[1].slice(1, -1) : Number(m[1])) : undefined; };
      for (const k of ['listen', 'sens', 'smooth', 'glow']) if (c[k] == null && get(k) !== undefined) c[k] = get(k);
      if (!c.colors && get('c1')) c.colors = [get('c1'), get('c2'), get('c3')].filter(Boolean);
      if (!c.image) { const m = /image\s*:\s*'([^']*)'/.exec(old); if (m) c.image = m[1]; }
      return { ...(await write(L, codeFor(p, c), `${p.name} on "${L.name}"`, ctx)), preset: p.name };
    }
    if (p.image && !c.image) c.image = pictures()[0]?.key || null;
    const nm = `🎵 ${p.name}`.slice(0, 38);
    const out = await call('three_add_layer', { name: nm, code: codeFor(p, c), wait: 1 }, ctx);
    const row = (await layers(ctx).catch(() => [])).find((x) => x.name === (out.added || nm));
    if (row) {
      push({ label: `${p.name} added`, layer: row.id, name: row.name, added: true, ctx });
      if (c.place || c.scale) await place(row.id, { place: c.place, scale: c.scale }, ctx, false).catch(() => null);
    }
    return { layer: row?.name || nm, id: row?.id || null, preset: p.name, added: true };
  }
  // controls on a 🎵 layer (slider values, the picture): one undo step
  async function setOn(layer, vals, ctx = {}) {
    const L = await visLayer(layer, ctx);
    if (!L) throw new Error('No 🎵 visualizer layer in this scene: ＋ Add › 🎵 Music visualizer… makes one');
    let code = await codeOf(L.id, ctx); const done = [];
    for (const [k, v] of Object.entries(vals)) {
      if (v == null) continue;
      if (k === 'colors') { const a = [].concat(v); for (let i = 0; i < 3; i += 1) code = setValue(code, `c${i + 1}`, a[i % a.length]); done.push('colors'); continue; }
      if (k === 'listen' && !LIST.includes(v)) throw new Error(`Listens to: ${LIST.join(', ')}`);
      code = setValue(code, k, k === 'listen' || k === 'image' || /^c\d$/.test(k) ? v : Number(v)); done.push(`${k} = ${v}`);
    }
    return { ...(await write(L, code, done.join(', '), ctx)), set: done };
  }
  // where it sits and how big: the layer's own Move X / Y and Scale (what the ✥ handles on the picture change)
  async function place(layer, { place: at, scale } = {}, ctx = {}, undoable = true) {
    const L = await visLayer(layer, ctx);
    if (!L) throw new Error('No 🎵 visualizer layer in this scene');
    const settings = {};
    if (at) { const xy = PLACES[at]; if (!xy) throw new Error(`Place: ${Object.keys(PLACES).join(', ')}`); settings.x = xy[0]; settings.y = xy[1]; }
    if (scale != null) settings.scale = Math.max(0.1, Math.min(4, Number(scale) || 1));
    if (!Object.keys(settings).length) return { layer: L.name };
    let before = null;
    try { const r = ThreeLab.director.report().layers.find((x) => x.id === L.id); const tf = r?.transform || {}; before = { x: tf.x || 0, y: tf.y || 0, scale: tf.scale ?? 1 }; } catch { /* a chat's scene */ }
    await call('three_update_layer', { layer: L.id, settings }, ctx);
    if (undoable && before) push({ label: `${at ? `placed ${at}` : ''}${at && scale != null ? ', ' : ''}${scale != null ? `size ${settings.scale}` : ''}`, layer: L.id, name: L.name, settings: before, ctx });
    return { layer: L.name, id: L.id, set: Object.entries(settings).map(([k, v]) => `${k} = ${v}`) };
  }
  function palette() { try { return (ThreeLab.director?.refs?.palette?.() || []).filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 6); } catch { return []; } }
  function pictures() { try { return (ThreeLab.director?.refs?.list?.() || []).filter((r) => r.kind === 'image'); } catch { return []; } }

  // ---------- live previews (the picker's cards): the page's own shaders, drawn here on one WebGL2 canvas ----------
  const GL = { cv: null, gl: null, progs: new Map(), tex: null, img: null, imgKey: null, buf: null, S: new Map(), o: { listen: 'whole', sens: 1, smooth: 0.35, bars: 32 }, rgb: new Float32Array(9) };
  function glInit() {
    if (GL.gl) return GL.gl;
    GL.cv = document.createElement('canvas');
    const gl = GL.cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('No WebGL2 here for the previews');
    GL.gl = gl;
    GL.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    GL.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, GL.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    GL.img = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, GL.img); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return gl;
  }
  function prog(id) {
    let p = GL.progs.get(id);
    if (p) return p;
    const gl = glInit();
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, `#version 300 es\n${src}`); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`visualizer ${id}: ${gl.getShaderInfoLog(s)}`); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, C.VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, C.frag(id)));
    gl.bindAttribLocation(pr, 0, 'position'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(`visualizer ${id}: ${gl.getProgramInfoLog(pr)}`);
    const loc = {}; for (const n of ['uRes', 'uT', 'uDrive', 'uPulse', 'uTravel', 'uGlow', 'uSize', 'uHitK', 'uNB', 'uRows', 'uAmt', 'uImgOn', 'uImgAsp', 'uAges', 'uC1', 'uC2', 'uC3', 'uData', 'uImg']) loc[n] = gl.getUniformLocation(pr, n);
    p = { pr, loc }; GL.progs.set(id, p);
    return p;
  }
  function pictureTex(key) {
    if (!key || key === GL.imgKey) return GL.imgOn || false;
    GL.imgKey = key; GL.imgOn = false;
    const r = pictures().find((x) => x.key === key);
    if (!r) return false;
    const im = new Image();
    im.onload = () => { const gl = glInit(); gl.bindTexture(gl.TEXTURE_2D, GL.img); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); GL.imgOn = true; GL.imgAsp = im.width / Math.max(1, im.height); };
    try { im.src = ThreeLab.director.refs.url(r.path); } catch { /* no picture */ }
    return false;
  }
  // one card at time t (the demo song loops), with the picker's controls
  function drawCard(card, t, c = {}) {
    const gl = glInit(); const p = card.p;
    const W = card.canvas.clientWidth || 168; const H = card.canvas.clientHeight || 72; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(W * dpr); const h = Math.round(H * dpr);
    if (card.canvas.width !== w) { card.canvas.width = w; card.canvas.height = h; }
    if (GL.cv.width !== w || GL.cv.height !== h) { GL.cv.width = w; GL.cv.height = h; }
    let S = GL.S.get(p.id); if (!S) { S = C.state(p.id); GL.S.set(p.id, S); }
    const v = values(p, c); const o = GL.o; o.listen = v.listen; o.sens = v.sens; o.smooth = v.smooth; o.bars = v.bars;
    C.frame(S, C.demoTrack(), t, C.DEMO_HITS[C.hitBand(v.listen)], null, o);
    const { pr, loc } = prog(p.id);
    gl.viewport(0, 0, w, h); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, GL.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, C.TW, S.rows, 0, gl.RED, gl.UNSIGNED_BYTE, S.data);
    gl.uniform1i(loc.uData, 0);
    const img = p.image ? pictureTex(c.image) : false;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, GL.img); gl.uniform1i(loc.uImg, 1);
    const u = S.u;
    gl.uniform2f(loc.uRes, w, h); gl.uniform1f(loc.uT, t); gl.uniform1f(loc.uDrive, u.drive); gl.uniform1f(loc.uPulse, u.pulse); gl.uniform1f(loc.uTravel, u.travel);
    gl.uniform1f(loc.uGlow, v.glow); gl.uniform1f(loc.uSize, 1); gl.uniform1f(loc.uHitK, u.hitK); gl.uniform1f(loc.uNB, u.nb); gl.uniform1f(loc.uRows, S.rows); gl.uniform1f(loc.uAmt, u.amt);
    gl.uniform1f(loc.uImgOn, img ? 1 : 0); gl.uniform1f(loc.uImgAsp, GL.imgAsp || 1); gl.uniform1fv(loc.uAges, u.ages);
    const rgb = GL.rgb; C.hex3(v.c1, rgb, 0); C.hex3(v.c2, rgb, 3); C.hex3(v.c3, rgb, 6);
    gl.uniform3f(loc.uC1, rgb[0], rgb[1], rgb[2]); gl.uniform3f(loc.uC2, rgb[3], rgb[4], rgb[5]); gl.uniform3f(loc.uC3, rgb[6], rgb[7], rgb[8]);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    card.g.clearRect(0, 0, w, h); card.g.drawImage(GL.cv, 0, 0);
  }

  // ---------- the picker ----------
  let open0 = null;
  const btnUndo = { el: null };
  function paintUndo() { const b = btnUndo.el; if (!b) return; const n = undoStack.length; b.disabled = !n; const tip = n ? `Undo: ${undoStack[n - 1].label}` : 'Nothing to undo'; if (b.title !== tip) b.title = tip; }
  function lastControls() { try { return JSON.parse(store.get('three.vis.controls', '{}')) || {}; } catch { return {}; } }
  function saveControls(c) { try { const { image, place: pl, scale, ...rest } = c; store.set('three.vis.controls', JSON.stringify(rest)); } catch { /* a convenience */ } }
  const NAMES = { whole: 'Whole song', bass: 'Bass', mids: 'Mids', highs: 'Highs', kick: 'Kick', snare: 'Snare', beat: 'Beat', vocals: 'Voice', drums: 'Drums' };

  async function open({ layer = null } = {}) {
    if (open0) open0.close();
    await ThreeLab.cmd();
    let L = null;
    if (layer) L = await visLayer(layer).catch(() => null);
    else { const sel = (await layers().catch(() => [])).find((x) => x.selected); if (sel && isVis(await codeOf(sel.id).catch(() => ''))) L = sel; }
    const cur = L ? presetOf(await codeOf(L.id).catch(() => '')) : null;
    const C0 = lastControls(); C0.image ||= pictures()[0]?.key || null;
    const song = Boolean(ThreeLab.peek?.()?.player?.loaded);
    const shade = el('div', { class: 'vz-shade', on: { pointerdown: (e) => { if (e.target === shade) close(); } } });
    const box = el('div', { class: 'vz-dlg', attrs: { role: 'dialog', 'aria-label': 'Music visualizer' } });
    shade.append(box);
    const close = () => { cancelAnimationFrame(raf); io?.disconnect(); shade.remove(); btnUndo.el = null; open0 = null; removeEventListener('keydown', onKey, true); };
    const search = el('input', { type: 'search', class: 'vz-search', placeholder: `Search ${PRESETS.length} looks (bars, wave, kick, stars, logo…)`, attrs: { 'aria-label': 'Search the looks' } });
    const grid = el('div', { class: 'vz-grid', attrs: { role: 'listbox', 'aria-label': 'Looks' } });
    const undoB = el('button', { type: 'button', class: 'ghost small', text: '↶', attrs: { 'aria-label': 'Undo the last change' }, on: { click: () => undo().then((r) => r.undone && toast(`↶ ${r.undone}`, { timeout: 1600 })).catch((e) => toast(e.message, { type: 'error' })) } });
    btnUndo.el = undoB; paintUndo();
    const where = el('span', { class: 'vz-where', text: L ? `changes “${L.name}”` : 'adds a layer' });
    box.append(el('div', { class: 'vz-head' }, el('b', { text: '🎵 Music visualizer' }), where, undoB, el('button', { type: 'button', class: 'ghost small', text: '✕', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } })), search, grid);

    // ---- the controls: what it listens to, then the look ----
    let target = L;
    const music = el('div', { class: 'vz-row', attrs: { role: 'group', 'aria-label': 'What it listens to' } });
    const look = el('div', { class: 'vz-row', attrs: { role: 'group', 'aria-label': 'The look' } });
    const chip = (label, on, fn, tip) => el('button', { type: 'button', class: `vz-chip${on ? ' on' : ''}`, text: label, title: tip, attrs: { 'aria-pressed': String(Boolean(on)) }, on: { click: fn } });
    const range = (label, key, min, max, step, val, tip, fn) => {
      const out = el('span', { class: 'vz-val', text: String(val) });
      const r = el('input', { type: 'range', min, max, step, value: val, title: tip, attrs: { 'aria-label': label } });
      r.addEventListener('input', () => { C0[key] = Number(r.value); out.textContent = r.value; });
      r.addEventListener('change', () => { C0[key] = Number(r.value); (fn || changed)({ [key]: Number(r.value) }); });
      return el('label', { class: 'vz-range' }, el('span', { text: label }), r, out);
    };
    // a control moved: the previews follow; on a layer being changed, the layer follows too (one undo step)
    function changed(part) {
      saveControls(C0); paint();
      if (!target) return;
      setOn(target.id, part).then((r) => r.same || toast(`🎵 ${r.set.join(' · ')}`, { timeout: 1200 })).catch((e) => toast(e.message, { type: 'error' }));
    }
    function placed(part) {
      if (part.place) C0.place = part.place; if (part.scale != null) C0.scale = part.scale;
      paint();
      if (!target) return;
      place(target.id, part).then((r) => toast(`🎵 ${(r.set || []).join(' · ')}`, { timeout: 1200 })).catch((e) => toast(e.message, { type: 'error' }));
    }
    function paint() {
      const ls = LIST.filter((k) => song || !['vocals', 'drums'].includes(k));
      music.replaceChildren(el('span', { class: 'vz-lab', text: 'Listens to' }),
        ...ls.map((k) => chip(NAMES[k], C0.listen === k, () => { C0.listen = C0.listen === k ? null : k; changed({ listen: C0.listen || 'whole' }); }, k === 'vocals' || k === 'drums' ? 'A part of the song (split on this computer the first time)' : '')),
        range('Sensitivity', 'sens', 0, 3, 0.05, C0.sens ?? 1, 'How strongly it reacts'),
        range('Smoothing', 'smooth', 0, 1, 0.01, C0.smooth ?? 0.35, 'Snappy (0) or smooth and slow to fall (1)'));
      const pal = [...new Set([...palette()])];
      look.replaceChildren(
        range('Glow', 'glow', 0, 2, 0.05, C0.glow ?? 0.6, 'How much it glows'),
        range('Size', 'scale', 0.25, 2, 0.05, C0.scale ?? 1, 'The layer\'s size (the ✥ corner handles on the picture do the same)', (x) => placed(x)),
        el('span', { class: 'vz-lab', text: 'Place' }),
        ...Object.keys(PLACES).map((k) => chip(k[0].toUpperCase() + k.slice(1), C0.place === k, () => placed({ place: k }), 'Where it sits (drag it on the picture to fine-tune)')),
        el('span', { class: 'vz-lab', text: 'Colors' }),
        chip('Its own', !C0.colors, () => { C0.colors = null; saveControls(C0); paint(); if (target) codeOf(target.id).then((code) => setOn(target.id, { colors: (presetOf(code) || PRESETS[0]).colors })).catch((e) => toast(e.message, { type: 'error' })); }, 'The look\'s own colors'),
        ...(pal.length ? pal.map((hex, i) => { const b = el('button', { type: 'button', class: `vz-sw${C0.colors?.[0] === hex ? ' on' : ''}`, title: `${hex} (from the scene's palette)`, attrs: { 'aria-label': `Colors from ${hex}` }, on: { click: () => { const cols = [hex, pal[(i + 1) % pal.length], pal[(i + 2) % pal.length]]; C0.colors = cols; changed({ colors: cols }); } } }); b.style.background = hex; return b; }) : [el('span', { class: 'vz-lab', text: 'no palette yet', title: 'Palette follows the cover, or the scene\'s palette' })]),
        el('span', { class: 'vz-lab', text: 'Picture' }),
        el('select', { class: 'vz-sel', title: 'The picture the logo bounce shows (or drop one on this window)', attrs: { 'aria-label': 'Picture' }, on: { change: (e) => { C0.image = e.target.value || null; paint(); if (target) setOn(target.id, { image: C0.image || '' }).catch((err) => toast(err.message, { type: 'error' })); } } },
          el('option', { value: '', text: pictures().length ? 'none' : 'drop a picture here', selected: !C0.image }), ...pictures().map((r) => el('option', { value: r.key, text: r.key, selected: C0.image === r.key }))));
    }
    paint();
    box.append(music, look, el('div', { class: 'vz-foot' }, el('span', { class: 'hint', text: `${song ? 'On your song' : 'Previews on a demo beat'} · click a look (or Enter) · drop a picture for the logo · Ctrl/⌘+Z undoes · Esc closes` })));

    // ---- a picture dropped on the picker: a reference of the scene, used by the logo bounce ----
    shade.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drop'); });
    shade.addEventListener('dragleave', () => box.classList.remove('drop'));
    shade.addEventListener('drop', async (e) => {
      e.preventDefault(); box.classList.remove('drop');
      const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type));
      if (!f) return;
      try {
        const r = await ThreeLab.addReference(window.hub.pathForFile(f));
        C0.image = r.key; paint();
        toast(`🖼 “${r.key}” added to the scene's references`, { timeout: 1800 });
        if (target && presetOf(await codeOf(target.id).catch(() => ''))?.image) await setOn(target.id, { image: r.key });
        else go(C.preset('logo'));
      } catch (err) { toast(err.message, { type: 'error' }); }
    });

    // ---- the cards ----
    let rows = []; let at = 0; const cards = [];
    const ctl = () => ({ ...C0 });
    const go = (p) => {
      apply(p, { layer: target ? target.id : null, controls: ctl() }).then((r) => {
        toast(`🎵 ${r.preset} · “${r.layer}”`, { timeout: 1600 });
        if (!target && r.id) { target = { id: r.id, name: r.layer }; where.textContent = `changes “${r.layer}”`; }
        cardsOn(p.id);
      }).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    };
    const cardsOn = (id) => { for (const c of cards) c.btn.classList.toggle('cur', c.p.id === id); };
    for (const p of PRESETS) {
      const canvas = el('canvas', { class: 'vz-cv', attrs: { 'aria-hidden': 'true' } });
      const btn = el('button', { type: 'button', class: 'vz-card', title: p.desc, attrs: { role: 'option', 'aria-label': `${p.name}: ${p.desc}` }, on: { click: () => go(p) } },
        canvas, el('b', { text: p.name }), el('span', { class: 'vz-sync', text: `♪ ${NAMES[p.defaults.listen]}` }));
      btn.dataset.id = p.id;
      cards.push({ p, btn, canvas, g: canvas.getContext('2d'), vis: true });
    }
    const draw = () => {
      const w = search.value.toLowerCase().trim();
      rows = cards.filter((c) => !w || `${c.p.id} ${c.p.name} ${c.p.desc} ${c.p.tags}`.toLowerCase().includes(w));
      at = Math.min(at, Math.max(0, rows.length - 1));
      grid.replaceChildren(...rows.map((c, i) => { c.btn.classList.toggle('on', i === at); return c.btn; }));
    };
    search.addEventListener('input', () => { at = 0; draw(); });
    const onKey = (e) => {
      if (!shade.isConnected) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); e.stopPropagation(); undoB.click(); return; }
      if (e.target === search || grid.contains(e.target)) {
        const cols = Math.max(1, Math.round(grid.clientWidth / 180));
        const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
        if (mv) { e.preventDefault(); at = Math.max(0, Math.min(rows.length - 1, at + mv)); draw(); rows[at]?.btn.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter' && rows[at] && e.target === search) { e.preventDefault(); go(rows[at].p); }
      }
    };
    addEventListener('keydown', onKey, true);
    draw();
    if (cur) cardsOn(cur.id);
    document.body.append(shade);
    // previews only for the cards in view; the loop stops when the picker closes or the window hides
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { for (const x of es) { const c = cards.find((k) => k.btn === x.target); if (c) c.vis = x.isIntersecting; } }, { root: grid }) : null;
    if (io) for (const c of cards) io.observe(c.btn);
    // (gpuload84) the cards draw 30 times a second, not on every frame of the screen (240 on a fast one: a grid of
    // canvases redrawn that often loaded the graphics card enough to crackle other apps' sound)
    let raf = 0; const t0 = performance.now(); let next = 0;
    const loop = (now) => {
      if (!shade.isConnected) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (now < next - 1) return;
      next = now - next > 1000 / 30 ? now + 1000 / 30 : next + 1000 / 30;
      const t = (performance.now() - t0) / 1000; const c = ctl();
      for (const k of rows) if (k.vis) { try { drawCard(k, t, c); } catch (err) { console.warn('visualizer preview', err); k.vis = false; } }
    };
    raf = requestAnimationFrame(loop);
    search.focus();
    open0 = { close, el: shade, get target() { return target; } };
    return open0;
  }

  // ---------- chat command (the app's internal API; the directors reach it through three_do run), Ctrl/⌘+K ----------
  const said = (r) => `🎵 ${r.preset ? `${r.preset} · ` : ''}“${r.layer}”${r.set ? `: ${r.set.join(' · ')}` : ''}`;
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('visualizer')) return;
    Commands.register({
      name: 'visualizer', area: 'Three.js Lab', aliases: ['music-visualizer', 'visualiser'],
      args: '[<look> | listen <whole|bass|mids|highs|kick|snare|beat|vocals|drums> | sens <0-3> | smooth <0-1> | glow <0-2> | bars <n> | place <middle|bottom|top|left|right> | size <x> | picture <reference> | undo | list]',
      desc: '🎵 Music visualizer layers in one click: 17 looks (spectrum bars, circular spectrum, waveform, oscilloscope, rings and bursts on the kick, starfield, tunnel, terrain, blob, VU meters, spectrogram, beat flash, logo bounce) that render exactly like the preview, 0 tokens',
      examples: ['/visualizer', '/visualizer bars', '/visualizer rings', '/visualizer listen bass', '/visualizer place bottom', '/visualizer picture cover', '/visualizer undo'],
      keywords: 'music visualizer visualiser spectrum equalizer eq bars waveform oscilloscope vu meter spectrogram starfield tunnel rings burst logo bounce beat flash audio reactive',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^listen\b/.test(w)) return LIST.map((x) => ({ value: `listen ${x}`, hint: NAMES[x] })).filter((x) => x.value.startsWith(w));
        if (/^place\b/.test(w)) return Object.keys(PLACES).map((x) => ({ value: `place ${x}` })).filter((x) => x.value.startsWith(w));
        const verbs = [{ value: 'listen ', hint: 'what it listens to' }, { value: 'sens ', hint: '0–3' }, { value: 'smooth ', hint: '0–1' }, { value: 'glow ', hint: '0–2' }, { value: 'bars ', hint: '2–64' }, { value: 'place ', hint: 'middle, bottom, top, left, right' }, { value: 'size ', hint: 'the layer\'s scale' }, { value: 'picture ', hint: 'a picture reference (logo bounce)' }, { value: 'undo' }, { value: 'list' }];
        return [...PRESETS.map((p) => ({ value: `${p.id} `, hint: p.name })), ...verbs].filter((x) => !w || x.value.startsWith(w)).slice(0, 40);
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const v = (verb || '').toLowerCase(); const a0 = rest.join(' ');
        if (!v) { await open(); return null; }
        await ThreeLab.cmd();
        if (v === 'list') return PRESETS.map((p) => `- \`${p.id}\` ${p.name} (♪ ${NAMES[p.defaults.listen]}): ${p.desc}`).join('\n');
        if (v === 'undo') { const r = await undo(); return r.none ? 'Nothing to undo' : `↶ ${r.undone}`; }
        if (v === 'listen') return said(await setOn(null, { listen: a0.toLowerCase() }));
        if (['sens', 'smooth', 'glow', 'bars'].includes(v)) return said(await setOn(null, { [v]: Number(a0) }));
        if (v === 'picture' || v === 'image') return said(await setOn(null, { image: a0 }));
        if (v === 'place') return said(await place(null, { place: a0.toLowerCase() }));
        if (v === 'size') return said(await place(null, { scale: Number(a0) }));
        const p = C.preset(w) || C.preset(v);
        if (!p) return `No look "${w}". Try: ${PRESETS.map((x) => x.id).join(', ')}`;
        return said(await apply(p, { controls: lastControls() }));
      },
    });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: 🎵 Music visualizer (spectrum bars, waveform, oscilloscope, VU meter, starfield, logo bounce)…', () => open().catch((e) => toast(e.message, { type: 'error' })));

  return { open, apply, setOn, place, undo, codeFor, presetOf, setValue, drawCard, PRESETS, LIST, get undoDepth() { return undoStack.length; }, get picker() { return open0; } };
})();
window.LabVis = LabVis;
