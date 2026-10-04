// Native chats: the hub's own chat screen, answered through the official Claude Code / Codex engines.
const Native = (() => {
  const views = new Map(); // agent id -> DOM refs
  const chats = new Map(); // chat id -> full chat (loaded on demand)
  const pending = new Map(); // chat id -> { text, started, el }

  const ENGINE_LABEL = { claude: 'Claude', codex: 'ChatGPT' };
  const REMEMBER_TAG = /<remember>([\s\S]*?)<\/remember>/gi;
  // How much of an imported chat is sent as context when you continue it.
  const IMPORT_CONTEXT_CHARS = 24000;

  // Hide memory tags from what you see, including a tag that is still streaming in.
  const visibleText = (text) => text.replace(REMEMBER_TAG, '').replace(/<remember>[\s\S]*$/i, '').replace(/<rem[a-z]*$/i, '').trim();

  // "mcp__claude_ai_Gmail__search_threads" -> "Gmail · search threads"
  const toolLabel = (name) => {
    const m = name.match(/^mcp__(?:claude_ai_)?(.+?)__(.+)$/);
    return m ? `${m[1].replace(/_/g, ' ')} · ${m[2].replace(/[_-]/g, ' ')}` : name;
  };
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
    const undo = e.target.closest('.undo-memory');
    if (undo) {
      await forgetFacts(undo.dataset.agent, JSON.parse(undo.dataset.facts));
      undo.parentElement.replaceWith(el('div', 'memory-chip', 'Removed from memory'));
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
    if (m.tools?.length) {
      node.prepend(el('div', 'tool-chips', `Used ${[...new Set(m.tools.map(toolLabel))].join(', ')}`));
    }
    if (m.remembered?.length) {
      const chip = el('div', 'memory-chip', `Saved to memory: ${m.remembered.join(' · ')} `);
      const undoBtn = el('button', 'undo-memory', 'Undo');
      undoBtn.dataset.agent = agent.id;
      undoBtn.dataset.facts = JSON.stringify(m.remembered);
      chip.append(undoBtn);
      node.append(chip);
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
    else {
      if (chat.imported) {
        v.list.append(el('div', 'import-banner', chat.session?.id
          ? `Imported from ${chat.imported}, continued here.`
          : `Imported from ${chat.imported}. Send a message to continue it here; the earlier conversation goes along as context.`));
      }
      chat.messages.forEach((m) => v.list.append(messageEl(m, agent)));
    }

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
    const text = visibleText(p.text);
    body.innerHTML = text ? renderMarkdown(text) : '';
    if (p.tools.length) {
      let chips = p.el.querySelector('.tool-chips');
      if (!chips) { chips = el('div', 'tool-chips'); p.el.prepend(chips); }
      chips.textContent = `Using ${toolLabel(p.tools.at(-1))}…`;
    }
    if (!text) body.insertAdjacentHTML('beforeend', '<span class="typing"><i></i><i></i><i></i></span>');
  }

  async function rememberFacts(agentId, facts) {
    const memory = await window.hub.getMemory();
    const current = (memory.agents[agentId] || '').trim();
    memory.agents[agentId] = [current, ...facts.map((f) => `- ${f}`)].filter(Boolean).join('\n');
    await window.hub.saveMemory(memory);
  }

  async function forgetFacts(agentId, facts) {
    const memory = await window.hub.getMemory();
    const drop = new Set(facts.map((f) => `- ${f}`));
    memory.agents[agentId] = (memory.agents[agentId] || '').split('\n').filter((l) => !drop.has(l.trim())).join('\n');
    await window.hub.saveMemory(memory);
  }

  // Continuing an imported chat: the engine has never seen it, so send the history along once.
  function withImportedContext(chat, text) {
    if (!chat.imported || chat.session?.id) return text;
    const earlier = chat.messages.slice(0, -1)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
      .join('\n\n');
    const trimmed = earlier.length > IMPORT_CONTEXT_CHARS ? `…${earlier.slice(-IMPORT_CONTEXT_CHARS)}` : earlier;
    return `Here is our earlier conversation (imported from ${chat.imported}). Continue it naturally.\n\n`
      + `<earlier_conversation>\n${trimmed}\n</earlier_conversation>\n\n${text}`;
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
    pending.set(chat.id, { text: '', tools: [], started: now });
    render(agentId);
    window.hub.send({ agentId, chatId: chat.id, session: chat.session, text: withImportedContext(chat, text) })
      .catch((err) => onEvent({ chatId: chat.id, type: 'error', message: err.message }));
  }

  function onEvent(event) {
    const p = pending.get(event.chatId);
    const chat = chats.get(event.chatId);
    if (!p || !chat) return;
    if (event.type === 'delta' || event.type === 'tool') {
      if (event.type === 'tool') {
        p.tools.push(event.name);
        if (p.text && !p.text.endsWith('\n\n')) p.text += '\n\n';
      } else {
        p.text += event.text;
      }
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
      const raw = event.text || p.text;
      const facts = [...raw.matchAll(REMEMBER_TAG)].map((m) => m[1].trim()).filter(Boolean);
      const message = { role: 'assistant', text: visibleText(raw), at, usage: event.usage, ms: at - p.started };
      if (p.tools.length) message.tools = p.tools;
      if (facts.length) {
        message.remembered = facts;
        rememberFacts(chat.agentId, facts);
      }
      chat.messages.push(message);
      chat.session = event.session;
    } else if (event.type === 'stopped') {
      if (p.text) chat.messages.push({ role: 'assistant', text: visibleText(p.text), at, stopped: true });
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
