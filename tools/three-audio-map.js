// "React" any slider to any sound (round 23, labaudio): the curve editor, the live meters on following sliders and
// the reaction presets. A slider's binding is { band: <feature>, amount (−1..1 of its range), c: { thr, gam, inv,
// att, rel } }; the preview applies it every frame (three-sandbox.html valueOf → fxShape) and reports what it did
// ~12 times a second while it moves ('audio-meter'), which lights a thin meter under the slider and the dot on the
// curve here. Opened from a slider's ♪ panel ("⚙ Curve & more sounds…"), its right-click menu, /react and /react-preset.
const ThreeAudioMap = (() => {
  const DEF = { thr: 0, gam: 1, inv: false, att: 0, rel: 0 };
  const compact = (c) => { const o = {}; for (const k of Object.keys(DEF)) if (c[k] != null && c[k] !== DEF[k]) o[k] = c[k]; return Object.keys(o).length ? o : null; };
  // ---------- presets: a feature, an amount, a curve, and which slider names they suit ----------
  const PRESETS = [
    { id: 'pump-kick', name: 'Pump on kick', hint: 'Jumps on each kick, falls back in ~180 ms', band: 'kickOn', amount: 0.35, c: { rel: 180 }, fits: /size|scale|pulse|zoom|radius|bump|punch/i },
    { id: 'glow-hats', name: 'Glow on hats', hint: 'A quick glint on every hat', band: 'hatOn', amount: 0.4, c: { rel: 110 }, fits: /glow|bloom|bright|emiss|light|intens|spark|flare/i },
    { id: 'zoom-drops', name: 'Zoom on drops', hint: 'A big push on each drop, easing out over ~1.5 s', band: 'drop', amount: 0.5, c: { att: 30, rel: 1500 }, fits: /zoom|fov|camera|dist|scale|size/i },
    { id: 'rise-builds', name: 'Rise through builds', hint: 'Climbs as a build heads into the drop', band: 'build', amount: 0.6, c: { att: 200, rel: 400 }, fits: /speed|intens|chaos|noise|distort|glow|energy|amount/i },
    { id: 'shake-snare', name: 'Shake on snare', hint: 'A hit on each snare', band: 'snareOn', amount: 0.3, c: { rel: 150 }, fits: /shake|glitch|jitter|distort|offset|rgb|split|warp/i },
    { id: 'breathe-loud', name: 'Breathe with loudness', hint: 'Swells with the loud parts, smooth', band: 'loudness', amount: 0.3, c: { att: 120, rel: 600 }, fits: /scale|size|radius|opacity|alpha|amount|density/i },
    { id: 'spin-flux', name: 'Spin with the change', hint: 'Faster when the sound changes a lot', band: 'flux', amount: 0.3, c: { att: 50, rel: 400 }, fits: /speed|rot|spin|twist|turn|orbit/i },
    { id: 'color-key', name: 'Color from the key', hint: 'The song\'s key picks the hue (neighbouring keys, neighbouring hues)', band: 'keyHue', amount: 1, c: { att: 500, rel: 2000 }, fits: /hue|tint|color|colour|shift/i },
    { id: 'bright-highs', name: 'Brighter with the highs', hint: 'Follows how bright the sound is', band: 'centroid', amount: 0.4, c: { att: 80, rel: 300 }, fits: /bright|exposure|glow|white|light/i },
    { id: 'wobble-sub', name: 'Wobble on the sub', hint: 'Follows the sub bass, a little smoothed', band: 'sub', amount: 0.3, c: { att: 20, rel: 250 }, fits: /wobble|warp|bend|wave|displace|bulge/i },
    { id: 'sparkle-air', name: 'Sparkle in the air', hint: 'The very top end: cymbals, shakers, air', band: 'airHit', amount: 0.4, c: { rel: 90 }, fits: /spark|grain|noise|star|glitter|dust/i },
    { id: 'follow-vocals', name: 'Follow the vocals', hint: 'Rises while someone sings', band: 'vocal', amount: 0.35, c: { att: 60, rel: 400 }, fits: /text|title|opacity|alpha|glow|halo/i },
    { id: 'dim-quiet', name: 'Dim in the quiet parts', hint: 'Lower in calm sections, full in the loud ones', band: 'intensity', amount: 0.5, c: { att: 400, rel: 1200 }, fits: /bright|opacity|exposure|alpha|intens/i },
    { id: 'sweep-bar', name: 'Sweep each bar', hint: 'A ramp across every bar, back to 0 on the 1', band: 'barPhase', amount: 0.5, c: {}, fits: /hue|rot|offset|angle|phase|sweep|scan/i },
    { id: 'step-beat', name: 'Step on the beat', hint: 'A short bump on every beat', band: 'beat', amount: 0.25, c: { thr: 0.4 }, fits: /size|scale|pulse|bounce/i },
    { id: 'strobe-hats', name: 'Strobe on loud hats', hint: 'Only the strongest hats: sharp flashes', band: 'hatOn', amount: 0.6, c: { thr: 0.6, gam: 3 }, fits: /flash|strobe|white|exposure/i },
  ];
  const findPreset = (q) => { const w = String(q || '').toLowerCase().trim(); return PRESETS.find((p) => p.id === w || p.name.toLowerCase() === w) || PRESETS.find((p) => p.name.toLowerCase().includes(w) || p.id.includes(w.replace(/\s+/g, '-'))) || null; };
  // the sliders of the selected layer (named, live numbers) → the best one for a preset (not already following)
  function sliderFor(ctl, preset) {
    const list = (ctl?.controls?.() || []).filter((c) => c.min != null && c.max != null && c.step !== 1 && !c.options && c.live !== false);
    const words = (c) => `${c.label} ${c.key} ${c.group || ''}`;
    return list.find((c) => !c.followsMusic && preset.fits.test(words(c))) || list.find((c) => preset.fits.test(words(c))) || list.find((c) => !c.followsMusic) || null;
  }
  function applyPreset(ctl, q, key) {
    const p = typeof q === 'object' ? q : findPreset(q);
    if (!p) return { error: `No preset "${q}". Presets: ${PRESETS.map((x) => x.name).join(', ')}` };
    const slider = key ? (ctl?.controls?.() || []).find((c) => c.key === key) : sliderFor(ctl, p);
    if (!slider) return { error: 'No slider to react: ask the director for a few named sliders first (tweak() values read every frame)' };
    const prev = ctl.binding?.(slider.key) || null;
    ctl.bind(slider.key, p.band, p.amount, compact({ ...DEF, ...p.c }));
    return { preset: p, key: slider.key, label: slider.label, prev };
  }

  // ---------- meters on the sliders ----------
  // meterHost(rowEl, id, on): a thin bar along the bottom of a following slider's row (only while it follows)
  function meterHost(host, id, on) {
    let m = host.querySelector(':scope > .tw-am');
    if (!on) { m?.remove(); return; }
    if (!m) { css(); m = el('i', { class: 'tw-am', title: 'What the music does to this slider now' }); host.append(m); }
    m.dataset.mid = id;
  }
  const lastMeter = new Map();
  // m = [id, out, raw, id, out, raw…] from the preview: transform only (compositor), only when it moved
  function meters(m) {
    for (let k = 0; k + 2 < m.length; k += 3) {
      const id = m[k]; const out = m[k + 1]; const raw = m[k + 2];
      lastMeter.set(id, [out, raw]);
      for (const b of document.querySelectorAll(`.tw-am[data-mid="${CSS.escape(id)}"]`)) {
        const q = Math.round(out * 50) / 50;
        if (b._q === q) continue;
        b._q = q; b.style.transform = `scaleX(${q})`;
      }
      if (ed && ed.a.mid === id) ed.live(out, raw);
    }
  }

  // ---------- the curve editor ----------
  let ed = null; // the open editor
  function close() { ed?.close(); ed = null; }
  function edit(a) {
    close(); css();
    const b0 = a.get();
    const s = { band: b0?.band || 'kickOn', amount: b0?.amount ?? 0.4, c: { ...DEF, ...(b0?.c || {}) } };
    const before = b0 ? JSON.parse(JSON.stringify(b0)) : null;
    const A = typeof ThreeAudio !== 'undefined' ? ThreeAudio : null;
    const label = (n) => A?.label(n) || n;
    const featBtn = el('button', { class: 'ghost small am-feat', type: 'button' });
    const cv = el('canvas', { class: 'am-curve', width: 480, height: 176 });
    const hist = new Float32Array(90); let hi = 0; let dot = null;
    const num = (min, max, step, get, set, fmt, title) => {
      const r = el('input', { type: 'range', min, max, step, value: get(), title });
      const v = el('span', { class: 'am-v', text: fmt(get()) });
      r.addEventListener('input', () => { set(Number(r.value)); v.textContent = fmt(Number(r.value)); changed(); });
      return { r, v, sync: () => { r.value = get(); v.textContent = fmt(get()); } };
    };
    const ms = (x) => (x ? `${Math.round(x)} ms` : 'off');
    const punchU = () => (Math.log(s.c.gam || 1) / Math.log(4) + 1) / 2; // gam 0.25..4 ↔ 0..1
    const fields = [
      ['Amount', num(-1, 1, 0.01, () => s.amount, (x) => { s.amount = x; }, (x) => `${Math.round(x * 100)}%`, 'How far the sound pushes the slider, of its range (negative: the other way)')],
      ['Threshold', num(0, 0.95, 0.01, () => s.c.thr, (x) => { s.c.thr = x; }, (x) => (x ? `${Math.round(x * 100)}%` : 'off'), 'Ignore the sound under this level')],
      ['Punch', num(0, 1, 0.01, punchU, (u) => { s.c.gam = Math.round(4 ** (2 * u - 1) * 100) / 100; }, () => `${s.c.gam}×`, 'Soft (left) … punchy (right): how the curve bends')],
      ['Attack', num(0, 500, 5, () => s.c.att, (x) => { s.c.att = x; }, ms, 'How fast it rises (0 = at once)')],
      ['Release', num(0, 2000, 10, () => s.c.rel, (x) => { s.c.rel = x; }, ms, 'How slowly it falls back (the smoothing)')],
    ];
    const inv = el('input', { type: 'checkbox', checked: Boolean(s.c.inv) });
    inv.addEventListener('change', () => { s.c.inv = inv.checked; changed(); });
    const note = el('div', { class: 'am-note' });
    const pop = el('div', { class: 'am-pop lab-pop', role: 'dialog' },
      el('div', { class: 'am-head' }, el('b', { text: `♪ ${a.label}` }), el('span', { class: 'am-follows', text: 'follows' }), featBtn, el('button', { class: 'ghost small am-x', type: 'button', text: '✕', title: 'Close (Esc)', on: { click: close } })),
      cv,
      ...fields.map(([n, f]) => el('label', { class: 'am-row' }, el('span', { text: n }), f.r, f.v)),
      el('label', { class: 'am-row am-inv' }, inv, el('span', { text: 'Invert (loud → lower)' })),
      note,
      el('div', { class: 'am-foot' },
        el('button', { class: 'ghost small am-btn', type: 'button', text: 'Presets ▾', on: { click: (e) => presetMenu(e.currentTarget) } }),
        el('button', { class: 'ghost small am-btn', type: 'button', text: 'Stop following', on: { click: () => { clearTimeout(tmr); tmr = 0; a.set(null, 0, null); close(); toast(`${a.label} stays still`, { timeout: 1600, action: before ? { label: 'Undo', fn: () => a.set(before.band, before.amount, before.c || null) } : null }); } } }),
        el('button', { class: 'small primary am-btn', type: 'button', text: 'Done', on: { click: close } })));
    function paintFeat() { featBtn.textContent = `${label(s.band)} ▾`; note.textContent = a.live === false ? 'This value is only read when the scene is built: ask the director to read it every frame.' : /^(build|drop|intensity)$/.test(s.band) ? 'Songs: found over the whole song (live: a rough guess).' : ''; }
    function featMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const groups = (A?.GROUPS || []).map(([g, list]) => [g, '', list.map(([n, l]) => [`${s.band === n ? '● ' : ''}${l}`, n, () => { s.band = n; paintFeat(); changed(); }])]);
      ThreeTweaks.menu(r.left, r.bottom + 4, ['Follow', ...groups, ['Classic (kick / snare markers, bands)', '', [['kick', 'Kick'], ['snare', 'Snare'], ['hats', 'Hats'], ['bass', 'Bass'], ['mid', 'Mids'], ['treble', 'Highs'], ['level', 'Loudness'], ['beat', 'Beat']].map(([n, l]) => [`${s.band === n ? '● ' : ''}${l}`, 'your markers / ⚡ triggers', () => { s.band = n; paintFeat(); changed(); }])]]);
    }
    featBtn.addEventListener('click', () => featMenu(featBtn));
    function presetMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      ThreeTweaks.menu(r.left, r.bottom + 4, ['Reaction presets', ...PRESETS.map((p) => [p.name, p.hint, () => { s.band = p.band; s.amount = p.amount; s.c = { ...DEF, ...p.c }; inv.checked = Boolean(s.c.inv); fields.forEach(([, f]) => f.sync()); paintFeat(); changed(); }])]);
    }
    let tmr = 0;
    const apply = () => { tmr = 0; a.set(s.band, s.amount, compact(s.c)); };
    function changed() { draw(); clearTimeout(tmr); tmr = setTimeout(apply, 60); }
    // the curve: input (across) → output (up), the threshold shaded, the live input as a dot and its last few seconds
    function draw() {
      const g = cv.getContext('2d'); const W = cv.width; const H = cv.height; const P = 10;
      const cs = getComputedStyle(pop); const acc = cs.getPropertyValue('--accent').trim() || '#ff7a3d'; const fg = cs.color;
      g.clearRect(0, 0, W, H);
      g.globalAlpha = 0.12; g.fillStyle = fg; g.fillRect(P, P, (W - 2 * P) * s.c.thr, H - 2 * P); g.globalAlpha = 0.25;
      g.strokeStyle = fg; g.lineWidth = 1; g.strokeRect(P + 0.5, P + 0.5, W - 2 * P - 1, H - 2 * P - 1);
      g.globalAlpha = 0.35; g.beginPath();
      for (let k = 0; k < hist.length; k += 1) { const v = hist[(hi + k) % hist.length]; const x = P + (k / (hist.length - 1)) * (W - 2 * P); const y = H - P - v * (H - 2 * P) * 0.35; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.globalAlpha = 1; g.strokeStyle = acc; g.lineWidth = 3; g.beginPath();
      for (let k = 0; k <= 60; k += 1) { const x = k / 60; let y = x; if (s.c.thr > 0) y = Math.max(0, (x - s.c.thr) / (1 - s.c.thr)); if (s.c.gam !== 1) y **= s.c.gam; if (s.c.inv) y = 1 - y; const px = P + x * (W - 2 * P); const py = H - P - y * (H - 2 * P); if (k) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke();
      if (dot) { g.fillStyle = acc; g.beginPath(); g.arc(P + dot[1] * (W - 2 * P), H - P - dot[0] * (H - 2 * P), 7, 0, Math.PI * 2); g.fill(); }
    }
    const place = () => {
      const r = (a.anchor?.isConnected ? a.anchor : document.querySelector('.three-preview') || document.body).getBoundingClientRect();
      const w = 300; const left = Math.max(8, Math.min(innerWidth - w - 8, r.left)); let top = r.bottom + 6;
      if (top + 360 > innerHeight) top = Math.max(8, r.top - 366);
      Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, width: `${w}px` });
    };
    const away = (e) => { if (!pop.contains(e.target) && !e.target.closest?.('.mb-menu.lab-pop')) close(); };
    const keys = (e) => { if (e.key === 'Escape' && !document.querySelector('.mb-menu.lab-pop')) { e.stopPropagation(); close(); } };
    document.body.append(pop); place();
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', keys, true); }, 0);
    paintFeat(); draw();
    if (!b0) changed(); // opening it on a still slider makes it follow (the kick, by default)
    ed = {
      a, pop, state: s,
      live(out, raw) { dot = [out, raw]; hist[hi] = out; hi = (hi + 1) % hist.length; draw(); },
      close() { if (tmr) { clearTimeout(tmr); apply(); } pop.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', keys, true); },
    };
    return ed;
  }

  let styled = false;
  function css() {
    if (styled) return; styled = true;
    document.head.append(el('style', { text: `
.tw-row, .tw-kcell { position: relative; }
.tw-am { position: absolute; left: 6px; right: 6px; bottom: 1px; height: 2px; border-radius: 2px; background: var(--accent, #ff7a3d); transform-origin: left center; transform: scaleX(0); opacity: .85; pointer-events: none; will-change: transform; }
.am-pop { position: fixed; z-index: 990; padding: 10px 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--line-hi, #443e35); background: var(--fh-pop, #0f1214); color: var(--text, #e8e2d6); box-shadow: 0 10px 30px #000a; font-size: 13px; }
.am-head { display: flex; align-items: center; gap: 6px; }
.am-head b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
.am-follows { opacity: .6; font-size: 12px; }
.am-feat { flex: 1; text-align: left; font-weight: 600; }
.am-x { margin-left: auto; }
.am-curve { width: 100%; height: 88px; border-radius: 8px; background: rgba(127,127,127,.08); }
.am-row { display: grid; grid-template-columns: 64px 1fr 52px; align-items: center; gap: 6px; font-size: 12px; }
.am-row input[type=range] { width: 100%; }
.am-v { text-align: right; opacity: .75; font-variant-numeric: tabular-nums; }
.am-inv { grid-template-columns: auto 1fr; }
.am-note { font-size: 11px; opacity: .65; min-height: 0; }
.am-note:empty { display: none; }
.am-foot { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }
.am-foot .am-btn:first-child { margin-right: auto; }
.tw-chip-more { opacity: .85; }
` }));
  }

  return { PRESETS, findPreset, applyPreset, sliderFor, edit, close, meters, meterHost, compact, get open() { return ed; }, get lastMeter() { return lastMeter; } };
})();
