// labcalm (round 48): the Lab screen, counted in its common states (empty, a scene with layers, a song with its
// timeline, the director docked, a 🧊 model picked on the picture) at 1280×800 and 2560×1440 (Emulation), with the
// pointer away from the Lab (what you see at rest). Budgets: visible controls per state and per part (toolbar, the
// picture's pill, timeline, layers); nothing opaque over the preview's centre (the middle half of the picture each
// way: frame guides drawn as thin outlines don't count); the toolbar keeps one row with the director docked at 1280;
// one name and icon per toolbar button (Full timeline's icon isn't ▤ Sequence's); a layer's timing folded with its
// state on the row; the "lighter" note folding to ◐; and every folded action still found by Lab search.
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/labcalm.js --shot /tmp/labcalm.png
// The counts per state are in the result ("counts") and in docs/upgrades/labcalm.md.
const out = { steps: [], counts: {}, overlaps: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const cdp = (method, params) => smoke({ cdp: method, params });
const SONG = '/tmp/hearth-test-song.wav';
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button], [role=switch], [role=slider], [role=tab]';
const vis = (n) => { if (!n.checkVisibility?.({ visibilityProperty: true, opacityProperty: true })) return false; const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
const PARTS = { toolbar: '.three-toolbar', pill: '.stage-pill', timeline: '.media-bar', layers: '.layers', sliders: '.tweaks', head: '.tool-head', dock: '.tool-dock' };
// the most visible controls per state at 1280 (at rest), and per part in any state
// (round 57, sweep57) + ▶ Play in the toolbar (round 53, playloop: the game mode's one entry point, on purpose): empty /
// layers 46 → 47, director 48 → 49, the toolbar 10 → 11; the one-row rule with the director docked is unchanged
const BUDGET = { empty: 47, layers: 47, song: 60, director: 49, model: 50 }; // before this pass: 47, 49, 68, 48, 48 (pill 10, a layer's timing 8 + a hint)
const PART_BUDGET = { toolbar: 11, pill: 6, layers: 9 };
const lab = () => H.surfaces.get('tool:three')?.el;

function collect() {
  const L = lab(); const res = { total: 0, parts: {}, centre: [], rows: 0 };
  for (const n of [...L.querySelectorAll(SEL)].filter(vis)) {
    if (n.closest('.messages')) continue; // the docked chat's own messages
    let best = null; for (const [k, s] of Object.entries(PARTS)) { const a = n.closest(s); if (a && (!best || best.a.contains(a))) best = { k, a }; }
    const k = best ? best.k : 'other';
    res.parts[k] = (res.parts[k] || 0) + 1; res.total += 1;
  }
  // the toolbar's rows (the tops of its visible groups)
  const tb = [...L.querySelectorAll('.three-toolbar')].find(vis);
  if (tb) { const ys = [...tb.querySelectorAll('button, select')].filter(vis).map((b) => { const r = b.getBoundingClientRect(); return (r.top + r.bottom) / 2; }).sort((a, b) => a - b); res.rows = ys.length ? 1 + ys.slice(1).filter((y, i) => y - ys[i] > 14).length : 0; }
  // nothing opaque over the middle of the picture
  const prev = [...L.querySelectorAll('.three-preview')].find(vis);
  const frame = prev && [...prev.querySelectorAll('iframe')].find(vis);
  const pr = (frame || prev)?.getBoundingClientRect();
  if (pr) {
    const c = { l: pr.left + pr.width * 0.25, r: pr.right - pr.width * 0.25, t: pr.top + pr.height * 0.25, b: pr.bottom - pr.height * 0.25 };
    for (const n of prev.querySelectorAll('*')) {
      if (n.tagName === 'IFRAME' || n.closest('iframe') || !vis(n)) continue;
      const r = n.getBoundingClientRect();
      if (r.width >= pr.width * 0.9 && r.height >= pr.height * 0.9) continue; // whole-picture layers (the canvas, the guides' box)
      if (!(r.left < c.r && r.right > c.l && r.top < c.b && r.bottom > c.t)) continue;
      const cs = getComputedStyle(n);
      const clear = (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent') && cs.backgroundImage === 'none';
      const ownText = [...n.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim());
      // a guide drawn as an outline (title safe…) whose words sit in its corner, outside the middle, is not covering
      if (clear && (!ownText || n.classList.contains('sz'))) continue;
      res.centre.push(`${n.tagName.toLowerCase()}.${String(n.className).slice(0, 30)} "${(n.textContent || '').trim().slice(0, 24)}"`);
    }
  }
  // an exact frame (9:16, 16:9…) sits clear of the pill at rest: the top of the picture is never under it
  const pill = prev && [...prev.querySelectorAll('.stage-pill')].find(vis);
  if (pill && frame && prev.classList.contains('exact')) {
    const a = pill.getBoundingClientRect(); const b = frame.getBoundingClientRect();
    res.pillOver = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }
  return res;
}
async function at(w, h) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await wait(900);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: Math.round(h * 0.55), button: 'none' }); // away from the Lab
  await wait(500);
}
async function state(name) {
  for (const [w, h] of [[2560, 1440], [1280, 800]]) {
    await at(w, h);
    const r = collect();
    out.counts[`${name}@${w}`] = { total: r.total, ...r.parts, toolbarRows: r.rows };
    if (r.centre.length) out.overlaps[`${name}@${w}`] = r.centre;
    if (w === 1280) {
      step(`${name}: at most ${BUDGET[name]} controls in sight at 1280 (${r.total})`, r.total <= BUDGET[name], r.parts);
      const over = Object.entries(PART_BUDGET).filter(([k, max]) => (r.parts[k] || 0) > max).map(([k]) => `${k} ${r.parts[k]} > ${PART_BUDGET[k]}`);
      step(`${name}: every part within its budget`, !over.length, over);
    }
    step(`${name}@${w}: nothing opaque over the middle of the picture`, !r.centre.length, r.centre);
    if (r.pillOver != null) step(`${name}@${w}: the frame-size pill sits clear of the picture`, r.pillOver < 1, Math.round(r.pillOver));
    if (window.__LABCALM_SHOTS) await smoke({ shot: `${window.__LABCALM_SHOTS}-${name}-${w}.png` });
  }
}

activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined', 60000);
const c = await ThreeLab.cmd(); await wait(2500);
await state('empty');

// a scene with three layers
const code = `import * as THREE from 'three';
const r = new THREE.WebGLRenderer(); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);
const s = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 120, 16), new THREE.MeshNormalMaterial()); s.add(m);
addEventListener('resize', () => { r.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
r.setAnimationLoop((t) => { m.rotation.y = t / 1000; r.render(s, cam); });`;
const layers = ['Knot', 'Glow', 'Grain'].map((name, i) => ThreeLayers.defaults({ id: `lc${i}`, name, code, slot: i }));
ThreeLab.scenes.create({ name: 'Calm check', code, layers, frame: '16:9', open: true });
await until(() => document.querySelectorAll('.ly-row[data-id]').length >= 3, 15000); await wait(2500);
await state('layers');

// the song and its timeline
try { await c.loadSong(SONG); await until(() => c.player?.loaded, 10000); } catch (e) { out.songError = String(e); }
await wait(1500);
await state('song');
{
  const d = [...document.querySelectorAll('.ly-plays')].find(vis);
  const st = d?.querySelector('.ly-plays-state')?.textContent || '';
  step('a layer\'s timing is one folded row saying where it stands', d && !d.open && /whole song|→/.test(st), st);
  if (d) { d.querySelector('summary').click(); await wait(200); }
  const inside = d ? [...d.querySelectorAll('input, button')].filter(vis).length : 0;
  step('…opened: start, end, here, fades and Animate ▾ are inside', inside >= 6, inside);
  if (d) { d.querySelector('summary').click(); await wait(150); }
  const vb = document.querySelector('.mb-video');
  step('🎬 waits in the timeline\'s ⋯ (every timeline control)', vb && !vis(vb));
  const full = document.querySelector('.mb-size-full'); const seq = [...document.querySelectorAll('.media-bar button')].find((b) => /Sequence/.test(b.textContent));
  step('Full timeline and ▤ Sequence don\'t share an icon', full && seq && full.textContent.trim()[0] !== seq.textContent.trim()[0], [full?.textContent, seq?.textContent]);
}

// the toolbar: one name and icon per button
{
  const want = { 'Layers & sliders': ['⚡', 'Sliders'], Console: ['›_', 'Console'], Present: ['▣', 'Present'] };
  const bad = [];
  for (const [f, [ic, name]] of Object.entries(want)) {
    const b = [...lab().querySelectorAll(`.three-toolbar [data-feature="${f}"]`)].find(vis);
    if (!b || b.querySelector('.tb-ic')?.textContent !== ic || !(b.getAttribute('aria-label') || '').startsWith(name)) bad.push(f);
  }
  step('the View buttons each have an icon and one name (⚡ Sliders, ›_ Console, ▣ Present…)', !bad.length, bad);
}

// the "lighter to stay smooth" note: words first, then a small ◐
try {
  const D = ThreeLab.director;
  await D.evalInSketch('window.__labAdapt?.set({ level: 3, hold: true }); return 1');
  const note = document.querySelector('.three-preview .lab-adapt-note');
  await until(() => note && !note.hidden, 5000);
  await until(() => note.classList.contains('quiet'), 9000);
  const r = note.getBoundingClientRect();
  step('the "lighter" note folds to a small ◐ within seconds (its words stay in its tooltip)', !note.hidden && note.classList.contains('quiet') && r.width <= 20 && /lighter/.test(note.textContent) && /Frames were dropping/.test(note.title), { w: r.width });
  await D.evalInSketch('window.__labAdapt?.set({ level: 0, hold: false }); return 1');
} catch (e) { step('the "lighter" note folds', false, String(e)); }

// the director docked
const claude = H.claudeAgent();
await Commands.tryRun('/director-setup', claude.id);
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
activate('tool:three'); await wait(2500);
await state('director');
step('the toolbar keeps one row with the director docked at 1280', out.counts['director@1280']?.toolbarRows === 1, out.counts['director@1280']?.toolbarRows);
// …and the pill shows its extras while you point at the picture (a second row: the sizes don't move)
{
  const prev = [...lab().querySelectorAll('.three-preview')].find(vis); const pr = prev.getBoundingClientRect();
  const sizeBtn = [...prev.querySelectorAll('.stage-size-btn')].find(vis); const before = sizeBtn?.getBoundingClientRect().left;
  // (on its way to a size button: the pointer over Freeze, in the pill itself)
  const fz = [...prev.querySelectorAll('.freeze-btn')].find(vis)?.getBoundingClientRect() || pr;
  for (const dx of [-6, 0]) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(fz.left + fz.width / 2 + dx), y: Math.round(fz.top + fz.height / 2), button: 'none' }); await wait(250); }
  const extras = [...prev.querySelectorAll('.stage-pill .stage-more, .stage-pill .stage-btn:not(.freeze-btn):not(.stage-size-btn)')].filter(vis).length;
  const after = sizeBtn?.getBoundingClientRect().left;
  step('pointing at the picture shows More…, 📷 and ⋯ without moving the size buttons', extras >= 3 && Math.abs(after - before) < 1, { extras, before, after, hover: prev.matches(':hover'), under: document.elementFromPoint(Math.round(fz.left + fz.width / 2), Math.round(fz.top + fz.height / 2))?.className });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 400, button: 'none' }); await wait(200);
}

// a 🧊 model, picked on the picture
function glb() {
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]); const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
  const b0 = new Uint8Array(pos.buffer); const b1 = new Uint8Array(idx.buffer); const bin = new Uint8Array(b0.length + b1.length); bin.set(b0); bin.set(b1, b0.length);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'calm' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] } }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: b0.length }, { buffer: 0, byteOffset: b0.length, byteLength: b1.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jp).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  return u;
}
try {
  const p = '/tmp/labcalm-model.glb';
  await hub.fs.write(p, glb());
  await Commands.tryRun(`/model add ${p}`, claude.id);
  await wait(4000);
  activate('tool:three'); await at(1280, 800);
  const f = [...document.querySelectorAll('.three-preview iframe')].find(vis); const r = f.getBoundingClientRect();
  for (const fy of [0.5, 0.45, 0.55]) {
    const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height * fy);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); await wait(500);
  }
} catch (e) { out.modelError = String(e); }
await state('model');

// every folded action is still found by Lab search (and Ctrl/⌘+K reaches the same rows)
try {
  if (typeof LabSearch === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labsearch');
  const lay = ThreeLab.groupsHost?.layers?.()[0]; if (lay) ThreeLab.groupsHost.select?.(lay.id);
  LabSearch.open(); await wait(500);
  const FOLDED = [['safe zones', /safe zones/i], ['more frame sizes', /frame size|21:9|more…/i], ['still', /still/i], ['when it plays', /when it plays/i], ['fade in', /when it plays|fade/i], ['music video', /music video/i], ['animate', /animate/i]];
  const missing = FOLDED.filter(([q, re]) => !LabSearch.find(q, 12).some((x) => re.test(x.item.label))).map(([q]) => q);
  step('every folded action is found by Lab search', !missing.length, missing);
  document.querySelector('dialog.ls-dlg')?.close?.();
} catch (e) { step('every folded action is found by Lab search', false, String(e)); }

await cdp('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 0, mobile: false }).catch(() => null);
out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
