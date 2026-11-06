// 🧩 Effect building blocks (round 134, blocks134): ready-made pieces combined into a look, by hand or by the AI.
// The pieces are the Lab's own (tools/three-blocks-core.js names them): ◇ shader starters and ✦ particle presets as
// generators, the FX pack's filter layers as effects. This file is the folded panel (lazy group "blocks"):
//   · 🧩 Blocks in the toolbar's ⋯ and in ✦ More opens a small card over the preview; ✕ / Esc folds it away
//   · each block: a LIVE thumbnail (rendered on one small backstage stage, ThreeBackstage.make, while the card is open:
//     the tiles are drawn again one after another, so they move), its name and one line
//   · a click adds it right above the selected layer, as its own layer (a generator) or a filter layer (an effect),
//     its color sliders in the project's palette (◆ Project look's, else the scene's): ONE undo step (Ctrl/⌘+Z in the
//     Lab, the toast's Undo)
//   · the chain (the scene's 🧩 layers, bottom → top): drag a row to reorder; each change is one undo step
//   · ✦ Combine for me: type a mood; the cost is on the button and in the confirm; the Three Director gets the blocks
//     and builds 3–5 of them with one three_do blocks call (its whole reply is one undo step: LabTxn, plus Ctrl/⌘+Z)
//   · 💾 Save as my block: the chain (its blocks, order and slider values) becomes a block of your own, listed under
//     "Mine" with its own thumbnail; kept in kv three-blocks (it syncs with "Projects & scenes")
// Nothing is sent to an AI without a click; nothing runs while the card is closed (the stage goes with it).
const LabBlocks = (() => {
  const C = () => BlocksCore;
  const KV = 'three-blocks';
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const dOn = () => Lab()?.director || null;
  const hk = () => Lab()?.stageHooks || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  const S = { pop: null, mine: null, mineOk: true, thumbs: new Map(), stage: null, sk: null, looping: false, drag: null, undo: null, moodOpen: false };
  const stats = { added: 0, built: 0, undos: 0, reorders: 0, asked: 0, saved: 0, thumbs: 0, aiBuilt: 0 };

  // ---------- a block's code and sliders ----------
  const tplOf = (id) => [...ThreeLayers.TEMPLATES, ...ThreeLayers.FILTERS].find((t) => t.id === id) || null;
  const specOfItems = (items) => items.filter((it) => it.key != null).map((it) => ({ key: it.key, kind: it.kind, value: it.orig, ...(it.range && Number.isFinite(it.range.min) ? { min: it.range.min, max: it.range.max } : {}), ...(it.options?.length ? { options: it.options } : {}) }));
  function specOf(b) {
    const t = tplOf(b.src);
    if (!t) return [];
    try { return specOfItems(ThreeTweaks.scan(t.code).items); } catch { return []; }
  }
  function codeFor(b, values = {}, palette = []) {
    const t = tplOf(b.src);
    if (!t) throw new Error(`The block "${b.name}" needs ${b.src}, which isn't in this Lab.`);
    const code = t.code;
    const items = ThreeTweaks.scan(code).items;
    const spec = specOfItems(items);
    const v = { ...C().paletteValues(spec, palette), ...C().clampValues(spec, values) };
    if (!Object.keys(v).length) return code;
    return ThreeTweaks.applyValues(code, items, items.map((it) => (it.key != null && it.key in v ? v[it.key] : it.orig)));
  }
  async function palette(d = dOn()) {
    if (d && d === dOn()) {
      try {
        if (typeof LabProjLook === 'undefined' && window.Lazy) await Lazy.load('projlook');
        const p = window.LabProjLook?.here?.();
        const cols = p && LabProjLook.paletteOf(p)?.colors;
        if (cols?.length) return cols;
      } catch { /* no project: the scene's own */ }
      try { return d.refs?.palette?.() || []; } catch { return []; }
    }
    try { return Lab()?.scenes?.get(d?.route?.sketchId)?.palette || []; } catch { return []; }
  }

  // ---------- my blocks (kv three-blocks: { v: 1, blocks: [{ id, name, chain: [{ block, values }], at }] }) ----------
  async function mineList({ fresh = false } = {}) {
    if (S.mine && !fresh) return S.mine;
    let r = null;
    try { r = await window.hub.kvGet(KV, null, { status: true }); } catch { r = { state: 'unreadable' }; }
    if (r?.state === 'unreadable') { S.mineOk = false; S.mine = S.mine || []; return S.mine; }
    S.mineOk = true;
    S.mine = C().cleanMine(r?.value?.blocks);
    return S.mine;
  }
  async function writeMine(list) {
    if (!S.mineOk) throw new Error('Your saved blocks could not be read, so nothing is saved over them. Try again in a moment.');
    await window.hub.kvSet(KV, { v: 1, blocks: list });
    S.mine = list;
  }

  // ---------- the chain: the scene's 🧩 layers (bottom → top) ----------
  const isBlock = (L) => Boolean(C().blockOfName(L?.name, S.mine || []));
  function chain() {
    const h = hk(); if (!h?.layers) return [];
    return h.layers().filter(isBlock).map((L) => ({ id: L.id, name: L.name, block: C().blockOfName(L.name, S.mine || []) }));
  }

  // ---------- one undo step for a change on the scene on screen ----------
  async function stepUndo(sid, before, label) {
    let done = false;
    const undo = () => {
      if (done) return false;
      if (hk()?.sketchId() !== sid) { toast('That was in another scene', { timeout: 1800 }); return false; }
      done = true; stats.undos += 1;
      LabTxn.restore(before).then(() => { paint(); toast(`↶ ${label} undone`, { timeout: 1400 }); }).catch(err);
      return true;
    };
    window.LabDirect?.push?.(null, label, () => undo());
    S.undo = undo;
    return undo;
  }

  // ---------- build: blocks added as layers, in order, above the selected layer ----------
  // d: the director of the scene (on screen: ThreeLab.director; a chat's scene backstage: its own); one undo step
  async function build(steps, { d = dOn(), label = '', quiet = false } = {}) {
    if (!d) throw new Error('Open the Lab first.');
    if (!steps.length) throw new Error('No blocks to add.');
    const here = d === dOn();
    const sid = here ? hk()?.sketchId() : null;
    const before = here && typeof LabTxn !== 'undefined' ? await LabTxn.snap(sid) : null;
    const pal = await palette(d);
    const made = [];
    for (const s of steps) {
      const b = C().byId(s.block);
      const code = codeFor(b, s.values, pal);
      let position;
      if (here) { const ids = hk().layers().map((L) => L.id); const i = ids.indexOf(hk().layer()?.id); position = (i < 0 ? ids.length - 1 : i) + 2; }
      const r = await d.addLayer({ name: C().layerName(b), code, ...(position ? { position } : {}) }, 0.3);
      made.push(r?.added || C().layerName(b));
    }
    stats.built += 1; stats.added += made.length;
    const words = label || (made.length === 1 ? `Added ${made[0]}` : `Added ${made.length} blocks`);
    if (here && before) {
      const undo = await stepUndo(sid, before, words);
      if (!quiet) toast(`${words} · one Ctrl/⌘+Z undoes`, { timeout: 4000, action: { label: 'Undo', fn: undo } });
    }
    paint();
    return { layers: made, palette: pal.length ? pal : null };
  }
  async function add(id, o = {}) {
    const all = await mineList();
    const p = C().plan([id], { custom: all });
    if (!p.steps.length) throw new Error(p.errors[0] || `No block "${id}"`);
    const m = all.find((x) => x.id === id);
    return build(p.steps, { ...o, label: m ? `Added my block "${m.name}" (${p.steps.length})` : '' });
  }

  // ---------- reorder (drag in the chain) ----------
  async function reorder(ids) {
    const gh = Lab()?.groupsHost; const h = hk();
    if (!gh || !h) throw new Error('Open the Lab first.');
    const all = gh.layers();
    const slots = all.map((L, i) => (isBlock(L) ? i : -1)).filter((i) => i >= 0);
    const byId = new Map(all.map((L) => [L.id, L]));
    const order = ids.map((x) => byId.get(x)).filter((L) => L && isBlock(L));
    if (order.length !== slots.length || new Set(order).size !== order.length) throw new Error('The chain changed: open 🧩 Blocks again.');
    if (order.every((L, k) => all[slots[k]] === L)) return false;
    const sid = h.sketchId();
    const before = await LabTxn.snap(sid);
    const next = all.slice();
    slots.forEach((pos, k) => { next[pos] = order[k]; });
    gh.commit(next);
    stats.reorders += 1;
    await stepUndo(sid, before, 'Reordered the 🧩 chain');
    paint();
    return true;
  }

  // ---------- 💾 save the chain as my block ----------
  async function saveMine(name) {
    const d = dOn(); const ch = chain();
    if (!d || !ch.length) throw new Error('Add a few blocks first: the chain is what gets saved.');
    const all = await mineList({ fresh: true });
    const steps = ch.filter((x) => C().byId(x.block.id)).map((x) => {
      const b = x.block;
      let now = [];
      try { now = d.sliders(x.id).sliders || []; } catch { now = []; }
      const keys = new Set(specOf(b).map((s) => s.key));
      return { block: b.id, values: Object.fromEntries(now.filter((s) => keys.has(s.key)).map((s) => [s.key, s.value])) };
    });
    const m = C().mine(name, steps, all);
    await writeMine([...all, m]);
    stats.saved += 1;
    toast(`💾 Saved "${m.name}" under Mine in 🧩 Blocks`, { timeout: 2500 });
    paint();
    return m;
  }
  async function removeMine(id) {
    const all = await mineList({ fresh: true });
    const m = all.find((x) => x.id === id); if (!m) return false;
    await writeMine(all.filter((x) => x.id !== id));
    S.thumbs.delete(id);
    toast(`Removed "${m.name}"`, { timeout: 5000, action: { label: 'Undo', fn: () => mineList({ fresh: true }).then((l) => writeMine([...l.filter((x) => x.id !== m.id), m])).then(paint).catch(err) } });
    paint();
    return true;
  }

  // ---------- ✦ Combine for me (the Three Director, cost first, sent only on a click) ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || H.agents().find((a) => a.threeTools) || null;
  async function askText(mood) {
    const custom = await mineList();
    const blocks = C().BLOCKS.map((b) => ({ ...b, spec: specOf(b) }));
    return C().askText({ mood, blocks, palette: await palette(), selected: hk()?.layer()?.name || '', custom });
  }
  async function cost(mood = 'a mood') { return C().estimate((await askText(mood)).length); }
  async function combine(mood, { confirm = true } = {}) {
    const m = String(mood || '').trim();
    if (!m) throw new Error('Type a mood first, like "dreamy underwater pulse".');
    const dir = directorOf();
    if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    const text = await askText(m);
    const c = C().estimate(text.length);
    if (confirm && !(await Modal.confirm('✦ Combine blocks for this mood?', `${dir.name} gets the ${C().BLOCKS.length} blocks and their sliders (≈${c.toLocaleString()} tokens with its reply) and builds 3–5 of them for "${m}", in order, with slider values. Its whole answer is one undo step (Ctrl/⌘+Z, or ↶ in the dock).`, { ok: `Combine (≈${c.toLocaleString()} tokens)` }))) return false;
    stats.asked += 1;
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    const sid = hk()?.sketchId();
    if (sid) window.LabChatLink?.chatFor?.(dir.id, sid);
    await Native.send(dir.id, text);
    return true;
  }

  // ---------- three_do blocks {chain: [{block, values}]} (the AI) ----------
  async function op(args = {}, d, ctx = {}) {
    try {
      const custom = await mineList();
      const list = args.chain ?? args.blocks;
      if (!Array.isArray(list) || !list.length || /^(list|info|help)$/i.test(String(args.op || ''))) {
        return { ok: true, value: { blocks: C().BLOCKS.map((b) => `${b.id} (${b.kind === 'gen' ? 'generator' : 'effect'}): ${b.desc} · ${specOf(b).slice(0, 6).map((s) => s.key).join(', ')}`), mine: custom.map((c) => `${c.id}: ${c.chain.map((s) => s.block).join(' → ')}`), how: 'chain: [{block, values}] bottom → top, above the selected layer; one undo step' } };
      }
      const p = C().plan(list, { custom });
      if (!p.steps.length) return { ok: false, error: `No blocks to build (${p.errors.join('; ')}). Blocks: ${C().BLOCKS.map((b) => b.id).join(', ')}.` };
      const r = await build(p.steps, { d, label: `✦ Combined ${p.steps.length} blocks`, quiet: false });
      stats.aiBuilt += 1;
      return { ok: true, value: { added: r.layers, ...(p.errors.length ? { skipped: p.errors } : {}), undo: 'one step (Ctrl/⌘+Z in the Lab, or three_do undo)' } };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ---------- live thumbnails on one small backstage stage ----------
  const BASE = 'shader-plasma'; // what an effect is shown on (a generator is shown alone)
  function ensureStage() {
    if (S.stage) return S.stage;
    if (typeof ThreeBackstage === 'undefined' || !ThreeBackstage.make) return null;
    const sk = { id: 'blocks-thumbs', name: '🧩 Blocks', layers: [], updatedAt: 0 };
    const scenes = { get: (id) => (id === sk.id ? sk : null), layersOf: (x) => x.layers, selectedOf: () => null, frameOf: () => null, setFrame() {}, songOf: () => null, timelineOf: () => null, changed() {}, create() { throw new Error('thumbnails'); } };
    S.sk = sk;
    S.stage = ThreeBackstage.make({ long: 192, cap: 24, scenes, idleMs: 120000 });
    return S.stage;
  }
  function codesOf(key) {
    const b = C().byId(key);
    const steps = b ? [{ block: b.id, values: {} }] : ((S.mine || []).find((x) => x.id === key)?.chain || []);
    if (!steps.length) return [];
    const first = C().byId(steps[0].block);
    const codes = steps.map((s) => codeFor(C().byId(s.block), s.values, S.pal || []));
    return first?.kind === 'fx' ? [tplOf(BASE)?.code, ...codes].filter(Boolean) : codes;
  }
  async function thumbOf(key) {
    const st = ensureStage(); if (!st) return null;
    const codes = codesOf(key); if (!codes.length) return null;
    S.sk.layers = codes.map((code, i) => ThreeLayers.defaults({ id: `bk${i}`, name: `b${i}`, code, slot: i, color: ThreeLayers.COLORS[i % ThreeLayers.COLORS.length] }));
    S.sk.updatedAt = Date.now();
    await st.handle('three_console', {}, { sketchId: S.sk.id });
    await sleep(220);
    return st.thumb(160);
  }
  async function thumbLoop() {
    if (S.looping) return;
    S.looping = true;
    try {
      while (S.pop?.isConnected) {
        const tiles = [...S.pop.querySelectorAll('.bk-tile')];
        for (const t of tiles) {
          if (!S.pop?.isConnected) break;
          if (!t.isConnected) continue;
          const url = await thumbOf(t.dataset.id).catch(() => null);
          if (!url || !S.pop?.isConnected) continue;
          S.thumbs.set(t.dataset.id, url);
          stats.thumbs += 1;
          const img = S.pop.querySelector(`.bk-tile[data-id="${CSS.escape(t.dataset.id)}"] img`);
          if (img) { img.src = url; img.dataset.n = String((Number(img.dataset.n) || 0) + 1); }
        }
        await sleep(300);
      }
    } finally { S.looping = false; }
  }

  // ---------- the card ----------
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve().then(fn).catch(err); } } });
  function tile(key, name, desc, mineB = null) {
    const img = el('img', { class: 'bk-img', alt: '', draggable: false });
    if (S.thumbs.has(key)) img.src = S.thumbs.get(key);
    return el('div', { class: `bk-tile${mineB ? ' bk-mine' : ''}`, dataset: { id: key }, title: `${desc}\nClick: add it above the selected layer (one undo)`, attrs: { role: 'button', tabindex: '0' },
      on: { click: () => add(key).catch(err), keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(key).catch(err); } } } },
    img, el('span', { class: 'bk-name', text: name }), el('small', { class: 'bk-desc', text: desc }),
    mineB ? el('button', { type: 'button', class: 'bk-x', text: '✕', title: `Remove "${name}" from Mine (Undo in the toast)`, on: { click: (e) => { e.stopPropagation(); removeMine(key).catch(err); } } }) : null);
  }
  function chainRows() {
    const ch = chain();
    if (!ch.length) return el('div', { class: 'bk-empty hint', text: 'Click a block to start a chain. Drag the rows here to reorder it.' });
    const list = el('ol', { class: 'bk-chain', attrs: { 'aria-label': 'The chain, bottom to top' } });
    ch.forEach((x, i) => {
      const row = el('li', { class: 'bk-row', draggable: true, dataset: { id: x.id, i: String(i) }, title: 'Drag to reorder (one undo per change)' },
        el('span', { class: 'bk-grip', text: '⋮⋮' }), el('span', { text: x.name }), el('small', { class: 'hint', text: x.block?.kind === 'gen' ? 'layer' : 'effect' }));
      row.addEventListener('dragstart', (e) => { S.drag = x.id; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id); } catch { /* synthetic */ } row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); S.drag = null; });
      row.addEventListener('dragover', (e) => { if (S.drag) { e.preventDefault(); row.classList.add('over'); } });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('over');
        const from = ch.findIndex((c) => c.id === S.drag); S.drag = null;
        if (from < 0 || from === i) return;
        reorder(C().reorder(ch.map((c) => c.id), from, i)).catch(err);
      });
      list.prepend(row); // top of the stack first, as in the Layers list
    });
    return list;
  }
  function paint() {
    const p = S.pop; if (!p) return;
    const mineL = S.mine || [];
    const grid = el('div', { class: 'bk-grid' }, C().BLOCKS.map((b) => tile(b.id, b.name, b.desc)));
    const mineGrid = mineL.length ? el('div', { class: 'bk-grid' }, mineL.map((m) => tile(m.id, m.name, m.chain.map((s) => C().byId(s.block)?.name).join(' → '), m))) : null;
    const ch = chain();
    const mood = el('input', { class: 'bk-mood', placeholder: 'a mood: dreamy underwater pulse', value: S.moodText || '', on: { input: (e) => { S.moodText = e.target.value; }, keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); combine(mood.value).catch(err); } } } });
    const go = btn('✦ Combine', 'One AI pass picks 3–5 blocks, their order and sliders (the cost is shown first; nothing is sent before you click)', () => combine(mood.value), 'primary small bk-go');
    cost().then((c) => { go.textContent = `✦ Combine · ≈${c.toLocaleString()} tokens`; }).catch(() => {});
    p.replaceChildren(
      el('div', { class: 'bk-h' }, el('b', { text: '🧩 Blocks' }), el('small', { class: 'hint', text: 'click to add · one undo each' }), el('span', { class: 'spacer' }), btn('✕', 'Fold away (Esc)', () => close(), 'ghost small bk-close')),
      grid,
      mineGrid ? el('div', { class: 'bk-sub hint', text: 'Mine' }) : null, mineGrid,
      el('div', { class: 'bk-sub hint', text: `The chain (${ch.length}) · top first` }), chainRows(),
      el('div', { class: 'bk-row2' },
        ch.length ? btn('💾 Save as my block', 'Keep this chain (blocks, order, sliders) as a block of your own: listed under Mine, synced like your recipes', async () => { const n = await Modal.prompt('Save the chain as my block', { value: '', placeholder: 'e.g. Underwater pulse' }); if (n) await saveMine(n); }, 'ghost small bk-save') : null,
        btn(S.moodOpen ? '✦ Combine for me ▾' : '✦ Combine for me…', 'Type a mood; the AI picks the blocks (cost first)', () => { S.moodOpen = !S.moodOpen; paint(); }, 'ghost small bk-combine')),
      S.moodOpen ? el('div', { class: 'bk-row2 bk-moodrow' }, mood, go) : null,
    );
  }
  async function open(anchor = null) {
    if (!S.pop) {
      S.pop = el('div', { class: 'bk-pop', attrs: { role: 'dialog', 'aria-label': 'Blocks' } });
      S.pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      S.pop.addEventListener('contextmenu', (e) => e.stopPropagation());
      document.body.append(S.pop);
    }
    const r = anchor?.getBoundingClientRect?.() || hk()?.host?.getBoundingClientRect?.() || { right: innerWidth - 20, top: 80 };
    const W = 360;
    S.pop.style.left = `${Math.max(8, Math.min(innerWidth - W - 8, (r.right ?? innerWidth) - W - 8))}px`;
    S.pop.style.top = `${Math.max(8, Math.min(innerHeight - 200, (r.top ?? 80) + 8))}px`;
    await mineList({ fresh: true });
    S.pal = await palette().catch(() => []);
    paint();
    thumbLoop().catch(() => {});
    return S.pop;
  }
  function close() {
    S.pop?.remove(); S.pop = null;
    S.stage?.dispose?.(); S.stage = null; S.sk = null;
  }
  addEventListener('hearth:sketch', () => { if (S.pop) setTimeout(paint, 200); });

  return { open, close, paint, add, build, reorder, chain, combine, askText, cost, saveMine, removeMine, mineList, op, codeFor, specOf, stats, isOpen: () => Boolean(S.pop), undo: () => (S.undo ? S.undo() : false), get pop() { return S.pop; } };
})();
window.LabBlocks = LabBlocks;
