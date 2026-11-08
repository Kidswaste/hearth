// (round 148, motionrender148) Sliders set to "∿ Move by itself" move in renders too (they used to hold still there).
// A fixture scene whose background colour IS three sliders (red = Wave, green = Pulse, blue = Walk; colour management off,
// so a channel reads the slider's value), the fixture song (128 BPM, with loud / quiet parts), and:
//   1. Wave on an LFO (1 bar), Pulse on the beat, Walk on a random walk, set the Lab's way (cmd.motion)
//   2. frames from the hidden export page (the renders' own frame path) at times across several beats: red and green
//      are the preview's own math at that song time (BeatLinkCore.motionValue on the song's BPM), blue is the seeded
//      walk, and all three change across the frames
//   3. the same frames twice: the same pixels (deterministic, the walk too)
//   4. a real ⇪ MP4 of the 2-bar Loop range, twice: its frames follow the LFO (decoded with ffmpeg) and the two files'
//      frames are the same; the LFO's period (1 bar) fits the loop, so its first frame continues its last
//   5. the scene in a Lab sequence: the sequence's plan carries the motions (Sequence renders compile the same way)
// Renders are tiny (64×36, 24 fps). Only the check's own temp data (smoke.js) and the fixture song; never an owner's file.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/motionrender148.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const r3 = (x) => Math.round(x * 1000) / 1000;
const B = BeatLinkCore;

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.player, 60000);
  const SC = ThreeLab.scenes; const P = ThreeLab.stageHooks.player; const D = ThreeLab.director;
  const code = `import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
const P = tweak({ a: { value: 0.5, min: 0, max: 1, label: 'Wave' }, p: { value: 0.2, min: 0, max: 1, label: 'Pulse' }, w: { value: 0.5, min: 0, max: 1, label: 'Walk' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0, 0, 0);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50);
renderer.setAnimationLoop(() => { scene.background.setRGB(P.a, P.p, P.w); renderer.render(scene, cam); });`;
  const sk = SC.create({ name: 'Motion render check', code, frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  await until(() => P.loaded && P.analysis?.sections?.length && P.timeline()?.grid?.bpm, 60000);
  await until(() => cmd.sliders().length === 3, 20000);
  const LFO = { kind: 'lfo', shape: 'sine', rate: 4, depth: 0.4 };
  const PULSE = { kind: 'pulse', rate: 1, depth: 0.6 };
  const WALK = { kind: 'walk', rate: 2, depth: 0.45 };
  cmd.motion('Wave', LFO); cmd.motion('Pulse', PULSE); cmd.motion('Walk', WALK);
  await wait(400);
  const ex = SC.extrasOf?.(sk.id) || {};
  const bpm = P.bpm;
  step('setup: a scene whose colour is three sliders, the fixture song, Wave on an LFO, Pulse on the beat, Walk on a random walk',
    P.loaded && ex.motions?.['k:a']?.kind === 'lfo' && ex.motions?.['k:p']?.kind === 'pulse' && ex.motions?.['k:w']?.kind === 'walk', { bpm: r3(bpm), motions: ex.motions });

  // what the preview's own math says each slider is at song time t
  const range = { min: 0, max: 1, int: false };
  const want = (t) => ({
    a: B.motionValue({ ...LFO, ...range }, 0.5, { t, bpm, n: 0 }),
    p: B.motionValue({ ...PULSE, ...range }, 0.2, { t, bpm, n: 1 }),
    w: B.motionValue({ ...WALK, ...range }, 0.5, { t, bpm, n: 2, seed: B.motionSeed('main|k:w') }),
  });
  const rgbOf = async (buf, type = 'image/jpeg') => {
    const bm = await createImageBitmap(new Blob([buf], { type }));
    const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
    const d = g.getImageData(Math.floor(bm.width / 2) - 4, Math.floor(bm.height / 2) - 4, 8, 8).data;
    const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
    return s.map((x) => x / (d.length / 4) / 255);
  };

  // ---------- 2–3. frames from the export page, twice ----------
  const beat = 60 / bpm;
  const times = (k) => r3(10 + k * beat * 0.37);
  const N = 14;
  const shoot = async () => (await LabExport.probe({ w: 64, h: 36, F: 24, n: N, times })).frames;
  const f1 = await shoot();
  const f2 = await shoot();
  const got = await Promise.all(f1.map((b) => rgbOf(b)));
  const exp = Array.from({ length: N }, (_, k) => want(times(k)));
  const err = (ch, key) => Math.max(...got.map((c, k) => Math.abs(c[ch] - exp[k][key])));
  const spread = (ch) => Math.max(...got.map((c) => c[ch])) - Math.min(...got.map((c) => c[ch]));
  const eA = err(0, 'a'); const eP = err(1, 'p'); const eW = err(2, 'w');
  step('rendered frames: Wave (LFO) and Pulse (beat) are the preview\'s value at that song time, and they move',
    f1.length === N && eA < 0.035 && eP < 0.035 && spread(0) > 0.3 && spread(1) > 0.25, { errLfo: r3(eA), errPulse: r3(eP), spreadLfo: r3(spread(0)), spreadPulse: r3(spread(1)), red: got.map((c) => r3(c[0])), wantRed: exp.map((x) => r3(x.a)), green: got.map((c) => r3(c[1])), wantGreen: exp.map((x) => r3(x.p)) });
  step('…Walk (random walk) moves too, on its seeded path', eW < 0.035 && spread(2) > 0.05, { errWalk: r3(eW), spreadWalk: r3(spread(2)), blue: got.map((c) => r3(c[2])) });
  const same = f1.length === f2.length && f1.every((f, i) => { const x1 = new Uint8Array(f); const x2 = new Uint8Array(f2[i]); return x1.length === x2.length && x1.every((v, j) => v === x2[j]); });
  step('the same frames rendered twice: the same pixels (deterministic, the walk too)', same, { frames: f1.length });

  // ---------- 4. a real MP4 of the Loop range, twice ----------
  const g = P.timeline().grid;
  const bar = ((g.beatsPerBar || 4) * 60) / g.bpm;
  const LOOP = { a: r3((g.downbeat || 0) + 4 * bar), b: r3((g.downbeat || 0) + 6 * bar) };
  const job = (args, input, output) => new Promise((resolve, reject) => {
    const id = `mr148${Math.random().toString(36).slice(2)}`; let done = false;
    window.hub.video.onJob((ev) => { if (ev.id !== id || ev.type !== 'done' || done) return; done = true; if (ev.code === 0) resolve(ev); else reject(new Error(ev.error || 'ffmpeg failed')); });
    window.hub.video.transcode({ id, input, output, args, duration: 5 }).catch(reject);
  });
  const framesOf = async (mp4) => {
    const raw = `${mp4}.mr148.rgb`;
    await job(['-y', '-i', 'INPUT', '-vf', 'scale=4:4:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'OUTPUT'], mp4, raw);
    const b64 = await window.hub.fs.read(raw, { encoding: 'base64' });
    window.hub.fs.trash?.([raw]).catch(() => {});
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
    const per = 4 * 4 * 3; const fr = [];
    for (let o = 0; o + per <= u8.length; o += per) { const s = [0, 0, 0]; for (let i = 0; i < per; i += 3) { s[0] += u8[o + i]; s[1] += u8[o + i + 1]; s[2] += u8[o + i + 2]; } fr.push(s.map((x) => x / 16 / 255)); }
    return fr;
  };
  const renderLoop = () => LabExport.render({ format: 'mp4', source: 'scene', range: LOOP, size: { w: 64, h: 36 }, fps: 24, quality: 'draft', ss: 1, blur: 1, sound: false, quiet: true });
  const m1 = await renderLoop();
  const m2 = await renderLoop();
  const v1 = await framesOf(m1.path); const v2 = await framesOf(m2.path);
  const NL = Math.round((LOOP.b - LOOP.a) * 24);
  const wantA = Array.from({ length: v1.length }, (_, n) => want(LOOP.a + n / 24).a);
  // the decoded colour has the encoder's YUV round trip in it: judged by how closely red follows the LFO
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const red = v1.map((c) => c[0]);
  const mr = mean(red); const mw = mean(wantA);
  const corr = red.reduce((s, x, i) => s + (x - mr) * (wantA[i] - mw), 0) / Math.sqrt(red.reduce((s, x) => s + (x - mr) ** 2, 0) * wantA.reduce((s, x) => s + (x - mw) ** 2, 0) || 1);
  const maxDiff = Math.max(0, ...v1.map((c, i) => Math.max(...c.map((x, j) => Math.abs(x - (v2[i]?.[j] ?? -1))))));
  const seam = Math.abs(want(LOOP.a).a - want(LOOP.b).a);
  step('⇪ MP4 of the 2-bar Loop: every frame follows the LFO (decoded), and the motion\'s period fits the loop (seamless)',
    m1?.frames === NL && v1.length === NL && corr > 0.98 && Math.max(...red) - Math.min(...red) > 0.4 && seam < 1e-6, { frames: m1?.frames, decoded: v1.length, want: NL, corr: r3(corr), redSpan: r3(Math.max(...red) - Math.min(...red)), seam });
  step('…the same Loop rendered twice: the same frames', v2.length === v1.length && maxDiff <= 1 / 255 + 1e-9, { maxDiff: r3(maxDiff * 255) });
  window.hub.fs.trash?.([m1.path, m2.path].filter(Boolean)).catch(() => {});

  // ---------- 5. in a Lab sequence ----------
  await ThreeSeq.create('Motion seq', { empty: true, format: '16:9', show: false });
  await ThreeSeq.add({ sketch: sk.id }, { dur: 1.5 });
  const plan = ThreeSeq.compile(ThreeSeq.edit).plan;
  const mos = [];
  JSON.stringify(plan, (k, v) => { if (k === 'motions' && v && typeof v === 'object') mos.push(...Object.values(v).map((m) => m.kind)); return v; });
  step('the scene in a Lab sequence: its plan carries the three motions (Sequence renders move too)', ['lfo', 'pulse', 'walk'].every((k) => mos.includes(k)), { kinds: mos });
  void D;
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
