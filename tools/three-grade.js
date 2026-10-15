// ◐ Grade (round 24 "grade"): cinematic finishing for the Lab and its sequence. Two filter layers on top of the scene
// (◐ Film & lens under ◐ Grade: one GPU pass for the whole grade, see tools/three-sandbox.html "cinematic grade"),
// driven by one compact panel over the preview (tabs: Tone · Wheels · Curves · HSL · Color · LUT · Film · Lens ·
// Scopes), by presets, by LUTs (a starter pack made procedurally + your .cube files, 1D or 3D) and by chat (/grade).
// A Lab sequence clip (or the whole sequence) gets its own grade the same way: the same shader runs in the preview and
// in the export page, so the render is what you saw. The current grade exports as a .cube for Premiere / Resolve.
//   LabGrade.open({ clip? }) · close() · applyPreset(id, { target }) · set(values, { kind, target }) · setLut(name, amt)
//   importCube(path) · exportCube(path?) · luts() · state() · onPage(deliver) (tools/three.js, every Lab page)
//   previewItem() (right-click the preview) · clipMenu(clip, ids) (the sequence's clip menu)
const LabGrade = (() => {
  const G = GradeCore;
  const NAME = G.NAMES;
  const err = (e) => toast(e?.message || String(e), { type: 'error' });
  const D = () => ThreeLab.director;
  async function lab() {
    await ThreeLab.cmd?.({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return ThreeLab.director;
  }

  // ---------- imported LUTs: kept in kv, sent as numbers to every Lab page (preview, Stage, export page) ----------
  const LUTS = { list: null, data: new Map() }; // list: [{ name, title, was, size, N }] · data: name → { N, data }
  const pages = new Set();
  const b64ToF32 = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); };
  const f32ToB64 = (f) => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function loadLuts() {
    if (LUTS.list) return LUTS.list;
    LUTS.list = (await window.hub.kvGet('lab-grade-luts', [])) || [];
    for (const it of LUTS.list) {
      try { const v = await window.hub.kvGet(`lab-grade-lut-${it.name}`, null); if (v?.data) LUTS.data.set(it.name, { N: v.N, data: b64ToF32(v.data) }); } catch { /* a LUT that didn't keep */ }
    }
    return LUTS.list;
  }
  const lutNames = () => (LUTS.list || []).map((x) => x.name);
  const allLuts = () => [...G.PACK_IDS, ...lutNames()];
  function sendLut(deliver, name) { const v = LUTS.data.get(name); if (v) deliver({ target: 'three-sandbox', type: 'grade-lut', name, N: v.N, data: v.data }); }
  // a Lab page said "ready": it gets the imported LUTs (the starter pack is made in the page itself)
  function onPage(deliver) {
    pages.add(deliver);
    loadLuts().then(() => { for (const n of lutNames()) try { sendLut(deliver, n); } catch { pages.delete(deliver); return; } }).catch(() => {});
  }
  function broadcast(name) { for (const d of [...pages]) try { sendLut(d, name); } catch { pages.delete(d); } }
  async function importCube(path, { name = null } = {}) {
    await loadLuts();
    const text = await window.hub.fs.read(path);
    const lut = G.parseCube(text);
    let nm = G.lutName(name || path); const base = nm; let k = 2;
    while (G.PACK_IDS.includes(nm) || (LUTS.list.some((x) => x.name === nm) && !name)) nm = `${base}-${k++}`;
    LUTS.data.set(nm, { N: lut.N, data: lut.data });
    LUTS.list = [...LUTS.list.filter((x) => x.name !== nm), { name: nm, title: lut.title || nm, was: lut.was, size: lut.size, N: lut.N, at: Date.now() }].slice(-40);
    await window.hub.kvSet(`lab-grade-lut-${nm}`, { N: lut.N, data: f32ToB64(lut.data) });
    await window.hub.kvSet('lab-grade-luts', LUTS.list);
    broadcast(nm);
    return { name: nm, ...lut, data: undefined };
  }
  async function removeLut(name) {
    await loadLuts();
    LUTS.list = LUTS.list.filter((x) => x.name !== name); LUTS.data.delete(name);
    await window.hub.kvSet('lab-grade-luts', LUTS.list);
    await window.hub.kvSet(`lab-grade-lut-${name}`, null);
    for (const d of [...pages]) try { d({ target: 'three-sandbox', type: 'grade-lut', name, data: null }); } catch { pages.delete(d); }
    return true;
  }
  async function pickCubes() {
    const ps = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'LUTs (.cube)', extensions: ['cube'] }] });
    const list = Array.isArray(ps) ? ps : ps?.filePaths || [];
    const got = [];
    for (const p of list) { try { got.push(await importCube(p)); } catch (e) { err(new Error(`${p.split(/[\\/]/).pop()}: ${e.message}`)); } }
    if (got.length) { toast(`LUT${got.length > 1 ? 's' : ''} added: ${got.map((x) => x.name).join(', ')}`); await setLut(got[got.length - 1].name); }
    return got;
  }

  // ---------- where the grade lives: the scene's ◐ layers, or a sequence clip / the whole sequence ----------
  // target: 'lab' (default) | { clip: id } | { seq: true }
  const isClip = (t) => Boolean(t && (t.clip || t.seq));
  const RE = { grade: /filter\(\s*'cgrade'/, lens: /filter\(\s*'clens'/ };
  const codeOfL = (d, L) => { try { return d.codeOf(L.id).code || ''; } catch { return ''; } };
  async function findLayers(d = D()) {
    // (by its name first, then by its code; never the bottom layer: a filter there has nothing to change)
    const out = { grade: null, lens: null };
    const list = d.layers().layers;
    for (const [kind, name] of [['grade', NAME.grade], ['lens', NAME.lens]]) out[kind] = list.find((L, i) => i > 0 && L.name === name && RE[kind].test(codeOfL(d, L))) || null;
    for (const [i, L] of list.entries()) {
      if (!i || L === out.grade || L === out.lens) continue;
      const code = codeOfL(d, L);
      if (!out.grade && RE.grade.test(code)) out.grade = L; else if (!out.lens && RE.lens.test(code)) out.lens = L;
    }
    return out;
  }
  const valuesOf = (d, L, kind) => { const sl = d.sliders(L.id)?.sliders || []; const v = G.defaults(kind); for (const s of sl) if (s.key in v) v[s.key] = s.value; return v; };
  // the layer for kind, made when missing (lens goes right under the grade: the two draw as one pass)
  async function ensure(kind, values = {}, d = D()) {
    const have = await findLayers(d);
    if (have[kind]) return have[kind];
    const all = d.layers().layers;
    let position;
    if (kind === 'lens' && have.grade) position = all.findIndex((x) => x.id === have.grade.id) + 1;
    await d.addLayer({ name: NAME[kind], code: G.code(kind, values, { luts: lutNames() }), ...(position ? { position } : {}) }, 1);
    return (await findLayers(d))[kind];
  }
  // clips: the spec kept on the clip ({ grade: changed values, lens, name })
  const SEQ = () => (typeof ThreeSeq !== 'undefined' ? ThreeSeq : null);
  function clipSpec(t) {
    const e = SEQ()?.edit; if (!e) return null;
    if (t.seq) return e.seq?.cgrade || null;
    const find = (list) => { for (const c of list || []) { if (c.id === t.clip) return c; } return null; };
    const c = find(e.clips) || (e.tracks || []).flatMap((k) => k.items || []).find((x) => x.id === t.clip);
    return c?.cgrade || null;
  }
  function clipValues(t, kind) { const s = clipSpec(t); return kind === 'lens' ? (s?.lens ? { ...G.defaults('lens'), ...s.lens } : G.defaults('lens')) : { ...G.defaults('grade'), ...(s?.grade || {}) }; }
  function writeClip(t, { grade, lens, name = null }) {
    const g = G.changed('grade', grade || {}); const l = lens ? G.changed('lens', lens) : {};
    const has = Object.keys(g).length || Object.keys(l).length;
    const spec = has ? { grade: g, ...(Object.keys(l).length ? { lens: l } : {}), name: name || G.describe(grade, lens) } : null;
    return SEQ().setCGrade(spec, t.seq ? { all: true } : { ids: [t.clip] });
  }

  // ---------- changing it ----------
  // values: { key: value } for one kind (grade | lens); set from the panel (live, like a slider move: Keep / closing
  // the panel writes them into the layer's code) or from chat (written at once: persist)
  let pend = null; let pendT = 0;
  async function set(values, { kind = 'grade', target = 'lab', persist = false } = {}) {
    const clean = {};
    for (const [k, v] of Object.entries(values)) { const x = G.valueFor(kind, k, v, { luts: lutNames() }); if (x !== undefined) clean[k] = x; }
    if (!Object.keys(clean).length) throw new Error(`Nothing to set (${Object.keys(values).join(', ') || 'no values'})`);
    if (isClip(target)) {
      const cur = { grade: clipValues(target, 'grade'), lens: clipSpec(target)?.lens ? clipValues(target, 'lens') : null };
      if (kind === 'lens') cur.lens = { ...(cur.lens || G.defaults('lens')), ...clean }; else cur.grade = { ...cur.grade, ...clean };
      writeClip(target, cur);
      return clean;
    }
    const d = await lab();
    const L = await ensure(kind, clean, d);
    if (!L) throw new Error('Could not add the grade layer.');
    if ('lut' in clean) await lutOptionCheck(d, L, clean.lut);
    d.sliders(L.id, clean);
    if (persist) await keep(kind);
    return clean;
  }
  // a LUT the layer's choice list doesn't have yet (imported after the layer was made): the code gets the new list
  async function lutOptionCheck(d, L, name) {
    const code = d.codeOf(L.id).code || '';
    if (name === 'none' || code.includes(`'${name}'`)) return;
    const v = { ...valuesOf(d, L, 'grade'), lut: name };
    await d.updateLayer(L.id, { code: G.code('grade', v, { luts: lutNames() }) }, 1);
  }
  // the panel's live moves → the layer's code (one re-run; only when something changed)
  async function keep(kind = null) {
    const d = D(); if (!d) return false;
    const have = await findLayers(d); let n = 0;
    for (const k of kind ? [kind] : ['grade', 'lens']) {
      const L = have[k]; if (!L) continue;
      const now = codeOfL(d, L);
      if (!RE[k].test(now)) continue; // (only ever into a grade layer's own code)
      const code = G.code(k, valuesOf(d, L, k), { luts: lutNames() });
      if (code !== now) { await d.updateLayer(L.id, { code }, 0.6); n += 1; }
    }
    return n;
  }
  async function applyPreset(id, { target = 'lab', amount = null } = {}) {
    const pv = G.presetValues(id);
    if (!pv) throw new Error(`No grade preset "${id}". Presets: ${G.PRESETS.map((p) => p.id).join(', ')}`);
    if (amount != null) pv.grade.amount = Math.max(0, Math.min(1, amount));
    if (isClip(target)) { writeClip(target, { grade: pv.grade, lens: pv.lens, name: pv.preset.name }); return pv.preset; }
    const d = await lab();
    const have = await findLayers(d);
    // the grade's code written at once (persisted), the lens made / updated / turned off to match
    if (have.grade) await d.updateLayer(have.grade.id, { code: G.code('grade', pv.grade, { luts: lutNames() }) }, 1);
    else await ensure('grade', pv.grade, d);
    if (pv.lens) {
      const h2 = await findLayers(d);
      if (h2.lens) await d.updateLayer(h2.lens.id, { code: G.code('lens', pv.lens) }, 1); else await ensure('lens', pv.lens, d);
    } else if (have.lens) { d.sliders(have.lens.id, { amount: 0 }); await keep('lens'); }
    refreshPanel();
    return pv.preset;
  }
  async function setLut(name, amt = null, { target = 'lab' } = {}) {
    await loadLuts();
    const n = String(name || 'none').toLowerCase();
    const lut = n === 'none' || n === 'off' ? 'none' : allLuts().find((x) => x === n) || allLuts().find((x) => x.includes(n.replace(/\s+/g, '-')));
    if (!lut) throw new Error(`No LUT "${name}". LUTs: ${allLuts().join(', ')}`);
    await set({ lut, ...(amt != null ? { lutMix: amt } : {}) }, { target, persist: !isClip(target) });
    refreshPanel();
    return lut;
  }
  async function off({ target = 'lab' } = {}) {
    if (isClip(target)) { SEQ().setCGrade(null, target.seq ? { all: true } : { ids: [target.clip] }); return true; }
    const d = await lab(); const have = await findLayers(d); let n = 0;
    for (const L of [have.grade, have.lens]) if (L) { await d.removeLayer(L.id); n += 1; }
    refreshPanel();
    return n;
  }
  // the whole grade, as a .cube (its color part: vignette, grain and bars are places on the picture, not colors)
  async function bake({ target = 'lab', N = 33 } = {}) {
    const d = await lab();
    let arg = '';
    if (isClip(target)) arg = `{ N: ${N}, P: ${JSON.stringify(clipValues(target, 'grade'))} }`;
    else { const have = await findLayers(d); if (!have.grade) throw new Error('No ◐ Grade in this scene yet (/grade preset blockbuster, or right-click the preview › ✨ Look & motion › ◐ Grade).'); arg = `{ N: ${N}, layer: ${JSON.stringify(have.grade.id)} }`; }
    const r = await d.evalInSketch(`return window.__grade.bake(${arg})`);
    if (!r?.ok) throw new Error(r?.error || 'The preview did not answer');
    return { N: r.value.N, data: b64ToF32(r.value.data) };
  }
  async function exportCube(path = null, { target = 'lab', N = 33, title = null } = {}) {
    const lut = await bake({ target, N });
    const sk = ThreeLab.scenes?.current?.()?.name || 'Hearth';
    const name = title || `${sk} grade`;
    const text = G.writeCube({ title: name, N: lut.N, data: lut.data });
    const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'grade';
    if (!path) {
      const dir = WinMac.join(await window.hub.fs.home(), 'Hearth exports');
      path = WinMac.join(dir, `${safe}.cube`); // (round 31, winmac)
    }
    await window.hub.fs.write(path, text);
    return { path, N: lut.N, size: text.length };
  }
  async function exportCubeDialog(opts = {}) {
    const lut = await bake(opts);
    const text = G.writeCube({ title: 'Hearth grade', N: lut.N, data: lut.data });
    const p = await window.hub.saveFile({ defaultPath: 'Hearth grade.cube', filters: [{ name: 'LUT (.cube)', extensions: ['cube'] }], content: text });
    if (p) toast(`Grade saved as a LUT: ${p.split(/[\\/]/).pop()} (${lut.N}³, for Premiere / Resolve)`, { timeout: 5000, action: { label: 'Show', fn: () => window.hub.fs.reveal?.(p) } });
    return p;
  }
  async function state({ target = 'lab' } = {}) {
    if (isClip(target)) { const s = clipSpec(target); return { target, grade: clipValues(target, 'grade'), lens: s?.lens ? clipValues(target, 'lens') : null, on: Boolean(s) }; }
    const d = D(); if (!d) return { target, on: false };
    const have = await findLayers(d);
    return { target, on: Boolean(have.grade || have.lens), grade: have.grade ? valuesOf(d, have.grade, 'grade') : null, lens: have.lens ? valuesOf(d, have.lens, 'lens') : null, layers: { grade: have.grade?.name || null, lens: have.lens?.name || null } };
  }

  // ---------- the panel ----------
  const TABS = [['tone', 'Tone'], ['wheels', 'Wheels'], ['curves', 'Curves'], ['hsl', 'HSL'], ['color', 'Color'], ['lut', 'LUT'], ['film', 'Film'], ['lens', 'Lens'], ['scopes', 'Scopes']];
  const P = { root: null, body: null, tab: store.get('three.grade.tab', 'tone'), target: 'lab', vals: { grade: null, lens: null }, dirty: false, scopeT: 0, scopeMode: store.get('three.grade.scope', 'wave'), curve: 'L' };
  const isOpen = () => Boolean(P.root?.isConnected);
  const tgtLabel = () => (P.target === 'lab' ? 'this scene' : P.target.seq ? 'the whole sequence' : 'this clip');
  async function open({ clip = null, seq = false, tab = null } = {}) {
    await lab();
    const host = ThreeLab.scenes?.previewHost?.();
    if (!host) throw new Error('The Lab preview is not up.');
    P.target = clip ? { clip } : seq ? { seq: true } : 'lab';
    if (tab) P.tab = tab;
    await loadLuts();
    if (!P.root) build();
    if (!P.root.isConnected) host.append(P.root);
    await refreshPanel();
    return true;
  }
  async function close() {
    clearTimeout(P.scopeT); P.scopeT = 0;
    const was = P.target;
    P.root?.remove();
    if (P.dirty && was === 'lab') { P.dirty = false; await keep().catch(() => {}); }
  }
  const toggle = (o) => (isOpen() ? (close(), false) : open(o));
  function build() {
    const tabs = el('div', { class: 'cg-tabs', attrs: { role: 'tablist' } }, TABS.map(([id, label]) => el('button', { type: 'button', class: 'cg-tab', dataset: { tab: id }, text: label, on: { click: () => { P.tab = id; store.set('three.grade.tab', id); render(); } } })));
    P.body = el('div', { class: 'cg-body' });
    P.title = el('span', { class: 'cg-target' });
    P.amount = el('input', { type: 'range', min: '0', max: '1', step: '0.01', class: 'cg-amt', title: 'Grade amount (0 = off, costs nothing)', on: { input: (e) => change('grade', 'amount', Number(e.target.value)) } });
    P.root = el('div', { class: 'cg-panel', attrs: { tabindex: '-1', 'aria-label': 'Grade' }, on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }, contextmenu: (e) => e.stopPropagation() } },
      el('div', { class: 'cg-head' },
        el('b', { class: 'cg-title', text: '◐ Grade' }), P.title, el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'cg-btn', text: 'Presets ▾', title: 'A whole grade in one click', on: { click: (e) => presetMenu(e) } }),
        el('button', { type: 'button', class: 'cg-btn', text: '⋯', title: 'LUTs in and out, reset, turn off', on: { click: (e) => moreMenu(e) } }),
        el('button', { type: 'button', class: 'cg-btn', text: '✕', title: 'Close (Esc): your moves are kept in the scene', on: { click: () => close() } })),
      tabs, P.body,
      el('div', { class: 'cg-foot' }, el('span', { text: 'Amount' }), P.amount));
  }
  async function refreshPanel() {
    if (!isOpen()) return;
    const st = await state({ target: P.target });
    P.vals.grade = st.grade || G.defaults('grade');
    P.vals.lens = st.lens || G.defaults('lens');
    P.title.textContent = `${tgtLabel()} · ${st.on ? G.describe(P.vals.grade, st.lens) : 'no grade yet'}`;
    P.amount.value = String(P.vals.grade.amount ?? 1);
    render();
  }
  // a move in the panel: the value in the panel at once, the layer (or the clip) a frame later
  let flushT = 0; let clipT = 0;
  function change(kind, key, v) {
    P.vals[kind][key] = v;
    P.dirty = true;
    if (isClip(P.target)) { clearTimeout(clipT); clipT = setTimeout(() => { try { writeClip(P.target, { grade: P.vals.grade, lens: P.vals.lens }); } catch (e) { err(e); } }, 250); return; }
    pend = pend || { grade: {}, lens: {} }; pend[kind][key] = v;
    if (flushT) return;
    flushT = requestAnimationFrame(() => {
      flushT = 0; const p = pend; pend = null;
      for (const k of ['grade', 'lens']) if (Object.keys(p[k]).length) set(p[k], { kind: k }).catch(err);
    });
    clearTimeout(pendT); pendT = setTimeout(() => { P.title.textContent = `${tgtLabel()} · ${G.describe(P.vals.grade, P.vals.lens)}`; }, 300);
  }
  const fmt = (x) => (Math.abs(x) >= 10 ? String(Math.round(x)) : (Math.round(x * 100) / 100).toString());
  function slider(kind, key, label = null) {
    const s = G.specOf(kind)[key];
    const out = el('output', { text: fmt(P.vals[kind][key]) });
    const inp = el('input', { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step || (s.max - s.min) / 200), value: String(P.vals[kind][key]),
      on: { input: (e) => { const v = Number(e.target.value); out.textContent = fmt(v); change(kind, key, v); }, dblclick: () => { inp.value = String(s.value); out.textContent = fmt(s.value); change(kind, key, s.value); } } });
    return el('label', { class: 'cg-row', title: 'Double-click: back to its start' }, el('span', { text: label || s.label }), inp, out);
  }
  function color(kind, key) {
    const s = G.specOf(kind)[key];
    return el('label', { class: 'cg-row' }, el('span', { text: s.label }), el('input', { type: 'color', value: P.vals[kind][key], on: { input: (e) => change(kind, key, e.target.value) } }));
  }
  function chips(kind, key, list, names = {}) {
    return el('div', { class: 'cg-chips' }, list.map((x) => el('button', { type: 'button', class: `cg-chip${P.vals[kind][key] === x ? ' on' : ''}`, text: names[x] || x, on: { click: (e) => { change(kind, key, x); e.currentTarget.parentNode.querySelectorAll('.cg-chip').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } } })));
  }
  function render() {
    if (!P.body) return;
    P.root.querySelectorAll('.cg-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === P.tab));
    clearTimeout(P.scopeT); P.scopeT = 0;
    const V = P.vals; const g = 'grade'; const l = 'lens';
    const parts = {
      tone: () => [chips(g, 'tone', G.TONES, G.TONE_NAMES), slider(g, 'exposure'), slider(g, 'contrast'), slider(g, 'temp'), slider(g, 'tint')],
      wheels: () => [el('div', { class: 'cg-wheels' }, [['lift', 'Lift'], ['gamma', 'Gamma'], ['gain', 'Gain']].map(([w, name]) => wheel(w, name)))],
      curves: () => [curves()],
      hsl: () => [hueStrip(), slider(g, 'qRange'), slider(g, 'qSoft'), slider(g, 'qShift'), slider(g, 'qSat'), slider(g, 'qLum')],
      color: () => [slider(g, 'saturation'), slider(g, 'vibrance'), slider(g, 'split'), color(g, 'splitShadows'), color(g, 'splitHighlights'), slider(g, 'splitBalance')],
      lut: () => [lutList(), slider(g, 'lutMix')],
      film: () => [slider(g, 'vignette'), slider(g, 'vigSoft'), slider(g, 'grain'), slider(g, 'grainSize'), slider(g, 'grainLuma'), chips(g, 'bars', G.BARS), color(g, 'barColor')],
      lens: () => [slider(l, 'bloom'), slider(l, 'threshold'), slider(l, 'radius'), slider(l, 'halation'), color(l, 'halColor'), slider(l, 'streak'), slider(l, 'streakLen'), color(l, 'streakColor'), slider(l, 'ca'), slider(l, 'distort')],
      scopes: () => scopesView(),
    };
    void V;
    P.body.replaceChildren(...(parts[P.tab] || parts.tone)());
  }
  // a color wheel: drag the dot (angle = hue, distance = how much of it); the slider under it: darker / brighter
  function wheel(w, name) {
    const S = 76; const c = el('canvas', { class: 'cg-wheel', width: S * 2, height: S * 2, title: `${name}: drag toward a color · double-click to reset` });
    const draw = () => {
      const x = c.getContext('2d'); const R = S - 4;
      x.clearRect(0, 0, S * 2, S * 2);
      x.save(); x.scale(2, 2); x.translate(S / 2, S / 2);
      for (let a = 0; a < 360; a += 6) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R / 2, ((a - 3) * Math.PI) / 180, ((a + 4) * Math.PI) / 180); x.closePath(); x.fillStyle = `hsl(${a} 70% 45%)`; x.fill(); }
      const gr = x.createRadialGradient(0, 0, 0, 0, 0, R / 2); gr.addColorStop(0, '#20232a'); gr.addColorStop(1, '#20232a00'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, R / 2, 0, Math.PI * 2); x.fill();
      const hue = P.vals.grade[`${w}Hue`]; const amt = P.vals.grade[`${w}Amt`];
      const a = (hue * Math.PI) / 180; const px = Math.cos(a) * amt * (R / 2); const py = -Math.sin(a) * amt * (R / 2);
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.stroke();
      x.restore();
    };
    const at = (e) => { const r = c.getBoundingClientRect(); const dx = (e.clientX - r.left) / r.width - 0.5; const dy = (e.clientY - r.top) / r.height - 0.5; const R = (S - 4) / (S * 2); const amt = Math.min(1, Math.hypot(dx, dy) / R); let hue = (Math.atan2(-dy, dx) * 180) / Math.PI; if (hue < 0) hue += 360; change('grade', `${w}Hue`, Math.round(hue)); change('grade', `${w}Amt`, Math.round(amt * 100) / 100); draw(); };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); at(e); });
    c.addEventListener('pointermove', (e) => { if (c.hasPointerCapture(e.pointerId)) at(e); });
    c.addEventListener('dblclick', () => { change('grade', `${w}Amt`, 0); change('grade', `${w}Lum`, 0); draw(); render(); });
    draw();
    const lum = el('input', { type: 'range', min: '-1', max: '1', step: '0.01', value: String(P.vals.grade[`${w}Lum`]), title: `${name}: darker ← → brighter`, on: { input: (e) => change('grade', `${w}Lum`, Number(e.target.value)) } });
    return el('div', { class: 'cg-wheelbox' }, c, lum, el('small', { text: name }));
  }
  // curves: 3 points per channel (shadows, mids, highlights), dragged up / down
  function curves() {
    const W = 220; const H = 132; const c = el('canvas', { class: 'cg-curve', width: W * 2, height: H * 2, title: 'Drag a point up or down · double-click: straight again' });
    const ch = P.curve; const keys = [`c${ch}1`, `c${ch}2`, `c${ch}3`];
    const col = { L: '#e8e2d8', R: '#ff5a5a', G: '#5aff7a', B: '#5a9cff' }[ch];
    const draw = () => {
      const x = c.getContext('2d'); x.setTransform(2, 0, 0, 2, 0, 0); x.clearRect(0, 0, W, H);
      x.strokeStyle = '#ffffff1c'; x.lineWidth = 1; for (let i = 1; i < 4; i += 1) { x.beginPath(); x.moveTo((W * i) / 4, 0); x.lineTo((W * i) / 4, H); x.moveTo(0, (H * i) / 4); x.lineTo(W, (H * i) / 4); x.stroke(); }
      const ys = keys.map((k) => P.vals.grade[k]);
      x.strokeStyle = col; x.lineWidth = 1.6; x.beginPath();
      for (let i = 0; i <= 64; i += 1) { const t = i / 64; const y = curveAt(t, ...ys); if (i) x.lineTo(t * W, H - y * H); else x.moveTo(0, H - y * H); }
      x.stroke();
      ys.forEach((y, i) => { x.fillStyle = col; x.beginPath(); x.arc(((i + 1) / 4) * W, H - y * H, 4, 0, Math.PI * 2); x.fill(); });
    };
    let drag = -1;
    const yAt = (e) => { const r = c.getBoundingClientRect(); return Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); };
    c.addEventListener('pointerdown', (e) => { const r = c.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width; drag = Math.max(0, Math.min(2, Math.round(fx * 4) - 1)); c.setPointerCapture(e.pointerId); change('grade', keys[drag], Math.round(yAt(e) * 1000) / 1000); draw(); });
    c.addEventListener('pointermove', (e) => { if (drag < 0 || !c.hasPointerCapture(e.pointerId)) return; change('grade', keys[drag], Math.round(yAt(e) * 1000) / 1000); draw(); });
    c.addEventListener('pointerup', () => { drag = -1; });
    c.addEventListener('dblclick', () => { keys.forEach((k, i) => change('grade', k, (i + 1) / 4)); draw(); });
    draw();
    const tabs = el('div', { class: 'cg-chips' }, ['L', 'R', 'G', 'B'].map((k) => el('button', { type: 'button', class: `cg-chip${k === ch ? ' on' : ''}`, text: k === 'L' ? 'Luma' : k, on: { click: () => { P.curve = k; render(); } } })));
    return el('div', { class: 'cg-curves' }, tabs, c);
  }
  // the same curve as the shader's (cgCurve): Catmull-Rom through (0,0) (.25,a) (.5,b) (.75,c) (1,1)
  function curveAt(x, a, b, c) {
    const t = Math.max(0, Math.min(1, x)) * 4; const i = Math.min(Math.floor(t), 3); const f = t - i;
    const pts = [[-a, 0, a, b], [0, a, b, c], [a, b, c, 1], [b, c, 1, 2 - c]][i];
    const [p0, p1, p2, p3] = pts; const f2 = f * f; const f3 = f2 * f;
    return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (3 * p1 - p0 - 3 * p2 + p3) * f3);
  }
  function hueStrip() {
    const s = el('div', { class: 'cg-hue', title: 'Click the hue to change (skin ≈ 20°, sky ≈ 210°, foliage ≈ 100°)' });
    const mark = el('i'); s.append(mark);
    const place = () => { mark.style.left = `${(P.vals.grade.qHue / 360) * 100}%`; };
    s.addEventListener('pointerdown', (e) => { const r = s.getBoundingClientRect(); change('grade', 'qHue', Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 360)); place(); });
    place();
    return el('div', { class: 'cg-row cg-huerow' }, el('span', { text: 'Hue' }), s);
  }
  function lutList() {
    const cur = P.vals.grade.lut;
    const row = (id, name, hint) => el('button', { type: 'button', class: `cg-lut${cur === id ? ' on' : ''}`, title: hint || '', on: { click: () => { change('grade', 'lut', id); if (!isClip(P.target)) setLut(id).catch(err); render(); } } }, el('span', { text: name }));
    return el('div', { class: 'cg-luts' },
      row('none', 'None', 'No LUT'),
      ...G.PACK.map(([id, name, desc]) => row(id, name, desc)),
      ...(LUTS.list || []).map((x) => row(x.name, `⬚ ${x.title || x.name}`, `Imported ${x.was === '1d' ? '1D' : '3D'} .cube (${x.size})`)),
      el('button', { type: 'button', class: 'cg-lut add', text: '＋ Import .cube…', on: { click: () => pickCubes().then(() => refreshPanel()).catch(err) } }));
  }
  // ---------- scopes: a 96 × 54 read of the picture, 4 times a second while the tab shows ----------
  function scopesView() {
    const c = el('canvas', { class: 'cg-scope', width: 384, height: 216 });
    const modes = el('div', { class: 'cg-chips' }, [['wave', 'Waveform'], ['vector', 'Vectorscope'], ['hist', 'Histogram']].map(([id, name]) => el('button', { type: 'button', class: `cg-chip${P.scopeMode === id ? ' on' : ''}`, text: name, on: { click: () => { P.scopeMode = id; store.set('three.grade.scope', id); render(); } } })));
    const tick = async () => {
      P.scopeT = 0;
      if (!c.isConnected || document.hidden) return;
      try {
        const r = await D()?.evalInSketch('return window.__grade.scope(96, 54)');
        if (r?.ok && c.isConnected) { const s = atob(r.value); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i); drawScope(c, G.scopes(u, 96, 54), P.scopeMode); }
      } catch { /* the preview is busy: next time */ }
      if (c.isConnected) P.scopeT = setTimeout(tick, 250);
    };
    P.scopeT = setTimeout(tick, 30);
    return [modes, c];
  }
  function drawScope(c, s, mode) {
    const x = c.getContext('2d'); const W = c.width; const H = c.height;
    x.fillStyle = '#07090b'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#ffffff18'; x.lineWidth = 1;
    if (mode === 'hist') {
      const cols = ['#ff4a4a', '#4aff6a', '#4a8cff', '#e8e2d8'];
      let mx = 1; for (let k = 0; k < 4; k += 1) for (const v of s.hist[k]) mx = Math.max(mx, v);
      x.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k += 1) { x.fillStyle = `${cols[k]}66`; x.beginPath(); x.moveTo(0, H); s.hist[k].forEach((v, i) => x.lineTo((i / 63) * W, H - (Math.sqrt(v / mx)) * H * 0.95)); x.lineTo(W, H); x.fill(); }
      x.globalCompositeOperation = 'source-over';
    } else if (mode === 'vector') {
      const R = H / 2 - 6; const cx = W / 2; const cy = H / 2;
      x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos((123 * Math.PI) / 180) * R, cy - Math.sin((123 * Math.PI) / 180) * R); x.stroke(); // (the skin tone line)
      let mx = 1; for (const v of s.vec) mx = Math.max(mx, v);
      const k = (R * 2) / s.B;
      for (let y = 0; y < s.B; y += 1) for (let i = 0; i < s.B; i += 1) { const v = s.vec[y * s.B + i]; if (!v) continue; x.fillStyle = `rgba(150,255,170,${Math.min(1, 0.25 + Math.sqrt(v / mx))})`; x.fillRect(cx - R + i * k, cy - R + y * k, k, k); }
      x.fillStyle = '#ffffff88'; x.font = '10px system-ui';
      for (const t of G.TARGETS) x.fillText(t.name, cx - R + t.x * k - 6, cy - R + t.y * k + 4);
    } else {
      for (let i = 1; i < 4; i += 1) { x.beginPath(); x.moveTo(0, (H * i) / 4); x.lineTo(W, (H * i) / 4); x.stroke(); }
      let mx = 1; for (const v of s.wave) mx = Math.max(mx, v);
      const cw = W / s.w; const rh = H / s.B;
      for (let col = 0; col < s.w; col += 1) for (let b = 0; b < s.B; b += 1) { const v = s.wave[col * s.B + b]; if (!v) continue; x.fillStyle = `rgba(170,255,190,${Math.min(1, 0.2 + v / mx * 2)})`; x.fillRect(col * cw, H - (b + 1) * rh, cw, rh); }
    }
  }
  function presetMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, G.PRESETS.map((p) => ({ label: p.name, hint: p.desc, action: () => applyPreset(p.id, { target: P.target }).then(() => refreshPanel()).catch(err) })));
  }
  function moreMenu(e) {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, [
      { label: '＋ Import .cube LUTs…', hint: '1D or 3D', action: () => pickCubes().then(() => refreshPanel()).catch(err) },
      { label: '⇩ Export this grade as a .cube…', hint: 'Premiere · Resolve', action: () => exportCubeDialog({ target: P.target }).catch(err) },
      ...(P.target === 'lab' ? [{ label: '✓ Keep the moves in the scene', hint: 'also when you close', action: () => keep().then((n) => { P.dirty = false; toast(n ? 'Grade kept in the scene' : 'Nothing new to keep'); }).catch(err) }] : []),
      { label: '↺ Reset the grade', action: () => applyPreset('neutral', { target: P.target }).then(() => refreshPanel()).catch(err) },
      { label: '✕ Turn the grade off', hint: P.target === 'lab' ? 'removes the ◐ layers' : '', action: () => off({ target: P.target }).then(() => refreshPanel()).catch(err) },
      ...(lutNames().length ? [{ label: 'Imported LUTs', items: () => (LUTS.list || []).map((x) => ({ label: x.title || x.name, hint: 'remove', action: () => removeLut(x.name).then(() => refreshPanel()).catch(err) })) }] : []),
    ]);
  }

  // ---------- menus elsewhere: the preview's right-click, a sequence clip's ----------
  function previewItem() {
    return { label: '◐ Grade', hint: 'color · LUTs · film', items: () => [
      { label: '◐ Grade panel…', hint: 'color, film, lens, scopes', action: () => open().catch(err) },
      { label: 'Presets', items: () => G.PRESETS.map((p) => ({ label: p.name, hint: p.desc, action: () => applyPreset(p.id).then((x) => toast(`◐ ${x.name}`)).catch(err) })) },
      { label: 'LUT', items: () => [{ label: 'None', action: () => setLut('none').catch(err) }, ...G.PACK.map(([id, name]) => ({ label: name, action: () => setLut(id).catch(err) })), ...(LUTS.list || []).map((x) => ({ label: `⬚ ${x.title || x.name}`, action: () => setLut(x.name).catch(err) })), '-', { label: '＋ Import .cube…', action: () => pickCubes().catch(err) }] },
      { label: 'Scopes', hint: 'waveform · vectorscope', action: () => open({ tab: 'scopes' }).catch(err) },
      { label: '⇩ Export the grade as a .cube…', action: () => exportCubeDialog().catch(err) },
    ] };
  }
  function clipMenu(c, ids = [c.id]) {
    const t = { clip: c.id };
    const go = (fn) => () => Promise.resolve().then(fn).catch(err);
    return [
      { label: '◐ Grade panel for this clip…', action: go(() => open({ clip: c.id })) },
      ...G.PRESETS.filter((p) => p.id !== 'neutral').map((p) => ({ label: p.name, hint: p.desc, checked: c.cgrade?.name === p.name, action: go(() => { for (const id of ids) applyPreset(p.id, { target: { clip: id } }); }) })),
      '-', ...(c.cgrade ? [{ label: 'Use it for the whole sequence', hint: 'clips without their own', action: go(() => SEQ().setCGrade(clipSpec(t), { all: true })) }] : []),
      { label: '◐ Grade panel: whole sequence…', action: go(() => open({ seq: true })) },
      { label: 'No grade', checked: !c.cgrade, action: go(() => SEQ().setCGrade(null, { ids })) },
    ];
  }

  // ---------- the FX picker: a "Grade" tab (presets and LUTs) ----------
  const SW = { 'teal-orange': ['#1f6f8b', '#c98c5a', '#ffb35c'], 'bleach-bypass': ['#202325', '#8a8f90', '#e0e2e0'], 'kodak-warm': ['#3a2a22', '#d08a5c', '#ffe0b0'], 'fuji-fresh': ['#1d3b40', '#6fb08a', '#e8f4ee'], noir: ['#000000', '#777777', '#ffffff'], 'cross-process': ['#203a8a', '#9ec44a', '#fff27a'], 'day-for-night': ['#05101e', '#20406a', '#7a9ac0'], 'vintage-fade': ['#3a3030', '#b0907a', '#f0dcc0'], cyberpunk: ['#0d3a4a', '#c03ab0', '#ff9ae0'], 'golden-hour': ['#4a2a10', '#e0a040', '#ffe6a0'], 'arctic-blue': ['#1a2a3a', '#7a9ab0', '#e0f0ff'], 'matrix-green': ['#001a05', '#2a8a3a', '#b0ffb8'], sepia: ['#2a1a0a', '#a07850', '#f0dcb8'], 'film-print': ['#1a1a20', '#a08a7a', '#f4ead8'] };
  function pickerItems() {
    return [
      ...G.PRESETS.map((p) => ({ kind: 'grade', id: `p:${p.id}`, name: p.name, cat: 'Grade presets', desc: p.desc, tags: 'grade color film cinematic', colors: SW[p.grade.lut] || ['#222', '#888', '#eee'] })),
      ...G.PACK.map(([id, name, desc]) => ({ kind: 'grade', id: `l:${id}`, name: `LUT · ${name}`, cat: 'LUTs', desc, tags: 'lut cube color', colors: SW[id] })),
      ...(LUTS.list || []).map((x) => ({ kind: 'grade', id: `l:${x.name}`, name: `LUT · ${x.title || x.name}`, cat: 'LUTs', desc: `Imported .cube (${x.was === '1d' ? '1D' : '3D'})`, tags: 'lut cube imported', colors: ['#333', '#999', '#eee'] })),
    ];
  }
  async function pickerApply(it) {
    if (it.id.startsWith('p:')) { const p = await applyPreset(it.id.slice(2)); return `◐ Grade: ${p.name}`; }
    const n = await setLut(it.id.slice(2)); return `◐ LUT ${n}`;
  }
  function registerPicker() { if (typeof ThreeFX !== 'undefined' && ThreeFX.extend) ThreeFX.extend({ kind: 'grade', label: 'Grade', tab: ['grade', 'Grade', 'Cinematic grades and LUTs (the ◐ Grade panel: right-click the picture)'], items: pickerItems, apply: pickerApply, hint: () => 'Enter: apply to the scene (◐ Grade layer on top)' }); }

  // ---------- the two filters in the Layers ＋ picker / /fx / the director's filter list ----------
  function registerFilters() {
    if (typeof ThreeLayers === 'undefined' || ThreeLayers.FILTERS.some((t) => t.id === 'cinegrade')) return;
    const mk = (id, kind, name, cat, desc, tags) => { const t = { id, name, cat, type: G.TYPE[kind], desc, tags, spec: G.specOf(kind), pack: 'grade' }; Object.defineProperty(t, 'code', { get: () => G.code(kind, {}, { luts: lutNames() }), enumerable: true, configurable: true }); ThreeLayers.FILTERS.push(t); };
    mk('cinegrade', 'grade', 'Grade (cinematic)', 'Color', 'Tone mapping (ACES, AgX, Filmic…), exposure, white balance, lift / gamma / gain, curves, HSL, LUT, vignette, grain, letterbox', 'grade lut aces agx filmic curves wheels letterbox cinematic');
    mk('cinelens', 'lens', 'Film & lens', 'Film', 'Bloom with threshold, halation, anamorphic streaks, chromatic aberration, lens distortion', 'bloom halation anamorphic chromatic aberration distortion lens');
  }
  function init() { registerFilters(); registerPicker(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, close, toggle, isOpen, set, keep, applyPreset, setLut, off, bake, exportCube, exportCubeDialog, importCube, removeLut, pickCubes, luts: async () => { await loadLuts(); return { pack: G.PACK_IDS, imported: (LUTS.list || []).slice() }; }, state, onPage, previewItem, clipMenu, findLayers, curveAt, refresh: refreshPanel, get panel() { return P.root; } };
})();
window.LabGrade = LabGrade;
