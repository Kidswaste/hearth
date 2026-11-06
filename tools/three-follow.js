// 🎚 Follow the music (round 134, audiomap134): "this slider follows the bass", as a small guided card.
// Right-click a slider › 🎚 Follow the music… (or the Sliders panel's ⋯ › 🎚 Follow the music…, or the 〰 mark on a
// slider that already follows): pick a band (Bass, Low-mids, Mids, Highs, Kick, Snare, Overall loudness, or a Custom
// range dragged on a small spectrum), see a live meter of it and the slider moving in the preview, set the range on
// the slider's own scale, the response (smooth / punchy / on the beat only) and ⇅ Invert. Keep = one undo step;
// Cancel (✕, Esc, a click outside) puts back what was there; Remove takes the link off (one undo step).
// It is not a new kind of link: it writes a ♪ Move with the music link (tools/three-beatlink-core.js, round 38) with
// a `resp` and, for these, the drivers lowmids / custom and the how 'onbeat'. So the preview, renders (from the song's
// analysis: the same values at the same time), the Lab sequence, ◉ Perform, live input, packs and templates already
// play it. The first pick comes from the slider's name and the song's analysis (BeatLinkCore.suggest): free, local.
const FollowMusic = (() => {
  const C = BeatLinkCore;
  const stats = { opened: 0, kept: 0, removed: 0, cancelled: 0 };
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
  const r5 = (x) => Number(Number(x).toPrecision(5));
  const fmt = (x, int) => (int ? String(Math.round(x)) : String(r5(x)));
  const lab = () => (typeof ThreeAudio !== 'undefined' ? ThreeAudio.lab : null);
  const song = () => { const p = lab()?.player; return p?.loaded && !p.isClock && p.analysis ? p : null; };
  const liveOn = () => Boolean(lab()?.live?.kind?.());
  const BAND_LABEL = { loudness: 'Loudness' };
  const label = (id) => BAND_LABEL[id] || C.DRIVER[id]?.name || id;
  const LIVE8 = ['sub', 'low', 'lowMid', 'mids', 'highMid', 'presence', 'brilliance', 'air'];

  // ---------- what the band does now, read here (the meter does not wait for the preview) ----------
  // a song: from its analysis at the playhead (the same numbers the preview and renders use); live: the worklet's bands
  const srcCache = new WeakMap();
  function songSrc(an, link) {
    let per = srcCache.get(an); if (!per) { per = new Map(); srcCache.set(an, per); }
    const hz = C.hzOf(link);
    const key = `${link.band}:${hz ? hz.join('-') : ''}`;
    if (per.has(key)) return per.get(key);
    const fps = an.fps || 30;
    const beat = C.hitsOf(an.beats || []);
    const ons = (n) => (an.onsets?.[n] || []).map((x) => (typeof x === 'number' ? x : x.t)).sort((a, b) => a - b);
    const ENV = { bass: an.bass, mids: an.mid, highs: an.treble, loudness: an.level };
    let level = ENV[link.band] ? C.envOf(ENV[link.band], fps) : null;
    if (!level && hz) level = C.specLevel(an.spec, hz[0], hz[1]) || C.envOf(an.mid, fps);
    const hit = /^(kick|snare|hats)$/.test(link.band) ? C.hitsOf(ons(link.band)) : beat;
    const s = { beat, hit, level: level || (() => 0), hist: true };
    per.set(key, s);
    return s;
  }
  // → { level 0..1 (the meter), spec: { edges, vals } | null (the picture), from: 'song' | 'live' | null }
  function readNow(link) {
    const hz = C.hzOf(link);
    if (liveOn()) {
      const v = typeof ThreeAudio !== 'undefined' ? ThreeAudio.liveValues?.() : null;
      if (v) {
        const vals = LIVE8.map((n) => v[n] || 0);
        const kind = C.DRIVER[link.band]?.kind;
        const level = link.band === 'kick' ? v.kickOn || 0 : link.band === 'snare' ? v.snareOn || 0 : link.band === 'loudness' ? v.loudness ?? v.level ?? 0 : kind === 'level' && hz ? C.liveLevel(vals, hz[0], hz[1]) : 0;
        return { level: Math.max(0, Math.min(1, level)), spec: { edges: C.LIVE_BANDS, vals }, from: 'live' };
      }
      return { level: null, spec: null, from: 'live' };
    }
    const p = song();
    if (!p) return { level: null, spec: null, from: null };
    const t = p.time || 0; const s = songSrc(p.analysis, link);
    const level = C.DRIVER[link.band]?.kind === 'hit' ? C.hitEnv(t, s.hit(t), 0, 180) : s.level(t);
    return { level: Math.max(0, Math.min(1, level)), spec: C.specAt(p.analysis.spec, t), from: 'song' };
  }

  // ---------- the card ----------
  let card = null;
  function close(how = 'cancel') { card?.end(how); }
  function open(a) {
    if (!a) return null;
    card?.end('cancel');
    stats.opened += 1;
    const orig = clone(a.get());
    const had = C.isLink(orig);
    const span = (a.max - a.min) || 1;
    // the draft: what the slider follows already, else the guess
    let d;
    let why = '';
    if (had) d = { band: orig.band, resp: C.respOf(orig), lo: orig.lo, hi: orig.hi, inv: Boolean(orig.inv), fLo: orig.fLo, fHi: orig.fHi };
    else { const g = C.suggest({ label: a.label, key: a.key, v: Number(a.value()), min: a.min, max: a.max, int: a.int }, song()?.analysis || null); d = { band: g.band, resp: g.resp, lo: g.lo, hi: g.hi, inv: false }; why = `Suggested: ${label(g.band)}, ${g.resp === 'beat' ? 'on the beat' : g.resp} (${g.why})`; }
    if (d.band === 'custom' && !(d.fLo > 0)) { d.fLo = 60; d.fHi = 250; }
    // an older link with a timing of its own keeps it until a choice here changes it
    let link = had ? orig : null;
    const build = () => C.wizLink({ ...d, min: a.min, max: a.max });
    const apply = () => { link = build(); a.set(link, { undo: false }); paint(); };

    const el2 = (tag, o, ...kids) => el(tag, o, ...kids);
    const chips = C.WIZ.map((id) => el2('button', { type: 'button', class: 'fm-chip', text: id === 'loudness' ? 'Loudness' : label(id), title: id === 'custom' ? 'Drag a range on the spectrum below' : C.DRIVER[id].hint, on: { click: () => { d.band = id; if (id === 'custom' && !(d.fLo > 0)) { d.fLo = 60; d.fHi = 250; } apply(); } } }));
    const resps = C.RESPS.map((r) => el2('button', { type: 'button', class: 'fm-seg-b', text: r.name, title: r.hint, on: { click: () => { d.resp = r.id; apply(); } } }));
    // the spectrum: columns for the bands, the band's range shaded; drag on it for a custom range
    const W = 276; const Hh = 40;
    const cv = el2('canvas', { class: 'fm-spec', title: 'The sound now, low → high. Drag across it to follow your own range (Custom)', attrs: { width: W * 2, height: Hh * 2 } });
    const LO = 20; const HI = 16000;
    const xOf = (hz) => (Math.log(hz / LO) / Math.log(HI / LO)) * W;
    const hzAt = (x) => Math.round(LO * (HI / LO) ** Math.max(0, Math.min(1, x / W)));
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect(); const x0 = ((e.clientX - r.left) / r.width) * W;
      drag = { x0 }; try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = cv.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W;
      if (Math.abs(x - drag.x0) < 3) return;
      const a0 = hzAt(Math.min(x, drag.x0)); const b0 = hzAt(Math.max(x, drag.x0));
      d.band = 'custom'; d.fLo = a0; d.fHi = Math.max(Math.round(a0 * 1.1), b0);
      link = build(); a.set(link, { undo: false }); drag.moved = true; paint();
    });
    const endDrag = () => { drag = null; };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
    const hzTxt = el2('span', { class: 'fm-hz' });
    // the live meter of the band, and the slider as the preview moves it
    const mFill = el2('i', { class: 'fm-fill' }); const mName = el2('span', { class: 'fm-mk' });
    const vFill = el2('i', { class: 'fm-vdot' }); const vBand = el2('i', { class: 'fm-vband' }); const vTxt = el2('span', { class: 'fm-vtxt' });
    const num = (v, on) => { const i = el2('input', { type: 'number', class: 'fm-num', attrs: { step: a.int ? 1 : a.step || 'any' } }); i.value = fmt(v, a.int); i.addEventListener('change', () => { const x = Number(i.value); if (Number.isFinite(x)) { on(a.int ? Math.round(x) : x); apply(); } }); return i; };
    const loIn = num(d.lo, (x) => { d.lo = x; }); const hiIn = num(d.hi, (x) => { d.hi = x; });
    const inv = el2('input', { type: 'checkbox' }); inv.checked = d.inv;
    inv.addEventListener('change', () => { d.inv = inv.checked; apply(); });
    const note = el2('div', { class: 'fm-note', text: why });
    const keepB = el2('button', { type: 'button', class: 'small primary fm-keep', text: 'Keep', title: 'Keep it (one undo step)', on: { click: () => end('keep') } });
    const pop = el2('div', { class: 'fm-pop lab-pop', role: 'dialog', attrs: { 'aria-label': `${a.label} follows the music` } },
      el2('div', { class: 'fm-head' }, el2('b', { text: `🎚 ${a.label}` }), el2('span', { class: 'fm-sub', text: 'follows' }), el2('button', { type: 'button', class: 'ghost small fm-x', text: '✕', title: 'Cancel (Esc): put it back as it was', on: { click: () => end('cancel') } })),
      el2('div', { class: 'fm-chips' }, chips),
      el2('div', { class: 'fm-specw' }, cv, hzTxt),
      el2('div', { class: 'fm-meter', title: 'The band now (song or live input)' }, mName, el2('span', { class: 'fm-bar' }, mFill)),
      el2('div', { class: 'fm-meter fm-slider', title: 'The slider now, as the preview moves it' }, el2('span', { class: 'fm-mk', text: 'Slider' }), el2('span', { class: 'fm-bar fm-vbar' }, vBand, vFill), vTxt),
      el2('div', { class: 'fm-range' }, el2('span', { text: 'From' }), loIn, el2('span', { text: 'to' }), hiIn, el2('label', { class: 'fm-inv', title: 'Loud → the "from" end' }, inv, el2('span', { text: '⇅ Invert' }))),
      el2('div', { class: 'fm-seg' }, resps),
      note,
      el2('div', { class: 'fm-foot' },
        had ? el2('button', { type: 'button', class: 'ghost small fm-remove', text: 'Remove', title: 'It stops following the music (one undo step)', on: { click: () => end('remove') } }) : el2('span'),
        el2('button', { type: 'button', class: 'ghost small fm-more', text: '♪ More…', title: 'Pulse, step, random, the beat or bar, rise / fall times (♪ Move with the music)', on: { click: () => { end('keep'); if (typeof BeatLink !== 'undefined') BeatLink.open(a); } } }),
        el2('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: () => end('cancel') } }),
        keepB));
    let last = { level: null, value: null, s: null };
    function paint() {
      chips.forEach((b, k) => b.classList.toggle('on', C.WIZ[k] === d.band));
      resps.forEach((b, k) => b.classList.toggle('on', C.RESPS[k].id === d.resp));
      const hz = C.hzOf({ band: d.band, fLo: d.fLo, fHi: d.fHi });
      hzTxt.textContent = hz ? C.hzText(hz) : C.DRIVER[d.band]?.hint || '';
      mName.textContent = label(d.band);
      loIn.value = fmt(d.lo, a.int); hiIn.value = fmt(d.hi, a.int); inv.checked = d.inv;
      const f = (x) => Math.max(0, Math.min(1, (x - a.min) / span));
      const l = f(Math.min(d.lo, d.hi)); const h = f(Math.max(d.lo, d.hi));
      vBand.style.left = `${l * 100}%`; vBand.style.right = `${(1 - h) * 100}%`;
      draw();
    }
    let specNow = null;
    function draw() {
      const g = cv.getContext('2d'); if (!g) return;
      g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, Hh);
      const cs = getComputedStyle(pop); const cyan = cs.getPropertyValue('--ui-cyan').trim() || '#48ddff';
      const hz = C.hzOf({ band: d.band, fLo: d.fLo, fHi: d.fHi });
      if (hz) { g.fillStyle = `${cyan}33`; g.fillRect(xOf(hz[0]), 0, Math.max(2, xOf(hz[1]) - xOf(hz[0])), Hh); }
      if (specNow) {
        specNow.edges.forEach(([lo, hi], k) => {
          const x0 = xOf(Math.max(LO, lo)); const x1 = xOf(Math.min(HI, hi)); const v = Math.max(0, Math.min(1, specNow.vals[k]));
          const inR = hz && hi > hz[0] && lo < hz[1];
          g.fillStyle = inR ? cyan : '#8a857a'; g.globalAlpha = inR ? 0.95 : 0.5;
          g.fillRect(x0 + 0.5, Hh - v * (Hh - 2), Math.max(1, x1 - x0 - 1), v * (Hh - 2));
        });
        g.globalAlpha = 1;
      } else { g.fillStyle = '#8a857a'; g.font = '10px sans-serif'; g.fillText(liveOn() ? 'listening…' : 'play the song (or live input) to see it', 6, Hh / 2 + 3); }
      if (hz) { g.strokeStyle = cyan; g.lineWidth = 1; g.strokeRect(xOf(hz[0]) + 0.5, 0.5, Math.max(2, xOf(hz[1]) - xOf(hz[0]) - 1), Hh - 1); }
    }
    // ~12 times a second: the meter, the spectrum, the slider's value (the preview's own, else the same math here)
    const tick = setInterval(() => {
      if (!pop.isConnected) return;
      const cur = link || build();
      const r = readNow(cur);
      specNow = r.spec;
      const m = typeof ThreeAudioMap !== 'undefined' ? ThreeAudioMap.lastMeter.get(a.mid) : null;
      const level = r.level ?? (m ? m[1] : null);
      if (level != null) { mFill.style.transform = `scaleX(${Math.round(level * 100) / 100})`; last.level = level; }
      let s = m ? m[0] : null;
      if (s == null && r.from === 'song') { const p = song(); s = C.value(cur, { ...songSrc(p.analysis, cur), t: p.time || 0 })[2]; }
      if (s != null) {
        const v = cur.lo + (cur.hi - cur.lo) * s;
        last.s = s; last.value = a.int ? Math.round(v) : v;
        vFill.style.left = `${Math.max(0, Math.min(1, (v - a.min) / span)) * 100}%`;
        vTxt.textContent = fmt(v, a.int);
      }
      draw();
    }, 80);
    const place = () => {
      const r = (a.anchor?.isConnected ? a.anchor : document.querySelector('.three-preview') || document.body).getBoundingClientRect();
      const w = 300; const left = Math.max(8, Math.min(innerWidth - w - 8, r.left)); let top = r.bottom + 6;
      const hgt = pop.offsetHeight || 300;
      if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
      Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, width: `${w}px` });
    };
    const away = (e) => { if (!pop.contains(e.target) && !e.target.closest?.('.mb-menu, .lab-pop, .bl-h')) end('cancel'); };
    const keys = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.mb-menu.lab-pop')) { e.stopPropagation(); end('cancel'); }
      if (e.key === 'Enter' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && pop.contains(e.target)) { e.preventDefault(); end('keep'); }
    };
    function end(how) {
      if (!card || card.pop !== pop) return;
      clearInterval(tick); pop.remove();
      removeEventListener('pointerdown', away, true); removeEventListener('keydown', keys, true);
      card = null;
      if (how === 'keep') {
        const l = link || build();
        a.set(l, { from: orig }); stats.kept += 1;
        if (JSON.stringify(l) !== JSON.stringify(orig)) toast(`🎚 ${a.label} follows ${C.short(l)} · Ctrl/⌘+Z undoes it`, { timeout: 2200 });
      } else if (how === 'remove') { a.set(null, { from: orig }); stats.removed += 1; toast(`${a.label} stays still now`, { timeout: 1600 }); }
      else { stats.cancelled += 1; if (JSON.stringify(a.get()) !== JSON.stringify(orig)) a.set(orig, { undo: false }); }
    }
    document.body.append(pop);
    if (!had) apply(); else paint();
    place();
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', keys, true); }, 0);
    card = { a, pop, end, get draft() { return { ...d }; }, get link() { return link || build(); }, get last() { return { ...last }; }, why, set(patch) { Object.assign(d, patch); apply(); } };
    return card;
  }

  // the Sliders panel's ⋯ › 🎚 Follow the music…: which slider (the selected layer first)
  function pick(anchor) {
    const list = typeof BeatLink !== 'undefined' ? BeatLink.sliders() : [];
    const r = anchor?.getBoundingClientRect?.() || document.querySelector('.three-preview')?.getBoundingClientRect?.() || { left: 80, bottom: 80 };
    if (!list.length) { toast('No sliders yet: ask the director for a few named sliders (tweak()), or open a scene', { timeout: 3200 }); return; }
    ThreeTweaks.menu(r.left, r.bottom + 4, ['Which slider follows the music?', ...list.slice(0, 40).map((s) => [`${s.link?.resp ? '〰 ' : ''}${s.label}${s.layer ? ` · ${s.layer}` : ''}`, s.link ? C.short(s.link) : '', () => { const ad = s.ctl.linkAdapter?.(s.key); if (ad) open(ad); }])]);
  }
  return { open, close, pick, readNow, stats, get card() { return card; } };
})();
