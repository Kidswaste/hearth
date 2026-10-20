// Missions (round 26): what the next message you send becomes, picked with one click instead of a command. The owner:
// "give me more options for my next message now, like set it to agentic distribution, swarming, reviewing, start a
// jam from now on, stuff like that that used to be commands that are now gonna be missions for the next commissioned
// message". The ◎ button by the chat box (and the top of ⋯) lists them; a mission is for the next message only, or
// 📌 from now on in this chat's AI. Your message goes out as written: the mission only changes who answers and how
// (the commands behind them still run them: /council, /debate, /duo, /jam…).
// (round 26, missions2) Missions feel finished:
//   · one calm result card for every multi-AI mission (Swarm, Debate, Side by side, Pair, Ask everyone, Research and
//     Second opinion through the other AI): who took part as small avatars with a live status each (thinking / done /
//     failed), the final answer up front, the rest folded, "Use this one" / "Merge" where they apply, the tokens small.
//     Collaborations keep astra.js's logic and buttons (collabEl calls decorateCollab); the others are a "mission"
//     message drawn here.
//   · new missions that map to what Hearth already does: Plan first (a plan, your ▶ Go ahead, then the work),
//     Research (Astra searches the web and cites), Explain like a teacher, Second opinion only; rarer ones under More.
//   · the mission is kept on your message (a small chip on your bubble: "🐝 Swarm"), with ↻ to run it again.
//   A mission that adds words to what the AI receives says exactly which, on the chip (nothing is added silently).
const Missions = (() => {
  // needs: 'partner' = the other engine must exist (Claude ↔ Astra) · 'research' = an Astra (it searches the web)
  // more: listed under "More" in the picker (rarer)
  const LIST = [
    { id: 'normal', icon: '💬', label: 'Just answer', desc: 'A normal reply from this AI.' },
    { id: 'split', icon: '🧩', label: 'Split it up', desc: 'It deploys helper agents for parts of a big task and puts the pieces together (you see them live under the reply). A bit more context per message.' },
    { id: 'swarm', icon: '🐝', label: 'Swarm', needs: 'partner', desc: 'Several AIs and personas answer at once; a chair writes the final answer. In the Lab: a crew of 4 explores variations of the scene in parallel, you pick one.' },
    { id: 'plan', icon: '📝', label: 'Plan first', desc: 'It writes a short plan and waits: you press ▶ Go ahead (or change it), then it does the work.' },
    { id: 'research', icon: '🌐', label: 'Research', needs: 'research', desc: 'Astra searches the web and answers with its sources cited (from a Claude chat, Astra answers this one).' },
    { id: 'review', icon: '🔍', label: 'Answer, then review', needs: 'partner', desc: 'It answers, then the other AI (Claude ↔ Astra) checks the answer and says what\'s wrong or missing.' },
    { id: 'debate', icon: '⚔', label: 'Debate', needs: 'partner', desc: 'They answer, read each other and reply for a few rounds, then one merged answer.' },
    { id: 'duo', icon: '👥', label: 'Side by side', needs: 'partner', desc: 'Claude and Astra answer side by side; use one or merge them.' },
    { id: 'jam', icon: '🎛', label: 'Jam', more: true, needs: 'partner', desc: 'Claude and Astra take turns making a music visual in the Lab from your idea (4 rounds; Esc stops).' },
    { id: 'pair', icon: '⌨', label: 'Pair on code', more: true, needs: 'partner', desc: 'Astra drafts the code, then Claude and Astra improve it together.' },
    { id: 'teach', icon: '🎓', label: 'Explain like a teacher', more: true, desc: 'Step by step, simple examples, plain words, and one question at the end to check it landed.' },
    { id: 'other', icon: '👁', label: 'Second opinion only', more: true, needs: 'partner', desc: 'Only the other AI answers this one (it sees this chat\'s last reply); this chat\'s AI stays quiet.' },
    { id: 'everyone', icon: '📢', label: 'Ask everyone', more: true, desc: 'Sent to every AI marked for Ask all, each in its own chat; their answers gather in one card here.' },
  ];
  // What a mission adds to the words the AI receives (shown on the chip of your message; only these three add any).
  const NOTE = {
    plan: '[Mission: plan first. Don\'t do it yet. Reply with a short numbered plan (the steps in order, what you will make or change, and anything you need from me), then stop and wait for my go-ahead.]',
    teach: '[Mission: explain like a teacher. Go step by step with simple examples and plain words, define any jargon, and end with one short question that checks the key idea landed.]',
    research: '[Mission: research. Search the web for current, reliable sources; separate facts from guesses; cite each fact with a numbered link and end with a short Sources list.]',
  };
  // (round 26, labeasy) a place adds its own missions: Missions.add({ id, icon, label, desc, when(agentId) → shown for
  // this AI, hides: [ids it stands in for there], submit(agentId, text) → true when it handled the message })
  const ok = (fn, agentId) => { try { return !fn || Boolean(fn(agentId)); } catch { return false; } };
  function shown(agentId) {
    const mine = LIST.filter((m) => ok(m.when, agentId));
    const hidden = new Set(mine.flatMap((m) => (m.when ? m.hides || [] : [])));
    const here = mine.filter((m) => m.when); // a place's own missions come right after "Just answer"
    return [mine[0], ...here, ...mine.slice(1).filter((m) => !m.when)].filter((m) => !hidden.has(m.id));
  }
  function add(m) {
    if (!m?.id || LIST.some((x) => x.id === m.id)) return false;
    LIST.push({ icon: '◎', desc: '', ...m });
    return true;
  }
  const byId = (id, agentId) => (agentId === undefined ? LIST : shown(agentId)).find((m) => m.id === id) || LIST[0];
  const next = new Map(); // agent id -> mission for the next message only
  const stickyKey = (agentId) => `mission.sticky.${agentId}`;
  function current(agentId) {
    const once = next.get(agentId);
    return byId(once || store.get(stickyKey(agentId), null) || 'normal', agentId);
  }
  const isSticky = (agentId) => !next.has(agentId) && (store.get(stickyKey(agentId), null) || 'normal') !== 'normal';
  const listeners = new Set();
  const changed = (agentId) => { for (const fn of listeners) { try { fn(agentId); } catch (err) { console.warn(err); } } };
  function set(agentId, id, { keep = false } = {}) {
    if (keep) { next.delete(agentId); store.set(stickyKey(agentId), id === 'normal' ? null : id); } else if (id === 'normal') { next.delete(agentId); store.set(stickyKey(agentId), null); } else next.set(agentId, id);
    changed(agentId);
  }

  // ---------- who can do what ----------
  const partner = (agentId) => (typeof Native !== 'undefined' && Native.partnerOf ? Native.partnerOf(H.agent(agentId)) : null);
  const astraAgent = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && !a.dock) || H.agents().find((a) => a.mode === 'native' && a.engine === 'codex') || null;
  // why a mission can't run in this chat now (null: it can)
  function why(agentId, m) {
    const agent = H.agent(agentId);
    if (m.needs === 'partner' && !partner(agentId)) return `${m.label} needs ${agent?.engine === 'codex' ? 'a Claude' : 'an Astra'} chat agent too (＋ adds one).`;
    if (m.needs === 'research' && agent?.engine !== 'codex' && !astraAgent()) return 'Research needs an Astra agent (it searches the web): ＋ → Astra.';
    return null;
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
  // the chat object may have been reloaded meanwhile: a change goes on the live one too
  const chatsLike = (chat, agentId) => [...new Set([chat, Native.chatOf(agentId)].filter((x) => x?.id === chat.id))];
  // a per-chat setting for this message only (split: agents on; research on Astra: live web search)
  function forThisMessage(agentId, chat, key, value) {
    const had = chat[key];
    chat[key] = value;
    if (isSticky(agentId)) return;
    afterReply(chat.id, () => { for (const c of chatsLike(chat, agentId)) { if (had !== undefined) c[key] = had; else delete c[key]; Native.save(c); } });
  }
  const armed = new Map(); // agent id -> mission id: the user message Native.send pushes next gets the chip
  let broadcast = null; // an "Ask everyone" being sent: { m, rows }
  const run = (line, agentId) => Commands.tryRun(line, agentId, undefined, { source: 'mission' }).catch((err) => { toast(err.message, { type: 'error' }); return false; });
  // after a command ran: your message (and a collaboration's card) remember the mission
  function tagAfter(agentId, id, t0) {
    const chat = Native.chatOf(agentId);
    if (!chat) return;
    let n = 0;
    for (const m of chat.messages) {
      if ((m.at || 0) < t0 || m.mission) continue;
      if (m.role === 'user' || m.role === 'collab') { m.mission = id; n += 1; }
    }
    if (n) { Native.save(chat); Native.refresh(agentId, { keepScroll: true }); }
  }
  // native.js asks before sending a typed message: true = handled here
  function submit(agentId, text) {
    const id = take(agentId);
    return id ? start(agentId, id, text) : false;
  }
  // (round 36, capturefix) the mission picked for the message being typed, used up like a send would (a "next message
  // only" one is cleared): a message that waits (offline, or behind a running reply) keeps it and runs as it later
  function take(agentId) {
    const m = current(agentId);
    if (m.id === 'normal') return null;
    if (next.has(agentId)) { next.delete(agentId); changed(agentId); }
    return m.id;
  }
  // Runs a mission on a message (the composer's, or ↻ on a message sent with one). false: it can't (sent normally).
  function start(agentId, id, text) {
    const m = byId(id);
    const no = why(agentId, m);
    if (no) { toast(`${no} Sent as a normal message.`, { timeout: 4000 }); return false; }
    const t = text.replace(/\s+/g, ' ').trim();
    if (m.submit) return m.submit(agentId, text, t) !== false; // an added mission (Missions.add, e.g. the Lab's)
    // (round 33, swarmlean) past the weekly spending limit, a costly mission asks first (your words come back if not)
    if (typeof SwarmLean !== 'undefined' && SwarmLean.asks(agentId, m.id)) {
      SwarmLean.okToStart(agentId, m.id).then((yes) => { if (yes) begin(agentId, m, text, t); else Native.setDraft(agentId, text); });
      return true;
    }
    return begin(agentId, m, text, t);
  }
  function begin(agentId, m, text, t) {
    const id = m.id;
    const t0 = Date.now();
    const viaCommand = (line) => { run(line, agentId).then(() => tagAfter(agentId, id, t0)); return true; };
    if (m.id === 'swarm') return viaCommand(inLab(agentId) ? `/crew 4 ${t}` : `/council ${t}`);
    if (m.id === 'debate') return viaCommand(`/debate ${t}`);
    if (m.id === 'duo') return viaCommand(`/duo ${t}`);
    if (m.id === 'jam') return viaCommand(`/jam ${t}`);
    if (m.id === 'pair') return viaCommand(`/pair ${t}`);
    if (m.id === 'everyone') { askEveryone(agentId, text); return true; }
    if (m.id === 'other') { askOther(agentId, 'other', text, partner(agentId)); return true; }
    const agent = H.agent(agentId);
    if (m.id === 'research' && agent?.engine !== 'codex') {
      const a = astraAgent();
      askOther(agentId, 'research', text, a, { webSearch: 'live', persona: `${(typeof Astra !== 'undefined' && Astra.PERSONAS?.researcher?.text) || 'You are a careful researcher.'} Search the web for current, reliable sources and cite each fact with a numbered link; end with a short Sources list.` });
      return true;
    }
    arm(agentId, m.id, Native.ensureChat(agentId));
    armed.set(agentId, m.id);
    Native.send(agentId, text).catch((err) => { armed.delete(agentId); toast(err.message, { type: 'error' }); });
    return true;
  }

  // What a mission sent as this chat's own message sets up for its one reply (split: helper agents on; research on Astra:
  // live web search; review: the other AI checks it after; plan: ▶ Go ahead under it). (round 36) Also called by
  // offline.js when that message is sent again after it failed (no internet, a busy AI): it goes out as the mission
  // again, not as a plain message (the words a mission adds are already in what is re-sent).
  function arm(agentId, id, chat) {
    if (!chat) return;
    if (id === 'split') forThisMessage(agentId, chat, 'subagents', true);
    if (id === 'research' && H.agent(agentId)?.engine === 'codex') forThisMessage(agentId, chat, 'web', 'live');
    if (id === 'review') afterReply(chat.id, (answered) => { if (answered) { if (typeof SwarmLean !== 'undefined') SwarmLean.markReview(agentId); run('/opinion', agentId); } });
    if (id === 'plan') {
      afterReply(chat.id, (answered) => {
        if (!answered) return;
        for (const c of chatsLike(chat, agentId)) { const r = c.messages.at(-1); if (r?.role === 'assistant') { r.plan = 'waiting'; Native.save(c); } }
        if (Native.chatOf(agentId)?.id === chat.id) Native.refresh(agentId, { keepScroll: true });
      });
    }
  }
  // the missions that go out as this chat's own message (Native.send): a failed one is sent again as it was (+ arm)
  const OWN = new Set(['split', 'review', 'plan', 'teach', 'research']);
  const ownSend = (agentId, id) => OWN.has(id) && !(id === 'research' && H.agent(agentId)?.engine !== 'codex') && !byId(id).submit;

  // ---------- result cards drawn here ("mission" messages: Ask everyone, Research / Second opinion via the other AI) ----------
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));
  const cap = (s, n) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const short = (t, n) => (typeof SwarmLean !== 'undefined' ? SwarmLean.brief(t, n) : cap(t, n));
  const clean = (t) => String(t || '').replace(/<(remember|suggest)>[\s\S]*?<\/\1>/gi, '').replace(/<progress\b[^>]*\/?>/gi, '').trim();
  const live = new Map(); // mission message id -> { m, chat, agentId } while it runs
  const tell = (phase, id) => { const L = live.get(id); if (L) document.dispatchEvent(new CustomEvent('hearth:mission', { detail: { phase, id, kind: L.m.kind, agentId: L.agentId, chatId: L.chat?.id, task: L.m.task, ms: L.m.ms, ok: L.m.rows.some((r) => r.status === 'done') } })); }; // (round 27) activity.js
  const personOf = (a, extra = {}) => ({ agentId: a.id, name: a.name, label: a.name, icon: a.icon || a.name?.[0] || '•', color: a.color || 'var(--accent)', ...extra });
  async function askOther(agentId, id, text, target, { webSearch = null, persona = null } = {}) {
    if (!target) { toast('No other AI is set up for this.', { type: 'error' }); return; }
    const host = H.agent(agentId);
    const chat = Native.ensureChat(agentId, text);
    const prev = [...chat.messages].reverse().find((x) => x.role === 'assistant');
    const at = Date.now();
    chat.messages.push({ role: 'user', text, at, mission: id });
    const m = { role: 'mission', kind: id, id: `ms${at.toString(36)}`, at, task: text, rows: [{ ...personOf(target), status: 'thinking' }], text: `(${target.name} is answering)` };
    chat.messages.push(m);
    live.set(m.id, { m, chat, agentId });
    tell('start', m.id);
    Native.save(chat); Native.refresh(agentId);
    const q = id === 'other' && prev
      ? `The user is working with ${host.name}. Its last reply:\n<reply>\n${cap(prev.text, 3000)}\n</reply>\n\nThe user now asks you for a second opinion (${host.name} won't answer this one):\n${text}`
      : text;
    const r = await window.hub.askOnce({ agentId: target.id, text: q, options: { lean: true, ...(webSearch ? { webSearch } : {}), ...(persona ? { persona } : {}) } }).catch((err) => ({ ok: false, error: err.message }));
    const row = m.rows[0];
    row.at = Date.now();
    if (r.ok) {
      Object.assign(row, { status: 'done', text: cap(clean(r.text), 12000), ...(r.usage ? { usage: r.usage } : {}) });
      if (r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: target.id, usage: r.usage, source: id === 'research' ? 'research' : 'second opinion' } }));
      m.text = `${target.name} (${byId(id).label.toLowerCase()}): ${row.text}`;
      // (round 33, swarmlean) the chat's context gets a short summary; the whole answer stays in the card
      m.ctx = `${target.name} (${byId(id).label.toLowerCase()}; summary, the full answer is in the card): ${short(row.text, 900)}`;
      for (const c of chatsLike(chat, agentId)) c.carry = `[Earlier in this chat, outside your session, ${target.name} answered the user's question "${cap(text, 300)}" (summary; the full answer is in the card on screen):\n${short(row.text, 900)}]`;
    } else Object.assign(row, { status: 'failed', error: r.error || 'No answer' });
    m.ms = Date.now() - at;
    finish(m.id);
  }
  // Ask everyone: /all as before (each AI in its own chat); their answers gather in one card in this chat.
  async function askEveryone(agentId, text) {
    const targets = H.agents().filter((a) => a.askAll !== false);
    const chat = Native.ensureChat(agentId, text);
    const at = Date.now();
    const m = { role: 'mission', kind: 'everyone', id: `ms${at.toString(36)}`, at, task: text, rows: targets.map((a) => personOf(a, { status: a.mode === 'native' ? 'sending' : 'sent', native: a.mode === 'native' })), text: '' };
    m.text = `(Asked everyone: ${m.rows.map((r) => r.name).join(', ')})`;
    if (!targets.some((a) => a.id === agentId)) chat.messages.push({ role: 'user', text, at, mission: 'everyone' }); // this AI isn't asked: your message still shows here
    live.set(m.id, { m, chat, agentId });
    tell('start', m.id);
    broadcast = { m, agentId, chatId: chat.id };
    // (round 33, swarmlean) the other AIs answer in a new chat of theirs: a question for everyone doesn't need (or pay
    // for) whatever unrelated chat is open there. A Lab director keeps its chat (its scene goes with it).
    for (const a of targets) if (a.mode === 'native' && a.id !== agentId && !a.dock && Native.chatOf(a.id)?.messages?.length && !Native.isAgentBusy(a.id)) H.activeChat[a.id] = null;
    await run(`/all ${text.replace(/\s+/g, ' ').trim()}`, agentId);
    broadcast = null;
    for (const r of m.rows) if (r.status === 'sending') Object.assign(r, { status: 'failed', error: 'Couldn\'t send (still answering?)' });
    // the card sits right after your message in this chat
    const c = Native.chatOf(agentId)?.id === chat.id ? Native.chatOf(agentId) : chat;
    const ui = c.messages.findLastIndex((x) => x.role === 'user' && x.mission === 'everyone' && x.at >= at - 50);
    c.messages.splice(ui >= 0 ? ui + 1 : c.messages.length, 0, m);
    live.get(m.id).chat = c;
    Native.save(c); Native.refresh(agentId, { keepScroll: true });
    if (!m.rows.some((r) => r.status === 'thinking')) finish(m.id);
  }
  // a reply ended somewhere: an Ask everyone row that waited for it
  function onFinish(event, chat) {
    for (const L of live.values()) {
      const row = L.m.kind === 'everyone' && L.m.rows.find((r) => r.chatId === chat.id && r.status === 'thinking');
      if (!row) continue;
      row.at = Date.now();
      if (event.type === 'done') Object.assign(row, { status: 'done', text: cap(clean(event.text), 12000), ...(event.usage ? { usage: event.usage } : {}) });
      else Object.assign(row, { status: event.type === 'stopped' ? 'stopped' : 'failed', ...(event.message ? { error: cap(event.message, 300) } : {}) });
      if (!L.m.rows.some((r) => r.status === 'thinking')) finish(L.m.id);
      else { Native.save(L.chat); repaint(L.m); }
    }
  }
  function finish(id) {
    const L = live.get(id);
    if (!L) return;
    if (L.m.kind === 'everyone') L.m.ms = Date.now() - L.m.at;
    tell('done', id);
    live.delete(id);
    const { m, chat } = L;
    if (m.kind === 'everyone') { m.ms = Date.now() - m.at; m.text = everyoneText(m); }
    chat.updatedAt = Date.now();
    Native.save(chat);
    repaint(m);
    if (m.rows.some((r) => r.status === 'done')) AppUI.replyFinished?.(L.agentId, chat.id, m.text);
  }
  const everyoneText = (m) => {
    const kept = m.rows[m.kept];
    return kept ? `(Asked everyone; the user kept ${kept.name}'s answer:)\n\n${kept.text}` : `(Asked everyone: ${m.rows.map((r) => `${r.name} ${r.status}`).join(', ')})`;
  };
  const paintTimers = new Map();
  function repaint(m) {
    if (paintTimers.has(m.id)) return;
    paintTimers.set(m.id, setTimeout(() => {
      paintTimers.delete(m.id);
      for (const node of document.querySelectorAll(`.mr-card[data-mid="${m.id}"]`)) node.replaceWith(resultCard(m, H.agent(node.dataset.host)));
    }, 80));
  }
  // "Use this one": your next message in this chat continues from it (like picking an answer of a collaboration)
  function keep(m, i, agentId) {
    const chat = Native.chatOf(agentId);
    const r = m.rows[i];
    if (!chat || !r?.text) return;
    m.kept = i;
    m.text = m.kind === 'everyone' ? everyoneText(m) : m.text;
    m.ctx = `(The user asked several AIs and kept ${r.name}'s answer; summary, the full answer is in the card:)\n${short(r.text, 900)}`;
    chat.carry = `[Earlier in this chat, outside your session, the user asked several AIs "${cap(m.task, 300)}" and kept ${r.name}'s answer (summary; the full answer is in the card on screen):\n${short(r.text, 900)}]`;
    Native.save(chat);
    repaint(m);
    toast(`Kept ${r.name}'s answer: your next message continues from it`, { timeout: 2200 });
  }

  // ---------- the shared look: head (who took part, live status, tokens) ----------
  const WORD = { thinking: 'thinking…', writing: 'writing the answer…', waiting: 'waiting', sending: 'sending…', done: 'done', failed: 'failed', stopped: 'stopped', sent: 'sent to its page', none: 'didn\'t answer' };
  function avatar(p) {
    return el('span', { class: `mr-av ${p.status}`, title: `${p.label || p.name} · ${WORD[p.status] || p.status}`, attrs: { style: `--c: ${p.color}` } },
      el('span', { class: 'mr-av-face', text: p.persona ? p.persona[0].toUpperCase() : String(p.icon || '•').slice(0, 2) }));
  }
  function head(mi, people, { tokens = 0, ms = 0, ctrl = null, onLabel = null, folded = false, task = '' } = {}) {
    const label = el('button', { type: 'button', class: 'mr-label', title: onLabel ? (folded ? 'Unfold' : 'Fold this card') : task, text: `${onLabel ? (folded ? '▸ ' : '▾ ') : ''}${mi.icon} ${mi.label}` });
    if (onLabel) label.addEventListener('click', onLabel);
    return el('div', { class: 'mr-head' }, label,
      el('span', { class: 'mr-people' }, people.map(avatar)),
      el('span', { class: 'spacer' }),
      tokens ? el('span', { class: 'mr-tok', text: `${fmt(tokens)} tokens${ms >= 1000 ? ` · ${Math.round(ms / 1000)} s` : ''}`, title: 'Tokens used by everyone who took part' }) : null,
      ctrl);
  }
  // one quiet line while it runs: "Claude thinking… · Astra done"
  const statusLine = (people) => el('div', { class: 'mr-status' }, people.map((p) => el('span', { class: `mr-st ${p.status}` }, el('i', { attrs: { style: `--c: ${p.color}` } }), `${p.label || p.name} ${WORD[p.status] || p.status}`)));
  const act = (label, title, fn, cls = '') => el('button', { type: 'button', class: `msg-act ${cls}`, text: label, title, on: { click: (e) => { e.stopPropagation(); fn(e); } } });
  const openFolds = new Set(); // cards whose "others" fold you opened
  function othersFold(id, summary, children, { open = false } = {}) {
    const d = el('details', { class: 'mr-others', open: open || openFolds.has(id) }, el('summary', { text: summary }), ...children);
    d.addEventListener('toggle', () => { if (d.open) openFolds.add(id); else openFolds.delete(id); });
    return d;
  }
  const answerBody = (text) => { const b = el('div', { class: 'body mr-answer' }); b.innerHTML = renderMarkdown(text); return b; };

  // An Ask everyone / Research / Second opinion card (message role "mission").
  function resultCard(m, agent) {
    const hostId = agent?.id;
    const running = live.has(m.id);
    const people = m.rows.map((r) => ({ ...r, status: !running && ['thinking', 'sending'].includes(r.status) ? 'none' : r.status }));
    const tokens = m.rows.reduce((n, r) => n + (r.usage ? (r.usage.input || 0) + (r.usage.output || 0) : 0), 0);
    const mi = byId(m.kind);
    const card = el('div', { class: `mr-card ${running ? 'running' : 'done'}`, dataset: { mid: m.id, host: hostId || '' } },
      head(mi, people, { tokens, ms: m.ms, task: m.task }));
    if (running) card.append(statusLine(people));
    const done = m.rows.map((r, i) => ({ r, i })).filter((x) => x.r.status === 'done');
    // the answer up front: the one you kept, or the first to answer
    const main = done.find((x) => x.i === m.kept) || [...done].sort((a, b) => (a.r.at || 0) - (b.r.at || 0))[0];
    if (main) {
      const by = el('div', { class: 'mr-by' }, avatar(people[main.i]), el('b', { text: main.r.name }),
        el('span', { class: 'hint', text: m.kept === main.i ? 'kept' : done.length > 1 ? 'first to answer' : m.kind === 'research' ? 'searched the web' : 'answered' }),
        main.r.usage ? el('span', { class: 'mr-tok', text: `${fmt((main.r.usage.input || 0) + (main.r.usage.output || 0))}` }) : null);
      card.append(el('div', { class: 'mr-final' }, by, answerBody(main.r.text)),
        el('div', { class: 'mr-acts' },
          act('Copy', 'Copy this answer', () => copyText(main.r.text, 'Answer copied')),
          hostId && m.kept !== main.i ? act('Use this one', 'Your next message here continues from it', () => keep(m, main.i, hostId), 'primary-act') : null,
          main.r.chatId && main.r.agentId !== hostId ? act('Open its chat', 'Go to that chat', () => { activate(H.surfaceIdFor(main.r.agentId)); Native.open(main.r.agentId, main.r.chatId); }) : null));
    }
    const rest = m.rows.map((r, i) => ({ r, i })).filter((x) => x !== main && x.i !== main?.i);
    if (rest.length) {
      const rows = rest.map(({ r, i }) => {
        const p = people[i];
        const d = el('details', { class: `mr-row ${p.status}` },
          el('summary', {}, avatar(p), el('b', { text: r.name }), el('span', { class: 'hint', text: r.status === 'done' ? cap(r.text.replace(/\s+/g, ' '), 90) : r.error || WORD[p.status] || p.status })));
        if (r.status === 'done') {
          d.addEventListener('toggle', () => {
            if (!d.open || d.querySelector('.mr-answer')) return;
            d.append(answerBody(r.text), el('div', { class: 'mr-acts' },
              hostId ? act('Use this one', 'Your next message here continues from it', () => keep(m, i, hostId), 'primary-act') : null,
              act('Copy', 'Copy this answer', () => copyText(r.text, 'Answer copied')),
              r.chatId && r.agentId !== hostId ? act('Open its chat', 'Go to that chat', () => { activate(H.surfaceIdFor(r.agentId)); Native.open(r.agentId, r.chatId); }) : null));
          });
        }
        return d;
      });
      const n = rest.filter((x) => x.r.status === 'done').length;
      card.append(othersFold(m.id, main ? `${rest.length} other${rest.length > 1 ? 's' : ''}${n ? ` · ${n} answered` : ''}` : `${rest.length} asked`, rows, { open: !main }));
    }
    if (!running && !done.length && m.rows.length === 1) card.append(el('div', { class: 'mr-error', text: m.rows[0].error || 'No answer' }));
    return card;
  }

  // A collaboration started by a mission (Swarm, Debate, Side by side, Pair): astra.js built the card and its buttons;
  // this lays it out the same calm way (its logic stays in astra.js).
  function seatStatus(m, i, running) {
    const ps = m.parts.filter((p) => p.seat === i);
    const r = ps.find((p) => p.status === 'running');
    if (r) return r.kind === 'final' ? 'writing' : 'thinking';
    const last = ps.at(-1);
    if (!last) return running ? 'waiting' : 'none';
    return last.status === 'error' ? 'failed' : last.status === 'stopped' ? 'stopped' : 'done';
  }
  function decorateCollab(card, m, { running = false, hostId = null } = {}) {
    const old = card.querySelector(':scope > .collab-head');
    if (!old) return card;
    const mi = byId(m.mission);
    const fold = old.querySelector('.collab-mode'); // its click folds the card (astra.js)
    const ctrl = old.lastElementChild; // ■ Stop or ⋯ (astra.js: run again, one more round, export…)
    const people = m.seats.map((s, i) => ({ agentId: s.agentId, name: s.name, label: s.label, persona: s.persona, color: s.color, icon: H.agent(s.agentId)?.icon || s.name?.[0], status: seatStatus(m, i, running) }));
    const tokens = m.parts.reduce((n, p) => n + (p.usage ? (p.usage.input || 0) + (p.usage.output || 0) : 0), 0);
    const top = head(mi, people, { tokens, ms: m.ms, ctrl, onLabel: () => fold?.click(), folded: m.folded, task: m.task });
    card.classList.add('mr-card');
    if (m.folded && !running) { old.replaceWith(top); return card; }
    const pick = (sel) => card.querySelector(`:scope > ${sel}`);
    const grid = pick('.collab-grid');
    const actions = pick('.collab-actions');
    const rounds = [...card.querySelectorAll(':scope > .collab-round')];
    const verdict = pick('.collab-verdict');
    const tail = [...card.querySelectorAll(':scope > .collab-error, :scope > .suggest-chips')];
    for (const b of card.querySelectorAll('.collab-col-foot .primary-act')) if (b.textContent === 'Pick this one') b.textContent = 'Use this one';
    // the answer up front: the final (merged / the chair's / the last pass) or the one you kept
    let main = pick('.collab-final');
    const kept = grid?.querySelector('.collab-part.picked');
    if (!main && kept && !running) { main = kept; grid.removeChild(kept); }
    main?.classList.add('mr-final');
    const others = [...rounds, ...(main && grid ? [grid] : []), ...(verdict ? [verdict] : [])];
    const body = [];
    if (running) body.push(statusLine(people));
    if (main) body.push(main); else if (grid) body.push(grid); // side by side: the answers to choose from
    if (actions && !running) body.push(actions);
    if (others.length) {
      const answers = m.parts.filter((p) => p.status === 'done' && p.kind !== 'final').length;
      const r = new Set(m.parts.map((p) => p.round).filter((x) => typeof x === 'number')).size;
      body.push(othersFold(m.id, main && (m.mode === 'duo' || m.mode === 'compare') ? `The other answer${m.seats.length > 2 ? 's' : ''}${verdict ? ' · the verdict' : ''}` : main ? `How they got there · ${answers} answer${answers === 1 ? '' : 's'}${r > 1 ? ` · ${r} rounds` : ''}` : `Watch them work${answers ? ` · ${answers} answer${answers === 1 ? '' : 's'} so far` : ''}`, others));
    }
    card.replaceChildren(top, ...body, ...tail);
    return card;
  }

  // ---------- on your message: the mission it was sent with, ↻ again ----------
  function chip(m, agent) {
    const mi = byId(m.mission);
    const note = NOTE[m.mission === 'research' && agent?.engine !== 'codex' ? '' : m.mission];
    return el('span', { class: 'ms-chip', title: `${mi.label}: ${mi.desc}${note ? `\nSent with this note to the AI: ${note}` : ''}` },
      el('span', { text: `${mi.icon} ${mi.label}` }),
      el('button', { type: 'button', class: 'ms-again', text: '↻', title: `Run it again with ${mi.label}`, on: { click: (e) => { e.stopPropagation(); if (Native.isAgentBusy(agent.id)) { toast(`${agent.name} is still answering`, { timeout: 2000 }); return; } start(agent.id, m.mission, m.text); } } }));
  }
  // Plan first: under the plan, ▶ Go ahead / change it (until you answer or the chat moves on)
  function planBar(agent, m) {
    const done = (how) => { m.plan = how; const c = Native.chatOf(agent.id); if (c) Native.save(c); };
    return el('div', { class: 'ms-plan' },
      el('span', { class: 'hint', text: 'The plan is ready.' }),
      act('▶ Go ahead', 'It does the work as planned', () => { done('approved'); Native.sendText(agent.id, 'Looks good: go ahead with the plan.'); }, 'primary-act'),
      act('✎ Change it', 'Write what to change; it updates the plan', () => { done('changed'); Native.setDraft(agent.id, 'Change the plan: '); Native.focus?.(agent.id); }),
      act('Not now', 'Leave the plan as it is', () => { done('dropped'); Native.refresh(agent.id, { keepScroll: true }); }));
  }
  function onMessage(node, m, index, agent) {
    if (m.role === 'mission') { node.className = 'msg mission-msg'; node.replaceChildren(resultCard(m, agent)); return; }
    if (m.role === 'user' && m.mission && agent) {
      const foot = node.querySelector(':scope > .user-foot');
      if (foot) foot.prepend(chip(m, agent)); else node.append(chip(m, agent));
      return;
    }
    if (m.role === 'assistant' && m.plan === 'waiting' && agent && Native.chatOf(agent.id)?.messages.at(-1) === m) {
      const foot = node.querySelector(':scope > .msg-foot');
      if (foot) foot.before(planBar(agent, m)); else node.append(planBar(agent, m));
    }
  }
  function onSend(agentId, chat, text) {
    const last = chat.messages.at(-1);
    if (last?.role !== 'user') return;
    if (broadcast) {
      const row = broadcast.m.rows.find((r) => r.agentId === agentId && r.status === 'sending');
      if (row) Object.assign(row, { status: 'thinking', chatId: chat.id });
      last.mission = 'everyone';
      last.missionFrom = { agentId: broadcast.agentId, chatId: broadcast.chatId }; // (round 36) offline.js: a failed one runs the whole ask again from there
      return;
    }
    const id = armed.get(agentId);
    if (!id) return;
    armed.delete(agentId);
    last.mission = id;
  }
  // the words a mission adds (Plan first, Explain like a teacher, Research on Astra): only for a message sent with it
  function onCompose(agentId, chat, raw, last) {
    const note = last?.mission && NOTE[last.mission];
    return note ? `${note}\n\n${raw}` : raw;
  }

  // ---------- the picker ----------
  function cards(agentId, { onPick } = {}) {
    const cur = current(agentId).id;
    const sticky = isSticky(agentId);
    const card = (m) => {
      const no = m.id === 'normal' ? null : why(agentId, m);
      // (round 33, swarmlean) a costly mission says what it will take, in one line (no extra click)
      const est = !no && m.id !== 'normal' && typeof SwarmLean !== 'undefined' ? SwarmLean.estimate(agentId, m.id) : null;
      return el('div', { class: `ms-card${cur === m.id ? ' on' : ''}${no ? ' off' : ''}`, title: no || m.desc },
        el('button', { type: 'button', class: 'ms-pick', attrs: { 'aria-pressed': String(cur === m.id) }, on: { click: () => { if (no) { toast(no, { timeout: 3500 }); return; } set(agentId, m.id); onPick?.(); } } }, el('b', { text: `${m.icon} ${m.label}` }), el('span', { text: no || m.desc }),
          est ? el('span', { class: `ms-est${est.over ? ' over' : ''}`, text: est.line, title: 'An estimate before it starts (input + output, all the AIs together); the result card shows what it really took' }) : null),
        m.id === 'normal' || no ? null : el('button', { type: 'button', class: `ms-keep${cur === m.id && sticky ? ' on' : ''}`, text: '📌', attrs: { 'aria-label': `${m.label}: from now on` }, title: 'From now on (every message in this AI\'s chats) · click again: back to next message only',
          on: { click: () => { set(agentId, cur === m.id && sticky ? 'normal' : m.id, { keep: !(cur === m.id && sticky) }); onPick?.(); } } }));
    };
    const here = shown(agentId);
    const more = here.filter((m) => m.more);
    const d = el('details', { class: 'ms-more', open: more.some((m) => m.id === cur) }, el('summary', { text: `More · ${more.map((m) => m.label.toLowerCase()).join(', ')}` }),
      el('div', { class: 'ms-grid' }, more.map(card)));
    return el('div', { class: 'ms-cards' }, el('div', { class: 'ms-grid' }, here.filter((m) => !m.more).map(card)), d);
  }
  let shut = null; // closes the open picker
  function popover(agentId, anchor) {
    shut?.();
    if (typeof SwarmLean !== 'undefined') SwarmLean.warm(); // the spending guard, when a limit is set
    document.querySelector('.ms-pop')?.remove();
    // (round 26, smooth26) every way it closes (a pick, opening it again too) takes its two page listeners with it
    const close = () => { pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); if (shut === close) shut = null; };
    shut = close;
    const pop = el('div', { class: 'ms-pop', role: 'dialog', attrs: { 'aria-label': 'Mission for your next message' } },
      el('div', { class: 'ms-head' }, el('b', { text: 'Your next message will…' }), el('span', { class: 'hint', text: 'click: next message only · 📌 from now on' })),
      cards(agentId, { onPick: close }));
    const info = typeof Astra !== 'undefined' && Astra.reasoning(agentId);
    if (info) {
      const chatId = Native.chatOf(agentId)?.id;
      const label = el('span', { class: 'hint', text: 'Loading reasoning options…' });
      const select = el('select', { disabled: true, attrs: { 'aria-label': 'Reasoning for this chat' } },
        el('option', { text: info.effort }));
      pop.prepend(el('div', { class: 'ms-head' }, el('b', { text: 'Reasoning' }), select, label));
      const same = () => Native.chatOf(agentId)?.id === chatId && Astra.reasoning(agentId)?.model === info.model;
      window.hub.codex.capabilities({ kind: 'models' }).then(r => {
        if (!pop.isConnected || !same()) return;
        const model = r.data.find(m => m.model === info.model || m.id === info.model);
        const efforts = model?.supportedReasoningEfforts || [];
        if (!efforts.length) throw new Error('No reasoning options');
        select.replaceChildren(el('option', { value: '', text: `Default · ${info.defaultEffort}` }),
          ...efforts.map(e => el('option', { value: e.reasoningEffort, text: e.reasoningEffort })));
        select.value = info.override || '';
        select.disabled = false;
        label.textContent = 'This chat · next reply';
      }).catch(() => { if (pop.isConnected) label.textContent = 'Options unavailable · try again online'; });
      select.addEventListener('change', () => {
        if (!same()) { close(); return; }
        Astra.setReasoning(agentId, select.value || null); changed(agentId);
      });
      label.title = 'Your default stays unchanged. Swarm helpers use their own team settings. Choosing a mode does not send a message.';
    }
    // (round 36, motionpolish) placed by its bottom-right corner above ◎, before it's in the page: its own size isn't
    // needed (measuring it forced a style + layout of the page as it opened), and opening "More" grows it upwards
    const place = () => {
      const r = anchor.getBoundingClientRect();
      pop.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
      pop.style.bottom = `${Math.max(8, Math.round(innerHeight - r.top + 8))}px`;
      pop.style.maxHeight = `${Math.max(160, Math.round(r.top - 16))}px`; pop.style.overflowY = 'auto';
    };
    place();
    document.body.append(pop);
    const away = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true);
  }
  // the ◎ button in a chat box: shows the mission when there is one
  function button(agentId) {
    const b = el('button', { type: 'button', class: 'ghost ms-btn', title: 'Mission for your next message: split it up, swarm, plan first, research, debate…' });
    const paint = () => {
      const m = current(agentId);
      b.classList.toggle('on', m.id !== 'normal');
      const info = typeof Astra !== 'undefined' && Astra.reasoning(agentId);
      const mode = m.id === 'normal' ? 'Solo' : `${m.icon} ${m.label}${isSticky(agentId) ? ' 📌' : ''}`;
      const t = info ? `${info.effort[0].toUpperCase()}${info.effort.slice(1)} · ${mode} ▾`
        : m.id === 'normal' ? '◎' : mode;
      b.setAttribute('aria-label', info ? `Astra reasoning and agents: ${t}` : 'Mission for your next message');
      if (b.textContent !== t) b.textContent = t;
    };
    b.addEventListener('click', () => popover(agentId, b));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); set(agentId, 'normal'); }); // right-click: back to a normal reply
    // (round 26, smooth26) a chat box built again leaves its old ◎ behind: its painter goes at the next change
    let shown = false;
    const fn = (id) => { if (b.isConnected) shown = true; else if (shown) { listeners.delete(fn); return; } if (id === agentId) paint(); };
    listeners.add(fn);
    paint();
    return b;
  }

  if (typeof Native !== 'undefined') { // native.js loads before this file
    Native.hooks.message.push(onMessage);
    Native.hooks.send.push(onSend);
    Native.hooks.compose.push(onCompose);
    Native.hooks.finish.push(onFinish);
    Native.hooks.render.push(id => changed(id));
  }
  return { LIST, NOTE, current, set, submit, take, start, arm, ownSend, cards, button, isSticky, why, decorateCollab, resultCard, add, shown, _live: live };
})();
