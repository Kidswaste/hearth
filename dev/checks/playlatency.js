// ▶ Play's input latency end to end (round 56, playlatency): a key press / mouse move → the game's frame that reads it,
// in the game window, with Hearth's part of the path counted. On the game-like Lab scene (dev/fixtures/game-lab-scene.js:
// three layers on one canvas, WASD + mouse look), played twice: "before" (localStorage playlatency.test = { copy: true }:
// the one canvas copied every frame, as up to round 55) and "after" (swapped, not copied), then the test HTML game.
//   real input   CDP Input.* into the window's page (trusted events with the OS-style timestamp, dev/smoke.js pageCdp):
//                timestamp → handled → the start of the next animation frame, in ms and against the frame time
//   /game latency  the owner's measurement (synthetic F24 + 1 px mouse moves sent by the main process): the same figure,
//                Hearth's main process event loop and the window's key handler while it runs, the window's pacing
//   F chip       "Input: x ms" while it shows, gone when it's off
//   no extra hop  the one canvas swapped, not copied (preserveDrawingBuffer off) when nothing reads it; no fps cap / pace /
//                throttling; Chromium's frame-rate switches absent; no keydown listener of Hearth's in an HTML game
// Thresholds are relative to the measured frame time (this machine: Xvfb at 60 Hz, SwiftShader: slow frames): input →
// the game's frame p50 ≤ 1.25 frames + 1 ms, p95 ≤ 2 frames + 4 ms. window.PL_REPORT = 1 reports without failing.
//   node dev/smoke.js --screen 1280x720 --check-timeout 900000 --script dev/checks/playlatency.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const REPORT = Boolean(window.PL_REPORT);
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok) || REPORT, ...(REPORT && !ok ? { would: 'fail' } : {}), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const DIR = '/tmp/hearth-gamemode';
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const playing = async () => (await G().state())?.playing;
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (a, p) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const pc = (method, params) => Promise.race([smoke({ pageCdp: '^hearth-game:', cdp: method, params }), wait(5000).then(() => ({ error: 'timeout' }))]);
const KC = { KeyW: 87, KeyD: 68, KeyS: 83, KeyA: 65, KeyF: 70 };
const keyOf = (code) => ({ key: code.slice(3).toLowerCase(), code, windowsVirtualKeyCode: KC[code] || 0, nativeVirtualKeyCode: KC[code] || 0 });
async function key(code, hold = 0) {
  const k = keyOf(code);
  await pc('Input.dispatchKeyEvent', { type: 'keyDown', ...k, text: k.key });
  if (hold) await wait(hold);
  await pc('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
}
const mouse = (x, y) => pc('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none' });
const lim = (frame) => ({ p50: r1(frame * 1.25 + 1), p95: r1(frame * 2 + 4) });

// the probe in the game's page (main world): per input, timestamp → handled → the next animation frame; frame gaps
const PROBE = `(() => {
  if (window.__pl) return 'again';
  const P = window.__pl = { ev: [], gaps: [], last: 0, msgs: 0 };
  const rec = (e) => { const r = [e.type === 'pointermove' ? 1 : 0, e.timeStamp, performance.now(), null]; P.ev.push(r); if (P.ev.length > 800) P.ev.shift(); requestAnimationFrame(() => { r[3] = performance.now(); }); };
  for (const t of ['keydown', 'pointermove']) addEventListener(t, rec, { capture: true, passive: true });
  addEventListener('message', () => { P.msgs += 1; }, true);
  const loop = (t) => { if (P.last) { P.gaps.push(t - P.last); if (P.gaps.length > 1200) P.gaps.shift(); } P.last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return 'ok';
})()`;
const take = async () => JSON.parse(await ev('JSON.stringify((() => { const P = window.__pl; const o = { ev: P.ev.splice(0), gaps: P.gaps.splice(0), msgs: P.msgs }; P.msgs = 0; return o; })())'));
function sum(d) {
  const frame = pct(d.gaps, 0.5);
  const part = (mv) => { const e = d.ev.filter((x) => x[0] === mv && x[3] != null); return { n: e.length, handled: [pct(e.map((x) => x[2] - x[1]), 0.5), pct(e.map((x) => x[2] - x[1]), 0.95)], frame: [pct(e.map((x) => x[3] - x[1]), 0.5), pct(e.map((x) => x[3] - x[1]), 0.95)] }; };
  const all = d.ev.filter((x) => x[3] != null).map((x) => x[3] - x[1]);
  return { frameMs: frame, frameP95: pct(d.gaps, 0.95), fps: frame ? Math.round(1000 / frame) : null, keys: part(0), mouse: part(1), all: [pct(all, 0.5), pct(all, 0.95)], n: all.length, msgsPerSec: null };
}

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
const scene = JSON.parse(await window.hub.fs.read(`${DIR}/lab-scene.json`));
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
if (typeof Lazy !== 'undefined') await Lazy.load('gamemode').catch(() => {});
await until(() => typeof GameMode !== 'undefined', 20000);
const layers = scene.layers.map((L, i) => ({ id: ['sky', 'world', 'hud'][i], name: L.name, code: L.code }));
const made = ThreeLab.scenes.create({ name: scene.name, code: layers[0].code, layers, open: true });
const sceneId = made?.id || ThreeLab.scenes.all().find((s) => s.name === scene.name)?.id;
ThreeLab.scenes.open(sceneId);
await wait(2000);

// the graphics switches: nothing caps or uncaps the frame rate (Chromium follows the screen's refresh)
await safe('switches', async () => {
  const f = (await window.hub.gpu52?.info?.().catch(() => null))?.flags || null;
  out.measure.flags = f;
  step('no frame-rate switches (disable-frame-rate-limit / disable-gpu-vsync absent: the screen\'s own refresh, vsync on)', f && !f['disable-frame-rate-limit'] && !f['disable-gpu-vsync'], f);
});

async function round(tag, copy) {
  try { if (copy) localStorage.setItem('playlatency.test', JSON.stringify({ copy: true })); else localStorage.removeItem('playlatency.test'); } catch { /* fine */ }
  const M = out.measure[tag] = {};
  GameMode.play({ kind: 'lab', id: sceneId, title: scene.name }).catch((err) => step(`${tag}: ▶ Play opens`, false, String(err)));
  await until(playing, 60000);
  const drawn = await until(() => ev('window.__hearthGame && window.__hearthGame.drawn && window.__gameInfo && window.__gameInfo().frames > 10'), 90000);
  step(`${tag}: the scene plays in its window`, drawn);
  await wait(6500); // (past getting ready's first 5 s of play: its hooks retire, the look's guard settles)
  const gi = await ev('JSON.stringify(window.__gameInfo())');
  const info = gi ? JSON.parse(gi) : {};
  const st = await G().state();
  M.canvas = { fast: info.fast, preserve: info.preserve, merged: info.merged, cap: info.cap, pace: info.pace, hz: st.hz };
  await ev(PROBE);
  await wait(1500);
  const idle = await take();
  M.idle = { frameMs: pct(idle.gaps, 0.5), frameP95: pct(idle.gaps, 0.95), msgsPerSec: r1(idle.msgs / 1.5) };
  // real input: keys W / D (24 presses) at random phases of the frame, then mouse moves
  const W = await ev('innerWidth'); const Hh = await ev('innerHeight');
  for (let i = 0; i < 24; i += 1) { await key(i % 2 ? 'KeyD' : 'KeyW', 10); await wait(30 + Math.random() * 40); }
  for (let i = 0; i < 40; i += 1) { await mouse(W / 2 + (i % 2 ? 4 : -4), Hh / 2); await wait(25 + Math.random() * 40); }
  await wait(400);
  const d = await take();
  M.real = sum(d);
  const f = M.real.frameMs || M.idle.frameMs;
  const L = lim(f);
  step(`${tag}: real input → the game's frame p50 ≤ ${L.p50} ms, p95 ≤ ${L.p95} ms (1.25 / 2 frames of ${f} ms)`, M.real.n >= 20 && M.real.all[0] <= L.p50 && M.real.all[1] <= L.p95, { all: M.real.all, keys: M.real.keys, mouse: M.real.mouse, frame: f });
  // /game latency (the owner's measurement)
  const r = await G().latency({ ms: 2000 });
  M.cmd = r?.error ? { error: r.error } : { input: r.input, keys: r.keys?.frame, mouse: r.mouse?.frame, frameMs: r.frameMs, fps: r.fps, hz: r.hz, verdict: r.verdict, why: r.why, main: r.main, presented: r.presented, window: r.window, sent: r.sent, page: r.pageAnswered };
  step(`${tag}: /game latency measured (${r?.input?.n || 0} inputs; ${r?.line || r?.error})`, !r?.error && r.input?.n >= 10 && r.pageAnswered, M.cmd);
  step(`${tag}: /game latency → the very next frame (p50 ${r?.input?.p50} / p95 ${r?.input?.p95} ms on ${r?.frameMs} ms frames)`, r?.ok, { verdict: r?.verdict, why: r?.why });
  step(`${tag}: Hearth's key handler < 0.2 ms a key (${r?.main?.handlerMs} ms) · main process lag p99 ${r1(r?.main?.lag?.p99)} ms`, r?.main?.handlerMs != null && r.main.handlerMs < 0.2, r?.main);
  step(`${tag}: the window is never throttled, focused, full screen`, r?.window && r.window.throttled === false && r.window.visible, r?.window);
  M.pass = { ...M.canvas };
  return M;
}

await safe('before', async () => {
  const M = await round('before', true);
  step('before: the one canvas kept its picture (copied each frame, as up to round 55)', M.canvas.preserve === true, M.canvas);
  await G().leave(); await until(async () => !(await playing()), 10000); await wait(1000);
});
await safe('after', async () => {
  const M = await round('after', false);
  step('after: the one canvas is swapped to the screen, not copied (preserveDrawingBuffer off, nothing reads it)', M.canvas.fast === true && M.canvas.preserve === false, M.canvas);
  step('after: no fps cap, no pacing, no page messages per frame', M.canvas.cap === 0 && M.canvas.pace === false && (M.idle.msgsPerSec ?? 0) < 2, { ...M.canvas, msgsPerSec: M.idle.msgsPerSec });
  // the picture is still right with the copy gone: Hearth's own reads (a shot of the stack) draw it again first
  const peek = await ev('(() => { const c = document.createElement("canvas"); c.width = 32; c.height = 18; const g = c.getContext("2d"); g.drawImage(document.querySelector("canvas.gm-canvas"), 0, 0, 32, 18); const d = g.getImageData(0, 0, 32, 18).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; })()');
  out.measure.after.rawReadSum = peek;
  // the F chip: "Input: x ms" while it shows (from the player's own input), gone when it's off
  await key('KeyF');
  const on = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const c = r?.querySelector(".chip"); return c && !c.hidden; })()'), 4000);
  const Wd = await ev('innerWidth'); const Hd = await ev('innerHeight');
  for (let i = 0; i < 16; i += 1) { await key(i % 2 ? 'KeyD' : 'KeyW', 10); await mouse(Wd / 2 + (i % 2 ? 3 : -3), Hd / 2); await wait(40); }
  const chip = await until(() => ev('(() => { const c = document.querySelector("hearth-game-ui")?.shadowRoot?.querySelector(".chip"); return c && /Input: [\\d.]+ ms/.test(c.textContent) ? c.textContent : ""; })()'), 5000);
  out.measure.after.chip = chip || await ev('document.querySelector("hearth-game-ui")?.shadowRoot?.querySelector(".chip")?.textContent');
  step('the F chip shows "Input: x ms" while it\'s open', on && Boolean(chip), { chip: out.measure.after.chip });
  await key('KeyF');
  const offd = await until(() => ev('(() => { const c = document.querySelector("hearth-game-ui")?.shadowRoot?.querySelector(".chip"); return c && c.hidden; })()'), 4000);
  step('F again: the chip (and its measuring) off', offd);
  // the command, as the owner types it
  const said = await Commands.get('game').run('latency');
  out.measure.after.said = said;
  step('/game latency answers in plain words', /Input: [\d.]+ ms/.test(String(said)) && /frame/.test(String(said)), said);
  // the doctor's line carries the figure
  if (typeof GamePerf !== 'undefined' && GamePerf.doctor) {
    const d = await GamePerf.doctor({ secs: 1, show: false }).catch((err) => ({ error: String(err) }));
    out.measure.after.doctor = d?.input || d?.error || null;
    step('the doctor gets the "Input: x ms" figure', /Input: [\d.]+ ms/.test(String(d?.input || '')), out.measure.after.doctor);
  }
  await G().leave(); await until(async () => !(await playing()), 10000); await wait(800);
});
try { localStorage.removeItem('playlatency.test'); } catch { /* fine */ }

// the HTML game: nothing of Hearth's listens to its keys (GamePerf's probe used to add a keydown listener for its F)
await safe('html', async () => {
  GameMode.play({ kind: 'html', path: `${DIR}/html/index.html` }).catch((err) => step('▶ Play the HTML game', false, String(err)));
  const g = await until(() => ev('window.__game && window.__game.ready && window.__game.frames > 5'), 60000);
  step('the HTML game plays', g);
  await until(() => ev('Boolean(window.__gamePerf)'), 15000);
  await wait(800);
  let keydown = 0;
  for (const expr of ['window', 'document']) {
    const o = await pc('Runtime.evaluate', { expression: expr });
    const L = (await pc('DOMDebugger.getEventListeners', { objectId: o?.result?.objectId }))?.listeners || [];
    keydown += L.filter((l) => l.type === 'keydown').length;
  }
  out.measure.html = { keydownListeners: keydown, hearth: keydown - 1, probe: await ev('Boolean(window.__gamePerf)') };
  step('HTML game: no keydown listener of Hearth\'s (the game\'s own only)', keydown - 1 === 0, out.measure.html);
  const r = await G().latency({ ms: 1500 });
  out.measure.html.cmd = r?.error ? { error: r.error } : { input: r.input, frameMs: r.frameMs, verdict: r.verdict, why: r.why, handlerMs: r.main?.handlerMs, lagP99: r1(r.main?.lag?.p99) };
  step(`HTML game: /game latency → the next frame (${r?.line || r?.error})`, r?.ok, out.measure.html.cmd);
  await G().leave(); await until(async () => !(await playing()), 10000);
});

const B = out.measure.before; const A = out.measure.after;
if (B?.real && A?.real) out.measure.compare = { frameMs: [B.idle.frameMs, A.idle.frameMs], realP50: [B.real.all[0], A.real.all[0]], realP95: [B.real.all[1], A.real.all[1]], cmdP50: [B.cmd?.input?.p50, A.cmd?.input?.p50], cmdP95: [B.cmd?.input?.p95, A.cmd?.input?.p95] };
out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
