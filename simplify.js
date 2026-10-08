// Round 4 (simplify): calmer defaults. The owner asked for less choice, so the rail keeps the buttons that get
// used (agents, tools, ⌘ palette, chats, settings) and the rest wait behind one ⋯; the chats panel loses its
// footer. Nothing is removed: every button still works through its shortcut, the palette (Ctrl+K) and /commands.
// (The "Let Astra decide" button and /decide live in decide.js.)
const Simplify = (() => {
  const $ = (id) => document.getElementById(id);
  // Rail buttons folded into ⋯ (their own listeners still run when the menu clicks them).
  const TUCKED = [
    ['notes-btn', '🗒 Notes  Ctrl+J'],
    ['memory-btn', '🧠 Memory: what your agents remember'],
    ['grid-btn', '▦ All side by side  Ctrl+G'],
    ['bar-btn', '⌨ Ask-all bar  Ctrl+B'],
    ['import-btn', '⇪ Import past chats…'],
  ];
  function rail() {
    const anchor = $('config-btn');
    if (!anchor || $('rail-more')) return;
    for (const [id] of TUCKED) { const b = $(id); if (b) b.hidden = true; }
    $('import-btn')?.closest('.panel-foot')?.classList.add('tucked');
    const more = el('button', { class: 'tool-btn', id: 'rail-more', text: '⋯', title: 'More: notes, memory, side by side, ask-all bar, import', dataset: { feature: 'Rail more' } });
    more.addEventListener('click', () => {
      const r = more.getBoundingClientRect();
      showMenu(r.right + 6, r.top - 4, TUCKED.filter(([id]) => $(id)).map(([id, label]) => ({ label: `${$(id).classList.contains('on') ? '✓ ' : ''}${label}`, action: () => $(id).click() })));
    });
    anchor.before(more);
  }
  // Once: the ask-all bar (a whole row, never used) starts hidden like it does for new installs; Ctrl+B or
  // Ctrl+Shift+Space shows it, layout.askAllBar: true in config.json keeps it.
  function calmDefaults() {
    if (!H.config) { setTimeout(calmDefaults, 300); return; }
    if (store.get('simplify.defaults', 0) >= 1) return;
    store.set('simplify.defaults', 1);
    if (H.config.layout?.askAllBar === true) { H.config.layout.askAllBar = false; $('broadcast')?.classList.add('hidden'); applyLayout(); saveConfig(); }
  }
  rail();
  calmDefaults();
  return { TUCKED };
})();
