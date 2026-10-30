// 🤫 One hint at a time (round 38, hintcalm). Rounds 26–37 each brought a small note that shows by itself (the ✦ card,
// the update toast, What's new, the welcome on a new computer, the full-screen and look-around hints, 🩺, ◧'s chip,
// the cache and Continue lighter lines, the ffmpeg note, the pick-up card…). After an update several came at once,
// sometimes over the work. Every optional one now goes through this queue:
//   · at most one on screen at a time (cards, chips, toasts that came by themselves; a card you opened counts too)
//   · never while you type (4 s after the last key in a text box), drag, a reply streams, a dialog / menu / AI setup is
//     open, or Hearth is in the background; never in the first seconds after it opens
//   · what fits where you are first (a Lab hint waits for the Lab; "any" hints show anywhere), then by rank
//   · at most one new tip every 3 minutes; a tip that waited too long is dropped (not remembered: it can come again)
//   · remembered on this computer once shown (or dismissed): store hints.seen
//   · Settings › Updates & what's new › Updates and tips › "Don't show tips" (store hints.off, /hints off) silences every optional tip at once
// Kinds: 'tip' (the default: all of the above), 'notice' (about this copy: the update note, your fixed reports, the welcome
// on a new computer: queued and one at a time, first after an update, but not silenced and not rate-limited),
// 'inline' (a line inside a chat or a panel: waits while you type or a reply streams, silenced by Don't show tips;
// it never covers anything, so it doesn't count as "on screen" and an open dialog doesn't hold it), 'chip' (a small
// control that comes back after each change, like ◧ Before / after:
// one at a time and never while busy, but neither remembered nor rate-limited nor silenced).
// Essential notes (errors, refusals with their fix, offline, sign-in, usage limits) don't come here: they show at once.
// Hints.dodge(node) keeps any of them, essential included, off the chat box you're typing in and the Lab preview's
// centre (ui.js calls it for the toasts).
//   Hints.offer({ id, show, place?, rank?, kind?, once?, ttl?, still? }) → Promise<boolean> (shown or not)
//     show() returns the node it put on screen (or a promise of it; null/false = it didn't show after all)
//   Hints.essential(show) → shows at once (dodged) · Hints.off() · setOff(v) · seen(id) · forget(id?) · busy() → why ('' = calm) · flush() · state() · config(o)
const Hints = (() => {
  const OFF = 'hints.off'; const SEEN = 'hints.seen'; const LAST = 'hints.last';
  const T0 = Date.now();
  const test = () => Boolean(window.SMOKE_SAVES);
  // gap: between two tips · quiet: after the last key in a text box · start / startNotice: after Hearth opens
  // ttl: how long an offer waits · (in a test copy the gap and the start quiet are 0 unless a check sets them)
  const cfg = { gap: 3 * 60e3, quiet: 4000, start: 6000, startNotice: 1500, ttl: 10 * 60e3, tick: 700, idle: 5000 };
  let testCfg = null; // what a check set (Hints.config; in a test copy also store hints.test, read at start for the first seconds)
  const C = (k) => (testCfg && k in testCfg ? testCfg[k] : test() && (k === 'gap' || k === 'start' || k === 'startNotice') ? 0 : cfg[k]);
  const get = (k, d) => { try { return store.get(k, d); } catch { return d; } };
  const set = (k, v) => { try { store.set(k, v); } catch { /* storage is a convenience */ } };

  if (test()) testCfg = get('hints.test', null);
  const off = () => get(OFF, false) === true;
  function setOff(v) { set(OFF, Boolean(v)); if (v) { for (const q of queue.filter((x) => silenced(x))) drop(q, 'tips off'); if (cur && cur.kind === 'tip') closeCur(); } dispatchEvent(new CustomEvent('hearth:hints', { detail: { off: Boolean(v) } })); return Boolean(v); }
  const seenMap = () => get(SEEN, {}) || {};
  const seen = (id) => Boolean(seenMap()[id]);
  function mark(id) { const m = seenMap(); m[id] = Date.now(); const keys = Object.keys(m); if (keys.length > 300) for (const k of keys.sort((a, b) => m[a] - m[b]).slice(0, keys.length - 300)) delete m[k]; set(SEEN, m); }
  function forget(id) { if (id == null) set(SEEN, {}); else { const m = seenMap(); delete m[id]; set(SEEN, m); } }

  // ---------- where you are, and what you're doing ----------
  function placeNow() {
    try {
      const id = H.activeId; const a = H.agent?.(id);
      if (id === 'tool:three' || a?.dock === 'three') return 'lab';
      if (id === 'tool:board') return 'board';
      return a?.mode === 'native' ? 'chat' : 'other';
    } catch { return 'other'; }
  }
  let lastKey = 0; let down = 0; let dragging = false;
  const editable = (t) => Boolean(t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && !/^(button|checkbox|radio|range|color|file|submit|reset)$/i.test(t.type || ''))));
  addEventListener('keydown', (e) => { if (editable(e.target) && !e.ctrlKey && !e.metaKey) lastKey = Date.now(); }, true);
  addEventListener('pointerdown', () => { down = Date.now(); }, true);
  const up = () => { down = 0; dragging = false; wake(); };
  addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true); addEventListener('blur', up);
  addEventListener('dragstart', () => { dragging = true; }, true); addEventListener('dragend', up, true); addEventListener('drop', up, true);
  const streaming = () => { try { return (H.agents?.() || []).some((a) => a.mode === 'native' && Native.isAgentBusy?.(a.id)); } catch { return false; } };
  // (round 88, checkfix88) the sync panel too: the welcome note on a new computer came up over an open sync panel, its
  // "Check Claude" right where "Sync now" was (a click there opened AI setup instead)
  const OPEN = 'dialog[open], #menu:not([hidden]), .opt-sheet, .ms-pop, .tour-card, .splash, .keys-sheet:not([hidden]), .palette:not([hidden]), .sync-panel';
  // why not now ('' = calm)
  function busy() {
    if (document.hidden) return 'away';
    if (window.Power?.quietNow?.()) return 'presenting'; // (round 52)
    if (Date.now() - lastKey < C('quiet')) return 'typing';
    if (dragging || (down && Date.now() - down > 250)) return 'dragging';
    if (window.Jank?.busy?.()) return 'busy';
    if (document.querySelector(OPEN)) return 'dialog';
    if (streaming()) return 'streaming';
    return '';
  }

  // ---------- what's on screen ----------
  // a card / chip that came by itself (or one you opened: the ✦ card, a tour) is "on screen" while it's there
  const FOREIGN = '.qs-card, .speed-card:not(.out), .two-welcome, .sd-hint, .tour-card';
  const shownNode = (n) => Boolean(n && n.isConnected && !n.hidden && !n.classList?.contains('out'));
  let cur = null; // { id, kind, node, at }
  function visible() {
    if (cur && !shownNode(cur.node)) cur = null;
    return cur?.node || document.querySelector(FOREIGN) || null;
  }
  // (tips turned off while one is up: its own × closes it, so the feature hears it)
  function closeCur() { const n = cur?.node; cur = null; if (!n?.isConnected) return; const x = n.querySelector?.('.sr-x, .toast-x, .lm-x, .qs-x'); if (x) x.click(); if (n.isConnected) n.remove(); }

  // ---------- out of the way: the chat box you type in, the Lab preview's centre ----------
  const vis = (n) => Boolean(n?.isConnected && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.offsetParent));
  function zones() {
    const out = [];
    for (const c of document.querySelectorAll('.composer')) if (vis(c)) { const r = c.getBoundingClientRect(); if (r.width && r.height) out.push(r); }
    try {
      // (only once the Lab is in: touching ThreeLab before that loaded the whole Lab group while the first screen was built)
      const labIn = !window.Lazy || window.Lazy.loaded('lab');
      const h = (labIn && typeof ThreeLab !== 'undefined' && ThreeLab.stageHooks?.host) || null;
      if (h && vis(h)) {
        const fr = ThreeLab.stageHooks?.frameRect; const r = fr && fr.width ? fr : h.getBoundingClientRect();
        if (r.width && r.height) out.push({ left: r.left + r.width * 0.3, right: r.right - r.width * 0.3, top: r.top + r.height * 0.3, bottom: r.bottom - r.height * 0.3 });
      }
    } catch { /* no Lab */ }
    return out;
  }
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  // moves the node up just enough (the CSS translate property: its own entrance animation keeps its transform)
  function dodge(node) {
    if (!node?.isConnected) return 0;
    if (node.style.translate) node.style.translate = '';
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return 0;
    let dy = 0;
    for (const z of zones()) if (hit({ left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy }, z)) dy = Math.max(dy, r.bottom - z.top + 8);
    dy = Math.min(dy, Math.max(0, r.top - 8));
    if (dy > 0) node.style.translate = `0 ${-Math.round(dy)}px`;
    return dy;
  }

  // ---------- the queue ----------
  const queue = [];
  const silenced = (q) => (q.kind === 'tip' || q.kind === 'inline') && off();
  const stats = { shown: 0, dropped: 0, log: [] };
  function note(what, q, why = '') { stats.log.push({ t: Date.now(), what, id: q.id, kind: q.kind, why }); if (stats.log.length > 60) stats.log.shift(); }
  function drop(q, why) { const i = queue.indexOf(q); if (i >= 0) queue.splice(i, 1); stats.dropped += 1; note('drop', q, why); q.resolve(false); }
  function offer(spec = {}) {
    const q = { kind: 'tip', place: 'any', rank: 50, once: true, ...spec, at: Date.now() };
    if (!q.id || typeof q.show !== 'function') return Promise.resolve(false);
    if (q.kind === 'chip') q.once = false;
    if (silenced(q)) { note('silenced', q); return Promise.resolve(false); }
    if (q.once && seen(q.id)) return Promise.resolve(false);
    // the same hint offered again replaces the waiting one (the newest words / state win)
    const old = queue.find((x) => x.id === q.id);
    if (old) { queue.splice(queue.indexOf(old), 1); old.resolve(false); }
    return new Promise((resolve) => { q.resolve = resolve; queue.push(q); schedule(20); });
  }
  const fits = (q, place) => (typeof q.place === 'function' ? Boolean(q.place(place)) : q.place === 'any' || q.place === place || (Array.isArray(q.place) && q.place.includes(place)));
  const order = (place) => (a, b) => ((a.place === place ? 0 : 1) - (b.place === place ? 0 : 1)) || a.rank - b.rank || a.at - b.at;
  const lastAt = () => Number(get(LAST, 0)) || 0;
  let timer = 0; let showing = false;
  let due = 0;
  // (a sooner look replaces a later one: the slow tick while nothing fits here gives way to a place change or an offer)
  function schedule(ms = C('tick')) {
    const at = Date.now() + ms;
    if (timer && due <= at) return;
    clearTimeout(timer); due = at;
    timer = setTimeout(() => { timer = 0; pump(); }, ms);
  }
  async function show(q) {
    const i = queue.indexOf(q); if (i >= 0) queue.splice(i, 1);
    showing = true;
    let node = null;
    try { node = await q.show(); } catch (err) { console.warn('hint', q.id, err); }
    showing = false;
    if (!node) { note('nothing', q); q.resolve(false); return false; }
    if (q.once) mark(q.id);
    if (node instanceof Element) window.A11y?.say(node.textContent); // (round 40, a11y) a tip is read out, politely
    stats.shown += 1; note('show', q);
    if (q.kind !== 'inline') {
      cur = { id: q.id, kind: q.kind, node: node instanceof Element ? node : null, at: Date.now() };
      if (q.kind !== 'chip') set(LAST, Date.now());
      if (cur.node) requestAnimationFrame(() => dodge(cur?.node));
    }
    q.resolve(true);
    return true;
  }
  function pump({ force = false } = {}) {
    if (showing) { schedule(); return null; }
    const now = Date.now();
    for (const q of [...queue]) {
      if (silenced(q)) drop(q, 'tips off');
      else if (now - q.at > (q.ttl ?? C('ttl'))) drop(q, 'waited too long');
      else if (q.still) { let ok = true; try { ok = q.still() !== false; } catch { ok = false; } if (!ok) drop(q, 'no longer fits'); }
    }
    if (!queue.length) return null;
    // (round 39, powerwise) Hearth in the background: no 0.7 s look-again while away (visibilitychange looks again)
    if (document.hidden && !force) return null;
    const place = placeNow();
    const ready = queue.filter((q) => fits(q, place)).sort(order(place));
    // (round 41, smooth41) nothing waiting fits here (a Lab tip while you're in a chat): no page queries every 0.7 s;
    // moving elsewhere looks again at once (hearth:view), a slow tick still drops what waited too long
    if (!ready.length) { schedule(C('idle')); return null; }
    const why = busy();
    // a line in a chat or a panel: as soon as you aren't typing and no reply streams (it covers nothing, so an open
    // dialog or AI setup doesn't hold it: a change made there is said in the chat right away)
    const line = ready.find((q) => q.kind === 'inline');
    if (line && (force || !why || why === 'dialog' || why === 'busy')) { schedule(); show(line); return line.id; }
    if (!force && (why || visible())) { hold(why || 'card'); return null; }
    held = 0;
    const since = now - T0;
    const pick = ready.find((q) => (force || since >= (q.kind === 'tip' ? C('start') : C('startNotice'))) && (force || q.kind !== 'tip' || now - lastAt() >= C('gap')));
    // (round 44, idlecpu) only waiting for the start's calm or the gap between two tips (3 min): look again when the
    // first one is due, not every 0.7 s until then (a reply, typing or a place change look sooner)
    if (!pick) { const dueIn = Math.min(...ready.map((q) => Math.max(T0 + (q.kind === 'tip' ? C('start') : C('startNotice')), q.kind === 'tip' ? lastAt() + C('gap') : 0) - now)); schedule(Math.max(C('tick'), Math.min(dueIn + 20, C('idle')))); return null; }
    schedule(); show(pick);
    return pick.id;
  }
  // (round 92, findmem92) the way is held (you type, a dialog or the sync panel is open, a card is up, a reply streams):
  // not a look every 0.7 s until it clears (≈ 1.5 wake-ups a second) but when it should: the last key's quiet ends,
  // a click / Esc / Enter / a dialog closing (wake), else less and less often (0.7 → 1.4 → 2.8 s, then 5 s for a
  // dialog or a card, which a click or a key closes)
  let held = 0;
  function hold(why) {
    held += 1;
    if (why === 'typing') { schedule(Math.max(50, lastKey + C('quiet') - Date.now() + 20)); return; }
    schedule(Math.min(C('tick') * 2 ** Math.min(held - 1, 3), why === 'dialog' || why === 'card' ? C('idle') : C('tick') * 4));
  }
  const wake = () => { if (held && queue.length) { held = 0; schedule(60); } };
  addEventListener('keyup', (e) => { if (e.key === 'Escape' || e.key === 'Enter') wake(); }, true);
  addEventListener('close', wake, true); // (a dialog closed: 'close' doesn't bubble, it is caught on its way down)
  // an essential note (an error with its fix, sign-in, offline, a usage limit): at once, whatever the queue does, only
  // kept off what you're working on
  function essential(show) {
    let n = null;
    try { n = show(); } catch (err) { console.warn('essential note', err); }
    if (n instanceof Element) { requestAnimationFrame(() => dodge(n)); window.A11y?.say(n.textContent); }
    return n;
  }
  // (tests and "show me now") the next one that fits here, without waiting for calm, the gap or the start
  const flush = () => pump({ force: true });
  function state() {
    return { off: off(), busy: busy(), place: placeNow(), current: visible() ? (cur?.id || 'other card') : null, waiting: queue.map((q) => ({ id: q.id, kind: q.kind, place: typeof q.place === 'function' ? 'fn' : q.place, rank: q.rank, age: Date.now() - q.at })),
      last: lastAt(), gap: C('gap'), shown: stats.shown, dropped: stats.dropped, log: stats.log.slice(-20) };
  }
  // a check's settings (null: back to normal): { gap, quiet, start, startNotice, ttl, tick }
  function config(o) { testCfg = o ? { ...(testCfg || {}), ...o } : null; schedule(20); return { ...cfg, ...(testCfg || {}) }; }
  // when it calms down, look again at once (not on the next tick)
  addEventListener('hearth:busy', (e) => { if (!e.detail?.busy && queue.length) schedule(50); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && queue.length) schedule(400); });
  addEventListener('hearth:view', () => { if (queue.length) schedule(50); }); // (round 41) another place: what fits there

  // ---------- the one switch: Settings (settings-find.js), /hints, Ctrl/⌘+K ----------
  function register() {
    // (/tips is the forged tooltips' own command, look.js)
    if (typeof Commands !== 'undefined' && !Commands.get('hints')) {
      Commands.register({
        name: 'hints', area: 'App', args: '[on | off | status | reset]', aliases: Commands.get('no-tips') ? [] : ['no-tips'],
        desc: 'Tips that show by themselves (the ✦ card, What\'s new, hints, suggestion lines): on, off (Don\'t show tips), what waits, or show the ones already seen again',
        keywords: 'tips hints nudges cards suggestions notes popups toasts quiet calm don\'t show silence',
        complete: () => ['on', 'off', 'status', 'reset'].map((value) => ({ value })),
        examples: ['/hints off', '/hints on', '/hints status'],
        run: (args) => {
          const a = String(args || '').trim().toLowerCase();
          if (a === 'off') { setOff(true); return 'Tips are off: nothing shows by itself any more (errors, sign-in and offline notes still do). Each window\'s ⋯ still has its ✦ What can I do here?'; }
          if (a === 'on') { setOff(false); return 'Tips are on: one at a time, never while you type or a reply runs, at most one every few minutes.'; }
          if (a === 'reset') { forget(); set(LAST, 0); return 'The tips you already saw can show again (one at a time).'; }
          const s = state();
          return `Tips: **${s.off ? 'off' : 'on'}**${s.busy ? ` · waiting while ${s.busy === 'away' ? 'Hearth is in the background' : `you're ${s.busy === 'dialog' ? 'in a dialog' : s.busy}`}` : ''}${s.waiting.length ? ` · ${s.waiting.length} waiting (${s.waiting.map((w) => w.id).join(', ')})` : ''} · ${Object.keys(seenMap()).length} seen on this computer.`;
        },
      });
    }
    try { AppUI.addAction?.('Tips that show by themselves: on / off', () => { setOff(!off()); toast(off() ? 'Tips are off (Settings › Updates and tips brings them back)' : 'Tips are on', { timeout: 2400 }); }); } catch { /* no palette */ }
  }
  // (a defer script early in index.html: Commands and AppUI come later, so after every script)
  if (document.readyState === 'complete' || typeof Commands !== 'undefined') register(); else document.addEventListener('DOMContentLoaded', register);

  return { offer, essential, off, setOff, seen, mark, forget, busy, visible, placeNow, dodge, zones, flush, pump, state, config, get queue() { return queue.slice(); }, get current() { return visible() ? cur : null; } };
})();
window.Hints = Hints;
