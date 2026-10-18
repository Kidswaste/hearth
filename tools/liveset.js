// (round 64, liveset64) Live set for an open mic: the owner's "Go to an open mic" quest, made playable. A performance view
// over Codex's Sound desk (Creative Playground → Serum 2 / Vital), opened by one 🎤 Live set button in the desk's top row
// (beside 🌳 Park mode, through parkjam62's attach hook), /liveset from any chat, or Ctrl/⌘+K.
//   Build: a short set of songs; each song has clip pads (park takes as loops, a loopsong63 arrangement as its mixdown)
//   and preset pads (Sound-bank / desk-bank presets for the open instrument), a tempo and a time signature.
//   Perform: big pads; clips launch / stop on the next BAR, presets switch on the next BEAT — both carried out by the
//   instrument host's audio thread at an exact sample (creative-vst-liveset.py), so a busy window can't make them late.
//   The next preset is preloaded in a second instance of the synth: no gap. One knob per pad (a filter). Tempo and a bar
//   counter drawn from the host's own position. Panic: everything fades out in 300 ms. The controller plays the synth
//   straight in the host (vstlive61), over the loops.
//   Rehearse / Perform record the whole run (instrument + clips) in the host to a WAV in <data>/creative-live/<set>/, with
//   a log of what was launched on which bar; a run is offered as proof to "Go to an open mic" (Codex's proof contract;
//   the review stays the owner's choice).
//   Stage: hides everything else (the view is lifted to the top of the page, the rest of Hearth is hidden and its
//   background timers hushed); never a modal over the pads; every action has a key (keyboard-only works); the keys go to
//   the set even if something else grabs focus while on stage.
// Idle cost: nothing until the view opens; while it is open but nothing was pressed, nothing polls; while performing,
// one status request every 250 ms and the beat cursor on the compositor (el.animate). Pure parts: tools/liveset-core.js.
const LiveSet = (() => {
  const C = LiveSetCore, P = ParkJamCore, A = () => WorkbenchVST.api, wait = ms => new Promise(r => setTimeout(r, ms));
  const KL = k => (typeof WinMac !== 'undefined' ? WinMac.keyLabel(k) : k);
  let h = null, view = null, home = null, mode = 'play', sceneIx = 0, sel = 0, armed = false, arming = null, poll = null, status = null, statusAt = 0;
  let nextAsk = 0, stage = false, hushed = false, running = null, lastRun = null, busy = '', pendingTempo = null, preloading = null, cursorAnim = null, cursorKey = '', said = '';
  const local = {}; // pad id → state the window expects until the host says otherwise ('queued' / 'stopping' / 'loading')
  const checked = new WeakSet();

  // ---------- the set (kept in the Sound desk's project: state.liveset) ----------
  function set() {
    if (!h?.state) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (!h.state.liveset || h.state.liveset.v !== 1) h.state.liveset = C.create({ instrument: A().current()?.name || A().instruments?.()[0] || 'Vital' });
    else if (!checked.has(h.state.liveset)) h.state.liveset = C.validate(h.state.liveset);
    checked.add(h.state.liveset); return h.state.liveset;
  }
  const scene = () => { const s = set(); sceneIx = Math.max(0, Math.min(sceneIx, s.scenes.length - 1)); return s.scenes[sceneIx]; };
  const save = () => h.persist();
  const say = t => { said = t; const o = view?.querySelector('.lv-said'); if (o && o.textContent !== t) o.textContent = t; return t; };

  // ---------- the desk and the host ----------
  async function desk() { await ParkJam.desk(); h = ParkJam.helpers() || h; if (!h) throw Error('Open Creative Playground → Serum 2 / Vital first.'); }
  async function req(action, extra = {}) {
    const c = A().current(); if (!c) throw Error(`Open ${set().instrument} in the Sound desk first.`);
    const r = await hub.vst.request({ action, plugin: c.path, name: c.name, ...extra }); if (!r.ok) throw Error(r.error); return r;
  }
  function fire(action, extra = {}) { // a pad press: one message on the host's no-reply socket (vstlive61), no wait
    const c = A().current(); if (!c) return;
    if (hub.vst.send) hub.vst.send({ action, plugin: c.path, name: c.name, ...extra }); else req(action, extra).catch(err => say(err.message));
  }
  async function arm() {
    if (armed) return; if (arming) return arming;
    arming = (async () => {
      const s = set(), want = s.instrument;
      if (A().current()?.name !== want) { if (!A().instruments().includes(want)) throw Error(`${want} isn't in the Sound desk.`); say(`Opening ${want}…`); await A().open(want, { live: true }); }
      for (let i = 0; i < 600 && !(A().current()?.name === want && A().current()?.ready); i++) await wait(50);
      if (!A().current()?.ready) throw Error(`${want} is still reading its controls; try again in a moment.`);
      if (!A().current().live) await A().start();
      const sc = scene(); await req('set-open', { bpm: sc.bpm, beats: sc.beats, quantize: s.quantize });
      let n = 0; for (const x of s.scenes) for (const p of C.clips(x)) { say(`Loading clips… ${++n}`); await prepare(p, x); await load(p); }
      armed = true; startPoll(); say(n ? `Ready: ${n} clip${n === 1 ? '' : 's'} loaded in the host.` : 'Ready.');
      preloadNext();
    })();
    try { return await arming; } finally { arming = null; }
  }
  const load = p => req('clip-load', { slot: p.id, file: p.file, loop: p.loop, gainDb: p.gainDb, fx: p.fx });

  // ---------- clips: a take fitted to the song's tempo, a song's mixdown ----------
  async function readWav(file) { const b = await hub.fs.read(file, { encoding: 'buffer', maxBytes: 200 * 1048576 }).then(x => new Uint8Array(x)).catch(() => null); if (!b?.length) throw Error(`A clip's file is gone: ${String(file).split(/[\\/]/).pop()}`); return P.decodeWav(b); }
  async function put(name, bytes) { const r = await hub.liveset.save(set().name, name, bytes); if (!r?.ok) throw Error(r?.error || 'Could not save ' + name); return r.path; }
  async function prepare(p, s) {
    if (!C.needsPrepare(p, s) || p.source?.type === 'song') { if (!p.file) throw Error(`${p.label} has no audio yet.`); return p; }
    const f = C.fit(p.source, s);
    if (!f.stretch) { p.file = p.source.file; p.prepared = { bpm: s.bpm, ratio: 1, warn: f.warn }; await save(); return p; }
    say(`Fitting ${p.label} to ${Math.round(s.bpm)} BPM…`); await wait(0);
    const pcm = LoopSongCore.prepare(await readWav(p.source.file), { rate: 48000, ratio: f.ratio }), len = C.loopFrames(p.bars, s, pcm.rate);
    const channels = pcm.channels.map(ch => { const o = new Float32Array(len); o.set(ch.subarray(0, len)); return o; });
    p.file = await put(`clip ${p.id}.wav`, P.encodeWav({ rate: pcm.rate, channels })); p.prepared = { bpm: s.bpm, ratio: f.ratio, warn: '' }; await save(); return p;
  }
  async function songMix() { // the loopsong63 arrangement in the desk, mixed down at −1 dBFS (its own sources, stretched as it plays them)
    const S = LoopSongCore, raw = h.state.song, song = raw?.v === 1 ? S.validate(raw) : null;
    if (!song || !S.schedule(song).length) throw Error('Arrange a song first (Park jam → Arrange, or /song).');
    const src = {};
    for (const c of song.clips) { const so = S.sourceOf(song, c); if (!so) continue; say(`Mixing “${song.title}”…`); src[c.id] = S.prepare(await readWav(so.file), { rate: song.rate, ratio: so.ratio }); await wait(0); }
    const r = S.normalize(S.render(song, src), -1);
    return { song, rate: r.rate, channels: r.mix, seconds: r.length / r.rate };
  }

  // ---------- adding to the set ----------
  async function takes() { const r = await hub.parkSong?.list?.().catch(() => null), seen = new Set(), out = []; for (const t of [...(h?.state?.park?.takes || []), ...(r?.takes || [])]) if (t.loop && !seen.has(t.loop)) { seen.add(t.loop); out.push(t); } return out; }
  async function presetList() {
    const want = set().instrument, out = (h.state.presets || []).filter(p => p.name === want).map(p => ({ label: p.label, from: 'bank', instrument: want }));
    try { const r = await hub.soundbank?.list?.({}); for (const x of r?.entries || []) if (x.instrument === want && x.source !== 'bank' && !out.some(o => o.label === x.name)) out.push({ label: x.name, id: x.id, from: 'soundbank', instrument: want }); } catch { /* the Sound bank isn't there: the desk's bank only */ }
    return out;
  }
  async function addTake(t) { const s = scene(), p = C.addPad(set(), sceneIx, { kind: 'clip', label: `${t.place || 'Park'} ${t.bars} bar${t.bars === 1 ? '' : 's'}`, loop: true, bars: t.bars, source: { type: 'take', file: t.loop, bpm: t.bpm, sketch: t.sketch, place: t.place } }); if (!C.clips(s).some(x => x !== p)) { /* the first take sets the song's tempo */ s.bpm = t.bpm; s.beats = t.beats || 4; } await prepare(p, s); if (armed) await load(p); await save(); draw(); return p; }
  async function addSong() {
    const m = await songMix(); let s = scene();
    if (s.pads.length) { s = C.addScene(set(), { name: m.song.title }); sceneIx = set().scenes.length - 1; }
    Object.assign(s, { name: m.song.title.slice(0, 60), bpm: m.song.bpm || s.bpm, beats: m.song.beats || 4 });
    const p = C.addPad(set(), sceneIx, { kind: 'clip', label: m.song.title, loop: false, bars: LoopSongCore.bars(m.song), source: { type: 'song', bpm: m.song.bpm, sketch: m.song.sketch } });
    p.file = await put(`song ${p.id}.wav`, P.encodeWav({ rate: m.rate, channels: m.channels })); p.prepared = { bpm: s.bpm, ratio: 1, warn: '' };
    if (armed) await load(p); await save(); draw(); return p;
  }
  async function addPreset(x) { const p = C.addPad(set(), sceneIx, { kind: 'preset', label: x.label, instrument: x.instrument, preset: { label: x.label, id: x.id || null, from: x.from } }); await save(); draw(); if (armed) preloadNext(); return p; }
  async function stateOf(p) {
    if (p.preset.from === 'soundbank' && p.preset.id) { const r = await hub.soundbank.state(p.preset.id); if (!r?.ok) throw Error(r?.error || `Could not read “${p.label}”.`); return r.state; }
    const b = (h.state.presets || []).find(x => x.name === set().instrument && x.label === p.preset.label); if (!b) throw Error(`“${p.label}” is no longer in the desk's bank.`); return b.state;
  }

  // ---------- performing ----------
  function padState(p) {
    if (p.kind === 'preset') { if (status?.current === p.id) return 'playing'; if (local[p.id] === 'loading' || status?.switch?.id === p.id) return 'queued'; return status?.twin === p.id && !status?.preloading ? 'ready' : 'stopped'; }
    const st = status?.pads?.[p.id]?.state || 'stopped'; return local[p.id] && local[p.id] !== st && !(local[p.id] === 'queued' && st === 'playing') ? local[p.id] : st;
  }
  async function press(p) {
    sel = scene().pads.indexOf(p); await arm();
    if (p.kind === 'clip') {
      const st = padState(p); local[p.id] = st === 'playing' || st === 'queued' ? (st === 'queued' ? 'stopped' : 'stopping') : 'queued';
      fire('launch', { slot: p.id, mode: 'toggle', at: set().quantize }); paint(); return `${p.label}: ${local[p.id] === 'queued' ? 'starts on the next bar' : local[p.id] === 'stopping' ? 'stops on the next bar' : 'cancelled'}.`;
    }
    return switchTo(p);
  }
  async function switchTo(p) {
    if (status?.current === p.id) return `${p.label} is already playing.`;
    local[p.id] = 'loading'; paint();
    try {
      if (preloading) await preloading.catch(() => {});
      if (status?.twin !== p.id) { say(`Loading ${p.label}…`); await preload(p); }
      // the twin may have moved on since the last status: preload it then, and switch on the first beat after
      const r = await req('preset-switch', { id: p.id, at: 'beat', fx: p.fx }).catch(async err => { if (!/not preloaded/.test(err.message)) throw err; await preload(p); return req('preset-switch', { id: p.id, at: 'beat', fx: p.fx }); });
      say(`${p.label} on bar ${r.bar}, beat ${r.beat}.`); return `${p.label}: switches on the next beat (bar ${r.bar}.${r.beat}).`;
    } finally { delete local[p.id]; paint(); }
  }
  async function preload(p) { preloading = (async () => { const r = await req('preset-preload', { id: p.id, state: await stateOf(p) }); status = status ? { ...status, twin: p.id, preloading: false, twinLoadMs: r.loadMs } : status; return r; })(); try { return await preloading; } finally { preloading = null; } }
  function preloadNext() {
    const next = C.nextPreset(set(), sceneIx, status?.current); if (!next || !armed || preloading || status?.twin === next.id || status?.switch) return;
    preload(next).then(() => paint()).catch(err => say(`Couldn't preload ${next.label}: ${err.message}`));
  }
  function playing() { return Object.values(status?.pads || {}).some(x => x.state === 'playing' || x.state === 'queued' || x.state === 'stopping'); }
  function sceneLaunch() { const s = scene(), stopped = C.clips(s).filter(p => !['playing', 'queued'].includes(padState(p))); for (const p of stopped) { local[p.id] = 'queued'; fire('launch', { slot: p.id, mode: 'play', at: set().quantize }); } paint(); return stopped.length ? `${s.name}: ${stopped.length} clip${stopped.length === 1 ? '' : 's'} start on the next bar.` : 'Every clip of this song is already playing.'; }
  function stopAll() { let n = 0; for (const [slot, x] of Object.entries(status?.pads || {})) if (x.state === 'playing' || x.state === 'queued') { local[slot] = x.state === 'queued' ? 'stopped' : 'stopping'; fire('launch', { slot, mode: 'stop', at: set().quantize }); n++; } paint(); return n ? 'Clips stop on the next bar.' : 'Nothing is playing.'; }
  function panic() { if (!A().current()) return 'Nothing is playing.'; fire('set-panic', { fade: 0.3 }); for (const k of Object.keys(local)) delete local[k]; flash('lv-panicked'); return say('Panic: everything fades out (300 ms). Press a pad to start again on the bar.'); }
  function knob(p, v) {
    p.fx = Math.max(-1, Math.min(1, Math.round(v * 20) / 20));
    if (armed) { if (p.kind === 'clip') fire('pad-fx', { slot: p.id, fx: p.fx }); else if (status?.current === p.id) fire('pad-fx', { slot: 'synth', fx: p.fx }); }
    const k = view?.querySelector(`.lv-pad[data-pad="${p.id}"] .lv-knob`); if (k && Number(k.value) !== p.fx) k.value = String(p.fx);
    const o = view?.querySelector(`.lv-pad[data-pad="${p.id}"] .lv-fx`), t = C.fxLabel(p.fx); if (o && o.textContent !== t) o.textContent = t;
    clearTimeout(knob.t); knob.t = setTimeout(() => save(), 400); return t;
  }
  async function tempo(bpm) {
    const s = scene(), v = Math.max(40, Math.min(240, Math.round(bpm * 10) / 10));
    if (playing()) throw Error(`Stop the loops first: they're fitted to ${Math.round(s.bpm)} BPM.`);
    s.bpm = v; for (const p of C.clips(s)) if (p.source?.type === 'take') { await prepare(p, s); if (armed) await load(p); }
    if (armed) await req('set-tempo', { bpm: v }); await save(); draw(); return `${s.name}: ${v} BPM.`;
  }
  async function go(by) {
    const s = set(); sceneIx = (sceneIx + by + s.scenes.length) % s.scenes.length; sel = 0; const sc = scene();
    if (armed && status && Math.abs(status.bpm - sc.bpm) > 1e-6) { if (playing()) pendingTempo = sc.bpm; else { pendingTempo = null; await req('set-tempo', { bpm: sc.bpm }); } }
    draw(); if (armed) preloadNext(); return `${sc.name} (${sceneIx + 1}/${s.scenes.length}) · ${Math.round(sc.bpm)} BPM${pendingTempo ? ' · the tempo follows when the loops stop' : ''}.`;
  }

  // ---------- Rehearse / Perform: the whole run recorded in the host ----------
  async function startRun(kind = 'Rehearsal') {
    if (running) throw Error(`Already recording a ${running.toLowerCase()}.`);
    await arm(); await req('run-record', { set: set().name, kind }); running = kind; draw();
    return say(`● ${kind} recording: the whole run (synth + clips). ${KL('Ctrl+Enter')} ${kind === 'Performance' ? '(with Shift) ' : ''}stops it.`);
  }
  async function endRun() {
    if (!running) throw Error('Nothing is being recorded.');
    const r = await req('run-stop'); running = null;
    const labels = {}; for (const s of set().scenes) for (const p of s.pads) labels[p.id] = p.label;
    const run = { id: 'run-' + Date.now().toString(36), at: new Date().toISOString(), kind: r.kind, path: r.path, seconds: r.seconds, bars: r.bars, peak: r.peak, silent: r.silent, levels: r.levels, dropped: r.dropped, events: r.events, labels, underruns: status?.underruns ?? null, week: P.isoWeek() };
    run.log = await put(r.path.split(/[\\/]/).pop().replace(/\.wav$/i, ' log.json'), JSON.stringify({ v: 1, kind: 'live-set-run', set: { ...set(), runs: undefined }, run }, null, 1)).catch(() => null);
    const m = await hub.liveset.mp3(set().name, r.path).catch(err => ({ ok: false, error: err.message })); if (m?.ok) run.mp3 = m.path; else run.mp3Note = m?.error || '';
    const s = set(); s.runs.unshift(run); s.runs = s.runs.slice(0, C.MAX_RUNS); await save(); lastRun = run;
    try { document.dispatchEvent(new CustomEvent('hearth:quest-week', { detail: { kind: 'live-set', week: run.week, at: run.at, title: `${run.kind} of “${s.name}”: ${C.clock(run.seconds)}`, path: run.mp3 || run.path } })); } catch { /* a listener's problem never blocks the run */ }
    draw(); return say(`${C.runSummary(run)} · kept in “${s.name}”.${run.silent ? ' (It was silent: check the output.)' : ''} Offer it as open-mic proof when you like.`);
  }
  async function offer(id) {
    const s = set(), run = id ? s.runs.find(r => r.id === id) : s.runs[0]; if (!run) throw Error('Rehearse your set first (● Rehearse).');
    if (run.proof) return `Already offered for “${run.proof.step}”.`;
    if (stage) throw Error('After the show: turn the stage off first (\\), then offer the run.');
    let file = run.mp3, kind = 'audio/mpeg', bytes = file ? await hub.fs.read(file, { encoding: 'buffer', maxBytes: 80 * 1048576 }).then(b => new Uint8Array(b)).catch(() => null) : null;
    if (!bytes?.length) { file = run.path; kind = 'audio/wav'; bytes = await hub.fs.read(file, { encoding: 'buffer', maxBytes: 80 * 1048576 }).then(b => new Uint8Array(b)).catch(() => null); }
    if (!bytes?.length && run.log) { file = run.log; kind = 'application/json'; bytes = await hub.fs.read(file, { encoding: 'buffer', maxBytes: 8 * 1048576 }).then(b => new Uint8Array(b)).catch(() => null); }
    if (!bytes?.length) throw Error('The recording is gone (or over 80 MB with no ffmpeg for an MP3).');
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    await Lazy.load('questjournal'); await QuestParisUI.journal();
    const Q = QuestParis, QC = QuestCore, J = QuestJournal.paris, state = () => J.ui().state(), t = Q.findPersonal(C.OPENMIC);
    if (!t) throw Error('The open-mic quest is missing from this journal build.');
    if (!t.steps.some(x => x[0] === C.PLAY_STEP[0])) t.steps.push(C.PLAY_STEP.slice()); // (a journal build without the 4th step)
    const camp = await J.mutate(st => { const c = Q.startPersonal(st, C.OPENMIC); if (!c.quests.some(q => q.title === C.PLAY_STEP[0])) { const [title, done, tiny, minutes, xp] = C.PLAY_STEP, base = c.quests.at(-1); c.quests.push({ ...base, id: `q-${c.id.slice(2)}-${c.quests.length + 1}`, title, done, tiny, minutes, xp }); } return c; }, 'Go to an open mic is in your notebook.');
    const q = QC.next(state(), camp); if (!q) return `Your open-mic quest is already done ✓. The ${run.kind.toLowerCase()} stays in “${s.name}”.`;
    const ix = camp.quests.findIndex(x => x.id === q.id);
    if (!C.fits(ix, run.kind)) return `Your open-mic quest is at “${q.title}” first. The ${run.kind.toLowerCase()} is kept; offer it when you reach “${run.kind === 'Performance' ? camp.quests[1].title : camp.quests[2].title}”.`;
    const proof = QC.checkProof({ type: 'file', title: file.split(/[\\/]/).pop().slice(0, 200), path: await hub.importRef(file), kind, bytes: bytes.length, fingerprint, images: [], ...C.proofText(run, s) });
    const intent = `${run.kind === 'Performance' ? 'Played' : 'Rehearsed'} my live set “${s.name}” all the way through in Hearth: ${C.runSummary(run)}, ${s.instrument} played live on the controller over park loops and songs.`;
    const item = await J.mutate(st => QC.submit(st, q.id, proof, intent), `${run.kind} saved as proof. Ask for a review when you like.`);
    run.proof = { quest: q.id, step: q.title, submission: item.id, at: item.at }; await save();
    J.ui().questDetail(q.id); // the journal is on screen by now (QuestParisUI.journal), never over the pads
    paint(); return `${run.kind} offered as proof for “${q.title}” (Go to an open mic). Review it from the quest when you like (XP comes after the review, as always).`;
  }

  // ---------- the view ----------
  function button(helpers) { // 🎤 Live set, in the desk's top row (parkjam62's attach hook)
    h = helpers; const b = h.btn('🎤 Live set', () => open().then(say)); b.classList.add('lv-open');
    b.title = 'Perform a short set for an open mic: big pads, loops on the bar, presets on the beat, rehearse and record (/liveset)'; return b;
  }
  async function open() {
    await desk(); const host = document.querySelector('.wb-sound-desk'); if (!host) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (view?.isConnected) { view.focus({ preventScroll: true }); return said || 'Live set open.'; }
    set(); home = host; view = h.e('section', null, 'lv-view'); view.tabIndex = -1; view.setAttribute('role', 'region'); view.setAttribute('aria-label', 'Live set');
    host.append(view); document.documentElement.classList.add('liveset-open'); window.addEventListener('keydown', onKey, true); draw(); view.focus({ preventScroll: true }); view.scrollIntoView({ block: 'start' });
    const s = set(), n = s.scenes.reduce((k, x) => k + x.pads.length, 0);
    return say(n ? `“${s.name}”: ${s.scenes.length} song${s.scenes.length === 1 ? '' : 's'}, ${n} pads. Press a pad or a key to start (1–0 clips, Q–P presets).` : 'An empty set: ✎ Edit adds park takes, your arranged song and presets.');
  }
  function close() {
    if (!view) return; const v = view;
    if (running) endRun().catch(() => {}); if (stage) setStage(false);
    stopPoll(); cursorAnim?.cancel(); cursorAnim = null; cursorKey = ''; window.removeEventListener('keydown', onKey, true); document.documentElement.classList.remove('liveset-open');
    if (armed && A().current()) req('set-close').catch(() => {}); armed = false; status = null; view = null; v.remove(); mode = 'play';
  }
  function pause() { close(); } // the desk is leaving (ParkJam.pause): live audio stops with it, a run in progress is kept
  function setStage(on) {
    stage = !!on && !!view; const root = document.documentElement;
    if (stage) { document.body.append(view); root.classList.add('liveset-stage'); mode = 'play'; }
    else { root.classList.remove('liveset-stage'); if (view && home?.isConnected) home.append(view); }
    const W = window.Power; if (W?.hush) { if (stage && !hushed && !W.quietNow?.()) { W.hush(true, []); hushed = true; } else if (!stage && hushed) { W.hush(false); hushed = false; } }
    if (view) { draw(); view.focus({ preventScroll: true }); } return stage ? 'Stage on: everything else is hidden. \\ (backslash) brings it back.' : 'Stage off.';
  }
  function flash(cls) { if (!view) return; view.classList.remove(cls); void view.offsetWidth; view.classList.add(cls); setTimeout(() => view?.classList.remove(cls), 700); }
  const btnEl = (label, title, fn, cls = '') => { const b = h.btn(label, async () => { const t = await fn(); if (typeof t === 'string') say(t); }, cls); b.title = title; return b; };
  function draw() {
    if (!view) return; const s = set(), sc = scene(), e = h.e;
    view.classList.toggle('lv-stage', stage); view.classList.toggle('lv-editing', mode === 'edit');
    const head = e('div', null, 'lv-head');
    const nav = e('div', null, 'lv-scene'); nav.append(btnEl('‹', 'Previous song (↑)', () => go(-1), 'lv-mini'), e('strong', `${sc.name}`), e('span', `${sceneIx + 1}/${s.scenes.length}`, 'lv-dim'), btnEl('›', 'Next song (↓)', () => go(1), 'lv-mini'));
    const clock = e('div', null, 'lv-clock'); clock.append(e('span', `${Math.round(sc.bpm * 10) / 10} BPM · ${sc.beats}/4`, 'lv-tempo'), e('span', status ? C.counter(status, performance.now() - statusAt).text : 'Bar —', 'lv-bar'));
    const beats = e('div', null, 'lv-beats'); beats.style.setProperty('--beats', sc.beats); for (let i = 0; i < sc.beats; i++) beats.append(e('i')); beats.append(e('b', null, 'lv-cursor')); clock.append(beats);
    const rec = e('span', running ? `● ${running}` : '', 'lv-rec'); rec.hidden = !running;
    const tools = e('div', null, 'lv-tools');
    tools.append(btnEl(running === 'Rehearsal' ? '■ Stop rehearsal' : '● Rehearse', `Record the whole run to listen back (${KL('Ctrl+Enter')})`, () => running ? endRun() : startRun('Rehearsal'), 'lv-rehearse'),
      btnEl(running === 'Performance' ? '■ End show' : '★ Perform', `Record the show itself (${KL('Ctrl+Shift+Enter')})`, () => running ? endRun() : startRun('Performance'), 'lv-perform'),
      btnEl(stage ? '⛶ Stage on' : '⛶ Stage', 'Hide everything else (\\)', () => setStage(!stage), 'lv-stage-btn'),
      btnEl('■ Panic', 'Everything fades out in 300 ms (Esc)', () => panic(), 'lv-panic'));
    if (!stage) tools.append(btnEl(mode === 'edit' ? '✓ Done' : '✎ Edit', 'Songs, pads, tempo', () => { mode = mode === 'edit' ? 'play' : 'edit'; draw(); }), btnEl('✕', 'Close the live set (the set is kept)', () => { close(); return 'Live set closed (the set is kept).'; }, 'lv-mini lv-close'));
    head.append(e('span', s.name, 'lv-name'), nav, clock, rec, tools);
    const body = mode === 'edit' && !stage ? editor() : pads();
    const foot = e('div', null, 'lv-foot'); foot.append(e('output', said, 'lv-said'), e('span', statusLine(), 'lv-status'));
    const last = s.runs[0]; if (last && !stage) { const r = e('div', null, 'lv-run'); r.append(e('span', C.runSummary(last))); if (!last.proof) r.append(btnEl('Offer as open-mic proof', 'Submit this run to “Go to an open mic” (the review stays yours)', () => offer(last.id))); else r.append(e('span', `✓ Proof: ${last.proof.step}`, 'lv-dim')); r.append(btnEl('Show file', 'Show the recording', () => hub.fs.reveal(last.mp3 || last.path))); foot.append(r); }
    view.replaceChildren(head, body, foot); cursorKey = ''; paint();
  }
  function pads() {
    const e = h.e, sc = scene(), wrap = e('div', null, 'lv-grid');
    for (const [kind, list] of [['clip', C.clips(sc)], ['preset', C.presets(sc)]]) {
      if (!list.length) continue;
      const row = e('div', null, `lv-pads lv-${kind}s`);
      for (const p of list) {
        const cell = e('div', null, 'lv-pad'); cell.dataset.pad = p.id; cell.dataset.kind = kind;
        const b = e('button', null, 'lv-hit'); b.type = 'button'; b.setAttribute('aria-label', `${p.label} (key ${C.keyOf(sc, p).toUpperCase()})`);
        b.append(e('kbd', C.keyOf(sc, p).toUpperCase()), e('span', p.label, 'lv-label'), e('small', kind === 'clip' ? (p.loop ? `loop · ${p.bars} bar${p.bars === 1 ? '' : 's'}` : `one-shot · ${p.bars} bars`) : `preset · ${p.preset.from === 'soundbank' ? 'Sound bank' : 'bank'}`, 'lv-sub'), e('em', '', 'lv-state'));
        b.onclick = () => { sel = sc.pads.indexOf(p); press(p).then(say).catch(err => say(err.message)); };
        const k = e('input', null, 'lv-knob'); k.type = 'range'; k.min = '-1'; k.max = '1'; k.step = '0.05'; k.value = String(p.fx); k.setAttribute('aria-label', `${p.label}: filter`);
        k.oninput = () => knob(p, Number(k.value)); k.ondblclick = () => knob(p, 0);
        cell.append(b, k, e('span', C.fxLabel(p.fx), 'lv-fx')); row.append(cell);
      }
      wrap.append(row);
    }
    if (!sc.pads.length) wrap.append(stage ? e('p', 'No pads in this song.', 'wb-note') : btnEl('✎ Build this song: add park takes, your arranged song and presets', 'Opens the set editor (click or drag things in)', () => { mode = 'edit'; draw(); }, 'lv-build'));
    for (const p of C.clips(sc)) if (p.prepared?.warn) wrap.append(e('p', '⚠ ' + p.prepared.warn, 'wb-note lv-warn'));
    return wrap;
  }
  // Build the set by clicking or dragging: the park takes, the arranged song and the presets are chips (click ＋ or drag
  // one onto "This song's pads"); every pad has its own Loop / Remove buttons. No command needed for any of it.
  function editor() {
    const { e, row, field, select, btn } = h, s = set(), sc = scene(), box = e('div', null, 'lv-edit');
    box.append(row(field('Set name', s.name, v => { s.name = String(v).slice(0, 60) || s.name; save(); }), select('Launch clips on', s.quantize, [['bar', 'the next bar'], ['beat', 'the next beat'], ['now', 'right away']], v => { s.quantize = v; if (armed) req('set-open', { bpm: sc.bpm, beats: sc.beats, quantize: v }).catch(() => {}); })));
    box.append(row(field('Song name', sc.name, v => { sc.name = String(v).slice(0, 60) || sc.name; save(); draw(); }), field('Tempo (BPM)', sc.bpm, v => { const n = Number(v); if (n >= 40 && n <= 240) tempo(n).then(say).catch(err => say(err.message)); }, 'number'),
      select('Beats a bar', sc.beats, [2, 3, 4, 5, 6, 7].map(b => [b, `${b}/4`]), v => { sc.beats = Number(v); save(); }),
      btn('＋ New song', () => { C.addScene(s); sceneIx = s.scenes.length - 1; save(); draw(); }), ...(s.scenes.length > 1 ? [btn('Remove this song', () => { s.scenes.splice(sceneIx, 1); sceneIx = Math.max(0, sceneIx - 1); save(); draw(); })] : [])));
    // the library: chips to click or drag
    const lib = { take: [], song: [], preset: [] };
    const add = async (kind, item) => { if (kind === 'take') { const p = await addTake(item); return `${p.label} on key ${C.keyOf(scene(), p)}.`; } if (kind === 'song') { const p = await addSong(); return `“${p.label}” is a one-shot pad in its own song (${Math.round(scene().bpm)} BPM).`; } const p = await addPreset(item); return `${p.label} on key ${C.keyOf(scene(), p).toUpperCase()}.`; };
    // this song's pads: the drop target
    const target = e('div', null, 'lv-drop'); target.setAttribute('aria-label', 'This song’s pads (drop takes, the song or presets here)');
    target.append(e('strong', 'This song’s pads'), e('span', ' · drop a take, your song or a preset here, or click its ＋', 'lv-dim'));
    for (const p of sc.pads) {
      const r = e('div', null, 'wb-row lv-padrow'); r.dataset.pad = p.id; r.append(e('kbd', C.keyOf(sc, p).toUpperCase()), e('span', `${p.label} · ${p.kind === 'clip' ? (p.loop ? 'loop' : 'one-shot') : 'preset'}`));
      if (p.kind === 'clip') r.append(btn(p.loop ? 'Loop ✓' : 'One-shot', async () => { p.loop = !p.loop; await save(); if (armed) await load(p); draw(); }));
      r.append(btn('Remove', async () => { C.removePad(s, sceneIx, p.id); if (armed && p.kind === 'clip') req('clip-unload', { slot: p.id }).catch(() => {}); await save(); draw(); })); target.append(r);
    }
    if (!sc.pads.length) target.append(e('p', 'Empty: add a few loops and the presets you will switch between.', 'wb-note'));
    target.addEventListener('dragover', ev => { if (ev.dataTransfer?.types.includes('application/x-hearth-liveset')) { ev.preventDefault(); target.classList.add('lv-over'); } });
    target.addEventListener('dragleave', () => target.classList.remove('lv-over'));
    target.addEventListener('drop', ev => { target.classList.remove('lv-over'); const raw = ev.dataTransfer?.getData('application/x-hearth-liveset'); if (!raw) return; ev.preventDefault(); const x = JSON.parse(raw), item = lib[x.kind]?.[x.i]; if (item) add(x.kind, item).then(say).catch(err => say(err.message)); });
    const chip = (kind, i, label, title) => {
      const c = e('button', null, 'lv-chip'); c.type = 'button'; c.draggable = true; c.title = title; c.append(e('span', '＋', 'lv-plus'), e('span', label)); c.setAttribute('aria-label', `Add ${label}`); c.dataset.kind = kind;
      c.onclick = async () => { c.disabled = true; try { say(await add(kind, lib[kind][i])); } catch (err) { say(err.message); } finally { c.disabled = false; } };
      c.addEventListener('dragstart', ev => { ev.dataTransfer.setData('application/x-hearth-liveset', JSON.stringify({ kind, i })); ev.dataTransfer.effectAllowed = 'copy'; }); return c;
    };
    const shelf = (title, cls) => { const w = e('div', null, `lv-shelf ${cls}`), list = e('div', null, 'lv-chips'); list.append(e('span', 'Loading…', 'lv-dim')); w.append(e('strong', title), list); return [w, list]; };
    const [tw, tl] = shelf('Park takes', 'lv-takes'), [sw, sl] = shelf('Your arranged song', 'lv-songs'), [pw, pl] = shelf(`${s.instrument} presets`, 'lv-presetlib');
    takes().then(list => { lib.take = list.slice(0, 40); tl.replaceChildren(...(lib.take.length ? lib.take.map((t, i) => chip('take', i, `${t.place || 'Park'} · ${t.bars} bar${t.bars === 1 ? '' : 's'} · ${Math.round(t.bpm)} BPM`, `“${t.sketch}” · ${String(t.at || '').slice(0, 10)}`)) : [e('span', 'No park takes yet: Park jam → Record loop.', 'lv-dim')])); });
    const raw = h.state.song, song = raw?.v === 1 && LoopSongCore.schedule(LoopSongCore.validate(raw)).length ? LoopSongCore.validate(raw) : null; lib.song = song ? [song] : [];
    sl.replaceChildren(song ? chip('song', 0, `${song.title} · ${LoopSongCore.bars(song)} bars`, 'The arrangement from Park jam → Arrange, mixed down as one pad') : e('span', 'Nothing arranged yet: Park jam → Arrange.', 'lv-dim'));
    presetList().then(list => { lib.preset = list; pl.replaceChildren(...(list.length ? list.map((x, i) => chip('preset', i, x.label, x.from === 'soundbank' ? 'From the Sound bank' : 'From the desk’s bank')) : [e('span', `No ${s.instrument} presets yet: Keep a patch → Save bank preset.`, 'lv-dim')])); });
    box.append(target, tw, sw, pw, e('p', `Keys while performing: ${C.KEYMAP.map(([k, w]) => `${KL(k)} ${w}`).join(' · ')}`, 'wb-note lv-keys'));
    return box;
  }
  function statusLine() {
    const c = A().current(), st = status; if (!c) return `${set().instrument} isn't open yet: the first pad opens it.`;
    if (!st) return `${c.name} · ${c.live ? 'live' : 'paused'} · press a pad to start`;
    const next = C.nextPreset(set(), sceneIx, st.current), twin = st.twin && set().scenes.flatMap(s => s.pads).find(p => p.id === st.twin);
    return `${c.name} · ${st.playing ? 'LIVE' : 'paused'} · ≈${Math.round(st.latencyMs)} ms · ${st.underruns} underrun${st.underruns === 1 ? '' : 's'}${twin ? ` · ${twin.label} preloaded${st.twinLoadMs ? ` (${st.twinLoadMs} ms)` : ''}` : next ? ` · preloading ${next.label}…` : ''}${st.run ? ` · ● ${st.run.kind} ${C.clock(st.run.seconds)}` : ''}`;
  }
  function paint() { // compare-before-write: pad states, the counter, the status line, the REC badge
    if (!view) return; const sc = scene();
    for (const cell of view.querySelectorAll('.lv-pad')) { const p = sc.pads.find(x => x.id === cell.dataset.pad); if (!p) continue; const st = padState(p), cls = `lv-pad lv-${st}${sc.pads.indexOf(p) === sel ? ' lv-sel' : ''}`; if (cell.className !== cls) cell.className = cls;
      const em = cell.querySelector('.lv-state'), t = { playing: p.kind === 'preset' ? 'on' : 'playing', queued: p.kind === 'preset' ? 'on the beat…' : 'next bar', stopping: 'stops next bar', ready: 'ready', stopped: '', loading: 'loading…' }[st] ?? ''; if (em && em.textContent !== t) em.textContent = t; }
    const line = view.querySelector('.lv-status'), t = statusLine(); if (line && line.textContent !== t) line.textContent = t;
    const rec = view.querySelector('.lv-rec'), r = running ? `● ${running}${status?.run ? ' ' + C.clock(status.run.seconds) : ''}` : ''; if (rec) { if (rec.textContent !== r) rec.textContent = r; rec.hidden = !running; }
    if (status) { const bar = view.querySelector('.lv-bar'), c = C.counter(status, performance.now() - statusAt); if (bar && bar.textContent !== c.text) bar.textContent = c.text; beatCursor(c); }
  }
  function beatCursor(c) { // the beat cursor runs on the compositor: re-aimed only when the tempo / metre changes or it drifts
    const cur = view?.querySelector('.lv-cursor'); if (!cur || !status) return;
    const barMs = status.beats * 60000 / status.bpm, key = `${status.bpm}/${status.beats}/${status.origin}`, want = ((c.bar - 1) * status.beats + c.beat - 1 + c.phase) % status.beats / status.beats * barMs;
    if (cursorAnim && cursorKey === key && cur.isConnected && cursorAnim.effect?.target === cur) { const d = Math.abs(((cursorAnim.currentTime ?? 0) % barMs) - want); if (Math.min(d, barMs - d) < 40) return; }
    cursorAnim?.cancel(); cursorKey = key;
    cursorAnim = cur.animate([{ transform: 'translateX(0)' }, { transform: `translateX(calc(var(--dot) * ${status.beats}))` }], { duration: barMs, iterations: Infinity, easing: `steps(${status.beats}, end)` });
    cursorAnim.currentTime = Math.max(0, want);
  }
  function startPoll() {
    if (poll) return; let inflight = false;
    poll = setInterval(async () => {
      if (!view || inflight) return; inflight = true;
      try {
        status = await req('set-status'); statusAt = performance.now();
        for (const [k, v] of Object.entries(local)) if (v !== 'loading' && (status.pads?.[k]?.state === v || (v === 'queued' && status.pads?.[k]?.state === 'playing') || (v === 'stopping' && status.pads?.[k]?.state === 'stopped'))) delete local[k];
        if (pendingTempo && !playing()) { const b = pendingTempo; pendingTempo = null; req('set-tempo', { bpm: b }).catch(() => {}); }
        if (!status.switch && !preloading && status.current && performance.now() > nextAsk) { nextAsk = performance.now() + 1500; preloadNext(); } // keep the next preset in the twin
        if (!status.open) { armed = false; stopPoll(); say('The live set closed in the host (the instrument restarted): press a pad to load it again.'); }
        paint();
      } catch (err) { say(err.message); } finally { inflight = false; }
    }, 250);
  }
  function stopPoll() { clearInterval(poll); poll = null; }

  // ---------- keys (window capture while the view is open: on stage they reach the set whatever has focus) ----------
  function onKey(ev) {
    if (!view?.isConnected) return;
    const inView = view.contains(document.activeElement) || document.activeElement === document.body;
    if (!stage && !inView) return;
    const a = document.activeElement, typing = !stage && (a?.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName) && a.type !== 'range'));
    const x = C.action(ev, { typing }); if (!x) return;
    ev.preventDefault(); ev.stopPropagation();
    const sc = scene(), cur = sc.pads[sel], run = p => Promise.resolve().then(p).then(t => { if (typeof t === 'string') say(t); }).catch(err => say(err.message));
    if (x.do === 'pad') { const p = C.padForKey(sc, x.key); if (p) run(() => press(p)); }
    else if (x.do === 'panic') say(panic());
    else if (x.do === 'scene') run(async () => { await arm(); return sceneLaunch(); });
    else if (x.do === 'stop') say(stopAll());
    else if (x.do === 'go') run(() => go(x.by));
    else if (x.do === 'select') { sel = Math.max(0, Math.min(sc.pads.length - 1, sel + x.by)); paint(); if (sc.pads[sel]) say(`${sc.pads[sel].label} · ${C.fxLabel(sc.pads[sel].fx)}`); }
    else if (x.do === 'knob' && cur) say(`${cur.label}: ${knob(cur, x.to ?? cur.fx + x.by)}`);
    else if (x.do === 'tempo') run(() => tempo(sc.bpm + x.by));
    else if (x.do === 'stage') say(setStage(!stage));
    else if (x.do === 'rehearse' || x.do === 'perform') run(() => running ? endRun() : startRun(x.do === 'perform' ? 'Performance' : 'Rehearsal'));
  }

  // ---------- chat: /liveset … ----------
  async function command(words = '', ctx) {
    const w = String(words).trim(), [sub = '', ...rest] = w.split(/\s+/), arg = rest.join(' ');
    if (/^(close|off)$/i.test(sub)) { close(); return 'Live set closed (the set is kept).'; }
    await desk(); if (!view?.isConnected) await open();
    const s = set(), sc = scene();
    if (!sub || /^open$/i.test(sub)) return said;
    if (/^(list|songs)$/i.test(sub)) return `“${s.name}” (${s.instrument}, launch on ${s.quantize}):\n` + s.scenes.map((x, i) => `${i === sceneIx ? '▶' : ' '} ${i + 1}. ${x.name} · ${Math.round(x.bpm)} BPM · ` + (x.pads.map(p => `[${C.keyOf(x, p).toUpperCase()}] ${p.label}`).join(' ') || 'no pads')).join('\n');
    if (/^takes$/i.test(sub)) { const t = await takes(); return t.length ? t.slice(0, 30).map((x, i) => `${i + 1}. ${x.place || 'Park'} · ${x.bars} bars · ${Math.round(x.bpm)} BPM · “${x.sketch}”`).join('\n') + '\n/liveset add take <n>' : 'No park takes yet: /jam park record 4'; }
    if (/^add$/i.test(sub)) {
      const [what = '', ...more] = rest, ref = more.join(' ');
      if (/^take$/i.test(what)) { const t = (await takes())[(Number(ref) || 1) - 1]; if (!t) return 'No such take: /liveset takes'; const p = await addTake(t); return `${p.label} added to ${scene().name} on key ${C.keyOf(scene(), p)}.`; }
      if (/^song$/i.test(what)) { const p = await addSong(); return `“${p.label}” added as a one-shot pad (song ${sceneIx + 1}, key ${C.keyOf(scene(), p)}).`; }
      if (/^preset$/i.test(what)) { const list = await presetList(), x = list.find(p => p.label.toLowerCase() === ref.toLowerCase()) || list.find(p => p.label.toLowerCase().includes(ref.toLowerCase())) || (!ref && list[0]); if (!x) return `No ${s.instrument} preset “${ref}”. /sounds lists them.`; const p = await addPreset(x); return `${p.label} added on key ${C.keyOf(scene(), p).toUpperCase()}.`; }
      if (/^(scene|songslot|new)$/i.test(what)) { const n = C.addScene(s, ref ? { name: ref } : {}); sceneIx = s.scenes.length - 1; await save(); draw(); return `${n.name} added (${s.scenes.length} songs).`; }
      return '/liveset add take <n> | song | preset <name> | new [name]';
    }
    if (/^(launch|play|pad)$/i.test(sub)) { const p = C.findPad(sc, arg || '1'); return press(p); }
    if (/^preset$/i.test(sub)) { const p = C.findPad({ ...sc, pads: C.presets(sc) }, arg || 'q'); return press(p); }
    if (/^scene$/i.test(sub) || /^go$/i.test(sub)) { if (/^next$/i.test(arg) || !arg) return go(1); if (/^prev/i.test(arg)) return go(-1); const n = Number(arg); if (!(n >= 1 && n <= s.scenes.length)) return `Songs 1–${s.scenes.length}.`; return go(n - 1 - sceneIx); }
    if (/^all$/i.test(sub)) { await arm(); return sceneLaunch(); }
    if (/^stop$/i.test(sub)) return stopAll();
    if (/^panic$/i.test(sub)) return panic();
    if (/^tempo$/i.test(sub)) { const n = Number(arg); if (!(n >= 40 && n <= 240)) return `${sc.name} is at ${Math.round(sc.bpm)} BPM; /liveset tempo 40–240.`; return tempo(n); }
    if (/^knob$/i.test(sub)) { const [ref, v] = rest; const p = C.findPad(sc, ref); return `${p.label}: ${knob(p, Number(v) || 0)}`; }
    if (/^rehearse$/i.test(sub)) return running ? endRun() : startRun('Rehearsal');
    if (/^perform$/i.test(sub)) return running ? endRun() : startRun('Performance');
    if (/^(end|done|finish)$/i.test(sub)) return endRun();
    if (/^stage$/i.test(sub)) return setStage(!/^off$/i.test(arg) && (/^on$/i.test(arg) || !stage));
    if (/^proof$/i.test(sub)) return offer();
    if (/^runs$/i.test(sub)) return s.runs.length ? s.runs.map((r, i) => `${i + 1}. ${C.runSummary(r)} · ${r.at.slice(0, 16).replace('T', ' ')}${r.proof ? ` · proof for “${r.proof.step}”` : ''}`).join('\n') : 'No runs yet: /liveset rehearse';
    if (/^status$/i.test(sub)) return `${statusLine()}\n${status ? C.counter(status, performance.now() - statusAt).text : ''}`;
    if (/^edit$/i.test(sub)) { mode = 'edit'; draw(); return 'Editing the set.'; }
    return 'Use /liveset (open), list, takes, add take <n> | song | preset <name> | new, launch <pad>, preset <pad>, all, stop, panic, scene next|prev|<n>, tempo <bpm>, knob <pad> <−1…1>, rehearse, perform, end, stage on|off, proof, runs, status, close.';
  }
  const SUBS = [['', 'open the Live set (pads for an open mic)'], ['list', 'the songs and their pads'], ['takes', 'park takes to add'], ['add take 1', 'a park take as a loop pad'], ['add song', 'your arranged song (Arrange) as a pad'], ['add preset', 'a bank / Sound bank preset as a pad'], ['launch 1', 'pad 1 on the next bar'], ['preset q', 'preset pad Q on the next beat'], ['all', 'every clip of this song on the next bar'], ['stop', 'clips stop on the next bar'], ['panic', 'everything fades out'], ['scene next', 'next song'], ['tempo 120', ''], ['rehearse', 'record the whole run'], ['perform', 'record the show'], ['end', 'stop recording, keep the run'], ['stage on', 'hide everything else'], ['proof', 'offer the last run to “Go to an open mic”'], ['runs', 'your rehearsals and shows'], ['status', ''], ['close', '']];
  const complete = a => SUBS.filter(([v]) => v.startsWith(String(a || '').trim().toLowerCase())).map(([value, hint]) => ({ value, hint }));
  if (typeof Commands !== 'undefined' && !Commands.get('liveset')) Commands.register({ name: 'liveset', aliases: ['live-set'], args: '[add take <n> | add song | add preset <name> | launch <pad> | panic | rehearse | perform | stage on|off | proof]', desc: 'Live set for an open mic: pads in the Sound desk — loops on the bar, Serum 2 / Vital presets on the beat, rehearse and record', area: 'Create', run: command, complete, examples: ['/liveset', '/liveset add take 1', '/liveset rehearse', '/liveset stage on', '/liveset proof'] });
  if (typeof Keys !== 'undefined') for (const [keys, what] of C.KEYMAP) Keys.add({ area: 'Live set', keys: KL(keys), what });
  queueMicrotask(() => { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Sound desk: live set for an open mic (pads, stage)', () => command('').then(t => toast(t, { timeout: 5000 })).catch(err => toast(err.message, { type: 'error' }))); });
  return { button, open, close, pause, press, panic, stopAll, sceneLaunch, startRun, endRun, offer, tempo, go, knob, setStage, command, complete, set: () => set(), _test: { polling: () => !!poll, status: () => status, armed: () => armed, local, view: () => view, stage: () => stage, running: () => running, scene: () => scene(), lastRun: () => lastRun } };
})();
