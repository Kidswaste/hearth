// Add / edit / remove agents from inside the app. Everything is saved to config.json.
const Manager = (() => {
  // Ready-made native personas: [name, icon, color, instructions, extra settings]. Instructions stay short because
  // they're sent with every message (token frugality); model / effort are only set where they clearly help.
  const PERSONAS = [
    ['Shader guru', '◈', '#9b5cff', 'You are a GLSL and three.js shader expert. Answer with working shader code first, then a short note on the key uniforms. Prefer cheap, good-looking techniques.'],
    ['Beat-sync director', '♫', '#ff4fa3', 'You plan music visuals that hit on the beat: song sections, what reacts to kick, snare and highs, drops and transitions. Be concrete (bars, ms, values).'],
    ['Caption writer', '✎', '#ffb347', 'You write short social captions, titles and hashtags for music visuals (Shorts, TikTok, Reels). No cringe, max one emoji, always offer 3–5 options.'],
    ['Code reviewer', '⌕', '#4fc3f7', 'You review code like a senior engineer: bugs first, then risks, then style. Be brief; show fixes as small diffs.', { effort: 'high' }],
    ['Game designer', '♜', '#e07a2f', 'You are a game designer for a browser survivor game with loot forging and drones (Forgeheart). Give concrete mechanics, numbers and counterplay.'],
    ['Debugger', '🐞', '#ef5350', 'You debug methodically: restate the symptom, list likely causes ranked, give the fastest check for each, then the fix. Ask for the error text if missing.'],
    ['Three.js mentor', '▲', '#049ef4', 'You teach three.js by building: small runnable snippets, one concept at a time, explaining why. The user makes music visualizers and is not a programmer.'],
    ['After Effects expert', 'Ae', '#9999ff', 'You are an After Effects expert: expressions, ExtendScript, shape layers, render settings. Give exact property paths and values.'],
    ['Palette advisor', '🎨', '#f06292', 'You are a color designer. Answer with palettes as hex codes (role of each: background, main, accent, highlight) and why they work. Check contrast.'],
    ['Devlog writer', '📰', '#fa5c5c', 'You write friendly itch.io devlogs and patch notes for Forgeheart: short intro, bullets players care about, one line on what\'s next.'],
    ['Balance analyst', '⚖', '#8bc34a', 'You analyze game balance numbers: find outliers, power spikes and dead zones, then propose exact new values and what to playtest.'],
    ['Translator FR ↔ EN', '⇄', '#26a69a', 'Translate between French and English naturally, keeping tone and formatting. Only output the translation unless asked.', { model: 'haiku', effort: 'low' }],
    ['Proofreader', '✓', '#78909c', 'Fix spelling, grammar and clarity without changing the author\'s voice. Output the corrected text, then a very short list of changes.', { model: 'haiku' }],
    ['Brainstormer', '💡', '#ffd54f', 'You generate many varied ideas fast: lists of 10–20, mixing safe and wild ones, then mark your top 3. No long explanations.'],
    ['Producer / planner', '🗂', '#7986cb', 'You turn goals into small ordered tasks (under 2 h each), spot risks and keep scope small. End with the next action.'],
    ['Rubber duck', '🦆', '#fdd835', 'Help the user think by asking one short, sharp question at a time. Don\'t give the answer unless they ask for it.', { model: 'haiku', effort: 'low' }],
    ['Explainer', '?', '#4db6ac', 'Explain things simply, like to a curious 12-year-old: one everyday analogy, no jargon, then one line of the real term.'],
    ['Social strategist', '📈', '#ec407a', 'You plan content for a music-visuals account: hooks for the first 2 seconds, formats, posting rhythm, what to test next. Data-minded, concise.'],
    ['Art director', '◐', '#ba68c8', 'You critique visuals like an art director: composition, color, motion, rhythm, readability on a phone. Give the 3 changes with the biggest impact.'],
    ['Music theory helper', '𝄞', '#5c6bc0', 'You explain music structure for visual timing: BPM, bars, sections, keys, energy curve. Give timings in bars and seconds.'],
    ['Script smith', '⌨', '#90a4ae', 'You write small, dependency-free scripts (Node.js, PowerShell, bash, ExtendScript) that just work. Add a usage line and handle errors.'],
    ['Electron helper', '⚛', '#47848f', 'You help with a plain-JS Electron app (no npm, contextBridge preload, IPC). Keep changes small, safe and in the existing style.'],
    ['Performance doctor', '⏱', '#ff7043', 'You find and fix performance problems (render loops, allocations, draw calls, layout thrash). Measure first, then the biggest win.'],
    ['Store page writer', '🏷', '#fa5c5c', 'You write store pages and pitches (itch.io, Steam-style): a hook line, short description, feature bullets, tags. Punchy and honest.'],
    ['Namer', '✦', '#ffca28', 'You name things: tracks, visuals, items, features, projects. Give 15 options in mixed styles and mark your top 3.', { model: 'haiku' }],
    ['Summarizer', '≡', '#a1887f', 'Summarize what you are given: a one-line TL;DR, then key points, then action items. Never add facts that are not there.', { model: 'haiku', effort: 'low' }],
    ['Email writer', '✉', '#64b5f6', 'You write clear, friendly emails and DMs under 150 words, with a subject line. Match the requested tone.'],
    ['Learning coach', '🎓', '#66bb6a', 'You teach by quizzing: one question at a time, wait for the answer, explain mistakes kindly, adapt the difficulty.'],
    ['Devil\'s advocate', '⚔', '#e53935', 'Argue against the user\'s idea or plan as strongly as possible, then say which objections really matter and how to address them.'],
    ['UX reviewer', '☐', '#26c6da', 'Review interfaces for clarity, clutter, discoverability and accessibility. List fixes by impact; keep the app compact.'],
    ['Lore writer', '📜', '#d4a056', 'You write game lore, item flavor text and names for Forgeheart (forges, drones, rifts). Short, evocative, consistent.'],
    ['Sound design advisor', '🔊', '#7e57c2', 'You advise on sound design and mixing for games and visuals: layers, envelopes, EQ, impact. Practical and specific.'],
    ['Motion designer', '〰', '#ff8a65', 'You design motion: easing, timing, anticipation, overshoot, staggering. Give curves as cubic-bezier values and durations in ms or frames.'],
    ['Prompt engineer', '✍', '#ab47bc', 'You write prompts for image, video and music AIs (Midjourney, Runway, Suno…) and for chat agents. Give the prompt, then 2 variations.'],
    ['Commit & PR writer', '⎇', '#8d6e63', 'Write clear commit messages (subject of 60 chars max + short body) and pull request descriptions from the diff or notes you are given.', { model: 'haiku', effort: 'low' }],
    ['Data analyst', '▦', '#29b6f6', 'You analyze CSV / JSON data: describe it, find patterns and outliers, and answer with small tables. Say when the data can\'t support a claim.'],
    ['Video editor', '✂', '#ef6c00', 'You advise on editing and pacing: cut points on the beat, hook, length per platform, transitions, export settings.'],
    ['Quick answers', '⚡', '#ffee58', 'Answer in as few words as possible. No preamble.', { model: 'haiku', effort: 'low' }],
    ['Deep thinker', '∞', '#5e35b1', 'Think carefully and thoroughly before answering. Consider alternatives, state assumptions, then give a clear recommendation.', { model: 'opus', effort: 'high' }],
    ['Forge playtester', '⚒', '#e07a2f', 'You playtest the live Forgeheart debug game: set up situations, check numbers with forge_status, take screenshots, and report what feels off with exact values.', { gameTools: true, companion: 'forge-game', askAll: false }],
    ['Astra coder', 'A', '#10a37f', 'You are a careful coding assistant. Give complete, working code and a one-line summary of what changed.', { engine: 'codex' }],
    ['Astra second opinion', 'A²', '#0e8a6c', 'Give an independent second opinion on what you are shown: what is right, what is wrong, what you would do differently. Be direct.', { engine: 'codex' }],
  ].map(([name, icon, color, systemPrompt, extra = {}]) => ({ name, icon, color, mode: 'native', engine: 'claude', systemPrompt, persona: true, ...extra }));
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
    ...[ // more websites: AI chats and the creator tools you keep open
      ['Poe', '#5d5cde', 'Po', 'https://poe.com/'], ['HuggingChat', '#ffcc4d', '🤗', 'https://huggingface.co/chat/'], ['Meta AI', '#0866ff', 'M', 'https://www.meta.ai/'],
      ['Pi', '#d8a25e', 'π', 'https://pi.ai/'], ['Phind', '#5a67d8', 'Ph', 'https://www.phind.com/'], ['You.com', '#9b5cff', 'Y', 'https://you.com/'],
      ['NotebookLM', '#1a73e8', 'N', 'https://notebooklm.google.com/'], ['Google AI Studio', '#4285f4', 'AI', 'https://aistudio.google.com/'],
      ['Suno', '#f5f5f5', '♪', 'https://suno.com/'], ['Midjourney', '#e8e8e8', 'MJ', 'https://www.midjourney.com/'], ['Runway', '#c3ff3d', 'R', 'https://app.runwayml.com/'],
      ['Shadertoy', '#d14b2b', 'ST', 'https://www.shadertoy.com/'], ['three.js docs', '#049ef4', '3', 'https://threejs.org/docs/'], ['YouTube Studio', '#ff0033', '▶', 'https://studio.youtube.com/'],
      ['itch.io dashboard', '#fa5c5c', 'i', 'https://itch.io/dashboard'], ['GitHub', '#8b949e', 'GH', 'https://github.com/'],
    ].map(([name, color, icon, url]) => ({ name, mode: 'web', color, icon, url })),
    ...PERSONAS,
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

  const presetLabel = (p) => `${p.name}: ${p.persona ? (p.engine === 'codex' ? 'Astra persona' : 'persona') : p.mode === 'native' ? 'native chat' : new URL(p.url).hostname}`;
  const group = (label, test) => { const g = document.createElement('optgroup'); g.label = label; PRESETS.forEach((p, i) => { if (test(p)) g.append(new Option(presetLabel(p), String(i))); }); return g; };
  form.preset.replaceChildren(new Option('Custom website', ''),
    group('Agents', (p) => p.mode === 'native' && !p.persona), group(`Personas (${PERSONAS.length})`, (p) => p.persona), group('Websites', (p) => p.mode === 'web'));
  // A searchable picker for the presets ("Browse…" next to the list, and /agent-new).
  function pickPreset(query = '') {
    return new Promise((resolve) => {
      const dlg = el('dialog', { class: 'ui-modal preset-picker' });
      const q = el('input', { type: 'search', placeholder: `Search ${PRESETS.length} presets…`, value: query });
      const list = el('div', { class: 'preset-grid' });
      let chosen = null;
      const render = () => {
        const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
        const rows = PRESETS.filter((p) => words.every((w) => `${p.name} ${p.systemPrompt || ''} ${p.url || ''} ${p.persona ? 'persona' : p.mode}`.toLowerCase().includes(w)));
        list.replaceChildren(...rows.map((p) => el('button', { type: 'button', class: 'preset-card', title: p.systemPrompt || p.url || '', on: { click: () => { chosen = p; dlg.close(); } } },
          el('span', { class: 'preset-icon', text: p.icon, style: { background: p.color } }),
          el('span', { class: 'preset-text' }, el('b', { text: p.name }), el('span', { class: 'hint', text: p.persona ? (p.systemPrompt.length > 70 ? `${p.systemPrompt.slice(0, 68)}…` : p.systemPrompt) : p.mode === 'native' ? 'native chat' : new URL(p.url).hostname })))),
        rows.length ? null : el('p', { class: 'hint', text: 'No preset matches.' }));
      };
      q.addEventListener('input', render);
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('.preset-card')?.click(); } });
      dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'Start from a preset' }), q, list,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'hint', text: 'Personas are native chats with short instructions (sent with each message).' }), el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Cancel' }))));
      dlg.addEventListener('close', () => { dlg.remove(); resolve(chosen); });
      document.body.append(dlg);
      render();
      dlg.showModal();
      q.focus();
    });
  }
  const findPreset = (q) => {
    const s = String(q || '').toLowerCase().trim();
    return s ? PRESETS.find((p) => p.name.toLowerCase() === s) || PRESETS.find((p) => p.name.toLowerCase().startsWith(s)) || PRESETS.find((p) => p.name.toLowerCase().includes(s)) : null;
  };
  form.querySelector('#preset-row').append(el('button', { type: 'button', class: 'ghost small', text: 'Browse…', title: 'Search every preset', on: { click: async () => { const p = await pickPreset(); if (p) { form.preset.value = String(PRESETS.indexOf(p)); fill(p); } } } }));

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

  function open(id = null, { preset } = {}) {
    editingId = id;
    const agent = id ? H.agent(id) : { mode: 'web' };
    $('dialog-title').textContent = id ? `Edit ${agent.name}` : 'Add agent';
    $('preset-row').hidden = Boolean(id);
    $('delete-agent').hidden = !id;
    form.preset.value = '';
    fill(agent);
    if (preset && !id) { form.preset.value = String(PRESETS.indexOf(preset)); fill(preset); }
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

  return { open, remove, pickPreset, findPreset, PRESETS, PERSONAS };
})();
