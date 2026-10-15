// ◆ Keyframes you can see and shape (round 46, labkeys): a fixture song (120 BPM, 13 s) under a scene whose background
// is its "glow" slider (linear output: the pixel is the value). Checks, with real mouse input on the timeline (CDP):
// the slider's ◇ keys it and shows its lane (diamonds); a click in the lane adds a keyframe on the beat; a click on a
// diamond opens the ease card (six drawn eases, Curve, Snap to beats); Ease in is one undo step and the paused preview
// follows at once (it wakes from dozing); the curve's handle dragged is one undo step, the preview's values are the
// Lab's own evaluation, and frames from the hidden export page show the same values; on the layer's track, Shift+click
// picks two ◆ and a drag moves them together on the beat (one undo), Alt+drag copies them (one undo), Ctrl+C / V puts
// them at another time (one undo); the timeline's undo walks every change back; saved with the scene.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/labkeys.js --shot /tmp/labkeys.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-labkeys-check.wav';
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---------- the song: 13 s at 120 BPM, kicks on every beat from 0.5 s ----------
const sr = 44100; const secs = 13; const n = secs * sr; const x = new Float32Array(n);
const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
for (let k = 0; k < 24; k++) { let ph = 0; let prev = 0; add(0.5 + k * 0.5, 0.25, (s) => { const f = 50 + 110 * Math.exp(-s * 35); ph += 2 * Math.PI * f * (s - prev); prev = s; return 0.9 * Math.sin(ph) * Math.exp(-s * 14); }); }
{
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}
const SKETCH = `import * as THREE from 'three';
const P = tweak({ glow: { value: 0.2, min: 0, max: 2, label: 'Glow' } });
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => { scene.background.setScalar(Math.min(1, P.glow / 2)); renderer.render(scene, camera); });`;

// ---------- the Lab, the scene, the song ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && typeof ThreeLayers !== 'undefined', 30000);
const c = await ThreeLab.cmd();
await wait(1000);
ThreeLab.openCode(SKETCH);
await until(() => c.sliders().some((s) => s.key === 'glow'), 12000);
const sceneId = ThreeLab.scenes.currentId();
const r = await c.loadSong(SONG);
step('the fixture song loads', r.ok, r);
await until(() => c.player.loaded && c.player.duration > 12, 20000);
await wait(1500);
const D = ThreeLab.director;
const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
const layerOf = () => ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId()))[0];
const LID = layerOf().id;
const keysOf = () => (layerOf().keys?.['s:glow'] || []).map((k) => ({ ...k }));
const geo = () => c.player._keysGeo();
const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
const at = (t, y) => { const g = geo(); const rc = g.canvas.getBoundingClientRect(); return [Math.round(rc.left + g.X(t)), Math.round(rc.top + y)]; };
async function click([px, py], modifiers = 0) {
  await mouse({ type: 'mouseMoved', x: px, y: py, button: 'none', modifiers });
  await mouse({ type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1, modifiers });
  await mouse({ type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1, modifiers });
  await wait(250);
}
async function drag([x0, y0], [x1, y1], modifiers = 0) {
  await mouse({ type: 'mouseMoved', x: x0, y: y0, button: 'none', modifiers });
  await mouse({ type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, modifiers });
  for (let i = 1; i <= 10; i++) { await mouse({ type: 'mouseMoved', x: Math.round(x0 + ((x1 - x0) * i) / 10), y: Math.round(y0 + ((y1 - y0) * i) / 10), button: 'left', buttons: 1, modifiers }); await wait(16); }
  await mouse({ type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1, modifiers });
  await wait(300);
}
const elCenter = (node) => { const b = node.getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; };
// the preview's slider value at a paused time (a frame drawn after the seek)
const valueAt = async (t) => { c.seek(t); await wait(350); return Number(await ev('__slider("glow")')); };
const expectAt = (t) => ThreeLayers.evalKeys(keysOf(), t, 0.2);
c.player.setView?.(null); c.player.redraw?.(); await wait(300);

// ---------- the slider's ◇ keys it at the playhead; its lane (diamonds) shows ----------
{
  c.seek(2); await wait(300);
  const row = document.querySelector('.tweaks [data-tw-key="glow"]');
  row?.querySelector('.kf-btn')?.click();
  await wait(400);
  const L = layerOf();
  step('the slider\'s ◇ at 2 s: a keyframe there, and its lane shows under the layer (its diamonds)', keysOf().length === 1 && Math.abs(keysOf()[0].t - 2) < 1e-3 && (L.lanes || []).includes('s:glow') && geo().laneY(LID, 's:glow', 1) != null, { keys: keysOf(), lanes: L.lanes });
}
// ---------- a click in the lane adds a keyframe on the beat ----------
{
  const [px, py] = at(6.02, geo().laneY(LID, 's:glow', 1.8));
  await click([px, py]);
  const ks = keysOf();
  step('a click in the lane at ≈ 6 s, high: a second keyframe, on the beat (6.0), near 1.8', ks.length === 2 && Math.abs(ks[1].t - 6) < 0.02 && Math.abs(ks[1].v - 1.8) < 0.15, ks);
}
// ---------- click a diamond: the ease card ----------
const g0 = geo().undoDepth;
{
  const k0 = keysOf()[0];
  await click(at(k0.t, geo().laneY(LID, 's:glow', k0.v)));
  await until(() => document.querySelector('.lk-pop'), 4000);
  const pop = document.querySelector('.lk-pop');
  const names = [...(pop?.querySelectorAll('.lk-tile') || [])].map((b) => b.textContent);
  step('click a diamond: the ease card, six drawn eases + Curve, the current one lit, Snap to beats (a song is loaded)', ['Linear', 'Ease', 'Ease in', 'Ease out', 'Bounce', 'Hold', 'Curve'].every((w) => names.includes(w)) && pop.querySelectorAll('.lk-tile svg path').length === 7 && pop.querySelector('.lk-tile.on')?.textContent === 'Ease' && /Snap to beats/.test(pop.textContent), names);
  await J.shot('labkeys-card');
  const v0 = Number(await ev('__slider("glow")'));
  const ein = [...pop.querySelectorAll('.lk-tile')].find((b) => b.textContent === 'Ease in');
  await click(elCenter(ein));
  await wait(300);
  step('Ease in: the key\'s ease, the card closes, one undo step', keysOf()[0].ease === 'in' && !document.querySelector('.lk-pop') && geo().undoDepth === g0 + 1, { ease: keysOf()[0].ease, undo: geo().undoDepth - g0 });
  const v4 = await valueAt(4);
  step('the paused preview follows (woken by the edit): at 4 s the value is 0.2 + 1.6 × 0.5³', Math.abs(v4 - expectAt(4)) < 2e-3 && Math.abs(v4 - (0.2 + (keysOf()[1].v - 0.2) * Math.pow((4 - 2) / (keysOf()[1].t - 2), 3))) < 2e-3, { v0: r3(v0), v4: r3(v4), want: r3(expectAt(4)) });
}
// ---------- the curve: a handle dragged, one undo step; the preview is the Lab's evaluation ----------
{
  const k0 = keysOf()[0];
  await click(at(k0.t, geo().laneY(LID, 's:glow', k0.v)));
  await until(() => document.querySelector('.lk-pop'), 4000);
  const curveBtn = document.querySelector('.lk-pop .lk-curve-btn');
  await click(elCenter(curveBtn));
  await until(() => document.querySelector('.lk-pop .lk-h'), 2000);
  const h1 = document.querySelector('.lk-pop .lk-h[data-h="1"]');
  const u1 = geo().undoDepth;
  const [hx, hy] = elCenter(h1); const s = document.querySelector('.lk-graph').getBoundingClientRect();
  await drag([hx, hy], [Math.round(s.left + s.width * 0.12), Math.round(s.top + s.height * 0.15)]);
  const k = keysOf()[0];
  step('drag the curve\'s first handle up-left: the ease is a curve with two handles (a fast start), one undo step for the drag', k.ease === 'bezier' && Array.isArray(k.b) && k.b[1] > 0.9 && k.b[0] < 0.2 && geo().undoDepth === u1 + 1, { k, undo: geo().undoDepth - u1 });
  await J.shot('labkeys-curve');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(150);
  step('Esc closes the card', !document.querySelector('.lk-pop'));
  const T = [2.5, 3, 4, 5];
  const got = []; for (const t of T) got.push(await valueAt(t));
  step('the paused preview at 2.5 / 3 / 4 / 5 s: exactly the Lab\'s own values for that curve (fast start: past the middle by 3 s)', got.every((v, i) => Math.abs(v - expectAt(T[i])) < 2e-3) && got[1] > 1.0, { got: got.map(r3), want: T.map((t) => r3(expectAt(t))) });
}
// ---------- renders: frames from the hidden export page show the same values ----------
{
  const T = [2.5, 3, 4, 5, 8];
  const lum = async (buf) => { const bm = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(8, 8, 16, 16).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i]; return sum / (d.length / 4); };
  try {
    const frames = (await LabExport.probe({ w: 64, h: 36, F: 30, n: T.length, times: (j) => T[j] })).frames;
    const L1 = await Promise.all(frames.map(lum));
    const want = T.map((t) => 255 * Math.min(1, expectAt(t) / 2));
    const easeIn = T.map((t) => 255 * Math.min(1, ThreeLayers.evalKeys(keysOf().map((q, i) => (i ? q : { ...q, ease: 'in', b: undefined })), t, 0.2) / 2));
    step('export frames: each frame\'s picture is the curve\'s value at its time (within a JPEG step), not the old ease\'s', L1.every((v, i) => Math.abs(v - want[i]) <= 3) && Math.abs(L1[1] - easeIn[1]) > 15, { got: L1.map(Math.round), want: want.map(Math.round), easeIn: easeIn.map(Math.round) });
  } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
}
// ---------- the layer's track: pick two ◆, drag them together, Alt copies, Ctrl+C / V ----------
// (on the song's detected beats: a few ms off the 0.5 s grid, so compared to the nearest 50 ms)
const times = () => keysOf().map((k) => Math.round(k.t * 20) / 20);
{
  const ty = geo().trackY(LID);
  const u0 = geo().undoDepth;
  await click(at(2, ty), 8);
  await click(at(6, ty), 8);
  const picked = geo().picked[LID] || [];
  step('Shift+click two ◆ on the layer\'s track: both picked (no card)', picked.length === 2 && !document.querySelector('.lk-pop'), picked);
  await drag(at(2, ty), at(3.03, ty));
  step('drag one: both move together, on the beat (2 → 3, 6 → 7), the ease and curve go along; one undo step', JSON.stringify(times()) === '[3,7]' && keysOf()[0].ease === 'bezier' && geo().undoDepth === u0 + 1, { times: times(), undo: geo().undoDepth - u0 });
  await J.shot('labkeys-moved');
  const u1 = geo().undoDepth;
  await drag(at(3, ty), at(5.02, ty), 1);
  step('Alt+drag: copies (3, 7 stay; 5, 9 new), one undo step', JSON.stringify(times()) === '[3,5,7,9]' && geo().undoDepth === u1 + 1, { times: times(), undo: geo().undoDepth - u1 });
  const u2 = geo().undoDepth;
  // (the copies are picked now: Esc lets them go; a click on a ◆ then picks it alone and opens its card, Esc closes it)
  geo().canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
  step('Esc lets the picked ◆ go', !Object.keys(geo().picked).length, geo().picked);
  await click(at(keysOf()[1].t, ty));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
  await click(at(keysOf()[2].t, ty), 8);
  c.seek(10.98); await wait(300);
  const cv = geo().canvas;
  cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }));
  await wait(100);
  cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, bubbles: true }));
  await wait(400);
  step('pick 5 + 7, Ctrl+C, the playhead to 11, Ctrl+V: copies at 11 and 13 (on the beat: 5 → 11), one undo step', JSON.stringify(times()) === '[3,5,7,9,11,13]' && geo().undoDepth === u2 + 1, { times: times(), undo: geo().undoDepth - u2 });
  const v12 = await valueAt(12);
  step('…and the pasted keys play: at 12 s the preview is the Lab\'s value between them', Math.abs(v12 - expectAt(12)) < 2e-3 && v12 > 0.3, { v12: r3(v12), want: r3(expectAt(12)) });
}
// ---------- undo walks every change back ----------
{
  const seen = [];
  c.player.undo(); await wait(200); seen.push(JSON.stringify(times()));
  c.player.undo(); await wait(200); seen.push(JSON.stringify(times()));
  c.player.undo(); await wait(200); seen.push(JSON.stringify(times()));
  step('undo: the paste, the Alt copy, the move (back at 2 and 6)', seen[0] === '[3,5,7,9]' && seen[1] === '[3,7]' && seen[2] === '[2,6]', seen);
  c.player.undo(); await wait(200);
  const e1 = keysOf()[0];
  c.player.undo(); await wait(200);
  const e2 = keysOf()[0];
  step('…then the curve, then Ease in (back to Ease)', e1.ease === 'in' && e2.ease === 'ease', { e1, e2 });
  const v4 = await valueAt(4);
  step('…and the preview follows the undo', Math.abs(v4 - expectAt(4)) < 2e-3, { v4: r3(v4), want: r3(expectAt(4)) });
}
// ---------- saved with the scene ----------
{
  await wait(1500);
  const disk = await window.hub.kvGet('three-sketches', []);
  const sk = (disk || []).find((q) => q.id === sceneId);
  step('saved with the scene (on disk)', sk?.layers?.[0]?.keys?.['s:glow']?.length === 2, sk?.layers?.[0]?.keys);
}
step('no page errors from the card', !document.querySelector('.lk-pop'));
return J.done();
