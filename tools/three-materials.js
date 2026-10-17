// ◉ Looks for 3D things (round 50, labmaterials): give a 3D object or a whole 3D layer / 🧊 model a material look in one
// click. 16 presets (chrome, brushed metal, gold, mirror, glass, frosted glass, glossy plastic, ceramic, matte clay, rubber,
// velvet, holographic, neon, toon, wireframe, x-ray: tools/three-materials-core.js), a color from the scene's palette
// and a Shine slider.
//   · the picker: a small card of balls (thumbnails drawn once by the preview's one shared small renderer and kept here,
//     per color), pointing at a ball tries it on the thing itself (never saved), a click uses it; Color and Shine the same
//     way; Original takes the look off. Nothing runs while it is closed (no loop, no timer).
//   · where it goes: the object that was picked (✥ the outline's ◉ Look ›, the scene editor's ◉ Look ›) or the whole
//     layer (every mesh; a 🧊 model: the model, not its ground); "This part / Whole layer" switches.
//   · kept with the layer like the 3D gizmo's placements (layer.overrides['@look']): saved with the scene, its 📐 templates,
//     packs, the time machine; renders and the Lab sequence draw the same; one 📜 recipe step; the directors see
//     "materials" in the scene outline.
//   · each change is one Ctrl/⌘+Z (in the picture's own undo, tools/three-direct.js, so it takes its turn with the moves).
//   · chats: /material <look> [#hex] [shine N] | off | list | undo; the directors: three_do material (help material).
// The picture side: tools/three-sandbox.html "Looks" (applied in the render hook; a built-in studio light for metal and
// glass when the scene has no environment; nothing for layers without a look).
const LabMaterials = (() => {
  const C = MatCore;
  const stats = { applied: 0, undone: 0, tries: 0, thumbs: 0, opens: 0 };
  const thumbs = new Map(); // color ('' = each preset's own) → Promise<{ url, cols, size }>
  const own = []; // undo steps when the picture's undo isn't there
  let card = null;
  const host = () => { const x = LabMatHook.host(); if (!x) throw new Error('Open the Three.js Lab first'); return x; };
  const isModel = (L) => typeof ThreeModels !== 'undefined' && Boolean(ThreeModels.isModelCode?.(L?.code));
  const clone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
  const keyLabel = (k) => window.WinMac?.keyLabel?.(k) || (/Mac/.test(navigator.platform) ? k.replace('Ctrl+', '⌘') : k);

  // ---------- where a look goes ----------
  // { L, path: an object's path | null (the whole layer), key: path | '#Model' (a model's whole) | '*' }
  function target({ layer = null, path = null } = {}) {
    const h = host();
    const L = (layer && h.layerById(layer)) || h.sel();
    if (!L) throw new Error('Select a 3D layer first (or pick a 3D thing on the picture)');
    const whole = isModel(L) ? '#Model' : '*';
    return { L, path: path && path !== whole ? path : null, key: path || whole };
  }
  const lookOf = (L) => L?.overrides?.['@look'] || null;
  const specAt = (t) => lookOf(t.L)?.[t.key] || null;
  const shownAt = (t) => specAt(t) || (t.path ? lookOf(t.L)?.[isModel(t.L) ? '#Model' : '*'] : null) || null; // (a part without its own look shows the whole layer's)
  // set (spec) or take off (null) the look at t, as one undo step → true when something changed
  function apply(t, spec, { label = null } = {}) {
    const h = host();
    const s = spec ? C.normalize(spec) : null;
    if (spec && !s) throw new Error(`Looks: ${C.PRESETS.map((p) => p.name.toLowerCase()).join(', ')}`);
    const before = clone(lookOf(t.L));
    const next = { ...(before || {}) };
    if (s) next[t.key] = s; else delete next[t.key];
    const after = Object.keys(next).length ? next : null;
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    h.setLook(t.L, after);
    stats.applied += 1;
    const where = t.path ? `${t.name || 'a part'} of “${t.L.name}”` : `“${t.L.name}”`;
    const text = label || (s ? `◉ ${C.describe(s)} on ${where}` : `◉ Original look on ${where}`);
    const back = (L) => { host().setLook(L, clone(before)); stats.undone += 1; card?.paint(); };
    if (!window.LabDirect?.push?.(t.L.id, text, back)) { own.push({ lid: t.L.id, sid: h.sketchId(), back, text }); if (own.length > 40) own.shift(); }
    window.LabRecipesHook?.note?.('mat', { spec: s, key: t.path ? t.key : '', layer: t.L.name });
    return true;
  }
  function undo() {
    if (window.LabDirect?.steps?.length) return LabDirect.undo();
    const u = own.pop(); const L = u && host().layerById(u.lid);
    if (!L || u.sid !== host().sketchId()) return false;
    u.back(L); toast(`↶ ${u.text} undone`, { timeout: 1400 });
    return true;
  }
  // try one on the thing itself (null: as it is now; off: stop trying)
  const tryOn = (t, spec, off = false) => { stats.tries += off ? 0 : 1; host().send({ type: 'look-try', layer: t.L.id, path: t.key, spec: spec ? C.normalize(spec) : null, off }); };

  // ---------- the balls: drawn once per color by the preview, kept here ----------
  function balls(color = '') {
    if (!thumbs.has(color)) {
      const specs = C.PRESETS.map((p) => (color ? { k: p.id, c: color } : { k: p.id }));
      const p = LabMatHook.ask({ type: 'look-thumbs', specs, size: 72 }, 120000).then((m) => { if (!m?.url) { thumbs.delete(color); return null; } stats.thumbs += 1; return m; });
      thumbs.set(color, p);
      if (thumbs.size > 8) thumbs.delete(thumbs.keys().next().value);
    }
    return thumbs.get(color);
  }

  // ---------- the picker ----------
  const DEFAULT_PAL = ['#48ddff', '#bd8bff', '#ff6b9d', '#ffd75e'];
  async function open(o = {}) {
    const h = host();
    close();
    let t = target(o);
    const info = await LabMatHook.ask({ type: 'look-info', layer: t.L.id, path: t.path }, 4000);
    if (info && !info.is3d) throw new Error(`“${t.L.name}” has no 3D scene: pick a three.js layer or a 🧊 model`);
    t.name = info?.name || null;
    stats.opens += 1;
    const pal = [...new Set([...(h.palette() || []), ...DEFAULT_PAL].map((c) => String(c).toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c)))].slice(0, 8);
    let color = shownAt(t)?.c || '';
    const wholeT = { ...t, path: null, key: isModel(t.L) ? '#Model' : '*' };
    const partT = t.path ? t : null;
    const what = el('span', { class: 'lm-what' });
    const scope = partT ? el('div', { class: 'lm-scope', attrs: { role: 'group', 'aria-label': 'Where the look goes' } },
      el('button', { class: 'lm-chip', text: 'This part', title: `Only ${t.name || 'the object you picked'}`, on: { click: () => { t = partT; paint(); } } }),
      el('button', { class: 'lm-chip', text: 'Whole layer', title: isModel(t.L) ? 'The whole model' : 'Every 3D object of this layer', on: { click: () => { t = wholeT; paint(); } } })) : null;
    const grid = el('div', { class: 'lm-grid', attrs: { role: 'listbox', 'aria-label': 'Looks' } });
    const tiles = C.PRESETS.map((p, i) => {
      const b = el('button', { class: 'lm-ball', dataset: { k: p.id, i: String(i) }, attrs: { role: 'option', 'aria-label': p.name }, title: `${p.name}: point to try it, click to use it` },
        el('i', { class: 'lm-pic' }), el('span', { text: p.name }));
      b.addEventListener('pointerenter', () => tryOn(t, { k: p.id, c: color || undefined }));
      b.addEventListener('focus', () => tryOn(t, { k: p.id, c: color || undefined }));
      b.addEventListener('click', () => use({ k: p.id, c: color || undefined }));
      return b;
    });
    grid.append(...tiles);
    grid.addEventListener('pointerleave', () => tryOn(t, null, true));
    const sw = (c) => {
      const b = el('button', { class: 'lm-sw', dataset: { c }, title: c ? `Color ${c}` : 'Its own color', attrs: { 'aria-label': c ? `Color ${c}` : 'Its own color' }, style: c ? { background: c } : {} });
      b.addEventListener('pointerenter', () => { const s = shownAt(t); if (s) tryOn(t, { ...s, c: c || undefined }); });
      b.addEventListener('pointerleave', () => tryOn(t, null, true));
      b.addEventListener('click', () => { color = c; const s = shownAt(t) || { k: 'plastic' }; use({ ...s, c: c || undefined }, { keepShine: true }); pics(); });
      return b;
    };
    const pick = el('input', { type: 'color', class: 'lm-pickc', title: 'Any color', attrs: { 'aria-label': 'Any color' } });
    pick.addEventListener('change', () => { color = pick.value.toLowerCase(); const s = shownAt(t) || { k: 'plastic' }; use({ ...s, c: color }, { keepShine: true }); pics(); });
    const swatches = el('div', { class: 'lm-sws' }, sw(''), ...pal.map(sw), pick);
    const shine = el('input', { type: 'range', min: 0, max: 100, step: 1, class: 'lm-shine', attrs: { 'aria-label': 'Shine' } });
    const shineV = el('span', { class: 'lm-v' });
    shine.addEventListener('input', () => { const s = shownAt(t); shineV.textContent = `${shine.value} %`; if (s) tryOn(t, { ...s, s: shine.value / 100 }); });
    shine.addEventListener('change', () => { const s = shownAt(t); if (s) use({ ...s, s: shine.value / 100 }, { keepShine: true }); });
    const orig = el('button', { class: 'ghost small', text: 'Original', title: 'Take the look off (its own material again)', on: { click: () => { apply(t, null); paint(); } } });
    const x = el('button', { class: 'ghost small lm-x', text: '✕', title: 'Close (Esc)', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } });
    const pop = el('div', { class: 'lm-pick', attrs: { role: 'dialog', 'aria-label': 'Look' } },
      el('div', { class: 'lm-head' }, el('b', { text: '◉ Look' }), what, x),
      scope, grid,
      el('div', { class: 'lm-row' }, el('span', { class: 'lm-lab', text: 'Color' }), swatches),
      el('div', { class: 'lm-row' }, el('span', { class: 'lm-lab', text: 'Shine' }), shine, shineV),
      el('div', { class: 'lm-foot' }, orig, el('span', { class: 'hint', text: `Point to try · click to use · ${keyLabel('Ctrl+Z')} undoes` })));
    function use(spec, { keepShine = false } = {}) {
      const s = { ...spec };
      if (!keepShine) delete s.s; // (a new look starts at its own shine)
      tryOn(t, null, true);
      try { apply(t, s); } catch (e) { toast(e.message, { type: 'error' }); }
      paint();
    }
    function paint() {
      const s = shownAt(t);
      what.textContent = t.path ? (t.name || 'the part you picked') : (isModel(t.L) ? `🧊 ${t.L.name}` : t.L.name);
      scope?.querySelectorAll('.lm-chip').forEach((b, i) => { const on = (i === 0) === Boolean(t.path); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      tiles.forEach((b) => { const on = b.dataset.k === s?.k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      swatches.querySelectorAll('.lm-sw').forEach((b) => b.classList.toggle('on', (b.dataset.c || '') === (s?.c || '')));
      const v = Math.round((s ? C.shineOf(s) : 0.5) * 100);
      if (Number(shine.value) !== v) shine.value = v;
      shine.disabled = !s; shineV.textContent = s ? `${v} %` : '–';
      orig.disabled = !specAt(t);
    }
    async function pics() {
      const m = await balls(color);
      if (!m || !pop.isConnected) return;
      tiles.forEach((b, i) => {
        const pic = b.firstChild; const cx = (i % m.cols) * m.size; const cy = Math.floor(i / m.cols) * m.size;
        Object.assign(pic.style, { backgroundImage: `url(${m.url})`, backgroundSize: `${m.cols * 100}% auto`, backgroundPosition: `${(cx / Math.max(1, (m.cols - 1) * m.size)) * 100}% ${(cy / Math.max(1, (Math.ceil(m.n / m.cols) - 1) * m.size)) * 100}%` });
      });
    }
    // placed over the picture's right side (or beside the button that opened it), clear of the screen's edges
    const r = (o.anchor?.getBoundingClientRect?.()) || h.previewHost?.getBoundingClientRect?.() || { right: innerWidth - 20, top: 80, left: 20, bottom: 400 };
    document.body.append(pop);
    const w = pop.offsetWidth || 300; const ph = pop.offsetHeight || 420;
    const left = o.anchor ? Math.min(innerWidth - w - 8, Math.max(8, r.left)) : Math.max(8, Math.min(innerWidth - w - 8, r.right - w - 12));
    const top = o.anchor ? Math.min(innerHeight - ph - 8, Math.max(8, r.bottom + 6)) : Math.max(8, Math.min(innerHeight - ph - 8, r.top + 12));
    pop.style.left = `${Math.round(left)}px`; pop.style.top = `${Math.round(top)}px`;
    const away = (e) => { if (!pop.contains(e.target) && e.target !== o.anchor) close(); };
    const keys = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', keys, true); }, 0);
    card = { pop, paint, get target() { return t; }, close() { tryOn(t, null, true); pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', keys, true); } };
    paint(); pics();
    (pop.querySelector('.lm-ball.on') || tiles[0]).focus({ preventScroll: true });
    tryOn(t, null, true); // (focus isn't a try)
    return card;
  }
  function close() { const c = card; card = null; c?.close(); }

  // ---------- chats: /material ----------
  const layerByRef = (ref) => {
    const h = host(); const Ls = h.layers();
    if (ref == null || ref === '' || ref === 'selected') return h.sel();
    const s = String(ref).toLowerCase();
    if (s === 'top') return Ls[Ls.length - 1]; if (s === 'bottom') return Ls[0];
    if (/^\d+$/.test(s)) return Ls[Number(s) - 1] || null;
    return Ls.find((L) => L.id === ref) || Ls.find((L) => String(L.name).toLowerCase() === s) || Ls.find((L) => String(L.name).toLowerCase().includes(s)) || null;
  };
  // "chrome", "frosted glass #88ccff shine 40", "gold 0.3" → spec
  function parse(words) {
    const c = /#[0-9a-f]{6}\b/i.exec(words)?.[0];
    let w = words.replace(/#[0-9a-f]{6}\b/i, ' ');
    let s = null;
    const m = /\bshine\s*(\d+(?:\.\d+)?)\s*%?|\b(\d+(?:\.\d+)?)\s*%/i.exec(w) || /\b(0?\.\d+|1(?:\.0+)?|0)\b/.exec(w);
    if (m) { const v = Number(m[1] ?? m[2]); s = v > 1 ? v / 100 : v; w = w.replace(m[0], ' '); }
    const p = C.find(w.trim()) || C.find(w.trim().split(/\s+/)[0]);
    return p ? { k: p.id, ...(c ? { c } : {}), ...(s != null ? { s } : {}) } : null;
  }
  function command(a) {
    if (!a) return open({}).then(() => null); // (round 58, sweep58) awaited: a layer with no 3D scene answers the command, not an unhandled rejection
    if (/^list$/i.test(a)) return `Looks: ${C.PRESETS.map((p) => p.name.toLowerCase()).join(', ')} (+ #hex color, shine 0–100)`;
    if (/^undo$/i.test(a)) return undo() ? 'Undone' : 'Nothing to undo';
    const t = target({});
    if (/^(off|none|original|remove|clear)$/i.test(a)) return apply(t, null) ? `“${t.L.name}” has its own look again (/material undo)` : 'No look to take off';
    const s = parse(a);
    if (!s) throw new Error(`No look “${a}”. Looks: ${C.PRESETS.map((p) => p.name.toLowerCase()).join(', ')}`);
    apply(t, s);
    return `◉ ${C.describe(C.normalize(s))} on “${t.L.name}” · /material undo`;
  }

  // ---------- the directors: three_do material ----------
  const onScreen = (ctx = {}) => { if (!ctx.chatId || typeof ChatScenes === 'undefined') return true; const r = ChatScenes.routeThree('three_layers', ctx.chatId); return !r || r.sketchId === ThreeLab.scenes?.currentId(); };
  async function op(a = {}, ctx = {}) {
    const o = String(a.op || (a.preset || a.look ? 'set' : 'list')).toLowerCase();
    if (o === 'list' || o === 'help') return { looks: C.PRESETS.map((p) => p.id), names: Object.fromEntries(C.PRESETS.map((p) => [p.id, p.name])), args: 'set {layer, preset, color: #hex, shine: 0–1, part: path from the scene editor (none: the whole layer)} | off {layer, part} | info' };
    if (!onScreen(ctx)) throw new Error('This chat’s scene isn’t on screen: open it in the Lab first.');
    if (o === 'info') return { layers: host().layers().filter((L) => lookOf(L)).map((L) => ({ layer: L.name, materials: Object.fromEntries(Object.entries(lookOf(L)).map(([k, s]) => [k === '*' || k === '#Model' ? 'whole layer' : k, C.describe(s)])) })) };
    const L = layerByRef(a.layer);
    if (!L) throw new Error(`No layer “${a.layer}”.`);
    const t = target({ layer: L.id, path: a.part || a.path || null });
    if (o === 'off') return { layer: L.name, changed: apply(t, null) };
    if (o !== 'set') throw new Error('op: list | set | off | info');
    const p = C.find(a.preset || a.look || '');
    if (!p) throw new Error(`preset: ${C.PRESETS.map((x) => x.id).join(', ')}`);
    const spec = { k: p.id, ...(a.color ? { c: String(a.color) } : {}), ...(a.shine != null ? { s: Number(a.shine) > 1 ? Number(a.shine) / 100 : Number(a.shine) } : {}) };
    const changed = apply(t, spec);
    return { layer: L.name, look: C.describe(C.normalize(spec)), where: t.path || 'whole layer', changed, undo: 'three_do undo does not undo looks: set another or op off' };
  }

  // ---------- 📜 a recipe step: { spec, key, layer } on the layer of that name, else the selected one ----------
  function replay(s) {
    let L = null;
    try { L = (s.layer && layerByRef(s.layer)) || host().sel(); } catch (e) { return e.message; }
    if (!L) return 'no layer for it';
    const t = target({ layer: L.id, path: s.key || null });
    apply(t, s.spec || null, { label: `◉ ${s.spec ? C.describe(s.spec) : 'Original look'} (recipe)` });
    return null;
  }

  // one look on the selected layer, from the menu
  function quick(k) {
    const t = target({});
    const changed = apply(t, k ? { k } : null);
    if (changed) toast(k ? `◉ ${C.BY[k].name} on “${t.L.name}”` : `“${t.L.name}” has its own look again`, { timeout: 2200, action: { label: 'Undo', fn: () => undo() } });
    return changed;
  }

  return { open, close, apply, undo, quick, target, command, op, replay, parse, balls, stats, get card() { return card; } };
})();
window.LabMaterials = LabMaterials;
