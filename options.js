// ⋯ AI setup (round 26, simplified the same day). The owner, after a first Options panel that listed every command:
// "still way too complex… hide all commands… only give me options that can give more access to stuff to the AI,
// like hooks and connections or personalities or lists of instructions… right now it feels too complex to just ask
// anything to any ai and then context gets wrapped in a single message".
// So ⋯ (a chat's header, a window's header, ❖ in the rail) opens one short panel about the AI itself, saved on the
// agent (its system prompt and tools), never tucked into your next message:
//   Personality · Instructions (a list, each on / off) · What it can use (files, Hearth's tools, connected apps) ·
//   Memory · Habits (checks its own work, suggests next steps…) · How hard it thinks.
// Changes apply from its next message. Chips on top switch which AI you're setting up.
// (round 33, simplify3) It reads top to bottom: who → Personality → Instructions → What it can use (files, then
// Hearth's tools, Connections and Hooks folded, Check this AI) → How hard it thinks → the rest folded (Memory, Habits,
// Spending, Missions: ◎ in the chat box is their main place). A fold shows one line about where it stands, and what
// you open stays open (this computer only).
const Options = (() => {
  let sheet = null; // { root, body, agentId, page }
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  // the config file watcher hands back fresh agent objects after a save: change the live one (and the one in hand)
  async function save(a, patch) {
    for (const t of new Set([a, H.agent(a.id)].filter(Boolean))) {
      Object.assign(t, patch);
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete t[k];
    }
    await saveConfig();
    if (typeof Cachewise !== 'undefined') Cachewise.changed(a.id); // (round 32) a mid-chat change: one calm line about the cache
  }
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: fn } });
  function sw(on, label, tip, fn) {
    const b = el('button', { type: 'button', class: 'opt-switch', role: 'switch', attrs: { 'aria-checked': String(Boolean(on)), 'aria-label': label } }, el('i'));
    b.addEventListener('click', async () => { const next = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(next)); await fn(next); });
    return el('label', { class: 'opt-row', title: tip }, el('span', { class: 'opt-label', text: label }), b);
  }
  const sec = (title, hint, ...kids) => el('section', { class: 'opt-sec' }, el('h4', { class: 'opt-h', text: title }), hint ? el('p', { class: 'opt-hint', text: hint }) : null, ...kids);
  // (round 33, simplify3) a long part folds: its title and one line about where it stands; open ones stay open
  let opened = null;
  const openSet = () => { if (!opened) { let v = []; try { v = store.get('options.open', []) || []; } catch { /* no storage */ } opened = new Set(Array.isArray(v) ? v : []); } return opened; };
  function fold(key, part, sum, { sub = false, title = '' } = {}) {
    if (!part) return null;
    const h = part.querySelector(':scope > .opt-h');
    if (sub) h?.remove();
    const head = sub ? el('span', { class: 'opt-fold-h', text: title || h?.textContent || '' }) : (h || el('h4', { class: 'opt-h', text: title }));
    const cls = sub ? `${(part.className || '').replace(/\bopt-sec\b/, '').trim()} opt-fold`.trim() : part.className || 'opt-sec';
    const d = el('details', { class: cls, attrs: { 'data-fold': key } });
    d.open = openSet().has(key) || sheet?.show === key;
    d.append(el('summary', { class: 'opt-fold-sum' }, head, el('span', { class: 'opt-sum', text: sum })), ...[...part.childNodes]);
    d.addEventListener('toggle', () => {
      if (d.open) openSet().add(key); else openSet().delete(key);
      try { store.set('options.open', [...openSet()]); } catch { /* no storage */ }
    });
    return d;
  }
  const list3 = (names, none) => (names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : none);

  // ---------- personality ----------
  const personas = () => { try { return (Manager.PRESETS || []).filter((p) => p.persona); } catch { return []; } };
  function personality(a) {
    const cur = a.systemPrompt || '';
    const list = personas();
    const known = list.findIndex((p) => p.systemPrompt === cur);
    const custom = Boolean(cur) && known < 0;
    const own = el('textarea', { class: 'opt-own', rows: 3, placeholder: 'Who it is and how it talks, in your words (e.g. “A blunt art director who answers in short bullet points”)', hidden: !custom, value: custom ? cur : '' });
    own.addEventListener('change', () => save(a, { systemPrompt: own.value.trim() || undefined }).then(() => toast(`${a.name}: personality saved`, { timeout: 1500 })));
    const sel = el('select', { class: 'opt-pick opt-wide', attrs: { 'aria-label': 'Personality' } },
      el('option', { value: 'plain', text: 'Plain (a helpful assistant)', selected: !cur }),
      list.map((p, i) => el('option', { value: String(i), text: `${p.icon} ${p.name}`, selected: known === i })),
      el('option', { value: 'own', text: '✎ Your own…', selected: custom }));
    const what = el('p', { class: 'opt-hint opt-what', text: known >= 0 ? list[known].systemPrompt : '' });
    sel.addEventListener('change', () => {
      if (sel.value === 'own') { own.hidden = false; what.textContent = ''; own.focus(); return; }
      own.hidden = true;
      const p = sel.value === 'plain' ? null : list[Number(sel.value)];
      what.textContent = p?.systemPrompt || '';
      save(a, { systemPrompt: p?.systemPrompt || undefined });
    });
    return sec('Personality', 'Who it is and how it talks, in every message.', sel, what, own);
  }

  // ---------- instructions ----------
  function instructions(a) {
    const list = Array.isArray(a.instructions) ? a.instructions : [];
    const put = (next) => save(a, { instructions: next.length ? next : undefined }).then(paint);
    const rows = list.map((r, i) => el('div', { class: 'opt-rule' },
      el('input', { type: 'checkbox', checked: r.on !== false, title: 'On / off', on: { change: (e) => put(list.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x))) } }),
      el('span', { class: `opt-rule-text${r.on === false ? ' off' : ''}`, text: r.text, title: 'Double-click to edit', on: { dblclick: async () => { const t = await Modal.prompt('Edit instruction', { value: r.text, multiline: true }); if (t != null && t.trim()) put(list.map((x, j) => (j === i ? { ...x, text: t.trim() } : x))); } } }),
      btn('×', 'Remove', () => put(list.filter((_, j) => j !== i)))));
    const add = el('input', { type: 'text', class: 'opt-add', placeholder: '＋ Add an instruction, then Enter (“Always give me 9:16 versions”)' });
    add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); put([...list, { text: add.value.trim().slice(0, 600), on: true }]); } });
    return sec('Instructions', 'Rules it always follows. Untick one to pause it.', el('div', { class: 'opt-rules' }, rows), add);
  }

  // ---------- what it can use ----------
  const TOOLS = [
    { k: 'chatTools', label: 'Your chats and Hearth', tip: 'Read and search your other chats, open things in Hearth', on: (a) => (a.engine === 'codex' ? a.chatTools === true : a.chatTools !== false), set: (a, v) => ({ chatTools: a.engine === 'codex' ? (v || undefined) : (v ? undefined : false) }) },
    { k: 'threeTools', label: 'Three.js Lab', tip: 'Build and change scenes in the Lab (the Three Director)' },
    { k: 'boardTools', label: 'Mood board', tip: 'See and arrange your mood boards (≈ 1,000 tokens a message)' },
    { k: 'captureTools', label: 'Screenshots and recordings', tip: 'Take screenshots, record, read video frames (≈ 550 tokens a message)' },
    { k: 'appsTools', label: 'App windows (Meshy, Suno…)', tip: 'Use the AI apps in Hearth\'s windows (Meshy costs credits: it asks)' },
    { k: 'adobeTools', label: 'Adobe', tip: 'Drive Photoshop / After Effects / Premiere on this computer' },
    { k: 'deployTools', label: 'Publishing', tip: 'Publish sites and pages (it always asks before anything goes public)' },
    { k: 'gameTools', label: 'Forgeheart game', tip: 'Control the live debug game' },
  ];
  function access(a) {
    // files: the AI's own access level and folders, for every chat with it (access.js; round 32: before, this row
    // changed only the open chat, so new chats started back at off / read)
    let files = null;
    if (typeof Access !== 'undefined' && Access.aiSection) {
      try { files = Access.aiSection(a.id, { repaint: () => setTimeout(paint, 50) }); } catch { /* no access module */ }
    }
    // (round 33) Hearth's own tools (and Astra's web search), folded: "Your chats and Hearth, Mood board"
    const re = () => setSum('tools', toolSum(H.agent(a.id) || a));
    const tools = TOOLS.map((t) => sw(t.on ? t.on(a) : Boolean(a[t.k]), t.label, t.tip, (v) => save(a, t.set ? t.set(a, v) : { [t.k]: v || undefined }).then(re)));
    if (a.engine === 'codex') tools.push(sw(a.webSearch && a.webSearch !== 'disabled', 'Web search', 'It can look things up on the web', (v) => save(a, { webSearch: v ? 'live' : undefined }).then(re)));
    const toolBox = fold('tools', el('div', {}, ...tools), toolSum(a), { sub: true, title: 'Hearth\'s tools' });
    // connections: claude.ai's connected apps, your own (connections.js), the Hearth Chrome (chrome-ui.js)
    const apps = el('div', { class: 'opt-apps' });
    if (a.engine === 'claude') loadApps(a, apps);
    // (round 26, connections.js) the owner's own connections: ＋ Add a connection, per-AI on / off, Test
    const own = el('div', { class: 'opt-conns' });
    Promise.resolve(typeof Lazy !== 'undefined' ? Lazy.load('connections') : null).then(() => { if (typeof Connections !== 'undefined') own.replaceChildren(Connections.section(a.id)); }).catch(() => {});
    // (round 30, chrome-ui.js) Chrome for Google sign-in: found or not, Open the Hearth Chrome, Sign in, what opens there
    const chrome = el('div', { class: 'opt-chrome' });
    if (window.hub?.chrome) Promise.resolve(typeof Lazy !== 'undefined' ? Lazy.load('chrome') : null).then(() => { if (typeof ChromeUI !== 'undefined') chrome.replaceChildren(ChromeUI.section()); }).catch(() => {});
    const conns = fold('connections', el('div', {}, el('p', { class: 'opt-hint', text: 'Other apps and services it can reach: your mail, drive, notes, or a tool you add.' }), apps, own, chrome), connSum(a), { sub: true, title: 'Connections' });
    // (round 26, hooks.js) "Hooks: when… then…" (its group loads by itself shortly after the start; asked for here if not yet)
    const hk = window.Lazy?.loaded?.('hooks') === false ? (window.Lazy.load('hooks').then(() => paint()).catch(() => {}), null) : typeof Hooks !== 'undefined' ? Hooks.section(a, { save, repaint: paint }) : null;
    const hooks = hk ? fold('hooks', hk, hookSum(a), { sub: true, title: 'Hooks: when something happens, it acts' }) : null;
    // (round 32, aicheck.js) Check this AI: a short real test with a fix on each failing line; the last result stays here
    let check = null;
    if (typeof AiCheck !== 'undefined') { try { check = AiCheck.section(a.id); } catch { /* no check module */ } }
    return sec('What it can use', 'What it may reach by itself when it helps.', files, toolBox, conns, hooks, check);
  }
  const toolSum = (a) => list3([...TOOLS.filter((t) => (t.on ? t.on(a) : Boolean(a[t.k]))).map((t) => t.label), ...(a.engine === 'codex' && a.webSearch && a.webSearch !== 'disabled' ? ['Web search'] : [])], 'None on');
  function connSum(a) {
    const apps = Object.entries(a.connectors || {}).map(([k, m]) => `${k.replace(/^claude\.ai\s+/, '')}${m === 'read' ? ' (read only)' : ''}`);
    const mine = Object.values(a.connections || {}).filter(Boolean).length;
    return list3([...apps, ...(mine ? [`${mine} of yours`] : [])], 'None on');
  }
  function hookSum(a) {
    const list = Array.isArray(a.hooks) ? a.hooks : [];
    if (!list.length) return 'None yet';
    const on = list.filter((h) => h.on !== false).length;
    return `${on} on${list.length > on ? `, ${list.length - on} paused` : ''}${typeof Hooks !== 'undefined' && Hooks.paused?.() ? ' · all paused' : ''}`;
  }
  // a fold's one line, after a change inside it (no repaint: the switch you just clicked stays where it is)
  const setSum = (key, text) => { const n = sheet?.body.querySelector(`[data-fold="${key}"] > summary .opt-sum`); if (n) n.textContent = text; };
  async function loadApps(a, box, refresh = false) {
    box.replaceChildren(el('p', { class: 'opt-hint', text: 'Connected apps: looking…' }));
    let info = null;
    try { info = refresh ? await window.hub.refreshConnectors() : (await window.hub.getConnectors()) || await window.hub.refreshConnectors(); } catch { /* none */ }
    const servers = info?.servers || [];
    const head = el('div', { class: 'opt-row' }, el('span', { class: 'opt-label opt-sub', text: 'Connected apps (Gmail, Drive, Notion…)' }), btn('↻', 'Look again', () => loadApps(a, box, true)));
    if (!servers.length) { box.replaceChildren(head, el('p', { class: 'opt-hint', text: 'None yet: connect them at claude.ai → Settings → Connectors, then ↻.' })); return; }
    box.replaceChildren(head, ...servers.map((s) => {
      const modes = { ...(a.connectors || {}) };
      const sel = el('select', { class: 'opt-pick', disabled: s.status !== 'connected' && !modes[s.name] }, el('option', { value: '', text: 'Off' }), el('option', { value: 'read', text: 'Read only' }), el('option', { value: 'full', text: 'Full' }));
      sel.value = modes[s.name] || '';
      sel.addEventListener('change', () => { const m = { ...(a.connectors || {}) }; if (sel.value) m[s.name] = sel.value; else delete m[s.name]; save(a, { connectors: Object.keys(m).length ? m : undefined }); });
      return el('div', { class: 'opt-row', title: s.status === 'connected' ? `${s.readTools} read / ${s.tools} tools` : 'Needs sign-in at claude.ai → Settings → Connectors' }, el('span', { class: 'opt-label', text: s.name.replace(/^claude\.ai\s+/, '') }), sel);
    }));
  }

  // ---------- memory, habits, thinking ----------
  function memory(a) {
    // (round 38, memorytidy.js) Tidy memory… next to What it remembers…, and one line in the summary once it's big
    const tidy = typeof MemoryTidy !== 'undefined' ? btn('Tidy memory…', 'Merge facts said twice, update old ones, shorten wordy ones, keep Lab facts for the Lab: you tick, then apply (one Undo)', () => MemoryTidy.open({ agentId: a.id }), 'ghost small') : null;
    if (tidy) MemoryTidy.nudge(a).then((n) => { if (n) setSum('memory', `${memSum(a.autoMemory !== false)} · ${n}`); }).catch(() => {});
    return fold('memory', sec('Memory', null,
      sw(a.autoMemory !== false, 'Remembers things you tell it', 'It keeps lasting facts and preferences for every chat with it', (v) => save(a, { autoMemory: v ? undefined : false }).then(() => setSum('memory', memSum(v)))),
      el('div', { class: 'opt-row' }, btn('What it remembers…', 'See, edit or remove what it keeps in mind', () => (typeof MemoryEditor !== 'undefined' ? MemoryEditor.open({}) : Commands.exec('/memory edit', a.id)), 'ghost small'), tidy)), memSum(a.autoMemory !== false));
  }
  const memSum = (on) => (on ? 'Remembers what you tell it' : 'Off: it forgets between chats');
  const chatsOn = (a) => TOOLS[0].on(a);
  // Continue lighter (autocompact.js, in the lazy group 'budget') replaces the silent auto-compact
  const lighterHere = () => typeof Autocompact !== 'undefined' || window.Lazy?.loaded?.('budget') === false;
  function habits(a) {
    const re = () => setSum('habits', habitSum(H.agent(a.id) || a));
    return fold('habits', sec('Habits', 'Things it does by itself.',
      sw(a.selfReview ?? Boolean(a.dock), 'Checks its own work before it answers', 'For visual work: it takes a quick look at the result and fixes what\'s off', (v) => save(a, { selfReview: v }).then(re)),
      sw(chatsOn(a) ? a.suggestNext !== false : Boolean(a.suggestNext), 'Suggests what to do next', 'Up to 3 next steps show as buttons under a reply', (v) => save(a, { suggestNext: chatsOn(a) ? (v ? undefined : false) : (v || undefined) }).then(re)),
      sw(a.showThinking !== false, 'Shows its thinking', 'Its thought process shows folded under the reply', (v) => save(a, { showThinking: v ? undefined : false }).then(re)),
      // (round 35, bugbash2) since Continue lighter (round 34) nothing summarizes a chat by itself: the switch did nothing
      // (and its "shrinks long chats" line said the opposite). The offer's own row is in Spending.
      lighterHere() ? null : sw(a.autoCompact !== false, 'Shrinks long chats by itself', 'Old messages get summed up when a chat gets long, so it stays fast', (v) => save(a, { autoCompact: v ? undefined : false }).then(re)),
      ...(a.threeTools ? lab(a) : [])), habitSum(a));
  }
  function habitSum(a) {
    const on = [[a.selfReview ?? Boolean(a.dock), 'checks its work'], [chatsOn(a) ? a.suggestNext !== false : Boolean(a.suggestNext), 'suggests next steps'], [a.showThinking !== false, 'shows its thinking'], [a.autoCompact !== false && !lighterHere(), 'shrinks long chats']].filter(([v]) => v).map(([, t]) => t);
    const t = list3(on, 'none');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // (round 27, simplify2) the Lab directors' habits, moved here from Settings (they belong to the AI); each runs its
  // own command out of sight, so this row, the command and the old menus never disagree
  function lab(a) {
    const quiet = { source: 'settings', say() {}, note() {}, error: (m) => toast(m, { type: 'error' }) };
    const run = (line) => Promise.resolve(Commands.tryRun(line, a.id, undefined, quiet)).catch(() => {});
    const rows = [
      ['nodes-director', a.nodesTool !== false, 'Builds in node graphs', 'Its scenes come with nodes and wires you can see and change (≈ 75 tokens a message)'],
      ['progress', Boolean(a.progressTag), 'Shows a progress bar while it builds', 'How far along it seems, as a bar (≈ 30 tokens a message)', (v) => `/progress tags ${v ? 'on' : 'off'}`],
      ['director-autoshot', store.get('director.autoShot', false), 'Looks at a picture after each edit', 'A small preview after every code change, so it sees what it made (a picture per edit)'],
    ];
    return rows.filter(([cmd]) => typeof Commands === 'undefined' || Commands.get(cmd)).map(([cmd, on, label, tip, line]) => sw(on, `In the Lab: ${label.toLowerCase()}`, tip, (v) => run(line ? line(v) : `/${cmd} ${v ? 'on' : 'off'}`)));
  }
  function thinking(a) {
    const levels = [['low', 'Quick'], ['medium', 'Smart'], ['high', 'Deep']];
    const cur = a.effort || 'medium';
    // (round 28, router.js) Smart picks the model + effort per message; the reply shows the pick, one click thinks harder
    const smart = cur === 'medium' && typeof Router !== 'undefined';
    return sec('How hard it thinks', smart ? 'Smart picks for each message: lighter for small asks, deeper for code and builds. Click the pick on a reply to ask again, harder.' : null,
      el('div', { class: 'opt-seg' }, levels.map(([v, label]) => el('button', { type: 'button', class: `ghost small${cur === v || (v === 'high' && cur === 'xhigh') ? ' on' : ''}`, text: label,
        title: v === 'low' ? 'It answers fast and short' : v === 'medium' ? 'It picks for each message: light for small asks, thorough for hard ones (saves tokens)' : 'It thinks longer and answers more thoroughly (more tokens)', on: { click: () => save(a, { effort: v === 'medium' ? undefined : v }).then(paint) } }))),
      answers(a));
  }
  // (round 35, concise) How long its answers are: one row under the thinking buttons. Saved as agent.verbosity (the
  // field Astra's verbosity already used): Short / Detailed add one fixed line at the end of Claude's instructions,
  // Astra gets its engine's own verbosity setting; Normal adds nothing.
  const LENGTHS = [['low', 'Short', 'The answer first: no preamble, no recap, only the code that changes (fewer output tokens)'], ['', 'Normal', 'As it is'], ['high', 'Detailed', 'Fuller answers with reasons and examples (more output tokens)']];
  function answers(a) {
    const cur = a.verbosity === 'low' || a.verbosity === 'high' ? a.verbosity : '';
    return el('div', { class: 'opt-row opt-answers' }, el('span', { class: 'opt-label', text: 'How long its answers are' }),
      el('div', { class: 'opt-seg' }, LENGTHS.map(([v, label, title]) => el('button', { type: 'button', class: `ghost small${cur === v ? ' on' : ''}`, text: label, title,
        on: { click: () => save(a, { verbosity: v || undefined }).then(paint) } }))));
  }

  // ---------- the panel ----------
  function paint() {
    if (!sheet) return;
    const a = H.agent(sheet.agentId) || natives()[0]; // read fresh on every paint (see save)
    if (!a) { sheet.body.replaceChildren(el('p', { class: 'opt-hint', text: 'No chat AI yet.' })); return; }
    sheet.agentId = a.id;
    const scroll = sheet.body.firstChild ? sheet.body.scrollTop : 0; // (round 36, motionpolish) a sheet just built is at the top: asking forced a style + layout as it came in
    const who = el('div', { class: 'opt-who' }, natives().map((x) => el('button', { type: 'button', class: `opt-chip${x.id === a.id ? ' on' : ''}`, text: `${x.icon || ''} ${x.name}`.trim(), title: `Set up ${x.name}`, on: { click: () => { sheet.agentId = x.id; paint(); } } })));
    // (round 33, simplify3) ◎ in the chat box is the missions' place; here they wait folded at the end
    const mission = typeof Missions !== 'undefined' ? fold('missions', sec('Your next message', 'Click: the next message only · 📌 every message from now on. Right-click ◎ in the chat box: back to a normal reply.', Missions.cards(a.id, { onPick: paint })), missionSum(a)) : null;
    // (round 30, budget.js) Spending: this week's use, a weekly limit, what happens near it
    const spent = window.Lazy?.loaded?.('budget') === false ? (window.Lazy.load('budget').then(() => paint()).catch(() => {}), null) : typeof Budget !== 'undefined' ? Budget.section(a, { repaint: paint }) : null;
    sheet.body.replaceChildren(who, personality(a), instructions(a), access(a), thinking(a), memory(a), habits(a), spent ? fold('spending', spent, spendSum(a)) : null, mission);
    if (sheet.show && sheet.body.querySelector(`[data-fold="${sheet.show}"]`)) { const k = sheet.show; sheet.show = null; requestAnimationFrame(() => sheet?.body.querySelector(`[data-fold="${k}"]`)?.scrollIntoView({ block: 'start' })); }
    if (scroll) sheet.body.scrollTop = scroll; // (round 26, smooth26: at the top already, no layout forced mid-build)
  }
  function missionSum(a) {
    const m = Missions.current(a.id);
    if (!m || m.id === 'normal') return 'Just answer';
    return `${m.icon || ''} ${m.label}${Missions.isSticky(a.id) ? ', every message' : ', next message'}`.trim();
  }
  function spendSum(a) {
    // (round 36, tokenaudit) + one line, once, when an unused tool costs more than ≈ 500 tokens a message
    try { const s = Budget.state(a.id); const n = typeof TokenAudit !== 'undefined' ? TokenAudit.nudge(a) : ''; return `${s.limit ? `${s.pct}% of this week's limit` : 'No weekly limit'}${n ? ` · ${n}` : ''}`; } catch { return ''; }
  }
  function build(host, agentId, page = false, show = null) {
    // (round 31, quickstart-hooks.js) "?": What can I do here? (the card shows in the window, so the drawer goes)
    const qs = !page && window.Lazy?.isIn?.('quickstart') && typeof QuickstartHooks !== 'undefined' ? QuickstartHooks.button(QuickstartHooks.placeOf(agentId), agentId, () => hide()) : null;
    const head = el('header', { class: 'opt-head' }, el('b', { text: 'AI setup' }), el('span', { class: 'spacer' }), qs, page ? null : btn('✕', 'Close (Esc)', () => hide()));
    const body = el('div', { class: 'opt-body' });
    const root = el(page ? 'div' : 'aside', { class: `opt-sheet${page ? ' opt-page' : ''}`, attrs: { 'aria-label': 'AI setup' } }, head, body);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !page && !e.target.closest('textarea')) { e.stopPropagation(); hide(); } });
    host.append(root);
    sheet = { root, body, agentId, page, sid: sidNow(), show };
    paint();
    return root;
  }
  function agentFor(place) {
    if (place && place !== 'chat') { const d = Tools.dockedAgent?.(place); if (d) return d.id; }
    const a = H.agent(H.activeId);
    return a?.mode === 'native' ? a.id : H.claudeAgent()?.id;
  }
  // show: a fold to open and scroll to ('tools', 'connections', 'hooks', 'memory', 'habits', 'spending', 'missions')
  function open({ agentId, place, show } = {}) {
    const id = agentId || agentFor(place);
    if (sheet && !sheet.page) { const same = sheet.agentId === id; hide(); if (same && !show) return null; }
    return build(document.body, id, false, show || null);
  }
  function hide() { if (sheet && !sheet.page) { sheet.root.remove(); sheet = null; } }
  // another window: the drawer goes (a re-render of the same window keeps it)
  const sidNow = () => (H.activeId ? H.surfaceIdFor?.(H.activeId) : '') || '';
  addEventListener('hearth:view', () => setTimeout(() => { if (sheet && !sheet.page && sheet.sid !== sidNow()) hide(); }, 0));

  if (typeof Tools !== 'undefined') {
    Tools.define({
      id: 'options', name: 'AI setup', icon: '❖', color: '#9fd3ff', // (round 27, simplify2) ❖, not a second ⚙ next to Settings
      description: 'What each AI can use: personality, instructions, connections, memory',
      mount: (body) => { build(body, H.claudeAgent()?.id, true); },
      onShow() { if (sheet?.page) paint(); },
      commands: [{ label: 'AI setup: personality, instructions, connections', run: () => activate('tool:options') }],
    });
  }
  return { open, hide, paint, get sheet() { return sheet; } };
})();
