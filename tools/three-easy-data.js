// Lab without commands (round 26, labeasy): where each Lab command's feature lives in the Lab's own UI, for the audit
// (dev/labeasy-audit.js prints it from Commands.list() in the running app) and dev/checks/labeasy.js (a Lab command
// nobody placed shows up there). The commands the new menus run (tools/three-easy.js) are found from those menus
// themselves; this file says where the others already were, which ones the director answers better ("just ask"),
// and the few power / diagnostic ones that stay commands only.
const LabEasyData = (() => {
  // where → the commands whose feature already had a button or a menu entry there (checked by hand, round 26)
  const HAD = {
    'Layers: ＋ Layer (the effects picker: layers, filters, looks, Motion tab)': 'layer-add fx fx-picker motion-kit brand-look camera-move end-card logo-reveal hearth-ui kinetic type-3d shot-list',
    'Layers: the list (click, 👁, Alt+click solo), Blend, Animate ▾': 'layer blend animate',
    'Preview right-click: Freeze, Frame size, Capture, View, Restart': 'freeze fit safe contact-sheet lab-note onion stage-window restart-sketch present',
    'Preview right-click: ◫ Comp, 3D models, ◇ Shader, ✦ Particles, 🅰 Type, 📷 Camera, ⚛ Physics, Live, ◐ Grade, ⇪ Export': 'comp dispatch 3d shader shadertoy particles text lyrics webcam physics stage remote link osc obs midi-out grade lab-export',
    'Preview ⋯ / buttons: ⌗ guides, frame rate, 📷 still (right-click: sizes, stills folder, to the director), ◐ compare': 'guides fps still stills frame-to-director size',
    'Toolbar: Run, sketches, Code, Console, Sliders, Edit scene, Focus, ⋯ (keys)': 'lab sketch sketches show-code console sliders edit-scene lab-focus lab-keys lab-tools',
    'Sliders panel: Save ▾, 🎲 Shuffle ▾, Reset, ↶, A B C slots, looks, groups, a slider\'s right-click': 'save-sliders save-one save-look tweak-code copy-sliders paste-sliders shuffle reshuffle unshuffle shuffle-mode tame exaggerate reset-sliders undo-sliders slot morph look-apply slider slider-group find-slider fav-slider lock-slider unlock-slider follow-music move-slider react-to react-curve react-preset midi-learn recolor fx-palette lab-palette',
    'Timeline: Tap, Kick / Snare / Hit, Live, Load, BPM, Presets, Auto bars, Triggers, its right-click (loop, cues, grid, markers, trim, record)': 'tap kick snare hit marker live audio-in loopback song play pause bpm downbeat nudge-grid beat-grid snap loop preset trigger-preset triggers autobars quantize tap-latency mark-kicks fill-markers clear-markers sections song-trim record',
    'Sketch ▾ › New… / ＋ New sketch (the gallery), a new chat\'s "Start from something like…" chip, the ◎ mission of that name (round 27)': 'gallery',
    'Drop a picture on the preview, a board item\'s right-click, ✦ More › Look & motion, the ◎ mission "Make it look like this" (round 28)': 'look-match',
    'Sketch ▾ › Share, ✦ More › ⇪ Share, the gallery\'s right-click, dropping a .hearthpack (round 28)': 'pack',
    'Footage (the frames chip and its menu)': 'footage frame-step next-frame goto-frame edit-points shuttle hold-frame clip-speed loop-frames cut-here cut-delete cut-restore cut-range cut-keep cut-clear cut-bars cut-markers cut-scenes lab-cuts markers-at-cuts footage-scenes footage-sequence footage-back frame-display frame-read',
    'References (🖼) and their clips': 'refs ref-frames ref-motion match-pacing',
    'Sequence (▤) and the time machine': 'sequence sequence-render arrange add-scene motion-seq back',
    'Docked director: ↶ (its menu: redo), activity strip, last picture, fold, width, scene mark': 'undo-edit redo-edit director-activity director-edits director-peek dock-collapse dock-width scene fix-errors',
  };
  // facts the director tells you when you ask ("what's the tempo?", "list the motion presets") — no button needed
  const ASK = 'cues fx-list motion-list motion-words live-status pace-check scene-timeline';
  // power / diagnostic: kept as commands (the internal API), not worth a place on screen
  const POWER = 'knob frame-check director director-ask director-autoshot director-chips director-clear director-guide director-mode director-shot-size director-stats director-tools director-try astra-tools';
  const split = (s) => s.trim().split(/\s+/);
  const homes = new Map();
  for (const [where, names] of Object.entries(HAD)) for (const n of split(names)) homes.set(n, { kind: 'had', where });
  for (const n of split(ASK)) homes.set(n, { kind: 'ask', where: 'just ask the director' });
  for (const n of split(POWER)) homes.set(n, { kind: 'power', where: 'stays a command' });
  // the Lab's command areas (Commands.list(): area)
  const AREAS = ['Three.js Lab', 'Lab', 'Director'];
  return { HAD, homes, AREAS };
})();
