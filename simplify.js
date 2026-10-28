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
      showMenu(r.right + 6, r.top - 4, moreItems());
    });
    anchor.before(more);
  }
  // (round 18, tidy) the ⋯ flyout reads like every other menu: one icon set (icons.js) instead of mixed emoji, the key
  // on the right, and the tools hidden from the rail one click away (Settings → Tools in the rail brings them back)
  const ICON = { 'palette-btn': 'command', 'add-btn': 'plus', 'notes-btn': 'notes', 'memory-btn': 'memory', 'grid-btn': 'grid', 'bar-btn': 'broadcast', 'import-btn': 'export', 'capture-btn': 'capture', 'apps-btn': 'web', 'full-btn': 'full', 'board-drawer-btn': 'board' }; // (round 49, appcalm) the two that left the rail
  function moreItems() {
    // (round 67, slowbutton67) first: 🐢 That was slow (the card of the last hiccup; the ⋯ wears a dot after one)
    const slow = window.Jank?.openCard ? [{ label: 'That was slow', icon: 'clock', tip: 'Click right after a hiccup: what it was, today’s count, Copy report for Claude', action: () => Jank.openCard() }] : [];
    slow.push({ label: 'Ideas', icon: 'notes', tip: 'Every idea you jotted with 💡 Quick idea (tray menu, or its key from any app): Move to…, Delete', action: () => Lazy.load('quickidea').then(() => QuickIdeas.open()).catch((err) => toast(calmError(err), { type: 'error' })) }); // (round 71, quickidea71)
    if (window.BugWatch) slow.push({ label: 'Something broke', icon: 'bug', tip: 'What went wrong lately, Copy report for Claude, Restart Hearth', action: () => BugWatch.open() }); // (round 68)
    const rows = [...slow, ...TUCKED.filter(([id]) => $(id)).map(([id, label]) => ({
      label: String(label).replace(/^[^\p{L}\d]+/u, '').replace(/⌘\+/g, 'Ctrl+'), icon: ICON[id], checked: $(id).classList.contains('on'), action: () => $(id).click() }))];
    const hidden = !window.WorkspaceNav && typeof Tools !== 'undefined' ? Tools.all().filter((t) => !Tools.enabled().includes(t)) : [];
    if (window.WorkspaceNav) rows.push({ label: 'Advanced tools & commands', icon: 'command', action: () => activate('tool:commands') });
    if (hidden.length) rows.push('-', 'Not in the rail', ...hidden.map((t) => ({ label: t.name, icon: typeof Icons !== 'undefined' ? Icons.keyFor(t) : null, action: () => activate(`tool:${t.id}`) })), { label: 'Put tools back in the rail…', icon: 'gear', action: () => AppUI.openSettings('rail') });
    return rows;
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
  return { TUCKED, moreItems };
})();
