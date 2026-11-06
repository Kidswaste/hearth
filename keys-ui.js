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
  let sheet = null;
  // what applies where you are: areas for the tool or chat on screen
  function hereAreas() {
    const id = H.surfaceIdFor?.(H.activeId) || H.activeId || '';
    // round 7's surfaces count too: a capture player / picture open, the board drawer
    const extra = [...(document.querySelector('dialog[open].cap-view, dialog[open].cap-lib, dialog[open].cap-ann') ? ['Capture'] : []), ...(typeof BoardDrawer !== 'undefined' && BoardDrawer.isOpen?.() ? ['Board'] : [])];
    if (id === 'tool:three') return [...extra, 'Lab', 'Lab timeline', 'Lab sliders & layers', 'Effects picker', 'Present', 'Director dock', 'Chat box', 'Nodes'];
    if (id === 'tool:board') return [...extra, 'Board', 'Capture'];
    if (id === 'tool:forgeheart') return [...extra, 'Forge'];
    if (H.agent(H.activeId)?.mode === 'native') return [...extra, 'Chat box', 'Chats panel'];
    return extra;
  }
  const hereLabel = () => { const id = H.surfaceIdFor?.(H.activeId) || H.activeId || ''; return id.startsWith('tool:') ? Tools.get?.(id.slice(5))?.name || 'this tool' : H.agent(H.activeId)?.name || 'here'; };
  const visibleOne = (sel) => [...document.querySelectorAll(sel)].find((n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width);
  function flash(nodes) {
    // (round 17, hz240) replayed two frames later instead of forcing a reflow per highlighted control
    for (const n of nodes) n.classList.remove('ks-flash');
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const n of nodes) { n.classList.add('ks-flash'); setTimeout(() => n.classList.remove('ks-flash'), 1600); } }));
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
    // round 7's surfaces listen on their own roots: a line clicked in the sheet pressed its key into the page body
    if (area === 'Board') return s?.querySelector('.bd-root') || s;
    if (area === 'Capture') return document.querySelector('dialog[open].cap-ann, dialog[open].cap-view') || document.activeElement || document.body;
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
  function open(filter = '', waited = false) {
    if (sheet) { close(); if (!filter) return; }
    // (round 139, room139) most lines are keys-lines.js (lazy group 'keyslines', in a calm moment after the start): the
    // sheet opens once they are in, so it always shows every line with its own run / when
    if (!waited && window.Lazy?.loaded && !Lazy.loaded('keyslines')) { Lazy.load('keyslines').catch(() => {}).then(() => { if (!sheet) open(filter, true); }); return; }
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
      el('div', { class: 'ks-foot' }, el('span', { text: 'Not a shortcut person? Every line here is also in a menu, or just ask a chat.' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ks-link', text: 'Customise…', title: 'What waits behind Alt, what you pinned back on screen', on: { click: (e) => { const r = e.currentTarget.getBoundingClientRect(); close(); showMenu(r.left, r.top - 8, customiseMenu()); } } }),
        el('button', { type: 'button', class: 'ks-link', text: 'Actions', title: 'Everything Hearth can do, searchable', on: { click: () => { close(); Commands.exec('/help', H.claudeAgent()?.id); } } }),
        el('button', { type: 'button', class: 'ks-link', text: 'Table', title: 'The printable table of keys', on: { click: () => { close(); AppUI.shortcutsHelp(); } } })));
    let sel = -1;
    function paint() {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      const here = hereAreas();
      const groups = [...Keys.groups(true)];
      // the areas that apply here keep their order (the open capture before the tool's own lines)
      const rank = ([area]) => (here.includes(area) ? here.indexOf(area) / 100 : area === 'Hidden buttons' ? 1 : area === 'Right-click' ? 2 : area === 'Everywhere' ? 3 : area === 'Menus' ? 4 : area === 'Capture' ? 4.5 : 5); // capture keys work anywhere
      groups.sort((a, b) => rank(a) - rank(b));
      const out = [];
      let nHere = 0;
      for (const [area, lines] of groups) {
        const hits = lines.filter((x) => !words.length || words.every((w) => `${x.keys} ${keyText(x.keys)} ${x.what} ${area}`.toLowerCase().includes(w)));
        if (!hits.length) continue;
        if (here.includes(area)) nHere += 1;
        const away = !here.includes(area) && rank([area]) === 5;
        out.push(el('div', { class: `ks-group${away ? ' away' : ''}` }, el('h4', { text: here.includes(area) ? `${area} · ${hereLabel()}` : area }),
          ...hits.map((x) => {
            const applies = !x.when || (() => { try { return x.when(); } catch { return false; } })();
            return el('button', { type: 'button', class: `ks-line${applies ? '' : ' elsewhere'}`, title: x.run ? 'Click to do it' : x.area === 'Right-click' ? 'Click to open that menu' : comboOf(x.keys) ? 'Click to press it' : 'Click to see where', on: { click: () => runLine(x) } },
              el('span', { class: 'ks-keys' }, kbds(x.keys)), el('span', { class: 'ks-what', text: whatText(x.what) }));
          })));
      }
      // (round 13, speed) "Yours" right after this screen's own keys: your most-used keys, keys for what you do by mouse, your macros
      if (!words.length && typeof SpeedLearn !== 'undefined') { try { out.splice(nHere, 0, ...SpeedLearn.sheet(close, runLine)); } catch (err) { console.warn(err); } }
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
    // over a modal dialog (the captures, a capture's player, the annotator…) the rest of the page is inert: the sheet
    // goes inside that dialog and on the top layer, so it can be used and Esc closes the sheet, not the dialog under it
    const modal = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1);
    if (modal) {
      sheet.setAttribute('popover', 'manual');
      Object.assign(sheet.style, { top: 'auto', right: 'auto', margin: '0' });
      modal.append(sheet);
      try { sheet.showPopover(); } catch { /* drawn in the dialog anyway */ }
    } else document.body.append(sheet);
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

  return { customiseMenu, open, close, latch, isLatched: () => latched, showHints, hideHints, keyText, kbds, isOpen: () => Boolean(sheet), comboOf, runLine, hereAreas };
})();
