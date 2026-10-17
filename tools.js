// Tool workspaces that live in the rail next to agents (Forgeheart, Three.js Lab, the mood board, Commands).
// Each tool registers { id, name, icon, color, description, mount(el, head), onShow?() }.
// An agent with `dock: '<tool id>'` gets its chat docked on the right side of that tool.
const Tools = (() => {
  const registry = new Map();
  const DEFAULT_ORDER = ['forgeheart', 'three'];

  function define(tool) { registry.set(tool.id, tool); }

  // config.tools: { order: [...ids], hidden: [...ids], placed: [...ids] }
  // (round 53, appcalm) a tool defined with `offRail: true` (the Creative Playground) starts in the rail's ⋯ "Not in
  // the rail", once: `placed` remembers it, so ticking it back in (⋯ › Put tools back, Settings) keeps it in the rail
  function placeNew(t) {
    const fresh = [...registry.values()].filter((x) => x.offRail && !(t.placed || []).includes(x.id));
    if (!fresh.length || !H.config) return t;
    const ids = fresh.map((x) => x.id);
    H.config.tools = { ...t, placed: [...(t.placed || []), ...ids], hidden: [...new Set([...(t.hidden || []), ...ids])] };
    saveConfig();
    return H.config.tools;
  }
  function settings() {
    const t = placeNew(H.config?.tools || {});
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
    H.config.tools = { ...(H.config.tools || {}), ...settings(), ...next };
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
      el('span', { class: 'tool-icon' }, Icons.for(tool) || document.createTextNode(tool.icon)),
      el('span', { class: 'tool-title', text: tool.name }),
      el('span', { class: 'tool-desc', text: tool.description || '' }),
      // (round 26) ⋯ Options for this window (options.js), on its own tab
      tool.id === 'options' ? null : el('button', { type: 'button', class: 'ghost small tool-opts', text: '⋯', title: 'AI setup for this window\'s AI: who it is, its instructions and what it can use',
        on: { click: () => Lazy.load('options').then(() => Options.open({ place: tool.id })).catch((err) => toast(err.message, { type: 'error' })) } }));
    const body = el('div', { class: 'tool-body' });
    const dock = el('aside', { class: 'tool-dock', hidden: true });
    const divider = el('div', { class: 'tool-dock-divider', hidden: true, title: 'Drag to resize the chat' });
    host.style.setProperty('--dock-w', `${store.get(`dockWidth.${tool.id}`, 420)}px`);
    divider.addEventListener('pointerdown', (e) => {
      divider.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      const r = host.getBoundingClientRect(); const right = r.right; const max = host.clientWidth * 0.8;
      // (round 57, lab240edit) while dragging, the width goes on the dock itself, once a frame: --dock-w on the tool is
      // inherited by everything in it, so each move restyled the whole tool (the Lab: ≈ 400 elements, ≈ 30 ms a move
      // here). The tool's --dock-w gets the final width on release (what /dock-width and the dock read), as before.
      let want = 0; let raf = 0;
      const apply = () => { raf = 0; const w = `${want}px`; if (dock.style.flexBasis !== w) dock.style.flexBasis = w; };
      const move = (ev) => { want = Math.round(Math.min(max, Math.max(260, right - ev.clientX))); if (!raf) raf = requestAnimationFrame(apply); }; // (round 29) the owner: "let me resize the chat windows": up to 80% of the window, down to 260 px
      divider.addEventListener('pointermove', move);
      const up = () => {
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointercancel', up); divider.removeEventListener('pointerup', up);
        if (raf) { cancelAnimationFrame(raf); apply(); }
        document.body.classList.remove('resizing');
        if (want) { host.style.setProperty('--dock-w', `${want}px`); dock.style.flexBasis = ''; store.set(`dockWidth.${tool.id}`, want); }
      };
      divider.addEventListener('pointerup', up, { once: true });
      divider.addEventListener('pointercancel', up, { once: true });
    });
    divider.addEventListener('dblclick', () => { host.style.setProperty('--dock-w', '420px'); store.set(`dockWidth.${tool.id}`, 420); }); // back to the usual width
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
    // (round 55, chatsafe55) its director missing but its chats there: the dock keeps a read-only panel of them with
    // "Bring back …" (chatsafe.js) instead of no panel
    const waiting = !agent && typeof Panel !== 'undefined' && Panel.waitingIn ? Panel.waitingIn(s.tool.id) : [];
    const want = agent?.id || (waiting.length ? `waiting:${waiting.join(',')}` : null);
    if (want === s.dockedId) { if (waiting.length && typeof ChatSafe !== 'undefined') ChatSafe.refreshDock(s); return; }
    s.dock.replaceChildren();
    s.dockBtn?.remove();
    s.dockedId = want;
    if (!agent && waiting.length) {
      if (typeof DirectorDock !== 'undefined') DirectorDock.detach(s.tool.id);
      const label = Panel.missing(waiting[0]).name;
      s.dockBtn = el('button', { class: 'ghost small dock-toggle', text: `💬 ${label}`, title: `Its chats, read-only until it is back`, on: { click: () => setDockOpen(s, s.dock.hidden) } });
      s.head.append(s.dockBtn);
      s.dock.hidden = false; s.divider.hidden = false; s.dockBtn.classList.add('on'); // (shown, the owner's open / closed choice kept as it was)
      Lazy.load('chatsafe').then(() => { if (s.dockedId === want) ChatSafe.mountDock(s, waiting); }).catch((err) => console.warn('chatsafe', err));
      return;
    }
    if (!agent) { if (typeof DirectorDock !== 'undefined') DirectorDock.detach(s.tool.id); s.dock.hidden = true; s.divider.hidden = true; return; } // (round 55: the owner's open / closed choice isn't forgotten while no AI is docked)
    Native.mount(agent.id, s.dock);
    // activity strip, quick chips, undo, collapse (director-dock.js)
    if (typeof DirectorDock !== 'undefined') { try { DirectorDock.attach(s, agent); } catch (err) { console.warn(err); } }
    s.dockBtn = el('button', { class: 'ghost small dock-toggle', text: `💬 ${agent.name}`, title: `Show or hide the ${agent.name} chat`, on: { click: () => setDockOpen(s, s.dock.hidden) } });
    s.head.append(s.dockBtn);
    setDockOpen(s, store.get(`dockOpen.${s.tool.id}`, true));
  }

  // Tools mount lazily the first time you open them, so startup stays fast.
  function mountOnce(s, tool) {
    if (s.mounted) return;
    s.mounted = true;
    try { tool.mount(s.body, s.head); } catch (err) { s.body.append(el('p', { class: 'hint', text: `This tool failed to load: ${calmError(err)}` })); console.error(err); }
  }
  function shown(tool) {
    const s = H.surfaces.get(`tool:${tool.id}`);
    if (!s) return;
    mountOnce(s, tool);
    syncDock(s);
    tool.onShow?.();
  }
  // (round 29, fastboot) the Lab's first open: pressing its rail button (or its docked director's) mounts it then, so its
  // preview page is already loading when the click lands ≈ 0.1 s later (only once the Lab's files are in; nothing shows
  // until the click, and a press that becomes a drag just leaves it mounted, as after any visit)
  const WARM = new Set(['three']);
  function warm(id) {
    const sid = H.surfaceIdFor?.(id) || id;
    const toolId = String(sid).startsWith('tool:') ? sid.slice(5) : null;
    if (!toolId || !WARM.has(toolId) || (window.Lazy?.isIn && !Lazy.isIn('lab'))) return;
    const s = H.surfaces.get(sid);
    if (!s || s.mounted || !s.tool) return;
    mountOnce(s, s.tool); // (a stand-in tool hands over to the real one at once: its group is in)
  }

  function syncDocks() {
    for (const t of enabled()) { const s = H.surfaces.get(`tool:${t.id}`); if (s) syncDock(s); }
  }

  function openDock(toolId) {
    const s = H.surfaces.get(`tool:${toolId}`);
    if (s?.dockedId && s.dock.hidden) setDockOpen(s, true);
  }

  return { define, all, enabled, move, setHidden, createSurface, shown, warm, syncDocks, openDock, dockedAgent, get: (id) => registry.get(id) };
})();
