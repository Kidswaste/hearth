// The project's look, on the scene in one click (round 129, looks129). docs/upgrades/looks129.md
// When the Lab's scene belongs to a project with a palette (the project's own, picked at creation or taken from the
// moodboard, or its brief's), the Lab's toolbar shows a "Project look" strip next to 🎨 (the same swatches):
//   · Apply: the palette on the scene's color sliders (tweak() colors) and ◉ material looks; no code is rewritten.
//     Pointing at Apply shows it on the preview first (nothing kept); a click keeps it as ONE undo step (the toast's
//     Undo, ↶ on the strip, the Lab's Ctrl/⌘+Z)
//   · ⋯ options: all layers or the selected one, "Keep my locked sliders" (on), Subtle or Full, which palette,
//     🖼 Take the palette from the moodboard (its pictures read here with Kit.paletteFromImage, no AI: the project's
//     palette), Save as a look (each recolored layer's sliders as a saved look: three_looks)
//   · the AI: three_do looks { action: "project", strength, layer, keepLocked } (op() below, via tools/three-director.js)
// The pure part: tools/three-projlook-core.js. Loaded (lazy group "projlook") when a project's scene opens in the Lab.
const LabProjLook = (() => {
  const C = () => ProjLookCore;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const hooks = () => Lab()?.stageHooks || {};
  const host = () => window.LabMatHook?.host?.() || null; // the Lab's layers, selection and ◉ looks (tools/three-materials-hook.js)
  const OPTS = 'three.projlook';
  const opts = () => ({ scope: 'all', keepLocked: true, strength: 'full', source: '', ...(store.get(OPTS, {}) || {}) });
  const setOpt = (patch) => { store.set(OPTS, { ...opts(), ...patch }); paint(); };
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  const S = { box: null, last: null, preview: null, heard: false, busy: false };
  const stats = { applied: 0, undone: 0, previews: 0, boards: 0 };

  // ---------- the project of a scene, and its palette ----------
  const projectOf = (sceneId, chatId) => {
    if (typeof Projects === 'undefined') return null;
    return (sceneId && Projects.ofItem('scene', sceneId)[0]) || (chatId && Projects.projectOfChat?.(chatId)) || null;
  };
  const briefOf = (p) => { try { return p && typeof ProjectBrief !== 'undefined' ? ProjectBrief.get(p.id) : null; } catch { return null; } };
  const lastRef = (p, type) => p.items.filter((x) => x.type === type).sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.ref || null;
  const boardOf = (p) => p?.workspace?.boardId || (p ? lastRef(p, 'board') : null);
  function paletteOf(p) {
    const list = C().sources(p, briefOf(p));
    const want = opts().source;
    return list.find((s) => s.id === want) || list[0] || null;
  }
  const sceneNow = () => hooks().sketchId?.() || null;
  const here = () => projectOf(sceneNow());

  // ---------- the scene's colors as they are ----------
  const isColor = (x) => typeof x.value === 'string' && C().HEX.test(x.value);
  function readScene(scope, ids = null) {
    const h = host();
    if (!h) return [];
    const sel = h.sel?.();
    const Ls = ids ? ids.map((id) => h.layerById(id)).filter(Boolean) : scope === 'selected' ? (sel ? [sel] : []) : h.layers();
    return Ls.map((L) => {
      const c = hooks().ctlOf?.(L.id);
      let list = [];
      try { list = c ? c.controls() : []; } catch { list = []; }
      return { id: L.id, name: L.name, colors: list.filter(isColor).map((x) => ({ key: x.key, label: x.label, value: x.value, locked: Boolean(c.locked?.(x.key)) })), look: L.overrides?.['@look'] || null };
    });
  }
  const baseOf = (spec) => (window.MatCore ? MatCore.colorOf(spec) : null);
  function makePlan(o = opts(), palette = null) {
    const p = here(); const pal = palette || paletteOf(p)?.colors || [];
    return C().plan(readScene(o.scope, o.ids || null), pal, { strength: o.strength, keepLocked: o.keepLocked, base: baseOf });
  }

  // ---------- putting values on (a plan, or what was there before it) ----------
  // vals: [{ id, set, force, look }]; force: locked keys this may change (unlocked for the moment, locked again)
  function put(vals, { remember = true, looks = true } = {}) {
    const h = host();
    for (const v of vals) {
      const c = hooks().ctlOf?.(v.id);
      if (c && Object.keys(v.set).length) {
        const open = (v.force || []).filter((k) => c.locked?.(k));
        open.forEach((k) => c.lock(k, false));
        try { c.setMany(v.set, remember ? undefined : { remember: false }); } finally { open.forEach((k) => c.lock(k, true)); }
      }
      if (looks && v.look !== undefined && h) { const L = h.layerById(v.id); if (L) h.setLook(L, v.look ? JSON.parse(JSON.stringify(v.look)) : null); }
    }
  }
  function beforeOf(plan) {
    const h = host();
    const now = Object.fromEntries(readScene('all').map((L) => [L.id, L]));
    return plan.layers.map((v) => {
      const was = now[v.id];
      const set = {};
      for (const k of Object.keys(v.set)) { const x = was?.colors.find((c) => c.key === k); if (x) set[k] = x.value; }
      const L = h?.layerById(v.id);
      return { id: v.id, set, force: v.force, ...(v.look ? { look: L?.overrides?.['@look'] ? JSON.parse(JSON.stringify(L.overrides['@look'])) : null } : {}) };
    });
  }
  const after = (plan) => plan.layers.map((v) => ({ id: v.id, set: v.set, force: v.force, ...(v.look ? { look: v.look } : {}) }));

  // ---------- point at Apply: the preview shows it, nothing kept ----------
  function previewOn() {
    if (S.preview || S.busy) return;
    const plan = makePlan();
    if (!plan.changed) return;
    S.preview = { sid: sceneNow(), before: beforeOf(plan) };
    stats.previews += 1;
    put(after(plan), { remember: false });
    S.box?.classList.add('pl-previewing');
  }
  function previewOff() {
    const pv = S.preview; S.preview = null;
    S.box?.classList.remove('pl-previewing');
    if (pv && pv.sid === sceneNow()) put(pv.before, { remember: false });
  }

  // ---------- Apply: one undo step ----------
  function apply(o = {}) {
    previewOff();
    const p = here();
    const src = o.palette ? { colors: o.palette, name: 'the palette' } : paletteOf(p);
    if (!src?.colors?.length) throw new Error(p ? `“${p.name}” has no palette yet: take one from its moodboard (⋯) or pick one in the project.` : 'This scene is in no project.');
    const o2 = { ...opts(), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) };
    const plan = makePlan(o2, src.colors);
    if (!plan.changed) {
      const why = plan.kept ? `its ${plan.kept} color slider${plan.kept === 1 ? ' is' : 's are'} locked` : 'no color sliders or material looks to recolor, or they already have these colors';
      if (!o.quiet) toast(`Nothing to recolor: ${why}.`, { timeout: 3000 });
      return { changed: 0, kept: plan.kept, layers: [], palette: src.colors };
    }
    const rec = { sid: sceneNow(), before: beforeOf(plan), after: after(plan), layers: plan.layers.map((v) => v.id), undone: false, palette: src.colors };
    put(rec.after, { remember: true });
    stats.applied += 1;
    const words = `Project look on ${plan.layers.length} layer${plan.layers.length === 1 ? '' : 's'}`;
    // the owner's click: our own undo step (the Lab's Ctrl/⌘+Z, the toast, ↶). An AI's call: its reply's undo step
    // (tools/three-txn.js), so nothing of ours that could put it back a second time
    if (!o.ai) { S.last = rec; window.LabDirect?.push?.(null, words, () => undo({ quiet: true })); }
    if (!o.quiet) toast(`🎨 ${words}${plan.kept ? ` · ${plan.kept} locked kept` : ''}`, { timeout: 5000, action: { label: 'Undo', fn: () => undo() } });
    paint();
    return { changed: plan.changed, kept: plan.kept, palette: src.colors, layers: plan.layers.map((v) => ({ layer: v.name, set: v.set, ...(v.look ? { materials: Object.keys(v.look).length } : {}) })) };
  }
  function undo({ quiet = false } = {}) {
    const r = S.last;
    if (!r || r.undone) { if (!quiet) toast('Nothing to undo.', { timeout: 1500 }); return false; }
    if (r.sid !== sceneNow()) { if (!quiet) toast('That project look was on another scene.', { timeout: 2000 }); return false; }
    r.undone = true; stats.undone += 1;
    put(r.before, { remember: true });
    if (!quiet) toast('↶ The colors are back as they were', { timeout: 1500 });
    paint();
    return true;
  }

  // ---------- 🖼 the moodboard's pictures → the project's palette (here, no AI) ----------
  async function fromBoard(p = here()) {
    if (!p) throw new Error('This scene is in no project.');
    const id = boardOf(p);
    if (!id) throw new Error(`“${p.name}” has no moodboard yet.`);
    const b = (typeof Board !== 'undefined' ? await Board.load(id).catch(() => null) : null) || await window.hub.kvGet(`board-${id}`, null).catch(() => null);
    const items = b?.items || [];
    const pics = items.filter((i) => (i.type === 'image' || i.type === 'gif') && (i.tiny || i.thumb || i.src)).map((i) => i.tiny || i.thumb || i.src).slice(0, 8);
    const swatches = items.filter((i) => i.type === 'swatch' || i.type === 'palette').map((i) => (i.colors || [i.color]).filter(Boolean));
    if (!pics.length && !swatches.length) throw new Error('The moodboard has no pictures or swatches yet.');
    if (typeof Kit === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('kit');
    const lists = [];
    for (const pic of pics) { try { lists.push(await Kit.paletteFromImage(pic, 5)); } catch { /* an unreadable picture is skipped */ } }
    const cols = C().merge([...lists, ...swatches], 5);
    if (!cols.length) throw new Error('No colors could be read from the moodboard\'s pictures.');
    Projects.setWorkspace(p, { palette: cols });
    stats.boards += 1;
    if (opts().source === 'brief') setOpt({ source: 'project' }); else paint();
    return cols;
  }

  // ---------- 💾 Save as a look: each recolored layer's sliders, as a saved look ----------
  function saveLook(name) {
    const nm = String(name || 'Project look').trim().slice(0, 40) || 'Project look';
    const ids = S.last && !S.last.undone && S.last.sid === sceneNow() ? S.last.layers : readScene(opts().scope).filter((L) => L.colors.length).map((L) => L.id);
    let n = 0;
    for (const id of ids) { const c = hooks().ctlOf?.(id); if (c) { c.looksApi.save(nm); n += 1; } }
    return { name: nm, layers: n };
  }

  // ---------- the strip ----------
  function menu(anchor) {
    const o = opts(); const p = here();
    const list = C().sources(p, briefOf(p));
    const cur = paletteOf(p);
    const tick = (on, label) => `${on ? '✓ ' : ''}${label}`;
    showMenuAt(anchor, [
      { label: tick(o.scope === 'all', 'All layers'), action: () => setOpt({ scope: 'all' }) },
      { label: tick(o.scope === 'selected', 'The selected layer only'), action: () => setOpt({ scope: 'selected' }) },
      '-',
      { label: tick(o.keepLocked, 'Keep my locked sliders'), hint: '🔒 sliders stay as they are', action: () => setOpt({ keepLocked: !o.keepLocked }) },
      { label: tick(o.strength === 'subtle', 'Subtle'), hint: 'halfway to the palette', action: () => setOpt({ strength: 'subtle' }) },
      { label: tick(o.strength !== 'subtle', 'Full'), hint: 'the palette\'s own colors', action: () => setOpt({ strength: 'full' }) },
      ...(list.length > 1 ? ['-', ...list.map((s) => ({ label: tick(cur?.id === s.id, s.name), hint: s.colors.join(' '), action: () => setOpt({ source: s.id }) }))] : []),
      '-',
      ...(boardOf(p) ? [{ label: '🖼 Take the palette from the moodboard', hint: 'its pictures, read here (no AI)', action: () => fromBoardUI() }] : []),
      { label: '💾 Save as a look…', hint: 'switch back with one click (Sliders › looks)', action: () => saveLookUI() },
      ...(S.last && !S.last.undone && S.last.sid === sceneNow() ? [{ label: '↶ Undo the project look', action: () => undo() }] : []),
    ]);
  }
  async function fromBoardUI() {
    if (S.busy) return;
    S.busy = true; paint();
    try { const cols = await fromBoard(); toast(`🖼 The project's palette, from its moodboard: ${cols.join(' ')}`, { timeout: 3500 }); } catch (e) { err(e); } finally { S.busy = false; paint(); }
  }
  async function saveLookUI() {
    const n = await Modal.prompt('Save as a look', { value: 'Project look', label: 'The recolored sliders, as a look you can switch back to (Sliders › looks)' });
    if (n == null) return;
    const r = saveLook(n);
    toast(r.layers ? `Saved the look “${r.name}” on ${r.layers} layer${r.layers === 1 ? '' : 's'}` : 'No layer with color sliders to save', { timeout: 2400 });
  }
  function paint() {
    const box = S.box;
    if (!box) return;
    if (S.preview && S.preview.sid !== sceneNow()) S.preview = null;
    hear();
    const p = here();
    const src = p ? paletteOf(p) : null;
    const board = p && boardOf(p);
    box.hidden = !p || (!src && !board);
    if (box.hidden) { box.replaceChildren(); return; }
    const sw = (c) => { const b = el('button', { class: 'lab-swatch', title: `${c}: click to copy`, on: { click: () => { navigator.clipboard?.writeText(c); toast(`Copied ${c}`, { timeout: 1000 }); } } }); b.style.background = c; return b; };
    const o = opts();
    const applyBtn = el('button', { class: 'pl-apply', text: 'Apply', title: `Put ${src ? src.name.toLowerCase() : 'the palette'} on ${o.scope === 'all' ? 'the scene\'s' : 'the selected layer\'s'} color sliders and material looks (${o.strength === 'subtle' ? 'subtle' : 'full'}${o.keepLocked ? ', locked sliders kept' : ''}). Point at it to see it first. One undo.`,
      on: { mouseenter: () => { try { previewOn(); } catch (e) { console.warn(e); } }, mouseleave: () => previewOff(), click: () => { try { apply(); } catch (e) { err(e); } } } });
    const undoOn = S.last && !S.last.undone && S.last.sid === sceneNow();
    box.replaceChildren(
      el('span', { class: 'pl-label', text: '◆', title: `${p.name}: ${src ? src.name : 'no palette yet'}` }),
      ...(src ? src.colors.map(sw) : []),
      src ? applyBtn : el('button', { class: 'pl-board', text: S.busy ? 'Reading…' : '🖼 From the moodboard', title: 'Take the project\'s palette from its moodboard\'s pictures (read here, no AI)', on: { click: () => fromBoardUI() } }),
      ...(undoOn ? [el('button', { class: 'pl-undo', text: '↶', title: 'Undo the project look', on: { click: () => undo() } })] : []),
      el('button', { class: 'pl-more', text: '⋯', title: 'Project look: which layers, locked sliders, strength, the moodboard, save as a look', on: { click: (e) => menu(e.currentTarget) } }));
    box.title = '';
  }
  // the project, its brief or the scene changed: paint again
  function hear() {
    if (S.heard) return;
    if (typeof Projects !== 'undefined' && Projects.onChange) { S.heard = true; Projects.onChange(() => paint()); }
    if (typeof ProjectBrief !== 'undefined' && ProjectBrief.onChange) ProjectBrief.onChange(() => paint());
  }
  // the Lab gives its toolbar's place for the strip (tools/three.js renderPalette: each scene that opens)
  function mount(box) {
    if (!box) return;
    if (S.box !== box) { S.box = box; box.classList.add('lab-projlook'); }
    paint();
  }

  // ---------- the AI: three_do looks { action: "project", strength, layer, keepLocked } ----------
  // On screen: the same Apply (one undo, the reply's undo too). Backstage: the color sliders through d.sliders.
  async function op(args = {}, d = null, ctx = {}) {
    const linked = ctx.chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(ctx.chatId) : null;
    const sid = linked || sceneNow();
    const p = projectOf(sid, ctx.chatId);
    if (!p) return { ok: false, error: 'This scene is in no project, so it has no project palette. Set colors with three_sliders.' };
    const src = paletteOf(p);
    if (!src) return { ok: false, error: `“${p.name}” has no palette yet (none picked, no brief palette). The owner can take one from the moodboard (the Lab's Project look strip).` };
    const strength = /subtle/i.test(String(args.strength || '')) ? 'subtle' : 'full';
    const keepLocked = args.keepLocked !== false;
    const onScreen = sid && sid === sceneNow() && host();
    if (onScreen) {
      let ids;
      if (args.layer != null && args.layer !== 'all') { let L = null; try { L = d?.codeOf ? d.codeOf(args.layer) : null; } catch { L = null; } if (!L) return { ok: false, error: `No layer "${args.layer}".` }; ids = [L.id]; }
      const r = apply({ palette: src.colors, ids, strength, keepLocked, quiet: true, ai: true });
      return { ok: true, value: { from: src.name, ...r } };
    }
    if (!d?.layers || !d?.sliders) return { ok: false, error: 'Open the scene in the Lab to apply the project look.' };
    let rows = [];
    try { rows = d.layers(); } catch { rows = []; }
    if (!Array.isArray(rows)) rows = rows?.layers || [];
    if (args.layer != null && args.layer !== 'all') rows = rows.filter((L) => L.id === args.layer || L.name === args.layer);
    const layers = rows.map((L) => { let s = []; try { s = d.sliders(L.id, null).sliders || []; } catch { s = []; } return { id: L.id, name: L.name, colors: s.filter(isColor).map((x) => ({ key: x.key, value: x.value })) }; });
    const plan = C().plan(layers, src.colors, { strength, keepLocked });
    for (const v of plan.layers) if (Object.keys(v.set).length) d.sliders(v.id, v.set);
    return { ok: true, value: { from: src.name, palette: src.colors, changed: plan.changed, layers: plan.layers.map((v) => ({ layer: v.name, set: v.set })) } };
  }

  return { mount, paint, apply, undo, previewOn, previewOff, fromBoard, saveLook, op, makePlan, paletteOf, here, stats, get last() { return S.last; }, get preview() { return S.preview; } };
})();
window.LabProjLook = LabProjLook;
