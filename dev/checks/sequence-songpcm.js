// The song's samples on an export page (bug fix after round 50): the hidden export page gets the song as a byte view
// (hub.fs.read's Uint8Array / Buffer), not an ArrayBuffer. sqOffline copied it with .slice(0), which is still a view,
// decodeAudioData rejected it, SQ.pcm stayed empty, and every exported frame "heard" a paused analyser: silence. What
// moves with audio.level / bass / spectrum / waveform stood still in renders while the preview moved with the song.
// A fixture song (silence, a loud 110 Hz tone from 2 s to 5 s, silence), a scene whose background is audio.level.
// Checks: the preview's exact frames (the scene's own ▤ Sequence) are bright in the tone, dark in the silence; the
// export page decodes the song (seq-offline answers pcm: true); its frames match the preview's at the same times.
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/sequence-songpcm.js
const { wait, until, step } = J;
const SONG = '/tmp/hearth-songpcm-check.wav';

// ---------- the song: 8 s, a 0.8 sine at 110 Hz from 2 s to 5 s (soft edges), silence around it ----------
{
  const sr = 44100; const n = 8 * sr;
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const t = i / sr; const env = Math.max(0, Math.min(1, (t - 2) / 0.01, (5 - t) / 0.01)); data.setInt16(44 + i * 2, Math.round(0.8 * env * Math.sin(2 * Math.PI * 110 * t) * 32767), true); }
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}
const SKETCH = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => { scene.background.setScalar(Math.min(1, audio.level)); renderer.render(scene, camera); });`;

activate('tool:three');
const c = await ThreeLab.cmd();
await wait(1000);
ThreeLab.openCode(SKETCH);
await wait(2500);
const r = await c.loadSong(SONG);
step('the fixture song loads in the preview', r.ok, r);
await until(() => c.player.loaded && c.player.duration > 7, 20000);

// ---------- the preview: the scene's own sequence (▤ Sequence), its exact frames drawn in the preview page ----------
// (the preview's song came from the player as an ArrayBuffer: its samples were always there; a headless run has no
// sound device, so a playing analyser hears nothing: the exact frames are the preview to compare with)
const lum = async (buf) => { const bm = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, bm.width, bm.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
const T = [3.5, 1.0, 5.8];
const preview = [];
{
  await ThreeSeq.enter();
  await until(() => ThreeSeq.active && ThreeSeq.edit?.clips?.length >= 1, 10000); await wait(1500);
  const S = ThreeSeq._S;
  for (let k = 0; k < T.length; k++) {
    const n = 9000 + k;
    const m = await new Promise((res) => { const t = setTimeout(() => { S.frames.delete(n); res({ error: 'the preview stopped answering' }); }, 30000); S.frames.set(n, (x) => { clearTimeout(t); res(x); }); S.L.send({ type: 'seq-frame', n, T: T[k], w: 64, h: 36 }); });
    preview.push(m.error ? null : await lum(m.buffer));
  }
  S.L.send({ type: 'seq-offline', on: false });
  await ThreeSeq.leave(); await wait(800);
}
step('preview (exact frames): the tone lights the picture at 3.5 s, the silence leaves it dark (1.0 s, 5.8 s)', preview[0] > 200 && preview[1] < 30 && preview[2] < 30, { preview: preview.map((x) => x == null ? x : Math.round(x)), clips: ThreeSeq.edit?.clips?.length });

// ---------- the export page: the song arrives as bytes from the disk (a view), and decodes ----------
{
  const X = LabExport;
  const { e, sk } = await X.sceneEdit({ w: 64, h: 36, F: 30, end: 6 });
  const { plan, assets } = X.compileLive(e, sk);
  plan.w = 64; plan.h = 36; plan.fps = 30;
  const page = await X.openPage({ w: 64, h: 36, ss: 1, alpha: false, seed: 1 });
  try {
    await X.loadPlan(page, plan, assets, plan.song);
    const again = page.wait((m) => m.type === 'seq-offline' && m.on, 30000, 'going offline');
    page.send({ type: 'seq-offline', on: true });
    const m = await again;
    step('the export page decodes the song it was sent (its samples are there: pcm)', Boolean(plan.song?.src) && m.pcm === true, { song: plan.song?.src || null, pcm: m.pcm });
  } finally { page.close(); }
}

// ---------- exported frames vs the preview ----------
try {
  const { frames } = await LabExport.probe({ w: 64, h: 36, F: 30, n: T.length, times: (k) => T[k] });
  const L = await Promise.all(frames.map(lum));
  step('export at 3.5 s (in the tone): as bright as the preview there (the song drives the render too)', preview[0] != null && Math.abs(L[0] - preview[0]) < 30, { export: Math.round(L[0]), preview: preview[0] == null ? null : Math.round(preview[0]) });
  step('export in the silence (1.0 s, 5.8 s): dark, like the preview', L[1] < 30 && L[2] < 30, { export: [L[1], L[2]].map(Math.round) });
} catch (err) { step('frames from the export page', false, String(err?.message || err)); }

try { await window.hub.fs.trash?.(SONG); } catch { /* gone */ }
return J.done();
