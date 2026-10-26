// (round 69, stems69) 📤 Send to my DAW. The owner finishes tracks in a DAW sometimes (Ableton / FL / Logic); this sends
// a Sound desk song there as a folder that lines up on its own. One labelled button in three places he already looks:
// the Sound desk's top row (parkjam62's attach hook), Arrange's head (next to Export) and a Live set song's editor row.
// The panel over the desk: which song (Arrange, or a Live set song with clip pads), what to send (stems: one WAV per pad /
// lane; the mix; the MIDI of the parts Hearth has played notes for; copies of the presets), the key (guessed from the
// notes, or typed), where (remembered per computer), then one big button, a progress bar, Cancel, and "Show folder".
// Every WAV is 48 kHz 24-bit, starts at bar 1 and has exactly the same length (whole bars), so they line up to the sample
// when dropped at bar 1. The audio is worked out here from the same files the pads / Arrange play, then handed to main
// in 4-second pieces (dawsendmain.js writes "<song> — stems <date>.part", renamed when done, removed on Cancel).
// Nothing loads until the button is clicked (lazy group "dawsend"); nothing runs while the panel is closed; nothing is
// uploaded. Pure parts: tools/dawsend-core.js (dev/stems69-test.js); app check: dev/checks/stems69.js.
const DawSend = (() => {
  const K = DawSendCore, wait = ms => new Promise(r => setTimeout(r, ms));
  let P = null, S = null, L = null; // the creative group's cores, taken when first used (this file may load before them)
  const need = () => { P = ParkJamCore; S = LoopSongCore; L = LiveSetCore; };
  const A = () => WorkbenchVST.api, CHUNK = 4 * K.RATE;
  let slowMs = 0; // (tests) a pause per piece written, so Cancel can be pressed mid-way
  let h = null, panel = null, pick = '', info = null, key = '', keyFrom = '', dir = '', run = null, last = null, said = '', scanTicket = 0;
  const want = { stems: true, mix: true, midi: true, presets: true };
  const say = t => { said = t; const o = panel?.querySelector('.dw-said'); if (o && o.textContent !== t) o.textContent = t; return t; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- what can be sent: the Arrange song, and each Live set song with clip pads ----------
  function sources() {
    need(); const out = [], st = h?.state || {};
    const song = st.song?.v === 1 ? S.validate(st.song) : null;
    if (song && song.bpm && S.schedule(song).length) out.push({ id: 'arrange', kind: 'arrange', title: song.title, bpm: song.bpm, beats: song.beats, song, label: `Arrange · ${song.title} · ${S.bars(song)} bars · ${K.bpmText(song.bpm)} BPM` });
    const set = st.liveset?.v === 1 ? L.validate(st.liveset) : null;
    for (const sc of set?.scenes || []) { const n = L.clips(sc).length; if (n) out.push({ id: 'scene:' + sc.id, kind: 'scene', title: sc.name, bpm: sc.bpm, beats: sc.beats, scene: sc, set, label: `Live set · ${sc.name} · ${plural(n, 'pad')} · ${K.bpmText(sc.bpm)} BPM` }); }
    return out;
  }
  const current = () => { const all = sources(); return all.find(s => s.id === pick) || all[0] || null; };
  async function readWav(file) { const b = await hub.fs.read(file, { encoding: 'buffer', maxBytes: 400 * 1048576 }).then(x => new Uint8Array(x)).catch(() => null); if (!b?.length) throw Error(`A part's file is gone: ${String(file).split(/[\\/]/).pop()}`); return P.decodeWav(b); }
  async function notesFrom(file) { if (!file) return []; try { const raw = await hub.fs.read(file); const j = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); return Array.isArray(j?.notesPlayed) ? j.notesPlayed : []; } catch { return []; } }
  const notesFileOf = wav => String(wav || '').replace(/\.wav$/i, '.json');

  // ---------- the parts: names, notes (no audio yet), presets → what the panel shows and the key guess ----------
  // → { parts: [{ name, what, notes, load: async () => { channels, frames } }], presets: [{ name, from }], skipped: [] }
  async function outline(src) {
    const parts = [], presets = [], skipped = [];
    if (src.kind === 'arrange') {
      const s = src.song, notesOf = {}; for (const c of s.clips) notesOf[c.id] = await notesFrom(c.take.notesFile);
      s.lanes.forEach((lane, k) => {
        const clips = s.clips.filter(c => c.lane === k && S.sourceOf(s, c)); if (!clips.length) return;
        if (lane.mute) { skipped.push(`${lane.name}: muted in Arrange (left out of the stems and the mix, as you hear it).`); return; }
        const places = [...new Set(clips.map(c => c.take.place || 'Take'))].slice(0, 3).join(' + ');
        const solo = { ...s, lanes: s.lanes.map((l, i) => ({ ...l, mute: i !== k })) }, notes = S.songNotes(solo, notesOf);
        parts.push({ name: `${lane.rerender ? 'Re-render' : lane.name} ${places}`, what: `${lane.rerender ? 'the re-render lane' : lane.name} of Arrange (${plural(clips.length, 'clip')}: ${places})`, notes, lane: k });
      });
      for (const c of s.clips) if (c.rerender?.preset) presets.push({ label: c.rerender.preset, instrument: c.rerender.instrument || 'Vital', from: 'bank' });
    } else {
      const sc = src.scene;
      for (const p of L.clips(sc)) {
        const f = p.source?.type === 'take' && p.source.file ? L.fit(p.source, sc) : { ratio: 1, stretch: false, warn: '' }, ratio = p.prepared?.ratio || (f.stretch ? f.ratio : 1);
        const own = p.source?.type === 'take' ? await notesFrom(notesFileOf(p.source.file)) : [];
        const seconds = p.loop && !f.warn ? L.loopFrames(p.bars, sc, K.RATE) / K.RATE : Infinity;
        parts.push({ name: p.label, what: `pad ${L.keyOf(sc, p).toUpperCase()} of “${sc.name}” (${p.loop ? `a ${plural(p.bars, 'bar')} loop, once` : 'a one-shot'}${f.warn ? `, at its own ${K.bpmText(p.source.bpm)} BPM` : ratio !== 1 ? `, fitted from ${K.bpmText(p.source.bpm)} BPM` : ''})`, notes: K.padNotes(own, { ratio, seconds }), pad: p, ratio, warn: f.warn });
      }
      for (const p of L.presets(sc)) presets.push({ label: p.preset.label, id: p.preset.id, instrument: p.instrument, from: p.preset.from });
    }
    const seen = new Set(); return { parts, presets: presets.filter(x => { const k = `${x.instrument}|${x.label}`; if (seen.has(k)) return false; seen.add(k); return true; }), skipped };
  }
  async function scan() {
    const src = current(), mine = ++scanTicket; info = null; if (!src) { draw(); return; }
    const o = await outline(src).catch(err => ({ parts: [], presets: [], skipped: [], error: err.message })); if (mine !== scanTicket) return;
    info = { src, ...o }; const g = K.guessKey(o.parts.flatMap(p => p.notes));
    if (!key || keyFrom.startsWith('guessed')) { key = g?.name || ''; keyFrom = g ? 'guessed from your notes' : ''; }
    draw();
  }
  // a part's audio on bar 1, at 48 kHz (decoded and fitted the way the pad / Arrange plays it)
  async function audioOf(src, part, arrangeMix) {
    if (src.kind === 'arrange') return arrangeMix.lanes[part.lane];
    const p = part.pad, sc = src.scene; let pcm;
    if (p.file && (p.source?.type === 'song' || !L.needsPrepare(p, sc))) pcm = S.prepare(await readWav(p.file), { rate: K.RATE, ratio: 1 });
    else if (p.source?.file) pcm = S.prepare(await readWav(p.source.file), { rate: K.RATE, ratio: part.ratio });
    else throw Error(`${p.label} has no audio yet.`);
    let ch = pcm.channels;
    if (p.loop && !part.warn) { const len = L.loopFrames(p.bars, sc, K.RATE); ch = ch.map(c => { const o = new Float32Array(len); o.set(c.subarray(0, len)); return o; }); }
    const g = 10 ** ((p.gainDb || 0) / 20); return g === 1 ? ch : ch.map(c => c.map(v => v * g));
  }
  async function renderArrange(src, tick) {
    const s = src.song, out = {};
    for (const c of s.clips) { const so = S.sourceOf(s, c); if (!so) continue; check(); out[c.id] = S.prepare(await readWav(so.file), { rate: K.RATE, ratio: so.ratio }); tick(); await wait(0); }
    return S.render(s, out, { rate: K.RATE });
  }

  // ---------- sending ----------
  function check() { if (run?.cancelled) throw Object.assign(Error('Cancelled.'), { cancelled: true }); }
  async function call(name, ...args) { const r = await hub.dawsend[name](...args); if (!r?.ok) throw Error(r?.error || 'Could not write the folder.'); return r; }
  async function where() { if (dir) return dir; dir = store.get('dawsend.dir', '') || ''; if (!dir) { const r = await hub.dawsend.defaultDir(); dir = r?.path || ''; } return dir; }
  async function send(opts = {}) {
    need(); if (run) throw Error('Already sending: wait, or press Cancel.');
    const src = opts.source ? sources().find(s => s.id === opts.source || s.title.toLowerCase() === String(opts.source).toLowerCase()) : current(); if (!src) throw Error('Nothing to send yet: arrange a song, or put loops on Live set pads.');
    if (!info || info.src.id !== src.id) { pick = src.id; await scan(); }
    const w = { ...want, ...(opts.what || {}) }; if (!w.stems && !w.mix && !w.midi && !w.presets) throw Error('Tick at least one thing to send.');
    const dest = opts.dir || await where(); if (!dest) throw Error('Choose where the folder goes (Change…).');
    const parts = info.parts, theKey = K.keyText(key) || '', date = new Date(), files = [], skipped = [...info.skipped];
    run = { cancelled: false, job: null, done: 0, total: 1, note: 'Starting…' }; last = null; draw();
    const steps = (src.kind === 'arrange' ? src.song.clips.length : parts.length) + (w.stems ? parts.length * 4 : 0) + (w.mix ? 4 : 0) + 2;
    run.total = steps; const tick = (n = 1, note) => { run.done += n; if (note) run.note = note; progress(); };
    try {
      // 1. the audio, at 48 kHz, on bar 1
      run.note = 'Reading the parts…'; progress();
      const mixA = src.kind === 'arrange' ? await renderArrange(src, () => tick(1)) : null, audio = [];
      for (const p of parts) { check(); audio.push(await audioOf(src, p, mixA)); if (src.kind !== 'arrange') tick(1, `Reading ${p.name}…`); await wait(0); }
      const pl = K.plan({ bpm: src.bpm, beats: src.beats, frames: src.kind === 'arrange' ? [S.duration(src.song) * K.RATE] : audio.map(a => a[0].length) }); // Arrange: its exact end (the render rounds it up a sample)
      const fitted = audio.map(a => K.fit(a, pl.total)); audio.length = 0;
      const mix = K.sum(fitted, pl.total), g = K.safeGain(K.peakOf(mix));
      // 2. the folder
      run.job = (await call('begin', dest, K.folderName(src.title, date))).job;
      const writeWav = async (name, ch, label) => {
        await call('open', run.job, name, K.wavHeader({ frames: pl.total }), K.dataBytes(pl.total));
        for (let i = 0; i < pl.total; i += CHUNK) { check(); await call('write', run.job, name, K.pcm24(ch, i, Math.min(pl.total, i + CHUNK), g.gain)); tick(4 * Math.min(CHUNK, pl.total - i) / pl.total, `Writing ${label}…`); await wait(slowMs); }
        await call('close', run.job, name);
      };
      if (w.mix) { const n = K.fileName({ n: 0, name: 'Mix', bpm: src.bpm, key: theKey }); await writeWav(n, mix, 'the mix'); files.push({ name: n, what: `the whole song as one mix (${src.kind === 'arrange' ? 'every lane of Arrange' : 'every pad of the song played together from bar 1'})` }); }
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], base = { n: i + 1, name: p.name, bpm: src.bpm, key: theKey };
        if (w.stems) { const n = K.fileName({ ...base, ext: 'wav' }); await writeWav(n, fitted[i], p.name); files.push({ name: n, what: `stem: ${p.what}` }); }
        if (w.midi && p.notes.length) { check(); const n = K.fileName({ ...base, ext: 'mid' }); await call('put', run.job, n, P.midiFile(p.notes, { bpm: src.bpm, beats: src.beats, name: p.name })); files.push({ name: n, what: `MIDI: the ${plural(p.notes.length, 'note')} played in ${p.name}` }); }
      }
      // 3. the presets: copies of the files; a bank preset written out as a .vital when it is Vital's own preset
      if (w.presets) {
        let bank = []; try { bank = (await hub.soundbank?.list?.({}))?.entries || []; } catch { bank = []; }
        const list = [...info.presets]; const cur = A()?.current?.(); if (cur?.ready) list.push({ label: 'Sound now', instrument: cur.name, from: 'now' });
        for (const x of list) {
          check(); const sb = x.id ? bank.find(b => b.id === x.id) : null, label = x.from === 'now' ? `the sound in ${x.instrument} right now` : `“${x.label}”`;
          try {
            if (sb?.source === 'plugin' && sb.file) { const ext = (/\.[^.\\/]+$/.exec(sb.file) || ['.vital'])[0]; const n = 'Presets/' + K.presetName(x.instrument, x.label, ext); await call('copy', run.job, sb.file, n); files.push({ name: n, what: `a copy of your ${x.instrument} preset file ${label}` }); continue; }
            const state = x.from === 'now' ? (await A().exportPatch()).state : x.from === 'soundbank' && x.id ? (await hub.soundbank.state(x.id))?.state : (h.state.presets || []).find(b => b.name === x.instrument && b.label === x.label)?.state;
            if (x.instrument !== 'Vital' || !state) { skipped.push(`${x.instrument} preset ${label}: it lives inside Hearth (no preset file to copy). Open it in the Sound desk and save it from ${x.instrument}'s own menu.`); continue; }
            const n = 'Presets/' + K.presetName(x.instrument, x.label, '.vital'), r = await hub.dawsend.state(run.job, n, state);
            if (r?.ok) files.push({ name: n, what: `${label} as a Vital preset (open it from Vital's preset browser)` }); else skipped.push(`Vital preset ${label}: ${r?.error || 'not readable'}.`);
          } catch (err) { if (err.cancelled) throw err; skipped.push(`${x.instrument} preset ${label}: ${err.message}`); }
        }
      }
      if (w.midi && !parts.some(p => p.notes.length)) skipped.push('MIDI: Hearth has no played notes for these parts (sketches and recorded audio have none).');
      // 4. the README, then the folder gets its real name
      check(); await call('put', run.job, 'README.txt', K.readme({ song: src.title, source: src.kind === 'arrange' ? 'Arrange' : `Live set “${src.set.name}”`, bpm: src.bpm, beats: src.beats, key: theKey, keyFrom: theKey ? (keyFrom || 'typed') : '', bars: pl.bars, seconds: pl.seconds, gainDb: g.db, files, skipped, date }));
      tick(1, 'Finishing…'); const fin = await call('finish', run.job);
      last = { folder: fin.folder, name: fin.folder.split(/[\\/]/).pop(), files: files.length + 1, bars: pl.bars, frames: pl.total, gainDb: g.db, list: files.map(f => f.name), skipped };
      run = null; draw();
      const t = `✓ Sent ${plural(last.files, 'file')} to “${last.name}” · ${pl.bars} bars at ${K.bpmText(src.bpm)} BPM${theKey ? ' · ' + theKey : ''}.`;
      if (!panel) toast(t, { timeout: 6000 }); return say(t);
    } catch (err) {
      const job = run?.job; run = null; if (job) await hub.dawsend.cancel(job).catch(() => {});
      draw(); if (err.cancelled) return say('Cancelled: nothing was left behind.'); throw err;
    }
  }
  function progress() {
    if (!panel || !run) return; const bar = panel.querySelector('.dw-progress'), v = Math.min(1, run.done / run.total), t = `${run.note} ${Math.round(v * 100)} %`;
    if (bar && Math.abs(Number(bar.value) - v) > 0.004) bar.value = v; const o = panel.querySelector('.dw-step'); if (o && o.textContent !== t) o.textContent = t;
  }

  // ---------- the panel (over the desk, like Arrange / Sessions) ----------
  async function open(helpers, { source } = {}) {
    need();
    if (helpers) h = helpers; if (!h) { await ParkJam.desk(); h = ParkJam.helpers(); }
    const host = document.querySelector('.wb-sound-desk'); if (!h?.state || !host) throw Error('Open Creative Playground → Serum 2 / Vital first.');
    if (source) { pick = source; if (keyFrom.startsWith('guessed')) key = ''; }
    await where();
    if (!panel?.isConnected) { panel = h.e('section', null, 'dw-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Send to my DAW'); host.append(panel); }
    draw(); panel.scrollIntoView({ block: 'start' }); await scan();
    const src = current(); return say(src ? `Ready to send “${src.title}”: tick what you want, then press 📤 Send to my DAW.` : 'Nothing to send yet.');
  }
  function close() { scanTicket++; panel?.remove(); panel = null; }
  function pause() { scanTicket++; panel = null; } // the desk is leaving: a send in progress finishes (a toast says so)
  function draw() {
    if (!panel) return; const { e } = h, all = sources(), src = current();
    const head = e('div', null, 'dw-head'), x = e('button', '✕', 'dw-close'); x.type = 'button'; x.setAttribute('aria-label', 'Close Send to my DAW'); x.onclick = () => close();
    head.append(e('strong', '📤 Send to my DAW'), e('span', 'Files that line up at bar 1 in Ableton, FL Studio or Logic', 'dw-dim'), x);
    const body = [head];
    if (!src) body.push(e('p', 'Nothing to send yet. Arrange a song (Park jam → Arrange loops), or put loops on Live set pads (🎤 Live set → ✎ Edit), then come back here.', 'dw-empty'));
    else {
      const songRow = e('label', null, 'dw-line'), sel = e('select', null, 'dw-song'); sel.setAttribute('aria-label', 'Which song');
      for (const s of all) { const o = e('option', s.label); o.value = s.id; o.selected = s.id === src.id; sel.append(o); }
      sel.onchange = () => { pick = sel.value; if (keyFrom.startsWith('guessed')) key = ''; scan(); }; songRow.append(e('span', 'Song', 'dw-label'), sel); body.push(songRow);
      const n = info?.src.id === src.id ? info : null, parts = n?.parts || [], withNotes = parts.filter(p => p.notes.length).length, nPresets = (n?.presets.length || 0) + (A()?.current?.()?.ready ? 1 : 0);
      const box = e('div', null, 'dw-what');
      const tick = (k, title, sub, disabled) => { const l = e('label', null, 'dw-check'), c = e('input'); c.type = 'checkbox'; c.checked = want[k] && !disabled; c.disabled = !!disabled || !!run; c.dataset.what = k; c.onchange = () => { want[k] = c.checked; }; l.append(c, e('span', title, 'dw-t'), e('span', sub, 'dw-dim')); return l; };
      box.append(tick('stems', 'Stems', n ? `one WAV per ${src.kind === 'arrange' ? 'lane' : 'pad'} (${parts.length})` : 'reading…'),
        tick('mix', 'Mix', 'the whole song in one WAV'),
        tick('midi', 'MIDI', !n ? 'reading…' : withNotes ? `the notes of ${plural(withNotes, 'part')} you played` : 'no played notes in these parts', n && !withNotes),
        tick('presets', 'Presets', nPresets ? `${plural(nPresets, 'preset')} (copies)` : 'no presets in this song', !nPresets));
      body.push(box);
      const kr = e('label', null, 'dw-line'), ki = e('input', null, 'dw-key'); ki.value = key; ki.placeholder = 'unknown — type it, e.g. A minor'; ki.setAttribute('aria-label', 'Key, in the file names'); ki.disabled = !!run;
      ki.onchange = () => { const v = K.keyText(ki.value); key = v || ''; keyFrom = v ? 'typed' : ''; ki.value = key; const s = panel?.querySelector('.dw-keyfrom'); if (s) s.textContent = keyFrom; };
      kr.append(e('span', 'Key', 'dw-label'), ki, e('span', keyFrom, 'dw-dim dw-keyfrom')); body.push(kr);
      body.push(e('p', `${K.bpmText(src.bpm)} BPM · ${src.beats}/4 · 48 kHz 24-bit WAVs, all starting at bar 1, all the same length, plus a README.txt`, 'dw-dim dw-meta'));
      const wr = e('div', null, 'dw-line dw-where'); const change = e('button', 'Change…', 'dw-change'); change.type = 'button'; change.disabled = !!run;
      change.onclick = async () => { const p = await hub.pickFolder(dir, 'Where should the stems folder go?'); if (p) { dir = p; store.set('dawsend.dir', p); draw(); } };
      const pth = e('span', dir || 'not chosen yet', 'dw-path'); pth.title = dir; wr.append(e('span', 'Where', 'dw-label'), pth, change); body.push(wr);
      const go = e('button', '📤 Send to my DAW', 'dw-go'); go.type = 'button'; go.disabled = !!run || !n;
      go.onclick = () => send().catch(err => say(err.message));
      const act = e('div', null, 'dw-line dw-act'); act.append(go); body.push(act);
      if (run) { const pr = e('div', null, 'dw-run'), bar = e('progress', null, 'dw-progress'); bar.max = 1; bar.value = Math.min(1, run.done / run.total); bar.setAttribute('aria-label', 'Sending'); const stop = e('button', 'Cancel', 'dw-cancel'); stop.type = 'button'; stop.onclick = () => { if (run) { run.cancelled = true; run.note = 'Cancelling…'; progress(); } }; pr.append(bar, e('span', `${run.note}`, 'dw-step'), stop); body.push(pr); }
      if (last && !run) { const d = e('div', null, 'dw-done'), show = e('button', 'Show folder', 'dw-show'); show.type = 'button'; show.onclick = () => hub.fs.reveal(last.folder); d.append(e('span', `✓ “${last.name}” · ${plural(last.files, 'file')}${last.skipped.length ? ` · ${last.skipped.length} not included (see README.txt)` : ''}`), show); body.push(d); }
    }
    body.push(e('output', said, 'dw-said'));
    panel.replaceChildren(...body); progress();
  }

  // ---------- chat (secondary: the buttons are the way in) ----------
  async function command(words = '') {
    const w = String(words).trim(), [sub = '', ...rest] = w.split(/\s+/), arg = rest.join(' ');
    await ParkJam.desk(); h = ParkJam.helpers() || h;
    if (!sub || /^open$/i.test(sub)) return open(h);
    if (/^(list|songs)$/i.test(sub)) { const all = sources(); return all.length ? all.map((s, i) => `${i + 1}. ${s.label}`).join('\n') : 'Nothing to send yet: arrange a song, or put loops on Live set pads.'; }
    if (/^send$/i.test(sub)) { await open(h, arg ? { source: /^arrange$/i.test(arg) ? 'arrange' : (sources().find(s => s.title.toLowerCase() === arg.toLowerCase()) || {}).id } : {}); return send(); }
    if (/^cancel$/i.test(sub)) { if (!run) return 'Nothing is being sent.'; run.cancelled = true; return 'Cancelling…'; }
    if (/^close$/i.test(sub)) { close(); return 'Closed.'; }
    return 'Use /daw (open the panel), /daw list, /daw send [arrange | <song>], /daw cancel.';
  }
  const complete = a => [['', 'open 📤 Send to my DAW'], ['list', 'the songs you can send'], ['send', 'send the song with everything ticked'], ['send arrange', 'the Arrange song'], ['cancel', '']].map(([value, hint]) => ({ value, hint })).filter(x => x.value.startsWith(String(a || '').trim().toLowerCase()));
  if (typeof Commands !== 'undefined' && !Commands.get('daw')) Commands.register({ name: 'daw', aliases: ['send-to-daw'], args: '[list | send [arrange | <song>] | cancel]', desc: 'Send a Sound desk song to your DAW: stems at bar 1, the mix, MIDI, presets, a README (48 kHz 24-bit)', area: 'Create', run: command, complete, examples: ['/daw', '/daw send arrange'] });
  queueMicrotask(() => { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Sound desk: send to my DAW (stems, mix, MIDI, presets)', () => command('').then(t => toast(t, { timeout: 5000 })).catch(err => toast(err.message, { type: 'error' }))); });
  return { open, close, pause, send, command, complete, sources, _test: { info: () => info, last: () => last, running: () => !!run, cancel: () => { if (run) run.cancelled = true; }, setDir: p => { dir = p; }, slow: ms => { slowMs = ms; }, key: () => key } };
})();
