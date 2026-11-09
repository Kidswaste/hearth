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
  // (round 160, boot160) slot() / fill(slot, fn): the apps fn registers take the place they had when the slot was made
  // (lazy.js: a lazy group's stand-in app windows, read right after the first frame), so Apps.list() keeps its old order
  // (an app another slot made before this one filled in counts as there before it, as it was registered first then)
  let slots = 0;
  const filledBy = new Map(); // app id → the slot that put it in
  const slot = () => ({ ids: new Set(reg.keys()), n: ++slots });
  function fill(s, fn) {
    const had = new Set(reg.keys());
    try { fn(); } finally {
      const all = [...reg];
      const added = all.filter(([id]) => !had.has(id));
      for (const [id] of added) filledBy.set(id, s.n);
      const first = ([id]) => had.has(id) && (s.ids.has(id) || (filledBy.get(id) ?? Infinity) < s.n);
      if (added.length) {
        reg.clear();
        for (const e of [...all.filter(first), ...added, ...all.filter((x) => had.has(x[0]) && !first(x))]) reg.set(e[0], e[1]);
      }
    }
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
    // (round 30, chrome) it opened in the owner's Chrome (Google sign-in): one click brings it back inside Hearth
    if (r.chrome && !background) toast(`${app.name} runs through Chrome, shown here (Google sign-in works there)`, { timeout: 6000, action: { label: 'Use it inside Hearth', fn: async () => { await api().chrome(app.id, 'hearth'); openWindow(app.id, { url }).catch((err) => toast(err.message, { type: 'error' })); } } });
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
  // (round 160, boot160) what only runs when asked is apps-ui.js (lazy group 'appsui'): routing a file, the downloads
  // dialog, a page sent to the chat, /apps and /apps-tools, the agents' app tools
  const ui = () => (window.Lazy && !Lazy.isIn('appsui') ? Lazy.load('appsui') : Promise.resolve()).then(() => AppsUI);
  async function route0(p, target, o) { return (await ui()).route0(p, target, o); }
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
  async function downloadsDialog() { return (await ui()).downloadsDialog(); } // (round 160: apps-ui.js)

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
  async function toChat(p) { return (await ui()).toChat(p); } // (round 160: apps-ui.js)

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
      run: async (args, ctx) => (await ui()).appsRun(args, ctx), // (round 160: apps-ui.js)
    });
    if (!Commands.get('apps-tools')) Commands.register({
      name: 'apps-tools', area: 'Apps', args: 'on | off | directors',
      desc: 'Let this chat\'s agent use the app tools (open an app, ask Meshy for a 3D model: it always asks you first). Adds a few tool definitions to each of its messages',
      complete: () => ['on', 'off', 'directors'].map((v) => ({ value: v })),
      run: async (args, ctx) => (await ui()).appsToolsRun(args, ctx), // (round 160: apps-ui.js)
    });
  }

  // ---------- agents' tools (mcp/apps-mcp.js → gamebridge.js → here) ----------
  async function handleTool(tool, a = {}, ctx = {}) { return (await ui()).handleTool(tool, a, ctx); } // (round 160: apps-ui.js)
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
    register, slot, fill, get, find, list, open, openWindow, menu, menuCenter, menuItems, route, tryRoute, grid, ask, on, emit, chatAgent, fileUrl,
    downloads: allDownloads, downloadsDialog, describeAll, GROUPS, tool: handleTool, windows: () => new Map(windows),
    _kit: { C, api, get, find, list, open, openWindow, menuCenter, downloads, allDownloads, grid, chatAgent, describeAll, tryRoute }, // (apps-ui.js)
  };
})();
window.Apps = Apps;
