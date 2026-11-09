// (round 158, split158) The Lab opens lighter: tools/three.js keeps what the first paint needs, its cold parts are lazy
// groups loaded on first use (tools/three-lab-*.js, docs/upgrades/split158.md). ONE check, its own temp data and a
// fixture scene (never an owner's scene):
//   core      opening the Lab, a scene playing, selecting each layer, moving knobs and the director's everyday calls
//             (layers, sliders, select, code, screenshot, add / update / remove a layer, console) load no part
//   parts     each part on its first use: its group loads, then the feature works (the Tools drawer's model viewer,
//             References, Notes, MIDI, Live ▾, the compare menu, all sketches / Present's right-click, the toolbar's ⋯
//             (and Lab search's menus read at once after), the scene editor, the timeline's lanes menu, the director's notes tool); a second use is in the same task
//   window    the Lab window opens with no part loaded either
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/split158.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const PARTS = ['labparttools', 'labpartrefs', 'labpartnotes', 'labpartmidi', 'labpartlive', 'labpartcapture', 'labpartdialogs', 'labpartmenus', 'labpartedit', 'labpartlanes', 'labpartai'];
const loadedParts = () => Lazy.state().filter((g) => PARTS.includes(g.name) && g.state !== 'stub').map((g) => g.name);
const drawn = (n) => Boolean(n?.isConnected && n.getClientRects().length && n.getBoundingClientRect().width > 0);
const menuNow = () => { const m = document.getElementById('menu'); if (m && !m.hidden && drawn(m)) return m; return [...document.querySelectorAll('.mb-menu.lab-pop, .mb-menu')].find(drawn) || null; };
const closeMenus = () => { try { hideMenu(); } catch { /* none */ } document.querySelectorAll('.mb-menu').forEach((m) => m.remove()); document.querySelectorAll('.note-card').forEach((m) => m.remove()); };
const lab = () => document.querySelector('.surface.active') || document;
const byTitle = (re) => [...lab().querySelectorAll('button')].find((b) => re.test(b.title || '') || re.test(b.textContent || ''));
// a part's first use: not loaded before, loaded after, and what it shows
async function firstUse(name, group, act, shows, ms = 15000) {
  closeMenus(); await wait(150);
  const before = Lazy.state().find((g) => g.name === group)?.state;
  let err = null;
  try { await act(); } catch (e) { err = String(e?.message || e); }
  const got = await until(shows, ms);
  const after = Lazy.state().find((g) => g.name === group)?.state;
  step(`${name}: its part (${group}) loads on the first use and the feature works`, before === 'stub' && after === 'loaded' && Boolean(got) && !err, { before, after, shows: Boolean(got), err });
  return got;
}

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } });
  // ---------- core ----------
  step('the first screen: no part of the Lab loaded', !loadedParts().length, { lab: Lazy.state().find((g) => g.name === 'lab')?.state, parts: loadedParts() });
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.workspace?.state?.().ready, 60000);
  const pv = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))?.result?.value;
  await until(async () => (await pv('window.__labPace?.state()?.drawn')) > 0, 60000, 100);
  step('the Lab opened (its preview drew) with only the core: no part loaded', !loadedParts().length, { parts: loadedParts(), three: Lazy.state().find((g) => g.name === 'lab')?.state });
  const D = ThreeLab.director;
  await D.newSketch('Split check fixture (split158)', `import * as THREE from 'three';
const P = tweak({ spin: { value: 1, min: 0, max: 4, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const r = new THREE.WebGLRenderer({ antialias: false }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const s = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.z = 5;
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 64, 8), new THREE.MeshNormalMaterial()); s.add(m);
r.setAnimationLoop((t) => { m.rotation.y = t / 900 * P.spin; m.scale.setScalar(P.size); r.render(s, cam); });`, 1);
  await D.addLayer({ name: 'Second layer', code: "import * as THREE from 'three';\nconst P = tweak({ glow: { value: 0.5, min: 0, max: 1, label: 'Glow' } });\nconst r = new THREE.WebGLRenderer({ alpha: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);\nr.setAnimationLoop(() => r.render(new THREE.Scene(), new THREE.PerspectiveCamera()));" }, 1);
  const c = await ThreeLab.cmd();
  try { c.play(true); } catch { /* no timeline */ }
  await wait(1200);
  for (const row of [...lab().querySelectorAll('.ly-row[data-id]')]) { row.click(); await wait(300); }
  const ranges = [...lab().querySelectorAll('input[type=range]')].filter((n) => n.getClientRects().length).slice(0, 6);
  for (const n of ranges) { const lo = Number(n.min || 0), hi = Number(n.max || 1); for (const f of [0.3, 0.7]) { n.value = String(lo + (hi - lo) * f); n.dispatchEvent(new Event('input', { bubbles: true })); await wait(50); } n.dispatchEvent(new Event('change', { bubbles: true })); }
  step('playing, selecting each layer and moving knobs load no part', !loadedParts().length && ranges.length > 0, { parts: loadedParts(), knobs: ranges.length });
  // the director's everyday calls on a fresh Lab
  const calls = {};
  for (const [tool, args] of [['three_layers', {}], ['three_sliders', {}], ['three_select_layer', { layer: 'Second layer' }], ['three_get_code', {}], ['three_screenshot', {}],
    ['three_add_layer', { name: 'From the AI (split158)', code: "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer({ alpha: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);" }],
    ['three_update_layer', { layer: 'From the AI (split158)', settings: { visible: false } }], ['three_console', {}], ['three_remove_layer', { layer: 'From the AI (split158)' }]]) {
    const r = await HubBridge.call(tool, args, {});
    calls[tool] = r?.ok === false ? r.error : 'ok';
  }
  const layersNow = D.layers().layers.map((l) => l.name);
  step('the director\'s everyday calls work on the fresh Lab and load no part', Object.values(calls).every((v) => v === 'ok') && !layersNow.includes('From the AI (split158)') && !loadedParts().length, { calls, parts: loadedParts() });
  out.measure.coreParts = loadedParts();

  // ---------- parts, each on its first use ----------
  // the director's rarer tools (labpartai)
  const notesBefore = Lazy.state().find((g) => g.name === 'labpartai').state;
  const nr = await HubBridge.call('three_notes', { action: 'list' }, {});
  step('the director\'s notes tool: its part (labpartai) loads on the first call and answers', notesBefore === 'stub' && Lazy.loaded('labpartai') && nr?.ok !== false && Array.isArray(nr?.value?.notes), { before: notesBefore, r: nr?.ok === false ? nr.error : Object.keys(nr?.value || {}) });
  const tr = await HubBridge.call('three_triggers', {}, {});
  step('…and a second rare tool answers from the same part', tr?.ok !== false && tr?.value?.triggers, tr?.ok === false ? tr.error : 'ok');
  // References (labpartrefs)
  await firstUse('📎 References', 'labpartrefs', () => c.refs(), () => document.querySelector('dialog.refs-dialog[open]'));
  document.querySelector('dialog.refs-dialog')?.close();
  // Notes (labpartnotes)
  await firstUse('Notes', 'labpartnotes', () => byTitle(/^Your notes on this sketch/).click(), () => document.querySelector('.note-card.note-list'));
  // MIDI (labpartmidi): its menu (with or without a controller)
  await firstUse('🎛 MIDI', 'labpartmidi', () => byTitle(/^Use a MIDI controller/).click(), menuNow);
  // Live ▾ (labpartlive)
  await firstUse('🎧 Live ▾', 'labpartlive', () => byTitle(/^Make the sketch react to what your computer plays/).click(), () => (menuNow()?.textContent || '').includes('Make the sketch react to') && menuNow());
  // compare's right-click (labpartcapture)
  await firstUse('◐ Compare (right-click)', 'labpartcapture', () => { const b = [...lab().querySelectorAll('.stage-btn')].find((x) => x.textContent === '◐'); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 400 })); }, menuNow);
  // the dialogs (labpartdialogs): all your sketches
  await firstUse('▦ All your sketches', 'labpartdialogs', () => c.browse(), () => document.querySelector('dialog.sb-dialog[open]'));
  document.querySelector('dialog.sb-dialog')?.close();
  // …a layer's right-click from the same part: in the same task now (the part is in)
  closeMenus(); await wait(150);
  const pb = lab().querySelector('button[data-key="P"]');
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 });
  pb.dispatchEvent(ev);
  const pMenu = menuNow();
  step('▣ Present\'s right-click (same part, now in): its menu in the same task, the browser\'s own menu prevented', ev.defaultPrevented && Boolean(pMenu) && /From the top|Present/.test(pMenu?.textContent || ''), { prevented: ev.defaultPrevented, text: pMenu?.textContent?.slice(0, 80) });
  closeMenus();
  // the menus' rows (labpartmenus): the toolbar's ⋯
  await firstUse('the Lab\'s ⋯ menu', 'labpartmenus', () => byTitle(/^More: variations/).click(), () => (menuNow()?.textContent || '').includes('View & help') && menuNow());
  closeMenus();
  const M = ThreeLab.search.menus();
  step('…and Lab search reads the menus in the same task now (no promise)', !(M instanceof Promise) && Array.isArray(M.more) && Array.isArray(M.preview) && Array.isArray(M.sketch), { promise: M instanceof Promise });
  // the scene editor (labpartedit)
  await firstUse('✥ Edit (the scene editor)', 'labpartedit', () => c.edit(true), () => { const p = lab().querySelector('.ed-panel'); return p && !p.hidden && drawn(p); });
  await c.edit(false); await wait(300);
  step('…and Edit leaves again', lab().querySelector('.ed-panel')?.hidden !== false, { hidden: lab().querySelector('.ed-panel')?.hidden });
  // the timeline's lanes menu (labpartlanes): the timeline's own handler, as a click on a track's label calls it
  let handlers = null;
  const P0 = c.player; const st = P0.setTracks;
  P0.setTracks = function (list, h, o) { if (h) handlers = h; return st.call(this, list, h, o); };
  lab().querySelector('.ly-row[data-id]').click(); await wait(300);
  P0.setTracks = st;
  const lid = D.layers().layers[0]?.id || ThreeLab.search.layers()[0]?.id;
  await firstUse('the timeline\'s lanes menu', 'labpartlanes', () => handlers.onLanePick(ThreeLab.search.layers()[0].id, 500, 400), menuNow);
  closeMenus();
  // the Tools drawer's model viewer (labparttools)
  await firstUse('🧊 Model viewer (Tools drawer)', 'labparttools', () => ThreeLab.showTab('models'), () => document.querySelector('.model-side'));
  ThreeLab.showTab('sketch'); await wait(300);
  out.measure.lid = lid;
  out.measure.allParts = loadedParts();

  // ---------- the Lab window: no part at its open either ----------
  await smoke({ cdnFor: 'lab-window\\.html' });
  const view = (await ThreeLab.search.menus()).more.find((r) => Array.isArray(r) && r[0] === 'View & help');
  view[2].find((r) => Array.isArray(r) && /Open in its own window/.test(r[0]))[2]();
  const lwv = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: `(async () => JSON.stringify(await (async () => (${expr}))()))()` }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
  const opened = await until(async () => (await lwv('typeof LabWin !== "undefined" && LabWin.times().frame ? LabWin.times() : null')) || null, 60000, 200);
  const lwGroups = await lwv('Lazy.state().filter((g) => g.state === "loaded").map((g) => g.name)');
  const lwKnows = await lwv(`Lazy.state().filter((g) => ${JSON.stringify(PARTS)}.includes(g.name)).length`);
  step('the Lab window opens on the core too: no part loaded (all eleven known there, for first use)', Boolean(opened) && lwGroups?.includes('lab') && !lwGroups.some((g) => PARTS.includes(g)) && lwKnows === PARTS.length, { lwGroups, lwKnows });
  try { await window.hub.labwin.close?.(); } catch { /* closed with the app */ }
  await until(async () => !(await window.hub.labwin.state()).open, 15000);
} catch (err) { out.error = String(err?.stack || err); (out.problems ||= []).push('threw'); }
return out;
