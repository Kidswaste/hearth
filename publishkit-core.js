// Ready to post (round 27, publishkit): the model behind the kit (publishkit.js draws it, publishmain.js measures the
// video). No DOM: it runs in the app, in the main process and in Node for the unit test (dev/publishkit-test.js).
//   PLATFORMS                       YouTube Shorts, TikTok, Instagram Reels, YouTube 16:9, Instagram square: size,
//                                   length limits, bitrate range, loudness target, where the app's own buttons cover
//                                   the video (zones, as fractions of the frame), cover size, text limits
//   guess(info, text) · get(id)     the platform a video (or a few words: "for tiktok") is most likely meant for
//   check(platformId, info, an)     the checks: shape, size, length, frame rate, bitrate, codec, sound, loudness,
//                                   detail under the app's buttons, the loop; each { id, level, what, fix? }
//   verdict(checks)                 'ready' | 'almost' | 'fix' and one line for it
//   frameStats(gray, w, h) · heatAdd(heat, gray, w, h) · underUI(heat, zones) · seam(a, b, motion)
//   pickCovers(samples, duration, n)  the best cover frames: sharp, well lit, on a strong moment, spread out
//   loudArgs / loopArgs / trimArgs  ffmpeg arguments for the fixes (INPUT / OUTPUT placeholders like the render queue)
//   draftPrompt / parseDraft / localDraft / cleanTags / caption / postText / folderName   the words of the post
// Platform numbers are the public guidance as of 2026; the zones are approximate (the apps move their buttons), so
// the kit says "about" and never blocks anything: it's the owner who posts, by hand. Hearth never uploads or logs in.
const PublishCore = (() => {
  // zones: { id, label, x, y, w, h } as fractions of the frame (where the app draws over the video)
  const PLATFORMS = [
    { id: 'shorts', name: 'YouTube Shorts', short: 'Shorts', icon: '▶', ratio: 9 / 16, w: 1080, h: 1920, maxLen: 180, sweet: [15, 60], mbps: [6, 20], lufs: -14, loop: true, preset: 'vertical', hashtags: 3, titleMax: 100, textMax: 5000, tags: ['#shorts'],
      zones: [{ id: 'top', label: 'the search and menu bar', x: 0, y: 0, w: 1, h: 0.08 }, { id: 'right', label: 'the like / comment / share buttons', x: 0.84, y: 0.42, w: 0.16, h: 0.46 }, { id: 'bottom', label: 'the title, channel and sound', x: 0, y: 0.78, w: 0.84, h: 0.22 }],
      cover: { w: 1080, h: 1920, note: 'Shorts show a frame you pick in the YouTube app (or this cover on the channel page).' }, tip: 'Up to 3 min; loops replay by themselves, so a seamless loop under a minute gets replayed most.' },
    { id: 'tiktok', name: 'TikTok', short: 'TikTok', icon: '♪', ratio: 9 / 16, w: 1080, h: 1920, maxLen: 600, sweet: [9, 45], mbps: [6, 20], lufs: -14, loop: true, preset: 'vertical', hashtags: 5, titleMax: 0, textMax: 2200, tags: [],
      zones: [{ id: 'top', label: 'the Following / For You tabs', x: 0, y: 0, w: 1, h: 0.09 }, { id: 'right', label: 'the like / comment / share / sound buttons', x: 0.85, y: 0.38, w: 0.15, h: 0.5 }, { id: 'bottom', label: 'the caption and the sound name', x: 0, y: 0.8, w: 0.85, h: 0.2 }],
      cover: { w: 1080, h: 1920, note: 'TikTok lets you upload this cover (or pick a frame) before posting.' }, tip: 'Up to 10 min from the app; short loops (under 45 s) travel furthest.' },
    { id: 'reels', name: 'Instagram Reels', short: 'Reels', icon: '◎', ratio: 9 / 16, w: 1080, h: 1920, maxLen: 180, sweet: [7, 30], mbps: [5, 16], lufs: -14, loop: true, preset: 'vertical', hashtags: 5, titleMax: 0, textMax: 2200, tags: [],
      zones: [{ id: 'top', label: 'the Reels header and camera', x: 0, y: 0, w: 1, h: 0.09 }, { id: 'right', label: 'the like / comment / share buttons', x: 0.86, y: 0.5, w: 0.14, h: 0.38 }, { id: 'bottom', label: 'the caption, sound and account', x: 0, y: 0.8, w: 0.86, h: 0.2 }],
      cover: { w: 1080, h: 1920, grid: 3 / 4, note: 'On your profile grid the cover is cropped to the middle 3:4: keep the title there.' }, tip: 'Up to 3 min; 7–30 s loops do best.' },
    { id: 'youtube', name: 'YouTube 16:9', short: 'YouTube', icon: '▭', ratio: 16 / 9, w: 1920, h: 1080, maxLen: 43200, longAt: 900, sweet: null, mbps: [8, 40], lufs: -14, loop: false, preset: 'yt1080', hashtags: 3, titleMax: 100, textMax: 5000, tags: [],
      zones: [{ id: 'top', label: 'the title shown on hover', x: 0, y: 0, w: 1, h: 0.1 }, { id: 'bottom', label: 'the progress bar and controls', x: 0, y: 0.88, w: 1, h: 0.12 }, { id: 'stamp', label: 'the length stamp on the thumbnail', x: 0.82, y: 0.84, w: 0.18, h: 0.16 }],
      cover: { w: 1280, h: 720, maxBytes: 2e6, note: 'The thumbnail: 1280×720, under 2 MB. Big words and a face or a strong shape read best small.' }, tip: 'Over 15 min needs a verified YouTube account.' },
    { id: 'square', name: 'Instagram square', short: 'Square', icon: '◻', ratio: 1, w: 1080, h: 1080, maxLen: 900, sweet: [7, 60], mbps: [5, 12], lufs: -14, loop: false, preset: 'square', hashtags: 5, titleMax: 0, textMax: 2200, tags: [],
      zones: [{ id: 'bottom', label: 'the tags and sound icons', x: 0, y: 0.9, w: 1, h: 0.1 }],
      cover: { w: 1080, h: 1080, note: 'The first frame shows in the feed unless you set this cover.' }, tip: 'A feed post; Instagram may also show it as a Reel.' },
  ];
  const get = (id) => PLATFORMS.find((p) => p.id === id) || null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const mmss = (s) => { s = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // which platform: a word in the text first ("for tiktok"), then the shape of the video, then the last one used
  function guess(info = {}, text = '', last = null) {
    const s = String(text || '').toLowerCase();
    if (/\btik ?tok\b/.test(s)) return 'tiktok';
    if (/\breels?\b|\binsta(gram)?\b(?!.*square)/.test(s) && !/\bsquare\b/.test(s)) return 'reels';
    if (/\bsquare\b|\b1:1\b/.test(s)) return 'square';
    if (/\bshorts?\b/.test(s)) return 'shorts';
    if (/\byoutube\b|\b16:9\b|\blandscape\b/.test(s)) return 'youtube';
    const r = info.w && info.h ? info.w / info.h : 0;
    const fits = (p) => r && Math.abs(r - p.ratio) / p.ratio < 0.03;
    if (last && get(last) && (!r || fits(get(last)))) return last;
    if (!r) return last && get(last) ? last : 'shorts';
    return (PLATFORMS.find(fits) || PLATFORMS.slice().sort((a, b) => Math.abs(r - a.ratio) - Math.abs(r - b.ratio))[0]).id;
  }

  // ---------- the checks ----------
  // info: { w, h, fps, duration, bitrate, codec, pixFmt, audio, size } (ffprobe / the video element)
  // an:   { loud: { integrated, truePeak, range } | null, under: [{ id, label, k }], seam: { diff, ratio, seamless } }
  // level: 'ok' | 'tip' (worth knowing) | 'warn' (worth fixing) | 'bad' (the platform will refuse it or mangle it)
  // fix:   { kind: 'render', preset, label } | { kind: 'trim', to } | { kind: 'loudness' } | { kind: 'loop' }
  function check(platformId, info = {}, an = {}) {
    const p = get(platformId) || PLATFORMS[0];
    const out = [];
    const add = (id, level, what, fix = null) => out.push({ id, level, what, ...(fix ? { fix } : {}) });
    const vertical = p.ratio < 1;
    // shape
    const r = info.w && info.h ? info.w / info.h : 0;
    if (!r) add('shape', 'tip', 'Size unknown (no ffprobe and the video didn\'t say).');
    else if (Math.abs(r - p.ratio) / p.ratio < 0.03) add('shape', 'ok', `${info.w}×${info.h}: the right shape for ${p.short}.`);
    else {
      const what = `${info.w}×${info.h} isn't ${p.ratio === 1 ? 'square' : vertical ? '9:16' : '16:9'}: ${p.short} would ${vertical && r > 1 ? 'treat it as a regular video (not a Short / Reel) or crop it hard' : 'add bars or crop it'}.`;
      add('shape', vertical && r >= 1 ? 'bad' : 'warn', what, { kind: 'render', preset: p.preset, label: `Make a ${p.ratio === 1 ? 'square' : vertical ? '9:16' : '16:9'} copy` });
    }
    // pixels
    const short = Math.min(info.w || 0, info.h || 0); const want = Math.min(p.w, p.h);
    if (short && short < want * 0.66) add('pixels', 'warn', `Only ${short} px on the short side (${want} is ideal): it will look soft once the app scales it up.`, { kind: 'render', preset: p.preset, label: `Render at ${p.w}×${p.h}` });
    else if (short && short > want * 1.9) add('pixels', 'tip', `${info.w}×${info.h} is bigger than ${p.short} shows; fine, the upload is just heavier.`);
    // length
    const d = Number(info.duration) || 0;
    if (!d) add('length', 'tip', 'Length unknown.');
    else if (d > p.maxLen) add('length', 'bad', `${mmss(d)} is over ${p.short}'s ${mmss(p.maxLen)} limit.`, { kind: 'trim', to: p.maxLen, label: `Cut to ${mmss(p.maxLen)}` });
    else if (p.longAt && d > p.longAt) add('length', 'tip', `${mmss(d)}: over 15 min needs a verified YouTube account.`);
    else if (d < 3) add('length', 'warn', `${d.toFixed(1)} s is very short: most apps want at least 3 s.`);
    else if (p.sweet && (d < p.sweet[0] || d > p.sweet[1])) add('length', 'tip', `${mmss(d)} works; ${p.sweet[0]}–${p.sweet[1]} s is where ${p.short} does best.`);
    else add('length', 'ok', `${mmss(d)} (limit ${mmss(p.maxLen)}).`);
    // frame rate
    const fps = Number(info.fps) || 0;
    if (fps > 61) add('fps', 'warn', `${Math.round(fps)} fps: ${p.short} plays at most 60, frames get dropped unevenly.`, { kind: 'render', preset: p.preset, label: 'Render at 30 fps' });
    else if (fps && fps < 23) add('fps', 'warn', `${Math.round(fps)} fps looks choppy; 24–60 is the norm.`);
    else if (fps) add('fps', 'ok', `${r2(fps)} fps.`);
    // bitrate (the video's own, or its size over its length)
    const bps = Number(info.bitrate) || (info.size && d ? (info.size * 8) / d : 0);
    const mb = bps / 1e6;
    if (mb && short) {
      const k = clamp(short / want, 0.3, 2) ** 2; // a smaller frame needs fewer bits
      if (mb < p.mbps[0] * k * 0.6) add('bitrate', 'warn', `${r2(mb)} Mbps is thin: the app's own compression on top will make it blocky (${p.mbps[0]}–${p.mbps[1]} Mbps at ${p.w}×${p.h}).`, { kind: 'render', preset: p.preset, label: 'Render at a better bitrate' });
      else if (mb > p.mbps[1] * k * 2.5) add('bitrate', 'tip', `${r2(mb)} Mbps: more than ${p.short} keeps (it re-encodes everything); fine, the upload is just slower.`);
      else add('bitrate', 'ok', `${r2(mb)} Mbps.`);
    }
    // codec
    const codec = String(info.codec || '').toLowerCase();
    if (codec && !/^(h264|hevc|h265|avc1?)$/.test(codec)) add('codec', 'warn', `${codec.toUpperCase()} video: upload an H.264 MP4 (some apps refuse ${codec}, others mangle it).`, { kind: 'render', preset: p.preset, label: 'Make an H.264 MP4' });
    else if (info.pixFmt && !/^yuv(j)?420p$/.test(info.pixFmt)) add('codec', 'warn', `${info.pixFmt} pixels: phones may show the colors wrong; 4:2:0 is safest.`, { kind: 'render', preset: p.preset, label: 'Make a 4:2:0 copy' });
    // sound + loudness
    if (info.audio === null) add('sound', 'warn', 'No sound: a music visual usually needs its song (or add a sound in the app).');
    const L = an.loud;
    if (info.audio !== null && L && Number.isFinite(L.integrated)) {
      const I = L.integrated; const tp = Number.isFinite(L.truePeak) ? L.truePeak : null;
      if (I > p.lufs + 5) add('loud', 'warn', `${r2(I)} LUFS is loud: ${p.short} turns it down to about ${p.lufs}, squashing the punch.`, { kind: 'loudness', label: `Even it out to ${p.lufs} LUFS` });
      else if (I < p.lufs - 6) add('loud', 'warn', `${r2(I)} LUFS is quiet: it will sound weak next to other posts (${p.short} aims near ${p.lufs}).`, { kind: 'loudness', label: `Bring it to ${p.lufs} LUFS` });
      else if (tp != null && tp > -1) add('loud', 'warn', `Peaks reach ${r2(tp)} dB: they may crackle after the app re-encodes (keep under -1).`, { kind: 'loudness', label: 'Tame the peaks' });
      else add('loud', 'ok', `${r2(I)} LUFS${tp != null ? `, peaks ${r2(tp)} dB` : ''}: right where ${p.short} plays it.`);
    } else if (info.audio && !L) add('loud', 'tip', 'Loudness not measured (needs ffmpeg).');
    // detail under the app's own buttons
    for (const u of an.under || []) {
      const z = p.zones.find((x) => x.id === u.id);
      if (z) add(`under-${z.id}`, 'warn', `Detail sits under ${z.label}${u.where ? ` (${u.where})` : ''}: text or the subject there gets covered. The ▦ overlay shows it.`);
    }
    if (an.under && !an.under.some((u) => p.zones.some((z) => z.id === u.id))) add('under', 'ok', 'Nothing important under the app\'s buttons.');
    // loop
    if (p.loop && an.seam) {
      if (an.seam.seamless) add('loop', 'ok', 'Loops seamlessly: the replay won\'t show a jump.');
      else add('loop', 'tip', `It jumps when ${p.short} replays it (the last frame differs from the first). A seamless loop gets replayed more.`, { kind: 'loop', label: 'Make it loop (blend the end into the start)' });
    }
    return out;
  }
  const RANK = { bad: 3, warn: 2, tip: 1, ok: 0 };
  function verdict(checks = []) {
    const n = (lv) => checks.filter((c) => c.level === lv).length;
    if (n('bad')) return { state: 'fix', text: `${n('bad')} thing${n('bad') === 1 ? '' : 's'} to fix before posting` };
    if (n('warn')) return { state: 'almost', text: `Almost: ${n('warn')} thing${n('warn') === 1 ? '' : 's'} worth fixing` };
    return { state: 'ready', text: 'Ready to post' };
  }
  const sortChecks = (list) => list.slice().sort((a, b) => RANK[b.level] - RANK[a.level]);

  // ---------- pictures: small gray frames (w × h bytes) ----------
  // luma (0–1), contrast (spread), sharp (edges: the mean Laplacian), all 0–1
  function frameStats(g, w, h) {
    let sum = 0; let sq = 0; let lap = 0; let n = 0;
    for (let i = 0; i < w * h; i += 1) { sum += g[i]; sq += g[i] * g[i]; }
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        lap += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]); n += 1;
      }
    }
    const N = w * h; const mean = sum / N;
    return { luma: r3(mean / 255), contrast: r3(Math.sqrt(Math.max(0, sq / N - mean * mean)) / 255), sharp: r3(n ? lap / n / 255 : 0) };
  }
  const diff = (a, b) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i += 1) s += Math.abs(a[i] - b[i]); return n ? s / n / 255 : 0; };
  // where the detail is, summed over frames: edges (text, outlines) + standing out from the frame's mean (a subject)
  function heatAdd(heat, g, w, h) {
    const H0 = heat || { w, h, n: 0, data: new Float32Array(w * h) };
    let mean = 0; for (let i = 0; i < w * h; i += 1) mean += g[i]; mean /= w * h;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        const dx = x < w - 1 ? Math.abs(g[i + 1] - g[i]) : 0; const dy = y < h - 1 ? Math.abs(g[i + w] - g[i]) : 0;
        H0.data[i] += (dx + dy + 0.35 * Math.abs(g[i] - mean)) / 255;
      }
    }
    H0.n += 1;
    return H0;
  }
  // zones whose detail clearly beats the safe area's (k times its mean, and not just noise): [{ id, label, k }]
  function underUI(heat, zones, { k = 1.35, floor = 0.035 } = {}) {
    if (!heat || !heat.n) return [];
    const { w, h, data } = heat; const n = heat.n;
    const inZ = (z, x, y) => x >= z.x * w && x < (z.x + z.w) * w && y >= z.y * h && y < (z.y + z.h) * h;
    let safe = 0; let sn = 0;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (!zones.some((z) => inZ(z, x, y))) { safe += data[y * w + x] / n; sn += 1; }
    const safeMean = sn ? safe / sn : 0;
    const out = [];
    for (const z of zones) {
      let s = 0; let c = 0; let peak = 0;
      for (let y = Math.floor(z.y * h); y < Math.min(h, Math.ceil((z.y + z.h) * h)); y += 1) {
        for (let x = Math.floor(z.x * w); x < Math.min(w, Math.ceil((z.x + z.w) * w)); x += 1) { const v = data[y * w + x] / n; s += v; c += 1; if (v > peak) peak = v; }
      }
      const m = c ? s / c : 0;
      if (m > floor && m > safeMean * k) out.push({ id: z.id, label: z.label, k: r2(safeMean ? m / safeMean : 9) });
    }
    return out;
  }
  // a platform's zones in the video's own picture (fractions of the video), when the shapes differ: vertical apps crop
  // the video to fill their frame ('cover'), the others letterbox it ('contain'); zones outside the picture go
  const fitOf = (p) => (p.ratio < 1 ? 'cover' : 'contain');
  function zonesFor(platformId, videoRatio) {
    const p = get(platformId) || PLATFORMS[0];
    const pr = p.ratio; const vr = Number(videoRatio) || pr;
    if (Math.abs(vr - pr) / pr < 0.03) return p.zones.slice();
    const out = [];
    for (const z of p.zones) {
      let { x, y, w, h } = z;
      if (fitOf(p) === 'cover') {
        if (vr > pr) { const k = pr / vr; x = (1 - k) / 2 + x * k; w *= k; } else { const k = vr / pr; y = (1 - k) / 2 + y * k; h *= k; }
      } else if (vr > pr) { const k = pr / vr; const o = (1 - k) / 2; y = (y - o) / k; h /= k; } else { const k = vr / pr; const o = (1 - k) / 2; x = (x - o) / k; w /= k; }
      const x0 = clamp(x, 0, 1); const y0 = clamp(y, 0, 1); const x1 = clamp(x + w, 0, 1); const y1 = clamp(y + h, 0, 1);
      if (x1 - x0 > 0.01 && y1 - y0 > 0.01) out.push({ ...z, x: r3(x0), y: r3(y0), w: r3(x1 - x0), h: r3(y1 - y0) });
    }
    return out;
  }
  // the loop seam: how different the last frame is from the first, against the usual change between frames
  function seam(first, last, motion = 0) {
    if (!first || !last) return null;
    const d = diff(first, last);
    const usual = Math.max(0.004, Number(motion) || 0);
    return { diff: r3(d), ratio: r2(d / usual), seamless: d <= Math.max(0.03, usual * 2.5) };
  }
  const median = (arr) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };

  // samples: [{ t, luma, contrast, sharp, motion?, sat? }] → the n best cover moments, spread out
  function pickCovers(samples = [], duration = 0, n = 6) {
    if (!samples.length) return [];
    const maxSharp = Math.max(1e-6, ...samples.map((s) => s.sharp || 0));
    const medMotion = Math.max(1e-4, median(samples.map((s) => s.motion)));
    const scored = samples.filter((s) => !duration || (s.t >= duration * 0.03 && s.t <= duration * 0.97) || samples.length < 4).map((s) => {
      const bright = s.luma < 0.07 ? 0 : s.luma > 0.93 ? 0.2 : 1 - Math.abs(s.luma - 0.55) / 0.55;
      const sharpN = (s.sharp || 0) / maxSharp;
      const moveN = s.motion != null ? clamp(s.motion / medMotion / 3, 0, 1) : 0.5;
      const pop = clamp((s.contrast || 0) / 0.28, 0, 1);
      const sat = s.sat != null ? clamp(s.sat, 0, 1) : 0.5;
      return { t: s.t, score: r3(0.38 * sharpN + 0.27 * bright + 0.17 * moveN + 0.1 * pop + 0.08 * sat), why: [sharpN > 0.8 ? 'sharp' : '', bright > 0.75 ? 'well lit' : '', moveN > 0.6 ? 'a strong moment' : '', pop > 0.75 ? 'contrasty' : ''].filter(Boolean) };
    }).sort((a, b) => b.score - a.score);
    const gap = duration ? duration / (n * 1.6) : 0;
    const out = [];
    for (const s of scored) { if (out.length >= n) break; if (!out.some((o) => Math.abs(o.t - s.t) < gap)) out.push(s); }
    return out;
  }

  // ---------- the fixes: ffmpeg arguments (INPUT / OUTPUT like the render queue's jobs) ----------
  const AUDIO = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000'];
  // the loudness to the platform's target (the picture is copied, untouched)
  const loudArgs = (lufs = -14, tp = -1) => ['-hide_banner', '-y', '-i', 'INPUT', '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=11`, ...AUDIO, '-movflags', '+faststart', 'OUTPUT'];
  // a seamless loop: the last `fade` seconds blend into the first ones, the video starts after them (it gets `fade`
  // shorter); the sound crossfades the same way
  function loopArgs(duration, { fade = null, audio = true, crf = 17 } = {}) {
    const d = Number(duration) || 0;
    const f = r3(fade || clamp(d * 0.12, 0.25, 1));
    if (d < f * 3) throw new Error(`Too short to blend into a loop (${d.toFixed(1)} s)`);
    const off = r3(d - 2 * f);
    let fc = `[0:v]split[va][vb];[va]trim=start=${f}:end=${r3(d)},setpts=PTS-STARTPTS[vm];[vb]trim=start=0:end=${f},setpts=PTS-STARTPTS[vh];[vm][vh]xfade=transition=fade:duration=${f}:offset=${off},format=yuv420p[v]`;
    if (audio) fc += `;[0:a]asplit[aa][ab];[aa]atrim=start=${f}:end=${r3(d)},asetpts=PTS-STARTPTS[am];[ab]atrim=start=0:end=${f},asetpts=PTS-STARTPTS[ah];[am][ah]acrossfade=d=${f}[a]`;
    return { args: ['-hide_banner', '-y', '-i', 'INPUT', '-filter_complex', fc, '-map', '[v]', ...(audio ? ['-map', '[a]', ...AUDIO] : ['-an']), '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'OUTPUT'], duration: r3(d - f), fade: f };
  }
  // a cut at `to` seconds (re-encoded: exact, starts on a clean frame)
  const trimArgs = (to, { crf = 17 } = {}) => ['-hide_banner', '-y', '-i', 'INPUT', '-t', String(r3(to)), '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium', '-pix_fmt', 'yuv420p', ...AUDIO, '-movflags', '+faststart', 'OUTPUT'];

  // ---------- the words ----------
  const cap = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return n && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
  const capText = (s, n) => { s = String(s || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); return n && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; }; // keeps the line breaks
  // "#Lo-Fi, music visual #lofi" → ['#lofi', '#musicvisual'] (no doubles, no punctuation, at most max)
  function cleanTags(input, max = 30) {
    const raw = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+|(?=#)/);
    const out = [];
    for (const t of raw) {
      const w = String(t || '').replace(/^#+/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase();
      if (w && w.length <= 40 && !/^\d+$/.test(w) && !out.includes(`#${w}`)) out.push(`#${w}`);
    }
    return out.slice(0, max);
  }
  // ctx: { song, artist?, scene, file, duration, platform, hint, bpm?, colors? } → the one lean question
  function draftPrompt(ctx = {}, platformId = 'shorts') {
    const p = get(platformId) || PLATFORMS[0];
    const facts = [ctx.song ? `Song: ${cap(ctx.song, 80)}` : '', ctx.scene ? `Visual: ${cap(ctx.scene, 80)}` : '', ctx.bpm ? `Tempo: ${ctx.bpm} BPM` : '', ctx.colors ? `Colors: ${cap(ctx.colors, 60)}` : '', ctx.duration ? `Length: ${mmss(ctx.duration)}` : '', ctx.file ? `File: ${cap(ctx.file, 60)}` : '', ctx.hint ? `Note from me: ${cap(ctx.hint, 200)}` : ''].filter(Boolean).join('\n');
    return `Write the post for a music visualizer I'm posting on ${p.name}.\n${facts}\n\nReply in exactly this format, nothing else:\nTITLE: <${p.titleMax ? `max ${Math.min(70, p.titleMax)} characters, hooky, no hashtags` : 'a short hook line, max 70 characters'}>\nDESCRIPTION: <1-3 short sentences${p.id === 'youtube' ? ' (credit the song)' : ', credit the song'}>\nHASHTAGS: <${p.hashtags} to ${p.hashtags + 3} hashtags, space separated, a mix of broad and niche>`;
  }
  // the reply → { title, description, hashtags } (lenient: labels in any case, extra lines, a list of tags)
  function parseDraft(text) {
    const s = String(text || '').replace(/\r/g, '').replace(/\*\*/g, '');
    const grab = (label, until) => { const m = s.match(new RegExp(`^\\s*${label}\\s*[:：-]\\s*([\\s\\S]*?)(?=^\\s*(?:${until})\\s*[:：-]|$(?![\\s\\S]))`, 'im')); return m ? m[1].trim() : ''; };
    let title = grab('title', 'description|caption|hashtags|tags');
    let description = grab('(?:description|caption)', 'title|hashtags|tags');
    let tags = grab('(?:hashtags|tags)', 'title|description|caption');
    if (!title && !description) {
      const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
      const tagLine = lines.filter((l) => /^(#\S+\s*)+$/.test(l)).join(' ');
      const rest = lines.filter((l) => !/^(#\S+\s*)+$/.test(l));
      title = rest[0] || ''; description = rest.slice(1).join('\n'); tags = tags || tagLine;
    }
    const inline = (description.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).join(' ');
    if (!tags && inline) { tags = inline; description = description.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '').trim(); }
    title = title.replace(/^["“']|["”']$/g, '').trim();
    return { title: cap(title.split('\n')[0], 150), description: description.trim().slice(0, 5000), hashtags: cleanTags(tags) };
  }
  // no AI (or none answered): plain words from the song and the scene, no tokens
  function localDraft(ctx = {}, platformId = 'shorts') {
    const p = get(platformId) || PLATFORMS[0];
    const song = cap(ctx.song || '', 60); const scene = cap(ctx.scene || '', 50);
    const title = cap(song && scene ? `${song} · ${scene}` : song ? `${song} (visualizer)` : scene || 'Music visualizer', p.titleMax || 70);
    const description = [song ? `${song}${ctx.artist ? ` by ${ctx.artist}` : ''}, as a music visual${scene ? `: ${scene.toLowerCase()}` : ''}.` : `A music visual${scene ? `: ${scene.toLowerCase()}` : ''}.`, 'Made with Three.js.'].join(' ');
    const words = cleanTags([song.split(/\s+/).slice(0, 2).join(''), 'musicvisualizer', 'visualizer', 'threejs', 'motiondesign', 'audioreactive', p.id === 'tiktok' ? 'fyp' : '']);
    return { title, description, hashtags: cleanTags([...p.tags, ...words], p.hashtags + 3) };
  }
  // what goes in the app's text box(es), in its order
  function caption(draft = {}, platformId = 'shorts') {
    const p = get(platformId) || PLATFORMS[0];
    const tags = cleanTags([...(draft.hashtags || []), ...p.tags]).join(' ');
    if (p.titleMax) return { title: cap(draft.title, p.titleMax), text: capText([draft.description, tags].filter(Boolean).join('\n\n'), p.textMax), all: [cap(draft.title, p.titleMax), '', draft.description, '', tags].join('\n').trim() };
    const text = capText([draft.title, draft.description, tags].filter(Boolean).join('\n\n'), p.textMax);
    return { title: '', text, all: text };
  }
  // the post's text file: what to paste where, the checks, and what Hearth did (and didn't do)
  function postText({ draft = {}, platformId = 'shorts', video = '', cover = '', checks = [], at = new Date() } = {}) {
    const p = get(platformId) || PLATFORMS[0];
    const c = caption(draft, platformId);
    const lines = [`${p.name} · ready to post`, `${at.toISOString().slice(0, 10)}`, ''];
    if (p.titleMax) lines.push('TITLE', c.title, '', 'DESCRIPTION', c.text, '');
    else lines.push('CAPTION', c.text, '');
    lines.push('FILES', `Video: ${video}`, cover ? `Cover: ${cover}` : '', '', 'CHECKS');
    for (const k of sortChecks(checks)) lines.push(`${k.level === 'ok' ? '✓' : k.level === 'tip' ? '·' : '!'} ${k.what}`);
    lines.push('', p.tip, p.cover.note, '', 'Hearth made these files only; post them yourself in the app (Hearth never uploads or signs in).');
    return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  }
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|#]+/g, ' ').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60).replace(/[. ]+$/, '') || 'post';
  const folderName = (title, platformId, at = new Date()) => `${at.toISOString().slice(0, 10)} ${safeName(title)} (${(get(platformId) || PLATFORMS[0]).short})`;

  return { PLATFORMS, get, guess, fitOf, zonesFor, check, verdict, sortChecks, frameStats, diff, heatAdd, underUI, seam, median, pickCovers, loudArgs, loopArgs, trimArgs, cleanTags, draftPrompt, parseDraft, localDraft, caption, postText, safeName, folderName, mmss };
})();
if (typeof module !== 'undefined') module.exports = PublishCore;
