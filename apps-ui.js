// (round 160, boot160) Apps' work that only runs when asked, out of apps.js: where a downloaded file goes (route0), the
// downloads dialog, a page sent to the chat, /apps and /apps-tools themselves, and the agents' app tools (apps_*, meshy_*).
// apps.js keeps the registry, the windows, the menu and the stand-in entries (commands, palette lines, keys, tool
// prefixes) and hands over here: lazy group 'appsui', read the first time one of these is used.
const AppsUI = (() => {
  const { C, api, get, find, list, open, openWindow, menuCenter, downloads, allDownloads, grid, chatAgent, describeAll, tryRoute } = Apps._kit;
  async function route0(p, target, { name, app } = {}) {
    const file = String(p || '');
    if (!file) throw new Error('No file');
    switch (target) {
      case 'lab-model': return AppsLab.addModel(file, { name });
      case 'lab-hdri': return AppsLab.addHdri(file, { name });
      case 'lab-ref': { await window.Lazy?.load?.('lab'); await ThreeLab.cmd(); const r = await ThreeLab.addReference(file); toast(`In the Lab's references as ${r.key}`, { timeout: 2600 }); return r; }
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
  async function toChat(p) {
    const ag = chatAgent();
    if (!ag) { toast('No chat to send it to', { type: 'error' }); return; }
    activate(ag.id);
    const text = `From ${p.appName}: ${p.title ? `[${p.title.replace(/[[\]]/g, '')}](${p.url})` : p.url}${p.selection ? `\n> ${p.selection.trim().split('\n').join('\n> ')}` : ''}\n`;
    Native.setDraft(ag.id, text);
    if (p.picture) { try { await Native.attachPaths(ag.id, [p.picture]); } catch { /* the picture is a bonus */ } }
  }
  async function appsRun(args, ctx) {
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
  }
  async function appsToolsRun(args, ctx) {
        const a = String(args || '').trim().toLowerCase();
        if (!a) { const on = H.agents().filter((x) => x.appsTools).map((x) => x.name); return on.length ? `App tools are on for ${on.join(', ')}.` : 'App tools are off everywhere (/apps-tools on for this chat\'s agent, or directors).'; }
        const targets = a === 'directors' ? H.agents().filter((x) => x.dock && x.mode === 'native') : [H.agent(ctx.agentId)].filter(Boolean);
        const want = a !== 'off';
        for (const x of targets) { if (want) x.appsTools = true; else delete x.appsTools; }
        await saveConfig();
        return `${want ? 'On' : 'Off'} for ${targets.map((x) => x.name).join(', ') || 'nobody'}${want ? ': it can open apps and ask Meshy for models (you confirm every paid generation).' : '.'}`;
  }
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
    // (round 30, chrome) the app's page, the same in Hearth's window or in Chrome: read, click, type, a picture, wait, go
    if (tool === 'apps_page') {
      const app = get(a.app);
      if (!app?.web) return { ok: false, error: `No app window "${a.app || ''}"` };
      if (!(await api()?.windows() || []).some((w) => w.id === app.id)) { await openWindow(app.id); await api().page(app.id, 'wait', { timeout: 20000 }); }
      const op = String(a.do || 'text');
      const r = await api().page(app.id, op, { selector: a.selector, text: a.text, url: a.url, key: a.key, enter: a.enter, timeout: a.timeout, max: a.max });
      if (!r?.ok) return { ok: false, error: r?.error || 'Not done' };
      if (op === 'shot') return { ok: true, value: `${app.name}'s page${r.where === 'chrome' ? ' (in Chrome)' : ''}.`, images: [{ data: r.image, mime: r.mime || 'image/jpeg' }] };
      return { ok: true, value: r.value };
    }
    if (tool.startsWith('meshy_')) {
      if (typeof AppsMeshy === 'undefined') return { ok: false, error: 'Meshy isn\'t loaded' };
      return AppsMeshy.tool(tool, a, ctx);
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }
  return { route0, downloadsDialog, toChat, appsRun, appsToolsRun, handleTool };
})();
