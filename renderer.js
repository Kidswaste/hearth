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
  $('user-theme').textContent = themeCss;
}

function iconFor(item) {
  const icon = item.icon || item.name[0];
  if (/^(https?:|data:|\.{0,2}\/)|\.(png|jpe?g|svg|ico|webp)$/i.test(icon)) {
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
  H.agents().forEach((agent, i) => {
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
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); showToolMenu(tool.id, e.clientX, e.clientY); });
      rail.append(btn);
    }
  }
  for (const btn of rail.querySelectorAll('.agent-btn')) btn.classList.toggle('active', btn.dataset.id === H.activeId);
}

function showAgentMenu(id, x, y) {
  const agent = H.agent(id);
  const items = [{ label: 'Edit…', action: () => Manager.open(id) }];
  if (agent.mode === 'web') items.push({ label: 'Reload', action: () => H.surfaces.get(id)?.webview?.reload() });
  if (agent.mode === 'native') items.push({ label: 'New chat', action: () => { activate(id); Native.newChat(id); } });
  items.push(
    { label: 'Move up', action: () => moveAgent(id, -1) },
    { label: 'Move down', action: () => moveAgent(id, 1) },
    { label: 'Remove', danger: true, action: () => Manager.remove(id) },
  );
  showMenu(x, y, items);
}

function showToolMenu(id, x, y) {
  showMenu(x, y, [
    { label: 'Move up', action: () => Tools.move(id, -1) },
    { label: 'Move down', action: () => Tools.move(id, 1) },
    { label: 'Hide from rail (Settings brings it back)', action: () => Tools.setHidden(id, true) },
  ]);
}

function showMenu(x, y, items) {
  const menu = $('menu');
  menu.replaceChildren(...items.map(({ label, action, danger }) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (danger) b.className = 'danger';
    b.addEventListener('click', () => { hideMenu(); action(); });
    return b;
  }));
  menu.hidden = false;
  const { innerWidth: w, innerHeight: h } = window;
  menu.style.left = `${Math.min(x, w - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(y, h - menu.offsetHeight - 8)}px`;
}
function hideMenu() { $('menu').hidden = true; }

function moveAgent(id, delta) {
  const list = H.config.agents;
  const i = list.findIndex((a) => a.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
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
  const surface = { el: host, mode: agent.mode };
  if (agent.mode === 'native') surface.native = Native.mount(agent.id, host);
  else surface.webview = createWebSurface(agent, host);
  host.addEventListener('mousedown', () => activate(agent.id, { focus: false }));
  return surface;
}

function syncSurfaces() {
  const container = $('surfaces');
  const wanted = new Set([...H.agents().map((a) => a.id), ...Tools.enabled().map((t) => `tool:${t.id}`)]);
  for (const [id, s] of H.surfaces) {
    if (!wanted.has(id)) { s.el.remove(); H.surfaces.delete(id); }
  }
  for (const agent of H.agents()) {
    let s = H.surfaces.get(agent.id);
    if (s && s.mode !== (agent.mode || 'web')) { s.el.remove(); s = null; }
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
  if (!wanted.has(H.activeId)) H.activeId = H.agents()[0]?.id ?? null;
}

function applyLayout() {
  const count = Math.max(H.agents().length, 1);
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
  const s = H.surfaces.get(id);
  if (!s) return;
  if (H.isTool(id) && H.grid) { H.grid = false; applyLayout(); }
  H.activeId = id;
  H.mru = [id, ...H.mru.filter((m) => m !== id)].slice(0, 12);
  if (H.unread.delete(id)) renderRail();
  for (const [sid, other] of H.surfaces) other.el.classList.toggle('active', sid === id);
  for (const btn of $('agent-buttons').querySelectorAll('.agent-btn')) btn.classList.toggle('active', btn.dataset.id === id);
  Panel.highlight();
  if (s.tool) Tools.shown(s.tool);
  if (!focus) return;
  if (s.webview) s.webview.focus();
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

async function sendToWebsite(agent, text) {
  const view = H.surfaces.get(agent.id).webview;
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
  if (/^[1-9]$/.test(key)) { const a = H.agents()[Number(key) - 1]; if (a) activate(a.id); }
  else if (key === 'g') { H.grid = !H.grid; applyLayout(); }
  else if (key === '\\') { H.panelOpen = !H.panelOpen; applyLayout(); }
  else if (key === 'b') { $('broadcast').classList.toggle('hidden'); applyLayout(); }
  else if (key === 'n') { if (H.agent(H.activeId)?.mode === 'native') Native.newChat(H.activeId); }
  else if (key === 'r') { if (shift) window.hub.reloadWindow(); else H.surfaces.get(H.activeId)?.webview?.reload(); }
  else if (key === ',') AppUI.openSettings();
  else if (key === 'k') AppUI.palette();
  else if (key === 'f') AppUI.find();
  else if (key === '/') AppUI.shortcutsHelp();
  else if (key === '=' || key === '+') AppUI.zoom(0.1);
  else if (key === '-') AppUI.zoom(-0.1);
  else if (key === '0') AppUI.zoom(0);
  else if (key === 'tab') AppUI.switchRecent(shift);
  else if (key === 'j') Notes.toggle();
  else if (key === ' ' && shift) { $('broadcast').classList.remove('hidden'); applyLayout(); $('broadcast-input').focus(); }
}

// ---------- settings ----------

function apply({ config, themeCss, error }) {
  if (error) return showError(`Couldn't read settings — ${error}. Still using the last good version.`);
  showError('');
  const first = !H.config;
  H.config = config;
  applyTheme(themeCss);
  if (first) {
    H.grid = config.layout?.start === 'grid';
    H.panelOpen = config.layout?.chatsPanel !== false;
    $('broadcast').classList.toggle('hidden', config.layout?.askAllBar === false);
    const startOn = H.settings().startOn;
    if (startOn && (H.agent(startOn) || (H.isTool(startOn) && Tools.enabled().some((t) => `tool:${t.id}` === startOn)))) H.activeId = startOn;
  }
  renderRail();
  syncSurfaces();
  applyLayout();
  Panel.render();
  activate(H.activeId, { focus: false });
}
