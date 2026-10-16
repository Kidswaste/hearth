// 📜 Recipes (round 39, labrecipes): the owner's finishing steps, recorded once on one scene, replayed on any other
// scene in one click, 0 tokens.
//   · ● Record a recipe (✦ More › 📜 Recipes, the toolbar's ⋯, Lab search, ⌘/Ctrl+K): a small red chip over the
//     preview counts the steps captured. Captured: effects / filters / looks / palettes / presets from the effects picker
//     (with the settings moved afterwards), a layer's saved slider looks, the palette, trigger presets, the frame size,
//     ▦ All formats picks, ✨ Make it look finished, 🎨 look matches, ♪ music links and slider moves (by the slider's
//     name / role), layers added (the gallery, …), the ⇪ Export settings. Not mouse moves, not code typed.
//     ■ Stop → a name → data/recipes/<id>.json (synced like the rest of the data folder).
//   · Use a recipe…: a picker (names, step lists); the steps that fit this scene ✓ and the ones that don't (with why);
//     ▶ Use replays it on the scene on screen as ONE undo step (the toast's Undo, /recipe undo; ◧ Before / after names
//     it); ↑ ↓ ✕ edit the steps, rename, ⇪ Share as a pack…, Delete… (to the Trash). "Use on several scenes…": one recipe
//     on recent scenes in a row.
//   · For the AI: /recipe list · show <name> · use <name> · undo (a director reaches it through three_do run).
// Model: tools/three-recipes-core.js (RecipeCore). Taps in the Lab's files: tools/three-recipes-hook.js (LabRecipesHook).
//   LabRecipes.start() · stop({ name }) · toggleRecord() · open({ batch }) · use(r, { batch }) · undo() · list() · save(r)
//   · remove(r) · share(r) · fromPack(m) · state()
const LabRecipes = (() => {
  const C = RecipeCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(e?.message || String(e), { type: 'error', timeout: 6000 });
  const D = () => ThreeLab.director;
  const SC = () => ThreeLab.scenes;
  const HK = () => ThreeLab.stageHooks || {};
  const last = { saved: null, replay: null, undone: null, removed: null, error: null }; // (dev/checks/labrecipes.js)

  async function lab(show = true) {
    await ThreeLab.cmd({ show });
    for (let i = 0; i < 100 && !D(); i += 1) await sleep(100);
    if (!D() || !SC()?.currentId()) throw new Error('Open a scene in the Lab first.');
    return D();
  }

  // ---------- the scene as the recorder sees it: its layers, every named slider (value + ♪ link), the palette ----------
  const typeOf = (c) => C.typeOf(c);
  function ctlsOf(id) {
    let list = [];
    try { list = HK().ctlOf?.(id)?.controls() || []; } catch { list = []; }
    return list;
  }
  function snapshot() {
    const id = SC()?.currentId(); const x = id && SC().get(id);
    if (!x) return null;
    const selId = HK().layer?.()?.id || null;
    const Ls = SC().layersOf(x) || [];
    const ctl = {};
    for (const L of Ls) {
      const o = {};
      for (const c of ctlsOf(L.id)) if (c.key != null) o[c.key] = { v: c.value, link: c.followsMusic || null, label: c.label, group: c.group || '', type: typeOf(c), min: c.min, max: c.max, options: c.options };
      ctl[L.id] = o;
    }
    return { scene: id, palette: (x.palette || []).slice(), layers: Ls.map((L) => ({ id: L.id, name: L.name, sel: L.id === selId, filter: C.filterType(L.code), h: C.hash(L.code) })), ctl };
  }
  // what plan() / replay look at: the layers with their sliders, each layer's saved looks, the frame
  function sceneModel() {
    const id = SC()?.currentId(); const x = id && SC().get(id);
    if (!x) return { layers: [], looks: {}, frame: null };
    const selId = HK().layer?.()?.id || null;
    const looks = {};
    const layers = (SC().layersOf(x) || []).map((L) => {
      let lk = []; try { lk = HK().ctlOf?.(L.id)?.looksApi?.list() || []; } catch { lk = []; }
      looks[L.id] = lk;
      return { id: L.id, name: L.name, sel: L.id === selId, filter: C.filterType(L.code), ctls: ctlsOf(L.id).filter((c) => c.key != null).map((c) => ({ ...c, type: typeOf(c) })) };
    });
    return { layers, looks, frame: HK().size?.id || null, palette: x.palette || [] };
  }
  const layerIds = () => { const id = SC()?.currentId(); const x = id && SC().get(id); return x ? (SC().layersOf(x) || []).map((L) => L.id) : []; };

  // ---------- recording ----------
  const R = { on: false, scene: null, name: '', steps: [], base: null, depth: 0, madeBy: new Map(), diffT: 0, chip: null, replaying: false, at: 0 };
  const steps = () => C.compress(R.steps);
  function push(s) { R.steps.push({ sid: s.sid || C.newSid(), ...s }); paintChip(); }
  function diffNow() {
    clearTimeout(R.diffT); R.diffT = 0;
    if (!R.on) return;
    const now = snapshot();
    if (!now) return;
    if (now.scene !== R.scene) return; // another scene on screen: nothing of it is recorded (the base stays this scene's)
    const add = C.snapDiff(R.base, now, { madeBy: R.madeBy, codeOf: (lid) => codeAndProps(lid) });
    for (const s of add) push(s);
    R.base = now;
  }
  function codeAndProps(lid) {
    const id = SC()?.currentId(); const x = id && SC().get(id);
    const L = x && (SC().layersOf(x) || []).find((y) => y.id === lid);
    if (!L) return null;
    const props = {};
    for (const k of ['blend', 'opacity', 'visible']) if (L[k] != null && !(k === 'blend' && L[k] === 'normal') && !(k === 'opacity' && L[k] === 1) && !(k === 'visible' && L[k] !== false)) props[k] = L[k];
    return { code: L.code, props };
  }
  const diffSoon = (ms = 450) => { clearTimeout(R.diffT); R.diffT = setTimeout(diffNow, ms); };
  const onScene = () => SC()?.currentId() === R.scene;
  const sink = {
    note(kind, data) {
      if (!R.on || R.replaying || !onScene()) return;
      if (R.depth > 0) return; // part of an action being recorded as one step
      if (kind === 'frame') { diffNow(); if (data.id) push({ k: 'frame', id: data.id, ...(data.id === 'custom' && data.w ? { w: data.w, h: data.h } : {}) }); return; }
      if (kind === 'formats') { if ((data.formats || []).length) push({ k: 'formats', formats: data.formats.slice(0, 8) }); return; }
      if (kind === 'export') { if (data.set) push({ k: 'export', set: { ...data.set } }); return; }
      if (kind === 'mat') { diffNow(); push({ k: 'mat', spec: data.spec ? { ...data.spec } : null, key: data.key || '', layer: String(data.layer || '') }); return; } // (round 50, labmaterials) ◉ a look
      if (kind === 'cam') { if (Array.isArray(data.moves)) push({ k: 'cam', moves: JSON.parse(JSON.stringify(data.moves)) }); return; } // (round 40, labcamera)
      if (kind === 'groups') { diffNow(); if (data.op) push({ k: 'groups', ...JSON.parse(JSON.stringify(data)) }); return; } // (round 44, layergroups)
      if (kind === 'trigger') { diffNow(); if (data.preset) push({ k: 'trigger', name: String(data.name || 'Preset'), preset: JSON.parse(JSON.stringify(data.preset)) }); return; }
      diffSoon(); // sliders, layers, links, the palette: compared with the scene as it was (one step per change)
    },
    begin(kind, data) {
      if (!R.on || R.replaying || !onScene()) return null;
      diffNow();
      R.depth += 1;
      const ids0 = layerIds();
      const selRef = (() => { const s = R.base?.layers.find((L) => L.sel); return s ? C.refOf(s, R.madeBy) : null; })();
      const step = { sid: C.newSid(), k: kind, ...data };
      if (!step.on && selRef && (kind === 'fx' || kind === 'look')) step.on = selRef;
      let done = false;
      return (extra) => {
        if (done) return;
        done = true;
        R.depth = Math.max(0, R.depth - 1);
        if (extra !== false && R.on) {
          Object.assign(step, extra || {});
          const made = layerIds().filter((x) => !ids0.includes(x));
          if (made.length) { step.made = made.length; made.forEach((lid, n) => R.madeBy.set(lid, { made: step.sid, n })); }
          if (kind === 'layer' && !made.length) return; // nothing was added after all
          push(step);
        }
        // what the action changed is part of it: the base moves on (sliders scanned a moment later are new, not moves)
        if (!R.depth) { R.base = snapshot(); setTimeout(() => { if (R.on && !R.depth && onScene()) { const s = snapshot(); if (s) R.base = s; } }, 900); }
      };
    },
  };
  async function start() {
    if (R.on) return true;
    await lab();
    R.on = true; R.scene = SC().currentId(); R.name = SC().get(R.scene)?.name || ''; R.steps = []; R.depth = 0; R.madeBy = new Map(); R.at = Date.now();
    R.base = snapshot();
    LabRecipesHook.setSink(sink);
    paintChip();
    toast('● Recording a recipe: do your finishing steps. ■ Stop on the red chip when done.', { timeout: 3500 });
    return true;
  }
  function cancel() {
    clearTimeout(R.diffT);
    R.on = false; R.steps = []; R.base = null; R.madeBy = new Map();
    LabRecipesHook.setSink(null);
    chipOff();
  }
  // stop: the steps (compressed) → a name → saved. name: given (chat / tests) or asked; returns the recipe or null
  async function stop({ name = null } = {}) {
    if (!R.on) return null;
    diffNow();
    const list = steps();
    const from = R.name;
    cancel();
    if (!list.length) { toast('Nothing to keep: no Lab action was recorded.', { timeout: 3500 }); return null; }
    let nm = name;
    if (nm == null) {
      const def = uniqueName(`Finish like ${from || 'this scene'}`, await list0());
      nm = await Modal.prompt(`Name this recipe (${C.summary({ steps: list })})`, { value: def, label: `${list.slice(0, 5).map((s) => C.describe(s)).join(' · ')}${list.length > 5 ? ` · … ${list.length - 5} more` : ''}` });
      if (nm == null) { toast('Recipe not kept.', { timeout: 2500 }); return null; }
    }
    const r = C.make({ name: uniqueName(nm || def0(from), await list0()), steps: list, from });
    await save(r);
    last.saved = r;
    toast(`📜 Recipe "${r.name}" kept (${C.summary(r)})`, { timeout: 5000, action: { label: 'See it', fn: () => open({ pick: r.id }).catch(err) } });
    return r;
  }
  const def0 = (from) => `Finish like ${from || 'this scene'}`;
  async function toggleRecord() { return R.on ? stop() : start(); }

  // the red chip over the preview while recording
  function chipOff() { R.chip?.remove(); R.chip = null; }
  function paintChip() {
    if (!R.on) return chipOff();
    const host = HK().host;
    if (!host) return;
    if (!R.chip) {
      R.chip = el('div', { class: 'rc-rec', attrs: { role: 'status', 'aria-live': 'polite' } },
        el('span', { class: 'rc-dot' }), el('span', { class: 'rc-count' }),
        el('button', { type: 'button', class: 'rc-stop', text: '■ Stop', title: 'Stop recording: name the recipe and keep it', on: { click: (e) => { e.stopPropagation(); stop().catch(err); } } }),
        el('button', { type: 'button', class: 'rc-cancel', text: '✕', title: 'Throw this recording away', on: { click: (e) => { e.stopPropagation(); cancel(); toast('Recording thrown away.', { timeout: 2000 }); } } }));
    }
    if (R.chip.parentNode !== host) host.append(R.chip);
    const list = steps();
    const t = `Recording · ${list.length} step${list.length === 1 ? '' : 's'}`;
    const c = R.chip.querySelector('.rc-count');
    if (c.textContent !== t) c.textContent = t;
    const tip = list.length ? list.map((s, i) => `${i + 1}. ${C.describe(s)}`).join('\n') : 'Apply effects, looks, palettes, presets, frame sizes, move sliders, link them to the music…';
    if (R.chip.title !== tip) R.chip.title = tip;
  }
  addEventListener('hearth:sketch', () => { if (R.on) setTimeout(paintChip, 50); });

  // ---------- the folder: data/recipes/<id>.json ----------
  let rootDir = null;
  const sepOf = (p) => (/^[A-Za-z]:\\/.test(p) || (p.includes('\\') && !p.includes('/')) ? '\\' : '/');
  const join = (a, ...b) => [String(a).replace(/[\\/]+$/, ''), ...b].join(sepOf(a));
  async function root() {
    if (rootDir) return rootDir;
    const att = await window.hub.attachmentsDir();
    rootDir = join(String(att).replace(/[\\/]attachments[\\/]?$/, ''), 'recipes');
    return rootDir;
  }
  let cache = null;
  async function list({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const r = await root();
    let files = [];
    try { files = (await window.hub.fs.list(r)).filter((x) => !x.isDir && /\.json$/i.test(x.name)); } catch { files = []; }
    const all = [];
    for (const f of files) {
      try { const ck = C.check(JSON.parse(await window.hub.fs.read(f.path))); if (ck.r && ck.r.steps.length) { ck.r._file = f.path; all.push(ck.r); } } catch { /* not a recipe */ }
    }
    cache = C.sortNewest(all);
    try { store.set('three.recipes', cache.length); } catch { /* the tip's count only */ }
    return cache;
  }
  const list0 = () => list().catch(() => []);
  addEventListener('hearth:synced', (ev) => { if ((ev.detail?.files || []).some((f) => /^recipes\//.test(f.rel || ''))) cache = null; });
  const clean = (r) => { const o = { ...r }; delete o._file; return o; };
  async function save(r) {
    r.updatedAt = Date.now();
    const file = join(await root(), `${r.id}.json`);
    await window.hub.fs.write(file, JSON.stringify(clean(r), null, 1));
    r._file = file;
    cache = null;
    await list({ fresh: true });
    return r;
  }
  const uniqueName = (name, all = cache || []) => { const have = new Set(all.map((r) => r.name.toLowerCase())); let n = C.safeName(name); const b = n; for (let i = 2; have.has(n.toLowerCase()); i += 1) n = `${b} ${i}`; return n; };
  function byName(name, all = cache || []) {
    const n = String(name || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
    if (!n) return null;
    return all.find((r) => r.name.toLowerCase() === n) || all.find((r) => r.id === n) || all.find((r) => r.name.toLowerCase().startsWith(n)) || all.find((r) => r.name.toLowerCase().includes(n)) || null;
  }
  async function remove(r, { ask = false } = {}) {
    if (ask && !(await Modal.confirm('Delete this recipe?', `"${r.name}" goes to the Trash. Scenes it was used on stay as they are.`, { ok: 'Move to Trash', danger: true }))) return false;
    const file = r._file || join(await root(), `${r.id}.json`);
    const kept = await window.UndoAll?.keepFiles?.([file]); // (round 41, undoall) a copy first: Ctrl/⌘+Z brings it back
    const res = await window.hub.fs.trash([file]);
    if (res?.failed?.length) throw new Error(`It couldn't go to the Trash: ${res.failed[0].error || 'unknown reason'}. Nothing was deleted.`);
    window.UndoAll?.deleted?.(kept, { what: 'recipe', name: r.name });
    cache = null;
    last.removed = { id: r.id, name: r.name, file };
    toast(`📜 "${r.name}" is in the Trash`, { timeout: 3500 });
    await list({ fresh: true });
    return true;
  }

  // ---------- replaying ----------
  const fxHas = (fx) => { try { return typeof ThreeFX !== 'undefined' && ThreeFX.items(fx.kind).some((it) => String(it.id) === String(fx.id)); } catch { return false; } };
  function planFor(r) { return C.plan(r, sceneModel(), { has: fxHas }); }
  // the layer a step points at, on this scene now (null: none fits)
  function layerFor(on, made) {
    const model = sceneModel();
    const c = C.candidates(on, model.layers, made);
    return c.why ? null : c.list[0]?.[0] || null;
  }
  // what undo puts back
  function beforeState() {
    const id = SC().currentId();
    const links = {};
    for (const L of SC().layersOf(SC().get(id)) || []) { const o = {}; for (const c of ctlsOf(L.id)) if (c.key != null && c.min != null) o[c.key] = c.followsMusic || null; links[L.id] = o; }
    let trig = null; try { trig = JSON.parse(JSON.stringify(D().triggers())); } catch { trig = null; }
    return { id, st: ThreeLab.tm.state(id), links, frame: HK().size ? { ...HK().size } : null, trig, exp: store.get('three.export', null), picks: store.get('three.formats.picks', null) };
  }
  const muteToasts = () => { const t0 = window.toast; window.toast = (m, o = {}) => (o.type === 'error' ? t0(m, o) : null); return () => { window.toast = t0; }; };
  async function runStep(s, made) {
    const d = D();
    switch (s.k) {
      case 'fx': {
        if (typeof ThreeFX === 'undefined') return 'effects aren\'t loaded';
        const it = ThreeFX.items(s.fx.kind).find((x) => String(x.id) === String(s.fx.id));
        if (!it) return `"${s.fx.name || s.fx.id}" isn't in this Hearth`;
        if (s.on && (['animate', 'ease', 'blend', 'filter', 'layer'].includes(s.fx.kind))) { const L = layerFor(s.on, made); if (L) d.selectLayer(L.id); else if (['animate', 'ease', 'blend'].includes(s.fx.kind)) return 'no layer to put it on'; }
        const ids0 = layerIds();
        await ThreeFX.apply(it, { alt: Boolean(s.alt) });
        const nu = layerIds().filter((x) => !ids0.includes(x));
        if (nu.length) made.set(s.sid, nu);
        return null;
      }
      case 'look': {
        const L = layerFor(s.on, made);
        if (!L) return 'no layer for it';
        const ctl = HK().ctlOf?.(L.id);
        const names = ctl?.looksApi?.list() || [];
        const hit = names.find((n) => n.toLowerCase() === String(s.name).toLowerCase());
        if (hit) { d.looks(L.id, 'apply', hit); return null; }
        const model = sceneModel();
        const set = {};
        for (const [key, v] of Object.entries(s.vals || {})) { const m = C.matchSlider({ k: 'slider', on: s.on, key, label: s.labels?.[key] || key, v }, model.layers, made); if (m.ctl && m.layer.id === L.id) set[m.ctl.key] = C.valueFor({ v }, m.ctl); }
        if (!Object.keys(set).length) return `no look "${s.name}" and none of its sliders here`;
        d.sliders(L.id, set);
        return null;
      }
      case 'palette': d.refs.setPalette(s.colors); return null;
      case 'trigger': d.triggers(s.preset); return null;
      case 'frame': { const cmd = await ThreeLab.cmd({ show: false }); if (s.id === 'custom' && s.w) cmd.customSize(s.w, s.h); else cmd.size(s.id); return null; }
      case 'formats': store.set('three.formats.picks', s.formats); return null;
      case 'export': store.set('three.export', { ...store.get('three.export', {}), ...s.set }); return null;
      case 'autopolish': if (typeof AutoPolish === 'undefined') return '✨ isn\'t loaded'; await AutoPolish.run({ quiet: true, card: false }); return null;
      case 'lookmatch': {
        if (typeof LookMatch === 'undefined') return '🎨 isn\'t loaded';
        const ids0 = layerIds();
        await LookMatch.reapply({ name: s.name || 'Recipe', grade: s.grade || {}, lens: s.lens || null, palette: s.palette || [] });
        const nu = layerIds().filter((x) => !ids0.includes(x)); if (nu.length) made.set(s.sid, nu);
        return null;
      }
      case 'layer': {
        const ids0 = layerIds();
        await d.addLayer({ name: s.name, code: s.code, props: s.props || {} }, 0.4);
        const nu = layerIds().filter((x) => !ids0.includes(x)); if (nu.length) made.set(s.sid, nu);
        return nu.length ? null : 'the layer wasn\'t added';
      }
      case 'slider': case 'link': {
        let m = C.matchSlider(s, sceneModel().layers, made);
        // a layer the recipe just made shows its sliders once it ran (a moment): wait for them
        for (let i = 0; i < 25 && m.why && s.on?.made && made.has(s.on.made); i += 1) { await sleep(150); m = C.matchSlider(s, sceneModel().layers, made); }
        if (m.why) return m.why;
        if (s.k === 'slider') d.sliders(m.layer.id, { [m.ctl.key]: C.valueFor(s, m.ctl) });
        else HK().ctlOf?.(m.layer.id)?.link?.(m.ctl.key, C.linkFor(s, m.ctl));
        return null;
      }
      case 'cam': if (typeof LabCamera === 'undefined') return '🎥 isn\'t loaded'; return LabCamera.setAll(s.moves, { rel: true, label: '🎥 Camera moves (recipe)' }); // (round 40, labcamera)
      case 'mat': if (!window.LabMatHook) return '◉ looks aren\'t loaded'; return LabMatHook.replay(s); // (round 50, labmaterials)
      case 'groups': if (typeof LabGroups === 'undefined') return '📁 groups aren\'t loaded'; return LabGroups.replay(s); // (round 44, layergroups)
      default: return 'an unknown step';
    }
  }
  let undoLast = null; // { id, name, before }
  // the recipe on the scene on screen, as one change: → { name, applied, skipped: [{ text, why }] }
  async function use(r, { quiet = false } = {}) {
    await lab();
    if (R.on && onScene() && !(await Modal.confirm('Stop recording first?', 'A recipe is being recorded on this scene. Using one now would mix them up.', { ok: 'Stop and use' }))) return null;
    if (R.on && onScene()) await stop();
    const id = SC().currentId();
    const before = beforeState();
    const label = `📜 Recipe "${r.name}"`;
    const abDone = window.LabAB?.hold?.('recipe', { label });
    const made = new Map();
    const res = { name: r.name, scene: SC().get(id)?.name || '', applied: 0, skipped: [] };
    const unmute = muteToasts();
    R.replaying = true;
    try {
      await window.ThreeHistory?.flush?.(id);
      for (const s of r.steps) {
        if (SC().currentId() !== id) { res.skipped.push({ text: C.describe(s), why: 'the scene changed on screen' }); continue; }
        let why = null;
        try { why = await runStep(s, made); } catch (e) { why = e.message; }
        if (why) res.skipped.push({ sid: s.sid, text: C.describe(s), why }); else res.applied += 1;
        await sleep(30);
      }
      await sleep(300);
    } finally { unmute(); R.replaying = false; abDone?.(); }
    window.ThreeHistory?.capture?.(id, { kind: 'restore', label: `${label} (${res.applied} step${res.applied === 1 ? '' : 's'})`, force: true })?.catch?.(() => {});
    undoLast = { id, name: r.name, before };
    last.replay = res;
    if (!quiet) {
      const sk = res.skipped.length ? ` · ${res.skipped.length} skipped (${res.skipped.slice(0, 2).map((x) => x.why).join('; ')}${res.skipped.length > 2 ? '…' : ''})` : '';
      toast(`📜 "${r.name}": ${res.applied} of ${r.steps.length} steps${sk}`, { timeout: 7000, action: { label: 'Undo', fn: () => undo().catch(err) } });
    }
    return res;
  }
  // back to the scene as it was before the last replay (one step: layers, slider values, palette, links, frame…)
  async function undo() {
    const u = undoLast;
    if (!u) { toast('No recipe to undo.', { timeout: 1500 }); return false; }
    await lab();
    if (SC().currentId() !== u.id) { if (!SC().open(u.id)) throw new Error('That scene is gone.'); for (let i = 0; i < 40 && SC().currentId() !== u.id; i += 1) await sleep(100); await sleep(800); }
    const b = u.before;
    const abDone = window.LabAB?.hold?.('recipe', { label: `Undid recipe "${u.name}"` });
    R.replaying = true;
    try {
      ThreeLab.tm.show(b.st, { keep: true });
      await sleep(250);
      for (const [lid, keys] of Object.entries(b.links)) {
        const ctl = HK().ctlOf?.(lid);
        if (!ctl) continue;
        for (const c of ctl.controls()) if (c.key in keys && JSON.stringify(c.followsMusic || null) !== JSON.stringify(keys[c.key])) ctl.link(c.key, keys[c.key]);
      }
      if (b.frame && HK().size?.id !== b.frame.id) { const cmd = await ThreeLab.cmd({ show: false }); if (b.frame.id === 'custom') cmd.customSize(b.frame.width, b.frame.height); else cmd.size(b.frame.id); }
      if (b.trig && JSON.stringify(b.trig) !== JSON.stringify(D().triggers())) D().triggers(b.trig);
      store.set('three.export', b.exp ?? {});
      store.set('three.formats.picks', b.picks ?? null);
    } finally { R.replaying = false; abDone?.(); }
    window.ThreeHistory?.capture?.(u.id, { kind: 'restore', label: `Undid recipe "${u.name}"`, force: true })?.catch?.(() => {});
    undoLast = null;
    last.undone = { id: u.id, name: u.name };
    toast(`↶ Recipe "${u.name}" undone`, { timeout: 2500 });
    return true;
  }
  // one recipe on several scenes, one after another (each its own undo in its time machine); back to where you were
  async function useMany(r, ids) {
    await lab();
    const home = SC().currentId();
    const out = [];
    for (const id of ids) {
      if (!SC().get(id)) continue;
      if (SC().currentId() !== id) { SC().open(id); for (let i = 0; i < 60 && SC().currentId() !== id; i += 1) await sleep(100); await sleep(1200); }
      try { const res = await use(r, { quiet: true }); out.push({ id, name: res.scene, applied: res.applied, skipped: res.skipped.length }); } catch (e) { out.push({ id, name: SC().get(id)?.name, error: e.message }); }
    }
    undoLast = null; // a batch is undone scene by scene in each one's time machine
    if (home && SC().currentId() !== home) SC().open(home);
    last.batch = out;
    toast(`📜 "${r.name}" on ${out.filter((x) => !x.error).length} scene${out.length === 1 ? '' : 's'}${out.some((x) => x.skipped) ? ' (some steps skipped)' : ''} · each scene's ◷ History can take it back`, { timeout: 7000 });
    return out;
  }

  // ---------- the picker: names and steps · what fits this scene · ▶ Use · edit · share · delete ----------
  let pk = null; // { dlg, shade, sel, q, batch }
  function close() { pk?.dlg.close(); pk?.dlg.remove(); pk?.shade.remove(); pk = null; }
  async function open({ query = '', pick = null, batch = false } = {}) {
    await lab();
    close();
    const all = await list({ fresh: true });
    const shade = el('div', { class: 'rc-shade', on: { click: () => close() } });
    const search = el('input', { class: 'rc-search', type: 'search', placeholder: 'Find a recipe…', value: query });
    const listBox = el('div', { class: 'rc-list', attrs: { role: 'listbox' } });
    const detail = el('div', { class: 'rc-detail' });
    const dlg = el('dialog', { class: 'rc-dlg', attrs: { 'aria-label': 'Recipes' } },
      el('div', { class: 'rc-head' }, el('h2', { text: batch ? '📜 Use a recipe on several scenes' : '📜 Recipes' }), search,
        el('button', { type: 'button', class: 'ghost small rc-x', text: '✕', title: 'Close (Esc)', on: { click: () => close() } })),
      el('div', { class: 'rc-body' }, listBox, detail),
      el('div', { class: 'rc-foot' }, el('span', { class: 'muted small', text: 'Recipes replay your recorded Lab steps on the scene on screen: no tokens.' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: R.on ? 'primary rc-rec-btn' : 'ghost rc-rec-btn', text: R.on ? '■ Stop recording…' : '● Record a recipe', on: { click: () => { close(); toggleRecord().catch(err); } } })));
    pk = { dlg, shade, sel: pick || all[0]?.id || null, q: query, batch, all };
    document.body.append(shade, dlg);
    dlg.addEventListener('close', () => { if (pk?.dlg === dlg) close(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const vis = C.search(pk.all, pk.q); const i = vis.findIndex((r) => r.id === pk.sel); const n = vis[Math.max(0, Math.min(vis.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) { pk.sel = n.id; paint(); } }
      if (e.key === 'Enter' && e.target === search) { e.preventDefault(); const r = pk.all.find((x) => x.id === pk.sel); if (r && !pk.batch) go(r); }
    });
    search.addEventListener('input', () => { pk.q = search.value; const vis = C.search(pk.all, pk.q); if (!vis.some((r) => r.id === pk.sel)) pk.sel = vis[0]?.id || null; paint(); });
    function paint() {
      const vis = C.search(pk.all, pk.q);
      listBox.replaceChildren(...(vis.length ? vis.map((r) => el('button', { type: 'button', class: `rc-item${r.id === pk.sel ? ' on' : ''}`, dataset: { id: r.id }, attrs: { role: 'option', 'aria-selected': String(r.id === pk.sel) },
        on: { click: () => { pk.sel = r.id; paint(); }, dblclick: () => { if (!pk.batch) go(r); }, contextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, cardMenu(r)); } } },
      el('b', { class: 'rc-item-name', text: r.name }), el('span', { class: 'rc-item-sum muted', text: `${C.summary(r)}${r.from ? ` · from ${r.from}` : ''}` }))) : [el('div', { class: 'rc-none muted', text: pk.all.length ? 'Nothing matches.' : 'No recipes yet.' })]));
      const r = pk.all.find((x) => x.id === pk.sel);
      detail.replaceChildren(r ? detailOf(r) : emptyDetail());
    }
    pk.paint = paint;
    paint();
    dlg.show();
    search.focus();
    return pk;
  }
  function emptyDetail() {
    return el('div', { class: 'rc-empty' }, el('div', { class: 'rc-empty-big', text: '📜' }),
      el('p', { text: 'A recipe is your usual finishing steps, recorded once: the look, the filters with their settings, the palette, the frame size, the music links, the sliders you always move.' }),
      el('p', { class: 'muted', text: 'Record it on one scene, then replay it on any other scene in one click. Steps that don\'t fit a scene are skipped with a note.' }),
      el('button', { type: 'button', class: 'primary', text: '● Record a recipe', on: { click: () => { close(); start().catch(err); } } }));
  }
  function detailOf(r) {
    const p = planFor(r);
    const fits = p.filter((x) => x.ok).length;
    const orphan = new Set(C.orphans(r.steps));
    const name = el('input', { class: 'rc-name', value: r.name, title: 'Rename', on: { change: () => { const v = C.safeName(name.value); if (v !== r.name) { r.name = uniqueName(v, pk.all.filter((x) => x !== r)); save(r).then(() => pk?.paint?.()).catch(err); } } } });
    const rows = r.steps.map((s, i) => {
      const pl = p[i] || { ok: true };
      return el('li', { class: `rc-step${pl.ok ? '' : ' rc-skip'}`, dataset: { sid: s.sid } },
        el('span', { class: 'rc-step-ic', text: C.icon(s) }),
        el('span', { class: 'rc-step-txt' }, el('span', { text: C.describe(s) }), el('small', { class: 'muted', text: pl.ok ? (pl.where ? `✓ ${pl.where}` : '✓') : `skipped here: ${pl.why}${orphan.has(s.sid) ? ' (move it below the step that makes its layer)' : ''}` })),
        el('span', { class: 'rc-step-ed' },
          el('button', { type: 'button', class: 'ghost small rc-up', text: '↑', title: 'Earlier', disabled: i === 0, on: { click: () => edit(r, C.move(r.steps, i, -1)) } }),
          el('button', { type: 'button', class: 'ghost small rc-down', text: '↓', title: 'Later', disabled: i === r.steps.length - 1, on: { click: () => edit(r, C.move(r.steps, i, 1)) } }),
          el('button', { type: 'button', class: 'ghost small rc-del', text: '✕', title: 'Remove this step', on: { click: () => edit(r, C.drop(r.steps, i)) } })));
    });
    const scene = SC().get(SC().currentId())?.name || 'this scene';
    const batchBox = pk?.batch ? batchPicker(r) : null;
    return el('div', { class: 'rc-d' },
      el('div', { class: 'rc-d-head' }, name, el('span', { class: 'muted small rc-fit', text: `${fits} of ${r.steps.length} steps fit "${scene}"` })),
      el('ol', { class: 'rc-steps' }, rows),
      batchBox,
      el('div', { class: 'rc-d-actions' },
        pk?.batch ? null : el('button', { type: 'button', class: 'primary rc-use', text: `▶ Use on "${scene}"`, title: 'All the steps that fit, as one undo step (Enter)', on: { click: () => go(r) } }),
        el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More: several scenes, share, show in folder, delete', on: { click: (e) => showMenu(e.clientX, e.clientY, cardMenu(r)) } })));
  }
  function cardMenu(r) {
    return [
      { label: '▶ Use on this scene', action: () => go(r) },
      { label: 'Use on several scenes…', action: () => { if (pk) { pk.batch = true; pk.sel = r.id; pk.paint(); } } },
      { label: '⇪ Share as a pack…', action: () => share(r).catch(err) },
      { label: 'Show in folder', action: () => window.hub.reach?.open?.({ path: r._file, how: 'reveal' }) },
      { label: 'Delete…', danger: true, action: () => remove(r, { ask: true }).then((ok) => { if (ok && pk) { pk.all = cache || []; pk.sel = pk.all[0]?.id || null; pk.paint(); } }).catch(err) },
    ];
  }
  async function edit(r, stepsNext) {
    r.steps = stepsNext;
    await save(r);
    if (pk) { pk.all = cache || pk.all; pk.paint(); }
  }
  function go(r) { close(); use(r).catch(err); }
  // the recent scenes (newest first), ticked to run the recipe on
  function batchPicker(r) {
    const here = SC().currentId();
    const recent = (SC().all() || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 12);
    const boxes = recent.map((x) => el('label', { class: 'rc-bscene' }, el('input', { type: 'checkbox', checked: x.id === here, dataset: { id: x.id } }), el('span', { text: x.name })));
    const run = el('button', { type: 'button', class: 'primary rc-batch-go', text: '▶ Use on the ticked scenes', on: { click: () => { const ids = boxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.dataset.id); if (!ids.length) { toast('Tick a scene first', { timeout: 1500 }); return; } close(); useMany(r, ids).catch(err); } } });
    return el('div', { class: 'rc-batch' }, el('b', { text: 'Recent scenes' }), el('div', { class: 'rc-bscenes' }, boxes), run);
  }

  // ---------- sharing: a .hearthpack of kind "recipe" ----------
  async function packs() {
    if (typeof LabPacks === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('packs');
    if (typeof LabPacks === 'undefined') throw new Error('Packs did not load');
    return LabPacks;
  }
  async function share(r) {
    const P = await packs();
    return P.save({ kind: 'recipe', name: r.name, desc: C.summary(r), scenes: [], recipe: clean(r), thumb: null });
  }
  // a .hearthpack of kind "recipe" opened (tools/three-packs.js)
  async function fromPack(m) {
    const ck = C.check(m.recipe);
    if (!ck.r || !ck.r.steps.length) throw new Error(`The recipe in the pack can't be used: ${ck.problems.join(' ') || 'no steps'}`);
    const all = await list();
    const r = C.make({ name: uniqueName(ck.r.name || m.name, all), steps: ck.r.steps, from: ck.r.from });
    await save(r);
    toast(`📜 "${r.name}" is in your recipes`, { timeout: 6000, action: { label: 'See it', fn: () => open({ pick: r.id }).catch(err) } });
    return { recipe: r.name, id: r.id, steps: r.steps.length };
  }

  // ---------- for the AI and power users: /recipe ----------
  const stepsText = (r) => { const p = planFor(r); return r.steps.map((s, i) => `${i + 1}. ${C.describe(s)}${p[i]?.ok ? '' : ` — skipped here: ${p[i]?.why}`}`).join('\n'); };
  const listText = (all) => (all.length ? `Recipes (newest first): ${all.map((r) => `"${r.name}" (${C.summary(r)})`).join(' · ')}` : 'No recipes yet (the owner records one from ✦ More › 📜 Recipes › ● Record a recipe).');
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('recipe')) return;
    Commands.register({
      name: 'recipe', aliases: ['lab-recipe'], area: 'Three.js Lab',
      args: '[list | show <name> | use <name> | undo | record | stop [name] | share <name> | delete <name>]',
      desc: 'Lab recipes (no tokens): your finishing steps recorded once on a scene, replayed on the scene on screen as one undo step; alone: the picker',
      keywords: 'recipe recipes macro record replay repeat steps finishing again same look batch preset sequence of actions automate',
      examples: ['/recipe', '/recipe list', '/recipe use Finish', '/recipe record', '/recipe undo'],
      complete: (a) => { const s = String(a || ''); const w = s.split(/\s+/)[0].toLowerCase(); if (!s.includes(' ')) return ['list', 'show ', 'use ', 'undo', 'record', 'stop ', 'share ', 'delete '].filter((x) => x.startsWith(w)).map((value) => ({ value })); return (cache || []).filter((r) => r.name.toLowerCase().startsWith(s.slice(w.length + 1).toLowerCase())).slice(0, 12).map((r) => ({ value: `${w} ${r.name}` })); },
      async run(args, ctx = {}) {
        const s = String(args || '').trim();
        const m = /^(\w+)\b\s*(.*)$/s.exec(s);
        const op = (m?.[1] || '').toLowerCase(); const rest = (m?.[2] || '').trim();
        const byAI = ctx.source === 'code';
        const all = await list({ fresh: true });
        if (!op || op === 'open' || op === 'pick') { if (byAI) return listText(all); await open({ query: rest }); return ''; }
        if (op === 'list') return listText(all);
        if (op === 'undo') return (await undo()) ? 'Undone: the scene is back as it was before the recipe.' : 'No recipe to undo.';
        if (op === 'record' || op === 'start') { if (byAI) return 'Recording is the owner\'s to do (✦ More › 📜 Recipes › ● Record a recipe).'; await start(); return ''; }
        if (op === 'stop') { if (!R.on) return 'Not recording.'; const r = await stop({ name: byAI || rest ? rest || def0(R.name) : null }); return r ? `Kept "${r.name}" (${C.summary(r)}).` : ''; }
        if (op === 'state' || op === 'status') return R.on ? `Recording on "${R.name}": ${steps().length} steps.` : `Not recording. ${listText(all)}`;
        const r = byName(rest, all);
        if (!r) return `No recipe "${rest}". ${listText(all)}`;
        if (op === 'show' || op === 'steps' || op === 'info') return `"${r.name}" (${C.summary(r)}), on the scene on screen:\n${stepsText(r)}`;
        if (op === 'use' || op === 'apply' || op === 'run') { const res = await use(r, { quiet: byAI }); return res ? `Used "${r.name}" on "${res.scene}": ${res.applied} of ${r.steps.length} steps${res.skipped.length ? `; skipped: ${res.skipped.map((x) => `${x.text} (${x.why})`).join('; ')}` : ''}. /recipe undo takes it back.` : 'Not used.'; }
        if (op === 'share') { if (byAI) return 'Sharing is the owner\'s to do: suggest ⇪ Share as a pack… in the recipe picker.'; const x = await share(r); return x ? `Saved ${x.path}.` : ''; }
        if (op === 'delete' || op === 'remove') { if (byAI) return 'Deleting a recipe is the owner\'s to do: suggest it.'; return (await remove(r, { ask: true })) ? `"${r.name}" is in the Trash.` : 'Kept.'; }
        if (op === 'batch' || op === 'many') { if (byAI) return 'Running on several scenes is the owner\'s to start (the recipe picker › ⋯ › Use on several scenes…).'; await open({ batch: true, pick: r.id }); return ''; }
        return 'Try: list, show <name>, use <name>, undo, record, stop [name].';
      },
    });
  }
  function actions() {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Lab: Record a recipe (your finishing steps, replayed on any scene)', () => toggleRecord().catch(err));
    AppUI.addAction('Lab: Use a recipe… (replay recorded steps on this scene)', () => open().catch(err));
  }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { start, stop, cancel, toggleRecord, open, close, use, useMany, undo, list, save, remove, share, fromPack, byName, root, planFor, snapshot, sceneModel, last,
    state: () => ({ recording: R.on ? { scene: R.name, steps: steps().map(C.describe) } : null, picker: Boolean(pk), count: cache?.length ?? null, canUndo: Boolean(undoLast) }),
    get steps() { return steps(); } };
})();
window.LabRecipes = LabRecipes;
