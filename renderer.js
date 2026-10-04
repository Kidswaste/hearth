const sidebarEl = document.getElementById('agent-buttons');
const viewsEl = document.getElementById('views');
const errorEl = document.getElementById('error');
const barEl = document.getElementById('broadcast');
const inputEl = document.getElementById('broadcast-input');
const statusEl = document.getElementById('status');
const gridBtn = document.getElementById('grid-btn');
const barBtn = document.getElementById('bar-btn');

const THEME_VARS = {
  background: '--bg', sidebar: '--sidebar', text: '--text', accent: '--accent',
  radius: '--radius', font: '--font', sidebarWidth: '--sidebar-w', gap: '--gap',
};
// Fallback when an agent has no "inputSelector": the first chat box on the page.
const DEFAULT_INPUT = 'div[contenteditable="true"], textarea';

let config = null;
let activeId = null;
let gridMode = false;
const views = new Map(); // agent id -> <webview>

const agents = () => (config?.agents || []).filter((a) => a.enabled !== false);

function showError(message) {
  errorEl.textContent = message || '';
  errorEl.classList.toggle('show', Boolean(message));
}

function applyTheme(themeCss) {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) {
    const value = config.theme?.[key];
    if (value != null) root.setProperty(cssVar, typeof value === 'number' ? `${value}px` : value);
  }
  document.getElementById('user-theme').textContent = themeCss;
}

function renderSidebar() {
  sidebarEl.replaceChildren();
  agents().forEach((agent, i) => {
    const btn = document.createElement('button');
    btn.className = 'agent-btn';
    btn.dataset.id = agent.id;
    btn.style.setProperty('--agent', agent.color || 'var(--accent)');
    btn.title = `${agent.name}  (Ctrl+${i + 1})`;
    const icon = agent.icon || agent.name[0];
    if (/[./]/.test(icon)) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = agent.name;
      btn.append(img);
    } else {
      btn.textContent = icon;
    }
    btn.addEventListener('click', () => activate(agent.id));
    sidebarEl.append(btn);
  });
}

// Keep existing webviews alive across config edits so nobody gets logged out or loses a chat.
function syncViews() {
  const wanted = new Set(agents().map((a) => a.id));
  for (const [id, view] of views) {
    if (!wanted.has(id)) { view.remove(); views.delete(id); }
  }
  for (const agent of agents()) {
    let view = views.get(agent.id);
    if (!view) {
      view = document.createElement('webview');
      view.setAttribute('partition', `persist:${agent.id}`);
      view.setAttribute('allowpopups', '');
      view.setAttribute('src', agent.url);
      view.dataset.url = agent.url;
      view.addEventListener('focus', () => activate(agent.id, { focus: false }));
      views.set(agent.id, view);
    } else if (view.dataset.url !== agent.url) {
      view.dataset.url = agent.url;
      view.loadURL(agent.url);
    }
    viewsEl.append(view); // re-append keeps config order
  }
  if (!wanted.has(activeId)) activeId = agents()[0]?.id ?? null;
}

function applyLayout() {
  const count = Math.max(agents().length, 1);
  const cols = Math.min(config.layout?.gridColumns || 2, count);
  viewsEl.style.setProperty('--cols', cols);
  viewsEl.style.setProperty('--rows', Math.ceil(count / cols));
  viewsEl.classList.toggle('grid', gridMode);
  gridBtn.classList.toggle('on', gridMode);
  barBtn.classList.toggle('on', !barEl.classList.contains('hidden'));
}

function activate(id, { focus = true } = {}) {
  if (!views.has(id)) return;
  activeId = id;
  for (const [vid, view] of views) view.classList.toggle('active', vid === id);
  for (const btn of sidebarEl.children) btn.classList.toggle('active', btn.dataset.id === id);
  if (focus) views.get(id).focus();
}

function apply({ config: next, themeCss, error }) {
  if (error) return showError(`Couldn't read settings — ${error}. Still using the last good version.`);
  showError('');
  const first = !config;
  config = next;
  applyTheme(themeCss);
  if (first) {
    gridMode = config.layout?.start === 'grid';
    barEl.classList.toggle('hidden', config.layout?.askAllBar === false);
  }
  renderSidebar();
  syncViews();
  applyLayout();
  activate(activeId, { focus: false });
}

async function sendToAgent(agent, text) {
  const view = views.get(agent.id);
  const selector = JSON.stringify(agent.inputSelector || DEFAULT_INPUT);
  const found = await view.executeJavaScript(
    `(() => { const el = document.querySelector(${selector}); if (!el) return false; el.focus(); return true; })()`,
  );
  if (!found) throw new Error('no chat box found');
  await view.insertText(text);
  if (config.askAll?.pressEnter === false) return;
  // Give the site's editor a moment to register the text before submitting.
  await new Promise((r) => setTimeout(r, 200));
  view.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  view.sendInputEvent({ type: 'char', keyCode: '\r' });
  view.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
}

async function askAll(text) {
  const targets = agents().filter((a) => a.askAll !== false);
  statusEl.textContent = `Sending to ${targets.length}…`;
  const results = await Promise.allSettled(targets.map((a) => sendToAgent(a, text)));
  const failed = targets.filter((_, i) => results[i].status === 'rejected').map((a) => a.name);
  statusEl.textContent = failed.length ? `Couldn't send to: ${failed.join(', ')}` : `Sent to ${targets.length}`;
  setTimeout(() => { statusEl.textContent = ''; }, 5000);
}

function handleShortcut({ key, shift }) {
  const list = agents();
  if (/^[1-9]$/.test(key)) { const a = list[Number(key) - 1]; if (a) activate(a.id); }
  else if (key === 'g') { gridMode = !gridMode; applyLayout(); }
  else if (key === 'b') { barEl.classList.toggle('hidden'); applyLayout(); }
  else if (key === 'r') views.get(activeId)?.reload();
  else if (key === ',') window.hub.openFile('config');
  else if (key === ' ' && shift) { barEl.classList.remove('hidden'); applyLayout(); inputEl.focus(); }
}

barEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  askAll(text);
});
gridBtn.addEventListener('click', () => handleShortcut({ key: 'g' }));
barBtn.addEventListener('click', () => handleShortcut({ key: 'b' }));
document.getElementById('config-btn').addEventListener('click', () => window.hub.openFile('config'));
document.getElementById('theme-btn').addEventListener('click', () => window.hub.openFile('theme'));
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (/^[1-9gbr,]$/.test(key) || (e.shiftKey && key === ' ')) {
    e.preventDefault();
    handleShortcut({ key, shift: e.shiftKey });
  }
});

window.hub.onShortcut(handleShortcut);
window.hub.onConfigChanged(apply);
window.hub.getConfig().then(apply);
