// MCP server for capture: lets a chat's Claude or Astra screenshot Hearth itself, record it (or run a scripted tour),
// and read frames of any video exactly (reference footage, recordings). Opt-in per chat (/capture-tools on) or per
// agent (agent.captureTools), since its tool list rides along with every message.
// Pictures come back inline (small JPEGs both engines can see) with their paths, so they can be attached or reused.
// When the hub isn't running, capture_frames still reads a video file with ffmpeg here (framereader.js).
const fs = require('fs');
const path = require('path');
const { serve, callHub } = require('./common');

const TOOLS = [
  { name: 'capture_shot', description: 'Screenshot of Hearth itself → path + a small view. target: window, tool, chat, transcript (whole chat, tall), dock, lab (full size), composer; or selector (CSS). crop: 9:16, 4:5, 1:1, 16:9… see: false = path only.',
    inputSchema: { type: 'object', properties: { target: { type: 'string' }, selector: { type: 'string' }, crop: { type: 'string' }, see: { type: 'boolean' } } } },
  { name: 'capture_record', description: 'Record Hearth itself (webm + mp4). start: target, preset, fps, size ("9:16"), sound (none|app|mic), seconds (then stops). mark: label. tour: name, or steps (one per line, e.g. open three / cmd /size 9:16 / wait 1s / caption "Hi" 2s / zoom .three-preview 1.4).',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'stop', 'status', 'pause', 'resume', 'mark', 'tour'] }, target: { type: 'string' }, preset: { type: 'string' }, fps: { type: 'integer' }, size: { type: 'string' }, sound: { type: 'string' }, seconds: { type: 'number' }, label: { type: 'string' }, name: { type: 'string' }, steps: { type: 'string' } }, required: ['action'] } },
  { name: 'capture_frames', description: 'Exact frames of any video. path: file, "last" (newest recording), "open" (Video Review). mode: at (times: s or "00:00:01:12", frames: [n]), every (every), spread (count), scenes (sensitivity), sheet (layout 4x3…), motion, pacing, palette, light, info, black, freeze, silence, loudness, letterbox, barcode, loop; make (op: gif|trim|speed|boomerang|reframe|sequence, from, to). → timecodes, paths, pictures.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, mode: { type: 'string' }, times: { type: 'array', items: {} }, frames: { type: 'array', items: { type: 'integer' } }, every: { type: 'integer' }, count: { type: 'integer' }, from: { type: 'number' }, to: { type: 'number' }, sensitivity: { type: 'string' }, layout: { type: 'string' }, op: { type: 'string' }, see: { type: 'boolean' } }, required: ['mode'] } },
  { name: 'capture_list', description: 'Newest screenshots and recordings (paths). kind: shot | video.', inputSchema: { type: 'object', properties: { kind: { type: 'string' }, limit: { type: 'integer' } } } },
];

// ---------- without the hub: read a video file straight with ffmpeg ----------
const unreachable = (r) => r && r.ok === false && /not running|Couldn't reach/i.test(String(r.error || ''));
const b64 = (p) => ({ data: fs.readFileSync(p).toString('base64'), mime: /\.png$/i.test(p) ? 'image/png' : 'image/jpeg' });
async function framesLocal(a) {
  const FR = require('../framereader');
  const file = String(a.path || '');
  if (!file || !path.isAbsolute(file) || !fs.existsSync(file)) return { ok: false, error: 'Hearth isn\'t running: give the video\'s full path.' };
  // the captures folder Settings chose (config.json settings.captureDir), like the hub does, else data/captures
  let root = path.join(__dirname, '..', 'data', 'captures');
  try { const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')).settings || {}; if (s.captureDir) root = s.captureDir; FR.setOverrides({ ffmpeg: s.ffmpegPath || undefined }); } catch { /* defaults */ }
  const dir = path.join(root, 'frames');
  const o = { dir, width: 768, format: 'jpg' };
  const mode = String(a.mode || 'sheet');
  let fps = 30;
  const list = (fr) => fr.map((f) => `${FR.tc(f.time, fps)} · f${f.frame} → ${f.path}`).join('\n');
  try {
    fps = (await FR.probe(file)).exactFps; // inside the try: no ffmpeg / a broken file is a clear error, not a crash
    if (mode === 'info') { const p = await FR.probe(file); return { ok: true, value: { ...p, frames: (await FR.frameTimes(file)).length } }; }
    if (mode === 'at') { const fr = await FR.frames(file, { frames: a.frames || [], times: (a.times || (a.frames ? [] : [0])).map((t) => (typeof t === 'number' ? t : FR.parseTime(t, fps))) }, o); return { ok: true, value: list(fr), images: a.see === false ? [] : fr.slice(0, 6).map((f) => b64(f.path)) }; }
    if (mode === 'every' || mode === 'spread') { const fr = mode === 'every' ? await FR.every(file, { every: a.every || 10, from: a.from, to: a.to, max: 48 }, o) : await FR.spread(file, { count: a.count || 12, from: a.from, to: a.to }, o); return { ok: true, value: list(fr), images: a.see === false ? [] : fr.length > 6 ? [b64((await FR.sheet(file, { cols: 4, count: Math.min(16, fr.length), from: a.from, to: a.to, width: 1536 }, { dir, format: 'jpg' })).path)] : fr.map((f) => b64(f.path)) }; }
    if (mode === 'scenes' || mode === 'pacing') {
      const th = { gentle: 0.45, normal: 0.3, sensitive: 0.18, every: 0.1 }[a.sensitivity] || 0.3;
      const s = await FR.scenes(file, { threshold: th, pictures: mode === 'scenes' }, o);
      const text = s.cuts.map((c, i) => `#${i + 1} ${c.tc} (${c.length.toFixed(2)}s)${c.path ? ` → ${c.path}` : ''}`).join('\n');
      return { ok: true, value: `${s.cuts.length} shots in ${s.duration.toFixed(2)}s\n${text}`, images: mode === 'scenes' && a.see !== false ? s.cuts.slice(0, 6).map((c) => b64(c.path)) : [] };
    }
    if (mode === 'motion') { const m = await FR.motion(file, { buckets: 32 }); return { ok: true, value: { average: m.average, calm: m.calm, busy: m.busy, peaks: m.peaks, curve: m.curve.map((p) => p.motion) } }; }
    if (mode === 'sheet') { const sh = await FR.sheet(file, { cols: 4, rows: 3, width: 1536 }, { dir, format: 'jpg' }); return { ok: true, value: `${sh.path}\n${sh.frames.map((f) => `f${f.frame} ${f.tc}`).join(' · ')}`, images: a.see === false ? [] : [b64(sh.path)] }; }
    return { ok: false, error: `Without Hearth running only: info, at, every, spread, scenes, pacing, motion, sheet.` };
  } catch (err) { return { ok: false, error: err.message }; }
}

const local = {
  // the hub first (it labels sheets, knows "last" / "open", falls back to the player without ffmpeg); a file read here otherwise
  capture_frames: async (a) => { const r = await callHub('capture_frames', a); return unreachable(r) ? framesLocal(a) : r; },
};

module.exports = serve({ name: 'capture', instructions: '', guide: '', tools: TOOLS, local }, module);
