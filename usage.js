// What you actually use: counts clicks on buttons / menu items / palette actions, shortcuts, opened tools
// and agents' tool calls, all locally in data/kv/ui-usage.json. The counts drive how important buttons
// look (often used = highlighted, unused for weeks = faded), and "Your usage" lists what you never touch,
// with a way to hide it. Nothing leaves the PC.
const Usage = (() => {
  const KV = 'ui-usage';
  // { since, items: { key: { n, first, last, label, area } }, days: { 'YYYY-MM-DD': clicks }, hidden: [keys],
  //   dayItems: { 'YYYY-MM-DD': { key: clicks } } (last 35 days, for "used today" and streaks in the meter) }
  let data = null;
  const listeners = new Set(); // called after every counted use (the token meter shows today's total live)
  // (round 73, chatsteady73) saved by what changed, once a minute (and when the window hides or closes): the whole
  // store (≈ 900 KB after a year) went over IPC 3 s after every click, ≈ 70 ms of the window's thread each time.
  // Every change is noted as [op, path, value] (store.js mergeKV applies them to the file); the counts recorded are
  // exactly the same. When the main side can't apply them (no file yet, an unreadable one) the store goes whole.
  let ops = []; const opAt = new Map(); let whole = false; let saveT = 0; let saving = null;
  const note = (op, path, v) => {
    const k = `${op}\u0001${path.join('\u0001')}`; const i = opAt.get(k);
    if (i != null && (op === 'inc' || op === 'max' || op === 'set')) { const o = ops[i]; o[2] = op === 'inc' ? o[2] + v : op === 'max' ? Math.max(o[2], v) : v; return; }
    if (op === 'inc' || op === 'max' || op === 'set') opAt.set(k, ops.length);
    ops.push([op, path, v]);
  };
  function flush() {
    clearTimeout(saveT); saveT = 0;
    if (!data || (!ops.length && !whole)) return saving;
    const batch = ops; const all = whole; ops = []; opAt.clear(); whole = false;
    const full = () => window.hub.kvSet(KV, data);
    const go = () => (all || !window.hub.kvMerge ? full() : window.hub.kvMerge(KV, batch).then((r) => (r?.ok ? r : full())));
    // (sent at once, even while the last one is on its way: the main side applies them in order)
    const p = go().catch((err) => { console.warn('usage save', err); }).finally(() => { if (saving === p) saving = null; });
    saving = p;
    return p;
  }
  const save = () => { if (!saveT) saveT = setTimeout(flush, 60000); };
  const DAY = 86400000;
  // local day (the token meter counts days the same way)
  const today = () => new Date().toLocaleDateString('en-CA');
  const KEEP_DAY_ITEMS = 35;

  // Where a control lives, from its nearest known container.
  const AREAS = [
    ['.three-toolbar', 'Lab toolbar'], ['.media-bar', 'Timeline'], ['.tweaks', 'Sliders'], ['.ly-panel, .layers-panel', 'Layers'],
    ['.three-console-wrap', 'Console'], ['.refs-dialog', 'References'], ['.sb-dialog', 'Lab dialogs'], ['.three-preview', 'Preview'],
    ['.meter-strip, .meter-pill', 'Meter'], ['.meter-dlg', 'Token dashboard'], ['.native-head', 'Chat header'], ['.composer', 'Chat composer'], ['.msg-foot, .msg', 'Chat messages'], ['.tool-dock', 'Docked chat'],
    ['#rail', 'Rail'], ['#panel', 'Chats panel'], ['#broadcast', 'Ask-all bar'], ['.tool-head', 'Tool header'],
    ['.mb-menu, .lab-pop, #menu, #menu-fly, #menu-fly2', 'Menus'], ['dialog', 'Dialogs'], ['.tool-surface', 'Tools'],
  ];
  function areaOf(node) {
    for (const [sel, name] of AREAS) if (node.closest(sel)) return name;
    return 'Other';
  }
  // A stable name for a control: data-feature, else its visible words (counts, dots and emoji dropped), else its title.
  function labelOf(node) {
    if (node.dataset?.feature) return node.dataset.feature;
    const raw = (node.matches('select') ? (node.title || node.getAttribute('aria-label') || node.className) : (node.querySelector?.('b')?.textContent || node.textContent || ''));
    // numbers go (and the k / M left behind by "21k context"), so live counters keep one stable name
    let text = raw.replace(/[\d.,:/×·●%]+[kKM]?\b/g, ' ').replace(/[\d.,:/×·●%]+/g, ' ').replace(/[^\p{L}\p{N}\s'&+…-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 3) text = (node.title || node.getAttribute('aria-label') || text).split(/[(:·.\n]/)[0].trim();
    return text.slice(0, 60);
  }
  const keyOf = (node) => {
    const label = labelOf(node);
    return label ? `${areaOf(node)} › ${label}` : null;
  };

  function track(key, { label, area } = {}) {
    if (!data || !key) return;
    const now = Date.now();
    if (!data.items[key]) { data.items[key] = { n: 0, first: now, label: label || key.split(' › ').pop(), area: area || key.split(' › ')[0] }; note('def', ['items', key], { ...data.items[key] }); }
    const it = data.items[key];
    it.n += 1; note('inc', ['items', key, 'n'], 1);
    it.last = now; note('max', ['items', key, 'last'], now);
    const d0 = today();
    data.days[d0] = (data.days[d0] || 0) + 1; note('inc', ['days', d0], 1);
    const di = (data.dayItems ||= {});
    if (!di[d0]) for (const d of Object.keys(di).sort().slice(0, -KEEP_DAY_ITEMS + 1)) { delete di[d]; note('del', ['dayItems', d]); }
    (di[d0] ||= {})[key] = (di[d0][key] || 0) + 1; note('inc', ['dayItems', d0, key], 1);
    save();
    listeners.forEach((fn) => fn(key));
    scheduleDecorate();
  }
  // Seen on screen but maybe never clicked: registered with n = 0 so "never used" can be listed.
  function seen(key, label, area) {
    if (!data || !key || data.items[key]) return;
    data.items[key] = { n: 0, first: Date.now(), label, area };
    note('def', ['items', key], { ...data.items[key] });
    save();
  }

  const CONTROL = 'button, select, summary, .menu-item, .palette-item, .suggest-chip, .ask-opt, [role=button]';
  function onClick(e) {
    const node = e.target.closest?.(CONTROL);
    if (!node || node.closest('[data-no-usage]')) return;
    if (node.matches('select')) return; // counted on change
    if (node.matches('.palette-item')) { track(`Command palette › ${node.querySelector('.p-label')?.textContent || labelOf(node)}`); return; }
    track(keyOf(node));
  }
  function onChange(e) { if (e.target.matches?.('select')) track(keyOf(e.target)); }

  // ---------- how important things look ----------
  let decorateTimer = 0;
  // (round 26, smooth26) the pass (every header button's name, ~2 ms) waits for an idle moment after the delay, so it
  // never lands in a frame of the click / menu / typing that caused it
  const idleDecorate = () => { if (window.requestIdleCallback) requestIdleCallback(() => { decorateTimer = 0; decorate(); }, { timeout: 2000 }); else { decorateTimer = 0; decorate(); } };
  function scheduleDecorate() { if (decorateTimer) return; decorateTimer = setTimeout(idleDecorate, 600); }
  const trackedDays = () => (data ? (Date.now() - data.since) / DAY : 0);
  // (round 73, chatsteady73) worked out again only after new uses, at most every 30 s (a year of use: 4,000 controls
  // sorted on every pass, ≈ 2.5 ms after every click and each time something changed on screen)
  let tiered = null; let usesSeen = -1; let tieredAt = 0;
  function tiers() {
    const uses = ops.length + (data.days?.[today()] || 0);
    if (tiered && (uses === usesSeen || performance.now() - tieredAt < 30000)) return tiered; // (your top 12 barely moves in 30 s)
    tieredAt = performance.now();
    const counts = Object.values(data.items).map((x) => x.n).filter((n) => n > 0).sort((a, b) => b - a);
    const hotAt = Math.max(8, counts[Math.min(counts.length - 1, 11)] || 8); // roughly your top 12, at least 8 uses
    usesSeen = uses; tiered = { hotAt, warmAt: 3 };
    return tiered;
  }
  // (round 35, streamrender) a control's name is worked out once per button (again only when its words change): a long
  // chat drawn whole has thousands of message buttons, and this pass (after changes on screen: ≈ every 0.8 s while a
  // reply streams) took ≈ 0.4 s here, in one go
  const named = new WeakMap();
  function nameOf(node) {
    const sig = `${node.textContent}|${node.title}|${node.dataset?.feature || ''}|${node.tagName === 'SELECT' ? node.className : ''}`;
    let c = named.get(node);
    if (!c || c.sig !== sig) { const label = labelOf(node); const area = areaOf(node); c = { sig, key: label ? `${area} › ${label}` : null, label, area }; named.set(node, c); }
    return c;
  }
  function decorate() {
    if (!data) return;
    const { hotAt, warmAt } = tiers();
    const canFade = trackedDays() >= 14;
    const hidden = new Set(data.hidden || []);
    // (round 72, projects72) the last 60 message footers only: a 700-message chat has hundreds of the same footers, and
    // this pass (≈ 70–130 ms on such a chat) landed in the middle of opening a project; older ones keep their marks
    const foots = [...document.querySelectorAll('.msg-foot')];
    const roots = [...document.querySelectorAll('.three-toolbar, .media-bar .mb-main, .native-head, .tw-head, .tool-head'), ...foots.slice(-60)];
    for (const root of roots) {
      for (const node of root.querySelectorAll('button, select')) {
        const { key, label, area } = nameOf(node);
        if (!key) continue;
        if (!data.items[key]) seen(key, label, area);
        const it = data.items[key];
        node.classList.toggle('use-hot', it.n >= hotAt);
        node.classList.toggle('use-warm', it.n >= warmAt && it.n < hotAt);
        node.classList.toggle('use-cold', canFade && it.n === 0 && Date.now() - it.first > 14 * DAY
          || (canFade && it.last && Date.now() - it.last > 30 * DAY));
        node.classList.toggle('use-hidden', hidden.has(key));
      }
    }
    // the rail: the agents and tools you open most get a ring
    const opens = Object.entries(data.items).filter(([k]) => k.startsWith('Open › ')).map(([, v]) => v.n).sort((a, b) => b - a);
    const ringAt = Math.max(5, opens[2] || 5);
    for (const b of document.querySelectorAll('#rail .agent-btn')) {
      const it = data.items[`Open › ${b.dataset.id}`];
      b.classList.toggle('use-hot', Boolean(it && it.n >= ringAt));
    }
  }

  // ---------- "Your usage" ----------
  const ago = (t) => { if (!t) return 'never'; const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  function dialog() {
    if (!data) return;
    const items = Object.entries(data.items).map(([key, v]) => ({ key, ...v }));
    const used = items.filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const max = used[0]?.n || 1;
    const days = Math.max(1, Math.round(trackedDays()));
    const areas = {};
    for (const x of used) areas[x.area] = (areas[x.area] || 0) + x.n;
    const never = items.filter((x) => x.n === 0 && !x.key.startsWith('Open › ') && !x.key.startsWith('Agent tool › ')).sort((a, b) => a.area.localeCompare(b.area));
    const stale = used.filter((x) => Date.now() - x.last > 21 * DAY);
    const hidden = new Set(data.hidden || []);
    const bar = (x) => { const i = el('i'); i.style.width = `${Math.round((x.n / max) * 100)}%`; return el('span', { class: 'us-bar' }, i); };
    const row = (x, extra) => el('div', { class: 'us-row' },
      el('span', { class: 'us-name', text: x.label, title: x.key }), el('span', { class: 'us-area', text: x.area }),
      bar(x),
      el('span', { class: 'us-n', text: String(x.n) }), el('span', { class: 'us-ago', text: ago(x.last) }), extra || null);
    const hideBtn = (x) => el('button', { class: 'ghost small', text: hidden.has(x.key) ? 'Show' : 'Hide', title: 'Hide this button everywhere (Show brings it back)', on: { click: (e) => { toggleHidden(x.key); e.currentTarget.textContent = (data.hidden || []).includes(x.key) ? 'Show' : 'Hide'; } } });
    const body = el('div', { class: 'usage-dlg' },
      el('p', { class: 'hint', text: `Tracked on this PC for ${days} day${days === 1 ? '' : 's'}: ${used.reduce((s, x) => s + x.n, 0).toLocaleString()} clicks and shortcuts. Buttons you use a lot are highlighted; after two weeks of tracking, ones you never use fade. Claude can read this (data/kv/ui-usage.json) to rework or remove features you don't use.` }),
      el('h4', { text: 'By area' }),
      el('div', { class: 'us-areas' }, Object.entries(areas).sort((a, b) => b[1] - a[1]).map(([a, n]) => el('span', { class: 'us-chip', text: `${a} ${n}` }))),
      el('h4', { text: 'Most used' }),
      el('div', { class: 'us-list' }, used.slice(0, 40).map((x) => row(x))),
      stale.length ? el('h4', { text: 'Not used for 3+ weeks' }) : null,
      stale.length ? el('div', { class: 'us-list' }, stale.map((x) => row(x, hideBtn(x)))) : null,
      el('h4', { text: `Seen but never used (${never.length})` }),
      el('div', { class: 'us-list' }, never.slice(0, 120).map((x) => row(x, hideBtn(x)))),
      hidden.size ? el('p', { class: 'hint', text: `${hidden.size} hidden. Show brings one back.` }) : null);
    Modal.confirm('Your usage', '').then(() => {});
    const dlg = document.querySelector('dialog.ui-modal:last-of-type');
    dlg.querySelector('.modal-text').replaceWith(body);
    dlg.classList.add('wide');
    dlg.querySelector('.dialog-actions button[type=button]')?.remove();
  }
  function toggleHidden(key) {
    const s = new Set(data.hidden || []);
    if (s.has(key)) s.delete(key); else s.add(key);
    data.hidden = [...s];
    note('set', ['hidden'], data.hidden);
    save();
    decorate();
  }

  // ---------- numbers for the meter and chat commands ----------
  const itemsList = () => Object.entries(data?.items || {}).map(([key, v]) => ({ key, ...v }));
  const isFeature = (x) => !x.key.startsWith('Open › ') && !x.key.startsWith('Agent tool › ');
  // { clicks, features (distinct things used), top: [{ key, n }] } for a day (default today)
  function dayStats(day = today()) {
    const items = data?.dayItems?.[day] || {};
    const top = Object.entries(items).map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
    return { clicks: data?.days?.[day] || 0, features: top.length, top };
  }
  // used a lot (top tier), and seen but never / not lately used
  const hot = () => { if (!data) return []; const { hotAt } = tiers(); return itemsList().filter((x) => x.n >= hotAt).sort((a, b) => b.n - a.n); };
  const never = () => itemsList().filter((x) => x.n === 0 && isFeature(x)).sort((a, b) => a.area.localeCompare(b.area) || a.label.localeCompare(b.label));
  const cold = (days = 21) => itemsList().filter((x) => x.n > 0 && x.last && Date.now() - x.last > days * DAY).sort((a, b) => a.last - b.last);
  // days in a row (ending today or yesterday) with at least one click
  function streak() {
    if (!data) return { current: 0, best: 0 };
    const days = new Set(Object.keys(data.days || {}).filter((d) => data.days[d] > 0));
    const key = (t) => new Date(t).toLocaleDateString('en-CA');
    let current = 0;
    for (let t = Date.now() - (days.has(today()) ? 0 : DAY); days.has(key(t)); t -= DAY) current += 1;
    let best = 0; let run = 0; let prev = null;
    for (const d of [...days].sort()) {
      run = prev && (new Date(`${d}T12:00`) - new Date(`${prev}T12:00`)) <= DAY * 1.1 ? run + 1 : 1;
      best = Math.max(best, run); prev = d;
    }
    return { current, best };
  }
  function byArea() {
    const out = {};
    for (const x of itemsList()) if (x.n > 0) out[x.area] = (out[x.area] || 0) + x.n;
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }
  function setHidden(key, hide) {
    if (!data) return false;
    const s = new Set(data.hidden || []);
    if (hide) s.add(key); else s.delete(key);
    data.hidden = [...s];
    note('set', ['hidden'], data.hidden);
    save();
    decorate();
    return true;
  }
  // a feature by (part of) its name, best match first
  function find(q) {
    const s = String(q || '').toLowerCase().trim();
    if (!s) return [];
    const all = itemsList();
    return [...all.filter((x) => x.key.toLowerCase() === s || x.label?.toLowerCase() === s), ...all.filter((x) => x.key.toLowerCase().includes(s) && x.label?.toLowerCase() !== s && x.key.toLowerCase() !== s)];
  }

  async function init() {
    data = await window.hub.kvGet(KV, null);
    if (!data || !data.items) { data = { since: Date.now(), items: {}, days: {}, hidden: [] }; whole = true; } // (a new store goes whole)
    // what's still to save goes when the window hides or closes (a minute's clicks at most otherwise)
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    addEventListener('beforeunload', flush); // (as the Lab and the cut store do: a reload or quit)
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    // Re-check buttons when the layout changes, not for every clock tick or streamed word.
    const NOISY = '.mb-time, .mb-minitime, .three-stats, .messages, .three-console, .tw-kval, .ed-panel, #toasts, .msg, .meter-strip, .meter-pill, .cp-list, .cp-right, .juice-layer, #menu, #menu-fly, #menu-fly2, .palette, .slash-menu'; // the meter ticks while replies stream
    // (round 17, hz240) what comes and goes right under <body> without new buttons to note: tips, sparks, menus, the
    // palette (a tooltip or a press re-ran the whole decorate pass 0.8 s later)
    const QUIET = '.juice-tip, .juice-layer, .juice-glint, #menu, #menu-fly, #menu-fly2, .palette, #toasts, .quote-sel, .sel-bar, .ms-pop, .opt-sheet'; // (round 26: ◎ Missions, ⋯ AI setup)
    const noisy = (r) => {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (t?.closest?.(NOISY)) return true;
      return t === document.body && [...r.addedNodes, ...r.removedNodes].every((n) => n.nodeType !== 1 || n.matches(QUIET));
    };
    new MutationObserver((records) => {
      if (decorateTimer) return;
      if (records.every(noisy)) return;
      decorateTimer = setTimeout(idleDecorate, 800);
    }).observe(document.body, { childList: true, subtree: true });
    scheduleDecorate();
  }

  // (round 13, speed) note every visible button of a screen as seen (n = 0), so the weekly tidy covers every screen
  function see(root) {
    if (!data || !root) return 0;
    let n = 0;
    // (round 72, projects72) a long chat's messages repeat the same few buttons thousands of times (700 messages: ≈ 0.5 s
    // of visibility checks in one go when a project opened): the first 20 messages stand for the rest
    let msgs = 0; let lastMsg = null;
    for (const node of root.querySelectorAll('button, select')) {
      if (n > 300) break;
      const m = node.closest('.msg'); if (m && m !== lastMsg) { lastMsg = m; msgs += 1; } if (m && msgs > 20) continue;
      if (node.closest('[data-no-usage], dialog, #menu') || !node.checkVisibility?.({ visibilityProperty: true })) continue;
      const key = keyOf(node);
      if (key && !data.items[key]) { seen(key, labelOf(node), areaOf(node)); n += 1; }
    }
    return n;
  }

  return {
    init, track, dialog, decorate, keyOf, see, flush, // flush(): what changed, saved now (tests; a reload / quit does it) // keyOf(button): its "Area › Label" name (declutter.js: Customise this… → Hide)
    // shortcuts, opened agents / tools, an agent's tool calls
    key: (combo, what) => track(`Shortcut › ${combo}${what ? ` (${what})` : ''}`, { area: 'Shortcuts' }),
    open: (id) => track(`Open › ${id}`, { area: 'Opened', label: id }),
    agentTool: (tool) => track(`Agent tool › ${tool}`, { area: 'Agent tools', label: tool }),
    get data() { return data; },
    today, dayStats, hot, never, cold, streak, byArea, setHidden, find, trackedDays,
    onTrack: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
