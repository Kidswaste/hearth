// (round 77, labaudio77) Sound in the Lab, solid and in sync. Two generated songs (A: 128 BPM, B: 100 BPM, kicks on
// every beat) on two scenes whose layer reads audio.time / audio.beat / audio.feat.kickOn every frame. The preview logs
// each frame's song time next to the audio clock's own newest timestamp carried to the moment the frame is shown
// (window.__labAV.watch / frames: the AudioContext's output timestamp says which context time reaches the speakers
// when) and the raw element time the page used before this round. Checks:
//   · sync offset budget: |the frame's time − the audio clock| p95 ≤ 4.17 ms (±1 frame at 240 Hz), median ≤ 2 ms,
//     over ~12 s of play; never backwards; the old raw time's offset reported (≈ the output path, 40 ms here)
//   · drift: the mean offset of the first and the last third of the run within 1 ms (the real 5-minute play is the
//     opt-in labaudio77-long); what a frame-time clock would drift with this sound card over 5 minutes, reported
//   · seek while playing: the picture jumps with the sound, then on the audio clock; pause: the frames hold the exact
//     spot; a scrub while paused shows the exact time; resume: never before the spot, on the clock after
//   · the Lab hidden (another tool) for 3 s while the song plays: back on the clock at once
//   · scene switch A → B → A: B's song (its tempo), one song element playing, A's again after
//   · device changes (simulated): a devicechange heard by the Lab window (same rate: nothing remade); the output's
//     rate changing (the page's probe answers the other rate): the song made again at that rate with no moment where
//     two play and no gap in the song's time, the analyser still hearing it, on the clock after; the system suspending
//     the output (resumed); the output closed (made again)
//   · backstage parity: a copy of scene A running backstage (the Lab shows A) gets the song silently (volume 0, every
//     AudioContext's destination muted), the same bpm / beat / bar / beat phase / kick / drop at the same seconds as on
//     screen, the same "Pulse on beats" keyframes, the timeline's detected grid, three_media_info; the song analysed
//     once (the Lab's analysis handed over, SongPrep made none)
//   · /hear sync in plain words; no duplicate commands
// (round 80, checkfix80) load-tolerant, drift still caught: on a busy machine (other checks side by side) the preview
// drew 5–10 frames a second here and some frames' callbacks ran 50–300 ms after their frame's time (the page held up;
// the long-task observer saw no task there: the process wasn't running). Such a frame's moment on screen isn't known,
// so the offsets leave out a frame whose callback ran more than BLOCKED ms after its time (the page logs how late each
// ran) and the 0.5 s after it (the clock may start over then and fits its speed again), and frames where the audio
// clock itself didn't behave like a sound card around them (its samples within ±0.5 s off their own line by > 2 ms, or
// its speed > 0.2 % off: a starved audio thread wobbled ±3–8 ms, stepped, or ran 0.4 % fast for a second). Elsewhere a
// frame is held against that local line. Those left out are counted (leftOut); each stretch watches until it has
// 20 judged frames (longer when the preview is slow, ≤ 14 s; song A is 48 s for that), never fewer. A real drift is
// on every frame: it still fails.
// The seek's sound reaches the speakers no earlier than the seek + the output path, and no earlier than the element
// started playing the new spot (a busy machine takes a while to seek): the later of the two
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/labaudio77.js --shot /tmp/labaudio77.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const FRAME = 1000 / 240;
const r2 = (x) => Math.round(x * 100) / 100;
const T = window.SMOKE_TMP || '/tmp';
const SONG_A = `${T}/labaudio77-a.wav`; const SONG_B = `${T}/labaudio77-b.wav`;
const LEAD = 0.25;
const BLOCKED = 50; // ms: a frame whose callback ran later than this after its frame's time (the page was held up)
// ---------- the test songs (kicks on every beat, hats between, a drop half way) ----------
async function song(file, bpm, secs, seed) {
  const sr = 44100; const n = Math.round(secs * sr); const x = new Float32Array(n); const beat = 60 / bpm;
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 1073741823.5 - 1; };
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i += 1) x[a + i] += f(i / sr); };
  const kicks = [];
  for (let k = 0; LEAD + k * beat < secs - 0.5; k += 1) {
    const t = LEAD + k * beat; const g = t > secs / 2 ? 1.2 : 0.6;
    add(t, 0.3, (u) => g * 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-u * 30)) * u) * Math.exp(-u * 9)); kicks.push(t);
    add(t + beat / 2, 0.04, (u) => 0.15 * rnd() * Math.exp(-u * 90));
    if (k % 4 === 0) add(t, beat * 3.5, (u) => g * 0.25 * Math.sin(2 * Math.PI * 55 * u) * Math.min(1, u * 40) * Math.exp(-u * 0.8));
  }
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, str) => [...str].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(file, new Uint8Array(data.buffer));
  return kicks;
}
const CODE = `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
scene.add(mesh);
renderer.setAnimationLoop(() => { mesh.rotation.y = audio.time; mesh.scale.setScalar(P.size * (1 + 0.3 * audio.beat + 0.2 * audio.feat.kickOn)); renderer.render(scene, camera); });`;
const PROBE = 'return { t: audio.time, bpm: audio.bpm, beat: audio.beat, inBar: audio.feat.beatInBar, bar: audio.feat.bar, beatPhase: audio.feat.beatPhase, barPhase: audio.feat.barPhase, kick: audio.feat.kickOn, drop: audio.feat.drop, intensity: audio.feat.intensity }';
const D = () => ThreeLab.director;
const pv = async (code) => { for (let i = 0; i < 5; i += 1) { const r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return null; };
// (JSON text: the eval's own answer keeps 60 items of an array and 3 decimals)
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : null; };
const AVS = () => pj('window.__labAV.state()');
// (round 80) the audio clock around one frame: a line through its samples [x s, y s, …] within ±0.5 s of the frame's
// show time; steady when those samples sit on it within 2 ms and its speed is within 0.2 % of the song's (what a real
// sound card does: they differ by < 0.03 %); null with fewer than 4 samples there
let lastSamples = [];
function clockAt(sm, t) {
  const pts = sm.filter((a) => Math.abs(a[0] - t) <= 0.5);
  if (pts.length < 4) return null;
  const mx = pts.reduce((s, a) => s + a[0], 0) / pts.length; const my = pts.reduce((s, a) => s + a[1], 0) / pts.length;
  let sxy = 0; let sxx = 0; for (const a of pts) { sxy += (a[0] - mx) * (a[1] - my); sxx += (a[0] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 1; const A = my - b * mx;
  const worst = Math.max(...pts.map((a) => Math.abs(a[1] - (A + b * a[0]))));
  return { y: A + b * t, steady: worst <= 0.002 && Math.abs(b - 1) <= 0.002 };
}
// the frame log → numbers: |frame time − the audio clock| over frames from the output clock (src 1), after `skip` s
function judge(frames, { skip = 0.5, from = -Infinity, samples = lastSamples } = {}) {
  const fr = frames.filter((f) => f[0] >= from);
  const t0 = fr[0]?.[0] || 0;
  const after = fr.filter((f) => f[4] === 1 && f[0] - t0 >= skip * 1000);
  // (round 80) a frame whose callback ran more than BLOCKED ms late: its moment on screen isn't known; after one the
  // clock may have started over (samples > 0.3 s apart: GAP) and fits its speed again over 0.4 s (MIN), so the frames in
  // the 0.5 s after it are left out too. All counted
  let heldTill = -Infinity; const skipF = new Set();
  for (const f of after) { if (f[5] > BLOCKED) heldTill = f[0] + 500; if (f[0] <= heldTill) skipF.add(f); }
  let use = after.filter((f) => !skipF.has(f));
  const held = after.filter((f) => f[5] > BLOCKED).map((f) => Math.round(f[5]));
  // (round 80) judged only where the audio clock itself behaved like a sound card around the frame (clockAt): when the
  // audio thread was starved its samples wobbled ±3–8 ms a few in a row, stepped (underruns: the clock starts over
  // within 3 samples by design) or ran 0.4 % fast for a second, and the newest sample read as the picture being off.
  // Those frames are left out and counted too; elsewhere the frame is held against that local line. A picture off a
  // steady clock, or drifting from it, still fails
  const unsteady = new Set(); const refY = new Map();
  for (const f of use) { const k = clockAt(samples || [], f[0] / 1000); if (!k) refY.set(f, f[2]); else if (k.steady) refY.set(f, k.y); else unsteady.add(f); }
  use = use.filter((f) => !unsteady.has(f));
  const refAt = (f) => refY.get(f) ?? f[2];
  const err = use.map((f) => (f[1] - refAt(f)) * 1000); const abs = err.map(Math.abs).sort((a, b) => a - b);
  const q = (p) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))] ?? null;
  let back = 0; for (let i = 1; i < fr.length; i += 1) if (fr[i][1] < fr[i - 1][1] - 1e-9) back += 1;
  const raw = use.map((f) => (f[3] - f[2]) * 1000);
  // drift: the offset's slope (ms per minute)
  let slope = 0;
  if (use.length > 20) { const xs = use.map((f) => (f[0] - use[0][0]) / 60000); const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = err.reduce((a, b) => a + b, 0) / err.length; let sxy = 0; let sxx = 0; for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (err[i] - my); sxx += (xs[i] - mx) ** 2; } slope = sxx ? sxy / sxx : 0; }
  const off = use.map((f, i) => [r2((f[0] - t0) / 1000), r2(err[i]), r2((f[3] - f[2]) * 1000)]).filter((x) => Math.abs(x[1]) > FRAME).slice(0, 12); // (where it was off: s, ms, the raw time's ms)
  // drift, plainly: the offset over the first and the last third of the frames
  const third = Math.floor(err.length / 3); const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  // (round 80) the middle value of each third, not the mean: one or two frames off by 15 ms on a starved machine moved
  // a third's mean by 2 ms; a drift moves every frame of the last third, so its middle value too
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const thirds = third ? [r2(med(err.slice(0, third))), r2(med(err.slice(-third)))] : null;
  return { off, thirds, frames: use.length, leftOut: after.length - use.length, blockedMs: held.slice(0, 8), settling: skipF.size - held.length, clockUnsteady: unsteady.size, fps: fr.length > 1 ? Math.round((fr.length - 1) / ((fr.at(-1)[0] - fr[0][0]) / 1000)) : 0, p50: r2(q(0.5)), p95: r2(q(0.95)), max: r2(abs.at(-1) ?? NaN), mean: r2(err.reduce((a, b) => a + b, 0) / (err.length || 1)), backwards: back, rawAheadMs: r2(raw.reduce((a, b) => a + b, 0) / (raw.length || 1)), slopeMsPerMin: r2(slope), sources: [...new Set(fr.map((f) => f[4]))] };
}
const inBudget = (j, what) => ok(j.frames >= 20 && j.p95 <= FRAME && j.p50 <= 2 && j.backwards === 0, `${what}: frames off the audio clock (${JSON.stringify(j)})`);
const frames = async () => { const f = await pj('window.__labAV.frames()'); lastSamples = (await pj('window.__labAV.samples()')) || []; return f; };
// the log after `ms`, then until `enough(frames)` (≥ 20 judged frames by default), at most `cap` ms in all
const more = async (ms, { cap = 14000, enough = (fr) => judge(fr).frames >= 22 } = {}) => { const t = Date.now(); await wait(ms); let fr = await frames(); while (!enough(fr || []) && Date.now() - t < cap) { await wait(400); fr = await frames(); } return fr || []; };
const watchFor = async (ms, o) => { await pv('return window.__labAV.watch(6000)'); return more(ms, o); };

try {
  const kicksA = await song(SONG_A, 128, 48, 7); // (round 80: 48 s, was 32: a slow preview is watched longer)
  await song(SONG_B, 100, 24, 11);
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(1500);
  for (const nm of ['hear', 'audio']) if (Commands.get(nm)?.area === 'Three.js Lab') out.hearName = nm;
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${JSON.stringify(Commands.duplicates?.())})`);
  const A = ThreeLab.scenes.create({ name: 'Sync A', code: CODE, open: true });
  await until(() => ThreeLab.scenes.currentId() === A.id && D(), 15000);
  await wait(2000);
  const ra = await c.loadSong(SONG_A);
  ok(ra?.ok, `song A loads (${JSON.stringify(ra)})`);
  ok(await until(() => c.state.bpm > 0, 30000), 'song A analysed');
  out.bpmA = c.state.bpm;
  ok(Math.abs(out.bpmA - 128) < 1, `song A's tempo 128 (${out.bpmA})`);
  // the whole-song features (the layer reads audio.feat.kickOn): computed and in the preview
  ok(await until(async () => /whole-song/.test((await ThreeAudio.probe(['kickOn']))?.from || ''), 40000, 400), 'song A\'s whole-song features reached the preview');

  // ---------- 1. the offset budget while it plays ----------
  c.seek(2); await wait(300);
  c.play(true);
  await wait(1200);
  const s0 = await AVS();
  out.output = { source: s0?.source, leadMs: s0?.leadMs, ctx: s0?.ctx, stepMs: s0?.stepMs };
  ok(s0?.playing && s0.source === 'output clock', `the song clock follows the output clock while it plays (${JSON.stringify(out.output)})`);
  const reported = ((s0?.ctx?.base || 0) + (s0?.ctx?.output || 0)) * 1000;
  ok(s0 && Math.abs(s0.leadMs - reported) < 15, `the output path measured from the output timestamp (${s0?.leadMs} ms) agrees with the reported latency (${r2(reported)} ms)`);
  const play1 = judge(await watchFor(12000));
  out.play = play1;
  inBudget(play1, 'steady play');
  ok(play1.rawAheadMs > 10, `the raw element time (the page before) ran ahead of the speakers (${play1.rawAheadMs} ms)`);
  ok(play1.thirds && Math.abs(play1.thirds[1] - play1.thirds[0]) < 1, `no drift over the 12 s: the middle offset of the first and last 4 s within 1 ms (${JSON.stringify(play1.thirds)})`);
  // what a clock on the frame time alone would have drifted over a 5-minute song with this sound card (the fit's speed)
  { const s = await AVS(); out.cardPpm = s?.slopePpm; out.frameClockDrift5minMs = s ? r2(Math.abs(s.slopePpm) * 300 / 1000) : null; }

  // ---------- 2. seek while playing, pause, scrub, resume ----------
  await pv('return window.__labAV.watch(6000)');
  await wait(400);
  c.seek(20);
  {
    const fr = await more(1500, { enough: (f) => { const k = f.findIndex((x) => x[1] >= 19.9); return k > 0 && judge(f.slice(k + 3), { skip: 0 }).frames >= 22; } });
    const st = await AVS();
    const k = fr.findIndex((f) => f[1] >= 19.9);
    // the seek's sound reaches the speakers one output path after the seek (st.jump.at, the page's clock), and one
    // output path after the element started playing the new spot (its time moving on from 20 in the audio-clock
    // samples: a busy machine takes a while to seek): the first frame showing the new spot is shown then, not before
    const sm = (await pj('window.__labAV.samples()')) || [];
    const moved = sm.find((a) => a[3] > (st?.jump?.at || 0) && a[2] > 20.0005 && a[2] < 21);
    const soundAt = Math.max((st?.jump?.at || 0) + (st?.leadMs || 0), moved ? moved[3] - (moved[2] - 20) * 1000 + (st?.leadMs || 0) : 0);
    out.seek = { soundAtMs: r2(soundAt - (st?.jump?.at || 0)), jumpFrame: k, before: fr.slice(Math.max(0, k - 2), k).map((f) => r2(f[1])), after: fr.slice(k, k + 2).map((f) => r2(f[1])), shownAfterSoundMs: k >= 0 ? r2(fr[k][0] - soundAt) : null, prevShownBeforeSoundMs: k > 0 ? r2(soundAt - fr[k - 1][0]) : null };
    ok(k > 0, `the picture jumped to the seek (${JSON.stringify(out.seek)})`);
    ok(fr.slice(0, Math.max(0, k)).every((f) => f[1] < 19), 'until the jump the frames show the old spot (the sound still plays it), never a mix');
    // (round 80) give or take one step of the element's time (one audio callback, st.stepMs: what tells the page, and this
    // check, where the sound is; ≈ 10 ms here) on top of a 240 Hz frame
    const tol = FRAME + (st?.stepMs || 0);
    out.seek.tolMs = r2(tol);
    ok(out.seek.shownAfterSoundMs >= -tol && out.seek.prevShownBeforeSoundMs >= -tol, `the new spot is first shown when its sound reaches the speakers, not before (${JSON.stringify(out.seek)})`);
    const j = judge(fr.slice(k + 3), { skip: 0 });
    out.seek.after3 = j;
    inBudget(j, 'after a seek while playing');
  }
  c.play(false);
  await wait(500);
  {
    const st = await AVS();
    const a1 = await pj('audio.time'); await wait(150); const a2 = await pj('audio.time');
    out.pause = { el: st?.time, a1, a2 };
    ok(!st?.playing && a1 === a2 && Math.abs(a1 - st.time) < 1e-9, `paused: audio.time is the element's exact time and holds (${JSON.stringify(out.pause)})`);
    c.seek(7.5); await wait(400);
    const a3 = await pj('audio.time');
    out.scrub = a3;
    ok(Math.abs(a3 - 7.5) < 1e-3, `a scrub while paused shows the exact time (${a3})`);
  }
  await pv('return window.__labAV.watch(6000)');
  c.play(true);
  {
    const fr = await more(3500);
    out.resume = judge(fr);
    ok(fr.every((f) => f[1] >= 7.5 - 1e-6), 'on resume no frame shows a moment before the spot it starts from');
    inBudget(out.resume, 'after resume');
  }

  // ---------- 3. the Lab hidden while the song plays ----------
  activate('tool:board');
  await wait(3000);
  activate('tool:three');
  await pv('return window.__labAV.watch(6000)');
  {
    const fr = await more(2500, { enough: (f) => judge(f, { skip: 0.2 }).frames >= 22 });
    out.hidden = judge(fr, { skip: 0.2 });
    inBudget(out.hidden, 'back from another tool');
    const st = await AVS();
    ok(st?.playing, 'the song played on while the Lab was hidden');
  }

  // ---------- 4. device changes (simulated) ----------
  // (round 80) a slow preview watched longer above: back to 6 s while playing, so the song (48 s) plays on through here
  if (((await AVS())?.time || 0) > 16) { c.seek(6); await wait(800); }
  {
    const st0 = await AVS();
    // a devicechange the Lab window hears (the preview's frame may not): forwarded; the same rate: nothing remade
    navigator.mediaDevices?.dispatchEvent?.(new Event('devicechange'));
    await wait(1200);
    const st1 = await AVS();
    out.devSame = { log: st1?.log?.map((e) => e.what), recoveries: st1?.recoveries };
    ok(st1?.log?.some((e) => e.what === 'device changed') && st1.recoveries === st0.recoveries, `a device change at the same rate is noticed, nothing is made again (${JSON.stringify(out.devSame)})`);
    // the output's rate changes: made again at that rate, never two playing, no gap in the song
    const other = st1.ctx.rate === 48000 ? 44100 : 48000;
    const e0 = await pj('window.__labAV.raw()');
    const w0 = performance.now();
    await pv(`return window.__labAV.device(${other})`);
    let maxPlaying = 0; let polls = 0; let minPlaying = 9;
    const tEnd = performance.now() + 2500;
    while (performance.now() < tEnd) { const s = await pv('return window.__labAV.state().playingEls'); polls += 1; maxPlaying = Math.max(maxPlaying, s); minPlaying = Math.min(minPlaying, s); await wait(15); }
    const e1 = await pj('window.__labAV.raw()');
    const st2 = await AVS();
    const songMoved = e1.pos - e0.pos; const wall = (performance.now() - w0) / 1000; // (the eval round trips: a few ms each)
    out.devRate = { to: other, ctx: st2?.ctx, recoveries: st2?.recoveries, last: st2?.log?.at(-1), maxPlaying, minPlaying, polls, songMovedS: r2(songMoved), wallS: r2(wall) };
    ok(st2?.ctx?.rate === other && st2.recoveries === st1.recoveries + 1 && st2.playing, `the output's rate changed: the song is made again at ${other / 1000} kHz and plays (${JSON.stringify(out.devRate)})`);
    ok(maxPlaying === 1, `never two song elements playing at once during the switch (${maxPlaying} at most over ${polls} looks)`);
    ok(Math.abs(songMoved - wall) < 0.25, `no jump or gap in the song across the switch (the song moved ${r2(songMoved)} s in ${r2(wall)} s)`);
    const lvl = await until(async () => (await pv('return audio.level')) > 0.01, 3000);
    ok(lvl, 'the analyser hears the song after the switch (audio.level > 0)');
    out.devRateSync = judge(await watchFor(2500, { enough: (f) => judge(f, { skip: 0.3 }).frames >= 22 }), { skip: 0.3 });
    inBudget(out.devRateSync, 'after the output rate changed');
    // the system suspends the output: resumed
    await pv('return window.__labAV.suspend()');
    const res = await until(async () => { const s = await AVS(); return s?.ctx?.state === 'running' && s.log.some((e) => e.what === 'resumed') ? s : null; }, 4000, 150);
    out.devSuspend = { resumed: Boolean(res), recoveries: res?.recoveries };
    ok(res && res.recoveries === st2.recoveries && res.playing, `the output suspended by the system: resumed, nothing remade (${JSON.stringify(out.devSuspend)})`);
    // the output closed: made again
    await pv('return window.__labAV.close()');
    const re = await until(async () => { const s = await AVS(); return s && s.recoveries === st2.recoveries + 1 && s.ctx?.state === 'running' ? s : null; }, 5000, 150);
    out.devClosed = { remade: Boolean(re), last: re?.log?.at(-1), playingEls: re?.playingEls };
    ok(re && re.playing && re.playingEls === 1, `the output closed: the song made again and playing, once (${JSON.stringify(out.devClosed)})`);
    const wire = await pv('return window.__labAV.state().log.map((e) => e.why || "").join(" | ")');
    ok(/sample rate/.test(wire) && /closed/.test(wire), `the reasons in plain words (${wire})`);
  }

  // ---------- 5. scene switch A → B → A ----------
  {
    c.play(false); await wait(300);
    const B = ThreeLab.scenes.create({ name: 'Sync B', code: CODE, open: true });
    await until(() => ThreeLab.scenes.currentId() === B.id, 15000);
    await wait(1500);
    const rb = await c.loadSong(SONG_B);
    ok(rb?.ok, 'song B loads on scene B');
    await until(() => c.state.bpm > 0 && Math.abs(c.state.bpm - 100) < 2, 30000);
    c.seek(3); await wait(300); c.play(true); await wait(1500);
    const sb = await AVS();
    const pb = await pj(`(() => { ${PROBE} })()`);
    out.switchB = { bpm: pb?.bpm, t: pb?.t, playingEls: sb?.playingEls, source: sb?.source };
    ok(Math.abs((pb?.bpm || 0) - 100) < 2 && sb?.playingEls === 1 && pb.t > 3 && pb.t < 24, `scene B plays its own song, once (${JSON.stringify(out.switchB)})`);
    out.switchBSync = judge(await watchFor(2500));
    inBudget(out.switchBSync, 'scene B');
    c.play(false); await wait(300);
    ThreeLab.scenes.open(A.id);
    await until(() => ThreeLab.scenes.currentId() === A.id, 15000);
    await until(async () => Math.abs(((await pv('return audio.bpm')) || 0) - 128) < 1, 20000, 300);
    const pa = await pj(`(() => { ${PROBE} })()`); const sa = await AVS();
    out.switchA = { bpm: pa?.bpm, playingEls: sa?.playingEls, song: sa?.song };
    ok(Math.abs((pa?.bpm || 0) - 128) < 1 && sa?.playingEls === 0, `back on scene A: its song again, nothing of B playing (${JSON.stringify(out.switchA)})`);
    out.B = B.id;
  }

  // ---------- 6. backstage parity ----------
  {
    c.play(false); await wait(300);
    const A2 = ThreeLab.scenes.duplicate(A.id, 'Sync A backstage');
    ok(ThreeLab.scenes.songOf(A2.id) === SONG_A, 'the copy plays on the same song');
    const BS = ThreeBackstage;
    const bs = async (tool, args = {}) => BS.handle(tool, args, { sketchId: A2.id, chatId: null });
    const bev = async (code) => { const r = await bs('three_eval', { code: `return JSON.stringify((() => { ${code} })())` }); return r?.ok && typeof r.value === 'string' ? JSON.parse(r.value) : null; };
    await bev('return 1');
    ok(await until(() => BS.song?.analysed && BS.song.elDur > 0, 20000, 200), `the backstage page runs scene A's song, analysed (${JSON.stringify(BS.song)})`);
    BS.send({ type: 'media', cmd: 'pause' }); await wait(300);
    const times = [kicksA[6] + 0.01, kicksA[13] + 0.12, kicksA[30] + 0.01, kicksA[44] + 0.3, 21.37];
    // backstage: the whole-song features arrive (a kick at a kick)
    BS.send({ type: 'media', cmd: 'seek', value: times[0] }); await wait(250);
    ok(await until(async () => ((await bev('return audio.feat.kickOn')) || 0) > 0.5, 40000, 500), 'backstage: the song\'s whole-song features arrived (a kick reads as a kick)');
    const onS = []; const back = [];
    for (const t of times) { c.seek(t); await wait(350); onS.push(await pj(`(() => { ${PROBE} })()`)); }
    for (const t of times) { BS.send({ type: 'media', cmd: 'seek', value: t }); await wait(350); back.push(await bev(PROBE)); }
    const diffs = times.map((t, i) => {
      const a = onS[i] || {}; const b = back[i] || {};
      return { t: r2(t), dt: Math.abs(a.t - b.t), bpm: Math.abs(a.bpm - b.bpm), beat: Math.abs(a.beat - b.beat), inBar: a.inBar === b.inBar, bar: a.bar === b.bar, beatPhase: Math.abs(a.beatPhase - b.beatPhase), barPhase: Math.abs(a.barPhase - b.barPhase), kick: Math.abs(a.kick - b.kick), drop: Math.abs(a.drop - b.drop), intensity: Math.abs(a.intensity - b.intensity), onKick: r2(a.kick), backKick: r2(b.kick) };
    });
    out.parity = diffs;
    for (const d of diffs) ok(d.dt < 1e-3 && d.bpm < 1e-6 && d.beat < 0.02 && d.inBar && d.bar && d.beatPhase < 0.01 && d.barPhase < 0.01 && d.kick < 0.02 && d.drop < 0.02 && d.intensity < 0.02, `backstage plays the same beats at ${d.t} s (${JSON.stringify(d)})`);
    ok(diffs.filter((d) => d.onKick > 0.5).length >= 2, `the probes hit real kicks (${diffs.map((d) => d.onKick).join(', ')})`);
    // the same "Pulse on beats" keyframes on screen (A) and backstage (A2)
    D().applyPreset('main', 'pulse');
    await wait(300);
    const rp = await bs('three_animate', { layer: 'main', preset: 'pulse' });
    ok(rp?.ok, `three_animate pulse backstage (${rp?.error || ''})`);
    const keysOf = (id) => { const L = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(id))[0]; return Object.fromEntries(Object.entries(L.keys || {}).map(([p, ks]) => [p, ks.map((k) => [k.t, k.v])])); };
    const k1 = keysOf(A.id); const k2 = keysOf(A2.id);
    const props = Object.keys(k1);
    const same = props.length > 0 && props.every((p) => k2[p] && k2[p].length === k1[p].length && k1[p].every(([t, v], i) => Math.abs(t - k2[p][i][0]) < 1e-3 && JSON.stringify(v) === JSON.stringify(k2[p][i][1])));
    out.preset = Object.fromEntries(props.map((p) => [p, [k1[p].length, k2[p]?.length || 0]]));
    ok(same, `"Pulse on beats" makes the same keyframes on screen and backstage (${JSON.stringify(out.preset)})`);
    const tl = await bs('three_timeline');
    out.timeline = tl?.value?.grid;
    ok(/auto-detected \(the same/.test(tl?.value?.grid?.setBy || '') && Math.abs(tl.value.grid.bpm - out.bpmA) < 0.01, `the timeline backstage has the song's detected grid (${JSON.stringify(out.timeline)})`);
    const mi = await bs('three_media_info');
    out.mediaInfo = { loaded: mi?.value?.loaded, bpm: mi?.value?.grid?.bpm, backstage: mi?.value?.backstage };
    ok(mi?.value?.loaded && /silently/.test(mi.value.backstage || ''), `three_media_info backstage describes the song (${JSON.stringify(out.mediaInfo)})`);
    const silent = await bev('const s = window.__labAV.state(); const c = new AudioContext(); const d = c.destination; const muted = d instanceof GainNode && d.gain.value === 0; c.close(); return { silent: s.silent, volume: s.volume, muted }');
    out.silent = silent;
    ok(silent?.silent && silent.volume === 0 && silent.muted, `backstage is silent: volume 0 and every output muted (${JSON.stringify(silent)})`);
    out.songPrep = { ...BS.songPrep.stats, size: BS.songPrep.size };
    ok(BS.songPrep.stats.made === 0 && BS.songPrep.stats.handed >= 1, `the song was analysed once: the Lab handed its analysis over (${JSON.stringify(out.songPrep)})`);
    const ls = await bs('three_layers');
    ok(/on its song, silently/.test(ls?.value?.note || ''), `the AI is told the scene runs on its song backstage (${ls?.value?.note})`);
  }

  // ---------- 7. /hear sync ----------
  {
    c.seek(4); c.play(true); await wait(1500);
    let text = '';
    await Commands.tryRun(`/${out.hearName || 'hear'} sync`, H.claudeAgent().id, null, { say: (x) => { text = String(x); }, note: (x) => { text = String(x); } });
    out.hearSync = text;
    ok(/Pictures and sound/.test(text) && /speakers play \*\*\d/.test(text), `/hear sync in plain words (${text.slice(0, 200)})`);
    c.play(false);
  }
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
