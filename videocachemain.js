// Video media cache (round 16, videoperf): the pictures and sounds Video Review and the editor draw on their timelines
// (library thumbnails, hover strips, filmstrips, clip thumbnails, the sound of a clip for its waveform + beats) are made
// once by ffmpeg in its own process, below normal priority, and kept on disk in data/ae/cache (a folder sync never
// sends: data/ae is local). The window's thread never decodes, scales or JPEG-encodes a frame for them any more, and a
// second open of the same file reads a few KB instead of decoding it again. A file that changed (size or time) gets
// fresh pictures (its key changes). The folder is capped (oldest first) so it can't grow without bound.
// Ops (ipc 'video:media'): thumbs { file, n, w, at? } → { sprite, n, tw, th, times, d } · audio { file } → { wav } |
// { none } · get { file, kind } / set { file, kind, data } (small JSON next to it: the sound analysis) · stats · clear.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./store');

const DIR = path.join(DATA_DIR, 'ae', 'cache');
const CAP = 1.5 * 1024 ** 3; // bytes on disk, then the oldest go first (down to 80 %)
const MAX_JOBS = 2; // ffmpeg processes for the cache at once (renders have their own queue)

// below normal priority: nice 10 on Mac / Linux, BELOW_NORMAL on Windows (the window keeps its CPU)
function lowPriority(child) {
  if (!child?.pid) return false;
  try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); return true; } catch { return false; }
}

function keyOf(file, extra) {
  const st = fs.statSync(file);
  return crypto.createHash('sha1').update(`${path.resolve(file)}|${st.size}|${Math.round(st.mtimeMs)}|${extra}`).digest('hex').slice(0, 24);
}
const touch = (p) => { try { const t = new Date(); fs.utimesSync(p, t, t); } catch { /* gone */ } };
const has = (p) => { try { return fs.statSync(p).size > 0; } catch { return false; } };

// ---------- a small queue of ffmpeg runs (same key = same promise) ----------
let active = 0;
const waiting = [];
const inflight = new Map();
const stats = { made: 0, hits: 0, failed: 0, ms: 0 };
function slot() { return new Promise((res) => { if (active < MAX_JOBS) { active += 1; res(); } else waiting.push(res); }); }
function free() { const n = waiting.shift(); if (n) n(); else active -= 1; }
function ffRun(ffmpeg, args, timeout = 120000) {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    lowPriority(child);
    let err = '';
    const kill = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, timeout);
    child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    child.on('error', (e) => { clearTimeout(kill); resolve({ code: -1, err: e.message }); });
    child.on('close', (code) => { clearTimeout(kill); resolve({ code, err }); });
  });
}
async function once(key, make) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => { await slot(); const t0 = Date.now(); try { return await make(); } finally { stats.ms += Date.now() - t0; free(); } })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ---------- the cap ----------
let prunedAt = 0;
function list() {
  try { return fs.readdirSync(DIR).map((n) => { const p = path.join(DIR, n); try { const s = fs.statSync(p); return { p, size: s.size, t: s.mtimeMs }; } catch { return null; } }).filter(Boolean); } catch { return []; }
}
function prune(force = false) {
  if (!force && Date.now() - prunedAt < 60000) return;
  prunedAt = Date.now();
  const files = list();
  let total = files.reduce((a, f) => a + f.size, 0);
  if (total <= CAP) return;
  for (const f of files.sort((a, b) => a.t - b.t)) {
    if (total <= CAP * 0.8) break;
    try { fs.unlinkSync(f.p); total -= f.size; } catch { /* in use */ }
  }
}

// ---------- ops ----------
// n frames evenly spread (the middle of each n-th of the clip), one row of w-wide pictures in one JPEG; at: one frame
async function thumbs(o, tools, probe) {
  const file = String(o.file || '');
  const n = Math.max(1, Math.min(60, Math.round(o.n || 24)));
  const w = Math.max(32, Math.min(480, Math.round(o.w || 160) & ~1));
  // at 'lead': the library's card picture (1.5 s in, or 15 % of a short clip), the same key whatever the length
  const at = o.at === 'lead' ? 'lead' : o.at != null ? Math.max(0, Number(o.at) || 0) : null;
  const key = keyOf(file, `thumbs:${n}:${w}:${at ?? ''}`);
  const sprite = path.join(DIR, `${key}.jpg`);
  const metaP = path.join(DIR, `${key}.json`);
  if (has(sprite) && has(metaP)) { touch(sprite); touch(metaP); stats.hits += 1; return JSON.parse(fs.readFileSync(metaP, 'utf8')); }
  return once(key, async () => {
    if (!tools.ffmpeg) throw new Error('ffmpeg not found');
    const info = await probe(file);
    const D = Number(info?.duration) || 0;
    if (!info?.w || !(D > 0)) throw new Error('not a video ffmpeg can read');
    const rot = Math.abs(info.rotation || 0) % 180 === 90;
    const vw = rot ? info.h : info.w; const vh = rot ? info.w : info.h;
    const th = Math.max(2, Math.round((w * vh) / vw / 2) * 2);
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${sprite}.${process.pid}.tmp.jpg`;
    let args; let times;
    if (at != null || n === 1) {
      const t = Math.min(at === 'lead' ? Math.min(1.5, D * 0.15) : at ?? D / 2, Math.max(0, D - 0.05));
      times = [t];
      args = ['-hide_banner', '-v', 'error', '-y', '-ss', t.toFixed(3), '-i', file, '-an', '-sn', '-frames:v', '1', '-vf', `scale=${w}:${th}`, '-q:v', '5', tmp];
    } else {
      const step = D / n;
      times = Array.from({ length: n }, (_, i) => (i + 0.5) * step);
      // long clips: only keyframes are decoded (a picture every few seconds is all a strip shows) — many times faster
      const keysOnly = step > 2 ? ['-skip_frame', 'nokey'] : [];
      args = ['-hide_banner', '-v', 'error', '-y', ...keysOnly, '-ss', (step / 2).toFixed(3), '-i', file, '-an', '-sn', '-vf', `fps=${n}/${D.toFixed(4)},scale=${w}:${th},tile=${n}x1`, '-frames:v', '1', '-q:v', '5', tmp];
    }
    const r = await ffRun(tools.ffmpeg, args);
    if (r.code !== 0 || !has(tmp)) { stats.failed += 1; try { fs.unlinkSync(tmp); } catch { /* none */ } throw new Error(`ffmpeg: ${(r.err || '').trim().split('\n').pop() || r.code}`); }
    fs.renameSync(tmp, sprite);
    const meta = { sprite, n: times.length, tw: w, th, times: times.map((t) => Math.round(t * 1000) / 1000), d: D, w: vw, h: vh };
    fs.writeFileSync(metaP, JSON.stringify(meta));
    stats.made += 1;
    prune();
    return meta;
  });
}
// the sound alone, mono 22 050 Hz (what the beat analysis reads): a few MB instead of the whole video through IPC
async function audio(o, tools, probe) {
  const file = String(o.file || '');
  const key = keyOf(file, 'audio:22050');
  const wav = path.join(DIR, `${key}.wav`);
  if (has(wav)) { touch(wav); stats.hits += 1; return { wav }; }
  return once(key, async () => {
    if (!tools.ffmpeg) throw new Error('ffmpeg not found');
    const info = await probe(file);
    if (info && !info.audio) return { none: true };
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${wav}.${process.pid}.tmp.wav`;
    const r = await ffRun(tools.ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', file, '-vn', '-sn', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', tmp], 300000);
    if (r.code !== 0 || !has(tmp)) { stats.failed += 1; try { fs.unlinkSync(tmp); } catch { /* none */ } if (/does not contain any stream|matches no streams/i.test(r.err)) return { none: true }; throw new Error(`ffmpeg: ${(r.err || '').trim().split('\n').pop() || r.code}`); }
    fs.renameSync(tmp, wav);
    stats.made += 1;
    prune();
    return { wav };
  });
}
const KIND = /^[a-z][\w-]{0,30}$/;
function getJson(o) {
  if (!KIND.test(String(o.kind))) return null;
  const p = path.join(DIR, `${keyOf(String(o.file), `json:${o.kind}`)}.${o.kind}.json`);
  try { const v = JSON.parse(fs.readFileSync(p, 'utf8')); touch(p); stats.hits += 1; return v; } catch { return null; }
}
function setJson(o) {
  if (!KIND.test(String(o.kind))) return false;
  const s = JSON.stringify(o.data ?? null);
  if (s.length > 8 * 1024 * 1024) return false;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${keyOf(String(o.file), `json:${o.kind}`)}.${o.kind}.json`), s);
  prune();
  return true;
}
function summary() {
  const files = list();
  return { dir: DIR, files: files.length, bytes: files.reduce((a, f) => a + f.size, 0), cap: CAP, running: active, waiting: waiting.length, ...stats };
}
function clear() {
  let n = 0;
  for (const f of list()) { if (/\.tmp\./.test(f.p)) continue; try { fs.unlinkSync(f.p); n += 1; } catch { /* in use */ } }
  return n;
}

function register(ipcMain, ffStatus, probe) {
  ipcMain.handle('video:media', async (_e, op, o = {}, overrides = {}) => {
    const tools = ffStatus(overrides || {});
    const pr = (f) => probe(f, overrides);
    // a file ffmpeg can't read is an answer, not an error (the window falls back to its own decoder)
    if (op === 'thumbs') return thumbs(o, tools, pr).catch((err) => ({ error: err.message }));
    if (op === 'audio') return audio(o, tools, pr).catch((err) => ({ error: err.message }));
    if (op === 'get') return getJson(o);
    if (op === 'set') return setJson(o);
    if (op === 'stats') return summary();
    if (op === 'clear') return clear();
    if (op === 'prune') { prune(true); return summary(); }
    throw new Error(`unknown op ${op}`);
  });
}

module.exports = { register, lowPriority, _test: { thumbs, audio, getJson, setJson, summary, clear, keyOf, DIR } };
