// Round 7 (declutter): less on screen, more under the pointer. The owner asked for "less info directly in my face
// and more submenus, while keeping a high amount of customisability; right click can be used more".
//   - REVEAL: secondary controls leave the surface. 'alt' ones show in place while Alt (⌥) is held (keys-ui.js puts
//     .reveal-alt on <html>; a double-tap of Alt keeps them out), 'hover' ones show when you point at their area.
//     All of it is one generated stylesheet: no element is touched, nothing runs per frame.
//   - Customise this…: every right-click menu ends with it. Pin a tucked control back onto its surface (or tuck it
//     away again), hide a button you never use, or show everything (/calm off).
//   - Right-click menus on what you point at: chat messages, code, links, the chat header and composer, the rail,
//     the chats panel, the Lab toolbar / sliders / layers / console / timeline, the director dock, toasts, notes,
//     memory rows, tool headers. Each ends with the same Customise this… entry.
// Everything here is also a chat command: /calm, /reveal, /customise, /pin-control, /unpin-control, /rightclick.
const Declutter = (() => {
  // ---------- what leaves the surface ----------
  // { id, area, label, sel, mode: 'alt' | 'hover', host (hover: the area you point at), keep (states that stay) }
  const LAB = 'Lab';
  const REVEAL = [
    // rail (both stay in the rail's ⋯ and Ctrl+K / right-click on the rail)
    { id: 'rail-add', area: 'Rail', label: '＋ Add an agent or website', sel: '#rail #add-btn' },
    { id: 'rail-palette', area: 'Rail', label: '⌘ Command palette (Ctrl+K)', sel: '#rail #palette-btn' },
    // chats panel
    { id: 'panel-filter', area: 'Chats panel', label: '⏷ Filter chats', sel: '#panel .panel-filter-btn', mode: 'hover', host: '#panel .panel-head', keep: '.on' },
    { id: 'panel-add', area: 'Chats panel', label: '＋ New chat in each group', sel: '#panel .group-add', mode: 'hover', host: '#panel .group-head' },
    { id: 'panel-kind', area: 'Chats panel', label: 'NATIVE / DOCKED labels', sel: '#panel .group-kind', mode: 'hover', host: '#panel .group-head' },
    { id: 'panel-tags', area: 'Chats panel', label: '#tags on chat rows', sel: '#panel .item .item-tags', mode: 'hover', host: '#panel .item' },
    { id: 'panel-tokens', area: 'Chats panel', label: 'Token counts on chat rows', sel: '#panel .item .item-tok', mode: 'hover', host: '#panel .item' },
    // a chat
    { id: 'chat-meta', area: 'Chat', label: 'Tokens-this-chat note in the header', sel: '.native-head .chat-meta', mode: 'hover', host: '.native-head' },
    { id: 'chat-ctx', area: 'Chat', label: 'Context size in the header', sel: '.native-head .ctx-meter', mode: 'hover', host: '.native-head', keep: '.warn, .high' },
    { id: 'chat-attach', area: 'Chat', label: '📎 Attach', sel: 'form.composer .attach-btn', mode: 'hover', host: 'form.composer' },
    { id: 'chat-collab', area: 'Chat', label: '⚇ Work with Astra', sel: 'form.composer .collab-chip', mode: 'hover', host: 'form.composer', keep: '.on' },
    { id: 'msg-actions', area: 'Chat', label: 'Copy / ⋯ under older messages', sel: '.messages .msg:not(:last-child) > .msg-foot :is(.copy-msg, .msg-more)', mode: 'hover', host: '.messages .msg' },
    { id: 'msg-meta', area: 'Chat', label: 'Time and number under messages', sel: '.messages .msg:not(:last-child) > .msg-foot :is(.msg-time, .msg-num)', mode: 'hover', host: '.messages .msg' },
    { id: 'msg-tokens', area: 'Chat', label: 'Token badges under older replies', sel: '.messages .msg:not(:last-child) > .msg-foot :is(.tok-badge, .mt-badge)', mode: 'hover', host: '.messages .msg' },
    // the docked director chat
    { id: 'dock-new', area: 'Director dock', label: '＋ New chat (Ctrl+N)', sel: '.tool-dock.dock-chat .native-head > button:last-of-type' },
    { id: 'dock-fold', area: 'Director dock', label: '⇥ Collapse the chat', sel: '.dd-strip .dd-fold' },
    { id: 'dock-chips', area: 'Director dock', label: 'Quick chips above the chat box', sel: '.tool-dock .dd-chips' },
    { id: 'dock-sum', area: 'Director dock', label: 'Tool-call summary text', sel: '.dd-strip .dd-sum', mode: 'hover', host: '.dd-strip' },
    // Lab toolbar
    { id: 'lab-palette', area: LAB, label: '🎨 Palettes', sel: '.three-toolbar .lab-palette, .tb-group .lab-palette' },
    { id: 'lab-refs', area: LAB, label: '🖼 References', sel: '[data-feature="References"]' },
    { id: 'lab-stage', area: LAB, label: '🖥 Stage window', sel: '.tb-group [data-feature="Stage window"]' },
    { id: 'lab-livecode', area: LAB, label: 'Live code checkbox', sel: '.three-toolbar > label.check' },
    { id: 'lab-stats', area: 'Lab preview', label: 'fps / draw-call line', sel: '.three-preview > .three-stats', mode: 'hover', host: '.three-preview', focus: false },
    { id: 'lab-size', area: 'Lab preview', label: 'Pixel size readout', sel: '.stage-pill .stage-size', mode: 'hover', host: '.stage-pill', focus: false },
    // Lab timeline
    { id: 'tl-sizes', area: 'Lab timeline', label: '▤ ▭ ▁ timeline sizes', sel: '.media-bar .mb-size:not(.on)' },
    { id: 'tl-note', area: 'Lab timeline', label: '📌 Note (N)', sel: '.media-bar .mb-g-capture' },
    { id: 'tl-empty', area: 'Lab timeline', label: '"No music loaded" line', sel: '.media-bar.mb-empty .mb-name', mode: 'hover', host: '.media-bar' },
    // Lab layers and sliders
    { id: 'ly-key', area: 'Lab layers', label: '◇ Keyframe buttons (until a layer is animated)', sel: '.layers .kf-btn.kf-none', mode: 'hover', host: '.layers .ly-field' },
    { id: 'ly-timebtns', area: 'Lab layers', label: 'Whole song / Loop only (layer timing)', sel: '.layers .ly-timebtns' },
    { id: 'ly-notime', area: 'Lab layers', label: '"Load a song to time layers" row', sel: '.layers .ly-time:has(> .hint)' },
    { id: 'tw-steps', area: 'Lab sliders', label: '‹ › Shuffle steps (Shift+R)', sel: '[data-feature="Shuffle back"], [data-feature="Shuffle forward"]' },
    { id: 'tw-shuffle-opts', area: 'Lab sliders', label: '▾ Shuffle options (right-click Shuffle)', sel: '[data-feature="Shuffle options"]' },
    { id: 'tw-save-opts', area: 'Lab sliders', label: '▾ Save options (right-click Save)', sel: '[data-feature="Save options"]' },
    { id: 'tw-tip', area: 'Lab sliders', label: 'Ask for named sliders', sel: '.tweaks .tw-tip' },
    { id: 'tw-asks', area: 'Lab sliders', label: 'Ask the director', sel: '.tweaks .tw-asks' },
    // Lab console
    { id: 'tc-mode', area: 'Lab console', label: 'When the console shows', sel: '.three-console-head .tc-mode' },
    { id: 'tc-errors', area: 'Lab console', label: 'Errors only', sel: '.three-console-head > label.check' },
    { id: 'tc-copy', area: 'Lab console', label: 'Copy / Clear', sel: '.three-console-head > button[title^="Copy everything"], .three-console-head > button[title="Empty the console"]' },
    // notes: the head keeps New, Preview, ⋯ and ×; the foot keeps Send to Claude (right-click the panel for the rest)
    { id: 'notes-pin', area: 'Notes', label: '📌 Pin the note', sel: '.notes-head .notes-pin' },
    { id: 'notes-foot', area: 'Notes', label: 'Copy / Save as file / Delete under a note', sel: '.notes-foot > button:is(:nth-of-type(1), :nth-of-type(3), :nth-of-type(4))' },
    // memory rows: the per-fact controls show on the row you point at
    { id: 'mem-row', area: 'Memory', label: 'Category, expiry and who-remembers per fact', sel: '.memory-row :is(.memory-cat, .memory-move, button[title^="Set an expiry"])', mode: 'hover', host: '.memory-row' },
  ].map((r) => ({ mode: 'alt', ...r }));
  const byId = new Map(REVEAL.map((r) => [r.id, r]));
  const areas = () => [...new Set(REVEAL.map((r) => r.area))];

  let pins = new Set(store.get('declutter.pins', []));
  let off = store.get('declutter.off', false);
  const styleEl = el('style', { id: 'declutter-style' });
  document.head.append(styleEl);

  // One stylesheet from the table: tucked 'alt' controls are display:none until Alt; 'hover' ones fade until their
  // area is pointed at (or has the keyboard focus). Pinned ones and everything with /calm off stay as they were.
  function paint() {
    const live = off ? [] : REVEAL.filter((r) => !pins.has(r.id));
    const alt = live.filter((r) => r.mode === 'alt');
    const hover = live.filter((r) => r.mode === 'hover');
    const notKeep = (r) => (r.keep ? `:not(${r.keep})` : '');
    const css = [];
    if (alt.length) {
      const sel = alt.map((r) => r.sel.split(/,\s*(?![^()]*\))/).map((s) => `${s}${notKeep(r)}`).join(', ')).join(', ');
      css.push(`:root:not(.reveal-alt) :is(${sel}) { display: none !important; }`);
      css.push(`:root.reveal-alt :is(${sel}) { animation: dc-reveal .2s cubic-bezier(.2, .9, .3, 1.25) both; outline: 1px dashed color-mix(in srgb, var(--fh-gold, #f5b642) 75%, transparent) !important; outline-offset: 1px; }`);
    }
    for (const r of hover) {
      const sel = r.sel.split(/,\s*(?![^()]*\))/).map((s) => `${s}${notKeep(r)}`).join(', ');
      // (focus: false when the area holds something that keeps the focus, like the Lab picture's iframe)
      css.push(`:root:not(.reveal-alt) :is(${r.host}):not(:hover)${r.focus === false ? '' : ':not(:focus-within)'} :is(${sel}) { opacity: 0; visibility: hidden; }`);
      css.push(`:is(${sel}) { transition: opacity .16s ease, visibility .16s; }`);
    }
    styleEl.textContent = css.join('\n');
    document.documentElement.classList.toggle('calm-off', off);
  }
  const savePins = () => { store.set('declutter.pins', [...pins]); paint(); };
  function pin(id, on = !pins.has(id)) {
    const r = byId.get(id) || find(id);
    if (!r) return null;
    if (on) pins.add(r.id); else pins.delete(r.id);
    savePins();
    return { rule: r, pinned: on };
  }
  function find(q) {
    const s = String(q || '').toLowerCase().trim();
    if (!s) return null;
    return byId.get(s) || REVEAL.find((r) => r.label.toLowerCase().includes(s)) || REVEAL.find((r) => r.area.toLowerCase() === s);
  }
  function setOff(v) { off = Boolean(v); store.set('declutter.off', off); paint(); return !off; }

  // ---------- Customise this… ----------
  // The last entry of every right-click menu: pin / tuck the controls of this area, hide the button under the
  // pointer, bring hidden buttons back, or show everything for now.
  function customiseItems(area, target = null, { exact = false } = {}) {
    const rules = REVEAL.filter((r) => r.area === area || (!exact && area === LAB && r.area.startsWith('Lab')));
    const btn = target?.closest?.('button, select');
    // (Usage hides a button by its name in the bars it watches: toolbars, the timeline, chat headers, message feet)
    const key = btn?.closest('.three-toolbar, .media-bar .mb-main, .native-head, .msg-foot, .tw-head, .tool-head') && Usage.keyOf?.(btn);
    const hidden = Usage.data?.hidden || [];
    const items = [
      ...rules.map((r) => ({ label: r.label, checked: pins.has(r.id), hint: pins.has(r.id) ? 'on screen' : r.mode === 'alt' ? 'Alt' : 'on hover', action: () => { const p = pin(r.id); toast(p.pinned ? `“${r.label}” stays on screen` : `“${r.label}” is tucked away (${r.mode === 'alt' ? 'hold Alt' : 'point at it'})`, { timeout: 1800, action: { label: 'Undo', fn: () => pin(r.id) } }); } })),
      rules.length ? '-' : null,
      key && !btn.closest('#menu') ? { label: `Hide “${(btn.dataset.feature || btn.textContent || btn.title).trim().slice(0, 24)}” everywhere`, action: () => { Usage.setHidden(key, true); toast('Hidden. Customise this… → Bring back hidden buttons shows it again.', { timeout: 3000, action: { label: 'Undo', fn: () => Usage.setHidden(key, false) } }); } } : null,
      hidden.length ? { label: 'Bring back hidden buttons', hint: String(hidden.length), items: () => hidden.map((k) => ({ label: k.split(' › ').pop(), hint: k.split(' › ')[0], action: () => Usage.setHidden(k, false) })) } : null,
      { label: 'Show the tucked buttons for now', key: 'Alt Alt', action: () => KeysUI.latch(true) },
      { label: off ? 'Tidy again (tuck them away)' : 'Show everything, always', hint: '/calm', action: () => { setOff(!off); toast(off ? 'Everything shows (/calm on tucks it away again)' : 'Tidy again', { timeout: 1800 }); } },
      { label: 'Keys and hidden buttons…', key: 'Ctrl+/', action: () => KeysUI.open() },
    ].filter(Boolean);
    return ['-', { label: 'Customise this…', items }];
  }

  // ---------- right-click menus ----------
  // ctx(selector, area, build): build(node, event) returns menu items (or true when it showed its own menu). The
  // deepest match under the pointer wins; elements with their own right-click menu (they call preventDefault) and
  // text fields keep theirs.
  const CTX = [];
  function ctx(sel, area, build) { CTX.push({ sel, area, build }); }
  const editable = (t) => t.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .code-editor, webview, iframe');
  function onContext(e) {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (!t?.closest || editable(t) && !t.closest('[data-ctx-ok]')) return;
    const selText = String(getSelection?.() || '').trim();
    if (selText && getSelection().containsNode?.(t, true)) return; // a text selection: the copy / ask menu
    for (let node = t; node && node !== document.documentElement; node = node.parentElement) {
      const hit = CTX.find((c) => node.matches(c.sel));
      if (!hit) continue;
      let items;
      try { items = hit.build(node, e); } catch (err) { console.warn(err); continue; }
      if (!items) continue;
      e.preventDefault();
      if (items === true) return;
      showMenu(e.clientX, e.clientY, [...items, ...customiseItems(hit.area, t)]);
      return;
    }
  }
  document.addEventListener('contextmenu', onContext);

  // helpers
  const agentOf = (node) => H.agents().find((a) => Native.view(a.id)?.root.contains(node))?.id || null;
  const at = (e) => ({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY - 4 }) });
  const clickIn = (root, sel) => () => root.querySelector(sel)?.click();
  const lab = (name) => () => ThreeLab.act(name);
  const labCtl = () => ThreeLab.peek?.() || null;
  const cmd = (line, agentId) => () => Commands.exec(line, agentId || H.claudeAgent()?.id);
  const surfaceTool = (node) => node.closest('.tool-surface, .surface')?.dataset?.id || H.activeId;
  // a key pressed inside a part of the screen (the Lab's keys listen on its pane)
  const press = (sel, key, opts = {}) => { const n = [...document.querySelectorAll(sel)].find((x) => x.checkVisibility?.({ visibilityProperty: true })); n?.dispatchEvent(new KeyboardEvent('keydown', { key, code: opts.code || (key.length === 1 ? `Key${key.toUpperCase()}` : key), bubbles: true, cancelable: true, ...opts })); };

  // a message: its ⋯ menu (Copy, Read aloud, Reply ›, Mark ›, Copy & save ›) at the pointer
  ctx('.messages .msg[data-index]', 'Chat', (node, e) => {
    const agentId = agentOf(node);
    if (!agentId || node.closest('a, img, pre, .code-acts')) return null;
    Native.messageMenu(agentId, Number(node.dataset.index), at(e));
    return true;
  });
  // a code block in a message
  ctx('.msg .body pre', 'Chat', (pre) => {
    const code = pre.querySelector('code')?.textContent || '';
    const acts = [...pre.querySelectorAll('.code-acts .code-act')].filter((b) => b.dataset.act !== 'more');
    const agentId = agentOf(pre);
    return [
      { label: 'Copy the code', action: () => copyText(code, 'Code copied') },
      ...acts.map((b) => ({ label: b.textContent === 'Save' ? 'Save as a file…' : b.textContent, action: () => b.click() })),
      agentId ? { label: 'Insert in my message', action: () => Native.insertDraft(agentId, `\`\`\`${pre.dataset.lang || ''}\n${code}\n\`\`\``) } : null,
      pre.classList.contains('code-folded') ? { label: 'Show every line', action: clickIn(pre, '.code-unfold') } : null,
      { label: 'More…', items: () => [{ label: 'Copy as a quote', action: () => copyText(code.split('\n').map((l) => `> ${l}`).join('\n'), 'Copied as a quote') }, { label: 'The code’s own ⋯ menu', action: clickIn(pre, '.code-act[data-act="more"]') }] },
    ].filter(Boolean);
  });
  // links and pictures in messages
  ctx('.msg .body a[href]', 'Chat', (a) => [
    { label: 'Open the link', action: () => a.click() },
    { label: 'Copy the link', action: () => copyText(a.href, 'Link copied') },
    { label: 'Copy its text', action: () => copyText(a.textContent, 'Copied') },
  ]);
  ctx('.msg img', 'Chat', (img) => [
    { label: 'Open the picture', action: () => img.click() },
    { label: 'Copy the picture', action: async () => { try { const b = await (await fetch(img.src)).blob(); await navigator.clipboard.write([new ClipboardItem({ [b.type || 'image/png']: b })]); toast('Picture copied', { timeout: 1200 }); } catch (err) { toast(`Couldn't copy: ${err.message}`, { type: 'error' }); } } },
    { label: 'Copy its address', action: () => copyText(img.src.startsWith('data:') ? img.alt || 'picture' : img.src, 'Copied') },
  ]);
  // the chat header and the empty space of a chat: the chat's ⋯ menu
  ctx('.native-head, .messages', 'Chat', (node, e) => {
    const agentId = agentOf(node);
    if (!agentId || e.target.closest('button:not(.ctx-meter)')) return null;
    Native.chatMenu(agentId, { clientX: e.clientX, clientY: e.clientY + 4 });
    return true;
  });
  // the composer around the text box (the text box itself keeps cut / copy / paste)
  ctx('form.composer', 'Chat', (form) => {
    const agentId = agentOf(form);
    if (!agentId) return null;
    const v = Native.view(agentId);
    const busy = Boolean(Native.pendingFor?.(agentId));
    return [
      { label: '📎 Attach files…', action: () => Native.pickFiles(agentId) },
      { label: 'Paste', action: async () => { try { const t = await navigator.clipboard.readText(); if (t) Native.insertDraft(agentId, t); } catch { v.input.focus(); toast('Press Ctrl+V in the chat box', { timeout: 1600 }); } } },
      { label: 'Commands', hint: 'type /', items: () => [
        ...Commands.recent().slice(0, 6).map((n) => ({ label: `/${n}`, action: () => { v.input.value = `/${n} `; v.input.focus(); v.input.dispatchEvent(new Event('input')); } })),
        { label: 'All commands…', key: '/help', action: cmd('/help', agentId) },
      ] },
      typeof Prompts !== 'undefined' ? { label: 'Prompt library…', action: () => Prompts.manage() } : null,
      form.querySelector('.collab-chip') ? { label: '⚇ Work with Astra…', action: () => setTimeout(() => form.querySelector('.collab-chip')?.click(), 0) } : null,
      busy ? { label: '■ Stop the reply', key: 'Esc', action: () => Native.stop(agentId) } : null,
      v?.input.value ? { label: 'Clear the message', action: () => { v.input.value = ''; v.input.dispatchEvent(new Event('input')); } } : null,
    ].filter(Boolean);
  });

  // an attachment waiting in the chat box
  ctx('.composer .attach-chip', 'Chat', (chip) => {
    const agentId = agentOf(chip);
    return [
      { label: 'Remove it', action: () => chip.querySelector('button')?.click() },
      { label: 'Remove every attachment', action: () => { const v = Native.view(agentId); if (v) { v.attachments.length = 0; v.chips.replaceChildren(); } } },
      { label: '📎 Attach more…', action: () => Native.pickFiles(agentId) },
    ];
  });
  // a row of the director's tool-call list (click the icons in the dock's strip)
  ctx('.dd-list .dd-row', 'Director dock', (row) => [
    { label: 'Copy this line', action: () => copyText(row.textContent.trim(), 'Copied') },
    { label: 'Copy what it said', action: () => copyText(row.querySelector('.dd-row-sum')?.textContent || '', 'Copied') },
    { label: 'Clear the list', action: () => HubBridge.clearLog() },
  ]);

  // the rail's empty space and its own buttons (agents and tools have their own menus)
  const railItems = () => [
    { label: '＋ Add an agent or website…', action: () => Manager.open() },
    { label: '⌘ Command palette', key: 'Ctrl+K', action: () => AppUI.palette() },
    { label: 'Command bar', key: 'Ctrl+;', action: () => (typeof CmdBar !== 'undefined' ? CmdBar.toggle?.() : AppUI.palette()) },
    { label: 'Panels', items: [
      { label: '☰ Chats panel', key: 'Ctrl+\\', checked: H.panelOpen, action: () => handleShortcut({ key: '\\' }) },
      { label: '🗒 Notes', key: 'Ctrl+J', action: () => Notes.toggle() },
      { label: '🧠 Memory', action: () => MemoryEditor.open() },
      { label: '▦ All side by side', key: 'Ctrl+G', checked: H.grid, action: () => handleShortcut({ key: 'g' }) },
      { label: '⌨ Ask-all bar', key: 'Ctrl+B', checked: !document.getElementById('broadcast')?.classList.contains('hidden'), action: () => handleShortcut({ key: 'b' }) },
    ] },
    { label: 'Your usage…', action: () => Usage.dialog() },
    { label: '⇪ Import past chats…', action: () => document.getElementById('import-btn')?.click() },
    { label: '⚙ Settings', key: 'Ctrl+,', action: () => AppUI.openSettings() },
  ];
  ctx('#rail', 'Rail', (node, e) => (e.target.closest('.agent-btn, .meter-pill') ? null : railItems()));

  // the chats panel: a group's head → the agent's menu; empty space → search, sort, import
  ctx('#panel .group-head', 'Chats panel', (head, e) => {
    const id = head.closest('.group')?.dataset.id;
    if (!id) return null;
    const a = H.agent(id);
    return [
      a?.mode === 'native' ? { label: '＋ New chat', action: () => { activate(id); Native.newChat(id); } } : null,
      { label: 'Collapse / expand', action: clickIn(head, '.group-toggle') },
      { label: a?.name || 'Agent', items: () => [
        { label: 'Open', action: () => activate(id) },
        { label: 'Edit…', action: () => Manager.open(id) },
        { label: 'Move up in the rail', action: () => moveAgent(id, -1) },
        { label: 'Move down in the rail', action: () => moveAgent(id, 1) },
      ] },
    ].filter(Boolean);
  });
  ctx('#panel', 'Chats panel', () => [
    { label: 'Search chats', key: 'Ctrl+F', action: () => document.getElementById('chat-search')?.focus() },
    { label: 'Filter…', hint: 'pinned, today, unread, a tag', action: () => setTimeout(() => document.querySelector('.panel-filter-btn')?.click(), 0) },
    { label: 'Sort', items: () => ['recent', 'oldest', 'title'].map((k) => ({ label: { recent: 'Newest first', oldest: 'Oldest first', title: 'By title' }[k], checked: store.get('panel.sort', 'recent') === k, action: () => { store.set('panel.sort', k); Panel.render(); } })) },
    { label: '⇪ Import past chats…', action: () => document.getElementById('import-btn')?.click() },
    { label: 'Hide the panel', key: 'Ctrl+\\', action: () => handleShortcut({ key: '\\' }) },
  ]);

  // ---------- the Lab ----------
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
  ctx('.three-console-wrap', 'Lab console', (wrap) => [
    { label: 'Ask the director to fix it', action: clickIn(wrap, '.tc-fix') },
    { label: 'Copy everything', action: clickIn(wrap, 'button[title^="Copy everything"]') },
    { label: 'Clear', action: clickIn(wrap, 'button[title="Empty the console"]') },
    { label: 'Errors only', checked: Boolean(wrap.querySelector('.three-console-head > label.check input')?.checked), action: clickIn(wrap, '.three-console-head > label.check input') },
    { label: 'Shows', items: () => [['always', 'Always'], ['code', 'Only with the code'], ['never', 'Only when I open it']].map(([v, l]) => ({ label: l, checked: wrap.querySelector('.tc-mode')?.value === v, action: () => { const s = wrap.querySelector('.tc-mode'); s.value = v; s.dispatchEvent(new Event('change')); } })) },
    { label: 'Hide the console', key: '`', action: clickIn(wrap, '.three-console-head > button:last-of-type') },
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
  // the director dock: its ✦ menu wherever you right-click (the chat inside keeps the chat menus)
  ctx('.dd-strip, .dd-chips, .dd-rail, .tool-dock', 'Director dock', (node, e) => {
    if (e.target.closest('.messages, form.composer, .native-head')) return null;
    const toolId = String(surfaceTool(node) || '').replace(/^tool:/, '');
    const items = DirectorDock.menu?.(toolId);
    return items?.length ? items : null;
  });
  // a tool's header (the tab bar)
  ctx('.tool-head', 'Tool header', (head) => {
    const id = String(surfaceTool(head) || '').replace(/^tool:/, '');
    const docked = Tools.dockedAgent?.(id);
    return [
      docked ? { label: `${docked.name} chat`, action: () => Tools.openDock(id) } : null,
      { label: 'Snapshot the window into the chat', key: 'Ctrl+Shift+S', action: () => AppUI.snapshotToChat() },
      { label: 'Move in the rail', items: [{ label: 'Up', action: () => Tools.move(id, -1) }, { label: 'Down', action: () => Tools.move(id, 1) }] },
      { label: 'Hide from the rail', action: () => Tools.setHidden(id, true) },
    ].filter(Boolean);
  });

  // ---------- everywhere else ----------
  ctx('#toasts .toast', 'Toasts', (t) => [
    { label: 'Copy the text', action: () => copyText(t.querySelector('span')?.textContent || t.textContent, 'Copied') },
    { label: 'Dismiss', action: () => t.remove() },
    { label: 'Dismiss all', key: 'Shift+Esc', action: () => document.querySelectorAll('#toasts .toast').forEach((x) => x.remove()) },
  ]);
  ctx('.notes-panel', 'Notes', (panel) => [
    { label: 'Send to Claude', action: clickIn(panel, '.notes-foot > button:nth-of-type(2)') },
    { label: 'Copy the note', action: clickIn(panel, '.notes-foot > button:nth-of-type(1)') },
    { label: '📌 Pin to the front', action: clickIn(panel, '.notes-pin') },
    { label: 'Save as a file…', action: clickIn(panel, '.notes-foot > button:nth-of-type(3)') },
    '-',
    { label: '＋ New note', action: () => Notes.create() },
    { label: 'Today’s note', action: () => Notes.daily() },
    { label: 'Export all…', action: () => Notes.exportAll() },
    { label: 'Close', key: 'Ctrl+J', action: () => Notes.close() },
    { label: 'Delete this note', danger: true, action: clickIn(panel, '.notes-foot > button.danger') },
  ]);
  ctx('.memory-row', 'Memory', (row) => {
    const text = row.querySelector('.memory-text')?.value || '';
    const pinBtn = row.querySelector('button');
    const exp = row.querySelector('button[title^="Set an expiry"], button[title^="Expires"]');
    return [
      { label: pinBtn?.title === 'Unpin' ? 'Unpin' : '📌 Pin (first, never expires)', action: () => pinBtn?.click() },
      { label: 'Edit', action: () => row.querySelector('.memory-text')?.focus() },
      { label: 'Copy the fact', action: () => copyText(text, 'Copied') },
      exp ? { label: 'Expires…', action: () => { const r = exp.getBoundingClientRect(); exp.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left, clientY: r.bottom })); } } : null,
      { label: 'Forget', danger: true, action: () => row.querySelector('button.danger')?.click() },
    ].filter(Boolean);
  });

  // ---------- chat commands ----------
  function registerCommands() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register({ area: 'App', ...def }); };
    reg({ name: 'calm', args: '[on|off]', desc: 'Tuck secondary buttons away (on, the default) or show everything (off)', keywords: 'declutter tidy clutter simple show all buttons', examples: ['/calm off', '/calm on'],
      complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (a) => { const v = String(a || '').trim().toLowerCase(); if (v === 'off' || v === 'on') setOff(v === 'off'); else if (v) return 'Use /calm on or /calm off'; else setOff(!off); return off ? 'Everything shows. /calm on tucks the secondary buttons away again (Alt shows them).' : `Tidy: ${REVEAL.length - pins.size} controls wait behind Alt or show when you point at them. /customise lists them.`; } });
    reg({ name: 'reveal', args: '[on|off]', desc: 'Show the buttons that wait behind Alt (like holding Alt) until Esc or /reveal off', keywords: 'alt hidden buttons show',
      complete: () => [{ value: 'on' }, { value: 'off' }],
      run: (a) => { const on = String(a || '').trim().toLowerCase() !== 'off'; KeysUI.latch(on); return on ? 'The tucked buttons show (dashed outline). Esc or /reveal off tucks them away.' : 'Tucked away again.'; } });
    reg({ name: 'customise', aliases: ['customize'], args: '[area]', desc: 'What waits behind Alt or hover, and what you pinned back on screen',
      complete: () => areas().map((x) => ({ value: x })),
      run: (a) => { const q = String(a || '').trim().toLowerCase(); const list = REVEAL.filter((r) => !q || r.area.toLowerCase().includes(q)); return `${list.map((r) => `- **${r.area}** · ${r.label} · ${pins.has(r.id) ? 'pinned on screen' : r.mode === 'alt' ? 'hold Alt' : 'on hover'} (\`${r.id}\`)`).join('\n')}\n\n/pin-control <name> keeps one on screen, /unpin-control <name> tucks it away. Right-click any area → Customise this… does the same.${off ? '\n(/calm is off: everything shows now.)' : ''}`; } });
    reg({ name: 'pin-control', args: '<name>', desc: 'Keep a tucked control on screen (see /customise)',
      complete: () => REVEAL.map((r) => ({ value: r.id, label: r.label, hint: r.area })),
      run: (a) => { const r = pin(a, true); return r ? `“${r.rule.label}” stays on screen.` : 'No such control: /customise lists them.'; } });
    reg({ name: 'unpin-control', args: '<name>', desc: 'Tuck a control away again (Alt or hover shows it)',
      complete: () => [...pins].map((id) => ({ value: id, label: byId.get(id)?.label })),
      run: (a) => { const r = pin(a, false); return r ? `“${r.rule.label}” is tucked away again.` : 'No such control: /customise lists them.'; } });
    reg({ name: 'rightclick', aliases: ['context-menu'], args: '[lab|chat|rail|dock|timeline|sliders|console]', desc: 'Open the right-click menu of a part of the screen (the same as right-clicking it)',
      complete: () => ['chat', 'rail', 'lab', 'preview', 'sliders', 'layers', 'console', 'timeline', 'dock', 'panel'].map((v) => ({ value: v })),
      run: (a) => {
        const where = { chat: '.surface.active .native-head', rail: '#rail .spacer', lab: '.surface.active .three-toolbar', sliders: '.surface.active .tweaks', layers: '.surface.active .layers', console: '.surface.active .three-console-wrap', timeline: '.surface.active .media-bar', dock: '.surface.active .dd-strip', panel: '#panel .panel-head', preview: '.surface.active .stage-pill' }[String(a || 'chat').trim().toLowerCase()] || null;
        const node = where && [...document.querySelectorAll(where)].find((n) => n.checkVisibility?.({ visibilityProperty: true }));
        if (!node) return 'That part is not on screen.';
        const r = node.getBoundingClientRect();
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(40, r.width / 2), clientY: r.top + Math.min(12, r.height / 2) }));
        return null;
      } });
  }

  // the rail's ⋯ also lists the two buttons that left the rail (simplify.js builds that menu from its TUCKED list)
  if (typeof Simplify !== 'undefined' && Array.isArray(Simplify.TUCKED)) Simplify.TUCKED.unshift(['palette-btn', '⌘ Command palette  Ctrl+K'], ['add-btn', '＋ Add an agent or website']);

  // the keys sheet lists what each area tucks away (hold Alt / point at it)
  const WHERE = { Rail: 'the rail', 'Chats panel': 'the chats list', Chat: 'a chat', 'Director dock': 'the dock', Lab: 'the Lab', 'Lab preview': 'the picture', 'Lab timeline': 'the timeline', 'Lab layers': 'a layer', 'Lab sliders': 'the sliders', 'Lab console': 'the console', Notes: 'Notes', Memory: 'a memory fact' };
  for (const area of areas()) {
    const alt = REVEAL.filter((r) => r.area === area && r.mode === 'alt');
    const hov = REVEAL.filter((r) => r.area === area && r.mode === 'hover');
    if (alt.length) Keys.add({ area: 'Hidden buttons', keys: `Hold Alt in ${WHERE[area] || area}`, what: alt.map((r) => r.label).join(' · '), run: () => KeysUI.latch(true), sel: alt.map((r) => r.sel).join(', ') });
    if (hov.length) Keys.add({ area: 'Hidden buttons', keys: `Point at ${WHERE[area] || area}`, what: `${hov.map((r) => r.label).join(' · ')} show`, sel: hov.map((r) => r.host).join(', ') });
  }

  // the same from the palette (Ctrl+K)
  queueMicrotask(() => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Show the tucked buttons (like holding Alt)', () => KeysUI.latch(true));
    AppUI.addAction('Show every button, always (/calm off) / tidy again', () => { setOff(!off); toast(off ? 'Everything shows' : 'Tidy again', { timeout: 1400 }); });
    AppUI.addAction('Customise: what is tucked away, what is pinned', () => Commands.exec('/customise', H.claudeAgent()?.id));
    AppUI.addAction('Right-click menu of this view', () => Commands.exec(`/rightclick ${H.isTool(H.activeId) && H.activeId === 'tool:three' ? 'lab' : 'chat'}`, H.claudeAgent()?.id));
  });

  paint();
  addEventListener('DOMContentLoaded', registerCommands);
  if (document.readyState !== 'loading') queueMicrotask(registerCommands);

  return {
    REVEAL, ctx, customiseItems, pin, pinned: (id) => pins.has(id), find, paint, setOff, isOff: () => off, areas,
    tucked: (area) => REVEAL.filter((r) => (!area || r.area === area) && !pins.has(r.id)),
    railItems, labToolbar,
  };
})();
