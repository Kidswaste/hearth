// The board, from anywhere: a drawer over any chat or tool (Ctrl+Shift+M, the small ▦ in the rail, /board-peek)
// with the chat's linked board (or the current one). Drag a reference — or the board's vibe — into any chat's
// composer: the chat gets its VIBE as a short text attachment (palette, light, texture, motion, pacing, mood, your
// notes), never the file. Also the one place that turns references into text for chats (vibeText / attach).
const BoardDrawer = (() => {
  const B = Board; const D = BoardData; const V = BoardVibe;
  const REF_TYPE = 'application/x-hearth-ref';
  const RULE = '(References give a vibe only: don\'t put the reference media itself in the result unless I ask for the clip.)';
  let root = null; let open = false; let shownBoard = null; let query = '';

  // ---------- references → text ----------
  // Items inside a frame named like "Avoid" / "Don't", or stamped ✕, become an "avoid" line instead.
  const isAvoid = (b, it) => it.stamp === '✕' || b.items.some((f) => f.type === 'frame' && /avoid|don.?t|not this|\bno\b/i.test(f.title || '') && it.x + it.w / 2 >= f.x && it.x + it.w / 2 <= f.x + f.w && it.y + it.h / 2 >= f.y && it.y + it.h / 2 <= f.y + f.h);
  function vibeText({ board, itemIds = [], focus = 'full', rule = true } = {}) {
    const b = board || B.current();
    if (!b) return '';
    const fo = D.find(D.FOCUS, focus) || D.FOCUS[0];
    let body;
    if (itemIds.length) {
      const list = itemIds.map((id) => B.item(id, b)).filter(Boolean);
      body = `${fo.lead}:\n${list.map((it) => `- ${V.text(it, fo.keys)}`).join('\n')}`;
    } else {
      const items = b.items.filter((i) => i.type !== 'frame');
      const avoid = items.filter((i) => isAvoid(b, i));
      body = `${fo.lead}:\n${V.boardText(b.name, items.filter((i) => !avoid.includes(i)), fo.keys, { avoid: fo.id === 'full' || fo.id === 'lab' ? avoid : [] })}`;
    }
    return rule ? `${body}\n${RULE}` : body;
  }
  // The chat on screen: a native agent, or the director docked in the visible tool, or Claude.
  function currentAgentId() {
    const id = H.activeId;
    if (H.agent(id)?.mode === 'native') return id;
    if (H.isTool?.(id)) { const d = Tools.dockedAgent(id.slice(5)); if (d) return d.id; }
    return H.claudeAgent()?.id || null;
  }
  const currentChatId = () => { const a = currentAgentId(); return a ? H.activeChat?.[a] || null : null; };
  // Attach a vibe to a chat's next message (a small text attachment chip); send: true sends it at once.
  async function attach(agentId, { boardId, itemIds = [], focus = 'full', send = false, quiet = false } = {}) {
    agentId ||= currentAgentId();
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') { toast('Pick a Claude or Astra chat', { type: 'error' }); return null; }
    const b = boardId ? await B.load(boardId) : B.current();
    const text = vibeText({ board: b, itemIds, focus });
    const label = itemIds.length === 1 ? B.item(itemIds[0], b)?.title || 'reference' : itemIds.length ? `${itemIds.length} references` : b.name;
    const fo = D.find(D.FOCUS, focus);
    const name = `vibe · ${String(label).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40)}${fo && fo.id !== 'full' ? ` (${fo.name.toLowerCase()})` : ''}.txt`;
    if (!Native.hasView(agentId)) { activate(agentId); await new Promise((r) => setTimeout(r, 80)); }
    if (send) { await Native.addFiles(agentId, [new File([text], name, { type: 'text/plain' })]); Native.sendText(agentId, itemIds.length ? 'Use the vibe of these references.' : `Use the vibe of my board "${b.name}".`); }
    else {
      await Native.addFiles(agentId, [new File([text], name, { type: 'text/plain' })]);
      if (H.activeId !== agentId && H.surfaceIdFor(H.activeId) !== H.surfaceIdFor(agentId)) activate(agentId); else Native.focus(agentId);
    }
    if (!quiet) toast(`Vibe attached to ${agent.name}'s message: ${label}`);
    return text;
  }

  // ---------- drag a reference into any chat ----------
  const viewUnder = (target) => H.agents().find((a) => a.mode === 'native' && Native.view(a.id)?.root?.contains(target)) || null;
  let hinted = null;
  addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(REF_TYPE)) return;
    const a = viewUnder(e.target);
    const v = a && Native.view(a.id);
    if (hinted && hinted !== v?.form) { hinted.classList.remove('bdd-drop-hint'); hinted = null; }
    if (!v) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy';
    if (hinted !== v.form) { hinted = v.form; hinted.classList.add('bdd-drop-hint'); }
  }, true);
  addEventListener('drop', (e) => {
    if (!e.dataTransfer?.types.includes(REF_TYPE)) return;
    hinted?.classList.remove('bdd-drop-hint'); hinted = null;
    const a = viewUnder(e.target);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    let ref = {}; try { ref = JSON.parse(e.dataTransfer.getData(REF_TYPE)); } catch { /* bad payload */ }
    attach(a.id, { boardId: ref.boardId, itemIds: ref.itemIds || [], focus: ref.focus || 'full' });
  }, true);
  addEventListener('dragend', () => { hinted?.classList.remove('bdd-drop-hint'); hinted = null; }, true);
  function dragRef(e, boardId, itemIds) {
    const b = B.current();
    e.dataTransfer.setData(REF_TYPE, JSON.stringify({ boardId, itemIds }));
    // dropped in any other text field, it types the vibe
    e.dataTransfer.setData('text/plain', vibeText({ board: b?.id === boardId ? b : b, itemIds }));
    e.dataTransfer.effectAllowed = 'copy';
  }

  // ---------- the drawer ----------
  function build() {
    root = el('aside', { class: 'bdd', attrs: { 'aria-label': 'Board drawer' } });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggle(false); } });
    document.body.append(root);
    B.onChange((what) => { if (open && ['items', 'vibe', 'open', 'boards', 'links'].includes(what)) renderSoon(); });
    addEventListener('hearth:view', () => { if (open) renderSoon(); });
  }
  const renderSoon = debounce(() => render(), 120);
  async function render() {
    if (!root) return;
    await B.ready();
    const chatId = currentChatId();
    const linked = chatId ? await B.boardFor(chatId) : null;
    const b = shownBoard ? await B.load(shownBoard) || B.current() : linked || B.current();
    const sel = el('select', { title: 'Board', on: { change: async () => { shownBoard = sel.value; render(); } } },
      B.boards().map((x) => el('option', { value: x.id, text: `${x.name} (${x.count || 0})`, selected: x.id === b.id })));
    const isLinked = Boolean(chatId && B.boards().find((x) => x.id === b.id)?.chats?.includes(chatId));
    const items = b.items.filter((i) => i.type !== 'frame');
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = words.length && Board._.haystack ? items.filter((i) => words.every((w) => Board._.haystack(i).includes(w))) : items;
    const s = V.summary(items);
    const agentName = H.agent(currentAgentId())?.name || 'the chat';
    const vibe = el('div', { class: 'bdd-vibe', draggable: true, title: `Drag into a chat (or click) to attach the whole board's vibe`,
      on: { dragstart: (e) => dragRef(e, b.id, []), click: (e) => showMenu(e.clientX, e.clientY, D.FOCUS.map((f) => ({ label: `${f.name} → ${agentName}`, action: () => attach(null, { boardId: b.id, focus: f.id }) }))) } },
    el('div', { class: 'bd-pal' }, s.palette.map((c) => el('span', { style: { background: c.hex, '--s': String(c.share) } }))),
    el('div', { text: [s.light != null ? `${V.words.keyWord(s.light)}, ${V.words.contrastWord(s.contrast)} contrast` : null, s.sat != null ? V.words.satWord(s.sat) : null, s.motion != null ? `motion ${V.words.motionWord(s.motion)}` : null, s.moods.slice(0, 3).join(', ')].filter(Boolean).join(' · ') || 'Add pictures, clips or sites: Hearth reads their vibe.' }));
    const tile = (it) => {
      const img = it.tiny || it.thumb || it.poster || (it.type === 'web' || it.type === 'image' ? it.src : null);
      const t = el('div', { class: 'bdd-tile', draggable: true, title: `${it.title || it.type}\nDrag into a chat to attach its vibe`, on: { dragstart: (e) => dragRef(e, b.id, [it.id]) } },
        img ? el('img', { src: B.fileUrl(img), alt: '', loading: 'lazy', draggable: false }) : null,
        it.type === 'swatch' || it.type === 'palette' ? el('div', { class: 'bdd-t', style: { background: it.type === 'swatch' ? it.color : `linear-gradient(90deg, ${(it.colors || []).join(', ')})` } }) : null,
        it.type === 'note' || it.type === 'text' ? el('div', { class: 'bdd-t', text: String(it.text || '').replace(/[*_#`>]+/g, ''), style: { background: it.type === 'note' ? (D.NOTE_STYLES.find((q) => q.id === it.style) || D.NOTE_STYLES[0]).bg : 'var(--surface)', color: it.type === 'note' ? (D.NOTE_STYLES.find((q) => q.id === it.style) || D.NOTE_STYLES[0]).fg : 'inherit' } }) : null,
        el('span', { class: 'bdd-k', text: it.stamp || V.KIND_WORD[it.type] || it.type }),
        el('button', { class: 'bdd-send', text: '→', title: `Attach its vibe to ${agentName}`, on: { click: (e) => { e.stopPropagation(); attach(null, { boardId: b.id, itemIds: [it.id] }); } } }));
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
        ...D.FOCUS.slice(0, 9).map((f) => ({ label: `${f.name} → ${agentName}`, action: () => attach(null, { boardId: b.id, itemIds: [it.id], focus: f.id }) })),
        { label: 'Show on the board', action: async () => { activate('tool:board'); await B.open(b.id); setTimeout(() => { B.select(it.id); B.zoomSel(); }, 120); } },
      ]); });
      return t;
    };
    const search = el('input', { class: 'bdd-search', type: 'search', placeholder: 'Find: words, #tags, colors, moods…', value: query, on: { input: (e) => { query = e.target.value; renderGrid(); } } });
    const grid = el('div', { class: 'bdd-grid' });
    const renderGrid = () => { const w2 = query.toLowerCase().split(/\s+/).filter(Boolean); grid.replaceChildren(...(w2.length && Board._.haystack ? items.filter((i) => w2.every((w) => Board._.haystack(i).includes(w))) : items).slice(0, 300).map(tile)); };
    root.replaceChildren(
      el('div', { class: 'bdd-head' }, sel,
        el('button', { text: '↗', title: 'Open the board', on: { click: async () => { await B.open(b.id); activate('tool:board'); toggle(false); } } }),
        el('button', { text: '✕', title: 'Close (Esc / Ctrl+Shift+M)', on: { click: () => toggle(false) } })),
      search, vibe, grid,
      el('div', { class: 'bdd-foot' },
        chatId ? el('button', { text: isLinked ? '✓ Linked to this chat' : 'Link to this chat', title: 'A linked board opens here first, and /board-use uses it', on: { click: () => { if (isLinked) B.unlinkChat(chatId); else B.linkChat(chatId, b.id); } } }) : null,
        el('span', { class: 'spacer' }), el('span', { text: `${items.length} ref${items.length === 1 ? '' : 's'}` }),
        el('button', { text: '+', title: 'Add pictures or clips to this board', on: { click: async () => { const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'Add to the board' }); if (paths?.length) { await B.open(b.id); await B.addFiles(paths); } } } })));
    renderGrid();
    void shown;
  }
  function toggle(on = !open) {
    if (!root) build();
    open = on;
    root.classList.toggle('open', open);
    railBtn?.classList.toggle('on', open);
    if (open) { shownBoard = null; render(); setTimeout(() => root.querySelector('.bdd-search')?.focus(), 60); }
    return open;
  }

  // ---------- reachable from anywhere ----------
  let railBtn = null;
  function addRailButton() {
    const rail = document.getElementById('rail'); const before = document.getElementById('palette-btn');
    if (!rail || !before || railBtn) return;
    railBtn = el('button', { class: 'tool-btn bd-rail-peek', title: 'Board drawer (Ctrl+Shift+M): your references; drag one into a chat for its vibe', dataset: { feature: 'Board › Drawer' }, on: { click: () => toggle() } });
    railBtn.append(Icons.node?.('board') || document.createTextNode('▦'));
    railBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
      { label: 'Open the board', action: () => activate('tool:board') },
      { label: 'Use the board\'s vibe in this chat', action: () => attach(null, {}) },
      { label: 'Link the board to this chat', action: () => { const c = currentChatId(); if (c) { B.linkChat(c); toast('Linked'); } else toast('Open a chat first'); } },
      { label: 'New board…', action: async () => { const n = await Modal.prompt('New board', { value: 'New board' }); if (n) B.create(n); } },
    ]); });
    rail.insertBefore(railBtn, before);
  }
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);
  try {
    Keys.add({ area: 'Board', keys: 'Ctrl+Shift+M', what: 'board drawer over any chat or tool (also the ▦ in the rail, /board-peek)' });
    Keys.add({ area: 'Board', keys: 'Drag a reference into a chat', what: 'attach its vibe (not the file) to your next message' });
    Keys.add({ area: 'Board', keys: 'Right-click a drawer tile', what: 'attach only its palette, light, motion… to the chat' });
  } catch { /* keys.js not loaded */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addRailButton); else addRailButton();
  addEventListener('load', addRailButton);

  return { toggle, attach, vibeText, currentAgentId, currentChatId, isOpen: () => open, render, RULE, REF_TYPE };
})();
