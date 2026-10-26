// ✦ Direction (round 67, direction67): the Lab's card for steering a scene when it's easier to recognise what you
// want than to describe it. The ✦ Direction chip sits in the Lab toolbar after the scene picker (and ⚑ Finish line);
// the card holds:
//   · ✦ Try 4 ways: one idea, four helpers (the crew, tools/three-crew.js), each a really different take (colour and
//     light · motion · form · texture), on their own copies; the crew panel shows the cost first and you pick one.
//     Then "Keep #a with … from #b" asks the director to combine two takes ("this one, with that one's light").
//   · ◯ Mark it up: circle parts of the picture and say More of this / Wrong (and a few words); the marked picture and
//     the marks in words go to the scene's director chat.
//   · Plain sliders: Calmer ↔ Busier, Colder ↔ Warmer, Softer ↔ Harsher over the scene's own sliders and palette
//     (DirCore.plain). Dragging previews; letting go keeps it as one undo step and a time machine version.
//   · Vision card: up to 3 frames, a few words and one "should feel like" sentence per scene (Lab extras, key
//     `direction`). Each new version's thumbnail is measured against it (BoardVibe.distance), so drift shows on the
//     chip (orange) before it piles up; "Send the vision" gives it to the director.
//   · ⑂ Branches: going back to an older version and working on makes a branch in the same scene (time machine);
//     the card lists each branch's newest version, one click to go there.
// Nothing runs on a timer: the card repaints on clicks, a scene switch and a new time machine version.
const LabDirection = (() => {
  const C = DirCore;
  const S = { chip: null, card: null, dial: { busy: 0, warm: 0, harsh: 0 }, base: null, drift: new Map(), marking: null, idea: '', combine: { keep: 1, from: 2, part: 'light' }, branches: [] };
  const err = (e) => toast(String(e?.message || e), { type: 'error' });
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const scenes = () => Lab()?.scenes || null;
  const sceneId = () => scenes()?.currentId?.() || null;
  const nameOf = (id) => scenes()?.get?.(id)?.name || 'this scene';
  const dataOf = (id = sceneId()) => (id && scenes()?.extrasOf?.(id)?.direction) || {};
  const anchorOf = (id = sceneId()) => { const a = dataOf(id).anchor; return a && (a.frames?.length || a.feel || a.words) ? a : null; };
  const saveAnchor = (id, anchor) => { scenes()?.setExtras?.(id, { direction: { ...dataOf(id), anchor } }); };
  const btn = (text, title, fn, cls = '') => el('button', { type: 'button', class: `lm-btn ${cls}`.trim(), text, title, on: { click: (e) => { const b = e.currentTarget; b.disabled = true; Promise.resolve().then(fn).catch(err).finally(() => { b.disabled = false; }); } } });

  // ---------- the scene's director chat ----------
  function director() {
    const id = sceneId();
    const owner = id && typeof ChatScenes !== 'undefined' ? ChatScenes.ownerOf?.(id) : null;
    const chat = owner ? (H.chats || []).find((c) => c.id === owner) : null;
    const agent = (chat && H.agent(chat.agentId)) || H.agents().find((a) => a.dock === 'three') || null;
    return agent ? { agent, chatId: chat?.id || H.activeChat[agent.id] || null } : null;
  }
  async function tellDirector(text, images = []) {
    const d = director();
    if (!d) throw new Error('No Three Director yet: it is made the first time you open the Lab\'s chat.');
    if (d.chatId && H.activeChat[d.agent.id] !== d.chatId) Native.selectChat?.(d.agent.id, d.chatId);
    await Native.send(d.agent.id, text, { images });
    toast(`Sent to ${d.agent.name}`, { timeout: 2500 });
  }

  // ---------- the chip ----------
  function mountChip() {
    const picker = document.querySelector('.three-sketch-select');
    if (!picker) return false;
    if (!S.chip) S.chip = el('button', { type: 'button', class: 'dir-chip', dataset: { feature: 'Direction' }, on: { click: () => toggle() } });
    const after = document.querySelector('.fl-chip') || picker;
    if (S.chip.previousElementSibling !== after) after.after(S.chip);
    paintChip();
    return true;
  }
  function paintChip() {
    if (!S.chip) return;
    const d = S.drift.get(sceneId());
    const text = d ? `✦ Direction · ${d.word}` : '✦ Direction';
    if (S.chip.textContent !== text) S.chip.textContent = text;
    S.chip.title = d ? `The newest version is ${d.word} from this scene's vision card (${d.score}/100 apart)` : 'Try 4 ways, mark it up, plain sliders, the vision card and branches';
    S.chip.classList.toggle('dir-far', d?.level === 'far');
    S.chip.classList.toggle('dir-some', d?.level === 'some');
    S.chip.setAttribute('aria-expanded', String(Boolean(S.card)));
  }

  // ---------- the card ----------
  function toggle() { if (S.card) close(); else open(); }
  function close() { S.card?.remove(); S.card = null; S.base = null; S.dial = { busy: 0, warm: 0, harsh: 0 }; paintChip(); }
  function open() {
    const host = scenes()?.previewHost?.() || Lab()?.stageHooks?.host;
    if (!host || !sceneId()) { toast('Open a scene in the Lab first', { type: 'error' }); return false; }
    close();
    S.card = el('div', { class: 'dir-card', attrs: { role: 'dialog', 'aria-label': 'Direction' }, on: {
      contextmenu: (e) => e.stopPropagation(),
      keydown: (e) => { e.stopPropagation(); if (e.key === 'Escape' && !e.target.matches('input, textarea')) close(); },
    } });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(S.card);
    S.card.dataset.scene = sceneId();
    paint();
    refreshBranches();
    measureLatest();
    return true;
  }
  const section = (title, hint, ...kids) => el('div', { class: 'dir-sec' }, el('div', { class: 'dir-sec-h' }, el('b', { text: title }), hint ? el('span', { class: 'dir-hint', text: hint }) : null), ...kids);
  function paint() {
    paintChip();
    const card = S.card; const id = sceneId();
    if (!card) return;
    if (!id) { close(); return; }
    const head = el('div', { class: 'lm-head' }, el('b', { text: '✦ Direction' }), el('span', { class: 'dir-name', text: nameOf(id) }),
      el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close', on: { click: () => close() } }));
    card.replaceChildren(head, tryPart(), markPart(), dialPart(), visionPart(id), branchPart());
  }

  // ----- ✦ Try 4 ways (+ combine) -----
  function tryPart() {
    const idea = el('input', { class: 'dir-in', attrs: { type: 'text', placeholder: 'The idea, in a few words (optional)', maxlength: '200' }, value: S.idea, on: { input: (e) => { S.idea = e.target.value; } } });
    const box = section('✦ Try 4 ways', '4 helpers, 4 really different takes; you pick one (cost shown first)',
      el('div', { class: 'lm-acts' }, idea, btn('Try 4 ways', 'Four helpers each make one rough take on their own copy: colour and light · motion · form · texture', () => tryFour(), 'lm-ask')));
    const c = typeof ThreeCrew !== 'undefined' ? ThreeCrew.current() : null;
    const made = c && !['plan', 'running'].includes(c.status) ? c.helpers.filter((h) => h.changed).map((h) => h.n) : [];
    if (made.length >= 2) {
      if (!made.includes(S.combine.keep)) S.combine.keep = made[0];
      if (!made.includes(S.combine.from) || S.combine.from === S.combine.keep) S.combine.from = made.find((n) => n !== S.combine.keep);
      const sel = (key, opts) => el('select', { class: 'dir-sel', on: { change: (e) => { S.combine[key] = key === 'part' ? e.target.value : Number(e.target.value); } } },
        ...opts.map(([v, t]) => el('option', { value: String(v), text: t, ...(String(S.combine[key]) === String(v) ? { selected: true } : {}) })));
      box.append(el('div', { class: 'dir-combine' }, el('span', { text: 'Keep' }), sel('keep', made.map((n) => [n, `#${n}`])), el('span', { text: 'with' }),
        sel('part', C.COMBINE_PARTS.map((p) => [p.id, p.label])), el('span', { text: 'from' }), sel('from', made.map((n) => [n, `#${n}`])),
        btn('Ask the director', 'The director reads what that take changed and brings only that part in', () => combine())));
    }
    return box;
  }
  async function tryFour() {
    if (typeof ThreeCrew === 'undefined') throw new Error('The crew isn\'t loaded yet: try again in a moment.');
    const id = sceneId();
    const chatId = typeof ChatScenes !== 'undefined' ? ChatScenes.ownerOf?.(id) : null;
    await ThreeCrew.plan(chatId, { n: 4, brief: C.tryBrief(S.idea, anchorOf(id)), angles: C.TRY_ANGLES });
    toast('The crew panel shows what it will cost: press Start 4 helpers', { timeout: 5000 });
  }
  async function combine() {
    const { keep, from, part } = S.combine;
    if (!keep || !from || keep === from) throw new Error('Pick two different takes.');
    await tellDirector(C.combineText(keep, from, part));
  }

  // ----- ◯ Mark it up -----
  function markPart() {
    return section('◯ Mark it up', 'circle what you like or what\'s wrong, right on the picture',
      el('div', { class: 'lm-acts' }, btn('Mark it up', 'Freezes the picture: drag circles, say More of this or Wrong, then send', () => markUp(), 'lm-ask')));
  }
  async function markUp() {
    const host = scenes()?.previewHost?.() || Lab()?.stageHooks?.host;
    const url = await Lab()?.director?.shot?.();
    if (!host || !url) throw new Error('No picture: the scene isn\'t drawing right now.');
    endMarking();
    const img = el('img', { class: 'dir-mk-img', src: url, alt: '' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dir-mk-svg');
    const bar = el('div', { class: 'dir-mk-bar' });
    const pop = el('div', { class: 'dir-mk-pop', hidden: true });
    const layer = el('div', { class: 'dir-mk', attrs: { role: 'dialog', 'aria-label': 'Mark it up' }, on: { keydown: (e) => { e.stopPropagation(); if (e.key === 'Escape') endMarking(); } } }, img, svg, pop, bar);
    layer.tabIndex = -1;
    const M = S.marking = { layer, img, svg, bar, pop, url, marks: [], drag: null };
    host.append(layer);
    layer.focus();
    const box = () => img.getBoundingClientRect();
    const at = (e) => { const r = box(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: r.width, h: r.height }; };
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !pop.hidden) return;
      const p = at(e); if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
      M.drag = { x: p.x, y: p.y, r: 0.04, kind: null, note: '' };
      svg.setPointerCapture(e.pointerId); paintMarks();
    });
    svg.addEventListener('pointermove', (e) => { if (!M.drag) return; const p = at(e); M.drag.r = Math.max(0.03, Math.min(0.5, Math.hypot((p.x - M.drag.x) * p.w, (p.y - M.drag.y) * p.h) / p.w)); paintMarks(); });
    svg.addEventListener('pointerup', () => { if (!M.drag) return; const m = M.drag; M.drag = null; M.marks.push(m); paintMarks(); ask(m); });
    paintMarks();
  }
  // the new circle: More of this / Wrong, and a few words if you like
  function ask(m) {
    const M = S.marking; if (!M) return;
    const note = el('input', { class: 'dir-in', attrs: { type: 'text', placeholder: 'A few words (optional)', maxlength: '160' } });
    const pick = (kind) => { m.kind = kind; m.note = note.value.trim(); M.pop.hidden = true; paintMarks(); };
    M.pop.replaceChildren(
      el('button', { type: 'button', class: 'lm-btn dir-more', text: 'More of this', on: { click: () => pick('more') } }),
      el('button', { type: 'button', class: 'lm-btn dir-wrong', text: 'Wrong', on: { click: () => pick('wrong') } }),
      note,
      el('button', { type: 'button', class: 'lm-btn', text: 'Remove', on: { click: () => { M.marks = M.marks.filter((x) => x !== m); M.pop.hidden = true; paintMarks(); } } }));
    const r = M.img.getBoundingClientRect(); const hr = M.layer.getBoundingClientRect();
    M.pop.style.left = `${Math.max(4, Math.min(hr.width - 260, r.left - hr.left + m.x * r.width - 120))}px`;
    M.pop.style.top = `${Math.max(4, Math.min(hr.height - 90, r.top - hr.top + (m.y + m.r * (r.width / r.height)) * r.height + 8))}px`;
    M.pop.hidden = false;
    note.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(m.kind || 'more'); });
  }
  const COLOR = { more: '#3ddc84', wrong: '#ff4d4d' };
  function paintMarks() {
    const M = S.marking; if (!M) return;
    const r = M.img.getBoundingClientRect(); const hr = M.layer.getBoundingClientRect();
    Object.assign(M.svg.style, { left: `${r.left - hr.left}px`, top: `${r.top - hr.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    M.svg.setAttribute('viewBox', `0 0 ${r.width || 1} ${r.height || 1}`);
    const all = [...M.marks, ...(M.drag ? [M.drag] : [])];
    M.svg.replaceChildren(...all.flatMap((m, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', m.x * r.width); c.setAttribute('cy', m.y * r.height); c.setAttribute('r', m.r * r.width);
      c.setAttribute('class', `dir-mk-c ${m.kind || 'open'}`);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', m.x * r.width); t.setAttribute('y', m.y * r.height - m.r * r.width - 6); t.setAttribute('class', `dir-mk-n ${m.kind || 'open'}`);
      t.textContent = String(i + 1);
      return [c, t];
    }));
    const ready = M.marks.filter((m) => m.kind).length;
    M.bar.replaceChildren(
      el('span', { class: 'dir-hint', text: M.marks.length ? `${ready} mark${ready === 1 ? '' : 's'} · green = more of this, red = wrong` : 'Drag on the picture to circle a part' }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'lm-btn', text: 'Cancel', on: { click: () => endMarking() } }),
      el('button', { type: 'button', class: 'lm-btn', text: 'Clear', disabled: !M.marks.length, on: { click: () => { M.marks = []; M.pop.hidden = true; paintMarks(); } } }),
      btn(`Send to the director${ready ? ` (${ready})` : ''}`, 'The marked picture and the marks in words go to this scene\'s director chat', () => sendMarks(), 'lm-ask'));
  }
  async function sendMarks() {
    const M = S.marking; if (!M) return;
    const marks = M.marks.filter((m) => m.kind);
    if (!marks.length) throw new Error('Circle a part and choose More of this or Wrong first.');
    const pic = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The picture could not be read.')); i.src = M.url; });
    const cv = document.createElement('canvas'); cv.width = pic.naturalWidth; cv.height = pic.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(pic, 0, 0);
    const lw = Math.max(3, cv.width / 220);
    marks.forEach((m, i) => {
      g.strokeStyle = COLOR[m.kind]; g.fillStyle = COLOR[m.kind]; g.lineWidth = lw;
      g.beginPath(); g.arc(m.x * cv.width, m.y * cv.height, m.r * cv.width, 0, Math.PI * 2); g.stroke();
      g.font = `700 ${Math.round(lw * 6)}px system-ui, sans-serif`; g.textAlign = 'center';
      g.fillText(String(i + 1), m.x * cv.width, m.y * cv.height - m.r * cv.width - lw * 2);
    });
    const data = cv.toDataURL('image/jpeg', 0.88).split(',')[1];
    const path = await window.hub.saveAttachment(`markup-${Date.now()}.jpg`, data);
    await tellDirector(C.markText(marks, nameOf(sceneId())), path ? [path] : []);
    endMarking();
  }
  function endMarking() { S.marking?.layer.remove(); S.marking = null; }

  // ----- plain sliders -----
  const DIALS = [['busy', 'Calmer', 'Busier'], ['warm', 'Colder', 'Warmer'], ['harsh', 'Softer', 'Harsher']];
  function dialPart() {
    const rows = DIALS.map(([k, lo, hi]) => {
      const out = el('span', { class: 'dir-dv', text: C.dialWord(k, S.dial[k]) || '·' });
      const input = el('input', { class: 'dir-range', attrs: { type: 'range', min: '-100', max: '100', step: '1', 'aria-label': `${lo} to ${hi}` }, value: String(Math.round(S.dial[k] * 100)),
        on: { input: (e) => { S.dial[k] = Number(e.target.value) / 100; out.textContent = C.dialWord(k, S.dial[k]) || '·'; dial(true).catch(err); },
          change: () => dial(false).catch(err) } });
      return el('div', { class: 'dir-row' }, el('span', { class: 'dir-lo', text: lo }), input, el('span', { class: 'dir-hi', text: hi }), out);
    });
    return section('Plain sliders', 'over the scene\'s own sliders and colours', ...rows,
      el('div', { class: 'lm-acts' }, btn('Back to the middle', 'Every plain slider back to the middle: the scene as it was when you opened this card', async () => { S.dial = { busy: 0, warm: 0, harsh: 0 }; await dial(false); paint(); })));
  }
  const hooks = () => Lab()?.stageHooks || {};
  async function baseNow() {
    if (S.base && S.base.scene === sceneId()) return S.base;
    if (typeof VarCore === 'undefined') await window.Lazy?.load?.('labvar');
    const d = Lab()?.director;
    if (!d || typeof VarCore === 'undefined') throw new Error('The Lab is not ready yet.');
    const list = [];
    for (const L of d.layers().layers || []) {
      let sl = [];
      try { sl = d.sliders(L.id)?.sliders || []; } catch { continue; }
      const keys = hooks().layerById?.(L.id)?.keys || {};
      for (const s of sl) list.push({ ...s, layer: L.id, layerName: L.name, keyed: Boolean(keys[`s:${s.key}`]?.length) });
    }
    const params = VarCore.params(list);
    S.base = { scene: sceneId(), params, values: Object.fromEntries(params.map((p) => [p.id, p.value])), palette: (d.refs?.palette?.() || []).slice() };
    return S.base;
  }
  let dialBusy = false; let dialAgain = null;
  async function dial(quiet) {
    if (dialBusy) { dialAgain = quiet; return; }
    dialBusy = true;
    try {
      const B = await baseNow();
      if (!B.params.length && !B.palette.length) { if (!quiet) toast('This scene has no sliders yet: ask the director to "add sliders for the main knobs".', { timeout: 5000 }); return; }
      const values = C.plain(B.params, B.values, S.dial);
      const kept = B.kept || B.values; // what the last let-go kept (the sliders' own undo starts from there)
      const put = (vals, from, remember) => {
        for (const [layer, set] of Object.entries(VarCore.byLayer(B.params, vals, from))) { try { hooks().ctlOf?.(layer)?.setMany(set, remember ? undefined : { remember: false }); } catch { /* the layer went away */ } }
      };
      if (quiet) put(values, null, false);
      else {
        // letting go: back to what was kept (quietly), then the new values as one undo step per layer
        put(kept, null, false);
        put(values, kept, true);
        B.kept = values;
        window.LabAB?.note?.('direction', { label: '✦ Plain sliders' });
        window.ThreeHistory?.changed?.('sliders');
      }
      if (B.palette.length) Lab()?.director?.refs?.setPalette?.(B.palette.map((h) => C.warmHex(h, S.dial.warm)));
    } finally {
      dialBusy = false;
      if (dialAgain != null) { const q = dialAgain; dialAgain = null; dial(q).catch(err); }
    }
  }

  // ----- the vision card -----
  function visionPart(id) {
    const a = dataOf(id).anchor || { frames: [], words: '', feel: '' };
    const frames = el('div', { class: 'dir-frames' }, ...(a.frames || []).map((f, i) => el('div', { class: 'dir-frame' }, el('img', { src: f.url, alt: `Vision frame ${i + 1}` }),
      el('button', { type: 'button', class: 'dir-fx', text: '✕', title: 'Remove this frame', on: { click: () => { saveAnchor(id, { ...a, frames: a.frames.filter((_, j) => j !== i) }); S.drift.delete(id); paint(); measureLatest(); } } }))));
    const words = el('input', { class: 'dir-in', attrs: { type: 'text', placeholder: 'A few words: e.g. slow, wet neon, lonely', maxlength: '120' }, value: a.words || '' });
    const feel = el('input', { class: 'dir-in', attrs: { type: 'text', placeholder: 'It should feel like… (one sentence)', maxlength: '200' }, value: a.feel || '' });
    const keep = () => { const now = dataOf(id).anchor || a; if ((now.words || '') === words.value.trim() && (now.feel || '') === feel.value.trim()) return; saveAnchor(id, { ...now, frames: now.frames || [], words: words.value.trim(), feel: feel.value.trim(), at: Date.now() }); paintChip(); };
    words.addEventListener('change', keep); feel.addEventListener('change', keep);
    const d = S.drift.get(id);
    const status = anchorOf(id)?.frames?.length
      ? el('div', { class: `dir-drift ${d?.level || ''}`, text: d ? `Newest version: ${d.word} (${d.score}/100 apart)` : 'Measured on the next version' })
      : el('div', { class: 'dir-hint', text: 'Add 1–3 frames of what it should look like: each new version is measured against them.' });
    return section('Vision card', 'what it should feel like, kept beside the scene', frames, words, feel, status,
      el('div', { class: 'lm-acts' },
        btn('Add this frame', 'The picture on screen now becomes one of the vision\'s frames (up to 3)', () => addFrame(id)),
        btn('Send the vision to the director', 'The frames, the words and the sentence go to this scene\'s director chat', () => sendVision(id), 'lm-ask')));
  }
  async function vibeOf(url) {
    if (typeof BoardVibe === 'undefined') await window.Lazy?.load?.('board');
    if (typeof BoardVibe === 'undefined') return null;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, cv.width, cv.height);
    return BoardVibe.fromPixels(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
  }
  async function smallShot(px = 240) {
    const url = await Lab()?.director?.shot?.();
    if (!url) return null;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  }
  async function addFrame(id) {
    const a = dataOf(id).anchor || { frames: [], words: '', feel: '' };
    if ((a.frames || []).length >= 3) throw new Error('The vision has 3 frames: remove one first.');
    const url = await smallShot();
    if (!url) throw new Error('No picture: the scene isn\'t drawing right now.');
    const vibe = await vibeOf(url).catch(() => null);
    saveAnchor(id, { ...a, frames: [...(a.frames || []), { url, vibe, at: Date.now() }], at: Date.now() });
    paint();
    measureLatest();
  }
  async function sendVision(id) {
    const a = anchorOf(id);
    if (!a) throw new Error('Add a frame or a sentence to the vision first.');
    const images = [];
    for (const [i, f] of (a.frames || []).entries()) { const p = await window.hub.saveAttachment(`vision-${id}-${i + 1}.jpg`, f.url.split(',')[1]).catch(() => null); if (p) images.push(p); }
    await tellDirector(C.anchorText(a, nameOf(id)), images);
  }
  // a new version's thumbnail against the vision frames (only for scenes with a vision; one measure per version)
  async function measure(id, url) {
    const a = anchorOf(id);
    const frames = (a?.frames || []).filter((f) => f.vibe);
    if (!frames.length || !url || typeof BoardVibe === 'undefined') { if (!frames.length) S.drift.delete(id); return; }
    const now = await vibeOf(url).catch(() => null);
    if (!now) return;
    const d = C.driftOf(frames.map((f) => BoardVibe.distance(f.vibe, now)));
    if (d) S.drift.set(id, d); else S.drift.delete(id);
    if (id === sceneId()) { paintChip(); if (S.card) paint(); }
  }
  async function measureLatest(id = sceneId()) {
    if (!anchorOf(id)?.frames?.length || !window.ThreeHistory) return;
    if (typeof BoardVibe === 'undefined') await window.Lazy?.load?.('board').catch(() => {});
    const list = await ThreeHistory.list(id).catch(() => []);
    const th = await ThreeHistory.thumbs(id).catch(() => ({}));
    const v = [...list].reverse().find((x) => th[x.id]);
    if (v) await measure(id, th[v.id]);
  }

  // ----- ⑂ branches -----
  async function refreshBranches() {
    const id = sceneId();
    S.branches = window.ThreeHistory?.branches ? await ThreeHistory.branches(id).catch(() => []) : [];
    if (S.card && S.card.dataset.scene === id) paint();
  }
  function branchPart() {
    const list = S.branches || [];
    if (list.length < 2) return section('⑂ Branches', 'go back to any version in the ⏱ time machine and keep working: that starts a branch here, nothing is lost');
    const when = (t) => window.ThreeHistory?.fmtWhen?.(t) || new Date(t).toLocaleTimeString();
    return section('⑂ Branches', `${list.length} lines in this scene`, el('div', { class: 'dir-branches' }, ...list.slice(0, 6).map((b) => el('div', { class: `dir-branch${b.current ? ' on' : ''}` },
      el('span', { class: 'dir-bl', text: b.label, title: b.label }), el('span', { class: 'dir-hint', text: `${when(b.at)} · ${b.length} versions` }),
      b.current ? el('span', { class: 'dir-hint', text: 'you are here' }) : btn('Go there', 'Puts the scene back to this branch\'s newest version (undoable; nothing is lost)', async () => { await ThreeHistory.restore(b.id); await refreshBranches(); })))));
  }

  // ---------- wiring (events only) ----------
  addEventListener('hearth:lab-ready', () => mountChip());
  addEventListener('hearth:sketch', () => {
    if (!mountChip()) return;
    endMarking();
    if (S.card && S.card.dataset.scene !== sceneId()) { S.base = null; S.dial = { busy: 0, warm: 0, harsh: 0 }; S.card.dataset.scene = sceneId(); paint(); refreshBranches(); measureLatest(); }
  });
  addEventListener('hearth:tm-thumb', (e) => { const { id, url } = e.detail || {}; if (id && anchorOf(id)?.frames?.length) measure(id, url).catch(() => null); if (S.card && id === sceneId()) refreshBranches(); });
  addEventListener('hearth:lab-scenes-arrived', () => { if (S.card) paint(); });
  mountChip();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: ✦ Direction (Try 4 ways, Mark it up, plain sliders, vision card, branches)', async () => { try { await ThreeLab.cmd({ show: true }); mountChip(); if (!S.card) open(); } catch (e) { err(e); } });

  return { open, close, toggle, tryFour, combine, markUp, sendMarks, endMarking, dial, addFrame, sendVision, measure, refreshBranches, mountChip,
    get card() { return S.card; }, get chip() { return S.chip; }, get marking() { return S.marking; }, _S: S };
})();
window.LabDirection = LabDirection;
