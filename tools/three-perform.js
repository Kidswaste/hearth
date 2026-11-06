// ◉ Perform (round 131, perform131): the Lab as a live instrument while the song (or live sound) plays.
// docs/upgrades/perform131.md. Opened from ▣ Present's right-click menu (◉ Perform), /perform or Ctrl/⌘+K.
// It builds on what was there and adds no second copy of it:
//   output      the Stage window (its own window and process, never throttled) full screen on the other screen, at
//               the screen's own rate (ThreeStage.output); with one screen, the Lab's preview full screen here
//   tempo       ThreeStage's clock: the song's grid while it plays, else MIDI clock in, else your taps (T)
//   looks       a look is PLAYED on top of your sliders (ThreeTweaks playLook: never saved; leaving gives them back)
//   MIDI        ThreeStageMidi's learn: a pad or a key learns any Perform action ("perform:…" in ThreeStage.act)
//   black-out   ThreeStage.blackout (the output too), with a fade
// Keys while performing: 1–9 cues · Q W E R Y U I O P looks (selected layer) · Space freeze · B black-out · T tap ·
// 0 now / beat / bar · Enter play / pause the song · H hide the strip · Esc leave.
// Safety: nothing here changes the saved scene. With "● Rec" ticked, the switches are written to the timeline as cues
// when you stop (leave, or untick), as ONE undo step (the toast's Undo, Ctrl/⌘+Z in the Lab).
// Speed: a switch is a seek and a few slider messages (no reload, no compile); each one's own work is timed (stats).
// The AI: three_do perform { setup } prepares a set (cues and looks on keys) that the owner reviews before it's used.
// Lazy group "perform" (after "lab").
const ThreePerform = (() => {
  const C = () => PerformCore;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const hk = () => Lab()?.stageHooks || null;
  const player = () => hk()?.player || null;
  const Stage = () => window.ThreeStage || null;
  const sid = () => hk()?.sketchId?.() || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 4000 });
  const SETS = 'three.perform.sets'; const PENDING = 'three.perform.pending';
  const P = { on: false, where: null, strip: null, parts: {}, hidden: false, rec: false, events: [], recSid: null, held: new Map(), pend: { cue: null, look: null }, fpsBefore: null, outBefore: false, froze: false, timer: 0, thumbs: new Map(), prepping: false, lastCue: null, fps: null, full: false, mapKey: '' };
  const stats = { enters: 0, switches: [], recorded: 0, undone: 0, ops: 0 };
  let lastRec = null;

  // ---------- the set: which key does what (the scene's own, else the defaults) ----------
  const setsAll = () => store.get(SETS, {}) || {};
  const setOf = (id = sid()) => (id && setsAll()[id]) || null;
  function saveSet(id, set) { if (!id) return; const all = setsAll(); if (set) all[id] = set; else delete all[id]; const ks = Object.keys(all); if (ks.length > 64) delete all[ks[0]]; store.set(SETS, all); }
  const pendingOf = (id = sid()) => (id && (store.get(PENDING, {}) || {})[id]) || null;
  function setPending(id, set) { if (!id) return; const all = store.get(PENDING, {}) || {}; if (set) all[id] = set; else delete all[id]; store.set(PENDING, all); }
  const quant = () => store.get('three.perform.quant', setOf()?.quant || 'bar');
  const setQuant = (q) => { store.set('three.perform.quant', q); paint(); return q; };
  // the layer whose looks Q W E… play: the set's, else the selected one
  function lookLayer() { const h = hk(); const want = setOf()?.layer; if (want && h?.ctlOf(want)) return want; return h?.layer()?.id || null; }
  function cuesNow() { const p = player(); return p && p.duration > 0 ? p.cues : []; }
  function looksNow() { const id = lookLayer(); return id ? hk()?.ctlOf(id)?.looksApi?.list?.() || [] : []; }
  const map = () => C().keymap({ cues: cuesNow(), looks: looksNow(), set: setOf() });

  // ---------- quantising: the next beat / bar of the song while it plays, else the stage's tempo (taps, MIDI) ----------
  function waitFor(q) {
    if (q === 'now') return 0;
    const p = player();
    if (p?.loaded && p.playing) { const w = p.untilNext(q); return w == null || w > 8 ? 0 : w; }
    const S = Stage(); if (!S || S.source() === 'free') return 0; // no song playing, no tempo yet: now
    const w = S.untilNext(q); return w == null || w > 8 ? 0 : w;
  }
  function schedule(kind, label, fn) {
    clearTimeout(P.pend[kind]?.timer);
    const w = waitFor(quant());
    if (w < 0.004) { P.pend[kind] = null; timed(kind, fn, 0); paint(); return 0; }
    const due = performance.now() + w * 1000;
    P.pend[kind] = { label, due, timer: setTimeout(() => { P.pend[kind] = null; timed(kind, fn, performance.now() - due); paint(); }, Math.max(0, w * 1000 - 3)) };
    paint();
    return w;
  }
  // a switch's own work, timed (the check holds it under one frame of the 240 Hz screen)
  function timed(kind, fn, late) {
    const t0 = performance.now();
    try { fn(); } catch (e) { err(e); }
    const ms = performance.now() - t0;
    stats.switches.push({ kind, ms: Math.round(ms * 100) / 100, late: Math.round(late * 10) / 10, at: Math.round(t0) });
    if (stats.switches.length > 200) stats.switches.shift();
  }

  // ---------- the switches ----------
  // a cue: the playhead to it (on the beat / bar), its looks on their layers (the same looks playback would give)
  function cue(n) {
    const row = map().cues.find((c) => c.key === String(n));
    if (!row) { toast(cuesNow().length ? `No cue on ${n}` : 'No cues yet: ✦ Map to the song or Sections ▾ makes them', { timeout: 1800 }); return null; }
    schedule('cue', row.key, () => landCue(row));
    return row.name;
  }
  function landCue(row) {
    const p = player(); const h = hk();
    if (P.rec && p) P.events.push({ t: p.time, kind: 'cue', name: row.name, looks: row.looks || [] });
    // each layer: the look of the last cue at or before this one that set one for it (what onCue gives while playing)
    const all = p.cues; const idx = all.findIndex((c) => Math.abs(c.time - row.time) < 0.02 && c.name === row.name);
    P.held.clear();
    for (const L of h?.layers?.() || []) {
      const c = h.ctlOf(L.id); if (!c?.playLook) continue;
      let want = null; for (let k = 0; k <= idx; k += 1) { const l = all[k].looks?.find((x) => x.layer === L.id || x.layer === L.name); if (l) want = l.name; }
      if (want) { if (c.playingLook !== want) c.playLook(want, 250); } else if (c.playingLook) c.endLook();
    }
    p.seek(row.time);
    P.lastCue = row;
  }
  function look(i) {
    const row = map().looks[i] || map().looks.find((l) => l.key === i);
    const id = lookLayer();
    if (!row || !id) { toast(looksNow().length ? 'No look on that key' : 'No saved looks on this layer yet (Sliders ▸ Looks ▸ Save)', { timeout: 1800 }); return null; }
    schedule('look', row.key, () => {
      const c = hk()?.ctlOf(id); if (!c?.playLook) return;
      c.playLook(row.name, 250);
      P.held.set(id, row.name);
      const p = player();
      if (P.rec && p) P.events.push({ t: p.time, kind: 'look', name: row.name, layer: id });
    });
    return row.name;
  }
  const holds = (id) => P.on && P.held.has(id);
  function freeze() { const h = hk(); if (!h) return false; const on = !h.frozen; h.setFreeze(on); if (on) P.froze = true; paint(); return on; }
  function black(on) { const S = Stage(); if (!S) return false; const want = on ?? !S.state.black; const r = S.blackout(want, 600); paint(); return r; }
  function tap() {
    const p = player();
    if (p?.loaded && p.playing) { toast('The song sets the tempo (tap works for live sound)', { timeout: 1500 }); return p.bpm; }
    const b = Stage()?.tap(); paint(); return b;
  }
  function playPause() { const p = player(); if (p?.loaded) p.toggle(); paint(); }

  // ---------- record: the switches as cues, ONE undo step ----------
  function setRec(on) {
    if (on && !(player()?.duration > 0)) { toast('Recording needs the song (or the scene\'s timeline) loaded', { timeout: 2200 }); on = false; }
    if (!on && P.rec) finishRec();
    P.rec = Boolean(on); P.events = []; P.recSid = on ? sid() : null;
    paint();
    return P.rec;
  }
  function finishRec() {
    const add = C().recorded(P.events); P.events = [];
    const p = player();
    if (!add.length || !p || P.recSid !== sid()) { if (add.length) toast('The scene changed while recording: nothing was written', { timeout: 2500 }); return null; }
    const before = p.timeline().cues.map((c) => ({ time: c.time, name: c.name, ...(c.looks?.length ? { looks: c.looks.map((l) => ({ ...l })) } : {}) }));
    p.editCues({ add, undo: false });
    const rec = { sid: sid(), before, undone: false, n: add.length };
    lastRec = rec; stats.recorded += add.length;
    const label = `Performance (${add.length} cue${add.length === 1 ? '' : 's'})`;
    window.LabDirect?.push?.(null, label, () => undoRec({ quiet: true }));
    toast(`● Recorded: ${add.length} switch${add.length === 1 ? '' : 'es'} on the timeline as cues`, { timeout: 6000, action: { label: 'Undo', fn: () => undoRec() } });
    return add;
  }
  function undoRec({ quiet = false } = {}) {
    const r = lastRec;
    if (!r || r.undone || r.sid !== sid()) { if (!quiet) toast('Nothing to undo.', { timeout: 1500 }); return false; }
    r.undone = true; stats.undone += 1;
    player()?.editCues({ clear: true, add: r.before, undo: false });
    if (!quiet) toast('↶ The recorded performance is undone', { timeout: 1500 });
    return true;
  }

  // ---------- the next cue's picture: made before the show (never while it plays: no frame is spent on it) ----------
  const thumbKey = (c) => `${sid()}|${Math.round(c.time * 100)}`;
  async function prepThumbs() {
    const p = player(); const h = hk();
    if (!p?.loaded || p.playing || !h) return 0;
    const list = map().cues.filter((c) => !P.thumbs.has(thumbKey(c)));
    if (!list.length) return 0;
    P.prepping = true; paint();
    const was = p.time; let n = 0;
    try {
      for (const c of list) {
        if (!P.on || p.playing) break;
        p.seek(c.time + 0.05); await sleep(320);
        const url = (await h.box.cover?.(600)) || (await Lab()?.shot?.()) || null;
        if (url) { P.thumbs.set(thumbKey(c), url); n += 1; }
      }
    } finally { if (!p.playing) p.seek(was); P.prepping = false; paint(); }
    return n;
  }

  // ---------- in and out ----------
  async function displays() { try { return (await window.hub.stageDisplays?.()) || []; } catch { return []; } }
  async function start({ screen } = {}) {
    if (P.on) return state();
    if (!hk()) await Lab()?.cmd?.({ show: true });
    const h = hk(); if (!h) throw new Error('Open the Three.js Lab first');
    const want = screen ?? store.get('three.perform.screen', 'auto');
    const ds = await displays();
    const other = ds.find((d) => (want !== 'auto' && want !== 'here' ? d.id === want : !d.hub));
    P.where = want !== 'here' && other ? 'output' : 'here';
    P.on = true; P.held.clear(); P.events = []; P.rec = false; P.froze = false; P.hidden = false; P.mapKey = '';
    P.fpsBefore = h.fps; P.outBefore = h.onStage;
    stats.enters += 1;
    buildStrip();
    h.host.classList.add('perform-on');
    if (P.where === 'output') {
      try { await Stage().output(true, { display: other.id }); } catch (e) { err(e); }
    } else {
      P.full = false;
      try { await h.host.requestFullscreen(); P.full = document.fullscreenElement === h.host; } catch { /* no fullscreen without a press: the whole window instead */ }
      if (!P.full) h.host.classList.add('perform-window');
    }
    h.setFps(0); // as fast as the screen (240 Hz on a 240 Hz screen)
    addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFull);
    P.timer = setInterval(tick, 250);
    paint();
    toast(`◉ Perform${P.where === 'output' ? ` on ${other.label}` : ''}: 1–9 cues · Q W E looks · Space freeze · B black-out · Esc leaves`, { timeout: 3500 });
    if (pendingOf()) setTimeout(() => review(), 400);
    prepThumbs().catch(() => {});
    return state();
  }
  function onFull() { const h = hk(); if (P.on && P.where === 'here' && P.full && document.fullscreenElement !== h?.host) leave(); }
  function leave() {
    if (!P.on) return false;
    const h = hk();
    for (const k of ['cue', 'look']) { clearTimeout(P.pend[k]?.timer); P.pend[k] = null; }
    if (P.rec) { finishRec(); P.rec = false; }
    // looks played here go: each layer back to its own sliders (or the playing cue's look)
    const p = player();
    for (const id of P.held.keys()) h?.ctlOf(id)?.endLook?.();
    window.LabDials?.performEnd?.(); // (round 135, mooddial135) the dials turned here go back
    window.LabFavs?.performEnd?.(); window.LabFavs?.close?.(); // (round 138, favs138) ★ favourites moved here go back
    P.held.clear();
    // paused: a cue's looks played by a jump go too (playback plays cue looks only while it plays; playing, they stay)
    if (!p?.playing) for (const L of h?.layers?.() || []) { const c = h.ctlOf(L.id); if (c?.playingLook) c.endLook(); }
    P.on = false;
    removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFull);
    clearInterval(P.timer); P.timer = 0;
    if (Stage()?.state.black) Stage().blackout(false, 300);
    if (P.froze && h?.frozen) h.setFreeze(false);
    if (h) {
      if (P.fpsBefore != null) h.setFps(P.fpsBefore);
      h.host.classList.remove('perform-on', 'perform-window');
      if (P.where === 'output' && !P.outBefore) Stage()?.output(false).catch?.(() => {});
      if (P.full && document.fullscreenElement === h.host) document.exitFullscreen().catch(() => {});
    }
    P.full = false;
    P.strip?.remove(); P.strip = null; P.parts = {};
    return true;
  }

  // ---------- keys (capture: ahead of Present's and the timeline's own) ----------
  const editable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  function onKey(e) {
    if (!P.on || e.defaultPrevented || editable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let done = true;
    if (k === 'Escape') leave();
    else if (P.prepping) done = k !== 'Tab';
    else if (/^[1-9]$/.test(k)) cue(k);
    else if (C().LOOK_KEYS.includes(k)) look(C().LOOK_KEYS.indexOf(k));
    else if (k === ' ') freeze();
    else if (k === 'b') black();
    else if (k === 't') tap();
    else if (k === '0') setQuant(C().nextQuant(quant()));
    else if (k === 'Enter') playPause();
    else if (k === 'h') { P.hidden = !P.hidden; paint(); }
    else if ((k === 'ArrowUp' || k === 'ArrowDown' || k === '[' || k === ']') && hk()?.dials?.()?.list?.length) dial(k); // (round 135, mooddial135) 🎛 the selected dial ↑ / ↓, [ / ] another
    else done = false;
    if (!done) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }

  // (round 135, mooddial135) 🎛 mood dials (tools/three-dials.js): live only, put back when Perform ends
  async function dial(k) {
    try {
      if (typeof LabDials === 'undefined' && window.Lazy) await Lazy.load('dials');
      if (k === '[' || k === ']') LabDials.performPick(k === ']' ? 1 : -1); else LabDials.perform(k === 'ArrowUp' ? 1 : -1);
    } catch (e) { err(e); }
  }

  // ---------- MIDI and keys learned: ThreeStageMidi's learn, the actions "perform:…" ----------
  const ACTS = [...C().CUE_KEYS.map((n) => [`cue${n}`, `Perform: cue ${n}`]), ...C().LOOK_KEYS.map((k, i) => [`look${i + 1}`, `Perform: look ${k.toUpperCase()}`]),
    ['freeze', 'Perform: freeze'], ['black', 'Perform: black-out'], ['tap', 'Perform: tap tempo'], ['quant', 'Perform: now / beat / bar'], ['play', 'Perform: play / pause the song'], ['go', 'Perform: start / leave']];
  function wireStage() { const S = Stage(); if (S?.ACTION_NAME) for (const [a, l] of ACTS) S.ACTION_NAME[`perform:${a}`] = l; }
  wireStage();
  async function act(a) {
    let m = /^cue(\d)$/.exec(a); if (m) return cue(m[1]);
    m = /^look(\d)$/.exec(a); if (m) return look(Number(m[1]) - 1);
    if (a === 'freeze') return freeze();
    if (a === 'black') return black();
    if (a === 'tap') return tap();
    if (a === 'quant') return setQuant(C().nextQuant(quant()));
    if (a === 'play') return playPause();
    if (a === 'go') return P.on ? leave() : start();
    return null;
  }
  function learnItems() {
    const M = window.ThreeStageMidi;
    if (!M) return ['MIDI needs the Lab\'s live tools'];
    const mp = map();
    return [
      `Hit a pad, turn a knob or press a key after picking · ${M.summary()}`,
      ...mp.cues.map((c) => ({ label: `${c.key} · ${c.name}`, hint: 'cue', action: () => M.startLearn({ kind: 'action', action: `perform:cue${c.key}` }) })),
      ...mp.looks.map((l, i) => ({ label: `${l.key.toUpperCase()} · ${l.name}`, hint: 'look', action: () => M.startLearn({ kind: 'action', action: `perform:look${i + 1}` }) })),
      ...ACTS.slice(18).map(([a, l]) => ({ label: l.replace('Perform: ', ''), action: () => M.startLearn({ kind: 'action', action: `perform:${a}` }) })),
      { label: 'Everything learned…', items: () => M.menuItems() },
    ];
  }

  // ---------- the strip: one small row on the owner's screen (H hides it) ----------
  function buildStrip() {
    const h = hk();
    const b = (cls, text, title, fn) => el('button', { class: `pf-btn ${cls}`, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn(e)).catch(err); } } });
    const Pp = P.parts = {};
    Pp.tempo = b('pf-tempo', '', 'Tempo: the song while it plays, else your taps (T) or MIDI clock · click: tap', () => tap());
    Pp.quant = b('pf-quant', '', 'Switches land: now, on the next beat, or on the next bar (0)', () => setQuant(C().nextQuant(quant())));
    Pp.cues = el('span', { class: 'pf-cues' });
    Pp.looks = el('span', { class: 'pf-looks' });
    Pp.thumb = el('img', { class: 'pf-thumb', alt: '', hidden: true });
    Pp.nextName = el('span', { class: 'pf-next-name' });
    Pp.next = el('span', { class: 'pf-next', title: 'The next cue' }, Pp.thumb, Pp.nextName);
    Pp.play = b('pf-play', '▶', 'Play / pause the song (Enter)', () => playPause());
    Pp.freeze = b('pf-freeze', '❚❚', 'Freeze / unfreeze (Space)', () => freeze());
    Pp.black = b('pf-black', '■', 'Black-out with a fade (B)', () => black());
    Pp.recBox = el('input', { type: 'checkbox', class: 'pf-rec-box', on: { change: (e) => setRec(e.target.checked) } });
    Pp.rec = el('label', { class: 'pf-rec', title: 'Record this performance: your switches go on the timeline as cues when you stop (one undo)' }, Pp.recBox, ' ● Rec');
    Pp.ai = b('pf-ai', '✦ Set', 'The director prepared a set for this scene: review it', () => review());
    Pp.note = el('span', { class: 'pf-note' });
    // (round 138, favs138) ★ the scene's favourite controls: folded to this button, a click opens the column here (live only)
    Pp.favs = b('pf-favs', '★', 'Your ★ favourite controls (moves here are live only, put back when you leave)', (e) => (window.Lazy && typeof LabFavs === 'undefined' ? Lazy.load('favs') : Promise.resolve()).then(() => LabFavs.toggle(null, { anchor: e.currentTarget })));
    const strip = el('div', { class: 'pf-strip', attrs: { role: 'toolbar', 'aria-label': 'Perform' } },
      el('span', { class: 'pf-dot', text: '◉' }), Pp.tempo, Pp.quant, Pp.cues, Pp.looks, Pp.next, Pp.play, Pp.freeze, Pp.black, Pp.rec, Pp.ai, Pp.favs, Pp.note,
      b('pf-learn', '🎛', 'MIDI learn: a pad, knob or key for any cue, look or action', (e) => showMenu(e.clientX, e.clientY - 8, learnItems())),
      b('pf-more', '⋯', 'Screen, cue pictures, keys', (e) => showMenu(e.clientX, e.clientY - 8, moreItems())),
      b('pf-hide', '▾', 'Hide the strip (H shows it again)', () => { P.hidden = true; paint(); }),
      b('pf-leave', '✕', 'Leave Perform (Esc)', () => leave()));
    P.strip = strip;
    h.host.append(strip);
  }
  function moreItems() {
    const cur = store.get('three.perform.screen', 'auto');
    return [
      'Perform',
      { label: 'Screen', hint: P.where === 'output' ? 'the other screen' : 'this one', items: async () => [
        { label: 'Automatic', hint: 'the other screen when there is one', checked: cur === 'auto', action: () => restart('auto') },
        { label: 'This screen (the Lab, full screen)', checked: cur === 'here', action: () => restart('here') },
        ...(await displays()).filter((d) => !d.hub).map((d) => ({ label: d.label, hint: `${d.width}×${d.height}${d.hz ? ` · ${d.hz} Hz` : ''}`, checked: cur === d.id, action: () => restart(d.id) })),
      ] },
      { label: '📷 Cue pictures again', hint: 'With the song paused', action: () => { P.thumbs.clear(); prepThumbs().catch(err); } },
      pendingOf() ? { label: '✦ The director\'s set…', action: () => review() } : null,
      setOf() ? { label: 'Back to the default keys', hint: 'cues 1–9 in time order, looks Q W E…', action: () => { saveSet(sid(), null); paint(); } } : null,
      `Keys: 1–9 cues · Q W E R Y U I O P looks · Space freeze · B black-out · T tap · 0 now / beat / bar · Enter play · H strip · Esc leave`,
    ];
  }
  async function restart(screen) { store.set('three.perform.screen', screen); leave(); await sleep(300); return start({ screen }); }
  const put = (node, k, v) => { if (node && node[k] !== v) node[k] = v; };
  function paint() {
    if (!P.strip) return;
    const Pp = P.parts; const h = hk(); const S = Stage(); const p = player();
    P.strip.classList.toggle('pf-hidden', P.hidden);
    const mp = map();
    const key = JSON.stringify([mp.cues.map((c) => [c.key, c.name]), mp.looks.map((l) => [l.key, l.name])]);
    if (key !== P.mapKey) {
      P.mapKey = key;
      Pp.cues.replaceChildren(...(mp.cues.length ? mp.cues.map((c) => el('button', { class: 'pf-chip pf-cue', dataset: { key: c.key }, title: `${c.name} (${c.key})`, text: `${c.key} ${c.name}`, on: { click: () => cue(c.key) } })) : [el('span', { class: 'pf-empty', text: 'no cues' })]));
      Pp.looks.replaceChildren(...mp.looks.map((l, i) => el('button', { class: 'pf-chip pf-look', dataset: { key: l.key }, title: `${l.name} (${l.key.toUpperCase()})`, text: `${l.key.toUpperCase()} ${l.name}`, on: { click: () => look(i) } })));
    }
    const lid = lookLayer();
    for (const n of Pp.cues.children) { n.classList.toggle('armed', P.pend.cue?.label === n.dataset.key); n.classList.toggle('on', P.lastCue?.key === n.dataset.key && !P.pend.cue); }
    for (const n of Pp.looks.children) { const row = mp.looks.find((l) => l.key === n.dataset.key); n.classList.toggle('armed', P.pend.look?.label === n.dataset.key); n.classList.toggle('on', Boolean(row && P.held.get(lid) === row.name)); }
    put(Pp.quant, 'textContent', { now: 'Now', beat: 'Beat', bar: 'Bar' }[quant()] || 'Bar');
    Pp.freeze.classList.toggle('on', Boolean(h?.frozen));
    Pp.black.classList.toggle('on', Boolean(S?.state.black));
    put(Pp.play, 'textContent', p?.playing ? '❚❚♪' : '▶♪'); Pp.play.hidden = !p?.loaded;
    if (Pp.recBox.checked !== P.rec) Pp.recBox.checked = P.rec;
    Pp.rec.classList.toggle('on', P.rec);
    Pp.ai.hidden = !pendingOf();
    Pp.favs.hidden = !h?.favs?.()?.list?.length; // (round 138, favs138) only when the scene has favourites
    put(Pp.note, 'textContent', P.prepping ? 'getting the cue pictures…' : P.rec ? `● ${P.events.length}` : '');
    tick();
  }
  // the parts that move by themselves (tempo, the next cue): a few text writes, only when they change
  function tick() {
    if (!P.strip) return;
    const Pp = P.parts; const p = player(); const S = Stage();
    const playing = p?.loaded && p.playing;
    const bpm = playing ? p.bpm : S?.bpm() ?? 120; const src = playing ? '♪' : S?.source() === 'midi' ? 'MIDI' : S?.source() === 'tap' ? 'tap' : 'tap?';
    put(Pp.tempo, 'textContent', `${Math.round(bpm)} ${src}`);
    const next = p?.duration > 0 ? C().nextCue(p.cues, p.time) : null;
    put(Pp.nextName, 'textContent', next ? `next: ${next.name}` : '');
    const url = next ? P.thumbs.get(thumbKey(next)) || '' : '';
    if (Pp.thumb.dataset.src !== url) { Pp.thumb.dataset.src = url; if (url) Pp.thumb.src = url; Pp.thumb.hidden = !url; }
  }

  // ---------- the director's set: reviewed by the owner before it's used ----------
  function review() {
    const id = sid(); const set = pendingOf(id);
    if (!set) { toast('No set from the director for this scene', { timeout: 1500 }); return null; }
    const d = el('dialog', { class: 'pf-review' },
      el('h3', { text: '✦ The director prepared a set' }),
      el('p', { class: 'hint', text: 'Keys for Perform on this scene. Nothing changes in the scene; you can go back to the default keys any time (⋯).' }),
      el('div', { class: 'pf-review-list' }, ...C().text(set).split(' · ').map((x) => el('div', { text: x }))),
      set.note ? el('p', { class: 'hint', text: set.note }) : null,
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'ghost pf-review-drop', text: 'Discard', on: { click: () => { setPending(id, null); d.close(); paint(); } } }),
        el('button', { class: 'ghost', text: 'Not now', on: { click: () => d.close() } }),
        el('button', { class: 'primary pf-review-use', text: 'Use this set', on: { click: () => { saveSet(id, { ...set, by: 'ai' }); setPending(id, null); if (set.quant) store.set('three.perform.quant', set.quant); d.close(); paint(); toast('✦ The set is on the keys', { timeout: 1500 }); } } })));
    d.addEventListener('close', () => d.remove());
    (P.on && P.full ? hk().host : document.body).append(d); d.showModal();
    return d;
  }
  // three_do perform { setup } (prepares a set the owner reviews) · no args: what's on the keys now
  async function op(args = {}, d = null, ctx = {}) {
    stats.ops += 1;
    const linked = ctx.chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(ctx.chatId) : null;
    if (linked && linked !== sid()) return { ok: false, error: 'perform needs this chat\'s scene on screen (the owner reviews the set there).' };
    if (!hk() || !sid()) return { ok: false, error: 'Open the scene in the Lab first.' };
    const h = hk();
    const raw = args.setup && typeof args.setup === 'object' ? args.setup : null;
    const layers = (h.layers?.() || []).map((L) => ({ id: L.id, name: L.name }));
    const layerId = raw?.layer != null ? (layers.find((L) => String(L.name).toLowerCase() === String(raw.layer).toLowerCase() || L.id === raw.layer)?.id || lookLayer()) : lookLayer();
    const looks = layerId ? h.ctlOf(layerId)?.looksApi?.list?.() || [] : [];
    if (!raw) return { ok: true, value: { keys: C().compact(map(), quant()), cues: cuesNow().map((c) => c.name), looks, performing: P.on, ...(pendingOf() ? { waiting: C().text(pendingOf()) } : {}) } };
    const r = C().setup(raw, { cues: cuesNow(), looks, layers });
    if (!r.set) return { ok: false, error: r.problems.join('; ') };
    setPending(sid(), r.set);
    paint();
    toast('✦ The director prepared a set for ◉ Perform', { timeout: 8000, action: { label: 'Review', fn: () => review() } });
    return { ok: true, value: { shown: 'to the owner to review (nothing is used until they OK it; the scene never changes)', set: C().text(r.set), ...(r.problems.length ? { skipped: r.problems } : {}) } };
  }

  // the Lab's preview messages (tools/three.js): the frame rate for the strip, nothing kept per frame
  function preview(msg) { if (P.on && msg.type === 'stats' && msg.fps >= 0) P.fps = Math.round(msg.fps); }
  // the scene changed under Perform: the keys follow it; a recording of the other scene is dropped (said in finishRec)
  addEventListener('hearth:sketch', () => { if (!P.on) return; P.held.clear(); P.lastCue = null; if (P.rec && P.recSid !== sid()) { finishRec(); P.rec = false; } paint(); });

  // ---------- /perform and Ctrl/⌘+K ----------
  if (typeof Commands !== 'undefined' && !Commands.get('perform')) {
    Commands.register({
      name: 'perform', area: 'Three.js Lab', args: '[here|off|undo]',
      desc: 'Perform live: the scene full screen (the other screen when there is one), 1–9 cues and Q W E looks on the beat or bar, Space freeze, B black-out',
      examples: ['/perform', '/perform here', '/perform off', '/perform undo'],
      keywords: 'live performance vj show cues looks keys midi pads quantise beat bar blackout freeze tap tempo second screen record',
      complete: (a) => ['here', 'off', 'undo'].filter((x) => x.startsWith(a.trim().toLowerCase())).map((value) => ({ value })),
      run: async (args) => {
        const w = String(args || '').trim().toLowerCase();
        if (w === 'off') return leave() ? 'Left Perform' : 'Not performing';
        if (w === 'undo') return undoRec() ? 'Undone' : 'Nothing to undo';
        await start(w === 'here' ? { screen: 'here' } : {});
        return null;
      },
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Lab: ◉ Perform live (cues on 1–9, looks on Q W E, on the beat)', () => start().catch(err));

  function state() { return { on: P.on, where: P.where, quant: quant(), rec: P.rec, events: P.events.length, held: Object.fromEntries(P.held), pending: { cue: P.pend.cue?.label || null, look: P.pend.look?.label || null }, keys: C().compact(map(), quant()), fps: P.fps }; }
  return { start, leave, cue, look, freeze, black, tap, act, setRec, setQuant, review, op, preview, holds, prepThumbs, undoRec, saveSet, map, stats, get state() { return state(); }, get strip() { return P.strip; } };
})();
window.ThreePerform = ThreePerform;
