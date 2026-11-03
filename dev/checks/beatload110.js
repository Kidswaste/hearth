// beatload110 (round 110): the Lab's frame gate with live sound and with video footage (docs/upgrades/beatload110.md).
// Round 108 let the gate hold the preview page's frames between drawn ones while a song plays; live sound and footage
// still kept it off, so on a 240 Hz screen the page woke on every screen frame to draw 60. This round gates both. The
// proof is an A/B in one run, in realscene-lib's real scene (several layers and frame loops, a 🧊 model, ✦ Bloom, the
// beat rig: dev/checks/realscene-lib.js), on a faked 240 Hz screen and a 60 Hz one:
//   window.__labBeat.legacy110(true) puts the page back as it was (the gate off with live sound and footage, a held
//   frame's end looked at in the page's frames only); legacy110(false) is this round.
// Live sound: the Lab's own live path for real: 🎧 Live → Microphone, captured by the Lab window (getUserMedia, its audio
// worklet) and sent to the preview ('af' frames). The microphone is Chromium's fake capture device playing a drum loop
// from a file (smoke.js --fake-mic: 125 BPM, a kick on every beat). Per stretch (8 s):
//   · the page's frames a second and per drawn one; each drawn frame's time after its cap slot
//   · the ⚡ kick trigger's reaction: its fire − the arrival of the first analysis frame over its bar (the sound's
//     arrival in the page → the drawn frame that reacted)
//   · everyBeats(1) on the live tempo clock: how late after its beat each callback ran (beat phase × period); beats
//     missed or called twice; the tempo found
// Footage: a 30 fps video with its sound (frame numbers burned in: dev/make-lab-footage.js), a cut list of six half-second
// parts with a second removed between each and three frames held 0.25 s, looped (the Lab's own parts format), played; the sketch logs each frame the
// video presented (media.onFrame) and the page logs each part's end as it acted on it. Per stretch (10 s):
//   · removed frames handed to the sketch (none)
//   · each cut: how far before the part's end (the video's own clock) the page jumped, and what made it jump (the
//     timer the video's own frame set, the edge timer on the video's clock, a page frame, a video frame already past it)
//   · each held frame: how late after its 0.25 s the page let it go
//   · on screen (reported: the box's compositor stalls under load decide these): each seam's gap, each hold's length
//   · the page's frames a second and per drawn one
// Budgets: with the gate (this round) at 240 Hz ≤ 2.6 page frames per drawn one (it was ≈ 4), its timer on time; every
// timing figure the same or better than before within a tolerance for noise; never a removed frame; realscene-lib's
// bounds (no runaway, the guard never tripped, no graphics context lost). A ⚡ fire or beat callback figure over its
// tolerance is "can't tell" (listed, not failed) when each one less its own delay after its drawn frame's cap slot
// (the box's load, measured in those very frames) is the same or better, as checks102 judges; else it fails.
// BEATLOAD110_REPORT = 1 reports without failing.
//   node dev/smoke.js --fake-mic --check-timeout 900000 --script dev/checks/beatload110.js --shot /tmp/beatload110.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { live: {}, video: {}, cantTell: [] }; const fail = [];
const mark = (what) => (out.marks ||= []).push(`${Math.round(performance.now() / 100) / 10}s ${what}`);
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const q = (a, p) => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : null; };
const stats = (a) => ({ n: a.filter(Number.isFinite).length, p50: r2(q(a, 0.5)), p95: r2(q(a, 0.95)), min: r2(q(a, 0)), max: r2(q(a, 1)) });
const FOOT = `${window.LABFRAMES_MEDIA || '/tmp/labframes-media'}/frames_a_30.mp4`; // (labframes-media: made by dev/run-checks.js)
const MIC = window.SMOKE_FAKE_MIC;
const { pv, pj, toPage } = RS;
const D = () => ThreeLab.director;

// the probe layer: everyBeats / onHit('kick') on live sound, the frames the footage presented
const PROBE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
renderer.setAnimationLoop(() => { const t = media.texture(); if (t && mat.map !== t) { mat.map = t; mat.needsUpdate = true; } mat.visible = Boolean(t); renderer.render(scene, cam); });
const P = window.__bl110 || (window.__bl110 = { on: false, every: [], kick: [], vf: [] });
everyBeats(1, (v) => { if (P.on) P.every.push([performance.now(), audio.beatPhase, v, audio.bpm]); });
onHit('kick', () => { if (P.on) P.kick.push(performance.now()); });
media.onFrame((n, t, meta) => { if (P.on && P.vf.length < 3000) P.vf.push([n, t, meta && meta.expectedDisplayTime || 0, performance.now()]); });`;

// (checks102's way) a comparison: after ≤ before + tol passes; over it but within what the load explains is "can't tell"
function same(where, what, b, a, tol, allow = 0, why = '') {
  const line = `${where}: ${what} the same or better (before ${b}, after ${a}, ± ${tol} ms)`;
  if (b == null || a == null) return ok(false, `${line}: not measured`);
  if (a <= b + tol) return true;
  if (allow > 0 && a <= b + tol + allow) { out.cantTell.push(`${line}: CAN'T TELL, ${r2(a - b - tol)} ms over ≤ ${r2(allow)} ms the load explains (${why})`); return true; }
  return ok(false, `${line}${allow > 0 ? ` (over by ${r2(a - b - tol)} ms, more than the ${r2(allow)} ms the load explains: ${why})` : ''}`);
}
const slotOf = (sl) => stats(sl.late || []);
const nn = (arr) => (arr || []).filter(Number.isFinite);
// events that run in drawn frames (⚡ fires, beat callbacks): over the tolerance, each one less its delay after its drawn
// frame's cap slot (the load: the frame came late, or ran late into its work) must be the same or better within it
// (bound: an event in the first drawn frame after its cause, less that frame's delay after its slot, is within one cap
// period of it, 16.7 ms: a figure over its tolerance whose events all are is the frames' delay, the load)
function sameEv(where, what, p, bv, bfr, av, afr, tol, bound = 1000 / 60) {
  const x = r2(q(nn(bv), p)); const y = r2(q(nn(av), p));
  const line = `${where}: ${what} the same or better (before ${x}, after ${y}, ± ${tol} ms)`;
  if (x == null || y == null) return ok(false, `${line}: not measured`);
  if (y <= x + tol) return true;
  const adj = (v, f) => (v || []).map((z, i) => (Number.isFinite(z) && Number.isFinite(f?.[i]) ? z - f[i] : NaN));
  const xa = r2(q(nn(adj(bv, bfr)), p)); const ya = r2(q(nn(adj(av, afr)), p));
  const fr = `their delay after their drawn frame's cap slot, ${p === 0.5 ? 'p50' : 'p95'} ${r2(q(nn(bfr), p))} → ${r2(q(nn(afr), p))} ms`;
  if (xa != null && ya != null && ya <= Math.max(xa, bound) + tol) { out.cantTell.push(`${line}: CAN'T TELL, ${r2(y - x - tol)} ms over; each one less its delay after its drawn frame's cap slot (the load: ${fr}): before ${xa}, after ${ya}, the same or better or within ${r2(bound)} ms of its cause (the first drawn frame after it)`); return true; }
  return ok(false, `${line}: ${r2(y - x - tol)} ms over, and each one less its delay after its drawn frame's cap slot still over (before ${xa}, after ${ya}, bound ${r2(bound)} ms; ${fr})`);
}

try {
  ok(MIC && MIC.bpm, `the fake microphone is set up (smoke.js --fake-mic: ${JSON.stringify(MIC)})`);
  await RS.install();
  activate('tool:three');
  const c = await ThreeLab.cmd();
  await wait(1500);
  out.info = await RS.open({ play: false });
  ok(out.info.layers.length >= 5 && out.info.model?.loaded, `the real scene is up (${JSON.stringify(out.info).slice(0, 300)})`);
  await D().addLayer({ name: 'Probe 110', code: PROBE, position: D().layers().layers.length - 1 }, 1);
  ok(await until(async () => (await pv('return Boolean(window.__bl110)')) === true, 15000), 'the probe layer runs');
  out.probe = await pj('({ screen: Boolean(window.__fps107 && window.__fps107.setHz), beat: Boolean(window.__labBeat && window.__labBeat.legacy110) })');
  ok(out.probe?.screen && out.probe?.beat, `the fake screen and window.__labBeat.legacy110 are in the preview (${JSON.stringify(out.probe)})`);

  // ---------------------------------------- live sound ----------------------------------------
  mark('live');
  const lv = await c.live('mic');
  out.live.started = lv;
  ok(lv === 'mic', `🎧 Live → Microphone started on the fake microphone (${lv})`);
  const tempo = await until(async () => { const b = await pj('({ bpm: audio.bpm, live: audio.live })'); return b && b.live && Math.abs(b.bpm - MIC.bpm) < 2 ? b : null; }, 40000, 500);
  out.live.tempo = tempo || (await pj('({ bpm: audio.bpm, live: audio.live })'));
  ok(tempo, `the live tempo locked on the loop's ${MIC?.bpm} BPM (${JSON.stringify(out.live.tempo)})`);
  async function liveRun(hz, legacy) {
    const R = {}; mark(`live ${hz} ${legacy ? 'before' : 'after'}`);
    await pv(`window.__labBeat.legacy110(${legacy}); window.__fps107.setHz(${hz}); window.__labPace.reset(); return 1`);
    await wait(2600); // (the gate learns the screen's frame over 2 s)
    await pv('window.__labBeat.log(true); window.__fps107.load && window.__fps107.load(); window.__bl110.every = []; window.__bl110.kick = []; window.__bl110.on = true; return 1');
    R.watch = await RS.watch(8000);
    await pv('window.__bl110.on = false; return 1');
    const w = R.watch;
    R.framesPerSec = w.page?.framesPerSec;
    const sl = (await pj('window.__labBeat.slots()')) || { t: [], late: [], gate: [] };
    R.drawnPerSec = r2(sl.t.length / w.s);
    R.perDrawn = r2(w.page.framesPerSec / Math.max(1, R.drawnPerSec));
    R.slots = { drawnLate: slotOf(sl), gateTimerLate: stats(sl.gate) };
    // the ⚡ kick's reaction: each fire − the first analysis frame over the bar since the one before it under the bar
    const fires = ((await pj('window.__labBeat.trigs()')) || []).filter((x) => x[0] === 'kick').map((x) => x[1]);
    const arr = (await pj('window.__labBeat.arrivals()')) || [];
    const thr = 0.5;
    const react = []; const reactAt = [];
    for (const f of fires) {
      let k = -1; for (let i = 0; i < arr.length && arr[i][0] <= f + 0.01; i += 1) k = i;
      let j = k; while (j > 0 && arr[j - 1][1] >= thr * 0.93) j -= 1; // (back to the first frame of this rise)
      while (j <= k && j >= 0 && arr[j][1] < thr) j += 1;
      if (j >= 0 && j <= k) { react.push(f - arr[j][0]); reactAt.push(f); }
    }
    // (each event's drawn frame: how late it came after its cap slot: the load, measured in the very frames)
    const frameOf = (now) => { let k = -1; for (let i = 0; i < sl.t.length && sl.t[i] <= now + 0.01; i += 1) k = i; return k < 0 || now - sl.t[k] > 100 ? null : r2(now - (sl.t[k] - sl.late[k])); }; // (its delay after its drawn frame's cap slot)
    R.kick = { fires: fires.length, arrivals: arr.length, reaction: stats(react), vals: react.map(r2), frames: reactAt.map(frameOf) };
    // everyBeats on the live tempo clock: how late after its beat (phase × period, ms)
    const P = (await pj('window.__bl110')) || { every: [], kick: [] };
    const per = 60000 / (MIC?.bpm || 125);
    R.everyBeat = stats(P.every.map((e) => (e[1] < 0.5 ? e[1] : e[1] - 1) * (e[3] > 0 ? 60000 / e[3] : per)));
    R.everyBeat.twice = P.every.filter((e, i) => i > 0 && e[2] === P.every[i - 1][2]).length;
    R.everyBeat.missed = P.every.filter((e, i) => i > 0 && e[2] - P.every[i - 1][2] > 1).length;
    R.everyBeat.back = P.every.filter((e, i) => i > 0 && e[2] < P.every[i - 1][2]).length;
    R.everyBeat.frames = P.every.map((e) => frameOf(e[0]));
    R.everyBeat.vals = P.every.map((e) => r2((e[1] < 0.5 ? e[1] : e[1] - 1) * (e[3] > 0 ? 60000 / e[3] : per)));
    R.onHitKick = P.kick.length;
    R.bpm = P.every.at(-1)?.[3] ?? null;
    R.load = await pj('window.__fps107.load ? window.__fps107.load() : null');
    console.log(`[BEATLOAD110] live ${hz} Hz ${legacy ? 'before' : 'after'}`, JSON.stringify({ ...R, watch: undefined, problems: RS.problems(w).length }));
    return R;
  }
  for (const hz of [240, 60]) {
    const order = hz === 240 ? [true, false] : [false, true];
    for (const legacy of order) out.live[`${hz} ${legacy ? 'before' : 'after'}`] = await liveRun(hz, legacy);
  }
  await pv('window.__labBeat.log(false); window.__labBeat.legacy110(false); return 1');
  await c.live('off');

  // ---------------------------------------- footage ----------------------------------------
  mark('footage');
  const r = await c.loadSong(FOOT);
  ok(r?.ok, `the footage loads (${JSON.stringify(r)})`);
  ok(await until(() => ThreeFrames.status().footage && ThreeFrames.clock && ThreeFrames.clock.source !== 'guess', 20000), `the footage's frame clock (${JSON.stringify(ThreeFrames.status())})`);
  const FPS = ThreeFrames.status().fps || 30; const fT = (n) => n / FPS;
  // (the footage's own sound: a 60 Hz thump every 0.5 s, softer than the scene's song: the ⚡ kick's bar lower, so the beat
  // rig's onHit('kick') runs on it as realscene-lib asks)
  await toPage({ type: 'triggers-set', cfg: { kick: { on: true, lo: 40, hi: 120, thr: 0.25, gap: 200, fade: 120 } } });
  // the parts (the Lab's own format, tools/three-frames.js sendCuts): six half-second parts with a second removed
  // between each, three frames held 0.25 s between them; looped (3.75 s a turn: ≈ 16 cuts and 8 holds a stretch)
  const HOLD = 0.25;
  const run = (a, b) => ({ a: fT(a), b: fT(b), speed: 1 }); const hold = (n) => ({ a: fT(n), b: fT(n + 1), hold: HOLD, speed: 1 });
  const PARTS = [run(0, 15), hold(20), run(30, 45), hold(50), run(60, 75), run(90, 105), hold(110), run(120, 135), run(150, 165)];
  const partOf = (n) => PARTS.findIndex((p) => (p.hold ? n === Math.round(p.a * FPS) : n >= Math.round(p.a * FPS) && n < Math.round(p.b * FPS)));
  const kept = (n) => partOf(n) >= 0;
  async function videoRun(hz, legacy) {
    const R = {}; mark(`footage ${hz} ${legacy ? 'before' : 'after'}`);
    c.play(false); await wait(300);
    await pv(`window.__labBeat.legacy110(${legacy}); window.__fps107.setHz(${hz}); window.__labPace.reset(); return 1`);
    await toPage({ type: 'media-cuts', parts: PARTS }); await toPage({ type: 'media', cmd: 'loop', value: true });
    c.seek(0); await wait(300); c.play(true);
    await wait(2600);
    await pv('window.__labBeat.log(true); window.__fps107.load && window.__fps107.load(); window.__bl110.vf = []; window.__bl110.on = true; return 1');
    R.watch = await RS.watch(10000);
    await pv('window.__bl110.on = false; return 1');
    const w = R.watch;
    const sl = (await pj('window.__labBeat.slots()')) || { t: [], late: [] };
    R.drawnPerSec = r2(sl.t.length / w.s);
    R.framesPerSec = w.page?.framesPerSec; R.perDrawn = r2(w.page.framesPerSec / Math.max(1, R.drawnPerSec));
    R.slots = { drawnLate: slotOf(sl), gateTimerLate: stats(sl.gate || []) };
    const vf = ((await pj('window.__bl110')) || { vf: [] }).vf;
    R.presented = vf.length; R.parts = (await pj('window.__labBeat.state()'))?.parts;
    R.removedSeen = [...new Set(vf.filter((x) => !kept(x[0])).map((x) => x[0]))];
    // seams: two presented frames in a row in different parts (a cut, a held frame's end, the loop back to the top).
    // A clean seam leaves on the part's last kept frame: its gap is the next part's first frame on screen − that one's −
    // one frame. Leaving earlier skips kept frames (counted: frames the decoder dropped inside a part are not seams)
    const seams = []; const holds = []; const early = [];
    const last = (i) => (PARTS[i].hold ? Math.round(PARTS[i].a * FPS) : Math.round(PARTS[i].b * FPS) - 1);
    for (let i = 1; i < vf.length; i += 1) {
      const [n0, , d0] = vf[i - 1]; const [n1, , d1] = vf[i];
      const p0 = partOf(n0); const p1 = partOf(n1);
      if (p0 < 0 || p1 < 0 || p0 === p1) continue;
      const gap = d1 && d0 ? d1 - d0 : vf[i][3] - vf[i - 1][3];
      if (PARTS[p0].hold) holds.push(gap - HOLD * 1000);
      else if (n0 === last(p0)) seams.push(gap - 1000 / FPS);
      else early.push([n0, n1, last(p0) - n0]);
    }
    R.seam = stats(seams); R.hold = stats(holds); R.cutEarly = early.slice(0, 8); R.cutEarlyFrames = early.reduce((x, e) => x + e[2], 0);
    R.seamsAll = seams.length + holds.length + early.length;
    // the page's side, from its own log (window.__labBeat.edges: 'part'): each part's end as it was acted on. A cut: how
    // long before its first removed frame was due on screen the page jumped (the timer the video's frame set: 1; a page
    // frame's look or a video frame already past it: 0 / 4); a held frame: how late after its end it was let go
    const ends = ((await pj('window.__labBeat.edges()')) || []).filter((e) => e[0] === 'part' && PARTS[e[4]]);
    const cutEnds = ends.filter((e) => !PARTS[e[4]].hold && e[3] != null); const holdEnds = ends.filter((e) => PARTS[e[4]].hold);
    // (a cut: how far before the part's end, on the video's own clock, the page jumped: ms of removed footage that
    // played when < 0)
    R.cutMargin = stats(cutEnds.map((e) => (PARTS[e[4]].b - e[3]) * 1000));
    R.cutLate = cutEnds.filter((e) => PARTS[e[4]].b - e[3] < 0).length;
    R.cutBy = { video: cutEnds.filter((e) => e[1] === 1).length, edge: cutEnds.filter((e) => e[1] === 5).length, frame: cutEnds.filter((e) => e[1] === 0).length, past: cutEnds.filter((e) => e[1] === 4).length };
    R.holdLate = stats(holdEnds.filter((e) => e[5] != null).map((e) => e[2] - e[5]));
    R.holdBy = { frame: holdEnds.filter((e) => e[1] === 0).length, timer: holdEnds.filter((e) => e[1] === 3).length };
    R.load = await pj('window.__fps107.load ? window.__fps107.load() : null');
    console.log(`[BEATLOAD110] footage ${hz} Hz ${legacy ? 'before' : 'after'}`, JSON.stringify({ ...R, watch: undefined, problems: RS.problems(w).length }));
    return R;
  }
  for (const hz of [240, 60]) {
    const order = hz === 240 ? [true, false] : [false, true];
    for (const legacy of order) out.video[`${hz} ${legacy ? 'before' : 'after'}`] = await videoRun(hz, legacy);
  }
  c.play(false);
  await toPage({ type: 'media', cmd: 'loop', value: false }); await toPage({ type: 'media-cuts', parts: null });
  await pv('window.__labBeat.log(false); window.__labBeat.legacy110(false); window.__fps107.setHz(240); return 1');

  // ---------------------------------------- budgets ----------------------------------------
  // What the load explains (checks102's way, as beat108 now judges): the ⚡ fires and beat callbacks run in drawn
  // frames; over the tolerance, each one less its own delay after its drawn frame's cap slot (sameEv) must still be
  // the same or better. With no allowance: the drawn frames' p50 after their slots (all frames: where the gate itself
  // would show), the gate's timer on time, no removed frame, the footage's cuts and held frames on the page's side,
  // the page frames per drawn one.
  for (const [part, runs] of [['live', out.live], ['footage', out.video]]) {
    for (const hz of [240, 60]) {
      const b = runs[`${hz} before`]; const a = runs[`${hz} after`]; const where = `${part}, ${hz} Hz`;
      if (!b || !a) { ok(false, `${where}: not measured`); continue; }
      for (const [k, x] of [['before', b], ['after', a]]) for (const p of RS.problems(x.watch, `${where} ${k}`)) fail.push(p);
      // (at 240 Hz, where the gate holds frames; at 60 Hz it never does: both stretches run the same code, and the drawn
      // frames' place after their slots is set by the fake 60 Hz screen's 62.5 ticks a second drifting against the cap)
      if (hz === 240) same(where, 'the drawn frames after their cap slot, p50', b.slots.drawnLate.p50, a.slots.drawnLate.p50, 1);
      else ok(!a.slots.gateTimerLate.n || a.slots.gateTimerLate.n <= 5, `${where}: the gate holds no frames on a 60 Hz screen (${a.slots.gateTimerLate.n} held)`);
      // (drawn frames a second while the screen gave frames: the real frames' stalls over 100 ms (the box's) left out of
      // the time; the fake screen, like a real one, has no frame to give then)
      const live = (R) => r2(R.drawnPerSec * R.watch.s / Math.max(1, R.watch.s - (R.load?.stallMs || 0) / 1000));
      ok(Math.abs(live(a) - live(b)) <= 6, `${where}: the same drawn frames a second while the screen gave frames (before ${live(b)}, after ${live(a)}; ${b.drawnPerSec} and ${a.drawnPerSec} over the whole stretch, real frames stalled ${b.load?.stallMs} and ${a.load?.stallMs} ms)`);
      if (part === 'live') {
        sameEv(where, 'the ⚡ kick\'s reaction (its fire − the sound\'s arrival), p50', 0.5, b.kick.vals, b.kick.frames, a.kick.vals, a.kick.frames, 2);
        sameEv(where, 'the ⚡ kick\'s reaction, p95', 0.95, b.kick.vals, b.kick.frames, a.kick.vals, a.kick.frames, 4);
        ok(a.kick.reaction.n >= 8 && a.kick.fires >= 0.7 * b.kick.fires, `${where}: the ⚡ kick fired on the loop's kicks (before ${b.kick.fires}, after ${a.kick.fires}; reactions ${a.kick.reaction.n})`);
        sameEv(where, 'everyBeats after its live beat, p50', 0.5, b.everyBeat.vals, b.everyBeat.frames, a.everyBeat.vals, a.everyBeat.frames, 3);
        sameEv(where, 'everyBeats after its live beat, p95', 0.95, b.everyBeat.vals, b.everyBeat.frames, a.everyBeat.vals, a.everyBeat.frames, 3);
        const odd = (R) => R.everyBeat.missed + R.everyBeat.twice + R.everyBeat.back;
        // (the live tempo clock moves its phase with the kicks it hears: a beat number can step by two or repeat when it
        // does, with the gate or without: compared, not zero)
        ok(a.everyBeat.n >= 12 && odd(a) <= odd(b) + 1, `${where}: every live beat called back, in order, as before (beats skipped / twice / back: before ${odd(b)}, after ${odd(a)}; ${JSON.stringify({ ...a.everyBeat, frames: undefined })})`);
        ok(Math.abs(a.bpm - (MIC?.bpm || 125)) < 2, `${where}: the live tempo held at the loop's ${MIC?.bpm} BPM (${a.bpm})`);
      } else {
        ok(!a.removedSeen.length && !b.removedSeen.length, `${where}: the sketch never got a removed frame (before ${JSON.stringify(b.removedSeen)}, after ${JSON.stringify(a.removedSeen)})`);
        ok(a.parts === PARTS.length && b.parts === PARTS.length, `${where}: the cut list was in the page all along (${b.parts}, ${a.parts} parts)`);
        ok(a.cutMargin.n >= 8 && a.holdLate.n >= 4, `${where}: the cuts and the held frames played (${a.cutMargin.n} cuts, ${a.holdLate.n} holds ended)`);
        // (a cut is timed from the video's own frames, and now from its clock on the edge timer too: as early before
        // the part's end, never later)
        ok(a.cutMargin.p50 != null && b.cutMargin.p50 != null && a.cutMargin.p50 >= b.cutMargin.p50 - 2, `${where}: each cut jumps as early before the part's end, p50 (before ${b.cutMargin.p50}, after ${a.cutMargin.p50} ms ahead, ± 2 ms)`);
        ok(a.cutMargin.min != null && b.cutMargin.min != null && a.cutMargin.min >= Math.min(0, b.cutMargin.min) - 2, `${where}: no cut later than before past the part's end (the earliest: before ${b.cutMargin.min}, after ${a.cutMargin.min} ms ahead, ± 2 ms)`);
        ok(a.cutLate <= b.cutLate, `${where}: no more cuts after the part's end than before (before ${b.cutLate} ${JSON.stringify(b.cutBy)}, after ${a.cutLate} ${JSON.stringify(a.cutBy)})`);
        same(where, 'each held frame let go after its end, p50', b.holdLate.p50, a.holdLate.p50, 1);
      }
    }
    const a240 = runs['240 after']; const b240 = runs['240 before'];
    if (a240 && b240) {
      ok(a240.perDrawn <= 2.6 && a240.drawnPerSec > 20, `${part}, 240 Hz: ≤ 2.6 page frames per drawn one with the gate (before ${b240.perDrawn}, after ${a240.perDrawn}; drawn ${a240.drawnPerSec}/s)`);
      ok(a240.slots.gateTimerLate.n > 50 && a240.slots.gateTimerLate.p95 <= 4, `${part}, 240 Hz: the frame gate's timer on time, p95 within its 4 ms of slack (${JSON.stringify(a240.slots.gateTimerLate)})`);
    }
  }
  out.table = [...Object.entries(out.live).filter(([, R]) => R && R.slots).map(([k, R]) => `live ${k}: page ${R.framesPerSec} frames/s for ${R.drawnPerSec} drawn (${R.perDrawn} per drawn) · drawn after slot p50 ${R.slots.drawnLate.p50} / p95 ${R.slots.drawnLate.p95} ms · ⚡ kick reaction p50 ${R.kick.reaction.p50} / p95 ${R.kick.reaction.p95} ms (${R.kick.fires} fires) · everyBeats p50 ${R.everyBeat.p50} / p95 ${R.everyBeat.p95} ms (${R.everyBeat.n}, ${R.bpm} BPM)`),
    ...Object.entries(out.video).filter(([, R]) => R && R.slots).map(([k, R]) => `footage ${k}: page ${R.framesPerSec} frames/s for ${R.drawnPerSec} drawn (${R.perDrawn} per drawn) · drawn after slot p50 ${R.slots.drawnLate.p50} / p95 ${R.slots.drawnLate.p95} ms · removed frames seen ${R.removedSeen.length} · cut jumps ${R.cutMargin.p50} ms (p50; min ${R.cutMargin.min}) before the part's end, ${R.cutLate} after it ${JSON.stringify(R.cutBy)} · held frame let go ${R.holdLate.p50} / max ${R.holdLate.max} ms late ${JSON.stringify(R.holdBy)} · on screen: seam p50 ${R.seam.p50} / p95 ${R.seam.p95} ms (${R.seam.n}), hold ${R.hold.min}…${R.hold.max} ms (${R.hold.n}) · kept frames skipped at cuts ${R.cutEarlyFrames} · presented ${R.presented}`)];
  for (const R of [...Object.values(out.live), ...Object.values(out.video)]) if (R && R.watch) R.watch = { page: R.watch.page, perFrame: R.watch.perFrame, guard: R.watch.guard && { tripped: R.watch.guard.tripped, peakLoopPerFrame: R.watch.guard.peakLoopPerFrame, peakLoopPerSec: R.watch.guard.peakLoopPerSec, limit: R.watch.guard.limit }, gateHeldPerSec: R.watch.gateHeldPerSec, loops: R.watch.loops, gl: R.watch.gl };
  await RS.close();
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
if (window.BEATLOAD110_REPORT) { out.unenforced = fail.splice(0); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
