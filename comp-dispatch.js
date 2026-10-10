// Comp dispatch (round 10): from one director chat (the "main" chat), split a video into parts and hand each part to
// its own director chat (new or existing; Claude or Astra each), all working at the same time. Each part's chat builds
// its own scene (backstage while you look at the main one, chat-scenes.js / tools/three-backstage.js); the main scene
// shows every part as a precomp layer (tools/three-comp.js) that updates live as each agent works: one after the
// other on the main scene's timeline (default), side by side, or stacked.
// One card in the main chat (a chat message { role: 'comp' }, drawn by cardEl through one line in native.js) shows
// each part: its chat (mark, color, a still of its scene), its agent, its status (working / waiting / done / stuck) and
// what it last said; ↗ jumps into it, ⟳ dispatches it again, ⇄ swaps Claude ⇄ Astra (the task state goes along,
// director-task.js). The main chat's agent reads the parts and gives feedback through three_do comp (parts, feedback).
// Frugal (product rule #1): each part's agent gets only its brief (≈ 70 tokens of frame + the part's own words), never
// the main chat; a part's chat is an ordinary director chat afterwards (you can talk to it like any other).
// Per-chat engine: a part on Astra while the director runs on Claude (or the reverse) is `chat.engine` (astra.js
// beforeSend → engines.js options.engine), so both run at once without switching the director.
const CompDispatch = (() => {
  const STUCK_MS = 4 * 60000; // working with no tool call or reply for this long: stuck
  const MAX_PARTS = 6;
  const X = 0.3; // s of cross-fade between two parts one after the other
  const NAME = { claude: 'Claude', codex: 'Astra' };
  const STATES = { working: 'working…', waiting: 'waiting for you', done: 'done', stuck: 'stuck', sent: 'starting…' };
  const LAYOUT_LABEL = { time: 'one after the other', split: 'side by side', stack: 'stacked' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const clean = (t) => String(t || '').replace(/<(remember|suggest)>[\s\S]*?<\/\1>/gi, '').replace(/\n+MCP calls:[\s\S]*$/, '').trim();
  const r30 = (t) => Math.round(Math.max(0, t) * 30) / 30;
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const director = () => H.agents().find((a) => a.mode === 'native' && a.dock === 'three') || null;
  const engineOf = (e) => (/astra|codex|gpt/i.test(String(e || '')) ? 'codex' : 'claude');
  const cards = new Map(); // card id → { m, hostChatId }
  const lastAct = new Map(); // chat id → last time its run did something (a tool call)
  const byChat = new Map(); // part chat id → { m, p, hostChatId }
  if (typeof HubBridge !== 'undefined') HubBridge.onCall((e) => { if (e?.chatId) lastAct.set(e.chatId, Date.now()); });

  // ---------- the main chat and its scene ----------
  async function ensureDirector() {
    let a = director();
    if (a) return a;
    await Commands.exec?.('/director-setup', H.claudeAgent?.()?.id);
    for (let i = 0; i < 30 && !(a = director()); i += 1) await sleep(100);
    if (!a) throw new Error('Dispatching needs the Three Director: /director-setup makes it.');
    return a;
  }
  async function labUp() {
    await ThreeLab.cmd({ show: false });
    for (let i = 0; i < 80 && !(S() && ThreeLab.director); i += 1) await sleep(100);
    if (!S()) throw new Error('The Three.js Lab did not load.');
  }
  async function hostOf(agent, hostChatId) {
    let chat = hostChatId ? await Native.load(hostChatId) : null;
    if (!chat || chat.agentId !== agent.id) chat = Native.current(agent.id) || Native.ensureChat(agent.id, 'Comp');
    if (!chat.messages.length && !(H.chats || []).some((c) => c.id === chat.id)) Native.save(chat);
    const route = ChatScenes.routeThree('three_comp', chat.id);
    return { chat, sketchId: route?.sketchId || ChatScenes.linkOf(chat.id) || S().currentId() };
  }
  function hostLen(sketchId) {
    const P = ThreeLab.director?.media;
    if (S().songOf?.(sketchId) && S().currentId() === sketchId && P?.loaded && !P.isClock) return Math.min(120, P.duration || 10);
    return S().timelineOf?.(sketchId)?.len || 10;
  }
  const tallFrame = (sketchId) => /^(9:16|4:5)$/.test(S().frameOf?.(sketchId) || '');
  // "astra: blue rings" / { brief, engine, name, chat } → a part
  function partOf(x, i) {
    const o = typeof x === 'string' ? { brief: x } : { ...(x || {}) };
    let brief = String(o.brief || o.text || '').trim();
    const pre = /^(astra|claude|codex)\s*:\s*/i.exec(brief);
    if (pre) { brief = brief.slice(pre[0].length); o.engine ||= pre[1]; }
    if (!brief) throw new Error(`Part ${i + 1} needs a brief.`);
    const name = cap(o.name || brief.replace(/^(make|build|a|an|the)\s+/i, '').split(/[.,;:\n]/)[0], 28);
    return { n: i + 1, name, brief: cap(brief, 1200), engine: o.engine ? engineOf(o.engine) : null, chatRef: o.chat || null };
  }
  function existingChat(ref, agent) {
    if (!ref) return null;
    const l = String(ref).toLowerCase();
    const list = (H.chats || []).filter((c) => c.agentId === agent.id);
    return list.find((c) => c.id === ref) || list.find((c) => c.title.toLowerCase() === l) || list.find((c) => c.title.toLowerCase().includes(l)) || null;
  }
  // where part i of n sits in the main scene
  function placement(layout, i, n, seg, tall) {
    if (layout === 'split') return { set: { ...ThreeComp.splitOf(i, n, tall) }, loop: true };
    if (layout === 'stack') return { set: i ? { blend: 'screen' } : {}, loop: true };
    const a = r30(i * seg - (i ? X : 0));
    return { set: { in: a, out: r30((i + 1) * seg), fadeIn: i ? X : 0, start: a, loop: false }, loop: false };
  }
  const briefText = (p, n, hostTitle, len, frame) => `Comp part ${p.n}/${n} · for "${cap(hostTitle, 40)}"
${p.brief}
Your scene is one part of a bigger video, made at the same time as the other parts in other chats; it shows live as a layer of the main scene. Make it with your Lab tools: ${len} s on your scene's own timeline (30 fps${frame ? `, frame ${frame}` : ''}), from 0. It starts as the default orb: replace or keep it. End with one line saying what you made.`;

  // ---------- dispatching ----------
  async function dispatch({ parts = [], layout = 'time', hostChatId = null, len = null } = {}) {
    if (!Array.isArray(parts) || !parts.length) throw new Error('Which parts? e.g. /dispatch red pulse | astra: blue rings');
    if (parts.length > MAX_PARTS) throw new Error(`${MAX_PARTS} parts at most.`);
    layout = LAYOUT_LABEL[layout] ? layout : 'time';
    const list = parts.map(partOf);
    await labUp();
    const agent = await ensureDirector();
    const host = await hostOf(agent, hostChatId);
    const total = Number(len) > 0 ? Number(len) : hostLen(host.sketchId);
    const n = list.length;
    const seg = r30(total / (layout === 'time' ? n : 1));
    const frame = S().frameOf?.(host.sketchId) || null;
    const tall = tallFrame(host.sketchId);
    const at = Date.now();
    const m = { role: 'comp', id: `c${at.toString(36)}`, at, layout, len: total, host: { chatId: host.chat.id, sketchId: host.sketchId }, parts: [], text: '' };
    for (const [i, p] of list.entries()) {
      const engine = p.engine || agent.engine;
      let chat = existingChat(p.chatRef, agent);
      let sk = null;
      if (chat) {
        chat = await Native.load(chat.id);
        if (engine !== agent.engine || chat.engine) chat.engine = engine;
        sk = S().get(ChatScenes.linkOf(chat.id)) || ChatScenes.fresh(chat.id);
      } else {
        const id = `${agent.id}-${(at + i).toString(36)}p${i + 1}`;
        chat = { id, agentId: agent.id, title: `◫ ${i + 1}/${n} · ${p.name}`, createdAt: at, updatedAt: at, session: {}, messages: [], ...(engine !== agent.engine ? { engine } : {}) };
        Native.adopt(chat, { openIt: false });
        sk = ChatScenes.fresh(chat.id);
      }
      chat.compOf = { chatId: host.chat.id, card: m.id, n: p.n };
      Native.save(chat);
      if (frame) S().setFrame?.(sk.id, frame);
      S().setTimeline?.(sk.id, { len: layout === 'time' ? seg : total, fps: 30 });
      const place = placement(layout, i, n, seg, tall);
      const L = ThreeComp.add(host.sketchId, { chat: chat.id }, { name: p.name, set: { ...place.set, loop: place.loop } });
      m.parts.push({ n: p.n, name: p.name, brief: p.brief, engine, chatId: chat.id, layerId: L.id, state: 'sent', sentAt: at, text: briefText(p, n, host.chat.title, layout === 'time' ? seg : total, frame) });
    }
    m.text = textOf(m);
    host.chat.messages.push(m);
    Native.save(host.chat);
    track(m, host.chat.id);
    Native.refresh?.(agent.id);
    // all at once: each part's chat gets its brief and nothing else
    await Promise.all(m.parts.map((p) => sendPart(p, p.text)));
    paint(m);
    return m;
  }
  async function sendPart(p, text) {
    const a = director();
    try { await Native.send(a.id, text, { chatId: p.chatId }); p.state = 'working'; p.sentAt = Date.now(); } catch (err) { p.state = 'stuck'; p.last = err.message; }
  }
  function track(m, hostChatId) {
    cards.set(m.id, { m, hostChatId });
    for (const p of m.parts) byChat.set(p.chatId, { m, p, hostChatId });
    watch();
  }
  const textOf = (m) => `◫ Comp: ${m.parts.length} parts dispatched (${LAYOUT_LABEL[m.layout] || m.layout}) to their own chats: ${m.parts.map((p) => `${p.n}. ${p.name} (${NAME[p.engine] || p.engine}, ${STATES[p.state] || p.state})`).join('; ')}.`;
  const saveSoon = debounce(async (m) => { const e = cards.get(m.id); if (!e) return; m.text = textOf(m); const chat = await Native.load(e.hostChatId); if (chat) Native.save(chat); }, 600);

  // ---------- status ----------
  function lastLine(text) { return cap(clean(text).split('\n').map((l) => l.trim()).filter(Boolean).at(-1) || '', 160); }
  // a part's chat finished a reply / failed / was stopped; or you (or the main chat) sent it something
  Native.hooks.event.push((ev, chat) => {
    const e = chat && byChat.get(chat.id);
    if (!e || !ev || ev.type === 'delta') return;
    const { m, p } = e;
    const last = chat.messages.at(-1);
    if (ev.type === 'done') { const t = clean(last?.text || ''); p.last = lastLine(t); p.state = /\?\s*$/.test(t) || last?.qa?.length ? 'waiting' : 'done'; p.doneAt = Date.now(); }
    else if (ev.type === 'error') { p.state = 'stuck'; p.last = cap(ev.message || last?.text || 'failed', 160); }
    else if (ev.type === 'stopped') { p.state = 'waiting'; }
    // feedback that waited for the reply goes now
    if (p.queue?.length && ev.type === 'done') { const q = p.queue.splice(0); setTimeout(() => sendPart(p, feedbackText(q.join('\n'))).then(() => paint(m)), 200); }
    paint(m); saveSoon(m);
    if (m.parts.every((x) => x.state === 'done')) toast(`◫ All ${m.parts.length} parts are done`, { timeout: 4000, action: { label: 'Show the comp', fn: () => reveal(m.host.sketchId) } });
  });
  Native.hooks.send.push((agentId, chat) => { const e = chat && byChat.get(chat.id); if (e && e.p.state !== 'working') { e.p.state = 'working'; e.p.sentAt = Date.now(); paint(e.m); } });
  let watchT = 0;
  function watch() {
    if (watchT) return;
    watchT = setInterval(() => {
      const now = Date.now(); let any = false;
      for (const { m, p } of byChat.values()) {
        if (p.state !== 'working' && p.state !== 'sent') continue;
        any = true;
        const busy = Native.isBusy(p.chatId);
        const quiet = now - Math.max(p.sentAt || 0, lastAct.get(p.chatId) || 0);
        if (busy && quiet > (window.COMP_STUCK_MS || STUCK_MS)) { p.state = 'stuck'; p.last = `no tool call or reply for ${Math.round(quiet / 60000)} min`; paint(m); saveSoon(m); }
        else if (!busy && p.state === 'sent' && now - (p.sentAt || 0) > 15000) { p.state = 'waiting'; paint(m); }
        else paintSoft(m);
      }
      if (!any) { clearInterval(watchT); watchT = 0; }
    }, 3000);
  }
  // cards from before a reload: tracked again when they're drawn
  function adopt(m, hostChatId) {
    if (cards.has(m.id)) return;
    for (const p of m.parts) if (p.state === 'working' || p.state === 'sent') p.state = Native.isBusy(p.chatId) ? 'working' : 'waiting';
    track(m, hostChatId);
  }

  // ---------- acting on a part ----------
  function cardFor(ctx = {}) {
    const all = [...cards.values()].filter((e) => !ctx.chatId || e.hostChatId === ctx.chatId || e.m.parts.some((p) => p.chatId === ctx.chatId));
    return (all.length ? all : [...cards.values()]).sort((a, b) => b.m.at - a.m.at)[0] || null;
  }
  function partFor(ref, ctx) {
    const e = cardFor(ctx);
    if (!e) throw new Error('No parts dispatched yet (/dispatch).');
    const r = String(ref ?? '').toLowerCase();
    const p = e.m.parts.find((x) => String(x.n) === r) || e.m.parts.find((x) => x.chatId === ref) || e.m.parts.find((x) => x.name.toLowerCase().includes(r));
    if (!p) throw new Error(`No part "${ref}" (parts: ${e.m.parts.map((x) => `${x.n}. ${x.name}`).join(', ')}).`);
    return { ...e, p };
  }
  const feedbackText = (t) => `Comp feedback · from the main chat\n${t}`;
  async function feedback(ref, text, ctx) {
    const { m, p } = partFor(ref, ctx);
    if (!String(text || '').trim()) throw new Error('What feedback?');
    if (Native.isBusy(p.chatId)) { (p.queue ||= []).push(cap(text, 800)); paint(m); return `Part ${p.n} is working: your feedback goes when it's done.`; }
    await sendPart(p, feedbackText(cap(text, 800)));
    paint(m); saveSoon(m);
    return `Sent to part ${p.n} (${p.name}).`;
  }
  async function stopPart(p) {
    if (!Native.isBusy(p.chatId)) return;
    window.hub.stop(p.chatId);
    for (let i = 0; i < 60 && Native.isBusy(p.chatId); i += 1) await sleep(100);
  }
  // again: the same brief, a fresh engine session (fresh: a fresh scene too; the precomp follows the chat)
  async function again(ref, { fresh = false } = {}, ctx) {
    const { m, p } = partFor(ref, ctx);
    await stopPart(p);
    const chat = await Native.load(p.chatId);
    if (!chat) throw new Error('That part\'s chat is gone.');
    chat.session = {};
    if (fresh) {
      const was = S()?.get(ChatScenes.linkOf(p.chatId));
      const sk = ChatScenes.fresh(p.chatId);
      if (was) { S().setFrame?.(sk.id, S().frameOf?.(was.id)); S().setTimeline?.(sk.id, S().timelineOf?.(was.id) || { len: 10, fps: 30 }); }
    }
    Native.save(chat);
    p.redo = (p.redo || 0) + 1;
    await sendPart(p, `${p.text}\n(Again${fresh ? ', from a fresh scene' : ''}: start over on this part.)`);
    paint(m); saveSoon(m);
    return `Part ${p.n} dispatched again${fresh ? ' from a fresh scene' : ''}.`;
  }
  // Claude ⇄ Astra for one part (its chat keeps its scene; the other engine gets the task state, director-task.js)
  async function swap(ref, ctx) {
    const { m, p } = partFor(ref, ctx);
    const a = director();
    const chat = await Native.load(p.chatId);
    if (!chat) throw new Error('That part\'s chat is gone.');
    const next = (chat.engine || a.engine) === 'codex' ? 'claude' : 'codex';
    const was = Native.isBusy(p.chatId) || p.state === 'stuck';
    await stopPart(p);
    chat.engine = next;
    p.engine = next;
    Native.save(chat);
    if (was) await sendPart(p, 'Comp · continue your part from where it is (you take over from the other engine).');
    paint(m); saveSoon(m);
    return `Part ${p.n} now runs on ${NAME[next]}${was ? ' and goes on from where it was' : ''}.`;
  }
  function jumpIn(p) {
    const a = director();
    if (!a) return;
    Native.open(a.id, p.chatId);
    Tools.openDock?.('three');
  }
  // what the main chat's agent reads: each part's status, last words and task state (short)
  async function partsInfo(ctx) {
    const e = cardFor(ctx);
    if (!e) return 'No parts dispatched yet.';
    const out = [];
    for (const p of e.m.parts) {
      const task = typeof DirectorTask !== 'undefined' ? cap(DirectorTask.text(p.chatId).replace(/^\[Task state[^\n]*\n/, '').replace(/\n/g, ' · '), 260) : '';
      out.push({ part: p.n, name: p.name, chat: (H.chats || []).find((c) => c.id === p.chatId)?.title || '(gone)', agent: NAME[p.engine] || p.engine, status: p.state, ...(p.last ? { said: p.last } : {}), ...(task ? { task } : {}), ...(p.queue?.length ? { feedbackWaiting: p.queue.length } : {}) });
    }
    return { layout: LAYOUT_LABEL[e.m.layout], seconds: e.m.len, parts: out };
  }

  // ---------- the card ----------
  const iconOf = (engine) => (typeof Icons !== 'undefined' && Icons.node(engine === 'codex' ? 'astra' : 'claude')) || document.createTextNode(engine === 'codex' ? 'A' : '✳');
  const paintT = new Map();
  function paint(m) {
    if (paintT.has(m.id)) return;
    paintT.set(m.id, setTimeout(() => {
      paintT.delete(m.id);
      for (const node of document.querySelectorAll(`.comp-card[data-cid="${m.id}"]`)) node.replaceWith(cardEl(m, H.agent(node.dataset.host), Number(node.dataset.index)));
    }, 60));
  }
  // the stills refresh without redrawing the card (a part's still changes after its edits)
  function paintSoft(m) {
    for (const node of document.querySelectorAll(`.comp-card[data-cid="${m.id}"] img.comp-still`)) {
      const url = ChatScenes.thumbOf?.(node.dataset.chat);
      if (url && node.getAttribute('src') !== url) node.src = url;
    }
  }
  function rowMenu(e, m, p) {
    e.preventDefault();
    const run = (fn) => () => fn().then((t) => t && toast(t, { timeout: 2400 })).catch((err) => toast(err.message, { type: 'error' }));
    ThreeTweaks.menu(e.clientX, e.clientY, [`Part ${p.n} · ${p.name}`,
      ['↗ Jump in', 'its chat and scene', () => jumpIn(p)],
      ['✎ Feedback…', 'sent to that part', run(async () => { const t = await Modal.prompt(`Feedback for part ${p.n}`, { multiline: true, placeholder: 'What to change' }); return t ? feedback(p.n, t, { chatId: m.host.chatId }) : null; })],
      ['⟳ Again', 'same brief, fresh session', run(() => again(p.n, {}, { chatId: m.host.chatId }))],
      ['⟳ Again from a fresh scene', '', run(() => again(p.n, { fresh: true }, { chatId: m.host.chatId }))],
      [`⇄ Swap to ${p.engine === 'codex' ? 'Claude' : 'Astra'}`, 'keeps its chat and scene', run(() => swap(p.n, { chatId: m.host.chatId }))],
      ['◫ Its layer in the main scene', '', () => { const S0 = S(); if (S0?.currentId() !== m.host.sketchId) S0?.open(m.host.sketchId); setTimeout(() => ThreeComp.menu(), 300); }],
      ['Copy its brief', '', () => copyText(p.brief, 'Brief copied')],
    ]);
  }
  function cardEl(m, agent, index) {
    const e = cards.get(m.id);
    if (!e) adopt(m, (H.chats || []).find((c) => c.agentId === agent?.id && H.activeChat[agent.id] === c.id)?.id || m.host?.chatId);
    const count = (st) => m.parts.filter((p) => p.state === st).length;
    const sum = ['working', 'waiting', 'stuck', 'done'].map((st) => (count(st) ? `${count(st)} ${STATES[st].replace('…', '')}` : '')).filter(Boolean).join(' · ');
    const rows = m.parts.map((p) => {
      const c = (H.chats || []).find((x) => x.id === p.chatId);
      const id = ChatScenes.identity(p.chatId);
      const still = ChatScenes.thumbOf?.(p.chatId);
      const row = el('div', { class: `comp-row st-${p.state}`, style: `--pc:${id.color}`, title: `${c?.title || 'gone'} · right-click for more` },
        still ? el('img', { class: 'comp-still', src: still, alt: '', dataset: { chat: p.chatId } }) : el('span', { class: 'comp-still none', dataset: { chat: p.chatId }, text: id.glyph }),
        el('div', { class: 'comp-main' },
          el('div', { class: 'comp-line' }, el('span', { class: 'comp-mark', text: id.glyph }), el('b', { text: `${p.n}. ${p.name}` }), el('span', { class: `comp-who by-${p.engine === 'codex' ? 'astra' : 'claude'}`, title: NAME[p.engine] }, iconOf(p.engine)), el('span', { class: 'comp-st', text: STATES[p.state] || p.state }), p.queue?.length ? el('span', { class: 'comp-q', text: `✎ ${p.queue.length}` }) : null),
          el('div', { class: 'comp-said', text: p.last || cap(p.brief, 110) })),
        el('div', { class: 'comp-acts' },
          el('button', { type: 'button', class: 'ghost small', text: '↗', title: 'Jump in: its chat and scene', on: { click: () => jumpIn(p) } }),
          el('button', { type: 'button', class: 'ghost small', text: '⟳', title: 'Dispatch it again (same brief)', on: { click: () => again(p.n, {}, { chatId: m.host.chatId }).then((t) => toast(t, { timeout: 2200 })).catch((err) => toast(err.message, { type: 'error' })) } }),
          el('button', { type: 'button', class: 'ghost small', text: '⇄', title: `Swap to ${p.engine === 'codex' ? 'Claude' : 'Astra'}`, on: { click: () => swap(p.n, { chatId: m.host.chatId }).then((t) => toast(t, { timeout: 2400 })).catch((err) => toast(err.message, { type: 'error' })) } })));
      row.addEventListener('contextmenu', (ev) => rowMenu(ev, m, p));
      return row;
    });
    return el('div', { class: `msg comp-card${m.parts.some((p) => p.state === 'working') ? ' running' : ''}`, dataset: { cid: m.id, host: agent?.id || '', index } },
      el('div', { class: 'comp-head' }, el('b', { text: `◫ Comp · ${m.parts.length} parts` }), el('span', { class: 'comp-sum', text: `${LAYOUT_LABEL[m.layout] || ''} · ${sum}` }),
        el('button', { type: 'button', class: 'ghost small', text: '▶', title: 'Show the main scene and play it', on: { click: () => reveal(m.host.sketchId, true) } })),
      ...rows);
  }
  function reveal(sketchId, play = false) {
    const e = [...cards.values()].find((x) => x.m.host.sketchId === sketchId);
    const a = director();
    if (e && a) Native.open(a.id, e.hostChatId);
    Tools.openDock?.('three');
    if (play) setTimeout(() => { const P = ThreeLab.director?.media; if (P) { P.seek(0); P.toggle(true); } }, 900);
  }
  const latestFor = (sketchId) => [...cards.values()].filter((x) => x.m.host.sketchId === sketchId).sort((a, b) => b.m.at - a.m.at)[0]?.m || null;
  function summaryLine(sketchId) { const m = latestFor(sketchId); if (!m) return ''; const c = (st) => m.parts.filter((p) => p.state === st).length; return `${m.parts.length} parts · ${c('done')} done${c('working') ? ` · ${c('working')} working` : ''}${c('stuck') ? ` · ${c('stuck')} stuck` : ''}`; }

  // ---------- asking (the menu entry, /dispatch with nothing) ----------
  async function ask() {
    const t = await Modal.prompt('Dispatch parts to other chats', { multiline: true, placeholder: 'One part per line (or a | between them).\nStart a line with astra: for Astra.\ne.g.\nan opening: embers gathering into a flame\nastra: the drop, a tunnel of light\nan end card with the name', label: 'Each part gets its own director chat and scene, working at the same time; the main scene shows them one after the other.' });
    if (!t?.trim()) return null;
    const m = await dispatch({ parts: splitParts(t) });
    toast(`◫ ${m.parts.length} parts dispatched`, { timeout: 2500 });
    return m;
  }
  const splitParts = (t) => String(t).split(/\s*\|\s*|\n+/).map((x) => x.trim()).filter(Boolean);

  // ---------- the directors (three_do comp: dispatch, parts, feedback, again, swap) ----------
  async function handle(op, args = {}, ctx = {}) {
    try {
      if (op === 'dispatch') {
        const m = await dispatch({ parts: args.parts || [], layout: args.layout || 'time', len: args.secs || args.len || null, hostChatId: ctx.chatId || null });
        return { ok: true, value: { dispatched: m.parts.map((p) => `${p.n}. ${p.name} → ${NAME[p.engine]} in "${(H.chats || []).find((c) => c.id === p.chatId)?.title}"`), layout: LAYOUT_LABEL[m.layout], seconds: m.len, note: 'Each part works at once in its own chat and scene; they show live as precomp layers here. three_do comp {op: "parts"} reads their status.' } };
      }
      if (op === 'parts') return { ok: true, value: await partsInfo(ctx) };
      if (op === 'feedback') return { ok: true, value: await feedback(args.part, args.text, ctx) };
      if (op === 'again' || op === 'redispatch') return { ok: true, value: await again(args.part, { fresh: Boolean(args.fresh) }, ctx) };
      if (op === 'swap') return { ok: true, value: await swap(args.part, ctx) };
      return { ok: false, error: `Unknown op "${op}"` };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  // /comp parts | feedback | again | swap
  async function command(sub, rest, ctx) {
    const c = { chatId: ctx?.chatId || (director() ? H.activeChat[director().id] : null) };
    try {
      if (sub === 'parts') {
        const r = await partsInfo(c);
        if (typeof r === 'string') return r;
        return `◫ **${r.parts.length} parts** (${r.layout}, ${r.seconds} s)\n${r.parts.map((p) => `${p.part}. ${p.name} · ${p.agent} · **${STATES[p.status] || p.status}**${p.said ? ` · ${p.said}` : ''}`).join('\n')}`;
      }
      const [ref, ...more] = String(rest || '').trim().split(/\s+/);
      if (sub === 'feedback') return await feedback(ref, more.join(' '), c);
      if (sub === 'again') return await again(ref, { fresh: /fresh/i.test(more.join(' ')) }, c);
      if (sub === 'swap') return await swap(ref, c);
    } catch (err) { return `Error: ${err.message}`; }
    return null;
  }
  function register() {
    if (Commands.get('dispatch')) return;
    Commands.register({
      name: 'dispatch', area: 'Three.js Lab', args: '<part> | <part> | … [--split | --stack]',
      desc: 'Split a video into parts: each goes to its own director chat (astra: for Astra), all at once; the main scene shows them as layers, live',
      keywords: 'comp parts agents parallel split delegate several chats at once multiple scenes video',
      examples: ['/dispatch embers gathering | astra: a tunnel of light | an end card', '/dispatch --split red pulse | blue rings'],
      complete: () => [{ value: '--split ', hint: 'side by side' }, { value: '--stack ', hint: 'stacked (screen)' }, { value: 'astra: ', hint: 'this part on Astra' }],
      run: async (args) => {
        let a = String(args || '').trim();
        if (!a) { ask().catch((err) => toast(err.message, { type: 'error' })); return null; }
        const layout = /--split\b/.test(a) ? 'split' : /--stack\b/.test(a) ? 'stack' : 'time';
        a = a.replace(/--(split|stack|time)\b/g, '').trim();
        const m = await dispatch({ parts: splitParts(a), layout });
        return `◫ ${m.parts.length} parts dispatched (${LAYOUT_LABEL[m.layout]}): ${m.parts.map((p) => `${p.n}. ${p.name} → ${NAME[p.engine]}`).join(' · ')}`;
      },
    });
  }
  if (typeof Commands !== 'undefined') { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register(); }
  addEventListener('DOMContentLoaded', () => AppUI.addAction?.('Lab: Dispatch parts to other chats (comp)…', () => ask().catch((err) => toast(err.message, { type: 'error' }))));

  return { dispatch, handle, command, cardEl, ask, feedback, again, swap, partsInfo, latestFor, summaryLine, reveal, jumpIn, cards: () => [...cards.values()].map((e) => e.m), STUCK_MS };
})();
