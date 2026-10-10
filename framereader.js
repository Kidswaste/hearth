// Frame reader: exact frames out of ANY video (Hearth's own captures and reference footage), for the owner and the
// chats. Pure Node (child_process + ffmpeg / ffprobe), so main (capturemain.js), the capture MCP server and tests
// all use it. Without ffmpeg every call rejects with { code: 'NO_FFMPEG' } and the renderer helper (capture-frames.js,
// the <video> element + requestVideoFrameCallback) takes over.
//
// How "exact" works: the presentation time of every frame comes from the container's packets (ffprobe, no decode,
// cached per file), sorted, skipping packets the edit list discards. Frame N is the N-th of those (the same numbering
// as ffmpeg's select=eq(n\,N)); a time t shows the last frame whose time ≤ t. To grab frame N, ffmpeg seeks near it
// on the input (fast) and then trims on the output halfway between frame N-1 and N (accurate), so exactly frame N
// comes out whatever the frame rate (29.97, VFR phone footage, B-frames, a non-zero start time).
//
// API (all async unless noted; `file` is an absolute path; `o.dir` = where pictures go, default a temp folder):
//   tools(overrides?)                         → { ffmpeg, ffprobe }  (sync; overrides = { ffmpeg, ffprobe } paths)
//   probe(file)                               → { fps, rate: '30000/1001', frames, duration, start, w, h, vfr, codec, rotation, audio }
//   frameTimes(file)                          → [t0, t1, …] presentation time of every frame (seconds, sorted)
//   locate(file, { frame | time | tc })       → { frame, time, tc }  (which frame a time / timecode / frame number means)
//   frameAt(file, { frame | time | tc }, o)   → { path, frame, time, tc, w, h }   o: { dir, width, format: 'png'|'jpg', quality }
//   frames(file, { frames | times }, o)       → [ …frameAt results ] (one ffmpeg pass or a few seeks, whichever is faster)
//   every(file, { every: N, from, to, max }, o) → frames every N frames (from / to in seconds)
//   spread(file, { count, from, to }, o)      → `count` frames evenly spread (contact sheets)
//   analyze(file, { width, from, to })        → per-frame curves { fps, points: [{ frame, time, scene, motion, luma, sat }] }
//   scenes(file, { threshold, minGap, max, pictures }, o) → cuts [{ frame, time, tc, score, path? }] (frame 0 included)
//   motion(file, { buckets, from, to })       → { curve: [{ time, motion, luma, scene }], peaks: [{ time, frame, motion }], calm, busy }
//   sheet(file, { cols, rows, count, from, to, width }, o) → { path, frames } tiled by ffmpeg (no labels; the hub draws labelled ones)
//   tc(seconds, fps, style)                   → timecode text (sync). style: 'smpte' (00:00:01:12, default), 'ms', 'frames', 's'
//   parseTime(text, fps)                      → seconds (sync): "12.5", "1:02.5", "00:00:01:12", "f120" / "#120" (a frame)
//   black / freeze / silence(file, { min, from, to }) → stretches [{ start, end, length }] (blackdetect, freezedetect, silencedetect)
//   loudness(file) → { integrated (LUFS), range, truePeak } · keyframes(file) → [seconds] · crop(file) → letterbox { w, h, x, y, bars }
//   barcode(file, { width, height }, o) → a picture of the average color over time · waveform(file, { width, height }, o) → the sound
//   loop(file, { from, min, max }) → the best seamless loop end { to, frame, tc, length, match }
//   edit(op, file, { from, to, … }, o) → { path }: gif (fps, width), trim, speed (factor), boomerang, sequence (PNG frames
//     for After Effects), reframe (w, h, fit: crop|fit), mute, audio (m4a), poster (time). Never changes the source file.
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p); } catch { return false; } };

// ---------- finding ffmpeg (same places as aemain.js findTool, kept here so the MCP server needs no Electron) ----------
const toolCache = {};
let overridesNow = {};
function findTool(name, override) {
  if (override && exists(override)) return override;
  // a miss is checked again after a minute (ffmpeg installed while Hearth runs: brew / winget), a hit is kept
  const c = toolCache[name];
  if (c !== undefined && (c || Date.now() - (toolCache[`${name}@`] || 0) < 60000)) return c;
  toolCache[`${name}@`] = Date.now();
  const exe = IS_WIN ? `${name}.exe` : name;
  const dirs = [
    // Windows PATH entries can be quoted ("C:\\Program Files\\ffmpeg\\bin")
    ...(process.env.PATH || '').split(path.delimiter).map((d) => d.trim().replace(/^"(.*)"$/, '$1')),
    ...(IS_MAC ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', path.join(os.homedir(), 'bin')] : []),
    ...(IS_WIN ? ['C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin', 'C:\\ProgramData\\chocolatey\\bin', path.join(os.homedir(), 'scoop', 'shims'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links')] : ['/usr/bin', '/usr/local/bin']),
  ].filter(Boolean);
  toolCache[name] = dirs.map((d) => path.join(d, exe)).find(exists) || null;
  return toolCache[name];
}
function tools(overrides = overridesNow) {
  const ffmpeg = findTool('ffmpeg', overrides.ffmpeg);
  const ffprobe = findTool('ffprobe', overrides.ffprobe || (ffmpeg && path.join(path.dirname(ffmpeg), IS_WIN ? 'ffprobe.exe' : 'ffprobe')));
  return { ffmpeg, ffprobe };
}
// The hub passes Settings → ffmpeg path once (capturemain.js); later calls use it.
function setOverrides(o) { overridesNow = { ...(o || {}) }; }
function noFfmpeg() {
  const e = new Error(IS_MAC ? 'ffmpeg not found (brew install ffmpeg)' : IS_WIN ? 'ffmpeg not found (winget install Gyan.FFmpeg)' : 'ffmpeg not found');
  e.code = 'NO_FFMPEG';
  return e;
}
function need() { const t = tools(); if (!t.ffmpeg || !t.ffprobe) throw noFfmpeg(); return t; }

function run(bin, args, { timeout = 120000, maxBuffer = 64 << 20, stdoutToo = true } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer, windowsHide: true, encoding: 'utf8' }, (err, out, errOut) => {
      if (err) { const e = new Error(String(errOut || err.message).trim().split('\n').slice(-3).join('\n') || err.message); e.cause = err; reject(e); return; }
      resolve(stdoutToo ? { out, err: errOut } : out);
    });
  });
}

// ---------- timecodes ----------
const pad = (n, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
function tc(seconds, fps = 30, style = 'smpte') {
  const s = Math.max(0, Number(seconds) || 0);
  const f = fps > 0 ? fps : 30;
  if (style === 's') return `${s.toFixed(3)}s`;
  if (style === 'frames') return `f${Math.floor(s * f + 1e-3)}`;
  if (style === 'ms') { const m = Math.floor(s / 60); return `${m}:${pad(Math.floor(s % 60))}.${pad(Math.round((s % 1) * 1000) % 1000, 3)}`; }
  // SMPTE-style non-drop: hh:mm:ss:ff with the frame counted at the nominal rate (29.97 → 30 per second)
  const nominal = Math.round(f);
  let frame = Math.floor(s * f + 1e-3); // the frame on screen at s (a thousandth of a frame of rounding slack)
  const ff = frame % nominal; frame = Math.floor(frame / nominal);
  return `${pad(frame / 3600)}:${pad((frame / 60) % 60)}:${pad(frame % 60)}:${pad(ff)}`;
}
function parseTime(text, fps = 30) {
  const t = String(text ?? '').trim();
  if (!t) return NaN;
  let m = t.match(/^(?:f|#|frame\s*)(\d+)$/i);
  if (m) return Number(m[1]) / (fps || 30);
  m = t.match(/^(\d+):(\d{1,2}):(\d{1,2})[:;](\d{1,3})$/); // hh:mm:ss:ff, frames counted at the nominal rate (29.97 → 30)
  if (m) { const nominal = Math.round(fps || 30); return ((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * nominal + Number(m[4])) / (fps || 30); }
  m = t.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/); // [h:]m:ss.s
  if (m) return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = t.match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
  if (m) return m[2]?.toLowerCase() === 'ms' ? Number(m[1]) / 1000 : Number(m[1]);
  return NaN;
}

// ---------- facts about a file ----------
const rateOf = (r) => { const [n, d] = String(r || '0/1').split('/').map(Number); return d ? n / d : 0; };
const probeCache = new Map(); // key (path + mtime + size) → { info, times }
function cacheKey(file) {
  const st = fs.statSync(file);
  return `${file}|${st.mtimeMs}|${st.size}`;
}
async function probe(file) {
  if (!exists(file)) throw new Error(`File not found: ${file}`);
  const key = cacheKey(file);
  const hit = probeCache.get(key);
  if (hit?.info) return hit.info;
  const { ffprobe } = need();
  const { out } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 20000 });
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = j.streams.find((s) => s.codec_type === 'audio');
  if (!v) throw new Error('No video stream in this file');
  const rFps = rateOf(v.r_frame_rate); const aFps = rateOf(v.avg_frame_rate);
  const info = {
    fps: Math.round((aFps || rFps) * 1000) / 1000,
    exactFps: aFps || rFps, // 29.97002997… (timecodes are counted with it)
    rate: v.avg_frame_rate && v.avg_frame_rate !== '0/0' ? v.avg_frame_rate : v.r_frame_rate,
    frames: Number(v.nb_frames) || null,
    duration: Number(v.duration) || Number(j.format?.duration) || 0,
    start: Number(v.start_time) || 0,
    w: v.width, h: v.height, codec: v.codec_name, pixFmt: v.pix_fmt,
    vfr: Boolean(rFps && aFps && Math.abs(rFps - aFps) / rFps > 0.01),
    rotation: Number(v.tags?.rotate || v.side_data_list?.find((x) => x.rotation != null)?.rotation || 0),
    audio: a ? { codec: a.codec_name, rate: Number(a.sample_rate), channels: a.channels } : null,
    size: Number(j.format?.size) || null, bitrate: Number(j.format?.bit_rate) || null,
  };
  probeCache.set(key, { ...(hit || {}), info });
  if (probeCache.size > 40) probeCache.delete(probeCache.keys().next().value);
  return info;
}
// Presentation times of every frame, from packets (fast: no decoding). WebM from MediaRecorder has no frame count
// in its header, this counts them anyway.
async function frameTimes(file) {
  const info = await probe(file);
  const key = cacheKey(file);
  const hit = probeCache.get(key);
  if (hit?.times) return hit.times;
  const { ffprobe } = need();
  const out = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,dts_time,flags', '-of', 'csv=p=0', file], { timeout: 120000, maxBuffer: 256 << 20, stdoutToo: false });
  const times = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [pts, dts, flags = ''] = line.split(',');
    if (flags.includes('D')) continue; // discarded by the edit list: never shown
    const t = Number(pts !== 'N/A' && pts !== '' ? pts : dts);
    if (Number.isFinite(t)) times.push(t);
  }
  times.sort((x, y) => x - y);
  // B-frames can repeat a timestamp in odd files: keep them (they are still frames ffmpeg outputs)
  if (!times.length && info.frames) for (let i = 0; i < info.frames; i += 1) times.push(info.start + i / (info.fps || 30));
  probeCache.set(key, { ...(probeCache.get(key) || {}), info, times });
  return times;
}

// Which frame a request means: { frame } wins, then { tc } / { time } (seconds, or text parseTime understands).
async function locate(file, want = {}) {
  const info = await probe(file);
  const times = await frameTimes(file);
  const last = times.length - 1;
  if (last < 0) throw new Error('No frames in this video');
  let frame;
  if (want.frame != null && want.frame !== '') frame = Math.round(Number(want.frame));
  else {
    let t = typeof want.time === 'number' ? want.time : parseTime(want.time ?? want.tc ?? 0, info.fps);
    if (!Number.isFinite(t)) throw new Error(`Not a time: ${want.time ?? want.tc}`);
    if (want.relative !== false) t += times[0]; // times are from the video's start (players show 0 there)
    // the frame on screen at t: the last one that started at or before t (a hair of tolerance for rounding)
    let lo = 0; let hi = last;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= t + 1e-6) lo = mid; else hi = mid - 1; }
    frame = lo;
  }
  if (frame < 0) frame += last + 1; // -1 = the last frame
  frame = Math.max(0, Math.min(last, frame));
  const time = times[frame] - times[0];
  return { frame, time: Math.round(time * 1e6) / 1e6, tc: tc(time, info.exactFps || info.fps), fps: info.fps, total: last + 1 };
}

// ---------- pictures ----------
const tmpRoot = () => path.join(os.tmpdir(), 'hearth-frames');
function outDir(file, o = {}) {
  const base = path.basename(file).replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'video';
  const h = crypto.createHash('sha1').update(file).digest('hex').slice(0, 6);
  const dir = path.join(o.dir || tmpRoot(), `${base}-${h}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const extOf = (o) => (o.format === 'jpg' || o.format === 'jpeg' ? 'jpg' : o.format === 'webp' ? 'webp' : 'png');
const scaleArgs = (o) => {
  const f = [];
  if (o.width) f.push(`scale=${Math.round(o.width)}:-2:flags=lanczos`);
  return f;
};
const qualityArgs = (o) => (extOf(o) === 'jpg' ? ['-q:v', String(Math.max(2, Math.min(31, Math.round(31 - (o.quality ?? 0.85) * 29))))] : extOf(o) === 'webp' ? ['-quality', String(Math.round((o.quality ?? 0.85) * 100))] : []);

// One frame by its number, exact: input seek a little before (fast), output trim between frame N-1 and N (accurate).
async function grab(file, frame, times, o) {
  const { ffmpeg } = need();
  const info = await probe(file);
  const tN = times[frame];
  const prev = frame > 0 ? times[frame - 1] : tN - 1 / (info.fps || 30);
  const cut = (prev + tN) / 2; // any time after frame N-1 starts and at or before frame N
  const pre = Math.max(0, cut - 3); // the input seek lands on a keyframe at or before this; the rest is decoded
  const dir = outDir(file, o);
  const out = o.out || path.join(dir, `f${String(frame).padStart(6, '0')}${o.width ? `-w${o.width}` : ''}.${extOf(o)}`);
  if (!o.fresh && exists(out)) return out;
  const vf = [...scaleArgs(o)];
  const args = ['-v', 'error', '-y', '-copyts', '-ss', pre.toFixed(6), '-i', file, '-ss', Math.max(0, cut).toFixed(6), '-map', '0:v:0', '-frames:v', '1', ...(vf.length ? ['-vf', vf.join(',')] : []), ...qualityArgs(o), '-an', '-sn', '-dn', out];
  await run(ffmpeg, args, { timeout: 60000 });
  if (!exists(out)) throw new Error(`ffmpeg wrote no picture for frame ${frame}`);
  return out;
}
// Many frames in one decoding pass (select=eq(n,…)), for long lists or short videos.
async function grabPass(file, list, o) {
  const { ffmpeg } = need();
  const dir = outDir(file, o);
  const pattern = path.join(dir, `pass-${Date.now().toString(36)}-%04d.${extOf(o)}`);
  const sel = `select='${list.map((n) => `eq(n\\,${n})`).join('+')}'`;
  const args = ['-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-vf', [sel, ...scaleArgs(o)].join(','), '-fps_mode', 'passthrough', ...qualityArgs(o), '-an', '-sn', '-dn', pattern];
  await run(ffmpeg, args, { timeout: 30 * 60000 });
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const paths = new Map();
  sorted.forEach((n, i) => {
    const p = pattern.replace('%04d', String(i + 1).padStart(4, '0'));
    const fin = path.join(dir, `f${String(n).padStart(6, '0')}${o.width ? `-w${o.width}` : ''}.${extOf(o)}`);
    try { fs.renameSync(p, fin); paths.set(n, fin); } catch { /* fewer frames than asked (past the end) */ }
  });
  return paths;
}

async function frameAt(file, want = {}, o = {}) {
  const loc = await locate(file, want);
  const times = await frameTimes(file);
  const p = await grab(file, loc.frame, times, o);
  const info = await probe(file);
  return { path: p, frame: loc.frame, time: loc.time, tc: loc.tc, w: o.width || info.w, h: o.width ? Math.round((info.h * o.width) / info.w / 2) * 2 : info.h };
}
// Several frames: a few → parallel seeks (fast on long videos); many on a short video → one pass.
async function frames(file, { frames: nums, times: ts } = {}, o = {}) {
  const info = await probe(file);
  const times = await frameTimes(file);
  const wants = [...(nums || []).map((frame) => ({ frame })), ...(ts || []).map((time) => ({ time }))];
  const locs = [];
  for (const w of wants) locs.push(await locate(file, w));
  const unique = [...new Set(locs.map((l) => l.frame))];
  const onePass = unique.length > 12 && unique.length * 90 > times.length; // dense list: decoding everything once is cheaper
  let map = new Map();
  if (onePass) map = await grabPass(file, unique, o);
  else {
    const queue = [...unique]; const workers = [];
    for (let k = 0; k < Math.min(3, queue.length); k += 1) {
      workers.push((async () => { while (queue.length) { const n = queue.shift(); map.set(n, await grab(file, n, times, o)); } })());
    }
    await Promise.all(workers);
  }
  const h = o.width ? Math.round((info.h * o.width) / info.w / 2) * 2 : info.h;
  return locs.map((l) => ({ path: map.get(l.frame) || null, frame: l.frame, time: l.time, tc: l.tc, w: o.width || info.w, h }));
}
function rangeFrames(times, { from, to } = {}) {
  const t0 = times[0];
  const a = from != null ? times.findIndex((t) => t - t0 >= Number(from) - 1e-6) : 0;
  let b = times.length - 1;
  if (to != null) { while (b > 0 && times[b] - t0 > Number(to) + 1e-6) b -= 1; }
  return [Math.max(0, a), Math.max(0, b)];
}
async function every(file, { every: n = 10, from, to, max = 60 } = {}, o = {}) {
  const times = await frameTimes(file);
  const [a, b] = rangeFrames(times, { from, to });
  const step = Math.max(1, Math.round(n));
  const list = [];
  for (let i = a; i <= b && list.length < max; i += step) list.push(i);
  return frames(file, { frames: list }, o);
}
async function spread(file, { count = 12, from, to } = {}, o = {}) {
  const times = await frameTimes(file);
  const [a, b] = rangeFrames(times, { from, to });
  const c = Math.max(1, Math.min(200, Math.round(count)));
  const list = [];
  for (let i = 0; i < c; i += 1) list.push(Math.round(a + ((b - a) * (c === 1 ? 0.5 : i / (c - 1)))));
  return frames(file, { frames: [...new Set(list)] }, o);
}

// ---------- curves: scene change, motion, brightness, saturation per frame (one decoding pass, small) ----------
async function analyze(file, { width = 128, from, to } = {}) {
  const { ffmpeg } = need();
  const info = await probe(file);
  const times = await frameTimes(file);
  const t0 = times[0];
  const args = ['-v', 'error', ...(from != null ? ['-ss', String(Math.max(0, from))] : []), '-i', file, ...(to != null ? ['-t', String(Math.max(0.05, to - (from || 0)))] : []),
    '-map', '0:v:0', '-vf', `scale=${width}:-2,select='gte(scene\\,0)',signalstats,metadata=print:file=-`, '-an', '-f', 'null', '-'];
  const { out } = await run(ffmpeg, args, { timeout: 30 * 60000, maxBuffer: 512 << 20 });
  const points = [];
  let cur = null;
  for (const line of out.split('\n')) {
    const m = line.match(/^frame:(\d+)\s+pts:\S+\s+pts_time:(\S+)/);
    if (m) { cur = { time: Number(m[2]) + (from || 0) - (from != null ? 0 : t0) }; points.push(cur); continue; }
    if (!cur) continue;
    const kv = line.match(/^lavfi\.([\w.]+)=(\S+)/);
    if (!kv) continue;
    const v = Number(kv[2]);
    if (kv[1] === 'scene_score') cur.scene = v;
    else if (kv[1] === 'signalstats.YDIF') cur.motion = v / 255;
    else if (kv[1] === 'signalstats.YAVG') cur.luma = v / 255;
    else if (kv[1] === 'signalstats.SATAVG') cur.sat = v / 128;
  }
  // frame numbers from the exact frame times (the pass may have started mid-file)
  for (const p of points) {
    p.time = Math.max(0, Math.round(p.time * 1e6) / 1e6);
    let lo = 0; let hi = times.length - 1; const t = p.time + t0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= t + 1e-4) lo = mid; else hi = mid - 1; }
    p.frame = lo;
    p.scene = Math.round((p.scene || 0) * 1e4) / 1e4; p.motion = Math.round((p.motion || 0) * 1e4) / 1e4;
    p.luma = Math.round((p.luma || 0) * 1e3) / 1e3; p.sat = Math.round((p.sat || 0) * 1e3) / 1e3;
  }
  if (points[0]) { points[0].scene = 0; points[0].motion = 0; } // nothing before the first frame to compare with
  return { fps: info.fps, exactFps: info.exactFps || info.fps, duration: info.duration, frames: times.length, points };
}
const analysisCache = new Map();
async function curves(file, opts = {}) {
  const key = `${cacheKey(file)}|${opts.width || 128}|${opts.from ?? ''}|${opts.to ?? ''}`;
  if (analysisCache.has(key)) return analysisCache.get(key);
  const r = await analyze(file, opts);
  analysisCache.set(key, r);
  if (analysisCache.size > 12) analysisCache.delete(analysisCache.keys().next().value);
  return r;
}

// Cuts: frames whose scene score passes the threshold, at least minGap seconds apart (frame 0 always opens a shot).
async function scenes(file, { threshold = 0.3, minGap = 0.4, max = 60, from, to, pictures = true } = {}, o = {}) {
  const c = await curves(file, { from, to });
  const fps = c.exactFps || c.fps || 30;
  const cuts = [{ frame: c.points[0]?.frame || 0, time: c.points[0]?.time || 0, score: 1 }];
  for (const p of c.points.slice(1)) {
    if (p.scene < threshold) continue;
    const lastCut = cuts[cuts.length - 1];
    if (p.time - lastCut.time < minGap) { if (p.scene > lastCut.score && cuts.length > 1) Object.assign(lastCut, { frame: p.frame, time: p.time, score: p.scene }); continue; }
    cuts.push({ frame: p.frame, time: p.time, score: p.scene });
  }
  let list = cuts;
  if (list.length > max) list = [list[0], ...list.slice(1).sort((a, b) => b.score - a.score).slice(0, max - 1).sort((a, b) => a.frame - b.frame)];
  for (let i = 0; i < list.length; i += 1) {
    list[i].tc = tc(list[i].time, fps);
    list[i].length = Math.round(((list[i + 1]?.time ?? c.duration) - list[i].time) * 1000) / 1000; // how long the shot lasts
  }
  if (pictures) {
    const pics = await frames(file, { frames: list.map((x) => x.frame) }, o);
    list.forEach((x, i) => { x.path = pics[i]?.path || null; });
  }
  return { fps, duration: c.duration, threshold, cuts: list };
}

// Motion energy over time, bucketed for a chart or a model (N values), with the busiest and calmest moments.
async function motion(file, { buckets = 48, from, to } = {}) {
  const c = await curves(file, { from, to });
  const pts = c.points;
  if (!pts.length) return { fps: c.fps, curve: [], peaks: [] };
  const t0 = pts[0].time; const t1 = pts[pts.length - 1].time || 1;
  const n = Math.max(4, Math.min(400, Math.round(buckets)));
  const curve = Array.from({ length: n }, (_, i) => ({ time: Math.round((t0 + ((t1 - t0) * (i + 0.5)) / n) * 1000) / 1000, motion: 0, luma: 0, scene: 0, k: 0 }));
  for (const p of pts) {
    const b = curve[Math.min(n - 1, Math.floor(((p.time - t0) / Math.max(1e-6, t1 - t0)) * n))];
    b.motion += p.motion; b.luma += p.luma; b.scene = Math.max(b.scene, p.scene); b.k += 1;
  }
  for (const b of curve) { if (b.k) { b.motion = Math.round((b.motion / b.k) * 1e4) / 1e4; b.luma = Math.round((b.luma / b.k) * 1e3) / 1e3; } delete b.k; }
  const sorted = [...pts].sort((a, b) => b.motion - a.motion);
  const peaks = [];
  for (const p of sorted) { if (peaks.length >= 5) break; if (peaks.every((q) => Math.abs(q.time - p.time) > 0.5)) peaks.push({ time: p.time, frame: p.frame, tc: tc(p.time, c.exactFps || c.fps), motion: p.motion }); }
  const avg = pts.reduce((a, p) => a + p.motion, 0) / pts.length;
  const calm = curve.filter((b) => b.motion < avg * 0.5).length / n;
  const busy = curve.filter((b) => b.motion > avg * 1.5).length / n;
  return { fps: c.fps, duration: c.duration, frames: c.frames, average: Math.round(avg * 1e4) / 1e4, calm: Math.round(calm * 100) / 100, busy: Math.round(busy * 100) / 100, curve, peaks, cuts: pts.filter((p) => p.scene > 0.3).length };
}

// A plain tiled sheet by ffmpeg (no labels: fonts aren't reliable everywhere); the hub draws labelled ones itself.
async function sheet(file, { cols = 4, rows, count, from, to, width = 1600 } = {}, o = {}) {
  const { ffmpeg } = need();
  const n = Math.max(1, Math.min(100, Math.round(count || cols * (rows || 3))));
  const r = rows || Math.ceil(n / cols);
  const pics = await spread(file, { count: n, from, to }, { ...o, width: Math.round(width / cols), format: 'png' });
  const listFile = path.join(outDir(file, o), `sheet-${Date.now().toString(36)}.txt`);
  fs.writeFileSync(listFile, pics.filter((p) => p.path).map((p) => `file '${p.path.replace(/'/g, "'\\''")}'`).join('\n'));
  const out = o.out || path.join(outDir(file, o), `sheet-${cols}x${r}-${Date.now().toString(36)}.${extOf(o)}`);
  await run(ffmpeg, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `tile=${cols}x${r}:padding=4:margin=4:color=black`, '-frames:v', '1', ...qualityArgs(o), out], { timeout: 120000 });
  try { fs.unlinkSync(listFile); } catch { /* temp list */ }
  return { path: out, frames: pics.map(({ frame, time, tc: t }) => ({ frame, time, tc: t })), cols, rows: r };
}

// ---------- recordings: fix MediaRecorder WebM (no duration / cues) and make an MP4 ----------
// copy: remux only (fast, keeps quality); mp4: H.264 + AAC, yuv420p, faststart (plays everywhere, social uploads).
function convert(input, output, { mp4 = false, fps = null, crf = 18, onProgress, duration, size = null, faststart = false } = {}) {
  const { ffmpeg } = need();
  const args = ['-v', 'error', '-y', '-i', input];
  // the page capture sends frames only when something changed: a constant-rate MP4 repeats them, cut at the real length
  if (mp4 && duration) args.push('-t', String(duration));
  if (mp4) args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-vf', size && size.w ? `scale=${Math.round(size.w / 2) * 2}:${Math.round(size.h / 2) * 2}:flags=lanczos,setsar=1` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2', ...(fps ? ['-r', String(fps), '-fps_mode', 'cfr'] : []), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  else args.push('-c', 'copy', ...(faststart ? ['-movflags', '+faststart'] : []));
  args.push('-progress', 'pipe:1', '-nostats', output);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let err = '';
    child.stdout.on('data', (d) => { const m = String(d).match(/out_time_us=(\d+)/g); if (m && duration && onProgress) onProgress(Math.min(1, Number(m[m.length - 1].split('=')[1]) / 1e6 / duration)); });
    child.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 && exists(output) ? resolve(output) : reject(new Error(err.trim().split('\n').slice(-2).join('\n') || `ffmpeg exited ${code}`))));
  });
}

// ---------- more readings (ffmpeg's own detectors) ----------
// a pass that prints filter logs on stderr (blackdetect, freezedetect, silencedetect, ebur128, cropdetect)
async function logPass(file, args, { from, to } = {}) {
  const { ffmpeg } = need();
  const { err } = await run(ffmpeg, ['-hide_banner', '-nostats', ...(from != null ? ['-ss', String(from)] : []), '-i', file, ...(to != null ? ['-t', String(Math.max(0.05, to - (from || 0)))] : []), ...args, '-f', 'null', '-'], { timeout: 30 * 60000, maxBuffer: 256 << 20 });
  return String(err || '');
}
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
// black stretches (fades to black, gaps): [{ start, end, length }]
async function black(file, { min = 0.1, pixel = 0.1, from, to } = {}) {
  const log = await logPass(file, ['-map', '0:v:0', '-vf', `blackdetect=d=${min}:pix_th=${pixel}`, '-an'], { from, to });
  return [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map((m) => ({ start: r3(Number(m[1]) + (from || 0)), end: r3(Number(m[2]) + (from || 0)), length: r3(m[3]) }));
}
// frozen stretches (still shots, holds): [{ start, end, length }]
async function freeze(file, { min = 0.5, noise = 0.003, from, to } = {}) {
  const log = await logPass(file, ['-map', '0:v:0', '-vf', `freezedetect=n=${noise}:d=${min}`, '-an'], { from, to });
  const starts = [...log.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const info = await probe(file);
  return starts.map((st, i) => { const en = ends[i] ?? info.duration; return { start: r3(st + (from || 0)), end: r3(en + (from || 0)), length: r3(en - st) }; });
}
// quiet stretches in the sound: [{ start, end, length }]
async function silence(file, { min = 0.3, db = -40, from, to } = {}) {
  const info = await probe(file);
  if (!info.audio) return [];
  const log = await logPass(file, ['-map', '0:a:0', '-af', `silencedetect=n=${db}dB:d=${min}`, '-vn'], { from, to });
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((st, i) => { const en = ends[i] ?? info.duration; return { start: r3(Math.max(0, st) + (from || 0)), end: r3(en + (from || 0)), length: r3(en - Math.max(0, st)) }; });
}
// loudness (EBU R128): integrated LUFS, range, true peak; social platforms aim near -14 LUFS
async function loudness(file) {
  const info = await probe(file);
  if (!info.audio) return null;
  const log = await logPass(file, ['-map', '0:a:0', '-af', 'ebur128=peak=true', '-vn']);
  const tail = log.slice(log.lastIndexOf('Summary:'));
  const num = (re) => { const m = tail.match(re); return m ? Number(m[1]) : null; };
  return { integrated: num(/I:\s+(-?[\d.]+) LUFS/), range: num(/LRA:\s+(-?[\d.]+) LU/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}
// keyframes (I-frames) from packets: where the video can be cut without re-encoding
async function keyframes(file, { max = 400 } = {}) {
  const { ffprobe } = need();
  const out = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file], { timeout: 120000, maxBuffer: 256 << 20, stdoutToo: false });
  const t0 = (await frameTimes(file))[0] || 0;
  return out.split('\n').filter((l) => /,K/.test(l)).map((l) => r3(Number(l.split(',')[0]) - t0)).filter(Number.isFinite).sort((a, b) => a - b).slice(0, max);
}
// letterbox / pillarbox bars: the picture's real area { w, h, x, y } (cropdetect over a few seconds)
async function crop(file, { from, to } = {}) {
  const info = await probe(file);
  const a = from ?? Math.min(1, info.duration / 4); const b = to ?? Math.min(info.duration, a + 6);
  const log = await logPass(file, ['-map', '0:v:0', '-vf', 'cropdetect=limit=24:round=2:reset=0', '-an'], { from: a, to: b });
  const all = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!all.length) return { w: info.w, h: info.h, x: 0, y: 0, bars: false };
  const [, w, h, x, y] = all[all.length - 1].map(Number);
  return { w, h, x, y, bars: w < info.w - 4 || h < info.h - 4, ratio: r3(w / h) };
}
// a "movie barcode": the average color of each moment, side by side (the color story of a reference in one picture)
async function barcode(file, { width = 1200, height = 240, from, to } = {}, o = {}) {
  const { ffmpeg } = need();
  const info = await probe(file);
  const span = Math.max(0.1, (to ?? info.duration) - (from || 0));
  const cols = Math.max(16, Math.min(4000, Math.round(width)));
  const out = o.out || path.join(outDir(file, o), `barcode-${cols}-${Date.now().toString(36)}.png`);
  await run(ffmpeg, ['-v', 'error', '-y', ...(from != null ? ['-ss', String(from)] : []), '-i', file, '-t', String(span), '-map', '0:v:0', '-vf', `fps=${cols / span},scale=1:1:flags=area,scale=1:${Math.round(height)}:flags=neighbor,tile=${cols}x1`, '-frames:v', '1', out], { timeout: 30 * 60000 });
  return { path: out, w: cols, h: Math.round(height) };
}
// the sound as a picture (waveform), for timing cuts by eye
async function waveform(file, { width = 1600, height = 240, color = 'ffc233' } = {}, o = {}) {
  const { ffmpeg } = need();
  const info = await probe(file);
  if (!info.audio) throw new Error('No sound in this video');
  const out = o.out || path.join(outDir(file, o), `waveform-${Date.now().toString(36)}.png`);
  await run(ffmpeg, ['-v', 'error', '-y', '-i', file, '-filter_complex', `[0:a:0]aformat=channel_layouts=mono,showwavespic=s=${Math.round(width)}x${Math.round(height)}:colors=${color}`, '-frames:v', '1', out], { timeout: 10 * 60000 });
  return { path: out, w: Math.round(width), h: Math.round(height) };
}
// the best loop: the later frame that looks most like the start of the range (a seamless loop for a reel / a GIF)
async function loop(file, { from = 0, min = 0.8, max = 8 } = {}) {
  const info = await probe(file);
  const { ffmpeg } = need();
  const start = await frameAt(file, { time: from }, { width: 64, format: 'png', dir: tmpRoot() });
  const span = Math.max(0.1, Math.min(max, info.duration - from) - min);
  const { err } = await run(ffmpeg, ['-hide_banner', '-nostats', '-ss', String(from + min), '-t', String(span), '-i', file, '-loop', '1', '-i', start.path, '-filter_complex', '[0:v:0]scale=64:-2,format=gray[a];[1:v]scale=64:-2,format=gray[b];[a][b]blend=all_mode=difference:shortest=1,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { timeout: 10 * 60000, maxBuffer: 128 << 20 });
  let best = null; let t = null;
  for (const line of String(err).split('\n')) {
    const m = line.match(/pts_time:([\d.]+)/); if (m) t = Number(m[1]);
    const v = line.match(/YAVG=([\d.]+)/); if (v && t != null) { const score = Number(v[1]); if (!best || score < best.score) best = { time: r3(from + min + t), score }; }
  }
  if (!best) throw new Error('No loop point found');
  const at = await locate(file, { time: best.time });
  return { from, to: at.time, frame: at.frame, tc: at.tc, length: r3(at.time - from), match: r3(1 - best.score / 255) };
}

// ---------- making things from a video (captures, references): a GIF, a trim, a timelapse, stills for After Effects ----
const jobOut = (file, o, suffix, ext) => o.out || path.join(o.dir || path.dirname(file), `${path.basename(file).replace(/\.[^.]+$/, '')} ${suffix}.${ext}`);
function uniq(p) { if (!exists(p)) return p; const m = p.match(/^(.*?)(\.[^.]+)?$/); for (let i = 2; ; i += 1) { const q = `${m[1]} (${i})${m[2] || ''}`; if (!exists(q)) return q; } }
const rangeArgs = (from, to) => [...(from != null ? ['-ss', String(from)] : []), ...(to != null ? ['-to', String(to)] : [])];
// op: gif (fps, width), trim, speed (factor), boomerang, sequence (fps, format), reframe (w, h, fit), mute, audio, poster (time)
async function edit(op, file, a = {}, o = {}) {
  const { ffmpeg } = need();
  const info = await probe(file);
  const range = rangeArgs(a.from, a.to);
  const label = a.from != null || a.to != null ? ` ${Number(a.from || 0).toFixed(2)}-${Number(a.to ?? info.duration).toFixed(2)}` : '';
  const x264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(a.crf || 18), '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  let out; let args;
  if (op === 'gif') {
    const fps = a.fps || 15; const w = a.width || Math.min(720, info.w);
    out = uniq(jobOut(file, o, `gif${label}`, 'gif'));
    args = ['-i', file, ...range, '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a`, '-loop', '0', out];
  } else if (op === 'trim') {
    out = uniq(jobOut(file, o, `trim${label}`, 'mp4'));
    args = ['-i', file, ...range, ...x264, ...(info.audio ? ['-c:a', 'aac', '-b:a', '192k'] : []), out];
  } else if (op === 'speed') {
    const k = Math.max(0.25, Math.min(16, Number(a.factor) || 2));
    out = uniq(jobOut(file, o, `${k}x`, 'mp4'));
    const atempo = []; let rest = k; while (rest > 2) { atempo.push('atempo=2'); rest /= 2; } while (rest < 0.5) { atempo.push('atempo=0.5'); rest /= 0.5; } atempo.push(`atempo=${rest}`);
    const sound = info.audio && k <= 4;
    args = ['-i', file, ...range, '-vf', `setpts=PTS/${k}`, ...(sound ? ['-af', atempo.join(',')] : ['-an']), ...x264, ...(sound ? ['-c:a', 'aac'] : []), out];
  } else if (op === 'boomerang') {
    out = uniq(jobOut(file, o, `boomerang${label}`, 'mp4'));
    // the range is trimmed inside the graph (an output -to would cut the doubled clip)
    const cut = a.from != null || a.to != null ? `trim=start=${Number(a.from || 0)}${a.to != null ? `:end=${Number(a.to)}` : ''},setpts=PTS-STARTPTS,` : '';
    args = ['-i', file, '-filter_complex', `[0:v]${cut}split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]`, '-map', '[v]', '-an', ...x264, out];
  } else if (op === 'sequence') {
    const dir = uniq(jobOut(file, o, `frames${label}`, 'seq').replace(/\.seq$/, ''));
    fs.mkdirSync(dir, { recursive: true });
    out = dir;
    args = ['-i', file, ...range, ...(a.fps ? ['-vf', `fps=${a.fps}`] : []), '-fps_mode', a.fps ? 'cfr' : 'passthrough', path.join(dir, `frame_%05d.${a.format === 'jpg' ? 'jpg' : 'png'}`)];
  } else if (op === 'reframe') {
    const w = Math.round((a.w || 1080) / 2) * 2; const h = Math.round((a.h || 1920) / 2) * 2;
    out = uniq(jobOut(file, o, `${w}x${h}${a.fit === 'fit' ? ' fit' : ''}`, 'mp4'));
    const vf = a.fit === 'fit'
      ? `split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:2[bg];[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    args = ['-i', file, ...range, '-filter_complex', `[0:v]${vf},setsar=1[v]`, '-map', '[v]', ...(info.audio ? ['-map', '0:a:0', '-c:a', 'aac'] : []), ...x264, out];
  } else if (op === 'mute') {
    out = uniq(jobOut(file, o, 'no sound', path.extname(file).slice(1) || 'mp4'));
    args = ['-i', file, '-map', '0:v:0', '-c', 'copy', '-an', out];
  } else if (op === 'audio') {
    if (!info.audio) throw new Error('No sound in this video');
    out = uniq(jobOut(file, o, `sound${label}`, 'm4a'));
    args = ['-i', file, ...range, '-vn', '-c:a', 'aac', '-b:a', '256k', out];
  } else if (op === 'poster') {
    out = uniq(jobOut(file, o, 'poster', 'png'));
    const at = await locate(file, { time: a.time ?? a.from ?? 0 });
    await grab(file, at.frame, await frameTimes(file), { out, fresh: true });
    return { path: out, frame: at.frame, tc: at.tc };
  } else throw new Error(`Unknown edit: ${op}`);
  await run(ffmpeg, ['-v', 'error', '-y', ...args], { timeout: 60 * 60000 });
  if (!exists(out)) throw new Error('ffmpeg made nothing');
  return { path: out, ...(op === 'sequence' ? { files: fs.readdirSync(out).length } : {}) };
}

// forget a miss now (ffmpeg was just installed)
function forgetTools() { for (const k of Object.keys(toolCache)) delete toolCache[k]; }
module.exports = { forgetTools, tools, setOverrides, probe, frameTimes, locate, frameAt, frames, every, spread, analyze: curves, scenes, motion, sheet, convert, tc, parseTime, outDir, black, freeze, silence, loudness, keyframes, crop, barcode, waveform, loop, edit, _test: { grab, grabPass, rangeFrames, findTool } };
