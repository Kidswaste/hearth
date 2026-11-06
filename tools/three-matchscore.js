// ◎ How close am I? (round 141, matchscore141). docs/upgrades/matchscore141.md
// A live match score between the Lab's picture and a chosen reference, while the owner tweaks, and a one-click Closer.
// Built on what exists:
//   · the frames: the preview's own small picture (ThreeLab.director.shotSmall, labdirector's channel, the same one the
//     thumbnails use); the numbers: tools/three-matchscore-core.js (MatchCore), on ≈ 64 px frames, measured each update
//   · the reference's palette: Kit.paletteFromImage (here, no AI); the picker: lookmatch's (LookMatch.pick: a file, the
//     moodboard, a recent render); ways in: a Lab reference's ⋯ › ◎ Match against this, a moodboard item's right-click,
//     Ctrl/⌘+K
//   · Closer: the scene's colour sliders, light-like number sliders and the ◐ Grade layer's (exposure, contrast,
//     temperature, tint, saturation…) through the sliders' own setMany (as looks129's Project look does), kept only when
//     the score rises; ONE undo step in the Lab's Ctrl/⌘+Z (LabDirect.push) and the card's ↶ Undo
//   · ✦ Ask the AI for the rest: the parts still off, as words (no picture), to the docked director, only on the click
//     after the cost line (refmatch131's estimate, director-cost)
// Nothing leaves the computer except that one click's message.
//   LabMatch.start(source) · fromRef(r) · fromBoardItem(it) · pick() · stop() · sample() · closer(o) · undo()
//   askOpen() · askSend() · state() · toggleCard()
const LabMatch = (() => {
  const C = () => MatchCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const calm = (e) => (window.calmError ? calmError(e) : String(e?.message || e));
  const err = (e) => toast(calm(e), { type: 'error', timeout: 5000 });
  const fileUrl = (p) => (!p ? '' : /^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const SIZE = 64; // the frames' longest side
  const EVERY = 500; // ms between updates (about twice a second)
  // ref: { source, title, kind, sig, motion, palette, thumb } · last: { parts, hints, at } · cost: sync ms per update
  const S = { ref: null, sid: null, chip: null, card: null, timer: 0, last: null, prev: null, curMotion: null, busy: false, sampling: false, closer: null, ai: null, sent: [], cost: [], updates: 0, cv: null };

  const hk = () => ThreeLab.stageHooks || {};
  const sceneNow = () => hk().sketchId?.() || ThreeLab.scenes?.currentId?.() || null;
  async function lab() {
    if (window.Lazy && !Lazy.loaded('lab')) await Lazy.load('lab');
    await ThreeLab.cmd?.({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return ThreeLab.director;
  }

  // ---------- pixels (small, on this computer) ----------
  function pixels(src, max = SIZE) {
    const w0 = src.naturalWidth || src.videoWidth || src.width || 1; const h0 = src.naturalHeight || src.videoHeight || src.height || 1;
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(2, Math.round(w0 * k)); const h = Math.max(2, Math.round(h0 * k));
    const c = S.cv || (S.cv = document.createElement('canvas'));
    if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, w, h);
    return { data: g.getImageData(0, 0, w, h).data, w, h };
  }
  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read.')); i.src = url; });
  }
  async function picOf(source) {
    if (source.url) return loadImage(source.url);
    try { return await loadImage(fileUrl(source.path)); } catch { /* a path the page can't open: its bytes */ }
    const ext = (base(source.path).split('.').pop() || 'png').toLowerCase();
    return loadImage(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${await window.hub.fs.read(source.path, { encoding: 'base64' })}`);
  }
  const thumbOf = (src) => { const { w, h } = pixels(src, 48); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(S.cv, 0, 0); return c.toDataURL('image/jpeg', 0.7); };
  async function paletteOf(src) {
    try {
      if (typeof Kit === 'undefined' && window.Lazy) await Lazy.load('kit').catch(() => {});
      if (typeof Kit === 'undefined') return [];
      const list = await Kit.paletteFromImage(src, 5);
      return (list || []).map((c) => String(c?.hex || c || '').toLowerCase()).filter((c) => C().HEX.test(c)).slice(0, 5);
    } catch { return []; }
  }
  // a clip: 4 moments, each read twice half a second apart (its look, and its motion at the score's own pace)
  async function readClip(url) {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
    try {
      await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error('The clip did not load')); setTimeout(() => reject(new Error('The clip took too long to open')), 20000); });
      // a recorded clip (MediaRecorder's webm) says "Infinity" until it is read to its end
      if (!Number.isFinite(v.duration)) await new Promise((resolve) => { const done = () => { v.removeEventListener('durationchange', done); resolve(); }; v.addEventListener('durationchange', done); v.currentTime = 1e9; setTimeout(done, 3000); });
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const seek = (t) => new Promise((resolve) => { let fin = false; const done = () => { if (fin) return; fin = true; v.removeEventListener('seeked', done); resolve(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 4000); });
      const sigs = []; const moves = []; let mid = null;
      for (const f of dur > 1 ? [0.15, 0.35, 0.55, 0.75] : [0]) {
        const t = Math.max(0, Math.min(dur - 0.6, f * dur));
        await seek(t); const p = pixels(v); const a = C().sig(p.data, p.w, p.h); sigs.push(a);
        if (!mid) mid = thumbOf(v);
        if (dur > 1) { await seek(t + 0.5); const q = pixels(v); const b = C().sig(q.data, q.w, q.h); sigs.push(b); moves.push(C().motionOf(a, b)); }
      }
      const pc = document.createElement('canvas'); const pp = pixels(v, 96); pc.width = pp.w; pc.height = pp.h; pc.getContext('2d').drawImage(S.cv, 0, 0);
      return { sig: C().merge(sigs), motion: moves.length ? C().median(moves.filter((x) => x != null)) : null, thumb: mid, palette: await paletteOf(pc.toDataURL('image/png')) };
    } finally { v.removeAttribute('src'); v.load(); }
  }
  async function readRef(source) {
    const kind = source.kind === 'video' || VIDEO.test(source.path || '') ? 'clip' : 'image';
    if (kind === 'clip') {
      const url = source.url || fileUrl(source.path);
      return { kind, ...(await readClip(url)) };
    }
    const img = await picOf(source);
    const p = pixels(img);
    return { kind, sig: C().sig(p.data, p.w, p.h), motion: null, thumb: thumbOf(img), palette: await paletteOf(img) };
  }

  // ---------- the scene's frame → the score ----------
  // the sync part (draw, read, numbers) is timed: it's what the Lab's own thread pays each update
  async function frameSig() {
    const url = await ThreeLab.director.shotSmall(SIZE);
    if (!url) return null;
    const img = new Image(); img.src = url;
    await img.decode();
    const t0 = performance.now();
    const p = pixels(img);
    const s = C().sig(p.data, p.w, p.h);
    return { s, t0 };
  }
  async function sample({ motion = true } = {}) {
    if (!S.ref || S.sampling) return S.last;
    S.sampling = true;
    try {
      const got = await frameSig();
      if (!got) return S.last;
      const now = Date.now();
      if (motion && S.prev && now - S.prev.at > 300 && now - S.prev.at < 1000) {
        const m = C().motionOf(S.prev.s, got.s);
        if (m != null) S.curMotion = S.curMotion == null ? m : S.curMotion * 0.6 + m * 0.4;
      }
      const parts = C().parts(S.ref.sig, got.s, { refMotion: S.ref.motion, curMotion: S.curMotion });
      const hints = C().hints(S.ref.sig, got.s, parts);
      const ms = performance.now() - got.t0;
      S.cost = [...S.cost, ms].slice(-60);
      if (motion) S.prev = { s: got.s, at: now };
      S.last = { parts, hints, at: now };
      S.updates += 1;
      return S.last;
    } finally { S.sampling = false; }
  }
  const visible = () => { const h = ThreeLab.scenes?.previewHost?.(); return Boolean(h?.isConnected && h.offsetParent && document.visibilityState === 'visible'); };
  async function tick() {
    if (!S.ref || S.busy || S.sampling) return;
    if (S.sid !== sceneNow() || !visible() || hk().player?.recording || (typeof ThreeSeq !== 'undefined' && ThreeSeq.active)) { paint(); return; }
    try { await sample(); } catch { /* the next tick */ }
    paint();
  }

  // ---------- start / stop ----------
  async function start(source) {
    if (!source || (!source.path && !source.url)) throw new Error('Pick a picture or a clip first.');
    await lab();
    const title = source.title || base(source.path) || 'Reference';
    const busy = toast(`◎ Reading ${title}…`, { timeout: 0 });
    try {
      const r = await readRef(source);
      S.ref = { source, title, ...r };
      S.sid = sceneNow(); S.last = null; S.prev = null; S.curMotion = null; S.closer = null; S.ai = null; S.cost = [];
    } finally { busy?.remove?.(); }
    clearInterval(S.timer);
    S.timer = setInterval(() => { tick().catch(() => {}); }, EVERY);
    paint();
    await tick();
    return state();
  }
  function stop() { clearInterval(S.timer); S.timer = 0; S.ref = null; S.last = null; S.cardOpen = false; S.chip?.remove(); S.chip = null; S.card?.remove(); S.card = null; }
  const fromRef = (r) => start({ path: r.path, title: r.key || r.name, kind: r.kind === 'video' ? 'video' : 'image', from: 'ref' });
  function fromBoardItem(it) {
    const clip = it?.type === 'video';
    const path = clip ? it.src : it?.type === 'gif' ? it.poster || it.src : it?.type === 'web' ? it.thumb || it.poster : it?.src || it?.thumb;
    if (!path) throw new Error('Pick a picture or a clip on the board.');
    return start({ path, title: it.title || 'Board picture', kind: clip ? 'video' : 'image', from: 'board' });
  }
  async function pick() {
    await lab();
    const src = await LookMatch.pick();
    return src ? start(src) : null;
  }

  // ---------- ◎ Closer: a small local search over the colour and light sliders ----------
  async function params() {
    const d = ThreeLab.director; const h = window.LabMatHook?.host?.();
    const layers = h?.layers?.() || [];
    let grade = null; try { grade = (await LabGrade.findLayers(d)).grade; } catch { grade = null; }
    const out = [];
    for (const L of layers) {
      const c = hk().ctlOf?.(L.id); if (!c) continue;
      let list = []; try { list = c.controls(); } catch { list = []; }
      for (const x of C().tunable(list, { grade: grade?.id === L.id })) {
        if (c.locked?.(x.key)) continue;
        const color = typeof x.value === 'string';
        out.push({ lid: L.id, key: x.key, label: x.label || x.key, color, value: x.value, min: x.min, max: x.max, step: color ? 0 : (x.max - x.min) * 0.15, visits: 0 });
      }
    }
    return out.sort((a, b) => Number(b.color) - Number(a.color)).slice(0, 16);
  }
  const setOne = (p, v, remember = false) => hk().ctlOf?.(p.lid)?.setMany({ [p.key]: v }, { remember });
  function candidates(p, pal) {
    const v = p.visits; p.visits += 1;
    if (p.color) {
      const out = [];
      if (pal.length) { out.push(C().mixHex(p.value, pal[v % pal.length], 0.7)); out.push(C().mixHex(p.value, pal[(v + 1) % pal.length], 0.7)); }
      out.push(C().shiftHex(p.value, v % 2 ? -0.25 : 0.25));
      return out.filter((x) => x !== p.value);
    }
    const r3 = (x) => Math.round(x * 1000) / 1000;
    return [r3(Math.min(p.max, p.value + p.step)), r3(Math.max(p.min, p.value - p.step))].filter((x) => x !== p.value);
  }
  async function closer({ steps = 24, ms = 2000 } = {}) {
    if (!S.ref) throw new Error('Pick a reference first (◎ Match against this).');
    if (S.busy) return null;
    S.busy = true; S.ai = null; paint();
    const t0 = performance.now(); const sid = sceneNow();
    try {
      const ps = await params();
      if (!ps.length) { toast('No colour or light sliders to nudge here: ✦ Ask the AI for the rest, or add a ◐ Grade.', { timeout: 4000 }); return { steps: 0, before: S.last?.parts?.still ?? null, after: S.last?.parts?.still ?? null }; }
      const orig = ps.map((p) => p.value);
      const score = async () => { while (S.sampling) await sleep(15); await raf(); await raf(); const r = await sample({ motion: false }); return r?.parts?.still ?? 0; };
      const start0 = await score();
      let best = start0; let n = 0; let kept = 0; let i = 0; let idle = 0;
      while (n < steps && performance.now() - t0 < ms && idle < ps.length * 2) {
        const p = ps[i % ps.length]; i += 1;
        let took = false;
        for (const v of candidates(p, S.ref.palette || [])) {
          if (n >= steps || performance.now() - t0 >= ms) break;
          setOne(p, v); n += 1;
          const s = await score();
          if (s > best + 0.3) { best = s; p.value = v; kept += 1; took = true; break; }
          setOne(p, p.value);
        }
        if (took) idle = 0; else { idle += 1; if (!p.color) p.step /= 2; }
      }
      // what changed: back to the start for a moment, then once as kept values (one undo step)
      const changed = ps.map((p, k) => ({ p, from: orig[k], to: p.value })).filter((x) => x.from !== x.to);
      const byLayer = (which) => changed.reduce((o, x) => { (o[x.p.lid] ||= {})[x.p.key] = x[which]; return o; }, {});
      const was = byLayer('from'); const now = byLayer('to');
      for (const [lid, set] of Object.entries(was)) hk().ctlOf?.(lid)?.setMany(set, { remember: false });
      const rec = { sid, was, now, start: start0, best, steps: n, kept, ms: Math.round(performance.now() - t0), undone: false, sliders: changed.map((x) => `${x.p.label}: ${x.from} → ${x.to}`) };
      if (!changed.length) { S.closer = { ...rec, none: true }; toast('◎ Already as close as these sliders go: ✦ Ask the AI for the rest?', { timeout: 3500 }); return rec; }
      for (const [lid, set] of Object.entries(now)) hk().ctlOf?.(lid)?.setMany(set);
      rec.fn = () => { if (sceneNow() !== rec.sid || rec.undone) return false; rec.undone = true; for (const [lid, set] of Object.entries(rec.was)) hk().ctlOf?.(lid)?.setMany(set); paint(); setTimeout(() => tick().catch(() => {}), 120); return true; };
      window.LabDirect?.push?.(null, `◎ Closer to ${S.ref.title}`, rec.fn);
      S.closer = rec;
      toast(`◎ Closer: ${Math.round(start0)} → ${Math.round(best)} % (${changed.length} slider${changed.length === 1 ? '' : 's'})`, { timeout: 4000, action: { label: 'Undo', fn: () => undo() } });
      return rec;
    } finally { S.busy = false; paint(); setTimeout(() => tick().catch(() => {}), 150); }
  }
  function undo() {
    const r = S.closer;
    if (!r?.fn || r.undone) return false;
    if (window.LabDirect?.last?.()?.fn === r.fn) return LabDirect.undo();
    return r.fn();
  }

  // ---------- ✦ Ask the AI for the rest (cost first; only the click sends) ----------
  const directorOf = () => H.agents().find((x) => x.dock === 'three' && x.mode === 'native') || null;
  const chatOf = (a) => (a ? (H.chats || []).find((c) => c.id === H.activeChat?.[a.id]) || null : null);
  const who = (a, chat) => ((chat?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');
  function askTextNow() {
    const r = S.ref; const l = S.last;
    return C().askText({ title: r.title, p: l?.parts, h: l?.hints, palette: r.palette || [], kind: r.kind, nudged: Boolean(S.closer && !S.closer.undone && !S.closer.none), motionWords: r.motion != null ? `about ${Math.round(r.motion * 1000) / 10} % of the picture changes each half second` : '' });
  }
  async function askOpen() {
    if (!S.ref) throw new Error('Pick a reference first.');
    let a = directorOf();
    if (!a) {
      await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'matchscore', say: () => {}, note: () => {} });
      for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
      a = directorOf();
    }
    if (!a) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    S.ai = { phase: 'pricing', agentId: a.id }; paint();
    if (window.Lazy && typeof RefMatchCore === 'undefined') await Lazy.load('refmatch').catch(() => {});
    const chat = chatOf(a);
    const text = askTextNow();
    let fx = 9000;
    try { const r = await window.hub.directorCost?.([{ ...JSON.parse(JSON.stringify(a)), threeTools: true, exact: true }]); fx = r?.directors?.[0]?.total || fx; } catch { /* the usual size */ }
    const est = RefMatchCore.estimate({ base: fx, pic: null, chars: text.length, again: true });
    S.ai = { phase: 'ready', agentId: a.id, text, est, line: RefMatchCore.costLine(est, who(a, chat), chat?.model || a.model || '', false) };
    paint();
    return S.ai;
  }
  async function askSend() {
    const ai = S.ai;
    if (ai?.phase !== 'ready') throw new Error('See the cost first.');
    const a = H.agent(ai.agentId);
    if (!a) throw new Error('That director is gone.');
    const c = chatOf(a) || Native.ensureChat(a.id, 'Match the reference');
    if (Native.isBusy?.(c.id)) throw new Error(`${a.name} is still answering: wait for it, or stop it first.`);
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    S.sent = [...S.sent, { agentId: a.id, chatId: c.id, text: ai.text, images: [], at: Date.now() }].slice(-10);
    S.ai = { ...ai, phase: 'sent' }; paint();
    await Native.send(a.id, ai.text, { chatId: c.id });
    return true;
  }

  // ---------- the chip and the card ----------
  const btn = (text, cls, fn, title = '') => el('button', { type: 'button', class: `ms-btn ${cls}`, text, title, on: { click: (ev) => { ev.stopPropagation(); Promise.resolve().then(fn).catch(err); } } });
  const pct = (v) => (v == null ? '…' : `${Math.round(v)} %`);
  function toggleCard(on = !S.cardOpen) { S.cardOpen = Boolean(on); if (!on) S.ai = null; paint(); }
  // the numbers change in place twice a second; the card is rebuilt only when what it offers changes (a click is never lost)
  function fill(card, p) {
    const put = (n, text) => { if (n && n.textContent !== text) n.textContent = text; };
    put(card.querySelector('.ms-all'), `◎ ${pct(p?.overall)}`); put(card.querySelector('.ms-word'), C().word(p?.overall));
    for (const row of card.querySelectorAll('.ms-row')) {
      const k = row.dataset.part; const v = p?.[k];
      row.querySelector('.ms-bar i').style.width = `${Math.max(0, Math.min(100, v ?? 0))}%`;
      put(row.querySelector('.ms-v'), v == null ? (k === 'motion' ? 'measuring…' : '…') : `${Math.round(v)} %`);
      put(row.querySelector('.ms-why'), (S.last?.hints?.[k] || []).join(', '));
    }
  }
  function paint() {
    const host = ThreeLab.scenes?.previewHost?.();
    if (!S.ref || !host) { S.chip?.remove(); S.chip = null; S.card?.remove(); S.card = null; return; }
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const here = S.sid === sceneNow();
    const p = S.last?.parts;
    if (!S.chip) S.chip = el('button', { type: 'button', class: 'ms-chip', dataset: { feature: 'Match score' }, on: { click: (e) => { e.stopPropagation(); toggleCard(); }, contextmenu: (e) => e.stopPropagation() } });
    const t = `◎ ${pct(p?.overall)}`;
    if (S.chip.textContent !== t) S.chip.textContent = t;
    S.chip.title = `How close the picture is to ${S.ref.title} (click: the parts, ◎ Closer)`;
    S.chip.hidden = !here;
    if (S.chip.parentNode !== host) host.append(S.chip);
    if (!S.cardOpen || !here) { S.card?.remove(); S.card = null; S.cardKey = ''; return; }
    const key = JSON.stringify([S.ref.title, S.busy, S.closer && [S.closer.undone, S.closer.none, S.closer.best], S.ai?.phase || '', S.ai?.line || '']);
    if (S.card && S.cardKey === key && S.card.parentNode === host) { fill(S.card, p); return; }
    S.cardKey = key;
    const rows = ['colours', 'light', 'energy', 'motion'].filter((k) => k !== 'motion' || S.ref.kind === 'clip').map((k) => {
      const v = p?.[k];
      return el('div', { class: 'ms-row', dataset: { part: k } }, el('span', { class: 'ms-name', text: C().LABELS[k] }), el('span', { class: 'ms-bar' }, el('i')), el('span', { class: 'ms-v', text: '' }), el('span', { class: 'ms-why', text: '' }));
    });
    const cl = S.closer;
    const closerLine = S.busy ? 'Trying the colour and light sliders…' : cl && !cl.undone ? (cl.none ? 'Already as close as these sliders go.' : `Closer: ${Math.round(cl.start)} → ${Math.round(cl.best)} % · ${cl.sliders.length} slider${cl.sliders.length === 1 ? '' : 's'} · ${cl.steps} tries`) : '';
    const ai = S.ai;
    const aiBox = !ai ? null : ai.phase === 'pricing' ? el('div', { class: 'ms-ai', text: 'Working out the cost…' })
      : ai.phase === 'sent' ? el('div', { class: 'ms-ai', text: `Sent to the director: the parts still off (no picture).` })
        : el('div', { class: 'ms-ai' }, el('div', { class: 'ms-cost', text: ai.line }), el('div', { class: 'ms-sub', text: 'It gets the parts still off in words (no picture), and works with the Lab\'s tools.' }),
          el('div', { class: 'ms-acts' }, btn('✦ Send', 'ms-send', () => askSend()), btn('Cancel', '', () => { S.ai = null; paint(); })));
    const card = el('div', { class: `ms-card${S.busy ? ' busy' : ''}`, attrs: { 'aria-label': 'Match score' }, on: { contextmenu: (e) => e.stopPropagation(), click: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggleCard(false); } } } },
      el('div', { class: 'ms-head' }, S.ref.thumb ? el('img', { class: 'ms-thumb', src: S.ref.thumb, alt: '' }) : null,
        el('div', { class: 'ms-top' }, el('b', { class: 'ms-all', text: `◎ ${pct(p?.overall)}` }), el('span', { class: 'ms-word', text: C().word(p?.overall) }), el('div', { class: 'ms-src', text: `like ${S.ref.title}${S.ref.kind === 'clip' ? ' (clip)' : ''}`, title: S.ref.source.path || '' })),
        btn('✕', 'ms-x', () => toggleCard(false), 'Fold (the score stays on the chip)')),
      S.ref.palette?.length ? el('div', { class: 'ms-pal', title: 'Its colours (read here)' }, ...S.ref.palette.map((hex) => { const s = el('span', { title: hex }); s.style.background = hex; return s; })) : null,
      el('div', { class: 'ms-rows' }, ...rows),
      closerLine ? el('div', { class: 'ms-sub ms-closer', text: closerLine }) : null,
      el('div', { class: 'ms-acts' },
        btn('◎ Closer', 'ms-go', () => closer(), 'Nudge the colour and light sliders (and the ◐ Grade) toward it, keeping only what raises the score (≈ 2 s, one undo)'),
        cl && !cl.undone && !cl.none ? btn('↶ Undo', '', () => undo(), 'Put the sliders back as they were before Closer') : null,
        btn('✦ Ask the AI for the rest', 'ms-ask', () => askOpen(), 'The parts still off go to the director in words (no picture). The cost shows first.'),
        btn('⋯', 'ms-more', () => more(), 'Another reference, or stop matching')),
      aiBox);
    fill(card, p);
    S.card?.replaceWith(card); S.card = card;
    if (card.parentNode !== host) host.append(card);
  }
  function more() {
    const r = S.card?.querySelector('.ms-more')?.getBoundingClientRect();
    showMenu(r ? r.left : 100, r ? r.bottom + 4 : 100, [
      { label: 'Another reference…', hint: 'a file, the moodboard, a render', action: () => pick().catch(err) },
      { label: `Stop matching ${S.ref?.title || ''}`, action: () => stop() },
    ]);
  }

  function state() {
    const c = S.cost;
    return { on: Boolean(S.ref), title: S.ref?.title || null, kind: S.ref?.kind || null, sid: S.sid, palette: S.ref?.palette || [], refMotion: S.ref?.motion ?? null, parts: S.last?.parts || null, hints: S.last?.hints || null, at: S.last?.at || 0, updates: S.updates,
      cost: { n: c.length, median: Math.round(C().median(c) * 1000) / 1000, max: Math.round(Math.max(0, ...c) * 1000) / 1000 }, busy: S.busy, closer: S.closer ? { start: S.closer.start, best: S.closer.best, steps: S.closer.steps, kept: S.closer.kept, ms: S.closer.ms, sliders: S.closer.sliders, undone: S.closer.undone, none: Boolean(S.closer.none) } : null,
      ai: S.ai ? { phase: S.ai.phase, line: S.ai.line || '', text: S.ai.text || '' } : null, sent: S.sent.slice() };
  }

  function actions() { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: How close am I? Match against a picture or clip…', () => pick().catch(err)); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', actions); else actions();

  return { start, stop, fromRef, fromBoardItem, pick, sample, closer, undo, askOpen, askSend, state, toggleCard, paint, get chip() { return S.chip; }, get card() { return S.card; } };
})();
