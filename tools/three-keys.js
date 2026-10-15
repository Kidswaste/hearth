// ◆ Keyframes you can see and shape (round 46, labkeys): the small card a click on a keyframe diamond opens on the Lab
// timeline (tools/three-media.js: a lane's diamond, or a layer's ◆ on its track). Six named eases, each drawn small
// (Linear, Ease, Ease in, Ease out, Bounce, Hold); "Curve" shows the move to the next keyframe as a speed curve with
// two handles to drag (After Effects' graph for one segment: the key's ease becomes 'bezier' with b = [x1, y1, x2, y2],
// evaluated by ThreeLayers.bezierAt here and the same lines in the preview page, so renders match). "Snap to beats"
// while a song is loaded (the timeline's own snap). Loaded the first time a diamond is clicked (lazy group 'labkeys');
// nothing runs while the card is closed.
const LabKeys = (() => {
  const EASES = [['linear', 'Linear'], ['ease', 'Ease'], ['in', 'Ease in'], ['out', 'Ease out'], ['bounce', 'Bounce'], ['hold', 'Hold']];
  // where the curve's two handles start for a named ease (close to its shape)
  const START = { linear: [0.3, 0.3, 0.7, 0.7], ease: [0.42, 0, 0.58, 1], in: [0.55, 0, 0.9, 0.35], out: [0.1, 0.65, 0.45, 1], hold: [0.5, 0, 0.9, 0.1] };
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  // the move from 0 to 1 under an ease, as it plays (the Lab's own evaluation)
  const valueOf = (ease, b) => (u) => ThreeLayers.evalKeys([{ t: 0, v: 0, ease, ...(b ? { b } : {}) }, { t: 1, v: 1, ease: 'linear' }], u, 0);
  // an SVG path of that move in a w × h box (value 0 at the bottom, 1 at the top, `pad` around)
  function pathOf(ease, b, w, h, pad = 3) {
    const f = valueOf(ease, b); const n = ease === 'hold' ? 2 : 40; const pts = [];
    if (ease === 'hold') return `M${pad},${h - pad} H${w - pad} V${pad}`;
    for (let i = 0; i <= n; i += 1) { const u = i / n; const v = Math.max(-0.35, Math.min(1.35, f(u))); pts.push(`${(pad + u * (w - 2 * pad)).toFixed(1)},${(h - pad - v * (h - 2 * pad)).toFixed(1)}`); }
    return `M${pts.join(' L')}`;
  }
  function tileSvg(ease) {
    const s = svgEl('svg', { width: 40, height: 26, viewBox: '0 0 40 26', 'aria-hidden': 'true', class: 'lk-ico' });
    s.append(svgEl('path', { d: pathOf(ease, null, 40, 26, 4), fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }

  let card = null;
  function close() {
    if (!card) return;
    card.el.remove();
    removeEventListener('pointerdown', card.outside, true);
    removeEventListener('keydown', card.esc, true);
    card = null;
  }
  // o: { x, y, ease, b, n, what, apply(ease, b, final), snap: { on, set(on) } | null }
  function chooser(o) {
    close();
    const tiles = EASES.map(([id, name]) => {
      const b = el('button', { type: 'button', class: `lk-tile${o.ease === id ? ' on' : ''}`, title: `${name}: ${HINT[id]}`, attrs: { 'aria-pressed': String(o.ease === id) } }, tileSvg(id), el('span', { text: name }));
      b.addEventListener('click', () => { o.apply(id, null, true); close(); });
      return b;
    });
    const curveBtn = el('button', { type: 'button', class: `lk-tile lk-curve-btn${o.ease === 'bezier' || o.ease === 'curve' ? ' on' : ''}`, title: 'Curve: drag two handles to shape the move to the next keyframe', attrs: { 'aria-pressed': String(o.ease === 'bezier') } }, tileSvg('bezierPreview'), el('span', { text: 'Curve' }));
    curveBtn.querySelector('path').setAttribute('d', pathOf('bezier', o.b || [0.7, 0, 0.2, 1], 40, 26, 4));
    const head = el('div', { class: 'lk-head' }, el('b', { text: o.n > 1 ? `${o.n} keyframes` : 'Keyframe' }), o.what ? el('span', { class: 'lk-sub', text: o.what }) : null);
    const grid = el('div', { class: 'lk-grid' }, ...tiles, curveBtn);
    const curveBox = el('div', { class: 'lk-curve', hidden: true });
    let snapRow = null;
    if (o.snap) {
      const box = el('input', { type: 'checkbox', checked: Boolean(o.snap.on) });
      box.addEventListener('change', () => o.snap.set(box.checked));
      snapRow = el('label', { class: 'lk-snap', title: 'Keyframes you drag or paste land on the song\'s beats (the timeline\'s Snap)' }, box, el('span', { text: 'Snap to beats' }));
    }
    const root = el('div', { class: 'lk-pop', attrs: { role: 'dialog', 'aria-label': 'Keyframe ease' } }, head, grid, curveBox, snapRow);
    // a handle moved: the card shows Curve as the key's ease now
    const lit = (on) => { for (const t of [...tiles, curveBtn]) { t.classList.toggle('on', t === on); t.setAttribute('aria-pressed', String(t === on)); } };
    const co = { ...o, apply: (ease, b, final) => { lit(curveBtn); curveBtn.querySelector('path').setAttribute('d', pathOf('bezier', b, 40, 26, 4)); o.apply(ease, b, final); } };
    curveBtn.addEventListener('click', () => { curveBox.hidden = !curveBox.hidden; if (!curveBox.hidden && !curveBox.firstChild) curveBox.append(curveView(co)); place(); });
    document.body.append(root);
    const place = () => {
      const r = root.getBoundingClientRect();
      root.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - r.width - 8, o.x - r.width / 2)))}px`;
      const below = o.y + 14; root.style.top = `${Math.round(below + r.height > innerHeight - 8 ? Math.max(8, o.y - r.height - 14) : below)}px`;
    };
    place();
    const outside = (e) => { if (!root.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    addEventListener('pointerdown', outside, true);
    addEventListener('keydown', esc, true);
    card = { el: root, outside, esc, o };
    if (o.ease === 'bezier') curveBtn.click();
    return root;
  }
  const HINT = { linear: 'the same speed all the way', ease: 'starts and stops softly', in: 'starts slow, arrives fast', out: 'leaves fast, lands softly', bounce: 'lands and bounces', hold: 'stays, then jumps at the next keyframe' };

  // The speed curve of one segment: the move from 0 (bottom left) to 1 (top right) over the time to the next keyframe;
  // the two handles shape it. Drags apply live; letting go is the one undo step.
  const CW = 176; const CH = 124; const PX = 14; const P0 = 98; const P1 = 26; // x 0..1 → PX..CW-PX · value 0 → P0, 1 → P1
  const cx = (x) => PX + x * (CW - 2 * PX); const cy = (v) => P0 - v * (P0 - P1);
  function curveView(o) {
    let b = (o.ease === 'bezier' && o.b ? o.b : START[o.ease] || START.ease).slice();
    const s = svgEl('svg', { width: CW, height: CH, viewBox: `0 0 ${CW} ${CH}`, class: 'lk-graph', role: 'img', 'aria-label': 'Speed curve: drag the two handles' });
    s.append(svgEl('rect', { x: cx(0), y: cy(1), width: cx(1) - cx(0), height: cy(0) - cy(1), class: 'lk-frame' }));
    const l1 = svgEl('line', { class: 'lk-arm' }); const l2 = svgEl('line', { class: 'lk-arm' });
    const path = svgEl('path', { class: 'lk-line', fill: 'none' });
    const h1 = svgEl('circle', { r: 6, class: 'lk-h', 'data-h': '1' }); const h2 = svgEl('circle', { r: 6, class: 'lk-h', 'data-h': '2' });
    s.append(l1, l2, path, svgEl('circle', { cx: cx(0), cy: cy(0), r: 3, class: 'lk-end' }), svgEl('circle', { cx: cx(1), cy: cy(1), r: 3, class: 'lk-end' }), h1, h2);
    const paint = () => {
      l1.setAttribute('x1', cx(0)); l1.setAttribute('y1', cy(0)); l1.setAttribute('x2', cx(b[0])); l1.setAttribute('y2', cy(b[1]));
      l2.setAttribute('x1', cx(1)); l2.setAttribute('y1', cy(1)); l2.setAttribute('x2', cx(b[2])); l2.setAttribute('y2', cy(b[3]));
      h1.setAttribute('cx', cx(b[0])); h1.setAttribute('cy', cy(b[1])); h2.setAttribute('cx', cx(b[2])); h2.setAttribute('cy', cy(b[3]));
      const f = valueOf('bezier', b); const pts = [];
      for (let i = 0; i <= 48; i += 1) { const u = i / 48; pts.push(`${cx(u).toFixed(1)},${Math.max(2, Math.min(CH - 2, cy(f(u)))).toFixed(1)}`); }
      path.setAttribute('d', `M${pts.join(' L')}`);
    };
    paint();
    for (const h of [h1, h2]) {
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        h.setPointerCapture(e.pointerId);
        const i = h.dataset.h === '1' ? 0 : 2;
        const r = s.getBoundingClientRect(); const k = CW / r.width;
        const at = (ev) => [Math.round(Math.max(0, Math.min(1, ((ev.clientX - r.left) * k - PX) / (CW - 2 * PX))) * 1000) / 1000, Math.round(Math.max(-0.5, Math.min(1.5, (P0 - (ev.clientY - r.top) * k) / (P0 - P1))) * 1000) / 1000];
        let moved = false;
        const move = (ev) => { [b[i], b[i + 1]] = at(ev); moved = true; paint(); o.apply('bezier', b.slice(), false); };
        const up = (ev) => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); if (moved) { [b[i], b[i + 1]] = at(ev); paint(); o.apply('bezier', b.slice(), true); } };
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
      });
    }
    return el('div', {}, s, el('div', { class: 'lk-note', text: 'Drag the handles: steeper = faster there' }));
  }
  return { EASES, chooser, close, pathOf, valueOf, get card() { return card?.el || null; } };
})();
