// ◆ Shapes that draw themselves (round 51, labshapes): After Effects shape layers, simpler. The hub side.
// - One picker (＋ Add › ◆ Shape…, a ◆ layer's right-click, Lab search, Find anything, /shape): 21 shapes as live
//   previews (rectangle, rounded rectangle, circle, ring, triangle, hexagon, star, line, arrow, underline swoosh, bracket
//   frame, square brackets, cross, plus, checkmark, wave line, zigzag, spiral, heart, burst, and ✎ draw your own: click
//   points on a pad, Shift for straight lines), and one row of controls: how it draws on (on, off, on then off, loop,
//   on each beat / bar / kick / snare, or the Start / End sliders for keyframes), how long, the easing, reverse; the
//   line's width, dashes, roundness, filled or not, and colors from the scene's palette.
// - A shape is an ordinary layer: its code is a tweak() block + shapeLayer(P, { preset }) (drawn by the preview page:
//   tools/three-sandbox.html "shape layers", the math in tools/three-shape-core.js), so it is saved with the scene, its
//   📐 templates, 📜 recipes and packs; Save / Shuffle / keyframes (labkeys) / ♪ Move with the music work on its sliders;
//   the ✥ handles on the picture move, scale and turn it; a render is the preview, frame for frame.
// - Every change made here is one undo step (↶ in the picker, Ctrl/⌘+Z while it is open, /shape undo).
const LabShapes = (() => {
  const C = ShapeCore;
  const PRESETS = C.PRESETS;
  const PLACES = { middle: [0, 0], bottom: [0, 30], top: [0, -30], left: [-28, 0], right: [28, 0] };
  const undoStack = []; // [{ label, layer, name, before, added, settings, ctx }]
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(v));
  const r4 = (x) => Math.round(x * 10000) / 10000;

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
  const isShape = (code) => LabShapesHook.isShape(code);
  const presetOf = (code) => { const m = /\bshapeLayer\s*\(\s*P\s*,\s*\{\s*preset\s*:\s*'([\w-]+)'/.exec(String(code || '')); return m ? PRESETS.find((p) => p.id === m[1]) || null : null; };
  // the ◆ layer a change goes to: the one named, else the selected one, else the top one
  async function shapeLayer(ref, ctx = {}) {
    const rows = await layers(ctx);
    const pool = [];
    for (const L of rows) { try { if (isShape(await codeOf(L.id, ctx))) pool.push(L); } catch { /* gone */ } }
    if (!pool.length) return null;
    if (ref) { const r = String(ref).toLowerCase(); return pool.find((L) => L.id === ref || L.name.toLowerCase() === r) || pool.find((L) => L.name.toLowerCase().includes(r.replace(/^◆\s*/, ''))) || null; }
    return pool.find((L) => L.selected) || pool[pool.length - 1];
  }
  async function write(L, code, label, ctx = {}) {
    const before = await codeOf(L.id, ctx);
    if (before === code) return { layer: L.name, id: L.id, same: true };
    await call('three_update_layer', { layer: L.id, code, wait: 0.8 }, ctx);
    push({ label, layer: L.id, name: L.name, before, ctx });
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
  // c: the picker's controls { drawOn, dur, ease, reverse, width, dash, round, filled, stroke, fill, delay }
  function values(p, c = {}) {
    const v = { ...p.v };
    for (const k of ['drawOn', 'dur', 'ease', 'reverse', 'width', 'dash', 'gap', 'round', 'stroke', 'fill', 'delay', 'taper', 'w', 'h', 'sides', 'inner', 'amp', 'turns', 'fillA', 'march']) if (c[k] != null) v[k] = c[k];
    if (c.filled != null) v.fillA = c.filled ? (p.v.fillA > 0 ? p.v.fillA : 1) : 0;
    if (!C.MODES.includes(v.drawOn)) v.drawOn = p.v.drawOn;
    return v;
  }
  const RANGE = { fillA: [0, 1, 0.01, 'Fill opacity', 'Look'], width: [0, 120, 0.5, 'Line width (px)', 'Look'], dash: [0, 120, 1, 'Dashes (px, 0 = solid)', 'Look'], gap: [1, 120, 1, 'Gaps (px)', 'Look'], march: [-400, 400, 1, 'Dashes move (px/s)', 'Look'], taper: [0, 1, 0.01, 'Thin ends', 'Look'],
    dur: [0.05, 10, 0.05, 'Takes (s)', 'Draws on'], delay: [0, 600, 0.01, 'Starts at (s)', 'Draws on'], hold: [0, 10, 0.05, 'Holds (s)', 'Draws on'], offset: [0, 1, 0.01, 'Start point', 'Draws on'], trimStart: [0, 1, 0.001, 'Start (0–1)', 'Draws on'], trimEnd: [0, 1, 0.001, 'End (0–1)', 'Draws on'] };
  function codeFor(p, c = {}, custom = null) {
    const v = values(p, c);
    const line = (k, min, max, step, label, group) => `  ${k}: { value: ${+(+v[k]).toFixed(4)}, min: ${min}, max: ${max}, step: ${step}, label: '${label}', group: '${group}' },`;
    const shapeKeys = p.keys.map((k) => { const [min, max, step, label] = C.SHAPE_KEYS[k]; return line(k, min, max, step, label, 'Shape'); });
    const opts = custom ? `, points: ${JSON.stringify((custom.points || []).map((x) => [r4(x[0]), r4(x[1]), ...(x[2] ? [1] : [])]))}${custom.closed ? ', closed: true' : ''}` : '';
    return `// ◆ ${p.name}: ${p.desc.toLowerCase()} (a shape that draws itself: ＋ Add › ◆ Shape…, /shape)
const P = tweak({
${shapeKeys.join('\n')}
  fill: { value: ${q(v.fill)}, label: 'Fill', group: 'Look' },
${line('fillA', ...RANGE.fillA)}
  stroke: { value: ${q(v.stroke)}, label: 'Line', group: 'Look' },
${['width', 'dash', 'gap', 'march', 'taper'].map((k) => line(k, ...RANGE[k])).join('\n')}
  drawOn: { value: ${q(v.drawOn)}, options: [${C.MODES.map(q).join(', ')}], label: 'Draws', group: 'Draws on' },
${['dur', 'delay', 'hold'].map((k) => line(k, ...RANGE[k])).join('\n')}
  ease: { value: ${q(v.ease)}, options: [${C.EASES.map(q).join(', ')}], label: 'Easing', group: 'Draws on' },
  reverse: { value: ${Boolean(v.reverse)}, label: 'From the other end', group: 'Draws on' },
  fillIn: { value: ${v.fillIn !== false}, label: 'Fill comes in with the line', group: 'Draws on' },
${['offset', 'trimStart', 'trimEnd'].map((k) => line(k, ...RANGE[k])).join('\n')}
});
shapeLayer(P, { preset: ${q(p.id)}${opts} });
`;
  }
  // one value of the tweak block in a ◆ layer's code
  function setValue(code, key, v) {
    const re = new RegExp(`^([ \\t]*${key}\\s*:\\s*\\{\\s*value\\s*:\\s*)('[^']*'|true|false|[-\\d.e]+)`, 'm');
    if (!re.test(code)) throw new Error(`This shape has no "${key}"`);
    return code.replace(re, (m, a) => `${a}${typeof v === 'number' ? +v.toFixed(4) : typeof v === 'boolean' ? v : q(String(v))}`);
  }
  const getValue = (code, k) => { const m = new RegExp(`^[ \\t]*${k}\\s*:\\s*\\{\\s*value\\s*:\\s*('[^']*'|true|false|[-\\d.e]+)`, 'm').exec(code); if (!m) return undefined; const s = m[1]; return s[0] === "'" ? s.slice(1, -1) : s === 'true' ? true : s === 'false' ? false : Number(s); };
  const KEEP = ['fill', 'fillA', 'stroke', 'width', 'dash', 'gap', 'march', 'drawOn', 'dur', 'delay', 'hold', 'ease', 'reverse'];
  const timeMode = (m) => ['in', 'out', 'inout'].includes(m);
  const playhead = () => { try { const pl = ThreeLab.peek?.()?.player; return pl?.loaded ? Math.max(0, Math.round((pl.time ?? pl.currentTime ?? 0) * 100) / 100) : 0; } catch { return 0; } };

  // add a layer with a shape, or turn a ◆ layer into another (its look and drawing kept unless the controls say)
  async function apply(qq, { layer = null, controls = {}, custom = null, ctx = {} } = {}) {
    const p = typeof qq === 'object' && qq ? qq : C.preset(qq || 'rect');
    if (!p) throw new Error(`No shape "${qq}". /shape list shows the ${PRESETS.length}.`);
    if (p.id === 'custom' && !custom?.points?.length) throw new Error('Draw your own: open ＋ Add › ◆ Shape… › ✎ Draw your own and click points');
    const c = { ...controls };
    const L = layer ? await shapeLayer(layer === true ? null : layer, ctx) : null;
    if (layer && !L) throw new Error('No ◆ shape layer to change in this scene');
    if (L) {
      const old = await codeOf(L.id, ctx);
      for (const k of KEEP) if (c[k] == null && getValue(old, k) !== undefined) c[k] = getValue(old, k);
      return { ...(await write(L, codeFor(p, c, custom), `${p.name} on "${L.name}"`, ctx)), preset: p.name };
    }
    // with a song, a shape that draws on once starts where you are (the playhead), not at the song's start
    if (c.delay == null && !ctx.chatId && timeMode(values(p, c).drawOn)) c.delay = playhead();
    const nm = `◆ ${p.name}`.slice(0, 38);
    const out = await call('three_add_layer', { name: nm, code: codeFor(p, c, custom), wait: 1 }, ctx);
    const row = (await layers(ctx).catch(() => [])).find((x) => x.name === (out.added || nm));
    if (row) {
      push({ label: `${p.name} added`, layer: row.id, name: row.name, added: true, ctx });
      if (c.place || c.scale) await place(row.id, { place: c.place, scale: c.scale }, ctx, false).catch(() => null);
    }
    return { layer: row?.name || nm, id: row?.id || null, preset: p.name, added: true };
  }
  // controls on a ◆ layer (slider values): one undo step
  async function setOn(layer, vals, ctx = {}) {
    const L = await shapeLayer(layer, ctx);
    if (!L) throw new Error('No ◆ shape layer in this scene: ＋ Add › ◆ Shape… makes one');
    let code = await codeOf(L.id, ctx); const done = [];
    for (const [k, v0] of Object.entries(vals)) {
      if (v0 == null) continue;
      let k2 = k; let v = v0;
      if (k === 'filled') { k2 = 'fillA'; v = v0 ? Math.max(0.01, Number(getValue(code, 'fillA')) || 1) : 0; if (v0 && v < 0.05) v = 1; }
      if (k2 === 'drawOn' && !C.MODES.includes(v)) throw new Error(`Draws: ${C.MODES.join(', ')}`);
      if (k2 === 'ease' && !C.EASES.includes(v)) throw new Error(`Easing: ${C.EASES.join(', ')}`);
      const cur = getValue(code, k2);
      if (cur === undefined) { if (C.SHAPE_KEYS[k2]) continue; throw new Error(`This shape has no "${k2}"`); }
      code = setValue(code, k2, typeof cur === 'boolean' ? (v === true || v === 'true' || v === 'on') : typeof cur === 'number' ? Number(v) : v);
      done.push(`${k2} = ${v}`);
    }
    return { ...(await write(L, code, done.join(', ') || 'no change', ctx)), set: done };
  }
  // where it sits and how big: the layer's own Move X / Y and Scale (what the ✥ handles on the picture change)
  async function place(layer, { place: at, scale } = {}, ctx = {}, undoable = true) {
    const L = await shapeLayer(layer, ctx);
    if (!L) throw new Error('No ◆ shape layer in this scene');
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

  // ---------- live previews (the picker's cards): the same path and trim, drawn on a 2D canvas ----------
  const tr0 = {}; const dash0 = [0, 0, 0];
  function drawPath(g, P, v, t, hit, fit, cx, cy) {
    C.trim(v, t, hit, tr0);
    const L = P.L; const X = (x) => cx + x * fit; const Y = (y) => cy - y * fit;
    const fa = Math.max(0, Math.min(1, Number(v.fillA) || 0)) * tr0.fillK;
    if (fa > 0.002) {
      g.globalAlpha = fa; g.fillStyle = v.fill; g.beginPath();
      for (const [i0, n, closed] of P.subs) { if (!closed) continue; g.moveTo(X(P.x[i0]), Y(P.y[i0])); for (let i = i0 + 1; i < i0 + n; i += 1) g.lineTo(X(P.x[i]), Y(P.y[i])); g.closePath(); }
      g.fill(); g.globalAlpha = 1;
    }
    const lw = (Math.max(0, Number(v.width) || 0) / 1080) * 2 * fit;
    if (!(lw > 0) || !(tr0.vis > 0)) return tr0;
    C.dashOf(v, t, dash0);
    g.strokeStyle = v.stroke; g.lineCap = 'round'; g.lineJoin = 'round';
    const taper = Number(v.taper) > 0;
    C.runs(P, [tr0.a0 * L, tr0.b0 * L, tr0.a1 * L, tr0.b1 * L], dash0, (xs, ys) => {
      if (!taper) { g.lineWidth = Math.max(1, lw); g.beginPath(); g.moveTo(X(xs[0]), Y(ys[0])); for (let i = 1; i < xs.length; i += 1) g.lineTo(X(xs[i]), Y(ys[i])); g.stroke(); return; }
      for (let i = 1; i < xs.length; i += 1) { const u = (i - 0.5) / Math.max(1, xs.length - 1); g.lineWidth = Math.max(1, lw * Math.max(0.04, 1 - Number(v.taper) * (2 * u - 1) ** 2)); g.beginPath(); g.moveTo(X(xs[i - 1]), Y(ys[i - 1])); g.lineTo(X(xs[i]), Y(ys[i])); g.stroke(); }
    });
    return tr0;
  }
  // a card at time t: its preset with the picker's controls, drawing on and off in a loop (or on the demo beat)
  function drawCard(card, t, c = {}) {
    const p = card.p; const cv = card.canvas;
    const W = cv.clientWidth || 168; const H = cv.clientHeight || 72; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(W * dpr); const h = Math.round(H * dpr);
    if (cv.width !== w) { cv.width = w; cv.height = h; }
    const v = values(p, c);
    if (timeMode(v.drawOn)) { v.drawOn = 'loop'; v.hold = 0.6; }
    v.delay = 0;
    const key = `${p.id}|${C.SHAPE_KEYS ? Object.keys(C.SHAPE_KEYS).map((k) => v[k]).join(',') : ''}|${v.taper}|${card.custom ? card.custom.points.length : 0}`;
    if (card.key !== key) {
      card.key = key; card.P = C.build(p.id, v, card.custom || (p.id === 'custom' ? DEMO_DRAW : null), card.P || C.newPath());
      let mx = 0.05; for (let i = 0; i < card.P.n; i += 1) mx = Math.max(mx, Math.abs(card.P.x[i]) / (w / h), Math.abs(card.P.y[i]));
      card.fit = (h / 2) * 0.82 / mx;
    }
    const g = card.g; g.clearRect(0, 0, w, h);
    return drawPath(g, card.P, v, t, C.DEMO_HITS[C.HIT_MODES[v.drawOn]] || null, card.fit, w / 2, h / 2);
  }
  const DEMO_DRAW = { points: [[-0.9, -0.2], [-0.5, 0.45], [0, -0.1, 1], [0.45, 0.5], [0.9, 0]], closed: false };

  // ---------- the picker ----------
  let open0 = null;
  const btnUndo = { el: null };
  function paintUndo() { const b = btnUndo.el; if (!b) return; const n = undoStack.length; b.disabled = !n; const tip = n ? `Undo: ${undoStack[n - 1].label}` : 'Nothing to undo'; if (b.title !== tip) b.title = tip; }
  function lastControls() { try { const o = JSON.parse(store.get('three.shapes.controls', '{}')) || {}; return { drawOn: o.drawOn, ease: o.ease }; } catch { return {}; } }
  function saveControls(c) { try { store.set('three.shapes.controls', JSON.stringify({ drawOn: c.drawOn, ease: c.ease })); } catch { /* a convenience */ } }
  const MODE_CHIPS = [['in', 'Draws on'], ['out', 'Draws off'], ['inout', 'On, then off'], ['loop', 'Loop'], ['beat', 'Each beat'], ['bar', 'Each bar'], ['kick', 'Each kick'], ['snare', 'Each snare'], ['off', 'Still']];

  async function open({ layer = null, draw: own = false } = {}) {
    if (open0) open0.close();
    await ThreeLab.cmd();
    let L = null;
    if (own) L = null; // (✎ Draw your own, asked for by itself: a new layer)
    else if (layer) L = await shapeLayer(layer).catch(() => null);
    else { const sel = (await layers().catch(() => [])).find((x) => x.selected); if (sel && isShape(await codeOf(sel.id).catch(() => ''))) L = sel; }
    const cur = L ? presetOf(await codeOf(L.id).catch(() => '')) : null;
    const C0 = lastControls();
    const shade = el('div', { class: 'shp-shade', on: { pointerdown: (e) => { if (e.target === shade) close(); } } });
    const box = el('div', { class: 'shp-dlg', attrs: { role: 'dialog', 'aria-label': 'Shape' } });
    shade.append(box);
    const close = () => { cancelAnimationFrame(raf); io?.disconnect(); shade.remove(); btnUndo.el = null; open0 = null; removeEventListener('keydown', onKey, true); };
    const search = el('input', { type: 'search', class: 'shp-search', placeholder: `Search ${PRESETS.length} shapes (circle, arrow, underline, star…)`, attrs: { 'aria-label': 'Search the shapes' } });
    const grid = el('div', { class: 'shp-grid', attrs: { role: 'listbox', 'aria-label': 'Shapes' } });
    const undoB = el('button', { type: 'button', class: 'ghost small', text: '↶', attrs: { 'aria-label': 'Undo the last change' }, on: { click: () => undo().then((r) => r.undone && toast(`↶ ${r.undone}`, { timeout: 1600 })).catch((e) => toast(e.message, { type: 'error' })) } });
    btnUndo.el = undoB; paintUndo();
    const where = el('span', { class: 'shp-where', text: L ? `changes “${L.name}”` : 'adds a layer' });
    const pad = el('div', { class: 'shp-pad', hidden: true });
    box.append(el('div', { class: 'shp-head' }, el('b', { text: '◆ Shape' }), where, undoB, el('button', { type: 'button', class: 'ghost small', text: '✕', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } })), search, grid, pad);

    // ---- the controls: how it draws on, then the look ----
    let target = L;
    const drawRow = el('div', { class: 'shp-row', attrs: { role: 'group', 'aria-label': 'How it draws' } });
    const lookRow = el('div', { class: 'shp-row', attrs: { role: 'group', 'aria-label': 'The look' } });
    const chip = (label, on, fn, tip) => el('button', { type: 'button', class: `shp-chip${on ? ' on' : ''}`, text: label, title: tip || '', attrs: { 'aria-pressed': String(Boolean(on)) }, on: { click: fn } });
    const range = (label, key, min, max, step, val, tip) => {
      const out = el('span', { class: 'shp-val', text: String(val) });
      const r = el('input', { type: 'range', min, max, step, value: val, title: tip, attrs: { 'aria-label': label } });
      r.addEventListener('input', () => { C0[key] = Number(r.value); out.textContent = r.value; });
      r.addEventListener('change', () => { C0[key] = Number(r.value); changed({ [key]: Number(r.value) }); });
      return el('label', { class: 'shp-range' }, el('span', { text: label }), r, out);
    };
    // a control moved: the previews follow; on a layer being changed, the layer follows too (one undo step)
    function changed(part) {
      saveControls(C0); paint();
      if (!target) return;
      setOn(target.id, part).then((r) => r.same || toast(`◆ ${r.set.join(' · ')}`, { timeout: 1200 })).catch((e) => toast(e.message, { type: 'error' }));
    }
    function paint() {
      drawRow.replaceChildren(el('span', { class: 'shp-lab', text: 'Draws' }),
        ...MODE_CHIPS.map(([k, label]) => chip(label, C0.drawOn === k, () => { C0.drawOn = k; changed({ drawOn: k }); }, k === 'off' ? 'Still: the Start / End sliders draw it (keyframe them on the timeline)' : C.HIT_MODES[k] ? `Draws itself again on each ${k} of the song` : '')),
        range('Takes', 'dur', 0.1, 4, 0.05, C0.dur ?? 1.2, 'Seconds it takes to draw'),
        el('select', { class: 'shp-sel', title: 'Easing', attrs: { 'aria-label': 'Easing' }, on: { change: (e) => { C0.ease = e.target.value; changed({ ease: C0.ease }); } } }, ...C.EASES.map((x) => el('option', { value: x, text: x, selected: (C0.ease || 'smooth') === x }))),
        chip('⇄ Reverse', Boolean(C0.reverse), () => { C0.reverse = !C0.reverse; changed({ reverse: C0.reverse }); }, 'Draws from the other end'));
      const pal = palette();
      lookRow.replaceChildren(
        range('Line', 'width', 0, 60, 0.5, C0.width ?? 10, 'Line width (pixels of a 1080 frame; 0 = no line)'),
        range('Dashes', 'dash', 0, 60, 1, C0.dash ?? 0, 'Dash length (0 = solid)'),
        range('Round', 'round', 0, 1, 0.01, C0.round ?? 0, 'Corner roundness'),
        chip('Filled', Boolean(C0.filled), () => { C0.filled = !C0.filled; changed({ filled: C0.filled }); }, 'Filled with a color (closed shapes)'),
        el('span', { class: 'shp-lab', text: 'Colors' }),
        chip('Its own', !C0.stroke, () => { delete C0.stroke; delete C0.fill; paint(); }, 'The shape\'s own colors'),
        ...(pal.length ? pal.map((hex, i) => { const b = el('button', { type: 'button', class: `shp-sw${C0.stroke === hex ? ' on' : ''}`, title: `${hex}: the line (the fill takes the next palette color)`, attrs: { 'aria-label': `Colors from ${hex}` }, on: { click: () => { C0.stroke = hex; C0.fill = pal[(i + 1) % pal.length]; changed({ stroke: hex, fill: C0.fill }); } } }); b.style.background = hex; return b; }) : [el('span', { class: 'shp-lab', text: 'no palette yet', title: 'Palette follows the cover, or the scene\'s palette' })]));
    }
    paint();
    const foot = el('div', { class: 'shp-foot' }, el('span', { class: 'hint', text: 'Click a shape (or Enter) · ✎ Draw your own: click points, Shift for straight lines · Ctrl/⌘+Z undoes · Esc closes' }));
    box.append(drawRow, lookRow, foot);

    // ---- the cards ----
    let rows = []; let at = 0; const cards = [];
    const ctl = () => ({ ...C0 });
    const go = (p, custom = null) => {
      apply(p, { layer: target ? target.id : null, controls: ctl(), custom }).then((r) => {
        toast(`◆ ${r.preset} · “${r.layer}”`, { timeout: 1600 });
        if (!target && r.id) { target = { id: r.id, name: r.layer }; where.textContent = `changes “${r.layer}”`; }
        cardsOn(p.id);
      }).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    };
    const cardsOn = (id) => { for (const c of cards) c.btn.classList.toggle('cur', c.p.id === id); };
    for (const p of PRESETS) {
      const canvas = el('canvas', { class: 'shp-cv', attrs: { 'aria-hidden': 'true' } });
      const btn = el('button', { type: 'button', class: 'shp-card', title: p.desc, attrs: { role: 'option', 'aria-label': `${p.name}: ${p.desc}` }, on: { click: () => (p.id === 'custom' ? drawPad() : go(p)) } },
        canvas, el('b', { text: p.id === 'custom' ? `✎ ${p.name}` : p.name }));
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

    // ---- ✎ draw your own: click points on a pad shaped like the frame (Shift: a straight line, at 45° steps) ----
    const D = { on: false, pts: [], closed: false, hover: null };
    function frameAspect() { const f = [...document.querySelectorAll('.three-preview iframe')].find((x) => x.getBoundingClientRect().width > 0); const r = f?.getBoundingClientRect(); return r && r.height ? r.width / r.height : 16 / 9; }
    function drawPad() {
      D.on = true; D.pts = []; D.closed = false; D.hover = null;
      grid.hidden = true; search.hidden = true; pad.hidden = false;
      const asp = frameAspect();
      const cv = el('canvas', { class: 'shp-padcv', attrs: { 'aria-label': 'Draw your own: click to add points, Shift for straight lines' } });
      const room = Math.max(240, (box.clientWidth || 780) - 26); // (the pad fills the picker's width, and fits its height)
      let W = Math.min(room, 780); let H = Math.round(W / asp);
      const info = el('span', { class: 'shp-lab', text: 'Click to add points · Shift: a straight line · click the first point to close' });
      const addB = el('button', { type: 'button', class: 'primary small', text: 'Add it', on: { click: () => finish() } });
      const backB = el('button', { type: 'button', class: 'ghost small', text: '‹ Shapes', on: { click: () => leave() } });
      const clearB = el('button', { type: 'button', class: 'ghost small', text: 'Clear', on: { click: () => { D.pts = []; D.closed = false; paintPad(); } } });
      pad.replaceChildren(el('div', { class: 'shp-padbar' }, backB, info, clearB, addB), cv);
      // the whole picker fits on screen: what isn't the pad is measured, the pad takes the rest (no scrolling while drawing)
      cv.style.width = `${W}px`; cv.style.height = '0px';
      const maxH = Math.max(140, Math.floor(innerHeight * 0.86) - box.scrollHeight - 4);
      if (H > maxH) { H = maxH; W = Math.round(H * asp); }
      cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      D.cv = cv; D.W = W; D.H = H;
      const unit = () => Math.min(W, H) / 2;
      const toU = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) - W / 2) / unit(), -((e.clientY - r.top) - H / 2) / unit()]; };
      const snap = (p) => { const a = D.pts[D.pts.length - 1]; if (!a) return p; const dx = p[0] - a[0]; const dy = p[1] - a[1]; const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(dx, dy); return [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len]; };
      cv.addEventListener('pointermove', (e) => { const p = toU(e); D.hover = e.shiftKey ? snap(p) : p; paintPad(); });
      cv.addEventListener('pointerleave', () => { D.hover = null; paintPad(); });
      cv.addEventListener('click', (e) => {
        let p = toU(e);
        const f = D.pts[0]; const lst = D.pts[D.pts.length - 1];
        if (f && D.pts.length >= 3 && Math.hypot(p[0] - f[0], p[1] - f[1]) * unit() < 10) { D.closed = true; paintPad(); return; }
        if (lst && Math.hypot(p[0] - lst[0], p[1] - lst[1]) * unit() < 3) return; // (the second click of a double-click)
        if (e.shiftKey) p = snap(p); // (a sharp point: the line into it and out of it is straight)
        D.pts.push([p[0], p[1], e.shiftKey ? 1 : 0]); D.closed = false;
        paintPad();
      });
      cv.addEventListener('dblclick', () => finish());
      paintPad();
    }
    function padPath() { const pts = D.pts.map((x) => [x[0], x[1], x[2]]); return { points: pts, closed: D.closed }; }
    function paintPad() {
      const cv = D.cv; if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.round(D.W * dpr); const h = Math.round(D.H * dpr);
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
      const u = (Math.min(w, h) / 2); const X = (x) => w / 2 + x * u; const Y = (y) => h / 2 - y * u;
      g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
      const v = values(PRESETS.find((p) => p.id === 'custom'), ctl()); v.drawOn = 'off';
      if (D.pts.length >= 2) { const P = C.build('custom', v, padPath()); drawPath(g, P, v, 0, null, u, w / 2, h / 2); }
      const lst = D.pts[D.pts.length - 1];
      if (lst && D.hover && !D.closed) { g.setLineDash([4 * dpr, 4 * dpr]); g.strokeStyle = '#ffffff88'; g.lineWidth = dpr; g.beginPath(); g.moveTo(X(lst[0]), Y(lst[1])); g.lineTo(X(D.hover[0]), Y(D.hover[1])); g.stroke(); g.setLineDash([]); }
      D.pts.forEach((p, i) => { g.fillStyle = i === 0 ? '#ffd75e' : p[2] ? '#ff7a3d' : '#ffffff'; g.beginPath(); if (p[2]) g.rect(X(p[0]) - 3.5 * dpr, Y(p[1]) - 3.5 * dpr, 7 * dpr, 7 * dpr); else g.arc(X(p[0]), Y(p[1]), 3.5 * dpr, 0, Math.PI * 2); g.fill(); });
    }
    function leave() { D.on = false; D.cv = null; pad.hidden = true; pad.replaceChildren(); grid.hidden = false; search.hidden = false; search.focus(); }
    function finish() {
      if (D.pts.length < 2) { toast('Click at least two points', { timeout: 1600 }); return; }
      const custom = padPath(); leave();
      go(PRESETS.find((p) => p.id === 'custom'), custom);
    }

    const onKey = (e) => {
      if (!shade.isConnected) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (D.on) leave(); else close(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); e.stopPropagation(); if (D.on && D.pts.length) { D.pts.pop(); D.closed = false; paintPad(); } else undoB.click(); return; }
      if (D.on) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(); }
        if (e.key === 'Backspace' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); D.pts.pop(); D.closed = false; paintPad(); }
        return;
      }
      if (e.target === search || grid.contains(e.target)) {
        const cols = Math.max(1, Math.round(grid.clientWidth / 150));
        const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
        if (mv) { e.preventDefault(); at = Math.max(0, Math.min(rows.length - 1, at + mv)); draw(); rows[at]?.btn.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter' && rows[at] && e.target === search) { e.preventDefault(); rows[at].btn.click(); }
      }
    };
    addEventListener('keydown', onKey, true);
    draw();
    if (cur) cardsOn(cur.id);
    document.body.append(shade);
    // previews only for the cards in view; the loop stops when the picker closes or the window hides
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { for (const x of es) { const c = cards.find((k) => k.btn === x.target); if (c) c.vis = x.isIntersecting; } }, { root: grid }) : null;
    if (io) for (const c of cards) io.observe(c.btn);
    let raf = 0; const t0 = performance.now();
    const loop = () => {
      if (!shade.isConnected) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden || D.on) return;
      const t = (performance.now() - t0) / 1000; const c = ctl();
      for (const k of rows) if (k.vis) { try { drawCard(k, t, c); } catch (err) { console.warn('shape preview', err); k.vis = false; } }
    };
    raf = requestAnimationFrame(loop);
    if (own) drawPad(); else search.focus();
    open0 = { close, el: shade, get target() { return target; }, get drawing() { return D; } };
    return open0;
  }

  // ---------- chat command (the app's internal API; the directors reach it through three_do run), Ctrl/⌘+K ----------
  const said = (r) => `◆ ${r.preset ? `${r.preset} · ` : ''}“${r.layer}”${r.set ? `: ${r.set.join(' · ')}` : ''}`;
  const NUMS = ['width', 'dash', 'gap', 'round', 'dur', 'delay', 'hold', 'march', 'taper', 'offset', 'sides', 'inner', 'amp', 'turns', 'w', 'h'];
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('shape')) return;
    Commands.register({
      name: 'shape', area: 'Three.js Lab', aliases: ['shapes', 'draw-shape'],
      args: '[<shape> | draw <mode> | width | dash | own | undo | list]',
      desc: '◆ Shapes that draw themselves: circle, arrow, underline, frame, checkmark… or draw your own; on, off, looped or on each kick',
      examples: ['/shape arrow', '/shape draw kick', '/shape own'],
      keywords: 'draw on write on trim path stroke underline',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^draw\b/.test(w)) return C.MODES.map((x) => ({ value: `draw ${x}`, hint: C.MODE_NAMES[x] })).filter((x) => x.value.startsWith(w));
        if (/^ease\b/.test(w)) return C.EASES.map((x) => ({ value: `ease ${x}` })).filter((x) => x.value.startsWith(w));
        if (/^place\b/.test(w)) return Object.keys(PLACES).map((x) => ({ value: `place ${x}` })).filter((x) => x.value.startsWith(w));
        const verbs = [{ value: 'draw ', hint: 'how it draws on' }, { value: 'width ', hint: 'line width (px)' }, { value: 'dash ', hint: 'dash length (0 = solid)' }, { value: 'round ', hint: '0–1' }, { value: 'dur ', hint: 'seconds' }, { value: 'ease ', hint: C.EASES.join(', ') }, { value: 'reverse' }, { value: 'filled' }, { value: 'outline' }, { value: 'color ', hint: '#hex: the line' }, { value: 'fill ', hint: '#hex' }, { value: 'place ' }, { value: 'size ' }, { value: 'own', hint: 'draw your own' }, { value: 'undo' }, { value: 'list' }];
        return [...PRESETS.filter((p) => p.id !== 'custom').map((p) => ({ value: `${p.id} `, hint: p.name })), ...verbs].filter((x) => !w || x.value.startsWith(w)).slice(0, 40);
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const v = (verb || '').toLowerCase(); const a0 = rest.join(' ').trim();
        if (!v) { await open(); return null; }
        await ThreeLab.cmd();
        if (v === 'list') return PRESETS.map((p) => `- \`${p.id}\` ${p.name}: ${p.desc}`).join('\n');
        if (v === 'undo') { const r = await undo(); return r.none ? 'Nothing to undo' : `↶ ${r.undone}`; }
        if (v === 'own' || v === 'custom') { await open({ draw: true }); return null; }
        if (v === 'draw' || v === 'draws') return said(await setOn(null, { drawOn: a0.toLowerCase() || 'in' }));
        if (v === 'ease') return said(await setOn(null, { ease: a0.toLowerCase() }));
        if (v === 'reverse') return said(await setOn(null, { reverse: !/^(off|no|false)$/i.test(a0) }));
        if (v === 'filled' || v === 'outline') return said(await setOn(null, { filled: v === 'filled' }));
        if (v === 'color' || v === 'stroke' || v === 'line') return said(await setOn(null, { stroke: a0 }));
        if (v === 'fill') return said(await setOn(null, /^none$/i.test(a0) ? { filled: false } : { fill: a0, filled: true }));
        if (v === 'place') return said(await place(null, { place: a0.toLowerCase() }));
        if (v === 'size') return said(await place(null, { scale: Number(a0) }));
        if (NUMS.includes(v)) return said(await setOn(null, { [v]: Number(a0) }));
        const p = C.preset(w) || C.preset(v);
        if (!p || p.id === 'custom') return `No shape "${w}". Try: ${PRESETS.filter((x) => x.id !== 'custom').map((x) => x.id).join(', ')} (or /shape own to draw one)`;
        return said(await apply(p, { controls: lastControls() }));
      },
    });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: ◆ Shape that draws itself…', () => open().catch((e) => toast(e.message, { type: 'error' })));
    AppUI.addAction('Lab: ✎ Draw a shape…', () => open({ draw: true }).catch((e) => toast(e.message, { type: 'error' })));
  }

  return { open, apply, setOn, place, undo, codeFor, presetOf, setValue, getValue, values, drawCard, drawPath, PRESETS, get undoDepth() { return undoStack.length; }, get picker() { return open0; } };
})();
window.LabShapes = LabShapes;
