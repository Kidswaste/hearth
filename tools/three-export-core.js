// Lab export (round 22, labexport), the model: no DOM, no Electron (tools/three-export.js drives it; dev/labexport-test.js
// checks it in Node). The Lab's best-quality output: offline frame-exact renders in a hidden page of their own.
//   FORMATS          what can be made: videos (H.264, HEVC, ProRes 4444 + alpha, WebM VP9 + alpha), a PNG sequence
//                    (+ alpha), perfect loops (GIF, MP4), stills (PNG, 16-bit PNG), and the scene itself (GLB, a
//                    self-contained web page, a slider preset, a contact sheet)
//   SIZES            frame sizes by name (frame = the Lab's own, 1080p, 4K, 8K square, print sizes…) and "W×H"
//   page(w, h, ss)   the hidden page's CSS size and pixel ratio: the same composition as the Lab preview (CSS long
//                    side ≤ 1920), at w × h × supersampling, within the GPU memory cap
//   args(o)          ffmpeg's arguments for a format (quality, sound, loop cross-fade, odd sizes, fallbacks)
//   loopLen / findLoop   a loop's length on the song's bars, or found from the frames' small signatures
//   eta, speed       time left and frames a second, measured
//   preset           the sliders as a preset file (and back)
const LabExportCore = (() => {
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  // kind: video | seq (a folder of frames) | still | scene (not a render). frames: how each frame travels from the page
  const FORMATS = [
    { id: 'mp4', name: 'MP4 · H.264', ext: 'mp4', kind: 'video', frames: 'jpeg', audio: 'aac', tip: 'plays everywhere (socials, web, phones)' },
    { id: 'hevc', name: 'HEVC · H.265 10-bit', ext: 'mp4', kind: 'video', frames: 'png', audio: 'aac', tip: 'half the size of H.264 at the same quality, smoother gradients (Apple devices, YouTube)' },
    { id: 'prores', name: 'ProRes 4444 + alpha', ext: 'mov', kind: 'video', frames: 'png', alpha: true, audio: 'pcm', tip: 'master for editing (Premiere, Final Cut, Resolve, After Effects), keeps transparency' },
    { id: 'webm', name: 'WebM · VP9 + alpha', ext: 'webm', kind: 'video', frames: 'png', alpha: true, audio: 'opus', tip: 'for websites, keeps transparency' },
    { id: 'png', name: 'PNG sequence + alpha', ext: 'png', kind: 'seq', frames: 'png', alpha: true, tip: 'one lossless picture per frame, for compositing' },
    { id: 'gif', name: 'GIF · perfect loop', ext: 'gif', kind: 'video', frames: 'png', loop: true, tip: 'loops without a seam, palette tuned per clip' },
    { id: 'loop', name: 'MP4 · perfect loop', ext: 'mp4', kind: 'video', frames: 'jpeg', loop: true, tip: 'loops without a seam (Instagram, websites, wallpapers)' },
    { id: 'still', name: 'Still · PNG', ext: 'png', kind: 'still', frames: 'png', alpha: true, tip: 'the frame at the playhead, any size, with alpha' },
    { id: 'still16', name: 'Still · 16-bit PNG', ext: 'png', kind: 'still', frames: 'raw16', alpha: true, tip: 'for print: 16 bits per channel (smooth gradients after grading)' },
    { id: 'glb', name: '3D model · GLB', ext: 'glb', kind: 'scene', tip: 'the scene\'s 3D content at the playhead (Blender, Spline, web)' },
    { id: 'html', name: 'Web page · one file', ext: 'html', kind: 'scene', tip: 'the scene running in one self-contained .html (three.js inside)' },
    { id: 'preset', name: 'Slider preset', ext: 'hearth-preset.json', kind: 'scene', tip: 'the sliders\' current values, to share or load back' },
    { id: 'sheet', name: 'Contact sheet', ext: 'png', kind: 'scene', tip: 'frames across the clip on one page, with their times' },
  ];
  const ALIASES = {
    h264: 'mp4', 'h.264': 'mp4', video: 'mp4', mp4: 'mp4', h265: 'hevc', 'h.265': 'hevc', hevc: 'hevc', x265: 'hevc',
    prores: 'prores', '4444': 'prores', mov: 'prores', master: 'prores', alpha: 'prores', webm: 'webm', vp9: 'webm',
    png: 'png', pngs: 'png', sequence: 'png', 'png-seq': 'png', frames: 'png', gif: 'gif', loop: 'loop', 'mp4-loop': 'loop', 'loop-mp4': 'loop',
    still: 'still', picture: 'still', frame: 'still', still16: 'still16', '16bit': 'still16', '16-bit': 'still16', print: 'still16',
    glb: 'glb', gltf: 'glb', model: 'glb', '3d': 'glb', html: 'html', web: 'html', page: 'html', preset: 'preset', sliders: 'preset', sheet: 'sheet', contact: 'sheet', 'contact-sheet': 'sheet',
  };
  const get = (id) => FORMATS.find((f) => f.id === (ALIASES[String(id || '').toLowerCase()] || id)) || null;

  // frame sizes by name; 'frame' is the Lab's own (filled in by the caller); print sizes at 300 dpi
  const SIZES = [
    { id: 'frame', name: 'The Lab\'s frame size' },
    { id: '720p', w: 1280, h: 720 }, { id: '1080p', w: 1920, h: 1080 }, { id: '1440p', w: 2560, h: 1440 }, { id: '4k', w: 3840, h: 2160, name: '4K UHD' },
    { id: '4k-vertical', w: 2160, h: 3840, name: '4K 9:16' }, { id: '4k-square', w: 4096, h: 4096, name: '4K square' }, { id: '8k', w: 7680, h: 4320, name: '8K UHD' }, { id: '8k-square', w: 7680, h: 7680, name: '8K square' },
    { id: 'reels-4k', w: 2160, h: 3840 }, { id: 'a4', w: 2480, h: 3508, name: 'A4 at 300 dpi' }, { id: 'a3', w: 3508, h: 4961, name: 'A3 at 300 dpi' }, { id: 'poster', w: 5400, h: 7200, name: '18×24 in poster at 300 dpi' },
  ];
  const MAX_SIDE = 16384; // the GPU's largest drawing buffer on most machines
  // "4k", "3840x2160", "3840×2160", "2x" (twice the Lab's frame) → { w, h } (frame: the Lab's frame { w, h })
  function size(v, frame = { w: 1080, h: 1920 }) {
    const s = String(v ?? 'frame').trim().toLowerCase().replace(/\s+/g, '');
    const m = s.match(/^(\d{2,5})[x×*](\d{2,5})$/);
    let w; let h;
    if (m) { w = Number(m[1]); h = Number(m[2]); } else if (/^(\d(?:\.\d+)?)x$/.test(s)) { const k = Number(s.slice(0, -1)); w = Math.round(frame.w * k); h = Math.round(frame.h * k); } else {
      const z = SIZES.find((x) => x.id === s || x.id === s.replace(/^uhd$/, '4k'));
      if (!z || z.id === 'frame') { w = frame.w; h = frame.h; } else { w = z.w; h = z.h; }
      // a named size keeps the Lab frame's orientation when it's a landscape name and the frame is portrait
      if (z && z.id !== 'frame' && !/square|vertical|reels|a4|a3|poster/.test(z.id) && frame.h > frame.w && w > h) [w, h] = [h, w];
    }
    return { w: clamp(Math.round(w), 16, MAX_SIDE), h: clamp(Math.round(h), 16, MAX_SIDE) };
  }

  // The hidden page: CSS long side ≤ 1920 (the composition the Lab preview shows: text and sizes in CSS pixels stay
  // where they were), its pixel ratio carries the rest; supersampling multiplies it. A whole divisor of both sides is
  // preferred so the drawing buffer is exactly w·ss × h·ss. GPU memory cap: the supersampled frame stays under `cap`
  // megapixels (lower supersampling first; a frame over the cap without supersampling still renders).
  function page(w, h, ss = 1, { cap = 64, base = 1920 } = {}) {
    let k = 1;
    const need = Math.max(1, Math.ceil(Math.max(w, h) / base - 1e-9));
    for (let i = need; i <= need + 8; i += 1) if (w % i === 0 && h % i === 0) { k = i; break; }
    if (k === 1 && need > 1) k = need; // (no whole divisor: the nearest ratio, the frame is drawn at its own size anyway)
    let s = clamp(Math.round(ss) || 1, 1, 4);
    const capped = [];
    while (s > 1 && (w * h * s * s) / 1e6 > cap) s -= 1;
    if (s < (Math.round(ss) || 1)) capped.push(`supersampling ${Math.round(ss)}× → ${s}× (GPU memory cap ${cap} MP)`);
    while (s > 1 && Math.max(w, h) * s > MAX_SIDE) s -= 1;
    return { cssW: Math.round(w / k), cssH: Math.round(h / k), dpr: r4(k * s), k, ss: s, px: w * h * s * s, capped };
  }

  // motion blur: the sub-frame times inside one frame (the shutter opens at the frame's time: 0.5 = 180°)
  function subTimes(T, F, sub = 1, shutter = 0.5) {
    const n = clamp(Math.round(sub) || 1, 1, 64);
    if (n === 1) return [T];
    return Array.from({ length: n }, (_, j) => r4(T + (j / n) * (clamp(shutter, 0.05, 1) / F)));
  }
  const BLUR = { off: 1, light: 4, on: 8, high: 16 };
  const SS = { off: 1, '2x': 2, '3x': 3, '4x': 4 };

  // quality → encoder settings
  const QUALITY = {
    draft: { label: 'Draft', x264: 23, x265: 26, vp9: 34, prores: 13, preset: 'veryfast', gif: 'bayer:bayer_scale=3' },
    high: { label: 'High', x264: 17, x265: 20, vp9: 26, prores: 6, preset: 'slow', gif: 'sierra2_4a' },
    best: { label: 'Best', x264: 12, x265: 16, vp9: 18, prores: 2, preset: 'slower', gif: 'sierra2_4a' },
  };
  const has = (enc, name) => !enc || enc.includes(name);
  // ffmpeg arguments; o = { format, F, n (frames rendered), input ('dir/f_%05d.png'), w, h, quality, audio: { inputs,
  // filter } (built from the sequence's sound plan), loop: { L, X } (frames kept, cross-fade frames), encoders, gifFps }
  // → { args, note } with OUTPUT as the output path. Throws a plain-words error when this ffmpeg can't make it.
  function args(o) {
    const f = get(o.format);
    if (!f || f.kind !== 'video') throw new Error(`No video format “${o.format}”`);
    const q = QUALITY[o.quality] || QUALITY.high;
    const enc = o.encoders || null;
    const F = o.F || 30;
    const a = ['-y', '-framerate', String(F), '-i', o.input];
    const ain = (f.audio && o.audio?.inputs?.length && !f.loop) ? o.audio.inputs : [];
    for (const p of ain) a.push('-i', p);
    const chain = [];
    let v = '[0:v]';
    let note = null;
    // the loop: the clip's last X frames fade into its first X, so frame L−1 runs into frame 0 without a seam
    const L = f.loop && o.loop ? o.loop.L : null; const X = f.loop && o.loop ? o.loop.X || 0 : 0;
    if (L && X > 0) chain.push(`${v}split[xa][xb];[xa]trim=start_frame=${L}:end_frame=${L + X},setpts=PTS-STARTPTS[xt];[xb]trim=end_frame=${L},setpts=PTS-STARTPTS[xh];[xt][xh]xfade=transition=fade:duration=${r4(X / F)}:offset=0[xl]`), v = '[xl]';
    else if (L) chain.push(`${v}trim=end_frame=${L},setpts=PTS-STARTPTS[xl]`), v = '[xl]';
    const even = (o.w % 2) || (o.h % 2);
    const yuv420 = ['mp4', 'loop', 'hevc', 'webm'].includes(f.id);
    if (even && yuv420) { chain.push(`${v}crop=trunc(iw/2)*2:trunc(ih/2)*2[xe]`); v = '[xe]'; note = 'cropped to an even size (the codec needs one)'; }
    if (f.id === 'gif') {
      const gf = o.gifFps || F;
      const long = o.gifLong || 0;
      const sc = long && Math.max(o.w, o.h) > long ? `,scale=${o.w >= o.h ? long : -2}:${o.w >= o.h ? -2 : long}:flags=lanczos` : '';
      chain.push(`${v}fps=${gf}${sc},split[ga][gb];[ga]palettegen=max_colors=256:stats_mode=full:reserve_transparent=${o.alpha ? 1 : 0}[gp];[gb][gp]paletteuse=dither=${q.gif}${o.alpha ? ':alpha_threshold=128' : ''}[gv]`);
      v = '[gv]';
    }
    if (ain.length) {
      chain.push(o.audio.filter);
    }
    if (chain.length) a.push('-filter_complex', chain.join(';'));
    a.push('-map', v === '[0:v]' ? '0:v' : v); // (a filter graph for the sound alone leaves the pictures as they are)
    if (ain.length) a.push('-map', '[aout]');
    // (round 52, presentready) o.hw: a baked show may use the computer's hardware H.264 encoder (the Mac's VideoToolbox,
    // Windows' Media Foundation) at a high bit rate; only when ffmpeg lists it (the caller falls back to x264 on a failure)
    const hw = (f.id === 'mp4' || f.id === 'loop') && o.hw && enc ? ['h264_videotoolbox', 'h264_mf'].find((x) => enc.includes(x)) : null;
    if (hw) {
      const mbps = Math.round(Math.min(160, Math.max(12, (o.w * o.h * F * 0.14) / 1e6)));
      a.push('-c:v', hw, '-b:v', `${mbps}M`, '-maxrate', `${Math.round(mbps * 1.5)}M`, '-bufsize', `${mbps * 2}M`, '-pix_fmt', 'nv12', '-movflags', '+faststart');
      note = `H.264 with the computer's hardware encoder (${mbps} Mbit/s)`;
    } else if (f.id === 'mp4' || f.id === 'loop') {
      if (!has(enc, 'libx264')) throw new Error('This ffmpeg has no H.264 encoder (libx264): install a full ffmpeg (/ffmpeg install).');
      a.push('-c:v', 'libx264', '-preset', q.preset, '-crf', String(q.x264), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart');
    } else if (f.id === 'hevc') {
      if (has(enc, 'libx265')) a.push('-c:v', 'libx265', '-preset', q.preset === 'slower' ? 'slow' : q.preset === 'slow' ? 'medium' : 'fast', '-crf', String(q.x265), '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', '-x265-params', 'log-level=error', '-movflags', '+faststart');
      else if (has(enc, 'hevc_videotoolbox')) { a.push('-c:v', 'hevc_videotoolbox', '-q:v', String(o.quality === 'best' ? 80 : o.quality === 'draft' ? 50 : 65), '-tag:v', 'hvc1', '-movflags', '+faststart'); note = 'HEVC with the Mac\'s hardware encoder'; } else throw new Error('This ffmpeg has no HEVC encoder (libx265): install a full ffmpeg (/ffmpeg install), or export MP4 (H.264).');
    } else if (f.id === 'prores') {
      if (has(enc, 'prores_ks')) a.push('-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', '-qscale:v', String(q.prores));
      else if (has(enc, 'prores')) { a.push('-c:v', 'prores', '-profile:v', '4', '-pix_fmt', 'yuva444p10le'); note = 'ProRes with ffmpeg\'s simpler encoder'; } else throw new Error('This ffmpeg has no ProRes encoder: install a full ffmpeg (/ffmpeg install).');
    } else if (f.id === 'webm') {
      if (!has(enc, 'libvpx-vp9')) throw new Error('This ffmpeg has no VP9 encoder (libvpx-vp9): install a full ffmpeg (/ffmpeg install).');
      a.push('-c:v', 'libvpx-vp9', '-pix_fmt', o.alpha === false ? 'yuv420p' : 'yuva420p', '-crf', String(q.vp9), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', o.quality === 'best' ? '1' : '3', '-auto-alt-ref', '0');
    } else if (f.id === 'gif') a.push('-loop', '0');
    if (ain.length) {
      if (f.audio === 'aac') a.push('-c:a', 'aac', '-b:a', '256k');
      else if (f.audio === 'pcm') a.push('-c:a', 'pcm_s24le');
      else if (f.audio === 'opus') a.push('-c:a', has(enc, 'libopus') ? 'libopus' : 'libvorbis', '-b:a', '192k');
    }
    if (f.id !== 'gif') a.push('-r', String(F));
    const frames = L || o.n;
    a.push('-t', r4(frames / F).toFixed(4), 'OUTPUT');
    return { args: a, note, frames };
  }
  // (round 41, renderfast) the same arguments, with the frames coming in on ffmpeg's stdin instead of a numbered file
  // list: image2pipe with the decoder the file list would pick (mjpeg for .jpg, png for .png), so the encoder gets
  // the same pictures and makes the same video. args: from args() with input 'INPUT'.
  function streamArgs(a, ext) {
    const out = a.slice();
    const i = out.indexOf('-i');
    if (i < 0 || out[i + 1] !== 'INPUT') throw new Error('streamArgs: the first input must be INPUT');
    out.splice(i, 0, '-f', 'image2pipe', '-c:v', ext === 'jpg' ? 'mjpeg' : 'png');
    return out;
  }
  // the sequence's sound plan (ThreeSeq.audioPlan) → ffmpeg inputs and one filter ending in [aout]; fades and the
  // ducking come from SeqCut (fx) like the sequence's own render, so a render sounds like the preview
  function audio(parts, { first = 1, fx = null, duck = null, from = 0 } = {}) {
    if (!parts?.length) return null;
    const duckF = duck && fx?.ffDuck ? fx.ffDuck(duck.ranges, duck.amount, from) : null;
    const chains = parts.map((p, i) => `[${i + first}:a]atrim=start=${p.a.toFixed(4)}:duration=${(p.len * (p.speed || 1)).toFixed(4)},asetpts=PTS-STARTPTS${p.speed && p.speed !== 1 ? `,atempo=${clamp(p.speed, 0.5, 2)}` : ''},volume=${(p.volume ?? 1).toFixed(3)}${(fx?.ffFades?.(p) || []).map((x) => `,${x}`).join('')},adelay=${Math.round(p.at * 1000)}|${Math.round(p.at * 1000)}${duckF && !p.voice ? `,${duckF}` : ''}[xa${i}]`);
    return { inputs: parts.map((p) => p.src), filter: `${chains.join(';')};${parts.map((_, i) => `[xa${i}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=longest[aout]` };
  }

  // ---------- loops ----------
  // a loop on the song's bars: n bars at bpm with bpb beats a bar → frames; the cross-fade is half a beat (≥ 4 frames)
  function loopLen({ bars = 2, bpm = 120, bpb = 4, F = 30, secs = null, fade = null } = {}) {
    const len = secs > 0 ? secs : (bars * bpb * 60) / (bpm || 120);
    const L = Math.max(2, Math.round(len * F));
    const X = fade === 0 ? 0 : Math.min(Math.floor(L / 3), Math.max(4, Math.round((fade ?? (30 / (bpm || 120))) * F)));
    return { L, X, secs: r4(L / F) };
  }
  // a frame's signature: 16 × 16 luminance (0–255) as a plain array; distance = mean absolute difference (0–255)
  const dist = (a, b) => { if (!a || !b || a.length !== b.length) return 255; let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]); return s / a.length; };
  // the loop the frames make by themselves: the period P (≥ min) where frames 0, 1, 2 come back best (frames P, P+1,
  // P+2); good when that is under `tol` levels → { P, d, natural }; else the best one found, natural: false
  function findLoop(sigs, { min = 8, tol = 2.5, span = 3 } = {}) {
    let best = null;
    for (let P = Math.max(2, min); P + span <= sigs.length; P += 1) {
      let d = 0; for (let i = 0; i < span; i += 1) d += dist(sigs[i], sigs[P + i]);
      d /= span;
      if (!best || d < best.d - 1e-9) best = { P, d };
      if (d < tol * 0.4) break; // (clearly the loop: the first good one, not a multiple of it)
    }
    return best ? { ...best, d: r4(best.d), natural: best.d < tol } : null;
  }

  // ---------- speed ----------
  const speed = (frames, ms) => (ms > 0 ? r4((frames * 1000) / ms) : 0);
  function eta(done, total, ms) { if (!done || done >= total) return 0; return Math.round(((total - done) * ms) / done / 1000); }
  // (round 41, renderfast) time left that is right from the first frames: the recent frames' pace (an average that
  // follows a change of speed within a few frames, the first frame left out: it compiles the shaders), the work after
  // the last frame (what the encoder still has queued when it takes the frames as they come, the whole encode the old
  // way), primed from the last renders by megapixel so a render shows a time from its first frame.
  // hist: [{ mpx, ms (a frame), tail (ms a frame after the last one) }] (newest last). → { frame(ms), left(done, o) }
  function etaModel({ total = 1, px = 2e6, hist = [] } = {}) {
    const mpx = Math.max(0.05, px / 1e6);
    const near = (hist || []).filter((x) => x && x.ms > 0 && x.mpx > 0).slice(-12);
    const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const prior = med(near.map((x) => (x.ms / x.mpx) * mpx));
    const priorTail = med(near.filter((x) => x.tail >= 0).map((x) => (x.tail / x.mpx) * mpx));
    let ewma = null; let n = 0;
    return {
      frame(ms) { n += 1; if (n === 1 && total > 2) return; ewma = ewma == null ? ms : ewma * 0.7 + ms * 0.3; },
      pace() { const w = Math.min(1, n / 6); return ewma == null ? prior : prior == null ? ewma : w * ewma + (1 - w) * prior; },
      // done: frames made; lag: frames the encoder still holds (streaming), encMs: its pace a frame; tail: the old
      // way's encode after the last frame (ms a frame)
      left(done, { lag = 0, encMs = null, tail = null } = {}) {
        const p = this.pace();
        if (p == null) return null;
        const after = tail != null ? tail * total : (lag > 0 ? lag * (encMs ?? priorTail ?? p * 0.3) : 0);
        return Math.max(0, Math.round(((total - done) * p + after) / 1000));
      },
      prior, priorTail,
    };
  }
  const fmtSecs = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);
  const fmtSize = (b) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(2)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  // ---------- a preset file: the sliders of each layer, by name (so it loads into the same scene, or one like it) ----------
  function preset({ scene, layers }) {
    return { hearth: 'slider-preset', v: 1, scene: scene || null, made: new Date().toISOString(), layers: (layers || []).map((L) => ({ id: L.id, name: L.name, values: { ...(L.values || {}) } })) };
  }
  // → [{ layer, values }] matched to the scene's layers by id, then name, then (one layer each) the order
  function readPreset(p, layers) {
    if (!p || p.hearth !== 'slider-preset' || !Array.isArray(p.layers)) throw new Error('Not a Hearth slider preset (.hearth-preset.json)');
    const out = []; const used = new Set();
    p.layers.forEach((pl, i) => {
      const L = layers.find((x) => x.id === pl.id && !used.has(x.id)) || layers.find((x) => x.name && x.name === pl.name && !used.has(x.id)) || (p.layers.length === layers.length ? layers[i] : null);
      if (!L || used.has(L.id)) return;
      used.add(L.id); out.push({ layer: L.id, values: pl.values || {} });
    });
    return out;
  }

  // contact sheet: n frames in a grid as close to the frame's own shape as possible
  function sheet(n, w, h, { width = 2400 } = {}) {
    const N = clamp(Math.round(n) || 12, 2, 48);
    let best = null;
    for (let cols = 1; cols <= N; cols += 1) {
      const rows = Math.ceil(N / cols);
      const tw = Math.floor(width / cols); const th = Math.round((tw * h) / w);
      const score = Math.abs(Math.log(((cols * tw) / (rows * (th + 28))) / 1.414)) + (rows * cols - N) * 0.05;
      if (!best || score < best.score) best = { cols, rows, tw, th, score };
    }
    return { n: N, cols: best.cols, rows: best.rows, tw: best.tw, th: best.th, pad: 28 };
  }
  const safe = (s) => String(s || 'export').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'export';
  // a word list → format id, size, fps, options (the /lab-export words)
  function parse(words, frame) {
    const toks = String(words || '').toLowerCase().match(/"[^"]+"|\S+/g) || [];
    const o = { format: null, extra: [] };
    for (const t0 of toks) {
      const t = t0.replace(/^"|"$/g, '');
      let m;
      if (!o.format && get(t)) { o.format = get(t).id; continue; }
      if ((m = t.match(/^(\d{2,3})fps$/)) || (m = t.match(/^fps=(\d+(?:\.\d+)?)$/))) { o.fps = Number(m[1]); continue; }
      if ((m = t.match(/^ss=?(\d)x?$/)) || (m = t.match(/^supersample=?(\d)x?$/)) || (m = t.match(/^(\d)x-?ss$/))) { o.ss = Number(m[1]); continue; }
      if (t === 'ss' || t === 'supersample' || t === 'supersampling') { o.ss = 2; continue; }
      if ((m = t.match(/^(?:blur|mb|motion-?blur)=?(\d+)?$/))) { o.blur = m[1] ? Number(m[1]) : 8; continue; }
      if ((m = t.match(/^shutter=?(\d+)°?$/))) { o.shutter = clamp(Number(m[1]) / 360, 0.05, 1); continue; }
      if (/^(draft|high|best)$/.test(t)) { o.quality = t; continue; }
      if ((m = t.match(/^(\d+(?:\.\d+)?)(s|sec|secs)$/))) { o.secs = Number(m[1]); continue; }
      if ((m = t.match(/^(\d+)bars?$/)) || (m = t.match(/^bars=(\d+)$/))) { o.bars = Number(m[1]); continue; }
      if ((m = t.match(/^(\d+)frames?$/))) { o.frames = Number(m[1]); continue; }
      if ((m = t.match(/^(?:at|t)=?(\d+(?:\.\d+)?)s?$/))) { o.at = Number(m[1]); continue; }
      if ((m = t.match(/^seed=(\d+)$/))) { o.seed = Number(m[1]); continue; }
      if ((m = t.match(/^(\d+)(?:-?tiles?|-?shots?)$/))) { o.tiles = Number(m[1]); continue; }
      if (/^(seq|sequence)$/.test(t)) { o.source = 'seq'; continue; }
      if (/^(scene|this)$/.test(t)) { o.source = 'scene'; continue; }
      if (/^(detect|auto-?loop)$/.test(t)) { o.detect = true; continue; }
      if (/^(no-?sound|mute|silent)$/.test(t)) { o.sound = false; continue; }
      if (/^(sound|audio)$/.test(t)) { o.sound = true; continue; }
      if (/^(no-?alpha|opaque)$/.test(t)) { o.alpha = false; continue; }
      if (/^(alpha|transparent)$/.test(t)) { o.alpha = true; continue; }
      if (/^(\d{2,5}[x×]\d{2,5}|\dx|720p|1080p|1440p|4k|uhd|8k|4k-vertical|4k-square|8k-square|reels-4k|a4|a3|poster|frame)$/.test(t)) { o.size = size(t, frame); continue; }
      o.extra.push(t);
    }
    return o;
  }
  return { FORMATS, ALIASES, get, SIZES, size, page, subTimes, BLUR, SS, QUALITY, args, streamArgs, audio, loopLen, dist, findLoop, speed, eta, etaModel, fmtSecs, fmtSize, preset, readPreset, sheet, safe, parse, MAX_SIDE };
})();
if (typeof module !== 'undefined') module.exports = LabExportCore;
