// The Lab gallery (round 27, gallery): "a beautiful place to start from". One window of starting points, each a
// picture of what it looks like: the built-in starting points (tools/three-gallery-data.js, grouped by mood), your own
// scenes, scenes from history (deleted ones, and how your recent scenes began) and the rest of the Lab's library
// (backgrounds, visualizers, 3D, shaders, particles, physics, type, node presets, whole sketches). A search on top,
// the moods as chips. Hover a picture: it plays for a few seconds (one shared preview). Click: a new scene from it
// (at the frame size you're on); "＋ Layer" (or the right-click) adds it to the scene on screen instead.
// Light: the pictures are drawn once, one at a time, in ONE hidden preview page (never a WebGL page per card), only
// for the cards you scroll to, then kept small (JPEG) on disk (kv lab-gallery-thumbs) and reused; the page sleeps a
// minute after the window closes. Opened by the Lab's New (Sketch ▾ › New…, the sketch list's ＋ New sketch), the
// new-chat starter's "Start from something like…" chip, the director's ◎ mission of that name, or /gallery [words].
const LabGallery = (() => {
  const D = LabGalleryData;
  const KV = 'lab-gallery-thumbs';
  const W = 270; const H = 360; // the preview page (3:4): the pictures are taken from it at this size
  const MAX_CACHE = 500;
  const S = () => ThreeLab.scenes;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // a short fingerprint of what a card shows (a changed template / scene draws its picture again)
  const memo = new Map(); // item key → fingerprint (built-in and library code doesn't change while the app runs)
  const once = (key, fn) => () => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
  const sig = (s) => { let h = 2166136261; const t = String(s); for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  // ---------- the pictures, kept on disk ----------
  let cache = null; let saveT = 0;
  async function loadCache() { if (!cache) { try { cache = (await window.hub.kvGet(KV, {})) || {}; } catch { cache = {}; } } return cache; }
  function saveCache() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const keys = Object.keys(cache);
      if (keys.length > MAX_CACHE) for (const k of keys.sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0)).slice(0, keys.length - MAX_CACHE)) delete cache[k];
      window.hub.kvSet(KV, cache).catch(() => {});
    }, 1500);
  }

  // ---------- the one shared preview page ----------
  let host = null; let box = null; let parked = true; let parkT = 0;
  let run = null; // { id, drawn, errors: [], ids: Set } what the page runs now
  let shotWait = null; let statsLast = null; let seq = 0;
  function onMessage(m) {
    if (!run) return;
    if (m.type === 'error' && (!m.layer || run.ids.has(m.layer))) run.errors.push({ layer: run.names.get(m.layer) || m.layer || null, message: String(m.message || ''), line: m.line || null });
    // drawn: every layer of THIS run drew once (a late "stack drawn" of the run before doesn't count)
    else if (m.type === 'drawn' && run.ids.has(m.layer)) { run.got.add(m.layer); if (run.got.size >= run.ids.size) run.drawn = true; }
    else if (m.type === 'stack-drawn' && run.got.size) run.drawn = true;
    else if (m.type === 'stats') statsLast = m;
    else if (m.type === 'shot' && m.tag === 'thumb' && shotWait) { const fn = shotWait; shotWait = null; fn(m.dataUrl || null); }
  }
  function ensureBox() {
    clearTimeout(parkT);
    if (!host) {
      host = el('div', { class: 'lab-gal-stage', attrs: { 'aria-hidden': 'true' }, style: { width: `${W}px`, height: `${H}px` } });
      document.body.append(host);
      box = ThreeLab._sandbox(host, onMessage, () => '&dpr=1&cap=30');
    }
    if (parked) { parked = false; run = null; box.reload(); }
  }
  // nothing to draw for a while: the page goes blank (no GPU or CPU while the gallery is closed)
  function parkSoon(ms = 60000) { clearTimeout(parkT); parkT = setTimeout(() => { if (box && !dlg) { box.frame.src = 'about:blank'; parked = true; run = null; } }, ms); }
  // runs an item's layers on the page (the layers of the run before go); resolves once they drew (or failed / 8 s)
  async function show(item, { wait = 8000 } = {}) {
    ensureBox();
    const Ls = (await item.layers()).filter((L) => L.code);
    seq += 1;
    const specs = Ls.map((L, z) => ({ id: `gal${seq}_${z}`, code: L.code, z, slot: z, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', x: 0, y: 0, scale: 1, rotate: 0, overrides: null }));
    const mine = { id: item.key, drawn: false, errors: [], ids: new Set(specs.map((s) => s.id)), got: new Set(), names: new Map(specs.map((s) => [s.id, s.name])), layers: specs.length };
    run = mine;
    box.send({ type: 'tweak-init', values: {}, keys: {}, mods: {} });
    box.send({ type: 'run-layers', layers: specs });
    // a fresh page loads three.js first: the wait starts once it's up
    for (let i = 0; i < 150 && !box.ready && run === mine; i += 1) await sleep(100);
    const t0 = Date.now();
    while (run === mine && !mine.drawn && Date.now() - t0 < wait) {
      if (mine.errors.length && Date.now() - t0 > 1500) break;
      await sleep(80);
    }
    return mine;
  }
  const shot = () => new Promise((resolve) => {
    if (!box || parked) { resolve(null); return; }
    const prev = shotWait;
    const mine = (url) => { prev?.(url); resolve(url); };
    shotWait = mine;
    box.send({ type: 'screenshot', tag: 'thumb', max: Math.max(W, H) });
    setTimeout(() => { if (shotWait === mine) { shotWait = null; mine(null); } }, 8000);
  });

  // ---------- what the gallery lists ----------
  // item: { key, kind: start | scene | history | lib, group, name, desc, tags, picture() → url | null, layers() → [{ name, code, blend, opacity, filter }] }
  const libGroups = [['Backgrounds', 'Backgrounds'], ['Visualizers', 'Visualizers'], ['3D', '3D scenes'], ['Shaders', 'Shaders'], ['Particles', 'Particles'], ['Physics', 'Physics'], ['Type', 'Kinetic type'], ['Text & HUD', 'Text & HUD']];
  function startItems() {
    return D.STARTS.map((s) => {
      const mood = D.MOODS.find((m) => m.id === s.mood);
      let Ls = null;
      const layers = () => (Ls ||= D.layersOf(s));
      return { key: `b:${s.id}`, kind: 'start', id: s.id, group: s.mood, groupLabel: mood?.label || s.mood, name: s.name, desc: s.desc, tags: `${s.tags} ${mood?.label || ''}`, layers: async () => layers(), sig: once(`b:${s.id}`, () => sig(layers().map((L) => L.code).join('\n'))), count: () => layers().length };
    });
  }
  function libItems() {
    const out = [];
    for (const [cat, label] of libGroups) {
      for (const t of ThreeLayers.TEMPLATES.filter((x) => x.cat === cat)) {
        out.push({ key: `l:${t.id}`, kind: 'lib', id: t.id, group: `lib:${cat}`, groupLabel: label, name: t.name.replace(/^[^\w(]+\s*/u, ''), desc: t.desc || '', tags: `${t.tags || ''} ${cat}`, layers: async () => [{ name: t.name.replace(/^[^\w(]+\s*/u, ''), code: t.code }], sig: once(`l:${t.id}`, () => sig(t.code)) });
      }
    }
    if (typeof ThreeNodes !== 'undefined') {
      for (const p of ThreeNodes.presets()) {
        let code = null;
        const make = () => (code ??= ThreeNodes.compile(ThreeNodes.buildPreset(p.id)).code);
        out.push({ key: `n:${p.id}`, kind: 'lib', id: p.id, group: 'lib:nodes', groupLabel: 'Node presets', name: p.name, desc: p.desc || '', tags: 'nodes node graph', layers: async () => [{ name: p.name, code: make() }], sig: once(`n:${p.id}`, () => sig(make())) });
      }
    }
    for (const t of ThreeData.TEMPLATES) {
      out.push({ key: `k:${t.name}`, kind: 'lib', id: t.name, group: 'lib:sketches', groupLabel: 'Code sketches', name: t.name, desc: t.desc || '', tags: 'sketch code three.js example', layers: async () => [{ name: t.name, code: t.code }], sig: once(`k:${t.name}`, () => sig(t.code)), sketch: true });
    }
    return out;
  }
  function sceneItems() {
    const sc = S();
    if (!sc) return [];
    return [...sc.all()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 80).map((x) => ({
      key: `s:${x.id}`, kind: 'scene', id: x.id, group: 'yours', groupLabel: 'Your scenes', name: x.name, desc: `${sc.layersOf(x).length} layer${sc.layersOf(x).length === 1 ? '' : 's'} · ${fmtWhen(x.updatedAt)}`, tags: 'mine my saved',
      picture: () => sc.thumbOf(x.id), layers: async () => sc.layersOf(x).filter((L) => !L.precomp).map((L) => ({ name: L.name, code: L.code, blend: L.blend, opacity: L.opacity, visible: L.visible, filter: ThreeLayers.isFilter(L.code) })), sig: () => String(x.updatedAt || 0), current: x.id === sc.currentId(),
    }));
  }
  async function historyItems() {
    const out = [];
    const sc = S();
    let trash = [];
    try { trash = (await window.hub.kvGet('three-history', {}))?.trash || []; } catch { /* none */ }
    for (const t of trash.slice(0, 30)) {
      const Ls = t.layers?.length ? t.layers : [{ name: t.name, code: t.code }];
      out.push({ key: `h:${t.id}`, kind: 'history', id: t.id, group: 'history', groupLabel: 'From history', name: t.name, desc: `Deleted ${fmtWhen(t.deletedAt)}`, tags: 'deleted history trash old',
        picture: () => sc?.thumbOf(t.id) || null, layers: async () => Ls.filter((L) => !L.precomp).map((L) => ({ name: L.name, code: L.code, blend: L.blend, opacity: L.opacity, visible: L.visible, filter: ThreeLayers.isFilter(L.code || '') })), sig: () => String(t.deletedAt || 0) });
    }
    // how your recent scenes began (their first version in the time machine)
    const TH = window.ThreeHistory;
    if (TH?.list && sc) {
      for (const x of [...sc.all()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8)) {
        let first = null;
        try { const l = await TH.list(x.id); if (l.length >= 3) first = l[0]; } catch { /* no history */ }
        if (!first) continue;
        let thumb = null;
        try { thumb = (await TH.thumbs(x.id))?.[first.id] || null; } catch { /* none */ }
        out.push({ key: `v:${x.id}:${first.id}`, kind: 'history', id: first.id, scene: x.id, group: 'history', groupLabel: 'From history', name: `${x.name} · how it began`, desc: `The first version, ${fmtWhen(first.at)}`, tags: 'history version first began earlier',
          picture: () => thumb, layers: async () => ((await TH.stateOf(first.id, x.id))?.layers || []).filter((L) => !L.precomp).map((L) => ({ name: L.name, code: L.code, blend: L.blend, opacity: L.opacity, visible: L.visible, filter: ThreeLayers.isFilter(L.code || '') })), sig: () => first.id });
      }
    }
    return out;
  }
  function fmtWhen(at) {
    if (!at) return 'some time ago';
    const d = (Date.now() - at) / 1000;
    if (d < 90) return 'just now';
    if (d < 3600) return `${Math.round(d / 60)} min ago`;
    if (d < 86400) return `${Math.round(d / 3600)} h ago`;
    if (d < 86400 * 14) return `${Math.round(d / 86400)} days ago`;
    return new Date(at).toLocaleDateString();
  }

  // ---------- starting from one ----------
  const uniqueName = (name) => { const have = new Set((S()?.all() || []).map((x) => x.name)); let n = name; let i = 2; while (have.has(n)) { n = `${name} ${i}`; i += 1; } return n; };
  // how: 'scene' (a new scene from it, at the frame size on screen) | 'layer' (its layers on top of the scene on screen;
  // a starting point's look filters stay out so they don't restyle your scene)
  async function use(item, how = 'scene') {
    await ThreeLab.cmd({ show: true });
    const sc = S();
    const d = ThreeLab.director;
    if (!sc || !d) throw new Error('The Lab is not ready yet');
    const Ls = await item.layers();
    if (!Ls.length) throw new Error('Nothing to start from in it');
    if (how === 'layer') {
      const pick = Ls.length > 1 ? Ls.filter((L) => !L.filter) : Ls;
      for (const L of pick) await d.addLayer({ name: L.name, code: L.code, props: { ...(L.blend ? { blend: L.blend } : {}), ...(L.opacity != null ? { opacity: L.opacity } : {}) } }, 0.2);
      toast(`Added ${pick.length === 1 ? `"${pick[0].name}"` : `${pick.length} layers from "${item.name}"`} on top`, { timeout: 3000 });
      return { added: pick.map((L) => L.name) };
    }
    if (item.kind === 'scene' && sc.get(item.id)) { // your own scene: a copy, with its song, timeline and frame size
      const copy = sc.duplicate(item.id, uniqueName(`${item.name} copy`));
      d.openSketch(copy.id);
      return { scene: copy.name, id: copy.id };
    }
    const frame = sc.frameOf(sc.currentId());
    const layers = Ls.map((L, i) => ThreeLayers.defaults({ name: L.name, code: L.code, slot: i, color: ThreeLayers.COLORS[i % ThreeLayers.COLORS.length], ...(L.blend ? { blend: L.blend } : {}), ...(L.opacity != null ? { opacity: L.opacity } : {}), ...(L.visible === false ? { visible: false } : {}) }));
    const x = sc.create({ name: uniqueName(item.name), code: layers[0].code, layers, frame });
    d.openSketch(x.id);
    return { scene: x.name, id: x.id };
  }

  // ---------- the window ----------
  let dlg = null; let all = []; let filter = 'all'; let query = ''; let onPick = null; let picked = false;
  let io = null; const queue = []; let working = false; let hover = null; let hoverT = 0; let hideT = 0;
  const cards = new Map(); // key → { card, img, item }
  const groupsOf = () => [
    { id: 'all', label: 'All' },
    { id: 'starts', label: '✦ Starting points' },
    ...D.MOODS.map((m) => ({ id: m.id, label: `${m.icon} ${m.label}` })),
    { id: 'yours', label: 'Your scenes' },
    { id: 'history', label: 'History' },
    { id: 'lib', label: 'Library' },
  ];
  const inGroup = (it, g) => g === 'all' || (g === 'starts' && it.kind === 'start') || (g === 'lib' && it.kind === 'lib') || it.group === g;
  const STOP = new Set('a an the and or but of in on to for with from like something some me my it its this that make start starting want please kind sort bit more less very really just'.split(' '));
  const wordsOf = (q) => norm(q).split(/[\s,.!?;:]+/).filter((w) => w && !STOP.has(w));
  function matches(it, words) {
    if (!words.length) return true;
    const hay = norm(`${it.name} ${it.desc} ${it.tags} ${it.groupLabel}`);
    return words.every((w) => hay.includes(w));
  }
  async function open({ query: q0 = '', group = null, onPick: pickFn = null } = {}) {
    if (dlg) close();
    await loadCache();
    query = String(q0 || '').trim(); filter = group || 'all'; onPick = pickFn; picked = false;
    const search = el('input', { class: 'lab-gal-search', attrs: { type: 'search', placeholder: 'Search: tunnel, chrome, particles, retro, type…', 'aria-label': 'Search the starting points', spellcheck: 'false' }, value: query });
    search.value = query;
    const chips = el('div', { class: 'lab-gal-chips', attrs: { role: 'tablist' } });
    const body = el('div', { class: 'lab-gal-body', attrs: { tabindex: '-1' } });
    const count = el('span', { class: 'lab-gal-count muted small' });
    const frameNote = el('span', { class: 'muted small', text: frameLabel() });
    dlg = el('dialog', { class: 'lab-gal-dlg', attrs: { 'aria-label': 'Start from something' } },
      el('div', { class: 'lab-gal-head' }, el('h2', { text: 'Start from something like…' }), search, el('button', { type: 'button', class: 'ghost small lab-gal-x', title: 'Close (Esc)', text: '✕', on: { click: () => close() } })),
      chips,
      body,
      el('div', { class: 'lab-gal-foot' }, el('span', { class: 'muted small', text: 'Hover to preview · click: a new scene from it · ＋ Layer: add it to the scene on screen · right-click: more' }), el('span', { class: 'spacer' }), frameNote, count));
    const shade = el('div', { class: 'lab-gal-shade', on: { pointerdown: (e) => { e.preventDefault(); close(); } } });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target === search) { e.preventDefault(); const first = body.querySelector('.lab-gal-card'); if (first) pickCard(first.dataset.key, 'scene'); }
      else if (e.key === 'ArrowDown' && e.target === search) { e.preventDefault(); body.querySelector('.lab-gal-card')?.focus(); }
    });
    dlg.addEventListener('close', () => { shade.remove(); });
    document.body.append(shade, dlg);
    dlg.show();
    search.focus();
    const paintChips = () => {
      const have = new Set(all.flatMap((it) => [it.group, it.kind === 'start' ? 'starts' : null, it.kind === 'lib' ? 'lib' : null]));
      chips.replaceChildren(...groupsOf().filter((g) => g.id === 'all' || have.has(g.id)).map((g) => el('button', { type: 'button', class: `lab-gal-chip${g.id === filter ? ' on' : ''}`, attrs: { role: 'tab', 'aria-selected': String(g.id === filter) }, text: g.label, on: { click: () => { filter = g.id; paintChips(); paint(); body.scrollTop = 0; } } })));
    };
    let searchT = 0;
    search.addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => { query = search.value.trim(); paint(); body.scrollTop = 0; }, 120); });
    body.addEventListener('scroll', () => hidePreview(), { passive: true });
    all = [...startItems(), ...sceneItems()];
    paintChips(); paint();
    // the slower lists after the first paint (history reads the disk; the library is long)
    const more = [...libItems(), ...(await historyItems())];
    if (!dlg) return;
    all = [...startItems(), ...sceneItems(), ...more.filter((x) => x.kind === 'history'), ...more.filter((x) => x.kind === 'lib')];
    paintChips(); paint();

    function paint() {
      hidePreview();
      io?.disconnect();
      io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) want(e.target.dataset.key); }, { root: body, rootMargin: '200px 0px' });
      cards.clear(); queue.length = 0;
      const words = wordsOf(query);
      let list = all.filter((it) => inGroup(it, filter) && matches(it, words));
      // nothing has every word ("something like a pink neon tunnel"): the ones with the most of them, best first
      if (!list.length && words.length > 1) {
        list = all.filter((it) => inGroup(it, filter)).map((it) => [it, words.filter((w) => matches(it, [w])).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      }
      const sections = [];
      for (const it of list) {
        let s = sections.find((x) => x.id === it.group);
        if (!s) sections.push(s = { id: it.group, label: it.groupLabel, items: [] });
        s.items.push(it);
      }
      const nodes = [];
      for (const s of sections) {
        nodes.push(el('h3', { class: 'lab-gal-sec', text: s.label }));
        nodes.push(el('div', { class: 'lab-gal-grid' }, s.items.map(cardFor)));
      }
      if (!list.length) nodes.push(el('div', { class: 'lab-gal-empty muted', text: words.length ? `Nothing like "${query}" here. Try another word, or "All".` : 'Nothing here yet.' }));
      body.replaceChildren(...nodes);
      count.textContent = `${list.length} of ${all.length}`;
      for (const { card } of cards.values()) io.observe(card);
    }
  }
  function frameLabel() {
    const f = S()?.frameOf(S()?.currentId());
    const z = f && ThreeMedia.SIZES.find((x) => x.id === f);
    return z?.w ? `New scenes at ${z.id} (${z.w}×${z.h})` : '';
  }
  function cardFor(it) {
    const img = el('img', { class: 'lab-gal-img', attrs: { alt: '', draggable: 'false', decoding: 'async' } });
    const pic = el('div', { class: 'lab-gal-pic' }, img, el('span', { class: 'lab-gal-wait', text: '…' }));
    const url = pictureOf(it);
    if (url) { img.src = url; pic.classList.add('has'); }
    const layerBtn = el('button', { type: 'button', class: 'lab-gal-layer', title: 'Add it to the scene on screen, as layers', text: '＋ Layer', on: { click: (e) => { e.stopPropagation(); pickCard(it.key, 'layer'); } } });
    const card = el('button', { type: 'button', class: `lab-gal-card${it.current ? ' current' : ''}`, dataset: { key: it.key }, title: `${it.name}${it.desc ? `\n${it.desc}` : ''}`,
      on: {
        click: () => pickCard(it.key, 'scene'),
        contextmenu: (e) => { e.preventDefault(); hidePreview(); showMenu(e.clientX, e.clientY, menuFor(it)); },
        pointerenter: () => { clearTimeout(hoverT); hoverT = setTimeout(() => preview(it.key), 260); },
        pointerleave: () => { clearTimeout(hoverT); if (hover?.key === it.key) hidePreview(); },
        focus: () => { clearTimeout(hoverT); hoverT = setTimeout(() => preview(it.key), 500); },
        blur: () => { clearTimeout(hoverT); if (hover?.key === it.key) hidePreview(); },
        keydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stepFocus(e.currentTarget, 1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stepFocus(e.currentTarget, -1); } },
      } },
    pic, el('span', { class: 'lab-gal-name', text: it.name }), el('span', { class: 'lab-gal-desc', text: it.desc || '' }), layerBtn);
    cards.set(it.key, { card, img, pic, item: it });
    return card;
  }
  function stepFocus(card, d) { const list = [...dlg.querySelectorAll('.lab-gal-card')]; const i = list.indexOf(card); list[Math.max(0, Math.min(list.length - 1, i + d))]?.focus(); }
  function menuFor(it) {
    return [
      it.name,
      { label: it.kind === 'scene' ? '⧉ A new scene from a copy of it' : '✦ A new scene from it', action: () => pickCard(it.key, 'scene') },
      { label: '＋ Add it as layers on this scene', hint: 'on top of what you have', action: () => pickCard(it.key, 'layer') },
      it.kind === 'scene' && !it.current ? { label: 'Open it', action: () => { close(); ThreeLab.director?.openSketch(it.id); } } : null,
      typeof LabPacksHook !== 'undefined' ? LabPacksHook.galleryItem(it, () => cards.get(it.key)?.img?.src || null) : null, // (round 28) Share › Save as a pack
      { label: 'Draw its picture again', more: true, action: () => { delete cache[cacheKey(it)]; const c = cards.get(it.key); if (c) { c.img.removeAttribute('src'); c.pic.classList.remove('has'); } want(it.key, true); } },
    ].filter(Boolean);
  }
  async function pickCard(key, how) {
    const c = cards.get(key);
    if (!c) return;
    const it = c.item;
    picked = true;
    const fn = onPick;
    close();
    try {
      const r = await use(it, how);
      fn?.(it, how, r);
    } catch (err) { toast(err.message, { type: 'error' }); }
  }
  function close() {
    if (!dlg) return;
    const d = dlg; dlg = null;
    io?.disconnect(); io = null;
    queue.length = 0; cards.clear(); hidePreview();
    clearTimeout(hoverT);
    d.close(); d.remove();
    document.querySelector('.lab-gal-shade')?.remove();
    const fn = onPick; onPick = null;
    if (!picked) fn?.(null, null, null);
    parkSoon();
  }

  // ---------- pictures: drawn one at a time, for the cards in view ----------
  const cacheKey = (it) => `${it.key}|${it.sig()}`;
  function pictureOf(it) {
    const own = it.picture?.();
    if (own) return own;
    const c = cache?.[cacheKey(it)];
    return c?.url || null;
  }
  function want(key, front = false) {
    const c = cards.get(key);
    if (!c || c.pic.classList.contains('has') || queue.includes(key)) return;
    if (front) queue.unshift(key); else queue.push(key);
    pump();
  }
  async function pump() {
    if (working) return;
    working = true;
    try {
      while (dlg && queue.length) {
        if (hover) { await sleep(200); continue; }
        const key = queue.shift();
        const c = cards.get(key);
        if (!c || c.pic.classList.contains('has')) continue;
        c.pic.classList.add('drawing');
        const url = await draw(c.item);
        c.pic.classList.remove('drawing');
        if (url && cards.get(key) === c) { c.img.src = url; c.pic.classList.add('has'); }
        else if (!url && hover && cards.get(key) === c) queue.unshift(key); // a hover took the page: again after it
        else if (!url && cards.get(key) === c) { c.tries = (c.tries || 0) + 1; if (c.tries < 2) queue.push(key); else c.pic.classList.add('failed'); }
      }
    } finally { working = false; }
  }
  // one picture: the item runs on the page, a moment of motion, then a small JPEG (kept on disk)
  async function draw(it, { settle = 900 } = {}) {
    try {
      const r = await show(it);
      if (hover) return null; // a hover took the page: this one comes back later
      await sleep(r.errors.length ? 200 : settle);
      if (run !== r || hover) return null;
      const url = await shot();
      if (url) { cache[cacheKey(it)] = { url, at: Date.now() }; saveCache(); }
      return url;
    } catch { return null; }
  }

  // ---------- hover: the item plays on the shared page, laid over its card ----------
  async function preview(key) {
    const c = cards.get(key);
    if (!c || !dlg) return;
    clearTimeout(hideT);
    hover = { key };
    const me = hover;
    const r = run?.id === c.item.key && run.drawn ? run : await show(c.item, { wait: 6000 });
    if (hover !== me || !dlg) return;
    const rect = c.pic.getBoundingClientRect();
    if (!rect.width) return;
    host.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px) scale(${rect.width / W}, ${rect.height / H})`;
    host.classList.add('on');
    c.card.classList.add('previewing');
    // it plays a few seconds, then the card shows its picture again (a fresh one when it had none)
    hideT = setTimeout(async () => {
      if (hover !== me) return;
      if (!c.pic.classList.contains('has') && !r.errors.length) { const url = await shot(); if (url && cards.get(key) === c) { cache[cacheKey(c.item)] = { url, at: Date.now() }; saveCache(); c.img.src = url; c.pic.classList.add('has'); } }
      if (hover === me) hidePreview();
    }, 6000);
  }
  function hidePreview() {
    clearTimeout(hideT);
    if (hover) { cards.get(hover.key)?.card.classList.remove('previewing'); hover = null; }
    host?.classList.remove('on');
    if (queue.length) pump();
  }

  // ---------- checks: every built-in starting point runs without errors (dev/checks/gallery.js) ----------
  async function check({ ids = null, settle = 1200, small = true } = {}) {
    const out = [];
    queue.length = 0;
    for (let i = 0; i < 100 && working; i += 1) await sleep(100); // a picture being drawn finishes first
    ensureBox();
    if (small) { host.style.width = `${W / 2}px`; host.style.height = `${H / 2}px`; } // a quarter of the pixels: quicker on a software GPU
    for (const it of startItems().filter((x) => !ids || ids.includes(x.id))) {
      const Ls = await it.layers();
      const expect = D.STARTS.find((s) => s.id === it.id).layers.length;
      statsLast = null;
      const t0 = Date.now();
      const r = await show(it, { wait: 12000 });
      await sleep(settle);
      const url = await shot();
      let bright = null;
      if (url) bright = await brightness(url);
      out.push({ id: it.id, name: it.name, layers: Ls.length, missing: expect - Ls.length, drawn: r.drawn, errors: r.errors.slice(0, 4), music: Ls.some((L) => /\baudio\./.test(L.code)), sliders: Ls.reduce((n, L) => n + (L.code.match(/label: '/g) || []).length, 0), picture: Boolean(url), bright, calls: statsLast?.calls ?? null, ms: Date.now() - t0 });
    }
    host.style.width = `${W}px`; host.style.height = `${H}px`;
    parkSoon(5000);
    return out;
  }
  // the picture's mean brightness 0..255 (a black picture means nothing drew)
  function brightness(url) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => { const c = document.createElement('canvas'); c.width = 24; c.height = 32; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 24, 32); const d = g.getImageData(0, 0, 24, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3; resolve(Math.round(s / (d.length / 4))); };
      im.onerror = () => resolve(null);
      im.src = url;
    });
  }

  // ---------- chat ----------
  if (typeof Commands !== 'undefined' && !Commands.get('gallery')) {
    const names = () => [...D.STARTS.map((s) => s.name), ...D.MOODS.map((m) => m.label)];
    Commands.register({
      name: 'gallery', area: 'Three.js Lab', args: '[words | start <name> | layer <name>]',
      desc: 'Start from something like…: the Lab gallery of starting points (built-in scenes by mood, your scenes, history, the library); start <name> makes a new scene from one right away',
      complete: (a) => names().filter((n) => norm(n).includes(norm(a))).slice(0, 12).map((n) => ({ value: n })),
      async run(args, ctx) {
        const a = String(args || '').trim();
        const m = a.match(/^(start|layer)\s+(.+)$/i);
        if (m) {
          await loadCache();
          const w = norm(m[2]);
          const pool = [...startItems(), ...libItems()];
          const it = pool.find((x) => norm(x.name) === w) || pool.find((x) => norm(x.name).startsWith(w)) || pool.find((x) => matches(x, wordsOf(m[2])));
          if (!it) { ctx.say(`Nothing called "${m[2]}" in the gallery.`); return; }
          const r = await use(it, m[1].toLowerCase() === 'layer' ? 'layer' : 'scene');
          ctx.say(r.scene ? `New scene "${r.scene}" from "${it.name}".` : `Added ${r.added.join(', ')} on top.`);
          return;
        }
        if (a === 'list') { ctx.say(D.MOODS.map((mo) => `${mo.icon} ${mo.label}: ${D.STARTS.filter((s) => s.mood === mo.id).map((s) => s.name).join(', ')}`).join('\n')); return; }
        await ThreeLab.cmd({ show: true });
        open({ query: a });
      },
    });
  }

  return { open, close, use, check, show, items: () => [...startItems(), ...libItems(), ...sceneItems()], historyItems, get isOpen() { return Boolean(dlg); }, get previewing() { return hover?.key || null; }, cacheSize: () => Object.keys(cache || {}).length };
})();
