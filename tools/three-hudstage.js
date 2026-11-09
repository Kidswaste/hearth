// (round 150, stage150) The scene view as a clean, mono, futuristic stage (docs/upgrades/stage150.md).
// 1. Quiet chrome: the preview's overlays (the Freeze / Fit / 9:16 … strip, the stats line, the Quality chip, the safe
//    zones, the 01 PREVIEW header's readouts) fade out after 2 s without the pointer moving over the picture, and come
//    back where you point: the top-right corner → the view controls, the bottom edge → the stats / quality line, the
//    header → its readouts. I (or Ctrl/⌘+; "show scene controls" / "clean stage", /stage, Ctrl+K) pins them all. Warnings
//    (the Slow chip, Safe open's note) show by themselves for a few seconds, then tuck into a small glyph. Nothing is
//    removed or moved out of the preview: same elements, classes and listeners; a hidden control is only transparent and
//    not hit by the pointer, and it is back (clickable) the moment its corner is pointed at or it has keyboard focus.
// 2. The stage frame (not in Plain): thin corner brackets, calibration rulers along the picture's edges, mono
//    micro-labels (state · frame size, beat pips · BPM, timecode, fps), a centre reticle when awake. All in the
//    window's DOM over the picture (pointer-events: none): nothing is drawn into the scene, its stills or renders.
// 3. Reactive: one hue family that follows the picture (the preview page reads its own picture at 32 × 18 px ≤ 4 a
//    second, right after a frame: three-sandbox.html "stage150"), eased here; the brackets / rulers pulse on the song's
//    kicks / snares (the timeline's own analysis and your K / S / H markers), an edge glow follows its level curve, beat
//    pips follow the grid (three-media.js hands over what it already holds on each worked tick while it plays).
//    Lab ⋯ › View & help › "Stage: reactive → calm → off" (calm: the colour only; off: still mono gold, round 151). Off under
//    reduced motion / Hearth's Motion calm or off (the colour is still read while stopped, applied without easing).
// Cost (measured by dev/checks/stage150.js): see the doc. Nothing per frame in the window unless the reactive stage is on
// and the song plays (a few comparisons per worked tick, Web Animations on transform / opacity for the pulses).
const LabHudStage = (() => {
  const KEY = 'three.stageFx';
  const MODES = ['reactive', 'calm', 'off'];
  const NAMES = { reactive: 'reactive', calm: 'calm', off: 'off' };
  const HINTS = { reactive: 'The frame takes the scene\'s colour and pulses with the kicks', calm: 'The frame takes the scene\'s colour, no pulse', off: 'A still gold frame' };
  const BASE = { forge: 40, plain: 40 }; // (round 151, redux151) Forgeheart gold (was round 148's blue, 222)
  const IDLE_MS = 2000;
  const FRESH_MS = 6000;
  const VIEW = ['.stage-pill'];
  const STATS = ['.three-stats', '.lab-adapt-note', '.lab-pace-note', '.lab-perf-hud'];
  const WARN = '.lab-speedchip, .lab-safe';
  const de = document.documentElement;
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const S = {
    pv: null, head: null, hud: null, h: {}, frameFn: null, frameEl: null, send: null, ready: null, media: null, frozen: null,
    pinned: false, zone: '', headIn: false, idle: true, timer: 0, rect: null, fb: null, vis: true, playing: false,
    hue: null, hueT: null, k: 0.2, kT: 0.2, raf: 0, rafAt: 0, lastTint: null, tints: 0,
    lastT: -1, ix: {}, hitAt: {}, lvl: 0, lvlShown: -1, lvlAt: 0, pips: [], bpb: 4,
    counts: { kick: 0, snare: 0, hats: 0, beat: 0, feed: 0, tintMsgs: 0, ptrMsgs: 0, labels: 0 }, feedMs: 0, applyMs: 0, labelMs: 0,
    labT: 0, fps: null, sent: '', warn: new Map(), obs: null, ro: null, io: null,
  };
  const pref = () => { const v = store.get(KEY, 'off'); return MODES.includes(v) ? v : 'off'; };
  const look = () => (window.LabRegroup?.look?.() || de.dataset.lablook || 'forge');
  const reduced = () => rmq.matches || de.dataset.motion === 'calm' || de.dataset.motion === 'off';
  // what the stage does now: 'off' (Plain or the setting), 'calm' (colour), 'reactive' (colour + pulse); still: no easing
  const fx = () => (look() === 'plain' || de.hasAttribute('data-lite') ? 'none' : pref()); // (round 153a, lite153: ⚡ Lite mode: no reactive stage, no colour reading)
  const tintOn = () => S.vis && (fx() === 'reactive' || fx() === 'calm') && !(reduced() && S.playing);
  const pulseOn = () => S.vis && fx() === 'reactive' && !reduced();
  const base = () => BASE[look()] ?? 40;

  // ---------- building ----------
  const mk = (tag, cls, kids = []) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const k of kids) n.append(k); return n; };
  const txt = (cls, t = '') => { const n = mk('span', cls); n.append(document.createTextNode(t)); return n; };
  function build() {
    const hud = mk('div', 'st-hud');
    hud.setAttribute('aria-hidden', 'true');
    const br = (c) => mk('i', `st-br ${c}`);
    const frame = mk('div', 'st-frame', [br('st-tl'), br('st-tr'), br('st-bl'), br('st-brr'), mk('i', 'st-rule st-rt'), mk('i', 'st-rule st-rb'), mk('i', 'st-rule st-rl'), mk('i', 'st-rule st-rr')]);
    const flash = mk('div', 'st-flash', [br('st-tl'), br('st-tr'), br('st-bl'), br('st-brr')]);
    const rflash = mk('div', 'st-rflash', [mk('i', 'st-rule st-rt'), mk('i', 'st-rule st-rb')]);
    const glow = mk('i', 'st-glow');
    const fill = mk('i', 'st-prog-fill'); const prog = mk('div', 'st-prog', [fill]);
    const reticle = mk('i', 'st-x');
    const state = txt('st-state', 'STOP'); const size = txt('st-size', '');
    const pips = mk('span', 'st-pips', Array.from({ length: 4 }, () => mk('i')));
    const bpm = txt('st-bpm', ''); const hat = mk('i', 'st-hat');
    const tc = txt('st-tc', '0:00.0'); const dur = txt('st-dur', '');
    const fps = txt('st-fps', ''); const qual = txt('st-qual', '');
    const tl = mk('div', 'st-lb st-lb-tl', [mk('i', 'st-dot'), state, mk('i', 'st-sep'), size]);
    const tc0 = mk('div', 'st-lb st-lb-tc', [pips, bpm, hat]);
    const bl = mk('div', 'st-lb st-lb-bl', [mk('b', 'st-k', ['T']), tc, dur]);
    const brl = mk('div', 'st-lb st-lb-br', [fps, mk('b', 'st-k', ['FPS']), qual]);
    const hintTR = mk('div', 'st-hint st-hint-tr', [mk('i', 'st-hint-ic'), txt('', 'VIEW')]);
    const hintB = mk('div', 'st-hint st-hint-b', [txt('', 'STATS'), mk('i', 'st-hint-ic')]);
    hud.append(glow, frame, prog, rflash, flash, reticle, tl, tc0, bl, brl, hintTR, hintB);
    S.h = { hud, frame, flash, rflash, glow, prog, fill, state, size, pips: [...pips.children], bpm, hat, tc, dur, fps, qual, tl };
    return hud;
  }
  const put = (n, v) => { if (n && n.firstChild && n.firstChild.data !== v) { n.firstChild.data = v; return true; } return false; };
  const cls = (n, c, on) => { if (n && n.classList.contains(c) !== Boolean(on)) n.classList.toggle(c, Boolean(on)); };

  // ---------- where the picture is (the frame inside the preview, letterboxed for 9:16 …) ----------
  function measure() {
    const pv = S.pv; if (!pv) return;
    const fr = S.frameFn?.() || null;
    if (fr !== S.frameEl) { if (S.frameEl) S.ro?.unobserve(S.frameEl); S.frameEl = fr; if (fr) S.ro?.observe(fr); }
    const P = pv.getBoundingClientRect();
    const F = fr?.getBoundingClientRect?.();
    const k = pv.offsetWidth ? P.width / pv.offsetWidth : 1; // (a zoomed Lab)
    const f = F && F.width > 4 ? { x: (F.left - P.left) / k, y: (F.top - P.top) / k, w: F.width / k, h: F.height / k } : { x: 0, y: 0, w: pv.clientWidth, h: pv.clientHeight };
    S.rect = { w: pv.clientWidth, h: pv.clientHeight, k };
    S.fb = f;
    const st = S.h.hud.style;
    const v = [`${Math.round(f.x)}px`, `${Math.round(f.y)}px`, `${Math.round(f.w)}px`, `${Math.round(f.h)}px`];
    if (st.left !== v[0]) st.left = v[0]; if (st.top !== v[1]) st.top = v[1]; if (st.width !== v[2]) st.width = v[2]; if (st.height !== v[3]) st.height = v[3];
  }

  // ---------- 1. quiet chrome: idle, zones, pinned ----------
  function zoneAt(x, y) { // x, y in the preview's own px
    const R = S.rect; if (!R) return '';
    if (x < 0 || y < 0 || x > R.w || y > R.h) return 'out';
    if (x > R.w - Math.max(300, R.w * 0.38) && y < Math.max(100, R.h * 0.24)) return 'tr';
    if (y > R.h - Math.max(64, R.h * 0.14)) return 'b';
    return 'mid';
  }
  function paint() {
    const pv = S.pv; if (!pv) return;
    cls(pv, 'st-idle', S.idle && !S.pinned);
    cls(pv, 'st-pin', S.pinned);
    cls(pv, 'st-z-tr', !S.pinned && S.zone === 'tr');
    cls(pv, 'st-z-b', !S.pinned && S.zone === 'b');
    cls(pv, 'st-play', S.playing);
    if (S.head) cls(S.head, 'st-quiet', !S.pinned && !S.headIn);
    cls(de, 'lab-pinned', S.pinned); // (round 151, redux151) I shows every contextual control of the Lab, not only the stage's
    labels(!S.idle || S.pinned);
  }
  function wake(zone) {
    if (zone === 'out') { S.zone = ''; sleep(); return; }
    if (zone) S.zone = zone;
    const was = S.idle; S.idle = false;
    clearTimeout(S.timer); S.timer = setTimeout(maybeSleep, IDLE_MS);
    if (was || zone) paint();
  }
  function maybeSleep() {
    S.timer = 0;
    // still pointing at a control of the stage (reading it, about to click): it stays until the pointer leaves
    const busy = S.overCtl || S.pv?.querySelector(':scope > :is(.stage-pill, .three-stats):has(:focus-visible)') || document.querySelector('#menu:not([hidden]), .stage-more:focus');
    if (busy) { S.timer = setTimeout(maybeSleep, IDLE_MS); return; }
    sleep();
  }
  function sleep() { clearTimeout(S.timer); S.timer = 0; S.idle = true; S.zone = ''; S.overCtl = false; paint(); }
  function pin(on = !S.pinned, { say = false } = {}) {
    S.pinned = Boolean(on);
    if (!S.pinned) { S.idle = true; S.zone = ''; }
    paint();
    if (say) toast(S.pinned ? 'Scene controls pinned · I again: a clean stage' : 'Clean stage · point at a corner (or press I) for the controls', { timeout: 1600 });
    return S.pinned;
  }
  function onPtrLocal(e) {
    if (!S.rect) measure();
    const P = S.pv.getBoundingClientRect(); const k = S.rect?.k || 1;
    // on a control itself: its own corner (the window's :hover can stay on it after the pointer went into the picture)
    const t = e.target;
    S.overCtl = Boolean(t?.closest?.('.stage-pill, .three-stats, .lab-adapt-note, .lab-speedchip, .lab-safe'));
    const z = t?.closest?.('.stage-pill') ? 'tr' : t?.closest?.('.three-stats, .lab-adapt-note, .lab-pace-note, .lab-perf-hud') ? 'b' : zoneAt((e.clientX - P.left) / k, (e.clientY - P.top) / k);
    wake(z);
  }
  function onPtrMsg(msg) {
    S.counts.ptrMsgs += 1; S.overCtl = false;
    if (msg.out) { if (!S.pv.matches(':hover')) wake('out'); return; }
    if (!S.fb) measure();
    const f = S.fb; if (!f) return;
    wake(zoneAt(f.x + msg.x * f.w, f.y + msg.y * f.h));
  }

  // warnings: shown by themselves for a few seconds when they appear, then tucked into a glyph while the stage is idle
  function adopt(n) {
    if (!(n instanceof Element) || !n.matches(WARN) || S.warn.has(n)) return;
    n.classList.add('st-warn', 'st-fresh');
    S.warn.set(n, setTimeout(() => { n.classList.remove('st-fresh'); }, FRESH_MS));
  }
  function watchWarnings() {
    for (const n of S.pv.querySelectorAll(`:scope > :is(${WARN})`)) adopt(n);
    S.obs = new MutationObserver((list) => {
      for (const m of list) { for (const n of m.addedNodes) adopt(n); for (const n of m.removedNodes) if (S.warn.has(n)) { clearTimeout(S.warn.get(n)); S.warn.delete(n); } }
    });
    S.obs.observe(S.pv, { childList: true });
  }
  // a warning that turns into another one (the Slow chip's mode, a Safe-open note that unfolds) shows again
  function freshen(n) { if (!n) return; n.classList.add('st-fresh'); clearTimeout(S.warn.get(n)); S.warn.set(n, setTimeout(() => n.classList.remove('st-fresh'), FRESH_MS)); }

  // ---------- 2. labels (written only while they show: awake or pinned, ≤ 4 a second) ----------
  function labels(on) {
    // (round 151, perf151) and only while the stage can be seen: pinned, the 4-a-second writer ran on forever with the Lab
    // closed (another surface in front, Hearth hidden in the tray)
    if (!on || look() === 'plain' || !S.vis || document.hidden) { clearInterval(S.labT); S.labT = 0; return; }
    if (S.labT) return;
    writeLabels(); S.labT = setInterval(writeLabels, 250);
  }
  const fmtTc = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const fmtD = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  function writeLabels() {
    const t0 = performance.now();
    const H = S.h; const pv = S.pv; if (!H.hud || !pv) return;
    const fz = Boolean(S.frozen?.());
    put(H.state, fz ? 'HOLD' : S.playing ? 'PLAY' : 'STOP');
    cls(H.tl, 'st-on-play', S.playing && !fz); cls(H.tl, 'st-on-hold', fz);
    const on = pv.querySelector('.stage-size-btn.on')?.textContent?.trim() || '';
    const sz = pv.querySelector('.stage-pill .stage-size')?.textContent?.trim() || (S.fb ? `${Math.round(S.fb.w)}×${Math.round(S.fb.h)}` : '');
    put(H.size, `${on ? `${on} ` : ''}${sz}`.toUpperCase());
    let m = null; try { m = S.media?.meta; } catch { /* no timeline yet */ }
    put(H.tc, fmtTc(m?.t)); put(H.dur, m?.song ? ` / ${fmtD(m.dur)}` : '');
    put(H.bpm, m?.bpm ? `${Math.round(m.bpm)} BPM` : '— BPM');
    if (m?.bpb && m.bpb !== S.bpb) setPips(m.bpb);
    if (!S.playing && m?.beat) beatPips((m.beat || 1) - 1);
    if (!S.playing || reduced()) progress();
    if (S.fps != null) put(H.fps, String(Math.round(S.fps)).padStart(3, '0'));
    const q = pv.querySelector('.three-stats .lab-q')?.textContent?.replace(/^Quality:\s*/i, '').trim() || '';
    put(H.qual, q ? ` · ${q}`.toUpperCase() : '');
    S.counts.labels += 1; S.labelMs += performance.now() - t0;
  }
  // the song's position as a hairline along the bottom edge: glides on the compositor while it plays (one animation from
  // here to the end, made again on a seek / loop / play), set in place while stopped
  let glide = null;
  function progress(restart) {
    const F = S.h.fill; if (!F) return;
    let m = null; try { m = S.media?.meta; } catch { /* no timeline */ }
    const on = Boolean(m?.song && m.dur > 0);
    cls(S.h.prog, 'st-none', !on);
    if (!on) return;
    const k = Math.max(0, Math.min(1, m.t / m.dur));
    if (S.playing && !reduced() && look() !== 'plain') {
      if (glide && !restart) return;
      glide?.cancel();
      try { glide = F.animate([{ transform: `scaleX(${k})` }, { transform: 'scaleX(1)' }], { duration: Math.max(1, (m.dur - m.t) * 1000), easing: 'linear', fill: 'forwards' }); } catch { glide = null; }
      return;
    }
    if (glide) { glide.cancel(); glide = null; }
    const v = `scaleX(${k.toFixed(4)})`; if (F.style.transform !== v) F.style.transform = v;
  }
  function setPips(n) {
    n = Math.min(8, Math.max(2, n || 4)); S.bpb = n;
    const box = S.h.pips[0]?.parentElement; if (!box) return;
    while (S.h.pips.length < n) { const i = mk('i'); box.append(i); S.h.pips.push(i); }
    S.h.pips.forEach((p, i) => { p.hidden = i >= n; });
  }
  function beatPips(k) { S.h.pips.forEach((p, i) => { cls(p, 'on', i <= k); cls(p, 'one', i === 0 && k === 0); }); }

  // ---------- 3. reactive: the picture's colour ----------
  function config(now = false) {
    if (!S.send) return;
    const tint = tintOn();
    const sig = `${tint}|${S.vis}`;
    if (sig === S.sent && !now) return;
    S.sent = sig;
    try { if (S.ready?.() !== false) S.send({ type: 'stage', ptr: true, tint, every: 250, now: tint }); } catch { /* the page is being made */ }
    paintMode();
  }
  function paintMode() {
    const pv = S.pv; if (!pv) return;
    const f = fx();
    for (const m of ['reactive', 'calm', 'off', 'none']) cls(pv, `st-fx-${m}`, f === m);
    cls(pv, 'st-rm', reduced());
    if (f === 'off' || f === 'none' || S.hue == null) { S.hue = S.hueT = base(); S.k = S.kT = f === 'off' ? 0.55 : 0.2; writeTint(); }
  }
  function onTint(msg) {
    S.counts.tintMsgs += 1;
    S.lastTint = msg;
    if (!tintOn()) return;
    const b = base();
    const sat = Number(msg.s) || 0;
    if (msg.h == null || sat < 0.05) { S.hueT = near(S.hue ?? b, b); S.kT = 0.22; } else { S.hueT = near(S.hue ?? b, msg.h); S.kT = Math.min(1, 0.3 + sat * 1.5); }
    S.tints += 1;
    if (reduced()) { S.hue = S.hueT; S.k = S.kT; writeTint(); return; }
    if (!S.raf) { S.rafAt = performance.now(); S.raf = requestAnimationFrame(ease); }
  }
  const near = (from, to) => { const d = ((to - from) % 360 + 540) % 360 - 180; return from + d; }; // (the short way round: hues stay continuous)
  function ease(now) {
    const dt = Math.min(0.1, (now - S.rafAt) / 1000); S.rafAt = now;
    const tau = fx() === 'calm' ? 1.4 : 0.55;
    const a = 1 - Math.exp(-dt / tau);
    S.hue += (S.hueT - S.hue) * a; S.k += (S.kT - S.k) * a;
    const done = Math.abs(S.hueT - S.hue) < 0.4 && Math.abs(S.kT - S.k) < 0.01;
    if (done) { S.hue = S.hueT; S.k = S.kT; }
    writeTint();
    S.raf = done ? 0 : requestAnimationFrame(ease);
  }
  let wrote = '';
  function writeTint() {
    if (!S.pv) return;
    const t0 = performance.now();
    const h = Math.round(S.hue * 2) / 2; const k = Math.round(S.k * 100) / 100;
    const sig = `${h}|${k}`;
    if (sig !== wrote) { wrote = sig; S.pv.style.setProperty('--st-h', String(h)); S.pv.style.setProperty('--st-k', String(k)); if (S.head) { S.head.style.setProperty('--st-h', String(h)); S.head.style.setProperty('--st-k', String(k)); } }
    S.applyMs += performance.now() - t0;
  }

  // ---------- 3. reactive: the song (fed by the timeline's tick while it plays) ----------
  const lower = (a, t, get) => { let lo = 0; let hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (get(a[m]) <= t) lo = m + 1; else hi = m; } return lo; };
  const tOf = (o) => (typeof o === 'number' ? o : o?.t ?? 0);
  function lanes(F) {
    const on = F.onsets || {}; const mk0 = F.marks || {};
    return [['kick', on.kick], ['snare', on.snare], ['hats', on.hats], ['mk', mk0.kick, 'kick'], ['ms', mk0.snare, 'snare'], ['mh', mk0.hit, 'kick']];
  }
  function feed(t, F) {
    const t0 = performance.now();
    S.counts.feed += 1;
    const jump = S.lastT < 0 || t < S.lastT - 0.02 || t - S.lastT > 0.4;
    if (jump) progress(true);
    for (const [id, a, as] of lanes(F)) {
      if (!a?.length) { S.ix[id] = 0; continue; }
      if (jump || S.ix[id] == null || S.ix[id] > a.length) { S.ix[id] = lower(a, t, tOf); continue; }
      let i = S.ix[id]; let hit = null;
      while (i < a.length && tOf(a[i]) <= t) { hit = a[i]; i += 1; }
      S.ix[id] = i;
      if (hit != null && t - tOf(hit) < 0.12) pulse(as || id, typeof hit === 'object' ? hit.s ?? 1 : 1);
    }
    // the level curve (0..1 per frame of the analysis): a soft edge glow, written ≤ 30 a second and only when it moved
    const lv = F.level; const fps = F.fps;
    if (lv?.length && fps) {
      const v = Math.min(1, Math.max(0, Number(lv[Math.min(lv.length - 1, Math.floor(t * fps))]) || 0));
      S.lvl += (v - S.lvl) * (v > S.lvl ? 0.6 : 0.12);
      const now = performance.now();
      if (now - S.lvlAt > 33 && Math.abs(S.lvl - S.lvlShown) > 0.02) { S.lvlAt = now; S.lvlShown = S.lvl; S.h.glow.style.opacity = (0.12 + S.lvl * 0.75).toFixed(2); }
    }
    S.lastT = t;
    S.feedMs += performance.now() - t0;
  }
  const PULSE = {
    kick: (s) => { S.h.flash.animate([{ opacity: 0.25 + 0.75 * s, transform: `scale(${1 + 0.012 * s})` }, { opacity: 0, transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.15,.7,.3,1)' }); },
    snare: (s) => { S.h.rflash.animate([{ opacity: 0.3 + 0.7 * s }, { opacity: 0 }], { duration: 220, easing: 'ease-out' }); },
    hats: () => { S.h.hat.animate([{ opacity: 1 }, { opacity: 0.15 }], { duration: 110, easing: 'linear' }); },
  };
  function pulse(kind, s = 1) {
    const now = performance.now();
    if (now - (S.hitAt[kind] || 0) < 90) return; // (an analysed hit and your marker on the same beat: one pulse)
    S.hitAt[kind] = now;
    S.counts[kind] = (S.counts[kind] || 0) + 1;
    if (!S.h.hud || S.pv?.classList.contains('presenting')) return;
    try { PULSE[kind]?.(Math.max(0.35, Math.min(1, Number(s) || 1))); } catch { /* no Web Animations */ }
  }
  function beat(down, n, bpb) {
    S.counts.beat += 1;
    if (bpb && bpb !== S.bpb) setPips(bpb);
    beatPips(n);
  }

  // ---------- wiring ----------
  function apply({ preview, frame, send, ready, media, frozen } = {}) {
    if (!preview || S.pv) return null;
    S.pv = preview; S.frameFn = frame; S.send = send; S.ready = ready; S.media = media; S.frozen = frozen;
    preview.classList.add('st-on');
    preview.append(build());
    const hd = preview.previousElementSibling;
    if (hd?.classList.contains('ih-pv')) {
      S.head = hd; hd.classList.add('st-head');
      hd.addEventListener('pointerenter', () => { S.headIn = true; paint(); });
      hd.addEventListener('pointerleave', () => { S.headIn = false; paint(); });
    }
    // (round 151) and once more a moment later: an exact frame (9:16, 16:9…) is scaled to fit by the Lab after this
    // callback, so the first reading can be the frame's old box (the corner marks were drawn off the picture)
    S.ro = new ResizeObserver(() => { measure(); clearTimeout(S.mt); S.mt = setTimeout(measure, 160); });
    S.ro.observe(preview);
    S.io = new IntersectionObserver((es) => { const v = es[es.length - 1]?.isIntersecting; if (v !== S.vis) { S.vis = Boolean(v); if (!S.vis) sleep(); config(); paint(); } });
    document.addEventListener('visibilitychange', () => paint()); // (round 151, perf151) the label writer stops while Hearth is hidden
    S.io.observe(preview);
    preview.addEventListener('pointermove', onPtrLocal, { passive: true });
    preview.addEventListener('pointerleave', () => wake('out'));
    preview.addEventListener('focusin', (e) => { if (e.target.closest?.('.stage-pill, .three-stats')) wake(); });
    watchWarnings();
    addEventListener('hearth:lab-playing', (e) => { S.playing = Boolean(e.detail?.playing); S.lastT = -1; if (!S.playing) { S.lvlShown = -1; S.h.glow.style.opacity = ''; } progress(true); config(); paint(); });
    const re = () => { S.sent = ''; config(); };
    rmq.addEventListener?.('change', re);
    new MutationObserver(re).observe(de, { attributes: true, attributeFilter: ['data-motion', 'data-lablook', 'data-lite'] });
    S.playing = Boolean(window.LabPlay?.playing);
    setPips(4);
    measure(); paintMode(); paint(); config(true);
    return S.hud;
  }
  function onReady() { S.sent = ''; S.frameEl = null; measure(); config(true); }
  function msg(m) {
    if (!S.pv) return;
    if (m.type === 'stage-ptr') onPtrMsg(m); else if (m.type === 'stage-tint') onTint(m);
  }
  function stats(m) { S.fps = Number(m?.fps) || 0; }
  function setMode(v) {
    v = MODES.includes(v) ? v : 'reactive';
    store.set(KEY, v);
    S.sent = ''; config(true);
    return v;
  }
  // the Lab's ⋯ › View & help row, right under Lab look: reactive → calm → off (one row, each click the next)
  function row() {
    const v = pref(); const next = MODES[(MODES.indexOf(v) + 1) % MODES.length];
    const plain = look() === 'plain';
    return [`Stage: ${NAMES[v]}${plain ? ' (not in Plain)' : ''}`, `${HINTS[v]} · I shows / hides the preview's controls · click: ${NAMES[next]}`, () => { const w = setMode(next); toast(`Stage: ${NAMES[w]}`, { timeout: 1400 }); }, v !== 'off' && !plain, 'Stage'];
  }
  // /stage show | clean | reactive | calm | off (the command bar and a director chat)
  try {
    Commands.register({ name: 'stage', area: 'Three.js Lab', desc: 'The Lab preview\'s stage: show (pin the controls) · clean (hidden until you point at a corner) · reactive / calm / off (the frame follows the scene and the song)', args: '[show|clean|reactive|calm|off]',
      complete: () => ['show', 'clean', 'reactive', 'calm', 'off'].map((value) => ({ value })),
      run: async (args) => {
        const a = String(args || '').trim().toLowerCase();
        if (window.ThreeLab) await ThreeLab.cmd({ show: true });
        if (MODES.includes(a)) return `Stage: ${setMode(a)}`;
        if (/^(clean|hide|off-ui|auto)$/.test(a)) { pin(false); return 'Clean stage: the controls show where you point (top right: view · bottom: stats) · I pins them'; }
        pin(a ? /^(show|pin|on|controls)$/.test(a) || !S.pinned : !S.pinned);
        return S.pinned ? 'Scene controls pinned (I or /stage clean hides them)' : 'Clean stage';
      } });
  } catch { /* no commands yet */ }
  return {
    apply, onReady, msg, stats, feed, beat, pin, togglePin: (o) => pin(!S.pinned, o), setMode, row, sleep, wake, freshen,
    get live() { return Boolean(S.pv) && pulseOn() && !S.pv.classList.contains('presenting'); },
    get pinned() { return S.pinned; },
    mode: pref,
    state: () => ({ pinned: S.pinned, idle: S.idle, zone: S.zone, headIn: S.headIn, fx: fx(), reduced: reduced(), tintOn: tintOn(), pulseOn: pulseOn(), playing: S.playing, hue: S.hue, hueT: S.hueT, k: S.k, base: base(), lastTint: S.lastTint, counts: { ...S.counts }, feedMs: Math.round(S.feedMs * 100) / 100, applyMs: Math.round(S.applyMs * 100) / 100, labelMs: Math.round(S.labelMs * 100) / 100, rect: S.rect, frame: S.fb, warn: S.warn.size }),
    reset: () => { for (const k of Object.keys(S.counts)) S.counts[k] = 0; S.feedMs = 0; S.applyMs = 0; S.labelMs = 0; return 1; },
    get el() { return S.h.hud || null; },
  };
})();
window.LabHudStage = LabHudStage;
