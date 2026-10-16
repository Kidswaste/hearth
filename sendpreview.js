// Send preview (round 44, sendpreview): before you send, what the message will really cost, but only when it matters.
// While you type (after a short pause: typing itself does nothing but reset a timer), Hearth works out locally, for 0
// tokens, what this message will send (sendpreview-core.js): the fixed part (tokenaudit's measure of the instructions +
// tools), the chat the engine re-reads and how much of it the prompt cache likely covers (cachewise; the cache expires
// ≈ 5 minutes after the last message), the attachments (attachlean's chip costs), a ◎ mission's other AIs (swarmlean),
// a handoff brief or whole chat, and the model / effort Smart picks (router). Nothing shows unless the message costs
// much more than usual (≥ 3× this chat's median, or ≥ 30k tokens at full price): then a tiny "≈ 52k" sits next to Send.
// Pointing at it (or Tab + Enter) explains it in plain words and offers the one best cheaper way, one click, which then
// sends: "Continue lighter first — ≈ 6k", "Send shot.png at 1568 px, not full size", "Ask on a new chat", "Just Claude,
// without 🐝 Swarm", "Send the short brief instead". Never blocks: Send / Enter send as always, "Send anyway" too.
// Calibration: what the engine reports after a plain message (input + output) moves a small correction factor per AI
// (kv send-preview, read and saved through DataSafe: an unreadable store is never written over).
// /send-preview [words]: the same breakdown in the chat.
const SendPreview = (() => {
  const C = SendPreviewCore;
  const KV = 'send-preview';
  const PAUSE = 350; // ms after the last key
  const FIXED_TTL = 10 * 60e3;
  const timers = new Map(); // agentId → the pause timer
  const expiry = new Map(); // agentId → the timer that refreshes when the cache would expire
  const shown = new Map(); // agentId → { est, st, sh, best, rows, head } shown now
  const fixed = new Map(); // agentId → { tokens, at, p }
  const boxes = new WeakMap(); // textarea → agentId
  const armed = new Map(); // agentId → { raw, at } estimated at submit (calibration)
  const sent = new Map(); // chatId → { agentId, raw }
  let store = null; let loaded = null; let saveT = 0;

  const fmt = C.fmt;
  const agentOf = (id) => H.agent(id) || null;
  const short = (s, n = 28) => { s = String(s || ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

  // ---------- calibration store (DataSafe) ----------
  async function load() {
    if (store) return store;
    try {
      loaded = window.DataSafe ? await DataSafe.load(KV, null) : await window.hub.kvGet(KV, null, { status: true }).then((r) => ({ value: r?.value ?? null, ok: r?.state === 'ok' || r?.state === 'missing', state: r?.state }));
    } catch { loaded = { value: null, ok: false, state: 'unreadable' }; }
    const v = loaded?.value;
    store = C.valid(v) ? v : { v: 1, ai: {} };
    return store;
  }
  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      if (!store) return;
      C.trim(store);
      try {
        if (window.DataSafe) { const r = await DataSafe.save(KV, store, loaded); if (r?.refused) return; } // never over a store that didn't read
        else if (loaded?.ok) await window.hub.kvSet(KV, store);
      } catch (err) { console.warn('sendpreview: save', err); }
    }, 1200);
  }
  const calOf = (agentId) => store?.ai?.[agentId] || { f: 1, n: 0 };

  // ---------- the fixed part: tokenaudit's measure, else the chat's first plain reply ----------
  function fixedOf(agent, chat) {
    const c = fixed.get(agent.id);
    if ((!c || Date.now() - c.at > FIXED_TTL) && window.hub.tokenAudit && !c?.p) {
      const p = Promise.resolve(window.hub.tokenAudit(JSON.parse(JSON.stringify(agent)))).then((m) => {
        fixed.set(agent.id, { tokens: m && !m.error && m.total > 0 ? m.total : null, at: Date.now() });
      }).catch(() => fixed.set(agent.id, { tokens: null, at: Date.now() }));
      fixed.set(agent.id, { ...(c || {}), at: c?.at || 0, p });
    }
    if (c?.tokens) return { tokens: c.tokens, from: 'audit' };
    const ms = chat?.messages || [];
    const start = chat?.compact ? chat.compact.index : chat?.handoff?.at || 0;
    const i = ms.findIndex((m, k) => k >= start && m.role === 'assistant' && m.usage);
    const first = ms[i];
    const user = [...ms.slice(0, Math.max(0, i))].reverse().find((m) => m.role === 'user');
    if (first && !first.tools?.length && start === 0) return { tokens: Math.max(300, first.usage.input - C.tok(user?.sent || user?.text)), from: 'reply' };
    return { tokens: C.DEFAULT_FIXED, from: 'default' };
  }

  // ---------- what goes into the estimate ----------
  function attachmentsOf(v) {
    return (v?.attachments || []).map((a) => {
      const s = a.lean;
      if (s) return { name: a.name, kind: s.kind, tokens: s.tokens || 0, wholeTokens: s.wholeTokens || s.tokens || 0, whole: Boolean(a.whole), px: s.kind === 'image' && s.scale && !a.whole ? `${s.w}×${s.h} px` : null };
      if (a.kind === 'text') return { name: a.name, kind: 'text', tokens: C.tok(a.full ?? a.content), wholeTokens: C.tok(a.full ?? a.content), whole: true };
      if (a.kind === 'image') return { name: a.name, kind: 'image', tokens: 1600, wholeTokens: 1600, whole: false };
      return { name: a.name, kind: a.kind, tokens: 30, wholeTokens: 30, whole: false }; // a path the AI opens itself
    });
  }
  function pickOf(agent, chat, text, v, st) {
    if (typeof Router === 'undefined' || !Router.smartOn?.(agent)) return null;
    let d = null;
    try {
      d = Router.decide({ engine: chat?.engine || agent.engine, text: text.length > 4000 ? text.slice(0, 4000) : text, attachments: (v?.attachments || []).map((a) => ({ kind: a.kind, name: a.name, tokens: a.lean?.tokens })), images: (v?.attachments || []).filter((a) => a.kind === 'image').length,
        director: Boolean(agent.dock), history: chat?.messages || [], pinned: { model: chat?.model, effort: chat?.effort }, baseModel: agent.model,
        learned: typeof RouterLearn !== 'undefined' ? RouterLearn.shifts?.(agent.id) : null });
    } catch { d = null; }
    if (!d) return null;
    const lr = st.last?.route;
    const changed = lr ? (d.model || '') !== (lr.model || '') || (d.effort || '') !== (lr.effort || '') : Boolean(d.model) && Boolean(st.last);
    return { label: d.label, effort: d.effort, baseEffort: lr?.effort || 'medium', changed };
  }
  function missionOf(agentId) {
    if (typeof Missions === 'undefined') return null;
    const m = Missions.current(agentId);
    if (!m || m.id === 'normal' || typeof SwarmLean === 'undefined') return null;
    let e = null;
    try { e = SwarmLean.estimate(agentId, m.id); } catch { e = null; }
    // swarmlean's estimate already holds this chat's own reply where the mission has one (review, split…)
    return e ? { id: m.id, label: `${m.icon || '◎'} ${m.label}`, tokens: e.tokens, replacesOwn: true, sticky: Boolean(Missions.isSticky?.(agentId)), line: e.line } : null;
  }
  // → { est, st, sh, ctx } for this text in this agent's chat box (sync: everything it reads is in memory)
  // what a chat's messages give (its usual, the history): worked out once per change of the chat, not per pause
  const memo = new WeakMap(); // chat → { key, st, history }
  function chatPart(chat) {
    if (!chat) return { st: C.stats(null), history: C.historyOf(null) };
    const ms = chat.messages || [];
    const key = `${ms.length}|${ms.at(-1)?.at || 0}|${ms.at(-1)?.text?.length || 0}|${chat.session?.id || ''}|${chat.compact?.index ?? ''}|${chat.handoff?.at ?? ''}|${chat.handoff?.whole ? 1 : 0}`;
    const m = memo.get(chat);
    if (m?.key === key) return m;
    const r = { key, st: C.stats(chat), history: C.historyOf(chat) };
    memo.set(chat, r);
    return r;
  }
  // o: { now, chat, attachments, mission } stand in for what's on screen (calibration works out a message after it went)
  function work(agentId, text, o = {}) {
    const now = o.now ?? Date.now();
    const agent = agentOf(agentId);
    const v = Native.view(agentId);
    if (!agent || agent.mode !== 'native') return null;
    const chat = 'chat' in o ? o.chat : Native.chatOf(agentId);
    let { st, history } = chatPart(chat);
    // (round 50, historylean) after a break a long chat goes on with its lighter history: count that, and the engine's own cache life
    let hl = null; try { hl = chat && window.HistoryLean ? HistoryLean.plan(chat, { now }) : null; } catch { hl = null; }
    if (hl?.rebase) history = { tokens: Math.max(0, hl.after - hl.input.fixed), cacheable: 0, kind: 'leanbreak', session: false };
    const ttl = hl && window.HistoryLeanCore ? HistoryLeanCore.expiresAfter(hl.input.engine, [...(chat.messages || [])].reverse().find((m) => m.usage)?.usage) : undefined;
    const fx = fixedOf(agent, chat);
    const attachments = o.attachments || attachmentsOf(v);
    const pick = pickOf(agent, chat, text, o.attachments ? { attachments: o.attachments } : v, st);
    const mission = 'mission' in o ? o.mission : missionOf(agentId);
    const cal = calOf(agentId);
    const est = C.estimate({ fixed: fx.tokens, history, words: C.tok(text), attachments, answer: st.out || undefined, effort: pick?.effort, baseEffort: pick?.baseEffort, pick, mission, now, lastAt: st.lastAt, hit: st.hit ?? undefined, factor: cal.f, ttl });
    const sh = C.should(est, st);
    return { est, st, sh, ctx: { agent, chat, v, fx, pick, mission, cal, text } };
  }

  // ---------- the one cheaper way ----------
  function options(agentId, w) {
    const { est, ctx } = w;
    const { agent, chat, mission } = ctx;
    const out = [];
    const heavy = est.parts.filter((p) => p.id === 'attachment' && p.whole && p.wholeTokens > p.lean);
    if (heavy.length) {
      const names = heavy.map((p) => p.name);
      const one = heavy.length === 1 ? heavy[0] : null;
      const lbl = !one ? 'Send the attachments trimmed' : one.kind === 'image' ? `Send ${short(one.name)} at 1568 px, not full size` : `Send only what you ask about from ${short(one.name)}`;
      out.push({ id: 'attachment', names, label: lbl, tokens: C.variant(est, { id: 'attachment', names }), title: 'The same message; the AI gets a smaller copy (your file stays as it is) and can open the rest.' });
    }
    const h = chat?.handoff;
    if (h?.whole && h.brief && est.history.kind === 'whole') out.push({ id: 'brief', label: 'Send the short brief instead', tokens: C.variant(est, { id: 'brief', from: C.tok(h.whole), to: h.tokens || C.tok(h.brief) }), title: `${h.to || 'It'} gets the goal, decisions, files and your last exchange instead of every message.` });
    if (mission && !mission.sticky) out.push({ id: 'mission', label: `Just ${agent.name}, without ${mission.label}`, tokens: C.variant(est, { id: 'mission' }), title: 'One answer from this AI instead of the mission\'s AIs.' });
    const histShare = est.history.tokens / Math.max(1, est.raw || est.tokens);
    if (chat?.messages?.length && histShare >= 0.3 && !Native.isBusy(chat.id)) {
      // what continuing lighter would leave (autocompact's own numbers; read once per change of the chat: it reads
      // every older message)
      const part = chatPart(chat);
      if (!('lighter' in part)) {
        part.lighter = null;
        if (typeof Autocompact !== 'undefined') {
          try { if (Autocompact.split(chat).older.length) part.lighter = Autocompact.decide({ ...Autocompact.inputOf(chat, agent), at: 1 }); } catch { part.lighter = null; }
        }
      }
      const d = part.lighter;
      if (d?.after) out.push({ id: 'lighter', label: 'Continue lighter first', tokens: C.variant(est, { id: 'lighter', after: d.after }), prefer: !d.topic, title: 'A short summary (goal, decisions, files, open tasks) by the cheapest model stands in for the older messages; your last 2 exchanges go word for word. Then your message goes.' });
      out.push({ id: 'newchat', label: 'Ask on a new chat', tokens: C.variant(est, { id: 'newchat' }), prefer: Boolean(d?.topic) || !d, title: 'A new chat with this AI, your message and attachments moved there. This chat stays as it is.' });
    }
    return out;
  }

  // ---------- the hint next to Send ----------
  function hintOf(v) {
    if (v.spWrap?.isConnected) return v.spWrap;
    const btn = el('button', { type: 'button', class: 'sp-hint', text: '', attrs: { 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, dataset: { feature: 'Chat › Send preview' } });
    const wrap = el('span', { class: 'sp-wrap', hidden: true }, btn);
    v.form.insertBefore(wrap, v.sendBtn);
    v.spWrap = wrap; v.spBtn = btn;
    let enter = 0;
    btn.addEventListener('pointerenter', () => { clearTimeout(leaveT); enter = setTimeout(() => open(btn.dataset.agent, false), 140); });
    btn.addEventListener('pointerleave', () => { clearTimeout(enter); leaveSoon(); });
    btn.addEventListener('click', (e) => { e.preventDefault(); if (pop?.isConnected && pop.dataset.agent === btn.dataset.agent) close(true); else open(btn.dataset.agent, true); });
    return wrap;
  }
  function hide(agentId) {
    shown.delete(agentId);
    const v = Native.view(agentId);
    if (v?.spWrap && !v.spWrap.hidden) v.spWrap.hidden = true;
    if (pop?.dataset.agent === agentId) close(false);
  }
  function paint(agentId, w, best) {
    const v = Native.view(agentId);
    if (!v) return;
    const wrap = hintOf(v);
    const btn = v.spBtn;
    const t = `≈ ${fmt(w.est.tokens)}`;
    if (btn.textContent !== t) btn.textContent = t;
    const label = `This message will cost about ${fmt(w.est.tokens)} tokens, more than usual${best ? `; a cheaper way: ${best.label}` : ''}. Show why`;
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
    if (btn.dataset.agent !== agentId) btn.dataset.agent = agentId;
    btn.classList.toggle('big', w.est.fresh >= C.BIG_FRESH);
    if (wrap.hidden) wrap.hidden = false;
    shown.set(agentId, { ...w, best });
    if (pop?.isConnected && pop.dataset.agent === agentId) fill(agentId);
  }

  // ---------- the explanation (points at the hint: a small card above it) ----------
  let pop = null; let leaveT = 0;
  function leaveSoon() { clearTimeout(leaveT); leaveT = setTimeout(() => { if (pop && !pop.matches(':hover') && !pop.contains(document.activeElement)) close(false); }, 260); }
  function fill(agentId) {
    const s = shown.get(agentId);
    if (!s || !pop) return;
    const { est, st, sh, best, ctx } = s;
    const rows = C.lines(est, st, { fixedFrom: ctx.fx.from, pick: ctx.pick?.label, calN: ctx.cal.n });
    const why = sh.why === 'big' ? 'Most of it is read at full price, not from the prompt cache.' : `That's about ${Math.round(sh.times)}× what a message in this chat usually costs (≈ ${fmt(st.median)}).`;
    const kids = [
      el('div', { class: 'sp-head', text: C.headline(est, st, sh) }),
      el('div', { class: 'sp-why', text: why }),
      el('ul', { class: 'sp-parts' }, ...rows.map((r) => el('li', {}, el('span', { class: 'sp-k', text: r.k }), r.v != null ? el('b', { text: `≈ ${fmt(r.v)}` }) : null, r.note ? el('small', { text: r.note }) : null))),
      el('div', { class: 'sp-acts' },
        best ? el('button', { type: 'button', class: 'sp-cheap primary', text: `${best.label} — ≈ ${fmt(best.tokens)}`, title: best.title || '', dataset: { feature: 'Chat › Send preview › Cheaper' }, on: { click: () => take(agentId, best) } }) : null,
        el('button', { type: 'button', class: 'sp-anyway ghost', text: 'Send anyway', title: 'Send it as it is (Enter does too)', dataset: { feature: 'Chat › Send preview › Send anyway' }, on: { click: () => { close(false); Native.view(agentId)?.form.requestSubmit(); } } })),
      el('div', { class: 'sp-foot', text: `An estimate made on this computer (0 tokens)${ctx.cal.n ? `, adjusted to ${ctx.agent.name}'s real use` : ''}. Sending is never blocked.` }),
    ];
    // a look again while it's open: written only when it says something else, and the focus stays on the same button
    const sig = kids.map((k) => k?.textContent || '').join('|');
    if (pop.dataset.sig === sig && pop.dataset.agent === agentId) return;
    const was = pop.contains(document.activeElement) ? document.activeElement.className : '';
    pop.dataset.sig = sig;
    pop.replaceChildren(...kids);
    if (was) pop.querySelector(`button.${was.split(' ')[0]}`)?.focus();
  }
  function open(agentId, focus) {
    const v = Native.view(agentId);
    if (!agentId || !v?.spBtn || !shown.has(agentId)) return;
    if (!pop) {
      pop = el('div', { class: 'sp-pop', attrs: { role: 'dialog', 'aria-label': 'What this message will cost' } });
      pop.addEventListener('pointerenter', () => clearTimeout(leaveT));
      pop.addEventListener('pointerleave', leaveSoon);
      pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
      pop.addEventListener('focusout', (e) => { if (pop && !pop.contains(e.relatedTarget) && e.relatedTarget !== Native.view(pop.dataset.agent)?.spBtn) close(false); });
    }
    pop.dataset.agent = agentId;
    fill(agentId);
    if (!pop.isConnected) document.body.append(pop);
    const r = v.spBtn.getBoundingClientRect(); // once per opening
    pop.style.right = `${Math.max(8, Math.round(window.innerWidth - r.right - 40))}px`;
    pop.style.bottom = `${Math.round(window.innerHeight - r.top + 8)}px`;
    v.spBtn.setAttribute('aria-expanded', 'true');
    if (focus) pop.querySelector('button')?.focus();
  }
  let closing = false;
  function close(refocus) {
    if (!pop?.isConnected || closing) return;
    const v = Native.view(pop.dataset.agent);
    v?.spBtn?.setAttribute('aria-expanded', 'false');
    const had = pop.contains(document.activeElement);
    closing = true; // removing it moves the focus out of it (focusout): not a second close
    try { pop.remove(); } finally { closing = false; }
    if ((refocus || had) && v?.spBtn?.isConnected && !v.spWrap.hidden) v.spBtn.focus();
  }

  // ---------- one click: the cheaper way, then it sends ----------
  async function take(agentId, best) {
    close(false);
    const v = Native.view(agentId);
    if (!v) return;
    const before = shown.get(agentId)?.est.tokens || 0;
    const said = () => toast(`Sent the lighter way: ≈ ${fmt(best.tokens)} tokens instead of ≈ ${fmt(before)}`, { timeout: 2600 });
    try {
      if (best.id === 'attachment') {
        for (const a of v.attachments) if (best.names.includes(a.name)) a.whole = false;
        Native.renderChips(agentId);
      } else if (best.id === 'brief') {
        const chat = Native.chatOf(agentId);
        if (chat?.handoff) { delete chat.handoff.whole; Native.save(chat); }
      } else if (best.id === 'mission') {
        Missions.set(agentId, 'normal');
      } else if (best.id === 'lighter') {
        const r = await Autocompact.run(agentId);
        if (r === null) return; // nothing to make lighter: the draft stays
      } else if (best.id === 'newchat') {
        const text = v.input.value;
        Native.newChat(agentId);
        Native.setDraft(agentId, text);
      }
    } catch (err) { toast(err.message || String(err), { type: 'error' }); return; }
    hide(agentId);
    if (!v.input.value.trim() && !v.attachments.length) return;
    v.form.requestSubmit();
    said();
  }

  // ---------- when to look ----------
  function refresh(agentId) {
    timers.delete(agentId);
    const v = Native.view(agentId);
    if (!v) return;
    const chat = Native.chatOf(agentId);
    if ((chat && Native.isBusy(chat.id)) || (!(v.input.textLength ?? v.input.value.length) && !v.attachments.length)) { hide(agentId); return; }
    const text = v.input.value;
    if (text.startsWith('/')) { hide(agentId); return; }
    if (!store) { load().then(() => soon(agentId, 0)); return; }
    let w = null;
    try { w = work(agentId, text); } catch (err) { console.warn('sendpreview', err); }
    // the cache expires while you think it over: look again then
    clearTimeout(expiry.get(agentId));
    if (w && !w.est.cold && w.st.lastAt) expiry.set(agentId, setTimeout(() => soon(agentId, 0), Math.max(1000, w.st.lastAt + (w.est.ttl || C.CACHE_TTL) + 1000 - Date.now())));
    if (!w?.sh.show) { hide(agentId); return; }
    paint(agentId, w, C.cheaper(w.est, options(agentId, w)));
  }
  function soon(agentId, ms = PAUSE) {
    clearTimeout(timers.get(agentId));
    // after the pause, in an idle moment (the first look at a long chat reads all of it once)
    timers.set(agentId, setTimeout(() => { if (window.requestIdleCallback) requestIdleCallback(() => refresh(agentId), { timeout: 500 }); else refresh(agentId); }, ms));
  }
  function agentOfBox(t) {
    let id = boxes.get(t);
    if (id && Native.view(id)?.input === t) return id;
    id = H.agents().find((a) => a.mode === 'native' && Native.view(a.id)?.input === t)?.id || null;
    if (id) {
      boxes.set(t, id);
      // pointing at the chat box (on the way to Send): look again (a ◎ mission picked meanwhile, the cache expired…)
      const f = t.closest('form');
      if (f && !f.spSeen) { f.spSeen = true; f.addEventListener('pointerenter', () => { const v = Native.view(id); if (v && (v.input.textLength || v.attachments.length)) soon(id, 60); }); }
    }
    return id;
  }

  // ---------- calibration: what the engine reports after a plain message ----------
  // at Enter only a snapshot (Enter must stay light: inputlatency); the estimate is worked out when the reply is in
  function armAt(agentId) {
    const v = Native.view(agentId);
    const chat = Native.chatOf(agentId);
    armed.delete(agentId);
    if (!v || (chat && Native.isBusy(chat.id))) return;
    const text = v.input.value.trim();
    if ((!text && !v.attachments.length) || text.startsWith('/')) return;
    if (typeof Missions !== 'undefined' && Missions.current(agentId)?.id !== 'normal') return; // other AIs: nothing to learn about this one
    armed.set(agentId, { at: Date.now(), text, attachments: attachmentsOf(v), n: chat?.messages.length || 0, session: chat?.session || {} });
  }
  function onSend(agentId, chat) {
    hide(agentId);
    const a = armed.get(agentId);
    armed.delete(agentId);
    if (a && Date.now() - a.at < 15000 && chat?.id) sent.set(chat.id, { agentId, ...a });
  }
  function rawOf(s, chat) {
    try {
      const before = { ...chat, session: s.session, messages: chat.messages.slice(0, s.n) };
      const w = work(s.agentId, s.text, { now: s.at, chat: s.n ? before : null, attachments: s.attachments, mission: null });
      return w?.est.raw || 0;
    } catch { return 0; }
  }
  function onEvent(event, chat) {
    const s = chat && sent.get(chat.id);
    if (s && event.type !== 'delta') {
      sent.delete(chat.id);
      const u = event.type === 'done' ? (event.usage || chat.messages.at(-1)?.usage) : null;
      const raw = u && u.input > 0 ? rawOf(s, chat) : 0;
      if (raw > 0) {
        load().then((st) => { st.ai[s.agentId] = C.calibrate(st.ai[s.agentId], raw, (u.input || 0) + (u.output || 0)); saveSoon(); });
      }
    }
    if (chat?.agentId && event.type === 'done' && H.activeChat[chat.agentId] === chat.id) soon(chat.agentId);
  }

  // ---------- /send-preview ----------
  function report(agentId, words) {
    const v = Native.view(agentId);
    const w = work(agentId, words || '');
    if (!w) return 'Run it in a Claude or Astra chat.';
    const best = C.cheaper(w.est, options(agentId, w));
    const rows = C.lines(w.est, w.st, { fixedFrom: w.ctx.fx.from, pick: w.ctx.pick?.label, calN: w.ctx.cal.n });
    const what = words ? 'These words' : v?.attachments.length ? 'The attachments in the chat box' : 'A short message';
    return [
      `${what} in this chat: ${C.headline(w.est, w.st, w.sh).replace(' with this message', '')}.`,
      ...rows.map((r) => `- ${r.k}${r.v != null ? `: ≈ ${fmt(r.v)}` : ''}${r.note ? ` (${r.note})` : ''}`),
      w.sh.show ? `More than usual: the hint shows next to Send.${best ? ` Cheaper: ${best.label} — ≈ ${fmt(best.tokens)}.` : ''}` : `Usual for this chat${w.st.median ? ` (≈ ${fmt(w.st.median)} a message)` : ''}: no hint.`,
    ].join('\n');
  }

  function register() {
    if (typeof Native === 'undefined' || !Native.hooks) return;
    document.addEventListener('input', (e) => { const t = e.target; if (t?.tagName === 'TEXTAREA' && t.closest?.('.composer')) { const id = agentOfBox(t); if (id) soon(id); } }, true);
    // the submit, before native.js takes the draft: the estimate the reply's real usage is compared with
    document.addEventListener('submit', (e) => { const f = e.target; if (!f?.classList?.contains('composer')) return; const t = f.querySelector('textarea'); const id = t && agentOfBox(t); if (id) armAt(id); }, true);
    Native.hooks.chips.push((agentId) => soon(agentId));
    Native.hooks.send.push(onSend);
    Native.hooks.event.push(onEvent);
    Native.hooks.render.push((agentId) => { if (shown.has(agentId) || Native.view(agentId)?.input.textLength) soon(agentId); });
    Native.hooks.newChat.push((agentId) => hide(agentId));
    if (typeof Commands !== 'undefined' && !Commands.get('send-preview')) Commands.register({
      name: 'send-preview', aliases: ['cost-preview'], args: '[words]', area: 'Compose',
      keywords: 'tokens cost estimate before sending expensive cache expired preview how much',
      desc: 'What a message would cost in this chat before you send it (fixed part, the chat re-read and the cache, attachments, mission, answer), and the cheaper way when there is one',
      examples: ['/send-preview', '/send-preview fix the shader on line 40'],
      run: async (args, ctx) => {
        if (!ctx.agentId || agentOf(ctx.agentId)?.mode !== 'native') throw new Error('Run it in a Claude or Astra chat');
        await load();
        return report(ctx.agentId, String(args || '').trim());
      },
    });
    load().catch(() => {});
  }
  if (typeof Native !== 'undefined') register();

  return { refresh, work, report, options, shown, load, _test: { calOf, get store() { return store; }, fixedOf, armed, sent, setFixed: (id, tokens) => fixed.set(id, { tokens, at: Date.now() }), close } };
})();
window.SendPreview = SendPreview;
