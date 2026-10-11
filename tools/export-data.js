// Export presets for the render queue (renders-core.js / renders.js): the social formats, each platform's export preset
// (size, frame rate, bitrate, audio) and the ffmpeg arguments that make one from any video (scale / crop / fit /
// blurred fill, encoder). Kept from Video Review's data (tools/video-data.js) when Video Review was removed (round 17).
// No DOM here, so it also loads in Node for tests (module.exports at the bottom).
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
  // The video filters that turn a source frame { w, h, fps } into a preset's frame (scale / crop / fit / blurred
  // fill, frame rate): { vf: [filters], w, h }. Shared by single-file exports and the cut (tools/cut-data.js).
  function presetFilters(preset, src, { fit = 'crop', offset = 0.5 } = {}) {
    const p = typeof preset === 'string' ? EXPORT_PRESETS.find((x) => x.id === preset) : preset;
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
    return { vf, w: W, h: Hh };
  }
  // Encoder arguments of a preset (not GIF): { args, ext }.
  function codecArgs(preset) {
    const p = typeof preset === 'string' ? EXPORT_PRESETS.find((x) => x.id === preset) : preset;
    if (p.codec === 'prores') return { args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s24le'], ext: 'mov' };
    if (p.codec === 'vp9') return { args: ['-c:v', 'libvpx-vp9', '-b:v', `${p.mbps}M`, '-row-mt', '1', '-c:a', 'libopus', '-b:a', '160k'], ext: 'webm' };
    return { args: ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-b:v', `${p.mbps}M`, '-maxrate', `${Math.round(p.mbps * 1.5)}M`, '-bufsize', `${p.mbps * 2}M`, '-movflags', '+faststart', '-c:a', 'aac', '-b:a', /(\d+)k/.exec(p.audio)?.[1] ? `${/(\d+)k/.exec(p.audio)[1]}k` : '192k', '-ar', '48000'], ext: 'mp4' };
  }
  // ffmpeg arguments for a preset. src = { w, h, fps }; opts = { fit, offset (0..1 where to crop), from, to, out }.
  function ffmpegArgs(preset, src, { fit = 'crop', offset = 0.5, from, to, input, out } = {}) {
    const p = typeof preset === 'string' ? EXPORT_PRESETS.find((x) => x.id === preset) : preset;
    if (!p) throw new Error(`Unknown preset ${preset}`);
    const { vf, w: W, h: Hh } = presetFilters(p, src, { fit, offset });
    const args = ['-hide_banner', '-y'];
    if (from != null) args.push('-ss', String(from));
    args.push('-i', input || 'INPUT');
    if (to != null) args.push('-t', String(Math.max(0.04, to - (from || 0))));
    if (p.codec === 'gif') {
      const chain = [...vf.filter((f) => !f.startsWith('fps')), `fps=${p.fps || 15}`];
      args.push('-filter_complex', `[0:v]${chain.join(',')},split[x][y];[x]palettegen=stats_mode=diff[pal];[y][pal]paletteuse=dither=sierra2_4a`, '-loop', '0');
    } else {
      if (vf.length) args.push(vf.some((f) => f.includes('[')) ? '-filter_complex' : '-vf', vf.join(','));
      args.push(...codecArgs(p).args);
    }
    args.push(out || 'OUTPUT');
    return { args, w: W, h: Hh, ext: p.codec === 'prores' ? 'mov' : p.codec === 'vp9' ? 'webm' : p.codec === 'gif' ? 'gif' : 'mp4' };
  }

  return { FORMATS, MAIN_FORMATS, aspectOf, formatInfo, orientation, EXPORT_PRESETS, FIT_MODES, ffmpegArgs, presetFilters, codecArgs };
})();
if (typeof module !== 'undefined') module.exports = VideoData;
