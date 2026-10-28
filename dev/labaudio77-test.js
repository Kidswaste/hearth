#!/usr/bin/env node
// (round 77, labaudio77) The Lab preview's song clock ("<avsync-core>" in tools/three-sandbox.html), run in Node on a
// simulated audio pipeline shaped like Chromium's (measured in the app on this machine: the song element's currentTime
// and the AudioContext's currentTime move in 10 ms steps, one per audio callback, stay the same within a task, and
// getOutputTimestamp says which context time reaches the speakers at which performance time):
//   · a sound card whose clock runs fast or slow (± 300 ppm: real ones are within ~50), callbacks of 10 ms with their
//     timestamps late by 0–2 ms, an output path of 40 ms (wired) or 220 ms (Bluetooth)
//   · frames at 60 / 120 / 144 / 240 Hz with ±15 % jitter, each one shown one screen frame after its frame time
// What it checks: the time the pictures use vs the time heard when the frame is shown stays within ±1 frame at 240 Hz
// (4.17 ms) after the first half second, over a whole 5-minute song, at every refresh rate and drift; it never goes
// backwards; a seek / loop wrap (the speakers still play the old spot for one output path), a hidden tab (no frames
// for 5 s), and the output device switched mid-play (headphones: 40 → 220 → 40 ms, the stream restarting after a
// silence) are back within ±1 frame by the third frame after the sound; without an output timestamp (the latency
// fallback) it stays within budget too. For comparison: what the page did before (the element's time read raw each
// frame: early by the output path, a 10 ms stair-step) and a clock on the frame time alone (drifts with the card).
//   node dev/labaudio77-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
const src = /\/\/ <avsync-core>[^\n]*\n([\s\S]*?)\/\/ <\/avsync-core>/.exec(html)?.[1];
let fails = 0;
const check = (ok, name, info) => { console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };
check(Boolean(src), 'the song clock core is in the sandbox');
if (!src) process.exit(1);
const avsyncCore = new Function(`${src}\nreturn avsyncCore;`)();
const C = avsyncCore();
const FRAME240 = 1000 / 240; // ms
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- the simulated pipeline ----------
// perf time T (ms). The card's clock runs in segments (a device switch stops it, then a new stream starts it again):
// τ(T) = seg.tau + (T − seg.T)/1000 · (1 + ppm·1e-6) s. A callback every 10 ms of card time renders the next 10 ms:
// actx.currentTime is the end of what was rendered, the song element's time steps with it (its position at that
// context time). The output timestamp: the context time at the speakers (L s behind), with the performance time of
// the callback (late by 0–2 ms of thread scheduling). A seek lands on the next callback's context time; what the
// speakers play is the context time L ago, through the song's position map.
function pipeline({ ppm = 0, L = 0.04, B = 0.01, rate = 1, T0 = 1000, jitterMs = 2, seed = 3 } = {}) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const k1 = 1 + ppm * 1e-6;
  const p = { L, B, rate, T0, clk: [{ T: T0, tau: 5 }], map: [{ c: 5, pos: 0 }], cb: null, cbKey: '', drop: null };
  const seg = (T) => { let g = p.clk[0]; for (const x of p.clk) if (x.T <= T) g = x; return g; };
  p.tau = (T) => { const g = seg(T); return T < g.T ? g.tau : g.tau + ((T - g.T) / 1000) * k1; };
  p.state = (T) => {
    const g = seg(T); const k = Math.max(0, Math.floor((p.tau(T) - g.tau) / p.B + 1e-9));
    const key = `${g.T}|${k}`;
    if (key !== p.cbKey) { p.cbKey = key; p.cb = { ctx: g.tau + (k + 1) * p.B, perf: g.T + ((k * p.B) / k1) * 1000 + rnd() * jitterMs, L: p.L }; }
    return p.cb;
  };
  p.posAtCtx = (c) => { let m = p.map[0]; for (const x of p.map) if (x.c <= c + 1e-12) m = x; return m.pos + (c - m.c) * p.rate; };
  p.read = (T) => { const cb = p.state(T); return { ctx: cb.ctx, pos: p.posAtCtx(cb.ctx), tsCtx: cb.ctx - p.B - cb.L, tsPerf: cb.perf }; };
  // what you hear at T (null: silence, the device restarting)
  p.heard = (T) => { const c = p.tau(T) - p.L; if (p.drop && T >= p.drop.T && c < p.drop.c - 1e-9) return null; return p.posAtCtx(c); };
  p.seek = (T, to) => { const c = p.state(T).ctx; p.map = p.map.filter((x) => x.c < c); p.map.push({ c, pos: to }); };
  // the output device switched: the old stream's buffer is dropped, the card's clock stops for `gap` s, a new stream
  // goes on from where the context had rendered to (its clock never goes back), with the new device's output path
  // an underrun: the card's callbacks late by `gap` s (a busy machine); nothing is dropped, the sound plays on that much later
  p.glitch = (T, { gap }) => { const c = p.tau(T); p.clk.push({ T: T + gap * 1000, tau: c }); p.cbKey = ''; };
  p.device = (T, { L: L2, gap }) => { const c = p.state(T).ctx; p.drop = { T, c }; p.clk.push({ T: T + gap * 1000, tau: c }); p.L = L2; p.cbKey = ''; };
  return p;
}
// the page's sampling (as the sandbox does it): the output timestamp's sample when it has one, else the element's time
// minus the latency (+ half a callback: it's read anywhere inside one)
function sampleOf(p, T, { ts = true } = {}) {
  const r = p.read(T);
  if (ts) return { x: r.tsPerf / 1000, y: r.pos - p.rate * (r.ctx - r.tsCtx), pos: r.pos };
  return { x: T / 1000, y: r.pos + (p.B / 2) * p.rate - p.rate * (p.L + p.B), pos: r.pos };
}
// a song played for `secs` at `hz`: per frame the clock is fed (when a new audio callback came) and read at the frame's
// show time; the errors (ms) after `settle` s, outside the first 2 frames after an event, where something is heard
function play({ hz = 240, secs = 300, ppm = 120, L = 0.04, ts = true, jitter = 0.15, settle = 0.5, events = [], seed = 5 } = {}) {
  const p = pipeline({ ppm, L, seed });
  const S = C.make();
  let s = seed + 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const step = 1000 / hz; let T = p.T0; let lastOut = -Infinity; let backwards = 0; let lastSeekT = -Infinity;
  const errs = []; const after = []; let ev = 0; let since = Infinity; let e0kind = ''; let lastFeedX = -1; const raw = []; const wall = []; let wall0 = null;
  while (T < p.T0 + secs * 1000) {
    T += step * (1 + (rnd() - 0.5) * 2 * jitter);
    const e = events[ev];
    if (e && T >= p.T0 + e.at * 1000) {
      ev += 1; since = 0; e0kind = e.kind;
      if (e.kind === 'seek') { p.seek(T, e.to); C.jump(S, true, e.to); lastSeekT = T; }
      if (e.kind === 'hidden') { T += e.ms; } // no frames meanwhile, the song plays on (nobody tells the clock)
      if (e.kind === 'device') p.device(T, e);
      if (e.kind === 'glitch') p.glitch(T, e);
    }
    const smp = sampleOf(p, T, { ts });
    if (smp.x !== lastFeedX) { C.feed(S, smp.x, smp.y, 1, smp.pos); lastFeedX = smp.x; }
    const show = T + step; // the frame is shown one screen frame later
    const t = C.read(S, show / 1000);
    if (t < lastOut - 1e-12 && T - lastSeekT > 400) backwards += 1; // (a seek back is allowed to go back)
    lastOut = t;
    const h = p.heard(show);
    if (h == null) { if (since !== Infinity) since = 0; continue; } // silence: counted from when the sound comes back
    const err = (t - h) * 1000;
    if (since !== Infinity) { since += 1; if (since <= 24) after.push({ n: since, err }); }
    if (T - p.T0 > settle * 1000 && !(since <= (e0kind === 'glitch' ? 19 : 2))) errs.push(err);
    raw.push((p.read(T).pos - h) * 1000);
    wall0 ||= { T: show, pos: h };
    wall.push(((wall0.pos + (show - wall0.T) / 1000) - h) * 1000);
  }
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
  const mean = errs.reduce((a, b) => a + b, 0) / (errs.length || 1);
  return { n: errs.length, max: r2(abs.at(-1) ?? 0), p99: r2(q(abs, 0.99) ?? 0), mean: r2(mean), backwards, after, raw: { mean: r2(raw.reduce((a, b) => a + b, 0) / raw.length), spread: r2(Math.max(...raw) - Math.min(...raw)) }, wallEnd: r2(wall.at(-1)) };
}
const fromThird = (r) => r.after.filter((a) => a.n >= 3).map((a) => Math.abs(a.err));

// ---------- 1. the offset budget at every refresh rate, a whole 5-minute song ----------
{
  let worst = 0; let back = 0; const rows = [];
  for (const hz of [60, 120, 144, 240]) {
    for (const ppm of [-300, 0, 120, 300]) {
      const r = play({ hz, ppm, secs: 300 });
      worst = Math.max(worst, r.max); back += r.backwards;
      if (hz === 240) rows.push({ ppm, maxMs: r.max, p99Ms: r.p99, meanMs: r.mean });
    }
  }
  check(worst <= FRAME240, '16 runs (60 / 120 / 144 / 240 Hz × −300 / 0 / +120 / +300 ppm), 5 min each: the pictures within ±1 frame at 240 Hz (4.17 ms) of what is heard', { worstMs: r2(worst), at240: rows });
  check(back === 0, '…and the time never goes backwards', back);
}
// what it replaces: the raw element time (the page before this round) and a frame-time clock
{
  const r = play({ hz: 240, ppm: 300, secs: 300 });
  check(r.raw.mean > 30 && r.raw.spread >= 9, 'before: the raw element time ran ~40 ms ahead of the speakers with a 10 ms stair-step (what this fixes)', r.raw);
  check(Math.abs(r.wallEnd) > 60, 'a clock on frame time alone drifts with the sound card: 300 ppm × 5 min ≈ 90 ms (why the speed is fitted)', { driftMs: r.wallEnd });
}
// Bluetooth headphones: 220 ms of output path
{
  const r = play({ hz: 240, ppm: 80, L: 0.22, secs: 120 });
  check(r.max <= FRAME240, 'Bluetooth output (220 ms): still within ±1 frame (the output timestamp carries the delay)', { maxMs: r.max, rawAheadMs: r.raw.mean });
}

// ---------- 2. seek / loop, a hidden tab ----------
{
  const r = play({ hz: 240, ppm: 150, secs: 30, events: [{ at: 6, kind: 'seek', to: 95.5 }, { at: 12, kind: 'seek', to: 3.25 }, { at: 18, kind: 'seek', to: 3.2 }, { at: 24, kind: 'seek', to: 40 }] });
  const third = fromThird(r);
  check(r.max <= FRAME240 && Math.max(...third) <= FRAME240, 'seeks forward, back, a tiny 50 ms one back (a loop wrap) and one more: on what\'s heard from the 3rd frame after (the old spot while the speakers still play it)', { maxMs: r.max, worstFrom3rdMs: r2(Math.max(...third)) });
}
{
  const r = play({ hz: 240, ppm: 150, secs: 30, L: 0.22, events: [{ at: 6, kind: 'seek', to: 95.5 }, { at: 12, kind: 'seek', to: 3.25 }] });
  const all = r.after.map((a) => Math.abs(a.err));
  check(Math.max(...all) <= FRAME240, 'with Bluetooth (220 ms) a seek shows the old spot for 220 ms, then the new one: on time every frame', { worstMs: r2(Math.max(...all)) });
}
{
  const r = play({ hz: 240, ppm: 150, secs: 30, events: [{ at: 8, kind: 'hidden', ms: 5000 }] });
  const third = fromThird(r);
  check(r.max <= FRAME240 && Math.max(...third) <= FRAME240, 'a hidden tab (no frames for 5 s, the song plays on): on time from the 3rd frame back', { maxMs: r.max, worstFrom3rdMs: r2(Math.max(...third)) });
}

// ---------- 3. the output device switched mid-play ----------
{
  const r = play({ hz: 240, ppm: 60, secs: 30, events: [{ at: 10, kind: 'device', L: 0.22, gap: 0.03 }, { at: 20, kind: 'device', L: 0.04, gap: 0.02 }] });
  const third = fromThird(r);
  check(r.max <= FRAME240 && Math.max(...third) <= FRAME240, 'headphones plugged / unplugged mid-play (40 → 220 → 40 ms, the stream restarting): on what\'s heard from the 3rd frame after the sound is back', { maxMs: r.max, worstFrom3rdMs: r2(Math.max(...third)) });
  check(r.backwards === 0, '…without the picture stepping back (it holds while the longer path fills)', r.backwards);
}

// ---------- 3b. underruns: the sound slips 12–30 ms late (under the 50 ms jump) ----------
{
  const r = play({ hz: 240, ppm: 60, secs: 30, events: [{ at: 5, kind: 'glitch', gap: 0.012 }, { at: 10, kind: 'glitch', gap: 0.03 }, { at: 15, kind: 'glitch', gap: 0.02 }] });
  // (the sound stops for the slip and the samples with it: back on it 3 audio callbacks after it plays again, ≤ 80 ms)
  const late = r.after.filter((a) => a.n >= 20).map((a) => Math.abs(a.err));
  check(Math.max(...late) <= FRAME240 && r.max <= FRAME240 && r.backwards === 0, 'the sound slipping 12 / 30 / 20 ms late (an underrun on a busy machine): on what\'s heard again within 80 ms (3 audio callbacks after it plays on), never backwards', { worstFrom20thMs: r2(Math.max(...late)), maxMs: r.max });
}

// ---------- 4. without an output timestamp: the latency fallback ----------
{
  let worst = 0; for (const hz of [60, 144, 240]) for (const ppm of [-200, 150]) worst = Math.max(worst, play({ hz, ppm, secs: 120, ts: false }).max);
  check(worst <= FRAME240, 'no output timestamp (base + output latency instead): worst error ≤ 4.17 ms', { worstMs: r2(worst) });
}

// ---------- 5. the core alone: speed fitted, starts, nothing allocated ----------
{
  const S = C.make(); let snaps = 0;
  for (let i = 0; i < 2000; i += 1) snaps += C.feed(S, i * 0.01, 10 + i * 0.01 * 1.0003, 1, 10);
  check(Math.abs(S[C.I.B] - 0.0003) < 2e-5 && snaps === 1, 'a clock 300 ppm fast: its speed is fitted (0.03 %), one start', { b: S[C.I.B], snaps });
  const n0 = S[C.I.SNAPS];
  C.feed(S, 20.01, 50, 1, 50);
  check(S[C.I.SNAPS] === n0 + 1 && C.read(S, 20.01) === 50, 'a sample far off the line (a seek nobody announced) starts over there');
  C.feed(S, 20.02, 50.01, 1, 50.01); C.feed(S, 20.03, 50.02, 1.5, 50.02);
  check(S[C.I.RATE] === 1.5 && S[C.I.SNAPS] === n0 + 2, 'a new playback speed starts over at that speed');
  const S2 = C.make(); C.feed(S2, 1, 4.96, 1, 5);
  check(C.read(S2, 1.01) === 5 && C.read(S2, 1.05) > 5, 'play from pause: holds on the start until the sound reaches the speakers, then moves', [C.read(S2, 1.01)]);
  // (what stays after a collection: nothing kept per sample)
  let kept = Infinity;
  try {
    require('v8').setFlagsFromString('--expose-gc'); const gc = require('vm').runInNewContext('gc');
    gc(); const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 2e5; i += 1) { C.feed(S2, 1 + i * 0.004, 5 + i * 0.004, 1, 5); C.read(S2, 1.004 + i * 0.004); }
    gc(); kept = process.memoryUsage().heapUsed - h0;
  } catch { /* no gc here */ }
  check(kept < 256 * 1024, '200 000 samples and reads: nothing kept (the state is one Float64Array)', { keptBytes: kept });
}

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
