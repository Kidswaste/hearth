// (round 160, boot160) The keys sheet (the keys button bottom left, Ctrl/⌘+/, /shortcuts), out of keys-ui.js: the first
// frame keeps the Alt / Ctrl reveal, the button and the registry (keys-ui.js); the sheet itself is read the first time
// it opens (lazy group 'keyssheet'). KeysUI.open / close hand over to it.
const KeysSheet = (() => {
  const { kbds, keyText, whatText, latch, isLatched, showHints, hideHints, customiseMenu, button } = KeysUI._kit;
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
    const latchBtn = el('button', { type: 'button', class: `ks-latch${isLatched() ? ' on' : ''}`, text: isLatched() ? 'Tuck them away' : 'Show tucked buttons', title: 'Same as tapping Alt twice', on: { click: () => { latch(); close(); } } });
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
    button()?.classList.add('on');
    q.focus();
    setTimeout(() => addEventListener('pointerdown', away, true), 0);
    return sheet;
  }
  const away = (e) => { if (sheet && !sheet.contains(e.target) && !e.target.closest?.('#keys-btn')) close(); };
  function close() {
    removeEventListener('pointerdown', away, true);
    if (!sheet) return;
    const s = sheet; sheet = null;
    button()?.classList.remove('on');
    s.classList.add('out');
    setTimeout(() => s.remove(), 140);
  }
  return { open, close, isOpen: () => Boolean(sheet), comboOf, runLine, hereAreas };
})();
