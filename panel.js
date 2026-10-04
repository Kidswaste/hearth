// Chats panel: every conversation, grouped under its agent.
const Panel = (() => {
  const COLLAPSED_KEY = 'hub.collapsedGroups';
  let collapsed;
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { collapsed = new Set(); }
  let filter = '';

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  function itemsFor(agent) {
    if (agent.mode === 'native') {
      return H.chats.filter((c) => c.agentId === agent.id).map((c) => ({ key: c.id, title: c.title, chatId: c.id }));
    }
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
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
  }

  function itemMenu(agent, item, row, e) {
    e.preventDefault();
    const items = item.chatId
      ? [
        { label: 'Rename', action: () => startRename(row, item.chatId, item.title) },
        { label: 'Delete chat', danger: true, action: () => { if (confirm(`Delete "${item.title}"? This can't be undone.`)) Native.remove(item.chatId); } },
      ]
      : [
        { label: 'Open', action: () => openWebChat(agent.id, item.url) },
        { label: 'Copy link', action: () => navigator.clipboard.writeText(item.url) },
        { label: 'Remove from list', action: () => removeWebItem(agent.id, item.url) },
      ];
    showMenu(e.clientX, e.clientY, items);
  }

  function removeWebItem(agentId, url) {
    H.history[agentId] = (H.history[agentId] || []).filter((h) => h.url !== url);
    window.hub.saveHistory(H.history);
    render();
  }

  function render() {
    const root = $('chat-groups');
    if (!H.config) return;
    root.replaceChildren();
    const q = filter.toLowerCase();
    for (const agent of H.agents()) {
      const items = itemsFor(agent).filter((i) => !q || i.title.toLowerCase().includes(q));
      const group = el('div', 'group');
      group.dataset.id = agent.id;
      group.style.setProperty('--agent', agent.color || 'var(--accent)');

      const head = el('div', 'group-head');
      const toggle = el('button', 'group-toggle');
      toggle.append(
        el('span', 'caret', collapsed.has(agent.id) && !q ? '▸' : '▾'),
        el('span', 'dot'),
        el('span', 'group-name', agent.name),
        el('span', 'group-kind', agent.mode === 'native' ? 'native' : 'web'),
      );
      toggle.addEventListener('click', () => toggleGroup(agent.id));
      const add = el('button', 'group-add', '＋');
      add.title = agent.mode === 'native' ? 'New chat' : `Open a new ${agent.name} chat`;
      add.addEventListener('click', () => {
        if (agent.mode === 'native') { activate(agent.id); Native.newChat(agent.id); } else openWebChat(agent.id, agent.url);
      });
      head.append(toggle, add);
      group.append(head);

      if (!collapsed.has(agent.id) || q) {
        if (!items.length) {
          group.append(el('div', 'none', q ? 'No matches' : agent.mode === 'native' ? 'No chats yet' : 'Chats you open will show up here'));
        }
        for (const item of items) {
          const row = el('div', 'item');
          row.dataset.key = item.key;
          row.title = item.title;
          row.append(el('span', 'item-title', item.title));
          if (item.chatId && Native.isBusy(item.chatId)) row.append(el('span', 'busy'));
          row.addEventListener('click', () => (item.chatId ? Native.open(agent.id, item.chatId) : openWebChat(agent.id, item.url)));
          row.addEventListener('contextmenu', (e) => itemMenu(agent, item, row, e));
          group.append(row);
        }
      }
      root.append(group);
    }
    highlight();
  }

  function highlight() {
    for (const group of $('chat-groups').children) {
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

  return { render, highlight, setFilter };
})();
