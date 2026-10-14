// The recording's frame pump, off the window's thread (round 16, videoperf). capture.js hands this worker the page
// capture's frames (a MediaStreamTrackProcessor's stream) and the writable end of a MediaStreamTrackGenerator (the
// track the recorder encodes); the worker crops / scales each captured frame into its own canvas (the target's
// rectangle, a social frame) and sends that canvas as a VideoFrame every 1/fps, stamped with its time, whether or not
// the picture changed (a constant frame rate, the real length). The window's thread does nothing per frame while
// recording: the UI being filmed stays as smooth as when it isn't. capture.js falls back to drawing on its own thread
// when this can't run.
// (round 36, capturefix) It used to repaint a canvas handed over with transferControlToOffscreen and let the window's
// canvas.captureStream() pick the frames up. Such a capture stream only takes a frame when the window itself paints, so
// a still screen (nothing animating anywhere) gave the encoder nothing: a 7.4 s take of a still area saved as ≈ 1.2 s.
// Frames written to a generator reach the encoder with their own times, painted or not.
// Messages in: open { readable } → 'first' { ok, w, h } · start { writable, w, h, rect, view, frame, fps } · rect
// { rect, view } (the target moved) · fps { fps } (slower when the encoder falls behind) · pause { on } · stop.
// Out: first, stats { framesIn, framesOut, age } twice a second, error { message }.
let reader = null; let canvas = null; let g = null; let held = null; let writer = null; let pending = 0; let dirty = true; let last = null; let t0 = 0; let pausedAt = 0; let pausedMs = 0;
let rect = null; let view = { w: 1, h: 1 }; let fit = false;
let ticker = 0; let statsT = 0; let paused = false; let stopped = false;
let framesIn = 0; let framesOut = 0; let lastIn = 0; let sw = 0; let sh = 0;

function srcRect() {
  const r = rect || { x: 0, y: 0, width: view.w, height: view.h };
  const k = sw / (view.w || 1);
  return { x: r.x * k, y: r.y * k, w: r.width * k, h: r.height * k };
}
function draw(f) {
  sw = f.displayWidth; sh = f.displayHeight;
  let { x, y, w, h } = srcRect();
  if (fit) { // cover the social frame, centered on the target
    const k = canvas.width / canvas.height; const cx = x + w / 2; const cy = y + h / 2;
    if (w / h > k) w = h * k; else h = w / k;
    x = Math.max(0, Math.min(sw - w, cx - w / 2)); y = Math.max(0, Math.min(sh - h, cy - h / 2));
  }
  g.drawImage(f, x, y, w, h, 0, 0, canvas.width, canvas.height);
  dirty = true;
}
async function pumpIn() {
  while (!stopped) {
    let r;
    try { r = await reader.read(); } catch { break; }
    if (r.done || !r.value) break;
    framesIn += 1; lastIn = performance.now();
    try { if (!paused) draw(r.value); } catch (err) { postMessage({ type: 'error', message: err.message }); } finally { r.value.close(); }
  }
}
// the frame clock: the canvas as it is now, stamped with the take's time (pauses left out). An unchanged picture is the
// last frame again under a new time (it shares the pixels: no copy, next to no work while the screen is still). Frames
// the recorder hasn't taken yet (a busy machine) are not piled up: the take keeps its length at a lower rate.
function tick() {
  if (paused || stopped || !g || !writer || pending >= 15) return;
  let f;
  try {
    if (dirty || !last) { last?.close(); last = new VideoFrame(canvas, { timestamp: 0 }); dirty = false; }
    f = new VideoFrame(last, { timestamp: Math.round((performance.now() - t0 - pausedMs) * 1000) });
  } catch { return; }
  pending += 1;
  writer.write(f).catch(() => { try { f.close(); } catch { /* closed */ } }).finally(() => { pending -= 1; });
  framesOut += 1;
}
function setFps(fps) { clearInterval(ticker); ticker = setInterval(tick, 1000 / Math.max(1, fps || 30)); }
function stop() {
  stopped = true;
  clearInterval(ticker); clearInterval(statsT);
  reader?.cancel().catch(() => {});
  writer?.close().catch(() => {}); writer = null;
  try { last?.close(); } catch { /* closed */ } last = null;
  try { held?.close(); } catch { /* closed */ }
}

onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.cmd === 'open') {
      reader = m.readable.getReader();
      const r = await reader.read();
      if (r.done || !r.value) { postMessage({ type: 'first', ok: false }); return; }
      held = r.value;
      postMessage({ type: 'first', ok: true, w: held.displayWidth, h: held.displayHeight });
    } else if (m.cmd === 'start') {
      canvas = new OffscreenCanvas(m.w, m.h);
      g = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      writer = m.writable.getWriter();
      t0 = performance.now();
      g.imageSmoothingQuality = 'high';
      rect = m.rect; view = m.view; fit = Boolean(m.frame);
      if (held) { draw(held); held.close(); held = null; }
      pumpIn();
      setFps(m.fps);
      statsT = setInterval(() => postMessage({ type: 'stats', framesIn, framesOut, age: lastIn ? performance.now() - lastIn : 0 }), 500);
    } else if (m.cmd === 'rect') { rect = m.rect; view = m.view; }
    else if (m.cmd === 'fps') setFps(m.fps);
    else if (m.cmd === 'pause') {
      const on = Boolean(m.on);
      if (on && !paused) pausedAt = performance.now();
      else if (!on && paused) pausedMs += performance.now() - pausedAt;
      paused = on;
    }
    else if (m.cmd === 'stop') stop();
  } catch (err) { postMessage({ type: m.cmd === 'open' ? 'first' : 'error', ok: false, message: err.message }); }
};
