// Chats panel: every conversation, grouped under its agent (and its folders), with filters
// (/filter or the ⏷ button: pinned, today, unread, busy, a tag, a folder, one agent), unread dots,
// tags, and keyboard navigation (↓ from the search box, ↑ ↓ Enter, F2 rename, Delete, Esc back).
const Panel = (() => {
  const COLLAPSED_KEY = 'hub.collapsedGroups';
  let collapsed;
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { collapsed = new Set(); }
  let filter = '';
  let view = store.get('panel.view', null); // a filter from /filter (null = everything)
  const PAGE = 40; // chats shown per agent before "Show more"
  const expanded = new Map(); // agent id -> how many to show
  // row(rowEl, item, agent) after a chat row is built, render() after the list is drawn (chat-scenes.js)
  const hooks = { row: [], render: [] };

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  // /sort: newest activity (default), oldest, or by title
  const SORTS = { recent: (a, b) => b.updatedAt - a.updatedAt, oldest: (a, b) => a.updatedAt - b.updatedAt, title: (a, b) => a.title.localeCompare(b.title) };
  const sortBy = () => (SORTS[store.get('panel.sort', 'recent')] ? store.get('panel.sort', 'recent') : 'recent');
  const metaOf = (id) => (typeof ChatUX !== 'undefined' ? ChatUX.metaOf(id) : {});

  // Does a chat summary pass the current /filter view?
  function inView(c, agent) {
    if (!view) return !metaOf(c.id).archived;
    const v = view.toLowerCase();
    const day = new Date(); day.setHours(0, 0, 0, 0);
    if (v === 'archived') return Boolean(metaOf(c.id).archived);
    if (metaOf(c.id).archived) return false; // archived chats only show under /filter archived
    if (v === 'pinned') return c.pinned;
    if (v === 'today') return c.updatedAt >= day.getTime();
    if (v === 'week') return c.updatedAt >= Date.now() - 7 * 864e5;
    if (v === 'unread') return H.unreadChats?.has(c.id);
    if (v === 'busy') return Native.isBusy(c.id);
    if (v.startsWith('tag:')) return (metaOf(c.id).tags || []).includes(v.slice(4).replace(/^#/, ''));
    if (v.startsWith('folder:')) return (metaOf(c.id).folder || '').toLowerCase() === v.slice(7);
    return agent.name.toLowerCase() === v || agent.id === v; // an agent's name: only its chats
  }

  function itemsFor(agent) {
    if (agent.mode === 'native') {
      return H.chats.filter((c) => c.agentId === agent.id && inView(c, agent))
        .sort((a, b) => (b.pinned - a.pinned) || SORTS[sortBy()](a, b))
        .map((c) => ({ key: c.id, title: c.title, chatId: c.id, pinned: c.pinned, updatedAt: c.updatedAt, ...metaOf(c.id) }));
    }
    if (view && view.toLowerCase() !== agent.name.toLowerCase()) return [];
    return (H.history[agent.id] || []).map((h) => ({ key: h.url, title: h.title, url: h.url }));
  }

  function toggleGroup(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch { /* not critical */ }
    render();
  }

  function startRename(row, chatId, title) {
    const input = el('input', 'rename');
    input.value = title;
    row.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      if (save && input.value.trim() && input.value !== title) Native.rename(chatId, input.value);
      else render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
  }

  // Runs a chat command on a chat from the list (opens it first, since commands act on the open chat).
  function onChat(agentId, chatId, cmd) { Native.open(agentId, chatId); setTimeout(() => Commands.exec(cmd, agentId), 30); }

  function itemMenu(agent, item, row, e) {
    e.preventDefault();
    const openIt = () => (item.chatId ? Native.open(agent.id, item.chatId) : openWebChat(agent.id, item.url));
    // (round 7) the frequent ones first, the rest in Organise › / Copy & export › / Continue with ›
    const others = H.agents().filter((a) => a.mode === 'native' && a.id !== agent.id);
    const items = item.chatId
      ? [
        { label: 'Open', action: openIt },
        { label: 'Pin to top', checked: Boolean(item.pinned), action: () => Native.togglePin(item.chatId) },
        { label: 'Rename', key: 'F2', action: () => startRename(row, item.chatId, item.title) },
        { label: 'Organise', items: () => [
          { label: 'Tag…', action: async () => { const t = await Modal.prompt('Tags', { value: (item.tags || []).join(', '), label: 'Comma-separated; filter with /filter tag:<name>' }); if (t != null) ChatUX.setMeta(item.chatId, { tags: [...new Set(t.split(/[,\s]+/).map((x) => x.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))] }); } },
          { label: 'Move to folder…', hint: item.folder || '', action: async () => { const f = await Modal.prompt('Folder', { value: item.folder || '', label: `Existing: ${ChatUX.allFolders().join(', ') || 'none yet'} (empty = no folder)` }); if (f != null) ChatUX.setMeta(item.chatId, { folder: f.trim().slice(0, 40) }); } },
          { label: item.archived ? 'Unarchive' : 'Archive (hide from the list)', action: () => ChatUX.setMeta(item.chatId, { archived: !item.archived }) },
          { label: H.unreadChats?.has(item.chatId) ? 'Mark as read' : 'Mark as unread', action: () => { if (H.unreadChats.has(item.chatId)) H.unreadChats.delete(item.chatId); else H.unreadChats.add(item.chatId); render(); } },
        ] },
        { label: 'Copy & export', items: () => [
          { label: 'Copy as Markdown', action: async () => copyText(await Native.markdownOf(item.chatId), 'Chat copied') },
          { label: 'Duplicate', action: () => onChat(agent.id, item.chatId, '/duplicate') },
          { label: 'Export…', action: () => onChat(agent.id, item.chatId, '/export md file') },
        ] },
        others.length ? { label: 'Continue with', items: () => others.map((a) => ({ label: a.name, action: () => Native.continueWith(item.chatId, a.id) })) } : null,
        { label: 'Delete chat', key: 'Del', danger: true, action: () => { if (confirm(`Delete "${item.title}"? You can restore it for 30 days (Ctrl+K → Recently deleted chats).`)) Native.remove(item.chatId); } },
      ]
      : [
        { label: 'Open', action: () => openWebChat(agent.id, item.url) },
        { label: 'Copy link', action: () => navigator.clipboard.writeText(item.url) },
        { label: 'Remove from list', action: () => removeWebItem(agent.id, item.url) },
      ];
    showMenu(e.clientX, e.clientY, [...items.filter(Boolean), ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Chats panel') : [])]);
  }

  function removeWebItem(agentId, url) {
    H.history[agentId] = (H.history[agentId] || []).filter((h) => h.url !== url);
    window.hub.saveHistory(H.history);
    render();
  }

  const matches = (i, q) => !q || i.title.toLowerCase().includes(q) || (q.startsWith('#') && (i.tags || []).some((t) => `#${t}`.startsWith(q))) || (i.folder || '').toLowerCase().includes(q);

  function row(agent, item) {
    const r = el('div', 'item');
    r.dataset.key = item.key;
    r.tabIndex = -1;
    r.title = item.title + (item.updatedAt ? ` · ${timeAgo(item.updatedAt)}` : '') + (item.tags?.length ? ` · ${item.tags.map((t) => `#${t}`).join(' ')}` : '');
    if (item.pinned) r.append(el('span', 'pin-mark', '📌'));
    r.append(el('span', 'item-title', item.title));
    if (item.tags?.length) r.append(el('span', 'item-tags', item.tags.map((t) => `#${t}`).join(' ')));
    if (item.chatId && Native.isBusy(item.chatId)) r.append(el('span', 'busy'));
    else if (item.chatId && H.unreadChats?.has(item.chatId)) { r.classList.add('unread'); r.append(el('span', 'unread-dot')); }
    const openIt = () => (item.chatId ? Native.open(agent.id, item.chatId) : openWebChat(agent.id, item.url));
    r.addEventListener('click', openIt);
    r.addEventListener('contextmenu', (e) => itemMenu(agent, item, r, e));
    r.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); openIt(); }
      else if (e.key === 'F2' && item.chatId) { e.preventDefault(); startRename(r, item.chatId, item.title); }
      else if (e.key === 'Delete' && item.chatId) { e.preventDefault(); if (confirm(`Delete "${item.title}"? You can restore it for 30 days.`)) Native.remove(item.chatId); }
      else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const b = r.getBoundingClientRect(); itemMenu(agent, item, r, { preventDefault() {}, clientX: b.left + 20, clientY: b.bottom }); }
    });
    for (const fn of hooks.row) { try { fn(r, item, agent); } catch (err) { console.warn(err); } }
    return r;
  }

  function render() {
    const root = $('chat-groups');
    if (!H.config) return;
    const hadFocus = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    root.replaceChildren();
    const q = filter.toLowerCase();
    if (view) {
      const chip = el('div', 'panel-view');
      chip.append(el('span', null, `Showing: ${view}`));
      const x = el('button', null, '×');
      x.title = 'Show every chat';
      x.addEventListener('click', () => setView(null));
      chip.append(x);
      root.append(chip);
    }
    for (const agent of H.agents()) {
      const items = itemsFor(agent).filter((i) => matches(i, q));
      if (view && !items.length) continue;
      const group = el('div', 'group');
      group.dataset.id = agent.id;
      group.style.setProperty('--agent', agent.color || 'var(--accent)');

      const head = el('div', 'group-head');
      const toggle = el('button', 'group-toggle');
      const unread = agent.mode === 'native' ? H.chats.filter((c) => c.agentId === agent.id && H.unreadChats?.has(c.id)).length : 0;
      toggle.append(
        el('span', 'caret', collapsed.has(agent.id) && !q && !view ? '▸' : '▾'),
        (() => { const d = el('span', 'dot'); const svg = Icons.for(agent); if (svg) { d.classList.add('dot-icon'); d.append(svg); } return d; })(),
        el('span', 'group-name', agent.name),
        unread ? el('span', 'group-unread', String(unread)) : el('span', 'group-kind', agent.mode === 'native' ? (agent.dock ? 'docked' : 'native') : 'web'),
      );
      toggle.title = `${items.length} chat${items.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}`;
      toggle.addEventListener('click', () => toggleGroup(agent.id));
      const add = el('button', 'group-add', '＋');
      add.title = agent.mode === 'native' ? 'New chat' : `Open a new ${agent.name} chat`;
      add.addEventListener('click', () => {
        if (agent.mode === 'native') { activate(agent.id); Native.newChat(agent.id); } else openWebChat(agent.id, agent.url);
      });
      head.append(toggle, add);
      group.append(head);

      if (!collapsed.has(agent.id) || q || view) {
        if (!items.length) {
          group.append(el('div', 'none', q ? 'No matches' : agent.mode === 'native' ? 'No chats yet' : 'Chats you open will show up here'));
        }
        const limit = expanded.get(agent.id) || PAGE;
        // chats without a folder first, then each folder under its own small header
        const shown = items.slice(0, limit);
        const loose = shown.filter((i) => !i.folder);
        for (const item of loose) group.append(row(agent, item));
        const folders = [...new Set(shown.filter((i) => i.folder).map((i) => i.folder))].sort();
        for (const f of folders) {
          const key = `${agent.id}/folder:${f}`;
          const fh = el('button', 'folder-head', `${collapsed.has(key) && !q ? '▸' : '▾'} 📁 ${f}`);
          fh.addEventListener('click', () => toggleGroup(key));
          group.append(fh);
          if (collapsed.has(key) && !q) continue;
          for (const item of shown.filter((i) => i.folder === f)) group.append(row(agent, item));
        }
        if (items.length > limit) {
          const more = el('button', 'show-more', `Show ${Math.min(PAGE, items.length - limit)} more (${items.length - limit} hidden)`);
          more.addEventListener('click', () => { expanded.set(agent.id, limit + PAGE); render(); });
          group.append(more);
        }
      }
      root.append(group);
    }
    if (view && !root.querySelector('.group')) root.append(el('div', 'none', 'No chat matches this filter'));
    if (q.length >= 2) {
      const deep = el('button', 'show-more deep-search', `Search inside messages for “${filter}”`);
      deep.addEventListener('click', () => AppUI.palette(`?${filter}`));
      root.append(deep);
    }
    highlight();
    // unread replies show in the window title too: "(2) Claude · Hearth"
    const unread = H.unreadChats?.size || 0;
    document.title = `${unread ? `(${unread}) ` : ''}${document.title.replace(/^\(\d+\) /, '') || 'Hearth'}`;
    if (hadFocus) root.querySelector(`.item[data-key="${CSS.escape(hadFocus)}"]`)?.focus();
    for (const fn of hooks.render) { try { fn(); } catch (err) { console.warn(err); } }
  }

  function highlight() {
    for (const group of $('chat-groups').querySelectorAll('.group')) {
      const id = group.dataset.id;
      group.classList.toggle('current', id === H.activeId);
      const agent = H.agent(id);
      let activeKey = null;
      if (agent?.mode === 'native') activeKey = H.activeChat[id];
      else {
        try { activeKey = H.surfaces.get(id)?.webview?.getURL(); } catch { /* webview not ready yet */ }
      }
      for (const row of group.querySelectorAll('.item')) row.classList.toggle('active', row.dataset.key === activeKey);
    }
  }

  function setFilter(text) {
    filter = text.trim();
    render();
  }
  function setView(v) {
    view = v || null;
    store.set('panel.view', view);
    render();
  }

  // Keyboard: ↓ from the search box into the list, ↑ ↓ between chats, Esc back to the search box.
  function wireKeys() {
    const root = $('chat-groups');
    const search = $('chat-search');
    if (!root || !search || root.dataset.keys) return;
    root.dataset.keys = '1';
    const rows = () => [...root.querySelectorAll('.item')];
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); rows()[0]?.focus(); }
      if (e.key === 'Enter') { const first = rows()[0]; if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'Escape' && search.value) { search.value = ''; setFilter(''); }
    });
    root.addEventListener('keydown', (e) => {
      const all = rows();
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(all.length - 1, i + 1)].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i === 0) search.focus(); else all[i - 1].focus(); }
      if (e.key === 'Home') { e.preventDefault(); all[0].focus(); }
      if (e.key === 'End') { e.preventDefault(); all.at(-1).focus(); }
      if (e.key === 'Escape') { e.preventDefault(); search.focus(); }
    });
    // the ⏷ filter button next to the search box
    const btn = document.createElement('button');
    btn.className = 'panel-filter-btn ghost';
    btn.textContent = '⏷';
    btn.title = 'Filter chats: pinned, today, unread, a tag, a folder… (/filter)';
    btn.addEventListener('click', () => {
      const b = btn.getBoundingClientRect();
      const tags = typeof ChatUX !== 'undefined' ? ChatUX.allTags() : [];
      const folders = typeof ChatUX !== 'undefined' ? ChatUX.allFolders() : [];
      showMenu(b.left, b.bottom + 4, [
        { label: `${view ? '' : '✓ '}Everything`, action: () => setView(null) },
        ...['pinned', 'today', 'week', 'unread', 'busy', 'archived'].map((v) => ({ label: `${view === v ? '✓ ' : ''}${{ pinned: '📌 Pinned', today: 'Today', week: 'Last 7 days', unread: 'Unread replies', busy: 'Answering now', archived: '🗄 Archived' }[v]}`, action: () => setView(v) })),
        ...Object.keys(SORTS).map((k) => ({ label: `${sortBy() === k ? '✓ ' : ''}Sort: ${{ recent: 'latest first', oldest: 'oldest first', title: 'by title' }[k]}`, action: () => { store.set('panel.sort', k); render(); } })),
        ...folders.map((f) => ({ label: `${view === `folder:${f.toLowerCase()}` ? '✓ ' : ''}📁 ${f}`, action: () => setView(`folder:${f.toLowerCase()}`) })),
        ...tags.map((t) => ({ label: `${view === `tag:${t}` ? '✓ ' : ''}#${t}`, action: () => setView(`tag:${t}`) })),
      ]);
    });
    search.after(btn);
    search.placeholder = 'Search chats (#tag)';
  }
  setTimeout(wireKeys, 0);

  return { render, highlight, setFilter, setView, view: () => view, SORTS, hooks };
})();
