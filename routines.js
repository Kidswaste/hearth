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
  const checking=new Set(),starting=new Set();
  const feedbackJobs=new Map();
  const cancelFeedback=r=>feedbackJobs.get(r.id)?.abort();
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
  const recentFor = chatId => forChat(chatId) || list.filter(r=>r.chatId===chatId).at(-1);
  const byId = (id) => list.find((r) => r.id === id) || null;
  const nameOf = (r) => H.agent(r.agentId)?.name || 'the AI';
  const titleOf = (r) => r.title || 'this chat';
  const fmt = C.fmt;
  const activity = (r, text, icon = '🔁') => document.dispatchEvent(new CustomEvent('hearth:activity', { detail: { icon, text, go: { chat: [r.agentId, r.chatId] } } }));
  // (round 44, notify) a desktop notification while you're in another app (Settings › Advanced › Tell me when… › Keep going)
  const tell = (r, phase, extra = {}) => { try { window.Notify?.send({ type: 'keepgoing', phase, agentId: r.agentId, chatId: r.chatId, chatTitle: titleOf(r), ...extra }); } catch { /* fine */ } };
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
      limits: limitsFor(r.agentId, now), when,
    };
  }
  // (round 51, routinelean) this AI's plan windows as the Usage window knows them (usagelimits.js; 0 tokens)
  const when = (t) => (typeof UsageLimitsCore !== 'undefined' ? UsageLimitsCore.when(t) : C.clock(t));
  function limitsFor(agentId, now = Date.now()) {
    const engine = H.agent(agentId)?.engine;
    const st = window.UsageLimits?.state;
    if (!st || !engine || typeof UsageLimitsCore === 'undefined') return [];
    try { return UsageLimitsCore.views(st, engine, now).filter((v) => !v.reset && v.used != null).map((v) => ({ key: v.key, long: v.long, used: v.used, resetsAt: v.resetsAt })); } catch { return []; }
  }
  function later(r, ms) {
    clearTimeout(timers.get(r.id));
    timers.set(r.id, setTimeout(() => { timers.delete(r.id); check(r.id); }, Math.max(50, Math.min(ms, 5 * C.MIN) * scale)));
  }
  async function check(id) {
    if(checking.has(id))return;checking.add(id);
    try {
    const r = byId(id);
    if (!r || r.status !== 'running') return;
    const chat = await Native.load(r.chatId).catch(() => null);
    if (!chat) { end(r, 'stopped', 'its chat is gone'); return; }
    r.title = C.clip(chat.title, 60) || r.title;
    // a plan waiting for ▶ Go ahead (◎ Plan first) is yours to answer
    const lastMsg = chat.messages.at(-1);
    if (!Native.isBusy(r.chatId) && lastMsg?.role === 'assistant' && lastMsg.plan === 'waiting') { pauseFor(r, 'its plan waits for your ▶ Go ahead'); return; }
    let quota=null,d=C.readyStep(r,context(r));
    if (!d) {
      if(r.allowance)quota=await readAllowance(r.agentId,{after:r.round ? r.lastEnd-5000 : r.allowance.createdAt-2*C.MIN});
      else await refreshLimits(r.agentId);
    }
    const lastUsage=[...chat.messages].reverse().find(m=>m.role==='assistant' && C.usageOf(m.usage))?.usage;
    d ||= C.nextStep(r, {...context(r),engine:H.agent(r.agentId)?.engine,model:chat.model||H.agent(r.agentId)?.model||'',allowanceWindows:quota?.windows,allowanceFresh:quota?.fresh,lastTokens:C.usageOf(lastUsage)?.tokens || 0});
    if(r.allowance&&quota){saveNow();paintAll();}
    if (d.act === 'none') return;
    if (d.act === 'wait' && d.hold) { holdFor(r, d); later(r, d.ms); return; }
    if (d.act === 'wait') { if (d.why && r.why !== d.why) { r.why = d.why; save(); paintAll(); } later(r, d.ms); return; }
    if (d.act === 'pause') { pauseFor(r, d.why); return; }
    if (d.act === 'stop') { end(r, d.status, d.why); return; }
    await round(r, chat);
    }finally{checking.delete(id);}
  }
  const checkSoon = (r, ms = C.SETTLE) => later(r, ms);
  const refreshing=new Map(), refreshed=new Map();
  const allowanceReads=new Map();
  async function readAllowance(agentId,{after=Date.now()-2*C.MIN}={}) {
    const engine=H.agent(agentId)?.engine;
    if(!['claude','codex'].includes(engine))return {windows:[],fresh:false};
    await Lazy.load('usagelimits');
    if(!allowanceReads.has(engine)){
      const job=(async()=>{let timer;try{return await Promise.race([engine==='codex'?UsageLimits.readAstra({fresh:true}):UsageLimits.readClaude({fresh:true}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),30000);})]);}catch{return null;}finally{clearTimeout(timer);allowanceReads.delete(engine);}})();
      allowanceReads.set(engine,job);
    }
    const result=await allowanceReads.get(engine);
    let windows=engine==='codex'?UsageLimitsCore.fromCodex(result):result?.ok?UsageLimitsCore.fromUsageText(result.text,result.at):[];
    // Claude may expose percentages only in its own completed-reply events. A carried
    // value is not a new observation; preserve its original measurement timestamp.
    if(engine==='claude'&&!windows.length)windows=Object.values(UsageLimits.state?.engines?.claude?.windows||{}).filter(w=>w.source==='event'&&w.used!=null).map(w=>({...w,at:w.usedAt??w.at}));
    windows=windows.filter(w=>w.resetsAt>Date.now()).map(w=>({...w,label:w.label||UsageLimitsCore.view(w)?.label||w.key}));
    return {engine,windows,fresh:result?.ordinaryUsageAllowed!==false&&windows.length>0&&windows.every(w=>w.at>=after&&w.at>=Date.now()-2*C.MIN)};
  }
  async function refreshFinishedAllowance(r) {
    if(!r.allowance||r.allowance.finishedAt||r.status==='running'||r.inFlight||r.feedbackActive||Native.isBusy(r.chatId))return;
    try {
      const snap=await readAllowance(r.agentId,{after:r.lastEnd-5000}),chat=await Native.load(r.chatId);
      if(r.status==='running'||r.inFlight||r.feedbackActive)return;
      // Refresh the displayed consumption without resuming or replacing a manual stop.
      C.allowanceCheck(r,{engine:H.agent(r.agentId)?.engine,model:chat?.model||H.agent(r.agentId)?.model||'',allowanceWindows:snap.windows,allowanceFresh:snap.fresh},Date.now());
      if(snap.fresh&&['done','stopped'].includes(r.status))r.allowance.finishedAt=Date.now();
      saveNow();paintAll();
    }catch{/* the last measured timestamp remains visible */}
  }
  async function refreshLimits(agentId) {
    const engine=H.agent(agentId)?.engine;
    if(!engine || Date.now()-(refreshed.get(engine)||0)<60000)return;
    if(refreshing.has(engine))return refreshing.get(engine);
    const job=(async()=>{try{
      await Lazy.load('usagelimits');
      let timer;try{await Promise.race([engine==='codex'?window.UsageLimits?.readAstra():window.UsageLimits?.readClaude(),new Promise(resolve=>{timer=setTimeout(resolve,8000);})]);}finally{clearTimeout(timer);}
    }catch{/* unknown is displayed as unknown */}finally{refreshed.set(engine,Date.now());refreshing.delete(engine);}})();
    refreshing.set(engine,job);return job;
  }

  // one round: (lighter first when it clearly pays) the routine's words as a new turn in its chat
  async function feedbackGate(r,chat) {
    if(r.status!=='running')throw Error('The run is paused or stopped.');
    RoutineFeedback.assertCurrent(r);
    const quota=r.allowance?await readAllowance(r.agentId,{after:Math.max(r.lastEnd||0,r.feedbackLastEnd||0,r.allowance.createdAt-2*C.MIN)-5000}):null;
    const d=C.nextStep(r,{...context(r),engine:H.agent(r.agentId)?.engine,model:chat.model||H.agent(r.agentId)?.model||'',allowanceWindows:quota?.windows,allowanceFresh:quota?.fresh});
    saveNow();
    if(d.act==='send')return;
    if(r.status==='running') {if(d.act==='stop')end(r,d.status,d.why);else pauseFor(r,d.why||'Waiting for the project before continuing visual feedback.');}
    throw Error(d.why||'Visual feedback is paused.');
  }
  async function feedbackRound(r,chat) {
    const controller=new AbortController();feedbackJobs.set(r.id,controller);r.feedbackActive=true;saveNow();awake(r,true);
    let painted=0;
    try {
      return await RoutineFeedback.run(r,chat,{signal:controller.signal,beforeCall:()=>feedbackGate(r,chat),
        onUsage:raw=>{const u=C.helperUsage(r,raw);r.feedbackCalls++;r.feedbackLastEnd=Date.now();stat({t:u?.tokens||0});saveNow();paintAll();},
        onSaved:entry=>{r.feedbackLast={id:entry.id,file:entry.packet.file,at:entry.at,complete:entry.meta.complete,replies:entry.meta.turns,summary:entry.result.summary,change:entry.result.issues[0]?.change||''};saveNow();},
        status:text=>{r.why=text;if(Date.now()-painted>700){painted=Date.now();paintAll();}}
      });
    } catch(e) {if(r.status==='running')pauseFor(r,e.message);return null;}
    finally{r.feedbackActive=false;feedbackJobs.delete(r.id);awake(r,false);saveNow();paintAll();if(r.status!=='running')void refreshFinishedAllowance(r);}
  }
  async function round(r, chat) {
    if(r.preparing)return;r.preparing=true;
    try {
    const lean = r.lighter ? await leanFirst(r, chat) : null; // (round 51) the lighter fresh start between rounds
    if (lean == null && r.lighter && window.Autocompact?.offerFor && H.activeChat[r.agentId] === r.chatId) {
      let d = null; try { d = Autocompact.offerFor(chat); } catch { /* no decision */ }
      if (d) {
        r.lightening = true; r.why = 'continuing lighter first'; paintAll();
        try { await Autocompact.run(r.agentId,{onUsage:raw=>{const u=C.helperUsage(r,raw);stat({t:u?.tokens||0});saveNow();paintAll();}}); } catch (err) { r.usageUnknown=true;console.warn('routines: lighter', err.message); }
        r.lightening = false;
        if (r.status !== 'running') return;
        checkSoon(r, 500);
        return;
      }
    }
    if(r.status!=='running')return;
    let visual=null;
    if(r.feedback){
      visual=await feedbackRound(r,chat);
      if(!visual||r.status!=='running')return;
      if(visual.done){end(r,'done','The visual review found no worthwhile change. Review the result before starting another run.');return;}
      try {await feedbackGate(r,chat);visual.valid();}catch(e){if(r.status==='running')pauseFor(r,e.message);return;}
    }
    try { C.limitStep(r, limitsFor(r.agentId)); } catch { /* no numbers */ }
    const n = C.sent(r);
    r.title = C.clip(chat.title, 60) || r.title;
    const text = visual?.text || C.message(r);
    tagNext = { chatId: r.chatId, text, routine: { id: r.id, n, of: r.how.kind === 'rounds' ? r.how.rounds : 0 } };
    awake(r, true);
    save(); paintAll();
    try {
      await Native.send(r.agentId, text, { chatId: r.chatId, ...(visual?{images:visual.images}:{}) });
    } catch (err) {
      tagNext = null; awake(r, false);
      r.round -= 1; r.inFlight = false;
      if (/gone/i.test(err.message)) { end(r, 'stopped', 'its chat is gone'); return; }
      checkSoon(r, 5000); // still answering (a message of yours went first): after it
    }
    } finally {r.preparing=false;}
  }
  // (round 51, routinelean) before a round: go on in a fresh session with the lighter history (historylean.js) when the
  // cache has expired, or when the chat re-reads a lot and more rounds follow; no extra model call (Continue lighter's
  // summary is the fallback when historylean isn't there). → true (it will), false (no need), null (can't tell)
  async function leanFirst(r, chat) {
    if (!window.HistoryLean && window.Lazy?.load) { try { await Lazy.load('historylean'); } catch { /* without it */ } }
    const HL = window.HistoryLean;
    if (!HL?.plan || typeof HistoryLeanCore === 'undefined' || !chat.session?.id) return HL ? false : null;
    let d = null; try { d = HL.plan(chat); } catch { return null; }
    if (!d?.input) return false;
    if (d.rebase) { r.leanStarts += 1; return true; } // its own rule already takes it (a cold cache)
    const i = d.input;
    const remaining = r.how.kind === 'rounds' ? Math.max(0, r.how.rounds - r.round - 1) : 3;
    const b = C.leanBetween({ ...i, warm: HistoryLeanCore.warmth(i.engine, i.gap, i.ttl) }, { remaining });
    if (!b.lean) return false;
    chat.leanNext = true; Native.save(chat); // historylean's onSend makes the fresh start with this round's message
    r.leanStarts += 1;
    return true;
  }
  // (round 51, routinelean) a usage limit is near: held until its reset (then it goes on by itself), said once
  function holdFor(r, d) {
    r.resetAt = d.hold; r.limitWait = true; r.why = d.why;
    awake(r, false); save(); paintAll();
    say(r, `🔁 Keep going is ${d.why}: ${d.detail}. It goes on by itself after the reset.`);
    activity(r, `Keep going ${d.why} in “${titleOf(r)}”`, '❚❚');
    tell(r, 'pause', { why: `${d.why}: ${d.detail}` });
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
    cancelFeedback(r);
    awake(r, false); clearTimeout(timers.get(r.id)); save(); paintAll();
    say(r, `🔁 Keep going is paused: ${why}.`);
    activity(r, `Keep going paused in “${titleOf(r)}”: ${why}`, '❚❚');
    if (!/by you|you wrote|your OK/i.test(why)) tell(r, 'pause', { why }); // (a permission / question notifies by itself)
  }
  function end(r, status, why) {
    if (!C.live(r)) return;
    r.status = status || 'stopped'; r.why = why;
    cancelFeedback(r);
    if(r.allowance&&!r.inFlight&&!r.feedbackActive&&!Native.isBusy(r.chatId)&&r.allowance.windows.every(w=>w.at>=Math.max(r.lastEnd,r.feedbackLastEnd||0)))r.allowance.finishedAt=Date.now();
    awake(r, false); clearTimeout(timers.get(r.id)); timers.delete(r.id);
    saveNow(); paintAll(); syncTick();
    if(r.allowance&&!r.inFlight)void refreshFinishedAllowance(r);
    const sum = `${r.done} round${r.done === 1 ? '' : 's'} · ${r.allowance?Math.round(C.allowanceProgress(r.allowance))+'% of budget used':'≈ '+fmt(r.tokens)+' tokens'}${r.files ? ` · ${r.files} file${r.files === 1 ? '' : 's'} changed` : ''}`;
    say(r, `🔁 Keep going ${r.status === 'done' ? 'finished' : 'stopped'}: ${why} (${sum}).`, { buttons: false });
    activity(r, `Keep going ${r.status === 'done' ? 'finished' : 'stopped'} in “${titleOf(r)}”: ${why} · ${sum}`, r.status === 'done' ? '✓' : '■');
    if (!/by you/i.test(why || '')) tell(r, r.status === 'done' ? 'done' : 'stop', { why, cost: sum });
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
    const key=chatId||Native.chatOf(agentId)?.id||agentId;
    if(starting.has(key))throw Error('This auto-improve run is already starting.');
    if(list.some(r=>r.chatId===key&&(r.inFlight||r.preparing)))throw Error('Let the current auto-improve reply finish before starting a new budget.');
    starting.add(key);
    try{return await startNow(agentId,spec,{chatId,first});}finally{starting.delete(key);}
  }
  async function startNow(agentId, spec, { chatId = null, first = null } = {}) {
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') throw new Error('Keep going works in a chat with Claude or Astra.');
    if(spec.feedback){const b=RoutineFeedback.binding(agentId,chatId);if(!b||b.projectId!==spec.feedback.projectId||b.sceneId!==spec.feedback.sceneId)throw Error('Visual Auto-improve needs this Astra project and its scene open.');}
    let quota=null;
    if(spec.remainingPercent!=null){
      const selected=chatId?await Native.load(chatId):Native.chatOf(agentId);
      const model=selected?.model||agent.model||'',engine=agent.engine;
      const snap=await readAllowance(agentId);
      if(!snap.fresh)throw Error('No fresh account usage reading. Refresh usage or send a normal reply first; this percentage run has not started.');
      if(snap.engine!==engine||H.agent(agentId)?.engine!==engine||(selected?.model||H.agent(agentId)?.model||'')!==model)throw Error('The assistant or model changed while reading usage. Open Auto-improve again.');
      quota=C.allowance(Number(spec.remainingPercent),engine,model,snap.windows);
    }
    // your message goes out as any message from the chat box would (its chat on screen; a new chat when there is none)
    if (first) await Native.send(agentId, first);
    const chat = first ? Native.chatOf(agentId) : chatId ? await Native.load(chatId).catch(() => null) : Native.ensureChat(agentId, spec.prompt);
    if (!chat) throw new Error('That chat is gone.');
    if (chat.agentId !== agentId) throw new Error('This chat belongs to another assistant. Reopen its project and try again.');
    if (forChat(chat.id)?.inFlight) throw new Error('Let the current auto-improve reply finish before starting a new budget.');
    for (const old of list.filter((x) => x.chatId === chat.id && C.live(x))) end(old, 'stopped', 'a new routine replaced it');
    const r = C.normalize({ ...spec, ...(quota?{allowance:quota,cap:0,waitReset:false}:{}), agentId, chatId: chat.id, title: chat.title, createdAt: Date.now(), status: 'running', kickoff: true, lastEnd: Date.now() - C.SETTLE });
    if (!r) throw new Error('Pick how long it keeps going.');
    list.push(r);
    rememberPrompt(chat.id, spec.prompt);
    stat({ n: 1 });
    store.set(LAST, { how: spec.how?.kind === 'until' ? { kind: 'until', time: spec.how.time } : spec.how, pause: r.pause, resumeAfter: r.resumeAfter, lighter: r.lighter, waitReset: r.waitReset, afterRestart: r.afterRestart, cap: spec.capPick, margin: r.margin, budgetMode:quota?'remaining':'tokens',remainingPercent:quota?.percent||20,visualFeedback:!!r.feedback,feedbackSeconds:r.feedback?.seconds||12 });
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
  function card(agentId, { chatId = null, first = null, feedback = null } = {}) {
    return new Promise((resolve) => {
      const last = store.get(LAST, null) || {};
      const ex = chatId ? forChat(chatId) : null;
      let spend = {};
      try { if (typeof Budget !== 'undefined') spend = Budget.state(agentId); } catch { /* not loaded */ }
      const dlg = el('dialog', { class: 'ui-modal rt-dlg', attrs: { 'aria-label': 'Keep going' } });
      const words = el('textarea', { class: 'rt-words', rows: 3, value: ex?.prompt || promptFor(chatId), attrs: { 'aria-label': 'What to ask each time' } });
      const focuses=[['Improve','↻',C.DEFAULT_PROMPT],['Polish','✦','Polish the work we are making in this project. Use the latest chat goals; choose one worthwhile improvement to the existing work, implement it, and check it. Keep its features and visual quality. End with "Changed: …" and what needs my review.'],['Fix bugs','⌁','Look for a concrete bug in the current project, using the latest chat and available tools. Reproduce it, fix it, and check the result. Preserve existing features. If you cannot verify a problem, say so instead of inventing a fix. End with "Changed: …" and what needs my review.'],['Finish','✓','Move the current project toward the finished result discussed in this chat. Complete one remaining piece and verify it. Keep the scope focused; do not add unrelated features. When the result needs my taste or approval, tell me exactly what to review. End with "Changed: …".']];
      const focusRow=el('div',{class:'rt-focuses',attrs:{'aria-label':'Improvement focus'}});
      const paintFocus=()=>{for(const b of focusRow.children)b.setAttribute('aria-pressed',String(words.value===focuses[Number(b.dataset.index)][2]));};
      focuses.forEach(([label,icon,prompt],i)=>focusRow.append(el('button',{type:'button',class:'rt-focus',dataset:{index:String(i)},text:icon+' '+label,title:prompt,on:{click:()=>{words.value=prompt;paintFocus();}}})));
      words.addEventListener('input',paintFocus);paintFocus();
      // how long: one row of choices; "Until…" and "Rounds" show their one field
      let how = last.how?.kind ? last.how : last.budgetMode==='tokens'?{kind:'rounds',rounds:5}:{kind:'forever'};
      let howId = how.kind === 'rounds' ? 'rounds' : how.kind === 'forever' ? 'forever' : how.kind === 'until' ? 'until' : (C.HOW.find((h) => h.ms === how.ms)?.id || '1h');
      const roundsIn = el('input', { type: 'number', min: 1, max: C.MAX_ROUNDS, value: String(how.rounds || 5), class: 'rt-num', attrs: { 'aria-label': 'Extra rounds' } });
      const untilIn = el('input', { type: 'time', value: how.time || '18:00', class: 'rt-time', attrs: { 'aria-label': 'Until this time' } });
      const howRow = el('div', { class: 'rt-how', role: 'radiogroup', attrs: { 'aria-label': 'How long' } });
      const capSel = el('select', { class: 'rt-cap', attrs: { 'aria-label': 'Spending cap' } });
      const customCap=el('input',{type:'number',min:1,max:1e9,step:1,class:'rt-custom-cap',hidden:true,attrs:{'aria-label':'Custom token budget'}});
      const capHint = el('span', { class: 'hint rt-cap-hint' });
      const budgetMode=el('select',{class:'rt-budget-mode',attrs:{'aria-label':'Budget type'}},el('option',{value:'remaining',text:'% of remaining usage'}),el('option',{value:'tokens',text:'Token budget (advanced)'}));
      budgetMode.value=last.budgetMode==='tokens'?'tokens':'remaining';
      const percent=el('input',{class:'rt-percent',type:'number',min:1,max:100,step:1,required:true,value:String(last.remainingPercent||20),attrs:{'aria-label':'Percentage of remaining usage'}});
      const percentRow=el('label',{class:'rt-share'},percent,el('span',{text:'% of what I have left'}));
      const shares=el('div',{class:'rt-shares',attrs:{'aria-label':'Budget shortcuts'}},...[10,20,40].map(n=>el('button',{type:'button',class:'rt-share-pick',text:n+'%',dataset:{percent:String(n)},on:{click:()=>{percent.value=String(n);updateBudget();}}})));
      const quotaPreview=el('div',{class:'rt-quota-preview hint',attrs:{role:'status'},text:'Reading your remaining usage…'});
      let snapshot=null,readingBudget=false;
      const howNow = () => {
        const h = C.HOW.find((x) => x.id === howId);
        if (h.kind === 'rounds') return { kind: 'rounds', rounds: Math.max(1, Math.min(C.MAX_ROUNDS, Math.round(Number(roundsIn.value) || 5))) };
        if (h.kind === 'until') return { kind: 'until', time: untilIn.value, at: C.untilAt(untilIn.value) };
        if (h.kind === 'time') return { kind: 'time', ms: h.ms };
        return { kind: 'forever' };
      };
      const paintHow = () => {
        howRow.replaceChildren(...C.HOW.map((h) => el('button', { type: 'button', class: `rt-opt${h.id === howId ? ' on' : ''}`, role: 'radio', attrs: { 'aria-checked': String(h.id === howId) }, text: h.id === 'rounds' ? 'Extra rounds' : h.id==='forever'&&budgetMode.value==='remaining'?'Until budget used':h.label, on: { click: () => { howId = h.id; paintHow(); paintCap(); } } })),
          howId === 'rounds' ? roundsIn : null, howId === 'until' ? untilIn : null);
        timingSummary.textContent='More controls · '+(howId==='forever'&&budgetMode.value==='remaining'?'until budget used':C.howText(howNow()));
      };
      const def = C.defaultCap(spend);
      let capPick = last.cap ?? 'default';
      const paintCap = () => {
        const need = C.needsCap(howNow());
        const opts = [['default', `${fmt(def)} tokens${spend.limit ? ' (from your weekly traffic limit)' : ''}`], ...C.CAPS.filter((c) => c !== def).map((c) => [String(c), `${fmt(c)} tokens`]),['custom','Custom…'], ...(need ? [] : [['0', 'No cap']])];
        if(Number(capPick)>0&&!opts.some(([v])=>v===String(capPick))) {customCap.value=String(capPick);capPick='custom';}
        if (!opts.some(([v]) => v === String(capPick))) capPick = 'default';
        capSel.replaceChildren(...opts.map(([v, t]) => el('option', { value: v, text: t, selected: v === String(capPick) })));
        customCap.hidden=capPick!=='custom';
        capHint.textContent = 'Checked between replies using reported input + output. The current reply can exceed this budget.';
      };
      capSel.addEventListener('change', () => { capPick = capSel.value;customCap.hidden=capPick!=='custom';if(!customCap.hidden&&!customCap.value)customCap.value=String(def); });
      untilIn.addEventListener('change',()=>{paintCap();paintHow();}); roundsIn.addEventListener('input',()=>{paintCap();timingSummary.textContent='More controls · '+C.howText(howNow());});
      const pauseSel = el('select', { attrs: { 'aria-label': 'Pause between rounds' } }, C.PAUSES.map((p) => el('option', { value: p.id, text: p.label, selected: p.id === (ex?.pause || last.pause || 'none') })));
      const writeSel = el('select', { attrs: { 'aria-label': 'When I write in this chat' } }, C.WHEN_I_WRITE.map((w) => el('option', { value: String(w.ms), text: w.label, selected: w.ms === (ex?.resumeAfter ?? last.resumeAfter ?? 0) })));
      const box = (label, on, title) => { const i = el('input', { type: 'checkbox', checked: on }); return [el('label', { class: 'rt-check', title }, i, label), i]; };
      const binding=RoutineFeedback.binding(agentId,chatId);
      const [feedbackLabel,feedbackInput]=box('✦ Review the scene before each improvement',!!binding&&!!(feedback||ex?.feedback||last.visualFeedback),'A fresh recording and Auto visual review guide one focused change per round.');
      feedbackInput.setAttribute('aria-label','Use visual feedback');feedbackInput.disabled=!binding;
      const feedbackSeconds=el('select',{attrs:{'aria-label':'Feedback recording length'}},...[6,12,20].map(n=>el('option',{value:String(n),text:n+' seconds',selected:n===(ex?.feedback?.seconds||last.feedbackSeconds||12)})));
      const feedbackFlow=el('div',{class:'rt-feedback-flow'},el('span',{text:'● Record → ✦ Review → ↻ Improve'}),feedbackSeconds);
      const feedbackNote=el('p',{class:'hint',text:binding?'Briefly shows the scene to record, then returns here. Up to two review replies per pass, within the same budget. Stops when no useful change is found.':'Available in an Astra project with a scene.'});
      const feedbackBox=el('section',{class:'rt-feedback'},feedbackLabel,feedbackFlow,feedbackNote);
      const paintFeedback=()=>{feedbackFlow.hidden=!feedbackInput.checked;feedbackSeconds.disabled=!feedbackInput.checked;feedbackBox.classList.toggle('on',feedbackInput.checked);};feedbackInput.onchange=paintFeedback;paintFeedback();
      const [lightL, lightI] = box('Continue lighter when the chat gets long', last.lighter !== false, 'Between rounds, a short summary replaces the long history for the AI when it clearly costs less (every message stays).');
      const [resetL, resetI] = box('Wait for a usage limit to reset, then go on', last.waitReset !== false, 'Near a limit it pauses until the reset, then goes on by itself. Otherwise it pauses until you press ▶.');
      // (round 51, routinelean) how close to a plan limit it may go (the session / weekly window, as the Usage window shows)
      const marginSel = el('select', { attrs: { 'aria-label': 'Stop before a usage limit at' } }, C.MARGINS.map((m) => el('option', { value: String(m), text: `${m}% of a limit`, selected: m === (ex?.margin || last.margin || C.MARGIN) })));
      const [restartL, restartI] = box('Keep going after Hearth restarts', last.afterRestart === true, 'Otherwise a restart pauses it and asks.');
      const row = (label, ...kids) => el('div', { class: 'rt-row' }, el('span', { class: 'rt-label', text: label }), ...kids);
      const finish = (v) => { dlg.close(); resolve(v); };
      const go = () => {
        const h = howNow();
        if (h.kind === 'until' && !h.at) { toast('Pick a time for “Until…”.', { timeout: 2500 }); return; }
        const share=budgetMode.value==='remaining';
        if(share&&(!percent.checkValidity()||!snapshot?.fresh)){percent.reportValidity();return;}
        const cap = capSel.value === 'custom' ? Number(customCap.value) : capSel.value === 'default' ? def : Number(capSel.value) || 0;
        if(!share&&(!Number.isFinite(cap)||cap<0||cap>1e9||!Number.isInteger(cap)||(capSel.value==='custom'&&cap<1))){customCap.reportValidity();toast('Enter a whole token budget from 1 to 1,000,000,000.');return;}
        finish({ prompt: words.value.trim() || C.DEFAULT_PROMPT, how: h, pause: pauseSel.value, resumeAfter: Number(writeSel.value) || 0, cap:share?0:cap, ...(share?{remainingPercent:Number(percent.value)}:{}),capPick: capSel.value === 'default' ? 'default' : cap, lighter: lightI.checked, waitReset: share?false:resetI.checked, afterRestart: restartI.checked, margin: Number(marginSel.value) || C.MARGIN,feedback:feedbackInput.checked?{...binding,seconds:Number(feedbackSeconds.value),direction:feedback?.direction||ex?.feedback?.direction||''}:null });
      };
      const tokenFields=el('div',{class:'rt-token-fields'},row('Token budget',capSel,customCap),capHint,row('Account usage ceiling',marginSel));
      const timingSummary=el('summary');
      const updateBudget=()=>{
        const share=budgetMode.value==='remaining';percentRow.hidden=!share;quotaPreview.hidden=!share;tokenFields.hidden=share;resetL.hidden=share;
        shares.hidden=!share;for(const b of shares.children)b.setAttribute('aria-pressed',String(Number(b.dataset.percent)===Number(percent.value)));
        percent.disabled=!share;customCap.disabled=share;
        const submit=dlg.querySelector('button[type=submit]');if(submit)submit.disabled=share&&(readingBudget||!snapshot?.fresh||!percent.checkValidity());
        if(share&&!readingBudget){quotaPreview.replaceChildren();
          if(snapshot?.fresh){
            for(const w of snapshot.windows)quotaPreview.append(el('div',{text:`${w.label||({five_hour:'Session',seven_day:'This week'}[w.key])||w.key}: ${C.pctText(100-w.used)}% left → allow ${C.pctText((100-w.used)*Number(percent.value||0)/100)} percentage points`,title:'The run stops when any of these starting allocations is used. Other account activity counts too.'}));
          }else quotaPreview.append(el('span',{text:'Fresh usage unavailable. Refresh, or send a normal reply first. No percentage run will start without a reading.'}));
        }
      };
      const refreshBudget=async()=>{readingBudget=true;quotaPreview.textContent='Reading your remaining usage…';updateBudget();try{snapshot=await readAllowance(agentId);}catch{snapshot=null;}finally{readingBudget=false;if(dlg.isConnected)updateBudget();}};
      budgetMode.onchange=()=>{updateBudget();paintHow();};percent.oninput=updateBudget;
      const form = el('form', { method: 'dialog', on: { submit: (e) => { e.preventDefault(); go(); } } },
        el('h2', { text: '↻ Auto-improve' }),
        el('p', { class: 'rt-intro hint', text: first ? 'Your message goes first, then Hearth repeats the prompt below.' : `Keep working in “${H.chats.find(c=>c.id===chatId)?.title || 'this chat'}”. Writing here pauses the loop.` }),
        focusRow,el('label', { class: 'rt-field' }, el('span', { class: 'rt-label', text: 'What to ask each time' }), words),
        feedbackBox,percentRow,shares,quotaPreview,
        el('button',{type:'button',class:'ghost small rt-refresh-usage',text:'↻ Refresh usage',on:{click:refreshBudget}}),
        el('p',{class:'hint rt-account-note',text:'Fixed when you start; it never refills automatically. Checked between replies, so a reply can overshoot. Other chats and devices count toward the same allowance.'}),
        el('details', { class: 'rt-more rt-options' },timingSummary,row('Budget type',budgetMode),tokenFields,el('div',{class:'rt-field'},el('span',{class:'rt-label',text:'Stop earlier or set a duration'}),howRow),row('Pause between rounds', pauseSel), row('When I write here', writeSel), lightL, resetL, restartL),
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Cancel', on: { click: () => finish(null) } }),
          el('button', { type: 'submit', class: 'primary', text: first ? 'Send and keep going' : ex ? 'Start a new run & budget' : 'Start auto-improving' })));
      paintHow(); paintCap();
      dlg.append(form);
      dlg.addEventListener('close', () => { setTimeout(() => dlg.remove(), 0); resolve(null); });
      document.body.append(dlg);
      dlg.showModal();
      updateBudget();refreshBudget();
      if(chatId)Native.load(chatId).then(chat=>{const u=C.usageOf([...chat.messages].reverse().find(m=>m.role==='assistant'&&C.usageOf(m.usage))?.usage);if(u&&dlg.isConnected)capHint.append(el('span',{class:'rt-last-usage',text:`Last reply: ${u.tokens.toLocaleString()} tokens. Next-round usage can vary.`}));}).catch(()=>{});
      words.focus(); words.setSelectionRange(words.value.length, words.value.length);
    });
  }
  // the card, then the routine (from a reply's ⋯, Find anything, /keepgoing)
  async function open(agentId, { chatId = null, first = null, feedback = null } = {}) {
    const id = agentId || agentNow()?.id;
    if (!id) { toast('Open a chat with Claude or Astra first.', { timeout: 2500 }); return null; }
    const cid = chatId || (first ? null : Native.chatOf(id)?.id) || null;
    if (!cid && !first) { toast('Write your first message, then pick ◎ › 🔁 Keep going… (or start it from a reply\'s ⋯).', { timeout: 4000 }); return null; }
    const spec = await card(id, { chatId: cid, first, feedback });
    if (!spec) { if (first) Native.setDraft(id, first); return null; }
    try { return await start(id, spec, { chatId: cid, first }); } catch (err) { toast(err.message, { type: 'error' }); if (first) Native.setDraft(id, first); return null; }
  }
  function accountWords(agentId) {
    const engine=H.agent(agentId)?.engine,st=window.UsageLimits?.state;
    const vs=st && typeof UsageLimitsCore!=='undefined' ? UsageLimitsCore.views(st,engine).filter(v=>!v.reset&&v.used!=null) : [];
    return vs.length ? vs.map(v=>`${v.label}: ${v.used}% used · updated ${v.ago}`).join(' / ') : 'Account usage unavailable.';
  }
  async function openProject() {
    const chat=window.ProjectWorkspace?.currentChat?.();
    if(!chat)throw Error('Open a project with an available chat first.');
    const r=recentFor(chat.id);
    if(r)return manage(r);
    return open(chat.agentId,{chatId:chat.id});
  }
  function projectControls(button,chat) {
    const r=chat&&recentFor(chat.id),live=C.live(r),group=button.parentElement;
    const value=r?.allowance?Math.round(C.allowanceProgress(r.allowance)):null;
    const label=!r?'↻ Auto-improve':live?`↻ ${r.status==='paused'?'Paused':r.inFlight?'Working':'Auto-improve'}${value!=null?' · '+value+'%':r.done?' · '+r.done+' passes':''}`:`${r.status==='done'?'✓':'■'} Review · ${r.done} ${r.done===1?'pass':'passes'}`;
    if(button.firstChild.textContent!==label)button.firstChild.textContent=label;
    button.classList.toggle('running',r?.status==='running');button.classList.toggle('paused',r?.status==='paused');
    button.style.setProperty('--run-progress',Math.min(100,value||0)+'%');
    button.title=r?`${C.chipText(r)}${r.why?' · '+r.why:''}. Open the run summary.`:'Repeat a prompt in this project with a usage budget';
    if(!group.classList.contains('workspace-auto-group'))return;
    for(const [action,glyph,title] of [['toggle',r?.status==='running'?'Ⅱ':'▶',r?.status==='running'?(r.feedbackActive?'Pause visual feedback':'Pause auto-improve after this reply'):'Resume auto-improve'],['stop','■',r?.feedbackActive?'Stop visual Auto-improve':'Stop auto-improve after this reply']]){
      let b=group.querySelector('[data-run-action="'+action+'"]');
      if(!live){b?.remove();continue;}
      if(!b){b=el('button',{type:'button',class:'workspace-auto-control',dataset:{runAction:action},on:{click:()=>{const run=byId(b.dataset.runId);if(!C.live(run))return;action==='stop'?stop(run.id):run.status==='running'?pause(run.id):resume(run.id);}}});group.append(b);}
      b.dataset.runId=r.id;b.textContent=glyph;b.title=title;b.setAttribute('aria-label',title);b.disabled=action==='toggle'&&r.status==='paused'&&r.usageUnknown&&!r.allowance;
    }
  }
  async function reviewReply(r) {
    const p=(r.feedback?.projectId&&window.Projects?.get(r.feedback.projectId))||window.ProjectWorkspace?.current?.();
    if(p&&(p.items||[]).some(i=>i.type==='chat'&&i.ref===r.chatId))await ProjectWorkspace.conversation(p,r.chatId);
    else {activate(H.surfaceIdFor?H.surfaceIdFor(r.agentId):r.agentId);await Native.open(r.agentId,r.chatId);}
    Native.view(r.agentId)?.list?.lastElementChild?.scrollIntoView({block:'end'});
  }
  // The same run survives tab changes; viewing or cancelling this panel never starts work.
  function manage(r) {
    document.querySelector('.rt-run')?.close();
    const dlg=el('dialog',{class:'ui-modal rt-dlg rt-run',attrs:{'aria-label':'Auto-improve run'}}),content=el('div',{class:'rt-run-content'});
    const close=el('button',{type:'button',text:'Close',on:{click:()=>dlg.close()}});
    const paint=()=>{
      const expanded=new Set([...content.querySelectorAll('details[open]')].map(e=>e.className));
      const t=r.usageTotals,u=r.usageUnknown?'At least ':'',busy=Native.isBusy(r.chatId)||r.feedbackActive||r.preparing,live=C.live(r);
      const controls=el('div',{class:'dialog-actions'});
      if(live)controls.append(el('button',{type:'button',text:r.status==='running'?(r.feedbackActive?'Pause feedback':'Pause after reply'):'Resume',disabled:r.usageUnknown&&!r.allowance,on:{click:()=>{r.status==='running'?pause(r.id):resume(r.id);}}}),el('button',{type:'button',text:r.feedbackActive?'Stop run':busy?'Stop after reply':'Stop run',on:{click:()=>stop(r.id)}}));
      controls.append(el('button',{type:'button',class:'primary',text:'New run & budget',disabled:busy,on:{click:()=>{dlg.close();open(r.agentId,{chatId:r.chatId});}}}));
      if(r.rounds.length)controls.prepend(el('button',{type:'button',text:'↗ Review latest reply',on:{click:()=>{dlg.close();reviewReply(r).catch(e=>toast(e.message,{type:'error'}));}}}));
      const history=el('details',{class:'rt-more'},el('summary',{text:'Round history & exact counts'}));
      history.append(el('p',{class:'hint',text:'Input includes cache reads/writes. Output includes reasoning. Counts below are reported traffic, not a bill. Large totals include rereading history at each model call.'}));
      if(r.feedbackCalls)history.append(el('p',{class:'hint',text:`${r.feedbackCalls} visual review replies are included in these totals.`}));
      history.append(el('p',{text:`${u}${r.tokens.toLocaleString()} reported tokens`}),t?el('div',{class:'rt-breakdown'},...['fresh','cacheWrite','cached','output'].map(k=>el('span',{text:`${{fresh:'Fresh',cacheWrite:'Cache write',cached:'Cached',output:'Output'}[k]} ${t[k].toLocaleString()}`}))):null,
        t?.costReports?el('p',{class:'hint',text:`$${t.cost.toFixed(4)} reported API-price estimate, not a subscription charge.`}):null);
      for(const x of r.rounds.slice(-12))history.append(el('div',{class:'rt-history-row',text:`${x.n} · ${x.ok?'Completed':x.stopped?'Stopped':'Failed'} · ${x.tokens.toLocaleString()}${x.usage===null||x.usage?.partial?'+ (incomplete)':''} tokens`,title:x.sum||x.error||''}));
      const used=r.allowance?C.allowanceProgress(r.allowance):0;
      const recent=el('section',{class:'rt-results',attrs:{'aria-label':'Recent results'}},el('h3',{text:'Recent passes'}),...r.rounds.slice(-3).reverse().map(x=>el('div',{class:'rt-result'},el('span',{class:'rt-pass',text:String(x.n),title:'Pass '+x.n}),el('div',{},el('p',{text:x.sum||x.error||(x.ok?'Reply completed. Open the chat to review.':x.stopped?'Reply stopped.':'Reply failed.')}),el('small',{text:(x.ok?'Completed':x.stopped?'Stopped':'Failed')+(x.files?' · '+x.files+' '+(x.files===1?'file':'files')+' touched':'')})))));
      const allocation=r.allowance?el('div',{class:'rt-allocation'},el('progress',{max:100,value:Math.min(100,used),attrs:{'aria-label':'Remaining-usage budget consumed'}}),el('p',{class:'hint',text:`Budget: ${C.pctText(r.allowance.percent)}% of what was left when you started.`}),el('details',{class:'rt-more rt-budget-details'},el('summary',{text:'How the budget is measured'}),...r.allowance.windows.map(w=>el('div',{class:'rt-history-row',text:`${w.label} · ${C.pctText(Math.max(0,w.peak-w.start))} / ${C.pctText(w.amount)} percentage points`,title:`Started at ${C.pctText(w.start)}% account usage. Last measured ${new Date(w.at).toLocaleTimeString()}.`})),el('p',{class:'hint',text:'Stops at the first allowance to reach its allocation. Other account activity is included. Readings may lag; the current reply can overshoot.'}))):null;
      content.replaceChildren(el('h2',{text:'↻ Auto-improve'}),el('p',{class:'hint',text:`${titleOf(r)} · ${r.done} completed · ${r.status}`}),el('div',{class:'rt-spent',text:r.allowance?`${Math.round(used)}% of budget used`:`${u}${r.tokens.toLocaleString()} tokens`}),allocation,
        !r.allowance?el('p',{class:'hint',text:r.cap?`Budget ${r.cap.toLocaleString()} · ${Math.max(0,r.cap-r.tokens).toLocaleString()} left${busy?' · current reply not yet counted':''}`:'No token cap'}):null,
        el('p',{class:'rt-run-status',text:r.why || (busy?'Working on this reply. Pause and stop take effect before the next one.':'Waiting for the next round.')}),controls,
        r.feedbackLast?el('section',{class:'rt-feedback-result'},el('h3',{text:r.feedbackLast.complete?'✦ Latest visual feedback':'✦ Partial visual feedback'}),el('p',{text:r.feedbackLast.summary}),el('button',{type:'button',text:'View feedback & frames',on:{click:async()=>{dlg.close();await reviewReply(r);await Lazy.load('visualfeedback');await VisualFeedback.open(r.feedbackLast.file,{reviewId:r.feedbackLast.id});}}})):null,
        r.rounds.length?recent:null,!r.allowance?el('p',{class:'hint',text:accountWords(r.agentId)}):null,history);
      for(const d of content.querySelectorAll('details'))d.open=expanded.has(d.className);
    };
    dlg.append(content,el('div',{class:'dialog-actions'},close));
    document.addEventListener('hearth:routines',paint);
    dlg.onclose=()=>{document.removeEventListener('hearth:routines',paint);dlg.remove();};
    document.body.append(dlg);paint();dlg.showModal();(r.allowance?refreshFinishedAllowance(r):refreshLimits(r.agentId)).then(()=>{if(dlg.isConnected)paint();});
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
    // An explicit retry of the same user turn is another charged attempt, not duplicate delivery.
    if(m?.routine){const r=byId(m.routine.id);if(r){m.routine.accounted=false;r.inFlight=true;r.sentAt=Date.now();Native.save(chat);}return;}
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
    cancelFeedback(r);
    awake(r, false); save(); paintAll();
    if (r.status === 'paused' && was === 'running') { say(r, `🔁 Keep going is paused: you wrote in this chat. ▶ Resume when you want it to go on.`); activity(r, `Keep going paused in “${titleOf(r)}”: you wrote`, '❚❚'); }
  }
  Native.hooks.finish.push((event, chat, extras) => {
    if (!chat) return;
    const asked = [...chat.messages].reverse().find((m) => m.role === 'user');
    // A stopped loop can still have its last reply finishing. Keep that usage too.
    const r = (asked?.routine?.id && byId(asked.routine.id)) || forChat(chat.id);
    if (!r) return;
    if (asked?.routine?.id !== r.id) { if (r.status === 'running') checkSoon(r); return; } // your message (or a hook's) was answered
    awake(r, false);
    // (round 51) read once every finish hook has run and the reply is in the chat: its tools, what aiundo recorded
    queueMicrotask(() => roundOver(r, event, chat, asked, extras || {}));
  });
  // (round 51, routinelean) what a round changed: files / the scene, from its tools and aiundo's record of that reply
  function changeOf(event, chat, extras) {
    if (event.type !== 'done') return null;
    const m = chat.messages.at(-1);
    const tools = m?.role === 'assistant' && Array.isArray(m.tools) ? m.tools : [];
    const turn = extras.aiChanges?.turn || m?.aiChanges?.turn;
    let ai = [];
    try { if (turn && window.AiUndo?.list) ai = AiUndo.list().filter((e) => e.turn === turn); } catch { /* none */ }
    return C.changeOf(tools, ai);
  }
  function roundOver(r, event, chat, asked, extras) {
    if(asked.routine.accounted)return;
    asked.routine.accounted=true;
    const usage=C.usageOf(event.usage),tokens=usage?.tokens || 0;
    const change = changeOf(event, chat, extras);
    const text = event.type === 'error' ? event.message : (event.text || chat.messages.at(-1)?.text || '');
    const summary = event.type === 'done' ? C.summaryOf(text) : '';
    let kind = null; let resetAt = 0;
    if (event.type === 'error') {
      try { const c = typeof OfflineCore !== 'undefined' ? OfflineCore.classify(event.message || '') : null; kind = c?.kind || null; resetAt = c?.resetAt || 0; } catch { /* unknown */ }
      if (!kind && event.needsLogin) kind = 'signedout';
    }
    const before = r.status;
    const out = C.roundEnded(r, { type: event.type, text, tokens, usage, ms: Date.now() - (r.sentAt || Date.now()), kind, resetAt, asked: r.asked, change, summary }, Date.now());
    r.asked = false;
    stat({ t: tokens, r: 1, f: change?.files || 0, c: change?.changed ? 1 : 0 });
    // the round's message says what it cost
    asked.routine.tokens=(asked.routine.tokens||0)+tokens;asked.routine.usageUnknown=asked.routine.usageUnknown || !usage || usage.partial;
    Native.save(chat);paintMsgChip(chat.id,asked);saveNow();paintAll();
    if(r.allowance&&r.status!=='running')void refreshFinishedAllowance(r);
    if (out.act === 'continue' || out.act === 'wait') {
      const of = r.how.kind === 'rounds' ? ` of ${r.how.rounds}` : '';
      const cost=r.allowance?'checking your remaining-usage budget':`≈ ${fmt(tokens)} tokens (≈ ${fmt(r.tokens)} so far)`;
      if (event.type === 'done') activity(r, `Keep going: round ${r.round}${of} done in “${titleOf(r)}” · ${cost}`);
      if (event.type === 'done') tell(r, 'round', { n: r.round, of: r.how.kind === 'rounds' ? r.how.rounds : 0, cost, summary }); // (round 51) its one-line summary, never the whole answer
      save(); paintAll();
      if (out.act === 'continue') checkSoon(r);
      return;
    }
    if (out.act === 'pause' && before === 'running') { r.status = 'running'; pauseFor(r, out.why); return; }
    if (out.act === 'stop') { const why = r.why; const st = r.status; r.status = before; end(r, st, why); }
  }
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
  const msgChipText = (t) => `🔁 round ${t.n}${t.of ? ` of ${t.of}` : ''}${byId(t.id)?.allowance?'':t.usageUnknown ? ` · ${t.tokens ? fmt(t.tokens)+'+ tokens · ' : ''}usage incomplete` : t.tokens ? ` · ≈ ${fmt(t.tokens)} tokens` : ''}`;
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
    const t = C.chipText(r, Date.now(), when);
    if (label.textContent !== t) label.textContent = t;
    const tip = `${C.describe(r)}\nEach round sends: “${C.clip(r.prompt, 160)}”${r.why ? `\nNow: ${r.why}` : r.inFlight ? '\nNow: a round is running' : ''}\nClick: each round's cost, change it, stop`;
    if (label.title !== tip) label.title = tip;
    const paused = r.status === 'paused';
    chip.classList.toggle('paused', paused);
    const tt = paused ? '▶' : '❚❚';
    if (toggle.textContent !== tt) { toggle.textContent = tt; toggle.title = paused ? 'Resume the routine' : 'Pause the routine'; toggle.setAttribute('aria-label', toggle.title); }
  }
  function paintAll() { for (const a of H.agents()) if (a.mode === 'native') { const v = Native.view(a.id); if (v) paintChip(a.id, v); } window.WorkspaceNav?.sync();document.dispatchEvent(new Event('hearth:routines')); }
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

  // ---------- (round 51, routinelean) what Keep going spent and achieved: the Usage window ----------
  const STATS = 'routines.stats'; // this computer, per day (15 days)
  function stat(d) { try { store.set(STATS, C.statAdd(store.get(STATS, null), d)); } catch { /* fine */ } }
  function usageBox() {
    const x = C.statSum(store.get(STATS, null));
    if (!x.week.r && !list.some((r) => C.live(r))) return null; // never used: nothing on screen
    const live = list.filter((r) => C.live(r));
    return el('section', { class: 'rt-usage', attrs: { 'aria-label': 'Keep going: what it spent and did' } },
      el('h4', { text: '🔁 Keep going' }),
      el('p', { text: `Today: ${C.statWords(x.today)}` }),
      el('p', { text: `7 days: ${C.statWords(x.week)}`, title: 'Counted on this computer: the rounds Keep going sent by itself, their tokens, and the files or scene changes they made' }),
      live.length ? el('p', { class: 'hint', text: live.map((r) => `“${titleOf(r)}”: ${C.chipText(r, Date.now(), when)}${r.why ? ` · ${r.why}` : ''}`).join('\n') }) : null);
  }

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
    else { clearInterval(tickT); tickT = need ? setInterval(tick, 30000) : 0; }
  }
  let tickT = 0;

  // ---------- after a restart: a resume prompt (or on by itself, when chosen) ----------
  function afterStart() {
    const back = [];
    for (const r of list) {
      if (!C.live(r)) {C.restarted(r);continue;}
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
        const x = await start(agent.id, { prompt: promptFor(chat.id), how, pause: last.pause || 'none', resumeAfter: last.resumeAfter || 0, cap, ...(last.budgetMode==='tokens'?{}:{remainingPercent:last.remainingPercent||20}),capPick: last.cap ?? 'default', lighter: last.lighter !== false, waitReset: last.waitReset !== false, afterRestart: last.afterRestart === true, margin: last.margin }, { chatId: chat.id });
        return `${C.describe(x)}.`;
      },
    });
  }

  return {
    open, openProject, projectControls, start, card, stop, pause, resume, section, summary, forChat, usageBox, stats: () => C.statSum(store.get(STATS, null)), list: () => list.map((r) => ({ ...r })), get: byId,
    _test: { scale: (x) => { scale = x; }, check, idle: (ms) => { lastInput = Date.now() - ms; }, quiet: (ms) => { lastWrote = Date.now() - ms; }, afterStart, reload: () => { list = (store.get(KEY, []) || []).map((r) => C.normalize(r)).filter(Boolean); }, timers },
  };
})();
window.Routines = Routines;
