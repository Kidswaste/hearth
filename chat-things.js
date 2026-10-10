// Things a reply made, inside the reply (round 9, chatcore): when a reply or one of its tool calls produces a capture,
// a frame, a render, a board item, a Lab scene, a sequence or a video project, it shows under the reply as a small card
// (a picture, or a video poster that plays while you point at it and scrubs frame by frame along its bottom edge).
// Click opens it in its tool; drag it to the board, the editor, another chat or another app; right-click for the rest.
// Nothing here reaches the engines: cards are drawn from the hub's own record of the calls (HubBridge.onResult) and
// stored on the message as `things`, which no prompt, context or export reads.
const ChatThings = (() => {
  const MEDIA = /\.(png|jpe?g|webp|gif|bmp|mp4|webm|mov|m4v|mkv)$/i;
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const MAX = 8; // cards per reply
  const live = new Map(); // chat id -> { things: [], frame: { data, mime, tool } | null } while a reply runs
  const fileUrl = (p) => (/^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const keyOf = (t) => `${t.k}:${t.path || t.id || t.name}`;
  const GLYPH = { image: '🖼', video: '🎬', board: '▦', scene: '◭', sequence: '▤', project: '🎬', frame: '◧' };
  const KIND = { image: 'picture', video: 'video', board: 'board item', scene: 'Lab scene', sequence: 'Lab sequence', project: 'video project', frame: 'frame' };

  // ---------- what a call made ----------
  // absolute paths of pictures / videos in a result's text ("path: /x/y.png", "rendered C:\…\a.mp4")
  function pathsIn(text) {
    const out = [];
    const re = /(?:^|[\s:("'=])((?:[A-Za-z]:[\\/]|\/)[^\n"'<>|*?]*?\.(?:png|jpe?g|webp|gif|mp4|webm|mov|m4v|mkv))(?=$|[\s,;)"'\]])/gim;
    for (const m of String(text || '').matchAll(re)) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }
  // tools that only read or list (their paths are inputs or listings, not something made)
  const READS = /^(capture_list|video_list|video_status|board_list|board_vibe|three_(read_code|search_code|console|help|state|task|layers|list|status|contact_sheet)|chat_)/;
  const LAB_READS = /^three_(read_code|search_code|console|screenshot|help|state|task|layers|list|status|contact_sheet|media_control|input|sequence)/;
  function fromCall({ tool, args = {}, result = {}, chatId }) {
    const found = [];
    if (!tool || result.ok === false) return { found };
    const text = typeof result.value === 'string' ? result.value : HubBridge.fmtText?.(result.value) || '';
    if (!READS.test(tool)) {
      for (const p of pathsIn(text).slice(0, 4)) found.push({ k: VIDEO.test(p) ? 'video' : 'image', path: p, name: base(p), src: tool });
    }
    if (tool === 'board_add') {
      const m = text.match(/added (\S+) \(([^)]*)\) to "([^"]*)"/);
      if (m) found.push({ k: 'board', id: m[1], board: m[3], name: args.title || (args.text ? String(args.text).slice(0, 40) : m[2]), kind: m[2], src: tool });
    }
    if (tool === 'three_sequence' && typeof ThreeSeq !== 'undefined' && ThreeSeq.key) found.push({ k: 'sequence', id: ThreeSeq.key, name: ThreeSeq.key.replace(/^seq:/, '').slice(0, 40), src: tool });
    if (/^three_/.test(tool) && !LAB_READS.test(tool)) {
      const sid = (typeof ChatScenes !== 'undefined' && chatId && ChatScenes.linkOf?.(chatId)) || ThreeLab.scenes?.currentId?.();
      const sk = sid && ThreeLab.scenes?.get(sid);
      if (sk) found.push({ k: 'scene', id: sk.id, name: sk.name, src: tool });
    }
    if (tool === 'video_edit' && args.op === 'project' && typeof Intro !== 'undefined') {
      const p = Intro.ofChat?.(chatId);
      if (p) found.push({ k: 'project', id: p.id, name: p.name, src: tool });
    }
    // a picture with no file (the Lab's screenshot, a sequence frame): the latest one becomes a "frame" card at the end
    const imgs = [].concat(result.images || (result.image ? [{ data: result.image, mime: result.mime }] : [])).filter((x) => x?.data);
    const frame = !found.some((t) => t.k === 'image') && imgs.length && !/^capture_frames/.test(tool) ? { data: imgs.at(-1).data, mime: imgs.at(-1).mime || 'image/png', tool } : null;
    return { found, frame };
  }
  function add(chatId, things) {
    const L = live.get(chatId);
    if (!L) return;
    for (const t of things) {
      const key = keyOf(t);
      const old = L.things.findIndex((x) => keyOf(x) === key);
      if (old >= 0) continue;
      if (L.things.length >= MAX) L.things.shift();
      L.things.push(t);
      document.dispatchEvent(new CustomEvent('hearth:chat-thing', { detail: { chatId, thing: t } }));
      const agentId = H.chats?.find((c) => c.id === chatId)?.agentId || chatId.split('-')[0];
      // while the reply runs: the card shows in it at once
      Native.liveCard?.(chatId, cardEl(t, { agentId, chatId, live: true }));
    }
  }
  // the hub's record of every finished call (bridge.js); the run's chat comes with it (HUB_CHAT_ID), or the agent's
  function onCall(call) {
    const chatId = call.chatId || (call.agentId ? Native.pendingFor?.(call.agentId) : null);
    if (!chatId || !live.has(chatId)) return;
    const { found, frame } = fromCall({ ...call, chatId });
    if (found.length) add(chatId, found);
    if (frame) live.get(chatId).frame = frame;
  }
  HubBridge.onResult?.(onCall);
  Native.hooks.send.push((agentId, chat) => { live.set(chat.id, { things: [], frame: null }); });
  // the reply is about to be saved: its things go with it (and paths the reply itself names, checked when drawn)
  Native.hooks.finish.push((event, chat, extras) => {
    const L = live.get(chat.id);
    live.delete(chat.id);
    const things = L ? L.things.slice() : [];
    const text = event.type === 'done' ? String(event.text || '') : '';
    for (const p of pathsIn(text.replace(/```[\s\S]*?```/g, ' ')).slice(0, 4)) if (!things.some((t) => t.path === p)) things.push({ k: VIDEO.test(p) ? 'video' : 'image', path: p, name: base(p), src: 'reply', check: true });
    if (L?.frame) {
      // saved once per reply (not per screenshot): the last picture the tools returned
      const t = { k: 'frame', name: `${/^three_/.test(L.frame.tool) ? 'Lab' : 'Tool'} frame`, src: L.frame.tool, path: null, pending: true };
      things.push(t);
      window.hub.saveAttachment(`frame-${Date.now().toString(36)}.${/png/.test(L.frame.mime) ? 'png' : 'jpg'}`, L.frame.data).then((p) => {
        t.path = p; delete t.pending; Native.save(chat);
        document.querySelectorAll(`.thing[data-key="frame:pending:${chat.id}"]`).forEach((n) => n.replaceWith(cardEl(t, { agentId: chat.agentId, chatId: chat.id })));
      }).catch(() => { t.gone = true; });
    }
    if (things.length) extras.things = things.slice(-MAX);
  });

  // ---------- the cards ----------
  // videos load their first frame only once their card is on screen, and play only while pointed at
  const seen = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { const v = e.target; seen.unobserve(v); if (!v.src) { v.preload = 'metadata'; v.src = `${v.dataset.src}#t=0.05`; } }
  }, { rootMargin: '200px' }) : null;
  const fpsCache = new Map();
  async function fpsOf(path) {
    if (fpsCache.has(path)) return fpsCache.get(path);
    let fps = 30;
    try { if (typeof FrameRead !== 'undefined') { const i = await FrameRead.info(path); if (i?.fps > 1) fps = i.fps; } } catch { /* 30 */ }
    fpsCache.set(path, fps);
    return fps;
  }
  const clock = (t, fps) => `f ${Math.floor(t * fps + 1e-4)} · ${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  function thumbOf(t) {
    if (t.path && (t.k === 'image' || t.k === 'frame')) return el('img', { src: fileUrl(t.path), alt: '', loading: 'lazy', draggable: false, on: { error: (e) => e.target.closest('.thing')?.classList.add('thing-missing') } });
    if (t.path && t.k === 'video') {
      const v = el('video', { muted: true, loop: true, playsInline: true, preload: 'none', dataset: { src: fileUrl(t.path) }, draggable: false });
      v.addEventListener('error', () => v.closest('.thing')?.classList.add('thing-missing'));
      if (seen) seen.observe(v); else v.src = `${v.dataset.src}#t=0.05`;
      return v;
    }
    let url = null;
    try {
      if (t.k === 'scene') url = (typeof ChatScenes !== 'undefined' && ChatScenes.thumbOf?.(H.chats?.find((c) => ChatScenes.linkOf?.(c.id) === t.id)?.id)) || ThreeLab.scenes?.thumbOf?.(t.id) || null;
      if (t.k === 'board' && typeof Board !== 'undefined') { const it = Board.item?.(t.id); const p = it && (it.tiny || it.thumb || it.poster || (it.type === 'image' ? it.src : null)); url = p ? Board.fileUrl(p) : null; }
    } catch { /* a glyph instead */ }
    return url ? el('img', { src: url, alt: '', loading: 'lazy', draggable: false }) : el('span', { class: 'thing-glyph', text: GLYPH[t.k] || '◇' });
  }
  function cardEl(t, ctx = {}) {
    const isVid = t.k === 'video' && t.path;
    const thumb = el('div', { class: 'thing-pic' }, thumbOf(t));
    const label = el('span', { class: 'thing-name', text: t.name || KIND[t.k] });
    const read = el('span', { class: 'thing-read' });
    const card = el('div', {
      class: `thing thing-${t.k}${t.pending ? ' thing-pending' : ''}`, tabindex: 0, draggable: true,
      dataset: { key: t.pending ? `frame:pending:${ctx.chatId}` : keyOf(t), kind: t.k },
      title: `${KIND[t.k] || t.k}: ${t.name || ''}${t.path ? `\n${t.path}` : t.board ? `\non “${t.board}”` : ''}\nClick: open · drag: to the board, the editor, a chat · right-click: more${isVid ? '\nPoint at it: plays · along its bottom edge: frame by frame (← → step)' : ''}`,
    }, thumb, el('div', { class: 'thing-foot' }, el('span', { class: 'thing-k', text: GLYPH[t.k] || '◇' }), label, read),
    el('button', { type: 'button', class: 'thing-more', text: '⋯', title: 'More', on: { click: (e) => { e.stopPropagation(); menu(t, ctx, e.currentTarget.getBoundingClientRect()); } } }));
    card.addEventListener('click', (e) => { if (e.target.closest('.thing-more, .thing-scrub')) return; openThing(t, ctx); });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); openThing(t, ctx); }
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); menu(t, ctx, card.getBoundingClientRect()); }
    });
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); menu(t, ctx, { left: e.clientX, bottom: e.clientY - 4 }); });
    card.addEventListener('dragstart', (e) => dragThing(e, t));
    if (isVid) videoCard(card, thumb.querySelector('video'), t, read);
    return card;
  }
  // point at it: it plays (muted); along the bottom edge: exact frames under the pointer; ← / → step a frame
  function videoCard(card, v, t, read) {
    if (!v) return;
    const scrub = el('div', { class: 'thing-scrub' }, el('i'));
    card.querySelector('.thing-pic').append(scrub);
    let fps = fpsCache.get(t.path) || 30; let scrubbing = false;
    const show = () => { read.textContent = clock(v.currentTime || 0, fps); scrub.style.setProperty('--at', `${((v.currentTime || 0) / (finiteDur(v.duration) || 1)) * 100}%`); };
    const ready = () => (v.src ? Promise.resolve() : new Promise((r) => { v.preload = 'auto'; v.src = v.dataset.src; v.addEventListener('loadedmetadata', r, { once: true }); }));
    const seekFrame = async (n) => {
      await ready(); fps = await fpsOf(t.path);
      const total = Math.max(1, Math.floor(finiteDur(v.duration) * fps));
      const f = Math.max(0, Math.min(total - 1, n));
      v.pause(); v.currentTime = (f + 0.5) / fps; // the middle of the frame: never the one before after rounding
      v.requestVideoFrameCallback?.(() => show());
      return f;
    };
    card.addEventListener('mouseenter', () => { if (!scrubbing) ready().then(() => v.play().catch(() => {})); });
    card.addEventListener('mouseleave', () => { scrubbing = false; v.pause(); });
    v.addEventListener('timeupdate', () => { if (!scrubbing && card.matches(':hover')) show(); });
    scrub.addEventListener('pointermove', async (e) => {
      scrubbing = true;
      const r = scrub.getBoundingClientRect();
      await ready(); fps = await fpsOf(t.path);
      seekFrame(Math.floor(((e.clientX - r.left) / r.width) * finiteDur(v.duration) * fps));
    });
    scrub.addEventListener('pointerleave', () => { scrubbing = false; });
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== ' ') return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === ' ') { ready().then(() => (v.paused ? v.play() : v.pause())); return; }
      scrubbing = true;
      seekFrame(Math.round((v.currentTime || 0) * fps - 0.5) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    });
  }

  // ---------- open, drag, send ----------
  const tryRun = (fn) => async () => { try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } };
  async function openThing(t, ctx = {}) {
    try {
      if (t.pending) return;
      if ((t.k === 'image' || t.k === 'frame' || t.k === 'video') && t.path) {
        if (typeof CaptureView !== 'undefined') await CaptureView.open(t.path); else window.hub.fs.open(t.path);
      } else if (t.k === 'board') {
        activate('tool:board');
        const b = typeof Board !== 'undefined' ? (Board.boards().find((x) => x.name === t.board)) : null;
        if (b) await Board.open(b.id);
        setTimeout(() => { try { Board.select([t.id]); Board.zoomSel(); } catch { /* the item may be gone */ } }, 150);
      } else if (t.k === 'scene') {
        if (typeof ChatScenes !== 'undefined' && ChatScenes.openScene) { activate('tool:three'); await ChatScenes.openScene(t.id); } else { await ThreeLab.cmd(); ThreeLab.scenes?.open(t.id); }
      } else if (t.k === 'sequence') {
        await ThreeLab.cmd(); await ThreeSeq.open(t.id); await ThreeSeq.enter();
      } else if (t.k === 'project') {
        Commands.exec(`/intro open ${t.name}`, ctx.agentId || H.claudeAgent()?.id);
      }
    } catch (err) { toast(err.message, { type: 'error' }); }
  }
  function dragThing(e, t) {
    if (t.path && !t.pending) { e.preventDefault(); window.hub.capture?.startDrag?.(t.path); return; } // a real file: the board, the editor, Finder, another chat
    e.dataTransfer.setData('application/x-hearth-thing', JSON.stringify(t));
    e.dataTransfer.setData('text/plain', `${KIND[t.k]}: ${t.name}`);
    if (t.k === 'scene') e.dataTransfer.setData('application/x-hearth-scene', JSON.stringify({ what: { sketch: t.id } })); // onto the Lab sequence
    if (t.k === 'board' && typeof BoardDrawer !== 'undefined') {
      const b = Board.boards().find((x) => x.name === t.board);
      if (b) e.dataTransfer.setData(BoardDrawer.REF_TYPE, JSON.stringify({ boardId: b.id, itemIds: [t.id] })); // onto a chat: its vibe
    }
    e.dataTransfer.effectAllowed = 'copy';
  }
  const chatAgents = () => H.agents().filter((a) => a.mode === 'native');
  // into a chat's next message: a picture as it is, a video as its contact sheet, the rest as a short reference line
  async function sendTo(t, agentId) {
    if (t.path) { await Native.attachPaths(agentId, [t.path]); toast(`Attached to ${H.agent(agentId)?.name}`, { timeout: 1600 }); return; }
    if (t.k === 'board' && typeof BoardDrawer !== 'undefined') { const b = Board.boards().find((x) => x.name === t.board); await BoardDrawer.attach(agentId, { boardId: b?.id, itemIds: [t.id] }); return; }
    if (typeof ChatAttach !== 'undefined') await ChatAttach.attachThing(agentId, t);
  }
  function menu(t, ctx, r) {
    const here = ctx.agentId;
    const p = t.path;
    const isVid = t.k === 'video';
    const items = [
      { label: `Open${{ image: '', frame: '', video: ' in the player', board: ' on the board', scene: ' in the Lab', sequence: ' in the Lab sequence', project: ' (its card)' }[t.k] || ''}`, key: 'Enter', action: () => openThing(t, ctx) },
      { label: 'Send to', icon: 'export', items: () => [
        here ? { label: 'This chat (attach)', action: tryRun(() => sendTo(t, here)) } : null,
        { label: 'Another chat', items: () => chatAgents().filter((a) => a.id !== here).map((a) => ({ label: a.name, action: tryRun(() => sendTo(t, a.id)) })) },
        p ? { label: 'The board', action: tryRun(async () => { await Board.ready?.(); await Board.addFiles([p]); toast('On the board', { timeout: 1400, action: { label: 'Show', fn: () => activate('tool:board') } }); }) } : null,
        p && isVid ? { label: 'The editor (add to the edit)', action: tryRun(() => Capture.addToEdit(p)) } : null,
        p && isVid ? { label: 'Video Review', action: tryRun(() => Capture.openInReview(p)) } : null,
        p && isVid ? { label: 'The editor timeline', action: tryRun(() => Capture.openInReview(p, { cut: true })) } : null,
        p && (isVid || t.k === 'image') ? { label: 'The Lab (as media)', action: tryRun(() => Capture.addToLab(p)) } : null,
        t.k === 'scene' && typeof ThreeSeq !== 'undefined' ? { label: 'The Lab sequence (add this scene)', action: tryRun(async () => { await ThreeLab.cmd(); await ThreeSeq.add({ sketch: t.id }); toast('Added to the sequence', { timeout: 1400 }); }) } : null,
      ].filter(Boolean) },
      p && typeof CaptureView !== 'undefined' ? { label: isVid ? 'Frames, make, read…' : 'Picture tools…', items: () => CaptureView.itemsFor(p).filter((x) => x && !/^(▶ Play|🖼 Open|→ Send)/.test(x.label || '')) } : null,
      p ? { label: 'Copy the path', action: () => copyText(p, 'Path copied') } : null,
      p ? { label: 'Show in folder', more: true, action: () => window.hub.fs.reveal(p) } : null,
      { label: 'Hide this card', more: true, action: () => hide(t, ctx) },
      ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Chat') : []),
    ].filter(Boolean);
    showMenu(r.left, r.bottom + 4, items);
  }
  // takes a card off its message (the file stays)
  function hide(t, ctx) {
    const chat = Native.current?.(ctx.agentId);
    const m = chat?.messages[ctx.index];
    if (!m?.things) return;
    m.things = m.things.filter((x) => keyOf(x) !== keyOf(t));
    if (!m.things.length) delete m.things;
    Native.save(chat);
    Native.refresh(ctx.agentId, { keepScroll: true });
  }

  // a saved reply's cards, under its text (Native.hooks.message)
  function stripOf(m, index, agentId) {
    const list = (m.things || []).filter((t) => !t.gone && (t.path || t.id || t.pending));
    if (!list.length) return null;
    const chatId = H.activeChat?.[agentId];
    const strip = el('div', { class: 'thing-strip', dataset: { n: String(list.length) } }, list.map((t) => cardEl(t, { agentId, chatId, index })));
    return strip;
  }
  Native.hooks.message.push((node, m, index, agent) => {
    if (m.role !== 'assistant' || !m.things?.length) return;
    const strip = stripOf(m, index, agent.id);
    if (!strip) return;
    const foot = node.querySelector(':scope > .msg-foot');
    if (foot) foot.before(strip); else node.append(strip);
  });

  // ---------- this chat's things, as a list ----------
  function ofChat(chat) {
    const out = [];
    (chat?.messages || []).forEach((m, i) => { for (const t of m.things || []) if (!t.gone) out.push({ ...t, index: i }); });
    return out;
  }
  function register() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register(def); };
    reg({
      name: 'things', area: 'Messages', args: '[pictures | videos | scenes | board | all]', aliases: ['made'],
      desc: 'What this chat made: captures, frames, renders, board items, scenes, sequences (click to open)',
      complete: () => ['all', 'pictures', 'videos', 'scenes', 'board', 'sequences'].map((value) => ({ value })),
      examples: ['/things', '/things videos'],
      run: (args, ctx) => {
        const want = String(args || 'all').toLowerCase();
        const pick = { pictures: ['image', 'frame'], videos: ['video'], scenes: ['scene'], board: ['board'], sequences: ['sequence', 'project'] }[want.replace(/s?$/, 's')] || null;
        const list = ofChat(ctx.chat).filter((t) => !pick || pick.includes(t.k)).reverse();
        if (!list.length) return 'Nothing made in this chat yet: captures, frames, renders, board items and scenes from its replies show here.';
        ctx.note(`**Made in this chat** (${list.length}, newest first): click one to open it.`, { id: 'things', actions: list.slice(0, 12).map((t) => ({ label: `${GLYPH[t.k]} ${String(t.name || KIND[t.k]).slice(0, 28)}`, title: t.path || t.board || '', run: () => openThing(t, ctx) })) });
        return undefined;
      },
    });
    reg({
      name: 'open-last', area: 'Messages', args: '[video | picture | scene | board | sequence]',
      desc: 'Open the newest thing this chat made (a render, a capture, a scene…)',
      complete: () => ['video', 'picture', 'scene', 'board', 'sequence'].map((value) => ({ value })),
      run: (args, ctx) => {
        const want = String(args || '').toLowerCase();
        const kinds = { video: ['video'], render: ['video'], picture: ['image', 'frame'], frame: ['frame', 'image'], scene: ['scene'], board: ['board'], sequence: ['sequence'] }[want] || null;
        const t = ofChat(ctx.chat).reverse().find((x) => !kinds || kinds.includes(x.k));
        if (!t) return `No ${want || 'thing'} made in this chat yet.`;
        openThing(t, ctx);
        return undefined;
      },
    });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();
  try {
    Keys.add(
      { area: 'Chat', keys: 'Point at a video card', what: 'plays it (muted); along its bottom edge: frame by frame' },
      { area: 'Chat', keys: '← / → on a video card', what: 'one frame back / forward (Shift: 10), Space plays' },
      { area: 'Chat', keys: 'Drag a card', what: 'to the board, the editor, another chat or another app (a real file)' },
      { area: 'Chat', keys: 'Right-click a card', what: 'open, send to the board / editor / Lab / a chat, frame tools' },
    );
  } catch { /* keys.js not loaded */ }

  return { fromCall, pathsIn, cardEl, openThing, sendTo, menu, ofChat, keyOf, GLYPH, KIND, _live: live };
})();
