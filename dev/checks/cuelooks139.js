// (round 139, cuelooks139) cue looks play in renders as in the preview (docs/upgrades/cuelooks139.md), in one check, on a
// one-layer scene it makes (Main: Glow, Tint, Blue; the background's color is the sliders: red = Glow × 0.45, green =
// Tint, blue = Blue) with two saved looks (Warm, Cold) and the fixture song. Two cues carry the looks ("One" → Warm,
// "Two" → Cold), and Blue has a keyframe of its own.
//   1. the preview, playing: before cue 1 the sliders are the scene's, in cue 1 Warm's, in cue 2 Cold's (Blue stays on
//      its keyframe: keys win over a cue's look)
//   2. export stills (LabExport.render still, the hidden export page) at the same three times: the same slider values
//      (from what the export page is sent) and the same pixels; the old code rendered the scene's own values at all three
//   3. mid-morph: a still 0.225 s after cue 2 is halfway, on playLook's smoothstep (the preview's 450 ms morph)
//   4. the keyframed slider wins in the stills too, and a second render is the same pixels (deterministic)
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/cuelooks139.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const r3 = (x) => Math.round(x * 1000) / 1000;

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks; const D = ThreeLab.director;
  const CODE = `import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
const P = tweak({ glow: { value: 0.4, min: 0, max: 2, label: 'Glow' }, tint: { value: 0.2, min: 0, max: 1, label: 'Tint' }, blue: { value: 0.3, min: 0, max: 1, label: 'Blue' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => { scene.background.setRGB(Math.min(1, P.glow * 0.45), P.tint, P.blue); renderer.render(scene, camera); });`;
  const ID = 'cuMain';
  const sk = SC.create({ name: 'Cue looks check', code: CODE, layers: [ThreeLayers.defaults({ id: ID, name: 'Main', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  const ctl = () => hk.ctlOf(ID);
  await until(() => SC.currentId() === sk.id && ctl()?.controls().some((c) => c.key === 'blue' && c.live === true), 30000);
  ctl().setMany({ glow: 1.8, tint: 0.9, blue: 0.1 }); ctl().looksApi.save('Warm');
  ctl().setMany({ glow: 0.6, tint: 0.05, blue: 0.7 }); ctl().looksApi.save('Cold');
  ctl().setMany({ glow: 0.4, tint: 0.2, blue: 0.3 });
  await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.duration > 8, 60000);
  P.editCues({ add: [{ time: 3, name: 'One', looks: [{ layer: ID, name: 'Warm' }] }, { time: 5, name: 'Two', looks: [{ layer: ID, name: 'Cold' }] }] });
  hk.setKeys(ID, 's:blue', [{ t: 0, v: 0.85, ease: 'hold' }]); // a keyframe of its own: it wins over both looks
  await wait(300);
  const cues = P.timeline().cues; const c1 = cues.find((c) => c.name === 'One')?.time; const c2 = cues.find((c) => c.name === 'Two')?.time;
  const T = [r3(c1 - 1.6), r3(c1 + 0.9), r3(c2 + 0.9)]; // before cue 1, in cue 1, in cue 2 (each morph long done)
  const base = { glow: 0.4, tint: 0.2, blue: 0.85 }; const warm = { glow: 1.8, tint: 0.9, blue: 0.85 }; const cold = { glow: 0.6, tint: 0.05, blue: 0.85 };
  const wantV = [base, warm, cold];
  const pxOf = (v) => [Math.min(1, v.glow * 0.45) * 255, v.tint * 255, v.blue * 255];

  // ---------- 1. the preview, playing through both cues ----------
  const ev = async (code) => { for (let i = 0; i < 5; i += 1) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(80); } return null; };
  const prev = [];
  cmd.seek(Math.max(0, T[0] - 0.5)); await wait(300); cmd.play(true);
  for (const t of T) {
    await until(() => P.time >= t, 15000);
    const v = await ev('JSON.stringify([audio.time, __slider("glow"), __slider("tint"), __slider("blue")])');
    prev.push(v ? (([at, glow, tint, blue]) => ({ at, glow, tint, blue }))(JSON.parse(v)) : null);
  }
  cmd.play(false); await wait(200);
  const near = (a, b, e = 0.02) => a && b && ['glow', 'tint', 'blue'].every((k) => Math.abs(a[k] - b[k]) < e);
  step('the preview, playing: the scene\'s sliders before cue 1, Warm in cue 1, Cold in cue 2 (Blue on its own keyframe)', prev.every((p, j) => near(p, wantV[j])), prev.map((p) => p && { at: r3(p.at), glow: r3(p.glow), tint: r3(p.tint), blue: r3(p.blue) }));

  // ---------- 2. export stills at the same times: slider values and pixels ----------
  // what the export page is sent: the layer's slider keys, evaluated at each time (the page's own evalKeys rules)
  const sentAt = async (t) => {
    const { e, sk: s } = await LabExport.sceneEdit({ w: 64, h: 36, F: 30, end: t + 0.1 });
    const L = LabExport.compileLive(e, s).plan.groups.flatMap((g) => g.layers || []).find((x) => /Main/.test(x.props?.name || ''));
    const out1 = {};
    const sc = ThreeTweaks.scan(CODE);
    const b = Math.min(...Object.keys(L?.values || { 0: 0 }).map(Number)); // the layer's slot × 10000
    sc.items.forEach((it, i) => { if (it.key == null) return; const d = L?.props?.sliderKeys?.[b + i]; out1[it.key] = d ? ThreeLayers.evalKeys(d.keys, t, L.values?.[b + i]) : L?.values?.[b + i]; });
    return out1;
  };
  const pngPx = async (u8) => { const bm = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, 8, 8).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; } return s.map((x) => x / (d.length / 4)); };
  const still = async (t) => { const r = await LabExport.render({ format: 'still', size: { w: 64, h: 36 }, at: t, source: 'scene', quiet: true, track: false }); return pngPx(await window.hub.fs.read(r.path, { encoding: 'buffer' })); };
  try {
    const sent = []; for (const t of T) sent.push(await sentAt(t));
    step('each still is sent the preview\'s slider values at its time (before cue 1 / in cue 1 / in cue 2)', sent.every((v, j) => near(v, prev[j] || wantV[j])), sent.map((v) => ({ glow: r3(v.glow), tint: r3(v.tint), blue: r3(v.blue) })));
    const got = []; for (const t of T) got.push(await still(t));
    const wantPx = prev.map((p, j) => pxOf(p || wantV[j]));
    const diff = got.map((g, j) => Math.max(...g.map((x, k) => Math.abs(x - wantPx[j][k]))));
    step('…and its pixels are the preview\'s (the old code drew the scene\'s own sliders in both cues)', diff.every((x) => x < 6) && Math.abs(got[1][0] - got[0][0]) > 60 && Math.abs(got[2][1] - got[1][1]) > 100, { t: T, still: got.map((g) => g.map(Math.round)), preview: wantPx.map((w) => w.map(Math.round)) });

    // ---------- 3. mid-morph: halfway on the smoothstep, 0.225 s into cue 2 ----------
    const tm = r3(c2 + 0.225);
    const mid = await sentAt(tm);
    const half = { glow: (warm.glow + cold.glow) / 2, tint: (warm.tint + cold.tint) / 2, blue: 0.85 };
    const pm = await still(tm);
    step('mid-morph (0.225 s into cue 2): halfway from Warm to Cold, the preview\'s 450 ms smoothstep, in values and pixels', near(mid, half, 0.01) && Math.max(...pm.map((x, k) => Math.abs(x - pxOf(half)[k]))) < 6, { values: { glow: r3(mid.glow), tint: r3(mid.tint) }, still: pm.map(Math.round), want: pxOf(half).map(Math.round) });

    // ---------- 4. the keyframe wins; a second render is the same ----------
    step('the keyframed slider (Blue) keeps its key in every still, as in the preview', sent.every((v) => Math.abs(v.blue - 0.85) < 1e-6) && got.every((g) => Math.abs(g[2] - 0.85 * 255) < 6), got.map((g) => Math.round(g[2])));
    const again = await still(T[2]);
    step('…and the same pixels the second time (deterministic)', again.every((x, k) => Math.abs(x - got[2][k]) < 0.5), { first: got[2].map(Math.round), again: again.map(Math.round) });
  } catch (err) { step('renders from the export page', false, String(err?.stack || err).slice(0, 400)); }
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
