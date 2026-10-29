// Scrubbing and zooming the Lab timeline (round 49, labscrub): a 4-minute fixture song (120 BPM, kicks + hats) under a
// scene of 8 layers (a base, 6 small three.js layers, one 🅰 kinetic type layer), 4 of them keyframed with their lanes
// open. With real input (CDP mouse / wheel, as the owner's mouse and trackpad send them), per stretch:
//   scrub   drag the playhead across the whole song and back (paused)
//   pan     a two-finger sideways trackpad scroll along the zoomed waveform (the waveform scrolling)
//   zoom    trackpad pinch (Ctrl+wheel) in and out over the waveform
//   clip    drag a layer's bar along its track
//   sound   the scrub again with the scrub sound on: the grains it plays and what they cost
// What is counted: the Lab window's main-thread work per move (the input's handlers + the frames it caused: rAF →
// rendering done), handlers that made a frame late, waveform / beat grid rebuilds, seeks the preview page got per
// frame it drew and per move, layer messages per move, and after letting go how soon the preview's last drawn frame
// is the exact time the playhead shows (its media clock too). Inputs come in bursts ~4 ms apart, as a fast mouse or
// trackpad sends them. Fails above the budgets (BUDGET below; window.LS_REPORT = 1 reports without failing;
// window.LS_ONLY = 'scrub,zoom'; window.LS_TRACE = 1 adds the timeline trace per stretch: CPU, forced layouts with
// the line that asked, where the time went; window.LS_PROFILE = 'pan' a JS profile of one stretch).
// Xvfb is a 60 Hz display with software GL on shared CPUs: absolute ms are several times a real Mac's; the counts
// (seeks per frame, rebuilds, messages) are exact. The preview is kept small (320 × 180).
// (round 80, checkfix80) load-aware: the ms per move and the late handlers above are wall time, which a busy machine
// stretches many times over (side by side with other checks here: a frame's "work" read 0.4–1.1 s, the pan 18–22 ms a
// move, the clip 15 ms, the scrub 5.7 ms). A stretch over those budgets is measured once more under a timeline trace
// and judged on the Lab window main thread's own CPU time (thread time: what the work costs, whatever else the machine
// runs): its CPU ms per move against the same budget, and tasks running an input's handlers over 8.3 ms of CPU as the
// late ones. Both readings are in the report (wall, then cpu); real extra work shows in both and still fails. Counts
// (seeks, rebuilds, messages) were exact already. window.LS_WALL = 1 judges on wall time only, as before.
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/labscrub.js --shot /tmp/labscrub.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(60); } return false; };
const out = { budgets: {}, problems: [] };
const only = String(window.LS_ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const TRACE = Boolean(window.LS_TRACE);
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(4000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const move = (x, y, modifiers = 0) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1, modifiers });
// a burst of inputs ~4 ms apart, as a 240 Hz mouse / trackpad sends them (each awaited, the next isn't held for it)
const burst = async (sends, gap = 4) => { const ps = []; for (const f of sends) { ps.push(f()); await wait(gap); } await Promise.all(ps); };
const wheel = (x, y, dy, modifiers = 0, dx = 0) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: dx, deltaY: dy, modifiers });
// the view stops changing (wheel events still on their way are handled)
const viewRests = async () => { let last = ''; let same = 0; for (let i = 0; i < 60 && same < 4; i++) { const v = JSON.stringify(c.player.view); same = v === last ? same + 1 : 0; last = v; await wait(100); } };
// budgets (loose: this machine is several times slower than a Mac, and shared): the Lab window's main-thread ms per
// move (its handlers + the frames they caused, the preview's own drawing excluded when it runs elsewhere), frames the
// input handlers made late (a handler over 8.3 ms), seeks the preview got per frame it drew (max) and per move, ms
// from letting go to the preview drawing that exact time, waveform rebuilds while panning at one zoom and over a
// pinch, layer messages per move of a dragged clip
const BUDGET = window.LS_BUDGET || { scrubCpu: 4, zoomCpu: 20, panCpu: 20, clipCpu: 8, soundCpu: 6, dropped: 3, seeksPerFrameMax: 2, seeksPerMove: 1.05, msToExact: 3000, panRebuilds: 2, zoomRebuildsPerDraw: 0.75, clipMsgsPerMove: 0.5, finalExact: 0.002 };
out.budgets = BUDGET;

// ---------- the song: 4 minutes at 120 BPM (kicks on the beat, hats between), 22.05 kHz mono ----------
const SONG = '/tmp/hearth-labscrub-song.wav';
{
  const sr = 22050; const secs = 240; const n = secs * sr; const x = new Int16Array(n);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  for (let b = 0; b < secs * 2; b++) {
    const a = Math.round((b * 0.5) * sr); let ph = 0;
    for (let i = 0; i < 0.2 * sr && a + i < n; i++) { const s = i / sr; ph += (2 * Math.PI * (50 + 110 * Math.exp(-s * 35))) / sr; x[a + i] += Math.round(26000 * Math.sin(ph) * Math.exp(-s * 14)); }
    const h = Math.round((b * 0.5 + 0.25) * sr);
    for (let i = 0; i < 0.03 * sr && h + i < n; i++) x[h + i] += Math.round(3000 * rnd() * Math.exp(-i / (0.008 * sr)));
  }
  const data = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sr, true); data.setUint32(28, sr * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 2, true);
  new Int16Array(data.buffer, 44).set(x);
  await window.hub.fs.write(SONG, new Uint8Array(data.buffer));
}

// ---------- the Lab: 8 layers, 4 keyframed with lanes open, a 🅰 layer ----------
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && typeof LabKineticHook !== 'undefined', 30000);
const c = await ThreeLab.cmd();
const D = ThreeLab.director;
await wait(800);
const BASE = `import * as THREE from 'three';
const P = tweak({ glow: { value: 0.5, min: 0, max: 1, step: 0.001, label: 'Glow' } });
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 6;
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 64, 8), new THREE.MeshNormalMaterial()); scene.add(knot);
renderer.setAnimationLoop(() => { knot.rotation.y = audio.time * 0.7; knot.scale.setScalar(0.6 + P.glow * 0.6); renderer.render(scene, camera); const L = window.__lsDrawn; if (L && L.on) L.at.push([document.timeline.currentTime, audio.time]); window.__lsFrame?.(); });`;
await D.newSketch('labscrub scene', BASE, 2);
try { c.customSize(320, 180); c.size('custom'); } catch { /* the frame size stays */ }
const r0 = await c.loadSong(SONG);
if (!r0?.ok) out.problems.push(`the song didn't load: ${JSON.stringify(r0)}`);
await until(() => c.player.loaded && c.player.duration > 200, 30000);
await until(() => c.player.analysis, 60000);
const layer = (i, color) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 8;
const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: '${color}', wireframe: true })); m.position.x = ${i - 3} * 1.1; scene.add(m);
renderer.setAnimationLoop(() => { m.rotation.x = audio.time * ${0.3 + i * 0.1}; renderer.render(scene, camera); });`;
const COLORS = ['#ff6a4d', '#ffd75e', '#8fe6ff', '#bd8bff', '#6aff9a', '#ff8fd1'];
for (let i = 0; i < 6; i++) { try { await D.addLayer({ name: `Part ${i + 1}`, code: layer(i, COLORS[i]) }, 0.6); } catch (err) { out.problems.push(`layer ${i + 1}: ${err.message}`); } }
try { await LabKineticHook.lib(() => 1); await LabKinetic.apply('typewriter', { text: 'SCRUB AT TWO FORTY' }); } catch (err) { out.problems.push(`🅰 layer: ${err.message}`); }
await wait(1500);
const names = D.layers().layers.map((x) => x.name);
out.layers = names.length;
// keyframes across the song on four layers (opacity / x / scale and the base's Glow slider), every lane open
const keyed = names.slice(0, 4);
const keysFor = (k) => Array.from({ length: 24 }, (_, i) => ({ time: i * 10, value: k === 'glow' ? (i % 2 ? 0.9 : 0.1) : k === 'opacity' ? (i % 2 ? 1 : 0.3) : k === 'scale' ? (i % 2 ? 1.2 : 0.8) : (i % 2 ? 0.2 : -0.2) }));
const props = ['glow', 'opacity', 'x', 'scale'];
for (let i = 0; i < keyed.length; i++) {
  try {
    D.setKeyframes(keyed[i], props[i], keysFor(props[i]));
    if (i === 0) D.setKeyframes(keyed[i], 'opacity', keysFor('opacity'));
    D.timelineEdit({ lane: { layer: keyed[i], property: 'all' } });
  } catch (err) { out.problems.push(`keys on ${keyed[i]}: ${err.message}`); }
}
// one layer as a clip (8 s → 40 s) to drag along its track
const clipName = names[names.length - 2] || names[1];
try { await D.updateLayer(clipName, { in: 8, out: 40 }, 0.3); } catch (err) { out.problems.push(`clip: ${err.message}`); }
await wait(1200);

const L = H.surfaces.get('tool:three')?.el;
const canvas = [...(L?.querySelectorAll('canvas.mb-timeline') || [])].find((x) => x.getBoundingClientRect().width > 40);
if (!canvas) throw new Error('labscrub: no timeline canvas');
canvas.scrollIntoView({ block: 'nearest' });
await wait(400);
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 6; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
const sbxJson = (r) => { try { return typeof r === 'string' ? JSON.parse(r) : {}; } catch { return {}; } };
// the preview page: seeks and layer messages per preview frame, what each frame drew (media.time)
await sbx(`if (!window.__lsProbe) { const P = window.__lsProbe = { on: false, frames: 0, seeks: 0, layerMsgs: 0, perFrame: [], cur: 0 };
  window.__lsDrawn = { on: false, at: [] };
  addEventListener('message', (e) => { if (!P.on) return; const d = e.data; if (d?.type === 'media' && d.cmd === 'seek') { P.seeks++; P.cur++; } if (d?.type === 'layer-props') P.layerMsgs++; });
  // per frame the preview drew (the base layer's frame, see BASE): the seeks that came in since the one before
  window.__lsFrame = () => { if (P.on) { P.frames++; P.perFrame.push(P.cur); P.cur = 0; } };
} return 1`);
// the Lab window: main-thread work per move (handlers + the frame rendering after them), frame gaps
const probe = { on: false, ev: [], frames: [], gaps: [], last: 0 };
const cur = new Map();
const endCh = new MessageChannel();
endCh.port1.onmessage = (m) => { for (const [e, x] of cur) if (x.id === m.data) { x.end = performance.now(); probe.ev.push(x); cur.delete(e); } };
let evId = 0;
for (const t of ['pointermove', 'pointerdown', 'pointerup', 'wheel']) {
  addEventListener(t, (e) => { if (!probe.on || !e.isTrusted || cur.has(e)) return; const x = { id: ++evId, type: t, start: performance.now() }; cur.set(e, x); endCh.port2.postMessage(x.id); }, { capture: true, passive: true });
  addEventListener(t, (e) => { const x = cur.get(e); if (x) { cur.delete(e); x.end = performance.now(); probe.ev.push(x); } }, { passive: true });
}
const fch = new MessageChannel();
let fStart = 0;
fch.port1.onmessage = () => { probe.frames.push(performance.now() - fStart); };
const tick = (t) => { if (!probe.on) return; if (probe.last) probe.gaps.push(t - probe.last); probe.last = t; fStart = performance.now(); fch.port2.postMessage(0); requestAnimationFrame(tick); };
// waveform rebuilds: whole columns computed for the cached picture (counted through the canvas' getContext calls on the cache)
const wc0 = () => c.player._scrubStats?.() || null;
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))));
const vsync = await new Promise((res) => { const a = []; const f = (t) => { a.push(t); if (a.length < 30) requestAnimationFrame(f); else { const g = a.slice(1).map((x, i) => x - a[i]).sort((p, q) => p - q); res(g[Math.floor(g.length / 2)]); } }; requestAnimationFrame(f); });
out.vsyncMs = r1(vsync);
async function stretch(name, fn) {
  if (!want(name)) return null;
  await settle();
  performance.mark(`hz240:${name}`);
  await sbx('const P = window.__lsProbe; Object.assign(P, { on: true, frames: 0, seeks: 0, layerMsgs: 0, perFrame: [], cur: 0 }); window.__lsDrawn.at = []; window.__lsDrawn.on = true; return 1');
  const s0 = wc0();
  const prof = window.LS_PROFILE === name;
  if (prof) { await cdp('Profiler.enable', {}); await cdp('Profiler.setSamplingInterval', { interval: 200 }); await cdp('Profiler.start', {}); }
  probe.ev = []; probe.frames = []; probe.gaps = []; probe.last = 0; probe.on = true; requestAnimationFrame(tick);
  const t0 = performance.now();
  let moves = 0;
  try { moves = await fn(); } catch (err) { out.problems.push(`${name}: ${String(err.message || err).slice(0, 200)}`); }
  await settle(); await wait(150);
  probe.on = false;
  if (prof) {
    const p = (await cdp('Profiler.stop', {}))?.profile;
    if (p) {
      const self = {}; const dt = {}; const byId = new Map(p.nodes.map((n) => [n.id, n]));
      for (let i = 0; i < p.samples.length; i++) dt[p.samples[i]] = (dt[p.samples[i]] || 0) + (p.timeDeltas[i] || 0);
      for (const [id, us] of Object.entries(dt)) { const n = byId.get(Number(id)); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; self[k] = (self[k] || 0) + us / 1000; }
      out.profile = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${r1(v)}ms ${k}`);
    }
  }
  const ms = performance.now() - t0;
  const pv = sbxJson(await sbx('const P = window.__lsProbe; P.on = false; window.__lsDrawn.on = false; if (P.cur) P.perFrame.push(P.cur); return JSON.stringify({ frames: P.frames, seeks: P.seeks, layerMsgs: P.layerMsgs, maxPerFrame: Math.max(0, ...P.perFrame), drawn: window.__lsDrawn.at.slice(-3), draws: window.__lsDrawn.at.length })'));
  const s1 = wc0();
  const handlers = probe.ev.reduce((a, x) => a + (x.end - x.start), 0);
  const frameWork = probe.frames.reduce((a, x) => a + x, 0);
  const perMove = probe.ev.filter((x) => x.type === 'pointermove' || x.type === 'wheel').map((x) => x.end - x.start);
  const dropped = probe.gaps.filter((g) => g > vsync * 1.5).reduce((a, g) => a + Math.round(g / vsync) - 1, 0);
  const r = {
    moves, ms: Math.round(ms),
    cpuPerMoveMs: moves ? r1((handlers + frameWork) / moves) : null, // the Lab window's main thread, per move
    handlerP95: pct(perMove, 0.95), lateFrames: probe.ev.filter((x) => x.end - x.start > 8.3).length, frameWorkP95: pct(probe.frames, 0.95), moveMsP95: pct(perMove.map((h, i) => h + (probe.frames[i] || 0)), 0.95),
    frames: probe.gaps.length, framesOver4: probe.frames.filter((x) => x > 4.2).length, framesOver8: probe.frames.filter((x) => x > 8.3).length, gapsDropped: dropped, worstGap: r1(Math.max(0, ...probe.gaps)),
    preview: { frames: pv.frames, draws: pv.draws, seeks: pv.seeks, seeksPerMove: moves ? r3(pv.seeks / moves) : 0, seeksMaxPerFrame: pv.maxPerFrame, layerMsgs: pv.layerMsgs, lastDrawn: pv.drawn },
    ...(s0 && s1 ? { waveRebuilds: s1.waveBuilds - s0.waveBuilds, gridRebuilds: s1.gridBuilds - s0.gridBuilds, canvasDraws: s1.draws - s0.draws, ...(s1.grains != null ? { grains: s1.grains - s0.grains } : {}) } : {}),
  };
  out[name] = r;
  return r;
}
// a stretch measured, and once more under a trace when its wall time is over a budget (judged on CPU time then)
const CPU_KEY = { scrub: 'scrubCpu', zoom: 'zoomCpu', pan: 'panCpu', clip: 'clipCpu', sound: 'soundCpu' };
async function measured(name, fn) {
  const r = await stretch(name, fn);
  const k = CPU_KEY[name];
  if (!r || TRACE || window.LS_WALL || !(r.cpuPerMoveMs > BUDGET[k] || r.lateFrames > BUDGET.dropped)) return r;
  const wall = { cpuPerMoveMs: r.cpuPerMoveMs, lateFrames: r.lateFrames, frameWorkP95: r.frameWorkP95, handlerP95: r.handlerP95 };
  let seg = null; let again = null;
  try {
    await smoke({ trace: 'start', detail: true });
    try { again = await stretch(name, fn); } finally { performance.mark('hz240:end'); await settle(); }
    const tr = await smoke({ trace: 'stop', detail: true });
    seg = tr?.detail?.segments?.[name] || null;
  } catch (err) { out.problems.push(`${name}: the trace for its CPU time failed (${String(err.message || err).slice(0, 120)})`); }
  if (!seg || !again?.moves) { out[name] = { ...r, wall, judgedBy: 'wall (no trace)' }; return out[name]; }
  const cpu = { cpuPerMoveMs: r1(seg.cpuMs / again.moves), lateFrames: seg.inputOver8Cpu, cpuMs: seg.cpuMs, busyMs: seg.busyMs, longestCpu: seg.longestCpu, againWall: { cpuPerMoveMs: again.cpuPerMoveMs, lateFrames: again.lateFrames } };
  out[name] = { ...again, wall, cpu, cpuPerMoveMs: cpu.cpuPerMoveMs, lateFrames: cpu.lateFrames, judgedBy: 'thread CPU (trace)' };
  return out[name];
}
const rect = () => canvas.getBoundingClientRect();
let released = 0;
const over = (what, v, b) => { if (v != null && b != null && v > b) out.problems.push(`${what}: ${v} > ${b}`); };
const waveY = () => rect().top + 30; // the waveform's top part (below the ruler)

if (window.LS_DEBUG) {
  const P = c.player; const log = out.seekLog = [];
  const s0 = P.seek; P.seek = (t) => { log.push(['seek', r3(t), new Error().stack.split('\n').slice(2, 5).map((x) => x.trim().slice(0, 90)).join(' < ')]); return s0(t); };
  const m0 = P.onMessage; P.onMessage = (msg) => { const before = P.time; const r = m0(msg); if (msg?.type === 'media-state' && Math.abs(P.time - before) > 0.01) log.push(['state', r3(before), r3(P.time), msg.seekAck ? 'ack' : 'plain', msg.playing]); return r; };
}
if (TRACE) await smoke({ trace: 'start', detail: true });
c.player.zoomTo?.(null);
await c.player.seek?.(0);
store.set('three.scrubSound', false);
c.player.scrubSound?.(false);
await measured('scrub', async () => {
  const r = rect(); const y = waveY(); const N = 120;
  await mouse('mouseMoved', r.left + 4, y, { button: 'none' });
  await mouse('mousePressed', r.left + 4, y, { buttons: 1 });
  const xs = []; for (let k = 0; k < 2; k++) for (let i = 1; i <= N; i++) { const f = k ? 1 - i / N : i / N; xs.push(r.left + 4 + f * (r.width - 140)); }
  xs.push(r.left + 4 + 0.37 * (r.width - 140)); // let go on a spot that isn't on a frame boundary
  await burst(xs.map((x) => () => move(x, y)));
  await mouse('mouseReleased', r.left + 4 + 0.37 * (r.width - 140), y, { buttons: 0 });
  released = performance.now();
  return N * 2 + 1;
});
// the exact frame where the playhead was let go: the preview's media clock, and how soon the frame it drew last is
// that time (a queue of seeks the preview still had to work through showed old times for a long while)
if (want('scrub')) {
  const t = c.player.time;
  await sbx('window.__lsDrawn.on = true; return 1');
  let last = null; let clock = null;
  const ok = await until(async () => { const v = sbxJson(await sbx('return JSON.stringify({ t: audio.time, last: (window.__lsDrawn.at.at(-1) || [0, -1])[1] })')); last = v.last; clock = v.t; return Math.abs(v.last - t) <= BUDGET.finalExact && Math.abs(v.t - t) <= BUDGET.finalExact; }, 20000);
  await sbx('window.__lsDrawn.on = false; return 1');
  out.final = { playhead: r3(t), previewClock: r3(clock), lastDrawn: r3(last), msToExact: ok ? Math.round(performance.now() - released) : null };
  if (!ok) out.problems.push(`scrub: the preview's last frame shows ${r3(last)} s (its clock ${r3(clock)} s), the playhead ${r3(t)} s`);
  else over('scrub: ms from letting go to the preview drawing that exact time', out.final.msToExact, BUDGET.msToExact);
}
// the waveform scrolled at one zoom (10 s in view): a two-finger sideways trackpad scroll, 60 steps, ~a third of a view
c.player.zoomTo(100, 110);
await settle(); await wait(300);
await measured('pan', async () => {
  const r = rect(); const y = waveY(); const x = r.left + r.width * 0.4;
  const v0 = c.player.view;
  await mouse('mouseMoved', x, y, { button: 'none', buttons: 0 });
  await burst(Array.from({ length: 60 }, (_, i) => () => wheel(x, y, 0, 0, i < 40 ? 4 : -4)), 8);
  await viewRests();
  out.panView = { from: v0, to: c.player.view };
  if (!(c.player.view?.start > v0.start + 0.05)) out.problems.push(`pan: the view didn't move (${JSON.stringify(out.panView)})`);
  return 60;
});
// a pinch (Ctrl+wheel): in 40 steps, out 20
await measured('zoom', async () => {
  const r = rect(); const y = waveY(); const x = r.left + r.width * 0.4;
  const v0 = c.player.view;
  await burst(Array.from({ length: 60 }, (_, i) => () => wheel(x, y, i < 40 ? -6 : 6, 2)), 8);
  await viewRests(); await wait(300); // the pinch rests: drawn crisp
  out.zoomView = { from: v0, to: c.player.view };
  return 60;
});
c.player.zoomTo?.(null);
await settle();
await measured('clip', async () => {
  const g = c.player._keysGeo(); const lay = D.layers().layers.find((x) => x.name === clipName);
  const id = lay?.id || ThreeLab.scenes.layersOf(ThreeLab.scenes.get(ThreeLab.scenes.currentId())).find((x) => x.name === clipName)?.id;
  const ty = g.trackY(id); if (ty == null) throw new Error(`no track row for ${clipName}`);
  const r = rect(); const y = r.top + ty; const x0 = r.left + g.X(24);
  await mouse('mouseMoved', x0, y, { button: 'none' });
  await mouse('mousePressed', x0, y, { buttons: 1 });
  await burst(Array.from({ length: 80 }, (_, i) => () => move(x0 + Math.sin((i + 1) / 12) * 160, y)));
  await mouse('mouseReleased', x0, y, { buttons: 0 });
  return 80;
});
// the scrub sound: grains that follow the playhead while you drag (if this build has it)
if (want('sound') && c.player.scrubSound) {
  c.player.scrubSound(true);
  await measured('sound', async () => {
    const r = rect(); const y = waveY(); const N = 80;
    await mouse('mouseMoved', r.left + 4, y, { button: 'none' });
    await mouse('mousePressed', r.left + 4, y, { buttons: 1 });
    await burst(Array.from({ length: N }, (_, i) => () => move(r.left + 4 + ((i + 1) / N) * (r.width - 140), y)));
    await mouse('mouseReleased', r.left + r.width - 136, y, { buttons: 0 });
    return N;
  });
  c.player.scrubSound(true);
}
performance.mark('hz240:end');
await settle();
if (TRACE) {
  const tr = await smoke({ trace: 'stop', detail: true });
  for (const [n, s] of Object.entries(tr.detail?.segments || {})) if (out[n]) out[n].trace = { cpuPerMoveMs: r1(s.cpuMs / Math.max(1, out[n].moves)), busyMs: s.busyMs, cpuMs: s.cpuMs, work95: s.work?.p95, frames: s.frames, forced: s.forced?.n, forcedMs: s.forced?.ms, forcedTop: (s.forced?.top || []).slice(0, 3), style: s.style, layout: s.layout, phases: s.phases, scripts: (s.scripts || []).slice(0, 4), files: s.filesCpu };
}
await smoke({ shot: window.LS_SHOT || '/tmp/labscrub.png' });

// ---------- budgets ----------
for (const [n, k] of [['scrub', 'scrubCpu'], ['zoom', 'zoomCpu'], ['pan', 'panCpu'], ['clip', 'clipCpu'], ['sound', 'soundCpu']]) {
  const s = out[n]; if (!s) continue;
  over(`${n}: the Lab window's main-thread ms per move (its handlers + the frames they caused)`, s.cpuPerMoveMs, BUDGET[k]);
  over(`${n}: frames the input handlers made late (handlers over 8.3 ms)`, s.lateFrames, BUDGET.dropped);
}
if (out.scrub) {
  over('scrub: seeks the preview got in one of its frames', out.scrub.preview.seeksMaxPerFrame, BUDGET.seeksPerFrameMax);
  over('scrub: seeks per move', out.scrub.preview.seeksPerMove, BUDGET.seeksPerMove);
}
if (out.pan && out.pan.waveRebuilds != null) over('pan: waveform rebuilds at one zoom', out.pan.waveRebuilds, BUDGET.panRebuilds);
// (a pinch draws stretched pictures; a loaded machine spaces the steps past the 160 ms rest, so it's counted per draw:
// before, every drawn zoom step rebuilt both pictures, 1.0)
if (out.zoom && out.zoom.waveRebuilds != null) over('zoom: waveform rebuilds per timeline draw over a pinch in and out', r3(out.zoom.waveRebuilds / Math.max(1, out.zoom.canvasDraws)), BUDGET.zoomRebuildsPerDraw);
if (out.clip) over('clip: layer messages per move', r3(out.clip.preview.layerMsgs / Math.max(1, out.clip.moves)), BUDGET.clipMsgsPerMove);
if (out.sound && !(out.sound.grains > 0)) out.problems.push('sound: no scrub grains played');
const errs = D.report?.().errors || [];
if (errs.length) out.problems.push(`scene errors: ${errs.slice(0, 2).map((e) => e.message || e).join(' · ')}`);
if (window.LS_REPORT) { out.reportOnly = out.problems; out.problems = []; }
out.pass = out.problems.length === 0;
return JSON.stringify(out, null, 1);
