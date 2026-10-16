// 🎵 Music visualizers (round 50, labvisualizers): a fixture song (13 s, kicks OFF a steady grid, so "on the kick" can't
// pass by landing on beats) under a plain dark scene. Checks: the ways in (＋ Add, /visualizer, Lab search); the
// picker's 17 live previews draw (and what a frame of them all costs); three looks added (a card click, the API, the
// chat command) draw from the song's own track; every one of the 17 compiles and draws; renders from the hidden export
// page: the picture changes on the kicks (brighter just after each kick than just before), two renders at the same
// times give the same bytes; the preview at a paused time ≈ the render at that time; a paused song uploads nothing
// (the page may doze); one undo per change; saved with the scene.
//   node dev/smoke.js --check-timeout 420000 --script dev/checks/labvisualizers.js --shot /tmp/labvisualizers.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-labvisualizers-check.wav';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r3 = (x) => Math.round(x * 1000) / 1000;

// ---------- the song: kicks at irregular times (not on any grid), a soft hat on every half second ----------
const KICKS = [0.5, 1.25, 1.75, 2.9, 3.4, 4.6, 5.0, 6.3, 6.75, 8.1, 8.5, 9.7, 10.2, 11.4, 11.8];
{
  const sr = 44100; const secs = 13; const n = secs * sr; const x = new Float32Array(n);
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
  for (const t of KICKS) { let ph = 0; let prev = 0; add(t, 0.25, (s) => { const f = 50 + 110 * Math.exp(-s * 35); ph += 2 * Math.PI * f * (s - prev); prev = s; return 0.9 * Math.sin(ph) * Math.exp(-s * 14); }); }
  let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  for (let t = 0.25; t < secs; t += 0.5) add(t, 0.03, () => 0.05 * rnd());
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#07080c'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

// ---------- the Lab, the scene, the song ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && typeof LabVisHook !== 'undefined', 30000);
const c = await ThreeLab.cmd();
await wait(800);
ThreeLab.openCode(BG);
await wait(2500);
const sceneId = ThreeLab.scenes.currentId();
const r0 = await c.loadSong(SONG);
step('the fixture song loads', r0.ok, r0);
await until(() => c.player.analysis?.onsets?.kick?.length > 8, 30000);
const D = ThreeLab.director;
const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
const rows = () => D.layers().layers;
const info = async () => (await ev('return window.__labVis.info()')) || [];
const statOf = async (name) => { const L = rows().find((x) => x.name === name || x.id === name); return (await info()).find((x) => x.id === L?.id) || null; };
const codeOfL = (name) => D.codeOf(rows().find((x) => x.name === name || x.id === name)?.id).code;
c.player.toggle?.(false);
const hits = JSON.parse((await ev('return JSON.stringify(audio.analysis?.onsets?.kick?.map((o) => (typeof o === "number" ? o : o.t)) || [])')) || '[]');
step('the song\'s kicks are found where they were made (off the beat grid)', KICKS.filter((k) => k < 9).every((k) => hits.some((h) => Math.abs(h - k) < 0.05)), { hits: hits.map(r3) });

// ---------- the ways in ----------
{
  const add = LabVisHook.addItem();
  step('＋ Add › 🎵 Music visualizer… (one row, with its tooltip)', /Music visualizer/.test(add.label) && /preview/.test(add.tip), add.label);
  step('/visualizer is a Lab command; no duplicate commands', Commands.get('visualizer')?.area === 'Three.js Lab' && !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
  if (typeof LabSearch === 'undefined') await Lazy.load('labsearch');
  LabSearch.buildIndex?.();
  const top = (q) => LabSearch.find(q, 5).map((y) => `${y.item.label}`);
  const a = top('music visualizer'); const b = top('spectrum');
  step('Lab search: "music visualizer" and "spectrum" → 🎵 Music visualizer', a.some((l) => /visualizer/i.test(l)) && b.some((l) => /visualizer/i.test(l)), { a, b });
}

// ---------- the picker: 17 live previews ----------
await LabVisHook.lib((V) => V.open());
await until(() => document.querySelectorAll('.vz-card').length >= 17, 8000);
await wait(900);
{
  const cards = [...document.querySelectorAll('.vz-card')];
  const litOf = () => cards.slice(0, 8).map((b) => { const cv = b.querySelector('canvas'); if (!cv.width) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 60) n += 1; return n; });
  let lit = litOf(); await until(() => (lit = litOf()).every((x) => x > 5), 8000);
  const V = LabVis; const t0 = performance.now(); let frames = 0; const per = [];
  const cs = cards.map((b) => { const p = V.PRESETS.find((x) => x.id === b.dataset.id); const cv = b.querySelector('canvas'); return { p, canvas: cv, g: cv.getContext('2d') }; });
  while (performance.now() - t0 < 600) { const a0 = performance.now(); for (const cd of cs) V.drawCard(cd, frames * 0.016); per.push(performance.now() - a0); frames += 1; }
  per.sort((x, y) => x - y);
  step(`the picker shows ${cards.length} looks as live previews (the first 8 draw)`, cards.length === 17 && lit.every((n) => n > 5), { cards: cards.length, lit });
  step('…what a frame of all 17 previews costs (they draw in the picker\'s own loop, only the ones in view)', per.length > 3, { msLowerQuartile: Math.round(per[Math.floor(per.length / 4)] * 100) / 100, median: Math.round(per[per.length >> 1] * 100) / 100, frames });
  await J.shot('labvisualizers-picker');
}

// ---------- three looks: a card click (adds a layer), the API, the chat command ----------
const n0 = rows().length;
document.querySelector('.vz-card[data-id="bars"]').click();
await until(() => rows().length === n0 + 1, 8000);
document.querySelector('.vz-dlg button[aria-label="Close"]')?.click();
const barsName = rows().at(-1)?.name;
await LabVis.apply('rings', { controls: { listen: 'kick' } });
await until(() => rows().length === n0 + 2, 8000);
const ringsName = rows().at(-1)?.name;
const said = await say('/visualizer flash');
await until(() => rows().length === n0 + 3, 8000);
const flashName = rows().at(-1)?.name;
const saidListen = await say('/visualizer listen kick'); // (the flash listens to the beat by itself: here the song's off-grid kicks)
await until(async () => (await ev('return window.__labVis.ready()')) === true, 15000);
await until(async () => (await ev('return window.__labVis.track()')) != null, 30000);
{
  const names = [barsName, ringsName, flashName];
  let st = [];
  await until(async () => { st = await Promise.all(names.map(statOf)); return st.every((s) => s && s.frames > 1 && s.track); }, 10000);
  step('three looks (a card click, LabVis.apply, /visualizer flash): three 🎵 layers drawing from the song\'s own track, no errors',
    st.every((s) => s && s.ok && s.track && !s.demo && !s.live) && /preset: 'bars'/.test(codeOfL(barsName)) && /listen: \{ value: 'kick'/.test(codeOfL(ringsName)) && /preset: 'flash'/.test(codeOfL(flashName)) && /listen: \{ value: 'kick'/.test(codeOfL(flashName)) && !D.report().errors.length,
    { names, st: st.map((s) => s && { preset: s.preset, ok: s.ok, track: s.track, frames: s.frames, ms: s.ms }), said, saidListen, errors: D.report().errors, track: await ev('return window.__labVis.track()'), jobs: await ev('return window.__labVis.jobs()') });
}

// ---------- every look compiles and draws (one layer, through all 17) ----------
{
  const r = await LabVis.apply('wave');
  await until(() => rows().some((x) => x.name === r.layer), 6000);
  const bad = []; const ms = {};
  for (const p of LabVis.PRESETS) {
    await LabVis.apply(p.id, { layer: r.layer });
    let s = null;
    const okk = await until(async () => { s = await statOf(r.layer); return s && s.preset === p.id && s.frames > 2; }, 8000);
    if (!okk || !s?.ok) bad.push(p.id); else ms[p.id] = s.ms;
  }
  const errs = D.report().errors.filter((e) => /visualizer/.test(e.message || ''));
  step('all 17 looks compile and draw (one layer changed through each)', !bad.length && !errs.length, { bad, errs, msPerFrame: ms });
  await LabVis.undo(); // (the last change back: logo → the one before)
  await D.removeLayer?.(r.layer);
  if (rows().some((x) => x.name === r.layer)) await HubBridge.call('three_remove_layer', { layer: r.layer });
}

// ---------- renders: brighter just after each kick, identical bytes twice ----------
const lum = async (buf) => { const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return { mean: s / (d.length / 4) / 3, d, w: bmp.width, h: bmp.height }; };
const same = (p, q) => { const x1 = new Uint8Array(p); const x2 = new Uint8Array(q); return x1.length === x2.length && x1.every((v, j) => v === x2[j]); };
{
  for (const nm of [barsName, ringsName]) await D.updateLayer(nm, { visible: false }, 0.2);
  const ks = hits.filter((t) => t > 0.3 && t < 7).slice(0, 4);
  const T = ks.flatMap((k) => [r3(k - 0.05), r3(k + 0.02)]);
  const errs = [];
  try {
    const shoot = async () => { const r = await LabExport.probe({ w: 96, h: 54, F: 30, n: T.length, times: (j) => T[j] }); errs.push(...(r.errors || [])); return r.frames; };
    const a = await shoot(); const b = await shoot();
    const L = await Promise.all(a.map(lum));
    const pairs = ks.map((k, i) => [Math.round(L[i * 2].mean), Math.round(L[i * 2 + 1].mean)]);
    step('renders: Beat flash on the kick is dark just before each kick and lit just after (the song\'s own hits, off the grid)', ks.length >= 4 && pairs.every(([x, y]) => y > x + 20), { kicks: ks.map(r3), beforeAfter: pairs, errors: errs.slice(0, 3) });
    step('two renders at the same times: identical bytes, frame for frame', a.length === T.length && a.every((f, i) => same(f, b[i])), { same: a.map((f, i) => same(f, b[i])) });
  } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
  // bars: the bass end jumps on the kick
  await D.updateLayer(flashName, { visible: false }, 0.2); await D.updateLayer(barsName, { visible: true }, 0.2);
  try {
    const k = ks[1]; const r = await LabExport.probe({ w: 96, h: 54, F: 30, n: 2, times: (j) => [r3(k - 0.06), r3(k + 0.03)][j] });
    const [x0, x1] = await Promise.all(r.frames.map(lum));
    const left = (z) => { let s = 0; for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w * 0.3; x++) { const i = (y * z.w + x) * 4; s += z.d[i] + z.d[i + 1] + z.d[i + 2]; } return s / (z.h * z.w * 0.3 * 3); };
    step('renders: Spectrum bars\' bass end (left) jumps on a kick', left(x1) > left(x0) * 1.3 + 2, { before: Math.round(left(x0)), after: Math.round(left(x1)) });
  } catch (err) { step('bars render', false, String(err?.message || err)); }
}

// ---------- the preview at a paused time ≈ the render at that time ----------
{
  const t = r3(hits[2] + 0.03);
  c.seek(t); await wait(300);
  await until(async () => Math.abs(((await statOf(barsName))?.t ?? -9) - t) < 0.01, 6000);
  await wait(400);
  const url = await D.shot();
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  let diff = null; let size = null;
  if (im) {
    const w = 64; const h = Math.max(8, Math.round((64 * im.height) / im.width)); size = [im.width, im.height];
    const r = await LabExport.probe({ w: w * 2, h: h * 2, F: 30, n: 1, times: () => t });
    const bmp = await createImageBitmap(new Blob([r.frames[0]], { type: 'image/jpeg' }));
    const px = (src) => { const cv = new OffscreenCanvas(w, h); const g = cv.getContext('2d'); g.drawImage(src, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
    const A = px(im); const B = px(bmp); let s = 0; let lit = 0;
    for (let i = 0; i < A.length; i += 4) { s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); if (B[i] + B[i + 1] + B[i + 2] > 120) lit += 1; }
    diff = { meanAbs: Math.round((s / (A.length / 4) / 3) * 10) / 10, litInRender: lit };
  }
  step('the preview paused at a time ≈ the render at that time (mean difference small, both drawn)', diff && diff.meanAbs < 14 && diff.litInRender > 20, { t, size, diff });
}

// ---------- a paused song uploads nothing (the page may doze) ----------
{
  c.player.toggle?.(false);
  await wait(1200);
  const a = await statOf(barsName); await wait(1500); const b = await statOf(barsName);
  step('paused: the visualizer uploads nothing new (the still check lets the page doze)', a && b && a.uploads === b.uploads, { a: a?.uploads, b: b?.uploads, doze: (await ev('return window.__labPace?.state()?.doze'))?.why });
}

// ---------- one undo per change ----------
{
  const u0 = LabVis.undoDepth;
  await LabVis.setOn(barsName, { listen: 'bass' });
  const changed = /listen: \{ value: 'bass'/.test(codeOfL(barsName));
  await LabVis.setOn(barsName, { sens: 1.7 });
  const two = LabVis.undoDepth === u0 + 2;
  await LabVis.undo();
  const back1 = !/sens: \{ value: 1\.7/.test(codeOfL(barsName)) && /listen: \{ value: 'bass'/.test(codeOfL(barsName));
  await LabVis.undo();
  const back2 = /listen: \{ value: 'whole'/.test(codeOfL(barsName));
  const pl = await say('/visualizer place bottom');
  const placed = D.report().layers.find((x) => x.name === barsName)?.transform;
  step('each change is one undo step (listens to bass, sensitivity 1.7; undo, undo → as before); /visualizer place bottom moves the layer', changed && two && back1 && back2 && placed?.y === 28, { changed, two, back1, back2, placed, pl });
  await LabVis.undo();
  const nL = rows().length;
  await LabVis.apply('stars');
  await until(() => rows().length === nL + 1, 6000);
  await LabVis.undo();
  await until(() => rows().length === nL, 6000);
  step('…and undoing an added look takes the layer away', rows().length === nL, rows().map((x) => x.name));
}

// ---------- saved with the scene ----------
{
  await wait(1800);
  const disk = await window.hub.kvGet('three-sketches', []);
  const sk = (disk || []).find((s) => s.id === sceneId);
  const vl = (sk?.layers || []).filter((L) => /visualizer\(P, \{ preset: '/.test(L.code || ''));
  step('saved with the scene (on disk): the looks are ordinary layers with their code', vl.length >= 3, sk?.layers?.map((L) => L.name));
}
for (const nm of [flashName, ringsName]) await D.updateLayer(nm, { visible: true }, 0.2).catch(() => {});
c.seek(3.42); await wait(900);
await J.shot('labvisualizers-scene');
return J.done();
