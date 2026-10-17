// Does ▶ Play's Best look cost the owner's game frames? (round 57, framepace57) gamefps54's "best: frames as fast as off"
// compared two separate plays minutes apart and failed about half the time on a loaded machine (off 100 ms, best 116 /
// 133 ms: frame gaps here come in whole refreshes). This measures it properly, INSIDE ONE Best play, in interleaved
// blocks of frames with Hearth's helpers in different states (playbudget's own switches: tools/playbudget-page.js):
//   all       as it ships (the look's hooks, its shadow picture, loads during play, the sound part)
//   none      every helper stepped aside, the shadow maps at the game's own 512² (what "off" draws)
//   -picture  all, but the shadow maps at the game's own 512² (the look's GPU-side cost: bigger maps drawn each frame)
//   -look     all, but the look's hooks stepped aside (its CPU work in the frame; the picture kept)
//   -stream   all, but loads during play stepped aside
//   -audio    all, but the sound part's Long Animation Frames watch disconnected
// The order of the conditions is shuffled in every round (a busy moment falls on any of them), the frames right after a
// switch are skipped (maps swapped), and per block: the gaps between the game's frames, its frame callback's CPU time,
// the time around three's render (what wraps renderer.render: Hearth's hooks) and inside it (three's own work), and the
// CPU time of the GPU process and of the game's page process a frame (app.getAppMetrics through power:test): on this
// machine the "graphics card" is SwiftShader, which draws on the GPU process' CPU threads, so its CPU time IS the
// picture's cost (EXT_disjoint_timer_query isn't there). Per condition, the difference to the paired "all" block of the
// same round: median and a bootstrap 95 % interval of the mean across rounds.
// Then the same comparisons against two separate "off" plays (round 53's ▶ Play, before and after): what remains of
// Hearth even when every helper is stepped aside (getting ready's retired hooks, the watch, wrappers passing through).
// A last section injects a deliberate 1 ms of per-frame work as a pretend helper that steps aside like the real ones,
// and checks the verdict gamefps54 now uses (dev/checks/gamefps54.js: Verdict) calls it slower, and the real helpers not.
//   node dev/smoke.js --check-timeout 1800000 --screen 960x600 --script dev/checks/framepace57.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], plays: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after 16 min`)), 960000))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
const TMP = window.SMOKE_TMP || '/tmp';
const DIR = `${TMP}/hearth-framepace57`;
const THREE_DIR = '/opt/cdn-cache/three@0.186.1/package';
const GW = () => window.hub.game;
const ev = async (code) => { const r = await GW().eval(code); if (r?.error) throw new Error(r.error); return r?.value; };
await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
const ROUNDS = 10; const ROUND_MS = 7 * 60000; // (rounds until 7 min: on a machine loaded to ~1 frame a second, fewer)

// the page side (installed once per play through game:eval): the switches, and one block's numbers
const PAGE = `(() => {
  if (window.__fp57) return 'ok';
  const G = window.game;
  const L = () => window.__gameLook && window.__gameLook.budget; const S = () => window.__gameStream && window.__gameStream.budget; const A = () => window.__gameAudio && window.__gameAudio.budget;
  const T = () => window.__hearthTestCost && window.__hearthTestCost.budget; // (the self-test's pretend helper)
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
  const tm = (a) => { const s = a.slice().sort((x, y) => x - y).slice(0, Math.max(1, Math.ceil(a.length * 0.9))); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; }; // (mean without the slowest 10 %: a GC lands anywhere)
  const frames = (n, ms) => new Promise((res) => { const f0 = G.frames; const t0 = performance.now(); const f = () => (G.frames - f0 < n && performance.now() - t0 < ms ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
  let f0 = 0; let t0 = 0;
  window.__fp57 = {
    set: async (c, skip) => {
      const on = (k) => c === 'all' ? true : c === 'none' ? false : c !== '-' + k;
      try { L() && L().pause(!on('look')); } catch (e) {}
      try { L() && L().picture(on('picture')); } catch (e) {}
      try { S() && S().pause(!on('stream')); } catch (e) {}
      try { A() && A().pause(!on('audio')); } catch (e) {}
      try { T() && T().pause(!on('test')); } catch (e) {}
      await frames(skip == null ? 3 : skip, 4000);
      G.cpu.length = 0; G.over.length = 0; G.inner.length = 0; G.gaps.length = 0; f0 = G.frames; t0 = performance.now();
      return f0;
    },
    stop: () => {
      const r = { n: G.frames - f0, ms: performance.now() - t0, gapMean: tm(G.gaps), gap50: q(G.gaps, 0.5), cpu: tm(G.cpu), cpu50: q(G.cpu, 0.5), over: tm(G.over), inner: tm(G.inner), frames: G.frames };
      return JSON.stringify(r);
    },
    frames: () => G.frames,
    wait: (n, ms) => frames(n, ms).then(() => G.frames),
  };
  return 'ok';
})()`;

await Lazy.load('gamemode'); await Lazy.load('gameperf'); // (gameperf in: ▶ Play hands it the window, dormant since round 57)
const FILE = `${DIR}/index.html`;
const src = { kind: 'html', path: FILE, title: 'Frame pace test' };
// CPU seconds of the GPU process and of the game window's page process (power:test, tests only)
async function cpu() {
  const m = (await window.hub.power.test({ metrics: true }))?.metrics;
  if (!m) return null;
  const page = (m.pages || []).find((p) => /^hearth-game:/.test(p.url));
  const by = (pid) => m.procs.find((p) => p.pid === pid)?.cpuS ?? null;
  const gpu = m.procs.filter((p) => p.type === 'GPU').reduce((a, p) => a + (p.cpuS || 0), 0);
  return { gpu, page: page ? by(page.pid) : null, at: performance.now() };
}
async function start(look, stream, audio) {
  store.set('gamemode.look', look); localStorage.setItem('gamestream.test', JSON.stringify({ off: !stream })); store.set('gameaudio.off', !audio);
  await GameMode.play(src);
  await until(async () => (await GW().state())?.playing, 60000);
  await until(() => ev('Boolean(window.game && window.game.frames > 10 && (!window.__gameReady || JSON.parse(window.__gameReady.pub()).phase === "playing"))'), 120000);
  // the look's guard decides once (≥ 10 s of frames missing the refresh here: it tries the fallback size, keeps it or
  // not); measured after, so the shadow size doesn't change under the blocks
  if (look !== 'off') await until(() => ev('window.__gameLook ? !["waiting", "measuring", "tight", "trying"].includes(window.__gameLook.report().guard) : true'), 30000);
  else await wait(6000);
  await ev(PAGE);
}
async function leave() { await GameMode.leave(); await until(async () => !(await GW().state())?.playing, 10000); await wait(800); }
// one block: the switches set, skip frames, then N frames measured with the processes' CPU time around them
async function block(c, N = 10) {
  await ev(`window.__fp57.set(${JSON.stringify(c)})`);
  const a = await cpu(); const fa = await ev('window.__fp57.frames()');
  await ev(`window.__fp57.wait(${N}, 6000)`);
  const b = await cpu(); const fb = await ev('window.__fp57.frames()');
  const r = JSON.parse(await ev('window.__fp57.stop()'));
  const n = Math.max(1, fb - fa);
  r.gpuMs = a && b ? ((b.gpu - a.gpu) * 1000) / n : null; r.pageMs = a && b && a.page != null && b.page != null ? ((b.page - a.page) * 1000) / n : null;
  r.c = c;
  return r;
}
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// statistics: per round, cond − all; across rounds the median and a bootstrap 95 % interval of the mean
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
function boot(d, n = 2000) { const x = d.filter(Number.isFinite); if (x.length < 3) return null; const m = []; for (let i = 0; i < n; i += 1) { let s = 0; for (let k = 0; k < x.length; k += 1) s += x[Math.floor(Math.random() * x.length)]; m.push(s / x.length); } m.sort((a, b) => a - b); return [+m[Math.floor(n * 0.025)].toFixed(3), +m[Math.floor(n * 0.975)].toFixed(3)]; }
const KEYS = ['gapMean', 'gap50', 'cpu', 'over', 'inner', 'gpuMs', 'pageMs'];
function compare(rounds, a, b) { // b − a per round (both measured in the same round)
  const o = {};
  for (const k of KEYS) { const d = rounds.map((r) => (r[b] && r[a] && r[b][k] != null && r[a][k] != null ? r[b][k] - r[a][k] : NaN)).filter(Number.isFinite); o[k] = { med: d.length ? +med(d).toFixed(3) : null, mean: d.length ? +mean(d).toFixed(3) : null, ci: boot(d), n: d.length }; }
  return o;
}
const avgOf = (rounds, c) => { const o = {}; for (const k of KEYS) { const v = rounds.map((r) => r[c]?.[k]).filter(Number.isFinite); o[k] = v.length ? +mean(v).toFixed(3) : null; } return o; };

await safe('fixture', async () => {
  const html = await window.hub.fs.read(`${window.SMOKE_DEV}/fixtures/gamefps54-game.html`);
  await window.hub.fs.write(FILE, html);
  for (const f of ['three.module.js', 'three.core.js']) await window.hub.fs.copy(`${THREE_DIR}/build/${f}`, `${DIR}/lib/${f}`);
  step('fixture: gamefps54\'s throwaway game (steady per-frame work, three shadow lights)', /renderer\.setAnimationLoop/.test(html || ''));
});

// an "off" play (round 53's ▶ Play): the same blocks, nothing to switch
async function offPlay(label) {
  await start('off', false, false);
  const bl = []; for (let i = 0; i < 4; i += 1) bl.push(await block('all'));
  await leave();
  const o = { label, blocks: bl, avg: avgOf(bl.map((b) => ({ x: b })), 'x') };
  out.plays.push(o); return o;
}
const CONDS = ['all', 'none', '-picture', '-look', '-stream', '-audio'];
let off1 = null; let off2 = null; let best = null;
await safe('off before', async () => { off1 = await offPlay('off1'); });
await safe('best, interleaved', async () => {
  await start('best', true, true);
  const info = JSON.parse(await ev('JSON.stringify({ look: window.__gameLook && window.__gameLook.report(), budget: window.__hearthBudget && JSON.parse(window.__hearthBudget.pub()), ready: window.__gameReady && JSON.parse(window.__gameReady.pub()).first5 })'));
  const probeIn = await ev('Boolean(window.__gamePerf)'); // (round 57: GamePerf has the window, the probe stays out until asked)
  const rounds = [];
  const T0 = Date.now();
  for (let i = 0; i < ROUNDS && (i < 4 || Date.now() - T0 < ROUND_MS); i += 1) { const r = {}; for (const c of shuffle(CONDS)) r[c] = await block(c); rounds.push(r); }
  await ev('window.__fp57.set("all", 0)');
  // the picture on the graphics card, frame by frame: the game's scene drawn and waited for to the end (readPixels: on
  // SwiftShader the drawing IS the wait), the look's shadow maps at its size / at the game's own 512², alternating ABBA
  // at every frame (a pointer swap: both sizes' maps were made under the card), so the machine's load cancels pair by pair
  // the picture on the graphics card: the game's own loop held, its scene drawn by the check in batches of 6 frames,
  // each waited for to the end (readPixels), the look's shadow maps at its size / at the game's own 512² (a pointer
  // swap: both were made under the card), batches alternating ABBA. Per batch the CPU time of the GPU process (where
  // SwiftShader draws) and the wall time, per frame: CPU time is the work done whatever else the machine runs (a
  // thread waiting for a core uses none), so it stays honest at a load of 30 where wall times swing 2×
  const PIC = (on) => `(() => { const G = window.game; G.hold = true; window.__gameLook.budget.picture(${on}); const r = G.renderer; const gl = r.getContext(); const px = new Uint8Array(4);
    window.__fpOne = () => { const a = performance.now(); r.render(G.scene, G.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - a; };
    window.__fpOne(); window.__fpOne(); return 1; })()`;
  const pic = [];
  const TP = Date.now();
  for (let i = 0; i < 12 && (i < 6 || Date.now() - TP < 150000); i += 1) {
    const v = {};
    for (const on of i % 2 ? [false, true] : [true, false]) {
      await ev(PIC(on));
      const a = await cpu();
      const w = JSON.parse(await ev('JSON.stringify([0, 1, 2, 3, 4, 5].map(() => window.__fpOne()))'));
      const b = await cpu();
      v[on ? 'on' : 'off'] = { gpu: a && b ? ((b.gpu - a.gpu) * 1000) / 6 : null, page: a && b && a.page != null ? ((b.page - a.page) * 1000) / 6 : null, wall: med(w) };
    }
    pic.push(v);
  }
  await ev('(() => { window.game.hold = false; window.__gameLook.budget.picture(true); return 1; })()');
  // the performance probe as it ran in every ▶ Play before round 57 (once GamePerf had loaded): put in, its own
  // accounting read after ~20 frames (its per-frame timestamps and wrappers; its rAF of its own runs even when paused)
  await GamePerf.attach({ exec: async (e) => ev(e) }, { label: 'Frame pace test', kind: 'html', hz: 60, key: false });
  await ev('window.__fp57.wait(20, 30000)');
  const probe = JSON.parse(await ev('JSON.stringify({ cost: window.__gamePerf.cost(), budget: JSON.parse(window.__hearthBudget.pub()).helpers.perf || null })'));
  await ev('window.__gamePerf.budget.off("asked")');
  // the self-test: a pretend helper that costs 1 ms a frame inside the game's render (where the look's hooks run) and
  // steps aside like the real ones (pause): the verdict must call it slower
  await ev(`(() => { const r = window.game.renderer; const r0 = r.render; let P = false; r.render = function () { if (!P) { const a = performance.now(); while (performance.now() - a < 1) { /* 1 ms */ } } return r0.apply(this, arguments); }; window.__hearthTestCost = { budget: { pause: (on) => { P = Boolean(on); } } }; return 1; })()`);
  const inj = [];
  for (let i = 0; i < 6 && (i < 4 || Date.now() - T0 < ROUND_MS + 120000); i += 1) { const r = {}; for (const c of (i % 2 ? ['none', 'all'] : ['all', 'none'])) r[c] = await block(c); inj.push(r); }
  const L = JSON.parse(await ev('JSON.stringify(window.__gameLook.report())'));
  const bud = JSON.parse(await ev('window.__hearthBudget.pub()'));
  await leave();
  best = { info, rounds, inj, pic, probeIn, probe, budget: bud, look: { guard: L.guard, now: L.shadows.now, to: L.shadows.to, chosen: L.shadows.chosen, fallback: L.shadows.fallback, made: L.shadows.made, midPlay: L.shadows.midPlay, cost: L.cost } };
});
await safe('off after', async () => { off2 = await offPlay('off2'); });
store.set('gamemode.look', 'best'); localStorage.removeItem('gamestream.test'); store.set('gameaudio.off', false);

await safe('verdict', async () => {
  const R = best.rounds;
  out.best = { look: best.look, ab: best.info?.budget?.ab && { shadow: best.info.budget.ab.shadow, judge: best.info.budget.ab.judge, on: best.info.budget.ab.on, off: best.info.budget.ab.off }, avg: Object.fromEntries(CONDS.map((c) => [c, avgOf(R, c)])) };
  // all − cond: what that part costs (the cond has it stepped aside)
  out.cost = {}; for (const c of CONDS.slice(1)) { const d = compare(R, c, 'all'); out.cost[c === 'none' ? 'everything' : c.slice(1)] = d; }
  const offAvg = off1 && off2 ? Object.fromEntries(KEYS.map((k) => [k, +mean([off1.avg[k], off2.avg[k]].filter(Number.isFinite)).toFixed(3)])) : null;
  out.off = { off1: off1?.avg, off2: off2?.avg, mean: offAvg };
  // what remains with every helper stepped aside, against the separate off plays (minutes apart: rough)
  out.leftover = offAvg && Object.fromEntries(KEYS.map((k) => [k, +(out.best.avg.none[k] - offAvg[k]).toFixed(3)]));
  out.injected = compare(best.inj, 'none', 'all');
  // the picture: per pair on − off of a frame drawn to the end
  const P = (k) => { const d = best.pic.map((p) => p.on[k] - p.off[k]).filter(Number.isFinite); const o = best.pic.map((p) => p.off[k]).filter(Number.isFinite); return { offMs: +med(o).toFixed(2), onMs: +med(best.pic.map((p) => p.on[k]).filter(Number.isFinite)).toFixed(2), med: +med(d).toFixed(2), mean: +mean(d).toFixed(2), ci: boot(d), pct: +((100 * mean(d)) / mean(o)).toFixed(1), slowerIn: `${d.filter((x) => x > 0).length}/${d.length}` }; };
  out.picture = { pairs: best.pic.length, size: best.look.now, gpu: P('gpu'), wall: P('wall'), page: P('page') };
  out.budget = best.budget && { totalMs: best.budget.totalMs, avgMs: best.budget.avgMs, helpers: best.budget.helpers, off: best.budget.off };
  step('measured: every condition in every round (at least 4 rounds)', R.length >= 4 && R.every((r) => CONDS.every((c) => r[c] && r[c].n >= 3)), { rounds: R.length, short: R.flatMap((r) => CONDS.filter((c) => !(r[c]?.n >= 6))).length });
  step('the performance probe is not in the game window until asked (GamePerf has the window dormant)', best.probeIn === false, { probeIn: best.probeIn, probeWhenIn: best.probe });
  out.probe = best.probe;
  step('the picture measured on the graphics card (≥ 6 ABBA pairs of 6-frame batches)', best.pic.length >= 6 && Number.isFinite(out.picture.gpu.med), out.picture);
  step('the GPU process\' CPU time a frame was read (SwiftShader draws there)', R.every((r) => Number.isFinite(r.all.gpuMs) && r.all.gpuMs > 0), out.best.avg.all);
  // the injected 1 ms: seen in the time around the render (≈ 1 ms), the real helpers not
  const ij = out.injected.over; const ev0 = out.cost.everything.over;
  step('the self-test\'s 1 ms a frame shows around the render (0.7–1.5 ms, interval above 0.5 ms)', ij.med > 0.7 && ij.med < 1.5 && ij.ci && ij.ci[0] > 0.5, out.injected);
  step('the real helpers\' own CPU around the render stays under 0.1 ms', ev0.med != null && ev0.med < 0.1, ev0);
});
const bad = out.steps.filter((s) => !s.ok);
return JSON.stringify({ pass: bad.length === 0, failed: bad.map((s) => s.name), steps: out.steps, picture: out.picture, probe: out.probe, budget: out.budget, cost: out.cost, injected: out.injected, best: out.best, off: out.off, leftover: out.leftover, rounds: best?.rounds?.map((r) => Object.fromEntries(Object.entries(r).map(([c, b]) => [c, { g: +b.gapMean.toFixed(1), cpu: +b.cpu.toFixed(2), over: +b.over.toFixed(3), inner: +b.inner.toFixed(2), gpu: b.gpuMs == null ? null : +b.gpuMs.toFixed(1), n: b.n }]))) }, null, 1);
