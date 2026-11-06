// ✈ The pre-flight check before a render (round 140, preflight140), the pure part: no DOM, loads in Node
// (docs/upgrades/preflight140.md). tools/three-preflight.js gathers what it reads from the Lab when ⇪ Export is pressed
// (the Render card, its ticked presets, a ⧉ batch) and shows the small card when something is found; this file decides.
//   check(plan)            → { items: [{ id, text, fixes: [{ id, label }] }], est }; no items: the render starts at once
//   estimate(jobs, cost)   → { secs, bytes, text, slow } the time and file size of the renders (each job: w, h, fps,
//                            frames, ss, blur, format, quality, audio) from the measured cost of a frame
//   costOf(o)              → { msPerMpx, base, from } the cost of a frame: the last renders' own pace (three.export.pace),
//                            else speed133's measure, else the preview's frame time, else a guess
//   framesOf(job, ctx)     the frames a render makes (the export's own rules: a still 1, a loop 2 bars, a range, 10 s)
// plan: { jobs, frame { w, h, from: 'project' | 'scene', name }, layers [{ id, name, visible }], solo { id, name },
//         missing [{ id, kind: 'ref' | 'song' | 'file' | 'key', name, path, layer }], errors [{ layer, name, text }],
//         song { path, silent } | null, wantSong ['Full song'…], free (bytes at the output folder, or null), dir,
//         cost, queue { running, waiting }, skipped (batch rows that name a missing file), canDir }
const PreflightCore = (() => {
  const MB = 1048576;
  const GB = MB * 1024;
  const SLOW = 15 * 60; // a render (or all of them) longer than this is "very slow"
  const r2 = (x) => Math.round(x * 100) / 100;
  const even = (x) => Math.max(16, Math.round(x / 2) * 2);
  const q = (s, n = 40) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const dirName = (p) => base(String(p || '').replace(/[\\/]+$/, '')) || String(p || '');
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // ---------- the shape of a frame ----------
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const NAMED = [['16:9', 16 / 9], ['9:16', 9 / 16], ['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:4', 3 / 4], ['21:9', 21 / 9], ['2:1', 2]];
  function aspectName(w, h) {
    const r = w / h;
    const hit = NAMED.find(([, v]) => Math.abs(Math.log(v / r)) < 0.02);
    if (hit) return hit[0];
    const g = gcd(Math.round(w), Math.round(h)) || 1;
    return `${Math.round(w / g)}:${Math.round(h / g)}`;
  }
  // "9:16" → { w: 9, h: 16 }; { w, h } stays
  function aspectOf(v) {
    if (v && typeof v === 'object' && v.w > 0 && v.h > 0) return { w: v.w, h: v.h };
    const m = String(v || '').match(/^\s*(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)\s*$/);
    return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? { w: Number(m[1]), h: Number(m[2]) } : null;
  }
  const sameShape = (a, b) => Math.abs(Math.log((a.w / a.h) / (b.w / b.h))) < 0.03;
  // the job's size in the frame's shape, its long side kept
  function toShape(job, frame) {
    const long = Math.max(job.w, job.h);
    const r = frame.w / frame.h;
    return r >= 1 ? { w: even(long), h: even(long / r) } : { w: even(long * r), h: even(long) };
  }
  function sizeName(w, h) {
    const L = Math.max(w, h); const S = Math.min(w, h);
    if (L >= 7600) return '8K'; if (L >= 3800 && S >= 2100) return '4K'; if (L === 2560 && S === 1440) return '1440p';
    if (L === 1920 && S === 1080) return '1080p'; if (L === 1280 && S === 720) return '720p';
    return `${w}×${h}`;
  }

  // ---------- how long, how big ----------
  // the export's own rules (tools/three-export.js job()): a still is 1 frame; a loop its bars (or its secs) plus the
  // cross-fade; a range or secs / frames; the sequence its length; else the A–B loop or 10 s from the playhead
  function framesOf(j, ctx = {}) {
    const F = Number(j.fps) || 30;
    if (j.kind === 'still' || j.kind === 'scene') return 1;
    if (j.frames) return Math.max(1, Math.round(j.frames));
    if (j.range && j.range.b > j.range.a) return Math.max(1, Math.round((j.range.b - j.range.a) * F));
    if (j.loop) {
      const bar = ctx.bpm ? ((ctx.bpb || 4) * 60) / ctx.bpm : 2;
      const secs = Number(j.secs) || (ctx.ab && ctx.ab.b > ctx.ab.a && !ctx.bpm ? ctx.ab.b - ctx.ab.a : 2 * bar);
      return Math.max(1, Math.round(secs * F * 1.15)); // (the cross-fade's frames past the end)
    }
    if (j.secs) return Math.max(1, Math.round(j.secs * F));
    if (j.source === 'seq') return Math.max(1, Math.round((Number(ctx.seqDur) || 10) * F));
    if (ctx.ab && ctx.ab.b > ctx.ab.a) return Math.max(1, Math.round((ctx.ab.b - ctx.ab.a) * F));
    return Math.round(10 * F);
  }
  // the cost of a frame, ms per megapixel drawn (+ a fixed part: the page's step, reading the frame back, the encoder)
  // o: { pace: [{ mpx, ms, tail }] (the last renders, three.export.pace), speed: { fps, px } (speed133's measure of this
  //      scene), preview: { ms, px } (the preview's frame time and its drawing size) }
  function costOf({ pace = null, speed = null, preview = null } = {}) {
    const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const near = (Array.isArray(pace) ? pace : []).filter((x) => x && x.ms > 0 && x.mpx > 0).slice(-12);
    const fromPace = med(near.map((x) => (x.ms + Math.max(0, x.tail || 0)) / x.mpx));
    const base = 4;
    if (fromPace != null) return { msPerMpx: r2(Math.max(0.5, fromPace)), base, from: 'renders' };
    if (speed?.fps > 0 && speed.px > 0) return { msPerMpx: r2(Math.max(1, (1000 / speed.fps) / (speed.px / 1e6)) * 1.3), base, from: 'speed' };
    if (preview?.ms > 0 && preview.px > 0) return { msPerMpx: r2(Math.max(1, preview.ms / (preview.px / 1e6)) * 1.3), base, from: 'preview' };
    return { msPerMpx: 12, base, from: 'guess' };
  }
  // bits a pixel a frame (file size), by format and quality
  const BPP = { mp4: { draft: 0.06, high: 0.12, best: 0.2 }, loop: { draft: 0.06, high: 0.12, best: 0.2 }, hevc: { draft: 0.04, high: 0.08, best: 0.13 }, webm: { draft: 0.05, high: 0.09, best: 0.15 }, prores: 5.3, png: 10, gif: 0.9 };
  function bytesOf(j, frames) {
    const px = j.w * j.h;
    if (j.kind === 'still') return px * (j.format === 'still16' ? 4 : 1.6);
    if (j.kind === 'scene') return 5 * MB;
    const t = BPP[j.format] ?? BPP.mp4;
    const bpp = typeof t === 'number' ? t : t[j.quality] ?? t.high;
    const gpx = j.format === 'gif' ? Math.min(px, (720 * 720 * Math.min(j.w, j.h)) / Math.max(j.w, j.h)) : px;
    const audio = j.audio ? (frames / (Number(j.fps) || 30)) * (j.format === 'prores' ? 1536000 : 320000) / 8 : 0;
    return (gpx * frames * bpp) / 8 + audio;
  }
  function estimate(jobs, cost = costOf(), ctx = {}) {
    let secs = 0; let bytes = 0; const each = [];
    for (const j of jobs || []) {
      const n = framesOf(j, ctx);
      const mpx = (j.w * j.h * (j.ss || 1) * (j.ss || 1) * Math.max(1, j.blur || 1)) / 1e6;
      const s = (n * (cost.base + cost.msPerMpx * mpx)) / 1000 + (j.kind === 'still' || j.kind === 'scene' ? 1 : 2);
      const b = bytesOf(j, n);
      secs += s; bytes += b;
      each.push({ label: j.label || '', frames: n, secs: Math.round(s), bytes: Math.round(b) });
    }
    return { secs: Math.round(secs), bytes: Math.round(bytes), each, text: `about ${fmtSecs(secs)} · ~${fmtSize(bytes)}`, slow: secs > SLOW, from: cost.from };
  }
  const fmtSecs = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);
  const fmtSize = (b) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : b >= MB ? `${Math.max(1, Math.round(b / MB))} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  // ---------- the fixes that change the jobs ----------
  const half = (jobs) => jobs.map((j) => (j.kind === 'scene' ? j : { ...j, w: even(j.w / 2), h: even(j.h / 2) }));
  const fps30 = (jobs) => jobs.map((j) => (j.fps > 30 && j.kind !== 'still' ? { ...j, fps: 30 } : j));
  function reshape(jobs, frame) { return jobs.map((j) => (j.shape === 'free' && j.kind !== 'scene' && !sameShape(j, frame) ? { ...j, ...toShape(j, frame) } : j)); }

  // ---------- the check ----------
  function check(plan = {}) {
    const items = [];
    const jobs = (plan.jobs || []).filter(Boolean);
    const add = (id, text, fixes = []) => items.push({ id, text, fixes: fixes.filter(Boolean) });
    // 1. missing files: references, footage, the song, fonts, models (and their other files)
    for (const m of plan.missing || []) {
      if (m.kind === 'key') { add(`key:${m.name}`, `"${q(m.layer)}" uses a reference called "${q(m.name)}" that this scene doesn't have.`, [{ id: `add:${m.name}`, label: 'Add the file…' }]); continue; }
      const what = m.kind === 'song' ? `The song "${q(base(m.path))}"` : m.kind === 'file' ? `"${q(base(m.path))}", a file of the model "${q(m.ref || '')}",` : `The ${m.kind === 'ref' && m.what ? m.what : 'reference'} "${q(m.name || base(m.path))}"`;
      add(`missing:${m.id}`, `${what} is missing: it was moved or deleted.`, [{ id: `relink:${m.id}`, label: 'Relink…' }]);
    }
    // 2. scene errors now: a shader that didn't compile, a layer that throws
    for (const e of plan.errors || []) add(`error:${e.layer || ''}:${e.text}`, `"${q(e.name || 'The scene')}" has an error now: ${q(e.text, 110)}`, e.layer ? [{ id: `hide:${e.layer}`, label: `Hide "${q(e.name, 20)}"` }] : []);
    // 3. a song the preset follows: none, or silent
    const wants = [...new Set(plan.wantSong || [])];
    if (wants.length && !plan.song) add('song:none', `${wants.join(' and ')} ${wants.length > 1 ? 'follow' : 'follows'} the song, but this scene has no song: the video would have no sound.`, [{ id: 'song:add', label: 'Add a song…' }]);
    else if (plan.song?.silent && jobs.some((j) => j.audio)) add('song:silent', `The song "${q(base(plan.song.path))}" is silent: the video would have no sound.`, [{ id: 'song:add', label: 'Use another song…' }]);
    // 4. a size or shape that isn't the project's
    const frame = plan.frame && plan.frame.w > 0 ? plan.frame : null;
    if (frame) {
      const off = jobs.filter((j) => j.shape === 'free' && j.kind !== 'scene' && !sameShape(j, frame));
      if (off.length) {
        const fa = aspectName(frame.w, frame.h);
        const j = off[0];
        add('shape', `${plan.frame.from === 'project' ? `The project "${q(plan.frame.name, 30)}" is` : 'This scene is'} ${fa}, but ${off.length > 1 ? `${off.length} of these renders are` : `${jobs.length > 1 ? `"${q(j.label, 30)}"` : 'this render'} is`} ${aspectName(j.w, j.h)} (${j.w}×${j.h}).`, [{ id: 'shape', label: `Switch to ${fa}` }]);
      }
    }
    // 5. layers hidden or solo'd by mistake
    const Ls = plan.layers || [];
    const shown = Ls.filter((L) => L.visible !== false);
    if (plan.solo?.id && Ls.length > 1) add('solo', `Only "${q(plan.solo.name, 30)}" is visible (solo is on): ${plural(Ls.length - shown.length, 'layer')} won't be in the video.`, [{ id: 'solo', label: 'Turn solo off' }]);
    else if (Ls.length && !shown.length) add('hidden:all', 'Every layer is hidden: the video would be empty.', [{ id: 'showall', label: 'Show every layer' }]);
    else if (Ls.length >= 3 && Ls.length - shown.length >= Math.ceil(Ls.length / 2) && !plan.solo?.id) add('hidden', `${Ls.length - shown.length} of ${Ls.length} layers are hidden (${Ls.filter((L) => L.visible === false).slice(0, 3).map((L) => `"${q(L.name, 18)}"`).join(', ')}${Ls.length - shown.length > 3 ? '…' : ''}).`, [{ id: 'showall', label: 'Show every layer' }]);
    // batch rows that name a file that isn't there (the batch skips them)
    if (plan.skipped > 0) add('skipped', `${plural(plan.skipped, 'row')} of the batch ${plan.skipped === 1 ? 'names' : 'name'} a file that isn't there: ${plan.skipped === 1 ? 'it is' : 'they are'} skipped.`);
    // 6. the time and the size
    const est = estimate(jobs, plan.cost || costOf(), plan.ctx || {});
    const big = jobs.reduce((a, j) => (j.w * j.h * (j.fps || 30) > a.w * a.h * (a.fps || 30) ? j : a), jobs[0] || { w: 0, h: 0 });
    if (est.slow && jobs.length) {
      add('slow', `Very slow: ${jobs.length > 1 ? `${plural(jobs.length, 'render')} (the biggest ${sizeName(big.w, big.h)} at ${big.fps} fps)` : `${sizeName(big.w, big.h)} at ${big.fps} fps`} would take ${est.secs >= 3600 ? '' : 'about '}${fmtSecs(est.secs)}.`,
        [jobs.some((j) => Math.max(j.w, j.h) >= 1280 && j.kind !== 'scene') ? { id: 'half', label: 'Render at half size' } : null, jobs.some((j) => j.fps > 30 && j.kind !== 'still') ? { id: 'fps30', label: 'Render at 30 fps' } : null]);
    }
    // 7. room on the disk at the output folder
    if (plan.free != null && Number.isFinite(plan.free)) {
      const need = est.bytes * 1.2 + 300 * MB;
      if (plan.free < need) {
        const fitsHalf = plan.free > estimate(half(jobs), plan.cost || costOf(), plan.ctx || {}).bytes * 1.2 + 300 * MB;
        add('disk', `Not enough room: the disk of "${q(dirName(plan.dir), 30)}" has ${fmtSize(plan.free)} free, and ${jobs.length > 1 ? 'these renders need' : 'this render needs'} about ${fmtSize(est.bytes)}.`,
          [fitsHalf && jobs.some((j) => j.kind !== 'scene' && Math.max(j.w, j.h) >= 320) ? { id: 'half', label: 'Render at half size' } : null, plan.canDir !== false ? { id: 'dir', label: 'Save somewhere else…' } : null]);
      }
    }
    // (other renders already in the queue: this one starts after them; said on the time line, not a problem)
    const waiting = (plan.queue?.running ? 1 : 0) + (plan.queue?.waiting || 0);
    est.line = `${jobs.length > 1 ? `${plural(jobs.length, 'render')}: ` : ''}${est.text}${waiting ? ` · starts after ${plural(waiting, 'render')} in the queue` : ''}`;
    return { items, est };
  }

  return { check, estimate, costOf, framesOf, bytesOf, aspectName, aspectOf, sameShape, toShape, sizeName, half, fps30, reshape, fmtSecs, fmtSize, SLOW };
})();
if (typeof module !== 'undefined') module.exports = PreflightCore;
