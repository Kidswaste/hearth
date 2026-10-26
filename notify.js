// (round 44, notify) "Tell me when…": when you're in another app, Hearth tells you the right things, natively, without
// nagging. The window's side: which events notify (the switches, notify-core.js), the words' facts (who, which chat),
// and where a click goes (the chat, the waiting card, the renders, the update). Shown by the main process
// (notifymain.js: Electron's own notifications, one per chat at a time, a burst summed up, Focus / Do Not Disturb kept).
//   Notify.send(ev)        ev = { type: reply · back · render · job · keepgoing · permission · question · plan · stuck ·
//                          sync · update, agentId, chatId, ms, text, file, failed, why, … } → { shown, why }
//   Notify.update(status)  an update is ready (once per new set of changes)
//   Notify.route(go)       what a click does (also from the main process: notify:go)
// The ways in: Settings › Advanced › Tell me when… (five switches + the old "Desktop notifications" master), Ctrl/⌘+K
// ("Tell me when…"), /notify-when. Every permission card and question card ('hearth:needs-you') notifies by itself while
// you're away, and its notification goes when you answer it. A permission's "Allow…" only OPENS the card (focused on the
// card, not on its Allow button): nothing is ever approved from a notification. 0 tokens: nothing reaches any prompt.
const Notify = (() => {
  const C = NotifyCore;
  const sent = []; // (checks) what was asked of it and what came of it, newest last
  const cards = new Map(); // card id → WeakRef(node)
  const shownGroups = new Set(); // groups shown since you last looked (so "seen" is told only when it matters)
  let cardN = 0;
  const api = () => window.hub?.notify || null;
  const settings = () => (typeof H !== 'undefined' && H.settings ? H.settings() : {});
  const agentName = (id) => (typeof H !== 'undefined' && id ? H.agent(id)?.name : '') || '';
  const chatTitle = (agentId, chatId) => {
    if (!chatId || typeof H === 'undefined') return '';
    const c = (H.chats || []).find((x) => x.id === chatId) || (typeof Native !== 'undefined' ? Native.chatOf?.(agentId) : null);
    return c?.id === chatId ? c.title || '' : '';
  };
  const record = (ev, r) => { sent.push({ type: ev.type, title: ev.title || '', at: Date.now(), ...r }); if (sent.length > 60) sent.shift(); return r; };

  async function send(ev = {}) {
    const d = C.decide(ev, { settings: settings(), focused: false }); // focus: the main process knows best
    if (!d.show) return record(ev, { shown: false, why: d.why });
    // a 🔁 Keep going round's reply: the routine's own notification speaks for it (the Keep going switch)
    if (ev.type === 'reply' && !ev.failed && ev.chatId && window.Routines?.forChat?.(ev.chatId)) return record(ev, { shown: false, why: 'routine' });
    const full = { ...ev, agent: ev.agent || agentName(ev.agentId) || undefined, chatTitle: ev.chatTitle || chatTitle(ev.agentId, ev.chatId) || undefined };
    if (!api()) return record(ev, { shown: false, why: 'no-main' });
    try {
      const r = await api().send(full);
      if (r?.shown) shownGroups.add(r.group);
      return record(ev, r || { shown: false, why: 'no answer' });
    } catch (err) { return record(ev, { shown: false, why: err.message }); }
  }
  // the chat / card was looked at in Hearth: its notification leaves the OS's centre
  function seen(group) {
    if (!shownGroups.delete(group)) return;
    api()?.seen?.(group).catch?.(() => {});
  }

  // ---------- where a click goes ----------
  function openChat(agentId, chatId) {
    if (typeof H === 'undefined' || !H.agent(agentId)) { toast('That AI is gone.', { timeout: 2000 }); return false; }
    document.querySelector('.lab-focus-exit')?.click?.(); // a docked chat hidden by the Lab's focus mode
    try { activate(H.surfaceIdFor ? H.surfaceIdFor(agentId) : agentId); } catch { /* the rail */ }
    if (chatId) Native.open(agentId, chatId);
    return true;
  }
  // the waiting card: in view, lit, focused ON THE CARD (its Allow button is never focused or pressed from here)
  function openCard(go) {
    if (go.chat) openChat(go.chat[0], go.chat[1]);
    const find = () => { const n = go.card ? cards.get(go.card)?.deref?.() : null; return n && n.isConnected ? n : null; };
    const light = (n) => {
      if (n.classList.contains('answered')) return;
      n.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '-1');
      n.focus({ preventScroll: true });
      try { n.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 420, iterations: 3, easing: 'ease-out' }); } catch { /* fine */ } // lit (opacity only: compositor)
    };
    const n = find();
    if (n) { requestAnimationFrame(() => light(n)); return true; }
    let tries = 0; // the chat is drawing: the card joins it in a moment
    const t = setInterval(() => { const m = find(); if (m || ++tries > 20) { clearInterval(t); if (m) light(m); } }, 100);
    return false;
  }
  function route(go) {
    if (!go) return null;
    try {
      if ('card' in go) return openCard(go);
      if (go.chat) { openChat(go.chat[0], go.chat[1]); return 'chat'; }
      if (go.file) { window.hub.fs.reveal(go.file); return 'file'; }
      if (go.renders) { (window.Lazy ? Lazy.load('renders') : Promise.resolve()).then(() => Renders.open()).catch(() => {}); return 'renders'; }
      if (go.sync) { Sync.conflicts(); return 'sync'; }
      if (go.update) { Updater.dialog(); return 'update'; }
      if (go.leave) { const k = go.leave.key, o = go.leave.op; if (o === 'snooze' || o === 'dismiss') { window.hub.leave.op({ op: o, key: k }).catch(() => {}); return o; } Lazy.load('leavesoon').then(() => LeaveSoon.showOnMap(k)).catch((err) => toast(calmError(err), { type: 'error' })); return 'leave'; } // (round 68, leavesoon68) ⏰ Show on map / Snooze 10 min / Dismiss
      if (go.activity) { (window.Lazy ? Lazy.load('activity') : Promise.resolve()).then(() => Activity.open()).catch(() => {}); return 'activity'; }
    } catch (err) { toast(err.message, { type: 'error' }); }
    return null;
  }

  // ---------- an AI waits for you: a permission card or a question ----------
  function onNeed(e) {
    const d = e.detail || {};
    if (!d.node || (d.kind !== 'permission' && d.kind !== 'question')) return;
    const id = `c${(cardN += 1)}`;
    cards.set(id, new WeakRef(d.node));
    const group = d.chatId ? `chat:${d.chatId}` : `card:${id}`;
    send({ type: d.kind, agentId: d.agentId, chatId: d.chatId, agent: d.who, text: d.text, card: id, group });
    // answered (or timed out): its notification goes
    try {
      const mo = new MutationObserver(() => { if (d.node.classList.contains('answered')) { mo.disconnect(); cards.delete(id); seen(group); } });
      mo.observe(d.node, { attributes: true, attributeFilter: ['class'] });
    } catch { /* fine */ }
  }

  // ---------- an update is ready (told once per new set of changes) ----------
  function update(s) {
    if (!s?.ok || !s.behind) return null;
    const key = `${s.behind}:${s.commits?.[0]?.hash || s.commits?.[0]?.subject || s.head || ''}`;
    let was = ''; try { was = store.get('notify.update', ''); } catch { /* none */ }
    if (was === key) return null;
    try { store.set('notify.update', key); } catch { /* fine */ }
    const what = s.notes?.length ? `What's new: ${s.notes.map((n) => `round ${n.round}`).slice(0, 3).join(', ')}` : s.commits?.[0]?.subject ? `${s.behind} new change${s.behind === 1 ? '' : 's'}: ${s.commits[0].subject}` : '';
    return send({ type: 'update', n: s.behind, text: what ? `${what} · nothing installs without your click` : '' });
  }

  // ---------- the switches (Settings › Advanced › Tell me when…, /notify-when) ----------
  async function setSwitch(id, on) {
    if (id === 'all') H.config.settings = { ...H.settings(), notify: on };
    else H.config.settings = { ...H.settings(), notifyWhen: { ...(H.settings().notifyWhen || {}), [id]: on } };
    await saveConfig();
    return C.summary(H.settings());
  }
  async function openSettings() {
    await AppUI.openSettings();
    const dlg = document.querySelector('dialog.settings-dialog[open]');
    const f = dlg?.querySelector('details[data-fold="notify"]');
    if (!f) return false;
    const adv = f.closest('details.sc-adv'); if (adv) adv.open = true;
    f.open = true;
    requestAnimationFrame(() => f.scrollIntoView({ block: 'center' }));
    return true;
  }

  function boot() {
    document.addEventListener('hearth:needs-you', onNeed);
    api()?.onGo?.((m) => route(m?.go || null));
    // (round 62, showprep62) a show's "on the day" reminder (showprepmain.js times it): a desktop notification while
    // you're elsewhere, a toast when Hearth is in front
    window.hub?.shows?.onRemind?.(async (r) => { if (!r?.title) return; const out = await send({ type: 'reminder', title: r.title, body: r.body || '', group: `show:${r.key}` }); if (!out.shown && out.why !== 'off' && typeof toast === 'function') toast(`${r.title}${r.body ? ` — ${r.body}` : ''}`, { timeout: 12000 }); });
    // (round 68, leavesoon68) ⏰ "Leave in 10 min for …" (leavesoonmain.js times it, even with Hearth in the tray): Show on map
    // (a click on it) · Snooze 10 min · Dismiss (both without bringing Hearth up); a toast when Hearth is in front. A
    // reminder missed while Hearth was closed isn't rung late: it's said once here, at start.
    window.hub?.leave?.onDue?.(async (r) => {
      if (!r?.key || !r.title) return;
      const acts = [{ text: 'Show on map', go: { leave: { key: r.key, op: 'map' } } }, { text: 'Snooze 10 min', go: { leave: { key: r.key, op: 'snooze' }, quiet: 1 } }, { text: 'Dismiss', go: { leave: { key: r.key, op: 'dismiss' }, quiet: 1 } }];
      const out = await send({ type: 'reminder', title: r.title, body: r.body || '', group: `leave:${r.key}`, actions: acts });
      if (!out.shown && typeof toast === 'function') toast(`${r.title}`, { timeout: 15000, action: { label: 'Show on map', fn: () => route(acts[0].go) } });
    });
    setTimeout(() => window.hub?.leave?.op?.({ op: 'missed' }).then((r) => { if (r?.ok && r.value?.length) Lazy.load('leavesoon').then(() => LeaveSoon.sayMissed(r.value)).catch(() => {}); }).catch(() => {}), 4000);
    // looking at a chat clears its notification (only when one was shown)
    addEventListener('hearth:view', () => { if (!shownGroups.size || typeof H === 'undefined') return; for (const id of Object.values(H.activeChat || {})) if (id) seen(`chat:${id}`); });
    window.hub?.onWindowFocus?.((f) => { if (f && shownGroups.has('summary')) seen('summary'); });
    if (typeof Commands !== 'undefined' && !Commands.get('notify-when')) {
      const ids = ['all', ...C.IDS];
      Commands.register({
        name: 'notify-when', area: 'App', args: '[replies | renders | keepgoing | needs | updates | all] [on | off]', aliases: ['tell-me-when'],
        desc: 'Tell me when…: which desktop notifications Hearth shows while you are in another app (no argument: where they stand)',
        keywords: 'notifications notify alert desktop toast away focus do not disturb replies renders keep going permission updates',
        complete: (a) => (String(a || '').trim().split(/\s+/).length > 1 ? ['on', 'off'] : ids).map((v) => ({ value: v, hint: v === 'all' ? 'every desktop notification' : C.SWITCHES.find((s) => s.id === v)?.tip || '' })),
        run: async (args) => {
          const [id, val] = String(args || '').trim().toLowerCase().split(/\s+/);
          if (!id) return `Tell me when…: ${C.summary(H.settings())}. Change it in Settings › Advanced › Tell me when…`;
          const key = id === 'keep' || id === 'keep-going' ? 'keepgoing' : id === 'me' || id === 'permissions' ? 'needs' : id;
          if (!ids.includes(key)) return `Pick one of: ${ids.join(', ')}.`;
          const cur = key === 'all' ? C.prefs(H.settings()).on : C.prefs(H.settings())[key];
          const on = val === 'on' ? true : val === 'off' ? false : !cur;
          return `Tell me when…: ${await setSwitch(key, on)}.`;
        },
      });
    }
    AppUI.addAction?.('Tell me when…: which desktop notifications show while you are in another app', () => openSettings());
  }
  boot();

  return { send, seen, route, update, setSwitch, openSettings, core: C, _test: { sent, cards, shownGroups, onNeed } };
})();
window.Notify = Notify;
