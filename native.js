// Native chats: the hub's own chat screen, answered through the official Claude Code / Codex engines.
const Native = (() => {
  const views = new Map(); // agent id -> DOM refs
  const chats = new Map(); // chat id -> full chat (loaded on demand)
  const pending = new Map(); // chat id -> { text, started, el }

  const ENGINE_LABEL = { claude: 'Claude Pro', codex: 'ChatGPT Plus' };
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  function mount(agentId, root) {
    const header = el('header', 'native-head');
    const title = el('span', 'chat-title');
    const meta = el('span', 'chat-meta');
    const newBtn = el('button', 'ghost', '＋ New chat');
    newBtn.title = 'New chat (Ctrl+N)';
    newBtn.addEventListener('click', () => newChat(agentId));
    header.append(title, meta, newBtn);

    const list = el('div', 'messages');
    list.addEventListener('click', onListClick);

    const form = el('form', 'composer');
    const input = el('textarea');
    input.rows = 1;
    const sendBtn = el('button', 'primary', 'Send');
    sendBtn.type = 'submit';
    form.append(input, sendBtn);
    input.addEventListener('input', () => autosize(input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const chatId = H.activeChat[agentId];
      if (chatId && pending.has(chatId)) { window.hub.stop(chatId); return; }
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      autosize(input);
      send(agentId, text).catch(() => {});
    });

    root.append(header, list, form);
    views.set(agentId, { title, meta, list, input, sendBtn });
    render(agentId);
    return views.get(agentId);
  }

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
  }

  async function onListClick(e) {
    const copy = e.target.closest('.copy-code, .copy-msg');
    if (copy) {
      const text = copy.classList.contains('copy-code')
        ? copy.parentElement.querySelector('code').textContent
        : copy.closest('.msg').dataset.raw;
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
      return;
    }
    const login = e.target.closest('.login-btn');
    if (login) {
      await window.hub.login(login.dataset.engine);
      login.replaceWith(el('span', 'hint', 'Finish signing in in the window that opened, then send your message again.'));
    }
  }

  async function loadChat(id) {
    if (!chats.has(id)) {
      const chat = await window.hub.getChat(id);
      if (!chat) return null;
      chats.set(id, chat);
    }
    return chats.get(id);
  }

  function messageEl(m, agent) {
    const node = el('div', `msg ${m.role}`);
    node.dataset.raw = m.text;
    const body = el('div', 'body');
    if (m.role === 'assistant') body.innerHTML = renderMarkdown(m.text);
    else body.textContent = m.text;
    node.append(body);
    if (m.role === 'error' && m.needsLogin) {
      const btn = el('button', 'primary login-btn', `Sign in to ${ENGINE_LABEL[agent.engine] || agent.engine}`);
      btn.dataset.engine = agent.engine;
      node.append(btn);
    }
    if (m.role === 'assistant') {
      const foot = el('div', 'msg-foot');
      if (m.usage) foot.append(el('span', null, `${fmt(m.usage.input)} in · ${fmt(m.usage.output)} out${m.ms ? ` · ${(m.ms / 1000).toFixed(1)}s` : ''}`));
      if (m.stopped) foot.append(el('span', null, 'stopped'));
      const copy = el('button', 'copy-msg', 'Copy');
      foot.append(copy);
      node.append(foot);
    }
    return node;
  }

  function emptyState(agent) {
    const box = el('div', 'empty');
    box.append(el('div', 'empty-icon', agent.icon || agent.name[0]));
    box.append(el('h3', null, `New chat with ${agent.name}`));
    const engineOk = H.engineStatus[agent.engine] !== false;
    box.append(el('p', 'hint', engineOk
      ? `Runs on your ${ENGINE_LABEL[agent.engine] || agent.engine} account${agent.model ? ` · ${agent.model}` : ''}. Tokens used are shown under each reply.`
      : `Couldn't find the ${agent.engine === 'claude' ? 'Claude' : 'Codex'} desktop app on this PC, so native chat can't run.`));
    return box;
  }

  async function render(agentId) {
    const v = views.get(agentId);
    const agent = H.agent(agentId);
    if (!v || !agent) return;
    const chatId = H.activeChat[agentId];
    const chat = chatId ? await loadChat(chatId) : null;
    if (chatId && !chat) H.activeChat[agentId] = null;

    v.title.textContent = chat?.title || 'New chat';
    const total = (chat?.messages || []).reduce((sum, m) => sum + (m.usage ? m.usage.input + m.usage.output : 0), 0);
    v.meta.textContent = [agent.model, total ? `${fmt(total)} tokens this chat` : null].filter(Boolean).join(' · ');
    v.input.placeholder = `Message ${agent.name}…  (Enter to send, Shift+Enter for a new line)`;

    v.list.replaceChildren();
    if (!chat) v.list.append(emptyState(agent));
    else chat.messages.forEach((m) => v.list.append(messageEl(m, agent)));

    const p = chat && pending.get(chat.id);
    if (p) {
      p.el = el('div', 'msg assistant streaming');
      p.el.append(el('div', 'body'));
      paintStreaming(p);
      v.list.append(p.el);
    }
    v.sendBtn.textContent = p ? 'Stop' : 'Send';
    v.sendBtn.classList.toggle('stop', Boolean(p));
    v.list.scrollTop = v.list.scrollHeight;
  }

  function paintStreaming(p) {
    const body = p.el.querySelector('.body');
    if (p.text) body.innerHTML = renderMarkdown(p.text);
    else body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  }

  function remember(chat) {
    window.hub.saveChat(chat);
    const summary = { id: chat.id, agentId: chat.agentId, title: chat.title, updatedAt: chat.updatedAt };
    H.chats = [summary, ...H.chats.filter((c) => c.id !== chat.id)];
    Panel.render();
  }

  function titleFrom(text) {
    const line = text.split('\n').find((l) => l.trim())?.trim() || 'New chat';
    return line.length > 48 ? `${line.slice(0, 47)}…` : line;
  }

  async function send(agentId, text) {
    let chatId = H.activeChat[agentId];
    if (chatId && pending.has(chatId)) throw new Error(`${H.agent(agentId).name} is still answering`);
    let chat = chatId ? await loadChat(chatId) : null;
    const now = Date.now();
    if (!chat) {
      chat = { id: `${agentId}-${now.toString(36)}`, agentId, title: titleFrom(text), createdAt: now, updatedAt: now, session: {}, messages: [] };
      chats.set(chat.id, chat);
      H.activeChat[agentId] = chat.id;
    }
    chat.messages.push({ role: 'user', text, at: now });
    chat.updatedAt = now;
    remember(chat);
    pending.set(chat.id, { text: '', started: now });
    render(agentId);
    window.hub.send({ agentId, chatId: chat.id, session: chat.session, text })
      .catch((err) => onEvent({ chatId: chat.id, type: 'error', message: err.message }));
  }

  function onEvent(event) {
    const p = pending.get(event.chatId);
    const chat = chats.get(event.chatId);
    if (!p || !chat) return;
    if (event.type === 'delta') {
      p.text += event.text;
      if (p.el?.isConnected) {
        paintStreaming(p);
        const list = p.el.parentElement;
        list.scrollTop = list.scrollHeight;
      }
      return;
    }
    pending.delete(event.chatId);
    const at = Date.now();
    if (event.type === 'done') {
      chat.messages.push({ role: 'assistant', text: event.text || p.text, at, usage: event.usage, ms: at - p.started });
      chat.session = event.session;
    } else if (event.type === 'stopped') {
      if (p.text) chat.messages.push({ role: 'assistant', text: p.text, at, stopped: true });
      if (event.session?.id) chat.session = event.session;
    } else {
      chat.messages.push({ role: 'error', text: event.message, needsLogin: event.needsLogin, at });
    }
    chat.updatedAt = at;
    remember(chat);
    if (H.activeChat[chat.agentId] === chat.id) render(chat.agentId);
  }

  function open(agentId, chatId) {
    H.activeChat[agentId] = chatId;
    activate(agentId);
    render(agentId);
    Panel.highlight();
  }

  function newChat(agentId) {
    H.activeChat[agentId] = null;
    render(agentId);
    Panel.highlight();
    focus(agentId);
  }

  async function rename(chatId, title) {
    const chat = await loadChat(chatId);
    if (!chat || !title.trim()) return;
    chat.title = title.trim().slice(0, 80);
    remember(chat);
    if (H.activeChat[chat.agentId] === chatId) render(chat.agentId);
  }

  async function remove(chatId) {
    const summary = H.chats.find((c) => c.id === chatId);
    if (pending.has(chatId)) window.hub.stop(chatId);
    await window.hub.deleteChat(chatId);
    chats.delete(chatId);
    H.chats = H.chats.filter((c) => c.id !== chatId);
    if (summary && H.activeChat[summary.agentId] === chatId) newChat(summary.agentId);
    Panel.render();
  }

  window.hub.onEngineEvent(onEvent);

  return {
    mount,
    refresh: render,
    focus: (agentId) => views.get(agentId)?.input.focus(),
    send,
    open,
    newChat,
    rename,
    remove,
    isBusy: (chatId) => pending.has(chatId),
  };
})();
