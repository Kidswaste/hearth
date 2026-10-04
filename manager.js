// Add / edit / remove agents from inside the app. Everything is saved to config.json.
const Manager = (() => {
  const PRESETS = [
    { name: 'Claude', mode: 'native', engine: 'claude', model: 'sonnet', color: '#d97757', icon: 'C', url: 'https://claude.ai/new' },
    { name: 'Astra', mode: 'native', engine: 'codex', color: '#10a37f', icon: 'A', url: 'https://chatgpt.com/' },
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
    claude: 'Uses the Claude Code engine inside your Claude desktop app, signed in with your Claude Pro account. Counts toward your Pro usage limits.',
    codex: 'Uses the Codex engine inside your Codex app, signed in with your ChatGPT Plus account. Counts toward your Plus usage limits.',
  };

  const dialog = $('agent-dialog');
  const form = $('agent-form');
  const f = form.elements;
  let editingId = null;

  form.preset.replaceChildren(new Option('Custom website', ''), ...PRESETS.map((p, i) => (
    new Option(`${p.name}: ${p.mode === 'native' ? 'native chat' : new URL(p.url).hostname}`, String(i))
  )));

  function syncModeFields() {
    const mode = f.mode.value;
    for (const node of form.querySelectorAll('[data-for]')) node.hidden = node.dataset.for !== mode;
    f.url.required = mode === 'web';
    $('engine-hint').textContent = ENGINE_HINTS[f.engine.value];
    $('model-hints').replaceChildren(...(MODEL_HINTS[f.engine.value] || []).map((m) => new Option(m)));
  }

  function fill(agent) {
    f.name.value = agent.name || '';
    f.icon.value = agent.icon || '';
    f.color.value = /^#[0-9a-f]{6}$/i.test(agent.color || '') ? agent.color : '#7c5cff';
    f.mode.value = agent.mode || 'web';
    f.url.value = agent.url || '';
    f.engine.value = agent.engine || 'claude';
    f.model.value = agent.model || '';
    f.effort.value = agent.effort || '';
    f.systemPrompt.value = agent.systemPrompt || '';
    f.askAll.checked = agent.askAll !== false;
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
  $('cancel-agent').addEventListener('click', () => dialog.close());
  $('delete-agent').addEventListener('click', () => { dialog.close(); remove(editingId); });
  form.addEventListener('submit', (e) => {
    if (!form.reportValidity()) { e.preventDefault(); return; }
    save();
  });

  return { open, remove };
})();
