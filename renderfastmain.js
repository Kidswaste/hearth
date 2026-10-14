// Render fast (round 41, renderfast), the main side: an ffmpeg that takes a Lab export's frames on its stdin while
// they are drawn, instead of a folder of temporary pictures read after the last frame. The frames are the same bytes
// the old way wrote to disk (the same JPEG / PNG from the export page) read by the same decoder (image2pipe instead
// of image2), so the encoder sees the same pictures and the video is the same; the encode just overlaps the drawing,
// and nothing is written twice. Loaded on first use (main.js lazyIpc). The renderer side is tools/three-export.js.
//   rfast:open   (job { id, args (with INPUT → pipe:0, OUTPUT), output }, overrides) → { ok, error }
//   rfast:write  (id, bytes) → { ok, encoded (frames ffmpeg has done), error } once the bytes are in the pipe
//   rfast:end    (id) → { ok, code, encoded, ms, error } when ffmpeg is done
//   rfast:cancel (id) → true
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const aemain = require('./aemain');

const jobs = new Map(); // id → { child, err, encoded, done: Promise, t0 }
// below normal priority, like every other render (aemain): the window and the export page's drawing come first
function lowPriority(child) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); return true; } catch { return false; } }

function open(job, overrides) {
  const { ffmpeg } = aemain.ffStatus(overrides || {});
  if (!ffmpeg) return { ok: false, error: aemain.ffStatus().hint };
  if (!job || typeof job.id !== 'string' || !Array.isArray(job.args) || typeof job.output !== 'string' || !path.isAbsolute(job.output)) return { ok: false, error: 'bad job' };
  if (jobs.has(job.id)) return { ok: false, error: 'already open' };
  fs.mkdirSync(path.dirname(job.output), { recursive: true });
  const fresh = !fs.existsSync(job.output);
  const args = job.args.map((a) => (a === 'INPUT' ? 'pipe:0' : a === 'OUTPUT' ? job.output : String(a)));
  args.splice(args.length - 1, 0, '-progress', 'pipe:1', '-nostats');
  const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  if (job.priority !== 'normal') lowPriority(child);
  const j = { child, err: '', encoded: 0, t0: Date.now(), code: undefined, output: job.output, fresh };
  j.done = new Promise((resolve) => {
    child.on('close', (code) => { j.code = code; resolve(code); });
    child.on('error', (e) => { j.err += `\n${e.message}`; j.code = -1; resolve(-1); });
  });
  child.stdout.on('data', (d) => { const m = String(d).match(/frame=(\d+)/g); if (m) j.encoded = Number(m[m.length - 1].slice(6)); });
  child.stderr.on('data', (d) => { j.err = (j.err + d).slice(-4000); });
  child.stdin.on('error', () => { /* EPIPE: ffmpeg stopped; its own error says why (end / write answer it) */ });
  jobs.set(job.id, j);
  return { ok: true };
}
const tail = (j) => j.err.trim().split('\n').slice(-3).join('\n') || `ffmpeg ended with ${j.code}`;
function write(id, bytes) {
  const j = jobs.get(id);
  if (!j) return Promise.resolve({ ok: false, error: 'no such job' });
  if (j.code !== undefined) return Promise.resolve({ ok: false, error: tail(j), encoded: j.encoded });
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  // (answered once the bytes are in the pipe: when ffmpeg falls behind, the pipe fills and the next frame waits)
  return new Promise((resolve) => j.child.stdin.write(buf, (err) => resolve(err ? { ok: false, error: j.code !== undefined ? tail(j) : err.message, encoded: j.encoded } : { ok: true, encoded: j.encoded })));
}
async function end(id) {
  const j = jobs.get(id);
  if (!j) return { ok: false, error: 'no such job' };
  try { j.child.stdin.end(); } catch { /* closed */ }
  const code = await j.done;
  jobs.delete(id);
  if (code !== 0) drop(j);
  return { ok: code === 0, code, encoded: j.encoded, ms: Date.now() - j.t0, error: code === 0 ? null : tail(j) };
}
// a video that won't be finished: its partial file goes (only one this job started: never a file that was there)
function drop(j) { if (j.fresh) fs.rm(j.output, { force: true }, () => {}); }
function cancel(id) {
  const j = jobs.get(id);
  if (!j) return false;
  jobs.delete(id);
  try { j.child.stdin.destroy(); } catch { /* gone */ }
  try { j.child.kill(); } catch { /* gone */ }
  j.done.then(() => drop(j));
  return true;
}
process.on('exit', () => { for (const j of jobs.values()) { try { j.child.kill(); } catch { /* gone */ } } });

function register(ipcMain, getWin, settings) {
  const over = (o) => ({ ffmpeg: (o && o.ffmpeg) || settings?.().ffmpegPath || undefined });
  ipcMain.handle('rfast:open', (_e, job, overrides) => open(job, over(overrides)));
  ipcMain.handle('rfast:write', (_e, id, bytes) => write(id, bytes));
  ipcMain.handle('rfast:end', (_e, id) => end(id));
  ipcMain.handle('rfast:cancel', (_e, id) => cancel(id));
}

module.exports = { register, open, write, end, cancel, _jobs: jobs };
