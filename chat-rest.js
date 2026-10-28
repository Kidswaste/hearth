// (round 72, chatwindow72) Long chats stay light: what wakes and rests the earlier messages of a chat (native.js draws
// them as one empty spacer per block of 20, the height they take, so the scrollbar stays honest: planOf / restBit).
// - a resting block wakes as it comes within a screen of the view (an IntersectionObserver per chat list, then the
//   nearest spacer first, one block at a time): its replies' Markdown is made on the worker, its nodes a few ms at a
//   time, then it takes the spacer's place in one go, with what you're looking at kept exactly where it was
// - a drawn block three screens away rests again (never one holding your selection or the focus): one spacer of its
//   measured height, its nodes and its Markdown let go (the text itself always stays: nothing in the chat changes)
// - find in chat (chat-ux.js) and jumps (/jump, pinned messages, search results, links to a message) wake the block
//   they need first. Loaded right after the first frame (lazy group chatrest); until then the chat opens as drawn.
const ChatRest = (() => {
  const R = Native._rest;
  const { views, chats, hooks } = R;
  // spacers coming within a screen of the view wake their block; the list's scrolling looks for far ones to rest
  function watch(agentId, v) {
    const list = v.list;
    if (!list.awake) return;
    list.restIO ||= new IntersectionObserver((es) => { if (list === v.list && es.some((e) => e.isIntersecting)) soon(agentId, 30); }, { root: list, rootMargin: '100% 0px' });
    const seen = list.restSeen ||= new Set();
    for (const s of seen) if (!s.isConnected) { list.restIO.unobserve(s); seen.delete(s); }
    for (const s of list.querySelectorAll(':scope > .msg-rest')) if (!seen.has(s)) { seen.add(s); list.restIO.observe(s); }
    soon(agentId, 400);
  }
  function soon(agentId, ms) {
    const v = views.get(agentId);
    if (!v?.list.awake) return;
    const due = performance.now() + ms;
    if (v.restT && v.restDue <= due) return;
    clearTimeout(v.restT); v.restDue = due;
    v.restT = setTimeout(() => { v.restT = 0; tick(agentId).catch((err) => console.warn('chat rest', err)); }, ms);
  }
  async function tick(agentId) {
    const v = views.get(agentId); const list = v?.list; const id = H.activeChat[agentId]; const chat = id && chats.get(id);
    if (!chat || !list?.awake || v.paneKey !== id || v.waking || document.hidden) return;
    if (v.drawing) { soon(agentId, 200); return; }
    const r = list.getBoundingClientRect(); const vh = r.height;
    if (!vh) return;
    // the nearest resting block within a screen of the view wakes, then the next tick looks again
    let near = null; let nd = vh;
    for (const s of list.querySelectorAll(':scope > .msg-rest')) { const q = s.getBoundingClientRect(); const d = Math.max(q.top - r.bottom, r.top - q.bottom, 0); if (d < nd) { nd = d; near = s; } }
    if (near) { if (await wake(agentId, v, chat, Number(near.dataset.block))) soon(agentId, 16); return; }
    // blocks drawn three screens away rest again (not one holding your selection or the focus)
    const sel = getSelection(); const hold = [sel?.anchorNode, sel?.focusNode, document.activeElement].filter(Boolean);
    const groups = new Map();
    for (const n of list.children) if (n.restB != null) { if (!groups.has(n.restB)) groups.set(n.restB, []); groups.get(n.restB).push(n); }
    for (const [b, nodes] of groups) {
      if (!list.awake.has(b) || nodes.some((n) => hold.some((k) => n.contains(k)))) continue;
      if (nodes.at(-1).getBoundingClientRect().bottom < r.top - 3 * vh || nodes[0].getBoundingClientRect().top > r.bottom + 3 * vh) rest(agentId, v, chat, b, nodes);
    }
  }
  // the quiet "Earlier messages are resting · Show all" line goes on top of what's drawn: under the lowest spacer
  function placeLine(list, agentId) {
    const sps = list.querySelectorAll(':scope > .msg-rest'); const last = sps[sps.length - 1];
    let line = list.bits?.get('restline');
    if (!line && last) (list.bits ||= new Map()).set('restline', line = R.restLine(agentId));
    if (!last) line?.remove(); else if (last.nextSibling !== line) last.after(line);
  }
  const top = (n) => n.getBoundingClientRect().top;
  // what's at the top of the view, never the quiet line itself (it moves as blocks wake: the message under it stays)
  function anchor(list) {
    const a = R.topAnchor(list);
    if (!a?.node?.classList.contains('rest-line')) return a;
    let n = a.node.nextElementSibling; while (n && !n.classList.contains('msg')) n = n.nextElementSibling;
    return n ? { node: n, y: top(n) - top(list) } : null;
  }
  // the height a run of nodes takes (to where the next one starts: margins included)
  const span = (nodes) => { const nx = nodes.at(-1).nextElementSibling; return (nx ? top(nx) : nodes.at(-1).getBoundingClientRect().bottom + 18) - top(nodes[0]); };
  // (round 73, chatsteady73) the pictures and videos of messages about to wake whose size isn't known yet are measured
  // first (alongside their Markdown, ≤ 0.6 s), once each: kept on the message (a reply's things / Lab screenshots: w, h,
  // saved with the chat) and in the sizes Native keeps between sessions. Their boxes then have their real size the
  // moment the block slips in: a video drawn 2:1 until its first frame, or a picture 0 px tall until it loaded, moved
  // what you were reading by a few hundred px as you climbed a long chat.
  const MD_IMG = /!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g;
  function mediaOf(msgs) {
    const out = [];
    for (const m of msgs) {
      if (m.role !== 'assistant' && m.role !== 'opinion') continue;
      if (typeof ChatMedia !== 'undefined' && ChatMedia.urlOf) for (const t of (m.things || []).filter((x) => !x.gone && !x.pending && x.path && /^(image|frame|video)$/.test(x.k)).slice(0, ChatMedia.HERO || 2)) if (!t.w) out.push({ src: ChatMedia.urlOf(t.path), vid: t.k === 'video', o: t });
      for (const sh of m.shows || []) if (!sh.w && sh.path) out.push({ src: WinMac.fileUrl(sh.path), o: sh });
      if (String(m.text).includes('](https://')) for (const [, src] of String(m.text).matchAll(MD_IMG)) out.push({ src });
    }
    return out;
  }
  function measure({ src, vid, o }) {
    const s = Native.mediaSize?.(src);
    if (s) { if (o) { o.w = s[0]; o.h = s[1]; } return null; }
    return new Promise((res) => {
      const m = vid ? document.createElement('video') : new Image();
      const done = (w, h) => {
        clearTimeout(tm); m.onload = m.onloadedmetadata = m.onerror = null;
        if (w && h) { Native.noteSize?.(src, w, h); if (o) { o.w = w; o.h = h; } }
        if (vid) { m.removeAttribute('src'); m.load(); } // (lets go of the file)
        res();
      };
      const tm = setTimeout(() => done(), 600);
      if (vid) { m.preload = 'metadata'; m.muted = true; m.onloadedmetadata = () => done(m.videoWidth, m.videoHeight); } else { m.decoding = 'async'; m.onload = () => done(m.naturalWidth, m.naturalHeight); }
      m.onerror = () => done();
      m.src = src;
    });
  }
  // (round 73) what you opened in a message (its thinking, its tool steps) stays open when its block rests and wakes
  const opened = new WeakMap(); // message → [open?] of its <details>, in order
  function keepOpen(chat, nodes) {
    for (const n of nodes) {
      const m = n.classList?.contains('msg') && chat.messages[Number(n.dataset.index)];
      const ds = m && n.querySelectorAll('details');
      if (ds?.length) opened.set(m, [...ds].map((d) => d.open)); else if (m) opened.delete(m);
    }
  }
  function reopen(chat, nodes) {
    for (const n of nodes) {
      const m = n.classList?.contains('msg') && chat.messages[Number(n.dataset.index)]; const st = m && opened.get(m);
      if (!st) continue;
      const ds = n.querySelectorAll('details');
      if (ds.length === st.length) ds.forEach((d, i) => { if (d.open !== st[i]) { d.open = st[i]; if (d.open) R.fillFold?.({ target: d }); } });
    }
  }
  // block `b` drawn in place of its spacer, exactly as a full draw makes it (native.js planOf)
  // (round 76, chatjump76) hurry: a jump / a find is waiting on this block: its Markdown waits ≤ 120 ms and its media
  // sizes ≤ 150 ms (they go on being measured and kept); hold() then keeps the message in place as the rest arrive
  async function wake(agentId, v, chat, b, { hurry = false } = {}) {
    const list = v.list;
    if (list.awake?.has(b)) return false;
    v.waking = true;
    try {
      const msgs = chat.messages.slice(b * R.BLOCK, (b + 1) * R.BLOCK);
      const texts = msgs.filter((m) => m.role === 'assistant' || m.role === 'opinion').map((m) => m.text);
      const media = Promise.all(mediaOf(msgs).map(measure));
      await Promise.all([window.Md && Md.uncached(texts) ? Md.warm(texts, hurry ? 120 : 300) : null, hurry ? Promise.race([media, new Promise((r) => setTimeout(r, 150))]) : media]);
      const gone = () => v.list !== list || H.activeChat[agentId] !== chat.id;
      if (gone() || list.awake.has(b) || !list.querySelector(`:scope > .msg-rest[data-block="${b}"]`)) return false;
      list.awake.add(b);
      if (!v.nodes?.has(chat.id)) (v.nodes ||= new Map()).set(chat.id, new Map());
      const cache = v.nodes.get(chat.id); const used = new Map();
      const { plan, make, spans } = R.planOf(list, agentId, H.agent(agentId), chat, cache, cache, used);
      const [k0, k1] = spans.get(b) || [0, 0];
      const items = []; let t = performance.now();
      for (let k = k0; k < k1; k++) {
        items.push(make(plan[k]));
        if (performance.now() - t > R.SLICE_MS) { await R.nextSlice(); if (gone()) { list.awake.delete(b); return false; } t = performance.now(); }
      }
      const sp = list.querySelector(`:scope > .msg-rest[data-block="${b}"]`);
      if (!sp) return true; // (drawn meanwhile)
      list.bits ||= new Map(); for (const [k, n] of used) list.bits.set(k, n);
      // what's at the top of the view stays put; inside this spacer: the same proportion of the block
      const a = anchor(list);
      const frac = a?.node === sp ? (top(list) - top(sp)) / (sp.getBoundingClientRect().height || 1) : null;
      reopen(chat, items);
      // (round 73) drawn at their real size from the start: an older message off screen is otherwise laid out at a 180 px
      // guess (chatcore.css content-visibility) until it comes near, and the one at the top of the view then grew or
      // shrank under your eyes (≈ 40 px per user message here). After a frame they go back to that rule, which now
      // remembers their real size.
      for (const n of items) if (n.classList?.contains('msg')) n.style.contentVisibility = 'visible';
      requestAnimationFrame(() => requestAnimationFrame(() => { for (const n of items) if (n.style?.contentVisibility) n.style.contentVisibility = ''; }));
      if (items.length) sp.replaceWith(...items); else sp.remove();
      placeLine(list, agentId);
      if (frac != null && items.length) list.scrollTop += top(items[0]) + frac * span(items) - top(list);
      else if (a) R.keepAnchor(list, a);
      R.foldFresh(v, chat, 0);
      for (const fn of hooks.blocks) { try { fn(agentId, v, chat); } catch (err) { console.warn(err); } }
      return true;
    } finally { v.waking = false; }
  }
  // block `b` back to rest: one spacer of its measured height; its nodes and its Markdown let go (the text stays)
  function rest(agentId, v, chat, b, nodes) {
    const list = v.list;
    const h = Math.round(span(nodes));
    (list.restH ||= new Map()).set(b, { n: Math.min(R.BLOCK, R.shownFrom(chat, R.unreadFrom.get(chat.id)) - b * R.BLOCK), h });
    const a = anchor(list);
    list.bits ||= new Map();
    const sp = list.bits.get(`rest|${b}`) || el('div', { class: 'msg-rest', dataset: { block: b } });
    list.bits.set(`rest|${b}`, sp);
    sp.restPx = h; sp.style.height = `${h}px`;
    nodes[0].before(sp);
    keepOpen(chat, nodes);
    for (const n of nodes) { n.remove(); if (list.foldWatch?.delete(n)) list.foldIO?.unobserve(n); }
    list.awake.delete(b);
    placeLine(list, agentId);
    if (a) R.keepAnchor(list, a);
    const cache = v.nodes?.get(chat.id); const texts = [];
    for (const m of chat.messages.slice(b * R.BLOCK, (b + 1) * R.BLOCK)) { cache?.delete(m); if (m.role !== 'user') texts.push(m.text); }
    window.Md?.forget?.(texts);
    watch(agentId, v);
    for (const fn of hooks.blocks) { try { fn(agentId, v, chat); } catch (err) { console.warn(err); } }
  }
  // `step` more of the open chat's earlier messages (the resting blocks just above what's drawn)
  async function more(agentId, step) {
    const v = views.get(agentId); const chat = chats.get(H.activeChat[agentId]);
    if (!v || !chat) return;
    const sps = [...v.list.querySelectorAll(':scope > .msg-rest')].reverse().slice(0, Math.ceil(step / R.BLOCK));
    for (const s of sps) await wake(agentId, v, chat, Number(s.dataset.block));
  }
  // message #index of the open chat in the page: its block woken if it rests; false when it can't be
  async function wakeAt(agentId, index) {
    const v = views.get(agentId); const id = H.activeChat[agentId]; const chat = id && chats.get(id);
    if (!v || !chat || !chat.messages[index]) return false;
    for (let i = 0; i < 150 && (v.drawing || v.waking); i++) await new Promise((r) => setTimeout(r, 20));
    if (H.activeChat[agentId] !== id) return false;
    return Boolean(v.list.querySelector(`.msg[data-index="${index}"]`)) || (index < R.shownFrom(chat, R.unreadFrom.get(id)) && wake(agentId, v, chat, Math.floor(index / R.BLOCK), { hurry: true }));
  }
  // (round 76, chatjump76) a jump or a find lands its message in view and HOLDS it there while what's around it settles:
  // the blocks next to it waking (their messages laid out at the 180 px guess of chatcore.css until drawn), pictures
  // loading at a size not known yet, the far blocks going back to rest. Each size change of the list's children is
  // answered in the same frame, after layout and before paint (a ResizeObserver), by moving the scroll so the message
  // is exactly where it landed: nothing is seen moving. Following the end stops (a picture loading below pulled the
  // chat back to the bottom a moment after find landed on an old message). The hold ends at your own input (wheel,
  // press, key, touch), after 1 s with nothing changing and every picture in the chat loaded or failed, or after 6 s.
  // node: the message (or a function finding it again); first: what to bring into view first (find's mark)
  function hold(agentId, node, { block = 'center', first = null } = {}) {
    const v = views.get(agentId); const list = v?.list;
    if (!list) return;
    v.hold?.();
    const get = typeof node === 'function' ? node : () => node;
    let want = null; let quiet = 0; let ended = false;
    const t0 = performance.now();
    const ro = new ResizeObserver(() => place()); const seen = new WeakSet();
    const watchKids = () => { for (const k of list.children) if (!seen.has(k)) { seen.add(k); ro.observe(k); } };
    const mo = new MutationObserver(() => { watchKids(); place(); });
    const input = () => stop();
    const INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart'];
    function stop() {
      if (ended) return;
      ended = true; clearTimeout(quiet); ro.disconnect(); mo.disconnect();
      for (const t of INPUT) list.removeEventListener(t, input, { capture: true });
      if (v.hold === stop) v.hold = null;
    }
    function settled() {
      if (ended) return;
      if (performance.now() - t0 < 6000 && [...list.querySelectorAll('img')].some((i) => !i.complete)) { quiet = setTimeout(settled, 400); return; }
      stop();
    }
    function place() {
      if (ended) return;
      const n = get();
      if (!n?.isConnected || v.list !== list || performance.now() - t0 > 6000) { stop(); return; }
      const l = list.getBoundingClientRect(); const r = n.getBoundingClientRect();
      if (want == null) {
        const f = first?.isConnected ? first : n; const q = f.getBoundingClientRect();
        if (f !== n || q.top < l.top || q.bottom > l.bottom) f.scrollIntoView({ block });
        want = n.getBoundingClientRect().top - l.top;
        const msgs = list.querySelectorAll(':scope > .msg');
        if (n !== msgs[msgs.length - 1]) v.follow = false;
      } else {
        const d = r.top - l.top - want;
        if (Math.abs(d) >= 1) list.scrollTop += d;
      }
      clearTimeout(quiet); quiet = setTimeout(settled, 1000);
    }
    v.hold = stop;
    for (const t of INPUT) list.addEventListener(t, input, { capture: true, passive: true });
    place();
    watchKids(); mo.observe(list, { childList: true });
  }
  // (the name chat-ux.js / native.js used before round 76: the node put back in view once its neighbours had drawn)
  const settle = (agentId, node, block = 'center') => hold(agentId, node, { block });
  // find in chat (chat-ux.js): the resting messages of the open chat that hold `q` (their text or thinking)
  function restingHits(agentId, q) {
    const v = views.get(agentId); const id = H.activeChat[agentId]; const chat = id && chats.get(id); const needle = String(q || '').toLowerCase();
    if (!v?.list.awake || !chat || !needle) return [];
    const out = [];
    for (let i = 0, from = R.shownFrom(chat, R.unreadFrom.get(id)); i < from; i++) {
      const m = chat.messages[i];
      if (!v.list.awake.has(Math.floor(i / R.BLOCK)) && !m.compactReq && (String(m.text || '').toLowerCase().includes(needle) || String(m.thinking || '').toLowerCase().includes(needle))) out.push(i);
    }
    return out;
  }
  // (the chats drawn before this file loaded start being watched now)
  for (const [agentId, v] of views) watch(agentId, v);
  return { watch, soon, wake, wakeAt, more, restingHits, settle, hold };
})();
