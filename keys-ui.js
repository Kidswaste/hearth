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
  const keyText = (k) => (MAC ? MAC_SYM.reduce((s, [re, to]) => s.replace(re, to), String(k)) : String(k));
  // "Ctrl+Shift+U / Alt+1…9" → <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>U</kbd> / <kbd>Alt</kbd><kbd>1…9</kbd>
  function kbds(keys) {
    const out = [];
    String(keys).split(/(\s+\/\s+|\s+·\s+|,\s+|\s+then\s+|\s+or\s+)/).forEach((part, i) => {
      if (i % 2) { out.push(el('span', { class: 'ks-sep', text: part.trim() === '/' ? '/' : ` ${part.trim()} ` })); return; }
      const lead = part.match(/^(Right-click|Double-click|Hold|Point at|Type)\s+(.+)$/);
      // "Right-click a slider" → [Right-click] a slider · "Hold Alt" → hold [Alt]
      if (lead && /^(Hold|Point at|Type)$/.test(lead[1])) { out.push(el('span', { class: 'ks-word', text: lead[1].toLowerCase() }), ...lead[2].split(/\+(?=.)/).map((t) => el('kbd', { text: keyText(t) }))); return; }
      if (lead) { out.push(el('kbd', { text: lead[1] }), el('span', { class: 'ks-word', text: keyText(lead[2]) })); return; }
      const toks = part.length > 1 ? part.split(/\+(?=.)/) : [part];
      toks.forEach((t) => { if (t) out.push(/\s/.test(t) ? el('span', { class: 'ks-word', text: keyText(t) }) : el('kbd', { text: keyText(t) })); });
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
    ['.mb-g-capture button', 'N'], ['.dd-undo', 'Alt+Shift+Z'], ['.dd-fold', 'Alt+Shift+D'], ['.dd-rail', 'Alt+Shift+D'], ['.tool-dock .native-head > button:last-of-type', 'Ctrl+N'],
  ];
  const TITLE_KEY = /(?:^|[\s(·,])((?:(?:Ctrl|Alt|Shift|⌘|⌥|⇧)\+)+(?:F\d{1,2}|Enter|Space|Tab|Home|End|PgUp|PgDn|Delete|Esc|[A-Z0-9]|[,.;/\\[\]`=+\-|?]|←|→|↑|↓))|\((F\d{1,2}|Space|Esc|Home|End|[A-Z0-9?`|\\/.,[\]←→↑↓])(?:\s+or\s+[^)]*)?\)/;
  function keyFor(b) {
    if (b.dataset.key) return b.dataset.key;
    for (const [sel, k] of HINTS) if (b.matches(sel)) return k;
    const agent = b.closest('#agent-buttons') && [...document.querySelectorAll('#agent-buttons .agent-btn:not(.tool-btn-rail)')].indexOf(b);
    if (agent != null && agent >= 0 && agent < 9) return `Ctrl+${agent + 1}`;
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
      const text = keyText(k).replace(/Shift\+/g, '⇧');
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
  let sheet = null;
  // what applies where you are: areas for the tool or chat on screen
  function hereAreas() {
    const id = H.surfaceIdFor?.(H.activeId) || H.activeId || '';
    if (id === 'tool:three') return ['Lab', 'Lab timeline', 'Lab sliders & layers', 'Present', 'Director dock', 'Nodes'];
    if (id === 'tool:ae') return ['Video Review', 'Director dock'];
    if (id === 'tool:forgeheart') return ['Forge'];
    if (H.agent(H.activeId)?.mode === 'native') return ['Chat box', 'Chats panel'];
    return [];
  }
  const hereLabel = () => { const id = H.surfaceIdFor?.(H.activeId) || H.activeId || ''; return id.startsWith('tool:') ? Tools.get?.(id.slice(5))?.name || 'this tool' : H.agent(H.activeId)?.name || 'here'; };
  const visibleOne = (sel) => [...document.querySelectorAll(sel)].find((n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width);
  function flash(nodes) {
    for (const n of nodes) { n.classList.remove('ks-flash'); void n.offsetWidth; n.classList.add('ks-flash'); setTimeout(() => n.classList.remove('ks-flash'), 1600); }
  }
  // a single key combination ("Ctrl+Shift+U", "F", "Shift+3") → a key event; anything else (ranges, drags) → null
  function comboOf(keys) {
    const k = String(keys).trim();
    if (/…|\s\/\s|drag|click|Hold|then|\s|^$/.test(k) && !/^Ctrl \+/.test(k)) return null;
    const parts = k.split(/\+(?=.)/);
    const key = parts.pop();
    const mods = new Set(parts.map((p) => p.toLowerCase()));
    if ([...mods].some((m) => !['ctrl', 'alt', 'shift'].includes(m))) return null;
    const named = { Space: ' ', Esc: 'Escape', PgUp: 'PageUp', PgDn: 'PageDown', '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown', Del: 'Delete' };
    let name = named[key] || key;
    if (name.length === 1 && /[a-z]/i.test(name)) name = mods.has('shift') ? name.toUpperCase() : name.toLowerCase();
    const code = /^[a-z]$/i.test(name) ? `Key${name.toUpperCase()}` : /^\d$/.test(name) ? `Digit${name}` : name === ' ' ? 'Space' : { ';': 'Semicolon', ',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash', '`': 'Backquote', '[': 'BracketLeft', ']': 'BracketRight', '=': 'Equal', '-': 'Minus' }[name] || name;
    return { key: name, code, ctrlKey: mods.has('ctrl'), altKey: mods.has('alt'), shiftKey: mods.has('shift'), bubbles: true, cancelable: true };
  }
  function targetFor(area) {
    const s = document.querySelector('.surface.active');
    if (area === 'Chat box') { const id = H.activeId; const v = Native.view?.(H.agent(id)?.mode === 'native' ? id : Tools.dockedAgent?.(String(H.surfaceIdFor?.(id)).replace('tool:', ''))?.id); return v?.input || null; }
    if (/^Lab|^Present/.test(area)) return s?.querySelector('.three-toolbar, .tb-group') || s;
    if (area === 'Video Review') return s?.querySelector('.vr-top, .tool-body') || s;
    return document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
  }
  function runLine(e) {
    close();
    try {
      if (e.run) { e.run(); return; }
      if (e.area === 'Right-click' && e.sel) {
        const n = visibleOne(e.sel);
        if (!n) { toast(`Not on screen here: ${e.what}`, { timeout: 2000 }); return; }
        n.scrollIntoView({ block: 'nearest' });
        flash([n]);
        const r = n.getBoundingClientRect();
        setTimeout(() => n.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(r.width / 2, 60), clientY: r.top + Math.min(r.height / 2, 18), button: 2 })), 220);
        return;
      }
      const combo = comboOf(e.keys);
      const target = combo && targetFor(e.area);
      if (combo && target) {
        if (target.focus && target !== document.body) target.focus({ preventScroll: true });
        target.dispatchEvent(new KeyboardEvent('keydown', combo));
        target.dispatchEvent(new KeyboardEvent('keyup', combo));
        return;
      }
      if (e.sel) { const ns = [...document.querySelectorAll(e.sel)].filter((n) => n.checkVisibility?.({ visibilityProperty: true })); if (ns.length) { flash(ns); return; } }
      toast(`${keyText(e.keys)}: ${e.what}`, { timeout: 2600 });
    } catch (err) { toast(err.message, { type: 'error' }); }
  }
  function open(filter = '') {
    if (sheet) { close(); if (!filter) return; }
    const q = el('input', { class: 'ks-search', type: 'search', placeholder: `Search ${Keys.all().length} keys and menus…`, value: typeof filter === 'string' ? filter : '', spellcheck: false });
    const body = el('div', { class: 'ks-body' });
    const tip = (label, keys, fn) => el('button', { type: 'button', class: 'ks-tip', on: { click: fn } }, el('span', { class: 'ks-tip-keys' }, kbds(keys)), el('span', { text: label }));
    const tips = el('div', { class: 'ks-tips' },
      tip('more buttons', 'Hold Alt', () => { close(); latch(true); }),
      tip('key badges', 'Hold Ctrl', () => { close(); showHints(); setTimeout(hideHints, 3000); }),
      tip('menus', 'Right-click', () => { q.value = 'right-click'; paint(); }));
    const latchBtn = el('button', { type: 'button', class: `ks-latch${latched ? ' on' : ''}`, text: latched ? 'Tuck them away' : 'Show tucked buttons', title: 'Same as tapping Alt twice', on: { click: () => { latch(); close(); } } });
    sheet = el('div', { class: 'keys-sheet', role: 'dialog', 'aria-label': 'Keys and hidden buttons' },
      el('div', { class: 'ks-head' }, el('b', { text: 'Keys & hidden buttons' }), el('span', { class: 'spacer' }), latchBtn, el('button', { type: 'button', class: 'ks-x', text: '×', title: 'Close (Esc)', on: { click: () => close() } })),
      q, tips, body,
      el('div', { class: 'ks-foot' }, el('span', { text: 'Not a shortcut person? Every line here is also in a menu or a /command.' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ks-link', text: '/help', title: 'Every chat command', on: { click: () => { close(); Commands.exec('/help', H.claudeAgent()?.id); } } }),
        el('button', { type: 'button', class: 'ks-link', text: 'Table', title: 'The printable table of keys', on: { click: () => { close(); AppUI.shortcutsHelp(); } } })));
    let sel = -1;
    function paint() {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const here = hereAreas();
      const groups = [...Keys.groups(true)];
      const rank = ([area]) => (here.includes(area) ? 0 : area === 'Hidden buttons' ? 1 : area === 'Right-click' ? 2 : area === 'Everywhere' ? 3 : area === 'Menus' ? 4 : 5);
      groups.sort((a, b) => rank(a) - rank(b));
      const out = [];
      for (const [area, lines] of groups) {
        const hits = lines.filter((x) => !words.length || words.every((w) => `${x.keys} ${keyText(x.keys)} ${x.what} ${area}`.toLowerCase().includes(w)));
        if (!hits.length) continue;
        const away = !here.includes(area) && rank([area]) === 5;
        out.push(el('div', { class: `ks-group${away ? ' away' : ''}` }, el('h4', { text: here.includes(area) ? `${area} · ${hereLabel()}` : area }),
          ...hits.map((x) => {
            const applies = !x.when || (() => { try { return x.when(); } catch { return false; } })();
            return el('button', { type: 'button', class: `ks-line${applies ? '' : ' elsewhere'}`, title: x.run ? 'Click to do it' : x.area === 'Right-click' ? 'Click to open that menu' : comboOf(x.keys) ? 'Click to press it' : 'Click to see where', on: { click: () => runLine(x) } },
              el('span', { class: 'ks-keys' }, kbds(x.keys)), el('span', { class: 'ks-what', text: x.what }));
          })));
      }
      body.replaceChildren(...(out.length ? out : [el('p', { class: 'hint ks-none', text: 'Nothing matches. Try a word like "freeze", "slider" or "copy".' })]));
      sel = -1;
    }
    q.addEventListener('input', paint);
    sheet.addEventListener('keydown', (e) => {
      const lines = [...sheet.querySelectorAll('.ks-line')];
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q.value) { q.value = ''; paint(); } else close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(lines.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); lines.forEach((l, i) => l.classList.toggle('kb-on', i === sel)); lines[sel]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && e.target === q) { e.preventDefault(); (lines[sel] || lines[0])?.click(); }
    });
    paint();
    document.body.append(sheet);
    btn?.classList.add('on');
    q.focus();
    setTimeout(() => addEventListener('pointerdown', away, true), 0);
    return sheet;
  }
  const away = (e) => { if (sheet && !sheet.contains(e.target) && !e.target.closest?.('#keys-btn')) close(); };
  function close() {
    removeEventListener('pointerdown', away, true);
    if (!sheet) return;
    const s = sheet; sheet = null;
    btn?.classList.remove('on');
    s.classList.add('out');
    setTimeout(() => s.remove(), 140);
  }

  // ---------- the button, bottom left ----------
  let btn = null;
  function mountButton() {
    const rail = document.getElementById('rail');
    if (!rail || document.getElementById('keys-btn')) return;
    btn = el('button', { class: 'tool-btn keys-btn', id: 'keys-btn', title: `Keys & hidden buttons (${keyText('Ctrl+/')}) · hold ${MAC ? '⌥' : 'Alt'} for tucked buttons, ${MAC ? '⌘' : 'Ctrl'} for key badges`, dataset: { feature: 'Keys button' } });
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>';
    btn.addEventListener('click', () => open());
    rail.append(btn);
  }

  // ---------- the registry: every key, reveal and right-click menu in the app ----------
  const inLab = () => H.surfaceIdFor?.(H.activeId) === 'tool:three';
  const inVideo = () => H.surfaceIdFor?.(H.activeId) === 'tool:ae';
  const inChat = () => H.agent(H.activeId)?.mode === 'native' || Boolean(Tools.dockedAgent?.(String(H.surfaceIdFor?.(H.activeId) || '').replace('tool:', '')));
  const act = (name) => () => ThreeLab.act(name);
  const sc = (key, shift = false) => () => handleShortcut({ key, shift });
  function register() {
    const G = 'Everywhere';
    Keys.add([
      // the reveal itself first
      { area: 'Hidden buttons', keys: 'Hold Alt', what: 'Show the tucked buttons in place (dashed outline) while it is held', run: () => latch(true) },
      { area: 'Hidden buttons', keys: 'Alt, Alt', what: 'Tap Alt twice: keep them showing (Esc or tap twice again hides them)', run: () => latch() },
      { area: 'Hidden buttons', keys: 'Hold Ctrl', what: 'Key badges on every button that has a key', run: () => { showHints(); setTimeout(hideHints, 3000); } },
      { area: 'Hidden buttons', keys: 'Right-click anything', what: '… → Customise this…: pin a tucked button back on screen, hide one, or show everything', run: () => Commands.exec('/customise', H.claudeAgent()?.id) },
      { area: 'Hidden buttons', keys: '/calm off', what: 'Show everything, always (/calm on tidies again)', run: () => Commands.exec('/calm off', H.claudeAgent()?.id) },
      // everywhere
      { area: G, keys: 'Ctrl+K', what: 'Command palette (? searches messages, / chat commands)', run: () => AppUI.palette() },
      { area: G, keys: 'Ctrl+;', what: 'Command bar over any tool: plain words work ("make it 9 by 16")', run: () => CmdBar.toggle() },
      { area: G, keys: 'F1', what: 'Every chat command, searchable', run: () => CmdBar.help() },
      { area: G, keys: 'Ctrl+/', what: 'This sheet (the keys button, bottom left)' },
      { area: G, keys: 'Ctrl+1…9', what: 'Switch to agent 1…9 in the rail' },
      { area: G, keys: 'Ctrl+Tab', what: 'The agent or tool before (again: further back)', run: () => AppUI.switchRecent(false) },
      { area: G, keys: 'Ctrl+N', what: 'New chat', run: sc('n') },
      { area: G, keys: 'Ctrl+F', what: 'Find in the current view', run: () => AppUI.find() },
      { area: G, keys: 'Ctrl+J', what: 'Notes', run: () => Notes.toggle() },
      { area: G, keys: 'Ctrl+\\', what: 'Show / hide the chats panel', run: sc('\\') },
      { area: G, keys: 'Ctrl+G', what: 'All agents side by side', run: sc('g') },
      { area: G, keys: 'Ctrl+B', what: 'Show / hide the ask-all bar', run: sc('b') },
      { area: G, keys: 'Ctrl+Shift+Space', what: 'Ask all agents at once', run: sc(' ', true) },
      { area: G, keys: 'Ctrl+= / Ctrl+- / Ctrl+0', what: 'Text size bigger / smaller / normal', run: () => AppUI.zoom(0) },
      { area: G, keys: 'Ctrl+,', what: 'Settings', run: () => AppUI.openSettings() },
      { area: G, keys: 'Ctrl+Shift+L', what: 'Appearance: looks, textures, glow, motion', run: () => Look.openDialog() },
      { area: G, keys: 'Ctrl+Shift+U', what: 'Token & usage dashboard' },
      { area: G, keys: 'Ctrl+Shift+S', what: 'Snapshot the window into the chat you are using', run: () => AppUI.snapshotToChat() },
      { area: G, keys: 'Ctrl+Shift+T', what: 'Keep Hearth on top of other windows', run: () => AppUI.toggleOnTop() },
      { area: G, keys: 'Ctrl+R', what: 'Reload a website agent · restart the Lab picture' },
      { area: G, keys: 'Ctrl+Shift+R', what: 'Reload Hearth itself' },
      { area: G, keys: 'Ctrl+Alt+H', what: 'Show / hide Hearth from any app (Settings → More settings changes it)' },
      { area: G, keys: 'Shift+Esc', what: 'Dismiss every notification', run: () => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()) },
      { area: G, keys: 'Esc', what: 'Close a menu or dialog · stop a jam' },
      // menus
      { area: 'Menus', keys: '↑ / ↓', what: 'Move in a menu (Home / End: first / last)' },
      { area: 'Menus', keys: 'Enter', what: 'Run the highlighted item' },
      { area: 'Menus', keys: '→', what: 'Open a submenu (the rows with ›)' },
      { area: 'Menus', keys: '← / Backspace', what: 'Back out of a submenu' },
      { area: 'Menus', keys: 'Type', what: 'Filter a long menu (its submenus too) · jump to a letter in a short one' },
      { area: 'Menus', keys: 'Point at ›', what: 'A submenu opens beside the menu; click there to run an item directly' },
      // the chat box
      { area: 'Chat box', keys: 'Enter / Shift+Enter', what: 'Send / new line', when: inChat },
      { area: 'Chat box', keys: '/', what: 'Chat commands (at the start of the message box)', when: inChat, sel: 'form.composer textarea' },
      { area: 'Chat box', keys: 'Esc', what: 'Stop the reply being written (or reading aloud)', when: inChat },
      { area: 'Chat box', keys: 'Alt+T', what: 'Open / close every thinking block', when: inChat },
      { area: 'Chat box', keys: 'Alt+R', what: 'Read the last reply aloud (again: stop)', when: inChat },
      { area: 'Chat box', keys: 'Alt+B', what: 'Bookmark the last reply', when: inChat },
      { area: 'Chat box', keys: 'Alt+P', what: 'Pin the last reply', when: inChat },
      { area: 'Chat box', keys: 'Alt+M', what: 'The last reply’s menu', when: inChat },
      { area: 'Chat box', keys: 'Alt+F', what: 'Find in this chat', when: inChat },
      { area: 'Chat box', keys: 'Alt+↑ / Alt+↓', what: 'Messages you sent before', when: inChat },
      { area: 'Chat box', keys: 'Alt+Home / Alt+End', what: 'Top / bottom of the chat', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+↑ / Ctrl+↓', what: 'Jump between your own messages', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Shift+C', what: 'Copy the last reply', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+V', what: 'Paste a screenshot or file: it is attached', when: inChat },
      { area: 'Chat box', keys: 'Tab', what: 'Indent inside a ``` code block', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Alt+C', what: '⚇ Work with Astra: the collab menu', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Alt+D', what: 'Duo with Astra on / off', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Alt+M', what: 'Next model for this chat', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Alt+O', what: 'A second opinion from the other agent', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Alt+H', what: 'Hand the chat to the other agent', when: inChat },
      { area: 'Chat box', keys: 'Ctrl+Alt+S', what: 'Stop a Claude × Astra collaboration', when: inChat },
      // the chats panel
      { area: 'Chats panel', keys: '↑ / ↓', what: 'Move through the chats (from the search box: ↓)', sel: '#panel .item' },
      { area: 'Chats panel', keys: 'Enter', what: 'Open the chat', sel: '#panel .item' },
      { area: 'Chats panel', keys: 'F2', what: 'Rename the chat', sel: '#panel .item' },
      { area: 'Chats panel', keys: 'Delete', what: 'Delete the chat (30 days in Recently deleted)', sel: '#panel .item' },
      { area: 'Chats panel', keys: 'Shift+F10', what: 'The chat’s menu (like a right-click)', sel: '#panel .item' },
      // the Lab
      { area: 'Lab', keys: 'Space', what: 'Play / pause', when: inLab },
      { area: 'Lab', keys: 'F', what: 'Freeze the picture (\\ too) · . steps one frame while frozen', when: inLab, run: act('freeze') },
      { area: 'Lab', keys: 'Shift+1', what: 'Frame size: Fit', when: inLab, run: act('sizeFit') },
      { area: 'Lab', keys: 'Shift+2', what: 'Frame size: 9:16 (1080×1920)', when: inLab, run: act('size916') },
      { area: 'Lab', keys: 'Shift+3', what: 'Frame size: 16:9 (1920×1080)', when: inLab, run: act('size169') },
      { area: 'Lab', keys: 'Shift+4', what: 'Frame size: 4:5 (1080×1350)', when: inLab, run: act('size45') },
      { area: 'Lab', keys: 'Shift+5', what: 'Frame size: 1:1 (1080×1080)', when: inLab, run: act('size11') },
      { area: 'Lab', keys: 'T', what: 'Tap the tempo (live sound too) · Shift+T: this tap is the 1', when: inLab },
      { area: 'Lab', keys: 'Shift+L', what: 'Live sound on / off', when: inLab, run: act('live') },
      { area: 'Lab', keys: 'R', what: 'Shuffle the sliders', when: inLab, run: act('shuffle') },
      { area: 'Lab', keys: 'Shift+R', what: 'The shuffle before', when: inLab, run: act('shuffleBack') },
      { area: 'Lab', keys: 'Ctrl+S', what: 'Save the sliders into the code', when: inLab, run: act('saveSliders') },
      { area: 'Lab', keys: 'Ctrl+Shift+S', what: 'Save the sliders as a look', when: inLab, run: act('saveLook') },
      { area: 'Lab', keys: 'Shift+A / Shift+B / Shift+C', what: 'Recall slider slot A, B, C', when: inLab, run: act('slotA') },
      { area: 'Lab', keys: 'P', what: 'Present: just the picture, fullscreen', when: inLab, run: act('present') },
      { area: 'Lab', keys: 'X', what: 'Effects & layers picker (Shift+X: everything)', when: inLab, run: () => ThreeFX.openPicker('add') },
      { area: 'Lab', keys: 'O', what: 'Your sketches, as pictures', when: inLab },
      { area: 'Lab', keys: '`', what: 'Show / hide the console', when: inLab },
      { area: 'Lab', keys: 'E', what: 'Edit scene: move the selected layer’s 3D scene', when: inLab },
      { area: 'Lab', keys: 'N', what: 'A note with a screenshot at this moment', when: inLab },
      { area: 'Lab', keys: 'W', what: 'Write: record slider moves as curves while it plays', when: inLab },
      { area: 'Lab', keys: '|', what: 'Pin this frame to compare with what comes next', when: inLab, run: act('pin') },
      { area: 'Lab', keys: 'Shift+F', what: 'Focus: almost fullscreen (Esc leaves)', when: inLab },
      { area: 'Lab', keys: 'Alt+N', what: 'Code ⇄ nodes (in the code view)', when: inLab },
      { area: 'Lab', keys: '?', what: 'Every Lab key in one dialog', when: inLab, run: act('keys') },
      { area: 'Lab', keys: 'Ctrl+Enter', what: 'Run every layer again', when: inLab },
      { area: 'Lab', keys: 'Ctrl+Shift+Enter', what: 'Restart from scratch (fresh page, GPU and sound)', when: inLab, run: act('restart') },
      { area: 'Lab', keys: 'Ctrl+PgDn / Ctrl+PgUp', what: 'Next / previous sketch', when: inLab, run: act('nextSketch') },
      { area: 'Lab', keys: 'Ctrl+Z', what: 'Undo a grid, marker, cue or curve change', when: inLab },
      // the Lab timeline
      { area: 'Lab timeline', keys: '← / →', what: 'Nudge 10 ms (Alt: 1 ms, Shift: a grid step)', when: inLab },
      { area: 'Lab timeline', keys: ', / .', what: 'Nudge by ear', when: inLab },
      { area: 'Lab timeline', keys: 'Home / End', what: 'Start / end (of the loop)', when: inLab },
      { area: 'Lab timeline', keys: '[ / ]', what: 'Loop start / end at the playhead', when: inLab },
      { area: 'Lab timeline', keys: '{ / }', what: 'Trim the song’s start / end at the playhead', when: inLab },
      { area: 'Lab timeline', keys: 'K / S / H', what: 'Kick / snare / hit marker at the playhead', when: inLab },
      { area: 'Lab timeline', keys: 'C', what: 'Drop a hot cue', when: inLab },
      { area: 'Lab timeline', keys: '1…9', what: 'Jump to cue 1…9 (PgUp / PgDn: previous / next cue)', when: inLab },
      { area: 'Lab timeline', keys: 'A', what: 'Show / hide every animated curve', when: inLab },
      { area: 'Lab timeline', keys: 'L', what: 'Loop this bar', when: inLab, run: act('loopBar') },
      { area: 'Lab timeline', keys: 'G', what: 'Next snap setting', when: inLab, run: act('snap') },
      { area: 'Lab timeline', keys: 'Q', what: 'Quantize taps on / off', when: inLab, run: act('quantizeTaps') },
      { area: 'Lab timeline', keys: 'M', what: 'Mute / unmute', when: inLab, run: act('mute') },
      { area: 'Lab timeline', keys: '= / - / 0', what: 'Zoom the timeline in / out / whole song', when: inLab },
      { area: 'Lab timeline', keys: 'Delete', what: 'Delete the selected points or marker', when: inLab },
      { area: 'Lab timeline', keys: 'Esc', what: 'Clear the taps / the selection', when: inLab },
      { area: 'Lab timeline', keys: 'Shift+drag', what: 'Select points in a curve lane', when: inLab },
      { area: 'Lab timeline', keys: 'Ctrl+drag', what: 'Draw points in a curve lane', when: inLab },
      { area: 'Lab timeline', keys: 'Alt+drag', what: 'Stretch the swing of a selection', when: inLab },
      { area: 'Lab timeline', keys: 'Ctrl+C / V / D / A', what: 'Copy, paste at the playhead, duplicate, select all points', when: inLab },
      { area: 'Lab timeline', keys: 'Double-click', what: 'Delete a marker', when: inLab },
      // Lab sliders & layers
      { area: 'Lab sliders & layers', keys: '/', what: 'Find a slider', when: inLab, sel: '.tw-search' },
      { area: 'Lab sliders & layers', keys: 'Alt+1…9', what: 'Hide / show layer 1…9 (Alt+Shift: only that one)', when: inLab },
      { area: 'Lab sliders & layers', keys: 'Alt+click', what: 'A layer’s eye: show only that layer · a look: morph into it', when: inLab, sel: '.ly-eye' },
      { area: 'Lab sliders & layers', keys: 'Double-click', what: 'A slider’s value: back to the code’s value · a layer’s name: rename', when: inLab },
      { area: 'Lab sliders & layers', keys: 'Shift+click', what: '▶ Run: restart from scratch · 📷: copy the still', when: inLab },
      // Present
      { area: 'Present', keys: 'Esc', what: 'Leave Present', when: inLab },
      { area: 'Present', keys: 'B', what: 'Fade to black and back', when: inLab },
      { area: 'Present', keys: 'I', what: 'The info line (sketch, time, BPM)', when: inLab },
      { area: 'Present', keys: 'PgUp / PgDn', what: 'Previous / next sketch', when: inLab },
      // the director dock
      { area: 'Director dock', keys: 'Alt+Shift+Z', what: 'Undo the director’s last code edit', when: inLab, run: () => DirectorDock.undoEdit() },
      { area: 'Director dock', keys: 'Alt+Shift+Y', what: 'Redo it', when: inLab, run: () => DirectorDock.redoEdit() },
      { area: 'Director dock', keys: 'Alt+Shift+D', what: 'Collapse / open the docked chat' },
      { area: 'Director dock', keys: 'Double-click', what: 'The divider: collapse / expand the chat', sel: '.tool-dock-divider' },
      // nodes
      { area: 'Nodes', keys: 'Space+drag', what: 'Pan the graph' },
      { area: 'Nodes', keys: 'Ctrl+F', what: 'Find a node' },
      { area: 'Nodes', keys: 'Ctrl+Z / Ctrl+Shift+Z', what: 'Undo / redo' },
      { area: 'Nodes', keys: 'Ctrl+C / X / V / D', what: 'Copy, cut, paste, duplicate nodes' },
      { area: 'Nodes', keys: 'Ctrl+G', what: 'Frame the selection' },
      { area: 'Nodes', keys: 'Ctrl+A', what: 'Select every node' },
      { area: 'Nodes', keys: '[ / ]', what: 'Select what feeds / what it feeds' },
      { area: 'Nodes', keys: 'M', what: 'Bypass the selected nodes' },
      { area: 'Nodes', keys: 'Delete', what: 'Delete the selection (or the selected wire)' },
      { area: 'Nodes', keys: 'F / Home', what: 'Fit the graph (read-only views)' },
      { area: 'Nodes', keys: '?', what: 'The node editor’s help' },
      // Video Review
      { area: 'Video Review', keys: 'Space', what: 'Play / pause', when: inVideo },
      { area: 'Video Review', keys: 'J / K / L', what: 'Back / stop / forward (Shift+L: loop)', when: inVideo },
      { area: 'Video Review', keys: '← / →', what: 'One frame (Shift: 10)', when: inVideo },
      { area: 'Video Review', keys: '↑ / ↓', what: 'Previous / next note', when: inVideo },
      { area: 'Video Review', keys: ', / .', what: 'Previous / next beat', when: inVideo },
      { area: 'Video Review', keys: '< / >', what: 'Previous / next section or drop', when: inVideo },
      { area: 'Video Review', keys: 'I / O / X', what: 'Loop in / out / clear', when: inVideo },
      { area: 'Video Review', keys: 'N', what: 'New note at the playhead', when: inVideo },
      { area: 'Video Review', keys: 'D', what: 'Draw on the frame', when: inVideo },
      { area: 'Video Review', keys: 'P', what: 'Color picker', when: inVideo },
      { area: 'Video Review', keys: 'Y', what: 'Scopes', when: inVideo },
      { area: 'Video Review', keys: 'C / \\', what: 'Compare / swap A and B', when: inVideo },
      { area: 'Video Review', keys: 'G / S', what: 'Guides / safe zones', when: inVideo },
      { area: 'Video Review', keys: 'V / H', what: 'View (channels, luma…) / mirror', when: inVideo },
      { area: 'Video Review', keys: 'Z', what: 'Zoom 100 % / fit', when: inVideo },
      { area: 'Video Review', keys: 'F', what: 'Fullscreen review', when: inVideo },
      { area: 'Video Review', keys: 'B', what: 'Show / hide the library', when: inVideo },
      { area: 'Video Review', keys: 'E', what: 'Cut clips', when: inVideo },
      { area: 'Video Review', keys: '[ / ]', what: 'Slower / faster', when: inVideo },
      { area: 'Video Review', keys: '- / =', what: 'Volume down / up · M: mute', when: inVideo },
      { area: 'Video Review', keys: 'T', what: 'Time as timecode / seconds / frames', when: inVideo },
      { area: 'Video Review', keys: 'Ctrl+C / Ctrl+S', what: 'Copy the frame / save it as a PNG', when: inVideo },
      { area: 'Video Review', keys: '?', what: 'Every Video Review key', when: inVideo },
      // right-click menus: click a line to open it on screen
      { area: 'Right-click', keys: 'Right-click a message', what: 'A message: Copy, Read aloud, Reply ›, Mark ›, Copy & save ›', sel: '.messages .msg[data-index]' },
      { area: 'Right-click', keys: 'Right-click a code block', what: 'A code block: copy, save, open in the Lab / nodes, insert', sel: '.msg .body pre' },
      { area: 'Right-click', keys: 'Right-click the chat header', what: 'The chat header or empty chat: New chat, Model ›, View ›, Organise ›…', sel: '.surface.active .native-head' },
      { area: 'Right-click', keys: 'Right-click around the chat box', what: 'Around the chat box: attach, paste, commands, prompts, Astra', sel: '.surface.active form.composer' },
      { area: 'Right-click', keys: 'Right-click a chat in the list', what: 'A chat in the list: pin, rename, tag, export, delete…', sel: '#panel .item' },
      { area: 'Right-click', keys: 'Right-click a chat group', what: 'A group in the chats list: new chat, collapse, the agent', sel: '#panel .group-head' },
      { area: 'Right-click', keys: 'Right-click an agent', what: 'An agent in the rail: open, recent chats ›, edit, move ›', sel: '#agent-buttons .agent-btn:not(.tool-btn-rail)' },
      { area: 'Right-click', keys: 'Right-click a tool in the rail', what: 'A tool in the rail: open, its director chat, move ›, hide', sel: '#agent-buttons .tool-btn-rail' },
      { area: 'Right-click', keys: 'Right-click the rail', what: 'The rail’s empty space: add, palette, panels ›, settings', sel: '#rail .spacer' },
      { area: 'Right-click', keys: 'Right-click the token pill', what: 'The token pill: dashboard, strip, budgets', sel: '#rail .meter-pill' },
      { area: 'Right-click', keys: 'Right-click the Lab picture', what: 'The Lab picture: Freeze, Frame size ›, Capture ›, Sliders ›, View ›', sel: '.surface.active .three-preview iframe, .surface.active .three-preview' },
      { area: 'Right-click', keys: 'Right-click the Lab toolbar', what: 'The Lab toolbar: Run, Sketch ›, Show ›, Capture ›, effects', sel: '.surface.active .three-toolbar, .surface.active .tb-group' },
      { area: 'Right-click', keys: 'Right-click a frame size', what: 'A frame size button: a still / recording / Stage window at that size', sel: '.surface.active .stage-size-btn' },
      { area: 'Right-click', keys: 'Right-click Freeze', what: 'Freeze: on the next beat / bar / kick, pin, still', sel: '.surface.active .freeze-btn' },
      { area: 'Right-click', keys: 'Right-click a slider', what: 'A slider: reset, lock, favorite, shuffle one, type, copy / paste, history ›, moves ›, keyframe, MIDI', sel: '.surface.active .tw-row' },
      { area: 'Right-click', keys: 'Right-click the sliders panel', what: 'The sliders panel: Save, Shuffle ›, Looks ›, Slots ›, Values ›', sel: '.surface.active .tweaks .tw-head' },
      { area: 'Right-click', keys: 'Right-click Shuffle / Save', what: 'Shuffle / Save: their options', sel: '.surface.active [data-feature="Shuffle"]' },
      { area: 'Right-click', keys: 'Right-click a layer', what: 'A layer: hide, solo, rename, duplicate, move, Opacity ›, Blend ›, delete', sel: '.surface.active .ly-row' },
      { area: 'Right-click', keys: 'Right-click the timeline', what: 'The timeline buttons: play, load, live, triggers, Song ›, Timeline size ›', sel: '.surface.active .media-bar .tb-group' },
      { area: 'Right-click', keys: 'Right-click the waveform', what: 'The waveform, a marker or a loop: their own options', sel: '.surface.active .media-bar canvas' },
      { area: 'Right-click', keys: 'Right-click Tap / Play / Live', what: 'Tap, Play, Live: tempo, speeds, straight on / off', sel: '.surface.active [data-feature="Live sound"]' },
      { area: 'Right-click', keys: 'Right-click the console', what: 'The console: fix, copy, clear, errors only, Shows ›', sel: '.surface.active .three-console-wrap' },
      { area: 'Right-click', keys: 'Right-click Console / Present', what: 'Console / Present buttons: modes and options', sel: '.surface.active [data-feature="Console"]' },
      { area: 'Right-click', keys: 'Right-click the dock', what: 'The director dock: quick asks, undo / redo, Quick chips ›, Dock ›', sel: '.surface.active .dd-strip' },
      { area: 'Right-click', keys: 'Right-click the dock divider', what: 'The dock’s divider: widths', sel: '.surface.active .tool-dock-divider' },
      { area: 'Right-click', keys: 'Right-click ⚇', what: '⚇: every way to work with Astra (duo, relay, debate, council…)', sel: '.surface.active .collab-chip' },
      { area: 'Right-click', keys: 'Right-click a tool header', what: 'A tool’s header: its director chat, snapshot, move, hide', sel: '.surface.active .tool-head' },
      { area: 'Right-click', keys: 'Right-click a notification', what: 'A notification: copy, dismiss, dismiss all', sel: '#toasts .toast' },
      { area: 'Right-click', keys: 'Right-click Notes', what: 'Notes: a note’s options · empty space: new, today, export', sel: '.notes-panel' },
      { area: 'Right-click', keys: 'Right-click a memory fact', what: 'A memory fact: pin, edit, copy, expires, forget', sel: '.memory-row' },
      { area: 'Right-click', keys: 'Right-click in Video Review', what: 'Video Review: a render card, a note, the picture', sel: '.surface.active .vr-card, .surface.active .vr-note' },
      { area: 'Right-click', keys: 'Right-click in the nodes', what: 'Nodes: add a node here, a node’s options', sel: '.surface.active .nv-root, .surface.active .tn-pane' },
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

  return { open, close, latch, isLatched: () => latched, showHints, hideHints, keyText, kbds, isOpen: () => Boolean(sheet), comboOf, runLine, hereAreas };
})();
