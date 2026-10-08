// FX picker for the Three.js Lab: one searchable, keyboard-driven list of everything the FX pack adds —
// layer templates, filters, looks, palettes, trigger presets, one-click animations, keyframe eases and blend
// presets — with live filter thumbnails (rendered from your own picture in the sandbox), favorites (★),
// recent items and 🎲 surprise. Opens from the Layers "＋ Layer" button, the X key in the Lab, Ctrl+K and
// chat commands (tools/three-fx-cmds.js). Applying goes through the Lab's director API (ThreeLab.director).
//
//   ThreeFX.openPicker(kind?, { query?, anchor? })  kind: 'add' | 'all' | 'layer' | 'filter' | 'look' | 'palette' | 'trigger' | 'animate' | 'ease' | 'blend'
//   ThreeFX.items(kind?) → [{ kind, id, name, cat, desc }]   ThreeFX.find(kind, text) → item | null
//   ThreeFX.apply(item, { alt })   ThreeFX.surprise(kind?)
const ThreeFX = (() => {
  const TABS = [
    ['add', 'Add', 'Layers and filters'], ['layer', 'Layers', 'Ready-made visuals'], ['filter', 'Filters', 'Change everything below'],
    ['look', 'Looks', 'Colors + filters in one click'], ['palette', 'Palettes', 'Sketch colors'], ['trigger', 'Triggers', 'What makes kick / snare / hats fire'],
    ['animate', 'Animate', 'One-click keyframes for the selected layer'], ['ease', 'Eases', 'How keyframes move'], ['blend', 'Blends', 'How the selected layer mixes'], ['all', 'All', 'Everything'],
  ];
  const KIND_LABEL = { layer: 'Layer', filter: 'Filter', look: 'Look', palette: 'Palette', trigger: 'Trigger preset', animate: 'Animation', ease: 'Ease', blend: 'Blend' };
  const ICON = { Shapes: '◇', Backgrounds: '▦', Visualizers: '▮', 'Text & HUD': 'T', Social: '◫', '3D': '⬢' };
  const norm = (s) => String(s || '').toLowerCase();
  const CAT_ORDER = ['Glitch', 'Film', 'Color', 'LUT', 'Stylize', 'Distort', 'Blur & light', 'Feedback', 'Beat', 'Frame', 'Forgeheart', 'Cinematic', 'Retro', 'Neon', 'Dreamy', 'Art', 'Mono', 'Social'];

  // ---------- the catalog ----------
  function items(kind = 'all') {
    const out = [];
    const want = (k) => kind === 'all' || kind === k || (kind === 'add' && (k === 'layer' || k === 'filter'));
    if (want('layer')) for (const t of ThreeLayers.TEMPLATES) out.push({ kind: 'layer', id: t.id, name: t.name, cat: t.cat || 'Shapes', desc: t.desc, tags: t.tags || '', colors: (t.code.match(/#[0-9a-f]{6}\b/gi) || []).slice(0, 3) });
    if (want('filter')) for (const t of ThreeLayers.FILTERS) out.push({ kind: 'filter', id: t.id, name: t.name, cat: t.cat || 'Stylize', desc: t.desc, tags: t.tags || '', type: t.type });
    if (want('look')) for (const l of ThreeFXData.LOOKS) out.push({ kind: 'look', id: l.name, name: l.name, cat: l.cat, desc: l.desc, tags: l.fx.map((f) => f.id).join(' '), colors: l.colors, look: l });
    if (want('palette')) for (const p of ThreeFXData.PALETTES) out.push({ kind: 'palette', id: p.name, name: p.name, cat: p.cat, desc: p.colors.join(' '), colors: p.colors });
    if (want('trigger')) for (const [name, p] of Object.entries(ThreeTriggers.PRESETS || {})) out.push({ kind: 'trigger', id: name, name: name.replace(/^◆ /, ''), cat: name.startsWith('◆') ? 'Behavior' : 'Genre', desc: name.startsWith('◆') ? 'Changes how the triggers behave' : 'Bands and timing for this style', preset: p });
    if (want('animate')) for (const p of ThreeLayers.PRESETS) out.push({ kind: 'animate', id: p.id, name: p.name, cat: 'Animate', desc: p.desc });
    if (want('ease')) for (const e of ThreeFXData.EASES) out.push({ kind: 'ease', id: e.id, name: e.name, cat: 'Eases', desc: e.desc });
    if (want('blend')) for (const b of ThreeFXData.BLEND_PRESETS) out.push({ kind: 'blend', id: b.name, name: b.name, cat: 'Blends', desc: `${b.desc} (${b.blend} ${Math.round(b.opacity * 100)}%)`, preset: b });
    return out;
  }
  const keyOf = (it) => `${it.kind}:${it.id}`;
  function score(it, q) {
    if (!q) return 1;
    const n = norm(it.name); const all = `${n} ${norm(it.cat)} ${norm(it.desc)} ${norm(it.tags)} ${norm(it.id)}`;
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.every((w) => all.includes(w))) return 0;
    return (n === q ? 100 : 0) + (n.startsWith(q) ? 50 : 0) + (n.includes(q) ? 20 : 0) + (norm(it.cat).includes(q) ? 5 : 0) + 1;
  }
  function find(kind, text) {
    const q = norm(text).trim();
    if (!q) return null;
    const list = items(kind);
    return list.find((it) => norm(it.name) === q || norm(it.id) === q) || list.map((it) => [it, score(it, q)]).filter((x) => x[1]).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  // ---------- favorites and recent ----------
  const favs = () => new Set(store.get('three.fx.favs', []));
  function toggleFav(it) {
    const f = favs(); const k = keyOf(it);
    if (f.has(k)) f.delete(k); else f.add(k);
    store.set('three.fx.favs', [...f]);
    return f.has(k);
  }
  const recent = () => store.get('three.fx.recent', []);
  const pushRecent = (it) => store.set('three.fx.recent', [keyOf(it), ...recent().filter((k) => k !== keyOf(it))].slice(0, 16));

  // ---------- the Lab ----------
  async function lab() {
    if (!ThreeLab.director) {
      ThreeLab.act('noop');
      for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    }
    const d = ThreeLab.director;
    if (!d) throw new Error('The Three.js Lab is not ready yet');
    return d;
  }
  const selected = (d) => d.layers().layers.find((L) => L.selected) || null;
  const indexOfSel = (d) => { const ls = d.layers().layers; const i = ls.findIndex((L) => L.selected); return i < 0 ? ls.length : i; };
  const LOOK_MARK = '✦ ';

  async function recolor(d, colors) {
    const L = selected(d);
    if (!L || L.kind) return 0;
    const ctl = d.sliders(L.id).sliders.filter((c) => typeof c.value === 'string' && /^#[0-9a-f]{6}$/i.test(c.value));
    if (!ctl.length) return 0;
    d.sliders(L.id, Object.fromEntries(ctl.map((c, i) => [c.key, colors[i % colors.length]])));
    return ctl.length;
  }

  // Applies an item. alt = the Shift+Enter variant (see hint()).
  async function apply(it, { alt = false } = {}) {
    const d = await lab();
    pushRecent(it);
    (typeof Usage !== 'undefined') && Usage.track?.(`Lab FX › ${KIND_LABEL[it.kind]}: ${it.name}`);
    const say = (text) => { toast(text, { timeout: 2200 }); return text; };
    if (it.kind === 'layer') {
      const r = await d.addLayer({ template: it.id, ...(alt ? { position: indexOfSel(d) + 2 } : {}) }, 1);
      return say(`Added "${r.added}"${alt ? ' above the selected layer' : ''}`);
    }
    if (it.kind === 'filter') {
      const r = await d.addLayer({ template: it.id, ...(alt ? {} : { position: indexOfSel(d) + 2 }) }, 1);
      return say(`Filter "${r.added}" added ${alt ? 'on top of everything' : 'above the selected layer'}: it changes the layers below it`);
    }
    if (it.kind === 'palette') {
      d.refs.setPalette(it.colors);
      const n = alt ? 0 : await recolor(d, it.colors);
      return say(`Palette "${it.name}"${n ? `, ${n} color slider${n === 1 ? '' : 's'} recolored (↶ in Sliders to undo)` : ''}`);
    }
    if (it.kind === 'look') {
      const l = it.look;
      d.refs.setPalette(l.colors);
      const n = await recolor(d, l.colors);
      if (alt) return say(`Look "${l.name}": colors only${n ? ` (${n} sliders)` : ''}`);
      // a look's filters replace the previous look's (layers named "✦ …")
      for (const L of d.layers().layers.filter((x) => x.name.startsWith(LOOK_MARK))) await d.removeLayer(L.id);
      for (const f of l.fx) {
        const t = ThreeLayers.FILTERS.find((x) => x.id === f.id);
        if (!t) continue;
        await d.addLayer({ name: `${LOOK_MARK}${t.name}`, code: ThreeLayers.filterCode(f.id, f.values) }, 1);
      }
      return say(`Look "${l.name}": ${l.fx.length} filter layer${l.fx.length === 1 ? '' : 's'} (✦) + palette${n ? `, ${n} color sliders` : ''}`);
    }
    if (it.kind === 'trigger') {
      d.triggers(it.preset);
      return say(`Triggers: ${it.name} (Auto bars in ⚡ Triggers fits the bars to the song)`);
    }
    const L = selected(d);
    if (!L) throw new Error('Select a layer first');
    if (it.kind === 'animate') {
      d.applyPreset(L.id, it.id);
      return say(`"${it.name}" on ${L.name}`);
    }
    if (it.kind === 'blend') {
      await d.updateLayer(L.id, { blend: it.preset.blend, opacity: it.preset.opacity }, 0.3);
      return say(`${L.name}: ${it.name}`);
    }
    if (it.kind === 'ease') {
      let n = 0;
      for (const [prop, list] of Object.entries(L.keyframes || {})) {
        const keys = list.map((s) => /^([\d.]+)s=(.+?)(?: \((\w+)\))?$/.exec(s)).filter(Boolean).map((m) => ({ time: Number(m[1]), value: /^-?[\d.e+-]+$/.test(m[2]) ? Number(m[2]) : m[2] === 'true' ? true : m[2] === 'false' ? false : m[2], ease: it.id }));
        if (keys.length < 2) continue;
        d.setKeyframes(L.id, prop.replace(/^slider /, ''), keys);
        n += keys.length;
      }
      if (!n) throw new Error(`"${L.name}" has no keyframes yet (◇ next to a setting adds one, or try Animate)`);
      return say(`${L.name}: ${n} keyframes now ease "${it.name}"`);
    }
    return '';
  }
  const hint = (it) => ({
    layer: 'Enter: add on top · Shift+Enter: add above the selected layer',
    filter: 'Enter: add above the selected layer · Shift+Enter: on top of everything',
    look: 'Enter: palette + recolor + filters · Shift+Enter: colors only',
    palette: 'Enter: palette + recolor the selected layer · Shift+Enter: palette only',
    trigger: 'Enter: set the trigger bands and timing',
    animate: 'Enter: add these keyframes to the selected layer',
    ease: 'Enter: every keyframe of the selected layer uses this ease',
    blend: 'Enter: set the selected layer\'s blend and opacity',
  }[it?.kind] || '');

  async function surprise(kind = 'all') {
    const list = items(kind === 'add' ? 'filter' : kind).filter((it) => !['ease', 'animate'].includes(it.kind) || kind === it.kind);
    const it = list[Math.floor(Math.random() * list.length)];
    if (!it) return '';
    const msg = await apply(it);
    return `🎲 ${KIND_LABEL[it.kind]}: ${it.name}. ${msg}`;
  }

  // ---------- thumbnails ----------
  const thumbCache = new Map(); // filter id → data URL (per Lab picture; cleared when the picker opens)
  let thumbQueue = []; let thumbBusy = false;
  function queueThumb(it, img) {
    if (thumbCache.has(it.id)) { if (thumbCache.get(it.id)) img.src = thumbCache.get(it.id); return; }
    thumbQueue.push([it, img]);
    if (!thumbBusy) setTimeout(runThumbs, 30);
  }
  async function runThumbs() {
    if (thumbBusy || !thumbQueue.length) return;
    thumbBusy = true;
    try {
      const d = ThreeLab.director;
      while (d && thumbQueue.length && root?.isConnected) {
        const batch = thumbQueue.splice(0, 6).filter(([it, img]) => img.isConnected && !thumbCache.has(it.id));
        if (!batch.length) continue;
        const list = batch.map(([it]) => ({ id: it.id, type: it.type, P: ThreeLayers.filterValues(it.id) }));
        const r = await d.evalInSketch(`return filter.thumbs(${JSON.stringify(list)}, 96, 60)`);
        const urls = r?.ok ? r.value || {} : {};
        for (const [it, img] of batch) { thumbCache.set(it.id, urls[it.id] || null); if (urls[it.id]) img.src = urls[it.id]; }
        if (!r?.ok) break;
      }
    } catch { /* thumbnails are optional */ }
    thumbBusy = false;
    if (thumbQueue.length && root?.isConnected) setTimeout(runThumbs, 200);
  }
  function easeCurve(id) {
    const f = (u) => ThreeLayers.evalKeys([{ t: 0, v: 0, ease: id }, { t: 1, v: 1 }], u, 0);
    const pts = Array.from({ length: 25 }, (_, i) => `${(i / 24) * 60 + 2},${36 - f(i / 24) * 28}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"><rect width="64" height="40" fill="#0b0d12"/><polyline points="${pts}" fill="none" stroke="#ffd75e" stroke-width="2"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }
  function thumb(it) {
    const box = el('span', { class: 'fx-thumb' });
    if (it.kind === 'filter') {
      const img = el('img', { alt: '' });
      box.append(img);
      box.classList.add('fx-thumb-img');
      box.dataset.cat = it.cat;
      box._load = () => queueThumb(it, img);
    } else if (it.colors?.length) {
      box.style.background = `linear-gradient(90deg, ${it.colors.map((c, i) => `${c} ${(i / it.colors.length) * 100}% ${((i + 1) / it.colors.length) * 100}%`).join(', ')})`;
      if (it.kind === 'layer') box.append(el('b', { text: ICON[it.cat] || '◇' }));
      if (it.kind === 'look') box.append(el('i', { text: it.look.fx.length ? `${it.look.fx.length} fx` : '' }));
    } else if (it.kind === 'layer') {
      box.append(el('b', { text: ICON[it.cat] || '◇' }));
    } else if (it.kind === 'trigger') {
      const X = (f) => (Math.log(f / 20) / Math.log(1000)) * 100;
      for (const t of ThreeTriggers.LIST) {
        const c = { ...ThreeTriggers.DEFAULTS[t.id], ...(it.preset[t.id] || {}) };
        const b = el('i', { class: 'fx-band' });
        Object.assign(b.style, { left: `${X(c.lo)}%`, width: `${Math.max(2, X(c.hi) - X(c.lo))}%`, background: t.color, opacity: c.on === false ? 0.15 : 0.75, height: `${30 + (1 - Math.min(1, (c.gap || 200) / 600)) * 60}%` });
        box.append(b);
      }
    } else if (it.kind === 'ease') {
      box.style.background = easeCurve(it.id);
    } else if (it.kind === 'blend') {
      box.append(el('i', { class: 'fx-blend-a' }), Object.assign(el('i', { class: 'fx-blend-b' }), { style: `mix-blend-mode:${it.preset.blend === 'add' ? 'plus-lighter' : it.preset.blend};opacity:${it.preset.opacity}` }));
    } else box.append(el('b', { text: it.kind === 'animate' ? '◆' : '•' }));
    return box;
  }
  // load the thumbnails of the rows in view (and a little below)
  function loadVisible(list) {
    const top = list.scrollTop - 60; const bottom = list.scrollTop + list.clientHeight + 240;
    for (const b of list.querySelectorAll('.fx-thumb-img')) {
      if (!b._load) continue;
      const y = b.parentElement.offsetTop;
      if (y >= top && y <= bottom) { b._load(); b._load = null; }
    }
  }

  // ---------- the picker ----------
  let root = null;
  function close() { root?.remove(); root = null; thumbQueue = []; }
  function openPicker(kind = 'add', { query = '', anchor = null } = {}) {
    close();
    thumbCache.clear();
    let tab = TABS.some((t) => t[0] === kind) ? kind : 'all';
    let rows = []; let cur = 0; let favOnly = false;
    const input = el('input', { type: 'search', class: 'fx-search', placeholder: 'Search effects, layers, looks, palettes…', value: query, spellcheck: false });
    const tabsEl = el('div', { class: 'fx-tabs' });
    const list = el('div', { class: 'fx-list' });
    const foot = el('div', { class: 'fx-foot' });
    const favBtn = el('button', { class: 'ghost small', text: '★', title: 'Only favorites', on: { click: () => { favOnly = !favOnly; favBtn.classList.toggle('on', favOnly); render(); input.focus(); } } });
    const diceBtn = el('button', { class: 'ghost small', text: '🎲', title: 'Surprise me: apply a random one from this tab (Alt+R)', on: { click: () => doSurprise() } });
    root = el('div', { class: 'fx-picker', attrs: { role: 'dialog', 'aria-label': 'Effects and presets' } },
      el('div', { class: 'fx-head' }, input, favBtn, diceBtn, el('button', { class: 'ghost small', text: '×', title: 'Close (Esc)', on: { click: close } })),
      tabsEl, list, foot);
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      Object.assign(root.style, { left: `${Math.max(8, Math.min(innerWidth - 560, r.right - 540))}px`, top: `${Math.min(innerHeight - 420, r.bottom + 6)}px` });
    }
    document.body.append(root);
    let scrollT = 0;
    list.addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(() => loadVisible(list), 120); });
    const paintTabs = () => tabsEl.replaceChildren(...TABS.map(([id, label, title]) => el('button', { class: `fx-tab${id === tab ? ' on' : ''}`, text: label, title, on: { click: () => { tab = id; paintTabs(); render(); input.focus(); } } })));

    function render() {
      const q = norm(input.value).trim();
      const all = items(tab);
      const f = favs();
      let shown = all.map((it) => [it, score(it, q)]).filter((x) => x[1] && (!favOnly || f.has(keyOf(x[0]))));
      if (q) shown.sort((a, b) => b[1] - a[1]);
      shown = shown.map((x) => x[0]);
      if (!q) { const ko = ['layer', 'filter', 'look', 'palette', 'trigger', 'animate', 'ease', 'blend']; const co = (c) => { const k = CAT_ORDER.indexOf(c); return k < 0 ? 50 : k; }; shown.sort((a, b) => ko.indexOf(a.kind) - ko.indexOf(b.kind) || co(a.cat) - co(b.cat)); }
      const sections = [];
      if (!q && !favOnly) {
        const byKey = new Map(all.map((it) => [keyOf(it), it]));
        const fv = [...f].map((k) => byKey.get(k)).filter(Boolean);
        const rc = recent().map((k) => byKey.get(k)).filter(Boolean).slice(0, 6);
        if (fv.length) sections.push(['★ Favorites', fv]);
        if (rc.length) sections.push(['Recent', rc]);
        const cats = new Map();
        for (const it of shown) { const c = tab === 'all' || tab === 'add' ? `${KIND_LABEL[it.kind]}s · ${it.cat}` : it.cat; if (!cats.has(c)) cats.set(c, []); cats.get(c).push(it); }
        const order = (c) => { const k = CAT_ORDER.findIndex((x) => c.endsWith(x)); return k < 0 ? 99 : k; };
        for (const [c, l] of [...cats].sort((x, y) => (tab === 'all' || tab === 'add' ? 0 : order(x[0]) - order(y[0])))) sections.push([c, l]);
      } else sections.push([q ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : '★ Favorites', shown]);
      rows = [];
      const frag = [];
      for (const [title, l] of sections) {
        frag.push(el('div', { class: 'fx-sec', text: `${title} (${l.length})` }));
        for (const it of l) {
          const i = rows.length;
          const star = el('button', { class: `fx-star${f.has(keyOf(it)) ? ' on' : ''}`, text: '★', title: 'Favorite (Ctrl+D)', on: { click: (e) => { e.stopPropagation(); star.classList.toggle('on', toggleFav(it)); } } });
          const row = el('div', { class: 'fx-row', title: `${it.desc || ''}\n${hint(it)}`, on: { click: (e) => run(it, e.shiftKey), mousemove: () => { if (cur !== i) setCur(i, false); } } },
            thumb(it), el('span', { class: 'fx-name' }, el('b', { text: it.name }), el('small', { text: it.desc || '' })), el('span', { class: 'fx-kind', text: tab === 'all' || tab === 'add' ? KIND_LABEL[it.kind] : it.cat }), star);
          rows.push({ it, row, star });
          frag.push(row);
        }
      }
      if (!rows.length) frag.push(el('div', { class: 'fx-empty', text: favOnly ? 'No favorites here yet: ★ an item (or Ctrl+D) to keep it at the top.' : 'Nothing matches. Try another word or the All tab.' }));
      list.replaceChildren(...frag);
      setCur(0, true);
      setTimeout(() => loadVisible(list), 60);
    }
    function setCur(i, scroll = true) {
      rows[cur]?.row.classList.remove('on');
      cur = Math.max(0, Math.min(rows.length - 1, i));
      const r = rows[cur];
      if (!r) { foot.textContent = '↑↓ move · Enter apply · Tab next tab · Ctrl+D ★ · Alt+R 🎲 · Esc close'; return; }
      r.row.classList.add('on');
      if (scroll) r.row.scrollIntoView({ block: 'nearest' });
      foot.textContent = `${hint(r.it)} · ↑↓ · Tab · Ctrl+D ★ · Alt+R 🎲 · Esc`;
    }
    async function run(it, alt) {
      if (!it) return;
      const keep = it.kind === 'ease' || it.kind === 'blend' || it.kind === 'palette' || it.kind === 'trigger';
      if (!keep) close();
      try { await apply(it, { alt }); } catch (err) { toast(err.message, { type: 'error' }); }
    }
    async function doSurprise() {
      close();
      try { toast(await surprise(tab), { timeout: 2600 }); } catch (err) { toast(err.message, { type: 'error' }); }
    }
    input.addEventListener('input', render);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setCur(cur + (e.key === 'ArrowDown' ? 1 : -1)); return; }
      if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); setCur(cur + (e.key === 'PageDown' ? 8 : -8)); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(rows[cur]?.it, e.shiftKey); return; }
      if (e.key === 'Tab') { e.preventDefault(); const i = TABS.findIndex((t) => t[0] === tab); tab = TABS[(i + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length][0]; paintTabs(); render(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const r = rows[cur]; if (r) r.star.classList.toggle('on', toggleFav(r.it)); return; }
      if (e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); doSurprise(); }
      e.stopPropagation(); // typing here never reaches the Lab's single-key shortcuts
    });
    const outside = (e) => { if (root && !root.contains(e.target)) { close(); removeEventListener('pointerdown', outside, true); } };
    setTimeout(() => addEventListener('pointerdown', outside, true));
    paintTabs();
    render();
    input.focus();
    return root;
  }

  // X in the Lab (not while typing): the picker · Shift+X: everything
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.key.toLowerCase() !== 'x') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || root) return;
    if (!document.querySelector('.layers')?.offsetParent) return;
    e.preventDefault();
    openPicker(e.shiftKey ? 'all' : 'add');
    (typeof Usage !== 'undefined') && Usage.key?.(e.shiftKey ? 'Shift+X' : 'X', 'Lab');
  });
  const open = (kind) => () => { ThreeLab.act('noop'); setTimeout(() => openPicker(kind), 120); };
  for (const [label, kind] of [['Lab: Effects & layers picker (X)', 'add'], ['Lab: Looks…', 'look'], ['Lab: Palettes…', 'palette'], ['Lab: Trigger presets…', 'trigger'], ['Lab: Animate the selected layer…', 'animate'], ['Lab: Keyframe eases…', 'ease'], ['Lab: Blend presets…', 'blend']]) AppUI.addAction?.(label, open(kind));
  AppUI.addAction?.('Lab: Surprise me (random filter)', async () => { try { toast(await surprise('filter'), { timeout: 2600 }); } catch (err) { toast(err.message, { type: 'error' }); } });

  return { openPicker, close, items, find, apply, surprise, toggleFav, KIND_LABEL, TABS };
})();
