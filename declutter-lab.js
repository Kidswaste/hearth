// The Lab's right-click menus (round 7, declutter; round 96, firstscreen96: split off declutter.js). The toolbar, the
// sliders, the layers, the console, the effects picker and the timeline exist only once the Lab is in, so their menus
// load with it (the last file of the lazy group 'lab') instead of before the first screen. Each still ends with
// Customise this… (declutter.js customiseItems), and Declutter.labToolbar is the same list as before.
(() => {
  if (typeof Declutter === 'undefined' || !Declutter.ctx) return;
  const ctx = Declutter.ctx;
  const LAB = 'Lab';
  const clickIn = (root, sel) => () => root.querySelector(sel)?.click();
  const lab = (name) => () => ThreeLab.act(name);
  const labCtl = () => ThreeLab.peek?.() || null;
  // a key pressed inside a part of the screen (the Lab's keys listen on its pane)
  const press = (sel, key, opts = {}) => { const n = [...document.querySelectorAll(sel)].find((x) => x.checkVisibility?.({ visibilityProperty: true })); n?.dispatchEvent(new KeyboardEvent('keydown', { key, code: opts.code || (key.length === 1 ? `Key${key.toUpperCase()}` : key), bubbles: true, cancelable: true, ...opts })); };

  const labToolbar = () => [
    { label: '▶ Run', key: 'Ctrl+Enter', action: () => labCtl()?.run() },
    { label: 'Sketch', items: () => [
      { label: '▦ Your sketches', key: 'O', action: () => press('.surface.active .three-toolbar, .surface.active .tb-group', 'o') },
      { label: 'New from a template…', action: lab('newSketch') },
      { label: 'Next sketch', key: 'Ctrl+PgDn', action: lab('nextSketch') },
      { label: 'Previous sketch', key: 'Ctrl+PgUp', action: lab('prevSketch') },
      { label: 'Copy all the code', action: lab('copyCode') },
      { label: '⟲ Restart from scratch', key: 'Ctrl+Shift+Enter', action: lab('restart') },
    ] },
    { label: 'Show', items: () => [
      { label: '</> Code', action: lab('code') },
      { label: 'Console', key: '`', action: () => document.querySelector('[data-feature="Console"]')?.click() },
      { label: '▣ Present', key: 'P', action: lab('present') },
      { label: '🖥 Stage window', action: lab('stage') },
      { label: '🎨 Palettes', action: clickIn(document, '.lab-palette button') },
      { label: '🖼 References', action: clickIn(document, '[data-feature="References"]') },
      { label: '🧰 Tools drawer', action: lab('tools') },
    ] },
    { label: 'Capture', items: () => [
      { label: '📷 Save a screenshot', action: lab('shot') },
      { label: '📋 Copy a screenshot', action: lab('copyShot') },
      { label: '🎞 Contact sheet', action: lab('sheet') },
      { label: 'Snapshot the window into the chat', key: 'Ctrl+Shift+S', action: () => AppUI.snapshotToChat() },
    ] },
    { label: 'Effects & layers…', key: 'X', action: () => ThreeFX.openPicker('add') },
    { label: 'Lab keys', key: '?', action: () => KeysUI.open('Lab') },
  ];
  ctx('.three-toolbar, .lab-tabs, .tb-group:not(.media-bar *)', LAB, () => labToolbar());
  // the sliders panel (a slider row and a group title have their own menus)
  ctx('.tweaks', 'Lab sliders', () => {
    const c = labCtl();
    if (!c) return null;
    const safe = (fn) => () => { try { const r = fn(); if (typeof r === 'string') toast(r, { timeout: 1400 }); } catch (err) { toast(err.message, { type: 'error' }); } };
    return [
      { label: '💾 Save into the code', key: 'Ctrl+S', action: safe(() => { c.save(); return 'Sliders saved into the code'; }) },
      { label: '🎲 Shuffle', key: 'R', action: lab('shuffle') },
      { label: 'Shuffle', items: () => [
        { label: 'The shuffle before', key: 'Shift+R', action: lab('shuffleBack') },
        { label: 'Options…', action: clickIn(document, '[data-feature="Shuffle options"]') },
      ] },
      { label: 'Looks', items: () => [
        { label: 'Save as a look', key: 'Ctrl+Shift+S', action: lab('quickLook') },
        { label: 'Next look', action: lab('nextLook') },
        ...(() => { try { return c.looks().slice(0, 12).map((n) => ({ label: n, action: safe(() => c.look(n)) })); } catch { return []; } })(),
      ] },
      { label: 'Slots', items: () => [
        ...['A', 'B', 'C'].map((s) => ({ label: `Recall ${s}`, key: `Shift+${s}`, action: safe(() => c.slot(s)) })),
        ...['A', 'B', 'C'].map((s) => ({ label: `Store in ${s}`, action: safe(() => c.slot(s, 'save')) })),
      ] },
      { label: 'Values', items: () => [
        { label: 'Undo the last change', action: safe(() => c.undoSliders()) },
        { label: 'Back to the code’s values', action: safe(() => c.resetSliders()) },
        { label: 'Copy the values', action: safe(() => c.copySliders()) },
        { label: 'Find a slider…', key: '/', action: () => document.querySelector('.tw-search')?.focus() },
      ] },
      { label: 'Ask the director', items: () => [
        { label: 'Named sliders for this layer', action: clickIn(document, '.tw-tip button') },
        { label: 'Open the asks', action: () => { const d = document.querySelector('.tweaks .tw-asks'); if (d) { KeysUI.latch(true); d.open = true; } } },
      ] },
    ];
  });
  ctx('.layers', 'Lab layers', () => [
    { label: '＋ Add a layer…', action: clickIn(document, '.layers .tw-head .primary') },
    { label: 'Effects & layers picker', key: 'X', action: () => ThreeFX.openPicker('add') },
    { label: 'Everything in the picker', key: 'Shift+X', action: () => ThreeFX.openPicker('all') },
    { label: 'Hide / show layer n', key: 'Alt+1…9', action: () => toast('Alt+1…9 hides or shows a layer (Alt+Shift: solo). Right-click a layer for all of its options.', { timeout: 3200 }) },
  ]);
  // one console line: copy it, go to its line, ask the director about it
  ctx('.three-console .console-row, .three-console-wrap .console-row', 'Lab console', (row) => {
    const text = row.querySelector(':scope > span:last-child')?.textContent || row.textContent;
    const err = row.classList.contains('error') || row.classList.contains('warn');
    return [
      { label: 'Copy this line', action: () => copyText(text, 'Copied') },
      row.querySelector('.console-line') ? { label: `Go to ${row.querySelector('.console-line').textContent} in the code`, action: () => row.querySelector('.console-line').click() } : null,
      row.querySelector('.console-layer') ? { label: `Select the layer “${row.querySelector('.console-layer').textContent}”`, action: () => row.querySelector('.console-layer').click() } : null,
      err ? { label: 'Ask the director about it', action: () => { const a = Tools.dockedAgent?.('three'); if (a) { Native.setDraft?.(a.id, `The Lab console says: ${text}\nFind the cause and fix it.`); Tools.openDock('three'); } else toast('Set up the Three Director first (/director-setup)', { type: 'error' }); } } : null,
    ].filter(Boolean);
  });
  ctx('.three-console-wrap', 'Lab console', (wrap) => [
    { label: 'Ask the director to fix it', action: clickIn(wrap, '.tc-fix') },
    { label: 'Copy everything', action: clickIn(wrap, 'button[title^="Copy everything"]') },
    { label: 'Clear', action: clickIn(wrap, 'button[title="Empty the console"]') },
    { label: 'Errors only', checked: Boolean(wrap.querySelector('.three-console-head > label.check input')?.checked), action: clickIn(wrap, '.three-console-head > label.check input') },
    { label: 'Shows', items: () => [['always', 'Always'], ['code', 'Only with the code'], ['never', 'Only when I open it']].map(([v, l]) => ({ label: l, checked: wrap.querySelector('.tc-mode')?.value === v, action: () => { const s = wrap.querySelector('.tc-mode'); s.value = v; s.dispatchEvent(new Event('change')); } })) },
    { label: 'Hide the console', key: '`', action: clickIn(wrap, '.three-console-head > button:last-of-type') },
  ]);
  // a row of the effects picker (X): add it, use it on the selected layer, ★, copy its name
  ctx('.fx-picker .fx-row', 'Effects picker', (row) => [
    { label: 'Add it', key: 'Enter', action: () => row.click() },
    { label: 'Use it on the selected layer', key: 'Shift+Enter', action: () => row.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })) },
    { label: row.querySelector('.fx-star.on') ? '★ Unfavorite' : '★ Favorite', key: 'Ctrl+D', action: () => row.querySelector('.fx-star')?.click() },
    { label: 'Copy its name', action: () => copyText(row.querySelector('.fx-name b')?.textContent || '', 'Copied') },
  ]);
  // the timeline's controls (the waveform, markers and tracks have their own menus)
  ctx('.media-bar', 'Lab timeline', (bar, e) => {
    if (e.target.closest('canvas')) return null;
    return [
      { label: 'Play / pause', key: 'Space', action: () => labCtl()?.player?.toggle?.() },
      { label: '🎵 Load audio / video…', action: lab('music') },
      { label: '🎧 Live sound on / off', key: 'Shift+L', action: lab('live') },
      { label: '⚡ Triggers', action: lab('triggers') },
      { label: 'Trigger presets…', action: clickIn(bar, '[data-feature="Presets"]') },
      { label: 'Auto bars', action: lab('autoBars') },
      { label: '📌 Note at this moment', key: 'N', action: clickIn(bar, '.mb-g-capture button') },
      { label: 'Song', items: () => [
        { label: 'Mark the sections', action: lab('sections') },
        { label: 'Loop this bar', action: lab('loopBar') },
        { label: 'Click track on / off', action: lab('clickTrack') },
        { label: 'Quantize taps on / off', action: lab('quantizeTaps') },
        { label: 'Next snap setting', action: lab('snap') },
        { label: 'Mute / unmute', action: lab('mute') },
        { label: 'All timeline controls / fewer', action: lab('allControls') },
      ] },
      { label: 'Timeline size', items: () => [['full', '▤ Full timeline'], ['compact', '▭ Compact'], ['strip', '▁ Just the strip']].map(([k, l]) => ({ label: l, checked: Boolean(bar.querySelector(`.mb-size-${k}.on`)), action: clickIn(bar, `.mb-size-${k}`) })) },
    ];
  });
  Declutter.labToolbar = labToolbar;
})();
