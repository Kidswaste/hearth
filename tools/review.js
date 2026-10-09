// Video Review: the render library (After Effects renders, Lab recordings, anything in the watched folders),
// a frame-accurate player with A/B compare, social safe zones, waveform + beats, scopes, and timecoded notes
// with drawings that go to the Video Director (or Claude / Astra) as feedback. Pure helpers live in
// tools/video-data.js (VideoData), chat commands in tools/video-cmds.js, styles in tools/video.css.
const Review = (() => {
  const V = VideoData;
  const VIDEO_RE = '\\.(mp4|m4v|mov|webm|mkv|gif)$';
  const FPS_CHOICES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
  const SHUTTLE = [1, 2, 4, 8];
  const IS_MAC = /Mac/.test(navigator.platform);
  const MOD = IS_MAC ? '⌘' : 'Ctrl';
  const fileUrl = (p) => `file:///${p.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
  const base = (p) => String(p).split(/[\\/]/).pop();
  const sep = (p) => (String(p).includes('\\') && !String(p).startsWith('/') ? '\\' : '/');
  const dirOf = (p) => String(p).slice(0, Math.max(String(p).lastIndexOf('\\'), String(p).lastIndexOf('/')));
  const join = (...parts) => parts.join(sep(parts[0]));
  const noExt = (name) => name.replace(/\.[^.]+$/, '');
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // ---------- state ----------
  const S = {
    videos: [], // { path, size, mtime, lab? }
    cur: null,
    notes: {}, // path -> [{ id, t, text, cat, done, frame, color, draw, by, at }]
    lib: { fav: [], tags: {}, recordings: [], exports: [] }, // favorites, tags, Lab recordings and exports saved anywhere
    meta: {}, // path -> { mtime, w, h, d, fps, codec }
    fps: store.get('review.fps', 30), fpsSource: 'default',
    loop: { a: null, b: null, on: true },
    cmp: { path: null, mode: store.get('review.cmpMode', 'wipe'), wipe: 0.5, offset: 0 },
    overlay: { guide: '', safe: '', crop: null, cropOffset: 0.5 },
    zoom: { s: 1, x: 0, y: 0 },
    draw: { on: false, tool: store.get('review.drawTool', 'arrow'), color: store.get('review.drawColor', '#ff3b5c') },
    pick: false, picked: null, scopes: false,
    view: '', mirror: false, pingpong: false, timeMode: store.get('review.timeMode', 'tc'), // channel view, flipped view, loop style, tc | sec | frames
    filter: { fmt: 'all', fav: false, notes: false, lab: false, dur: 'any', date: 'any', project: '', sort: store.get('review.sort', 'new'), group: store.get('review.group', true), q: '' },
    shuttle: 0, compose: null, selNote: null, hideDone: store.get('review.hideDone', false), catFilter: '',
    audio: null, // analysis of the open file (peaks, beats, drops, bpm)
    strip: [], // filmstrip frames of the open file [{ t, url }]
    tools: null, // { ffmpeg, ffprobe }
  };
  const refs = {};
  const listeners = {};
  const on = (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; };
  const emit = (ev, data) => { for (const fn of listeners[ev] || []) { try { fn(data); } catch (err) { console.error(err); } } };
  const tc = (sec) => V.tc(sec, S.fps);
  const vid = () => refs.video;
  const dur = () => vid()?.duration || 0;
  const frameNow = () => V.frameAt(vid()?.currentTime || 0, S.fps);
  // While clips are being edited (tools/video-cut.js, E) the transport drives the edit instead of the source.
  const VC = () => (typeof VideoCut !== 'undefined' ? VideoCut : null);
  const Cut = () => (VC()?.active ? VideoCut : null);

  // ---------- persistence ----------
  const saveNotes = debounce(() => window.hub.kvSet('video-notes', S.notes), 300);
  const saveLib = debounce(() => window.hub.kvSet('video-library', S.lib), 300);
  const saveMeta = debounce(() => window.hub.kvSet('video-meta', S.meta), 2000);
  const notesOf = (p = S.cur?.path) => (p ? (S.notes[p] ||= []) : []);
  // Older notes were { t, text, frame, color }: give them ids and categories.
  function upgradeNotes() {
    for (const list of Object.values(S.notes)) for (const n of list) { n.id ||= uid(); n.cat ||= V.guessCategory(n.text); if (/^Claude: /.test(n.text) && !n.by) { n.by = 'director'; n.text = n.text.slice(8); } }
  }

  // ---------- folders + scanning ----------
  async function videoDirs() {
    const home = await window.hub.fs.home();
    if (H.settings().videoDirs?.length) return H.settings().videoDirs;
    // Where After Effects scripts write renders; game captures (Videos, Discord clips) stay out unless added.
    return IS_MAC ? [join(home, 'Desktop'), join(home, 'Documents', 'Codex'), join(home, 'Movies', 'Hearth')] : [join(home, 'Desktop'), join(home, 'Documents', 'Codex')];
  }
  async function scan() {
    const found = [];
    for (const dir of await videoDirs()) {
      try {
        const list = await window.hub.fs.list(dir, { recursive: true, depth: 6, match: VIDEO_RE, skipDirs: ['node_modules', '.git', '_harness', 'Logs', 'Discord Clips', 'Captures', 'Library'] });
        found.push(...list.filter((f) => f.size > 1024));
      } catch { /* folder may not exist */ }
    }
    // Lab recordings are saved wherever you pick, so they're remembered by path.
    // Exports made here are remembered the same way (they may sit outside the watched folders).
    const rec = [];
    for (const [key, lab] of [['recordings', true], ['exports', false]]) {
      const keep = [];
      for (const p of S.lib[key]) {
        const st = await window.hub.fs.stat(p);
        if (st) { rec.push({ path: p, name: base(p), size: st.size, mtime: st.mtime, lab, exported: !lab }); keep.push(p); }
      }
      if (keep.length !== S.lib[key].length) { S.lib[key] = keep; saveLib(); }
    }
    const seen = new Set();
    const labSet = new Set(S.lib.recordings);
    return [...rec, ...found].filter((f) => !seen.has(f.path) && seen.add(f.path)).map((f) => ({ ...f, lab: f.lab || labSet.has(f.path) || (!f.exported && /\s\d{3,4}x\d{3,4}\.(mp4|webm)$/i.test(f.name || base(f.path))) }))
      .sort((a, b) => b.mtime - a.mtime).slice(0, 800);
  }

  // Live refresh: watch each folder that holds renders (plus the roots); a periodic rescan catches the rest.
  let watched = [];
  async function watchFolders() {
    for (const id of watched) window.hub.fs.unwatch(id);
    watched = [];
    const dirs = new Set(await videoDirs());
    for (const v of S.videos.slice(0, 200)) dirs.add(dirOf(v.path));
    let i = 0;
    for (const d of [...dirs].slice(0, 40)) {
      const id = `vr:${i += 1}`;
      // a default folder that doesn't exist (no Documents/Codex) is skipped quietly instead of logging a main-process error
      if (!(await window.hub.fs.stat(d).catch(() => null))?.isDir) continue;
      try { await window.hub.fs.watch(id, d); watched.push(id); } catch { /* missing folder */ }
    }
  }
  window.hub.fs.onChanged?.(({ id }) => { if (String(id).startsWith('vr:')) refreshSoon(); });
  const refreshSoon = debounce(() => { if (refs.list) load(); }, 1200);

  // ---------- metadata, thumbnails, hover strips (one hidden decoder, on demand) ----------
  const thumbs = new Map(); // path|mtime -> dataURL
  const hoverStrips = new Map(); // path|mtime -> [dataURL]
  const jobs = [];
  let busy = false;
  const keyOf = (v) => `${v.path}|${v.mtime}`;
  function metaOf(v) { const m = S.meta[v.path]; return m && m.mtime === v.mtime ? m : null; }
  function enqueue(job, front = false) { if (front) jobs.unshift(job); else jobs.push(job); pump(); }
  async function openDecoder(path) {
    const d = document.createElement('video');
    d.muted = true; d.preload = 'auto'; d.src = fileUrl(path);
    await new Promise((res, rej) => { d.onloadedmetadata = res; d.onerror = () => rej(new Error('This file can\'t be decoded here (ProRes / some .mov need a playable copy: ⋯ → Make a playable copy).')); setTimeout(() => rej(new Error('Timed out loading the video')), 15000); });
    const at = (t) => new Promise((res, rej) => { d.onseeked = res; d.currentTime = clamp(t, 0, Math.max(0, d.duration - 0.01)); setTimeout(() => rej(new Error('Seek timed out')), 8000); });
    const close = () => { d.removeAttribute('src'); d.load(); };
    return { d, at, close };
  }
  const snap = (d, w) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * (d.videoHeight / d.videoWidth || 0.5625)); c.getContext('2d').drawImage(d, 0, 0, c.width, c.height); return c; };
  function rememberMeta(v, d) {
    S.meta[v.path] = { ...(S.meta[v.path] || {}), mtime: v.mtime, w: d.videoWidth, h: d.videoHeight, d: Number(d.duration.toFixed(3)) };
    saveMeta();
  }
  async function pump() {
    if (busy || !jobs.length) return;
    busy = true;
    const job = jobs.shift();
    try {
      if (job.kind === 'thumb' && job.img.isConnected && !thumbs.has(keyOf(job.v))) {
        const { d, at, close } = await openDecoder(job.v.path);
        rememberMeta(job.v, d);
        await at(Math.min(1.5, (d.duration || 2) * 0.15));
        thumbs.set(keyOf(job.v), snap(d, 240).toDataURL('image/jpeg', 0.72));
        close();
      } else if (job.kind === 'meta' && !metaOf(job.v)) {
        const d = document.createElement('video');
        d.preload = 'metadata'; d.muted = true; d.src = fileUrl(job.v.path);
        await new Promise((res, rej) => { d.onloadedmetadata = res; d.onerror = rej; setTimeout(rej, 6000); });
        rememberMeta(job.v, d);
        d.removeAttribute('src'); d.load();
      } else if (job.kind === 'strip' && !hoverStrips.has(keyOf(job.v))) {
        const { d, at, close } = await openDecoder(job.v.path);
        const frames = [];
        for (let i = 0; i < 8; i += 1) { await at((d.duration * (i + 0.5)) / 8); frames.push(snap(d, 200).toDataURL('image/jpeg', 0.62)); }
        hoverStrips.set(keyOf(job.v), frames);
        close();
      }
    } catch { job.img?.classList.add('nothumb'); }
    job.done?.();
    busy = false;
    pump();
  }

  // ---------- library ----------
  const projectOf = (v) => base(dirOf(v.path));
  const fmtOf = (v) => { const m = metaOf(v); return m ? V.aspectOf(m.w, m.h) : null; };
  const isFav = (p) => S.lib.fav.includes(p);
  const tagsOf = (p) => S.lib.tags[p] || [];
  const groupKey = (v) => `${dirOf(v.path)}|${V.versionInfo(base(v.path)).stem}`;
  const versionsOf = (v) => S.videos.filter((x) => groupKey(x) === groupKey(v)).sort((a, b) => (V.versionInfo(base(b.path)).ver ?? 0) - (V.versionInfo(base(a.path)).ver ?? 0) || b.mtime - a.mtime);
  function verLabel(v, list = versionsOf(v)) {
    const n = V.versionInfo(base(v.path)).ver;
    if (n != null) return `v${n}`;
    const i = list.findIndex((x) => x.path === v.path);
    return i <= 0 ? 'latest' : `−${i}`;
  }
  function filtered() {
    const f = S.filter;
    const q = f.q.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    let list = S.videos.filter((v) => {
      if (f.fav && !isFav(v.path)) return false;
      if (f.lab && !v.lab) return false;
      if (f.notes && !notesOf(v.path).some((n) => !n.done)) return false;
      if (f.project && projectOf(v) !== f.project) return false;
      if (f.date !== 'any' && Date.now() - v.mtime > { today: 86400e3, week: 7 * 86400e3, month: 31 * 86400e3 }[f.date]) return false;
      const m = metaOf(v);
      if (f.fmt !== 'all') { if (!m) return false; if (V.aspectOf(m.w, m.h) !== f.fmt) return false; }
      if (f.dur !== 'any') { if (!m) return false; const d = m.d; if (f.dur === 'short' ? d >= 15 : f.dur === 'mid' ? d < 15 || d > 60 : d <= 60) return false; }
      if (words.length) {
        const hay = `${v.path} ${tagsOf(v.path).map((t) => `#${t}`).join(' ')} ${m ? `${m.w}x${m.h} ${V.aspectOf(m.w, m.h)}` : ''} ${v.lab ? 'lab' : ''}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const by = {
      new: (a, b) => b.mtime - a.mtime, old: (a, b) => a.mtime - b.mtime, name: (a, b) => base(a.path).localeCompare(base(b.path), undefined, { numeric: true }),
      long: (a, b) => (metaOf(b)?.d || 0) - (metaOf(a)?.d || 0), short: (a, b) => (metaOf(a)?.d || 1e9) - (metaOf(b)?.d || 1e9),
      size: (a, b) => b.size - a.size, notes: (a, b) => notesOf(b.path).length - notesOf(a.path).length,
    }[f.sort] || ((a, b) => b.mtime - a.mtime);
    list.sort(by);
    if (f.group && !words.length) {
      const seen = new Map();
      list = list.filter((v) => { const k = groupKey(v); if (seen.has(k)) { seen.set(k, seen.get(k) + 1); return false; } seen.set(k, 1); return true; });
      list.counts = seen;
    }
    // favorites float to the top
    return list.sort((a, b) => Number(isFav(b.path)) - Number(isFav(a.path)));
  }
  // Filtering by format or length needs every file's size: read the missing ones in the background.
  function needMeta() { for (const v of S.videos) if (!metaOf(v)) enqueue({ kind: 'meta', v, done: debounce(renderLibrary, 400) }); }

  let io = null;
  function renderLibrary() {
    if (!refs.list) return;
    const list = filtered();
    io?.disconnect();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); const v = S.videos.find((x) => x.path === e.target.dataset.path); if (v) thumbFor(v, e.target); }
    }, { root: refs.list });
    refs.count.textContent = `${list.length}${list.length !== S.videos.length ? ` / ${S.videos.length}` : ''}`;
    refs.list.replaceChildren(...(list.length ? list.map((v) => card(v, list.counts?.get(groupKey(v)) || 1)) : [el('p', { class: 'hint vr-empty', text: S.videos.length ? 'Nothing matches these filters.' : 'No videos yet. Renders saved to your watched folders and Lab recordings show up here by themselves (⋯ → Watched folders).' })]));
    for (const chip of refs.chips.querySelectorAll('[data-f]')) chip.classList.toggle('on', chipOn(chip.dataset.f));
  }
  const chipOn = (f) => (f === 'all' ? S.filter.fmt === 'all' && !S.filter.fav && !S.filter.notes && !S.filter.lab : f === 'fav' ? S.filter.fav : f === 'notes' ? S.filter.notes : f === 'lab' ? S.filter.lab : S.filter.fmt === f);
  function thumbFor(v, img) {
    if (thumbs.has(keyOf(v))) { img.src = thumbs.get(keyOf(v)); return; }
    enqueue({ kind: 'thumb', v, img, done: () => { if (thumbs.has(keyOf(v))) img.src = thumbs.get(keyOf(v)); updateCardMeta(v, img.closest('.vr-card')); } });
  }
  function cardMeta(v) {
    const m = metaOf(v);
    return [m?.w ? `${m.w}×${m.h}` : null, fmtDur(m?.d), timeAgo(v.mtime)].filter(Boolean).join(' · ');
  }
  function updateCardMeta(v, node) {
    if (!node) return;
    node.querySelector('.vr-card-meta').textContent = cardMeta(v);
    const f = fmtOf(v);
    const badge = node.querySelector('.vr-fmt');
    if (badge && f) { badge.textContent = f === 'other' ? '' : f; badge.dataset.fmt = f; }
  }
  function card(v, count) {
    const img = el('img', { class: 'vr-thumb', dataset: { path: v.path }, alt: '' });
    io.observe(img);
    const open = notesOf(v.path).filter((n) => !n.done).length;
    const f = fmtOf(v);
    const scrubBar = el('span', { class: 'vr-scrubbar' });
    const node = el('button', {
      class: `vr-card${S.cur?.path === v.path ? ' on' : ''}${S.cmp.path === v.path ? ' is-b' : ''}`, title: v.path, dataset: { path: v.path }, draggable: true,
      on: {
        // drag a card onto the clip track (✂) to add it to the cut
        dragstart: (e) => { e.dataTransfer.setData('text/x-hearth-video', v.path); e.dataTransfer.setData('text/plain', v.path); e.dataTransfer.effectAllowed = 'copy'; },
        // the list re-renders (this card is replaced): keep the keyboard on the player so Space / arrows work at once
        click: (e) => { if (e.altKey || e.shiftKey) compareWith(v.path); else openVideo(v); refs.root.classList.remove('lib-open'); refs.root.focus({ preventScroll: true }); },
        contextmenu: (e) => { e.preventDefault(); cardMenu(v, e.clientX, e.clientY); },
        // Hovering scrubs through 8 frames of the clip.
        pointermove: (e) => {
          const frames = hoverStrips.get(keyOf(v));
          const r = img.getBoundingClientRect();
          const x = clamp((e.clientX - r.left) / r.width, 0, 0.999);
          scrubBar.style.transform = `scaleX(${x.toFixed(3)})`; // a transform: no layout per pointer move
          if (frames) { const src = frames[Math.floor(x * frames.length)]; if (img.getAttribute('src') !== src) img.src = src; }
          else if (!node.dataset.asked) { node.dataset.asked = '1'; enqueue({ kind: 'strip', v }, true); }
        },
        pointerleave: () => { scrubBar.style.transform = ''; if (thumbs.has(keyOf(v)) && img.getAttribute('src') !== thumbs.get(keyOf(v))) img.src = thumbs.get(keyOf(v)); },
      },
    },
    el('span', { class: 'vr-thumb-wrap' }, img, scrubBar,
      el('span', { class: 'vr-fmt', dataset: { fmt: f || '' }, text: f && f !== 'other' ? f : '' }),
      open ? el('span', { class: 'vr-badge', text: `✎ ${open}` }) : null,
      Date.now() - v.mtime < 3600e3 ? el('span', { class: 'vr-new', text: 'NEW' }) : null,
      v.lab ? el('span', { class: 'vr-lab', text: 'LAB', title: 'Recorded in the Three.js Lab' }) : null,
      VC()?.hasCut(v.path) ? el('span', { class: 'vr-cutb', text: '✂', title: 'Has a cut (E opens it)' }) : null),
    el('span', { class: 'vr-card-text' },
      el('b', { class: 'vr-card-name' }, isFav(v.path) ? el('span', { class: 'vr-star', text: '★ ' }) : null, base(v.path)),
      el('span', { class: 'vr-card-meta', text: cardMeta(v) }),
      count > 1 ? el('span', { class: 'vr-vers', text: `${verLabel(v)} · ${count} versions`, title: 'Versions of this render (same folder, same name)' }) : null,
      tagsOf(v.path).length ? el('span', { class: 'vr-tags', text: tagsOf(v.path).map((t) => `#${t}`).join(' ') }) : null));
    return node;
  }
  function cardMenu(v, x, y) {
    const items = [
      { label: '▶ Open', action: () => openVideo(v) },
      S.cur && S.cur.path !== v.path ? { label: 'Compare with the open video (B)', action: () => compareWith(v.path) } : null,
      { label: isFav(v.path) ? '☆ Remove from favorites' : '★ Favorite', action: () => toggleFav(v.path) },
      { label: 'Tags…', action: () => editTags(v.path) },
      { label: 'Export for social…', action: async () => { await openVideo(v); exportMenu(); } },
      VC() && S.cur && S.cur.path !== v.path ? { label: '✂ Add to the cut of the open video', action: async () => { if (!VideoCut.active) await VideoCut.enter(); VideoCut.addClip(v.path); } } : null,
      S.tools?.ffmpeg ? { label: 'Make a playable copy (H.264 proxy)', action: () => runExport('proxy', { path: v.path }) } : null,
      { label: IS_MAC ? 'Show in Finder' : 'Show in folder', action: () => window.hub.fs.reveal(v.path) },
      { label: 'Open in default player', action: () => window.hub.fs.open(v.path) },
      { label: 'Copy path', action: () => copyText(v.path, 'Path copied') },
      v.lab ? { label: 'Forget this Lab recording', action: () => { S.lib.recordings = S.lib.recordings.filter((p) => p !== v.path); saveLib(); load(); } } : null,
      { label: 'Move to Trash…', danger: true, action: async () => { if (await Modal.confirm('Move to Trash?', base(v.path), { ok: 'Move to Trash', danger: true })) { await window.hub.fs.trash([v.path]); load(); } } },
    ].filter(Boolean);
    showMenu(x, y, items);
  }
  function toggleFav(p = S.cur?.path) {
    if (!p) return false;
    S.lib.fav = isFav(p) ? S.lib.fav.filter((x) => x !== p) : [...S.lib.fav, p];
    saveLib(); renderLibrary(); renderTop();
    return isFav(p);
  }
  function setTags(p, tags) {
    const clean = [...new Set(tags.map((t) => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))];
    if (clean.length) S.lib.tags[p] = clean; else delete S.lib.tags[p];
    saveLib(); renderLibrary();
    return clean;
  }
  async function editTags(p = S.cur?.path) {
    if (!p) return;
    const v = await Modal.prompt('Tags', { value: tagsOf(p).join(' '), label: 'Space-separated, e.g. "client draft reels". Search them with #tag.' });
    if (v != null) setTags(p, v.split(/[\s,]+/));
  }
  function setFilter(patch) {
    Object.assign(S.filter, patch);
    if ('sort' in patch) store.set('review.sort', S.filter.sort);
    if ('group' in patch) store.set('review.group', S.filter.group);
    if (S.filter.fmt !== 'all' || S.filter.dur !== 'any' || ['long', 'short'].includes(S.filter.sort)) needMeta();
    renderLibrary();
  }
  function sortMenu(e) {
    const f = S.filter;
    const projects = [...new Set(S.videos.map(projectOf))].sort();
    const chk = (b) => (b ? '✓ ' : '   ');
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, [
      ...[['new', 'Newest first'], ['old', 'Oldest first'], ['name', 'Name'], ['long', 'Longest'], ['short', 'Shortest'], ['size', 'Biggest file'], ['notes', 'Most notes']].map(([k, l]) => ({ label: `${chk(f.sort === k)}Sort: ${l}`, action: () => setFilter({ sort: k }) })),
      { label: `${chk(f.group)}Group versions (v1, v2…) into one card`, action: () => setFilter({ group: !f.group }) },
      ...[['any', 'Any length'], ['short', 'Under 15 s'], ['mid', '15–60 s'], ['long', 'Over a minute']].map(([k, l]) => ({ label: `${chk(f.dur === k)}${l}`, action: () => setFilter({ dur: k }) })),
      ...[['any', 'Any date'], ['today', 'Last 24 hours'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => ({ label: `${chk(f.date === k)}${l}`, action: () => setFilter({ date: k }) })),
      { label: `${chk(!f.project)}All projects`, action: () => setFilter({ project: '' }) },
      ...projects.slice(0, 14).map((p) => ({ label: `${chk(f.project === p)}Project: ${p}`, action: () => setFilter({ project: p }) })),
    ]);
  }

  // ---------- opening a video ----------
  async function openVideo(v, { keepCompare = false } = {}) {
    if (typeof v === 'string') v = S.videos.find((x) => x.path === v) || { path: v, ...(await window.hub.fs.stat(v)) };
    if (!v?.path) return null;
    S.cur = v;
    store.set('review.last', v.path);
    const el0 = vid();
    S.loop = { a: null, b: null, on: true };
    S.zoom = { s: 1, x: 0, y: 0 };
    S.selNote = null; S.audio = null; S.strip = []; S.picked = null;
    closeComposer();
    if (!keepCompare) stopCompare();
    el0.src = fileUrl(v.path);
    el0.playbackRate = Number(refs.speed?.value || 1);
    renderTop(); renderLibrary(); renderNotes();
    const ready = new Promise((res) => {
      el0.onloadedmetadata = () => {
        rememberMeta(v, el0);
        refs.stage.style.setProperty('--ar', String(el0.videoWidth / el0.videoHeight || 16 / 9));
        refs.drawSvg.setAttribute('viewBox', `0 0 ${el0.videoWidth} ${el0.videoHeight}`);
        refs.info.textContent = '';
        renderTop(); applyZoom(); renderOverlay(); drawTimeline(); renderMarkers();
        buildStrip(v); analyzeAudio(v); detectFps(v);
        res(true);
      };
      el0.onerror = () => {
        refs.info.replaceChildren(el('span', { text: 'This file can\'t play here (ProRes and some .mov codecs need an H.264 copy). ' }),
          S.tools?.ffmpeg ? el('button', { class: 'ghost small', text: 'Make a playable copy', on: { click: () => runExport('proxy') } }) : el('span', { class: 'hint', text: 'Install ffmpeg to convert it here.' }));
        res(false);
      };
    });
    emit('open', { path: v.path });
    return ready;
  }
  // Exact frame rate: ffprobe when installed; otherwise measured from the decoder while playing.
  async function detectFps(v) {
    const m = S.meta[v.path] || {};
    if (m.fpsUser) { setFps(m.fpsUser, 'yours'); return; }
    if (m.fps && m.mtime === v.mtime) { setFps(m.fps, m.fpsSrc || 'file'); return; }
    if (S.tools?.ffprobe) {
      const p = await window.hub.video.probe(v.path, ffOverrides());
      if (p?.fps && S.cur === v) { S.meta[v.path] = { ...S.meta[v.path], fps: p.fps, fpsSrc: 'file', codec: p.codec, frames: p.frames, bitrate: p.bitrate, audio: p.audio }; saveMeta(); setFps(p.fps, 'file'); renderTop(); return; }
    }
    setFps(store.get('review.fps', 30), 'default');
    measureFps(v);
  }
  function measureFps(v) {
    const d = vid();
    if (!d.requestVideoFrameCallback) return;
    const times = [];
    const cb = (_now, meta) => {
      if (S.cur !== v) return;
      times.push(meta.mediaTime);
      if (times.length < 24) { d.requestVideoFrameCallback(cb); return; }
      const deltas = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0.001).sort((a, b) => a - b);
      const med = deltas[Math.floor(deltas.length / 2)];
      if (!med) return;
      const raw = 1 / med;
      const best = FPS_CHOICES.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
      if (Math.abs(best - raw) / raw < 0.04 && S.fpsSource === 'default') { setFps(best, 'measured'); S.meta[v.path] = { ...S.meta[v.path], fps: best, fpsSrc: 'measured' }; saveMeta(); }
    };
    d.requestVideoFrameCallback(cb);
  }
  function setFps(f, source) {
    S.fps = Number(f) || 30; S.fpsSource = source;
    if (refs.fpsBtn) { refs.fpsBtn.textContent = `${S.fps} fps`; refs.fpsBtn.title = `Frame rate for timecodes and stepping (${source}). Click to change.`; refs.fpsBtn.classList.toggle('dim', source === 'default'); }
  }

  // ---------- top bar ----------
  function renderTop() {
    if (!refs.title) return;
    const v = S.cur;
    refs.title.textContent = v ? base(v.path) : 'Pick a render';
    refs.title.title = v?.path || '';
    const d = vid();
    const f = d?.videoWidth ? V.aspectOf(d.videoWidth, d.videoHeight) : null;
    const m = v ? S.meta[v.path] : null;
    refs.sub.textContent = v ? [d?.videoWidth ? `${d.videoWidth}×${d.videoHeight}` : null, f && f !== 'other' ? f : null, d?.duration ? fmtDur(d.duration) : null, m?.codec, m?.bitrate ? `${(m.bitrate / 1e6).toFixed(1)} Mbps` : null, fmtBytes(v.size || 0), timeAgo(v.mtime)].filter(Boolean).join(' · ') : '';
    refs.favBtn.textContent = v && isFav(v.path) ? '★' : '☆';
    refs.favBtn.classList.toggle('on', Boolean(v && isFav(v.path)));
    const list = v ? versionsOf(v) : [];
    refs.versions.replaceChildren(...(list.length > 1 ? list.slice(0, 8).map((x) => el('button', {
      class: `vr-ver${x.path === v.path ? ' on' : ''}${x.path === S.cmp.path ? ' is-b' : ''}`, title: `${base(x.path)} · ${fmtDate(x.mtime)}\nClick: open · Alt+click or right-click: compare as B`, text: verLabel(x, list),
      on: { click: (e) => (e.altKey ? compareWith(x.path) : openVideo(x)), contextmenu: (e) => { e.preventDefault(); compareWith(x.path); } },
    })) : []));
    const dockAgent = Tools.dockedAgent('ae');
    const s = H.surfaces.get('tool:ae');
    refs.segDirector.classList.toggle('on', Boolean(s && !s.dock.hidden && dockAgent));
    refs.segDirector.textContent = dockAgent ? dockAgent.name.replace(/^Video\s+/i, '') : 'Director';
  }

  // ---------- player ----------
  function seek(t, { exact = false } = {}) {
    const d = vid();
    if (!d?.duration) return;
    d.currentTime = clamp(t, 0, Math.max(0, d.duration - (exact ? 0 : 0.001)));
    if (S.cmp.path) refs.cmp.currentTime = clamp(d.currentTime + S.cmp.offset / S.fps, 0, refs.cmp.duration || 1e9);
    emit('seek', { t: d.currentTime });
  }
  function step(n) {
    if (Cut()) { Cut().step(n); return; }
    pause();
    seek(V.timeOfFrame(frameNow() + n, S.fps));
  }
  const play = () => { if (Cut()) { Cut().play(); return; } if (!vid()?.src) return; S.shuttle = 0; vid().playbackRate = Number(refs.speed.value); vid().play(); if (S.cmp.path) refs.cmp.play(); };
  function pause() { if (Cut()) { Cut().pause(); return; } S.shuttle = 0; vid()?.pause(); refs.cmp?.pause(); }
  const togglePlay = () => (Cut() ? Cut().togglePlay() : vid().paused && !S.shuttle ? play() : pause());
  // J / K / L: each L press speeds forward 1×→2×→4×→8×, J the same backwards, K stops.
  function shuttle(dir) {
    if (Cut()) return Cut().shuttle(dir);
    const cur = S.shuttle;
    if (dir === 0) { pause(); return; }
    const idx = Math.sign(cur) === dir ? Math.min(SHUTTLE.length - 1, SHUTTLE.indexOf(Math.abs(cur)) + 1) : 0;
    S.shuttle = dir * SHUTTLE[idx];
    if (S.shuttle > 0) { vid().playbackRate = S.shuttle; vid().play(); if (S.cmp.path) { refs.cmp.playbackRate = S.shuttle; refs.cmp.play(); } } else { vid().pause(); refs.cmp.pause(); }
    flash(`${S.shuttle > 0 ? '▶' : '◀'} ${Math.abs(S.shuttle)}×`);
  }
  function setSpeed(x) {
    const s = Number(x) || 1;
    refs.speed.value = String(SPEEDS.includes(s) ? s : 1);
    vid().playbackRate = s; refs.cmp.playbackRate = s;
    return s;
  }
  function setLoop(a, b) {
    if (a == null) { S.loop = { a: null, b: null, on: true }; } else {
      const lo = Math.min(a, b ?? dur()); const hi = Math.max(a, b ?? dur());
      S.loop = { a: clamp(lo, 0, dur()), b: clamp(hi, 0, dur()), on: true };
    }
    drawTimelineSoon(); // a loop drag calls this per pointer move: one redraw per frame (the note markers don't change)
    refs.loopBtn.classList.toggle('on', S.loop.a != null && S.loop.on);
  }
  let lastTick = 0;
  const onScreen = () => (refs.root.checkVisibility ? refs.root.checkVisibility({ visibilityProperty: true }) : Boolean(refs.root.offsetParent));
  function tick(now) {
    if (!refs.video?.isConnected) return;
    const d = vid();
    // hidden tool and nothing playing: check again a few times a second instead of every frame
    // (hidden surfaces are visibility: hidden, so offsetParent alone said "on screen" and this ran every frame)
    if (!onScreen() && d.paused && !S.shuttle) { lastTick = 0; setTimeout(() => requestAnimationFrame(tick), 300); return; }
    const D = d.duration || 0;
    // reverse shuttle: step the playhead back by hand (browsers can't play backwards)
    if (S.shuttle < 0 && lastTick) { const t = d.currentTime + (S.shuttle * (now - lastTick)) / 1000; if (t <= (S.loop.on && S.loop.a != null ? S.loop.a : 0) && !S.pingpong) { seek(S.loop.on && S.loop.b != null ? S.loop.b : D); } else seek(t); }
    lastTick = now;
    if (Cut()) { Cut().frame(); requestAnimationFrame(tick); return; } // the edit paints its own time and playhead
    // only real changes touch the DOM (a paused player used to rewrite these every frame: style + observers)
    placeHead(d, D);
    if (document.activeElement !== refs.time) { const v = fmtTime(d.currentTime); if (refs.time.value !== v) refs.time.value = v; }
    const total = `/ ${fmtTime(D)}${S.timeMode === 'frames' ? '' : `  · f${frameNow()}`}`;
    if (refs.timeTotal.textContent !== total) {
      // its width (in ch, monospace) only changes with the text's length: the per-frame text change then lays out
      // this span alone (it's size-contained), not the transport row
      const chars = total.replace(/\s+/g, ' ').length; // as rendered (nowrap collapses the double space)
      if (refs.timeTotal.textContent.replace(/\s+/g, ' ').length !== chars || !refs.timeTotal.style.width) refs.timeTotal.style.width = `${chars}ch`;
      refs.timeTotal.textContent = total;
    }
    const icon = d.paused && S.shuttle <= 0 ? '▶' : '❚❚';
    if (refs.play.textContent !== icon) refs.play.textContent = icon;
    const { a, b, on: lo } = S.loop;
    if (lo && a != null && !d.paused && d.currentTime >= (b ?? D) - 0.5 / S.fps) { if (S.pingpong) { d.pause(); refs.cmp.pause(); S.shuttle = -Number(refs.speed.value || 1); } else seek(a); }
    if (S.pingpong && lo && a != null && S.shuttle < 0 && d.currentTime <= a + 0.5 / S.fps) { S.shuttle = 0; seek(a); play(); }
    if (S.cmp.path && !d.paused && Math.abs(refs.cmp.currentTime - (d.currentTime + S.cmp.offset / S.fps)) > 1.5 / S.fps + 0.03) refs.cmp.currentTime = d.currentTime + S.cmp.offset / S.fps;
    if (S.scopes && (d.paused ? scopesDirty : now - lastScope > 250)) drawScopes(now);
    showNoteDrawings();
    requestAnimationFrame(tick);
  }
  // The playhead glides on the compositor while the video plays (a linear animation to the end, or to the loop's
  // out point): JS restarts it only on play / pause / seek / rate / size changes or when it drifts over 2 px.
  const headG = { anim: null, key: '', x0: 0, x1: 0, x: -1 };
  function placeHead(d, D) {
    const W = refs.tlW || 0;
    if (!W || !D) return;
    const t = d.currentTime;
    const x = (t / D) * W;
    const rate = d.playbackRate || 1;
    const end = S.loop.on && S.loop.a != null && t < (S.loop.b ?? D) ? S.loop.b ?? D : D;
    const moving = !d.paused && !d.seeking && S.shuttle >= 0 && end - t > 0.05;
    if (!moving) {
      if (headG.anim) { headG.anim.cancel(); headG.anim = null; }
      if (Math.abs(headG.x - x) > 0.05) { headG.x = x; refs.head.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`; }
      return;
    }
    const key = `${W}|${D}|${rate}|${end}`;
    const at = headG.anim ? headG.x0 + (headG.x1 - headG.x0) * (headG.anim.effect.getComputedTiming().progress ?? 0) : NaN;
    if (headG.anim && headG.key === key && Math.abs(at - x) <= Math.max(2, (0.08 * rate * W) / D)) return; // the decoder's clock moves in frame steps
    headG.anim?.cancel();
    const x1 = (end / D) * W;
    headG.x = x;
    refs.head.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    headG.anim = refs.head.animate([{ transform: `translate3d(${x.toFixed(2)}px, 0, 0)` }, { transform: `translate3d(${x1.toFixed(2)}px, 0, 0)` }], { duration: ((end - t) / rate) * 1000, easing: 'linear', fill: 'forwards' });
    headG.anim.startTime = document.timeline.currentTime;
    Object.assign(headG, { key, x0: x, x1 });
  }
  // The time readout: timecode, seconds or frame numbers (click the total to switch).
  const fmtTime = (t) => (S.timeMode === 'sec' ? `${(t || 0).toFixed(3)}s` : S.timeMode === 'frames' ? `f${V.frameAt(t || 0, S.fps)}` : tc(t));
  function cycleTimeMode(mode) {
    const modes = ['tc', 'sec', 'frames'];
    S.timeMode = modes.includes(mode) ? mode : modes[(modes.indexOf(S.timeMode) + 1) % modes.length];
    store.set('review.timeMode', S.timeMode);
    return S.timeMode;
  }
  let flashTimer;
  function flash(text) {
    refs.flash.textContent = text;
    refs.flash.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => refs.flash.classList.remove('on'), 700);
  }

  // ---------- view modes: one channel, luma (values only), negative, mirrored (fresh eyes) ----------
  const VIEWS = [['', 'Normal'], ['r', 'Red channel'], ['g', 'Green channel'], ['b', 'Blue channel'], ['luma', 'Luma (values only)'], ['invert', 'Negative'], ['contrast', 'High contrast (spot banding)'], ['sat', 'Saturation boost (spot dull areas)']];
  function setView(v) {
    S.view = VIEWS.some(([k]) => k === v) ? v : '';
    refs.frame.style.setProperty('--vr-filter', S.view ? `url(#vr-f-${S.view})` : 'none');
    refs.viewBtn?.classList.toggle('on', Boolean(S.view) || S.mirror);
    if (S.view) flash(VIEWS.find(([k]) => k === S.view)[1]);
    return S.view;
  }
  function setMirror(on) { S.mirror = on ?? !S.mirror; refs.frame.classList.toggle('mirrored', S.mirror); refs.viewBtn?.classList.toggle('on', Boolean(S.view) || S.mirror); flash(S.mirror ? 'Mirrored' : 'Not mirrored'); return S.mirror; }
  function viewMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.top - 8, [
      ...VIEWS.map(([k, l]) => ({ label: `${S.view === k ? '✓ ' : '   '}${l}`, action: () => setView(k) })),
      { label: `${S.mirror ? '✓ ' : '   '}Mirror (fresh eyes)`, action: () => setMirror() },
      { label: `${S.pingpong ? '✓ ' : '   '}Loop back and forth (ping-pong)`, action: () => { S.pingpong = !S.pingpong; } },
    ]);
  }
  function filterDefs() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'vr-defs');
    const m = (id, values) => `<filter id="vr-f-${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${values}"/></filter>`;
    svg.innerHTML = `<defs>${m('r', '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0')}${m('g', '0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 1 0')}${m('b', '0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 1 0')}${m('luma', '.2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0')}${m('invert', '-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 1 0')}${m('contrast', '3 0 0 0 -1 0 3 0 0 -1 0 0 3 0 -1 0 0 0 1 0')}<filter id="vr-f-sat"><feColorMatrix type="saturate" values="3"/></filter></defs>`;
    return svg;
  }

  // ---------- zoom / pan ----------
  function applyZoom() {
    const { s, x, y } = S.zoom;
    // side by side: the frame holds A and B next to each other, so it is twice as wide
    const d = vid();
    const ar = d?.videoWidth ? d.videoWidth / d.videoHeight : 16 / 9;
    refs.stage.style.setProperty('--arf', String(S.cmp.path && S.cmp.mode === 'side' ? ar * 2 : ar));
    refs.frame.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    refs.zoomLabel.textContent = s === 1 ? '' : `${Math.round(s * pixelScale() * 100)}%`;
  }
  // How many screen pixels one video pixel takes at zoom 1 (fit).
  const pixelScale = () => { const d = vid(); return d?.videoWidth ? refs.frame.offsetWidth / (S.cmp.path && S.cmp.mode === 'side' ? 2 * d.videoWidth : d.videoWidth) : 1; };
  function setZoom(s, cx, cy) {
    const r = refs.stage.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
    const py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    const ns = clamp(s, 1, 32);
    const k = ns / S.zoom.s;
    S.zoom = ns === 1 ? { s: 1, x: 0, y: 0 } : { s: ns, x: px - (px - S.zoom.x) * k, y: py - (py - S.zoom.y) * k };
    applyZoom();
  }
  function zoomTo(what) {
    if (what === 'fit' || what === 1) setZoom(1);
    else if (what === '100' || what === 100) setZoom(1 / pixelScale());
    else if (typeof what === 'number' || /^\d+$/.test(what)) setZoom(Number(what) / 100 / pixelScale());
    return Math.round(S.zoom.s * pixelScale() * 100);
  }

  // ---------- compare ----------
  const CMP_MODES = [['wipe', 'Wipe'], ['side', 'Side by side'], ['onion', 'Onion skin (50% over)'], ['diff', 'Difference'], ['flip', 'Flip (B only)']];
  async function compareWith(path, mode) {
    if (!S.cur) return false;
    if (!path) { stopCompare(); return false; }
    S.cmp.path = path;
    if (mode) setCompareMode(mode);
    refs.cmp.src = fileUrl(path);
    refs.cmp.muted = true;
    refs.cmpLabel.textContent = `B · ${base(path)}`;
    refs.aLabel.textContent = `A · ${base(S.cur.path)}`;
    refs.stage.classList.add('comparing');
    refs.stage.dataset.cmp = S.cmp.mode;
    await new Promise((res) => { refs.cmp.onloadedmetadata = res; refs.cmp.onerror = res; setTimeout(res, 6000); });
    refs.cmp.currentTime = vid().currentTime + S.cmp.offset / S.fps;
    if (!vid().paused) refs.cmp.play();
    renderTop(); renderLibrary(); applyZoom();
    emit('compare', { a: S.cur.path, b: path, mode: S.cmp.mode });
    return true;
  }
  function setCompareMode(mode) {
    if (!CMP_MODES.some(([k]) => k === mode)) return false;
    S.cmp.mode = mode;
    store.set('review.cmpMode', mode);
    refs.stage.dataset.cmp = mode;
    if (S.cmp.path) flash(CMP_MODES.find(([k]) => k === mode)[1]);
    requestAnimationFrame(applyZoom);
    return true;
  }
  function stopCompare() {
    S.cmp.path = null;
    refs.stage?.classList.remove('comparing');
    if (refs.stage) applyZoom();
    refs.cmp?.removeAttribute('src');
    refs.cmp?.load();
  }
  function setWipe(x) { S.cmp.wipe = clamp(x, 0, 1); refs.stage.style.setProperty('--wipe', `${S.cmp.wipe * 100}%`); }
  function compareMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const others = S.cur ? [...versionsOf(S.cur), ...S.videos.filter((v) => !versionsOf(S.cur).includes(v))].filter((v) => v.path !== S.cur.path).slice(0, 12) : [];
    showMenu(r.left, r.top - 8, [
      ...(S.cmp.path ? CMP_MODES.map(([k, l]) => ({ label: `${S.cmp.mode === k ? '✓ ' : '   '}${l}`, action: () => setCompareMode(k) })) : []),
      S.cmp.path ? { label: 'Swap A ⇄ B', action: swapAB } : null,
      S.cmp.path ? { label: `B offset: ${S.cmp.offset} frames…`, action: async () => { const v = await Modal.prompt('Offset B by frames', { value: String(S.cmp.offset), label: 'Positive: B runs ahead. Useful when a new version has a longer intro.' }); if (v != null) { S.cmp.offset = Math.round(Number(v) || 0); seek(vid().currentTime); } } } : null,
      S.cmp.path ? { label: '✕ Stop comparing', action: stopCompare } : null,
      ...others.map((v) => ({ label: `B: ${base(v.path)} · ${timeAgo(v.mtime)}`, action: () => compareWith(v.path) })),
      { label: 'B: choose a file…', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }] }); if (p) compareWith(p); } },
    ].filter(Boolean));
  }
  async function swapAB() {
    if (!S.cmp.path) return;
    const a = S.cur.path; const b = S.cmp.path; const t = vid().currentTime;
    await openVideo(b, { keepCompare: true });
    await compareWith(a);
    seek(t);
  }

  // ---------- overlays: guides, safe zones, crop preview ----------
  function renderOverlay() {
    const o = refs.overlay;
    if (!o) return;
    const d = vid();
    const kids = [];
    if (S.overlay.guide) kids.push(el('div', { class: `vr-guide g-${S.overlay.guide}` }));
    if (S.overlay.safe) {
      const z = V.zoneRects(S.overlay.safe, d.videoWidth, d.videoHeight);
      if (z) {
        const pct = (r) => ({ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${r[2] * 100}%`, height: `${r[3] * 100}%` });
        kids.push(...z.blocked.map((b) => el('div', { class: 'vr-zone', style: pct(b.r) }, el('span', { text: b.label }))));
        kids.push(el('div', { class: 'vr-safe', style: pct(z.safe) }, el('span', { text: `${z.name}${z.fits ? '' : ' (made for another aspect)'}` })));
      }
    }
    if (S.overlay.crop) {
      const [cw, ch] = S.overlay.crop.split(':').map(Number);
      const win = V.cropWindow(d.videoWidth || 16, d.videoHeight || 9, cw, ch, S.overlay.cropOffset);
      const box = el('div', { class: 'vr-crop', style: { left: `${win.x * 100}%`, top: `${win.y * 100}%`, width: `${win.w * 100}%`, height: `${win.h * 100}%` }, title: 'Drag to choose what stays in the crop' },
        el('span', { text: `${S.overlay.crop} crop · keeps ${Math.round(win.keep * 100)}% · drag to move` }));
      box.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        box.setPointerCapture(e.pointerId);
        const r = refs.frame.getBoundingClientRect();
        const start = { x: e.clientX, y: e.clientY, o: S.overlay.cropOffset };
        const mv = (ev) => {
          const free = win.axis === 'x' ? 1 - win.w : 1 - win.h;
          if (free <= 0) return;
          const delta = win.axis === 'x' ? (ev.clientX - start.x) / r.width : (ev.clientY - start.y) / r.height;
          S.overlay.cropOffset = clamp(start.o + delta / free, 0, 1);
          const w2 = V.cropWindow(d.videoWidth, d.videoHeight, cw, ch, S.overlay.cropOffset);
          Object.assign(box.style, { left: `${w2.x * 100}%`, top: `${w2.y * 100}%` });
        };
        box.addEventListener('pointermove', mv);
        box.addEventListener('pointerup', () => box.removeEventListener('pointermove', mv), { once: true });
      });
      kids.push(box);
    }
    o.replaceChildren(...kids);
    refs.overlayBtn.classList.toggle('on', Boolean(S.overlay.guide || S.overlay.safe || S.overlay.crop));
  }
  function setSafe(id) { S.overlay.safe = id && V.SAFE_ZONES[id] ? id : ''; renderOverlay(); return S.overlay.safe; }
  function setGuide(id) { S.overlay.guide = id && V.GUIDES.some((g) => g.id === id) ? id : ''; renderOverlay(); return S.overlay.guide; }
  function setCrop(fmt) { S.overlay.crop = fmt && /^\d+:\d+$/.test(fmt) ? fmt : null; S.overlay.cropOffset = 0.5; renderOverlay(); return S.overlay.crop; }
  function overlayMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const d = vid();
    const fits = V.zonesFor(d.videoWidth, d.videoHeight);
    const chk = (b) => (b ? '✓ ' : '   ');
    const cur = V.aspectOf(d.videoWidth, d.videoHeight);
    showMenu(r.left, r.top - 8, [
      { label: `${chk(!S.overlay.guide && !S.overlay.safe && !S.overlay.crop)}No overlay`, action: () => { setGuide(''); setSafe(''); setCrop(null); } },
      ...[...fits, ...Object.keys(V.SAFE_ZONES).filter((k) => !fits.includes(k))].map((k) => ({ label: `${chk(S.overlay.safe === k)}Safe zone: ${V.SAFE_ZONES[k].name}${fits.includes(k) ? '' : ' ·'}`, action: () => setSafe(S.overlay.safe === k ? '' : k) })),
      ...V.GUIDES.map((g) => ({ label: `${chk(S.overlay.guide === g.id)}Guide: ${g.name}`, action: () => setGuide(S.overlay.guide === g.id ? '' : g.id) })),
      ...V.MAIN_FORMATS.filter((f) => f !== cur).map((f) => ({ label: `${chk(S.overlay.crop === f)}Crop preview → ${f} (${V.formatInfo(f).w}×${V.formatInfo(f).h})`, action: () => setCrop(S.overlay.crop === f ? null : f) })),
    ]);
  }

  // ---------- drawing on the frame ----------
  const DRAW_TOOLS = [['arrow', '↗', 'Arrow'], ['circle', '◯', 'Circle'], ['rect', '▭', 'Box'], ['free', '✎', 'Freehand']];
  const DRAW_COLORS = ['#ff3b5c', '#ffd75e', '#4fd18b', '#6bc7ff', '#ffffff'];
  function strokeNode(s, w) {
    const sw = Math.max(2, w * 0.006);
    const common = { fill: 'none', stroke: s.color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const mk = (tag, attrs) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
    const [p0, p1] = [s.pts[0], s.pts[s.pts.length - 1]];
    if (s.type === 'free') return mk('polyline', { ...common, points: s.pts.map((p) => p.join(',')).join(' ') });
    if (s.type === 'circle') return mk('ellipse', { ...common, cx: (p0[0] + p1[0]) / 2, cy: (p0[1] + p1[1]) / 2, rx: Math.abs(p1[0] - p0[0]) / 2, ry: Math.abs(p1[1] - p0[1]) / 2 });
    if (s.type === 'rect') return mk('rect', { ...common, x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), width: Math.abs(p1[0] - p0[0]), height: Math.abs(p1[1] - p0[1]) });
    const g = mk('g', {});
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const head = sw * 5;
    g.append(mk('line', { ...common, x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }),
      mk('polyline', { ...common, points: [[p1[0] - head * Math.cos(ang - 0.45), p1[1] - head * Math.sin(ang - 0.45)], p1, [p1[0] - head * Math.cos(ang + 0.45), p1[1] - head * Math.sin(ang + 0.45)]].map((p) => p.join(',')).join(' ') }));
    return g;
  }
  let shownDrawKey = '';
  function showNoteDrawings() {
    const d = vid();
    if (!d?.videoWidth) return;
    const t = d.currentTime;
    const strokes = [];
    if (S.compose) strokes.push(...S.compose.draw);
    else if (d.paused) for (const n of notesOf()) if (n.draw?.length && (n.id === S.selNote || Math.abs(n.t - t) < 1.5 / S.fps)) strokes.push(...n.draw);
    const key = `${strokes.length}|${strokes.map((s) => s.pts.length).join(',')}|${S.compose ? 'c' : ''}`;
    if (key === shownDrawKey) return;
    shownDrawKey = key;
    refs.drawSvg.replaceChildren(...strokes.map((s) => strokeNode(s, d.videoWidth)));
  }
  function setDraw(onOff, tool) {
    S.draw.on = onOff ?? !S.draw.on;
    if (tool) { S.draw.tool = tool; store.set('review.drawTool', tool); }
    if (S.draw.on) { S.pick = false; if (!S.compose) openComposer(); }
    refs.stage.classList.toggle('drawing', S.draw.on);
    refs.stage.classList.toggle('picking', S.pick);
    renderComposer();
    refs.drawBtn.classList.toggle('on', S.draw.on);
    return S.draw.on;
  }
  function framePoint(e) {
    const d = vid();
    const r = refs.frame.getBoundingClientRect();
    const fw = S.cmp.path && S.cmp.mode === 'side' ? r.width / 2 : r.width;
    return [((e.clientX - r.left) / fw) * d.videoWidth, ((e.clientY - r.top) / r.height) * d.videoHeight].map((x) => Math.round(x * 10) / 10);
  }
  function startStroke(e) {
    if (!S.compose) openComposer();
    const s = { type: S.draw.tool, color: S.draw.color, pts: [framePoint(e)] };
    S.compose.draw.push(s);
    refs.drawSvg.setPointerCapture(e.pointerId);
    const mv = (ev) => { const p = framePoint(ev); if (s.type === 'free') s.pts.push(p); else s.pts[1] = p; shownDrawKey = ''; };
    refs.drawSvg.addEventListener('pointermove', mv);
    refs.drawSvg.addEventListener('pointerup', () => {
      refs.drawSvg.removeEventListener('pointermove', mv);
      if (s.pts.length < 2) S.compose.draw.pop();
      shownDrawKey = '';
      renderComposer();
    }, { once: true });
  }

  // ---------- frames ----------
  function grabCanvas({ withDrawing = false, strokes } = {}) {
    const d = vid();
    const c = document.createElement('canvas');
    c.width = d.videoWidth; c.height = d.videoHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(d, 0, 0);
    const list = strokes || (withDrawing && S.compose ? S.compose.draw : []);
    if (list.length) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}">${list.map((s) => strokeNode(s, c.width).outerHTML).join('')}</svg>`;
      return new Promise((res) => { const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0); res(c); }; img.onerror = () => res(c); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    }
    return Promise.resolve(c);
  }
  const shrink = (c, maxW = 1280) => { if (c.width <= maxW) return c; const s = document.createElement('canvas'); s.width = maxW; s.height = Math.round(maxW * (c.height / c.width)); s.getContext('2d').drawImage(c, 0, 0, s.width, s.height); return s; };
  const frameName = (t) => `${noExt(base(S.cur.path))}_${tc(t).replace(/:/g, '-')}`;
  async function saveFrame() {
    if (!S.cur) return null;
    const c = await grabCanvas({ withDrawing: true });
    const p = await window.hub.saveFile({ defaultPath: `${frameName(vid().currentTime)}.png`, filters: [{ name: 'PNG', extensions: ['png'] }], content: c.toDataURL('image/png').split(',')[1], base64: true });
    if (p) toast('Frame saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    return p;
  }
  async function copyFrame() {
    const c = await grabCanvas({ withDrawing: true });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Frame copied', { timeout: 1500 });
  }
  // Saves a frame grab into data/attachments (for notes and chats); returns its path.
  async function grabToAttachment(t = vid().currentTime, strokes) {
    const c = shrink(await grabCanvas({ strokes }));
    return window.hub.saveAttachment(`frame-${tc(t).replace(/:/g, '-')}.jpg`, c.toDataURL('image/jpeg', 0.86).split(',')[1]);
  }

  // ---------- color picker + scopes ----------
  function pickAt(e) {
    const d = vid();
    const [x, y] = framePoint(e).map(Math.floor);
    if (x < 0 || y < 0 || x >= d.videoWidth || y >= d.videoHeight) return null;
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(d, x, y, 1, 1, 0, 0, 1, 1);
    const [R, G, B] = ctx.getImageData(0, 0, 1, 1).data;
    const hex = `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const luma = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B);
    S.picked = { hex, rgb: [R, G, B], luma, x, y };
    refs.pickChip.hidden = false;
    refs.pickChip.replaceChildren(el('i', { style: { background: hex } }), `${hex}  rgb(${R}, ${G}, ${B})  luma ${Math.round((luma / 255) * 100)}%`);
    copyText(hex, `${hex} copied (and added to your next note)`);
    if (S.compose) S.compose.color = hex;
    return S.picked;
  }
  function setPick(onOff) { S.pick = onOff ?? !S.pick; if (S.pick) setDraw(false); refs.stage.classList.toggle('picking', S.pick); refs.pickBtn.classList.toggle('on', S.pick); return S.pick; }
  let scopesDirty = true; let lastScope = 0;
  function drawScopes(now = performance.now()) {
    lastScope = now; scopesDirty = false;
    const d = vid();
    if (!d?.videoWidth || d.readyState < 2) return;
    const W = 192; const Hh = Math.max(1, Math.round(W * (d.videoHeight / d.videoWidth)));
    const c = drawScopes.c ||= document.createElement('canvas');
    c.width = W; c.height = Hh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(d, 0, 0, W, Hh);
    const px = ctx.getImageData(0, 0, W, Hh).data;
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    const wf = new Uint32Array(W * 64);
    let clipLo = 0; let clipHi = 0;
    for (let i = 0, p = 0; i < px.length; i += 4, p += 1) {
      const r = px[i]; const g = px[i + 1]; const b = px[i + 2];
      const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      hist[0][r] += 1; hist[1][g] += 1; hist[2][b] += 1; hist[3][l] += 1;
      wf[(63 - (l >> 2)) * W + (p % W)] += 1;
      if (l <= 2) clipLo += 1; else if (l >= 253) clipHi += 1;
    }
    // histogram
    const h = refs.hist; const hc = h.getContext('2d');
    hc.clearRect(0, 0, h.width, h.height);
    const max = Math.max(1, ...hist.slice(0, 3).flatMap((a) => Array.from(a).slice(2, 254)));
    const cols = ['#ff4d4dcc', '#4dff88cc', '#4d9dffcc', '#ffffffaa'];
    hc.globalCompositeOperation = 'lighter';
    hist.forEach((a, k) => {
      hc.beginPath(); hc.moveTo(0, h.height);
      for (let i = 0; i < 256; i += 1) hc.lineTo((i / 255) * h.width, h.height - Math.min(1, a[i] / max) * h.height);
      hc.lineTo(h.width, h.height);
      if (k < 3) { hc.fillStyle = cols[k].replace('cc', '55'); hc.fill(); } else { hc.strokeStyle = cols[k]; hc.stroke(); }
    });
    hc.globalCompositeOperation = 'source-over';
    // luma waveform
    const w = refs.wave; const wc = w.getContext('2d');
    const img = wc.createImageData(W, 64);
    for (let i = 0; i < wf.length; i += 1) { const v = Math.min(255, wf[i] * 40); img.data[i * 4] = v * 0.6; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.7; img.data[i * 4 + 3] = v ? 255 : 0; }
    w.width = W; w.height = 64;
    wc.putImageData(img, 0, 0);
    const total = px.length / 4;
    refs.scopeInfo.textContent = `crushed ${((clipLo / total) * 100).toFixed(1)}% · clipped ${((clipHi / total) * 100).toFixed(1)}%`;
  }
  function setScopes(onOff) { S.scopes = onOff ?? !S.scopes; refs.scopes.hidden = !S.scopes; refs.scopesBtn.classList.toggle('on', S.scopes); scopesDirty = true; return S.scopes; }

  // ---------- timeline: filmstrip, waveform, beats, loop, notes ----------
  async function buildStrip(v) {
    const n = 24;
    let dec;
    try { dec = await openDecoder(v.path); } catch { return; }
    for (let i = 0; i < n; i += 1) {
      if (S.cur !== v) { dec.close(); return; }
      const t = (dec.d.duration * (i + 0.5)) / n;
      try { await dec.at(t); } catch { break; }
      const c = snap(dec.d, 160);
      S.strip.push({ t, url: c.toDataURL('image/jpeg', 0.6), img: c });
      if (i % 4 === 3 || i === n - 1) drawTimeline();
    }
    dec.close();
  }
  const audioCache = new Map();
  async function analyzeAudio(v) {
    const key = keyOf(v);
    if (audioCache.has(key)) { S.audio = audioCache.get(key); drawTimeline(); return; }
    if (typeof ThreeMedia === 'undefined' || !ThreeMedia.analyze || (v.size || 0) > 300 * 1048576) return;
    try {
      const u8 = await window.hub.fs.read(v.path, { encoding: 'buffer', maxBytes: 300 * 1048576 });
      const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      const a = await ThreeMedia.analyze(buf);
      const slim = { bpm: a.bpm, beats: a.beats, drops: a.drops, peaks: a.peaks, duration: a.duration, sections: a.sections };
      audioCache.set(key, slim);
      if (S.cur === v) { S.audio = slim; drawTimeline(); renderTop(); emit('audio', slim); }
    } catch { audioCache.set(key, null); /* no audio track */ }
  }
  const RULER = 14;
  let tlRaf = 0;
  const drawTimelineSoon = () => { if (!tlRaf) tlRaf = requestAnimationFrame(() => { tlRaf = 0; drawTimeline(); }); };
  function drawTimeline() {
    const c = refs.tl;
    if (!c?.isConnected) return;
    if (tlRaf) { cancelAnimationFrame(tlRaf); tlRaf = 0; }
    const dpr = devicePixelRatio || 1;
    const W = c.clientWidth; const Hh = c.clientHeight;
    if (!W) return;
    // resize the backing store only when the size changed (setting width reallocates it, even to the same value)
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(Hh * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#07080a'; g.fillRect(0, 0, W, Hh);
    const D = dur();
    // filmstrip, faint
    if (S.strip.length && vid().videoWidth) {
      const fw = (Hh - RULER) * (vid().videoWidth / vid().videoHeight);
      g.globalAlpha = 0.32;
      for (let x = 0; x < W; x += fw) { const f = S.strip[Math.min(S.strip.length - 1, Math.floor((x / W) * S.strip.length))]; g.drawImage(f.img, x, RULER, fw, Hh - RULER); }
      g.globalAlpha = 1;
    }
    // ruler
    g.fillStyle = '#111419'; g.fillRect(0, 0, W, RULER);
    if (D) {
      const stepS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => (s / D) * W > 46) || 600;
      g.fillStyle = '#8a8f98'; g.font = '9px ui-monospace, Consolas, monospace'; g.textBaseline = 'top';
      for (let s = 0; s <= D; s += stepS) { const x = (s / D) * W; g.fillRect(x, 0, 1, 5); g.fillText(stepS < 1 ? `${s.toFixed(1)}s` : D < 60 ? `${Math.round(s)}s` : fmtDur(s) || '0:00', x + 3, 3); }
    }
    // waveform + beats
    const a = S.audio;
    const mid = RULER + (Hh - RULER) / 2;
    if (a?.peaks?.length && D) {
      g.fillStyle = '#7fd8ffaa';
      const per = a.peaks.length / W * (D / (a.duration || D));
      for (let x = 0; x < W; x += 1) {
        let m = 0; const s0 = Math.floor(x * per); const s1 = Math.max(s0 + 1, Math.floor((x + 1) * per));
        for (let k = s0; k < s1 && k < a.peaks.length; k += 1) m = Math.max(m, a.peaks[k]);
        const hh = m * (Hh - RULER - 4) * 0.5;
        g.fillRect(x, mid - hh, 1, hh * 2 || 1);
      }
      a.beats.forEach((b, i) => { const x = (b / D) * W; g.fillStyle = i % 4 === 0 ? '#ffd75ecc' : '#ffd75e44'; g.fillRect(x, RULER, 1, i % 4 === 0 ? Hh - RULER : 6); });
      for (const d0 of a.drops || []) { const x = (d0 / D) * W; g.fillStyle = '#ff4d4d'; g.fillRect(x - 1, RULER, 2, Hh - RULER); }
    }
    // loop range
    if (S.loop.a != null && D) {
      const x0 = (S.loop.a / D) * W; const x1 = ((S.loop.b ?? D) / D) * W;
      g.fillStyle = S.loop.on ? '#ffd75e30' : '#ffffff14'; g.fillRect(x0, 0, x1 - x0, Hh);
      g.fillStyle = S.loop.on ? '#ffd75e' : '#888'; g.fillRect(x0, 0, x1 - x0, 3); g.fillRect(x0, 0, 2, Hh); g.fillRect(x1 - 2, 0, 2, Hh);
    }
    const bpmText = a?.bpm ? `${a.bpm} bpm · ${a.beats.length} beats` : '';
    if (refs.bpm.textContent !== bpmText) refs.bpm.textContent = bpmText;
  }
  function renderMarkers() {
    const D = dur();
    refs.markers.replaceChildren(...(S.cur && D ? notesOf().filter((n) => !S.catFilter || n.cat === S.catFilter).map((n) => el('span', {
      class: `vr-mark${n.done ? ' done' : ''}${n.id === S.selNote ? ' sel' : ''}`, title: `${tc(n.t)} · ${V.category(n.cat).name}\n${n.text}`,
      style: { left: `${(n.t / D) * 100}%`, '--c': V.category(n.cat).color },
      on: { pointerdown: (e) => { e.stopPropagation(); selectNote(n.id); } },
    })) : []));
  }
  // Pointer on the timeline: the top strip draws / moves the loop, the rest scrubs. Hover shows the frame.
  function timelineEvents(box) {
    const timeAt = (e) => { const r = box.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * dur(); };
    box.addEventListener('pointerdown', (e) => {
      if (!dur()) return;
      box.setPointerCapture(e.pointerId);
      const r = box.getBoundingClientRect();
      const inRuler = e.clientY - r.top < RULER + 2 || e.shiftKey;
      const t0 = timeAt(e);
      let mv;
      if (inRuler) {
        const L = S.loop; const px = (t) => (t / dur()) * r.width;
        const near = (t) => L.a != null && Math.abs(px(t) - (e.clientX - r.left)) < 6;
        const mode = near(L.a) ? 'a' : near(L.b ?? dur()) ? 'b' : L.a != null && t0 > L.a && t0 < (L.b ?? dur()) ? 'move' : 'new';
        const orig = { ...L };
        mv = (ev) => {
          const t = timeAt(ev);
          if (mode === 'new') setLoop(t0, t);
          else if (mode === 'a') setLoop(t, orig.b);
          else if (mode === 'b') setLoop(orig.a, t);
          else { const len = (orig.b ?? dur()) - orig.a; const a = clamp(orig.a + t - t0, 0, dur() - len); setLoop(a, a + len); }
        };
        if (mode === 'new') { S.loop = { a: t0, b: t0, on: true }; }
      } else {
        pause(); seek(t0);
        // one seek per frame however fast the pointer events come (each seek starts a decode)
        let want = null; let raf = 0;
        mv = (ev) => { want = timeAt(ev); if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (want != null) seek(want); want = null; }); };
      }
      box.addEventListener('pointermove', mv);
      box.addEventListener('pointerup', () => {
        box.removeEventListener('pointermove', mv);
        if (inRuler && S.loop.a != null && Math.abs((S.loop.b ?? 0) - S.loop.a) < 2 / S.fps) setLoop(null); // a click (no drag) clears the loop
      }, { once: true });
    });
    box.addEventListener('pointermove', (e) => {
      if (!dur()) return;
      const t = timeAt(e);
      const r = box.getBoundingClientRect();
      const f = S.strip.length ? S.strip.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)) : null;
      // moved with a transform and only what changed is written (the frame picture changes ~24 times across the clip)
      if (refs.hover.hidden) refs.hover.hidden = false;
      refs.hover.style.transform = `translate3d(${clamp(e.clientX - r.left, 50, r.width - 50)}px, 0, 0) translate(-50%, -100%)`;
      if (refs.hoverImg.hidden !== !f) refs.hoverImg.hidden = !f;
      if (f && refs.hoverImg.getAttribute('src') !== f.url) refs.hoverImg.src = f.url;
      const beat = S.audio?.beats ? S.audio.beats.findIndex((b) => b > t) : -1;
      const label = `${tc(t)}${beat > 0 ? ` · beat ${beat}` : ''}`;
      if (refs.hoverTc.textContent !== label) refs.hoverTc.textContent = label;
    });
    box.addEventListener('pointerleave', () => { refs.hover.hidden = true; });
    box.addEventListener('dblclick', (e) => {
      // double-click a stretch between two drops / sections to loop it
      const t = timeAt(e);
      const sec = S.audio?.sections?.find((s) => t >= s.start && t < s.end);
      if (sec) setLoop(sec.start, sec.end);
    });
  }
  const beatsNear = (t, dir) => { const b = S.audio?.beats || []; return dir > 0 ? b.find((x) => x > t + 0.01) : [...b].reverse().find((x) => x < t - 0.01); };

  // ---------- notes ----------
  function selectNote(id) {
    const n = notesOf().find((x) => x.id === id);
    if (!n) return;
    S.selNote = id;
    if (Cut()) { const at = CutData.programTimes(Cut().edit, S.cur.path, n.t)[0]; if (at != null) Cut().goto(at); renderNotes(); renderMarkers(); return; }
    pause(); seek(n.t); shownDrawKey = '';
    renderNotes(); renderMarkers();
    refs.noteList.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function openComposer(text = '') {
    if (!S.cur) return;
    pause();
    // already writing one (D, then a drawing, then N): keep its marks and text instead of starting over
    if (S.compose) { if (text) S.compose.text = `${S.compose.text ? `${S.compose.text} ` : ''}${text}`; renderComposer(); setTimeout(() => refs.composeText?.focus(), 0); return; }
    S.compose = { t: vid().currentTime, cat: '', text, draw: [], color: S.picked?.hex || null };
    renderComposer();
    setTimeout(() => refs.composeText?.focus(), 0);
  }
  function closeComposer() {
    S.compose = null; shownDrawKey = '';
    if (S.draw.on) { S.draw.on = false; refs.stage?.classList.remove('drawing'); refs.drawBtn?.classList.remove('on'); }
    renderComposer();
  }
  function renderComposer() {
    const box = refs.composer;
    if (!box) return;
    const c = S.compose;
    box.hidden = !c;
    if (!c) return;
    const catBtns = V.CATEGORIES.map((k) => el('button', { type: 'button', class: `vr-cat${c.cat === k.id ? ' on' : ''}`, style: { '--c': k.color }, title: `${k.name} (Alt+${k.key})`, text: k.name, on: { click: () => { c.cat = c.cat === k.id ? '' : k.id; renderComposer(); } } }));
    const drawRow = el('div', { class: 'vr-drawrow' },
      el('button', { type: 'button', class: `vr-ico${S.draw.on ? ' on' : ''}`, text: '✎', title: 'Draw on the frame (D)', on: { click: () => setDraw() } }),
      ...DRAW_TOOLS.map(([k, ico, name]) => el('button', { type: 'button', class: `vr-ico${S.draw.tool === k && S.draw.on ? ' on' : ''}`, text: ico, title: name, on: { click: () => setDraw(true, k) } })),
      ...DRAW_COLORS.map((col) => el('button', { type: 'button', class: `vr-dot${S.draw.color === col ? ' on' : ''}`, style: { background: col }, title: col, on: { click: () => { S.draw.color = col; store.set('review.drawColor', col); renderComposer(); } } })),
      c.draw.length ? el('button', { type: 'button', class: 'vr-ico', text: '↶', title: 'Undo last mark', on: { click: () => { c.draw.pop(); shownDrawKey = ''; renderComposer(); } } }) : null,
      c.color ? el('span', { class: 'vr-colortag', title: 'Picked color, saved with the note' }, el('i', { style: { background: c.color } }), c.color) : null);
    refs.composeText = el('textarea', { rows: 3, value: c.text, placeholder: 'What should change here? Enter saves · Shift+Enter new line · Esc cancels', on: {
      input: (e) => { c.text = e.target.value; },
      keydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveComposer(); } else if (e.key === 'Escape') { e.preventDefault(); closeComposer(); } else if (e.altKey && /^[1-8]$/.test(e.key)) { e.preventDefault(); c.cat = V.CATEGORIES[Number(e.key) - 1].id; renderComposer(); refs.composeText.focus(); }
        e.stopPropagation();
      },
    } });
    box.replaceChildren(
      el('div', { class: 'vr-compose-head' }, el('button', { type: 'button', class: 'vr-tc', text: tc(c.t), title: 'Go there', on: { click: () => seek(c.t) } }),
        el('button', { type: 'button', class: 'vr-ico', text: '⟲', title: 'Move the note to the playhead', on: { click: () => { c.t = vid().currentTime; renderComposer(); } } }),
        el('span', { class: 'spacer' }), c.draw.length ? el('span', { class: 'hint', text: `${c.draw.length} mark${c.draw.length > 1 ? 's' : ''}` }) : null),
      el('div', { class: 'vr-cats' }, catBtns), refs.composeText, drawRow,
      el('div', { class: 'vr-compose-foot' }, el('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: closeComposer } }),
        el('button', { type: 'button', class: 'primary small', text: 'Save note', on: { click: () => saveComposer() } })));
  }
  async function saveComposer() {
    const c = S.compose;
    if (!c) return null;
    if (!c.text.trim() && !c.draw.length) { closeComposer(); return null; }
    return addNote(c.text.trim() || '(see drawing)', { t: c.t, cat: c.cat, draw: c.draw, color: c.color });
  }
  async function addNote(text, { t = vid()?.currentTime || 0, cat, draw = [], color = null, by = 'you', frame = true } = {}) {
    if (!S.cur) return null;
    const n = { id: uid(), t, text: String(text).trim(), cat: cat || V.guessCategory(text), done: false, frame: null, color, draw, by, at: Date.now() };
    if (frame) {
      try {
        if (Math.abs(vid().currentTime - t) > 0.5 / S.fps) { seek(t); await new Promise((r) => { vid().addEventListener('seeked', r, { once: true }); setTimeout(r, 2500); }); }
        n.frame = await grabToAttachment(t, draw);
      } catch { /* note without a frame */ }
    }
    notesOf().push(n);
    notesOf().sort((a, b) => a.t - b.t);
    S.compose = null; closeComposer();
    saveNotes(); renderNotes(); renderMarkers(); renderLibrary();
    emit('note', { path: S.cur.path, note: n });
    return n;
  }
  function updateNote(id, patch) {
    const n = notesOf().find((x) => x.id === id);
    if (!n) return null;
    Object.assign(n, patch);
    saveNotes(); renderNotes(); renderMarkers(); renderLibrary();
    return n;
  }
  function deleteNote(id) {
    const list = notesOf();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [gone] = list.splice(i, 1);
    saveNotes(); renderNotes(); renderMarkers(); renderLibrary();
    toast('Note deleted', { action: { label: 'Undo', fn: () => { list.push(gone); list.sort((a, b) => a.t - b.t); saveNotes(); renderNotes(); renderMarkers(); } }, timeout: 5000 });
  }
  function renderNotes() {
    if (!refs.noteList) return;
    const all = notesOf();
    const list = all.filter((n) => (!S.hideDone || !n.done) && (!S.catFilter || n.cat === S.catFilter));
    const open = all.filter((n) => !n.done).length;
    refs.noteCount.textContent = all.length ? `${open} open${all.length - open ? ` · ${all.length - open} done` : ''}` : '';
    refs.catSel.value = S.catFilter;
    refs.noteList.replaceChildren(...(list.length ? list.map((n, i) => {
      const k = V.category(n.cat);
      const text = el('div', { class: 'vr-note-text', text: n.text, title: 'Double-click to edit' });
      text.addEventListener('dblclick', () => {
        const ta = el('textarea', { rows: 3, value: n.text });
        ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); updateNote(n.id, { text: ta.value.trim() || n.text }); } else if (e.key === 'Escape') renderNotes(); });
        ta.addEventListener('blur', () => updateNote(n.id, { text: ta.value.trim() || n.text }));
        text.replaceWith(ta); ta.focus();
      });
      return el('div', { class: `vr-note${n.done ? ' done' : ''}${n.id === S.selNote ? ' sel' : ''}${n.prio ? ' prio' : ''}`, dataset: { id: n.id }, style: { '--c': k.color }, on: { contextmenu: (e) => { e.preventDefault(); noteMenu(n, e.clientX, e.clientY); } } },
        el('div', { class: 'vr-note-head' },
          el('input', { type: 'checkbox', checked: n.done, title: n.done ? 'Reopen' : 'Mark as resolved', on: { change: (e) => updateNote(n.id, { done: e.target.checked }) } }),
          el('button', { class: 'vr-tc', text: tc(n.t), title: 'Go to this frame', on: { click: () => selectNote(n.id) } }),
          el('button', { class: 'vr-catchip', text: k.name, title: 'Change category', on: { click: (e) => { const r = e.target.getBoundingClientRect(); showMenu(r.left, r.bottom, V.CATEGORIES.map((c) => ({ label: c.name, action: () => updateNote(n.id, { cat: c.id }) }))); } } }),
          n.by && n.by !== 'you' ? el('span', { class: 'vr-by', text: n.by === 'director' ? 'Director' : n.by }) : null,
          n.draw?.length ? el('span', { class: 'vr-by', text: '✎', title: 'Has a drawing' }) : null,
          n.prio ? el('span', { class: 'vr-prio', text: '❗', title: 'Must fix' }) : null,
          n.carried ? el('span', { class: 'vr-by', text: '↪', title: `Carried over from ${n.carried}` }) : null,
          el('span', { class: 'spacer' }),
          el('span', { class: 'hint vr-idx', text: `#${all.indexOf(n) + 1}` }),
          el('button', { class: 'msg-act vr-x', text: '×', title: 'Delete note', on: { click: () => deleteNote(n.id) } })),
        n.frame ? el('img', { class: 'vr-note-frame', src: fileUrl(n.frame), alt: '', loading: 'lazy', on: { click: () => selectNote(n.id) } }) : null,
        text,
        n.color ? el('span', { class: 'vr-colortag' }, el('i', { style: { background: n.color } }), n.color) : null);
    }) : [el('p', { class: 'hint vr-empty', text: all.length ? 'No notes match.' : 'Pause where something should change and press N (D draws on the frame).' })]));
    refs.sendBtn.disabled = !open;
  }
  function noteMenu(n, x, y) {
    showMenu(x, y, [
      { label: 'Go to this frame', action: () => selectNote(n.id) },
      { label: 'Loop 1 s around it', action: () => { setLoop(Math.max(0, n.t - 0.5), Math.min(dur(), n.t + 0.5)); seek(Math.max(0, n.t - 0.5)); play(); } },
      { label: n.prio ? 'Not urgent' : '❗ Must fix (urgent)', action: () => updateNote(n.id, { prio: !n.prio }) },
      { label: n.done ? 'Reopen' : '✓ Resolve', action: () => updateNote(n.id, { done: !n.done }) },
      { label: 'Move to the playhead', action: () => updateNote(n.id, { t: vid().currentTime }) },
      { label: 'Copy text with timecode', action: () => copyText(`${tc(n.t)}  ${n.text}`, 'Note copied') },
      n.frame ? { label: 'Show the frame grab file', action: () => window.hub.fs.reveal(n.frame) } : null,
      ...V.CATEGORIES.map((c) => ({ label: `${n.cat === c.id ? '✓ ' : '   '}${c.name}`, action: () => updateNote(n.id, { cat: c.id }) })),
      { label: 'Delete', danger: true, action: () => deleteNote(n.id) },
    ].filter(Boolean));
  }
  // Every open note in the library (for /inbox): newest videos first.
  function allOpenNotes() {
    return S.videos.flatMap((v) => notesOf(v.path).filter((n) => !n.done).map((n) => ({ path: v.path, note: n })));
  }
  function exportNotes(kind = 'md', { save = false } = {}) {
    const list = notesOf();
    if (!S.cur || !list.length) return '';
    const meta = { title: `Notes: ${base(S.cur.path)}`, file: S.cur.path, fps: S.fps, size: vid().videoWidth ? `${vid().videoWidth}×${vid().videoHeight}` : '' };
    const text = kind === 'csv' ? V.notesToCsv(list, meta) : kind === 'json' ? JSON.stringify(list, null, 2) : V.notesToMarkdown(list, meta);
    if (save) {
      window.hub.saveFile({ defaultPath: `${noExt(base(S.cur.path))} notes.${kind}`, filters: [{ name: kind.toUpperCase(), extensions: [kind] }], content: text })
        .then((p) => p && toast('Notes saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }));
    }
    return text;
  }
  // Carries the open notes of a version over to another one (e.g. v2 → v3) to check them off there.
  function carryNotes(toPath) {
    const open = notesOf().filter((n) => !n.done);
    if (!open.length || !toPath || toPath === S.cur.path) return 0;
    const target = (S.notes[toPath] ||= []);
    for (const n of open) target.push({ ...n, id: uid(), text: n.text, carried: base(S.cur.path) });
    target.sort((a, b) => a.t - b.t);
    saveNotes(); renderLibrary();
    return open.length;
  }
  function notesMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const newer = S.cur ? versionsOf(S.cur).filter((x) => x.path !== S.cur.path) : [];
    showMenu(r.left, r.bottom + 4, [
      { label: `${S.hideDone ? '✓ ' : '   '}Hide resolved`, action: () => { S.hideDone = !S.hideDone; store.set('review.hideDone', S.hideDone); renderNotes(); } },
      { label: 'Copy as Markdown checklist', action: () => copyText(exportNotes('md'), 'Notes copied') },
      { label: 'Save as Markdown…', action: () => exportNotes('md', { save: true }) },
      { label: 'Save as CSV…', action: () => exportNotes('csv', { save: true }) },
      { label: 'Save as JSON…', action: () => exportNotes('json', { save: true }) },
      ...newer.slice(0, 4).map((x) => ({ label: `Carry open notes to ${verLabel(x)} (${base(x.path)})`, action: () => { const n = carryNotes(x.path); toast(`${n} note${n === 1 ? '' : 's'} carried over`, { action: { label: 'Open it', fn: () => openVideo(x) } }); } })),
      { label: 'Resolve all', action: () => { for (const n of notesOf()) n.done = true; saveNotes(); renderNotes(); renderMarkers(); } },
      { label: 'Delete resolved notes', danger: true, action: () => { S.notes[S.cur.path] = notesOf().filter((n) => !n.done); saveNotes(); renderNotes(); renderMarkers(); renderLibrary(); } },
    ]);
  }

  // ---------- feedback to agents ----------
  // director = the agent docked here (Video Director), claude = the main Claude agent, astra = the Codex agent.
  function agentFor(key = 'director') {
    const k = String(key || 'director').toLowerCase();
    const all = H.agents().filter((a) => a.mode === 'native');
    if (k === 'director' || k === 'video') return Tools.dockedAgent('ae') || all.find((a) => a.videoTools) || H.claudeAgent();
    if (k === 'astra' || k === 'codex' || k === 'gpt') return all.find((a) => a.engine === 'codex') || null;
    if (k === 'claude') return H.claudeAgent();
    return all.find((a) => a.id.toLowerCase() === k || a.name.toLowerCase() === k) || null;
  }
  async function sendFeedback(key = 'director', { includeDone = false, sheet = false } = {}) {
    const list = notesOf().filter((n) => includeDone || !n.done);
    if (!S.cur || !list.length) { toast('No open notes to send', { type: 'error' }); return null; }
    const agent = agentFor(key);
    if (!agent) { toast(key === 'astra' ? 'Astra (a Codex agent) isn\'t set up' : 'Add a native Claude agent first', { type: 'error' }); return null; }
    const d = vid();
    list.sort((a, b) => Number(Boolean(b.prio)) - Number(Boolean(a.prio)) || a.t - b.t);
    const lines = list.map((n) => `- ${tc(n.t)} (${n.t.toFixed(2)} s) [${V.category(n.cat).name}${n.prio ? ', MUST FIX' : ''}]: ${n.text}${n.color ? ` [color ${n.color}]` : ''}${n.draw?.length ? ' (marked on the frame)' : ''}`).join('\n');
    const text = `Visual feedback on the render "${base(S.cur.path)}"\nFile: ${S.cur.path}\n${d.videoWidth}×${d.videoHeight} (${V.aspectOf(d.videoWidth, d.videoHeight)}), ${fmtDur(d.duration)}, timecodes at ${S.fps} fps.\n\n${lines}\n\nFind the After Effects script/project (or Lab sketch) that produces this render, apply these changes, and tell me what you changed and how to re-render. Frame grabs of each moment are attached.`;
    const frames = list.map((n) => n.frame).filter(Boolean);
    if (sheet) { try { const { image } = await contactSheet({ count: 12 }); frames.push(await window.hub.saveAttachment('contact-sheet.jpg', image.data)); } catch { /* optional */ } }
    activate(agent.id);
    Native.newChat(agent.id);
    Native.setDraft(agent.id, text);
    await Native.attachPaths(agent.id, frames);
    if (agent.dock === 'ae') setDock(true);
    toast(`Feedback is ready in ${agent.name}'s chat box. Add anything else, then send.`, { timeout: 5000 });
    emit('feedback', { agent: agent.id, count: list.length });
    return agent;
  }
  function sendMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const dir = agentFor('director'); const astra = agentFor('astra'); const claude = agentFor('claude');
    showMenu(r.left, r.top - 8, [
      dir ? { label: `Send to ${dir.name}`, action: () => sendFeedback('director') } : null,
      claude && claude !== dir ? { label: `Send to ${claude.name}`, action: () => sendFeedback('claude') } : null,
      astra ? { label: `Send to ${astra.name} (second opinion)`, action: () => sendFeedback('astra') } : null,
      { label: 'Send with a contact sheet of the whole video', action: () => sendFeedback('director', { sheet: true }) },
      { label: 'Include resolved notes', action: () => sendFeedback('director', { includeDone: true }) },
    ].filter(Boolean));
  }

  // ---------- export (ffmpeg) ----------
  const ffOverrides = () => ({ ffmpeg: H.settings().ffmpegPath || undefined });
  const exportJobs = new Map();
  window.hub.video?.onJob?.((ev) => {
    const j = exportJobs.get(ev.id);
    if (!j) return;
    if (ev.type === 'progress') { j.pct = ev.pct; j.toast.querySelector('span').textContent = `${j.label}: ${Math.round(ev.pct * 100)}%`; }
    if (ev.type === 'done') {
      exportJobs.delete(ev.id);
      j.toast.remove();
      if (ev.code === 0 && j.library === false) toast(`${j.label} done (${ev.seconds}s)`, { action: { label: IS_MAC ? 'Show in Finder' : 'Show in folder', fn: () => window.hub.fs.open(dirOf(ev.output)) }, timeout: 9000 });
      else if (ev.code === 0) {
        S.lib.exports = [...new Set([ev.output, ...S.lib.exports])].slice(0, 300); // exports show in the library even outside the watched folders
        saveLib();
        toast(`${j.label} done (${ev.seconds}s)`, { action: { label: 'Open', fn: () => load().then(() => openVideo(ev.output)) }, timeout: 9000 });
        load();
      } else if (!ev.cancelled) toast(`${j.label} failed: ${ev.error || ev.code}`, { type: 'error', timeout: 9000 });
      j.resolve(ev);
    }
  });
  async function runExport(presetId, { path, fit = 'crop', offset, range = 'auto', out } = {}) {
    const p = V.EXPORT_PRESETS.find((x) => x.id === presetId);
    if (!p) throw new Error(`Unknown preset “${presetId}”. Try /presets.`);
    S.tools ||= await window.hub.video.tools(ffOverrides());
    if (!S.tools.ffmpeg) { toast(`ffmpeg isn't installed, so Hearth can't export here. ${S.tools.hint}. The preset's settings: ${p.w || 'same'}×${p.h || 'same'}, ${p.fps || 'same'} fps, ${p.mbps ? `${p.mbps} Mbps` : p.codec}.`, { type: 'error', timeout: 10000 }); return null; }
    const src = path || S.cur?.path;
    if (!src) throw new Error('Open a video first');
    const m = S.meta[src] || {};
    const d = vid();
    const isCur = src === S.cur?.path;
    const info = { w: isCur ? d.videoWidth : m.w, h: isCur ? d.videoHeight : m.h, fps: isCur ? S.fps : m.fps || 30 };
    const useLoop = isCur && range !== 'all' && S.loop.a != null && S.loop.on;
    const { args, ext, w, h } = V.ffmpegArgs(p, info, { fit, offset: offset ?? (isCur ? S.overlay.cropOffset : 0.5), from: useLoop ? S.loop.a : undefined, to: useLoop ? S.loop.b : undefined });
    const output = out || join(dirOf(src), 'exports', `${noExt(base(src))}_${p.id}${w && h ? `_${w}x${h}` : ''}.${ext}`);
    const length = useLoop ? S.loop.b - S.loop.a : (isCur ? d.duration : m.d) || 0;
    const job = await startJob({ label: `Export ${p.name}`, input: src, output, args, duration: length });
    if (job) emit('export', { preset: p.id, output });
    return job;
  }
  // One ffmpeg job with a progress toast (Cancel) whose result joins the library (library: false for a folder of
  // stills); args may hold INPUT / OUTPUT placeholders. Also used by the cut (tools/video-cut.js).
  async function startJob({ label, input, output, args, duration, library = true }) {
    const id = `x${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
    const done = new Promise((resolve) => exportJobs.set(id, { label, resolve, pct: 0, library, toast: toast(`${label}: starting…`, { timeout: 0, action: { label: 'Cancel', fn: () => window.hub.video.cancel(id) } }) }));
    try { await window.hub.video.transcode({ id, input, output, args, duration }, ffOverrides()); } catch (err) { exportJobs.get(id)?.toast.remove(); exportJobs.delete(id); toast(err.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, ''), { type: 'error' }); return null; }
    return { id, output, done };
  }
  // One render → the four social formats (9:16, 4:5, 1:1, 16:9 minus the one it already is), one after another.
  async function exportAllSocials({ fit = 'crop' } = {}) {
    const d = vid();
    const cur = V.aspectOf(d.videoWidth, d.videoHeight);
    const ids = ['reels', 'feed45', 'square', 'yt1080'].filter((id) => { const p = V.EXPORT_PRESETS.find((x) => x.id === id); return V.aspectOf(p.w, p.h) !== cur; });
    const outs = [];
    for (const id of ids) { const j = await runExport(id, { fit }); if (!j) break; outs.push(j.output); await j.done; }
    return outs;
  }
  const estimateMB = (p, seconds) => (p.mbps && seconds ? ((p.mbps + 0.25) * seconds) / 8 : null);
  function exportMenu(anchor) {
    const d = vid();
    const cur = d?.videoWidth ? V.aspectOf(d.videoWidth, d.videoHeight) : null;
    const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2 - 150, top: innerHeight / 2 };
    const ff = Boolean(S.tools?.ffmpeg);
    const crop = S.overlay.crop;
    const items = V.EXPORT_PRESETS.map((p) => {
      const pf = p.w && p.h ? V.aspectOf(p.w, p.h) : null;
      const reshape = pf && cur && pf !== cur;
      const mb = estimateMB(p, S.loop.a != null && S.loop.on ? S.loop.b - S.loop.a : d?.duration);
      return { label: `${p.name}${p.w && p.h ? ` · ${p.w}×${p.h}` : ''}${p.fps ? ` · ${p.fps} fps` : ''}${p.mbps ? ` · ${p.mbps} Mbps` : ''}${mb ? ` · ≈${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB` : ''}${reshape ? ` (${crop === pf ? 'your crop' : 'center crop'})` : ''}`, action: () => (ff ? runExport(p.id) : showPreset(p)) };
    });
    showMenu(r.left, r.top - 8, [
      ff ? { label: 'Open the exports folder', action: () => S.cur && window.hub.fs.open(join(dirOf(S.cur.path), 'exports')).catch(() => toast('No exports yet')) } : null,
      { label: ff ? `Export with ffmpeg${S.loop.a != null && S.loop.on ? ' (the loop range)' : ''}:` : 'ffmpeg not found: click a preset to see its settings', action: () => (ff ? null : presetsDialog()) },
      ...items,
      ff ? { label: 'All social formats (9:16 · 4:5 · 1:1 · 16:9) in one go', action: () => exportAllSocials() } : null,
      ff ? { label: 'All social formats, blurred fill instead of crop', action: () => exportAllSocials({ fit: 'blur' }) } : null,
      { label: 'All presets with tips…', action: presetsDialog },
    ].filter(Boolean));
  }
  function showPreset(p) { Modal.alert(p.name, presetText(p)); }
  const presetText = (p) => `${p.w && p.h ? `${p.w}×${p.h}` : p.h ? `${p.h}p` : 'Same size as the source'} · ${p.fps ? `${p.fps} fps` : 'same frame rate'} · ${p.codec === 'prores' ? 'ProRes 422 HQ' : p.codec === 'vp9' ? 'VP9' : p.codec === 'gif' ? 'GIF' : `H.264 High, ${p.mbps} Mbps`} · audio ${p.audio}\nLimits: ${p.max}${p.tip ? `\n${p.tip}` : ''}`;
  async function presetsDialog() {
    const tmpl = await window.hub.ae.templates().catch(() => []);
    const lines = V.EXPORT_PRESETS.map((p) => {
      const om = V.omTemplatesFor(p, tmpl);
      return `■ ${p.name}\n${presetText(p)}${om.length ? `\nAE output modules that fit: ${om.slice(0, 3).join(', ')}` : ''}`;
    });
    Modal.alert('Export presets for socials', `${S.tools?.ffmpeg ? 'Export any of these from ⋯ → Export (ffmpeg found).' : `ffmpeg isn't installed: ${S.tools?.hint || ''}. These are the settings to use in AE / Media Encoder.`}\n\n${lines.join('\n\n')}`);
  }

  // ---------- contact sheet (also for the director) ----------
  const jpeg = (canvas, maxW = 1280, q = 0.82) => ({ data: shrink(canvas, maxW).toDataURL('image/jpeg', q).split(',')[1], mime: 'image/jpeg' });
  async function contactSheet({ count = 12, from = 0, to } = {}) {
    const { d, at, close } = await openDecoder(S.cur.path);
    const n = clamp(Math.round(count), 4, 24);
    const end = Math.min(d.duration, to ?? d.duration);
    const start = clamp(from, 0, end);
    const cols = n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const cw = 320; const ch = Math.round(cw * (d.videoHeight / d.videoWidth));
    const sheet = document.createElement('canvas');
    sheet.width = cols * cw; sheet.height = rows * ch;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    const times = [];
    for (let i = 0; i < n; i += 1) {
      const t = start + ((end - start) * (i + 0.5)) / n;
      await at(t);
      const x = (i % cols) * cw; const y = Math.floor(i / cols) * ch;
      ctx.drawImage(d, x, y, cw, ch);
      ctx.fillStyle = '#000b'; ctx.fillRect(x, y, 96, 20);
      ctx.fillStyle = '#ffd75e'; ctx.font = '13px Consolas, monospace'; ctx.fillText(`${t.toFixed(2)}s`, x + 5, y + 14); // plain seconds, same as the times listed to the agent
      times.push(Number(t.toFixed(2)));
    }
    close();
    return { image: jpeg(sheet, 1600, 0.8), times, canvas: sheet };
  }

  // ---------- director dock + toolkit (segmented control) ----------
  function setDock(open) {
    const s = H.surfaces.get('tool:ae');
    if (!s?.dockBtn) return false;
    const want = open ?? s.dock.hidden;
    if (want === s.dock.hidden) s.dockBtn.click();
    renderTop();
    return !s.dock.hidden;
  }
  async function directorSegment() {
    if (Tools.dockedAgent('ae')) { setDock(); return; }
    if (!(await Modal.confirm('Set up the Video Director?', 'A Claude agent docked here that looks at your renders (contact sheets, single frames), adds timecoded notes, compares versions and can render with aerender or run After Effects scripts. Its chat sits on the right of Video Review.', { ok: 'Add it' }))) return;
    H.config.agents.push({ id: `videodirector${H.agent('videodirector') ? Date.now() : ''}`, name: 'Video Director', icon: '🎬', color: '#bd8bff', mode: 'native', engine: 'claude', dock: 'ae', videoTools: true, selfReview: true, enabled: true });
    await saveConfig();
    setTimeout(() => { Tools.syncDocks(); setDock(true); }, 300);
  }

  // ---------- keyboard ----------
  const KEYS = [
    ['Space / K', 'Play · pause'], ['J / L', 'Shuttle back / forward (press again: 2×, 4×, 8×)'], ['← / →', 'One frame (Shift: 10)'], ['↑ / ↓', 'Previous / next note'],
    [', / .', 'Previous / next beat'], ['Home / End', 'Start / end'], ['I / O', 'Loop in / out at the playhead'], ['X', 'Clear loop'], ['Shift+L', 'Loop on / off'],
    ['N', 'New note at the playhead'], ['D', 'Draw on the frame'], ['P', 'Color picker'], ['Y', 'Scopes'], ['C', 'Compare mode (with B open)'], ['\\', 'Swap A / B'],
    ['G', 'Next guide'], ['S', 'Next safe zone'], ['Z', 'Zoom 100% / fit (wheel zooms, drag pans)'], ['F', 'Fullscreen'], ['M', 'Mute'], ['B', 'Show / hide the library'], ['E', 'Cut clips: split, trim, reorder, speed, fades, export (? there lists its keys)'],
    ['[ / ]', 'Slower / faster'], ['< / >', 'Previous / next section or drop'], ['V', 'Next view: R / G / B / luma / negative…'], ['H', 'Mirror the frame'], ['T', 'Timecode / seconds / frames'], ['- / =', 'Volume'], [`${MOD}+C`, 'Copy frame'], [`${MOD}+S`, 'Save frame'], ['?', 'This list'],
  ];
  function shortcutsHelp() { Modal.alert('Video Review shortcuts', KEYS.map(([k, d]) => `${k.padEnd(12)} ${d}`).join('\n')); }
  function onKey(e) {
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key;
    const lk = k.toLowerCase();
    if (Cut()?.onKey(e)) {
      e.preventDefault();
      if (k === ' ' && e.target.closest('button')) e.target.addEventListener('keyup', (u) => u.preventDefault(), { once: true });
      return;
    }
    if (e.ctrlKey && lk === 'c' && !getSelection().toString()) { e.preventDefault(); copyFrame(); return; }
    if (e.ctrlKey && lk === 's') { e.preventDefault(); saveFrame(); return; }
    if (e.ctrlKey || e.metaKey) return;
    const act = {
      ' ': togglePlay, k: () => shuttle(0), j: () => shuttle(-1), l: () => (e.shiftKey ? toggleLoop() : shuttle(1)),
      arrowleft: () => step(e.shiftKey ? -10 : -1), arrowright: () => step(e.shiftKey ? 10 : 1),
      arrowup: () => jumpNote(-1), arrowdown: () => jumpNote(1),
      ',': () => { const b = beatsNear(vid().currentTime, -1); if (b != null) seek(b); }, '.': () => { const b = beatsNear(vid().currentTime, 1); if (b != null) seek(b); },
      '<': () => jumpDrop(-1), '>': () => jumpDrop(1), v: () => cycleView(), h: () => setMirror(), t: () => flash(`Time in ${cycleTimeMode() === 'tc' ? 'timecode' : S.timeMode === 'sec' ? 'seconds' : 'frames'}`),
      '-': () => setVolume(vid().volume - 0.1), '=': () => setVolume(vid().volume + 0.1), '+': () => setVolume(vid().volume + 0.1),
      home: () => seek(0), end: () => seek(dur()), i: () => setLoop(vid().currentTime, S.loop.b ?? dur()), o: () => setLoop(S.loop.a ?? 0, vid().currentTime), x: () => setLoop(null),
      n: () => openComposer(), d: () => setDraw(), p: () => setPick(), y: () => setScopes(), c: () => cycleCompare(), '\\': swapAB,
      g: () => cycleOverlay('guide'), s: () => cycleOverlay('safe'), z: () => zoomTo(S.zoom.s === 1 ? '100' : 'fit'), f: fullscreen,
      m: () => { vid().muted = !vid().muted; flash(vid().muted ? 'Muted' : 'Sound on'); }, b: toggleLib,
      '[': () => nudgeSpeed(-1), ']': () => nudgeSpeed(1), '?': shortcutsHelp, e: () => VC()?.toggle(), escape: () => { if (S.draw.on) setDraw(false); else if (S.pick) setPick(false); else if (S.compose) closeComposer(); },
    }[lk];
    if (act) {
      e.preventDefault();
      // Space on a focused button (the library card or control you just clicked) plays / pauses; it no longer also
      // "clicks" that button on key-up (which reopened the render at 0:00)
      if (k === ' ' && e.target.closest('button')) e.target.addEventListener('keyup', (u) => u.preventDefault(), { once: true });
      act();
    }
  }
  function jumpDrop(dir) {
    const t = vid().currentTime;
    const drops = [...(S.audio?.drops || []), ...(S.audio?.sections || []).map((x) => x.start)].sort((a, b) => a - b);
    const x = dir > 0 ? drops.find((d) => d > t + 0.05) : [...drops].reverse().find((d) => d < t - 0.05);
    if (x != null) { seek(x); flash(dir > 0 ? 'Next section ▸' : '◂ Previous section'); }
  }
  function cycleView() { const i = VIEWS.findIndex(([k]) => k === S.view); setView(VIEWS[(i + 1) % VIEWS.length][0]); if (!S.view) flash('Normal view'); }
  function setVolume(v) { const x = clamp(Number(v), 0, 1); vid().volume = x; vid().muted = x === 0; store.set('review.volume', x); flash(`Volume ${Math.round(x * 100)}%`); return x; }
  function toggleLoop(force) {
    if (S.loop.a == null) return false;
    S.loop.on = force ?? !S.loop.on;
    flash(S.loop.on ? 'Loop on' : 'Loop off');
    renderMarkers(); drawTimeline();
    refs.loopBtn.classList.toggle('on', S.loop.on);
    return S.loop.on;
  }
  function jumpNote(dir) {
    const t = vid().currentTime;
    const list = notesOf();
    const n = dir > 0 ? list.find((x) => x.t > t + 0.5 / S.fps) : [...list].reverse().find((x) => x.t < t - 0.5 / S.fps);
    if (n) selectNote(n.id);
  }
  function nudgeSpeed(dir) { const i = SPEEDS.indexOf(Number(refs.speed.value)); const s = SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)]; setSpeed(s); flash(`${s}×`); }
  function cycleCompare() {
    if (!S.cmp.path) { compareMenu(refs.cmpBtn); return; }
    const i = CMP_MODES.findIndex(([m]) => m === S.cmp.mode);
    setCompareMode(CMP_MODES[(i + 1) % CMP_MODES.length][0]);
  }
  function cycleOverlay(kind) {
    const d = vid();
    const ids = kind === 'safe' ? ['', ...V.zonesFor(d.videoWidth, d.videoHeight)] : ['', ...V.GUIDES.map((g) => g.id)];
    const cur = kind === 'safe' ? S.overlay.safe : S.overlay.guide;
    const next = ids[(ids.indexOf(cur) + 1) % ids.length];
    if (kind === 'safe') setSafe(next); else setGuide(next);
    flash(next ? (kind === 'safe' ? V.SAFE_ZONES[next].name : V.GUIDES.find((g) => g.id === next).name) : 'No overlay');
  }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else refs.main.requestFullscreen?.(); }
  // Wide: the library column shows / hides. Narrow (Director chat open): it slides over the player as a drawer.
  const narrow = () => refs.root.clientWidth <= 940;
  function toggleLib(force) {
    if (narrow()) { const open = force ?? !refs.root.classList.contains('lib-open'); refs.root.classList.toggle('lib-open', open); return open; }
    const hide = force != null ? !force : !refs.root.classList.contains('lib-hidden');
    refs.root.classList.toggle('lib-hidden', hide);
    store.set('review.libHidden', hide);
    requestAnimationFrame(() => { drawTimeline(); applyZoom(); });
    return !hide;
  }

  // ---------- more menu ----------
  function moreMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    // round 4: the Director / Toolkit / Flow tabs live here (the tab row only shows while one of them is open)
    const segBtn = (re) => [...(refs.main?.querySelectorAll('.vr-seg button') || [])].find((b) => re.test(b.textContent));
    showMenu(r.right - 280, r.bottom + 4, [
      { label: `💬 ${refs.segDirector?.textContent || 'Director'} chat`, action: () => refs.segDirector?.click() },
      { label: '🧰 After Effects toolkit', action: () => AEKit.openKit?.() },
      segBtn(/Flow/) ? { label: '⧉ Flow: the pipeline as nodes', action: () => segBtn(/Flow/)?.click() } : null,
      { label: 'Export for social…', action: () => exportMenu(anchor) },
      VC() && S.cur ? { label: `✂ ${VideoCut.active ? 'Back to the review' : 'Cut clips'} (E)`, action: () => VideoCut.toggle() } : null,
      { more: true, label: 'Export presets and tips', action: presetsDialog },
      S.tools?.ffmpeg && S.cur ? { more: true, label: 'Make a playable copy (H.264 proxy)', action: () => runExport('proxy') } : null,
      { more: true, label: 'Contact sheet of this video (save)', action: async () => { if (!S.cur) return; const { canvas } = await contactSheet({ count: 16 }); const p = await window.hub.saveFile({ defaultPath: `${noExt(base(S.cur.path))} sheet.jpg`, filters: [{ name: 'JPEG', extensions: ['jpg'] }], content: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], base64: true }); if (p) toast('Contact sheet saved'); } },
      { label: 'Save frame as PNG…', action: saveFrame }, { more: true, label: 'Copy frame', action: copyFrame },
      { more: true, label: `Frame rate: ${S.fps} fps (${S.fpsSource})…`, action: fpsMenu },
      { more: true, label: 'Tags…', action: () => editTags() },
      { label: 'Watched folders…', action: editFolders },
      { more: true, label: 'Rescan now', action: () => load(true) },
      { more: true, label: `ffmpeg: ${S.tools?.ffmpeg || 'not found'}…`, action: setFfmpegPath },
      { label: IS_MAC ? 'Show in Finder' : 'Show in folder', action: () => S.cur && window.hub.fs.reveal(S.cur.path) },
      { more: true, label: 'Open in default player', action: () => S.cur && window.hub.fs.open(S.cur.path) },
      { more: true, label: 'Keyboard shortcuts (?)', action: shortcutsHelp },
    ].filter(Boolean));
  }
  function fpsMenu() {
    const r = refs.fpsBtn.getBoundingClientRect();
    showMenu(r.left, r.top - 8, [
      ...FPS_CHOICES.map((f) => ({ label: `${f === S.fps ? '✓ ' : '   '}${f} fps`, action: () => setFpsUser(f) })),
      { label: 'Use the detected rate', action: () => { if (S.cur) { delete S.meta[S.cur.path]?.fpsUser; if (S.meta[S.cur.path]) delete S.meta[S.cur.path].fps; detectFps(S.cur); } } },
    ]);
  }
  function setFpsUser(f) {
    setFps(f, 'yours');
    store.set('review.fps', Number(f));
    if (S.cur) { S.meta[S.cur.path] = { ...(S.meta[S.cur.path] || {}), fpsUser: Number(f) }; saveMeta(); }
    return S.fps;
  }
  async function editFolders() {
    const dirs = await videoDirs();
    const v = await Modal.prompt('Folders to watch for renders', { multiline: true, value: dirs.join('\n'), label: 'One folder per line; subfolders are included. New files show up by themselves.' });
    if (v == null) return;
    await setFolders(v.split('\n'));
  }
  async function setFolders(list) {
    H.config.settings = { ...H.config.settings, videoDirs: list.map((x) => x.trim()).filter(Boolean) };
    await saveConfig();
    await load(true);
    return H.settings().videoDirs;
  }
  async function setFfmpegPath() {
    const v = await Modal.prompt('ffmpeg program', { value: H.settings().ffmpegPath || S.tools?.ffmpeg || '', label: IS_MAC ? 'Usually /opt/homebrew/bin/ffmpeg (brew install ffmpeg). Empty = find it automatically.' : 'Empty = find it automatically (winget install Gyan.FFmpeg).' });
    if (v == null) return;
    H.config.settings = { ...H.config.settings, ffmpegPath: v.trim() || undefined };
    await saveConfig();
    S.tools = await window.hub.video.tools(ffOverrides());
    toast(S.tools.ffmpeg ? `ffmpeg: ${S.tools.ffmpeg}` : 'ffmpeg still not found', { type: S.tools.ffmpeg ? 'info' : 'error' });
  }

  // ---------- mount ----------
  function mount(root) {
    const ico = (text, title, fn, cls = '') => el('button', { class: `vr-ico ${cls}`, text, title, on: { click: fn } });
    refs.root = root;
    // library
    refs.search = el('input', { type: 'search', placeholder: 'Search · #tag · 9:16…', on: { input: debounce(() => setFilter({ q: refs.search.value }), 120) } });
    refs.count = el('span', { class: 'vr-count' });
    refs.chips = el('div', { class: 'vr-chips' }, ...[['all', 'All'], ...V.MAIN_FORMATS.map((f) => [f, f]), ['fav', '★'], ['notes', '✎ Open notes'], ['lab', 'Lab']].map(([f, label]) => el('button', {
      class: 'vr-chip', dataset: { f }, text: label, title: f === 'fav' ? 'Favorites' : f === 'lab' ? 'Recorded in the Three.js Lab' : f === 'notes' ? 'Has open notes' : f === 'all' ? 'Everything' : `${V.formatInfo(f).name} ${V.formatInfo(f).w}×${V.formatInfo(f).h} · ${V.formatInfo(f).hint}`,
      on: { click: () => (f === 'all' ? setFilter({ fmt: 'all', fav: false, notes: false, lab: false }) : f === 'fav' ? setFilter({ fav: !S.filter.fav }) : f === 'notes' ? setFilter({ notes: !S.filter.notes }) : f === 'lab' ? setFilter({ lab: !S.filter.lab }) : setFilter({ fmt: S.filter.fmt === f ? 'all' : f })) },
    })));
    refs.list = el('div', { class: 'vr-list' });
    const lib = el('aside', { class: 'vr-lib' },
      el('div', { class: 'vr-lib-head' }, refs.search, ico('⇅', 'Sort and filter', sortMenu), ico('⟳', 'Rescan now', () => load(true))),
      refs.chips, refs.list,
      el('div', { class: 'vr-lib-foot' }, refs.count, el('span', { class: 'spacer' }), el('button', { class: 'vr-link', text: 'Folders…', title: 'Which folders to watch for renders', on: { click: editFolders } })));

    // stage
    refs.video = el('video', { class: 'vr-video vr-a', playsInline: true, preload: 'auto' });
    refs.cmp = el('video', { class: 'vr-video vr-b', playsInline: true, muted: true });
    refs.overlay = el('div', { class: 'vr-overlay' });
    refs.drawSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    refs.drawSvg.setAttribute('class', 'vr-draw');
    refs.drawSvg.setAttribute('preserveAspectRatio', 'none');
    refs.drawSvg.addEventListener('pointerdown', (e) => { if (S.draw.on) { e.stopPropagation(); startStroke(e); } });
    refs.wipeLine = el('div', { class: 'vr-wipe' });
    refs.aLabel = el('span', { class: 'vr-label a' });
    refs.cmpLabel = el('span', { class: 'vr-label b' });
    refs.frame = el('div', { class: 'vr-frame' }, refs.video, refs.cmp, refs.overlay, refs.drawSvg, refs.wipeLine, refs.aLabel, refs.cmpLabel);
    refs.flash = el('div', { class: 'vr-flash' });
    refs.zoomLabel = el('span', { class: 'vr-zoom' });
    refs.pickChip = el('div', { class: 'vr-pickchip', hidden: true, title: 'Click to copy', on: { click: () => S.picked && copyText(S.picked.hex, 'Color copied') } });
    refs.hist = el('canvas', { width: 256, height: 72 });
    refs.wave = el('canvas', { width: 192, height: 64 });
    refs.scopeInfo = el('div', { class: 'vr-scope-info' });
    refs.scopes = el('div', { class: 'vr-scopes', hidden: true }, refs.hist, refs.wave, refs.scopeInfo);
    refs.stage = el('div', { class: 'vr-stage' }, refs.frame, refs.flash, refs.zoomLabel, refs.pickChip, refs.scopes);
    stageEvents(refs.stage);

    // timeline
    refs.tl = el('canvas', { class: 'vr-tl' });
    refs.markers = el('div', { class: 'vr-marks' });
    refs.head = el('div', { class: 'vr-head' });
    refs.hoverImg = el('img', { alt: '' });
    refs.hoverTc = el('span');
    refs.hover = el('div', { class: 'vr-hover', hidden: true }, refs.hoverImg, refs.hoverTc);
    const tlBox = refs.tlBox = el('div', { class: 'vr-timeline', title: 'Drag to scrub · drag the top strip to set a loop · double-click a section to loop it' }, refs.tl, refs.markers, refs.head, refs.hover);
    timelineEvents(tlBox);
    new ResizeObserver(() => { refs.tlW = tlBox.clientWidth; headG.key = ''; headG.x = -1; drawTimeline(); applyZoom(); }).observe(tlBox);

    // transport
    refs.play = el('button', { class: 'vr-play', text: '▶', title: 'Play / pause (Space)', on: { click: togglePlay } });
    refs.time = el('input', { class: 'vr-time', value: '00:00:00:00', title: 'Type a time and press Enter: 1:23, 12.5, 00:00:04:12, f240, +10f, 50%', on: {
      keydown: (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Enter') goto(refs.time.value); refs.time.blur(); refs.root.focus({ preventScroll: true }); } }, // keys keep working after Enter
    } });
    refs.timeTotal = el('span', { class: 'vr-time-total', title: 'Click: timecode / seconds / frames (T)', on: { click: () => cycleTimeMode() } });
    refs.speed = el('select', { class: 'vr-speed', title: 'Playback speed ([ and ])', on: { change: (e) => setSpeed(e.target.value) } }, SPEEDS.map((s) => el('option', { value: s, text: `${s}×`, selected: s === 1 })));
    refs.fpsBtn = el('button', { class: 'vr-ico vr-fps', text: `${S.fps} fps`, on: { click: fpsMenu } });
    refs.loopBtn = ico('⟲', 'Loop the in/out range (I / O to set, drag the top of the timeline, Shift+L on/off, X clears)', () => (S.loop.a == null ? setLoop(vid().currentTime, Math.min(dur(), vid().currentTime + 2)) : toggleLoop()));
    refs.cmpBtn = ico('A|B', 'Compare with another version: wipe, side by side, onion, difference (C cycles, \\ swaps)', (e) => compareMenu(e.currentTarget), 'vr-ab');
    refs.overlayBtn = ico('▦', 'Safe zones (TikTok / Reels / Shorts…), guides and crop previews (S, G)', (e) => overlayMenu(e.currentTarget));
    refs.drawBtn = ico('✎', 'Draw on the frame for a note (D)', () => setDraw());
    refs.pickBtn = ico('◉', 'Color picker (P)', () => setPick());
    refs.scopesBtn = ico('▤', 'Scopes: histogram and luma waveform (Y)', () => setScopes());
    refs.viewBtn = ico('◐', 'View: one channel, luma, negative, mirrored, ping-pong loop (V, H)', (e) => viewMenu(e.currentTarget));
    refs.bpm = el('span', { class: 'vr-bpm', title: 'Tempo and beats found in the audio (, and . jump between beats)' });
    refs.info = el('div', { class: 'vr-info' });
    const transport = el('div', { class: 'vr-transport' },
      el('div', { class: 'vr-tgroup' }, ico('⏮', 'Start (Home)', () => (Cut() ? Cut().goto(0) : seek(0)), 'vr-skip'), ico('◂', 'Previous frame (←)', () => step(-1)), refs.play, ico('▸', 'Next frame (→)', () => step(1)), ico('⏭', 'End (End)', () => (Cut() ? Cut().goto(1e9) : seek(dur())), 'vr-skip')),
      el('div', { class: 'vr-tgroup vr-tc-group' }, refs.time, refs.timeTotal),
      el('div', { class: 'vr-tgroup' }, refs.speed, refs.fpsBtn, refs.loopBtn),
      el('span', { class: 'spacer' }), refs.bpm,
      refs.toolGroup = el('div', { class: 'vr-tgroup' }, refs.cmpBtn, refs.overlayBtn, refs.viewBtn, refs.drawBtn, refs.pickBtn, refs.scopesBtn,
        ico('⧉', `Copy frame (${MOD}+C) · right-click: save PNG`, copyFrame), ico('⛶', 'Fullscreen review (F)', fullscreen)));
    transport.querySelector('[title^="Copy frame"]').addEventListener('contextmenu', (e) => { e.preventDefault(); saveFrame(); });

    // top bar
    refs.title = el('b', { class: 'vr-title', text: 'Pick a render' });
    refs.sub = el('span', { class: 'vr-sub' });
    refs.favBtn = ico('☆', 'Favorite', () => toggleFav(), 'vr-fav');
    refs.versions = el('div', { class: 'vr-versions' });
    refs.segDirector = el('button', { text: 'Director', title: 'Show or hide the Video Director chat', on: { click: directorSegment } });
    const seg = el('div', { class: 'vr-seg', role: 'tablist' },
      el('button', { class: 'on', text: 'Review', title: 'The render library, player and notes', on: { click: () => AEKit.openKit?.(false) } }),
      refs.segDirector,
      el('button', { text: 'Toolkit', title: 'After Effects toolkit: expressions, scripts, render queue, calculators, comp presets, palette, projects, shortcuts', on: { click: () => AEKit.openKit?.() } }));
    const top = el('div', { class: 'vr-top' },
      ico('☰', 'Show / hide the library (B)', () => toggleLib(), 'vr-libtoggle'),
      el('div', { class: 'vr-heading' }, el('div', { class: 'vr-title-row' }, refs.title, refs.favBtn), refs.sub),
      refs.versions, el('span', { class: 'spacer' }), seg, ico('⋯', 'More: export, frame rate, folders, shortcuts…', (e) => moreMenu(e.currentTarget)));
    refs.main = el('section', { class: 'vr-main' }, top, refs.stage, tlBox, transport, refs.info);
    window.VideoNodes?.attach?.({ main: refs.main, seg, top }); // "Flow" segment: the pipeline as runnable nodes (nodes-video.js)
    VC()?.mount({ refs, S, fileUrl, startJob, flash }); // ✂ clip editing (tools/video-cut.js)

    // notes
    refs.noteCount = el('span', { class: 'vr-count' });
    refs.catSel = el('select', { class: 'vr-catsel', title: 'Show one category', on: { change: (e) => { S.catFilter = e.target.value; renderNotes(); renderMarkers(); } } },
      el('option', { value: '', text: 'All' }), V.CATEGORIES.map((c) => el('option', { value: c.id, text: c.name })));
    refs.composer = el('div', { class: 'vr-composer', hidden: true });
    refs.noteList = el('div', { class: 'vr-notelist' });
    refs.sendBtn = el('button', { class: 'primary vr-send', text: 'Send feedback', title: 'Writes your open notes and frame grabs into the Video Director\'s chat, ready to send', on: { click: () => sendFeedback('director') } });
    const notes = el('aside', { class: 'vr-notes' },
      el('div', { class: 'vr-notes-head' }, el('b', { text: 'Notes' }), refs.noteCount, el('span', { class: 'spacer' }), refs.catSel,
        ico('＋', 'New note at the playhead (N)', () => openComposer(), 'vr-add'), ico('⋯', 'Export, carry to a newer version, resolve…', (e) => notesMenu(e.currentTarget))),
      refs.composer, refs.noteList,
      el('div', { class: 'vr-notes-foot' }, refs.sendBtn, ico('▾', 'Send to Claude, Astra, with a contact sheet…', (e) => sendMenu(e.currentTarget), 'vr-send-more')));

    root.append(el('div', { class: 'vr' }, lib, refs.main, notes), filterDefs());
    vid().volume = store.get('review.volume', 1);
    root.classList.toggle('lib-hidden', store.get('review.libHidden', false));
    root.addEventListener('keydown', onKey);
    root.tabIndex = -1;
    vid().addEventListener('seeked', () => { scopesDirty = true; });
    vid().addEventListener('pause', () => { scopesDirty = true; });
    // a loop that ends at the clip's end: when a frame comes late the video can reach its end before the per-frame
    // check sends it back, and it stopped there; it loops on instead
    vid().addEventListener('ended', () => {
      const { a, on } = S.loop;
      if (!on || a == null || S.shuttle) return;
      if (S.pingpong) { refs.cmp.pause(); S.shuttle = -Number(refs.speed.value || 1); } else { seek(a); play(); }
    });
    requestAnimationFrame(tick);
    window.hub.video?.tools(ffOverrides()).then((t) => { S.tools = t; });
    load();
  }

  // Stage: wheel zooms at the cursor, drag pans when zoomed (or with the middle button), drag moves the wipe,
  // click plays / pauses, picks a color or draws.
  function stageEvents(stage) {
    stage.addEventListener('wheel', (e) => { if (!vid().videoWidth) return; e.preventDefault(); setZoom(S.zoom.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
    stage.addEventListener('dblclick', (e) => { if (!S.draw.on) { e.preventDefault(); setZoom(1); } });
    stage.addEventListener('pointerdown', (e) => {
      if (S.draw.on || e.target.closest('.vr-crop, .vr-scopes, .vr-pickchip')) return;
      if (S.pick && e.button === 0) { pickAt(e); setPick(false); return; }
      const start = { x: e.clientX, y: e.clientY, zx: S.zoom.x, zy: S.zoom.y };
      const wiping = S.cmp.path && S.cmp.mode === 'wipe' && e.button === 0 && S.zoom.s === 1;
      const panning = e.button === 1 || (e.button === 0 && S.zoom.s > 1);
      let moved = false;
      stage.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) moved = true;
        if (!moved) return;
        if (panning) { S.zoom.x = start.zx + ev.clientX - start.x; S.zoom.y = start.zy + ev.clientY - start.y; applyZoom(); } else if (wiping) { const r = refs.frame.getBoundingClientRect(); setWipe((ev.clientX - r.left) / r.width); }
      };
      stage.addEventListener('pointermove', mv);
      stage.addEventListener('pointerup', () => { stage.removeEventListener('pointermove', mv); if (!moved && e.button === 0) togglePlay(); }, { once: true });
    });
    stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'New note here (N)', action: () => openComposer() }, { label: 'Draw on this frame (D)', action: () => setDraw(true) },
        { label: 'Pick a color here', action: () => pickAt(e) }, { label: 'Copy frame', action: copyFrame }, { label: 'Save frame as PNG…', action: saveFrame },
        { label: 'Zoom to fit', action: () => setZoom(1) }, { label: 'Zoom 100% (real pixels)', action: () => zoomTo('100') }, { label: 'Zoom 200%', action: () => zoomTo(200) },
      ]);
    });
  }

  function goto(text) {
    if (Cut()) { const t = V.parseTime(text, Cut().fps || S.fps, Cut().time, CutData.total(Cut().edit)); if (t == null) { toast(`Can't read the time “${text}”.`, { type: 'error' }); return null; } Cut().goto(t); return t; }
    const t = V.parseTime(text, S.fps, vid().currentTime, dur());
    if (t == null) { toast(`Can't read the time “${text}”. Try 1:23, 12.5, 00:00:04:12, f240, +10f or 50%.`, { type: 'error' }); return null; }
    pause(); seek(t);
    return t;
  }

  let lastNewest = 0;
  async function load(manual = false) {
    if (manual && refs.list) refs.list.replaceChildren(el('p', { class: 'hint vr-empty', text: 'Scanning for renders…' }));
    if (!load.once) {
      load.once = true;
      [S.notes, S.lib, S.meta] = await Promise.all([window.hub.kvGet('video-notes', {}), window.hub.kvGet('video-library', {}), window.hub.kvGet('video-meta', {})]);
      S.lib = { fav: [], tags: {}, recordings: [], exports: [], ...S.lib };
      upgradeNotes();
    }
    const next = await scan();
    const newest = next[0]?.mtime || 0;
    if (lastNewest && newest > lastNewest) {
      const fresh = next.filter((v) => v.mtime > lastNewest);
      toast(`New render: ${base(fresh[0].path)}`, { action: { label: 'Watch', fn: () => openVideo(fresh[0]) }, timeout: 9000 });
      emit('new', { paths: fresh.map((v) => v.path) });
    }
    const dirsChanged = next.length !== S.videos.length;
    lastNewest = newest;
    S.videos = next;
    renderLibrary(); renderNotes(); renderMarkers();
    if (!S.cur) {
      const last = S.videos.find((v) => v.path === store.get('review.last', '')) || S.videos[0];
      if (last) openVideo(last);
    }
    if (dirsChanged || manual) watchFolders();
    return S.videos;
  }
  // Rescan every 20 s while the tool is visible (folder watches cover most changes instantly).
  setInterval(() => { if (refs.list?.isConnected && refs.list.checkVisibility({ visibilityProperty: true })) load(); }, 20000); // (offsetParent is set on a hidden surface too)

  // Lab recordings: three-media calls this after saving one, wherever it was saved.
  async function noteRecording(path) {
    if (!path) return;
    // Video Review may never have opened this session: read your saved library first, so this write doesn't
    // replace favorites, tags and exports with the empty placeholder.
    if (!load.once) S.lib = { fav: [], tags: {}, recordings: [], exports: [], ...(await window.hub.kvGet('video-library', {})) };
    S.lib.recordings = [path, ...S.lib.recordings.filter((p) => p !== path)].slice(0, 300);
    window.hub.kvSet('video-library', S.lib);
    if (refs.list) load();
  }

  // ---------- tools for the Video Director (Claude) ----------
  const pendingRenders = new Map();
  window.hub.ae.onRender((ev) => {
    const p = pendingRenders.get(ev.id);
    if (!p) return;
    if (ev.type === 'log') { p.log.push(ev.line); if (p.log.length > 200) p.log.shift(); }
    if (ev.type === 'progress') p.pct = ev.pct;
    if (ev.type === 'done') { pendingRenders.delete(ev.id); p.resolve(ev); }
  });
  async function ensureMounted() {
    if (!refs.video) Tools.shown(Tools.get('ae')); // load the screen in the background if needed
    if (!refs.video) return false;
    if (!load.once || !S.videos.length) await load();
    return true;
  }
  async function waitReady() {
    await new Promise((res) => { if (vid().readyState >= 1) res(); else { vid().addEventListener('loadedmetadata', res, { once: true }); vid().addEventListener('error', res, { once: true }); setTimeout(res, 8000); } });
  }
  async function waitSeek() { await new Promise((res) => { if (!vid().seeking) res(); else { vid().addEventListener('seeked', res, { once: true }); setTimeout(res, 3000); } }); }
  const statusValue = () => {
    const d = vid();
    return { open: S.cur.path, resolution: `${d.videoWidth}x${d.videoHeight}`, format: V.aspectOf(d.videoWidth, d.videoHeight), duration: Number((d.duration || 0).toFixed(2)), time: Number(d.currentTime.toFixed(3)), timecode: tc(d.currentTime), frame: frameNow(), fps: S.fps, fpsSource: S.fpsSource, paused: d.paused,
      cut: VC()?.statusOf(S.cur.path) || undefined,
      loop: S.loop.a != null ? { in: Number(S.loop.a.toFixed(3)), out: Number((S.loop.b ?? d.duration).toFixed(3)), on: S.loop.on } : null, bpm: S.audio?.bpm, comparingWith: S.cmp.path, compareMode: S.cmp.path ? S.cmp.mode : undefined, overlay: S.overlay.safe || S.overlay.guide || S.overlay.crop || null,
      notes: notesOf().map((n, i) => ({ n: i + 1, time: Number(n.t.toFixed(2)), timecode: tc(n.t), category: n.cat, text: n.text, resolved: n.done || undefined, color: n.color || undefined, by: n.by !== 'you' ? n.by : undefined })) };
  };
  async function handleTool(tool, args) {
    if (!(await ensureMounted())) return { ok: false, error: 'Video Review could not be loaded.' };
    const say = (text) => toast(`Video Director: ${text}`, { timeout: 2500 });
    if (tool === 'video_list') {
      const q = (args.search || '').toLowerCase();
      return { ok: true, value: S.videos.filter((v) => !q || v.path.toLowerCase().includes(q) || tagsOf(v.path).includes(q.replace(/^#/, ''))).slice(0, Math.min(100, args.limit || 20))
        .map((v) => { const m = metaOf(v); return { path: v.path, name: base(v.path), format: m ? V.aspectOf(m.w, m.h) : undefined, seconds: m?.d, sizeMB: Number((v.size / 1048576).toFixed(1)), modified: new Date(v.mtime).toISOString(), lab: v.lab || undefined, openNotes: notesOf(v.path).filter((n) => !n.done).length || undefined, open: v.path === S.cur?.path || undefined }; }) };
    }
    if (tool === 'video_status') {
      if (!S.cur) return { ok: true, value: { open: null, note: 'Nothing open. Use video_list and video_open.' } };
      return { ok: true, value: statusValue() };
    }
    if (tool === 'video_open') {
      const p = String(args.path || '');
      const st = await window.hub.fs.stat(p);
      if (!st) return { ok: false, error: `File not found: ${p}` };
      const v = S.videos.find((x) => x.path.toLowerCase() === p.toLowerCase()) || { path: p, size: st.size, mtime: st.mtime };
      await openVideo(v);
      await waitReady();
      say(`opened ${base(p)}`);
      return { ok: true, value: { opened: p, resolution: `${vid().videoWidth}x${vid().videoHeight}`, duration: Number((vid().duration || 0).toFixed(2)) } };
    }
    if (!S.cur) return { ok: false, error: 'No video is open. Use video_list and video_open first.' };
    if (tool === 'video_frame') {
      if (args.time != null) { pause(); seek(Number(args.time)); await waitSeek(); }
      const t = vid().currentTime;
      return { ok: true, images: [jpeg(await grabCanvas())], value: `Frame at ${tc(t)} (${t.toFixed(2)} s) of ${base(S.cur.path)}` };
    }
    if (tool === 'video_contact_sheet') {
      say('looking through the render…');
      const { image, times } = await contactSheet(args);
      return { ok: true, images: [image], value: `Contact sheet of ${base(S.cur.path)}: ${times.length} frames at ${times.map((t) => `${t}s`).join(', ')} (left to right, top to bottom). Quote times in seconds like these when you talk to the user.` };
    }
    if (tool === 'video_add_note') {
      const t = Math.max(0, Number(args.time) || 0);
      const n = await addNote(String(args.text || ''), { t, cat: V.CATEGORIES.some((c) => c.id === args.category) ? args.category : undefined, by: 'director' });
      return { ok: true, value: `Note #${notesOf().indexOf(n) + 1} added at ${tc(t)}.` };
    }
    if (tool === 'video_compare') {
      const st = await window.hub.fs.stat(String(args.path || ''));
      if (!st) return { ok: false, error: `File not found: ${args.path}` };
      await compareWith(args.path, args.mode);
      say('A/B compare on');
      return { ok: true, value: `Comparing A=${base(S.cur.path)} with B=${base(args.path)} (${S.cmp.mode}).` };
    }
    if (tool === 'video_control') {
      const a = String(args.action || '');
      if (a === 'play') play(); else if (a === 'pause') pause();
      else if (a === 'seek') { pause(); seek(Number(args.time) || 0); await waitSeek(); } else if (a === 'step') { step(Number(args.frames) || 1); await waitSeek(); }
      else if (a === 'loop') setLoop(args.in == null ? null : Number(args.in), args.out == null ? undefined : Number(args.out));
      else if (a === 'speed') setSpeed(args.value);
      else if (a === 'safe_zone') setSafe(String(args.value || ''));
      else if (a === 'guide') setGuide(String(args.value || ''));
      else if (a === 'crop') setCrop(args.value || null);
      else if (a === 'compare_mode') setCompareMode(String(args.value));
      else if (a === 'resolve_note') { const n = notesOf()[Number(args.value) - 1]; if (!n) return { ok: false, error: `No note #${args.value}` }; updateNote(n.id, { done: true }); }
      else return { ok: false, error: `Unknown action ${a}` };
      return { ok: true, value: statusValue() };
    }
    if (tool === 'video_export') {
      const r = await runExport(String(args.preset || ''), { fit: args.fit || 'crop', offset: args.offset, range: args.range || 'auto' });
      if (!r) return { ok: false, error: S.tools?.ffmpeg ? 'Export failed to start.' : `ffmpeg isn't installed on this computer (${S.tools?.hint}).` };
      const ev = await r.done;
      return ev.code === 0 ? { ok: true, value: `Exported ${ev.output} in ${ev.seconds}s.` } : { ok: false, error: ev.error || `ffmpeg exited ${ev.code}` };
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }

  async function aeStatusText() {
    const st = await window.hub.ae.status();
    if (!st.found) return { st, text: st.reason };
    const run = await window.hub.ae.running?.().catch(() => false);
    return { st, text: `After Effects ${st.version || ''} found${run ? ' (running)' : ''}: ${st.afterfx}${st.aerender ? '' : ' · aerender is missing'}` };
  }
  async function renderAe(job, { quiet = false } = {}) {
    const id = `r${Date.now()}`;
    const full = { id, project: String(job.project || ''), comp: job.comp || '', output: job.output || '', omTemplate: job.omTemplate || '', multiFrames: true };
    if (!(await window.hub.fs.stat(full.project))) return { ok: false, error: `Project not found: ${full.project}` };
    if (!quiet) toast(`Rendering ${full.comp || base(full.project)} with aerender…`, { timeout: 4000 });
    const done = new Promise((resolve) => pendingRenders.set(id, { resolve, log: [], pct: 0 }));
    const p = pendingRenders.get(id);
    try { await window.hub.ae.render(full); } catch (err) { pendingRenders.delete(id); return { ok: false, error: err.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, '') }; }
    const ev = await done;
    load(true);
    const ok = ev.code === 0 && !ev.error;
    toast(ok ? `Render finished (${ev.seconds}s)` : `Render failed: ${ev.error || ev.code}`, { type: ok ? 'info' : 'error' });
    emit('render', { ok, output: full.output, seconds: ev.seconds });
    return { ok, value: { result: ok ? 'done' : 'failed', seconds: ev.seconds, output: full.output || '(the project\'s render queue output)', error: ev.error, logTail: p.log.slice(-15).join('\n') }, error: ok ? undefined : `${ev.error || `aerender exited ${ev.code}`}\n${p.log.slice(-10).join('\n')}` };
  }
  async function runAeScript(code, label = 'Hearth script') {
    const st = await window.hub.ae.status();
    if (!st.found) return { ok: false, error: st.reason };
    try {
      const r = await window.hub.ae.run(String(code || ''), label);
      if (r && r.ok === false) return { ok: false, error: r.error };
      return { ok: true, value: r?.pending ? 'Sent to After Effects (it is still starting or running the script).' : 'Ran in After Effects as one undo step.' };
    } catch (err) { return { ok: false, error: err.message.replace(/^Error invoking remote method[^:]*: (Error: )?/, '') }; }
  }
  async function handleAe(tool, args) {
    if (tool === 'ae_render') return renderAe(args);
    if (tool === 'ae_run_script') {
      const r = await runAeScript(args.code, args.label || 'Video Director script');
      if (r.ok) toast('Video Director ran a script in After Effects', { timeout: 3000 });
      return r.ok ? { ok: true, value: `${r.value} You cannot see its output; if something went wrong AE shows an alert to the user. Re-render to check the result.` } : r;
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }

  HubBridge.register(['video_'], handleTool);
  HubBridge.register(['ae_'], handleAe);

  // ---------- public API (chat commands, other tools, a future node view) ----------
  return {
    mount, reload: () => load(true), load, on, noteRecording, ensureMounted, waitReady, waitSeek,
    get state() { return S; }, get current() { return S.cur; }, get videos() { return S.videos; }, filtered, videoDirs, setFolders,
    open: openVideo, play, pause, togglePlay, step, seek: (t, o) => (Cut() ? Cut().goto(t) : seek(t, o)), goto, refreshCard: () => renderLibrary(), shuttle, setSpeed, setLoop, toggleLoop, setFpsUser,
    compare: compareWith, setCompareMode, stopCompare, swapAB, CMP_MODES, setWipe,
    setSafe, setGuide, setCrop, setDraw, setPick, setScopes, zoomTo, fullscreen, toggleLib, setView, setMirror, VIEWS, setVolume, cycleTimeMode, jumpDrop,
    setPingPong: (on) => { S.pingpong = on ?? !S.pingpong; return S.pingpong; }, exportAllSocials, allOpenNotes, estimateMB,
    addNote, updateNote, deleteNote, notes: notesOf, selectNote, openComposer, exportNotes, carryNotes,
    sendFeedback, agentFor, grabToAttachment, copyFrame, saveFrame, contactSheet,
    toggleFav, setTags, tagsOf, isFav, setFilter, versionsOf, verLabel, fmtOf, metaOf,
    tool: handleTool, runExport, startJob, exportMenu, presetsDialog, renderAe, runAeScript, aeStatusText, setDock, directorSegment, shortcutsHelp, status: () => (S.cur ? statusValue() : null),
    // The render pipeline as nodes + edges (VideoData.pipeline) for the node editor; each node names its chat command.
    pipeline: (opts = {}) => V.pipeline({ file: S.cur?.path || '', source: S.cur?.lab ? 'lab' : 'ae', ...opts }),
  };
})();
