// Projects in chats (round 9, chatcore): a chat remembers the board, Lab scene, sequence, video project, captures and
// renders it worked with, and shows them as one quiet line over the chat box (only while you point at or type in the
// box; hold Alt for the details). A chip is one click from attaching, opening or rendering it again.
// When your own words point at one of them ("use the board", "render it again", "the last capture", "this scene"),
// the message carries one short line naming it ([Hearth context: …], ≈ 15–40 tokens), and an agent without board
// tools gets the board's vibe as /board-use would. Nothing is added otherwise (/chat-context auto off: never).
// A chat continued elsewhere (handoff to Astra or Claude, continue with, branch, fresh from a summary) inherits it.
const ChatContext = (() => {
  const KV = 'chat-context';
  let data = null; // { [chatId]: { board, scene, sequence, project, captures: [{ path, at }], renders: [{ path, at }], forget: [] } }
  let loading = null;
  const load = () => (data ? Promise.resolve(data) : (loading ||= window.hub.kvGet(KV, {}).then((d) => { data = d && typeof d === 'object' ? d : {}; return data; }).catch(() => { data = {}; return data; })));
  const saveSoon = debounce(() => { if (data) window.hub.kvSet(KV, prune(data)); }, 600);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const autoOn = () => store.get('chat.ctxAuto', true) !== false;
  const stripOn = () => store.get('chat.ctxStrip', true) !== false;
  // the 300 most recent chats keep theirs
  function prune(d) {
    const ids = Object.keys(d);
    if (ids.length <= 300) return d;
    ids.sort((a, b) => (d[b].at || 0) - (d[a].at || 0));
    for (const id of ids.slice(300)) delete d[id];
    return d;
  }
  const entry = (chatId) => (data[chatId] ||= { captures: [], renders: [], at: Date.now() });

  // ---------- what a chat worked with ----------
  function note(chatId, t) {
    if (!data || !chatId || !t) return;
    const e = entry(chatId);
    e.at = Date.now();
    e.forget = (e.forget || []).filter((k) => k !== t.k);
    if (t.k === 'board') e.board = { id: null, name: t.board };
    else if (t.k === 'scene') e.scene = { id: t.id, name: t.name };
    else if (t.k === 'sequence') e.sequence = { id: t.id, name: t.name };
    else if (t.k === 'project') e.project = { id: t.id, name: t.name };
    else if (t.path) {
      const list = VIDEO.test(t.path) && !/capture/i.test(t.src || '') ? (e.renders ||= []) : (e.captures ||= []);
      if (!list.some((x) => x.path === t.path)) list.unshift({ path: t.path, at: Date.now() });
      list.length = Math.min(list.length, 8);
    }
    saveSoon();
  }
  // everything known for a chat: its own record, then what is linked to it (the board, its scene, its project), then
  // the chat it was continued from
  function gather(chatId, chat = null) {
    if (!data || !chatId) return {};
    const own = data[chatId];
    const from = chat?.contextFrom || chat?.handoffFrom || null;
    const inh = !own && from ? data[from] || null : null;
    const e = { ...(inh || {}), ...(own || {}) };
    const out = { inherited: Boolean(inh && !own) };
    const forget = new Set(e.forget || []);
    try {
      const S = typeof Board !== 'undefined' ? Board._?.S : null;
      const linkedId = S?.index?.links?.[chatId] || (from && S?.index?.links?.[from]);
      const linked = linkedId && Board.boards().find((b) => b.id === linkedId);
      if (linked) out.board = { id: linked.id, name: linked.name, linked: true, count: linked.count };
      else if (e.board) { const b = Board.boards().find((x) => x.name === e.board.name); if (b) out.board = { id: b.id, name: b.name, count: b.count }; }
    } catch { /* the board isn't loaded */ }
    try {
      const sid = (typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chatId)) || e.scene?.id;
      const sk = sid && ThreeLab.scenes?.get(sid);
      if (sk) out.scene = { id: sk.id, name: sk.name, own: Boolean(ChatScenes?.linkOf?.(chatId)) };
    } catch { /* the Lab isn't loaded */ }
    if (e.sequence) out.sequence = e.sequence;
    try { const p = typeof Intro !== 'undefined' && (Intro.ofChat?.(chatId) || (from && Intro.ofChat?.(from))); if (p) out.project = { id: p.id, name: p.name }; else if (e.project) out.project = e.project; } catch { /* intro not loaded */ }
    out.captures = (e.captures || []).slice(0, 8);
    out.renders = (e.renders || []).slice(0, 6);
    for (const k of forget) { if (k === 'captures' || k === 'renders') out[k] = []; else delete out[k]; }
    return out;
  }
  const plural = (n, k) => `${n} ${n === 1 ? k.replace(/s$/, '') : k}`;
  const count = (c) => ['board', 'scene', 'sequence', 'project'].filter((k) => c[k]).length + (c.captures?.length ? 1 : 0) + (c.renders?.length ? 1 : 0);

  // ---------- the strip over the chat box ----------
  const GLYPH = { board: '▦', scene: '◭', sequence: '▤', project: '🎬', captures: '◉', renders: '⇪' };
  function chip(agentId, chatId, k, c) {
    const v = c[k];
    const n = Array.isArray(v) ? v.length : 0;
    const name = Array.isArray(v) ? `${n} ${k === 'captures' ? (n === 1 ? 'capture' : 'captures') : n === 1 ? 'render' : 'renders'}` : v.name;
    const more = k === 'board' ? `${v.linked ? 'linked' : 'used'}${v.count ? ` · ${v.count} refs` : ''}` : k === 'scene' ? (v.own ? 'this chat\'s scene' : 'Lab scene') : k === 'sequence' ? 'Lab sequence' : k === 'project' ? 'video project' : Array.isArray(v) ? base(v[0]?.path) : '';
    const b = el('button', { type: 'button', class: 'ctx-chip', dataset: { k }, title: `${name}${more ? ` · ${more}` : ''}\nClick: attach, open${k === 'sequence' || k === 'project' ? ', render again' : ''}…`,
      on: { click: (e) => { e.preventDefault(); chipMenu(agentId, chatId, k, b.getBoundingClientRect()); }, contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); chipMenu(agentId, chatId, k, { left: e.clientX, top: e.clientY }); } } },
    el('span', { class: 'ctx-g', text: GLYPH[k] }), el('span', { class: 'ctx-name', text: String(name).slice(0, 22) }), more ? el('span', { class: 'ctx-more', text: ` · ${more}` }) : null);
    return b;
  }
  async function paint(agentId) {
    const v = Native.view(agentId);
    if (!v) return;
    await load();
    const chatId = H.activeChat?.[agentId] || null;
    let strip = v.form.querySelector('.ctx-strip');
    const c = chatId ? gather(chatId, Native.current(agentId)) : {};
    const keys = stripOn() && chatId ? ['board', 'scene', 'sequence', 'project', 'captures', 'renders'].filter((k) => (Array.isArray(c[k]) ? c[k].length : c[k])) : [];
    const sig = `${chatId}|${keys.map((k) => `${k}:${Array.isArray(c[k]) ? c[k].length : c[k].name}`).join('|')}|${c.inherited}`;
    if (strip?.dataset.sig === sig) return; // nothing changed: the DOM stays
    if (!keys.length) { strip?.remove(); return; }
    const next = el('div', { class: 'ctx-strip', dataset: { sig }, title: '' },
      el('span', { class: 'ctx-lead', text: c.inherited ? '⇄' : '⌖', title: c.inherited ? 'Carried over from the chat this one continues' : 'What this chat works with (hold Alt for details · right-click for more)' }),
      ...keys.map((k) => chip(agentId, chatId, k, c)));
    next.addEventListener('contextmenu', (e) => { if (e.target.closest('.ctx-chip')) return; e.preventDefault(); e.stopPropagation(); stripMenu(agentId, chatId, { left: e.clientX, top: e.clientY }); });
    if (strip) strip.replaceWith(next); else v.form.querySelector('.composer-box')?.prepend(next);
  }
  const paintAll = debounce(() => { for (const a of H.agents().filter((x) => x.mode === 'native')) if (Native.hasView(a.id)) paint(a.id); }, 150);

  // ---------- menus ----------
  const tryRun = (fn) => () => Promise.resolve().then(fn).catch((err) => toast(err.message, { type: 'error' }));
  const run = (line, agentId) => () => Commands.exec(line, agentId);
  function forget(chatId, k) {
    const e = entry(chatId);
    e.forget = [...new Set([...(e.forget || []), k])];
    if (k === 'captures' || k === 'renders') e[k] = [];
    else delete e[k];
    saveSoon(); paintAll();
  }
  function itemsFor(agentId, chatId, k, c = gather(chatId, Native.current(agentId))) {
    const v = c[k];
    if (!v) return [];
    const forgetIt = { label: 'Forget it here', more: true, action: () => forget(chatId, k) };
    if (k === 'board') return [
      { label: 'Attach its vibe', hint: '/attach-board', action: tryRun(() => BoardDrawer.attach(agentId, { boardId: v.id })) },
      { label: 'Only…', items: () => BoardData.FOCUS.slice(1, 9).map((f) => ({ label: f.name, action: tryRun(() => BoardDrawer.attach(agentId, { boardId: v.id, focus: f.id })) })) },
      { label: 'Open the board', action: tryRun(async () => { activate('tool:board'); await Board.open(v.id); }) },
      { label: 'Drawer', key: 'Ctrl+Shift+M', action: () => BoardDrawer.toggle(true) },
      v.linked ? { label: 'Unlink from this chat', more: true, action: () => { Board.unlinkChat(chatId); paintAll(); } } : { label: 'Link to this chat', more: true, action: () => { Board.linkChat(chatId, v.id); paintAll(); } },
      v.linked ? null : forgetIt,
    ].filter(Boolean);
    if (k === 'scene') return [
      { label: 'Attach the frame on screen', hint: 'a picture', action: tryRun(async () => { if (ThreeLab.scenes?.currentId() !== v.id) { await ThreeLab.cmd(); ThreeLab.scenes.open(v.id); await new Promise((r) => setTimeout(r, 900)); } await ChatAttach.labFrame(agentId); }) },
      { label: 'Attach the scene', hint: 'name and layers', action: tryRun(() => ChatAttach.labScene(agentId, v.id)) },
      { label: 'Open in the Lab', action: tryRun(async () => { activate('tool:three'); if (typeof ChatScenes !== 'undefined') await ChatScenes.openScene(v.id); else ThreeLab.scenes.open(v.id); }) },
      typeof ThreeSeq !== 'undefined' ? { label: 'Add to the Lab sequence', action: tryRun(async () => { await ThreeLab.cmd(); await ThreeSeq.add({ sketch: v.id }); toast('Added to the sequence', { timeout: 1400 }); }) } : null,
      v.own ? null : forgetIt,
    ].filter(Boolean);
    if (k === 'sequence') return [
      { label: '⇪ Render it again', hint: '/render-again', action: () => renderAgain(agentId, chatId) },
      { label: 'Open the sequence', action: tryRun(async () => { await ThreeLab.cmd(); await ThreeSeq.open(v.id); await ThreeSeq.enter(); }) },
      { label: 'Finish in the video editor', action: tryRun(async () => { await ThreeLab.cmd(); await ThreeSeq.open(v.id); await ThreeSeq.toEditor(); }) },
      forgetIt,
    ];
    if (k === 'project') return [
      { label: 'Show its card here', action: run(`/intro open ${v.name}`, agentId) },
      { label: '⇪ Render it again', hint: '/render-again', action: () => renderAgain(agentId, chatId) },
      { label: 'Status', action: run(`/intro status`, agentId) },
      forgetIt,
    ];
    // captures / renders: newest first
    return [
      ...v.map((x) => ({ label: `${VIDEO.test(x.path) ? '🎬' : '📷'} ${base(x.path).slice(0, 40)}`, items: () => [
        { label: 'Attach it', action: tryRun(() => Native.attachPaths(agentId, [x.path])) },
        { label: 'Open', action: tryRun(() => CaptureView.open(x.path)) },
        { label: 'Show in folder', action: () => window.hub.fs.reveal(x.path) },
      ] })),
      '-',
      { label: 'Forget these here', action: () => forget(chatId, k) },
    ];
  }
  function chipMenu(agentId, chatId, k, r) {
    showMenu(r.left, (r.bottom ?? r.top) + 4, [...itemsFor(agentId, chatId, k), ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Chat') : [])]);
  }
  function stripMenu(agentId, chatId, r) {
    const c = gather(chatId, Native.current(agentId));
    const items = ['board', 'scene', 'sequence', 'project', 'captures', 'renders'].filter((k) => (Array.isArray(c[k]) ? c[k].length : c[k]))
      .map((k) => ({ label: `${GLYPH[k]} ${Array.isArray(c[k]) ? plural(c[k].length, k) : c[k].name}`, items: () => itemsFor(agentId, chatId, k, c) }));
    showMenu(r.left, r.top + 4, [...items, '-',
      { label: autoOn() ? '✓ Your words point at them' : 'Your words point at them', hint: '/chat-context auto', action: () => { store.set('chat.ctxAuto', !autoOn()); toast(autoOn() ? '“use the board”, “render it again”… name the chat’s things again' : 'Messages go exactly as typed', { timeout: 2200 }); } },
      { label: 'Hide this line', action: () => { store.set('chat.ctxStrip', false); paintAll(); toast('Hidden (/chat-context strip on brings it back)', { timeout: 2200 }); } },
      ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Chat') : [])]);
  }
  // the ＋ menu's entries (chat-attach.js): what this chat works with, one level deep
  function attachItems(agentId) {
    const chatId = H.activeChat?.[agentId];
    if (!data || !chatId) return [];
    const c = gather(chatId, Native.current(agentId));
    const keys = ['board', 'scene', 'sequence', 'project', 'captures', 'renders'].filter((k) => (Array.isArray(c[k]) ? c[k].length : c[k]));
    return keys.length ? ['-', 'This chat works with', ...keys.map((k) => ({ label: `${GLYPH[k]} ${Array.isArray(c[k]) ? plural(c[k].length, k) : String(c[k].name).slice(0, 30)}`, items: () => itemsFor(agentId, chatId, k, c) }))] : [];
  }

  // ---------- render it again ----------
  async function renderAgain(agentId, chatId) {
    const c = gather(chatId, Native.current(agentId));
    try {
      if (c.sequence && typeof ThreeSeq !== 'undefined') {
        await ThreeLab.cmd();
        await ThreeSeq.open(c.sequence.id);
        toast(`Rendering “${c.sequence.name}”…`, { timeout: 2500 });
        const r = await ThreeSeq.render({});
        if (r?.path) { note(chatId, { k: 'video', path: r.path, src: 'render' }); toast(`Rendered ${base(r.path)}`, { action: { label: 'Open', fn: () => CaptureView.open(r.path) } }); }
        return r;
      }
      if (c.project) return Commands.exec(`/intro render`, agentId);
      toast('This chat has no sequence or video project yet', { timeout: 2000 });
    } catch (err) { toast(err.message, { type: 'error' }); }
    return null;
  }

  // ---------- your words → one short line ----------
  const POINTS = {
    board: /\b(?:the|my|this|that|our|linked)\s+(?:mood\s?board|board|refs|references)\b|\buse the vibe\b/i,
    again: /\b(?:render|export|make)\b[^.?!\n]{0,24}\bagain\b|\b(?:re-?render|re-?export)\b/i,
    sequence: /\b(?:the|this|that|my)\s+(?:sequence|montage|timeline|edit)\b/i,
    project: /\b(?:the|this|that|my)\s+(?:video project|project|intro video|intro)\b/i,
    capture: /\b(?:the|this|that|my|last|latest)\s+(?:capture|recording|screenshot|shot|take|render)\b/i,
    scene: /\b(?:the|this|that|my)\s+(?:scene|sketch|visual)\b/i,
  };
  async function compose(agentId, chat, raw, msg) {
    if (!autoOn() || !msg || msg.role !== 'user') return undefined;
    const words = String(msg.text || '');
    if (words.startsWith('/') || !Object.values(POINTS).some((re) => re.test(words))) return undefined;
    await load();
    if (typeof Board !== 'undefined') await Board.ready?.().catch(() => {});
    const c = gather(chat.id, chat);
    const agent = H.agent(agentId);
    const parts = []; let extra = '';
    if (POINTS.board.test(words) && c.board) {
      parts.push(`board "${c.board.name}"${c.board.linked ? ' (linked to this chat)' : ''}`);
      // no board tools: the vibe goes along (what /board-use attaches), unless one is attached already
      if (!agent?.boardTools && !/<file name="vibe/.test(raw) && typeof BoardDrawer !== 'undefined') {
        const b = await Board.load(c.board.id).catch(() => null);
        const vibe = b ? BoardDrawer.vibeText({ board: b }) : '';
        if (vibe) extra += `\n\n<file name="vibe · ${c.board.name}.txt">\n${vibe}\n</file>`;
      }
    }
    if ((POINTS.again.test(words) || POINTS.sequence.test(words)) && c.sequence) parts.push(`Lab sequence "${c.sequence.name}"`);
    if ((POINTS.again.test(words) || POINTS.project.test(words)) && c.project) parts.push(`video project "${c.project.name}"`);
    if (POINTS.scene.test(words) && c.scene) parts.push(`Lab scene "${c.scene.name}"`);
    if ((POINTS.capture.test(words) || POINTS.again.test(words)) && (c.renders?.[0] || c.captures?.[0])) {
      const last = [...(c.renders || []), ...(c.captures || [])].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      parts.push(`last ${VIDEO.test(last.path) ? 'video' : 'picture'} ${last.path}`);
    }
    if (!parts.length && !extra) return undefined;
    const line = parts.length ? `[Hearth context: ${parts.join('; ')}]` : '';
    msg.ctxLine = [line, extra ? 'the board\'s vibe (as /board-use)' : ''].filter(Boolean).join(' + ');
    return `${raw}${line ? `\n\n${line}` : ''}${extra}`;
  }

  // ---------- hooks ----------
  Native.hooks.compose.push(compose);
  Native.hooks.render.push((agentId) => { paint(agentId); });
  // a quiet mark on your message when it carried a context line (hover shows exactly what went along)
  Native.hooks.message.push((node, m) => {
    if (m.role !== 'user' || !m.ctxLine) return;
    node.querySelector('.msg-foot')?.prepend(el('span', { class: 'ctx-sent', text: '⌖', title: `Sent along with your words:\n${m.ctxLine}\n(/chat-context auto off: never)` }));
  });
  document.addEventListener('hearth:chat-thing', (e) => { load().then(() => { note(e.detail.chatId, e.detail.thing); paintAll(); }); });
  addEventListener('hearth:sketch', paintAll);
  addEventListener('hearth:view', paintAll);
  addEventListener('DOMContentLoaded', () => {
    load().then(paintAll);
    try { Board.onChange((what) => { if (what === 'links' || what === 'boards') paintAll(); }); } catch { /* no board */ }
    try { Intro.onChange(() => paintAll()); } catch { /* no projects */ }
    register();
  });

  function register() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register({ area: 'Chat', ...def }); else console.warn(`chat-context: /${def.name} exists`); };
    reg({
      name: 'chat-context', args: '[show | auto on|off | strip on|off | forget <what> | clear]', aliases: ['works-with'],
      desc: 'What this chat works with (board, scene, sequence, video project, captures, renders) and how your words use it',
      complete: () => ['show', 'auto on', 'auto off', 'strip on', 'strip off', 'forget board', 'forget scene', 'forget sequence', 'forget project', 'forget captures', 'forget renders', 'clear'].map((value) => ({ value })),
      examples: ['/chat-context', '/chat-context auto off'],
      run: async (args, ctx) => {
        await load();
        const [w, x] = String(args || 'show').trim().toLowerCase().split(/\s+/);
        if (w === 'auto') { store.set('chat.ctxAuto', x !== 'off'); return x === 'off' ? 'Messages go exactly as typed (no context line).' : '“use the board”, “render it again”, “the last capture”… add one short line naming them.'; }
        if (w === 'strip') { store.set('chat.ctxStrip', x !== 'off'); paintAll(); return x === 'off' ? 'The line over the chat box is hidden.' : 'The line over the chat box shows again (point at the chat box).'; }
        if (!ctx.chatId) return 'Open a chat first.';
        if (w === 'forget') { forget(ctx.chatId, { captures: 'captures', renders: 'renders', board: 'board', scene: 'scene', sequence: 'sequence', project: 'project' }[x] || x); return `Forgot the ${x} here.`; }
        if (w === 'clear') { delete data[ctx.chatId]; data[ctx.chatId] = { captures: [], renders: [], forget: ['board', 'scene', 'sequence', 'project'], at: Date.now() }; saveSoon(); paintAll(); return 'This chat starts clean (linked board and scene stay linked; /chat-context forget … for one).'; }
        const c = gather(ctx.chatId, ctx.chat);
        const lines = [
          c.board ? `- ▦ board **${c.board.name}**${c.board.linked ? ' (linked)' : ''}` : null,
          c.scene ? `- ◭ scene **${c.scene.name}**${c.scene.own ? ' (this chat\'s)' : ''}` : null,
          c.sequence ? `- ▤ Lab sequence **${c.sequence.name}**` : null,
          c.project ? `- 🎬 video project **${c.project.name}**` : null,
          c.captures?.length ? `- ◉ ${c.captures.length} capture(s), newest ${base(c.captures[0].path)}` : null,
          c.renders?.length ? `- ⇪ ${c.renders.length} render(s), newest ${base(c.renders[0].path)}` : null,
        ].filter(Boolean);
        return lines.length ? `**This chat works with**${c.inherited ? ' (carried over)' : ''}:\n${lines.join('\n')}\n\nYour words use them: “use the board”, “render it again”, “the last capture”, “this scene” add one short line naming them${autoOn() ? '' : ' (off now: `/chat-context auto on`)'}. Nothing is sent otherwise.` : 'Nothing yet: boards, scenes, sequences, projects, captures and renders this chat uses show here.';
      },
    });
    reg({
      name: 'render-again', args: '', aliases: ['rerender'], area: 'Video project',
      desc: 'Render this chat\'s Lab sequence (or its video project) again, locally',
      keywords: 'render it again export again',
      run: async (args, ctx) => { if (!ctx.chatId) return 'Open a chat first.'; await load(); await renderAgain(ctx.agentId, ctx.chatId); return undefined; },
    });
  }
  try {
    Keys.add(
      { area: 'Chat', keys: 'Alt over the chat box', what: 'the context line\'s details (board, scene, sequence, project, captures)' },
      { area: 'Chat', keys: 'Click a context chip', what: 'attach it, open it, render it again' },
    );
  } catch { /* keys.js not loaded */ }

  return { load, gather, note, paint, paintAll, itemsFor, attachItems, renderAgain, compose, POINTS, forget, get data() { return data; } };
})();
