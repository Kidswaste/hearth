// Ready to post (round 27, publishkit): from a finished render to a post you upload yourself. One calm panel:
//   · the platform (YouTube Shorts, TikTok, Instagram Reels, YouTube 16:9, Instagram square: one row of chips, guessed
//     from the video's shape and remembered), the video framed the way that app frames it, with ▦ its buttons drawn
//     over it (the zones go red where detail sits under them)
//   · the checks in plain words: shape, size, length limit, frame rate, bitrate, codec, sound and loudness, detail
//     under the app's buttons, the loop for Shorts / TikTok / Reels; a fix button where Hearth can make a better copy
//     (a 9:16 render, a cut to the limit, the loudness evened out to -14 LUFS, the end blended into the start). Fixes
//     run in the render queue (⇪) and the kit checks the new copy by itself when it's done.
//   · the cover: the best frames suggested (sharp, well lit, a strong moment), the scrub bar picks any frame, optional
//     words on it, saved as a picture at the platform's cover size
//   · the words: title, description, hashtags; plain words from the song and the scene at first (no tokens), ✍ asks
//     the chat's AI for better ones (one lean question, its tokens shown). You edit them. Copy all.
//   · 📁 Make the post folder: the video, the cover and a text file with the words and the checks, in posts/ next to
//     the video; Show in folder. Hearth never uploads, never signs in anywhere.
// Reached from a finished render (the done note's "📮 Post" button, the renders list's 📮 and right-click), the ◎
// mission "Get it ready to post", Ctrl/⌘+K, /post. Measuring runs in publishmain.js (ffmpeg); without ffmpeg the
// <video> element measures what it can (no loudness).
const PublishKit = (() => {
  const P = PublishCore;
  const RC = () => window.RendersCore;
  const PLAT = /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux';
  const PERSONA = 'You write social media posts for a music visual artist. Answer in the format asked, nothing else.';
  const fileUrl = (p) => (/^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const stemOf = (p) => base(p).replace(/\.[^.]+$/, '');
  const dirOf = (p) => { const s = String(p || ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : s.slice(0, 1); };
  const join = (d, ...parts) => { const sep = String(d).includes('\\') && !String(d).includes('/') ? '\\' : '/'; return [String(d).replace(/[\\/]+$/, ''), ...parts].join(sep); };
  const exists = async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null));
  const nextFree = (p) => (RC() ? RC().nextFree(p, exists) : Promise.resolve(p));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ICON = { ok: '✓', tip: '·', warn: '!', bad: '✕' };
  const songTitle = (p) => base(p).replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').replace(/\s*[-–]\s*(official|audio|video|lyrics?).*$/i, '').trim();

  let cur = null; // the open kit: { file, dlg, video, info, an, platform, draft, coverTitle, … }
  const listeners = new Set();
  const emit = (what) => { for (const fn of listeners) { try { fn(what, cur); } catch (err) { console.warn(err); } } };

  // ---------- what the video is about (for the words): the song, the scene, the make ----------
  function context(o = {}) {
    const c = { file: base(o.file), duration: cur?.info?.duration || 0, hint: o.hint || '' };
    try {
      if (window.Lazy?.loaded?.('lab') && window.ThreeLab?.peek) {
        const st = ThreeLab.peek()?.state;
        if (st?.song) c.song = songTitle(st.song);
        if (st?.sketch) c.scene = st.sketch;
        if (st?.bpm) c.bpm = Math.round(st.bpm);
      }
    } catch { /* the Lab says nothing */ }
    if (!c.scene && o.job?.make?.name) c.scene = o.job.make.name;
    if (!c.scene) c.scene = stemOf(o.file).replace(/_(vertical|story|feed45|square|yt1080|yt4k)(_\d+x\d+)?$/, '').replace(/[_]+/g, ' ').trim();
    return c;
  }

  // ---------- measuring ----------
  async function analyze(file) {
    const r = await window.hub.publish?.analyze?.(file).catch((err) => ({ ok: false, error: err.message })) || { ok: false, noFfmpeg: true };
    if (r.ok) return { ...r, heat: r.heat ? { ...r.heat, data: Float32Array.from(r.heat.data) } : null };
    if (!r.noFfmpeg) throw new Error(r.error || 'Couldn\'t read this video');
    return local(file, r.hint);
  }
  // without ffmpeg: the <video> element seeks ~16 moments (no loudness, no exact rate)
  async function local(file, hint) {
    const v = el('video', { muted: true, preload: 'auto', playsInline: true, src: fileUrl(file) });
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('This video can\'t be read here (and ffmpeg isn\'t installed)')); setTimeout(() => rej(new Error('The video took too long to open')), 15000); });
    const d = Number.isFinite(v.duration) ? v.duration : 0;
    const info = { w: v.videoWidth, h: v.videoHeight, duration: d, fps: 0, audio: undefined, codec: null, size: (await window.hub.fs.stat(file).catch(() => null))?.size || null };
    const w = 72; const h = Math.max(2, Math.round((w * info.h) / (info.w || 1) / 2) * 2);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); const g = c.getContext('2d', { willReadFrequently: true });
    const seek = (t) => new Promise((res) => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = Math.max(0, Math.min(d - 0.03, t)); setTimeout(done, 3000); });
    const gray = () => { g.drawImage(v, 0, 0, w, h); const px = g.getImageData(0, 0, w, h).data; const out = new Uint8Array(w * h); for (let i = 0; i < out.length; i += 1) out[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0; return out; };
    const n = Math.max(6, Math.min(16, Math.round(d * 2))); const samples = []; let heat = null; let prev = null; let first = null;
    for (let i = 0; i < n; i += 1) {
      const t = (d * i) / n; await seek(t); const fr = gray(); if (!first) first = fr;
      heat = P.heatAdd(heat, fr, w, h);
      samples.push({ t: Math.round(t * 1000) / 1000, ...P.frameStats(fr, w, h), motion: prev ? P.diff(fr, prev) / Math.max(1, d / n * 30) : 0 }); prev = fr;
    }
    await seek(d - 0.03); const last = gray();
    const picks = P.pickCovers(samples, d, 6);
    const tc = Object.assign(document.createElement('canvas'), { width: 240, height: Math.round((240 * info.h) / (info.w || 1)) });
    for (const pk of picks) { await seek(pk.t); tc.getContext('2d').drawImage(v, 0, 0, tc.width, tc.height); pk.url = tc.toDataURL('image/jpeg', 0.75); }
    v.removeAttribute('src'); v.load();
    return { ok: true, local: true, hint, info, curve: [], loud: null, samples, heat, seam: P.seam(first, last, P.median(samples.slice(1).map((s) => s.motion))), covers: picks };
  }
  // the checks for the chosen platform (the zones differ per app)
  function checksFor(st) {
    const p = P.get(st.platform);
    const an = { loud: st.res.loud, seam: st.res.seam, under: st.res.heat ? P.underUI(st.res.heat, P.zonesFor(p.id, st.info.w && st.info.h ? st.info.w / st.info.h : p.ratio)) : null }; // (zones in the video's own picture)
    st.under = an.under || [];
    const list = P.check(p.id, st.info, an);
    for (const c of list) if (c.fix?.kind === 'loop' && window.PerfectLoop?.isLabRender?.(st)) c.fix = { ...c.fix, label: '∞ Render the scene as a perfect loop' }; // (round 31, perfectloop)
    if (st.res.local) list.push({ id: 'ffmpeg', level: 'tip', what: `Loudness, exact frame rate and bitrate need ffmpeg (${st.res.hint || 'install ffmpeg'}).` });
    return P.sortChecks(list);
  }

  // ---------- the panel ----------
  async function open(file, o = {}) {
    if (!file) throw new Error('Which video? Render one first (⇪), or pick a file.');
    if (cur) close();
    const plat = P.get(o.platform) ? o.platform : null;
    const st = cur = { file, o, platform: plat || store.get('publish.platform', 'shorts'), fixed: plat != null, draft: null, coverTitle: '', overlay: store.get('publish.overlay', true), dir: null, res: null, info: {}, checks: [] };
    const savedDrafts = store.get('publish.drafts', {});
    if (savedDrafts[file]) { st.draft = savedDrafts[file].draft; st.coverTitle = savedDrafts[file].coverTitle || ''; }
    buildDialog(st);
    st.ready = (async () => {
      try {
        st.res = await analyze(file);
        if (cur !== st) return st;
        st.info = st.res.info || {};
        if (!st.fixed) st.platform = P.guess(st.info, o.hint, store.get('publish.platform', null));
        st.draft = st.draft || P.localDraft(context({ ...o, file }), st.platform);
        st.coverT = st.res.covers?.[0]?.t ?? (st.info.duration || 0) * 0.3;
        paint(st);
        seekTo(st, st.coverT);
        if (o.autoDraft) await write(st).catch(() => null);
      } catch (err) {
        if (cur !== st) return st;
        st.error = err.message;
        paint(st);
      }
      emit('ready');
      return st;
    })();
    return st;
  }
  function close() { if (!cur) return; const st = cur; cur = null; try { st.video?.pause(); st.video?.removeAttribute('src'); st.video?.load(); } catch { /* gone */ } if (st.dlg?.open) st.dlg.close(); st.dlg?.remove(); emit('close'); }

  function buildDialog(st) {
    const dlg = el('dialog', { class: 'ui-modal pk-dialog', 'aria-label': 'Ready to post' });
    st.dlg = dlg;
    st.video = el('video', { class: 'pk-video', muted: true, playsInline: true, preload: 'auto', src: fileUrl(st.file), loop: true });
    st.zones = el('div', { class: 'pk-zones' });
    st.frame = el('div', { class: 'pk-frame', title: 'How the app frames it · ▦ shows where its buttons cover the video' }, st.video, st.zones);
    st.scrub = el('input', { type: 'range', class: 'pk-scrub', min: 0, max: 1, step: 0.001, value: 0, 'aria-label': 'Pick the cover frame' });
    st.time = el('span', { class: 'pk-time', text: '0:00' });
    const playBtn = el('button', { type: 'button', class: 'ghost small', text: '▶', title: 'Play / pause' });
    playBtn.addEventListener('click', () => { if (st.video.paused) { st.video.play().catch(() => {}); playBtn.textContent = '❚❚'; } else { st.video.pause(); playBtn.textContent = '▶'; } });
    st.overlayBtn = el('button', { type: 'button', class: `ghost small pk-ov${st.overlay ? ' on' : ''}`, text: '▦', title: 'Show / hide where the app\'s buttons sit' });
    st.overlayBtn.addEventListener('click', () => { st.overlay = !st.overlay; store.set('publish.overlay', st.overlay); paintFrame(st); });
    let raf = 0;
    st.scrub.addEventListener('input', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; seekTo(st, Number(st.scrub.value)); }); });
    st.video.addEventListener('seeked', () => { st.coverT = st.video.currentTime; paintTime(st); drawPreview(st); });
    st.video.addEventListener('timeupdate', () => { if (!st.video.paused) paintTime(st); });
    st.plats = el('div', { class: 'pk-plats', role: 'tablist' });
    st.side = el('div', { class: 'pk-side' }, el('div', { class: 'pk-wait', text: 'Checking the video…' }));
    st.status = el('span', { class: 'pk-status' });
    st.folderBtn = el('button', { type: 'button', class: 'ghost', text: PLAT === 'darwin' ? 'Show in Finder' : PLAT === 'win32' ? 'Show in Explorer' : 'Show in folder', disabled: true });
    st.folderBtn.addEventListener('click', () => st.dir && window.hub.fs.reveal(st.dir.text));
    st.makeBtn = el('button', { type: 'button', class: 'primary', text: '📁 Make the post folder', title: 'The video, the cover and a text file with the words, in one folder next to the video (nothing is uploaded)', disabled: true });
    st.makeBtn.addEventListener('click', () => makeFolder(st).catch((err) => toast(err.message, { type: 'error' })));
    dlg.append(
      el('div', { class: 'pk-head' }, el('h3', { text: '📮 Ready to post' }), el('span', { class: 'pk-file', text: base(st.file), title: st.file }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost small', text: '✕', title: 'Close', on: { click: () => close() } })),
      st.plats,
      el('div', { class: 'pk-main' },
        el('div', { class: 'pk-left' }, st.frame, el('div', { class: 'pk-bar' }, playBtn, st.scrub, st.time, st.overlayBtn))),
      el('div', { class: 'modal-actions pk-foot' }, st.status, el('span', { class: 'spacer' }), st.folderBtn, st.makeBtn));
    dlg.querySelector('.pk-main').append(st.side);
    dlg.addEventListener('close', () => { if (cur === st) close(); });
    dlg.addEventListener('keydown', (e) => { if (e.key === ' ' && !/^(INPUT|TEXTAREA|BUTTON|SUMMARY)$/.test(e.target.tagName) || (e.key === ' ' && e.target === st.scrub)) { e.preventDefault(); playBtn.click(); } });
    document.body.append(dlg);
    paintPlats(st); paintFrame(st);
    dlg.showModal();
  }
  function seekTo(st, t) {
    const d = st.info.duration || st.video.duration || 0;
    const v = Math.max(0, Math.min(Math.max(0, d - 0.02), Number(t) || 0));
    if (Math.abs(st.video.currentTime - v) > 0.001) st.video.currentTime = v; else { st.coverT = v; paintTime(st); drawPreview(st); }
  }
  function paintTime(st) {
    const d = st.info.duration || st.video.duration || 0; const t = st.video.currentTime || 0;
    if (d && Number(st.scrub.max) !== d) st.scrub.max = String(d);
    if (Math.abs(Number(st.scrub.value) - t) > 0.01) st.scrub.value = String(t);
    const s = `${P.mmss(t)}.${String(Math.floor((t % 1) * 10))} / ${P.mmss(d)}`;
    if (st.time.textContent !== s) st.time.textContent = s;
  }
  function paintPlats(st) {
    st.plats.replaceChildren(...P.PLATFORMS.map((p) => el('button', { type: 'button', role: 'tab', class: `sq-chip pk-plat${st.platform === p.id ? ' on' : ''}`, dataset: { plat: p.id }, title: p.tip, 'aria-selected': String(st.platform === p.id),
      on: { click: () => { st.platform = p.id; st.fixed = true; store.set('publish.platform', p.id); paintPlats(st); paint(st); } } }, el('span', { class: 'pk-pi', text: p.icon }), ` ${p.short}`)));
  }
  // the frame at the platform's shape (the video cropped like a vertical app crops, or letterboxed) + its zones
  function paintFrame(st) {
    const p = P.get(st.platform);
    st.frame.style.aspectRatio = `${p.w} / ${p.h}`;
    st.frame.dataset.fit = P.fitOf(p);
    st.overlayBtn.classList.toggle('on', st.overlay);
    const hits = new Set((st.under || []).map((u) => u.id));
    st.zones.hidden = !st.overlay;
    st.zones.replaceChildren(...p.zones.map((z) => el('div', { class: `pk-zone${hits.has(z.id) ? ' hit' : ''}`, title: `${p.short}: ${z.label}${hits.has(z.id) ? ' — detail sits here' : ''}`, style: { left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` } }, el('span', { text: z.label }))),
      ...(p.cover.grid ? [el('div', { class: 'pk-grid', title: 'Profile grid crop (3:4)', style: { top: `${(1 - (p.ratio / p.cover.grid)) * 50}%`, height: `${(p.ratio / p.cover.grid) * 100}%` } })] : []));
  }

  function paint(st) {
    if (cur !== st) return;
    paintPlats(st);
    if (st.error) { st.side.replaceChildren(el('div', { class: 'pk-err', text: `Couldn't check this video: ${st.error}` })); return; }
    if (!st.res) return;
    st.checks = checksFor(st);
    paintFrame(st);
    const p = P.get(st.platform);
    const v = P.verdict(st.checks);
    const fold = (id, title, body, openIt) => { const d = el('details', { class: `pk-sec pk-${id}`, open: openIt ?? store.get(`publish.open.${id}`, true) }, el('summary', { text: title }), body); d.addEventListener('toggle', () => store.set(`publish.open.${id}`, d.open)); return d; };
    // checks
    const seen = new Set(); // one button per fix (a 9:16 render fixes the shape, the pixels and the bitrate at once)
    const rows = st.checks.map((c) => el('div', { class: `pk-chk pk-${c.level}`, dataset: { check: c.id } }, el('span', { class: 'pk-ci', text: ICON[c.level] }), el('span', { class: 'pk-ct', text: c.what }),
      c.fix && !seen.has(`${c.fix.kind}:${c.fix.preset || ''}`) && seen.add(`${c.fix.kind}:${c.fix.preset || ''}`) ? el('button', { type: 'button', class: 'ghost small pk-fix', text: c.fix.label || 'Fix', on: { click: (e) => { e.currentTarget.disabled = true; fix(st, c).catch((err) => toast(err.message, { type: 'error' })); } } }) : null));
    // cover
    st.preview = el('canvas', { class: 'pk-cover-prev', width: 120, height: Math.round((120 * p.cover.h) / p.cover.w), title: 'The cover: the frame you\'re on, with your words' });
    const sugg = el('div', { class: 'pk-sugg' }, ...(st.res.covers || []).map((c, i) => el('button', { type: 'button', class: 'pk-thumb', title: `${P.mmss(c.t)}${c.why?.length ? ` · ${c.why.join(', ')}` : ''}`, dataset: { t: c.t }, on: { click: () => { st.video.pause(); seekTo(st, c.t); } } },
      (c.path || c.url) ? el('img', { src: c.url || fileUrl(c.path), alt: `Cover idea ${i + 1}`, draggable: false }) : el('span', { text: P.mmss(c.t) }))));
    const words = el('input', { class: 'pk-cover-words', value: st.coverTitle, placeholder: 'Words on the cover (optional)', maxLength: 80 });
    words.addEventListener('input', () => { st.coverTitle = words.value; saveDraft(st); drawPreview(st); });
    // words
    const c0 = st.draft || { title: '', description: '', hashtags: [] };
    const tIn = el('input', { class: 'pk-title', value: c0.title, placeholder: p.titleMax ? 'Title' : 'Hook (first line of the caption)', maxLength: 150 });
    const dIn = el('textarea', { class: 'pk-desc', rows: 3, value: c0.description, placeholder: 'Description' });
    const hIn = el('input', { class: 'pk-tags', value: (c0.hashtags || []).join(' '), placeholder: '#hashtags' });
    const count = el('small', { class: 'pk-count' });
    const upd = () => { st.draft = { title: tIn.value, description: dIn.value, hashtags: P.cleanTags(hIn.value) }; const cap = P.caption(st.draft, p.id); const n = p.titleMax ? `title ${tIn.value.length}/${p.titleMax} · ` : ''; const s = `${n}${cap.text.length}/${p.textMax} characters · ${st.draft.hashtags.length} hashtag${st.draft.hashtags.length === 1 ? '' : 's'}${p.tags.length ? ` (+ ${p.tags.join(' ')})` : ''}`; if (count.textContent !== s) count.textContent = s; count.classList.toggle('over', (p.titleMax && tIn.value.length > p.titleMax) || cap.text.length >= p.textMax); saveDraft(st); };
    for (const x of [tIn, dIn, hIn]) x.addEventListener('input', upd);
    st.inputs = { tIn, dIn, hIn, upd };
    const who = agentFor(st);
    st.writeBtn = el('button', { type: 'button', class: 'ghost small pk-write', text: who ? `✍ Write it with ${who.name}` : '✍ Write it', title: who ? `One short question to ${who.name} with the song, the scene and the platform (its tokens are shown after)` : 'No chat AI: plain words from the song and the scene' });
    st.writeBtn.addEventListener('click', () => write(st).catch((err) => toast(err.message, { type: 'error' })));
    st.by = el('small', { class: 'pk-by', text: st.by0 || '' });
    const copyBtn = el('button', { type: 'button', class: 'ghost small', text: 'Copy all', title: `Everything to paste into ${p.short}, in its order` });
    copyBtn.addEventListener('click', () => copyText(P.caption(st.draft, p.id).all, 'Post text copied').catch(() => toast('Couldn\'t copy', { type: 'error' })));
    st.side.replaceChildren(
      el('div', { class: `pk-verdict pk-v-${v.state}`, text: `${v.state === 'ready' ? '✓' : v.state === 'almost' ? '!' : '✕'} ${v.text} for ${p.name}` }),
      fold('checks', 'Checks', el('div', { class: 'pk-chks' }, ...rows), v.state !== 'ready' ? true : undefined),
      fold('cover', 'Cover', el('div', { class: 'pk-cover' }, el('div', { class: 'pk-cover-l' }, el('small', { class: 'pk-hint', text: 'The cover is the frame you\'re on: scrub, or pick an idea.' }), sugg, words), st.preview)),
      fold('words', 'Words', el('div', { class: 'pk-words' }, tIn, dIn, hIn, el('div', { class: 'pk-wrow' }, st.writeBtn, copyBtn, el('span', { class: 'spacer' }), count), st.by)));
    upd();
    drawPreview(st);
    st.makeBtn.disabled = false;
    setStatus(st, st.dir ? `📁 ${base(st.dir.folder)}` : `${p.cover.note}`);
  }
  const setStatus = (st, text) => { if (st.status.textContent !== text) st.status.textContent = text; };
  const saveDraft = debounce((st) => {
    const all = store.get('publish.drafts', {});
    all[st.file] = { draft: st.draft, coverTitle: st.coverTitle, at: Date.now() };
    const keep = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 30);
    store.set('publish.drafts', Object.fromEntries(keep));
  }, 600);

  // ---------- the cover ----------
  // the frame on screen, cropped to the cover's shape, with the words (big, white, outlined, inside the safe area)
  function drawCover(st, canvas) {
    const p = P.get(st.platform); const v = st.video;
    const W = canvas.width; const Hh = canvas.height; const g = canvas.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh);
    if (v.readyState >= 2 && v.videoWidth) {
      const k = Math.max(W / v.videoWidth, Hh / v.videoHeight); const dw = v.videoWidth * k; const dh = v.videoHeight * k;
      g.drawImage(v, (W - dw) / 2, (Hh - dh) / 2, dw, dh);
    }
    const words = String(st.coverTitle || '').trim();
    if (!words) return canvas;
    const maxW = W * (p.ratio < 1 ? 0.78 : 0.86);
    let size = Math.round(Math.min(W, Hh) * (p.ratio < 1 ? 0.13 : 0.15));
    const font = (s) => `900 ${s}px "Inter", "Helvetica Neue", "Segoe UI", Arial, sans-serif`;
    const wrap = (s) => { g.font = font(s); const out = []; let line = ''; for (const w of words.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };
    let lines = wrap(size);
    while ((lines.length > 3 || lines.some((l) => g.measureText(l).width > maxW)) && size > 12) { size = Math.round(size * 0.9); lines = wrap(size); }
    const lh = size * 1.05; const cy = Hh * (p.ratio < 1 ? 0.42 : 0.5);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    lines.forEach((l, i) => {
      const y = cy + (i - (lines.length - 1) / 2) * lh;
      g.lineWidth = Math.max(2, size * 0.14); g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(l.toUpperCase(), W / 2, y);
      g.fillStyle = '#fff'; g.fillText(l.toUpperCase(), W / 2, y);
    });
    return canvas;
  }
  const drawPreview = (st) => { if (st.preview && cur === st) drawCover(st, st.preview); };
  const seekExact = (st, t) => new Promise((res) => {
    const v = st.video; if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) { res(); return; }
    const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 4000);
  });
  async function coverBytes(st) {
    const p = P.get(st.platform);
    st.video.pause();
    await seekExact(st, st.coverT || 0);
    const c = drawCover(st, Object.assign(document.createElement('canvas'), { width: p.cover.w, height: p.cover.h }));
    let q = 0.92; let blob = null;
    for (let i = 0; i < 5; i += 1) { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); if (!p.cover.maxBytes || (blob && blob.size <= p.cover.maxBytes)) break; q -= 0.12; }
    if (!blob) throw new Error('Couldn\'t draw the cover');
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ---------- the words (the chat's AI, on a click or the mission) ----------
  function agentFor(st) {
    try {
      const ids = [st.o.agentId, H.activeId].filter(Boolean);
      for (const id of ids) { const a = H.agent(id); if (a && a.mode === 'native') return a; }
      return H.claudeAgent?.() || null;
    } catch { return null; }
  }
  async function write(st) {
    const p = P.get(st.platform);
    const ctx = context({ ...st.o, file: st.file });
    const agent = agentFor(st);
    const local = () => { st.draft = P.localDraft(ctx, p.id); fill(st); };
    if (!agent) { local(); toast('No chat AI to ask: plain words from the song and the scene instead.', { timeout: 3000 }); return st.draft; }
    if (st.writeBtn) { st.writeBtn.disabled = true; st.writeBtn.textContent = `✍ ${agent.name} is writing…`; }
    try {
      const r = await window.hub.askOnce({ agentId: agent.id, text: P.draftPrompt(ctx, p.id), options: { lean: true, persona: PERSONA, ...(agent.engine === 'codex' ? { effort: 'minimal', verbosity: 'low' } : {}) } }).catch((err) => ({ ok: false, error: err.message }));
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: r.usage, source: 'publishkit' } }));
      const d = r?.ok ? P.parseDraft(r.text) : null;
      if (!d || (!d.title && !d.description)) { local(); toast(`${agent.name} didn't answer${r?.error ? ` (${String(r.error).slice(0, 80)})` : ''}: plain words instead.`, { timeout: 4000 }); return st.draft; }
      st.draft = { title: d.title, description: d.description, hashtags: d.hashtags.length ? d.hashtags : P.localDraft(ctx, p.id).hashtags };
      const tokens = (r.usage?.input || 0) + (r.usage?.output || 0);
      st.by0 = `Written by ${agent.name}${tokens ? ` · ${tokens.toLocaleString()} tokens` : ''}. Edit freely.`;
      fill(st);
      return st.draft;
    } finally { if (st.writeBtn) { st.writeBtn.disabled = false; st.writeBtn.textContent = `✍ Write it with ${agent.name}`; } }
  }
  function fill(st) {
    if (cur !== st || !st.inputs) return;
    const { tIn, dIn, hIn, upd } = st.inputs;
    tIn.value = st.draft.title || ''; dIn.value = st.draft.description || ''; hIn.value = (st.draft.hashtags || []).join(' ');
    if (st.by) st.by.textContent = st.by0 || '';
    upd();
  }

  // ---------- fixes (a better copy through the render queue; the kit checks it when it's done) ----------
  async function fix(st, c) {
    const p = P.get(st.platform); const f = c.fix; const file = st.file;
    // (round 31, perfectloop) a Lab render: the scene is rendered again as a perfect loop (its clock wraps) instead of
    // blending the file's end into its start
    if (f.kind === 'loop' && window.PerfectLoop?.isLabRender?.(st)) {
      setStatus(st, '∞ Rendering the scene again as a perfect loop… (the render queue); the kit checks it when it\'s done.');
      emit('fixing');
      const r = await PerfectLoop.forPost(st).catch((err) => ({ error: err.message }));
      if (r?.path && cur === st) { toast(`📮 The perfect loop is ready: checking ${base(r.path)}`, { timeout: 3000 }); await reopen(st, r.path); } else if (r?.error && cur === st) { setStatus(st, `✕ ${r.error}`); paint(st); }
      return r;
    }
    if (typeof Renders === 'undefined') await window.Lazy?.load?.('renders');
    let id = null; let label = f.label;
    if (f.kind === 'render') {
      const j = Renders.enqueue({ input: file, preset: f.preset, opts: { quality: 'high', ...(st.info.duration > p.maxLen ? { to: p.maxLen } : {}) }, title: `📮 ${p.short} · ${stemOf(file)}` });
      id = j.id;
    } else {
      const d = st.info.duration || 0;
      const made = f.kind === 'loudness' ? { args: P.loudArgs(p.lufs), duration: d, tag: `${p.lufs} LUFS` }
        : f.kind === 'trim' ? { args: P.trimArgs(f.to), duration: Math.min(d, f.to), tag: P.mmss(f.to).replace(':', 'm') }
          : f.kind === 'loop' ? { ...P.loopArgs(d, { audio: Boolean(st.info.audio) }), tag: 'loop' } : null;
      if (!made) return;
      const output = await nextFree(join(dirOf(file), `${stemOf(file)} (${made.tag}).mp4`));
      id = `pk${Date.now().toString(36)}`;
      await Renders.transcode({ id, input: file, output, args: made.args, duration: made.duration }, undefined, { title: `📮 ${label} · ${stemOf(file)}`, owner: 'publishkit' });
    }
    setStatus(st, `⇪ ${label}… (the render queue, bottom of the rail); the kit checks the new copy when it's done.`);
    emit('fixing');
    const r = await Renders.whenDone(id);
    if (r.code !== 0) { if (cur === st) { setStatus(st, `✕ ${label}: ${r.error || 'it stopped'}`); paint(st); } return r; }
    if (cur === st) { toast(`📮 The fixed copy is ready: checking ${base(r.output)}`, { timeout: 3000 }); await reopen(st, r.output); }
    return r;
  }
  // the same kit on another file (a fixed copy): the platform, the words and the cover words stay
  async function reopen(st, file) {
    const keep = { platform: st.platform, draft: st.draft, coverTitle: st.coverTitle, by0: st.by0 };
    const n = await open(file, { ...st.o, platform: keep.platform, autoDraft: false });
    n.draft = keep.draft; n.coverTitle = keep.coverTitle; n.by0 = keep.by0;
    await n.ready;
    if (cur === n) { paint(n); }
    return n;
  }

  // ---------- the post folder ----------
  async function makeFolder(st) {
    if (!st.res) throw new Error('Still checking the video');
    const p = P.get(st.platform);
    st.makeBtn.disabled = true;
    try {
      const at = new Date();
      const title = st.draft?.title || stemOf(st.file);
      const folder = await nextFree(join(dirOf(st.file), 'posts', P.folderName(title, p.id, at)));
      const ext = (base(st.file).match(/\.[^.]+$/) || ['.mp4'])[0].toLowerCase();
      const video = join(folder, `${P.safeName(title)}${ext}`);
      setStatus(st, '📁 Copying the video…');
      await window.hub.fs.copy(st.file, video);
      const cover = join(folder, p.id === 'youtube' ? 'thumbnail.jpg' : 'cover.jpg');
      await window.hub.fs.write(cover, await coverBytes(st));
      const text = join(folder, 'post.txt');
      await window.hub.fs.write(text, P.postText({ draft: st.draft, platformId: p.id, video: base(video), cover: base(cover), checks: st.checks, at }));
      st.dir = { folder, video, cover, text };
      st.folderBtn.disabled = false;
      setStatus(st, `📁 ${base(folder)}`);
      const posts = [{ folder, platform: p.id, at: at.getTime(), from: st.file }, ...store.get('publish.posts', []).filter((x) => x.folder !== folder)].slice(0, 40);
      store.set('publish.posts', posts);
      toast(`📁 Post folder ready: ${base(folder)}`, { timeout: 6000, action: { label: st.folderBtn.textContent, fn: () => window.hub.fs.reveal(text) } });
      emit('folder');
      return st.dir;
    } finally { st.makeBtn.disabled = false; }
  }

  // ---------- from anywhere: the newest finished video, the mission, chat ----------
  const isVideo = (p) => /\.(mp4|mov|m4v|webm)$/i.test(String(p || ''));
  function latest() {
    if (typeof Renders === 'undefined') return null;
    const all = [...Renders.list(), ...Renders.history()].filter((j) => j.status === 'done' && isVideo(j.output) && !j.trashed).sort((a, b) => (b.ended || 0) - (a.ended || 0));
    return all[0] || null;
  }
  async function pickFile() {
    const ps = await window.hub.openDialog({ title: 'Get a video ready to post', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm'] }] });
    return ps?.[0] || null;
  }
  // the mission (◎ "Get it ready to post"): the newest render (or a path in the message), its words written by this
  // chat's AI right away (the message asked for it)
  async function mission(agentId, text = '') {
    const path = (String(text).match(/(?:^|\s)((?:[A-Za-z]:\\|\/|~\/)[^\n]*?\.(?:mp4|mov|m4v|webm))\b/i) || [])[1];
    const j = path ? null : latest();
    const file = path || j?.output || await pickFile();
    if (!file) { toast('Nothing rendered yet: render the video first (⇪ Render…), then get it ready to post.', { timeout: 5000, action: { label: '⇪ Render…', fn: () => Renders?.panel?.({ presets: ['vertical'] }) } }); return null; }
    const named = /\b(tik ?tok|reels?|insta(gram)?|square|shorts?|youtube|16:9|1:1)\b/i.test(text) ? P.guess({}, text) : null;
    return open(file, { agentId, hint: text, job: j, platform: named, autoDraft: true });
  }
  function summary(st) {
    if (st.error) return `Couldn't check ${base(st.file)}: ${st.error}`;
    const p = P.get(st.platform); const v = P.verdict(st.checks);
    return `📮 **${base(st.file)}** for ${p.name}: ${v.text}.\n${st.checks.filter((c) => c.level !== 'ok').map((c) => `- ${ICON[c.level]} ${c.what}${c.fix ? ` (fix: ${c.fix.label})` : ''}`).join('\n') || '- ✓ every check passes'}\nCover ideas at ${(st.res?.covers || []).map((c) => P.mmss(c.t)).join(', ') || '—'}. The panel is open: pick the cover, edit the words, 📁 Make the post folder.`;
  }

  // ---------- registration (Ctrl/⌘+K, /post) ----------
  function register() {
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Get a render ready to post (Shorts, TikTok, Reels…)', () => { const j = latest(); (j ? Promise.resolve(j.output) : pickFile()).then((f) => f && open(f, { job: j })).catch((err) => toast(err.message, { type: 'error' })); });
    if (typeof Commands === 'undefined' || Commands.get('post')) return;
    const words = P.PLATFORMS.map((p) => p.id);
    Commands.register({
      name: 'post', aliases: ['ready-to-post'], area: 'Video', args: '[last | <video path>] [shorts|tiktok|reels|youtube|square]',
      desc: 'Ready to post: checks a finished video for a platform (size, length, loudness, what the app\'s buttons cover, the loop), cover ideas, the words; makes a tidy post folder. Never uploads.',
      keywords: 'post publish shorts tiktok reels instagram youtube square cover thumbnail hashtags caption title safe area loudness loop',
      examples: ['/post', '/post tiktok', '/post /path/to/video.mp4 reels'],
      complete: () => [...words.map((w) => ({ value: w, hint: P.get(w).name })), { value: 'last', hint: 'the newest finished render' }],
      async run(args, ctx) {
        const a = String(args || '').trim();
        const path = (a.match(/((?:[A-Za-z]:\\|\/|~\/)\S.*?\.(?:mp4|mov|m4v|webm))\b/i) || [])[1];
        const plat = words.find((w) => new RegExp(`\\b${w}\\b`, 'i').test(a)) || (/\breels?\b/i.test(a) ? 'reels' : /\bshorts?\b/i.test(a) ? 'shorts' : null);
        const j = path ? null : latest();
        const file = path || j?.output;
        if (!file) return 'Nothing rendered yet: render a video first (⇪ Render… or /renders render reels), or give a path: /post /path/to/video.mp4';
        const st = await open(file, { agentId: ctx?.agentId, job: j, platform: plat });
        await st.ready;
        return summary(st);
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();

  return { open, close, mission, latest, write, fix, makeFolder, summary, drawCover, get current() { return cur; }, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, core: P };
})();
window.PublishKit = PublishKit;
