// Free asset libraries built into the asset library (round 24, assets stream): Poly Haven (HDRIs, textures, models:
// its public API, api.polyhaven.com) and ambientCG (CC0 PBR materials and HDRIs: its public API v2). No key, no
// account, no scraping: their JSON APIs answer in the main process (assetsmain.js), preview pictures are cached on
// disk, downloads land in Downloads/Hearth/<Source> with a progress bar and join the library tagged and credited
// (CC0). A Poly Haven model's glTF parts are packed into one .glb; an ambientCG zip is unpacked (its maps kept together).
//   AssetsFree.search(q, { source, type }) → [{ source, type, kind, id, name, tags, preview, page, sizes }]
//   AssetsFree.get({ source, id, type, size, result }) → the library item (downloaded, indexed)
//   AssetsFree.view(host, { q, source, type }) → paints the Free tab of the library panel into host
const AssetsFree = (() => {
  const C = AssetsCore;
  const api = () => window.hub.assets;
  const SRC = {
    polyhaven: { name: 'Poly Haven', types: { hdris: 'HDRIs', textures: 'Textures', models: 'Models' }, def: 'hdris' },
    ambientcg: { name: 'ambientCG', types: { materials: 'Materials', hdris: 'HDRIs' }, def: 'materials' },
  };
  const DEF_SIZE = { hdris: '2k', textures: '1k', materials: '1k', models: '1k' };
  let bases = null;
  async function base(source) { bases ||= await api().status(); return source === 'ambientcg' ? bases.acgBase : bases.polyBase; }
  async function json(url, who) { const r = await api().fetchJson(url); if (!r?.ok) throw new Error(`${who} didn't answer (${r?.error || 'offline?'})`); return r.value; }

  // ---------- search ----------
  const phCache = new Map(); // type → { at, json } (Poly Haven sends its whole list per type: kept 30 minutes)
  const byKey = new Map(); // 'source:id' → the last result (ambientCG's download list lives in it)
  async function search(q = '', { source = 'polyhaven', type = null } = {}) {
    const s = SRC[source] ? source : 'polyhaven';
    const t = type && SRC[s].types[type] ? type : SRC[s].def;
    let list;
    if (s === 'polyhaven') {
      let c = phCache.get(t);
      if (!c || Date.now() - c.at > 30 * 60000) { c = { at: Date.now(), json: await json(`${await base(s)}/assets?t=${t}`, 'Poly Haven') }; phCache.set(t, c); }
      list = C.polyList(c.json, q, t);
    } else {
      const u = `${await base(s)}/api/v2/full_json?type=${C.ACG_TYPES[t]}&limit=60&sort=Popular&include=downloadData,imageData,tagData${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      list = C.acgList(await json(u, 'ambientCG'), t);
    }
    for (const r of list) byKey.set(`${r.source}:${r.id}`, r);
    return list;
  }
  const previewOf = async (r) => { if (!r.preview) return null; const p = await api().preview(r.preview); return p?.ok ? p.path : null; };

  // ---------- download into the library ----------
  const jobs = new Map(); // download id → { onProgress }
  api()?.onEvent?.((ev) => { if (ev?.type === 'dl') jobs.get(ev.id)?.(ev); });
  let n = 0;
  async function get({ source = 'polyhaven', id, type = null, size = null, result = null, onProgress = null } = {}) {
    if (!id) throw new Error('Which one? (an id from /assets free <words>)');
    await Assets.ready();
    const s = SRC[source] ? source : 'polyhaven';
    let r = result || byKey.get(`${s}:${id}`);
    const t = type || r?.type || SRC[s].def;
    const res = String(size || store.get(`assets.size.${t}`, DEF_SIZE[t] || '1k')).toLowerCase();
    let files; let folder = null; let name = r?.name || id;
    if (s === 'polyhaven') {
      files = C.polyFiles(await json(`${await base(s)}/files/${encodeURIComponent(id)}`, 'Poly Haven'), t, res);
      if (files.length > 1) folder = `${id}_${res}`;
      if (!r) { try { const info = await json(`${await base(s)}/info/${encodeURIComponent(id)}`, 'Poly Haven'); name = info.name || id; r = { tags: [...(info.categories || []), ...(info.tags || [])].map(C.cleanTag).slice(0, 8), page: `https://polyhaven.com/a/${id}` }; } catch { /* the name stays the id */ } }
    } else {
      if (!r?.raw) { await search(id, { source: s, type: t }); r = byKey.get(`${s}:${id}`); }
      if (!r?.raw) throw new Error(`ambientCG has no "${id}"`);
      const d = C.acgFile(r.raw, res, t);
      const url = d?.downloadLink || d?.fullDownloadPath;
      if (!url) throw new Error(`No ${res.toUpperCase()} download for ${id}`);
      files = [{ url, rel: d.fileName || `${id}_${res}.zip`, size: d.size || 0, role: 'main' }];
    }
    if (!files.length) throw new Error(`No ${res} file for ${id}`);
    const dl = `dl${Date.now().toString(36)}${++n}`;
    if (onProgress) jobs.set(dl, onProgress);
    let out;
    try { out = await api().download({ id: dl, source: SRC[s].name, folder, files }); } finally { jobs.delete(dl); }
    if (!out?.ok) throw new Error(out?.error === 'cancelled' ? 'Cancelled' : `The download failed (${out?.error || 'offline?'})`);
    // the maps of a texture / material next to its color map (the Lab and the director can reach them)
    const maps = {};
    if (s === 'polyhaven' && t === 'textures') files.forEach((f, i) => { if (f.role !== 'main' && out.paths[i]) maps[f.role] = out.paths[i]; });
    if (s === 'ambientcg') for (const p of out.paths) { const role = C.mapRole(p); if (role && role !== 'main' && !maps[role]) maps[role] = p; }
    const kind = C.kindOf(out.main) || (t === 'hdris' ? 'hdri' : t === 'models' ? 'model' : 'image');
    const [it] = await Assets.add([out.main], { src: s, o: `${SRC[s].name} · ${id}`, n: name, k: kind, tg: [...(r?.tags || []), ...(t === 'materials' || t === 'textures' ? ['pbr'] : [])], i: { lic: 'CC0', res, page: r?.page || null, ...(Object.keys(maps).length ? { maps } : {}) } });
    store.set(`assets.size.${t}`, res);
    return it;
  }
  const cancel = (dl) => api().cancel(dl);

  // ---------- the Free tab (painted by assets-ui.js into the panel) ----------
  let state = { q: '', source: store.get('assets.free.source', 'polyhaven'), type: null };
  let seq = 0;
  function view(host, o = {}) {
    Object.assign(state, o);
    if (!SRC[state.source]) state.source = 'polyhaven';
    if (!state.type || !SRC[state.source].types[state.type]) state.type = SRC[state.source].def;
    const grid = el('div', { class: 'as-free-grid' });
    const note = el('div', { class: 'as-free-note' });
    const chip = (label, on, fn, tip = '') => el('button', { class: `as-chip${on ? ' on' : ''}`, text: label, title: tip, on: { click: fn } });
    const head = el('div', { class: 'as-free-head' },
      el('div', { class: 'as-chips' }, Object.entries(SRC).map(([k, v]) => chip(v.name, k === state.source, () => { state.source = k; state.type = null; store.set('assets.free.source', k); const q = document.querySelector('.as-panel .as-q'); if (q) q.placeholder = `Search ${v.name}… (brick, sunset, wood)`; view(host); }, k === 'polyhaven' ? 'polyhaven.com: free CC0 HDRIs, textures, models' : 'ambientcg.com: free CC0 PBR materials and HDRIs'))),
      el('div', { class: 'as-chips' }, Object.entries(SRC[state.source].types).map(([k, v]) => chip(v, k === state.type, () => { state.type = k; view(host); }))));
    host.replaceChildren(head, note, grid);
    const paint = async () => {
      const my = ++seq;
      note.textContent = 'Searching…';
      let list;
      try { list = await search(state.q, { source: state.source, type: state.type }); } catch (err) { if (my === seq) { note.textContent = calmError(err, { app: 'The asset library' }); grid.replaceChildren(); } return; }
      if (my !== seq) return;
      note.textContent = list.length ? `${list.length} free ${SRC[state.source].types[state.type].toLowerCase()} · CC0 · click: download (${(store.get(`assets.size.${state.type}`, DEF_SIZE[state.type]) || '1k').toUpperCase()}) into your library · right-click: size, page` : `Nothing for “${state.q}”. Try brick, wood, sunset, studio, metal…`;
      grid.replaceChildren(...list.map(card));
    };
    paint(); // (the library's one search box drives it: assets-ui.js)
  }
  function card(r) {
    const pic = el('div', { class: 'as-pic' }, el('span', { class: 'as-ico', text: C.KINDS[r.kind]?.icon || '▣' }));
    const bar = el('i', { class: 'as-bar', hidden: true });
    const d = el('div', { class: 'as-card as-free', title: `${r.name}\n${r.tags.join(', ')}`, tabIndex: 0 }, pic, el('b', { text: r.name }), el('small', { text: r.tags.slice(0, 3).join(' · ') || C.KINDS[r.kind]?.one }), bar);
    // the preview arrives when the card is on screen
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      previewOf(r).then((p) => { if (p) pic.replaceChildren(el('img', { src: Assets.fileUrl(p), alt: '', loading: 'lazy', decoding: 'async', draggable: false })); }).catch(() => {});
    });
    io.observe(d);
    const go = (size) => download(r, size, d, bar);
    d.addEventListener('click', () => go(null));
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(null); });
    d.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        ...(r.sizes.length ? r.sizes : ['1k', '2k', '4k']).slice(0, 5).map((s) => ({ label: `⤓ ${s.toUpperCase()}`, hint: s === (store.get(`assets.size.${r.type}`, DEF_SIZE[r.type])) ? 'default' : '', action: () => go(s) })),
        { label: '⤓ and use it now', hint: r.kind === 'hdri' ? 'the Lab\'s sky' : r.kind === 'model' ? 'a model layer' : 'a picture layer', action: () => go(null).then((it) => it && Assets.use(it).then((w) => toast(w, { timeout: 2600 }))).catch((err) => toast(err.message, { type: 'error' })) },
        '-',
        { label: `Its page on ${SRC[r.source].name}`, action: () => window.hub.openExternal(r.page) },
      ]);
    });
    return d;
  }
  async function download(r, size, cardEl, bar) {
    if (cardEl.classList.contains('busy')) return null;
    cardEl.classList.add('busy'); bar.hidden = false; bar.style.setProperty('--p', '0');
    try {
      const it = await get({ source: r.source, id: r.id, type: r.type, size, result: r, onProgress: (ev) => { const p = ev.total ? Math.min(1, ev.got / ev.total) : 0.5; bar.style.setProperty('--p', p.toFixed(3)); } });
      cardEl.classList.add('done');
      toast(`⤓ ${it.n} is in your library`, { timeout: 5000, action: { label: Assets.LABEL[Assets.labDefault(it)].replace(/^\S+\s/, 'Use: '), fn: () => Assets.use(it).then((w) => toast(w, { timeout: 2600 })).catch((err) => toast(err.message, { type: 'error' })) } });
      return it;
    } catch (err) { toast(err.message, { type: 'error', timeout: 6000 }); return null; } finally { cardEl.classList.remove('busy'); bar.hidden = true; }
  }

  return { search, get, cancel, view, previewOf, SRC, DEF_SIZE, get state() { return state; } };
})();
window.AssetsFree = AssetsFree;
