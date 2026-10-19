// (round 34, offline) Calm and dependable when things go wrong outside Hearth: no internet / flaky Wi-Fi, the engine's
// service busy or rate-limited, a usage limit with its reset time, the sign-in expired, the laptop slept mid-reply, a VPN
// or proxy in the way. Each case is read from the engine's own error (offline-core.js classify) and the OS's online /
// offline events, and shows as ONE plain line in the chat (the failed turn's error message, drawn calmly) with the one
// action that fits:
//   No internet — will send when you're back           the message waits (visible, cancellable) and goes out by itself
//                                                       once the internet is back, exactly once
//   Claude is busy right now — retrying in 20 s         bounded automatic retries with backoff (20 / 40 / 80 s);
//                                                       Cancel · Ask Astra instead
//   Usage limit reached until 18:00 — switch to Astra?  the reset time in this computer's local time; Switch (or, with
//                                                       no other AI, "Send at 18:00")
//   Signed out — Sign in                                the existing sign-in window (Hearth never sees passwords)
//   Reply cut off — the connection dropped             resumes by itself when the internet is back (a short "continue
//                                                       from …" on the SAME session, not the whole conversation again);
//                                                       the continuation is stitched into the cut reply, repeats dropped
// The queue (data/kv/offline-queue.json, this computer only) survives a restart; a message that was going out when Hearth
// closed is checked against its chat, so it is never sent twice. Messages typed while a reply ran (the chat's own
// queue) are kept across a restart too. Nothing is added to any prompt; waiting for the internet costs no tokens
// (offlinemain.js asks the OS and opens one TCP connection, only while something waits).
const Offline = (() => {
  if (typeof Native === 'undefined' || typeof OfflineCore === 'undefined') return {};
  const C = OfflineCore;
  const KV = 'offline-queue';
  const HELD = 'offline.held'; // the chat's own queue at the last close (localStorage: written synchronously on pagehide)
  let items = [];
  let online = navigator.onLine !== false;
  let forced = null; // tests: what the internet check answers (kept across a reload: dev/checks/offline.js)
  try { const t = localStorage.getItem('offline.test-net'); if (t === 'true' || t === 'false') forced = t === 'true'; } catch { /* no storage */ }
  let scale = 1; // tests: every wait × scale
  let lastWake = 0;
  let probeN = 0; let probeT = null; let wakeT = null; let tickT = null;
  let pumping = false; let pumpAgain = false; let flushing = null;
  let saving = Promise.resolve();
  const attempts = new Map(); // chatId → automatic busy retries so far
  const offTries = new Map(); // chatId → sends that failed for lack of internet in a row
  const now = () => Date.now();
  const uid = () => `q${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const short = (t, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const astraName = () => Native.astraAgent?.()?.name || 'Astra';
  const engineOf = (agent, chat) => chat?.engine || agent?.engine || 'claude';
  const whoOf = (agent, chat) => (engineOf(agent, chat) === 'codex' ? astraName() : 'Claude');
  const otherOf = (agent) => Native.partnerOf?.(agent) || null;
  const KINDS = new Set(['offline', 'busy', 'limit', 'signedout', 'proxy']);

  // ---------- the queue on disk ----------
  const save = () => { const snap = items.map((it) => ({ ...it })); saving = saving.then(() => window.hub.kvSet(KV, snap)).catch(() => {}); return saving; };
  function add(it) {
    // one automatic retry / continue per failed turn; a newer one replaces it
    if (it.kind !== 'new') items = items.filter((x) => !(x.chatId === it.chatId && x.kind !== 'new'));
    const item = { id: uid(), at: now(), status: 'waiting', ...it };
    // a retry of a failed turn goes before the messages typed after it (same chat, in order)
    if (item.kind !== 'new') { const i = items.findIndex((x) => x.chatId === item.chatId); if (i >= 0) items.splice(i, 0, item); else items.push(item); } else items.push(item);
    save(); paintAll(); schedule();
    return item;
  }
  function drop(pred) {
    const before = items.length;
    items = items.filter((x) => !pred(x));
    if (items.length !== before) { save(); paintAll(); schedule(); }
  }
  // After a restart: did the item that was going out reach its chat?
  async function wentOut(it) {
    if (it.kind === 'new') { const chat = it.chatId ? await Native.load(it.chatId).catch(() => null) : null; return C.reached(it, chat?.messages); }
    const chat = await Native.load(it.chatId).catch(() => null);
    const last = chat?.messages.at(-1);
    return !(last?.role === 'error' && last.at === it.errAt);
  }
  const ready = (async () => {
    // after the first screen (the agents and chats are known then)
    if (!performance.getEntriesByName('hearth:ready').length) await Promise.race([new Promise((r) => addEventListener('hearth:ready', r, { once: true })), new Promise((r) => setTimeout(r, 6000))]);
    let saved = [];
    try { saved = (await window.hub.kvGet(KV, [])) || []; } catch { /* none yet */ }
    const out = new Set();
    for (const it of saved.filter((x) => x?.status === 'sending')) if (await wentOut(it)) out.add(it.id);
    items = C.reconcile(saved, (it) => out.has(it.id));
    // the chat's own queue (typed while a reply ran) at the last close: it waits here now, in order
    let held = null;
    try { held = store.get(HELD, null); store.set(HELD, null); } catch { /* none */ }
    for (const h of Array.isArray(held) ? held : []) (h.texts || []).forEach((text, i) => { if (text?.trim()) items.push({ id: uid(), ...C.newItem({ agentId: h.agentId, chatId: h.chatId, text, reason: 'restart', mission: h.missions?.[i] }), at: now(), status: 'waiting' }); });
    if (items.length !== saved.length || out.size || saved.some((x) => x?.status === 'sending')) await save();
    paintAll();
    if (items.length) setTimeout(() => probeNow(), 1500);
  })();

  // ---------- online or not ----------
  async function check() {
    if (forced != null) return forced;
    try { const r = await window.hub.net?.probe?.(); if (r && typeof r.online === 'boolean') return r.online; } catch { /* no probe: the OS's word */ }
    return navigator.onLine !== false;
  }
  function setOnline(v) {
    if (online === v) return;
    online = v;
    document.documentElement.classList.toggle('net-offline', !v);
    if (v) {
      probeN = 0;
      const n = items.filter((it) => it.reason === 'offline' || it.kind === 'new').length;
      if (n) toast(`Back online — sending ${n === 1 ? 'the waiting message' : `${n} waiting messages`}`, { timeout: 2500 });
      pump();
    }
    schedule();
  }
  async function probeNow() {
    clearTimeout(probeT); probeT = null;
    let ok = await check();
    // the check can fail where the engines still get through (a proxy set only in the engine's own settings): after
    // a few failed checks while the OS says it's online, the send itself is the test (a failed one costs no tokens)
    if (!ok && forced == null && navigator.onLine !== false && probeN >= 3) ok = true;
    if (ok) { if (!online) setOnline(true); else pump(); return; }
    online = false;
    document.documentElement.classList.add('net-offline');
    probeN += 1;
    schedule();
  }
  // one timer: the next internet check while offline (only when something waits), else the next item's time
  function schedule() {
    clearTimeout(wakeT); wakeT = null;
    if (!online) {
      if (items.length && !probeT) probeT = setTimeout(probeNow, C.probeWait(probeN) * scale);
      return;
    }
    const ms = C.wakeIn(items, now());
    if (ms != null) wakeT = setTimeout(pump, ms + 30);
  }
  addEventListener('offline', () => setOnline(false));
  addEventListener('online', () => { probeN = 0; probeNow(); });
  window.hub.net?.onPower?.((d) => {
    if (d?.state !== 'resume') return;
    lastWake = d.at || now();
    setTimeout(probeNow, 2000 * scale); // the Wi-Fi takes a moment to come back after a wake
  });

  // ---------- sending what waits ----------
  const isBusy = (it) => (it.chatId ? Native.isBusy(it.chatId) : Native.isAgentBusy(it.agentId));
  async function pump() {
    await ready;
    if (pumping) { pumpAgain = true; return; }
    pumping = true;
    try {
      for (let guard = 0; guard < 40; guard++) {
        const it = C.nextDue(items, { online, now: now(), busy: isBusy });
        if (!it) break;
        await fire(it);
      }
    } catch (err) { console.warn('offline: pump', err); } finally {
      pumping = false; flushing = null;
      if (pumpAgain) { pumpAgain = false; setTimeout(pump, 30); } else schedule();
      paintAll();
    }
  }
  // A failed Ask everyone that runs again: its first try (your words, the card, the line) leaves the chat, so the new
  // try isn't shown twice. false: an AI answered it meanwhile (it isn't asked of everyone again).
  function dropFailedAsk(agentId, chat, at, text) {
    const i = chat.messages.findLastIndex((x) => x.role === 'user' && x.text === text && x.mission === 'everyone' && (x.at || 0) >= at - 60000);
    const card = chat.messages.findLast((x) => x.role === 'mission' && x.kind === 'everyone' && x.task === text && (x.at || 0) >= at - 60000);
    if (card?.rows?.some((r) => r.status === 'done' || r.status === 'thinking')) return false;
    const from = i >= 0 ? i : card ? chat.messages.indexOf(card) : -1;
    if (from < 0 || !chat.messages.slice(from).every((x) => x.role === 'error' || x.role === 'mission' || x === chat.messages[i])) return true;
    chat.messages.splice(from);
    Native.save(chat);
    if (H.activeChat[agentId] === chat.id) Native.refresh(agentId, { keepScroll: true });
    return true;
  }
  // (round 44, notify) a message that waited (no internet, a usage limit) went out while you were in another app
  const told = (it) => { if (it.kind !== 'continue' && (it.reason === 'offline' || it.reason === 'limit')) { try { window.Notify?.send({ type: 'back', reason: it.reason, agentId: it.agentId, chatId: it.chatId }); } catch { /* fine */ } } };
  async function fire(it) {
    it.status = 'sending';
    it.sentAt = now();
    // a message typed in a chat not started yet: its chat is made now (so a restart can find it there)
    if (it.kind === 'new' && !it.chatId) it.chatId = Native.ensureChat(it.agentId, it.text)?.id || null;
    await save(); // on disk as "going out" before it goes: after a crash, its chat says whether it went
    const done = () => { items = items.filter((x) => x !== it); return save(); };
    let popped = null; let chat = null;
    flushing = it;
    try {
      if (it.kind === 'new') {
        chat = it.chatId ? await Native.load(it.chatId).catch(() => null) : null;
        if (!chat) { await done(); return; } // its chat was deleted meanwhile
        // (round 36, capturefix) typed with a mission (Swarm, Ask everyone…): it runs as that mission, in its chat
        if (it.mission && typeof Missions !== 'undefined') {
          if (H.activeChat[it.agentId] !== chat.id) Native.open(it.agentId, chat.id);
          if (it.after && !dropFailedAsk(it.agentId, chat, it.after, it.text)) { await done(); return; }
          if (Missions.start(it.agentId, it.mission, it.text)) { await done(); return; }
        }
        await Native.send(it.agentId, it.text, { chatId: chat.id });
        await done();
        told(it);
        return;
      }
      chat = await Native.load(it.chatId).catch(() => null);
      const last = chat?.messages.at(-1);
      if (!last || last.role !== 'error' || last.at !== it.errAt) { await done(); return; } // you moved on: nothing to resend
      const before = chat.messages.at(-2);
      if (it.kind === 'retry' && before?.role !== 'user') { await done(); return; }
      if (it.kind === 'continue' && before?.role !== 'assistant') { await done(); return; }
      popped = chat.messages.pop(); // the calm line goes; the reply takes its place
      // (round 36) a message sent with a mission goes again as that mission (split: helpers on, review: checked after…)
      if (it.kind === 'retry' && before.mission && typeof Missions !== 'undefined' && Missions.ownSend?.(it.agentId, before.mission)) Missions.arm(it.agentId, before.mission, chat);
      if (it.kind === 'retry') await Native.send(it.agentId, before.text, { fromHistory: true, chatId: chat.id }); // same session: nothing re-sent that the engine has
      else if (popped.net?.crashed) await Native.send(it.agentId, C.continuePrompt(before.crashsafe === 'empty' ? '' : before.text, chat.messages.slice(0, -1).findLast((x) => x.role === 'user')?.text || ''), { chatId: chat.id }); // (round 50, crashsafe) Hearth closed mid-reply: the question goes along
      else await Native.send(it.agentId, C.continuePrompt(before.text), { chatId: chat.id });
      popped = null;
      await done();
      told(it);
    } catch (err) {
      if (popped && chat) chat.messages.push(popped);
      it.status = 'waiting';
      it.notBefore = now() + 5000 * scale;
      await save();
      console.warn('offline: send', err.message);
    } finally { flushing = null; }
  }

  // ---------- the chat's hooks ----------
  // what the flush sends is tagged (so a restart can tell it went); something you send yourself replaces the
  // automatic retry / continue waiting in that chat
  Native.hooks.send.push((agentId, chat, text) => {
    const last = chat.messages.at(-1);
    if (flushing && flushing.agentId === agentId) {
      if (flushing.kind === 'new' && last?.role === 'user' && last.text === flushing.text) { last.qid = flushing.id; flushing.chatId ||= chat.id; Native.save(chat); }
      if (flushing.kind === 'continue' && last?.role === 'user' && C.isContinue(last.text)) { last.cont = true; last.contOf = flushing.errAt; Native.save(chat); }
      return;
    }
    if (items.some((x) => x.chatId === chat.id && x.kind !== 'new')) drop((x) => x.chatId === chat.id && x.kind !== 'new');
    attempts.delete(chat.id);
  });

  // A continuation that ended: stitched into the reply it continues (the short "continue" line and the second reply
  // go), so the chat reads as one reply. Failed or stopped: what it wrote joins the cut reply too.
  function mergeContinue(chat, ended) {
    const ci = chat.messages.findLastIndex((m) => m.role === 'user' && m.cont);
    if (ci < 1 || ci < chat.messages.length - 3) return false;
    const cut = chat.messages[ci - 1];
    if (cut?.role !== 'assistant') return false;
    const after = chat.messages.slice(ci + 1);
    const reply = after.find((m) => m.role === 'assistant');
    if (reply) {
      cut.text = C.stitch(cut.text, reply.text);
      if (reply.usage) cut.usage = cut.usage ? { ...cut.usage, input: (cut.usage.input || 0) + (reply.usage.input || 0), output: (cut.usage.output || 0) + (reply.usage.output || 0) } : reply.usage;
      if (reply.tools?.length) cut.tools = [...(cut.tools || []), ...reply.tools];
      if (reply.thinking) cut.thinking = [cut.thinking, reply.thinking].filter(Boolean).join('\n\n');
    }
    if (ended === 'done' && reply && !reply.stopped) { delete cut.stopped; delete cut.cut; cut.resumed = (cut.resumed || 0) + 1; }
    chat.messages.splice(ci, 1 + (reply ? after.indexOf(reply) + 1 : 0)); // the "continue" line and the reply; an error stays
    return true;
  }

  Native.hooks.event.push((event, chat) => {
    if (!chat) return;
    const agentId = chat.agentId;
    const merged = ['done', 'stopped', 'error'].includes(event.type) && mergeContinue(chat, event.type);
    if (event.type === 'done') { attempts.delete(chat.id); offTries.delete(chat.id); }
    const ours = event.type === 'error' && handleError(event, chat);
    if (merged || ours) { Native.save(chat); if (H.activeChat[agentId] === chat.id) Native.refresh(agentId, { keepScroll: true }); }
    if (items.length) setTimeout(pump, 300); // a chat that was answering may be free for what waits
  });

  function handleError(event, chat) {
    const agentId = chat.agentId;
    const idx = chat.messages.length - 1;
    const m = chat.messages[idx];
    if (m?.role !== 'error') return false;
    const net = C.classify(event.message || m.text) || (m.needsLogin ? { kind: 'signedout' } : null);
    if (!net) return false;
    const prev = chat.messages[idx - 1];
    const cutReply = prev?.role === 'assistant' && prev.stopped && (prev.at === m.at || prev.cut) && ['offline', 'busy', 'proxy'].includes(net.kind);
    if (cutReply) {
      net.kind = 'cutoff';
      net.slept = now() - lastWake < 180000;
      prev.cut = true;
      // the engine had the turn (its session holds the question): continue on it instead of re-sending the conversation
      if (event.session?.id && !chat.session?.id) chat.session = event.session;
    }
    m.net = net;
    moveChatQueue(agentId, chat, net.kind);
    // Auto-improve owns its budget/retry decision. Offline replay must not bypass a paused cap.
    if(chat.messages.slice(0,idx).findLast(x=>x.role==='user')?.routine){net.gaveUp=true;return true;}
    // (round 36, capturefix) one AI's part of an Ask everyone: not re-sent here as a plain message; the whole ask runs
    // again once, from the chat it was asked in (its answers gather in a card there)
    const ask = net.kind !== 'cutoff' ? chat.messages.slice(0, idx).findLast((x) => x.role === 'user') : null;
    if (ask?.mission === 'everyone' && ask.missionFrom?.agentId && ['offline', 'busy'].includes(net.kind)) {
      if (net.kind === 'offline') { online = false; document.documentElement.classList.add('net-offline'); }
      const from = ask.missionFrom;
      if (!items.some((x) => x.kind === 'new' && x.mission === 'everyone' && x.agentId === from.agentId && x.text === ask.text)) {
        add({ ...C.newItem({ agentId: from.agentId, chatId: from.chatId, text: ask.text, reason: net.kind, mission: 'everyone' }), after: ask.at, notBefore: net.kind === 'busy' ? now() + C.backoff(1, net.retryAfterMs) * scale : 0 });
      }
      net.rerun = true;
      schedule();
      return true;
    }
    if (net.kind === 'offline') { online = false; document.documentElement.classList.add('net-offline'); }
    if (net.kind === 'offline') {
      const n = (offTries.get(chat.id) || 0) + 1;
      offTries.set(chat.id, n);
      add({ kind: 'retry', reason: 'offline', agentId, chatId: chat.id, errAt: m.at, notBefore: now() + C.resendWait(n - 1) * scale });
    } else if (net.kind === 'busy') {
      const n = (attempts.get(chat.id) || 0) + 1;
      attempts.set(chat.id, n);
      if (n <= C.MAX_TRIES) { const at = now() + C.backoff(n, net.retryAfterMs) * scale; add({ kind: 'retry', reason: 'busy', agentId, chatId: chat.id, errAt: m.at, notBefore: at }); net.attempt = n; } else net.gaveUp = true;
    } else if (net.kind === 'cutoff') {
      // still offline: it continues by itself once the internet is back; online again already: the Continue button
      check().then((ok) => {
        if (ok || chat.messages.at(-1) !== m) return;
        online = false;
        document.documentElement.classList.add('net-offline');
        add({ kind: 'continue', reason: 'offline', agentId, chatId: chat.id, errAt: m.at, notBefore: now() + 2000 * scale });
        redraw(agentId, chat);
      }).catch(() => {});
    }
    schedule();
    return true;
  }
  // Messages typed while that reply ran: they'd fail too. Offline / busy / cut off: they wait in this queue, after the
  // retry. Limit / signed out / blocked: back in the box, not sent.
  function moveChatQueue(agentId, chat, kind) {
    const v = Native.view(agentId);
    if (!v?.queue?.length || H.activeChat[agentId] !== chat.id) return;
    const texts = v.queue.splice(0).filter((t) => typeof t === 'string' && t.trim());
    const missions = texts.map((t) => { const id = v.queueMissions?.get(t) || null; v.queueMissions?.delete(t); return id; }); // (round 36) each keeps its mission
    Native.renderQueue?.(agentId);
    if (['offline', 'busy', 'cutoff'].includes(kind)) texts.forEach((text, i) => add(C.newItem({ agentId, chatId: chat.id, text, reason: kind, mission: missions[i] })));
    else if (texts.length) Native.insertDraft(agentId, texts.join('\n\n'));
  }

  // Typed while offline: it waits here instead of failing (a /command runs as usual, a message with files goes the
  // normal way and waits if it fails). (round 36) A mission picked for it waits with it and runs as that mission.
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (online || !form?.classList?.contains('composer')) return;
    const agent = H.agents().find((a) => Native.view(a.id)?.form === form);
    const v = agent && Native.view(agent.id);
    const text = v?.input.value.trim();
    if (!text || text.startsWith('/') || v.attachments?.length) return;
    const chatId = H.activeChat[agent.id] || null;
    if (chatId && Native.isBusy(chatId)) return; // the chat's own queue takes it (and comes here if the reply fails)
    e.preventDefault();
    e.stopImmediatePropagation();
    const mission = typeof Missions !== 'undefined' ? Missions.take?.(agent.id) || null : null; // used up as a send would
    add(C.newItem({ agentId: agent.id, chatId, text, mission }));
    v.input.value = '';
    try { store.set(`draft.${agent.id}.${chatId || 'new'}`, null); } catch { /* no storage */ }
    v.input.dispatchEvent(new Event('input', { bubbles: true }));
    probeNow();
  }, true);
  // the chat's own queue (typed while a reply runs) is kept across a restart (in memory only before)
  addEventListener('pagehide', () => {
    const held = [];
    for (const a of H.agents()) {
      const v = Native.view(a.id);
      const q = (v?.queue || []).filter((t) => typeof t === 'string' && t.trim());
      if (q.length) held.push({ agentId: a.id, chatId: H.activeChat[a.id] || null, texts: q, missions: q.map((t) => v.queueMissions?.get(t) || null) });
    }
    try { store.set(HELD, held.length ? held : null); } catch { /* no storage */ }
  });

  // ---------- drawing ----------
  // The failed turn's error message, drawn as one plain line + its action (the engine's words stay in the tooltip).
  Native.hooks.message.push((node, m, index, agent) => {
    if (m.role !== 'error') return;
    const net = m.net || C.classify(m.text) || (m.needsLogin ? { kind: 'signedout' } : null);
    if (!net) return;
    m.net = net; // (read once; its state, like "sign-in opened", lives through redraws)
    decorate(node, m, net, agent);
  });
  function itemFor(chatId, m) { return items.find((x) => x.chatId === chatId && x.errAt === m.at && x.kind !== 'new') || null; }
  function decorate(node, m, net, agent) {
    const chat = Native.chatOf(agent.id);
    const chatId = chat?.id || null;
    const foot = node.querySelector(':scope > .msg-foot');
    const live = Boolean(foot); // the last message of the chat: it gets the action
    const it = live ? itemFor(chatId, m) : null;
    const other = otherOf(agent);
    const kind = net.kind;
    const o = { who: whoOf(agent, chat), other: kind === 'busy' || kind === 'limit' ? other?.name || '' : '', resetAt: net.resetAt, now: now(), queued: Boolean(it), cancelled: !it, gaveUp: net.gaveUp || !it, slept: net.slept, crashed: net.crashed };
    if (kind === 'busy' && it) o.inS = Math.max(0, Math.ceil((it.notBefore - now()) / 1000));
    node.classList.add('net-note', `net-${kind}`);
    node.title = C.reasonOf(m.text).slice(0, 600);
    const body = node.querySelector(':scope > .body');
    const text = C.line(kind, o);
    const lineEl = el('span', { class: 'net-line' });
    if (kind === 'busy' && it) {
      const [pre] = text.split(/\d+ s$/);
      lineEl.append(pre, el('span', { class: 'net-count', dataset: { at: String(it.notBefore) }, text: String(o.inS) }), ' s');
      startTick();
    } else lineEl.textContent = text;
    if (kind === 'signedout') {
      node.querySelector(':scope > .login-btn')?.remove();
      lineEl.append(' ', el('button', { class: 'primary small login-btn', text: 'Sign in', dataset: { engine: engineOf(agent, chat) }, title: 'Opens the engine\'s own sign-in window (Hearth never sees your password)' }));
    }
    body?.replaceChildren(lineEl);
    if (!foot) return;
    // (data-msg-act="retry" like the chat's own Retry, so it is found the same way; the click stays here: same session)
    const act = (label, fn, title = '') => el('button', { type: 'button', class: 'msg-act net-act', text: label, title, dataset: label === 'Retry' ? { msgAct: 'retry' } : {}, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn()).catch((err) => toast(err.message, { type: 'error' })); } } });
    const acts = [];
    const ask = other && (kind === 'busy' || kind === 'limit') ? act(kind === 'limit' ? `Switch to ${other.name}` : `Ask ${other.name} instead`, () => switchOver(agent.id, chatId, m), `Send this message to ${other.name} (with the last few messages as context)`) : null;
    if (kind === 'offline') acts.push(it ? act('Cancel', () => cancel(agent.id, chatId, m), 'Don\'t send it when the internet is back') : act('Retry', () => retryNow(agent.id, chatId, m)));
    else if (kind === 'busy') acts.push(it ? act('Cancel', () => cancel(agent.id, chatId, m), 'Stop retrying') : act('Retry', () => retryNow(agent.id, chatId, m)), ask);
    else if (kind === 'limit') {
      if (ask) acts.push(ask);
      else if (it) acts.push(act('Cancel', () => cancel(agent.id, chatId, m)));
      else if (net.resetAt) acts.push(act(`Send at ${C.clock(net.resetAt)}`, () => sendAt(agent.id, chatId, m), 'It goes out by itself when the limit resets'));
      else acts.push(act('Retry', () => retryNow(agent.id, chatId, m)));
    } else if (kind === 'signedout') {
      const again = act('Retry', () => retryNow(agent.id, chatId, m), 'Once you finished signing in');
      again.hidden = !net.loginTried; // shown once the sign-in window was opened (kept through redraws)
      lineEl.querySelector('.login-btn')?.addEventListener('click', () => { net.loginTried = true; setTimeout(() => { again.hidden = false; }, 400); });
      acts.push(again);
    } else if (kind === 'proxy') acts.push(act('Retry', () => retryNow(agent.id, chatId, m)));
    else if (kind === 'cutoff') acts.push(it ? act('Cancel', () => cancel(agent.id, chatId, m), 'Don\'t continue it by itself') : act('Continue', () => continueNow(agent.id, chatId, m), 'Ask for the rest (the same session: only a short line is sent)'));
    foot.classList.add('net-acts');
    foot.replaceChildren(...acts.filter(Boolean));
  }
  function redraw(agentId, chat) { if (H.activeChat[agentId] === chat.id) Native.refresh(agentId, { keepScroll: true }); }
  function startTick() { if (!tickT) tickT = setTimeout(tick, 1000); }
  function tick() {
    tickT = null;
    const spans = document.querySelectorAll('.net-count');
    if (!spans.length) return; // parks when no countdown is on screen
    for (const s of spans) { const v = String(Math.max(0, Math.ceil((Number(s.dataset.at) - now()) / 1000))); if (s.textContent !== v) s.textContent = v; }
    tickT = setTimeout(tick, 1000);
  }
  // The typed-while-offline messages, as chips in the chat box (like the chat's own queue): click = edit it again,
  // × = don't send it. One note line says why they wait.
  function paintChips(agentId) {
    const v = Native.view(agentId);
    if (!v?.queueBox) return;
    if (!v.offBox) { v.offBox = el('div', { class: 'queue-chips offline-chips', hidden: true }); v.queueBox.before(v.offBox); }
    const chatId = H.activeChat[agentId] || null;
    const mine = items.filter((it) => it.kind === 'new' && it.agentId === agentId && (it.chatId || null) === chatId);
    const sig = JSON.stringify(mine.map((it) => [it.id, it.status, it.mission || '']));
    if (v.offBox.dataset.sig !== sig) {
      v.offBox.dataset.sig = sig;
      v.offBox.hidden = !mine.length;
      v.offBox.replaceChildren(...mine.map((it) => el('span', { class: 'queue-chip offline-chip', title: `${it.text}\n\n(${it.mission ? `${missionLabel(it.mission)} · ` : ''}${it.status === 'sending' ? 'going out now' : 'waits to be sent'}; click to edit it again)` },
        el('span', { text: `⏳ ${missionIcon(it.mission)}${short(it.text)}`, on: { click: () => { drop((x) => x.id === it.id); Native.insertDraft(agentId, it.text); if (it.mission && typeof Missions !== 'undefined') Missions.set(agentId, it.mission); } } }),
        el('button', { type: 'button', text: '×', title: 'Don\'t send it', on: { click: () => drop((x) => x.id === it.id) } }))));
    }
    const noteEl = v.list.querySelector('.msg.note[data-note-id="offline-q"]');
    const waiting = mine.some((it) => it.reason !== 'busy');
    if (waiting && !noteEl) {
      Native.note(agentId, C.line('offline', { queued: true }), { id: 'offline-q', actions: [{ label: 'Cancel', title: 'Don\'t send them: back in the box', run: () => { const texts = items.filter((x) => x.kind === 'new' && x.agentId === agentId && (x.chatId || null) === chatId).map((x) => x.text); drop((x) => x.kind === 'new' && x.agentId === agentId && (x.chatId || null) === chatId); if (texts.length) Native.insertDraft(agentId, texts.join('\n\n')); } }] });
    } else if (!waiting && noteEl) { noteEl.dataset.gone = '1'; noteEl.remove(); }
  }
  const missionOf = (id) => (id && typeof Missions !== 'undefined' ? Missions.LIST.find((m) => m.id === id) : null);
  const missionIcon = (id) => { const m = missionOf(id); return m ? `${m.icon} ` : ''; };
  const missionLabel = (id) => missionOf(id)?.label || id;
  function paintAll() { for (const a of H.agents?.() || []) if (Native.hasView?.(a.id)) paintChips(a.id); }
  Native.hooks.render.push((agentId) => paintChips(agentId));

  // ---------- the actions ----------
  async function chatAndMsg(chatId, m) {
    const chat = await Native.load(chatId);
    const msg = chat?.messages.find((x) => x === m || (x.role === 'error' && x.at === m.at));
    return { chat, msg };
  }
  async function cancel(agentId, chatId, m) {
    drop((x) => x.chatId === chatId && x.errAt === m.at);
    attempts.delete(chatId);
    const { chat, msg } = await chatAndMsg(chatId, m);
    if (msg?.net) { msg.net.cancelled = true; if (msg.net.kind === 'busy') msg.net.gaveUp = true; Native.save(chat); }
    if (chat) redraw(agentId, chat);
  }
  // You asked: it goes now (if the internet is still away, it fails without tokens and waits again).
  function tryNow() {
    if (!online) { online = true; document.documentElement.classList.remove('net-offline'); }
    pump();
  }
  async function retryNow(agentId, chatId, m) {
    attempts.delete(chatId);
    add({ kind: 'retry', reason: m.net?.kind === 'offline' ? 'offline' : 'manual', agentId, chatId, errAt: m.at, notBefore: 0 });
    tryNow();
  }
  async function continueNow(agentId, chatId, m) {
    add({ kind: 'continue', reason: 'manual', agentId, chatId, errAt: m.at, notBefore: 0 });
    tryNow();
  }
  async function sendAt(agentId, chatId, m) {
    const at = (m.net?.resetAt || now()) + 30000;
    add({ kind: 'retry', reason: 'limit', agentId, chatId, errAt: m.at, notBefore: at });
    const { chat } = await chatAndMsg(chatId, m);
    if (chat) redraw(agentId, chat);
    toast(`It goes out at ${C.clock(at)}`, { timeout: 2500 });
  }
  // The other AI takes the message: a docked director switches engine in place (same chat, same scene); a plain chat
  // continues in a new chat with that AI, carrying the last few messages (no summary asked of the AI that is down).
  async function switchOver(agentId, chatId, m) {
    const agent = H.agent(agentId);
    const other = otherOf(agent);
    if (!other) throw new Error('There is no other AI to ask.');
    drop((x) => x.chatId === chatId && x.kind !== 'new');
    const { chat } = await chatAndMsg(chatId, m);
    if (!chat) throw new Error('That chat is gone.');
    const ei = chat.messages.findLastIndex((x) => x.role === 'error' && x.at === m.at);
    const ui = chat.messages.slice(0, ei).findLastIndex((x) => x.role === 'user');
    if (ei < 0 || ui < 0) throw new Error('Nothing to send.');
    const question = chat.messages[ui];
    const why = m.net?.kind === 'limit' ? 'usage limit' : 'busy';
    if (agent.dock && typeof Astra !== 'undefined' && Astra.switchDirector) {
      Astra.switchDirector(agent, other.engine);
      chat.messages.splice(ei, 1);
      await Native.send(agentId, question.text, { fromHistory: true, chatId: chat.id });
      return;
    }
    const t = now();
    const copy = {
      id: `${other.id}-${t.toString(36)}`, agentId: other.id, title: `${chat.title} (→ ${other.name})`, createdAt: t, updatedAt: t,
      session: {}, continuedFrom: agent.name, handoffFrom: chat.id, messages: [],
    };
    // (round 42, handoff) the other AI gets a short brief (goal, decisions, files, the last exchange word for word)
    if (window.Lazy && typeof Handoff === 'undefined') await window.Lazy.load('handoff').catch(() => {});
    if (typeof Handoff !== 'undefined' && chat.messages.slice(0, ui).some((x) => x.role === 'user' || x.role === 'assistant')) {
      await Handoff.startCopy(copy, chat, ui, { from: agent, to: other, title: `Picked up from ${agent.name} (${why})` });
    } else {
      const lines = chat.messages.slice(0, ui).filter((x) => (x.role === 'user' || x.role === 'assistant') && x.text && !x.cont).slice(-6)
        .map((x) => `**${x.role === 'user' ? 'User' : agent.name}:** ${x.text.length > 600 ? `${x.text.slice(0, 599)}…` : x.text}`);
      if (lines.length) copy.messages = [{ role: 'assistant', text: `**Picked up from ${agent.name}** (${why})\n\n${lines.join('\n\n')}`, at: t }];
    }
    const msg = chat.messages[ei];
    if (msg.net) { msg.net.switched = other.name; msg.net.cancelled = true; }
    Native.save(chat);
    Native.adopt(copy);
    if (copy.handoff) Handoff.show(other.id, copy);
    await Native.send(other.id, question.sent || question.text, { chatId: copy.id });
  }

  // ---------- one command (the chat's own words work too) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('offline')) {
    Commands.register({ name: 'offline', area: 'Chat', args: '[send|clear]', desc: 'What waits to be sent (no internet, a busy AI, a usage limit) and when; send = try now, clear = forget them',
      keywords: 'internet wifi network queue waiting retry busy overloaded rate limit usage limit signed out vpn proxy sleep',
      complete: () => [{ value: 'send', hint: 'try now' }, { value: 'clear', hint: 'forget what waits' }],
      run: async (args) => {
        await ready;
        const a = String(args || '').trim().toLowerCase();
        if (a === 'clear') { const n = items.length; drop(() => true); return n ? `Forgot ${n} waiting message${n > 1 ? 's' : ''}.` : 'Nothing was waiting.'; }
        if (a === 'send') { for (const it of items) it.notBefore = 0; await save(); tryNow(); return items.length ? 'Trying now.' : 'Nothing waits.'; }
        if (!items.length) return `${online ? '✓ Online' : '⚠ No internet'} · nothing waits to be sent.`;
        const name = (it) => H.agent(it.agentId)?.name || it.agentId;
        const when = (it) => (it.notBefore > now() ? `at ${C.clock(it.notBefore)}` : online ? 'next' : 'when the internet is back');
        const what = (it) => (it.kind === 'new' ? `${it.mission ? `${missionIcon(it.mission)}${missionLabel(it.mission)}: ` : ''}“${short(it.text, 50)}”` : it.kind === 'continue' ? 'continue the cut-off reply' : 'send the last message again');
        return `${online ? '✓ Online' : '⚠ No internet'} · ${items.length} waiting:\n${items.map((it) => `- ${name(it)}: ${what(it)} · ${when(it)}`).join('\n')}`;
      } });
  }

  return {
    ready, items: () => items.map((it) => ({ ...it })), isOnline: () => online, pump,
    // astra.js: a failure this module answers in the chat needs no toast of its own
    owns: (ev) => ev?.type === 'error' && KINDS.has(C.classify(ev.message)?.kind),
    _test: { net: (v) => { forced = v; try { if (v == null) localStorage.removeItem('offline.test-net'); else localStorage.setItem('offline.test-net', String(v)); } catch { /* no storage */ } }, scale: (x) => { scale = x; }, power: (state) => { if (state === 'resume') lastWake = now(); }, probeNow, attempts, set: (list) => { items = list; return save(); } },
  };
})();
