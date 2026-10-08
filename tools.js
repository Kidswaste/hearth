// Tool workspaces that live in the rail next to agents (Forgeheart, Three.js Lab, Video Review).
// Each tool registers { id, name, icon, color, description, mount(el, head), onShow?() }.
// An agent with `dock: '<tool id>'` gets its chat docked on the right side of that tool.
const Tools = (() => {
  const registry = new Map();
  const DEFAULT_ORDER = ['forgeheart', 'three', 'ae'];

  function define(tool) { registry.set(tool.id, tool); }

  // config.tools: { order: [...ids], hidden: [...ids] }
  function settings() {
    const t = H.config?.tools || {};
    return { order: t.order || DEFAULT_ORDER, hidden: t.hidden || [] };
  }
  function all() {
    const { order } = settings();
    const ids = [...order.filter((id) => registry.has(id)), ...[...registry.keys()].filter((id) => !order.includes(id))];
    return ids.map((id) => registry.get(id));
  }
  function enabled() {
    const { hidden } = settings();
    return all().filter((t) => !hidden.includes(t.id));
  }
  function save(next) {
    H.config.tools = { ...settings(), ...next };
    saveConfig();
  }
  function move(id, delta) {
    const order = all().map((t) => t.id);
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    save({ order });
  }
  function setHidden(id, hide) {
    const hidden = new Set(settings().hidden);
    if (hide) hidden.add(id); else hidden.delete(id);
    save({ hidden: [...hidden] });
  }

  const dockedAgent = (toolId) => H.agents().find((a) => a.dock === toolId && a.mode === 'native');

  function createSurface(tool) {
    const host = el('section', { class: 'surface tool-surface', dataset: { id: `tool:${tool.id}` } });
    host.style.setProperty('--agent', tool.color);
    const head = el('header', { class: 'tool-head' },
      el('span', { class: 'tool-icon', text: tool.icon }),
      el('span', { class: 'tool-title', text: tool.name }),
      el('span', { class: 'tool-desc', text: tool.description || '' }));
    const body = el('div', { class: 'tool-body' });
    const dock = el('aside', { class: 'tool-dock', hidden: true });
    const divider = el('div', { class: 'tool-dock-divider', hidden: true, title: 'Drag to resize the chat' });
    host.style.setProperty('--dock-w', `${store.get(`dockWidth.${tool.id}`, 420)}px`);
    divider.addEventListener('pointerdown', (e) => {
      divider.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      const right = host.getBoundingClientRect().right;
      const move = (ev) => host.style.setProperty('--dock-w', `${Math.round(Math.min(760, host.clientWidth * 0.55, Math.max(300, right - ev.clientX)))}px`); // the tool keeps at least ~45%
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', () => {
        divider.removeEventListener('pointermove', move);
        document.body.classList.remove('resizing');
        store.set(`dockWidth.${tool.id}`, parseInt(host.style.getPropertyValue('--dock-w'), 10));
      }, { once: true });
    });
    host.append(head, el('div', { class: 'tool-main' }, body, divider, dock));
    return { el: host, mode: 'tool', tool, body, head, dock, divider, mounted: false, dockedId: null };
  }

  // Shows or hides the docked chat column (remembered per tool).
  function setDockOpen(s, open) {
    s.dock.hidden = !open;
    s.divider.hidden = !open;
    s.dockBtn?.classList.toggle('on', open);
    store.set(`dockOpen.${s.tool.id}`, open);
    if (typeof DirectorDock !== 'undefined') DirectorDock.applyCollapsed(s); // the thin bar only shows while the dock is open
  }

  function syncDock(s) {
    if (!s.mounted) return;
    const agent = dockedAgent(s.tool.id);
    if ((agent?.id || null) === s.dockedId) return;
    s.dock.replaceChildren();
    s.dockBtn?.remove();
    s.dockedId = agent?.id || null;
    if (!agent) { if (typeof DirectorDock !== 'undefined') DirectorDock.detach(s.tool.id); setDockOpen(s, false); return; }
    Native.mount(agent.id, s.dock);
    // activity strip, quick chips, undo, collapse (director-dock.js)
    if (typeof DirectorDock !== 'undefined') { try { DirectorDock.attach(s, agent); } catch (err) { console.warn(err); } }
    s.dockBtn = el('button', { class: 'ghost small dock-toggle', text: `💬 ${agent.name}`, title: `Show or hide the ${agent.name} chat`, on: { click: () => setDockOpen(s, s.dock.hidden) } });
    s.head.append(s.dockBtn);
    setDockOpen(s, store.get(`dockOpen.${s.tool.id}`, true));
  }

  // Tools mount lazily the first time you open them, so startup stays fast.
  function shown(tool) {
    const s = H.surfaces.get(`tool:${tool.id}`);
    if (!s) return;
    if (!s.mounted) {
      s.mounted = true;
      try { tool.mount(s.body, s.head); } catch (err) { s.body.append(el('p', { class: 'hint', text: `This tool failed to load: ${err.message}` })); console.error(err); }
    }
    syncDock(s);
    tool.onShow?.();
  }

  function syncDocks() {
    for (const t of enabled()) { const s = H.surfaces.get(`tool:${t.id}`); if (s) syncDock(s); }
  }

  function openDock(toolId) {
    const s = H.surfaces.get(`tool:${toolId}`);
    if (s?.dockedId && s.dock.hidden) setDockOpen(s, true);
  }

  return { define, all, enabled, move, setHidden, createSurface, shown, syncDocks, openDock, dockedAgent, get: (id) => registry.get(id) };
})();
