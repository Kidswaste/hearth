// Video Review: watch what After Effects (and the scripts driving it) render, compare versions,
// and send precise visual feedback to Claude. Notes are pinned to timecodes, with frame grabs.
const Review = (() => {
  const VIDEO_RE = '\\.(mp4|m4v|mov|webm|mkv|gif)$';
  const FPS_CHOICES = [23.976, 24, 25, 29.97, 30, 50, 60];
  const fileUrl = (p) => `file:///${p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
  const base = (p) => p.split(/[\\/]/).pop();
  const dirOf = (p) => p.slice(0, p.lastIndexOf('\\'));
  const thumbs = new Map(); // path|mtime -> dataURL
  let videos = [];
  let current = null;
  let notes = {}; // path -> [{ t, text, frame }]
  let fps = store.get('review.fps', 30);
  let refs = {};

  const tc = (sec) => {
    const f = Math.round(sec * fps);
    const nf = Math.round(fps);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(f / (nf * 3600)))}:${p(Math.floor(f / (nf * 60)) % 60)}:${p(Math.floor(f / nf) % 60)}:${p(f % nf)}`;
  };

  async function videoDirs() {
    const home = await window.hub.fs.home();
    // Where After Effects scripts write renders; game captures (Videos, Discord clips) stay out unless added.
    return H.settings().videoDirs?.length ? H.settings().videoDirs : [`${home}\\Desktop`, `${home}\\Documents\\Codex`];
  }

  async function scan() {
    const found = [];
    for (const dir of await videoDirs()) {
      try {
        const list = await window.hub.fs.list(dir, { recursive: true, depth: 6, match: VIDEO_RE, skipDirs: ['node_modules', '.git', '_harness', 'Logs', 'Discord Clips', 'Captures'] });
        found.push(...list.filter((f) => f.size > 1024));
      } catch { /* folder may not exist */ }
    }
    const seen = new Set();
    return found.filter((f) => !seen.has(f.path) && seen.add(f.path)).sort((a, b) => b.mtime - a.mtime).slice(0, 500);
  }

  // ---------- thumbnails (one at a time, only for cards on screen) ----------
  const queue = [];
  let busy = false;
  function thumbFor(v, img) {
    const key = `${v.path}|${v.mtime}`;
    if (thumbs.has(key)) { img.src = thumbs.get(key); return; }
    queue.push({ v, img, key });
    pump();
  }
  async function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const { v, img, key } = queue.shift();
    if (!img.isConnected) { busy = false; pump(); return; }
    try {
      const vid = document.createElement('video');
      vid.muted = true; vid.preload = 'auto'; vid.src = fileUrl(v.path);
      await new Promise((res, rej) => { vid.onloadedmetadata = res; vid.onerror = rej; setTimeout(rej, 6000); });
      vid.currentTime = Math.min(1.5, (vid.duration || 2) * 0.15);
      await new Promise((res, rej) => { vid.onseeked = res; vid.onerror = rej; setTimeout(rej, 6000); });
      const c = document.createElement('canvas');
      c.width = 240; c.height = Math.round(240 * (vid.videoHeight / vid.videoWidth || 0.5625));
      c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.7);
      thumbs.set(key, url);
      img.src = url;
      v.duration = vid.duration; v.w = vid.videoWidth; v.h = vid.videoHeight;
      img.closest('.vid-card')?.querySelector('.vid-meta')?.replaceChildren(document.createTextNode(meta(v)));
      vid.removeAttribute('src'); vid.load();
    } catch { img.classList.add('nothumb'); }
    busy = false;
    pump();
  }
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
  const meta = (v) => [v.w ? `${v.w}×${v.h}` : null, fmtDur(v.duration), fmtBytes(v.size), timeAgo(v.mtime)].filter(Boolean).join(' · ');

  // ---------- library ----------
  function renderLibrary() {
    const q = refs.search.value.trim().toLowerCase();
    const list = videos.filter((v) => !q || v.path.toLowerCase().includes(q));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); const v = list.find((x) => x.path === e.target.dataset.path); if (v) thumbFor(v, e.target); }
    }, { root: refs.lib });
    refs.lib.replaceChildren(...(list.length ? list.map((v) => {
      const img = el('img', { class: 'vid-thumb', dataset: { path: v.path }, alt: '' });
      io.observe(img);
      const n = (notes[v.path] || []).length;
      return el('button', { class: `vid-card${current?.path === v.path ? ' on' : ''}`, title: v.path, on: { click: () => open(v) } },
        el('div', { class: 'vid-thumb-wrap' }, img, n ? el('span', { class: 'vid-badge', text: `${n} note${n > 1 ? 's' : ''}` }) : null,
          Date.now() - v.mtime < 3600e3 ? el('span', { class: 'vid-new', text: 'NEW' }) : null),
        el('b', { class: 'vid-name', text: base(v.path) }),
        el('span', { class: 'hint vid-meta', text: meta(v) }));
    }) : [el('p', { class: 'hint', text: q ? 'No renders match.' : 'No videos found yet. Renders saved to your Desktop or Documents\\Codex show up here automatically (Folders… to add more).' })]));
  }

  // Sibling files that look like versions of the same render (same folder, same name without numbers).
  const stem = (p) => base(p).replace(/\.[^.]+$/, '').replace(/[\s_-]*(v?\d+|final|copy|\(\d+\))*$/i, '').toLowerCase();
  const versionsOf = (v) => videos.filter((x) => dirOf(x.path) === dirOf(v.path) && stem(x.path) === stem(v.path)).sort((a, b) => b.mtime - a.mtime);

  // ---------- player ----------
  function open(v) {
    current = v;
    store.set('review.last', v.path);
    const vid = refs.video;
    vid.src = fileUrl(v.path);
    refs.title.textContent = base(v.path);
    refs.path.textContent = v.path;
    refs.compare.hidden = true;
    refs.stage.classList.remove('comparing', 'side');
    refs.cmpVideo.removeAttribute('src');
    refs.filmstrip.replaceChildren();
    renderLibrary();
    renderVersions();
    renderNotes();
    vid.onloadedmetadata = () => {
      v.duration = vid.duration; v.w = vid.videoWidth; v.h = vid.videoHeight;
      refs.info.textContent = `${vid.videoWidth}×${vid.videoHeight} · ${fmtDur(vid.duration)} · ${fmtBytes(v.size)} · modified ${fmtDate(v.mtime)}`;
      refs.stage.style.setProperty('--ar', `${vid.videoWidth} / ${vid.videoHeight}`);
      buildFilmstrip(v);
      renderMarkers();
    };
    vid.onerror = () => { refs.info.textContent = 'This file can\'t play here (ProRes and some .mov codecs need converting to H.264/MP4).'; };
  }

  function renderVersions() {
    const list = current ? versionsOf(current) : [];
    refs.versions.replaceChildren(...(list.length > 1 ? [el('span', { class: 'hint', text: 'Versions' }), ...list.map((x, i) => el('button', {
      class: `ver-chip${x.path === current.path ? ' on' : ''}`, title: `${base(x.path)} · ${fmtDate(x.mtime)}`, text: i === 0 ? 'latest' : `−${i}`,
      on: { click: () => open(x) },
    }))] : []));
  }

  async function buildFilmstrip(v) {
    const n = 12;
    const vid = document.createElement('video');
    vid.muted = true; vid.src = fileUrl(v.path);
    try { await new Promise((res, rej) => { vid.onloadedmetadata = res; vid.onerror = rej; }); } catch { return; }
    const c = document.createElement('canvas');
    c.width = 120; c.height = Math.round(120 * (vid.videoHeight / vid.videoWidth || 0.5625));
    const frames = [];
    for (let i = 0; i < n; i += 1) {
      if (current !== v) return;
      vid.currentTime = (vid.duration * (i + 0.5)) / n;
      try { await new Promise((res, rej) => { vid.onseeked = res; setTimeout(rej, 4000); }); } catch { break; }
      c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
      frames.push(c.toDataURL('image/jpeg', 0.6));
      refs.filmstrip.replaceChildren(...frames.map((f) => el('img', { src: f, alt: '' })));
    }
  }

  function renderMarkers() {
    const d = refs.video.duration;
    refs.markers.replaceChildren(...(current && d ? (notes[current.path] || []).map((n) => el('span', {
      class: 'note-marker', title: `${tc(n.t)} · ${n.text}`, style: { left: `${(n.t / d) * 100}%` },
      on: { click: (e) => { e.stopPropagation(); seek(n.t); } },
    })) : []));
    const io = refs.loop;
    if (io.a != null && d) Object.assign(refs.range.style, { left: `${(io.a / d) * 100}%`, width: `${(((io.b ?? d) - io.a) / d) * 100}%`, display: 'block' });
    else refs.range.style.display = 'none';
  }

  function seek(t) {
    const vid = refs.video;
    vid.currentTime = Math.max(0, Math.min(vid.duration || 0, t));
    if (!refs.compare.hidden) refs.cmpVideo.currentTime = vid.currentTime;
  }
  const step = (frames) => { refs.video.pause(); refs.cmpVideo.pause(); seek(refs.video.currentTime + frames / fps); };
  function togglePlay() {
    const vid = refs.video;
    if (vid.paused) { vid.play(); if (!refs.compare.hidden) refs.cmpVideo.play(); } else { vid.pause(); refs.cmpVideo.pause(); }
  }

  function tick() {
    const vid = refs.video;
    if (!vid.isConnected) return;
    const d = vid.duration || 0;
    refs.head.style.left = d ? `${(vid.currentTime / d) * 100}%` : '0';
    refs.time.textContent = `${tc(vid.currentTime)} / ${tc(d)}`;
    refs.play.textContent = vid.paused ? '▶' : '❚❚';
    const { a, b } = refs.loop;
    if (a != null && !vid.paused && vid.currentTime >= (b ?? d) - 0.02) seek(a);
    if (!refs.compare.hidden && !vid.paused && Math.abs(refs.cmpVideo.currentTime - vid.currentTime) > 0.08) refs.cmpVideo.currentTime = vid.currentTime;
    requestAnimationFrame(tick);
  }

  // Grab the current frame as a canvas (full resolution).
  function grab() {
    const vid = refs.video;
    const c = document.createElement('canvas');
    c.width = vid.videoWidth; c.height = vid.videoHeight;
    c.getContext('2d').drawImage(vid, 0, 0);
    return c;
  }
  async function saveFrame() {
    if (!current) return;
    const data = grab().toDataURL('image/png').split(',')[1];
    const p = await window.hub.saveFile({ defaultPath: `${base(current.path).replace(/\.[^.]+$/, '')}_${tc(refs.video.currentTime).replace(/:/g, '-')}.png`, filters: [{ name: 'PNG', extensions: ['png'] }], content: data, base64: true });
    if (p) toast('Frame saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
  }
  async function copyFrame() {
    const blob = await new Promise((r) => grab().toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Frame copied', { timeout: 1500 });
  }

  // ---------- compare ----------
  function startCompare(other) {
    if (!current || !other) return;
    refs.cmpVideo.src = fileUrl(other.path);
    refs.cmpVideo.muted = true;
    refs.cmpLabel.textContent = `B · ${base(other.path)}`;
    refs.compare.hidden = false;
    refs.stage.classList.add('comparing');
    refs.cmpVideo.onloadedmetadata = () => { refs.cmpVideo.currentTime = refs.video.currentTime; };
  }
  function compareMenu(e) {
    const others = [...versionsOf(current), ...videos.filter((v) => !versionsOf(current).includes(v))].filter((v) => v.path !== current.path).slice(0, 14);
    showMenu(e.clientX, e.clientY, [
      ...others.map((v) => ({ label: `${base(v.path)} · ${timeAgo(v.mtime)}`, action: () => startCompare(v) })),
      { label: 'Choose a file…', action: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }] }); if (p) startCompare({ path: p }); } },
    ]);
  }

  // ---------- notes & feedback ----------
  const saveNotes = debounce(() => window.hub.kvSet('video-notes', notes), 300);
  async function addNote(withFrame = true) {
    if (!current) return;
    const vid = refs.video;
    vid.pause();
    const t = vid.currentTime;
    const text = await Modal.prompt(`Note at ${tc(t)}`, { multiline: true, placeholder: 'What should change here? (e.g. "title comes in too late, should land on the beat")' });
    if (!text?.trim()) return;
    let frame = null;
    if (withFrame) {
      const c = grab();
      const small = document.createElement('canvas');
      small.width = Math.min(1280, c.width); small.height = Math.round(small.width * (c.height / c.width));
      small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
      frame = await window.hub.saveAttachment(`frame-${tc(t).replace(/:/g, '-')}.jpg`, small.toDataURL('image/jpeg', 0.85).split(',')[1]);
    }
    (notes[current.path] ||= []).push({ t, text: text.trim(), frame, color: refs.pickedColor || null });
    notes[current.path].sort((a, b) => a.t - b.t);
    saveNotes();
    renderNotes();
    renderMarkers();
    renderLibrary();
  }
  function renderNotes() {
    const list = current ? notes[current.path] || [] : [];
    refs.noteList.replaceChildren(...(list.length ? list.map((n, i) => el('div', { class: 'note-row' },
      el('button', { class: 'note-time', text: tc(n.t), title: 'Go to this moment', on: { click: () => seek(n.t) } }),
      n.frame ? el('img', { class: 'note-frame', src: fileUrl(n.frame), alt: '', on: { click: () => seek(n.t) } }) : null,
      el('span', { class: 'note-text', text: n.text }),
      n.color ? el('span', { class: 'note-swatch', style: { background: n.color }, title: n.color }) : null,
      el('button', { class: 'msg-act', text: '×', title: 'Delete note', on: { click: () => { list.splice(i, 1); saveNotes(); renderNotes(); renderMarkers(); renderLibrary(); } } }))) : [el('p', { class: 'hint', text: 'Pause where something should change and press N (or "+ Note"). Each note keeps the timecode and a frame grab.' })]));
    refs.sendBtn.disabled = !list.length;
  }
  async function sendFeedback() {
    const list = current ? notes[current.path] || [] : [];
    if (!list.length) return;
    const agent = H.claudeAgent();
    if (!agent) { toast('Add a native Claude agent first', { type: 'error' }); return; }
    const lines = list.map((n) => `- ${tc(n.t)} (${n.t.toFixed(2)} s): ${n.text}${n.color ? ` [color ${n.color}]` : ''}`).join('\n');
    const text = `Visual feedback on the render "${base(current.path)}"\nFile: ${current.path}\n${refs.video.videoWidth}×${refs.video.videoHeight}, ${fmtDur(refs.video.duration)}, timecodes at ${fps} fps.\n\n${lines}\n\nFind the After Effects script/project that produces this render, apply these changes, and tell me what you changed and how to re-render. Frame grabs of each moment are attached.`;
    activate(agent.id);
    Native.newChat(agent.id);
    Native.setDraft(agent.id, text);
    await Native.attachPaths(agent.id, list.map((n) => n.frame).filter(Boolean));
    toast('Feedback is ready in the chat box. Add anything else, then send.', { timeout: 5000 });
  }

  // ---------- color picker ----------
  function pickColor(e) {
    const vid = refs.video;
    const r = vid.getBoundingClientRect();
    // object-fit: contain → map the click into video pixels
    const scale = Math.min(r.width / vid.videoWidth, r.height / vid.videoHeight);
    const ox = (r.width - vid.videoWidth * scale) / 2; const oy = (r.height - vid.videoHeight * scale) / 2;
    const x = Math.floor((e.clientX - r.left - ox) / scale); const y = Math.floor((e.clientY - r.top - oy) / scale);
    if (x < 0 || y < 0 || x >= vid.videoWidth || y >= vid.videoHeight) return;
    const c = document.createElement('canvas'); c.width = 1; c.height = 1;
    c.getContext('2d').drawImage(vid, x, y, 1, 1, 0, 0, 1, 1);
    const [R, G, B] = c.getContext('2d').getImageData(0, 0, 1, 1).data;
    const hex = `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    refs.pickedColor = hex;
    refs.swatch.style.background = hex;
    refs.swatch.title = hex;
    refs.swatchLabel.textContent = hex;
    copyText(hex, `${hex} copied (it's also added to your next note)`);
    refs.stage.classList.remove('picking');
  }

  // ---------- mount ----------
  function mount(root) {
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    refs.search = el('input', { type: 'search', placeholder: 'Search renders…' });
    refs.lib = el('div', { class: 'vid-lib' });
    refs.video = el('video', { class: 'rv-video', playsInline: true });
    refs.cmpVideo = el('video', { class: 'rv-video rv-cmp', playsInline: true });
    refs.cmpLabel = el('span', { class: 'rv-label b' });
    const wipe = el('input', { type: 'range', min: 0, max: 100, value: 50, class: 'rv-wipe', title: 'Drag to wipe between A and B' });
    wipe.addEventListener('input', () => refs.stage.style.setProperty('--wipe', `${wipe.value}%`));
    refs.compare = el('div', { class: 'rv-compare', hidden: true }, wipe);
    refs.guides = el('div', { class: 'rv-guides' });
    refs.stage = el('div', { class: 'rv-stage' }, refs.video, refs.cmpVideo, refs.guides, el('span', { class: 'rv-label a', text: 'A' }), refs.cmpLabel, refs.compare);
    refs.stage.addEventListener('click', (e) => { if (refs.stage.classList.contains('picking')) pickColor(e); else if (e.target === refs.video || e.target === refs.guides) togglePlay(); });
    refs.title = el('b', { class: 'rv-title', text: 'Pick a render' });
    refs.path = el('span', { class: 'hint rv-path' });
    refs.info = el('span', { class: 'hint' });
    refs.versions = el('div', { class: 'rv-versions' });
    refs.filmstrip = el('div', { class: 'rv-filmstrip' });
    refs.markers = el('div', { class: 'rv-markers' });
    refs.range = el('div', { class: 'rv-range' });
    refs.head = el('div', { class: 'rv-head' });
    refs.loop = { a: null, b: null };
    const scrub = el('div', { class: 'rv-scrub' }, refs.filmstrip, refs.range, refs.markers, refs.head);
    const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * (refs.video.duration || 0)); };
    scrub.addEventListener('pointerdown', (e) => { scrub.setPointerCapture(e.pointerId); refs.video.pause(); scrubTo(e); const mv = (ev) => scrubTo(ev); scrub.addEventListener('pointermove', mv); scrub.addEventListener('pointerup', () => scrub.removeEventListener('pointermove', mv), { once: true }); });
    refs.play = btn('▶', 'Play / pause (Space)', togglePlay, 'primary rv-play');
    refs.time = el('span', { class: 'rv-time', text: '00:00:00:00' });
    const speed = el('select', { title: 'Playback speed', on: { change: (e) => { refs.video.playbackRate = Number(e.target.value); refs.cmpVideo.playbackRate = Number(e.target.value); } } },
      ['0.25', '0.5', '1', '1.5', '2'].map((s) => el('option', { value: s, text: `${s}×`, selected: s === '1' })));
    const fpsSel = el('select', { title: 'Frame rate used for timecodes and frame stepping', on: { change: (e) => { fps = Number(e.target.value); store.set('review.fps', fps); } } },
      FPS_CHOICES.map((f) => el('option', { value: f, text: `${f} fps`, selected: f === fps })));
    const guideSel = el('select', { title: 'Overlay guides', on: { change: (e) => { refs.guides.dataset.mode = e.target.value; } } },
      [['', 'No guides'], ['safe', 'Title / action safe'], ['thirds', 'Rule of thirds'], ['9x16', '9:16 crop (Shorts)'], ['4x5', '4:5 crop (Instagram)'], ['1x1', '1:1 crop']].map(([v, t]) => el('option', { value: v, text: t })));
    refs.swatch = el('span', { class: 'rv-swatch' });
    refs.swatchLabel = el('span', { class: 'hint' });
    const mute = btn('🔊', 'Mute', () => { refs.video.muted = !refs.video.muted; mute.textContent = refs.video.muted ? '🔇' : '🔊'; });
    const loopBtn = btn('In/Out', 'Set loop in at the playhead; press again for out; third press clears (I / O keys)', () => {
      const t = refs.video.currentTime;
      if (refs.loop.a == null) refs.loop.a = t; else if (refs.loop.b == null && t > refs.loop.a) refs.loop.b = t; else refs.loop = { a: null, b: null };
      loopBtn.classList.toggle('on', refs.loop.a != null);
      renderMarkers();
    });
    refs.noteList = el('div', { class: 'note-list' });
    refs.sendBtn = btn('Send feedback to Claude', 'Writes your notes and frame grabs into a Claude chat, ready to send', sendFeedback, 'primary');
    const transport = el('div', { class: 'rv-transport' },
      btn('⏮', 'Start', () => seek(0)), btn('◂|', 'Previous frame (←)', () => step(-1)), refs.play, btn('|▸', 'Next frame (→)', () => step(1)),
      refs.time, speed, fpsSel, loopBtn, mute, el('span', { class: 'spacer' }),
      guideSel,
      btn('Compare…', 'A/B wipe against another version', compareMenu),
      btn('Side by side', 'Show A and B next to each other', () => { if (!refs.compare.hidden) refs.stage.classList.toggle('side'); }),
      btn('💧', 'Pick a color from the video', () => refs.stage.classList.toggle('picking')), refs.swatch, refs.swatchLabel,
      btn('📷', 'Save this frame as PNG', saveFrame), btn('⧉', 'Copy this frame', copyFrame),
      btn('⛶', 'Fullscreen', () => refs.stage.requestFullscreen()));
    root.append(el('div', { class: 'review' },
      el('aside', { class: 'rv-side' }, el('div', { class: 'row' }, refs.search,
        btn('⟳', 'Rescan now', () => load(true)),
        btn('Folders…', 'Which folders to watch for renders', editFolders)), refs.lib),
      el('section', { class: 'rv-main' },
        el('div', { class: 'rv-top' }, el('div', { class: 'rv-heading' }, refs.title, refs.path), refs.versions,
          btn('Open', 'Open in your default player', () => current && window.hub.fs.open(current.path)),
          btn('Show file', 'Show in Explorer', () => current && window.hub.fs.reveal(current.path))),
        refs.stage, scrub, transport, refs.info),
      el('aside', { class: 'rv-notes' }, el('div', { class: 'rv-notes-head' }, el('b', { text: 'Notes' }),
        btn('+ Note', 'Add a note at the playhead with a frame grab (N)', () => addNote(true))), refs.noteList,
        el('div', { class: 'rv-notes-foot' }, refs.sendBtn,
          btn('Copy notes', 'Copy notes as text', () => { const list = notes[current?.path] || []; copyText(list.map((n) => `${tc(n.t)}  ${n.text}`).join('\n'), 'Notes copied'); })))));
    refs.search.addEventListener('input', debounce(renderLibrary, 150));
    root.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select') || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); togglePlay(); } else if (k === 'arrowleft') { e.preventDefault(); step(e.shiftKey ? -10 : -1); } else if (k === 'arrowright') { e.preventDefault(); step(e.shiftKey ? 10 : 1); } else if (k === 'n') { e.preventDefault(); addNote(true); } else if (k === 'i' || k === 'o') loopBtn.click(); else if (k === 'j') seek(refs.video.currentTime - 1); else if (k === 'l') seek(refs.video.currentTime + 1); else if (k === 'k') refs.video.pause();
    });
    root.tabIndex = -1;
    requestAnimationFrame(tick);
    load();
  }

  async function editFolders() {
    const dirs = await videoDirs();
    const v = await Modal.prompt('Folders to watch for renders', { multiline: true, value: dirs.join('\n'), label: 'One folder per line. Subfolders are included.' });
    if (v == null) return;
    H.config.settings = { ...H.config.settings, videoDirs: v.split('\n').map((x) => x.trim()).filter(Boolean) };
    await saveConfig();
    load(true);
  }

  let lastNewest = 0;
  async function load(manual = false) {
    if (manual) refs.lib.replaceChildren(el('p', { class: 'hint', text: 'Scanning for renders…' }));
    notes = await window.hub.kvGet('video-notes', {});
    const next = await scan();
    const newest = next[0]?.mtime || 0;
    if (lastNewest && newest > lastNewest) {
      const fresh = next.filter((v) => v.mtime > lastNewest);
      toast(`New render: ${base(fresh[0].path)}`, { action: { label: 'Watch', fn: () => open(fresh[0]) }, timeout: 9000 });
    }
    lastNewest = newest;
    videos = next;
    renderLibrary();
    renderNotes();
    renderMarkers();
    if (!current) {
      const last = videos.find((v) => v.path === store.get('review.last', '')) || videos[0];
      if (last) open(last);
    }
  }

  // Watch for new renders while the tool is open (cheap rescan every 20 s).
  setInterval(() => { if (refs.lib?.isConnected && refs.lib.offsetParent) load(); }, 20000);

  return { mount, reload: () => load(true) };
})();
