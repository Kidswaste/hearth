// Native sound desk: one instrument instance, shared by live keys, native editor and chat tools.
var WorkbenchVST = (() => {
  let h, selected = null, before = null, canEdit = false, alive = 0, poll = null, playing = false, rendered = null, statsText = null, held = new Set(), keyOff = () => {}, patchTimer = null, pendingPatch = {}, settings = { device: null, buffer: 512, gain: .2 }, deviceChosen = false;
  // (round 61, vstlive61) live mode: the picker value ('<id>', '<id>x' = WASAPI exclusive, '' = system), the controller
  // input, the last readout, streamed knob moves (each move reaches the instrument at once; one undo per gesture), the
  // native editor's close count (its knob changes are read back), and the event hub behind WorkbenchVST.api.
  const L = WorkbenchVSTLive, events = L.hub();
  let lastStats = null, editorCloses = null, paramsRefresh = () => {}, redraw = async () => {}, openSeq = 0, adviceText = null;
  let streamPatch = {}, streamTimer = null, tweakBase = null, baseTimer = null;
  let openNamed = null, plugins = []; // (round 62, parkjam62) open an instrument by name from outside the desk (Park mode)
  // (round 64, vstembed64) the plugin's own editor in the desk (tools/workbench-vst-embed.js), what was measured on the
  // way from a click to sound / controls, the controls an AI just moved (they glow on the desk for a moment)
  let vx = null, timings = {}, moved = new Map(), syncTick = 0, editorAuto = false;
  const E = typeof WorkbenchVSTEmbed !== 'undefined' ? WorkbenchVSTEmbed : null;
  Object.assign(settings, { value: '', midiIn: 'all' });
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  function liveJob() { const { device, exclusive } = L.parse(settings.value); return { device, exclusive, buffer: settings.buffer, gain: settings.gain, midiIn: settings.midiIn }; }
  function rememberLive() { if (!h?.state) return; h.state.live = { saved: L.remember(settings.value, lastDevices), buffer: settings.buffer, gain: settings.gain, midiIn: settings.midiIn }; h.persist(); }
  let lastDevices = null;
  // A note / knob move / volume without a reply: Hearth's window being busy never holds the instrument back.
  function fire(action, data = {}) {
    if (!selected) return Promise.resolve();
    if (hub.vst.send) { hub.vst.send({ action, plugin: selected.path, name: selected.name, ...data }); return Promise.resolve({ ok: true }); }
    return call(action, data);
  }
  async function startLive() { let s; try { s = await call('live-start', liveJob()); } catch (err) { if (typeof AudioDoctorDesk !== 'undefined') AudioDoctorDesk.failed(err); throw err; } showStats(s); return s; } // (round 64, audiodoctor64) a failed start opens the audio setup check in the desk
  function clearRender() { if (rendered?.player) { rendered.player.pause(); rendered.player.parentElement?.replaceChildren(); } if (rendered?.url) URL.revokeObjectURL(rendered.url); rendered = null; }
  async function call(action, data = {}) {
    if (!selected && action !== 'devices') throw Error('Choose Serum 2 or Vital first.');
    const r = await hub.vst.request({ action, plugin: selected?.path, name: selected?.name, ...data });
    if (!r.ok) throw Error(r.error); return r;
  }
  async function silence() { held.clear(); if (selected) await call('panic').catch(() => {}); }
  function pause() {
    alive++; clearInterval(poll); poll = null; clearTimeout(patchTimer); patchTimer = null; settleTweak();
    if (Object.keys(pendingPatch).length && selected) flushPatch().catch(() => {});
    keyOff(); keyOff = () => {}; silence(); if (selected) call('live-stop').catch(() => {}); playing = false;
    if (rendered?.player) rendered.player.pause();
    if (typeof PresetHover !== 'undefined') PresetHover.detach(); // (round 61, presethover61) the ✦ Preset window leaves with the desk
    vx?.detach(); vx = null; // (round 64, vstembed64) the editor hides with the desk (it stays open for the way back)
    if (typeof ParkJam !== 'undefined') ParkJam.pause(); // (round 62, parkjam62) the park ambience mic / dim leave with the desk
  }
  async function flushPatch() {
    const values = pendingPatch; pendingPatch = {}; if (!Object.keys(values).length) return;
    const old = {}; for (const p of selected.parameters) if (Object.hasOwn(values, p.key)) old[p.key] = p.value;
    await call('patch', { parameters: values }); clearRender(); before = { parameters: old };
    for (const p of selected.parameters) if (Object.hasOwn(values, p.key)) p.value = values[p.key];
  }
  // (round 61, vstlive61) knob moves stream: the first move goes out at once, then at most one message per 25 ms; the
  // values before the gesture become one undo step 400 ms after the last move. (Codex's 60 ms debounced flushPatch
  // still carries AI patches and undo, where the reply matters.)
  function tweak(key, value) {
    const p = selected?.parameters?.find(x => x.key === key); if (!p) return;
    tweakBase ||= {}; if (!Object.hasOwn(tweakBase, key)) tweakBase[key] = p.value;
    p.value = value; streamPatch[key] = value;
    const flush = () => { const values = streamPatch; streamPatch = {}; if (Object.keys(values).length) fire('patch', { parameters: values }).catch(e => h.say(e.message)); };
    if (!streamTimer) { flush(); streamTimer = setTimeout(() => { streamTimer = null; flush(); }, 25); }
    clearTimeout(baseTimer); baseTimer = setTimeout(settleTweak, 400);
  }
  function settleTweak() {
    clearTimeout(baseTimer); baseTimer = null; if (!tweakBase) return;
    const changed = Object.keys(tweakBase); before = { parameters: tweakBase }; tweakBase = null; clearRender();
    events.emit('params', { changed, source: 'desk' });
  }
  // (round 64, vstembed64) a state-only snapshot / recall (no 2,600-control listing), then the controls' values again
  // from the host's cached list (one fast read): the desk's sliders follow a recalled preset or the editor's knobs.
  async function snapshot(state) { await flushPatch(); if (state) clearRender(); const r = await call('snapshot', { stateOnly: true, ...(state ? { state } : {}) }); await refreshValues().catch(() => {}); return r; }
  async function refreshValues() {
    if (!selected || selected.loading) return;
    const path = selected.path, r = await call('controls'); if (selected?.path !== path || !r.ready) return;
    selected = { ...selected, parameters: r.parameters }; paramsRefresh();
  }
  // (round 64) the controls on screen, read again while the editor is in the desk (its knobs → the desk's sliders)
  async function syncVisible(keys) {
    if (!selected || selected.loading || !keys.length) return;
    const r = await call('values', { keys }); let changed = false;
    for (const [k, v] of Object.entries(r.values || {})) { const x = selected.parameters.find(y => y.key === k); if (x && x.value !== v.value) { x.value = v.value; changed = true; } }
    if (changed) paramsRefresh();
  }
  async function undo() { clearRender(); if (!before) throw Error('No patch change to undo.'); const saved = before; before = null; if (saved.state) await snapshot(saved.state); else { await call('patch', { parameters: saved.parameters }); for (const p of selected.parameters) if (Object.hasOwn(saved.parameters, p.key)) p.value = saved.parameters[p.key]; } }
  function showStats(s) {
    playing = s.playing;
    // (round 61, vstlive61) device · driver · latency · DSP load · underruns · controller, compared before written
    const text = L.statsText(s), tip = s.rateNote || L.advice(s); // (round 64) a device that refused 48 kHz says so first
    if (statsText && statsText.textContent !== text) statsText.textContent = text;
    if (adviceText && adviceText.textContent !== tip) adviceText.textContent = tip;
    lastStats = s; events.emit('stats', s);
    if (s.editor) vx?.apply(s.editor); // (round 64, vstembed64) the editor frame follows the host (mode, size, a plain note)
    // The native editor closed: read back the knobs the owner turned in it (the stream keeps playing meanwhile).
    if (Number.isInteger(s.editorCloses)) { if (editorCloses !== null && s.editorCloses > editorCloses && selected?.parameters?.length) snapshot().then(() => { paramsRefresh(); events.emit('params', { changed: null, source: 'editor' }); }).catch(() => {}); editorCloses = s.editorCloses; }
  }
  let opening = null;
  async function preload(helpers, {signal}={}) {
    h = helpers;
    if (!h.state.currentPatch && !h.state.selected) return;
    const runtime = await hub.vst.status();
    if (!runtime.ok) return 'Sound runtime needs setup; your saved preset is kept.';
    const scan = await hub.vst.scan(h.state.roots);
    if (!scan.ok) return scan.error || 'The instrument folder is unavailable.';
    plugins = scan.plugins.filter(p => !Array.isArray(h.state.projectPlugins) || h.state.projectPlugins.includes(p.name));
    const p = plugins.find(p => p.name === h.state.currentPatch?.name || p.path === h.state.selected);
    if (!p) return 'The saved instrument is not installed here; its preset is kept.';
    const abort=()=>hub.vst.stop().catch(()=>{}),check=()=>{if(signal?.aborted)throw new DOMException('Opening cancelled','AbortError');};
    signal?.addEventListener('abort',abort,{once:true});
    try{
      check();const r = await hub.vst.request({ action: 'open', plugin: p.path, name: p.name, live: false });
      if (!r.ok) throw Error(r.error);check();
      if(h.state.currentPatch?.name===p.name){const restored=await hub.vst.request({action:'snapshot',plugin:p.path,name:p.name,stateOnly:true,state:h.state.currentPatch.state});if(!restored.ok)throw Error(restored.error);}
      const end=Date.now()+60000;let controls;
      do{check();controls=await hub.vst.request({action:'controls',plugin:p.path,name:p.name});if(!controls.ok)throw Error(controls.error);if(!controls.ready)await new Promise(r=>setTimeout(r,100));}while(!controls.ready&&Date.now()<end);
      check();if(!controls.ready)throw Error('The instrument controls are still loading. Retry opening the project.');
      selected = { ...p, parameters: controls.parameters, loading: false };playing=false;
    }catch(err){await hub.vst.stop();throw err;}finally{signal?.removeEventListener('abort',abort);}
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
    if (typeof AudioDoctorDesk !== 'undefined') AudioDoctorDesk.attach(setup); // (round 64, audiodoctor64) 🎚 Check my audio setup
    if (typeof ParkJam !== 'undefined') ParkJam.attach(out, setup, h); // (round 62, parkjam62) one 🌳 Park mode button in this row
    if (!runtime.ok) { out.append(note(`${runtime.error} Setup installs a private Pedalboard + PortAudio runtime in Hearth. Your installed plugins remain where they are.`)); return; }
    const scan = await hub.vst.scan(state.roots); if (ticket !== alive) return; if (!scan.ok) throw Error(scan.error);
    if(Array.isArray(state.projectPlugins))scan.plugins=scan.plugins.filter(p=>state.projectPlugins.includes(p.name));
    const chooser = e('div', null, 'wb-sound-picker'), detail = e('div', null, 'wb-sound-detail'); out.append(chooser, detail);
    // (round 61, vstlive61) the remembered audio settings (device by name: ids change between sessions)
    if (state.live && !deviceChosen) { settings.buffer = L.BUFFERS.some(([b]) => b === state.live.buffer) ? state.live.buffer : settings.buffer; settings.gain = Number.isFinite(state.live.gain) ? state.live.gain : settings.gain; settings.midiIn = typeof state.live.midiIn === 'string' ? state.live.midiIn : 'all'; }
    // (round 61, vstlive61) open = load the instrument in its own host (kept for the session) and, when chosen by the
    // owner, start live audio in the same step; the controls are read afterwards while the keys already play.
    function open(p, options) { const task = openInstrument(p, options); opening = task; task.finally(() => { if (opening === task) opening = null; }).catch(() => {}); return task; }
    async function openInstrument(p, { live }) {
      const mine = ++openSeq, t0 = performance.now();
      say(`Opening ${p.name}…`); await flushPatch(); await silence();
      // (round 64, vstembed64) the editor in the desk belongs to the instrument shown: the previous one's closes
      if (selected && selected.path !== p.path && lastStats?.editor && lastStats.editor.mode !== 'closed') { vx?.detach(); vx = null; await hub.vst.request({ action: 'editor-close', plugin: selected.path, name: selected.name }).catch(() => {}); }
      // The first open of the session picks the device before it goes live (the UA on ASIO, or the remembered one).
      if (!deviceChosen) {
        const d = await hub.vst.request({ action: 'devices', plugin: p.path, name: p.name });
        if (d.ok) { lastDevices = d; settings.value = L.resolve(state.live?.saved, d) ?? L.options(d).preferred; settings.device = L.parse(settings.value).device; deviceChosen = true; }
      }
      const r = await hub.vst.request({ action: 'open', plugin: p.path, name: p.name, live, ...liveJob() });
      if (!r.ok) { if (live && typeof AudioDoctorDesk !== 'undefined') AudioDoctorDesk.failed(r.error); throw Error(r.error); } if (ticket !== alive || mine !== openSeq) return; // (round 64, audiodoctor64)
      clearRender(); selected = { name: p.name, path: p.path, parameters: [], loading: true }; state.selected = p.path; canEdit = false; before = null; editorCloses = null; persist();
      // (round 64, vstembed64) the click → playable time (host start + plugin load + live start), then controls ready
      editorAuto = true; // (round 64) this open may bring the editor into the desk (once)
      timings = { instrument: p.name, readyMs: Math.round(performance.now() - t0), hostStartMs: r.hostStartMs ?? null, loadedMs: r.loadedMs ?? null, live: !!live };
      // (round 64) the host may have been restarted (Reset host, the audio doctor's ASIO switch): the editor as it is now
      try { const now = await call('live-status'); if (now && now.editor) lastStats = now; } catch { /* the readout comes with the poll */ }
      if(state.currentPatch?.name===p.name && state.currentPatch.state){const restored=await hub.vst.request({action:'snapshot',plugin:p.path,name:p.name,stateOnly:true,state:state.currentPatch.state});if(!restored.ok)throw Error(restored.error);}
      await draw(); if (r.playing !== undefined) showStats(r);
      say(`${p.name} ready in ${timings.readyMs} ms${r.playing ? ' · live: play the keys or your controller' : ' · press a key to start live audio'}. Reading its controls…`);
      events.emit('instrument', api.current());
      // (round 64) the controls arrive from the host's cached list (or as they're read the first time: shown as they come)
      for (let i = 0, all = true; ; i++) {
        let info = await hub.vst.request({ action: 'controls', plugin: p.path, name: p.name, ...(all ? {} : { limit: 240 }) }); // while reading: the first ones only
        if (ticket !== alive || mine !== openSeq || selected?.path !== p.path) return;
        if (!info.ok) { info = await hub.vst.request({ action: 'inspect', plugin: p.path, name: p.name }); if (!info.ok) throw Error(info.error); info.ready = true; } // Codex's full read
        if (ticket !== alive || mine !== openSeq || selected?.path !== p.path) return;
        selected = { ...info, name: p.name, path: p.path, loading: !(info.ready && all), total: info.count ?? info.parameters.length }; paramsRefresh();
        if (info.ready && !all) { all = true; continue; } // the list just completed: ask for all of it once
        if (info.ready) { timings.controlsMs = Math.round(performance.now() - t0); timings.controlsSource = info.source || 'read'; timings.controls = info.parameters.length; break; }
        all = false; await new Promise(res => setTimeout(res, i < 20 ? 120 : 400));
      }
      events.emit('instrument', api.current());
      say(`${p.name} · ${selected.parameters.length} controls ready in ${timings.controlsMs} ms${timings.controlsSource === 'cache' ? '' : ' (read once; next time from the list kept on disk)'}.`);
    }
    plugins = scan.plugins; openNamed = (name, live) => { const p = scan.plugins.find(x => x.name === name) || scan.plugins[0]; if (!p) throw Error('Install Serum 2 or Vital, then choose its VST3 folder.'); return open(p, { live }); }; // (round 62, parkjam62)
    for (const p of scan.plugins) {
      const b = btn(p.name, () => open(p, { live: true })); b.classList.add('wb-instrument-card'); b.setAttribute('aria-pressed', String(selected?.path === p.path)); chooser.append(b);
    }
    // Opening the desk again after a restart loads the last instrument straight away (no sound until a key is played).
    const last = !selected && scan.plugins.find(p => p.path === state.selected || p.name === state.currentPatch?.name);
    if (last) open(last, { live: false }).catch(err => say(err.message));
    if (!scan.plugins.length) detail.append(note('Install Serum 2 or Vital, then choose its VST3 folder. This desk only loads those two instruments.'));
    async function draw() {
      if (!selected || ticket !== alive) return;
      chooser.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === selected.name)));
      const p = selected; detail.replaceChildren();
      const transport = e('div', null, 'wb-live-transport'); statsText = e('output', 'PAUSED', 'wb-live-stats'); adviceText = e('p', '', 'wb-note wb-live-advice');
      const devices = await call('devices'); if (ticket !== alive) return; lastDevices = devices;
      // (round 61, vstlive61) the picker: ASIO (the Universal Audio driver) first, then WASAPI exclusive / shared, the
      // UA interface preselected (ASIO › WASAPI exclusive), or the device remembered from last time when it is there.
      const picked = L.options(devices);
      if (!deviceChosen) { settings.value = L.resolve(h.state.live?.saved, devices) ?? picked.preferred; deviceChosen = true; }
      if (!picked.options.some(([v]) => v === settings.value)) settings.value = picked.preferred;
      settings.device = L.parse(settings.value).device;
      const restart = () => { rememberLive(); if (!playing) return; silence().then(startLive).catch(err => say(err.message)); };
      const midiChoices = devices.midiBackend ? [['all', 'All controllers'], ...(devices.midiInputs || []).map(n => [n, n]), ['off', 'Off']] : [['off', 'Controller: Windows only (or python-rtmidi)']];
      if (!midiChoices.some(([v]) => v === settings.midiIn)) settings.midiIn = midiChoices[0][0];
      const setup = e('div', null, 'wb-live-setup'); transport.append(setup); setup.append( // (round 61) one compact row
        select('Audio output', settings.value, picked.options, v => { settings.value = v; settings.device = L.parse(v).device; restart(); }),
        select('Buffer', settings.buffer, L.BUFFERS, v => { settings.buffer = Number(v); restart(); }),
        range('Monitor volume', settings.gain, 0, .5, .01, v => { settings.gain = v; h.state.live = { ...(h.state.live || {}), gain: v }; fire('volume', { gain: v }).catch(err => say(err.message)); }),
        select('MIDI in', settings.midiIn, midiChoices, v => { settings.midiIn = v; rememberLive(); call('midi-in', { midiIn: v }).catch(err => say(err.message)); }),
        select('Phrase', '', [['', 'Phrase · off'], ...Object.entries(L.PHRASES).map(([k, x]) => [k, x.label])], v => playPhrase(v || null).catch(err => say(err.message))));
      if (typeof AudioDoctorDesk !== 'undefined') setup.append(AudioDoctorDesk.button(true)); // (round 64, audiodoctor64) next to Audio output · Buffer
      if (devices.asioNote) transport.append(note(devices.asioNote));
      else if (devices.asioDll && !devices.asio && picked.hasUA) transport.append(note('No ASIO driver answered: install / start UA Connect or UAD Console, then Reset host. WASAPI exclusive plays meanwhile.'));
      const startButton = btn(playing ? 'Live audio on' : 'Start live audio', async () => { await startLive(); rememberLive(); startButton.textContent = 'Live audio on'; });
      transport.append(row(startButton, btn('Pause audio', async () => { await silence(); showStats(await call('live-stop')); startButton.textContent = 'Start live audio'; }), btn('All notes off', silence)), statsText, adviceText);
      detail.append(e('h3', `${p.name} / live instrument`), transport);
      // (round 64, vstembed64) the plugin's own window, in the desk: "Open editor here" / "Pop out" / "Close editor".
      // Opens here by itself on Windows (and wherever the owner chose "here" last time); live audio never waits for it.
      vx?.detach(); vx = null;
      if (E) {
        const pref = h.state.editorHere || (hub.native?.os === 'win' ? 'here' : 'off');
        const known = lastStats?.plugin === p.path ? lastStats.editor : null; // a redraw: the editor as the host last said
        vx = E.frame({ e, name: p.name, os: hub.native?.os, say, state: known, auto: pref === 'here' && editorAuto && !(known && known.mode !== 'closed'),
          call: async (action, data = {}) => { clearRender(); return call(action, data); },
          fire: (action, data) => { fire(action, data); },
          remember: v => { if (h.state.editorHere !== v) { h.state.editorHere = v; h.persist(); } } });
        editorAuto = false; detail.append(vx.el);
        call('live-status').then(showStats).catch(() => {}); // the editor may already be open (the desk was away)
      }
      const keys = e('div', null, 'wb-live-keys'), keyMap = 'awsedftgyhujkolp;', labels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E']; let octave = 4;
      const keyButtons = [];
      // (round 61, vstlive61) a key pressed while paused starts live audio first (no 'start first' detour); notes go out
      // without waiting for a reply.
      async function on(i) { const n = (octave + 1) * 12 + i; if (held.has(n)) return; held.add(n); keyButtons[i]?.classList.add('held'); if (!playing) { await startLive(); startButton.textContent = 'Live audio on'; } if (held.has(n)) await fire('midi', { note: n, on: true }); }
      async function off(i) { const n = (octave + 1) * 12 + i; held.delete(n); keyButtons[i]?.classList.remove('held'); if (playing) await fire('midi', { note: n, on: false }); }
      labels.forEach((label, i) => { const key = e('button', `${label} · ${keyMap[i].toUpperCase()}`, label.includes('♯') ? 'wb-key sharp' : 'wb-key'); key.type = 'button'; key.setAttribute('aria-label', `Play ${label}`); key.onpointerdown = ev => { ev.preventDefault(); try { key.setPointerCapture(ev.pointerId); } catch {} on(i).catch(err => say(err.message)); }; key.onpointerup = key.onpointercancel = key.onlostpointercapture = () => off(i).catch(() => {}); keyButtons.push(key); keys.append(key); });
      const down = ev => { if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName) || ev.target.isContentEditable) return; const i = keyMap.indexOf(ev.key.toLowerCase()); if (i >= 0) { ev.preventDefault(); on(i).catch(err => say(err.message)); } };
      const up = ev => { const i = keyMap.indexOf(ev.key.toLowerCase()); if (i >= 0) off(i).catch(() => {}); };
      const blur = () => { keyButtons.forEach(b => b.classList.remove('held')); silence(); };
      keyOff(); window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
      keyOff = () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
      detail.append(row(select('Octave', octave, [[2, '2 · bass'], [3, '3 · low'], [4, '4 · middle'], [5, '5 · high']], v => { silence(); octave = Number(v); keyButtons.forEach(b => b.classList.remove('held')); }), note('Hold keys A–; or press the keyboard below.')), keys);
      clearInterval(poll); poll = setInterval(() => {
        call('live-status').then(showStats).catch(err => { say(err.message); clearInterval(poll); playing = false; vx?.apply({ mode: 'closed', size: null }); }); // (round 64) a host gone takes its editor with it
        // (round 64, vstembed64) with the editor in the desk, the controls on screen follow its knobs (every 2 s, only those)
        if (vx?.state.mode === 'embedded' && !(syncTick++ % 2) && controls.isConnected && !controls.contains(document.activeElement)) syncVisible([...controls.querySelectorAll('[data-key]')].map(n => n.dataset.key)).catch(() => {});
      }, 1000);
      const controls = e('div', null, 'wb-live-params'), search = field('Find a control', '', () => {});
      function parameters(query = '') {
        controls.replaceChildren();
        // (round 64, vstembed64) the first time a plugin version is read, its controls show as they arrive
        if (selected.loading && !selected.parameters?.length) { controls.append(note('Reading the instrument’s controls… the keys already play.')); return; }
        const all = selected.parameters.filter(x => `${x.label} ${x.key}`.toLowerCase().includes(query.toLowerCase())), now = Date.now();
        for (const x of all.slice(0, 24)) {
          const n = typeof x.value === 'boolean' ? check(x.label, x.value, v => tweak(x.key, v)) : typeof x.value === 'number' ? range(x.label, x.value, x.min, x.max, x.step || .001, v => tweak(x.key, v)) : select(x.label, x.value, x.choices, v => tweak(x.key, v));
          n.dataset.key = x.key; if ((moved.get(x.key) || 0) > now) n.classList.add('vx-moved'); // (round 64) an AI just moved it
          if (typeof x.value === 'number') { const input = n.querySelector('input'); if (input) input.value = x.value; } // (round 64) set again once min / max / step are on (a 0–1 value was rounded on the default 0–100 scale)
          controls.append(n);
        }
        if (all.length > 24) controls.append(note(`${all.length} controls match. Search oscillator, envelope, cutoff or an effect.`));
        if (selected.loading) controls.append(note(`${selected.parameters.length} of ${selected.total || '…'} controls read; the rest arrive in a moment.`));
      }
      search.querySelector('input').oninput = ev => parameters(ev.target.value);
      paramsRefresh = () => { if (ticket === alive && controls.isConnected) parameters(search.querySelector('input').value); }; redraw = draw;
      const advanced = e('details', null, 'wb-sound-section'); advanced.append(e('summary', 'Shape the sound · live controls'), search, controls, note('Changes reach the running instrument immediately; reading or recalling a full patch keeps it playing.'), row(btn('Undo last tweak', async () => { await undo(); parameters(search.querySelector('input').value); }), btn('Refresh from native editor', async () => { await snapshot(); parameters(search.querySelector('input').value); say('Native controls refreshed.'); })));
      detail.append(advanced); parameters();
      const presets = e('details', null, 'wb-sound-section'); presets.append(e('summary', 'Keep a patch'), row(btn('Save bank preset', () => savePreset()), /* (round 63, soundbank63) the Sound bank picker */ ...(typeof SoundBank !== 'undefined' ? [btn('Sound bank…', () => SoundBank.open())] : []), btn('Export patch', async () => { const r = await snapshot(); await save('vst-patch', JSON.stringify({ v: 1, name: p.name, state: r.state }, null, 2), 'json'); })), file('Import patch', '.json', async f => { const data = JSON.parse(await f.text()); if (data.v !== 1 || data.name !== p.name || typeof data.state !== 'string' || data.state.length > 12e6) throw Error('Choose a patch for this instrument.'); before = { state: (await snapshot()).state }; await snapshot(data.state); await draw(); }));
      for (const preset of state.presets.filter(s => s.name === p.name)) presets.append(row(e('span', preset.label), btn('Recall', () => loadPreset(preset)), btn('Remove', () => { state.presets.splice(state.presets.indexOf(preset), 1); persist(); draw(); })));
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
      if (typeof ParkJam !== 'undefined') detail.append(ParkJam.section(h)); // (round 62, parkjam62) Park jam · capture the moment (a fold)
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
    if (action === 'help') return { actions: 'inspect {query?,offset?}, apply {parameters}, undo, render {note?,duration?}, status, play {note?|phrase?: stab|arp|bass|pad|off}. Only the user-selected Serum 2 or Vital. Apply changes the persistent live instrument. User must enable AI patch edits. Render creates a WAV sample, not live playback; play sounds through the user\'s speakers only while live audio is on. Never claim listening from peak metrics.' };
    if (!selected) throw Error('Load Serum 2 or Vital in Creative Playground → Sound desk first.');
    // (round 61, vstlive61) live audition for the chat: only when the owner already has live audio on.
    if (action === 'status') return { name: selected.name, live: playing, controls: selected.parameters.length, output: lastStats?.playing ? { device: lastStats.deviceName, driver: lastStats.api, latencyMs: lastStats.latencyMs, dspLoad: lastStats.load, underruns: lastStats.underruns } : null };
    if (action === 'play') { if (!playing) throw Error('Live audio is paused: ask the user to press a key or Start live audio.'); if (args.phrase !== undefined) { await playPhrase(args.phrase === 'off' ? null : String(args.phrase)); return { phrase: args.phrase }; } const note = Math.max(24, Math.min(96, Math.round(Number(args.note) || 60))); await api.play(note); return { played: note, message: 'Ask the user how it sounds.' }; }
    if (action === 'inspect') { const list = selected.parameters.filter(p => `${p.key} ${p.label}`.toLowerCase().includes(String(args.query || '').toLowerCase())), offset = Math.max(0, Math.floor(args.offset || 0)); return { name: selected.name, instrument: true, count: list.length, parameters: list.slice(offset, offset + 40).map(({ kind, ...p }) => JSON.parse(JSON.stringify(p))) /* (round 64) no extra field for the AI */, canEdit, live: playing }; }
    if (!canEdit) throw Error('Enable AI patch edits in the Sound desk first.');
    // (round 64, vstembed64) applied silently: the plugin's window and the desk's sliders show it; the AI is asked for
    // one short line, not a list of controls (same validation and undo as before, through api.set)
    if (action === 'apply') { const r = await api.set(args.parameters, { source: 'ai-chat' }); return { name: selected.name, changed: r.changed.length, live: playing, note: 'Applied; it shows in the plugin window and the desk. Tell the user in one short line; do not list controls or values.' }; }
    if (action === 'undo') { await api.undo(); return { restored: selected.name }; }
    if (action === 'render') { await flushPatch(); const duration = Math.max(1, Math.min(12, Number(args.duration) || 4)), note = Math.max(24, Math.min(96, Math.round(Number(args.note) || 60))); const r = await call('render', { duration, notes: [{ note, time: 0, length: duration * .65 }] }); showRender(r); return { seconds: r.seconds, peak: r.peak, silent: r.silent, message: 'WAV ready in Sound desk → Export a sample. Ask the user to listen and describe the next change.' }; }
    throw Error('Unknown sound action.');
  }
  // (round 61, vstlive61) phrases play in the host's audio thread, sample-accurate, whatever Hearth's window is doing.
  async function playPhrase(name, octave = 4) {
    need();
    if (!name) { const r = await call('sequence', { sequence: [] }); events.emit('phrase', null); return r; }
    const x = L.phrase(name, octave); if (!x) throw Error('Unknown phrase: ' + name);
    if (!playing) await startLive();
    const r = await call('sequence', { sequence: x.notes, loop: x.loop }); events.emit('phrase', name); return r;
  }
  function need() { if (!selected || !h) throw Error('Open Serum 2 or Vital in Creative Playground → Sound desk first.'); }
  function ready() { need(); if (selected.loading) throw Error(`${selected.name} is still reading its controls; try again in a moment.`); }
  function presetsOf() { return (h?.state?.presets || []).filter(s => s.name === selected?.name); }
  async function savePreset(label) {
    ready(); const state = h.state, r = await snapshot();
    if (state.presets.length >= 12 || state.presets.reduce((n, p) => n + p.state.length, 0) + r.state.length > 9e6) throw Error('Preset bank is full. Export a patch or remove an older preset.');
    const entry = { label: String(label || `${selected.name} / ${new Date().toLocaleTimeString()}`).slice(0, 100), path: selected.path, name: selected.name, state: r.state };
    state.presets.unshift(entry); await h.persist(); events.emit('preset', { action: 'save', label: entry.label }); await redraw(); return { label: entry.label };
  }
  async function loadPreset(which) {
    ready(); const list = presetsOf();
    const preset = typeof which === 'number' ? list[which] : typeof which === 'string' ? list.find(x => x.label === which) : which && typeof which.state === 'string' ? which : null;
    if (!preset) throw Error('No such preset for this instrument.');
    if (preset.state.length > 12e6) throw Error('Invalid plugin state.');
    before = { state: (await snapshot()).state }; await snapshot(preset.state);
    events.emit('preset', { action: 'load', label: preset.label || null }); events.emit('params', { changed: null, source: 'preset' }); await redraw(); return { label: preset.label || null };
  }
  // (round 61, vstlive61) The instrument's API for other Hearth features (presethover61's preset-writing chat hover sits
  // on top of it). Documented in docs/upgrades/vstlive61.md. Everything works on the instrument the owner opened in the
  // Sound desk; nothing here picks or loads another plugin or opens the native editor.
  const api = {
    version: 1,
    current: () => selected ? { name: selected.name, path: selected.path, ready: !selected.loading, controls: selected.parameters?.length || 0, live: playing, canEdit, stats: lastStats } : null,
    parameters({ query = '', offset = 0, limit = 40 } = {}) { ready(); const q = String(query).toLowerCase(), list = selected.parameters.filter(x => `${x.key} ${x.label}`.toLowerCase().includes(q)), o = Math.max(0, Math.floor(offset) || 0), n = Math.max(1, Math.min(200, Math.floor(limit) || 40)); return { count: list.length, parameters: WorkbenchCore.copy(list.slice(o, o + n)) }; },
    get(keys = []) { ready(); const want = new Set(keys); return Object.fromEntries(selected.parameters.filter(x => want.has(x.key)).map(x => [x.key, x.value])); },
    async values(keys = []) { ready(); const r = await call('values', { keys }); for (const [k, v] of Object.entries(r.values)) { const x = selected.parameters.find(y => y.key === k); if (x) x.value = v.value; } return r.values; },
    async set(values, { source = 'app' } = {}) { ready(); const v = WorkbenchCore.patch(selected.parameters, values); pendingPatch = { ...pendingPatch, ...v }; await flushPatch(); if (source !== 'desk') { const until = Date.now() + 1600; for (const k of Object.keys(v)) moved.set(k, until); } paramsRefresh(); events.emit('params', { changed: Object.keys(v), source }); return { changed: Object.keys(v), live: playing }; },
    async undo() { await undo(); paramsRefresh(); events.emit('params', { changed: null, source: 'undo' }); },
    presets: () => presetsOf().map((x, index) => ({ index, label: x.label })),
    savePreset, loadPreset,
    async exportPatch() { ready(); const r = await snapshot(); return { v: 1, name: selected.name, state: r.state }; },
    async play(note = 60, { velocity = 100, length = .6 } = {}) { need(); if (!playing) await startLive(); return call('sequence', { sequence: [{ note, time: 0, length, velocity }], loop: 0 }); },
    phrase: (name, octave) => playPhrase(name, octave),
    async start() { need(); return startLive(); },
    async stop() { need(); await silence(); const s = await call('live-stop'); showStats(s); return s; },
    status: () => lastStats,
    allowAI(v) { canEdit = !!v; events.emit('consent', canEdit); return canEdit; },
    // (round 62, parkjam62) additive, same version: what Park mode needs from the desk. instruments() → [names] the desk
    // found · open(name, { live }) opens one (as its card does) · devices() → the host's device list · output({ value?,
    // buffer? }) sets the desk's picker / buffer (remembered like the owner's own choice; a live stream restarts on it)
    instruments: () => plugins.map(p => p.name),
    async open(name, { live = false } = {}) { if (!openNamed) throw Error('Open Creative Playground → Sound desk first.'); await openNamed(name, live); return api.current(); },
    async devices() { const d = await call('devices'); lastDevices = d; return d; },
    output: () => ({ value: settings.value, buffer: settings.buffer, device: lastDevices?.devices?.find(d => d.id === L.parse(settings.value).device) || null }),
    async setOutput({ value, buffer, remember = true } = {}) { // remember: false = for this session only (Park mode keeps its own per place)
      need(); if (buffer !== undefined && !L.BUFFERS.some(([b]) => b === buffer)) throw Error('Choose a 64–1024 sample buffer.');
      if (value !== undefined) { settings.value = String(value); settings.device = L.parse(settings.value).device; deviceChosen = true; }
      if (buffer !== undefined) settings.buffer = buffer;
      if (remember) rememberLive(); if (playing) { await silence(); await startLive(); } await redraw(); return api.output();
    },
    aiAllowed: () => canEdit,
    on: (type, fn) => events.on(type, fn),
    // (round 64, vstembed64) additive, same version: the last open's measured times { readyMs, controlsMs, controlsSource,
    // hostStartMs, loadedMs }, and the editor frame's state { mode: closed | opening | embedded | floating, size, note }
    timings: () => ({ ...timings }),
    editor: () => vx ? { ...vx.state } : null
  };
  // (round 61, presethover61) a thin door for the ✦ Preset window (tools/preset-hover.js), now over vstlive61's api:
  // the open instrument's real parameters, a validated live patch (api.set: WorkbenchCore.patch + the host's checks, one
  // undo step, streamed to the running instrument), its full state, and the preset bank (same limits as "Save bank preset").
  const door = {
    current: () => selected ? { name: selected.name, parameters: selected.loading ? [] : selected.parameters, ready: !selected.loading, live: playing } : null,
    apply: async values => (await api.set(values, { source: 'preset-hover' })).changed,
    snapshot: async () => (await snapshot()).state,
    fresh: async keys => api.values(keys), // (round 64, vstembed64) the values now (the editor's knobs may have moved)
    keep: async (label, state) => {
      const bank = h?.state; if (!bank || !selected) throw Error('Open the Sound desk first.');
      if (bank.presets.length >= 12 || bank.presets.reduce((n, p) => n + p.state.length, 0) + state.length > 9e6) throw Error('Preset bank is full. Export a patch or remove an older preset.');
      bank.presets.unshift({ label: String(label).slice(0, 80), path: selected.path, name: selected.name, state, from: 'preset-hover' }); await h.persist(); events.emit('preset', { action: 'save', label: String(label).slice(0, 80), source: 'preset-hover' }); await redraw(); // (round 63, soundbank63) from / source: the Sound bank shows it as made by the ✦ Preset window
    },
  };
  // WorkbenchVST.live: what preset-hover.js's adapter prefers (current / apply / snapshot / keep), the same door.
  async function saveWorkspace(){
    if(opening)await opening;
    if(!selected||selected.loading||!h?.state)return;
    const target=h,instrument=selected;
    clearTimeout(streamTimer); streamTimer=null;
    const streamed=streamPatch;streamPatch={};
    if(Object.keys(streamed).length)await call('patch',{parameters:streamed});
    await flushPatch();const r=await hub.vst.request({action:'snapshot',plugin:instrument.path,name:instrument.name,stateOnly:true});
    if(!r.ok)throw Error(r.error||'The instrument could not save its current sound.');
    if(typeof r.state!=='string'||r.state.length>12e6)throw Error('The instrument state is missing or too large to save. Export its preset before closing.');
    target.state.currentPatch={name:instrument.name,state:r.state};await target.persist();
  }
  async function resetWorkspace(){pause();openSeq++;if(selected)await hub.vst.stop();clearRender();selected=null;before=null;h=null;openNamed=null;plugins=[];canEdit=false;deviceChosen=false;}
  return { mount, pause, preload, saveWorkspace, resetWorkspace, soundTool, api, door, live: door };
})();
