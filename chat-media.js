// Pictures and videos a reply made, shown in the reply at full width (no download, no hunting for the file):
// - files a chat wrote while it answered (Hearth's workspace, the chat's own folder, Codex's generated images) and
//   names it gives without a full path ("out/poster.png", "sandbox:/mnt/data/clip.mp4") are found on disk
//   (chatmediamain.js) and join the reply's things (chat-things.js), saved with the message;
// - a reply's first pictures / videos are drawn big under its text: a picture fits the chat's width, a video plays
//   with its own controls; click (or ⤢) opens the full-size viewer (zoom, frame by frame, CaptureView).
// Nothing here reaches the engines (things are never part of a prompt).
const ChatMedia = (() => {
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const NAME = /(?:sandbox:|file:\/\/)?\/?(?:[\w.@~-]+[\\/])*[\w.@~-]+\.(?:png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|mkv)\b/gi;
  const HERO = 2; // big pictures / videos per reply (the rest stay small cards)
  const started = new Map(); // chat id -> when its reply started
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const fileUrl = (p) => (typeof Capture !== 'undefined' && Capture.fileUrl ? Capture.fileUrl(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const on = () => store.get('chat.media', true);

  // names in a reply that aren't full paths (full paths are chat-things.js's)
  function namesIn(text) {
    const out = [];
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ');
    for (const m of t.matchAll(NAME)) {
      const n = m[0];
      if (/^(?:[A-Za-z]:[\\/]|\/(?!mnt\/data))/.test(n) || /^https?:/i.test(n)) continue;
      if (/^www\.|\.(?:com|org|net|io)\//i.test(n)) continue;
      if (!out.includes(n)) out.push(n);
    }
    return out.slice(0, 8);
  }

  async function collect(chat, text, since, things) {
    const agent = H.agent?.(chat.agentId);
    const r = await window.hub.chatMedia?.find({ since, dirs: [agent?.workspace].filter(Boolean), names: namesIn(text) });
    if (!r) return 0;
    const have = new Set(things.map((t) => t.path).filter(Boolean));
    let added = 0;
    const add = (p, src) => {
      if (!p || have.has(p) || things.length >= 10) return;
      have.add(p); added += 1;
      things.push({ k: VIDEO.test(p) ? 'video' : 'image', path: p, name: base(p), src });
    };
    for (const p of Object.values(r.resolved || {})) add(p, 'reply');
    for (const f of (r.recent || []).slice(0, 6)) if (f.size > 0) add(f.path, 'made');
    return added;
  }

  Native.hooks.send.push((agentId, chat) => { started.set(chat.id, Date.now()); });
  Native.hooks.finish.push((event, chat, extras) => {
    const since = started.get(chat.id) || 0;
    started.delete(chat.id);
    if (!on() || event.type !== 'done') return;
    const mine = !extras.things;
    const things = extras.things || (extras.things = []); // the same array lands on the saved message
    collect(chat, event.text, since, things).then((n) => {
      if (!n) { if (mine && !things.length) { const msg = chat.messages.find((x) => x.things === things); if (msg) delete msg.things; } return; }
      Native.save(chat);
      if (H.activeId === chat.agentId) Native.refresh(chat.agentId, { keepScroll: true });
    }).catch((err) => console.warn('chat media', err));
  });

  // ---------- big under the reply ----------
  function open(p) { if (typeof CaptureView !== 'undefined') CaptureView.open(p).catch(() => window.hub.fs.open(p)); else window.hub.fs.open(p); }
  async function saveCopy(p) {
    const home = await window.hub.fs.home();
    const sep = /\\/.test(p) ? '\\' : '/';
    const to = `${home}${sep}Downloads${sep}${base(p)}`;
    try { await window.hub.fs.copy(p, to); toast(`Saved to Downloads: ${base(p)}`, { timeout: 2600, action: { label: 'Show', fn: () => window.hub.fs.reveal(to) } }); } catch (err) { toast(err.message, { type: 'error' }); }
  }
  // the reply cards' own menu: send to the board / editor / Lab / another chat, picture tools, copy the path…
  function more(t, r) { if (typeof ChatThings !== 'undefined' && ChatThings.menu) ChatThings.menu(t, { agentId: H.activeId, chatId: H.activeChat?.[H.activeId] }, r); else window.hub.fs.reveal(t.path); }
  function heroEl(t) {
    const p = t.path;
    const vid = t.k === 'video';
    const media = vid
      ? el('video', { src: fileUrl(p), controls: true, preload: 'metadata', playsInline: true, loop: true, class: 'cm-media' })
      : el('img', { src: fileUrl(p), alt: t.name || '', loading: 'lazy', class: 'cm-media', title: 'Click: full size', on: { click: () => open(p) } });
    const fig = el('figure', { class: `cm-hero${vid ? ' vid' : ''}`, dataset: { key: `${t.k}:${p}` } }, media,
      el('figcaption', {},
        el('span', { class: 'cm-name', text: t.name || base(p), title: p }),
        el('button', { type: 'button', class: 'ghost small', text: '⤢', title: 'Full size (zoom, frame by frame)', on: { click: () => open(p) } }),
        el('button', { type: 'button', class: 'ghost small', text: '⬇', title: 'Save a copy to Downloads', on: { click: () => saveCopy(p) } }),
        el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More: show in folder, copy the path, send to the board / editor…', on: { click: (e) => more(t, e.currentTarget.getBoundingClientRect()) } })));
    media.addEventListener('error', () => fig.classList.add('cm-missing'));
    fig.addEventListener('contextmenu', (e) => { e.preventDefault(); more(t, { left: e.clientX, bottom: e.clientY }); });
    return fig;
  }
  Native.hooks.message.push((node, m) => {
    if (!on() || m.role !== 'assistant' || !m.things?.length) return;
    const big = m.things.filter((t) => !t.gone && !t.pending && t.path && (t.k === 'image' || t.k === 'frame' || t.k === 'video')).slice(0, HERO);
    if (!big.length) return;
    const box = el('div', { class: `cm-heroes n${big.length}` }, big.map(heroEl));
    const strip = node.querySelector(':scope > .thing-strip');
    for (const t of big) strip?.querySelector(`.thing[data-key="${CSS.escape(`${t.k}:${t.path}`)}"]`)?.remove();
    if (strip && !strip.querySelector('.thing')) strip.remove();
    const foot = node.querySelector(':scope > .msg-foot');
    const body = node.querySelector(':scope > .body');
    if (body) body.after(box); else if (strip?.isConnected) strip.before(box); else if (foot) foot.before(box); else node.append(box);
  });

  if (typeof Commands !== 'undefined' && !Commands.get('media')) {
    Commands.register({
      name: 'media', area: 'Messages', args: '[on | off]',
      desc: 'Pictures and videos a reply made show big in the chat (on) or as small cards (off)',
      complete: () => ['on', 'off'].map((value) => ({ value })),
      examples: ['/media', '/media off'],
      run: (args, ctx) => {
        const a = String(args || '').trim().toLowerCase();
        if (a === 'on' || a === 'off') { store.set('chat.media', a === 'on'); Native.refresh(ctx.agentId, { keepScroll: true }); }
        return `Pictures and videos from replies: ${on() ? '**big in the chat** (click for full size; files a chat makes are found for you)' : '**small cards**'}. \`/media ${on() ? 'off' : 'on'}\` to switch.`;
      },
    });
  }
  return { namesIn, collect };
})();
