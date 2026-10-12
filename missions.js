// Missions (round 26): what the next message you send becomes, picked with one click instead of a command. The owner:
// "give me more options for my next message now, like set it to agentic distribution, swarming, reviewing, start a
// jam from now on, stuff like that that used to be commands that are now gonna be missions for the next commissioned
// message". The ◎ button by the chat box (and the top of ⋯) lists them; a mission is for the next message only, or
// 📌 from now on in this chat's AI. Your message goes out as written: the mission only changes who answers and how
// (the commands behind them still run them: /council, /debate, /duo, /jam…).
const Missions = (() => {
  const LIST = [
    { id: 'normal', icon: '💬', label: 'Just answer', desc: 'A normal reply from this AI.' },
    { id: 'split', icon: '🧩', label: 'Split it up', desc: 'It deploys helper agents for parts of a big task and puts the pieces together (you see them live under the reply). A bit more context per message.' },
    { id: 'swarm', icon: '🐝', label: 'Swarm', desc: 'Several AIs and personas answer at once; a chair writes the final answer. In the Lab: a crew of 4 explores variations of the scene in parallel, you pick one.' },
    { id: 'review', icon: '🔍', label: 'Answer, then review', desc: 'It answers, then the other AI (Claude ↔ Astra) checks the answer and says what\'s wrong or missing.' },
    { id: 'debate', icon: '⚔', label: 'Debate', desc: 'They answer, read each other and reply for a few rounds, then one merged answer.' },
    { id: 'duo', icon: '👥', label: 'Side by side', desc: 'Claude and Astra answer side by side; pick one or merge them.' },
    { id: 'jam', icon: '🎛', label: 'Jam', desc: 'Claude and Astra take turns making a music visual in the Lab from your idea (4 rounds; Esc stops).' },
    { id: 'pair', icon: '⌨', label: 'Pair on code', desc: 'Astra drafts the code, then Claude and Astra improve it together.' },
    { id: 'everyone', icon: '📢', label: 'Ask everyone', desc: 'Sent to every AI marked for Ask all, each in its own chat.' },
  ];
  const byId = (id) => LIST.find((m) => m.id === id) || LIST[0];
  const next = new Map(); // agent id -> mission for the next message only
  const stickyKey = (agentId) => `mission.sticky.${agentId}`;
  function current(agentId) {
    const once = next.get(agentId);
    return byId(once || store.get(stickyKey(agentId), null) || 'normal');
  }
  const isSticky = (agentId) => !next.has(agentId) && (store.get(stickyKey(agentId), null) || 'normal') !== 'normal';
  const listeners = new Set();
  const changed = (agentId) => { for (const fn of listeners) { try { fn(agentId); } catch (err) { console.warn(err); } } };
  function set(agentId, id, { keep = false } = {}) {
    if (keep) { next.delete(agentId); store.set(stickyKey(agentId), id === 'normal' ? null : id); } else if (id === 'normal') { next.delete(agentId); store.set(stickyKey(agentId), null); } else next.set(agentId, id);
    changed(agentId);
  }

  // ---------- sending with a mission ----------
  const inLab = (agentId) => H.agent(agentId)?.dock === 'three';
  // fn(ok) once this chat's reply ends (ok: it answered; false: stopped or failed). The hook leaves after the loop that
  // calls the hooks (a splice during it would make that loop skip the next hook).
  const afterReply = (chatId, fn) => {
    const hook = (event, chat) => {
      if (chat?.id !== chatId) return;
      setTimeout(() => { const i = Native.hooks.finish.indexOf(hook); if (i >= 0) Native.hooks.finish.splice(i, 1); }, 0);
      setTimeout(() => fn(event.type === 'done'), 300);
    };
    Native.hooks.finish.push(hook);
  };
  // native.js asks before sending a typed message: true = handled here
  function submit(agentId, text) {
    const m = current(agentId);
    if (m.id === 'normal') return false;
    if (next.has(agentId)) { next.delete(agentId); changed(agentId); }
    const run = (line) => Commands.tryRun(line, agentId, undefined, { source: 'mission' }).catch((err) => toast(err.message, { type: 'error' }));
    const t = text.replace(/\s+/g, ' ').trim();
    if (m.id === 'swarm') return run(inLab(agentId) ? `/crew 4 ${t}` : `/council ${t}`), true;
    if (m.id === 'debate') return run(`/debate ${t}`), true;
    if (m.id === 'duo') return run(`/duo ${t}`), true;
    if (m.id === 'jam') return run(`/jam ${t}`), true;
    if (m.id === 'pair') return run(`/pair ${t}`), true;
    if (m.id === 'everyone') return run(`/all ${t}`), true;
    const chat = Native.ensureChat(agentId);
    if (m.id === 'split') {
      const had = chat.subagents;
      chat.subagents = true;
      if (!isSticky(agentId)) {
        afterReply(chat.id, () => {
          // the chat object may have been reloaded meanwhile: put it back on the live one too
          for (const c of new Set([chat, Native.chatOf(agentId)].filter((x) => x?.id === chat.id))) { if (had) c.subagents = had; else delete c.subagents; Native.save(c); }
        });
      }
    }
    if (m.id === 'review') afterReply(chat.id, (answered) => { if (answered) run('/opinion'); });
    Native.send(agentId, text).catch((err) => toast(err.message, { type: 'error' }));
    return true;
  }

  // ---------- the picker ----------
  function cards(agentId, { onPick } = {}) {
    const cur = current(agentId).id;
    const sticky = isSticky(agentId);
    return el('div', { class: 'ms-grid' }, LIST.map((m) => el('div', { class: `ms-card${cur === m.id ? ' on' : ''}`, title: m.desc },
      el('button', { type: 'button', class: 'ms-pick', on: { click: () => { set(agentId, m.id); onPick?.(); } } }, el('b', { text: `${m.icon} ${m.label}` }), el('span', { text: m.desc })),
      m.id === 'normal' ? null : el('button', { type: 'button', class: `ms-keep${cur === m.id && sticky ? ' on' : ''}`, text: '📌', title: 'From now on (every message in this AI\'s chats) · click again: back to next message only',
        on: { click: () => { set(agentId, cur === m.id && sticky ? 'normal' : m.id, { keep: !(cur === m.id && sticky) }); onPick?.(); } } }))));
  }
  function popover(agentId, anchor) {
    document.querySelector('.ms-pop')?.remove();
    const pop = el('div', { class: 'ms-pop', role: 'dialog', attrs: { 'aria-label': 'Mission for your next message' } },
      el('div', { class: 'ms-head' }, el('b', { text: 'Your next message will…' }), el('span', { class: 'hint', text: 'click: next message only · 📌 from now on' })),
      cards(agentId, { onPick: () => pop.remove() }));
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth))}px`;
    pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 8)}px`;
    const away = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); } };
    const esc = (e) => { if (e.key === 'Escape') { pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); } };
    addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true);
  }
  // the ◎ button in a chat box: shows the mission when there is one
  function button(agentId) {
    const b = el('button', { type: 'button', class: 'ghost ms-btn', title: 'Mission for your next message: split it up, swarm, review, debate, jam…' });
    const paint = () => {
      const m = current(agentId);
      b.classList.toggle('on', m.id !== 'normal');
      b.textContent = m.id === 'normal' ? '◎' : `${m.icon} ${m.label}${isSticky(agentId) ? ' 📌' : ''}`;
    };
    b.addEventListener('click', () => popover(agentId, b));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); set(agentId, 'normal'); }); // right-click: back to a normal reply
    listeners.add((id) => { if (id === agentId) paint(); });
    paint();
    return b;
  }
  return { LIST, current, set, submit, cards, button, isSticky };
})();
