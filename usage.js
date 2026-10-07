// What you actually use: counts clicks on buttons / menu items / palette actions, shortcuts, opened tools
// and agents' tool calls, all locally in data/kv/ui-usage.json. The counts drive how important buttons
// look (often used = highlighted, unused for weeks = faded), and "Your usage" lists what you never touch,
// with a way to hide it. Nothing leaves the PC.
const Usage = (() => {
  const KV = 'ui-usage';
  // { since, items: { key: { n, first, last, label, area } }, days: { 'YYYY-MM-DD': clicks }, hidden: [keys] }
  let data = null;
  const save = debounce(() => { if (data) window.hub.kvSet(KV, data); }, 3000);
  const DAY = 86400000;
  const today = () => new Date().toISOString().slice(0, 10);

  // Where a control lives, from its nearest known container.
  const AREAS = [
    ['.three-toolbar', 'Lab toolbar'], ['.media-bar', 'Timeline'], ['.tweaks', 'Sliders'], ['.ly-panel, .layers-panel', 'Layers'],
    ['.three-console-wrap', 'Console'], ['.refs-dialog', 'References'], ['.sb-dialog', 'Lab dialogs'], ['.three-preview', 'Preview'],
    ['.native-head', 'Chat header'], ['.composer', 'Chat composer'], ['.msg-foot, .msg', 'Chat messages'], ['.tool-dock', 'Docked chat'],
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
    let text = raw.replace(/[\d.,:/×·●%]+/g, ' ').replace(/[^\p{L}\p{N}\s'&+…-]/gu, ' ').replace(/\s+/g, ' ').trim();
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
    save();
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
  function scheduleDecorate() { clearTimeout(decorateTimer); decorateTimer = setTimeout(decorate, 600); }
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

  async function init() {
    data = await window.hub.kvGet(KV, null);
    if (!data || !data.items) data = { since: Date.now(), items: {}, days: {}, hidden: [] };
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: true });
    scheduleDecorate();
  }

  return {
    init, track, dialog, decorate,
    // shortcuts, opened agents / tools, an agent's tool calls
    key: (combo, what) => track(`Shortcut › ${combo}${what ? ` (${what})` : ''}`, { area: 'Shortcuts' }),
    open: (id) => track(`Open › ${id}`, { area: 'Opened', label: id }),
    agentTool: (tool) => track(`Agent tool › ${tool}`, { area: 'Agent tools', label: tool }),
    get data() { return data; },
  };
})();
