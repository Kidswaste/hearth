// (round 160, boot160) The right-click menus of the chats, the rail, the panels and the dialogs (Declutter.ctx), out of
// declutter.js: the first frame keeps the tidy stylesheet, Customise this… and the right-click listener (declutter.js);
// these menus are read right after the first frame (lazy group 'ctxmenus', asap) and take the place they had in the
// list (Declutter's own, before anything another file adds); a right-click before they are in waits for them.
const DeclutterMenus = (() => {
  const ctx = (sel, area, build) => Declutter._ctxHere(sel, area, build);
  const agentOf = (node) => H.agents().find((a) => Native.view(a.id)?.root.contains(node))?.id || null;
  const at = (e) => ({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY - 4 }) });
  const clickIn = (root, sel) => () => root.querySelector(sel)?.click();
  const cmd = (line, agentId) => () => Commands.exec(line, agentId || H.claudeAgent()?.id);
  const surfaceTool = (node) => node.closest('.tool-surface, .surface')?.dataset?.id || H.activeId;

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
  // a thinking block: open / close them all, copy it
  ctx('.msg details.thinking', 'Chat', (d) => {
    const agentId = agentOf(d);
    return [
      { label: d.open ? 'Close it' : 'Open it', action: () => { d.open = !d.open; } },
      { label: 'Open / close every thinking block', key: 'Alt+T', action: () => Native.toggleThinking(agentId) },
      { label: 'Copy the thinking', action: () => copyText([...d.childNodes].filter((n) => n.nodeName !== 'SUMMARY').map((n) => n.textContent).join('').trim(), 'Thinking copied') },
    ];
  });
  // the ↓ button over a chat
  ctx('.jump-bottom', 'Chat', (b) => {
    const list = b.closest('.messages-wrap')?.querySelector('.messages') || b.parentElement?.querySelector('.messages');
    return [
      { label: 'Latest message', key: 'Alt+End', action: () => b.click() },
      { label: 'First message', key: 'Alt+Home', action: () => { if (list) list.scrollTop = 0; } },
      { label: 'My messages, one by one', key: 'Ctrl+↑', action: () => toast('Ctrl+↑ / Ctrl+↓ in the chat box jumps between your own messages', { timeout: 2600 }) },
    ];
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
      // (round 40, chatcalm) one Attach row: the ＋ menu (Files… is its first row); files straight away without it
      typeof ChatAttach !== 'undefined' ? { label: '＋ Attach…', hint: 'files, board, captures, Lab, screen', action: () => ChatAttach.menu(agentId, form.querySelector('.attach-btn') || form) } : { label: 'Attach files…', action: () => Native.pickFiles(agentId) },
      { label: 'Paste', action: async () => { try { const t = await navigator.clipboard.readText(); if (t) Native.insertDraft(agentId, t); } catch { v.input.focus(); toast('Press Ctrl+V in the chat box', { timeout: 1600 }); } } },
      // (round 33, simplify3) typed actions are the power users' way: one level deeper, in plain words
      { label: 'Typed actions', more: true, items: () => [
        ...Commands.recent().slice(0, 6).map((n) => ({ label: `/${n}`, action: () => { v.input.value = `/${n} `; v.input.focus(); v.input.dispatchEvent(new Event('input')); } })),
        { label: 'Everything it can do…', action: cmd('/help', agentId) },
      ] },
      typeof Prompts !== 'undefined' ? { label: 'Prompt library…', action: () => Prompts.manage() } : null,
      // (round 51, commandonly) things only a typed command reached: snippets, a reminder, a code file as nodes
      ...(typeof ChatCmds !== 'undefined' && ChatCmds.boxRows ? ChatCmds.boxRows(agentId, v) : []), // (chat-cmds.js: loads right after the first screen)
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
  // (round 43, menucalm) Ctrl/⌘+K is Find anything now (round 37), the command bar is "Typed actions" (as in the chat
  // box's right-click); Your usage and Import wait in More…
  const railItems = () => [
    { label: '＋ Add an agent or website…', action: () => Manager.open() },
    { label: '⌕ Find anything…', key: 'Ctrl+K', tip: 'Find any setting, menu row, chat or answer in plain words', action: () => AppUI.palette() },
    { label: 'Typed actions…', key: 'Ctrl+;', tip: 'A bar to type an action by its name', action: () => (window.Lazy?.isIn && !Lazy.isIn('cmdbar') ? Lazy.load('cmdbar').then(() => CmdBar.toggle()).catch(() => AppUI.palette()) : typeof CmdBar !== 'undefined' ? CmdBar.toggle?.() : AppUI.palette()) },
    { label: 'Panels', items: [
      { label: '☰ Chats panel', key: 'Ctrl+\\', checked: H.panelOpen, action: () => handleShortcut({ key: '\\' }) },
      { label: '🗒 Notes', key: 'Ctrl+J', action: () => Lazy.load('notes').then(() => Notes.toggle()) }, // (round 118, startup118: both load after the start)
      { label: '🧠 Memory', action: () => Lazy.load('memory').then(() => MemoryEditor.open()) },
      { label: '▦ All side by side', key: 'Ctrl+G', checked: H.grid, action: () => handleShortcut({ key: 'g' }) },
      { label: '⌨ Ask-all bar', key: 'Ctrl+B', checked: !document.getElementById('broadcast')?.classList.contains('hidden'), action: () => handleShortcut({ key: 'b' }) },
    ] },
    { label: '⚙ Settings', key: 'Ctrl+,', action: () => AppUI.openSettings() },
    { label: 'Your usage…', tip: 'What you use, and what you never touch', more: true, action: () => Usage.dialog() },
    { label: '⇪ Import past chats…', tip: 'Your claude.ai or ChatGPT export', more: true, action: () => document.getElementById('import-btn')?.click() },
  ];
  ctx('#rail', 'Rail', (node, e) => (e.target.closest('.agent-btn, .meter-pill') ? null : railItems()));

  // the chats panel: a group's head → the agent's menu; empty space → search, sort, import
  ctx('#panel .group-head', 'Chats panel', (head, e) => {
    const id = head.closest('.group')?.dataset.id;
    if (!id) return null;
    const a = H.agent(id);
    return [
      a?.mode === 'native' ? { label: '＋ New chat', action: () => { activate(id); Native.newChat(id, { byOwner: true }); } } : null,
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

  // (round 96, firstscreen96) the Lab's menus (toolbar, sliders, layers, console, effects picker, timeline) load with
  // the Lab: declutter-lab.js, the last file of the lazy group 'lab'

  // the director dock: its ✦ menu wherever you right-click (the chat inside keeps the chat menus)
  ctx('.dd-strip, .dd-chips, .dd-rail, .tool-dock', 'Director dock', (node, e) => {
    if (e.target.closest('.messages, form.composer, .native-head')) return null;
    const toolId = String(surfaceTool(node) || '').replace(/^tool:/, '');
    const items = window.Lazy?.isIn?.('directordock') === false ? null : DirectorDock.menu?.(toolId); // (round 96: a lazy group, in before any dock shows)
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
  ctx('dialog.memory-facts', 'Memory', (dlg) => {
    const by = (t) => () => [...dlg.querySelectorAll('.dialog-actions button')].find((b) => b.textContent.startsWith(t))?.click();
    return [
      { label: 'Add a fact', action: () => dlg.querySelector('.memory-add input')?.focus() },
      { label: 'Search memory', action: () => dlg.querySelector('input[type=search]')?.focus() },
      { label: 'Edit as text…', action: by('Edit as text') },
      { label: 'Import…', action: by('Import') },
      { label: 'Export…', action: by('Export') },
      { label: 'Close', action: () => dlg.close() },
    ];
  });
  // Settings: jump to a section (the rarer ones sit folded in Advanced)
  ctx('dialog.settings-dialog', 'Settings', (dlg) => {
    const more = dlg.querySelector('details.settings-more');
    const go = (sec) => () => { for (let d = sec.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true; sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); sec.classList.add('ks-flash'); setTimeout(() => sec.classList.remove('ks-flash'), 1600); };
    const secs = [...dlg.querySelectorAll('.settings-section')];
    return [
      { label: 'Appearance…', key: 'Ctrl+Shift+L', action: () => Look.openDialog() },
      { label: 'Go to', items: () => secs.map((sec) => ({ label: sec.querySelector('h3')?.textContent || 'Section', hint: more?.contains(sec) ? 'advanced' : sec.closest('details.sc-fold') ? 'folded' : '', action: go(sec) })) },
      { label: more?.open ? 'Fold Advanced' : 'Open Advanced', action: () => { if (more) more.open = !more.open; } },
      { label: 'Back up now…', action: () => AppUI.exportData() },
      { label: 'Your usage…', action: () => Usage.dialog() },
      { label: 'Keys and hidden buttons…', key: 'Ctrl+/', action: () => KeysUI.open() },
    ];
  });
  // the token dashboard: its ranges and tabs, copy and export
  ctx('dialog.meter-dlg', 'Meter', (dlg) => [
    { label: 'Range', items: () => [...dlg.querySelectorAll('.mt-seg > button')].map((b) => ({ label: b.textContent, checked: b.classList.contains('on'), action: () => b.click() })) },
    { label: 'Show', items: () => [...dlg.querySelectorAll('.mt-tabs > button')].map((b) => ({ label: b.textContent, checked: b.classList.contains('on'), action: () => b.click() })) },
    { label: 'Copy a summary (Markdown)', action: () => dlg.querySelector('[data-feature="Copy summary"]')?.click() },
    { label: 'Export', items: [{ label: 'CSV…', action: () => Meter.exportUsage('csv') }, { label: 'JSON…', action: () => Meter.exportUsage('json') }] },
    { label: 'Close', key: 'Esc', action: () => dlg.close() },
  ]);
  // the command bar (around its text box): your history, your pinned commands, every command
  ctx('.cmdbar', 'Command bar', () => [
    { label: 'Recent', items: () => { const h = [...new Set(Commands.history().slice().reverse())].slice(0, 10); return h.length ? h.map((line) => ({ label: line.slice(0, 48), action: () => CmdBar.runLine(line) })) : [{ label: 'Nothing yet', disabled: true }]; } },
    { label: 'Pinned', items: () => { const f = Commands.favs(); return f.length ? f.map((n, i) => ({ label: `/${n}`, key: i < 9 ? `Alt+${i + 1}` : '', action: () => CmdBar.runLine(`/${n}`) })) : [{ label: '☆ in the / menu pins a command', disabled: true }]; } },
    { label: 'Every command…', key: 'F1', action: () => CmdBar.help() },
    { label: 'Close', key: 'Esc', action: () => CmdBar.close() },
  ]);
  // a tab bar: every tab, the open one ✓ (long bars keep only five on screen)
  ctx('.tabbar', 'Tabs', (bar) => {
    const tabs = [...bar.querySelectorAll(':scope > button')];
    return tabs.length > 1 ? tabs.map((b) => ({ label: b.textContent.trim() || b.title, checked: b.classList.contains('on'), action: () => b.click() })) : null;
  });
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
  return { railItems };
})();
