// The recording's frame pump, off the window's thread (round 16, videoperf). capture.js hands this worker the page
// capture's frames (a MediaStreamTrackProcessor's stream) and the recording canvas (transferControlToOffscreen); the
// worker crops / scales each captured frame into that canvas (the target's rectangle, a social frame) and repaints it
// every 1/fps whether or not the picture changed (a constant frame rate, the real length). The canvas's capture
// stream (captureStream(fps), made in the window) is what the recorder encodes, as before. The window's thread does
// nothing per frame while recording: the UI being filmed stays as smooth as when it isn't. capture.js falls back to
// drawing on its own thread when this can't run.
// Messages in: open { readable } → 'first' { ok, w, h } · start { canvas, rect, view, frame, fps } · rect { rect, view }
// (the target moved) · fps { fps } (slower when the encoder falls behind) · pause { on } · stop.
// Out: first, stats { framesIn, framesOut, age } twice a second, error { message }.
let reader = null; let canvas = null; let g = null; let held = null;
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
// an unchanged canvas sends nothing to its capture stream: repaint it (a GPU copy) on the frame clock
function tick() {
  if (paused || stopped || !g) return;
  g.drawImage(canvas, 0, 0);
  framesOut += 1;
}
function setFps(fps) { clearInterval(ticker); ticker = setInterval(tick, 1000 / Math.max(1, fps || 30)); }
function stop() {
  stopped = true;
  clearInterval(ticker); clearInterval(statsT);
  reader?.cancel().catch(() => {});
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
      canvas = m.canvas;
      g = canvas.getContext('2d', { alpha: false });
      g.imageSmoothingQuality = 'high';
      rect = m.rect; view = m.view; fit = Boolean(m.frame);
      if (held) { draw(held); held.close(); held = null; }
      pumpIn();
      setFps(m.fps);
      statsT = setInterval(() => postMessage({ type: 'stats', framesIn, framesOut, age: lastIn ? performance.now() - lastIn : 0 }), 500);
    } else if (m.cmd === 'rect') { rect = m.rect; view = m.view; }
    else if (m.cmd === 'fps') setFps(m.fps);
    else if (m.cmd === 'pause') paused = Boolean(m.on);
    else if (m.cmd === 'stop') stop();
  } catch (err) { postMessage({ type: m.cmd === 'open' ? 'first' : 'error', ok: false, message: err.message }); }
};
