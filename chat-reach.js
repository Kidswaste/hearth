// Reach (round 19): what a chat makes can always be opened, on whichever computer you are.
// - Paths from the other computer: a Mac path said or stored on Windows (and the reverse) resolves to this computer's
//   own data folder (reachmain.js: sync's path forms, then ".../Hearth/data/..."), in a reply's pictures and videos,
//   its pages, the paths it names, and what chat_open is asked. A file still on its way says so ("on its way from
//   MacBook") and shows as soon as sync brings it (hearth:synced).
// - Pages and files a reply makes (an index.html, a PDF, an SVG) show as a card: ▶ Open (your browser / app),
//   Preview (a sandboxed Hearth window: local files only, no Node) and Reveal; right-click for the rest.
// - Paths in a reply (`/Users/…/index.html`, `C:\…`) are clickable: open, preview, reveal, copy.
// - chat_open (both engines, mcp/chat-mcp.js): the chat opens a file / page / folder / URL for you. Files inside the
//   chat's folders or Hearth's data open at once; a web page or a file elsewhere asks once (Access.ask, low risk).
// Nothing here reaches the engines' prompts (the tool's one-line description is all they see).
const Reach = (() => {
  const PAGE = /\.(html?|svg|pdf)$/i;
  const MEDIA = /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|mkv)$/i;
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const PREVIEW = /\.(html?|svg|pdf|png|jpe?g|webp|gif|txt|md|json)$/i;
  // absolute paths (either computer's form, or file:// URLs) of pages and media, and pages named relative to the folder
  const ABS = /(?<=^|[\s(:"'`=[*])(?:file:\/\/\/?|[A-Za-z]:[\\/]|\/(?!\/))[^\n"'<>|*?`]*?\.(?:html?|svg|pdf|png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|mkv)(?=$|[\s,;:)"'`\]*])/gim;
  const REL = /(?<=^|[\s("'`*])(?:\.\/)?(?:[\w.@~-]+\/)*[\w.@~-]+\.(?:html?|pdf)(?=$|[\s,;:)"'`\]*])/gim;
  const MAX = 4; // cards per reply
  const live = new Map(); // chat id -> [opens] while a reply runs
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const api = () => window.hub?.reach;
  let infoP = null;
  const info = () => (infoP ||= (api()?.info?.() || Promise.resolve(null)).catch(() => null));

  function pathsIn(text) {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ');
    const abs = [...new Set([...t.matchAll(ABS)].map((m) => m[0].trim()))].filter((p) => !/^\/\//.test(p)).slice(0, 10);
    const rel = [...new Set([...t.matchAll(REL)].map((m) => m[0]))].filter((p) => !/^(https?|www)/i.test(p) && !abs.some((a) => a.endsWith(p))).slice(0, 4);
    return { abs, rel };
  }
  // where a relative name may be: the agent's project folder and the chat's own folders (+ Hearth's workspace, main side)
  function roots(chat) {
    const agent = chat ? H.agent?.(chat.agentId) : null;
    const acc = typeof Access !== 'undefined' && chat ? Access.effective(chat) : null;
    return [agent?.workspace, ...(acc?.folders || [])].filter(Boolean);
  }
  async function resolve(list, chat) {
    if (!api() || !list.length) return [];
    try { return await api().resolve(list, { roots: roots(chat) }); } catch { return []; }
  }

  // ---------- a reply's pages, and its pictures named with the other computer's path ----------
  Native.hooks.send.push((agentId, chat) => { live.set(chat.id, []); });
  Native.hooks.finish.push((event, chat, extras) => {
    const opens = (live.get(chat.id) || []).slice();
    live.delete(chat.id);
    extras.opens = opens; // the same array lands on the saved message
    const { abs, rel } = event.type === 'done' ? pathsIn(event.text) : { abs: [], rel: [] };
    if (!abs.length && !rel.length) { if (!opens.length) delete extras.opens; return; }
    resolve([...abs, ...rel], chat).then((list) => {
      const msg = chat.messages.findLast((x) => x.opens === opens); // (round 86: from the end, where this reply is)
      if (!msg) return;
      let changed = false;
      for (const r of list) {
        if (!r.path) continue;
        if (MEDIA.test(r.input)) {
          if (!r.foreign || (!r.exists && !r.waiting)) continue; // this computer's own pictures are chat-things' / chat-media's
          const t = (msg.things || []).find((x) => x.path === r.input || (x.path && base(x.path) === base(r.input) && x.check));
          const fixed = { path: r.path, ...(r.exists ? {} : { waiting: r.waiting.from }) };
          if (t) Object.assign(t, fixed); else if ((msg.things ||= []).length < 10) msg.things.push({ k: VIDEO.test(r.path) ? 'video' : 'image', name: base(r.path), src: 'reply', ...fixed });
          changed = true;
          continue;
        }
        if (!PAGE.test(r.input) || opens.length >= MAX || opens.some((o) => o.path === r.path)) continue;
        if (!r.exists && !r.waiting && !(r.foreign && r.syncOff)) continue;
        opens.push({ path: r.path, name: base(r.path), ...(r.exists ? {} : r.waiting ? { waiting: r.waiting.from } : { elsewhere: true }) });
        changed = true;
      }
      if (!opens.length) delete msg.opens;
      if (!changed) return;
      Native.save(chat);
      if (H.activeChat?.[chat.agentId] === chat.id) Native.refresh(chat.agentId, { keepScroll: true });
    }).catch((err) => console.warn('reach', err));
  });

  // ---------- opening ----------
  async function openIt(o, how = 'default') {
    if (o.url) { window.hub.openExternal(o.url); return true; }
    const r = await api().open({ path: o.path, how });
    if (!r.ok) { toast(r.waiting ? `${base(o.path)} is still on its way from ${r.waiting.from}: it shows here when it arrives.` : r.error || `Can't open ${base(o.path)}`, { ...(r.waiting ? {} : { type: 'error' }), timeout: 4000 }); return false; }
    return true;
  }
  function itemsFor(o) {
    const p = o.path;
    const page = /\.html?$/i.test(p || '');
    return [
      { label: '▶ Open', key: 'Enter', action: () => openIt(o, 'default') },
      page ? { label: 'Open in your browser', action: () => openIt(o, 'browser') } : null,
      p && PREVIEW.test(p) ? { label: 'Preview in Hearth', action: () => openIt(o, 'preview') } : null,
      p ? { label: MediaFile.revealLabel, action: () => openIt(o, 'reveal') } : null,
      { label: o.url ? 'Copy link' : MediaFile.copyLabel, action: () => copyText(o.url || p, o.url ? 'Link copied' : 'Path copied') },
    ].filter(Boolean);
  }
  function cardEl(o, ctx = {}) {
    const waiting = Boolean(o.waiting || o.elsewhere);
    const icon = o.url ? '🌐' : /\.html?$/i.test(o.path) ? '🌐' : /\.pdf$/i.test(o.path) ? '📄' : /\.svg$/i.test(o.path) ? '◇' : '📁';
    const sub = o.waiting ? `On its way from ${o.waiting} (sync): it opens here as soon as it arrives`
      : o.elsewhere ? 'Made on your other computer: sync brings it here'
        : o.url ? o.url.replace(/^https?:\/\//, '').slice(0, 80) : (o.path || '').replace(/[\\/][^\\/]*$/, '').split(/[\\/]/).slice(-2).join('/');
    const btn = (text, title, how, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, disabled: waiting, on: { click: (e) => { e.stopPropagation(); openIt(o, how); } } });
    const card = el('div', { class: `reach-card${waiting ? ' waiting' : ''}`, tabindex: 0, dataset: { path: o.path || o.url || '' }, title: `${o.path || o.url}\nClick: open · right-click: more` },
      el('span', { class: 'reach-ico', text: icon }),
      el('div', { class: 'reach-main' }, el('b', { text: o.name || base(o.path) || o.url }), el('span', { class: 'hint', text: sub })),
      el('div', { class: 'reach-acts' },
        o.elsewhere && typeof Sync !== 'undefined' && !Sync.status?.().on ? el('button', { type: 'button', class: 'ghost small', text: 'Turn on sync', on: { click: (e) => { e.stopPropagation(); Sync.setup(); } } }) : null,
        btn('▶ Open', /\.html?$/i.test(o.path || '') ? 'Open in your browser' : 'Open with its app', 'default', 'primary small'),
        o.path && PREVIEW.test(o.path) ? btn('Preview', 'A Hearth window (sandboxed, local files only)', 'preview') : null,
        o.path ? btn('⌕', MediaFile.revealLabel, 'reveal') : null));
    card._reach = { o, ctx };
    card.addEventListener('click', () => { if (!waiting) openIt(o, 'default'); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !waiting) { e.preventDefault(); openIt(o, 'default'); } });
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, itemsFor(o)); });
    return card;
  }
  // paths in a reply's text are clickable (inline code that is a path, on either computer)
  const PATHLIKE = /^(?:file:\/\/|[A-Za-z]:[\\/]|\/(?:Users|home|Volumes|mnt|tmp|private|opt|var|srv)\/|~\/)[^\n]{1,400}$/;
  function linkPaths(node, agentId) {
    for (const c of node.querySelectorAll(':scope > .body code')) {
      if (c.closest('pre') || c.classList.contains('reach-path') || !PATHLIKE.test(c.textContent.trim())) continue;
      c.classList.add('reach-path');
      c.title = 'Click: open, preview or reveal (paths from your other computer work too)';
      c.addEventListener('click', (e) => { e.stopPropagation(); pathMenu(c.textContent.trim(), e.clientX, e.clientY, agentId); });
    }
  }
  async function pathMenu(p, x, y, agentId) {
    const chat = Native.chatOf?.(agentId);
    const [r] = await resolve([p.replace(/^~(?=[\\/])/, '')], chat);
    if (!r?.path) { showMenu(x, y, [`Not a path on this computer: ${base(p)}`, { label: MediaFile.copyLabel, action: () => copyText(p, 'Path copied') }]); return; }
    if (!r.exists) {
      showMenu(x, y, [r.waiting ? `On its way from ${r.waiting.from}: it isn't here yet` : r.syncOff && r.foreign ? 'Made on your other computer (sync is off)' : 'Not on this computer',
        r.syncOff && typeof Sync !== 'undefined' ? { label: 'Turn on sync…', action: () => Sync.setup() } : null,
        { label: 'Copy the path here', action: () => copyText(r.path, 'Path copied') }].filter(Boolean));
      return;
    }
    const o = { path: r.path, name: base(r.path) };
    showMenu(x, y, [r.foreign ? `This computer's copy: ${base(r.path)}` : null, ...itemsFor(o)].filter(Boolean));
  }
  Native.hooks.message.push((node, m, index, agent) => {
    if (m.role !== 'assistant') return;
    linkPaths(node, agent?.id);
    if (!m.opens?.length || node.querySelector(':scope > .reach-cards')) return;
    const box = el('div', { class: 'reach-cards' }, m.opens.slice(0, MAX).map((o) => cardEl(o, { agentId: agent?.id, chatId: H.activeChat?.[agent?.id] })));
    const after = node.querySelector(':scope > .cm-heroes') || node.querySelector(':scope > .body');
    if (after) after.after(box); else node.append(box);
  });

  // ---------- arrivals: a waiting card (or picture) opens up when sync brings its file ----------
  async function arrivals() {
    const cards = [...document.querySelectorAll('.reach-card.waiting')];
    const waitingThings = [];
    for (const a of H.agents?.() || []) {
      const chat = Native.chatOf?.(a.id);
      // (round 86, chatwindow86) a windowed giant chat: its loaded messages (the ones that can be on screen; a resting
      // block's waiting card is drawn, and looks for its file, when the block wakes)
      const ms = chat && Native.isWin?.(chat) ? Native._rest.W.x.keys(chat).map((k) => chat.messages[k]) : chat?.messages || [];
      for (const msg of ms) for (const t of msg?.things || []) if (t.waiting) waitingThings.push({ t, chat });
    }
    if (!cards.length && !waitingThings.length) return;
    const list = [...new Set([...cards.map((c) => c._reach?.o?.path), ...waitingThings.map((w) => w.t.path)].filter(Boolean))];
    const res = await resolve(list, null);
    const here = new Set(res.filter((r) => r.exists).map((r) => r.input));
    if (!here.size) return;
    const touched = new Set();
    for (const c of cards) {
      const { o, ctx } = c._reach || {};
      if (!o || !here.has(o.path)) continue;
      const from = o.waiting; delete o.waiting; delete o.elsewhere;
      c.replaceWith(cardEl(o, ctx));
      const chat = ctx.agentId ? Native.chatOf?.(ctx.agentId) : null;
      if (chat) touched.add(chat);
      toast(`${o.name} arrived${from ? ` from ${from}` : ''}`, { timeout: 6000, action: { label: '▶ Open', fn: () => openIt(o) } });
    }
    for (const { t, chat } of waitingThings) if (here.has(t.path)) { delete t.waiting; touched.add(chat); }
    for (const chat of touched) { Native.save(chat); if (waitingThings.some((w) => w.chat === chat)) Native.refresh(chat.agentId, { keepScroll: true }); }
  }
  addEventListener('hearth:synced', () => { arrivals().catch((err) => console.warn('reach arrivals', err)); });

  // ---------- chat_open: the chat opens something for you ----------
  const norm = (p, win) => { const f = String(p || '').replace(/\\/g, '/').replace(/\/+$/, ''); return win ? f.toLowerCase() : f; };
  function within(p, dirs, win) { const f = norm(p, win); return dirs.filter(Boolean).some((d) => { const n = norm(d, win); return f === n || f.startsWith(`${n}/`); }); }
  async function ask(agentId, chatId, target, what) {
    if (typeof Access !== 'undefined' && Access.ask) return Access.ask({ agentId, chatId, action: 'open', target, risk: 'low', what });
    return Modal.confirm('Open this?', what, { ok: 'Open' });
  }
  function addOpen(chatId, o) {
    const L = chatId && live.get(chatId);
    if (!L || L.some((x) => (x.path || x.url) === (o.path || o.url))) return;
    if (L.length >= MAX) L.shift();
    L.push(o);
    const agentId = H.chats?.find((c) => c.id === chatId)?.agentId;
    Native.liveCard?.(chatId, cardEl(o, { agentId, chatId }));
  }
  async function openTool(args = {}) {
    const agentId = args.agentId;
    const chatId = args.hubChatId || Native.pendingFor?.(agentId) || H.activeChat?.[agentId] || null;
    const chat = Native.chatOf?.(agentId);
    const how = ['default', 'browser', 'reveal', 'preview'].includes(args.how) ? args.how : 'default';
    const target = String(args.url || args.path || '').trim();
    if (!target) return { ok: false, error: 'Give path (a file, page or folder) or url.' };
    if (/^https?:\/\//i.test(target)) {
      if (!await ask(agentId, chatId, target, `Open ${target} in your browser`)) return { ok: false, error: 'The user said no (not opened).' };
      await window.hub.openExternal(target);
      addOpen(chatId, { url: target, name: target.replace(/^https?:\/\//, '').split('/')[0] });
      return { ok: true, value: `Opened ${target} in the user's browser.` };
    }
    if (/^[a-z][\w+.-]+:/i.test(target) && !/^(file|sandbox):/i.test(target)) return { ok: false, error: 'Only web pages (http / https) and files on this computer can be opened.' };
    const [r] = await resolve([target], chat);
    if (!r?.path) return { ok: false, error: `${target} isn't on this computer.` };
    const name = base(r.path);
    if (!r.exists) {
      if (r.waiting) { addOpen(chatId, { path: r.path, name, waiting: r.waiting.from }); return { ok: true, value: `${name} is still on its way from ${r.waiting.from} (sync); a card in the chat opens it as soon as it arrives. Tell the user.` }; }
      return { ok: false, error: `${r.path} isn't on this computer${r.foreign && r.syncOff ? ' (it was made on the user\'s other computer and sync is off: /sync turns it on)' : ''}.` };
    }
    const inf = await info();
    const acc = typeof Access !== 'undefined' && chat ? Access.effective(chat) : null;
    const mine = within(r.path, [inf?.dataDir, H.agent?.(agentId)?.workspace, ...(acc?.folders || [])], inf?.win);
    if (!mine && !await ask(agentId, chatId, r.path, `${how === 'reveal' ? 'Show' : 'Open'} ${r.path}`)) return { ok: false, error: 'The user said no (not opened).' };
    const o = await api().open({ path: r.path, how });
    if (!o.ok) return { ok: false, error: o.error || 'Could not open it.' };
    if (!r.isDir) addOpen(chatId, { path: r.path, name });
    try { Access?.log?.(chatId, { action: 'read', what: `Opened ${name}${how !== 'default' ? ` (${how})` : ''}`, target: r.path, result: 'done', by: 'chat' }); } catch { /* no log */ }
    const where = { preview: ' in a Hearth preview window', reveal: ` in ${MediaFile.revealLabel.replace(/^(Reveal|Show) in /, '')}`, browser: ' in the user\'s browser', default: '' }[o.how || how] || '';
    return { ok: true, value: `Opened ${r.path}${where}${r.foreign ? ' (this computer\'s copy of the path you gave)' : ''}.` };
  }

  // ---------- chat commands ----------
  function register() {
    if (typeof HubBridge !== 'undefined') HubBridge.register(['chat_open'], (tool, args) => openTool(args || {}));
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register(def); };
    reg({
      name: 'open-file', area: 'Chat', args: '<path | url> [browser | preview | reveal]', aliases: ['open-page'],
      desc: 'Open a file, page or folder (a path from your other computer works too): its app, your browser, a Hearth preview, or in the folder',
      keywords: 'open html page browser preview reveal finder explorer file path mac windows other computer',
      examples: ['/open-file ~/Desktop/index.html', '/open-file C:\\Users\\me\\page.html preview'],
      complete: (a) => (/\S\s+\S*$/.test(String(a || '')) ? ['browser', 'preview', 'reveal'].map((value) => ({ value: `${String(a).replace(/\s+\S*$/, '')} ${value}` })) : []),
      run: async (args, ctx) => {
        const m = /^(.*?)(?:\s+(browser|preview|reveal|default))?$/i.exec(String(args || '').trim());
        let target = (m?.[1] || '').replace(/^["']|["']$/g, '');
        if (!target) { const last = [...(ctx.chat?.messages || [])].reverse().find((x) => x.opens?.length); target = last?.opens[0]?.path || last?.opens[0]?.url || ''; }
        if (!target) return 'Give a path or a link (or ask the chat: it can open what it makes).';
        if (/^~[\\/]/.test(target)) { const inf = await info(); target = `${inf?.home || ''}${target.slice(1)}`; }
        const how = (m?.[2] || 'default').toLowerCase();
        if (/^https?:\/\//i.test(target)) { window.hub.openExternal(target); return null; }
        const [r] = await resolve([target], ctx.chat);
        if (!r?.exists) return r?.waiting ? `${base(r.path)} is on its way from ${r.waiting.from}: it shows in the chat when it arrives.` : `${target} isn't on this computer${r?.foreign && r?.syncOff ? ' (made on your other computer: /sync brings it here)' : ''}.`;
        await openIt({ path: r.path }, how);
        return r.foreign ? `Opened this computer's copy: \`${r.path}\`` : null;
      },
    });
    reg({
      name: 'open-tool', area: 'Astra', args: '[on | off]',
      desc: 'Astra can open pages and files for you (chat_open, one small tool). On by default',
      complete: () => ['on', 'off'].map((value) => ({ value })),
      run: (args, ctx) => {
        const agent = H.agent(ctx.agentId);
        if (!agent) return 'Open a chat first.';
        if (agent.engine !== 'codex') return `${agent.name} (Claude) always has chat_open with its chat tools${agent.chatTools === false ? ' (they are off for this agent)' : ''}.`;
        const v = String(args || '').trim().toLowerCase();
        if (v === 'on' || v === 'off') { if (v === 'off') agent.openTool = false; else delete agent.openTool; saveConfig(); }
        return `${agent.name} ${agent.openTool === false ? "can't open things for you (`/open-tool on`)" : 'can open pages, files and folders for you (`/open-tool off` drops the tool)'}.`;
      },
    });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();
  try { Keys.add({ area: 'Chat', keys: 'Click a path in a reply', what: 'open it, preview it in Hearth, or show it in its folder (paths from your other computer too)' }); } catch { /* keys.js not loaded */ }

  return { pathsIn, resolve, openIt, cardEl, openTool, info, arrivals };
})();
