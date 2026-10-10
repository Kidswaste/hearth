// Board eyes, the owner's side (round 14): show board items to a chat as real pictures, ask about them, and see
// what a chat looked at.
//   Show / ask    right-click an item (or the selection, a frame, the board) › Show to a chat; the drawer's tiles too;
//                 Alt+drop a drawer tile on a chat; drag an item off the board onto a docked chat. The pictures go
//                 with YOUR next message (small, 512 px; nothing is sent until you send), with their ids.
//   In the chat   every board_look / board_watch / pinterest call shows as one quiet card in the reply: what was sent
//                 (pictures, size, ≈ tokens), the items (click = jump to it on the board), the Pinterest searches as
//                 buttons; item ids a reply names (i3) become links to the item.
//   Commands      /board look · watch · compare · find · pinterest (and /board-show, /board-watch, /board-find,
//                 /board-pinterest, /board-alt).
const BoardEyesUI = (() => {
  const B = Board; const V = BoardVibe; const E = BoardEyes;
  const nativeAgents = () => H.agents().filter((a) => a.mode === 'native');
  const KEYS = (keys, what) => { try { Keys.add({ area: 'Board', keys, what }); } catch { /* keys.js not loaded */ } };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- show board things to a chat (they ride with the owner's next message) ----------
  async function picturesFor(b, { itemIds = [], whole = false, frameId = null, size = 'small', compare = false, watch = null } = {}) {
    const list = itemIds.map((id) => B.item(id, b)).filter(Boolean);
    let canvases; let items;
    if (watch && list[0]) {
      const fr = await E.framesOf(list[0], { ...watch, width: Math.round(E.WIDE[size] / 2) });
      canvases = [await E.contactSheet(fr, { size, title: `${list[0].title || list[0].id} · ${Math.round(fr.duration * 10) / 10}s` })]; items = [list[0]];
    } else if (compare && list.length >= 2) {
      const r = await E.compare({ board: b.id, items: list.map((i) => i.id), size });
      if (!r.ok) throw new Error(r.error);
      return { files: r.images.map((im, i) => ({ data: im.data, name: `board compare ${i + 1}.jpg` })), items: list, sent: r.value.sent, tokens: r.eyes.tokens };
    } else if (whole || frameId || !list.length) {
      const fr = frameId ? B.item(frameId, b) : null;
      const o = await E.overview(b, { size, frame: fr });
      canvases = [o.canvas]; items = o.items;
    } else if (list.length <= 3) {
      canvases = [];
      for (const it of list) canvases.push(it.type === 'video' || it.type === 'gif' ? await E.contactSheet(await E.framesOf(it, { count: 4, width: 320 }), { size, title: it.title || it.id }).catch(() => E.stillOf(it, E.SIZES[size])) : await E.stillOf(it, E.SIZES[size]));
      items = list;
    } else {
      items = list.slice(0, 12); canvases = [(await E.sheet(items, { size })).canvas];
    }
    const p = E.pack(canvases);
    return { files: p.images.map((im, i) => ({ data: im.data, name: `board ${items.length === 1 ? String(items[0].title || items[0].id).slice(0, 30) : whole ? b.name : `${i + 1}`}.jpg` })), items, sent: p.sent, tokens: p.tokens };
  }
  const b64File = (data, name) => { const bin = atob(data); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name.replace(/[\\/:*?"<>|]+/g, ' '), { type: 'image/jpeg' }); };
  async function showTo(agentId, { boardId = null, itemIds = [], whole = false, frameId = null, size = 'small', ask = null, compare = false, watch = null, quiet = false } = {}) {
    agentId ||= BoardDrawer.currentAgentId();
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') { toast('Pick a Claude or Astra chat', { type: 'error' }); return null; }
    await B.ready();
    const chatId = H.activeChat?.[agentId];
    const b = boardId ? await B.load(boardId) : (chatId && await B.boardFor(chatId).catch(() => null)) || B.current();
    const r = await picturesFor(b, { itemIds, whole, frameId, size, compare, watch });
    if (!Native.hasView(agentId)) { activate(agentId); await new Promise((res) => setTimeout(res, 80)); }
    const ids = r.items.slice(0, 16).map((i) => E.label(i)).join('; ');
    const note = `Board pictures from "${b.name}"${whole ? ' (the whole board, ids on it)' : ''}: ${ids}. ${E.RULE}`;
    await Native.addFiles(agentId, [...r.files.map((f) => b64File(f.data, f.name)), new File([note], 'board ids.txt', { type: 'text/plain' })]);
    remember(agentId, { board: b.id, boardName: b.name, items: r.items.slice(0, 16).map((i) => ({ id: i.id, title: i.title || V.KIND_WORD[i.type] || i.type })), pictures: r.files.length, size: r.sent, tokens: r.tokens, by: 'owner' });
    if (ask) Native.sendText(agentId, ask);
    else if (H.activeId !== agentId && H.surfaceIdFor(H.activeId) !== H.surfaceIdFor(agentId)) activate(agentId); else Native.focus(agentId);
    if (!quiet) toast(ask ? `Asked ${agent.name} with ${r.sent}` : `${r.sent} ready for ${agent.name}: add your words and send`, { timeout: 2600 });
    return r;
  }
  async function askAbout(agentId, opts = {}) {
    agentId ||= BoardDrawer.currentAgentId();
    const n = opts.whole ? 'the board' : opts.itemIds?.length === 1 ? 'this' : `these ${opts.itemIds?.length || ''}`.trim();
    const q = await Modal.prompt(`Ask ${H.agent(agentId)?.name || 'the chat'} about ${n}`, { value: '', label: 'The picture goes with your question (small, 512 px).' });
    if (!q || !q.trim()) return null;
    return showTo(agentId, { ...opts, ask: q.trim() });
  }
  // what the owner showed stays with the chat (so ids in the reply link back to the board)
  const shown = new Map(); // agentId → record, until the next reply finishes
  function remember(agentId, rec) { shown.set(agentId, rec); }

  // ---------- menus ----------
  const chatsMenu = (fn) => [...nativeAgents().map((a) => ({ label: a.name, action: () => fn(a.id) })), ...(nativeAgents().length ? [] : [{ label: 'No chat yet', disabled: true }])];
  function itemsMenu(list, b = B.current()) {
    const ids = list.map((i) => i.id);
    const clip = list.length === 1 && (list[0].type === 'video' || list[0].type === 'gif') ? list[0] : null;
    return [
      { label: 'Show to a chat', items: () => [
        ...chatsMenu((id) => showTo(id, { boardId: b.id, itemIds: ids })),
        '-',
        { label: 'Ask about it…', action: () => askAbout(null, { boardId: b.id, itemIds: ids }) },
        clip ? { label: 'Show its frames (contact sheet)', action: () => showTo(null, { boardId: b.id, itemIds: ids, watch: { count: 6 } }) } : null,
        clip ? { label: 'One frame per shot', action: () => showTo(null, { boardId: b.id, itemIds: ids, watch: { mode: 'scenes', count: 8 } }) } : null,
        list.length >= 2 && list.length <= 4 ? { label: 'Side by side', action: () => showTo(null, { boardId: b.id, itemIds: ids, compare: true }) } : null,
        { label: 'Bigger (1024 px)', action: () => showTo(null, { boardId: b.id, itemIds: ids, size: 'medium' }) },
      ].filter(Boolean) },
      list.length === 1 && ['image', 'gif', 'video', 'web'].includes(list[0].type) ? { label: list[0].alt ? 'Alt text (what it shows)…' : 'Write its alt text…', action: () => editAlt(list[0]), more: true } : null,
    ].filter(Boolean);
  }
  async function editAlt(it) {
    const t = await Modal.prompt('What it shows', { value: it.alt || '', label: 'One line chats read instead of looking again (alt text).' });
    if (t == null) return;
    B.patch([it.id], { alt: t.trim() || undefined, altBy: t.trim() ? 'owner' : undefined }, 'alt text');
  }
  function hookMenus() {
    const baseExtras = B._.itemExtras;
    B._.itemExtras = (list) => [...itemsMenu(list), ...(baseExtras?.(list) || [])];
    const baseBoard = B._.boardItems;
    B._.boardItems = () => [...baseBoard(),
      { label: 'Show the board to a chat', items: () => [...chatsMenu((id) => showTo(id, { whole: true, boardId: B.current().id })), '-', { label: 'Ask about the board…', action: () => askAbout(null, { whole: true, boardId: B.current().id }) }] },
      { label: 'Pinterest: find more like this', items: () => pinItems() }];
    // a frame: show what is inside it as one picture
    const baseFrame = B._.itemExtras;
    B._.itemExtras = (list) => (list.length === 1 && list[0].type === 'frame'
      ? [{ label: 'Show this frame to a chat', items: () => chatsMenu((id) => showTo(id, { boardId: B.current().id, frameId: list[0].id })) }, ...(baseFrame(list) || []).filter((x) => x.label !== 'Show to a chat')]
      : baseFrame(list));
  }
  function pinItems() {
    const s = BoardPins.suggest(V.summary(B.items().filter((i) => i.type !== 'frame' && i.type !== 'link')), { brief: B.current().brief || '' });
    return [...s.phrases.map((p) => ({ label: `📌 ${p}`, action: () => BoardPins.open(p) })), '-', { label: 'Your own words…', action: async () => { const w = await Modal.prompt('Pinterest: an aesthetic or words', { value: '' }); if (w) { const s2 = await BoardPins.forBoard(B.current(), w); BoardPins.open(s2.phrases[0]); } } }, { label: 'Open Pinterest (sign in)', action: () => BoardPins.open('') }];
  }

  // drag an item off the board onto a chat beside it (a docked chat): show it there instead of moving it
  function viewAt(x, y) {
    const t = document.elementFromPoint(x, y);
    if (!t || t.closest('.bd-vp, .bd-root')) return null;
    return nativeAgents().find((a) => Native.view(a.id)?.root?.contains(t)) || null;
  }
  B._.dropOut = (e, drag) => {
    if (e.altKey) return false;
    const a = viewAt(e.clientX, e.clientY);
    if (!a) return false;
    for (const it of drag.items) { const s = drag.start.get(it.id); if (s) { it.x = s.x; it.y = s.y; } }
    if (B._.S.undo.at(-1)?.label === 'move') B._.S.undo.pop();
    B._.renderAll?.();
    const ids = drag.items.filter((i) => i.type !== 'frame').map((i) => i.id);
    showTo(a.id, { boardId: B.current().id, itemIds: ids.length ? ids : drag.items.map((i) => i.id) });
    return true;
  };

  // ---------- in the chat: what a chat looked at ----------
  const live = new Map(); // chatId → [records] while a reply runs
  async function thumbOf(images) {
    const im = images?.[0]; if (!im?.data) return null;
    try {
      const img = await V.loadImage(`data:${im.mime || 'image/jpeg'};base64,${im.data}`);
      const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch { return null; }
  }
  HubBridge.onResult?.(async ({ tool, result, chatId, agentId }) => {
    if (!result?.eyes || result.ok === false) return;
    const cid = chatId || (agentId ? Native.pendingFor?.(agentId) : null);
    if (!cid) return;
    const rec = { tool: tool === 'board_do' ? 'pinterest' : tool.replace(/^board_/, ''), ...result.eyes, at: Date.now() };
    rec.thumb = await thumbOf(result.images);
    const L = live.get(cid) || []; L.push(rec); live.set(cid, L.slice(-6));
    Native.liveCard?.(cid, card(rec));
    document.dispatchEvent(new CustomEvent('hearth:board-eyes', { detail: { chatId: cid, record: rec } }));
  });
  Native.hooks.send.push((agentId, chat) => {
    live.set(chat.id, []);
    const s = shown.get(agentId); shown.delete(agentId);
    if (s) live.get(chat.id).push({ tool: 'shown', ...s, at: Date.now() });
  });
  Native.hooks.finish.push((_event, chat, extras) => {
    const L = live.get(chat.id); live.delete(chat.id);
    if (L?.length) extras.eyes = L.map(({ tool, board, boardName, items, pictures, size, tokens, pins, thumb, by }) => ({ tool, board, boardName, items, pictures, size, tokens, ...(pins ? { pins } : {}), ...(thumb ? { thumb } : {}), ...(by ? { by } : {}) }));
  });
  const VERB = { look: 'Looked at', watch: 'Watched', compare: 'Compared', find: 'Found', shown: 'You showed', pinterest: 'Pinterest searches for' };
  function card(rec) {
    const items = (rec.items || []).slice(0, 8);
    const node = el('div', { class: `eyes-card${rec.pins ? ' eyes-pins' : ''}`, title: rec.size ? `Sent to the chat: ${rec.size}` : '' },
      rec.thumb ? el('img', { class: 'eyes-thumb', src: rec.thumb, alt: '', draggable: false, title: 'Open on the board', on: { click: () => jump(rec.board, items[0]?.id) } }) : null,
      el('div', { class: 'eyes-main' },
        el('div', { class: 'eyes-head' }, el('span', { class: 'eyes-eye', text: rec.pins ? '📌' : '👁' }), ` ${VERB[rec.tool] || 'Looked at'} `, el('b', { text: rec.boardName || 'the board' }),
          rec.pictures ? el('span', { class: 'eyes-size', text: ` · ${rec.size}` }) : null),
        items.length ? el('div', { class: 'eyes-items' }, items.map((i) => ref(rec.board, i.id, `${i.id} ${String(i.title || '').slice(0, 26)}`)), (rec.items || []).length > 8 ? el('span', { class: 'eyes-more', text: `+${rec.items.length - 8}` }) : null) : null,
        rec.pins?.length ? el('div', { class: 'eyes-items' }, rec.pins.map((p) => el('button', { type: 'button', class: 'eyes-pin', text: p, title: 'Open this Pinterest search in a Hearth window: ＋ Board on a pin adds it', on: { click: () => BoardPins.open(p) } }))) : null));
    return node;
  }
  const ref = (board, id, text) => el('a', { class: 'eyes-ref', href: '#', text, dataset: { board: board || '', item: id }, title: 'Show it on the board' });
  async function jump(boardId, itemId) {
    activate('tool:board');
    await B.ready();
    if (boardId && B.current()?.id !== boardId) { const ok = await B.open(boardId); if (!ok) { toast('That board is gone'); return false; } }
    await new Promise((r) => setTimeout(r, B.isMounted() ? 60 : 300));
    const it = itemId && B.item(itemId);
    if (!it) { if (itemId) toast(`${itemId} is not on this board any more`); B.zoomFit(); return false; }
    B.select(itemId); B.zoomSel();
    setTimeout(() => { const n = B._.S.nodes.get(itemId); n?.animate?.([{ boxShadow: '0 0 0 0 rgba(255,194,51,.95)' }, { boxShadow: '0 0 0 18px rgba(255,194,51,0)' }], { duration: 900, iterations: 2 }); }, 450);
    return true;
  }
  addEventListener('click', (e) => {
    const a = e.target.closest?.('.eyes-ref');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    jump(a.dataset.board || null, a.dataset.item);
  }, true);
  // saved replies: their cards, and item ids in their text as links
  const ID = /\b(i[0-9a-z]{1,4})\b/g;
  function linkify(body, known, board) {
    const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('pre, a, .eyes-card') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
    let n = 0;
    for (const t of nodes) {
      const s = t.nodeValue; if (!ID.test(s)) continue; ID.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0; let m; let hit = false;
      while ((m = ID.exec(s))) {
        if (!known.has(m[1])) continue;
        frag.append(s.slice(last, m.index), ref(board, m[1], m[1])); last = m.index + m[1].length; hit = true; n++;
      }
      if (hit) { frag.append(s.slice(last)); t.replaceWith(frag); }
    }
    return n;
  }
  Native.hooks.message.push((node, m) => {
    if (m.role !== 'assistant' || !m.eyes?.length) return;
    const strip = el('div', { class: 'eyes-strip' }, m.eyes.map(card));
    const body = node.querySelector(':scope > .body');
    if (body) body.before(strip); else node.append(strip);
    const rec = m.eyes.find((r) => r.board) || {};
    const known = new Set(m.eyes.flatMap((r) => (r.items || []).map((i) => i.id)));
    const b = rec.board && B._.S.boards.get(rec.board);
    for (const it of b?.items || []) known.add(it.id);
    if (body && known.size) linkify(body, known, rec.board);
  });

  // ---------- the drawer: right-click a tile, Alt+drop it on a chat ----------
  function tileItems(b, it) {
    return [{ label: 'Show it to a chat', items: () => chatsMenu((id) => showTo(id, { boardId: b.id, itemIds: [it.id] })) }, { label: 'Ask about it…', action: () => askAbout(null, { boardId: b.id, itemIds: [it.id] }) }];
  }
  function altDrop(agentId, ref0) { return showTo(agentId, { boardId: ref0.boardId, itemIds: ref0.itemIds || [], whole: !ref0.itemIds?.length }); }

  // ---------- commands ----------
  const SIZE_W = ['small', 'medium', 'large'];
  // "/board look sel large", "/board look neon", "/board look frame Night", "/board look" (the board)
  async function parseWhat(args, b) {
    const w = String(args || '').trim().split(/\s+/).filter(Boolean);
    const size = SIZE_W.includes(w.at(-1)) ? w.pop() : 'small';
    const q = w.join(' ');
    if (!q || q === 'board' || q === 'all') return { whole: true, size };
    if (q === 'sel' || q === 'selection') { const s = B.selected(); if (!s.length) throw new Error('Nothing is selected on the board.'); return { itemIds: s.map((i) => i.id), size }; }
    if (/^frame\b/.test(q)) { const name = q.replace(/^frame\s*/, ''); const fr = b.items.find((i) => i.type === 'frame' && (!name || (i.title || '').toLowerCase().includes(name.toLowerCase()))); if (!fr) throw new Error(`No frame "${name}".`); return { frameId: fr.id, size }; }
    const byId = w.map((x) => b.items.find((i) => i.id === x)).filter(Boolean);
    if (byId.length === w.length) return { itemIds: byId.map((i) => i.id), size };
    const r = E.rank(b, q, 4).filter((x) => x.score >= (E.rank(b, q, 1)[0]?.score || 0) * 0.75);
    if (!r.length) throw new Error(`Nothing on "${b.name}" matches "${q}".`);
    return { itemIds: r.map((x) => x.it.id), size };
  }
  const boardOf = async (ctx) => (ctx?.chatId ? B.boardFor(ctx.chatId) : (await B.ready(), B.current()));
  const agentOf = (ctx) => (ctx?.agentId && H.agent(ctx.agentId)?.mode === 'native' ? ctx.agentId : BoardDrawer.currentAgentId());
  const SUB = {
    async look(args, ctx) { const b = await boardOf(ctx); const o = await parseWhat(args, b); const r = await showTo(agentOf(ctx), { boardId: b.id, ...o, quiet: true }); return r ? `👁 ${r.sent} from **${b.name}** (${r.items.slice(0, 6).map((i) => i.id).join(', ')}${r.items.length > 6 ? '…' : ''}) ready to go with your next message.` : null; },
    async watch(args, ctx) {
      const b = await boardOf(ctx); const w = String(args || '').trim().split(/\s+/).filter(Boolean);
      const mode = w.includes('scenes') || w.includes('shots') ? 'scenes' : 'even'; const n = Number(w.find((x) => /^\d+$/.test(x))) || 6;
      const size = SIZE_W.find((s) => w.includes(s)) || 'small';
      const q = w.filter((x) => !/^\d+$/.test(x) && !['scenes', 'shots', ...SIZE_W].includes(x)).join(' ');
      const clips = b.items.filter((i) => i.type === 'video' || i.type === 'gif');
      const it = (q && (b.items.find((i) => i.id === q) || E.rank(b, q, 6).map((x) => x.it).find((i) => i.type === 'video' || i.type === 'gif'))) || B.selected().find((i) => i.type === 'video' || i.type === 'gif') || (clips.length === 1 ? clips[0] : null);
      if (!it) return clips.length ? `Which clip? ${clips.slice(0, 8).map((i) => `${i.id} "${i.title || ''}"`).join(', ')}` : `No clips on **${b.name}**.`;
      const r = await showTo(agentOf(ctx), { boardId: b.id, itemIds: [it.id], watch: { count: n, mode }, size, quiet: true });
      return r ? `🎞 ${r.sent}: ${it.title || it.id} as ${mode === 'scenes' ? 'one frame per shot' : `${n} frames`}, ready to go with your next message.` : null;
    },
    async compare(args, ctx) { const b = await boardOf(ctx); const o = await parseWhat(args, b); const ids = o.itemIds || []; if (ids.length < 2) return 'Name two to four items (/board compare i3 i5) or select them.'; const r = await showTo(agentOf(ctx), { boardId: b.id, itemIds: ids.slice(0, 4), compare: true, size: o.size, quiet: true }); return r ? `⇆ ${r.sent} ready to go with your next message.` : null; },
    async find(args, ctx) {
      const b = await boardOf(ctx); const q = String(args || '').trim(); if (!q) return 'Describe it: /board find dark clip with pink light';
      const r = E.rank(b, q, 12); if (!r.length) return `Nothing on **${b.name}** matches "${q}".`;
      if (B.current().id !== b.id) await B.open(b.id);
      activate('tool:board'); setTimeout(() => { B.select(r.map((x) => x.it.id)); B.zoomSel(); }, B.isMounted() ? 60 : 300);
      return `Found ${plural(r.length, 'item')} on **${b.name}** (selected): ${r.slice(0, 8).map((x) => `${x.it.id} ${x.it.title ? `"${String(x.it.title).slice(0, 30)}"` : V.KIND_WORD[x.it.type]}`).join(', ')}`;
    },
    async pinterest(args, ctx) {
      const b = await boardOf(ctx); const words = String(args || '').trim();
      const s = await BoardPins.forBoard(b, words);
      if (words) BoardPins.open(s.phrases[0]);
      const actions = s.phrases.map((p) => ({ label: `📌 ${p}`, title: 'Open in the Pinterest window', run: () => BoardPins.open(p) }));
      const text = `**Pinterest searches** for ${words ? `“${words}” + ` : ''}**${b.name}**${s.colors.length ? ` · colors: ${s.colors.join(', ')}` : ''}${s.styles.length ? ` · styles: ${s.styles.slice(0, 5).join(', ')}` : ''}. ${words ? 'The first one is open; ' : ''}click one: ＋ Board on a pin adds it here (its link kept).`;
      if (ctx?.note) { ctx.note(text, { id: 'pinterest', actions }); return undefined; }
      return `${text}\n${s.phrases.map((p) => `• ${p}`).join('\n')}`;
    },
  };
  SUB.show = SUB.look; SUB.see = SUB.look;
  const SUB_HELP = [{ value: 'look', hint: 'show the board / sel / an item to this chat' }, { value: 'watch', hint: 'a clip as frames' }, { value: 'compare', hint: 'side by side' }, { value: 'find', hint: 'by description' }, { value: 'pinterest', hint: 'searches that match the vibe' }];
  function registerAll() {
    const base = Commands.get('board');
    if (base && !base.__eyes) {
      const run0 = base.run; const complete0 = base.complete;
      Commands.register({ ...base, override: true, __eyes: true, args: '[board | look | watch | compare | find | pinterest …]', examples: [...(base.examples || []), '/board look sel', '/board watch 8 scenes', '/board pinterest y2k chrome'],
        complete: (a, ctx) => { const w = String(a || ''); if (!w.includes(' ')) return [...SUB_HELP.filter((x) => x.value.startsWith(w.toLowerCase())), ...(complete0?.(a, ctx) || [])].slice(0, 16); const [v] = w.split(' '); if (v === 'look' || v === 'compare') return [{ value: `${v} sel` }, { value: `${v} board` }, { value: `${v} frame` }, ...SIZE_W.map((s) => ({ value: `${w.trim()} ${s}` }))]; if (v === 'pinterest') return Object.keys(BoardPins.AESTHETICS).map((k) => ({ value: `pinterest ${k}` })).filter((x) => x.value.startsWith(w)).slice(0, 16); return []; },
        run: async (args, ctx) => { const [v, ...rest] = String(args || '').trim().split(/\s+/); const fn = SUB[String(v || '').toLowerCase()]; return fn ? fn(rest.join(' '), ctx) : run0(args, ctx); } });
    }
    const reg = (d) => { if (!Commands.get(d.name)) Commands.register({ area: 'Board', ...d }); };
    reg({ name: 'board-show', aliases: ['board-see'].filter((x) => !Commands.get(x)), desc: 'Show board pictures to this chat with your next message: the board, sel, a frame, items by id or words (small; add medium / large)', args: '[board | sel | frame <name> | ids | words] [size]', examples: ['/board-show', '/board-show sel', '/board-show neon medium'], keywords: 'see look picture image eyes vision', run: (a, ctx) => SUB.look(a, ctx) });
    reg({ name: 'board-watch', desc: 'Show a board clip or gif to this chat as frames with timestamps (n frames, or scenes = one per shot)', args: '[clip] [n | scenes] [size]', examples: ['/board-watch', '/board-watch cuts scenes'], keywords: 'frames contact sheet video gif', run: (a, ctx) => SUB.watch(a, ctx) });
    reg({ name: 'board-find', desc: 'Find on the board by description (words, colors, light, motion, kind, what chats saw): selects them', args: '<description>', examples: ['/board-find dark clip with pink light', '/board-find warm grainy portrait'], run: (a, ctx) => SUB.find(a, ctx) });
    reg({ name: 'board-pinterest', aliases: ['pinterest'].filter((x) => !Commands.get(x)), desc: 'Pinterest searches matching the board\'s vibe (or your words): click one, then ＋ Board on a pin', args: '[vibe | aesthetic]', examples: ['/board-pinterest', '/board-pinterest dark academia'], keywords: 'pins inspiration aesthetic', complete: (a) => Object.keys(BoardPins.AESTHETICS).filter((k) => k.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })), run: (a, ctx) => SUB.pinterest(a, ctx) });
    reg({ name: 'board-alt', desc: 'What the selected picture shows, in one line (chats read it instead of looking again); no words: clear it', args: '[text]', run: async (a) => { await B.ready(); const s = B.selected(); if (!s.length) return 'Select a picture on the board first.'; B.patch(s.map((i) => i.id), { alt: a.trim() || undefined, altBy: a.trim() ? 'owner' : undefined }, 'alt text'); return a.trim() ? `Alt text saved on ${plural(s.length, 'item')}.` : 'Alt text cleared.'; } });
  }
  KEYS('Alt+drop a drawer tile on a chat', 'show its picture to the chat (a plain drop attaches its vibe)');
  KEYS('Drag an item onto a chat beside the board', 'show its picture there (the item stays where it was)');
  KEYS('Click an item id in a reply', 'jump to that item on the board');
  hookMenus();
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  return { showTo, askAbout, picturesFor, itemsMenu, tileItems, altDrop, jump, card, linkify, editAlt, SUB, _: { live, shown } };
})();
