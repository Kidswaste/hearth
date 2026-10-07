// Native chats: the hub's own chat screen, answered through the official Claude Code / Codex engines.
const Native = (() => {
  const views = new Map(); // agent id -> DOM refs + composer state
  const chats = new Map(); // chat id -> full chat (loaded on demand)
  const pending = new Map(); // chat id -> { text, tools, started, el }

  const ENGINE_LABEL = { claude: 'Claude', codex: 'ChatGPT' };
  const MODEL_CHOICES = { claude: ['opus', 'sonnet', 'haiku', 'fable'], codex: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] };
  const REMEMBER_TAG = /<remember>([\s\S]*?)<\/remember>/gi;
  // How much earlier conversation is sent as context when a chat has to start a fresh engine session
  // (imported chats, edited or regenerated messages, chats continued from another agent).
  const CONTEXT_CHARS = 24000;
  const TEXT_ATTACH_LIMIT = 200 * 1024;
  const COLLAPSE_PX = 900;

  // Follow-up suggestions the agent offers as buttons: <suggest>…</suggest>.
  const SUGGEST_TAG = /<suggest>([\s\S]*?)<\/suggest>/gi;
  // Hide memory / suggestion tags from what you see, including a tag that is still streaming in.
  const visibleText = (text) => text.replace(REMEMBER_TAG, '').replace(SUGGEST_TAG, '').replace(/<(remember|suggest)>[\s\S]*$/i, '').replace(/<(rem|sug)[a-z]*$/i, '').trim();
  const REVIEW_PROMPT = 'Review your last result critically against what I asked. For visual work, take a fresh screenshot and look closely. List the concrete problems you see, then fix the important ones.';

  // "mcp__claude_ai_Gmail__search_threads" -> "Gmail · search threads"
  const toolLabel = (name) => {
    const m = name.match(/^mcp__(?:claude_ai_)?(.+?)__(.+)$/);
    return m ? `${m[1].replace(/_/g, ' ')} · ${m[2].replace(/[_-]/g, ' ')}` : name;
  };
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const draftKey = (agentId) => `draft.${agentId}.${H.activeChat[agentId] || 'new'}`;
  const nearBottom = (list) => list.scrollHeight - list.scrollTop - list.clientHeight < 80;

  function mount(agentId, root) {
    const title = el('span', { class: 'chat-title', title: 'Double-click to rename' });
    const meta = el('span', { class: 'chat-meta' });
    const modelSel = el('select', { class: 'model-select', title: 'Model for this chat' });
    const menuBtn = el('button', { class: 'ghost', text: '⋯', title: 'Chat options' });
    const newBtn = el('button', { class: 'ghost', text: '＋ New chat', title: 'New chat (Ctrl+N)', on: { click: () => newChat(agentId) } });
    // How much context each message sends now (the last reply's input tokens); click to compact.
    const ctx = el('button', { class: 'ctx-meter', hidden: true, on: { click: () => compactChat(agentId) } }, el('span', { class: 'ctx-bar' }, el('i')), el('span', { class: 'ctx-text' }));
    const header = el('header', { class: 'native-head' }, title, meta, ctx, el('span', { class: 'spacer' }), modelSel, menuBtn, newBtn);
    title.addEventListener('dblclick', () => renameCurrent(agentId));
    menuBtn.addEventListener('click', (e) => chatMenu(agentId, e));
    modelSel.addEventListener('change', () => setChatModel(agentId, modelSel.value));

    const list = el('div', { class: 'messages' });
    list.addEventListener('click', (e) => onListClick(e, agentId));
    const jump = el('button', { class: 'jump-bottom', text: '↓', title: 'Jump to the latest message', hidden: true, on: { click: () => { list.scrollTop = list.scrollHeight; } } });
    list.addEventListener('scroll', () => { jump.hidden = nearBottom(list); });

    const chips = el('div', { class: 'attach-chips' });
    const input = el('textarea', { rows: 3, spellcheck: true });
    const attachBtn = el('button', { type: 'button', class: 'ghost attach-btn', text: '📎', title: 'Attach files or images (or drop / paste them)' });
    const sendBtn = el('button', { type: 'submit', class: 'primary', text: 'Send' });
    const counter = el('span', { class: 'composer-count' });
    const queueBox = el('div', { class: 'queue-chips', hidden: true });
    const form = el('form', { class: 'composer' }, el('div', { class: 'composer-box' }, queueBox, chips, input, counter), attachBtn, sendBtn);
    const v = { title, meta, ctx, modelSel, list, input, sendBtn, chips, counter, jump, attachments: [], queue: [], queueBox };

    const saveDraft = debounce(() => store.set(draftKey(agentId), input.value || null), 400);
    input.addEventListener('input', () => { autosize(input); updateCounter(v); saveDraft(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
      if (e.key === 'Escape') { const id = H.activeChat[agentId]; if (id && pending.has(id)) window.hub.stop(id); }
      if (e.key === 'ArrowUp' && !input.value) { // edit your last message, like most chat apps
        const chat = chats.get(H.activeChat[agentId]);
        const idx = chat?.messages.map((m) => m.role).lastIndexOf('user');
        if (idx >= 0) { e.preventDefault(); editMessage(agentId, idx); }
      }
    });
    input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(agentId, files); }
    });
    attachBtn.addEventListener('click', async () => {
      const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'Attach files' });
      for (const p of paths) await addPath(agentId, p);
    });
    dropZone(root, (files) => addFiles(agentId, files), { hint: 'Drop to attach' });
    Prompts.attach(input, (text) => { input.value = text; autosize(input); updateCounter(v); input.focus(); });

    input.addEventListener('input', () => syncSendBtn(agentId));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const chatId = H.activeChat[agentId];
      const text = input.value.trim();
      // While it answers: a typed message waits in line (sent when the reply ends); an empty box means Stop.
      if (chatId && pending.has(chatId)) {
        if (!text) { window.hub.stop(chatId); return; }
        (v.queue ||= []).push(text);
        input.value = '';
        store.set(draftKey(agentId), null);
        autosize(input);
        renderQueue(agentId);
        return;
      }
      if (!text && !v.attachments.length) return;
      input.value = '';
      store.set(draftKey(agentId), null);
      autosize(input);
      updateCounter(v);
      send(agentId, text).catch((err) => toast(err.message, { type: 'error' }));
    });

    root.append(header, el('div', { class: 'messages-wrap' }, list, jump), form);
    views.set(agentId, v);
    render(agentId);
    return v;
  }

  // Grows with the text up to ~45% of the window, then scrolls.
  function autosize(input) {
    input.style.height = 'auto';
    const max = Math.max(160, Math.round(window.innerHeight * 0.45));
    input.style.height = `${Math.min(Math.max(input.scrollHeight + 2, 84), max)}px`;
    input.style.overflowY = input.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }
  function updateCounter(v) {
    const n = v.input.value.length;
    v.counter.textContent = n > 200 ? `${n.toLocaleString()} chars · ~${fmt(Math.ceil(n / 4))} tokens` : '';
  }

  // ---------- attachments ----------
  function renderChips(agentId) {
    const v = views.get(agentId);
    v.chips.replaceChildren(...v.attachments.map((a, i) => el('span', { class: `attach-chip ${a.kind}` },
      a.kind === 'image' && a.preview ? el('img', { src: a.preview, alt: '' }) : el('span', { text: a.kind === 'text' ? '📄' : '📎' }),
      el('span', { text: a.name }),
      el('button', { type: 'button', text: '×', title: 'Remove', on: { click: () => { v.attachments.splice(i, 1); renderChips(agentId); } } }))));
  }
  const isTextName = (name) => /\.(txt|md|markdown|js|mjs|ts|tsx|jsx|json|csv|tsv|html?|css|glsl|frag|vert|py|xml|ya?ml|ini|log|jsx|sh|bat|ps1|c|cpp|h|cs|java|rs|go|lua|toml|svg)$/i.test(name);
  async function addFiles(agentId, files) {
    const v = views.get(agentId);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const name = file.name || `pasted-${Date.now()}.png`;
        const path = await window.hub.saveAttachment(name, btoa(bin));
        v.attachments.push({ kind: 'image', name, path, preview: URL.createObjectURL(file) });
      } else if (isTextName(file.name) || file.type.startsWith('text/')) {
        if (file.size > TEXT_ATTACH_LIMIT) { toast(`${file.name} is over 200 KB; attach a smaller excerpt.`, { type: 'error' }); continue; }
        v.attachments.push({ kind: 'text', name: file.name, content: await file.text() });
      } else {
        const path = window.hub.pathForFile(file);
        if (path) await addPath(agentId, path); else toast(`Can't attach ${file.name}`, { type: 'error' });
      }
    }
    renderChips(agentId);
  }
  // Media dropped in the Three Director's chat (videos, models, sounds…) are added to the open sketch's
  // references, with a note telling the director their names.
  async function labReference(agentId, path) {
    const agent = H.agent(agentId);
    if (!agent?.threeTools || typeof ThreeLab === 'undefined') return false;
    try {
      const r = await ThreeLab.addReference(path);
      const use = r.kind === 'image' || r.kind === 'video' ? `refTexture('${r.key}')` : `refs.${r.key}`;
      views.get(agentId).attachments.push({ kind: 'text', name: `reference: ${r.key}`, content: `The user added "${r.name}" (${r.kind}) to this sketch's references as "${r.key}". In code: ${use}.` });
      return true;
    } catch (err) { toast(err.message, { type: 'error' }); return false; }
  }
  async function addPath(agentId, path) {
    const v = views.get(agentId);
    const name = path.split(/[\\/]/).pop();
    if (H.agent(agentId)?.threeTools && typeof ThreeLab !== 'undefined' && ThreeLab.isReference(name) && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
      if (await labReference(agentId, path)) { renderChips(agentId); toast(`${name} added to the sketch's references`, { timeout: 2200 }); return; }
    }
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
      // The Three Director can turn attached pictures into sketch references, from the attachments folder.
      if (H.agent(agentId)?.threeTools) { try { path = await window.hub.saveAttachment(name, await window.hub.fs.read(path, { encoding: 'base64' })); } catch { /* keep the original path */ } }
      v.attachments.push({ kind: 'image', name, path, preview: `file:///${path.replace(/\\/g, '/')}` });
    } else if (isTextName(name)) {
      try { v.attachments.push({ kind: 'text', name, content: await window.hub.fs.read(path, { maxBytes: TEXT_ATTACH_LIMIT }) }); } catch (err) { toast(err.message, { type: 'error' }); }
    } else {
      const agent = H.agent(agentId);
      if (agent.engine === 'claude' && agent.workspace) v.attachments.push({ kind: 'file', name, path });
      else { toast(`${name} isn't a text file. Give this agent File access to let it open other file types.`, { type: 'error' }); return; }
    }
    renderChips(agentId);
  }

  // ---------- message list ----------
  async function onListClick(e, agentId) {
    const t = e.target;
    const copy = t.closest('.copy-code, .copy-msg');
    if (copy) {
      const text = copy.classList.contains('copy-code') ? copy.closest('pre').querySelector('code').textContent : copy.closest('.msg').dataset.raw;
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
      return;
    }
    const codeAction = t.closest('.code-act');
    if (codeAction) {
      const pre = codeAction.closest('pre');
      const code = pre.querySelector('code').textContent;
      const lang = pre.dataset.lang || '';
      if (codeAction.dataset.act === 'save') {
        const ext = { javascript: 'js', js: 'js', jsx: 'jsx', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', glsl: 'glsl', markdown: 'md', md: 'md', extendscript: 'jsx', bash: 'sh', powershell: 'ps1' }[lang.toLowerCase()] || 'txt';
        const saved = await window.hub.saveFile({ defaultPath: `snippet.${ext}`, content: code });
        if (saved) toast(`Saved ${saved.split(/[\\/]/).pop()}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(saved) } });
      }
      if (codeAction.dataset.act === 'three') ThreeLab.openCode(code);
      if (codeAction.dataset.act === 'ae') AEKit.runCode(code, 'From chat');
      if (codeAction.dataset.act === 'shader') ThreeLab.openShader(code);
      return;
    }
    const sug = t.closest('[data-suggest]');
    if (sug) { send(agentId, sug.dataset.suggest).catch((err) => toast(err.message, { type: 'error' })); return; }
    const act = t.closest('[data-msg-act]');
    if (act) {
      const idx = Number(act.closest('.msg').dataset.index);
      const what = act.dataset.msgAct;
      if (what === 'branch') branchFrom(agentId, idx);
      if (what === 'review') send(agentId, REVIEW_PROMPT).catch((err) => toast(err.message, { type: 'error' }));
      if (what === 'opinion') secondOpinion(agentId);
      if (what === 'apply-opinion') {
        const m = chats.get(H.activeChat[agentId])?.messages[idx];
        if (m) send(agentId, `Here is ${m.from}'s second opinion on your last result:\n\n${m.text}\n\nWhat do you take from it? Apply the parts that make it better and tell me what you changed (and what you disagree with).`).catch((err) => toast(err.message, { type: 'error' }));
      }
      if (what === 'edit') editMessage(agentId, idx);
      if (what === 'retry') regenerate(agentId, idx);
      if (what === 'quote') quote(agentId, idx);
      if (what === 'more') act.closest('.msg').classList.remove('collapsed');
      return;
    }
    const undo = t.closest('.undo-memory');
    if (undo) {
      await forgetFacts(undo.dataset.agent, JSON.parse(undo.dataset.facts));
      undo.parentElement.replaceWith(el('div', { class: 'memory-chip', text: 'Removed from memory' }));
      return;
    }
    const login = t.closest('.login-btn');
    if (login) {
      await window.hub.login(login.dataset.engine);
      login.replaceWith(el('span', { class: 'hint', text: 'Finish signing in in the window that opened, then press Retry.' }));
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

  // Adds Save / Run buttons to code blocks depending on their language and content.
  function decorateCode(body) {
    for (const pre of body.querySelectorAll('pre')) {
      const code = pre.querySelector('code').textContent;
      const lang = (pre.dataset.lang || '').toLowerCase();
      const bar = el('span', { class: 'code-acts' }, el('button', { class: 'code-act', text: 'Save', title: 'Save as a file', dataset: { act: 'save' } }));
      if (/^(js|javascript|mjs)$/.test(lang) && /three|THREE\./.test(code)) bar.append(el('button', { class: 'code-act', text: 'Open in Three.js Lab', dataset: { act: 'three' } }));
      if (/^(glsl|frag|shader)$/.test(lang) || (/gl_FragColor|fragColor|void main\s*\(/.test(code) && !/import /.test(code))) bar.append(el('button', { class: 'code-act', text: 'Shader playground', dataset: { act: 'shader' } }));
      if (/^(jsx|extendscript)$/.test(lang) || /app\.project|CompItem|app\.beginUndoGroup/.test(code)) bar.append(el('button', { class: 'code-act', text: 'Run in After Effects', dataset: { act: 'ae' } }));
      pre.append(bar);
    }
  }

  function messageEl(m, agent, index, isLast) {
    const node = el('div', { class: `msg ${m.role}`, dataset: { raw: m.text, index }, title: m.at ? fmtDate(m.at) : '' });
    const body = el('div', { class: 'body' });
    if (m.role === 'assistant' || m.role === 'opinion') { body.innerHTML = renderMarkdown(m.text); decorateCode(body); } else body.textContent = m.text;
    if (m.role === 'opinion') node.append(el('div', { class: 'opinion-head', text: `🔎 Second opinion from ${m.from}` }));
    if (m.thinking) node.append(thinkingEl(m.thinking, false, m.thinkMs));
    for (const qa of m.qa || []) node.append(el('div', { class: 'qa-done' }, el('span', { class: 'qa-q', text: `❓ ${qa.q}` }), el('span', { class: 'qa-a', text: `→ ${qa.a}` })));
    for (const op of m.opinions || []) node.append(opinionCard(op));
    if (m.progress) node.append(progressCard(m.progress));
    for (const sh of m.shows || []) node.append(showCard(sh));
    node.append(body);
    if (m.role === 'opinion') node.append(el('div', { class: 'msg-foot' }, el('button', { class: 'msg-act primary-act', text: `Ask ${agent.name} to use it`, dataset: { msgAct: 'apply-opinion' } })));
    if (m.suggest?.length && (isLast || m.lastReply)) node.append(el('div', { class: 'suggest-chips' }, m.suggest.map((s) => el('button', { class: 'suggest-chip', text: s, dataset: { suggest: s }, title: 'Send this' }))));
    if (m.attachments?.length) node.append(el('div', { class: 'msg-attachments' }, m.attachments.map((a) => el('span', { class: 'attach-chip small', text: `${a.kind === 'image' ? '🖼' : '📄'} ${a.name}` }))));
    if (m.role === 'error' && m.needsLogin) {
      node.append(el('button', { class: 'primary login-btn', text: `Sign in to ${ENGINE_LABEL[agent.engine] || agent.engine}`, dataset: { engine: agent.engine } }));
    }
    if (m.tools?.length) node.prepend(el('div', { class: 'tool-chips', text: `Used ${[...new Set(m.tools.map(toolLabel))].join(', ')}` }));
    if (m.remembered?.length) {
      node.append(el('div', { class: 'memory-chip' }, `Saved to memory: ${m.remembered.join(' · ')} `,
        el('button', { class: 'undo-memory', text: 'Undo', dataset: { agent: agent.id, facts: JSON.stringify(m.remembered) } })));
    }
    const time = m.at ? new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const act = (name, label, title) => el('button', { class: 'msg-act', text: label, title, dataset: { msgAct: name } });
    if (m.role === 'assistant') {
      node.append(el('div', { class: 'msg-foot' },
        m.usage ? el('span', { text: `${fmt(m.usage.input)} in · ${fmt(m.usage.output)} out${m.ms ? ` · ${(m.ms / 1000).toFixed(1)}s` : ''}` }) : null,
        m.stopped ? el('span', { text: 'stopped' }) : null,
        el('span', { class: 'msg-time', text: time }),
        el('button', { class: 'copy-msg', text: 'Copy' }),
        act('quote', 'Quote', 'Quote in your next message'),
        act('branch', 'Branch', 'New chat from here: try another direction and keep this one'),
        isLast ? act('retry', 'Retry', 'Write this reply again') : null,
        isLast && agent.engine === 'claude' ? act('review', '🔍 Review', 'Ask it to check its own result critically and fix what\'s wrong') : null,
        isLast && astraAgent() && astraAgent().id !== agent.id ? act('opinion', '👁 Second opinion', `Ask ${astraAgent().name} to judge this result${agent.dock ? ' (with a screenshot)' : ''}`) : null));
    } else if (m.role === 'user') {
      node.append(el('div', { class: 'msg-foot user-foot' }, el('span', { class: 'msg-time', text: time }),
        act('edit', 'Edit', 'Edit and resend (Up arrow edits your last message)'), act('quote', 'Quote', 'Quote in your next message')));
    } else if (m.role === 'error' && isLast) {
      node.append(el('div', { class: 'msg-foot' }, act('retry', 'Retry', 'Send the last message again')));
    }
    return node;
  }

  function emptyState(agent) {
    const engineOk = H.engineStatus[agent.engine] !== false;
    return el('div', { class: 'empty' },
      el('div', { class: 'empty-icon', text: agent.icon || agent.name[0] }),
      el('h3', { text: `New chat with ${agent.name}` }),
      el('p', { class: 'hint', text: engineOk
        ? `Runs on your ${ENGINE_LABEL[agent.engine] || agent.engine} account${agent.model ? ` · ${agent.model}` : ''}. Type / for saved prompts, drop files or paste screenshots to attach them.`
        : `Couldn't find the ${agent.engine === 'claude' ? 'Claude' : 'Codex'} desktop app on this PC, so native chat can't run.` }));
  }

  function fillModelSelect(v, agent, chat) {
    const current = chat?.model || '';
    const choices = [...new Set([agent.model, ...(MODEL_CHOICES[agent.engine] || []), current].filter(Boolean))];
    v.modelSel.replaceChildren(el('option', { value: '', text: `Model: ${agent.model || 'default'}` }),
      ...choices.filter((c) => c !== agent.model).map((c) => el('option', { value: c, text: c, selected: c === current })));
  }

  async function render(agentId, { keepScroll = false } = {}) {
    const v = views.get(agentId);
    const agent = H.agent(agentId);
    if (!v || !agent) return;
    const chatId = H.activeChat[agentId];
    const chat = chatId ? await loadChat(chatId) : null;
    if (chatId && !chat) H.activeChat[agentId] = null;
    const wasNearBottom = nearBottom(v.list);
    const prevScroll = v.list.scrollTop;

    v.title.textContent = `${chat?.pinned ? '📌 ' : ''}${chat?.title || 'New chat'}`;
    const total = (chat?.messages || []).reduce((sum, m) => sum + (m.usage ? m.usage.input + m.usage.output : 0), 0);
    const folder = agent.workspace ? `edits ${agent.workspace.split(/[\\/]/).filter(Boolean).pop() || agent.workspace}` : null;
    v.meta.textContent = [folder, total ? `${fmt(total)} tokens this chat` : null].filter(Boolean).join(' · ');
    v.meta.title = agent.workspace ? `Can read and edit files in ${agent.workspace}` : '';
    paintContext(v, chat);
    v.input.placeholder = `Message ${agent.name}…  (Enter to send · Shift+Enter new line · / for prompts)`;
    fillModelSelect(v, agent, chat);
    if (!v.input.value) { v.input.value = store.get(draftKey(agentId), '') || ''; autosize(v.input); updateCounter(v); }

    v.list.replaceChildren();
    if (!chat) v.list.append(emptyState(agent));
    else {
      if (chat.imported || chat.continuedFrom) {
        v.list.append(el('div', { class: 'import-banner', text: chat.continuedFrom
          ? `Continued from a ${chat.continuedFrom} chat. ${chat.session?.id ? '' : 'Your next message sends the earlier conversation along as context.'}`
          : chat.session?.id ? `Imported from ${chat.imported}, continued here.` : `Imported from ${chat.imported}. Send a message to continue it here; the earlier conversation goes along as context.` }));
      }
      const lastIdx = chat.messages.length - 1;
      // suggestions stay on the latest reply even after a second opinion is added below it
      const lastReplyIdx = chat.messages.map((m) => m.role).lastIndexOf('assistant');
      chat.messages.forEach((m, i) => {
        if (m.compactReq) return; // the "please compact" request is shown as part of the divider
        if (m.compactSummary) { v.list.append(compactDivider(m)); return; }
        m.lastReply = i === lastReplyIdx && chat.messages.slice(i + 1).every((x) => x.role === 'opinion') && !pending.has(chat.id) ? true : undefined;
        const node = messageEl(m, agent, i, i === lastIdx && !pending.has(chat.id));
        v.list.append(node);
      });
    }

    const banner = chat && longChatBanner(agent, chat);
    if (banner) v.list.append(banner);
    const p = chat && pending.get(chat.id);
    if (p) {
      p.el = el('div', { class: 'msg assistant streaming' }, el('div', { class: 'body' }));
      paintStreaming(p);
      v.list.append(p.el);
    }
    syncSendBtn(agentId);
    renderQueue(agentId);
    // Long replies start folded so the conversation stays scannable.
    requestAnimationFrame(() => {
      for (const node of v.list.querySelectorAll('.msg.assistant:not(.streaming)')) {
        const body = node.querySelector('.body');
        if (body.scrollHeight > COLLAPSE_PX && node !== v.list.querySelector('.msg.assistant:last-of-type')) {
          node.classList.add('collapsed');
          node.append(el('button', { class: 'show-more-msg msg-act', text: 'Show full reply', dataset: { msgAct: 'more' } }));
        }
      }
      if (keepScroll && !wasNearBottom) v.list.scrollTop = prevScroll;
      else v.list.scrollTop = v.list.scrollHeight;
      v.jump.hidden = nearBottom(v.list);
    });
  }

  // The live reply: its thinking (open while it thinks), what it's doing, the text so far, and any
  // question / second-opinion cards (kept as the same DOM nodes so typed answers survive re-renders).
  function paintStreaming(p) {
    const body = p.el.querySelector('.body');
    const text = visibleText(p.text);
    if (p.thinking) {
      let th = p.el.querySelector('.thinking');
      if (!th) { th = thinkingEl('', true); p.el.prepend(th); }
      th.querySelector('.thinking-text').textContent = p.thinking.trim();
      th.querySelector('summary').textContent = text ? 'Thought process' : 'Thinking…';
      if (text && !p.thinkClosed) { th.open = false; p.thinkClosed = true; }
      if (th.open) { const tt = th.querySelector('.thinking-text'); tt.scrollTop = tt.scrollHeight; }
    }
    if (p.tools.length) {
      let chips = p.el.querySelector('.tool-chips');
      if (!chips) { chips = el('div', { class: 'tool-chips' }); body.before(chips); }
      chips.textContent = `${p.tools.length > 1 ? `Step ${p.tools.length} · ` : ''}Using ${toolLabel(p.tools.at(-1))}…`;
      chips.title = p.tools.map(toolLabel).join('\n');
    }
    body.innerHTML = text ? renderMarkdown(text) : '';
    if (!text && !p.cards.some((c) => c.classList.contains('ask-card') && !c.classList.contains('answered'))) body.insertAdjacentHTML('beforeend', '<span class="typing"><i></i><i></i><i></i></span>');
    let host = p.el.querySelector('.live-cards');
    if (!host) { host = el('div', { class: 'live-cards' }); p.el.append(host); }
    for (const c of p.cards) if (c.parentElement !== host) host.append(c);
  }
  function thinkingEl(text, open, ms) {
    const d = el('details', { class: 'thinking' }, el('summary', { text: ms ? `Thought for ${Math.max(1, Math.round(ms / 1000))} s` : 'Thought process' }), el('div', { class: 'thinking-text', text }));
    d.open = open;
    return d;
  }
  function progressCard(steps) {
    const done = steps.filter((s) => s.status === 'done').length;
    const card = el('div', { class: 'progress-card' },
      el('div', { class: 'progress-head' }, el('b', { text: 'Plan' }), el('span', { text: `${done} / ${steps.length}` }),
        el('span', { class: 'progress-bar' }, el('i'))),
      el('ol', {}, steps.map((s) => el('li', { class: `step ${s.status || 'todo'}`, text: s.text }))));
    card.style.setProperty('--pct', `${Math.round((done / (steps.length || 1)) * 100)}%`);
    return card;
  }
  function showCard(sh) {
    const url = `file:///${String(sh.path).replace(/\\/g, '/')}`;
    return el('figure', { class: 'show-card' }, el('img', { src: url, alt: sh.caption, title: 'Click to open full size', on: { click: () => window.hub.fs.open(sh.path) } }), el('figcaption', { text: sh.caption }));
  }
  function opinionCard(op) {
    return el('div', { class: 'opinion-card' }, el('div', { class: 'opinion-head', text: `🔎 ${op.from}'s second opinion${op.q ? `: ${op.q.slice(0, 80)}${op.q.length > 80 ? '…' : ''}` : ''}` }),
      el('div', { class: 'body', html: renderMarkdown(op.text || '') }));
  }
  function repaintPending(chatId) {
    const p = pending.get(chatId);
    if (!p?.el?.isConnected) return;
    const list = p.el.closest('.messages');
    const stick = nearBottom(list);
    paintStreaming(p);
    if (stick) list.scrollTop = list.scrollHeight;
  }
  function syncSendBtn(agentId) {
    const v = views.get(agentId);
    const busy = pending.has(H.activeChat[agentId]);
    if (!v) return;
    v.sendBtn.textContent = busy ? (v.input.value.trim() ? 'Queue' : 'Stop') : 'Send';
    v.sendBtn.title = busy ? (v.input.value.trim() ? 'Send this when the reply ends' : 'Stop (Esc)') : 'Send (Enter)';
    v.sendBtn.classList.toggle('stop', busy && !v.input.value.trim());
  }
  function renderQueue(agentId) {
    const v = views.get(agentId);
    if (!v) return;
    v.queueBox.hidden = !v.queue.length;
    v.queueBox.replaceChildren(...v.queue.map((q, i) => el('span', { class: 'queue-chip', title: q },
      el('span', { text: `⏳ ${q.length > 60 ? `${q.slice(0, 59)}…` : q}` }),
      el('button', { type: 'button', text: '×', title: 'Remove from the queue', on: { click: () => { v.queue.splice(i, 1); renderQueue(agentId); } } }))));
    syncSendBtn(agentId);
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

  // When the engine has no session for this chat's history (imported, edited, regenerated or
  // continued from another agent), send the earlier conversation along once.
  function withContext(chat, text) {
    if (chat.session?.id || chat.messages.length <= 1) return text;
    if (chat.compact) {
      const after = chat.messages.slice(chat.compact.index, -1).filter((m) => m.role !== 'error')
        .map((m) => `${m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from} (second opinion)` : 'Assistant'}: ${m.text}`).join('\n\n');
      return `We compacted our earlier conversation to save context. Here is your summary of it${after ? ', then what we said since' : ''}. Continue naturally.\n\n<summary>\n${chat.compact.summary}\n</summary>${after ? `\n\n<since_then>\n${after.length > CONTEXT_CHARS ? `…${after.slice(-CONTEXT_CHARS)}` : after}\n</since_then>` : ''}\n\n${text}`;
    }
    const earlier = chat.messages.slice(0, -1).filter((m) => m.role !== 'error')
      .map((m) => `${m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from} (second opinion)` : 'Assistant'}: ${m.text}`).join('\n\n');
    if (!earlier) return text;
    const trimmed = earlier.length > CONTEXT_CHARS ? `…${earlier.slice(-CONTEXT_CHARS)}` : earlier;
    const where = chat.imported ? ` (imported from ${chat.imported})` : chat.continuedFrom ? ` (from a ${chat.continuedFrom} chat)` : '';
    return `Here is our earlier conversation${where}. Continue it naturally.\n\n<earlier_conversation>\n${trimmed}\n</earlier_conversation>\n\n${text}`;
  }

  function remember(chat) {
    window.hub.saveChat(chat);
    const summary = { id: chat.id, agentId: chat.agentId, title: chat.title, updatedAt: chat.updatedAt, pinned: Boolean(chat.pinned), model: chat.model };
    H.chats = [summary, ...H.chats.filter((c) => c.id !== chat.id)];
    Panel.render();
  }

  function titleFrom(text) {
    const line = text.split('\n').find((l) => l.trim())?.trim() || 'New chat';
    return line.length > 48 ? `${line.slice(0, 47)}…` : line;
  }

  // Turns pending attachments into message text + engine options.
  function packAttachments(agentId, text) {
    const v = views.get(agentId);
    const atts = v ? v.attachments.splice(0) : [];
    if (v) renderChips(agentId);
    let full = text;
    for (const a of atts.filter((x) => x.kind === 'text')) full += `\n\n<file name="${a.name}">\n${a.content}\n</file>`;
    const files = atts.filter((x) => x.kind === 'file');
    if (files.length) full += `\n\n[Attached files, open them with your Read tool]\n${files.map((f) => f.path).join('\n')}`;
    const images = atts.filter((x) => x.kind === 'image').map((x) => x.path);
    return { full, images, meta: atts.map((a) => ({ kind: a.kind, name: a.name })) };
  }

  async function send(agentId, text, { fromHistory = false, compact = false } = {}) {
    let chatId = H.activeChat[agentId];
    if (chatId && pending.has(chatId)) throw new Error(`${H.agent(agentId).name} is still answering`);
    let chat = chatId ? await loadChat(chatId) : null;
    const now = Date.now();
    const { full, images, meta } = fromHistory ? { full: text, images: [], meta: [] } : packAttachments(agentId, text);
    if (!chat) {
      const v = views.get(agentId);
      chat = { id: `${agentId}-${now.toString(36)}`, agentId, title: titleFrom(text || meta[0]?.name || 'Attachment'), createdAt: now, updatedAt: now, session: {}, messages: [], model: v?.pendingModel || undefined };
      if (v) v.pendingModel = undefined;
      chats.set(chat.id, chat);
      H.activeChat[agentId] = chat.id;
    }
    if (!fromHistory) {
      const message = { role: 'user', text: text || '(see attachments)', at: now, ...(compact ? { compactReq: true } : {}) };
      if (meta.length) { message.attachments = meta; message.sent = full; message.images = images; }
      chat.messages.push(message);
    }
    const last = chat.messages.at(-1);
    chat.updatedAt = now;
    remember(chat);
    pending.set(chat.id, { text: '', tools: [], started: now, thinking: '', cards: [], qa: [], opinions: [], progress: null, shows: [] });
    render(agentId);
    window.hub.send({
      agentId, chatId: chat.id, session: chat.session,
      text: withContext(chat, last.sent || full || last.text),
      options: { model: chat.model || undefined, images: last.images || images },
    }).catch((err) => onEvent({ chatId: chat.id, type: 'error', message: err.message }));
  }

  function onEvent(event) {
    const p = pending.get(event.chatId);
    const chat = chats.get(event.chatId);
    if (!p || !chat) return;
    if (event.type === 'thinking') {
      if (!p.thinkStart) p.thinkStart = Date.now();
      p.thinking += event.text;
      p.thinkEnd = Date.now();
      repaintPending(event.chatId);
      return;
    }
    if (event.type === 'delta' || event.type === 'tool') {
      if (event.type === 'tool') {
        p.tools.push(event.name);
        if (p.text && !p.text.endsWith('\n\n')) p.text += '\n\n';
      } else {
        p.text += event.text;
      }
      if (p.el?.isConnected) {
        const list = p.el.closest('.messages');
        const stick = nearBottom(list);
        paintStreaming(p);
        if (stick) list.scrollTop = list.scrollHeight;
      }
      return;
    }
    pending.delete(event.chatId);
    // an unanswered question can't be answered anymore
    for (const c of p.cards) c.dispatchEvent(new Event('expire'));
    const at = Date.now();
    const extras = {};
    if (p.thinking.trim()) { extras.thinking = p.thinking.trim().slice(0, 30000); extras.thinkMs = (p.thinkEnd || at) - (p.thinkStart || p.started); }
    if (p.qa.length) extras.qa = p.qa;
    if (p.opinions.length) extras.opinions = p.opinions;
    if (p.progress) extras.progress = p.progress;
    if (p.shows.length) extras.shows = p.shows;
    let replyText = '';
    if (event.type === 'done') {
      const raw = event.text || p.text;
      const facts = [...raw.matchAll(REMEMBER_TAG)].map((m) => m[1].trim()).filter(Boolean);
      const suggest = [...raw.matchAll(SUGGEST_TAG)].map((m) => m[1].trim()).filter(Boolean).slice(0, 4);
      const message = { role: 'assistant', text: visibleText(raw), at, usage: event.usage, ms: at - p.started, ...extras, ...(suggest.length ? { suggest } : {}) };
      if (p.tools.length) message.tools = p.tools;
      if (facts.length) {
        message.remembered = facts;
        rememberFacts(chat.agentId, facts);
      }
      chat.messages.push(message);
      chat.session = event.session;
      replyText = message.text;
    } else if (event.type === 'stopped') {
      if (p.text || extras.thinking) chat.messages.push({ role: 'assistant', text: visibleText(p.text), at, stopped: true, ...extras });
      if (event.session?.id) chat.session = event.session;
    } else {
      chat.messages.push({ role: 'error', text: event.message, needsLogin: event.needsLogin, at });
      replyText = `Error: ${event.message}`;
    }
    chat.updatedAt = at;
    remember(chat);
    // whoever waited for this reply (compacting, summarize-and-continue) gets its text
    const after = afterReply.get(event.chatId);
    afterReply.delete(event.chatId);
    after?.(event.type === 'done' ? visibleText(event.text || p.text) : null);
    if (H.activeChat[chat.agentId] === chat.id) render(chat.agentId, { keepScroll: true });
    if (replyText) AppUI.replyFinished(chat.agentId, chat.id, replyText);
    if (event.type === 'done' && !after && !chat.messages.at(-1)?.compactSummary && maybeAutoCompact(chat, chat.messages.at(-1))) return;
    // messages typed while it worked go out now, one at a time
    const v = views.get(chat.agentId);
    if (v?.queue?.length && H.activeChat[chat.agentId] === chat.id && event.type !== 'stopped') {
      const next = v.queue.shift();
      renderQueue(chat.agentId);
      setTimeout(() => send(chat.agentId, next).catch((err) => toast(err.message, { type: 'error' })), 250);
    }
  }

  // ---------- compact context ----------
  // Like Claude Code's /compact: the agent summarizes the conversation, the engine session restarts, and
  // the next message carries only that summary plus what came after. The chat itself keeps every message.
  const COMPACT_PROMPT = 'Compact our context: write a summary of this conversation that you can continue from without the full history. Include the goal, the decisions and preferences I gave you, what exists now (files, sketches, layers, settings, with their exact names), what you were in the middle of, and what is left to do. Complete but compact (under 350 words), no preamble.';
  const AUTO_COMPACT_TOKENS = 110000;
  async function compactChat(agentId, { auto = false } = {}) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    if (!chat.messages.some((m) => m.role === 'assistant' && !m.compactSummary)) { toast('Nothing to compact yet', { timeout: 1500 }); return; }
    const before = [...chat.messages].reverse().find((m) => m.usage)?.usage.input || 0;
    await send(agentId, COMPACT_PROMPT, { compact: true });
    afterReply.set(chat.id, (summary) => {
      const reply = chat.messages.at(-1);
      if (!summary || reply?.role !== 'assistant') return;
      reply.compactSummary = true;
      reply.compactFrom = before;
      chat.compact = { summary, index: chat.messages.length, at: Date.now() };
      chat.session = {};
      chat.longDismissed = false;
      remember(chat);
      if (H.activeChat[agentId] === chat.id) render(agentId, { keepScroll: true });
      toast(`${auto ? 'Long task: context compacted automatically' : 'Context compacted'}${before ? ` (was ${fmt(before)} tokens per message)` : ''}`, { timeout: 3500 });
    });
  }
  function compactDivider(m) {
    return el('details', { class: 'compact-divider' },
      el('summary', { text: `🗜 Context compacted here${m.compactFrom ? ` · was ${fmt(m.compactFrom)} tokens per message` : ''} · click to read the summary` }),
      el('div', { class: 'body', html: renderMarkdown(m.text) }));
  }
  function paintContext(v, chat) {
    const last = [...(chat?.messages || [])].reverse().find((m) => m.usage);
    const n = last?.usage.input || 0;
    v.ctx.hidden = !n;
    if (!n) return;
    const pct = Math.min(100, Math.round((n / 200000) * 100));
    v.ctx.style.setProperty('--pct', `${pct}%`);
    v.ctx.classList.toggle('warn', n >= 60000);
    v.ctx.classList.toggle('high', n >= AUTO_COMPACT_TOKENS);
    v.ctx.querySelector('.ctx-text').textContent = `${fmt(n)} context`;
    v.ctx.title = `Each message now sends about ${fmt(n)} tokens of context. Click to compact it into a summary (the chat keeps every message).`;
  }
  // After a reply that pushed the context past the limit: compact on its own (agent setting, on by default).
  function maybeAutoCompact(chat, message) {
    const agent = H.agent(chat.agentId);
    if (!agent || agent.autoCompact === false || !message?.usage || message.usage.input < AUTO_COMPACT_TOKENS) return false;
    if (H.activeChat[chat.agentId] !== chat.id || views.get(chat.agentId)?.queue?.length) return false;
    setTimeout(() => compactChat(chat.agentId, { auto: true }), 400);
    return true;
  }
  // Branch: a new chat with everything up to this message, to try another direction without losing this one.
  async function branchFrom(agentId, index) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat) return;
    const now = Date.now();
    const copy = {
      id: `${agentId}-${now.toString(36)}`, agentId, title: `${chat.title} (branch)`, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: `"${chat.title}"`, model: chat.model,
      messages: chat.messages.slice(0, index + 1).map((m) => ({ ...m, lastReply: undefined })),
      ...(chat.compact && chat.compact.index <= index + 1 ? { compact: { ...chat.compact } } : {}),
    };
    chats.set(copy.id, copy);
    remember(copy);
    open(agentId, copy.id);
    toast('Branched: this chat continues from that message; the original is unchanged', { timeout: 3000 });
  }

  // ---------- long chats: summarize and continue fresh ----------
  // Every message re-sends the whole conversation; past ~80k tokens a fresh chat that starts from a short
  // summary is much cheaper. A banner offers it; afterReply catches the summary.
  const afterReply = new Map(); // chat id -> fn(text | null) when its reply ends
  const LONG_CHAT_TOKENS = 80000;
  const SUMMARY_PROMPT = 'We are moving to a fresh chat to save tokens. Write a compact summary of this conversation that you could continue from: the goal, what we decided, what exists now (files, sketches, layers, settings with their names), and what is left to do. Under 250 words, no preamble.';
  async function summarizeAndContinue(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    await send(agentId, SUMMARY_PROMPT);
    afterReply.set(chat.id, (summary) => {
      if (!summary) return;
      const now = Date.now();
      const fresh = {
        id: `${agentId}-${now.toString(36)}`, agentId, title: `${chat.title.replace(/ \(continued\)$/, '')} (continued)`, createdAt: now, updatedAt: now,
        session: {}, continuedFrom: 'summary of the earlier chat', model: chat.model,
        messages: [{ role: 'assistant', text: `**Where we are** (summary of "${chat.title}")\n\n${summary}`, at: now }],
      };
      chats.set(fresh.id, fresh);
      remember(fresh);
      open(agentId, fresh.id);
      toast('Continuing in a fresh chat from the summary (the old chat stays in the list)', { timeout: 4000 });
    });
  }
  function longChatBanner(agent, chat) {
    const last = [...(chat?.messages || [])].reverse().find((m) => m.usage);
    if (!last || last.usage.input < LONG_CHAT_TOKENS || chat.longDismissed || pending.has(chat.id)) return null;
    return el('div', { class: 'long-chat' },
      el('span', { text: `This chat now sends about ${fmt(last.usage.input)} tokens with every message.` }),
      el('button', { class: 'primary small', text: '🗜 Compact context', title: 'It summarizes the conversation; this chat continues from the summary (every message stays visible)', on: { click: () => compactChat(agent.id) } }),
      el('button', { class: 'ghost small', text: 'New chat from a summary', title: 'It writes a short summary, then a new chat continues from it', on: { click: () => summarizeAndContinue(agent.id) } }),
      el('button', { class: 'ghost small', text: 'Keep going', on: { click: () => { chat.longDismissed = true; remember(chat); render(agent.id, { keepScroll: true }); } } }));
  }

  // ---------- talking back: questions and second opinions (mcp/chat-mcp.js → HubBridge) ----------
  const astraAgent = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && /astra/i.test(a.name))
    || H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  const pendingFor = (agentId) => [...pending.keys()].find((id) => chats.get(id)?.agentId === agentId);
  async function headsUp(agentId, chatId, text) {
    const agent = H.agent(agentId);
    const onScreen = H.surfaceIdFor(H.activeId) === H.surfaceIdFor(agentId) && H.activeChat[agentId] === chatId && !document.body.classList.contains('lab-focus');
    const focused = await window.hub.isWindowFocused();
    if (onScreen && focused) return;
    const note = toast(`${agent?.name || 'An agent'} ${text}`, { timeout: 15000, action: { label: 'Open', fn: () => { document.querySelector('.lab-focus-exit')?.click(); open(agentId, chatId); } } });
    if (!focused) {
      window.hub.flashWindow();
      const n = new Notification(`${agent?.name || 'Hearth'} ${text.split(':')[0]}`, { body: text, silent: false });
      n.onclick = () => { window.hub.showWindow(); open(agentId, chatId); };
    }
    return note;
  }
  // A question card in the live reply; resolves with the answer (or a skip / stop note).
  function askUser(agentId, { question, options = [], multiple = false, free = true }) {
    const chatId = pendingFor(agentId);
    const p = chatId && pending.get(chatId);
    if (!p) return Promise.resolve({ ok: false, error: 'There is no reply in progress to ask from.' });
    return new Promise((resolve) => {
      const picked = new Set();
      let noteP = Promise.resolve(null);
      const text = el('textarea', { class: 'ask-text', rows: 2, placeholder: options.length ? 'Or type your own answer…' : 'Your answer…' });
      const card = el('div', { class: 'ask-card' });
      const done = (answer, label = answer) => {
        if (card.classList.contains('answered')) return;
        card.classList.add('answered');
        card.replaceChildren(el('span', { class: 'qa-q', text: `❓ ${question}` }), el('span', { class: 'qa-a', text: `→ ${label}` }));
        p.qa.push({ q: question, a: label });
        noteP.then((n) => n?.remove());
        resolve({ ok: true, value: answer });
        repaintPending(chatId);
      };
      const optBtns = options.map((o) => el('button', { type: 'button', class: 'ask-opt', text: o, on: { click: (e) => {
        if (!multiple) { done(o); return; }
        if (picked.has(o)) picked.delete(o); else picked.add(o);
        e.currentTarget.classList.toggle('on', picked.has(o));
      } } }));
      const sendIt = () => {
        const typed = text.value.trim();
        const parts = [...picked, ...(typed ? [typed] : [])];
        if (!parts.length) { text.focus(); return; }
        done(parts.join('; '));
      };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendIt(); } });
      card.append(el('div', { class: 'ask-q', text: question }),
        optBtns.length ? el('div', { class: 'ask-opts' }, optBtns) : null,
        free !== false || multiple ? el('div', { class: 'ask-row' }, free !== false ? text : null,
          el('button', { type: 'button', class: 'primary small', text: multiple ? 'Send choices' : 'Answer', on: { click: sendIt } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Skip', title: 'Let it decide', on: { click: () => done('(The user skipped this question: use your best judgment.)', 'skipped') } })) : null);
      card.addEventListener('expire', () => done('(The reply ended before the user answered.)', 'not answered'));
      p.cards.push(card);
      repaintPending(chatId);
      setTimeout(() => (text.isConnected ? text : optBtns[0])?.focus?.(), 50);
      noteP = headsUp(agentId, chatId, `asks you: ${question}`);
    });
  }
  // What the user is looking at, as an image file for the second opinion.
  async function screenshotFor(agent) {
    try {
      if (agent?.dock === 'three' && typeof ThreeLab !== 'undefined') {
        const url = await ThreeLab.shot?.();
        if (url) return await window.hub.saveAttachment(`lab-${Date.now()}.png`, url.split(',')[1]);
      }
      return await window.hub.captureWindow();
    } catch { return null; }
  }
  async function askAstra(agentId, question, { screenshot = false } = {}) {
    const agent = H.agent(agentId);
    const astra = astraAgent();
    if (!astra) return { ok: false, error: 'No Astra (ChatGPT / Codex) agent is set up in the hub.' };
    const img = screenshot ? await screenshotFor(agent) : null;
    const text = `${question}\n\n[You are giving a second opinion to ${agent?.name || 'another AI'}, which is working on this for the user.${img ? ' The attached image is what the user sees right now.' : ''} Be concise and concrete: what works, what doesn't, and the 3 changes that would help most.]`;
    const r = await window.hub.askOnce({ agentId: astra.id, text, images: img ? [img] : [] });
    return r.ok ? { ok: true, from: astra.name, text: r.text } : r;
  }
  HubBridge.register(['chat_'], async (tool, args) => {
    const agentId = args.agentId;
    if (tool === 'chat_ask') {
      const opts = Array.isArray(args.options) ? args.options.map(String).filter(Boolean).slice(0, 8) : [];
      return askUser(agentId, { question: String(args.question || '').slice(0, 600), options: opts, multiple: Boolean(args.multiple), free: args.free !== false });
    }
    if (tool === 'chat_progress') {
      const chatId = pendingFor(agentId);
      const p = chatId && pending.get(chatId);
      if (!p) return { ok: false, error: 'No reply in progress.' };
      const steps = (Array.isArray(args.steps) ? args.steps : []).slice(0, 12).map((s) => (typeof s === 'string' ? { text: s, status: 'todo' } : { text: String(s.text || '').slice(0, 160), status: ['todo', 'doing', 'done'].includes(s.status) ? s.status : 'todo' }));
      p.progress = steps;
      const card = progressCard(steps);
      card.style.setProperty('--pct', `${Math.round((steps.filter((s) => s.status === 'done').length / (steps.length || 1)) * 100)}%`);
      const old = p.cards.find((c) => c.classList.contains('progress-card'));
      if (old) { p.cards[p.cards.indexOf(old)] = card; old.replaceWith(card); } else p.cards.unshift(card);
      repaintPending(chatId);
      return { ok: true, value: 'Shown.' };
    }
    if (tool === 'chat_show') {
      const chatId = pendingFor(agentId);
      const p = chatId && pending.get(chatId);
      if (!p) return { ok: false, error: 'No reply in progress.' };
      const path = await screenshotFor(H.agent(agentId));
      if (!path) return { ok: false, error: 'Could not take the screenshot.' };
      const sh = { caption: String(args.caption || '').slice(0, 200), path };
      p.shows.push(sh);
      p.cards.push(showCard(sh));
      repaintPending(chatId);
      return { ok: true, value: 'Shown to the user.' };
    }
    if (tool === 'chat_second_opinion') {
      const chatId = pendingFor(agentId);
      const p = chatId && pending.get(chatId);
      const r = await askAstra(agentId, String(args.question || ''), { screenshot: Boolean(args.screenshot) });
      if (!r.ok) return r;
      if (p) { p.opinions.push({ from: r.from, q: String(args.question || ''), text: r.text }); p.cards.push(opinionCard(p.opinions.at(-1))); repaintPending(chatId); }
      return { ok: true, value: `${r.from} says:\n${r.text}` };
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  });
  // The 👁 button: Astra judges the last reply (with a screenshot for docked tools); its answer joins the chat.
  async function secondOpinion(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    const agent = H.agent(agentId);
    if (!chat || pending.has(chat.id)) return;
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user')?.text || '';
    const replyMsg = [...chat.messages].reverse().find((m) => m.role === 'assistant');
    const asked = replyMsg?.qa?.length ? `\n(While working it asked the user: ${replyMsg.qa.map((x) => `"${x.q}" → ${x.a}`).join('; ')})` : '';
    const offered = replyMsg?.suggest?.length ? `\n(It offered these next steps as buttons: ${replyMsg.suggest.join(' | ')})` : '';
    const lastReply = `${replyMsg?.text || ''}${asked}${offered}`;
    const t = toast(`Asking ${astraAgent()?.name || 'Astra'} for a second opinion…`, { timeout: 60000 });
    const r = await askAstra(agentId, `The user asked ${agent.name}: "${lastUser.slice(0, 2000)}"\n\n${agent.name} answered: "${lastReply.slice(0, 4000)}"\n\nGive your second opinion on the result.`, { screenshot: Boolean(agent.dock) });
    t?.remove();
    if (!r.ok) { toast(r.error || 'No answer', { type: 'error' }); return; }
    chat.messages.push({ role: 'opinion', from: r.from, text: r.text, at: Date.now() });
    remember(chat);
    if (H.activeChat[agentId] === chat.id) render(agentId);
  }

  // ---------- message actions ----------
  // Editing or regenerating rewrites history, so the chat continues in a fresh engine session
  // with the remaining conversation sent along as context.
  async function editMessage(agentId, index) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    const original = chat.messages[index];
    if (chat.compact && index < chat.compact.index) delete chat.compact;
    const next = await Modal.prompt('Edit message', { value: original.text, multiline: true, label: 'Everything after this message will be replaced by a new reply.' });
    if (next == null || !next.trim()) return;
    chat.messages = chat.messages.slice(0, index);
    chat.messages.push({ ...original, text: next.trim(), sent: original.sent ? original.sent.replace(original.text, next.trim()) : undefined, at: Date.now(), edited: true });
    chat.session = {};
    await send(agentId, next.trim(), { fromHistory: true });
  }

  async function regenerate(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat || pending.has(chat.id)) return;
    const lastUser = chat.messages.map((m) => m.role).lastIndexOf('user');
    if (lastUser < 0) return;
    if (chat.compact && lastUser < chat.compact.index) delete chat.compact;
    chat.messages = chat.messages.slice(0, lastUser + 1);
    chat.session = {};
    await send(agentId, chat.messages[lastUser].text, { fromHistory: true });
  }

  function quote(agentId, index) {
    const chat = chats.get(H.activeChat[agentId]);
    const v = views.get(agentId);
    const text = chat?.messages[index]?.text || '';
    const quoted = text.split('\n').slice(0, 30).map((l) => `> ${l}`).join('\n');
    v.input.value = `${quoted}\n\n${v.input.value}`;
    autosize(v.input);
    v.input.focus();
    v.input.setSelectionRange(v.input.value.length, v.input.value.length);
  }

  // ---------- chat-level actions ----------
  function chatMarkdown(chat) {
    const agent = H.agent(chat.agentId);
    return `# ${chat.title}\n\n_${agent?.name || chat.agentId} · ${fmtDate(chat.createdAt)}_\n\n${chat.messages.filter((m) => m.role !== 'error')
      .map((m) => `**${m.role === 'user' ? 'You' : m.role === 'opinion' ? `${m.from} (second opinion)` : agent?.name || 'Assistant'}:**\n\n${m.text}`).join('\n\n---\n\n')}\n`;
  }

  async function chatMenu(agentId, e) {
    const chat = chats.get(H.activeChat[agentId]);
    const others = H.agents().filter((a) => a.mode === 'native' && a.id !== agentId);
    const items = chat ? [
      { label: chat.pinned ? 'Unpin' : 'Pin to top', action: () => togglePin(chat.id) },
      { label: 'Rename…', action: () => renameCurrent(agentId) },
      { label: '🗜 Compact context', action: () => compactChat(agentId) },
      { label: 'Copy as Markdown', action: () => copyText(chatMarkdown(chat), 'Chat copied') },
      { label: 'Export as Markdown file…', action: async () => { const p = await window.hub.saveFile({ defaultPath: `${chat.title.replace(/[\\/:*?"<>|]/g, '_')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: chatMarkdown(chat) }); if (p) toast('Chat exported', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }); } },
      ...others.map((a) => ({ label: `Continue with ${a.name}`, action: () => continueWith(chat.id, a.id) })),
      { label: 'Delete chat', danger: true, action: async () => { if (await Modal.confirm('Delete chat?', `"${chat.title}" moves to Recently deleted (Ctrl+K → Recently deleted chats) for 30 days.`, { ok: 'Delete', danger: true })) remove(chat.id); } },
    ] : [{ label: 'Start by sending a message', action: () => views.get(agentId).input.focus() }];
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, items);
  }

  async function togglePin(chatId) {
    const chat = await loadChat(chatId);
    if (!chat) return;
    chat.pinned = !chat.pinned;
    remember(chat);
    if (H.activeChat[chat.agentId] === chatId) render(chat.agentId, { keepScroll: true });
  }

  async function renameCurrent(agentId) {
    const chat = chats.get(H.activeChat[agentId]);
    if (!chat) return;
    const title = await Modal.prompt('Rename chat', { value: chat.title });
    if (title) rename(chat.id, title);
  }

  async function setChatModel(agentId, model) {
    const chat = chats.get(H.activeChat[agentId]);
    const v = views.get(agentId);
    if (!chat) { v.pendingModel = model; toast(model ? `This new chat will use ${model}` : 'Using the agent\'s default model', { timeout: 1600 }); return; }
    chat.model = model || undefined;
    remember(chat);
    toast(model ? `This chat now uses ${model}` : 'This chat uses the agent\'s default model', { timeout: 1600 });
  }

  // Copies a chat to another native agent; the next message sends the history along as context.
  async function continueWith(chatId, targetId) {
    const chat = await loadChat(chatId);
    const from = H.agent(chat.agentId);
    const now = Date.now();
    const copy = {
      id: `${targetId}-${now.toString(36)}`, agentId: targetId, title: chat.title, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: from?.name || chat.agentId,
      messages: chat.messages.filter((m) => m.role !== 'error').map(({ role, text, at }) => ({ role, text, at })),
    };
    chats.set(copy.id, copy);
    remember(copy);
    open(targetId, copy.id);
  }

  function open(agentId, chatId) {
    H.activeChat[agentId] = chatId;
    activate(agentId);
    render(agentId);
    Panel.highlight();
  }

  function newChat(agentId) {
    H.activeChat[agentId] = null;
    const v = views.get(agentId);
    if (v) v.input.value = '';
    render(agentId);
    Panel.highlight();
    focus(agentId);
  }

  function focus(agentId) { views.get(agentId)?.input.focus(); }

  function setDraft(agentId, text) {
    const v = views.get(agentId);
    if (!v) return;
    v.input.value = text;
    autosize(v.input);
    updateCounter(v);
    v.input.focus();
    v.input.setSelectionRange(text.length, text.length);
  }

  async function rename(chatId, title) {
    const chat = await loadChat(chatId);
    if (!chat || !title.trim()) return;
    chat.title = title.trim().slice(0, 80);
    remember(chat);
    if (H.activeChat[chat.agentId] === chatId) render(chat.agentId, { keepScroll: true });
  }

  async function remove(chatId) {
    const summary = H.chats.find((c) => c.id === chatId);
    if (pending.has(chatId)) window.hub.stop(chatId);
    await window.hub.deleteChat(chatId);
    chats.delete(chatId);
    H.chats = H.chats.filter((c) => c.id !== chatId);
    if (summary && H.activeChat[summary.agentId] === chatId) newChat(summary.agentId);
    Panel.render();
    toast(`Deleted "${summary?.title || 'chat'}"`, { action: { label: 'Undo', fn: async () => { await window.hub.restoreChat(chatId); H.chats = await window.hub.listChats(); Panel.render(); } } });
  }

  window.hub.onEngineEvent(onEvent);

  return {
    mount, refresh: render, focus, send, open, newChat, rename, remove, togglePin, setDraft, continueWith,
    attachPaths: async (agentId, paths) => { for (const p of paths) await addPath(agentId, p); },
    isBusy: (chatId) => pending.has(chatId),
    markdownOf: async (chatId) => chatMarkdown(await loadChat(chatId)),
  };
})();
