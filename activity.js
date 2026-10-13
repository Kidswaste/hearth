// Activity (round 27): one calm place that says what the AIs and Hearth are doing. The owner asked to see clearly what
// chats are doing (agents deployed, where the thinking is, whether something is stuck); since then hooks, missions,
// helper agents, Lab crews, renders, sync and updates all run on their own too.
//   · A small indicator at the bottom of the rail, only while something runs or needs you, with a count (ember when
//     something waits for you). Click: the Activity panel · right-click: stop all replies, notifications, clear.
//   · The panel: Waiting for you (permission asks, questions, a plan to approve, a reply that looks stuck, sync
//     conflicts, things that failed while you looked elsewhere), Now running (each chat's reply: its AI, what it is
//     doing, how long, its helper agents, Open / Stop; missions asked of another AI; renders, flows and other work
//     with a bar), and the last 24 h (hooks fired, missions done, long replies, renders, updates), each with a link.
//   · Stuck: a reply with no news for a while (chat-live.js's own liveness reading, not a second one) "looks stuck"
//     here, with Wait / Stop & retry from here / Open.
//   · Desktop notifications (Mac and Windows) only for what needs you or a long job finishing while Hearth is in the
//     background, at most one every 20 s (more are summed up), under the one existing switch: Settings → General
//     "Desktop notifications while I'm elsewhere" (/notify). Permission asks and questions already notify by
//     themselves (access.js, native.js): not twice.
// Everything is gathered from signals that already exist (Native.hooks, ChatLive, Missions, Hooks, Renders.onChange,
// Progress.on, Sync status, Updater) plus three tiny events ('hearth:needs-you', 'hearth:mission',
// 'hearth:hook-fired'). No polling while idle: a 5 s check runs only while a reply runs (the stuck reading), a 1 s
// repaint only while the panel is open and something runs. History: localStorage 'activity.log' (24 h, ≤ 150).
const Activity = (() => {
  const DAY = 864e5;
  const LOG_KEY = 'activity.log';
  const LOG_MAX = 150;
  const LONG_REPLY_MS = 20000; // a reply at least this long goes in the history (shorter ones are just the chat)
  const LONG_JOB_MS = 60000; // a job this long finishing while you're elsewhere: a desktop notification
  const NOTE_GAP = 20000; // at most one desktop notification per this long (the rest summed up)
  const HIST_SHOWN = 12;
  const now = () => Date.now();
  const short = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const secs = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`; };
  const ago = (t) => { const s = Math.round((now() - t) / 1000); return s < 50 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
  const agentOf = (id) => (typeof H !== 'undefined' ? H.agent(id) : null);
  const nameOf = (id) => agentOf(id)?.name || 'An AI';
  const busy = (chatId) => typeof Native !== 'undefined' && Native.isBusy(chatId);

  const runs = new Map(); // chat id → { agentId, chatId, title, started } (replies running)
  const needs = new Map(); // id → { kind: 'permission' | 'question', agentId, chatId, who, text, node, at }
  const plans = new Map(); // chat id → { agentId, chatId, title, at } (Plan first: waiting for ▶ Go ahead)
  const fails = new Map(); // id → { icon, text, at, go } (failed while you looked elsewhere; until opened / dismissed)
  let log = [];
  try { log = (store.get(LOG_KEY, []) || []).filter((e) => e && now() - e.at < DAY); } catch { log = []; }
  let saveT = 0;
  const keep = () => { clearTimeout(saveT); saveT = setTimeout(() => { log = log.filter((e) => now() - e.at < DAY).slice(-LOG_MAX); try { store.set(LOG_KEY, log); } catch { /* storage full */ } }, 600); };
  function remember(e) {
    log.push({ at: now(), id: `${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...e });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
    keep();
    soon();
  }

  // ---------- opening what an entry is about ----------
  // go: { chat: [agentId, chatId] } | { file } | { renders: 1 } | { hooks: agentId } | { sync: 1 } | { update: 1 }
  function go(g) {
    if (!g) return;
    try {
      if (g.chat) {
        const [a, c] = g.chat;
        if (!agentOf(a)) { toast('That AI is gone.', { timeout: 2000 }); return; }
        document.querySelector('.lab-focus-exit')?.click?.();
        if (c) Native.open(a, c); else activate(a);
        if (c) dropFail(`reply:${c}`);
      } else if (g.file) window.hub.fs.open(g.file).catch?.(() => toast('That file is gone.', { timeout: 2200 }));
      else if (g.renders) (window.Lazy ? Lazy.load('renders') : Promise.resolve()).then(() => Renders.open()).catch(() => {});
      else if (g.hooks) (typeof Options !== 'undefined' ? Promise.resolve() : Lazy.load('options')).then(() => Options.open({ agentId: g.hooks })).catch(() => {});
      else if (g.sync) Sync.conflicts();
      else if (g.update) Updater.dialog();
    } catch (err) { toast(err.message, { type: 'error' }); }
    close();
  }

  // ---------- what is running ----------
  function live(chatId) {
    if (typeof ChatLive === 'undefined' || !busy(chatId)) return { text: 'Working', stall: null, agents: [] };
    try {
      const s = ChatLive.statusOf(chatId, null);
      const st = ChatLive.state(chatId);
      return { text: s.text.replace(/ · Esc stops$/, ''), stall: s.stall, agents: st ? [...st.agents.values()] : [] };
    } catch { return { text: 'Working', stall: null, agents: [] }; }
  }
  function running() {
    const out = [];
    for (const r of [...runs.values()]) {
      if (!busy(r.chatId)) { runs.delete(r.chatId); continue; }
      out.push({ kind: 'reply', key: `r:${r.chatId}`, r, l: live(r.chatId) });
    }
    const ms = typeof Missions !== 'undefined' ? Missions._live : null;
    if (ms) {
      for (const [id, L] of ms) {
        if (L.m.kind === 'everyone') continue; // its AIs answer in their own chats: they are listed as replies
        const mi = Missions.LIST.find((x) => x.id === L.m.kind) || { icon: '◎', label: 'Mission' };
        out.push({ kind: 'mission', key: `m:${id}`, L, mi });
      }
    }
    if (typeof Progress !== 'undefined') {
      for (const it of Progress.list()) {
        if (/^chat:/.test(it.key) || it.state === 'done' || it.state === 'failed') continue; // replies are above, with more
        out.push({ kind: 'job', key: `p:${it.key}`, it });
      }
    }
    return out;
  }

  // ---------- what waits for you ----------
  const answered = (n) => !n.node || n.node.classList.contains('answered') || now() - n.at > 15 * 60000;
  function syncNeed() {
    const st = typeof Sync !== 'undefined' ? Sync.status?.() : null;
    if (!st?.on) return null;
    if (st.state === 'held') return 'Sync waits for you';
    if (st.state === 'error') return 'Sync has an error';
    if (st.conflicts) return `${st.conflicts} sync conflict${st.conflicts === 1 ? '' : 's'} to look at`;
    return null;
  }
  function planWaiting(p) {
    const c = typeof Native !== 'undefined' ? Native.chatOf(p.agentId) : null;
    if (c?.id !== p.chatId) return true; // another chat is open there: it waits until that chat moves on
    return c.messages.at(-1)?.plan === 'waiting';
  }
  function waiting(run = running()) {
    const out = [];
    for (const [id, n] of [...needs]) { if (answered(n)) { needs.delete(id); continue; } out.push({ kind: 'ask', key: `a:${id}`, n }); }
    for (const x of run) if (x.kind === 'reply' && x.l.stall) out.push({ kind: 'stuck', key: `s:${x.r.chatId}`, r: x.r, l: x.l });
    for (const [chatId, p] of [...plans]) { if (!planWaiting(p)) { plans.delete(chatId); continue; } out.push({ kind: 'plan', key: `pl:${chatId}`, p }); }
    const s = syncNeed();
    if (s) out.push({ kind: 'sync', key: 'sync', text: s });
    for (const [id, f] of fails) out.push({ kind: 'fail', key: `f:${id}`, id, f });
    for (const x of run) if (x.kind === 'job' && x.it.state === 'hung') out.push({ kind: 'hung', key: `h:${x.it.key}`, it: x.it });
    return out;
  }
  const dropFail = (id) => { if (fails.delete(id)) soon(); };

  // ---------- desktop notifications (only while Hearth is in the background; one switch: settings.notify) ----------
  let lastNote = 0; let held = []; let heldT = 0;
  const sent = []; // (dev checks) what was notified
  let forceAway = false; // (dev checks) behave as if Hearth were in the background
  const allowed = () => typeof H === 'undefined' || H.settings().notify !== false;
  async function away() {
    if (forceAway) return true;
    if (document.hidden) return true;
    try { return !(await window.hub.isWindowFocused()); } catch { return !document.hasFocus(); }
  }
  async function notify(title, body, g) {
    if (!allowed() || !(await away())) return;
    const t = now();
    if (t - lastNote < NOTE_GAP) {
      held.push({ title, body, g });
      if (!heldT) heldT = setTimeout(flushHeld, NOTE_GAP - (t - lastNote) + 50);
      return;
    }
    show(title, body, g);
  }
  function flushHeld() {
    heldT = 0;
    const h = held; held = [];
    if (!h.length) return;
    if (h.length === 1) { show(h[0].title, h[0].body, h[0].g); return; }
    show(`Hearth: ${h.length} things`, h.map((x) => x.title).slice(0, 4).join(' · '), null);
  }
  function show(title, body, g) {
    lastNote = now();
    sent.push({ title, body, at: lastNote });
    if (sent.length > 30) sent.shift();
    try {
      window.hub.flashWindow?.();
      const n = new Notification(title, { body: short(body, 160), silent: false });
      n.onclick = () => { window.hub.showWindow?.(); if (g) go(g); else open(); };
    } catch { /* notifications off */ }
  }

  // ---------- the signals ----------
  function onSend(agentId, chat) {
    if (!chat) return;
    runs.set(chat.id, { agentId, chatId: chat.id, title: chat.title || 'Chat', started: now() });
    plans.delete(chat.id);
    stalled.delete(chat.id);
    soon(); arm();
  }
  function onEnd(event, chat) {
    if (!chat) return;
    const r = runs.get(chat.id);
    runs.delete(chat.id);
    stalled.delete(chat.id);
    const agentId = chat.agentId;
    const last = chat.messages.at(-1);
    const ms = last?.ms || (r ? now() - r.started : 0);
    const helpers = last?.activity?.agents?.length || 0;
    const looking = H.activeChat[agentId] === chat.id && document.hasFocus() && !document.hidden;
    if (event.type === 'error') {
      remember({ icon: '✕', text: `${nameOf(agentId)}'s reply failed: ${short(event.message, 80)}`, go: { chat: [agentId, chat.id] } });
      if (!looking) fails.set(`reply:${chat.id}`, { icon: '✕', text: `${nameOf(agentId)}'s reply failed in “${short(chat.title, 40)}”`, at: now(), go: { chat: [agentId, chat.id] } });
    } else if (event.type === 'done' && (ms >= LONG_REPLY_MS || helpers)) {
      remember({ icon: '✓', text: `${nameOf(agentId)} finished “${short(chat.title, 48)}” · ${secs(ms)}${helpers ? ` · ${helpers} helper${helpers > 1 ? 's' : ''}` : ''}`, go: { chat: [agentId, chat.id] } });
    }
    // Plan first: missions.js marks the reply 300 ms after it ends (its afterReply)
    setTimeout(() => {
      const m = chat.messages.at(-1);
      if (event.type === 'done' && m?.plan === 'waiting') {
        plans.set(chat.id, { agentId, chatId: chat.id, title: chat.title || 'Chat', at: now() });
        notify(`${nameOf(agentId)}'s plan is ready`, 'It waits for your ▶ Go ahead.', { chat: [agentId, chat.id] });
      }
      soon(); arm();
    }, 450);
  }
  function onNeed(e) {
    const d = e.detail || {};
    if (!d.node) return;
    const id = `${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    needs.set(id, { kind: d.kind, agentId: d.agentId, chatId: d.chatId, who: d.who || nameOf(d.agentId), text: d.text, node: d.node, at: now(), risk: d.risk });
    // answered or timed out: the card gets the class 'answered' (watched only while it waits)
    try {
      const mo = new MutationObserver(() => { if (d.node.classList.contains('answered')) { mo.disconnect(); needs.delete(id); soon(); } });
      mo.observe(d.node, { attributes: true, attributeFilter: ['class'] });
    } catch { /* checked on paint */ }
    soon();
  }
  function onMission(e) {
    const d = e.detail || {};
    if (d.phase === 'done') {
      const mi = Missions.LIST.find((x) => x.id === d.kind) || { icon: '◎', label: 'Mission' };
      remember({ icon: mi.icon, text: `${mi.label} ${d.ok ? 'done' : 'ended without an answer'}: “${short(d.task, 50)}”${d.ms ? ` · ${secs(d.ms)}` : ''}`, go: d.agentId ? { chat: [d.agentId, d.chatId] } : null });
    }
    soon();
  }
  function onHook(e) {
    const d = e.detail || {};
    remember({ icon: '⚡', text: `${d.when} → ${nameOf(d.agentId)}`, go: { chat: [d.agentId, H.activeChat[d.agentId] || null] } });
  }
  const seenJobs = new Set();
  function onRender(j, what) {
    if ((what !== 'done' && what !== 'failed') || seenJobs.has(j.id)) { if (what === 'add' || what === 'start') soon(); return; }
    seenJobs.add(j.id);
    const name = j.output ? String(j.output).split(/[\\/]/).pop() : j.title;
    const took = j.seconds != null ? j.seconds * 1000 : (j.ended || now()) - (j.started || j.created || now());
    if (what === 'done') {
      remember({ icon: '⇪', text: `Render done: ${short(name, 50)}${took >= 1000 ? ` · ${secs(took)}` : ''}`, go: j.output ? { file: j.output } : { renders: 1 } });
      if (took >= LONG_JOB_MS) notify('Render done', short(name, 80), j.output ? { file: j.output } : { renders: 1 });
    } else {
      const why = j.error?.reason || 'failed';
      remember({ icon: '✕', text: `Render failed: ${short(j.title, 40)} (${short(why, 50)})`, go: { renders: 1 } });
      fails.set(`render:${j.id}`, { icon: '⇪', text: `Render failed: ${short(j.title, 40)} (${short(why, 60)})`, at: now(), go: { renders: 1 } });
      notify('A render failed', `${short(j.title, 60)}: ${short(why, 90)}`, { renders: 1 });
    }
  }
  // other work with a bar (flows, comps, Lab renders, captures, installs…): its end, when it was a long one
  function onProgress(it, what) {
    if (what === 'tick' || /^chat:/.test(it?.key || '')) return;
    if (what === 'done' && !/^job:/.test(it.key)) { // render-queue jobs come through onRender, with their file
      const took = (it.ended || now()) - (it.started || now());
      if (took >= LONG_JOB_MS && !it.parent) {
        const ok = it.state !== 'failed';
        remember({ icon: ok ? '✓' : '✕', text: `${short(it.title || it.key, 50)} ${ok ? 'finished' : 'failed'} · ${secs(took)}` });
        notify(`${short(it.title || 'A job', 50)} ${ok ? 'finished' : 'failed'}`, `It took ${secs(took)}.`, null);
      }
    }
    soon();
  }
  let syncWas = null;
  function onSync() {
    const s = syncNeed();
    if (s && s !== syncWas) notify(s, 'Open Hearth to look at it.', { sync: 1 });
    syncWas = s;
    soon();
  }
  function onUpdated(j) {
    if (!j?.at || log.some((e) => e.update === j.at)) return;
    remember({ icon: '⬆', text: `Hearth updated (${j.from} → ${j.to}, ${j.n} file${j.n === 1 ? '' : 's'})`, update: j.at });
  }

  // ---------- stuck readings: only while a reply runs ----------
  const stalled = new Set(); // chats already told about (until they move again)
  let tickT = 0;
  function arm() {
    const want = runs.size > 0 || (pop && running().length > 0);
    if (want && !tickT) tickT = setInterval(tick, pop ? 1000 : 5000);
    else if (!want && tickT) { clearInterval(tickT); tickT = 0; }
  }
  function rearm() { if (tickT) { clearInterval(tickT); tickT = 0; } arm(); }
  function tick() {
    const run = running();
    for (const x of run) {
      if (x.kind !== 'reply') continue;
      if (x.l.stall && !stalled.has(x.r.chatId)) {
        stalled.add(x.r.chatId);
        notify(`${nameOf(x.r.agentId)} looks stuck`, x.l.stall, { chat: [x.r.agentId, x.r.chatId] });
      } else if (!x.l.stall) stalled.delete(x.r.chatId);
    }
    paint(run);
    arm();
  }

  // ---------- the rail indicator ----------
  let badge = null;
  function mountBadge() {
    const rail = document.getElementById('rail');
    if (!rail) return null;
    if (!badge) {
      badge = el('button', { class: 'tool-btn act-badge', id: 'act-badge', type: 'button', hidden: true, dataset: { feature: 'Activity' }, 'aria-label': 'Activity' }, el('span', { class: 'act-ic', text: '◉' }), el('b', { class: 'act-n' }));
      badge.addEventListener('click', () => (pop ? close() : open()));
      badge.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX + 6, e.clientY - 110, quickMenu()); });
    }
    const anchor = document.getElementById('up-btn') || document.getElementById('rq-badge') || document.getElementById('pg-dot') || document.getElementById('sync-dot') || document.getElementById('keys-btn');
    if (anchor ? badge.nextElementSibling !== anchor : badge.parentElement !== rail) (anchor ? anchor.before(badge) : rail.append(badge));
    return badge;
  }
  function paintBadge(run, wait) {
    const n = run.length + wait.length;
    if (!n && !badge) return;
    if (!mountBadge()) return;
    const show = n > 0;
    if (badge.hidden === show) badge.hidden = !show;
    if (!show) return;
    const t = n > 99 ? '99+' : String(n);
    const nb = badge.lastChild;
    if (nb.textContent !== t) nb.textContent = t;
    const st = wait.length ? 'need' : 'run';
    if (badge.dataset.state !== st) badge.dataset.state = st;
    const title = `Activity: ${run.length ? `${run.length} running` : 'nothing running'}${wait.length ? ` · ${wait.length} waiting for you` : ''}\nClick: what runs, what waits for you, the last 24 h · right-click: more`;
    if (badge.title !== title) badge.title = title;
  }
  function quickMenu() {
    const replies = [...runs.values()].filter((r) => busy(r.chatId));
    return [
      { label: 'Activity…', action: () => open() },
      replies.length ? { label: `■ Stop ${replies.length > 1 ? `all ${replies.length} replies` : 'the reply'}`, action: () => { for (const r of replies) Native.stop(r.agentId); } } : null,
      { label: allowed() ? 'Desktop notifications: on (turn off)' : 'Desktop notifications: off (turn on)', action: () => setNotify(!allowed()) },
      { label: 'Clear the history', more: true, action: () => { log = []; keep(); soon(); } },
    ].filter(Boolean);
  }
  async function setNotify(on) {
    H.config.settings = { ...H.settings(), notify: on };
    await saveConfig();
    toast(on ? 'Desktop notifications on (only while you look elsewhere).' : 'Desktop notifications off.', { timeout: 2200 });
    soon();
  }

  // ---------- the panel ----------
  let pop = null;
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: `${cls} ac-b`, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn()).catch((err) => toast(err.message, { type: 'error' })); } } });
  const avatar = (agentId) => { const a = agentOf(agentId); return el('span', { class: 'ac-av', text: a?.icon || a?.name?.[0] || '•', style: { background: a?.color || 'var(--accent)' } }); };
  const openChat = (agentId, chatId) => btn('↗', 'Open this chat', () => go({ chat: [agentId, chatId] }));
  // a row: built once per signature; its live words (.ac-w) are rewritten in place when they change
  function row(x) {
    if (x.kind === 'reply') {
      const { r, l } = x;
      const helpers = l.agents.map((a) => el('li', { class: `ac-helper ${a.status}` }, el('i', { class: 'ac-pip' }), el('b', { text: short(a.description, 40) }), el('span', { class: 'ac-hw' })));
      return el('div', { class: 'ac-row ac-reply' },
        el('div', { class: 'ac-line' }, avatar(r.agentId), el('b', { class: 'ac-t ac-grow', text: `${nameOf(r.agentId)} · ${short(r.title, 50)}` }),
          openChat(r.agentId, r.chatId), btn('■', 'Stop this reply (what it wrote stays)', () => Native.stop(r.agentId))),
        el('div', { class: 'ac-sub ac-w' }),
        helpers.length ? el('ol', { class: 'ac-helpers' }, helpers) : null);
    }
    if (x.kind === 'mission') {
      const { L, mi } = x;
      return el('div', { class: 'ac-row' }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: mi.icon }), el('b', { class: 'ac-t', text: `${mi.label}: ${short(L.m.task, 40)}` }), el('span', { class: 'ac-w' }), openChat(L.agentId, L.chat?.id)));
    }
    if (x.kind === 'job') {
      const it = x.it;
      return el('div', { class: 'ac-row' }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: it.icon || '◔' }), el('b', { class: 'ac-t', text: short(String(it.title || it.key).replace(/^⇪\s*/, ''), 46) }), el('span', { class: 'ac-w' }),
        ...(it.actions || []).slice(0, 2).map((a) => btn(a.label, a.title || '', () => a.run())),
        it.jump ? btn('↗', 'Show it', () => { close(); it.jump(); }) : null));
    }
    if (x.kind === 'ask') {
      const n = x.n;
      const acts = [];
      if (n.kind === 'permission') {
        const allow = n.node.querySelector('.access-row button.primary');
        const deny = n.node.querySelector('.access-row button.danger');
        if (allow) acts.push(btn('Allow once', 'Allow this once', () => allow.click(), 'primary small'));
        if (deny) acts.push(btn('Deny', 'Deny it', () => deny.click()));
      }
      if (n.chatId) acts.push(openChat(n.agentId, n.chatId));
      return el('div', { class: `ac-row ac-need ${n.risk === 'low' ? '' : 'ac-careful'}` }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: n.kind === 'permission' ? '🔐' : '❓' }), el('b', { class: 'ac-t ac-wrap', text: `${n.who} ${n.text}` }), ...acts));
    }
    if (x.kind === 'stuck') {
      const { r } = x;
      return el('div', { class: 'ac-row ac-need' },
        el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: '⏳' }), el('b', { class: 'ac-t', text: `${nameOf(r.agentId)} looks stuck` }), el('span', { class: 'ac-w' })),
        el('div', { class: 'ac-acts' },
          btn('Wait', 'Keep waiting (asks again in 2 min)', () => { ChatLive.wait(r.chatId); stalled.delete(r.chatId); soon(); }),
          btn('Stop & retry from here', 'Stop, then ask it to continue from where it was (what it wrote stays)', () => { close(); return ChatLive.unstick(r.agentId); }, 'primary small'),
          btn('Stop', 'Stop this reply', () => Native.stop(r.agentId)),
          openChat(r.agentId, r.chatId)));
    }
    if (x.kind === 'plan') {
      const { p } = x;
      const here = Native.chatOf(p.agentId)?.id === p.chatId;
      return el('div', { class: 'ac-row ac-need' }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: '📝' }), el('b', { class: 'ac-t', text: `${nameOf(p.agentId)}'s plan is ready · ${short(p.title, 30)}` }),
        here ? btn('▶ Go ahead', 'It does the work as planned', () => goAhead(p), 'primary small') : null, openChat(p.agentId, p.chatId)));
    }
    if (x.kind === 'sync') return el('div', { class: 'ac-row ac-need' }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: '⇅' }), el('b', { class: 'ac-t', text: x.text }), btn('Look', 'Both versions side by side, plain choices', () => go({ sync: 1 }))));
    if (x.kind === 'fail') {
      const { f, id } = x;
      return el('div', { class: 'ac-row ac-need ac-failed' }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: f.icon }), el('b', { class: 'ac-t ac-wrap', text: f.text }),
        f.go ? btn('↗', 'Open it', () => { dropFail(id); go(f.go); }) : null, btn('✕', 'Dismiss', () => dropFail(id))));
    }
    if (x.kind === 'hung') {
      const it = x.it;
      return el('div', { class: 'ac-row ac-need' }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: '⏳' }), el('b', { class: 'ac-t', text: `${short(it.title || it.key, 40)}: no news for a while` }), it.jump ? btn('↗', 'Show it', () => { close(); it.jump(); }) : null));
    }
    if (x.kind === 'hist') {
      const e = x.e;
      const g = e.go;
      return el('div', { class: `ac-row ac-hist${g ? ' ac-link' : ''}`, title: g ? 'Open it' : '', on: g ? { click: () => go(g) } : {} },
        el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: e.icon || '•' }), el('span', { class: 'ac-t ac-ht', text: e.text }), el('span', { class: 'ac-w' })));
    }
    return el('div');
  }
  const sigOf = (x) => {
    if (x.kind === 'reply') return `${x.key}|${x.l.agents.map((a) => `${a.status}${a.description}`).join(',')}`;
    if (x.kind === 'job') return `${x.key}|${x.it.title}|${(x.it.actions || []).length}`;
    if (x.kind === 'plan') return `${x.key}|${Native.chatOf(x.p.agentId)?.id === x.p.chatId}`;
    if (x.kind === 'sync') return `${x.key}|${x.text}`;
    if (x.kind === 'hist') return `${x.key}|${x.e.text}`;
    return x.key;
  };
  // the words that move (times, phases): written only when they changed
  function words(node, x) {
    const set = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };
    const w = node.querySelector(':scope > .ac-line > .ac-w, :scope > .ac-sub');
    if (x.kind === 'reply') {
      set(w, x.l.stall ? 'no news for a while' : x.l.text);
      const lis = node.querySelectorAll(':scope > .ac-helpers > li');
      x.l.agents.forEach((a, i) => set(lis[i]?.lastChild, a.status === 'running' ? (a.tool ? `${String(a.tool.name || '').replace(/^mcp__.+?__/, '').replace(/[_-]/g, ' ')} · ${secs(now() - a.at)}` : `thinking · ${secs(now() - a.at)}`) : short(a.summary || a.status, 50)));
    } else if (x.kind === 'mission') {
      const rows = x.L.m.rows || [];
      set(w, `${rows.filter((r) => r.status === 'done').length} of ${rows.length} answered · ${secs(now() - x.L.m.at)}`);
    } else if (x.kind === 'job') set(w, typeof Progress !== 'undefined' ? Progress.words(x.it) : '');
    else if (x.kind === 'stuck') set(w, x.l.stall.replace(/^No news/, 'no news'));
    else if (x.kind === 'hist') set(w, ago(x.e.at));
  }
  function list(box, items) {
    const old = new Map([...box.children].map((n) => [n.dataset.key, n]));
    let prev = null;
    for (const x of items) {
      const sig = sigOf(x);
      let node = old.get(x.key);
      if (!node || node.dataset.sig !== sig) { const fresh = row(x); fresh.dataset.key = x.key; fresh.dataset.sig = sig; if (node) node.replaceWith(fresh); node = fresh; }
      old.delete(x.key);
      if (prev ? prev.nextSibling !== node : box.firstChild !== node) (prev ? prev.after(node) : box.prepend(node));
      words(node, x);
      prev = node;
    }
    for (const n of old.values()) n.remove();
  }
  function goAhead(p) {
    const c = Native.chatOf(p.agentId);
    const m = c?.id === p.chatId ? c.messages.at(-1) : null;
    if (m?.plan === 'waiting') { m.plan = 'approved'; Native.save(c); }
    plans.delete(p.chatId);
    Native.sendText(p.agentId, 'Looks good: go ahead with the plan.');
    soon();
  }
  function section(cls, title) {
    return el('section', { class: `ac-sec ${cls}`, hidden: true }, el('h4', { text: title }), el('div', { class: 'ac-list' }));
  }
  function open() {
    if (pop) { paint(); return pop; }
    const showAll = el('button', { type: 'button', class: 'ghost small ac-more', hidden: true, on: { click: () => { pop.all = !pop.all; paint(); } } });
    pop = el('div', { class: 'ac-pop', role: 'dialog', 'aria-label': 'Activity' },
      el('div', { class: 'ac-head' }, el('b', { text: 'Activity' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'Notifications, clear the history', on: { click: (e) => { const rr = e.currentTarget.getBoundingClientRect(); showMenu(rr.left, rr.bottom + 2, quickMenu().filter((i) => i.label !== 'Activity…')); } } })),
      section('ac-wait', 'Waiting for you'), section('ac-run', 'Now running'), section('ac-day', 'Last 24 h'), showAll,
      el('p', { class: 'ac-empty', hidden: true, text: 'All quiet: nothing runs, nothing waits for you.' }));
    pop.all = false;
    document.body.append(pop);
    place();
    paint();
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escKey, true); }, 0);
    rearm();
    return pop;
  }
  function place() {
    if (!pop) return;
    const b = badge && !badge.hidden ? badge.getBoundingClientRect() : null;
    const r = b || document.getElementById('rail')?.getBoundingClientRect();
    pop.style.left = `${Math.round((r?.right || 60) + 8)}px`;
    pop.style.bottom = `${Math.max(8, Math.round(b ? innerHeight - b.bottom : 8))}px`;
  }
  function close() {
    if (!pop) return;
    pop.remove(); pop = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escKey, true);
    rearm();
  }
  const outside = (e) => { if (pop && !pop.contains(e.target) && !badge?.contains(e.target) && !e.target.closest?.('#menu, #menu-fly, dialog')) close(); };
  const escKey = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } };

  // ---------- painting: the badge always, the panel while open (≤ 2× a second from signals) ----------
  let paintT = 0;
  function soon() { if (!paintT) paintT = setTimeout(() => { paintT = 0; paint(); arm(); }, 250); }
  function paint(run = running()) {
    const wait = waiting(run);
    paintBadge(run, wait);
    if (!pop) return;
    const [w, r, d] = pop.querySelectorAll('.ac-sec');
    const day = log.filter((e) => now() - e.at < DAY).reverse();
    const shown = pop.all ? day : day.slice(0, HIST_SHOWN);
    list(w.lastChild, wait); w.hidden = !wait.length;
    list(r.lastChild, run); r.hidden = !run.length;
    list(d.lastChild, shown.map((e) => ({ kind: 'hist', key: `e:${e.id || e.at}`, e }))); d.hidden = !shown.length;
    const more = pop.querySelector('.ac-more');
    more.hidden = day.length <= HIST_SHOWN;
    const mt = pop.all ? 'Show fewer' : `Show all ${day.length}`;
    if (more.textContent !== mt) more.textContent = mt;
    pop.querySelector('.ac-empty').hidden = Boolean(wait.length || run.length || shown.length);
    // an update ready on main sits at the bottom of what waits (not counted: ⬆ shows it already)
    const up = typeof Updater !== 'undefined' ? Updater.status : null;
    let upRow = pop.querySelector('.ac-up');
    if (up?.ok && up.behind > 0) {
      if (!upRow) { upRow = el('div', { class: 'ac-row ac-up ac-link', on: { click: () => go({ update: 1 }) } }, el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: '⬆' }), el('span', { class: 'ac-t' }))); w.after(upRow); }
      const t = `Hearth update ready: ${up.behind} change${up.behind === 1 ? '' : 's'} (what's new…)`;
      if (upRow.lastChild.lastChild.textContent !== t) upRow.lastChild.lastChild.textContent = t;
    } else upRow?.remove();
  }

  // ---------- as text (the command, and for the AI when asked) ----------
  function summary() {
    const run = running();
    const wait = waiting(run);
    const L = [];
    if (wait.length) {
      L.push('**Waiting for you**');
      for (const x of wait) {
        if (x.kind === 'ask') L.push(`- ${x.n.kind === 'permission' ? '🔐' : '❓'} ${x.n.who} ${x.n.text}`);
        else if (x.kind === 'stuck') L.push(`- ⏳ ${nameOf(x.r.agentId)} looks stuck (${x.l.stall})`);
        else if (x.kind === 'plan') L.push(`- 📝 ${nameOf(x.p.agentId)}'s plan is ready (“${short(x.p.title, 40)}”)`);
        else if (x.kind === 'sync') L.push(`- ⇅ ${x.text}`);
        else if (x.kind === 'fail') L.push(`- ${x.f.icon} ${x.f.text}`);
        else if (x.kind === 'hung') L.push(`- ⏳ ${x.it.title || x.it.key}: no news for a while`);
      }
    }
    if (run.length) {
      L.push('**Now running**');
      for (const x of run) {
        if (x.kind === 'reply') {
          L.push(`- ${nameOf(x.r.agentId)} · “${short(x.r.title, 40)}”: ${x.l.stall || x.l.text}`);
          for (const a of x.l.agents) L.push(`  - 🤖 ${a.description}: ${a.status === 'running' ? 'working' : a.summary || a.status}`);
        } else if (x.kind === 'mission') L.push(`- ${x.mi.icon} ${x.mi.label}: “${short(x.L.m.task, 40)}”`);
        else L.push(`- ${x.it.icon || '◔'} ${x.it.title || x.it.key}: ${Progress.words(x.it)}`);
      }
    }
    const day = log.filter((e) => now() - e.at < DAY).slice(-8).reverse();
    if (day.length) { L.push('**Last 24 h**'); for (const e of day) L.push(`- ${e.icon} ${e.text} (${ago(e.at)})`); }
    return L.length ? L.join('\n') : 'All quiet: nothing runs, nothing waits for you, nothing in the last 24 h.';
  }

  // ---------- start ----------
  function boot() {
    if (typeof Native === 'undefined') return;
    Native.hooks.send.push(onSend);
    Native.hooks.event.push(onEnd);
    Native.hooks.render.push((agentId, v, chat) => { if (chat && fails.has(`reply:${chat.id}`) && document.hasFocus()) dropFail(`reply:${chat.id}`); });
    document.addEventListener('hearth:needs-you', onNeed);
    document.addEventListener('hearth:mission', onMission);
    document.addEventListener('hearth:hook-fired', onHook);
    document.addEventListener('hearth:updated', (e) => onUpdated(e.detail));
    onUpdated(store.get('update.last', null)); // it was told at start, before this group loaded
    window.Lazy?.when?.('renders', () => Renders.onChange(onRender));
    if (typeof Progress !== 'undefined') Progress.on(onProgress);
    window.hub.sync?.onStatus?.(() => onSync());
    window.hub.sync?.onAutoResolved?.((r) => { if (r?.done) remember({ icon: '⇅', text: `Sync settled ${r.done} conflict${r.done === 1 ? '' : 's'} by itself`, go: { sync: 1 } }); });
    window.hub.onConfigChanged?.(() => setTimeout(() => paint(), 80)); // the rail is rebuilt now and then: the badge goes back
    // replies already running when this loaded
    for (const a of H.agents()) {
      if (a.mode !== 'native') continue;
      const chatId = Native.pendingFor(a.id);
      if (chatId) runs.set(chatId, { agentId: a.id, chatId, title: (H.chats || []).find((c) => c.id === chatId)?.title || Native.chatOf(a.id)?.title || 'Chat', started: window.ChatLive?.state?.(chatId)?.started || now() });
    }
    if (typeof Commands !== 'undefined' && !Commands.get('whats-running')) {
      Commands.register({
        name: 'whats-running', area: 'App', args: '[text]', aliases: ['activity-all'],
        desc: 'Activity: what every chat and Hearth are doing now, what waits for you, the last 24 h (opens the panel; "text": just the words)',
        keywords: 'activity running busy stuck waiting permission plan hooks missions renders sync updates notifications',
        complete: () => [{ value: 'text', hint: 'the same, written in the chat' }],
        run: async (args) => { if (String(args || '').trim() !== 'text') open(); return summary(); },
      });
    }
    AppUI.addAction?.('Activity: what runs, what waits for you, the last 24 h', () => open());
    if (typeof Keys !== 'undefined') Keys.add({ area: 'Everywhere', keys: 'Right-click ◉ (bottom of the rail)', what: 'Activity: stop all replies, desktop notifications on / off, clear the history' });
    paint();
    arm();
  }
  boot();

  return { open, close, summary, running, waiting, history: () => log.slice(), notify, go,
    _test: { sent, away: (v) => { forceAway = v; }, gap: (ms) => { lastNote = now() - NOTE_GAP + (ms || 0); }, tick, paint, armed: () => Boolean(tickT) } };
})();
window.Activity = Activity;
