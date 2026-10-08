// Chat extras around native.js: find-in-chat with highlights, view preferences (code wrap, text size, width,
// density, timestamps, focus / zen), chat tags and folders, the bookmark index across chats, reading new
// replies aloud, snippets. Everything here is driven from chat commands (chat-cmds.js) and menus.
const ChatUX = (() => {
  // ---------- view preferences (per app, remembered) ----------
  const PREFS = {
    wrap: { key: 'chat.wrapCode', def: false },
    scale: { key: 'chat.scale', def: 1 },
    width: { key: 'chat.width', def: 'normal' },
    density: { key: 'chat.density', def: 'cozy' },
    timestamps: { key: 'chat.timestamps', def: 'hover' },
    numbers: { key: 'chat.numbers', def: false },
  };
  const WIDTHS = { narrow: '640px', normal: '820px', wide: '1080px', full: '100%' };
  const pref = (name) => store.get(PREFS[name].key, PREFS[name].def);
  function setPref(name, value) { store.set(PREFS[name].key, value); applyPrefs(); return value; }
  function applyPrefs() {
    const b = document.body.classList;
    b.toggle('chat-wrap-code', Boolean(pref('wrap')));
    b.toggle('chat-dense', pref('density') === 'compact');
    b.toggle('chat-ts-always', pref('timestamps') === 'always');
    b.toggle('chat-ts-never', pref('timestamps') === 'never');
    b.toggle('chat-numbers', Boolean(pref('numbers')));
    const root = document.documentElement.style;
    root.setProperty('--chat-scale', String(pref('scale')));
    root.setProperty('--chat-width', WIDTHS[pref('width')] || WIDTHS.normal);
  }

  // Focus: just this chat (no chats panel, no rail). Zen: focus plus quiet chrome (footers show on hover).
  let focusState = null;
  function setFocus(mode) {
    const on = mode ?? !focusState;
    const b = document.body.classList;
    if (on) {
      focusState ||= { panel: H.panelOpen };
      H.panelOpen = false;
      b.add('chat-focus');
      b.toggle('chat-zen', on === 'zen');
      if (!document.querySelector('.chat-focus-exit')) {
        document.body.append(el('button', { class: 'chat-focus-exit ghost small', text: '⤢ Exit focus', title: 'Back to the normal layout (/focus)', on: { click: () => setFocus(false) } }));
      }
    } else {
      if (focusState) H.panelOpen = focusState.panel;
      focusState = null;
      b.remove('chat-focus', 'chat-zen');
      document.querySelector('.chat-focus-exit')?.remove();
    }
    applyLayout();
    return Boolean(on);
  }

  // ---------- find in this chat ----------
  // A small bar over the messages: every match highlighted, Enter / Shift+Enter (or ↑ ↓) step through them.
  const finds = new Map(); // agentId -> { bar, input, count, hits, at }
  function clearMarks(list) {
    for (const m of list.querySelectorAll('mark.find-hit')) m.replaceWith(document.createTextNode(m.textContent));
    list.normalize();
  }
  function markAll(list, q) {
    const hits = [];
    if (!q) return hits;
    const needle = q.toLowerCase();
    const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.msg .body, .msg .thinking-text') && !n.parentElement.closest('.code-acts, .copy-code, .code-label, .note-acts') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      const lower = text.toLowerCase();
      let i = lower.indexOf(needle);
      if (i < 0) continue;
      const frag = document.createDocumentFragment();
      let from = 0;
      while (i >= 0) {
        frag.append(text.slice(from, i));
        const mark = el('mark', { class: 'find-hit', text: text.slice(i, i + q.length) });
        frag.append(mark);
        hits.push(mark);
        from = i + q.length;
        i = lower.indexOf(needle, from);
      }
      frag.append(text.slice(from));
      node.replaceWith(frag);
    }
    return hits;
  }
  function find(agentId, text) {
    const v = Native.view(agentId);
    if (!v) return null;
    let f = finds.get(agentId);
    if (!f) {
      const input = el('input', { type: 'search', placeholder: 'Find in this chat…', spellcheck: false });
      const count = el('span', { class: 'find-count' });
      const bar = el('div', { class: 'chat-find' }, el('span', { text: '🔎' }), input, count,
        el('button', { type: 'button', class: 'ghost small', text: '↑', title: 'Previous (Shift+Enter)', on: { click: () => step(agentId, -1) } }),
        el('button', { type: 'button', class: 'ghost small', text: '↓', title: 'Next (Enter)', on: { click: () => step(agentId, 1) } }),
        el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Close (Esc)', on: { click: () => closeFind(agentId) } }));
      input.addEventListener('input', debounce(() => run(agentId), 120));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(agentId, e.shiftKey || e.key === 'ArrowUp' ? -1 : 1); }
        if (e.key === 'Escape') { e.preventDefault(); closeFind(agentId); v.input.focus(); }
      });
      f = { bar, input, count, hits: [], at: -1 };
      finds.set(agentId, f);
      v.list.parentElement.prepend(bar);
    }
    if (text != null) f.input.value = text;
    f.input.focus();
    f.input.select();
    run(agentId);
    return f;
  }
  function run(agentId, { jump = true } = {}) {
    const f = finds.get(agentId);
    const v = Native.view(agentId);
    if (!f || !v) return 0;
    clearMarks(v.list);
    f.hits = markAll(v.list, f.input.value.trim());
    f.at = -1;
    f.count.textContent = f.input.value.trim() ? (f.hits.length ? `${f.hits.length} found` : 'none') : '';
    if (f.hits.length && jump) step(agentId, 1, true);
    return f.hits.length;
  }
  function step(agentId, dir, fromStart = false) {
    const f = finds.get(agentId);
    if (!f?.hits.length) return;
    f.hits[f.at]?.classList.remove('cur');
    // start from the latest messages: what you look for is usually recent
    f.at = fromStart ? f.hits.length - 1 : (f.at + dir + f.hits.length) % f.hits.length;
    const hit = f.hits[f.at];
    hit.classList.add('cur');
    hit.closest('.msg.collapsed')?.classList.remove('collapsed');
    const details = hit.closest('details');
    if (details) details.open = true;
    hit.scrollIntoView({ block: 'center' });
    f.count.textContent = `${f.at + 1} / ${f.hits.length}`;
  }
  function closeFind(agentId) {
    const f = finds.get(agentId);
    const v = Native.view(agentId);
    if (!f) return;
    f.bar.remove();
    finds.delete(agentId);
    if (v) clearMarks(v.list);
  }
  // re-highlight after the chat re-renders (a reply arrived, you scrolled to another chat…)
  Native.hooks.render.push((agentId) => {
    const f = finds.get(agentId);
    if (!f) return;
    const v = Native.view(agentId);
    if (v && f.bar.parentElement !== v.list.parentElement) v.list.parentElement.prepend(f.bar);
    const at = f.at;
    run(agentId, { jump: false });
    if (at >= 0 && f.hits.length) { f.at = Math.min(at, f.hits.length - 1); f.hits[f.at].classList.add('cur'); f.count.textContent = `${f.at + 1} / ${f.hits.length}`; }
  });

  // ---------- chat tags and folders (data/kv/chat-meta.json: { chatId: { tags: [], folder } }) ----------
  let meta = {};
  const saveMeta = debounce(() => window.hub.kvSet('chat-meta', meta), 300);
  async function loadMeta() { meta = (await window.hub.kvGet('chat-meta', {})) || {}; Panel.render(); }
  const metaOf = (chatId) => meta[chatId] || {};
  function setMeta(chatId, patch) {
    const next = { ...metaOf(chatId), ...patch };
    if (!next.tags?.length) delete next.tags;
    if (!next.folder) delete next.folder;
    if (Object.keys(next).length) meta[chatId] = next; else delete meta[chatId];
    saveMeta();
    Panel.render();
    return next;
  }
  const allTags = () => [...new Set(Object.values(meta).flatMap((m) => m.tags || []))].sort();
  const allFolders = () => [...new Set(Object.values(meta).map((m) => m.folder).filter(Boolean))].sort();

  // ---------- bookmarks across chats (data/kv/chat-bookmarks.json) ----------
  let bookmarks = null;
  async function loadBookmarks() { bookmarks ||= (await window.hub.kvGet('chat-bookmarks', [])) || []; return bookmarks; }
  Native.hooks.mark.push(async (chat, index, key, on) => {
    if (key !== 'bookmark') return;
    await loadBookmarks();
    bookmarks = bookmarks.filter((b) => !(b.chatId === chat.id && b.index === index));
    if (on) {
      const m = chat.messages[index];
      bookmarks.unshift({ chatId: chat.id, agentId: chat.agentId, index, title: chat.title, text: (m.text || '').replace(/\s+/g, ' ').slice(0, 140), at: Date.now() });
    }
    window.hub.kvSet('chat-bookmarks', bookmarks.slice(0, 300));
  });

  // ---------- read new replies aloud (/read auto on) ----------
  Native.hooks.event.push((event, chat) => {
    if (event.type !== 'done' || !store.get('chat.autoRead', false)) return;
    if (H.activeChat[chat.agentId] !== chat.id) return;
    const m = chat.messages.at(-1);
    if (m?.role === 'assistant') Native.speak(m.text);
  });

  // ---------- snippets: reusable bits of text you insert with /snippet (data/kv/chat-snippets.json) ----------
  let snippets = null;
  async function loadSnippets() { snippets ||= (await window.hub.kvGet('chat-snippets', [])) || []; return snippets; }
  async function saveSnippet(name, text) {
    await loadSnippets();
    snippets = [{ name, text }, ...snippets.filter((s) => s.name.toLowerCase() !== name.toLowerCase())];
    await window.hub.kvSet('chat-snippets', snippets);
  }
  async function deleteSnippet(name) {
    await loadSnippets();
    const before = snippets.length;
    snippets = snippets.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
    await window.hub.kvSet('chat-snippets', snippets);
    return before !== snippets.length;
  }

  // Global keys inside a chat: Alt+F finds in the chat you are typing in.
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.key.toLowerCase() !== 'f') return;
    const box = e.target.closest?.('.composer, .messages-wrap');
    if (!box) return;
    const agentId = [...H.agents()].map((a) => a.id).find((id) => Native.view(id)?.root.contains(box));
    if (!agentId) return;
    e.preventDefault();
    find(agentId);
  });

  applyPrefs();
  setTimeout(() => { loadMeta().catch(() => {}); }, 0);

  return {
    pref, setPref, applyPrefs, WIDTHS, setFocus, isFocus: () => Boolean(focusState),
    find, closeFind, step,
    metaOf, setMeta, allTags, allFolders,
    loadBookmarks, loadSnippets, saveSnippet, deleteSnippet,
  };
})();
