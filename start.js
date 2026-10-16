// Wires up the buttons and loads everything once all modules are defined.

// 'hearth:view' (a window event, once per task) whenever the agent / tool on screen or any agent's open chat
// changes, so modules react to it instead of polling H.activeId / H.activeChat on timers (an idle app runs nothing).
(() => {
  let queued = false;
  const changed = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; dispatchEvent(new Event('hearth:view')); }); };
  let activeId = H.activeId;
  Object.defineProperty(H, 'activeId', { get: () => activeId, set: (v) => { activeId = v; changed(); }, enumerable: true, configurable: true });
  H.activeChat = new Proxy(H.activeChat, {
    set: (o, k, v) => { if (o[k] !== v) changed(); o[k] = v; return true; },
    deleteProperty: (o, k) => { delete o[k]; changed(); return true; },
  });
})();
$('broadcast').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('broadcast-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  askAll(text);
});
$('add-btn').addEventListener('click', () => Manager.open());
$('panel-btn').addEventListener('click', () => handleShortcut({ key: '\\' }));
$('grid-btn').addEventListener('click', () => handleShortcut({ key: 'g' }));
$('bar-btn').addEventListener('click', () => handleShortcut({ key: 'b' }));
$('config-btn').addEventListener('click', () => AppUI.openSettings());
$('palette-btn').addEventListener('click', () => AppUI.palette());
$('notes-btn').addEventListener('click', () => Notes.toggle());
$('chat-search').addEventListener('input', (e) => Panel.setFilter(e.target.value));
// Checks the export first (what's new, duplicates, empty chats), then imports with progress (addons-cmds.js).
$('import-btn').addEventListener('click', () => (window.Lazy ? Lazy.load('addons') : Promise.resolve()).then(() => Addons.importChats())); // (round 18: addons-cmds.js loads after the first screen)

document.addEventListener('click', (e) => { if (!e.target.closest('#menu, #menu-fly, #menu-fly2') && performance.now() - menuOpenedAt > 40) hideMenu(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu();
  // Code editors handle their own Ctrl shortcuts (comment toggle, duplicate line…).
  if (!e.ctrlKey || e.defaultPrevented || e.target.closest?.('.code-editor')) return;
  const key = e.key.toLowerCase();
  if (/^[1-9gbrnkfj,\\/=+\-0]$/.test(key) || key === 'tab' || (e.shiftKey && (key === ' ' || key === 's' || key === 't'))) {
    e.preventDefault();
    handleShortcut({ key, shift: e.shiftKey });
  }
});
window.addEventListener('blur', hideMenu);

window.hub.onShortcut(handleShortcut);
window.hub.onConfigChanged(configChanged); // (round 50) news of an older save waits for the newer one (renderer.js)

(async () => {
  // (round 19) the splash names what a slow start waits for (splash.js); the settings are asked for at the same time
  const track = window.Splash ? Splash.track : (_what, p) => p;
  const config = track('settings', window.hub.getConfig());
  // where Claude Code / Codex are installed only shapes a new chat's hint: the first screen doesn't wait more than
  // 0.4 s for it (unknown counts as found, as before the check); a late answer still lands in H.engineStatus
  const engines = track('engines', window.hub.engineStatus().catch(() => ({})));
  engines.then((st) => { H.engineStatus = st; });
  [H.chats, H.history, H.engineStatus] = await Promise.all([
    track('chats', window.hub.listChats()), track('history', window.hub.getHistory()),
    Promise.race([engines, new Promise((r) => setTimeout(() => r({}), 400))]),
  ]);
  window.Splash?.step('chats');
  AppUI.init();
  Usage.init();
  Meter.init();
  apply(await config);
  performance.mark('hearth:ready'); // the first screen is up (dev/perf-report.js measures startup to here)
  dispatchEvent(new Event('hearth:ready')); // (round 16) lazy.js loads the deferred feature modules from here
})();
