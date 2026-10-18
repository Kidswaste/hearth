// Native sound desk: one instrument instance, shared by live keys, native editor and chat tools.
var WorkbenchVST = (() => {
  let h, selected = null, before = null, canEdit = false, alive = 0, poll = null, playing = false, rendered = null, statsText = null, held = new Set(), keyOff = () => {}, patchTimer = null, pendingPatch = {}, settings = { device: null, buffer: 512, gain: .2 }, deviceChosen = false;
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  function clearRender() { if (rendered?.player) { rendered.player.pause(); rendered.player.parentElement?.replaceChildren(); } if (rendered?.url) URL.revokeObjectURL(rendered.url); rendered = null; }
  async function call(action, data = {}) {
    if (!selected && action !== 'devices') throw Error('Choose Serum 2 or Vital first.');
    const r = await hub.vst.request({ action, plugin: selected?.path, name: selected?.name, ...data });
    if (!r.ok) throw Error(r.error); return r;
  }
  async function silence() { held.clear(); if (selected) await call('panic').catch(() => {}); }
  function pause() {
    alive++; clearInterval(poll); poll = null; clearTimeout(patchTimer); patchTimer = null;
    if (Object.keys(pendingPatch).length && selected) flushPatch().catch(() => {});
    keyOff(); keyOff = () => {}; silence(); if (selected) call('live-stop').catch(() => {}); playing = false;
    if (rendered?.player) rendered.player.pause();
    if (typeof PresetHover !== 'undefined') PresetHover.detach(); // (round 61, presethover61) the ✦ Preset window leaves with the desk
  }
  async function flushPatch() {
    const values = pendingPatch; pendingPatch = {}; if (!Object.keys(values).length) return;
    const old = {}; for (const p of selected.parameters) if (Object.hasOwn(values, p.key)) old[p.key] = p.value;
    await call('patch', { parameters: values }); clearRender(); before = { parameters: old };
    for (const p of selected.parameters) if (Object.hasOwn(values, p.key)) p.value = values[p.key];
  }
  function tweak(key, value) { pendingPatch[key] = value; clearTimeout(patchTimer); patchTimer = setTimeout(() => flushPatch().catch(e => h.say(e.message)), 60); }
  async function snapshot(state) { await flushPatch(); if (state) clearRender(); const r = await call('snapshot', state ? { state } : {}); selected = { ...r, path: selected.path }; return r; }
  async function undo() { clearRender(); if (!before) throw Error('No patch change to undo.'); const saved = before; before = null; if (saved.state) await snapshot(saved.state); else { await call('patch', { parameters: saved.parameters }); for (const p of selected.parameters) if (Object.hasOwn(saved.parameters, p.key)) p.value = saved.parameters[p.key]; } }
  function showStats(s) {
    playing = s.playing;
    if (statsText) statsText.textContent = s.error ? `Audio stopped: ${s.error}` : `${s.playing ? 'LIVE' : 'PAUSED'} · ${s.sampleRate / 1000} kHz · ${s.buffer} samples · output ${Math.round(s.deviceLatencyMs)} ms + queue ≤${Math.round(s.queuedMs)} ms · ${s.underruns} underruns${s.editorOpen ? ' · native editor open' : ''}`;
  }
  async function mount(out, helpers) {
    pause(); const ticket = alive; h = helpers;
    const { state, persist, say, e, row, note, btn, field, range, select, check, save, file } = h;
    out.classList.add('wb-sound-desk');
    if (typeof PresetHover !== 'undefined') PresetHover.attach(out, door); // (round 61, presethover61) ✦ Preset floats over the desk
    const header = e('div', null, 'wb-sound-header');
    header.innerHTML = '<svg viewBox="0 0 100 50" aria-hidden="true"><path d="M2 25h10l6-18 9 37 9-32 8 25 8-16 7 8 7-4h32" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="90" cy="9" r="3" fill="currentColor"/></svg>';
    header.append(e('h3', 'Sound desk'), note('Serum 2 + Vital · play a sound, shape it, keep the take.')); out.append(header);
    const runtime = await hub.vst.status(); if (ticket !== alive) return;
    const setup = row(btn(runtime.ok ? 'Check audio runtime' : 'Set up live audio', async () => { say('Preparing the local audio runtime…'); const r = await (runtime.ok ? hub.vst.status() : hub.vst.setup()); if (!r.ok) throw Error(r.error); h.api.openFeature('vst'); }), btn('Plugin folder', async () => { const path = await hub.pickFolder('', 'Folder containing Serum 2 or Vital'); if (path && !state.roots.includes(path)) { state.roots.push(path); persist(); h.api.openFeature('vst'); } }), btn('Reset host', async () => { pause(); await hub.vst.stop(); selected = null; canEdit = false; h.api.openFeature('vst'); }));
    out.append(setup);
    if (!runtime.ok) { out.append(note(`${runtime.error} Setup installs a private Pedalboard + PortAudio runtime in Hearth. Your installed plugins remain where they are.`)); return; }
    const scan = await hub.vst.scan(state.roots); if (ticket !== alive) return; if (!scan.ok) throw Error(scan.error);
    const chooser = e('div', null, 'wb-sound-picker'), detail = e('div', null, 'wb-sound-detail'); out.append(chooser, detail);
    for (const p of scan.plugins) {
      const b = btn(p.name, async () => {
        say(`Opening ${p.name}… first load reads its controls.`); await flushPatch(); await silence(); if (selected) await call('live-stop').catch(() => {});
        const r = await hub.vst.request({ action: 'inspect', plugin: p.path, name: p.name });
        if (!r.ok) throw Error(r.error); if (ticket !== alive) return;
        clearRender(); selected = { ...r, path: p.path }; state.selected = p.path; canEdit = false; before = null; persist(); await draw(); say(`${p.name} ready. Start live audio, then play the keys.`);
      }); b.classList.add('wb-instrument-card'); b.setAttribute('aria-pressed', String(selected?.path === p.path)); chooser.append(b);
    }
    if (!scan.plugins.length) detail.append(note('Install Serum 2 or Vital, then choose its VST3 folder. This desk only loads those two instruments.'));
    async function draw() {
      if (!selected || ticket !== alive) return;
      chooser.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === selected.name)));
      const p = selected; detail.replaceChildren();
      const transport = e('div', null, 'wb-live-transport'); statsText = e('output', 'PAUSED', 'wb-live-stats');
      const devices = await call('devices'); if (ticket !== alive) return;
      if (!deviceChosen) { settings.device = devices.preferred; deviceChosen = true; }
      let device = settings.device == null ? '' : String(settings.device), buffer = settings.buffer, gain = settings.gain;
      transport.append(select('Audio output', device, [['', 'System output'], ...devices.devices.map(d => [String(d.id), `${d.name} · ${d.api}`])], v => { device = v; settings.device = v === '' ? null : Number(v); silence().then(() => call('live-stop')).then(s => { showStats(s); startButton.textContent = 'Start live audio'; }).catch(err => say(err.message)); }), select('Buffer', buffer, [[256, '256 · responsive'], [512, '512 · balanced'], [1024, '1024 · stable']], v => { buffer = Number(v); settings.buffer = buffer; silence().then(() => call('live-stop')).then(s => { showStats(s); startButton.textContent = 'Start live audio'; }).catch(err => say(err.message)); }), range('Monitor volume', gain, 0, .5, .01, v => { gain = v; settings.gain = v; call('volume', { gain: v }).catch(err => say(err.message)); }));
      const startButton = btn(playing ? 'Live audio on' : 'Start live audio', async () => { showStats(await call('live-start', { buffer, device: device === '' ? null : Number(device), gain })); startButton.textContent = 'Live audio on'; });
      transport.append(row(startButton, btn('Pause audio', async () => { await silence(); showStats(await call('live-stop')); startButton.textContent = 'Start live audio'; }), btn('All notes off', silence), btn('Open native editor', async () => { clearRender(); await call('editor'); say('Native editor is open. Live audio keeps running; play its keyboard or Hearth’s keys.'); })), statsText);
      detail.append(e('h3', `${p.name} / live instrument`), transport);
      const keys = e('div', null, 'wb-live-keys'), keyMap = 'awsedftgyhujkolp;', labels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']; let octave = 4;
      const keyButtons = [];
      async function on(i) { if (!playing) return say('Start live audio first.'); const n = (octave + 1) * 12 + i; if (held.has(n)) return; held.add(n); keyButtons[i]?.classList.add('held'); await call('midi', { note: n, on: true }); }
      async function off(i) { const n = (octave + 1) * 12 + i; held.delete(n); keyButtons[i]?.classList.remove('held'); await call('midi', { note: n, on: false }); }
      labels.forEach((label, i) => { const key = e('button', `${label} · ${keyMap[i].toUpperCase()}`, label.includes('♯') ? 'wb-key sharp' : 'wb-key'); key.type = 'button'; key.setAttribute('aria-label', `Play ${label}`); key.onpointerdown = ev => { ev.preventDefault(); try { key.setPointerCapture(ev.pointerId); } catch {} on(i).catch(err => say(err.message)); }; key.onpointerup = key.onpointercancel = key.onlostpointercapture = () => off(i).catch(() => {}); keyButtons.push(key); keys.append(key); });
      const down = ev => { if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || ev.target.isContentEditable) return; const i = keyMap.indexOf(ev.key.toLowerCase()); if (i >= 0) { ev.preventDefault(); on(i).catch(err => say(err.message)); } };
      const up = ev => { const i = keyMap.indexOf(ev.key.toLowerCase()); if (i >= 0) off(i).catch(() => {}); };
      const blur = () => { keyButtons.forEach(b => b.classList.remove('held')); silence(); };
      keyOff(); window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
      keyOff = () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
      detail.append(row(select('Octave', octave, [[2, '2 · bass'], [3, '3 · low'], [4, '4 · middle'], [5, '5 · high']], v => { silence(); octave = Number(v); keyButtons.forEach(b => b.classList.remove('held')); }), note('Hold keys A–; or press the keyboard below.')), keys);
      clearInterval(poll); poll = setInterval(() => call('live-status').then(showStats).catch(err => { say(err.message); clearInterval(poll); playing = false; }), 1000);
      const controls = e('div', null, 'wb-live-params'), search = field('Find a control', '', () => {});
      function parameters(query = '') { controls.replaceChildren(); const all = selected.parameters.filter(x => `${x.label} ${x.key}`.toLowerCase().includes(query.toLowerCase())); for (const x of all.slice(0, 24)) { if (typeof x.value === 'boolean') controls.append(check(x.label, x.value, v => tweak(x.key, v))); else if (typeof x.value === 'number') controls.append(range(x.label, x.value, x.min, x.max, x.step || .001, v => tweak(x.key, v))); else controls.append(select(x.label, x.value, x.choices, v => tweak(x.key, v))); } if (all.length > 24) controls.append(note(`${all.length} controls match. Search oscillator, envelope, cutoff or an effect.`)); }
      search.querySelector('input').oninput = ev => parameters(ev.target.value);
      refreshControls = () => parameters(search.querySelector('input').value); // (round 61) a ✦ Preset change shows on the sliders
      const advanced = e('details', null, 'wb-sound-section'); advanced.append(e('summary', 'Shape the sound · live controls'), search, controls, note('Changes reach the running instrument immediately. Opening a full patch snapshot briefly pauses audio.'), row(btn('Undo last tweak', async () => { await undo(); parameters(search.querySelector('input').value); }), btn('Refresh from native editor', async () => { await snapshot(); parameters(search.querySelector('input').value); say('Native controls refreshed.'); })));
      detail.append(advanced); parameters();
      const presets = e('details', null, 'wb-sound-section'); presets.append(e('summary', 'Keep a patch'), row(btn('Save bank preset', async () => { const r = await snapshot(); if (state.presets.length >= 12 || state.presets.reduce((n, p) => n + p.state.length, 0) + r.state.length > 9e6) throw Error('Preset bank is full. Export a patch or remove an older preset.'); state.presets.unshift({ label: `${p.name} / ${new Date().toLocaleTimeString()}`, path: p.path, name: p.name, state: r.state }); persist(); await draw(); }), btn('Export patch', async () => { const r = await snapshot(); await save('vst-patch', JSON.stringify({ v: 1, name: p.name, state: r.state }, null, 2), 'json'); })), file('Import patch', '.json', async f => { const data = JSON.parse(await f.text()); if (data.v !== 1 || data.name !== p.name || typeof data.state !== 'string' || data.state.length > 12e6) throw Error('Choose a patch for this instrument.'); before = { state: (await snapshot()).state }; await snapshot(data.state); await draw(); }));
      redraw = draw; // (round 61) a preset kept from ✦ Preset shows in this list
      for (const preset of state.presets.filter(s => s.name === p.name)) presets.append(row(e('span', preset.label), btn('Recall', async () => { before = { state: (await snapshot()).state }; await snapshot(preset.state); await draw(); }), btn('Remove', () => { state.presets.splice(state.presets.indexOf(preset), 1); persist(); draw(); })));
      detail.append(presets);
      const ai = e('details', null, 'wb-sound-section'), brief = field('Describe the sound', 'A warm, slightly unstable pluck with a short echo', () => {}, 'textarea'), agent = select('Sound designer', 'codex', [['codex', 'Astra'], ['claude', 'Claude']], () => {});
      ai.append(e('summary', 'Design a sound with Astra / Claude'), brief, agent, check('Allow AI patch edits for this selected instrument', canEdit, v => { canEdit = v; }), row(btn('Enable chat sound tools', async () => { const a = H.agents().find(a => a.mode === 'native' && a.engine === agent.querySelector('select').value && !a.dock); if (!a) throw Error('Add this agent to Hearth first.'); a.chatTools = true; await saveConfig(); say('Chat tools enabled for the next reply.'); }), btn('Prepare sound-design request', () => {
        const a = H.agents().find(a => a.mode === 'native' && a.engine === agent.querySelector('select').value && !a.dock); if (!a) throw Error('Add this agent to Hearth first.');
        if (!(a.engine === 'claude' ? a.chatTools !== false : a.chatTools === true || (a.hubTools === true && a.chatTools !== false))) throw Error('Enable chat sound tools first.');
        const text = `Design a sound in Hearth’s selected ${p.name}: ${brief.querySelector('textarea').value}\nUse chat_do op sound, action inspect with query to discover real parameters, then action apply with parameters. Use action render for an exportable audition; never claim you listened from numeric peak metrics. The live instrument receives patch edits immediately. Ask me how it sounds before refining. Only this selected Serum 2 or Vital is available; do not invent exposed controls or automate native editor clicks. Explain manual wavetable/sample imports when needed. Help: chat_do op sound action help. AI patch permission: ${canEdit ? 'enabled' : 'disabled until I turn it on'}.`;
        const previous = Native.view(a.id)?.input?.value || ''; Native.setDraft(a.id, `${previous ? previous + '\n\n' : ''}${text}`); activate(a.id);
      }))); detail.append(ai);
      const bounce = e('details', null, 'wb-sound-section'), result = e('div', null, 'wb-sound-bounce'); let noteNumber = 60, seconds = 4;
      bounce.append(e('summary', 'Export a sample'), row(range('MIDI note', noteNumber, 24, 96, 1, v => { noteNumber = v; }), range('Seconds', seconds, 1, 12, .5, v => { seconds = v; })), row(btn('Bounce WAV', async () => { await flushPatch(); const r = await call('render', { duration: seconds, notes: [{ note: noteNumber, time: 0, length: seconds * .65 }] }); showRender(r, result); }), btn('Save WAV', async () => { if (!rendered) throw Error('Bounce a sample first.'); await save('vst-sample', bytes(rendered.audio), 'wav'); })), result); detail.append(bounce); if (rendered) showRender(rendered, result);
    }
    if (selected) await draw(); return () => { if (ticket === alive) pause(); };
  }
  function showRender(r, target) {
    rendered?.player?.pause(); if (rendered?.url) URL.revokeObjectURL(rendered.url);
    const url = URL.createObjectURL(new Blob([bytes(r.audio)], { type: 'audio/wav' })), player = document.createElement('audio'); player.controls = true; player.volume = .2; player.src = url; rendered = { ...r, url, player };
    if (target) target.replaceChildren(player, h.note(`${r.seconds.toFixed(1)}s · stereo WAV${r.silent ? ' · silence detected; check the patch' : ''}`));
  }
  async function soundTool(args) {
    const action = args.action || 'help';
    if (action === 'help') return { actions: 'inspect {query?,offset?}, apply {parameters}, undo, render {note?,duration?}. Only the user-selected Serum 2 or Vital. Apply changes the persistent live instrument. User must enable AI patch edits. Render creates a WAV sample, not live playback. Never claim listening from peak metrics.' };
    if (!selected) throw Error('Load Serum 2 or Vital in Creative Playground → Sound desk first.');
    if (action === 'inspect') { const list = selected.parameters.filter(p => `${p.key} ${p.label}`.toLowerCase().includes(String(args.query || '').toLowerCase())), offset = Math.max(0, Math.floor(args.offset || 0)); return { name: selected.name, instrument: true, count: list.length, parameters: JSON.parse(JSON.stringify(list.slice(offset, offset + 40))), canEdit, live: playing }; }
    if (!canEdit) throw Error('Enable AI patch edits in the Sound desk first.');
    if (action === 'apply') { const values = WorkbenchCore.patch(selected.parameters, args.parameters); pendingPatch = { ...pendingPatch, ...values }; await flushPatch(); return { name: selected.name, changed: Object.keys(values), live: playing }; }
    if (action === 'undo') { await undo(); return { restored: selected.name }; }
    if (action === 'render') { await flushPatch(); const duration = Math.max(1, Math.min(12, Number(args.duration) || 4)), note = Math.max(24, Math.min(96, Math.round(Number(args.note) || 60))); const r = await call('render', { duration, notes: [{ note, time: 0, length: duration * .65 }] }); showRender(r); return { seconds: r.seconds, peak: r.peak, silent: r.silent, message: 'WAV ready in Sound desk → Export a sample. Ask the user to listen and describe the next change.' }; }
    throw Error('Unknown sound action.');
  }
  // (round 61, presethover61) a thin door for the ✦ Preset window (tools/preset-hover.js): the open instrument's real
  // parameters, a validated live patch (the same `patch` action and checks as the AI sound tool), its full state, and
  // the preset bank (same limits as "Save bank preset"). Nothing here runs unless the window asks.
  let refreshControls = () => {}, redraw = () => {};
  const door = {
    current: () => selected ? { name: selected.name, parameters: selected.parameters } : null,
    apply: async values => { if (!selected) throw Error('Choose Serum 2 or Vital first.'); const v = WorkbenchCore.patch(selected.parameters, values); pendingPatch = { ...pendingPatch, ...v }; await flushPatch(); refreshControls(); return Object.keys(v); },
    snapshot: async () => (await snapshot()).state,
    keep: async (label, state) => {
      const bank = h?.state; if (!bank || !selected) throw Error('Open the Sound desk first.');
      if (bank.presets.length >= 12 || bank.presets.reduce((n, p) => n + p.state.length, 0) + state.length > 9e6) throw Error('Preset bank is full. Export a patch or remove an older preset.');
      bank.presets.unshift({ label: String(label).slice(0, 80), path: selected.path, name: selected.name, state }); await h.persist(); await redraw();
    },
  };
  return { mount, pause, soundTool, door };
})();
