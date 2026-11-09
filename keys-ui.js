// Round 7 (declutter): the keys button in the bottom-left corner and what the modifier keys reveal.
//   - Hold Alt (⌥ on a Mac): the buttons that were tucked away (declutter.js) show in place, outlined, while it's held.
//     Tap Alt twice: they stay until Esc or the next double-tap. (Alt + another key is a shortcut, so that doesn't
//     reveal anything.) The window losing focus, a missed key-up or switching apps never leaves them stuck.
//   - Hold Ctrl (⌘): every visible button that has a key shows it in a small badge.
//   - The keys button (bottom left, Ctrl+/): a searchable sheet of every key, Alt / Ctrl reveal and right-click menu,
//     what applies where you are first. Click a line to run it (or to see where it applies). Built from the Keys
//     registry (keys.js): other features add their lines with Keys.add({ area, keys, what, when, run, sel }).
// Nothing here runs per frame: the reveal is one class on <html>, the badges are placed once when Ctrl goes down.
const KeysUI = (() => {
  const MAC = /Mac/.test(navigator.platform);
  const root = document.documentElement;

  // ---------- Mac symbols ----------
  const MAC_SYM = [[/\bCtrl\+/g, '⌘'], [/\bCtrl\b/g, '⌘'], [/\bAlt\+/g, '⌥'], [/\bAlt\b/g, '⌥'], [/\bShift\+/g, '⇧'], [/\bShift\b/g, '⇧'], [/\bEnter\b/g, '↩'], [/\bBackspace\b/g, '⌫'], [/\bTab\b/g, '⇥']];
  // one key of a line ("Ctrl", "Shift", "K") for its own <kbd>; real: the Mac's Control key (⌃), for the keys macOS takes
  // with ⌘ (⌘Tab, ⌘Space, ⌥⌘D…: WinMac.MAC_REAL_CTRL)
  const tokText = (k, real = false) => (MAC ? MAC_SYM.reduce((s, [re, to]) => s.replace(re, to), real ? String(k).replace(/^Ctrl$/, '⌃') : String(k)) : String(k));
  // (round 49, winmac49) a whole line ("Ctrl+Shift+U", "Ctrl/⌘+Z") as this computer says it: ⇧⌘U / Ctrl+Shift+U
  const LABEL = typeof WinMac !== 'undefined' && WinMac.keyLabel;
  const keyText = (k) => (LABEL ? WinMac.keyLabel(String(k), { mac: MAC }) : tokText(k));
  const realCtrl = (part) => MAC && LABEL && WinMac.keyLabel(part, { mac: true }).includes('⌃');
  // the descriptions name keys too ("⌘ Command palette (Ctrl+K)"): on a Mac they read ⌘ / ⌥ there as well
  // ("Ctrl+click" stays: on a Mac that is the right-click)
  // (capturefix2) "Ctrl/⌘+Z" (both, written for either computer: the chats panel, layer groups) reads ⌘Z on a Mac
  const whatText = (t) => (LABEL ? WinMac.keyLabel(String(t), { mac: MAC }) : MAC ? String(t).replace(/\bCtrl\/⌘\+?/g, '⌘').replace(/\bCtrl\+(?!click)/g, '⌘').replace(/\bAlt\+/g, '⌥') : String(t));
  // "Ctrl+Shift+U / Alt+1…9" → <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>U</kbd> / <kbd>Alt</kbd><kbd>1…9</kbd>
  function kbds(keys) {
    const out = [];
    String(keys).split(/(\s+\/\s+|\s+·\s+|,\s+|\s+then\s+|\s+or\s+)/).forEach((part, i) => {
      if (i % 2) { out.push(el('span', { class: 'ks-sep', text: part.trim() === '/' ? '/' : ` ${part.trim()} ` })); return; }
      const lead = part.match(/^(Right-click|Double-click|Hold|Point at|Type)\s+(.+)$/);
      // "Right-click a slider" → [Right-click] a slider · "Hold Alt" → hold [Alt]
      if (lead && /^(Hold|Type)$/.test(lead[1])) { const [k, ...rest] = lead[2].split(' '); out.push(el('span', { class: 'ks-word', text: lead[1].toLowerCase() }), ...k.split(/\+(?=.)/).map((t) => el('kbd', { text: tokText(t, realCtrl(k)) })), rest.length ? el('span', { class: 'ks-word', text: rest.join(' ') }) : ''); return; }
      if (lead && lead[1] === 'Point at') { out.push(el('span', { class: 'ks-word', text: `point at ${lead[2]}` })); return; }
      if (lead) { out.push(el('kbd', { text: lead[1] }), el('span', { class: 'ks-word', text: tokText(lead[2]) })); return; }
      const toks = part.length > 1 ? part.split(/\+(?=.)/) : [part];
      const real = realCtrl(part);
      toks.forEach((t) => { if (t) out.push(/\s/.test(t) ? el('span', { class: 'ks-word', text: tokText(t, real) }) : el('kbd', { text: tokText(t, real) })); });
    });
    return out;
  }

  // ---------- Alt: the tucked buttons ----------
  let altDown = false;
  let altT = 0;
  let altAt = 0;
  let lastAltTap = 0;
  let otherKey = false;
  let latched = false;
  const paintAlt = () => {
    const on = latched || (altDown && root.classList.contains('reveal-alt-armed'));
    if (root.classList.contains('reveal-alt') !== on) {
      root.classList.toggle('reveal-alt', on);
      dispatchEvent(new CustomEvent('hearth:reveal', { detail: { alt: on } }));
    }
  };
  function latch(on = !latched) {
    latched = Boolean(on);
    root.classList.toggle('reveal-latched', latched);
    paintAlt();
    if (latched) toast('Tucked buttons show (dashed outline) · Esc or a double-tap of Alt tucks them away', { timeout: 2600 });
    return latched;
  }
  function altOff() {
    clearTimeout(altT);
    altDown = false;
    root.classList.remove('reveal-alt-armed');
    paintAlt();
  }

  // ---------- Ctrl: key badges ----------
  let ctrlDown = false;
  let ctrlT = 0;
  let layer = null;
  // buttons whose key isn't in their title or data-key
  const HINTS = [
    ['#rail #config-btn', 'Ctrl+,'], ['#rail #palette-btn', 'Ctrl+K'], ['#rail #panel-btn', 'Ctrl+\\'], ['#rail .meter-pill', 'Ctrl+Shift+U'],
    ['#rail #keys-btn', 'Ctrl+/'], ['#chat-search', 'Ctrl+F'], ['form.composer button[type=submit]', 'Enter'], ['form.composer .collab-chip', 'Ctrl+Alt+C'],
    ['[data-feature="Layers & sliders"]', '/'], ['[data-feature="Edit scene"]', 'E'], ['[data-feature="Live sound"]', 'Shift+L'], ['[data-feature="Shuffle"]', 'R'],
    ['[data-feature="Shuffle back"]', 'Shift+R'], ['[data-feature="Save"]', 'Ctrl+S'], ['.layers .tw-head .primary', 'X'], ['.three-sketch-select', 'O'],
    ['.mb-g-capture button', 'N'], ['.dd-undo', 'Alt+Shift+Z'], ['.dd-ai', 'Alt+Shift+A'], ['.dd-fold', 'Alt+Shift+D'], ['.dd-rail', 'Alt+Shift+D'], ['.tool-dock .native-head > button:last-of-type', 'Ctrl+N'],
    ['[data-feature="Console"]', '`'], ['[data-feature="Present"]', 'P'], ['.ly-eye', 'Alt+1…9'], ['.notes-panel button[title^="Close"]', 'Ctrl+J'],
    ['.tw-search', '/'], ['[data-feature="Freeze"]', 'F'],
  ];
  const TITLE_KEY = /(?:^|[\s(·,])((?:(?:Ctrl|Alt|Shift|⌘|⌥|⇧)\+)+(?:F\d{1,2}|Enter|Space|Tab|Home|End|PgUp|PgDn|Delete|Esc|[A-Z0-9]|[,.;/\\[\]`=+\-|?]|←|→|↑|↓))|\((F\d{1,2}|Space|Esc|Home|End|[A-Z0-9?`|\\/.,[\]←→↑↓])(?:\s+or\s+[^)]*)?\)/;
  function keyFor(b) {
    if (b.dataset.key) return b.dataset.key;
    for (const [sel, k] of HINTS) if (b.matches(sel)) return k;
    if (b.closest('#agent-buttons') && b.dataset.id && H.railKey?.(b.dataset.id)) return H.railKey(b.dataset.id); // agents, then tools (round 18)
    const m = (b.title || '').match(TITLE_KEY);
    return m ? (m[1] || m[2]) : null;
  }
  function showHints() {
    hideHints();
    layer = el('div', { class: 'key-hint-layer', 'aria-hidden': 'true' });
    const seen = new Set();
    let n = 0;
    for (const b of document.querySelectorAll('button, select, input[type=search]')) {
      if (n >= 90 || b.closest('.key-hint-layer, #menu, #menu-fly, .keys-sheet')) continue;
      const k = keyFor(b);
      if (!k) continue;
      const r = b.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || !b.checkVisibility?.({ visibilityProperty: true })) continue;
      const spot = `${Math.round(r.left / 8)}:${Math.round(r.top / 8)}`;
      if (seen.has(spot)) continue;
      seen.add(spot);
      // short on the badge: Shift is ⇧ (the sizes sit close together)
      const text = keyText(k).replace(/Shift\+/g, MAC ? '⇧' : 'Shift+');
      const half = text.length * 3.3 + 6;
      const badge = el('kbd', { class: 'key-hint', text });
      badge.style.left = `${Math.round(Math.max(half + 2, Math.min(innerWidth - half - 2, r.left + r.width / 2)))}px`;
      badge.style.top = `${Math.round(r.bottom > innerHeight - 22 ? r.top - 16 : r.bottom - 6)}px`;
      layer.append(badge);
      n += 1;
    }
    document.body.append(layer);
    root.classList.add('reveal-ctrl');
  }
  function hideHints() { layer?.remove(); layer = null; root.classList.remove('reveal-ctrl'); }
  function ctrlOff() { clearTimeout(ctrlT); ctrlDown = false; hideHints(); }

  // ---------- the modifier keys ----------
  const isCtrlKey = (e) => e.key === 'Control' || e.key === 'Meta';
  addEventListener('keydown', (e) => {
    if (e.key === 'Alt' || e.key === 'AltGraph') {
      if (e.repeat || altDown) return;
      altDown = true; otherKey = false; altAt = performance.now();
      clearTimeout(altT);
      // a short hold: Alt + a key (Alt+1, Alt+N…) is a shortcut and shows nothing
      altT = setTimeout(() => { if (altDown && !otherKey && !e.ctrlKey && !e.metaKey) { root.classList.add('reveal-alt-armed'); paintAlt(); } }, 150);
      return;
    }
    if (isCtrlKey(e)) {
      if (e.repeat || ctrlDown) return;
      ctrlDown = true;
      clearTimeout(ctrlT);
      ctrlT = setTimeout(() => { if (ctrlDown && !e.altKey && !e.shiftKey && store.get('keys.ctrlHints', true)) showHints(); }, 420);
      return;
    }
    // any other key: it's a shortcut, not a reveal
    otherKey = true;
    clearTimeout(ctrlT);
    if (layer) hideHints();
    if (altDown && !root.classList.contains('reveal-alt-armed')) clearTimeout(altT);
    if (e.key === 'Escape' && latched && !document.querySelector('dialog[open]') && document.getElementById('menu')?.hidden !== false) latch(false);
  }, true);
  addEventListener('keyup', (e) => {
    if (e.key === 'Alt' || e.key === 'AltGraph') {
      if (!MAC) e.preventDefault(); // Windows: a lone Alt let go would toggle the window's hidden menu bar
      const tap = !otherKey && performance.now() - altAt < 260;
      altOff();
      if (tap) {
        if (performance.now() - lastAltTap < 420) { lastAltTap = 0; latch(); } else lastAltTap = performance.now();
      } else lastAltTap = 0;
      return;
    }
    if (isCtrlKey(e)) ctrlOff();
  }, true);
  // a missed key-up (the key was let go in another window) never leaves things showing
  const reset = () => { altOff(); ctrlOff(); };
  addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  // a click with Ctrl held is a Ctrl+click (or a Ctrl+drag), not a look at the badges
  addEventListener('pointerdown', (e) => { if (altDown && !e.altKey) altOff(); if (ctrlDown) { clearTimeout(ctrlT); hideHints(); if (!(e.ctrlKey || e.metaKey)) ctrlDown = false; } otherKey = true; }, true);
  addEventListener('pointermove', (e) => { if (altDown && !e.altKey) altOff(); if (ctrlDown && !(e.ctrlKey || e.metaKey)) ctrlOff(); }, { passive: true });
  addEventListener('scroll', () => { if (layer) hideHints(); }, true);
  addEventListener('resize', () => { if (layer) hideHints(); });

  // ---------- the keys sheet ----------
  // (round 160, boot160) its code is keys-sheet.js (lazy group 'keyssheet'): read the first time it opens
  const sheetIn = () => !window.Lazy || Lazy.isIn('keyssheet');
  function open(filter = '') {
    if (sheetIn()) return KeysSheet.open(filter);
    Lazy.load('keyssheet').then(() => KeysSheet.open(filter)).catch((err) => toast(err.message, { type: 'error' }));
    return null;
  }
  function close() { if (sheetIn()) KeysSheet.close(); }
  const isOpen = () => sheetIn() && KeysSheet.isOpen();

  // ---------- the button, bottom left ----------
  let btn = null;
  function mountButton() {
    const rail = document.getElementById('rail');
    if (!rail || document.getElementById('keys-btn')) return;
    btn = el('button', { class: 'tool-btn keys-btn', id: 'keys-btn', title: `Keys & hidden buttons (${keyText('Ctrl+/')}) · hold ${MAC ? '⌥' : 'Alt'} for tucked buttons, ${MAC ? '⌘' : 'Ctrl'} for key badges`, dataset: { feature: 'Keys button' } });
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>';
    btn.addEventListener('click', () => open());
    // right-click the keys button: the reveal switches in one short menu
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX + 6, e.clientY - 150, [
        { label: 'Keys & hidden buttons…', key: 'Ctrl+/', action: () => open() },
        // (round 13, speed) Again and the recent actions, under the pointer
        ...(typeof Speed !== 'undefined' ? [{ label: 'Recent actions', key: 'Ctrl+Shift+.', items: () => Speed.recentItems(10) }, { label: 'Pick up where you left off…', action: () => Commands.exec('/resume', H.claudeAgent()?.id) }] : []),
        { label: 'Show the tucked buttons', key: 'Alt Alt', checked: latched, action: () => latch() },
        { label: 'Key badges while Ctrl is held', checked: store.get('keys.ctrlHints', true), action: () => store.set('keys.ctrlHints', !store.get('keys.ctrlHints', true)) },
        { label: 'Customise', items: customiseMenu },
        { label: 'Show everything, always', checked: typeof Declutter !== 'undefined' && Declutter.isOff(), action: () => Commands.exec(`/calm ${Declutter.isOff() ? 'on' : 'off'}`, H.claudeAgent()?.id) },
      ]);
    });
    rail.append(btn);
  }

  // every area's Customise this… in one menu (the sheet's Customise…, a right-click on the keys button)
  function customiseMenu() {
    if (typeof Declutter === 'undefined') return [];
    return Declutter.areas().map((a) => ({ label: a, hint: `${Declutter.REVEAL.filter((r) => r.area === a && Declutter.pinned(r.id)).length || ''}`, items: () => (Declutter.customiseItems(a, null, { exact: true })[1]?.items || []).filter((it) => it !== '-' && !/Customise|Keys and hidden/.test(it.label || '')) }));
  }

  // ---------- the registry: every key, reveal and right-click menu in the app ----------
  // (round 139, room139) the first lines are here; the rest of the sheet's lines (the Lab, the timeline, right-click
  // menus…) are keys-lines.js (lazy group 'keyslines'), whose stand-ins follow these in the same order
  const sc = (key, shift = false) => () => handleShortcut({ key, shift });
  function register() {
    const G = 'Everywhere';
    Keys.add([
      // the reveal itself first
      { area: 'Hidden buttons', keys: 'Hold Alt', what: 'Show the tucked buttons in place (dashed outline) while it is held', run: () => latch(true) },
      { area: 'Hidden buttons', keys: 'Alt, Alt', what: 'Tap Alt twice: keep them showing (Esc or tap twice again hides them)', run: () => latch() },
      { area: 'Hidden buttons', keys: 'Hold Ctrl', what: 'Key badges on every button that has a key', run: () => { showHints(); setTimeout(hideHints, 3000); } },
      { area: 'Hidden buttons', keys: 'Right-click anything', what: '… → Customise this…: pin a tucked button back on screen, hide one, or show everything', run: () => Commands.exec('/customise', H.claudeAgent()?.id) },
      { area: 'Hidden buttons', keys: 'Right-click ⌨', what: 'Show everything, always (untick it to tidy again)', run: () => Commands.exec('/calm off', H.claudeAgent()?.id) },
      // everywhere
      { area: G, keys: 'Ctrl+K', what: 'Find anything: a setting, an AI setup row, a menu action, a chat (and what was said in it), "how do I…"', run: () => AppUI.palette() },
      { area: G, keys: 'Ctrl+;', what: 'Command bar over any tool: plain words work ("make it 9 by 16")', run: () => CmdBar.toggle() },
      { area: G, keys: 'F1', what: 'Every chat command, searchable', run: () => CmdBar.help() },
      { area: G, keys: 'Ctrl+/', what: 'This sheet (the keys button, bottom left)' },
      { area: G, keys: 'Ctrl+1…9', what: 'The rail, top to bottom: your agents, then the tools (Lab, Board, Commands…)' },
      { area: G, keys: 'Ctrl+Tab', what: 'The agent or tool before (again: further back)', run: () => AppUI.switchRecent(false) },
      { area: G, keys: 'Ctrl+N', what: 'New chat', run: sc('n') },
      { area: G, keys: 'Ctrl+F', what: 'Find in the current view', run: () => AppUI.find() },
      { area: G, keys: 'Ctrl+J', what: 'Notes', run: () => Lazy.load('notes').then(() => Notes.toggle()) }, // (round 118, startup118: Notes loads after the start)
      { area: G, keys: 'Ctrl+\\', what: 'Show / hide the chats panel', run: sc('\\') },
      { area: G, keys: 'Ctrl+G', what: 'All agents side by side', run: sc('g') },
      { area: G, keys: 'Ctrl+B', what: 'Show / hide the ask-all bar', run: sc('b') },
      { area: G, keys: 'Ctrl+Shift+Space', what: 'Ask all agents at once', run: sc(' ', true) },
      { area: G, keys: 'Ctrl+= / Ctrl+- / Ctrl+0', what: 'Size of everything bigger / smaller / automatic (kept for each screen)', run: () => AppUI.zoom(0) },
      { area: G, keys: 'Ctrl+,', what: 'Settings', run: () => AppUI.openSettings() },
      { area: G, keys: 'Ctrl+Shift+L', what: 'Appearance: looks, textures, glow, motion', run: () => Look.openDialog() },
      { area: G, keys: 'Ctrl+Shift+U', what: 'Token & usage dashboard' },
      { area: G, keys: 'Ctrl+Shift+S', what: 'Snapshot the window into the chat you are using', run: () => AppUI.snapshotToChat() },
      { area: G, keys: 'Ctrl+Shift+T', what: 'Keep Hearth on top of other windows', run: () => AppUI.toggleOnTop() },
      { area: G, keys: 'Ctrl+R', what: 'Reload a website agent · restart the Lab picture' },
      { area: G, keys: 'Ctrl+Shift+R', what: 'Reload Hearth itself' },
      // (round 31, winmac) the global hotkey is the real Control key on a Mac (⌘⌥H hides other apps), not ⌘
      { area: G, keys: MAC ? '⌃⌥H' : 'Ctrl+Alt+H', what: 'Show / hide Hearth from any app (Settings → More settings changes it)' },
      { area: G, keys: MAC ? '⌃⌥I' : 'Ctrl+Alt+I', what: '💡 Quick idea from any app: a small window, then click where it goes (also in the tray menu; Settings › Advanced › Keys changes it)', run: () => window.hub.quickIdea?.op({ op: 'open' }) }, // (round 71, quickidea71)
    ]);
  }

  // Ctrl+/ and the palette open the sheet
  queueMicrotask(() => AppUI.addAction?.('Keys & hidden buttons (the keys sheet)', () => open(), 'Ctrl+/'));
  register();
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mountButton); else mountButton();
  addEventListener('DOMContentLoaded', () => {
    if (typeof Commands === 'undefined' || Commands.get('shortcuts')) return;
    Commands.register({ name: 'shortcuts', aliases: ['keysheet', 'cheatsheet'], args: '[word]', area: 'App', desc: 'The keys sheet: every key, Alt / Ctrl reveal and right-click menu (the keys button, bottom left)', keywords: 'keys keyboard hotkeys hidden buttons right click alt ctrl', examples: ['/shortcuts freeze'], run: (a) => { open(String(a || '').trim() || ''); return null; } });
  });

  return { customiseMenu, open, close, latch, isLatched: () => latched, showHints, hideHints, keyText, kbds, isOpen,
    comboOf: (k) => KeysSheet.comboOf(k), runLine: (e) => KeysSheet.runLine(e), hereAreas: () => KeysSheet.hereAreas(), // (keys-sheet.js, once in)
    _kit: { kbds, keyText, whatText, latch, isLatched: () => latched, showHints, hideHints, customiseMenu, button: () => btn } }; // (keys-sheet.js)
})();
