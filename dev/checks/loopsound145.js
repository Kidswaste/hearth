// (round 145, loopsound145) The perfect-loop MP4 carries the song's sound, one check:
//   1. Render card on MP4 · perfect loop with ⟲ Loop: the card shows "♪ Sound on" (that format only); ⇪ Export makes
//      an MP4 with an audio stream exactly the video's length (within a frame), its sound asked from the loop's start
//   2. the seam: decoded, the last sample runs into the first like any two samples in a row (no click when it repeats)
//   3. right-click › ∞ Make it loop › ⇪ Render the loop: the same, in one file (no second " + sound" pass)
//   4. ♪ Sound off (the card's chip, remembered): the loop MP4 is silent; a GIF is always silent
// Renders are tiny (96×54, 24 fps). Only the check's own temp data (smoke.js) and the fixture song; never an owner's file.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/loopsound145.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const base = (p) => String(p || '').split(/[\\/]/).pop();
const r3 = (x) => Math.round(x * 1000) / 1000;
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const F = 24;

// ffmpeg through the app's own job runner: the MP4's sound as a mono 48 kHz float WAV next to it (removed after)
const job = (args, input, output) => new Promise((resolve, reject) => {
  const id = `ls145${Math.random().toString(36).slice(2)}`;
  let done = false;
  window.hub.video.onJob((ev) => { if (ev.id !== id || ev.type !== 'done' || done) return; done = true; if (ev.code === 0) resolve(ev); else reject(new Error(ev.error || 'ffmpeg failed')); });
  window.hub.video.transcode({ id, input, output, args, duration: 5 }).catch(reject);
});
async function samplesOf(mp4) {
  const wav = `${mp4}.seam145.wav`;
  await job(['-y', '-i', 'INPUT', '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_f32le', 'OUTPUT'], mp4, wav);
  const b64 = await window.hub.fs.read(wav, { encoding: 'base64' });
  window.hub.fs.trash?.([wav]).catch(() => {});
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  const dv = new DataView(u8.buffer);
  let p = 12; let data = null;
  while (p + 8 <= u8.length) { const id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]); const n = dv.getUint32(p + 4, true); if (id === 'data') { data = { at: p + 8, n: Math.min(n, u8.length - p - 8) }; break; } p += 8 + n + (n & 1); }
  if (!data) throw new Error('no data chunk');
  return new Float32Array(u8.buffer.slice(data.at, data.at + (data.n - (data.n % 4))));
}
// the seam: the step from the last sample (of the stream's own length; the AAC tail past it is padding) to the first,
// against the steps inside the clip; and the level just before vs just after the seam (no drop-out, no burst)
function seamOf(s, secs) {
  const N = Math.min(s.length, Math.round(secs * 48000));
  const steps = []; for (let i = 1; i < N; i += 1) steps.push(Math.abs(s[i] - s[i - 1]));
  steps.sort((a, b) => a - b);
  const q = (k) => steps[Math.min(steps.length - 1, Math.floor(steps.length * k))];
  const wrap = Math.abs(s[0] - s[N - 1]);
  const rms = (a, b) => { let t = 0; for (let i = a; i < b; i += 1) t += s[i] * s[i]; return Math.sqrt(t / Math.max(1, b - a)); };
  const W = 96; // 2 ms each side
  return { N, wrap: r5(wrap), median: r5(q(0.5)), p99: r5(q(0.99)), max: r5(steps[steps.length - 1]), rmsEnd: r5(rms(N - W, N)), rmsStart: r5(rms(0, W)), rmsAll: r5(rms(0, N)) };
}
const seamless = (m) => m.rmsAll > 1e-3 && m.wrap <= Math.max(m.p99, 4 * m.median) && Math.abs(m.rmsEnd - m.rmsStart) <= Math.max(0.5 * m.rmsAll, 3 * Math.min(m.rmsEnd, m.rmsStart) + 0.02);

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.player, 60000);
  const SC = ThreeLab.scenes; const D = ThreeLab.director; const P = ThreeLab.stageHooks.player;
  const code = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 24), new THREE.MeshBasicMaterial({ color: '#ff3d7f' }));
scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; renderer.render(scene, cam); });`;
  const sk = SC.create({ name: 'Loop sound check', code, layers: [ThreeLayers.defaults({ id: 'lsRing', name: 'Ring', code, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  await until(() => P.loaded && P.analysis?.sections?.length && P.timeline()?.grid?.bpm, 60000);
  const g = P.timeline().grid;
  const bar = ((g.beatsPerBar || 4) * 60) / g.bpm;
  const at = (n) => r3((g.downbeat || 0) + n * bar);
  const LOOP = { a: at(2), b: at(4) };
  D.timelineEdit({ loop: { start: LOOP.a, end: LOOP.b } });
  await until(() => P.loop && Math.abs(P.loop.a - LOOP.a) < 1e-3, 5000);
  store.set('three.mediaLoop', true);
  store.set('three.loop.sound', true);
  store.set('three.export', { format: 'loop', size: 'custom', custom: '96x54', fps: F, quality: 'draft', ss: 1, blur: 1 });
  step('setup: a 16:9 scene with the fixture song and a 2-bar loop on the timeline', P.loaded && P.loop?.b > P.loop?.a, { loop: P.loop, bpm: g.bpm, bar: r3(bar) });

  const asked = [];
  const audioPlan0 = ThreeSeq.audioPlan;
  ThreeSeq.audioPlan = (e, end, from) => { asked.push({ from: r3(from), end: r3(end) }); return audioPlan0(e, end, from); };
  const card = () => document.querySelector('dialog.lx-panel[open]');
  const pf = () => document.querySelector('dialog.pf-card[open]');
  const chipText = () => [...(card()?.querySelectorAll('.sq-chip') || [])].map((b) => b.textContent).find((t) => /^♪ Sound/.test(t)) || null;
  const rendered = async (l0) => until(() => { const l = LabExport.status().last; return l !== l0 && l?.path ? l : null; }, 600000);
  const N = Math.round((LOOP.b - LOOP.a) * F);

  // ---------- 1. the Render card: MP4 · perfect loop, ⟲ Loop ----------
  LabExport.panel({ format: 'mp4' });
  await until(() => card()?.querySelector('.rr-row') && card().querySelector('.lx-est'), 20000);
  const onMp4 = chipText();
  card().close(); await wait(100);
  LabExport.panel({ format: 'loop' });
  await until(() => card()?.querySelector('.rr-row') && card().querySelector('.lx-est'), 20000);
  const range1 = card()?.querySelector('.rr-chip.on')?.dataset.range || null;
  const onLoop = chipText();
  await smoke({ shot: '/tmp/loopsound145-card.png' }).catch(() => {});
  const l1 = LabExport.status().last; asked.length = 0;
  card().querySelector('.modal-actions .primary').click();
  await wait(400);
  if (pf()) pf().querySelector('.pf-go')?.click();
  const r1 = await rendered(l1);
  const p1 = r1 && await window.hub.video.probe(r1.path);
  const ad1 = p1?.audio?.duration || 0;
  step('Render card, MP4 · perfect loop on ⟲ Loop: "♪ Sound on" shows (that format only); the MP4 has a sound exactly its length, from the loop\'s start',
    onMp4 === null && onLoop === '♪ Sound on' && range1 === 'loop' && r1?.frames === N && p1?.frames === N && p1?.audio?.codec === 'aac' && Math.abs(ad1 - N / F) <= 1 / F && asked[0]?.from === LOOP.a,
    { onMp4, onLoop, range: range1, file: base(r1?.path), frames: r1?.frames, want: N, probed: p1 && { frames: p1.frames, dur: p1.duration, audio: p1.audio }, video: r5(N / F), asked: asked[0] });

  // ---------- 2. the seam ----------
  let m1 = null;
  try { m1 = seamOf(await samplesOf(r1.path), ad1); } catch (e) { m1 = { error: String(e.message || e) }; }
  step('the seam: the last sample runs into the first like any two in a row (it repeats without a click)', Boolean(m1 && !m1.error && seamless(m1) && Math.abs(m1.N - Math.round((N / F) * 48000)) <= 48000 / F), m1);

  // ---------- 3. right-click › ∞ Make it loop › ⇪ Render the loop ----------
  await PerfectLoop.make({ bars: 2, check: false, quiet: true, show: false });
  const st = PerfectLoop.state();
  const l3 = LabExport.status().last; asked.length = 0;
  const r3r = await PerfectLoop.render({ size: { w: 96, h: 54 }, fps: F, quiet: true });
  const p3 = r3r?.path && await window.hub.video.probe(r3r.path);
  const N3 = r3r?.frames || 0;
  let m3 = null;
  try { m3 = p3?.audio ? seamOf(await samplesOf(r3r.path), p3.audio.duration) : null; } catch (e) { m3 = { error: String(e.message || e) }; }
  step('∞ Make it loop › ⇪ Render the loop: one MP4 with the loop\'s sound (no second pass), its length, seamless',
    LabExport.status().last !== l3 && !/\+ sound/.test(base(r3r?.path)) && N3 === Math.round(st.len * F) && p3?.audio && Math.abs(p3.audio.duration - N3 / F) <= 1 / F && asked[0]?.from === r3(st.a) && Boolean(m3 && !m3.error && seamless(m3)),
    { file: base(r3r?.path), frames: N3, len: st.len, audio: p3?.audio, asked: asked[0], seam: m3 });

  // ---------- 4. ♪ Sound off; a GIF ----------
  LabExport.panel({ format: 'loop' });
  await until(() => chipText(), 20000);
  [...card().querySelectorAll('.sq-chip')].find((b) => /^♪ Sound/.test(b.textContent)).click();
  await wait(100);
  const offText = chipText(); const offStored = store.get('three.loop.sound');
  card().close(); await wait(100);
  const r4 = await PerfectLoop.render({ size: { w: 96, h: 54 }, fps: F, quiet: true });
  const p4 = r4?.path && await window.hub.video.probe(r4.path);
  store.set('three.loop.sound', true);
  const r5g = await PerfectLoop.render({ format: 'gif', size: { w: 96, h: 54 }, fps: 12, quiet: true });
  const p5 = r5g?.path && await window.hub.video.probe(r5g.path);
  step('♪ Sound off (remembered) makes a silent loop MP4; a GIF stays silent', offText === '♪ Sound off' && offStored === false && p4 && !p4.audio && p4.frames === r4.frames && p5 && !p5.audio && /\.gif$/i.test(r5g.path),
    { offText, offStored, mp4: p4 && { frames: p4.frames, audio: p4.audio }, gif: p5 && { codec: p5.codec, audio: p5.audio } });

  ThreeSeq.audioPlan = audioPlan0;
  await PerfectLoop.off({ quiet: true }).catch(() => {});
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
