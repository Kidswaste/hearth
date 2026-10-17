// ▶ Play's input latency (round 56, playlatency), the pure part: no Electron, no files. Required by playlatencymain.js
// (/game latency, the doctor's "Input" figure) and dev/playlatency-test.js.
//   summarize({ page, main, hz, sent }) → { input, keys, mouse, frameMs, fps, hz, main, verdict, ok, line, text }
//     page: what the game window's preload measured ({ k: [[handled, frame]…] keys, m: […] mouse moves, et: [ms…]
//           Event Timing (input → presented, only ≥ 16 ms is reported), gaps: [ms…] between animation frames})
//     main: { lag: { p50, p99, max } (the main process's event loop, ms), handler: [ms…] (the window's key handler) }
//   Numbers are ms from the input's own timestamp (the OS's, or the main process's for /game latency's synthetic
//   input) to: handled = Hearth's and the game's capture listeners done; frame = the start of the animation frame that
//   reads it (the game's next frame). On screen is one or two refreshes later (the browser's compositor + the screen):
//   not measurable from a page; the figure is said as such, never added in.
(function () {
  const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
  function pct(list, p) {
    const s = (list || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
  }
  const median = (list) => pct(list, 0.5);
  function part(rows) {
    const R = (rows || []).filter((x) => Array.isArray(x) && Number.isFinite(x[1]));
    return { n: R.length, handled: [r1(pct(R.map((x) => x[0]), 0.5)), r1(pct(R.map((x) => x[0]), 0.95))], frame: [r1(pct(R.map((x) => x[1]), 0.5)), r1(pct(R.map((x) => x[1]), 0.95))] };
  }
  // the frame time: the steady interval between frames (the median; a hitch doesn't move it)
  function frameOf(gaps, hz) {
    const g = (gaps || []).filter((x) => x > 0.5 && x < 1000);
    const m = median(g);
    return m ? m : 1000 / (Number(hz) || 60);
  }
  function summarize({ page = {}, main = {}, hz = 60 } = {}) {
    const keys = part(page.k); const mouse = part(page.m);
    const all = [...(page.k || []), ...(page.m || [])].filter((x) => Array.isArray(x) && Number.isFinite(x[1])).map((x) => x[1]);
    const frameMs = r1(frameOf(page.gaps, hz));
    const fps = frameMs ? Math.round(1000 / frameMs) : null;
    const input = { n: all.length, p50: r1(median(all)), p95: r1(pct(all, 0.95)) };
    const et = (page.et || []).filter((x) => Number.isFinite(x));
    const presented = { n: et.length, p50: r1(median(et)) };
    const lag = main.lag || null;
    const handler = (main.handler || []).filter((x) => Number.isFinite(x));
    const handlerMs = handler.length ? Math.round(median(handler) * 1000) / 1000 : null;
    // the verdict: the game sees an input in the frame right after it (the shortest a browser allows) when the
    // typical input reaches the next frame within about one frame, and nearly all within two
    let verdict = 'next-frame'; let why = '';
    if (!input.n) { verdict = 'none'; why = 'no input reached the game (it may not have the focus)'; } else if (input.p50 > frameMs * 1.25 + 1 || input.p95 > frameMs * 2 + 4) {
      verdict = 'late';
      if (lag && lag.p99 > Math.max(frameMs, 8)) why = `Hearth's main process was busy (${r1(lag.p99)} ms at worst): every input waits for it`;
      else if (fps && hz && fps < hz * 0.8) why = `frames come slower than the screen (${fps} fps on ${Math.round(hz)} Hz): the game's frame is the limit`;
      else why = 'the game\'s page was busy between frames';
    }
    const ok = verdict === 'next-frame';
    const line = input.n ? `Input: ${input.p50 < 10 ? input.p50.toFixed(1) : Math.round(input.p50)} ms` : '';
    const lines = [];
    if (input.n) {
      lines.push(`${line} to the game's next frame, typically (${input.p95} ms at worst) · keys ${keys.frame[0] ?? '–'} ms · mouse ${mouse.frame[0] ?? '–'} ms (${input.n} inputs)`);
      lines.push(ok ? 'As short as the browser allows: each input is in the very next frame.' : `Slower than the next frame: ${why}.`);
    } else lines.push(`No input measured: ${why}.`);
    lines.push(`Frames: every ${frameMs} ms (${fps} fps on a ${Math.round(hz)} Hz screen)${fps && hz && fps < hz * 0.8 ? ' — slower than the screen' : ''}; on screen one or two refreshes after that frame (the browser's own pipeline)${presented.n ? ` · input → on screen ${presented.p50} ms (Chromium's measure, only slow ones are reported)` : ''}.`);
    const hp = [];
    if (handlerMs != null) hp.push(`${handlerMs < 0.01 ? '< 0.01' : handlerMs.toFixed(2)} ms a key in the window's key handler`);
    if (lag) hp.push(`Hearth's main process answered within ${r1(lag.p99)} ms (99 %)`);
    if (hp.length) lines.push(`Hearth's part: ${hp.join(' · ')}; nothing of Hearth's waits between the input and the game.`);
    return { input, keys, mouse, frameMs, fps, hz: Math.round(Number(hz) || 60), presented, main: { lag, handlerMs }, verdict, why, ok, line, text: lines.join('\n') };
  }
  const api = { summarize, pct, median, frameOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
}());
