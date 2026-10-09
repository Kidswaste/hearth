// The editor's inspector (Video Review ✂): opens over the notes column when you double-click a clip or layer,
// press Enter on a selection, or pick "Inspector" in its right-click menu. Everything a clip can do, grouped and
// folded: title words / style / animation, transform with keyframes (◆ at the playhead, ‹ › to the previous /
// next key, the curve), speed / reverse / volume / fades / blend, look + adjustments, the transition into it.
// Sliders preview live while you drag and make one undo step when you let go. The edit itself lives in
// tools/video-cut.js; this file only reads it and asks for changes through `api`.
const VideoInspector = (() => {
  const C = CutData;
  const FX = EditFX;
  let api = null; let root = null; let aside = null; let cur = null;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const PROPS = [
    { id: 'opacity', name: 'Opacity', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { id: 'scale', name: 'Scale', min: 0.05, max: 4, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { id: 'x', name: 'Position X', min: -1, max: 1, step: 0.005, fmt: (v) => v.toFixed(3) },
    { id: 'y', name: 'Position Y', min: -1, max: 1, step: 0.005, fmt: (v) => v.toFixed(3) },
    { id: 'rotate', name: 'Rotation', min: -180, max: 180, step: 0.5, fmt: (v) => `${v.toFixed(1)}°` },
  ];
  const VOL = { id: 'volume', name: 'Volume', min: 0, max: 2, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` };

  function attach({ aside: a, api: x }) {
    api = x; aside = a;
    root = el('div', { class: 'ed-insp', hidden: true, tabIndex: -1 });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    a.append(root);
    api.on('change', () => { if (cur) render(); });
    api.on('select', ({ ids }) => { if (cur && !ids.includes(cur)) close(); });
    api.on('mode', ({ on }) => { if (!on) close(); });
    api.on('frame', () => { if (cur) paintKeys(); });
  }
  function open(id) { if (!root) return; cur = id; root.hidden = false; aside.classList.add('inspecting'); render(); }
  function close() { if (!root) return; const had = root.contains(document.activeElement) || document.activeElement === document.body; cur = null; root.hidden = true; root.replaceChildren(); aside?.classList.remove('inspecting'); if (had) api.focus?.(); }

  // ---------- helpers ----------
  const f = () => (cur ? api.find(cur) : null);
  const localT = () => { const s = api.startOf(cur); const x = f(); const d = x ? (x.where === 'clip' ? C.durOf(x.clip) : C.itemDur(x.clip)) : 0; return Math.max(0, Math.min(d, api.time - s)); };
  // a value change: with keys on that property it keys at the playhead (like After Effects), else the base value
  function withValue(e, prop, v) {
    const x = C.find(e, cur);
    if (x?.clip.keys?.[prop]?.length) {
      const t = localT();
      const at = x.clip.keys[prop].find((k) => Math.abs(k.t - t) < 1e-3);
      return C.setKey(e, cur, prop, t, v, at?.ease || 'ease');
    }
    return C.patchAny(e, cur, (c) => { c[prop] = v; });
  }
  const patch = (fn) => C.patchAny(api.edit, cur, fn);
  function slider(p, value, onLive, onDone) {
    const out = el('span', { class: 'ed-v', text: p.fmt ? p.fmt(value) : String(value) });
    const inp = el('input', { type: 'range', min: p.min, max: p.max, step: p.step, value });
    inp.addEventListener('input', () => { const v = Number(inp.value); out.textContent = p.fmt ? p.fmt(v) : String(v); onLive(v); });
    inp.addEventListener('change', () => onDone(Number(inp.value)));
    inp.addEventListener('dblclick', () => { const d = p.def ?? C.KEY_DEF[p.id] ?? 0; inp.value = d; onDone(d); });
    return { inp, out };
  }
  const row = (label, ...kids) => el('div', { class: 'ed-row' }, el('label', { text: label }), ...kids);
  const section = (title, open0, ...kids) => { const d = el('details', { class: 'ed-sec', open: open0 }, el('summary', { text: title }), ...kids.filter(Boolean)); return d; };
  function select(list, value, onPick, { groups = false, none = null } = {}) {
    const s = el('select');
    if (none) s.append(el('option', { value: '', text: none }));
    if (groups) {
      for (const gname of [...new Set(list.map((x) => x.group))]) {
        const og = el('optgroup', { label: gname });
        for (const x of list.filter((y) => y.group === gname)) og.append(el('option', { value: x.id, text: x.name }));
        s.append(og);
      }
    } else for (const x of list) s.append(el('option', { value: x.id, text: x.name }));
    s.value = value ?? '';
    s.addEventListener('change', () => onPick(s.value));
    return s;
  }

  // ---------- render ----------
  let keyBtns = [];
  function render() {
    const x = f();
    if (!x) { close(); return; }
    const c = x.clip;
    const start = api.startOf(cur);
    const d = x.where === 'clip' ? C.durOf(c) : C.itemDur(c);
    const F = api.fps();
    const isMain = x.where === 'clip';
    const media = c.kind === 'video' || c.kind === 'audio';
    const visual = c.kind !== 'audio' && c.kind !== 'gap';
    const name = c.kind === 'title' ? `“${String(c.text || '').split('\n')[0].slice(0, 28)}”` : c.src ? String(c.src).split(/[\\/]/).pop() : c.kind === 'gap' ? `Gap${c.slot ? ` · slot ${c.slot}` : ''}` : c.kind;
    const where = isMain ? `V1 · clip ${x.i + 1}` : `${x.track.name}.${x.track.items.indexOf(c) + 1}`;
    keyBtns = [];
    const kids = [
      el('div', { class: 'ed-head' },
        el('div', { class: 'ed-name' }, el('b', { text: name }), el('span', { class: 'ed-where', text: `${where} · ${c.kind}` })),
        el('button', { class: 'vr-ico', text: '✕', title: 'Close (Esc)', on: { click: close } })),
      el('div', { class: 'ed-tc', text: `${api.fmt(start)} → ${api.fmt(start + d)} · ${d.toFixed(2)} s · ${Math.round(d * F)} frames` }),
    ];
    if (c.kind === 'title') kids.push(titleSection(c));
    if (visual && c.kind !== 'title') kids.push(transformSection(c, d));
    if (c.kind === 'title') kids.push(transformSection(c, d, false));
    if (media || c.kind === 'image' || c.kind === 'title' || c.kind === 'color') kids.push(clipSection(c, x, media));
    if (visual && c.kind !== 'title') kids.push(colorSection(c));
    if (visual && c.kind !== 'title') kids.push(effectsSection(c));
    if (isMain && x.i > 0) kids.push(transSection(c));
    const hadFocus = root.contains(document.activeElement) || document.activeElement === document.body;
    root.replaceChildren(...kids.filter(Boolean));
    if (hadFocus) root.focus({ preventScroll: true }); // keys (Esc) keep reaching the inspector after it redraws
    paintKeys();
  }
  function titleSection(c) {
    const ta = el('textarea', { rows: 2, value: c.text || '', placeholder: 'The words (Enter: a new line)' });
    ta.addEventListener('change', () => api.commit(patch((k) => { k.text = ta.value; }), 'Title words'));
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const isLower = Boolean(c.lower);
    return section('Title', true,
      ta,
      isLower ? row('Lower third', select(FX.LOWER_THIRDS, c.lower, (v) => api.commit(patch((k) => { k.lower = v; }), FX.LTHIRD[v].name))) : row('Style', select(FX.TITLE_STYLES, c.style || 'bold', (v) => api.commit(patch((k) => { k.style = v; }), FX.TSTYLE[v].name), { groups: true })),
      row('In', select(FX.TITLE_ANIMS, c.anim || 'fade', (v) => api.commit(patch((k) => { k.anim = v; }), `In: ${FX.TANIM[v].name}`))),
      row('Out', select(FX.TITLE_ANIMS, c.out || 'fade', (v) => api.commit(patch((k) => { k.out = v; }), `Out: ${FX.TANIM[v].name}`))),
      ...(() => { const s = slider({ min: 0.1, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)} s`, def: 0.6 }, c.animDur ?? 0.6, (v) => api.live(patch((k) => { k.animDur = v; })), (v) => api.commit(patch((k) => { k.animDur = v; }), 'Animation length')); return [row('Anim length', s.inp, s.out)]; })(),
      ...(() => { const s = slider({ min: 0.3, max: 3, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, def: 1 }, c.size ?? 1, (v) => api.live(patch((k) => { k.size = v; })), (v) => api.commit(patch((k) => { k.size = v; }), 'Text size')); return [row('Size', s.inp, s.out)]; })(),
      row('Color', (() => { const i = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : VideoTitles.styleOf(c).color?.slice(0, 7) || '#ffffff' }); i.addEventListener('change', () => api.commit(patch((k) => { k.color = i.value; }), 'Text color')); return i; })()),
      row('Place', select([['', 'Style default'], ['top', 'Top'], ['upper', 'Upper third'], ['center', 'Center'], ['lower', 'Lower third'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']].map(([id, name]) => ({ id, name })), '', (v) => {
        const P0 = { top: { y: 0.12 }, upper: { y: 0.33 }, center: { y: 0.5, x: 0.5, align: 'center' }, lower: { y: 0.75 }, bottom: { y: 0.88 }, left: { x: 0.08, align: 'left' }, right: { x: 0.92, align: 'right' } }[v];
        if (P0) api.commit(patch((k) => { Object.assign(k, P0); }), 'Title placed');
      })),
    );
  }
  function transformSection(c, d, open0 = true) {
    const rows = PROPS.map((p) => {
      const t = localT();
      const v = C.propAt(c, p.id, t);
      const s = slider(p, r3(v), (val) => api.live(withValue(api.edit, p.id, val)), (val) => api.commit(withValue(api.edit, p.id, val), `${p.name} ${p.fmt(val)}`));
      const kb = el('button', { class: 'ed-key', text: '◆', title: `Keyframe ${p.name.toLowerCase()} at the playhead (click again to remove it)`, on: { click: () => toggleKey(p.id) } });
      kb.dataset.prop = p.id;
      keyBtns.push(kb);
      const prev = el('button', { class: 'ed-nav', text: '‹', title: 'Previous keyframe', on: { click: () => jump(p.id, -1) } });
      const next = el('button', { class: 'ed-nav', text: '›', title: 'Next keyframe', on: { click: () => jump(p.id, 1) } });
      return el('div', { class: 'ed-row ed-prop' }, prev, kb, next, el('label', { text: p.name }), s.inp, s.out);
    });
    const curve = select(FX.EASES.map((e) => ({ id: e.id, name: e.name })), keyEaseAt(c) || 'ease', (v) => setEase(v));
    curve.title = 'The curve from the keyframe at (or before) the playhead to the next one';
    return section('Transform', open0, ...rows,
      row('Curve', curve),
      row('Motion', select(FX.MOTIONS, '', (v) => v && api.applyMotion(v, [cur]), { groups: true, none: 'Preset…' })),
      c.keys ? el('button', { class: 'ghost small', text: 'Remove every keyframe', on: { click: () => api.commit(patch((k) => { delete k.keys; }), 'Keyframes removed') } }) : null);
  }
  function clipSection(c, x, media) {
    const kids = [];
    if (media) {
      kids.push(row('Speed', select(C.SPEEDS.map((s) => ({ id: String(s), name: `${s}×` })), String(c.speed || 1), (v) => api.setSpeed(Number(v), [cur]))));
      kids.push(row('Reverse', (() => { const i = el('input', { type: 'checkbox', checked: Boolean(c.reverse) }); i.addEventListener('change', () => api.commit(C.setReverse(api.edit, cur, i.checked), i.checked ? '◀ Reversed' : 'Forward')); return i; })()));
      if (x.where === 'clip' && c.kind === 'video') kids.push(row('Ramp', select(FX.RAMPS, '', (v) => v && api.rampClip(v, cur), { none: 'Speed ramp…' })));
      const t = localT();
      const s = slider(VOL, r3(C.propAt(c, 'volume', t)), (val) => api.live(withValue(api.edit, 'volume', val)), (val) => api.commit(withValue(api.edit, 'volume', val), `Volume ${VOL.fmt(val)}`));
      const kb = el('button', { class: 'ed-key', text: '◆', title: 'Keyframe the volume at the playhead', on: { click: () => toggleKey('volume') } });
      kb.dataset.prop = 'volume'; keyBtns.push(kb);
      kids.push(el('div', { class: 'ed-row ed-prop' }, el('span'), kb, el('span'), el('label', { text: 'Volume' }), s.inp, s.out));
      kids.push(row('Sound fx', select(FX.AUDIO_FX, '', (v) => v && api.setAudioFx(v, [cur]), { none: (c.afx || []).length ? `${c.afx.map((x) => FX.AFX[x]?.name.split(' (')[0]).join(', ')} (toggle…)` : 'Add (heard in the render)…' })));
      kids.push(row('Mute', (() => { const i = el('input', { type: 'checkbox', checked: Boolean(c.mute) }); i.addEventListener('change', () => api.commit(patch((k) => { k.mute = i.checked; }), i.checked ? 'Muted' : 'Sound on')); return i; })()));
    }
    for (const edge of ['fadeIn', 'fadeOut']) {
      const s = slider({ min: 0, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)} s`, def: 0 }, c[edge] || 0, (v) => api.live(patch((k) => { k[edge] = Math.min(v, C.durOf(k) / 2); })), (v) => api.commit(patch((k) => { k[edge] = Math.min(v, C.durOf(k) / 2); }), edge === 'fadeIn' ? 'Fade in' : 'Fade out'));
      kids.push(row(edge === 'fadeIn' ? 'Fade in' : 'Fade out', s.inp, s.out));
    }
    if (x.where === 'item' && c.kind !== 'audio') kids.push(row('Blend', select(FX.BLENDS, c.blend || 'normal', (v) => api.commit(patch((k) => { k.blend = v; }), `Blend ${FX.BLEND[v].name}`))));
    if (c.kind === 'image' || c.kind === 'color') {
      const s = slider({ min: 0.2, max: 30, step: 0.1, fmt: (v) => `${v.toFixed(1)} s`, def: 3 }, c.dur || 3, (v) => api.live(patch((k) => { k.dur = v; })), (v) => api.commit(patch((k) => { k.dur = v; }), 'Length'));
      kids.push(row('Length', s.inp, s.out));
    }
    if (c.kind === 'color') kids.push(row('Color', (() => { const i = el('input', { type: 'color', value: c.fill || '#000000' }); i.addEventListener('change', () => api.commit(patch((k) => { k.fill = i.value; }), 'Color')); return i; })()));
    return section(media ? 'Clip · speed · sound' : 'Clip', true, ...kids);
  }
  function colorSection(c) {
    const look = c.color?.look || '';
    const amt = slider({ min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, def: 1 }, c.color?.amt ?? 1, (v) => api.live(patch((k) => { k.color = { ...(k.color || {}), amt: v }; })), (v) => api.commit(patch((k) => { k.color = { ...(k.color || {}), amt: v }; }), 'Look strength'));
    const adj = FX.ADJ.filter((a) => a.id !== 'tintAmt').map((a) => {
      const s = slider({ ...a, fmt: (v) => (a.id === 'hue' ? `${Math.round(v)}°` : v.toFixed(2)), def: 0 }, c.color?.[a.id] || 0, (v) => api.live(patch((k) => { k.color = { ...(k.color || {}), [a.id]: v }; })), (v) => api.commit(patch((k) => { k.color = { ...(k.color || {}), [a.id]: v }; }), `${a.name} ${v}`));
      return row(a.name, s.inp, s.out);
    });
    const wash = el('input', { type: 'color', value: c.color?.tintColor || '#ffc93b' });
    wash.addEventListener('change', () => api.commit(patch((k) => { k.color = { ...(k.color || {}), tintColor: wash.value, tintAmt: k.color?.tintAmt || 0.3 }; }), 'Color wash'));
    const washAmt = slider({ min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%`, def: 0 }, c.color?.tintAmt || 0, (v) => api.live(patch((k) => { k.color = { ...(k.color || {}), tintAmt: v, tintColor: k.color?.tintColor || wash.value }; })), (v) => api.commit(patch((k) => { k.color = { ...(k.color || {}), tintAmt: v, tintColor: k.color?.tintColor || wash.value }; }), 'Color wash'));
    return section('Color', Boolean(c.color),
      row('Look', select(FX.LOOKS, look, (v) => api.setLook(v || null, [cur]), { groups: true, none: 'None' })),
      c.color?.look ? row('Strength', amt.inp, amt.out) : null,
      el('details', { class: 'ed-sub' }, el('summary', { text: 'Adjust' }), ...adj, row('Wash color', wash, washAmt.inp, washAmt.out),
        el('button', { class: 'ghost small', text: 'Reset the color', on: { click: () => api.commit(patch((k) => { delete k.color; }), 'Color reset') } })));
  }
  // effects stack (mirror, glow, pixelate, VHS…): one row each with its amount and ✕
  function effectsSection(c) {
    const rows = (c.fx || []).map((f) => {
      const d = FX.EFFECT[f.id];
      const s = slider({ min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%`, def: 1 }, f.amt ?? 1,
        (v) => api.live(patch((k) => { k.fx = (k.fx || []).map((x) => (x.id === f.id ? { ...x, amt: v } : x)); })),
        (v) => api.commit(patch((k) => { k.fx = (k.fx || []).map((x) => (x.id === f.id ? { ...x, amt: v } : x)); }), `${d?.name || f.id} ${Math.round(v * 100)}%`));
      return el('div', { class: 'ed-row' }, el('label', { text: d?.name || f.id, title: d?.name || f.id }), s.inp,
        el('span', { class: 'ed-fxend' }, s.out, el('button', { class: 'ed-nav', text: '✕', title: 'Remove this effect', on: { click: () => api.setEffect(f.id, [cur], 0) } })));
    });
    return section(`Effects${c.fx?.length ? ` (${c.fx.length})` : ''}`, Boolean(c.fx?.length), ...rows,
      row('Add', select(FX.EFFECTS, '', (v) => v && api.setEffect(v, [cur], 1), { groups: true, none: 'Effect…' })));
  }
  function transSection(c) {
    const len = slider({ min: 0.1, max: 3, step: 0.05, fmt: (v) => `${v.toFixed(2)} s`, def: 0.5 }, c.trans?.dur || 0.5, (v) => { if (c.trans) api.live(C.setTrans(api.edit, cur, c.trans.type, v)); }, (v) => api.setTransition(c.trans?.type || 'dissolve', v, [cur]));
    return section('Transition in', Boolean(c.trans),
      row('Type', select(FX.TRANSITIONS.filter((t) => t.id !== 'cut'), c.trans?.type || '', (v) => api.setTransition(v || null, v ? null : 0, [cur]), { groups: true, none: 'Straight cut' })),
      row('Length', len.inp, len.out));
  }

  // ---------- keyframes ----------
  function keyAt(c, prop, t) { return (c.keys?.[prop] || []).find((k) => Math.abs(k.t - t) < 0.5 / api.fps()); }
  function paintKeys() {
    const x = f(); if (!x) return;
    const t = localT();
    for (const b of keyBtns) {
      const p = b.dataset.prop;
      const has = Boolean(keyAt(x.clip, p, t));
      const any = Boolean(x.clip.keys?.[p]?.length);
      b.classList.toggle('on', has); b.classList.toggle('some', any && !has);
    }
  }
  function toggleKey(prop) {
    const x = f(); if (!x) return;
    const t = localT();
    const k = keyAt(x.clip, prop, t);
    if (k) api.commit(C.removeKey(api.edit, cur, prop, k.t), `◇ ${prop} key removed`);
    else api.keyHere(prop, null, cur);
  }
  function jump(prop, dir) {
    const x = f(); if (!x?.clip.keys?.[prop]) return;
    const t = localT(); const s = api.startOf(cur);
    const list = x.clip.keys[prop].map((k) => k.t);
    const to = dir > 0 ? list.find((k) => k > t + 1e-3) : [...list].reverse().find((k) => k < t - 1e-3);
    if (to != null) api.seek(s + to + 0.5 / api.fps() * 0);
  }
  function keyEaseAt(c) {
    const t = localT();
    let best = null;
    for (const list of Object.values(c.keys || {})) { const k = [...list].reverse().find((y) => y.t <= t + 1e-3); if (k) best = k.ease; }
    return best;
  }
  function setEase(ease) {
    const x = f(); if (!x?.clip.keys) { api.flash('Add a keyframe first (◆)'); return; }
    const t = localT();
    api.commit(C.patchAny(api.edit, cur, (c) => { for (const list of Object.values(c.keys || {})) { const k = [...list].reverse().find((y) => y.t <= t + 1e-3) || list[0]; if (k) k.ease = ease; } }), `Curve: ${FX.EASE[ease]?.name || ease}`);
  }

  return { attach, open, close, get current() { return cur; }, get el() { return root; } };
})();
