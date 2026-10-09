// Video flows: Video Director pipelines as node graphs (nodes.js) that run. Sources (library videos, Lab
// recordings, AE projects) feed steps (open, trim / loop, crop, safe-zone checks, notes, contact sheets, A/B
// compare, AE renders, exports, feedback to an agent, any chat command). ▶ Run executes the steps in order
// through Video Review's own API (the same code its chat commands use), with live status on every node; a
// "Wait for me" step hands you the player and continues when you say so. Each step also shows the chat command
// that does the same (/video-flow-commands lists them). Lives in Video Review behind its "Flow" segment.
const VideoNodes = (() => {
  const V = VideoData;
  const R = () => Review;
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const TYPES = {
    video: { color: '#ff6b9d', label: 'Video' },
    project: { color: '#bd8bff', label: 'After Effects project' },
    notes: { color: '#ffd75e', label: 'Notes' },
    file: { color: '#7cd992', label: 'File(s)' },
  };
  const reg = NodeView.createRegistry({
    name: 'video', types: TYPES, compat: { video: ['file'], file: ['video'] }, sliderLabel: null, idBase: (d) => d.type, // ids for chat: export1, review2…
  });
  const SEL = (name, options, o = {}) => ({ name, kind: 'select', options, value: o.value ?? (typeof options[0] === 'object' ? options[0].value : options[0]), ...o });
  const TXT = (name, value = '', o = {}) => ({ name, kind: 'text', value, ...o });
  const NUM = (name, value, min, max, o = {}) => ({ name, kind: 'number', type: 'num', value, min, max, ...o });
  const TOG = (name, value = false, o = {}) => ({ name, kind: 'toggle', type: 'bool', value, ...o });
  const IN = (name, type, o = {}) => ({ name, type, kind: null, ...o });
  const OUT = (name, type, label) => ({ name, type, ...(label ? { label } : {}) });
  const PRESET_OPTS = V.EXPORT_PRESETS.map((p) => ({ value: p.id, label: p.name }));
  const SAFE_OPTS = Object.entries(V.SAFE_ZONES).map(([k, z]) => ({ value: k, label: z.name }));
  const FORMAT_OPTS = V.FORMATS.slice(0, 4).map((f) => ({ value: f.id, label: `${f.id} ${f.name}` }));
  const AGENTS = [{ value: 'director', label: 'Video Director' }, { value: 'claude', label: 'Claude' }, { value: 'astra', label: 'Astra (second opinion)' }];
  const recentChoices = async () => { await R().ensureMounted(); return [{ value: 'latest', label: 'latest render', hint: 'the newest file' }, { value: 'latest lab', label: 'latest Lab recording' }, { value: 'latest fav', label: 'latest favorite ★' }, ...R().videos.slice(0, 24).map((v) => ({ value: base(v.path), label: base(v.path), hint: timeAgo(v.mtime) }))]; };

  // Steps: def({ …, run: async (x) → outputs, cmd: (node, x) → the chat command doing the same })
  // x: { v(name) value, in(name) upstream value, status(text, pct), node, signal, waitForMe(text) }
  const define = (d) => reg.define({ ...d, badge: d.badge || ((n) => (d.cmdBadge ? d.cmdBadge(n) : '')) });
  const cat = (category, color) => (o) => define({ category, color, ...o });

  // ---------- finding videos ----------
  function findVideo(q, { not } = {}) {
    const list = R().videos.filter((v) => v.path !== not);
    const s = String(q || '').trim().toLowerCase().replace(/^"|"$/g, '');
    if (!s || s === 'latest' || s === 'newest') return list[0] || null;
    if (s === 'latest lab' || s === 'lab') return list.find((v) => v.lab) || null;
    if (s === 'latest fav' || s === 'fav') return list.find((v) => R().isFav(v.path)) || null;
    if (s.startsWith('#')) return list.find((v) => R().tagsOf(v.path).includes(s.slice(1))) || null;
    return list.find((v) => v.path.toLowerCase() === s) || list.find((v) => base(v.path).toLowerCase() === s) || list.find((v) => base(v.path).toLowerCase().replace(/\.[^.]+$/, '') === s)
      || list.find((v) => base(v.path).toLowerCase().startsWith(s)) || list.find((v) => v.path.toLowerCase().includes(s)) || null;
  }
  // the video on screen in Video Review becomes `path` (most steps act on the open video)
  async function show(path) {
    if (!path) throw new Error('No video: connect a source');
    if (R().current?.path !== path) { await R().open(path); }
    await R().waitReady();
    return path;
  }
  const videoOf = (x, name = 'video') => { const v = x.in(name); return v?.path || (Array.isArray(v?.paths) ? v.paths[0] : null); };

  // Sources
  const src = cat('Sources', '#ff6b9d');
  src({ type: 'open-video', title: 'Open video', desc: 'Whatever is open in Video Review right now', outputs: [OUT('video', 'video')],
    run: async (x) => { if (!R().current) throw new Error('Nothing is open in Video Review'); x.status(base(R().current.path)); return { video: { path: R().current.path } }; }, cmd: () => '/video-status' });
  src({ type: 'library', title: 'From the library', desc: 'A render from the library: latest, latest Lab recording, latest favorite, #tag, or by name', keywords: 'pick render file',
    widgets: [{ name: 'video', kind: 'pick', label: 'Video', value: 'latest', choices: recentChoices, placeholder: 'latest · name · #tag' }], outputs: [OUT('video', 'video')],
    cmdBadge: (n) => String(n.values?.video || 'latest').slice(0, 14),
    run: async (x) => { await R().ensureMounted(); const v = findVideo(x.v('video')); if (!v) throw new Error(`No video matches “${x.v('video')}”`); x.status(base(v.path)); return { video: { path: v.path } }; },
    cmd: (n) => `/review ${n.values?.video || 'latest'}` });
  src({ type: 'lab-recording', title: 'Lab recording', desc: 'The newest video you recorded in the Three.js Lab', keywords: 'record sketch three',
    outputs: [OUT('video', 'video')],
    run: async (x) => { await R().ensureMounted(); const v = findVideo('latest lab'); if (!v) throw new Error('No Lab recording yet (⏺ in the Lab records one)'); x.status(base(v.path)); return { video: { path: v.path } }; },
    cmd: () => '/videos lab' });
  src({ type: 'version', title: 'Other version', desc: 'Another version of the same render (name_v3 → name_v2): the previous, the newest or the first', keywords: 'previous older newer v2 compare',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('which', ['previous', 'newest', 'first'])], outputs: [OUT('video', 'video')], cmdBadge: (n) => n.values?.which || 'previous',
    run: async (x) => {
      await R().ensureMounted();
      const p = videoOf(x); const me = R().videos.find((v) => v.path === p) || { path: p };
      const list = R().versionsOf(me); const i = list.findIndex((v) => v.path === p);
      const pick = { previous: list[i + 1], newest: list[0] !== list[i] ? list[0] : null, first: list[list.length - 1] !== list[i] ? list[list.length - 1] : null }[x.v('which')];
      if (!pick) throw new Error(`No ${x.v('which')} version of ${base(p)}`);
      x.status(base(pick.path));
      return { video: { path: pick.path } };
    } });
  src({ type: 'file', title: 'Video file', desc: 'A video by its full path', widgets: [TXT('path', '', { label: 'Path', placeholder: '/path/to/video.mp4' })], outputs: [OUT('video', 'video')],
    run: async (x) => { const p = String(x.v('path') || '').trim(); if (!p || !(await window.hub.fs.stat(p))) throw new Error(`File not found: ${p || '(empty)'}`); x.status(base(p)); return { video: { path: p } }; } });
  src({ type: 'ae-project', title: 'AE project', desc: 'An After Effects project (newest first, or by name) and the comp to render', keywords: 'aep after effects comp',
    widgets: [{ name: 'project', kind: 'pick', label: 'Project', value: 'latest', choices: async () => { const list = await window.hub.ae.projects(await projectDirs()).catch(() => []); return [{ value: 'latest', label: 'the last one used / newest' }, ...list.slice(0, 20).map((p) => ({ value: p.path, label: base(p.path) }))]; } }, TXT('comp', '', { label: 'Comp', placeholder: 'Comp name (empty: render queue)' })],
    outputs: [OUT('project', 'project')], cmdBadge: (n) => String(n.values?.comp || '').slice(0, 12),
    run: async (x) => {
      let p = String(x.v('project') || 'latest');
      if (p === 'latest') { p = store.get('review.lastProject', ''); if (!p) { const list = await window.hub.ae.projects(await projectDirs()); p = list[0]?.path || ''; } }
      if (!p) throw new Error('No .aep found: pick one');
      x.status(`${base(p)}${x.v('comp') ? ` · ${x.v('comp')}` : ''}`);
      return { project: { project: p, comp: String(x.v('comp') || '') } };
    } });

  // Review steps
  const rev = cat('Review', '#ffd75e');
  rev({ type: 'review', title: 'Open in Review', desc: 'Opens the video in the player (the next steps act on it)', inputs: [IN('video', 'video', { required: true })], outputs: [OUT('video', 'video')],
    run: async (x) => { const p = await show(videoOf(x)); const s = R().status(); x.status(`${base(p)} · ${s?.resolution || ''} ${s?.format || ''}`); return { video: { path: p } }; }, cmd: (n, x) => `/review ${base(x?.path) || '<name>'}` });
  rev({ type: 'loop', title: 'Trim / loop', desc: 'Sets the loop (in–out): exports use it. A range, the first N seconds, N beats from the start, or the next drop', keywords: 'trim cut in out range',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('mode', ['range', 'first seconds', 'beats', 'drop', 'off']), { name: 'range', kind: 'range', label: 'From – to (s)', value: [0, 15], min: 0 }, NUM('n', 8, 1, 64, { label: 'Seconds / beats', step: 1, slider: false })],
    outputs: [OUT('video', 'video')], cmdBadge: (n) => n.values?.mode || 'range',
    run: async (x) => {
      const p = await show(videoOf(x));
      const mode = x.v('mode'); const d = R().status()?.duration || 0;
      if (mode === 'off') { R().setLoop(null); x.status('no loop'); return { video: { path: p } }; }
      let a = 0; let b = d;
      if (mode === 'range') { [a, b] = x.v('range') || [0, d]; }
      if (mode === 'first seconds') { a = 0; b = Math.min(d, Number(x.v('n')) || 15); }
      if (mode === 'beats') { const bpm = R().state.audio?.bpm || 120; a = 0; b = Math.min(d, (60 / bpm) * (Number(x.v('n')) || 8)); }
      if (mode === 'drop') { R().seek(0); R().jumpDrop(1); await R().waitSeek(); a = R().status()?.time || 0; b = Math.min(d, a + (Number(x.v('n')) || 8)); }
      b = Math.min(d || b, b);
      if (!(b > a)) throw new Error(`Empty range ${a}–${b}`);
      R().setLoop(a, b);
      x.status(`${a.toFixed(2)}–${b.toFixed(2)} s`);
      return { video: { path: p } };
    }, cmd: (n) => (n.values?.mode === 'off' ? '/loop off' : n.values?.mode === 'beats' ? `/loop beats ${n.values?.n || 8}` : `/loop ${(n.values?.range || [0, 15]).join(' ')}`) });
  rev({ type: 'crop', title: 'Crop to format', desc: 'Previews a crop to another social format; exports to that format use it (offset: 0 = top / left, 1 = bottom / right)', keywords: 'reframe aspect 4:5 9:16 1:1',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('format', FORMAT_OPTS, { value: '4:5' }), NUM('offset', 0.5, 0, 1, { slider: false })], outputs: [OUT('video', 'video')], cmdBadge: (n) => n.values?.format || '4:5',
    run: async (x) => { const p = await show(videoOf(x)); R().setCrop(x.v('format')); R().state.overlay.cropOffset = Number(x.v('offset')); x.status(`${x.v('format')} at ${Math.round(x.v('offset') * 100)}%`); return { video: { path: p } }; },
    cmd: (n) => `/crop ${n.values?.format || '4:5'}` });
  rev({ type: 'safe', title: 'Safe-zone check', desc: 'Shows a platform\'s safe zones on the video; "Ask me" pauses so you can look and say OK (or stop the flow)', keywords: 'tiktok reels shorts ui overlay check',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('platform', SAFE_OPTS, { value: 'tiktok' }), TOG('ask', true, { label: 'Ask me' })], outputs: [OUT('video', 'video')], cmdBadge: (n) => n.values?.platform || 'tiktok',
    run: async (x) => {
      const p = await show(videoOf(x));
      R().setSafe(x.v('platform'));
      const d = R().status()?.duration || 0; R().pause(); R().seek(d * 0.5); await R().waitSeek();
      if (x.v('ask')) { const ok = await x.waitForMe(`Check the ${V.SAFE_ZONES[x.v('platform')]?.name || x.v('platform')} safe zones (scrub through it), then Continue — or Stop the flow.`); if (!ok) throw new Error('Stopped at the safe-zone check'); }
      x.status(`${V.SAFE_ZONES[x.v('platform')]?.name || ''} ✓`);
      return { video: { path: p } };
    }, cmd: (n) => `/safe ${n.values?.platform || 'tiktok'}` });
  rev({ type: 'guide', title: 'Guide overlay', desc: 'Rule of thirds, center, title safe, golden ratio… on the video', inputs: [IN('video', 'video', { required: true })], widgets: [SEL('guide', [...V.GUIDES.map((g) => ({ value: g.id, label: g.name })), { value: '', label: 'off' }])], outputs: [OUT('video', 'video')],
    run: async (x) => { const p = await show(videoOf(x)); R().setGuide(x.v('guide')); x.status(x.v('guide') || 'off'); return { video: { path: p } }; }, cmd: (n) => `/guide ${n.values?.guide || 'off'}` });
  rev({ type: 'wait', title: 'Wait for me', desc: 'Pauses the flow and shows you the player: watch, add notes, then Continue (or /video-flow-continue)', keywords: 'checkpoint pause approve human',
    inputs: [IN('in', 'any', { label: 'After' })], widgets: [TXT('message', 'Watch it and add your notes (N), then Continue.', { label: 'Tell me' })], outputs: [OUT('out', 'any', 'Then')],
    run: async (x) => { const ok = await x.waitForMe(x.v('message')); if (!ok) throw new Error('Stopped'); x.status('continued'); return { out: x.in('in') }; }, cmd: () => '/video-flow-continue' });
  rev({ type: 'note', title: 'Add note', desc: 'Adds a timecoded note (with a frame grab) to the video', inputs: [IN('video', 'video', { required: true })],
    widgets: [TXT('text', 'Check this', { label: 'Note' }), TXT('at', 'playhead', { label: 'At', placeholder: 'playhead · 12.5 · 1:02 · 50%' }), SEL('category', ['', ...V.CATEGORIES.map((c) => c.id)].map((c) => ({ value: c, label: c ? V.category(c).name : 'guess' })))],
    outputs: [OUT('video', 'video')],
    run: async (x) => {
      const p = await show(videoOf(x));
      const s = R().status();
      const at = String(x.v('at') || 'playhead');
      const t = at === 'playhead' ? s.time : V.parseTime(at, s.fps, s.time, s.duration);
      if (t == null) throw new Error(`Can't read the time “${at}”`);
      await R().addNote(String(x.v('text') || 'Note'), { t, cat: x.v('category') || V.guessCategory(x.v('text')) });
      x.status(`${V.tc(t, s.fps)}`);
      return { video: { path: p } };
    }, cmd: (n) => `/note ${n.values?.text || ''}${n.values?.category ? ` #${n.values.category}` : ''}${n.values?.at && n.values.at !== 'playhead' ? ` @${n.values.at}` : ''}` });
  rev({ type: 'notes', title: 'Open notes', desc: 'The video\'s open (unresolved) notes', inputs: [IN('video', 'video', { required: true })], widgets: [TOG('all', false, { label: 'Resolved too' })], outputs: [OUT('notes', 'notes'), OUT('video', 'video')],
    run: async (x) => { const p = await show(videoOf(x)); const list = R().notes().filter((n) => x.v('all') || !n.done); x.status(`${list.length} note${list.length === 1 ? '' : 's'}`); return { notes: { path: p, count: list.length }, video: { path: p } }; }, cmd: () => '/notes' });
  rev({ type: 'if-notes', title: 'Only if notes', desc: 'Goes on only when there are notes (else the steps after it are skipped)', keywords: 'condition branch gate',
    inputs: [IN('notes', 'notes', { required: true })], widgets: [NUM('min', 1, 1, 50, { label: 'At least', step: 1, slider: false })], outputs: [OUT('notes', 'notes')],
    run: async (x) => { const n = x.in('notes')?.count || 0; if (n < (Number(x.v('min')) || 1)) { x.skipRest(`only ${n} note${n === 1 ? '' : 's'}`); return {}; } x.status(`${n} notes`); return { notes: x.in('notes') }; } });
  rev({ type: 'resolve', title: 'Resolve notes', desc: 'Marks every open note of the video resolved', inputs: [IN('notes', 'notes', { required: true })], outputs: [OUT('notes', 'notes')],
    run: async (x) => { await show(x.in('notes').path); const open = R().notes().filter((n) => !n.done); for (const n of open) R().updateNote(n.id, { done: true }); x.status(`${open.length} resolved`); return { notes: { ...x.in('notes'), count: 0 } }; }, cmd: () => '/resolve all' });
  rev({ type: 'carry', title: 'Carry notes over', desc: 'Copies the open notes of one version to another (to check them off there)', keywords: 'copy notes version',
    inputs: [IN('from', 'video', { required: true, label: 'From' }), IN('to', 'video', { required: true, label: 'To' })], outputs: [OUT('video', 'video', 'To')],
    run: async (x) => { await show(videoOf(x, 'from')); const to = videoOf(x, 'to'); const n = R().carryNotes(to); x.status(`${n} note${n === 1 ? '' : 's'} → ${base(to)}`); return { video: { path: to } }; }, cmd: () => '/carry-notes' });
  rev({ type: 'notes-file', title: 'Notes to a file', desc: 'Writes the video\'s notes next to it (exports folder) as Markdown, CSV or JSON', keywords: 'export notes markdown csv',
    inputs: [IN('notes', 'notes', { required: true })], widgets: [SEL('format', ['md', 'csv', 'json'])], outputs: [OUT('file', 'file')], cmdBadge: (n) => n.values?.format || 'md',
    run: async (x) => {
      const p = await show(x.in('notes').path);
      const text = R().exportNotes(x.v('format'));
      if (!text) throw new Error('No notes to write');
      const sep = p.includes('\\') && !p.startsWith('/') ? '\\' : '/';
      const dir = p.slice(0, p.lastIndexOf(sep));
      const out = `${dir}${sep}exports${sep}${base(p).replace(/\.[^.]+$/, '')} notes.${x.v('format')}`;
      await window.hub.fs.write(out, text);
      x.status(base(out));
      return { file: { path: out } };
    }, cmd: (n) => `/notes ${n.values?.format || 'md'}` });
  rev({ type: 'fav', title: 'Favorite', desc: 'Marks the video as a favorite ★ (the library\'s ★ filter, "latest fav" sources)', inputs: [IN('video', 'video', { required: true })], outputs: [OUT('video', 'video')],
    run: async (x) => { const p = videoOf(x); if (!R().isFav(p)) { await show(p); R().toggleFav(p); } x.status('★'); return { video: { path: p } }; }, cmd: () => '/fav' });
  rev({ type: 'tag', title: 'Tag', desc: 'Adds tags to the video (search them with #tag; "#tag" sources pick them up)', inputs: [IN('video', 'video', { required: true })], widgets: [TXT('tags', 'final', { label: 'Tags' })], outputs: [OUT('video', 'video')], cmdBadge: (n) => String(n.values?.tags || '').slice(0, 12),
    run: async (x) => { const p = videoOf(x); const tags = R().setTags(p, [...R().tagsOf(p), ...String(x.v('tags') || '').split(/[\s,]+/)]); x.status(tags.map((t) => `#${t}`).join(' ')); return { video: { path: p } }; }, cmd: (n) => `/tag ${n.values?.tags || ''}` });
  rev({ type: 'sheet', title: 'Contact sheet', desc: 'A grid of frames across the video (saved as a picture; optionally attached to the director\'s chat)', keywords: 'thumbnails storyboard frames',
    inputs: [IN('video', 'video', { required: true })], widgets: [NUM('frames', 12, 4, 36, { step: 1, slider: false }), TOG('attach', false, { label: 'Attach to the director chat' })], outputs: [OUT('file', 'file', 'Picture'), OUT('video', 'video')],
    run: async (x) => {
      const p = await show(videoOf(x));
      const { image, times } = await R().contactSheet({ count: Number(x.v('frames')) || 12 });
      const file = await window.hub.saveAttachment('contact-sheet.jpg', image.data);
      if (x.v('attach')) { const a = R().agentFor('director'); if (a) await Native.attachPaths(a.id, [file]); }
      x.status(`${times.length} frames`);
      return { file: { path: file }, video: { path: p } };
    }, cmd: (n) => `/sheet ${n.values?.frames || 12}` });
  rev({ type: 'grab', title: 'Grab frame', desc: 'Saves the frame at a time as a picture (thumbnails, covers)', inputs: [IN('video', 'video', { required: true })], widgets: [TXT('at', '50%', { label: 'At', placeholder: '50% · 3.2 · 0:12' })], outputs: [OUT('file', 'file', 'Picture'), OUT('video', 'video')],
    run: async (x) => {
      const p = await show(videoOf(x));
      const s = R().status(); const t = V.parseTime(String(x.v('at') || '50%'), s.fps, s.time, s.duration) ?? s.time;
      R().pause(); R().seek(t); await R().waitSeek();
      const file = await R().grabToAttachment(t);
      x.status(`${V.tc(t, s.fps)}`);
      return { file: { path: file }, video: { path: p } };
    }, cmd: () => '/grab save' });
  rev({ type: 'compare', title: 'Compare A / B', desc: 'A/B compare two versions: wipe, side by side, onion skin, difference', keywords: 'ab versions diff wipe',
    inputs: [IN('a', 'video', { required: true, label: 'A' }), IN('b', 'video', { required: true, label: 'B' })], widgets: [SEL('mode', R().CMP_MODES.map(([k, l]) => ({ value: k, label: l })))], outputs: [OUT('video', 'video', 'A')], cmdBadge: (n) => n.values?.mode || 'wipe',
    run: async (x) => { const a = await show(videoOf(x, 'a')); const b = videoOf(x, 'b'); await R().compare(b, x.v('mode')); x.status(`${base(a)} | ${base(b)}`); return { video: { path: a } }; },
    cmd: (n) => `/compare <b> ${n.values?.mode || 'wipe'}` });

  // Export
  const exp = cat('Export', '#7cd992');
  const pname = (id) => V.EXPORT_PRESETS.find((p) => p.id === id)?.name || id;
  // runs one ffmpeg export of the open video, with progress on the node
  async function exportOne(x, preset, fit) {
    const p = await show(videoOf(x));
    const job = await R().runExport(preset, { fit, range: x.v('range') || 'auto' });
    if (!job) throw new Error(R().state.tools?.ffmpeg ? 'The export did not start' : `ffmpeg isn't installed (${R().state.tools?.hint || 'see /presets'})`);
    x.job(job.id);
    x.status(`${pname(preset)}…`, 0);
    const ev = await job.done;
    if (ev.code !== 0) throw new Error(ev.cancelled ? 'Cancelled' : ev.error || `ffmpeg exited ${ev.code}`);
    x.status(`${base(job.output)} · ${ev.seconds}s`);
    return { path: job.output, from: p };
  }
  exp({ type: 'export', title: 'Export preset', desc: 'Exports the video (or its loop) with ffmpeg for a platform: TikTok, Reels, Shorts, feed 4:5, YouTube…', keywords: 'ffmpeg render encode social',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('preset', PRESET_OPTS, { value: 'reels' }), SEL('fit', V.FIT_MODES), SEL('range', ['auto', 'all'], { hint: 'auto: the loop range when one is set' })], outputs: [OUT('file', 'file')],
    cmdBadge: (n) => n.values?.preset || 'reels',
    run: async (x) => ({ file: await exportOne(x, x.v('preset'), x.v('fit')) }), cmd: (n) => `/export ${n.values?.preset || 'reels'} ${n.values?.fit || 'crop'}` });
  exp({ type: 'socials', title: 'Export all socials', desc: 'One render → every other social format (9:16, 4:5, 1:1, 16:9), one after another', keywords: 'all formats batch',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('fit', V.FIT_MODES)], outputs: [OUT('file', 'file', 'Files')],
    run: async (x) => {
      const p = await show(videoOf(x));
      const s = R().status(); const cur = s?.format;
      const ids = ['reels', 'feed45', 'square', 'yt1080'].filter((id) => { const q = V.EXPORT_PRESETS.find((y) => y.id === id); return V.aspectOf(q.w, q.h) !== cur; });
      const outs = [];
      for (const [i, id] of ids.entries()) { if (x.stopped()) break; x.status(`${pname(id)} (${i + 1}/${ids.length})`, i / ids.length); outs.push((await exportOne(x, id, x.v('fit'))).path); }
      x.status(`${outs.length} files`);
      return { file: { paths: outs, path: outs[0], from: p } };
    }, cmd: (n) => `/export-all ${n.values?.fit || 'crop'}` });
  // the cut (tools/video-cut.js): beat-cut the open video, then render the edit
  exp({ type: 'autocut', title: 'Auto-cut on the music', desc: 'Splits the open video on every bar (2 / 4 bars, beats, drops, sections) in its ✂ cut, ready to trim and reorder', keywords: 'beat bar split clips cut',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('every', ['bars', '2bars', '4bars', 'beats', 'drops', 'sections'])], outputs: [OUT('video', 'video')], cmdBadge: (n) => n.values?.every || 'bars',
    run: async (x) => {
      const p = await show(videoOf(x));
      for (let i = 0; i < 60 && !R().state.audio; i += 1) await new Promise((r) => setTimeout(r, 150)); // the beats come from the audio analysis
      await VideoCut.enter();
      VideoCut.suggest(x.v('every'));
      const n = VideoCut.acceptSuggestion();
      x.status(`${n} cuts · ${VideoCut.edit.clips.length} clips`);
      return { video: { path: p } };
    }, cmd: (n) => `/cut-auto ${n.values?.every || 'bars'} ; /cut-auto apply` });
  exp({ type: 'cut-export', title: 'Export the cut', desc: 'Renders the open video\'s ✂ cut with ffmpeg: a new version next to it, or a social preset', keywords: 'edit clips render ffmpeg',
    inputs: [IN('video', 'video', { required: true })], widgets: [SEL('preset', [{ value: 'new', label: 'New version (same size)' }, ...PRESET_OPTS]), SEL('fit', V.FIT_MODES)], outputs: [OUT('file', 'file')], cmdBadge: (n) => n.values?.preset || 'new',
    run: async (x) => {
      const p = await show(videoOf(x));
      await VideoCut.enter();
      const preset = x.v('preset');
      const job = await VideoCut.exportCut(preset === 'new' ? {} : { preset, fit: x.v('fit') });
      if (!job) throw new Error('The export did not start (ffmpeg?)');
      x.job(job.id); x.status('rendering the cut…', 0);
      const ev = await job.done;
      if (ev.code !== 0) throw new Error(ev.cancelled ? 'Cancelled' : ev.error || `ffmpeg exited ${ev.code}`);
      x.status(`${base(job.output)} · ${ev.seconds}s`);
      return { file: { path: job.output, from: p } };
    }, cmd: (n) => `/cut-export ${n.values?.preset || 'new'} ${n.values?.fit || 'crop'}` });
  exp({ type: 'proxy', title: 'Make a proxy', desc: 'A small H.264 copy that plays anywhere (for ProRes or huge renders)', inputs: [IN('video', 'video', { required: true })], outputs: [OUT('file', 'file')],
    run: async (x) => ({ file: await exportOne(x, 'proxy', 'crop') }), cmd: () => '/proxy' });
  exp({ type: 'reveal', title: 'Show in folder', desc: 'Shows the file in Finder / Explorer', inputs: [IN('file', 'file', { required: true })], outputs: [],
    run: async (x) => { const f = x.in('file'); await window.hub.fs.reveal(f.path || f.paths?.[0]); x.status(base(f.path || f.paths?.[0])); return {}; } });

  // After Effects
  const ae = cat('After Effects', '#bd8bff');
  ae({ type: 'render', title: 'Render comp', desc: 'Renders the comp with aerender into your first watched folder (name_vN.mp4) using an H.264 output template', keywords: 'aerender after effects output module',
    inputs: [IN('project', 'project', { required: true })], widgets: [{ name: 'template', kind: 'pick', label: 'Output', value: 'auto', choices: async () => [{ value: 'auto', label: 'auto (an H.264 template)' }, ...(await window.hub.ae.templates().catch(() => [])).map((t) => ({ value: t, label: t }))] }],
    outputs: [OUT('video', 'video')],
    run: async (x) => {
      const st = await window.hub.ae.status();
      if (!st.found) throw new Error(st.reason || 'After Effects not found');
      const { project, comp } = x.in('project');
      store.set('review.lastProject', project);
      const dirs = await R().videoDirs();
      const sep = dirs[0]?.includes('\\') ? '\\' : '/';
      const stem = (comp || base(project).replace(/\.aep$/i, '')).replace(/[\\/:*?"<>|]/g, '_');
      const n = R().videos.filter((v) => base(v.path).toLowerCase().startsWith(stem.toLowerCase())).length + 1;
      const output = dirs[0] ? `${dirs[0]}${sep}${stem}_v${n}.mp4` : '';
      const tmpl = x.v('template') && x.v('template') !== 'auto' ? x.v('template') : V.omTemplatesFor('reels', await window.hub.ae.templates())[0] || '';
      x.status(`aerender ${comp || base(project)}…`);
      const r = await R().renderAe({ project, comp, output: tmpl ? output : '', omTemplate: tmpl }, { quiet: true });
      if (!r.ok) throw new Error(r.error || 'Render failed');
      await R().load(true);
      x.status(`${base(output || r.value?.output)} · ${r.value?.seconds}s`);
      return { video: { path: output || r.value?.output } };
    }, cmd: (n, x) => `/render ${x?.comp ? `"${x.comp}"` : '<comp>'}` });
  ae({ type: 'ae-script', title: 'Run AE script', desc: 'Runs a built-in or saved After Effects script (one undo step) before rendering', keywords: 'extendscript jsx automation',
    inputs: [IN('project', 'project', { label: 'Project (after)' })], widgets: [{ name: 'script', kind: 'pick', label: 'Script', value: '', choices: async () => [...(typeof AEData !== 'undefined' ? AEData.SCRIPTS.map((s) => ({ value: s.name, label: s.name, hint: s.desc })) : []), ...(await window.hub.kvGet('ae-scripts', [])).map((s) => ({ value: s.name, label: s.name }))] }],
    outputs: [OUT('project', 'project')],
    run: async (x) => {
      const q = String(x.v('script') || '').toLowerCase();
      if (!q) throw new Error('Pick a script');
      const builtin = typeof AEData !== 'undefined' && AEData.SCRIPTS.find((s) => s.name.toLowerCase() === q);
      const mine = (await window.hub.kvGet('ae-scripts', [])).find((s) => s.name.toLowerCase() === q);
      const code = builtin ? builtin.code(Object.fromEntries(builtin.params.map((p) => [p.name, p.value]))) : mine?.code;
      if (!code) throw new Error(`No script “${x.v('script')}”`);
      const r = await R().runAeScript(code, x.v('script'));
      if (!r.ok) throw new Error(r.error);
      x.status(x.v('script'));
      return { project: x.in('project') };
    }, cmd: (n) => `/ae-run ${n.values?.script || '<script>'}` });

  ae({ type: 'ae-comp', title: 'New AE comp', desc: 'Creates a comp in After Effects for a social format (9:16, 4:5, 1:1, 16:9) with your length and frame rate', keywords: 'composition format create',
    inputs: [IN('project', 'project', { label: 'After' })], widgets: [SEL('format', FORMAT_OPTS), NUM('seconds', 15, 1, 600, { slider: false }), NUM('fps', 30, 12, 60, { slider: false, step: 1 })], outputs: [OUT('project', 'project')], cmdBadge: (n) => n.values?.format || '9:16',
    run: async (x) => {
      const c = Commands.get('ae-comp');
      if (!c) throw new Error('The /ae-comp command is missing');
      const out = await c.run(`${x.v('format')} ${x.v('seconds')} ${x.v('fps')}`, { agentId: H.claudeAgent()?.id, say: () => {} });
      if (!out) throw new Error('After Effects didn\'t create it (is it installed and running?)');
      x.status(String(out).replace(/[*`]/g, '').slice(0, 60));
      return { project: x.in('project') || null };
    }, cmd: (n) => `/ae-comp ${n.values?.format || '9:16'} ${n.values?.seconds || 15} ${n.values?.fps || 30}` });

  // Agents and chat
  const ag = cat('Agents & chat', '#48ddff');
  ag({ type: 'feedback', title: 'Send notes to an agent', desc: 'Writes the notes and their frame grabs into an agent\'s chat box (Video Director, Claude or Astra), ready to send', keywords: 'director feedback astra claude',
    inputs: [IN('notes', 'notes', { required: true })], widgets: [SEL('agent', AGENTS), TOG('sheet', false, { label: 'With a contact sheet' }), TOG('send', false, { label: 'Send right away' })], outputs: [OUT('notes', 'notes')], cmdBadge: (n) => n.values?.agent || 'director',
    run: async (x) => {
      await show(x.in('notes').path);
      const a = await R().sendFeedback(x.v('agent'), { sheet: x.v('sheet') });
      if (!a) throw new Error('No open notes to send, or no such agent');
      if (x.v('send')) { await new Promise((r) => setTimeout(r, 400)); const d = Native.view?.(a.id)?.input?.value; if (d) await Native.sendText(a.id, d); }
      x.status(`→ ${a.name}`);
      return { notes: x.in('notes') };
    }, cmd: (n) => `/send-feedback ${n.values?.agent || 'director'}${n.values?.sheet ? ' sheet' : ''}` });
  ag({ type: 'ask', title: 'Ask an agent', desc: 'Drafts a message to an agent about the video ({file}, {name}, {time} fill in), optionally sends it', keywords: 'prompt message chat claude',
    inputs: [IN('video', 'video')], widgets: [SEL('agent', AGENTS), TXT('text', 'Have a look at {name}: what would make it stronger for TikTok?', { label: 'Message' }), TOG('send', false, { label: 'Send right away' })], outputs: [OUT('video', 'video')],
    run: async (x) => {
      const a = R().agentFor(x.v('agent'));
      if (!a) throw new Error('No such agent');
      const p = videoOf(x);
      const text = String(x.v('text') || '').replace(/\{file\}/g, p || '').replace(/\{name\}/g, base(p)).replace(/\{time\}/g, R().status()?.timecode || '');
      activate(a.id);
      if (x.v('send')) await Native.sendText(a.id, text); else Native.setDraft(a.id, text);
      x.status(`→ ${a.name}`);
      return { video: p ? { path: p } : null };
    } });
  ag({ type: 'command', title: 'Chat command', desc: 'Runs any chat command (/export reels, /safe shorts, /ae-comp 9:16 15…) as a step', keywords: 'slash command anything',
    inputs: [IN('in', 'any', { label: 'After' })], widgets: [TXT('line', '/video-status', { label: 'Command' })], outputs: [OUT('out', 'any', 'Then')], cmdBadge: (n) => String(n.values?.line || '').split(' ')[0],
    run: async (x) => {
      const line = String(x.v('line') || '').trim();
      const hit = Commands.parse(line.startsWith('/') ? line : `/${line}`);
      if (!hit) throw new Error(`Not a command: ${line}`);
      const agent = R().agentFor('director') || H.claudeAgent();
      const out = await hit.def.run(hit.args, { agentId: agent?.id, say: (t) => agent && Native.note(agent.id, String(t)), draft: (t) => agent && Native.setDraft(agent.id, t), send: (t) => agent && Native.sendText(agent.id, t), note: (t, o) => agent && Native.note(agent.id, String(t), o), get agent() { return agent; }, get chat() { return agent ? Native.current?.(agent.id) : null; } });
      x.status(typeof out === 'string' && out ? out.split('\n')[0].replace(/[*`]/g, '').slice(0, 60) : `/${hit.def.name} ✓`);
      return { out: x.in('in') };
    }, cmd: (n) => n.values?.line || '' });
  ag({ type: 'say', title: 'Note in the chat', desc: 'Posts a note in the Video Director\'s chat (or Claude\'s): {file}, {name} fill in', inputs: [IN('in', 'any', { label: 'After' })], widgets: [TXT('text', 'Flow done: {name}', { label: 'Text' })], outputs: [OUT('out', 'any', 'Then')],
    run: async (x) => {
      const v = x.in('in'); const p = v?.path || v?.paths?.[0] || R().current?.path || '';
      const agent = R().agentFor('director') || H.claudeAgent();
      const text = String(x.v('text') || '').replace(/\{file\}/g, p).replace(/\{name\}/g, base(p));
      if (agent) Native.note(agent.id, text); else toast(text);
      x.status('posted');
      return { out: v };
    } });
  ag({ type: 'pause', title: 'Pause', desc: 'Waits a number of seconds', inputs: [IN('in', 'any', { label: 'After' })], widgets: [NUM('seconds', 2, 0.5, 60, { slider: false })], outputs: [OUT('out', 'any', 'Then')],
    run: async (x) => { const s = Number(x.v('seconds')) || 1; for (let i = 0; i < s * 10 && !x.stopped(); i += 1) { x.status(`${(s - i / 10).toFixed(1)} s`, i / (s * 10)); await new Promise((r) => setTimeout(r, 100)); } return { out: x.in('in') }; } });

  // ---------- running a flow ----------
  let view = null; // the flow view (inside Video Review)
  let running = null; // { stop, waiting }
  const cache = new Map(); // node id → outputs of the last run
  const jobs = new Set();
  window.hub?.video?.onJob?.((ev) => { if (!running || !jobs.has(ev.id) || ev.type !== 'progress') return; const id = running.jobNode.get(ev.id); if (id) view?.setProgress(id, ev.pct); });
  function topo(graph, ids) {
    const keep = new Set(ids || graph.nodes.map((n) => n.id));
    const indeg = new Map([...keep].map((id) => [id, 0]));
    for (const l of graph.links) if (keep.has(l.from[0]) && keep.has(l.to[0])) indeg.set(l.to[0], indeg.get(l.to[0]) + 1);
    // ready nodes left to right, top to bottom (the order you read the flow in)
    const pos = new Map(graph.nodes.map((n) => [n.id, n]));
    const ready = [...keep].filter((id) => !indeg.get(id));
    const order = [];
    while (ready.length) {
      ready.sort((a, b) => pos.get(a).x - pos.get(b).x || pos.get(a).y - pos.get(b).y);
      const id = ready.shift();
      order.push(id);
      for (const l of graph.links) if (l.from[0] === id && keep.has(l.to[0])) { indeg.set(l.to[0], indeg.get(l.to[0]) - 1); if (!indeg.get(l.to[0])) ready.push(l.to[0]); }
    }
    return order;
  }
  // run the whole flow, or up to one node (it and what feeds it), or from one node on (with the last run's inputs)
  async function run({ upTo = null, from = null } = {}) {
    if (running) throw new Error('A flow is already running (/video-flow-stop stops it)');
    const g = view.getGraph();
    if (!g.nodes.length) throw new Error('The flow is empty: /video-flow <preset> starts one');
    const ids = upTo ? view.chain([upTo], 'up') : from ? view.chain([from], 'down') : null;
    const order = topo(g, ids);
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const state = { stopped: false, waiting: null, jobNode: new Map() };
    running = state;
    setRunning(true);
    if (!from) { view.clearRun(); cache.clear(); } else for (const id of order) view.setRun(id, null);
    for (const id of order) view.setRun(id, 'queued', 'waiting');
    const done = new Set(); const failed = new Set(); const gated = new Map(); // gated: stopped on purpose (Only if notes)
    let ok = 0;
    const t0 = Date.now();
    for (const id of order) {
      const node = byId.get(id);
      const def = reg.get(node.type);
      if (state.stopped) { view.setRun(id, 'skip', 'stopped'); continue; }
      const ins = {};
      let blocked = null;
      for (const f of def.inputs) {
        const l = g.links.find((x) => x.to[0] === id && x.to[1] === f.name);
        if (!l) { if (f.required) blocked = `connect “${f.label}”`; continue; }
        if (gated.has(l.from[0])) { gated.set(id, gated.get(l.from[0])); blocked = `skipped: ${gated.get(l.from[0])}`; continue; }
        if (failed.has(l.from[0])) { blocked = `${byId.get(l.from[0])?.title || reg.get(byId.get(l.from[0])?.type)?.title} didn't finish`; continue; }
        const val = cache.get(l.from[0])?.[l.from[1]];
        if (val == null && f.required) blocked = blocked || `nothing came from ${l.from[0]}`;
        ins[f.name] = val;
      }
      if (blocked) { if (!gated.has(id)) failed.add(id); view.setRun(id, 'skip', blocked); continue; }
      if (node.bypass) {
        // skipped on purpose: inputs pass through to outputs of the same type
        const out = {};
        for (const o of def.outputs) { const f = def.inputs.find((x) => ins[x.name] != null && reg.compatible(x.type, o.type)); if (f) out[o.name] = ins[f.name]; }
        cache.set(id, out); done.add(id); view.setRun(id, 'skip', 'bypassed');
        continue;
      }
      const vals = { ...Object.fromEntries(def.fields.filter((f) => f.value !== undefined).map((f) => [f.name, f.value])), ...(node.values || {}) };
      let skipRest = null;
      const x = {
        node, v: (k) => vals[k], in: (k) => ins[k],
        status: (text, pct = null) => view.setRun(id, 'running', text, pct),
        stopped: () => state.stopped,
        job: (jobId) => { jobs.add(jobId); state.jobNode.set(jobId, id); state.job = jobId; },
        skipRest: (why) => { skipRest = why; },
        waitForMe: (text) => waitForMe(id, text),
      };
      view.setRun(id, 'running', def.title);
      paintStatus(`Running ${done.size + failed.size + 1}/${order.length}: ${node.title || def.title}…`);
      try {
        const out = await def.run(x);
        if (skipRest) { gated.set(id, skipRest); view.setRun(id, 'warn', skipRest); continue; }
        cache.set(id, out || {});
        done.add(id); ok += 1;
        view.setRun(id, 'ok', view.runOf(id)?.text && view.runOf(id).text !== def.title ? view.runOf(id).text : 'done');
      } catch (err) {
        failed.add(id);
        view.setRun(id, 'error', err.message);
        if (state.stopped) continue;
      }
    }
    running = null;
    setRunning(false);
    const secs = Math.round((Date.now() - t0) / 1000);
    const msg = state.stopped ? `Stopped after ${ok} step${ok === 1 ? '' : 's'}.` : failed.size ? `${ok} of ${order.length} steps done; ${failed.size} didn't (see the red / grey nodes).` : `All ${ok} steps done in ${secs}s.`;
    paintStatus(msg, failed.size || state.stopped ? '' : 'ok');
    return { ok, failed: failed.size, total: order.length, stopped: state.stopped, text: msg, results: order.map((id) => ({ id, ...view.runOf(id) })) };
  }
  function stop() {
    if (!running) return false;
    running.stopped = true;
    if (running.job) window.hub.video.cancel(running.job).catch?.(() => {});
    running.waiting?.(false);
    return true;
  }
  // "Wait for me": the player comes back with a bar (Continue / Stop / Back to the flow)
  function waitForMe(id, text) {
    view.setRun(id, 'wait', text);
    return new Promise((resolve) => {
      const finish = (ok) => { if (!running || running.waiting !== finish) return; running.waiting = null; bar.remove(); setOn(true); resolve(ok); };
      running.waiting = finish;
      const bar = el('div', { class: 'vf-wait' },
        el('span', { class: 'vf-wait-dot' }), el('span', { class: 'vf-wait-text', text: text || 'Your turn' }),
        el('button', { class: 'primary small', text: 'Continue', title: 'Go on with the flow (/video-flow-continue)', on: { click: () => finish(true) } }),
        el('button', { class: 'ghost small', text: 'Stop', on: { click: () => { finish(false); stop(); } } }),
        el('button', { class: 'ghost small', text: 'Flow', title: 'Look at the flow (it keeps waiting)', on: { click: () => setOn(true) } }));
      refs.main?.append(bar);
      setOn(false);
      toast('The flow is waiting for you', { timeout: 3000 });
    });
  }
  const continueFlow = () => { if (!running?.waiting) return false; running.waiting(true); return true; };

  // ---------- the panel in Video Review ----------
  const refs = {};
  const GRAPH_KEY = 'videoFlow.graph';
  function attach({ main, seg, top } = {}) {
    if (refs.panel || !main) return;
    refs.main = main;
    refs.btn = el('button', { text: 'Flow', title: 'The review → export pipeline as nodes you can run (/video-nodes)', dataset: { feature: 'Video flow' }, on: { click: () => setOn(!on) } });
    seg?.append(refs.btn);
    refs.reviewBtn = seg?.firstElementChild || null; // "Review" goes back to the player
    refs.reviewBtn?.addEventListener('click', () => setOn(false));
    refs.status = el('span', { class: 'vf-status' });
    refs.panel = el('div', { class: 'vf-panel', hidden: true });
    refs.panel.addEventListener('keydown', (e) => e.stopPropagation()); // Space, J, K… stay with the nodes, not the player
    main.append(refs.panel);
    void top;
  }
  let on = false;
  function ensureView() {
    if (view) return view;
    const saved = store.get(GRAPH_KEY, null);
    view = NodeView.create(refs.panel, {
      registry: reg, graph: saved ? NodeView.normalize(saved, reg) : buildPreset(findPreset('review-notes')), storeKey: 'video.flow',
      onChange: (g, info) => { if (!info.live) store.set(GRAPH_KEY, NodeView.compact(g, reg)); },
      hud: [
        { text: '▶ Run', title: 'Run the flow (/video-flow-run)', cls: 'primary', run: () => (running ? stop() : runSafe()) },
      ],
      menuItems: () => [
        'Video flow',
        ['Presets…', 'Ready-made flows: all socials, review + notes, render → compare…', () => presetPicker()],
        ['Run', '', () => runSafe(), { key: '▶' }],
        running ? ['Stop', '', () => stop()] : null,
        ['Clear the run marks', '', () => { view.clearRun(); cache.clear(); paintStatus(''); }],
        ['As chat commands…', 'The same steps as chat commands you can paste', () => Modal.alert('The flow as chat commands', commandsText())],
        ['Save this flow…', '', () => saveAs()],
        ['Saved flows…', '', () => loadPicker()],
        ['Back to the player', '', () => setOn(false)],
      ],
      nodeMenu: (n) => [
        'Run',
        ['Run up to here', 'This step and what feeds it', () => runSafe({ upTo: n.id })],
        ['Run from here', 'This step and the ones after it (with the last run\'s results)', () => runSafe({ from: n.id }), { disabled: Boolean(running) }],
        reg.get(n.type)?.cmd ? ['Copy its chat command', '', () => copyText(cmdOf(n), 'Command copied')] : null,
      ],
      pickerExtras: () => PRESETS.map((p) => ({ label: `Preset: ${p.name}`, category: 'Presets', desc: p.desc, run: () => usePreset(p.id) })),
    });
    refs.panel.append(refs.status);
    return view;
  }
  function setOn(v) {
    if (!refs.panel) return false;
    on = Boolean(v);
    refs.panel.hidden = !on;
    refs.main.classList.toggle('vf-on', on);
    refs.main.closest('.vr')?.parentElement?.classList.toggle('vf-wide', on); // the library steps aside while the flow shows
    refs.btn?.classList.toggle('on', on);
    refs.reviewBtn?.classList.toggle('on', !on);
    if (on) { ensureView(); requestAnimationFrame(() => { view.relayout(); view.focus(); }); }
    return on;
  }
  function setRunning(r) {
    const b = view?.hudButton(0);
    if (b) { b.textContent = r ? '■ Stop' : '▶ Run'; b.classList.toggle('danger', r); b.classList.toggle('primary', !r); b.title = r ? 'Stop the flow (/video-flow-stop)' : 'Run the flow (/video-flow-run)'; }
    refs.panel?.classList.toggle('vf-running', r);
  }
  function paintStatus(text, kind = '') { view?.setStatus(text, kind); }
  const runSafe = (o) => run(o).catch((err) => { toast(err.message, { type: 'error' }); });
  const cmdOf = (n) => { const d = reg.get(n.type); const out = Object.values(cache.get(n.id) || {})[0]; try { return d.cmd?.(n, out?.path ? out : n.type === 'render' ? null : out) || ''; } catch { return ''; } };
  function commandsText() {
    const g = view.getGraph();
    const lines = topo(g).map((id) => g.nodes.find((n) => n.id === id)).map((n) => { const c = cmdOf(n); return `${c || '(no command)'}    ← ${n.title || reg.get(n.type).title}`; });
    return lines.join('\n') || 'The flow is empty.';
  }

  // ---------- presets ----------
  const PRESETS = [];
  function preset(id, name, desc, b, tags = '') { PRESETS.push({ id, name, desc, build: b, tags }); }
  const findPreset = (q) => { const s = String(q || '').trim().toLowerCase(); return PRESETS.find((p) => p.id === s) || PRESETS.find((p) => p.name.toLowerCase() === s) || PRESETS.find((p) => `${p.id} ${p.name} ${p.tags}`.toLowerCase().includes(s)); };
  function buildPreset(p) {
    const g = NodeView.emptyGraph('video');
    const api = {
      add(type, values = {}, title) { const d = reg.get(type); if (!d) throw new Error(`flow ${p.id}: unknown step ${type}`); const id = reg.idFor(d, g); g.nodes.push({ id, type, x: 0, y: 0, values, ...(title ? { title } : {}) }); return id; },
      link(a, b) { const [x, xp] = a.split('.'); const [y, yp] = b.split('.'); g.links.push({ from: [x, xp], to: [y, yp] }); },
    };
    p.build(api);
    const graph = NodeView.normalize(g, reg);
    NodeView.autoLayout(graph, reg, { colW: 250 });
    graph.meta = { preset: p.id };
    return graph;
  }
  preset('socials4', 'Export all 4 socials', 'The open video → Reels 9:16, feed 4:5, square 1:1 and YouTube 16:9, one after another', (g) => {
    const v = g.add('open-video');
    for (const p of ['reels', 'feed45', 'square', 'yt1080']) g.link(`${v}.video`, `${g.add('export', { preset: p })}.video`);
  }, 'social formats batch export');
  preset('review-notes', 'Review + send notes to director', 'Opens the latest render, waits while you watch and take notes, then sends them (with frame grabs) to the Video Director', (g) => {
    const lib = g.add('library', { video: 'latest' }); const rv = g.add('review'); const w = g.add('wait', { message: 'Watch it and add your notes (N), then Continue.' }); const nt = g.add('notes'); const only = g.add('if-notes'); const fb = g.add('feedback', { agent: 'director' });
    g.link(`${lib}.video`, `${rv}.video`); g.link(`${rv}.video`, `${w}.in`); g.link(`${w}.out`, `${nt}.video`); g.link(`${nt}.notes`, `${only}.notes`); g.link(`${only}.notes`, `${fb}.notes`);
  }, 'feedback director notes');
  preset('render-compare', 'Render AE comp → compare with previous', 'aerender the comp into a new version, open it, and A/B it against the version before', (g) => {
    const pr = g.add('ae-project'); const r = g.add('render'); const rv = g.add('review'); const prev = g.add('version', { which: 'previous' }); const cmp = g.add('compare', { mode: 'wipe' });
    g.link(`${pr}.project`, `${r}.project`); g.link(`${r}.video`, `${rv}.video`); g.link(`${rv}.video`, `${prev}.video`); g.link(`${rv}.video`, `${cmp}.a`); g.link(`${prev}.video`, `${cmp}.b`);
  }, 'after effects aerender versions ab');
  preset('lab-reels', 'Lab recording → Reels', 'The newest Lab recording: first 15 s, check the Reels safe zones, export for Reels', (g) => {
    const lab = g.add('lab-recording'); const lp = g.add('loop', { mode: 'first seconds', n: 15 }); const sz = g.add('safe', { platform: 'reels' }); const ex = g.add('export', { preset: 'reels' });
    g.link(`${lab}.video`, `${lp}.video`); g.link(`${lp}.video`, `${sz}.video`); g.link(`${sz}.video`, `${ex}.video`);
  }, 'three lab recording instagram');
  preset('safe-pass', 'Safe-zone pass', 'Checks the open video against TikTok, Reels and Shorts safe zones, one after another (you say OK each time)', (g) => {
    const v = g.add('open-video'); const a = g.add('safe', { platform: 'tiktok' }); const b = g.add('safe', { platform: 'reels' }); const c = g.add('safe', { platform: 'shorts' });
    g.link(`${v}.video`, `${a}.video`); g.link(`${a}.video`, `${b}.video`); g.link(`${b}.video`, `${c}.video`);
  }, 'tiktok reels shorts ui check');
  preset('render-review-export', 'Render → review → export', 'Render the comp, watch it (your OK), then export for TikTok', (g) => {
    const pr = g.add('ae-project'); const r = g.add('render'); const rv = g.add('review'); const w = g.add('wait', { message: 'Happy with it? Continue exports it for TikTok.' }); const ex = g.add('export', { preset: 'tiktok' });
    g.link(`${pr}.project`, `${r}.project`); g.link(`${r}.video`, `${rv}.video`); g.link(`${rv}.video`, `${w}.in`); g.link(`${w}.out`, `${ex}.video`);
  }, 'after effects approve deliver');
  preset('blur-verticals', '16:9 → verticals (blurred fill)', 'A landscape video → Reels, Shorts and TikTok with a blurred background instead of a hard crop', (g) => {
    const v = g.add('open-video');
    for (const p of ['reels', 'shorts', 'tiktok']) g.link(`${v}.video`, `${g.add('export', { preset: p, fit: 'blur' })}.video`);
  }, 'landscape vertical blur fill');
  preset('second-opinion', 'Second opinion from Astra', 'A contact sheet and your notes go to Astra (Codex) for a second opinion', (g) => {
    const v = g.add('open-video'); const sh = g.add('sheet', { frames: 12 }); const nt = g.add('notes'); const fb = g.add('feedback', { agent: 'astra', sheet: true });
    g.link(`${v}.video`, `${sh}.video`); g.link(`${sh}.video`, `${nt}.video`); g.link(`${nt}.notes`, `${fb}.notes`);
  }, 'codex gpt review');
  preset('carry-newest', 'Carry notes to the newest version', 'The open video\'s notes go to its newest version, which opens so you can check them off', (g) => {
    const v = g.add('open-video'); const nw = g.add('version', { which: 'newest' }); const c = g.add('carry'); const rv = g.add('review'); const nt = g.add('notes');
    g.link(`${v}.video`, `${nw}.video`); g.link(`${v}.video`, `${c}.from`); g.link(`${nw}.video`, `${c}.to`); g.link(`${c}.video`, `${rv}.video`); g.link(`${rv}.video`, `${nt}.video`);
  }, 'versions notes copy');
  preset('web-loop', 'GIF + WebM loop for the web', 'Loop 8 beats from the drop, then a GIF and a WebM of it', (g) => {
    const v = g.add('open-video'); const lp = g.add('loop', { mode: 'drop', n: 8 }); const gif = g.add('export', { preset: 'gif' }); const webm = g.add('export', { preset: 'webm' });
    g.link(`${v}.video`, `${lp}.video`); g.link(`${lp}.video`, `${gif}.video`); g.link(`${lp}.video`, `${webm}.video`);
  }, 'gif webm website loop');
  preset('youtube-pack', 'YouTube pack', 'A 1440p upload (better encode), a ProRes master and a thumbnail frame', (g) => {
    const v = g.add('open-video'); const a = g.add('export', { preset: 'yt1440', range: 'all' }); const b = g.add('export', { preset: 'master', range: 'all' }); const t = g.add('grab', { at: '50%' });
    g.link(`${v}.video`, `${a}.video`); g.link(`${v}.video`, `${b}.video`); g.link(`${v}.video`, `${t}.video`);
  }, 'youtube master prores thumbnail');
  preset('proxy-review', 'Proxy + review', 'A playable H.264 proxy of the latest render, opened for review', (g) => {
    const lib = g.add('library', { video: 'latest' }); const px = g.add('proxy'); const rv = g.add('review');
    g.link(`${lib}.video`, `${px}.video`); g.link(`${px}.file`, `${rv}.video`);
  }, 'prores huge playable');
  preset('crop-feed', 'Crop 9:16 → feed 4:5', 'Pick the 4:5 crop of a vertical (you check it), then export the Instagram feed version', (g) => {
    const v = g.add('open-video'); const c = g.add('crop', { format: '4:5', offset: 0.5 }); const w = g.add('wait', { message: 'Drag the crop to choose what stays, then Continue.' }); const ex = g.add('export', { preset: 'feed45' });
    g.link(`${v}.video`, `${c}.video`); g.link(`${c}.video`, `${w}.in`); g.link(`${w}.out`, `${ex}.video`);
  }, 'instagram feed reframe');
  preset('notes-md', 'Notes → Markdown file', 'Writes the open video\'s notes into a Markdown file in its exports folder and shows it', (g) => {
    const v = g.add('open-video'); const nt = g.add('notes'); const f = g.add('notes-file', { format: 'md' }); const r = g.add('reveal');
    g.link(`${v}.video`, `${nt}.video`); g.link(`${nt}.notes`, `${f}.notes`); g.link(`${f}.file`, `${r}.file`);
  }, 'export notes document');
  preset('lab-director', 'Lab recording → ask the director', 'The newest Lab recording, a contact sheet in the Video Director\'s chat, and a question drafted for it', (g) => {
    const lab = g.add('lab-recording'); const rv = g.add('review'); const sh = g.add('sheet', { frames: 12, attach: true }); const ask = g.add('ask', { agent: 'director', text: 'Here is {name} (contact sheet attached). What would make it hit harder on the drops?' });
    g.link(`${lab}.video`, `${rv}.video`); g.link(`${rv}.video`, `${sh}.video`); g.link(`${sh}.video`, `${ask}.video`);
  }, 'three lab feedback director');
  preset('reels-feed-pair', 'Reels + feed pair', 'A vertical → Reels 9:16 and an Instagram feed 4:5 crop (you check the crop first)', (g) => {
    const v = g.add('open-video'); const r = g.add('export', { preset: 'reels' }); const c = g.add('crop', { format: '4:5' }); const w = g.add('wait', { message: 'Drag the 4:5 crop to choose what stays, then Continue.' }); const f = g.add('export', { preset: 'feed45' });
    g.link(`${v}.video`, `${r}.video`); g.link(`${v}.video`, `${c}.video`); g.link(`${c}.video`, `${w}.in`); g.link(`${w}.out`, `${f}.video`);
  }, 'instagram reels feed');
  preset('keeper', 'Keep it (★ + tag + YouTube)', 'Favorite the open video, tag it "final" and export the 1080p YouTube version', (g) => {
    const v = g.add('open-video'); const f = g.add('fav'); const t = g.add('tag', { tags: 'final' }); const ex = g.add('export', { preset: 'yt1080', range: 'all' });
    g.link(`${v}.video`, `${f}.video`); g.link(`${f}.video`, `${t}.video`); g.link(`${t}.video`, `${ex}.video`);
  }, 'final favorite deliver');
  preset('empty', 'Empty flow', 'Just the open video: add steps with Tab', (g) => { g.add('open-video'); }, 'blank');

  function usePreset(id) {
    const p = findPreset(id);
    if (!p) throw new Error(`No flow preset “${id}”. See /video-flow-presets.`);
    ensureView();
    view.setGraph(buildPreset(p));
    view.clearRun(); cache.clear();
    store.set(GRAPH_KEY, NodeView.compact(view.getGraph(), reg));
    paintStatus(`${p.name}: ▶ Run when ready`);
    return p;
  }
  function presetPicker() {
    NodeView.presetPicker({ title: 'Video flows', items: PRESETS.map((p) => ({ ...p, hint: `/video-flow ${p.id}` })), onPick: (p) => { setOn(true); usePreset(p.id); } });
  }
  async function saveAs(name) {
    const n = name || await Modal.prompt('Save this flow as', { value: view.getGraph().meta?.preset ? findPreset(view.getGraph().meta.preset)?.name : '' });
    if (!n) return null;
    const all = await window.hub.kvGet('video-flows', {});
    all[n] = NodeView.compact(view.getGraph(), reg);
    await window.hub.kvSet('video-flows', all);
    toast(`Flow “${n}” saved`, { timeout: 1500 });
    return n;
  }
  async function loadSaved(name) {
    const all = await window.hub.kvGet('video-flows', {});
    const key = Object.keys(all).find((k) => k.toLowerCase() === String(name).toLowerCase()) || Object.keys(all).find((k) => k.toLowerCase().includes(String(name).toLowerCase()));
    if (!key) throw new Error(`No saved flow “${name}”`);
    ensureView();
    view.setGraph(NodeView.normalize(all[key], reg));
    view.clearRun(); cache.clear();
    return key;
  }
  async function loadPicker() {
    const all = await window.hub.kvGet('video-flows', {});
    const names = Object.keys(all);
    if (!names.length) { toast('No saved flows yet (⋯ → Save this flow…)'); return; }
    NodeView.presetPicker({ title: 'Saved flows', items: names.map((k) => ({ id: k, name: k, desc: `${all[k].nodes?.length || 0} steps`, hint: `/video-flow-load ${k}` })), onPick: (p) => loadSaved(p.id) });
  }

  // ---------- chat ----------
  async function ready() {
    if (typeof Review === 'undefined') throw new Error('Video Review is not available');
    await R().ensureMounted();
    if (!refs.panel) throw new Error('Video Review did not load');
    return ensureView();
  }
  const pairs = (s) => [...String(s || '').matchAll(/([\w]+)=("[^"]*"|'[^']*'|\[[^\]]*\]|\S+)/g)].map((m) => [m[1], (() => { const v = m[2].replace(/^['"]|['"]$/g, ''); if (/^(true|on|yes)$/i.test(v)) return true; if (/^(false|off|no)$/i.test(v)) return false; if (/^-?\d*\.?\d+$/.test(v)) return Number(v); if (/^\[.*\]$/.test(v)) { try { return JSON.parse(v); } catch { return v; } } return v; })()]);
  function summary() {
    const g = view.getGraph();
    if (!g.nodes.length) return 'The flow is empty.';
    return topo(g).map((id) => g.nodes.find((n) => n.id === id)).map((n) => {
      const d = reg.get(n.type);
      const changed = Object.entries(n.values || {}).filter(([k, v]) => { const f = d.fields.find((x) => x.name === k); return f && JSON.stringify(f.value) !== JSON.stringify(v); }).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
      const ins = g.links.filter((l) => l.to[0] === n.id).map((l) => `${l.to[1]}←${l.from[0]}`);
      const r = view.runOf(n.id);
      return `- ${r ? { ok: '✓', error: '✕', skip: '–', running: '◐', wait: '⏸', queued: '◌', warn: '!' }[r.state] : '·'} ${n.id} (${d.title})${n.bypass ? ' [bypassed]' : ''}${changed.length ? ` ${changed.join(' ')}` : ''}${ins.length ? ` · ${ins.join(', ')}` : ''}${r?.text ? ` — ${r.text}` : ''}`;
    }).join('\n');
  }
  const area = 'Video';
  const presetComplete = (a) => PRESETS.filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(String(a).toLowerCase())).map((p) => ({ value: p.id, label: p.name, hint: p.desc }));
  const nodeIds = (a) => (view ? view.getGraph().nodes.map((n) => n.id).filter((id) => id.startsWith(a)).map((id) => ({ value: id })) : []);
  const reg2 = (def) => { if (typeof Commands === 'undefined' || Commands.get(def.name)) return; Commands.register({ area, ...def }); };
  reg2({ name: 'video-nodes', aliases: ['video-flow-view'], args: '[on|off]', desc: 'Show / hide the flow view in Video Review (review → notes → export steps as nodes you can run)', complete: () => [{ value: 'on' }, { value: 'off' }],
    run: async (a) => { activate('tool:ae'); await ready(); const want = a.trim() ? a.trim() !== 'off' : !on; setOn(want); return null; } });
  reg2({ name: 'video-flow', args: '<preset>', desc: 'Load a ready-made video flow: socials4, review-notes, render-compare, lab-reels, safe-pass…', complete: presetComplete,
    run: async (a) => { activate('tool:ae'); await ready(); setOn(true); if (!a.trim()) { presetPicker(); return null; } const p = usePreset(a); return `Flow “${p.name}” ready: \`/video-flow-run\` runs it.\n${summary()}`; } });
  reg2({ name: 'video-flow-run', args: '[node]', desc: 'Run the video flow (or up to one step); status shows on the nodes', complete: nodeIds,
    run: async (a, ctx) => {
      activate('tool:ae'); await ready(); setOn(true);
      const r = await run({ upTo: a.trim() || null });
      ctx?.say?.(`${r.text}\n${summary()}`);
      return null;
    } });
  reg2({ name: 'video-flow-stop', desc: 'Stop the running video flow (cancels an export in progress)', run: async () => (stop() ? 'Stopping the flow.' : 'No flow is running.') });
  reg2({ name: 'video-flow-continue', aliases: ['flow-continue'], desc: 'Continue a video flow that waits for you', run: async () => (continueFlow() ? 'Continuing.' : 'No flow is waiting.') });
  reg2({ name: 'video-flow-presets', args: '[filter]', desc: 'List the ready-made video flows', run: async (a) => PRESETS.filter((p) => !a || `${p.id} ${p.name} ${p.tags}`.toLowerCase().includes(a.toLowerCase())).map((p) => `- \`/video-flow ${p.id}\` ${p.name}: ${p.desc}`).join('\n') });
  reg2({ name: 'video-flow-list', desc: 'The video flow: steps in run order, settings, wires and the last run\'s status', run: async () => { await ready(); return summary(); } });
  reg2({ name: 'video-flow-types', args: '[filter]', desc: 'List the video flow steps (with a filter: inputs and outputs)',
    run: async (a) => { const q = a.toLowerCase(); const by = new Map(); for (const d of reg.list()) { if (q && !`${d.type} ${d.title} ${d.category} ${d.keywords || ''}`.toLowerCase().includes(q)) continue; if (!by.has(d.category)) by.set(d.category, []); by.get(d.category).push(q ? `${d.type} (in: ${d.inputs.map((f) => f.name).join(', ') || '–'}; out: ${d.outputs.map((o) => o.name).join(', ') || '–'}; ${d.widgets.map((w) => w.name).join(', ')})` : d.type); } return [...by].map(([c, l]) => `**${c}**: ${l.join(', ')}`).join('\n') || 'No step matches.'; } });
  reg2({ name: 'video-flow-add', args: '<type> [field=value…] [to=node.input]', desc: 'Add a step to the video flow (to= wires it in)', complete: (a) => reg.list().filter((d) => d.type.startsWith(a) || d.title.toLowerCase().includes(a.toLowerCase())).map((d) => ({ value: d.type, label: d.title, hint: d.category })),
    run: async (args) => {
      await ready(); setOn(true);
      const [type, ...kv] = args.split(/\s+/);
      const d = reg.get(type) || reg.list().find((x) => x.title.toLowerCase().includes(String(type).toLowerCase()));
      if (!d) throw new Error(`No step “${type}”. See /video-flow-types.`);
      const vals = Object.fromEntries(pairs(kv.join(' ')));
      const to = vals.to; delete vals.to;
      const id = view.addNode(d.type, { values: vals });
      if (to) { const [tid, tp] = String(to).split('.'); const tn = view.getGraph().nodes.find((n) => n.id === tid); const tf = reg.get(tn?.type)?.inputs.find((f) => f.name === tp); const o = tf && d.outputs.find((x) => reg.compatible(x.type, tf.type)); if (o) view.connect(id, o.name, tid, tp); }
      // no to=: the new step follows the last one that fits
      else {
        // the newest step with an output of the same type (else one that converts) feeds it
        const g = view.getGraph(); const f = d.inputs[0];
        const outOf = (n, exact) => reg.get(n.type).outputs.find((o) => (exact ? o.type === f.type || f.type === 'any' : reg.compatible(o.type, f.type)));
        const others = [...g.nodes].reverse().filter((n) => n.id !== id);
        const prev = f && (others.find((n) => outOf(n, true)) || others.find((n) => outOf(n, false)));
        const o = prev && (outOf(prev, true) || outOf(prev, false));
        if (o) view.connect(prev.id, o.name, id, f.name);
      }
      return `Added ${id} (${d.title}).`;
    } });
  reg2({ name: 'video-flow-link', args: '<node.output> <node.input>', desc: 'Wire two video flow steps', run: async (args) => { await ready(); const [a, b] = args.split(/\s+|→|->/).filter(Boolean); const [x, xp] = a.split('.'); const [y, yp] = (b || '').split('.'); if (!view.connect(x, xp, y, yp)) throw new Error(`Could not connect ${a} to ${b}`); return `Connected ${a} → ${b}.`; } });
  reg2({ name: 'video-flow-set', args: '<node> field=value…', desc: 'Change a video flow step\'s settings (preset=tiktok fit=blur…)', complete: nodeIds,
    run: async (args) => { await ready(); const [id, ...kv] = args.split(/\s+/); const done = pairs(kv.join(' ')).filter(([k, v]) => view.setValue(id, k, v)).map(([k]) => k); if (!done.length) throw new Error(`Nothing set on ${id}. Settings: ${reg.get(view.getGraph().nodes.find((n) => n.id === id)?.type)?.fields.map((f) => f.name).join(', ') || '(no such step)'}`); return `Set ${done.map((k) => `${id}.${k}`).join(', ')}.`; } });
  reg2({ name: 'video-flow-rm', args: '<node…>', desc: 'Remove steps from the video flow', complete: nodeIds, run: async (args) => { await ready(); const ids = args.split(/[\s,]+/).filter(Boolean); view.removeNodes(ids); return `Removed ${ids.join(', ')}.`; } });
  reg2({ name: 'video-flow-skip', args: '<node…>', desc: 'Bypass (skip) steps of the video flow, or bring them back', complete: nodeIds, run: async (args) => { await ready(); const ids = args.split(/[\s,]+/).filter(Boolean); view.bypass(ids); return `Toggled skipping ${ids.join(', ')}.`; } });
  reg2({ name: 'video-flow-commands', desc: 'The video flow as the chat commands that do the same steps', run: async () => { await ready(); return `\`\`\`\n${commandsText()}\n\`\`\``; } });
  reg2({ name: 'video-flow-save', args: '<name>', desc: 'Save the video flow under a name', run: async (a) => { await ready(); const n = await saveAs(a.trim() || undefined); return n ? `Saved as “${n}”.` : null; } });
  reg2({ name: 'video-flow-load', args: '<name>', desc: 'Load a saved video flow', complete: () => [], run: async (a) => { activate('tool:ae'); await ready(); setOn(true); const k = await loadSaved(a.trim()); return `Loaded “${k}”.\n${summary()}`; } });
  reg2({ name: 'video-flow-saved', desc: 'Your saved video flows', run: async () => { const all = await window.hub.kvGet('video-flows', {}); const k = Object.keys(all); return k.length ? k.map((n) => `- \`/video-flow-load ${n}\` (${all[n].nodes?.length || 0} steps)`).join('\n') : 'No saved flows yet (/video-flow-save <name>).'; } });
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Video: flow view (nodes)', () => Commands.run('video-nodes', 'on'));
    AppUI.addAction('Video: flow presets…', () => Commands.run('video-flow', ''));
    AppUI.addAction('Video: run the flow', () => Commands.run('video-flow-run', ''));
  }
  async function projectDirs() {
    if (H.settings().aeProjectDirs?.length) return H.settings().aeProjectDirs;
    const home = await window.hub.fs.home();
    const sep = home.includes('\\') ? '\\' : '/';
    return ['Documents', 'Desktop', /Mac/.test(navigator.platform) ? 'Movies' : 'Videos'].map((d) => `${home}${sep}${d}`);
  }

  const api = {
    registry: reg, attach, setOn, get on() { return on; }, get view() { return view; }, run, stop, continue: continueFlow, usePreset, presetPicker, summary, commandsText,
    presets: () => PRESETS.map(({ id, name, desc }) => ({ id, name, desc })), buildPreset: (id) => buildPreset(findPreset(id)), get running() { return Boolean(running); },
  };
  window.VideoNodes = api;
  return api;
})();
