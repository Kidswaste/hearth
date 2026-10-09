// Chat commands for the video editor (Video Review ✂, round 7): sequences and templates, formats, tracks, layers
// (overlays, stills, music, titles, lower thirds, colors), transitions, looks and adjustments, keyframes and
// curves, motion presets, speed ramps, reverse, NLE trims (roll / slip / slide / lift / extract / insert /
// overwrite), razor, markers with notes, exact frames, zoom, nesting, renders. Area "Video" (`/help editor`).
// Targets: no number = the selection (else the clip under the playhead); "3" = main-track clip 3; "V2.1" / "T1.2"
// = item 1 of track V2 / item 2 of T1. Times: 2.5, 0:03.2, 00:00:04:12, f90, +10f.
const CutEditCmds = (() => {
  const C = CutData;
  const FX = EditFX;
  const AREA = 'Video';
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, args, n = 16) => { const q = String(args || '').toLowerCase().split(/\s+/).pop(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => !q || String(x.value).toLowerCase().startsWith(q) || String(x.hint || '').toLowerCase().includes(q)).slice(0, n); };
  const ids = (list) => list.map((x) => ({ value: x.id, hint: x.name }));
  const inVideo = (ctx) => H.activeId === 'tool:ae' || H.agent(ctx?.agentId)?.dock === 'ae';
  const editing = (o) => CutCmds.editing(o);
  const cut = () => VideoCut;
  const fmt = (t) => VideoCut.fmt(t || 0);
  const summary = () => { const e = VideoCut.edit; const layers = (e.tracks || []).reduce((n, k) => n + k.items.length, 0); return `${e.clips.length} clip${e.clips.length === 1 ? '' : 's'}${layers ? ` + ${layers} layer${layers === 1 ? '' : 's'}` : ''} · ${fmt(C.total(e))}`; };
  const time = (s) => { if (s == null || s === '') return null; const F = VideoCut.fps; const t = VideoData.parseTime(s, F, VideoCut.time, C.total(VideoCut.edit)); if (t == null) throw new Error(`Can't read the time “${s}”: try 2.5, 0:03.2, 00:00:04:12, f90 or +10f.`); return t; };
  const isTime = (s) => /^([+-]?\d+(\.\d+)?(s|f)?|f\d+|\d+:\d+([:.]\d+)*|\d+%)$/i.test(String(s || ''));
  // "3" → main clip 3, "V2.1" → item 1 of V2; returns ids (or the selection / the clip under the playhead)
  function targets(list, { need = true } = {}) {
    const e = VideoCut.edit;
    const out = [];
    for (const w of list) {
      let m = /^(\d+)$/.exec(w);
      if (m) { const c = e.clips[Number(m[1]) - 1]; if (!c) throw new Error(`There's no clip ${m[1]} (the edit has ${e.clips.length}: /clips lists them).`); out.push(c.id); continue; }
      m = /^([VTA]\d+)\.(\d+)$/i.exec(w);
      if (m) { const k = (e.tracks || []).find((x) => x.name.toLowerCase() === m[1].toLowerCase()); const it = k?.items[Number(m[2]) - 1]; if (!it) throw new Error(`No ${w} (/edit-list shows the tracks).`); out.push(it.id); }
    }
    if (out.length) { VideoCut.selectIds(out); return out; }
    const sel = VideoCut.selection;
    if (sel.length) return sel;
    const x = C.at(e, Math.min(VideoCut.time, Math.max(0, C.mainTotal(e) - 1e-4)));
    if (x && VideoCut.time < C.mainTotal(e)) return [x.clip.id];
    if (need) throw new Error('Select a clip first (click it, or give its number: 3, V2.1).');
    return [];
  }
  const isTarget = (w) => /^\d+$/.test(w) || /^[VTA]\d+\.\d+$/i.test(w);
  const pickPreset = (list, q, what) => { const p = FX.find(list, q); if (!p) throw new Error(`No ${what} “${q}”. ${list.slice(0, 8).map((x) => x.id).join(', ')}… (/edit-presets ${what}s lists them all).`); return p; };
  const findVideo = (q) => (typeof VideoCmds !== 'undefined' ? VideoCmds.findVideo(q) : null);
  // a path or a library name
  async function pathOf(q) {
    const s = String(q || '').trim().replace(/^["']|["']$/g, '');
    if (/^([a-z]:)?[\\/]/i.test(s) && (await window.hub.fs.stat(s))) return s;
    const v = findVideo(s);
    if (v) return v.path;
    const rec = (Review.state.lib?.recordings || []).map((r) => r.path || r).find((p) => base(p).toLowerCase().includes(s.toLowerCase()));
    if (rec) return rec;
    throw new Error(`No file or library video matches “${s}” (/videos lists them).`);
  }

  const defs = [];
  const cmd = (d) => defs.push(d);
  const PRESET_KINDS = { transition: FX.TRANSITIONS, look: FX.LOOKS, title: FX.TITLE_STYLES, anim: FX.TITLE_ANIMS, lower: FX.LOWER_THIRDS, motion: FX.MOTIONS, ramp: FX.RAMPS, format: FX.FORMATS, template: FX.TEMPLATES, export: FX.EXPORTS, easing: FX.EASES, blend: FX.BLENDS };

  // ---------- opening, sequences, templates, format ----------
  cmd({ name: 'editor', aliases: ['video-editor'], desc: 'The video editor: open (on the open video), off, new <name> [format], open <sequence>, list, keys', args: '[on|off|new <name>|open <name>|list|keys]', keys: 'E',
    complete: (a) => opts(['on', 'off', 'new', 'open', 'list', 'keys', ...VideoCut.sequences().map((s) => `open ${s.name}`)], a), examples: ['/editor', '/editor new Intro 9:16'], keywords: 'nle edit timeline premiere final cut resolve davinci',
    run: async (args) => {
      const w = words(args); const v = w[0] || 'on';
      if (v === 'off') { VideoCut.leave(); return 'Editor closed.'; }
      if (v === 'keys') { await editing(); VideoCut.help(); return null; }
      if (v === 'list') { const s = VideoCut.sequences(); return s.length ? s.map((x) => `• ${x.name} (${fmt(x.seconds)})`).join('\n') : 'No sequences yet: /editor new <name> or /edit-template.'; }
      if (v === 'new') { await VideoCmds.ready({ needVideo: false }); const f = w.find((x) => FX.FORMATS.some((y) => y.id === x)) || '9:16'; const name = w.slice(1).filter((x) => x !== f).join(' ') || 'Sequence'; const key = await VideoCut.newSequence(name, { format: f }); return `New sequence **${key.slice(4)}** (${f}). ＋ adds videos, titles and music; /edit-template starts from a template.`; }
      if (v === 'open') { await VideoCmds.ready({ needVideo: false }); const name = w.slice(1).join(' '); const s = VideoCut.sequences().find((x) => x.name.toLowerCase() === name.toLowerCase()) || VideoCut.sequences().find((x) => x.name.toLowerCase().includes(name.toLowerCase())); if (!s) return `No sequence “${name}” (/editor list).`; await VideoCut.enter({ path: s.key }); return `Editing **${s.name}** · ${summary()}`; }
      await editing();
      return `✂ Editing ${VideoCut.path?.startsWith('seq:') ? VideoCut.path.slice(4) : `**${base(VideoCut.path)}**`} · ${summary()} · ＋ adds layers, right-click anything for its menu, /edit-list shows it all.`;
    } });
  cmd({ name: 'edit-template', aliases: ['sequence-template'], desc: 'Start the edit from a template (social intro 15 s, app teaser, reel 30 s…); keep = lay its titles and markers over your clips', args: '<template> [keep|new]',
    complete: (a) => opts([...ids(FX.TEMPLATES), { value: 'keep' }, { value: 'new' }], a, 30), examples: ['/edit-template social-intro-15', '/edit-template app-teaser-15 new'],
    run: async (args) => {
      const w = words(args); const keep = w.includes('keep'); const fresh = w.includes('new');
      const t = pickPreset(FX.TEMPLATES, w.filter((x) => x !== 'keep' && x !== 'new').join(' '), 'template');
      if (fresh || (!Review.current && !VideoCut.active)) { await VideoCmds.ready({ needVideo: false }); await VideoCut.newSequence(t.name, { template: t.id, format: t.fmt }); return `New sequence from **${t.name}** · ${summary()} · drop videos on the ＋ slots (or /fill-slot 1 <video>).`; }
      await editing();
      VideoCut.applyTemplate(t.id, { keep });
      return `Template **${t.name}** · ${summary()}${keep ? '' : ' · drop videos on the ＋ slots (/fill-slot 1 <video>); /cut undo brings your edit back'}.`;
    } });
  cmd({ name: 'edit-format', aliases: ['sequence-format'], desc: 'The program\'s shape: 9:16, 4:5, 1:1, 16:9, 1920x1080…, or source (the video\'s own); optional frame rate', args: '<format|WxH|source> [fps]',
    complete: (a) => opts([...ids(FX.FORMATS), { value: 'source', hint: 'the video\'s own size' }], a), examples: ['/edit-format 9:16', '/edit-format 16:9 60'],
    run: async (args) => { await editing(); const [f, fps] = words(args); const s = VideoCut.setFormat(f === 'source' ? null : f, fps); return `Format ${s.W}×${s.H} · ${Number(s.F.toFixed(3))} fps.`; } });
  cmd({ name: 'edit-fps', desc: 'The program\'s frame rate (timecode, stepping, render)', args: '<fps>', complete: (a) => opts(FX.FPS.map(String), a),
    run: async (args) => { await editing(); const f = Number(words(args)[0]); if (!(f > 0 && f <= 240)) return 'Give a frame rate, e.g. /edit-fps 30.'; const s = VideoCut.frameSize(); VideoCut.setFormat({ w: s.W, h: s.H }, f); return `Frame rate ${f} fps.`; } });
  cmd({ name: 'sequences', desc: 'Your sequences (edits of their own, not tied to one video)', run: async () => { await VideoCmds.ready({ needVideo: false, show: false }); const s = VideoCut.sequences(); return s.length ? s.map((x) => `• ${x.name} · ${fmt(x.seconds)}`).join('\n') : 'None yet: /editor new <name>.'; } });
  cmd({ name: 'edit-list', aliases: ['timeline'], desc: 'Everything in the edit: clips with timecodes, transitions, tracks, layers, titles, keyframes, markers', run: async () => {
    await editing({ show: false });
    const e = VideoCut.edit; const s = VideoCut.frameSize();
    const marks = e.markers.map((m) => `  ◆ ${fmt(m.t)} ${m.label || ''}${m.note ? ` — ${m.note}` : ''}`);
    return `**${VideoCut.path?.startsWith('seq:') ? VideoCut.path.slice(4) : base(VideoCut.path)}** · ${s.W}×${s.H} · ${Number(s.F.toFixed(3))} fps · ${summary()}${e.mark ? ` · in–out ${fmt(e.mark.a)} → ${fmt(e.mark.b)}` : ''}\n${VideoCut.describeAll().join('\n')}${marks.length ? `\nMarkers:\n${marks.join('\n')}` : ''}`;
  } });

  // ---------- tracks + layers ----------
  cmd({ name: 'track-add', aliases: ['add-track'], desc: 'Add a track: video (overlays), text (titles) or audio (music)', args: '<video|text|audio>', complete: (a) => opts(['video', 'text', 'audio'], a),
    run: async (args) => { await editing(); const t = words(args)[0] || 'video'; if (!C.TRACK_TYPES.includes(t)) return 'Pick video, text or audio.'; VideoCut.commit(C.addTrack(VideoCut.edit, t), `${t} track added`); return `Added ${VideoCut.edit.tracks.at(-1).name}.`; } });
  cmd({ name: 'track', desc: 'A track\'s switches: /track V2 hide|show|mute|unmute|lock|unlock|delete|rename <name>', args: '<V2|T1|A1> <hide|show|mute|unmute|lock|unlock|delete|rename …>',
    complete: (a) => { const w = words(a); if (w.length <= 1) return opts((VideoCut.edit?.tracks || []).map((k) => ({ value: k.name, hint: k.type })), a); return opts(['hide', 'show', 'mute', 'unmute', 'lock', 'unlock', 'delete', 'rename'], a); },
    run: async (args) => {
      await editing(); const [n, act, ...rest] = words(args);
      const k = (VideoCut.edit.tracks || []).find((x) => x.name.toLowerCase() === String(n || '').toLowerCase());
      if (!k) return `No track ${n || ''} (/edit-list shows them).`;
      const map = { hide: { hide: true }, show: { hide: false }, mute: { mute: true }, unmute: { mute: false }, lock: { lock: true }, unlock: { lock: false } };
      if (act === 'delete') { VideoCut.commit(C.removeTrack(VideoCut.edit, k.id), `${k.name} deleted`); return `${k.name} deleted.`; }
      if (act === 'rename') { const nm = rest.join(' ').slice(0, 24); if (!nm) return 'Give the new name.'; VideoCut.commit(C.patchTrack(VideoCut.edit, k.id, { name: nm }), 'Renamed'); return `Renamed to ${nm}.`; }
      if (!map[act]) return 'hide, show, mute, unmute, lock, unlock, delete or rename.';
      VideoCut.commit(C.patchTrack(VideoCut.edit, k.id, map[act]), `${k.name} ${act}`);
      return `${k.name}: ${act}.`;
    } });
  cmd({ name: 'overlay', aliases: ['add-overlay', 'pip'], desc: 'Put a video (library name, Lab recording or path) on a track above, at the playhead or a time; optional from–to seconds', args: '<video> [at] [from] [to]',
    complete: (a) => (typeof Review === 'undefined' ? [] : Review.videos.filter((v) => base(v.path).toLowerCase().includes(String(a || '').toLowerCase())).slice(0, 12).map((v) => ({ value: base(v.path) }))), examples: ['/overlay logo_loop 2.5'],
    run: async (args) => {
      await editing(); const w = words(args); const nums = []; while (w.length > 1 && isTime(w[w.length - 1])) nums.unshift(w.pop());
      const p = await pathOf(w.join(' '));
      const id = await VideoCut.addOverlay(p, { at: time(nums[0]) ?? VideoCut.time, a: nums[1] ? Number(nums[1]) : 0, b: nums[2] ? Number(nums[2]) : null });
      return id ? `Overlay **${base(p)}** at ${fmt(time(nums[0]) ?? VideoCut.time)} · /edit-motion, /opacity, /blend-mode shape it.` : `Couldn't add ${base(p)}.`;
    } });
  cmd({ name: 'add-image', aliases: ['add-still'], desc: 'A picture (path or file name) as a layer at the playhead (or on the main track with "main"), for N seconds', args: '<path> [seconds] [main]',
    run: async (args) => { await editing(); const w = words(args); const main = w.includes('main'); const rest = w.filter((x) => x !== 'main'); const dur = rest.length > 1 && /^\d+(\.\d+)?$/.test(rest.at(-1)) ? Number(rest.pop()) : 3; const p = await pathOf(rest.join(' ')); await VideoCut.addImage(p, { at: VideoCut.time, dur, main }); return `Still **${base(p)}** · ${dur} s${main ? ' on the main track' : ''}.`; } });
  cmd({ name: 'add-music', aliases: ['add-audio'], desc: 'A song or sound on an audio track (from the start, or at a time), optional volume %', args: '<path|video> [at] [volume%]',
    run: async (args) => { await editing(); const w = words(args); const vol = w.length > 1 && /^\d+%$/.test(w.at(-1)) ? Number(w.pop().slice(0, -1)) / 100 : 1; const at = w.length > 1 && isTime(w.at(-1)) ? time(w.pop()) : 0; const p = await pathOf(w.join(' ')); const id = await VideoCut.addAudio(p, { at, volume: vol }); return id ? `♪ **${base(p)}** from ${fmt(at)}${vol !== 1 ? ` at ${Math.round(vol * 100)}%` : ''}.` : null; } });
  cmd({ name: 'add-title', aliases: ['text-title', 'title-over'], desc: 'A title over the picture at the playhead: text, then optional style, animation and seconds (\\n = new line)', args: '<text> [style] [anim] [seconds]',
    complete: (a) => (words(a).length > 1 ? opts([...ids(FX.TITLE_STYLES), ...ids(FX.TITLE_ANIMS)], a) : []), examples: ['/add-title HEARTH display glitch 2', '/add-title One window\\nfor all your AI'], keys: 'Alt+T',
    run: async (args) => {
      await editing(); const w = words(args); let dur = 3; let style = 'bold'; let anim = 'fade-up';
      if (w.length > 1 && /^\d+(\.\d+)?$/.test(w.at(-1))) dur = Number(w.pop());
      if (w.length > 1 && FX.TANIM[w.at(-1)]) anim = w.pop();
      if (w.length > 1 && FX.TSTYLE[w.at(-1)]) style = w.pop();
      const text = w.join(' ').replace(/\\n/g, '\n') || 'Title';
      VideoCut.addTitleItem(text, { at: VideoCut.time, dur, style, anim });
      return `T “${text.replace(/\n/g, ' / ')}” · ${FX.TSTYLE[style].name} · ${FX.TANIM[anim].name} · ${dur} s (double-click it to change).`;
    } });
  cmd({ name: 'lower-third', desc: 'A lower third (name · role) at the playhead: "Name\\nRole" and an optional preset', args: '<name\\nrole> [preset] [seconds]', complete: (a) => (words(a).length > 1 ? opts(ids(FX.LOWER_THIRDS), a) : []), examples: ['/lower-third Quentin\\nMaker of Hearth bar-gold'],
    run: async (args) => {
      await editing(); const w = words(args); let dur = 4; let pre = 'bar-gold';
      if (w.length > 1 && /^\d+(\.\d+)?$/.test(w.at(-1))) dur = Number(w.pop());
      if (w.length > 1 && FX.LTHIRD[w.at(-1)]) pre = w.pop();
      const text = w.join(' ').replace(/\\n/g, '\n') || 'Name\nRole';
      VideoCut.addTitleItem(text, { at: VideoCut.time, dur, lower: pre });
      return `Lower third **${FX.LTHIRD[pre].name}** · ${dur} s.`;
    } });
  cmd({ name: 'add-color', aliases: ['color-matte'], desc: 'A color matte on the main track at the playhead (or a see-through color layer with "layer")', args: '<#hex|gold|black…> [seconds] [layer]',
    run: async (args) => { await editing(); const w = words(args); const names = { black: '#000000', white: '#ffffff', gold: '#ffc93b', ember: '#ff5a1f', violet: '#7a4bff', blue: '#2457ff', red: '#e0202a' }; const col = names[w[0]] || (/^#[0-9a-f]{6}$/i.test(w[0] || '') ? w[0] : '#000000'); const dur = Number(w.find((x) => /^\d+(\.\d+)?$/.test(x))) || 2; VideoCut.addColor(col, { at: VideoCut.time, dur, main: !w.includes('layer') }); return `Color ${col} · ${dur} s.`; } });
  cmd({ name: 'fill-slot', desc: 'Put a video in a template slot (its ＋ gap): it takes the slot\'s length', args: '<slot n> <video>',
    run: async (args) => { await editing(); const [n, ...rest] = words(args); const g = VideoCut.edit.clips.find((c) => c.kind === 'gap' && String(c.slot) === String(n)); if (!g) return `No empty slot ${n}.`; const p = await pathOf(rest.join(' ')); await VideoCut.fillSlot(g.id, p); return `Slot ${n}: **${base(p)}** · ${summary()}`; } });
  cmd({ name: 'insert-clip', desc: 'Insert a video at the playhead on the main track (everything after moves right)', args: '<video> [from] [to]',
    run: async (args) => { await editing(); const w = words(args); const nums = []; while (w.length > 1 && /^\d+(\.\d+)?$/.test(w.at(-1))) nums.unshift(Number(w.pop())); const p = await pathOf(w.join(' ')); await VideoCut.insertClip(p, { a: nums[0] ?? 0, b: nums[1] ?? null }); return `Inserted **${base(p)}** at ${fmt(VideoCut.time)} · ${summary()}`; } });
  cmd({ name: 'overwrite-clip', desc: 'Overwrite the main track from the playhead with a video (nothing moves)', args: '<video> [from] [to]',
    run: async (args) => { await editing(); const w = words(args); const nums = []; while (w.length > 1 && /^\d+(\.\d+)?$/.test(w.at(-1))) nums.unshift(Number(w.pop())); const p = await pathOf(w.join(' ')); await VideoCut.overwriteClip(p, { a: nums[0] ?? 0, b: nums[1] ?? null }); return `Overwrote with **${base(p)}** from ${fmt(VideoCut.time)} · ${summary()}`; } });
  cmd({ name: 'to-overlay', desc: 'Move a main-track clip up to an overlay track (same time, a gap stays)', args: '[n]', run: async (args) => { await editing(); const [id] = targets(words(args)); return VideoCut.toOverlay(id) ? 'Moved to an overlay track.' : 'Only main-track clips move up.'; } });
  cmd({ name: 'to-main', desc: 'Move an overlay video down to the main track at the playhead', args: '[V2.1]', run: async (args) => { await editing(); const [id] = targets(words(args)); return VideoCut.toMain(id) ? 'Moved to the main track.' : 'Select an overlay video.'; } });

  // ---------- transitions, looks, keyframes, motion, speed ----------
  cmd({ name: 'transition', aliases: ['add-transition'], desc: 'A transition into the selected clip (or clip n, or every cut with "all"): dissolve, dip-black, wipe-left, push-up, zoom-in, whip-left, glitch…; off removes it', args: '<type|off> [seconds] [n|all]',
    complete: (a) => opts([...ids(FX.TRANSITIONS), { value: 'off' }, { value: 'all' }], a, 24), examples: ['/transition dissolve 0.5', '/transition whip-left 0.3 all', '/transition off 3'], keys: 'Shift+D',
    run: async (args) => {
      await editing(); const w = words(args); const all = w.includes('all');
      const sec = w.find((x) => /^\d*\.?\d+s?$/.test(x) && !/^\d+$/.test(x)) || w.find((x, i) => i > 0 && /^\d+(\.\d+)?$/.test(x) && Number(x) <= 5 && !/^\d+$/.test(x));
      const dur = sec ? Number(sec.replace(/s$/, '')) : null;
      const type = w[0];
      if (type === 'off' || type === 'cut') { if (all) { VideoCut.commit(C.transAll(VideoCut.edit, null, 0), 'Straight cuts'); return 'Every transition removed.'; } VideoCut.setTransition(null, 0, targets(w.slice(1).filter(isTarget))); return 'Straight cut.'; }
      const t = pickPreset(FX.TRANSITIONS, type, 'transition');
      if (all) { VideoCut.commit(C.transAll(VideoCut.edit, t.id, dur ?? t.d), `${t.name} on every cut`); return `${t.name} on every cut (${dur ?? t.d} s) · ${summary()}`; }
      const r = VideoCut.setTransition(t.id, dur, targets(w.slice(1).filter(isTarget)));
      return r ? `${t.name} · ${r.dur} s into clip ${VideoCut.edit.clips.findIndex((c) => c.trans?.type === t.id) + 1}.` : 'Pick a clip after a cut (the first clip has nothing before it).';
    } });
  cmd({ name: 'grade', aliases: ['look-clip', 'clip-look'], desc: 'A look (color grade) on the selection: teal-orange, bleach, noir, cyberpunk, golden-hour, film…; off removes it; optional strength %', args: '<look|off> [strength%] [n…]',
    complete: (a) => opts([...ids(FX.LOOKS), { value: 'off' }], a, 30), examples: ['/grade teal-orange', '/grade cyberpunk 60%', '/grade off'],
    run: async (args) => {
      await editing(); const w = words(args); const amt = w.find((x) => /^\d+%$/.test(x)); const tg = targets(w.filter(isTarget));
      if (w[0] === 'off') { VideoCut.setLook(null, tg); return 'Look removed.'; }
      const l = pickPreset(FX.LOOKS, w.filter((x) => !isTarget(x) && x !== amt).join(' '), 'look');
      VideoCut.setLook(l.id, tg, amt ? Number(amt.slice(0, -1)) / 100 : null);
      return `◐ ${l.name}${amt ? ` at ${amt}` : ''} on ${tg.length} clip${tg.length === 1 ? '' : 's'}.`;
    } });
  cmd({ name: 'adjust', aliases: ['color-adjust'], desc: 'One color adjustment on the selection: exposure, contrast, saturation, temp, tint, hue, gamma, highlights, shadows, fade, mono, sepia, vignette, grain, blur, sharpen', args: '<adjustment> <value>',
    complete: (a) => opts(FX.ADJ.map((x) => ({ value: x.id, hint: `${x.name} ${x.min}…${x.max}` })), a, 20), examples: ['/adjust exposure 0.3', '/adjust temp -0.4', '/adjust vignette 0.5'],
    run: async (args) => { await editing(); const [k, v, ...rest] = words(args); const a = FX.ADJ.find((x) => x.id === k || x.name.toLowerCase().startsWith(String(k || '').toLowerCase())); if (!a || v == null) return `Usage: /adjust exposure 0.3 (${FX.ADJ.map((x) => x.id).join(', ')}).`; VideoCut.adjust(a.id, Number(v), targets(rest)); return `${a.name} ${v}.`; } });
  cmd({ name: 'keyframe', aliases: ['key'], desc: 'A keyframe at the playhead on the selection: opacity (0–1), scale, x, y (−1…1), rotate (°), volume; optional value and curve', args: '<prop> [value] [curve]',
    complete: (a) => (words(a).length > 2 ? opts(ids(FX.EASES), a, 20) : opts(C.KEY_PROPS, a)), examples: ['/keyframe scale 1.2 expoOut', '/keyframe opacity 0', '/keyframe x -0.3'], keys: 'Alt+K',
    run: async (args) => { await editing(); const [p, v, e0] = words(args); if (!C.KEY_PROPS.includes(p)) return `Pick one of ${C.KEY_PROPS.join(', ')}.`; const id = targets([])[0]; const ease = e0 ? pickPreset(FX.EASES, e0, 'easing').id : 'ease'; const r = VideoCut.keyHere(p, v != null ? Number(v) : null, id, ease); return r ? `◆ ${p} ${Number(r.v).toFixed(3)} at ${fmt(VideoCut.time)} (${FX.EASE[ease].name}).` : 'No clip here.'; } });
  cmd({ name: 'keyframes', desc: 'The keyframes of the selection (property, time in the clip, value, curve)', run: async () => {
    await editing({ show: false }); const id = targets([])[0]; const f = C.find(VideoCut.edit, id); const keys = f?.clip.keys;
    if (!keys) return 'No keyframes on this clip (/keyframe scale 1.2 adds one).';
    return Object.entries(keys).map(([p, list]) => `${p}: ${list.map((k) => `${k.t.toFixed(2)} s → ${Number(k.v).toFixed(3)} (${k.ease || 'ease'})`).join(' · ')}`).join('\n');
  } });
  cmd({ name: 'keyframes-clear', desc: 'Remove every keyframe of a property (or all) from the selection', args: '[prop]', complete: (a) => opts(C.KEY_PROPS, a),
    run: async (args) => { await editing(); const p = words(args)[0]; const tg = targets([]); if (p) for (const id of tg) VideoCut.commit(C.removeKey(VideoCut.edit, id, p, null), `${p} keys removed`); else VideoCut.commit(C.patchAny(VideoCut.edit, tg, (c) => { delete c.keys; }), 'Keyframes removed'); return 'Keyframes removed.'; } });
  cmd({ name: 'ease', aliases: ['curve'], desc: 'The curve from the keyframe at (or before) the playhead: linear, ease, easeInOut, expoOut, backOut, elasticOut, bounceOut, hold…', args: '<curve>', complete: (a) => opts(ids(FX.EASES), a, 30),
    run: async (args) => { await editing(); const e0 = pickPreset(FX.EASES, words(args)[0], 'easing'); const id = targets([])[0]; const f = C.find(VideoCut.edit, id); if (!f?.clip.keys) return 'No keyframes here yet (/keyframe).'; const start = f.where === 'clip' ? C.layout(VideoCut.edit)[f.i].start : f.clip.start; const t = VideoCut.time - start; VideoCut.commit(C.patchAny(VideoCut.edit, id, (c) => { for (const list of Object.values(c.keys)) { const k = [...list].reverse().find((y) => y.t <= t + 1e-3) || list[0]; k.ease = e0.id; } }), `Curve: ${e0.name}`); return `Curve: ${e0.name}.`; } });
  cmd({ name: 'edit-motion', aliases: ['motion-preset'], desc: 'A motion preset on the selection: ken-burns-in, punch-in, shake, slide-in-left, pop-in, pip-tr, split-left…', args: '<preset>', complete: (a) => opts(ids(FX.MOTIONS), a, 30), examples: ['/edit-motion ken-burns-in', '/edit-motion pip-tr'],
    run: async (args) => { await editing(); const w = words(args); const m = pickPreset(FX.MOTIONS, w.filter((x) => !isTarget(x)).join(' '), 'motion'); VideoCut.applyMotion(m.id, targets(w.filter(isTarget))); return `Motion: ${m.name}.`; } });
  for (const [name, prop, hint, conv] of [['opacity', 'opacity', '0–100%', (v) => Number(String(v).replace('%', '')) / (String(v).includes('%') || Number(v) > 1 ? 100 : 1)], ['scale', 'scale', '0.05–4 (1 = fit) or %', (v) => Number(String(v).replace('%', '')) / (String(v).includes('%') ? 100 : 1)], ['rotate', 'rotate', 'degrees', Number]]) {
    cmd({ name: name === 'opacity' ? 'clip-opacity' : name === 'scale' ? 'clip-scale' : 'clip-rotate', desc: `The selection's ${name} (${hint}); keys at the playhead when it has keyframes`, args: `<value> [n…]`,
      run: async (args) => { await editing(); const [v, ...rest] = words(args); const val = conv(v); if (!Number.isFinite(val)) return `Give a value (${hint}).`; const tg = targets(rest); VideoCut.commit(C.patchAny(VideoCut.edit, tg, (c) => { if (c.keys?.[prop]?.length) return; c[prop] = val; }), `${name} ${v}`); for (const id of tg) { const f = C.find(VideoCut.edit, id); if (f?.clip.keys?.[prop]?.length) VideoCut.keyHere(prop, val, id); } return `${name}: ${v}.`; } });
  }
  cmd({ name: 'clip-position', desc: 'Where the selection sits: x and y from −1 to 1 (0 0 = centered; 0.25 −0.25 = up right)', args: '<x> <y> [n…]',
    run: async (args) => { await editing(); const [x, y, ...rest] = words(args); if (!Number.isFinite(Number(x))) return 'Usage: /clip-position 0.25 -0.25'; const tg = targets(rest); VideoCut.commit(C.patchAny(VideoCut.edit, tg, (c) => { c.x = Number(x); c.y = Number(y) || 0; }), 'Position'); return `Position ${x}, ${y || 0}.`; } });
  cmd({ name: 'blend-mode', desc: 'How an overlay mixes with what is under it: normal, screen, add, multiply, overlay, soft-light, difference…', args: '<mode> [V2.1]', complete: (a) => opts(ids(FX.BLENDS), a, 16),
    run: async (args) => { await editing(); const w = words(args); const b = pickPreset(FX.BLENDS, w[0], 'blend'); VideoCut.commit(C.patchAny(VideoCut.edit, targets(w.slice(1)), (c) => { c.blend = b.id; }), `Blend ${b.name}`); return `Blend: ${b.name}.`; } });
  cmd({ name: 'clip-volume', desc: 'The selection\'s volume, 0–200 %', args: '<percent> [n…]', run: async (args) => { await editing(); const [v, ...rest] = words(args); const x = Number(String(v).replace('%', '')) / 100; if (!(x >= 0 && x <= 2)) return 'Give 0 to 200 (%).'; VideoCut.commit(C.patchAny(VideoCut.edit, targets(rest), (c) => { c.volume = x; }), `Volume ${Math.round(x * 100)}%`); return `Volume ${Math.round(x * 100)}%.`; } });
  cmd({ name: 'speed-ramp', aliases: ['ramp'], desc: 'A speed ramp on the clip: slow-mid (hero slow-mo), slow-in, burst, ramp-up, bullet, stutter, drop-hit…', args: '<ramp> [n]', complete: (a) => opts(ids(FX.RAMPS), a),
    run: async (args) => { await editing(); const w = words(args); const r = pickPreset(FX.RAMPS, w.filter((x) => !isTarget(x)).join(' '), 'ramp'); const [id] = targets(w.filter(isTarget)); return VideoCut.rampClip(r.id, id) ? `Speed ramp: ${r.name} · ${summary()}` : 'Pick a video clip on the main track.'; } });
  cmd({ name: 'reverse', aliases: ['reverse-clip'], desc: 'Play the selected clip backwards (again: forwards)', args: '[n…] [on|off]', keys: 'R',
    run: async (args) => { await editing(); const w = words(args); const on = w.includes('on') ? true : w.includes('off') ? false : undefined; VideoCut.commit(C.setReverse(VideoCut.edit, targets(w.filter(isTarget)), on), 'Reverse'); return 'Reversed (/reverse again goes forward).'; } });

  // ---------- trims and structure ----------
  const framesArg = (s) => { const n = Number(String(s || '').replace(/f$/, '')); if (!Number.isFinite(n) || !n) throw new Error('Give a number of frames, e.g. 5 or -12.'); return n; };
  cmd({ name: 'roll', desc: 'Roll the cut before the selected clip by N frames (one side longer, the other shorter, total unchanged)', args: '<frames> [n]',
    run: async (args) => { await editing(); const [fr, n] = words(args); const id = targets(n ? [n] : [])[0]; const i = VideoCut.edit.clips.findIndex((c) => c.id === id); if (i <= 0) return 'Pick a clip after a cut.'; VideoCut.commit(C.roll(VideoCut.edit, i, framesArg(fr) / VideoCut.fps), 'Rolled'); return `Rolled ${fr} frames.`; } });
  cmd({ name: 'slip', desc: 'Slip the clip: same place and length, N frames further in (or back) in its source', args: '<frames> [n]', keys: 'Alt+, / .', run: async (args) => { await editing(); const [fr, n] = words(args); VideoCut.commit(C.slip(VideoCut.edit, targets(n ? [n] : []), framesArg(fr) / VideoCut.fps), 'Slipped'); return `Slipped ${fr} frames.`; } });
  cmd({ name: 'slide', desc: 'Slide the clip N frames along the main track (its neighbours trim to make room)', args: '<frames> [n]', keys: 'Alt+← / →', run: async (args) => { await editing(); const [fr, n] = words(args); const [id] = targets(n ? [n] : []); VideoCut.commit(C.slide(VideoCut.edit, id, framesArg(fr) / VideoCut.fps), 'Slid'); return `Slid ${fr} frames.`; } });
  cmd({ name: 'lift', desc: 'Remove the in–out range and leave a gap', run: async () => { await editing(); return VideoCut.liftRange(false) ? `Lifted · ${summary()}` : 'Set in and out first (I / O, or /cut-range).'; } });
  cmd({ name: 'extract', desc: 'Remove the in–out range and close up', run: async () => { await editing(); return VideoCut.liftRange(true) ? `Extracted · ${summary()}` : 'Set in and out first (I / O, or /cut-range).'; } });
  cmd({ name: 'split-all', desc: 'Split every track at the playhead (or a time)', args: '[time]', keys: 'Shift+S', run: async (args) => { await editing(); const t = time(words(args)[0]); if (t != null) await VideoCut.goto(t); VideoCut.splitAll(); return `✂ Every track split at ${fmt(VideoCut.time)}.`; } });
  cmd({ name: 'razor', aliases: ['blade'], desc: 'Razor tool: click clips to cut them where you click (B)', args: '[on|off]', keys: 'B', run: async (args) => { await editing(); const w = words(args)[0]; return VideoCut.toggleRazor(w === 'on' ? true : w === 'off' ? false : undefined) ? '✂ Razor on: click a clip to cut it.' : 'Razor off.'; } });
  cmd({ name: 'snap', aliases: ['snapping'], desc: 'Snapping to cuts, markers, beats and the playhead (off: frames only)', args: '[on|off]', keys: 'N', run: async (args) => { await editing(); const w = words(args)[0]; return VideoCut.toggleSnap(w === 'on' ? true : w === 'off' ? false : undefined) ? 'Snapping on.' : 'Snapping off (moves land on frames).'; } });
  cmd({ name: 'nest', aliases: ['compound'], desc: 'Nest the selected clips into one compound clip (rendered; /unnest gets them back)', run: async () => { await editing(); return (await VideoCut.nestSelection()) ? `Nested · ${summary()}` : null; } });
  cmd({ name: 'unnest', desc: 'Back to the clips inside a compound clip', args: '[n]', run: async (args) => { await editing(); const [id] = targets(words(args)); return VideoCut.unnest(id) ? `Un-nested · ${summary()}` : 'That clip isn\'t a compound clip.'; } });
  cmd({ name: 'select', aliases: ['select-clip'], desc: 'Select clips or layers: 3, V2.1, T1.1, all, none', args: '<n|V2.1|all|none…>',
    run: async (args) => { await editing(); const w = words(args); if (w[0] === 'all') { VideoCut.selectAll(); return `${VideoCut.selection.length} selected.`; } if (w[0] === 'none') { VideoCut.selectIds([]); return 'Nothing selected.'; } const tg = targets(w); return `${tg.length} selected.`; } });
  cmd({ name: 'copy-clips', desc: 'Copy the selected clips and layers (paste with /paste-clips or Ctrl+V)', run: async () => { await editing(); return VideoCut.copySel() ? 'Copied.' : 'Select something first.'; } });
  cmd({ name: 'paste-clips', desc: 'Paste copied clips and layers at the playhead', run: async () => { await editing(); return VideoCut.paste() ? `Pasted · ${summary()}` : 'Nothing copied yet.'; } });
  cmd({ name: 'inspector', desc: 'Open the inspector for the selection (everything a clip can do)', args: '[n|V2.1]', run: async (args) => { await editing(); const [id] = targets(words(args)); VideoCut.inspect(id); return null; } });

  // ---------- markers, frames, view ----------
  cmd({ name: 'marker-note', desc: 'A marker at the playhead with a note (the chats read it in the edit)', args: '<note>', keys: 'Shift+M',
    run: async (args) => { await editing(); const note = String(args || '').trim(); VideoCut.marker(note.split(/[.!?]/)[0].slice(0, 24)); const m = VideoCut.edit.markers.reduce((a, b) => (Math.abs(b.t - VideoCut.time) < Math.abs(a.t - VideoCut.time) ? b : a)); VideoCut.commit(C.patchMarker(VideoCut.edit, m.id, { note }), 'Marker note'); return `◆ ${fmt(m.t)}: ${note}`; } });
  cmd({ name: 'marker-color', desc: 'Color of the marker nearest the playhead', args: '<gold|red|orange|green|blue|violet|pink|white>', complete: (a) => opts(FX.MARKER_COLORS.map(([n]) => n), a),
    run: async (args) => { await editing(); const c = FX.MARKER_COLORS.find(([n]) => n === words(args)[0]); if (!c) return 'Pick gold, red, orange, green, blue, violet, pink or white.'; const ms = VideoCut.edit.markers; if (!ms.length) return 'No markers (M adds one).'; const m = ms.reduce((a, b) => (Math.abs(b.t - VideoCut.time) < Math.abs(a.t - VideoCut.time) ? b : a)); VideoCut.commit(C.patchMarker(VideoCut.edit, m.id, { color: c[1] }), `Marker ${c[0]}`); return `Marker ${c[0]}.`; } });
  cmd({ name: 'marker-go', desc: 'Go to a marker by number or name (next / prev too)', args: '<n|name|next|prev>', keys: 'PgUp / PgDn',
    run: async (args) => { await editing(); const q = words(args).join(' '); if (q === 'next' || q === 'prev') { const t = VideoCut.jumpMarker(q === 'next' ? 1 : -1); return t == null ? 'No marker there.' : `◆ ${fmt(t)}`; } const ms = VideoCut.edit.markers; const m = /^\d+$/.test(q) ? ms[Number(q) - 1] : ms.find((x) => (x.label || '').toLowerCase().includes(q.toLowerCase())); if (!m) return 'No such marker (/markers).'; await VideoCut.goto(m.t); return `◆ ${fmt(m.t)} ${m.label || ''}`; } });
  cmd({ name: 'goto-frame', aliases: ['frame-go'], desc: 'Go to an exact frame of the edit (frame number, timecode HH:MM:SS:FF or seconds)', args: '<frame|timecode|time>', examples: ['/goto-frame 120', '/goto-frame 00:00:04:12'],
    run: async (args) => { await editing(); const s = words(args)[0] || '0'; if (/^\d+$/.test(s)) await VideoCut.goFrame(Number(s)); else await VideoCut.goto(time(s)); const r = await VideoCut.frameInfo(); return `f${r.frame} · ${r.timecode}${r.layers.map((x) => ` · ${base(x.src)} f${x.got}${x.got === x.want ? ' ✓' : ` (want ${x.want})`}`).join('')}`; } });
  cmd({ name: 'frame-step', aliases: ['step-frames'], desc: 'Step N frames (negative: back), exactly', args: '<frames>', keys: '← / → (Shift: 10)',
    run: async (args) => { await editing(); const n = Number(words(args)[0]) || 1; VideoCut.step(n); await new Promise((r) => setTimeout(r, 120)); const r = await VideoCut.frameInfo(); return `f${r.frame} · ${r.timecode}`; } });
  cmd({ name: 'frame-check', desc: 'Which frame is on screen: the program frame and timecode, and the exact source frame each layer shows (checked with requestVideoFrameCallback)',
    run: async () => { await editing({ show: false }); const r = await VideoCut.frameInfo(); return `f${r.frame} · ${r.timecode} · ${r.fps} fps${r.layers.length ? `\n${r.layers.map((x) => `• ${base(x.src)}: source frame ${x.got}${x.got === x.want ? ' ✓' : ` (expected ${x.want})`}`).join('\n')}` : ''}`; } });
  cmd({ name: 'edit-zoom', aliases: ['timeline-zoom'], desc: 'Zoom the edit\'s timeline: in, out, fit, or a factor (4 = 4×)', args: '<in|out|fit|n>', keys: '+ / − / \\', complete: (a) => opts(['in', 'out', 'fit', '2', '4', '10'], a),
    run: async (args) => { await editing(); const w = words(args)[0] || 'in'; if (w === 'fit') VideoCut.zoomFit(); else if (w === 'out') VideoCut.zoomBy(0.5); else if (w === 'in') VideoCut.zoomBy(2); else { const k = Number(w); if (!(k >= 1)) return 'in, out, fit or a factor ≥ 1.'; VideoCut.zoomFit(); VideoCut.zoomBy(k); } const v = VideoCut.view; return v ? `Showing ${fmt(v.t0)} → ${fmt(v.t1)}.` : 'The whole edit.'; } });
  cmd({ name: 'edit-frame', aliases: ['grab-edit-frame'], desc: 'Attach the composited frame at the playhead (or a frame / time) to this chat', args: '[frame|time]',
    run: async (args, ctx) => {
      await editing(); const s = words(args)[0]; if (s) { if (/^\d+$/.test(s)) await VideoCut.goFrame(Number(s)); else await VideoCut.goto(time(s)); }
      const im = await VideoComp.frameImage(VideoCut.time, { maxW: 1280, edit: VideoCut.edit });
      const p = await window.hub.saveAttachment(`edit-frame-${Date.now().toString(36)}.jpg`, im.url.split(',')[1]);
      if (ctx?.agentId && typeof Native !== 'undefined' && Native.attachPaths) { Native.attachPaths(ctx.agentId, [p]); return `Frame ${VideoCut.fmt(VideoCut.time)} attached.`; }
      return `Saved ${p}`;
    } });

  // ---------- renders ----------
  const RENDER_OPTS = [{ value: 'new', hint: 'a new version next to the video' }, ...VideoData.EXPORT_PRESETS.map((p) => ({ value: p.id, hint: p.name })), ...FX.EXPORTS.map((p) => ({ value: p.id, hint: p.name })), { value: 'stills', hint: 'a PNG for every frame' }, { value: 'jpg-stills', hint: 'a JPEG for every frame' }, { value: 'record', hint: 'real time WebM (no ffmpeg needed)' }];
  cmd({ name: 'edit-render', aliases: ['render-edit'], desc: 'Render the edit (ffmpeg): new version, any social / small-file / GIF / audio preset, stills, or record (real time, no ffmpeg)', args: '[preset] [crop|fit|blur]',
    complete: (a) => opts(RENDER_OPTS, a, 40), examples: ['/edit-render', '/edit-render reels', '/edit-render discord', '/edit-render audio-wav'],
    run: async (args) => {
      await editing(); const w = words(args); const fit = w.find((x) => VideoData.FIT_MODES.includes(x)) || 'crop'; const what = w.find((x) => !VideoData.FIT_MODES.includes(x)) || 'new';
      const job = await VideoCut.exportCut(what === 'record' ? { record: true } : what === 'stills' ? { stills: true } : what === 'jpg-stills' ? { stills: true, stillsExt: 'jpg' } : what === 'poster' ? null : what === 'new' ? {} : { preset: what, fit });
      if (what === 'poster') { const p = await VideoCut.posterFrame(); return `Saved ${base(p)}.`; }
      if (!job) return null;
      const ev = await job.done;
      return ev.code === 0 ? `⇪ ${base(ev.output)}${ev.seconds ? ` (${ev.seconds}s)` : ''}` : `Render failed: ${ev.error || ev.code}`;
    } });
  cmd({ name: 'poster-frame', desc: 'Save the frame at the playhead as a full-size PNG (exports/)', run: async () => { await editing(); const p = await VideoCut.posterFrame(); return `Saved ${base(p)}.`; } });
  cmd({ name: 'edit-presets', desc: 'The editor\'s presets: transitions, looks, titles, anims, lowers, motions, ramps, formats, templates, exports, easings, blends', args: '<kind> [search]',
    complete: (a) => opts(Object.keys(PRESET_KINDS).map((k) => `${k}s`), a),
    run: async (args) => { const [k0, ...q] = words(args); const k = String(k0 || '').replace(/s$/, ''); const list = PRESET_KINDS[k]; if (!list) return `Kinds: ${Object.keys(PRESET_KINDS).map((x) => `${x}s`).join(', ')}.`; const s = q.join(' ').toLowerCase(); const hits = list.filter((x) => !s || x.id.includes(s) || x.name.toLowerCase().includes(s)); return `${hits.length} ${k}${hits.length === 1 ? '' : 's'}:\n${hits.map((x) => `\`${x.id}\` ${x.name}${x.group ? ` · ${x.group}` : ''}`).join('\n')}`; } });

  function registerAll() {
    for (const d of defs) {
      Commands.register({ area: AREA, ...d, when: inVideo, whenLabel: 'in Video Review', aliases: (d.aliases || []).filter((a) => !Commands.get(a)) });
    }
  }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();
  return { defs, targets };
})();
