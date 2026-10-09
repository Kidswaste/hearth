// Live Lab edits (round 6 "live"): which director / chat / UI actions reload the whole preview page and which update
// it in place. Counts what the preview's sandbox itself reports, so it measures the old code and the new code alike:
//   page loads   = 'ready' messages from the preview frame (a reloaded iframe)
//   in place     = 'ran' messages without a page load (hot: one layer; swap: the whole stack in the same page)
// Then 30 edits in a row and the sandbox's GPU contexts / renderers / listeners / timers before and after (no leaks),
// and that the hub window itself never reloaded.
//   node dev/smoke.js --fake-engines --script dev/checks/live.js --wait 6000 --check-timeout 400000 --shot /tmp/live.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const SHOTS = window.LIVE_SHOTS || '/tmp/hearth-live';
const out = { actions: {}, problems: [] };
window.__liveMarker = Date.now(); // gone if the hub window reloads

activate('tool:three');
const cmd = await ThreeLab.cmd();
await until(() => ThreeLab.director && ThreeLab.scenes);
const d = ThreeLab.director;
const S = ThreeLab.scenes;
const host = H.surfaces.get('tool:three').el;
const frame = () => host.querySelector('.three-preview .three-frame');
const call = (t, a) => HubBridge.call(t, a);

// ---- counting what the preview frame says ----
const tally = { ready: 0, hot: 0, swap: 0, full: 0, drawn: 0, last: 0 };
addEventListener('message', (e) => {
  const m = e.data;
  if (m?.source !== 'three-sandbox' || e.source !== frame()?.contentWindow) return;
  if (m.type === 'ready') { tally.ready += 1; tally.last = Date.now(); }
  if (m.type === 'ran') { if (m.hot) tally.hot += 1; else if (m.swap) tally.swap += 1; else tally.full += 1; tally.last = Date.now(); }
  if (m.type === 'drawn') tally.drawn += 1;
});
// quiet for a moment, and the preview uncovered (a reload's cover goes once the new page has drawn)
const cover = () => host.querySelector('.three-preview > .scene-cover');
const settle = async (min = 900) => { await wait(min); await until(() => Date.now() - tally.last > 900 && cover()?.classList.contains('out') && !host.querySelector('.ly-row.ly-building'), 12000); };
// What animates inside the preview page while an action runs (polled): the cross-fade pictures, a new layer's wipe-in,
// a removed layer's fade-out, a new stack's cover. Proves the transitions happen without relying on mid-run screenshots.
async function probe(fn) {
  const seen = new Set(); let on = true; let maxOverlays = 0;
  const poll = (async () => {
    while (on) {
      const r = await d.evalInSketch(`return { o: typeof __labHealth === 'function' ? __labHealth().overlays : 0, a: document.getAnimations().map((x) => { const t = x.effect?.target; return t ? (t.className || t.tagName) + ':' + (x.effect.getKeyframes().map((k) => Object.keys(k).filter((p) => !/^(offset|easing|composite|computedOffset)$/.test(p)).join('+'))[0] || '') : '?'; }) }`);
      if (r.ok && r.value) { maxOverlays = Math.max(maxOverlays, r.value.o || 0); for (const a of r.value.a || []) seen.add(a); }
      await wait(60);
    }
  })();
  await fn();
  await wait(900);
  on = false; await poll;
  return { animations: [...seen], maxOverlays };
}
const sentNow = () => ThreeLab.live?.counts?.().sent || {};
async function measure(name, fn, { expectReload = false, min } = {}) {
  const a = { ...tally }; const s0 = sentNow();
  let err = null;
  try { await fn(); } catch (x) { err = x.message; }
  await settle(min);
  const r = { reloads: tally.ready - a.ready, inPlace: tally.hot - a.hot + tally.swap - a.swap, hot: tally.hot - a.hot, swap: tally.swap - a.swap, layerRunsAfterReload: tally.full - a.full };
  const s1 = sentNow(); const sent = Object.fromEntries(Object.keys(s1).filter((k) => !/layer-props/.test(k) && s1[k] !== (s0[k] || 0)).map((k) => [k.replace(/^preview /, ''), s1[k] - (s0[k] || 0)]));
  if (Object.keys(sent).length) r.sent = sent;
  if (err) r.error = err;
  out.actions[name] = r;
  if (!expectReload && r.reloads) out.problems.push(`${name} reloaded the preview ${r.reloads}×`);
  return r;
}

// ---- a test sketch with two layers ----
const knot = (color) => `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.6, min: -2, max: 2, label: 'Spin' }, tint: { value: '${color}', label: 'Tint' } });
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 96, 12), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
addEventListener('resize', () => { globalThis.__resizeHits = (globalThis.__resizeHits || 0) + 1; renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
setInterval(() => { mesh.rotation.x += 0.01; }, 100);
renderer.setAnimationLoop((now) => { mesh.rotation.y = now / 1000 * P.spin; mesh.material.color.set(P.tint); renderer.render(scene, camera); });`;
await d.newSketch('Live check', knot('#ffb000'), 2);
await settle();
const sketchA = S.currentId();
await d.addLayer({ name: 'Rings', code: knot('#22d3ee').replace('TorusKnotGeometry(1, 0.3, 96, 12)', 'TorusGeometry(1.4, 0.05, 8, 64)') }, 1.5);
await settle();
await smoke({ shot: `${SHOTS}/0-start.png` });

// ---- director tools (the real routing: HubBridge.call → the Lab's handlers) ----
out.transitions = {};
await measure('three_edit_code', async () => {
  out.transitions.edit = await probe(async () => {
    const p = call('three_edit_code', { layer: 'Rings', edits: [{ find: '1.4, 0.05', replace: '1.6, 0.04' }], wait: 1.2 });
    await wait(120);
    // the Lab on screen (and its docked chat) must stay on screen while the director works in it
    out.duringEdit = { labZ: getComputedStyle(host).zIndex, labVisible: getComputedStyle(host).visibility, pill: host.querySelector('.lab-building')?.classList.contains('on'), row: Boolean(host.querySelector('.ly-row.ly-building')) };
    if (out.duringEdit.labZ === '-1' || out.duringEdit.labVisible !== 'visible') out.problems.push(`the Lab dropped behind the window during a director call (z-index ${out.duringEdit.labZ})`);
    await p;
  });
});
await measure('three_set_code', () => call('three_set_code', { code: knot('#ff3cac'), wait: 1.2 }));
await measure('three_add_layer', async () => {
  out.transitions.addLayer = await probe(() => call('three_add_layer', { name: 'Dots', code: knot('#a3e635').replace('TorusKnotGeometry(1, 0.3, 96, 12)', 'IcosahedronGeometry(0.6, 1)'), wait: 1.2 }));
});
await smoke({ shot: `${SHOTS}/2-add-layer-done.png` });
await measure('three_update_layer (props)', () => call('three_update_layer', { layer: 'Dots', settings: { opacity: 0.6, x: 10 }, wait: 0.4 }));
await measure('three_update_layer (code)', () => call('three_update_layer', { layer: 'Dots', code: knot('#a3e635').replace('TorusKnotGeometry(1, 0.3, 96, 12)', 'IcosahedronGeometry(0.8, 2)'), wait: 1.2 }));
await measure('undo the director edit', () => ThreeDirector.undo());
await measure('three_remove_layer', async () => { out.transitions.removeLayer = await probe(() => call('three_remove_layer', { layer: 'Dots' })); });
await measure('three_sliders (set)', () => call('three_sliders', { layer: 'Rings', set: { spin: 1.4 } }));
await measure('look save + apply', async () => { d.looks('Rings', 'save', 'Fast'); d.sliders('Rings', { spin: -1 }); d.looks('Rings', 'apply', 'Fast'); });
await measure('palette', async () => { d.refs.setPalette(['#ff0055', '#00e0ff', '#ffe600']); });
const preset = ThreeLayers.PRESETS?.[0]?.id;
if (preset) await measure('fx preset (three_animate)', () => call('three_animate', { layer: 'Rings', preset }));
await measure('slider save', async () => { d.sliders('Rings', { spin: 0.9 }); (await ThreeLab.cmd({ show: false })).save(); });
if (typeof ThreeNodes !== 'undefined' && ThreeNodes.lab?.hook) {
  await measure('node graph compile', async () => { const h = ThreeNodes.lab.hook; h.setCode(`${h.editor.value}\n// nodes recompiled`, { rerun: true }); });
}
// a jam round puts a whole captured sketch back (jam.js → director.restore)
await measure('jam round (restore)', async () => {
  const snap = d.capture();
  snap.layers[snap.layers.length - 1].code += '\nmesh.rotation.z = 0.3; // the jam partner\'s touch';
  await d.restore(snap, { wait: 0.6 });
});
await measure('assist pick (a look)', async () => { const c = await ThreeLab.cmd({ show: false }); c.look?.('Fast'); });
await measure('Run button', async () => { cmd.run(); });
await measure('sliders panel off / on', async () => { cmd.panel(false); await wait(500); cmd.panel(true); });
// scene switch: another sketch and back
const other = S.create({ name: 'Live check B', code: knot('#7c3aed'), open: false });
await measure('scene switch', async () => { out.transitions.sceneSwitch = await probe(async () => { S.open(other.id); }); });
await measure('three_set_code (one-layer sketch)', () => call('three_set_code', { code: knot('#facc15'), wait: 1.2 }));
await measure('scene switch back', async () => { S.open(sketchA); });

// ---- 30 edits in a row: nothing piles up in the sandbox ----
const health = async () => {
  const r = await d.evalInSketch(`return (() => {
    const h = typeof __labHealth === 'function' ? __labHealth() : {};
    globalThis.__resizeHits = 0; dispatchEvent(new Event('resize'));
    return { ...h, resizeListeners: globalThis.__resizeHits, canvases: document.querySelectorAll('canvas').length, boxes: document.querySelectorAll('.lab-layer').length };
  })()`);
  return (r.ok ? r.value : null) || { error: r.error || 'no value' };
};
const h0 = await health();
for (let i = 0; i < 30; i += 1) {
  const from = i % 2 ? '1.7, 0.03' : '1.6, 0.04'; const to = i % 2 ? '1.6, 0.04' : '1.7, 0.03';
  await call('three_edit_code', { layer: 'Rings', edits: [{ find: from, replace: to }], wait: 0.3 });
}
await settle(1500);
const h1 = await health();
out.health = { before: h0, after30Edits: h1 };
for (const k of ['contexts', 'renderers', 'listeners', 'resizeListeners', 'intervals', 'canvases', 'boxes', 'overlays']) {
  if (typeof h0[k] === 'number' && typeof h1[k] === 'number' && h1[k] > h0[k]) out.problems.push(`${k} grew over 30 edits: ${h0[k]} → ${h1[k]}`);
}

// ---- truly global changes: these may reload (prettily) ----
// a reload that can't be avoided: the cover holds a picture of the scene until the new page has drawn
async function watchCover(fn) {
  const states = new Set(); let on = true;
  (async () => { while (on) { const c = cover(); states.add(c.classList.contains('out') ? 'uncovered' : c.style.backgroundImage ? 'covered with the old picture' : 'covered, no picture'); await wait(25); } })();
  await fn();
  await until(() => cover().classList.contains('out') && states.size > 1, 8000);
  on = false;
  return [...states];
}
out.coverDuringReload = {};
await measure('frame size fit → 9:16 (new pixel ratio)', async () => { out.coverDuringReload.frameSize = await watchCover(async () => d.setFrame('9:16')); }, { expectReload: true });
await measure('frame size 9:16 → 1:1 (same ratio)', async () => { d.setFrame('1:1'); });
await measure('frame size back to fit', async () => { d.setFrame('fit'); }, { expectReload: true });
await measure('restart from scratch', async () => { out.coverDuringReload.restart = await watchCover(async () => cmd.restart()); }, { expectReload: true });

const want = { edit: 'lab-xfade:opacity', addLayer: 'lab-layer:opacity+clipPath', removeLayer: 'lab-ghost:opacity', sceneSwitch: 'lab-swap:opacity' };
for (const [k, a] of Object.entries(want)) if (!out.transitions[k]?.animations.some((x) => x.split(':')[0].split(' ')[0] === a.split(':')[0] && x.endsWith(a.split(':')[1]))) out.problems.push(`no ${a} animation during ${k}`);
for (const [k, st] of Object.entries(out.coverDuringReload)) if (!st.includes('covered with the old picture')) out.problems.push(`the ${k} reload showed no picture of the old scene`);
out.hubWindowReloaded = !window.__liveMarker;
if (out.hubWindowReloaded) out.problems.push('the hub window reloaded');
out.coverOut = host.querySelector('.three-preview > .scene-cover')?.classList.contains('out');
out.hubCounts = ThreeLab.live?.counts ? (({ reloads, sent }) => ({ reloads, sent }))(ThreeLab.live.counts()) : 'n/a';
const reloads = Object.values(out.actions).reduce((s, r) => s + r.reloads, 0);
const inPlace = Object.values(out.actions).reduce((s, r) => s + r.inPlace, 0);
out.summary = `${Object.keys(out.actions).length} actions: ${reloads} page reloads, ${inPlace} in-place layer runs`;
await smoke({ shot: `${SHOTS}/4-end.png` });
return JSON.stringify(out, null, 1);
