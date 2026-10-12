// Apps (round 14, apps stream): the services the owner uses, each in its own window, one "Apps" entry for all of them.
// The owner: "pack in a bunch of app integrations with their own windows that could help me". No new row of buttons:
// the rail's ⋯ → Apps, Ctrl/⌘+K ("App: Figma"…), the Lab's 🧰 Tools drawer, /apps, and every app by chat command.
//
//   Apps.register({
//     id: 'figma', name: 'Figma', icon: '◈',          // required
//     url: 'https://www.figma.com/files',              // a web app: opens in its own window and session (sign in there)
//     open(opts) {}, describe() {},                    // optional for a web app (defaults: its window / its desc)
//     desc: 'Design files', group: '3D'|'Sound'|'Make'|'Design'|'Assets'|'Social'|'Deploy'|'More',
//     partition: 'adobe',                              // apps sharing one sign-in (default: the app's own)
//     routes: { audio: 'lab-song', image: 'board' },   // where its downloads go first (AppsCore.routesFor)
//     actions: [{ id, label, hint, run({ url, title }) }],  // in the window's ⋯ menu, and `/apps <id> <action id>`
//     commands: [{ name, desc, run… }],                // Commands.register defs (area 'Apps' unless given)
//     hosts: ['figma.com'], keywords: '…', fallback: true (a stand-in another stream's registration replaces)
//   })
// Other pieces: Apps.open(id, { url }), Apps.openWindow(id, { url, go }), Apps.route(path, target), Apps.menu(x, y),
// Apps.grid({ title, items }) (a picker of cards), Apps.ask({ … }) (Access.ask, else a confirm), Apps.on(type, fn).
// The window chrome and downloads live in apps-window.js / appsmain.js; file kinds and routes in apps-core.js.
const Apps = (() => {
  const C = AppsCore;
  const reg = new Map();
  const GROUPS = ['3D', 'Sound', 'Make', 'Edit', 'Design', 'Assets', 'Chat', 'Code', 'Social', 'Deploy', 'More'];
  const GROUP_ICON = { '3D': '🧊', Sound: '🎵', Make: '✨', Edit: '✂', Design: '◈', Assets: '🖼', Chat: '💬', Code: '⌨', Social: '📣', Deploy: '🚀', More: '▣' };
  const api = () => window.hub?.apps || null;
  const listeners = new Map(); // type → Set(fn)
  const downloads = new Map(); // id → d (newest last)
  const windows = new Map(); // id → 'opened' | 'shown' | 'hidden' | 'closed'
  let palReady = false;

  // ---------- the registry ----------
  function register(def) {
    if (!def || !/^[a-z0-9][\w-]*$/i.test(String(def.id || ''))) { console.warn('Apps.register: an app needs an id (letters, digits, - and _)'); return null; }
    const id = String(def.id).toLowerCase();
    const prev = reg.get(id);
    if (prev && def.fallback) return prev; // a stream's own registration wins over a stand-in
    const app = { group: 'More', icon: '▣', ...def, id, name: def.name || id };
    if (!GROUPS.includes(app.group)) app.group = 'More';
    app.web = Boolean(app.url);
    if (typeof def.open !== 'function') app.open = (o) => openWindow(id, o);
    if (typeof def.describe !== 'function') app.describe = () => `${app.name}${app.desc ? `: ${app.desc}` : ''}`;
    reg.set(id, app);
    if (Array.isArray(def.commands)) registerCommands(def.commands);
    if (palReady) paletteFor(app);
    catalogSoon();
    return app;
  }
  const get = (id) => reg.get(String(id || '').toLowerCase()) || find(id);
  function find(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return null;
    const list = [...reg.values()];
    return list.find((a) => a.id === s || a.name.toLowerCase() === s) || list.find((a) => a.name.toLowerCase().replace(/\s+/g, '').startsWith(s.replace(/\s+/g, '')))
      || list.find((a) => a.id.startsWith(s)) || list.find((a) => `${a.name} ${a.keywords || ''} ${a.desc || ''}`.toLowerCase().includes(s)) || null;
  }
  const list = () => [...reg.values()].filter((a) => !a.hidden);
  function registerCommands(defs) {
    if (typeof Commands === 'undefined') return;
    for (const c of defs) {
      if (!c?.name) continue;
      if (Commands.get(c.name) && !c.override && !c.when) { console.warn(`Apps: /${c.name} is taken, skipped`); continue; }
      Commands.register({ area: 'Apps', ...c, aliases: (c.aliases || []).filter((a) => !Commands.get(a)) });
    }
  }

  // the chrome's app switcher reads this list (names and icons only)
  let catalogTimer = 0;
  function catalogSoon() {
    clearTimeout(catalogTimer);
    catalogTimer = setTimeout(() => api()?.catalog(list().map((a) => ({ id: a.id, name: a.name, icon: a.icon, group: a.group, hint: a.desc || '' }))), 80);
  }

  // ---------- windows ----------
  function theme() {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const [k, v] of [['--aw-bg', '--bg'], ['--aw-surface', '--surface'], ['--aw-text', '--text'], ['--aw-muted', '--muted'], ['--aw-line', '--line'], ['--aw-accent', '--accent']]) { const x = cs.getPropertyValue(v).trim(); if (x) out[k] = x; }
    return out;
  }
  async function openWindow(id, { url, go = false, background = false } = {}) {
    const app = get(id);
    if (!app) throw new Error(`No app "${id}" (/apps lists them)`);
    if (!api()) throw new Error('App windows need Hearth\'s desktop app');
    const target = url || app.url;
    if (!target) throw new Error(`${app.name} has no page to open`);
    const r = await api().open({
      id: app.id, name: app.name, icon: app.icon, url: target, go: Boolean(url) || go, background, partition: app.partition || app.id, color: app.color || '',
      routes: app.routes || {}, hosts: app.hosts || [], theme: theme(),
      actions: (app.actions || []).map((a) => ({ id: a.id, label: a.label, hint: a.hint || '' })),
    });
    if (!r?.ok) throw new Error(r?.error || `${app.name} didn't open`);
    noteRecent(app.id);
    return true;
  }
  async function open(id, opts = {}) {
    const app = get(id);
    if (!app) throw new Error(`No app "${id}" (/apps lists them)`);
    noteRecent(app.id);
    window.AppsDiscover?.noteOpen(app.id); // what gets opened stops being suggested
    return app.open(opts);
  }
  const RECENT = 'apps.recent';
  const recent = () => store.get(RECENT, []).filter((id) => reg.has(id));
  function noteRecent(id) { store.set(RECENT, [id, ...store.get(RECENT, []).filter((x) => x !== id)].slice(0, 5)); }

  // ---------- the one entry: a menu of apps (recent first, then by group; long menus filter as you type) ----------
  function menuItems() {
    const row = (a) => ({ label: `${a.icon} ${a.name}`, hint: a.desc || '', feature: `App: ${a.name}`, action: () => open(a.id).catch((err) => toast(err.message, { type: 'error' })) });
    const rec = recent().map(get).filter(Boolean);
    const groups = GROUPS.map((g) => [g, list().filter((a) => a.group === g)]).filter(([, l]) => l.length);
    return [
      ...(window.AppsDiscover ? AppsDiscover.menuTop() : []),
      ...rec.filter((a) => !window.AppsDiscover?.isFav(a.id)).map(row),
      ...(rec.length ? ['-'] : []),
      ...groups.map(([g, l]) => ({ label: `${GROUP_ICON[g]} ${g}`, hint: l.map((a) => a.name).slice(0, 4).join(', '), items: () => l.map(row) })),
      '-',
      { label: '⤓ Downloads from apps…', action: () => downloadsDialog() },
      ...(typeof AppsMeshy !== 'undefined' ? [{ label: '🧊 Your Meshy models…', action: () => AppsMeshy.library() }] : []),
      { label: 'More', items: () => [
        { label: '📂 The downloads folder', action: async () => { const d = await api()?.dirs(); if (d) window.hub.fs.reveal(d.downloads); } },
        { label: 'Close every app window', action: () => api()?.closeAll() },
        { label: 'What each app does', action: () => Commands.exec('/apps list', chatAgent()?.id) },
      ] },
    ];
  }
  function menu(x, y) { showMenu(x, y, menuItems()); }
  const menuCenter = () => menu(Math.max(8, innerWidth / 2 - 140), 90);

  // ---------- where a file goes ----------
  function chatAgent() {
    const id = H.activeId;
    const a = id && H.agent?.(id);
    if (a?.mode === 'native') return a;
    if (H.isTool?.(id)) { const d = Tools.dockedAgent(id.slice(5)); if (d) return d; }
    for (const m of H.mru || []) { const x = H.agent?.(m); if (x?.mode === 'native') return x; }
    return H.claudeAgent();
  }
  async function route(p, target, o = {}) {
    const r = await route0(p, target, o);
    emit('routed', { target, file: p });
    return r;
  }
  async function route0(p, target, { name, app } = {}) {
    const file = String(p || '');
    if (!file) throw new Error('No file');
    switch (target) {
      case 'lab-model': return AppsLab.addModel(file, { name });
      case 'lab-hdri': return AppsLab.addHdri(file, { name });
      case 'lab-ref': { await ThreeLab.cmd(); const r = await ThreeLab.addReference(file); toast(`In the Lab's references as ${r.key}`, { timeout: 2600 }); return r; }
      case 'lab-song': {
        const r = await HubBridge.call('three_load_media', { path: file });
        if (!r?.ok) throw new Error(r?.error || 'The Lab couldn\'t load it');
        activate('tool:three');
        toast('Loaded as the Lab\'s song ♪', { timeout: 2200 });
        return r;
      }
      case 'board': {
        if (typeof Board === 'undefined') throw new Error('The board isn\'t available');
        const items = await Board.addFiles([file]);
        activate('tool:board');
        return items[0] || null;
      }
      case 'open': case 'review': return MediaFile.open(file); // (review: the old place, Video Review is gone)
      case 'chat': { const ag = chatAgent(); if (!ag) throw new Error('No chat'); activate(ag.id); await Native.attachPaths(ag.id, [file]); return true; }
      case 'meshy': if (typeof AppsMeshy === 'undefined') throw new Error('Meshy isn\'t loaded'); return AppsMeshy.run('image', { image: file, name: name || file.split(/[\\/]/).pop() });
      case 'make': {
        const ag = chatAgent();
        const mk = typeof Makes !== 'undefined' ? (Makes.ofChat?.(H.activeChat?.[ag?.id]) || Makes.live?.()[0]) : null;
        if (!mk) throw new Error('No make in progress (/makes)');
        Makes.addOutput(mk, file, null, C.kindOf(file));
        toast(`Added to ${mk.name}`, { timeout: 2400 });
        return mk;
      }
      case 'assets': { await window.Lazy?.load?.('assets'); const [it] = await Assets.add([file], { src: 'download', o: get(app)?.name || app || 'Apps' }); if (it) AssetsUI.reveal(it); return it || null; } // (round 24) the asset library
      case 'reveal': return window.hub.fs.reveal(file);
      default: throw new Error(`Unknown place "${target}" (lab-model, lab-hdri, lab-song, lab-ref, board, open, chat, meshy, make, assets, reveal)`);
    }
  }
  const tryRoute = (p, target, o) => route(p, target, o).catch((err) => toast(err.message, { type: 'error', timeout: 6000 }));

  // ---------- downloads ----------
  function onDownload(d, quiet) {
    const was = downloads.get(d.id);
    downloads.delete(d.id); downloads.set(d.id, d);
    while (downloads.size > 120) downloads.delete(downloads.keys().next().value);
    emit('download', d);
    if (d.state !== 'completed' || was?.state === 'completed' || quiet) return;
    const app = get(d.app);
    const best = C.routesFor(d.name, app?.routes || {})[0];
    if (!best) return;
    toast(`⤓ ${d.name} from ${d.appName}`, { timeout: 9000, action: best.id === 'reveal' ? null : { label: best.label.replace(/^\S+\s/, ''), fn: () => tryRoute(d.path, best.id, { name: d.name, app: d.app }) } });
  }
  const allDownloads = () => [...downloads.values()].reverse();
  async function downloadsDialog() {
    const fresh = await api()?.downloads();
    for (const d of (fresh || []).slice().reverse()) if (!downloads.has(d.id)) downloads.set(d.id, d);
    const done = allDownloads().filter((d) => d.state === 'completed');
    grid({
      title: 'Downloads from apps',
      empty: 'Nothing yet: files you download in an app window land in Downloads/Hearth/<app> and show here.',
      items: done.map((d) => ({
        title: d.name, sub: `${d.appName} · ${timeAgo(d.at)}`, icon: { model: '🧊', hdri: '🌅', audio: '🎵', video: '🎞', image: null, font: '🔤' }[C.kindOf(d.name)] || '📄',
        thumb: C.kindOf(d.name) === 'image' ? d.path : null,
        actions: [...C.routesFor(d.name, get(d.app)?.routes || {}).slice(0, 4), ...(typeof Makes !== 'undefined' && Makes.live?.().length ? [{ id: 'make', label: C.TARGETS.make }] : [])].map((r) => ({ label: r.label, run: () => tryRoute(d.path, r.id, { name: d.name, app: d.app }) })),
      })),
    });
  }

  // ---------- a picker of cards (Meshy models, Poly Haven skies, downloads) ----------
  const fileUrl = (p) => (!p ? '' : /^(data|blob|https?|file):/.test(p) ? p : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  function grid({ title, items = [], empty = 'Nothing here yet.', head = null, cls = '' }) {
    document.querySelector('dialog.apps-grid')?.close();
    const body = el('div', { class: 'apps-cards' });
    const paint = (list) => body.replaceChildren(...(list.length ? list.map((it) => el('div', { class: 'apps-card', title: it.tip || it.title },
      el('div', { class: 'apps-thumb' }, it.thumb && !/^http:/i.test(it.thumb) ? el('img', { src: fileUrl(it.thumb), alt: '', loading: 'lazy', on: { error: (e) => e.target.replaceWith(el('span', { text: it.icon || '▣' })) } }) : el('span', { text: it.icon || '▣' })),
      el('b', { text: it.title }), it.sub ? el('small', { text: it.sub }) : null,
      el('div', { class: 'apps-card-acts' }, (it.actions || []).map((a) => el('button', { class: `ghost small${a.primary ? ' primary' : ''}`, text: a.label, title: a.hint || '', on: { click: async (e) => { e.stopPropagation(); if (a.close !== false) dlg.close(); try { await a.run(); } catch (err) { toast(err.message, { type: 'error', timeout: 6000 }); } } } })))))
      : [el('p', { class: 'hint', text: empty })]));
    const filter = items.length > 8 ? el('input', { type: 'search', class: 'apps-filter', placeholder: 'Filter…', on: { input: (e) => { const q = e.target.value.toLowerCase(); paint(items.filter((it) => `${it.title} ${it.sub || ''}`.toLowerCase().includes(q))); } } }) : null;
    const dlg = el('dialog', { class: `ui-modal apps-grid ${cls}` },
      el('div', { class: 'apps-grid-head' }, el('h2', { text: title }), el('span', { class: 'spacer' }), filter, el('button', { class: 'ghost small', text: 'Close', on: { click: () => dlg.close() } })),
      head, body);
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    document.body.append(dlg);
    paint(items);
    dlg.showModal();
    return dlg;
  }

  // ---------- asking first (paid credits, anything outward-facing) ----------
  // Access.ask (the access stream's permission prompts) when it exists, else a plain confirm.
  async function ask({ agentId = null, action, target = '', risk = 'high', detail = '', title = 'Allow this?', ok = 'Yes' }) {
    if (typeof window.Access?.ask === 'function') {
      try { return Boolean(await window.Access.ask({ agentId, action, target, risk, detail })); } catch { /* fall back to the confirm */ }
    }
    return Modal.confirm(title, detail, { ok });
  }

  // ---------- sending a page to the chat ----------
  async function toChat(p) {
    const ag = chatAgent();
    if (!ag) { toast('No chat to send it to', { type: 'error' }); return; }
    activate(ag.id);
    const text = `From ${p.appName}: ${p.title ? `[${p.title.replace(/[[\]]/g, '')}](${p.url})` : p.url}${p.selection ? `\n> ${p.selection.trim().split('\n').join('\n> ')}` : ''}\n`;
    Native.setDraft(ag.id, text);
    if (p.picture) { try { await Native.attachPaths(ag.id, [p.picture]); } catch { /* the picture is a bonus */ } }
  }

  // ---------- events from the main process ----------
  const on = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); };
  function emit(type, data) { for (const fn of listeners.get(type) || []) { try { fn(data); } catch (err) { console.warn(err); } } }
  api()?.onEvent?.((ev) => {
    if (!ev?.type) return;
    if (ev.type === 'download') onDownload(ev.d, ev.quiet);
    else if (ev.type === 'to-chat') toChat(ev);
    else if (ev.type === 'route') tryRoute(ev.d.path, ev.target, { name: ev.d.name, app: ev.d.app });
    else if (ev.type === 'open') open(ev.id).catch((err) => toast(err.message, { type: 'error' }));
    else if (ev.type === 'action') {
      const a = (get(ev.app)?.actions || []).find((x) => x.id === ev.action);
      Promise.resolve().then(() => a?.run?.({ url: ev.url, title: ev.title })).catch((err) => toast(err.message, { type: 'error', timeout: 5000 }));
    } else if (ev.type === 'window') { windows.set(ev.id, ev.state); emit('window', ev); }
    emit(ev.type === 'meshy' ? 'meshy' : `ev:${ev.type}`, ev.type === 'meshy' ? ev.job : ev);
  });

  // ---------- chat commands ----------
  function describeAll() {
    return GROUPS.map((g) => [g, list().filter((a) => a.group === g)]).filter(([, l]) => l.length)
      .map(([g, l]) => `**${g}**\n${l.map((a) => `- ${a.icon} **${a.name}** (\`/apps ${a.id}\`): ${String(a.describe()).replace(new RegExp(`^${a.name}:\\s*`), '')}${windows.get(a.id) && windows.get(a.id) !== 'closed' ? ' · open' : ''}`).join('\n')}`).join('\n');
  }
  function commands() {
    if (typeof Commands === 'undefined' || Commands.get('apps')) return;
    Commands.register({
      name: 'apps', area: 'Apps', args: '[app] [action|reload|back|send|hide] | list | search [words] | discover [off|on] | fav <app> | send-to <app> [board|lab|render|file] | suggest <app> | downloads | folder | close [app|all] | free',
      desc: 'The services you use, each in its own window (Meshy, Suno, Figma, Poly Haven…): /apps alone shows them',
      keywords: 'app windows integrations meshy suno figma spline runway elevenlabs fonts coolors sketchfab poly haven unsplash youtube instagram tiktok pinterest mixamo',
      examples: ['/apps', '/apps figma', '/apps discover', '/apps search video', '/apps send-to midjourney board', '/apps coolors palette', '/apps close all', '/apps free'],
      complete: (a) => {
        const [first, ...rest] = String(a || '').split(/\s+/);
        if (rest.length) { const app = get(first); return (app?.actions || []).map((x) => ({ value: `${app.id} ${x.id}`, label: x.label })); }
        return [...['list', 'search', 'discover', 'discover off', 'fav', 'send-to', 'suggest', 'downloads', 'folder', 'close', 'windows', 'free'].map((v) => ({ value: v })), ...list().map((x) => ({ value: x.id, label: `${x.icon} ${x.name}`, hint: x.desc || '' }))].filter((x) => x.value.startsWith((first || '').toLowerCase()));
      },
      run: async (args, ctx) => {
        const [first = '', ...rest] = String(args || '').trim().split(/\s+/);
        const sub = first.toLowerCase();
        if (!sub) { if (ctx.source === 'chat' || ctx.source === 'bar') { menuCenter(); return null; } return describeAll(); }
        if (sub === 'list' || sub === 'help') return describeAll();
        const D = window.AppsDiscover;
        if (sub === 'discover' && D) {
          const a = rest[0]?.toLowerCase();
          if (a === 'off' || a === 'on') { await D.setOff(a === 'off'); return a === 'off' ? 'No more "Try this" notes (/apps discover still suggests).' : '"Try this" notes are back (once a day at most).'; }
          if (a === 'now') { const s = await D.maybeChip({ force: true }); return s ? null : 'Nothing new to suggest.'; }
          if (ctx.source === 'chat' || ctx.source === 'bar') { D.dialog(); return null; }
          return D.text();
        }
        if ((sub === 'search' || sub === 'all') && D) { D.searchDialog(rest.join(' ')); return null; }
        if ((sub === 'fav' || sub === 'star') && D) { const app = get(rest.join(' ')); if (!app) return `No app "${rest.join(' ')}".`; const on = await D.toggleFav(app.id); return on ? `★ ${app.name} comes first in the Apps menu.` : `${app.name} is no longer a favorite.`; }
        if (sub === 'suggest' && D) { const app = get(rest[0]); if (!app) return `No app "${rest[0] || ''}".`; D.suggestCard(ctx.agentId, app.id, rest.slice(1).join(' ')); return null; }
        if (sub === 'send-to' && D) { const app = get(rest[0]); if (!app) return `No app "${rest[0] || ''}". Apps that take a picture: ${D.sendable().map((x) => x.id).join(', ')}`; return D.sendTo(app.id, rest.slice(1).join(' ') || 'board'); }
        if (sub === 'downloads') { await downloadsDialog(); return null; }
        if (sub === 'folder') { const d = await api()?.dirs(); if (d) window.hub.fs.reveal(d.downloads); return d ? `Downloads from apps go to ${d.downloads}` : 'App windows need the desktop app.'; }
        if (sub === 'windows') { const w = await api()?.windows() || []; return w.length ? w.map((x) => `- ${x.name}: ${x.visible ? 'on screen' : 'hidden (parked soon)'}${x.audible ? ' · playing sound' : ''}${x.title ? ` · ${x.title}` : ''}`).join('\n') : 'No app window is open.'; }
        // (round 16) the hidden windows go now instead of in a few minutes (their pages leave memory; sign-ins stay)
        if (sub === 'free') {
          const w = (await api()?.windows()) || [];
          const gone = w.filter((x) => !x.visible && !x.audible);
          for (const x of gone) await api()?.close(x.id, { destroy: true });
          return gone.length ? `Freed ${gone.length} hidden app window${gone.length > 1 ? 's' : ''} (${gone.map((x) => x.name).join(', ')}); they open again where they were.` : 'No hidden app window to free.';
        }
        if (sub === 'close') {
          const what = rest.join(' ');
          if (!what || what === 'all') { await api()?.closeAll(); return 'Closed every app window (sign-ins are kept).'; }
          const app = get(what); if (!app) return `No app "${what}".`;
          const r = await api()?.close(app.id, { destroy: true });
          return r?.ok ? `Closed ${app.name}.` : `${app.name} isn't open.`;
        }
        const app = get(sub) || find(args);
        if (!app) return `No app "${first}". ${describeAll().slice(0, 900)}`;
        const actId = rest.join(' ').toLowerCase();
        // the window itself, by chat: /apps figma reload | back | forward | send (to the chat) | hide | home | download <url>
        const OPS = { reload: 'reload', back: 'back', forward: 'forward', send: 'to-chat', 'to-chat': 'to-chat', hide: 'close', home: 'home', link: 'copy-link' };
        const op = OPS[rest[0]?.toLowerCase()];
        if ((op || rest[0]?.toLowerCase() === 'download') && !(app.actions || []).some((x) => x.id === rest[0].toLowerCase())) {
          if (!app.web) return `${app.name} has no window.`;
          if (!(await api()?.windows() || []).some((w) => w.id === app.id)) await openWindow(app.id);
          const r = op ? await api().nav(app.id, op) : await api().nav(app.id, 'download', rest[1] || '');
          return r?.ok ? null : r?.error || 'Not done';
        }
        if (actId) {
          const a = (app.actions || []).find((x) => x.id === actId || x.label.toLowerCase().includes(actId));
          if (!a) return `${app.name} can: ${(app.actions || []).map((x) => `\`${x.id}\` (${x.label})`).join(', ') || 'open (no other actions)'}. /apps ${app.id} opens it.`;
          const ws = (await api()?.windows() || []).find((w) => w.id === app.id);
          const out = await a.run({ url: ws?.url || app.url, title: ws?.title || '' }, ctx);
          return typeof out === 'string' ? out : null;
        }
        await open(app.id);
        return null;
      },
    });
    if (!Commands.get('apps-tools')) Commands.register({
      name: 'apps-tools', area: 'Apps', args: 'on | off | directors',
      desc: 'Let this chat\'s agent use the app tools (open an app, ask Meshy for a 3D model: it always asks you first). Adds a few tool definitions to each of its messages',
      complete: () => ['on', 'off', 'directors'].map((v) => ({ value: v })),
      run: async (args, ctx) => {
        const a = String(args || '').trim().toLowerCase();
        if (!a) { const on = H.agents().filter((x) => x.appsTools).map((x) => x.name); return on.length ? `App tools are on for ${on.join(', ')}.` : 'App tools are off everywhere (/apps-tools on for this chat\'s agent, or directors).'; }
        const targets = a === 'directors' ? H.agents().filter((x) => x.dock && x.mode === 'native') : [H.agent(ctx.agentId)].filter(Boolean);
        const want = a !== 'off';
        for (const x of targets) { if (want) x.appsTools = true; else delete x.appsTools; }
        await saveConfig();
        return `${want ? 'On' : 'Off'} for ${targets.map((x) => x.name).join(', ') || 'nobody'}${want ? ': it can open apps and ask Meshy for models (you confirm every paid generation).' : '.'}`;
      },
    });
  }

  // ---------- agents' tools (mcp/apps-mcp.js → gamebridge.js → here) ----------
  async function handleTool(tool, a = {}, ctx = {}) {
    if (tool === 'apps_open') {
      const agentOf = () => (ctx.agentId || H.agents().find((x) => ctx.chatId && H.activeChat?.[x.id] === ctx.chatId)?.id || chatAgent()?.id);
      if (a.suggest && a.app && window.AppsDiscover) { const app = get(a.app); if (!app) return { ok: false, error: `No app "${a.app}"` }; AppsDiscover.suggestCard(agentOf(), app.id, String(a.why || '')); return { ok: true, value: `Suggested ${app.name} to the owner (a card with an Open button).` }; }
      if (a.op === 'discover' && window.AppsDiscover) return { ok: true, value: AppsDiscover.text(6) };
      if (a.send && a.app && window.AppsDiscover) { try { return { ok: true, value: await AppsDiscover.sendTo(get(a.app)?.id || a.app, String(a.send)) }; } catch (err) { return { ok: false, error: err.message }; } }
      if (!a.app || a.op === 'list') return { ok: true, value: list().map((x) => `${x.id}: ${x.name} (${x.group}${x.price ? `, ${x.price}` : ''})${x.desc ? ` · ${x.desc}` : ''}`).join('\n') };
      const app = get(a.app);
      if (!app) return { ok: false, error: `No app "${a.app}". Apps: ${list().map((x) => x.id).join(', ')}` };
      if (a.paste) {
        if (!app.web) return { ok: false, error: `${app.name} has no page to type into.` };
        await openWindow(app.id, { background: false });
        const r = await api().paste(app.id, { text: String(a.paste), field: a.field || '' });
        return r?.ok ? { ok: true, value: `Typed into ${app.name}${r.box ? ` (${r.box})` : ''}. The owner presses its own Create / Send button.` } : { ok: false, error: r?.error || 'Couldn\'t type into the page' };
      }
      if (a.action) {
        const act = (app.actions || []).find((x) => x.id === a.action);
        if (!act) return { ok: false, error: `${app.name} actions: ${(app.actions || []).map((x) => x.id).join(', ') || 'none'}` };
        const ws = (await api()?.windows() || []).find((w) => w.id === app.id);
        const out = await act.run({ url: ws?.url || app.url, title: ws?.title || '' }, { agentId: ctx.agentId || null, chatId: ctx.chatId || null, source: 'agent' });
        return { ok: true, value: typeof out === 'string' ? out : `${act.label}: done` };
      }
      await open(app.id, a.url ? { url: a.url } : {});
      return { ok: true, value: `${app.name} is open in its own window${app.web ? ' (the owner signs in there)' : ''}.` };
    }
    if (tool.startsWith('meshy_')) {
      if (typeof AppsMeshy === 'undefined') return { ok: false, error: 'Meshy isn\'t loaded' };
      return AppsMeshy.tool(tool, a, ctx);
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['apps_', 'meshy_'], handleTool);

  // ---------- entry points: the rail's ⋯, Ctrl/⌘+K, keys ----------
  const M = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
  function paletteFor(app) { try { AppUI.addAction(`App: ${app.name}${app.desc ? ` · ${app.desc}` : ''}`, () => open(app.id).catch((err) => toast(err.message, { type: 'error' }))); } catch { /* no palette */ } }
  function railEntry() {
    if (document.getElementById('apps-btn')) return;
    const anchor = document.getElementById('config-btn');
    if (!anchor) return;
    const btn = el('button', { class: 'tool-btn', id: 'apps-btn', hidden: true, text: '▣', title: 'Apps', dataset: { feature: 'Apps' } });
    btn.addEventListener('click', () => { const r = (document.getElementById('rail-more') || anchor).getBoundingClientRect(); menu(r.right + 6, Math.max(8, r.top - 260)); });
    anchor.before(btn);
    if (typeof Simplify !== 'undefined' && Array.isArray(Simplify.TUCKED) && !Simplify.TUCKED.some(([id]) => id === 'apps-btn')) Simplify.TUCKED.push(['apps-btn', '▣ Apps: Meshy, Suno, Figma, Poly Haven…']);
  }
  addEventListener('DOMContentLoaded', () => {
    railEntry();
    commands();
    if (typeof AppUI !== 'undefined' && AppUI.addAction) {
      AppUI.addAction('Apps: open an app (Meshy, Suno, Figma…)', menuCenter);
      AppUI.addAction('Apps: downloads from app windows', () => downloadsDialog());
      palReady = true;
      for (const a of reg.values()) if (!a.hidden) paletteFor(a);
    }
    if (typeof Keys !== 'undefined') {
      Keys.add(
        { area: 'App windows', keys: `${M}+R`, what: 'reload the app\'s page' },
        { area: 'App windows', keys: `Alt+← / ${M}+[`, what: 'back (Alt+→ / ' + M + '+] forward; right-click ‹ too)' },
        { area: 'App windows', keys: `${M}+L`, what: 'copy the page\'s address (or click it)' },
        { area: 'App windows', keys: `${M}+Shift+Enter`, what: 'send the page to the chat (💬): address, picture, selection' },
        { area: 'App windows', keys: `${M}+W`, what: 'hide the window (it keeps your sign-in; parked after a few minutes)' },
      );
    }
    catalogSoon();
    // stand-ins queued by scripts that loaded first (window.__appsQueue = [def, …])
    for (const def of window.__appsQueue || []) register(def);
    window.__appsQueue = { push: (def) => register(def) };
  });

  return {
    register, get, find, list, open, openWindow, menu, menuCenter, menuItems, route, tryRoute, grid, ask, on, emit, chatAgent, fileUrl,
    downloads: allDownloads, downloadsDialog, describeAll, GROUPS, tool: handleTool, windows: () => new Map(windows),
  };
})();
window.Apps = Apps;
