// Chat commands for the Lab's footage frames (tools/three-frames.js, round 8): step and read exact frames of the
// video the sketch uses, cut it (the sketch plays the parts; the editor shares the cut), read reference clips and
// match their pacing (the vibe, never the footage). Area "Three.js Lab" (/help footage). The editor's frame commands
// (/goto-frame, /frame-step, /frame-check, /cut-delete, /clip-speed, /hold-frame, /markers-at-cuts) also work here
// on the Lab's footage (shared names, `when` the Lab shows footage).
(() => {
  const AREA = 'Three.js Lab';
  const T = () => ThreeFrames;
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const inLab = (ctx) => H.surfaceIdFor(H.activeId) === 'tool:three' || H.agent(ctx?.agentId)?.dock === 'three';
  const footageHere = (ctx) => inLab(ctx) && typeof ThreeFrames !== 'undefined' && ThreeFrames.on;
  const opts = (list, q) => { const s = String(q || '').toLowerCase(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => String(x.value).toLowerCase().includes(s)).slice(0, 14); };
  const lab = async () => { const c = await ThreeLab.cmd({ show: true }); await c.waitSong?.(); return c; };
  const need = async () => {
    await lab();
    if (!T().on) throw new Error(ThreeLab.director?.media?.loaded && ThreeLab.director.media.isVideo ? 'Frame mode is off for this video: /footage on' : 'Load a video in the Lab first (🎵 or drop it on the preview), no song needed.');
  };
  const here = () => { const s = T().status(); return `f${s.frame} · ${s.timecode}${s.parts ? ` · part ${(T().parts.findIndex((p) => !p.hold && s.time >= p.a - 1e-6 && s.time < p.b - 1e-6) + 1) || '— removed (the sketch skips it)'}` : ''}`; };
  const frameArg = (s) => { const c = T().clock; const n = T()._pure.resolve(c, T()._pure.parse(c, s), T().frame); if (n == null) throw new Error(`"${s}" isn't a frame: f120, 120f, 00:00:04:12, +10f or 4.5 (seconds)`); return n; };
  const timeArg = (s) => T()._pure.timeOf(T().clock, frameArg(s));
  const settle = () => new Promise((r) => setTimeout(r, 260));
  const parts = () => T().describe().join('\n');
  const refList = async (q) => (await T().refVideos()).map((r) => ({ value: r.name, hint: `${r.from} · ${base(r.path)}` })).filter((x) => !q || x.value.toLowerCase().includes(String(q).toLowerCase()));
  // suggestions must come back right away: the clips as last seen (refreshed in the background)
  let refCache = [];
  const refSoon = (q) => { refList().then((l) => { refCache = l; }).catch(() => {}); return refCache.filter((x) => !q || x.value.toLowerCase().includes(String(q).toLowerCase())).slice(0, 14); };
  const SENS = ['gentle', 'normal', 'sensitive', 'every'];
  const defs = [];
  const reg = (d) => defs.push(d);

  // ---------- the open one ----------
  const FOOTAGE_SUBS = [
    ['status', 'Frame, timecode, fps, parts'], ['on', 'Frame mode on for this video'], ['off', 'Music keys again for this video'],
    ['step', 'step <n> frames (negative: back)'], ['go', 'go <f120 | 00:00:04:12 | +10f | 4.5>'], ['cut', 'Cut at this frame'], ['delete', 'Remove the part here'],
    ['restore', 'Put the removed part back'], ['speed', 'speed <0.25–4> of the part here'], ['hold', 'hold <s>: this frame held'], ['clear', 'The whole video again'],
    ['parts', 'The cut, part by part'], ['scenes', 'Cut at every shot [gentle|normal|sensitive]'], ['cues', 'A cue at every cut'], ['shots', 'A cue at every shot'],
    ['editor', 'Open the same cut in the video editor'], ['sequence', 'sequence [name]: a copy as a new editor sequence'], ['from', 'from <sequence>: take its cut back'],
    ['sheet', 'Contact sheet of the footage (exact frames)'], ['motion', 'Motion curve'], ['pacing', 'Pacing'], ['read', 'This frame as a picture'], ['check', 'Is the frame on screen the right one?'],
    ['time', 'time <tc|frames|seconds>'], ['film', 'film <on|off>: the filmstrip'], ['keys', 'The footage keys'],
    ['in', 'The part here starts on this frame'], ['out', 'The part here ends on this frame'], ['roll', 'roll <±frames>: move the nearest cut'],
    ['repeat', 'The part here plays again right after'], ['first', 'The part here plays first'], ['last', 'The part here plays last'], ['mute', 'The part\'s sound off / on'],
    ['edl', 'Save the cut as an EDL next to the video'], ['copy', 'Copy this frame\'s timecode'], ['still', 'A still of the sketch at this frame'], ['storyboard', 'The sketch at every part, one sheet'],
  ];
  reg({ name: 'footage', aliases: ['frames-lab'], desc: 'The Lab\'s video footage, frame by frame: status, step / go to frames, cut (the sketch plays the parts), shots, the editor, readings', args: '[status|step n|go f120|cut|delete|restore|speed x|hold s|clear|parts|scenes|cues|shots|editor|sequence|from|sheet|motion|pacing|read|check|time|film|on|off|keys]',
    examples: ['/footage', '/footage go 00:00:02:12', '/footage step -5', '/footage cut', '/footage scenes'], keywords: 'video frames timecode cut footage step',
    complete: (a) => opts(FOOTAGE_SUBS.map(([value, hint]) => ({ value, hint })), a),
    run: async (args) => {
      const w = words(args); const sub = (w[0] || 'status').toLowerCase(); const rest = w.slice(1).join(' ');
      await lab();
      if (sub === 'on' || sub === 'off') { if (!ThreeLab.director?.media?.isVideo) return 'Load a video first.'; T().setMode(sub === 'on'); return sub === 'on' ? `Frame mode on · ${here()}` : 'Frame mode off for this video: the timeline keys are the music ones again.'; }
      if (sub === 'keys') return T().KEYS.map(([k, what]) => `- **${k}** ${what}`).join('\n');
      if (sub === 'time') { const d = T().setDisplay({ timecode: 'tc', tc: 'tc', frames: 'frames', frame: 'frames', seconds: 'seconds', s: 'seconds' }[rest] || rest); return d ? `The time box shows ${d === 'tc' ? 'timecode · frame' : d}.` : 'tc, frames or seconds.'; }
      if (sub === 'film') { const v = rest ? !/^off|no|0$/i.test(rest) : !store.get('three.filmstrip', true); store.set('three.filmstrip', v); ThreeLab.director?.media?.redraw?.(); return `Filmstrip ${v ? 'on' : 'off'}.`; }
      if (['sheet', 'motion', 'pacing'].includes(sub)) { await need(); await T().readFootage(sub); return null; }
      if (sub === 'read') { await need(); const r = await T().readFrame({ show: true }); return `f${r.frame} · ${r.timecode}`; }
      await need();
      if (sub === 'status') { const s = T().status(); return `**${s.footage}** · ${here()} · ${s.fps} fps · ${s.frames} frames (${s.clock})${s.parts ? ` · cut into ${s.parts} part${s.parts === 1 ? '' : 's'}` : ''}${s.sound ? '' : ' · no sound'}`; }
      if (sub === 'step') { T().step(Math.round(Number(rest) || 1)); await settle(); return here(); }
      if (sub === 'go') { T().go(frameArg(rest || '0')); await settle(); return here(); }
      if (sub === 'cut') return T().ops.split(rest ? timeArg(rest) : undefined) ? `✂ ${parts()}` : 'Nothing to cut there (on a cut already, or a removed part).';
      if (sub === 'delete') return T().ops.del(rest ? timeArg(rest) : undefined) ? `Removed · ${parts()}` : 'Nothing plays there.';
      if (sub === 'restore') return T().ops.restore(rest ? timeArg(rest) : undefined) ? `Back in · ${parts()}` : 'That part already plays.';
      if (sub === 'speed') { const x = Number(String(w[1] || '').replace(/x$/i, '')); if (!(x >= 0.25 && x <= 4)) return 'A speed from 0.25 to 4.'; return T().ops.speed(x, w[2] ? timeArg(w[2]) : undefined) ? parts() : 'No part plays there.'; }
      if (sub === 'hold') { const s = Number(String(w[1] || '1').replace(/s$/i, '')) || 1; return T().ops.hold(s, w[2] ? timeArg(w[2]) : undefined) ? parts() : 'Nothing to hold there.'; }
      if (sub === 'clear') return T().ops.clear() ? 'The whole video plays again (Ctrl+Z brings the cut back).' : 'There\'s no cut.';
      if (sub === 'parts') return parts();
      if (sub === 'scenes') { const n = await T().cutAtScenes(SENS.includes(rest) ? rest : 'normal'); return n ? `✂ at ${n} shot change${n === 1 ? '' : 's'}\n${parts()}` : 'No shot changes found.'; }
      if (sub === 'cues') return `${T().cuesAtCuts()} cues at the cuts.`;
      if (sub === 'shots') return `${await T().cuesAtScenes(SENS.includes(rest) ? rest : 'normal')} cues at the shots.`;
      if (sub === 'editor') { await T().toEditor(); return null; }
      if (sub === 'sequence') { const k = await T().toSequence(rest || undefined); return k ? `Sequence "${String(k).slice(4)}" made from the Lab's cut.` : null; }
      if (sub === 'from') { if (!rest) return `Sequences: ${(await T().sequenceNames()).join(', ') || 'none'}`; const r = await T().fromSequence(rest); return `The cut of "${r.from}": ${r.parts} part${r.parts === 1 ? '' : 's'} of ${r.file}${r.other.length ? ` (its other files stay in the editor: ${r.other.join(', ')})` : ''}.`; }
      if (sub === 'check') { const r = await T().checkFrame(); return r.text; }
      if (sub === 'in' || sub === 'out') return T().ops.edge(sub, rest ? timeArg(rest) : undefined) ? parts() : 'No part to trim here.';
      if (sub === 'roll') { const k = Math.round(Number(rest) || 1); return T().ops.roll(k) ? parts() : 'No cut to move here.'; }
      if (sub === 'repeat') return T().ops.repeat() ? parts() : 'No part plays here.';
      if (sub === 'first' || sub === 'last') return T().ops.order(sub) ? parts() : 'No part plays here.';
      if (sub === 'mute') { const m = /^off$/i.test(rest) ? true : /^on$/i.test(rest) ? false : undefined; return T().ops.mute(m) ? `${parts()} (mute ${rest || 'toggled'})` : 'No part plays here.'; } // "mute off" = the part's sound off
      if (sub === 'edl') return `Saved ${base(await T().saveEdl())}.`;
      if (sub === 'copy') { const s2 = T().status(); T().copyText(`${s2.timecode} (f${s2.frame})`, s2.timecode); return `${s2.timecode} (f${s2.frame}) copied.`; }
      if (sub === 'still') { await T().stillHere(); return `Still at ${here()}.`; }
      if (sub === 'storyboard') { const r = await T().storyboard(); return `Storyboard of ${r.frames?.length || 0} frames.`; }
      // a bare frame or timecode: go there
      try { T().go(frameArg(args.trim())); await settle(); return here(); } catch { return `Try: ${FOOTAGE_SUBS.map(([v]) => v).join(', ')}.`; }
    } });

  // ---------- moving ----------
  reg({ name: 'shuttle', desc: 'Play the footage forward or backward at a speed (J / L), or stop on a whole frame (K)', args: '<-8…8|stop>', keys: 'J / K / L',
    complete: (a) => opts(['1', '2', '4', '-1', '-2', '-4', 'stop'], a),
    run: async (args) => {
      await need(); const a = words(args)[0] || 'stop';
      if (/^stop|0|k$/i.test(a)) { T().shuttle(0); await settle(); return `Stopped · ${here()}`; }
      const x = Number(a); if (!Number.isFinite(x) || !x) return 'A speed: 1, 2, 4, -1 (backward)… or stop.';
      const dir = Math.sign(x); let s = 0; for (let k = 1; k <= Math.min(8, Math.abs(x)); k *= 2) s = T().shuttle(dir);
      return `${s > 0 ? '▶' : '◀'} ${Math.abs(s)}×`;
    } });
  reg({ name: 'loop-frames', desc: 'Loop N frames from the playhead (footage), e.g. 12 or 24', args: '<frames>', complete: (a) => opts(['6', '12', '24', '48'], a),
    run: async (args) => { await need(); const n = Math.max(2, Math.round(Number(words(args)[0]) || 24)); T().loopFrames(n); return `Looping ${n} frames from ${here()}.`; } });
  reg({ name: 'edit-points', desc: 'The footage\'s edit points as timecodes: cuts, cues, loop edges (↑ / ↓ jump between them)', keys: '↑ / ↓',
    run: async () => { await need(); const c = T().clock; const P = T()._pure; const cues = ThreeLab.director.media.cues || []; const lines = [...(T().parts || []).filter((p) => !p.hold).flatMap((p, i) => [`✂ part ${i + 1} in  f${P.frameAt(c, p.a)} · ${P.tc(c, P.frameAt(c, p.a))}`, `✂ part ${i + 1} out f${P.frameAt(c, p.b)} · ${P.tc(c, P.frameAt(c, p.b))}`]), ...cues.map((x) => `◆ ${x.name} f${P.frameAt(c, x.time)} · ${P.tc(c, P.frameAt(c, x.time))}`)]; return lines.length ? lines.join('\n') : 'No cuts or cues yet.'; } });
  reg({ name: 'frame-display', aliases: ['time-display'], desc: 'What the Lab\'s time box shows on footage: timecode · frame, frames, or seconds (T cycles)', args: '<tc|frames|seconds>', keys: 'T', complete: (a) => opts(['tc', 'frames', 'seconds'], a),
    run: async (args) => { await lab(); const d = T().setDisplay(words(args)[0] || 'tc'); return d ? `Time as ${d}.` : 'tc, frames or seconds.'; } });
  reg({ name: 'frame-read', aliases: ['read-frame'], desc: 'The exact frame of the footage at the playhead as a picture (add "chat" to attach it here)', args: '[chat]', complete: (a) => opts(['chat'], a),
    run: async (args, ctx) => {
      await need(); const r = await T().readFrame({ show: !/chat/.test(args) });
      if (/chat/.test(args) && r.path && ctx?.agentId && typeof Native !== 'undefined') Native.attachPaths(ctx.agentId, [r.path]);
      return `f${r.frame} · ${r.timecode}${/chat/.test(args) ? ' (attached)' : ''}`;
    } });

  // ---------- the cut list ----------
  reg({ name: 'cut-here', aliases: ['footage-cut'], desc: 'Cut the Lab\'s footage at the playhead or a frame (S): the sketch plays the parts, the editor sees the same cut', args: '[frame]', keys: 'S', examples: ['/cut-here', '/cut-here f48'],
    run: async (args) => { await need(); return T().ops.split(args.trim() ? timeArg(args.trim()) : undefined) ? `✂\n${parts()}` : 'Nothing to cut there.'; } });
  reg({ name: 'cut-restore', desc: 'Put the removed part of the footage under the playhead (or a frame) back (Shift+Delete)', args: '[frame]', keys: 'Shift+Delete',
    run: async (args) => { await need(); return T().ops.restore(args.trim() ? timeArg(args.trim()) : undefined) ? parts() : 'That part already plays.'; } });
  reg({ name: 'cut-clear', desc: 'The whole footage plays again (the cut goes; Ctrl+Z brings it back)', run: async () => { await need(); return T().ops.clear() ? 'Cut cleared.' : 'There\'s no cut.'; } });
  reg({ name: 'cut-keep', desc: 'Keep only a range of the footage (the loop by default): everything else is skipped', args: '[from] [to]', examples: ['/cut-keep', '/cut-keep f24 f96'],
    run: async (args) => { await need(); const w = words(args); const lp = ThreeLab.director.media.loop; const a = w[0] ? timeArg(w[0]) : lp?.a; const b = w[1] ? timeArg(w[1]) : lp?.b; if (a == null || b == null) return 'Give two frames, or set a loop first ([ and ]).'; return T().ops.keepOnly(a, b) ? parts() : 'Nothing changed.'; } });
  reg({ name: 'cut-range', desc: 'Remove a range of the footage (the loop by default)', args: '[from] [to]',
    run: async (args) => { await need(); const w = words(args); const lp = ThreeLab.director.media.loop; const a = w[0] ? timeArg(w[0]) : lp?.a; const b = w[1] ? timeArg(w[1]) : lp?.b; if (a == null || b == null) return 'Give two frames, or set a loop first.'; return T().ops.cutRange(a, b) ? parts() : 'Nothing to remove there.'; } });
  reg({ name: 'cut-scenes', aliases: ['cut-shots'], desc: 'Cut the footage at every shot change (found exactly by the frame reader)', args: '[gentle|normal|sensitive]', complete: (a) => opts(SENS.slice(0, 3), a),
    run: async (args) => { await need(); const n = await T().cutAtScenes(SENS.includes(args.trim()) ? args.trim() : 'normal'); return n ? `✂ ${n}\n${parts()}` : 'No shot changes found.'; } });
  reg({ name: 'cut-bars', desc: 'Cut the footage on every bar (or beat / 2 bars) of its own sound', args: '[bar|beat|2bars]', complete: (a) => opts(['bar', 'beat', '2bars'], a),
    run: async (args) => { await need(); if (!ThreeLab.director.media.analysis) return 'This footage has no sound to find a beat in.'; const n = T().cutOnBeats(words(args)[0] || 'bar'); return n ? `✂ ${n}\n${parts()}` : 'No beats found.'; } });
  reg({ name: 'lab-cuts', aliases: ['footage-parts'], desc: 'The Lab footage\'s cut, part by part (frames, timecodes, speeds, held frames)', run: async () => { await need(); return parts(); } });
  reg({ name: 'footage-scenes', aliases: ['shot-cues'], desc: 'A cue at every shot of the footage (exact frames)', args: '[gentle|normal|sensitive|every]', complete: (a) => opts(SENS, a),
    run: async (args) => { await need(); return `${await T().cuesAtScenes(SENS.includes(args.trim()) ? args.trim() : 'normal')} cues.`; } });
  reg({ name: 'footage-editor', desc: 'Open the Lab footage\'s cut in the video editor (the same cut, frame by frame, with every editor tool)', run: async () => { await need(); await T().toEditor(); return null; } });
  reg({ name: 'footage-sequence', desc: 'Copy the Lab footage\'s cut (and its cues as markers) into a new editor sequence', args: '[name]', run: async (args) => { await need(); const k = await T().toSequence(args.trim() || undefined); return k ? `Sequence "${String(k).slice(4)}".` : null; } });
  reg({ name: 'footage-back', desc: 'Take an editor sequence\'s cut back into the Lab (its clips of the footage become the Lab\'s parts)', args: '<sequence>',
    complete: (a) => { try { return opts((VideoCut.sequences?.() || []).map((s) => s.name), a); } catch { return []; } },
    run: async (args) => { await lab(); if (!args.trim()) return `Sequences: ${(await T().sequenceNames()).join(', ') || 'none'}`; const r = await T().fromSequence(args.trim()); return `${r.parts} part${r.parts === 1 ? '' : 's'} of ${r.file} from "${r.from}".`; } });

  // ---------- references: exact readings, pacing (the vibe, not the footage) ----------
  reg({ name: 'ref-frames', aliases: ['ref-read'], desc: 'Read a reference clip exactly (Lab references or board clips): contact sheet, scenes, motion, pacing, vibe', args: '<clip> [sheet|scenes|motion|pacing|vibe]',
    complete: (a) => { const w = words(a); return w.length > 1 ? opts(['sheet', 'scenes', 'motion', 'pacing', 'vibe'], w.at(-1)) : refSoon(a); },
    run: async (args) => {
      const w = words(args); const mode = ['sheet', 'scenes', 'motion', 'pacing', 'vibe'].includes(w.at(-1)) ? w.pop() : 'sheet';
      const r = await T().findRef(w.join(' ')); if (!r) return `No reference clip. ${(await refList()).map((x) => x.value).join(', ') || 'Add one in the Lab\'s 🖼 References or on the board.'}`;
      await T().readFootage(mode, r.path); return null;
    } });
  reg({ name: 'match-pacing', aliases: ['pace-like'], desc: 'Cues at a reference clip\'s rhythm (its cuts, fitted to the loop / footage / song, its own shot lengths, or on the beat); "cut" also cuts the footage to it. The vibe, never its footage.', args: '[clip] [fit|seconds|beats] [cut]',
    examples: ['/match-pacing', '/match-pacing teaser beats', '/match-pacing teaser fit cut'],
    complete: (a) => { const w = words(a); return w.length > 1 ? opts(['fit', 'seconds', 'beats', 'cut'], w.at(-1)) : refSoon(a); },
    run: async (args) => {
      await lab(); const w = words(args); const cut = w.includes('cut'); const mode = w.find((x) => ['fit', 'seconds', 'beats'].includes(x)) || 'fit';
      const name = w.filter((x) => !['fit', 'seconds', 'beats', 'cut'].includes(x)).join(' ');
      const r = await T().findRef(name); if (!r) return `No reference clip${name ? ` "${name}"` : ''}. ${(await refList()).map((x) => x.value).join(', ')}`;
      const m = await T().matchPacing(r.path, mode, { cut, name: r.name });
      return `${m.cues} pace cues from **${m.file}** (${m.shots} shots, ${m.averageShot} s average, ${m.cutsPerMinute} cuts a minute: ${m.words})${cut ? ' · footage cut to it' : ''}.`;
    } });
  reg({ name: 'ref-motion', desc: 'A reference clip\'s motion energy as keyframes on a slider of the selected layer (busy = high)', args: '<clip> <slider>',
    complete: (a) => (words(a).length > 1 ? [] : refSoon(a)),
    run: async (args) => {
      await lab(); const w = words(args); if (w.length < 2) return 'Name the clip and the slider: /ref-motion teaser speed';
      const slider = w.pop(); const r = await T().findRef(w.join(' ')); if (!r) return 'No such reference clip.';
      const x = await T().motionToSlider(r.path, slider); return `${x.layer}.${x.property}: ${x.keyframes} keys from ${r.name}'s motion.`;
    } });

  // ---------- the editor's frame commands, on the Lab's footage ----------
  const SHARED = [
    { name: 'goto-frame', desc: 'Go to an exact frame of the Lab\'s footage', args: '<frame|timecode|time>', run: async (args) => { await need(); T().go(frameArg(words(args)[0] || '0')); await settle(); const r = await T().checkFrame(); return `${here()}${r.ok ? ' ✓ on screen' : ` (the sketch shows f${r.presented})`}`; } },
    { name: 'frame-step', desc: 'Step the Lab\'s footage N frames', args: '<frames>', run: async (args) => { await need(); T().step(Math.round(Number(words(args)[0]) || 1)); await settle(); return here(); } },
    { name: 'frame-check', desc: 'Which footage frame the sketch\'s video shows (requestVideoFrameCallback)', run: async () => { await need(); return (await T().checkFrame()).text; } },
    { name: 'cut-delete', desc: 'Remove the footage part under the playhead (the sketch skips it)', args: '[frame]', run: async (args) => { await need(); return T().ops.del(args.trim() ? timeArg(args.trim()) : undefined) ? parts() : 'Nothing plays there.'; } },
    { name: 'clip-speed', desc: 'Speed of the footage part under the playhead', args: '<x>', run: async (args) => { await need(); const x = Number(String(words(args)[0] || '').replace(/x$/i, '')); if (!(x >= 0.25 && x <= 4)) return 'A speed from 0.25 to 4.'; return T().ops.speed(x) ? parts() : 'No part plays there.'; } },
    { name: 'hold-frame', desc: 'Hold the footage frame at the playhead for N seconds', args: '[seconds]', run: async (args) => { await need(); const s = parseFloat(words(args).find((x) => /^\d*\.?\d+s?$/.test(x)) || '1'); return T().ops.hold(s) ? parts() : 'Nothing to hold there.'; } },
    { name: 'markers-at-cuts', desc: 'A cue at every cut of the Lab\'s footage', run: async () => { await need(); return `${T().cuesAtCuts()} cues.`; } },
  ];
  for (const d of SHARED) defs.push({ ...d, when: (ctx) => footageHere(ctx), whenLabel: 'in the Lab with footage', shared: true });

  // Ctrl+K: the footage's main moves (each also a command and a menu entry)
  const palette = () => {
    const three = typeof Tools !== 'undefined' && Tools.get?.('three');
    if (!three) return false;
    if (three.footagePalette) return true;
    const run = (line) => () => Commands.tryRun(line, H.claudeAgent()?.id);
    const mine = [
      { label: 'Lab footage: go to a frame or timecode…', run: () => T().askGoto() },
      { label: 'Lab footage: the frames menu', run: () => showMenu(innerWidth / 2 - 140, innerHeight / 3, T().menuItems()) },
      { label: 'Lab footage: cut here (S)', run: run('/cut-here') },
      { label: 'Lab footage: remove the part here (Delete)', run: run('/cut-delete') },
      { label: 'Lab footage: cut at every shot', run: run('/cut-scenes') },
      { label: 'Lab footage: a cue at every shot', run: run('/footage-scenes') },
      { label: 'Lab footage: contact sheet (exact frames)', run: run('/footage sheet') },
      { label: 'Lab footage: storyboard of the cut', run: run('/footage storyboard') },
      { label: 'Lab footage: open the cut in the video editor', run: run('/footage-editor') },
      { label: 'Lab footage: match a reference clip\'s pacing', run: run('/match-pacing') },
    ];
    // the Lab's list is a getter (built when the palette opens): ours go after it
    const desc = Object.getOwnPropertyDescriptor(three, 'commands');
    const before = desc?.get ? () => desc.get.call(three) : () => desc?.value || [];
    Object.defineProperty(three, 'commands', { get: () => [...before(), ...mine], configurable: true, enumerable: true });
    three.footagePalette = true;
    return true;
  };
  if (!palette()) addEventListener('DOMContentLoaded', () => { if (!palette()) addEventListener('load', palette, { once: true }); }, { once: true });

  for (const d of defs) {
    const { shared, ...def } = d;
    if (!shared && Commands.get(def.name)) { console.warn(`three-frames-cmds: /${def.name} is taken, skipped`); continue; }
    Commands.register({ area: AREA, ...def, aliases: (def.aliases || []).filter((a) => !Commands.get(a)) });
  }
})();
