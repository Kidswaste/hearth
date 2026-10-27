// (round 62, parkjam62) Park jam: the owner's "make music at the park" quest, on the laptop, on battery, maybe without
// the UA interface. Lives in Codex's Sound desk (tools/workbench-vst.js) through three small hooks: one 🌳 Park mode
// button in the desk's top row, one "Park jam · capture the moment" fold under the instrument, and pause().
//   Park mode (one tap, or /jam park [place]): the laptop's own output when the UA isn't connected (shared, never
//   exclusive), a safe buffer, one instrument loaded (the other instrument's host is stopped), lower polyphony /
//   oversampling where the plugin exposes them, Hearth's background timers hushed and the screen dimmed; all of it
//   remembered per place (Belleville, Buttes-Chaumont…) and put back by "Park mode off".
//   Capture the moment: a 4 / 8 / 16-bar loop recorded inside the instrument host (creative-vst-host.py 'record': the
//   instrument's own output + every note played), an optional 10-second field recording from the laptop mic layered
//   under it, all saved in the park sketch's folder (<data>/creative-park/<sketch>/) with a MIDI file of the notes.
//   Proof: a finished loop is offered to the park quest (parisquests61's "Make music at the park") through Codex's own
//   proof contract (QuestCore.submit: the review stays the owner's choice), and announced for the week's review.
// Works offline: nothing here needs an AI. The pure parts are in tools/parkjam-core.js (dev/parkjam62-test.js).
const ParkJam = (() => {
  const P = ParkJamCore, L = WorkbenchVSTLive;
  let mounts = 0, h = null, park = null, button = null, section = null, poll = null, mic = null, ambience = null, busy = null, epoch = 0;
  const live = [], wait = ms => new Promise(r => setTimeout(r, ms));
  const A = () => WorkbenchVST.api;
  const store = () => { if (!h?.state) throw Error('Open Creative Playground → Sound desk first.'); const s = h.state.park ||= { places: {}, takes: [] }; s.places ||= {}; s.takes ||= []; return s; };
  const sketch = () => { try { return WorkbenchUI.snapshot().title; } catch { return 'Park sketch'; } };
  const placeName = () => park?.place || P.placeOf(sketch()) || 'Outside';
  const say = text => { h?.say?.(text); return text; };
  async function req(action, extra = {}) {
    const c = A().current(); if (!c) throw Error('Open Serum 2 or Vital in the Sound desk first.');
    const r = await hub.vst.request({ action, plugin: c.path, name: c.name, ...extra }); if (!r.ok) throw Error(r.error); return r;
  }
  async function save(name, bytes) { const r = await hub.vst.parkSave(sketch(), name, bytes); if (!r?.ok) throw Error(r?.error || 'Could not save the park file.'); return r.path; }

  // ---------- the desk hooks ----------
  function attach(out, row, helpers) {
    h = helpers; epoch++; mounts++;
    button = h.btn(park?.on ? '🌳 Park mode on' : '🌳 Park mode', () => (park?.on ? off() : on()).then(say));
    button.classList.add('wb-park-toggle'); button.setAttribute('aria-pressed', String(!!park?.on));
    button.title = 'Music outside on the laptop: its own output, a safe buffer, battery-friendly, remembered per place (/jam park)';
    row.append(button);
    // (round 64, clickfirst64) the two things that only had a fold or a command, in words in the same row: the Sound
    // bank picker (was Keep a patch › Sound bank… / /sounds) and Arrange (was in the closed Park jam fold / /song)
    if (typeof SoundBank !== 'undefined') { const sb = h.btn('Sound bank', () => SoundBank.open()); sb.classList.add('cf-soundbank'); sb.title = 'Every Serum 2 / Vital preset in one searchable picker: hover to listen, click to play (/sounds)'; row.append(sb); }
    if (typeof LoopSong !== 'undefined') { const ar = h.btn('Arrange loops', () => LoopSong.open(h).then(say)); ar.classList.add('cf-arrange'); ar.title = 'Your park takes → a song: lanes, bars, export mix + stems (/song)'; row.append(ar); }
    if (typeof LiveSet !== 'undefined') row.append(LiveSet.button(helpers)); // (round 64, liveset64) 🎤 Live set, in the same row
    if (typeof BounceLog !== 'undefined') BounceLog.attach(out, row, helpers); // (round 66, bouncelog66) Sessions in the same row + the session clock / strip
    // (round 68, refab68) 🎧 Reference in the same row: click (or drop a track on it) → Reference A/B over the desk (lazy group 'refab')
    { const rb = h.btn('🎧 Reference', () => Lazy.load('refab').then(() => RefAB.open(helpers)).then(say)); rb.classList.add('ra-open'); rb.title = 'Compare your sound with a reference track: A ⇄ B at the same loudness, a loop on it, tone balance (drop a WAV, MP3, FLAC or M4A here)'; const files = ev => [...(ev.dataTransfer?.types || [])].includes('Files'); rb.addEventListener('dragover', ev => { if (files(ev)) { ev.preventDefault(); ev.stopPropagation(); } }); rb.addEventListener('drop', ev => { if (!files(ev)) return; ev.preventDefault(); ev.stopPropagation(); const f = ev.dataTransfer.files?.[0]; Lazy.load('refab').then(() => RefAB.open(helpers, { file: f })).then(say, err => say(err.message)); }); row.append(rb); }
    // (round 69, stems69) 📤 Send to my DAW in the same row: stems at bar 1 + mix + MIDI + presets into a folder (lazy group 'dawsend')
    { const db = h.btn('📤 Send to my DAW', () => Lazy.load('dawsend').then(() => DawSend.open(helpers)).then(say)); db.classList.add('dw-open'); db.title = 'Send a song to Ableton / FL Studio / Logic: stems that line up at bar 1, the mix, MIDI, presets and a README, in a folder you choose'; row.append(db); }
    if (park?.on) { dim(true); hush(true); } // back in the desk with Park mode on
  }
  function refreshButton() { if (!button) return; const t = park?.on ? '🌳 Park mode on' : '🌳 Park mode'; if (button.textContent !== t) button.textContent = t; button.setAttribute('aria-pressed', String(!!park?.on)); }
  function pause() { epoch++; clearInterval(poll); poll = null; stopMic(); dim(false); hush(false); button = null; section = null; if (typeof LoopSong !== 'undefined') LoopSong.pause(); if (typeof LiveSet !== 'undefined') LiveSet.pause(); if (typeof BounceLog !== 'undefined') BounceLog.pause(); if (window.Lazy?.loaded?.('refab')) RefAB.close(); if (window.Lazy?.loaded?.('dawsend')) DawSend.pause(); } // (round 68, refab68) Reference A/B leaves with the desk (its audio freed) // (round 63, loopsong63) Arrange leaves with the desk
  function dim(onOff) { document.documentElement.classList.toggle('parkjam-dim', !!onOff); }
  function hush(onOff) {
    const W = window.Power; if (!W?.hush) return; // powerwise.js: Hearth's background timers (as ▶ Play hushes them)
    if (onOff && !park?.hushed && !W.quietNow?.()) { W.hush(true, []); if (park) park.hushed = true; }
    else if (!onOff && park?.hushed) { W.hush(false); park.hushed = false; }
  }

  // ---------- Park mode ----------
  async function desk() {
    if (typeof hub === 'undefined' || !hub.vst) throw Error('The Sound desk is not available here.');
    // open the Sound desk when it isn't on screen, and wait for THAT mount (its instrument cards, its live controls)
    const before = mounts, here = () => document.querySelector('.wb-sound-desk')?.checkVisibility?.({ visibilityProperty: true });
    if (!h || !here()) { activate('tool:creative'); CreativePlayground.openFeature('vst'); }
    for (let i = 0; i < 300; i++) {
      const d = document.querySelector('.wb-sound-desk'), fresh = mounts > before || here();
      if (h && d && fresh && (d.querySelector('.wb-instrument-card') && (!A().current() || d.querySelector('.wb-live-transport')) || d.querySelector(':scope > .wb-note'))) break;
      if (i % 40 === 39 && !d && typeof CreativePlayground !== 'undefined') CreativePlayground.openFeature('vst'); // (round 71, studiohours71) a cold start: the Playground's own first mount showed its home over our openFeature; ask again
      await wait(50);
    }
    if (!A().instruments().length) throw Error('Set up live audio and add Serum 2 or Vital in the Sound desk first (Creative Playground → Serum 2 / Vital).');
  }
  async function on(place) {
    await desk();
    const s = store(), name = place ? P.placeName(place) : P.placeOf(sketch()) || park?.place || 'Outside', key = P.placeKey(name), mem = s.places[key] || null;
    const notes = [];
    // one instrument: the one open, else the one used here last time, else Vital (the lighter of the two)
    if (!A().current()) await A().open(mem?.instrument || (A().instruments().includes('Vital') ? 'Vital' : A().instruments()[0]), { live: false });
    const cur = A().current(); const solo = await hub.vst.request({ action: 'solo', plugin: cur.path, name: cur.name });
    if (solo?.stopped) notes.push(`only ${cur.name} stays loaded`);
    const devices = await A().devices(), before = park?.on ? park.before : A().output();
    const remembered = mem?.output ? L.resolve(mem.output, devices) : null, pick = P.parkOutput(devices);
    const value = remembered ?? pick.value, dev = devices.devices.find(d => d.id === L.parse(value).device);
    const battery = window.Power?.state?.().mode !== 'plugged';
    const buffer = mem?.buffer || P.safeBuffer(dev?.api, { battery });
    await A().setOutput({ value, buffer, remember: false });
    park = { on: true, place: name, key, before, paramsBefore: park?.on ? park.paramsBefore : {}, hushed: park?.hushed || false };
    // battery-friendly controls, where the plugin exposes them (its controls may still be loading on a first open)
    for (let i = 0; i < 400 && !A().current()?.ready; i++) await wait(50);
    if (A().current()?.ready) {
      const seen = new Map(); for (const q of ['poly', 'voice', 'oversamp', 'quality', 'hq']) for (const p of A().parameters({ query: q, limit: 200 }).parameters) seen.set(p.key, p);
      const saver = P.batterySaver([...seen.values()]);
      if (Object.keys(saver.values).length) { await A().set(saver.values, { source: 'park' }); park.paramsBefore = { ...saver.before, ...park.paramsBefore }; notes.push(saver.changed.join(', ')); }
      else notes.push(`${cur.name} shows no polyphony / oversampling control to lower`);
    } else notes.push('its controls are still loading, so polyphony / oversampling stay as they are');
    dim(true); hush(true); refreshButton();
    s.places[key] = { ...(mem || {}), place: name, output: L.remember(value, devices), buffer, instrument: cur.name, at: new Date().toISOString() }; await h.persist();
    renderSection();
    const outName = remembered ? `${dev?.name || 'System output'} (as last time here)` : pick.kind === 'ua' ? `${pick.name} (UA connected)` : pick.name;
    return `Park mode on · ${name}: ${outName}, ${buffer} samples${pick.kind === 'bluetooth' && !remembered ? ' (Bluetooth: late for live keys, fine for loops)' : ''}; ${notes.join('; ')}; screen dimmed, background checks paused. "Park mode off" puts everything back.`;
  }
  async function off() {
    if (!park?.on) return 'Park mode is off.';
    const was = park, notes = [];
    if (A().current()?.ready && Object.keys(was.paramsBefore || {}).length) { try { await A().set(was.paramsBefore, { source: 'park' }); notes.push('polyphony / oversampling back'); } catch (err) { notes.push(err.message); } }
    if (was.before && A().current()) { try { await A().setOutput({ value: was.before.value, buffer: was.before.buffer, remember: false }); notes.push('output and buffer back'); } catch (err) { notes.push(err.message); } }
    hush(false); dim(false); park = { on: false, place: was.place }; refreshButton(); renderSection();
    return `Park mode off${notes.length ? ': ' + notes.join(', ') : ''}.`;
  }

  // ---------- capture the moment ----------
  function prefs() { const s = h?.state?.park, m = s?.places?.[park?.key || P.placeKey(placeName())] || {}; return { bars: m.bars || 4, bpm: m.bpm || 120, wait: m.wait || 'note', ambience: m.ambience !== false }; }
  function setPref(k, v) { const s = store(), key = park?.key || P.placeKey(placeName()); s.places[key] = { place: placeName(), ...(s.places[key] || {}), [k]: v }; }
  async function record({ bars, bpm, wait: when, ambience: layerIt, onProgress } = {}) {
    if (busy) throw Error('A loop is already being recorded.');
    const pr = prefs(); bars = bars || pr.bars; bpm = bpm || pr.bpm; when = when || pr.wait; layerIt = layerIt ?? pr.ambience;
    if (!P.BARS.includes(bars)) throw Error('Record 4, 8 or 16 bars.');
    if (!A().current()) throw Error('Open Serum 2 or Vital in the Sound desk first.');
    if (!A().current().live) await A().start();
    const mine = epoch; busy = { bars, bpm };
    try {
      await req('record', { bars, bpm, beats: 4, wait: when });
      let st;
      for (;;) {
        await wait(150); if (mine !== epoch) throw Error('The Sound desk closed before the loop was finished.');
        st = await req('record-status'); onProgress?.(st); progress(st);
        if (st.done) break;
        if (!st.recording) throw Error(st.note || 'The loop stopped before it was finished.');
      }
      const take = await req('record-take'), wav = take.wav instanceof Uint8Array ? take.wav : new Uint8Array(take.wav);
      const place = placeName(), date = new Date(), names = P.takeNames(place, date), cur = A().current(), out = A().output();
      const entry = { id: 'take-' + date.getTime().toString(36), at: date.toISOString(), week: P.isoWeek(date), sketch: sketch(), place, bars, beats: take.beats, bpm: take.bpm, seconds: take.seconds, notes: take.notes.length, instrument: cur?.name, output: out.device?.name || 'System output', peak: take.peak, silent: take.silent };
      entry.loop = await save(names.loop, wav);
      entry.midi = await save(names.midi, P.midiFile(take.notes, { bpm: take.bpm, beats: take.beats, name: `${place} · ${sketch()}` }));
      if (layerIt && ambience) {
        const mixed = P.layer(P.decodeWav(wav), ambience); entry.layered = await save(names.layered, P.encodeWav(mixed)); entry.ambience = ambience.path; entry.ambienceDb = mixed.gainDb;
        live.unshift({ id: entry.id, url: URL.createObjectURL(new Blob([P.encodeWav(mixed)], { type: 'audio/wav' })) });
      } else live.unshift({ id: entry.id, url: URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })) });
      await save(names.notes, JSON.stringify({ v: 1, ...entry, notesPlayed: take.notes }, null, 1));
      while (live.length > 3) URL.revokeObjectURL(live.pop().url);
      const s = store(); s.takes.unshift(entry); s.takes = s.takes.slice(0, 24); setPref('bars', bars); setPref('bpm', bpm); await h.persist();
      announce(entry); renderSection();
      return entry;
    } catch (err) { req('record-cancel').catch(() => {}); throw err; }
    finally { busy = null; }
  }
  function progress(st) {
    const o = document.querySelector('.wb-sound-desk .wb-park-progress'); if (!o) return;
    const t = st.armed ? `Waiting for your first note · ${st.bars} bars at ${Math.round(st.bpm)} BPM` : st.done ? 'Loop recorded · saving…' : `Recording · ${Math.round(st.progress * 100)} % of ${st.bars} bars · ${st.notes} notes`;
    if (o.textContent !== t) o.textContent = t;
  }
  // The week: every take is announced (hearth:quest-week); once offered as proof it is a submission in the journal, which
  // weekquest62's week in review (WeekQuestCore.review: submissions[qid][].at in the week) shows among the week's moments
  function announce(entry, quiet = false) {
    const detail = { kind: 'park-jam', week: entry.week, at: entry.at, title: `${entry.place}: ${entry.bars}-bar loop at ${Math.round(entry.bpm)} BPM`, path: entry.layered || entry.loop, place: entry.place, sketch: entry.sketch, notes: entry.notes, proof: entry.proof || null };
    try { document.dispatchEvent(new CustomEvent('hearth:quest-week', { detail })); } catch { /* a listener's problem never blocks a take */ }
    if (!quiet) toast(`Loop kept in “${entry.sketch}”`, { action: { label: 'Offer as proof', fn: () => offer(entry.id).then(t => toast(t)).catch(err => toast(err.message, { type: 'error' })) }, timeout: 6000 });
  }
  // ---------- the park ambience: 10 seconds from the laptop's mic ----------
  async function recordAmbience(seconds = 10, onTick) {
    if (mic) throw Error('The ambience is already recording.');
    seconds = Math.max(1, Math.min(30, Number(seconds) || 10));
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); } catch (err) { throw Error(`No microphone (${err.message}). Allow Hearth to use the microphone in the system settings.`); }
    const mine = mic = { stream, stop: null }, chunks = [];
    try {
      const rec = new MediaRecorder(stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      const done = new Promise((res, rej) => { rec.onstop = res; rec.onerror = e => rej(e.error || Error('The microphone stopped.')); });
      rec.start(250); mine.stop = () => rec.state !== 'inactive' && rec.stop();
      for (let t = 0; t < seconds * 10 && mic === mine && rec.state !== 'inactive'; t++) { if (t % 10 === 0) onTick?.(seconds - t / 10); await wait(100); }
      if (rec.state !== 'inactive') rec.stop(); await done;
      if (mic !== mine) throw Error('The ambience recording was stopped.');
      const bytes = await new Blob(chunks, { type: rec.mimeType || 'audio/webm' }).arrayBuffer(); if (!bytes.byteLength) throw Error('The microphone gave no sound.');
      const ctx = new AudioContext({ sampleRate: 48000 }); let decoded; try { decoded = await ctx.decodeAudioData(bytes); } finally { ctx.close().catch(() => {}); } // (round 64, vstembed64) decoded straight to 48 kHz: the ambience file and the layered loop are 48 kHz, resampled once
      const channels = Array.from({ length: Math.min(2, decoded.numberOfChannels) }, (_, i) => decoded.getChannelData(i).slice());
      const pcm = { rate: decoded.sampleRate, channels }, names = P.takeNames(placeName());
      const path = await save(names.ambience, P.encodeWav(pcm));
      ambience = { ...pcm, path, seconds: channels[0].length / decoded.sampleRate, at: new Date().toISOString() };
      renderSection(); return ambience;
    } finally { stream.getTracks().forEach(t => t.stop()); if (mic === mine) mic = null; }
  }
  function stopMic() { if (!mic) return; const m = mic; mic = null; try { m.stop?.(); } catch { /* already */ } m.stream?.getTracks().forEach(t => t.stop()); }

  // ---------- proof for the park quest (Codex's proof flow) ----------
  async function offer(id) {
    const s = store(), take = id ? s.takes.find(t => t.id === id) : s.takes[0];
    if (!take) throw Error('Record a loop first (Park jam · capture the moment).');
    const file = take.layered || take.loop, bytes = await hub.fs.read(file, { encoding: 'buffer', maxBytes: 80 * 1048576 }).then(b => new Uint8Array(b)).catch(() => null);
    if (!bytes?.length) throw Error('The loop file is gone; record another one.');
    const pcm = P.decodeWav(bytes), text = P.proofText({ ...take, notes: take.notesPlayed || (await notesOf(take)), ambience: !!take.layered }, P.analyse(pcm));
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    await Lazy.load('questjournal'); await QuestParisUI.journal();
    const C = QuestCore, Q = QuestParis, J = QuestJournal.paris, state = () => J.ui().state();
    const pid = Q.parks[P.placeKey(take.place)] || Q.findPlace(take.place)?.id || undefined;
    const camp = await J.mutate(st => Q.startPersonal(st, 'park', pid ? { park: pid } : {}), 'Make music at the park is in your notebook.');
    const q = C.next(state(), camp); if (!q) return `Your park quest is already finished ✓. The loop stays in “${take.sketch}”.`;
    const proof = C.checkProof({ type: 'file', title: file.split(/[\\/]/).pop().slice(0, 200), path: await hub.importRef(file), kind: 'audio/wav', bytes: bytes.length, fingerprint, images: [], ...text });
    const intent = `Made outside at ${take.place}: a ${take.bars}-bar loop at ${Math.round(take.bpm)} BPM on ${take.instrument || 'the Sound desk'}, ${take.notes} notes played live${take.layered ? ', with 10 s of park ambience layered under it' : ''}. Recorded with Park jam (laptop output: ${take.output}).`;
    const item = await J.mutate(st => C.submit(st, q.id, proof, intent), 'Park loop saved as proof. Ask for a review when you like.');
    take.proof = { quest: q.id, step: q.title, submission: item.id, at: item.at }; await h?.persist?.();
    J.ui().questDetail(q.id); announce({ ...take }, true);
    return `Loop offered as proof for “${q.title}” (Make music at the park). Review it from the quest when you like (XP comes after the review, as always); it shows in your week in review (/quest review).`;
  }
  async function notesOf(take) { try { const raw = await hub.fs.read(take.loop.replace(/\.wav$/, '.json')); return JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)).notesPlayed || []; } catch { return []; } }

  // ---------- the fold under the instrument ----------
  function sectionFor(helpers) {
    h = helpers; const { e, row, note, btn, select, field, check } = h, pr = prefs();
    section = e('details', null, 'wb-sound-section wb-park'); section.open = !!park?.on;
    section.append(e('summary', park?.on ? `Park jam · ${placeName()} · capture the moment` : 'Park jam · capture the moment'));
    section.append(row(select('Loop length', pr.bars, P.BARS.map(b => [b, `${b} bars`]), v => setPref('bars', Number(v))),
      field('Tempo (BPM)', pr.bpm, v => { const n = Math.round(Number(v)); if (n >= 50 && n <= 220) setPref('bpm', n); }, 'number'),
      select('Starts', pr.wait, [['note', 'on my first note'], ['now', 'right away']], v => setPref('wait', v)),
      check('Layer park ambience', pr.ambience, v => setPref('ambience', v))));
    const go = btn('Record loop', async () => { const t = await record(); say(`${t.bars} bars recorded (${t.notes} notes) · saved in “${t.sketch}”.`); });
    const amb = btn('Ambience · 10 s', async () => { const a = await recordAmbience(10, left => say(`Recording the park… ${Math.ceil(left)} s`)); say(`Park ambience kept (${a.seconds.toFixed(1)} s): it goes under your next loops.`); });
    const arrange = btn('Arrange', () => LoopSong.open(h).then(say)); arrange.title = 'Lay your park takes out as a song: lanes, bars, re-render through the synth, export mix + stems (/song)'; // (round 63, loopsong63) in the same row
    section.append(row(go, amb, ...(typeof LoopSong !== 'undefined' ? [arrange] : [])), e('output', ambience ? `Ambience ready · ${ambience.seconds.toFixed(1)} s` : 'Ready when you are.', 'wb-note wb-park-progress'));
    section.append(note('Headphones on: the laptop mic hears its own speakers. Record the ambience before you play, or with the sound paused.'));
    const list = e('div', null, 'wb-park-takes'); section.append(list); fillTakes(list);
    return section;
  }
  function fillTakes(list) {
    const { e, btn } = h, takes = (h.state.park?.takes || []).filter(t => t.sketch === sketch()).slice(0, 3);
    list.replaceChildren(...takes.map(t => {
      const card = e('div', null, 'wb-park-take'), url = live.find(x => x.id === t.id)?.url;
      card.append(e('span', `${t.bars} bars · ${Math.round(t.bpm)} BPM · ${t.notes} notes${t.layered ? ' · + ambience' : ''}`));
      if (url) { const a = document.createElement('audio'); a.controls = true; a.src = url; a.volume = .4; card.append(a); }
      card.append(t.proof ? e('span', `✓ Proof: ${t.proof.step}`, 'wb-note') : btn('Offer as park-quest proof', async () => say(await offer(t.id))), btn('Show file', () => hub.fs.reveal(t.layered || t.loop)));
      return card;
    }));
  }
  function renderSection() { const cur = document.querySelector('.wb-sound-desk .wb-park'); if (!cur || !h) return; const open = cur.open || !!park?.on, fresh = sectionFor(h); fresh.open = open; cur.replaceWith(fresh); section = fresh; }
  function week() {
    const wk = P.isoWeek(), takes = (h?.state?.park?.takes || []).filter(t => t.week === wk);
    return takes.length ? `This week outside (${wk}):\n` + takes.map(t => `• ${t.place}: ${t.bars} bars at ${Math.round(t.bpm)} BPM, ${t.notes} notes${t.layered ? ' + ambience' : ''}${t.proof ? ` · proof for “${t.proof.step}”` : ''}`).join('\n') : 'No park loops this week yet. /jam park, then Record loop.';
  }

  // ---------- chat: /jam park … (jam.js hands these words here) ----------
  async function run(words = '', ctx) {
    const w = String(words).trim(), [sub = '', ...rest] = w.split(/\s+/), arg = rest.join(' ');
    if (/^(off|stop|home)$/i.test(sub)) { await desk(); return off(); }
    if (/^(record|loop|rec|capture)$/i.test(sub)) {
      await desk(); if (!park?.on) await on(); const a = P.loopArgs(arg), pr = prefs();
      const bars = a.bars || pr.bars, bpm = a.bpm || pr.bpm;
      record({ bars, bpm, wait: a.now ? 'now' : undefined, ambience: a.ambience ?? undefined }).then(t => ctx?.say?.(`Park loop kept: ${t.bars} bars at ${Math.round(t.bpm)} BPM, ${t.notes} notes, in “${t.sketch}”. /jam park proof offers it to your park quest.`)).catch(err => ctx?.say?.(err.message));
      return `Recording ${bars} bars at ${Math.round(bpm)} BPM${a.now ? ' now' : ': it starts on your first note'}.`;
    }
    if (/^(ambience|ambiance|mic|field)$/i.test(sub)) { await desk(); const a = await recordAmbience(Number(arg) || 10); return `Park ambience kept (${a.seconds.toFixed(1)} s); it goes under your next loops.`; }
    if (/^proof$/i.test(sub)) { await desk(); return offer(); }
    if (/^week$/i.test(sub)) { await desk(); return week(); }
    if (/^(arrange|song)$/i.test(sub)) { await Lazy.load('creative'); return LoopSong.command(arg, ctx); } // (round 63, loopsong63)
    if (/^status$/i.test(sub)) return park?.on ? `Park mode on · ${park.place}.` : 'Park mode is off. /jam park [place] turns it on.';
    await desk(); return on(/^on$/i.test(sub) ? arg : w);
  }
  const complete = () => [['', 'Park mode: laptop output, safe buffer, battery-friendly'], ['belleville', 'Park mode, remembered for this park'], ['record 4', 'record a 4-bar loop (8, 16; "96 bpm", "now")'], ['ambience', '10 s of the park from the laptop mic'], ['proof', 'offer the last loop to the park quest'], ['week', 'this week\'s park loops'], ['off', 'put the output / buffer / controls back']].map(([v, hint]) => ({ value: ('park ' + v).trim(), hint }));
  queueMicrotask(() => { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Sound desk: Park mode (music outside, on battery)', () => run('').then(t => toast(t, { timeout: 6000 })).catch(err => toast(err.message, { type: 'error' }))); });
  return { desk, helpers: () => h, attach, section: sectionFor, pause, on, off, record, recordAmbience, offer, week, run, complete, state: () => (park ? { ...park } : null), _test: { takes: () => h?.state?.park?.takes || [], ambience: () => ambience } };
})();
