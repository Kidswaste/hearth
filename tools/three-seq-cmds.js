// Chat commands for the Lab's Sequence (tools/three-seq.js): build a video timeline of scenes, footage, titles and
// the song right in the Three.js Lab, play it in the preview, finish it in the video editor, render it. One command
// with plain sub-commands (/sequence add Rings at bar 9), two shortcuts for what you'd do most (/add-scene,
// /sequence-render). Area "Three.js Lab" (/help sequence). Ctrl+K actions at the bottom.
(() => {
  const AREA = 'Three.js Lab';
  const Q = () => ThreeSeq;
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, q) => { const s = String(q || '').toLowerCase(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => String(x.value).toLowerCase().includes(s)).slice(0, 14); };
  const lab = async () => { await ThreeLab.cmd({ show: true }); return Q(); };
  const names = () => (ThreeLab.scenes?.all() || []).map((s) => s.name);
  const lines = (st) => (st.sequence ? `**${st.sequence}** · ${st.format} · ${st.seconds.toFixed(2)} s (${st.frames} frames)\n${st.clips.join('\n') || '(empty: /sequence add <scene>)'}` : st.note);
  // "Rings at bar 9 for 4 bars look Neon" → { scene, at, bars, secs, look }
  function parseAdd(rest) {
    const s = String(rest || '');
    const m = (re) => { const x = re.exec(s); return x ? x[1].trim() : null; };
    const at = m(/\bat\s+((?:bar\s*)?[\w:.;]+)/i);
    const bars = m(/\bfor\s+(\d+(?:\.\d+)?)\s*bars?\b/i);
    const secs = m(/\bfor\s+(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\b/i);
    const look = m(/\blook\s+(.+?)(?=\s+(?:at|for)\b|$)/i);
    const scene = s.replace(/\bat\s+(?:bar\s*)?[\w:.;]+/i, '').replace(/\bfor\s+\d+(?:\.\d+)?\s*(?:bars?|s(?:ec(?:onds?)?)?)\b/i, '').replace(/\blook\s+.+?(?=\s+(?:at|for)\b|$)/i, '').trim();
    return { scene: scene || null, at, bars: bars ? Number(bars) : null, secs: secs ? Number(secs) : null, look };
  }
  const SUBS = [
    ['', 'Show / hide the sequence on the Lab timeline'], ['status', 'The clips, format, length, playhead'], ['list', 'Your Lab sequences'], ['new', 'new [name] [9:16|16:9|1:1|4:5]'],
    ['open', 'open <name>'], ['add', 'add <scene | this> [at bar 9 | at 4.5 | at f120] [for 4 bars | for 3 s] [look <name>]'], ['footage', 'footage <path> [at …]'],
    ['title', 'title <text> [at …]'], ['overlay', 'overlay <layer or filter name> [at …]'], ['song', 'song <path>: the sequence\'s music'], ['transition', 'transition <dissolve|dip-black|wipe-left|cut…> [clip n]'],
    ['length', 'length <clip n> <4 bars | 3 s>'], ['look', 'look <clip n> <look name | none>'], ['split', 'split [at …]: at the playhead'], ['delete', 'delete <clip n> [ripple]'],
    ['move', 'move <clip n> <position>'], ['duplicate', 'duplicate <clip n>'], ['fit', 'Every cut on a bar of the song'], ['format', 'format <9:16|16:9|1:1|4:5>'],
    ['play', 'Play it in the preview'], ['pause', 'Pause'], ['go', 'go <time | f120 | 00:00:04:12 | bar 9>'], ['render', 'render [9:16|16:9|1:1|4:5|all|realtime]'],
    ['editor', 'Finish it in the video editor (the same sequence)'], ['back', 'Back from the editor'], ['undo', 'Undo'], ['redo', 'Redo'], ['keys', 'The sequence keys'],
  ];
  const call = async (args) => { const r = await Q().handle('three_sequence', args); if (!r.ok) throw new Error(r.error); return r.value; };
  const clipArg = (w) => (/^\d+$/.test(w || '') ? Number(w) : w);
  Commands.register({
    name: 'sequence', aliases: ['seq'], area: AREA, args: '[add|title|transition|render|editor|…]',
    desc: 'The Lab sequence: a video timeline of your scenes, footage, titles and the song, played in the preview (no args: show / hide it)',
    keywords: 'timeline video edit scenes clips montage storyboard cut transitions render reel',
    examples: ['/sequence', '/sequence add Rings at bar 9', '/sequence transition dip-black 2', '/sequence render 9:16'],
    complete: (a) => {
      const w = words(a);
      if (w.length <= 1 && !/\s$/.test(a || '')) return opts(SUBS.filter(([v]) => v).map(([value, hint]) => ({ value, hint })), w[0]);
      if (/^add$/i.test(w[0])) return opts(['this', ...names()].map((n) => `add ${n}`), a);
      if (/^transition$/i.test(w[0])) return opts(['dissolve', 'dip-black', 'dip-white', 'wipe-left', 'push-left', 'zoom-in', 'whip-left', 'glitch', 'cut'].map((t) => `transition ${t}`), a);
      if (/^(render|format|new)$/i.test(w[0])) return opts(['9:16', '16:9', '1:1', '4:5', ...(/^render$/i.test(w[0]) ? ['all', 'realtime'] : [])].map((f) => `${w[0]} ${f}`), a);
      return [];
    },
    run: (args, ctx) => runSeq(args, ctx),
  });
  async function runSeq(args, ctx) {
    {
      await lab();
      const w = words(args); const sub = (w[0] || '').toLowerCase(); const rest = w.slice(1).join(' ');
      if (!sub) { await Q().toggle(); return Q().active ? `Sequence **${Q().key.slice(4)}** on the Lab timeline: ＋ adds scenes, ⇪ renders · /help sequence` : 'Back to the scene.'; }
      if (sub === 'status' || sub === 'read') return lines(await call({ op: 'status' }));
      if (sub === 'list') { const l = await Q().list(); return l.length ? l.map((x) => `• ${x.name} · ${x.format} · ${x.seconds.toFixed(1)} s · ${x.clips} clips`).join('\n') : 'No Lab sequence yet: /sequence new'; }
      if (sub === 'new') { const fmt = w.find((x) => /^\d+:\d+$/.test(x)); const name = w.slice(1).filter((x) => x !== fmt).join(' ') || null; return lines(await call({ op: 'new', name, format: fmt })); }
      if (sub === 'open') return lines(await call({ op: 'open', name: rest }));
      if (sub === 'add') {
        const p = parseAdd(rest);
        const sc = p.scene && /^(this|current|here)$/i.test(p.scene) ? null : p.scene;
        return lines(await call({ op: 'add', scene: sc || undefined, at: p.at || undefined, bars: p.bars ?? undefined, secs: p.secs ?? undefined, look: p.look || undefined }));
      }
      if (sub === 'footage') { const p = parseAdd(rest); return lines(await call({ op: 'add', footage: p.scene, at: p.at || undefined, secs: p.secs ?? undefined })); }
      if (sub === 'title') { const p = parseAdd(rest); return lines(await call({ op: 'add', title: p.scene || 'Title', at: p.at || undefined, secs: p.secs ?? undefined })); }
      if (sub === 'overlay') { const p = parseAdd(rest); return lines(await call({ op: 'add', overlay: p.scene, at: p.at || undefined, secs: p.secs ?? undefined, bars: p.bars ?? undefined })); }
      if (sub === 'song') return lines(await call({ op: 'add', song: rest }));
      if (sub === 'transition' || sub === 'trans') { const type = w[1] || 'dissolve'; const clip = w.slice(2).find((x) => /^\d+$/.test(x)); const dur = w.slice(2).find((x) => /^\d*\.\d+s?$|^\d+s$/.test(x)); const v = await call({ op: 'transition', type, clip: clip ? Number(clip) : undefined, dur: dur ? parseFloat(dur) : undefined }); return `Transition: ${v.transition}\n${v.clips.join('\n')}`; }
      if (sub === 'length') { const n = clipArg(w[1]); const len = w.slice(2).join(' '); const bars = /bar/i.test(len) ? parseFloat(len) : undefined; return lines(await call({ op: 'length', clip: n, bars, secs: bars == null ? parseFloat(len) : undefined })); }
      if (sub === 'look') return lines(await call({ op: 'look', clip: clipArg(w[1]), name: /^none$/i.test(w.slice(2).join(' ')) ? null : w.slice(2).join(' ') }));
      if (sub === 'split') return lines(await call({ op: 'split', at: parseAdd(rest).at || undefined }));
      if (sub === 'delete') return lines(await call({ op: 'delete', clip: clipArg(w[1]), ripple: /ripple/i.test(rest) }));
      if (sub === 'move') return lines(await call({ op: 'move', clip: clipArg(w[1]), to: Number(w[2]) }));
      if (sub === 'duplicate') return lines(await call({ op: 'duplicate', clip: clipArg(w[1]) }));
      if (sub === 'fit') return lines(await call({ op: 'fit' }));
      if (sub === 'format') return lines(await call({ op: 'format', format: w[1] }));
      if (sub === 'play' || sub === 'pause') { await call({ op: sub }); return sub === 'play' ? 'Playing the sequence.' : 'Paused.'; }
      if (sub === 'go' || sub === 'seek') { const v = await call({ op: 'seek', at: rest }); return `${v.timecode} · f${v.frame} · ${v.showing}`; }
      if (sub === 'render') {
        if (/^all$/i.test(w[1] || '')) { const out = []; for (const f of ['9:16', '16:9', '1:1', '4:5']) out.push((await Q().render({ format: f })).path); return `Rendered ${out.length} formats into Video Review:\n${out.map((p) => `• ${p}`).join('\n')}`; }
        const r = await Q().render({ format: /^\d+:\d+$/.test(w[1] || '') ? w[1] : null, realtime: /^realtime$/i.test(w[1] || '') });
        return `Rendered **${r.path.split(/[\\/]/).pop()}**${r.frames ? ` (${r.frames} frames, ${r.w}×${r.h})` : ''}: it's in Video Review.`;
      }
      if (sub === 'editor') { await call({ op: 'editor' }); return 'The sequence is open in the video editor (the same edit): finish it there, /sequence back brings it to the Lab.'; }
      if (sub === 'back') return lines(await call({ op: 'back' }));
      if (sub === 'undo' || sub === 'redo') return lines(await call({ op: sub }));
      if (sub === 'keys') return Q().KEYS.map(([k, d]) => `\`${k}\` ${d}`).join('\n');
      // a scene name on its own: add it
      if (names().some((n) => n.toLowerCase() === String(args).trim().toLowerCase())) return lines(await call({ op: 'add', scene: String(args).trim() }));
      ctx?.say?.(`Unknown: ${sub}`);
      return SUBS.map(([v, d]) => `/sequence ${v} — ${d}`).join('\n');
    }
  }
  Commands.register({
    name: 'add-scene', area: AREA, args: '[scene] [at bar 9] [for 4 bars] [look <name>]',
    desc: 'Put a scene (this one, or another sketch / chat scene) on the Lab sequence',
    keywords: 'sequence timeline clip scene add montage', examples: ['/add-scene', '/add-scene Rings at bar 9'],
    complete: (a) => opts(['this', ...names()], a),
    run: async (args) => { await lab(); const p = parseAdd(args); const sc = p.scene && !/^(this|current|here)$/i.test(p.scene) ? p.scene : undefined; return lines(await call({ op: 'add', scene: sc, at: p.at || undefined, bars: p.bars ?? undefined, secs: p.secs ?? undefined, look: p.look || undefined })); },
  });
  Commands.register({
    name: 'sequence-render', area: AREA, args: '[9:16|16:9|1:1|4:5|all]',
    desc: 'Render the Lab sequence frame by frame (with its sound) into Video Review',
    keywords: 'export video mp4 reel tiktok shorts render sequence', examples: ['/sequence-render 9:16'],
    complete: (a) => opts(['9:16', '16:9', '1:1', '4:5', 'all'], a),
    run: (args, ctx) => runSeq(`render ${String(args || '').trim()}`, ctx),
  });
  if (typeof AppUI !== 'undefined') {
    AppUI.addAction('Lab: Sequence (show / hide)', () => ThreeLab.cmd({ show: true }).then(() => Q().toggle()));
    AppUI.addAction('Lab: Add this scene to the sequence', () => ThreeLab.cmd({ show: true }).then(() => Q().addCurrent()));
    AppUI.addAction('Lab: Render the sequence 9:16', () => ThreeLab.cmd({ show: true }).then(() => Q().render({ format: '9:16' })));
    AppUI.addAction('Lab: Finish the sequence in the video editor', () => ThreeLab.cmd({ show: true }).then(() => Q().toEditor()));
  }
})();
