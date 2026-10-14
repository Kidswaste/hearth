// 🎥 Camera moves (round 40, labcamera): a fixture song (120 BPM, a kick on every beat from 0.5 s) under a plain 3D
// scene (a perspective camera 6 m from a cube, no controls of its own). Checks: the ways in (right-click the preview ›
// 🎥 Camera moves, the timeline's right-click, Lab search, Find anything); a push in 2–6 s moves the scene's own camera
// (nothing before 2 s, held after 6 s); two renders from the hidden export page at the same times give the same bytes
// (and the pushed-in frame differs from the one before the move); a punch-in on each kick follows the song's kicks;
// an end of the move dragged on the timeline with real mouse input (one undo step), undone from the card and with the
// timeline's own undo; saved with the scene (on disk) and back after a scene switch; a 📜 recipe records it as a step
// and replays it on another scene; a scene with no 3D camera isn't offered it; no duplicate commands.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/labcamera.js --shot /tmp/labcamera.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-labcamera-check.wav';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const CC = CamCore;

// ---------- the song: 13 s at 120 BPM, kicks on every beat from 0.5 s ----------
const sr = 44100; const secs = 13; const n = secs * sr; const x = new Float32Array(n);
const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
const kicks = [];
const kick = (t) => { let ph = 0; let prev = 0; add(t, 0.25, (s) => { const f = 50 + 110 * Math.exp(-s * 35); ph += 2 * Math.PI * f * (s - prev); prev = s; return 0.9 * Math.sin(ph) * Math.exp(-s * 14); }); kicks.push(t); };
for (let k = 0; k < 24; k++) kick(0.5 + k * 0.5);
{
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}
const SKETCH = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#10141c');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
const cube = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshNormalMaterial());
cube.rotation.set(0.5, 0.6, 0); scene.add(cube);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

// ---------- the Lab, the scene, the song ----------
activate('tool:three');
const c = await ThreeLab.cmd();
await wait(1000);
step('/camera-moves is a Lab command; no duplicate commands', Commands.get('camera-moves')?.area === 'Three.js Lab' && !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
ThreeLab.openCode(SKETCH);
await wait(2500);
const sceneId = ThreeLab.scenes.currentId();
const r = await c.loadSong(SONG);
step('the fixture song loads', r.ok, r);
await until(() => c.player.analysis?.onsets?.kick?.length > 12, 30000);
const D = ThreeLab.director;
const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
const camState = async () => { const v = await ev('JSON.stringify(window.__labCam.state())'); return v ? JSON.parse(v) : null; };
// the camera's distance from the cube (where the moves put it), at a playhead time (paused)
// (headless, a paused still scene draws only a few frames a second: wait for one drawn after the seek)
const distAt = async (t) => { const n0 = (await camState())?.applied || 0; c.seek(t); await wait(250); let s = null; await until(async () => { s = await camState(); return s.applied > n0 + 1; }, 1200); s = await camState(); const p = Object.values(s?.pose || {})[0]; return p ? Math.hypot(p[0], p[1], p[2]) : 6; };
const layerOf = () => ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId()))[0];

// ---------- the ways in ----------
{
  const items = LabCamera.previewItem().items();
  const labels = items.filter((i) => i && i !== '-').map((i) => i.label);
  step('right-click the preview › 🎥 Camera moves: the presets (push in … punch-in on the beat), from / to this view, your moves', ['Push in', 'Pull out', 'Orbit', 'Dolly zoom', 'Crane up', 'Crane down', 'Handheld shake', 'Whip pan', 'Slow drift', 'Punch-in on the beat', 'From this view', 'Your moves'].every((w) => labels.some((l) => l.includes(w))), labels);
  if (typeof LabSearch === 'undefined') await Lazy.load('labsearch');
  LabSearch.buildIndex?.();
  const top = (q) => LabSearch.find(q, 4).map((y) => `${y.item.label} @ ${y.item.path || ''}`);
  const a = top('camera push in'); const b = top('dolly zoom');
  step('Lab search: "camera push in", "dolly zoom" → the 🎥 rows', a.some((l) => /Push in/.test(l)) && b.some((l) => /Dolly zoom/.test(l)), { a, b });
  let found = null;
  try {
    AppUI.palette();
    await until(() => document.querySelector('.palette-input'), 3000);
    const inp = document.querySelector('.palette-input');
    inp.value = 'camera moves'; inp.dispatchEvent(new Event('input'));
    await wait(500);
    found = [...document.querySelectorAll('.palette .palette-item .p-label')].slice(0, 8).map((y) => y.textContent);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } catch (err) { found = String(err); }
  step('Find anything: "camera moves" finds it', Array.isArray(found) && found.some((l) => /Camera moves/.test(l || '')), found);
  const wi = LabCamera.waveItems(3);
  step('the timeline’s right-click has "🎥 Camera move from here…"', wi.some((i) => /Camera move from here/.test(i[0])), wi.map((i) => i[0]));
}

// ---------- a push in, 2 s → 6 s ----------
const u0 = LabCamera.undoDepth;
const said = await say('/camera-moves push in 2s to 6s');
await until(() => layerOf()?.camMoves?.length === 1, 3000);
const push = layerOf()?.camMoves?.[0];
step('/camera-moves push in 2s to 6s: one move on the layer (one undo step)', push?.kind === 'push' && push.t0 === 2 && push.t1 === 6 && LabCamera.undoDepth === u0 + 1, { said, push });
await until(async () => (await camState())?.lib, 8000);
{
  const d1 = await distAt(1); const d4 = await distAt(4); const d8 = await distAt(8);
  const want = 6 * Math.exp(-0.55);
  step('the camera: as the scene has it before 2 s, closer at 4 s, held pushed in after 6 s', Math.abs(d1 - 6) < 1e-3 && d4 < 5.9 && d4 > want + 0.1 && Math.abs(d8 - want) < 0.01, { d1: r3(d1), d4: r3(d4), d8: r3(d8), want: r3(want) });
}

// ---------- renders: the hidden export page, twice, the same frames ----------
{
  const T = [4, 1, 4, 7.5];
  const shoot = async () => (await LabExport.probe({ w: 96, h: 54, F: 30, n: T.length, times: (j) => T[j] })).frames;
  try {
    const a = await shoot(); const b = await shoot();
    const same = (p, q) => { const x1 = new Uint8Array(p); const x2 = new Uint8Array(q); return x1.length === x2.length && x1.every((v, j) => v === x2[j]); };
    step('render 2 frames at the same times twice: identical bytes, frame for frame', a.length === 4 && a.every((f, i) => same(f, b[i])), { frames: a.length });
    step('…and the same time within one render too (4 s, twice)', same(a[0], a[2]));
    step('…while the pushed-in frame differs from the one before the move (the move renders)', !same(a[0], a[1]) && !same(a[1], a[3]));
  } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
}

// ---------- a punch-in on each kick ----------
{
  const hits = JSON.parse((await ev('JSON.stringify(audio.analysis?.onsets?.kick?.map((o) => o.t) || [])')) || '[]');
  await say('/camera-moves clear');
  await say('/camera-moves punch in on each kick 0s to 12s');
  await until(() => layerOf()?.camMoves?.[0]?.kind === 'punch', 3000);
  await until(async () => (await ev('Boolean(globalThis.beatlink)')) === true, 8000);
  const ks = hits.filter((t) => t > 2 && t < 10).slice(0, 4);
  const on = []; const off = [];
  for (const k of ks) { on.push(await distAt(k + 0.03)); off.push(await distAt(k + 0.42)); }
  const peak = 6 * Math.exp(-0.14);
  step('punch-in on the kicks: 30 ms after each kick the camera is pushed in, ~0.4 s later it is back near', ks.length >= 3 && on.every((d) => Math.abs(d - peak) < 0.05) && off.every((d) => d > 5.85), { kicks: ks.map(r3), on: on.map(r3), off: off.map(r3), peak: r3(peak) });
  const between = await distAt(ks[0] + 0.3);
  step('…and only on them (between kicks it falls back)', between > on[0] + 0.3, r3(between));
}

// ---------- drag an end on the timeline (real mouse), one undo step ----------
await say('/camera-moves push in 2s to 6s');
await until(() => layerOf()?.camMoves?.some((m) => m.kind === 'push'), 3000);
c.player.setView?.(null); c.player.redraw?.(); await wait(400);
{
  const g = LabCamera._geo();
  const pm = layerOf().camMoves.find((m) => m.kind === 'push');
  const u1 = LabCamera.undoDepth;
  let ok = false; let info = {};
  if (g?.canvas && g.X) {
    const rc = g.canvas.getBoundingClientRect();
    const bar = LabCamera._bar(pm.id); const y = Math.round(rc.top + (bar.y0 + bar.y1) / 2);
    const x0 = Math.round(rc.left + g.X(6)); const x1 = Math.round(rc.left + g.X(8));
    const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
    await mouse({ type: 'mouseMoved', x: x0, y, button: 'none' });
    await mouse({ type: 'mousePressed', x: x0, y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await mouse({ type: 'mouseMoved', x: Math.round(x0 + ((x1 - x0) * i) / 8), y, button: 'left', buttons: 1 }); await wait(16); }
    await mouse({ type: 'mouseReleased', x: x1, y, button: 'left', buttons: 0, clickCount: 1 });
    await wait(300);
    const now = layerOf().camMoves.find((m) => m.id === pm.id);
    info = { t1: now?.t1, x0, x1, y, undo: LabCamera.undoDepth - u1 };
    ok = now && Math.abs(now.t1 - 8) < 0.2 && now.t0 === 2 && LabCamera.undoDepth === u1 + 1;
  }
  step('drag the push in’s end on the timeline from 6 s to 8 s (lands on the beat): one undo step', ok, info);
  await J.shot('labcamera-timeline');
  LabCamera.undo(); await wait(200);
  step('undo: the end is back at 6 s', layerOf().camMoves.find((m) => m.id === pm.id)?.t1 === 6, layerOf().camMoves);
  c.player.undo(); await wait(200);
  step('the timeline’s own undo (Ctrl/⌘+Z there) takes back the move before (the push in is gone)', !layerOf().camMoves?.some((m) => m.kind === 'push'), layerOf().camMoves);
}

// ---------- the card: intensity, easing ----------
{
  await say('/camera-moves orbit right quarter 0s to 8s');
  await until(() => layerOf()?.camMoves?.some((m) => m.kind === 'orbit'), 3000);
  LabCamera.open(); await wait(250);
  const row = [...document.querySelectorAll('.cm-pop .cm-row')].find((rw) => /Orbit/.test(rw.textContent));
  const u2 = LabCamera.undoDepth;
  const amt = row?.querySelector('.cm-amt');
  if (amt) { amt.value = '1.5'; amt.dispatchEvent(new Event('input')); amt.value = '1.6'; amt.dispatchEvent(new Event('input')); amt.dispatchEvent(new Event('change')); }
  const ease = row?.querySelector('.cm-ease');
  if (ease) { ease.value = 'cine'; ease.dispatchEvent(new Event('change')); }
  await wait(200);
  const om = layerOf().camMoves.find((m) => m.kind === 'orbit');
  step('the card: an intensity drag is one undo step, the easing another', om?.amt === 1.6 && om.ease === 'cine' && LabCamera.undoDepth === u2 + 2, { amt: om?.amt, ease: om?.ease, undo: LabCamera.undoDepth - u2 });
  await J.shot('labcamera-card');
  LabCamera.close();
}

// ---------- saved with the scene, back after a switch ----------
{
  await wait(1500);
  const disk = await window.hub.kvGet('three-sketches', []);
  const sk = (disk || []).find((s) => s.id === sceneId);
  step('saved with the scene (on disk)', sk?.layers?.some((L) => L.camMoves?.some((m) => m.kind === 'orbit')), sk?.layers?.map((L) => L.camMoves?.length || 0));
  const name = ThreeLab.scenes.get(sceneId).name;
  ThreeLab.openCode(ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code);
  await wait(1800);
  c.openSketch(name);
  await until(() => ThreeLab.scenes.currentId() === sceneId, 8000);
  await c.waitSong?.(); await until(() => c.player.loaded, 8000);
  await wait(800);
  let pose = null;
  await until(async () => { c.seek(5); await wait(250); const s = await camState(); pose = Object.values(s?.pose || {})[0]; return Boolean(pose); }, 10000);
  step('…switch scenes and back: the orbit moves the camera again (it went sideways)', pose && Math.abs(pose[0]) > 1, pose?.map(r3));
}

// ---------- 📜 a recipe records it as a step and replays it ----------
{
  await Lazy.load('labrecipes');
  await LabRecipes.start();
  await LabCamera.add('crane', { dir: 1, t0: 1, t1: 5, quiet: true });
  await wait(700);
  const rec = await LabRecipes.stop({ name: 'labcamera probe' });
  const st = rec?.steps?.find((s) => s.k === 'cam');
  step('a 📜 recipe records the camera moves as one step', st && st.moves.some((m) => m.kind === 'crane') && /Camera moves/.test(RecipeCore.describe(st)), rec?.steps?.map((s) => RecipeCore.describe(s)));
  ThreeLab.openCode(SKETCH.replace('#10141c', '#1c1410'));
  await wait(2500);
  const other = ThreeLab.scenes.currentId();
  let res = null;
  try { res = rec ? await LabRecipes.use(rec, { quiet: true }) : null; } catch (err) { res = String(err); }
  await until(() => layerOf()?.camMoves?.length, 4000);
  const got = layerOf()?.camMoves || [];
  step('…and replays them on another scene (times fitted to its length)', other !== sceneId && got.some((m) => m.kind === 'crane') && got.some((m) => m.kind === 'orbit'), { res, got: got.map((m) => `${m.kind} ${m.t0}–${m.t1}`) });
  if (rec) await LabRecipes.remove(rec).catch(() => {});
}

// ---------- a scene with no 3D camera isn't offered it ----------
{
  ThreeLab.openCode(`const cv = document.createElement('canvas'); cv.width = innerWidth; cv.height = innerHeight; document.body.append(cv); const g = cv.getContext('2d'); (function f() { g.fillStyle = '#223'; g.fillRect(0, 0, cv.width, cv.height); requestAnimationFrame(f); })();`);
  await wait(2000);
  const txt = await say('/camera-moves push in');
  step('a 2D scene (no 3D camera): nothing is added, it says why', !layerOf()?.camMoves?.length && /no 3D camera/i.test(txt), txt);
}
c.openSketch(ThreeLab.scenes.get(sceneId).name);
await wait(1500);
return J.done();
