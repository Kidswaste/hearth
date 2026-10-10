// Round 13 (speed): the owner's habits make the app faster. "Help my workflow get faster and hide things I never use."
// This file keeps the small local record the other speed-*.js files read (data/kv/speed.json; nothing leaves the
// computer, nothing reaches the engines, no tokens):
//   - stats per thing you use (a command, a button, a shortcut, a tool you open): how often, how lately, where (the
//     Lab, Video Review, a chat…) and at what time of day. score(key) turns that into one number, so the "/" menu,
//     Ctrl/⌘+K, the command bar and the Commands page can put what you actually use here, now, first (speed-rank.js).
//   - your recent actions (commands with their arguments, buttons you clicked), for Again (Ctrl/⌘+.: the last one
//     again, same arguments) and the recent actions menu (Ctrl/⌘+Shift+.).
// Nothing polls and nothing runs per frame: everything is counted when you act, and saved a few seconds later.
//   Speed.score(key, place?) · Speed.again() · Speed.recent() · Speed.onAction(fn) · Speed.press(key) · Speed.place()
const Speed = (() => {
  const KV = 'speed';
  const DAY = 864e5;
  const MAX_STATS = 900; const MAX_RECENT = 30;
  const TOD = ['night', 'morning', 'afternoon', 'evening'];
  const todOf = (d = new Date()) => { const h = d.getHours(); return h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3; };
  let data = { v: 1, stats: {}, recent: [] };
  let loaded = false;
  const pending = []; // things done before the record was read back (replayed onto it)
  const save = debounce(() => { if (loaded) window.hub.kvSet(KV, data); }, 4000);
  const listeners = new Set();
  window.hub.kvGet(KV, null).then((d) => {
    if (d && typeof d === 'object' && d.stats) data = { v: 1, recent: [], ...d };
    loaded = true;
    for (const fn of pending.splice(0)) fn();
  }).catch(() => { loaded = true; });
  const whenLoaded = (fn) => { if (loaded) fn(); else pending.push(fn); };

  // where you are: 'chat' or the visible tool's id ('three', 'ae', 'board', 'commands'…)
  function place() { try { return Commands.place().id; } catch { return 'chat'; } }
  const placeLabel = (id) => { if (!id || id === 'chat') return 'Chat'; try { return Tools.get?.(id)?.name || id; } catch { return id; } };

  // ---------- stats ----------
  function count(key, where = place()) {
    if (!key) return;
    whenLoaded(() => {
      const s = (data.stats[key] ||= { n: 0, last: 0, at: {}, tod: [0, 0, 0, 0] });
      s.n += 1; s.last = Date.now();
      s.at[where] = (s.at[where] || 0) + 1;
      s.tod[todOf()] += 1;
      const keys = Object.keys(data.stats);
      if (keys.length > MAX_STATS) {
        // the least used and oldest go first
        const worth = (k) => Math.log2(1 + data.stats[k].n) - (Date.now() - data.stats[k].last) / (14 * DAY);
        keys.sort((a, b) => worth(a) - worth(b)).slice(0, keys.length - MAX_STATS).forEach((k) => delete data.stats[k]);
      }
      save();
    });
  }
  // how much you reach for this, here, at this time of day: frequency (log), recency (fades over a couple of days),
  // the share of its uses made where you are now, the share made at this time of day. 0 = never used.
  function score(key, where = place(), now = Date.now()) {
    const s = data.stats[key];
    if (!s || !s.n) return 0;
    const freq = Math.log2(1 + s.n);
    const rec = 3 * Math.exp(-(now - s.last) / (2 * DAY));
    const here = where ? 2.5 * ((s.at[where] || 0) / s.n) : 0;
    const time = 1.2 * ((s.tod[todOf(new Date(now))] || 0) / s.n);
    return freq + rec + here + time;
  }
  const stat = (key) => data.stats[key] || null;
  const cmdKey = (name) => `Chat command › /${name}`;

  // ---------- recent actions ----------
  // { kind: 'cmd' | 'click' | 'open', key, line (a command, with its arguments), label, place, agentId, t, x (times in a row) }
  // Commands that look at things or manage these lists are not "actions" (Again would loop on them).
  const META = new Set(['again', 'repeat', 'help', 'what', 'how', 'habits', 'resume', 'macro', 'cmd-history', 'customise', 'stars', 'star', 'timers', 'discover', 'where', 'cmd-stats', 'undo-report', 'keys', 'click', 'cmdbar', 'commands', 'flows', 'tucked', 'calm', 'reveal', 'do']);
  // never repeated by Again or put in a learned shortcut: anything that deletes, closes, sends or stops
  const DANGER = /\b(delete|remove|forget|clear|reset|discard|wipe|erase|quit|close|stop|send|unalias|uninstall|sign out|log out|trash|empty)\b|^[×✕]$/i;
  const NOT_HERE = '#rail, #panel, .palette, .keys-sheet, dialog, .composer, .speed-card, #toasts, .cmdbar, .cmdbar-out, [data-no-usage], #menu, #menu-fly, .mb-menu, .ui-modal, .msg, .native-head';
  let seq = 0; // actions this session (speed-learn.js counts sequences with it)
  function push(a) {
    whenLoaded(() => {
      const head = data.recent[0];
      const same = head && head.kind === a.kind && (head.line || head.key) === (a.line || a.key) && a.t - head.t < 10 * 60e3;
      if (same) { head.x = (head.x || 1) + 1; head.t = a.t; } else data.recent.unshift({ ...a, x: 1 });
      data.recent.length = Math.min(data.recent.length, MAX_RECENT);
      save();
    });
    seq += 1;
    for (const fn of listeners) { try { fn(a, seq); } catch (err) { console.warn(err); } }
  }
  const repeatable = (a) => a && (a.kind === 'cmd' || a.kind === 'click') && !DANGER.test(a.label || '') && !(a.kind === 'cmd' && DANGER.test((a.line || '').split(/\s/)[0].slice(1).replace(/-/g, ' ')));
  const lastAction = () => data.recent.find(repeatable) || null;

  // commands you ran (not the steps of a chain or macro, not timers)
  if (typeof Commands !== 'undefined' && Commands.onRun) {
    Commands.onRun(({ line, def, ok, source, place: where, agentId, nested }) => {
      if (!ok || nested || source === 'timer' || !def || META.has(def.name)) return;
      push({ kind: 'cmd', key: cmdKey(def.name), line: String(line).trim(), label: String(line).trim(), place: where || place(), agentId, source: source === 'again' ? 'bar' : source, t: Date.now() });
    });
  }
  // everything Usage counts (clicks, shortcuts, palette picks, opened tools, commands) feeds the stats
  if (typeof Usage !== 'undefined' && Usage.onTrack) Usage.onTrack((key) => count(key));
  // buttons you clicked yourself (a replay by Again or a macro is not trusted, so it doesn't count twice)
  const CLICKABLE = 'button, [role=button]';
  document.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    const node = e.target.closest?.(CLICKABLE);
    if (!node || node.disabled || node.closest(NOT_HERE)) return;
    const key = typeof Usage !== 'undefined' && Usage.keyOf?.(node);
    if (!key) return;
    const label = key.split(' › ').pop();
    if (!label || label.length < 2 || DANGER.test(label) || DANGER.test(node.title || '')) return;
    push({ kind: 'click', key, label, place: place(), t: Date.now() });
  }, true);
  // tools you open (for learned sequences: "open the Lab → 9:16 → shuffle → save")
  document.addEventListener('hearth:activate', (e) => {
    const id = e.detail?.surfaceId || e.detail?.id || '';
    if (!String(id).startsWith('tool:')) return;
    const head = data.recent[0];
    if (head?.kind === 'open' && head.key === `Open › ${id}`) return;
    push({ kind: 'open', key: `Open › ${id}`, label: `Open ${placeLabel(id.slice(5))}`, place: id.slice(5), t: Date.now() });
  });

  // ---------- doing an action again ----------
  const visible = (n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0;
  // a button by its Usage name ("Sliders › Shuffle"), on screen now: the visible tool first, then the whole window
  function findButton(key) {
    if (typeof Usage === 'undefined' || !Usage.keyOf) return null;
    const roots = [document.querySelector('.surface.active'), document.body].filter(Boolean);
    for (const r of roots) for (const b of r.querySelectorAll(CLICKABLE)) if (!b.disabled && !b.closest('#menu, .palette, .keys-sheet, .speed-card') && Usage.keyOf(b) === key && visible(b)) return b;
    return null;
  }
  // press a button by name; "Open › tool:three" opens that tool. Opens the tool it was used in when it's not on screen.
  async function press(key, where = null) {
    if (String(key).startsWith('Open › ')) { activate(key.slice(7)); return true; }
    let b = findButton(key);
    if (!b && where && where !== 'chat' && where !== place()) {
      activate(`tool:${where}`);
      for (let i = 0; i < 12 && !b; i += 1) { await new Promise((r) => setTimeout(r, 150)); b = findButton(key); }
    }
    if (!b) return false;
    b.click();
    b.classList.remove('speed-flash'); void b.offsetWidth; b.classList.add('speed-flash');
    setTimeout(() => b.classList.remove('speed-flash'), 700);
    return true;
  }
  const toastSay = (t) => { const x = String(t ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim(); if (x) toast(x.length > 220 ? `${x.slice(0, 219)}…` : x, { timeout: 2600 }); };
  async function redo(a, { quiet = false } = {}) {
    if (!a) return false;
    if (a.kind === 'cmd') {
      const agentId = (a.agentId && H.agent(a.agentId)) ? a.agentId : H.claudeAgent()?.id;
      // typed in a chat: its output goes there again; from the bar, a key or a button: a short note
      await Commands.tryRun(a.line, agentId, null, a.source === 'chat' ? { source: 'again' } : { source: 'again', say: toastSay, note: toastSay });
      return true;
    }
    const ok = await press(a.key, a.place);
    if (!ok && !quiet) toast(`“${a.label}” isn't on screen here (it was in ${placeLabel(a.place)})`, { timeout: 2600 });
    return ok;
  }
  // Again (Ctrl/⌘+.): the last command (same arguments) or the last button, once more
  async function again(times = 1) {
    const a = lastAction();
    if (!a) { toast('Nothing to repeat yet: run a command or click a button, then Ctrl+. does it again', { timeout: 2600 }); return false; }
    let ok = false;
    for (let i = 0; i < Math.min(Math.max(times, 1), 20); i += 1) ok = (await redo(a, { quiet: i > 0 })) || ok;
    if (ok && times > 1) toast(`↻ ${a.label} ×${times}`, { timeout: 1400 });
    return ok;
  }
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'now' : s < 3600 ? `${Math.round(s / 60)} min` : s < DAY / 1000 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`; };
  // the recent actions as menu items (Ctrl/⌘+Shift+., the keys button's right-click, /again list)
  function recentItems(n = 8) {
    const list = data.recent.filter(repeatable).slice(0, n);
    if (!list.length) return [{ label: 'Nothing yet: your commands and clicks show here', disabled: true, action: () => {} }];
    return list.map((a, i) => ({ label: `${i === 0 ? '↻ ' : ''}${a.label}${a.x > 1 ? ` ×${a.x}` : ''}`, hint: i === 0 ? Commands.keyText('Ctrl+.') : `${placeLabel(a.place)} · ${ago(a.t)}`, action: () => redo(a) }));
  }
  function recentMenu(x, y) {
    const btn = document.getElementById('keys-btn');
    const r = btn?.getBoundingClientRect();
    showMenu(x ?? (r ? r.right + 6 : 80), y ?? (r ? r.top - 220 : innerHeight - 300), ['Recent actions', ...recentItems(10)]);
  }

  // ---------- keys ----------
  // Ctrl/⌘+. arrives from main.js (so it works while the Lab picture has the keyboard); a key event in the page (the keys
  // sheet pressing it) lands here
  window.hub.onShortcut?.((s) => { if (s?.key === '.') { if (s.shift) recentMenu(); else again(); } });
  addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.code !== 'Period' || e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation();
    if (e.shiftKey) recentMenu(); else again();
  });
  try {
    Keys.add(
      { area: 'Everywhere', keys: 'Ctrl+.', what: 'Again: your last command (same arguments) or button, once more', run: () => again() },
      { area: 'Everywhere', keys: 'Ctrl+Shift+.', what: 'Your recent actions (click one to do it again)', run: () => recentMenu() },
    );
  } catch { /* keys.js not loaded */ }

  // ---------- commands ----------
  function register() {
    if (typeof Commands === 'undefined') return;
    // /again shares its name with /retry's alias: after a command or a click (in the last half hour, outside a plain
    // chat) it repeats that; in a chat with nothing else done it still writes the last reply again
    const fresh = () => { const a = lastAction(); return a && Date.now() - a.t < 30 * 60e3 ? a : null; };
    const againDef = {
      name: 'again', area: 'App', args: '[n | list]', whenLabel: 'after a command or a click',
      when: (ctx, args) => /^(list|\d+)$/i.test(String(args || '').trim()) || (['bar', 'code', 'again', 'timer'].includes(ctx?.source) && Boolean(lastAction())) || Boolean(fresh() && (fresh().place !== 'chat' || ctx?.place !== 'chat')),
      desc: 'Repeat your last action: the last command with the same arguments, or the last button you clicked (Ctrl/⌘+.); /again 3 three times; /again list: your recent actions',
      keywords: 'repeat redo last action same again do it again', examples: ['/again', '/again 3', '/again list'], keys: 'Ctrl+.',
      complete: () => [{ value: 'list', hint: 'your recent actions' }, { value: '3', hint: 'three times' }],
      run: async (args, ctx) => {
        const a = String(args || '').trim();
        if (/^list$/i.test(a)) {
          const list = data.recent.filter(repeatable).slice(0, 10);
          if (!list.length) return 'No actions yet: your commands and button clicks show here (Ctrl/⌘+Shift+. opens the same list).';
          if (ctx?.note) { ctx.note(`**Recent actions** (newest first · Ctrl/⌘+. repeats the first)\n${list.map((x, i) => `${i + 1}. ${x.kind === 'cmd' ? `\`${x.line}\`` : `“${x.label}”`}${x.x > 1 ? ` ×${x.x}` : ''} · ${placeLabel(x.place)} · ${ago(x.t)}`).join('\n')}`, { id: 'speed-recent', actions: list.slice(0, 5).map((x, i) => ({ label: `↻ ${i + 1}`, run: () => redo(x) })) }); return undefined; }
          return list.map((x, i) => `${i + 1}. ${x.label}`).join('\n');
        }
        const ok = await again(Number(a) || 1);
        return ok ? null : undefined;
      },
    };
    const prev = Commands.get('again');
    if (!prev || prev.name !== 'again') Commands.register(againDef);
    if (!Commands.get('click')) {
      Commands.register({
        name: 'click', area: 'App', args: '<Area › Button>', desc: 'Press a button by its name, the way Again and your learned shortcuts do (“Sliders › Shuffle”, “Open › tool:three” opens a tool)',
        keywords: 'press button tap macro step', examples: ['/click Sliders › Shuffle', '/click Open › tool:three'],
        complete: (a) => {
          const q = String(a || '').toLowerCase();
          return Object.entries(data.stats).filter(([k]) => !/^(Chat command|Shortcut|Command palette|Agent tool) › /.test(k) && (!q || k.toLowerCase().includes(q))).sort((x, y) => y[1].n - x[1].n).slice(0, 12).map(([k, s]) => ({ value: k, hint: `${s.n}×` }));
        },
        run: async (args) => {
          const key = String(args || '').trim().replace(/\s*>\s*/g, ' › ');
          if (!key.includes(' › ')) return 'Name the button as “Area › Label”, e.g. `/click Sliders › Shuffle` (`/habits` lists what you use).';
          const where = Object.entries(data.stats[key]?.at || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
          const ok = await press(key, where);
          if (!ok) throw new Error(`“${key.split(' › ').pop()}” is not on screen here`);
          return null;
        },
      });
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();
  queueMicrotask(() => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Again: repeat your last action', () => again(), 'Ctrl+.');
    AppUI.addAction('Recent actions…', () => recentMenu(), 'Ctrl+Shift+.');
  });

  return {
    score, stat, count, cmdKey, place, placeLabel, TOD, todOf, again, redo, press, findButton, recentItems, recentMenu, lastAction, repeatable, ago,
    onAction: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    recent: () => data.recent.slice(), get data() { return data; }, whenLoaded, save, DANGER, META,
  };
})();
