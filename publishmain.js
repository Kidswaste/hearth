// Ready to post, main side (round 27, publishkit; publishkit.js is the renderer side, publishkit-core.js the model).
// Measures a finished video with ffmpeg the way the frame reader does (framereader.js: found in the PATH, Homebrew's
// folders on a Mac, the usual winget / scoop / C:\ffmpeg folders on Windows; Settings → ffmpeg path wins):
//   publish:analyze (file)  → { ok, info, curve, loud, samples, heat, seam, covers: [{ t, path, score, why }] }
//                              one small decoding pass for motion / brightness / color (framereader analyze), the
//                              loudness (EBU R128), ~40 tiny gray frames for sharpness and "where the detail is", the
//                              last frame for the loop seam, then the best cover frames as small JPEGs (temp folder)
//                              { ok: false, noFfmpeg: true, hint } without ffmpeg (the renderer measures with <video>)
// Loaded on its first call (main.js lazyIpc), so it costs nothing until the kit opens.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const FR = require('./framereader');
const P = require('./publishkit-core');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const hint = () => (IS_MAC ? 'Install ffmpeg with Homebrew: brew install ffmpeg' : IS_WIN ? 'Install ffmpeg: winget install Gyan.FFmpeg' : 'Install ffmpeg with your package manager');

// raw gray frames on stdout (w × h bytes each)
function grayFrames(ffmpeg, args, w, h, { timeout = 10 * 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-v', 'error', ...args, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { windowsHide: true });
    const chunks = []; let err = '';
    const t = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, timeout);
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => {
      clearTimeout(t);
      const buf = Buffer.concat(chunks); const size = w * h; const out = [];
      for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8Array(buf.buffer, buf.byteOffset + o, size));
      if (!out.length && code) reject(new Error(err.trim().split('\n').pop() || `ffmpeg ended with ${code}`)); else resolve(out);
    });
  });
}

async function analyze(file, overrides) {
  FR.setOverrides(overrides);
  const t = FR.tools();
  if (!t.ffmpeg || !t.ffprobe) return { ok: false, noFfmpeg: true, hint: hint() };
  if (!file || !fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const t0 = Date.now();
  const info = await FR.probe(file);
  const d = info.duration || 0;
  // motion / brightness / color per frame (small), loudness, in parallel
  const [curveR, loud] = await Promise.all([
    FR.analyze(file, { width: 96 }).catch(() => null),
    info.audio ? FR.loudness(file).catch(() => null) : Promise.resolve(null),
  ]);
  const pts = curveR?.points || [];
  const step = Math.max(1, Math.ceil(pts.length / 400));
  const curve = pts.filter((_, i) => i % step === 0).map((p) => ({ t: p.time, motion: p.motion, luma: p.luma, sat: p.sat, scene: p.scene }));
  // tiny gray frames: sharpness, contrast, where the detail sits; the first and the last for the loop seam
  const w = 72; const rot = Math.abs(info.rotation || 0) % 180 === 90;
  const vw = rot ? info.h : info.w; const vh = rot ? info.w : info.h;
  const h = even((w * (vh || 16)) / (vw || 9));
  const n = Math.max(8, Math.min(40, Math.round(d * 2) || 8));
  const rate = d ? n / d : 2;
  const frames = await grayFrames(t.ffmpeg, ['-i', file, '-map', '0:v:0', '-vf', `fps=${rate.toFixed(4)},scale=${w}:${h}:flags=area`, '-frames:v', String(n + 2)], w, h).catch(() => []);
  const tail = d > 0.3 ? await grayFrames(t.ffmpeg, ['-sseof', '-0.4', '-i', file, '-map', '0:v:0', '-vf', `scale=${w}:${h}:flags=area`], w, h).catch(() => []) : [];
  let heat = null;
  const motionNear = (tt) => { let best = null; for (const p of pts) if (!best || Math.abs(p.time - tt) < Math.abs(best.time - tt)) best = p; return best; };
  const samples = frames.map((g, i) => {
    heat = P.heatAdd(heat, g, w, h);
    const tt = Math.round((i / rate) * 1000) / 1000;
    const near = pts.length ? motionNear(tt) : null;
    return { t: tt, ...P.frameStats(g, w, h), motion: near ? near.motion : (i ? P.diff(g, frames[i - 1]) : 0), sat: near ? near.sat : null };
  }).filter((s) => !d || s.t <= d);
  const usual = P.median(pts.slice(1).map((p) => p.motion));
  const seam = frames.length && tail.length ? P.seam(frames[0], tail[tail.length - 1], usual) : null;
  // the best cover frames, as small pictures
  const picks = P.pickCovers(samples, d, 6);
  let covers = picks;
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-post-'));
    const shots = await FR.frames(file, { times: picks.map((c) => c.t) }, { dir, width: 240, format: 'jpg', quality: 0.8 });
    covers = picks.map((c, i) => ({ ...c, t: shots[i] ? shots[i].time : c.t, path: shots[i]?.path || null })); // (frames keeps the order asked)
  } catch { /* the renderer draws them from the video then */ }
  const heatOut = heat ? { w: heat.w, h: heat.h, n: heat.n, data: Array.from(heat.data, (v) => Math.round(v * 1000) / 1000) } : null;
  return { ok: true, info, curve, loud, samples, heat: heatOut, seam, covers, ms: Date.now() - t0 };
}

function register(ipcMain, getWin, settings) {
  const over = () => ({ ffmpeg: (settings && settings().ffmpegPath) || undefined });
  ipcMain.handle('publish:analyze', (_e, file) => analyze(String(file || ''), over()));
}

module.exports = { register, analyze, _test: { grayFrames } };
