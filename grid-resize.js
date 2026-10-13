// Resizable chats (round 29). The owner: "let me resize the chat windows". In the grid view (several chats side by
// side) the gaps between columns and rows are handles: drag to give a chat more room, double-click to share the space
// equally again. The sizes are kept per grid shape (2 columns, 3 columns…) in config.layout.gridSizes.
// The chats panel (its right edge) and a chat docked beside the Lab / board (its divider) already resize by dragging.
const GridResize = (() => {
  const MIN = 0.15; // no column / row smaller than this share
  let box = null; let raf = 0;
  const surfaces = () => document.getElementById('surfaces');
  const key = (cols, rows) => `${cols}x${rows}`;
  const saved = (cols, rows) => H.config.layout?.gridSizes?.[key(cols, rows)] || null;
  const norm = (a, n) => (Array.isArray(a) && a.length === n && a.every((x) => x > 0) ? a : Array(n).fill(1));
  const set = (c, k, v) => { if (c.style.getPropertyValue(k) !== v) c.style.setProperty(k, v); }; // (round 32) every applyLayout: only a change restyles
  const tmpl = (fr) => fr.map((x) => `minmax(0, ${Math.round(x * 1000) / 1000}fr)`).join(' ');
  function shape() {
    const c = surfaces();
    const cols = Number(c?.style.getPropertyValue('--cols')) || 1;
    const rows = Number(c?.style.getPropertyValue('--rows')) || 1;
    return { c, cols, rows };
  }
  // after every layout: the saved sizes for this shape, and handles in the gaps
  function apply() {
    const { c, cols, rows } = shape();
    if (!c) return;
    const s = saved(cols, rows);
    set(c, '--gcols', tmpl(norm(s?.cols, cols)));
    set(c, '--grows', tmpl(norm(s?.rows, rows)));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(handles);
  }
  function handles() {
    const { c, cols, rows } = shape();
    box?.remove(); box = null;
    if (!c || !c.classList.contains('grid') || (cols < 2 && rows < 2)) return;
    box = el('div', { class: 'grid-handles' });
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    const px = (v) => v.split(' ').map(parseFloat).filter((x) => x >= 0);
    const colW = px(cs.gridTemplateColumns); const rowH = px(cs.gridTemplateRows);
    const gap = parseFloat(cs.columnGap) || 6; const pad = parseFloat(cs.paddingLeft) || 0; const padT = parseFloat(cs.paddingTop) || 0;
    let x = r.left + pad;
    for (let i = 0; i < colW.length - 1; i++) { x += colW[i]; box.append(handle('col', i, { left: `${x + gap / 2 - 4}px`, top: `${r.top}px`, height: `${r.height}px` })); x += gap; }
    let y = r.top + padT;
    for (let i = 0; i < rowH.length - 1; i++) { y += rowH[i]; box.append(handle('row', i, { top: `${y + gap / 2 - 4}px`, left: `${r.left}px`, width: `${r.width}px` })); y += gap; }
    document.body.append(box);
  }
  function handle(kind, i, pos) {
    const h = el('div', { class: `grid-handle ${kind}`, title: 'Drag to resize · double-click: equal sizes' });
    Object.assign(h.style, pos);
    h.addEventListener('dblclick', () => store_(kind, null));
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const { c, cols, rows } = shape();
      const n = kind === 'col' ? cols : rows;
      const fr = [...norm(saved(cols, rows)?.[kind === 'col' ? 'cols' : 'rows'], n)];
      const total = fr.reduce((a, b) => a + b, 0);
      const size = kind === 'col' ? c.clientWidth : c.clientHeight;
      const start = kind === 'col' ? e.clientX : e.clientY;
      const a0 = fr[i]; const b0 = fr[i + 1];
      h.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      let next = fr; let pending = 0;
      const move = (ev) => {
        const d = (((kind === 'col' ? ev.clientX : ev.clientY) - start) / Math.max(1, size)) * total;
        const min = MIN * total / n;
        const a = Math.max(min, Math.min(a0 + b0 - min, a0 + d));
        next = [...fr]; next[i] = a; next[i + 1] = a0 + b0 - a;
        if (!pending) pending = requestAnimationFrame(() => { pending = 0; c.style.setProperty(kind === 'col' ? '--gcols' : '--grows', tmpl(next)); });
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', () => { h.removeEventListener('pointermove', move); document.body.classList.remove('resizing'); store_(kind, next); }, { once: true });
    });
    return h;
  }
  function store_(kind, fr) {
    const { cols, rows } = shape();
    const k = key(cols, rows);
    const all = { ...(H.config.layout?.gridSizes || {}) };
    const cur = { ...(all[k] || {}) };
    cur[kind === 'col' ? 'cols' : 'rows'] = fr || undefined;
    if (!cur.cols && !cur.rows) delete all[k]; else all[k] = cur;
    H.config.layout = { ...(H.config.layout || {}), gridSizes: all };
    saveConfig();
    apply();
  }
  // the window, the chats panel or the rail changing size moves the gaps: the handles follow
  let ro = null;
  const watch = () => { const c = surfaces(); if (!c || ro) return; ro = new ResizeObserver(() => { if (c.classList.contains('grid')) { cancelAnimationFrame(raf); raf = requestAnimationFrame(handles); } }); ro.observe(c); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  return { apply };
})();
