// ▶ Play's frame rate with round 54's page scripts (round 54 fix, gamefps54): the owner's "play does look best but the
// framerate is abysmal". A throwaway HTML game that works like a real one: 160 boxes, a sun, a spot and a point light
// casting shadows (left at three's 512²), 6 projectiles a frame (each with its own cloned material, gone after 0.8 s),
// a spark group every 3rd frame, a decal showing a live data texture every 4th, a DataTexture and a CanvasTexture
// rewritten every frame, 2000 particles moved every frame, one file fetched once playing. Played through GameMode.play:
//   off      round 53's ▶ Play: no look, Loads during play off, no sound part (the baseline)
//   best     as it ships (Best look + Loads during play + the sound part), twice, alternating with off
//   look / stream / audio   each alone once (what each costs, for the report)
// Per frame inside the page: the main thread's frame (the game's callback), the time spent AROUND three's own render
// (what wraps renderer.render: the call minus scene.onBeforeRender → onAfterRender), the gaps between frames.
// Fails on the regression: Best's own work per frame over 2 % of the frame (0.1 ms floor: the page's clock is coarse),
// the steady per-frame objects held / hidden / compiled by Loads during play, a whole-scene look during
// play, shadow maps over 2048² (a point light over 1024²), frames slower than off.
// (round 57, framepace57) "frames slower than off" is judged inside each Best play: helpers on vs stepped aside in
// interleaved blocks (dev/framepace-verdict.js), with a self-test that injects 1 ms a frame and must be called slower.
//   node dev/smoke.js --check-timeout 1800000 --screen 960x600 --script dev/checks/gamefps54.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], runs: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 360000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 60000)} min`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const TMP = window.SMOKE_TMP || '/tmp'; // (round 56, fixes56) this run's own scratch folder (dev/smoke.js --tmp): two runs at once never share files
const DIR = `${TMP}/hearth-gamefps54`;
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);

// (round 57, framepace57) the game itself is dev/fixtures/gamefps54-game.html (dev/checks/framepace57.js plays it too)

// a steady window of play: 2.5 s in (Loads during play is on, the look's guard has decided), then 6 s measured
const MEASURE = `(async () => {
  const G = window.game;
  const L0 = window.__gameLook ? await window.__gameLook.settle() : null;
  const S0 = window.__gameStream ? window.__gameStream.report(0) : null;
  G.cpu.length = 0; G.over.length = 0; G.gaps.length = 0; G.calls.length = 0; const f0 = G.frames; const s0 = G.spawned;
  { const t0 = performance.now(); await new Promise((r) => { const f = () => (performance.now() - t0 < 6000 || (G.frames - f0 < 24 && performance.now() - t0 < 30000) ? setTimeout(f, 200) : r()); f(); }); } // (6 s, and ≥ 24 frames within 30 s: a machine loaded to ~1 frame a second)
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3) : null; };
  const mean = (a) => { const s = a.slice().sort((x, y) => x - y).slice(0, Math.max(1, Math.ceil(a.length * 0.95))); return +(s.reduce((x, y) => x + y, 0) / Math.max(1, s.length)).toFixed(4); }; // (the slowest 5 % left out: a garbage collection lands in any variant)
  const L = window.__gameLook ? window.__gameLook.report() : null; const S = window.__gameStream ? window.__gameStream.report(0) : null;
  return JSON.stringify({ frames: G.frames - f0, spawned: G.spawned - s0, cpu50: q(G.cpu, 0.5), cpu95: q(G.cpu, 0.95), overMean: mean(G.over), over50: q(G.over, 0.5), over95: q(G.over, 0.95), gap50: q(G.gaps, 0.5), gap95: q(G.gaps, 0.95), calls: mean(G.calls), live: G.live.length,
    shadows: { sun: G.sun.shadow.mapSize.x, spot: G.spot.shadow.mapSize.x, point: G.point.shadow.mapSize.x },
    look: L && { guard: L.guard, steps: L.guardMs && L.guardMs.steps, shadows: L.shadows, cost: L.cost, sweepsInWindow: L.cost.sweeps - (L0 ? L0.cost.sweeps : 0), wholesInWindow: L.cost.wholes == null ? null : L.cost.wholes - (L0 ? L0.cost.wholes : 0), screen: L.screen },
    stream: S && { on: S.on, active: S.activeAt != null, holdsInWindow: S.holds.n - (S0 ? S0.holds.n : 0), holds: S.holds, uploads: S.uploads, slices: S.slices, objects: S.loads.filter((l) => l.kind === 'object').length },
    audio: Boolean(window.__gameAudio) });
})()`;

// (round 57, framepace57) Best on vs stepped aside IN THE SAME PLAY, in interleaved blocks of frames (on/off, then
// off/on), playbudget's own switches: the look's hooks pass straight through and its shadow maps go back to the game's
// own 512² (the picture "off" draws), loads during play and the sound part step aside. Per block (after 3 frames not
// counted: maps swapped): the mean gap between the game's frames, the time around its render() (Hearth's hooks), its
// frame callback. dev/framepace-verdict.js judges the pairs. A pretend helper (window.__hearthTestCost) steps aside
// with the others: the self-test's injected 1 ms.
const AB = (pairs, capMs) => `(async () => {
  const G = window.game; const L = window.__gameLook && window.__gameLook.budget; if (!L) return 'null';
  const S = window.__gameStream && window.__gameStream.budget; const A = window.__gameAudio && window.__gameAudio.budget; const T = () => window.__hearthTestCost && window.__hearthTestCost.budget;
  const tm = (a) => { const s = a.slice().sort((x, y) => x - y).slice(0, Math.max(1, Math.ceil(a.length * 0.9))); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
  const frames = (n, ms) => new Promise((res) => { const f0 = G.frames; const t0 = performance.now(); const f = () => (G.frames - f0 < n && performance.now() - t0 < ms ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
  const set = (on) => { try { L.pause(!on); L.picture(on); } catch (e) {} try { S && S.pause(!on); } catch (e) {} try { A && A.pause(!on); } catch (e) {} try { T() && T().pause(!on); } catch (e) {} };
  const block = async (on) => {
    set(on); await frames(3, 4000);
    G.cpu.length = 0; G.over.length = 0; G.gaps.length = 0;
    await frames(10, 6000);
    return { gapMean: tm(G.gaps), over: tm(G.over), cpu: tm(G.cpu), n: G.gaps.length };
  };
  const out = []; const t0 = performance.now();
  try {
    for (let i = 0; i < ${pairs} && (i < 2 || performance.now() - t0 < ${capMs}); i += 1) { const onFirst = i % 2 === 0; const a = await block(onFirst); const b = await block(!onFirst); out.push(onFirst ? { on: a, off: b } : { on: b, off: a }); }
  } finally { set(true); }
  return JSON.stringify(out);
})()`;
// (the verdict runs in the game window through game:eval: the hub page's CSP allows no eval)
const VSRC = await window.hub.fs.read(`${window.SMOKE_DEV}/framepace-verdict.js`);
const judge = async (pairs, o = {}) => JSON.parse(await ev(`(() => { const module = { exports: {} }; ${VSRC}\n; return JSON.stringify(module.exports.judge(${JSON.stringify(pairs)}, ${JSON.stringify(o)})); })()`));
let VERDICT = null;
const INJECT = `(() => { const r = window.game.renderer; const r0 = r.render; let P = false; r.render = function () { if (!P) { const a = performance.now(); while (performance.now() - a < 1) { /* 1 ms */ } } return r0.apply(this, arguments); }; window.__hearthTestCost = { budget: { pause: (on) => { P = Boolean(on); } } }; return 1; })()`;
const AB_PAIRS = []; let SELF = null;

await Lazy.load('gamemode');
const FILE = `${DIR}/index.html`;
const src = { kind: 'html', path: FILE, title: 'Frame rate test' };
const SET = { off: { look: 'off', stream: false, audio: false }, best: { look: 'best', stream: true, audio: true }, look: { look: 'best', stream: false, audio: false }, stream: { look: 'off', stream: true, audio: false }, audio: { look: 'off', stream: false, audio: true } };
async function play(label) {
  const c = SET[label.replace(/\d$/, '')];
  store.set('gamemode.look', c.look); localStorage.setItem('gamestream.test', JSON.stringify({ off: !c.stream })); store.set('gameaudio.off', !c.audio);
  await GameMode.play(src);
  await until(async () => (await GW().state())?.playing, 60000);
  await until(() => ev('Boolean(window.game && window.game.frames > 10 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 120000);
  await wait(2500);
  const m = JSON.parse(await ev(MEASURE)); m.label = label;
  if (c.look === 'best' && c.stream) { // (round 57) the interleaved A/B, then (the second Best play) the self-test
    const ab = JSON.parse(await ev(AB(5, 150000))); if (Array.isArray(ab)) AB_PAIRS.push(...ab); m.ab = ab;
    if (label === 'best2') { VERDICT = await judge(AB_PAIRS); await ev(INJECT); const inj = JSON.parse(await ev(AB(4, 120000))); SELF = await judge(Array.isArray(inj) ? inj : [], { minPairs: 4 }); m.inj = inj; }
  }
  out.runs.push(m);
  await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800);
  return m;
}
await safe('fixture', async () => {
  const GAME = await window.hub.fs.read(`${window.SMOKE_DEV}/fixtures/gamefps54-game.html`);
  await window.hub.fs.write(FILE, GAME);
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`${THREE_DIR}/build/${f}`, `${DIR}/lib/${f}`);
  out.hashBefore = await window.hub.gameReady.hash([FILE]);
  step('fixture: a throwaway three.js game with steady per-frame work (projectiles, sparks, decals, live textures, particles) and three shadow lights', out.hashBefore?.[0]?.hash);
});
const R = {};
await safe('runs', async () => {
  for (const k of ['off1', 'best1', 'off2', 'best2', 'look', 'stream', 'audio']) R[k] = await play(k);
}, 1500000); // (round 57: the interleaved A/B in both Best plays; ≈ 1 frame a second under a load of 30)
store.set('gamemode.look', 'best'); localStorage.removeItem('gamestream.test'); store.set('gameaudio.off', false);

await safe('judge', async () => {
  const offs = [R.off1, R.off2].filter(Boolean); const bests = [R.best1, R.best2].filter(Boolean);
  const avg = (list, k) => list.reduce((s, x) => s + x[k], 0) / Math.max(1, list.length);
  const off = { cpu50: avg(offs, 'cpu50'), over: avg(offs, 'overMean'), gap50: avg(offs, 'gap50'), calls: avg(offs, 'calls') };
  const allow = Math.max(0.02 * off.cpu50, 0.1); // 2 % of the main thread's frame; the page's clock (100 µs steps) sets the floor
  const cost = (x) => x && +(x.overMean - off.over).toFixed(3);
  out.compare = { off, allowMs: +allow.toFixed(3), best: bests.map(cost), look: cost(R.look), stream: cost(R.stream), audio: cost(R.audio), pct: { best: bests.map((x) => +(100 * cost(x) / off.cpu50).toFixed(2)), look: R.look && +(100 * cost(R.look) / off.cpu50).toFixed(2), stream: R.stream && +(100 * cost(R.stream) / off.cpu50).toFixed(2), audio: R.audio && +(100 * cost(R.audio) / off.cpu50).toFixed(2) } };
  step('off: round 53\'s ▶ Play measured (no look, no Loads during play, no sound part)', offs.length === 2 && offs.every((x) => !x.look && x.frames > 20 && !x.audio), offs.map((x) => ({ frames: x.frames, cpu50: x.cpu50, overMean: x.overMean, gap50: x.gap50 })));
  step(`best: what wraps the game's render costs ≤ 2 % of its frame (≤ ${allow.toFixed(2)} ms; the two runs' mean)`, bests.length === 2 && (cost(bests[0]) + cost(bests[1])) / 2 <= allow, out.compare);
  for (const k of ['look', 'stream', 'audio']) step(`${k} alone: ≤ 2 % of the frame too`, R[k] && cost(R[k]) <= allow, { cost: cost(R[k]), allow: +allow.toFixed(3), cpu50: R[k]?.cpu50, overMean: R[k]?.overMean });
  const st = [...bests, R.stream].filter(Boolean).map((x) => x.stream);
  step('Loads during play never touches steady per-frame work: active, no projectile / spark / decal held (drawn hidden), compiled again or re-sent in strips', st.length === 3 && st.every((s) => s.on && s.active && s.holdsInWindow === 0 && s.slices.strips === 0), { stream: st, calls: { off: off.calls, best: bests.map((x) => x.calls) } });
  const lk = [...bests, R.look].filter(Boolean).map((x) => x.look);
  step('the look\'s own work in a frame of play is small: no whole-scene look in one frame while playing (what the game added that frame + a slice of the slow walk), the most a frame spent there under 2 ms', lk.length === 3 && lk.every((l) => l && l.wholesInWindow === 0 && (l.cost.playMax < 2 || l.cost.playMaxN <= 64)), lk.map((l) => l && { playMax: l.cost.playMax, objects: l.cost.playMaxN, max: l.cost.max, sweeps: l.cost.sweeps, inWindow: l.sweepsInWindow, wholes: l.wholesInWindow })); // (round 57, framepace57: a frame over 2 ms that looked at ≤ 64 objects — what the game added + a slice — was the machine pausing the page, read 2.4 / 8.5 ms under a load of 20–30)
  const sh = [...bests, R.look].filter(Boolean).map((x) => x.shadows);
  step('shadow maps at most 2048² (a point light at most 1024²: six faces), the guard\'s decision reported', sh.every((s) => s.sun <= 2048 && s.spot <= 2048 && s.point <= 1024), { shadows: sh, guard: lk.map((l) => l && { guard: l.guard, steps: l.steps, to: l.shadows?.to, screen: l.screen }) });
  // (round 57, framepace57) frames as fast as off: judged on the interleaved pairs of both Best plays (the separate
  // plays are minutes apart: off 100 vs best 116 / 133 ms on a loaded machine, gaps in whole refreshes here, with nothing
  // of Hearth's running per frame); the separate plays only as a gross guard (best within 2× off: a slowdown that stays
  // even with every helper stepped aside, round 54's "abysmal", still fails)
  const v = VERDICT || { ok: false, why: 'not judged (the second Best play did not get there)' };
  out.verdict = v;
  const gb = avg(bests, 'gap50');
  step('best: frames as fast as off (interleaved on / stepped aside in the same play, both Best plays: Hearth\'s work around the render within 2 % of the frame, the mean frame gap not slower beyond the noise and 5 % / 2 ms; the separate plays within 2×)', v.ok && gb <= off.gap50 * 2 + 17, { verdict: v, plays: { off: off.gap50, best: bests.map((x) => x.gap50) } });
  step('self-test: the same verdict on a pretend helper costing 1 ms a frame says "slower"', SELF && !SELF.ok && SELF.cpu && !SELF.cpu.ok, SELF);
});
await safe('files', async () => {
  const after = await window.hub.gameReady.hash([FILE]);
  step('files: the game\'s file byte for byte the same after seven plays', out.hashBefore && after?.[0]?.hash === out.hashBefore[0].hash, after);
});
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, compare: out.compare, verdict: out.verdict, selfTest: SELF, runs: out.runs }, null, 1);
