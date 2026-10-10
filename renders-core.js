// The render queue's model (round 13; renders.js draws it, renders-cmds.js drives it from chat). No DOM: it runs in
// the app and in Node for the unit tests (dev/renders-test.js).
//   PRESETS / SOCIALS / QUALITY      the output presets (one place to pick them: Reels / TikTok / Shorts 9:16, Story,
//                                    Feed 4:5, Square, YouTube 1080p / 4K, GIF, WebM, ProRes master, audio only)
//   resolve(id, opts, encoders)      a preset with its per-render choices (fps, quality, size) applied
//   buildArgs(V, id, src, opts)      ffmpeg arguments for a file (V = VideoData: its filters and encoders are reused)
//   seqPlan(id, opts)                how a Lab sequence makes a preset (its own frame size, or a render + a conversion)
//   outPath(input, preset, w, h, ext, stem)  where the file goes (next to the source, in "exports")
//   explain(text, platform)          a failure in plain words, with its fix
//   schedule(jobs, limits)           which waiting jobs start now (one ffmpeg job at a time by default; the Lab one)
//   eta(job, now) · fmtEta · fmtSize · fmtAgo · revealLabel(platform) · join / dirOf / base / stemOf / nextFree
const RendersCore = (() => {
  // ---------- presets ----------
  // base: the VideoData export preset whose size / bitrate / audio it starts from; seq: the Lab sequence format that
  // makes it at its real pixels (null: rendered at the sequence's own format, then converted)
  const PRESETS = [
    { id: 'vertical', name: 'Reels / TikTok / Shorts', short: '9:16', group: 'Socials', base: 'reels', w: 1080, h: 1920, fps: 30, mbps: 12, seq: '9:16', tip: 'One file for Instagram Reels, TikTok and YouTube Shorts: 1080×1920, 30 fps, 12 Mbps. Keep titles inside the middle 4:5.', keywords: 'reels tiktok shorts vertical portrait 9x16 instagram youtube shorts' },
    { id: 'story', name: 'Story', short: '9:16 · 60 s', group: 'Socials', base: 'reels', w: 1080, h: 1920, fps: 30, mbps: 8, seq: '9:16', limit: 60, tip: 'Instagram / Facebook / Snapchat stories: 9:16, cut at 60 s; keep text out of the top and bottom 250 px.', keywords: 'story stories snapchat 60s' },
    { id: 'feed45', name: 'Feed 4:5', short: '4:5', group: 'Socials', base: 'feed45', w: 1080, h: 1350, fps: 30, mbps: 10, seq: '4:5', tip: 'Instagram / Facebook feed: takes the most room in the feed.', keywords: 'feed portrait instagram facebook 4x5' },
    { id: 'square', name: 'Square', short: '1:1', group: 'Socials', base: 'square', w: 1080, h: 1080, fps: 30, mbps: 8, seq: '1:1', tip: 'Carousels, LinkedIn, X.', keywords: 'square 1x1 carousel linkedin' },
    { id: 'yt1080', name: 'YouTube 1080p', short: '16:9', group: 'YouTube', base: 'yt1080', w: 1920, h: 1080, fps: 0, mbps: 12, seq: '16:9', tip: '1920×1080 at the source\'s frame rate, 12 Mbps.', keywords: 'youtube landscape 16x9 hd 1080' },
    { id: 'yt4k', name: 'YouTube 4K', short: '16:9 · 4K', group: 'YouTube', base: 'yt4k', w: 3840, h: 2160, fps: 0, mbps: 45, seq: '16:9', up: true, tip: '3840×2160: YouTube gives 4K uploads its best encoder even for 1080p viewers. Big files.', keywords: 'youtube 4k uhd 2160' },
    { id: 'gif', name: 'GIF loop', short: 'GIF', group: 'Web', base: 'gif', w: 720, h: 0, fps: 15, codec: 'gif', seq: null, tip: '720 wide, 15 fps, palette-optimized; no sound.', keywords: 'gif loop animated' },
    { id: 'webm', name: 'WebM (VP9)', short: 'WebM', group: 'Web', base: 'webm', w: 0, h: 0, fps: 0, mbps: 6, codec: 'vp9', need: 'libvpx-vp9', seq: null, tip: 'For websites: same size, VP9 + Opus.', keywords: 'webm vp9 web website hero' },
    { id: 'master', name: 'ProRes master', short: 'ProRes', group: 'Master', base: 'master', w: 0, h: 0, fps: 0, codec: 'prores', need: 'prores_ks', seq: null, tip: 'ProRes 422 HQ, same size and rate, 24-bit sound: the high-quality master for After Effects / Premiere / Resolve. Without a ProRes encoder: a near-lossless H.264 master instead.', keywords: 'prores master high quality hq archive mov lossless' },
    { id: 'audio', name: 'Audio only', short: 'Sound', group: 'Master', base: null, w: 0, h: 0, fps: 0, codec: 'audio', seq: null, tip: 'The sound alone: AAC 256k (.m4a); Best: WAV 24-bit.', keywords: 'audio sound music m4a wav aac only' },
  ];
  const SOCIALS = ['vertical', 'feed45', 'square', 'yt1080'];
  const QUALITY = { draft: { label: 'Draft', hint: 'small, quick to check', k: 0.55, crf: 24, prores: 2 }, high: { label: 'High', hint: 'for posting', k: 1, crf: 18, prores: 3 }, best: { label: 'Best', hint: 'big file, near lossless', k: 1.7, crf: 14, prores: 3 } };
  const FPS = [0, 24, 30, 60]; // 0 = the preset's own (or the source's)
  const SIZES = { full: { label: 'Full size', k: 1 }, '2/3': { label: '⅔ size', k: 2 / 3 }, half: { label: 'Half size', k: 0.5 } };
  const get = (id) => PRESETS.find((p) => p.id === id || p.base === id) || null;
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // "reels square", "all socials", "9:16", "youtube 4k" → preset ids
  function pick(text) {
    const s = String(text || '').toLowerCase().trim();
    if (!s) return [];
    if (/\b(all|every)\b.*\bsocials?\b|^socials?$/.test(s)) return SOCIALS.slice();
    const out = [];
    const add = (id) => { if (!out.includes(id)) out.push(id); };
    for (const w of s.split(/[\s,+]+/).filter(Boolean)) {
      if (PRESETS.some((p) => p.id === w)) { add(w); continue; }
      if (/^(9:16|9x16|reels?|tiktok|shorts|vertical)$/.test(w)) add('vertical');
      else if (/^stor(y|ies)$/.test(w)) add('story');
      else if (/^(4:5|4x5|feed)$/.test(w)) add('feed45');
      else if (/^(1:1|1x1|square)$/.test(w)) add('square');
      else if (/^(4k|uhd|2160p?)$/.test(w)) { const i = out.indexOf('yt1080'); if (i >= 0) out.splice(i, 1); add('yt4k'); } else if (/^(16:9|16x9|youtube|yt|1080p?|landscape)$/.test(w)) { if (!out.includes('yt4k')) add('yt1080'); } else if (/^gif$/.test(w)) add('gif');
      else if (/^(webm|vp9)$/.test(w)) add('webm');
      else if (/^(prores|master|hq|mov)$/.test(w)) add('master');
      else if (/^(audio|sound|m4a|wav|mp3)$/.test(w)) add('audio');
    }
    return out;
  }

  // a preset with this render's choices: fps (0 = its own), quality, size; encoders = what this ffmpeg has
  function resolve(id, { fps = 0, quality = 'high', size = 'full' } = {}, encoders = null) {
    const p0 = get(id);
    if (!p0) throw new Error(`Unknown preset “${id}” (/renders presets lists them)`);
    const q = QUALITY[quality] || QUALITY.high;
    const k = (SIZES[size] || SIZES.full).k;
    const p = { ...p0, quality: QUALITY[quality] ? quality : 'high', size: SIZES[size] ? size : 'full' };
    if (fps) p.fps = Number(fps);
    if (p.w) p.w = even(p.w * k);
    if (p.h) p.h = even(p.h * k);
    if (p.mbps) p.mbps = Math.max(1, Math.round(p.mbps * q.k * (k < 1 ? k + 0.15 : 1) * 10) / 10);
    const has = (e) => !encoders || encoders.includes(e);
    if (p.codec === 'prores' && !has('prores_ks')) { p.codec = null; p.fallback = 'master-h264'; p.note = 'This ffmpeg has no ProRes encoder: a near-lossless H.264 master instead'; }
    if (p.codec === 'vp9' && !has('libvpx-vp9')) throw new Error('This ffmpeg can\'t make WebM (no VP9 encoder). Fix: install the full ffmpeg (Mac: brew reinstall ffmpeg · Windows: winget install Gyan.FFmpeg).');
    p.audioCodec = p.codec === 'vp9' ? (has('libopus') ? 'libopus' : 'libvorbis') : 'aac';
    return p;
  }

  // ffmpeg arguments for one file. src = { w, h, fps, duration, audio }; opts = { fit, offset, from, to, quality, fps,
  // size, encoders }. INPUT / OUTPUT placeholders like the rest of Hearth's ffmpeg jobs.
  function buildArgs(V, id, src = {}, opts = {}) {
    const p = resolve(id, opts, opts.encoders || null);
    const from = opts.from != null ? Number(opts.from) : null;
    let to = opts.to != null ? Number(opts.to) : null;
    const len0 = to != null ? to - (from || 0) : Math.max(0, (src.duration || 0) - (from || 0));
    if (p.limit && (!len0 || len0 > p.limit)) to = (from || 0) + p.limit;
    const duration = to != null ? to - (from || 0) : len0;
    if (p.codec === 'audio') {
      if (src.audio === null) throw new Error('This video has no sound to keep. Fix: pick a video with sound, or another preset.');
      const best = p.quality === 'best';
      const args = ['-hide_banner', '-y'];
      if (from != null) args.push('-ss', String(from));
      args.push('-i', 'INPUT');
      if (to != null) args.push('-t', String(Math.max(0.04, duration)));
      args.push('-vn', '-map', '0:a:0', ...(best ? ['-c:a', 'pcm_s24le'] : ['-c:a', 'aac', '-b:a', p.quality === 'draft' ? '160k' : '256k', '-ar', '48000']), 'OUTPUT');
      return { args, ext: best ? 'wav' : 'm4a', w: 0, h: 0, duration, preset: p };
    }
    // the VideoData preset this one is (its filters: scale / crop / blurred fill / fps)
    const base = { ...(V.EXPORT_PRESETS.find((x) => x.id === p.base) || {}), w: p.w, h: p.h, fps: p.fps, mbps: p.mbps, codec: p.codec || undefined };
    if (p.fallback === 'master-h264') { base.codec = undefined; base.mbps = 0; }
    const r = V.ffmpegArgs(base, { w: src.w || 0, h: src.h || 0, fps: src.fps || 0 }, { fit: opts.fit || 'crop', offset: opts.offset ?? 0.5, from: from ?? undefined, to: to ?? undefined });
    let args = r.args.slice();
    if (p.fallback === 'master-h264') {
      // swap the bitrate settings for a near-lossless constant quality
      const i = args.indexOf('-b:v');
      if (i >= 0) args.splice(i, 2, '-crf', '12');
      for (const k of ['-maxrate', '-bufsize']) { const j = args.indexOf(k); if (j >= 0) args.splice(j, 2); }
    }
    if (p.codec === 'prores') { const j = args.indexOf('-profile:v'); if (j >= 0) args[j + 1] = String(QUALITY[p.quality].prores); if (p.quality === 'best') { args[j + 1] = '4'; const f = args.indexOf('-pix_fmt'); if (f >= 0) args[f + 1] = 'yuva444p10le'; } }
    if (p.codec === 'vp9' && p.audioCodec !== 'libopus') { const j = args.indexOf('libopus'); if (j >= 0) args[j] = p.audioCodec; }
    if (src.audio === null && p.codec !== 'gif') { const o = args.lastIndexOf('OUTPUT'); args.splice(o, 0, '-an'); }
    return { args, ext: r.ext, w: r.w, h: r.h, duration, preset: p };
  }

  // a Lab sequence: the sequence renders itself at a preset's frame size (best: real pixels, its own sound), else
  // at its own format and a conversion follows (GIF, WebM, ProRes, audio, 4K)
  function seqPlan(id, { quality = 'high', fps = 0, own = '9:16' } = {}) {
    const p = get(id);
    if (!p) throw new Error(`Unknown preset “${id}”`);
    const crf = (QUALITY[quality] || QUALITY.high).crf;
    if (p.seq && !p.up && !p.limit) return { format: p.seq, fps: fps || p.fps || 0, crf, then: null };
    return { format: p.seq || own, fps: fps || (p.codec === 'gif' ? 0 : p.fps) || 0, crf: p.codec || p.up ? QUALITY.best.crf : crf, then: id };
  }

  // ---------- paths (Mac / Windows separators both work) ----------
  const sepOf = (p) => (String(p).includes('\\') && !String(p).includes('/') ? '\\' : '/');
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const dirOf = (p) => { const s = String(p || ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : i === 0 ? s.slice(0, 1) : ''; };
  const join = (d, ...parts) => { const s = sepOf(d); return [String(d).replace(/[\\/]+$/, ''), ...parts].join(s); };
  const stemOf = (p) => base(p).replace(/\.[^.]+$/, '');
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90) || 'render';
  function outPath(input, p, w, h, ext, stem = null) {
    const name = `${safe(stem || stemOf(input))}_${p.id}${w && h ? `_${w}x${h}` : ''}.${ext}`;
    return join(dirOf(input) || '.', 'exports', name);
  }
  // "a.mp4" → "a (2).mp4" while `taken(path)` says it exists
  async function nextFree(path, taken) {
    if (!(await taken(path))) return path;
    const d = dirOf(path); const b = base(path); const m = b.match(/^(.*?)(?: \((\d+)\))?(\.[^.]+)?$/);
    for (let i = Number(m[2] || 1) + 1; i < 500; i += 1) { const p = join(d, `${m[1]} (${i})${m[3] || ''}`); if (!(await taken(p))) return p; }
    return path;
  }
  const revealLabel = (platform) => (/darwin|mac/i.test(platform || '') ? 'Reveal in Finder' : /win/i.test(platform || '') ? 'Show in Explorer' : 'Show in folder');

  // ---------- failures in plain words ----------
  // [pattern, reason, fix] — the first that matches wins; the fix may name the platform's own way
  const ERRORS = [
    [/cancel/i, 'Stopped before it finished.', 'Retry when you want it.'],
    [/ffmpeg isn.t installed|install ffmpeg|ffmpeg not found|brew install ffmpeg|winget install/i, 'ffmpeg isn\'t installed, so Hearth can\'t make video files here.', (pl) => `Type /ffmpeg install (${/darwin/.test(pl) ? 'Homebrew: brew install ffmpeg' : /win/.test(pl) ? 'winget install Gyan.FFmpeg' : 'your package manager'}), then Retry.`],
    [/File not found|No such file or directory|ENOENT|does not exist/i, 'The source file isn\'t there any more (moved, renamed or deleted).', 'Open it again (Video Review or /renders open), or pick another file, then Retry.'],
    [/No space left|ENOSPC|disk full/i, 'The disk is full.', (pl) => `Free some space (${/darwin/.test(pl) ? 'empty the Trash' : /win/.test(pl) ? 'empty the Recycle Bin' : 'delete old renders'}; /renders history can move old renders to the Trash), then Retry.`],
    [/Permission denied|EACCES|EPERM|Operation not permitted|Read-only file system/i, 'Hearth isn\'t allowed to write in that folder.', (pl) => (/darwin/.test(pl) ? 'Allow Hearth in System Settings → Privacy & Security → Files and Folders (or Full Disk Access), or move the source to a folder you own, then Retry.' : /win/.test(pl) ? 'Windows Security → Ransomware protection → allow Hearth through Controlled folder access, or move the source to a folder you own, then Retry.' : 'Move the source to a folder you own, then Retry.')],
    [/Unknown encoder|Encoder not found|encoder .* not found|Unrecognized option.*(prores|vpx)/i, 'This ffmpeg can\'t make that format (it was built without its encoder).', (pl) => `Install the full ffmpeg (${/darwin/.test(pl) ? 'brew reinstall ffmpeg' : /win/.test(pl) ? 'winget install Gyan.FFmpeg' : 'your distribution\'s full build'}), or pick another preset.`],
    [/moov atom not found|Invalid data found|could not find codec parameters|End of file|corrupt/i, 'The source video is damaged or still being written.', 'Wait for the recording or render that makes it to finish, or make a playable copy first (/proxy), then Retry.'],
    [/matches no streams|does not contain any stream|Output file is empty|no audio|has no sound/i, 'The source has nothing of what this preset keeps (no picture, or no sound for audio only).', 'Pick another preset (Audio only needs a video with sound).'],
    [/not divisible by 2|width not divisible|height not divisible/i, 'The picture size is odd, which this encoder refuses.', 'Pick another size (⅔ or half), or another preset; Hearth rounds its own sizes.'],
    [/preview stopped answering|preview isn.t|page stopped/i, 'The Lab preview stopped answering while it rendered.', 'Reload the preview (/sequence reload or ↻ on the sequence), then Retry.'],
    [/Open the Three\.js Lab first|Lab first|ThreeLab/i, 'The Three.js Lab wasn\'t open for the render.', 'Open the Lab (the ◆ on the rail), then Retry.'],
    [/sequence is empty/i, 'The sequence has nothing in it yet.', 'Add a scene to the sequence (▤ Sequence → ＋), then Retry.'],
    [/A render is running|already running/i, 'Another render was using the Lab preview.', 'It waits its turn in the queue: Retry once that one finishes.'],
    [/Nothing was recorded|too short/i, 'The recording came out empty.', 'Record a little longer, or a smaller size / lower frame rate (/record 30fps 720p).'],
    [/killed|SIGKILL|stopped from outside|code null|exit -?\d+$/i, 'ffmpeg was stopped from outside (the computer slept, or it was closed).', 'Retry: it starts again from the top.'],
    [/Conversion failed|Error while|Error opening|Invalid argument/i, 'ffmpeg couldn\'t convert this file with these settings.', 'Try another preset or a lower quality; if it keeps failing, make a playable copy first (/proxy) and render that.'],
  ];
  function explain(text, platform = '') {
    const raw = String(text || '').trim();
    const last = raw.split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
    for (const [re, reason, fix] of ERRORS) if (re.test(raw)) return { reason, fix: typeof fix === 'function' ? fix(platform) : fix, raw: last.slice(0, 300) };
    return { reason: last ? `It stopped with: ${last.replace(/^Error:\s*/, '').slice(0, 160)}` : 'It stopped without saying why.', fix: 'Retry; if it fails again, try another preset (/habits errors shows how often this happens).', raw: last.slice(0, 300) };
  }

  // ---------- the queue ----------
  // lanes: 'ffmpeg' (exports, conversions: `ffmpeg` at a time, 1 by default), 'lab' (the Lab sequence draws in the
  // preview: one at a time), 'live' (recordings: not queued, only shown)
  const laneOf = (j) => j.lane || (j.kind === 'seq' ? 'lab' : j.kind === 'record' ? 'live' : 'ffmpeg');
  const ACTIVE = new Set(['running', 'starting']);
  function schedule(jobs, { ffmpeg = 1, lab = 1 } = {}) {
    const busy = { ffmpeg: 0, lab: 0, live: 0 };
    for (const j of jobs) if (ACTIVE.has(j.status) || (j.status === 'paused' && j.held)) busy[laneOf(j)] += 1;
    const cap = { ffmpeg: clamp(Number(ffmpeg) || 1, 1, 4), lab: clamp(Number(lab) || 1, 1, 1), live: Infinity };
    const start = [];
    const waiting = jobs.filter((j) => j.status === 'queued' && !(j.after && jobs.some((x) => x.id === j.after && !['done'].includes(x.status))))
      .sort((a, b) => (b.prio || 0) - (a.prio || 0) || a.created - b.created);
    for (const j of waiting) { const l = laneOf(j); if (busy[l] < cap[l]) { busy[l] += 1; start.push(j.id); } }
    return start;
  }
  // place in line among the waiting jobs of its lane (1 = next)
  function place(jobs, id) {
    const j = jobs.find((x) => x.id === id);
    if (!j || j.status !== 'queued') return 0;
    const line = jobs.filter((x) => x.status === 'queued' && laneOf(x) === laneOf(j)).sort((a, b) => (b.prio || 0) - (a.prio || 0) || a.created - b.created);
    return line.findIndex((x) => x.id === id) + 1;
  }
  // seconds left from the measured rate (after 3 % and 2 s of real work, paused time left out)
  function eta(j, now = Date.now()) {
    if (j.status !== 'running' || !(j.pct > 3) || j.pct >= 100) return null;
    const ran = (now - (j.started || now) - (j.pausedMs || 0)) / 1000;
    if (ran < 2) return null;
    return Math.max(1, Math.round((ran * (100 - j.pct)) / j.pct));
  }
  const fmtEta = (s) => (s == null ? '' : s < 60 ? `about ${Math.max(1, Math.round(s / 5) * 5 || 1)} s left` : s < 3600 ? `about ${Math.round(s / 60)} min left` : `about ${(s / 3600).toFixed(1)} h left`);
  const fmtSize = (b) => (!b ? '' : b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : b < 1e9 ? `${(b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB` : `${(b / 1e9).toFixed(2)} GB`);
  const fmtSecs = (s) => (s == null ? '' : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
  function fmtAgo(t, now = Date.now()) {
    const s = Math.max(0, (now - t) / 1000);
    return s < 50 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
  }
  const ICON = { queued: '◌', starting: '◔', running: '◔', paused: '❚❚', done: '✓', failed: '✕', cancelled: '–' };
  // history: newest first, one entry per job id, at most `max`
  function remember(list, entry, max = 120) { return [entry, ...(list || []).filter((x) => x.id !== entry.id)].slice(0, max); }

  return { PRESETS, SOCIALS, QUALITY, FPS, SIZES, ICON, get, pick, resolve, buildArgs, seqPlan, outPath, nextFree, revealLabel, explain, ERRORS, laneOf, schedule, place, eta, fmtEta, fmtSize, fmtSecs, fmtAgo, remember, join, dirOf, base, stemOf, safe, sepOf };
})();
if (typeof module !== 'undefined') module.exports = RendersCore;
