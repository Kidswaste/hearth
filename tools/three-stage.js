// The Lab's live stage (round 22, labstage): the Lab as a light VJ instrument for playing visuals to music.
//   set list   scenes in show order (one list: three.stage.setlist); next / previous; the next one is cued by itself
//   deck       the cued scene runs live in a second Lab sandbox over the preview (a small cue monitor until GO), so
//              a crossfade mixes two live scenes; at the end the Lab opens it underneath and the deck steps away
//   GO         cut / fade / dip to black, N beats long, landing on the next beat or bar (quantize); on the Stage
//              window (the output) the old picture fades into the new scene there instead (stage-mask swapMs)
//   tempo      the song's grid while it plays, else MIDI clock in (tools/three-stage-midi.js), else your taps;
//              beat LFOs on any slider ride it (the sliders' own "move by itself" waves, ThreeTweaks motion)
//   output     the Stage window fullscreen on the other screen at its own resolution and frame rate; black-out
//              and freeze reach it; the hub stays on your main screen
//   show mode  hides the editing chrome, blocks reloads, locks the frame rate (Light mode when frames keep
//              dropping), holds the last good frame when a scene throws, and skips to the next scene on the bar
// Light: nothing runs per frame here. MIDI is coalesced to one apply per frame (three-stage-midi.js); the HUD is
// written on events only (cue, tempo change), its beat dot is a compositor animation restarted when the tempo moves.
const ThreeStage = (() => {
  const AREA = 'Three.js Lab';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hk = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.stageHooks : null);
  const scenes = () => ThreeLab.scenes;
  const MODES = [['cut', 'Cut', 'Straight to the new scene on the beat'], ['fade', 'Crossfade', 'Both scenes live, mixed over the length'], ['dip', 'Dip to black', 'Down to black and up into the new scene']];
  const LENGTHS = [[1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars']];
  const QUANT = [['off', 'Now'], ['beat', 'Next beat'], ['bar', 'Next bar']];
  const RES = [['frame', 'The sketch\'s frame size', null], ['display', 'Fill the screen', null], ['720p', '1280 × 720', [1280, 720]], ['1080p', '1920 × 1080', [1920, 1080]], ['1440p', '2560 × 1440', [2560, 1440]], ['4k', '3840 × 2160', [3840, 2160]], ['v1080', '1080 × 1920 (vertical)', [1080, 1920]]];
  const SHAPES = [['sine', '∿ Sine'], ['tri', '⋀ Triangle'], ['saw', '⟋ Saw'], ['ramp', '⟍ Ramp down'], ['square', '⊓ Square'], ['steps', '⊏ Steps'], ['bounce', '⌒ Bounce']];
  const RATES = [[0.25, '¼ beat'], [0.5, '½ beat'], [1, '1 beat'], [2, '2 beats'], [4, '1 bar'], [8, '2 bars'], [16, '4 bars'], [32, '8 bars']];
  // what a pad, a key or a command can do (the same list everywhere)
  const ACTIONS = [
    ['go', 'GO: to the cued / next scene'], ['cut', 'Cut to it now'], ['next', 'Next scene in the set list'], ['prev', 'Previous scene'],
    ['shuffle', 'Shuffle the sliders'], ['shuffleBack', 'The shuffle before'], ['freeze', 'Freeze / unfreeze'], ['tap', 'Tap tempo'],
    ['blackout', 'Black-out on / off'], ['play', 'Play / pause the song'], ['look', 'Next look'], ['show', 'Show mode on / off'],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`scene${n}`, `Cue scene ${n} of the set list`]),
    ...[1, 2, 3, 4].map((n) => [`songcue${n}`, `Jump to the song's cue ${n}`]),
  ];
  const ACTION_NAME = Object.fromEntries(ACTIONS);

  const S = {
    show: false, busy: false, cued: null, held: null, lastTouched: null, autoLight: false, fpsBefore: null, bad: 0,
    get setlist() { return store.get('three.stage.setlist', []); },
    set setlist(v) { store.set('three.stage.setlist', v.slice(0, 64)); window.LabPresets?.changed(); paintHud(); }, // (round 88, labsync88) the set list on both computers
    get mode() { return store.get('three.stage.mode', 'fade'); },
    get beats() { return Number(store.get('three.stage.beats', 4)); },
    get quant() { return store.get('three.stage.quant', 'bar'); },
    get autoCue() { return store.get('three.stage.autoCue', true); },
    get out() { return { res: 'frame', fps: 60, display: 'other', ...store.get('three.stage.out', {}) }; },
  };
  const setOut = (patch) => store.set('three.stage.out', { ...S.out, ...patch });
  const nameOf = (id) => scenes()?.get(id)?.name || '(gone)';
  const currentId = () => scenes()?.currentId() || null;

  // ---------- tempo: the song while it plays, else MIDI clock, else taps ----------
  const T = { bpm: 120, anchor: performance.now(), taps: [], src: 'free', mc: { ticks: 0, last: 0, iv: [], anchor: 0, on: false } };
  const midiClockOn = () => T.mc.last && performance.now() - T.mc.last < 1500;
  function source() {
    const p = hk()?.player;
    if (p?.loaded && p.playing) return 'song';
    if (midiClockOn()) return 'midi';
    return T.taps.length >= 2 || T.src === 'tap' ? 'tap' : 'free';
  }
  function bpm() {
    const src = source();
    if (src === 'song') return hk().player.bpm;
    if (src === 'midi') { const iv = T.mc.iv; if (iv.length >= 6) { const avg = iv.reduce((a, x) => a + x, 0) / iv.length; return Math.round(60000 / (avg * 24) * 10) / 10; } }
    return T.bpm;
  }
  // beats since bar 1 of our own clock (MIDI clock: since its start; taps: since the first tap of the run)
  function beatPos() {
    if (source() === 'midi') { const iv = T.mc.iv.length ? T.mc.iv.reduce((a, x) => a + x, 0) / T.mc.iv.length : 20; return (T.mc.ticks + Math.min(1, (performance.now() - T.mc.last) / iv)) / 24; }
    return ((performance.now() - T.anchor) / 1000) * (T.bpm / 60);
  }
  // seconds to the next beat or bar (null: not now)
  function untilNext(unit) {
    if (unit === 'off') return 0;
    if (source() === 'song') return hk().player.untilNext(unit);
    const b = beatPos(); const per = unit === 'bar' ? 4 : 1;
    const next = Math.ceil((b + 0.02) / per) * per;
    return ((next - b) * 60) / bpm();
  }
  // the sliders' waves (ThreeTweaks motion) ride this clock when no song plays (tools/three.js clock hook)
  function clock() {
    const src = source();
    if (src !== 'midi' && src !== 'tap') return null;
    const bp = bpm();
    return { t: (beatPos() * 60) / bp, bpm: bp, playing: true, section: null };
  }
  function tap(t = performance.now()) {
    const p = hk()?.player;
    if (p?.loaded) { try { p.tap(); } catch { /* no grid yet */ } }
    T.taps = T.taps.filter((x) => t - x < 2500);
    T.taps.push(t);
    if (T.taps.length > 8) T.taps.shift();
    if (T.taps.length >= 2) {
      const iv = T.taps.slice(1).map((x, i) => x - T.taps[i]).sort((a, b) => a - b);
      const med = iv[Math.floor(iv.length / 2)];
      T.bpm = Math.round(Math.max(40, Math.min(240, 60000 / med)) * 10) / 10;
      T.anchor = T.taps[0]; T.src = 'tap';
      paintBeat(true);
    }
    return T.bpm;
  }
  function setBpm(v) { const n = Number(v); if (!(n >= 20 && n <= 400)) throw new Error('A BPM between 20 and 400'); T.bpm = Math.round(n * 100) / 100; T.anchor = performance.now(); T.src = 'tap'; T.taps = []; paintBeat(true); return T.bpm; }
  // MIDI clock in (24 ticks a beat; start / continue / stop), from three-stage-midi.js: math only, no DOM
  const clockIn = {
    tick(t = performance.now()) {
      const mc = T.mc;
      if (mc.last) { const d = t - mc.last; if (d > 2 && d < 250) { mc.iv.push(d); if (mc.iv.length > 48) mc.iv.shift(); } }
      if (!mc.on && !mc.last) mc.on = true;
      mc.last = t; mc.ticks += 1;
    },
    start() { T.mc.ticks = 0; T.mc.on = true; T.mc.last = 0; T.mc.iv = []; },
    stop() { T.mc.on = false; },
  };

  // ---------- the deck: the cued scene, live, in a second sandbox over the preview ----------
  let deck = null; // { host, box, id, drawnP, drawnFn, err, monitor }
  const mainDrawn = []; // resolves when the Lab's own preview drew a new stack (the hand-over)
  function ensureDeck() {
    const h = hk();
    if (!h) throw new Error('Open the Three.js Lab first');
    if (deck && deck.host.isConnected) return deck;
    const host = el('div', { class: 'stage-deck monitor', attrs: { 'aria-hidden': 'true' } });
    const label = el('div', { class: 'stage-deck-label' });
    h.host.append(host);
    deck = { host, label, box: null, id: null, err: null, drawnP: null, drawnFn: null };
    deck.box = ThreeLab._sandbox(host, onDeckMessage, () => `${hk()?.params || ''}`);
    host.append(label);
    return deck;
  }
  function onDeckMessage(m) {
    if (!deck) return;
    if (m.type === 'error') deck.err = String(m.message || 'error');
    if (m.type === 'stack-drawn' && deck.drawnFn) { const f = deck.drawnFn; deck.drawnFn = null; f(true); }
  }
  // the deck's box: over the preview's picture (or a centred box when the picture runs on the Stage window)
  function placeDeck(full) {
    const h = hk(); if (!deck || !h) return;
    const hr = h.host.getBoundingClientRect(); let r = h.frameRect;
    if (!(r.width > 8 && r.height > 8)) { const w = hr.width * 0.6; const z = h.size; const ar = z?.width && z?.height ? z.width / z.height : 16 / 9; r = { left: hr.left + (hr.width - w) / 2, top: hr.top + Math.max(8, (hr.height - w / ar) / 2), width: w, height: w / ar }; }
    Object.assign(deck.host.style, { left: `${Math.round(r.left - hr.left)}px`, top: `${Math.round(r.top - hr.top)}px`, width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px` });
    deck.host.classList.toggle('monitor', !full);
    deck.host.classList.toggle('full', Boolean(full));
  }
  const specOf = (L, z, s) => ({ id: L.id, code: L.code, z, slot: L.slot ?? z, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, overrides: L.overrides || null, ...(L.precomp && typeof ThreeComp !== 'undefined' ? { precomp: ThreeComp.specOf(L, s.id, { slotBase: 2000 + z * 64 }) } : {}) });
  // put a scene in the deck (a cue): it runs live there, small, until GO
  async function cue(id, { quiet = false } = {}) {
    const s = scenes()?.get(id);
    if (!s) throw new Error('No such scene');
    const d = ensureDeck();
    S.cued = id;
    if (d.id !== id) {
      d.id = id; d.err = null;
      d.drawnP = new Promise((r) => { d.drawnFn = r; setTimeout(() => r(false), 6000); });
      d.box.reload();
      d.box.send({ type: 'tweak-init', values: {}, keys: {}, mods: {} });
      d.box.send({ type: 'run-layers', layers: scenes().layersOf(s).map((L, z) => specOf(L, z, s)) });
    }
    d.box.send({ type: 'fps-cap', value: hk()?.light ? 15 : 30, auto: false, focused: true });
    d.label.textContent = `◌ cued · ${s.name}`;
    placeDeck(false);
    d.host.hidden = false;
    d.host.getAnimations().forEach((a) => a.cancel());
    d.host.style.opacity = '';
    paintHud();
    if (!quiet) toast(`Cued "${s.name}" · GO (Enter in show mode) ${S.quant === 'off' ? 'now' : `on the next ${S.quant}`}`, { timeout: 1600 });
    return s.name;
  }
  function uncue() {
    S.cued = null;
    if (deck) { deck.host.hidden = true; deck.id = null; deck.box.frame.src = 'about:blank'; }
    paintHud();
  }

  // ---------- GO: cut / fade / dip, on the beat or the bar ----------
  const listIndex = (id = currentId()) => S.setlist.findIndex((x) => x.id === id);
  function neighbour(d) {
    const list = S.setlist.filter((x) => scenes()?.get(x.id));
    if (!list.length) return null;
    const i = list.findIndex((x) => x.id === currentId());
    return list[((i < 0 ? (d > 0 ? -1 : 0) : i) + d + list.length) % list.length].id;
  }
  async function go(target = null, o = {}) {
    const h = hk();
    if (!h) throw new Error('Open the Three.js Lab first');
    if (S.busy) return null;
    const id = target || S.cued || neighbour(1);
    if (!id) throw new Error('Nothing cued: add scenes to the set list or cue one (the live menu, ⋯)');
    if (id === currentId() && !target) { uncue(); return nameOf(id); }
    const mode = o.mode || S.mode; const beats = o.beats ?? S.beats; const quant = o.quant || S.quant;
    S.busy = true; paintHud();
    try {
      if (deck?.id !== id || S.cued !== id) await cue(id, { quiet: true });
      if (deck.err && S.show && !o.force) { toast(`"${nameOf(id)}" has an error (${deck.err.slice(0, 80)}): GO again to switch anyway`, { type: 'error', timeout: 4000 }); deck.err = null; return null; }
      await Promise.race([deck.drawnP, sleep(3000)]);
      const onStage = h.onStage;
      let wait = untilNext(quant); if (wait == null || wait > 8) wait = 0;
      const lead = onStage ? 450 : 20; // the output window takes a moment to start the new scene
      await sleep(Math.max(0, wait * 1000 - lead));
      const fadeMs = mode === 'cut' ? 0 : Math.min(16000, (beats * 60000) / bpm());
      if (S.held) { h.setFreeze(false); S.held = null; }
      else if (h.frozen) h.setFreeze(false);
      if (onStage) await goOnOutput(id, mode, fadeMs);
      else await goHere(id, mode, fadeMs);
      if (S.autoCue && S.setlist.length) { const nx = neighbour(1); if (nx && nx !== id) await cue(nx, { quiet: true }); else uncue(); } else uncue();
      return nameOf(id);
    } finally { S.busy = false; paintHud(); }
  }
  // in the app: the deck (live) comes up over the preview, then the Lab opens the scene underneath and the deck goes
  async function goHere(id, mode, fadeMs) {
    const d = deck;
    placeDeck(true);
    d.box.send({ type: 'fps-cap', value: Math.max(0, hk().fps), auto: hk().fps < 0, focused: true });
    d.label.textContent = '';
    if (mode === 'dip') {
      const veil = el('div', { class: 'stage-veil' }); hk().host.append(veil);
      await veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(60, fadeMs / 2), fill: 'forwards' }).finished.catch(() => {});
      d.host.style.opacity = '1';
      await handOver(id);
      await veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.max(60, fadeMs / 2), fill: 'forwards' }).finished.catch(() => {});
      veil.remove();
    } else {
      if (fadeMs > 0) await d.host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
      d.host.getAnimations().forEach((a) => a.cancel());
      d.host.style.opacity = '1';
      await handOver(id);
    }
    await d.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
    d.host.getAnimations().forEach((a) => a.cancel());
    d.host.style.opacity = ''; d.host.hidden = true;
  }
  // the Lab opens the scene (under the deck); resolves once its preview drew the new stack (≤ 2.5 s)
  async function handOver(id) {
    const drawn = new Promise((r) => { mainDrawn.push(r); setTimeout(r, 2500); });
    scenes().open(id);
    await drawn;
    await sleep(90);
  }
  // on the output window: its old picture fades into the new scene (the preview page's own swap, made longer)
  async function goOnOutput(id, mode, fadeMs) {
    const box = hk().box;
    if (mode === 'dip') { box.send({ type: 'stage-mask', black: true, ms: Math.max(60, fadeMs / 2), swapMs: 0 }); await sleep(Math.max(60, fadeMs / 2)); }
    else box.send({ type: 'stage-mask', swapMs: fadeMs });
    const drawn = new Promise((r) => { mainDrawn.push(r); setTimeout(r, 2500); });
    scenes().open(id);
    await drawn;
    if (mode === 'dip') box.send({ type: 'stage-mask', black: S.black, ms: Math.max(60, fadeMs / 2) });
    await sleep(mode === 'dip' ? fadeMs / 2 : fadeMs);
    box.send({ type: 'stage-mask', swapMs: null });
    if (deck) deck.host.hidden = true;
  }
  // a crossfader (a MIDI fader, /stage xfade 0.4): the deck's share of the picture, by hand; at the far end the scene
  // is handed over and the fader's ends swap (like a DJ mixer: the next scene is on the side you came from)
  let xfSide = 0; let xfBusy = false;
  async function xfade(u) {
    if (xfBusy || S.busy) return;
    const h = hk(); if (!h) return;
    let w = Math.max(0, Math.min(1, xfSide ? 1 - u : u));
    if (!S.cued) { const nx = neighbour(1); if (!nx || w < 0.02) return; await cue(nx, { quiet: true }); }
    if (h.onStage) { if (w > 0.5) { xfSide = 1 - xfSide; await go(S.cued, { mode: 'fade', beats: 1, quant: 'off' }); } return; }
    placeDeck(true);
    if (deck.label.textContent) deck.label.textContent = '';
    w = Math.round(w * 100) / 100;
    if (deck.host.style.opacity !== String(w)) deck.host.style.opacity = String(w);
    if (w >= 0.99) {
      xfBusy = true;
      try {
        const id = S.cued; xfSide = 1 - xfSide;
        await handOver(id);
        await deck.host.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.catch(() => {});
        deck.host.getAnimations().forEach((a) => a.cancel()); deck.host.hidden = true;
        if (S.autoCue && S.setlist.length) { const nx = neighbour(1); if (nx && nx !== id) await cue(nx, { quiet: true }); else uncue(); } else uncue();
      } finally { xfBusy = false; }
    }
  }

  // ---------- set list ----------
  const setlist = {
    list: () => S.setlist.map((x, i) => ({ n: i + 1, id: x.id, name: nameOf(x.id), current: x.id === currentId(), cued: x.id === S.cued })),
    add(id = currentId()) { if (!id || !scenes()?.get(id)) throw new Error('No scene to add'); const l = S.setlist.filter((x) => x.id !== id); l.push({ id }); S.setlist = l; return l.length; },
    remove(n) { const l = S.setlist; const i = n == null ? l.findIndex((x) => x.id === currentId()) : Number(n) - 1; if (i < 0 || i >= l.length) throw new Error('Not in the set list'); const [x] = l.splice(i, 1); S.setlist = l; return nameOf(x.id); },
    move(n, d) { const l = S.setlist; const i = Number(n) - 1; const j = i + d; if (!l[i] || !l[j]) return false; [l[i], l[j]] = [l[j], l[i]]; S.setlist = l; return true; },
    clear() { S.setlist = []; },
    fill(n = 8) { const all = ThreeLab.peek?.()?.sketches?.() || []; S.setlist = all.slice(0, n).map((x) => ({ id: x.id })); return S.setlist.length; },
    async cueN(n) { const x = S.setlist[Number(n) - 1]; if (!x) throw new Error(`The set list has ${S.setlist.length} scene${S.setlist.length === 1 ? '' : 's'}`); return cue(x.id); },
  };

  // ---------- output: the Stage window as a clean output on the other screen ----------
  function outputSize() {
    const r = RES.find((x) => x[0] === S.out.res);
    if (!r || r[0] === 'frame') return undefined; // the Lab decides (the sketch's frame size)
    return r[2] ? { width: r[2][0], height: r[2][1] } : null;
  }
  async function output(on = true, { display } = {}) {
    const h = hk(); if (!h) throw new Error('Open the Three.js Lab first');
    if (!on) { if (h.onStage) h.setStage(false); paintHud(); return false; }
    if (display != null) setOut({ display });
    if (!h.onStage) h.setStage(true);
    for (let i = 0; i < 150 && !(h.onStage && h.box.ready); i += 1) await sleep(100);
    const placed = await window.hub.stagePlace?.({ display: S.out.display, fullscreen: true }).catch(() => null);
    h.box.send({ type: 'present', on: true }); // no cursor on the output
    if (S.out.fps) h.setFps(S.out.fps);
    if (S.black) h.box.send({ type: 'stage-mask', black: true, ms: 0 });
    paintHud();
    return placed || { other: false };
  }
  function setRes(res) { if (!RES.some((x) => x[0] === res)) throw new Error(`Resolutions: ${RES.map((x) => x[0]).join(', ')}`); setOut({ res }); const h = hk(); if (h?.onStage) h.setStage(true); return res; }
  function setFps(v) { const n = Number(v); setOut({ fps: n }); const h = hk(); if (h && (h.onStage || S.show)) h.setFps(n); return n; }
  S.black = false;
  function blackout(on = !S.black, ms = 350) {
    const h = hk(); if (!h) return false;
    S.black = Boolean(on);
    h.blackout(S.black);
    h.box.send({ type: 'stage-mask', black: S.black, ms });
    paintHud();
    return S.black;
  }

  // ---------- show mode ----------
  const onBeforeUnload = (e) => { if (!S.show) return; e.preventDefault(); e.returnValue = ''; toast('Show mode: reloading is blocked (Shift+Esc leaves show mode)', { timeout: 2500 }); };
  function guard(kind) {
    if (!S.show) return false;
    toast(kind === 'restart' ? 'Show mode: restart is blocked (Shift+Esc leaves show mode)' : 'Show mode: blocked', { timeout: 1800 });
    return true;
  }
  function setShow(on = !S.show) {
    const h = hk(); if (!h) throw new Error('Open the Three.js Lab first');
    on = Boolean(on);
    if (on === S.show) return on;
    S.show = on; S.bad = 0;
    h.pane.classList.toggle('lab-show', on);
    document.body.classList.toggle('stage-showing', on);
    if (on) {
      S.fpsBefore = h.fps;
      h.setFps(S.out.fps || 60); // locked: steady frames, no Auto stepping mid-set
      addEventListener('beforeunload', onBeforeUnload);
      ensureHud(); hud.hidden = false; paintHud(); paintBeat(true);
      if (!hudTimer) hudTimer = setInterval(() => paintBeat(false), 1000);
      if (S.autoCue && !S.cued && S.setlist.length) { const nx = neighbour(1); if (nx && nx !== currentId()) cue(nx, { quiet: true }).catch(() => {}); }
      toast('Show mode: Enter = GO · ← → scenes · 1–8 cue · B black-out · F freeze · Shift+Esc to leave', { timeout: 3500 });
    } else {
      removeEventListener('beforeunload', onBeforeUnload);
      if (S.fpsBefore != null) h.setFps(S.fpsBefore);
      if (S.autoLight) { h.setLight(false); S.autoLight = false; }
      if (S.held) { h.setFreeze(false); S.held = null; }
      if (hud) hud.hidden = true;
      clearInterval(hudTimer); hudTimer = 0;
    }
    return on;
  }
  // the preview's messages (tools/three.js onMessage hook): hand-overs, errors held, frames kept steady
  function preview(msg) {
    if (msg.type === 'stack-drawn' && mainDrawn.length) { for (const f of mainDrawn.splice(0)) f(); }
    if (!S.show) return;
    if ((msg.type === 'error' || msg.type === 'gpu-lost') && !S.held && !S.busy) holdFrame(msg);
    if (msg.type === 'stats' && msg.fps >= 0) {
      const target = msg.cap > 0 ? msg.cap : (S.out.fps || 60);
      S.bad = msg.fps < target * 0.8 ? S.bad + 1 : 0;
      const h = hk();
      // 3 s of dropped frames (even at the lowered resolution): Light mode keeps the show steady (back when it ends)
      if (S.bad >= 6 && h && !h.light) { S.autoLight = true; S.bad = 0; h.setLight(true); }
    }
  }
  function holdFrame(msg) {
    const h = hk(); if (!h) return;
    if (!h.frozen) h.setFreeze(true);
    S.held = { message: String(msg.message || 'the preview lost its GPU'), at: Date.now() };
    paintHud();
    // the show goes on: to the next scene of the set list on the coming bar
    const nx = neighbour(1);
    if (nx && nx !== currentId() && store.get('three.stage.autoSkip', true)) setTimeout(() => { if (S.held && S.show) go(nx, { mode: 'cut', quant: 'bar', force: true }).catch(() => {}); }, 400);
  }

  // ---------- beat LFOs: any slider moves in time (the sliders' own waves, now ridden by the stage's clock) ----------
  function lfo(target, { shape = 'sine', rate = 4, depth = 0.25 } = {}) {
    const h = hk(); if (!h) throw new Error('Open the Three.js Lab first');
    let t = target;
    if (typeof t === 'string' && t) { const c = h.ctl(); const hit = c?.resolve(t); if (!hit) throw new Error(`No slider "${t}"`); t = { layer: h.layer().id, key: hit.key, label: hit.label }; }
    t ||= S.lastTouched;
    if (!t) throw new Error('Move a slider first (or name one)');
    const c = h.ctlOf(t.layer); if (!c) throw new Error('That slider\'s layer is gone');
    const ok = c.setMotion(t.key, shape === 'off' ? null : { kind: 'lfo', shape, rate: Number(rate) || 4, depth: Math.max(0.02, Math.min(1, Number(depth) || 0.25)) });
    if (!ok) throw new Error(`"${t.label}" isn't a number slider`);
    return t.label;
  }

  // ---------- actions (pads, keys, commands) ----------
  async function act(a) {
    const h = hk(); const c = ThreeLab.peek?.();
    if (!h || !c) return;
    if (a === 'go') return go();
    if (a === 'cut') return go(null, { mode: 'cut', quant: 'off' });
    if (a === 'next' || a === 'prev') { const id = neighbour(a === 'next' ? 1 : -1); if (id) return go(id); return null; }
    if (a === 'shuffle') return h.ctl()?.shuffle();
    if (a === 'shuffleBack') return h.ctl()?.shuffleStep(-1);
    if (a === 'freeze') return h.setFreeze(!h.frozen);
    if (a === 'tap') return tap();
    if (a === 'blackout') return blackout();
    if (a === 'play') { if (h.player?.loaded) h.player.toggle(); return null; }
    if (a === 'look') return h.ctl()?.lookStep(1);
    if (a === 'show') return setShow();
    let m = /^scene(\d)$/.exec(a); if (m) return setlist.cueN(Number(m[1]));
    m = /^songcue(\d)$/.exec(a); if (m) { const cu = h.player?.cues?.[Number(m[1]) - 1]; if (cu) c.seek(cu.time ?? cu.t); return null; }
    return null;
  }
  // last slider you touched (MIDI learn, /stage lfo with no name)
  function touched(layer, key, label) { S.lastTouched = { layer, key, label, at: Date.now() }; window.ThreeStageMidi?.touched?.(layer, key, label); }

  // ---------- show-mode keys ----------
  const editable = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  function onKey(e) {
    if (e.defaultPrevented || editable(e.target)) return;
    const h = hk(); if (!h) return;
    if (S.show && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r'))) { e.preventDefault(); e.stopPropagation(); guard('reload'); return; }
    if (window.ThreeStageMidi?.key?.(e)) { e.preventDefault(); e.stopPropagation(); return; } // learned keys (and key learning)
    if (!S.show || e.ctrlKey || e.metaKey || e.altKey) return;
    let a = null;
    if (e.key === 'Escape' && e.shiftKey) { setShow(false); a = true; }
    else if (e.key === 'Enter') a = e.shiftKey ? 'cut' : 'go';
    else if (e.key === 'ArrowRight') a = 'next';
    else if (e.key === 'ArrowLeft') a = 'prev';
    else if (/^[1-8]$/.test(e.key) && !e.shiftKey) a = `scene${e.key}`;
    else if (e.key.toLowerCase() === 'b' && !e.shiftKey) a = 'blackout';
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (a !== true) act(a).catch((err) => toast(err.message, { type: 'error' }));
  }
  addEventListener('keydown', onKey, true);
  Keys.add([
    { area: 'Lab live (show mode)', keys: 'Enter', what: 'GO: to the cued / next scene, on the bar (Shift+Enter: cut now)', run: () => act('go') },
    { area: 'Lab live (show mode)', keys: '← / →', what: 'Previous / next scene of the set list' },
    { area: 'Lab live (show mode)', keys: '1–8', what: 'Cue that scene of the set list' },
    { area: 'Lab live (show mode)', keys: 'B', what: 'Black-out on / off (the output too)' },
    { area: 'Lab live (show mode)', keys: 'Shift+Esc', what: 'Leave show mode', run: () => setShow(false) },
  ]);

  // ---------- the HUD (show mode): one row, written on events only ----------
  let hud = null; let hudTimer = 0; let beatKey = '';
  const hudParts = {};
  function ensureHud() {
    if (hud) return hud;
    const b = (text, title, fn, cls = '') => el('button', { class: `stage-hud-btn ${cls}`, text, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn(e)).catch((err) => toast(err.message, { type: 'error' })); } } });
    hudParts.dot = el('span', { class: 'stage-beat-dot' });
    hudParts.bpm = el('span', { class: 'stage-bpm' });
    hudParts.list = el('span', { class: 'stage-list' });
    hudParts.go = b('GO ▸', 'GO: to the cued / next scene (Enter) · right-click: transition', () => go());
    hudParts.go.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, transitionItems()); });
    hudParts.black = b('■', 'Black-out (B)', () => blackout());
    hudParts.freeze = b('❚❚', 'Freeze (F)', () => { const h = hk(); h.setFreeze(!h.frozen); paintHud(); });
    hudParts.out = b('🖥', 'Output on the other screen · right-click: output settings', () => output(!hk()?.onStage));
    hudParts.out.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, outputItems()); });
    hudParts.note = el('span', { class: 'stage-note' });
    hud = el('div', { class: 'stage-hud', hidden: true },
      el('span', { class: 'stage-tempo', title: 'Tap tempo (click) · the song, MIDI clock or your taps' }, hudParts.dot, hudParts.bpm),
      hudParts.list, hudParts.go, hudParts.black, hudParts.freeze, hudParts.out, hudParts.note,
      b('⋯', 'The live menu', (e) => showMenu(e.clientX, e.clientY, menuItems())),
      b('✕', 'Leave show mode (Shift+Esc)', () => setShow(false), 'ghost'));
    hud.querySelector('.stage-tempo').addEventListener('click', () => { tap(); paintBeat(true); });
    hk().host.append(hud);
    return hud;
  }
  const put = (node, k, v) => { if (node && node[k] !== v) node[k] = v; };
  addEventListener('hearth:lab-mine', (e) => { if (e.detail?.kinds?.includes('setlist')) { try { paintHud(); } catch { /* shown next time */ } } }); // (round 88) the set list from the other computer
  function paintHud() {
    if (!hud || hud.hidden) return;
    const h = hk();
    const items = setlist.list();
    const key = JSON.stringify(items.map((x) => [x.name, x.current, x.cued]));
    if (hudParts.list.dataset.key !== key) {
      hudParts.list.dataset.key = key;
      hudParts.list.replaceChildren(...(items.length ? items.map((x) => el('button', { class: `stage-chip${x.current ? ' on' : ''}${x.cued ? ' cued' : ''}`, text: `${x.n} ${x.name}`, title: x.current ? 'On screen' : x.cued ? 'Cued: GO to switch' : 'Click to cue', on: { click: () => cue(x.id).catch((err) => toast(err.message, { type: 'error' })) } }))
        : [el('span', { class: 'stage-empty', text: 'No set list: ⋯ → Set list → Add this scene' })]));
    }
    put(hudParts.go, 'textContent', S.busy ? '… ▸' : `GO ▸${S.cued ? ` ${nameOf(S.cued)}` : ''}`);
    hudParts.black.classList.toggle('on', S.black);
    hudParts.freeze.classList.toggle('on', Boolean(h?.frozen));
    hudParts.out.classList.toggle('on', Boolean(h?.onStage));
    put(hudParts.note, 'textContent', S.held ? `⚠ held: ${S.held.message.slice(0, 60)}` : S.autoLight ? '🪶 light' : '');
  }
  // the beat dot: a compositor animation, restarted only when the tempo or its source moves
  function paintBeat(force) {
    if (!hud || hud.hidden) return;
    const bp = bpm(); const src = source();
    const k = `${Math.round(bp * 10)}|${src}`;
    put(hudParts.bpm, 'textContent', `${bp.toFixed(bp % 1 ? 1 : 0)} ${src === 'song' ? '♪' : src === 'midi' ? 'MIDI' : src === 'tap' ? 'tap' : 'BPM'}`);
    if (!force && k === beatKey) return;
    beatKey = k;
    const per = 60000 / bp;
    const wait = (untilNext('beat') ?? 0) * 1000;
    hudParts.dot.getAnimations().forEach((a) => a.cancel());
    hudParts.dot.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0.25, transform: 'scale(0.55)' }], { duration: per, iterations: Infinity, easing: 'ease-out', delay: -((per - wait) % per) });
  }

  // ---------- menus ----------
  const sketchesList = () => ThreeLab.peek?.()?.sketches?.() || [];
  function transitionItems() {
    return [
      ...MODES.map(([k, l, hint]) => ({ label: l, hint, checked: S.mode === k, action: () => { store.set('three.stage.mode', k); paintHud(); } })),
      { label: 'Length', hint: LENGTHS.find(([v]) => v === S.beats)?.[1] || `${S.beats} beats`, items: () => LENGTHS.map(([v, l]) => ({ label: l, checked: S.beats === v, action: () => store.set('three.stage.beats', v) })) },
      { label: 'Lands on', hint: QUANT.find(([k]) => k === S.quant)?.[1], items: () => QUANT.map(([k, l]) => ({ label: l, checked: S.quant === k, action: () => store.set('three.stage.quant', k) })) },
    ];
  }
  function outputItems() {
    const h = hk();
    return [
      { label: h?.onStage ? '🖥 Output: put it on the other screen again' : '🖥 Output on the other screen', hint: 'Fullscreen, the hub stays here', action: () => output(true) },
      h?.onStage ? { label: 'Close the output', action: () => output(false) } : null,
      { label: 'Screen', items: async () => { const ds = (await window.hub.stageDisplays?.().catch(() => null)) || []; return ds.length ? ds.map((d) => ({ label: `${d.label}${d.hub ? ' (Hearth)' : ''}`, hint: `${d.width}×${d.height}${d.hz ? ` · ${d.hz} Hz` : ''}`, checked: S.out.display === d.id, action: () => output(true, { display: d.id }) })).concat([{ label: 'The other screen', checked: S.out.display === 'other', action: () => output(true, { display: 'other' }) }]) : ['One screen only']; } },
      { label: 'Resolution', hint: RES.find((x) => x[0] === S.out.res)?.[1], items: () => RES.map(([k, l]) => ({ label: l, checked: S.out.res === k, action: () => setRes(k) })) },
      { label: 'Frame rate', hint: `${S.out.fps || 'Auto'} fps`, items: () => [[60, '60 fps'], [50, '50 fps (PAL projectors)'], [30, '30 fps'], [0, 'As fast as the screen'], [-1, 'Auto']].map(([v, l]) => ({ label: l, checked: S.out.fps === v, action: () => setFps(v) })) },
      { label: S.black ? '■ Black-out off' : '■ Black-out', key: 'B', action: () => blackout() },
      { label: h?.frozen ? '▶ Unfreeze' : '❚❚ Freeze', key: 'F', action: () => h?.setFreeze(!h.frozen) },
    ];
  }
  function menuItems() {
    const h = hk(); const cur = currentId(); const inList = listIndex(cur) >= 0;
    const M = window.ThreeStageMidi;
    return [
      'Live (VJ)',
      { label: S.show ? '✕ Leave show mode' : '▶ Show mode', hint: S.show ? 'Shift+Esc' : 'Hides the editing, locks frames, holds errors', checked: S.show, action: () => setShow() },
      { label: `GO ▸ ${S.cued ? nameOf(S.cued) : neighbour(1) ? nameOf(neighbour(1)) : '(nothing cued)'}`, hint: `${MODES.find(([k]) => k === S.mode)[1]} · ${QUANT.find(([k]) => k === S.quant)[1].toLowerCase()}`, key: 'Enter', action: () => go() },
      { label: 'Cue a scene', items: () => sketchesList().slice(0, 40).map((x) => ({ label: x.name, checked: x.id === S.cued, hint: x.current ? 'on screen' : '', action: () => cue(x.id) })) },
      { label: 'Set list', hint: `${S.setlist.length} scene${S.setlist.length === 1 ? '' : 's'}`, items: () => [
        ...setlist.list().map((x) => ({ label: `${x.n}. ${x.name}`, hint: x.current ? 'on screen' : x.cued ? 'cued' : '', key: x.n <= 8 ? String(x.n) : '', action: () => cue(x.id) })),
        '-',
        inList ? { label: 'Take this scene out', action: () => setlist.remove() } : { label: '＋ Add this scene', hint: h?.sketchName() || '', action: () => setlist.add() },
        { label: 'Start from my recent scenes', hint: '8 most recent', action: () => setlist.fill(8) },
        { label: 'Cue the next one by itself', checked: S.autoCue, action: () => store.set('three.stage.autoCue', !S.autoCue) },
        S.setlist.length ? { label: 'Clear the set list', danger: true, action: () => setlist.clear() } : null,
      ] },
      { label: 'Transition', hint: `${MODES.find(([k]) => k === S.mode)[1]} · ${LENGTHS.find(([v]) => v === S.beats)?.[1] || S.beats}`, items: transitionItems },
      { label: 'Tempo', hint: `${bpm().toFixed(1)} · ${source()}`, items: () => [
        { label: 'Tap', hint: 'tap 2+ times', action: () => tap() },
        { label: 'Type a BPM…', action: async () => { const v = await Modal.prompt('BPM (when no song plays)', { value: String(T.bpm) }); if (v) setBpm(v); } },
        `Now: ${source() === 'song' ? 'the song\'s grid' : source() === 'midi' ? 'MIDI clock in' : source() === 'tap' ? 'your taps' : 'free 120'}`,
      ] },
      { label: 'Beat LFO on a slider', hint: S.lastTouched ? S.lastTouched.label : 'move one first', items: () => [
        ...SHAPES.map(([k, l]) => ({ label: l, items: () => RATES.map(([r, rl]) => ({ label: rl, action: () => toast(`∿ ${lfo(null, { shape: k, rate: r })} · ${l} every ${rl}`, { timeout: 1600 }) })) })),
        { label: 'Stop its LFO', action: () => lfo(null, { shape: 'off' }) },
      ] },
      M ? { label: '🎛 MIDI & keys', hint: M.summary(), items: () => M.menuItems() } : null,
      { label: 'Output', hint: h?.onStage ? 'on' : 'off', items: outputItems },
      { label: '📱 Phone remote…', hint: 'Faders, GO and the set list on your phone', action: () => window.Lazy?.load('remote').then(() => (Remote.status?.on ? Remote.open() : Remote.on())).catch((err) => toast(err.message, { type: 'error' })) }, // (round 24, remote.js)
      { label: '🔌 Connect', hint: 'OSC · MIDI out · OBS · Link', items: async () => { await window.Lazy?.load('interop'); await Interop.prepare(); return Interop.menuItems(); } }, // (round 25, interop.js)
    ];
  }
  const previewItem = () => ({ label: '🎚 Live (VJ)', hint: S.show ? 'show mode' : S.cued ? `cued: ${nameOf(S.cued)}` : 'MIDI, set list, crossfade', items: menuItems });
  const menu = (x, y) => showMenu(x, y, menuItems());

  // the deck sleeps while the Lab isn't on screen (like the preview: tools/three.js syncPark)
  const parkDeck = () => { if (!deck?.id || deck.host.hidden) return; const off = document.visibilityState !== 'visible' || !hk()?.host.checkVisibility?.({ visibilityProperty: true }); if (deck.parked !== off) { deck.parked = off; deck.box.send({ type: 'park', on: off }); } };
  for (const ev of ['hearth:view', 'hearth:activate']) addEventListener(ev, () => setTimeout(parkDeck, 0));
  document.addEventListener('visibilitychange', parkDeck);
  // the scene changed (any way): the HUD and the deck follow
  addEventListener('hearth:sketch', () => { if (S.cued === currentId() && !S.busy) uncue(); paintHud(); });

  for (const [label, fn] of [
    ['Lab: Live show mode on / off', () => setShow()], ['Lab: Live: GO (next scene, on the bar)', () => go()], ['Lab: Live (VJ) menu', () => menu(innerWidth / 2 - 140, 120)],
    ['Lab: Live: output on the other screen', () => output(true)], ['Lab: Live: add this scene to the set list', () => setlist.add()],
  ]) AppUI.addAction(label, async () => { await ThreeLab.cmd(); try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } });

  // (round 25, interop) OSC / MIDI out / OBS / Link that were on come back on at the next start
  try { const a = store.get('interop.auto', {}); const m = store.get('interop.midi', {}); if (Object.values(a).some(Boolean) || (m.out && (m.clock || m.rules?.length || m.pc || Object.keys(m.cc || {}).length))) setTimeout(() => window.Lazy?.load('interop').catch(() => {}), 2500); } catch { /* storage */ }

  return {
    AREA, ACTIONS, ACTION_NAME, MODES, LENGTHS, QUANT, RES, SHAPES, RATES,
    preview, touched, clock, outputSize, guard, previewItem, menu, menuItems,
    go, cue, uncue, xfade, act, tap, setBpm, bpm, source, untilNext, clockIn, setShow, blackout, output, setRes, setFps, lfo, setlist,
    get state() { const h = hk(); return { show: S.show, busy: S.busy, cued: S.cued && nameOf(S.cued), current: h?.sketchName() || null, mode: S.mode, beats: S.beats, quant: S.quant, bpm: bpm(), tempo: source(), held: S.held?.message || null, black: S.black, output: Boolean(h?.onStage), out: S.out, setlist: setlist.list(), autoLight: S.autoLight, deck: deck ? { id: deck.id, hidden: deck.host.hidden, full: deck.host.classList.contains('full'), opacity: deck.host.style.opacity } : null }; },
    get lastTouched() { return S.lastTouched; },
  };
})();
window.ThreeStage = ThreeStage;
