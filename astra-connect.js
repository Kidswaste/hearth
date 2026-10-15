// Round 47: live catalogs stay out of prompts; apps are mentioned only when the owner selects them.
const AstraConnect = (() => {
  const selected = new Map(); const turns = new Map(); const questions = new Map();
  const api = () => window.hub.codex;
  const fail = err => toast(typeof calmError === 'function' ? calmError(err) : err.message || String(err), { type: 'error' });
  const agentFor = id => { const a = H.agent(id); if (a?.engine !== 'codex') throw new Error('Open an Astra / Codex chat first.'); return a; };
  const button = (text, action) => el('button', { type: 'button', class: 'ghost small', text, on: { click: () => Promise.resolve().then(action).catch(fail) } });
  const para = text => el('p', { text });
  function sheet(title) {
    const body = el('div', { class: 'ac-body' });
    const d = el('dialog', { class: 'ui-modal ac-dialog' }, el('header', {}, el('h2', { text: title }), button('Close', () => d.close())), body);
    d.addEventListener('close', () => d.remove(), { once: true }); document.body.append(d); d.showModal(); return { d, body };
  }
  const key = id => Native.chatOf(id)?.id || `new:${id}`;
  function paintSelection(id) {
    const v = Native.view(id); if (!v) return;
    const b = v.root.querySelector('.ac-launch');
    if (b) { const n = (selected.get(key(id)) || []).length; b.textContent = n ? `Apps · ${n} selected` : 'Astra tools'; }
  }
  async function apps(agentId) {
    const agent = agentFor(agentId); const target = key(agentId); const chatId = Native.chatOf(agentId)?.id;
    const { d, body } = sheet('Apps for Astra');
    const search = el('input', { type: 'search', placeholder: 'Find an app…', 'aria-label': 'Find an app' });
    const status = para('Loading your apps…'); const list = el('div');
    body.append(para('Select apps to mention in your next message. Selection adds a reference; it does not grant new permissions.'), search, status, list);
    let snapshot;
    const draw = () => {
      list.replaceChildren();
      const q = search.value.trim().toLowerCase();
      for (const app of (snapshot?.data || []).filter(a => `${a.name} ${a.description || ''}`.toLowerCase().includes(q))) {
        const runtime = snapshot.installed?.find(a => a.id === app.id);
        const on = (selected.get(target) || []).some(a => a.id === app.id);
        const usable = agent.chatgptApps && app.isAccessible && app.isEnabled !== false && runtime?.callable !== false;
        const card = el('section', { class: 'ac-card' }, el('strong', { text: app.name }), para(app.description || ''),
          para(!app.isAccessible ? 'Not connected' : app.isEnabled === false || runtime?.enabled === false ? 'Disabled by app settings' : runtime?.callable === false ? 'No tools available in this runtime' : runtime?.callable ? `Tools available · ${snapshot.scope}` : 'Connected · tool availability not verified'));
        const toggle = button(on ? 'Remove from next message' : 'Use in next message', () => {
          const values = selected.get(target) || [];
          if (!on && values.length >= 10) throw new Error('Choose up to 10 apps for one message.');
          selected.set(target, on ? values.filter(a => a.id !== app.id) : [...values, { id: app.id, name: app.name }]); draw(); paintSelection(agentId);
        }); toggle.disabled = !usable && !on; card.append(toggle);
        if (chatId) card.append(button('See tools', async () => {
          const details = sheet(`${app.name} tools`); details.body.append(para('Loading…'));
          try {
            const r = await api().capabilities({ kind: 'appTools', chatId, appId: app.id });
            details.body.replaceChildren(); const tools = r.apps?.[0]?.toolSummaries || [];
            if (!tools.length) details.body.append(para('No tools were returned for this app.'));
            for (const t of tools) details.body.append(el('section', { class: 'ac-card' }, el('strong', { text: t.title || t.name }), para(t.description), para(t.isEnabled === false ? `Unavailable: ${t.disabledReason || 'disabled'}` : t.isReadOnly ? 'Reads information' : 'May change information')));
          } catch (err) { details.body.replaceChildren(para(`Tools unavailable: ${err.message}`)); }
        }));
        if (!app.isAccessible && /^https:\/\//.test(app.installUrl || '')) card.append(button('Connect app…', () => window.hub.openExternal(app.installUrl)));
        list.append(card);
      }
      if (!list.childElementCount) list.append(para('No apps match.'));
    };
    const load = async () => {
      status.textContent = 'Loading your apps…';
      try {
        snapshot = await api().capabilities({ kind: 'apps', refresh: true });
        if (chatId) { try { snapshot.installed = (await api().capabilities({ kind: 'installed', chatId })).apps; snapshot.scope = 'this chat'; } catch { /* account catalog remains explicitly labeled */ } }
        if (!d.isConnected) return;
        status.textContent = `${snapshot.data.length} apps · checked ${new Date(snapshot.checkedAt).toLocaleTimeString()}${snapshot.runtimeError ? ' · runtime availability unavailable' : ''}`; draw();
      } catch (err) { status.textContent = `Apps unavailable: ${err.message}`; list.replaceChildren(); }
    };
    if (!agent.chatgptApps) body.prepend(para('ChatGPT apps are off for this agent.'), button('Enable ChatGPT apps for this agent', async () => {
      agent.chatgptApps = true; await saveConfig(); d.close(); await apps(agentId);
    }));
    body.append(button('Refresh apps', load)); search.addEventListener('input', draw); await load();
  }
  async function connections(agentId) {
    agentFor(agentId); const chatId = Native.chatOf(agentId)?.id;
    const { d, body } = sheet('Astra connection health');
    const status = para('Loading this chat’s connections…'); const list = el('div');
    body.append(para('These are the tools loaded for this chat. Refresh after sending a message if you changed permissions.'), status, list);
    const load = async () => {
      try {
        const r = await api().capabilities({ kind: 'connections', chatId }); if (!d.isConnected) return;
        status.textContent = `${r.data.length} connections · checked ${new Date(r.checkedAt).toLocaleTimeString()}`; list.replaceChildren();
        for (const s of r.data) {
          const tools = el('details', {}, el('summary', { text: `${s.tools.length} tools` }));
          for (const t of s.tools) tools.append(para(`${t.name} — ${t.readOnly ? 'read only' : 'may change information'}${t.description ? ` · ${t.description}` : ''}`));
          list.append(el('section', { class: 'ac-card' }, el('strong', { text: s.name }), para(`${s.runtimeStatus} · sign-in: ${s.authStatus}`), ...(s.error ? [para(s.error)] : []), tools));
        }
        if (!r.data.length) list.append(para('No connections are loaded in this chat. Enable tools in AI setup, then send a message.'));
      } catch (err) { status.textContent = err.message; list.replaceChildren(); }
    };
    body.append(button('Refresh connections', load), button('AI setup', () => { d.close(); Commands.exec('/connections', agentId); })); await load();
  }
  async function models(agentId) {
    const agent = agentFor(agentId); const target = Native.chatOf(agentId);
    const { d, body } = sheet('Available Astra models'); const status = para('Loading model capabilities…'); body.append(status);
    try {
      const r = await api().capabilities({ kind: 'models', refresh: true }); if (!d.isConnected) return;
      status.textContent = 'Choose a model and reasoning depth for this chat. Your current settings stay until you choose Apply.';
      if (!target) body.append(para('Send your first message to create a chat, then choose its model here.'));
      for (const m of r.data.filter(m => !m.hidden)) {
        const efforts = m.supportedReasoningEfforts.filter(x => ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(x.reasoningEffort));
        const select = el('select', { 'aria-label': `${m.displayName} reasoning` }, ...efforts.map(e => el('option', { value: e.reasoningEffort, text: e.reasoningEffort })));
        const wanted = target?.effort || agent.effort || 'max';
        select.value = efforts.some(e => e.reasoningEffort === wanted) ? wanted : efforts.at(-1)?.reasoningEffort || '';
        const apply = button('Apply to this chat', async () => {
          if (!target || Native.chatOf(agentId)?.id !== target.id) throw new Error('The active chat changed. Open the model picker again.');
          target.model = m.model; if (select.value) target.effort = select.value; else delete target.effort;
          Native.save(target); Native.refresh(agentId, { keepScroll: true }); d.close(); toast(`${m.displayName} · ${select.value || 'default reasoning'} from the next reply`);
        }); apply.disabled = !target;
        body.append(el('section', { class: 'ac-card' }, el('strong', { text: m.displayName }), para(m.description), para(`Accepts ${(m.inputModalities || []).join(', ') || 'unspecified input'}`), select, apply));
      }
    } catch (err) { status.textContent = `Models unavailable: ${err.message}`; }
  }
  async function steer(agentId, text) {
    agentFor(agentId); const chat = Native.chatOf(agentId); const turnId = turns.get(chat?.id);
    if (!chat || !turnId || !Native.isBusy(chat.id)) throw new Error('No active Astra reply is ready for a follow-up.');
    await api().steer({ chatId: chat.id, turnId, text });
  }
  function question(event) {
    const fields = new Map(); const card = el('section', { class: 'ac-card ac-question' });
    const state = para(event.blocking ? 'Astra is waiting for your answer.' : 'Astra has a question. You can answer while it continues.'); card.append(state);
    for (const q of event.questions) {
      const field = el('fieldset', {}, el('legend', { text: q.question }));
      const input = el('input', { type: q.isSecret ? 'password' : 'text', placeholder: 'Your answer…', 'aria-label': q.question, autocomplete: 'off' });
      for (const o of q.options || []) field.append(button(o.label, () => { input.value = o.label; input.dispatchEvent(new Event('input')); }), para(o.description || ''));
      field.append(input); fields.set(q.id, input); card.append(field);
    }
    let sending = false;
    const submit = async skip => {
      if (sending || !questions.has(event.token)) return;
      const answers = Object.create(null);
      if (!skip) for (const [id, input] of fields) { if (!input.value.trim()) throw new Error('Answer each question, or choose Skip.'); answers[id] = { answers: [input.value.trim()] }; }
      sending = true; send.disabled = skipBtn.disabled = true;
      try { await api().answer({ chatId: event.chatId, token: event.token, answers }); state.textContent = skip ? 'Question skipped.' : 'Answer sent.'; }
      catch (err) { sending = false; send.disabled = skipBtn.disabled = false; throw err; }
    };
    const send = button('Send answer', () => submit(false)); const skipBtn = button('Skip', () => submit(true)); card.append(send, skipBtn);
    questions.set(event.token, { chatId: event.chatId, card, state, fields });
    if (!Native.liveCard(event.chatId, card)) { questions.delete(event.token); api().answer({ chatId: event.chatId, token: event.token, answers: {} }).catch(() => {}); }
  }
  function resolved(token) {
    const q = questions.get(token); if (!q) return; questions.delete(token);
    q.state.textContent = 'Question closed.';
    for (const input of q.fields.values()) input.value = ''; // secrets and answers never persist in chat history
    for (const node of q.card.querySelectorAll('input,button')) node.disabled = true;
  }
  async function event(e) {
    if (e.type === 'codexTurn') { if (Native.isBusy(e.chatId)) turns.set(e.chatId, e.turnId); }
    else if (e.type === 'codexQuestion') question(e);
    else if (e.type === 'codexQuestionResolved') resolved(e.token);
    else if (e.type === 'codexSteered') {
      const chat = await Native.load(e.chatId); if (!chat) return;
      chat.messages.push({ role: 'user', text: e.text, steered: true, at: Date.now() }); chat.updatedAt = Date.now(); Native.save(chat);
      if (Native.chatOf(chat.agentId)?.id === chat.id) Native.refresh(chat.agentId, { keepScroll: true });
    }
  }
  function open(agentId) {
    agentFor(agentId); const { d, body } = sheet('Astra tools');
    for (const [label, run] of [['Connected apps', apps], ['Connection health', connections], ['Models and reasoning', models]]) body.append(button(label, () => { d.close(); return run(agentId); }));
    const input = el('textarea', { placeholder: 'Add guidance to the reply that is running…', 'aria-label': 'Follow-up for current reply' });
    body.append(para('Steer the current reply'), input, button('Send follow-up now', async () => { await steer(agentId, input.value); d.close(); }));
    body.append(para('Ordinary messages typed during a reply still queue for the next turn.'));
  }
  Native.hooks.options.push((id, chat, raw, last, options, meta) => {
    if (H.agent(id)?.engine !== 'codex' || meta.compact) return;
    if (!meta.fromHistory) {
      const values = selected.get(chat.id) || selected.get(`new:${id}`);
      if (values?.length) last.appMentions = values;
      selected.delete(chat.id); selected.delete(`new:${id}`);
    }
    if (last.appMentions?.length) options.appMentions = last.appMentions;
    paintSelection(id);
  });
  Native.hooks.finish.push((e) => { turns.delete(e.chatId); for (const [token, q] of questions) if (q.chatId === e.chatId) resolved(token); });
  Native.hooks.render.push(id => paintSelection(id));
  Commands.register({ name: 'astra-tools', desc: 'Astra apps, live tools, models and follow-ups', area: 'Chat', run: (_, ctx) => open(ctx.agentId) });
  Commands.register({ name: 'astra-apps', desc: 'Find connected apps and mention them in your next message', area: 'Chat', run: (_, ctx) => apps(ctx.agentId) });
  Commands.register({ name: 'astra-connections', desc: 'Inspect this Astra chat’s live tools and connection health', area: 'Chat', run: (_, ctx) => connections(ctx.agentId) });
  Commands.register({ name: 'astra-models', desc: 'Choose from available models and supported reasoning depths', area: 'Chat', run: (_, ctx) => models(ctx.agentId) });
  Commands.register({ name: 'astra-steer', args: '<follow-up>', desc: 'Send guidance into the Astra reply that is running', area: 'Chat', run: (text, ctx) => steer(ctx.agentId, text) });
  return { open, apps, connections, models, steer, event };
})();
