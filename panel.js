// Chats panel: every conversation, grouped under its agent (and its folders), with filters
// (/filter or the ⏷ button: pinned, today, unread, busy, a tag, a folder, one agent), unread dots,
// tags, and keyboard navigation (↓ from the search box, ↑ ↓ Enter, F2 rename, Delete, Esc back).
// (round 42, chatlistfast) Built for thousands of chats: the summaries are split by AI and sorted once per change
// (not per draw), a draw only filters them and makes rows for what is shown, rows whose chat didn't change are kept
// (one chat changing rebuilds one row), typing in the search box draws once per frame and narrows the last
// letter's matches, and a group shown past VIRT rows ("Show more" a few times) keeps only the rows near the
// screen (spacers hold the rest of its height; ↑ / ↓ / Home / End walk the whole list). Chats drag onto a folder.
const Panel = (() => {
  const COLLAPSED_KEY = 'hub.collapsedGroups';
  let collapsed;
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { collapsed = new Set(); }
  let filter = '';
  let view = store.get('panel.view', null); // a filter from /filter (null = everything)
  const PAGE = 40; // chats shown per agent before "Show more"
  const expanded = new Map(); // agent id -> how many to show
  // row(rowEl, item, agent) after a chat row is built, render() after the list is drawn (chat-scenes.js)
  // (round 11, makes.js) skip(chatSummary) → true keeps a chat out of its agent's group (it shows in its make's group);
  // top(root, { row, itemOf, q }) draws groups above the agents' (each make with its rooms)
  // (round 23, projects.js) view(chatSummary, view) → true / false for a view it knows (undefined: not its own; its
  // label(view) names it on the chip), menu(view, setView) → rows for the ⏷ menu, itemMenu(item, agent) → rows for a
  // chat's right-click menu
  // (round 42) a row built once is kept while its chat shows the same things: row hooks run when it is built, render
  // hooks after every draw (and after a long group brings other rows near the screen)
  const hooks = { row: [], render: [], skip: [], top: [], view: [], menu: [], itemMenu: [] };
  const fromHooks = (list, ...a) => list.flatMap((fn) => { try { return fn(...a) || []; } catch (err) { console.warn(err); return []; } });
  const viewName = (v) => { for (const fn of hooks.view) { try { const l = fn.label?.(v); if (l) return l; } catch { /* its own trouble */ } } return v; };
  const skipped = (c) => !view && hooks.skip.length > 0 && hooks.skip.some((fn) => { try { return fn(c); } catch { return false; } });
  const itemOf = (c) => ({ key: c.id, title: c.title, chatId: c.id, pinned: c.pinned, updatedAt: c.updatedAt, ...metaOf(c.id) });

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  // /sort: newest activity (default), oldest, or by title
  const SORTS = { recent: (a, b) => b.updatedAt - a.updatedAt, oldest: (a, b) => a.updatedAt - b.updatedAt, title: (a, b) => a.title.localeCompare(b.title) };
  const sortBy = () => { const s = store.get('panel.sort', 'recent'); return SORTS[s] ? s : 'recent'; };
  const metaOf = (id) => (typeof ChatUX !== 'undefined' ? ChatUX.metaOf(id) : {});

  // Does a chat summary pass the current /filter view?
  function inView(c, agent) {
    if (!view) return !metaOf(c.id).archived;
    const v = view.toLowerCase();
    if (v === 'archived') return Boolean(metaOf(c.id).archived);
    if (metaOf(c.id).archived) return false; // archived chats only show under /filter archived
    if (v === 'pinned') return c.pinned;
    if (v === 'today') { const day = new Date(); day.setHours(0, 0, 0, 0); return c.updatedAt >= day.getTime(); }
    if (v === 'week') return c.updatedAt >= Date.now() - 7 * 864e5;
    if (v === 'unread') return H.unreadChats?.has(c.id);
    if (v === 'busy') return Native.isBusy(c.id);
    if (v.startsWith('tag:')) return (metaOf(c.id).tags || []).includes(v.slice(4).replace(/^#/, ''));
    if (v.startsWith('folder:')) return (metaOf(c.id).folder || '').toLowerCase() === v.slice(7);
    for (const fn of hooks.view) { try { const r = fn(c, v); if (r !== undefined) return r; } catch { /* its own trouble */ } }
    return agent.name.toLowerCase() === v || agent.id === v; // an agent's name: only its chats
  }

  // ---------- (round 42) the model: each AI's chats, sorted once per change of H.chats or of the sort ----------
  let modelOf = null; let modelSort = ''; let byAgent = new Map(); let byId = new Map();
  function model() {
    const sort = sortBy();
    if (modelOf === H.chats && modelSort === sort) return byAgent;
    if (modelOf && modelSort === sort && patchModel(H.chats || [], modelOf)) { modelOf = H.chats; return byAgent; }
    modelOf = H.chats; modelSort = sort; byAgent = new Map(); byId = new Map();
    const cmp = SORTS[sort];
    for (const c of H.chats || []) { byId.set(c.id, c); let l = byAgent.get(c.agentId); if (!l) byAgent.set(c.agentId, (l = [])); l.push(c); }
    for (const l of byAgent.values()) l.sort((a, b) => (b.pinned - a.pinned) || cmp(a, b));
    if (lower.size > (H.chats || []).length * 1.5 + 64) lower.clear();
    return byAgent;
  }
  // A chat saved (Native's remember(): its summary first, every other one the same object in the same order) or
  // deleted: one place in its AI's sorted list changes, no sort of the thousands.
  function patchModel(now, was) {
    const c = now[0];
    const prev = c && byId.get(c.id);
    let gone = null;
    if (c && now.length === was.length + (prev ? 0 : 1) && prev !== c) {
      for (let i = 0, j = 1; i < was.length; i++) { if (was[i].id === c.id) continue; if (now[j++] !== was[i]) return false; }
    } else if (now.length === was.length - 1) {
      let j = 0;
      for (let i = 0; i < was.length; i++) { if (now[j] === was[i]) { j++; continue; } if (gone) return false; gone = was[i]; }
      if (!gone) return false;
    } else return false;
    const cmp = SORTS[modelSort];
    const f = (a, b) => (b.pinned - a.pinned) || cmp(a, b);
    const out = gone || prev;
    if (out) { const l = byAgent.get(out.agentId); const k = l ? l.indexOf(out) : -1; if (k >= 0) l.splice(k, 1); byId.delete(out.id); }
    if (gone) return true;
    let l = byAgent.get(c.agentId); if (!l) byAgent.set(c.agentId, (l = []));
    // first place where it sorts before or level with what's there (a full sort keeps H.chats' order on ties: it's first)
    let lo = 0; let hi = l.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (f(c, l[m]) <= 0) hi = m; else lo = m + 1; }
    l.splice(lo, 0, c);
    byId.set(c.id, c);
    return true;
  }
  // the search: titles lowercased once per title (not per letter typed), #tags and folders from the chat's meta
  const lower = new Map(); // chat id -> [title, its lowercase]
  function low(c) { const e = lower.get(c.id); if (e && e[0] === c.title) return e[1]; const l = String(c.title || '').toLowerCase(); lower.set(c.id, [c.title, l]); return l; }
  function hit(c, q) {
    if (!q || low(c).includes(q)) return true;
    const m = metaOf(c.id);
    return (q.startsWith('#') && (m.tags || []).some((t) => `#${t}`.startsWith(q))) || (m.folder || '').toLowerCase().includes(q);
  }
  const matches = (i, q) => !q || i.title.toLowerCase().includes(q) || (q.startsWith('#') && (i.tags || []).some((t) => `#${t}`.startsWith(q))) || (i.folder || '').toLowerCase().includes(q);
  // while typing, the next letter only looks through the last letter's matches
  let inc = null; let typing = false;

  // What a group lists: chat summaries for a native AI (the rows' items are made only for rows drawn), the visited
  // pages for a website.
  function listFor(agent, q) {
    if (agent.mode === 'native') {
      const base = (inc && inc.lists.get(agent.id)) || model().get(agent.id) || [];
      return base.filter((c) => inView(c, agent) && !skipped(c) && hit(c, q));
    }
    if (view && view.toLowerCase() !== agent.name.toLowerCase()) return [];
    return (H.history[agent.id] || []).map((h) => ({ key: h.url, title: h.title, url: h.url })).filter((i) => matches(i, q));
  }

  function toggleGroup(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); } catch { /* not critical */ }
    render();
  }

  let renaming = null; // { id, el }: a row being renamed stays as it is while the list draws around it
  function startRename(row, chatId, title) {
    const input = el('input', 'rename');
    input.value = title;
    row.replaceChildren(input);
    row.draggable = false;
    renaming = { id: chatId, el: row };
    input.focus();
    input.select();
    let done = false;
    const commit = (save) => {
      if (done) return;
      done = true;
      if (renaming?.el === row) renaming = null;
      rowEls.delete(chatId);
      if (save && input.value.trim() && input.value !== title) Native.rename(chatId, input.value);
      else render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit(true);
      if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
  }

  // Runs a chat command on a chat from the list (opens it first, since commands act on the open chat).
  function onChat(agentId, chatId, cmd) { Native.open(agentId, chatId); setTimeout(() => Commands.exec(cmd, agentId), 30); }

  function itemMenu(agent, item, row, e) {
    e.preventDefault();
    const openIt = () => (item.chatId ? Native.open(agent.id, item.chatId) : openWebChat(agent.id, item.url));
    // (round 7) the frequent ones first, the rest in Organise › / Copy & export › / Continue with ›
    const others = H.agents().filter((a) => a.mode === 'native' && a.id !== agent.id);
    const items = item.chatId
      ? [
        { label: 'Open', action: openIt },
        { label: 'Pin to top', checked: Boolean(item.pinned), action: () => Native.togglePin(item.chatId) },
        { label: 'Rename', key: 'F2', action: () => startRename(row, item.chatId, item.title) },
        { label: 'Organise', items: () => [
          { label: 'Tag…', action: async () => { const t = await Modal.prompt('Tags', { value: (item.tags || []).join(', '), label: 'Comma-separated; filter with /filter tag:<name>' }); if (t != null) ChatUX.setMeta(item.chatId, { tags: [...new Set(t.split(/[,\s]+/).map((x) => x.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))] }); } },
          { label: 'Move to folder…', hint: item.folder || '', action: async () => { const f = await Modal.prompt('Folder', { value: item.folder || '', label: `Existing: ${ChatUX.allFolders().join(', ') || 'none yet'} (empty = no folder)` }); if (f != null) ChatUX.setMeta(item.chatId, { folder: f.trim().slice(0, 40) }); } },
          { label: item.archived ? 'Unarchive' : 'Archive (hide from the list)', action: () => ChatUX.setMeta(item.chatId, { archived: !item.archived }) },
          { label: 'Duplicate this chat', action: () => onChat(agent.id, item.chatId, '/duplicate') }, // (round 18) where and how the chat's ⋯ menu says it
          { label: H.unreadChats?.has(item.chatId) ? 'Mark as read' : 'Mark as unread', action: () => { if (H.unreadChats.has(item.chatId)) H.unreadChats.delete(item.chatId); else H.unreadChats.add(item.chatId); render(); } },
        ] },
        { label: 'Copy & export', items: () => [
          { label: 'Copy as Markdown', action: async () => copyText(await Native.markdownOf(item.chatId), 'Chat copied') },
          { label: 'Export as Markdown file…', action: () => onChat(agent.id, item.chatId, '/export md file') },
        ] },
        ...fromHooks(hooks.itemMenu, item, agent),
        others.length ? { label: 'Continue with', items: () => others.map((a) => ({ label: a.name, action: () => Native.continueWith(item.chatId, a.id) })) } : null,
        { label: 'Delete chat', key: 'Del', danger: true, action: () => { if (confirm(`Delete "${item.title}"? You can restore it for 30 days (Ctrl+K → Recently deleted chats).`)) Native.remove(item.chatId); } },
      ]
      : [
        { label: 'Open', action: () => openWebChat(agent.id, item.url) },
        { label: 'Copy link', action: () => navigator.clipboard.writeText(item.url) },
        { label: 'Remove from list', action: () => removeWebItem(agent.id, item.url) },
      ];
    showMenu(e.clientX, e.clientY, [...items.filter(Boolean), ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Chats panel') : [])]);
  }

  function removeWebItem(agentId, url) {
    H.history[agentId] = (H.history[agentId] || []).filter((h) => h.url !== url);
    window.hub.saveHistory(H.history);
    render();
  }

  const tipOf = (item) => item.title + (item.updatedAt ? ` · ${timeAgo(item.updatedAt)}` : '') + (item.tags?.length ? ` · ${item.tags.map((t) => `#${t}`).join(' ')}` : '');
  function row(agent, item) {
    const r = el('div', 'item');
    r.dataset.key = item.key;
    r.tabIndex = -1;
    r.setAttribute('role', 'button');
    if (item.chatId) r.draggable = true; // (round 42) onto a 📁 folder of its AI, or its AI's name (out of the folder)
    r.title = tipOf(item);
    if (item.pinned) r.append(el('span', 'pin-mark', '📌'));
    r.append(el('span', 'item-title', item.title));
    if (item.tags?.length) r.append(el('span', 'item-tags', item.tags.map((t) => `#${t}`).join(' ')));
    if (item.chatId && Native.isBusy(item.chatId)) r.append(el('span', 'busy'));
    else if (item.chatId && H.unreadChats?.has(item.chatId)) { r.classList.add('unread'); r.append(el('span', 'unread-dot')); }
    rows.set(r, { agent, item }); // (round 16) its click / right-click / keys are handled once for the whole list (onRow)
    for (const fn of hooks.row) { try { fn(r, item, agent); } catch (err) { console.warn(err); } }
    return r;
  }
  // (round 16, chatperf) one set of listeners on the list instead of three per row (a long list made hundreds)
  const rows = new WeakMap(); // row -> { agent, item }
  function onRow(e) {
    const r = e.target.closest?.('.item');
    const d = r && rows.get(r);
    if (!d) return;
    const { agent, item } = d;
    const openIt = () => (item.chatId ? Native.open(agent.id, item.chatId) : openWebChat(agent.id, item.url));
    if (e.type === 'click') { openIt(); return; }
    if (e.type === 'contextmenu') { itemMenu(agent, item, r, e); return; }
    if (e.target !== r) return; // keys typed in the rename box are its own
    if (e.key === 'Enter') { e.preventDefault(); openIt(); }
    else if (e.key === 'F2' && item.chatId) { e.preventDefault(); startRename(r, item.chatId, item.title); }
    else if (e.key === 'Delete' && item.chatId) { e.preventDefault(); if (confirm(`Delete "${item.title}"? You can restore it for 30 days.`)) Native.remove(item.chatId); }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const b = r.getBoundingClientRect(); itemMenu(agent, item, r, { preventDefault() {}, clientX: b.left + 20, clientY: b.bottom }); }
  }
  // Many calls in a row (a reply saved, unread marks, titles) draw the list once (render() itself stays immediate)
  let soonTimer = 0;
  function soon() { if (!soonTimer) soonTimer = setTimeout(() => { soonTimer = 0; render(); }, 40); }
  // (round 42) typing in the search box draws once per frame, in the frame (no waiting, no draw per key event)
  let frameReq = 0;
  function inFrame() { if (!frameReq) frameReq = requestAnimationFrame(() => { frameReq = 0; render(); }); }
  // a draw that is waiting (soon / the next frame), now: before reading what the list shows
  function flush() { if (soonTimer || frameReq) render(); }

  // ---------- (round 42) what is on screen is kept: rows, folder headers, groups ----------
  const rowEls = new Map(); // row key -> { el, sig }: kept while the chat shows the same things
  const folderEls = new Map(); // `${agent}/folder:${name}` -> { el, sig }
  const groupsUI = new Map(); // agent id -> its group's nodes
  const bits = new Map(); // the chip, "No matches"-like notes, the deep-search button: by what they say
  function sigOf(agent, c) {
    const m = metaOf(c.id);
    return `${agent.id}\u0001${c.title}\u0001${c.pinned ? 1 : 0}\u0001${(m.tags || []).join(',')}\u0001${m.folder || ''}\u0001${m.archived ? 1 : 0}\u0001${c.updatedAt}\u0001${Native.isBusy(c.id) ? 1 : H.unreadChats?.has(c.id) ? 2 : 0}`;
  }
  function rowFor(agent, e) {
    if (e.c) {
      if (renaming?.id === e.c.id && renaming.el.isConnected) return renaming.el;
      const sig = sigOf(agent, e.c);
      const had = rowEls.get(e.c.id);
      if (had && had.sig === sig) { if (!had.el.isConnected) { rowEls.delete(e.c.id); rowEls.set(e.c.id, had); } return had.el; } // back on screen: newest
      const r = row(agent, itemOf(e.c));
      rowEls.set(e.c.id, { el: r, sig });
      return r;
    }
    const sig = `w\u0001${agent.id}\u0001${e.i.title}`;
    const had = rowEls.get(e.i.key);
    if (had && had.sig === sig) return had.el;
    const r = row(agent, e.i);
    rowEls.set(e.i.key, { el: r, sig });
    return r;
  }
  function folderFor(agent, f, closed) {
    const key = `${agent.id}/folder:${f}`;
    const sig = closed ? '▸' : '▾';
    const had = folderEls.get(key);
    if (had && had.sig === sig) return had.el;
    const fh = el('button', 'folder-head', `${sig} 📁 ${f}`);
    fh.dataset.folder = f;
    fh.addEventListener('click', () => toggleGroup(key));
    folderEls.set(key, { el: fh, sig });
    return fh;
  }
  function bit(key, make) { let n = bits.get(key); if (!n) { n = make(); bits.set(key, n); } return n; }
  // parent's children become `want`, in order, moving / adding / removing only what differs
  function patch(parent, want) {
    const keep = new Set(want);
    let cur = parent.firstChild;
    for (const node of want) {
      while (cur && cur !== node && !keep.has(cur)) { const next = cur.nextSibling; cur.remove(); cur = next; } // gone: removed, not moved around
      if (node === cur) { cur = cur.nextSibling; continue; }
      parent.insertBefore(node, cur);
    }
    while (cur) { const next = cur.nextSibling; cur.remove(); cur = next; }
  }
  const entryEl = (agent, e) => (e.f != null ? folderFor(agent, e.f, e.closed) : rowFor(agent, e));

  // one AI's group: its head, a draft row, its rows (only those near the screen in a long one), "Show more"
  function groupFor(agent, items, q) {
    let g = groupsUI.get(agent.id);
    if (!g) {
      const node = el('div', 'group');
      node.dataset.id = agent.id;
      g = { el: node, head: null, headSig: '', color: '', virt: null };
      groupsUI.set(agent.id, g);
    }
    const color = agent.color || 'var(--accent)';
    if (g.color !== color) { g.color = color; g.el.style.setProperty('--agent', color); }
    // a blank chat just made with ＋ (not saved until its first message) shows on top, highlighted
    const draft = agent.mode === 'native' && !q && !view && Native.isDraft?.(agent.id);
    if (draft) collapsed.delete(agent.id);
    const open = !collapsed.has(agent.id) || q || view;
    let unread = 0;
    if (agent.mode === 'native' && H.unreadChats?.size) { model(); for (const id of H.unreadChats) if (byId.get(id)?.agentId === agent.id) unread += 1; }
    const kind = agent.mode === 'native' ? (agent.dock ? 'docked' : 'native') : 'web';
    const headSig = JSON.stringify([open ? '▾' : '▸', agent.name, agent.icon, agent.mode, agent.engine, agent.dock, agent.url, color, unread, kind, items.length]);
    if (g.headSig !== headSig) {
      g.headSig = headSig;
      const head = el('div', 'group-head');
      const toggle = el('button', 'group-toggle');
      toggle.append(
        el('span', 'caret', collapsed.has(agent.id) && !q && !view ? '▸' : '▾'),
        (() => { const d = el('span', 'dot'); const svg = Icons.for(agent); if (svg) { d.classList.add('dot-icon'); d.append(svg); } return d; })(),
        el('span', 'group-name', agent.name),
        unread ? el('span', 'group-unread', String(unread)) : el('span', 'group-kind', kind),
      );
      toggle.title = `${items.length} chat${items.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}`;
      toggle.addEventListener('click', () => toggleGroup(agent.id));
      const add = el('button', 'group-add', '＋');
      add.title = agent.mode === 'native' ? 'New chat' : `Open a new ${agent.name} chat`;
      add.addEventListener('click', () => {
        if (agent.mode === 'native') { activate(agent.id); Native.newChat(agent.id); } else openWebChat(agent.id, agent.url);
      });
      head.append(toggle, add);
      g.head = head;
    }
    const pre = [g.head];
    if (draft) {
      pre.push(bit(`draft:${agent.id}`, () => {
        const d = el('div', 'item draft active');
        d.dataset.key = '__draft';
        d.setAttribute('role', 'button');
        d.title = 'A new chat: it is saved when you send the first message';
        d.append(el('span', 'item-title', 'New chat'));
        d.addEventListener('click', () => { const a = H.agent(agent.id) || agent; if (!a.dock) activate(a.id); Native.focus?.(a.id); });
        return d;
      }));
    }
    let entries = [];
    const post = [];
    if (open) {
      if (!items.length && !draft) {
        const text = q ? 'No matches' : agent.mode === 'native' ? 'No chats yet · ' : 'Chats you open will show up here';
        pre.push(bit(`none:${agent.id}:${text}`, () => {
          const none = el('div', 'none', text);
          // (round 18, tidy) an empty agent offers its one action: start a chat
          if (!q && agent.mode === 'native') { const b = el('button', 'none-new', 'New chat'); b.type = 'button'; b.title = 'Ctrl+N'; b.addEventListener('click', () => { activate(agent.id); Native.newChat(agent.id); }); none.append(b); }
          return none;
        }));
      }
      const limit = expanded.get(agent.id) || PAGE;
      // chats without a folder first, then each folder under its own small header
      const shown = items.slice(0, limit);
      const wrap = (x) => (agent.mode === 'native' ? { c: x, key: x.id } : { i: x, key: x.key });
      const folderOf = (x) => (agent.mode === 'native' ? metaOf(x.id).folder : x.folder);
      const byFolder = new Map();
      for (const x of shown) { const f = folderOf(x); if (!f) entries.push(wrap(x)); else { let l = byFolder.get(f); if (!l) byFolder.set(f, (l = [])); l.push(x); } }
      for (const f of [...byFolder.keys()].sort()) {
        const closed = collapsed.has(`${agent.id}/folder:${f}`) && !q;
        entries.push({ f, closed, key: `${agent.id}/folder:${f}` });
        if (!closed) for (const x of byFolder.get(f)) entries.push(wrap(x));
      }
      if (items.length > limit) {
        const n = Math.min(PAGE, items.length - limit);
        post.push(bit(`more:${agent.id}:${n}:${items.length - limit}`, () => {
          const more = el('button', 'show-more', `Show ${n} more (${items.length - limit} hidden)`);
          more.addEventListener('click', () => { expanded.set(agent.id, (expanded.get(agent.id) || PAGE) + PAGE); render(); });
          return more;
        }));
      }
    }
    // a long group keeps only the rows near the screen
    if (entries.length > VIRT) {
      const was = g.virt;
      g.virt = { agent, entries, pre, post, start: was ? was.start : 0, end: was ? was.end : 0, at: null, offs: null, idx: null };
      if (!g.top) { g.top = spacer(); g.bottom = spacer(); }
      g.el.classList.add('vlist');
      clampWindow(g);
      paintVirtual(g);
    } else {
      g.virt = null;
      g.el.classList.remove('vlist');
      patch(g.el, [...pre, ...entries.map((e) => entryEl(agent, e)), ...post]);
    }
    return g.el;
  }

  // ---------- (round 42) long groups: only the rows near the screen, spacers for the rest ----------
  const VIRT = 150; // a group with more rows than this (after "Show more" a few times) keeps only those near the screen
  const BUF = 24; // rows kept beyond the screen on each side
  const steps = { row: 28, folder: 28, measured: '' }; // a row's and a folder header's height (measured)
  function spacer() { const s = el('div', 'vspace'); s.setAttribute('aria-hidden', 'true'); s.style.overflowAnchor = 'none'; return s; }
  function offsets(g) {
    const v = g.virt;
    if (v.offs && v.at === `${steps.row}|${steps.folder}`) return v.offs;
    const o = new Float64Array(v.entries.length + 1);
    for (let i = 0; i < v.entries.length; i++) o[i + 1] = o[i] + (v.entries[i].f != null ? steps.folder : steps.row);
    v.offs = o; v.at = `${steps.row}|${steps.folder}`;
    return o;
  }
  function indexOf(v, key) { if (!v.idx) { v.idx = new Map(); v.entries.forEach((e, i) => v.idx.set(e.key, i)); } return v.idx.get(key) ?? -1; }
  const at = (o, y) => { let lo = 0; let hi = o.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (o[m] <= y) lo = m; else hi = m - 1; } return Math.max(0, lo); };
  function clampWindow(g) {
    const v = g.virt; const n = v.entries.length;
    if (v.end <= v.start || v.start >= n) { v.start = 0; v.end = Math.min(n, 2 * BUF); }
    v.end = Math.min(n, v.end); v.start = Math.max(0, Math.min(v.start, n - 1));
  }
  function paintVirtual(g) {
    const v = g.virt; const o = offsets(g);
    const top = `${o[v.start]}px`; const bottom = `${o[v.entries.length] - o[v.end]}px`;
    if (g.top.style.height !== top) g.top.style.height = top;
    if (g.bottom.style.height !== bottom) g.bottom.style.height = bottom;
    const mid = [];
    for (let i = v.start; i < v.end; i++) mid.push(entryEl(v.agent, v.entries[i]));
    patch(g.el, [...v.pre, g.top, ...mid, g.bottom, ...v.post]);
  }
  // the rows near what the list shows now; force: even inside the margin. In a frame or on a key it reads the layout
  // first (then writes); drawing (render() in the middle of its writes): from the scroll position and the groups'
  // places seen last (no forced layout), and the next frame checks with the real ones; render() does the after-steps.
  const geo = { st: 0, vh: 0 };
  function windowAll(force = false, drawing = false) {
    const virt = [...groupsUI.values()].filter((g) => g.virt && g.el.isConnected);
    if (!virt.length) return null;
    const root = $('chat-groups');
    if (!drawing || !geo.vh || virt.some((g) => g.y0 == null)) {
      measure(root);
      const rr = root.getBoundingClientRect();
      geo.st = root.scrollTop; geo.vh = root.clientHeight;
      for (const g of virt) g.y0 = g.top.getBoundingClientRect().top - rr.top + geo.st;
    }
    const vh = geo.vh;
    const fk = document.activeElement?.closest?.('#chat-groups .item')?.dataset.key;
    let changed = false;
    for (const g of virt) {
      const y = geo.st - g.y0; // the screen's top inside the group's rows
      const v = g.virt; const o = offsets(g); const n = v.entries.length;
      const i0 = at(o, Math.max(0, y)); const i1 = Math.min(n, at(o, Math.max(0, y + vh)) + 1);
      const inside = y + vh > 0 && y < o[n];
      // still covered with a margin: nothing to do
      if (!force && v.start <= Math.max(0, i0 - BUF / 3) && v.end >= Math.min(n, i1 + BUF / 3)) continue;
      let s = inside ? Math.max(0, i0 - BUF) : y >= o[n] ? Math.max(0, n - BUF) : 0;
      let e = inside ? Math.min(n, i1 + BUF) : y >= o[n] ? n : Math.min(n, BUF);
      const fi = fk ? indexOf(v, fk) : -1; // the focused row stays (it would lose focus), if it's not far
      if (fi >= 0 && Math.max(e, fi + 1) - Math.min(s, fi) < 400) { s = Math.min(s, fi); e = Math.max(e, fi + 1); }
      if (s === v.start && e === v.end && !force) continue;
      v.start = s; v.end = e;
      paintVirtual(g);
      changed = true;
    }
    if (changed && !drawing) { prune(); rove(); highlight(); for (const fn of hooks.render) { try { fn(); } catch (err) { console.warn(err); } } }
    return changed;
  }
  // a row's height from two rows next to each other on screen (the look's density and font decide it)
  function measure(root) {
    const d = document.documentElement.dataset;
    const key = `${d.density || ''}|${d.look || ''}|${d.skin || ''}|${document.documentElement.style.cssText}|${root.clientWidth > 0}`;
    if (steps.measured === key) return;
    const rr = root.getBoundingClientRect();
    let row = 0; let folder = 0;
    for (const r of root.querySelectorAll('.group.vlist > .item + .item, .group.vlist > .folder-head + .item')) {
      const b = r.getBoundingClientRect(); const a = r.previousElementSibling.getBoundingClientRect();
      if (a.top < rr.top || b.bottom > rr.bottom || !a.height) continue;
      if (r.previousElementSibling.classList.contains('folder-head')) folder ||= b.top - a.top; else row ||= b.top - a.top;
      if (row && folder) break;
    }
    if (!row) return; // nothing to measure on screen yet: the last values stay
    steps.row = row; steps.folder = folder || steps.folder; steps.measured = key;
  }
  let scrollReq = 0;
  function onScroll() { if (!scrollReq) scrollReq = requestAnimationFrame(() => { scrollReq = 0; windowAll(); }); }
  function vgroupOf(r) { const g = groupsUI.get(r.closest('.group')?.dataset.id); return g?.virt && rows.get(r)?.agent?.id === g.virt.agent.id ? g : null; }
  // forget rows / headers no longer on screen (they are made again if they come back); a long group keeps the
  // KEEP rows it showed last (scrolling back up reuses them)
  const KEEP = 300;
  function prune() {
    const keep = [...groupsUI.values()].some((g) => g.virt) ? KEEP : 0;
    let off = 0;
    for (const v of rowEls.values()) if (!v.el.isConnected) off += 1;
    for (const [k, v] of rowEls) { if (off <= keep) break; if (!v.el.isConnected) { rowEls.delete(k); off -= 1; } }
    for (const [k, v] of folderEls) if (!v.el.isConnected) folderEls.delete(k);
    if (bits.size > 64) for (const [k, n] of bits) if (!n.isConnected) bits.delete(k);
  }
  // one Tab stop for the list: the focused row, else the open chat, else the first
  function rove() {
    const root = $('chat-groups');
    const f = document.activeElement;
    const stop = (f?.classList?.contains('item') && root.contains(f) && f) || root.querySelector('.item.active') || root.querySelector('.item');
    for (const r of root.querySelectorAll('.item[tabindex="0"]')) if (r !== stop) r.tabIndex = -1;
    if (stop && stop.tabIndex !== 0) stop.tabIndex = 0;
  }

  // ---------- (round 42) drag a chat onto a folder of its AI (or onto its AI's name: out of the folder) ----------
  let dragging = null; let dropMark = null;
  const markDrop = (n) => { if (dropMark === n) return; dropMark?.classList.remove('drop-on'); dropMark = n; n?.classList.add('drop-on'); };
  const chatDrag = (e) => Boolean(dragging) && (!e.dataTransfer || e.dataTransfer.types.includes('application/x-hearth-chat'));
  function dropAt(t) {
    if (!dragging) return null;
    const fh = t.closest?.('.folder-head'); const gh = !fh && t.closest?.('.group-head');
    const g = (fh || gh)?.parentElement;
    if (!g?.classList.contains('group') || g.dataset.id !== dragging.agentId) return null;
    return fh ? { node: fh, folder: fh.dataset.folder || '' } : { node: gh, folder: '' };
  }
  function onDrag(e) {
    if (e.type === 'dragstart') {
      const r = e.target.closest?.('.item'); const d = r && rows.get(r);
      if (!d?.item.chatId || r.querySelector('input.rename')) return;
      dragging = { id: d.item.chatId, agentId: d.agent.id };
      try { e.dataTransfer.setData('application/x-hearth-chat', d.item.chatId); e.dataTransfer.effectAllowed = 'move'; } catch { /* a synthetic drag */ }
      return;
    }
    if (e.type === 'dragend') { markDrop(null); dragging = null; return; }
    if (e.type === 'dragleave') { if (!e.relatedTarget || !$('chat-groups').contains(e.relatedTarget)) markDrop(null); return; }
    const d = chatDrag(e) ? dropAt(e.target) : null;
    if (e.type === 'dragover' || e.type === 'dragenter') { markDrop(d?.node || null); if (d) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } return; }
    if (e.type === 'drop') {
      markDrop(null);
      if (!d) return;
      e.preventDefault();
      const id = dragging.id; dragging = null;
      if ((metaOf(id).folder || '') !== d.folder) ChatUX.setMeta(id, { folder: d.folder });
    }
  }

  function wire(root) {
    if (root.dataset.rowEvents) return;
    root.dataset.rowEvents = '1';
    for (const t of ['click', 'contextmenu', 'keydown']) root.addEventListener(t, onRow);
    for (const t of ['dragstart', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) root.addEventListener(t, onDrag);
    // a dragged row can leave the list while it scrolls (a long group): its drag ends on the window
    addEventListener('dragend', () => { markDrop(null); dragging = null; }, true);
    root.addEventListener('scroll', onScroll, { passive: true });
    new ResizeObserver(onScroll).observe(root);
    // a row's tooltip says how long ago its chat changed: worked out when you point at it
    root.addEventListener('pointerover', (e) => {
      const r = e.target.closest?.('.item'); const d = r && rows.get(r);
      if (!d || !d.item.updatedAt || r.querySelector('input.rename')) return;
      const t = tipOf(d.item);
      if (r.title !== t && !r.title.includes('\n')) r.title = t;
    }, { passive: true });
    // (round 45, chatswitch) a chat you rest on (pointer or keys) is made ready before you open it (Native.prefetch)
    let preT = 0; let preRow = null;
    const ready = (e, ms) => {
      const r = e.target.closest?.('.item'); const d = r && rows.get(r);
      if (r === preRow) return;
      clearTimeout(preT); preRow = r;
      if (d?.item.chatId && d.agent.mode === 'native') preT = setTimeout(() => { if (preRow === r) Native.prefetch?.(d.agent.id, d.item.chatId); }, ms);
    };
    root.addEventListener('pointerover', (e) => ready(e, 90), { passive: true });
    root.addEventListener('pointerleave', () => { clearTimeout(preT); preRow = null; }, { passive: true });
    root.addEventListener('focusin', (e) => ready(e, 160));
  }

  let listedMark = false;
  function render() {
    const root = $('chat-groups');
    if (!H.config) return;
    if (soonTimer) { clearTimeout(soonTimer); soonTimer = 0; }
    if (frameReq) { cancelAnimationFrame(frameReq); frameReq = 0; }
    wire(root);
    const hadFocus = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const q = filter.toLowerCase();
    // the last letter's matches are reused only while typing narrows the same search over the same chats
    if (!typing || !inc || inc.chats !== H.chats || inc.view !== view || !q.startsWith(inc.q)) inc = null;
    typing = false;
    const want = [];
    if (view) {
      const v = view;
      want.push(bit(`chip:${v}:${viewName(v)}`, () => {
        const chip = el('div', 'panel-view');
        chip.append(el('span', null, `Showing: ${viewName(v)}`));
        const x = el('button', null, '×');
        x.title = 'Show every chat';
        x.addEventListener('click', () => setView(null));
        chip.append(x);
        return chip;
      }));
    }
    if (!view && hooks.top.length) {
      const top = document.createDocumentFragment();
      for (const fn of hooks.top) { try { fn(top, { row, itemOf, q, collapsed, toggleGroup }); } catch (err) { console.warn(err); } }
      want.push(...top.childNodes);
    }
    const lists = new Map();
    let groups = 0;
    for (const agent of H.agents()) {
      const items = listFor(agent, q);
      if (agent.mode === 'native') lists.set(agent.id, items);
      if (view && !items.length) continue;
      want.push(groupFor(agent, items, q));
      groups += 1;
    }
    for (const id of [...groupsUI.keys()]) if (!H.agent(id)) groupsUI.delete(id);
    inc = q ? { q, chats: H.chats, view, lists } : null;
    if (view && !groups) want.push(bit('none:view', () => el('div', 'none', 'No chat matches this filter')));
    if (q.length >= 2) {
      const f = filter;
      want.push(bit(`deep:${f}`, () => {
        const deep = el('button', 'show-more deep-search', `Search inside messages for “${f}”`);
        deep.addEventListener('click', () => AppUI.palette(`?${f}`));
        return deep;
      }));
    }
    patch(root, want);
    if (!listedMark && H.chats?.length) { listedMark = true; performance.mark('hearth:chats-listed'); } // (round 42) when the history first shows (checks read it)
    if (windowAll(true, true) !== null) onScroll(); // a long group: checked against the real layout in the next frame
    prune();
    highlight();
    // unread replies show in the window title too: "(2) Claude · Hearth"
    const unread = H.unreadChats?.size || 0;
    const title = `${unread ? `(${unread}) ` : ''}${document.title.replace(/^\(\d+\) /, '') || 'Hearth'}`;
    if (document.title !== title) document.title = title;
    if (hadFocus && !(root.contains(document.activeElement) && document.activeElement.dataset.key === hadFocus)) root.querySelector(`.item[data-key="${CSS.escape(hadFocus)}"]`)?.focus();
    rove();
    for (const fn of hooks.render) { try { fn(); } catch (err) { console.warn(err); } }
  }

  function highlight() {
    for (const group of $('chat-groups').querySelectorAll('.group')) {
      const id = group.dataset.id;
      group.classList.toggle('current', id === H.activeId);
      const agent = H.agent(id);
      let activeKey = null;
      if (agent?.mode === 'native') activeKey = H.activeChat[id];
      else {
        try { activeKey = H.surfaces.get(id)?.webview?.getURL(); } catch { /* webview not ready yet */ }
      }
      // (round 11) a make's group holds rows of several agents: each row names its own (data-agent)
      for (const row of group.querySelectorAll('.item')) {
        const k = row.dataset.agent ? H.activeChat[row.dataset.agent] : activeKey;
        const on = row.dataset.key === k || (row.dataset.key === '__draft' && !k);
        if (row.classList.contains('active') !== on) row.classList.toggle('active', on);
        if (on !== (row.getAttribute('aria-current') === 'true')) { if (on) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current'); } // (round 42) rows kept between draws: a11y.js only sees new ones
      }
    }
  }

  function setFilter(text) {
    filter = text.trim();
    typing = true;
    inFrame();
  }
  function setView(v) {
    view = v || null;
    store.set('panel.view', view);
    render();
  }

  // Keyboard: ↓ from the search box into the list, ↑ ↓ between chats (through a long group even where it isn't
  // drawn yet), Home / End, Esc back to the search box.
  function go(n) {
    if (!n) return;
    for (const x of $('chat-groups').querySelectorAll('.item[tabindex="0"]')) if (x !== n) x.tabIndex = -1;
    n.tabIndex = 0;
    n.focus();
  }
  function move(r, k) {
    const root = $('chat-groups');
    if (k === 'Home' || k === 'End') {
      root.scrollTop = k === 'Home' ? 0 : root.scrollHeight;
      windowAll(true);
      const all = root.querySelectorAll('.item');
      go(k === 'Home' ? all[0] : all[all.length - 1]);
      return;
    }
    const step = k === 'ArrowDown' ? 1 : -1;
    const g = vgroupOf(r);
    if (g) {
      const v = g.virt;
      let j = indexOf(v, r.dataset.key);
      if (j >= 0) {
        do j += step; while (j >= 0 && j < v.entries.length && v.entries[j].f != null);
        if (j >= 0 && j < v.entries.length) {
          if (j < v.start || j >= v.end) { v.start = Math.max(0, j - BUF); v.end = Math.min(v.entries.length, j + BUF); paintVirtual(g); prune(); highlight(); }
          go(rowEls.get(v.entries[j].key)?.el);
          return;
        }
      }
    }
    const all = [...root.querySelectorAll('.item')];
    const i = all.indexOf(r);
    if (step > 0) go(all[Math.min(all.length - 1, i + 1)]);
    else if (i <= 0) $('chat-search').focus();
    else go(all[i - 1]);
  }
  function wireKeys() {
    const root = $('chat-groups');
    const search = $('chat-search');
    if (!root || !search || root.dataset.keys) return;
    root.dataset.keys = '1';
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter') flush();
      const first = root.querySelector('.item');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (first) go(first); }
      if (e.key === 'Enter') { if (first) { e.preventDefault(); first.click(); } }
      if (e.key === 'Escape' && search.value) { search.value = ''; setFilter(''); }
    });
    root.addEventListener('keydown', (e) => {
      const r = e.target.closest?.('.item');
      if (!r || e.target !== r || !root.contains(r)) return;
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation(); // handled here for the whole list (a11y.js's walk would stop at the drawn rows)
        move(r, e.key);
      }
      if (e.key === 'Escape') { e.preventDefault(); search.focus(); }
    });
    // the ⏷ filter button next to the search box
    const btn = document.createElement('button');
    btn.className = 'panel-filter-btn ghost';
    btn.textContent = '⏷';
    btn.title = 'Filter chats: pinned, today, unread, a tag, a folder… (/filter)';
    btn.addEventListener('click', () => {
      const b = btn.getBoundingClientRect();
      const tags = typeof ChatUX !== 'undefined' ? ChatUX.allTags() : [];
      const folders = typeof ChatUX !== 'undefined' ? ChatUX.allFolders() : [];
      showMenu(b.left, b.bottom + 4, [
        { label: `${view ? '' : '✓ '}Everything`, action: () => setView(null) },
        ...['pinned', 'today', 'week', 'unread', 'busy', 'archived'].map((v) => ({ label: `${view === v ? '✓ ' : ''}${{ pinned: '📌 Pinned', today: 'Today', week: 'Last 7 days', unread: 'Unread replies', busy: 'Answering now', archived: '🗄 Archived' }[v]}`, action: () => setView(v) })),
        ...Object.keys(SORTS).map((k) => ({ label: `${sortBy() === k ? '✓ ' : ''}Sort: ${{ recent: 'latest first', oldest: 'oldest first', title: 'by title' }[k]}`, action: () => { store.set('panel.sort', k); render(); } })),
        ...folders.map((f) => ({ label: `${view === `folder:${f.toLowerCase()}` ? '✓ ' : ''}📁 ${f}`, action: () => setView(`folder:${f.toLowerCase()}`) })),
        ...tags.map((t) => ({ label: `${view === `tag:${t}` ? '✓ ' : ''}#${t}`, action: () => setView(`tag:${t}`) })),
        ...fromHooks(hooks.menu, view, setView),
      ]);
    });
    search.after(btn);
    search.placeholder = 'Search chats (#tag)';
    if (typeof Keys !== 'undefined') Keys.add({ area: 'Chats panel', keys: 'Drag a chat onto a 📁 folder', what: `Move it into that folder (onto its AI’s name: out of the folder); ${/Mac/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z'} puts it back`, sel: '#panel .item' }); // (capturefix2) the Mac's sheet says ⌘ only (qa-mac)
  }
  setTimeout(wireKeys, 0);

  return { render, soon, flush, highlight, setFilter, setView, view: () => view, SORTS, hooks, _model: () => model() }; // _model: checks compare it with a fresh sort
})();
