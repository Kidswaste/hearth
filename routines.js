// 🔁 Keep going (round 41, routines): a chat keeps improving its work by itself, for a time, a number of extra rounds,
// or until the owner stops it. The owner: "make a routine option: if I choose for an AI to keep prompting itself to
// improve work for a period of time, or a set amount of extra work (like 5 more 'do 5 more' prompts every time an
// upgrade ends), or set it forever."
// Ways in: ◎ Missions › More › 🔁 Keep going… (for the message being sent: it goes first, the routine follows its
// reply), a reply's ⋯ › Reply › 🔁 Keep going from here…, Ctrl/⌘+K (Find anything), /keepgoing. A small card: what to
// ask each time (remembered per chat), how long, the pause between rounds, the spending cap (required for long ones;
// its default comes from the weekly Spending limit), and under More: what happens when you write, continuing lighter,
// waiting for a usage limit, going on after a restart.
// How it runs: each time a reply in that chat finishes and nothing waits or streams there (the chat's queue, the offline
// queue, your typing, a hook's turn), Hearth sends the routine's words as a new turn, marked 🔁 on the message (never
// as if you typed it; nothing is added to the words or the prompt). The header shows "🔁 3 of 5 · ≈ 42k tokens so far"
// with ❚❚ / ▶ and ■; each round's message shows what that round cost. Writing yourself pauses it (or, your choice, it
// goes on after a quiet time). It stops by itself at the end, at the cap (before a round that would pass it), on the
// same failure twice in a row, on "signed out", at a usage limit (or waits for its reset), and when the AI says it's
// done / stuck twice in a row; a permission card or a plan waiting for ▶ pauses it (a routine never answers either).
// Continue lighter runs between rounds when it clearly pays (autocompact.js decides, as for its offer). The computer
// is kept awake only while a round runs (powerwise.js), never during the pauses. A restart pauses it with a resume
// prompt, unless "keep going after a restart" was chosen. ◉ Activity lists each round; ⋯ AI setup lists the routines
// with ■ Stop. The pure rules are in routines-core.js (dev/routines-test.js); dev/checks/routines.js drives it.
const Routines = (() => {
  if (typeof Native === 'undefined' || typeof RoutinesCore === 'undefined') return {};
  const C = RoutinesCore;
  const KEY = 'routines.list'; // this computer only: a routine never runs on two computers at once
  const PROMPTS = 'routines.prompts'; // { chatId: words } remembered per chat
  const LAST = 'routines.last'; // the card's last choices
  let list = (store.get(KEY, []) || []).map((r) => C.normalize(r)).filter(Boolean);
  const timers = new Map(); // routine id → timeout of its next check
  const holds = new Map(); // routine id → release() of the awake hold while a round runs
  let tagNext = null; // { chatId, text, routine } the message being sent by a routine (marked when native.js sends it)
  let lastInput = Date.now(); // the owner's last key / pointer in Hearth (pause "until I'm idle")
  let lastWrote = Number(store.get('routines.wrote', 0)) || 0; // the owner's last message in any chat (pause "when I haven't written")
  let scale = 1; // tests: every wait × scale
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set(KEY, list.filter((r) => C.live(r) || Date.now() - (r.lastEnd || r.createdAt) < 864e5).slice(-40)), 200); };
  const saveNow = () => { clearTimeout(saveT); store.set(KEY, list.filter((r) => C.live(r) || Date.now() - (r.lastEnd || r.createdAt) < 864e5).slice(-40)); };
  addEventListener('pagehide', saveNow);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });

  const forChat = (chatId) => list.find((r) => r.chatId === chatId && C.live(r)) || null;
  const byId = (id) => list.find((r) => r.id === id) || null;
  const nameOf = (r) => H.agent(r.agentId)?.name || 'the AI';
  const titleOf = (r) => r.title || 'this chat';
  const fmt = C.fmt;
  const activity = (r, text, icon = '🔁') => document.dispatchEvent(new CustomEvent('hearth:activity', { detail: { icon, text, go: { chat: [r.agentId, r.chatId] } } }));
  const shownHere = (r) => H.activeChat[r.agentId] === r.chatId && Native.hasView(r.agentId);

  // ---------- the scheduler ----------
  function context(r) {
    const now = Date.now();
    const v = Native.view(r.agentId);
    const here = H.activeChat[r.agentId] === r.chatId;
    let askFirst = false;
    try { if (typeof Budget !== 'undefined') { const s = Budget.state(r.agentId); askFirst = s.mode === 'ask' && Boolean(s.level); } } catch { /* not loaded */ }
    const offline = typeof Offline !== 'undefined' && Offline.items ? Offline.items().some((it) => it.chatId === r.chatId) : false;
    return {
      now, busy: Native.isBusy(r.chatId) || Boolean(window.Autocompact && r.lightening),
      draft: here && Boolean(v?.input?.value.trim()) && now - lastInput < 5 * C.MIN, // a draft left for 5 min doesn't hold it forever
      queued: offline || (here && v?.queue?.length > 0), idleMs: now - lastInput, quietMs: now - lastWrote, askFirst,
    };
  }
  function later(r, ms) {
    clearTimeout(timers.get(r.id));
    timers.set(r.id, setTimeout(() => { timers.delete(r.id); check(r.id); }, Math.max(50, Math.min(ms, 5 * C.MIN) * scale)));
  }
  async function check(id) {
    const r = byId(id);
    if (!r || r.status !== 'running') return;
    const chat = await Native.load(r.chatId).catch(() => null);
    if (!chat) { end(r, 'stopped', 'its chat is gone'); return; }
    r.title = C.clip(chat.title, 60) || r.title;
    // a plan waiting for ▶ Go ahead (◎ Plan first) is yours to answer
    const lastMsg = chat.messages.at(-1);
    if (!Native.isBusy(r.chatId) && lastMsg?.role === 'assistant' && lastMsg.plan === 'waiting') { pauseFor(r, 'its plan waits for your ▶ Go ahead'); return; }
    const d = C.nextStep(r, context(r));
    if (d.act === 'none') return;
    if (d.act === 'wait') { if (d.why && r.why !== d.why) { r.why = d.why; save(); paintAll(); } later(r, d.ms); return; }
    if (d.act === 'pause') { pauseFor(r, d.why); return; }
    if (d.act === 'stop') { end(r, d.status, d.why); return; }
    await round(r, chat);
  }
  const checkSoon = (r, ms = C.SETTLE) => later(r, ms);

  // one round: (lighter first when it clearly pays) the routine's words as a new turn in its chat
  async function round(r, chat) {
    if (r.lighter && window.Autocompact?.offerFor && H.activeChat[r.agentId] === r.chatId) {
      let d = null; try { d = Autocompact.offerFor(chat); } catch { /* no decision */ }
      if (d) {
        r.lightening = true; r.why = 'continuing lighter first'; paintAll();
        try { await Autocompact.run(r.agentId); } catch (err) { console.warn('routines: lighter', err.message); }
        r.lightening = false;
        if (r.status !== 'running') return;
        checkSoon(r, 500);
        return;
      }
    }
    const n = C.sent(r);
    r.title = C.clip(chat.title, 60) || r.title;
    const text = C.message(r);
    tagNext = { chatId: r.chatId, text, routine: { id: r.id, n, of: r.how.kind === 'rounds' ? r.how.rounds : 0 } };
    awake(r, true);
    save(); paintAll();
    try {
      await Native.send(r.agentId, text, { chatId: r.chatId });
    } catch (err) {
      tagNext = null; awake(r, false);
      r.round -= 1; r.inFlight = false;
      if (/gone/i.test(err.message)) { end(r, 'stopped', 'its chat is gone'); return; }
      checkSoon(r, 5000); // still answering (a message of yours went first): after it
    }
  }
  // the computer stays awake while a round runs, never during the pauses (powerwise.js)
  function awake(r, on) {
    const rel = holds.get(r.id);
    if (on && !rel && window.Power?.hold) holds.set(r.id, Power.hold('agent', { label: 'keep going: a round runs' }));
    if (!on && rel) { holds.delete(r.id); try { rel(); } catch { /* gone */ } }
  }

  // ---------- states, said calmly in the chat and in ◉ Activity ----------
  function say(r, text, { buttons = true } = {}) {
    const acts = !buttons ? [] : r.status === 'paused'
      ? [{ label: '▶ Resume', title: 'Go on with the routine', run: (box) => { box.remove(); resume(r.id); } }, { label: '■ Stop', title: 'End the routine', run: (box) => { box.remove(); stop(r.id); } }]
      : r.status === 'running' ? [{ label: '❚❚ Pause', title: 'Pause the routine', run: (box) => { box.remove(); pause(r.id); } }, { label: '■ Stop', title: 'End the routine', run: (box) => { box.remove(); stop(r.id); } }] : [];
    if (shownHere(r)) Native.note(r.agentId, text, { id: `routine-${r.chatId}`, actions: acts });
  }
  function pauseFor(r, why) {
    C.pause(r, why);
    awake(r, false); clearTimeout(timers.get(r.id)); save(); paintAll();
    say(r, `🔁 Keep going is paused: ${why}.`);
    activity(r, `Keep going paused in “${titleOf(r)}”: ${why}`, '❚❚');
  }
  function end(r, status, why) {
    if (!C.live(r)) return;
    r.status = status || 'stopped'; r.why = why; r.inFlight = false;
    awake(r, false); clearTimeout(timers.get(r.id)); timers.delete(r.id);
    saveNow(); paintAll(); syncTick();
    const sum = `${r.done} round${r.done === 1 ? '' : 's'} · ≈ ${fmt(r.tokens)} tokens`;
    say(r, `🔁 Keep going ${r.status === 'done' ? 'finished' : 'stopped'}: ${why} (${sum}).`, { buttons: false });
    activity(r, `Keep going ${r.status === 'done' ? 'finished' : 'stopped'} in “${titleOf(r)}”: ${why} · ${sum}`, r.status === 'done' ? '✓' : '■');
    if (!shownHere(r)) toast(`🔁 ${nameOf(r)}: Keep going ${r.status === 'done' ? 'finished' : 'stopped'} in “${titleOf(r)}”: ${why}`, { timeout: 6000, action: { label: 'Open', fn: () => openChat(r) } });
  }
  function openChat(r) { try { activate(H.surfaceIdFor ? H.surfaceIdFor(r.agentId) : r.agentId); Native.open(r.agentId, r.chatId); } catch { /* gone */ } }

  // ---------- the owner's controls ----------
  function pause(id) { const r = byId(id); if (r?.status === 'running') pauseFor(r, 'paused by you'); return r; }
  function resume(id) {
    const r = byId(id);
    if (!r || !C.live(r)) return null;
    C.resume(r);
    save(); paintAll(); syncTick();
    activity(r, `Keep going resumed in “${titleOf(r)}”`);
    document.querySelector(`.msg.note[data-note-id="routine-${r.chatId}"]`)?.remove();
    checkSoon(r, 300);
    return r;
  }
  function stop(id, why = 'stopped by you') { const r = byId(id); if (r && C.live(r)) end(r, 'stopped', why); return r; }

  // ---------- starting one ----------
  // spec: what the card gave; first: the owner's own message to send before the routine's rounds (◎ Missions)
  async function start(agentId, spec, { chatId = null, first = null } = {}) {
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') throw new Error('Keep going works in a chat with Claude or Astra.');
    // your message goes out as any message from the chat box would (its chat on screen; a new chat when there is none)
    if (first) await Native.send(agentId, first);
    const chat = first ? Native.chatOf(agentId) : chatId ? await Native.load(chatId).catch(() => null) : Native.ensureChat(agentId, spec.prompt);
    if (!chat) throw new Error('That chat is gone.');
    for (const old of list.filter((x) => x.chatId === chat.id && C.live(x))) end(old, 'stopped', 'a new routine replaced it');
    const r = C.normalize({ ...spec, agentId, chatId: chat.id, title: chat.title, createdAt: Date.now(), status: 'running', kickoff: true, lastEnd: Date.now() - C.SETTLE });
    if (!r) throw new Error('Pick how long it keeps going.');
    list.push(r);
    rememberPrompt(chat.id, spec.prompt);
    store.set(LAST, { how: spec.how?.kind === 'until' ? { kind: 'until', time: spec.how.time } : spec.how, pause: r.pause, resumeAfter: r.resumeAfter, lighter: r.lighter, waitReset: r.waitReset, afterRestart: r.afterRestart, cap: spec.capPick });
    saveNow(); paintAll(); syncTick();
    activity(r, `Keep going started in “${titleOf(r)}”: ${C.describe(r).replace(/^🔁 Keep going /, '')}`);
    // (no note: the header chip says it, with ❚❚ / ■; its tooltip has the words each round sends)
    checkSoon(r, first ? C.SETTLE : 300); // with your message first: its reply's end calls again
    return r;
  }
  function rememberPrompt(chatId, text) {
    const p = store.get(PROMPTS, {}) || {};
    const t = String(text || '').trim();
    if (!t || t === C.DEFAULT_PROMPT) delete p[chatId]; else p[chatId] = t.slice(0, 4000);
    const keys = Object.keys(p); if (keys.length > 200) delete p[keys[0]];
    store.set(PROMPTS, p);
  }
  const promptFor = (chatId) => (store.get(PROMPTS, {}) || {})[chatId] || C.DEFAULT_PROMPT;

  // ---------- the card ----------
  // → Promise<spec | null>. first: the owner's message that goes before the rounds (shown, not edited here)
  function card(agentId, { chatId = null, first = null } = {}) {
    return new Promise((resolve) => {
      const last = store.get(LAST, null) || {};
      const ex = chatId ? forChat(chatId) : null;
      let spend = {};
      try { if (typeof Budget !== 'undefined') spend = Budget.state(agentId); } catch { /* not loaded */ }
      const dlg = el('dialog', { class: 'ui-modal rt-dlg', attrs: { 'aria-label': 'Keep going' } });
      const words = el('textarea', { class: 'rt-words', rows: 3, value: ex?.prompt || promptFor(chatId), attrs: { 'aria-label': 'What to ask each time' } });
      // how long: one row of choices; "Until…" and "Rounds" show their one field
      let how = last.how?.kind ? last.how : { kind: 'rounds', rounds: 5 };
      let howId = how.kind === 'rounds' ? 'rounds' : how.kind === 'forever' ? 'forever' : how.kind === 'until' ? 'until' : (C.HOW.find((h) => h.ms === how.ms)?.id || '1h');
      const roundsIn = el('input', { type: 'number', min: 1, max: C.MAX_ROUNDS, value: String(how.rounds || 5), class: 'rt-num', attrs: { 'aria-label': 'Extra rounds' } });
      const untilIn = el('input', { type: 'time', value: how.time || '18:00', class: 'rt-time', attrs: { 'aria-label': 'Until this time' } });
      const howRow = el('div', { class: 'rt-how', role: 'radiogroup', attrs: { 'aria-label': 'How long' } });
      const capSel = el('select', { class: 'rt-cap', attrs: { 'aria-label': 'Spending cap' } });
      const capHint = el('span', { class: 'hint rt-cap-hint' });
      const howNow = () => {
        const h = C.HOW.find((x) => x.id === howId);
        if (h.kind === 'rounds') return { kind: 'rounds', rounds: Math.max(1, Math.min(C.MAX_ROUNDS, Math.round(Number(roundsIn.value) || 5))) };
        if (h.kind === 'until') return { kind: 'until', time: untilIn.value, at: C.untilAt(untilIn.value) };
        if (h.kind === 'time') return { kind: 'time', ms: h.ms };
        return { kind: 'forever' };
      };
      const paintHow = () => {
        howRow.replaceChildren(...C.HOW.map((h) => el('button', { type: 'button', class: `rt-opt${h.id === howId ? ' on' : ''}`, role: 'radio', attrs: { 'aria-checked': String(h.id === howId) }, text: h.id === 'rounds' ? 'Extra rounds' : h.label, on: { click: () => { howId = h.id; paintHow(); paintCap(); } } })),
          howId === 'rounds' ? roundsIn : null, howId === 'until' ? untilIn : null);
      };
      const def = C.defaultCap(spend);
      let capPick = last.cap ?? 'default';
      const paintCap = () => {
        const need = C.needsCap(howNow());
        const opts = [['default', `≈ ${fmt(def)} tokens${spend.limit ? ' (from your weekly limit)' : ''}`], ...C.CAPS.filter((c) => c !== def).map((c) => [String(c), `≈ ${fmt(c)} tokens`]), ...(need ? [] : [['0', 'No cap']])];
        if (!opts.some(([v]) => v === String(capPick))) capPick = 'default';
        capSel.replaceChildren(...opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === String(capPick) })));
        capHint.textContent = need ? 'Required for long routines: it stops politely before a round would pass it.' : 'It stops politely before a round would pass it.';
      };
      capSel.addEventListener('change', () => { capPick = capSel.value; });
      untilIn.addEventListener('change', paintCap); roundsIn.addEventListener('input', paintCap);
      const pauseSel = el('select', { attrs: { 'aria-label': 'Pause between rounds' } }, C.PAUSES.map((p) => el('option', { value: p.id, text: p.label, selected: p.id === (ex?.pause || last.pause || 'none') })));
      const writeSel = el('select', { attrs: { 'aria-label': 'When I write in this chat' } }, C.WHEN_I_WRITE.map((w) => el('option', { value: String(w.ms), text: w.label, selected: w.ms === (ex?.resumeAfter ?? last.resumeAfter ?? 0) })));
      const box = (label, on, title) => { const i = el('input', { type: 'checkbox', checked: on }); return [el('label', { class: 'rt-check', title }, i, label), i]; };
      const [lightL, lightI] = box('Continue lighter when the chat gets long', last.lighter !== false, 'Between rounds, a short summary replaces the long history for the AI when it clearly costs less (every message stays).');
      const [resetL, resetI] = box('Wait for a usage limit to reset, then go on', last.waitReset !== false, 'Otherwise a usage limit stops it.');
      const [restartL, restartI] = box('Keep going after Hearth restarts', last.afterRestart === true, 'Otherwise a restart pauses it and asks.');
      const row = (label, ...kids) => el('div', { class: 'rt-row' }, el('span', { class: 'rt-label', text: label }), ...kids);
      const finish = (v) => { dlg.close(); resolve(v); };
      const go = () => {
        const h = howNow();
        if (h.kind === 'until' && !h.at) { toast('Pick a time for “Until…”.', { timeout: 2500 }); return; }
        const cap = capSel.value === 'default' ? def : Number(capSel.value) || 0;
        finish({ prompt: words.value.trim() || C.DEFAULT_PROMPT, how: h, pause: pauseSel.value, resumeAfter: Number(writeSel.value) || 0, cap, capPick: capSel.value === 'default' ? 'default' : Number(capSel.value), lighter: lightI.checked, waitReset: resetI.checked, afterRestart: restartI.checked });
      };
      const form = el('form', { method: 'dialog', on: { submit: (e) => { e.preventDefault(); go(); } } },
        el('h2', { text: '🔁 Keep going' }),
        el('p', { class: 'rt-intro hint', text: first ? 'Your message goes first. Then, each time a reply finishes here, Hearth sends these words as a new turn (marked 🔁).' : 'Each time a reply finishes here, Hearth sends these words as a new turn (marked 🔁). Writing yourself pauses it.' }),
        el('label', { class: 'rt-field' }, el('span', { class: 'rt-label', text: 'What to ask each time' }), words),
        el('div', { class: 'rt-field' }, el('span', { class: 'rt-label', text: 'How long' }), howRow),
        row('Pause between rounds', pauseSel),
        row('Spending cap', capSel), capHint,
        el('details', { class: 'rt-more' }, el('summary', { text: 'More' }), row('When I write here', writeSel), lightL, resetL, restartL),
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Cancel', on: { click: () => finish(null) } }),
          el('button', { type: 'submit', class: 'primary', text: first ? 'Send and keep going' : ex ? 'Start again with these' : 'Start' })));
      paintHow(); paintCap();
      dlg.append(form);
      dlg.addEventListener('close', () => { setTimeout(() => dlg.remove(), 0); resolve(null); });
      document.body.append(dlg);
      dlg.showModal();
      words.focus(); words.setSelectionRange(words.value.length, words.value.length);
    });
  }
  // the card, then the routine (from a reply's ⋯, Find anything, /keepgoing)
  async function open(agentId, { chatId = null, first = null } = {}) {
    const id = agentId || agentNow()?.id;
    if (!id) { toast('Open a chat with Claude or Astra first.', { timeout: 2500 }); return null; }
    const cid = chatId || (first ? null : Native.chatOf(id)?.id) || null;
    if (!cid && !first) { toast('Write your first message, then pick ◎ › 🔁 Keep going… (or start it from a reply\'s ⋯).', { timeout: 4000 }); return null; }
    const spec = await card(id, { chatId: cid, first });
    if (!spec) { if (first) Native.setDraft(id, first); return null; }
    try { return await start(id, spec, { chatId: cid, first }); } catch (err) { toast(err.message, { type: 'error' }); if (first) Native.setDraft(id, first); return null; }
  }
  function agentNow() {
    const a = H.agent(H.activeId);
    if (a?.mode === 'native') return a;
    const sid = String(H.activeId ? H.surfaceIdFor?.(H.activeId) || '' : '');
    return (sid.startsWith('tool:') && window.Tools?.dockedAgent?.(sid.slice(5))) || H.claudeAgent?.() || null;
  }

  // ---------- the chat side ----------
  Native.hooks.send.push((agentId, chat, text) => {
    const m = chat.messages.at(-1);
    if (tagNext && tagNext.chatId === chat.id && tagNext.text === text) {
      if (m?.role === 'user') { m.routine = tagNext.routine; Native.save(chat); }
      tagNext = null;
      return;
    }
    // the owner wrote (not a hook's line, not offline.js's "continue", not a compacting step, not a re-send): read once
    // every send hook has run (hooks.js marks its own message in its hook, whichever loaded first)
    queueMicrotask(() => ownerSent(chat, m));
  });
  function ownerSent(chat, m) {
    if (m?.role !== 'user' || m.routine || m.hook || m.cont || m.compactReq || Date.now() - (m.at || 0) > 3000) return;
    lastWrote = Date.now(); store.set('routines.wrote', lastWrote);
    const r = forChat(chat.id);
    if (!r || (m.at || 0) <= r.createdAt) return;
    const was = r.status;
    C.ownerWrote(r, Date.now());
    awake(r, false); save(); paintAll();
    if (r.status === 'paused' && was === 'running') { say(r, `🔁 Keep going is paused: you wrote in this chat. ▶ Resume when you want it to go on.`); activity(r, `Keep going paused in “${titleOf(r)}”: you wrote`, '❚❚'); }
  }
  Native.hooks.finish.push((event, chat) => {
    if (!chat) return;
    const r = forChat(chat.id);
    if (!r) return;
    const asked = [...chat.messages].reverse().find((m) => m.role === 'user');
    if (asked?.routine?.id !== r.id) { if (r.status === 'running') checkSoon(r); return; } // your message (or a hook's) was answered
    awake(r, false);
    const tokens = event.usage ? (event.usage.input || 0) + (event.usage.output || 0) : 0;
    let kind = null; let resetAt = 0;
    if (event.type === 'error') {
      try { const c = typeof OfflineCore !== 'undefined' ? OfflineCore.classify(event.message || '') : null; kind = c?.kind || null; resetAt = c?.resetAt || 0; } catch { /* unknown */ }
      if (!kind && event.needsLogin) kind = 'signedout';
    }
    const before = r.status;
    const out = C.roundEnded(r, { type: event.type, text: event.type === 'error' ? event.message : event.text, tokens, ms: Date.now() - (r.sentAt || Date.now()), kind, resetAt, asked: r.asked }, Date.now());
    r.asked = false;
    // the round's message says what it cost
    if (tokens) { asked.routine.tokens = (asked.routine.tokens || 0) + tokens; Native.save(chat); paintMsgChip(chat.id, asked); }
    if (out.act === 'continue' || out.act === 'wait') {
      const of = r.how.kind === 'rounds' ? ` of ${r.how.rounds}` : '';
      if (event.type === 'done') activity(r, `Keep going: round ${r.round}${of} done in “${titleOf(r)}” · ≈ ${fmt(tokens)} tokens (≈ ${fmt(r.tokens)} so far)`);
      save(); paintAll();
      if (out.act === 'continue') checkSoon(r);
      return;
    }
    if (out.act === 'pause' && before === 'running') { r.status = 'running'; pauseFor(r, out.why); return; }
    if (out.act === 'stop') { const why = r.why; const st = r.status; r.status = before; end(r, st, why); }
  });
  // a permission card or a question in a routine's chat while its round runs: the routine pauses after it (never answers)
  document.addEventListener('hearth:needs-you', (e) => {
    const d = e.detail || {};
    const r = d.chatId ? forChat(d.chatId) : null;
    if (r && r.inFlight) { r.asked = true; r.why = 'it asked for your OK'; paintAll(); }
  });
  Native.hooks.message.push((node, m) => {
    if (!m.routine || m.role !== 'user') return;
    node.classList.add('routine-msg');
    const chip = el('span', { class: 'rt-msg-chip', dataset: { rid: m.routine.id, n: String(m.routine.n) }, text: msgChipText(m.routine), title: 'Sent by 🔁 Keep going (a routine), not typed by you' });
    const foot = node.querySelector(':scope > .user-foot') || node.querySelector(':scope > .msg-foot');
    if (foot) foot.prepend(chip); else node.append(chip);
  });
  const msgChipText = (t) => `🔁 round ${t.n}${t.of ? ` of ${t.of}` : ''}${t.tokens ? ` · ≈ ${fmt(t.tokens)} tokens` : ''}`;
  function paintMsgChip(chatId, m) {
    for (const n of document.querySelectorAll(`.rt-msg-chip[data-rid="${m.routine.id}"][data-n="${m.routine.n}"]`)) { const t = msgChipText(m.routine); if (n.textContent !== t) n.textContent = t; }
  }

  // ---------- the header chip: "🔁 3 of 5 · ≈ 42k tokens so far · ❚❚ ■" ----------
  function paintChip(agentId, v) {
    if (!v?.meta) return;
    const r = forChat(H.activeChat[agentId]);
    let chip = v.rtChip;
    if (!r) { if (chip && !chip.hidden) chip.hidden = true; return; }
    if (!chip || !chip.isConnected) {
      const label = el('button', { type: 'button', class: 'rt-chip-label', on: { click: (e) => menu(chip.rid, e) } });
      const toggle = el('button', { type: 'button', class: 'rt-chip-btn rt-toggle', on: { click: () => { const x = byId(chip.rid); if (x?.status === 'running') pause(x.id); else resume(chip.rid); } } });
      const halt = el('button', { type: 'button', class: 'rt-chip-btn rt-stop', text: '■', title: 'Stop the routine', attrs: { 'aria-label': 'Stop the routine' }, on: { click: () => stop(chip.rid) } });
      chip = el('span', { class: 'rt-chip', role: 'group', attrs: { 'aria-label': 'Keep going (a routine)' } }, label, toggle, halt);
      chip.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(chip.rid, e); });
      v.meta.after(chip);
      v.rtChip = chip;
    }
    chip.rid = r.id;
    if (chip.hidden) chip.hidden = false;
    const [label, toggle] = chip.children;
    const t = C.chipText(r);
    if (label.textContent !== t) label.textContent = t;
    const tip = `${C.describe(r)}\nEach round sends: “${C.clip(r.prompt, 160)}”${r.why ? `\nNow: ${r.why}` : r.inFlight ? '\nNow: a round is running' : ''}\nClick: each round's cost, change it, stop`;
    if (label.title !== tip) label.title = tip;
    const paused = r.status === 'paused';
    chip.classList.toggle('paused', paused);
    const tt = paused ? '▶' : '❚❚';
    if (toggle.textContent !== tt) { toggle.textContent = tt; toggle.title = paused ? 'Resume the routine' : 'Pause the routine'; toggle.setAttribute('aria-label', toggle.title); }
  }
  function paintAll() { for (const a of H.agents()) if (a.mode === 'native') { const v = Native.view(a.id); if (v) paintChip(a.id, v); } }
  Native.hooks.render.push((agentId, v) => paintChip(agentId, v));
  // click the chip: each round's cost, change the words / settings, stop
  function menu(id, e) {
    const r = byId(id);
    if (!r) return;
    const rect = e.currentTarget?.getBoundingClientRect?.() || { left: e.clientX, bottom: e.clientY };
    const rounds = r.rounds.slice(-12).map((x) => ({ label: `Round ${x.n}: ${x.ok ? `≈ ${fmt(x.tokens)} tokens${x.ms >= 1000 ? ` · ${C.mins(x.ms) === '0 min' ? `${Math.round(x.ms / 1000)} s` : C.mins(x.ms)}` : ''}${x.said ? ` · said it's ${x.said}` : ''}` : x.stopped ? 'stopped' : `failed${x.error ? `: ${C.clip(x.error, 40)}` : x.kind ? ` (${x.kind})` : ''}`}`, disabled: true }));
    showMenu(rect.left, rect.bottom + 4, [
      { label: `${C.describe(r)} · ≈ ${fmt(r.tokens)} tokens so far`, disabled: true },
      { label: `Rounds (${r.done} answered)`, items: () => (rounds.length ? rounds : [{ label: 'None yet', disabled: true }]) },
      '-',
      r.status === 'running' ? { label: '❚❚ Pause', action: () => pause(r.id) } : { label: '▶ Resume', action: () => resume(r.id) },
      { label: '✎ Change it…', action: () => open(r.agentId, { chatId: r.chatId }) },
      { label: '■ Stop', action: () => stop(r.id) },
    ]);
  }

  // ---------- a reply's ⋯ › Reply › 🔁 Keep going from here… (native.js hooks.msgMenu) ----------
  Native.hooks.msgMenu?.push((agentId, index, m, chat) => {
    if (m.role !== 'assistant' || index !== chat.messages.length - 1) return [];
    const r = forChat(chat.id);
    return [r ? { label: '🔁 Keep going: running…', action: () => menu(r.id, { clientX: innerWidth / 2, clientY: 80 }) } : { label: '🔁 Keep going from here…', action: () => open(agentId, { chatId: chat.id }) }];
  });

  // ---------- ◎ Missions › More › 🔁 Keep going… (for the message being sent) ----------
  if (typeof Missions !== 'undefined' && Missions.add) {
    Missions.add({ id: 'keepgoing', more: true, icon: '🔁', label: 'Keep going…', desc: 'After this message, it keeps improving the work by itself: for a time, a number of extra rounds, or until you stop it (with a spending cap).',
      submit: (agentId, text) => { open(agentId, { chatId: Native.chatOf(agentId)?.id || null, first: text }); return true; } });
  }

  // ---------- ⋯ AI setup: the routines of this AI, with ■ Stop ----------
  function section(a, { repaint } = {}) {
    const mine = list.filter((r) => r.agentId === a.id && C.live(r));
    if (!mine.length) return null;
    const rows = mine.map((r) => el('div', { class: 'opt-rule rt-setup-row' },
      el('span', { class: 'opt-rule-text', text: `“${titleOf(r)}” · ${C.chipText(r)}${r.why ? ` · ${r.why}` : ''}`, title: `${C.describe(r)}\nEach round sends: “${C.clip(r.prompt, 200)}”` }),
      r.status === 'paused' ? el('button', { type: 'button', class: 'ghost small', text: '▶', title: 'Resume', attrs: { 'aria-label': 'Resume' }, on: { click: () => { resume(r.id); repaint?.(); } } })
        : el('button', { type: 'button', class: 'ghost small', text: '❚❚', title: 'Pause', attrs: { 'aria-label': 'Pause' }, on: { click: () => { pause(r.id); repaint?.(); } } }),
      el('button', { type: 'button', class: 'ghost small', text: '■ Stop', title: 'End this routine', on: { click: () => { stop(r.id); repaint?.(); } } })));
    return el('section', { class: 'opt-sec rt-setup' }, el('h4', { class: 'opt-h', text: '🔁 Keep going' }),
      el('p', { class: 'opt-hint', text: 'Chats that keep working by themselves now.' }), el('div', { class: 'opt-rules' }, rows));
  }
  const summary = (agentId) => { const n = list.filter((r) => r.agentId === agentId && C.live(r)); return n.length ? `${n.filter((r) => r.status === 'running').length} running${n.some((r) => r.status === 'paused') ? `, ${n.filter((r) => r.status === 'paused').length} paused` : ''}` : ''; };

  // ---------- the calm 30 s tick: the chip's time left, a check that nothing was missed (only while one is live) ----------
  let ticking = false;
  function tick() {
    paintAll();
    for (const r of list) if (r.status === 'running' && !r.inFlight && !timers.has(r.id)) checkSoon(r, 100);
    syncTick();
  }
  function syncTick() {
    const need = list.some((r) => C.live(r));
    if (need === ticking) return;
    ticking = need;
    if (window.Power?.every) { if (need) Power.every('routines', 30000, tick, { first: 30000, max: 60000 }); else Power.stop?.('routines'); }
    else if (need) { ticking = setInterval(tick, 30000); } else clearInterval(ticking);
  }

  // ---------- after a restart: a resume prompt (or on by itself, when chosen) ----------
  function afterStart() {
    const back = [];
    for (const r of list) {
      if (!C.live(r)) continue;
      const wasRunning = r.status === 'running';
      C.restarted(r);
      if (wasRunning && r.status === 'paused') back.push(r);
      else if (r.status === 'running') { activity(r, `Keep going went on after the restart in “${titleOf(r)}” (you chose that)`); checkSoon(r, 20000); }
    }
    saveNow(); syncTick();
    if (!back.length) return;
    for (const r of back) activity(r, `Keep going waits in “${titleOf(r)}”: Hearth restarted`, '❚❚');
    const r0 = back[0];
    toast(`🔁 Keep going was running in “${titleOf(r0)}”${back.length > 1 ? ` and ${back.length - 1} more chat${back.length > 2 ? 's' : ''}` : ''} when Hearth closed. Resume?`, { timeout: 30000, action: { label: '▶ Resume', fn: () => { for (const r of back) resume(r.id); } } });
    setTimeout(paintAll, 500);
  }
  afterStart();

  // ---------- Find anything (Ctrl/⌘+K) and /keepgoing (the internal API) ----------
  AppUI.addAction?.('🔁 Keep going: this chat keeps improving its work by itself (a routine)…', () => { const a = agentNow(); if (a) open(a.id); });
  if (!Commands.get('keepgoing')) {
    Commands.register({
      name: 'keepgoing', aliases: ['routine'], area: 'Chat', args: '[<n> rounds | <minutes>m | forever | pause | resume | stop | status]',
      desc: '🔁 Keep going: this chat keeps improving its work by itself after each reply (the card, or straight away with the last choices)',
      complete: () => ['5', '30m', 'forever', 'pause', 'resume', 'stop', 'status'].map((value) => ({ value })),
      run: async (args, ctx) => {
        const a = String(args || '').trim().toLowerCase();
        const agent = H.agent(ctx.agentId);
        if (agent?.mode !== 'native') return 'Run this in a chat with Claude or Astra.';
        const chat = Native.chatOf(agent.id);
        const r = chat ? forChat(chat.id) : null;
        if (a === 'stop') return r ? (stop(r.id), '🔁 Stopped.') : 'No routine runs in this chat.';
        if (a === 'pause') return r ? (pause(r.id), '🔁 Paused.') : 'No routine runs in this chat.';
        if (a === 'resume') return r ? (resume(r.id), '🔁 Going on.') : 'No routine in this chat.';
        if (a === 'status') return r ? `${C.chipText(r)} · ${C.describe(r)}${r.why ? ` · ${r.why}` : ''}` : 'No routine runs in this chat.';
        if (!a) { open(agent.id, { chatId: chat?.id || null }); return undefined; }
        if (!chat) return 'Write your first message first.';
        const last = store.get(LAST, null) || {};
        let how = null;
        const m = /^(\d+)\s*(m|min|h)?(?:\s*rounds?)?$/.exec(a);
        if (a === 'forever') how = { kind: 'forever' };
        else if (m && !m[2]) how = { kind: 'rounds', rounds: Number(m[1]) };
        else if (m) how = { kind: 'time', ms: Number(m[1]) * (m[2] === 'h' ? C.HOUR : C.MIN) };
        if (!how) return 'Say a number of rounds (5), a time (30m, 2h), forever, pause, resume, stop or status.';
        let spend = {}; try { if (typeof Budget !== 'undefined') spend = Budget.state(agent.id); } catch { /* not loaded */ }
        const cap = typeof last.cap === 'number' && (last.cap || !C.needsCap(how)) ? last.cap : C.defaultCap(spend);
        const x = await start(agent.id, { prompt: promptFor(chat.id), how, pause: last.pause || 'none', resumeAfter: last.resumeAfter || 0, cap, capPick: last.cap ?? 'default', lighter: last.lighter !== false, waitReset: last.waitReset !== false, afterRestart: last.afterRestart === true }, { chatId: chat.id });
        return `${C.describe(x)}.`;
      },
    });
  }

  return {
    open, start, card, stop, pause, resume, section, summary, forChat, list: () => list.map((r) => ({ ...r })), get: byId,
    _test: { scale: (x) => { scale = x; }, check, idle: (ms) => { lastInput = Date.now() - ms; }, quiet: (ms) => { lastWrote = Date.now() - ms; }, afterStart, reload: () => { list = (store.get(KEY, []) || []).map((r) => C.normalize(r)).filter(Boolean); }, timers },
  };
})();
window.Routines = Routines;
