// ◆ Shapes that draw themselves (round 51, labshapes): a fixture song (13 s, kicks OFF a steady grid) under a plain dark
// 640×360 scene. Checks: the ways in (＋ Add, /shape, Lab search); the picker's 21 live previews draw (and what a frame of
// them all costs); three shapes added three ways (a card click, the API, the chat command) draw, no errors; every
// preset draws; renders from the hidden export page: a white line drawing on (linear, 1 s from 2 s) is as long as it
// should be at 2.25 / 2.5 / 3 s (in pixels), and on each kick it draws again from nothing (half way 0.15 s after each
// kick); two renders at the same times give the same bytes; the preview paused at a time ≈ the render at that time;
// scaled up it renders on more pixels (crisp); still and paused: no path rebuilt, the page dozes; one undo per change;
// ✎ draw your own with real (CDP) clicks on the pad, Shift for a straight line; saved with the scene.
//   node dev/smoke.js --check-timeout 420000 --script dev/checks/labshapes.js --shot /tmp/labshapes.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-labshapes-check.wav';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const mouse = (params) => Promise.race([smoke({ cdp: 'Input.dispatchMouseEvent', params }), wait(3000)]);
async function clickAt(x, y, mods = 0) {
  await mouse({ type: 'mouseMoved', x, y, button: 'none', modifiers: mods });
  await mouse({ type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
  await mouse({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, modifiers: mods });
  await wait(200);
}

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
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

// ---------- the Lab, the scene, the song ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && typeof LabShapesHook !== 'undefined', 30000);
const c = await ThreeLab.cmd();
await wait(800);
ThreeLab.openCode(BG);
try { c.customSize(640, 360); c.size('custom'); } catch (err) { step('640×360 frame', false, err.message); }
await wait(2500);
const sceneId = ThreeLab.scenes.currentId();
const r0 = await c.loadSong(SONG);
step('the fixture song loads', r0.ok, r0);
await until(() => c.player.analysis?.onsets?.kick?.length > 8, 30000);
const D = ThreeLab.director;
// (read over CDP, not as a message: a message from the Lab wakes the preview, so polling with one would keep it awake)
const sbx = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: `(() => { ${expr} })()`, returnByValue: true } }))?.result?.value;
const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(300); } return null; };
const rows = () => D.layers().layers;
const info = async () => (await ev('return window.__labShape.info()')) || [];
const statOf = async (name) => { const L = rows().find((x) => x.name === name || x.id === name); return (await info()).find((x) => x.id === L?.id) || null; };
const codeOfL = (name) => D.codeOf(rows().find((x) => x.name === name || x.id === name)?.id).code;
c.player.toggle?.(false);
const hits = JSON.parse((await ev('return JSON.stringify(audio.analysis?.onsets?.kick?.map((o) => (typeof o === "number" ? o : o.t)) || [])')) || '[]');
step('the song\'s kicks are found where they were made (off the beat grid)', KICKS.filter((k) => k < 9).every((k) => hits.some((h) => Math.abs(h - k) < 0.05)), { hits: hits.map(r3) });

// ---------- the ways in ----------
{
  const add = LabShapesHook.addItem();
  step('＋ Add › ◆ Shape… (one row, with its tooltip)', /Shape/.test(add.label) && /draw/.test(add.tip), add.label);
  step('/shape is a Lab command; no duplicate commands', Commands.get('shape')?.area === 'Three.js Lab' && !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
  if (typeof LabSearch === 'undefined') await Lazy.load('labsearch');
  LabSearch.buildIndex?.();
  const top = (q) => LabSearch.find(q, 5).map((y) => `${y.item.label}`);
  const a = top('shape'); const b = top('underline'); const d = top('draw on');
  step('Lab search: "shape", "underline", "draw on" → ◆ Shape…', [a, b, d].every((l) => l.some((x) => /Shape/.test(x))), { a, b, d });
}

// ---------- the picker: 21 live previews ----------
await LabShapesHook.lib((S) => S.open());
await until(() => document.querySelectorAll('.shp-card').length >= 21, 8000);
await wait(900);
{
  const cards = [...document.querySelectorAll('.shp-card')];
  const litOf = () => cards.slice(0, 8).map((b) => { const cv = b.querySelector('canvas'); if (!cv.width) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 60) n += 1; return n; });
  let lit = litOf(); await until(() => (lit = litOf()).every((x) => x > 5), 8000);
  const S = LabShapes; const t0 = performance.now(); let frames = 0; const per = [];
  const cs = cards.map((b) => { const p = S.PRESETS.find((x) => x.id === b.dataset.id); const cv = b.querySelector('canvas'); return { p, canvas: cv, g: cv.getContext('2d') }; });
  while (performance.now() - t0 < 600) { const a0 = performance.now(); for (const cd of cs) S.drawCard(cd, frames * 0.016); per.push(performance.now() - a0); frames += 1; }
  per.sort((x, y) => x - y);
  step(`the picker shows ${cards.length} shapes as live previews (the first 8 draw)`, cards.length === 21 && lit.every((n) => n > 5), { cards: cards.length, lit });
  step('…what a frame of all 21 previews costs (drawn in the picker\'s own loop, only the ones in view)', per.length > 3, { msLowerQuartile: Math.round(per[Math.floor(per.length / 4)] * 100) / 100, median: Math.round(per[per.length >> 1] * 100) / 100, frames });
  await J.shot('labshapes-picker');
}

// ---------- three shapes: a card click (adds a layer), the API, the chat command ----------
const n0 = rows().length;
document.querySelector('.shp-card[data-id="circle"]').click();
await until(() => rows().length === n0 + 1, 8000);
document.querySelector('.shp-dlg button[aria-label="Close"]')?.click();
const circleName = rows().at(-1)?.name;
await LabShapes.apply('line', { controls: { drawOn: 'in', dur: 1, ease: 'linear', width: 20, delay: 2, stroke: '#ffffff' } });
await until(() => rows().length === n0 + 2, 8000);
const lineName = rows().at(-1)?.name;
const said = await say('/shape arrow');
await until(() => rows().length === n0 + 3, 8000);
const arrowName = rows().at(-1)?.name;
await until(async () => (await ev('return window.__labShape.ready()')) === true, 15000);
{
  const names = [circleName, lineName, arrowName];
  let st = [];
  await until(async () => { st = await Promise.all(names.map(statOf)); return st.every((s) => s && s.frames > 1); }, 10000);
  step('three shapes (a card click, LabShapes.apply, /shape arrow): three ◆ layers drawing, no errors',
    st.every((s) => s && s.ok && s.segs > 0) && /preset: 'circle'/.test(codeOfL(circleName)) && /preset: 'line'/.test(codeOfL(lineName)) && /preset: 'arrow'/.test(codeOfL(arrowName)) && !D.report().errors.length,
    { names, st: st.map((s) => s && { preset: s.preset, ok: s.ok, segs: s.segs, frames: s.frames, ms: s.ms, ratio: s.ratio }), said, errors: D.report().errors });
}

// ---------- every preset draws (one layer, through all of them) ----------
{
  const r = await LabShapes.apply('star', { controls: { drawOn: 'off' } });
  await until(() => rows().some((x) => x.name === r.layer), 6000);
  const bad = [];
  for (const p of LabShapes.PRESETS) {
    if (p.id === 'custom') continue;
    await LabShapes.apply(p.id, { layer: r.layer });
    let s = null;
    const okk = await until(async () => { s = await statOf(r.layer); return s && s.preset === p.id && s.frames > 2 && s.segs > 0; }, 8000);
    if (!okk || !s?.ok) bad.push(p.id);
  }
  const errs = D.report().errors.filter((e) => /shape/i.test(e.message || ''));
  step('all 20 shapes draw (one layer changed through each)', !bad.length && !errs.length, { bad, errs });
  await HubBridge.call('three_remove_layer', { layer: r.layer });
}

// ---------- renders: how far the line has drawn, in pixels; on each kick; identical bytes twice ----------
const img = async (buf) => { const bmp = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); return { d: g.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height }; };
// the lit run across the middle rows: [from, to] x (white line on dark)
const extent = (z) => { let a = 1e9; let b = -1; for (let y = Math.floor(z.h / 2) - 4; y <= Math.floor(z.h / 2) + 4; y++) for (let x = 0; x < z.w; x++) { const i = (y * z.w + x) * 4; if (z.d[i] + z.d[i + 1] + z.d[i + 2] > 3 * 128) { a = Math.min(a, x); b = Math.max(b, x); } } return b < 0 ? 0 : b - a + 1; };
const same = (p, q) => { const x1 = new Uint8Array(p); const x2 = new Uint8Array(q); return x1.length === x2.length && x1.every((v, j) => v === x2[j]); };
const W = 320; const Hh = 180; const UNIT = Hh / 2; const FULL = 1.2 * UNIT; const CAP = (20 / 1080) * Hh; // (the line: 1.2 units, 20 px of a 1080 frame wide, round ends)
for (const nm of [circleName, arrowName]) await D.updateLayer(nm, { visible: false }, 0.2);
{
  const T = [1.9, 2.25, 2.5, 3.0, 4];
  const errs = [];
  try {
    const shoot = async () => { const r = await LabExport.probe({ w: W, h: Hh, F: 30, n: T.length, times: (j) => T[j] }); errs.push(...(r.errors || [])); return r.frames; };
    const a = await shoot(); const b = await shoot();
    const ex = await Promise.all(a.map(async (f) => extent(await img(f))));
    const want = [0, FULL * 0.25 + CAP, FULL * 0.5 + CAP, FULL + CAP, FULL + CAP];
    step('renders: the line drawing on (1 s from 2 s, linear) is as long as it should be, in pixels (±3)', ex.every((x, i) => Math.abs(x - want[i]) <= 3), { times: T, px: ex, want: want.map((x) => Math.round(x * 10) / 10), errors: errs.slice(0, 3) });
    step('two renders at the same times: identical bytes, frame for frame', a.length === T.length && a.every((f, i) => same(f, b[i])), { same: a.map((f, i) => same(f, b[i])) });
  } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
  // on each kick: draws again from nothing, half way 0.15 s after the kick
  await LabShapes.setOn(lineName, { drawOn: 'kick', dur: 0.3 });
  const ks = hits.filter((t) => t > 1 && t < 7).slice(0, 3);
  try {
    const T2 = ks.flatMap((k) => [r3(k + 0.15), r3(k + 0.32)]);
    const r = await LabExport.probe({ w: W, h: Hh, F: 30, n: T2.length, times: (j) => T2[j] });
    const ex = await Promise.all(r.frames.map(async (f) => extent(await img(f))));
    const pairs = ks.map((k, i) => [ex[i * 2], ex[i * 2 + 1]]);
    step('renders: on each kick (the song\'s own, off the grid) the line draws again: half 0.15 s after, whole 0.32 s after', ks.length === 3 && pairs.every(([h, f]) => Math.abs(h - (FULL * 0.5 + CAP)) <= 4 && Math.abs(f - (FULL + CAP)) <= 3), { kicks: ks.map(r3), px: pairs });
  } catch (err) { step('kick renders', false, String(err?.message || err)); }
  await LabShapes.setOn(lineName, { drawOn: 'in', dur: 1 });
}

// ---------- the preview paused at a time ≈ the render at that time ----------
{
  const t = 2.5;
  c.seek(t); await wait(300);
  await until(async () => Math.abs(((await statOf(lineName))?.t ?? -9) - t) < 0.01, 6000);
  await wait(500);
  const url = await D.shot();
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  let out = null;
  if (im) {
    const r = await LabExport.probe({ w: W, h: Hh, F: 30, n: 1, times: () => t });
    const bmp = await createImageBitmap(new Blob([r.frames[0]], { type: 'image/jpeg' }));
    const px = (src) => { const cv = new OffscreenCanvas(W, Hh); const g = cv.getContext('2d'); g.drawImage(src, 0, 0, W, Hh); return { d: g.getImageData(0, 0, W, Hh).data, w: W, h: Hh }; };
    const A = px(im); const B = px(bmp); let s = 0;
    for (let i = 0; i < A.d.length; i += 4) s += Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]);
    out = { shot: [im.width, im.height], meanAbs: Math.round((s / (A.d.length / 4) / 3) * 10) / 10, previewPx: extent(A), renderPx: extent(B) };
  }
  step('the preview paused at 2.5 s ≈ the render at 2.5 s (the line half drawn in both, same length ±3 px)', out && out.meanAbs < 8 && Math.abs(out.previewPx - out.renderPx) <= 3 && Math.abs(out.renderPx - (FULL * 0.5 + CAP)) <= 3, out);
}

// ---------- crisp when scaled up; still: nothing rebuilt, the page dozes ----------
{
  const s0 = await statOf(lineName);
  await say('/shape size 2');
  let s1 = null; await until(async () => { s1 = await statOf(lineName); return s1 && s1.ratio > s0.ratio * 1.9; }, 6000);
  step('scaled ×2 (the ✥ handles\' Scale): it draws on twice the pixels, so it stays crisp', s1 && s1.ratio >= s0.ratio * 1.9, { before: s0?.ratio, after: s1?.ratio });
  await LabShapes.undo();
  c.seek(5); await wait(600);
  const id = rows().find((x) => x.name === lineName)?.id;
  const builds = () => sbx(`return window.__labShape.info().find((x) => x.id === ${JSON.stringify(id)})?.builds`);
  const a = await builds(); await wait(1500);
  const dozed = await until(async () => (await sbx('return window.__labPace?.state()'))?.doze?.on === true, 25000);
  const pace = await sbx('return window.__labPace?.state()'); const b = await builds();
  step('drawn and paused: the path isn\'t made again, and the preview dozes (idlecpu)', a >= 1 && a === b && dozed, { builds: [a, b], doze: pace?.doze });
}

// ---------- one undo per change ----------
{
  const u0 = LabShapes.undoDepth;
  await LabShapes.setOn(lineName, { width: 33 });
  const changed = /width: \{ value: 33,/.test(codeOfL(lineName));
  await LabShapes.setOn(lineName, { reverse: true });
  const two = LabShapes.undoDepth === u0 + 2 && /reverse: \{ value: true/.test(codeOfL(lineName));
  await LabShapes.undo();
  const back1 = /reverse: \{ value: false/.test(codeOfL(lineName)) && /width: \{ value: 33,/.test(codeOfL(lineName));
  await LabShapes.undo();
  const back2 = /width: \{ value: 20,/.test(codeOfL(lineName));
  step('each change is one undo step (width 33, reverse; undo, undo → as before)', changed && two && back1 && back2, { changed, two, back1, back2 });
  const nL = rows().length;
  await LabShapes.apply('heart');
  await until(() => rows().length === nL + 1, 6000);
  await LabShapes.undo();
  await until(() => rows().length === nL, 6000);
  step('…and undoing an added shape takes the layer away', rows().length === nL, rows().map((x) => x.name));
}

// ---------- ✎ draw your own: real clicks on the pad (Shift: a straight line) ----------
{
  await LabShapes.open({ draw: true });
  await until(() => document.querySelector('.shp-padcv')?.getBoundingClientRect().width > 50, 6000);
  await wait(300);
  const r = document.querySelector('.shp-padcv').getBoundingClientRect();
  const P = (fx, fy) => [Math.round(r.left + r.width * fx), Math.round(r.top + r.height * fy)];
  const nL = rows().length;
  const padInfo = { pad: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], dlg: (() => { const b = document.querySelector('.shp-dlg')?.getBoundingClientRect(); return b && [Math.round(b.top), Math.round(b.bottom)]; })(), vh: innerHeight };
  await clickAt(...P(0.2, 0.6));
  await clickAt(...P(0.5, 0.25));
  await clickAt(...P(0.75, 0.29), 8); // (Shift: snapped to 0° / 45° from the point before, a sharp corner)
  await clickAt(...P(0.85, 0.3));
  const pts = LabShapes.picker?.drawing?.pts?.map((x) => x.slice()) || [];
  await J.shot('labshapes-draw');
  const addB = [...document.querySelectorAll('.shp-padbar button')].find((b) => /Add it/.test(b.textContent));
  if (!addB) step('the pad stays open while clicking on it', false, { padInfo, open: Boolean(document.querySelector('.shp-shade')), pts });
  const add = addB?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
  if (addB) await clickAt(Math.round(add.left + add.width / 2), Math.round(add.top + add.height / 2));
  await until(() => rows().length === nL + 1, 8000);
  const name = rows().at(-1)?.name; const code = codeOfL(name) || '';
  const m = /points: (\[\[.*?\]\])/.exec(code); const got = m ? JSON.parse(m[1]) : [];
  let s = null; await until(async () => { s = await statOf(name); return s && s.frames > 1 && s.segs > 3; }, 20000);
  step('✎ draw your own: four real clicks on the pad (the third with Shift) → a ◆ layer with those points, the Shift one sharp and level with the one before (45° steps), drawn by the page',
    pts.length === 4 && got.length === 4 && got[2][2] === 1 && Math.abs(got[2][1] - got[1][1]) < 0.002 && !got[1][2] && /preset: 'custom'/.test(code) && s?.ok && s.frames > 1 && s.segs > 3,
    { pts: pts.map((x) => x.map(r3)), got, stat: s && { segs: s.segs, frames: s.frames }, errors: D.report().errors.slice(0, 3) });
  LabShapes.picker?.close();
}

// ---------- saved with the scene ----------
{
  let sk = null; let sl = [];
  await until(async () => { const disk = await window.hub.kvGet('three-sketches', []); sk = (disk || []).find((x) => x.id === sceneId); sl = (sk?.layers || []).filter((L) => /shapeLayer\(P, \{ preset: '/.test(L.code || '')); return sl.length >= 4; }, 15000);
  step('saved with the scene (on disk): the shapes are ordinary layers with their code', sl.length >= 4, sk?.layers?.map((L) => L.name));
}
for (const nm of [circleName, arrowName]) await D.updateLayer(nm, { visible: true }, 0.2).catch(() => {});
c.seek(2.6); await wait(900);
await J.shot('labshapes-scene');
return J.done();
