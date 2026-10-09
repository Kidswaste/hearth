// Mood board extras: vibe lenses (recolor the view by palette / light / motion / type…), search and filters, the
// minimap, export (PNG / JPEG / pages / contact sheet / palettes / Markdown brief / CSV / zip), presentation (fly
// between frames, compositor animations only) and compare (two items: wipe, side by side, onion, difference + vibes).
(() => {
  const B = Board; const { S, D, V, LY } = B._;

  // ---------- selection marks (the Focus lens, styles) ----------
  let selMarked = new Set();
  B.onChange((what) => {
    if (what !== 'select' && what !== 'render') return;
    for (const id of selMarked) if (!S.sel.has(id)) S.nodes.get(id)?.classList.remove('bd-sel-on');
    for (const id of S.sel) if (!selMarked.has(id)) S.nodes.get(id)?.classList.add('bd-sel-on');
    selMarked = new Set(S.sel);
    quickBar();
  });
  // Ctrl (held) shows a small bar on the selection: the few things you do most with a reference
  let quickKey = '';
  function quickBar() {
    const bar = S.ui.selbox?.querySelector('.bd-quick'); if (!bar) return;
    const list = B.selected(); const k = list.map((i) => i.id).join();
    if (k === quickKey) return; quickKey = k;
    if (!list.length) { bar.replaceChildren(); return; }
    const b = (t, title, fn) => el('button', { text: t, title, on: { pointerdown: (e) => e.stopPropagation(), click: (e) => { e.stopPropagation(); fn(e); } } });
    bar.replaceChildren(
      b('→ Chat', 'Attach the vibe to a chat', (e) => B._.sendMenuAt(e, list.map((i) => i.id))),
      list.length === 1 ? b('Vibe', 'Show the vibe', () => B._.vibeCard(list[0])) : null,
      list.length === 1 ? b('Open', 'Open / edit', () => B._.openItem(list[0])) : null,
      list.length === 2 ? b('Compare', 'Compare the two', () => compare(list[0], list[1])) : null,
      b('★', 'Stamp as favorite', () => B.patch(null, { stamp: '★' }, 'stamp')),
      b('⧉', 'Duplicate', () => { const m = B.duplicateItems(list.map((i) => i.id)); B.select(m.map((i) => i.id)); }),
      b('✕', 'Delete', () => B.removeItems()));
  }

  // ---------- lenses ----------
  const heat = (v) => `hsl(${Math.round(230 - 230 * Math.max(0, Math.min(1, v)))} 90% 50%)`;
  function lensOverlay(lens, it) {
    const v = it.vibe || {};
    const kind = lens.kind;
    const pal = it.type === 'swatch' ? [{ hex: it.color, share: 1 }] : it.type === 'palette' ? (it.colors || []).map((hex) => ({ hex, share: 1 })) : v.palette || [];
    if (kind === 'palette' && pal.length) return { k: pal.map((c) => c.hex).join(), node: () => el('div', { class: 'bd-lens bd-lens-stripes' }, pal.map((c) => el('span', { style: { background: c.hex, '--s': String(c.share || 1) } }))) };
    if (kind === 'dominant' && pal.length) return { k: pal[0].hex, node: () => el('div', { class: 'bd-lens', style: { background: pal[0].hex } }) };
    if (kind === 'blocks' && pal.length) return { k: `b${pal.map((c) => c.hex).join()}`, node: () => el('div', { class: 'bd-lens bd-lens-blocks' }, pal.map((c) => el('span', { style: { background: c.hex, width: `${Math.max(12, Math.sqrt(c.share || 0.2) * 100)}%`, height: `${Math.max(12, Math.sqrt(c.share || 0.2) * 100)}%` } }))) };
    if (kind === 'heat') {
      if (it.type === 'frame') return null;
      const ref = lens.key === 'similar' ? B.selected().find((x) => x.vibe) : null;
      if (lens.key === 'similar' && (!ref || ref === it)) return { k: ref === it ? 'self' : 'nosel', node: () => el('div', { class: 'bd-lens', style: { background: ref === it ? 'transparent' : '#0006' } }) };
      const val = lens.key === 'similar' ? (it.vibe ? 1 - V.distance(ref.vibe, it.vibe) : null) : lens.key === 'warmth' ? (v.warmth ?? 0) * 0.5 + 0.5 : v[lens.key];
      if (val == null) return { k: 'none', node: () => el('div', { class: 'bd-lens', style: { background: '#000c' } }) };
      return { k: `${lens.key}${val}`, node: () => el('div', { class: 'bd-lens bd-lens-heat', style: { background: heat(val) }, title: `${lens.name}: ${val}` }) };
    }
    if (kind === 'label') {
      const t = labelText(lens.key, it); if (!t) return null;
      return { k: t, node: () => el('div', { class: 'bd-lens bd-lens-label' }, el('span', { text: t })) };
    }
    if (kind === 'compose' && v.centroid) return { k: v.centroid.join(), node: () => el('div', { class: 'bd-lens bd-lens-compose' }, el('i', { style: { left: `${v.centroid[0] * 100}%`, top: `${v.centroid[1] * 100}%` } })) };
    if (kind === 'type' && (it.fonts?.heading || it.fonts?.body)) { const t = [it.fonts.heading, it.fonts.body].filter(Boolean).join(' / '); return { k: t, node: () => el('div', { class: 'bd-lens bd-lens-label' }, el('span', { text: `Aa ${t}`, style: { fontFamily: it.fonts.heading || '' } })) }; }
    return null;
  }
  function labelText(key, it) {
    const v = it.vibe || {};
    if (key === 'pacing') return v.pace != null ? `${v.cutCount ? `≈${v.pace}s / shot · ${v.cutsPerMin} cuts/min` : 'one shot'}` : null;
    if (key === 'symmetry') return v.symmetry != null ? `symmetry ${Math.round(v.symmetry * 100)}%` : null;
    if (key === 'space') return v.space != null ? `negative space ${Math.round(v.space * 100)}%` : null;
    if (key === 'mood') return v.moods?.length ? v.moods.join(' · ') : null;
    if (key === 'tags') return it.tags?.length ? it.tags.map((t) => `#${t}`).join(' ') : null;
    if (key === 'note') return it.note || null;
    if (key === 'aspect') return v.aspect || (it.w && it.h ? V.aspectWord(it.w, it.h) : null);
    if (key === 'family') { const c = it.color || it.colors?.[0] || v.palette?.[0]?.hex; return c ? `${D.family(c)} · ${D.colorName(c)}` : null; }
    if (key === 'duration') return it.duration ? `${B._.fmtTime(it.duration)}${it.vin || it.vout ? ` (plays ${B._.fmtTime(it.vin || 0)}–${B._.fmtTime(it.vout || it.duration)})` : ''}` : null;
    if (key === 'added') return it.added ? timeAgo(it.added) : null;
    if (key === 'resolution') return it.natural ? `${it.natural[0]} × ${it.natural[1]}` : null;
    return null;
  }
  const ONLY = { stamp: (i) => Boolean(i.stamp), video: (i) => i.type === 'video' || i.type === 'gif', image: (i) => i.type === 'image', web: (i) => i.type === 'web' };
  function setLens(id, { quiet = false } = {}) {
    const lens = id ? D.find(D.LENSES, id) : null;
    S.cur.lens = lens?.id || undefined;
    if (!quiet) B.save();
    if (!S.mounted) return lens;
    const root = S.ui.root;
    root.dataset.lens = lens?.id || '';
    root.dataset.lensKind = lens?.kind || '';
    root.style.setProperty('--lens-filter', lens?.filter || 'none');
    refreshLens(true);
    if (!quiet) toast(lens ? `Lens: ${lens.name} (${lens.desc})` : 'Lens off');
    B._.emit('lens');
    return lens;
  }
  function refreshLens(force) {
    if (!S.mounted || !S.cur) return;
    const lens = S.cur.lens ? D.find(D.LENSES, S.cur.lens) : null;
    for (const it of S.cur.items) {
      const n = S.nodes.get(it.id); if (!n) continue;
      const o = lens ? lensOverlay(lens, it) : null;
      const k = o ? `${lens.id}|${o.k}` : '';
      if (!force && n.__lens === k) continue;
      n.__lens = k;
      n.querySelector(':scope > .bd-lens')?.remove();
      if (o) n.append(o.node());
      const hide = lens?.kind === 'only' && it.type !== 'frame' && !ONLY[lens.test]?.(it);
      n.classList.toggle('bd-hide', hide);
    }
  }
  B.onChange((what) => { if (((what === 'render' || what === 'vibe') && S.cur?.lens) || (what === 'select' && S.cur?.lens === 'similar')) refreshLens(false); });

  // ---------- search and filters ----------
  let searchBox = null;
  function haystack(it) {
    const v = it.vibe || {};
    let host = ''; try { host = it.url ? new URL(it.url).hostname : ''; } catch { /* none */ }
    const colors = (it.type === 'swatch' ? [it.color] : it.type === 'palette' ? it.colors : (v.palette || []).map((c) => c.hex)) || [];
    return [it.title, it.note, it.text, host, it.type, V.KIND_WORD[it.type], (it.tags || []).map((t) => `#${t} ${t}`).join(' '), (v.moods || []).join(' '), colors.map((c) => `${c} ${D.colorName(c)}`).join(' '),
      it.stamp && D.STAMPS.find(([s]) => s === it.stamp)?.join(' '), v.aspect, it.fonts?.heading, it.fonts?.body, v.light != null && V.words.keyWord(v.light), v.motion != null && V.words.motionWord(v.motion)].filter(Boolean).join(' ').toLowerCase();
  }
  function matches(q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return B.items().filter((it) => it.type !== 'frame' && words.every((w) => haystack(it).includes(w)));
  }
  function applyFilter(list) {
    const keep = list ? new Set(list.map((i) => i.id)) : null;
    for (const it of B.items()) S.nodes.get(it.id)?.classList.toggle('bd-dim', Boolean(keep && it.type !== 'frame' && !keep.has(it.id)));
    S.filter = keep;
  }
  function search(q = '') {
    if (!S.mounted) return [];
    if (!searchBox) {
      const input = el('input', { placeholder: 'Search: words, #tags, colors (teal), moods, kinds (clip)…' });
      const count = el('span', { class: 'bd-count' });
      const close = () => { searchBox.hidden = true; applyFilter(null); S.ui.root.focus(); };
      searchBox = el('div', { class: 'bd-search', hidden: true }, input, count,
        el('button', { text: 'Select', title: 'Select the matches', on: { click: () => { B.select(matches(input.value).map((i) => i.id)); B.zoomSel(); } } }),
        el('button', { text: '✕', title: 'Close (Esc)', on: { click: close } }));
      input.addEventListener('input', () => { const m = input.value.trim() ? matches(input.value) : null; applyFilter(m); count.textContent = m ? `${m.length}` : ''; });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); if (e.key === 'Enter') { const m = matches(input.value); B.select(m.map((i) => i.id)); if (m.length) B.zoomSel(); } });
      searchBox.__input = input;
      S.ui.root.append(searchBox);
    }
    searchBox.hidden = false;
    const input = searchBox.__input;
    input.value = q; input.dispatchEvent(new Event('input'));
    input.focus(); input.select();
    return q ? matches(q) : [];
  }
  B._.key('/  or  Ctrl+F', 'search and filter the board', (e) => (e.key === '/' && !e.ctrlKey) || ((e.ctrlKey || e.metaKey) && e.code === 'KeyF' && !e.shiftKey), () => search());

  // ---------- minimap ----------
  let mini = null; let miniBox = null;
  function minimap() {
    if (!S.mounted) return;
    const mode = B.prefs().minimap || 'auto';
    if (!mini) {
      mini = el('canvas', { class: 'bd-mini', width: 360, height: 240 });
      mini.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const go = (ev) => { if (!miniBox) return; const r = mini.getBoundingClientRect(); const wx = miniBox.x + ((ev.clientX - r.left) / r.width) * miniBox.w; const wy = miniBox.y + ((ev.clientY - r.top) / r.height) * miniBox.h; const vr = S.ui.vp.getBoundingClientRect(); S.view = { ...S.view, x: vr.width / 2 - wx * S.view.z, y: vr.height / 2 - wy * S.view.z }; B._.applyView(); drawMini(); };
        go(e); mini.setPointerCapture(e.pointerId);
        mini.addEventListener('pointermove', go); mini.addEventListener('pointerup', () => mini.removeEventListener('pointermove', go), { once: true });
      });
      S.ui.root.append(mini);
    }
    mini.className = `bd-mini ${mode === 'on' ? 'on' : mode === 'auto' ? 'auto' : ''}`;
    mini.hidden = mode === 'off';
    drawMini();
  }
  function drawMini() {
    if (!mini || mini.hidden || !S.cur) return;
    const ctx = mini.getContext('2d');
    ctx.clearRect(0, 0, mini.width, mini.height);
    const vr = S.ui.vp.getBoundingClientRect();
    const view = { x: -S.view.x / S.view.z, y: -S.view.y / S.view.z, w: vr.width / S.view.z, h: vr.height / S.view.z };
    const items = S.cur.items;
    const b = items.length ? LY.bbox([...items, { ...view, rot: 0 }]) : view;
    const pad = Math.max(b.w, b.h) * 0.05; miniBox = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    const k = Math.min(mini.width / miniBox.w, mini.height / miniBox.h);
    miniBox.w = mini.width / k; miniBox.h = mini.height / k;
    const X = (x) => (x - miniBox.x) * k; const Y = (y) => (y - miniBox.y) * k;
    for (const it of items) {
      ctx.fillStyle = it.type === 'frame' ? '#ffffff14' : it.type === 'swatch' ? it.color : it.vibe?.palette?.[0]?.hex || (it.type === 'note' ? '#ffe68a' : '#8a8f99');
      ctx.fillRect(X(it.x), Y(it.y), Math.max(1.5, it.w * k), Math.max(1.5, it.h * k));
    }
    ctx.strokeStyle = '#e6b450'; ctx.lineWidth = 2;
    ctx.strokeRect(X(view.x), Y(view.y), view.w * k, view.h * k);
  }
  const miniSoon = debounce(drawMini, 120);
  B.onChange((what) => { if (what === 'mount') minimap(); if (['settle', 'items', 'render', 'open', 'vibe'].includes(what)) miniSoon(); });

  // ---------- drawing the board into a picture (export, pages, contact sheets) ----------
  const imgCache = new Map();
  const loadImg = (p) => { if (!p) return Promise.resolve(null); if (!imgCache.has(p)) imgCache.set(p, V.loadImage(B.fileUrl(p)).catch(() => null)); return imgCache.get(p); };
  const stripMd = (t) => String(t || '').replace(/[#*_`>]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  function wrap(ctx, text, x, y, maxW, lh, maxLines = 99) {
    let line = 0;
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const w of para.split(' ')) {
        const t = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(t).width > maxW && cur) { ctx.fillText(cur, x, y + line * lh); line++; cur = w; if (line >= maxLines) return; } else cur = t;
      }
      ctx.fillText(cur, x, y + line * lh); line++; if (line >= maxLines) return;
    }
  }
  const bgColor = () => { const bg = D.BACKGROUNDS.find((x) => x.id === (S.cur.bg || B.prefs().bg || 'theme')); return bg?.color || getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#101114'; };
  async function render(items, { scale = 1, maxSide = 4096, pad = 60, bg = bgColor(), box: box0 } = {}) {
    const box = box0 || LY.bbox(items);
    const bx = { x: box.x - pad, y: box.y - pad - 30, w: box.w + pad * 2, h: box.h + pad * 2 + 30 };
    const s = Math.min(scale, maxSide / Math.max(bx.w, bx.h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bx.w * s)); c.height = Math.max(1, Math.round(bx.h * s));
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    const textColor = getComputedStyle(document.body).color || '#eee';
    for (const it of items) {
      ctx.save();
      ctx.translate((it.x - bx.x + it.w / 2) * s, (it.y - bx.y + it.h / 2) * s);
      if (it.rot) ctx.rotate((it.rot * Math.PI) / 180);
      ctx.globalAlpha = it.opacity ?? 1;
      if (it.blend && it.blend !== 'normal') ctx.globalCompositeOperation = it.blend;
      const w = it.w * s; const h = it.h * s; const x = -w / 2; const y = -h / 2;
      if (['image', 'gif', 'video', 'web'].includes(it.type)) {
        const src = it.type === 'video' || it.type === 'gif' ? it.poster || it.tiny : it.type === 'web' ? it.src : (w > 900 ? it.src : it.thumb || it.src);
        const img = await loadImg(src);
        const mh = it.type === 'web' ? h - 34 * s : h;
        if (img) {
          ctx.save();
          ctx.filter = D.FILTERS.find((f) => f.id === it.filter)?.filter || 'none';
          if (it.flipX || it.flipY) ctx.scale(it.flipX ? -1 : 1, it.flipY ? -1 : 1);
          const cr = it.crop || { l: 0, t: 0, r: 0, b: 0 };
          const nw = img.naturalWidth; const nh = img.naturalHeight;
          let sx = cr.l * nw; let sy = cr.t * nh; let sw = nw * (1 - cr.l - cr.r); let sh = nh * (1 - cr.t - cr.b);
          // cover the box like the board does
          const ar = w / mh; if (sw / sh > ar) { const nsw = sh * ar; sx += (sw - nsw) / 2; sw = nsw; } else { const nsh = sw / ar; if (it.type !== 'web') sy += (sh - nsh) / 2; sh = nsh; }
          ctx.drawImage(img, sx, sy, sw, sh, x, y, w, mh);
          ctx.restore();
        } else { ctx.fillStyle = it.themeColor || '#2a2d33'; ctx.fillRect(x, y, w, mh); }
        if (it.type === 'web') { ctx.fillStyle = '#1b1d22'; ctx.fillRect(x, y + mh, w, 34 * s); ctx.fillStyle = '#ddd'; ctx.font = `${13 * s}px system-ui`; ctx.fillText(String(it.title || it.url).slice(0, 80), x + 10 * s, y + mh + 22 * s, w - 20 * s); }
      } else if (it.type === 'note') {
        const st = D.NOTE_STYLES.find((q) => q.id === it.style) || D.NOTE_STYLES[0];
        ctx.fillStyle = st.bg.startsWith('rgba') ? '#2a2d33' : st.bg; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = st.fg === 'inherit' ? textColor : st.fg; ctx.font = `${17 * s}px ${st.font || 'system-ui, sans-serif'}`; ctx.textBaseline = 'top';
        wrap(ctx, stripMd(it.text), x + 16 * s, y + 16 * s, w - 32 * s, 24 * s, Math.floor((h - 24 * s) / (24 * s)));
      } else if (it.type === 'text') {
        const st = D.TEXT_STYLES.find((q) => q.id === it.textStyle) || D.TEXT_STYLES[0];
        const fs = (it.fs || 64) * s * (st.css.fontSize ? parseFloat(st.css.fontSize) : 1);
        ctx.font = `${st.css.fontStyle || ''} ${st.css.fontWeight || 400} ${fs}px ${st.css.fontFamily || 'system-ui'}`;
        ctx.fillStyle = it.color || (st.css.color && st.css.color !== 'transparent' ? st.css.color : textColor); ctx.textBaseline = 'top';
        let t = it.text || ''; if (st.css.textTransform === 'uppercase') t = t.toUpperCase();
        ctx.textAlign = it.align || 'left';
        wrap(ctx, t, it.align === 'center' ? 0 : it.align === 'right' ? -x : x, y, w, fs * 1.08);
      } else if (it.type === 'swatch' || it.type === 'palette') {
        const cols = it.type === 'swatch' ? [it.color] : it.colors || [];
        ctx.fillStyle = '#1b1d22'; ctx.fillRect(x, y, w, h);
        cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x + (i * w) / cols.length, y, w / cols.length + 1, h - 46 * s); });
        ctx.fillStyle = '#ddd'; ctx.font = `600 ${14 * s}px ui-monospace, monospace`; ctx.textBaseline = 'middle';
        ctx.fillText(it.type === 'swatch' ? `${it.color}  ${it.title || ''}` : it.title || 'Palette', x + 12 * s, y + h - 23 * s, w - 24 * s);
      } else if (it.type === 'frame') {
        ctx.fillStyle = `${it.color || '#888888'}12`; ctx.strokeStyle = `${it.color || '#888888'}aa`; ctx.lineWidth = 2 * s;
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = it.color || textColor; ctx.font = `600 ${Math.max(12, 18 * s)}px system-ui`; ctx.textBaseline = 'bottom';
        ctx.fillText(it.title || 'Frame', x, y - 6 * s);
      } else if (it.type === 'shape') {
        ctx.fillStyle = it.color || '#e6b450'; ctx.strokeStyle = it.color || '#e6b450'; ctx.lineWidth = 6 * s;
        const def = D.SHAPES.find(([id]) => id === it.shape) || D.SHAPES[0];
        ctx.beginPath();
        if (def[2]) { const pts = def[2].match(/[\d.]+% [\d.]+%|0 [\d.]+%|[\d.]+% 0|0 0/g) || []; pts.forEach((p2, i) => { const [px, py] = p2.split(' ').map((q) => parseFloat(q) / 100 || 0); if (i) ctx.lineTo(x + px * w, y + py * h); else ctx.moveTo(x + px * w, y + py * h); }); ctx.closePath(); }
        else if (it.shape === 'circle' || it.shape === 'blob') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        else ctx.roundRect(x, y, w, h, it.shape === 'pill' ? h / 2 : it.shape === 'round' ? 22 * s : 0);
        if (it.shape === 'frame-line') ctx.stroke(); else ctx.fill();
      } else if (it.type === 'arrow') {
        const sw = (it.width || 4) * s; const head = Math.max(10 * s, sw * 3.2); const heads = it.heads ?? 1;
        ctx.strokeStyle = it.color || textColor; ctx.fillStyle = it.color || textColor; ctx.lineWidth = sw; ctx.lineCap = 'round';
        if (it.dash) ctx.setLineDash([sw * 3, sw * 2.4]);
        const yy = it.curve ? y + h * 0.8 : 0; const x0 = x + (heads === 2 ? head : 2); const x1 = x + w - (heads ? head : 2);
        ctx.beginPath(); ctx.moveTo(x0, yy); if (it.curve) ctx.quadraticCurveTo(0, y - h * 0.4, x1, yy); else ctx.lineTo(x1, yy); ctx.stroke(); ctx.setLineDash([]);
        const tip = (tx, dir) => { ctx.beginPath(); ctx.moveTo(tx, yy - head * 0.55); ctx.lineTo(tx + dir * head, yy); ctx.lineTo(tx, yy + head * 0.55); ctx.closePath(); ctx.fill(); };
        if (heads) tip(x1, 1); if (heads === 2) tip(x0, -1);
      } else if (it.type === 'sticker') {
        ctx.font = `${Math.min(w, h) * 0.82}px system-ui, "Segoe UI Emoji", "Apple Color Emoji"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = it.color || '#e6b450';
        ctx.fillText(it.glyph || '★', 0, 0);
      } else { ctx.fillStyle = '#2a2d33'; ctx.fillRect(x, y, w, h); ctx.fillStyle = textColor; ctx.font = `${14 * s}px system-ui`; ctx.fillText(it.title || 'File', x + 10 * s, y + 24 * s); }
      ctx.restore();
    }
    return c;
  }
  const b64 = (c, type = 'image/png', q) => c.toDataURL(type, q).split(',')[1];
  const safe = (s) => String(s || 'board').replace(/[^\w\- ]+/g, '_').trim().slice(0, 50) || 'board';
  async function saveAs(name, content, { base64 = false, filters } = {}) {
    const p = await window.hub.saveFile({ defaultPath: name, filters, content, base64 });
    if (p) toast(`Saved ${p.split(/[\\/]/).pop()}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    return p;
  }
  const framesInOrder = () => S.cur.items.filter((i) => i.type === 'frame').sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || Math.round(a.y / 400) - Math.round(b.y / 400) || a.x - b.x);
  async function exportAs(kind) {
    const all = S.cur.items; const name = safe(S.cur.name);
    if (!all.length && !/^palette|md|vibe|csv/.test(kind)) { toast('The board is empty'); return null; }
    const pal = () => V.summary(all).palette;
    switch (kind) {
      case 'png': return saveAs(`${name}.png`, b64(await render(all)), { base64: true });
      case 'png2': return saveAs(`${name}@2x.png`, b64(await render(all, { scale: 2, maxSide: 8192 })), { base64: true });
      case 'jpg': return saveAs(`${name}.jpg`, b64(await render(all), 'image/jpeg', 0.9), { base64: true });
      case 'sel': { const s = B.selected(); if (!s.length) return toast('Select something first'); return saveAs(`${name}-selection.png`, b64(await render(s)), { base64: true }); }
      case 'frames': {
        const frames = framesInOrder(); if (!frames.length) return toast('No frames on this board');
        const paths = [];
        for (const [i, fr] of frames.entries()) { const c = await render([fr, ...B.contents(fr)], { pad: 20, box: fr }); paths.push(await window.hub.board.save(`${name}-${String(i + 1).padStart(2, '0')}-${safe(fr.title)}.png`, b64(c), { exportDir: true })); }
        toast(`${paths.length} frames saved`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(paths[0]) } });
        return paths;
      }
      case 'pages': {
        const frames = framesInOrder(); const groups = frames.length ? frames.map((fr) => ({ title: fr.title, items: [fr, ...B.contents(fr)], box: fr })) : [{ title: S.cur.name, items: all }];
        const pages = []; for (const g of groups) pages.push({ title: g.title, c: await render(g.items, { maxSide: 1600, scale: 4, pad: 30, box: g.box }) });
        const W = 1600; const H = pages.reduce((a, p) => a + (p.c.height * W) / p.c.width + 90, 40);
        const out = document.createElement('canvas'); out.width = W; out.height = Math.min(32000, Math.round(H));
        const ctx = out.getContext('2d'); ctx.fillStyle = '#f4f2ee'; ctx.fillRect(0, 0, W, out.height);
        let y = 40;
        for (const p of pages) { ctx.fillStyle = '#222'; ctx.font = '600 28px system-ui'; ctx.fillText(p.title || '', 40, y + 28); y += 50; const h = (p.c.height * (W - 80)) / p.c.width; ctx.drawImage(p.c, 40, y, W - 80, h); y += h + 40; }
        return saveAs(`${name}-pages.png`, b64(out), { base64: true });
      }
      case 'contact': {
        const media = all.filter((i) => ['image', 'gif', 'video', 'web'].includes(i.type)); if (!media.length) return toast('No pictures or clips');
        const cols = Math.ceil(Math.sqrt(media.length)); const cell = 260; const out = document.createElement('canvas');
        out.width = cols * cell + 20; out.height = Math.ceil(media.length / cols) * (cell + 24) + 20;
        const ctx = out.getContext('2d'); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height);
        for (const [i, it] of media.entries()) {
          const img = await loadImg(it.tiny || it.thumb || it.poster || it.src); const x = 10 + (i % cols) * cell; const y = 10 + Math.floor(i / cols) * (cell + 24);
          if (img) { const k = Math.min((cell - 10) / img.naturalWidth, (cell - 10) / img.naturalHeight); ctx.drawImage(img, x + (cell - img.naturalWidth * k) / 2, y + (cell - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k); }
          ctx.fillStyle = '#ccc'; ctx.font = '12px system-ui'; ctx.fillText(String(it.title || it.type).slice(0, 34), x + 4, y + cell + 14);
        }
        return saveAs(`${name}-contact-sheet.png`, b64(out), { base64: true });
      }
      case 'palette-png': {
        const p = pal(); if (!p.length) return toast('No colors read yet');
        const out = document.createElement('canvas'); out.width = 1200; out.height = 320; const ctx = out.getContext('2d');
        let x = 0; for (const c of p) { const w = Math.max(80, c.share * 1200); ctx.fillStyle = c.hex; ctx.fillRect(x, 0, w + 1, 260); ctx.fillStyle = '#111'; ctx.fillRect(x, 260, w, 60); ctx.fillStyle = '#eee'; ctx.font = '600 16px ui-monospace, monospace'; ctx.fillText(c.hex, x + 10, 296); x += w; }
        return saveAs(`${name}-palette.png`, b64(out), { base64: true });
      }
      case 'palette-css': return saveAs(`${name}-palette.css`, `:root {\n${pal().map((c, i) => `  --board-${i + 1}: ${c.hex}; /* ${D.colorName(c.hex)}, ${Math.round(c.share * 100)}% */`).join('\n')}\n}\n`);
      case 'palette-json': return saveAs(`${name}-palette.json`, JSON.stringify(pal(), null, 2));
      case 'palette-gpl': return saveAs(`${name}.gpl`, `GIMP Palette\nName: ${S.cur.name}\nColumns: ${pal().length}\n#\n${pal().map((c) => `${D.hexToRgb(c.hex).map((v) => String(v).padStart(3)).join(' ')}\t${c.hex} ${D.colorName(c.hex)}`).join('\n')}\n`);
      case 'md': return saveAs(`${name}-vibe.md`, `# ${S.cur.name}\n\n${BoardDrawer.vibeText({ focus: 'full' })}\n\n## References\n${all.filter((i) => i.type !== 'frame').map((i) => `- ${V.text(i)}`).join('\n')}\n`);
      case 'vibe-json': return saveAs(`${name}-vibe.json`, JSON.stringify({ board: S.cur.name, summary: V.summary(all), items: all.filter((i) => i.vibe).map((i) => ({ id: i.id, type: i.type, title: i.title, tags: i.tags, note: i.note, vibe: i.vibe })) }, null, 2));
      case 'csv': {
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [['id', 'type', 'title', 'url', 'tags', 'stamp', 'note', 'light', 'contrast', 'saturation', 'warmth', 'motion', 'seconds_per_shot', 'palette']];
        for (const i of all) { const v = i.vibe || {}; rows.push([i.id, i.type, i.title, i.url, (i.tags || []).join(' '), i.stamp, i.note, v.light, v.contrast, v.sat, v.warmth, v.motion, v.pace, (v.palette || []).map((c) => c.hex).join(' ')]); }
        return saveAs(`${name}.csv`, rows.map((r) => r.map(q).join(',')).join('\n'));
      }
      case 'zip': {
        const json = await window.hub.board.save(`${name}-board.json`, btoa(unescape(encodeURIComponent(JSON.stringify(S.cur, null, 2)))), { exportDir: true });
        const files = [...new Set(all.flatMap((i) => [i.src, i.poster, i.thumb, i.tiny]).filter(Boolean))];
        const entries = [{ name: 'board.json', path: json }, ...files.map((p) => ({ name: `media/${p.split(/[\\/]/).pop()}`, path: p }))];
        const dirs = await window.hub.board.dir();
        const out = `${dirs.exports}${dirs.exports.includes('\\') ? '\\' : '/'}${name}-${Date.now().toString(36)}.zip`;
        const r = await window.hub.fs.zip(entries, out);
        toast(`Board zipped (${Math.round((r.size || 0) / 1024)} KB)`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(r.path) } });
        return r.path;
      }
      case 'clip': copyText(BoardDrawer.vibeText({ focus: 'full' })); toast('Board vibe copied'); return true;
      default: toast(`No export "${kind}"`); return null;
    }
  }
  async function cleanMedia() {
    const keep = [];
    for (const e of B.boards()) { const b = await B.load(e.id); for (const i of b?.items || []) keep.push(i.src, i.poster, i.thumb, i.tiny); }
    const unused = await window.hub.board.unused(keep.filter(Boolean));
    if (!unused.length) return toast('Nothing unused in the board media folder');
    if (await Modal.confirm('Tidy the board media folder?', `${unused.length} file(s) no board uses any more go to the Recycle Bin.`, { ok: 'Move to Recycle Bin' })) { await window.hub.fs.trash(unused); toast(`${unused.length} file(s) moved to the Recycle Bin`); }
  }

  // ---------- presentation ----------
  let pres = null;
  function stops() {
    const frames = framesInOrder();
    if (frames.length) return frames.map((f) => ({ box: f, title: f.title, items: B.contents(f) }));
    return S.cur.items.filter((i) => i.type !== 'frame').sort((a, b) => Math.round(a.y / 300) - Math.round(b.y / 300) || a.x - b.x).map((i) => ({ box: i, title: i.title || '', items: [i] }));
  }
  function present(startAt = 0) {
    if (!S.mounted) return false;
    const list = stops(); if (!list.length) { toast('Nothing to present yet'); return false; }
    B.select([]);
    pres = { i: -1, list, cap: el('div', { class: 'bd-present-cap' }), fade: el('div', { class: 'bd-fadeout' }) };
    S.presenting = true;
    S.ui.root.classList.add('bd-presenting'); S.ui.root.append(pres.cap, pres.fade);
    addEventListener('keydown', presKey, true);
    S.ui.vp.addEventListener('click', presClick, true);
    go(startAt);
    return true;
  }
  function presKey(e) {
    if (!pres) return;
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) go(pres.i + 1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) go(pres.i - 1);
    else if (k === 'Home') go(0); else if (k === 'End') go(pres.list.length - 1);
    else if (k === 'Escape') stopPresent(); else return;
    e.preventDefault(); e.stopPropagation();
  }
  function presClick(e) { if (!pres) return; e.stopPropagation(); go(pres.i + (e.shiftKey ? -1 : 1)); }
  function go(i) {
    if (!pres) return;
    if (i >= pres.list.length) { stopPresent(); return; }
    i = Math.max(0, i);
    const prev = pres.list[pres.i];
    if (prev) for (const it of prev.items) if (it.type === 'video') B._.stopPreview(it.id);
    pres.i = i;
    const stop = pres.list[i];
    const vr = S.ui.vp.getBoundingClientRect();
    const target = LY.fitView(stop.box, vr.width, vr.height, 40, 0.02, 32);
    const tr = D.find(D.TRANSITIONS, B.prefs().transition || 'fly') || D.TRANSITIONS[0];
    pres.cap.textContent = `${stop.title ? `${stop.title} · ` : ''}${i + 1} / ${pres.list.length}`;
    const done = () => { S.view = target; B._.writeView(); for (const it of stop.items.filter((x) => x.type === 'video').slice(0, 2)) B._.startPreview(it.id); };
    const world = S.ui.world;
    const tf = (v) => `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.z})`;
    if (tr.kind === 'cut' || prev == null) { done(); return; }
    if (tr.kind === 'fade') {
      pres.fade.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: tr.ms, easing: 'ease-in-out' });
      setTimeout(done, tr.ms / 2); return;
    }
    let frames = [{ transform: tf(S.view) }, { transform: tf(target) }];
    if (tr.kind === 'arc') { const all = LY.fitView(LY.bbox([prev.box, stop.box]), vr.width, vr.height, 80, 0.02, 32); frames = [{ transform: tf(S.view) }, { transform: tf(all), offset: 0.5 }, { transform: tf(target) }]; }
    if (tr.kind === 'spin') frames = [{ transform: `${tf(S.view)} rotate(0deg)` }, { transform: `${tf({ ...target, z: target.z * 0.8 })} rotate(-4deg)`, offset: 0.5 }, { transform: `${tf(target)} rotate(0deg)` }];
    if (tr.kind === 'dolly') frames = [{ transform: tf(S.view) }, { transform: tf({ x: target.x, y: target.y, z: S.view.z }), offset: 0.4 }, { transform: tf(target) }];
    // one compositor animation on the world layer; the view lands exactly on the frame when it ends
    world.style.willChange = 'transform';
    const a = world.animate(frames, { duration: tr.ms, easing: tr.easing, startTime: document.timeline.currentTime });
    pres.anim?.cancel(); pres.anim = a;
    a.onfinish = () => { done(); a.cancel(); world.style.willChange = ''; };
  }
  function stopPresent() {
    if (!pres) return;
    pres.anim?.cancel();
    pres.cap.remove(); pres.fade.remove();
    removeEventListener('keydown', presKey, true);
    S.ui.vp.removeEventListener('click', presClick, true);
    S.ui.root.classList.remove('bd-presenting');
    S.presenting = false; pres = null;
    B._.stopAllPreviews();
    B._.settle();
  }
  B._.key('P', 'present: fly between frames (→ / Space next, ← back, Esc ends)', (e) => e.code === 'KeyP' && !e.ctrlKey && !e.altKey && !e.shiftKey && !S.presenting, () => present());

  // ---------- compare two items ----------
  function compare(a, b) {
    if (!a || !b) return null;
    const src = (it) => B.fileUrl(it.type === 'video' || it.type === 'gif' ? it.poster || it.tiny : it.type === 'swatch' || it.type === 'palette' ? '' : it.src || it.thumb);
    const A = el('img', { src: src(a), alt: '' }); const Bm = el('img', { src: src(b), alt: '' });
    const stage = el('div', { class: 'bd-cmp-stage' });
    const bar = el('div', { class: 'bd-cmp-bar' });
    let mode = 'wipe'; let at = 0.5;
    const paint = () => {
      stage.className = `bd-cmp-stage${mode === 'side' ? ' bd-cmp-side' : ''}`;
      Bm.style.clipPath = mode === 'wipe' ? `inset(0 0 0 ${at * 100}%)` : '';
      Bm.style.opacity = mode === 'onion' ? String(at) : '';
      Bm.style.mixBlendMode = mode === 'diff' ? 'difference' : '';
      bar.hidden = mode !== 'wipe'; bar.style.left = `${at * 100}%`;
      for (const btn of head.querySelectorAll('[data-m]')) btn.classList.toggle('on', btn.dataset.m === mode);
    };
    stage.append(A, Bm, bar);
    stage.addEventListener('pointermove', (e) => { if (e.buttons || mode === 'wipe') { const r = stage.getBoundingClientRect(); at = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); paint(); } });
    const M = (m, label) => el('button', { text: label, dataset: { m }, on: { click: () => { mode = m; paint(); } } });
    const close = () => { wrap.remove(); removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const head = el('div', { class: 'bd-cmp-head' }, el('b', { text: `${a.title || a.type}  ⟷  ${b.title || b.type}` }), el('span', { class: 'spacer' }),
      M('wipe', 'Wipe'), M('side', 'Side by side'), M('onion', 'Onion'), M('diff', 'Difference'),
      el('span', { text: `vibe distance ${V.distance(a.vibe, b.vibe)}`, style: { opacity: 0.7, fontSize: '12px' } }), el('button', { text: 'Close (Esc)', on: { click: close } }));
    const sw = (it) => (it.type === 'swatch' ? [it.color] : it.type === 'palette' ? it.colors : (it.vibe?.palette || []).map((c) => c.hex)).map((c) => el('span', { class: 'bd-cmp-sw', style: { background: c }, title: c }));
    const vib = el('div', { class: 'bd-cmp-vibe' }, el('div', {}, sw(a), el('div', { text: V.text(a) })), el('div', {}, sw(b), el('div', { text: V.text(b) })));
    const wrap = el('div', { class: 'bd-compare' }, head, stage, vib);
    addEventListener('keydown', key, true);
    document.body.append(wrap); paint();
    return wrap;
  }

  Object.assign(B._, { setLens, refreshLens, search, matches, applyFilter, minimap, drawMini, render, exportAs, cleanMedia, present, stopPresent, go: (i) => go(i), compare, framesInOrder, stops, haystack, quickBar });
})();
