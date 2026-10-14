// ♪ Move with the music (round 38, beatlink): any Lab slider moves with the beat, the bar, the kick, the snare, the
// hi-hats, the bass, the mids, the highs, the vocals, the drums or the loudness, in one gesture and 0 tokens:
// right-click a slider (or its ♪) › "♪ Move with the music…". A small card picks what drives it and how it moves
// (pulse on each hit, follow the level, step through values, random on each hit), and the range it moves in is two
// handles dragged on the slider itself (or on the card's bar), with a live meter of the driver.
// It is the same music link the ♪ panel, the curve editor, /react-to and the presets use (the scene's `bindings`:
// saved with the scene, its looks, 📐 My templates and .hearthpack packs), with a "how" and a range added; the preview
// computes it from the song's time (tools/three-beatlink-core.js), so renders and the Lab sequence move the same, and
// live sound (the computer's or a mic) drives it too. Each change is one step of the sliders' undo (↶ / Ctrl/⌘+Z).
// Chat: /move-with <slider> <kick|snare|hats|beat|bar|bass|mids|highs|vocals|drums|loudness> [pulse|follow|step|random]
// [from X to Y]; Lab search and Find anything know it ("move with the beat", "pulse on kick").
const BeatLink = (() => {
  const C = BeatLinkCore;
  const r4 = (x) => Number(Number(x).toPrecision(5));
  const fmt = (x, int) => (int ? String(Math.round(x)) : String(r4(x)));
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
  const stats = { opened: 0, made: 0, drags: 0 };

  // a sensible first link from the slider's name: a hue / angle steps each bar, a speed / amount follows the
  // loudness, a glow flashes on the hats, anything else pulses on the kick
  function guess(label) {
    const s = String(label || '').toLowerCase();
    if (/hue|color|colour|tint|rot|angle|spin|phase|offset|shift|index|preset|shape|mode/.test(s)) return { band: 'bar', how: 'step' };
    if (/speed|chaos|amount|density|intens|energy|turb|noise|distort/.test(s)) return { band: 'loudness', how: 'follow' };
    if (/glow|bloom|bright|spark|flash|exposure|emiss|light/.test(s)) return { band: 'hats', how: 'pulse' };
    return { band: 'kick', how: 'pulse' };
  }
  // a new link for this slider: the guess (or what was asked), the range from where the slider sits
  function fresh(a, band, how) {
    const g = guess(a.label);
    return C.make({ band: band || g.band, how: how || g.how, v: Number(a.value()), min: a.min, max: a.max, int: a.int });
  }
  // the link with a new driver / how: the range stays, the timing goes back to that pair's defaults
  function retime(link, patch) {
    const n = { ...link, ...patch };
    const D = C.defaults(n.band, n.how);
    n.att = D.att; n.dec = D.dec;
    if (n.how === 'step') n.steps = link.steps || 4; else delete n.steps;
    if (n.how === 'random') n.seed = link.seed || 1; else delete n.seed;
    if (!/^(step|random)$/.test(n.how)) delete n.glide;
    return n;
  }

  // ---------- the card ----------
  let card = null;
  function close() { card?.close(); card = null; }
  function open(a) {
    close(); stats.opened += 1;
    let link = a.get();
    // a slider that follows an older curve (or nothing) becomes a link: one undo step
    if (!C.isLink(link)) { link = fresh(a); a.set(link); stats.made += 1; }
    const before = () => clone(a.get());
    const set = (patch, o) => { link = { ...link, ...patch }; a.set(link, o); paint(); };
    const chip = (text, title, on) => el('button', { type: 'button', class: 'bl-chip', text, title, on: { click: on } });
    const drvBtns = C.DRIVERS.map((d) => chip(d.name, d.hint, () => { link = retime(link, { band: d.id }); a.set(link); paint(); }));
    const howBtns = C.HOWS.map((h) => chip(h.name, h.hint, () => { link = retime(link, { how: h.id }); a.set(link); paint(); }));
    // the range: a bar with two handles (the same as on the slider) and the live value as a dot
    const bar = el('div', { class: 'bl-bar', title: 'Drag the two handles: the lowest and highest value it moves between' });
    const band = el('i', { class: 'bl-band' }); const dot = el('i', { class: 'bl-dot' });
    const hLo = el('i', { class: 'bl-h lo', title: 'From (drag)' }); const hHi = el('i', { class: 'bl-h hi', title: 'To (drag)' });
    bar.append(band, dot, hLo, hHi);
    const rangeTxt = el('span', { class: 'bl-rtxt' });
    dragHandles(bar, a, () => link, (l) => { link = l; paint(); }, along(0));
    // the driver, live (what the preview reads now: ~12 times a second while it moves)
    const meter = el('i', { class: 'bl-meter-fill' });
    const meterTxt = el('span', { class: 'bl-meter-k' });
    // timing: rise / fall for pulse and follow, steps and glide for step, glide and new dice for random
    const field = (label, min, max, stepv, key, unit, title) => {
      const r = el('input', { type: 'range', min, max, step: stepv, title });
      const v = el('span', { class: 'bl-v' });
      let from;
      r.addEventListener('pointerdown', () => { from = before(); });
      r.addEventListener('input', () => { if (from === undefined) from = before(); set({ [key]: Number(r.value) }, { undo: false }); });
      r.addEventListener('change', () => { set({ [key]: Number(r.value) }, { from: from === undefined ? null : from }); from = undefined; });
      const row = el('label', { class: 'bl-row' }, el('span', { text: label }), r, v);
      return { row, sync() { const D = C.defaults(link.band, link.how); const x = link[key] ?? D[key] ?? 0; r.value = x; v.textContent = key === 'steps' ? String(x) : x ? `${Math.round(x)} ${unit}` : 'off'; } };
    };
    const fAtt = field('Rise', 0, 400, 5, 'att', 'ms', 'How long it takes to reach the top after a hit (0: at once)');
    const fDec = field('Fall', 20, 2000, 10, 'dec', 'ms', 'How long it takes to fall back');
    const fSteps = field('Steps', 2, 8, 1, 'steps', '', 'How many values it steps through before it starts again');
    const fGlide = field('Glide', 0, 600, 10, 'glide', 'ms', 'Slide to the next value instead of jumping');
    const dice = el('button', { type: 'button', class: 'ghost small bl-dice', text: '🎲 Other values', title: 'Another sequence of random values (still the same on every render)', on: { click: () => set({ seed: ((link.seed || 1) % 9973) + 1 }) } });
    const note = el('div', { class: 'bl-note' });
    const more = el('button', { type: 'button', class: 'ghost small', text: 'More ▾', title: 'Other sounds with a curve, move by itself', on: { click: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      ThreeTweaks.menu(r.left, r.bottom + 4, ['More', ['♪ Any sound, with a curve…', 'drops, builds, the key, 8 bands…', () => { close(); a.curve?.(); }], ['∿ Move by itself…', 'a wave, a random walk… (no music)', () => { close(); a.panel?.(); }], ['↶ Undo the last change', 'the sliders\' undo (Ctrl/⌘+Z)', () => { lab()?.selCtl?.()?.undo?.(); link = a.get() || link; paint(); }]]);
    } } });
    const pop = el('div', { class: 'bl-pop lab-pop', role: 'dialog', attrs: { 'aria-label': `Move ${a.label} with the music` } },
      el('div', { class: 'bl-head' }, el('b', { text: `♪ ${a.label}` }), el('span', { class: 'bl-sub', text: 'moves with' }), el('button', { type: 'button', class: 'ghost small bl-x', text: '✕', title: 'Close (Esc)', on: { click: close } })),
      el('div', { class: 'bl-chips bl-drv' }, drvBtns),
      el('div', { class: 'bl-seg' }, howBtns),
      el('div', { class: 'bl-range' }, bar, rangeTxt),
      el('div', { class: 'bl-meter', title: 'The driver now' }, el('span', { class: 'bl-meter-bar' }, meter), meterTxt),
      fAtt.row, fDec.row, fSteps.row, fGlide.row, dice, note,
      el('div', { class: 'bl-foot' },
        el('button', { type: 'button', class: 'ghost small', text: 'Stop', title: 'It stays where it is (Ctrl/⌘+Z brings the link back)', on: { click: () => { a.set(null); close(); toast(`${a.label} stays still`, { timeout: 1600 }); } } }),
        more,
        el('button', { type: 'button', class: 'small primary', text: 'Done', on: { click: close } })));
    function paint() {
      drvBtns.forEach((b, k) => b.classList.toggle('on', C.DRIVERS[k].id === link.band));
      howBtns.forEach((b, k) => b.classList.toggle('on', C.HOWS[k].id === link.how));
      const span = (a.max - a.min) || 1; const f = (x) => Math.max(0, Math.min(1, (x - a.min) / span));
      const l = f(Math.min(link.lo, link.hi)); const h = f(Math.max(link.lo, link.hi));
      band.style.left = `${l * 100}%`; band.style.right = `${(1 - h) * 100}%`;
      hLo.style.left = `${f(link.lo) * 100}%`; hHi.style.left = `${f(link.hi) * 100}%`;
      rangeTxt.textContent = `${fmt(link.lo, a.int)} → ${fmt(link.hi, a.int)}`;
      const ph = /^(pulse|follow)$/.test(link.how);
      fAtt.row.hidden = !ph; fDec.row.hidden = !ph || (link.how === 'follow' && /^(beat|bar)$/.test(link.band));
      fSteps.row.hidden = link.how !== 'step'; fGlide.row.hidden = !/^(step|random)$/.test(link.how); dice.hidden = link.how !== 'random';
      [fAtt, fDec, fSteps, fGlide].forEach((x) => x.sync());
      meterTxt.textContent = C.name(link);
      const d = C.DRIVER[link.band];
      // (the sliders' "read every frame" report can lag a re-run: a meter from the preview says it is read live)
      note.textContent = a.live === false && !(typeof ThreeAudioMap !== 'undefined' && ThreeAudioMap.lastMeter.has(a.mid)) ? 'This value is only read when the scene is built: ask the director to read it every frame.'
        : d.kind === 'level' && /^(step|random)$/.test(link.how) ? `${d.name} is a level: it steps on each beat.`
          : link.band === 'vocals' || link.band === 'drums' ? 'Uses the song\'s parts (split once on this computer); a stand-in until then.' : '';
    }
    // the meter and the dot: what the preview reported last, painted only when it moved
    let lastQ = null;
    const tick = setInterval(() => {
      const m = typeof ThreeAudioMap !== 'undefined' ? ThreeAudioMap.lastMeter.get(a.mid) : null;
      if (!m) return;
      const q = `${Math.round(m[0] * 50)}|${Math.round(m[1] * 50)}`;
      if (q === lastQ) return;
      if (lastQ === null && note.textContent.startsWith('This value')) { lastQ = q; paint(); } // (it is read live after all)
      lastQ = q;
      meter.style.transform = `scaleX(${Math.round(m[1] * 50) / 50})`;
      const span = (a.max - a.min) || 1; const v = link.lo + (link.hi - link.lo) * m[0];
      dot.style.left = `${Math.max(0, Math.min(1, (v - a.min) / span)) * 100}%`;
    }, 80);
    const place = () => {
      const r = (a.anchor?.isConnected ? a.anchor : document.querySelector('.three-preview') || document.body).getBoundingClientRect();
      const w = 312; const left = Math.max(8, Math.min(innerWidth - w - 8, r.left)); let top = r.bottom + 6;
      const hgt = pop.offsetHeight || 330;
      if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
      Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, width: `${w}px` });
    };
    const away = (e) => { if (!pop.contains(e.target) && !e.target.closest?.('.mb-menu, .lab-pop, .bl-h')) close(); };
    const keys = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.mb-menu.lab-pop')) { e.stopPropagation(); close(); }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { setTimeout(() => { link = a.get() || link; paint(); }, 0); }
    };
    document.body.append(pop);
    paint(); place();
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', keys, true); }, 0);
    card = { a, pop, get link() { return link; }, paint: () => { link = a.get() || link; paint(); }, close() { clearInterval(tick); pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', keys, true); } };
    return card;
  }

  // ---------- range handles (the card's bar, a slider, a knob) ----------
  // dragging one moves lo or hi; while it moves the link is sent without an undo step, the release is one step.
  // fracAt(event, host rect) → 0..1 along the control
  const clamp01 = (u) => Math.max(0, Math.min(1, u));
  const along = (inset) => (ev, r) => clamp01((ev.clientX - r.left - inset) / Math.max(1, r.width - 2 * inset));
  // a knob: the angle around its center, on its 270° arc (from 135°, clockwise); the gap at the bottom snaps to the nearer end
  const KNOB_FRAC = (ev, r) => {
    const deg = (Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    const u = ((((deg - 135) % 360) + 360) % 360) / 270;
    return u <= 1 ? u : u < 1 + 45 / 270 ? 1 : 0;
  };
  function dragHandles(host, a, getLink, onMove, fracAt) {
    host.addEventListener('pointerdown', (e) => {
      const h = e.target.closest?.('.bl-h');
      if (!h || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const which = h.classList.contains('lo') ? 'lo' : 'hi';
      const from = clone(getLink());
      try { h.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
      h.classList.add('drag'); stats.drags += 1;
      const valueAt = (ev) => {
        const u = fracAt(ev, host.getBoundingClientRect());
        const v = a.min + u * (a.max - a.min);
        return a.int ? Math.round(v) : Number((Math.round(v / (a.step || 1e-3)) * (a.step || 1e-3)).toPrecision(6));
      };
      let cur = from;
      const move = (ev) => { cur = { ...getLink(), [which]: valueAt(ev) }; cur.amount = r4((cur.hi - cur.lo) / ((a.max - a.min) || 1)); a.set(cur, { undo: false }); onMove(cur); };
      const up = () => { h.removeEventListener('pointermove', move); h.classList.remove('drag'); a.set(cur, { from }); onMove(cur); };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up, { once: true });
      h.addEventListener('pointercancel', up, { once: true });
    });
  }

  // ---------- on the slider / knob: a ♪ badge, the range as a band with two handles ----------
  // r: the sliders panel's row ({ el, knob }); adapter() → the link handle (tools/three-tweaks.js linkAdapter).
  // A slider: a band under its track, two handles below it (the thumb stays free). A knob: a cyan arc just outside
  // its ring, a handle at each end (dragged around the knob; the knob itself still turns).
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const KR = 22; const KC = 2 * Math.PI * KR; const KARC = KC * 0.75;
  function decorate(r, adapter) {
    const wrap = r.knob ? null : r.el.querySelector('.tw-range');
    const svg = r.knob ? r.el.querySelector('svg.tw-knob') : null;
    let paintRange = null;
    if (wrap) {
      const ov = el('div', { class: 'bl-on-slider', hidden: true });
      const bandEl = el('i', { class: 'bl-band' }); const lo = el('i', { class: 'bl-h lo', title: 'Moves from here (drag)' }); const hi = el('i', { class: 'bl-h hi', title: 'Moves to here (drag)' });
      ov.append(bandEl, lo, hi);
      wrap.append(ov);
      // the slider's own track is inset 7 px each side (its thumb): the handles sit on the same scale (its min / max can widen)
      const scale = () => { const a = adapter(); const inp = wrap.querySelector('input[type=range]'); return { ...a, min: Number(inp?.min ?? a.min), max: Number(inp?.max ?? a.max) }; };
      let A = null;
      ov.addEventListener('pointerdown', () => { A = scale(); }, true);
      dragHandles(ov, new Proxy({}, { get: (_, k) => (A || (A = scale()))[k] }), () => adapter().get(), () => r.paintLink(), along(7));
      paintRange = (b, on) => {
        ov.hidden = !on;
        if (!on) return;
        const a = scale(); const span = (a.max - a.min) || 1;
        const f = (x) => clamp01((x - a.min) / span);
        const pos = (u) => `calc(7px + (100% - 14px) * ${u})`;
        lo.style.left = pos(f(b.lo)); hi.style.left = pos(f(b.hi));
        bandEl.style.left = pos(f(Math.min(b.lo, b.hi))); bandEl.style.width = `calc((100% - 14px) * ${Math.abs(f(b.hi) - f(b.lo))})`;
      };
    } else if (svg) {
      const g = svgEl('g', { class: 'bl-on-knob', visibility: 'hidden' });
      const arc = svgEl('circle', { cx: 24, cy: 24, r: KR, class: 'bl-karc', fill: 'none', transform: 'rotate(135 24 24)' });
      const lo = svgEl('circle', { r: 3, class: 'bl-h lo' }); const hi = svgEl('circle', { r: 3, class: 'bl-h hi' });
      lo.append(svgEl('title', {})); hi.append(svgEl('title', {}));
      lo.firstChild.textContent = 'Moves from here (drag around the knob)'; hi.firstChild.textContent = 'Moves to here (drag around the knob)';
      g.append(arc, lo, hi);
      svg.setAttribute('overflow', 'visible');
      svg.append(g);
      // the handles' drag must not turn the knob (its own pointerdown is on the svg: stopped at the handle's group)
      dragHandles(g, new Proxy({}, { get: (_, k) => adapter()[k] }), () => adapter().get(), () => r.paintLink(), (ev) => KNOB_FRAC(ev, svg.getBoundingClientRect()));
      const at = (u) => { const t = ((135 + u * 270) * Math.PI) / 180; return [24 + KR * Math.cos(t), 24 + KR * Math.sin(t)]; };
      paintRange = (b, on) => {
        g.setAttribute('visibility', on ? 'visible' : 'hidden');
        if (!on) return;
        const a = adapter(); const span = (a.max - a.min) || 1;
        const f = (x) => clamp01((x - a.min) / span);
        const u0 = Math.min(f(b.lo), f(b.hi)); const u1 = Math.max(f(b.lo), f(b.hi));
        arc.setAttribute('stroke-dasharray', `${Math.max(0.001, (u1 - u0) * KARC)} ${KC}`);
        arc.setAttribute('stroke-dashoffset', String(-u0 * KARC));
        const [x0, y0] = at(f(b.lo)); const [x1, y1] = at(f(b.hi));
        lo.setAttribute('cx', x0.toFixed(2)); lo.setAttribute('cy', y0.toFixed(2)); hi.setAttribute('cx', x1.toFixed(2)); hi.setAttribute('cy', y1.toFixed(2));
      };
    }
    r.paintLink = () => {
      const a = adapter(); const b = a.get(); const on = C.isLink(b);
      r.el.classList.toggle('bl-linked', on);
      if (on) r.el.dataset.beatlink = C.short(b); else delete r.el.dataset.beatlink;
      paintRange?.(b, on);
      if (card && card.a.mid === a.mid) card.paint();
    };
    r.paintLink();
  }

  // ---------- the Lab: a menu row to pick a slider, the help, commands ----------
  const lab = () => (typeof ThreeAudio !== 'undefined' ? ThreeAudio.lab : null);
  // every live number slider of the scene (the selected layer first) → [{ ctl, key, label, layer, link }]
  function sliders() {
    const l = lab(); if (!l) return [];
    const out = []; const sel = l.selCtl?.();
    const add = (ctl, layer) => { for (const c of ctl?.controls?.() || []) if (c.min != null && !c.options && !out.some((x) => x.ctl === ctl && x.key === c.key)) out.push({ ctl, key: c.key, label: c.label, layer, link: C.isLink(c.followsMusic) ? c.followsMusic : null }); };
    add(sel, null);
    for (const L of l.layers?.() || []) if (L.ctl !== sel) add(L.ctl, L.name);
    return out;
  }
  // the preview's ✦ More › ♪ Music row (also found by Lab search and Find anything)
  function pickMenu(anchor) {
    const list = sliders();
    const r = (anchor?.getBoundingClientRect?.() || document.querySelector('.three-preview')?.getBoundingClientRect?.() || { left: 80, bottom: 80 });
    if (!list.length) { toast('No sliders to move yet: ask the director for a few named sliders (tweak()), or open a scene', { timeout: 3500 }); return; }
    ThreeTweaks.menu(r.left, r.bottom + 4, ['Which slider moves with the music?', ...list.slice(0, 40).map((s) => [`${s.link ? '♪ ' : ''}${s.label}${s.layer ? ` · ${s.layer}` : ''}`, s.link ? C.short(s.link) : '', () => s.ctl.openLink(s.key)])]);
  }
  const item = () => ({ label: '♪ Move a slider with the music…', hint: 'pulse on the kick, step on each bar, follow the bass (move with the beat)', cmd: 'move-with', tags: 'move with the beat pulse on kick step each bar follow bass random hats snare vocals loudness slider rhythm', boost: 0.4, action: (anchor) => pickMenu(anchor?.getBoundingClientRect ? anchor : null) });

  // /move-with <slider> <driver> [how] [from X to Y | X..Y] [rise=ms fall=ms steps=n glide=ms] · off · undo · alone: the links
  if (typeof Commands !== 'undefined' && !Commands.get('move-with')) {
    const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
    const ready = async () => { await ThreeLab.cmd(); for (let i = 0; i < 40 && !lab(); i += 1) await new Promise((res) => setTimeout(res, 50)); if (!lab()) throw new Error('Open the Three.js Lab first'); };
    Commands.register({
      name: 'move-with', area: 'Three.js Lab', aliases: ['beatlink', 'move-with-music'],
      desc: 'Move a slider with the music: what drives it (beat, bar, kick, snare, hats, bass, mids, highs, vocals, drums, loudness) and how (pulse, follow, step, random), from one value to another; "off" stops it, alone lists the links. Renders match the preview',
      args: '<slider> <driver> [pulse|follow|step|random] [from X to Y] | <slider> off | undo',
      keywords: 'beat link music move pulse kick step bar follow bass random hats snare vocals react',
      async run(args) {
        await ready();
        const ws = words(args);
        if (!ws.length) { const ls = sliders().filter((s) => s.link); return ls.length ? `Moving with the music:\n${ls.map((s) => `${s.label}${s.layer ? ` [${s.layer}]` : ''} → ${C.short(s.link)}, ${fmt(s.link.lo)} → ${fmt(s.link.hi)}`).join('\n')}` : 'No slider moves with the music yet: /move-with <slider> kick (or right-click a slider › ♪ Move with the music…)'; }
        if (/^undo$/i.test(ws[0])) { lab()?.selCtl?.()?.undo?.(); return 'Undone'; }
        // the slider: the longest start of the words that names one
        const all = sliders(); let s = null; let n = 0;
        for (let k = ws.length; k >= 1 && !s; k -= 1) {
          const q = ws.slice(0, k).join(' ');
          for (const ctl of [...new Set(all.map((x) => x.ctl))]) { const hit = ctl.resolve?.(q); if (hit?.kind === 'number') { s = all.find((x) => x.ctl === ctl && x.key === hit.key) || null; if (s) { n = k; break; } } }
        }
        if (!s) throw new Error(`No slider "${ws[0]}" (sliders: ${all.map((x) => x.label).slice(0, 12).join(', ') || 'none yet'})`);
        const rest = ws.slice(n).join(' ');
        if (/^(off|stop|none|still)$/i.test(rest.trim())) { s.ctl.link(s.key, null); return `${s.label} stays still (/move-with undo brings it back)`; }
        const a = s.ctl.linkAdapter(s.key);
        const band = C.parseDriver(rest); const how = C.parseHow(rest.replace(/\bbeat\b/gi, ''));
        let link = C.isLink(a.get()) ? a.get() : fresh(a, band, how);
        if (band || how) link = retime(link, { ...(band ? { band } : {}), ...(how ? { how } : {}) });
        const rg = /(?:from\s+)?(-?\d*\.?\d+)\s*(?:to|\.\.|→|-)\s*(-?\d*\.?\d+)/i.exec(rest);
        if (rg) { link.lo = Number(rg[1]); link.hi = Number(rg[2]); link.amount = r4((link.hi - link.lo) / ((a.max - a.min) || 1)); }
        for (const m of rest.matchAll(/\b(rise|attack|fall|decay|release|steps|glide|seed)\s*=\s*(\d+)/gi)) { const k = { rise: 'att', attack: 'att', fall: 'dec', decay: 'dec', release: 'dec' }[m[1].toLowerCase()] || m[1].toLowerCase(); link[k] = Number(m[2]); }
        s.ctl.link(s.key, link);
        stats.made += 1;
        return `♪ ${s.label}${s.layer ? ` [${s.layer}]` : ''} → ${C.short(link)}, ${fmt(link.lo, a.int)} → ${fmt(link.hi, a.int)} · /move-with ${s.label} off · Ctrl/⌘+Z undoes it`;
      },
      complete(a) {
        const ws = words(a); const end = /\s$/.test(a);
        const pool = ws.length <= 1 && !end ? sliders().map((s) => s.label) : [...C.DRIVERS.map((d) => d.id), ...C.HOWS.map((h) => h.id), 'off', 'from 0 to 1', 'fall=300', 'steps=4'];
        const last = (end ? '' : ws[ws.length - 1] || '').toLowerCase();
        return pool.filter((x) => x.toLowerCase().includes(last)).slice(0, 14).map((value) => ({ value }));
      },
    });
  }
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: ♪ Move a slider with the music (pulse on kick, step on the beat…)', async () => { try { await ThreeLab.cmd(); for (let i = 0; i < 40 && !lab(); i += 1) await new Promise((res) => setTimeout(res, 50)); pickMenu(null); } catch (err) { toast(err.message, { type: 'error' }); } });

  return { open, close, decorate, guess, fresh, retime, sliders, pickMenu, item, stats, get card() { return card; } };
})();
