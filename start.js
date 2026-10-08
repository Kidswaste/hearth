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
$('import-btn').addEventListener('click', () => Addons.importChats());

document.addEventListener('click', (e) => { if (!e.target.closest('#menu') && performance.now() - menuOpenedAt > 40) hideMenu(); });
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
window.hub.onConfigChanged(apply);

(async () => {
  [H.chats, H.history, H.engineStatus] = await Promise.all([
    window.hub.listChats(), window.hub.getHistory(), window.hub.engineStatus(),
  ]);
  AppUI.init();
  Usage.init();
  Meter.init();
  apply(await window.hub.getConfig());
  performance.mark('hearth:ready'); // the first screen is up (dev/perf-report.js measures startup to here)
})();
