// 🅰 Kinetic type (round 25, type): type layers draw (2D SDF, 3D extruded, on a path) without errors; every in / out
// animation moves the glyphs with the scene's clock (a generated song, paused and sought); the kick moves letters;
// pasted lyrics are aligned to the song (line starts on its onsets), an .lrc keeps its times; tap-along retimes a
// line and the ones after it; the same exported frame twice is the same picture; /text, /lyrics, three_do type.
//   node dev/smoke.js --check-timeout 420000 --script dev/checks/text.js --shot /tmp/hearth-type.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], anims: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(400); } return r; };
const rowOf = (name) => d.layers().layers.find((x) => x.name === name);
const statOf = async (name) => { const L = rowOf(name); const all = await sbx('return window.__labType.info()'); return Array.isArray(all) ? all.find((x) => x.id === L?.id) || null : null; };
const pix = async () => String(await sbx('return window.__labGpu.probe(16)')).split(',').map(Number);
const mean = (a) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const errsOf = (name) => d.report().errors.filter((e) => e.layer === name);
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05060a'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

// ---------- a generated song: 120 BPM, kicks on the beat, snares on 2 and 4, a bar of intro ----------
const SONG = '/tmp/hearth-type-check.wav';
{
  const sr = 44100; const BPM = 120; const beat = 60 / BPM; const LEAD = 0.25; const NB = 64;
  const n = Math.round((LEAD + NB * beat + 1) * sr); const x = new Float32Array(n);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
  for (let k = 0; k < NB; k++) {
    const t = LEAD + k * beat;
    if (k >= 4) add(t, 0.3, (s) => 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-s * 30)) * s) * Math.exp(-s * 9));
    if (k % 2 === 1 && k >= 4) add(t, 0.18, (s) => 0.45 * rnd() * Math.exp(-s * 18));
    let prev = 0; add(t + beat / 2, 0.04, (s) => { const v = rnd(); const dd = v - prev; prev = v; return 0.15 * dd * Math.exp(-s * 90); });
    if (k % 4 === 0) add(t, beat * 3.5, (s) => 0.22 * Math.sin(2 * Math.PI * 55 * s) * Math.min(1, s * 40) * Math.exp(-s * 0.8));
  }
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < n; i++) x[i] = (x[i] / pk) * 0.9;
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round(x[i] * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}

await d.newSketch('type probe', BG, 3);
step('LabType loaded with the Lab (presets, /text, /lyrics)', typeof LabType !== 'undefined' && LabType.PRESETS.length >= 30 && Commands.get('text')?.area === 'Three.js Lab' && Boolean(Commands.get('lyrics')), { presets: LabType?.PRESETS?.length });
step('no duplicate commands', !(Commands.duplicates?.() || []).length, Commands.duplicates?.());

// 1. a 2D title, 3D extruded letters, text on a circle
let title = null;
await safe('2d', async () => {
  const r = await LabType.add('title', { text: 'HELLO WORLD', sliders: { hold: 0, start: 0 } });
  title = r.layer;
  await until(async () => (await statOf(title))?.glyphs >= 10, 10000);
  const s = await statOf(title); const p = mean(await pix());
  step('a 2D type layer draws its glyphs (SDF atlas, no errors)', s?.mode === '2d' && s.glyphs === 10 && s.atlas >= 7 && s.ok === true && !errsOf(title).length && p > 1, { s, bright: Math.round(p * 10) / 10, errs: errsOf(title) });
  await smoke({ shot: '/tmp/hearth-type-2d.png' });
  await d.updateLayer(title, { visible: false }, 0.3);
});
await safe('3d', async () => {
  const r = await LabType.add('chrome3d', { text: 'HI 3D', sliders: { hold: 0, start: 0, spin: 0 } });
  await until(async () => (await statOf(r.layer))?.glyphs >= 4, 15000);
  await wait(800);
  const s = await statOf(r.layer); const p = mean(await pix());
  step('3D extruded letters (traced outlines, bevel, chrome) draw', s?.mode === '3d' && s.glyphs === 4 && !errsOf(r.layer).length && p > 1, { s, bright: Math.round(p * 10) / 10, errs: errsOf(r.layer) });
  const g = await sbx(`const r = __scenes[${JSON.stringify(r.layer)}]; let n = 0; let tris = 0; r?.scene?.traverse((o) => { if (o.isMesh && o.visible) { n += 1; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { n, tris: Math.round(tris) };`);
  step('…each letter a mesh with real geometry (holes: the D)', g?.n === 4 && g.tris > 200, g);
  await smoke({ shot: '/tmp/hearth-type-3d.png' });
  await d.updateLayer(r.layer, { visible: false }, 0.3);
});
await safe('path', async () => {
  const r = await LabType.add('circle', { sliders: { hold: 0, start: 0, pathSpin: 0 } });
  await until(async () => (await statOf(r.layer))?.glyphs > 10, 10000);
  const s = await statOf(r.layer);
  const line = await LabType.add('title', { text: 'HEARTH • MADE IN THE LAB • ', sliders: { hold: 0, start: 0, size: 0.08, tracking: 0.08 } });
  await until(async () => (await statOf(line.layer))?.glyphs > 10, 10000);
  const s2 = await statOf(line.layer);
  step('text on a circle: the same glyphs as on a line, other places', s?.glyphs === s2?.glyphs && Math.abs(s.sig - s2.sig) > 0.05 && !errsOf(r.layer).length, { circle: s?.sig, line: s2?.sig, n: s?.glyphs });
  await d.updateLayer(line.layer, { visible: false }, 0.3);
  await smoke({ shot: '/tmp/hearth-type-circle.png' });
  for (const k of ['arc', 'wave', 'spiral']) { await LabType.setPath(r.layer, k); await wait(500); }
  const s3 = await statOf(r.layer);
  step('…arc, wave and spiral paths draw too', s3?.glyphs === s.glyphs && !errsOf(r.layer).length, s3);
  await d.updateLayer(r.layer, { visible: false }, 0.3);
});

// 2. every animation moves the glyphs with the clock (the song, paused, sought)
const lr = await c.loadSong(SONG);
step('the test song loads', lr?.ok !== false, lr);
await until(() => c.state.bpm > 0 && c.player.analysis, 20000);
await safe('anims', async () => {
  const L = rowOf(title);
  await d.updateLayer(title, { visible: true }, 0.3);
  const anims = await sbx('return window.__labType.anims()');
  const bad = {};
  const at = async (t) => { c.seek(t); await wait(260); return statOf(title); };
  for (const a of anims) {
    await LabType.set(L.id, { inAnim: a, outAnim: 'none', start: 0.5, stagger: 0.03, dur: 1, hold: 0, ease: 'out' });
    await until(async () => (await statOf(title))?.frames > 2, 6000);
    const s0 = await at(0.75); const s1 = await at(1.05); const s2 = await at(3);
    const moved = Math.abs(s0.sig - s1.sig) > 0.0005 || Math.abs(s0.alpha - s1.alpha) > 0.01;
    out.anims[a] = { a: [s0.alpha, s1.alpha, s2.alpha], sig: [s0.sig, s1.sig, s2.sig] };
    if (!moved || s2.glyphs !== 10 || errsOf(title).length) bad[a] = { ...out.anims[a], n: s2.glyphs, errs: errsOf(title).slice(0, 1) };
  }
  step(`all ${anims.length} in animations move the glyphs over time and settle on the word`, anims.length >= 26 && !Object.keys(bad).length, Object.keys(bad).length ? bad : anims.length);
  // an out: gone after hold + its time
  await LabType.set(L.id, { inAnim: 'fade', outAnim: 'scatter', start: 0.2, hold: 1, dur: 0.6, stagger: 0.02 });
  await wait(600);
  const sIn = await at(1.2); const sOut = await at(2.3); const sGone = await at(4);
  step('an out animation (scatter) takes the glyphs away after the hold', sIn.glyphs === 10 && Math.abs(sOut.sig - sIn.sig) > 0.01 && sGone.glyphs === 0, { sIn, sOut: sOut.sig, gone: sGone.glyphs });
  // by word, order: the words come in one after another
  await LabType.set(L.id, { inAnim: 'fade', outAnim: 'none', unit: 'word', stagger: 1, dur: 0.2, start: 0.5, hold: 0 });
  await wait(600);
  const w1 = await at(1); const w2 = await at(2);
  step('by word: the second word comes a stagger after the first', w1.glyphs === 5 && w2.glyphs === 10, { w1: w1.glyphs, w2: w2.glyphs });
  await smoke({ shot: '/tmp/hearth-type-anim.png' });
});

// 3. the kick moves the letters (held through window.__labType.drive)
await safe('react', async () => {
  const L = rowOf(title);
  await LabType.set(L.id, { unit: 'glyph', stagger: 0.03, beatBounce: 1, kickJitter: 0.5, letterReact: 0.5 });
  await wait(500); c.seek(3); await wait(300);
  await sbx('return window.__labType.drive({ kick: 0, bass: 0 })'); await wait(250);
  const a = await statOf(title);
  await sbx('return window.__labType.drive({ kick: 1, bass: 1 })'); await wait(250);
  const b = await statOf(title);
  await sbx('return window.__labType.drive({ kick: null, bass: null })');
  step('♪ the kick moves the letters (bounce, jitter, per letter)', Math.abs(a.sig - b.sig) > 0.01, { calm: a.sig, kick: b.sig });
  const r = await HubBridge.call('three_do', { cmd: 'type', op: 'react', layer: L.id, off: true });
  step('three_do type react off', r.ok && /kickScale = 0/.test(r.value.set.join(' ')), r.ok ? r.value.set : r.error);
});

// 4. lyrics: pasted lines aligned to the song; an .lrc keeps its times; the karaoke look
const LINES = ['We light the fire', 'tonight we burn so bright', 'every spark a story', 'hearth and home', 'turn it up', 'hold the line'];
let lyr = null;
await safe('lyrics', async () => {
  const r = await LabType.lyrics({ text: LINES.join('\n'), look: 'karaoke' });
  lyr = r.layer;
  const o = LabType.optsOf(d.codeOf(rowOf(lyr).id).code);
  const lines = o.lyrics || [];
  const A = c.player.analysis; const ons = [...(A.onsets.kick || []), ...(A.onsets.snare || []), ...(A.onsets.hats || [])].map((x) => x.t);
  const near = lines.map((x) => Math.min(...ons.map((t) => Math.abs(t - x[0]))));
  step('pasted lyrics: every line on the song, in order', lines.length === 6 && lines.every((x, i) => x[1] > x[0] && (!i || x[0] > lines[i - 1][0]) && x[1] <= c.player.duration + 0.01), { lines: lines.map((x) => [x[0], x[1]]), how: r.how });
  step('…each line starts on an onset of the song (≤ 40 ms)', near.every((x) => x <= 0.04), { near: near.map((x) => Math.round(x * 1000)) });
  step('…words timed inside each line', lines.every((x) => Array.isArray(x[3]) && x[3].length === x[2].split(' ').length && x[3][0] === x[0]), lines.map((x) => x[3]));
  // the karaoke look: the line being sung, half filled
  const L1 = lines[1];
  c.seek((L1[0] + L1[1]) / 2);
  await until(async () => (await statOf(lyr))?.line === 1, 4000);
  const s = await statOf(lyr);
  step('karaoke: the sung line (and the next) on screen at its time', s?.line === 1 && s.glyphs >= L1[2].replace(/\s/g, '').length, s);
  await smoke({ shot: '/tmp/hearth-type-karaoke.png' });
  for (const look of ['oneword', 'scroll', 'fades', 'type', 'lines']) {
    await LabType.set(lyr, { look }); await wait(500);
    const sl = await statOf(lyr);
    out[`look_${look}`] = { glyphs: sl?.glyphs, line: sl?.line };
    if (!(sl?.glyphs > 0) || errsOf(lyr).length) step(`lyric look ${look} draws`, false, { sl, errs: errsOf(lyr) });
  }
  step('lyric looks: one word, scrolling, fades, typed, lines all draw', true);
  const lrc = '[00:04.00]First line\n[00:06.52]Second <00:07.50>line\n[00:09.00]Third';
  const r2 = await HubBridge.call('three_do', { cmd: 'type', op: 'lyrics', layer: lyr, text: lrc });
  const o2 = LabType.optsOf(d.codeOf(rowOf(lyr).id).code).lyrics;
  step('an .lrc keeps its times (tightened ≤ 120 ms onto onsets)', r2.ok && o2.length === 3 && Math.abs(o2[0][0] - 4) <= 0.12 && Math.abs(o2[1][0] - 6.52) <= 0.12, r2.ok ? o2 : r2.error);
  await LabType.lyrics({ text: LINES.join('\n'), layer: lyr });
});

// 5. tap-along: line 2 tapped half a second late; it and the lines after it move, the first stays
await safe('tap', async () => {
  const before = LabType.optsOf(d.codeOf(rowOf(lyr).id).code).lyrics.map((x) => x[0]);
  await LabType.tapMode(lyr, { play: false });
  step('tap-along shows its strip', Boolean(document.querySelector('.type-tap')) && LabType.tapping?.n === 6);
  LabType.tapAt(before[0]);
  LabType.tapAt(before[1] + 0.5);
  const done = await LabType.tapStop(true);
  await wait(400);
  const after = LabType.optsOf(d.codeOf(rowOf(lyr).id).code).lyrics.map((x) => x[0]);
  const dd = after[1] - before[1];
  step('tap: the tapped line moved (≈ +0.5 s, snapped to an onset), the lines after it with it, the first stayed', Math.abs(after[0] - before[0]) < 0.09 && dd > 0.38 && dd < 0.62 && after.slice(2).every((x, i) => Math.abs(x - before[i + 2] - dd) < 0.01) && done.tapped === 2 && !document.querySelector('.type-tap'), { before, after });
});

// 6. the director and chat
await safe('director', async () => {
  const l = await HubBridge.call('three_do', { cmd: 'type', op: 'list', filter: '3d' });
  step('three_do type list', l.ok && /chrome3d/.test(l.value), String(l.value || l.error).slice(0, 120));
  const a = await HubBridge.call('three_do', { cmd: 'type', op: 'add', preset: 'glitch', text: 'DIRECTOR' });
  const rows = d.layers().layers.filter((x) => /^type/.test(x.kind || ''));
  step('three_do type add → a new 🅰 layer the scene lists as type', a.ok && rows.some((x) => x.name === a.value.layer), { r: a.ok ? a.value : a.error, kinds: rows.map((x) => x.name) });
  const an = await HubBridge.call('three_do', { cmd: 'type', op: 'anim', layer: a.value?.layer, in: 'split-flap', unit: 'word' });
  const i = await HubBridge.call('three_do', { cmd: 'type', op: 'info', layer: a.value?.layer });
  step('three_do type anim + info', an.ok && i.ok && i.value.options?.text === 'DIRECTOR' && i.value.sliders.includes('inAnim') && /inAnim = split-flap/.test(an.value.set.join(' ')), i.ok ? { o: i.value.options, set: an.value?.set } : i.error);
  const h = await HubBridge.call('three_do', { cmd: 'type', op: 'help' });
  step('three_do type help (the whole API, on demand)', h.ok && /textLayer/.test(h.value) && /lyrics/.test(h.value), String(h.value).length);
  const sl = await say('/text list lyrics');
  step('/text list lyrics', /karaoke/.test(sl), sl.slice(0, 100));
  const st = await say('/text path wave');
  step('/text path wave', /wave/.test(st), st);
  await d.updateLayer(a.value.layer, { visible: false }, 0.3);
});

// 7. an exported frame twice is the same picture (the export page, the scene's clock)
await safe('export', async () => {
  await d.newSketch('type export', BG, 3);
  await LabType.add('scatter', { text: 'SAME FRAME', sliders: { hold: 0, start: 0.2 } });
  await wait(1200);
  const sigOf = async (p) => {
    const u8 = await window.hub.fs.read(p, { encoding: 'buffer' });
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const X = LabExport;
  const a = await X.render({ format: 'still', size: '320x180', at: 0.6, alpha: false });
  const b = await X.render({ format: 'still', size: '320x180', at: 0.6, alpha: false });
  const c2 = await X.render({ format: 'still', size: '320x180', at: 2.5, alpha: false });
  const [A, B, C] = [await sigOf(a.path), await sigOf(b.path), await sigOf(c2.path)];
  let same = 0; let other = 0; let lit = 0;
  for (let k = 0; k < A.length; k++) { same += Math.abs(A[k] - B[k]); other += Math.abs(A[k] - C[k]); if (k % 4 !== 3 && C[k] > 60) lit += 1; }
  step('the same exported frame twice is the same picture; another time is another picture', same === 0 && other > 0 && lit > 50, { same, other: Math.round(other / A.length * 1000) / 1000, lit });
});

const h = await sbx('return window.__labHealth()');
out.health = h;
const failed = out.steps.filter((x) => !x.ok).map((x) => x.name);
return JSON.stringify({ ok: !failed.length, failed, ...out }, null, 1);
