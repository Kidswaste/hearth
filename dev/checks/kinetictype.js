// 🅰 Text that moves (round 45, kinetictype): a fixture song (13 s, kicks OFF a steady grid, so "on the kick" can't pass
// by landing on beats) under a plain dark scene. Checks: the ways in (＋ Add, a 🅰 layer's right-click, Lab search
// "text animation" / "lyrics", Find anything, /text-moves); the picker's 22 live previews draw (and what a frame of them
// costs); three presets applied (a card click, the API, the chat command), each a 🅰 layer that draws; two renders from
// the hidden export page at the same times give the same bytes (and other times differ); a preset on the kick steps a
// word in on each of the song's kicks (the page's step = the kick's time, the words visible grow kick by kick); lyric
// lines put on markers tapped on the Hit lane start there and show at their time; one undo per change (a control, an
// add); saved with the scene (on disk) and back after a scene switch; a 📐 template made from the scene keeps the
// words as a field that still edits the text (the motion kept); no duplicate commands.
//   node dev/smoke.js --check-timeout 360000 --script dev/checks/kinetictype.js --shot /tmp/kinetictype.png
const { wait, until, step } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-kinetictype-check.wav';
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
await until(() => typeof ThreeLab !== 'undefined' && typeof LabKineticHook !== 'undefined' && typeof LabType !== 'undefined', 30000);
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
const statOf = async (name) => { const L = rows().find((x) => x.name === name || x.id === name); const all = await ev('return window.__labType.info()'); return Array.isArray(all) ? all.find((x) => x.id === L?.id) || null : null; };
// a type layer's numbers at a playhead time (paused): wait for a frame drawn at that time
const statAt = async (name, t, ok = () => true) => { c.seek(t); let s = null; await until(async () => { s = await statOf(name); return s && Math.abs((s.t ?? -9) - t) < 0.02 && ok(s); }, 6000); await wait(250); return (await statOf(name)) || s; }; // (a paused scene draws a few frames a second: read once more after the first frame there)
const codeOfL = (name) => D.codeOf(rows().find((x) => x.name === name || x.id === name)?.id).code;
c.player.toggle?.(false);

// ---------- the ways in ----------
{
  const add = LabKineticHook.addItem();
  step('＋ Add › 🅰 Text that moves… (one row, with its tooltip)', /Text that moves/.test(add.label) && /music/.test(add.tip), add.label);
  step('/text-moves is a Lab command; no duplicate commands', Commands.get('text-moves')?.area === 'Three.js Lab' && !(Commands.duplicates?.() || []).length, Commands.duplicates?.());
  if (typeof LabSearch === 'undefined') await Lazy.load('labsearch');
  LabSearch.buildIndex?.();
  const top = (q) => LabSearch.find(q, 5).map((y) => `${y.item.label}`);
  const a = top('text animation'); const b = top('lyrics');
  step('Lab search: "text animation" → 🅰 Text that moves; "lyrics" → the lyric rows', a.some((l) => /Text that moves|make text move/i.test(l)) && b.some((l) => /yric/i.test(l)), { a, b });
  const found = {};
  for (const q of ['text animation', 'lyrics']) {
    try {
      AppUI.palette();
      await until(() => document.querySelector('.palette-input'), 3000);
      const inp = document.querySelector('.palette-input');
      inp.value = q; inp.dispatchEvent(new Event('input'));
      await wait(600);
      found[q] = [...document.querySelectorAll('.palette .palette-item .p-label')].slice(0, 8).map((y) => y.textContent);
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(200);
    } catch (err) { found[q] = String(err); }
  }
  step('Find anything: "text animation" and "lyrics" find it', Array.isArray(found['text animation']) && found['text animation'].some((l) => /Text that moves|text move/i.test(l || '')) && Array.isArray(found.lyrics) && found.lyrics.some((l) => /yric/i.test(l || '')), found);
}

// ---------- the picker: 22 live previews ----------
await LabKineticHook.lib((K) => K.open());
await until(() => document.querySelectorAll('.kt-card').length >= 20, 5000);
await wait(700);
{
  const cards = [...document.querySelectorAll('.kt-card')];
  const litOf = () => cards.slice(0, 8).map((b) => { const cv = b.querySelector('canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n += 1; return n; });
  let lit = litOf(); await until(() => (lit = litOf()).every((x) => x > 5), 6000); // (the picker's own loop draws them)
  // what one frame of every preview costs (they draw in the picker's own loop, only the cards in view)
  const K = LabKinetic; const t0 = performance.now(); let frames = 0;
  const cs = cards.map((b) => { const p = K.PRESETS.find((x) => x.id === b.dataset.id); const cv = b.querySelector('canvas'); return { p, canvas: cv, g: cv.getContext('2d'), lay: null, font: 'system-ui', ctl: () => ({}), text: () => p.words }; });
  const per = [];
  while (performance.now() - t0 < 500) { const a = performance.now(); for (const cd of cs) K.drawCard(cd, frames * 0.016); per.push(performance.now() - a); frames += 1; }
  per.sort((x, y) => x - y);
  const ms = per[Math.floor(per.length / 4)]; // (the lower quartile: other programs on this machine preempt some frames)
  step(`the picker shows ${cards.length} presets as live previews (the first 8 draw letters)`, cards.length >= 20 && lit.every((n) => n > 5), { cards: cards.length, lit });
  step('…every preview\'s frame together stays light (< 3 ms for all 22 at once; the picker draws only the ones in view)', ms < 3, { msPerFrame: Math.round(ms * 100) / 100, median: Math.round(per[per.length >> 1] * 100) / 100, frames });
  await J.shot('kinetictype-picker');
  await smoke({ shot: '/tmp/kinetictype-picker.png' });
}

// ---------- three presets: a card click (adds a layer), the API, the chat command ----------
const n0 = rows().length;
{
  const inp = document.querySelector('.kt-text'); inp.value = 'HELLO MOVING WORLD'; inp.dispatchEvent(new Event('input'));
  document.querySelector('.kt-card[data-id="pop-words"]').click();
  await until(() => rows().length === n0 + 1, 8000);
  document.querySelector('.kt-dlg button[aria-label="Close"]')?.click();
}
const popName = rows().at(-1)?.name;
await LabKinetic.apply('kick-punch', { text: 'PUNCH' });
await until(() => rows().length === n0 + 2, 8000);
const punchName = rows().at(-1)?.name;
const said = await say('/text-moves countdown');
await until(() => rows().length === n0 + 3, 8000);
const cdName = rows().at(-1)?.name;
await until(async () => (await ev('return window.__labType.kinetic()')) === true, 10000);
{
  const st = await Promise.all([popName, punchName, cdName].map(async (n) => { await until(async () => (await statOf(n))?.kin, 6000); return statOf(n); }));
  step('three presets (a card click, LabKinetic.apply, /text-moves countdown): three 🅰 layers moving on the music, no errors',
    st.every((s) => s && s.ok !== false && s.kin) && /"kinetic":"pop-words"/.test(codeOfL(popName)) && /kSync: \{ value: 'kick'/.test(codeOfL(punchName)) && /"kinetic":"countdown"/.test(codeOfL(cdName)) && !D.report().errors.length,
    { names: [popName, punchName, cdName], kin: st.map((s) => s?.kin), said, errors: D.report().errors });
}

// ---------- renders: two frames at the same times, twice: the same bytes ----------
{
  const T = [3.6, 6.4, 3.6, 6.4];
  const errs = [];
  const shoot = async () => { const r = await LabExport.probe({ w: 128, h: 72, F: 30, n: T.length, times: (j) => T[j] }); errs.push(...(r.errors || [])); return r.frames; };
  try {
    const a = await shoot(); const b = await shoot();
    const same = (p, q) => { const x1 = new Uint8Array(p); const x2 = new Uint8Array(q); return x1.length === x2.length && x1.every((v, j) => v === x2[j]); };
    step('render two frames twice from the export page: identical bytes, frame for frame', a.length === 4 && a.every((f, i) => same(f, b[i])), { frames: a.length, same: a.map((f, i) => same(f, b[i])), bytes: [a.map((f) => f.byteLength), b.map((f) => f.byteLength)], errors: errs.slice(0, 3) });
    step('…the same time within one render too, and the two times differ (the words moved on)', same(a[0], a[2]) && !same(a[0], a[1]));
  } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
}

// ---------- on the kick: a word steps in on each of the song's kicks ----------
let kickName = null;
{
  for (const n of [popName, punchName, cdName]) await D.updateLayer(n, { visible: false }, 0.2);
  const r = await LabKinetic.apply('kick-stamp', { text: 'ONE TWO THREE FOUR FIVE SIX SEVEN' });
  kickName = r.layer;
  const hits = JSON.parse((await ev('return JSON.stringify(audio.analysis?.onsets?.kick?.map((o) => (typeof o === "number" ? o : o.t)) || [])')) || '[]');
  const near = KICKS.filter((k) => k > 0.3 && k < 6).every((k) => hits.some((h) => Math.abs(h - k) < 0.05));
  const ks = hits.filter((t) => t > 0.3 && t < 5.5).slice(0, 5);
  const on = []; const before = [];
  for (const k of ks) { before.push(await statAt(kickName, r3(k - 0.04))); on.push(await statAt(kickName, r3(k + 0.03))); }
  const steps = on.map((s) => s?.kin?.k); const ats = on.map((s) => s?.kin?.at);
  step('the song\'s kicks are found where they were made (off the beat grid)', near && ks.length >= 4, { kicks: ks.map(r3) });
  step('on the kick: just after each kick the step is that kick (its time, ±1 ms), one more each kick', ks.length >= 4 && ats.every((a, i) => Math.abs(a - ks[i]) < 0.0015) && steps.every((k, i) => k === steps[0] + i), { steps, ats, kicks: ks.map(r3) });
  const gb = before.map((s) => s?.glyphs ?? -1); const ga = on.map((s) => s?.glyphs ?? -1);
  step('…and the words on screen grow kick by kick (none of the next word just before its kick)', ga.every((g, i) => g > gb[i]) && ga.slice(1).every((g, i) => g > ga[i]), { before: gb, after: ga });
}

// ---------- lyric lines on markers (the Hit lane) ----------
{
  const want = [2.2, 4.4, 7.3];
  for (const t of want) { c.seek(t); await wait(120); c.player.tapLane('hit'); await wait(120); }
  const marks = c.player.markersIn('hit', 0, 13);
  const r = await LabKinetic.lyricLines('the first line here\nthe second line\nthe last one', { how: 'markers' });
  await until(() => rows().some((x) => x.name === r.layer), 6000);
  const o = LabType.optsOf(codeOfL(r.layer));
  const starts = (o.lyrics || []).map((x) => x[0]);
  step('lyric lines on 3 markers tapped on the Hit lane: line i starts on marker i', marks.length === 3 && starts.length === 3 && starts.every((a, i) => Math.abs(a - marks[i]) < 0.002), { marks: marks.map(r3), starts, how: r.how });
  const s1 = await statAt(r.layer, r3(marks[1] + 0.3)); const s0 = await statAt(r.layer, r3(marks[1] - 0.3));
  step('…the page shows line 2 from its marker (line 1 just before)', s1?.line === 1 && s0?.line === 0, { at: s1?.line, before: s0?.line });
  await D.updateLayer(r.layer, { visible: false }, 0.2);
}

// ---------- one undo per change ----------
{
  const u0 = LabKinetic.undoDepth;
  await LabKinetic.setOn(kickName, { kSync: 'bar' });
  const changed = /kSync: \{ value: 'bar'/.test(codeOfL(kickName));
  await LabKinetic.setOn(kickName, { amount: 1.7 });
  const two = LabKinetic.undoDepth === u0 + 2;
  await LabKinetic.undo();
  const back1 = !/amount: \{ value: 1\.7/.test(codeOfL(kickName)) && /kSync: \{ value: 'bar'/.test(codeOfL(kickName));
  await LabKinetic.undo();
  const back2 = /kSync: \{ value: 'kick'/.test(codeOfL(kickName));
  step('each control change is one undo step (moves on: bar, intensity 1.7; undo, undo → as before)', changed && two && back1 && back2, { changed, two, back1, back2 });
  const nL = rows().length;
  await LabKinetic.apply('wave', { text: 'GONE SOON' });
  await until(() => rows().length === nL + 1, 6000);
  await LabKinetic.undo();
  await until(() => rows().length === nL, 6000);
  step('…and undoing an added preset takes the layer away', rows().length === nL, rows().map((x) => x.name));
}

// ---------- saved with the scene, back after a switch ----------
{
  await wait(1800);
  const disk = await window.hub.kvGet('three-sketches', []);
  const sk = (disk || []).find((s) => s.id === sceneId);
  const kl = sk?.layers?.find((L) => /"kinetic":"kick-stamp"/.test(L.code || ''));
  step('saved with the scene (on disk): the preset and its timing in the layer\'s code', Boolean(kl) && /kSync: \{ value: 'kick'/.test(kl.code), sk?.layers?.map((L) => L.name));
  const name = ThreeLab.scenes.get(sceneId).name;
  ThreeLab.openCode(BG.replace('#07080c', '#0c0807'));
  await wait(2000);
  c.openSketch(name);
  await until(() => ThreeLab.scenes.currentId() === sceneId, 8000);
  await c.waitSong?.(); await until(() => c.player.loaded, 8000);
  await wait(1000);
  c.player.toggle?.(false);
  const s = await statAt(kickName, 3.45, (x) => x.kin?.k >= 0); // (the song's hits reach the page a moment after the switch)
  step('…switch scenes and back: it moves on the kicks again', s?.kin && Math.abs(s.kin.at - 3.4) < 0.06, s?.kin);
}

// ---------- 📐 a template keeps the words as a field ----------
{
  if (typeof TemplateCore === 'undefined') await Lazy.load('labtemplates');
  const sc = ThreeLab.scenes.get(sceneId);
  const scene = { name: sc.name, layers: ThreeLab.scenes.layersOf(sc), palette: sc.palette || [], extras: {}, refs: [] };
  const fields = TemplateCore.extract(scene, {});
  const L = rows().find((x) => x.name === kickName);
  const f = fields.find((x) => x.kind === 'text' && x.layer === L?.id);
  const t = TemplateCore.make(scene, fields, { name: 'kinetic probe' });
  const made = TemplateCore.apply(t, { [f?.id]: 'NEW WORDS HERE' });
  const code = made.layers.find((x) => x.id === L?.id)?.code || '';
  step('a 📐 template of the scene: the words are a field; filling it in changes the text and keeps the motion', f?.value === 'ONE TWO THREE FOUR FIVE SIX SEVEN' && /"text":"NEW WORDS HERE"/.test(code) && /"kinetic":"kick-stamp"/.test(code) && /kSync: \{ value: 'kick'/.test(code), { field: f?.value, ok: /NEW WORDS/.test(code) });
}
for (const n of [popName, punchName, cdName]) await D.updateLayer(n, { visible: true }, 0.2).catch(() => {});
c.seek(3.6); await wait(800);
await J.shot('kinetictype-scene');
return J.done();
