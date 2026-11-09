// (round 158, split158) The rows of the Lab's menus: Sketch ▾, the toolbar's ⋯, the preview's right-click (also what 🔎 Lab search lists).
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labpartmenus`, tools/three.js labPart). K is
// what it reaches inside the Lab (the sketch tab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).menus = (K) => {
  // (round 36, labsearch: the rows on their own, so 🔎 Lab search lists them too)
  function sketchMenuRows() {
    // (round 43, menucalm) nine rows, nothing folded away: start something, this sketch (Rename, ⧉ Duplicate, History ›,
    // ⇪ Share & export ›, More ›), Delete last; every row ≤ 2 clicks (it was 6 rows hiding 11 behind "This sketch ›")
    const packs = typeof LabPacksHook !== 'undefined' ? LabPacksHook.sketchRow(() => K.current?.id)[2] : []; // (round 28) ⇪ Save as a pack, open one (tools/three-packs-hook.js)
    return [
      ['New from a template…', 'Right-click it for the list', () => K.templateGallery()],
      ['▦ All your sketches', 'As pictures', () => K.browseSketches()],
      ...(typeof LabTemplatesHook !== 'undefined' ? [LabTemplatesHook.sketchRow()] : []), // (round 35) 📐 My templates (tools/three-templates-hook.js)
      'This sketch',
      ['Rename…', K.current?.name || '', () => K.renameSketch()],
      ['⧉ Duplicate', 'A copy you can change freely', () => K.duplicate()],
      ['History', 'Time machine, earlier versions, deleted and lost scenes', [
        ['🕘 Scene versions…', 'Named and automatic versions: compare 2–4 side by side, live; use one or take one layer', () => window.Lazy.load('scenevers').then(() => LabVersions.open()).catch((err) => toast(err.message, { type: 'error' }))], // (round 132, versions132)
        ['Save a version…', 'The scene as it is now, with a name', () => window.Lazy.load('scenevers').then(async () => { await LabVersions.open(); LabVersions.panel?.querySelector('.vs-head .vs-btn')?.click(); }).catch((err) => toast(err.message, { type: 'error' }))], // (round 132, versions132)
        ['⏱ Time machine…', 'Every version of the scene as pictures: scrub, compare, restore, branch · Alt+H', () => window.ThreeHistoryUI?.open()],
        ['Earlier versions and deleted sketches…', 'Of the selected layer; deleted sketches come back from here', () => K.historyDialog()],
        ['🕘 Earlier versions of the scene…', 'From every safety copy: automatic copies, sync, conflicts, backups', () => window.Lazy.load('versions').then(() => Versions.open({ kind: 'scene', id: K.current?.id, name: K.current?.name }))], // (round 75, versions75)
        ...(window.LabSceneSafe ? [LabSceneSafe.sketchRow()] : [])]], // (round 43) 🛟 Recover lost scenes… (tools/three-scenesafe.js)
      ['⇪ Share & export', 'A pack, the code, a web page, Photoshop', [
        ...packs,
        ['Copy all the code', 'Every layer, one after the other, to the clipboard', () => { navigator.clipboard.writeText(K.layersOf().map((L) => `// ===== ${L.name} =====\n${L.code}`).join('\n\n')); toast('Code copied', { timeout: 1200 }); }],
        ['Web page (one .html)…', 'A standalone .html file of this sketch', () => K.exportHtml()],
        ...(typeof Deploy !== 'undefined' ? [['Publish as a web page…', 'Vercel, Netlify… · preview first; asks before it goes public', () => Deploy.menuAt(K.sketchMenuBtn)], ['Preview the web page here', 'Built like the published one, on this computer', () => Deploy.build('scene', K.current?.id || '').then((b) => Deploy.preview(b)).catch((err) => toast(err.message, { type: 'error' }))]] : []), // (round 14: deploy.js)
        ...(typeof Adobe !== 'undefined' ? [['Open the picture in Photoshop', 'A still of the preview (all layers)', () => Adobe.labToPhotoshop().catch((err) => toast(err.message, { type: 'error', timeout: 9000 }))]] : [])]], // (round 14: adobe.js)
      ['More', 'Cycle looks, restart, ask about this layer', [
        ['Cycle looks…', K.lookCycle ? `Now: every ${K.lookCycle} bar${K.lookCycle === 1 ? '' : 's'}` : 'Switch between your saved looks every few bars while it plays', () => K.lookCycleMenu(K.sketchMenuBtn)],
        ['⟲ Restart from scratch', 'A fresh page, GPU and sound, when something bugs out (Ctrl+Shift+Enter)', () => K.restartSim()],
        ['Ask Claude about this layer', 'Sends the code and any errors to Claude', () => K.askAbout()]]],
      'Careful',
      ['Delete…', 'Moves it to History → deleted sketches', () => K.removeSketch()],
    ];
  }
  // (round 64, clickfirst64) ▶ Playtest (notes and the hitch map) at the end of Capture & playtest (round 116, slim116: moved here from clickfirst.js)
  function playtestRows(extra = []) {
    const say = (t) => { if (t && typeof t === 'string') toast(t, { timeout: 4000 }); };
    const run = (fn) => () => Promise.resolve().then(fn).catch((err) => toast(window.calmError ? calmError(err) : String(err?.message || err), { type: 'error' }));
    const gm = () => Lazy.load('gamemode');
    return ['▶ Playtest',
      ...extra, // (round 144, calm144) ⚡ Speed check
      ['✎ Playtest log', 'Your F8 notes with their pictures · a click jumps back there', run(async () => { await gm(); return PlayNotes.open(); })],
      ['● Record the hitch map', 'Off by default · while on, ▶ Play records where it stutters', run(async () => { await gm(); say(await HitchMap.set(!HitchMap.isOn())); }), store.get('hitchmap.on', false) === true],
      ['▦ Hitch map', 'The last recording of this scene', run(async () => { await gm(); return HitchMap.open(); })]];
  }
  function labMoreItems() {
    const v = store.get('three.version', ThreeData.VERSIONS[0]);
    // (round 43, menucalm) two short parts, no row twice: what you make from the scene (🎲 ▦ ⧉ 📐 📜 Director ›), then
    // the Lab itself (🩺 Fix my scene, Capture ›, Code & console ›, View & help ›); 17 rows → 11, every row ≤ 2 clicks
    const easy = typeof LabEasy !== 'undefined' ? LabEasy.toolbarItems() : []; // (round 26) Director › (tools/three-easy.js)
    // (round 144, calm144) ten rows at most, so popMenu never folds "This Lab" into a submenu of its own (its rows were 3
    // clicks deep): ⚡ Speed check went into Capture & playtest, beside the hitch map (tools/three-easy.js has the rest)
    const fix = easy.filter((r) => /Fix my scene/.test(r[0]));
    const speed = easy.filter((r) => /Speed check/.test(r[0])); // (round 133, speed133)
    return ['Make',
      ...easy.filter((r) => !fix.includes(r) && !speed.includes(r)),
      'This Lab',
      ...fix,
      ['Capture & playtest', 'Screenshot, contact sheet, speed check, hitch map', [ // (round 64, clickfirst64) + ▶ Playtest at its end
        ['🖼 Save a screenshot', 'Save the picture (all layers) as it shows here', () => { K.copyNextShot = false; K.box.send({ type: 'screenshot' }); }, false, 'Screenshot'],
        ['📋 Copy a screenshot', 'To the clipboard', () => { K.copyNextShot = true; K.box.send({ type: 'screenshot' }); }],
        ['🎞 Contact sheet', 'Frames across the song', () => K.showSheet()],
        ...(typeof Capture !== 'undefined' ? [['◉ More capture…', 'Social frames, recording, tours · Ctrl/⌘+Alt+S', () => { const r = K.labMoreBtn.getBoundingClientRect(); Capture.menu(r.right - 300, r.bottom + 4, Capture.mainItems()); }]] : []),
        ...playtestRows(speed)]], // (round 64, clickfirst64) ▶ Playtest: Playtest log · Record the hitch map · Hitch map (round 116, slim116: here since clickfirst.js left with the quests) // (round 8) the Lab reaches the whole capture menu
      ['Code & console', `r${v.split('.')[1]}${K.autoRun ? ' · live' : ''} · console: ${K.CONSOLE_MODES.find(([m]) => m === K.consoleMode)[1].toLowerCase()}`, [
        ['Insert snippet…', 'At the cursor in the code', () => K.snippetMenu(), false, 'Insert snippet'],
        [`three.js version · r${v.split('.')[1]}`, 'Switch and re-run', () => K.versionMenu(), false, 'three.js version'],
        ['Live code', 'Apply code changes a moment after you stop typing', () => { K.autoBox.checked = !K.autoBox.checked; K.autoBox.dispatchEvent(new Event('change')); }, K.autoRun],
        'The console shows',
        ...K.CONSOLE_MODES.map(([m, l]) => [l, '', () => K.setConsoleMode(m), K.consoleMode === m])]],
      ['View & help', 'Focus, frame pace, keys', [
        ...(window.LabWinHost ? LabWinHost.rows() : []), // (round 153c, labwin153) ⧉ Open in its own window · Hide Hearth meanwhile (tools/three-labwin.js)
        ['⛶ Focus', 'Almost fullscreen · Shift+F (Esc leaves)', () => K.setFocus(!K.focusOn), K.focusOn, 'Focus'],
        ...(typeof ThreeGestures !== 'undefined' ? [ThreeGestures.helpRow()] : []), // (round 34 "labgestures") how to move around the picture
        ['Frame pace', K.paceText(K.paceLast), () => { K.setPaceOn(!K.paceOn); }, K.paceOn, 'Frame pace'], // (round 33 "labpace") the readout lives here; ticked: also in the preview's corner
        ...(window.LabRegroup ? [LabRegroup.lookRow()] : []), // (round 143, lab143) Lab look: Forgeheart · Plain
        ...(window.LabHudStage ? [LabHudStage.row()] : []), // (round 150, stage150) Stage: reactive → calm → off
        ['Key hints on hover', 'Little key badges on the main buttons (hold Ctrl for all of them)', () => { const off = !document.body.classList.contains('lab-nohints'); document.body.classList.toggle('lab-nohints', off); store.set('three.keyHints', !off); }, !document.body.classList.contains('lab-nohints')],
        ['Lab keys', '? · the keys button, bottom left', () => (typeof KeysUI !== 'undefined' ? KeysUI.open() : K.labKeys())],
        ...(window.Lazy?.isIn?.('quickstart') && typeof QuickstartHooks !== 'undefined' ? [QuickstartHooks.labRow()] : [])]], // (round 31) ✦ What can I do here? (quickstart-hooks.js)
      ...(typeof Declutter !== 'undefined' ? Declutter.popItems('Lab') : [])]; // (round 8) ends like every menu
    // (copy / export are in Sketch ▾, the frame rate in the preview's ⋯)
  }
  // ⟲ Restart: everything from scratch (a new page, GPU context and audio), when a sketch bugs out.
  // right-click on the picture
  // Right-click the picture (round 7): the frequent things first, the rest in a few open submenus.
  // (round 43, menucalm) one order, most used first (the owner's counts: Freeze, the frame sizes, Save / Shuffle, the
  // music): Freeze · Frame size › · Sliders › · ♪ Music › · Capture › · View › — then what you add or make: ＋ Add ›
  // (layers, models, the webcam, the sequence) · ✨ Look & motion › (grade, camera moves, variations) · ⇪ Make & export ›
  // · ✦ More › (fix my scene, restart, live, share, templates, recipes, keys). 23 rows → 11; pointing opens two levels.
  function previewMenuItems() {
    const ctl = K.selCtl();
    const seqItem = typeof ThreeSeq !== 'undefined' ? ThreeSeq.previewItem() : null;
    const inSeq = Boolean(seqItem?.items); // the sequence is on screen: its own menu (back to the scene…) right at the top
    // ◫ Comp's rows sit in ＋ Add itself (another scene as a layer, picture in picture first; dispatch, precomps,
    // render after the layers), so a precomp's settings stay two levels down
    const comp = typeof ThreeComp !== 'undefined' ? (ThreeComp.previewItem().items?.() || []) : [];
    const compAdd = comp.filter((x) => typeof x === 'object' && /^＋/.test(x.label));
    const compRest = comp.filter((x) => !compAdd.includes(x));
    const add = [
      ...compAdd,
      ...(seqItem && !inSeq ? [seqItem] : []),
      '-',
      ...(typeof LabShader !== 'undefined' ? [LabShader.previewItem()] : []), // (round 23) ◇ shader layers (tools/three-shader.js)
      ...(typeof LabParticles !== 'undefined' ? [LabParticles.previewItem()] : []), // (round 24) ✦ GPU particles (tools/three-particles.js)
      ...(typeof LabType !== 'undefined' ? [LabType.previewItem()] : []), // (round 25) 🅰 kinetic type, lyrics (tools/three-type.js)
      ...(typeof LabKineticHook !== 'undefined' ? [LabKineticHook.addItem()] : []), // (round 45) 🅰 Text that moves… (tools/three-kinetic-hook.js)
      ...(typeof LabVisHook !== 'undefined' ? [LabVisHook.addItem()] : []), // (round 50) 🎵 Music visualizer… (tools/three-vis-hook.js)
      ...(typeof LabShapesHook !== 'undefined' ? [LabShapesHook.addItem()] : []), // (round 51) ◆ Shape… (tools/three-shapes-hook.js)
      ...(typeof LabPhysics !== 'undefined' ? [LabPhysics.previewItem()] : []), // (round 25) ⚛ light physics (tools/three-physics.js)
      ...(typeof ThreeModels !== 'undefined' ? [ThreeModels.previewItem()] : []), // 3D models (tools/three-models.js)
      ...(window.AssetsHooks ? [AssetsHooks.previewItem()] : []), // (round 24) 🗂 the asset library (assets-cmds.js)
      { label: '★ From my work…', hint: 'layers, scenes, looks', tip: 'Your past scenes, standout layers and looks: add a layer here, start a new scene from one, or use a look (each one Undo)', action: () => Lazy.load('mywork').then(() => MyWork.open({ mode: 'lab', kind: 'layer' })).catch((e) => toast(e.message, { type: 'error' })) }, // (round 134, starters134) mywork.js
      ...(typeof LabMotionIn !== 'undefined' ? [LabMotionIn.previewItem()] : []), // (round 25) 📷 the webcam as a live input (tools/three-motion-in.js)
      ...(compRest.length ? ['-', '◫ Comp', ...compRest] : []),
    ];
    const look = [
      ...(typeof LabGrade !== 'undefined' ? [LabGrade.previewItem()] : []), // (round 24) ◐ Grade: color, LUTs, film & lens, scopes (tools/three-grade.js)
      ...(typeof LabCamera !== 'undefined' ? [LabCamera.previewItem()] : []), // (round 40) 🎥 Camera moves (tools/three-camera.js)
      ...(window.LabMatHook ? [LabMatHook.previewItem()] : []), // (round 50) ◉ Material looks on 3D things (tools/three-materials-hook.js)
    ];
    // ⇪ Export's rows after the making ones (tools/three-export.js); its rarer formats one level down
    const ex = typeof LabExport !== 'undefined' ? (LabExport.previewItem().items?.() || []).filter((x) => typeof x === 'object' && !/All formats/.test(x.label)) : [];
    const make = ex.length ? [ex[0], { label: 'Other formats', hint: '4K, ProRes, GIF, print, GLB…', tip: 'Export in one of the other formats: 4K, ProRes with alpha, a loop GIF, a still for print, 3D, a web page', items: ex.slice(1) }] : [];
    const more = [
      { label: '⟲ Restart from scratch', key: 'Ctrl+Shift+Enter', tip: 'A fresh page, GPU and sound, for when something bugs out', action: () => K.restartSim() },
      ...(typeof ThreeStage !== 'undefined' ? [ThreeStage.previewItem()] : []), // (round 22) live / VJ: MIDI, set list, crossfade, output, show mode
    ];
    const tail = ['-', { label: 'Lab keys', key: '?', tip: 'Every key of the Lab, and what it does', action: () => (typeof KeysUI !== 'undefined' ? KeysUI.open() : K.labKeys()) }];
    const E = typeof LabEasy !== 'undefined' ? LabEasy : null;
    return [
      ...(inSeq ? [seqItem, '-'] : []),
      { label: K.frozenNow ? '▶ Unfreeze' : '❚❚ Freeze', key: 'F', tip: 'Hold the picture; the music and the timeline go on', action: () => K.setFreeze(!K.frozenNow) },
      { label: 'Frame size', hint: K.stage.size.id === 'fit' ? 'Fit' : K.stage.size.id, tip: 'The size of the picture: fit the window, or exactly 9:16, 16:9, 4:5, 1:1', items: () => [
        ...K.stage.pillOrder.map((id, k) => ({ label: id === 'fit' ? 'Fit' : id, hint: ThreeMedia.SIZES.find((z) => z.id === id)?.title || '', key: `Shift+${k + 1}`, checked: K.stage.size.id === id, action: () => K.stage.setMode(id) })),
        '-', { label: 'Safe zones', checked: Boolean(K.stage.safe), action: () => K.stage.setSafe() },
      ] },
      ctl ? { label: 'Sliders', tip: 'Shuffle, save into the code, looks, for the selected layer', items: () => [
        { label: '💾 Save into the code', key: 'Ctrl+S', action: () => { ctl.save(); toast('Sliders saved into the code', { timeout: 1200 }); } },
        { label: '🎲 Shuffle', key: 'R', action: () => ctl.shuffle() },
        { label: 'The shuffle before', key: 'Shift+R', action: () => ctl.shuffleStep(-1) },
        { label: 'Save as a look', key: 'Ctrl+Shift+S', action: () => ctl.quickLook() },
        { label: 'Next look', action: () => ctl.lookStep(1) },
      ] } : null,
      ...(E ? [E.musicItem()] : []),
      { label: 'Capture', tip: 'A still, a screenshot, a frame to compare, a recording', items: () => [
        { label: '📷 Still at the frame size', action: () => K.still() },
        { label: '📋 Copy this frame', action: () => K.still({ copy: true }) },
        { label: '🖼 Save a screenshot', hint: 'as it shows here', action: () => K.box.send({ type: 'screenshot' }) },
        { label: '◐ Pin this frame to compare', key: '|', action: () => K.pinFrame() },
        { label: '🎞 Contact sheet', action: () => K.showSheet() },
        { label: '📌 Note at this moment', key: 'N', action: () => K.takeNote() },
        ...(typeof LabExport !== 'undefined' ? [{ label: '⇪ Render this…', hint: 'a video of this scene', tip: 'The Render card: what to render (full song, the loop…), format, quality', action: () => LabExport.panel() }] : []), // (round 143, lab143) the Render card from the picture
        // round 7's capture (screenshots / recordings of Hearth itself, in the captures folder) from here too
        ...(typeof Capture !== 'undefined' ? ['-',
          { label: '● Record the Lab preview…', hint: 'for your intro video', action: () => Capture.record({ target: 'lab' }).catch((e) => toast(e.message, { type: 'error' })) },
          { label: '◉ More capture…', key: 'Ctrl+Alt+S', action: () => Capture.menu(Math.max(8, innerWidth / 2 - 120), 80, Capture.mainItems()) }] : []),
      ] },
      { label: 'View', tip: 'Present, the Stage window, focus, guides, moving around', items: () => [
        { label: '▣ Present', key: 'P', action: () => K.togglePresent() },
        { label: '▶ Play', hint: 'as a game, its own window', action: () => K.playGame() },
        { label: K.box.onStage ? '🖥 Back from the Stage window' : '🖥 Stage window', action: () => K.setStage(!K.box.onStage) },
        ...(window.LabWinHost ? LabWinHost.rows().map(([label, hint, fn, on]) => ({ label, hint, checked: on || undefined, action: fn })) : []), // (round 153c, labwin153)
        { label: '⛶ Focus', key: 'Shift+F', checked: K.focusOn, action: () => K.setFocus(!K.focusOn) },
        { label: 'Quality: auto', hint: 'lighter while frames drop · full in renders', checked: K.adaptOn, action: () => { K.setQuality(K.adaptOn ? 'high' : 'smooth', { scene: false, quiet: true }); toast(K.adaptOn ? 'The preview lightens itself when frames drop (renders stay full quality)' : 'The preview stays at full quality, even when frames drop', { timeout: 2200 }); } }, // (round 142: Smooth ⇄ Force high quality, as the default)
        { label: 'Quality', hint: K.Q_NAMES[K.adaptHeld ? 'high' : K.qMode()], tip: 'How the preview draws while it plays (renders are always full quality)', items: () => [['smooth', 'steady frame rate · lighter before frames drop'], ['balanced', 'lighter only while frames keep dropping'], ['high', 'full resolution, antialias and shadows']].map(([k, hint]) => ({ label: K.Q_NAMES[k], hint, checked: k === 'high' ? K.qMode() === 'high' || K.adaptHeld : K.qMode() === k && !K.adaptHeld, action: () => K.setQuality(k) })) }, // (round 143, lab143) the Quality chip's three choices
        { label: '⌗ Composition guides', hint: K.GUIDES.find(([k]) => k === K.guides)[1], items: () => K.GUIDES.map(([k, l]) => ({ label: l, checked: k === K.guides, action: () => { K.guides = k; store.set('three.guides', k); K.box.send({ type: 'guides', kind: k }); K.guidesBtn.classList.toggle('on', Boolean(k)); } })) },
        ...(typeof ThreeGestures !== 'undefined' ? ThreeGestures.viewItems() : []), // (round 34) frame, reset, keep the view, moving around
        ...(window.LabAB ? LabAB.viewItems() : []), // (round 37) ◧ Before / after the last change (tools/three-abcompare.js)
      ] },
      '-',
      add.some((x) => typeof x === 'object') ? { label: '＋ Add', hint: 'layers, models, webcam…', tip: 'Add to the scene: shader, particle, type and physics layers, a 3D model, an asset, another scene, the webcam', items: add } : null,
      ...(E ? [E.lookItem(look), E.makeItem(make), E.previewItem(more, tail)] : [...look, ...make, ...more, ...tail]),
      ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Lab preview') : []),
    ];
  }
  return { sketchMenuRows, labMoreItems, previewMenuItems };
};
