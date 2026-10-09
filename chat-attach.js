// Attach from anywhere (round 9, chatcore): the ＋ in the chat box is one open menu that branches into the sources —
// files, the board, captures, the Lab (its frame, its scene), the screen (the window, this tool, a region) and recent
// renders — and the same sources are chat commands (/attach-board, /attach-capture, /attach-frame, /attach-region,
// /attach-render, /attach-scene). Drops from the Video Review library, the Lab sequence's scene tiles and chat cards
// land in the chat box too. Pictures attach as pictures, videos as their contact sheet (engines read pictures, not
// video files), the board as its vibe (never its media), a scene as a short text. Nothing is sent until you send.
const ChatAttach = (() => {
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const fail = (err) => toast(err?.message || String(err), { type: 'error' });
  const tryRun = (fn) => () => Promise.resolve().then(fn).catch(fail);
  const ago = (ms) => (typeof timeAgo === 'function' ? timeAgo(ms) : new Date(ms).toLocaleString());

  // ---------- sources ----------
  async function recentCaptures(kind = 'all', limit = 10) {
    try { return (await window.hub.capture.list({ kind, limit })) || []; } catch { return []; }
  }
  // finished renders: Video Review's exports and Lab recordings (kv video-library), then video captures, newest first
  async function recentRenders(limit = 10) {
    const lib = await window.hub.kvGet('video-library', {}).catch(() => ({}));
    const paths = [...new Set([...(lib.exports || []), ...((lib.recordings || []).map((r) => r.path || r))])].filter((p) => typeof p === 'string' && VIDEO.test(p));
    const stats = await Promise.all(paths.slice(0, 40).map(async (p) => { try { const s = await window.hub.fs.stat(p); return s ? { path: p, mtime: s.mtimeMs || s.mtime || 0 } : null; } catch { return null; } }));
    const caps = (await recentCaptures('video', limit)).map((c) => ({ path: c.path, mtime: c.mtime }));
    return [...stats.filter(Boolean), ...caps].filter((x, i, a) => a.findIndex((y) => y.path === x.path) === i).sort((a, b) => (b.mtime || 0) - (a.mtime || 0)).slice(0, limit);
  }
  async function attachPath(agentId, p) { await Native.attachPaths(agentId, [p]); Native.focus(agentId); }
  async function attachDataUrl(agentId, url, name) {
    const p = await window.hub.saveAttachment(name, url.split(',')[1]);
    await attachPath(agentId, p);
    return p;
  }
  // the Lab preview as a picture (the scene on screen; the Lab loads when it isn't open yet)
  async function labFrame(agentId) {
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t available');
    if (!ThreeLab.director) await ThreeLab.cmd({ show: false }).catch(() => ThreeLab.cmd());
    const url = await ThreeLab.shot();
    if (!url) throw new Error('The Lab preview isn\'t drawing yet (open the Lab once)');
    const name = (ThreeLab.scenes?.get(ThreeLab.scenes.currentId())?.name || 'Lab').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40);
    await attachDataUrl(agentId, url, `${name} · frame.png`);
    toast(`Lab frame attached: ${name}`, { timeout: 1600 });
  }
  // a scene as a few lines of text (its name, frame size, layers): what to build on, without its code
  function sceneText(sk) {
    const layers = (sk.layers || []).map((l) => `${l.name || l.id}${l.visible === false ? ' (hidden)' : ''}${l.blend && l.blend !== 'normal' ? ` · ${l.blend}` : ''}`);
    return `Lab scene "${sk.name}"${layers.length ? `\nLayers (bottom first): ${layers.join('; ')}` : ''}\n(The scene is in the Three.js Lab; its code isn't attached.)`;
  }
  async function labScene(agentId, id = null) {
    const S = ThreeLab.scenes;
    if (!S) { await ThreeLab.cmd({ show: false }).catch(() => {}); }
    const sk = ThreeLab.scenes?.get(id || ThreeLab.scenes.currentId());
    if (!sk) throw new Error('No Lab scene yet');
    await Native.addFiles(agentId, [new File([sceneText(sk)], `scene · ${sk.name.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40)}.txt`, { type: 'text/plain' })]);
    Native.focus(agentId);
    toast(`Scene attached: ${sk.name}`, { timeout: 1600 });
  }
  async function screen(agentId, target) {
    if (typeof Capture === 'undefined') throw new Error('Capture isn\'t available');
    const r = await Capture.shot({ target, quiet: true });
    if (!r?.path) return; // Esc on the region picker
    await attachPath(agentId, r.path);
  }
  // a card from a reply (chat-things.js) dropped on another chat: a file as itself, the rest as one reference line
  async function attachThing(agentId, t) {
    if (t.path) return attachPath(agentId, t.path);
    if (t.k === 'scene') return labScene(agentId, t.id);
    if (t.k === 'board' && typeof BoardDrawer !== 'undefined') { const b = Board.boards().find((x) => x.name === t.board); return BoardDrawer.attach(agentId, { boardId: b?.id, itemIds: [t.id] }); }
    const line = t.k === 'sequence' ? `Lab sequence "${t.name}" (in the Three.js Lab's ▤ Sequence).` : t.k === 'project' ? `Video project "${t.name}" (/intro open ${t.name}).` : `${t.k}: ${t.name}`;
    Native.insertDraft(agentId, `${line} `);
    return null;
  }

  // ---------- the ＋ menu ----------
  async function menu(agentId, anchor) {
    const r = anchor.getBoundingClientRect?.() || { left: anchor.clientX, top: anchor.clientY, bottom: anchor.clientY };
    // (menus are synchronous: what a submenu lists is read first, in parallel; a few ms)
    const [caps, renders, board] = await Promise.all([
      typeof Capture !== 'undefined' ? recentCaptures('all', 10) : [],
      recentRenders(10).catch(() => []),
      typeof Board !== 'undefined' ? boardItems(agentId).catch(() => null) : null,
    ]);
    const scenes = typeof ThreeLab !== 'undefined' ? (ThreeLab.scenes?.all() || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).filter((s) => s.id !== ThreeLab.scenes.currentId()).slice(0, 6) : [];
    const items = [
      { label: 'Files…', icon: 'notes', key: 'Shift+click', action: tryRun(() => Native.pickFiles(agentId)) },
      board ? { label: 'Board', icon: 'board', items: board } : null,
      typeof Capture !== 'undefined' ? { label: 'Captures', icon: 'capture', items: [
        ...caps.map((c) => ({ label: `${c.kind === 'video' ? '🎬' : '📷'} ${base(c.path).slice(0, 40)}`, hint: ago(c.mtime), action: tryRun(() => attachPath(agentId, c.path)) })),
        caps.length ? '-' : { label: 'No captures yet', disabled: true },
        { label: 'All captures…', key: 'Ctrl+Alt+V', action: tryRun(() => CaptureView.library()) },
      ] } : null,
      typeof ThreeLab !== 'undefined' ? { label: 'Lab', icon: 'three', items: [
        { label: 'The frame on screen', hint: 'a picture', action: tryRun(() => labFrame(agentId)) },
        { label: 'The scene', hint: 'its name and layers', action: tryRun(() => labScene(agentId)) },
        scenes.length ? '-' : null,
        ...scenes.map((s) => ({ label: `◭ ${s.name}`, hint: 'scene', action: tryRun(() => labScene(agentId, s.id)) })),
      ] } : null,
      typeof Capture !== 'undefined' ? { label: 'Screen', icon: 'shot', items: [
        { label: 'A region…', hint: 'drag a rectangle', action: tryRun(() => screen(agentId, 'region')) },
        { label: 'This tool', action: tryRun(() => screen(agentId, 'tool')) },
        { label: 'The whole window', action: tryRun(() => screen(agentId, 'window')) },
      ] } : null,
      { label: 'Recent renders', icon: 'film', items: renders.length ? renders.map((x) => ({ label: `🎬 ${base(x.path).slice(0, 42)}`, hint: x.mtime ? ago(x.mtime) : '', action: tryRun(() => attachPath(agentId, x.path)) })) : [{ label: 'No renders yet', disabled: true }] },
      ...(typeof ChatContext !== 'undefined' ? ChatContext.attachItems(agentId) : []),
    ].filter(Boolean);
    showMenu(r.left, (r.top ?? r.bottom) - 4 - 8, items);
    // (the menu opens above the chat box when there is room: showMenu clamps it to the window)
  }
  async function boardItems(agentId) {
    await Board.ready?.();
    const chatId = H.activeChat?.[agentId];
    const b = chatId ? await Board.boardFor(chatId) : Board.current();
    if (!b) return [{ label: 'No board yet', disabled: true }];
    const refs = (b.items || []).filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden).slice(-8).reverse();
    return [
      { label: `The board's vibe: ${b.name}`, hint: 'all of it', action: tryRun(() => BoardDrawer.attach(agentId, { boardId: b.id })) },
      { label: 'Only…', items: () => BoardData.FOCUS.slice(1, 9).map((f) => ({ label: f.name, action: tryRun(() => BoardDrawer.attach(agentId, { boardId: b.id, focus: f.id })) })) },
      refs.length ? '-' : null,
      ...refs.map((it) => ({ label: `${it.title || BoardVibe.KIND_WORD?.[it.type] || it.type}`.slice(0, 40), hint: BoardVibe.KIND_WORD?.[it.type] || it.type, action: tryRun(() => BoardDrawer.attach(agentId, { boardId: b.id, itemIds: [it.id] })) })),
      '-',
      { label: 'Open the drawer', key: 'Ctrl+Shift+M', action: () => BoardDrawer.toggle(true) },
    ].filter(Boolean);
  }

  // ---------- drops and pastes from the other tools ----------
  const TYPES = ['text/x-hearth-video', 'application/x-hearth-scene', 'application/x-hearth-thing'];
  const viewUnder = (target) => H.agents().find((a) => a.mode === 'native' && Native.view(a.id)?.root?.contains(target)) || null;
  let hinted = null;
  const ours = (dt) => dt && TYPES.some((t) => dt.types.includes(t)) && !dt.types.includes('application/x-hearth-ref');
  addEventListener('dragover', (e) => {
    if (!ours(e.dataTransfer)) return;
    const a = viewUnder(e.target);
    if (!a) { hinted?.classList.remove('bdd-drop-hint'); hinted = null; return; }
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy';
    const f = Native.view(a.id).form;
    if (hinted !== f) { hinted?.classList.remove('bdd-drop-hint'); hinted = f; f.classList.add('bdd-drop-hint'); }
  }, true);
  addEventListener('dragend', () => { hinted?.classList.remove('bdd-drop-hint'); hinted = null; }, true);
  addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!ours(dt)) return;
    hinted?.classList.remove('bdd-drop-hint'); hinted = null;
    const a = viewUnder(e.target);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const vid = dt.getData('text/x-hearth-video');
    const thing = dt.getData('application/x-hearth-thing');
    const scene = dt.getData('application/x-hearth-scene');
    (async () => {
      if (vid) return attachPath(a.id, vid);
      if (thing) return attachThing(a.id, JSON.parse(thing));
      if (scene) { const d = JSON.parse(scene); const sid = d.what?.sketch || (d.what?.chat && ChatScenes.linkOf?.(d.what.chat)); if (sid) return labScene(a.id, sid); }
      return null;
    })().catch(fail);
  }, true);
  // a pasted path to a picture or a video (copied from a capture, a render, Finder) attaches the file
  document.addEventListener('paste', (e) => {
    const ta = e.target;
    if (!ta?.matches?.('.composer textarea') || e.clipboardData?.files?.length) return;
    const t = (e.clipboardData?.getData('text/plain') || '').trim().replace(/^["']|["']$/g, '');
    if (!/^(?:[A-Za-z]:[\\/]|\/)[^\n]+\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/i.test(t)) return;
    const a = viewUnder(ta);
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    window.hub.fs.stat(t).then((s) => {
      if (!s) { Native.insertDraft(a.id, t); return; }
      attachPath(a.id, t).then(() => toast(`Attached ${base(t)}`, { timeout: 2400, action: { label: 'Paste as text', fn: () => { const v = Native.view(a.id); v.attachments.pop(); Native.renderChips(a.id); Native.insertDraft(a.id, t); } } }));
    }).catch(() => Native.insertDraft(a.id, t));
  }, true);

  // Alt+A in a chat box: the ＋ menu (read from e.code: on a Mac ⌥A types a letter)
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== 'KeyA' || !e.target?.matches?.('.composer textarea')) return;
    const a = viewUnder(e.target);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    menu(a.id, Native.view(a.id).form.querySelector('.attach-btn') || e.target).catch(fail);
  }, true);

  // ---------- commands ----------
  function register() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register({ area: 'Compose', ...def }); else console.warn(`chat-attach: /${def.name} exists`); };
    const need = (ctx) => { if (!ctx.agentId || H.agent(ctx.agentId)?.mode !== 'native') throw new Error('Run it in a Claude or Astra chat'); return ctx.agentId; };
    reg({ name: 'attach-board', args: '[item name | focus]', desc: 'Attach the board\'s vibe (or one reference\'s) to your message — never its media',
      keywords: 'moodboard references vibe add', examples: ['/attach-board', '/attach-board palette'],
      complete: async () => { await Board.ready?.(); return [...BoardData.FOCUS.slice(0, 9).map((f) => ({ value: f.id, hint: f.name })), ...(Board.current()?.items || []).filter((i) => i.title).slice(-8).map((i) => ({ value: i.title, hint: 'reference' }))]; },
      run: async (args, ctx) => {
        const id = need(ctx);
        const q = String(args || '').trim().toLowerCase();
        const fo = q && BoardData.FOCUS.find((f) => f.id === q || f.name.toLowerCase() === q);
        if (!q || fo) { await BoardDrawer.attach(id, { focus: fo?.id }); return undefined; }
        await Board.ready?.();
        const b = await Board.boardFor(ctx.chatId);
        const it = (b?.items || []).find((i) => String(i.title || '').toLowerCase().includes(q));
        if (!it) return `No reference named like “${args}” on “${b?.name}”.`;
        await BoardDrawer.attach(id, { boardId: b.id, itemIds: [it.id] });
        return undefined;
      } });
    reg({ name: 'attach-capture', args: '[last | name]', desc: 'Attach a capture (a video as its contact sheet); no name: pick from the newest',
      keywords: 'screenshot recording shot add', examples: ['/attach-capture last'],
      complete: async () => [{ value: 'last' }, ...(await recentCaptures('all', 12)).map((c) => ({ value: base(c.path), hint: c.kind }))],
      run: async (args, ctx) => {
        const id = need(ctx);
        const list = await recentCaptures('all', 60);
        if (!list.length) return 'No captures yet: /shot or /record makes one.';
        const q = String(args || '').trim().toLowerCase();
        if (!q) { const r = ctx.input?.getBoundingClientRect?.() || { left: 200, top: 300 }; showMenu(r.left, r.top - 8, list.slice(0, 12).map((c) => ({ label: `${c.kind === 'video' ? '🎬' : '📷'} ${base(c.path)}`, hint: ago(c.mtime), action: tryRun(() => attachPath(id, c.path)) }))); return undefined; }
        const c = q === 'last' ? list[0] : list.find((x) => base(x.path).toLowerCase().includes(q));
        if (!c) return `No capture named like “${args}”.`;
        await attachPath(id, c.path);
        return undefined;
      } });
    reg({ name: 'attach-frame', args: '', desc: 'Attach the Lab\'s frame on screen as a picture', keywords: 'lab preview picture still add',
      run: async (args, ctx) => { await labFrame(need(ctx)); } });
    reg({ name: 'attach-scene', args: '[scene name]', desc: 'Attach a Lab scene as a short text (its name and layers, not its code)', keywords: 'lab sketch add',
      complete: () => (ThreeLab.scenes?.all() || []).slice(-12).map((s) => ({ value: s.name })),
      run: async (args, ctx) => {
        const id = need(ctx);
        const q = String(args || '').trim().toLowerCase();
        const sk = q ? (ThreeLab.scenes?.all() || []).find((s) => s.name.toLowerCase().includes(q)) : null;
        if (q && !sk) return `No scene named like “${args}”.`;
        await labScene(id, sk?.id || null);
        return undefined;
      } });
    reg({ name: 'attach-region', args: '[window | tool]', desc: 'Pick a region of the screen (or the window / this tool) and attach the picture', keywords: 'screenshot snip area add',
      complete: () => ['region', 'tool', 'window'].map((value) => ({ value })),
      run: async (args, ctx) => { const id = need(ctx); const w = String(args || 'region').trim().toLowerCase(); await screen(id, ['window', 'tool'].includes(w) ? w : 'region'); } });
    reg({ name: 'attach-render', args: '[last | name]', desc: 'Attach a recent render (its contact sheet); no name: pick from the newest',
      keywords: 'video export output add', examples: ['/attach-render last'],
      complete: async () => [{ value: 'last' }, ...(await recentRenders(10)).map((x) => ({ value: base(x.path) }))],
      run: async (args, ctx) => {
        const id = need(ctx);
        const list = await recentRenders(30);
        if (!list.length) return 'No renders yet.';
        const q = String(args || '').trim().toLowerCase();
        if (!q) { const r = ctx.input?.getBoundingClientRect?.() || { left: 200, top: 300 }; showMenu(r.left, r.top - 8, list.slice(0, 10).map((x) => ({ label: `🎬 ${base(x.path)}`, hint: x.mtime ? ago(x.mtime) : '', action: tryRun(() => attachPath(id, x.path)) }))); return undefined; }
        const x = q === 'last' ? list[0] : list.find((y) => base(y.path).toLowerCase().includes(q));
        if (!x) return `No render named like “${args}”.`;
        await attachPath(id, x.path);
        return undefined;
      } });
    reg({ name: 'attach-menu', args: '', desc: 'The ＋ menu of the chat box: files, board, captures, Lab, screen, renders', keywords: 'plus add attach sources',
      run: (args, ctx) => { const v = Native.view(need(ctx)); menu(ctx.agentId, v.form.querySelector('.attach-btn') || v.input); } });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();
  try {
    Keys.add(
      { area: 'Chat', keys: 'Alt+A', what: 'the ＋ menu of the chat box (attach from anywhere)', sel: '.composer .attach-btn' },
      { area: 'Chat', keys: '＋ in the chat box', what: 'attach: files, the board, captures, the Lab frame / scene, a screen region, recent renders' },
      { area: 'Chat', keys: 'Shift+click ＋', what: 'the file picker straight away' },
      { area: 'Chat', keys: 'Drop a video from Video Review / a capture', what: 'attaches its contact sheet (engines read pictures)' },
      { area: 'Chat', keys: 'Paste a picture / video path', what: 'attaches the file (toast: paste as text instead)' },
    );
  } catch { /* keys.js not loaded */ }

  return { menu, attachThing, labFrame, labScene, screen, recentRenders, recentCaptures, sceneText };
})();
