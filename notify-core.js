// (round 44, notify) "Tell me when…": the pure part of Hearth's desktop notifications, shared by the window (notify.js)
// and the main process (notifymain.js), tested in Node (dev/notify-test.js). No DOM, no IPC, no Electron.
//   SWITCHES / prefs(settings)   the five switches of Settings › Advanced › Tell me when… (all on by default) + the
//                                one existing master switch (settings.notify, "Desktop notifications while I'm elsewhere")
//   switchOf(type)               which switch an event answers to
//   decide(ev, { settings, focused })   whether an event becomes a notification (and why not: off · switch · focused ·
//                                short · unknown); a reply only when it took more than ~20 s, a render more than 10 s
//   compose(ev, { platform })    its words (title, body), its group (one per chat at a time) and its actions; a
//                                permission's action OPENS the card ("Allow…"), it never answers it
//   grouper({ burst, windowMs }) one notification per group (a newer one replaces it, never stacks), and a burst (3 or
//                                more groups within 12 s) becomes ONE summary that keeps counting; an AI waiting for you
//                                is never folded into the summary (its "Allow…" must stay one click away)
// Quiet hours are the computer's own (Focus on the Mac, Do Not Disturb / Focus assist on Windows): Electron's
// notifications go through the OS's own centre, which holds them; Hearth never marks one urgent or bypasses it.
const NotifyCore = (() => {
  const REPLY_MS = 20000; // a reply shorter than this: the Dock / taskbar number is enough
  const RENDER_MS = 10000; // a render shorter than this: you were probably still watching it
  const JOB_MS = 60000; // other work with a bar (flows, captures, installs…)
  const SWITCHES = [
    { id: 'replies', label: 'Replies', tip: 'A reply that took more than 20 seconds finished, or a message that waited (no internet, a usage limit) went out' },
    { id: 'renders', label: 'Renders', tip: 'A render, a batch or ▦ All formats finished or failed (Show the file in one click)' },
    { id: 'keepgoing', label: 'Keep going', tip: 'A 🔁 Keep going round finished, or the routine paused or stopped (and why)' },
    { id: 'needs', label: 'When an AI needs me', tip: 'An AI waits for your permission or your answer, a plan waits for ▶ Go ahead, a reply looks stuck, sync needs a look' },
    { id: 'updates', label: 'Updates', tip: 'A Hearth update is ready (nothing installs without your click)' },
  ];
  const IDS = SWITCHES.map((s) => s.id);
  // event type → the switch it answers to
  const TYPE = {
    reply: 'replies', back: 'replies', limit: 'replies', // (round 48, usagelimits) limit: a usage heads-up (80 / 95 %, reset)
    render: 'renders', job: 'renders',
    keepgoing: 'keepgoing',
    permission: 'needs', question: 'needs', plan: 'needs', stuck: 'needs', sync: 'needs',
    update: 'updates',
  };
  const switchOf = (type) => TYPE[type] || null;
  // settings → { on, replies, renders, keepgoing, needs, updates } (a missing key is on)
  function prefs(settings = {}) {
    const w = (settings && typeof settings.notifyWhen === 'object' && settings.notifyWhen) || {};
    const out = { on: !settings || settings.notify !== false };
    for (const id of IDS) out[id] = w[id] !== false;
    return out;
  }
  // the fold's line in Settings: "All on" · "Replies, Renders, Updates" · "Off"
  function summary(settings) {
    const p = prefs(settings);
    if (!p.on) return 'Off';
    const on = SWITCHES.filter((s) => p[s.id]);
    if (on.length === SWITCHES.length) return 'All on: replies, renders, keep going, when an AI needs you, updates';
    if (!on.length) return 'Nothing (every switch off)';
    const words = on.map((s) => (s.id === 'needs' ? 'when an AI needs you' : s.label.toLowerCase())).join(', ');
    return `${words[0].toUpperCase()}${words.slice(1)}`;
  }

  // ---------- does it notify? ----------
  function decide(ev = {}, { settings = {}, focused = false } = {}) {
    const sw = switchOf(ev.type);
    if (!sw) return { show: false, why: 'unknown' };
    const p = prefs(settings);
    if (!p.on) return { show: false, why: 'off' };
    if (!p[sw]) return { show: false, why: 'switch', sw };
    if (focused) return { show: false, why: 'focused', sw };
    const ms = Number(ev.ms);
    if (ev.type === 'reply' && !ev.failed && Number.isFinite(ms) && ms < REPLY_MS) return { show: false, why: 'short', sw };
    if (ev.type === 'render' && !ev.failed && Number.isFinite(ms) && ms < RENDER_MS) return { show: false, why: 'short', sw };
    if (ev.type === 'job' && Number.isFinite(ms) && ms < JOB_MS) return { show: false, why: 'short', sw };
    return { show: true, sw };
  }

  // ---------- its words, group and actions ----------
  const clip = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const plain = (s) => String(s ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*`>_~|]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const secs = (ms) => { const s = Math.max(0, Math.round((Number(ms) || 0) / 1000)); return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const revealWord = (platform) => (platform === 'darwin' ? 'Show in Finder' : platform === 'win32' ? 'Show in Explorer' : 'Show the file');
  // actions: [{ text, go }]; the first is what a click on the notification itself does. go = { chat: [agentId, chatId] }
  // | { card: id, chat } | { file } | { renders: 1 } | { sync: 1 } | { update: 1 } | { activity: 1 } | null (just Hearth)
  function compose(ev = {}, { platform = 'darwin' } = {}) {
    const who = ev.agent || 'An AI';
    const where = ev.chatTitle ? `“${clip(ev.chatTitle, 60)}”` : '';
    const chat = ev.agentId && ev.chatId ? [ev.agentId, ev.chatId] : null;
    const openChat = chat ? { text: 'Open the chat', go: { chat } } : { text: 'Open Hearth', go: null };
    const group = ev.group || (ev.chatId ? `chat:${ev.chatId}` : null);
    let n;
    switch (ev.type) {
      case 'reply':
        n = ev.failed
          ? { title: `${who}'s reply failed`, body: clip(plain(ev.text).replace(/^Error:\s*/, ''), 160) || where, actions: [openChat] }
          : { title: ev.title || `${who} replied${where ? ` in ${where}` : ''}`, body: clip(plain(ev.text), 160) || `It took ${secs(ev.ms)}.`, actions: [openChat] };
        break;
      case 'back':
        n = { title: ev.reason === 'limit' ? 'Usage limit reset: your message went out' : 'Back online: your message went out', body: `To ${who}${where ? ` in ${where}` : ''}${ev.n > 1 ? ` · ${ev.n} messages` : ''}`, actions: [openChat] };
        break;
      case 'render': {
        const name = clip(base(ev.file) || ev.name || 'Render', 80);
        n = ev.failed
          ? { title: 'A render failed', body: clip(`${ev.name || name}: ${ev.why || 'failed'}`, 160), actions: [{ text: 'See why', go: { renders: 1 } }] }
          : { title: ev.title || 'Render done', body: `${name}${ev.ms >= 1000 ? ` · ${secs(ev.ms)}` : ''}`, actions: ev.file ? [{ text: revealWord(platform), go: { file: ev.file } }, { text: 'Open the renders', go: { renders: 1 } }] : [{ text: 'Open the renders', go: { renders: 1 } }] };
        return { ...n, group: ev.group || 'renders', sw: 'renders', type: ev.type };
      }
      case 'job':
        n = { title: `${clip(ev.name || 'A job', 50)} ${ev.failed ? 'failed' : 'finished'}`, body: ev.body || `It took ${secs(ev.ms)}.`, actions: [{ text: 'Open Hearth', go: { activity: 1 } }] };
        return { ...n, group: ev.group || 'jobs', sw: 'renders', type: ev.type };
      case 'keepgoing': {
        const title = ev.phase === 'round' ? `🔁 ${who}: round ${ev.n || ''}${ev.of ? ` of ${ev.of}` : ''} done`.replace(/ {2}/g, ' ')
          : ev.phase === 'pause' ? `🔁 Keep going paused in ${where || 'a chat'}`
            : `🔁 Keep going ${ev.phase === 'done' ? 'finished' : 'stopped'} in ${where || 'a chat'}`;
        const body = ev.phase === 'round' ? [ev.summary || where, ev.cost].filter(Boolean).join(' · ') /* (round 51, routinelean) its one-line summary, never the answer */ : [ev.why ? `${ev.why[0].toUpperCase()}${ev.why.slice(1)}` : '', ev.cost].filter(Boolean).join(' · ');
        n = { title, body: clip(body, 160), actions: [openChat] };
        break;
      }
      case 'permission':
        // "Allow…" OPENS the card in its chat (focused on the card, not on its Allow button); nothing is approved here
        // (access.js says "wants to delete: Delete: x": the verb once)
        n = { title: `${who} needs you`, body: clip(`Wants to ${String(ev.text || 'do something').replace(/^wants to /i, '').replace(/^([\w ]+): \1:\s*/i, '$1: ')}`, 160), actions: [{ text: 'Allow…', go: { card: ev.card || null, chat } }] };
        break;
      case 'question':
        n = { title: `${who} asks you`, body: clip(String(ev.text || '').replace(/^asks( you)?:\s*/i, ''), 160), actions: [{ text: 'Answer…', go: { card: ev.card || null, chat } }] };
        break;
      case 'plan':
        n = { title: `${who}'s plan is ready`, body: 'It waits for your ▶ Go ahead.', actions: [chat ? { text: 'See the plan', go: { chat } } : openChat] };
        break;
      case 'stuck':
        n = { title: `${who} looks stuck`, body: clip(ev.text || 'No news for a while.', 160), actions: [openChat] };
        break;
      case 'sync':
        n = { title: clip(ev.text || 'Sync needs a look', 80), body: 'Open Hearth to look at it.', actions: [{ text: 'Look at it', go: { sync: 1 } }] };
        return { ...n, group: 'sync', sw: 'needs', type: ev.type };
      case 'update':
        n = { title: 'A Hearth update is ready', body: clip(ev.text || `${ev.n || 'New'} change${ev.n === 1 ? '' : 's'}: nothing installs without your click.`, 160), actions: [{ text: 'See what\'s new…', go: { update: 1 } }] };
        return { ...n, group: 'update', sw: 'updates', type: ev.type };
      default:
        n = { title: clip(ev.title || 'Hearth', 80), body: clip(ev.body || '', 160), actions: [openChat] };
    }
    if (ev.title && ev.type !== 'reply') n.title = clip(ev.title, 90);
    if (ev.body && ev.type !== 'job') n.body = clip(ev.body, 160);
    return { ...n, group: group || ev.type || 'hearth', sw: switchOf(ev.type), type: ev.type };
  }
  // a summary of a burst: "Hearth: 4 things" + the first titles
  function summaryNote(titles) {
    const uniq = [...new Set(titles)];
    return { title: `Hearth: ${titles.length} things while you were away`, body: clip(uniq.slice(0, 4).join(' · ') + (uniq.length > 4 ? ` · +${uniq.length - 4}` : ''), 200), group: 'summary', sw: null, type: 'summary', actions: [{ text: 'Open Activity', go: { activity: 1 } }] };
  }

  // ---------- grouping: replace, never stack; a burst becomes one summary ----------
  // add(note, now) → the operations to do, in order: { op: 'close', group } · { op: 'show', note }
  // closed(group): the OS closed it / it was clicked (no longer on screen) · seen(group): you looked at it in Hearth
  const isUrgent = (n) => Boolean(n) && (n.type === 'permission' || n.type === 'question');
  function grouper({ burst = 3, windowMs = 12000 } = {}) {
    const open = new Map(); // group → note shown (still in the OS's centre as far as we know)
    let recent = []; // { group, title, at }: what was shown lately (the burst window)
    let sum = null; // { titles, until } while a burst is summed up
    const prune = (now) => { recent = recent.filter((r) => now - r.at < windowMs); if (sum && now > sum.until) sum = null; };
    function add(note, now = Date.now()) {
      prune(now);
      const ops = [];
      const urgent = isUrgent(note);
      // an AI waiting for you in this chat stays: something else about the chat goes beside it (once), not over it
      if (!urgent && open.has(note.group) && isUrgent(open.get(note.group))) note = { ...note, group: `${note.group}~` };
      const g = note.group;
      if (open.has(g)) { ops.push({ op: 'close', group: g }); open.delete(g); }
      if (!urgent && sum) {
        // already summing up: the summary counts one more (replaced, not stacked)
        sum.titles.push(note.title); sum.until = now + windowMs;
        recent.push({ group: g, title: note.title, at: now });
        const s = summaryNote(sum.titles);
        if (open.has('summary')) ops.push({ op: 'close', group: 'summary' });
        open.set('summary', s); ops.push({ op: 'show', note: s });
        return ops;
      }
      const others = new Set(recent.filter((r) => r.group !== g && !String(r.group).startsWith('!')).map((r) => r.group));
      if (!urgent && others.size + 1 >= burst) {
        // a burst: what this window showed goes, one summary stands for all of it
        const titles = [...recent.filter((r) => !String(r.group).startsWith('!')).map((r) => r.title), note.title];
        for (const og of others) if (open.has(og) && open.get(og).sw !== 'needs') { ops.push({ op: 'close', group: og }); open.delete(og); }
        sum = { titles, until: now + windowMs };
        recent.push({ group: g, title: note.title, at: now });
        const s = summaryNote(titles);
        open.set('summary', s); ops.push({ op: 'show', note: s });
        return ops;
      }
      recent.push({ group: urgent ? `!${g}` : g, title: note.title, at: now });
      open.set(g, note); ops.push({ op: 'show', note });
      return ops;
    }
    const closed = (group) => { open.delete(group); };
    const seen = (group) => [group, `${group}~`].filter((g) => open.has(g)).map((g) => { open.delete(g); return { op: 'close', group: g }; });
    return { add, closed, seen, open: () => [...open.keys()], get summing() { return Boolean(sum); } };
  }

  return { SWITCHES, IDS, TYPE, REPLY_MS, RENDER_MS, JOB_MS, switchOf, prefs, summary, decide, compose, summaryNote, grouper, clip, plain, revealWord };
})();
if (typeof module !== 'undefined') module.exports = NotifyCore;
