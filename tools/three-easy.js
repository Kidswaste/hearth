// The Lab without commands (round 26, labeasy). The owner hid the commands ("I hate commands"): the Lab features that
// were mostly reachable by typing one get a home where they belong, in plain words, behind one level:
//   · the preview's right-click: one "✦ More" entry → ♪ Music · ✨ Look & motion · ⇪ Make · ℹ What's going on
//   · the toolbar's ⋯: "Director ›" (what it's making, what it did, what it costs, its last picture, undo)
//   · a layer's right-click in the Layers list (new): hide, solo, rename, duplicate, react to the music, a filter above,
//     a look, and the rest behind "More…"
//   · Lab missions in the director's ◎ (missions.js Missions.add): 4 variations, react to the music, a 9:16 version,
//     polish the look, render it — each only shapes what the director does with your words
// The menus run the same commands as before (the app's internal API), so behaviour, undo and the director's view stay
// the same; what a command prints shows as a toast (or a small card when long), without the "/command" talk.
// LabEasyData (three-easy-data.js) says where the other Lab commands already lived (the audit, dev/labeasy-audit.js).
const LabEasy = (() => {
  const director = () => H.agents().find((a) => a.dock === 'three') || H.agents().find((a) => a.threeTools) || null;
  const agentId = () => director()?.id || H.claudeAgent?.()?.id;
  // a command's answer in plain words: no markdown marks, no "(… /command …)" asides, no "· /command …" tails
  function plain(t) {
    return String(t ?? '')
      .replace(/\*\*|`/g, '')
      .replace(/\s*\((?:[^()\n]*?\s)?\/[a-z][\w-]*[^()\n]*\)/g, '')
      .replace(/\s*·\s*\/[a-z][\w-]*[^·\n]*/g, '')
      .replace(/(^|\s)\/[a-z][\w-]*(?=[\s.,:]|$)/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  const last = { line: '', text: '', error: '' }; // the last run (dev/checks/labeasy.js)
  function show(title, text, opts = {}) {
    const t = plain(text);
    if (!t) return;
    if (t.length <= 200 && !t.includes('\n')) toast(t, { timeout: 4200, ...opts });
    else Modal.alert(title, t);
  }
  // run a Lab command line the way a menu click should: the Lab shown, its answer as a toast / card
  async function run(line, { title = '', quiet = false, undo = '' } = {}) {
    last.line = line; last.text = ''; last.error = '';
    let said = '';
    const grab = (t) => { said += `${said ? '\n' : ''}${String(t ?? '')}`; };
    try {
      if (typeof ThreeLab !== 'undefined') await ThreeLab.cmd({ show: true });
      const ran = await Commands.tryRun(line, agentId(), undefined, { source: 'labeasy', say: grab, note: grab, error: (m) => { last.error = String(m); } });
      if (ran === false) throw new Error('That isn\'t available right now');
    } catch (err) { last.error = err.message; }
    last.text = said;
    if (last.error) { toast(plain(last.error.replace(/^\/[\w-]+:\s*/, '')), { type: 'error' }); return false; }
    if (!quiet) show(title, said, undo ? { action: { label: 'Undo', fn: () => run(undo, { title }) } } : {});
    return true;
  }
  // a menu row that runs a command (cmd: its name, for the audit)
  const item = (label, hint, line, opts = {}) => ({ label, hint, cmd: line.slice(1).split(/\s/)[0], action: () => run(line, { title: label.replace(/^\W+\s*/, ''), ...opts }) });
  // a row asking for a few words first (Cancel / empty: nothing)
  const askItem = (label, hint, question, make, cmd) => ({ label, hint, cmd, action: async () => {
    const v = await Modal.prompt(question.title, { placeholder: question.placeholder || '', value: question.value || '' });
    if (v == null) return;
    const line = make(String(v).trim());
    if (line) run(line, { title: label.replace(/[…]$/, '') });
  } });

  // (round 32, labvariations) 🎲 Variations: its files load on first use (lazy group "labvar")
  async function variations(fn = (V) => V.open()) {
    if (typeof LabVariations === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labvar');
    if (typeof LabVariations === 'undefined') throw new Error('Variations did not load');
    return fn(LabVariations);
  }
  const varItem = () => ({ label: '🎲 Variations', hint: '6 takes on this scene to click: colors, motion, camera, look (no tokens)', cmd: 'variations', action: () => variations().catch((err) => toast(err.message, { type: 'error' })) });

  // ---------- the preview's right-click: ✦ More ----------
  const musicItems = () => [
    item('✦ Make it react to the music', 'Kick, bass and loudness move the right sliders', '/make-it-react', { undo: '/make-it-react undo' }),
    item('Stop everything following the sound', 'Every layer\'s sliders stay where they are', '/react-off everything'),
    item('Jump to the next drop', '', '/drops next'),
    item('Next cue', '', '/cue next'),
    item('Previous cue', '', '/cue prev'),
    item('Pick the triggers from the song', 'From its style and tempo (says why)', '/auto-preset'),
    item('Click on every beat', 'Hear the grid while it plays · again: off', '/click-track'),
    item('Save the loop as its own file', 'Next to the song (needs ffmpeg)', '/cut-loop'),
    item('What\'s in the song', 'Tempo, bar 1, sections, drops', '/analyze'),
    item('Its key, drops and builds', '', '/song-features'),
  ];
  const lookItems = () => [
    varItem(),
    { label: '🎲 Surprise me', hint: 'a random…', items: () => [['filter', 'A filter'], ['layer', 'A layer'], ['look', 'A look'], ['palette', 'A palette']].map(([k, l]) => item(l, '', `/surprise ${k}`)) },
    item('Put Hearth on screen', 'A whole shot in a new sketch: your captures on 3D screens', '/hearth-on-screen'),
    { label: 'A motion intro', hint: 'logo → Hearth on screen → end card, as a sequence', items: () => ['9:16', '16:9', '1:1', '4:5'].map((z) => item(z, '', `/motion-intro ${z}`)) },
    item('A cursor tour', 'A cursor glides and clicks around the frame', '/cursor-path'),
    item('Fade to black and back', '', '/blackout'),
    ...(typeof LabInstantHook !== 'undefined' ? [LabInstantHook.item()] : []), // (round 29) ✦ describe it (tools/three-instant-hook.js)
    ...(typeof LookMatch !== 'undefined' ? [LookMatch.item()] : []), // (round 28) 🎨 make it look like this (tools/three-lookmatch.js)
    ...(typeof AutoPolish !== 'undefined' ? [AutoPolish.item()] : []), // (round 30) ✨ make it look finished (tools/three-autopolish.js)
  ];
  const makeItems = () => [
    askItem('👥 4 variations of this scene…', 'A crew explores them side by side (cost shown first); you pick one', { title: 'What should the 4 variations explore?', placeholder: 'e.g. hit harder on the drop' }, (v) => `/crew 4 ${v || 'clearly different takes on this scene'}`, 'crew'),
    item('Render this chat\'s sequence again', 'Here, on this computer', '/render-again'),
    ...(typeof AutoEdit !== 'undefined' ? [AutoEdit.item()] : []), // (round 27, autoedit)
    ...(typeof PerfectLoop !== 'undefined' ? [PerfectLoop.item()] : []), // (round 31) ∞ make it loop (tools/three-loop.js)
  ];
  const infoItems = () => [
    item('What the Lab shows now', 'Sketch, layer, frame size, song, tempo', '/lab-state'),
    item('What the Lab hears now', 'Hits, bands, loudness, beat', '/audio'),
  ];
  const moreItems = () => [
    { label: '♪ Music', hint: 'react, drops, cues, the song', items: musicItems },
    { label: '✨ Look & motion', hint: 'surprise, Hearth on screen, intro', items: lookItems },
    { label: '⇪ Make', hint: 'variations, render again', items: makeItems },
    { label: 'ℹ What\'s going on', items: infoItems },
    ...(typeof LabPacksHook !== 'undefined' ? [LabPacksHook.moreItem()] : []), // (round 28) ⇪ Share: save as a pack, open one
  ];
  function previewItem() {
    return { label: '✦ More', hint: 'music, motion, make…', items: moreItems };
  }

  // ---------- the toolbar's ⋯: Director › ----------
  const directorItems = (has = Boolean(director())) => (has ? [
    item('What it is making', 'And how far it got', '/task'),
    item('What it did lately', 'Its latest tool calls', '/director-activity'),
    item('What it costs per message', 'Its tools and its part of the instructions', '/director-cost'),
    item('Its last picture, bigger', '', '/director-peek'),
    item('↶ Undo its last code edit', '', '/undo-edit'),
  ] : [item('Make the Three Director', 'Docked here in the Lab', '/director-setup')]);
  // ThreeTweaks.menu rows ([label, hint, fn | [rows]]) from showMenu items
  const toRow = (it) => (it.items ? [it.label, it.hint || '', (typeof it.items === 'function' ? it.items() : it.items).map(toRow)] : [it.label, it.hint || '', it.action]);
  function toolbarItems() {
    return [['🎲 Variations', '6 takes on this scene to click (no tokens)', varItem().action, false, 'Variations'], ['Director', 'What it\'s making, did, costs', directorItems().map(toRow), false, 'Director menu']];
  }

  // ---------- a layer's right-click (tools/three-layers.js) ----------
  // h: { select, change(props), solo, copy, remove, rename } from the Layers panel
  function layerItems(L, h = {}) {
    const fx = (kind) => () => { h.select?.(); if (typeof ThreeFX !== 'undefined') setTimeout(() => ThreeFX.openPicker(kind), 60); };
    const sel = (it) => ({ ...it, action: () => { h.select?.(); it.action(); } });
    return [
      L.name,
      { label: L.visible === false ? '👁 Show' : '◌ Hide', cmd: 'layer', action: () => h.change?.({ visible: L.visible === false }) },
      h.solo ? { label: 'Show only this one', hint: 'again: all', action: () => h.solo() } : null,
      h.rename ? { label: 'Rename…', action: () => h.rename() } : null,
      h.copy ? { label: '⧉ Duplicate', action: () => { h.select?.(); h.copy(); } } : null,
      '-',
      sel(item('✦ Make it react to the music', 'Its sliders follow the kick, bass and loudness', '/make-it-react', { undo: '/make-it-react undo' })),
      { label: 'Add a filter above…', hint: 'glow, grain, blur…', cmd: 'fx', action: fx('filter') },
      { label: 'Apply a look…', hint: 'palette and filters', cmd: 'look-apply', action: fx('look') },
      { label: 'Blend…', more: true, cmd: 'blend', action: fx('blend') },
      { label: 'Animate…', hint: 'bounce in, heartbeat, punch zoom…', more: true, cmd: 'animate', action: fx('animate') },
      { label: 'Ease every keyframe…', more: true, cmd: 'ease', action: fx('ease') },
      { ...sel(item('Recolor with the palette', '', '/recolor')), more: true },
      { ...sel(item('Stop it following the sound', '', '/react-off all')), more: true },
      { ...sel(item('Reset its sliders to the code', '', '/reset-sliders')), more: true },
      { ...sel(item('💾 Save its sliders into the code', '', '/save-sliders')), more: true },
      ...(h.remove ? ['-', { label: 'Delete this layer', danger: true, action: () => h.remove() }] : []),
    ].filter(Boolean);
  }
  function layerMenu(x, y, L, h) { showMenu(x, y, layerItems(L, h)); }

  // ---------- Lab missions (the director's ◎) ----------
  const inLab = (id) => H.agent?.(id)?.dock === 'three';
  // the message goes out as written with the mission's short brief in front, visible in the chat (nothing hidden)
  const brief = (lead) => (agent, text) => { Native.send(agent, `${lead}\n\n${text}`).catch((err) => toast(err.message, { type: 'error' })); return true; };
  const MISSIONS = [
    { id: 'lab-variations', icon: '👥', label: 'Make 4 variations', hides: ['swarm'], desc: 'A crew of 4 explores your idea on copies of the scene in parallel (cost shown first); you pick one.',
      submit: (agent, text, t) => { Commands.tryRun(`/crew 4 ${t}`, agent, undefined, { source: 'mission' }).catch((err) => toast(err.message, { type: 'error' })); return true; } },
    // (round 32, labvariations) free, local: your words steer which values move ("warmer", "calmer", "another angle")
    { id: 'lab-quickvars', icon: '🎲', label: 'Quick variations (free)', desc: '6 takes on the scene made here with no tokens: your words steer them (warmer, calmer, another angle, more glow). Click one to use it.',
      submit: (agent, text) => { variations((V) => V.open({ steer: text })).catch((err) => { toast(err.message, { type: 'error' }); if (text) Native.setDraft?.(agent, text); }); return true; } },
    { id: 'lab-react', icon: '♪', label: 'Make it react to the music', desc: 'The director wires the scene to the song: kick, bass, loudness, drops; calm in the quiet parts.',
      submit: brief('♪ Mission: make it react to the music (kick, bass and loudness drive it, the drops land, calm in the quiet parts; sliders for how much).') },
    { id: 'lab-vertical', icon: '📱', label: 'Make a 9:16 version', desc: 'The frame goes 9:16 (1080×1920) and the director recomposes for vertical, clear of the app buttons.',
      submit: (agent, text) => { run('/size 9:16', { quiet: true }).finally(() => brief('📱 Mission: a 9:16 version (1080×1920, vertical): recompose for the vertical frame and keep the safe zones clear.')(agent, text)); return true; } },
    { id: 'lab-polish', icon: '🎨', label: 'Polish the look', desc: 'First a free local pass fixes light, color, glow, motion and music from the picture; then the director (cost shown first) does what\'s left. The motion and timing stay.',
      // (round 30, autopolish) the local pass first (no tokens), then the director for what's left, cost first
      submit: (agent, text) => (typeof AutoPolish !== 'undefined' ? (AutoPolish.mission(agent, text).catch((err) => toast(err.message, { type: 'error' })), true) : brief('🎨 Mission: polish the look (the ◐ Grade: color, film, lens; the palette, light, glow, texture). Keep the motion and the timing.')(agent, text)) },
    { id: 'lab-render', icon: '🎬', label: 'Render it', desc: 'The director finishes what\'s needed, renders the final video in the best quality at this frame size, and says where it is.',
      submit: brief('🎬 Mission: render it: finish what\'s needed, then render the final video in the best quality at the current frame size and tell me where the file is.') },
  ];
  function addMissions() {
    if (typeof Missions === 'undefined' || !Missions.add) return 0;
    let n = 0;
    for (const m of MISSIONS) if (Missions.add({ ...m, when: inLab })) n += 1;
    return n;
  }
  addMissions();

  // every command the new menus run (the audit: dev/labeasy-audit.js)
  function placed() {
    const out = new Map();
    const walk = (list, where) => {
      for (const it of list || []) {
        if (!it || typeof it !== 'object') continue;
        if (it.items) walk(typeof it.items === 'function' ? it.items() : it.items, `${where} › ${it.label}`);
        else if (it.cmd && !out.has(it.cmd)) out.set(it.cmd, `${where} › ${it.label}`);
      }
    };
    walk(moreItems(), 'Preview right-click › ✦ More');
    walk([...directorItems(true), ...directorItems(false)], 'Toolbar ⋯ › Director');
    walk(layerItems({ name: 'Layer' }, { change() {}, solo() {}, rename() {}, copy() {}, remove() {} }), 'Layer right-click');
    return out;
  }
  return { previewItem, toolbarItems, layerItems, layerMenu, run, plain, placed, last, MISSIONS, addMissions, variations };
})();
