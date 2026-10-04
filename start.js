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
$('config-btn').addEventListener('click', () => window.hub.openFile('config'));
$('theme-btn').addEventListener('click', () => window.hub.openFile('theme'));
$('chat-search').addEventListener('input', (e) => Panel.setFilter(e.target.value));

document.addEventListener('click', (e) => { if (!e.target.closest('#menu')) hideMenu(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu();
  if (!e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (/^[1-9gbrn,\\]$/.test(key) || (e.shiftKey && key === ' ')) {
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
  apply(await window.hub.getConfig());
})();
