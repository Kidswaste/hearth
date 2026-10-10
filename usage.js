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
  const save = debounce(() => { if (data) window.hub.kvSet(KV, data); }, 3000);
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
    ['.mb-menu, .lab-pop, #menu', 'Menus'], ['dialog', 'Dialogs'], ['.tool-surface', 'Tools'],
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
    const it = (data.items[key] ||= { n: 0, first: now, label: label || key.split(' › ').pop(), area: area || key.split(' › ')[0] });
    it.n += 1;
    it.last = now;
    data.days[today()] = (data.days[today()] || 0) + 1;
    const di = (data.dayItems ||= {});
    if (!di[today()]) for (const d of Object.keys(di).sort().slice(0, -KEEP_DAY_ITEMS + 1)) delete di[d];
    (di[today()] ||= {})[key] = (di[today()][key] || 0) + 1;
    save();
    listeners.forEach((fn) => fn(key));
    scheduleDecorate();
  }
  // Seen on screen but maybe never clicked: registered with n = 0 so "never used" can be listed.
  function seen(key, label, area) {
    if (!data || !key || data.items[key]) return;
    data.items[key] = { n: 0, first: Date.now(), label, area };
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
  function scheduleDecorate() { if (decorateTimer) return; decorateTimer = setTimeout(() => { decorateTimer = 0; decorate(); }, 600); }
  const trackedDays = () => (data ? (Date.now() - data.since) / DAY : 0);
  function tiers() {
    const counts = Object.values(data.items).map((x) => x.n).filter((n) => n > 0).sort((a, b) => b - a);
    const hotAt = Math.max(8, counts[Math.min(counts.length - 1, 11)] || 8); // roughly your top 12, at least 8 uses
    return { hotAt, warmAt: 3 };
  }
  function decorate() {
    if (!data) return;
    const { hotAt, warmAt } = tiers();
    const canFade = trackedDays() >= 14;
    const hidden = new Set(data.hidden || []);
    const roots = document.querySelectorAll('.three-toolbar, .media-bar .mb-main, .native-head, .msg-foot, .tw-head, .tool-head');
    for (const root of roots) {
      for (const node of root.querySelectorAll('button, select')) {
        const key = keyOf(node);
        if (!key) continue;
        seen(key, labelOf(node), areaOf(node));
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
    if (!data || !data.items) data = { since: Date.now(), items: {}, days: {}, hidden: [] };
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    // Re-check buttons when the layout changes, not for every clock tick or streamed word.
    const NOISY = '.mb-time, .mb-minitime, .three-stats, .messages, .three-console, .tw-kval, .ed-panel, #toasts, .msg, .meter-strip, .meter-pill'; // the meter ticks while replies stream
    new MutationObserver((records) => {
      if (decorateTimer) return;
      if (records.every((r) => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest?.(NOISY))) return;
      decorateTimer = setTimeout(() => { decorateTimer = 0; decorate(); }, 800);
    }).observe(document.body, { childList: true, subtree: true });
    scheduleDecorate();
  }

  // (round 13, speed) note every visible button of a screen as seen (n = 0), so the weekly tidy covers every screen
  function see(root) {
    if (!data || !root) return 0;
    let n = 0;
    for (const node of root.querySelectorAll('button, select')) {
      if (n > 300) break;
      if (node.closest('[data-no-usage], dialog, #menu') || !node.checkVisibility?.({ visibilityProperty: true })) continue;
      const key = keyOf(node);
      if (key && !data.items[key]) { seen(key, labelOf(node), areaOf(node)); n += 1; }
    }
    return n;
  }

  return {
    init, track, dialog, decorate, keyOf, see, // keyOf(button): its "Area › Label" name (declutter.js: Customise this… → Hide)
    // shortcuts, opened agents / tools, an agent's tool calls
    key: (combo, what) => track(`Shortcut › ${combo}${what ? ` (${what})` : ''}`, { area: 'Shortcuts' }),
    open: (id) => track(`Open › ${id}`, { area: 'Opened', label: id }),
    agentTool: (tool) => track(`Agent tool › ${tool}`, { area: 'Agent tools', label: tool }),
    get data() { return data; },
    today, dayStats, hot, never, cold, streak, byArea, setHidden, find, trackedDays,
    onTrack: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
