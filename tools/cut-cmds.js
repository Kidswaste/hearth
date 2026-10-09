// Chat commands for the cut (clip editing in Video Review, tools/video-cut.js) and for cutting the Lab's song /
// video (tools/three-media.js). Area "Video". Every editing key has a command: /split, /ripple-delete, /trim-start,
// /clip-speed 2, /cut-auto bars, /cut-export reels… They open Video Review and its clip track when needed.
// Clip numbers are 1-based, as /clips lists them; times are program times (the edit as it plays).
const CutCmds = (() => {
  const C = CutData;
  const AREA = 'Video';
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, args) => { const q = String(args || '').toLowerCase().split(/\s+/).pop(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => !q || String(x.value).toLowerCase().startsWith(q)).slice(0, 14); };
  const fmt = (t) => C.fmt(t || 0);
  const inVideo = (ctx) => H.activeId === 'tool:ae' || H.agent(ctx?.agentId)?.dock === 'ae';
  // Video Review mounted, a video open and the clip track on.
  async function editing({ show = true } = {}) {
    await VideoCmds.ready({ show });
    if (!VideoCut.active) await VideoCut.enter();
    if (!VideoCut.edit) throw new Error('No cut: open a video first (/review <name>).');
    return VideoCut;
  }
  const timeArg = (s) => { if (s == null || s === '') return null; const t = VideoData.parseTime(s, Review.state.fps, VideoCut.time, C.total(VideoCut.edit)); if (t == null) throw new Error(`Can't read the time “${s}”: try 2.5, 0:03.2, f90 or +1s.`); return t; };
  // "/x 3" acts on clip 3 (selects it first); no number = the selected clip(s), else the one under the playhead
  function pickClips(cut, list) {
    const ns = list.filter((w) => /^\d+$/.test(w)).map(Number);
    if (!ns.length) return true;
    const bad = ns.find((n) => n < 1 || n > cut.edit.clips.length);
    if (bad) throw new Error(`There's no clip ${bad} (the cut has ${cut.edit.clips.length}: /clips lists them).`);
    cut.select(ns[0] - 1);
    if (ns.length > 1) for (const n of ns.slice(1)) VideoCut._test.st.sel.add(cut.edit.clips[n - 1].id);
    return true;
  }
  const clipList = (cut) => {
    const lines = cut.describe();
    const sel = new Set(cut.selection);
    return lines.map((l, i) => `${sel.has(cut.edit.clips[i].id) ? '▸ ' : ''}${l}`).join('\n');
  };
  const summary = (cut) => `${cut.edit.clips.length} clip${cut.edit.clips.length === 1 ? '' : 's'} · ${fmt(C.total(cut.edit))}`;
  const PRESET_OPTS = [{ value: 'new', hint: 'same size, a new version next to the video' }, ...['tiktok', 'reels', 'shorts', 'feed45', 'square', 'yt1080', 'gif', 'webm', 'master'].map((id) => ({ value: id, hint: VideoData.EXPORT_PRESETS.find((p) => p.id === id)?.name })), { value: 'stills', hint: 'a PNG for every frame' }];
  const AUTO = [{ value: 'bars', hint: 'a cut on every bar' }, { value: '2bars', hint: 'every 2 bars' }, { value: '4bars', hint: 'every 4 bars' }, { value: 'beats', hint: 'every beat' }, { value: 'drops', hint: 'on the drops' }, { value: 'sections', hint: 'where the song changes' }, { value: 'apply', hint: 'make the suggested cuts' }, { value: 'off', hint: 'dismiss the suggestion' }];

  const defs = [];
  const cmd = (d) => defs.push(d);
  cmd({ name: 'cut', aliases: ['edit-clips'], desc: 'Clip editing for the open video: on / off (E), reset, undo, redo, keys', args: '[on|off|reset|undo|redo|keys]', keys: 'E',
    complete: (a) => opts(['on', 'off', 'reset', 'undo', 'redo', 'keys'], a), examples: ['/cut', '/cut off'], keywords: 'edit trim nle timeline clips',
    run: async (args) => {
      const w = words(args)[0] || '';
      if (w === 'off') { await VideoCmds.ready({ needVideo: false }); VideoCut.leave(); return 'Back to the review.'; }
      const cut = await editing();
      if (w === 'reset') { cut.reset(); return `Back to the whole video (${summary(cut)}). /cut undo brings the edit back.`; }
      if (w === 'undo') return cut.undo() ? `Undone · ${summary(cut)}` : 'Nothing to undo.';
      if (w === 'redo') return cut.redo() ? `Redone · ${summary(cut)}` : 'Nothing to redo.';
      if (w === 'keys') { cut.help(); return null; }
      return `✂ Editing **${base(cut.path)}** · ${summary(cut)} · S splits, Shift+Del ripple-deletes, drag edges to trim, ⇪ exports (/cut keys).`;
    } });
  cmd({ name: 'split', desc: 'Split the clip at the playhead (or at a time) (S)', args: '[time]', keys: 'S', examples: ['/split', '/split 2.5'],
    run: async (args) => { const cut = await editing(); const t = timeArg(args) ?? cut.time; return cut.split(t) ? `✂ Split at ${fmt(t)} · ${summary(cut)}` : `No split at ${fmt(t)} (a cut is already there, or it's the very start / end).`; } });
  cmd({ name: 'clips', desc: 'The cut\'s clips with their times, sources, speeds and fades', run: async () => { const cut = await editing({ show: false }); return `**${base(cut.path)}** · ${summary(cut)}\n${clipList(cut)}`; } });
  cmd({ name: 'clip', desc: 'Select a clip by number (and put the playhead on it)', args: '<n>', run: async (args) => { const cut = await editing(); const n = Number(words(args)[0]); if (!cut.select(n - 1)) return `No clip ${args} (/clips lists them).`; return `Clip ${n} selected.`; } });
  cmd({ name: 'ripple-delete', desc: 'Delete clip(s) and close the gap (Shift+Del); no number: the selected clip, or the in–out range', args: '[n…]', keys: 'Shift+Del',
    run: async (args) => { const cut = await editing(); pickClips(cut, words(args)); return cut.del(true) ? `Ripple deleted · ${summary(cut)}` : 'Nothing to delete.'; } });
  cmd({ name: 'cut-delete', desc: 'Delete clip(s) but leave a black gap of the same length (Del)', args: '[n…]', keys: 'Del',
    run: async (args) => { const cut = await editing(); pickClips(cut, words(args)); return cut.del(false) ? `Deleted (gap left) · ${summary(cut)}` : 'Nothing to delete.'; } });
  cmd({ name: 'trim-start', desc: 'Trim the clip under the playhead so it starts there (Q); or at a time', args: '[time]', keys: 'Q',
    run: async (args) => { const cut = await editing(); const t = timeArg(args); if (t != null) await cut.goto(t); cut.trimTo('in'); return `Start trimmed · ${summary(cut)}`; } });
  cmd({ name: 'trim-end', desc: 'Trim the clip under the playhead so it ends there (W); or at a time', args: '[time]', keys: 'W',
    run: async (args) => { const cut = await editing(); const t = timeArg(args); if (t != null) await cut.goto(t); cut.trimTo('out'); return `End trimmed · ${summary(cut)}`; } });
  cmd({ name: 'move-clip', desc: 'Move clip n to position m (1 = first)', args: '<n> <m>',
    run: async (args) => { const cut = await editing(); const [n, m] = words(args).map(Number); if (!(n >= 1 && m >= 1)) return 'Usage: /move-clip 3 1'; const to = m > n ? m : m - 1; return cut.move(n - 1, to) ? `Clip ${n} is now clip ${m}.` : `No clip ${n}.`; } });
  cmd({ name: 'dup-clip', aliases: ['duplicate-clip'], desc: 'Duplicate a clip (D): it plays twice in a row', args: '[n]', keys: 'D',
    run: async (args) => { const cut = await editing(); pickClips(cut, words(args)); return cut.duplicate() ? `Duplicated · ${summary(cut)}` : 'No clip to duplicate.'; } });
  cmd({ name: 'clip-speed', desc: 'Speed of a clip, 0.25–4× (sound keeps its pitch) ([ and ])', args: '<x> [n…]', complete: (a) => opts(C.SPEEDS.map(String), a), examples: ['/clip-speed 2', '/clip-speed 0.5 3'],
    run: async (args) => { const cut = await editing(); const w = words(args); const x = Number(String(w[0] || '').replace(/x$/i, '')); if (!(x >= 0.25 && x <= 4)) return 'Give a speed from 0.25 to 4 (e.g. /clip-speed 2).'; pickClips(cut, w.slice(1)); const v = cut.setSpeed(x); return v ? `${v}× · ${summary(cut)}` : 'Speed works on video clips (not titles, freezes or gaps).'; } });
  cmd({ name: 'clip-mute', desc: 'Mute or unmute a clip\'s sound (A)', args: '[n…] [on|off]', keys: 'A', complete: (a) => opts(['on', 'off'], a),
    run: async (args) => { const cut = await editing(); const w = words(args); pickClips(cut, w); const on = w.includes('off') ? false : w.includes('on') ? true : undefined; const m = cut.mute(on); return m == null ? 'No clip.' : m ? '🔇 Muted' : '🔊 Sound on'; } });
  cmd({ name: 'clip-fade', desc: 'Fade a clip in / out / both over seconds (0 removes it); drag the gold squares on the clip too', args: '<in|out|both> <seconds> [n…]', complete: (a) => opts(['in', 'out', 'both'], a), examples: ['/clip-fade in 0.5', '/clip-fade both 1 4'],
    run: async (args) => { const cut = await editing(); const [edge, s, ...rest] = words(args); const sec = Number(s); if (!['in', 'out', 'both'].includes(edge) || !(sec >= 0)) return 'Usage: /clip-fade in 0.5 (or out / both, seconds, optional clip numbers)'; pickClips(cut, rest); if (edge !== 'out') cut.fade('in', sec); if (edge !== 'in') cut.fade('out', sec); return sec ? `Fade ${edge} ${sec} s` : `No fade ${edge}`; } });
  cmd({ name: 'freeze-frame', desc: 'Insert a freeze frame of the picture at the playhead (Shift+F)', args: '[seconds]', keys: 'Shift+F',
    run: async (args) => { const cut = await editing(); const s = Number(words(args)[0]) || 1; return cut.freezeHere(Math.min(30, Math.max(0.1, s))) ? `❄ ${s} s freeze at ${fmt(cut.time)} · ${summary(cut)}` : 'No picture to freeze here.'; } });
  cmd({ name: 'title-card', aliases: ['title-clip'], desc: 'Insert a title card (white words on black) at the playhead (Shift+T); \\n for a new line', args: '<text> [seconds]', keys: 'Shift+T', examples: ['/title-card NEON TUNNEL 2'],
    run: async (args) => { const cut = await editing(); const w = words(args); let s = 2; if (w.length > 1 && /^\d+(\.\d+)?$/.test(w[w.length - 1])) s = Number(w.pop()); const text = w.join(' ') || 'Title'; await cut.addTitle(text, Math.min(30, Math.max(0.2, s))); return `Title card “${text}” (${s} s) · ${summary(cut)}`; } });
  cmd({ name: 'marker', aliases: ['cut-marker'], desc: 'A marker on the clip track at the playhead (M); trims snap to it', args: '[label]', keys: 'M',
    run: async (args) => { const cut = await editing(); cut.marker(String(args || '').trim()); return `Marker at ${fmt(cut.time)}.`; } });
  cmd({ name: 'markers', desc: 'The cut\'s markers and the notes on it (in program time)', run: async () => { const cut = await editing({ show: false }); const m = cut.edit.markers; const notes = Review.notes(cut.path).flatMap((n) => C.programTimes(cut.edit, cut.path, n.t).map((t) => `${fmt(t)} · note: ${n.text}`)); const lines = [...m.map((x, i) => `${fmt(x.t)} · marker ${i + 1}${x.label ? `: ${x.label}` : ''}`), ...notes].sort(); return lines.length ? lines.join('\n') : 'No markers (M adds one at the playhead; notes on the video show too).'; } });
  cmd({ name: 'cut-auto', aliases: ['beat-cut'], desc: 'Suggest cuts on the music: every bar / 2 / 4 bars / beat / drops / sections; "apply" makes them (Enter)', args: '<bars|2bars|4bars|beats|drops|sections|apply|off>', complete: (a) => opts(AUTO, a), examples: ['/cut-auto bars', '/cut-auto apply'], keywords: 'beat bar drop music automatic',
    run: async (args) => {
      const cut = await editing(); const mode = words(args)[0] || 'bars';
      if (mode === 'apply') { const n = cut.acceptSuggestion(); return n ? `✂ ${n} cuts made · ${summary(cut)}` : 'No suggestion to apply (/cut-auto bars first).'; }
      if (mode === 'off') { cut.suggest('off'); return 'Suggestion dismissed.'; }
      if (!AUTO.some((x) => x.value === mode)) return `Pick one of: ${AUTO.map((x) => x.value).join(', ')}.`;
      // the beats come from the audio analysis, which runs in the background after a video opens
      for (let i = 0; i < 40 && !Review.state.audio; i += 1) await new Promise((r) => setTimeout(r, 150));
      const t = cut.suggest(mode);
      return t?.length ? `✂ ${t.length} cuts suggested (dashed lines): Enter or **/cut-auto apply** makes them, Esc dismisses.` : 'No beats found for that (the video needs a sound track with a beat).';
    } });
  cmd({ name: 'cut-range', aliases: ['cut-inout'], desc: 'The in–out range of the cut (I / O): exports and plays only it; Shift+Del removes it. off clears', args: '<in> <out> | off', keys: 'I / O',
    run: async (args) => { const cut = await editing(); const w = words(args); if (!w.length || w[0] === 'off') { cut.setMark(null); return 'In–out cleared.'; } const a = timeArg(w[0]); const b = w[1] ? timeArg(w[1]) : C.total(cut.edit); const m = cut.setMark(a, b); return m ? `In–out ${fmt(m.a)} → ${fmt(m.b)}.` : 'That range is empty.'; } });
  cmd({ name: 'cut-add', aliases: ['add-clip'], desc: 'Add a video from the library to the end of the cut (optionally only from–to seconds)', args: '<video> [from] [to]', complete: (a) => (typeof Review === 'undefined' ? [] : Review.videos.filter((v) => !a || v.path.toLowerCase().includes(String(a).toLowerCase())).slice(0, 10).map((v) => ({ value: base(v.path) }))),
    run: async (args) => {
      const w = words(args); const nums = []; while (w.length > 1 && /^\d+(\.\d+)?$/.test(w[w.length - 1])) nums.unshift(Number(w.pop()));
      const cut = await editing();
      const v = VideoCmds.findVideo(w.join(' '));
      if (!v) return `No video matches “${w.join(' ')}” (/videos lists them).`;
      const ok = await cut.addClip(v.path, { a: nums[0] ?? 0, b: nums[1] ?? null });
      return ok ? `Added **${base(v.path)}** · ${summary(cut)}` : `Couldn't add ${base(v.path)}.`;
    } });
  cmd({ name: 'cut-export', aliases: ['export-cut'], desc: 'Render the cut with ffmpeg: new (a new version next to the video), a social preset, gif, webm, master or stills', args: '[new|tiktok|reels|shorts|feed45|square|yt1080|gif|stills…] [crop|fit|blur]', complete: (a) => opts([...PRESET_OPTS, ...VideoData.FIT_MODES.map((f) => ({ value: f }))], a), examples: ['/cut-export', '/cut-export reels blur'],
    run: async (args) => {
      const cut = await editing(); const w = words(args);
      const fit = w.find((x) => VideoData.FIT_MODES.includes(x)) || 'crop';
      const what = w.find((x) => !VideoData.FIT_MODES.includes(x)) || 'new';
      const job = await cut.exportCut(what === 'stills' ? { stills: true } : what === 'new' ? {} : { preset: what, fit });
      if (!job) return null;
      const ev = await job.done;
      return ev.code === 0 ? `⇪ ${base(ev.output)} (${ev.seconds}s)${what === 'new' ? ' · in the library as a new version' : ''}` : `Export failed: ${ev.error || ev.code}`;
    } });
  cmd({ name: 'cut-export-all', aliases: ['cut-socials'], desc: 'Render the cut in all 4 social formats (9:16 · 4:5 · 1:1 · 16:9)', args: '[crop|blur|fit]', complete: (a) => opts(VideoData.FIT_MODES, a),
    run: async (args) => { const cut = await editing(); const outs = await cut.exportAll({ fit: words(args)[0] || 'crop' }); return outs.length ? `⇪ ${outs.map(base).join(' · ')}` : null; } });

  // ---------- the Lab's song / video (tools/three-media.js) ----------
  async function lab() {
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t loaded.');
    const p = (await ThreeLab.cmd({ show: true })).player;
    if (!p?.loaded) throw new Error('Load a song or video in the Lab first (🎵 Load audio / video…).');
    return p;
  }
  const labDefs = [];
  labDefs.push({ name: 'song-trim', aliases: ['trim-song'], desc: 'Trim the Lab\'s song: it starts at in and stops at out (the sketch only hears that part); { and } at the playhead', args: '<in> <out> | in | out | off', complete: (a) => opts(['in', 'out', 'off'], a), keys: '{ / }',
    run: async (args) => {
      const p = await lab(); const w = words(args);
      if (w[0] === 'off') { p.setTrim(null); return 'Song untrimmed.'; }
      if (w[0] === 'in' || w[0] === 'out') { const t = p.setTrimEdge(w[0] === 'in' ? 'a' : 'b', p.time); return t ? `Song trimmed ${fmt(t.a)} → ${fmt(t.b)}.` : null; }
      const [a, b] = w.map((x) => ThreeMedia._test.parseTime(x));
      if (!Number.isFinite(a)) return 'Usage: /song-trim 0:04.2 1:32 (or in / out at the playhead, off)';
      const t = p.setTrim({ a, b: Number.isFinite(b) ? b : p.duration });
      return t ? `Song trimmed ${fmt(t.a)} → ${fmt(t.b)}.` : 'That range is empty.';
    } });
  labDefs.push({ name: 'cut-loop', aliases: ['save-loop'], desc: 'Save the Lab\'s loop (or trim) of the song / video as a new file next to it (ffmpeg)', run: async () => { const p = await lab(); const r = await p.cutLoop(); return r ? `Saved **${base(r)}**.` : null; } });
  labDefs.push({ name: 'send-clip', aliases: ['to-review'], desc: 'Send the Lab\'s video (its loop or trim) to Video Review as a clip of the open cut', run: async () => { const p = await lab(); const ok = await p.sendClip(); return ok ? 'Sent to Video Review: it\'s on the clip track.' : null; } });

  function registerAll() {
    for (const d of defs) Commands.register({ area: AREA, ...d, when: inVideo, whenLabel: 'in Video Review', aliases: (d.aliases || []).filter((a) => !Commands.get(a)) });
    for (const d of labDefs) if (!Commands.get(d.name)) Commands.register({ area: 'Three.js Lab', ...d, aliases: (d.aliases || []).filter((a) => !Commands.get(a)) });
  }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();
  return { editing };
})();
