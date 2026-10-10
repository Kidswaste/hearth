// The render queue (round 13): one queue for everything Hearth renders, records or exports. Video Review / editor
// exports, video projects (/intro), the Lab sequence's renders (and comps through it), recordings and the presets
// rendered from here all show in one list: a progress bar with time left, pause / resume, cancel, retry, the make it
// belongs to (name and mark). ffmpeg jobs run one at a time (the app stays smooth; /renders parallel 2 for more), the
// Lab's renders one at a time in the preview, recordings live. When one is done: a quiet note with Open, Reveal in
// Finder (Show in Explorer on Windows), Copy path and Open in Video Review; a failure says why in plain words, with
// its fix (and goes in /habits errors). A history of past renders: re-render with the same settings, Trash.
// Entry points (no new row of buttons): a small ⇪ badge at the bottom of the rail while something renders, /renders,
// Ctrl/⌘+K, Video Review's Export menu, the Lab sequence's render panel ("More formats…").
// Smooth (round 5 / 12 rules): no DOM writes per frame or per ffmpeg event (events only update the model); the badge
// and the open list repaint at most twice a second, compare before writing, and nothing ticks while the window is
// hidden or nothing runs.
// Hooks elsewhere call: Renders.transcode(spec, overrides, meta) (tools/review.js startJob), Renders.track(o)
// (tools/three-seq.js renderEdit), Renders.owns(id) / Renders.cancel(id) (review.js), Renders.panel(o) (menus).
const Renders = (() => {
  const R = RendersCore;
  const KV = 'renders';
  const PLAT = /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux';
  const IS_MAC = PLAT === 'darwin';
  const jobs = []; // this session's jobs (waiting, running, paused, ended)
  let history = []; // past renders, newest first (kv 'renders'), kept across restarts
  let pendingBoot = []; // jobs that were waiting when Hearth closed
  const listeners = new Set();
  const byPk = new Map(); // progress key (the Lab's / a recording's own bar) → job
  let encoders = null;
  let unseen = 0; // failures not looked at yet (the badge stays until the list is opened)
  const ffOver = () => ({ ffmpeg: H.settings().ffmpegPath || undefined });
  const api = () => window.hub.renders || null;
  const now = () => Date.now();
  const uid = () => `rq${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const limits = () => ({ ffmpeg: store.get('renders.parallel', 1), lab: 1 });
  const live = (j) => ['queued', 'starting', 'running', 'paused'].includes(j.status);
  const find = (id) => jobs.find((j) => j.id === id) || null;
  const errText = (err) => String(err?.message || err || '').replace(/^Error invoking remote method[^:]*: (Error: )?/, '');

  // ---------- saving ----------
  const saveSoon = debounce(() => {
    const pending = jobs.filter((j) => live(j) && j.again && !j.external).map((j) => ({ id: j.id, title: j.title, again: j.again, make: j.make, created: j.created }));
    window.hub.kvSet(KV, { history, pending });
  }, 800);
  const ready = (async () => {
    try {
      const d = await window.hub.kvGet(KV, null);
      history = Array.isArray(d?.history) ? d.history : [];
      pendingBoot = Array.isArray(d?.pending) ? d.pending : [];
    } catch { /* first run */ }
  })();

  // ---------- the make it belongs to (round 11 makes) ----------
  function makeHere() {
    try {
      const r = window.Makes?.here?.();
      if (!r) return null;
      return { id: r.make.id, part: r.part?.id || null, name: r.make.name, glyph: r.make.ident?.glyph, color: r.make.ident?.color };
    } catch { return null; }
  }
  function joinMake(j) {
    if (!j.make || !j.output || typeof Makes === 'undefined') return;
    try { const m = Makes.get(j.make.id); if (m) Makes.addOutput(m, j.output, j.make.part, j.kind === 'record' ? 'recording' : 'video'); } catch { /* the make was dismissed */ }
  }

  // ---------- changes → the badge, the list (throttled), listeners ----------
  let paintT = 0;
  function changed(j, what) {
    for (const fn of listeners) { try { fn(j, what); } catch (err) { console.warn(err); } }
    if (what !== 'progress') saveSoon();
    if (!paintT) paintT = setTimeout(() => { paintT = 0; paint(); }, what === 'progress' ? 500 : 60);
  }
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // the progress bar of a job (progress.js): ffmpeg jobs use the bar their caller made (job:<id>), or one of their own
  function bar(j, o = {}) {
    if (typeof Progress === 'undefined' || j.external) return;
    const key = `job:${j.id}`;
    const lineN = R.place(jobs, j.id);
    const base = { title: `⇪ ${j.title}`, icon: '⇪', kind: `render:${j.preset || 'export'}`, jump: () => open(), actions: [{ label: '■', title: 'Cancel', run: () => cancel(j.id) }] };
    if (j.status === 'queued') Progress.set(key, { ...base, state: 'wait', label: lineN > 1 ? `waiting · ${lineN} in line` : 'waiting · next' });
    else if (j.status === 'paused') Progress.set(key, { ...base, state: 'wait', label: 'paused' });
    else if (j.status === 'starting' || j.status === 'running') Progress.set(key, { ...base, state: 'run', ...o });
  }

  // ---------- adding jobs ----------
  function add(j) {
    const job = { kind: 'ffmpeg', status: 'queued', pct: 0, created: now(), make: makeHere(), ...j };
    if (!job.id) job.id = uid();
    jobs.push(job);
    // ended jobs of this session beyond the newest 30 leave the live list (they stay in the history)
    const ended = jobs.filter((x) => !live(x));
    if (ended.length > 30) for (const x of ended.slice(0, ended.length - 30)) jobs.splice(jobs.indexOf(x), 1);
    bar(job);
    changed(job, 'add');
    return job;
  }
  // The hook in Review.startJob (and anything else that runs ffmpeg for the owner): the job waits its turn, then runs
  // with the same id (its caller's listeners hear the same events). Starting now, a failure to start throws like
  // hub.video.transcode did; later, it arrives as a 'done' event with the error.
  async function transcode(spec, overrides = ffOver(), meta = {}) {
    const titled = String(meta.title || '').replace(/^⇪\s*/, '');
    const usesTemp = (spec.args || []).some((a) => /\.hearth-titles-/.test(String(a)));
    const job = add({ id: spec.id, kind: 'ffmpeg', title: titled || R.base(spec.output), input: spec.input, output: spec.output, spec, overrides, owner: meta.owner || 'caller', quiet: meta.quiet, library: meta.library, preset: meta.preset || null,
      again: usesTemp ? null : { type: 'spec', spec: { input: spec.input, output: spec.output, args: spec.args, duration: spec.duration }, title: titled } });
    if (R.schedule(jobs, limits()).includes(job.id)) await start(job, { throwing: true });
    else pump();
    return { started: true, queued: job.status === 'queued', output: spec.output, id: job.id };
  }
  // a render made here (from the panel or /renders): built when it starts (the source is probed then, so a chain's
  // second step can use the first one's file)
  function enqueue({ input, preset, opts = {}, after = null, title = null, open: openAfter = false, again = null, make, reuseOut = null }) {
    const p = R.get(preset);
    const job = add({ kind: 'ffmpeg', owner: 'renders', title: title || `${p.name}${input ? ` · ${R.base(input)}` : ''}`, input, preset: p.id, opts, after, openAfter, reuseOut, ...(make !== undefined ? { make } : {}),
      again: again || (input ? { type: 'build', input, preset: p.id, opts } : null) });
    pump();
    return job;
  }
  // a Lab sequence render queued here: it starts when the preview is free; a conversion can follow (GIF, WebM…)
  function enqueueSeq({ key, preset, opts = {}, title = null, open: openAfter = false }) {
    const own = typeof ThreeSeqData !== 'undefined' && typeof ThreeSeq !== 'undefined' && ThreeSeq.edit ? ThreeSeqData.formatOf(ThreeSeq.edit) : '9:16';
    const plan = R.seqPlan(preset, { quality: opts.quality, fps: opts.fps, own });
    const p = R.get(preset);
    const name = (key || '').replace(/^seq:/, '') || 'sequence';
    const job = add({ kind: 'seq', lane: 'lab', owner: 'renders', title: plan.then ? `▤ ${name} → ${p.name}` : `▤ ${name} · ${p.name}`, preset: p.id, seqKey: key, seqOpts: { format: plan.format, fps: plan.fps || undefined, crf: plan.crf, sound: opts.sound !== false }, openAfter: openAfter && !plan.then,
      again: { type: 'seq', key, preset: p.id, opts } });
    if (plan.then) enqueue({ input: null, preset: plan.then, opts: { ...opts, fps: 0 }, after: job.id, title: `${p.name} · ${name}`, open: openAfter, again: { type: 'seq', key, preset: p.id, opts } });
    pump();
    return job;
  }

  // ---------- running ----------
  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (const id of R.schedule(jobs, limits())) { const j = find(id); if (j) start(j).catch((err) => console.warn(err)); }
    } finally { pumping = false; }
    for (const j of jobs) if (j.status === 'queued') bar(j); // places in line moved
  }
  async function probe(path) {
    const pr = await window.hub.video.probe(path, ffOver()).catch(() => null);
    if (pr) return pr;
    // no ffprobe: the video element knows the size and length (not the exact rate)
    return new Promise((res) => {
      const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
      const done = (x) => { v.removeAttribute('src'); v.load(); res(x); };
      v.onloadedmetadata = () => done({ w: v.videoWidth, h: v.videoHeight, fps: 30, duration: Number.isFinite(v.duration) ? v.duration : 0, audio: undefined });
      v.onerror = () => done(null);
      v.src = `file://${String(path).replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}`;
      setTimeout(() => done(null), 8000);
    });
  }
  async function start(j, { throwing = false } = {}) {
    j.status = 'starting'; j.started = now(); j.pausedMs = 0; j.pct = 0; j.error = null;
    changed(j, 'start');
    try {
      if (j.kind === 'seq') return await startSeq(j);
      if (!j.spec) await build(j);
      bar(j, { label: 'starting', pct: 0 });
      const run = api()?.run || window.hub.video.transcode;
      await run({ id: j.id, input: j.spec.input, output: j.spec.output, args: j.spec.args, duration: j.spec.duration }, j.overrides || ffOver());
      if (j.status === 'starting') j.status = 'running';
      changed(j, 'run');
    } catch (err) {
      const msg = errText(err);
      if (j.kind !== 'seq' && !throwing) window.hub.renders?.relay?.({ id: j.id, type: 'done', code: -1, error: msg });
      fail(j, msg, { toast: !throwing || j.owner === 'renders', log: !throwing || j.owner === 'renders' }); // a caller told at once says it itself
      if (throwing) throw err;
    } finally { pump(); }
    return j;
  }
  // a render made here: probe the source, build the preset's arguments, pick a free file name
  async function build(j) {
    if (!j.input && j.after) { const a = find(j.after); j.input = a?.output || null; }
    if (!j.input) throw new Error('The source to convert isn\'t there (the step before it didn\'t make a file).');
    const tools = await window.hub.video.tools(ffOver()).catch(() => null);
    if (!tools?.ffmpeg) throw new Error(`ffmpeg isn't installed. ${tools?.hint || ''}`);
    encoders ||= (await api()?.encoders?.(ffOver()).catch(() => null))?.list || null;
    const src = await probe(j.input);
    if (!src) throw new Error(`File not found or unreadable: ${j.input}`);
    const r = R.buildArgs(VideoData, j.preset, src, { ...j.opts, encoders });
    const stem = j.make && !R.stemOf(j.input).includes(j.make.name) ? `${j.make.name} · ${R.stemOf(j.input)}` : null;
    // a re-render keeps the first one's name ("… (2).mp4" next to it)
    const output = await R.nextFree(j.reuseOut || R.outPath(j.input, r.preset, r.w, r.h, r.ext, stem), async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null)));
    j.spec = { input: j.input, output, args: r.args, duration: r.duration };
    j.output = output;
    j.note = r.preset.note || null;
    if (j.after) j.again = j.again || { type: 'build', input: j.input, preset: j.preset, opts: j.opts };
    if (j.again?.type === 'build') { j.again.input = j.input; j.again.output = j.again.output || output; }
  }
  // a Lab sequence render started here: the sequence opens (if another is on), renders (renderEdit tracks itself
  // through track(), which adopts this job)
  let adopting = null;
  async function startSeq(j) {
    if (typeof ThreeSeq === 'undefined') throw new Error('The Lab sequence isn\'t loaded');
    if (typeof ThreeLab !== 'undefined') await ThreeLab.cmd?.({ show: false }).catch(() => null);
    if (j.seqKey && ThreeSeq.key !== j.seqKey) await ThreeSeq.open(j.seqKey, { show: false });
    adopting = j;
    try {
      const r = await ThreeSeq.render({ ...j.seqOpts, quiet: true });
      if (j.status !== 'done') finish(j, r?.path || null);
      return j;
    } finally { if (adopting === j) adopting = null; }
  }

  // ffmpeg's own events (the same channel the callers listen on): only the model changes here, never the DOM
  function onJob(ev) {
    const j = ev?.id ? find(ev.id) : null;
    if (!j || j.external) return;
    if (ev.type === 'progress') {
      if (j.status === 'starting') j.status = 'running';
      const p = Math.max(0, Math.min(100, (ev.pct || 0) * 100));
      if (p >= j.pct) j.pct = p;
      if (j.owner === 'renders') bar(j, { pct: j.pct, label: ev.frame && ev.total ? `frame ${ev.frame} / ${ev.total}` : 'ffmpeg' });
      changed(j, 'progress');
    } else if (ev.type === 'paused') {
      // Windows: a paused job was stopped quietly; Resume starts it again from the top
      j.status = 'paused'; j.restart = true; j.pausedAt = now();
      bar(j); changed(j, 'pause');
      pump();
    } else if (ev.type === 'done') {
      if (!live(j)) return;
      if (ev.code === 0) finish(j, ev.output || j.output, { seconds: ev.seconds });
      else if (ev.cancelled || j.cancelling) ended(j, 'cancelled');
      else fail(j, ev.error || `ffmpeg ended with ${ev.code}`);
      pump();
    }
  }

  // ---------- the end of a job ----------
  function record(j) {
    history = R.remember(history, { id: j.id, kind: j.kind, title: j.title, preset: j.preset || null, input: j.input || null, output: j.output || null, size: j.size || null, seconds: j.seconds ?? null, ended: j.ended, status: j.status, error: j.error || null, again: j.again || null, make: j.make || null, note: j.note || null });
    saveSoon();
  }
  function ended(j, status) {
    j.status = status; j.ended = now();
    if (status === 'cancelled' && typeof Progress !== 'undefined' && !j.external && Progress.get(`job:${j.id}`)) Progress.drop(`job:${j.id}`);
    record(j); changed(j, status);
  }
  async function finish(j, output, { seconds } = {}) {
    if (!live(j) && j.status !== 'starting') return;
    j.output = output || j.output; j.pct = 100;
    j.seconds = seconds ?? Math.round((now() - (j.started || now()) - (j.pausedMs || 0)) / 1000);
    if (typeof Progress !== 'undefined' && j.owner === 'renders' && !j.external) Progress.done(`job:${j.id}`, { label: R.base(j.output) });
    j.status = 'done'; j.ended = now();
    try { j.size = (await window.hub.fs.stat(j.output))?.size || null; } catch { /* no size */ }
    joinMake(j);
    if (j.owner === 'renders' && j.kind === 'ffmpeg' && typeof Review !== 'undefined') { try { await Review.noteRecording(j.output); } catch { /* the library is a bonus */ } }
    record(j); changed(j, 'done');
    if (!j.quiet && !jobs.some((x) => x.after === j.id && live(x))) notifyDone(j);
    if (j.openAfter && j.output) openIn(j.output);
    pump();
  }
  function fail(j, message, { toast: show = true, log = true } = {}) {
    if (!live(j)) return;
    const e = R.explain(message, PLAT);
    j.error = e; j.status = 'failed'; j.ended = now();
    if (typeof Progress !== 'undefined' && !j.external && Progress.get(`job:${j.id}`)) Progress.done(`job:${j.id}`, { ok: false, label: e.reason.slice(0, 50) });
    // a chain's next step can't run without this one
    for (const x of jobs) if (x.after === j.id && live(x)) { x.error = { reason: 'The step before it failed.', fix: 'Retry the first step.' }; x.status = 'failed'; x.ended = now(); record(x); }
    if (log) { try { if (typeof Habits !== 'undefined') Habits.record(`Render failed: ${e.reason}`, 'renders', e.fix); } catch { /* the log is a bonus */ } }
    unseen += 1;
    record(j); changed(j, 'failed');
    if (show) notifyFail(j);
  }

  // ---------- notes ----------
  function noteNode(text, cls, buttons) {
    const node = toast(text, { type: cls, timeout: cls === 'rq-fail' ? 14000 : 9000 });
    const x = node?.querySelector?.('.toast-x');
    for (const b of buttons.filter(Boolean)) node?.insertBefore(el('button', { text: b.label, title: b.title || '', on: { click: () => { try { b.fn(); } catch (err) { toast(err.message, { type: 'error' }); } node.remove(); } } }), x);
    return node;
  }
  function notifyDone(j) {
    if (!j.output) return;
    const what = `✓ ${R.base(j.output)}${j.size ? ` · ${R.fmtSize(j.size)}` : ''}${j.seconds != null ? ` · ${R.fmtSecs(j.seconds)}` : ''}${j.note ? ` (${j.note})` : ''}`;
    noteNode(what, 'rq-done', actionsFor(j).slice(0, 4).map((a) => ({ label: a.short || a.label, title: a.label, fn: a.action })));
    if (document.hidden) window.hub.flashWindow?.().catch?.(() => {});
  }
  function notifyFail(j) {
    const e = j.error || {};
    noteNode(`✕ ${j.title}: ${e.reason}\nFix: ${e.fix}`, 'rq-fail', [j.again ? { label: '↻ Retry', fn: () => retry(j.id) } : null, { label: 'Renders', fn: () => open() }]);
  }

  // ---------- what you can do with a job ----------
  const revealLabel = R.revealLabel(PLAT);
  async function openIn(p) { activate('tool:ae'); await Review.ensureMounted?.(); return Review.open(p); }
  function actionsFor(j) {
    const out = j.output;
    const A = [];
    if (j.status === 'done' && out && !j.trashed) {
      A.push({ label: 'Open', short: 'Open', action: () => window.hub.fs.open(out) });
      A.push({ label: revealLabel, short: IS_MAC ? 'Finder' : PLAT === 'win32' ? 'Explorer' : 'Folder', action: () => window.hub.fs.reveal(out) });
      A.push({ label: 'Copy path', short: 'Copy path', action: () => copyText(out, 'Path copied') });
      if (!/\.(m4a|wav|gif)$/i.test(out)) A.push({ label: 'Open in Video Review', short: 'Review', action: () => openIn(out) });
    }
    return A;
  }
  function menuFor(j) {
    const it = [];
    if (j.status === 'running' || j.status === 'starting') it.push({ label: '❚❚ Pause', action: () => pause(j.id) });
    if (j.status === 'paused') it.push({ label: '▶ Resume', action: () => resume(j.id) });
    if (j.status === 'queued') it.push({ label: '⤒ Next in line', action: () => { j.prio = now(); changed(j, 'move'); pump(); } });
    if (live(j)) it.push({ label: '■ Cancel', action: () => cancel(j.id) });
    for (const a of actionsFor(j)) it.push({ label: a.label, action: a.action });
    if ((j.status === 'failed' || j.status === 'cancelled') && j.again) it.push({ label: '↻ Retry', action: () => retry(j.id) });
    if (j.status === 'done' && j.again) it.push({ label: '↻ Re-render (same settings)', action: () => retry(j.id) });
    if (j.status === 'failed' && j.error) it.push({ label: 'Why it failed…', action: () => Modal.alert(j.title, `${j.error.reason}\n\nFix: ${j.error.fix}${j.error.raw ? `\n\nffmpeg said: ${j.error.raw}` : ''}`) });
    if (j.make && typeof Makes !== 'undefined') it.push({ label: `${j.make.glyph || '■'} Show its make (${j.make.name})`, more: true, action: () => Makes.show?.(j.make.id) });
    if (j.status === 'done' && j.output && !j.trashed) it.push({ label: 'Move to Trash', more: true, action: () => trash(j.id) });
    if (!live(j)) it.push({ label: 'Remove from the list', more: true, action: () => forget(j.id) });
    return it;
  }

  // ---------- controls ----------
  async function pause(id) {
    const j = find(id);
    if (!j || !live(j) || j.status === 'paused') return false;
    if (j.status === 'queued') { j.status = 'paused'; j.pausedAt = now(); bar(j); changed(j, 'pause'); return true; }
    if (j.external) { if (!j.pauseFn) return false; j.pauseFn(true); j.status = 'paused'; j.pausedAt = now(); changed(j, 'pause'); return true; }
    const r = await api()?.pause?.(j.id).catch(() => null);
    if (!r?.ok) return false;
    j.pausedAt = now();
    if (r.mode === 'suspend') { j.status = 'paused'; j.held = true; bar(j); changed(j, 'pause'); }
    return true;
  }
  async function resume(id) {
    const j = find(id);
    if (!j || j.status !== 'paused') return false;
    j.pausedMs = (j.pausedMs || 0) + (now() - (j.pausedAt || now())); j.pausedAt = 0;
    if (j.external) { j.pauseFn?.(false); j.status = 'running'; changed(j, 'resume'); return true; }
    if (j.held) { const r = await api()?.resume?.(j.id).catch(() => null); if (r?.ok) { j.held = false; j.status = 'running'; bar(j, { label: 'ffmpeg' }); changed(j, 'resume'); return true; } j.held = false; }
    // waiting (never started) or stopped on Windows: back in line, first
    j.status = 'queued'; j.prio = now(); j.restart = false;
    bar(j); changed(j, 'resume'); pump();
    return true;
  }
  async function cancel(id) {
    const j = find(id);
    if (!j || !live(j)) return false;
    if (j.external) { j.cancelling = true; j.cancelFn?.(); return true; }
    const started = (j.status === 'running' || j.status === 'starting' || (j.status === 'paused' && j.held));
    if (started) { j.cancelling = true; const ok = await (api()?.cancel || window.hub.video.cancel)(j.id).catch(() => false); if (ok) return true; }
    // never reached ffmpeg (or it is gone): its callers hear the end now
    window.hub.renders?.relay?.({ id: j.id, type: 'done', code: null, cancelled: true });
    for (const x of jobs) if (x.after === j.id && live(x)) ended(x, 'cancelled');
    ended(j, 'cancelled'); pump();
    return true;
  }
  // a failed / cancelled job again, or a finished one re-rendered with the same settings (a new file next to it)
  async function retry(id) {
    const j = find(id) || history.find((x) => x.id === id);
    const a = j?.again;
    if (!a) throw new Error('This one can\'t be made again from here (re-render it from where it was made).');
    if (a.type === 'spec') {
      let out = a.spec.output;
      if (j.status === 'done') out = await R.nextFree(out, async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null)));
      const nj = add({ kind: 'ffmpeg', owner: 'renders', title: a.title || j.title, input: a.spec.input, output: out, spec: { ...a.spec, output: out }, again: { ...a, spec: { ...a.spec, output: out } }, make: j.make || null });
      pump(); return nj;
    }
    if (a.type === 'build') return enqueue({ input: a.input, preset: a.preset, opts: a.opts || {}, title: j.title, make: j.make || null, reuseOut: a.output || null });
    if (a.type === 'seq') return enqueueSeq({ key: a.key, preset: a.preset, opts: a.opts || {} });
    if (a.type === 'seq-direct') {
      // a render started from the sequence itself: the same sequence and options, through the queue
      const job = add({ kind: 'seq', lane: 'lab', owner: 'renders', title: j.title, seqKey: a.key, seqOpts: a.opts, again: a, make: j.make || null });
      pump(); return job;
    }
    if (a.type === 'cmd') { await Commands.exec?.(a.line, H.claudeAgent?.()?.id); return null; }
    return null;
  }
  async function trash(id) {
    const j = find(id) || history.find((x) => x.id === id);
    if (!j?.output) return false;
    const r = await window.hub.fs.trash([j.output]).catch((err) => ({ failed: [{ error: err.message }] }));
    if (r?.failed?.length) { toast(`Couldn't move it to the Trash: ${r.failed[0].error}`, { type: 'error' }); return false; }
    j.trashed = true;
    const h = history.find((x) => x.id === id); if (h) h.trashed = true;
    saveSoon(); changed(j, 'trash');
    toast(`${R.base(j.output)} is in the ${PLAT === 'win32' ? 'Recycle Bin' : 'Trash'}`, { timeout: 3000 });
    return true;
  }
  function forget(id) {
    const i = jobs.findIndex((x) => x.id === id && !live(x)); if (i >= 0) jobs.splice(i, 1);
    history = history.filter((x) => x.id !== id);
    saveSoon(); changed(null, 'forget');
  }
  // ended jobs leave the list (the history keeps them unless `all`)
  function clear({ all = false } = {}) {
    const n = jobs.filter((j) => !live(j)).length;
    for (let i = jobs.length - 1; i >= 0; i -= 1) if (!live(jobs[i])) jobs.splice(i, 1);
    if (all) history = [];
    unseen = 0;
    saveSoon(); changed(null, 'clear');
    return n;
  }

  // ---------- jobs that run themselves (the Lab sequence, recordings): shown, paused, cancelled ----------
  // o = { kind: 'seq' | 'record', title, pk (its progress key), cancel(), pause(on), again, quiet }
  function track(o = {}) {
    let j = adopting && o.kind === 'seq' ? adopting : null;
    if (j) { adopting = null; Object.assign(j, { pk: o.pk, cancelFn: o.cancel, pauseFn: o.pause, external: true, status: 'running' }); j.quiet = j.quiet || false; if (!j.again) j.again = o.again; } else {
      j = add({ kind: o.kind || 'seq', lane: o.kind === 'record' ? 'live' : 'lab', owner: 'self', external: true, status: 'running', started: now(), title: o.title || 'Render', pk: o.pk, cancelFn: o.cancel, pauseFn: o.pause, again: o.again || null, quiet: Boolean(o.quiet) });
    }
    if (o.pk) byPk.set(o.pk, j);
    changed(j, 'run');
    return {
      job: j,
      progress: (pct, label) => { if (pct >= j.pct) j.pct = pct; if (label) j.label = label; changed(j, 'progress'); },
      done: (output) => { byPk.delete(o.pk); finish(j, output); },
      fail: (err) => { byPk.delete(o.pk); const m = errText(err); if (j.cancelling || /cancel/i.test(m)) ended(j, 'cancelled'); else fail(j, m, { toast: !o.quietFail }); },
      cancelled: () => { byPk.delete(o.pk); if (live(j)) ended(j, 'cancelled'); },
      get notifies() { return !j.quiet; },
    };
  }
  // their bars (progress.js) carry the numbers: mirrored into the job (model only)
  function onProgress(it, what) {
    const j = byPk.get(it.key);
    if (!j || what === 'remove') return;
    const p = Math.round((it.shown || 0) * 10) / 10;
    if (p > j.pct && p < 100) { j.pct = p; j.label = it.label || ''; changed(j, 'progress'); }
  }
  // recordings (capture.js announces them)
  let recTrack = null;
  function onRecording(e) {
    const st = e.detail || {};
    if (st.recording && !recTrack) {
      recTrack = track({ kind: 'record', title: st.tour ? '◉ Tour recording' : '◉ Recording', pk: 'rec', cancel: () => Capture.stop(), pause: (on) => (on ? Capture.pause() : Capture.resume()), again: { type: 'cmd', line: '/record' }, quiet: true });
    } else if (!st.recording && recTrack) {
      const t = recTrack; recTrack = null;
      if (st.path) t.done(st.path); else t.cancelled();
    }
  }

  // ---------- the badge (bottom of the rail, only while something renders or failed unseen) ----------
  let badge = null;
  function mountBadge() {
    const rail = document.getElementById('rail');
    if (!rail) return null;
    if (!badge) {
      badge = el('button', { class: 'tool-btn rq-badge', id: 'rq-badge', type: 'button', hidden: true, dataset: { feature: 'Render queue' }, 'aria-label': 'Renders' }, el('span', { class: 'rq-b-ic', text: '⇪' }), el('b', { class: 'rq-b-n' }));
      badge.addEventListener('click', () => (pop ? close() : open()));
      badge.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX + 6, e.clientY - 160, quickMenu()); });
    }
    const anchor = document.getElementById('pg-dot') || document.getElementById('sync-dot') || document.getElementById('keys-btn');
    if (anchor ? badge.nextElementSibling !== anchor : badge.parentElement !== rail) (anchor ? anchor.before(badge) : rail.append(badge));
    return badge;
  }
  function paintBadge() {
    const act = jobs.filter(live);
    const show = act.length > 0 || unseen > 0;
    if (!show && !badge) return;
    if (!mountBadge()) return;
    if (badge.hidden === show) badge.hidden = !show;
    if (!show) return;
    const running = act.filter((j) => j.status !== 'queued' && j.status !== 'paused');
    const n = act.length ? String(act.length) : '!';
    const nb = badge.lastChild;
    if (nb.textContent !== n) nb.textContent = n;
    const st = unseen && !act.length ? 'failed' : act.length && act.every((j) => j.status === 'paused') ? 'paused' : running.length ? 'run' : 'wait';
    if (badge.dataset.state !== st) badge.dataset.state = st;
    const t = act.length ? `Renders (${act.length}):\n${act.slice(0, 6).map((j) => `${R.ICON[j.status]} ${j.title}: ${words(j)}`).join('\n')}\nClick: the queue · right-click: render…` : 'A render failed: click to see why';
    if (badge.title !== t) badge.title = t;
  }
  function words(j) {
    if (j.status === 'queued') { const n = R.place(jobs, j.id); return n > 1 ? `waiting · ${n} in line` : 'waiting · next'; }
    if (j.status === 'paused') return j.restart ? 'paused (starts again from the top on Resume)' : 'paused';
    if (j.status === 'starting') return 'starting';
    if (j.status === 'running' && j.kind === 'record') return j.label || 'recording';
    if (j.status === 'running') { const e = R.eta(j); return `${Math.round(j.pct)} %${e ? ` · ${R.fmtEta(e)}` : ''}${j.kind === 'record' && j.label ? ` · ${j.label}` : ''}`; }
    if (j.status === 'done') return `${j.size ? `${R.fmtSize(j.size)} · ` : ''}${j.seconds != null ? `${R.fmtSecs(j.seconds)} · ` : ''}${R.fmtAgo(j.ended)}`;
    if (j.status === 'failed') return j.error?.reason || 'failed';
    return 'cancelled';
  }

  // ---------- the list (a small panel next to the badge) ----------
  let pop = null; let popT = 0;
  function open({ tab = 'queue' } = {}) {
    if (pop) { pop._tab = tab; pop._keys = ''; paintPop(); return pop; }
    unseen = 0;
    mountBadge();
    pop = el('div', { class: 'rq-pop', role: 'dialog', 'aria-label': 'Renders' });
    pop._tab = tab;
    document.body.append(pop);
    const r = badge && !badge.hidden ? badge.getBoundingClientRect() : document.getElementById('rail')?.getBoundingClientRect();
    pop.style.left = `${Math.round((r?.right || 60) + 8)}px`;
    pop.style.bottom = `${Math.max(8, Math.round(innerHeight - (r && badge && !badge.hidden ? r.bottom : innerHeight - 8)))}px`;
    pop._keys = '';
    paintPop();
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escKey, true); }, 0);
    loop();
    paintBadge();
    return pop;
  }
  function close() { pop?.remove(); pop = null; clearTimeout(popT); popT = 0; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escKey, true); }
  const outside = (e) => { if (pop && !pop.contains(e.target) && !badge?.contains(e.target) && !e.target.closest?.('#menu, #menu-fly, dialog')) close(); };
  const escKey = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } };
  // while open, visible and something runs: twice a second (the numbers and time left); parked otherwise
  function loop() {
    clearTimeout(popT); popT = 0;
    if (!pop || document.hidden || !jobs.some((j) => j.status === 'running' || j.status === 'starting')) return;
    popT = setTimeout(() => { paintPop(); loop(); }, 500);
  }
  function rowOf(j, hist = false) {
    const fill = el('i');
    const mk = j.make ? el('span', { class: 'rq-mk', text: j.make.glyph || '■', title: `${j.make.name}`, style: { color: j.make.color || '' } }) : null;
    const quick = [];
    if (!hist && (j.status === 'running' || j.status === 'starting')) quick.push(['❚❚', 'Pause', () => pause(j.id)]);
    if (!hist && j.status === 'paused') quick.push(['▶', 'Resume', () => resume(j.id)]);
    if (!hist && live(j)) quick.push(['■', 'Cancel', () => cancel(j.id)]);
    if (j.status === 'failed' && j.again) quick.push(['↻', 'Retry', () => retry(j.id)]);
    if (j.status === 'done' && j.output && !j.trashed) quick.push(['↗', 'Open', () => window.hub.fs.open(j.output)]);
    const row = el('div', { class: `rq-row rq-${j.status}${j.trashed ? ' rq-trashed' : ''}`, dataset: { rq: j.id }, title: `${j.title}${j.output ? `\n${j.output}` : ''}\nRight-click: more` },
      el('div', { class: 'rq-row-head' }, el('span', { class: 'rq-ic', text: R.ICON[j.status] || '·' }), mk, el('b', { class: 'rq-t', text: j.status === 'done' && j.output ? R.base(j.output) : j.title }), el('span', { class: 'rq-w' }),
        ...quick.map(([t, title, fn]) => el('button', { type: 'button', class: 'ghost small rq-q', text: t, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn()).catch((err) => toast(err.message, { type: 'error' })); } } })),
        el('button', { type: 'button', class: 'ghost small rq-q', text: '⋯', title: 'More', on: { click: (e) => { e.stopPropagation(); const rr = e.currentTarget.getBoundingClientRect(); showMenu(rr.left, rr.bottom + 2, menuFor(j)); } } })),
      live(j) ? el('div', { class: 'pg-bar pg-anim rq-bar' }, fill) : null,
      j.status === 'failed' && j.error ? el('div', { class: 'rq-fix', text: `Fix: ${j.error.fix}` }) : null);
    row._fill = fill;
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuFor(j)); });
    return row;
  }
  function paintPop() {
    if (!pop) return;
    const hist = pop._tab === 'history';
    const list = hist ? history.slice(0, 60) : [...jobs.filter(live), ...jobs.filter((j) => !live(j)).reverse().slice(0, 8)];
    const keys = `${pop._tab}|${list.map((j) => `${j.id}:${j.status}:${j.trashed ? 't' : ''}`).join(',')}`;
    if (keys !== pop._keys) {
      pop._keys = keys;
      const head = el('div', { class: 'rq-head' },
        el('button', { type: 'button', class: `rq-tab${hist ? '' : ' on'}`, text: 'Renders', on: { click: () => { pop._tab = 'queue'; pop._keys = ''; paintPop(); } } }),
        el('button', { type: 'button', class: `rq-tab${hist ? ' on' : ''}`, text: `History${history.length ? ` (${history.length})` : ''}`, on: { click: () => { pop._tab = 'history'; pop._keys = ''; paintPop(); } } }),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'primary small rq-new', text: '⇪ Render…', title: 'Render with a preset (Reels / TikTok / Shorts, YouTube, Square, Story, GIF, WebM, ProRes, audio)', on: { click: () => { close(); panel(); } } }),
        el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More', on: { click: (e) => { const rr = e.currentTarget.getBoundingClientRect(); showMenu(rr.left, rr.bottom + 2, quickMenu()); } } }));
      const empty = el('div', { class: 'rq-empty', text: hist ? 'Nothing rendered yet: your renders, exports and recordings land here.' : 'Nothing renders right now. ⇪ Render… picks a preset; exports, Lab sequence renders and recordings show here by themselves.' });
      pop.replaceChildren(head, ...(list.length ? list.map((j) => rowOf(j, hist)) : [empty]));
    }
    for (const row of pop.querySelectorAll('.rq-row')) {
      const j = hist ? history.find((x) => x.id === row.dataset.rq) : find(row.dataset.rq);
      if (!j) continue;
      const w = hist ? `${R.fmtAgo(j.ended || 0)}${j.size ? ` · ${R.fmtSize(j.size)}` : ''}${j.trashed ? ' · in the Trash' : ''}${j.status === 'failed' ? ` · ${j.error?.reason || 'failed'}` : ''}` : words(j);
      const wn = row.querySelector('.rq-w');
      if (wn.textContent !== w) wn.textContent = w;
      if (row._fill.isConnected) { const f = Math.round(Math.max(0.02, (j.pct || 0) / 100) * 1000) / 1000; if (row._f !== f) { row._fill.style.transform = `scaleX(${f})`; row._f = f; } }
    }
  }
  function paint() { paintBadge(); paintPop(); loop(); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });

  function quickMenu() {
    const act = jobs.filter(live);
    return [
      { label: '⇪ Render with a preset…', action: () => panel() },
      { label: 'Render for all socials', hint: '9:16 · 4:5 · 1:1 · 16:9', action: () => panel({ presets: R.SOCIALS.slice(), go: false }) },
      { label: 'The queue', action: () => open() },
      { label: 'History', action: () => open({ tab: 'history' }) },
      act.some((j) => j.status !== 'paused') ? { label: '❚❚ Pause all', action: () => act.forEach((j) => pause(j.id)) } : null,
      act.some((j) => j.status === 'paused') ? { label: '▶ Resume all', action: () => act.forEach((j) => resume(j.id)) } : null,
      act.length ? { label: '■ Cancel all', action: () => act.forEach((j) => cancel(j.id)) } : null,
      { label: `Renders at once: ${limits().ffmpeg}`, more: true, items: [1, 2, 3].map((n) => ({ label: `${n}${n === 1 ? ' (smoothest)' : ''}`, checked: limits().ffmpeg === n, action: () => { store.set('renders.parallel', n); pump(); } })) },
      { label: 'Clear finished', more: true, action: () => clear() },
    ];
  }

  // ---------- the one place to pick presets ----------
  // o = { source: 'video' | 'seq' | <path>, presets: [ids], go: true (start at once with remembered choices) }
  function sources() {
    const S = [];
    const cur = typeof Review !== 'undefined' ? Review.current : null;
    if (cur?.path) S.push({ id: 'video', label: `🎬 ${R.base(cur.path)}`, hint: 'the video open in Video Review', path: cur.path });
    if (typeof ThreeSeq !== 'undefined' && (ThreeSeq.key || ThreeSeq.edit)) S.push({ id: 'seq', label: `▤ ${(ThreeSeq.key || 'seq:sequence').slice(4)}`, hint: 'the Lab sequence (rendered frame by frame)', key: ThreeSeq.key });
    return S;
  }
  const lastChoices = () => ({ presets: ['vertical'], fps: 0, quality: 'high', size: 'full', fit: 'crop', sound: true, open: false, source: null, ...store.get('renders.last', {}) });
  async function panel(o = {}) {
    const last = lastChoices();
    const src = sources();
    const st = { ...last, presets: new Set((o.presets || last.presets || ['vertical']).filter((id) => R.get(id))), source: o.source || (src.some((x) => x.id === last.source) ? last.source : src[0]?.id || null), file: o.file || null };
    if (!st.presets.size) st.presets.add('vertical');
    if (o.go) return go(st, src);
    const dlg = el('dialog', { class: 'ui-modal rq-dialog' });
    const body = el('div', { class: 'rq-d-body' });
    const goBtn = el('button', { type: 'button', class: 'primary', text: '⇪ Render' });
    const chip = (on, text, title, click, extra = '') => el('button', { type: 'button', class: `sq-chip rq-chip${on ? ' on' : ''}${extra}`, text, title, on: { click } });
    let details = Boolean(o.details);
    function paintD() {
      const groups = [...new Set(R.PRESETS.map((p) => p.group))];
      const allSoc = R.SOCIALS.every((id) => st.presets.has(id));
      const srcRow = el('div', { class: 'sq-chips' }, ...src.map((s) => chip(st.source === s.id, s.label, s.hint, () => { st.source = s.id; paintD(); })),
        chip(st.source === 'file', st.file ? `📄 ${R.base(st.file)}` : '📄 A file…', 'Pick a video file', async () => { const ps = await window.hub.openDialog({ title: 'Render a video file', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'gif'] }] }); if (ps?.[0]) { st.file = ps[0]; st.source = 'file'; } paintD(); }));
      const presetRows = groups.map((g) => el('div', { class: 'rq-d-row' }, el('b', { text: g }), el('div', { class: 'sq-chips' },
        ...(g === 'Socials' ? [chip(allSoc, '✦ All socials', 'Reels / TikTok / Shorts 9:16 · Feed 4:5 · Square · YouTube 16:9, one after the other', () => { if (allSoc) R.SOCIALS.forEach((id) => st.presets.delete(id)); else R.SOCIALS.forEach((id) => st.presets.add(id)); if (!st.presets.size) st.presets.add('vertical'); paintD(); }, ' rq-all')] : []),
        ...R.PRESETS.filter((p) => p.group === g).map((p) => chip(st.presets.has(p.id), `${p.name}`, `${p.short} · ${p.tip}`, () => { if (st.presets.has(p.id) && st.presets.size > 1) st.presets.delete(p.id); else st.presets.add(p.id); paintD(); })))));
      const det = details ? el('div', { class: 'rq-d-details' },
        el('div', { class: 'rq-d-row' }, el('b', { text: 'Frame rate' }), el('div', { class: 'sq-chips' }, ...R.FPS.map((f) => chip(st.fps === f, f ? `${f} fps` : 'Preset\'s', f ? '' : 'each preset\'s own (YouTube, WebM, ProRes: the source\'s)', () => { st.fps = f; paintD(); })))),
        el('div', { class: 'rq-d-row' }, el('b', { text: 'Quality' }), el('div', { class: 'sq-chips' }, ...Object.entries(R.QUALITY).map(([k, q]) => chip(st.quality === k, q.label, q.hint, () => { st.quality = k; paintD(); })))),
        el('div', { class: 'rq-d-row' }, el('b', { text: 'Size' }), el('div', { class: 'sq-chips' }, ...Object.entries(R.SIZES).map(([k, s]) => chip(st.size === k, s.label, '', () => { st.size = k; paintD(); })))),
        st.source !== 'seq' ? el('div', { class: 'rq-d-row' }, el('b', { text: 'Reshape' }), el('div', { class: 'sq-chips' }, ...[['crop', 'Crop to fill'], ['blur', 'Blurred fill'], ['fit', 'Fit (bars)']].map(([k, l]) => chip(st.fit === k, l, 'when the preset\'s shape differs from the source\'s', () => { st.fit = k; paintD(); })))) : null,
        st.source === 'seq' ? el('label', { class: 'sq-rp-check' }, el('input', { type: 'checkbox', checked: st.sound, on: { change: (e) => { st.sound = e.target.checked; } } }), ' With the sound') : null)
        : null;
      const n = st.presets.size;
      body.replaceChildren(
        el('div', { class: 'rq-d-row' }, el('b', { text: 'What' }), srcRow),
        ...presetRows,
        el('button', { type: 'button', class: 'ghost small rq-d-more', text: details ? 'Fewer details ‹' : 'Frame rate, quality, size ›', on: { click: () => { details = !details; paintD(); } } }),
        det,
        el('label', { class: 'sq-rp-check' }, el('input', { type: 'checkbox', checked: st.open, on: { change: (e) => { st.open = e.target.checked; } } }), ' Open in Video Review when it\'s done'),
        el('div', { class: 'rq-d-sum', text: `${n > 1 ? `${n} files, one after the other` : R.get([...st.presets][0]).tip} · they render in the background (⇪ at the bottom of the rail)` }));
      goBtn.disabled = !st.source || (st.source === 'file' && !st.file);
      goBtn.textContent = n > 1 ? `⇪ Render ${n}` : `⇪ Render ${R.get([...st.presets][0]).name}`;
    }
    dlg.append(el('h3', { text: 'Render' }), body, el('div', { class: 'modal-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => dlg.close() } }), goBtn));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    paintD();
    dlg.showModal();
    goBtn.addEventListener('click', () => { dlg.close(); go(st, src).catch((err) => toast(err.message, { type: 'error' })); });
    return dlg;
  }
  async function go(st, src = sources()) {
    const ids = [...st.presets];
    store.set('renders.last', { presets: ids, fps: st.fps, quality: st.quality, size: st.size, fit: st.fit, sound: st.sound, open: st.open, source: st.source === 'file' ? null : st.source });
    const opts = { fps: st.fps, quality: st.quality, size: st.size, fit: st.fit, sound: st.sound };
    const made = [];
    if (st.source === 'seq') {
      const s = src.find((x) => x.id === 'seq');
      if (!s) throw new Error('No Lab sequence to render (open ▤ Sequence in the Lab first).');
      for (const id of ids) made.push(enqueueSeq({ key: s.key, preset: id, opts, open: st.open && id === ids[ids.length - 1] }));
    } else {
      const path = st.source === 'file' ? st.file : (st.path || src.find((x) => x.id === st.source)?.path);
      if (!path) throw new Error('Open a video first (Video Review), or pick a file.');
      for (const id of ids) made.push(enqueue({ input: path, preset: id, opts, open: st.open && id === ids[ids.length - 1] }));
    }
    toast(`⇪ ${made.length === 1 ? made[0].title : `${made.length} renders`} in the queue`, { timeout: 2600, action: { label: 'Show', fn: () => open() } });
    return made;
  }

  // ---------- after a restart: renders that were waiting ----------
  async function offerPending() {
    await ready;
    const p = pendingBoot.filter((x) => x.again && x.again.type !== 'cmd'); pendingBoot = [];
    if (!p.length) return;
    noteNode(`${p.length} render${p.length === 1 ? ' was' : 's were'} waiting when Hearth closed`, 'rq-done', [{ label: 'Render them', fn: () => p.forEach((x) => retry0(x)) }, { label: 'Forget', fn: () => saveSoon() }]);
  }
  function retry0(x) { history = R.remember(history, { ...x, status: 'cancelled', ended: now() }); return retry(x.id).catch((err) => toast(err.message, { type: 'error' })); }

  // ---------- wiring ----------
  function boot() {
    window.hub.video?.onJob?.(onJob);
    if (typeof Progress !== 'undefined') Progress.on(onProgress);
    document.addEventListener('hearth:recording', onRecording);
    if (typeof AppUI !== 'undefined' && AppUI.addAction) {
      AppUI.addAction('Renders: the render queue', () => open());
      AppUI.addAction('Render with a preset (Reels, YouTube, GIF, ProRes…)', () => panel());
      AppUI.addAction('Render for all socials', () => panel({ presets: R.SOCIALS.slice() }));
    }
    if (typeof Keys !== 'undefined') Keys.add({ area: 'Renders', keys: 'Right-click ⇪ (bottom of the rail)', what: 'render with a preset, all socials, pause / resume / cancel all' }, { area: 'Renders', keys: 'Right-click a render', what: 'open, reveal, copy path, Video Review, re-render, Trash' });
    setTimeout(offerPending, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  return {
    transcode, track, enqueue, enqueueSeq, start: pump, pause, resume, cancel, retry, trash, forget, clear, open, close, panel, go, sources,
    owns: (id) => Boolean(find(id) && !find(id).external), list: () => jobs.slice(), history: () => history.slice(), get: (id) => find(id) || history.find((x) => x.id === id) || null,
    words, actionsFor, menuFor, onChange, limits, ready, core: R, get platform() { return PLAT; }, _test: { onJob, paint, unseen: () => unseen },
  };
})();
window.Renders = Renders;
