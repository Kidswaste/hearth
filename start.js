// Wires up the buttons and loads everything once all modules are defined.
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
})();
