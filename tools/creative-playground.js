const CreativePlayground = (() => {
  const C = CreativeCore, KEY = 'creative-playground', SR = 22050;
  let host, stage, nav, feedback, state, source, context, analyser, meterFrame, preview, clip, rendered, generation = 0;
  let feature = 'studio', ready = false, canSave = false, saving = Promise.resolve(), timer = null, timerEnd = 0;
  const defaults = () => ({ v: 1, seed: 'hearth-01', bpm: 110, swing: .12, root: 60, scale: 'minor', style: 'orbit', sound: 'pickup', pitch: 1, difficulty: 1, mazeSize: 23, fx: { drive: .15, cutoff: 7000, echo: .2, crush: 0 }, pattern: C.drums('hearth-01'), done: {}, journal: {}, recipes: [], medium: 'visual' });
  const notice = text => { if (feedback) feedback.textContent = text; };
  const para = text => el('p', { class: 'cp-hint', text });
  function button(text, fn, attrs = {}) { return el('button', { type: 'button', text, ...attrs, on: { click: async e => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { notice(err.message || 'That action failed.'); } finally { b.disabled = false; } } } }); }
  function persist() {
    if (!canSave) return Promise.resolve();
    const snapshot = JSON.parse(JSON.stringify(state));
    saving = saving.catch(() => {}).then(() => window.hub.kvSet(KEY, snapshot)).then(() => notice('Recipe settings saved locally.'), err => { notice(`Not saved: ${err.message || 'storage unavailable'}. Export a recipe to keep your work.`); });
    return saving;
  }
  function stopAudio() { generation++; try { source?.stop(); } catch { /* ended */ } source = null; cancelAnimationFrame(meterFrame); meterFrame = 0; context?.suspend(); preview?.contentWindow?.postMessage({ creative: 'level', value: 0 }, '*'); }
  function pause() { stopAudio(); WorkbenchUI.pause(); preview?.contentWindow?.postMessage({ creative: 'pause' }, '*'); }
  function audioContext() { context ||= new AudioContext(); return context; }
  async function play(samples, sr = SR) {
    stopAudio(); const ticket = generation, ctx = audioContext(); await ctx.resume(); if (ticket !== generation) return;
    const buffer = ctx.createBuffer(1, samples.length, sr); buffer.copyToChannel(samples, 0);
    source = ctx.createBufferSource(); source.buffer = buffer;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; const volume = ctx.createGain(); volume.gain.value = .3;
    source.connect(analyser).connect(volume).connect(ctx.destination); const own = source;
    source.onended = () => { if (source === own) { source = null; cancelAnimationFrame(meterFrame); preview?.contentWindow?.postMessage({ creative: 'level', value: 0 }, '*'); notice('Preview finished.'); } };
    const samplesNow = new Float32Array(512);
    const meter = () => { if (!source) return; analyser.getFloatTimeDomainData(samplesNow); let energy = 0; for (const x of samplesNow) energy += x * x; preview?.contentWindow?.postMessage({ creative: 'level', value: Math.min(1, Math.sqrt(energy / 512) * 4) }, '*'); meterFrame = requestAnimationFrame(meter); };
    source.start(); meter(); notice('Playing at 30% preview volume. Stop audio is always available.');
  }
  async function saveFile(name, data, extension) {
    const args = { defaultPath: name, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] };
    if (typeof data === 'string') args.content = data;
    else args.content = data;
    const r = await window.hub.saveFile(args); if (r?.error) throw Error(r.error); notice(r ? `Exported ${name}.` : 'Export cancelled.'); return r;
  }
  const filename = ext => `hearth-${feature}-${String(state.seed).replace(/[^a-z0-9_-]/gi, '-').slice(0, 48)}.${ext}`;
  function select(label, value, options, change) {
    const input = el('select', { attrs: { 'aria-label': label } }, ...options.map(([v, t]) => el('option', { value: String(v), text: t })));
    input.value = String(value); input.addEventListener('change', () => { change(input.value); persist(); });
    return el('label', { class: 'cp-field' }, el('span', { text: label }), input);
  }
  function range(label, value, min, max, step, change) {
    const output = el('output', { text: String(value) }), input = el('input', { type: 'range', value: String(value), attrs: { min, max, step, 'aria-label': label } });
    input.addEventListener('input', () => { output.textContent = input.value; change(+input.value); }); input.addEventListener('change', persist);
    return el('label', { class: 'cp-field' }, el('span', { text: label }), input, output);
  }
  function bar(...children) { return el('div', { class: 'cp-actions' }, ...children); }
  function waveform(samples) {
    const canvas = el('canvas', { class: 'cp-wave', attrs: { width: 800, height: 110, role: 'img', 'aria-label': 'Audio waveform' } });
    const g = canvas.getContext('2d'); g.fillStyle = '#10171c'; g.fillRect(0, 0, 800, 110); g.strokeStyle = '#80e2ca'; g.beginPath();
    for (let x = 0; x < 800; x++) { let lo = 0, hi = 0; const a = Math.floor(x / 800 * samples.length), b = Math.max(a + 1, Math.floor((x + 1) / 800 * samples.length)); for (let i = a; i < b; i++) { lo = Math.min(lo, samples[i] || 0); hi = Math.max(hi, samples[i] || 0); } g.moveTo(x, 55 + lo * 48); g.lineTo(x, 55 + hi * 48); } g.stroke(); return canvas;
  }
  function soundResult(samples, sr = SR, label = 'Generated audio') {
    stopAudio();
    rendered = { samples, sr, label }; const result = el('section', { class: 'cp-result' }, para(`${label} · ${(samples.length / sr).toFixed(2)}s · mono ${sr} Hz`), waveform(samples),
      bar(button('Play', () => play(samples, sr)), button('Stop audio', stopAudio), button('Export WAV', () => saveFile(filename('wav'), C.wav(samples, sr), 'wav')), button('Use in effects', () => { clip = { samples: samples.slice(), sr, name: label }; openFeature('rack'); }), button('Visualize this', () => { clip = { samples: samples.slice(), sr, name: label }; openFeature('reactive'); })));
    return result;
  }
  function gameConfig(mode = feature) { return { mode, seed: C.hash(state.seed), colors: C.palette(state.seed), bpm: state.bpm, style: state.style, difficulty: state.difficulty, ...(mode === 'maze' ? { maze: C.maze(state.seed, state.mazeSize, Math.round(state.mazeSize * .73)) } : {}) }; }
  function frame(mode) {
    preview = el('iframe', { class: 'cp-frame', attrs: { sandbox: 'allow-scripts', title: `${mode} preview`, allow: 'autoplay', src: 'tools/creative-preview.html' } });
    const target = preview, config = gameConfig(mode);
    target.addEventListener('load', () => target.contentWindow?.postMessage({ creative: 'init', config }, '*'), { once: true });
    return preview;
  }
  function swatches(colors) { return el('div', { class: 'cp-swatches' }, ...colors.map(color => button(color, () => navigator.clipboard.writeText(color).then(() => notice('Color copied.')), { style: { background: color, color: colors.indexOf(color) < 2 ? 'white' : '#111' }, attrs: { title: 'Copy color' } }))); }
  async function png(svg) {
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 512; c.getContext('2d').drawImage(img, 0, 0);
    const b = await new Promise(resolve => c.toBlob(resolve, 'image/png')); if (!b) throw Error('PNG export failed.');
    return saveFile(filename('png'), new Uint8Array(await b.arrayBuffer()), 'png');
  }
  function importControl(onLoad = () => openFeature(feature)) {
    const input = el('input', { type: 'file', attrs: { accept: 'audio/*', 'aria-label': 'Import local audio' } });
    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return; stopAudio(); const ticket = generation;
      try {
        if (f.size > 20 * 1024 * 1024) throw Error('Choose an audio file under 20 MB.');
        notice('Decoding local audio…'); const decoded = await audioContext().decodeAudioData(await f.arrayBuffer());
        if (ticket !== generation) return;
        if (decoded.duration > 60) throw Error('Choose a sample up to 60 seconds long.');
        const samples = new Float32Array(decoded.length);
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) { const x = decoded.getChannelData(ch); for (let i = 0; i < x.length; i++) samples[i] += x[i] / decoded.numberOfChannels; }
        clip = { samples, sr: decoded.sampleRate, name: f.name }; onLoad(); notice(`Loaded ${f.name} locally. Samples stay in memory; export to keep them.`);
      } catch (err) { notice(err.message || 'This audio format could not be decoded. Try WAV.'); }
    }); return el('label', { class: 'cp-field' }, el('span', { text: 'Import your audio · up to 60s / 20 MB' }), input);
  }
  function visual() {
    const art = C.svg(state.seed, feature), img = el('img', { class: `cp-art cp-${feature}`, attrs: { alt: `${feature} generated from seed ${state.seed}`, src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(art) } });
    stage.append(bar(button('Export SVG', () => saveFile(filename('svg'), art, 'svg')), button('Export PNG', () => png(art))), img, swatches(C.palette(state.seed)));
    if (feature === 'pattern') stage.append(para('The 512px export contains an 8 × 8 repeat; all four edges tile without a seam.'));
    if (feature === 'sprite') stage.append(para('16 × 16 mirrored creature, exported at 512px with a transparent background.'));
  }
  function motion() {
    stage.append(select('Motion', state.style, [['orbit', 'Orbit weave'], ['tunnel', 'Infinite tunnel'], ['ribbon', 'Soft ribbon']], v => { state.style = v; openFeature(feature); }), frame(feature));
    if (feature === 'reactive') {
      stage.append(importControl());
      const current = clip || { samples: C.beatAudio(state.pattern, state.bpm, state.swing), sr: SR, name: 'Current beat' };
      stage.append(para(`${current.name} drives the preview. Start the visual, then play audio.`), bar(button('Play audio', () => play(current.samples, current.sr)), button('Stop audio', stopAudio)));
    }
    stage.append(bar(button('Export silent loop HTML', () => saveFile(filename('html'), CreativeGames.html(gameConfig('motion')), 'html'))), para('Loops close after four beats. HTML exports play locally in a browser; audio-reactive playback stays in this workspace.'));
  }
  function beats() {
    const grid = el('div', { class: 'cp-sequencer', attrs: { role: 'group', 'aria-label': 'Sixteen step drum pattern' } });
    ['Kick', 'Snare', 'Hat', 'Tone'].forEach((name, row) => {
      grid.append(el('span', { text: name }));
      for (let i = 0; i < 16; i++) { const b = button(String(i + 1), () => { state.pattern[row][i] = !state.pattern[row][i]; b.setAttribute('aria-pressed', String(state.pattern[row][i])); persist(); }, { attrs: { 'aria-label': `${name} step ${i + 1}`, 'aria-pressed': String(state.pattern[row][i]) } }); grid.append(b); }
    });
    const out = el('div'); const render = () => out.replaceChildren(soundResult(C.beatAudio(state.pattern, state.bpm, state.swing), SR, 'One bar drum loop'));
    stage.append(grid, range('Swing', state.swing, 0, .45, .01, v => { state.swing = v; }), bar(button('Render current beat', render), button('New groove', () => { state.pattern = C.drums(state.seed + ':' + Date.now()); persist(); openFeature('drums'); })), out); render();
  }
  function melodies() {
    stage.append(bar(select('Root', state.root, Array.from({ length: 12 }, (_, i) => [60 + i, ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][i]]), v => { state.root = +v; openFeature('melody'); }),
      select('Scale', state.scale, [['minor', 'Minor'], ['major', 'Major'], ['pentatonic', 'Minor pentatonic']], v => { state.scale = v; openFeature('melody'); })));
    const notes = C.melody(state.seed, state.root, state.scale), roll = el('div', { class: 'cp-piano', attrs: { role: 'img', 'aria-label': '32 note melody preview' } });
    for (const n of notes) roll.append(el('span', { style: { height: `${18 + (n.note - state.root) * 5}px` }, attrs: { title: `MIDI note ${n.note}, beat ${n.beat}` } }));
    stage.append(roll, soundResult(C.melodyAudio(notes, state.bpm), SR, 'Four bar melody'), button('Export MIDI to your DAW', () => saveFile(filename('mid'), C.midi(notes, state.bpm), 'mid')));
  }
  function sounds() {
    const out = el('div'); const render = () => out.replaceChildren(soundResult(C.synth(state.sound, state.sound === 'impact' ? 1.5 : .65, SR, state.seed, state.pitch), SR, state.sound));
    stage.append(bar(select('Sound', state.sound, ['pickup', 'jump', 'laser', 'impact', 'kick', 'snare', 'hat'].map(x => [x, x]), v => { state.sound = v; render(); }), range('Pitch multiplier', state.pitch, .25, 4, .05, v => { state.pitch = v; })), button('Render sound', render), out); render();
  }
  function cutter() {
    stage.append(importControl()); if (!clip) { stage.append(para('Import a local sample, or send a generated sound here from the effects rack. Your original file is never modified.')); return; }
    let start = 0, end = clip.samples.length / clip.sr, reverse = false; const out = el('div');
    const numeric = (name, value, change) => { const i = el('input', { type: 'number', value, attrs: { min: 0, max: end.toFixed(4), step: .01, 'aria-label': name } }); i.addEventListener('input', () => change(+i.value)); return el('label', { class: 'cp-field' }, el('span', { text: name }), i); };
    stage.append(para(clip.name), waveform(clip.samples), bar(numeric('Start (seconds)', 0, v => { start = v; }), numeric('End (seconds)', end.toFixed(4), v => { end = v; }), select('Direction', 'forward', [['forward', 'Forward'], ['reverse', 'Reverse']], v => { reverse = v === 'reverse'; })),
      button('Render slice with short fades', () => { out.replaceChildren(soundResult(C.slice(clip.samples, clip.sr, start, end, reverse), clip.sr, 'Trimmed sample')); }), out);
  }
  function rack() {
    stage.append(importControl()); const input = clip || { samples: C.melodyAudio(C.melody(state.seed, state.root, state.scale), state.bpm), sr: SR, name: 'Generated melody' };
    stage.append(para(`Source: ${input.name}. Built-in effects process a copy; this is not a VST host.`));
    const controls = el('div', { class: 'cp-control-grid' });
    for (const [key, label, min, max, step] of [['drive', 'Drive', 0, 1, .01], ['cutoff', 'Low-pass Hz', 80, 10000, 20], ['echo', 'Echo feedback', 0, .7, .01], ['crush', 'Lo-fi hold', 0, 12, 1]]) controls.append(range(label, state.fx[key], min, max, step, v => { state.fx[key] = v; }));
    const out = el('div'); stage.append(controls, bar(button('Hear original', () => play(input.samples, input.sr)), button('Render processed sound', () => out.replaceChildren(soundResult(C.effects(input.samples, input.sr, state.fx), input.sr, 'Processed sound'))), button('Open sample cutter', () => { clip = input; openFeature('slice'); })), out);
  }
  function games() {
    if (feature === 'arena') stage.append(select('Difficulty', state.difficulty, [[1, 'Gentle'], [2, 'Brisk'], [3, 'Quick']], v => { state.difficulty = +v; openFeature('arena'); }));
    if (feature === 'maze') stage.append(select('Maze size', state.mazeSize, [[13, 'Pocket'], [23, 'Wandering'], [35, 'Labyrinth']], v => { state.mazeSize = +v; openFeature('maze'); }));
    stage.append(frame(feature), bar(button('Export playable HTML', () => saveFile(filename('html'), CreativeGames.html(gameConfig()), 'html'))));
    if (feature === 'maze') stage.append(button('Export level JSON', () => saveFile(filename('json'), JSON.stringify({ v: 1, seed: state.seed, ...gameConfig().maze }, null, 2), 'json')));
    stage.append(para('Click Start, then play inside the preview. Exported games include their code and run offline, with keyboard and touch controls.'));
  }
  function draft(text) {
    const a = H.agents().find(a => a.mode === 'native' && a.engine === 'codex' && !a.dock); if (!a) throw Error('Add an Astra native agent to prepare a draft.');
    const previous = Native.view(a.id)?.input?.value || '';
    Native.setDraft(a.id, `${previous ? previous + '\n\n' : ''}${text}\n\nHelp me develop this creative study. Ask before changing existing projects.`); activate(a.id); notice('Prepared an Astra draft. Nothing was sent.');
  }
  function daily() {
    stage.append(el('article', { class: 'cp-card cp-brief' }, el('h3', { text: 'Your next chapter starts small.' }), para('A proper quest journal: creative campaigns, personal goals, XP, a skill tree, rewards you choose, and a collection of things you finished.'), button('Open quest journal →', async () => { await Lazy.load('questjournal'); activate('tool:quests'); }), para('One main quest. Up to three side quests. No lost progress for missing a day.')));
    const archive = el('details', { class: 'cp-notebook' }, el('summary', { text: 'Original daily prompts & notebook' })), oldStage = el('div'); archive.append(oldStage); stage.append(archive);
    const day = C.localDay(), quests = C.quests(day);
    oldStage.append(para(`${day} · earlier Playground prompts. Your notebook is kept separately from the quest journal.`));
    for (const q of quests) {
      const complete = (state.done[day] || []).includes(q.id), card = el('article', { class: 'cp-card' }, el('h3', { text: q.title }), para(`${q.medium} · ${q.minutes} minutes`), para(q.text));
      card.append(bar(button(complete ? '✓ Completed · undo' : 'Mark complete', () => { const s = new Set(state.done[day] || []); complete ? s.delete(q.id) : s.add(q.id); state.done[day] = [...s]; persist(); openFeature('quests'); }), button('Focus timer', () => focus(q.minutes)), button('Explore in Astra', () => draft(q.text)))); oldStage.append(card);
    }
    const note = el('textarea', { value: state.journal[day] || '', attrs: { placeholder: 'What did you make or discover?', rows: 3, maxlength: 3000, 'aria-label': 'Daily reflection' } });
    note.addEventListener('change', () => { state.journal[day] = note.value; persist(); }); oldStage.append(el('label', { class: 'cp-field' }, el('span', { text: 'Today’s reflection' }), note));
  }
  function focus(minutes) {
    clearInterval(timer); timerEnd = Date.now() + minutes * 60000;
    const tick = () => { const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)); const text = host.querySelector('.cp-focus'); if (text) { text.hidden = false; text.textContent = left ? `Focus · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · click to stop` : 'Focus finished · take a breath'; } if (!left) { clearInterval(timer); timer = null; } };
    timer = setInterval(tick, 1000); tick();
  }
  function inspiration() {
    stage.append(select('Make a', state.medium, [['visual', 'Visual'], ['music', 'Music piece'], ['game', 'Game'], ['mixed-media', 'Mixed-media piece']], v => { state.medium = v; openFeature('inspire'); }));
    const b = C.brief(state.seed, state.medium);
    stage.append(el('article', { class: 'cp-card cp-brief' }, el('h3', { text: b.title }), para(b.text), swatches(b.palette)), bar(button('Copy brief', () => navigator.clipboard.writeText(b.text)), button('Prepare Astra draft', () => draft(b.text)), button('Export brief', () => saveFile(filename('txt'), `${b.title}\n\n${b.text}\n\nSeed: ${b.seed}\nPalette: ${b.palette.join(', ')}`, 'txt'))));
  }
  function openFeature(id) {
    if (!ready) return;
    const f = C.FEATURES.find(f => f.id === id); if (!f) return;
    host.classList.toggle('cp-modern', f.group === 'Workbenches');
    pause(); feature = id; preview = null; rendered = null; stage.replaceChildren(el('h2', { text: f.name }), para(f.description));
    nav.querySelectorAll('[data-feature-id]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.featureId === id)); });
    if (f.group === 'Workbenches') { WorkbenchUI.mount(stage, id, { notice, saveFile, openFeature, play, stopAudio }).catch(err => notice(err.message)); return; }
    if (['poster', 'pattern', 'sprite'].includes(id)) visual(); else if (['motion', 'reactive'].includes(id)) motion(); else if (id === 'drums') beats(); else if (id === 'melody') melodies(); else if (id === 'sfx') sounds(); else if (id === 'slice') cutter(); else if (id === 'rack') rack(); else if (['arena', 'maze', 'rhythm'].includes(id)) games(); else if (id === 'quests') daily(); else inspiration();
  }
  function recipe() { const { done, journal, recipes, ...settings } = state; return { v: 1, feature, settings: JSON.parse(JSON.stringify(settings)) }; }
  function savedRecipes(container) {
    container.replaceChildren();
    for (const item of state.recipes) container.append(bar(el('span', { text: item.name }), button('Open', () => { state = { ...state, ...JSON.parse(JSON.stringify(item.settings)), recipes: state.recipes, done: state.done, journal: state.journal }; persist(); host.querySelector('[aria-label="Seed"]').value = state.seed; const bpm = host.querySelector('[aria-label="BPM"]'); bpm.value = state.bpm; bpm.closest('label').querySelector('output').textContent = state.bpm; openFeature(item.feature); }), button('Remove', () => { state.recipes = state.recipes.filter(x => x.id !== item.id); persist(); savedRecipes(container); })));
    if (!state.recipes.length) container.append(para('Save a recipe to revisit its seed, pattern and settings. Imported audio is session-only.'));
  }
  async function mount(body) {
    host = el('div', { class: 'cp-workspace' }); body.append(host); state = defaults();
    feedback = el('p', { class: 'cp-feedback', attrs: { role: 'status' }, text: 'Loading your creative notebook…' }); host.append(feedback);
    try {
      const saved = await window.hub.kvGet(KEY);
      if (saved && saved.v !== 1) throw Error('Unknown notebook format; your saved notebook was left unchanged.');
      if (saved && (!Array.isArray(saved.pattern) || saved.pattern.length !== 4 || saved.pattern.some(row => !Array.isArray(row) || row.length !== 16 || row.some(v => typeof v !== 'boolean')) || !Array.isArray(saved.recipes) || typeof saved.seed !== 'string' || !Number.isFinite(saved.bpm) || saved.bpm < 40 || saved.bpm > 220 || !saved.done || !saved.journal)) throw Error('Notebook data needs repair; exports are available and the original is preserved.');
      if (saved) state = { ...state, ...saved, fx: { ...state.fx, ...saved.fx } };
      canSave = true;
    } catch (err) { notice(`Notebook unavailable: ${err.message}. Saving is disabled; exports still work.`); }
    nav = el('nav', { class: 'cp-nav', attrs: { 'aria-label': 'Creative features' } }); stage = el('main', { class: 'cp-stage' });
    for (const group of ['Workbenches', 'Visuals', 'Music', 'Games', 'Daily']) { nav.append(el('h3', { text: group })); for (const f of C.FEATURES.filter(f => f.group === group)) nav.append(button(f.name, () => openFeature(f.id), { dataset: { featureId: f.id }, attrs: { 'aria-pressed': 'false', title: f.description } })); }
    const seed = el('input', { type: 'text', value: state.seed, attrs: { maxlength: 80, 'aria-label': 'Seed' } }); seed.addEventListener('change', () => { state.seed = seed.value || 'hearth'; state.pattern = C.drums(state.seed); persist(); openFeature(feature); });
    const recipes = el('div', { class: 'cp-recipes' });
    const focusBtn = button('Focus', () => { clearInterval(timer); timer = null; timerEnd = 0; focusBtn.hidden = true; }, { class: 'cp-focus', hidden: true });
    const top = bar(el('label', { class: 'cp-field' }, el('span', { text: 'Seed' }), seed), button('Shuffle', () => { state.seed = 'spark-' + Math.random().toString(36).slice(2, 8); seed.value = state.seed; state.pattern = C.drums(state.seed); persist(); openFeature(feature); }), range('BPM', state.bpm, 40, 220, 1, v => { state.bpm = v; }), button('Apply tempo', () => openFeature(feature)), button('Stop audio', stopAudio), focusBtn);
    const saved = el('details', { class: 'cp-notebook' }, el('summary', { text: 'My recipes' }), bar(button('Save current recipe', () => { const r = recipe(); state.recipes.unshift({ ...r, id: Date.now().toString(36), name: `${C.FEATURES.find(f => f.id === feature).name} · ${state.seed}` }); state.recipes = state.recipes.slice(0, 50); persist(); savedRecipes(recipes); }), button('Export current recipe JSON', () => saveFile(filename('json'), JSON.stringify(recipe(), null, 2), 'json'))), recipes);
    host.prepend(el('header', { class: 'cp-heading' }, el('h1', { text: 'Creative Playground' }), para('Make something worth keeping, one small quest at a time.'), button('✦ Quest journal', async () => { await Lazy.load('questjournal'); activate('tool:quests'); })), top);
    host.append(el('div', { class: 'cp-layout' }, nav, stage), saved); savedRecipes(recipes); ready = true; if (canSave) notice('Ready · everything here works locally.'); openFeature(feature);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    // A rail change may not hide the whole document. Stop audio and animation when this surface disappears.
    const surface = body.closest('.surface'); if (surface) new MutationObserver(() => { if (H.activeId !== 'tool:creative') pause(); }).observe(surface, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  }
  Tools.define({ id: 'creative', offRail: true, name: 'Creative Playground', icon: '✺', color: '#8de0c7', description: 'Visuals, beats, games and daily creative quests', mount: body => { mount(body).catch(e => { body.textContent = `Playground could not open: ${calmError(e)}`; }); } });
  Commands.register({ name: 'playground', area: 'Create', desc: 'Open visuals, music, games and daily creative quests', run: () => { activate('tool:creative'); } });
  return { openFeature, pause, flush: () => saving, snapshot: () => ({ feature, state: JSON.parse(JSON.stringify(state)), playing: Boolean(source), clip: clip ? { name: clip.name, seconds: clip.samples.length / clip.sr } : null }), renderAudio: () => rendered };
})();
