// 🎨 "Make it look like this" (round 28, lookmatch). You give the Lab a reference — a picture or a video, a mood-board
// item, a render — and it matches its look in one click, locally, before any AI is involved (no tokens):
//   1. the reference is read with the board's vibe reader (board-vibe.js) + the grade numbers (three-lookmatch-core.js):
//      palette and weights, light, contrast, saturation, warmth in kelvin, grain, vignette, glow, bars; a clip's motion
//   2. the Lab's own picture is read the same way, and the gap becomes the scene's ◐ Grade + ◐ Film & lens layers
//      (tools/three-grade*.js: curves, lift / gain, wheels, white balance, saturation, grain, vignette, bars, bloom),
//      ordinary sliders; one more read of the graded picture closes what's left; the reference's colors become the palette
//   3. a small card over the preview: the reference, its palette, what changed, how close it got, Strength, hold to see
//      before, ↶ Undo (the scene's grade and palette as they were), ◐ Fine-tune (the grade panel)
//   4. ✦ Ask the director to match it: it gets a small picture of the reference (labdirector's small-picture path) and the
//      numbers, to adapt shapes, light and motion; the cost shows first
// Ways in (no command needed): the director's ◎ mission "Make it look like this", the preview's right-click ✦ More ›
// ✨ Look & motion, a board item's right-click "🎨 Use this look in the Lab", dropping a picture on the Lab preview.
//   LookMatch.pick() → source · run(source, { ask }) · undo() · ask(note) · fromBoardItem(item) · offerDrop(file, x, y)
//   item() (✦ More) · state() · recent()
const LookMatch = (() => {
  const C = () => LookCore;
  const G = () => GradeCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => { toast(e?.message || String(e), { type: 'error' }); };
  const fileUrl = (p) => (!p ? '' : /^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const base = (p) => String(p || '').split(/[\\/]/).pop().replace(/^\d{10,}-/, ''); // (an attachment's time prefix off)
  const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  const RECENT = 'three.lookmatch.recent';
  const S = { last: null, card: null, busy: false }; // last: { snap, ref, m, source, pic, score }

  async function lab() {
    await ThreeLab.cmd?.({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return ThreeLab.director;
  }
  // the board's vibe reader lives in the board group (loaded after the first screen)
  async function vibeReader() {
    if (typeof BoardVibe === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('board');
    if (typeof BoardVibe === 'undefined') throw new Error('The vibe reader (the mood board) did not load.');
    return BoardVibe;
  }

  // ---------- reading a reference ----------
  // source: { path?, url?, kind: 'image' | 'video', title, vibe? (a board item's), from: 'file' | 'board' | 'render' | 'drop' }
  const kindOf = (p) => (VIDEO.test(p || '') ? 'video' : 'image');
  function small(canvasOrImg, max = 96) {
    const w = canvasOrImg.naturalWidth || canvasOrImg.videoWidth || canvasOrImg.width; const h = canvasOrImg.naturalHeight || canvasOrImg.videoHeight || canvasOrImg.height;
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(canvasOrImg, 0, 0, c.width, c.height);
    return c;
  }
  async function readImage(url) {
    const V = await vibeReader();
    const img = await V.loadImage(url);
    const { data, w, h } = V.pixelsOf(img, img.naturalWidth, img.naturalHeight, 200);
    const ref = C().analyze(data, w, h);
    Object.assign(ref, { kind: 'still', size: [img.naturalWidth, img.naturalHeight], aspect: V.aspectWord(img.naturalWidth, img.naturalHeight) });
    ref.moods = V.moods(ref);
    return { ref, frames: [img] };
  }
  // a clip: 5 frames across it for the look, the board's clip reader for motion (a board item already has it)
  async function readVideo(url, vibe = null, onProgress = null) {
    const V = await vibeReader();
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous'; v.src = url;
    try {
      await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error('The clip did not load')); setTimeout(() => reject(new Error('The clip took too long to open')), 20000); });
      if (typeof BoardVibe.realDuration === 'function') await BoardVibe.realDuration(v);
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const seek = (t) => new Promise((resolve) => { let fin = false; const done = () => { if (fin) return; fin = true; v.removeEventListener('seeked', done); resolve(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 5000); });
      const looks = []; const frames = [];
      for (const f of dur ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0]) {
        if (dur) await seek(Math.min(dur - 0.01, f * dur));
        const { data, w, h } = V.pixelsOf(v, v.videoWidth || 16, v.videoHeight || 9, 200);
        looks.push(C().analyze(data, w, h));
        frames.push(small(v, 320));
        onProgress?.(looks.length / 6);
      }
      const ref = C().merge(looks);
      const mo = vibe?.motion != null ? vibe : await V.video(url, { maxSamples: 40 }).catch(() => null);
      if (mo) for (const k of ['motion', 'cutCount', 'pace', 'cutsPerMin', 'lightArc', 'cuts']) if (mo[k] != null) ref[k] = mo[k];
      Object.assign(ref, { kind: 'clip', duration: Math.round(dur * 100) / 100, size: [v.videoWidth, v.videoHeight], aspect: V.aspectWord(v.videoWidth, v.videoHeight) });
      ref.moods = V.moods(ref);
      return { ref, frames };
    } finally { v.removeAttribute('src'); v.load(); }
  }
  async function read(source) {
    const url = source.url || fileUrl(source.path);
    if (!url) throw new Error('No picture or video to read.');
    return source.kind === 'video' ? readVideo(url, source.vibe) : readImage(url);
  }

  // ---------- the Lab's side ----------
  async function labRead(d) {
    const url = await (d.shotSmall ? d.shotSmall(200) : d.shot()).catch(() => null);
    if (!url) return null;
    const V = await vibeReader();
    const img = await V.loadImage(url).catch(() => null);
    if (!img) return null;
    const { data, w, h } = V.pixelsOf(img, img.naturalWidth, img.naturalHeight, 200);
    return C().analyze(data, w, h);
  }
  const codeOf = (d, id) => { try { return d.codeOf(id).code || ''; } catch { return ''; } };
  // the scene's grade layers and palette as they are (↶ Undo puts them back)
  async function snapshot(d) {
    const have = await LabGrade.findLayers(d);
    const one = (L) => (L ? { id: L.id, name: L.name, code: codeOf(d, L.id) } : null);
    return { grade: one(have.grade), lens: one(have.lens), palette: (d.refs?.palette?.() || []).slice(), sketch: ThreeLab.scenes?.currentId?.() || null };
  }
  async function restore(snap) {
    const d = await lab();
    const have = await LabGrade.findLayers(d);
    for (const kind of ['grade', 'lens']) {
      const was = snap[kind]; const now = have[kind];
      if (was && now) await d.updateLayer(now.id, { code: was.code }, 0.6);
      else if (was) await d.addLayer({ name: was.name, code: was.code }, 0.6);
      else if (now) await d.removeLayer(now.id);
    }
    d.refs?.setPalette?.(snap.palette || []);
    LabGrade.refresh?.();
  }
  const lutNames = async () => { try { return (await LabGrade.luts()).imported.map((x) => x.name); } catch { return []; } };
  // the matched look written into the scene's ◐ layers (made when missing; lens right under the grade: one GPU pass)
  async function write(d, { grade, lens }) {
    const luts = await lutNames();
    let have = await LabGrade.findLayers(d);
    if (have.grade) await d.updateLayer(have.grade.id, { code: G().code('grade', grade, { luts }) }, 1);
    else await d.addLayer({ name: G().NAMES.grade, code: G().code('grade', grade, { luts }) }, 1);
    have = await LabGrade.findLayers(d);
    if (lens) {
      if (have.lens) await d.updateLayer(have.lens.id, { code: G().code('lens', lens) }, 1);
      else {
        const position = d.layers().layers.findIndex((x) => x.id === have.grade?.id) + 1;
        await d.addLayer({ name: G().NAMES.lens, code: G().code('lens', lens), ...(position > 0 ? { position } : {}) }, 1);
      }
    } else if (have.lens) await d.updateLayer(have.lens.id, { code: G().code('lens', { ...G().defaults('lens'), amount: 0 }) }, 1);
    return LabGrade.findLayers(d);
  }

  // ---------- one click: read, match, write, check, card ----------
  async function run(source, { ask = null, strength = 1, quiet = false } = {}) {
    if (S.busy) throw new Error('Still matching the last one.');
    S.busy = true;
    const busy = quiet ? null : toast(`🎨 Reading ${source.title || 'the reference'}…`, { timeout: 0 });
    try {
      const { ref, frames } = await read(source);
      const d = await lab();
      const snap = await snapshot(d);
      // the scene as it is, without a grade (an old one steps aside for the read; it's replaced next)
      const have = await LabGrade.findLayers(d);
      for (const L of [have.grade, have.lens]) if (L) try { d.sliders(L.id, { amount: 0 }); } catch { /* no sliders yet */ }
      if (have.grade || have.lens) await sleep(250);
      const cur = await labRead(d);
      const m = C().match(ref, cur || undefined, { strength });
      const before = cur ? C().closeness(ref, cur) : null;
      try {
        await write(d, m);
        if (m.palette.length) d.refs?.setPalette?.(m.palette);
        // one more read of the graded picture: what's still off moves (tone points, saturation, warmth, grain)
        let got = null;
        if (cur) {
          await sleep(350);
          got = await labRead(d);
          if (got) { m.grade = C().refine(m.grade, ref, got); await write(d, m); await sleep(350); got = await labRead(d) || got; }
        }
        const score = got ? C().closeness(ref, got) : null;
        S.last = { snap, ref, m, source, frames, before, score, at: Date.now() };
      } catch (e) { await restore(snap).catch(() => {}); throw e; }
      LabGrade.refresh?.();
      remember(S.last);
      busy?.remove?.();
      showCard();
      if (!quiet) toast(`🎨 Matched ${source.title || 'the look'}${S.last.score != null ? ` · ≈${S.last.score} % close` : ''}`, { timeout: 4500, action: { label: 'Undo', fn: () => undo().catch(err) } });
      if (ask != null && String(ask).trim()) setTimeout(() => askDirector(String(ask).trim()).catch(err), 200);
      return { ref, match: m, before: S.last.before, score: S.last.score };
    } finally { busy?.remove?.(); S.busy = false; }
  }
  async function undo() {
    const l = S.last;
    if (!l) { toast('Nothing to undo.', { timeout: 1500 }); return false; }
    await restore(l.snap);
    S.last = null;
    closeCard();
    toast('↶ The look is back as it was', { timeout: 1800 });
    return true;
  }

  // ---------- your matched looks (one click again) ----------
  function remember(l) {
    try {
      const thumb = l.frames?.[0] ? small(l.frames[0], 48).toDataURL('image/jpeg', 0.6) : '';
      const row = { name: l.source.title || 'Reference', at: l.at, grade: G().changed('grade', l.m.grade), lens: l.m.lens ? G().changed('lens', l.m.lens) : null, palette: l.m.palette, thumb, words: C().words(l.ref).slice(0, 4) };
      store.set(RECENT, [row, ...store.get(RECENT, []).filter((x) => x.name !== row.name)].slice(0, 8));
    } catch { /* a picture we may not read back (tainted): keep going */ }
  }
  const recent = () => store.get(RECENT, []);
  async function reapply(row) {
    const d = await lab();
    const snap = await snapshot(d);
    const m = { grade: { ...G().defaults('grade'), ...row.grade }, lens: row.lens ? { ...G().defaults('lens'), ...row.lens } : null, palette: row.palette || [], why: [] };
    try { await write(d, m); if (m.palette.length) d.refs?.setPalette?.(m.palette); } catch (e) { await restore(snap).catch(() => {}); throw e; }
    S.last = { snap, ref: null, m, source: { title: row.name, thumb: row.thumb }, frames: null, score: null, at: Date.now() };
    LabGrade.refresh?.();
    showCard();
    toast(`🎨 ${row.name}'s look again`, { timeout: 3000, action: { label: 'Undo', fn: () => undo().catch(err) } });
  }

  // ---------- the card over the preview ----------
  function closeCard() { S.card?.remove(); S.card = null; }
  function setAmount(v, { keep = false } = {}) {
    const d = ThreeLab.director; if (!d) return;
    LabGrade.findLayers(d).then((have) => {
      for (const L of [have.grade, have.lens]) if (L) try { d.sliders(L.id, { amount: v }); } catch { /* gone */ }
      if (keep) LabGrade.keep?.().catch(() => {});
    }).catch(() => {});
  }
  function showCard() {
    const host = ThreeLab.scenes?.previewHost?.();
    const l = S.last;
    if (!host || !l) return;
    closeCard();
    const thumbEl = l.frames?.[0] ? small(l.frames[0], 72) : l.source.thumb ? el('img', { src: l.source.thumb, alt: '' }) : null;
    thumbEl?.classList.add('lm-thumb');
    const pal = l.ref?.palette || (l.m.palette || []).map((hex) => ({ hex, share: 1 / Math.max(1, l.m.palette.length) }));
    const strip = el('div', { class: 'lm-pal', title: 'Its colors (now the sketch palette), widest = most of the picture' }, pal.map((c) => { const s = el('span', { title: `${c.hex}${c.share ? ` · ${Math.round(c.share * 100)} %` : ''}` }); s.style.background = c.hex; s.style.flexGrow = String(Math.max(0.06, c.share || 0.1)); return s; }));
    const words = l.ref ? C().words(l.ref) : [];
    const amt = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(l.m.grade.amount ?? 1), title: 'How much of the matched look (0 = none)',
      on: { input: (e) => setAmount(Number(e.target.value)), change: (e) => setAmount(Number(e.target.value), { keep: true }) } });
    const hold = el('button', { type: 'button', class: 'lm-btn', text: 'Before', title: 'Hold to see the scene without the look' });
    const back = () => setAmount(Number(amt.value));
    hold.addEventListener('pointerdown', () => setAmount(0));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, back);
    const close = el('button', { type: 'button', class: 'lm-btn lm-x', text: '✕', title: 'Close (the look stays)', on: { click: () => closeCard() } });
    S.card = el('div', { class: 'lm-card', attrs: { 'aria-label': 'Look match' }, on: { contextmenu: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeCard(); } } } },
      el('div', { class: 'lm-head' }, el('b', { text: '🎨 Look match' }), el('span', { class: 'lm-src', text: l.source.title || '', title: l.source.path || '' }), close),
      el('div', { class: 'lm-top' }, thumbEl, el('div', { class: 'lm-info' }, strip,
        words.length ? el('div', { class: 'lm-words', text: words.join(' · ') }) : null,
        el('div', { class: 'lm-why', text: l.m.why?.length ? l.m.why.join(' · ') : G().describe(l.m.grade, l.m.lens) }),
        l.score != null ? el('div', { class: 'lm-score', text: `≈${l.score} % close${l.before != null ? ` (was ${l.before} %)` : ''}` }) : null)),
      el('label', { class: 'lm-row' }, el('span', { text: 'Strength' }), amt),
      el('div', { class: 'lm-acts' },
        el('button', { type: 'button', class: 'lm-btn', text: '↶ Undo', title: 'The scene\'s grade and palette as they were', on: { click: () => undo().catch(err) } }),
        hold,
        el('button', { type: 'button', class: 'lm-btn', text: '◐ Fine-tune', title: 'Every setting of the matched grade (curves, wheels, film, lens…)', on: { click: () => LabGrade.open().catch(err) } }),
        l.ref ? el('button', { type: 'button', class: 'lm-btn lm-ask', text: '✦ Ask the director', title: 'It gets a small picture of the reference + these numbers, to match shapes, light and motion (the cost shows first)', on: { click: () => askDirector().catch(err) } }) : null));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(S.card);
  }

  // ---------- ✦ Ask the director to match it ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || null;
  async function referencePicture(l) {
    const P = typeof ThreeDirector !== 'undefined' ? ThreeDirector.pictures : null;
    const frames = l.frames || [];
    if (!frames.length) return null;
    let c;
    if (frames.length === 1) c = P ? P.frameCanvas(frames[0], { max: 384 }) : small(frames[0], 384);
    else {
      // a clip: 4 frames in a 2 × 2 sheet, ≤ 448 px
      const f4 = [0, 1, 3, 4].map((i) => frames[Math.min(frames.length - 1, i)]);
      const w = f4[0].width; const h = f4[0].height;
      const sheet = document.createElement('canvas'); sheet.width = w * 2 + 4; sheet.height = h * 2 + 4;
      const g = sheet.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, sheet.width, sheet.height);
      f4.forEach((f, i) => g.drawImage(f, (i % 2) * (w + 4), Math.floor(i / 2) * (h + 4), w, h));
      c = P ? P.frameCanvas(sheet, { max: 448 }) : small(sheet, 448);
    }
    const data = P ? await P.jpeg(c, 0.75) : c.toDataURL('image/jpeg', 0.75).split(',')[1];
    return { data, w: c.width, h: c.height };
  }
  async function askDirector(note = '', { confirm = true } = {}) {
    const l = S.last;
    if (!l?.ref) throw new Error('Match a picture or a video first (🎨 Make it look like this).');
    let dir = directorOf();
    if (!dir) {
      await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'lookmatch', say: () => {}, note: () => {} });
      for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
      dir = directorOf();
      if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    }
    const pic = await referencePicture(l);
    const text = C().brief(l.ref, { title: l.source.title, kind: l.ref.kind, note });
    const c = C().cost(pic, text);
    if (confirm) {
      const yes = await Modal.confirm('Ask the director to match it?', `${dir.name} gets a small picture of the reference (≈${c.image} tokens) and its numbers (≈${c.text} tokens): ≈${c.total} tokens with this message, plus its reply and the work it does. The colors are already matched here; it adapts shapes, light and motion.${window.Budget?.passLine?.(dir.id, c.total) || ''}`, { ok: `Ask (≈${c.total} tokens)` });
      if (!yes) return false;
    }
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    if (pic) {
      try {
        const p = await window.hub.saveAttachment(`look reference ${Date.now().toString(36)}.jpg`, pic.data);
        await Native.attachPaths(dir.id, [p]);
      } catch { toast('The picture could not go along; the numbers do.', { timeout: 2500 }); }
    }
    await Native.send(dir.id, text);
    S.asked = { at: Date.now(), agentId: dir.id, cost: c };
    return true;
  }

  // ---------- where the reference comes from ----------
  const MEDIA = (it) => ['image', 'gif', 'video', 'web'].includes(it.type) && (it.src || it.thumb);
  function boardSource(it) {
    const isClip = it.type === 'video';
    return { path: isClip ? it.src : it.type === 'gif' ? it.poster || it.src : it.src || it.thumb, kind: isClip ? 'video' : 'image', title: it.title || (it.type === 'web' ? 'Web page' : 'Board item'), vibe: it.vibe || null, from: 'board' };
  }
  async function boardItems() {
    if (typeof Board === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('board').catch(() => null);
    if (typeof Board === 'undefined') return [];
    await Board.ready?.().catch(() => null);
    return (Board.items?.() || []).filter(MEDIA).slice(0, 24);
  }
  function renderRows() {
    if (typeof Renders === 'undefined') return [];
    const seen = new Set();
    return [...(Renders.history?.() || []), ...(Renders.list?.() || [])].filter((j) => j.status === 'done' && j.output && VIDEO.test(j.output) && !seen.has(j.output) && seen.add(j.output)).slice(0, 6);
  }
  // The picker: drop / choose a file, a mood-board item, a recent render. → a source, or null
  function pick() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (src) => { if (done) return; done = true; dlg.close(); resolve(src); };
      const fromFile = (path, title) => finish({ path, kind: kindOf(path), title: title || base(path), from: 'file' });
      const fromBlob = (f) => { const path = window.hub.pathForFile?.(f); if (path) fromFile(path, f.name); else finish({ url: URL.createObjectURL(f), kind: /^video\//.test(f.type) ? 'video' : 'image', title: f.name, from: 'drop' }); };
      const drop = el('div', { class: 'lm-drop' },
        el('div', { text: 'Drop a picture or a video here' }),
        el('button', { type: 'button', class: 'primary', text: 'Choose a file…', on: { click: async () => {
          const [p] = (await window.hub.openDialog({ title: 'A picture or video to match', properties: ['openFile'], filters: [{ name: 'Pictures and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'mp4', 'mov', 'webm', 'm4v', 'mkv'] }] })) || [];
          if (p) fromFile(p);
        } } }));
      dropZone(drop, (files) => { const f = files.find((x) => /^(image|video)\//.test(x.type) || IMAGE.test(x.name) || VIDEO.test(x.name)); if (f) fromBlob(f); }, { hint: 'Match this look' });
      const boardBox = el('div', { class: 'lm-grid' });
      const rendersBox = el('div', { class: 'lm-list' });
      const recentBox = el('div', { class: 'lm-list' });
      const dlg = el('dialog', { class: 'ui-modal lm-dlg' },
        el('h2', { text: '🎨 Make it look like this' }),
        el('p', { class: 'lm-sub', text: 'Its colors, light and grain land on this scene at once (no tokens). Then, if you like, the director matches shapes and motion.' }),
        drop,
        el('div', { class: 'lm-sec', text: 'From your mood board' }), boardBox,
        el('div', { class: 'lm-sec', text: 'A recent render' }), rendersBox,
        el('div', { class: 'lm-sec', text: 'A look you matched before' }), recentBox,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', text: 'Cancel', on: { click: () => finish(null) } })));
      dlg.addEventListener('close', () => { setTimeout(() => dlg.remove(), 0); if (!done) { done = true; resolve(null); } });
      document.body.append(dlg);
      dlg.showModal();
      boardItems().then((items) => {
        if (!items.length) { boardBox.previousSibling.remove(); boardBox.remove(); return; }
        boardBox.replaceChildren(...items.map((it) => {
          const pic = it.type === 'video' ? it.poster || it.tiny || it.thumb : it.thumb || it.src;
          return el('button', { type: 'button', class: 'lm-tile', title: `${it.title || it.type}${it.type === 'video' ? ' (clip: its motion too)' : ''}`, on: { click: () => finish(boardSource(it)) } },
            pic ? el('img', { src: fileUrl(pic), alt: '', loading: 'lazy', draggable: false }) : el('span', { text: it.type }), it.type === 'video' ? el('i', { text: '▶' }) : null);
        }));
      }).catch(() => boardBox.remove());
      const rr = renderRows();
      if (rr.length) rendersBox.replaceChildren(...rr.map((j) => el('button', { type: 'button', class: 'lm-rowbtn', text: `🎬 ${j.title || base(j.output)}`, title: j.output, on: { click: () => fromFile(j.output, j.title || base(j.output)) } })));
      else { rendersBox.previousSibling.remove(); rendersBox.remove(); }
      const rc = recent();
      if (rc.length) recentBox.replaceChildren(...rc.map((r) => el('button', { type: 'button', class: 'lm-rowbtn', title: (r.words || []).join(' · '), on: { click: () => { finish(null); reapply(r).catch(err); } } }, r.thumb ? el('img', { src: r.thumb, alt: '' }) : null, el('span', { text: r.name }))));
      else { recentBox.previousSibling.remove(); recentBox.remove(); }
    });
  }
  async function pickAndRun(opts = {}) {
    const src = await pick();
    if (!src) return null;
    return run(src, opts);
  }
  // a board item's right-click "🎨 Use this look in the Lab"
  async function fromBoardItem(it) {
    if (!it || !MEDIA(it)) throw new Error('Pick a picture, a clip or a web page on the board.');
    return run(boardSource(it));
  }
  // a picture dropped on the Lab preview: "Match this look" (or keep it as a reference, as before)
  function offerDrop(file, x, y) {
    const path = window.hub.pathForFile?.(file) || '';
    const src = path ? { path, kind: kindOf(path), title: file.name, from: 'drop' } : { url: URL.createObjectURL(file), kind: /^video\//.test(file.type) ? 'video' : 'image', title: file.name, from: 'drop' };
    showMenu(x, y, [
      { label: '🎨 Match this look', hint: 'colors, light, grain: on this scene, no tokens', action: () => run(src).catch(err) },
      { label: '🎨 Match it, then ask the director', hint: 'shapes and motion too (cost shown first)', action: () => run(src).then(() => askDirector()).catch(err) },
      path ? { label: 'Add it to the sketch\'s references', action: () => ThreeLab.addReference(path).then((r) => toast(`${file.name} is a reference (${r.key})`, { timeout: 2200 })).catch(err) } : null,
    ].filter(Boolean));
  }

  // ---------- ✦ More › ✨ Look & motion ----------
  function item() {
    const rc = recent();
    if (!rc.length && !S.last) return { label: '🎨 Make it look like this…', hint: 'a picture or video: its colors, light, grain', action: () => pickAndRun().catch(err) };
    return { label: '🎨 Make it look like this', hint: 'a picture or video: its colors, light, grain', items: () => [
      { label: 'Choose a picture or video…', action: () => pickAndRun().catch(err) },
      ...(S.last ? [{ label: '↶ Undo the last match', action: () => undo().catch(err) }, ...(S.last.ref ? [{ label: '✦ Ask the director to match it…', hint: 'cost shown first', action: () => askDirector().catch(err) }] : [])] : []),
      ...(rc.length ? ['-', ...rc.map((r) => ({ label: r.name, hint: (r.words || []).slice(0, 2).join(' · '), action: () => reapply(r).catch(err) }))] : []),
    ] };
  }

  // ---------- the director's ◎ mission ----------
  const inLab = (id) => H.agent?.(id)?.dock === 'three';
  const MISSION = {
    id: 'lab-lookmatch', icon: '🎨', label: 'Make it look like this',
    desc: 'Pick a picture or a video (or a board item, a render): its colors, light and grain land on the scene at once, no tokens. Then your words go to the director with a small picture of it to match shapes and motion (the cost shows first).',
    submit(agentId, text) {
      pick().then((src) => {
        if (!src) { Native.setDraft?.(agentId, text); return null; }
        return run(src, { ask: text });
      }).catch(err);
      return true;
    },
  };
  if (typeof Missions !== 'undefined' && Missions.add) Missions.add({ ...MISSION, when: inLab });

  // ---------- /look-match (the app's internal API; the menus above are the way in) ----------
  function register() {
    if (typeof Commands === 'undefined' || Commands.get?.('look-match')) return;
    Commands.register({
      name: 'look-match', area: 'Three.js Lab',
      args: '[picture or video file] | board | undo | ask [words] | status',
      desc: 'Make the Lab scene look like a reference: palette, light, contrast, saturation, warmth, grain, vignette, bars and glow matched on its ◐ Grade layers (no tokens); ask: the director matches shapes and motion from a small picture',
      keywords: 'look match reference make it look like this mood board vibe palette color grade film grain temperature kelvin copy style',
      examples: ['/look-match', '/look-match ~/Pictures/ref.jpg', '/look-match ask more chrome', '/look-match undo'],
      complete: (a) => ['board', 'undo', 'ask', 'status'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const a = String(args || '').trim();
        const w = a.split(/\s+/)[0].toLowerCase();
        if (!a) { pickAndRun().catch(err); return undefined; }
        if (w === 'undo') return (await undo()) ? 'The look is back as it was.' : 'Nothing to undo.';
        if (w === 'ask') { await askDirector(a.slice(3).trim()); return undefined; }
        if (w === 'status') { const s = state(); return s.on ? `🎨 ${s.source}: ${s.why}${s.score != null ? ` (≈${s.score} % close)` : ''}` : 'No look matched yet.'; }
        if (w === 'board') {
          const sel = (typeof Board !== 'undefined' && Board.selected?.()) || [];
          const it = (Array.isArray(sel) ? sel : []).find(MEDIA) || (await boardItems())[0];
          if (!it) return 'No picture or clip on the board.';
          const r = await fromBoardItem(it);
          return `🎨 Matched "${it.title || it.type}"${r.score != null ? ` (≈${r.score} % close)` : ''}.`;
        }
        const path = a.replace(/^["']|["']$/g, '').replace(/^~(?=[\\/])/, await window.hub.fs.home());
        const r = await run({ path, kind: kindOf(path), title: base(path), from: 'file' });
        return `🎨 Matched ${base(path)}: ${r.match.why.join(' · ') || 'a light touch'}${r.score != null ? ` (≈${r.score} % close)` : ''}.`;
      },
    });
  }
  function actions() {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Lab: Make it look like this… (match a picture or video)', () => pickAndRun().catch(err));
  }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  function state() {
    const l = S.last;
    return l ? { on: true, source: l.source.title, why: (l.m.why || []).join(' · '), score: l.score, before: l.before, grade: G().changed('grade', l.m.grade), lens: l.m.lens ? G().changed('lens', l.m.lens) : null, palette: l.m.palette, ref: l.ref, asked: S.asked || null } : { on: false, asked: S.asked || null };
  }
  return { pick, run, undo, askDirector, ask: askDirector, fromBoardItem, offerDrop, item, state, recent, reapply, read, MISSION, get card() { return S.card; } };
})();
