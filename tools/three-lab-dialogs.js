// (round 158, split158) The Lab's dialogs and menus used now and then: keys, history, all your sketches, templates, web page export, ask about a layer, delete, cycle looks, the preview's ⋯, triggers presets, quality.
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labpartdialogs`, tools/three.js labPart). K is
// what it reaches inside the Lab (the sketch tab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).dialogs = (K) => {
  // ?: the Lab's keys in one sheet
  function labKeys() {
    const rows = [['Space', 'Play / pause'], ['T · Shift+T', 'Tap tempo (locks to the song\'s grid) · this tap is the 1 · with live sound: sets the latency'], [', · .', 'Nudge the grid 5 ms earlier / later by ear (Shift 1 ms, Alt 20 ms)'], ['K · S · H', 'Kick / snare / hit marker at the playhead'], ['Q', 'Quantize taps to the grid on / off'], ['C', 'Cue here'], ['1–9', 'Jump to cue'],
      ['R · Shift+R', 'Shuffle the sliders · the shuffle before'], ['Ctrl+S · Ctrl+Shift+S', 'Save the sliders · as a look'], ['/', 'Lab search: actions, effects, layers, sliders, templates…'],
      ['F · \\', 'Freeze the picture'], ['Z · Shift+Z', 'Frame the subject · back to the scene\'s own camera'], ['Two fingers · pinch · right-drag', 'Turn around the scene · zoom · turn (Shift: pan)'], ['.', 'One frame (while frozen)'], ['|', 'Pin this frame to compare (onion / wipe)'], ['Shift+1–5', 'Fit · 9:16 · 16:9 · 4:5 · 1:1'],
      ['Shift+L', 'Live sound on / off'], ['O', 'Your sketches'], ['`', 'Console'], ['P · Shift+F', 'Present · Focus'], ['I · PgUp / PgDn', 'In Present: info · other sketches'],
      ['Shift+drag the waveform', 'Draw a loop'], ['= · - · 0', 'Zoom in · out · whole song'], ['[ · ]', 'Loop start / end'], ['Home · End', 'Start / end (of the loop)'], ['M', 'Mute the music (the sketch still reacts)'], ['A', 'Show every automation curve'], ['L', 'Loop this bar'], ['G', 'Next snap setting'],
      ['N', 'Note with a screenshot'], ['W', 'Write mode'], ['E', 'Edit the scene'],
      ['Alt+1–9', 'Hide / show a layer'], ['Alt+Shift+1–9', 'Only that layer'], ['Ctrl+R · Ctrl+Shift+Enter', 'Restart the simulation'], ['Ctrl+Z', 'Undo (timeline)'], ['Esc', 'Deselect, forget taps, leave Present']];
    // with video footage on the timeline its frame keys come first (tools/three-frames.js)
    if (typeof ThreeFrames !== 'undefined' && ThreeFrames.on) rows.unshift(...ThreeFrames.KEYS.map(([k, v]) => [k, `Footage: ${v}`]));
    const d = el('dialog', { class: 'lab-keys' }, el('h2', { text: 'Lab keys' }), el('div', { class: 'lab-keys-grid' }, rows.flatMap(([k, v]) => [el('kbd', { text: k }), el('span', { text: v })])),
      el('div', { class: 'dialog-actions' }, el('button', { class: 'primary', text: 'Got it', on: { click: () => d.close() } })));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d); K.openLight(d);
  }
  function newMenu(e) { ThreeTweaks.menu(e.clientX, e.clientY, ['New sketch from', ...ThreeData.TEMPLATES.map((t) => [t.name, t.desc || '', () => K.create(t.name, t.code)]), ['Duplicate this one', K.current?.name || '', () => K.duplicate()]]); }
  function snippetMenu() {
    const r = K.labMoreBtn.getBoundingClientRect();
    K.setCodeVisible(true);
    ThreeTweaks.menu(r.right - 290, r.bottom + 4, ['Insert a snippet at the cursor', ...ThreeData.SNIPPETS.map((sn) => [sn.name, '', () => K.editor.insertAtCursor(sn.code)])]);
  }
  function versionMenu() {
    const r = K.labMoreBtn.getBoundingClientRect();
    ThreeTweaks.menu(r.right - 290, r.bottom + 4, ['three.js version', ...ThreeData.VERSIONS.map((vv) => [`r${vv.split('.')[1]}`, vv, () => { K.version.value = vv; K.version.dispatchEvent(new Event('change')); }, vv === store.get('three.version', ThreeData.VERSIONS[0])])]);
  }
  function consoleMenu(e) { ThreeTweaks.menu(e.clientX, e.clientY, ['Console shows', ...K.CONSOLE_MODES.map(([m, l]) => [l, '', () => K.setConsoleMode(m), K.consoleMode === m]), ['Errors only', 'Hide console.log lines', () => { const on = !store.get('three.consoleErrors', false); store.set('three.consoleErrors', on); K.consoleWrap.classList.toggle('errors-only', on); }, store.get('three.consoleErrors', false)], ['Clear', '', () => { K.consoleBox.replaceChildren(); K.consoleLines = []; }], ['Copy', '', () => K.api.cmd.console('copy')]]); }
  function fixErrors() {
    const errs = K.consoleLines.filter((l) => l.level === 'error' || l.level === 'warn');
    if (!errs.length) { toast('No errors in the console', { timeout: 1200 }); return false; }
    K.askDirector(`The Lab console shows these ${errs.length === 1 ? 'problems' : `${errs.length} problems`} in "${K.current?.name}". Find the cause (three_read_code / three_search_code) and fix it with three_edit_code:\n${errs.slice(-12).map((l) => `- ${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n')}`, { send: false });
    return true;
  }
  function presentMenu(e) { ThreeTweaks.menu(e.clientX, e.clientY, ['Present', ['Present', 'P', () => K.togglePresent()], K.player.loaded ? ['From the top of the song', 'Starts it playing', () => { K.player.seek(0); K.player.toggle(true); K.togglePresent(); }] : null, K.player.loop ? ['The loop', '', () => { K.player.seek(K.player.loop.a); K.player.toggle(true); K.togglePresent(); }] : null, [`${store.get('three.presentHud', false) ? '✓ ' : ''}Show the info line`, 'I while presenting', () => store.set('three.presentHud', !store.get('three.presentHud', false))], ['Bake for a perfect show', 'Renders it to a video first, then plays it: not live (the mic, camera and sliders won\'t react)', () => K.togglePresent('bake')], ['Stage window', 'Its own window, for a second monitor', () => K.setStage(true)], ['◉ Perform', 'Live: 1–9 cues and Q W E looks on the beat or bar, the other screen at full speed', () => (window.Lazy ? Lazy.load('perform') : Promise.resolve()).then(() => ThreePerform.start()).catch((err) => toast(calmError(err), { type: 'error', raw: err }))], ['📱 Live on my phone', 'The preview on your phone over your Wi-Fi: scan a QR code (the song plays here)', () => (window.Lazy ? Lazy.load('phoneview') : Promise.resolve()).then(() => PhoneView.live()).catch((err) => toast(calmError(err), { type: 'error', raw: err }))]]); }
  function setHud(on) {
    K.presentHud.hidden = !on; store.set('three.presentHud', on);
    clearInterval(K.hudTimer);
    if (!on) return;
    const paint = () => { const z = K.stage.size; const sec = K.player.loaded ? K.player.sectionAt() : null; K.presentHud.textContent = `${sec?.cue ? `${sec.cue} · ` : ''}${K.current?.name || ''} · ${z.id === 'fit' ? `${z.width}×${z.height}` : `${z.id} ${z.width}×${z.height}`}${typeof ThreeFrames !== 'undefined' && ThreeFrames.on ? ` · ${ThreeFrames._pure.tc(ThreeFrames.clock, ThreeFrames.frame)} · f${ThreeFrames.frame}` : K.player.loaded ? ` · ${K.fmtClock(K.player.time)} / ${K.fmtClock(K.player.duration)}${K.player.isClock ? ` · f${K.player.clock.frame}` : ` · ${Math.round(K.player.bpm)} BPM`}` : ''}${K.liveKind ? ` · live ${K.liveBpm?.bpm ? `${Math.round(K.liveBpm.bpm)} BPM` : ''}` : ''}${K.lastStats ? ` · ${K.lastStats.fps} fps` : ''}${K.frozenNow ? ' · ❚❚' : ''}`; };
    paint(); K.hudTimer = setInterval(paint, 250);
  }
  function trigPresetMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const saved = store.get('three.trigPresets', []);
    const songs = Object.entries(store.get('three.triggersBySong', {})).filter(([p0]) => p0 !== K.player.path).slice(0, 8);
    const mp = typeof ThreeMusic !== 'undefined' ? ThreeMusic.presetInfo() : null; // the pick from the song (tools/three-music.js)
    ThreeTweaks.menu(r.left, r.bottom + 4, ['Trigger presets', mp?.guess ? [`✦ From the song: ${mp.guess.preset}`, mp.guess.why, () => ThreeMusic.autoPreset({ force: true })] : null, ...Object.keys(K.trigPresets()).map((n) => [`${mp?.current === n ? '● ' : ''}${n}`, 'Bands and timing · your bars stay', () => K.applyTrigPreset(n)]),
      saved.length ? 'Yours' : null, ...saved.map((x) => [`★ ${x.name}`, 'Bands and bars', () => K.applyTrigPreset(x.name)]),
      songs.length ? 'From another song' : null, ...songs.map(([p0, c]) => [`♪ ${p0.split(/[\\/]/).pop()}`, '', () => { K.trigCfg = ThreeTriggers.merge(c); K.trigTuned = true; K.sendTriggers(); K.saveTriggers(); K.trigPanel?.set(K.trigCfg); }]),
      ['Auto bars', 'Fit the bars to the sound', () => autoBars()], ['⚡ Open the triggers', 'Bands, bars, fade, sensitivity', () => K.toggleTriggers(true)]]);
  }
  async function autoBars() {
    if (K.trigPanel?.autoBars) { const n = K.trigPanel.autoBars(); toast(n ? `Auto bars: ${n} bars fitted to the sound` : 'Play some sound first (a few seconds), then Auto bars', { timeout: 1800 }); return n; }
    const wasOpen = Boolean(K.trigPanel);
    K.toggleTriggers(true);
    toast('Listening for 3 s to fit the bars…', { timeout: 2600 });
    await new Promise((r) => setTimeout(r, 3200));
    const n = K.trigPanel?.autoBars?.() || 0;
    toast(n ? `Auto bars: ${n} bars fitted` : 'No sound came in: play the song (or live sound) and try again', { timeout: 2000 });
    if (!wasOpen) setTimeout(() => K.toggleTriggers(false), 600);
    return n;
  }
  function layerRowMenu(e, row) {
    const L = K.layerById(row.dataset.id); // (round 44) by id: group headers sit between the rows now
    if (!L) return;
    const Ls = K.layersOf(); const at = Ls.indexOf(L);
    const move = (to) => { const ids = Ls.map((x) => x.id).filter((x) => x !== L.id); ids.splice(Math.max(0, Math.min(ids.length, to)), 0, L.id); if (window.LabGroups?.op) LabGroups.op(`Moved "${L.name}"`, (cur) => ids.map((i) => cur.find((x) => x.id === i)).filter(Boolean), { say: false }); else K.reorderLayers(ids); }; // (round 136, outline136) one undo step
    ThreeTweaks.menu(e.clientX, e.clientY, [L.name,
      [L.visible === false ? '👁 Show' : '◌ Hide', `Alt+${[...Ls].reverse().indexOf(L) + 1}`, () => K.editLayer(L.id, { visible: L.visible === false })],
      [K.soloNow() === L.id ? 'Show every layer' : 'Only this layer (solo)', 'Alt+click its eye', () => K.setSolo(K.soloNow() === L.id ? null : L.id)],
      ['Rename…', 'Or double-click its name', async () => { if (K.layersPanel.rename?.(L.id)) return; const v = await Modal.prompt('Rename layer', { value: L.name }); if (v?.trim()) K.editLayer(L.id, { name: v.trim() }); }], // (round 136, outline136) in place
      ['Duplicate', 'A copy on top', () => { K.selectLayer(L.id); K.addLayer('copy'); }, false, 'Duplicate layer'],
      at < Ls.length - 1 ? ['Move up', 'Alt+↑ in the list', () => (window.LabGroups?.nudge ? LabGroups.nudge(1, { layer: L.id }) : move(at + 1))] : null,
      at > 0 ? ['Move down', 'Alt+↓ in the list', () => (window.LabGroups?.nudge ? LabGroups.nudge(-1, { layer: L.id }) : move(at - 1))] : null,
      at < Ls.length - 1 ? ['To the top', '', () => move(Ls.length)] : null,
      // (round 7) the layer's timing, whose two buttons wait behind Alt now
      K.player.loaded ? ['Plays', L.in != null || L.out != null ? 'part of the song' : 'the whole song', [['The whole song', '', () => K.editLayer(L.id, { in: null, out: null }), L.in == null && L.out == null], K.player.loop ? ['Only during the loop', '', () => K.editLayer(L.id, { in: K.player.loop.a, out: K.player.loop.b })] : null].filter(Boolean)] : null,
      ...(typeof ThreeComp !== 'undefined' ? ThreeComp.layerMenu(L) : []), // ◫ Precomp › / ◫ Comp › (tools/three-comp.js)
      ...(typeof LabShader !== 'undefined' ? LabShader.layerMenu(L) : []), // (round 23) ◇ Shader › (tools/three-shader.js)
      ...(typeof LabParticles !== 'undefined' ? LabParticles.layerMenu(L) : []), // (round 24) ✦ Particles › (tools/three-particles.js)
      ...(typeof LabType !== 'undefined' ? LabType.layerMenu(L) : []), // (round 25) 🅰 Type › (tools/three-type.js)
      ...(typeof LabPhysics !== 'undefined' ? LabPhysics.layerMenu(L) : []), // (round 25) ⚛ Physics › (tools/three-physics.js)
      ...(typeof LabVisHook !== 'undefined' ? LabVisHook.layerMenu(L) : []), // (round 50) 🎵 Visualizer › (tools/three-vis-hook.js)
      ...(typeof LabShapesHook !== 'undefined' ? LabShapesHook.layerMenu(L) : []), // (round 51) ◆ Shape › (tools/three-shapes-hook.js)
      'Opacity',
      ...[1, 0.75, 0.5, 0.25].map((o) => [`${Math.round(o * 100)}%`, '', () => K.editLayer(L.id, { opacity: o }), Math.abs((L.opacity ?? 1) - o) < 0.01]),
      'Blend',
      ...ThreeLayers.BLENDS.slice(0, 6).map(([v, label]) => [label, '', () => K.editLayer(L.id, { blend: v }), (L.blend || 'normal') === v]),
      Ls.length > 1 ? ['Delete…', 'With Undo', () => removeLayer(L.id), false, 'Delete layer'] : null,
      ...(typeof Declutter !== 'undefined' ? Declutter.popItems('Lab layers') : [])]);
  }
  async function removeLayer(id, { confirm = true } = {}) {
    const L = K.layerById(id);
    if (!L) return false;
    if (K.layersOf().length <= 1) { toast('A sketch keeps at least one layer', { type: 'error' }); return false; }
    if (confirm && !(await Modal.confirm('Delete layer?', `"${L.name}" will be removed from "${K.current.name}".`, { ok: 'Delete', danger: true }))) return false;
    return Boolean(K.removeLayers([id]));
  }
  // (round 142, smooth142) three choices: Smooth (auto) · Balanced · Force high quality, for this scene (and the
  // default for scenes without their own); the chip says which, and what Smooth lowered and why on its tooltip
  function qualityMenu(x, y) {
    const m = K.qMode(); const own = Boolean(K.current?.speed?.q);
    const pick = (k) => () => K.setQuality(k);
    showMenu(x, y, [
      { label: K.Q_NAMES.smooth, hint: 'lighter before frames drop · steady frame rate · renders stay full', checked: m === 'smooth' && !K.adaptHeld, action: pick('smooth') },
      { label: K.Q_NAMES.balanced, hint: 'lighter only while frames keep dropping', checked: m === 'balanced' && !K.adaptHeld, action: pick('balanced') },
      { label: K.Q_NAMES.high, hint: 'full resolution, antialias and shadows · frames may drop', checked: m === 'high' || K.adaptHeld, action: pick('high') },
      '-',
      own ? `Kept for this scene · the default: ${K.Q_NAMES[K.qGlobal()]}` : 'Your pick is kept for this scene and as the default',
    ]);
  }
  function historyDialog(read = false) {
    if (!read && K.current && K.kvOk.has('three-history') && !K.histRead.has(K.current.id)) { K.loadHist(K.current.id).catch(() => false).then(() => historyDialog(true)); return; } // (round 88) its file read first (one that can't be read: what's here is shown)
    const L = K.sel();
    const versions = K.history[K.histKey(L)] || [];
    const dlg = el('dialog', { class: 'ui-modal gallery-dialog' });
    const preview = el('pre', { class: 'code-view', text: 'Pick a version to preview it.' });
    let picked = null;
    const restoreBtn = el('button', { type: 'button', class: 'primary', text: 'Restore this version', disabled: true, on: { click: () => {
      K.snapshot();
      K.editor.setValue(picked.code);
      K.persist();
      dlg.close();
      K.run({ hot: true, layer: K.selId });
      toast('Version restored (the code you had is in History too)');
    } } });
    const row = (label, sub, onClick) => el('button', { type: 'button', class: 'lib-item', on: { click: onClick } }, el('b', { text: label }), ' ', el('span', { class: 'hint', text: sub }));
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: `History: ${K.current.name}${K.layersOf().length > 1 ? ` · ${L.name}` : ''}` }),
      el('div', { class: 'lib-layout', style: { minHeight: '360px' } },
        el('div', { class: 'lib-side' },
          el('div', { class: 'lib-group', text: 'Versions (saved when run)' }),
          ...(versions.length ? versions.map((v) => row(fmtDate(v.at), `${v.code.split('\n').length} lines`, () => {
            picked = v; preview.innerHTML = highlight(v.code, 'js'); restoreBtn.disabled = false;
          })) : [el('p', { class: 'hint', text: 'No versions yet. One is saved each time you run.' })]),
          el('div', { class: 'lib-group', text: 'Deleted sketches' }),
          ...(K.trash.length ? K.trash.map((t) => row(t.name, `deleted ${timeAgo(t.deletedAt)}`, () => {
            K.trash = K.trash.filter((x) => x !== t);
            K.saveHistory();
            dlg.close();
            K.create(t.name, t.code, t.layers);
            toast(`Restored "${t.name}"`);
          })) : [el('p', { class: 'hint', text: 'None.' })])),
        preview),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }), restoreBtn)));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    K.openLight(dlg);
  }
  function lookCycleMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, [[0, 'Off'], [1, 'Every bar'], [2, 'Every 2 bars'], [4, 'Every 4 bars'], [8, 'Every 8 bars']].map(([n, label]) => ({ label: `${K.lookCycle === n ? '✓ ' : ''}${label}`, action: () => setLookCycle(n) })));
  }
  function setLookCycle(n) {
    K.lookCycle = n; store.set('three.lookCycle', n);
    clearInterval(K.lookTimer); K.lookTimer = 0; K.lookBar = -1;
    if (!n) { for (const L of K.layersOf()) K.controllers.get(L.id)?.endLook?.(); toast('Look cycling off', { timeout: 1200 }); return; }
    const looksCount = K.layersOf().reduce((s, L) => s + (K.controllers.get(L.id)?.looksApi.list().length || 0), 0);
    toast(looksCount ? `Looks change every ${n} bar${n === 1 ? '' : 's'} while it plays` : 'Save a few looks first (Sliders → + Save look)', { timeout: 2200 });
    K.lookTimer = setInterval(() => {
      if (!K.player.playing) { if (K.lookBar !== -1) { K.lookBar = -1; for (const L of K.layersOf()) K.controllers.get(L.id)?.endLook?.(); } return; }
      const barLen = (60 / K.player.bpm) * 4;
      const bar = Math.floor(K.player.time / barLen);
      if (bar === K.lookBar) return;
      K.lookBar = bar;
      if (bar % n) return;
      for (const L of K.layersOf()) {
        const c = K.controllers.get(L.id); const names = c?.looksApi.list() || [];
        if (names.length) c.playLook(names[Math.floor(bar / n) % names.length]);
      }
    }, 40);
  }
  function freezeMenu(e) {
    ThreeTweaks.menu(e.clientX, e.clientY, ['Freeze', [K.frozenNow ? 'Unfreeze' : 'Freeze now', 'F or \\', () => K.setFreeze(!K.frozenNow)],
      ['On the next beat', 'Lands exactly on the beat while it plays', () => K.freezeOn('beat')], ['On the next bar', 'On the next 1', () => K.freezeOn('bar')], ['On the next kick', 'Your next kick marker', () => K.freezeOn('kick')],
      ['◐ Pin this frame', '|', () => K.pinFrame()], ['📷 Still of this frame', 'Exact size', () => K.still()], [K.frozenNow ? 'One frame forward' : '', '.', () => K.box.send({ type: 'step' })].filter(() => K.frozenNow)].filter((x) => !Array.isArray(x) || x.length));
  }
  function stillMenu(e) { ThreeTweaks.menu(e.clientX, e.clientY, ['A still at', ...K.stage.pillOrder.filter((id) => id !== 'fit').map((id) => [id, ThreeMedia.SIZES.find((z) => z.id === id).title, () => K.still({ size: id })]), ['Copy this frame', 'To the clipboard', () => K.still({ copy: true })],
    ['Send this frame to the director', 'Attached in its chat, ready to describe', () => K.framesToDirector('frame')],
    'A folder of stills', ['In all four sizes', '9:16, 16:9, 4:5, 1:1 as PNGs', () => K.stillsAt('sizes')], [K.player.loaded ? 'At every cue' : 'Across the song', K.player.cues.length ? `${K.player.cues.length} cues` : 'six evenly spaced frames', () => K.stillsAt('cues')], store.get('three.stillsDir', '') ? ['Choose another folder…', store.get('three.stillsDir', ''), () => { store.set('three.stillsDir', ''); K.stillsFolder(); }] : null]); }
  function previewMenu() {
    return ['Preview',
      ['⌗ Composition guides', `Now: ${K.GUIDES.find(([k]) => k === K.guides)[1]} · click for the next`, () => K.cycleGuides(), Boolean(K.guides), 'Guides'],
      ['Safe zones', 'Platform buttons / captions / crops for the size (TikTok, Reels, Shorts)', () => K.stage.setSafe(), K.stage.safe, 'Safe zones'],
      ['◐ Pin this frame to compare', '|', () => K.pinFrame()],
      ['✦ Let Astra pick the frame size', 'For this picture · Undo puts yours back', () => (window.Lazy ? Lazy.load('assist') : Promise.resolve()).then(() => Decide.run('size'))], // (round 96: decide.js is in the 'assist' group)
      [K.box.onStage ? '🖥 Back from the Stage window' : '🖥 Stage window', 'Its own window, steady frames', () => K.setStage(!K.box.onStage), K.box.onStage, 'Stage window'],
      ['Frame rate', `${(K.FPS_OPTS.find(([v]) => v === String(K.fpsPref())) || K.FPS_OPTS[0])[1]}${K.lightOn ? ' · light' : ''}`, [...K.FPS_OPTS.map(([v, l]) => [l, v === '-1' ? 'Follows the screen; 30 in the background; nothing when hidden' : '', () => { K.fpsSel.value = v; K.fpsSel.dispatchEvent(new Event('change')); }, String(K.fpsPref()) === v, 'Preview fps']),
        ['🪶 Light mode', 'Slower machine: 30 fps, 1× pixels, filters at half size', () => K.setLight(!K.lightOn), K.lightOn, 'Light mode'],
        ['Perf HUD', 'fps, frame ms, draw calls, GPU memory, in a corner', () => K.setPerfHud(!K.perfHudOn), K.perfHudOn, 'Perf HUD']]]];
  }
  function browseSketches() {
    const q = el('input', { class: 'sb-search', placeholder: 'Search sketches…', spellcheck: false });
    const grid = el('div', { class: 'sb-grid' });
    const dlg = el('dialog', { class: 'ui-modal sb-dialog' },
      el('div', { class: 'refs-head' }, el('h3', { text: 'Sketches' }), q, el('span', { class: 'spacer' }),
        K.btn('＋ New', 'New sketch from a template', () => { dlg.close(); templateGallery(); }, 'primary small'),
        K.btn('★ My work', 'Start a new scene from your past work: scenes, templates, standout layers, looks', () => { dlg.close(); Lazy.load('mywork').then(() => MyWork.open({ mode: 'lab', kind: 'scene' })).catch((e) => toast(e.message, { type: 'error' })); }, 'ghost small sb-mywork'), // (round 134, starters134)
        K.btn('Close', '', () => dlg.close())),
      grid);
    // ★ pinned first, then by the sort you pick; right-click a card for rename / duplicate / pin / delete.
    const sortSel = el('select', { class: 'sb-sort', title: 'Sort' }, [['recent', 'Recent'], ['name', 'Name'], ['layers', 'Most layers']].map(([v, l]) => el('option', { value: v, text: l, selected: v === store.get('three.sbSort', 'recent') })));
    sortSel.addEventListener('change', () => { store.set('three.sbSort', sortSel.value); fill(); });
    q.after(sortSel);
    const pj = window.Lazy && !window.Lazy.loaded('projects') ? null : window.Projects;
    const pf = pj?.sketchBrowse?.({ after: sortSel, refill: () => fill() }) || null; // (round 23) one project's scenes, its mark on cards (projects.js)
    const pins = () => new Set(store.get('three.sketchPins', []));
    const togglePin = (id) => { const p = pins(); if (p.has(id)) p.delete(id); else p.add(id); store.set('three.sketchPins', [...p]); window.LabPresets?.changed(); fill(); }; // (round 88) pins on both computers
    const cardMenu = (e, sk) => {
      e.preventDefault();
      const p = pins();
      showMenu(e.clientX, e.clientY, [
        { label: 'Open', action: () => { dlg.close(); if (sk.id !== K.current?.id) K.openSketch(sk.id); } },
        { label: '▣ Open and present', action: () => { dlg.close(); if (sk.id !== K.current?.id) K.openSketch(sk.id); setTimeout(() => K.togglePresent(), 400); } },
        { label: '▶ Play', hint: 'as a game, full screen', action: () => { dlg.close(); K.playGame(sk); } },
        ...(typeof ThreeSeq !== 'undefined' ? [{ label: '▤ Add to the sequence', action: () => { dlg.close(); ThreeSeq.add({ sketch: sk.id }).then(() => ThreeSeq.enter()).catch((err) => toast(err.message, { type: 'error' })); } },
          { label: '▤ Its own sequence', hint: (() => { const x = ThreeSeq.summaryFor(sk.id); return x ? `${x.clips} clip${x.clips === 1 ? '' : 's'} · ${x.seconds.toFixed(1)} s` : 'made when you open it'; })(), action: () => { dlg.close(); if (sk.id !== K.current?.id) K.openSketch(sk.id); setTimeout(() => ThreeSeq.enter().catch((err) => toast(err.message, { type: 'error' })), 300); } }] : []),
        { label: p.has(sk.id) ? '☆ Unpin' : '★ Pin to the top', action: () => togglePin(sk.id) },
        ...(pj?.sketchMenu?.(sk.id, sk.name) || []),
        { label: 'Rename…', action: async () => { const n = await Modal.prompt('Rename sketch', { value: sk.name }); if (n?.trim()) { sk.name = n.trim(); K.save(); K.renderPicker(); fill(); } } },
        { label: 'Earlier versions…', action: () => { dlg.close(); window.Lazy.load('versions').then(() => Versions.open({ kind: 'scene', id: sk.id, name: sk.name })); } }, // (round 75, versions75)
        { label: 'Duplicate', action: () => { if (sk.id === K.current?.id) K.persist(); const copy = { ...JSON.parse(JSON.stringify(sk)), id: `s${Date.now()}`, name: `${sk.name} copy`, updatedAt: Date.now() }; K.sketches.push(copy); if (K.extras[sk.id]?.media) (K.extras[copy.id] ||= {}).media = { ...K.extras[sk.id].media }; if (K.extras[sk.id]?.timeline) { (K.extras[copy.id] ||= {}).timeline = { ...K.extras[sk.id].timeline }; K.player.copyMap(K.clockPath(sk.id), K.clockPath(copy.id)).catch(() => {}); } K.saveExtras(); K.save(); K.renderPicker(); fill(); if (typeof ThreeSeq !== 'undefined') ThreeSeq.sceneCopied(sk.id, copy.id).catch(() => {}); toast(`Duplicated "${sk.name}"`, { timeout: 1500 }); } },
        { label: 'Delete…', danger: true, action: async () => {
          if (K.sketches.length === 1) { toast('Keep at least one sketch', { type: 'error' }); return; }
          if (!(await Modal.confirm('Delete sketch?', `"${sk.name}" will be deleted. You can bring it back from History.`, { ok: 'Delete', danger: true }))) return;
          K.trash.unshift({ id: sk.id, name: sk.name, code: sk.code, layers: sk.layers, deletedAt: Date.now() });
          K.trash.length = Math.min(K.trash.length, 30);
          K.saveHistory();
          K.removedIds.add(sk.id);
          K.sketches = K.sketches.filter((s) => s.id !== sk.id);
          K.save();
          if (sk.id === K.current?.id) K.openSketch(K.sketches[0].id); else K.renderPicker();
          fill();
        } },
      ]);
    };
    const fill = () => {
      const needle = q.value.trim().toLowerCase();
      const p = pins();
      const by = sortSel.value;
      const cmp = by === 'name' ? (a, b) => a.name.localeCompare(b.name) : by === 'layers' ? (a, b) => (b.layers?.length || 1) - (a.layers?.length || 1) : (a, b) => b.updatedAt - a.updatedAt;
      const list = [...K.sketches].sort((a, b) => (p.has(b.id) - p.has(a.id)) || cmp(a, b)).filter((sk) => (!needle || sk.name.toLowerCase().includes(needle)) && (!pf || pf.keep(sk.id)));
      grid.replaceChildren(...list.map((sk) => {
        const t = K.thumbs[sk.id]?.url;
        const layers = sk.layers?.length || 1;
        const song = K.extras[sk.id]?.media?.path?.split(/[\\/]/).pop();
        const card = el('button', { class: `sb-card${sk.id === K.current?.id ? ' on' : ''}${p.has(sk.id) ? ' pinned' : ''}`, title: `Open "${sk.name}" (right-click for more)`, on: { click: () => { dlg.close(); if (sk.id !== K.current?.id) K.openSketch(sk.id); } } },
          el('div', { class: 'sb-thumb' }, t ? el('img', { src: t, alt: '' }) : el('span', { text: '◭' }), p.has(sk.id) ? el('span', { class: 'sb-pin', text: '★' }) : null, song ? el('span', { class: 'sb-song', text: '♪', title: song }) : null),
          el('b', { text: sk.name }, pf?.tag(sk.id), typeof ChatScenes !== 'undefined' && ChatScenes.ownerOf(sk.id) ? el('span', { class: 'sb-chat', text: ` ${ChatScenes.glyphFor(sk.id)}`, title: 'The scene of a director chat', style: { color: ChatScenes.identity(ChatScenes.ownerOf(sk.id)).color } }) : null),
          el('span', { class: 'sb-meta', text: `${layers} layer${layers === 1 ? '' : 's'} · ${new Date(sk.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}${song ? ` · ${song}` : ''}` }));
        card.addEventListener('contextmenu', (e) => cardMenu(e, sk));
        return card;
      }));
    };
    q.addEventListener('input', fill);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    fill();
    K.openLight(dlg);
    q.focus();
  }
  async function removeSketch() {
    if (K.sketches.length === 1) { toast('Keep at least one sketch', { type: 'error' }); return; }
    if (!(await Modal.confirm('Delete sketch?', `"${K.current.name}" will be deleted. You can bring it back from History.`, { ok: 'Delete', danger: true }))) return;
    K.persist();
    K.trash.unshift({ id: K.current.id, name: K.current.name, code: K.current.code, layers: K.current.layers, deletedAt: Date.now() });
    K.trash.length = Math.min(K.trash.length, 30);
    K.saveHistory();
    K.removedIds.add(K.current.id);
    K.sketches = K.sketches.filter((s) => s.id !== K.current.id);
    K.save();
    K.openSketch(K.sketches[0].id);
  }
  function templateGallery() {
    if (typeof LabGalleryHook !== 'undefined' && LabGalleryHook.open()) return; // (round 27) the gallery of starting points (tools/three-gallery*.js)
    const dlg = el('dialog', { class: 'ui-modal gallery-dialog' });
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'New sketch' }),
      el('div', { class: 'gallery' }, ThreeData.TEMPLATES.map((t) => el('button', {
        type: 'button', class: 'gallery-item', on: { click: () => { dlg.close(); K.create(t.name, t.code); } },
      }, el('b', { text: t.name }), el('span', { class: 'hint', text: t.desc })))),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Cancel' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    K.openLight(dlg);
  }
  function exportHtml() {
    if (K.layersOf().length > 1) { toast('Export HTML works for one-layer sketches. For layered ones, use ⏺ Record (it records every layer with the music).', { type: 'error', timeout: 6000 }); return; }
    const v = store.get('three.version', ThreeData.VERSIONS[0]);
    const code = K.editor.value;
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(K.current.name)}</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; }</style>${/\btweak\s*\(/.test(code) ? `
<script>
// Slider controls from the Three.js Lab, frozen at their saved values.
window.tweak = (spec) => Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v && typeof v === 'object' && 'value' in v) ? v.value : v]));
</script>` : ''}${/\b(audio|media)\./.test(code) ? `
<script>
// The Lab's music input isn't part of the export: these stand-ins keep the sketch running (silent).
window.audio = { level: 0, bass: 0, mid: 0, treble: 0, beat: 0, kick: 0, snare: 0, hit: 0, hits: { kick: [], snare: [], hit: [] }, since: () => Infinity, next: () => Infinity, beatInBar: 1, bar: 1, beatPhase: 0, barPhase: 0, beatsPerBar: 4, spectrum: new Uint8Array(1024), waveform: new Float32Array(2048), band: () => 0, time: 0, duration: 0, playing: false, loaded: false, simulated: false, bpm: 0, analysis: null, file: null };
window.audio = new Proxy(window.audio, { get: (o, k) => (k === 'time' ? performance.now() / 1000 : o[k]) });
window.media = { video: null, width: 0, height: 0, texture: () => null };
</script>` : ''}
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@${v}/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@${v}/examples/jsm/" } }
</script>
</head>
<body>
<script type="module">
${code}
</script>
</body>
</html>
`;
    window.hub.saveFile({ defaultPath: `${K.current.name.replace(/[\\/:*?"<>|]/g, '_')}.html`, filters: [{ name: 'HTML', extensions: ['html'] }], content: html })
      .then((p) => p && toast('Exported. It runs in any browser (needs internet for three.js).', { action: { label: 'Open', fn: () => window.hub.fs.open(p) } }));
  }
  function askAbout() {
    const own = K.errors.filter((e) => !e.layer || e.layer === K.selId);
    const errText = own.length ? `\n\nIt currently shows these errors:\n${own.map((e) => `- ${e.message}${e.line ? ` (line ${e.line})` : ''}`).join('\n')}` : '';
    const which = K.layersOf().length > 1 ? ` (the layer "${K.sel().name}" of a layered sketch: each layer is its own module with its own transparent renderer)` : '';
    // (round 92, labchat92) the chat it starts is linked to this scene (its AI's Lab calls reach it; ▶ Apply on its code).
    // A Claude with the Lab's tools reads the layer itself: the draft doesn't carry its whole code (≈ 1 token / 4 characters)
    if (window.LabChatLink && H.claudeAgent()?.threeTools) { LabChatLink.ask(`About the layer "${K.sel().name}" (read it with three_read_code).${errText}\n\n`, { sceneId: K.current.id, agentId: H.claudeAgent().id }); return; }
    (window.LabChatLink ? (t) => LabChatLink.ask(t, { sceneId: K.current.id, agentId: H.claudeAgent()?.id }) : draftToClaude)(`Here's my three.js sketch${which} (three r${(K.box.revision || store.get('three.version', ThreeData.VERSIONS[0]).split('.')[1])}, ES modules with an import map for 'three' and 'three/addons/').${errText}\n\n\`\`\`js\n${K.editor.value}\n\`\`\`\n\n`);
  }
  function pickerMenu(e) {
    const pins = new Set(store.get('three.sketchPins', []));
    const list = [...K.sketches].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt).slice(0, 14);
    ThreeTweaks.menu(e.clientX, e.clientY, ['Switch to', ...list.map((x) => [`${pins.has(x.id) ? '★ ' : ''}${x.name}`, `${x.layers?.length || 1} layer${(x.layers?.length || 1) === 1 ? '' : 's'}`, () => K.openSketch(x.id), x.id === K.current?.id]), ['All as pictures…', 'O', () => browseSketches()], ...(K.current ? [[`▶ Play ${K.current.name}`, 'as a game, full screen', () => K.playGame()]] : []), ['＋ New sketch', '', () => templateGallery()]]);
  }
  return { labKeys, historyDialog, browseSketches, templateGallery, exportHtml, askAbout, removeSketch, lookCycleMenu, setLookCycle, previewMenu, trigPresetMenu, qualityMenu, snippetMenu, versionMenu, newMenu, consoleMenu, presentMenu, stillMenu, freezeMenu, pickerMenu, layerRowMenu, fixErrors, autoBars, removeLayer, setHud };
};
