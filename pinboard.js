// Find images like this (round 30, pinboard stream): the finder, loaded on first use (lazy group "pinboard"; the ways in
// are in pinboard-hook.js). The owner asked for chats to "suggest images from Pinterest that match a vibe or an
// aesthetic"; now that Hearth drives its own Chrome (chromemain.js), it can read what a Pinterest search shows there.
//   1. the words: the owner's own, or the board's vibe (BoardVibe.summary → BoardPins.suggest: palette, light, styles,
//      moods, the aesthetics people search for)
//   2. the site's search opens where the owner is signed in: Pinterest in the Hearth Chrome (or the board's Pinterest
//      window when the owner prefers it inside Hearth), Unsplash / Are.na / Cosmos in their app windows
//   3. the pictures on screen are read through the page (pinboard-core.js: pictures, links, titles; read only), at most
//      one screen more by itself, more only when the owner asks (a modest scroll each time); what the board has already
//      is left out
//   4. the picker: tick the ones you want, "Add N to <board>": each is downloaded then (board:fetch, saved in the
//      board's media folder like a dropped picture) with its link as the source, the site as credit
// Hearth never logs in, never handles a password, never downloads what the owner didn't pick.
const Pinboard = (() => {
  const C = PinboardCore; const B = Board; const V = BoardVibe;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MAX_SCROLLS = 6; // per search: a person looking, not a crawler
  const SITE_KEY = 'pinboard.site';

  // ---------- where a site opens ----------
  const bases = () => { try { return store.get('pinboard.bases', {}) || {}; } catch { return {}; } }; // (tests: local pages stand in for the sites)
  const baseFor = (site) => bases()[site] || (site === 'pinterest' ? B.prefs().pinBase || null : null);
  async function chromeState(appId) { try { return await window.hub.apps.chrome(appId, 'status'); } catch { return null; } }
  // Pinterest: the Hearth Chrome (the owner's sign-in lives there) unless the owner said "inside Hearth", or there's no Chrome
  async function driverFor(siteId) {
    const s = C.siteOf(siteId);
    const st = await chromeState(s.app);
    if (s.id === 'pinterest') return st?.pref !== 'hearth' && st?.found && window.hub?.chrome ? chromeDriver(`app:${s.app}`) : windowDriver();
    return appDriver(s.app);
  }
  const need = (r, what) => { if (!r?.ok) throw new Error(r?.error || `${what} didn't answer`); return r.value; };
  function chromeDriver(key) {
    const page = (op, a) => window.hub.chrome.page(key, op, a || {});
    return { where: 'Chrome', key,
      go: async (url) => need(await page('open', { url }), 'Chrome'),
      read: async () => need(await page('eval', { expr: C.readExpr({}) }), 'The page'),
      scroll: async () => need(await page('eval', { expr: C.SCROLL_EXPR }), 'The page'),
      show: () => page('show') };
  }
  function windowDriver() {
    const pins = (op, a) => window.hub.board.pins(op, a || {});
    return { where: 'its Hearth window',
      go: async (url, query) => { const r = await pins('open', { query, base: baseFor('pinterest'), board: B.current()?.name || '' }); if (!r?.ok) throw new Error(r?.error || 'The Pinterest window didn\'t open'); return r; },
      read: async () => need(await pins('read'), 'The Pinterest window'),
      scroll: async () => need(await pins('scroll'), 'The Pinterest window'),
      show: () => pins('open', {}) };
  }
  function appDriver(appId) {
    let where = 'its app window';
    const page = async (op, a) => { const r = await window.hub.apps.page(appId, op, a || {}); if (r?.where === 'chrome') where = 'Chrome'; return r; };
    return { get where() { return where; },
      go: async (url) => { if (!window.Apps?.openWindow) throw new Error('App windows need Hearth\'s desktop app'); await Apps.openWindow(appId, { url, go: true }); await page('wait', { timeout: 15000 }); },
      read: async () => need(await page('pins'), 'The page'),
      scroll: async () => need(await page('scroll'), 'The page'),
      show: () => Apps.openWindow(appId).catch(() => {}) };
  }

  // ---------- reading ----------
  // the page settles: two reads alike (Pinterest fills its grid after the page loads); a sign-in page answers at once
  async function readSettled(d, { ms = 10000, expect = null } = {}) {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < ms) {
      let v = null;
      try { v = await d.read(); } catch { /* still loading */ }
      if (v && (!expect || expect(v.url))) {
        if (v.signin && !v.raw.length) return v;
        if (v.raw.length && last && last.raw.length === v.raw.length) return v;
        last = v;
      }
      await sleep(500);
    }
    return last;
  }
  const wordsIn = (url, q) => { try { const t = decodeURIComponent(String(url)).toLowerCase().replace(/[+-]/g, ' '); return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => t.includes(w)); } catch { return false; } };
  // one search: { site, query, pins (new ones), dupes (already on the board), signin, where, end }
  const sessions = new Map(); // site → the last search (for "More")
  async function search({ site = 'pinterest', query = '', boardId = null, min = 12 } = {}) {
    const s = C.siteOf(site);
    const d = await driverFor(s.id);
    const url = C.searchUrl(s.id, query, baseFor(s.id));
    await d.go(url, query);
    const v = await readSettled(d, { expect: query ? (u) => wordsIn(u, query) : null });
    if (!v) throw new Error(`${s.name} showed no pictures (still loading, or the page changed)`);
    let pins = C.normalize(v, s.id); let end = v.end; let scrolls = 0;
    if (pins.length < min && !end && !v.signin) { // one more screen, by itself
      const more = await step(d, s.id); scrolls = 1; end = more.end; pins = C.merge(pins, more.pins);
    }
    const ses = { site: s.id, query, url, d, all: pins, scrolls, end, signin: Boolean(v.signin && !pins.length), boardId };
    sessions.set(s.id, ses);
    return result(ses);
  }
  async function step(d, siteId) {
    await d.scroll().catch(() => false);
    await sleep(1200); // the site loads the next row; a person's pace
    const v = await readSettled(d, { ms: 5000 });
    return { pins: v ? C.normalize(v, siteId) : [], end: Boolean(v?.end) };
  }
  // the next screen of the last search on a site
  async function more(siteId = 'pinterest') {
    const ses = sessions.get(siteId);
    if (!ses) throw new Error('Search first');
    if (ses.scrolls >= MAX_SCROLLS || ses.end) return { ...result(ses), done: true };
    const r = await step(ses.d, siteId);
    ses.scrolls += 1; ses.end = r.end; ses.all = C.merge(ses.all, r.pins);
    return result(ses);
  }
  function result(ses) {
    const b = boardOf(ses.boardId);
    const { fresh, dupes } = C.dedupe(ses.all, C.knownFrom(b?.items || []));
    return { site: ses.site, siteName: C.siteOf(ses.site).name, query: ses.query, pins: fresh, dupes: dupes.length, signin: ses.signin, where: ses.d.where, end: ses.end || ses.scrolls >= MAX_SCROLLS };
  }
  const boardOf = (id) => (id && B._.S.boards?.get?.(id)) || B.current();

  // ---------- the words ----------
  async function queryFor(b, { words = '', itemIds = null } = {}) {
    const items = (itemIds?.length ? itemIds.map((id) => b.items.find((i) => i.id === id)) : b.items).filter((i) => i && i.type !== 'frame' && i.type !== 'link' && !i.hidden);
    const s = BoardPins.suggest(V.summary(items), { words, brief: itemIds?.length ? '' : b.brief || '' });
    return { query: s.phrases[0] || String(words || 'moodboard aesthetic'), others: s.phrases.slice(1, 5) };
  }

  // ---------- adding the picks ----------
  async function addPins(list, { boardId = null } = {}) {
    await B.ready();
    if (boardId && B.current()?.id !== boardId) await B.open(boardId);
    const b = B.current();
    const files = [];
    // downloaded now, only these, three at a time
    for (let i = 0; i < list.length; i += 3) {
      const got = await Promise.all(list.slice(i, i + 3).map(async (p) => {
        try {
          if (/^data:image\//.test(p.image)) { const [meta, data] = p.image.split(','); return { p, path: await window.hub.board.save(`pin.${/png/.test(meta) ? 'png' : /gif/.test(meta) ? 'gif' : 'jpg'}`, data) }; }
          let r = await window.hub.board.fetch(p.image);
          if (!r?.ok && p.thumb && p.thumb !== p.image) r = await window.hub.board.fetch(p.thumb); // (the big one refused: the one the page showed)
          if (!r?.ok) throw new Error(r?.error || 'not downloaded');
          return { p, path: r.path };
        } catch (err) { toast(`Couldn't add “${p.title || 'a picture'}”: ${err.message}`, { type: 'error' }); return null; }
      }));
      files.push(...got.filter(Boolean));
    }
    if (!files.length) return [];
    const bb = BoardLayout.bbox(b.items);
    const at = B.isMounted() && B.visible() ? null : (b.items.length ? { x: bb.x + bb.w + 80, y: bb.y } : { x: 0, y: 0 });
    const items = await B.addFiles(files.map((f) => f.path), at, b);
    const meta = new Map(items.map((it, i) => [it.id, files[i]?.p]));
    B.patch(items.map((i) => i.id), (x) => {
      const p = meta.get(x.id); if (!p) return;
      const site = C.siteOf(p.site);
      if (p.title) x.title = p.title.slice(0, 80);
      if (p.link) x.source = p.link;
      if (/^https?:/.test(p.image)) x.url = p.image;
      x.pinKey = p.key; x.credit = site.name;
      x.tags = [...new Set([...(x.tags || []), site.id])];
    }, 'add found images');
    toast(`📌 ${items.length} added to ${b.name}`, { timeout: 4000, action: { label: 'Show', fn: () => { activate('tool:board'); setTimeout(() => { B.select(items.map((i) => i.id)); B.zoomSel(); }, 300); } } });
    document.dispatchEvent(new CustomEvent('hearth:board-found', { detail: { board: b.id, ids: items.map((i) => i.id) } }));
    return items;
  }

  // ---------- the picker ----------
  // the page's own small picture (https, as the sites serve them; Hearth's page refuses plain http pictures)
  const thumbOf = (p) => [p.thumb, p.image].find((u) => /^(https|data|file|blob):/i.test(String(u || ''))) || null;
  let ui = null;
  async function open({ words = '', boardId = null, itemIds = null, chatId = null, site = null, preload = null } = {}) {
    await B.ready();
    const b = boardId ? boardOf(boardId) : chatId ? await B.boardFor(chatId) : B.current();
    if (!b) { toast('Make a board first'); return null; }
    const q = preload ? { query: preload.query, others: [] } : await queryFor(b, { words, itemIds });
    close();
    const st = { b, site: preload?.site || site || store.get(SITE_KEY, 'pinterest'), query: q.query, pins: [], picked: new Set(), busy: false, res: null };
    const input = el('input', { type: 'search', class: 'pinb-q', value: q.query, placeholder: 'An aesthetic, a vibe, words…', attrs: { 'aria-label': 'What to look for' } });
    const siteBtn = el('button', { type: 'button', class: 'pinb-site', title: 'Where to look' });
    const chips = el('div', { class: 'pinb-chips' }, q.others.map((p) => el('button', { type: 'button', class: 'pinb-chip', text: p, on: { click: () => { input.value = p; run(); } } })));
    const status = el('div', { class: 'pinb-status', attrs: { role: 'status' } });
    const grid = el('div', { class: 'pinb-grid' });
    const moreBtn = el('button', { type: 'button', class: 'pinb-more', text: 'More ↓', title: 'One more screen of the page (a modest scroll)' });
    const addBtn = el('button', { type: 'button', class: 'primary pinb-add' });
    // (a fixed layer, not a modal dialog: the ⋯ and site menus must show above it)
    const panel = el('div', { class: 'pinb', attrs: { role: 'dialog', 'aria-label': 'Find images like this' } },
      el('div', { class: 'pinb-head' }, el('h2', {}, '📌 Images like ', el('b', { text: b.name })),
        el('button', { type: 'button', class: 'pinb-x', text: '⋯', title: 'More', on: { click: (e) => showMenu(e.clientX, e.clientY, moreItems()) } }),
        el('button', { type: 'button', class: 'pinb-x', text: '✕', title: 'Close', on: { click: () => close() } })),
      el('form', { class: 'pinb-bar', on: { submit: (e) => { e.preventDefault(); run(); } } }, input, siteBtn, el('button', { type: 'submit', class: 'pinb-go', text: 'Search' })),
      chips, status, grid,
      el('div', { class: 'pinb-foot' }, moreBtn, el('span', { class: 'spacer' }), addBtn));
    const dlg = el('div', { class: 'pinb-wrap', on: { mousedown: (e) => { if (e.target === dlg) close(); }, keydown: (e) => { if (e.key === 'Escape' && !document.querySelector('#menu')) { e.stopPropagation(); close(); } } } }, panel);
    ui = { dlg, st, run, paint };
    siteBtn.addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, siteItems()); });
    moreBtn.addEventListener('click', () => loadMore());
    addBtn.addEventListener('click', async () => {
      const list = st.pins.filter((p) => st.picked.has(p.key));
      if (!list.length) return;
      addBtn.disabled = true; addBtn.textContent = `Adding ${list.length}…`;
      const added = await addPins(list, { boardId: b.id });
      for (const p of list) if (added.length) st.pins = st.pins.filter((x) => x !== p);
      st.picked.clear(); st.addedN = (st.addedN || 0) + added.length;
      paint();
    });
    document.body.append(dlg);
    input.focus();
    function siteItems() {
      return [...C.ORDER.map((id) => { const s = C.SITES[id]; return { label: `${s.icon} ${s.name}${st.site === id ? '  ✓' : ''}`, action: () => { st.site = id; store.set(SITE_KEY, id); run(); } }; }), '-', ...(st.site === 'pinterest' ? [
        { label: 'Pinterest opens in Chrome (your sign-in there)', action: () => window.hub.apps.chrome('pinterest', 'chrome').then(() => run()) },
        { label: 'Pinterest opens inside Hearth', action: () => window.hub.apps.chrome('pinterest', 'hearth').then(() => run()) }] : [])];
    }
    function moreItems() {
      const ses = sessions.get(st.site);
      return [{ label: 'Show the page', action: () => ses?.d.show() }, { label: 'Pick all', action: () => { for (const p of st.pins) st.picked.add(p.key); paint(); } }, { label: 'Pick none', action: () => { st.picked.clear(); paint(); } }];
    }
    function paint() {
      const s = C.siteOf(st.site);
      siteBtn.textContent = `${s.icon} ${s.name} ▾`;
      const r = st.res;
      status.textContent = st.busy ? `Looking on ${s.name}…` : st.err ? st.err
        : r?.signin ? `${s.name} asks you to sign in: do it in ${r.where} (Hearth never sees your password), then Search again.`
          : r ? `${st.pins.length} from ${s.name} (${r.preloaded ? 'suggested in a chat' : `in ${r.where}`})${r.dupes ? ` · ${r.dupes} already on your board` : ''}${st.addedN ? ` · ${st.addedN} added` : ''}${st.pins.length ? ' · click to pick' : ''}` : '';
      status.classList.toggle('warn', Boolean(st.err || r?.signin));
      const have = new Set([...grid.children].map((n) => n.dataset.key));
      const want = new Set(st.pins.map((p) => p.key));
      for (const n of [...grid.children]) if (!want.has(n.dataset.key)) n.remove();
      for (const p of st.pins) if (!have.has(p.key)) grid.append(tile(p));
      for (const n of grid.children) { const on = st.picked.has(n.dataset.key); if (n.classList.contains('on') !== on) { n.classList.toggle('on', on); n.setAttribute('aria-pressed', String(on)); } }
      addBtn.textContent = st.picked.size ? `Add ${st.picked.size} to ${b.name}` : 'Pick the ones you want';
      addBtn.disabled = !st.picked.size || st.busy;
      moreBtn.hidden = !r || r.end || r.signin;
      moreBtn.disabled = st.busy;
      dlg.classList.toggle('busy', st.busy);
    }
    function tile(p) {
      return el('div', { class: 'pinb-tile', attrs: { role: 'button', tabindex: '0', 'aria-pressed': 'false' }, title: p.title || 'Untitled', dataset: { key: p.key },
        on: { click: (e) => { if (e.target.closest('a')) return; toggle(p.key); }, keydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(p.key); } } } },
      thumbOf(p) ? el('img', { attrs: { referrerpolicy: 'no-referrer' }, loading: 'lazy', decoding: 'async', draggable: false, alt: p.title || '', src: thumbOf(p) }) : null,
      el('span', { class: 'pinb-t', text: p.title || '' }),
      p.link ? el('a', { class: 'pinb-open', href: p.link, text: '↗', title: `Open on ${C.siteOf(p.site).name}`, on: { click: (e) => { e.preventDefault(); window.hub?.openExternal?.(p.link); } } }) : null);
    }
    function toggle(key) { if (st.picked.has(key)) st.picked.delete(key); else st.picked.add(key); paint(); }
    async function run() {
      st.query = input.value.trim() || st.query;
      st.busy = true; st.err = null; paint();
      try { st.res = await search({ site: st.site, query: st.query, boardId: b.id }); st.pins = st.res.pins; st.picked.clear(); } catch (err) { st.err = `Couldn't look on ${C.siteOf(st.site).name}: ${err.message}`; st.res = null; st.pins = []; }
      st.busy = false; paint();
      return st.res;
    }
    async function loadMore() {
      st.busy = true; paint();
      try { st.res = await more(st.site); st.pins = C.merge(st.pins, st.res.pins); } catch (err) { st.err = err.message; }
      st.busy = false; paint();
    }
    if (preload?.pins?.length) { st.pins = preload.pins.slice(); st.res = { site: st.site, pins: st.pins, dupes: 0, where: 'the chat', end: true, preloaded: true }; paint(); } else { paint(); run(); }
    return ui;
  }
  function close() { ui?.dlg?.remove(); ui = null; }

  // ---------- the AIs: board_do pins {query?} ----------
  async function op(a = {}, ctx = {}) {
    await B.ready();
    const b = ctx.chatId ? await B.boardFor(ctx.chatId) : B.current();
    const words = String(a.query || a.aesthetic || '').slice(0, 120);
    const { query } = await queryFor(b, { words });
    const site = C.SITES[a.site] ? a.site : 'pinterest';
    const r = await search({ site, query, boardId: b.id, min: 8 });
    if (r.signin) return { ok: true, value: `${r.siteName} asks the owner to sign in first (in ${r.where}); nothing found yet. Tell them, then try again.` };
    if (!r.pins.length) return { ok: true, value: `Nothing new for "${query}" on ${r.siteName}${r.dupes ? ` (${r.dupes} already on the board)` : ''}.` };
    const top = r.pins.slice(0, Math.max(1, Math.min(8, Number(a.k) || 8)));
    const rec = { board: b.id, boardName: b.name, query, site, siteName: r.siteName, pins: top };
    const shown = PinboardHook.show(ctx.chatId, rec);
    if (!shown) open({ boardId: b.id, preload: rec }); // (no reply running: the picker itself)
    return { ok: true, value: { query, site: r.siteName, found: top.map((p, i) => `${i + 1}. ${p.title || '(untitled)'}`), shown: 'to the owner as a picker: they tick the ones that go on the board (nothing is added before)' } };
  }

  return { open, close, search, more, addPins, op, queryFor, driverFor, get ui() { return ui; }, _: { sessions, readSettled, wordsIn } };
})();
window.Pinboard = Pinboard;
