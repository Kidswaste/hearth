// Lab export (round 22, labexport): the Lab's best-quality output, made without freezing the app.
// Every render runs in a hidden export page of its own (a second Lab page behind the app, its own process and GPU
// context), never in the preview: the Lab stays usable and keeps playing while it renders. The page steps the scene's
// own clock frame by frame (the Lab sequence's offline machinery: a render is the same every time and matches the
// sequence / scene clocks), its randomness is seeded, and each frame can be supersampled (drawn at 2–4× and boxed
// down exactly) and motion-blurred (sub-frames across a 180° shutter, averaged with their alpha).
// Formats (LabExportCore.FORMATS): MP4 H.264, HEVC 10-bit, ProRes 4444 + alpha, WebM VP9 + alpha, PNG sequence + alpha,
// a perfect-loop GIF / MP4 (on the song's bars with a cross-fade, or the loop the frames make by themselves), stills
// (PNG, 16-bit PNG for print), and the scene itself: a GLB of its 3D content, a one-file web page (deploy's builder),
// the sliders as a preset file, a contact sheet. Any size up to 8K (and 16K a side for stills), any frame rate.
// Each render is a row of the render queue (renders.js: progress, time left, pause / resume, cancel, retry); one runs
// at a time. Chat: /lab-export (tools/three-export-cmds.js). Model: tools/three-export-core.js.
const LabExport = (() => {
  const C = LabExportCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const AUD = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;
  const IMG = /\.(png|jpe?g|webp|gif|bmp)$/i;
  const IS_MAC = /Mac/.test(navigator.platform);
  const SEQ = () => (typeof ThreeSeq !== 'undefined' ? ThreeSeq : null);
  const LAB = () => SEQ()?._S?.L || null; // the Lab's handle (player, scenes, stage, sketchId), as the sequence has it
  const S = { chain: Promise.resolve(), cur: null, waiting: 0, stats: [], last: null };
  const opts0 = () => store.get('three.export', {});
  const D_FORMATS = () => ThreeSeqData.FORMATS;
  const openFile = (p) => (typeof MediaFile !== 'undefined' ? MediaFile.open(p) : window.hub.fs.open?.(p));
  const gpuCap = () => Number(store.get('three.export.gpu', 64)) || 64; // megapixels a supersampled frame may take

  // ---------- the hidden export page ----------
  async function openPage({ w, h, ss = 1, alpha = false, seed = 1 }) {
    if (typeof ThreeLab === 'undefined' || !ThreeLab._sandbox) throw new Error('Open the Three.js Lab first');
    const pg = C.page(w, h, ss, { cap: gpuCap() });
    // behind the app, inside the window (a cross-origin frame outside the viewport stops drawing), invisible
    const host = el('div', { class: 'lab-xp-host', attrs: { 'aria-hidden': 'true' }, style: { position: 'fixed', left: '0', top: '0', width: `${pg.cssW}px`, height: `${pg.cssH}px`, zIndex: '-1', opacity: '0', pointerEvents: 'none', overflow: 'hidden', contain: 'strict' } });
    document.body.append(host);
    const waits = new Set();
    const onMsg = (m) => { for (const x of [...waits]) if (x.test(m)) { waits.delete(x); x.resolve(m); } if (m.type === 'error' && page.errors.length < 20) page.errors.push(String(m.message || '')); };
    const wait = (test, ms = 60000, what = 'a frame') => new Promise((resolve, reject) => {
      const x = { test, resolve }; waits.add(x);
      setTimeout(() => { if (waits.delete(x)) reject(new Error(`The export page stopped answering (${what})`)); }, ms);
    });
    const box = ThreeLab._sandbox(host, onMsg, () => `&dpr=${pg.dpr}&xp=1${alpha ? '&alpha=1' : ''}&seed=${seed}`);
    box.frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    const page = { pg, box, host, errors: [], send: (m) => box.send(m), wait, close() { waits.clear(); try { box.frame.src = 'about:blank'; } catch { /* gone */ } host.remove(); } };
    const ready = wait((m) => m.type === 'ready', 45000, 'starting');
    box.reload();
    try { await ready; } catch (err) { page.close(); throw err; }
    return page;
  }
  // the sequence's drawing code (titles, transitions, framing), as the sequence sends it to the preview
  const appDir = () => { let p = decodeURIComponent(new URL('.', location.href).pathname); if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); return p.replace(/[\\/]$/, ''); };
  let libText = null;
  async function libs() {
    if (libText) return libText;
    const dir = appDir();
    const parts = await Promise.all(['tools/cut-presets.js', 'tools/cut-titles.js', 'tools/three-seq-trans.js', 'tools/three-seq-cut.js'].map((f) => window.hub.fs.read(`${dir}/${f}`)));
    libText = parts.join('\n');
    return libText;
  }
  const mimeOf = (p) => (IMG.test(p) ? `image/${/png$/i.test(p) ? 'png' : 'jpeg'}` : AUD.test(p) ? `audio/${({ mp3: 'mpeg', m4a: 'mp4', aac: 'aac', wav: 'wav', ogg: 'ogg', flac: 'flac', opus: 'ogg' })[p.split('.').pop().toLowerCase()] || 'mpeg'}` : 'video/mp4');
  // the plan (the scene or the sequence, compiled the sequence's way), its files and its song, onto the page; then
  // the page goes offline (its layers wait for each step instead of the screen)
  async function loadPlan(page, plan, assets, song) {
    try { page.send({ type: 'seq-libs', code: await libs() }); } catch (err) { console.warn('Lab export: titles / transitions code', err); }
    try { const f = await window.hub.fs.read(`${appDir()}/assets/oxanium.ttf`, { encoding: 'buffer' }); page.send({ type: 'seq-font', name: 'Oxanium', buffer: f }); } catch { /* the fallback fonts */ }
    for (const p of assets) {
      const bytes = await window.hub.fs.read(p, { encoding: 'buffer', maxBytes: 2e9 }).catch((err) => { throw new Error(`Couldn't read ${base(p)}: ${err.message}`); });
      page.send({ type: 'seq-asset', id: p, buffer: bytes, mime: mimeOf(p) });
    }
    if (song?.src) {
      const bytes = await window.hub.fs.read(song.src, { encoding: 'buffer', maxBytes: 2e9 }).catch(() => null);
      if (bytes) {
        const P = LAB()?.player;
        const same = P && P.path === song.src;
        page.send({ type: 'media-load', buffer: bytes, mime: mimeOf(song.src), video: false, name: base(song.src), startAt: 0, playing: false, loop: false, volume: 0, analysis: same ? P.analysis || null : null, region: null, rate: 1, trim: null });
        if (same) {
          // its beat grid and hand-placed hits (what reacts to the kick reacts the same)
          try {
            const tl = P.timeline();
            const beats = P.beatsIn(0, P.duration || 0);
            const anchor = tl.grid?.downbeat ?? beats[0] ?? 0;
            page.send({ type: 'media-map', beats, bpm: P.bpm, bpb: P.beatsPerBar, anchor, manual: tl.grid?.setBy === 'user', downIndex: Math.max(0, beats.findIndex((b) => Math.abs(b - anchor) < 1e-3)), marks: tl.markers, cues: (tl.cues || []).map((c) => ({ t: c.time, name: c.name })) });
          } catch { /* no map */ }
        }
      }
    }
    page.send({ type: 'seq-set', plan, id: 1 });
    const off = page.wait((m) => m.type === 'seq-offline' && m.on, 30000, 'going offline');
    page.send({ type: 'seq-offline', on: true });
    await off;
  }

  // ---------- what gets rendered: the scene on screen, or the Lab sequence ----------
  const frameNow = () => { const z = LAB()?.stage?.size; return z?.w && z?.h ? { w: z.w, h: z.h } : { w: 1920, h: 1080 }; };
  // a layer's code with the sliders as they are now (unsaved moves too), so the export is what you see
  function liveCode(L) {
    try {
      const d = ThreeLab.director;
      const ctl = d?.sliders?.(L.id)?.sliders || [];
      if (!ctl.length) return L.code;
      const sc = ThreeTweaks.scan(L.code || '');
      const byKey = new Map(ctl.map((c) => [c.key, c.value]));
      const vals = sc.items.map((it) => (it.key != null && byKey.has(it.key) ? byKey.get(it.key) : it.orig));
      return ThreeTweaks.applyValues(L.code, sc.items, vals);
    } catch { return L.code; }
  }
  const aspectKey = (w, h) => { const D = ThreeSeqData; let best = '9:16'; let bd = Infinity; for (const [k, [a, b]] of Object.entries(D.FORMATS)) { const d = Math.abs(Math.log((a / b) / (w / h))); if (d < bd) { bd = d; best = k; } } return best; };
  // the scene on screen as a one-clip edit: program time = the scene's own time (= the song's time), so frame T of the
  // export is what the Lab shows at T
  async function sceneEdit({ w, h, F, end }) {
    const L = LAB(); const D = ThreeSeqData;
    const sid = L?.sketchId();
    const sk = sid ? L.scenes.get(sid) : null;
    if (!sk) throw new Error('No scene is open in the Lab');
    let e = D.create({ format: aspectKey(w, h), fps: F, name: sk.name });
    e = CutData.setSeq(e, { w, h });
    const song = L.scenes.songOf?.(sid);
    const P = L.player;
    if (song && AUD.test(song)) { const d = (P.path === song && P.duration) || 0; if (d) e = D.setSong(e, song, d); }
    e = D.addScene(e, { sketch: sk.id, name: sk.name }, { dur: Math.max(0.1, end + 1 / F), trans: null });
    return { e, sk, live: true };
  }
  // compile with the layers' live slider values (the compile reads the saved scene; a moved, unsaved slider wins)
  function compileLive(e, sk) {
    const Q = SEQ(); const L = LAB();
    const sc = L?.scenes; const orig = sc?.layersOf;
    if (!sk || !orig || sk.id !== L.sketchId()) return Q.compile(e);
    sc.layersOf = (s) => { const ls = orig.call(sc, s); return s?.id === sk.id ? ls.map((ly) => ({ ...ly, code: liveCode(ly) })) : ls; };
    try { return Q.compile(e); } finally { sc.layersOf = orig; }
  }
  // where the export starts and how long it is
  function playhead(source) { return source === 'seq' ? SEQ()?.time || 0 : LAB()?.player?.time || 0; }
  function songGrid() { const P = LAB()?.player; if (!P?.loaded || P.isClock) return null; return { bpm: P.bpm, bpb: P.beatsPerBar || 4, anchor: P.timeline?.().grid?.downbeat ?? 0 }; }
  const barAt = (g, t) => { const bar = (g.bpb * 60) / g.bpm; return Math.max(0, g.anchor + Math.floor((t - g.anchor) / bar + 1e-6) * bar); };

  // ---------- ffmpeg ----------
  const ffOver = () => ({ ffmpeg: H.settings().ffmpegPath || undefined });
  async function ffmpegOf() { try { const t = await window.hub.video.tools(ffOver()); return t?.ffmpeg ? t : null; } catch { return null; } }
  let encoders = null;
  async function encodersOf() { if (encoders) return encoders; try { encoders = (await window.hub.renders?.encoders?.(ffOver()))?.list || null; } catch { encoders = null; } return encoders?.length ? encoders : null; }
  const jobs = new Map(); let jobsOn = false;
  function runFfmpeg(job) {
    if (!jobsOn) {
      jobsOn = true;
      window.hub.video.onJob((ev) => {
        const j = jobs.get(ev.id);
        if (!j) return;
        if (ev.type === 'progress') j.onProgress?.(ev.pct);
        if (ev.type === 'done') { jobs.delete(ev.id); if (ev.code === 0) j.resolve(ev); else j.reject(new Error(ev.cancelled ? 'Render cancelled' : ev.error || `ffmpeg ended with ${ev.code}`)); }
      });
    }
    return new Promise((resolve, reject) => {
      jobs.set(job.id, { onProgress: job.onProgress, resolve, reject });
      window.hub.video.transcode({ id: job.id, input: job.input, output: job.output, args: job.args, duration: job.duration }, ffOver()).catch((err) => { jobs.delete(job.id); reject(err); });
    });
  }
  async function outDir() { try { return await SEQ().outDir(); } catch { return `${await window.hub.fs.home()}/Hearth exports`; } }
  async function uniqueOut(dir, stem, ext, isDir = false) {
    let p = `${dir}/${stem}${isDir ? '' : `.${ext}`}`;
    for (let i = 2; i < 500 && await window.hub.fs.stat(p).catch(() => null); i += 1) p = `${dir}/${stem} (${i})${isDir ? '' : `.${ext}`}`;
    return p;
  }
  const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

  // ---------- one render ----------
  // o: { source: 'scene' | 'seq', format, size ({ w, h } | words), fps, ss, blur (sub-frames), shutter (0–1), quality,
  //      secs | frames | bars, at (start, s), range ({ a, b }), detect (loop), sound, alpha, seed, name, quiet, onProgress }
  function resolve(o0 = {}) {
    const f = C.get(o0.format || 'mp4');
    if (!f) throw new Error(`Formats: ${C.FORMATS.map((x) => x.id).join(', ')}`);
    const source = o0.source || (SEQ()?.active ? 'seq' : 'scene');
    const seqE = source === 'seq' ? SEQ()?.edit : null;
    const frame = seqE ? { w: seqE.seq?.w || 1080, h: seqE.seq?.h || 1920 } : frameNow();
    const sz = o0.size && typeof o0.size === 'object' ? o0.size : C.size(o0.size || 'frame', frame);
    const F = Number(o0.fps) || (seqE?.seq?.fps) || (f.id === 'gif' ? 25 : 30);
    const blur = f.kind === 'still' ? 1 : Math.max(1, Number(o0.blur) || 1);
    const pg = C.page(sz.w, sz.h, o0.ss || 1, { cap: gpuCap() });
    const alpha = o0.alpha ?? Boolean(f.alpha);
    const gifLong = o0.gifLong ?? (f.id === 'gif' && !o0.size ? 720 : 0); // (a GIF: drawn at the frame size, scaled to 720 by ffmpeg)
    return { ...o0, gifLong, f, format: f.id, source, w: sz.w, h: sz.h, F, ss: pg.ss, blur, shutter: o0.shutter ?? 0.5, quality: o0.quality || 'high', alpha, seed: Number(o0.seed) || 1, capped: pg.capped, sound: o0.sound ?? Boolean(f.audio) };
  }
  // queue it: one export at a time (the others wait in the render queue as "waiting")
  function render(o0 = {}) {
    const o = resolve(o0);
    S.waiting += 1;
    const run = S.chain.then(() => { S.waiting -= 1; return job(o); }, () => { S.waiting -= 1; return job(o); });
    S.chain = run.catch(() => null);
    return run;
  }
  async function job(o) {
    const f = o.f;
    if (f.kind === 'scene') return exportScene(o);
    // (a 16-bit still keeps every sample: about 40 bytes a pixel while it's made)
    if (f.id === 'still16' && o.w * o.h > 24e6) throw new Error(`A 16-bit still goes up to 24 megapixels (A3 at 300 dpi is 17); ${o.w}×${o.h} is ${Math.round(o.w * o.h / 1e6)}: export a Still · PNG at that size instead`);
    const id = uid();
    const ctl = { cancel: false, paused: false, t0: performance.now(), frames: 0, total: 0 };
    S.cur = ctl;
    const title = `⇪ ${f.name} · ${o.w}×${o.h}${o.ss > 1 ? ` · ${o.ss}× SS` : ''}${o.blur > 1 ? ` · blur ${o.blur}` : ''}`;
    const pk = `lab-export:${id}`;
    window.Progress?.set(pk, { title, icon: '⇪', kind: 'lab-export', pct: 0, label: 'opening the export page', jump: () => { if (typeof activate === 'function') activate('tool:three'); }, actions: [{ label: '■', title: 'Cancel', run: () => { ctl.cancel = true; } }] });
    const rq = window.Renders?.track?.({ kind: o.trackKind || 'export', title: o.title || title, pk, quiet: Boolean(o.quiet), cancel: () => { ctl.cancel = true; }, pause: (on) => { ctl.paused = on; }, again: o.again !== undefined ? o.again : { type: 'cmd', line: cmdLine(o) } });
    const progress = (p, label) => { window.Progress?.set(pk, { pct: Math.min(99.5, p * 100), label }); rq?.progress?.(Math.min(99.5, p * 100), label); o.onProgress?.(p, label); };
    let page = null; let tmp = null; let ok = false; let result = null; let errOut = null;
    try {
      const tools = await ffmpegOf();
      if (!tools && f.kind !== 'still' && f.id !== 'png') throw new Error('ffmpeg isn\'t installed: /ffmpeg install (PNG sequences and stills work without it)');
      // the edit and its frames
      const seqE = o.source === 'seq' ? (o.edit || SEQ()?.edit) : null;
      if (o.source === 'seq' && !seqE) throw new Error('No Lab sequence: open ▤ Sequence first');
      let e; let sk = null;
      const F = o.F;
      let T0 = 0; let N = 1;
      const grid = o.source === 'scene' ? songGrid() : null;
      let loop = null;
      if (f.kind === 'still') { T0 = o.at ?? playhead(o.source); N = 1; } else if (f.loop) {
        T0 = o.at ?? (grid ? barAt(grid, playhead(o.source)) : (o.source === 'scene' ? (LAB()?.player?.loop?.a ?? 0) : 0));
        const lp = LAB()?.player?.loop;
        const secs = o.secs || (o.frames ? o.frames / F : null) || (!o.bars && o.source === 'scene' && lp && !grid ? lp.b - lp.a : null);
        loop = C.loopLen({ bars: o.bars || 2, bpm: grid?.bpm || 120, bpb: grid?.bpb || 4, F, secs: secs || (grid ? null : 4), fade: o.fade });
        N = loop.L + loop.X;
        if (o.detect || (!grid && !o.secs && !o.bars && !o.frames)) { o.detect = true; N = Math.max(N, Math.round(F * 8)); }
      } else if (o.range && o.range.b > o.range.a) { T0 = o.range.a; N = Math.max(1, Math.round((o.range.b - o.range.a) * F)); } else if (o.secs || o.frames) {
        T0 = o.at ?? (o.source === 'seq' ? 0 : playhead('scene'));
        N = Math.max(1, o.frames || Math.round(o.secs * F));
      } else if (o.source === 'seq') { T0 = 0; N = Math.max(1, Math.round((SEQ().compile(seqE).plan.dur || 0) * F)); } else {
        const lp = LAB()?.player?.loop;
        if (lp && lp.b > lp.a) { T0 = lp.a; N = Math.round((lp.b - lp.a) * F); } else { T0 = o.at ?? playhead('scene'); N = Math.round(10 * F); }
      }
      T0 = r4(Math.max(0, T0));
      if (o.source === 'seq') { e = CutData.copy(seqE); e = CutData.setSeq(e, { w: o.w, h: o.h, fps: F, format: D_FORMATS()[seqE.seq?.format] && aspectKey(o.w, o.h) === seqE.seq.format ? seqE.seq.format : aspectKey(o.w, o.h) }); } else ({ e, sk } = await sceneEdit({ w: o.w, h: o.h, F, end: T0 + N / F }));
      const { plan, assets } = compileLive(e, sk);
      plan.w = o.w; plan.h = o.h; plan.fps = F;
      ctl.total = N;
      page = await openPage({ w: o.w, h: o.h, ss: o.ss, alpha: o.alpha, seed: o.seed });
      progress(0.01, 'loading the scene');
      await loadPlan(page, plan, assets, plan.song);
      const dir = await outDir();
      const stem = C.safe(`${o.name || sk?.name || seqE?.seq?.name || 'Lab'} ${f.id === 'still16' ? 'print' : f.id} ${o.w}x${o.h}${o.ss > 1 ? ` ss${o.ss}` : ''}${o.blur > 1 ? ` mb${o.blur}` : ''}`);
      const isSeqOut = f.id === 'png';
      const output = await uniqueOut(dir, stem, f.ext, isSeqOut);
      tmp = isSeqOut ? output : `${dir}/.hearth-titles-xp${id}`;
      const kind = f.frames === 'raw16' ? 'raw16' : f.frames === 'jpeg' && !o.alpha ? 'image/jpeg' : 'image/png';
      const ext = kind === 'image/jpeg' ? 'jpg' : kind === 'raw16' ? 'rgba' : 'png';
      const sigs = [];
      let writes = Promise.resolve(); let pending = 0;
      const tFrames = performance.now();
      let drawMs = 0;
      const ahead = new Map(); const LOOKAHEAD = 2;
      const ask = (n) => {
        const got = page.wait((m) => m.type === 'xp-frame' && m.n === n, 120000, `frame ${n + 1}`);
        page.send({ type: 'xp-frame', n, T: r4(T0 + n / F), w: o.w, h: o.h, ss: o.ss, sub: o.blur, shutter: o.shutter, F, kind, q: 0.97, alpha: o.alpha, sig: Boolean(o.detect) });
        return got;
      };
      for (let n = 0; n < N; n += 1) {
        while (ctl.paused && !ctl.cancel) await sleep(200);
        // (a drag, a scroll or typing in the app: the next frame waits for the gesture to end, ≤ 1.5 s, so the GPU and
        // the CPU go to what you're doing first)
        if (window.Jank?.busy?.()) { ctl.yields = (ctl.yields || 0) + 1; await window.Jank.calm?.(1500); }
        if (ctl.cancel) throw new Error('Render cancelled');
        // the next frame is asked for before this one arrives: the page draws it while this one is encoded and written
        for (let k = n; k < Math.min(N, n + LOOKAHEAD); k += 1) if (!ahead.has(k)) ahead.set(k, ask(k));
        const m = await ahead.get(n); ahead.delete(n);
        if (m.error) throw new Error(`Frame ${n + 1}: ${m.error}`);
        drawMs += m.drawMs || 0;
        if (o.detect) sigs.push(m.sig);
        const file = f.kind === 'still' && ext === 'png' ? output : `${tmp}/${isSeqOut ? `${C.safe(stem)}_` : 'f_'}${String(n).padStart(5, '0')}.${ext}`;
        // the file is written while the next frame draws (at most two in flight)
        pending += 1;
        const w = writes.then(() => window.hub.fs.write(file, new Uint8Array(m.buffer))).finally(() => { pending -= 1; });
        writes = w;
        if (pending > 2) await w;
        ctl.frames = n + 1;
        const el2 = performance.now() - tFrames;
        progress(((n + 1) / N) * (f.kind === 'video' ? 0.85 : 0.97), `frame ${n + 1} / ${N} · ${C.speed(n + 1, el2)} fps${N - n > 2 ? ` · ${C.fmtSecs(C.eta(n + 1, N, el2))} left` : ''}`);
        // a loop the frames make by themselves: stop once it is found
        if (o.detect && loop && n + 1 >= Math.round(F) + 3 && (n + 1) % 6 === 0) {
          const fl = C.findLoop(sigs, { min: Math.round(F * 0.5) });
          if (fl?.natural) { loop = { L: fl.P, X: 0, secs: r4(fl.P / F), found: fl }; N = n + 1; break; }
        }
      }
      await writes;
      const frameMs = performance.now() - tFrames;
      if (o.detect && loop && !loop.found) {
        const fl = C.findLoop(sigs, { min: Math.round(F * 0.5) });
        loop.searched = fl;
        // no loop of its own: the bars' length with its cross-fade (the frames past it are there)
        if (loop.L + loop.X > N) loop = { ...loop, L: Math.max(2, N - loop.X) };
      }
      const stat = { format: f.id, w: o.w, h: o.h, ss: o.ss, blur: o.blur, frames: N, ms: Math.round(frameMs), fps: C.speed(N, frameMs), drawMs: Math.round(drawMs) };
      S.stats.push(stat); if (S.stats.length > 40) S.stats.shift();
      page.close(); page = null;
      if (f.kind === 'still') {
        if (f.frames === 'raw16') {
          if (!tools) throw new Error('A 16-bit PNG needs ffmpeg: /ffmpeg install (or export a Still · PNG)');
          await runFfmpeg({ id: `xp${id}`, input: `${tmp}/f_00000.rgba`, output, args: ['-y', '-f', 'rawvideo', '-pix_fmt', 'rgba64le', '-s', `${o.w}x${o.h}`, '-i', `${tmp}/f_00000.rgba`, '-frames:v', '1', '-pix_fmt', o.alpha ? 'rgba64be' : 'rgb48be', 'OUTPUT'], duration: 0.04 });
        }
      } else if (f.kind === 'video') {
        progress(0.86, 'encoding');
        const enc = await encodersOf();
        let audio = null;
        if (o.sound && f.audio && !f.loop && SEQ()?.audioPlan) {
          const parts = SEQ().audioPlan(e, (T0 * F + N) / F, T0);
          audio = C.audio(parts, { fx: typeof SeqCut !== 'undefined' ? SeqCut : null, duck: SEQ().duckOf?.(e) || null, from: T0 });
        }
        const a = C.args({ format: f.id, F, n: N, input: `${tmp}/f_%05d.${ext}`, w: o.w, h: o.h, quality: o.quality, audio, loop: f.loop ? loop : null, encoders: enc, alpha: o.alpha, gifFps: F, gifLong: o.gifLong || 0 });
        await runFfmpeg({ id: `xp${id}`, input: `${tmp}/f_00000.${ext}`, output, args: a.args, duration: a.frames / F, onProgress: (p) => progress(0.86 + p * 0.13, 'encoding') });
        if (a.note) stat.note = a.note;
      }
      const st = await window.hub.fs.stat(output).catch(() => null);
      const secs = Math.round((performance.now() - ctl.t0) / 100) / 10;
      result = { path: output, format: f.id, w: o.w, h: o.h, fps: F, frames: f.loop && loop ? loop.L : N, seconds: secs, size: st?.size || null, speed: stat.fps, loop: loop ? { frames: loop.L, fade: loop.X, natural: Boolean(loop.found), secs: r4(loop.L / F) } : null, capped: o.capped, errors: [] };
      S.last = result;
      ok = true;
      if (!o.quiet && !rq?.notifies) toast(`Exported ${base(output)} (${o.w}×${o.h}, ${result.frames} frame${result.frames === 1 ? '' : 's'}) in ${secs} s`, { timeout: 6000, action: { label: 'Open', fn: () => openFile(output) } });
      return result;
    } catch (err) { errOut = err; throw err; } finally {
      if (page) page.close();
      if (tmp && !(f.id === 'png') && tmp.includes('.hearth-titles-xp')) window.hub.video.rmtemp?.(tmp).catch(() => {});
      if (ok) { window.Progress?.done(pk); rq?.done(result?.path); } else { window.Progress?.done(pk, { ok: false, label: ctl.cancel ? 'cancelled' : 'failed' }); rq?.fail(ctl.cancel ? 'Render cancelled' : errOut || 'The export stopped'); }
      if (S.cur === ctl) S.cur = null;
    }
  }
  function cmdLine(o) {
    return ['/lab-export', o.format, `${o.w}x${o.h}`, `${o.F}fps`, o.ss > 1 ? `ss${o.ss}` : '', o.blur > 1 ? `blur${o.blur}` : '', o.quality !== 'high' ? o.quality : '', o.secs ? `${o.secs}s` : '', o.bars ? `${o.bars}bars` : '', o.source === 'seq' ? 'seq' : '', o.alpha === false && o.f.alpha ? 'opaque' : '', o.sound === false && o.f.audio ? 'mute' : ''].filter(Boolean).join(' ');
  }
  function pause(on = true) { if (!S.cur) return false; S.cur.paused = on; return true; }
  function cancel() { if (!S.cur) return false; S.cur.cancel = true; return true; }

  // ---------- the scene itself: GLB, one-file web page, slider preset, contact sheet ----------
  async function exportScene(o) {
    const L = LAB();
    if (o.format === 'preset') return savePreset(o);
    if (o.format === 'html') return saveHtml(o);
    const dir = await outDir();
    const pk = `lab-export:${uid()}`;
    window.Progress?.set(pk, { title: `⇪ ${o.f.name}`, icon: '⇪', kind: 'lab-export', pct: 5, label: 'opening the export page' });
    let page = null;
    try {
      const seqE = o.source === 'seq' ? SEQ()?.edit : null;
      const F = o.F;
      let e; let sk = null; let dur;
      if (seqE) { e = CutData.copy(seqE); dur = SEQ().compile(seqE).plan.dur; } else {
        const P = L?.player; const lp = P?.loop;
        dur = o.secs || (lp && lp.b > lp.a ? lp.b : P?.loaded && P.duration ? Math.min(P.duration, 600) : 10);
        ({ e, sk } = await sceneEdit({ w: o.w, h: o.h, F, end: dur }));
      }
      const { plan, assets } = compileLive(e, sk);
      const shape = o.format === 'sheet' ? C.sheet(o.tiles || 12, o.w, o.h) : null;
      const pw = shape ? shape.tw : Math.min(o.w, 1280); const ph = shape ? shape.th : Math.round((pw * o.h) / o.w);
      page = await openPage({ w: pw, h: ph, ss: 1, alpha: false, seed: o.seed });
      await loadPlan(page, plan, assets, plan.song);
      window.Progress?.set(pk, { pct: 40, label: o.format === 'glb' ? 'exporting the 3D content' : 'drawing the frames' });
      const name = C.safe(o.name || sk?.name || seqE?.seq?.name || 'Lab');
      if (o.format === 'glb') {
        const T = o.at ?? playhead(o.source);
        const got = page.wait((m) => m.type === 'xp-glb', 120000, 'the GLB');
        page.send({ type: 'xp-glb', T, binary: true });
        const m = await got;
        if (m.error) throw new Error(`GLB: ${m.error}`);
        const out = await uniqueOut(dir, `${name} ${T.toFixed(2)}s`, 'glb');
        await window.hub.fs.write(out, new Uint8Array(m.buffer));
        window.Progress?.done(pk);
        const r = { path: out, format: 'glb', size: m.buffer.byteLength, scenes: m.scenes, meshes: m.meshes, triangles: m.triangles, animations: m.animations, at: T };
        if (!o.quiet) toast(`Exported ${base(out)}: ${m.meshes} meshes, ${m.triangles.toLocaleString()} triangles`, { timeout: 6000, action: { label: 'Reveal', fn: () => window.hub.fs.reveal(out) } });
        return r;
      }
      // the contact sheet: tiles spread over the clip (or the In–Out range), each at its exact frame
      const a = o.range?.a ?? 0; const b = o.range?.b ?? dur;
      const times = Array.from({ length: shape.n }, (_, i) => r4(a + ((b - a) * (i + 0.5)) / shape.n));
      const labels = times.map((t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')} · f${Math.round(t * F)}`);
      const got = page.wait((m) => m.type === 'xp-sheet', 240000, 'the contact sheet');
      page.send({ type: 'xp-sheet', times, cols: shape.cols, tw: shape.tw, th: shape.th, pad: shape.pad, labels, title: `${sk?.name || seqE?.seq?.name || 'Lab'} · ${o.w}×${o.h} · ${F} fps` });
      const m = await got;
      if (m.error) throw new Error(`Contact sheet: ${m.error}`);
      const out = await uniqueOut(dir, `${name} contact sheet`, 'png');
      await window.hub.fs.write(out, new Uint8Array(m.buffer));
      window.Progress?.done(pk);
      if (!o.quiet) toast(`Contact sheet saved: ${base(out)} (${shape.n} frames)`, { timeout: 6000, action: { label: 'Open', fn: () => openFile(out) } });
      return { path: out, format: 'sheet', tiles: shape.n, w: m.w, h: m.h, times };
    } catch (err) { window.Progress?.done(pk, { ok: false, label: 'failed' }); throw err; } finally { page?.close(); }
  }
  // the sliders of every layer of the scene on screen, as they are now
  function presetNow() {
    const L = LAB(); const sid = L?.sketchId(); const sk = sid ? L.scenes.get(sid) : null;
    if (!sk) throw new Error('No scene is open in the Lab');
    const layers = L.scenes.layersOf(sk).map((ly) => {
      let ctl = [];
      try { ctl = ThreeLab.director.sliders(ly.id).sliders || []; } catch { /* no sliders */ }
      return { id: ly.id, name: ly.name, values: Object.fromEntries(ctl.map((c) => [c.key, c.value])) };
    }).filter((x) => Object.keys(x.values).length);
    return C.preset({ scene: sk.name, layers });
  }
  async function savePreset(o = {}) {
    const p = presetNow();
    if (!p.layers.length) throw new Error('This scene has no sliders to save');
    const out = await uniqueOut(await outDir(), C.safe(`${o.name || p.scene} sliders`), 'hearth-preset.json');
    await window.hub.fs.write(out, JSON.stringify(p, null, 2));
    if (!o.quiet) toast(`Slider preset saved: ${base(out)}`, { timeout: 5000, action: { label: 'Reveal', fn: () => window.hub.fs.reveal(out) } });
    return { path: out, format: 'preset', layers: p.layers.length, sliders: p.layers.reduce((n, x) => n + Object.keys(x.values).length, 0) };
  }
  // a preset file back onto the scene on screen (layers by id, then by name)
  async function loadPreset(file) {
    const L = LAB(); const sid = L?.sketchId(); const sk = sid ? L.scenes.get(sid) : null;
    if (!sk) throw new Error('No scene is open in the Lab');
    const p = JSON.parse(await window.hub.fs.read(file));
    const plan = C.readPreset(p, L.scenes.layersOf(sk));
    let n = 0;
    for (const x of plan) { const r = ThreeLab.director.sliders(x.layer, x.values); n += r.changed?.length || 0; }
    return { layers: plan.length, changed: n };
  }
  // one self-contained .html: deploy's build (the Lab's player + three.js + the scene + its references), packed into
  // one file: the player goes in as srcdoc, every three.js module becomes a blob URL from an import map, references
  // become data URLs. Opens from the disk, offline, in any browser.
  async function saveHtml(o = {}) {
    await window.Lazy?.load?.('deploy');
    if (typeof Deploy === 'undefined') throw new Error('The deploy tools did not load');
    const pk = `lab-export:${uid()}`;
    window.Progress?.set(pk, { title: '⇪ Web page · one file', icon: '⇪', kind: 'lab-export', pct: 10, label: 'building the page' });
    try {
      const b = await Deploy.build('scene', LAB()?.sketchId() || '');
      const html = await packHtml(b);
      const out = await uniqueOut(await outDir(), C.safe(`${o.name || b.spec.name} web`), 'html');
      await window.hub.fs.write(out, html);
      window.Progress?.done(pk);
      if (!o.quiet) toast(`Web page saved: ${base(out)} (${C.fmtSize(html.length)}, opens offline)`, { timeout: 6000, action: { label: 'Open', fn: () => window.hub.fs.open?.(out) } });
      return { path: out, format: 'html', size: html.length, notes: b.notes || [] };
    } catch (err) { window.Progress?.done(pk, { ok: false, label: 'failed' }); throw err; }
  }
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const posix = (a, rel) => { const out = a.split('/').slice(0, -1); for (const p of rel.split('/')) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); } return out.join('/'); };
  async function packHtml(b) {
    const sep = b.dir.includes('\\') ? '\\' : '/';
    const lab = await window.hub.fs.read(`${b.dir}${sep}lab.html`);
    const files = (await window.hub.fs.list(`${b.dir}${sep}three`, { recursive: true, depth: 12 })).filter((x) => !x.isDir && /\.js$/.test(x.name));
    const mods = {};
    for (const x of files) {
      const rel = x.path.slice(`${b.dir}${sep}three${sep}`.length).split('\\').join('/');
      // relative imports become hx:/ keys of the import map (a blob: module can't resolve "./x.js" itself)
      mods[rel] = (await window.hub.fs.read(x.path)).replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"\n]+)\2/g, (m0, pre, q, spec) => `${pre}${q}hx:/${posix(rel, spec)}${q}`);
    }
    const reBase = /const base = new URL\('three', location\.href\)\.href;[^\n]*/;
    const reMap = 'document.currentScript.after(im);';
    if (!reBase.test(lab) || !lab.includes(reMap)) throw new Error('The Lab player changed: the one-file page can\'t be packed (update tools/three-export.js packHtml)');
    const boot = `<script>\n// (packed by Hearth: three.js lives in this file; each module becomes a blob: URL named in the import map)\nwindow.__hxMap = (() => { const F = ${JSON.stringify(mods).replace(/</g, '\\u003c')}; const map = {}; for (const [rel, text] of Object.entries(F)) { const u = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); map['hx:/' + rel] = u; if (rel.startsWith('examples/jsm/')) { map['three/addons/' + rel.slice(13)] = u; map['three/examples/jsm/' + rel.slice(13)] = u; } } return map; })();\n</script>\n`;
    let page = lab.replace(reBase, "const base = 'hx:'; // packed by Hearth (see __hxMap)")
      .replace(reMap, '{ const j = JSON.parse(im.textContent); Object.assign(j.imports, window.__hxMap || {}); im.textContent = JSON.stringify(j); } document.currentScript.after(im);')
      .replace(/for \(const u of \[real, `\$\{base\}\/build\/three\.core\.js`\]\) \{/, 'for (const u of []) {');
    page = page.replace(/<script>/, () => `${boot}<script>`); // (functions: the texts hold $& and the like)
    // references as data URLs
    const refs = [];
    for (const r of b.spec.refs || []) { try { const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 200e6 }); const ext = (r.path.split('.').pop() || '').toLowerCase(); const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', glb: 'model/gltf-binary', hdr: 'application/octet-stream' }[ext] || 'application/octet-stream'; refs.push({ key: r.key, kind: r.kind, mime, file: `data:${mime};base64,${b64(u8)}` }); } catch { /* a missing reference: the deploy notes say it */ } }
    const host = DeployCore.hostPage({ title: b.spec.name || 'Hearth scene', version: b.spec.version, layers: b.spec.layers, palette: b.spec.palette, refs, frame: b.spec.frame });
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const out = host.replace(/ src="lab\.html\?[^"]*"/, () => ` srcdoc="${esc(page)}"`);
    if (out === host) throw new Error('The deploy page changed: the one-file page can\'t be packed');
    return out;
  }

  // ---------- the sequence's own renders, here (the Lab preview keeps its size and stays usable) ----------
  // ThreeSeq.renderEdit hands its renders here (same options, same answer): the frames come from an export page at the
  // exact frame size instead of the preview switching to it
  async function renderEdit(e, { format = null, name = null, quiet = false, onProgress = null, fps = null, crf = 18, sound = true, range = null, again = null, title = null } = {}) {
    const D = ThreeSeqData;
    const fmt = format || D.formatOf(e);
    const [w, h] = D.FORMATS[fmt] || [e.seq?.w || 1080, e.seq?.h || 1920];
    const quality = crf <= 14 ? 'best' : crf >= 23 ? 'draft' : 'high';
    const r = await render({ source: 'seq', format: 'mp4', size: { w, h }, fps: fps || e.seq?.fps || 30, quality, sound, range, name: `${name || e.seq?.name || 'sequence'} ${fmt.replace(':', 'x')}`, quiet, onProgress, edit: e, trackKind: 'seq', again, title });
    return { path: r.path, frames: r.frames, fps: r.fps, w, h, format: fmt, seconds: r.seconds };
  }

  // ---------- the panel (one dialog: what, format, size, quality; the rest in chat) ----------
  const SIZE_CHIPS = [['frame', 'Lab frame'], ['1080p', '1080p'], ['4k', '4K'], ['8k-square', '8K □'], ['custom', 'W×H…']];
  async function panel({ format = null, source = null } = {}) {
    const last = opts0();
    const st = { format: format || last.format || 'mp4', size: last.size || 'frame', custom: last.custom || '', fps: last.fps || 30, quality: last.quality || 'high', ss: last.ss || 1, blur: last.blur || 1, source: source || (SEQ()?.active ? 'seq' : 'scene') };
    const dlg = el('dialog', { class: 'ui-modal sq-render-panel lx-panel' });
    const chip = (on, text, title, click) => el('button', { type: 'button', class: `sq-chip${on ? ' on' : ''}`, text, title, on: { click } });
    const body = el('div', { class: 'sq-rp-body' });
    const go = el('button', { type: 'button', class: 'primary', text: '⇪ Export' });
    const main = ['mp4', 'prores', 'png', 'gif', 'still'];
    function paint() {
      const f = C.get(st.format);
      const frame = st.source === 'seq' && SEQ()?.edit ? { w: SEQ().edit.seq.w, h: SEQ().edit.seq.h } : frameNow();
      const sz = st.size === 'custom' ? C.size(st.custom || 'frame', frame) : C.size(st.size, frame);
      const pg = C.page(sz.w, sz.h, st.ss, { cap: gpuCap() });
      body.replaceChildren(
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'What' }), el('div', { class: 'sq-chips' }, chip(st.source === 'scene', 'This scene', 'The scene on screen, with its sliders as they are', () => { st.source = 'scene'; paint(); }), chip(st.source === 'seq', '▤ The sequence', 'The Lab sequence, whole (or its In–Out range from /lab-export)', () => { st.source = 'seq'; paint(); }))),
        el('div', { class: 'sq-rp-row' }, el('b', { text: 'Format' }), el('div', { class: 'sq-chips' }, [...main.map((id) => chip(st.format === id, C.get(id).name.split(' · ')[0].replace('PNG sequence + alpha', 'PNG seq'), C.get(id).tip, () => { st.format = id; paint(); })),
          chip(!main.includes(st.format), main.includes(st.format) ? 'More ▾' : `${f.name} ▾`, 'HEVC, WebM + alpha, MP4 loop, 16-bit still, GLB, web page, preset, contact sheet', (ev) => showMenu(ev.clientX, ev.clientY, C.FORMATS.filter((x) => !main.includes(x.id)).map((x) => ({ label: x.name, hint: x.tip, checked: st.format === x.id, action: () => { st.format = x.id; paint(); } }))))])),
        f.kind === 'scene' && f.id !== 'sheet' ? null : el('div', { class: 'sq-rp-row' }, el('b', { text: 'Size' }), el('div', { class: 'sq-chips' }, SIZE_CHIPS.map(([id, label]) => chip(st.size === id, id === 'frame' ? `${label} (${frame.w}×${frame.h})` : label, id === 'custom' ? 'Any size: 2560x1440, 6000x4000…' : `${C.size(id, frame).w}×${C.size(id, frame).h}`, async () => { if (id === 'custom') { const v = await Modal.prompt?.('Size (width × height)', st.custom || `${frame.w * 2}x${frame.h * 2}`); if (!v) return; st.custom = v; } st.size = id; paint(); })))),
        f.kind === 'video' || f.kind === 'seq' ? el('div', { class: 'sq-rp-row' }, el('b', { text: 'Frame rate' }), el('div', { class: 'sq-chips' }, [24, 25, 30, 50, 60].map((x) => chip(st.fps === x, `${x}`, '', () => { st.fps = x; paint(); })))) : null,
        f.kind === 'scene' ? null : el('div', { class: 'sq-rp-row' }, el('b', { text: 'Quality' }), el('div', { class: 'sq-chips' }, [
          ...Object.entries(C.QUALITY).filter(() => f.kind === 'video').map(([k, q]) => chip(st.quality === k, q.label, '', () => { st.quality = k; paint(); })),
          chip(st.ss > 1, st.ss > 1 ? `Supersample ${st.ss}×` : 'Supersample', 'Drawn at 2× (or 3×, 4×) the pixels and boxed down: clean edges, fine lines, no shimmer. Click: off → 2× → 3× → 4×', () => { st.ss = st.ss >= 4 ? 1 : st.ss + 1; paint(); }),
          f.kind === 'still' ? null : chip(st.blur > 1, st.blur > 1 ? `Motion blur ${st.blur}` : 'Motion blur', 'Real motion blur: sub-frames across a 180° shutter, averaged. Click: off → 8 → 16', () => { st.blur = st.blur === 1 ? 8 : st.blur === 8 ? 16 : 1; paint(); }),
        ])),
        el('div', { class: 'sq-rp-sum', text: `${f.tip}${f.kind !== 'scene' || f.id === 'sheet' ? ` · ${sz.w}×${sz.h}` : ''}${pg.ss > 1 ? ` · drawn at ${sz.w * pg.ss}×${sz.h * pg.ss}` : ''}${pg.capped.length ? ` · ${pg.capped.join(', ')}` : ''}${st.blur > 1 && f.kind !== 'still' ? ` · ${st.blur} sub-frames a frame` : ''}${f.loop ? ' · length: 2 bars of the song (or the loop the frames make)' : ''}` }),
      );
      go.textContent = `⇪ ${f.kind === 'scene' && f.id !== 'sheet' ? 'Save' : 'Export'} ${f.name.split(' · ')[0]}`;
    }
    dlg.append(el('h3', { text: 'Export from the Lab' }), body, el('div', { class: 'modal-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => dlg.close() } }), go));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    paint();
    dlg.showModal();
    go.addEventListener('click', () => {
      store.set('three.export', { format: st.format, size: st.size, custom: st.custom, fps: st.fps, quality: st.quality, ss: st.ss, blur: st.blur });
      dlg.close();
      const frame = st.source === 'seq' && SEQ()?.edit ? { w: SEQ().edit.seq.w, h: SEQ().edit.seq.h } : frameNow();
      render({ format: st.format, source: st.source, size: st.size === 'custom' ? C.size(st.custom, frame) : C.size(st.size, frame), fps: st.fps, quality: st.quality, ss: st.ss, blur: st.blur })
        .catch((err) => { if (!window.Renders || /^(Open|No )/.test(err.message)) toast(err.message, { type: 'error' }); });
    });
    return dlg;
  }
  // the preview's right-click: Capture › ⇪ Export…
  function previewItem() {
    return { label: '⇪ Export', items: () => [
      { label: '⇪ Export…', hint: 'any size, ProRes, alpha, loops', action: () => panel() },
      { label: '4K MP4, supersampled', action: () => render({ format: 'mp4', size: '4k', ss: 2 }).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'ProRes 4444 + alpha', action: () => render({ format: 'prores' }).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Perfect loop GIF', action: () => render({ format: 'gif' }).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Still for print (16-bit)', hint: '4× this frame', action: () => render({ format: 'still16', size: '4x', ss: 2 }).catch((e) => toast(e.message, { type: 'error' })) },
      '-',
      { label: '🧊 GLB of the 3D content', action: () => render({ format: 'glb' }).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Web page (one .html)', action: () => render({ format: 'html' }).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Sliders as a preset file', action: () => render({ format: 'preset' }).catch((e) => toast(e.message, { type: 'error' })) },
      { label: 'Contact sheet', action: () => render({ format: 'sheet' }).catch((e) => toast(e.message, { type: 'error' })) },
    ] };
  }
  const status = () => ({ running: S.cur ? { frames: S.cur.frames, total: S.cur.total, paused: S.cur.paused } : null, waiting: S.waiting, last: S.last, speeds: S.stats.slice(-8) });
  return { render, resolve, renderEdit, panel, previewItem, pause, cancel, status, savePreset, loadPreset, presetNow, packHtml, openPage, gpuCap, setGpuCap: (mp) => store.set('three.export.gpu', Math.max(4, Math.min(512, Number(mp) || 64))), _S: S };
})();
if (typeof module !== 'undefined') module.exports = LabExport;
