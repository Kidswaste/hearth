// Chat commands for Video Review and the After Effects kit (area "Video"). Everything the review screen does
// can be typed in any native chat: /review neon, /step -5, /note title lands late #timing, /safe tiktok…
// Commands open Video Review in the background when needed and answer with a short note in the chat.
const VideoCmds = (() => {
  const V = VideoData;
  const R = () => Review;
  const base = (p) => String(p).split(/[\\/]/).pop();
  const tcOf = (t) => V.tc(t, R().state.fps);
  const AREA = 'Video';
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const clean = (msg) => String(msg).replace(/^Error invoking remote method[^:]*: (Error: )?/, '');

  // Mounts Video Review if needed (without switching to it unless `show`), and checks a video is open.
  async function ready({ show = false, needVideo = true } = {}) {
    if (show) activate('tool:ae');
    await R().ensureMounted();
    if (needVideo && !R().current) throw new Error('No video is open. Try /videos, then /review <name>.');
    if (needVideo) await R().waitReady();
    return R();
  }
  // Best match for a name / path fragment among the library (newest first), with "latest" / "b" shortcuts.
  function findVideo(q, { not } = {}) {
    const list = R().videos.filter((v) => v.path !== not);
    const s = String(q || '').trim().toLowerCase().replace(/^"|"$/g, '');
    if (!s || s === 'latest' || s === 'newest') return list[0] || null;
    if (/^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 50 && !list.some((v) => base(v.path).toLowerCase().includes(s))) return list[Number(s) - 1] || null;
    return list.find((v) => v.path.toLowerCase() === s) || list.find((v) => base(v.path).toLowerCase() === s) || list.find((v) => base(v.path).toLowerCase().replace(/\.[^.]+$/, '') === s)
      || list.find((v) => base(v.path).toLowerCase().startsWith(s)) || list.find((v) => v.path.toLowerCase().includes(s))
      || list.find((v) => s.split(/\s+/).every((w) => v.path.toLowerCase().includes(w))) || null;
  }
  const videoSuggestions = (args, n = 10) => {
    if (typeof Review === 'undefined') return [];
    const q = String(args || '').toLowerCase();
    return R().videos.filter((v) => !q || v.path.toLowerCase().includes(q)).slice(0, n).map((v) => { const m = R().metaOf(v); return { value: base(v.path), hint: [m ? V.aspectOf(m.w, m.h) : null, timeAgo(v.mtime)].filter(Boolean).join(' · ') }; });
  };
  const opts = (list, args) => { const q = String(args || '').toLowerCase(); return list.filter((x) => String(x.value).toLowerCase().startsWith(q) || !q).slice(0, 14); };
  const AGENTS = [{ value: 'director', hint: 'the Video Director docked in Video Review' }, { value: 'claude', hint: 'your main Claude' }, { value: 'astra', hint: 'Astra (Codex), a second opinion' }];
  const SAFE = [...Object.entries(V.SAFE_ZONES).map(([k, z]) => ({ value: k, hint: z.name })), { value: 'off', hint: 'hide' }];
  const GUIDES = [...V.GUIDES.map((g) => ({ value: g.id, hint: g.name })), { value: 'off', hint: 'hide' }];
  const PRESETS = V.EXPORT_PRESETS.map((p) => ({ value: p.id, hint: `${p.name}${p.w && p.h ? ` ${p.w}×${p.h}` : ''}` }));
  const MODES = Review.CMP_MODES.map(([k, l]) => ({ value: k, hint: l }));
  const CATS = V.CATEGORIES.map((c) => ({ value: `#${c.id}`, hint: c.name }));
  const fmtNote = (n, i) => `${i + 1}. \`${tcOf(n.t)}\` ${n.done ? '~~' : ''}**${V.category(n.cat).name}**: ${n.text}${n.done ? '~~' : ''}`;

  // Registered once every script has loaded, so generic names (/play, /note, /export…) that another tool also
  // registers are shared instead of overwritten: in Video Review (or its docked director chat) they drive the
  // video, anywhere else they run the other tool's command.
  const defs = [];
  const cmd = (def) => defs.push(def);
  const inVideo = (ctx) => H.activeId === 'tool:ae' || H.agent(ctx?.agentId)?.dock === 'ae';
  function registerAll() {
    for (const def of defs) {
      const prev = Commands.get(def.name);
      if (prev && prev.name === def.name && prev.area !== AREA) {
        Commands.register({ ...prev, aliases: prev.aliases, desc: `${prev.desc} · in Video Review: ${def.desc}`,
          run: (args, ctx) => (inVideo(ctx) ? def.run(args, ctx) : prev.run(args, ctx)),
          complete: (args, ctx) => (inVideo(ctx) ? def.complete?.(args, ctx) : prev.complete?.(args, ctx)) || [] });
        continue;
      }
      Commands.register({ area: AREA, ...def, aliases: (def.aliases || []).filter((a) => !Commands.get(a)) });
    }
  }
  async function projectDirs() {
    if (H.settings().aeProjectDirs?.length) return H.settings().aeProjectDirs;
    const home = await window.hub.fs.home();
    const sep = home.includes('\\') ? '\\' : '/';
    return ['Documents', 'Desktop', /Mac/.test(navigator.platform) ? 'Movies' : 'Videos'].map((d) => `${home}${sep}${d}`);
  }

  // ---------- library ----------
  cmd({
    name: 'video', aliases: ['vr'], desc: 'Open Video Review (renders, player, notes)', args: '[name]', complete: (a) => videoSuggestions(a),
    run: async (args) => {
      await ready({ show: true, needVideo: false });
      if (args) { const v = findVideo(args); if (!v) return `No render matches “${args}”.`; await R().open(v); return `Opened **${base(v.path)}**.`; }
    },
  });
  cmd({
    name: 'videos', aliases: ['renders'], desc: 'List renders: filter by text, #tag, 9:16 / 16:9 / 4:5 / 1:1, fav, lab, notes', args: '[filter]',
    complete: (a) => opts([...V.MAIN_FORMATS.map((f) => ({ value: f, hint: V.formatInfo(f).hint })), { value: 'fav', hint: 'favorites' }, { value: 'lab', hint: 'Lab recordings' }, { value: 'notes', hint: 'with open notes' }], a),
    run: async (args) => {
      const r = await ready({ needVideo: false });
      const w = words(args);
      const fmt = w.find((x) => V.MAIN_FORMATS.includes(x) || V.FORMATS.some((f) => f.id === x));
      const rest = w.filter((x) => x !== fmt && !['fav', 'lab', 'notes'].includes(x)).join(' ');
      r.setFilter({ fmt: fmt || 'all', fav: w.includes('fav'), lab: w.includes('lab'), notes: w.includes('notes'), q: rest });
      // format filters need each file's size, read in the background: wait for it (up to 4 s)
      for (let i = 0; fmt && i < 40 && r.videos.some((v) => !r.metaOf(v)); i += 1) await new Promise((res) => setTimeout(res, 100));
      const list = r.filtered();
      if (!list.length) return `No renders match${args ? ` “${args}”` : ''}. Watched folders: ${(await r.videoDirs()).join(', ')}`;
      return `**${list.length} render${list.length > 1 ? 's' : ''}**${args ? ` matching “${args}”` : ''} (newest first):\n${list.slice(0, 15).map((v, i) => { const m = r.metaOf(v); return `${i + 1}. ${base(v.path)}${m ? ` · ${m.w}×${m.h} ${V.aspectOf(m.w, m.h)} · ${m.d?.toFixed(1)} s` : ''} · ${timeAgo(v.mtime)}${r.isFav(v.path) ? ' ★' : ''}${v.lab ? ' · Lab' : ''}`; }).join('\n')}${list.length > 15 ? `\n… and ${list.length - 15} more` : ''}\nOpen one with \`/review <name or number>\`.`;
    },
  });
  cmd({
    name: 'review', desc: 'Open a render in Video Review by name, number from /videos, or "latest"', args: '<name>', complete: (a) => videoSuggestions(a),
    run: async (args) => {
      await ready({ show: true, needVideo: false });
      const v = findVideo(args);
      if (!v) return `No render matches “${args}”. Try /videos.`;
      await R().open(v);
      await R().waitReady();
      const s = R().status();
      return `▶ **${base(v.path)}** · ${s.resolution} (${s.format}) · ${s.duration} s · ${s.fps} fps${s.notes.length ? ` · ${s.notes.filter((n) => !n.resolved).length} open notes` : ''}`;
    },
  });
  cmd({ name: 'fav', desc: 'Favorite / unfavorite the open video', run: async () => { const r = await ready(); return r.toggleFav() ? '★ Favorited.' : 'Removed from favorites.'; } });
  cmd({
    name: 'tag', desc: 'Tag the open video (space-separated; "-" clears); search them with #tag', args: '<tags>',
    run: async (args) => { const r = await ready(); const p = r.current.path; const t = args.trim() === '-' ? r.setTags(p, []) : r.setTags(p, [...r.tagsOf(p), ...words(args)]); return t.length ? `Tags: ${t.map((x) => `#${x}`).join(' ')}` : 'Tags cleared.'; },
  });
  cmd({
    name: 'video-folders', aliases: ['watch-folder'], desc: 'List, add or remove watched render folders', args: '[add|remove <folder>]',
    complete: (a) => opts([{ value: 'add ', hint: 'add a folder' }, { value: 'remove ', hint: 'stop watching a folder' }], a),
    run: async (args) => {
      const r = await ready({ needVideo: false });
      const [verb, ...rest] = words(args);
      let dirs = await r.videoDirs();
      const p = rest.join(' ');
      if (verb === 'add' && p) dirs = await r.setFolders([...dirs, p]);
      else if (verb === 'add') { const picked = await window.hub.pickFolder?.(); if (picked) dirs = await r.setFolders([...dirs, picked]); }
      else if (verb === 'remove' && p) dirs = await r.setFolders(dirs.filter((d) => !d.toLowerCase().includes(p.toLowerCase())));
      return `Watched folders (new renders show up by themselves):\n${dirs.map((d) => `- ${d}`).join('\n')}`;
    },
  });

  // ---------- player ----------
  cmd({ name: 'play', desc: 'Play the open video', run: async () => { (await ready({ show: true })).play(); } });
  cmd({ name: 'pause', aliases: ['stop-video'], desc: 'Pause the open video', run: async () => { const r = await ready(); r.pause(); return `⏸ \`${r.status().timecode}\``; } });
  cmd({
    name: 'step', desc: 'Step frames (default 1; negative goes back)', args: '±n', complete: (a) => opts([{ value: '1' }, { value: '-1' }, { value: '10' }, { value: '-10' }], a),
    run: async (args) => { const r = await ready(); r.step(Number(args) || 1); await r.waitSeek(); const s = r.status(); return `Frame ${s.frame} · \`${s.timecode}\``; },
  });
  cmd({
    name: 'goto', aliases: ['seek'], desc: 'Jump to a time: 1:23, 12.5, 00:00:04:12, f240, +10f, 50%, or a note number #3', args: '<time>',
    complete: (a) => opts([{ value: '0', hint: 'start' }, { value: '50%', hint: 'middle' }, { value: '+1s' }, { value: '-10f' }, { value: '#1', hint: 'note 1' }], a),
    run: async (args) => {
      const r = await ready();
      const m = args.match(/^#(\d+)$/);
      if (m) { const n = r.notes()[Number(m[1]) - 1]; if (!n) return `No note #${m[1]}.`; r.selectNote(n.id); return `Note #${m[1]} · \`${tcOf(n.t)}\`: ${n.text}`; }
      const t = r.goto(args);
      if (t == null) return null;
      await r.waitSeek();
      return `\`${tcOf(t)}\` (${t.toFixed(3)} s)`;
    },
  });
  cmd({
    name: 'speed', desc: 'Playback speed (0.1–4)', args: '<x>', complete: (a) => opts(['0.25', '0.5', '1', '1.5', '2'].map((value) => ({ value })), a),
    run: async (args) => `Speed ${(await ready()).setSpeed(args || 1)}×`,
  });
  cmd({
    name: 'loop', desc: 'Loop between two times (in out), "beats N" from the playhead, or off', args: '<in> <out> | off | beats <n>',
    complete: (a) => opts([{ value: 'off' }, { value: 'beats 4', hint: 'four beats from here' }, { value: 'beats 8' }, { value: '0 2', hint: 'first 2 seconds' }], a),
    run: async (args) => {
      const r = await ready();
      const w = words(args);
      if (!w.length || w[0] === 'off') { r.setLoop(null); return 'Loop cleared.'; }
      const now = r.status().time;
      if (w[0] === 'beats') {
        const beats = r.state.audio?.beats || [];
        const i = beats.findIndex((b) => b >= now - 0.02);
        const n = Number(w[1]) || 4;
        if (i < 0 || !beats[i + n]) return 'No beats found in this video\'s audio (or not enough left).';
        r.setLoop(beats[i], beats[i + n]);
        return `Looping ${n} beats: \`${tcOf(beats[i])}\` → \`${tcOf(beats[i + n])}\``;
      }
      const fps = r.state.fps;
      const a = V.parseTime(w[0], fps, now); const b = w[1] ? V.parseTime(w[1], fps, now) : null;
      if (a == null) return `Can't read “${w[0]}”.`;
      r.setLoop(a, b ?? undefined);
      return `Looping \`${tcOf(r.state.loop.a)}\` → \`${tcOf(r.state.loop.b)}\``;
    },
  });
  cmd({ name: 'fps', desc: 'Set the frame rate used for timecodes and stepping', args: '<fps>', complete: (a) => opts(['23.976', '24', '25', '29.97', '30', '50', '59.94', '60'].map((value) => ({ value })), a), run: async (args) => `${(await ready()).setFpsUser(Number(args) || 30)} fps` });
  cmd({
    name: 'zoom', desc: 'Zoom the frame: fit, 100 (real pixels), 200…', args: 'fit|100|<percent>', complete: (a) => opts([{ value: 'fit' }, { value: '100' }, { value: '200' }, { value: '400' }], a),
    run: async (args) => `Zoom ${(await ready()).zoomTo(args || 'fit')}%`,
  });
  cmd({ name: 'fullscreen', aliases: ['fs'], desc: 'Fullscreen review (Esc leaves)', run: async () => { (await ready({ show: true })).fullscreen(); } });
  cmd({ name: 'scopes', desc: 'Show / hide the histogram and luma waveform', run: async () => ((await ready({ show: true })).setScopes() ? 'Scopes on.' : 'Scopes off.') });

  // ---------- overlays ----------
  cmd({
    name: 'safe', aliases: ['safe-zone'], desc: 'Safe-zone overlay: tiktok, reels, shorts, facebook, snapchat, all, feed45, youtube, off', args: '<platform>', complete: (a) => opts(SAFE, a),
    run: async (args) => {
      const r = await ready({ show: true });
      const id = r.setSafe(args === 'off' ? '' : args.toLowerCase());
      if (!id) return args && args !== 'off' ? `Unknown safe zone “${args}”. Try: ${Object.keys(V.SAFE_ZONES).join(', ')}.` : 'Safe zones off.';
      const z = V.SAFE_ZONES[id];
      return `${z.name} overlay on (approximate UI areas in red, clear area dashed green).`;
    },
  });
  cmd({ name: 'guide', aliases: ['guides'], desc: 'Composition guide: safe, thirds, center, grid, golden, diag, off', args: '<type>', complete: (a) => opts(GUIDES, a), run: async (args) => { const id = (await ready({ show: true })).setGuide(args === 'off' ? '' : args); return id ? `Guide: ${V.GUIDES.find((g) => g.id === id).name}.` : 'Guides off.'; } });
  cmd({
    name: 'crop', desc: 'Preview a crop to another social format (drag it to choose what stays): 4:5, 1:1, 9:16, 16:9, off', args: '<format>',
    complete: (a) => opts([...V.MAIN_FORMATS.map((f) => ({ value: f, hint: `${V.formatInfo(f).w}×${V.formatInfo(f).h}` })), { value: 'off' }], a),
    run: async (args) => {
      const r = await ready({ show: true });
      const f = r.setCrop(args === 'off' ? null : args);
      if (!f) return 'Crop preview off.';
      const s = r.status();
      const rec = V.CROP_RECIPES.find((x) => x.from === s.format && x.to === f);
      return `Crop preview ${s.format} → ${f}. ${rec ? rec.note : ''} Export it with \`/export ${f === '4:5' ? 'feed45' : f === '1:1' ? 'square' : f === '9:16' ? 'reels' : 'yt1080'}\`.`;
    },
  });
  cmd({ name: 'formats', desc: 'Social formats, their sizes, and which one the open video is', run: async () => {
    const s = typeof Review !== 'undefined' && Review.current ? Review.status() : null;
    return `${V.FORMATS.slice(0, 4).map((f) => `- **${f.id}** ${f.w}×${f.h} · ${f.name} · ${f.hint}${s?.format === f.id ? ' ← open video' : ''}`).join('\n')}\nCrop between them: ${V.CROP_RECIPES.slice(0, 4).map((c) => `${c.from}→${c.to}`).join(', ')}… (\`/crop 4:5\`). Safe zones: \`/safe tiktok|reels|shorts\`.`;
  } });

  // ---------- compare ----------
  cmd({
    name: 'compare', aliases: ['ab'], desc: 'A/B compare: /compare <b> [mode], /compare <a> <b>, or /compare off', args: '<a> [b] [wipe|side|onion|diff|flip]',
    complete: (a) => [...opts(MODES, words(a).pop() || ''), ...videoSuggestions(a, 6)],
    run: async (args) => {
      const r = await ready({ show: true, needVideo: false });
      const w = words(args);
      if (w[0] === 'off') { r.stopCompare(); return 'Compare off.'; }
      const mode = MODES.find((m) => m.value === w[w.length - 1])?.value;
      if (mode) w.pop();
      if (!w.length && mode) { if (!r.state.cmp.path) return 'Open a B first: /compare <name>.'; r.setCompareMode(mode); return `Compare mode: ${mode}.`; }
      // "v1 v2" style: two names; otherwise the arg is B, or the previous version when empty.
      let a = null; let b = null;
      const two = w.length >= 2 ? [findVideo(w[0]), findVideo(w.slice(1).join(' '))] : null;
      if (two?.[0] && two?.[1] && two[0] !== two[1]) [a, b] = two;
      else b = w.length ? findVideo(w.join(' '), { not: r.current?.path }) : null;
      if (a) await r.open(a);
      if (!r.current) return 'Open a video first.';
      if (!b) { const vers = r.versionsOf(r.current).filter((v) => v.path !== r.current.path); b = vers[0]; if (!b) return `Name a B: /compare <name>.${w.length ? ` Nothing matches “${w.join(' ')}”.` : ''}`; }
      await r.compare(b.path, mode);
      return `A **${base(r.current.path)}** ⇄ B **${base(b.path)}** · ${r.state.cmp.mode} (C cycles modes, \\ swaps)`;
    },
  });
  cmd({ name: 'swap', desc: 'Swap A and B while comparing', run: async () => { const r = await ready(); if (!r.state.cmp.path) return 'Not comparing.'; await r.swapAB(); return `A is now ${base(r.current.path)}.`; } });

  // ---------- notes ----------
  cmd({
    name: 'note', desc: 'Add a timecoded note (with a frame grab) at the playhead; #timing #color #text #motion… sets the category, @1:23 the time', args: '<text> [#category] [@time]',
    complete: (a) => (/#\w*$/.test(a) ? CATS.filter((c) => c.value.startsWith(a.match(/#\w*$/)[0])).map((c) => ({ ...c, value: a.replace(/#\w*$/, c.value) })) : []),
    run: async (args) => {
      const r = await ready();
      if (!args) { activate('tool:ae'); r.openComposer(); return null; }
      let text = args;
      let cat;
      const c = text.match(/(?:^|\s)#(\w+)/);
      if (c && V.CATEGORIES.some((k) => k.id === c[1].toLowerCase())) { cat = c[1].toLowerCase(); text = text.replace(c[0], ' ').trim(); }
      let t;
      const at = text.match(/(?:^|\s)@(\S+)/);
      if (at) { t = V.parseTime(at[1], r.state.fps, 0, r.status().duration); text = text.replace(at[0], ' ').trim(); }
      const n = await r.addNote(text, { t: t ?? undefined, cat });
      return `✎ Note #${r.notes().indexOf(n) + 1} at \`${tcOf(n.t)}\` · ${V.category(n.cat).name}${n.frame ? ' · frame saved' : ''}`;
    },
  });
  cmd({
    name: 'notes', desc: 'List the open video\'s notes, or export them: md, csv, json, copy', args: '[md|csv|json|copy|open|all]',
    complete: (a) => opts([{ value: 'open', hint: 'only unresolved' }, { value: 'md', hint: 'save as Markdown' }, { value: 'csv', hint: 'save as CSV' }, { value: 'json' }, { value: 'copy', hint: 'copy as a checklist' }], a),
    run: async (args) => {
      const r = await ready();
      const a = args.trim().toLowerCase();
      if (['md', 'csv', 'json'].includes(a)) { r.exportNotes(a, { save: true }); return null; }
      if (a === 'copy') { await copyText(r.exportNotes('md'), 'Notes copied'); return null; }
      const list = r.notes();
      if (!list.length) return `No notes on ${base(r.current.path)} yet. Add one with \`/note <text>\` or N in Video Review.`;
      const shown = list.map((n, i) => [n, i]).filter(([n]) => a !== 'open' || !n.done);
      return `**Notes on ${base(r.current.path)}** (${list.filter((n) => !n.done).length} open):\n${shown.map(([n, i]) => fmtNote(n, i)).join('\n')}`;
    },
  });
  cmd({
    name: 'resolve', aliases: ['done'], desc: 'Mark note(s) resolved: a number, several (1 3 4), or all', args: '<n…|all>',
    run: async (args) => {
      const r = await ready();
      const list = r.notes();
      const pick = args.trim() === 'all' ? list : words(args).map((x) => list[Number(x.replace('#', '')) - 1]).filter(Boolean);
      if (!pick.length) return 'Which note? /resolve 2 (see /notes).';
      for (const n of pick) r.updateNote(n.id, { done: true });
      return `✓ Resolved ${pick.length} note${pick.length > 1 ? 's' : ''}. ${list.filter((n) => !n.done).length} open.`;
    },
  });
  cmd({ name: 'reopen', desc: 'Reopen a resolved note', args: '<n>', run: async (args) => { const r = await ready(); const n = r.notes()[Number(args.replace('#', '')) - 1]; if (!n) return 'No such note.'; r.updateNote(n.id, { done: false }); return `Note #${args} reopened.`; } });
  cmd({ name: 'unnote', aliases: ['delete-note'], desc: 'Delete a note by number', args: '<n>', run: async (args) => { const r = await ready(); const n = r.notes()[Number(args.replace('#', '')) - 1]; if (!n) return 'No such note.'; r.deleteNote(n.id); return null; } });
  cmd({ name: 'draw', desc: 'Draw on the frame for a note: arrow, circle, rect, free', args: '[tool]', complete: (a) => opts(['arrow', 'circle', 'rect', 'free'].map((value) => ({ value })), a), run: async (args) => { const r = await ready({ show: true }); r.setDraw(true, ['arrow', 'circle', 'rect', 'free'].includes(args) ? args : undefined); return 'Draw on the frame, write the note, Enter saves.'; } });
  cmd({
    name: 'carry-notes', desc: 'Copy the open notes to another version (default: the newest) to check them off there', args: '[name]', complete: (a) => videoSuggestions(a, 6),
    run: async (args) => {
      const r = await ready();
      const to = args ? findVideo(args) : r.versionsOf(r.current).find((v) => v.path !== r.current.path);
      if (!to) return 'No other version found.';
      return `Carried ${r.carryNotes(to.path)} open notes to ${base(to.path)}.`;
    },
  });
  cmd({
    name: 'grab', aliases: ['frame'], desc: 'Grab the current frame: copy (default), save, chat (attach to this chat), note', args: '[copy|save|chat|note]',
    complete: (a) => opts([{ value: 'copy' }, { value: 'save' }, { value: 'chat', hint: 'attach to this chat' }, { value: 'note' }], a),
    run: async (args, ctx) => {
      const r = await ready();
      const a = args.trim() || 'copy';
      if (a === 'save') { await r.saveFrame(); return null; }
      if (a === 'note') { activate('tool:ae'); r.openComposer(); return null; }
      if (a === 'chat') { const p = await r.grabToAttachment(); await Native.attachPaths(ctx.agentId, [p]); return `Frame \`${r.status().timecode}\` attached.`; }
      await r.copyFrame();
      return null;
    },
  });
  cmd({
    name: 'send-feedback', aliases: ['feedback'], desc: 'Put the open notes + frame grabs in an agent\'s chat box: director (default), claude, astra; add "sheet" for a contact sheet', args: '[director|claude|astra] [sheet]',
    complete: (a) => opts(AGENTS, a),
    run: async (args) => {
      const r = await ready();
      const w = words(args.toLowerCase());
      const agent = await r.sendFeedback(w.find((x) => x !== 'sheet' && x !== 'all') || 'director', { sheet: w.includes('sheet'), includeDone: w.includes('all') });
      return agent ? null : 'Nothing sent.';
    },
  });

  // ---------- export / render / After Effects ----------
  cmd({
    name: 'export', desc: 'Export the open video (or its loop) for a platform with ffmpeg: tiktok, reels, shorts, feed45, square, yt1080…', args: '<preset> [fit|blur|crop]',
    complete: (a) => opts(PRESETS, a),
    run: async (args) => {
      const r = await ready();
      const [id, fit] = words(args);
      if (!id) { r.exportMenu(); return null; }
      const p = V.EXPORT_PRESETS.find((x) => x.id === id.toLowerCase()) || V.EXPORT_PRESETS.find((x) => x.name.toLowerCase().includes(id.toLowerCase()));
      if (!p) return `Unknown preset “${id}”. See /presets.`;
      const job = await r.runExport(p.id, { fit: V.FIT_MODES.includes(fit) ? fit : 'crop' });
      return job ? `Exporting **${p.name}** → \`${job.output}\` (progress in the corner).` : null;
    },
  });
  cmd({
    name: 'presets', aliases: ['export-presets'], desc: 'Social export presets: size, fps, bitrate, audio, limits and tips', args: '[preset]', complete: (a) => opts(PRESETS, a),
    run: (args) => {
      const list = args ? V.EXPORT_PRESETS.filter((p) => p.id === args || p.name.toLowerCase().includes(args.toLowerCase())) : V.EXPORT_PRESETS;
      return list.map((p) => `- **${p.name}** (\`${p.id}\`): ${p.w && p.h ? `${p.w}×${p.h}` : p.h ? `${p.h}p` : 'source size'} · ${p.fps || 'source'} fps · ${p.codec === 'prores' ? 'ProRes 422 HQ' : p.codec === 'vp9' ? 'VP9' : p.codec === 'gif' ? 'GIF' : `H.264 ${p.mbps} Mbps`} · ${p.audio} · max ${p.max}${p.tip ? `\n  ${p.tip}` : ''}`).join('\n') || 'No such preset.';
    },
  });
  cmd({ name: 'proxy', desc: 'Make a playable H.264 copy of the open video (ProRes, huge renders)', run: async () => { const r = await ready({ needVideo: false }); if (!r.current) return 'Open a video first.'; const j = await r.runExport('proxy'); return j ? `Making a proxy → \`${j.output}\`` : null; } });
  cmd({ name: 'ae-status', aliases: ['ae'], desc: 'Is After Effects installed / running, and where', run: async () => { const { st, text } = await Review.aeStatusText(); return `${text}${st.found && st.userScripts ? `\nScripts menu folder: ${st.userScripts}` : ''}`; } });
  cmd({
    name: 'render', desc: 'Render an AE comp with aerender (last project, or give the .aep), then optionally export a preset', args: '<comp> [preset] | <project.aep> <comp> [preset]',
    complete: (a) => (words(a).length >= 1 && /\s$/.test(a) ? PRESETS.map((p) => ({ ...p, value: `${a}${p.value}` })) : []),
    run: async (args) => {
      const w = args.match(/"[^"]+"|\S+/g)?.map((x) => x.replace(/^"|"$/g, '')) || [];
      let project = w[0]?.toLowerCase().endsWith('.aep') ? w.shift() : store.get('review.lastProject', '');
      const preset = V.EXPORT_PRESETS.find((p) => p.id === w[w.length - 1]?.toLowerCase()) ? w.pop().toLowerCase() : null;
      const comp = w.join(' ');
      const st = await window.hub.ae.status();
      if (!st.found) return `Can't render: ${st.reason}`;
      if (!project) {
        const found = await window.hub.ae.projects(await projectDirs());
        project = found[0]?.path;
        if (!project) return 'No .aep found. Give it: /render "path/to/project.aep" "Comp name" reels';
      }
      store.set('review.lastProject', project);
      await Review.ensureMounted();
      const dirs = await Review.videoDirs();
      const sep = dirs[0]?.includes('\\') ? '\\' : '/';
      const stem = (comp || base(project).replace(/\.aep$/i, '')).replace(/[\\/:*?"<>|]/g, '_');
      const n = Review.videos.filter((v) => base(v.path).toLowerCase().startsWith(stem.toLowerCase())).length + 1;
      const output = dirs[0] ? `${dirs[0]}${sep}${stem}_v${n}.mp4` : '';
      const tmpl = V.omTemplatesFor(preset || 'reels', await window.hub.ae.templates())[0] || '';
      if (!tmpl && output) toast('No H.264 output-module template found in AE: aerender uses the project\'s own output settings.', { timeout: 6000 });
      const r = await Review.renderAe({ project, comp, output: tmpl ? output : '', omTemplate: tmpl });
      if (!r.ok) return `Render failed: ${r.error}`;
      if (preset && tmpl) { await Review.load(); await Review.open(output); const x = await Review.runExport(preset); return `Rendered **${comp || base(project)}** in ${r.value.seconds}s.${x ? ` Exporting ${preset} → \`${x.output}\`.` : ''}`; }
      return `Rendered **${comp || base(project)}** in ${r.value.seconds}s${tmpl ? ` → \`${output}\`` : ''}. It shows in Video Review.`;
    },
  });
  cmd({
    name: 'ae-run', desc: 'Run an After Effects script: a built-in or saved script by name, or ExtendScript code', args: '<script name | code>',
    complete: (a) => opts(AEData.SCRIPTS.map((s) => ({ value: s.name, hint: s.desc })), a),
    run: async (args) => {
      if (!args) { activate('tool:ae'); AEKit.openKit(true, 'scripts'); return null; }
      const q = args.toLowerCase();
      const builtin = AEData.SCRIPTS.find((s) => s.name.toLowerCase() === q) || AEData.SCRIPTS.find((s) => s.name.toLowerCase().includes(q));
      const mine = (await window.hub.kvGet('ae-scripts', [])).find((s) => s.name.toLowerCase() === q || s.name.toLowerCase().includes(q));
      const looksLikeCode = /[;(){}=]/.test(args);
      const code = looksLikeCode ? args : builtin ? builtin.code(Object.fromEntries(builtin.params.map((p) => [p.name, p.value]))) : mine?.code;
      if (!code) return `No script called “${args}”. Built in: ${AEData.SCRIPTS.slice(0, 6).map((s) => s.name).join(', ')}…`;
      const r = await Review.runAeScript(code, looksLikeCode ? 'Chat script' : (builtin || mine).name);
      return r.ok ? `▶ ${r.value}` : `Couldn't run it: ${r.error}`;
    },
  });
  cmd({
    name: 'toolkit', aliases: ['ae-kit'], desc: 'Open the After Effects toolkit drawer (expressions, scripts, render queue, calculators…)', args: '[tab]',
    complete: (a) => opts(AEKit.KIT_TABS.map((value) => ({ value })), a),
    run: async (args) => { activate('tool:ae'); await Review.ensureMounted(); AEKit.openKit(true, AEKit.KIT_TABS.find((t) => t.startsWith(args.toLowerCase())) || undefined); },
  });
  cmd({ name: 'director', desc: 'Show / hide the Video Director chat in Video Review (sets it up if missing)', run: async () => { activate('tool:ae'); await Review.ensureMounted(); if (!Tools.dockedAgent('ae')) { Review.directorSegment(); return null; } return Review.setDock() ? 'Video Director chat shown.' : 'Video Director chat hidden.'; } });
  cmd({
    name: 'sheet', aliases: ['contact-sheet'], desc: 'Contact sheet of the open video (attached to this chat)', args: '[frames]',
    run: async (args, ctx) => {
      const r = await ready();
      const { image, times } = await r.contactSheet({ count: Number(args) || 12 });
      const p = await window.hub.saveAttachment('contact-sheet.jpg', image.data);
      await Native.attachPaths(ctx.agentId, [p]);
      return `Contact sheet attached (${times.length} frames, ${times[0]}s → ${times[times.length - 1]}s).`;
    },
  });
  cmd({
    name: 'pipeline', desc: 'The render → review → feedback → export steps for the open video (for the node view)', args: '[preset]', complete: (a) => opts(PRESETS, a),
    run: async (args) => {
      await R().ensureMounted();
      const p = R().pipeline({ preset: args || 'reels' });
      return `${p.nodes.map((n) => `- **${n.label}**${n.cmd ? ` · \`${n.cmd}\`` : ''}`).join('\n')}\nFlow: ${p.edges.map((e) => `${e.from}→${e.to}`).join(', ')}`;
    },
  });
  cmd({
    name: 'view', desc: 'Look at the frame differently: r, g, b (one channel), luma, invert, contrast, sat, normal', args: '<view>',
    complete: (a) => opts(Review.VIEWS.map(([k, l]) => ({ value: k || 'normal', hint: l })), a),
    run: async (args) => { const r = await ready({ show: true }); const v = r.setView(args === 'normal' ? '' : args.toLowerCase()); return v ? `View: ${Review.VIEWS.find(([k]) => k === v)[1]}.` : 'Normal view.'; },
  });
  cmd({ name: 'mirror', desc: 'Mirror the frame left/right (spot composition problems with fresh eyes)', run: async () => ((await ready({ show: true })).setMirror() ? 'Mirrored.' : 'Not mirrored.') });
  cmd({ name: 'pingpong', desc: 'Loop back and forth between the in and out points', run: async () => ((await ready()).setPingPong() ? 'Ping-pong loop on.' : 'Ping-pong loop off.') });
  cmd({ name: 'volume', desc: 'Playback volume 0–100', args: '<0-100>', complete: (a) => opts(['0', '50', '80', '100'].map((value) => ({ value })), a), run: async (args) => `Volume ${Math.round((await ready()).setVolume((Number(args) || 0) / 100) * 100)}%` });
  cmd({ name: 'timecode', aliases: ['time-mode'], desc: 'Show time as timecode, seconds or frames', args: 'tc|sec|frames', complete: (a) => opts(['tc', 'sec', 'frames'].map((value) => ({ value })), a), run: async (args) => `Time shown as ${(await ready({ needVideo: false })).cycleTimeMode(args)}.` });
  cmd({ name: 'section', aliases: ['drop'], desc: 'Jump to the next (or previous) loud section / drop in the audio', args: '[next|prev]', complete: (a) => opts([{ value: 'next' }, { value: 'prev' }], a), run: async (args) => { const r = await ready(); r.jumpDrop(args === 'prev' ? -1 : 1); await r.waitSeek(); return `\`${r.status().timecode}\``; } });
  cmd({
    name: 'inbox', aliases: ['all-notes'], desc: 'Every open note across all renders (newest renders first)',
    run: async () => {
      const r = await ready({ needVideo: false });
      const all = r.allOpenNotes();
      if (!all.length) return 'No open notes anywhere. ✓';
      let last = '';
      const lines = [];
      for (const { path, note } of all.slice(0, 40)) { if (path !== last) { lines.push(`**${base(path)}**`); last = path; } lines.push(`- \`${tcOf(note.t)}\` ${note.prio ? '❗ ' : ''}${V.category(note.cat).name}: ${note.text}`); }
      return `${all.length} open note${all.length > 1 ? 's' : ''}:\n${lines.join('\n')}`;
    },
  });
  cmd({ name: 'urgent', aliases: ['must-fix'], desc: 'Mark a note as must-fix (sent first in feedback)', args: '<n>', run: async (args) => { const r = await ready(); const n = r.notes()[Number(String(args).replace('#', '')) - 1]; if (!n) return 'No such note.'; r.updateNote(n.id, { prio: !n.prio }); return n.prio ? `❗ Note #${args} is must-fix.` : `Note #${args} is no longer urgent.`; } });
  cmd({
    name: 'export-all', aliases: ['socials'], desc: 'Export the open video to every other social format (9:16, 4:5, 1:1, 16:9) with ffmpeg', args: '[crop|blur|fit]',
    complete: (a) => opts(V.FIT_MODES.map((value) => ({ value })), a),
    run: async (args) => { const r = await ready(); r.exportAllSocials({ fit: V.FIT_MODES.includes(args) ? args : 'crop' }); return 'Exporting every social format, one after another (progress in the corner).'; },
  });
  cmd({
    name: 'ae-open', desc: 'Open an After Effects project (newest first, or by name)', args: '[name]',
    complete: async (a) => { const found = await window.hub.ae.projects(await projectDirs()); return found.filter((p) => !a || p.name.toLowerCase().includes(a.toLowerCase())).slice(0, 10).map((p) => ({ value: p.name, hint: timeAgo(p.mtime) })); },
    run: async (args) => {
      const st = await window.hub.ae.status();
      const found = await window.hub.ae.projects(await projectDirs());
      const p = found.find((x) => !args || x.name.toLowerCase().includes(args.toLowerCase()));
      if (!p) return `No .aep${args ? ` matching “${args}”` : ''} in ${(await projectDirs()).join(', ')}.`;
      store.set('review.lastProject', p.path);
      await window.hub.fs.open(p.path);
      return `Opening **${p.name}**${st.found ? '' : ` (note: ${st.reason})`}. /render <comp> now renders from it.`;
    },
  });
  cmd({
    name: 'ae-comp', desc: 'Create a comp in After Effects for a social format: 9:16, 4:5, 1:1, 16:9 (or any AE preset name)', args: '<format> [seconds] [fps]',
    complete: (a) => opts([...V.MAIN_FORMATS.map((f) => ({ value: f })), ...AEData.PRESETS.map((p) => ({ value: p.name, hint: `${p.w}×${p.h}` }))], a),
    run: async (args) => {
      const w = words(args);
      const f = V.formatInfo(w[0]);
      const preset = f ? { name: `${f.name} ${f.id.replace(':', 'x')}`, w: f.w, h: f.h, fps: 30 } : AEData.PRESETS.find((p) => p.name.toLowerCase().includes(args.toLowerCase()));
      if (!preset) return `Unknown format “${args}”. Try 9:16, 4:5, 1:1 or 16:9.`;
      const nums = w.slice(f ? 1 : 0).map(Number).filter((x) => x > 0);
      const ok = await AEKit.runCode(AEData.scriptCreateComp({ ...preset, duration: nums[0] || 10, fps: nums[1] || preset.fps }), `Create comp ${preset.name}`);
      return ok ? `Comp **${preset.name}** (${preset.w}×${preset.h}) sent to After Effects.` : null;
    },
  });
  cmd({ name: 'video-keys', desc: 'Video Review keyboard shortcuts', run: async () => { await R().ensureMounted(); R().shortcutsHelp(); } });
  cmd({ name: 'video-status', desc: 'What\'s open in Video Review: file, time, frame, fps, loop, compare, notes', run: async () => { const r = await ready(); const s = r.status(); return `**${base(s.open)}** · ${s.resolution} ${s.format} · \`${s.timecode}\` (frame ${s.frame}) · ${s.fps} fps (${s.fpsSource})${s.bpm ? ` · ${s.bpm} bpm` : ''}${s.loop ? ` · loop ${s.loop.in}–${s.loop.out}s${s.loop.on ? '' : ' (off)'}` : ''}${s.comparingWith ? ` · B ${base(s.comparingWith)} (${s.compareMode})` : ''} · ${s.notes.filter((n) => !n.resolved).length} open notes`; } });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  return { findVideo, ready, clean };
})();
