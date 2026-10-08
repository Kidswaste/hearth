// Video Review data and pure helpers: social formats, platform safe zones, export presets (ffmpeg / aerender),
// crop guides between formats, timecodes, version names, note export and the render pipeline description a
// node view can drive. No DOM here, so it also loads in Node for tests (module.exports at the bottom).
const VideoData = (() => {
  // ---------- formats ----------
  // The owner's four social frame sizes first; the rest are recognized but rarer.
  const FORMATS = [
    { id: '9:16', w: 1080, h: 1920, name: 'Vertical', hint: 'TikTok · Reels · Shorts' },
    { id: '16:9', w: 1920, h: 1080, name: 'Landscape', hint: 'YouTube · X · Vimeo' },
    { id: '4:5', w: 1080, h: 1350, name: 'Portrait', hint: 'Instagram / Facebook feed' },
    { id: '1:1', w: 1080, h: 1080, name: 'Square', hint: 'Feed · LinkedIn · carousels' },
    { id: '4:3', w: 1440, h: 1080, name: '4:3', hint: 'Classic' },
    { id: '21:9', w: 2560, h: 1080, name: 'Cinema', hint: 'Ultra-wide' },
    { id: '2:3', w: 1000, h: 1500, name: '2:3', hint: 'Pinterest pin' },
  ];
  const MAIN_FORMATS = FORMATS.slice(0, 4).map((f) => f.id);
  // Nearest known aspect (within 3%), else 'other'.
  function aspectOf(w, h) {
    if (!w || !h) return null;
    const r = w / h;
    let best = null; let bd = Infinity;
    for (const f of FORMATS) { const d = Math.abs(Math.log(r / (f.w / f.h))); if (d < bd) { bd = d; best = f.id; } }
    return bd < 0.03 ? best : 'other';
  }
  const formatInfo = (id) => FORMATS.find((f) => f.id === id) || null;
  const orientation = (w, h) => (!w || !h ? null : w > h * 1.05 ? 'landscape' : h > w * 1.05 ? 'portrait' : 'square');

  // ---------- safe zones ----------
  // Areas covered by each app's UI on a full-screen vertical video, in pixels of a 1080×1920 frame (approximate,
  // from the platforms' creator guides; apps move things around, so keep a margin). `safe` is the clear area.
  const SAFE_ZONES = {
    tiktok: { name: 'TikTok', ref: [1080, 1920], aspect: '9:16', safe: [60, 150, 900, 1330],
      blocked: [{ r: [0, 0, 1080, 150], label: 'Following · For You' }, { r: [945, 620, 135, 880], label: 'Like · comment · share' }, { r: [0, 1480, 1080, 440], label: 'Caption · sound' }] },
    reels: { name: 'Instagram Reels', ref: [1080, 1920], aspect: '9:16', safe: [60, 220, 880, 1230],
      blocked: [{ r: [0, 0, 1080, 220], label: 'Reels header' }, { r: [950, 900, 130, 640], label: 'Buttons' }, { r: [0, 1450, 1080, 470], label: 'Caption · audio' }] },
    shorts: { name: 'YouTube Shorts', ref: [1080, 1920], aspect: '9:16', safe: [60, 170, 860, 1250],
      blocked: [{ r: [0, 0, 1080, 170], label: 'Search · menu' }, { r: [930, 760, 150, 760], label: 'Like · dislike · comments' }, { r: [0, 1420, 1080, 500], label: 'Title · channel · subscribe' }] },
    facebook: { name: 'Facebook Reels', ref: [1080, 1920], aspect: '9:16', safe: [60, 200, 870, 1240],
      blocked: [{ r: [0, 0, 1080, 200], label: 'Header' }, { r: [940, 860, 140, 660], label: 'Buttons' }, { r: [0, 1440, 1080, 480], label: 'Caption' }] },
    snapchat: { name: 'Snapchat Spotlight', ref: [1080, 1920], aspect: '9:16', safe: [60, 150, 900, 1370],
      blocked: [{ r: [0, 0, 1080, 150], label: 'Header' }, { r: [960, 900, 120, 560], label: 'Buttons' }, { r: [0, 1520, 1080, 400], label: 'Caption' }] },
    feed45: { name: 'Instagram feed 4:5 (grid shows 3:4)', ref: [1080, 1350], aspect: '4:5', safe: [34, 0, 1012, 1350],
      blocked: [{ r: [0, 0, 34, 1350], label: 'Cut on the profile grid' }, { r: [1046, 0, 34, 1350], label: 'Cut on the profile grid' }] },
    youtube: { name: 'YouTube player', ref: [1920, 1080], aspect: '16:9', safe: [96, 54, 1728, 900],
      blocked: [{ r: [0, 960, 1920, 120], label: 'Progress bar · controls' }, { r: [0, 0, 1920, 90], label: 'Title (on hover)' }] },
  };
  SAFE_ZONES.all = { name: 'Safe on every vertical app', ref: [1080, 1920], aspect: '9:16', safe: [60, 220, 860, 1200],
    blocked: ['tiktok', 'reels', 'shorts'].flatMap((k) => SAFE_ZONES[k].blocked.map((b) => ({ ...b, label: `${SAFE_ZONES[k].name}: ${b.label}` }))) };
  // Classic broadcast guides (fractions of the frame).
  const GUIDES = [
    { id: 'safe', name: 'Title / action safe (90% / 93%)' },
    { id: 'thirds', name: 'Rule of thirds' },
    { id: 'center', name: 'Center cross' },
    { id: 'grid', name: 'Grid 8×8' },
    { id: 'golden', name: 'Golden ratio' },
    { id: 'diag', name: 'Diagonals' },
  ];
  // Rectangles (fractions of the video) that a zone covers, scaled to any frame of the same aspect.
  function zoneRects(id, w, h) {
    const z = SAFE_ZONES[id];
    if (!z) return null;
    const [rw, rh] = z.ref;
    const sx = 1 / rw; const sy = 1 / rh;
    const fit = !w || !h || Math.abs(Math.log((w / h) / (rw / rh))) < 0.03;
    return { name: z.name, fits: fit, safe: z.safe.map((v, i) => v * (i % 2 ? sy : sx)), blocked: z.blocked.map((b) => ({ label: b.label, r: b.r.map((v, i) => v * (i % 2 ? sy : sx)) })) };
  }
  // Which safe-zone sets make sense for a frame.
  const zonesFor = (w, h) => {
    const a = aspectOf(w, h);
    return Object.keys(SAFE_ZONES).filter((k) => !a || SAFE_ZONES[k].aspect === a);
  };

  // ---------- export presets ----------
  // What each platform wants (H.264 unless noted). mbps = suggested video bitrate; ffmpeg settings are derived.
  const EXPORT_PRESETS = [
    { id: 'tiktok', name: 'TikTok', w: 1080, h: 1920, fps: 30, mbps: 12, audio: 'AAC 256k 48 kHz', max: '10 min · 287 MB (app) / 1 GB (web)', tip: 'Upload from desktop to avoid re-compression; 30 fps keeps motion crisp on their encoder.' },
    { id: 'reels', name: 'Instagram Reels', w: 1080, h: 1920, fps: 30, mbps: 10, audio: 'AAC 256k 48 kHz', max: '3 min · 4 GB', tip: 'Cover frame shows 1080×1350 (4:5) in the grid: keep the title in the middle.' },
    { id: 'shorts', name: 'YouTube Shorts', w: 1080, h: 1920, fps: 60, mbps: 15, audio: 'AAC 320k 48 kHz', max: '3 min', tip: '60 fps survives YouTube\'s encoder best for particle-heavy visuals.' },
    { id: 'feed45', name: 'Instagram / Facebook feed 4:5', w: 1080, h: 1350, fps: 30, mbps: 10, audio: 'AAC 256k 48 kHz', max: '60 min · 4 GB', tip: 'Takes the most screen in the feed; the profile grid crops it to 3:4.' },
    { id: 'square', name: 'Square 1:1', w: 1080, h: 1080, fps: 30, mbps: 8, audio: 'AAC 256k 48 kHz', max: '—', tip: 'Carousels, LinkedIn, X timelines.' },
    { id: 'yt1080', name: 'YouTube 1080p', w: 1920, h: 1080, fps: 30, mbps: 12, audio: 'AAC 320k 48 kHz', max: '12 h · 256 GB', tip: 'Uploading 1440p gets you the better VP9/AV1 encode even for 1080p viewers.' },
    { id: 'yt1440', name: 'YouTube 1440p (better encode)', w: 2560, h: 1440, fps: 60, mbps: 24, audio: 'AAC 320k 48 kHz', max: '12 h', tip: 'Upscale trick: YouTube gives 1440p uploads a higher-quality codec.' },
    { id: 'yt4k', name: 'YouTube 4K', w: 3840, h: 2160, fps: 60, mbps: 53, audio: 'AAC 384k 48 kHz', max: '12 h', tip: 'Best for detailed music visuals; big files.' },
    { id: 'x169', name: 'X / Twitter 16:9', w: 1920, h: 1080, fps: 30, mbps: 8, audio: 'AAC 128k 44.1 kHz', max: '2:20 · 512 MB', tip: 'X re-encodes hard; keep gradients noisy (add grain) to avoid banding.' },
    { id: 'x916', name: 'X / Twitter vertical', w: 1080, h: 1920, fps: 30, mbps: 8, audio: 'AAC 128k 44.1 kHz', max: '2:20 · 512 MB', tip: '' },
    { id: 'snap', name: 'Snapchat Spotlight', w: 1080, h: 1920, fps: 30, mbps: 8, audio: 'AAC 192k 48 kHz', max: '60 s', tip: '' },
    { id: 'pinterest', name: 'Pinterest 2:3', w: 1000, h: 1500, fps: 30, mbps: 8, audio: 'AAC 192k 48 kHz', max: '15 min', tip: '' },
    { id: 'linkedin', name: 'LinkedIn 1:1', w: 1080, h: 1080, fps: 30, mbps: 8, audio: 'AAC 192k 48 kHz', max: '10 min · 5 GB', tip: '' },
    { id: 'vimeo', name: 'Vimeo 1080p (high quality)', w: 1920, h: 1080, fps: 30, mbps: 20, audio: 'AAC 320k 48 kHz', max: '—', tip: '' },
    { id: 'proxy', name: 'Review proxy (small, fast)', w: 0, h: 720, fps: 0, mbps: 3, audio: 'AAC 128k', max: '—', tip: 'Small H.264 copy that plays anywhere (for ProRes / huge renders).' },
    { id: 'master', name: 'ProRes 422 HQ master', w: 0, h: 0, fps: 0, mbps: 0, codec: 'prores', audio: 'PCM 24-bit', max: '—', tip: 'Archive / handoff master, same size and rate.' },
    { id: 'webm', name: 'WebM (VP9) for the web', w: 0, h: 0, fps: 0, mbps: 6, codec: 'vp9', audio: 'Opus 160k', max: '—', tip: 'Website hero loops.' },
    { id: 'gif', name: 'GIF loop (720 wide, 15 fps)', w: 720, h: 0, fps: 15, mbps: 0, codec: 'gif', audio: 'none', max: '—', tip: 'Palette-optimized GIF of the loop range (or whole video).' },
  ];
  // How a source frame fits a target: 'crop' fills (cutting edges), 'fit' letterboxes, 'blur' fills the bars with a blurred copy.
  const FIT_MODES = ['crop', 'fit', 'blur'];
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  // ffmpeg arguments for a preset. src = { w, h, fps }; opts = { fit, offset (0..1 where to crop), from, to, out }.
  function ffmpegArgs(preset, src, { fit = 'crop', offset = 0.5, from, to, input, out } = {}) {
    const p = typeof preset === 'string' ? EXPORT_PRESETS.find((x) => x.id === preset) : preset;
    if (!p) throw new Error(`Unknown preset ${preset}`);
    const W = p.w || (p.h && src.h ? even((src.w * p.h) / src.h) : src.w);
    const Hh = p.h || (p.w && src.w ? even((src.h * p.w) / src.w) : src.h);
    const vf = [];
    if (W !== src.w || Hh !== src.h) {
      const srcR = src.w / src.h; const dstR = W / Hh;
      if (Math.abs(Math.log(srcR / dstR)) < 0.01 || !p.w || !p.h) vf.push(`scale=${W}:${Hh}:flags=lanczos`);
      else if (fit === 'fit') vf.push(`scale=${W}:${Hh}:force_original_aspect_ratio=decrease:flags=lanczos`, `pad=${W}:${Hh}:(ow-iw)/2:(oh-ih)/2:color=black`);
      else if (fit === 'blur') {
        vf.push(`split[a][b];[a]scale=${W}:${Hh}:force_original_aspect_ratio=increase,crop=${W}:${Hh},gblur=sigma=40,eq=brightness=-0.08[bg];[b]scale=${W}:${Hh}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`);
      } else {
        const o = Math.max(0, Math.min(1, offset));
        if (srcR > dstR) vf.push(`scale=-2:${Hh}:flags=lanczos`, `crop=${W}:${Hh}:(iw-${W})*${o.toFixed(3)}:0`);
        else vf.push(`scale=${W}:-2:flags=lanczos`, `crop=${W}:${Hh}:0:(ih-${Hh})*${o.toFixed(3)}`);
      }
    }
    if (p.fps && src.fps && Math.abs(p.fps - src.fps) > 0.01) vf.push(`fps=${p.fps}`);
    const args = ['-hide_banner', '-y'];
    if (from != null) args.push('-ss', String(from));
    args.push('-i', input || 'INPUT');
    if (to != null) args.push('-t', String(Math.max(0.04, to - (from || 0))));
    if (p.codec === 'gif') {
      const chain = [...vf.filter((f) => !f.startsWith('fps')), `fps=${p.fps || 15}`];
      args.push('-filter_complex', `[0:v]${chain.join(',')},split[x][y];[x]palettegen=stats_mode=diff[pal];[y][pal]paletteuse=dither=sierra2_4a`, '-loop', '0');
    } else {
      if (vf.length) args.push(vf.some((f) => f.includes('[')) ? '-filter_complex' : '-vf', vf.join(','));
      if (p.codec === 'prores') args.push('-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s24le');
      else if (p.codec === 'vp9') args.push('-c:v', 'libvpx-vp9', '-b:v', `${p.mbps}M`, '-row-mt', '1', '-c:a', 'libopus', '-b:a', '160k');
      else args.push('-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-b:v', `${p.mbps}M`, '-maxrate', `${Math.round(p.mbps * 1.5)}M`, '-bufsize', `${p.mbps * 2}M`, '-movflags', '+faststart', '-c:a', 'aac', '-b:a', /(\d+)k/.exec(p.audio)?.[1] ? `${/(\d+)k/.exec(p.audio)[1]}k` : '192k', '-ar', '48000');
    }
    args.push(out || 'OUTPUT');
    return { args, w: W, h: Hh, ext: p.codec === 'prores' ? 'mov' : p.codec === 'vp9' ? 'webm' : p.codec === 'gif' ? 'gif' : 'mp4' };
  }
  // AE output-module templates that fit a preset (from the user's own template names).
  function omTemplatesFor(preset, templates = []) {
    const p = typeof preset === 'string' ? EXPORT_PRESETS.find((x) => x.id === preset) : preset;
    const want = p?.codec === 'prores' ? /prores|lossless/i : p?.codec === 'gif' ? /gif|png/i : /h\.?264|mp4|h264|youtube|social/i;
    return templates.filter((t) => want.test(t));
  }

  // ---------- crop guides ----------
  // "Make a 1080×1350 from my 1080×1920": the crop window (fractions of the source) for an offset 0..1.
  function cropWindow(srcW, srcH, dstW, dstH, offset = 0.5) {
    const s = srcW / srcH; const d = dstW / dstH;
    const o = Math.max(0, Math.min(1, offset));
    if (s > d) { const w = d / s; return { x: (1 - w) * o, y: 0, w, h: 1, axis: 'x', keep: w }; }
    const h = s / d; return { x: 0, y: (1 - h) * o, w: 1, h, axis: 'y', keep: h };
  }
  const CROP_RECIPES = [
    { from: '9:16', to: '4:5', note: 'Keeps 70% of the height: titles in the top/bottom 15% get cut.' },
    { from: '9:16', to: '1:1', note: 'Keeps 56% of the height.' },
    { from: '16:9', to: '9:16', note: 'Keeps a third of the width: best for centered subjects; consider "blur" fill instead.' },
    { from: '16:9', to: '1:1', note: 'Keeps 56% of the width.' },
    { from: '16:9', to: '4:5', note: 'Keeps 45% of the width.' },
    { from: '4:5', to: '1:1', note: 'Keeps 80% of the height.' },
    { from: '4:5', to: '9:16', note: 'Fills by cropping the sides (keeps 70% of the width) or use "blur" fill.' },
    { from: '1:1', to: '9:16', note: 'Cropping keeps 56% of the width: "blur" or "fit" usually reads better.' },
    { from: '1:1', to: '4:5', note: 'Keeps 80% of the width.' },
  ];

  // ---------- timecodes ----------
  const pad = (n) => String(n).padStart(2, '0');
  // Frame index at a time (the frame on screen), rounding a hair down so a seek to n/fps shows frame n.
  const frameAt = (sec, fps) => Math.floor(sec * fps + 1e-4);
  // Where to seek to show frame n: its middle, so decoders never land on the previous frame.
  const timeOfFrame = (n, fps) => (Math.max(0, n) + 0.5) / fps;
  function tc(sec, fps = 30) {
    const nf = Math.round(fps);
    const f = frameAt(Math.max(0, sec || 0), fps);
    return `${pad(Math.floor(f / (nf * 3600)))}:${pad(Math.floor(f / (nf * 60)) % 60)}:${pad(Math.floor(f / nf) % 60)}:${pad(f % nf)}`;
  }
  const short = (sec) => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60); return `${m}:${(sec % 60).toFixed(2).padStart(5, '0')}`; };
  // Accepts "12.5", "1:23", "1:23.4", "00:01:23:12" (timecode), "f240" / "240f" (frames), "+2s" / "-10f" (relative to `now`), "50%".
  function parseTime(text, fps = 30, now = 0, duration = 0) {
    const s = String(text || '').trim().toLowerCase();
    if (!s) return null;
    let m = s.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*(f|s)?$/);
    if (m) { const v = Number(m[2]) / (m[3] === 'f' ? fps : 1); return now + (m[1] === '-' ? -v : v); }
    m = s.match(/^f(\d+)$/) || s.match(/^(\d+)f$/);
    if (m) return Number(m[1]) / fps;
    m = s.match(/^(\d+(?:\.\d+)?)%$/);
    if (m) return (Number(m[1]) / 100) * duration;
    m = s.match(/^(\d+(?:\.\d+)?)s?$/);
    if (m) return Number(m[1]);
    const parts = s.split(/[:;]/);
    if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    const n = parts.map(Number);
    if (n.length === 4) return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / fps;
    if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
    if (n.length === 2) return n[0] * 60 + n[1];
    return null;
  }

  // ---------- versions ----------
  // "neon_tunnel_v3.mp4" → { stem: 'neon_tunnel', ver: 3 }; "final", "copy", "(2)" and dates count as versions too.
  function versionInfo(fileName) {
    const name = String(fileName).replace(/\.[^.]+$/, '');
    const m = name.match(/^(.*?)[\s_.-]+(?:v|ver|version|rev)\.?[\s_]?(\d{1,4})$/i) || name.match(/^(.*?[a-z])v(\d{1,3})$/i) || name.match(/^(.*?)[\s_-]*\((\d+)\)$/) || name.match(/^(.*?)[\s_-]+(\d{1,3})$/);
    if (m && m[1]) return { stem: m[1].toLowerCase().replace(/[\s_.-]+$/, ''), ver: Number(m[2]) };
    const f = name.match(/^(.*?)[\s_-]*(final|copy|new|fix|edit|alt)\d*$/i);
    if (f && f[1]) return { stem: f[1].toLowerCase(), ver: null, tag: f[2].toLowerCase() };
    return { stem: name.toLowerCase().replace(/[\s_-]*\d{6,}$/, '').replace(/[\s_-]*\d{3,4}x\d{3,4}$/, ''), ver: null };
  }

  // ---------- notes ----------
  const CATEGORIES = [
    { id: 'timing', name: 'Timing', color: '#ffb547', key: '1' },
    { id: 'color', name: 'Color', color: '#ff6b9a', key: '2' },
    { id: 'text', name: 'Text', color: '#6bc7ff', key: '3' },
    { id: 'motion', name: 'Motion', color: '#9b8bff', key: '4' },
    { id: 'audio', name: 'Audio / sync', color: '#4fd18b', key: '5' },
    { id: 'framing', name: 'Framing', color: '#ff8c42', key: '6' },
    { id: 'fx', name: 'Effects', color: '#d27bff', key: '7' },
    { id: 'general', name: 'General', color: '#c8c8c8', key: '8' },
  ];
  const category = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  // Guess a category from the words in a note (used when none is picked).
  function guessCategory(text) {
    const t = String(text).toLowerCase();
    if (/\b(late|early|beat|sync|timing|faster|slower|hold|pause|cut|drop|tempo|bpm|frames?)\b/.test(t)) return 'timing';
    if (/\b(colou?r|hue|saturat|bright|dark|contrast|grade|tint|red|blue|green|pink|warm|cool|white|black|gold)\b/.test(t)) return 'color';
    if (/\b(text|title|font|caption|typo|word|letter|kerning|subtitle|logo)\b/.test(t)) return 'text';
    if (/\b(motion|move|ease|speed|bounce|spin|rotate|shake|jitter|camera|zoom|smooth)\b/.test(t)) return 'motion';
    if (/\b(audio|sound|music|kick|snare|bass|volume|mix|loud)\b/.test(t)) return 'audio';
    if (/\b(frame|framing|crop|safe|edge|center|margin|composition|position)\b/.test(t)) return 'framing';
    if (/\b(glow|bloom|blur|grain|particles?|effect|fx|glitch|noise|shader)\b/.test(t)) return 'fx';
    return 'general';
  }
  const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function notesToMarkdown(list, { title = 'Video notes', file = '', fps = 30, size = '' } = {}) {
    const out = [`# ${title}`, ''];
    if (file) out.push(`File: \`${file}\`${size ? ` · ${size}` : ''} · timecodes at ${fps} fps`, '');
    const open = list.filter((n) => !n.done); const done = list.filter((n) => n.done);
    for (const n of open) out.push(`- [ ] **${tc(n.t, fps)}** (${n.t.toFixed(2)} s) · _${category(n.cat).name}_: ${n.text}${n.color ? ` [${n.color}]` : ''}${n.draw?.length ? ' ✎' : ''}`);
    if (done.length) { out.push('', '## Resolved', ''); for (const n of done) out.push(`- [x] ${tc(n.t, fps)} · ${category(n.cat).name}: ${n.text}`); }
    return out.join('\n');
  }
  function notesToCsv(list, { fps = 30, file = '' } = {}) {
    const rows = [['file', 'timecode', 'seconds', 'frame', 'category', 'status', 'note', 'color', 'author', 'frame_grab']];
    for (const n of list) rows.push([file, tc(n.t, fps), n.t.toFixed(3), frameAt(n.t, fps), category(n.cat).name, n.done ? 'resolved' : 'open', n.text, n.color || '', n.by || 'you', n.frame || '']);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  }

  // ---------- pipeline (for a node view) ----------
  // The steps that turn a project into reviewed, delivered video, as nodes + edges. Each node names the chat
  // command that runs it, so a node editor can drive the same actions.
  function pipeline({ source = 'ae', comp = '', preset = 'reels', file = '' } = {}) {
    const nodes = [
      source === 'lab'
        ? { id: 'source', type: 'lab-sketch', label: 'Three.js Lab sketch', out: ['video'], cmd: '/three' }
        : { id: 'source', type: 'ae-project', label: comp ? `AE comp “${comp}”` : 'After Effects project', out: ['project'], params: { comp }, cmd: '/ae-projects' },
      source === 'lab'
        ? { id: 'render', type: 'lab-record', label: 'Record (⏺ in the Lab)', in: ['video'], out: ['video'], cmd: null }
        : { id: 'render', type: 'aerender', label: 'Render with aerender', in: ['project'], out: ['video'], params: { comp }, cmd: `/render ${comp || '<comp>'}` },
      { id: 'review', type: 'review', label: 'Review + notes', in: ['video'], out: ['notes', 'video'], params: { file }, cmd: '/review' },
      { id: 'feedback', type: 'feedback', label: 'Feedback to the director', in: ['notes'], out: ['changes'], cmd: '/send-feedback' },
      { id: 'export', type: 'export', label: `Export (${(EXPORT_PRESETS.find((p) => p.id === preset) || {}).name || preset})`, in: ['video'], out: ['file'], params: { preset }, cmd: `/export ${preset}` },
    ];
    const edges = [['source', 'render'], ['render', 'review'], ['review', 'feedback'], ['feedback', 'source'], ['review', 'export']].map(([from, to]) => ({ from, to }));
    return { nodes, edges };
  }

  const api = {
    FORMATS, MAIN_FORMATS, aspectOf, formatInfo, orientation,
    SAFE_ZONES, GUIDES, zoneRects, zonesFor,
    EXPORT_PRESETS, FIT_MODES, ffmpegArgs, omTemplatesFor, cropWindow, CROP_RECIPES,
    tc, short, frameAt, timeOfFrame, parseTime, versionInfo,
    CATEGORIES, category, guessCategory, notesToMarkdown, notesToCsv, pipeline,
  };
  return api;
})();
if (typeof module !== 'undefined') module.exports = VideoData;
