// Chat commands for the Three.js Lab: everything you do in the Lab, typed in a chat (the docked Three Director's
// above all). /help lab lists them. Each command opens the Lab if needed and answers with a short note.
//   /size 9:16 · /freeze · /shuffle Colors wild · /save · /look Drop · /bpm 128 · /live system · /loop 0:32 0:48 …
(() => {
  const AREA = 'Three.js Lab';
  const lab = async (show = true) => { const c = await ThreeLab.cmd({ show }); await c.waitSong?.(); return c; };
  const peek = () => ThreeLab.peek?.() || null;
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const pick = (list, q) => { const s = String(q || '').toLowerCase(); return list.filter((x) => String(x.value ?? x).toLowerCase().includes(s)).slice(0, 14).map((x) => (typeof x === 'string' ? { value: x } : x)); };
  const onOff = (s) => (/^(on|yes|1|true|show)$/i.test(s) ? true : /^(off|no|0|false|hide)$/i.test(s) ? false : undefined);
  const { parseTime, fmtMs } = ThreeMedia._test;
  const time = (s) => { const t = parseTime(String(s || '').replace(/s$/, '')); if (!Number.isFinite(t)) throw new Error(`"${s}" isn't a time (m:ss.mmm or seconds)`); return t; };
  const reg = (name, desc, args, run, complete, extra = {}) => Commands.register({ name, desc, args, area: AREA, run, complete, ...extra });
  const sliderNames = () => (peek()?.sliders() || []).map((x) => ({ value: x.label, hint: x.group || '' }));
  const lookNames = () => { try { return peek()?.looks() || []; } catch { return []; } };
  const groupNames = () => { try { return peek()?.groups() || []; } catch { return []; } };
  // "glow strength 2.5" → { name: 'glow strength', rest: ['2.5'] }, splitting at the first word in `keys` (or the last n words)
  function splitName(args, { keys = null, tail = 1 } = {}) {
    const w = words(args);
    let at = keys ? w.findIndex((x) => keys.includes(x.toLowerCase())) : Math.max(1, w.length - tail);
    if (at < 0) at = w.length;
    return { name: w.slice(0, at).join(' '), rest: w.slice(at) };
  }

  // ---------- the Lab, its tools, running ----------
  reg('lab', 'Open the Three.js Lab (or one of its tools: model, shader, textures, docs, color, easing)', '[tool]', async (args) => {
    const id = args ? ThreeLab.toolTabs().find((t) => t.id.startsWith(args.toLowerCase()) || t.label.toLowerCase().includes(args.toLowerCase()))?.id : 'sketch';
    if (args && !id) return `No tool "${args}". Tools: ${ThreeLab.toolTabs().map((t) => t.id).join(', ')}`;
    await lab(); ThreeLab.showTab(id || 'sketch');
    return null;
  }, (a) => pick(ThreeLab.toolTabs().map((t) => ({ value: t.id, hint: t.label })), a));
  reg('lab-tools', 'The Lab\'s secondary tools (model viewer, shaders, textures, docs, color, easing)', '', () => ThreeLab.toolTabs().map((t) => `- \`/lab ${t.id}\` ${t.label}: ${t.hint}`).join('\n'));
  reg('lab-state', 'What the Lab shows now: sketch, layer, frame size, song, BPM, live sound', '', async () => {
    const s = (await lab(false)).state;
    return `**${s.sketch}** · layer ${s.layer} · ${s.frame.id === 'fit' ? `fit ${s.frame.width}×${s.frame.height}` : `${s.frame.id} ${s.frame.width}×${s.frame.height}`}${s.frozen ? ' · ❚❚ frozen' : ''}${s.song ? ` · ♪ ${s.song.split(/[\\/]/).pop()}${s.playing ? ' (playing)' : ''}` : ''}${s.bpm ? ` · ${Math.round(s.bpm * 100) / 100} BPM` : ''}${s.live ? ` · live ${s.live}` : ''}`;
  }, null, { aliases: ['lab-status'] });
  reg('run', 'Run the sketch again from the start', '', async () => { (await lab()).run(); });
  reg('restart-sketch', 'Restart the simulation from scratch (fresh page, GPU and sound)', '', async () => { (await lab()).restart(); });
  reg('lab-keys', 'Show every Lab key', '', async () => { (await lab()).keys(); });

  // ---------- sliders ----------
  reg('save-sliders', 'Save the selected layer\'s slider values into its code (Ctrl+S)', '', async () => { const n = (await lab()).save(); return n ? `Saved ${n} slider change${n === 1 ? '' : 's'} into the code.` : 'Nothing to save: the sliders match the code.'; }, null, { aliases: ['ss'] });
  const AMOUNT = { subtle: 0.1, small: 0.1, normal: 0.35, medium: 0.35, bold: 0.6, big: 0.6, wild: 1, total: 1, random: 1 };
  const SCOPES = ['all', 'favs', 'colors', 'numbers', 'changed', 'visible', 'one'];
  reg('shuffle', 'Shuffle the sliders: a group or kind (colors, numbers, favs, changed), how far (subtle / normal / bold / wild or 0–1), a seed', '[group|colors|numbers|favs] [subtle|normal|bold|wild|0.5] [seed N]', async (args) => {
    const c = await lab();
    const w = words(args);
    const o = {};
    if (/^palette$/i.test(args.trim())) return c.paletteColors() ? '🎨 Colors from the palette (/unshuffle-free: ↶ in the panel undoes)' : null;
    const si = w.findIndex((x) => x.toLowerCase() === 'seed');
    if (si >= 0) { o.seed = Number(w[si + 1]); w.splice(si, 2); }
    const ai = w.findIndex((x) => AMOUNT[x.toLowerCase()] != null || /^(0?\.\d+|1(\.0+)?|\d{1,3}%)$/.test(x));
    if (ai >= 0) { const x = w[ai].toLowerCase(); o.amount = AMOUNT[x] ?? (x.endsWith('%') ? Number(x.slice(0, -1)) / 100 : Number(x)); w.splice(ai, 1); }
    const rest = w.join(' ');
    if (rest) {
      const sc = SCOPES.find((x) => x.startsWith(rest.toLowerCase()));
      const g = c.groups().find((x) => x.toLowerCase() === rest.toLowerCase()) || c.groups().find((x) => x.toLowerCase().includes(rest.toLowerCase()));
      if (sc) o.scope = sc; else if (g) o.scope = `group:${g}`; else return `No group "${rest}". Groups: ${c.groups().join(', ') || 'none'}; or colors, numbers, favs, changed.`;
    }
    const seed = c.shuffle(o);
    return seed == null ? null : `🎲 Shuffled${o.scope ? ` ${o.scope.replace('group:', '')}` : ''}${o.amount != null ? ` (${Math.round(o.amount * 100)}%)` : ''} · seed ${seed} · /unshuffle goes back, /save keeps it`;
  }, (a) => pick([...groupNames(), ...SCOPES, 'palette', ...Object.keys(AMOUNT), 'seed'], words(a).pop() || ''), { aliases: ['dice'] });
  reg('tame', 'Halfway back to the code: every slider you changed moves half the way back (after a wild shuffle)', '[0–1]', async (args) => { const n = (await lab()).tame(Number(args) || 0.5); return `${n} slider${n === 1 ? '' : 's'} tamed`; });
  reg('exaggerate', 'Push every change further from the code (×1.5, or the factor you give)', '[factor]', async (args) => { const n = (await lab()).tame(Number(args) || 1.5); return `${n} slider${n === 1 ? '' : 's'} pushed further`; });
  reg('save-one', 'Save just one slider into the code (your other changes stay live)', '<slider>', async (args) => `💾 ${(await lab()).saveOne(args).label} saved into the code`, (a) => pick(sliderNames(), a));
  reg('tweak-code', 'Copy the sliders as tweak() code with their current values', '', async () => { const t = (await lab()).tweakCode(); navigator.clipboard.writeText(t).catch(() => {}); return `\`\`\`js\n${t}\n\`\`\``; });
  reg('unshuffle', 'Back to the shuffle before (Shift+R)', '', async () => { (await lab()).shuffleStep(-1); }, null, { aliases: ['shuffle-back'] });
  reg('reshuffle', 'Forward to the next shuffle (or a new one)', '', async () => { (await lab()).shuffleStep(1); }, null, { aliases: ['shuffle-forward'] });
  reg('shuffle-mode', 'Set how /shuffle and R shuffle by default: amount and which sliders', '<subtle|normal|bold|wild> [all|colors|numbers|favs|<group>]', async (args) => {
    const c = await lab(); const w = words(args); const o = {};
    for (const x of w) { if (AMOUNT[x.toLowerCase()] != null) o.amount = AMOUNT[x.toLowerCase()]; else if (SCOPES.includes(x.toLowerCase())) o.scope = x.toLowerCase(); else { const g = c.groups().find((y) => y.toLowerCase() === x.toLowerCase()); if (g) o.scope = `group:${g}`; } }
    const s = c.setShuffle(o);
    return `Shuffle: ${Math.round(s.amount * 100)}% · ${s.scope.replace('group:', 'group ')}`;
  }, (a) => pick([...Object.keys(AMOUNT), ...SCOPES, ...groupNames()], words(a).pop() || ''));
  reg('slot', 'Recall a save slot (A, B, C), or save / clear it', '<A|B|C> [save|clear]', async (args) => {
    const [n0, act] = words(args); const n = String(n0 || '').toUpperCase();
    if (!['A', 'B', 'C'].includes(n)) return 'Use /slot A, /slot B save, /slot C clear';
    const c = await lab();
    const r = c.slot(n, act || 'recall');
    return act === 'save' ? null : act === 'clear' ? `Slot ${n} cleared` : r === false ? `Slot ${n} is empty: /slot ${n} save stores the current values` : `Slot ${n} recalled`;
  }, (a) => pick(['A', 'B', 'C', 'A save', 'B save', 'C save', 'A clear'], a));
  reg('morph', 'Morph the sliders between two save slots (0 = the first, 1 = the second); auto <bars> glides back and forth while it plays; swap', '<0–1 or %> [A-B|B-C|A-C] | auto <bars>|off | swap', async (args) => {
    const [t0, pr] = words(args);
    if (/^swap$/i.test(t0)) return (await lab()).swapSlots() ? 'Swapped A and B' : 'Save both slots first';
    if (/^auto$/i.test(t0)) { const b = /^off$/i.test(pr) ? 0 : Number(pr) || 4; const r = (await lab()).autoMorph(b); return r ? `Auto-morph every ${r} bar${r === 1 ? '' : 's'} while it plays` : 'Auto-morph off'; } const t = String(t0 || '').endsWith('%') ? Number(t0.slice(0, -1)) / 100 : Number(t0);
    if (!Number.isFinite(t)) return 'Give a position: /morph 0.5 (or 50%), optionally A-B, B-C or A-C';
    const pair = pr ? pr.toUpperCase().split(/[-↔/]/) : null;
    const ok = (await lab()).morph(t, pair);
    return ok ? null : 'Save both slots first (/slot A save, /slot B save)';
  }, (a) => pick(['0', '0.25', '0.5', '0.75', '1', '0.5 A-B', '0.5 B-C', 'auto 4', 'auto off', 'swap'], a));
  reg('look', 'Switch to a saved look; next / prev / random; morph <name>; save <name> / delete <name>; nothing: list them', '[name] | next | random | morph <name> | save [name] | delete <name>', async (args) => {
    const c = await lab(); const w = words(args);
    if (!w.length) { const l = c.looks(); return l.length ? `Looks: ${l.map((x) => `\`${x}\``).join(', ')}` : 'No looks yet: /look save <name> (or Shift+click Save)'; }
    if (w[0].toLowerCase() === 'save') { const name = c.saveLook(w.slice(1).join(' ')); return `Saved look "${name}"`; }
    if (w[0].toLowerCase() === 'delete') { c.deleteLook(w.slice(1).join(' ')); return 'Deleted'; }
    if (/^(next|prev|previous|random)$/i.test(w[0])) { const n = c.lookStep(/^next$/i.test(w[0]) ? 1 : /^random$/i.test(w[0]) ? 'random' : -1); return n ? `Look "${n}"` : 'No looks yet'; }
    if (w[0].toLowerCase() === 'morph') { const n = c.morphLook(w.slice(1).join(' ')); return n ? null : `No look "${w.slice(1).join(' ')}"`; }
    const name = c.look(args); return `Look "${name}"`;
  }, (a) => pick([...lookNames(), 'next', 'prev', 'random', 'morph', 'save', 'delete'], a), { aliases: ['looks'] });
  reg('save-look', 'Save the current slider values as a look (a quick name if you give none)', '[name]', async (args) => `Saved look "${(await lab()).saveLook(args)}"`);
  reg('reset-sliders', 'Put the selected layer\'s sliders back to the values in the code', '', async () => { (await lab()).resetSliders(); });
  reg('undo-sliders', 'Undo the last slider change', '', async () => { (await lab()).undoSliders(); });
  reg('copy-sliders', 'Copy every slider value (paste them into another layer or sketch)', '', async () => { (await lab()).copySliders(); return 'Slider values copied'; });
  reg('paste-sliders', 'Set sliders from copied values', '', async () => { const n = await (await lab()).pasteSliders(); return n.length ? `Pasted ${n.length} values` : null; });
  reg('slider', 'Set a slider by its name: /slider glow 2.5, /slider tint #ff3cac, /slider wire on', '<name> <value>', async (args) => {
    const { name, rest } = splitName(args);
    if (!name || !rest.length) return 'Use /slider <name> <value>';
    const v = rest[0]; const val = onOff(v) ?? (/^-?[\d.]+$/.test(v) ? Number(v) : v);
    const hit = (await lab()).setSlider(name, val);
    return hit ? `${hit.label} → ${v}` : 'That slider is locked';
  }, (a) => pick(sliderNames(), a));
  reg('knob', 'Move a slider to a position of its range, 0 to 1 (what a MIDI knob does)', '<name> <0–1>', async (args) => {
    const { name, rest } = splitName(args);
    const r = (await lab()).knob(name, Number(rest[0]));
    return `${r.label} → ${r.value}`;
  }, (a) => pick(sliderNames(), a));
  reg('lock-slider', 'Lock a slider at its value (shuffle, looks and resets leave it alone)', '<slider>', async (args) => `🔒 ${(await lab()).lock(args, true).label}`, (a) => pick(sliderNames(), a));
  reg('unlock-slider', 'Unlock a slider', '<slider>', async (args) => `🔓 ${(await lab()).lock(args, false).label}`, (a) => pick(sliderNames(), a));
  reg('fav-slider', 'Put a slider in ★ Favorites at the top', '<slider>', async (args) => `★ ${(await lab()).fav(args, true).label}`, (a) => pick(sliderNames(), a));
  const MOVES = ['lfo', 'walk', 'beat', 'pulse', 'section', 'off'];
  reg('move-slider', 'Make a slider move by itself: lfo (a wave), walk (drifts), beat (steps), pulse, section (quiet / loud parts) or off; rate in beats, depth in %', '<slider> <lfo|walk|beat|pulse|section|off> [beats] [depth%] [sine|tri|saw|square]', async (args) => {
    const { name, rest } = splitName(args, { keys: MOVES });
    const kind = (rest[0] || '').toLowerCase();
    if (!MOVES.includes(kind)) return `Use /move-slider <slider> ${MOVES.join('|')}`;
    const mo = kind === 'off' ? null : { kind };
    for (const x of rest.slice(1)) { if (/%$/.test(x)) mo.depth = Number(x.slice(0, -1)) / 100; else if (/^(sine|tri|saw|square)$/i.test(x)) mo.shape = x.toLowerCase(); else if (Number.isFinite(Number(x))) mo.rate = Number(x); }
    const hit = (await lab()).motion(name, mo);
    return kind === 'off' ? `${hit.label} stays still` : `${hit.label} moves: ${kind}${mo.rate ? ` every ${mo.rate} beat${mo.rate === 1 ? '' : 's'}` : ''}${mo.depth != null ? ` · ${Math.round(mo.depth * 100)}%` : ''}`;
  }, (a) => { const w = words(a); return w.length > 1 ? pick(MOVES.map((m) => `${w.slice(0, -1).join(' ')} ${m}`), a) : pick(sliderNames(), a); });
  const BANDS = ['kick', 'snare', 'hats', 'bassHit', 'hit', 'beat', 'bass', 'mid', 'treble', 'level', 'off'];
  reg('follow-music', 'Make a slider follow the music: kick, snare, hats, bass, mid, treble (highs), level (loudness), beat… or off', '<slider> <band> [amount -1…1]', async (args) => {
    const { name, rest } = splitName(args, { keys: [...BANDS.map((b) => b.toLowerCase()), 'highs', 'mids', 'loudness'] });
    let band = (rest[0] || '').toLowerCase(); band = { highs: 'treble', mids: 'mid', loudness: 'level', basshit: 'bassHit' }[band] || band;
    if (!BANDS.includes(band)) return `Use /follow-music <slider> ${BANDS.join('|')}`;
    const hit = (await lab()).follow(name, band === 'off' ? null : band, Number(rest[1] ?? 0.5));
    return band === 'off' ? `${hit.label} no longer follows the music` : `${hit.label} follows ${band}`;
  }, (a) => pick(sliderNames(), a));
  reg('midi-learn', 'Map a MIDI knob / fader to a slider (then turn it)', '<slider>', async (args) => { const h = (await lab()).learn(args); return `Turn a knob for ${h.label}`; }, (a) => pick(sliderNames(), a));
  reg('slider-group', 'Show one slider group (or all)', '<group|all>', async (args) => { const c = await lab(); const g = c.groups().find((x) => x.toLowerCase().includes(String(args).toLowerCase())); c.showGroup(/^all$/i.test(args) || !args ? '' : g || ''); return g || !args || /^all$/i.test(args) ? null : `No group "${args}". Groups: ${c.groups().join(', ')}`; }, (a) => pick(['all', ...groupNames()], a));
  reg('find-slider', 'Find sliders by name', '<text>', async (args) => { const n = (await lab()).find(args); return `${n} slider${n === 1 ? '' : 's'} match`; }, null);

  // ---------- the preview ----------
  const SIZE_WORDS = { vertical: '9:16', portrait: '9:16', story: '9:16', stories: '9:16', tiktok: '9:16', reels: '9:16', reel: '9:16', shorts: '9:16', landscape: '16:9', youtube: '16:9', yt: '16:9', wide: '16:9', square: '1:1', feed: '4:5', insta: '4:5', instagram: '4:5', portrait45: '4:5', fit: 'fit', '1080x1920': '9:16', '1920x1080': '16:9', '1080x1350': '4:5', '1080x1080': '1:1' };
  reg('size', 'Frame size: 9:16, 16:9, 4:5, 1:1, fit (or tiktok, youtube, square, feed, 21:9, 4:3, 2:3, 4k, 4k-v)', '<9:16|16:9|4:5|1:1|fit|…>', async (args) => {
    const id = SIZE_WORDS[String(args).toLowerCase().replace(/\s|×/g, (m) => (m === '×' ? 'x' : ''))] || String(args).toLowerCase();
    const wh = String(args).match(/^(\d{2,4})\s*[x×*]\s*(\d{2,4})$/i);
    if (wh && !SIZE_WORDS[id]) { const z0 = (await lab()).customSize(Number(wh[1]), Number(wh[2])); return `Your own size: ${z0.width}×${z0.height}`; }
    const z = (await lab()).size(id);
    return z.id === 'fit' ? 'Fit: fills the preview' : `${z.id} · ${z.width}×${z.height}`;
  }, (a) => pick(['9:16', '16:9', '4:5', '1:1', 'fit', '21:9', '4:3', '2:3', '4k', '4k-v', 'tiktok', 'youtube', 'square', 'feed'], a), { aliases: ['frame'] });
  reg('fit', 'Fit the picture to the preview (no exact size)', '', async () => { (await lab()).size('fit'); });
  reg('freeze', 'Freeze the picture (the music goes on); again to unfreeze; beat / bar: exactly on the next one', '[on|off|beat|bar]', async (args) => { if (/^(beat|bar|kick)$/i.test(args)) { const w = (await lab()).freezeOn(args.toLowerCase()); return `❚❚ Freezing on the next ${args.toLowerCase()}${w ? ` (in ${w.toFixed(2)} s)` : ''}`; } const on = (await lab()).freeze(onOff(args)); return on ? '❚❚ Frozen · /next-frame steps one frame · /onion pins it to compare' : '▶ Running'; }, (a) => pick(['on', 'off', 'beat', 'bar', 'kick'], a));
  reg('next-frame', 'One frame forward (freezes first)', '', async () => { (await lab()).step(); });
  reg('onion', 'Pin this frame and compare it with the live picture: pin, onion, wipe or off', '[pin|onion|wipe|off]', async (args) => { const r = await (await lab()).compare((args || 'pin').toLowerCase()); return r === 'off' ? 'Compare off' : null; }, (a) => pick(['pin', 'onion', 'wipe', 'off'], a), { aliases: ['compare-frame'] });
  reg('still', 'Save a still at the exact frame size (or one of 9:16, 16:9, 4:5, 1:1); "copy" puts it in the clipboard', '[9:16|16:9|4:5|1:1] [copy]', async (args) => {
    const w = words(args); const copy = w.some((x) => /^copy$/i.test(x)); const sz = w.find((x) => !/^copy$/i.test(x));
    await (await lab()).still({ size: sz ? (SIZE_WORDS[sz.toLowerCase()] || sz) : null, copy });
    return null;
  }, (a) => pick(['9:16', '16:9', '4:5', '1:1', 'copy'], a), null);
  reg('stills', 'A folder of PNG stills: at every cue (or across the song), or this frame in all four sizes', '<cues|sizes>', async (args) => { const n = await (await lab()).stills(/^size/i.test(args) ? 'sizes' : 'cues'); return n ? `${n} stills saved` : null; }, (a) => pick(['cues', 'sizes'], a));
  reg('frame-to-director', 'Attach this frame (or the pinned one and now, with "compare") to the Three Director\'s chat', '[compare]', async (args) => { await (await lab()).framesToDirector(/^compare/i.test(args) ? 'compare' : 'frame'); }, (a) => pick(['compare'], a));
  reg('blackout', 'Fade the picture to black and back (B while presenting)', '[on|off]', async (args) => `Blackout ${(await lab(false)).blackout(onOff(args)) ? 'on' : 'off'}`, (a) => pick(['on', 'off'], a));
  reg('safe', 'Safe zones on the frame: on, off, or for tiktok / reels / shorts', '[on|off|tiktok|reels|shorts]', async (args) => { const a0 = String(args || '').toLowerCase(); const plat = ['tiktok', 'reels', 'shorts'].includes(a0) ? a0 : null; const on = (await lab()).safe(plat ? true : onOff(a0), plat); return `Safe zones ${on ? `on${plat ? ` (${plat})` : ''}` : 'off'}`; }, (a) => pick(['on', 'off', 'tiktok', 'reels', 'shorts'], a));
  reg('guides', 'Next composition guide: thirds, golden ratio, center, off', '', async () => `Guides: ${(await lab()).guides()}`);
  reg('present', 'Present: the preview alone, fullscreen (Esc leaves)', '', async () => { (await lab()).present(); });
  reg('lab-focus', 'Focus: almost fullscreen, everything else hidden (Esc leaves)', '', async () => { (await lab()).focus(); });
  reg('stage-window', 'Run the sketch in its own Stage window (again: back here)', '', async () => { (await lab()).stage(); });
  reg('fps', 'Preview frame rate: max, 60 or 30', '<max|60|30>', async (args) => { const v = /max/i.test(args) ? 0 : Number(args); if (![0, 30, 60].includes(v)) return 'Use /fps max, /fps 60 or /fps 30'; (await lab()).fps(v); return `Preview: ${v ? `${v} fps` : 'max fps'}`; }, (a) => pick(['max', '60', '30'], a));

  // ---------- view ----------
  reg('show-code', 'Show or hide the code', '[on|off]', async (args) => { (await lab()).code(onOff(args)); }, (a) => pick(['on', 'off'], a));
  reg('sliders', 'Show or hide the layers & sliders panel', '[on|off]', async (args) => { (await lab()).panel(onOff(args)); }, (a) => pick(['on', 'off'], a));
  reg('console', 'The Lab console: show, hide, clear, copy (nothing: toggle and print the last lines)', '[show|hide|clear|copy]', async (args) => {
    const r = (await lab()).console(String(args || '').toLowerCase() || null);
    if (Array.isArray(r)) return r.length ? `\`\`\`\n${r.map((l) => `${l.level === 'log' ? '' : `[${l.level}] `}${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n')}\n\`\`\`` : 'The console is empty.';
    return r === 'cleared' ? 'Console cleared' : 'Console copied';
  }, (a) => pick(['show', 'hide', 'clear', 'copy'], a));
  reg('fix-errors', 'Put the console\'s errors in the Three Director\'s chat box, asking it to fix them', '', async () => { (await lab()).fixErrors(); });
  reg('edit-scene', 'Scene editor: move objects around in 3D (again to leave)', '[on|off]', async (args) => { (await lab()).edit(onOff(args)); }, null);

  // ---------- sketches and layers ----------
  const sketchNames = () => (peek()?.sketches() || []).map((x) => ({ value: x.name, hint: `${x.layers} layer${x.layers === 1 ? '' : 's'}${x.current ? ' · open' : ''}` }));
  reg('sketch', 'Open a sketch by name; new [template] / rename <name> / duplicate', '<name> | new [template] | rename <name> | duplicate', async (args) => {
    const c = await lab(); const w = words(args);
    if (!w.length) { c.browse(); return null; }
    const sub = w[0].toLowerCase();
    if (sub === 'new') { const t = c.newSketch(w.slice(1).join(' ') || null); return t ? `New sketch: ${t}` : w.length > 1 ? `Templates: ${c.templates().join(', ')}` : null; }
    if (sub === 'rename') return `Renamed to "${c.rename(w.slice(1).join(' '))}"`;
    if (sub === 'duplicate' || sub === 'dup') { c.duplicate(); return 'Duplicated'; }
    if (sub === 'next' || sub === 'prev' || sub === 'previous') return `Opened "${c.stepSketch(sub === 'next' ? 1 : -1)}"`;
    const name = c.openSketch(args);
    return name ? `Opened "${name}"` : `No sketch "${args}". /sketches lists them.`;
  }, (a) => pick([...sketchNames(), 'next', 'prev', 'new', 'rename', 'duplicate'], a));
  reg('sketches', 'List your sketches (most recent first); "browse" opens them as pictures', '[browse]', async (args) => {
    const c = await lab(!/^browse/i.test(args) ? false : true);
    if (/^browse/i.test(args)) { c.browse(); return null; }
    const list = c.sketches();
    return list.slice(0, 30).map((x) => `- ${x.current ? '**' : ''}${x.name}${x.current ? '** (open)' : ''} · ${x.layers} layer${x.layers === 1 ? '' : 's'}`).join('\n') + (list.length > 30 ? `\n…and ${list.length - 30} more (/sketches browse)` : '');
  });
  const layerNames = () => (peek()?.layers() || []).map((x) => x.name);
  reg('layer', 'Select a layer (top, bottom, a number from the bottom, or a name); hide / show / solo <layer>', '<layer> | hide <layer> | show <layer> | solo [layer]', async (args) => {
    const c = await lab(); const w = words(args); const sub = (w[0] || '').toLowerCase(); const rest = w.slice(1).join(' ');
    if (!w.length) return c.layers().map((x) => `- ${x.selected ? '**' : ''}${x.name}${x.selected ? '**' : ''}${x.visible ? '' : ' (hidden)'}`).join('\n');
    if (sub === 'hide' || sub === 'show') { const n = c.showLayer(rest, sub === 'show'); return n ? `${sub === 'show' ? 'Showing' : 'Hid'} "${n}"` : `No layer "${rest}"`; }
    if (sub === 'solo') { const n = c.solo(rest); return n ? `Only "${n}"` : 'Every layer shows'; }
    const n = c.selectLayer(args); return n ? `Layer "${n}"` : `No layer "${args}"`;
  }, (a) => pick([...layerNames(), 'hide', 'show', 'solo'], words(a).pop() || ''), { aliases: ['layers'] });

  // ---------- music, timeline, live sound ----------
  reg('tap', 'Tap tempo: with a number, set the BPM; "one" puts the downbeat at the playhead', '[bpm|one]', async (args) => {
    const c = await lab();
    if (/^one$/i.test(args)) { c.tapOne(); return null; }
    if (args) return `${c.bpm(args)} BPM`;
    c.tap(); return 'Tapped once: press T in the Lab to tap along (4+ taps set the BPM).';
  }, (a) => pick(['one', '120', '128', '140', '174'], a));
  reg('bpm', 'Tempo of the beat grid: a number, x2, half, auto (detected) or one (the 1 at the playhead)', '<bpm|x2|half|auto|one>', async (args) => { const c = await lab(); if (!args) { const s = c.state; return s.bpm ? `${Math.round(s.bpm * 100) / 100} BPM` : 'No song loaded'; } return `${Math.round(c.bpm(args.toLowerCase()) * 100) / 100} BPM`; }, (a) => pick(['x2', 'half', 'auto', 'one', '120', '128', '140'], a), { aliases: ['tempo'] });
  reg('nudge-grid', 'Shift the beat grid earlier (negative) or later, in ms', '<ms>', async (args) => { (await lab()).nudgeGrid(Number(args) || 5); return `Grid moved ${Number(args) || 5} ms`; });
  reg('live', 'Live sound: system (Spotify, YouTube…), mic or off; gain <×>, latency <ms>', '[system|mic|off] | gain <0.5–4> | latency <ms>', async (args) => {
    const c = await lab(); const [a0, a1] = words(args).map((x) => x.toLowerCase());
    if (a0 === 'gain') { const io = c.liveIo({ gain: Number(a1) || 1 }); return `Live gain ×${io.gain}`; }
    if (a0 === 'latency') { const io = c.liveIo({ latency: Math.max(0, Number(a1) || 0) }); return `Live latency offset ${io.latency} ms`; }
    const k = await c.live(a0 === 'system' || a0 === 'mic' || a0 === 'off' ? a0 : undefined);
    return k === 'off' ? 'Live sound off' : `● Live: ${k}`;
  }, (a) => pick(['system', 'mic', 'off', 'gain 2', 'latency 80'], a));
  reg('preset', 'A trigger preset (techno / house, hip-hop / trap, drum & bass, rock, ambient, or one of yours)', '<name>', async (args) => { const c = await lab(); if (!args) return `Presets: ${c.trigPresets().join(', ')}`; const n = c.trigPreset(args); return n ? null : `No preset "${args}". Presets: ${c.trigPresets().join(', ')}`; }, (a) => pick(peek()?.trigPresets() || ['Techno / house', 'Hip-hop / trap', 'Drum & bass', 'Rock / live drums', 'Ambient / soft'], a));
  reg('autobars', 'Fit the trigger bars to the sound playing now', '', async () => { await (await lab()).autoBars(); }, null, { aliases: ['auto-bars'] });
  reg('triggers', 'Open or close the ⚡ Triggers panel', '[on|off]', async (args) => { (await lab()).triggers(onOff(args)); }, (a) => pick(['on', 'off'], a));
  for (const lane of ['kick', 'snare', 'hit']) reg(lane, `A ${lane} marker at the playhead (${lane[0].toUpperCase()})`, '', async () => { (await lab()).marker(lane); }, null, { hidden: true });
  reg('marker', 'A kick, snare or hit marker at the playhead', '<kick|snare|hit>', async (args) => { const l = String(args).toLowerCase(); if (!['kick', 'snare', 'hit'].includes(l)) return 'Use /marker kick, snare or hit'; (await lab()).marker(l); return null; }, (a) => pick(['kick', 'snare', 'hit'], a));
  reg('fill-markers', 'Stamp markers on the grid (in the loop, else the whole song): kicks, kicks13 (on 1 and 3), snares (2 and 4), hits (every bar)', '<kicks|kicks13|snares|hits>', async (args) => { const n = (await lab()).fill(String(args).toLowerCase()); return n ? `${n} markers added (Ctrl+Z in the Lab undoes)` : 'Use /fill-markers kicks, kicks13, snares or hits'; }, (a) => pick(['kicks', 'kicks13', 'snares', 'hits'], a));
  reg('clear-markers', 'Remove a row of markers (in the loop, else the whole song)', '<kick|snare|hit|bass|hats>', async (args) => `${(await lab()).clearMarks(String(args).toLowerCase())} removed`, (a) => pick(['kick', 'snare', 'hit', 'bass', 'hats'], a));
  reg('quantize', 'Quantize taps: K / S / H markers land exactly on the grid', '[on|off]', async (args) => `Quantize taps ${(await lab()).quantize(onOff(args)) ? 'on' : 'off'}`, (a) => pick(['on', 'off'], a));
  reg('snap', 'What markers, loops and points snap to', '<off|bar|1/4|1/8|1/16|1/32|hits>', async (args) => `Snap: ${(await lab()).snap(String(args).toLowerCase() === 'beat' ? '1/4' : String(args).toLowerCase())}`, (a) => pick(['off', 'bar', '1/4', '1/8', '1/16', '1/32', 'hits'], a));
  reg('beat-grid', 'How the timeline looks: lines, numbers, subs, dim, sections, drops, marker lines, tall, follow, beat light, click (each toggles)', '<lines|numbers|subs|dim|sections|drops|marklines|tall|follow|light|click>', async (args) => {
    const c = await lab();
    const cur = c.gridView();
    const k = Object.keys(cur).find((x) => x.toLowerCase() === String(args).toLowerCase().replace(/\s+/g, ''));
    if (!k) return `Use /beat-grid ${Object.keys(cur).join(', ')}`;
    const v = c.gridView({ [k]: !cur[k] });
    return `${k}: ${v[k] ? 'on' : 'off'}`;
  }, (a) => pick(['lines', 'numbers', 'subs', 'dim', 'sections', 'drops', 'marklines', 'tall', 'follow', 'light', 'click'], a));
  reg('loop', 'Loop a part: two times (0:32 0:48), N bars from the playhead, "bar", or off', '<start> <end> | <n> bars | bar | off', async (args) => {
    const c = await lab(); const w = words(args);
    if (!w.length || /^off$/i.test(w[0])) { c.loop(null); return 'Loop off'; }
    if (/^bar$/i.test(w[0])) { c.loopBar(); return null; }
    if (/^\d+$/.test(w[0]) && (!w[1] || /^bars?$/i.test(w[1]))) { const r = c.loopBars(Number(w[0])); return `Looping ${w[0]} bar${w[0] === '1' ? '' : 's'}: ${fmtMs(r.a)} → ${fmtMs(r.b)}`; }
    const a = time(w[0]); const b = time(w[1]);
    const r = c.loop(a, b);
    return `Looping ${fmtMs(r.a)} → ${fmtMs(r.b)}`;
  }, (a) => pick(['off', 'bar', '4 bars', '8 bars', '0:00 0:08'], a));
  reg('click-track', 'A soft click on every beat while the song plays (to check the grid by ear)', '[on|off]', async (args) => { const c = await lab(); const cur = c.gridView().click; const v = c.gridView({ click: onOff(args) ?? !cur }); return `Click track ${v.click ? 'on' : 'off'}`; }, (a) => pick(['on', 'off'], a), { aliases: ['metronome'] });
  reg('sections', 'Mark the song\'s parts (Intro, Build, Drop, Break, Outro) as cues that looks can follow; "looks" also gives each section its own shuffled look', '[looks]', async (args) => {
    const c = await lab();
    if (/^looks?$/i.test(args)) { const n = c.looksForSections(); return `${n} sections now each play their own look (while the song plays). Refine one: right-click its cue → ✦ The current sliders, here.`; }
    const n = c.sections(); return n ? `${n} sections marked` : null;
  }, (a) => pick(['looks'], a));
  reg('cue', 'A cue (named spot) at the playhead: Drop, Verse… (1–9 jump to them); next / prev jump between them', '[name] | next | prev', async (args) => {
    const lb = await lab();
    if (/^(next|prev|previous)$/i.test(args)) return `At ${fmtMs(lb.jumpCue(/^next$/i.test(args) ? 1 : -1))}`;
    const c = lb.cue(args); return c ? `Cue "${c.name}" at ${fmtMs(c.t)}` : null;
  }, (a) => pick(['Intro', 'Verse', 'Build', 'Drop', 'Break', 'Chorus', 'Outro'], a), { aliases: ['section'] });
  reg('cues', 'List the song\'s cues', '', async () => { const l = (await lab(false)).cues(); return l.length ? l.map((c, i) => `${i + 1}. ${c.name} · ${fmtMs(c.time)}${c.looks?.length ? ` ✦ ${c.looks.map((x) => x.name).join(', ')}` : ''}`).join('\n') : 'No cues yet (/cue Drop, /sections)'; });
  reg('song', 'The song: play, pause, seek <time>, speed <1|0.75|0.5|0.25>, mute, load, zoom <a> <b> | all', '<play|pause|seek|speed|mute|load [path]|zoom> …', async (args) => {
    const c = await lab(); const w = words(args); const sub = (w[0] || '').toLowerCase();
    if (!sub) { const st = c.state; return st.song ? `♪ ${st.song.split(/[\\/]/).pop()}${st.playing ? ' · playing' : ''}${st.bpm ? ` · ${Math.round(st.bpm)} BPM` : ''}` : 'No song loaded: /song load'; }
    if (sub === 'play' || sub === 'pause') { c.play(sub === 'play'); return null; }
    if (sub === 'seek') return `At ${fmtMs(c.seek(time(w[1])))}`;
    if (sub === 'speed') return `Speed ${c.speed(Number(w[1]) || 1)}×`;
    if (sub === 'mute') { c.mute(); return null; }
    if (sub === 'load') { const path = w.slice(1).join(' ').replace(/^"|"$/g, ''); if (!path) { c.music(); return null; } const r = await c.loadSong(path); return r.ok ? `♪ Loaded ${path.split(/[\\/]/).pop()}` : `Couldn't load it: ${r.error}`; }
    if (sub === 'zoom') { if (!w[1] || /^all$/i.test(w[1])) c.zoom(null); else c.zoom(time(w[1]), time(w[2])); return null; }
    return 'Use /song play, pause, seek 1:20, speed 0.5, mute, load or zoom';
  }, (a) => pick(['play', 'pause', 'seek 0:30', 'speed 0.5', 'mute', 'load', 'zoom all'], a));
  reg('record', 'Record a video: loop, song, here (until /record stop), N bars or N s from here, or stop; add 30 / 60 (fps) and hq', '[loop|song|here|8 bars|15s|stop] [30|60] [hq]', async (args) => {
    const c = await lab(); const w = words(args).map((x) => x.toLowerCase());
    const o = {}; if (w.includes('30')) o.fps = 30; if (w.includes('60')) o.fps = 60; if (w.includes('hq')) o.mbps = 32;
    const bi = w.findIndex((x) => /^bars?$/.test(x)); const sec = w.find((x) => /^\d+s$/.test(x));
    if (bi > 0 && Number(w[bi - 1])) { const r0 = c.recordSpan({ bars: Number(w[bi - 1]) }); return r0 ? `⏺ Recording ${w[bi - 1]} bars (${fmtMs(r0.a)} → ${fmtMs(r0.b)})` : null; }
    if (sec) { const r0 = c.recordSpan({ seconds: parseInt(sec, 10) }); return r0 ? `⏺ Recording ${parseInt(sec, 10)} s` : null; }
    const kind = w.includes('stop') ? 'stop' : w.includes('loop') ? 'loop' : w.includes('song') || w.includes('track') ? 'track' : 'manual';
    const r = c.record(kind, o);
    return r === false ? 'Already recording: /record stop' : kind === 'stop' ? 'Stopping…' : `⏺ Recording (${r === 'track' ? 'whole song' : r === 'loop' ? 'the loop' : 'until /record stop'})`;
  }, (a) => pick(['loop', 'song', 'here', '8 bars', '15s', '30s', 'stop', '30', '60', 'hq'], a));

  // ---------- assets ----------
  reg('lab-palette', 'Set the sketch palette from a coolors.co link or hex codes (nothing: show it)', '[coolors link | #hex …]', async (args) => { const p = (await lab()).palette(args || null); return p.length ? `Palette: ${p.join(' ')}` : 'No palette'; });
  reg('recolor', 'Put the palette into the selected layer\'s color sliders', '', async () => { (await lab()).recolor(); });
  reg('refs', 'Open the sketch\'s references (pictures, clips, models…)', '', async () => { (await lab()).refs(); }, null);
  reg('lab-note', 'A note at this moment, with a screenshot (for the director)', '[text]', async (args) => { await (await lab()).note(args); return null; });
  reg('contact-sheet', 'A contact sheet of the whole piece', '', async () => { (await lab()).sheet(); });
})();
