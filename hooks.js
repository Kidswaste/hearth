// ⚡ Hooks (round 26): "When <something happens>, <this AI> does <this>". The owner asked for hooks that give the AI
// more reach; they live in ⋯ AI setup ("Hooks: when… then…"), a short list per AI with add / pause / remove, in plain
// words. What Hearth can really notice: a render or export finishing (the render queue), the Lab scene showing an
// error (tools/three.js tells 'hearth:lab-error'), a file landing in a folder you pick (hooksmain.js: fs.watch in the
// main process, only while a hook asks), a time of day or every few hours (while Hearth is open), Hearth updating
// from main, another AI finishing a reply, the mood board getting new things.
// What the AI then gets: your words, as you wrote them, under one line from Hearth saying what happened (the render's
// path, the error…), both visible in the chat; or a mission (missions.js) run with them.
// Guard rails: once a minute at most per hook (later news waits, the newest one goes); never while that AI answers
// (it waits its turn, after anything you typed meanwhile); "⚡ hook" on the message and a note when it fires; the
// same news twice in 10 minutes is told once; 10 fires in an hour pause the hook by itself (a loop); a reply to a
// hook never sets off "another AI replied" hooks (no ping-pong); ❚❚ pauses them all. Nothing else changes: the AI
// asks before anything risky exactly as when you type (Access.ask), hooks have no powers of their own.
// Stored on the AI (agent.hooks, like agent.instructions; never in the system prompt); when they last fired, per
// computer (localStorage 'hooks.state').
const Hooks = (() => {
  const C = HooksCore;
  let state = store.get('hooks.state', {}) || {};
  let stateT = null;
  const keepState = () => { clearTimeout(stateT); stateT = setTimeout(() => store.set('hooks.state', state), 400); };
  const paused = () => store.get('hooks.paused', false) === true;
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const all = () => natives().flatMap((a) => C.listOf(a).map((h) => ({ a, h })));
  const nameOf = (id) => H.agent(id)?.name || 'that AI';
  const missionName = (id) => { const m = typeof Missions !== 'undefined' ? Missions.LIST.find((x) => x.id === id) : null; return m ? `${m.icon} ${m.label}` : id; };
  const said = (h) => C.describe(h, { nameOf, missionName });
  const waiting = new Map(); // hook id → { agentId, q: { fact, n }, t }
  const recent = []; // [{ at, agentId, hookId, fact }] newest last (for /hooks)
  let tagNext = null; // { agentId, text, hook } the message being sent by a hook (marked when native.js sends it)

  // ---------- firing ----------
  // news for every hook on this kind of event (filter(h, agent): whether this hook wants it)
  function emit(kind, data, filter = () => true) {
    if (paused()) return 0;
    let n = 0;
    for (const { a, h } of all()) {
      if (!h.on || h.when.kind !== kind) continue;
      try { if (!filter(h, a)) continue; } catch { continue; }
      trigger(a.id, h, C.fact(kind, data));
      n += 1;
    }
    return n;
  }
  function trigger(agentId, h, factLine) {
    if (paused() || !h.on) return 'paused';
    const g = C.gate(state[h.id], Date.now(), factLine);
    if (g.skip) return g.skip;
    if (g.cap) { pauseHook(agentId, h.id, 'it fired 10 times in an hour'); return 'capped'; }
    if (g.wait || Native.isAgentBusy(agentId)) { hold(agentId, h, factLine, g.wait || 0); return 'waiting'; }
    fire(agentId, h, factLine);
    return 'fired';
  }
  // too soon, or the AI is answering: one waiting fire per hook, the newest news (and how many came)
  function hold(agentId, h, factLine, ms) {
    const w = waiting.get(h.id);
    if (w && ['time', 'every'].includes(h.when.kind)) return; // a timer already waiting
    clearTimeout(w?.t);
    const q = C.coalesce(w?.q, factLine);
    waiting.set(h.id, { agentId, q, t: setTimeout(flush, Math.max(1500, ms + 200)) });
  }
  function flush() {
    for (const [id, w] of [...waiting]) {
      const h = C.listOf(H.agent(w.agentId)).find((x) => x.id === id);
      if (!h || !h.on || paused()) { clearTimeout(w.t); waiting.delete(id); continue; }
      if (Native.isAgentBusy(w.agentId)) { clearTimeout(w.t); w.t = setTimeout(flush, 15000); continue; } // its reply's end flushes sooner
      const g = C.gate(state[id], Date.now());
      if (g.cap) { waiting.delete(id); pauseHook(w.agentId, id, 'it fired 10 times in an hour'); continue; }
      if (g.wait) { clearTimeout(w.t); w.t = setTimeout(flush, g.wait + 200); continue; }
      clearTimeout(w.t); waiting.delete(id);
      fire(w.agentId, h, C.queuedFact(w.q));
    }
  }
  function fire(agentId, h, factLine) {
    const now = Date.now();
    state[h.id] = { ...C.fired(state[h.id], now, factLine), armed: state[h.id]?.armed };
    keepState();
    recent.push({ at: now, agentId, hookId: h.id, fact: factLine });
    if (recent.length > 30) recent.shift();
    const when = C.whenText(h.when, nameOf);
    const text = C.compose(factLine, h.then.text);
    tagNext = { agentId, text, hook: { id: h.id, when } };
    Native.ensureChat(agentId); // (the note belongs to the chat the message goes to)
    Native.note(agentId, `⚡ hook · ${when}`, { id: `hook-${h.id}`, actions: [{ label: 'Hooks…', title: 'See, pause or remove this AI\'s hooks', run: () => openSetup(agentId) }] });
    const failed = (err) => { tagNext = null; Native.note(agentId, `⚡ hook couldn't send: ${err.message}`, { id: `hook-${h.id}` }); };
    if (h.then.kind === 'mission' && typeof Missions !== 'undefined') {
      const before = Missions.current(agentId);
      const once = before.id !== 'normal' && !Missions.isSticky(agentId); // you picked a mission for your next message: it stays yours
      Missions.set(agentId, h.then.mission);
      let handled = false;
      try { handled = Missions.submit(agentId, text); } catch (err) { failed(err); return; }
      if (once) Missions.set(agentId, before.id);
      if (handled) return;
    }
    Native.send(agentId, text).catch(failed);
  }
  function pauseHook(agentId, id, why) {
    const a = H.agent(agentId);
    if (!a) return;
    a.hooks = (a.hooks || []).map((x) => (x.id === id ? { ...x, on: false } : x));
    saveConfig();
    Native.note(agentId, `⚡ A hook paused itself (${why}): ${said(C.listOf(a).find((x) => x.id === id) || { when: { kind: 'render' }, then: { kind: 'message', text: '' } })}. Turn it back on in ⋯ AI setup.`, { id: `hook-${id}` });
    syncWatch();
  }
  // a test: fire now with a made-up line, through the same gate (once a minute still holds)
  function test(agentId, id) {
    const h = C.listOf(H.agent(agentId)).find((x) => x.id === id);
    if (!h) return 'No such hook.';
    const r = trigger(agentId, { ...h, on: true }, `(a test) ${C.whenText(h.when, nameOf)}`);
    return r === 'fired' ? 'Sent.' : r === 'waiting' ? 'It goes once the AI is free (or the minute is up).' : `Not now: ${r}.`;
  }
  const openSetup = (agentId) => { if (typeof Options !== 'undefined') Options.open({ agentId }); else window.Lazy?.load('options').then(() => Options.open({ agentId })).catch(() => {}); };

  // ---------- the chat side: mark hook messages, wait for replies to end ----------
  Native.hooks.send.push((agentId, chat, text) => {
    if (!tagNext || tagNext.agentId !== agentId || tagNext.text !== text) return;
    const m = chat.messages.at(-1);
    if (m?.role === 'user') { m.hook = tagNext.hook; Native.save(chat); }
    tagNext = null;
  });
  Native.hooks.message.push((node, m) => {
    if (!m.hook || m.role !== 'user') return;
    node.classList.add('hook-msg');
    node.querySelector('.msg-foot')?.prepend(el('span', { class: 'hook-chip', text: '⚡ hook', title: `Sent by a hook: ${m.hook.when}` }));
  });
  const visible = (s) => String(s || '').replace(/<[^>]+>/g, ' ');
  Native.hooks.finish.push((event, chat) => {
    if (waiting.size) setTimeout(flush, 1500); // after anything you typed meanwhile (native.js sends that at 250 ms)
    if (event.type !== 'done' || !chat) return;
    const asked = [...chat.messages].reverse().find((m) => m.role === 'user');
    if (asked?.hook) return; // a reply to a hook doesn't set off other hooks (no ping-pong)
    const who = H.agent(chat.agentId);
    emit('reply', { name: who?.name, title: chat.title, excerpt: visible(event.text) }, (h, a) => a.id !== chat.agentId && (h.when.from === 'any' || h.when.from === chat.agentId));
  });

  // ---------- the signals ----------
  addEventListener('hearth:lab-error', (e) => emit('labError', e.detail || {}));
  const seenJobs = new Set();
  window.Lazy?.when('renders', () => Renders.onChange((j, what) => {
    if ((what !== 'done' && what !== 'failed') || seenJobs.has(j.id)) return;
    seenJobs.add(j.id);
    emit('render', { title: j.title, output: j.output, failed: what === 'failed', reason: j.error?.reason });
  }));
  // the mood board: new things, counted per board a few seconds after they land
  const counts = new Map(); let boardT = null;
  window.Lazy?.when('board', () => {
    const b0 = Board.current(); if (b0) counts.set(b0.id, b0.items.length);
    Board.onChange((what) => {
      if (what !== 'items') return;
      clearTimeout(boardT);
      boardT = setTimeout(() => {
        const b = Board.current(); if (!b) return;
        const prev = counts.get(b.id); const n = b.items.length;
        counts.set(b.id, n);
        if (prev == null || n <= prev || !all().some(({ h }) => h.on && h.when.kind === 'board')) return;
        const kinds = [...new Set(b.items.slice(prev).map((it) => it.type).filter(Boolean))].slice(0, 4).join(', ');
        emit('board', { n: n - prev, board: b.name || Board.boards().find((x) => x.id === b.id)?.name, kinds });
      }, 4000);
    });
  });
  // Hearth updated: the updater's note of the last update (it may have come before this loaded)
  function updated(j) {
    if (!j?.at || j.at <= (store.get('hooks.updateSeen', 0) || 0)) return;
    store.set('hooks.updateSeen', j.at);
    if (Date.now() - j.at < 10 * 60000) emit('update', j);
  }
  document.addEventListener('hearth:updated', (e) => updated(e.detail));
  setTimeout(() => updated(store.get('update.last', null)), 3000);
  // a file in a folder: the main process watches the folders hooks ask for
  const norm = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
  window.hub.hooks?.onFile((d) => { if (!C.junk(d.path)) emit('file', d, (h) => norm(h.when.dir) === norm(d.dir)); });
  let watchKey = null;
  function syncWatch() {
    const dirs = paused() ? [] : [...new Set(all().filter(({ h }) => h.on && h.when.kind === 'file').map(({ h }) => h.when.dir))];
    const key = dirs.join('\n');
    if (key === watchKey) return;
    watchKey = key;
    window.hub.hooks?.watch(dirs).catch(() => {});
  }
  // timers (and the watched folders, after a config change from elsewhere): a calm check every 30 s
  function tick() {
    if (!paused()) {
      const now = Date.now();
      for (const { a, h } of all()) {
        if (!h.on || (h.when.kind !== 'time' && h.when.kind !== 'every')) continue;
        const rec = state[h.id] || (state[h.id] = {});
        if (h.when.kind === 'every' && !rec.armed) { rec.armed = now; keepState(); continue; }
        if (C.due(h.when, rec, now) && !waiting.has(h.id)) trigger(a.id, h, C.fact(h.when.kind, h.when));
      }
    }
    syncWatch();
  }
  setInterval(tick, 30000);
  setTimeout(tick, 2000);
  window.hub.onConfigChanged?.(() => setTimeout(syncWatch, 200));

  // ---------- ⋯ AI setup: "Hooks: when… then…" ----------
  // save(agent, patch) and repaint come from options.js (it keeps the live agent and the one in hand in step)
  function section(a, { save, repaint }) {
    const list = C.listOf(a);
    const put = async (next) => { await save(a, { hooks: next.length ? next : undefined }); syncWatch(); repaint(); };
    const ago = (t) => { if (!t) return 'not yet'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
    const rows = list.map((h, i) => el('div', { class: 'opt-rule hk-row' },
      el('input', { type: 'checkbox', checked: h.on, title: 'On / paused', on: { change: (e) => put(list.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x))) } }),
      el('span', { class: `opt-rule-text${h.on ? '' : ' off'}`, text: said(h), title: `It gets: ${h.then.text}\n\nLast fired: ${ago(state[h.id]?.last)} · double-click to change the words`,
        on: { dblclick: async () => { const t = await Modal.prompt('What it gets when this happens', { value: h.then.text, multiline: true }); if (t != null && t.trim()) put(list.map((x, j) => (j === i ? { ...x, then: { ...x.then, text: t.trim().slice(0, 2000) } } : x))); } } }),
      el('button', { type: 'button', class: 'ghost small', text: '▶', title: 'Try it now (a test: once a minute still holds)', on: { click: () => toast(test(a.id, h.id), { timeout: 2500 }) } }),
      el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Remove', on: { click: () => put(list.filter((_, j) => j !== i)) } })));
    const form = el('div', { class: 'hk-form', hidden: true });
    const addBtn = el('button', { type: 'button', class: 'ghost small', text: '＋ Add a hook', title: 'When something happens, this AI does something', disabled: list.length >= C.MAX_PER_AI, on: { click: () => { form.hidden = false; addBtn.hidden = true; buildForm(a, form, (h) => put([...list, h]), () => { form.hidden = true; addBtn.hidden = false; }); } } });
    const off = paused();
    const all1 = el('button', { type: 'button', class: `ghost small${off ? ' on' : ''}`, text: off ? '▶ Hooks are paused: resume' : '❚❚ Pause all', title: 'Every AI\'s hooks, on this computer', on: { click: () => { setPaused(!off); repaint(); } } });
    const head = el('div', { class: 'opt-row hk-head' }, el('span', { class: 'opt-label opt-sub', text: list.length ? `${list.length} hook${list.length === 1 ? '' : 's'}` : 'None yet' }), list.length || off ? all1 : null);
    const sec = el('section', { class: 'opt-sec hk-sec' }, el('h4', { class: 'opt-h', text: '⚡ Hooks: when… then…' }),
      el('p', { class: 'opt-hint', text: 'When something happens, it gets your words with one line from Hearth saying what happened. Once a minute at most, never while it answers.' }),
      head, el('div', { class: 'opt-rules' }, rows), addBtn, form);
    return sec;
  }
  function buildForm(a, box, done, cancel) {
    const when = el('select', { class: 'opt-pick opt-wide', attrs: { 'aria-label': 'When' } }, C.EVENTS.map((e) => el('option', { value: e.kind, text: `${e.icon} ${e.label}` })));
    const extra = el('div', { class: 'hk-extra' });
    let dir = '';
    const pickDir = el('button', { type: 'button', class: 'ghost small', text: 'Pick a folder…', on: { click: async () => { const p = await window.hub.pickFolder(dir || undefined, 'The folder to watch').catch(() => null); const got = Array.isArray(p) ? p[0] : p; if (got) { dir = got; pickDir.textContent = `📂 ${C.base(got)}`; pickDir.title = got; } } } });
    const at = el('input', { type: 'time', value: '09:00', class: 'opt-pick', attrs: { 'aria-label': 'Time of day' } });
    const every = el('select', { class: 'opt-pick', attrs: { 'aria-label': 'How often' } }, [1, 2, 3, 4, 6, 8, 12, 24].map((n) => el('option', { value: String(n), text: n === 1 ? 'every hour' : `every ${n} hours`, selected: n === 3 })));
    const from = el('select', { class: 'opt-pick', attrs: { 'aria-label': 'Which AI' } }, el('option', { value: 'any', text: 'any other AI' }), natives().filter((x) => x.id !== a.id).map((x) => el('option', { value: x.id, text: `${x.icon || ''} ${x.name}`.trim() })));
    const showExtra = () => { const k = when.value; extra.replaceChildren(...(k === 'file' ? [pickDir] : k === 'time' ? [at] : k === 'every' ? [every] : k === 'reply' ? [from] : [])); };
    when.addEventListener('change', showExtra); showExtra();
    const missions = typeof Missions !== 'undefined' ? Missions.LIST.filter((m) => m.id !== 'normal') : [];
    const then = el('select', { class: 'opt-pick opt-wide', attrs: { 'aria-label': 'Then' } }, el('option', { value: 'message', text: `💬 ${a.name} gets your message` }), missions.map((m) => el('option', { value: m.id, text: `${m.icon} ${m.label}, with your message` })));
    const words = el('textarea', { class: 'opt-own', rows: 3, placeholder: 'Your words: what it should do (“Look at the render and tell me what to fix”)' });
    const save = el('button', { type: 'button', class: 'primary small', text: 'Add', on: { click: () => {
      const h = C.normalize({ when: { kind: when.value, dir, at: at.value, every: every.value, from: from.value }, then: then.value === 'message' ? { kind: 'message', text: words.value } : { kind: 'mission', mission: then.value, text: words.value } });
      if (!h) { toast(when.value === 'file' && !dir ? 'Pick the folder first.' : 'Write what it should do.', { timeout: 2500 }); return; }
      done(h);
    } } });
    box.replaceChildren(el('div', { class: 'hk-line' }, el('span', { class: 'hk-w', text: 'When' }), when), extra,
      el('div', { class: 'hk-line' }, el('span', { class: 'hk-w', text: 'Then' }), then), words,
      el('div', { class: 'hk-acts' }, el('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: cancel } }), save));
    when.focus();
  }
  function setPaused(on) { store.set('hooks.paused', on || null); if (on) { for (const w of waiting.values()) clearTimeout(w.t); waiting.clear(); } syncWatch(); }

  // ---------- /hooks (the internal API: every hook, pause / resume all, test one) ----------
  if (!Commands.get('hooks')) {
    Commands.register({
      name: 'hooks', args: '[pause|resume|test <n>]', area: 'Chat', desc: 'This AI\'s hooks (when… then…): list them, pause or resume all, try one (set them up in ⋯ AI setup)',
      complete: () => ['pause', 'resume', 'test 1'].map((value) => ({ value })),
      run: async (args, ctx) => {
        const s = String(args || '').trim().toLowerCase();
        if (s === 'pause' || s === 'off') { setPaused(true); return '⚡ Every hook is paused (on this computer).'; }
        if (s === 'resume' || s === 'on') { setPaused(false); return '⚡ Hooks are on again.'; }
        const a = H.agent(ctx.agentId);
        const list = C.listOf(a);
        const t = /^test\s+(\d+)/.exec(s);
        if (t) { const h = list[Number(t[1]) - 1]; return h ? test(a.id, h.id) : `No hook ${t[1]}.`; }
        if (!list.length) return `${a?.name || 'This AI'} has no hooks yet: ⋯ → Hooks → ＋ Add a hook.`;
        return `**⚡ ${a.name}'s hooks**${paused() ? ' (all paused)' : ''}\n${list.map((h, i) => `${i + 1}. ${h.on ? '' : '❚❚ '}${said(h)}`).join('\n')}`;
      },
    });
  }

  return { section, emit, trigger, flush, test, setPaused, paused, syncWatch, tick, list: (agentId) => C.listOf(H.agent(agentId)), recent: () => recent.slice(), waiting: () => [...waiting.keys()], _state: () => state };
})();
