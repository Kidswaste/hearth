// Core: settings, the rail (agents + tools), one "surface" per agent or tool, layout and ask-all.
const $ = (id) => document.getElementById(id);

const H = {
  config: null,
  activeId: null,
  grid: false,
  panelOpen: true,
  surfaces: new Map(), // agent id or "tool:<id>" -> { el, mode, webview?, native?, tool? }
  chats: [], // native chat summaries, newest first
  history: {}, // agent id -> [{ url, title, at }] website conversations you've opened
  activeChat: {}, // agent id -> native chat id being shown
  engineStatus: {},
  unread: new Set(), // agent ids with a reply you haven't seen
  mru: [], // recently used surface ids, newest first
};
H.agents = () => (H.config?.agents || []).filter((a) => a.enabled !== false);
H.agent = (id) => H.config?.agents.find((a) => a.id === id);
// Agents docked inside a tool (Three Director, Video Director) live in that tool, not in the rail.
H.railAgents = () => H.agents().filter((a) => !a.dock);
H.surfaceIdFor = (id) => { const a = H.agent(id); return a?.dock ? `tool:${a.dock}` : id; };
H.settings = () => H.config?.settings || {};
H.isTool = (id) => typeof id === 'string' && id.startsWith('tool:');
// The native agent that "Ask Claude" actions go to: the first Claude-engine native agent.
H.claudeAgent = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'claude') || H.agents().find((a) => a.mode === 'native');

const THEME_VARS = {
  background: '--bg', sidebar: '--sidebar', text: '--text', accent: '--accent',
  radius: '--radius', font: '--font', sidebarWidth: '--sidebar-w', panelWidth: '--panel-w', gap: '--gap',
};
// Fallback when an agent has no "inputSelector": the first chat box on the page.
const DEFAULT_INPUT = 'div[contenteditable="true"], textarea';
// Which website addresses are individual conversations (used to build the chats list).
const CHAT_URL_PATTERNS = {
  'claude.ai': /^\/chat\/[\w-]+/,
  'chatgpt.com': /^\/(g\/[^/]+\/)?c\/[\w-]+/,
  'www.kimi.com': /^\/chat\/[\w-]+/,
  'kimi.com': /^\/chat\/[\w-]+/,
  'chat.deepseek.com': /^\/(a\/)?chat\/s\/[\w-]+/,
  'gemini.google.com': /^\/app\/\w+/,
  'www.perplexity.ai': /^\/search\/.+/,
  'grok.com': /^\/(c|chat)\/[\w-]+/,
  'chat.mistral.ai': /^\/chat\/[\w-]+/,
  'copilot.microsoft.com': /^\/chats\/[\w-]+/,
  'chat.qwen.ai': /^\/c\/[\w-]+/,
};
const HISTORY_LIMIT = 200;

function showError(message) {
  $('error').textContent = message || '';
  $('error').classList.toggle('show', Boolean(message));
}

function applyTheme(themeCss) {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    const value = H.config.theme?.[key];
    if (value != null) root.setProperty(cssVar, typeof value === 'number' ? `${value}px` : value);
  }
  document.documentElement.dataset.scheme = H.config.theme?.scheme || 'dark';
  document.documentElement.dataset.skin = H.config.theme?.skin || '';
  $('user-theme').textContent = themeCss;
}

function iconFor(item) {
  const icon = item.icon || item.name[0];
  const isImage = /^(https?:|data:|\.{0,2}\/)|\.(png|jpe?g|svg|ico|webp)$/i.test(icon);
  // Hearth's own SVG icons for its agents and tools (icons.js); your own picture always wins.
  const svg = !isImage && Icons.for(item);
  if (svg) return svg;
  if (isImage) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    return img;
  }
  return document.createTextNode(icon);
}

function railButton(id, item, title) {
  const btn = el('button', { class: 'agent-btn', title, dataset: { id } });
  btn.style.setProperty('--agent', item.color || 'var(--accent)');
  btn.append(iconFor(item));
  btn.addEventListener('click', () => activate(id));
  return btn;
}

function renderRail() {
  const rail = $('agent-buttons');
  rail.replaceChildren();
  H.railAgents().forEach((agent, i) => {
    const btn = railButton(agent.id, agent, `${agent.name}${agent.mode === 'native' ? ' (native)' : ''}  ·  Ctrl+${i + 1}  ·  right-click for options`);
    if (agent.mode === 'native') btn.classList.add('native');
    if (H.unread.has(agent.id)) btn.classList.add('unread');
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); showAgentMenu(agent.id, e.clientX, e.clientY); });
    rail.append(btn);
  });
  const tools = Tools.enabled();
  if (tools.length) {
    rail.append(el('div', { class: 'rail-sep' }));
    for (const tool of tools) {
      const btn = railButton(`tool:${tool.id}`, tool, `${tool.name}  ·  right-click for options`);
      btn.classList.add('tool-btn-rail');
      if (H.agents().some((a) => a.dock === tool.id && H.unread.has(a.id))) btn.classList.add('unread');
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); showToolMenu(tool.id, e.clientX, e.clientY); });
      rail.append(btn);
    }
  }
  for (const btn of rail.querySelectorAll('.agent-btn')) btn.classList.toggle('active', btn.dataset.id === H.surfaceIdFor(H.activeId));
}

// Right-click an agent in the rail: open it, a new chat, its recent chats, then the rarer edits in submenus.
function showAgentMenu(id, x, y) {
  const agent = H.agent(id);
  if (!agent) return;
  const i = H.railAgents().findIndex((a) => a.id === id);
  const recent = agent.mode === 'native' ? H.chats.filter((c) => c.agentId === id).slice(0, 10) : (H.history[id] || []).slice(-10).reverse();
  showMenu(x, y, [
    { label: `Open ${agent.name}`, key: i >= 0 && i < 9 ? `Ctrl+${i + 1}` : '', action: () => activate(id) },
    agent.mode === 'native' ? { label: 'New chat', key: 'Ctrl+N', action: () => { activate(id); Native.newChat(id); } } : null,
    recent.length ? { label: 'Recent chats', items: () => recent.map((c) => (agent.mode === 'native'
      ? { label: (c.title || 'Untitled').slice(0, 48), hint: timeAgo(c.updatedAt || c.at || Date.now()), action: () => { activate(id); Native.open(id, c.id); } }
      : { label: (c.title || c.url).slice(0, 48), action: () => { activate(id); H.surfaces.get(id)?.webview?.loadURL(c.url); } })) } : null,
    agent.mode === 'web' ? { label: 'Reload', key: 'Ctrl+R', action: () => H.surfaces.get(id)?.webview?.reload() } : null,
    '-',
    { label: 'Edit…', action: () => Manager.open(id) },
    { label: 'Move', items: [
      { label: 'Up', action: () => moveAgent(id, -1) },
      { label: 'Down', action: () => moveAgent(id, 1) },
      { label: 'To the top', action: () => moveAgentTo(id, 0) },
      { label: 'To the bottom', action: () => moveAgentTo(id, H.config.agents.length - 1) },
    ] },
    { label: 'Remove', danger: true, action: () => Manager.remove(id) },
  ]);
}

// Right-click a tool in the rail: open it (or its director chat), then move / hide.
function showToolMenu(id, x, y) {
  const docked = Tools.dockedAgent?.(id);
  showMenu(x, y, [
    { label: `Open ${Tools.get?.(id)?.name || 'the tool'}`, action: () => activate(`tool:${id}`) },
    docked ? { label: `${docked.name} chat`, hint: 'Docked beside it', action: () => { activate(`tool:${id}`); Tools.openDock(id); } } : null,
    '-',
    { label: 'Move', items: [{ label: 'Up', action: () => Tools.move(id, -1) }, { label: 'Down', action: () => Tools.move(id, 1) }] },
    { label: 'Hide from the rail', hint: 'Settings brings it back', action: () => Tools.setHidden(id, true) },
  ]);
}

// ---------- the menu ----------
// showMenu(x, y, items): the app's one pop-up menu (#menu). An item is { label, action } plus, all optional:
//   items: [...] or () => [...]   a submenu: click / → / Enter opens it in place with a "‹ back" row; pointing at
//                                  it for a moment shows it beside the menu (click there runs an item directly)
//   more: true      a rare action: waits behind one "More…" at the end, so menus stay short
//   checked: bool   a ✓ in front · key: 'Ctrl+K' on the right ("Label  Key", two spaces before the last word, too)
//   hint: 'text'    a quiet note after the label · danger · disabled
// A string item is a small heading, '-' a separator. Keys: ↑ ↓ Home End move, Enter / Space run, → opens a
// submenu, ← or Backspace goes back, Esc closes. A long menu has a filter field (typing anywhere fills it) that
// also finds the items of its submenus; a short one jumps to the first item starting with the typed letter.
let menuOpenedAt = 0;
let menuState = null; // { x, y, given, parent, kb: index of the keyboard-highlighted row }
const MENU_FILTER_AT = 9;
const menuSubItems = (it) => { try { return ((typeof it.items === 'function' ? it.items() : it.items) || []).filter(Boolean); } catch (err) { console.warn(err); return []; } };
const menuLabel = (it) => String(it.label ?? '').split(/\s{2,}(?=\S+$)/);
// Menus go in the top layer (a manual popover), so they also open over a modal dialog (Settings, Memory, /help…).
// A modal makes the rest of the page inert, so while one is open the menu moves inside it (still drawn on top, at the
// same place); hideMenu puts #menu back in <body> so closing the dialog never takes it along.
function topLayer(node, on) {
  if (!node.hasAttribute('popover')) node.setAttribute('popover', 'manual');
  try {
    if (on) {
      const host = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1) || document.body;
      if (node.parentElement !== host) { if (node.matches(':popover-open')) node.hidePopover(); host.append(node); }
      if (!node.matches(':popover-open')) node.showPopover();
    } else if (node.matches(':popover-open')) node.hidePopover();
  } catch { /* not connected yet */ }
}
function menuNode() {
  let menu = $('menu');
  if (!menu) { menu = el('div', { id: 'menu', hidden: true }); document.body.append(menu); }
  return menu;
}

function menuButton(it, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'menuitem');
  const [text, inlineKey] = menuLabel(it);
  b.textContent = text; // the label stays the first text node (usage counts and checks read it)
  if (it.icon && typeof Icons !== 'undefined') { const ic = Icons.node(it.icon); if (ic) { ic.classList.add('menu-ico'); b.append(ic); b.classList.add('has-ico'); } } // drawn first by CSS (order: -1)
  if (it.hint) b.append(el('span', { class: 'menu-hint', text: it.hint }));
  const sub = Boolean(it.items);
  const key = sub ? '›' : it.key || inlineKey;
  if (key) b.append(el('span', { class: `menu-key${sub ? ' menu-sub' : ''}`, text: key }));
  if (sub) { b.classList.add('has-sub'); b.setAttribute('aria-haspopup', 'menu'); }
  if (it.checked) b.classList.add('checked');
  if (it.danger) b.classList.add('danger');
  if (it.back) b.classList.add('menu-back');
  if (it.deep) b.classList.add('menu-deep');
  if (it.disabled) b.disabled = true;
  if (it.feature) b.dataset.feature = it.feature;
  b.addEventListener('click', (e) => { e.stopPropagation(); onPick(it, b); });
  return b;
}

function showMenu(x, y, items, parent = null, dir = 0) {
  const menu = menuNode();
  hideMenuFly();
  const given = items;
  let list = (typeof items === 'function' ? items() : items || []).filter(Boolean);
  // rare items behind one "More…" (a submenu, so ‹ back returns here)
  const rest = list.filter((it) => typeof it === 'object' && it.more);
  if (rest.length > 1) {
    const main = list.filter((it) => !(typeof it === 'object' && it.more));
    const at = main.findIndex((it) => it.danger); // "More…" goes above a closing Delete
    main.splice(at < 0 ? main.length : at, 0, { label: 'More…', hint: String(rest.length), items: rest.map((it) => ({ ...it, more: false })) });
    list = main;
  } else if (rest.length) list = list.map((it) => (it === rest[0] ? { ...it, more: false } : it));
  if (parent) list.unshift({ label: '‹ back', key: parent.label || '', back: true, action: () => showMenu(parent.x, parent.y, parent.items, parent.parent, -1) });
  const pick = (it, node) => {
    if (it.disabled) return;
    if (it.items) { menuOpenedAt = performance.now(); setTimeout(() => showMenu(x, y, menuSubItems(it), { x, y, items: given, parent, label: menuLabel(it)[0] }, 1), 0); return; }
    if (it.back) { menuOpenedAt = performance.now(); setTimeout(() => it.action(), 0); return; }
    hideMenu();
    try { it.action?.(node); } catch (err) { toast(err.message, { type: 'error' }); }
  };
  const rows = list.map((it) => {
    if (it === '-' || it.sep) return el('div', { class: 'menu-sep', role: 'separator' });
    if (typeof it === 'string') return el('div', { class: 'menu-head', text: it });
    const b = menuButton(it, pick);
    if (it.items) {
      b.addEventListener('pointerenter', () => { clearTimeout(menuFlyTimer); menuFlyTimer = setTimeout(() => showMenuFly(b, it, { x, y, given, parent }), 230); });
      b.addEventListener('pointerleave', () => clearTimeout(menuFlyTimer));
    } else b.addEventListener('pointerenter', () => { clearTimeout(menuFlyTimer); menuFlyTimer = setTimeout(hideMenuFly, 160); });
    return b;
  });
  const buttons = rows.filter((n) => n.tagName === 'BUTTON');
  // a long menu gets a filter field (typing anywhere goes into it)
  let filter = null;
  if (buttons.length >= MENU_FILTER_AT) {
    filter = el('input', { class: 'menu-filter', type: 'search', placeholder: 'Type to filter…', spellcheck: false, autocomplete: 'off' });
    filter.addEventListener('input', () => filterMenu(filter.value));
    filter.addEventListener('keydown', (e) => { if (e.key === 'Escape' && filter.value) { e.preventDefault(); e.stopPropagation(); filter.value = ''; filterMenu(''); } });
  }
  menu.replaceChildren(...(filter ? [filter] : []), ...rows);
  menu.setAttribute('role', 'menu');
  menu.classList.toggle('m-in', dir > 0);
  menu.classList.toggle('m-back', dir < 0);
  menu.classList.toggle('m-long', Boolean(filter));
  menuState = { x, y, given, parent, list, pick, kb: -1, filter };
  menu.hidden = false;
  topLayer(menu, true);
  menuOpenedAt = performance.now(); // the click that opened it must not close it (start.js)
  const { innerWidth: w, innerHeight: h } = window;
  menu.style.left = `${Math.max(4, Math.min(x, w - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, h - menu.offsetHeight - 8))}px`;
}
function hideMenu() {
  const menu = $('menu');
  if (menu) { menu.hidden = true; topLayer(menu, false); if (menu.parentElement !== document.body) document.body.append(menu); }
  hideMenuFly();
  menuState = null;
}
// A menu under an element (a button's own menu): showMenuAt(button, items)
function showMenuAt(anchor, items) {
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, items);
}

// typing in a long menu: matching rows stay, and the items of its submenus show as "Look › Glow"
function filterMenu(q) {
  const menu = $('menu');
  if (!menuState) return;
  q = String(q || '').trim().toLowerCase();
  menu.querySelectorAll('.menu-deep').forEach((n) => n.remove());
  for (const n of menu.children) {
    if (n.classList.contains('menu-filter')) continue;
    const isRow = n.tagName === 'BUTTON';
    n.style.display = !q ? '' : isRow && !n.classList.contains('menu-back') && n.textContent.toLowerCase().includes(q) ? '' : 'none';
  }
  if (q) {
    const deep = [];
    for (const it of menuState.list) {
      if (typeof it !== 'object' || !it.items || deep.length >= 30) continue;
      const head = menuLabel(it)[0];
      for (const sub of menuSubItems(it)) {
        if (typeof sub !== 'object' || sub.items || sub.sep || !String(sub.label || '').toLowerCase().includes(q)) continue;
        deep.push(menuButton({ ...sub, label: `${head} › ${menuLabel(sub)[0]}`, deep: true }, (s) => { hideMenu(); try { sub.action?.(); } catch (err) { toast(err.message, { type: 'error' }); } }));
      }
    }
    menu.append(...deep);
    if (!deep.length && ![...menu.children].some((n) => n.tagName === 'BUTTON' && n.style.display !== 'none')) menu.append(el('div', { class: 'menu-head menu-deep', text: 'Nothing matches' }));
  }
  menuState.kb = -1;
  menuKb(q ? 0 : -1);
}
const menuRows = () => [...($('menu')?.querySelectorAll(':scope > button') || [])].filter((b) => b.style.display !== 'none' && !b.disabled);
function menuKb(i) {
  const rows = menuRows();
  rows.forEach((b) => b.classList.remove('kb-on'));
  if (!menuState || i < 0 || !rows.length) { if (menuState) menuState.kb = -1; return; }
  menuState.kb = (i + rows.length) % rows.length;
  const b = rows[menuState.kb];
  b.classList.add('kb-on');
  b.scrollIntoView({ block: 'nearest' });
}

// pointing at a submenu row: its items show beside the menu (a second panel, #menu-fly)
let menuFlyTimer = 0;
function showMenuFly(row, it, ctx) {
  if (!row.isConnected || !menuState) return;
  let fly = $('menu-fly');
  if (!fly) { fly = el('div', { id: 'menu-fly', role: 'menu' }); document.body.append(fly); fly.addEventListener('pointerenter', () => clearTimeout(menuFlyTimer)); }
  const items = menuSubItems(it);
  if (!items.length) { hideMenuFly(); return; }
  const parentCtx = { x: ctx.x, y: ctx.y, items: ctx.given, parent: ctx.parent, label: menuLabel(it)[0] };
  fly.replaceChildren(...items.map((sub) => {
    if (sub === '-' || sub.sep) return el('div', { class: 'menu-sep' });
    if (typeof sub === 'string') return el('div', { class: 'menu-head', text: sub });
    return menuButton(sub, (s) => {
      if (s.items) { menuOpenedAt = performance.now(); setTimeout(() => showMenu(ctx.x, ctx.y, menuSubItems(s), { x: ctx.x, y: ctx.y, items: items, parent: parentCtx, label: menuLabel(s)[0] }, 1), 0); hideMenuFly(); return; }
      if (s.disabled) return;
      hideMenu();
      try { s.action?.(); } catch (err) { toast(err.message, { type: 'error' }); }
    });
  }));
  fly.hidden = false;
  topLayer(fly, true);
  fly.dataset.for = menuLabel(it)[0];
  const r = row.getBoundingClientRect();
  const m = $('menu').getBoundingClientRect();
  const fw = fly.offsetWidth; const fh = fly.offsetHeight;
  const right = m.right + 2 + fw < innerWidth - 4;
  fly.style.left = `${right ? m.right + 2 : Math.max(4, m.left - fw - 2)}px`;
  fly.style.top = `${Math.max(4, Math.min(r.top - 5, innerHeight - fh - 8))}px`;
  fly.classList.toggle('to-left', !right);
}
function hideMenuFly() { clearTimeout(menuFlyTimer); const f = $('menu-fly'); if (f) { f.hidden = true; topLayer(f, false); if (f.parentElement !== document.body) document.body.append(f); } }

// the menu's keys (capture: while it's open, arrows and letters belong to it, not to the Lab or the chat)
addEventListener('keydown', (e) => {
  const menu = $('menu');
  if (!menu || menu.hidden || !menuState || e.ctrlKey || e.metaKey || e.altKey) return;
  const rows = menuRows();
  const at = menuState.kb;
  const typing = e.target === menuState.filter;
  const done = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'ArrowDown') { done(); menuKb(at < 0 ? 0 : at + 1); }
  else if (e.key === 'ArrowUp') { done(); menuKb(at < 0 ? rows.length - 1 : at - 1); }
  else if (e.key === 'Home' && !typing) { done(); menuKb(0); }
  else if (e.key === 'End' && !typing) { done(); menuKb(rows.length - 1); }
  else if (e.key === 'Enter' || (e.key === ' ' && !typing && at >= 0)) {
    const b = at >= 0 ? rows[at] : menuState.filter?.value ? rows[0] : null;
    if (b) { done(); b.click(); }
  } else if (e.key === 'ArrowRight' && at >= 0 && rows[at].classList.contains('has-sub')) { done(); rows[at].click(); }
  else if ((e.key === 'ArrowLeft' || (e.key === 'Backspace' && !menuState.filter?.value)) && menuState.parent) { done(); menu.querySelector('.menu-back')?.click(); }
  else if (e.key === 'Escape') { done(); hideMenu(); }
  else if (e.key.length === 1 && e.key !== ' ' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !e.target.isContentEditable) {
    if (menuState.filter) { done(); menuState.filter.focus(); menuState.filter.value += e.key; filterMenu(menuState.filter.value); return; }
    const k = e.key.toLowerCase();
    const from = rows.findIndex((b, i) => i > at && b.textContent.trim().replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase().startsWith(k));
    const i = from >= 0 ? from : rows.findIndex((b) => b.textContent.trim().replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase().startsWith(k));
    if (i >= 0) { done(); menuKb(i); }
  }
}, true);
addEventListener('resize', () => hideMenu());

function moveAgent(id, delta) {
  const list = H.config.agents;
  const i = list.findIndex((a) => a.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveConfig();
}
function moveAgentTo(id, to) {
  const list = H.config.agents;
  const i = list.findIndex((a) => a.id === id);
  if (i < 0 || i === to) return;
  list.splice(Math.max(0, Math.min(list.length - 1, to)), 0, ...list.splice(i, 1));
  saveConfig();
}

function saveConfig() {
  return window.hub.saveConfig(H.config); // the file watcher re-applies it everywhere
}

// ---------- surfaces ----------

function isChatUrl(agent, url) {
  try {
    const u = new URL(url);
    if (agent.chatUrlPattern) return new RegExp(agent.chatUrlPattern).test(u.pathname);
    const known = CHAT_URL_PATTERNS[u.hostname];
    if (known) return known.test(u.pathname);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length >= 2 && parts.at(-1).length >= 8;
  } catch {
    return false;
  }
}

function cleanTitle(title, agentName) {
  const t = (title || '').trim();
  const stripped = t.replace(/\s+[-|–—]\s+[^-|–—]+$/, '').trim();
  if (!stripped || stripped.toLowerCase() === agentName.toLowerCase()) return null;
  return stripped;
}

let historySaveTimer;
function recordVisit(agentId, view) {
  const agent = H.agent(agentId);
  if (!agent) return;
  const url = view.getURL();
  if (!isChatUrl(agent, url)) return;
  const list = (H.history[agentId] ||= []);
  const existing = list.findIndex((h) => h.url === url);
  const entry = existing >= 0 ? list.splice(existing, 1)[0] : { url, title: null };
  entry.title = cleanTitle(view.getTitle(), agent.name) || entry.title || 'Untitled chat';
  entry.at = Date.now();
  list.unshift(entry);
  list.length = Math.min(list.length, HISTORY_LIMIT);
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => window.hub.saveHistory(H.history), 800);
  Panel.render();
}

// A website inside the hub, with a navigation bar and remembered zoom.
// Also used by tools (Miro board, docs) through the `partition` and `home` options.
function WebPane(parent, { url, partition, home = url, zoomKey, onNavigate }) {
  const view = el('webview', { attrs: { partition, allowpopups: '', src: url } });
  const address = el('span', { class: 'web-url', title: 'Click to copy the address' });
  const zoomLabel = el('span', { class: 'web-zoom' });
  const btn = (text, title, fn) => el('button', { class: 'web-btn', text, title, on: { click: fn } });
  let zoom = store.get(`zoom.${zoomKey}`, 1);
  const setZoom = (z) => {
    zoom = Math.min(3, Math.max(0.3, Math.round(z * 10) / 10));
    try { view.setZoomFactor(zoom); } catch { /* not ready yet */ }
    zoomLabel.textContent = zoom === 1 ? '' : `${Math.round(zoom * 100)}%`;
    store.set(`zoom.${zoomKey}`, zoom);
  };
  const bar = el('div', { class: 'web-bar' },
    btn('←', 'Back', () => view.canGoBack() && view.goBack()),
    btn('→', 'Forward', () => view.canGoForward() && view.goForward()),
    btn('⟳', 'Reload (Ctrl+R)', () => view.reload()),
    btn('⌂', 'Home', () => view.loadURL(home)),
    address,
    zoomLabel,
    btn('−', 'Zoom out', () => setZoom(zoom - 0.1)),
    btn('+', 'Zoom in', () => setZoom(zoom + 0.1)),
    btn('↗', 'Open in your browser', () => window.hub.openExternal(view.getURL())));
  address.addEventListener('click', () => copyText(view.getURL(), 'Address copied'));
  const update = () => {
    try { address.textContent = view.getURL().replace(/^https?:\/\//, ''); } catch { /* not ready */ }
    onNavigate?.(view);
  };
  view.addEventListener('dom-ready', () => { setZoom(zoom); update(); });
  view.addEventListener('did-navigate', update);
  view.addEventListener('did-navigate-in-page', update);
  view.addEventListener('page-title-updated', () => onNavigate?.(view));
  parent.append(bar, view);
  return { view, bar };
}

function createWebSurface(agent, host) {
  const { view } = WebPane(host, {
    url: agent.url, partition: `persist:${agent.id}`, zoomKey: agent.id,
    onNavigate: (v) => recordVisit(agent.id, v),
  });
  view.dataset.url = agent.url;
  view.addEventListener('focus', () => activate(agent.id, { focus: false }));
  return view;
}

function createSurface(agent) {
  const host = el('section', { class: `surface agent-surface ${agent.mode}`, dataset: { id: agent.id } });
  host.style.setProperty('--agent', agent.color || 'var(--accent)');
  const surface = { el: host, mode: agent.mode, companion: agent.companion || null };
  if (agent.mode === 'native' && agent.companion === 'forge-game') {
    // Game on the left, chat on the right, with a draggable divider.
    const gamePane = el('div', { class: 'companion-game' });
    const chatPane = el('div', { class: 'companion-chat' });
    const divider = el('div', { class: 'companion-divider', title: 'Drag to resize' });
    host.classList.add('with-companion');
    host.style.setProperty('--companion-w', `${store.get('companionWidth', 58)}%`);
    divider.addEventListener('pointerdown', (e) => {
      divider.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      const box = host.getBoundingClientRect();
      const move = (ev) => host.style.setProperty('--companion-w', `${Math.min(80, Math.max(25, ((ev.clientX - box.left) / box.width) * 100))}%`);
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', () => {
        divider.removeEventListener('pointermove', move);
        document.body.classList.remove('resizing');
        store.set('companionWidth', parseFloat(host.style.getPropertyValue('--companion-w')));
      }, { once: true });
    });
    host.append(gamePane, divider, chatPane);
    ForgeGame.mount(gamePane);
    surface.native = Native.mount(agent.id, chatPane);
  } else if (agent.mode === 'native') surface.native = Native.mount(agent.id, host);
  else surface.webview = createWebSurface(agent, host);
  host.addEventListener('mousedown', () => activate(agent.id, { focus: false }));
  return surface;
}

function syncSurfaces() {
  const container = $('surfaces');
  const wanted = new Set([...H.railAgents().map((a) => a.id), ...Tools.enabled().map((t) => `tool:${t.id}`)]);
  for (const [id, s] of H.surfaces) {
    if (!wanted.has(id)) { s.el.remove(); H.surfaces.delete(id); }
  }
  for (const agent of H.railAgents()) {
    let s = H.surfaces.get(agent.id);
    if (s && (s.mode !== (agent.mode || 'web') || (s.companion || null) !== (agent.companion || null))) { s.el.remove(); s = null; }
    if (!s) {
      s = createSurface({ ...agent, mode: agent.mode || 'web' });
      H.surfaces.set(agent.id, s);
    } else if (s.webview && s.webview.dataset.url !== agent.url) {
      s.webview.dataset.url = agent.url;
      s.webview.loadURL(agent.url);
    } else if (s.native) {
      Native.refresh(agent.id);
    }
    s.el.style.setProperty('--agent', agent.color || 'var(--accent)');
    container.append(s.el); // re-append keeps config order
  }
  for (const tool of Tools.enabled()) {
    const id = `tool:${tool.id}`;
    if (!H.surfaces.has(id)) H.surfaces.set(id, Tools.createSurface(tool));
    container.append(H.surfaces.get(id).el);
  }
  Tools.syncDocks();
  if (!wanted.has(H.surfaceIdFor(H.activeId))) H.activeId = H.railAgents()[0]?.id ?? null;
}

function applyLayout() {
  const count = Math.max(H.railAgents().length, 1);
  const cols = Math.min(H.config.layout?.gridColumns || 2, count);
  const container = $('surfaces');
  container.style.setProperty('--cols', cols);
  container.style.setProperty('--rows', Math.ceil(count / cols));
  container.classList.toggle('grid', H.grid);
  $('panel').classList.toggle('hidden', !H.panelOpen);
  $('grid-btn').classList.toggle('on', H.grid);
  $('panel-btn').classList.toggle('on', H.panelOpen);
  $('bar-btn').classList.toggle('on', !$('broadcast').classList.contains('hidden'));
}

function activate(id, { focus = true } = {}) {
  // Docked agents (e.g. Three Director) show inside their tool's surface.
  const surfaceId = H.surfaceIdFor(id);
  const s = H.surfaces.get(surfaceId);
  if (!s) return;
  const docked = surfaceId !== id;
  if (H.isTool(surfaceId) && H.grid) { H.grid = false; applyLayout(); }
  if (focus && typeof Usage !== 'undefined') Usage.open(id);
  lastSeen.set(surfaceId, Date.now());
  if (s.webview?.dataset.sleeping) wakeWebsite(s);
  H.activeId = id;
  H.mru = [id, ...H.mru.filter((m) => m !== id)].slice(0, 12);
  let changed = H.unread.delete(id);
  // Opening a tool also counts as seeing the chat docked in it.
  if (H.isTool(id)) for (const a of H.agents()) if (a.dock === id.slice(5) && H.unread.delete(a.id)) changed = true;
  if (changed) renderRail();
  for (const [sid, other] of H.surfaces) other.el.classList.toggle('active', sid === surfaceId);
  for (const btn of $('agent-buttons').querySelectorAll('.agent-btn')) btn.classList.toggle('active', btn.dataset.id === surfaceId);
  Panel.highlight();
  if (s.tool) Tools.shown(s.tool);
  if (docked) Tools.openDock(s.tool.id);
  if (!focus) return;
  if (docked) Native.focus(id);
  else if (s.webview) s.webview.focus();
  else if (s.native) Native.focus(id);
}

function openWebChat(agentId, url) {
  activate(agentId);
  H.surfaces.get(agentId)?.webview?.loadURL(url);
}

// Starts a fresh chat with the first native Claude agent and sends `text` (used by tools).
async function askClaude(text, { agentId, newChat = true } = {}) {
  const agent = agentId ? H.agent(agentId) : H.claudeAgent();
  if (!agent) { toast('Add a native Claude agent first (＋ in the rail).', { type: 'error' }); return; }
  activate(agent.id);
  if (newChat) Native.newChat(agent.id);
  await Native.send(agent.id, text);
}

// Puts text into the native composer without sending, so you can add to it first.
function draftToClaude(text) {
  const agent = H.claudeAgent();
  if (!agent) { toast('Add a native Claude agent first.', { type: 'error' }); return; }
  activate(agent.id);
  Native.newChat(agent.id);
  Native.setDraft(agent.id, text);
}

// ---------- ask all ----------

// ---------- sleeping websites (Settings → "Unload websites I haven't opened for…") ----------
// A website agent you haven't looked at for a while is unloaded to free memory and CPU; opening it (or
// ask-all) loads it again. Logins stay (they live in the site's partition).
const lastSeen = new Map();
function sleepIdleWebsites() {
  const mins = Number(H.settings?.().sleepWebsAfter || 0);
  if (!mins || H.grid) return;
  for (const [id, s] of H.surfaces) {
    const v = s.webview;
    if (!v || v.dataset.sleeping || id === H.surfaceIdFor(H.activeId)) continue;
    if (Date.now() - (lastSeen.get(id) || performance.timeOrigin) < mins * 60000) continue;
    try { v.dataset.sleptUrl = v.getURL(); v.dataset.sleeping = '1'; v.loadURL('about:blank'); } catch { /* not ready yet */ }
  }
}
setInterval(sleepIdleWebsites, 60000);
function wakeWebsite(s) {
  const v = s.webview;
  const url = v.dataset.sleptUrl;
  delete v.dataset.sleeping;
  if (!url) return Promise.resolve();
  return new Promise((resolve) => { v.addEventListener('dom-ready', () => resolve(), { once: true }); v.loadURL(url); setTimeout(resolve, 15000); });
}

async function sendToWebsite(agent, text) {
  const surf = H.surfaces.get(agent.id);
  if (surf.webview?.dataset.sleeping) { await wakeWebsite(surf); await new Promise((r) => setTimeout(r, 2500)); }
  const view = surf.webview;
  const selector = JSON.stringify(agent.inputSelector || DEFAULT_INPUT);
  const found = await view.executeJavaScript(
    `(() => { const el = document.querySelector(${selector}); if (!el) return false; el.focus(); return true; })()`,
  );
  if (!found) throw new Error('no chat box found');
  await view.insertText(text);
  if (H.config.askAll?.pressEnter === false) return;
  // Give the site's editor a moment to register the text before submitting.
  await new Promise((r) => setTimeout(r, 200));
  view.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  view.sendInputEvent({ type: 'char', keyCode: '\r' });
  view.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
}

async function askAll(text) {
  const targets = H.agents().filter((a) => a.askAll !== false);
  const status = $('status');
  status.textContent = `Sending to ${targets.length}…`;
  const results = await Promise.allSettled(targets.map((a) => (
    a.mode === 'native' ? Native.send(a.id, text) : sendToWebsite(a, text)
  )));
  const failed = targets.filter((_, i) => results[i].status === 'rejected').map((a) => a.name);
  status.textContent = failed.length ? `Couldn't send to: ${failed.join(', ')}` : `Sent to ${targets.length}`;
  setTimeout(() => { status.textContent = ''; }, 5000);
}

// ---------- shortcuts ----------

function handleShortcut({ key, shift }) {
  Usage.key(`Ctrl+${shift ? 'Shift+' : ''}${key.length === 1 ? key.toUpperCase() : key}`);
  if (/^[1-9]$/.test(key)) { const a = H.railAgents()[Number(key) - 1]; if (a) activate(a.id); }
  else if (key === 'g') { H.grid = !H.grid; applyLayout(); }
  else if (key === '\\') { H.panelOpen = !H.panelOpen; applyLayout(); }
  else if (key === 'b') { $('broadcast').classList.toggle('hidden'); applyLayout(); }
  else if (key === 'n') { if (H.agent(H.activeId)?.mode === 'native') Native.newChat(H.activeId); }
  else if (key === 'r') { if (shift) window.hub.reloadWindow(); else if (!ThreeLab.restartVisible()) H.surfaces.get(H.activeId)?.webview?.reload(); }
  else if (key === ',') AppUI.openSettings();
  else if (key === 'k') AppUI.palette();
  else if (key === 'f') AppUI.find();
  else if (key === '/') { if (typeof KeysUI !== 'undefined') KeysUI.open(); else AppUI.shortcutsHelp(); } // the keys sheet (keys-ui.js)
  else if (key === '=' || key === '+') AppUI.zoom(0.1);
  else if (key === '-') AppUI.zoom(-0.1);
  else if (key === '0') AppUI.zoom(0);
  else if (key === 'tab') AppUI.switchRecent(shift);
  else if (key === 'j') Notes.toggle();
  else if (key === 's' && shift) AppUI.snapshotToChat();
  else if (key === 't' && shift) AppUI.toggleOnTop();
  else if (key === ' ' && shift) { $('broadcast').classList.remove('hidden'); applyLayout(); $('broadcast-input').focus(); }
}

// ---------- settings ----------

function apply({ config, themeCss, error }) {
  if (error) return showError(`Couldn't read settings — ${error}. Still using the last good version.`);
  showError('');
  const first = !H.config;
  H.config = config;
  applyTheme(themeCss);
  if (first) setTimeout(() => AppUI.offerSwirl(), 0);
  if (first) {
    H.grid = config.layout?.start === 'grid';
    H.panelOpen = config.layout?.chatsPanel !== false;
    // the ask-all bar starts hidden (Ctrl+B or Ctrl+Shift+Space shows it; layout.askAllBar: true keeps it)
    $('broadcast').classList.toggle('hidden', config.layout?.askAllBar !== true);
    const startOn = H.settings().startOn;
    if (startOn && (H.agent(startOn) || (H.isTool(startOn) && Tools.enabled().some((t) => `tool:${t.id}` === startOn)))) H.activeId = startOn;
  }
  renderRail();
  syncSurfaces();
  applyLayout();
  Panel.render();
  activate(H.activeId, { focus: false });
}

// ---------- the Lab's pop-up menus ----------
// popMenu(x, y, items): the two-column menus of the Lab (.mb-menu.lab-pop; ThreeTweaks.menu and the Lab's own
// menus use it). An item is [label, hint, fn, on, feature]; a string is a heading. Since round 7:
// [label, hint, [...items]] is a submenu that opens in place with a "‹ back" row, a long menu folds each section after
// the first into one "Heading ›" row, a long list gets a filter field, and ↑ ↓ Enter → ← Esc work like in #menu.
const POP_FOLD_AT = 11;
function popFold(list) {
  list = list.filter((it) => typeof it === 'string' || (Array.isArray(it) && it.length && it[0] !== ''));
  // "Customise this…" (declutter.js) always closes the menu, outside any folded section
  const tail = list.filter((it) => Array.isArray(it) && it[0] === 'Customise this…');
  if (tail.length) list = list.filter((it) => !tail.includes(it));
  if (list.filter(Array.isArray).length <= POP_FOLD_AT) return [...list, ...tail];
  const out = [];
  const made = new Set(); // the sections folded here (a caller's own submenu stays a submenu)
  let sec = null;
  list.forEach((it, i) => {
    if (typeof it === 'string') {
      // the menu's title line and the first section stay open
      if (i === 0 || !out.some(Array.isArray)) { out.push(it); sec = null; return; }
      sec = [it, '', []];
      made.add(sec);
      out.push(sec);
      return;
    }
    if (sec) sec[2].push(it); else out.push(it);
  });
  // a folded section of one item stays inline
  return [...out.flatMap((x) => (made.has(x) && x[2].length <= 1 ? x[2] : [x])), ...tail];
}
function popMenu(x, y, items, { width = 300 } = {}) {
  document.querySelector('.mb-menu.lab-pop')?.remove();
  const m = el('div', { class: 'mb-menu lab-pop', role: 'menu' });
  const stack = [];
  let kb = -1;
  const off = () => { removeEventListener('pointerdown', away, true); removeEventListener('keydown', keys, true); };
  const close = () => { m.remove(); off(); };
  const rowsNow = () => [...m.querySelectorAll(':scope > .menu-item')].filter((b) => b.style.display !== 'none');
  const mark = (i) => {
    const rows = rowsNow();
    rows.forEach((b) => b.classList.remove('kb-on'));
    if (!rows.length || i < 0) { kb = -1; return; }
    kb = (i + rows.length) % rows.length;
    rows[kb].classList.add('kb-on');
    rows[kb].scrollIntoView({ block: 'nearest' });
  };
  const row = (it, onClick, extra = '') => el('button', { type: 'button', role: 'menuitem', class: `menu-item${it[3] ? ' on' : ''}${extra}`, dataset: it[4] ? { feature: it[4] } : {}, on: { click: onClick } }, el('b', { text: it[0] }), el('span', { class: 'hint', text: it[1] || '' }));
  function render(list, dir = 0) {
    const nodes = [];
    if (stack.length) nodes.push(row(['‹ back', stack.at(-1).title], () => { const prev = stack.pop(); render(prev.list, -1); }, ' menu-back'));
    for (const it of popFold(list.filter(Boolean))) {
      if (typeof it === 'string') nodes.push(el('div', { class: 'menu-head', text: it }));
      else if (Array.isArray(it[2])) nodes.push(row([it[0], `${it[1] ? `${it[1]}  ` : ''}›`, null, it[3], it[4]], () => { stack.push({ list, title: it[0] }); render(it[2], 1); }, ' has-sub'));
      else nodes.push(row(it, () => { close(); it[2]?.(); }));
    }
    let filter = null;
    if (nodes.filter((n) => n.classList.contains('menu-item')).length >= 14) {
      filter = el('input', { class: 'menu-filter', type: 'search', placeholder: 'Type to filter…', spellcheck: false });
      filter.addEventListener('input', () => {
        const q = filter.value.trim().toLowerCase();
        for (const n of m.children) if (n !== filter) n.style.display = !q || (n.classList.contains('menu-item') && !n.classList.contains('menu-back') && n.textContent.toLowerCase().includes(q)) ? '' : 'none';
        mark(q ? 0 : -1);
      });
    }
    m.replaceChildren(...(filter ? [filter] : []), ...nodes);
    m.classList.toggle('m-in', dir > 0);
    m.classList.toggle('m-back', dir < 0);
    kb = -1;
    requestAnimationFrame(() => { const r = m.getBoundingClientRect(); if (r.bottom > innerHeight - 8) m.style.top = `${Math.max(8, innerHeight - 8 - r.height)}px`; });
  }
  const away = (e) => { if (!m.contains(e.target)) close(); };
  const keys = (e) => {
    if (!m.isConnected) { off(); return; }
    const rows = rowsNow();
    const filter = m.querySelector('.menu-filter');
    const typingElsewhere = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target !== filter;
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { done(); if (filter?.value) { filter.value = ''; filter.dispatchEvent(new Event('input')); } else close(); }
    else if (e.key === 'ArrowDown') { done(); mark(kb + 1); }
    else if (e.key === 'ArrowUp') { done(); mark(kb < 0 ? rows.length - 1 : kb - 1); }
    else if (e.key === 'Enter') { const b = rows[kb] || (filter?.value ? rows[0] : null); if (b) { done(); b.click(); } }
    else if (e.key === 'ArrowRight' && rows[kb]?.classList.contains('has-sub')) { done(); rows[kb].click(); }
    else if ((e.key === 'ArrowLeft' || (e.key === 'Backspace' && !filter?.value)) && stack.length && !typingElsewhere) { done(); m.querySelector('.menu-back')?.click(); }
    else if (filter && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.target !== filter && !typingElsewhere) { done(); filter.focus(); filter.value += e.key; filter.dispatchEvent(new Event('input')); }
  };
  render(items);
  Object.assign(m.style, { left: `${Math.max(8, Math.min(innerWidth - width - 12, x))}px`, top: `${Math.max(8, y)}px`, transform: 'none', maxHeight: '70vh', overflowY: 'auto' });
  document.body.append(m);
  topLayer(m, true);
  setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', keys, true); });
  return m;
}
