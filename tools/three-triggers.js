// The ⚡ Triggers panel: what makes audio.kick / bass / snare / hats / hit fire, drawn like an EQ (Pro-Q style).
// Each trigger is a band of the spectrum with a bar: it fires when the sound in its band rises over the bar,
// at most once every `gap` ms. Drag a band's dot (sideways = which frequencies, up / down = the bar),
// drag its edges to make it wider or narrower, or use the wheel over it.
const ThreeTriggers = (() => {
  const LIST = [
    { id: 'kick', name: 'Kick', letter: 'K', color: '#ff6a6a' },
    { id: 'bass', name: 'Bass', letter: 'B', color: '#ff9f43' },
    { id: 'snare', name: 'Snare', letter: 'S', color: '#48ddff' },
    { id: 'hats', name: 'Hats', letter: 'H', color: '#c4ff4d' },
    { id: 'hit', name: 'Hit', letter: 'X', color: '#bd8bff' },
  ];
  // thr: 0..1 on the analyser's level scale; gap: the shortest time between two triggers (ms)
  const DEFAULTS = {
    kick: { on: true, lo: 40, hi: 100, thr: 0.8, gap: 180 },
    bass: { on: true, lo: 60, hi: 250, thr: 0.76, gap: 250 },
    snare: { on: true, lo: 1500, hi: 4500, thr: 0.58, gap: 140 },
    hats: { on: true, lo: 8000, hi: 15000, thr: 0.45, gap: 90 },
    hit: { on: true, lo: 300, hi: 2500, thr: 0.66, gap: 300 },
  };
  const F0 = 20; const F1 = 20000; const BINS = 200; // the spectrum the sketch sends: 200 log-spaced bins
  const clampCfg = (c) => {
    const lo = Math.max(F0, Math.min(F1 / 1.1, c.lo)); const hi = Math.max(lo * 1.1, Math.min(F1, c.hi));
    return { on: c.on !== false, lo: Math.round(lo), hi: Math.round(hi), thr: Math.round(Math.max(0.02, Math.min(0.99, c.thr)) * 1000) / 1000, gap: Math.round(Math.max(30, Math.min(2000, c.gap))), fade: Math.round(Math.max(20, Math.min(2000, c.fade ?? 120))) };
  };
  const merge = (saved) => Object.fromEntries(LIST.map(({ id }) => [id, clampCfg({ ...DEFAULTS[id], ...(saved?.[id] || {}) })]));

  // opts: { cfg, onChange(cfg), onClose(), sense: { auto, value } | null, onSense(patch) }
  function panel(opts) {
    let cfg = merge(opts.cfg);
    let sel = 'kick';
    let viz = null; let shown = null; let vizAt = 0; let autoDone = false;
    const fires = Object.fromEntries(LIST.map(({ id }) => [id, []])); // recent trigger times, for the per-minute count
    const canvas = el('canvas', { class: 'trg-canvas' });
    const chips = el('div', { class: 'trg-chips' });
    const detail = el('div', { class: 'trg-detail' });
    const hist = Object.fromEntries(LIST.map(({ id }) => [id, []])); // ~8 s of each band's level
    function autoBars({ quiet = false } = {}) {
      let n = 0;
      for (const { id } of LIST) {
        const a = [...hist[id]].sort((x, y) => x - y);
        if (a.length < 60 || a[a.length - 1] < 0.03) continue;
        // just under the loud moments: fires on the hits, not on the sustain
        const p = a[Math.floor(a.length * 0.88)]; const top = a[a.length - 1];
        cfg[id] = clampCfg({ ...cfg[id], thr: Math.max(0.03, p + (top - p) * 0.25) });
        n += 1;
      }
      if (n) changed(); else if (!quiet) hint.textContent = 'Play some sound first (a few seconds), then Auto';
      return n;
    }
    const autoBtn = el('button', { class: 'ghost small', text: 'Auto bars', title: 'Set every bar from the last few seconds of sound (just under its loud moments)', on: { click: () => autoBars() } });
    const close = el('button', { class: 'ghost small', text: '×', title: 'Close', on: { click: () => opts.onClose?.() } });
    const hint = el('span', { class: 'trg-hint', text: 'drag a dot: sideways = which sound, up / down = the bar · drag the edges or wheel on the dot = width' });
    const writeBtn = el('button', { class: 'ghost small', text: '→ Timeline', title: 'Write the kicks, snares and hits these triggers find into the timeline as markers you can edit (the loop, or the whole song). Undo with ↶ / Ctrl+Z.', on: { click: () => opts.onWrite?.(cfg, writeBtn) } });
    writeBtn.hidden = !opts.onWrite;
    const head = el('div', { class: 'trg-head' }, el('b', { text: '⚡ Triggers' }), hint, autoBtn, writeBtn, close);
    const senseRow = el('div', { class: 'trg-sense' });
    const root = el('div', { class: 'trg-panel' }, head, canvas, chips, detail, senseRow);
    const changed = () => { opts.onChange?.(cfg); paintChips(); paintDetail(); draw(); };

    // ---------- geometry ----------
    let W = 0; let H = 0;
    const PAD_B = 14; // room for the frequency labels
    const X = (f) => (Math.log(f / F0) / Math.log(F1 / F0)) * W;
    const Finv = (x) => F0 * (F1 / F0) ** Math.max(0, Math.min(1, x / W));
    const Y = (v) => (H - PAD_B) * (1 - v);
    const Vinv = (y) => Math.max(0, Math.min(1, 1 - y / (H - PAD_B)));
    const center = (c) => Math.sqrt(c.lo * c.hi);
    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = devicePixelRatio || 1;
      if (!r.width) return false;
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
      W = r.width; H = r.height;
      return true;
    }

    // ---------- drawing ----------
    function draw() {
      if (!size()) return;
      const g = canvas.getContext('2d');
      const dpr = devicePixelRatio || 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
      g.font = '10px Consolas, monospace'; g.textAlign = 'center';
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        g.fillStyle = '#ffffff10'; g.fillRect(Math.round(X(f)), 0, 1, H - PAD_B);
        g.fillStyle = '#ffffff55'; g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), X(f), H - 3);
      }
      for (const v of [0.25, 0.5, 0.75]) { g.fillStyle = '#ffffff0a'; g.fillRect(0, Math.round(Y(v)), W, 1); }
      // the sound
      if (shown) {
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#ffd75e55'); grad.addColorStop(1, '#ffd75e05');
        g.beginPath(); g.moveTo(0, Y(0));
        for (let i = 0; i < BINS; i += 1) g.lineTo(((i + 0.5) / BINS) * W, Y(shown[i] / 255));
        g.lineTo(W, Y(0)); g.closePath(); g.fillStyle = grad; g.fill();
        g.beginPath();
        for (let i = 0; i < BINS; i += 1) g[i ? 'lineTo' : 'moveTo'](((i + 0.5) / BINS) * W, Y(shown[i] / 255));
        g.strokeStyle = '#ffd75ecc'; g.lineWidth = 1.2; g.stroke();
      } else {
        g.fillStyle = '#ffffff40'; g.fillText('Play the song or start 🎧 Live to see the sound', W / 2, H / 2);
      }
      // the bands (the selected one on top)
      const order = [...LIST.filter((t) => t.id !== sel), LIST.find((t) => t.id === sel)];
      const now = performance.now();
      for (const t of order) {
        const c = cfg[t.id];
        if (!c.on) continue;
        const x0 = X(c.lo); const x1 = X(c.hi); const isSel = t.id === sel;
        const age = viz ? now - vizAt + (viz.since?.[t.id] ?? 1e9) : 1e9;
        const flash = Math.max(0, 1 - age / 220);
        g.fillStyle = `${t.color}${Math.round((isSel ? 0.13 : 0.06) * 255 + flash * 90).toString(16).padStart(2, '0')}`;
        g.fillRect(x0, 0, x1 - x0, H - PAD_B);
        // how loud the band is right now: a column against its bar
        const e = viz?.e?.[t.id];
        if (e != null) { g.fillStyle = `${t.color}${isSel ? '66' : '33'}`; const w = Math.min(10, (x1 - x0) * 0.3); g.fillRect(x1 - w - 2, Y(e), w, Y(0) - Y(e)); }
        if (isSel) { g.fillStyle = `${t.color}aa`; g.fillRect(x0, 0, 1.5, H - PAD_B); g.fillRect(x1 - 1.5, 0, 1.5, H - PAD_B); }
        // the bar
        g.fillStyle = t.color; g.globalAlpha = isSel ? 1 : 0.6;
        g.fillRect(x0, Y(c.thr) - 1, x1 - x0, 2);
        g.globalAlpha = 1;
        // the dot
        const cx = X(center(c)); const cy = Y(c.thr);
        g.beginPath(); g.arc(cx, cy, isSel ? 8 : 6.5, 0, Math.PI * 2);
        g.fillStyle = flash > 0 ? '#ffffff' : t.color; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = '#000000aa'; g.stroke();
        g.fillStyle = '#000'; g.font = 'bold 9px Consolas, monospace'; g.fillText(t.letter, cx, cy + 3);
        g.font = '10px Consolas, monospace';
      }
    }

    // ---------- the sound from the sketch (~25 times a second) ----------
    let raf = 0;
    function feed(data) {
      viz = data; vizAt = performance.now();
      const s = data.spec;
      if (!shown || shown.length !== s.length) shown = Float32Array.from(s);
      else for (let i = 0; i < s.length; i += 1) shown[i] = s[i] > shown[i] ? s[i] : shown[i] * 0.82 + s[i] * 0.18; // quick up, slow down
      for (const { id } of LIST) {
        if (data.fired?.includes(id)) fires[id].push(vizAt);
        if (data.e?.[id] != null && data.spec.some((v) => v > 0)) { hist[id].push(data.e[id]); if (hist[id].length > 200) hist[id].shift(); }
      }
      // never tuned yet: set the bars from the sound once it has played a few seconds
      if (opts.untuned && !autoDone && hist.kick.length >= 120) { autoDone = true; if (autoBars({ quiet: true })) hint.textContent = 'Bars set from this sound: drag them to taste'; }
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); paintRates(); });
    }

    // ---------- mouse ----------
    function hit(x, y) {
      const order = [LIST.find((t) => t.id === sel), ...LIST.filter((t) => t.id !== sel)];
      for (const t of order) { const c = cfg[t.id]; if (c.on && Math.hypot(x - X(center(c)), y - Y(c.thr)) < 11) return { id: t.id, mode: 'move' }; }
      const c = cfg[sel];
      if (c.on && Math.abs(x - X(c.lo)) < 6) return { id: sel, mode: 'lo' };
      if (c.on && Math.abs(x - X(c.hi)) < 6) return { id: sel, mode: 'hi' };
      for (const t of order) { const k = cfg[t.id]; if (k.on && x > X(k.lo) && x < X(k.hi)) return { id: t.id, mode: 'select' }; }
      return null;
    }
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointermove', (e) => {
      if (drag) return;
      const h = hit(...pos(e));
      canvas.style.cursor = !h ? 'default' : h.mode === 'move' ? 'grab' : h.mode === 'select' ? 'pointer' : 'ew-resize';
      const c = h ? cfg[h.id] : null;
      canvas.title = c ? `${LIST.find((t) => t.id === h.id).name}: ${fmtHz(c.lo)}–${fmtHz(c.hi)}, bar ${Math.round(c.thr * 100)}%, at most every ${c.gap} ms` : '';
    });
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = pos(e);
      const h = hit(x, y);
      if (!h) return;
      sel = h.id;
      if (h.mode === 'select') { changed(); return; }
      const c = cfg[h.id];
      drag = { ...h, x, y, lo: c.lo, hi: c.hi, thr: c.thr };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = h.mode === 'move' ? 'grabbing' : 'ew-resize';
      paintChips(); paintDetail();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = pos(e);
      const c = cfg[drag.id];
      const fine = e.shiftKey ? 0.25 : 1;
      if (drag.mode === 'move') {
        const k = Finv(X(Math.sqrt(drag.lo * drag.hi)) + (x - drag.x) * fine) / Math.sqrt(drag.lo * drag.hi);
        Object.assign(c, clampCfg({ ...c, lo: drag.lo * k, hi: drag.hi * k, thr: Vinv(Y(drag.thr) + (y - drag.y) * fine) }));
      } else if (drag.mode === 'lo') Object.assign(c, clampCfg({ ...c, lo: Math.min(Finv(x), c.hi / 1.1) }));
      else Object.assign(c, clampCfg({ ...c, hi: Math.max(Finv(x), c.lo * 1.1) }));
      changed();
    });
    const end = () => { if (drag) { drag = null; canvas.style.cursor = 'grab'; } };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      const h = hit(...pos(e));
      if (!h || h.mode !== 'move') return;
      e.preventDefault();
      sel = h.id;
      const c = cfg[sel];
      if (e.altKey) { Object.assign(c, clampCfg({ ...c, gap: c.gap * (e.deltaY > 0 ? 1.12 : 1 / 1.12) })); changed(); return; }
      const m = Math.sqrt(c.lo * c.hi); const r = Math.sqrt(c.hi / c.lo) ** (e.deltaY > 0 ? 1.12 : 1 / 1.12);
      Object.assign(c, clampCfg({ ...c, lo: m / Math.max(1.05, r), hi: m * Math.max(1.05, r) }));
      changed();
    }, { passive: false });

    // ---------- chips, the selected trigger, sensitivity ----------
    const fmtHz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);
    const leds = {};
    function paintChips() {
      chips.replaceChildren(...LIST.map((t) => {
        const c = cfg[t.id];
        const led = el('i', { class: 'trg-led' });
        leds[t.id] = led;
        led.style.background = t.color;
        const b = el('button', { class: `ghost small trg-chip${t.id === sel ? ' sel' : ''}${c.on ? '' : ' off'}`, title: `audio.${t.id === 'bass' || t.id === 'hats' ? `trigger('${t.id}')` : t.id}: ${c.on ? `${fmtHz(c.lo)}–${fmtHz(c.hi)} Hz` : 'off'} · double-click to turn on / off`,
          on: { click: () => { sel = t.id; changed(); }, dblclick: () => { c.on = !c.on; changed(); } } }, led, t.name);
        b.style.setProperty('--trg', t.color);
        return b;
      }));
    }
    const rateEl = el('span', { class: 'trg-rate' });
    function paintRates() {
      const now = performance.now();
      for (const { id } of LIST) {
        while (fires[id].length && now - fires[id][0] > 15000) fires[id].shift();
        const age = viz ? now - vizAt + (viz.since?.[id] ?? 1e9) : 1e9;
        if (leds[id]) leds[id].style.opacity = String(0.25 + 0.75 * Math.max(0, 1 - age / 250));
      }
      const n = fires[sel].length;
      rateEl.textContent = viz ? `${n ? Math.round(n * 4) : 0} / min` : '';
    }
    // a drag-to-change number, like a knob: drag up / down or use the wheel
    function dragNum(get, set, fmt, step) {
      const v = el('span', { class: 'trg-num', title: 'Drag up / down or use the wheel · double-click to type' });
      const paint = () => { v.textContent = fmt(get()); };
      v.addEventListener('pointerdown', (e) => {
        const y0 = e.clientY; const v0 = get();
        v.setPointerCapture(e.pointerId);
        const mv = (ev) => { set(step(v0, (y0 - ev.clientY) / (ev.shiftKey ? 8 : 2))); paint(); };
        v.addEventListener('pointermove', mv);
        v.addEventListener('pointerup', () => v.removeEventListener('pointermove', mv), { once: true });
      });
      v.addEventListener('wheel', (e) => { e.preventDefault(); set(step(get(), e.deltaY < 0 ? 2 : -2)); paint(); }, { passive: false });
      v.addEventListener('dblclick', () => { const x = prompt('Value', String(get())); if (x != null && !Number.isNaN(Number(x))) { set(Number(x)); paint(); } });
      paint();
      return v;
    }
    function paintDetail() {
      const t = LIST.find((x) => x.id === sel); const c = cfg[sel];
      const on = el('label', { class: 'check small' }, el('input', { type: 'checkbox', checked: c.on, on: { change: (e) => { c.on = e.target.checked; changed(); } } }), 'On');
      const gap = dragNum(() => c.gap, (x) => { Object.assign(c, clampCfg({ ...c, gap: x })); opts.onChange?.(cfg); }, (x) => `${x} ms`, (v0, d) => v0 * 1.03 ** d);
      const thr = dragNum(() => Math.round(c.thr * 100), (x) => { Object.assign(c, clampCfg({ ...c, thr: x / 100 })); opts.onChange?.(cfg); draw(); }, (x) => `${x}%`, (v0, d) => v0 + d * 0.5);
      detail.replaceChildren(
        el('b', { class: 'trg-name', text: t.name }), on,
        el('span', { class: 'trg-k', text: 'bar' }), thr,
        el('span', { class: 'trg-k', text: 'at most every' }), gap,
        el('span', { class: 'trg-k', text: 'fade' }), dragNum(() => c.fade, (x) => { Object.assign(c, clampCfg({ ...c, fade: x })); opts.onChange?.(cfg); }, (x) => `${x} ms`, (v0, d) => v0 * 1.03 ** d),
        el('span', { class: 'trg-k', text: `${fmtHz(c.lo)}–${fmtHz(c.hi)} Hz` }), rateEl,
        el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', text: '↺', title: `Reset ${t.name} to its default`, on: { click: () => { cfg[sel] = { ...DEFAULTS[sel] }; changed(); } } }));
      paintRates();
    }
    function paintSense() {
      const s = opts.sense?.();
      senseRow.hidden = !s;
      if (!s) return;
      senseRow.replaceChildren(el('span', { class: 'trg-k', text: 'Live sound' }),
        el('label', { class: 'check small', title: 'Quiet or loud playback moves the sketch about the same' }, el('input', { type: 'checkbox', checked: s.auto, on: { change: (e) => { opts.onSense?.({ auto: e.target.checked }); paintSense(); } } }), 'Auto level'),
        el('span', { class: 'trg-seg' }, ...[['Calm', 0.6], ['Normal', 1], ['Wild', 1.8]].map(([n, v]) => el('button', { class: `ghost small${s.sense === v ? ' on' : ''}`, text: n, title: `Reaction × ${v}`, on: { click: () => { opts.onSense?.({ sense: v }); paintSense(); } } }))));
    }
    paintChips(); paintDetail(); paintSense();
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return {
      el: root, feed, refreshSense: paintSense,
      set(next) { cfg = merge(next); paintChips(); paintDetail(); draw(); },
      destroy() { ro.disconnect(); cancelAnimationFrame(raf); root.remove(); },
    };
  }
  return { LIST, DEFAULTS, BINS, F0, F1, merge, panel };
})();
