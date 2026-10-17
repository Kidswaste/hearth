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
// the part of a captured frame to film (the target's rectangle, or the social frame centered on it), in its pixels
function cropOf(f) {
  sw = f.displayWidth; sh = f.displayHeight;
  let { x, y, w, h } = srcRect();
  if (fit) { // cover the social frame, centered on the target
    const k = canvas.width / canvas.height; const cx = x + w / 2; const cy = y + h / 2;
    if (w / h > k) w = h * k; else h = w / k;
    x = Math.max(0, Math.min(sw - w, cx - w / 2)); y = Math.max(0, Math.min(sh - h, cy - h / 2));
  }
  return { x, y, w, h };
}
// (round 57, capturelab) A captured frame lives on the GPU. Drawn straight into this canvas, its pixels were read back
// when the clock next made a VideoFrame of the canvas, and that read waits for the GPU process: behind the Lab's own
// frames when the Lab plays (0.5–1.4 s a frame on a busy software GPU), so the clock and the reader stalled with it and
// a moving-Lab take came out with a handful of frames (one frame for a 3 s take). Now the crop is copied to memory
// asynchronously (copyTo: the GPU process answers when it can, this thread keeps ticking) and stays in memory: kept as
// it is when it has the take's size, scaled through two memory canvases otherwise. Frames that come while a copy is
// under way replace each other (the picture is always the newest). An engine that can't copy draws as before.
let pic = false; let busy = false; let latest = null; let copyOk = typeof VideoFrame !== 'undefined' && typeof VideoFrame.prototype.copyTo === 'function';
let px = null; let spare = null; // the newest picture's pixels at the take's size (null: read the canvas) · a free buffer
let stage = null; let sg = null; // (the copied crop, when it must be scaled to the take's size)
function drawNow(f) { const { x, y, w, h } = cropOf(f); g.drawImage(f, x, y, w, h, 0, 0, canvas.width, canvas.height); px = null; dirty = true; pic = true; }
async function drawCopied(f) {
  const c = cropOf(f);
  // a take at the target's own pixels is its size rounded to even numbers: the crop is taken at that size, not scaled
  for (const [k, K, o] of [['w', canvas.width, 'x'], ['h', canvas.height, 'y']]) if (c[k] !== K && Math.abs(c[k] - K) <= 2) { c[o] += (c[k] - K) / 2; c[k] = K; }
  const v = f.visibleRect || { x: 0, y: 0, width: f.codedWidth, height: f.codedHeight }; // (copyTo's rect is in coded pixels)
  const x = v.x + Math.max(0, Math.min(v.width - 1, Math.floor(c.x))); const y = v.y + Math.max(0, Math.min(v.height - 1, Math.floor(c.y)));
  const rect = { x, y, width: Math.max(1, Math.min(v.x + v.width - x, Math.round(c.w))), height: Math.max(1, Math.min(v.y + v.height - y, Math.round(c.h))) };
  const n = rect.width * rect.height * 4;
  const b = spare?.length === n ? spare : new Uint8ClampedArray(n); spare = null;
  await f.copyTo(b, { rect, format: 'RGBA', layout: [{ offset: 0, stride: rect.width * 4 }] });
  if (stopped || !g) return;
  if (rect.width === canvas.width && rect.height === canvas.height) { if (px?.length === n) spare = px; px = b; } // (as it is)
  else {
    if (!stage || stage.width !== rect.width || stage.height !== rect.height) { stage = new OffscreenCanvas(rect.width, rect.height); sg = stage.getContext('2d', { alpha: false, willReadFrequently: true }); }
    sg.putImageData(new ImageData(b, rect.width, rect.height), 0, 0);
    g.drawImage(stage, 0, 0, canvas.width, canvas.height); // (memory canvas to memory canvas: no GPU)
    px = null; spare = b;
  }
  dirty = true; pic = true;
}
async function drawLatest() {
  if (busy) return;
  busy = true;
  try {
    while (latest && !stopped) {
      const f = latest; latest = null;
      try {
        if (!paused) {
          if (copyOk) { try { await drawCopied(f); } catch { copyOk = false; drawNow(f); } }
          else drawNow(f);
        }
      } catch (err) { postMessage({ type: 'error', message: err.message }); } finally { f.close(); }
    }
  } finally { busy = false; }
}
function take(f) { latest?.close(); latest = f; drawLatest(); }
async function pumpIn() {
  while (!stopped) {
    let r;
    try { r = await reader.read(); } catch { break; }
    if (r.done || !r.value) break;
    framesIn += 1; lastIn = performance.now();
    if (paused) r.value.close(); else take(r.value);
  }
  latest?.close(); latest = null;
}
// the frame clock: the canvas as it is now, stamped with the take's time (pauses left out). An unchanged picture is the
// last frame again under a new time (it shares the pixels: no copy, next to no work while the screen is still). Frames
// the recorder hasn't taken yet (a busy machine) are not piled up: the take keeps its length at a lower rate.
// (round 57) The picture as a frame in memory: a VideoFrame made of the canvas itself becomes a GPU image, and making
// one waits for the GPU process too (0.3–0.6 s behind a playing Lab here); pixels in memory (the copied crop, or the
// memory canvas's) make a frame the encoder takes as it is. The canvas itself is the fallback.
let memOk = true;
function snapshot() {
  if (memOk && copyOk) {
    try { return new VideoFrame(px || g.getImageData(0, 0, canvas.width, canvas.height).data, { format: 'RGBX', codedWidth: canvas.width, codedHeight: canvas.height, timestamp: 0 }); } catch { memOk = false; }
  }
  return new VideoFrame(canvas, { timestamp: 0 });
}
function tick() {
  if (paused || stopped || !g || !writer || !pic || pending >= 15) return; // (no picture yet: the take starts at its first one)
  let f;
  try {
    if (dirty || !last) { last?.close(); last = snapshot(); dirty = false; }
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
  try { latest?.close(); } catch { /* closed */ } latest = null;
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
      if (held) { take(held); held = null; } // (the clock waits for this first picture: a take never starts black)
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
