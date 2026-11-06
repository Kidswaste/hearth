// (round 138, favs138) ★ Favourite controls (docs/upgrades/favs138.md), in one check, on a two-layer scene it makes:
//   1. the ★ panel is folded by default (only the ★ in the Sliders panel's head) and a click opens it
//   2. ✦ Suggest favourites from a fixture time-machine history: the most-changed sliders first (Glow 3, Contrast 2,
//      Noise 1), never-changed ones not at all, no AI sent
//   3. pin 2 sliders from 2 layers (their right-click) and 1 dial (its ⋯): the panel shows each with its layer name,
//      its own range, 🔒 and ◆
//   4. moving a pinned control moves the real slider, live with no undo step; the release is ONE step, and Ctrl/⌘+Z
//      in the panel puts it back
//   5. reorder by drag, unpin with ✕
//   6. saved with the scene: kv three-sketches, and the same pins after another scene and back
//   7. ◉ Perform's strip shows ★ folded; a click opens the panel there
// Only the check's own temp data (smoke.js); never an owner's scene.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/favs138.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));

try {
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.stageHooks?.pane && window.ThreeHistory && typeof TMCore !== 'undefined', 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks;
  const MAIN = `import * as THREE from 'three';
const P = tweak({ speed: { value: 1, min: 0, max: 4, label: 'Speed' }, glow: { value: 0.5, min: 0, max: 2, label: 'Glow' }, noise: { value: 0.1, min: 0, max: 1, label: 'Noise' } });
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
renderer.setAnimationLoop((t) => { scene.background.setRGB(Math.min(1, P.glow * 0.45), P.noise * 0.2, 0); camera.rotation.z = t * 0.0001 * P.speed; renderer.render(scene, camera); });`;
  const BACK = `import * as THREE from 'three';
const P = tweak({ contrast: { value: 1, min: 0.5, max: 2, label: 'Contrast' }, brightness: { value: 0.6, min: 0, max: 1, label: 'Brightness' } });
const renderer = new THREE.WebGLRenderer({ alpha: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 5;
const m = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); scene.add(m);
renderer.setAnimationLoop(() => { m.material.color.setScalar(P.brightness); m.scale.setScalar(P.contrast); renderer.render(scene, camera); });`;
  const layers = [ThreeLayers.defaults({ id: 'fvBack', name: 'Back', code: BACK, slot: 0 }), ThreeLayers.defaults({ id: 'fvMain', name: 'Main', code: MAIN, slot: 1 })];
  const sk = SC.create({ name: 'Favourites check', code: BACK, layers, frame: '16:9' });
  const other = SC.create({ name: 'Favourites check · other', code: BACK, layers: [ThreeLayers.defaults({ id: 'fvOther', name: 'Other', code: BACK, slot: 0 })], frame: '16:9' });
  // the fixture history (kv three-tm-<scene>, as the time machine writes it): Glow changed in 3 versions, Contrast in 2, Noise in 1
  {
    const T = TMCore; const doc = T.blank(); const base = SC.get(sk.id).layers.map((L) => JSON.parse(JSON.stringify(L)));
    const vals = [{}, { fvMain: { glow: 0.8 } }, { fvMain: { glow: 1.2 }, fvBack: { contrast: 1.4 } }, { fvMain: { glow: 0.3 }, fvBack: { contrast: 1.4 } }, { fvMain: { glow: 0.3, noise: 0.5 }, fvBack: { contrast: 0.7 } }];
    const t0 = Date.now() - 60000;
    vals.forEach((v, i) => T.add(doc, { layers: base, vals: v, sel: null, palette: null }, { at: t0 + i * 1000, kind: i ? 'sliders' : 'start', label: i ? 'Sliders' : 'Opened', by: i === 2 ? 'claude' : 'you' }));
    await window.hub.kvSet(`three-tm-${sk.id}`, doc);
  }
  SC.open(sk.id);
  const ctl = (id) => hk.ctlOf(id);
  await until(() => SC.currentId() === sk.id && ctl('fvMain')?.controls().some((c) => c.key === 'noise' && c.live === true) && ctl('fvBack')?.controls().some((c) => c.key === 'brightness' && c.live === true), 30000);
  const val = (id, key) => ctl(id).controls().find((c) => c.key === key)?.value;
  const select = async (id) => { ThreeLab.search.selectLayer(id); await until(() => hk.layer()?.id === id, 5000); await wait(250); };
  const visRoot = () => [...document.querySelectorAll('.tweaks')].find((r) => r.offsetParent);
  const rowFor = (label) => [...(visRoot()?.querySelectorAll('.tw-row, .tw-knob-cell') || [])].find((r) => (r.querySelector('.tw-name, .tw-ktop')?.textContent || '').trim() === label);
  const menuPick = async (re) => { const mi = await until(() => [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => re.test(x.textContent)), 4000); mi?.click(); await wait(200); return Boolean(mi); };
  const rightClick = (node) => { const r = node.getBoundingClientRect(); node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); };
  const pop = () => document.querySelector('.fv-pop');
  const rows = () => [...(pop()?.querySelectorAll('.fv-row') || [])];
  const rowOf = (name) => rows().find((r) => r.querySelector('.fv-name')?.textContent === name);

  // ---------- 1. folded by default; the ★ opens it ----------
  await select('fvMain');
  const star = visRoot()?.querySelector('.tw-favs');
  step('folded by default: no ★ panel, only a small ★ in the Sliders panel\'s head (no toolbar row)', Boolean(star) && star.offsetParent && !pop() && star.closest('.tw-head'), { star: Boolean(star), pop: Boolean(pop()) });
  star?.click();
  await until(() => pop(), 15000);
  step('a click on ★ opens the compact panel (its lazy group loaded on first use)', Boolean(pop()) && typeof LabFavs !== 'undefined' && pop().offsetWidth <= 270 && /Pin to favourites/.test(pop().textContent), { w: pop()?.offsetWidth });

  // ---------- 2. ✦ Suggest favourites, from the fixture history ----------
  {
    pop().querySelector('.fv-suggest')?.click();
    const got = await until(() => (LabFavs.state().suggestions.length ? LabFavs.state().suggestions : null), 10000) || [];
    const names = got.map((s) => `${s.layerName}:${s.label}:${s.n}`);
    step('✦ Suggest favourites picks the most-changed sliders from the history, best first (Glow, Contrast, Noise); never-changed ones are left out', got[0]?.key === 'glow' && got[1]?.key === 'contrast' && got[2]?.key === 'noise' && !got.some((s) => s.key === 'speed' || s.key === 'brightness') && pop().querySelectorAll('.fv-sug').length === got.length, names);
    LabFavs.close();
  }

  // ---------- 3. pin 2 sliders from 2 layers and 1 dial ----------
  {
    const g = rowFor('Glow');
    if (g) rightClick(g);
    const okG = await menuPick(/★ Pin to favourites/);
    await select('fvBack');
    const c = rowFor('Contrast');
    if (c) rightClick(c);
    const okC = await menuPick(/★ Pin to favourites/);
    await Lazy.load('dials'); await LabDials.open(); await wait(200);
    document.querySelector('.md-pop .md-local')?.click(); await wait(200);
    [...document.querySelectorAll('.md-pop .md-sug')].find((r) => r.querySelector('b')?.textContent === 'Energy')?.querySelector('.md-keep')?.click(); await wait(200);
    const energy = LabDials.state().dials.find((d) => d.name === 'Energy');
    [...document.querySelectorAll('.md-pop .md-row')].find((r) => r.dataset.id === energy?.id)?.querySelector('.md-more')?.click();
    const okD = await menuPick(/★ Pin to favourites/);
    LabDials.close();
    const list = hk.favs()?.list || [];
    step('pinned: Glow (Main) and Contrast (Back) from their right-click, Energy from its dial ⋯', okG && okC && okD && list.length === 3 && list[0].layer === 'fvMain' && list[0].key === 'glow' && list[1].layer === 'fvBack' && list[1].key === 'contrast' && list[2].t === 'd' && list[2].dial === energy?.id, list);
    step('…and stays folded after pinning (no panel opened by itself)', !pop());
    await select('fvMain');
    visRoot()?.querySelector('.tw-favs')?.click();
    await until(() => rows().length === 3, 8000);
    const r = rows();
    const lay = r.map((x) => x.querySelector('.fv-layer')?.textContent);
    const gIn = rowOf('Glow')?.querySelector('input[type=range]');
    step('the panel: each pin with its layer name in small type, its own range, 🔒 and ◆ (and the dial\'s ◆)', JSON.stringify(lay) === JSON.stringify(['Main', 'Back', '🎛 Dial']) && gIn?.min === '0' && gIn?.max === '2' && rowOf('Contrast')?.querySelector('input[type=range]')?.min === '0.5' && r.slice(0, 2).every((x) => x.querySelector('.fv-lock') && x.querySelector('.fv-kf')) && r[2].querySelector('.fv-kf'), { lay, min: gIn?.min, max: gIn?.max });
  }

  // ---------- 4. moving a pinned control moves the real slider; one undo step ----------
  {
    const inp = rowOf('Glow').querySelector('input[type=range]');
    const before = val('fvMain', 'glow'); const steps0 = LabDirect.steps.length; const d0 = ctl('fvMain').undoDepth;
    inp.value = 1.6; fire(inp, 'input'); await wait(120);
    step('moving the pinned Glow moves the real slider on its layer, live, with no undo step yet', val('fvMain', 'glow') === 1.6 && LabDirect.steps.length === steps0 && ctl('fvMain').undoDepth === d0, { before, now: val('fvMain', 'glow') });
    fire(inp, 'change'); await wait(200);
    step('…the release is ONE undo step (the slider\'s own, and the Lab\'s Ctrl/⌘+Z)', LabDirect.steps.length === steps0 + 1 && ctl('fvMain').undoDepth === d0 + 1, { lab: LabDirect.steps.length - steps0, slider: ctl('fvMain').undoDepth - d0 });
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
    await wait(300);
    step('…one Ctrl/⌘+Z in the panel puts Glow back exactly', val('fvMain', 'glow') === before && Number(rowOf('Glow')?.querySelector('input[type=range]')?.value) === before, { before, now: val('fvMain', 'glow') });
  }

  // ---------- 5. reorder by drag, unpin with ✕ ----------
  {
    const dt = new DataTransfer();
    const grip = rows()[2].querySelector('.fv-grip'); const target = rows()[0];
    grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await wait(200);
    const names = () => rows().map((x) => x.querySelector('.fv-name')?.textContent);
    step('drag the dial\'s grip onto the first row: it moves to the top', JSON.stringify(names()) === JSON.stringify(['Energy', 'Glow', 'Contrast']) && hk.favs().list[0].t === 'd', names());
    rowOf('Contrast')?.querySelector('.fv-x')?.click(); await wait(200);
    step('✕ unpins Contrast (Back): two left, in order', JSON.stringify(names()) === JSON.stringify(['Energy', 'Glow']) && hk.favs().list.length === 2, names());
  }

  // ---------- 6. saved with the scene ----------
  {
    const want = JSON.stringify(hk.favs().list);
    const saved = await until(async () => { const list = await window.hub.kvGet('three-sketches', []); const s = (Array.isArray(list) ? list : []).find((x) => x.id === sk.id); return s?.favs && JSON.stringify(s.favs.list) === want ? s.favs : null; }, 8000);
    step('the pins are stored with the scene (kv three-sketches)', Boolean(saved), saved?.list);
    SC.open(other.id); await until(() => SC.currentId() === other.id, 10000); await wait(400);
    const away = LabFavs.state().list.length;
    SC.open(sk.id);
    await until(() => SC.currentId() === sk.id && ctl('fvMain')?.controls().some((c) => c.key === 'glow'), 20000); await wait(500);
    const back = LabFavs.state().list;
    step('…another scene has none of them; back on this scene, the same two in the same order', away === 0 && JSON.stringify(back.map((x) => x.id)) === JSON.stringify(['d:' + hk.favs().list[0].dial, 's:fvMain|glow']) && !back.some((x) => x.gone), { away, back: back.map((x) => `${x.layerName}:${x.label}`) });
  }

  // ---------- 7. ◉ Perform: the strip's ★, folded ----------
  {
    LabFavs.close();
    await Lazy.load('perform');
    await ThreePerform.start({ screen: 'here' });
    await until(() => ThreePerform.state.on && ThreePerform.strip, 8000);
    const b = await until(() => { const x = ThreePerform.strip?.querySelector('.pf-favs'); return x && !x.hidden ? x : null; }, 4000);
    step('◉ Perform\'s strip shows ★, folded (no panel open)', Boolean(b) && !pop(), { star: Boolean(b), pop: Boolean(pop()) });
    b?.click();
    await until(() => rows().length === 2, 6000);
    const opened = Boolean(pop()) && hk.host.contains(pop());
    const g0 = val('fvMain', 'glow');
    const inp = rowOf('Glow')?.querySelector('input[type=range]');
    if (inp) { inp.value = 1.9; fire(inp, 'input'); fire(inp, 'change'); await wait(150); }
    const live = val('fvMain', 'glow');
    ThreePerform.leave(); await wait(300);
    step('…a click opens it there; a move in Perform is live only and put back when Perform ends', opened && !pop() && live === 1.9 && val('fvMain', 'glow') === g0, { opened, live, after: val('fvMain', 'glow'), g0 });
  }
  // (left open for the check's picture)
  await LabFavs.open();
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
