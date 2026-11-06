// ✎ Camera paths (round 133, campath133): draw the camera's path on the Lab preview. docs/upgrades/campath133.md
// Right-click the preview › 🎥 Camera moves › ✎ Draw a camera path (or /camera-moves draw) puts the preview in path mode:
//   · drag on the picture to look around (the wheel goes closer / further), click to add a point there (or ＋ Add point)
//   · the path is drawn over the picture: the subject in the middle, a dot where the camera stands at each point, and the
//     smooth curve (Catmull-Rom) between them; drag a dot to move that point (each drag is one undo step)
//   · ⋯ in the small path bar: over what (the whole song, the loop, a section), snapped to bars or one point per section,
//     Smooth / Linear / Hold then move on the beat, and ≋ Shake on the kick (beatlink's kicks)
//   · ▶ Preview plays the move; Esc or Done leaves path mode
// The path is ONE 🎥 camera move (kind 'path', tools/three-camera-core.js): its points are keyframes { t, view } on the
// layer's camMoves, so the scene, renders, exports, the Lab sequence, the Stage window (◉ Perform) and the time machine
// carry it with no extra code. Every change goes through LabCamera.commit: one step of the camera's undo (Ctrl/⌘+Z on
// the timeline, the card's ↶). While drawing, the layer's moves wait (the preview's 'hold') so a point is measured
// against the scene's own camera, exactly as the move will play it.
const CamPath = (() => {
  const C = CamCore; const K = CamPathCore;
  const clone = (o) => JSON.parse(JSON.stringify(o ?? null));
  const zero = () => ({ yaw: 0, pitch: 0, s: 1, px: 0, py: 0, pz: 0 });
  const LC = () => LabCamera;
  const H = () => LC().hooks();
  const P = () => H()?.player || null;
  const err = (e) => toast(e?.message || String(e), { type: 'error' });
  const stats = { starts: 0, points: 0, drags: 0, previews: 0 };
  const S = { on: false, lid: null, id: null, draft: [], cur: zero(), d: 5, range: null, snap: 'bars', how: 'smooth', kick: 0, more: false, preview: null, over: null, bar: null, timer: 0, key: '' };

  // ---------- the song: ranges, grid, sections ----------
  function songInput() {
    const p = P(); let tl = {}; try { tl = p?.timeline?.() || {}; } catch { tl = {}; }
    const a = p?.analysis || {};
    const grid = { bpm: tl.grid?.bpm || a.bpm || p?.bpm || 0, downbeat: tl.grid?.downbeat ?? a.beats?.[a.downIndex || 0] ?? 0, beatsPerBar: tl.grid?.beatsPerBar || p?.beatsPerBar || 4 };
    return { duration: p?.duration > 0 ? p.duration : 10, loop: p?.loop || null, cues: p?.isClock ? [] : tl.cues || [], sections: p?.isClock ? [] : a.sections || [], grid };
  }
  const rangesNow = () => K.ranges(songInput());
  function rangeNow() { const list = rangesNow(); return list.find((r) => r.id === S.range) || list.find((r) => r.id === 'loop') || list[0]; }
  const sectionsNow = () => K.sectionsOf(songInput());

  // ---------- the path on the layer ----------
  const layer = () => H()?.layerById(S.lid) || null;
  const movesOf = (L) => (Array.isArray(L?.camMoves) ? L.camMoves : []);
  const move = () => movesOf(layer()).find((m) => m.id === S.id) || null;
  const views = () => { const m = move(); return m ? m.pts.map((p) => ({ ...p.v })) : S.draft.map((v) => ({ ...v })); };
  // views → the path move (times spread over the range): the layer's whole list
  function build(vs) {
    const inp = songInput(); const r = rangeNow();
    const ts = K.times(vs.length, { a: r.a, b: r.b, snap: S.snap, grid: inp.grid, sections: K.sectionsOf(inp) });
    const B = K.barsOf(inp.grid);
    const m = C.make('path', { id: S.id || undefined, pts: vs.map((v, i) => ({ t: ts[i], v })), how: S.how, beat: B?.beat || 0.5, kick: S.kick, d: S.d });
    const list = movesOf(layer());
    const next = list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m];
    return { m, next };
  }
  function apply(vs, label, { from = null } = {}) {
    if (vs.length < 2) { S.draft = vs; paint(); return null; }
    const { m, next } = build(vs);
    S.id = m.id; S.draft = [];
    LC().commit(S.lid, next, `✎ Camera path: ${label}`, { from, quiet: true });
    paint();
    return m;
  }

  // ---------- the preview: hold the moves, look from a point ----------
  const ask = (cmd, extra = {}) => LC().ask(cmd, S.lid ? { layer: S.lid, ...extra } : extra);
  let viewQ = null; let viewBusy = false;
  function look(v) { viewQ = { ...v }; if (viewBusy) return; viewBusy = true; requestAnimationFrame(() => { viewBusy = false; const q = viewQ; viewQ = null; if (q) H()?.send({ type: 'cam', cmd: 'set', req: 0, layer: S.lid, view: q }); }); }

  // ---------- path mode ----------
  async function start() {
    if (S.on) { paint(); return true; }
    const h = H(); if (!h) { toast('Open the Lab first', { timeout: 1600 }); return false; }
    h.ensureClock?.();
    S.lid = null;
    const info = await ask('info');
    if (!info.ok) { toast(info.why, { timeout: 2600 }); return false; }
    const inp = songInput();
    if (!inp.cues.length && inp.sections.length && typeof SongMapCore === 'undefined') await window.Lazy?.load('songmap').catch(() => {}); // (songmap130 names the sections)
    const L = h.layerById(info.layer); if (!L) return false;
    const old = movesOf(L).find((m) => m.kind === 'path');
    Object.assign(S, { on: true, lid: L.id, id: old?.id || null, draft: [], cur: { ...zero(), ...info.view }, d: old?.d || movesOf(L)[0]?.d || info.d, how: old?.how || 'smooth', kick: old?.kick || 0, preview: null, key: '' });
    const list = rangesNow();
    S.range = old ? (list.find((r) => Math.abs(r.a - old.t0) < 0.05 && Math.abs(r.b - old.t1) < 0.05)?.id || null) : null;
    if (!S.range) S.range = old ? 'whole' : (list.find((r) => r.id === 'loop') || list[0]).id;
    S.snap = K.barsOf(inp.grid) ? 'bars' : 'off';
    await ask('hold', { on: true });
    stats.starts += 1;
    mount();
    addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    S.timer = setInterval(() => { if (S.on) { place(); paint(); } }, 300);
    toast('✎ Path mode: drag on the picture to look around, click to add a point. Esc leaves.', { timeout: 4200 });
    return true;
  }
  async function leave() {
    if (!S.on) return false;
    stopPreview(false);
    S.on = false;
    clearInterval(S.timer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    S.over?.remove(); S.bar?.remove(); S.over = null; S.bar = null;
    await ask('hold', { on: false });
    await ask('set', { view: zero() }); // (the moves play again, from the scene's own camera)
    const m = move();
    if (S.draft.length === 1 && !m) toast('✎ A path needs 2 points: nothing was added', { timeout: 2200 });
    return true;
  }
  function onKey(e) {
    if (!S.on || e.key !== 'Escape' || document.querySelector('.mb-menu')) return;
    e.stopPropagation(); e.preventDefault();
    if (S.preview) stopPreview(); else leave().catch(err);
  }
  async function addPoint(v = S.cur) {
    if (!S.on) return null;
    stats.points += 1;
    const vs = [...views(), { ...v }];
    return apply(vs, `point ${vs.length} added`);
  }
  function removeLast() {
    const vs = views(); if (!vs.length) return;
    vs.pop();
    if (vs.length >= 2) apply(vs, 'last point removed');
    else if (move()) { const L = layer(); LC().commit(S.lid, movesOf(L).filter((m) => m.id !== S.id), '✎ Camera path removed', { quiet: true }); S.id = null; S.draft = vs; paint(); } else { S.draft = vs; paint(); }
  }
  function setTiming(p) { Object.assign(S, p); const vs = views(); if (vs.length >= 2) apply(vs, Object.keys(p).map((k) => ({ range: `over ${rangeNow().name}`, snap: S.snap === 'bars' ? 'snapped to bars' : S.snap === 'sections' ? 'a point per section' : 'not snapped', how: C.PATH_HOW.find((x) => x.id === S.how)?.name || S.how, kick: `shake on the kick ${Math.round(S.kick * 100)} %` })[k]).join(', ')); else paint(); }

  // ---------- ▶ Preview: the move as it renders ----------
  async function preview() {
    const m = move(); const p = P();
    if (!m || !p) { toast('Add 2 points first', { timeout: 1600 }); return false; }
    if (S.preview) { stopPreview(); return false; }
    stats.previews += 1;
    S.preview = { t1: m.t1 };
    await ask('hold', { on: false });
    await ask('set', { view: zero() });
    p.seek(m.t0); p.toggle(true);
    S.over?.classList.add('cpath-playing');
    const tick = () => { if (!S.preview) return; const q = P(); if (!q || q.time >= S.preview.t1 + 0.25 || (!q.playing && Date.now() - S.preview.at > 600)) { stopPreview(); return; } paint(); requestAnimationFrame(tick); };
    S.preview.at = Date.now();
    requestAnimationFrame(tick);
    paint();
    return true;
  }
  function stopPreview(back = true) {
    if (!S.preview) return;
    S.preview = null;
    try { P()?.toggle(false); } catch { /* gone */ }
    S.over?.classList.remove('cpath-playing');
    if (back && S.on) { ask('hold', { on: true }).then(() => look(S.cur)); }
    paint();
  }

  // ---------- the overlay over the preview ----------
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  let svg = null; let info = null;
  function frameRect() { const h = H(); const host = h?.host?.isConnected ? h.host : null; const f = host?.querySelector('iframe') || host; return f?.getBoundingClientRect() || null; }
  function box() { const r = S.over?.getBoundingClientRect(); const w = r?.width || 400; const hh = r?.height || 300; return { cx: w / 2, cy: hh / 2, R: Math.min(w, hh) * 0.3, w, h: hh }; }
  function place() {
    const r = frameRect(); if (!r || !S.over) return;
    Object.assign(S.over.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    Object.assign(S.bar.style, { left: `${r.left + 8}px`, top: `${r.top + 8}px`, maxWidth: `${Math.max(240, Math.min(560, r.width - 16))}px` });
  }
  function mount() {
    S.over = el('div', { class: 'cpath-over', attrs: { 'aria-label': 'Camera path: drag to look around, click to add a point' } });
    svg = svgEl('svg', { class: 'cpath-svg' }); S.over.append(svg);
    S.over.addEventListener('pointerdown', onDown);
    S.over.addEventListener('wheel', onWheel, { passive: false });
    S.over.addEventListener('contextmenu', (e) => e.preventDefault());
    const sel = (cls, opts, val, fn, title) => { const s = el('select', { class: `cpath-sel ${cls}`, title }, opts.map(([v, n]) => el('option', { value: v, text: n, selected: v === val }))); s.addEventListener('change', () => fn(s.value)); return s; };
    const more = el('div', { class: 'cpath-more' });
    const fillMore = () => {
      const kick = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.kick, class: 'cpath-kick', title: '≋ Shake on the kick: a short shake on each kick of the song (0 = off)' });
      let from = null;
      kick.addEventListener('input', () => { if (!move()) return; from ||= clone(movesOf(layer())); S.kick = Number(kick.value); LC().liveSet(S.lid, build(views()).next); });
      kick.addEventListener('change', () => { const f = from; from = null; S.kick = Number(kick.value); const vs = views(); if (vs.length >= 2) apply(vs, `shake on the kick ${Math.round(S.kick * 100)} %`, { from: f }); });
      more.replaceChildren(
        sel('cpath-range', rangesNow().map((r) => [r.id, `${r.section ? '§ ' : ''}${r.name} · ${C.fmtT(r.a)}–${C.fmtT(r.b)}`]), rangeNow().id, (v) => setTiming({ range: v }), 'Over what: the whole song, the loop or a section'),
        sel('cpath-snap', [['bars', 'Snap to bars'], ['sections', 'A point per section'], ['off', 'No snap']], S.snap, (v) => setTiming({ snap: v }), 'Where the points land in time'),
        sel('cpath-how', C.PATH_HOW.map((x) => [x.id, x.name]), S.how, (v) => setTiming({ how: v }), 'How it goes from one point to the next'),
        el('label', { class: 'cpath-kickl', title: '≋ Shake on the kick' }, el('span', { text: '≋ Shake on the kick' }), kick));
    };
    const moreBtn = el('button', { type: 'button', class: 'ghost small cpath-morebtn', text: '⋯', title: 'Timing: over what, snap, ease, shake on the kick', on: { click: () => { S.more = !S.more; if (S.more) fillMore(); more.hidden = !S.more; } } });
    more.hidden = !S.more; if (S.more) fillMore();
    info = el('span', { class: 'cpath-info' });
    S.bar = el('div', { class: 'cpath-bar lab-pop', role: 'toolbar', attrs: { 'aria-label': 'Camera path' } },
      el('div', { class: 'cpath-row' },
        el('b', { text: '✎ Path' }), info,
        el('button', { type: 'button', class: 'small cpath-add', text: '＋ Point', title: 'Add a point where the camera is now (or click on the picture)', on: { click: () => addPoint() } }),
        el('button', { type: 'button', class: 'ghost small cpath-undo', text: '⌫', title: 'Remove the last point', on: { click: () => removeLast() } }),
        el('button', { type: 'button', class: 'ghost small cpath-play', text: '▶', title: 'Preview the move', on: { click: () => preview().catch(err) } }),
        moreBtn,
        el('button', { type: 'button', class: 'small primary cpath-done', text: 'Done', title: 'Leave path mode (Esc)', on: { click: () => leave().catch(err) } })),
      more);
    document.body.append(S.over, S.bar);
    place(); paint();
  }
  function paint() {
    if (!S.on || !svg) return;
    const m = move(); const vs = views(); const b = box(); const p = P();
    const t = S.preview && p ? p.time : null;
    const key = JSON.stringify([m, S.draft, S.cur, b.w, b.h, t, S.preview ? 1 : 0]);
    if (key === S.key) return; S.key = key;
    if (!m && S.id) { S.id = null; } // (undone back to before the path)
    const kids = [];
    kids.push(svgEl('ellipse', { class: 'cpath-ring', cx: b.cx, cy: b.cy, rx: b.R, ry: b.R * 0.45 }));
    kids.push(svgEl('circle', { class: 'cpath-subject', cx: b.cx, cy: b.cy, r: 4 }));
    if (m) { const pts = K.curve(m, b); kids.push(svgEl('polyline', { class: 'cpath-curve', points: pts.map((q) => `${q.x},${q.y}`).join(' ') })); }
    vs.forEach((v, i) => {
      const q = K.plan(v, b);
      kids.push(svgEl('line', { class: 'cpath-aim', x1: q.x, y1: q.y, x2: b.cx, y2: b.cy }));
      const g = svgEl('g', { class: 'cpath-dot', 'data-i': i, transform: `translate(${q.x} ${q.y})` });
      g.append(svgEl('circle', { r: 8 }));
      const tx = svgEl('text', { y: 3.5 }); tx.textContent = String(i + 1); g.append(tx);
      kids.push(g);
    });
    const now = t != null && m ? C.pathView(m, t) : S.cur;
    const c = K.plan(now, b);
    kids.push(svgEl('circle', { class: `cpath-cam${t != null ? ' on' : ''}`, cx: c.x, cy: c.y, r: 5 }));
    svg.setAttribute('viewBox', `0 0 ${b.w} ${b.h}`);
    svg.replaceChildren(...kids);
    if (info) info.textContent = m ? `${vs.length} points · ${C.fmtT(m.t0)}–${C.fmtT(m.t1)}` : vs.length ? '1 point: add one more' : 'click to add points';
  }

  // ---------- pointer: drag = look around, click = add a point, a dot = move that point ----------
  function onDown(e) {
    if (e.button !== 0 || S.preview) return;
    e.preventDefault();
    const r = S.over.getBoundingClientRect(); const b = box();
    const dot = e.target.closest?.('.cpath-dot');
    const x0 = e.clientX; const y0 = e.clientY;
    try { S.over.setPointerCapture(e.pointerId); } catch { /* fine */ }
    let moved = false; let up;
    if (dot) {
      const i = Number(dot.dataset.i); const from = clone(movesOf(layer())); const v0 = views()[i];
      let vs = views();
      stats.drags += 1;
      const mv = (ev) => {
        moved = true;
        const v = K.unplan(ev.clientX - r.left, ev.clientY - r.top, v0, b);
        vs = views(); vs[i] = v; S.cur = { ...v };
        if (move()) LC().liveSet(S.lid, build(vs).next); else S.draft = vs;
        look(v); paint();
      };
      up = () => { if (moved && move()) apply(vs, `point ${i + 1} moved`, { from }); else if (!moved) { S.cur = { ...v0 }; look(v0); } paint(); };
      S.over.addEventListener('pointermove', mv);
      S.over.addEventListener('pointerup', function done() { S.over?.removeEventListener('pointermove', mv); S.over?.removeEventListener('pointerup', done); up(); });
      return;
    }
    const c0 = { ...S.cur };
    const mv = (ev) => {
      const dx = ev.clientX - x0; const dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      const a = (2 * Math.PI) / Math.max(1, r.height);
      S.cur = { ...c0, yaw: c0.yaw - dx * a, pitch: Math.max(-1.45, Math.min(1.45, c0.pitch - dy * a)) };
      look(S.cur); paint();
    };
    S.over.addEventListener('pointermove', mv);
    S.over.addEventListener('pointerup', function done() { S.over?.removeEventListener('pointermove', mv); S.over?.removeEventListener('pointerup', done); if (!moved) addPoint(); });
  }
  function onWheel(e) {
    if (S.preview) return;
    e.preventDefault();
    S.cur = { ...S.cur, s: Math.max(0.05, Math.min(50, S.cur.s * Math.exp(Math.max(-300, Math.min(300, e.deltaY)) * 0.0015))) };
    look(S.cur); paint();
  }

  // ---------- words: /camera-moves path … · /camera-moves orbit right on the drop ----------
  async function command(words) {
    const a = String(words || '').trim();
    const h = H(); h?.ensureClock?.();
    const inp = songInput();
    if (!inp.cues.length && inp.sections.length && typeof SongMapCore === 'undefined') await window.Lazy?.load('songmap').catch(() => {});
    const list = rangesNow();
    const r = K.rangeNamed(list, a);
    if (/^draw\b/i.test(a) || /^path\s*$/i.test(a)) { const ok = await start(); return ok ? 'Path mode: drag on the picture to look around, click to add points, Esc to leave' : 'This scene has no 3D camera to move'; }
    if (/^path\b/i.test(a)) {
      const o = K.parse(a);
      if (o.pts.length < 2) throw new Error('A path needs 2+ points: /camera-moves path <yaw° pitch° distance>, … e.g. path 0 0 1, 90 -15 0.7 over the drop');
      const info = await LC().ask('info'); if (!info.ok) return info.why;
      const L = h.layerById(info.layer);
      const R = r || list.find((x) => x.id === 'loop') || list[0];
      const ts = K.times(o.pts.length, { a: R.a, b: R.b, snap: o.snap, grid: inp.grid, sections: K.sectionsOf(inp) });
      const old = movesOf(L).find((m) => m.kind === 'path');
      const m = C.make('path', { id: old?.id, pts: o.pts.map((v, i) => ({ t: ts[i], v })), how: o.how, beat: K.barsOf(inp.grid)?.beat || 0.5, kick: o.kick || 0, d: old?.d || movesOf(L)[0]?.d || info.d });
      const next = old ? movesOf(L).map((x) => (x.id === old.id ? m : x)) : [...movesOf(L), m];
      LC().commit(L.id, next, `✎ Camera path over ${R.name}`, { quiet: true });
      return `${C.describe(m)} · over ${R.name} · /camera-moves undo`;
    }
    // a preset over a named section
    const o = C.parse(a);
    if (!o.kind) throw new Error(`Moves: ${C.KINDS.map((k) => k.name.toLowerCase()).join(', ')}`);
    if (!r) throw new Error(`No section like that here. Sections: ${list.filter((x) => x.section).map((x) => x.name).join(', ') || 'none (load a song, or ✦ Map it)'}`);
    const m = await LC().add(o.kind, { ...o, t0: r.a, t1: r.b, quiet: true });
    return m ? `${C.describe(m)} · on ${r.name} · /camera-moves undo` : 'This scene has no 3D camera to move';
  }

  addEventListener('hearth:sketch', () => { if (S.on) leave().catch(() => {}); });

  return { start, leave, addPoint, removeLast, setTiming, preview, stopPreview, command, stats, get on() { return S.on; }, get state() { return { on: S.on, lid: S.lid, id: S.id, draft: clone(S.draft), cur: { ...S.cur }, range: S.range, snap: S.snap, how: S.how, kick: S.kick, previewing: Boolean(S.preview) }; }, move: () => clone(move()), box, ranges: rangesNow, sections: sectionsNow };
})();
