// 🔎 Lab search (round 36, labsearch): one box for everything the Lab can find. / in the Lab (or the toolbar's 🔎),
// a few words, one ranked list across:
//   · actions: every row of the Lab's own menus as they are right now (the preview's right-click with ✦ More and its
//     submenus, the toolbar's ⋯, Sketch ▾, the selected layer's right-click) and the Lab's Ctrl/⌘+K actions. Nothing is
//     copied: the rows are read from the menus (ThreeLab.search.menus(), LabEasy.layerItems) and Enter runs the row's
//     own function, exactly like a click on it
//   · effects, filters, looks, palettes, trigger presets, animations, eases, blends (the effects picker's catalog,
//     ThreeFX.items, with its small pictures) · this layer's saved looks
//   · the layers of this scene (Enter selects it) and their sliders (Enter shows that slider)
//   · 📐 My templates (Enter opens its form) · gallery starting points (Enter: a new scene from it) · recent scenes
//   · help: short "how do I…" answers and the Lab's keys
// Plain words and typos are LabSearchCore's (tools/three-search-core.js). Nothing matches: the last row puts your words
// in the Three Director's box (not sent). The index is built the first time the box opens (the menus again on each
// open, they change); the gallery and your templates join a moment later (their groups load on first use).
// Lazy group "labsearch"; its way in is tools/three-search-hook.js (in the lab group).
const LabSearch = (() => {
  const C = LabSearchCore;
  const S = () => ThreeLab.search;
  const RECENT = 'three.searchRecent';
  const MAX = 40;
  const last = { ms: 0, maxMs: 0, searches: 0, buildMs: 0, items: 0, query: '', ran: null, asked: null };
  let dlg = null; let input = null; let listEl = null; let foot = null; let anchor = null;
  let rows = []; let sel = 0; let results = [];
  let fixed = null; // the parts that don't change while the app runs: effects, help, keys (built once)
  let later = { gallery: null, templates: null, galleryPics: null }; // joined when their groups are in
  let fixedIx = null; let liveIx = null;
  const err = (e) => toast(e?.message || String(e), { type: 'error', timeout: 5000 });
  const clean = (s) => String(s ?? '').replace(/^✓\s*/, '').trim();

  // ---------- the sources ----------
  // a showMenu list ({ label, hint, key, items, action }) and a ThreeTweaks.menu / popMenu list ([label, hint, fn | rows, checked]),
  // walked into rows: { label, hint, path, run } (a submenu is a row too: Enter opens it)
  function walk(list, path, out, seen, depth = 0, kind = 'show') {
    if (depth > 4 || out.length > 1500) return;
    let arr;
    try { arr = typeof list === 'function' ? list() : list; } catch { return; }
    if (!Array.isArray(arr)) return; // (a submenu built later, e.g. from a promise: not listed)
    for (const it of arr || []) {
      if (!it || typeof it === 'string') continue;
      let label; let hint; let sub = null; let fn = null; let checked = false; let danger = false; let key = '';
      if (Array.isArray(it)) {
        [label, hint] = it; checked = Boolean(it[3]);
        if (Array.isArray(it[2])) sub = it[2]; else if (typeof it[2] === 'function') fn = it[2];
      } else {
        if (it.back || it.disabled || it.sep) continue;
        ({ label, hint, key = '' } = it); checked = Boolean(it.checked); danger = Boolean(it.danger);
        if (it.items) sub = it.items; else if (typeof it.action === 'function') fn = it.action;
      }
      label = clean(label);
      if (!label || label === '‹ back' || label === 'More…' || label === 'Customise this…') { if (sub) walk(sub, path, out, seen, depth + 1); continue; }
      // the same row in two menus (▦ All formats in ✦ More and the toolbar's ⋯) is listed once; short generic labels
      // ("9:16", "Off") only once per submenu
      const bare = C.fold(label.replace(/…$/, '')).trim();
      const k = C.words(bare).length >= 2 || bare.length >= 10 ? `|${bare}` : `${C.fold(path.at(-1) || '')}|${bare}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const where = path.join(' › ');
      if (sub) {
        out.push({ id: `a:${where}›${label}`, kind: 'action', label, hint: String(hint || ''), path: where, sub: true, run: () => openSub(label, sub, Array.isArray(it)) });
        walk(sub, [...path, label], out, seen, depth + 1);
      } else if (fn) {
        out.push({ id: `a:${where}›${label}`, kind: 'action', label, hint: [hint, key].filter(Boolean).join(' · '), path: where, checked, danger, run: () => fn(anchor?.isConnected ? anchor : undefined) });
      }
    }
  }
  function actionItems() {
    const out = []; const seen = new Set();
    const s = S();
    if (!s) return out;
    let m = {};
    try { m = s.menus(); } catch (e) { console.warn('lab search: menus', e); }
    walk(m.preview, ['Right-click the preview'], out, seen);
    walk(m.more, ['Toolbar ⋯'], out, seen);
    walk(m.sketch, ['Sketch ▾'], out, seen);
    // the selected layer's right-click (its handlers, so Enter does what the menu does)
    const L = s.layers().find((x) => x.selected);
    const lm = L && typeof LabEasy !== 'undefined' ? s.layerMenu(L.id) : null;
    if (lm) { try { walk(LabEasy.layerItems(lm.L, lm.h), [`Layer "${L.name}" (right-click)`], out, seen); } catch (e) { console.warn('lab search: layer menu', e); } }
    // the Lab's Ctrl/⌘+K actions (its sketches are recent scenes below)
    try {
      for (const c of Tools.get('three')?.commands || []) {
        if (/^Open sketch:/.test(c.label) || seen.has(`|${C.fold(c.label)}`)) continue;
        seen.add(`|${C.fold(c.label)}`);
        out.push({ id: `p:${c.label}`, kind: 'action', label: c.label.replace(/^Lab( console)?:\s*/, (x, y) => (y ? 'Console: ' : '')), hint: '', path: 'Ctrl/⌘+K', run: () => c.run() });
      }
    } catch { /* no palette actions */ }
    return out;
  }
  function liveItems() {
    const out = [];
    const s = S();
    if (!s) return out;
    for (const L of s.layers()) {
      out.push({ id: `l:${L.id}`, kind: 'layer', label: L.name, hint: `${L.selected ? 'selected · ' : ''}${L.visible ? '' : 'hidden · '}${L.filter ? 'filter layer' : 'layer'} in this scene`, path: 'Layers', tags: 'layer', color: L.color, run: () => jumpLayer(L.id) });
    }
    for (const x of s.sliders()) {
      out.push({ id: `s:${x.layerId}|${x.key}`, kind: 'slider', label: x.label, hint: `slider · ${x.layer}${x.group ? ` · ${x.group}` : ''}`, path: 'Sliders', tags: `${x.key} slider`, run: () => s.revealSlider(x.layerId, x.label) });
    }
    for (const name of s.looks()) out.push({ id: `k:${name}`, kind: 'look', label: name, hint: 'a saved look of this layer\'s sliders', path: 'Sliders › Looks', tags: 'look saved', run: () => s.applyLook(name) });
    const sc = ThreeLab.scenes;
    const cur = sc?.currentId();
    for (const x of [...(sc?.all() || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40)) {
      if (x.id === cur) continue;
      out.push({ id: `c:${x.id}`, kind: 'scene', label: x.name, hint: `your scene · ${when(x.updatedAt)}`, path: 'Your sketches', tags: 'scene sketch recent mine', pic: () => sc.thumbOf(x.id), run: () => sc.open(x.id) });
    }
    return out;
  }
  // the same name in two families ("VHS" the filter and "VHS" the palette): filters and layers first, the way the effects picker leans
  const FX_BOOST = { filter: 0.12, layer: 0.1, look: 0.06, palette: 0, animate: 0, trigger: -0.05, blend: -0.05, ease: -0.1 };
  function fixedItems() {
    const out = [];
    if (typeof ThreeFX !== 'undefined') {
      for (const it of ThreeFX.items('all')) {
        if (it.action) continue;
        const kl = ThreeFX.KIND_LABEL[it.kind] || it.kind;
        out.push({ id: `f:${it.kind}:${it.id}`, kind: 'fx', label: it.name, hint: `${kl} · ${it.cat || ''}${it.desc ? ` · ${String(it.desc).slice(0, 90)}` : ''}`, path: `Effects › ${kl}`, tags: `${it.tags || ''} ${kl} effect add apply`, fx: it, boost: FX_BOOST[it.kind] || 0, run: (o) => ThreeFX.apply(it, o) });
      }
    }
    for (const h of C.HELP) out.push({ id: `h:${h.title}`, kind: 'help', label: h.title, hint: h.text.slice(0, 110), path: 'Help', tags: h.tags, help: h, run: () => showHelp(h) });
    if (typeof Keys !== 'undefined') {
      for (const [area, lines] of Keys.groups(true)) {
        if (!/^(Lab|Present|Director dock)/.test(area)) continue;
        for (const k of lines) out.push({ id: `y:${area}|${k.keys}`, kind: 'key', label: k.what, hint: `${k.keys} · ${area}`, path: 'Keys', tags: `key shortcut ${k.keys}`, run: () => (k.run ? k.run() : (typeof KeysUI !== 'undefined' ? KeysUI.open() : toast(`${k.keys}: ${k.what}`))) });
      }
    }
    return out;
  }
  // the gallery's starting points and My templates: their groups load the first time the box opens
  async function loadLater() {
    const jobs = [];
    if (typeof Lazy !== 'undefined' && !later.gallery) {
      jobs.push(Lazy.load('gallery').then(async () => {
        const its = LabGallery.items().filter((x) => x.kind !== 'scene');
        let pics = {};
        try { pics = (await window.hub.kvGet('lab-gallery-thumbs', {})) || {}; } catch { /* no pictures yet */ }
        const byKey = new Map(Object.entries(pics).map(([k, v]) => [k.split('|')[0], v?.url]));
        later.gallery = its.map((g) => ({ id: `g:${g.key}`, kind: 'gallery', label: g.name, hint: `start from · ${g.groupLabel || ''}${g.desc ? ` · ${g.desc}` : ''}`, path: 'Gallery (Sketch ▾ › New…)', tags: `${g.tags || ''} gallery start starting point new scene`, pic: () => byKey.get(g.key) || null, run: () => LabGallery.use(g) }));
      }).catch(() => { later.gallery = []; }));
    }
    const nTpl = typeof LabTemplatesHook !== 'undefined' ? LabTemplatesHook.count() : 0;
    if (nTpl && typeof Lazy !== 'undefined' && !later.templates) {
      jobs.push(Lazy.load('labtemplates').then(async () => {
        const all = await LabTemplates.list();
        later.templates = all.map((t) => ({ id: `t:${t.id}`, kind: 'template', label: t.name, hint: `my template · ${t.fields?.length || 0} fields to fill in`, path: '📐 My templates', tags: `template my own ${(t.fields || []).map((f) => f.label).join(' ')}`, pic: () => t._thumb || null, run: () => LabTemplates.form(t) }));
      }).catch(() => { later.templates = []; }));
    }
    if (!jobs.length) return;
    await Promise.all(jobs);
    fixedIx = C.build([...fixed, ...(later.gallery || []), ...(later.templates || [])]);
    if (dlg) render(); // the list grows under the words already typed
  }
  function buildIndex() {
    const t0 = performance.now();
    if (!fixed) { fixed = fixedItems(); fixedIx = C.build([...fixed, ...(later.gallery || []), ...(later.templates || [])]); }
    liveIx = C.build([...actionItems(), ...liveItems()]);
    last.buildMs = Math.round((performance.now() - t0) * 10) / 10;
    last.items = fixedIx.items.length + liveIx.items.length;
  }

  // ---------- searching ----------
  const recentMap = () => { try { return new Map((store.get(RECENT, []) || []).map((id, i) => [id, i])); } catch { return new Map(); } };
  function find(q, limit = MAX) {
    const recent = recentMap();
    const a = C.search(liveIx, q, { limit, recent });
    const b = C.search(fixedIx, q, { limit, recent });
    return [...a, ...b].sort((x, y) => y.score - x.score).slice(0, limit);
  }
  // nothing typed yet: what you picked lately, then the layers and a few useful starting rows
  function startList() {
    const ids = store.get(RECENT, []) || [];
    const all = new Map([...liveIx.items, ...fixedIx.items].map((it) => [it.id, it]));
    const out = ids.map((id) => all.get(id)).filter(Boolean).slice(0, 6);
    for (const it of liveIx.items) if (it.kind === 'layer' && out.length < 14 && !out.includes(it)) out.push(it);
    return out.map((item) => ({ item, score: 0 }));
  }

  // ---------- the box ----------
  const KIND_TEXT = { action: 'Action', layer: 'Layer', slider: 'Slider', look: 'Look', template: 'My template', gallery: 'Gallery', scene: 'Scene', help: 'Help', key: 'Key', ask: 'Director' };
  function pic(it) {
    if (it.fx && typeof ThreeFX !== 'undefined' && ThreeFX.thumb) {
      const t = ThreeFX.thumb(it.fx);
      if (t._load) { const u = ThreeFX.thumbCached?.(it.fx.id); const img = t.querySelector('img'); if (u && img) img.src = u; t._load = null; }
      t.classList.add('ls-pic');
      return t;
    }
    const url = it.pic?.();
    if (url) return el('span', { class: 'ls-pic ls-img' }, el('img', { src: url, alt: '' }));
    const icon = { action: it.sub ? '›' : '▸', layer: '▤', slider: '⇆', look: '◑', template: '📐', gallery: '🖼', scene: '◫', help: '?', key: '⌨', ask: '✦' }[it.kind] || '•';
    return el('span', { class: `ls-pic ls-icon ls-k-${it.kind}`, text: icon, style: it.color ? { borderColor: it.color } : {} });
  }
  // where it lives, then what it is, each part once ("Effects › Filter · Blur & light · Soft bloom…", not "· Filter · Filter")
  function hintOf(it) {
    const parts = []; const seen = new Set(C.fold(it.path || '').split(' › ').map((x) => x.trim()));
    for (const p of String(it.hint || '').split(' · ')) { const k = C.fold(p).trim(); if (!k || seen.has(k)) continue; seen.add(k); parts.push(p.trim()); }
    return [it.path, ...parts].filter(Boolean).join(' · ');
  }
  // rows are made once per item while the box is open and reused as the words change (their pictures are the slow part)
  let rowCache = new Map();
  function rowEl(r, i) {
    const it = r.item;
    let b = it.kind !== 'ask' ? rowCache.get(it.id) : null;
    if (b) { b.dataset.i = String(i); b.classList.remove('on'); return b; }
    b = el('button', { type: 'button', class: `ls-row${it.danger ? ' ls-danger' : ''}`, dataset: { kind: it.kind, i: String(i) }, attrs: { role: 'option' },
      on: { click: (e) => pick(Number(e.currentTarget.dataset.i), e.shiftKey), mousemove: (e) => { const k = Number(e.currentTarget.dataset.i); if (sel !== k) mark(k); } } },
    pic(it),
    el('span', { class: 'ls-text' },
      el('span', { class: 'ls-label', text: `${it.checked ? '✓ ' : ''}${it.label}` }),
      el('span', { class: 'ls-hint', text: hintOf(it) })),
    el('span', { class: 'ls-kind', text: it.kind === 'fx' ? (ThreeFX?.KIND_LABEL?.[it.fx.kind] || 'Effect') : KIND_TEXT[it.kind] || '' }));
    if (it.kind !== 'ask') rowCache.set(it.id, b);
    return b;
  }
  function askRow(q) {
    return { item: { id: 'ask', kind: 'ask', label: `Ask the director: ${q}`, hint: 'puts your words in its box (not sent)', path: '', run: () => askDirector(q) }, score: -1 };
  }
  function render() {
    const t0 = performance.now();
    const q = input.value.trim();
    results = q ? find(q) : startList();
    if (q) results.push(askRow(q));
    sel = Math.min(sel, Math.max(0, results.length - 1));
    if (!q) sel = 0;
    rows = results.map(rowEl);
    listEl.replaceChildren(...rows);
    if (rows[sel]) rows[sel].classList.add('on');
    foot.textContent = q ? `${results.length - 1 >= MAX ? `${MAX}+` : results.length - 1 || 'Nothing'} found · ↑↓ · Enter${results[sel]?.item.kind === 'fx' ? ' · Shift+Enter: the other way' : ''} · Esc` : `${last.items} things in the Lab · type a few words (plain words and typos are fine)`;
    const ms = performance.now() - t0;
    last.ms = Math.round(ms * 100) / 100; last.maxMs = Math.max(last.maxMs, last.ms); last.searches += 1; last.query = q;
  }
  function mark(i) {
    rows[sel]?.classList.remove('on');
    sel = Math.max(0, Math.min(results.length - 1, i));
    rows[sel]?.classList.add('on');
    rows[sel]?.scrollIntoView({ block: 'nearest' });
  }
  function remember(id) {
    if (!id || id === 'ask') return;
    try { const l = (store.get(RECENT, []) || []).filter((x) => x !== id); l.unshift(id); store.set(RECENT, l.slice(0, 20)); } catch { /* storage off */ }
  }
  async function pick(i, alt = false) {
    const r = results[i];
    if (!r) return;
    const it = r.item;
    last.ran = { id: it.id, kind: it.kind, label: it.label };
    remember(it.id);
    if (typeof Usage !== 'undefined') Usage.track?.(`Lab search › ${KIND_TEXT[it.kind] || 'Effect'}`, { area: 'Lab search', label: KIND_TEXT[it.kind] || 'Effect' });
    close();
    // after the box is gone (a row may open a menu, a dialog or a picker of its own)
    await new Promise((res) => setTimeout(res, 0));
    try { await it.run(it.kind === 'fx' ? { alt } : undefined); } catch (e) { err(e); }
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(sel + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); mark(sel - 1); } else if (e.key === 'PageDown') { e.preventDefault(); mark(sel + 8); } else if (e.key === 'PageUp') { e.preventDefault(); mark(sel - 8); } else if (e.key === 'Enter') { e.preventDefault(); pick(sel, e.shiftKey); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (input.value) { input.value = ''; render(); } else close(); }
  }
  function open({ query = '', from = null } = {}) {
    anchor = from || anchor;
    if (dlg) { input.focus(); input.select(); if (query) { input.value = query; render(); } return dlg; }
    buildIndex();
    input = el('input', { type: 'search', class: 'ls-input', placeholder: 'Search the Lab: an effect, an action, a layer, a template… (plain words are fine)', value: query, attrs: { 'aria-label': 'Search the Lab', spellcheck: 'false', autocomplete: 'off' } });
    listEl = el('div', { class: 'ls-list', attrs: { role: 'listbox' } });
    foot = el('div', { class: 'ls-foot muted small' });
    dlg = el('dialog', { class: 'ls-dlg', attrs: { 'aria-label': 'Lab search' } },
      el('div', { class: 'ls-head' }, el('span', { class: 'ls-glass', text: '🔎' }), input),
      listEl, foot);
    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', onKey);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.body.append(dlg);
    dlg.showModal();
    render();
    input.focus();
    loadLater().catch(() => {});
    warm();
    return dlg;
  }
  // the first searches on a fresh index are the slow ones (the engine hasn't compiled them yet): a few silent ones
  // while you start typing, in idle moments
  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    const qs = ['a', 'm', 'glow', 'vertical video', 'make it brighter', 'partcles', 'fx'];
    const next = () => { const q = qs.shift(); if (!q || !liveIx) return; try { find(q); } catch { /* only a warm-up */ } (window.requestIdleCallback || setTimeout)(next); };
    (window.requestIdleCallback || setTimeout)(next);
  }
  function close() { if (!dlg) return; try { dlg.close(); } catch { /* closed */ } dlg.remove(); dlg = null; rows = []; rowCache = new Map(); }

  // ---------- what the rows do ----------
  function openSub(label, items, tuple) {
    const r = (anchor?.isConnected ? anchor : S()?.pane)?.getBoundingClientRect?.() || { left: innerWidth / 2 - 150, bottom: 80, right: innerWidth / 2 + 150 };
    if (tuple) ThreeTweaks.menu(Math.max(8, r.right - 300), r.bottom + 4, [label, ...(typeof items === 'function' ? items() : items)]);
    else showMenu(Math.max(8, r.right - 300), r.bottom + 4, typeof items === 'function' ? items() : items);
  }
  function jumpLayer(id) {
    const s = S();
    if (!s?.selectLayer(id)) throw new Error('That layer is gone');
    requestAnimationFrame(() => {
      const row = s.pane.querySelector(`.ly-row[data-id="${CSS.escape(id)}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'nearest' });
      row.classList.remove('ls-flash'); void row.offsetWidth; row.classList.add('ls-flash');
      setTimeout(() => row.classList.remove('ls-flash'), 1300);
    });
  }
  async function showHelp(h) {
    const go = h.go ? [...(liveIx?.items || []), ...(fixedIx?.items || [])].find((it) => it.kind === 'action' && it.label === h.go) : null;
    if (!go) { await Modal.alert(h.title, h.text); return; }
    if (await Modal.confirm(h.title, h.text, { ok: `${h.go.replace(/…$/, '')}` })) await go.run();
  }
  const when = (at) => { const d = (Date.now() - (at || 0)) / 1000; if (!at) return 'some time ago'; if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`; if (d < 86400) return `${Math.round(d / 3600)} h ago`; return `${Math.round(d / 86400)} days ago`; };
  // nothing found: your words in the Three Director's box, not sent (the director is made when there is none, like 🩺 does)
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function askDirector(q) {
    let dir = directorOf();
    if (!dir) {
      await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'labsearch', say: () => {}, note: () => {} });
      for (let i = 0; i < 50 && !directorOf(); i += 1) await new Promise((r) => setTimeout(r, 100));
      dir = directorOf();
      if (!dir) throw new Error('No Three Director to ask (toolbar ⋯ › Director › Make the Three Director).');
    }
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    const there = () => [...document.querySelectorAll('.composer textarea')].some((t) => t.value === q);
    for (let i = 0; i < 12 && !there(); i += 1) { Native.setDraft?.(dir.id, q); if (!there()) await new Promise((r) => setTimeout(r, 150)); }
    last.asked = { agent: dir.id, text: q, filled: there() };
    if (!there()) { navigator.clipboard?.writeText(q).catch(() => {}); toast('Copied your words for the director (its chat isn\'t open): paste them there', { timeout: 4000 }); return q; }
    toast(`In ${dir.name}'s box, not sent: press Enter when it reads right`, { timeout: 3500 });
    return q;
  }

  // ---------- chat ----------
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('lab-search')) return;
    Commands.register({
      name: 'lab-search', aliases: ['lab-find'], area: 'Three.js Lab', args: '[words]',
      desc: 'Search everything in the Lab (actions in its menus, effects, looks, layers, sliders, your templates, starting points, scenes, help) in plain words; alone: the search box (/ in the Lab)',
      keywords: 'find search lab where is how do i menu effect action layer template',
      examples: ['/lab-search', '/lab-search glow', '/lab-search vertical video'],
      async run(args, ctx = {}) {
        const q = String(args || '').trim();
        await ThreeLab.cmd({ show: ctx.source !== 'code' });
        if (ctx.source === 'code') {
          buildIndex();
          await loadLater().catch(() => {});
          const r = q ? find(q, 8) : [];
          return r.length ? r.map((x) => `${x.item.label} (${KIND_TEXT[x.item.kind] || 'Effect'}${x.item.path ? `: ${x.item.path}` : ''})`).join('\n') : `Nothing in the Lab for "${q}".`;
        }
        open({ query: q });
        return '';
      },
    });
  }
  function actions() { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Search the Lab (/)', () => ThreeLab.cmd({ show: true }).then(() => open())); }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, close, find, buildIndex, loadLater, pick, askDirector, last, get isOpen() { return Boolean(dlg); }, get results() { return results.map((r) => ({ id: r.item.id, kind: r.item.kind, label: r.item.label, path: r.item.path, score: r.score })); }, input: () => input };
})();
