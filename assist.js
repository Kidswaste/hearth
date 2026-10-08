// Assist (round 5): Hearth quietly takes small decisions off your hands, and asks Astra only where taste matters.
//   - Shuffle, then pick: /shuffle-pick [n] (or hold / right-click 🎲 Shuffle) makes n variations as thumbnails;
//     you click one, or ✦ lets Astra pick the strongest for the song (one small question with a contact sheet).
//   - Names from content, no tokens: quick looks ("Violet Drop"), sketches (/name), Astra only on /name astra.
//   - Your usual: the frame size you use (per song too) is learned from your clicks; /usual applies it.
//   - Next steps: after a director reply or a jam, a few chips computed here from the Lab's state (no model
//     call), plus one optional "✦ What would Astra do?".
//   - Review with Astra (Video Review): the frame (or a contact sheet) → at most 3 notes on the timeline.
//   - /decide saved: Astra picks one of your saved looks (✦ in the looks row).
// Rules: no model call ever runs without your click or command; local heuristics first; every automatic choice
// shows a toast with Undo (and /assist undo); no new settings. Each question's tokens go to the meter and /assist log.
const Assist = (() => {
  const PERSONA = 'You are a sharp art director who decides quickly. Answer in the format asked, nothing else.';
  const LOG_KEY = 'assist.log';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cap = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const songTitle = (p) => base(p).replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').replace(/\s*[-–]\s*(official|audio|video|lyrics?).*$/i, '').trim();
  const astra = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && !a.dock);
  const claude = () => H.claudeAgent?.() || H.agents().find((a) => a.mode === 'native' && a.engine === 'claude' && !a.dock);
  const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  // ---------- undo: the last automatic choice, one click away ----------
  let lastUndo = null; // { what, fn }
  function offerUndo(text, what, fn, timeout = 6000) {
    lastUndo = fn ? { what, fn } : null;
    toast(text, { timeout, ...(fn ? { action: { label: 'Undo', fn: () => undo() } } : {}) });
  }
  async function undo() {
    if (!lastUndo) return 'Nothing to undo.';
    const u = lastUndo; lastUndo = null;
    await u.fn();
    toast(`Undone: ${u.what}`, { timeout: 1600 });
    return `Undone: ${u.what}`;
  }

  // ---------- one lean question (the only way Assist spends tokens) ----------
  // Astra first (low effort), Claude if Astra is missing or fails; null when neither answers.
  async function ask(kind, text, { images = [] } = {}) {
    for (const agent of [astra(), claude()].filter(Boolean)) {
      const r = await window.hub.askOnce({ agentId: agent.id, text, images, options: { lean: true, persona: PERSONA, ...(agent.engine === 'codex' ? { effort: 'minimal', verbosity: 'low' } : {}) } }).catch((err) => ({ ok: false, error: err.message }));
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: r.usage, source: 'assist' } }));
      if (r?.ok && String(r.text || '').trim()) {
        const entry = { at: Date.now(), kind, by: agent.name, input: r.usage?.input || 0, output: r.usage?.output || 0, promptChars: text.length, images: images.length };
        store.set(LOG_KEY, [entry, ...store.get(LOG_KEY, [])].slice(0, 40));
        console.info(`[assist] ${kind} by ${agent.name} · ${entry.input}+${entry.output} tokens (${text.length} prompt chars, ${images.length} image${images.length === 1 ? '' : 's'})`);
        return { text: String(r.text).trim(), by: agent.name, usage: r.usage || null, tokens: entry.input + entry.output };
      }
    }
    return null;
  }
  const costText = (r) => (r?.usage ? `${fmtK(r.tokens)} tokens` : 'no tokens');

  // ---------- small pictures ----------
  const loadImg = (url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
  async function shrink(url, w = 320, q = 0.72) {
    const img = url && await loadImg(url);
    if (!img?.width) return null;
    const W = Math.min(w, img.width); const Hh = Math.round((img.height / img.width) * W);
    const c = Object.assign(document.createElement('canvas'), { width: W, height: Hh });
    c.getContext('2d').drawImage(img, 0, 0, W, Hh);
    return c.toDataURL('image/jpeg', q);
  }
  const saveJpeg = (dataUrl, name) => (dataUrl ? window.hub.saveAttachment(`${name}-${Date.now()}.jpg`, dataUrl.split(',')[1]).catch(() => null) : null);
  // Numbered tiles side by side in one small JPEG (what Astra sees when it picks).
  async function sheetOf(tiles, tileW = 180) {
    const imgs = await Promise.all(tiles.map((t) => loadImg(t.url)));
    const first = imgs.find(Boolean);
    if (!first) return null;
    const cols = tiles.length <= 4 ? tiles.length : tiles.length <= 6 ? 3 : tiles.length <= 8 ? 4 : 3;
    const th = Math.round(tileW * (first.height / first.width)); const pad = 4;
    const rows = Math.ceil(tiles.length / cols);
    const cv = Object.assign(document.createElement('canvas'), { width: cols * (tileW + pad) + pad, height: rows * (th + pad) + pad });
    const g = cv.getContext('2d');
    g.fillStyle = '#0b0e10'; g.fillRect(0, 0, cv.width, cv.height);
    g.font = 'bold 18px Consolas, monospace';
    tiles.forEach((t, i) => {
      const x = pad + (i % cols) * (tileW + pad); const y = pad + Math.floor(i / cols) * (th + pad);
      if (imgs[i]) g.drawImage(imgs[i], x, y, tileW, th);
      g.fillStyle = '#000b'; g.fillRect(x, y, 26, 24);
      g.fillStyle = '#ffd75e'; g.fillText(String(t.label), x + 7, y + 18);
    });
    return cv.toDataURL('image/jpeg', 0.8);
  }

  // ---------- names from content (no tokens) ----------
  // A color's evocative word, by hue (greys get a light / dark word).
  function colorWord(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (s < 0.18 || d < 0.08) return l < 0.25 ? 'Ink' : l > 0.8 ? 'Pearl' : 'Ash';
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = ((h * 60) + 360) % 360;
    const W = [[15, 'Ember'], [40, 'Amber'], [65, 'Gold'], [90, 'Acid'], [150, 'Jade'], [185, 'Teal'], [205, 'Ice'], [245, 'Cobalt'], [280, 'Violet'], [320, 'Magenta'], [345, 'Rose'], [360, 'Ember']];
    return W.find(([to]) => h < to)[1];
  }
  // The colors that carry the picture: the most saturated first.
  function mainWords(hexes) {
    const sat = (hex) => { const n = parseInt(String(hex).slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return Math.max(...c) - Math.min(...c); };
    const ok = (hexes || []).filter((x) => /^#[0-9a-f]{6}$/i.test(x)).sort((a, b) => sat(b) - sat(a));
    return [...new Set(ok.map(colorWord).filter(Boolean))];
  }
  // What the Lab shows now, for names and questions: sketch, song, the cue at the playhead, frame, tempo.
  function labContext() {
    const c = ThreeLab.peek?.(); const d = ThreeLab.director;
    if (!c || !d) return null;
    const st = c.state;
    let cue = null;
    try { const t = d.media?.time; cue = (d.media?.cues || []).filter((x) => x.time <= t + 0.05).at(-1)?.name || null; } catch { /* no song */ }
    return { sketch: st.sketch, song: st.song ? songTitle(st.song) : null, songFile: st.song || null, cue, frame: st.frame?.id, bpm: st.bpm ? Math.round(st.bpm) : null, playing: st.playing };
  }
  const uniqueName = (name, taken) => { const t = new Set((taken || []).map((x) => String(x).toLowerCase())); if (!t.has(name.toLowerCase())) return name; for (let i = 2; i < 99; i += 1) if (!t.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`; return `${name} ${Date.now() % 1000}`; };
  const titleCase = (s) => String(s || '').replace(/\b\w/g, (x) => x.toUpperCase());
  // A look's name: its main color + the song part at the playhead ("Violet Drop"), else a second color, else the sketch.
  function lookName({ taken = [], colors = [] } = {}) {
    const words = mainWords(colors);
    const cx = labContext() || {};
    const part = cx.cue ? titleCase(cap(cx.cue, 16)) : null;
    const first = words[0] || (cx.frame && cx.frame !== 'fit' ? cx.frame : null);
    const name = first && part ? `${first} ${part}` : first && words[1] ? `${first} ${words[1]}` : first || (cx.sketch ? `${cap(cx.sketch, 18)} look` : null);
    return name ? uniqueName(name, taken) : null;
  }
  // A sketch's name: the colors on screen + the song ("Violet Gold · Midnight Run").
  function sketchName() {
    const d = ThreeLab.director; const cx = labContext() || {};
    let colors = [];
    try { colors = [...d.sliders().sliders.filter((x) => typeof x.value === 'string').map((x) => x.value), ...(d.refs.palette() || [])]; } catch { /* no sliders */ }
    const words = mainWords(colors).slice(0, 2);
    const head = words.join(' ') || 'Untitled';
    const name = cx.song ? `${head} · ${cap(cx.song, 26)}` : `${head} ${cx.frame && cx.frame !== 'fit' ? cx.frame : 'sketch'}`;
    const taken = (ThreeLab.peek()?.sketches() || []).filter((s) => !s.current).map((s) => s.name);
    return uniqueName(name, taken);
  }
  async function nameSketch({ useAstra = false } = {}) {
    const c = await ThreeLab.cmd({ show: false });
    const was = c.state.sketch;
    let name = sketchName(); let r = null;
    if (useAstra) {
      const cx = labContext() || {};
      const img = await saveJpeg(await shrink(await ThreeLab.shot(), 320), 'assist-name');
      r = await ask('name', `Name this music visual in 2 or 3 evocative words${cx.song ? `. Song: ${cx.song}` : ''}. The image is the picture now.\nReply with the name only.`, { images: img ? [img] : [] });
      const t = r && cap(r.text.split('\n')[0].replace(/^["'“”*\s]+|["'“”*.\s]+$/g, ''), 40);
      if (t) name = t; else r = null;
    }
    c.rename(name);
    offerUndo(`Sketch named "${name}"${r ? ` by ${r.by} · ${costText(r)}` : ' (from its colors and song · no tokens)'}`, `the name "${name}"`, () => c.rename(was));
    return { name, was, by: r?.by || 'Hearth', usage: r?.usage || null };
  }

  // ---------- your usual frame size (learned from your clicks, per song too) ----------
  const FRAMES_KEY = 'assist.frames';
  let lastFrame = null;
  function noteFrame() {
    const c = ThreeLab.peek?.();
    if (!c) return;
    let st; try { st = c.state; } catch { return; }
    const id = st.frame?.id;
    if (!id || id === lastFrame) return;
    lastFrame = id;
    if (id === 'fit') return;
    const f = store.get(FRAMES_KEY, { counts: {}, songs: {} });
    f.counts[id] = (f.counts[id] || 0) + 1;
    if (st.song) { f.songs[base(st.song)] = id; const keys = Object.keys(f.songs); if (keys.length > 200) delete f.songs[keys[0]]; }
    store.set(FRAMES_KEY, f);
  }
  function usualFrame(songFile = labContext()?.songFile) {
    const f = store.get(FRAMES_KEY, { counts: {}, songs: {} });
    if (songFile && f.songs[base(songFile)]) return { id: f.songs[base(songFile)], why: 'your usual for this song' };
    const top = Object.entries(f.counts).sort((a, b) => b[1] - a[1])[0];
    return top ? { id: top[0], why: 'your usual' } : { id: '9:16', why: 'the size you use most' };
  }
  async function useUsual() {
    const c = await ThreeLab.cmd({ show: false });
    const was = c.state.frame?.id || 'fit';
    const u = usualFrame();
    if (was === u.id) return `Already ${u.id} (${u.why}).`;
    c.size(u.id); lastFrame = u.id;
    offerUndo(`Frame ${u.id} · ${u.why}`, `the ${u.id} frame`, () => c.size(was));
    return `Frame ${u.id} (${u.why}) · /assist undo goes back to ${was}`;
  }

  // ---------- shuffle, then pick ----------
  let pick = null; // the open picker
  const valuesNow = () => Object.fromEntries(ThreeLab.director.sliders().sliders.map((s) => [s.key, s.value]));
  const setValues = (v) => ThreeLab.director.sliders(null, v);
  async function frameThumb() { const url = await ThreeLab.shot(); return url ? shrink(url, 240, 0.78) : null; }

  async function shufflePick(n = 4, { goal = '', astraPicks = false, from = null } = {}) {
    n = clamp(Math.round(Number(n) || 4), 2, 9);
    const c = await ThreeLab.cmd();
    const d = ThreeLab.director;
    if (!d.sliders().sliders.length) throw new Error('This layer has no sliders to shuffle (the director can add some: "add sliders for the main knobs").');
    if (pick?.busy) throw new Error('Still making the last variations');
    const keepOpen = pick;
    if (from) setValues(from);
    const start = valuesNow();
    const wasFrozen = c.state.frozen;
    if (wasFrozen) c.freeze(false);
    const t0 = toast(`🎲 Making ${n} variations…`, { timeout: 60000 });
    const tiles = [];
    if (keepOpen) keepOpen.busy = true;
    try {
      await sleep(150);
      tiles.push({ n: 0, label: from ? 'Now' : 'Before', values: start, url: await frameThumb() });
      for (let i = 1; i <= n; i += 1) {
        setValues(start);
        const seed = c.shuffle({});
        if (seed == null) break;
        await sleep(480);
        tiles.push({ n: i, label: String(i), seed, values: valuesNow(), url: await frameThumb() });
      }
      setValues(start);
    } finally {
      t0.remove();
      if (wasFrozen) c.freeze(true);
      if (keepOpen) keepOpen.busy = false;
    }
    if (tiles.length < 2) throw new Error('Nothing to shuffle (every slider is locked?)');
    const cx = labContext() || {};
    const g = goal || [cx.song ? `the song "${cap(cx.song, 40)}"${cx.bpm ? ` (${cx.bpm} BPM)` : ''}` : '', cx.sketch ? `the sketch "${cap(cx.sketch, 30)}"` : ''].filter(Boolean).join(', ') || 'a striking music visual';
    openPicker({ tiles, base: keepOpen?.base || start, goal: g, frame: cx.frame });
    if (astraPicks) await astraPick();
    return { variations: tiles.length - 1, goal: g };
  }

  function openPicker({ tiles, base: baseVals, goal, frame }) {
    pick?.close({ keep: true, quiet: true });
    let sel = 0;
    const tall = frame === '9:16' || frame === '4:5' || frame === '2:3';
    const verdict = el('div', { class: 'as-verdict', hidden: true });
    const grid = el('div', { class: `as-grid${tall ? ' tall' : ''}` });
    const astraBtn = el('button', { type: 'button', class: 'ghost small as-astra', text: '✦ Astra picks', title: `Astra looks at the ${tiles.length - 1} variations side by side and picks the strongest for ${goal} (one small question, a ${tiles.length - 1}-tile picture)` });
    const moreBtn = el('button', { type: 'button', class: 'ghost small', text: `↻ ${tiles.length - 1} more`, title: 'More variations around the one selected (R in the picker)' });
    const saveBtn = el('button', { type: 'button', class: 'ghost small', text: '✦ Save as look', title: 'Keep it and save it as a look with a name from its colors (S)' });
    const keepBtn = el('button', { type: 'button', class: 'primary small', text: 'Keep', title: 'Keep the selected one (Enter) · Esc keeps it too' });
    const card = el('div', { class: 'as-pick', role: 'dialog', 'aria-label': 'Pick a variation', dataset: { feature: 'Shuffle & pick' } },
      el('div', { class: 'as-head' }, el('b', { text: `🎲 ${tiles.length - 1} variations` }), el('span', { class: 'as-sub', text: 'click to try · 1–9 · Enter keeps' }), el('span', { class: 'spacer' }),
        astraBtn, el('button', { type: 'button', class: 'ghost small as-x', text: '✕', title: 'Back to before and close', on: { click: () => close({ keep: false }) } })),
      verdict, grid,
      el('div', { class: 'as-foot' }, moreBtn, el('span', { class: 'spacer' }), saveBtn, keepBtn));
    function paint() {
      grid.replaceChildren(...tiles.map((t, i) => el('button', {
        type: 'button', class: `as-tile${i === sel ? ' on' : ''}${t.astra ? ' astra' : ''}`,
        title: i ? `Variation ${t.n}${t.seed != null ? ` · seed ${t.seed} (/shuffle seed ${t.seed})` : ''}${t.astra ? `\n✦ ${t.astra}` : ''}` : 'What you had before',
        on: { click: () => choose(i), dblclick: () => { choose(i); close({ keep: true }); } },
      }, t.url ? el('img', { src: t.url, alt: '' }) : el('span', { class: 'as-noimg', text: '…' }), el('span', { class: 'as-num', text: t.astra ? `✦ ${t.label}` : t.label }))));
    }
    function choose(i) { sel = clamp(i, 0, tiles.length - 1); setValues(tiles[sel].values); paint(); }
    function close({ keep = true, quiet = false } = {}) {
      if (pick !== api) return;
      pick = null;
      document.removeEventListener('keydown', onKey, true);
      card.remove();
      if (!keep) { setValues(baseVals); if (!quiet) toast('Back to before the variations', { timeout: 1400 }); return; }
      if (quiet) return;
      const t = tiles[sel];
      if (sel === 0 && JSON.stringify(t.values) === JSON.stringify(baseVals)) return;
      offerUndo(`Kept variation ${t.label}${t.astra ? ' (Astra\'s pick)' : ''} · Save keeps it in the code`, `variation ${t.label}`, () => setValues(baseVals));
    }
    function onKey(e) {
      if (!document.body.contains(card) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const k = e.key;
      if (/^[0-9]$/.test(k) && Number(k) < tiles.length) choose(Number(k));
      else if (k === 'Enter') close({ keep: true });
      else if (k === 'Escape') close({ keep: true });
      else if (k === 'ArrowRight' || k === 'ArrowLeft') choose(sel + (k === 'ArrowRight' ? 1 : -1));
      else if (k.toLowerCase() === 'r' && !e.shiftKey) moreBtn.click();
      else if (k.toLowerCase() === 's') saveBtn.click();
      else return;
      e.preventDefault(); e.stopPropagation();
    }
    astraBtn.addEventListener('click', () => astraPick());
    moreBtn.addEventListener('click', () => { if (api.busy) return; shufflePick(tiles.length - 1, { goal, from: tiles[sel].values }).catch((err) => toast(err.message, { type: 'error' })); });
    saveBtn.addEventListener('click', async () => { const c = await ThreeLab.cmd({ show: false }); const name = c.saveLook(''); close({ keep: true, quiet: true }); toast(`Saved as the look "${name}"`, { timeout: 2400 }); });
    keepBtn.addEventListener('click', () => close({ keep: true }));
    document.addEventListener('keydown', onKey, true);
    document.body.append(card);
    paint();
    const api = {
      tiles, base: baseVals, goal, verdict, busy: false, close,
      choose, get selected() { return sel; },
      setAstra(i, why, by, cost) {
        tiles.forEach((t) => { delete t.astra; });
        tiles[i].astra = why || 'Astra\'s pick';
        verdict.hidden = false;
        verdict.textContent = `✦ ${by} picks ${tiles[i].label}${why ? `: ${why}` : ''} · ${cost}`;
        choose(i);
      },
      astraBtn,
    };
    pick = api;
    return api;
  }

  // Astra picks the strongest variation: one small question with a numbered contact sheet.
  async function astraPick() {
    const p = pick;
    if (!p) throw new Error('Open the variations first: /shuffle-pick');
    const tiles = p.tiles.slice(1).filter((t) => t.url);
    if (!tiles.length) throw new Error('No pictures to pick from (is the sketch rendering?)');
    p.astraBtn.disabled = true; p.astraBtn.textContent = '✦ Looking…';
    try {
      const sheet = await sheetOf(tiles.map((t) => ({ url: t.url, label: t.label })), 180);
      const img = await saveJpeg(sheet, 'assist-pick');
      const prompt = `Pick the strongest of these ${tiles.length} variations of one music visual, for ${p.goal}. The image shows them numbered 1–${tiles.length}.\nReply with the number, a dash and at most 8 words why.`;
      const r = await ask('pick', prompt, { images: img ? [img] : [] });
      if (pick !== p) return null;
      const m = r && /\b([1-9])\b/.exec(r.text);
      const k = m ? Number(m[1]) : 0;
      if (!k || k > tiles.length) {
        // no answer: a local pick, the one furthest from where you started (the boldest change)
        const dist = (t) => Object.keys(t.values).reduce((s, key) => s + (t.values[key] !== p.base[key] ? 1 : 0), 0);
        const best = [...tiles].sort((a, b) => dist(b) - dist(a))[0];
        p.setAstra(p.tiles.indexOf(best), 'the boldest change (Astra didn\'t answer)', 'Hearth', 'no tokens');
        return { pick: best.label, by: 'Hearth' };
      }
      const why = cap(r.text.slice(m.index + 1).replace(/^[\s:.)—–-]+/, ''), 70);
      p.setAstra(p.tiles.findIndex((t) => t.label === String(k)), why, r.by, costText(r));
      return { pick: String(k), by: r.by, why, usage: r.usage };
    } finally {
      if (p.astraBtn.isConnected) { p.astraBtn.disabled = false; p.astraBtn.textContent = '✦ Astra picks'; }
    }
  }

  // Hold 🎲 Shuffle (half a second) for the picker; its right-click menu gets the same as its first item.
  let holdTimer = 0; let held = false;
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.tw-shuffle');
    if (!b || e.button !== 0) return;
    clearTimeout(holdTimer); held = false;
    holdTimer = setTimeout(() => { held = true; Usage.track('Lab sliders › Shuffle & pick (hold)', { area: 'Lab sliders', label: 'Shuffle & pick (hold)' }); shufflePick(4).catch((err) => toast(err.message, { type: 'error' })); }, 520);
  }, true);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) document.addEventListener(ev, () => clearTimeout(holdTimer), true);
  document.addEventListener('click', (e) => { if (held && e.target.closest?.('.tw-shuffle')) { held = false; e.preventDefault(); e.stopPropagation(); } }, true);

  // ---------- next steps (computed here, no model call) ----------
  // After a docked director's reply or a jam: up to 3 chips from the Lab's state, + "✦ What would Astra do?".
  function labSteps({ jam = false } = {}) {
    const c = ThreeLab.peek?.(); const d = ThreeLab.director;
    if (!c || !d) return [];
    const out = [];
    let rep = null; try { rep = d.report(); } catch { /* no sketch */ }
    const st = c.state;
    if (rep?.errors?.length) out.push({ label: '🛠 Fix the errors', run: '/fix-errors', title: `${rep.errors.length} error${rep.errors.length === 1 ? '' : 's'} in the console: ask the director to fix them` });
    if (jam) out.push({ label: '🎛 Jam 2 more', run: '/jam again', title: 'Two more rounds on the result (/jam again)' });
    if (rep?.unsavedSliders?.length) out.push({ label: '💾 Save', run: '/save', title: `${rep.unsavedSliders.length} slider change${rep.unsavedSliders.length === 1 ? '' : 's'} not in the code yet (Ctrl+S)` });
    const u = usualFrame();
    if (st.frame?.id !== u.id) out.push({ label: `▯ Try ${u.id}`, run: `/size ${u.id}`, title: `${u.why[0].toUpperCase()}${u.why.slice(1)} (/usual)` });
    else if (jam || !rep?.unsavedSliders?.length) out.push({ label: '⇪ Stills in 4 sizes', run: '/stills sizes', title: 'This frame as PNGs in 9:16, 16:9, 4:5 and 1:1 (/stills sizes)' });
    if (Array.isArray(rep?.sliders) && rep.sliders.length) out.push({ label: '🎲 Shuffle & pick', run: '/shuffle-pick 4', title: '4 variations as thumbnails: click one, or let Astra pick (/shuffle-pick)' });
    return out.slice(0, 3);
  }
  function reviewSteps() {
    if (typeof Review === 'undefined' || !Review.current) return [];
    const open = (Review.notes() || []).filter((n) => !n.done).length;
    return [
      { label: '✦ Review with Astra', run: '/review-astra', title: 'Astra looks at this frame and adds at most 3 notes to the timeline (one small question)' },
      open ? null : { label: '⇪ Export 4 socials', run: '/export-all', title: 'The open video in every other social format (/export-all)' },
    ].filter(Boolean);
  }
  const stepsFor = (toolId, o) => (toolId === 'three' ? labSteps(o) : toolId === 'ae' ? reviewSteps() : []);

  async function whatWouldAstraDo(toolId) {
    const cx = toolId === 'three' ? labContext() || {} : {};
    let url = null;
    if (toolId === 'three') url = await ThreeLab.shot();
    else if (typeof Review !== 'undefined' && Review.current) { const r = await Review.tool('video_frame', {}).catch(() => null); url = r?.images?.[0] ? `data:image/jpeg;base64,${r.images[0].data}` : null; }
    const img = await saveJpeg(await shrink(url, 320), 'assist-next');
    const what = toolId === 'three' ? `this music visual${cx.song ? ` for "${cap(cx.song, 40)}"` : ''}${cx.frame && cx.frame !== 'fit' ? ` (${cx.frame})` : ''}` : 'this video frame';
    return ask('next', `You art-direct ${what}. The image is the picture now. Give one next step to make it better.\nReply with one next step: one imperative sentence, at most 14 words.`, { images: img ? [img] : [] });
  }

  function showSteps(toolId, agentId, steps) {
    const e = typeof DirectorDock !== 'undefined' && DirectorDock.entry(toolId);
    if (!e || (agentId && e.agentId !== agentId) || !store.get('director.chips', true)) return null;
    e.chips.querySelector('.as-next')?.remove();
    if (!steps.length) return null;
    const use = (s) => { group.remove(); if (s.run) Commands.exec(s.run, e.agentId); else if (s.send) { if (Native.pendingFor?.(e.agentId)) Native.setDraft?.(e.agentId, s.send); else Native.sendText(e.agentId, s.send); } };
    const chip = (s) => el('button', { type: 'button', class: 'dd-chip as-step', text: s.label, title: `${s.title || s.run}${s.run ? ' · runs here, no tokens' : ''}`, on: { click: () => use(s) } });
    const astraChip = el('button', { type: 'button', class: 'dd-chip as-step as-astra-step', text: '✦ What would Astra do?', title: 'Astra looks at the picture and suggests one next step (one small question; nothing is sent to the director until you click it)' });
    astraChip.addEventListener('click', async () => {
      if (astraChip.dataset.send) { use({ send: astraChip.dataset.send }); return; }
      astraChip.disabled = true; astraChip.textContent = '✦ Looking…';
      const r = await whatWouldAstraDo(toolId).catch(() => null);
      astraChip.disabled = false;
      if (!r) { astraChip.textContent = '✦ No answer'; return; }
      const step = cap(r.text.split('\n').find((l) => l.trim()) || r.text, 160).replace(/^[-*•\d.)\s]+/, '');
      astraChip.dataset.send = step;
      astraChip.textContent = `✦ ${cap(step, 46)}`;
      astraChip.title = `${r.by}: ${step}\nClick to send it to the director · ${costText(r)}`;
    });
    const group = el('span', { class: 'as-next', dataset: { feature: 'Next steps' } }, ...steps.map(chip), astraChip);
    e.chips.prepend(group);
    return group;
  }
  const clearSteps = (agentId) => { for (const id of ['three', 'ae']) { const e = typeof DirectorDock !== 'undefined' && DirectorDock.entry(id); if (e && (!agentId || e.agentId === agentId)) e.chips.querySelector('.as-next')?.remove(); } };
  function onReplyDone(ev, chat) {
    if (ev?.type !== 'done' || !chat || typeof DirectorDock === 'undefined') return;
    if (window.Jam?.running?.()) return;
    for (const id of ['three', 'ae']) {
      const e = DirectorDock.entry(id);
      if (e && e.agentId === chat.agentId) setTimeout(() => showSteps(id, chat.agentId, stepsFor(id)), 60);
    }
  }
  queueMicrotask(() => {
    Native.hooks.event.push(onReplyDone);
    Native.hooks.send.push((agentId) => clearSteps(agentId));
  });
  addEventListener('hearth:jam-end', (e) => { if (e.detail?.status === 'done') setTimeout(() => showSteps('three', null, labSteps({ jam: true })), 200); });

  // ---------- review with Astra (Video Review) ----------
  async function reviewAstra({ sheet = false } = {}) {
    if (typeof Review === 'undefined' || !Review.current) throw new Error('Open a video in Video Review first');
    const stat = Review.status() || {};
    const t0 = stat.time || 0;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const tt = toast(`✦ Astra is looking at ${sheet ? 'the whole video' : `the frame at ${fmt(t0)}`}…`, { timeout: 60000 });
    let img = null; let times = null;
    try {
      if (sheet) { const s = await Review.contactSheet({ count: 6 }); times = s.times; img = await saveJpeg(await shrink(`data:image/jpeg;base64,${s.image.data}`, 720, 0.75), 'assist-review'); } else {
        const r = await Review.tool('video_frame', {});
        img = await saveJpeg(await shrink(`data:image/jpeg;base64,${r.images[0].data}`, 480, 0.75), 'assist-review');
      }
    } catch (err) { tt.remove(); throw err; }
    const prior = (Review.notes() || []).filter((n) => !n.done).slice(0, 3).map((n) => `${fmt(n.t)} ${cap(n.text, 50)}`);
    const prompt = `Art-direct ${sheet ? `this music video (frames at ${times.map((x) => `${fmt(x)}`).join(', ')}, left to right)` : `this frame of a music video at ${fmt(t0)}`}.${prior.length ? ` Notes already there: ${prior.join('; ')}.` : ''}\nGive at most 3 new notes, specific and short, no praise. Reply one per line as "m:ss | note".`;
    const r = await ask('review', prompt, { images: img ? [img] : [] }).finally(() => tt.remove());
    if (!r) throw new Error('Neither Astra nor Claude answered (no tokens spent)');
    const lines = r.text.split('\n').map((l) => l.trim().replace(/^[-*•\d.)\s]+(?=\d+:\d)/, '')).filter(Boolean);
    const added = [];
    for (const l of lines.slice(0, 3)) {
      const m = /^(\d+):(\d{1,2}(?:\.\d+)?)\s*[|:–—-]\s*(.+)$/.exec(l);
      const t = m ? Number(m[1]) * 60 + Number(m[2]) : t0;
      const text = cap(m ? m[3] : l.replace(/^\d+:\d+\s*/, ''), 200);
      if (!text) continue;
      const n = await Review.addNote(text, { t: sheet ? clamp(t, 0, stat.duration || t) : t0, by: 'Astra', frame: true });
      if (n) added.push(n);
    }
    if (sheet) Review.seek?.(t0);
    if (!added.length) throw new Error(`${r.by} answered without notes`);
    offerUndo(`✦ ${r.by} added ${added.length} note${added.length === 1 ? '' : 's'} · ${costText(r)}`, `${added.length} note${added.length === 1 ? '' : 's'} from ${r.by}`, () => added.forEach((n) => Review.deleteNote(n.id)), 8000);
    return { notes: added.map((n) => `${fmt(n.t)} ${n.text}`), by: r.by, usage: r.usage };
  }

  // ---------- /decide saved: Astra picks one of your saved looks ----------
  if (typeof Decide !== 'undefined' && Decide.KINDS && !Decide.KINDS.saved) {
    Decide.KINDS.saved = {
      label: 'one of your saved looks', goal: 'the saved look that suits this picture and song best', visual: true,
      candidates: () => { const l = ThreeLab.peek()?.looks?.() || []; return [...l].sort(() => Math.random() - 0.5).slice(0, 8).map((name) => ({ name })); },
      async apply(cnd) { const snap = valuesNow(); (await ThreeLab.cmd({ show: false })).look(cnd.name); return () => setValues(snap); },
      local: (cands) => cands[0],
    };
  }
  // the local fallback for "/decide size" uses what you actually use
  if (typeof Decide !== 'undefined' && Decide.KINDS?.size) {
    const prev = Decide.KINDS.size.local;
    Decide.KINDS.size.local = async (cands) => { const cur = ThreeLab.peek()?.state.frame?.id; const u = usualFrame(); return (u.id !== cur && cands.find((x) => x.id === u.id)) || prev(cands); };
  }

  // ---------- chat commands ----------
  const reg = (def) => { if (Commands.get(def.name)) { console.warn(`[assist] /${def.name} exists: not registered`); return; } Commands.register({ area: 'Assist', ...def }); };
  reg({
    name: 'shuffle-pick', aliases: ['pick-shuffle'], args: '[2–9] [astra] [goal…]',
    desc: 'Shuffle the sliders n times (4) into thumbnails; click one to keep, or ✦ lets Astra pick the strongest for the song',
    examples: ['/shuffle-pick', '/shuffle-pick 6', '/shuffle-pick 4 astra dark and punchy'], keywords: 'variations shuffle choose best pick for me',
    undo: '/assist undo',
    complete: () => [{ value: '4', hint: 'four variations' }, { value: '6', hint: 'six' }, { value: '9', hint: 'nine' }, { value: '4 astra', hint: 'and Astra picks one' }],
    run: async (args) => {
      const w = args.trim().split(/\s+/).filter(Boolean);
      const n = /^\d+$/.test(w[0] || '') ? Number(w.shift()) : 4;
      const astraPicks = /^(astra|✦|auto)$/i.test(w[0] || '') ? Boolean(w.shift()) : false;
      const r = await shufflePick(n, { goal: w.join(' '), astraPicks });
      return `🎲 ${r.variations} variations in the picker (1–${r.variations} to try, Enter keeps, ✦ lets Astra pick)`;
    },
  });
  reg({
    name: 'astra-pick', args: '', desc: 'In the variations picker: Astra picks the strongest one (one small question with a contact sheet)',
    run: async () => { const r = await astraPick(); return r ? `✦ ${r.by} picked variation ${r.pick}${r.why ? `: ${r.why}` : ''}` : null; },
  });
  reg({
    name: 'name', args: '[sketch|look] [astra]', desc: 'Name the sketch (or save the sliders as a look) from its colors and song, no tokens; "astra" asks Astra for a name',
    examples: ['/name', '/name look', '/name astra'], keywords: 'rename title auto name', undo: '/assist undo',
    complete: () => [{ value: 'sketch', hint: 'from its colors and song (no tokens)' }, { value: 'look', hint: 'save the sliders as a named look' }, { value: 'astra', hint: 'Astra names the sketch (one small question)' }],
    run: async (args) => {
      const w = args.toLowerCase().split(/\s+/).filter(Boolean);
      const useAstra = w.includes('astra') || w.includes('✦');
      if (w.includes('look')) {
        const c = await ThreeLab.cmd({ show: false });
        let name = null; let r = null;
        if (useAstra) {
          const img = await saveJpeg(await shrink(await ThreeLab.shot(), 320), 'assist-name');
          r = await ask('name', 'Name this look of a music visual in 1 or 2 evocative words. The image is the picture now.\nReply with the name only.', { images: img ? [img] : [] });
          name = r && cap(r.text.split('\n')[0].replace(/^["'“”*\s]+|["'“”*.\s]+$/g, ''), 30);
        }
        const saved = c.saveLook(name || '');
        return `Saved the look "${saved}"${r ? ` (named by ${r.by} · ${costText(r)})` : ''}`;
      }
      const r = await nameSketch({ useAstra });
      return `Sketch "${r.was}" is now "${r.name}"${r.usage ? ` (${r.by})` : ''} · /assist undo`;
    },
  });
  reg({
    name: 'usual', args: '', desc: 'Your usual frame size in the Lab (learned from your clicks, per song too)',
    keywords: 'my usual default frame size 9:16', undo: '/assist undo',
    run: async () => useUsual(),
  });
  reg({
    name: 'next', aliases: ['next-steps'], args: '', desc: 'What to do next, from the Lab (or Video Review) as it is now: a few one-click steps, no tokens',
    keywords: 'suggest what now next step ideas',
    run: async (args, ctx) => {
      const toolId = ctx.place === 'ae' ? 'ae' : 'three';
      if (toolId === 'three' && !ThreeLab.peek?.()) await ThreeLab.cmd({ show: false });
      const steps = stepsFor(toolId);
      if (!steps.length) return 'Nothing obvious: it all looks saved and tidy.';
      if (ctx.note) { ctx.note('Next:', { actions: [...steps.map((s) => ({ label: s.label, run: () => Commands.exec(s.run, ctx.agentId) })), { label: '✦ What would Astra do?', run: async () => { const r = await whatWouldAstraDo(toolId); ctx.say?.(r ? `✦ ${r.by}: ${r.text} (${costText(r)})` : 'No answer'); } }] }); return ''; }
      return steps.map((s) => `- \`${s.run}\` ${s.label}`).join('\n');
    },
  });
  reg({
    name: 'review-astra', aliases: ['astra-review'], args: '[sheet]', desc: 'Video Review: Astra art-directs this frame (or the whole video with "sheet") and adds at most 3 timeline notes',
    examples: ['/review-astra', '/review-astra sheet'], keywords: 'critique art direction notes feedback', undo: '/assist undo',
    complete: () => [{ value: 'sheet', hint: 'the whole video as 6 frames' }],
    run: async (args) => { const r = await reviewAstra({ sheet: /sheet|all|whole/i.test(args) }); return `✦ ${r.by}'s notes:\n${r.notes.map((n) => `- ${n}`).join('\n')}`; },
  });
  reg({
    name: 'assist', args: '[log|undo]', desc: 'What Hearth decided for you lately and what Astra\'s small questions cost; undo the last automatic choice',
    complete: () => [{ value: 'log', hint: 'questions and their tokens' }, { value: 'undo', hint: 'take back the last automatic choice' }],
    run: async (args) => {
      if (/^undo/i.test(args.trim())) return undo();
      const log = store.get(LOG_KEY, []);
      const sum = log.reduce((s, e) => s + e.input + e.output, 0);
      const lines = log.slice(0, 12).map((e) => `- ${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${e.kind} by ${e.by} · ${e.input + e.output} tokens (${e.input} in, ${e.output} out${e.images ? ', 1 picture' : ''})`);
      return `${lines.length ? `${lines.join('\n')}\n\n${log.length} question${log.length === 1 ? '' : 's'} · ${fmtK(sum)} tokens in all.` : 'No questions to Astra yet: everything was decided here, for free.'}${lastUndo ? `\nLast automatic choice: ${lastUndo.what} (/assist undo)` : ''}`;
    },
  });

  // ---------- the rest of the app ----------
  queueMicrotask(() => {
    // every click in the app: is the Lab on a new frame size? (one property read, no timers)
    Usage.onTrack?.(() => noteFrame());
    // Video Review's docked director gets the Astra review as a chip
    if (typeof DirectorDock !== 'undefined' && DirectorDock.CHIPS?.ae && !DirectorDock.CHIPS.ae.some((c) => c.run === '/review-astra')) {
      DirectorDock.CHIPS.ae.unshift({ label: '✦ Review with Astra', run: '/review-astra', title: 'Astra looks at this frame and adds at most 3 timeline notes (one small question) · /review-astra sheet for the whole video' });
    }
    AppUI.addAction?.('Shuffle & pick: 4 variations as thumbnails', () => shufflePick(4).catch((err) => toast(err.message, { type: 'error' })));
    AppUI.addAction?.('Shuffle & let Astra pick the best', () => shufflePick(4, { astraPicks: true }).catch((err) => toast(err.message, { type: 'error' })));
    AppUI.addAction?.('Name this sketch (from its colors and song)', () => nameSketch().catch((err) => toast(err.message, { type: 'error' })));
    AppUI.addAction?.('Lab: my usual frame size', () => useUsual().catch((err) => toast(err.message, { type: 'error' })));
    AppUI.addAction?.('Video Review: review this frame with Astra', () => reviewAstra().catch((err) => toast(err.message, { type: 'error' })));
    AppUI.addAction?.('Let Astra decide: one of my saved looks', () => Decide.run('saved').catch((err) => toast(err.message, { type: 'error' })));
  });

  return {
    shufflePick, astraPick, picker: () => pick, nameSketch, lookName, sketchName, colorWord, mainWords, usualFrame, useUsual,
    labSteps, reviewSteps, showSteps, whatWouldAstraDo, reviewAstra, ask, undo, labContext,
    decide: (what) => Decide.run(what).catch((err) => toast(err.message, { type: 'error' })),
  };
})();
window.Assist = Assist;
