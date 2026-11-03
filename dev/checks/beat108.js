// beat108 (round 108): the Lab with a song playing rests between its drawn frames on a fast screen, with its timing
// to the music unchanged (docs/upgrades/beat108.md). An A/B in one run: the preview page as before this round
// (window.__labBeat.legacy(true): the song's loop points looked at in the page's frames only, fps107's frame gate off
// while a song plays) and as now (the loop points on their own timer from the song's position, the gate on), on a
// faked 240 Hz screen and on a 60 Hz one (fps107's fake screen in the Lab preview's page, its rate switched here).
// A generated song (123 BPM, a kick on every beat, hats between) plays on a scene whose layer reads audio.time /
// audio.beat / audio.kick / audio.level every frame and logs everyBeats(1) and onHit('beat') callbacks. Per screen
// rate × mode:
//   · steady play (8 s): the page's frames a second and per drawn frame; the pictures against the audio clock
//     (labaudio77's frame log: |frame time − the audio clock's newest sample at its show time|); the beat callbacks
//     (everyBeats: how late after the beat, on the song's clock, and the beat phase they read); the ⚡ kick trigger's
//     fires (the song's heard time at each fire − the kick's time)
//   · a loop A–B crossing its end ~8 times while playing, then 3 seeks to just before B while playing: where the song
//     was on its clock (the audio clock's fit: heard + the output path) when the page wrapped it, past B (ms)
// (round 109, labchecks109) then realscene-lib's real scene (several layers and frame loops, a model, ⚡ triggers, a
// filter, its own song) at 240 Hz: no runaway, no graphics context lost; and the page's runaway guard against round
// 107's answer (window.__labRunaway.bug107): caught after 2 s, plain frames after, the preview kept.
// Budgets: the new page wakes ≤ 2.6 frames per drawn one at 240 Hz while the song plays (it was ≈ 4); every timing
// number the same or better than the page before (p50 / p95 within a small tolerance for scheduling noise: the loop
// wraps' within 1 ms, the frames' and beats' within 1.5 / 2.5 ms), the loop wraps never early (> −1 ms), every beat
// called back once. (round 110, beatload110) Judged against the load measured in the same frames: a figure over its
// tolerance is "can't tell" (cantTell, not failed) when what's left without the box's part is the same or better (a beat
// callback / ⚡ fire less its own delay after its drawn frame's cap slot; a loop wrap's figure when the page's reaction
// to the song reaching B, measured by a 1 ms look, is the same or better and the excess is the sound engine's part);
// the drawn frames after their slots (p50) and the gate's timer are judged with no allowance; the beats are the page's
// own beat list (the one its helpers count on). BEAT108_REPORT = 1 reports without failing.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/beat108.js --shot /tmp/beat108.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { runs: {} }; const fail = [];
const mark = (what) => (out.marks ||= []).push(`${Math.round(performance.now() / 100) / 10}s ${what}`);
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const T = window.SMOKE_TMP || '/tmp';
const SONG = `${T}/beat108.wav`;
const BPM = 123; const LEAD = 0.25; const BEAT = 60 / BPM; // (123: not a whole number of 60 fps frames a beat, the drawn frames fall at every phase of the beat)
// ---------- the fake screen in the Lab preview's page (fps107's, with its rate switchable) ----------
const probe = () => {
  if (window.__fps107) return;
  if (location.protocol === 'about:') return;
  const raw = { st: window.setTimeout, si: window.setInterval, raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame, now: performance.now.bind(performance) };
  const P = window.__fps107 = { hz: 240, ticks: 0, busy: 0, n: { raf: 0, timeout: 0, interval: 0 }, since: raw.now(), raw, gaps: [], lt: [], stalls: 0, stallMs: 0, stallAt: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (P.lt.length < 400) P.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); } catch { /* no long-task timing */ } // (beatload110: the page's own long tasks)
  const q = new Map(); let id = 0; let realOn = false; let lastReal = -1; let timer = 0; let empty = 0;
  const rci = window.clearInterval.bind(window);
  const fire = () => {
    P.ticks += 1;
    if (!q.size) return;
    P.busy += 1;
    const t = raw.now(); const list = [...q.values()]; q.clear();
    for (const cb of list) { P.n.raf += 1; try { cb(t); } catch (err) { raw.st.call(window, () => { throw err; }); } }
  };
  const want = () => { if (!realOn) { realOn = true; raw.raf.call(window, real); } };
  function real() { lastReal = raw.now(); if (P.stallAt) { P.stallMs += lastReal - P.stallAt; P.stallAt = 0; } if (q.size || timer) raw.raf.call(window, real); else realOn = false; arm(); }
  function arm() {
    if (timer || !q.size) return;
    want();
    if (raw.now() - lastReal > 100) return;
    empty = 0;
    let prevTick = raw.now();
    timer = raw.si.call(window, () => {
      const tn = raw.now(); if (P.gaps.length < 6000) P.gaps.push(tn - prevTick - 1000 / P.hz); prevTick = tn; // (beatload110: how late each tick of the fake screen came: the box's load as the page saw it)
      if (raw.now() - lastReal > 100) { rci(timer); timer = 0; P.stalls += 1; P.stallAt = raw.now(); want(); return; } // (beatload110: the real frames stalled: the fake screen waits for them, as a real one would)
      if (!q.size) { empty += 1; if (empty > 3) { rci(timer); timer = 0; } return; }
      empty = 0; fire();
    }, 1000 / P.hz);
  }
  window.requestAnimationFrame = function (cb) { if (typeof cb !== 'function') return raw.raf.call(window, cb); id += 1; q.set(id, cb); arm(); return id; };
  window.cancelAnimationFrame = function (i) { if (!q.delete(i)) raw.caf.call(window, i); };
  for (const [name, kind] of [['setTimeout', 'timeout'], ['setInterval', 'interval']]) {
    const orig = raw[name === 'setTimeout' ? 'st' : 'si'];
    window[name] = function (fn, ...rest) { if (typeof fn !== 'function') return orig.call(window, fn, ...rest); return orig.call(window, function (...a) { P.n[kind] += 1; return fn.apply(this, a); }, ...rest); };
  }
  P.setHz = (hz) => { P.hz = hz; if (timer) { rci(timer); timer = 0; } arm(); return hz; };
  const fakeRaf = window.requestAnimationFrame;
  const stalled = () => P.stallMs + (P.stallAt ? raw.now() - P.stallAt : 0);
  P.screen = (ms = 1000) => new Promise((res) => { let n = 0; const t0 = raw.now(); const s0 = stalled(); const go = () => { n += 1; if (raw.now() - t0 < ms) fakeRaf(go); else res(Math.round((n * 10000) / Math.max(1, raw.now() - t0 - (stalled() - s0))) / 10); }; fakeRaf(go); }); // (beatload110: while it ticks: the real frames' stalls left out)
  P.take = () => { const ms = raw.now() - P.since; const per = (x) => Math.round((x * 10000) / ms) / 10; const r = { s: Math.round(ms / 100) / 10, framesPerSec: per(P.busy), rafPerSec: per(P.n.raf), timersPerSec: per(P.n.timeout + P.n.interval) }; P.n = { raf: 0, timeout: 0, interval: 0 }; P.busy = 0; P.since = raw.now(); return r; };
  P.load = () => { const g = P.gaps.slice().sort((a, b) => a - b); const at = (p) => (g.length ? Math.round(g[Math.min(g.length - 1, Math.floor(p * g.length))] * 100) / 100 : null); const r = { ticks: g.length, lateP50: at(0.5), lateP95: at(0.95), lateP99: at(0.99), lateMax: at(1), over8: g.filter((x) => x > 8).length, longTasks: P.lt.length, longMs: P.lt.reduce((a, e) => a + e[1], 0), longMax: P.lt.reduce((a, e) => Math.max(a, e[1]), 0), stalls: P.stalls, stallMs: Math.round(P.stallMs) }; P.gaps = []; P.lt = []; P.stalls = 0; P.stallMs = 0; return r; };
};
await smoke({ frameScript: { match: '', source: `if (/three-sandbox/.test(location.href) && !/silent=1/.test(location.href)) (${probe.toString()})();` } });

// ---------- the test song: a kick on every beat (nothing held under it: the ⚡ kick band falls between), hats between ----------
async function song(file, secs) {
  const sr = 44100; const n = Math.round(secs * sr); const x = new Float32Array(n);
  let s = 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 1073741823.5 - 1; };
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i += 1) x[a + i] += f(i / sr); };
  const kicks = [];
  for (let k = 0; LEAD + k * BEAT < secs - 0.5; k += 1) {
    const t = LEAD + k * BEAT;
    add(t, 0.25, (u) => 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-u * 30)) * u) * Math.exp(-u * 14)); kicks.push(t);
    add(t + BEAT / 2, 0.04, (u) => 0.15 * rnd() * Math.exp(-u * 90));
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
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
scene.add(mesh);
const B = window.__b108 || (window.__b108 = { on: false, every: [], hit: [] });
everyBeats(1, (v) => { if (B.on) B.every.push([audio.time, audio.beatPhase, v, performance.now()]); });
onHit('beat', () => { if (B.on) B.hit.push([audio.time, audio.beatPhase, 0, performance.now()]); });
renderer.setAnimationLoop(() => { mesh.rotation.y = audio.time; mesh.scale.setScalar(1 + 0.3 * audio.beat + 0.2 * audio.kick + 0.1 * audio.level); renderer.render(scene, camera); });`;
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 5; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } (out.evalErrors ||= []).push(`${code.slice(0, 80)} → ${JSON.stringify(r).slice(0, 200)}`); return null; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : null; };
const toPage = (msg) => pv(`postMessage(${JSON.stringify({ target: 'three-sandbox', ...msg })}, '*'); return 1`);
const q = (a, p) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : null; };
const stats = (a) => ({ n: a.length, p50: r2(q(a, 0.5)), p95: r2(q(a, 0.95)), min: r2(q(a, 0)), max: r2(q(a, 1)) });
const lastIdx = (arr, t) => { let k = -1; for (let i = 0; i < arr.length && arr[i] <= t + 1e-9; i += 1) k = i; return k; };

try {
  const kicks = await song(SONG, 60);
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(1500);
  const A = ThreeLab.scenes.create({ name: 'Beat 108', code: CODE, open: true });
  await until(() => ThreeLab.scenes.currentId() === A.id && D(), 15000);
  await wait(2000);
  addEventListener('hearth:lab-gl', (e) => (out.glEvents ||= []).push(`${Math.round(performance.now() / 100) / 10}s ${e.detail?.state} ${e.detail?.how || ''}`));
  out.probe = await pv('return Boolean(window.__fps107 && window.__labBeat)');
  ok(out.probe === true, 'the fake screen and window.__labBeat are in the Lab preview\'s page');
  mark('scene made'); const r = await c.loadSong(SONG); mark('song loaded');
  ok(r?.ok, `the song loads (${JSON.stringify(r)})`);
  ok(await until(() => c.state.bpm > 0, 30000), 'the song analysed');
  out.bpm = c.state.bpm;
  // (round 110, beatload110) the beat list the page's beat helpers count on (barInfo: the Lab's beat map, its straight grid when it
  // found one), not the analysis' detected beats: the two differ by a fraction of a millisecond, and a beat callback in a frame
  // between them read as one whole beat (488 ms) late (labchecks109's "487.9 ms late": its phase read 0.0000, right on the beat)
  const beats = (await pj('window.__labBeat.beats ? window.__labBeat.beats() : (audio.analysis?.beats || [])')) || [];
  out.beatsDetected = ((await pj('audio.analysis?.beats || []')) || []).length;
  out.beatsFound = beats.length;
  ok(beats.length > 50, `the song's beats (${beats.length})`);
  ok(await until(async () => /whole-song/.test((await ThreeAudio.probe(['kickOn']))?.from || ''), 40000, 400), 'the song\'s whole-song features reached the preview');
  mark('features in'); await wait(3000);
  out.layer = await pv('return [typeof everyBeats, typeof onHit, Boolean(window.__b108)].join(" ")');
  // the ⚡ kick trigger alone (40–120 Hz over half): its fires against the kicks
  await toPage({ type: 'triggers-set', cfg: { kick: { on: true, lo: 40, hi: 120, thr: 0.5, gap: 200, fade: 120 } } });

  async function run(hz, legacy) {
    const R = {}; mark(`run ${hz} ${legacy ? 'before' : 'after'}`);
    await pv('window.__labPace.reset(); return 1');
    await pv(`window.__labBeat.legacy(${legacy}); window.__fps107.setHz(${hz}); return 1`);
    // ---- steady play ----
    await toPage({ type: 'media', cmd: 'loop', value: false }); await toPage({ type: 'media', cmd: 'region', value: null });
    c.seek(2); await wait(200); c.play(true);
    await wait(2600); // (the gate learns the screen's frame over 2 s)
    await pv(`window.__labBeat.legacy(${legacy}); return 1`);
    const av0 = await pj('window.__labAV.state()');
    await pv('window.__labAV.watch(4000); window.__labBeat.log(true); window.__b108.on = true; window.__b108.every = []; window.__b108.hit = []; window.__fps107.take(); window.__fps107.load(); return 1');
    const d0 = await pj('window.__labPace.state().drawn'); const t0 = performance.now();
    await wait(8000);
    const page = await pj('window.__fps107.take()'); const d1 = await pj('window.__labPace.state().drawn');
    const sec = (performance.now() - t0) / 1000;
    R.load = await pj('window.__fps107.load()'); // (beatload110: the box's load in this stretch, as the page saw it)
    const sl = (await pj('window.__labBeat.slots()')) || { late: [], gate: [], edge: [] };
    R.slots = { drawnLate: stats(sl.late), gateTimerLate: stats(sl.gate) }; // (beatload110: each drawn frame after its cap slot; each gate timer after due)
    const av1 = await pj('window.__labAV.state()'); R.clockStarts = av1 && av0 ? av1.starts - av0.starts : null;
    R.screen = await pj('await window.__fps107.screen(500)');
    R.state = await pj('window.__labBeat.state()');
    R.framesPerSec = page.framesPerSec; R.drawnPerSec = r2((d1 - d0) / sec); R.perDrawn = r2(page.framesPerSec / Math.max(1, R.drawnPerSec)); R.timersPerSec = page.timersPerSec;
    // the pictures against the audio clock (frames whose callback ran ≤ 50 ms late, from the output clock)
    const fr = (await pj('window.__labAV.frames()')) || [];
    R.picture = stats(fr.filter((f) => f[4] === 1 && f[5] <= 50).slice(10).map((f) => Math.abs(f[1] - f[2]) * 1000));
    // the beat callbacks: how late after their beat (ms), the phase they read against that
    const B = (await pj('window.__b108')) || { every: [], hit: [] };
    const late = (e) => { const k = lastIdx(beats, e[0]); return k < 0 ? NaN : (e[0] - beats[k]) * 1000; };
    const len = (e) => { const k = lastIdx(beats, e[0]); return k < 0 || k + 1 >= beats.length ? NaN : (beats[k + 1] - beats[k]) * 1000; };
    R.everyBeat = { ...stats(B.every.map(late)), phaseOffMs: r2(Math.max(0, ...B.every.map((e) => Math.abs(e[1] * len(e) - late(e))).filter(Number.isFinite))) };
    const span = B.every.length > 1 ? B.every.at(-1)[0] - B.every[0][0] : 0;
    R.everyBeat.missed = Math.max(0, Math.round(span / BEAT) + 1 - B.every.length);
    R.onHitBeat = stats(B.hit.map(late));
    // (beatload110) each beat callback's delay after the cap's slot of the drawn frame it ran in (ms): the frame's own
    // lateness after its slot plus how far into the frame's work it ran (the box: a stalled real frame, a slow render;
    // or the gate)
    const frameOf = (now) => { let k = -1; for (let i = 0; i < sl.t.length && sl.t[i] <= now + 0.01; i += 1) k = i; return k < 0 || now - sl.t[k] > 100 ? null : r2(now - (sl.t[k] - sl.late[k])); };
    R.beatLates = { every: B.every.map((e) => r2(late(e))), hit: B.hit.map((e) => r2(late(e))) };
    R.beatFrames = { every: B.every.map((e) => frameOf(e[3])), hit: B.hit.map((e) => frameOf(e[3])) };
    // (beatload110) a beat callback for a beat number lower than the one before (the song's clock read went back across a beat), or the same beat twice
    R.everyBeat.back = B.every.filter((e, i) => i > 0 && e[2] < B.every[i - 1][2]).map((e) => ({ v: e[2], t: r2(e[0]), late: r2(late(e)) }));
    R.everyBeat.worst = B.every.map((e) => [r2(late(e)), e[2], r2(e[0]), r2(e[3])]).sort((x, y) => y[0] - x[0]).slice(0, 3);
    // the ⚡ kick trigger's fires: the song's heard time then − the kick's time (ms)
    const tr = ((await pj('window.__labBeat.trigs()')) || []).filter((x) => x[0] === 'kick' && x[2] != null);
    // (the nearest kick: the analyser hears the sound as it's made, before the speakers play it, so a fire comes before
    // the kick's heard time by about the output path)
    R.trigger = stats(tr.map((x) => { let best = NaN; for (const k of kicks) if (!(Math.abs(x[2] - k) >= Math.abs(best))) best = x[2] - k; return best * 1000; }));
    R.triggerVals = tr.map((x) => { let best = NaN; for (const k of kicks) if (!(Math.abs(x[2] - k) >= Math.abs(best))) best = x[2] - k; return r2(best * 1000); });
    R.triggerFrames = tr.map((x) => frameOf(x[1])); // (beatload110: each fire's delay after its drawn frame's cap slot)
    R.triggerAt = tr.map((x) => [x[4], x[5], x[3] != null ? r2(x[1] - x[3]) : null]); // (beatload110: [in a drawn frame, ms since the sound was read before, ms into its frame])
    await pv('window.__b108.on = false; return 1');
    mark('loop');
    // ---- a loop crossing its end, then seeks to just before it ----
    const LA = 4.1; const LB = 5.2;
    c.seek(LA); await wait(150);
    await toPage({ type: 'media', cmd: 'region', value: { a: LA, b: LB } }); await toPage({ type: 'media', cmd: 'loop', value: true });
    await pv('window.__labBeat.log(true); window.__labBeat.cross(true); window.__fps107.load(); return 1');
    await wait(9000);
    const wraps = ((await pj('window.__labBeat.edges()')) || []).filter((e) => e[0] === 'loop');
    for (let i = 0; i < 3; i += 1) { await wait(120); c.seek(LB - 0.3); await wait(800); }
    const all = ((await pj('window.__labBeat.edges()')) || []).filter((e) => e[0] === 'loop');
    const seekW = all.slice(wraps.length);
    const past = (e) => (e[5] - e[4]) * 1000; const el = (e) => (e[3] - e[4]) * 1000;
    // (beatload110) the page's reaction: the edge acted on − when the song's element first read B or past it (a 1 ms
    // look of the check's: cross); 0 when the page's own look saw it first
    const cx = (await pj('window.__labBeat.crossings()')) || [];
    await pv('window.__labBeat.cross(false); return 1');
    const react = (e) => { let c = null; for (const x of cx) if (x[0] <= e[2] + 0.01 && x[0] > e[2] - 400) c = x[0]; return c == null ? 0 : Math.max(0, e[2] - c); };
    R.loop = { ...stats(wraps.map(past)), elementPast: stats(wraps.map(el)), reaction: stats(wraps.map(react)), each: wraps.map((e) => [r2(past(e)), r2(el(e)), e[1], r2(react(e))]), by: { frame: wraps.filter((e) => e[1] === 0).length, timer: wraps.filter((e) => e[1] > 0).length } };
    R.afterSeek = { ...stats(seekW.map(past)), elementPast: stats(seekW.map(el)), reaction: stats(seekW.map(react)), each: seekW.map((e) => [r2(past(e)), r2(el(e)), e[1], r2(react(e))]), by: { frame: seekW.filter((e) => e[1] === 0).length, timer: seekW.filter((e) => e[1] > 0).length } };
    R.edgeState = await pj('window.__labBeat.state()');
    R.loopLoad = await pj('window.__fps107.load()');
    const sl2 = (await pj('window.__labBeat.slots()')) || { edge: [] }; R.edgeTimerLate = stats(sl2.edge || []);
    await toPage({ type: 'media', cmd: 'loop', value: false }); await toPage({ type: 'media', cmd: 'region', value: null });
    await pv('window.__labBeat.log(false); return 1');
    c.play(false); await wait(400);
    console.log(`[BEAT108] ${hz} Hz ${legacy ? 'before' : 'after'}`, JSON.stringify(R));
    return R;
  }
  for (const hz of [240, 60]) {
    // (the order swapped between the rates: a machine getting busier during the run doesn't favour one side)
    const order = hz === 240 ? [true, false] : [false, true];
    for (const legacy of order) out.runs[`${hz} ${legacy ? 'before' : 'after'}`] = await run(hz, legacy);
  }
  await pv('window.__labBeat.legacy(false); window.__fps107.setHz(240); return 1');
  c.play(false);

  // ---------- (round 109, labchecks109) the real scene, then the guard against round 107's runaway ----------
  // realscene-lib's scene (several layers, a raw frame loop + onHit / everyBeats / onBar, a 🧊 model with its picture,
  // ✦ Bloom, its own song with ⚡ triggers) playing on the 240 Hz screen with the gate on: no runaway, no graphics
  // context lost. Then window.__labRunaway.bug107(true) gives held frames round 107's answer (id 0, queued again each
  // time): the page's guard must catch it within a few seconds (a 'frame-runaway' note), go back to plain frames, keep
  // drawing without losing its graphics context, and its frame callbacks come back down.
  mark('real scene');
  out.real = { info: await RS.open() };
  ok(out.real.info.layers.length >= 5 && out.real.info.model?.loaded && out.real.info.song, `the real scene is up (${JSON.stringify(out.real.info).slice(0, 300)})`);
  await pv('window.__fps107.setHz(240); return 1');
  await wait(3000);
  out.real.watch = await RS.watch(8000);
  console.log('[BEAT108] real scene', JSON.stringify(out.real.watch));
  for (const x of RS.problems(out.real.watch, 'real scene, 240 Hz, its song playing')) fail.push(x);
  ok(out.real.watch.perFrame != null && out.real.watch.page.framesPerSec <= 2.6 * 60 + 6 && out.real.watch.gateHeldPerSec > 5, `real scene, 240 Hz: the gate rests between drawn frames (${out.real.watch.page?.framesPerSec} page frames a second, ≤ 2.6 per drawn one of the cap's 60; the gate held ${out.real.watch.gateHeldPerSec} a second)`);
  mark('guard');
  await pv('window.__labRunaway.bug107(true); return 1');
  out.real.bug = await RS.watch(7000);
  await pv('window.__labRunaway.bug107(false); return 1');
  out.real.after = await RS.watch(3000);
  console.log('[BEAT108] round 107\'s answer', JSON.stringify(out.real.bug), JSON.stringify(out.real.after));
  const g = out.real.bug.guard || {};
  ok(g.tripped && g.trips === 1 && out.real.bug.runawayNotes.length === 1, `the guard caught round 107's runaway (${JSON.stringify(g)}; notes ${JSON.stringify(out.real.bug.runawayNotes)})`);
  ok(g.info && g.info.forMs >= 2000 && g.info.forMs <= 4500, `… after 2 s over 4× the screen's rate, not before nor much later (${JSON.stringify(g.info)})`);
  ok(!out.real.bug.gl.some((e) => /lost|remaking/.test(e.state)) && !out.real.after.gl.some((e) => /lost|remaking/.test(e.state)) && !out.real.after.glPhase, `… and the preview kept its graphics context (${JSON.stringify([out.real.bug.gl, out.real.after.gl])})`);
  ok(out.real.after.rendersPerSec > 1 && out.real.after.perFrame != null && out.real.after.perFrame <= RS.B.perFrame && out.real.after.guard.peakLoopPerSec <= out.real.after.guard.limit && out.real.after.guard.peakLoopPerFrame <= 1, `… kept drawing on plain frames, its frame callbacks back down (${JSON.stringify({ renders: out.real.after.rendersPerSec, perFrame: out.real.after.perFrame, guard: out.real.after.guard })})`);
  await pv('window.__labRunaway.reset(true); return 1');
  await RS.close();

  // ---------- budgets ----------
  // (round 110, beatload110) judged against the load measured in the same frames, checks102's way: a figure over its
  // tolerance by no more than what the load explains is "can't tell" (listed in cantTell, not failed); over that it
  // fails. The tolerances are unchanged. What the load explains, measured in each stretch (docs/upgrades/beatload110.md):
  //   · beat callbacks and ⚡ fires run in drawn frames: how late each one's own frame came after its cap slot (the
  //     page's frames stall when the box's real frames do: SwiftShader on the same CPUs; the same with the gate or
  //     without, and at 60 Hz the two stretches run the same code). Each one less that delay must be the same or
  //     better within the same tolerance
  //   · the loop wraps: the page's reaction to the song's element reaching B (a 1 ms look of the check's) is judged
  //     with no allowance; the rest of the figure (where B fell in the element's audio step: 10 ms calm, 20–25 ms
  //     busy; the song clock's fit) is the sound engine's: after's over before's
  // and, with no allowance: the drawn frames after their slots at 240 Hz (p50 of ≈ 480: where the gate's own effect
  // would show), the gate's timer on time (p95 within its 4 ms of slack)
  out.cantTell = [];
  const tol = { loop: 1, picture: 1.5, beat: 3, trigger: 4 };
  const nn = (arr) => (arr || []).filter(Number.isFinite);
  for (const hz of [240, 60]) {
    const b = out.runs[`${hz} before`]; const a = out.runs[`${hz} after`];
    const same = (what, x, y, t, allow = 0, why = '') => {
      const line = `${hz} Hz: ${what} the same or better (before ${x}, after ${y}, ± ${t} ms)`;
      if (x == null || y == null) return ok(false, `${line}: not measured`);
      if (y <= x + t) return true;
      if (allow > 0 && y <= x + t + allow) { out.cantTell.push(`${line}: CAN'T TELL, ${r2(y - x - t)} ms over, within the ${r2(allow)} ms the load explains (${why})`); return true; }
      return ok(false, `${line}${allow > 0 ? `: ${r2(y - x - t)} ms over, more than the ${r2(allow)} ms the load explains (${why})` : ''}`);
    };
    const over = (x, y) => (x != null && y != null ? Math.max(0, y - x) : 0);
    // the loop wraps: the page's reaction to the element reaching B (strict), and the rest of the figure (past B − the
    // reaction: where B fell in the element's audio step, the song clock's fit: the sound engine's) as what the load
    // explains when the whole figure is over
    const rest = (R, p) => q(nn((R.each || []).map((e) => e[0] - e[3])), p);
    for (const [k, t, nm] of [['loop', tol.loop, 'the loop wrap past B'], ['afterSeek', tol.loop + 1, 'the loop wrap past B after a seek']]) {
      same(`the page's reaction to the song reaching B${k === 'afterSeek' ? ' after a seek' : ''}, p95`, b[k].reaction.p95, a[k].reaction.p95, t);
      for (const [p, nmP] of (k === 'loop' ? [[0.5, 'p50'], [0.95, 'p95']] : [[0.95, 'p95']])) {
        same(`${nm}, ${nmP}`, b[k][nmP], a[k][nmP], t, over(rest(b[k], p), rest(a[k], p)), `the sound engine's part (past B − the page's reaction), ${nmP} ${r2(rest(b[k], p))} → ${r2(rest(a[k], p))} ms`);
      }
    }
    ok(a.loop.n >= 6 && a.afterSeek.n >= 3, `${hz} Hz: the loop wrapped (${a.loop.n}) and after each seek (${a.afterSeek.n})`);
    ok(a.loop.min > -1 && a.afterSeek.min > -1, `${hz} Hz: never wrapped before the song reached B (${a.loop.min}, ${a.afterSeek.min})`);
    same('the pictures against the audio clock, p95', b.picture.p95, a.picture.p95, tol.picture);
    // (beat callbacks and ⚡ fires: each one's own drawn frame's delay after its cap slot, taken out of it when the figure
    // is over: what's left is where the beat fell against the cap's slots, the same with the gate or without)
    // (bound: an event in the first drawn frame after its cause, less that frame's delay after its slot, is within one
    // cap period of it (16.7 ms), plus one screen frame for a beat callback, which reads the song at the frame's show
    // time; a figure over its tolerance whose events all are is the frames' delay: the load)
    const sameEv = (what, p, bv, bfr, av, afr, t, bound = 1000 / 60 + 1000 / hz) => {
      const x = r2(q(nn(bv), p)); const y = r2(q(nn(av), p));
      const line = `${hz} Hz: ${what} the same or better (before ${x}, after ${y}, ± ${t} ms)`;
      if (x == null || y == null) return ok(false, `${line}: not measured`);
      if (y <= x + t) return true;
      const adj = (v, f) => (v || []).map((z, i) => (Number.isFinite(z) && Number.isFinite(f?.[i]) ? z - f[i] : NaN));
      const xa = r2(q(nn(adj(bv, bfr)), p)); const ya = r2(q(nn(adj(av, afr)), p));
      const fr = `their delay after their drawn frame's cap slot, ${p === 0.5 ? 'p50' : 'p95'} ${r2(q(nn(bfr), p))} → ${r2(q(nn(afr), p))} ms`;
      if (xa != null && ya != null && ya <= Math.max(xa, bound) + t) { out.cantTell.push(`${line}: CAN'T TELL, ${r2(y - x - t)} ms over; each one less its delay after its drawn frame's cap slot (the load: ${fr}): before ${xa}, after ${ya}, the same or better or within ${r2(bound)} ms of its cause (the first drawn frame after it)`); return true; }
      return ok(false, `${line}: ${r2(y - x - t)} ms over, and each one less its delay after its drawn frame's cap slot still over (before ${xa}, after ${ya}, bound ${r2(bound)} ms; ${fr})`);
    };
    sameEv('everyBeats callbacks after their beat, p95', 0.95, b.beatLates?.every, b.beatFrames?.every, a.beatLates?.every, a.beatFrames?.every, tol.beat);
    sameEv('onHit(\'beat\') callbacks after their beat, p95', 0.95, b.beatLates?.hit, b.beatFrames?.hit, a.beatLates?.hit, a.beatFrames?.hit, tol.beat);
    // the ⚡ fires: decided where the scene reads the sound, in drawn frames only, with the gate or without (round 110's
    // diagnostic run: 0 reads outside a drawn frame in all four stretches, ≈ 64 a second, 16 ms apart, every fire in a
    // drawn frame). That cadence is judged with no allowance; the fires' p50 against the kicks moves with where the
    // analyser's onsets fall against those frames: 3.5 ms between two stretches of the same code at 60 Hz on a calm
    // box, 13 ms under the burn. Over its tolerance while the box's real frames stalled in either stretch: can't tell
    const reads = (R) => ({ n: R.state?.upd, off: R.state?.updOff });
    ok(reads(a).off === 0 && reads(b).off === 0 && reads(a).n > 0 && Math.abs(reads(a).n - reads(b).n) <= 0.15 * reads(b).n, `${hz} Hz: the sound read in drawn frames only, as often with the gate as without (before ${JSON.stringify(reads(b))}, after ${JSON.stringify(reads(a))})`);
    ok((a.triggerAt || []).every((x) => x[0] === 1), `${hz} Hz: every ⚡ fire in a drawn frame (${JSON.stringify((a.triggerAt || []).filter((x) => x[0] !== 1))})`);
    {
      const x = b.trigger.p50; const y = a.trigger.p50; const line = `${hz} Hz: the ⚡ kick trigger after its kick, p50 the same or better (before ${x}, after ${y}, ± ${tol.trigger} ms)`;
      const st = `the real frames stalled ${b.load?.stalls} and ${a.load?.stalls} times (${b.load?.stallMs} and ${a.load?.stallMs} ms)`;
      if (x == null || y == null) ok(false, `${line}: not measured`);
      else if (y > x + tol.trigger) {
        if ((b.load?.stalls || 0) + (a.load?.stalls || 0) >= 5) out.cantTell.push(`${line}: CAN'T TELL, ${r2(y - x - tol.trigger)} ms over while the box was busy (${st}); the fires' cadence was the same`);
        else ok(false, `${line}: ${r2(y - x - tol.trigger)} ms over on a calm box (${st})`);
      }
    }
    ok(a.everyBeat.missed === 0 && a.everyBeat.phaseOffMs <= 1, `${hz} Hz: every beat called back once, with its phase (${JSON.stringify(a.everyBeat)})`);
    ok(!a.everyBeat.back.length, `${hz} Hz: no beat called back for a beat before the last one (${JSON.stringify(a.everyBeat.back)})`);
    ok(a.trigger.n >= 6, `${hz} Hz: the ⚡ kick trigger fired (${a.trigger.n})`);
  }
  const a240 = out.runs['240 after']; const b240 = out.runs['240 before'];
  ok(out.runs['240 before'].screen >= 120, `the fake screen ticks like a fast one (${b240.screen} frames a second)`);
  ok(a240.perDrawn <= 2.6 && a240.drawnPerSec > 20, `240 Hz, a song playing: ≤ 2.6 page frames per drawn one (before ${b240.perDrawn}, after ${a240.perDrawn}; drawn ${a240.drawnPerSec}/s)`);
  ok(Math.abs(a240.drawnPerSec - b240.drawnPerSec) <= 6, `240 Hz: the same drawn frames a second (before ${b240.drawnPerSec}, after ${a240.drawnPerSec})`);
  // (beatload110) where the gate's own effect would show, with no allowance: the drawn frames as close to their slots
  // (p50 of ≈ 480 frames), its timer on time (its slack is a screen frame + 4 ms)
  ok(a240.slots.drawnLate.p50 != null && a240.slots.drawnLate.p50 <= b240.slots.drawnLate.p50 + 1, `240 Hz: the drawn frames as close to their cap slots with the gate, p50 (before ${b240.slots.drawnLate.p50}, after ${a240.slots.drawnLate.p50}, ± 1 ms)`);
  ok(a240.slots.gateTimerLate.n > 50 && a240.slots.gateTimerLate.p95 <= 4, `240 Hz: the frame gate's timer on time, p95 within its 4 ms of slack (${JSON.stringify(a240.slots.gateTimerLate)})`);
  out.table = Object.entries(out.runs).map(([k, R]) => `${k}: page ${R.framesPerSec} frames/s for ${R.drawnPerSec} drawn (${R.perDrawn} per drawn) · loop wrap past B p50 ${R.loop.p50} / p95 ${R.loop.p95} / max ${R.loop.max} ms (after a seek p95 ${R.afterSeek.p95}) · picture p95 ${R.picture.p95} ms · everyBeats p50 ${R.everyBeat.p50} / p95 ${R.everyBeat.p95} ms · onHit p95 ${R.onHitBeat.p95} ms · ⚡ kick p50 ${R.trigger.p50} / p95 ${R.trigger.p95} ms · drawn after slot p50 ${R.slots?.drawnLate.p50} / p95 ${R.slots?.drawnLate.p95} ms · gate timer late p95 ${R.slots?.gateTimerLate.p95} ms · ticks late p95 ${R.load?.lateP95} ms, real frames stalled ${R.load?.stalls} times (${R.load?.stallMs} ms)`);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.console = (document.querySelector('.three-console')?.textContent || '').slice(0, 600);
if (window.BEAT108_REPORT) { out.unenforced = fail.splice(0); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
