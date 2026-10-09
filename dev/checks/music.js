// The Lab's music side (round 5): analysis in a Worker, tempo / bar 1 / sections / drops / hits on a synthetic song
// with known answers, "Mark kicks for me", the tap that learns (lock, half-time, tap the 1), nudge by ear, the
// 3-band waveform and section bands (pictures), the trigger preset picked from the song, "Make it react", the live
// latency calibration math, every new chat command, no duplicate commands, and how smooth it stays (long tasks
// while analysing, paint / raster while playing, through smoke({ trace })).
//   node dev/smoke.js --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/music.js --shot /tmp/music.png
// Pictures go to window.JOURNEY_SHOTS (default /tmp): timeline whole song, zoomed in, after "Mark kicks".
const { wait, until, step, shot, key } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const SONG = '/tmp/hearth-music-check.wav';
const BPM = 126; const PICK = 1; const LEAD = 0.21;
const beat = 60 / BPM; const bar = beat * 4;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };

// ---------- 1. the math on synthetic signals (ThreeMedia._test.core) ----------
const core = ThreeMedia._test.core;
step('analysis core exposed for tests', Boolean(core?.analyzeSignal));
{
  // a click track at 140 BPM with a 3-beat pickup: louder clicks on the 1 with a low tone, snares on 2 and 4
  const sr = 22050; const n = sr * 20; const x = new Float32Array(n); const p = 60 / 140; const t0 = 0.33;
  const truth = []; let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  for (let k = 0; t0 + k * p < 19.5; k++) {
    const t = t0 + k * p; const inBar = (k + 1) % 4; // k = 3 is the first 1 (after a 3-beat pickup)
    truth.push(t);
    const a = Math.round(t * sr);
    for (let i = 0; i < sr * 0.25 && a + i < n; i++) x[a + i] += 0.8 * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-i / sr * 30)) * (i / sr)) * Math.exp((-i / sr) * 10);
    if (inBar === 1 || inBar === 3) for (let i = 0; i < sr * 0.15 && a + i < n; i++) x[a + i] += 0.35 * rnd() * Math.exp((-i / sr) * 20);
    if (inBar === 0) for (let i = 0; i < sr * p * 3.5 && a + i < n; i++) x[a + i] += 0.2 * Math.sin(2 * Math.PI * [55, 65.4, 49, 73.4][Math.floor(k / 4) % 4] * (i / sr)) * Math.min(1, i / 400);
  }
  const t1 = performance.now();
  const a = core.analyzeSignal(x, sr);
  const firstOne = t0 + 3 * p; const off = (((a.grid.anchor - firstOne) % (4 * p)) + 4 * p) % (4 * p);
  step('synthetic 140: tempo', Math.abs(a.bpm - 140) < 0.1, { bpm: a.bpm, ms: Math.round(performance.now() - t1) });
  step('synthetic 140: bar 1 after a 3-beat pickup', Math.min(off, 4 * p - off) < 0.025, { anchor: a.grid.anchor, truth: Math.round(firstOne * 1000) / 1000, conf: a.grid.downbeatConf });
  const hit = truth.filter((t) => a.onsets.kick.some((o) => Math.abs(o.t - t) < 0.02)).length;
  step('synthetic 140: kicks found on time (±20 ms)', hit / truth.length > 0.9 && a.onsets.kick.length <= truth.length + 2, { found: a.onsets.kick.length, truth: truth.length, hit });
}
{
  // live latency from taps: a beat clock at 120 BPM and taps 70 ms after each beat → +70 ms (minus your tap delay)
  const beatAt = 1.7e12; const P = 500; const taps = Array.from({ length: 8 }, (_, i) => beatAt + 1000 * P + i * P + 70 + (i % 2 ? 4 : -4));
  const r = ThreeMusic.calibrate(taps, { locked: true, period: 0.5, beatAt, bpm: 120 }, 20, 10);
  step('live latency from taps: 20 ms + 70 − 10 (your tap delay) → 80 ms', r.ok && r.latency === 80, r);
  const half = ThreeMusic.calibrate(taps.filter((_, i) => i % 2 === 0), { locked: true, period: 0.5, beatAt, bpm: 120 }, 0, 0);
  step('live latency: half-time taps work too', half.ok && Math.abs(half.latency - 70) <= 5, half);
  step('live latency: an unlocked beat is refused', !ThreeMusic.calibrate(taps, { locked: false, period: 0.5, beatAt }, 0).ok);
}

// ---------- 2. a song with known answers, written here and loaded like a dropped file ----------
{
  // intro 8 bars (hats + bass) · drop 8 (kick, snare 2 & 4, hats, bass, louder) · break 4 (a pad) · drop 8 · outro 4
  const sr = 22050; const FORM = [['Intro', 8], ['Drop', 8], ['Break', 4], ['Drop', 8], ['Outro', 4]];
  const beats = FORM.reduce((s, f) => s + f[1] * 4, 0) + PICK;
  const n = Math.round((LEAD + beats * beat + 1) * sr); const x = new Float32Array(n);
  let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  const add = (t, len, f) => { const a = Math.round(t * sr); for (let i = 0; i < len * sr && a + i < n; i++) x[a + i] += f(i / sr); };
  window.__musicTruth = { kicks: [], drops: [], firstOne: LEAD + PICK * beat };
  let at = 0;
  for (const [name, bars] of FORM) { if (name === 'Drop') window.__musicTruth.drops.push(LEAD + (PICK + at) * beat); at += bars * 4; }
  for (let k = 0; k < beats; k++) {
    const b = k - PICK; const t = LEAD + k * beat; const inBar = ((b % 4) + 4) % 4;
    let acc = 0; let part = 'Intro'; for (const [name, bars] of FORM) { if (b < acc + bars * 4) { part = name; break; } acc += bars * 4; }
    const g = { Intro: 0.5, Drop: 1.25, Break: 0.3, Outro: 0.55 }[part];
    if (part === 'Drop' || part === 'Outro') { add(t, 0.3, (s) => g * 0.9 * Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-s * 30)) * s) * Math.exp(-s * 9)); window.__musicTruth.kicks.push(t); if (inBar % 2 === 1) add(t, 0.18, (s) => g * 0.45 * rnd() * Math.exp(-s * 18)); }
    if (part !== 'Break') for (const h of [0, 0.5]) { let prev = 0; add(t + h * beat, 0.04, (s) => { const v = rnd(); const d = v - prev; prev = v; return (part === 'Drop' ? 0.22 : 0.12) * d * Math.exp(-s * 90); }); }
    if (inBar === 0 && part !== 'Break') add(t, beat * 3.5, (s) => g * 0.25 * Math.sin(2 * Math.PI * [55, 55, 65.4, 49][Math.floor(b / 4) % 4] * s) * Math.min(1, s * 40) * Math.exp(-s * 0.8));
    if (inBar === 0 && part === 'Break') add(t, beat * 4, (s) => 0.1 * (Math.sin(2 * Math.PI * 220 * s) + Math.sin(2 * Math.PI * 277.2 * s)) * Math.min(1, s * 4, (beat * 4 - s) * 4));
  }
  let peak = 0; for (const v of x) peak = Math.max(peak, Math.abs(v));
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) data.setInt16(44 + i * 2, Math.round((x[i] / peak) * 0.9 * 32767), true);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}
const T = window.__musicTruth;
const c = await ThreeLab.cmd();
await wait(1500);
// a sketch with named sliders, so "Make it react" has something to bind
const base = ThreeData.TEMPLATES.find((t) => t.name === 'Basic scene').code
  .replace('const cube = ', "const P = tweak({ size: [1, 0.2, 3], glow: [0.4, 0, 2], speed: [1, 0, 4], count: [12, 1, 50, 1], tint: '#ff3cac' });\nconst cube = ")
  .replace('cube.rotation.set(t * 0.4, t * 0.6, 0);', 'cube.rotation.set(t * 0.4 * P.speed, t * 0.6 * P.speed, 0); cube.scale.setScalar(P.size); cube.material.emissive.set(P.tint); cube.material.emissiveIntensity = P.glow;');
ThreeLab.openCode(base);
await until(() => c.sliders().some((s) => s.key === 'glow'), 12000);
await wait(2500); // the sketch reports which values it reads every frame
// how busy the main thread is while the song loads and analyses (the Worker should take the work)
const longs = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); });
try { po.observe({ type: 'longtask', buffered: false }); } catch { /* no long-task API */ }
const t0 = performance.now();
const r = await c.loadSong(SONG);
const loadMs = Math.round(performance.now() - t0);
await wait(300); po.disconnect();
const L = H.surfaces.get('tool:three')?.el;
const P = ThreeMusic.presetInfo();
step('song loaded and analysed', r.ok && c.state.bpm > 0, { loadMs, bpm: c.state.bpm });
step('analysis ran in a Worker', ThreeMedia.analyze.lastWorker === true);
step('the main thread stays free while it analyses (no task over 200 ms)', Math.max(0, ...longs) < 200, { longTasks: longs.slice(0, 12) });
step(`tempo ${BPM}`, Math.abs(c.state.bpm - BPM) < 0.05, c.state.bpm);
const an = await say('/analyze');
{
  const m = an.match(/bar 1 at (\d+):(\d+\.\d+)/); const at = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  const off = (((at - T.firstOne) % bar) + bar) % bar;
  step('bar 1 found on a real downbeat (after a 1-beat pickup)', Math.min(off, bar - off) < 0.025, { at, truth: Math.round(T.firstOne * 1000) / 1000 });
}
step('/analyze lists sections with confidence and the drops', /Sections: .*Drop/.test(an) && /Drops: /.test(an) && /%\)/.test(an), an.split('\n').slice(0, 3).join(' | ').slice(0, 220));
{
  c.seek(0);
  const said = await say('/drops');
  const m = said.match(/drop, (\d+):(\d+)/); const at = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  step('/drops jumps to the first drop (and there are two)', Math.abs(at - T.drops[0]) < bar && /2 drops/.test(said), { said, truth: T.drops.map((x) => Math.round(x * 10) / 10) });
}
step('the trigger preset was picked from the song and shows on Presets ▾', Boolean(P.current) && [...L.querySelectorAll('.mb-quick')].some((b) => b.textContent.includes(P.current.slice(0, 8))), P);
await wait(1400);
step('one toast offers "✦ Make it react"', [...document.querySelectorAll('#toasts .toast button')].some((b) => /Make it react/.test(b.textContent)), [...document.querySelectorAll('#toasts .toast span')].map((s) => s.textContent).slice(-2));

// ---------- 3. the timeline: 3-band waveform, section bands, bars at every zoom, ghosts of the found hits ----------
c.zoom(null); await wait(500);
await shot('music-whole-song');
c.zoom(T.drops[0] - bar * 2, T.drops[0] + bar * 4); await wait(500);
await shot('music-zoomed');
// "Mark kicks for me": the ghost note in the empty kick lane, clicked like a person
const canvas = L.querySelector('canvas.mb-timeline');
const r2 = await say('/mark-kicks');
const nK = Number((r2.match(/Marked (\d+) kick/) || [])[1] || 0);
step('/mark-kicks marks the kicks found in the audio', nK >= T.kicks.length * 0.9 && nK <= T.kicks.length + 2, { marked: nK, truth: T.kicks.length });
await wait(300); await shot('music-kicks-marked');
// undo with Ctrl+Z in the Lab (the markers go again)
await J.click([...L.querySelectorAll('.three-preview')].find(J.visible) || canvas, { at: [0.5, 0.6] }).catch(() => {});
await key('z', { ctrl: true }); await wait(600);
const bm0 = (await window.hub.kvGet('three-beatmaps')) || {};
step('Ctrl+Z takes the marked kicks back', !(bm0[SONG]?.marks?.kick?.length), bm0[SONG]?.marks?.kick?.length || 0);
const all = await say('/mark-kicks all');
step('/mark-kicks all marks kicks, snares and hats', /kick.*snare.*hats/.test(all), all.slice(0, 100));

// ---------- 4. the tap that learns ----------
c.zoom(null);
c.seek(T.drops[0]); c.play(true);
await until(() => c.state.playing, 4000);
const tapAt = async (bpm, n) => { const s = performance.now() + 60; for (let i = 0; i < n; i++) { while (performance.now() < s + (i * 60000) / bpm) await wait(4); c.tap(); } };
await tapAt(127.2, 8); // a little off: should lock to the song's 126
let ti = (await ThreeLab.cmd()).state.bpm;
step('taps near the song\'s tempo lock to it exactly', ti === BPM, { bpm: ti });
await wait(2600);
await tapAt(63, 8); // half time: the grid stays at 126, a toast offers 63
ti = (await ThreeLab.cmd()).state.bpm;
step('half-time taps keep the song\'s tempo (and offer the half)', ti === BPM && [...document.querySelectorAll('#toasts .toast span')].some((s) => /half time/.test(s.textContent)), { bpm: ti });
// nudge by ear: . twice → +10 ms, one undo step
await wait(1600);
const sendKey = async (code, keyName, kc) => { await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, text: keyName } }); await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc } }); await wait(60); };
await sendKey('Period', '.', 190); await sendKey('Period', '.', 190);
const nudged = [...document.querySelectorAll('#toasts .toast span')].map((s) => s.textContent).find((t) => /^Grid [+-]\d+ ms/.test(t));
step('. nudges the grid by ear (+10 ms after two presses, one note)', /^Grid \+10 ms/.test(nudged || ''), nudged);
c.play(false);
const lat = await say('/tap-latency');
step('/tap-latency answers', /tap|learned/i.test(lat), lat.slice(0, 90));
const db = await say('/downbeat auto');
step('/downbeat auto goes back to the detected grid', /Bar 1 at .*as detected/.test(db), db);

// ---------- 5. "Make it react" ----------
const plan = ThreeMusic.reactPlan();
step('Make it react picks size → kick, glow → bass, speed → loudness (not the count)', plan.some((p) => p.key === 'size' && p.band === 'kick') && plan.some((p) => p.key === 'glow' && p.band === 'bass') && plan.some((p) => p.key === 'speed' && p.band === 'level') && !plan.some((p) => p.key === 'count'), plan.map((p) => `${p.key}:${p.band}`));
const mr = await say('/make-it-react');
const follows = (await ThreeLab.cmd()).sliders().filter((s) => s.followsMusic).map((s) => `${s.key}:${s.followsMusic.band}`);
step('/make-it-react binds them', follows.length >= 3, { follows, said: mr.slice(0, 120) });
await say('/make-it-react undo');
step('/make-it-react undo takes it back', !(await ThreeLab.cmd()).sliders().some((s) => s.followsMusic));
const ap = await say('/auto-preset');
step('/auto-preset says what it picked and why', /Triggers: \*\*.+\*\* \(.+\)/.test(ap), ap);
const ls = await say('/live-status');
step('/live-status answers (live off here)', /Live sound is off|Live:/.test(ls), ls);
const lg = await say('/live gain auto');
step('/live gain auto', /auto/.test(lg), lg);
step('no duplicate command names', Commands.duplicates().length === 0, Commands.duplicates().map((d) => d.name));
for (const n of ['analyze', 'mark-kicks', 'drops', 'make-it-react', 'auto-preset', 'downbeat', 'tap-latency', 'live-status']) if (Commands.get(n)?.area !== 'Three.js Lab') step(`/${n} registered`, false);

// ---------- 6. smoothness while it plays (zoomed in, scrolling) ----------
c.zoom(T.drops[0], T.drops[0] + bar * 2); c.seek(T.drops[0]); c.play(true);
await wait(800);
await smoke({ trace: 'start' });
let mut = 0; const by = {};
const mo = new MutationObserver((l) => { for (const m of l) { mut += 1; const n = m.target.nodeType === 3 ? m.target.parentElement : m.target; const k = `${m.type}:${String(n?.className || n?.tagName || '?').split(' ')[0]}`; by[k] = (by[k] || 0) + 1; } });
mo.observe(L.querySelector('.media-bar'), { subtree: true, childList: true, characterData: true, attributes: true });
await wait(3000);
mo.disconnect();
const tr = await smoke({ trace: 'stop' });
c.play(false);
step('smooth while it plays (3 s, zoomed in, scrolling): numbers', true, { paints: tr?.paints, paintedKpx: Math.round((tr?.paintedPx || 0) / 1000), paintMs: tr?.paintMs, rasterMs: tr?.rasterMs, layoutMs: tr?.layoutMs, styleMs: tr?.styleMs, top: (tr?.top || []).slice(1, 4), timelineDomChanges: mut, from: by });
return J.done();
