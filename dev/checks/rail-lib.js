// (round 74, checkhealth74) The button a check clicks to open an AI or a tool, in today's rail. Since Codex's Projects /
// Life spaces (Oct 19) the rail holds the spaces (Projects, Life), the owner's shortcuts, ＋ and Chats; the AIs sit in the
// bar above a chat, a project's tools in the bar above them. RAIL.button(id) gives the one on screen: the old rail button
// when there is one, else the bar's, else for a tool a rail shortcut made for it the way the owner adds one (＋ Add to
// the rail › Tool · …), else for an AI the rail's Chats. smoke.js puts this in front of a check that uses RAIL.
//   const b = RAIL.button('tool:three'); b.click()  (or a real CDP click at its middle)
const RAIL = (() => {
  const shown = (n) => (n && n.isConnected && n.getClientRects().length && n.getBoundingClientRect().width > 0 ? n : null);
  const first = (sel) => [...document.querySelectorAll(sel)].find(shown) || null;
  const DEFAULTS = [{ id: 'forgeheart', name: 'Forgeheart', icon: 'ship', type: 'tool', target: 'forgeheart', color: '#ff9b61' }, { id: 'clink', name: 'Clink!', icon: 'brushes', type: 'name', target: 'Clink', color: '#e17ac4' }]; // renderer.js WorkspaceNav's own
  const list = () => (Array.isArray(H.settings().workspaceShortcuts) ? H.settings().workspaceShortcuts : DEFAULTS);
  function shortcut(id) {
    const x = list().find((s) => s.type === 'tool' && `tool:${s.target}` === id);
    return x ? first(`#agent-buttons .space-button[data-shortcut="${CSS.escape(x.id)}"]`) : null;
  }
  function button(id, { make = true } = {}) {
    const esc = CSS.escape(id);
    const direct = first(`#agent-buttons .agent-btn[data-id="${esc}"]`) || first(`.workspace-switcher .agent-btn[data-id="${esc}"]`) || first(`.workspace-switcher [data-surface="${esc}"]:not([data-feature])`);
    if (direct) return direct;
    if (!id.startsWith('tool:')) return first('#agent-buttons .space-chats');
    let b = shortcut(id);
    if (!b && make && window.WorkspaceNav && Tools.get?.(id.slice(5))) {
      const name = Tools.get(id.slice(5))?.name || id.slice(5);
      H.config.settings = { ...H.config.settings, workspaceShortcuts: [...list(), { id: `pin-check-${id.slice(5)}`, name, type: 'tool', target: id.slice(5), icon: 'spark', color: '#d79bff' }].slice(-12) };
      WorkspaceNav.render();
      b = shortcut(id);
    }
    return b;
  }
  return { button, shown };
})();
