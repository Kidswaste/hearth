// ▶ Play's input latency (round 56, playlatency), main side: /game latency and the doctor's "Input" figure. Nothing
// here runs unless asked: a measurement is ~2 s of tiny synthetic input sent to the game window (F24, a key no game
// uses, and the mouse moved 1 px and back), measured by the window's preload from each input's timestamp to the
// animation frame that reads it (game-preload.js, listeners only for those 2 s), while this side times the main
// process's event loop (every key and mouse move goes through it before the game's page gets it) and the window's
// key handler. The F chip's own "Input: x ms" is the page's, from the player's real input, only while it shows.
//   gamemodemain.js: its channels call ask / result (main.js loads it on its channels' first call: they're in its source),
//   timed(fn) around its key handler, last(win) in info()
//   game:latency { ms } → summary (playlatency-core.js) · → window 'game:lat' { on } · ← window 'game:lat-result' json
const Core = require('./playlatency-core');

let M = null; // the measurement running: { win, handler: [ms], done }
const lastBy = new WeakMap(); // window → its last summary
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the window's key handler, timed only while measuring (one check otherwise)
function timed(fn) {
  return (e, input) => {
    if (!M) return fn(e, input);
    const t = performance.now();
    try { return fn(e, input); } finally { if (M && M.handler.length < 2000) M.handler.push(performance.now() - t); }
  };
}

async function measure(win, { ms = 2000, hz = 60 } = {}) {
  if (!win || win.isDestroyed()) throw new Error('No game is playing.');
  if (M) throw new Error('Already measuring.');
  const wc = win.webContents;
  const dur = Math.max(500, Math.min(10000, Number(ms) || 2000));
  const { monitorEventLoopDelay } = require('perf_hooks');
  const h = monitorEventLoopDelay({ resolution: 1 });
  let page = null;
  const got = new Promise((res) => { M = { win, handler: [], done: res }; });
  try {
    h.enable();
    wc.send('game:lat', { on: true });
    await sleep(120);
    const [w, ht] = win.getContentSize();
    const x = Math.round(w / 2); const y = Math.round(ht / 2);
    const frame = 1000 / (Number(hz) || 60);
    const t0 = Date.now(); let i = 0; let sent = 0;
    while (Date.now() - t0 < dur && !win.isDestroyed()) {
      // each input at a random point of a frame (as a hand would), about two frames apart (each its own frame)
      if (i % 2 === 0) { wc.sendInputEvent({ type: 'keyDown', keyCode: 'F24' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'F24' }); } else wc.sendInputEvent({ type: 'mouseMove', x: x + (i % 4 === 1 ? 1 : 0), y });
      i += 1; sent += 1;
      await sleep(Math.max(8, frame * 2 + Math.random() * frame));
    }
    await sleep(Math.max(60, frame * 3));
    if (!win.isDestroyed()) wc.send('game:lat', { on: false });
    page = await Promise.race([got, sleep(1500).then(() => null)]);
    h.disable();
    const lag = { p50: h.percentile(50) / 1e6, p99: h.percentile(99) / 1e6, max: h.max / 1e6 };
    const s = Core.summarize({ page: page || {}, main: { lag, handler: M.handler }, hz });
    s.sent = sent; s.at = Date.now(); s.pageAnswered = Boolean(page);
    // the window's frame pacing as Hearth set it: never throttled while it plays, focused, full screen
    if (!win.isDestroyed()) { try { s.window = { throttled: wc.getBackgroundThrottling?.() ?? null, focused: win.isFocused(), fullscreen: win.isFullScreen() || Boolean(win.isSimpleFullScreen?.()), visible: win.isVisible() }; } catch { s.window = null; } }
    if (!win.isDestroyed()) lastBy.set(win, s);
    return s;
  } finally { try { h.disable(); } catch { /* fine */ } M = null; }
}

// the window's preload answers with what it measured (only the game window, only while measuring): 'game:lat-result'
function result(e, json) {
  if (!M || M.win.isDestroyed() || e.sender !== M.win.webContents) return;
  let p = null; try { p = JSON.parse(String(json || '').slice(0, 400000)); } catch { p = null; }
  M.done(p);
}
// 'game:latency' { ms } → a measurement · { op: 'last' } → the last one of this game window
async function ask(G, req = {}) {
  if (!G?.win || G.win.isDestroyed()) return { error: 'No game is playing: ▶ Play one first.' };
  if (req.op === 'last') return lastBy.get(G.win) || null;
  try { return await measure(G.win, { ms: req.ms, hz: G.hz }); } catch (err) { return { error: err.message }; }
}
const last = (win) => (win ? lastBy.get(win) || null : null);
const brief = (s) => (s ? { line: s.line, input: s.input, frameMs: s.frameMs, fps: s.fps, verdict: s.verdict, at: s.at } : null);

module.exports = { ask, result, timed, measure, last, brief, measuring: () => Boolean(M) };
