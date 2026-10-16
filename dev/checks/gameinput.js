// ▶ Play feels instant to control (round 53, gameinput): input → the game's next frame → presented, in the game window.
// Real input (CDP Input.* into the ▶ Play window's page, trusted events, through the `pageCdp` bridge of dev/smoke.js)
// on the game-like Lab scene (dev/fixtures/game-lab-scene.js: three layers on one canvas, WASD + mouse look) and on
// the test HTML game (dev/fixtures/game-html). A probe in the game's page notes, per event:
//   handled   e.timeStamp (the OS input) → after every window-level capture listener (Hearth's player, the game's)
//   frame     → the start of the next animation frame (the game's frame that reads it), and in game frames
//   et        the Event Timing API: input → the frame presented (8 ms steps; < 16 ms isn't reported)
// and what Hearth itself puts on the input path: listeners on window / document per input type (CDP
// DOMDebugger.getEventListeners: the page's and the preload's), messages and timers a key starts, GPU read-backs a click
// starts, keys the game never gets (arrows taken by the Lab's ✥ Direct), plus the window's input setup: focus on open,
// the keys held for the game, raw mouse (unadjustedMovement), coalesced events, gamepads, no selection / drag ghosts, Esc.
// Budgets (BUDGET): fails above them (window.GI_REPORT = 1 reports without failing: the "before" runs).
// Xvfb: a 60 Hz display, software GL (SwiftShader), shared CPUs, no window manager: absolute ms carry the machine; the
// counts (listeners, messages, read-backs, frames) are Hearth's own and are the budgets that matter.
//   node dev/smoke.js --screen 1280x720 --check-timeout 600000 --script dev/checks/gameinput.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const REPORT = Boolean(window.GI_REPORT);
const out = { steps: [], measure: {}, budgets: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok) || REPORT, ...(REPORT && !ok ? { would: 'fail' } : {}), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 400) }); } };
const DIR = '/tmp/hearth-gamemode';
const G = () => window.hub.game;
const ev = async (code) => (await G().eval(code))?.value;
const playing = async () => (await G().state())?.playing;
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (a, p) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const pc = (method, params) => Promise.race([smoke({ pageCdp: '^hearth-game:', cdp: method, params }), wait(5000).then(() => ({ error: 'timeout' }))]);
const KC = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, ArrowLeft: 37, ArrowRight: 39, Escape: 27, Space: 32, KeyF: 70 };
const keyOf = (code) => ({ key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code, code, windowsVirtualKeyCode: KC[code] || 0, nativeVirtualKeyCode: KC[code] || 0 });
async function key(code, hold = 0) {
  const k = keyOf(code);
  await pc('Input.dispatchKeyEvent', { type: k.key.length === 1 ? 'keyDown' : 'rawKeyDown', ...k, ...(k.key.length === 1 ? { text: k.key } : {}) });
  if (hold) await wait(hold);
  await pc('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
}
const mouse = (type, x, y, extra = {}) => pc('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const BUDGET = {
  listeners: 4, // Hearth's listeners on window / document for the busiest input type (keydown, pointermove…), the probe not counted
  msgsPerKey: 0, // messages / timers a key press starts in the page (the Lab player answering itself)
  readbacksPerClick: 0, // GPU read-backs a click starts (the Lab's ✥ Direct picking a layer under the mouse)
  handledP95: 60, // ms, input → every capture listener done (machine-bound: loose)
  framesP95: 2, // the game's frames between the input and the frame that reads it (1 = the very next one)
};
out.budgets = BUDGET;

// ---------- the probe (runs in the game's page) ----------
const PROBE = `(() => {
  if (window.__gi) return 'again';
  const P = window.__gi = { ev: [], et: [], msgs: 0, frames: 0, pads: 0 };
  const gf = () => ((globalThis.__clink || window.__game || {}).frames) || 0;
  const now = () => performance.now();
  const rec = (e) => {
    const r = { t: e.type, ts: e.timeStamp, h: now(), co: e.getCoalescedEvents ? e.getCoalescedEvents().length : 0, f0: gf(), mx: e.movementX || 0 };
    P.ev.push(r);
    if (P.ev.length > 600) P.ev.shift();
    requestAnimationFrame((ft) => { r.raf = now(); r.ft = ft; const f1 = gf(); r.f1 = f1; requestAnimationFrame(() => { r.f2 = gf(); }); });
  };
  for (const t of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'wheel']) document.addEventListener(t, rec, { capture: true, passive: true });
  addEventListener('message', (e) => { if (!/^ready-/.test((e.data && e.data.type) || '')) P.msgs += 1; }, true); // (GameReady's own first-seconds count aside)
  const gp = navigator.getGamepads && navigator.getGamepads.bind(navigator);
  if (gp) navigator.getGamepads = function () { P.pads += 1; return gp(); };
  try { new PerformanceObserver((l) => { for (const x of l.getEntries()) P.et.push({ n: x.name, s: x.startTime, d: x.duration, ps: x.processingStart, pe: x.processingEnd }); }).observe({ type: 'event', durationThreshold: 16, buffered: false }); } catch (e) { P.etErr = String(e); }
  return 'ok';
})()`;
const take = async () => JSON.parse(await ev('JSON.stringify((() => { const P = window.__gi; const o = { ev: P.ev.splice(0), et: P.et.splice(0), msgs: P.msgs, pads: P.pads }; P.msgs = 0; P.pads = 0; return o; })())'));
function summarize(d, types) {
  const e = d.ev.filter((x) => types.includes(x.t));
  const handled = e.map((x) => x.h - x.ts);
  const frame = e.filter((x) => x.raf).map((x) => x.raf - x.ts);
  // game frames until one ran after it: f1 > f0 → the frame of the probe's rAF (or the one before it) ran the game
  const frames = e.filter((x) => x.f2 != null).map((x) => (x.f1 > x.f0 ? 1 : x.f2 > x.f0 ? 2 : 3));
  const et = d.et.filter((x) => types.includes(x.n));
  return { n: e.length, handled: [pct(handled, 0.5), pct(handled, 0.95)], frame: [pct(frame, 0.5), pct(frame, 0.95)], frames: [pct(frames, 0.5), pct(frames, 0.95)], et: et.length ? [pct(et.map((x) => x.d), 0.5), pct(et.map((x) => x.d), 0.95)] : '< 16', coMax: Math.max(0, ...e.map((x) => x.co)) };
}
// Hearth's listeners on the input path (window + document), by type; the probe's (no script URL) left out
async function listeners() {
  const types = ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'wheel', 'contextmenu', 'message'];
  const by = {}; const where = {};
  for (const expr of ['window', 'document']) {
    const o = await pc('Runtime.evaluate', { expression: expr });
    const id = o?.result?.objectId;
    if (!id) { by.error = o?.error || 'no object'; continue; }
    const L = (await pc('DOMDebugger.getEventListeners', { objectId: id }))?.listeners || [];
    for (const l of L) {
      if (!types.includes(l.type)) continue;
      by[l.type] = (by[l.type] || 0) + 1;
      (where[l.type] ||= []).push(`${expr}:${l.scriptId}:${l.lineNumber}`);
    }
  }
  return { by, where };
}

await until(() => window.hub && performance.getEntriesByName('hearth:ready').length);
const scene = JSON.parse(await window.hub.fs.read(`${DIR}/lab-scene.json`));
activate('tool:three');
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director, 30000);
if (typeof Lazy !== 'undefined') await Lazy.load('gamemode').catch(() => {});
await until(() => typeof GameMode !== 'undefined', 20000);
let sceneId = null;
// window.GI_LOWLAT = 1 / 0: the low-latency canvas on / off for this run (/game lowlatency; measured both ways)
if (window.GI_LOWLAT != null) store.set('gamemode.lowLatency', Boolean(Number(window.GI_LOWLAT)));
out.measure.lowLatency = store.get('gamemode.lowLatency', false);

// ---------- a Lab scene (the main path: Clink) ----------
await safe('lab', async () => {
  const layers = scene.layers.map((L, i) => ({ id: ['sky', 'world', 'hud'][i], name: L.name, code: L.code }));
  const x = ThreeLab.scenes.create({ name: scene.name, code: layers[0].code, layers, open: true });
  sceneId = x?.id || ThreeLab.scenes.all().find((s) => s.name === scene.name)?.id;
  ThreeLab.scenes.open(sceneId);
  await wait(2000);
  const t0 = performance.now();
  GameMode.play({ kind: 'lab', id: sceneId, title: scene.name }).catch((err) => step('▶ Play opens', false, String(err)));
  await until(playing, 60000);
  const drawn = await until(() => ev('window.__hearthGame && window.__hearthGame.drawn && window.__gameInfo && window.__gameInfo().frames > 10'), 90000);
  out.measure.openMs = Math.round(performance.now() - t0);
  step('the scene plays in its window', drawn);
  await wait(800);
  const st = await G().state();
  out.measure.lab = { setup: st.input || null, focus: await ev('document.hasFocus()'), fullscreenEl: await ev('document.fullscreenElement ? document.fullscreenElement.tagName : null') };
  step('the game window has the focus when it opens (keys go to the game without a click)', out.measure.lab.focus === true && (!st.input || st.input.focus?.ok !== false), { page: out.measure.lab.focus, main: st.input?.focus });
  // the browser's Keyboard Lock is refused by Electron 44 (navigator.keyboard.lock: "could not be registered", in Hearth's own
  // window too); Hearth holds the keys it can itself, from the window's key handler
  out.measure.keyboardLockApi = await ev('(async () => { try { await navigator.keyboard.lock(); navigator.keyboard.unlock(); return "granted"; } catch (e) { return "refused: " + e.message; } })()');
  step('keys held for the game by the window (⌘ shortcuts / Alt+Space), Esc keeps its card', Boolean(st.input?.keys?.held) && out.measure.lab.fullscreenEl == null, { keys: st.input?.keys, keyboardLockApi: out.measure.keyboardLockApi });
  // nothing selectable, no drag ghosts
  const sel = JSON.parse(await ev('JSON.stringify({ us: getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect, drag: getComputedStyle(document.querySelector("canvas") || document.body).webkitUserDrag || null })'));
  step('no text selection or drag ghosts in the game window', sel.us === 'none' && sel.drag === 'none', sel);
  // low-latency canvas (desynchronized) for the one merged canvas
  out.measure.lab.canvas = JSON.parse(await ev('JSON.stringify((() => { const c = document.querySelector("canvas.gm-canvas"); const g = c && (c.getContext("webgl2")); const a = g && g.getContextAttributes(); return a ? { desynchronized: a.desynchronized, antialias: a.antialias, alpha: a.alpha } : null; })())'));
  // the probe and what Hearth puts on the input path
  await ev(PROBE);
  const L = await listeners();
  out.measure.lab.listeners = L.by; out.measure.lab.keydownAt = L.where.keydown;
  const busiest = Math.max(0, ...['keydown', 'pointermove', 'pointerdown', 'mousedown', 'pointerup', 'keyup', 'wheel'].map((t) => (L.by[t] || 0) - 1)); // (-1: the probe's own)
  out.measure.lab.listenersMax = busiest;
  step(`Hearth's listeners on the input path ≤ ${BUDGET.listeners} per type`, busiest <= BUDGET.listeners, { max: busiest, by: L.by });
  await take();
  // keys: W / D held briefly, 24 presses
  for (let i = 0; i < 24; i += 1) { await key(i % 2 ? 'KeyD' : 'KeyW', 20); await wait(40); }
  await wait(400);
  const k = await take();
  const ks = summarize(k, ['keydown', 'keyup']);
  out.measure.lab.keys = { ...ks, msgsPerKey: r1(k.msgs / 24) };
  const seen = await ev('globalThis.__clink && globalThis.__clink.presses');
  step('keys reach the game', seen >= 24, { presses: seen });
  step(`a key starts no message / timer in the page (≤ ${BUDGET.msgsPerKey} per key)`, k.msgs / 24 <= BUDGET.msgsPerKey, { msgs: k.msgs });
  step(`key → handled p95 ≤ ${BUDGET.handledP95} ms`, ks.handled[1] != null && ks.handled[1] <= BUDGET.handledP95, ks.handled);
  step(`key → the game's frame: p95 ≤ ${BUDGET.framesP95} frames`, ks.frames[1] != null && ks.frames[1] <= BUDGET.framesP95, { frames: ks.frames, ms: ks.frame });
  // a click on the world (captures the mouse), then mouse looks and an arrow key
  const W = await ev('innerWidth'); const Hh = await ev('innerHeight');
  const reads0 = await ev('window.__labDirect ? window.__labDirect.state().reads : 0');
  const cx = W / 2; const cy = Hh / 2 + 40;
  await mouse('mouseMoved', cx, cy, { button: 'none' });
  await mouse('mousePressed', cx, cy); await mouse('mouseReleased', cx, cy);
  await wait(500);
  const dsel = JSON.parse(await ev('JSON.stringify(window.__labDirect ? { reads: window.__labDirect.state().reads, sel: window.__labDirect.state().sel, shown: window.__labDirect.state().shown } : null)'));
  out.measure.lab.click = { readbacks: dsel ? dsel.reads - reads0 : 0, selected: dsel?.sel || null, outline: dsel?.shown || false, locked: await ev('Boolean(document.pointerLockElement)'), raw: await ev('Element.prototype.requestPointerLock.hearthRaw || null') };
  step(`a click in the game reads nothing back from the GPU (≤ ${BUDGET.readbacksPerClick}) and picks no layer`, out.measure.lab.click.readbacks <= BUDGET.readbacksPerClick && !out.measure.lab.click.selected, out.measure.lab.click);
  step('a click captures the mouse with raw movement asked (unadjustedMovement, plain as the fallback)', out.measure.lab.click.raw != null, { raw: out.measure.lab.click.raw, locked: out.measure.lab.click.locked });
  await take();
  await key('ArrowLeft', 30);
  const arrow = await until(() => ev('globalThis.__clink && globalThis.__clink.lastKey === "ArrowLeft"'), 2000);
  step('arrow keys reach the game after a click (not taken to nudge a layer)', arrow, { last: await ev('globalThis.__clink && globalThis.__clink.lastKey') });
  // mouse look: 90 moves sent back to back (several per frame here): coalesced
  for (let i = 0; i < 90; i += 1) mouse('mouseMoved', cx + (i % 30) * 6 - 90, cy + ((i % 7) - 3) * 2, { button: 'none' });
  await wait(1200);
  const m = await take();
  const ms = summarize(m, ['pointermove']);
  out.measure.lab.mouse = ms;
  step('coalesced pointer events reach the game (getCoalescedEvents: every move of a fast mouse)', ms.n > 0 && (ms.coMax >= 1), { n: ms.n, coMax: ms.coMax, rawUpdate: await ev('"onpointerrawupdate" in window') });
  step(`mouse move → the game's frame: p95 ≤ ${BUDGET.framesP95} frames`, ms.frames[1] != null && ms.frames[1] <= BUDGET.framesP95, { frames: ms.frames, ms: ms.frame, handled: ms.handled });
  // gamepads: the API is there with rumble, and nothing of Hearth polls them
  await wait(1000);
  const pad = JSON.parse(await ev('JSON.stringify({ api: typeof navigator.getGamepads === "function", rumble: typeof GamepadHapticActuator !== "undefined", polls: window.__gi.pads, allowed: document.featurePolicy ? document.featurePolicy.allowsFeature("gamepad") : null })'));
  out.measure.lab.gamepad = pad;
  step('gamepads: the API and rumble (vibrationActuator) are there; Hearth adds no polling', pad.api && pad.rumble && pad.polls === 0 && pad.allowed !== false, pad);
  // Esc: the card; Esc again leaves
  await key('Escape');
  const card = await until(() => ev('(() => { const r = document.querySelector("hearth-game-ui")?.shadowRoot; const c = r?.querySelector(".card"); return c && !c.hidden; })()'), 4000);
  step('Esc shows "Back to Hearth"', card);
  await key('Escape');
  const left = await until(async () => !(await playing()), 8000);
  step('Esc again leaves', left);
});

// ---------- an HTML game ----------
await safe('html', async () => {
  await wait(800);
  GameMode.play({ kind: 'html', path: `${DIR}/html/index.html` }).catch((err) => step('▶ Play the HTML game', false, String(err)));
  const g = await until(() => ev('window.__game && window.__game.ready && window.__game.frames > 5'), 60000);
  step('the HTML game plays', g);
  await wait(600);
  const st = await G().state();
  out.measure.html = { setup: st.input || null, focus: await ev('document.hasFocus()'), fullscreenEl: await ev('document.fullscreenElement ? document.fullscreenElement.tagName : null') };
  await ev(PROBE);
  const L = await listeners();
  out.measure.html.canvas = JSON.parse(await ev('JSON.stringify((() => { const c = document.querySelector("canvas"); const g = c && c.getContext("webgl2"); const a = g && g.getContextAttributes(); return a ? { desynchronized: a.desynchronized, antialias: a.antialias } : null; })())'));
  out.measure.html.listeners = L.by; out.measure.html.keydownAt = L.where.keydown;
  out.measure.html.listenersMax = Math.max(0, ...['keydown', 'pointermove', 'pointerdown', 'mousedown', 'keyup'].map((t) => (L.by[t] || 0) - 1 - (t === 'keydown' || t === 'keyup' ? 1 : 0) - (t === 'mousemove' ? 1 : 0))); // (the game's own keydown / keyup not counted)
  await take();
  for (let i = 0; i < 16; i += 1) { await key(i % 2 ? 'KeyA' : 'KeyS', 20); await wait(40); }
  await wait(400);
  const k = await take();
  out.measure.html.keys = summarize(k, ['keydown', 'keyup']);
  step('keys reach the HTML game', (await ev('window.__game.presses')) >= 16);
  // the game asks for the mouse itself (canvas.requestPointerLock()): raw movement asked for it
  const W = await ev('innerWidth'); const Hh = await ev('innerHeight');
  await mouse('mousePressed', W / 2, Hh / 2); await mouse('mouseReleased', W / 2, Hh / 2);
  await wait(600);
  out.measure.html.pointer = { locked: await ev('Boolean(document.pointerLockElement)'), raw: await ev('Element.prototype.requestPointerLock.hearthRaw || null') };
  step('the game\'s own pointer lock asks for raw movement (unadjustedMovement), with a fallback', /asked|raw|fallback|refused/.test(String(out.measure.html.pointer.raw)), out.measure.html.pointer);
  const sel = JSON.parse(await ev('JSON.stringify({ us: getComputedStyle(document.body).userSelect, drag: getComputedStyle(document.querySelector("canvas")).webkitUserDrag || null })'));
  step('HTML game: no text selection or drag ghosts', sel.us === 'none' && sel.drag === 'none', sel);
  step('HTML game: focus on open, keys held for the game', out.measure.html.focus === true && (!st.input || (st.input.focus?.ok !== false && Boolean(st.input.keys?.held))), { focus: out.measure.html.focus, main: st.input?.focus, keys: st.input?.keys });
  // a game that hangs: Esc twice still leaves (main-side, the page can't answer)
  await ev('setTimeout(() => { const t = Date.now(); while (Date.now() - t < 6000) { /* a stuck game */ } }, 50), 1');
  await wait(300);
  const t0 = performance.now();
  await G().key({ key: 'Escape' }); await wait(150); await G().key({ key: 'Escape' });
  const left = await until(async () => !(await playing()), 5000);
  out.measure.html.hungLeaveMs = left ? Math.round(performance.now() - t0) : null;
  step('a stuck game: Esc twice still leaves (from the window\'s key handler)', left && out.measure.html.hungLeaveMs < 4000, { ms: out.measure.html.hungLeaveMs });
  if (!left) { await G().leave(); await until(async () => !(await playing()), 10000); }
});

out.pass = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
