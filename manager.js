// Add / edit / remove agents from inside the app. Everything is saved to config.json.
const Manager = (() => {
  const PRESETS = [
    { name: 'Claude', mode: 'native', engine: 'claude', model: 'sonnet', color: '#d97757', icon: 'C', url: 'https://claude.ai/new' },
    { name: 'Astra', mode: 'native', engine: 'codex', color: '#10a37f', icon: 'A', url: 'https://chatgpt.com/' },
    // Astra variants (persona presets; the same Codex engine and ChatGPT login)
    { name: 'Astra Coder', mode: 'native', engine: 'codex', color: '#19c39c', icon: '✦', effort: 'high', systemPrompt: 'You are Astra Coder, a senior software engineer chatting with the user in their desktop app. Give working, minimal code with short explanations; point out edge cases and how to test it.', askAll: false },
    { name: 'Astra Reviewer', mode: 'native', engine: 'codex', color: '#7c8cff', icon: '✦', effort: 'high', systemPrompt: 'You are Astra Reviewer. Find the real problems in what the user shows you (bugs, unclear parts, risks), ranked by importance, and say how to fix each. No praise padding.', askAll: false },
    { name: 'Astra Researcher', mode: 'native', engine: 'codex', color: '#4fb3ff', icon: '✦', effort: 'medium', webSearch: 'cached', systemPrompt: 'You are Astra Researcher. Separate facts from guesses, say how sure you are, compare options with pros and cons, and say where facts come from.', askAll: false },
    { name: 'Astra Quick', mode: 'native', engine: 'codex', color: '#19c39c', icon: '✦', effort: 'low', verbosity: 'low', systemPrompt: 'You are Astra Quick. Answer as briefly as possible: the answer first, no preamble.', askAll: false },
    { name: 'Forge Debug', mode: 'native', engine: 'claude', color: '#e07a2f', icon: '⚒', gameTools: true, companion: 'forge-game', askAll: false },
    { name: 'Claude', mode: 'web', color: '#d97757', icon: 'C', url: 'https://claude.ai/new' },
    { name: 'ChatGPT', mode: 'web', color: '#10a37f', icon: 'G', url: 'https://chatgpt.com/' },
    { name: 'Kimi', mode: 'web', color: '#4f8cff', icon: 'K', url: 'https://www.kimi.com/' },
    { name: 'DeepSeek', mode: 'web', color: '#8b7bff', icon: 'D', url: 'https://chat.deepseek.com/' },
    { name: 'Gemini', mode: 'web', color: '#4285f4', icon: 'G', url: 'https://gemini.google.com/app' },
    { name: 'Perplexity', mode: 'web', color: '#20b8cd', icon: 'P', url: 'https://www.perplexity.ai/' },
    { name: 'Grok', mode: 'web', color: '#c8c8c8', icon: 'X', url: 'https://grok.com/' },
    { name: 'Le Chat', mode: 'web', color: '#ff7000', icon: 'M', url: 'https://chat.mistral.ai/chat' },
    { name: 'Copilot', mode: 'web', color: '#2f8fdd', icon: 'Co', url: 'https://copilot.microsoft.com/' },
    { name: 'Qwen', mode: 'web', color: '#615ced', icon: 'Q', url: 'https://chat.qwen.ai/' },
  ];
  const MODEL_HINTS = { claude: ['sonnet', 'opus', 'fable', 'haiku'], codex: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'] };
  const ENGINE_HINTS = {
    claude: 'Uses the Claude Code engine inside your Claude desktop app, signed in with your Claude account. Counts toward your plan\'s usage limits.',
    codex: 'Uses the Codex engine inside your Codex app, signed in with your ChatGPT account. Counts toward your plan\'s usage limits.',
  };

  const dialog = $('agent-dialog');
  const form = $('agent-form');
  const f = form.elements;
  let editingId = null;

  form.preset.replaceChildren(new Option('Custom website', ''), ...PRESETS.map((p, i) => (
    new Option(`${p.name}: ${p.mode === 'native' ? 'native chat' : new URL(p.url).hostname}`, String(i))
  )));

  let connectorModes = {}; // connector name -> 'read' | 'full' (absent = off)

  // ---- Astra (Codex) options, built here so index.html stays as it is: web search, answer length, and
  // what its opt-in file access may do. File access, talk-back and thinking rows are shared with Claude.
  const astraBox = el('div', { class: 'grid2 astra-opts', dataset: { engine: 'codex' } },
    el('label', {}, 'Web search', el('select', { name: 'webSearch' }, el('option', { value: '', text: 'Off' }), el('option', { value: 'cached', text: 'Cached (cheaper)' }), el('option', { value: 'live', text: 'Live' }))),
    el('label', {}, 'Answer length', el('select', { name: 'verbosity' }, el('option', { value: '', text: 'Default' }), el('option', { value: 'low', text: 'Short' }), el('option', { value: 'medium', text: 'Medium' }), el('option', { value: 'high', text: 'Detailed' }))));
  const fileMode = el('select', { name: 'codexFiles', title: 'What Astra may do in the folder' }, el('option', { value: '', text: 'Read only' }), el('option', { value: 'edit', text: 'Read + edit' }));
  form.querySelector('[name="chatgptApps"]')?.closest('label')?.before(astraBox);
  form.querySelector('#clear-folder')?.after(fileMode);
  const fileHint = form.querySelector('.file-access .hint');
  const CLAUDE_FILE_HINT = fileHint?.textContent || '';
  const SHARED = ['.file-access', 'label:has(> input[name="chatTools"])', 'label:has(> input[name="showThinking"])'];
  const EXTRA_EFFORTS = { minimal: 'Minimal: fewest tokens (Astra)', xhigh: 'Extra high: most reasoning (Astra)' };
  function syncAstraFields(engine) {
    const codex = engine === 'codex';
    for (const sel of SHARED) for (const n of form.querySelectorAll(sel)) n.hidden = f.mode.value !== 'native' ? n.hidden : false;
    fileMode.hidden = !codex;
    if (fileHint) {
      fileHint.textContent = codex
        ? 'Lets Astra look at files in this folder with read-only commands inside Codex\'s sandbox (no network); "Read + edit" also lets it change files there. Codex can read other folders too, so pick read-only unless you need edits. Adds the shell tool to each message.'
        : CLAUDE_FILE_HINT;
    }
    const talk = form.querySelector('input[name="chatTools"]')?.closest('label');
    if (talk) {
      talk.title = codex ? 'Off by default for Astra: the tools add their descriptions to every Codex message' : '';
      const text = [...talk.childNodes].find((n) => n.nodeType === 3 && /Talks back/.test(n.textContent));
      if (text) text.textContent = text.textContent.replace(/opinion from (Astra|Claude)/, `opinion from ${codex ? 'Claude' : 'Astra'}`);
    }
    for (const [value, text] of Object.entries(EXTRA_EFFORTS)) {
      let opt = f.effort.querySelector(`option[value="${value}"]`);
      if (codex && !opt) { opt = el('option', { value, text }); if (value === 'minimal') f.effort.options[1].before(opt); else f.effort.append(opt); }
      if (!codex && opt) { if (f.effort.value === value) f.effort.value = ''; opt.remove(); }
    }
  }

  function syncModeFields() {
    const mode = f.mode.value;
    for (const node of form.querySelectorAll('[data-for]')) node.hidden = node.dataset.for !== mode;
    for (const node of form.querySelectorAll('[data-engine]')) node.hidden = node.dataset.engine !== f.engine.value;
    if (mode === 'native') syncAstraFields(f.engine.value);
    f.url.required = mode === 'web';
    $('engine-hint').textContent = ENGINE_HINTS[f.engine.value];
    $('model-hints').replaceChildren(...(MODEL_HINTS[f.engine.value] || []).map((m) => new Option(m)));
    if (mode === 'native' && f.engine.value === 'claude') loadConnectors();
  }

  function renderConnectors(info) {
    const list = $('connector-list');
    list.replaceChildren();
    if (!info?.servers.length) {
      list.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'No connected apps found. Add them at claude.ai → Settings → Connectors, then press Refresh.' }));
      return;
    }
    for (const server of info.servers) {
      const row = document.createElement('div');
      row.className = 'connector';
      const name = document.createElement('span');
      name.className = 'connector-name';
      name.textContent = server.name.replace(/^claude\.ai\s+/, '');
      const detail = document.createElement('span');
      detail.className = 'hint';
      detail.textContent = server.status === 'connected'
        ? `${server.readTools} read / ${server.tools} tools`
        : 'needs sign-in at claude.ai → Settings → Connectors';
      const select = document.createElement('select');
      select.append(new Option('Off', ''), new Option('Read-only', 'read'), new Option('Full', 'full'));
      select.value = connectorModes[server.name] || '';
      select.disabled = server.status !== 'connected' && !connectorModes[server.name];
      select.addEventListener('change', () => {
        if (select.value) connectorModes[server.name] = select.value;
        else delete connectorModes[server.name];
      });
      row.append(name, detail, select);
      list.append(row);
    }
  }

  async function loadConnectors(refresh = false) {
    const btn = $('refresh-connectors');
    let info = refresh ? null : await window.hub.getConnectors();
    if (!info) {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      info = await window.hub.refreshConnectors();
      btn.disabled = false;
      btn.textContent = 'Refresh';
    }
    renderConnectors(info);
  }

  function fill(agent) {
    f.name.value = agent.name || '';
    f.icon.value = agent.icon || '';
    f.color.value = /^#[0-9a-f]{6}$/i.test(agent.color || '') ? agent.color : '#7c5cff';
    f.mode.value = agent.mode || 'web';
    f.url.value = agent.url || '';
    f.engine.value = agent.engine || 'claude';
    f.model.value = agent.model || '';
    syncAstraFields(f.engine.value); // Astra's extra effort levels must exist before the value is set
    f.effort.value = agent.effort || '';
    f.webSearch.value = agent.webSearch && agent.webSearch !== 'disabled' ? agent.webSearch : '';
    f.verbosity.value = agent.verbosity || '';
    f.codexFiles.value = agent.codexFiles === 'edit' ? 'edit' : '';
    f.systemPrompt.value = agent.systemPrompt || '';
    f.askAll.checked = agent.askAll !== false;
    f.chatgptApps.checked = Boolean(agent.chatgptApps);
    f.autoMemory.checked = agent.autoMemory !== false;
    f.workspace.value = agent.workspace || '';
    f.gameTools.checked = Boolean(agent.gameTools);
    f.chatTools.checked = agent.engine === 'codex' ? agent.chatTools === true : agent.chatTools !== false;
    f.showThinking.checked = agent.showThinking !== false;
    f.selfReview.checked = agent.selfReview ?? Boolean(agent.dock);
    f.autoCompact.checked = agent.autoCompact !== false;
    connectorModes = { ...agent.connectors };
    syncModeFields();
  }

  function open(id = null) {
    editingId = id;
    const agent = id ? H.agent(id) : { mode: 'web' };
    $('dialog-title').textContent = id ? `Edit ${agent.name}` : 'Add agent';
    $('preset-row').hidden = Boolean(id);
    $('delete-agent').hidden = !id;
    form.preset.value = '';
    fill(agent);
    dialog.showModal();
    f.name.focus();
  }

  function uniqueId(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
    let id = base;
    for (let n = 2; H.config.agents.some((a) => a.id === id); n += 1) id = `${base}-${n}`;
    return id;
  }

  function save() {
    const existing = editingId ? H.agent(editingId) : null;
    const agent = {
      ...existing,
      id: existing?.id || uniqueId(f.name.value),
      name: f.name.value.trim(),
      icon: f.icon.value.trim() || f.name.value.trim()[0].toUpperCase(),
      color: f.color.value,
      mode: f.mode.value,
      url: f.url.value.trim() || existing?.url || '',
      askAll: f.askAll.checked,
    };
    if (agent.mode === 'native') {
      Object.assign(agent, {
        engine: f.engine.value,
        model: f.model.value.trim() || undefined,
        effort: f.effort.value || undefined,
        systemPrompt: f.systemPrompt.value.trim() || undefined,
        connectors: f.engine.value === 'claude' && Object.keys(connectorModes).length ? { ...connectorModes } : undefined,
        chatgptApps: f.engine.value === 'codex' && f.chatgptApps.checked ? true : undefined,
        workspace: f.workspace.value || undefined,
        codexFiles: f.engine.value === 'codex' && f.workspace.value && f.codexFiles.value === 'edit' ? 'edit' : undefined,
        webSearch: f.engine.value === 'codex' && f.webSearch.value ? f.webSearch.value : undefined,
        verbosity: f.engine.value === 'codex' && f.verbosity.value ? f.verbosity.value : undefined,
        gameTools: f.engine.value === 'claude' && f.gameTools.checked ? true : undefined,
        companion: f.engine.value === 'claude' && f.gameTools.checked ? 'forge-game' : undefined,
        autoMemory: f.autoMemory.checked ? undefined : false,
        // talk-back tools: on unless switched off for Claude, off unless switched on for Astra (tokens)
        chatTools: f.engine.value === 'claude' ? (f.chatTools.checked ? undefined : false) : (f.chatTools.checked ? true : undefined),
        showThinking: f.showThinking.checked ? undefined : false,
        selfReview: f.engine.value === 'claude' ? f.selfReview.checked : undefined,
        autoCompact: f.autoCompact.checked ? undefined : false,
      });
    }
    if (existing) H.config.agents[H.config.agents.indexOf(existing)] = agent;
    else H.config.agents.push(agent);
    H.activeId = agent.id;
    saveConfig();
  }

  function remove(id) {
    const agent = H.agent(id);
    if (!agent) return;
    const note = agent.mode === 'native'
      ? 'Its chats stay saved and come back if you add it again with the same name.'
      : 'Your login for this site is kept.';
    if (!confirm(`Remove ${agent.name} from the hub? ${note}`)) return;
    H.config.agents = H.config.agents.filter((a) => a.id !== id);
    saveConfig();
  }

  form.preset.addEventListener('change', () => {
    const preset = PRESETS[Number(form.preset.value)];
    if (preset) fill(preset);
  });
  f.mode.addEventListener('change', syncModeFields);
  f.engine.addEventListener('change', syncModeFields);
  $('refresh-connectors').addEventListener('click', () => loadConnectors(true));
  $('pick-folder').addEventListener('click', async () => {
    const folder = await window.hub.pickFolder(f.workspace.value);
    if (folder) f.workspace.value = folder;
  });
  $('clear-folder').addEventListener('click', () => { f.workspace.value = ''; });
  $('cancel-agent').addEventListener('click', () => dialog.close());
  $('delete-agent').addEventListener('click', () => { dialog.close(); remove(editingId); });
  form.addEventListener('submit', (e) => {
    if (!form.reportValidity()) { e.preventDefault(); return; }
    save();
  });

  return { open, remove };
})();
