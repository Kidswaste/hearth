// Core: settings, the agent rail, one "surface" per agent (a website or a native chat), layout and ask-all.
const $ = (id) => document.getElementById(id);

const H = {
  config: null,
  activeId: null,
  grid: false,
  panelOpen: true,
  surfaces: new Map(), // agent id -> { el, mode, webview?, native? }
  chats: [], // native chat summaries, newest first
  history: {}, // agent id -> [{ url, title, at }] website conversations you've opened
  activeChat: {}, // agent id -> native chat id being shown
  engineStatus: {},
};
H.agents = () => (H.config?.agents || []).filter((a) => a.enabled !== false);
H.agent = (id) => H.config?.agents.find((a) => a.id === id);

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
  $('user-theme').textContent = themeCss;
}

function iconFor(agent) {
  const icon = agent.icon || agent.name[0];
  if (/^(https?:|data:|\.{0,2}\/)|\.(png|jpe?g|svg|ico|webp)$/i.test(icon)) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = '';
    return img;
  }
  return document.createTextNode(icon);
}

function renderRail() {
  const rail = $('agent-buttons');
  rail.replaceChildren();
  H.agents().forEach((agent, i) => {
    const btn = document.createElement('button');
    btn.className = 'agent-btn';
    btn.dataset.id = agent.id;
    btn.style.setProperty('--agent', agent.color || 'var(--accent)');
    btn.title = `${agent.name}${agent.mode === 'native' ? ' (native)' : ''}  ·  Ctrl+${i + 1}  ·  right-click for options`;
    btn.append(iconFor(agent));
    if (agent.mode === 'native') btn.classList.add('native');
    btn.addEventListener('click', () => activate(agent.id));
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); showAgentMenu(agent.id, e.clientX, e.clientY); });
    rail.append(btn);
  });
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
  window.hub.saveConfig(H.config); // the file watcher re-applies it everywhere
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

function createWebSurface(agent, el) {
  const view = document.createElement('webview');
  view.setAttribute('partition', `persist:${agent.id}`);
  view.setAttribute('allowpopups', '');
  view.setAttribute('src', agent.url);
  view.dataset.url = agent.url;
  const record = () => recordVisit(agent.id, view);
  view.addEventListener('did-navigate', record);
  view.addEventListener('did-navigate-in-page', record);
  view.addEventListener('page-title-updated', record);
  view.addEventListener('focus', () => activate(agent.id, { focus: false }));
  el.append(view);
  return view;
}

function createSurface(agent) {
  const el = document.createElement('section');
  el.className = `surface ${agent.mode}`;
  el.dataset.id = agent.id;
  el.style.setProperty('--agent', agent.color || 'var(--accent)');
  const surface = { el, mode: agent.mode };
  if (agent.mode === 'native') surface.native = Native.mount(agent.id, el);
  else surface.webview = createWebSurface(agent, el);
  el.addEventListener('mousedown', () => activate(agent.id, { focus: false }));
  return surface;
}

function syncSurfaces() {
  const container = $('surfaces');
  const wanted = new Set(H.agents().map((a) => a.id));
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
  H.activeId = id;
  for (const [sid, other] of H.surfaces) other.el.classList.toggle('active', sid === id);
  for (const btn of $('agent-buttons').children) btn.classList.toggle('active', btn.dataset.id === id);
  Panel.highlight();
  if (!focus) return;
  if (s.webview) s.webview.focus();
  else Native.focus(id);
}

function openWebChat(agentId, url) {
  activate(agentId);
  H.surfaces.get(agentId)?.webview?.loadURL(url);
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
  else if (key === 'r') H.surfaces.get(H.activeId)?.webview?.reload();
  else if (key === ',') window.hub.openFile('config');
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
  }
  renderRail();
  syncSurfaces();
  applyLayout();
  Panel.render();
  activate(H.activeId, { focus: false });
}
