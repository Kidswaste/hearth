// opt-in: LABAUDIO77_LONG
// (round 77, labaudio77) A whole 5-minute song played in the Lab, the pictures against the audio clock the whole way:
// every 30 s the preview logs 4 s of frames (window.__labAV.watch / frames: each frame's song time next to the audio
// clock's newest output timestamp carried to the moment the frame is shown; judged against a line fitted offline through
// those references within ±0.5 s, as they jitter by the audio callbacks). Fails when a window's p95 is over one
// frame at 240 Hz (4.17 ms) in more than one window (one may hold an audio hiccup of a busy machine), when the mean
// offset of the last three windows differs from the first three's by 1 ms or more (drift), or when the time ever goes
// backwards. Reports what a clock on the frame time alone would have drifted with this sound card.
// Opt-in (≈ 6 min): LABAUDIO77_LONG=1 node dev/run-checks.js --exact labaudio77-long
//   by hand: node dev/smoke.js --check-timeout 900000 --script dev/checks/labaudio77-long.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { windows: [] }; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const FRAME = 1000 / 240;
const r2 = (x) => Math.round(x * 100) / 100;
const SONG = `${window.SMOKE_TMP || '/tmp'}/labaudio77-long.wav`;
const SECS = Number(window.LA77_SECS) || 300;
try {
  // a 5-minute song, 22.05 kHz mono (13 MB): kicks at 124 BPM, a bass note each bar
  {
    const sr = 22050; const n = Math.round(SECS * sr); const x = new Int16Array(n); const beat = 60 / 124;
    for (let k = 0; 0.2 + k * beat < SECS - 0.5; k += 1) {
      const a = Math.round((0.2 + k * beat) * sr);
      for (let i = 0; i < 0.25 * sr && a + i < n; i += 1) { const u = i / sr; x[a + i] += Math.round(26000 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-u * 30)) * u) * Math.exp(-u * 9)); }
    }
    const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
    new Int16Array(data.buffer, 44).set(x);
    await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
  }
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(1500);
  const CODE = "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer(); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);\nconst sc = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.z = 4;\nconst m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); sc.add(m);\nr.setAnimationLoop(() => { m.rotation.y = audio.time; m.scale.setScalar(1 + 0.3 * audio.beat); r.render(sc, cam); });";
  const A = ThreeLab.scenes.create({ name: 'Sync long', code: CODE, open: true });
  await until(() => ThreeLab.scenes.currentId() === A.id && ThreeLab.director, 15000);
  await wait(2000);
  const D = () => ThreeLab.director;
  const pj = async (code) => { for (let i = 0; i < 5; i += 1) { const r = await D().evalInSketch(`return JSON.stringify(${code})`); if (r?.ok && typeof r.value === 'string') return JSON.parse(r.value); await wait(300); } return null; };
  const r = await c.loadSong(SONG);
  ok(r?.ok, 'the 5-minute song loads');
  await until(() => c.state.bpm > 0, 60000);
  c.seek(0); await wait(300); c.play(true);
  const t0 = Date.now();
  for (let at = 10; at < SECS - 6; at += 30) {
    while ((Date.now() - t0) / 1000 < at) await wait(200);
    await pj('window.__labAV.watch(2000)'); await wait(4000);
    const fr = await pj('window.__labAV.frames()') || [];
    const use = fr.filter((f) => f[4] === 1);
    // the reference: each frame's raw audio-clock sample carries the jitter of the audio callbacks (with a 22.05 kHz
    // file the element's steps don't line up with the context's: ± a few ms), so the truth here is a line fitted
    // offline through the raw references within ±0.5 s of the frame (both sides: what a causal clock can't do)
    const smooth = use.map((f) => { const near = use.filter((g) => Math.abs(g[0] - f[0]) <= 500); const n = near.length; const mx = near.reduce((s, g) => s + g[0], 0) / n; const my = near.reduce((s, g) => s + g[2], 0) / n; let sxy = 0; let sxx = 0; for (const g of near) { sxy += (g[0] - mx) * (g[2] - my); sxx += (g[0] - mx) ** 2; } return my + (sxx ? sxy / sxx : 0) * (f[0] - mx); });
    const rawAbs = use.map((f) => Math.abs((f[1] - f[2]) * 1000)).sort((a, b) => a - b);
    const err = use.map((f, i) => (f[1] - smooth[i]) * 1000); const abs = err.map(Math.abs).sort((a, b) => a - b);
    let back = 0; for (let i = 1; i < fr.length; i += 1) if (fr[i][1] < fr[i - 1][1] - 1e-9) back += 1;
    const st = await pj('window.__labAV.state()');
    out.windows.push({ at, songAt: r2(st?.time ?? 0), frames: use.length, rawRefP95: r2(rawAbs[Math.floor(0.95 * rawAbs.length)] ?? NaN), stepMs: st?.stepMs, p95: r2(abs[Math.floor(0.95 * abs.length)] ?? NaN), max: r2(abs.at(-1) ?? NaN), mean: r2(err.reduce((a, b) => a + b, 0) / (err.length || 1)), backwards: back, ppm: st?.slopePpm, starts: st?.starts });
  }
  c.play(false);
  const W = out.windows;
  // (one window may hold an audio hiccup of this busy machine: the reference itself jumps there and the offline line
  // straddles it; it's reported, and a second one fails)
  const over = W.filter((w) => !(w.frames >= 20 && w.p95 <= FRAME));
  out.windowsOver = over.map((w) => w.at);
  ok(over.length <= 1, `windows off the audio clock: ${JSON.stringify(over)}`);
  ok(W.every((w) => w.backwards === 0), 'the time never went backwards');
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  out.driftMs = W.length >= 6 ? r2(med(W.slice(-3).map((w) => w.mean)) - med(W.slice(0, 3).map((w) => w.mean))) : null;
  ok(W.length > 1 && Math.abs(out.driftMs) < 1, `no drift over the song: the mean offset at the end vs the start (${out.driftMs} ms)`);
  out.frameClockDrift5minMs = r2(Math.abs(W.at(-1)?.ppm || 0) * SECS / 1000);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
