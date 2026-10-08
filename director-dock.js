// The docked director chat's extras (tools.js syncDock attaches them to a tool's dock):
//   - a thin activity strip: the director's tool calls as icons (running ones pulse, failed ones red), a count for
//     this reply, a mini thumbnail of the latest picture it looked at, ↶ undo of its last code edit, ✦ quick asks,
//     ⇥ collapse. Click the icons for the full list.
//   - quick chips above the composer for the owner's common asks: some run locally for free (/shuffle colors,
//     /save-look), the rest are sent to the director. Your own chips with /director chips add <text>.
//   - collapse to a thin bar (⇥, double-click the divider, /dock-collapse) and width presets (right-click the
//     divider, /dock-width). Width and collapse are remembered per tool.
// Nothing here is sent to the model.
const DirectorDock = (() => {
  const ICONS = {
    three_eval: '⚡', three_edit_code: '✎', three_set_code: '✚', three_screenshot: '📷', three_read_code: '📖', three_search_code: '🔍',
    three_sliders: '🎚', three_media_control: '▶', three_input: '⌨', three_contact_sheet: '🎞', three_console: '▤', three_get_code: '⌸',
    three_layers: '☰', three_add_layer: '＋', three_update_layer: '◫', three_remove_layer: '✕', three_keyframes: '◆', three_animate: '◆',
    three_timeline: '⏱', three_timeline_edit: '⏱', three_looks: '✦', three_notes: '📝', three_references: '🖼', three_triggers: 'ϟ',
    three_media_info: '♪', three_load_media: '♪', three_set_frame: '▭', three_new_sketch: '✚', three_nodes: '⬡',
    video_frame: '📷', video_contact_sheet: '🎞', video_status: '▤', video_list: '☰', video_open: '▶', video_add_note: '📝',
    video_compare: '◧', video_control: '▶', video_export: '⇪', ae_render: '⏺', ae_run_script: '⚙',
    forge_eval: '⚡', forge_screenshot: '📷', forge_status: '▤', forge_spawn: '👾', forge_debug: '🛠', forge_reload: '⟳',
    forge_patch_save: '🩹', forge_patch_list: '🩹', forge_patch_remove: '🩹',
    chat_progress: '☑', chat_ask: '?', chat_show: '🖼', chat_second_opinion: '👁',
  };
  const PREFIXES = { three: ['three_'], ae: ['video_', 'ae_'], forgeheart: ['forge_'] };
  const iconOf = (tool) => ICONS[tool] || '◇';
  const nameOf = (tool) => tool.replace(/^(three|video|forge|chat|ae)_/, '').replace(/_/g, ' ');

  // Quick asks per tool. run: a chat command that runs here (no tokens); send: a message to the director.
  const CHIPS = {
    three: [
      { label: '🎛 Jam', run: '/jam', title: 'Claude and Astra take turns making a visual for you (4 rounds; Esc stops) · /jam <idea>' },
      { label: '🥁 Hit harder on the kick', send: 'Make it hit harder on the kick: bigger, snappier punches on the kicks (my kick markers / the kick trigger when there are some), with a slider for how hard. Keep everything else.' },
      { label: '🎨 Shuffle colors', run: '/shuffle colors' },
      { label: '💾 Save this look', run: '/save-look' },
      { label: '✨ 3 variations', send: 'Make 3 clearly different variations with the sliders, save each as a look, show them to me and ask which one I want.' },
      { label: '🔧 Fix the errors', run: '/fix-errors' },
      { label: '🌊 Change on the drop', send: 'Make it change on the drop: a clear switch in look or motion when the drop hits, timed to my cues / markers.' },
    ],
    ae: [
      { label: '🎞 Review the open render', send: 'Review the render that is open: look at the whole thing and a few key frames, then tell me the 3 things that would help most.' },
      { label: '📝 Do my notes', send: 'Go through my open timeline notes and turn each into a concrete change.' },
    ],
    forgeheart: [
      { label: '👾 Spawn 20', send: 'Spawn 20 random enemies.' },
      { label: '🛡 God mode', send: 'Turn on god mode.' },
    ],
  };
  const chipList = (toolId) => [...(CHIPS[toolId] || []), ...store.get(`director.chips.${toolId}`, []).map((t) => (t.startsWith('/') ? { label: t, run: t, own: true } : { label: t.length > 28 ? `${t.slice(0, 27)}…` : t, send: t, own: true }))];

  const attached = new Map(); // toolId -> { s, agentId, strip, chips, rail, refresh }

  function attach(s, agent) {
    detach(s.tool.id);
    const toolId = s.tool.id;
    const prefixes = PREFIXES[toolId] || [`${toolId}_`];
    // calls that carry a chat (chat-scenes.js) show only while that chat is the one in the dock
    const mine = (e) => e && (prefixes.some((p) => e.tool.startsWith(p)) || (e.tool.startsWith('chat_') && e.agentId === agent.id)) && (!e.chatId || e.chatId === H.activeChat[agent.id]);
    let turnFrom = 0; // calls since the user's last message
    let listOpen = false;

    const calls = el('button', { type: 'button', class: 'dd-calls', title: 'The director\'s tool calls (click for the list)' });
    const sum = el('span', { class: 'dd-sum' });
    const thumb = el('button', { type: 'button', class: 'dd-thumb', hidden: true, title: 'The last picture the director looked at (click to enlarge)' }, el('img', { alt: '' }));
    const undoBtn = el('button', { type: 'button', class: 'dd-btn dd-undo', text: '↶', hidden: toolId !== 'three', title: 'Undo the director\'s last code edit' });
    const askBtn = el('button', { type: 'button', class: 'dd-btn', text: '✦', title: 'Quick asks and dock options' });
    const foldBtn = el('button', { type: 'button', class: 'dd-btn', text: '⇥', title: 'Collapse the chat to a thin bar (double-click the divider too)' });
    const list = el('div', { class: 'dd-list', hidden: true });
    const strip = el('div', { class: 'dd-strip', dataset: { feature: 'Director activity' } }, calls, sum, el('span', { class: 'spacer' }), thumb, undoBtn, askBtn, foldBtn, list);
    const chips = el('div', { class: 'dd-chips', dataset: { feature: 'Director chips' } });
    const rail = el('button', { type: 'button', class: 'dd-rail', title: `Show the ${agent.name} chat` },
      el('span', { class: 'dd-rail-icon', text: agent.icon || '◆' }), el('span', { class: 'dd-rail-dot' }), el('span', { class: 'dd-rail-name', text: agent.name }));

    // ---------- the strip ----------
    function paint() {
      const log = HubBridge.log().filter(mine);
      const recent = log.slice(-12);
      calls.replaceChildren(...recent.map((e) => el('span', {
        class: `dd-call${e.running ? ' running' : ''}${e.ok === false ? ' failed' : ''}`, text: iconOf(e.tool),
        title: `${nameOf(e.tool)}${e.summary ? ` · ${e.summary}` : ''}${e.ms != null ? ` · ${e.ms < 1000 ? `${e.ms} ms` : `${(e.ms / 1000).toFixed(1)} s`}` : ' · running'}${e.error ? `\n${e.error}` : ''}`,
      })));
      const turn = log.filter((e) => e.at >= turnFrom);
      const edits = turn.filter((e) => /_(edit_code|set_code)$/.test(e.tool)).length;
      const fails = turn.filter((e) => e.ok === false).length;
      const read = turn.reduce((n, e) => n + (e.tokens || 0), 0);
      const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
      sum.textContent = turn.length ? `${turn.length} call${turn.length === 1 ? '' : 's'}${edits ? ` · ${edits} edit${edits === 1 ? '' : 's'}` : ''}${read ? ` · ≈${k(read)} tok read` : ''}${fails ? ` · ${fails} failed` : ''}` : (log.length ? '' : 'tool calls show here');
      sum.title = 'This reply: tool calls, code edits, and about how many tokens the director read from the tool results (text + pictures)';
      strip.classList.toggle('busy', log.some((e) => e.running) || Boolean(Native.pendingFor?.(agent.id)));
      rail.classList.toggle('busy', strip.classList.contains('busy'));
      rail.title = `Show the ${agent.name} chat${strip.classList.contains('busy') ? ' (working…)' : ''}${rail.classList.contains('unread') ? ' · a new reply' : ''} · Alt+Shift+D`;
      const img = HubBridge.lastImage();
      thumb.hidden = !img || !prefixes.some((p) => img.tool.startsWith(p));
      if (!thumb.hidden && thumb.firstChild.src !== img.url) thumb.firstChild.src = img.url;
      if (toolId === 'three' && typeof ThreeDirector !== 'undefined') {
        const h = ThreeDirector.history().at(-1);
        undoBtn.disabled = !h;
        undoBtn.title = h ? `Undo the director's last code edit: "${h.layer}" (${nameOf(h.tool)}, ${timeAgo(h.at)})${ThreeDirector.history().length > 1 ? ` · ${ThreeDirector.history().length} in its history` : ''}` : 'Undo the director\'s last code edit (none yet)';
      }
      if (listOpen) paintList(log);
    }
    function paintList(log) {
      list.replaceChildren(el('div', { class: 'dd-list-head' }, el('b', { text: 'Director activity' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost small', text: 'Clear', on: { click: () => { HubBridge.clearLog(); } } })),
      ...(log.length ? log.slice(-25).reverse().map((e) => el('div', { class: `dd-row${e.ok === false ? ' failed' : ''}` },
        el('span', { class: 'dd-row-icon', text: iconOf(e.tool) }),
        el('span', { class: 'dd-row-name', text: nameOf(e.tool) }),
        el('span', { class: 'dd-row-sum', text: e.error || e.summary || '' }),
        el('span', { class: 'dd-row-ms', text: e.running ? '…' : `${e.tokens ? `≈${e.tokens} tok · ` : ''}${e.ms < 1000 ? `${e.ms} ms` : `${(e.ms / 1000).toFixed(1)} s`}` })))
        : [el('p', { class: 'hint', text: 'No tool calls yet.' })]));
    }
    calls.addEventListener('click', () => { listOpen = !listOpen; list.hidden = !listOpen; paint(); });
    document.addEventListener('pointerdown', (e) => { if (listOpen && !strip.contains(e.target)) { listOpen = false; list.hidden = true; } });
    thumb.addEventListener('click', () => viewImage(HubBridge.lastImage(), agent.id));
    undoBtn.addEventListener('click', () => undoEdit());
    askBtn.addEventListener('click', (e) => { const r = askBtn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, menuItems()); e.stopPropagation(); });
    foldBtn.addEventListener('click', () => setCollapsed(s, true));
    rail.addEventListener('click', () => { rail.classList.remove('unread'); setCollapsed(s, false); });

    function menuItems() {
      return [
        ...chipList(toolId).map((c) => ({ label: c.label, action: () => useChip(c) })),
        { label: store.get('director.chips', true) ? 'Hide the quick chips' : 'Show the quick chips', action: () => { store.set('director.chips', !store.get('director.chips', true)); refreshAll(); } },
        { label: 'Add a quick chip…', action: async () => { const t = await Modal.prompt('New quick chip', { label: 'What it sends to the director (start with / to run a command instead)' }); if (t?.trim()) { store.set(`director.chips.${toolId}`, [...store.get(`director.chips.${toolId}`, []), t.trim()]); refreshAll(); } } },
        ...(toolId === 'three' ? [{ label: 'Redo the undone edit', action: () => redoEdit() }] : []),
        { label: 'What this director costs per message', action: () => Commands.exec('/director-cost', agent.id) },
        { label: 'Collapse to a thin bar', action: () => setCollapsed(s, true) },
      ];
    }
    function useChip(c) {
      if (c.run) { Commands.exec(c.run, agent.id); return; }
      if (Native.pendingFor?.(agent.id)) { Native.setDraft?.(agent.id, c.send); toast('The director is busy: your ask is in the chat box'); return; }
      Native.sendText(agent.id, c.send);
    }
    function paintChips() {
      const on = store.get('director.chips', true);
      chips.hidden = !on;
      chips.replaceChildren(...chipList(toolId).map((c) => el('button', {
        type: 'button', class: `dd-chip${c.run && !c.title ? ' local' : ''}`, text: c.label,
        title: c.title || (c.run ? `${c.run} (runs here: no tokens)` : `Ask the director: ${c.send}`),
        on: { click: () => useChip(c), contextmenu: (e) => { if (!c.own) return; e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Remove this chip', danger: true, action: () => { store.set(`director.chips.${toolId}`, store.get(`director.chips.${toolId}`, []).filter((t) => t !== (c.run || c.send))); refreshAll(); } }]); } },
      })));
    }

    // ---------- placing it in the dock ----------
    function place() {
      if (strip.parentElement !== s.dock) s.dock.prepend(strip);
      const composer = s.dock.querySelector('form.composer');
      if (composer && chips.nextElementSibling !== composer) composer.before(chips);
      if (rail.parentElement !== s.dock) s.dock.append(rail);
    }
    place();
    paintChips();
    paint();

    const offCall = HubBridge.onCall(() => paint());
    const offHist = typeof ThreeDirector !== 'undefined' ? ThreeDirector.onHistory(() => paint()) : () => {};
    const onSend = (agentId) => { if (agentId === agent.id) { turnFrom = Date.now(); setTimeout(paint, 30); } };
    const onEvent = (ev, chat) => {
      if (chat?.agentId !== agent.id) return;
      // a reply that finished while the chat was folded: a gold dot on the thin bar until you open it
      if (ev?.type === 'done' && s.el.classList.contains('dock-collapsed')) rail.classList.add('unread');
      setTimeout(() => { place(); paint(); }, 30);
    };
    Native.hooks.send.push(onSend);
    Native.hooks.event.push(onEvent);
    // the chat re-renders its own parts: put the strip / chips back if a re-mount dropped them
    const mo = new MutationObserver(() => { if (!s.dock.contains(strip) || !s.dock.contains(chips)) place(); });
    mo.observe(s.dock, { childList: true });

    applyCollapsed(s);
    divider(s);
    const entry = {
      s, agentId: agent.id, strip, chips, rail, paint, paintChips,
      off() {
        offCall(); offHist(); mo.disconnect();
        Native.hooks.send.splice(Native.hooks.send.indexOf(onSend) >>> 0, 1);
        Native.hooks.event.splice(Native.hooks.event.indexOf(onEvent) >>> 0, 1);
        strip.remove(); chips.remove(); rail.remove();
      },
    };
    attached.set(toolId, entry);
    return entry;
  }
  function detach(toolId) { attached.get(toolId)?.off(); attached.delete(toolId); }
  function refreshAll() { for (const a of attached.values()) { a.paintChips(); a.paint(); } }

  // ---------- collapse / width ----------
  const WIDTHS = [360, 420, 520, 640, 760];
  function applyCollapsed(s) {
    const on = store.get(`dockCollapsed.${s.tool.id}`, false) && !s.dock.hidden;
    s.el.classList.toggle('dock-collapsed', on);
  }
  function setCollapsed(s, on) {
    store.set(`dockCollapsed.${s.tool.id}`, on);
    if (!on && s.dock.hidden) Tools.openDock(s.tool.id);
    applyCollapsed(s);
    if (!on) setTimeout(() => s.dock.querySelector('.composer textarea')?.focus(), 50);
  }
  function setWidth(s, w) {
    const max = Math.max(300, Math.min(900, Math.round(s.el.clientWidth * 0.7) || 900));
    const px = Math.round(Math.max(300, Math.min(max, w)));
    s.el.style.setProperty('--dock-w', `${px}px`);
    store.set(`dockWidth.${s.tool.id}`, px);
    if (store.get(`dockCollapsed.${s.tool.id}`, false)) setCollapsed(s, false);
    return px;
  }
  const widthOf = (s) => parseInt(s.el.style.getPropertyValue('--dock-w'), 10) || store.get(`dockWidth.${s.tool.id}`, 420);
  function divider(s) {
    if (s.divider.dataset.dd) return;
    s.divider.dataset.dd = '1';
    s.divider.title = 'Drag to resize the chat · double-click: collapse / expand · right-click: sizes';
    s.divider.addEventListener('dblclick', () => setCollapsed(s, !store.get(`dockCollapsed.${s.tool.id}`, false)));
    s.divider.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [...WIDTHS.map((w) => ({ label: `${w} px${widthOf(s) === w ? ' ✓' : ''}`, action: () => setWidth(s, w) })),
        { label: 'Reset (420 px)', action: () => setWidth(s, 420) }, { label: 'Collapse to a thin bar', action: () => setCollapsed(s, true) }]);
    });
  }

  // ---------- undo ----------
  async function undoEdit({ force = false } = {}) {
    if (typeof ThreeDirector === 'undefined') { toast('Only the Three Director keeps an edit history', { type: 'error' }); return null; }
    try {
      const h = await ThreeDirector.undo({ force });
      toast(`Undid the director's edit to "${h.layer}"${h.errors ? ` (${h.errors} error${h.errors === 1 ? '' : 's'} now)` : ''}`, { action: { label: 'Redo', fn: () => redoEdit() } });
      return h;
    } catch (err) {
      const changed = /changed after/.test(err.message);
      toast(changed ? err.message.replace(/ \/undo-edit force.*/, '') : err.message, { type: 'error', timeout: 7000, ...(changed ? { action: { label: 'Undo anyway', fn: () => undoEdit({ force: true }) } } : {}) });
      return null;
    }
  }
  async function redoEdit() {
    try { const h = await ThreeDirector.redo(); toast(`Redid the director's edit to "${h.layer}"`); return h; } catch (err) { toast(err.message, { type: 'error' }); return null; }
  }

  // ---------- the picture viewer ----------
  function viewImage(img, agentId) {
    if (!img) return;
    const dlg = el('dialog', { class: 'ui-modal dd-view' });
    const attach = async () => {
      const p = await window.hub.saveAttachment(`director-${Date.now()}.jpg`, img.url.split(',')[1]);
      await Native.attachPaths(agentId, [p]);
      dlg.close();
      toast('Attached to the chat');
    };
    dlg.append(el('form', { method: 'dialog' },
      el('h2', { text: `What the director saw (${nameOf(img.tool)}, ${timeAgo(img.at)})` }),
      el('img', { src: img.url, alt: '', class: 'dd-view-img' }),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', text: 'Attach to the chat', on: { click: attach } }),
        el('button', { type: 'submit', class: 'primary', text: 'Close' }))));
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    document.body.append(dlg);
    dlg.showModal();
  }

  // Alt+Shift+Z: undo the director's last edit · Alt+Shift+Y: redo · Alt+Shift+D: collapse / open the docked chat
  // (in a tool with a docked director).
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const toolId = H.isTool?.(H.activeId) ? H.activeId.slice(5) : null;
    const a = toolId && attached.get(toolId);
    if (!a) return;
    if (e.code === 'KeyZ' && toolId === 'three') { e.preventDefault(); undoEdit(); } else if (e.code === 'KeyY' && toolId === 'three') { e.preventDefault(); redoEdit(); } else if (e.code === 'KeyD') { e.preventDefault(); setCollapsed(a.s, !store.get(`dockCollapsed.${toolId}`, false)); }
  });

  return {
    attach, detach, refreshAll, applyCollapsed, undoEdit, redoEdit, setCollapsed, setWidth, widthOf, viewImage, chipList, iconOf, ICONS, CHIPS, WIDTHS,
    entry: (toolId) => attached.get(toolId) || null,
    surface: (toolId) => attached.get(toolId)?.s || H.surfaces.get(`tool:${toolId}`) || null,
  };
})();
